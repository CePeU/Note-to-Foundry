import { App, Setting, ToggleComponent } from "obsidian";
import { join } from "path";
import { homedir } from "os";
import { commitImport, suggestImportName } from "./import-service";
import { ImportCandidate, serializeProfile, suggestedFilename } from "./io";
import { ProfileFileOperation } from "./file-picker";
import { readProfileFile, saveProfileFile } from "./desktop-files";
import { Messages } from "../ui/messages";
import { OwnedProfileModal } from "./owned-modal";
import { ProfileOrigin, ProfileRepository } from "./repository";
import type { NoteToFoundrySettings } from "./types";

export class ProfileExportModal extends OwnedProfileModal {
	private operation = new ProfileFileOperation();
	constructor(
		app: App,
		private name: string,
		private snapshot: NoteToFoundrySettings,
		private messages: Messages
	) {
		super(app);
	}
	onOpen(): void {
		this.contentEl.createEl("h2", { text: `Export profile: ${this.name}` });
		let included = false;
		let path = join(homedir(), "Downloads", suggestedFilename(this.name));
		let overwrite = false;
		let overwriteControl: ToggleComponent;
		new Setting(this.contentEl).setName("JSON file path").setDesc("Full local path. The folder must already exist.")
			.addText(control => control.setValue(path).onChange(value => {
				path = value; overwrite = false; overwriteControl?.setValue(false);
			}));
		new Setting(this.contentEl).setName("Replace existing file").addToggle(control => {
			overwriteControl = control;
			control.onChange(value => { overwrite = value; });
		});
		new Setting(this.contentEl)
			.setName("Include API key and Foundry password")
			.setDesc("Off by default. Enable only for a private credential transfer.")
			.addToggle(control =>
				control.onChange(value => {
					included = value;
				})
			);
		new Setting(this.contentEl).addButton(button =>
			button
				.setButtonText("Save JSON")
				.setCta()
				.onClick(async () => {
					if (this.operation.busy) return;
					button.setDisabled(true);
					const selectedPath = path, replace = overwrite, secrets = included;
					await this.operation.run(async signal => {
						const text = serializeProfile(this.name, this.snapshot, secrets);
						this.messages.diagnostic({ event: "profile-save-start", details: { adapter: "local-path", bytes: Buffer.byteLength(text) } });
						const result = await saveProfileFile(selectedPath, text, replace, signal);
						this.messages.diagnostic({ event: "profile-save-result", details: { result } });
						return result;
					}, outcome => {
						if (outcome === "saved") { this.messages.notice("Profile file saved."); this.close(); }
					}, error => this.messages.notice(error instanceof Error ? error.message : "Profile save failed.", "error"));
					if (!this.disposed) button.setDisabled(false);
				})
		);
		new Setting(this.contentEl).addButton(button => button.setButtonText("Cancel").onClick(() => this.close()));
	}
	onClose(): void {
		this.operation.dispose();
		super.onClose();
	}
}

export class ProfileFileSelectionModal extends OwnedProfileModal {
	private operation = new ProfileFileOperation();
	constructor(app: App, private messages: Messages, private selected: (text: string, name: string) => void) { super(app); }
	onOpen(): void {
		this.contentEl.createEl("h2", { text: "Choose a profile JSON file" });
		const input = this.contentEl.createEl("input", { type: "file", attr: { accept: ".json,application/json", "aria-label": "Choose JSON file" } });
		let path = "";
		new Setting(this.contentEl).setName("Or enter the full JSON file path").addText(control => control.onChange(value => { path = value; }));
		const status = this.contentEl.createEl("p", { attr: { role: "status" } });
		const read = async (load: () => Promise<{ text: string; name: string }>) => {
			if (this.operation.busy) return;
			input.disabled = true;
			status.setText(this.messages.status("profile-read", "Reading JSON file…"));
			await this.operation.run(load, result => {
				this.messages.diagnostic({ event: "profile-read-complete", details: { bytes: Buffer.byteLength(result.text) } });
				this.selected(result.text, result.name);
				this.close();
			}, error => {
				status.setText(this.messages.status("profile-read", error instanceof Error ? error.message : "Could not read the JSON file.", "error"));
			});
			if (!this.disposed) input.disabled = false;
		};
		input.onchange = () => {
			const file = input.files?.[0]; input.value = "";
			if (file) void read(async () => {
				if (file.size > 10 * 1024 * 1024) throw new Error("Choose a JSON file smaller than 10 MB.");
				return { text: await file.text(), name: file.name };
			});
		};
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText("Read JSON path").onClick(() => read(() => readProfileFile(path))))
			.addButton(button => button.setButtonText("Cancel").onClick(() => this.close()));
	}
	onClose(): void { this.operation.dispose(); super.onClose(); }
}

export class ProfileImportModal extends OwnedProfileModal {
	private selected = 0;
	private name = "";
	private overwrite = false;
	private activate = false;
	private expected?: ProfileOrigin;
	private saving = false;
	constructor(
		app: App,
		private repository: ProfileRepository,
		private candidates: ImportCandidate[],
		private done: () => void,
		private messages: Messages
	) {
		super(app);
		this.messages = messages.withSecrets(candidates.flatMap(candidate => [candidate.settings.foundryApiKey, candidate.settings.foundryPW]));
		this.reset();
	}
	private reset(): void {
		this.name = suggestImportName(this.candidates[this.selected].name, this.repository);
		this.overwrite = false;
		this.expected = undefined;
	}
	onOpen(): void {
		const el = this.contentEl;
		el.empty();
		const candidate = this.candidates[this.selected];
		el.createEl("h2", { text: "Review profile import" });
		if (this.candidates.length > 1)
			new Setting(el).setName("Select one legacy profile").addDropdown(control => {
				this.candidates.forEach((item, index) => control.addOption(String(index), item.name));
				control.setValue(String(this.selected)).onChange(value => {
					this.selected = Number(value);
					this.reset();
					this.onOpen();
				});
			});
		new Setting(el).setName("Import name").addText(control =>
			control.setValue(this.name).onChange(value => {
				this.name = value;
				this.overwrite = false;
				this.expected = undefined;
				collision();
			})
		);
		const collisionEl = el.createDiv();
		const collision = () => {
			collisionEl.empty();
			const name = this.name.trim();
			if (this.repository.has(name))
				new Setting(collisionEl)
					.setName(this.messages.status("profile-import-collision", "This name already exists", "warn"))
					.setDesc("Rename above, explicitly replace the entire profile, or Cancel to skip.")
					.addToggle(control =>
						control.setValue(this.overwrite).onChange(value => {
							this.overwrite = value;
							this.expected = value ? this.repository.getOrigin(name) : undefined;
						})
					);
		};
		collision();
		el.createEl("p", { text: this.messages.status("profile-import-relay", `Relay: ${candidate.settings.foundryRelayServer}`) });
		const p = candidate.settings;
		el.createEl("p", {
			text: this.messages.status("profile-import-destinations", `Destinations: ${[p.exportClipboard && "Clipboard", p.exportFile && "HTML file", p.exportFoundry && "Foundry"].filter(Boolean).join(", ") || "None"}`),
		});
		el.createEl("p", {
			text: this.messages.status("profile-import-credentials", candidate.includesSecrets
				? "The file supplies credentials. They will replace credentials in an overwritten profile."
				: "Credentials are omitted. Imported and overwritten profiles will have empty keys and passwords.", "warn"),
		});
		if (candidate.warnings.length)
			el.createEl("p", { text: this.messages.status("profile-import-warnings", `Unsupported fields will not be applied: ${candidate.warnings.join(", ")}`, "warn") });
		if (p.jsCode) {
			el.createEl("p", {
				text: this.messages.status("profile-import-code", "This profile includes custom JavaScript. It runs when you export a note with this profile.", "warn"),
			});
			el.createEl("pre").createEl("code", { text: p.jsCode });
		}
		new Setting(el).setName("Activate imported profile").addToggle(control =>
			control.setValue(this.activate).onChange(value => {
				this.activate = value;
			})
		);
		new Setting(el)
			.addButton(button =>
				button
					.setButtonText("Import")
					.setCta()
					.onClick(async () => {
						if (this.saving) return;
						this.saving = true;
						button.setDisabled(true);
						try {
							const name = await commitImport(this.repository, {
								candidate,
								name: this.name,
								overwrite: this.overwrite,
								activate: this.activate,
								expected: this.expected,
								isValid: () => !this.disposed,
							});
							if (this.disposed) return;
							this.messages.notice(`Imported profile: ${name}`);
							this.saving = false;
							this.close();
							this.done();
						} catch (error) {
							if (!this.disposed) this.messages.notice(error instanceof Error ? error.message : "Profile import failed.", "error");
						} finally {
							this.saving = false;
							if (!this.disposed) button.setDisabled(false);
						}
					})
			)
			.addButton(button => button.setButtonText("Cancel").onClick(() => this.close()));
	}
	close(): void {
		if (!this.saving) super.close();
	}
	onClose(): void {
		super.onClose();
	}
}
