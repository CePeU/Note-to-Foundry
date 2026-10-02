import { cloneProfile, createDefaultProfile } from "./defaults";
import { normalizeCollection, normalizeProfile, validateName, ProfileState } from "./normalize";
import type { NoteToFoundrySettings, ProfileSettings } from "./types";

export interface ProfileOrigin {
	name: string;
	identity: number;
	credentialRevision: number;
}
export interface CommitCondition {
	origin?: ProfileOrigin;
	isValid?: () => boolean;
	onSaving?: () => void;
	approvedCredentials?: boolean;
}
export class StaleProfileError extends Error {
	constructor() {
		super("The originating profile or credentials changed. Start this action again.");
	}
}

/** The only owner of plugin profile persistence. Host I/O is injected for tests. */
export class ProfileRepository {
	private state: ProfileState | undefined;
	private queue: Promise<void> = Promise.resolve();
	private identities = new Map<string, Omit<ProfileOrigin, "name">>();
	private nextIdentity = 0;
	private listeners = new Set<() => void>();

	constructor(
		private load: () => Promise<unknown>,
		private persist: (profiles: ProfileSettings) => Promise<void>
	) {}

	async initialize(options: { forcePersist?: boolean } = {}): Promise<void> {
		if (this.state) return;
		const input = await this.load();
		const candidate = normalizeCollection(input);
		if (options.forcePersist || JSON.stringify(input) !== JSON.stringify(candidate.profiles)) await this.write(candidate.profiles);
		this.state = candidate;
		for (const name of this.listNames())
			this.identities.set(name, { identity: ++this.nextIdentity, credentialRevision: 0 });
	}

	private current(): ProfileState {
		if (!this.state) throw new Error("Profiles have not finished loading.");
		return this.state;
	}
	private profile(state: ProfileState, name: string): NoteToFoundrySettings {
		if (!Object.prototype.hasOwnProperty.call(state.profiles, name))
			throw new Error("The selected profile no longer exists.");
		return state.profiles[name];
	}
	private async write(profiles: ProfileSettings): Promise<void> {
		try {
			await this.persist(cloneProfile(profiles));
		} catch {
			throw new Error("Could not save profiles. Previous settings remain active; retry the change.");
		}
	}

	get activeName(): string {
		return this.current().activeName;
	}
	listNames(): string[] {
		return Object.keys(this.current().profiles).sort();
	}
	has(name: string): boolean {
		return Object.prototype.hasOwnProperty.call(this.current().profiles, name);
	}
	getSnapshot(name: string): NoteToFoundrySettings {
		return cloneProfile(this.profile(this.current(), name));
	}
	getActiveSnapshot(): NoteToFoundrySettings {
		return this.getSnapshot(this.activeName);
	}
	getAllSnapshots(): ProfileSettings {
		return cloneProfile(this.current().profiles);
	}
	getOrigin(name: string): ProfileOrigin {
		this.profile(this.current(), name);
		return { name, ...this.identities.get(name)! };
	}
	matches(origin: ProfileOrigin): boolean {
		const identity = this.identities.get(origin.name);
		return (
			!!identity && identity.identity === origin.identity && identity.credentialRevision === origin.credentialRevision
		);
	}
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	async settled(): Promise<void> {
		await this.queue;
	}

	private commit<T>(
		change: (state: ProfileState) => T,
		condition: CommitCondition = {},
		invalidate: string[] = []
	): Promise<T> {
		const result = this.queue.then(async () => {
			if ((condition.origin && !this.matches(condition.origin)) || (condition.isValid && !condition.isValid()))
				throw new StaleProfileError();
			const previous = this.current();
			const candidate = cloneProfile(previous);
			const value = change(candidate);
			for (const name of Object.keys(candidate.profiles))
				candidate.profiles[name].isActiveProfile = name === candidate.activeName;
			// Validate the entire candidate before saving, without changing selection.
			candidate.profiles = normalizeCollection(candidate.profiles).profiles;
			if (JSON.stringify(candidate) === JSON.stringify(previous) && !invalidate.length) return value;
			condition.onSaving?.();
			await this.write(candidate.profiles);
			for (const name of Array.from(this.identities.keys()))
				if (!Object.prototype.hasOwnProperty.call(candidate.profiles, name)) this.identities.delete(name);
			for (const name of Object.keys(candidate.profiles)) {
				const identity = this.identities.get(name);
				const before = previous.profiles[name];
				const after = candidate.profiles[name];
				if (!identity || invalidate.includes(name))
					this.identities.set(name, { identity: ++this.nextIdentity, credentialRevision: 0 });
				else if (
					before &&
					(before.foundryApiKey !== after.foundryApiKey || before.foundryRelayServer !== after.foundryRelayServer)
				)
					identity.credentialRevision++;
			}
			this.state = candidate;
			// UI observer failures cannot turn a persisted commit into a failed save.
			for (const listener of this.listeners) {
				try {
					listener();
				} catch {
					/* observer owns UI recovery */
				}
			}
			return value;
		});
		this.queue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	update(
		name: string,
		patch: Partial<NoteToFoundrySettings> | ((profile: NoteToFoundrySettings) => void),
		condition?: CommitCondition
	): Promise<void> {
		const copied = typeof patch === "function" ? patch : cloneProfile(patch);
		return this.commit(state => {
			const profile = this.profile(state, name);
			const previousKey = profile.foundryApiKey;
			const previousRelay = profile.foundryRelayServer;
			if (typeof copied === "function") copied(profile);
			else Object.assign(profile, copied);
			if (
				!condition?.approvedCredentials &&
				(profile.foundryApiKey !== previousKey || profile.foundryRelayServer !== previousRelay)
			)
				profile.foundryAuthMetadata = null;
			state.profiles[name] = normalizeProfile(profile);
		}, condition);
	}

	create(rawName: string): Promise<string> {
		const name = validateName(rawName);
		return this.commit(state => {
			if (Object.prototype.hasOwnProperty.call(state.profiles, name))
				throw new Error("A profile with this name already exists.");
			state.profiles[name] = createDefaultProfile();
			return name;
		});
	}
	clone(source: string, rawName: string): Promise<string> {
		const name = validateName(rawName);
		return this.commit(state => {
			if (Object.prototype.hasOwnProperty.call(state.profiles, name))
				throw new Error("A profile with this name already exists.");
			state.profiles[name] = cloneProfile(this.profile(state, source));
			return name;
		});
	}
	rename(oldName: string, rawName: string): Promise<string> {
		const name = validateName(rawName);
		return this.commit(
			state => {
				const profile = this.profile(state, oldName);
				if (oldName === name) return name;
				if (Object.prototype.hasOwnProperty.call(state.profiles, name))
					throw new Error("A profile with this name already exists.");
				state.profiles[name] = profile;
				delete state.profiles[oldName];
				if (state.activeName === oldName) state.activeName = name;
				return name;
			},
			{},
			oldName === name ? [] : [name]
		);
	}
	remove(name: string): Promise<void> {
		return this.commit(state => {
			this.profile(state, name);
			if (Object.keys(state.profiles).length === 1) throw new Error("Keep at least one profile.");
			delete state.profiles[name];
			if (state.activeName === name)
				state.activeName = Object.prototype.hasOwnProperty.call(state.profiles, "default")
					? "default"
					: Object.keys(state.profiles).sort()[0];
		});
	}
	setActive(name: string): Promise<void> {
		return this.commit(state => {
			this.profile(state, name);
			state.activeName = name;
		});
	}
	importProfile(
		rawName: string,
		input: NoteToFoundrySettings,
		overwrite: boolean,
		activate: boolean,
		expected?: ProfileOrigin,
		isValid?: () => boolean
	): Promise<void> {
		const name = validateName(rawName);
		const profile = normalizeProfile(input);
		return this.commit(
			state => {
				if (Object.prototype.hasOwnProperty.call(state.profiles, name) && !overwrite)
					throw new Error("A profile with this name appeared. Review the import again.");
				if (overwrite && !expected) throw new StaleProfileError();
				state.profiles[name] = cloneProfile(profile);
				if (activate) state.activeName = name;
			},
			{ origin: expected, isValid },
			overwrite ? [name] : []
		);
	}
}
