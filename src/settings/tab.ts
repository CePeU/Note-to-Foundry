import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import type NoteToFoundry from "../plugin";
import { activeProfile, group, settingsContext } from "./controls";
import { profileManagement } from "./sections/profile-management";
import { exportSettings } from "./sections/export-settings";
import { replacementRules } from "./sections/replacement-rules";
import { otherSettings } from "./sections/other";
import { foundrySettings } from "./sections/foundry-export";

export class NoteToFoundrySettingsTab extends PluginSettingTab {
	private cleanups = new Set<() => void>();
	private disposed = false;
	private updateQueued = false;
	constructor(app: App, public plugin: NoteToFoundry) {
		super(app, plugin);
		let structure = this.structure();
		plugin.register(plugin.profiles.subscribe(() => {
			const next = this.structure();
			if (next !== structure) { structure = next; this.requestUpdate(); }
		}));
		plugin.register(() => { this.disposed = true; this.cleanupRows(); });
	}
	private structure(): string {
		const repo = this.plugin.profiles;
		return JSON.stringify([repo.activeName, repo.listNames().map(name => [name, repo.getOrigin(name).identity])]);
	}
	private cleanupRows(): void { for (const cleanup of Array.from(this.cleanups)) cleanup(); }
	private requestUpdate = (): void => {
		if (this.disposed || this.updateQueued) return;
		this.updateQueued = true;
		queueMicrotask(() => { this.updateQueued = false; if (!this.disposed) this.update(); });
	};
	private own = (cleanup: () => void): (() => void) => {
		let active = true;
		const release = () => { if (active) { active = false; this.cleanups.delete(release); cleanup(); } };
		this.cleanups.add(release); return release;
	};
	getSettingDefinitions(): SettingDefinitionItem[] {
		const ctx = settingsContext(this.app, this.plugin.profiles, this.requestUpdate,
			this.plugin.auth, this.plugin.messages, this.plugin.profileFiles, this.plugin.credentials, this.own, () => !this.disposed);
		return [activeProfile(ctx),
			{ type: "page", name: "Profile Management", items: [activeProfile(ctx), ...profileManagement(ctx)] },
			{ type: "page", name: "File Export Settings", items: [activeProfile(ctx), ...exportSettings(ctx)] },
			{ type: "page", name: "Foundry Export", items: [activeProfile(ctx), ...foundrySettings(ctx)] },
			{ type: "page", name: "Replacement Rules", items: [activeProfile(ctx), ...replacementRules(ctx)] },
			group("Other and diagnostics", otherSettings(ctx)),
		];
	}
	hide(): void { this.cleanupRows(); super.hide(); }
}
