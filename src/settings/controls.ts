import { App, Setting, SettingDefinition, SettingDefinitionGroup, SettingGroupItem } from "obsidian";
import { Messages } from "../ui/messages";
import type { ProfileActions } from "../profiles/actions";
import type { NoteToFoundrySettings } from "../profiles/types";
import type { ProfileRepository } from "../profiles/repository";
import type { KeyRequestController } from "../relay/auth";
import type { CredentialStatus } from "../relay/credential-status";

type KeysOfType<T> = { [K in keyof NoteToFoundrySettings]: NoteToFoundrySettings[K] extends T ? K : never }[keyof NoteToFoundrySettings];
type TextKeys = { [K in keyof NoteToFoundrySettings]: string extends NoteToFoundrySettings[K] ? K : never }[keyof NoteToFoundrySettings];
export interface SettingsContext {
	messages: Messages;
	files: ProfileActions;
	credentials: CredentialStatus;
	app: App;
	repository: ProfileRepository;
	auth: KeyRequestController;
	name: string;
	readonly profile: NoteToFoundrySettings;
	valid: () => boolean;
	refresh: () => void;
	own: (cleanup: () => void) => () => void;
	run: (action: () => Promise<unknown>, refresh?: boolean) => Promise<void>;
	update: (change: (profile: NoteToFoundrySettings) => void, refresh?: boolean) => Promise<void>;
}
export function settingsContext(app: App, repository: ProfileRepository, refresh: () => void, auth: KeyRequestController,
	messageRoot: Messages, files: ProfileActions, credentials: CredentialStatus, own: SettingsContext["own"], alive = () => true): SettingsContext {
	const name = repository.activeName, origin = repository.getOrigin(name);
	const messages = messageRoot.forProfile(name, repository.getSnapshot(name), origin.identity);
	const valid = () => alive() && repository.has(name) && repository.getOrigin(name).identity === origin.identity;
	const run = async (action: () => Promise<unknown>, redraw = false) => {
		try {
			if (!valid()) throw new Error("This profile changed. Reopen its settings.");
			await action(); if (redraw) refresh();
		} catch (error) { messages.notice(error instanceof Error ? error.message : "Could not update settings.", "error"); refresh(); }
	};
	return { app, repository, auth, messages, files, credentials, name, valid, refresh, own, run,
		get profile() { return repository.getSnapshot(name); },
		update: (change, redraw) => run(() => repository.update(name, change, { isValid: valid }), redraw),
	};
}
export function row(name: string, render: (setting: Setting) => void | (() => void), desc = ""): SettingDefinition {
	return { name, desc, render };
}
export function group(heading: string, items: SettingGroupItem[], visible: boolean | (() => boolean) = true): SettingDefinitionGroup {
	return { type: "group", heading, items, visible };
}
export function toggle(ctx: SettingsContext, key: KeysOfType<boolean>, title: string, description = ""): SettingDefinition {
	return row(title, setting => { setting.addToggle(control => control.setValue(ctx.profile[key]).onChange(value =>
		ctx.update(profile => { profile[key] = value; }, true))); }, description);
}
export function text(ctx: SettingsContext, key: TextKeys, title: string, description = "", secret = false): SettingDefinition {
	return row(title, setting => { setting.addText(control => {
		control.setValue(ctx.profile[key]); if (secret) control.inputEl.type = "password";
		control.onChange(value => ctx.update(profile => { profile[key] = value; }));
	}); }, description);
}
export function activeProfile(ctx: SettingsContext): SettingDefinition {
	return row("Active export profile", setting => { setting.addDropdown(control => {
		for (const name of ctx.repository.listNames()) control.addOption(name, name);
		control.setValue(ctx.name).onChange(name => ctx.run(() => ctx.repository.setActive(name), true));
	}); });
}
