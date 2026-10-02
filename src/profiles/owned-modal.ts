import { Modal } from "obsidian";

/** App-owned modals can be disposed even while a confirmed disk commit settles. */
export class OwnedProfileModal extends Modal {
	protected disposed = false;
	onDisposed: () => void = () => {};
	dispose(): void { super.close(); }
	onClose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.contentEl.empty();
		this.onDisposed();
	}
}
