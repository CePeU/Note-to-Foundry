import { App } from "obsidian";
import { parseProfileFile } from "./io";
import { ProfileExportModal, ProfileFileSelectionModal, ProfileImportModal } from "./modals";
import { OwnedProfileModal } from "./owned-modal";
import { ProfileRepository } from "./repository";
import { Messages } from "../ui/messages";

export class ProfileActions {
	private modals = new Set<OwnedProfileModal>();
	private disposed = false;
	constructor(private app: App, private repository: ProfileRepository, private messages: Messages) {}
	private open(modal: OwnedProfileModal): void {
		if (this.disposed) return;
		this.modals.add(modal);
		modal.onDisposed = () => this.modals.delete(modal);
		modal.open();
	}
	import(refresh = () => {}): void {
		const name = this.repository.activeName;
		const messages = this.messages.forProfile(name, this.repository.getSnapshot(name), this.repository.getOrigin(name).identity);
		this.open(new ProfileFileSelectionModal(this.app, messages, (text, filename) => {
			const candidates = parseProfileFile(text, filename);
			this.open(new ProfileImportModal(this.app, this.repository, candidates, refresh, messages));
		}));
	}
	export(name: string): void {
		const profile = this.repository.getSnapshot(name);
		this.open(new ProfileExportModal(this.app, name, profile, this.messages.forProfile(name, profile, this.repository.getOrigin(name).identity)));
	}
	dispose(): void {
		this.disposed = true;
		for (const modal of Array.from(this.modals)) modal.dispose();
		this.modals.clear();
	}
}
