import type { NoteToFoundrySettings } from "../profiles/types";
import { ProfileOrigin, ProfileRepository } from "../profiles/repository";
import { RelayClient } from "./client";
import { record, RelayConfig, RelayError, stringArray, stringField } from "./types";
import { Messages } from "../ui/messages";
import type { DiagnosticSink } from "./diagnostics";
import { PLUGIN_NAME } from "../identity";

export function requiredScopes(profile: NoteToFoundrySettings): string[] {
	const scopes = ["clients:read"];
	if (profile.exportFoundry && !profile.exportDirty) {
		scopes.push("execute-js", "entity:write");
		if (!profile.encodePictures) scopes.push("file:read", "file:write");
	}
	if (profile.foundryHeadlessUsed) scopes.push("session:manage");
	return scopes;
}
export function requireScopes(profile: NoteToFoundrySettings, scopes: string[]): void {
	const metadata = profile.foundryAuthMetadata;
	if (!metadata) return;
	const missing = scopes.filter(scope => !metadata.grantedScopes.includes(scope));
	if (missing.length) throw new RelayError(`Request a key with these scopes: ${missing.join(", ")}.`, "permission");
}

export type KeyPhase =
	| "idle"
	| "requesting"
	| "pending"
	| "saving"
	| "saved"
	| "approved-unsaved"
	| "denied"
	| "expired"
	| "exchanged"
	| "cancelled"
	| "failed";
export interface KeyRequestState {
	phase: KeyPhase;
	profileName?: string;
	approvalUrl?: string;
	message: string;
}
export interface PollClock {
	now(): number;
	wait(milliseconds: number, signal: AbortSignal): Promise<void>;
}
const clock: PollClock = {
	now: () => Date.now(),
	wait: (milliseconds, signal) =>
		new Promise(resolve => {
			if (signal.aborted) {
				resolve();
				return;
			}
			const complete = () => {
				clearTimeout(timer);
				signal.removeEventListener("abort", complete);
				resolve();
			};
			const timer = setTimeout(complete, milliseconds);
			signal.addEventListener("abort", complete, { once: true });
		}),
};

/** One app-owned controller retains a one-time key if a disk write fails. */
export class KeyRequestController {
	messages = new Messages(() => {});
	private state: KeyRequestState = { phase: "idle", message: "" };
	private origin?: ProfileOrigin;
	private abort?: AbortController;
	private approved?: { apiKey: string; grantedScopes: string[]; clientIds: string[] };
	private listeners = new Set<() => void>();
	private disposed = false;
	private running = false;
	private saveQueued = false;

	constructor(
		private repository: ProfileRepository,
		private createClient: (config: RelayConfig, diagnostics?: DiagnosticSink) => RelayClient,
		private timer: PollClock = clock,
		private messageRoot = new Messages(() => {})
	) {}
	snapshot(): KeyRequestState {
		return { ...this.state };
	}
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	private set(phase: KeyPhase, message: string, approvalUrl = this.state.approvalUrl): void {
		message = this.messages.status("key-request", message, ["failed", "denied", "approved-unsaved"].includes(phase) ? "error" : "info");
		this.state = { phase, profileName: this.origin?.name, message, approvalUrl };
		for (const listener of this.listeners) {
			try {
				listener();
			} catch {
				/* view can redraw when reopened */
			}
		}
	}
	private valid(): boolean {
		return !this.disposed && !this.abort?.signal.aborted && !!this.origin && this.repository.matches(this.origin);
	}
	invalidateChangedOrigin(): void {
		if (
			this.origin &&
			!this.repository.matches(this.origin) &&
			["requesting", "pending", "approved-unsaved"].includes(this.state.phase)
		)
			this.cancel();
	}
	cancel(): boolean {
		if (this.state.phase === "saving") return false;
		this.abort?.abort();
		const hadKey = !!this.approved;
		this.approved = undefined;
		this.set(
			"cancelled",
			hadKey
				? "The unsaved key was discarded. Request a new key; the issued key can be revoked in the relay dashboard."
				: "Key request cancelled."
		);
		return true;
	}
	async dispose(): Promise<boolean> {
		this.disposed = true;
		this.abort?.abort();
		this.listeners.clear();
		// A commit that already entered persistence must settle before reporting
		// whether unloading lost an approved key.
		if (this.state.phase === "saving") await this.repository.settled();
		const lostKey = !!this.approved;
		this.approved = undefined;
		this.set("cancelled", "Key request controller unloaded.");
		return lostKey;
	}

	async start(name: string): Promise<void> {
		if (this.disposed) throw new Error("The plugin is unloading.");
		if (this.running || this.approved || this.state.phase === "saving")
			throw new Error("Finish, retry saving, or discard the current key request first.");
		this.origin = this.repository.getOrigin(name);
		const profile = this.repository.getSnapshot(name);
		this.messages = this.messageRoot.forProfile(name, profile, this.origin.identity);
		this.abort = new AbortController();
		this.running = true;
		this.state = { phase: "requesting", message: "", profileName: name };
		this.set("requesting", "Creating a scoped-key request.");
		try {
			const client = this.createClient({ baseUrl: profile.foundryRelayServer }, this.messages.diagnostic);
			const response = record(
				await client.request("/auth/key-request", {
					method: "POST",
					public: true,
					json: {
						appName: PLUGIN_NAME,
						appDescription:
							"Exports rendered notes and images; runs plugin-owned Foundry scripts for discovery and linking.",
						scopes: requiredScopes(profile),
						...(profile.foundryClientId ? { clientIds: [profile.foundryClientId] } : {}),
					},
				}),
				"key request"
			);
			if (!this.valid()) {
				this.cancel();
				return;
			}
			const code = stringField(response.code, "approval code");
			const approvalUrl = new URL(stringField(response.approvalUrl, "approval URL"));
			if (!["https:", "http:"].includes(approvalUrl.protocol) || approvalUrl.username || approvalUrl.password)
				throw new RelayError("Unexpected approval URL returned by the relay.", "response");
			const expiresIn = response.expiresIn;
			if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0)
				throw new RelayError("Missing key-request expiry.", "response");
			const expires = this.timer.now() + Math.min(expiresIn, 600) * 1000;
			this.set("pending", "Open the approval link, review the scopes and approve the request.", approvalUrl.toString());
			while (this.valid() && this.timer.now() < expires) {
				await this.timer.wait(Math.min(3000, expires - this.timer.now()), this.abort.signal);
				if (!this.valid()) break;
				if (this.timer.now() >= expires) break;
				const status = record(
					await client.request(`/auth/key-request/${encodeURIComponent(code)}/status`, { public: true }),
					"key status"
				);
				if (!this.valid()) break;
				if (status.status === "pending") continue;
				if (status.status === "approved") {
					this.approved = {
						apiKey: stringField(status.apiKey, "approved key"),
						grantedScopes: stringArray(status.scopes, "granted scopes"),
						clientIds: status.clientIds === null ? [] : stringArray(status.clientIds, "client bindings"),
					};
					await this.retrySave();
					return;
				}
				if (status.status === "denied" || status.status === "expired" || status.status === "exchanged") {
					this.set(status.status, `Key request ${status.status}. Request a new key when ready.`);
					return;
				}
				throw new RelayError("Unknown key-request status.", "response");
			}
			if (this.valid()) this.set("expired", "Key approval timed out. Request a new key.");
			else this.cancel();
		} catch (error) {
			if (!this.valid()) this.cancel();
			else
				this.set(
					"failed",
					error instanceof RelayError ? error.message : "The key request failed. Check the relay and try again."
				);
		} finally {
			this.running = false;
		}
	}

	async retrySave(): Promise<void> {
		if (!this.approved || !this.origin || this.saveQueued) return;
		if (!this.valid()) {
			this.cancel();
			return;
		}
		this.saveQueued = true;
		const approved = this.approved;
		try {
			await this.repository.update(
				this.origin.name,
				{
					foundryApiKey: approved.apiKey,
					foundryAuthMetadata: { grantedScopes: approved.grantedScopes, clientIds: approved.clientIds },
				},
				{
					origin: this.origin,
					isValid: () => this.valid(),
					approvedCredentials: true,
					onSaving: () => this.set("saving", "Saving the approved key."),
				}
			);
			this.approved = undefined;
			this.set("saved", "Scoped key saved. Its granted scopes apply to this profile.");
		} catch {
			if (!this.valid()) {
				this.cancel();
				return;
			}
			this.set(
				"approved-unsaved",
				"The approved key could not be saved. Retry save before closing Obsidian or unloading the plugin."
			);
		} finally {
			this.saveQueued = false;
		}
	}
}
