import { ProfileOrigin, ProfileRepository } from "../profiles/repository";
import type { NoteToFoundrySettings } from "../profiles/types";
import { FoundryEndpoints, RelayWorld } from "../destinations/foundry/endpoints";
import { RelayClient } from "./client";
import { RelayError } from "./types";
import type { DiagnosticSink } from "./diagnostics";
import { Messages } from "../ui/messages";

export type CredentialPhase = "missing" | "unknown" | "checking" | "valid" | "invalid" | "permission-denied" | "unreachable" | "check-failed";
export interface CredentialSnapshot {
	phase: CredentialPhase;
	checkedAt?: number;
	clients: RelayWorld[];
	clientLabel?: string;
	online?: boolean;
}
interface Entry {
	origin: ProfileOrigin;
	clientId: string;
	state: CredentialSnapshot;
	pending?: Promise<CredentialSnapshot>;
	timer?: ReturnType<typeof setTimeout>;
	deadline?: ReturnType<typeof setTimeout>;
	cancel?: () => void;
}
export function keyPrefix(key: string): string {
	const value = key.trim();
	return !value ? "No key configured" : value.length <= 8 ? "Key configured (prefix hidden for short keys)" : `Key prefix: ${value.slice(0, 8)}…`;
}
export function credentialLabel(state: CredentialSnapshot): string {
	const labels: Record<CredentialPhase, string> = {
		missing: "No key configured", unknown: "Key not verified. Check again.", checking: "Checking key…",
		valid: "Key accepted", invalid: "Key rejected, expired or disabled",
		"permission-denied": "Cannot verify: clients:read permission or client binding denied",
		unreachable: "Relay unreachable", "check-failed": "Key check failed. Try again later.",
	};
	return labels[state.phase] + (state.checkedAt !== undefined ? ` · last checked ${new Date(state.checkedAt).toLocaleTimeString()}` : "");
}

/** Cache is per profile origin and selection; it never becomes credential metadata. */
export class CredentialStatus {
	private entries = new Map<string, Entry>();
	private listeners = new Set<(name: string) => void>();
	private disposed = false;
	private unsubscribe: () => void;
	constructor(
		private repository: ProfileRepository,
		private createClient: (profile: NoteToFoundrySettings, diagnostics: DiagnosticSink) => RelayClient,
		private messages = new Messages(() => {}),
		private now: () => number = Date.now,
		private ttl = 60000,
		private timeoutMs = 15000
	) {
		this.unsubscribe = repository.subscribe(() => {
			for (const [name, entry] of this.entries) if (!this.valid(entry)) {
				entry.cancel?.(); clearTimeout(entry.timer); this.entries.delete(name); this.emit(name);
			}
		});
	}
	private valid(entry: Entry): boolean {
		return !this.disposed && this.entries.get(entry.origin.name) === entry && this.repository.matches(entry.origin)
			&& this.repository.getSnapshot(entry.origin.name).foundryClientId === entry.clientId;
	}
	private emit(name: string): void {
		for (const listener of this.listeners) { try { listener(name); } catch { /* Row owns recovery. */ } }
	}
	subscribe(listener: (name: string) => void): () => void {
		this.listeners.add(listener); return () => this.listeners.delete(listener);
	}
	snapshot(name: string): CredentialSnapshot {
		const empty: CredentialSnapshot = { phase: "unknown", clients: [] };
		if (!this.repository.has(name)) return empty;
		if (!this.repository.getSnapshot(name).foundryApiKey.trim()) return { ...empty, phase: "missing" };
		const entry = this.entries.get(name);
		if (!entry || !this.valid(entry)) return empty;
		const state = entry.state;
		return { ...state, clients: state.clients.map(client => ({ ...client })),
			phase: state.phase === "valid" && this.now() - state.checkedAt! >= this.ttl ? "unknown" : state.phase };
	}
	check(name: string): Promise<CredentialSnapshot> {
		if (this.disposed || !this.repository.has(name)) return Promise.resolve({ phase: "unknown", clients: [] });
		const previous = this.entries.get(name);
		if (previous && this.valid(previous) && previous.pending) return previous.pending;
		const profile = this.repository.getSnapshot(name);
		if (!profile.foundryApiKey.trim()) return Promise.resolve({ phase: "missing", clients: [] });
		clearTimeout(previous?.timer);
		const origin = this.repository.getOrigin(name);
		const messages = this.messages.forProfile(name, profile, origin.identity);
		const entry: Entry = { origin, clientId: profile.foundryClientId, state: { phase: "checking", clients: [] } };
		this.entries.set(name, entry);
		// Defer execution until pending is assigned, so synchronous listeners can deduplicate.
		entry.pending = Promise.resolve().then(async () => {
			if (!this.valid(entry)) return this.snapshot(name);
			this.emit(name);
			if (!this.valid(entry)) return this.snapshot(name);
			messages.status("key-check", "Checking key…");
			try {
				const clients = await Promise.race([
					new FoundryEndpoints(this.createClient(profile, messages.diagnostic)).clients(),
					new Promise<RelayWorld[]>((_resolve, reject) => {
						entry.cancel = () => reject(new RelayError("Key check cancelled.", "transport"));
						entry.deadline = setTimeout(() => reject(new RelayError("Key check timed out.", "transport")), this.timeoutMs);
					}),
				]);
				if (!this.valid(entry)) return this.snapshot(name);
				const selected = clients.find(client => client.clientId === entry.clientId);
				entry.state = { phase: "valid", checkedAt: this.now(), clients,
					clientLabel: selected ? selected.customName.trim() || selected.worldTitle : undefined,
					online: selected?.isOnline };
				entry.timer = setTimeout(() => {
					if (this.valid(entry)) { entry.state.phase = "unknown"; this.emit(name); }
				}, this.ttl);
			} catch (error) {
				if (!this.valid(entry)) return this.snapshot(name);
				const phase: CredentialPhase = error instanceof RelayError
					? error.status === 401 ? "invalid" : error.status === 403 ? "permission-denied" : error.kind === "transport" ? "unreachable" : "check-failed"
					: "check-failed";
				entry.state = { phase, checkedAt: this.now(), clients: [] };
			} finally {
				clearTimeout(entry.deadline); entry.cancel = undefined;
				entry.pending = undefined;
				if (this.valid(entry)) { messages.status("key-check", credentialLabel(entry.state), entry.state.phase === "valid" ? "info" : "warn"); this.emit(name); }
			}
			return this.snapshot(name);
		});
		return entry.pending;
	}
	dispose(): void {
		this.disposed = true; this.unsubscribe();
		for (const entry of this.entries.values()) { entry.cancel?.(); clearTimeout(entry.timer); }
		this.entries.clear(); this.listeners.clear();
	}
}
