import { addIcon, FileSystemAdapter, MarkdownView, Modal, Notice, Plugin, Setting, TFile } from "obsidian";
import { ProfileRepository } from "./profiles/repository";
import { ProfileActions } from "./profiles/actions";
import { Messages } from "./ui/messages";
import { CredentialStatus } from "./relay/credential-status";
import { selectProfileBootstrap } from "./profiles/migration";
import { PLUGIN_ID, PLUGIN_ICON_ID } from "./identity";
import { NoteToFoundrySettingsTab } from "./settings/tab";
import { KeyRequestController } from "./relay/auth";
import { RelayClient } from "./relay/client";
import { obsidianTransport } from "./relay/obsidian";
import { ExportCoordinator } from "./export/coordinator";
import { RenderService } from "./export/render-service";
import { NoteAssets } from "./export/assets";
import { allocateIdentity, NoteIdentities } from "./export/identity";
import { cleanHtml } from "./export/clean-service";
import { cleanConfig, configuredDestinations } from "./export/config";
import { checkCancelled, DestinationHost, ExportPayload, SourceDescriptor } from "./export/types";
import { processCallouts } from "./ui/callouts";
import { NOTE_TO_FOUNDRY_ICON } from "./ui/icon";
import { MultiColumnListModal } from "./modals";
import { openApprovalUrl } from "./ui/browser";
import { addProfileExportItems } from "./ui/editor-menu";

export default class NoteToFoundry extends Plugin {
	// Assigned during awaited onload, before any settings or export handlers are registered.
	public profiles!: ProfileRepository;
	public auth!: KeyRequestController;
	public profileFiles!: ProfileActions;
	public credentials!: CredentialStatus;
	public messages = new Messages((message, duration) => new Notice(message, duration));
	private coordinator = new ExportCoordinator();
	private rendering?: RenderService;
	private unloading = false;

	async onload(): Promise<void> {
		try {
			if (this.manifest.id !== PLUGIN_ID) throw new Error("Install this build as NoteToFoundry before enabling it.");
			const expectedDirectory = `${this.app.vault.configDir}/plugins/${PLUGIN_ID}`.replace(/\\/g, "/");
			if (this.manifest.dir && this.manifest.dir.replace(/\\/g, "/") !== expectedDirectory)
				throw new Error(`Install this build in ${expectedDirectory} before enabling it.`);
			const bootstrap = await selectProfileBootstrap(this.app.vault.adapter, this.app.vault.configDir);
			if (this.unloading) return;
			this.profiles = new ProfileRepository(() => Promise.resolve(bootstrap.data), data => this.saveData(data));
			await this.profiles.initialize({ forcePersist: bootstrap.source === "legacy" });
			if (bootstrap.source === "legacy" && !this.unloading)
				this.messages.forProfile(this.profiles.activeName, this.profiles.getActiveSnapshot()).notice("Profiles migrated to NoteToFoundry. The old settings file was preserved.");
		} catch (error) {
			this.messages.notice(error instanceof Error ? error.message : "Could not load profiles.", "error");
			throw error;
		}
		if (this.unloading) return;
		this.profileFiles = new ProfileActions(this.app, this.profiles, this.messages);
		this.register(() => this.profileFiles.dispose());
		this.auth = new KeyRequestController(this.profiles, (config, diagnostics) => new RelayClient(config, obsidianTransport, diagnostics), undefined, this.messages);
		this.credentials = new CredentialStatus(this.profiles, (profile, diagnostics) => new RelayClient({
			baseUrl: profile.foundryRelayServer, apiKey: profile.foundryApiKey,
		}, obsidianTransport, diagnostics), this.messages);
		this.register(() => this.credentials.dispose());
		this.register(this.profiles.subscribe(() => this.auth.invalidateChangedOrigin()));
		let openedApproval: string | undefined;
		this.register(
			this.auth.subscribe(() => {
				const state = this.auth.snapshot();
				if (state.phase === "saved" && state.profileName) void this.credentials.check(state.profileName);
				if (state.phase === "pending" && state.approvalUrl && state.approvalUrl !== openedApproval) {
					openedApproval = state.approvalUrl;
					void openApprovalUrl(state.approvalUrl).catch(
						() => this.auth.messages.notice("Could not open the browser. Copy the approval link from Foundry settings.", "error")
					);
				}
			})
		);
		this.register(() => {
			void this.auth.dispose().then(lostKey => {
				if (lostKey)
					this.auth.messages.notice(
						"An approved key was not saved. Request a new key and revoke the unused key in the relay dashboard."
					);
			});
		});
		this.addSettingTab(new NoteToFoundrySettingsTab(this.app, this));
		addIcon(PLUGIN_ICON_ID, NOTE_TO_FOUNDRY_ICON);
		this.registerMarkdownPostProcessor(el => processCallouts(el));
		this.registerMarkdownPostProcessor(
			(el, context) => this.rendering?.postprocess(el, context.sourcePath),
			Number.MAX_SAFE_INTEGER
		);
		this.addRibbonIcon(
			PLUGIN_ICON_ID,
			"Copy editor selection or full note as HTML or upload to Foundry",
			() => {
				void this.exportNote();
			}
		);
		this.addCommand({
			id: "clipboard",
			name: "Copy editor selection or full note as HTML or upload to Foundry",
			icon: PLUGIN_ICON_ID,
			callback: () => this.exportNote(),
		});
		this.addCommand({ id: "cancel-export", name: "Cancel current export", callback: () => this.coordinator.cancel() });
		this.addCommand({
			id: "import-profile-json",
			name: "Import profile from JSON file",
			callback: () => this.profileFiles.import(),
		});
		this.addCommand({
			id: "export-profile-json",
			name: "Export active profile to JSON file",
			callback: () => this.profileFiles.export(this.profiles.activeName),
		});
		this.addCommand({
			id: "createfoundryId",
			name: "generate foundry ID",
			callback: () =>
				this.app.workspace.getActiveViewOfType(MarkdownView)?.editor?.replaceSelection(allocateIdentity()),
		});
		this.addCommand({
			id: "open-two-column-list-modal",
			name: "Open two-column list modal",
			callback: () => {
				new MultiColumnListModal(this.app, ["Match", "Replacement"], [["", ""]], () => {}).open();
			},
		});
		this.registerEvent(
			this.app.workspace.on("editor-menu", menu => {
				addProfileExportItems(menu, this.profiles.listNames(), name => { void this.exportNote(name); });
			})
		);
	}

	private async exportNote(explicitProfile?: string): Promise<void> {
		if (this.unloading) return;
		const earlyName = explicitProfile && this.profiles.has(explicitProfile) ? explicitProfile : this.profiles.activeName;
		const earlyMessages = this.messages.forProfile(earlyName, this.profiles.getSnapshot(earlyName));
		if (this.coordinator.busy) {
			earlyMessages.notice("An export is already running. Wait for it to finish or cancel it.");
			return;
		}
		const view = this.app.workspace.getActiveViewOfType(MarkdownView),
			file = view?.file;
		if (!view || !file) {
			earlyMessages.notice("Open a Markdown note before exporting.");
			return;
		}
		// Capture editor/source/profile synchronously, before activation or rendering awaits.
		const source: SourceDescriptor = {
			path: file.path,
			name: file.name,
			basename: file.basename,
			ctime: file.stat.ctime,
			mtime: file.stat.mtime,
		};
		const frontmatter: Record<string, unknown> = JSON.parse(
			JSON.stringify(this.app.metadataCache.getFileCache(file)?.frontmatter ?? {})
		);
		const requested =
			explicitProfile ??
			(typeof frontmatter.VTTprofile === "string" ? frontmatter.VTTprofile : this.profiles.activeName);
		const name = this.profiles.has(requested) ? requested : this.profiles.activeName;
		const profile = this.profiles.getSnapshot(name);
		let messages = this.messages.forProfile(name, profile, this.profiles.getOrigin(name).identity);
		const markdown = view.editor ? view.editor.getSelection() || view.editor.getValue() : undefined;
		const viewClone =
			markdown === undefined
				? ((view.contentEl.querySelector(".markdown-preview-section") ?? view.contentEl).cloneNode(true) as HTMLElement)
				: undefined;
		const rendering = new RenderService(this.app);
		this.rendering = rendering;
		const progress = new Modal(this.app);
		progress.contentEl.createEl("p", { text: messages.status("export-progress", `Exporting ${source.name} with profile ${name}…`) });
		new Setting(progress.contentEl).addButton(button =>
			button.setButtonText("Cancel export").onClick(() => {
				this.coordinator.cancel();
				button.setDisabled(true);
			})
		);
		progress.open();
		const results = await this.coordinator.run(
			async job => {
				messages = messages.forJob(job.jobId);
				checkCancelled(job.signal);
				const node = await rendering.render({ markdown, viewClone, sourcePath: source.path }, job.signal);
				const assets = new NoteAssets(this.app, file, source.path);
				const fileAt = (path: string): TFile => {
					if (path === source.path) return file;
					const found = this.app.vault.getAbstractFileByPath(path);
					if (!(found instanceof TFile)) throw new Error("A referenced note is no longer available.");
					return found;
				};
				const identities = new NoteIdentities({
					readIdentity: path => {
						const value = this.app.metadataCache.getFileCache(fileAt(path))?.frontmatter?.UUID;
						return typeof value === "string" ? value : undefined;
					},
					update: async (path, update) => {
						checkCancelled(job.signal);
						await this.app.fileManager.processFrontMatter(fileAt(path), update);
					},
				});
				const host: DestinationHost = {
					diagnostics: messages.diagnostic,
					readAsset: path => assets.read(path),
					writeFrontmatter: update => this.app.fileManager.processFrontMatter(file, update),
					writeClipboard: text => navigator.clipboard.writeText(text),
					writeVaultFile: async (path, text) => {
						const existing = this.app.vault.getAbstractFileByPath(path);
						if (existing instanceof TFile) await this.app.vault.modify(existing, text);
						else await this.app.vault.create(path, text);
					},
					vaultBasePath:
						this.app.vault.adapter instanceof FileSystemAdapter ? this.app.vault.adapter.getBasePath() : undefined,
				};
				let payload: ExportPayload;
				if (profile.exportDirty) payload = { mode: "raw", html: node.innerHTML, source, links: [], assets: [] };
				else {
					const collected = await assets.collect(node);
					checkCancelled(job.signal);
					const cleaned = await cleanHtml(node, cleanConfig(profile), collected, {
						frontmatter,
						writeLinkedIdentities: profile.exportFoundry && profile.foundryFrontmatterWriteBack.isWriteBack,
						resolveLink: path => {
							const target = this.app.metadataCache.getFirstLinkpathDest(path, source.path);
							return target ? { path: target.path, name: target.name, extension: target.extension } : null;
						},
						ensureIdentity: path => identities.ensure(path),
						readAsset: path => assets.read(path),
					});
					const noteIdentity =
						profile.exportFoundry && profile.ObsidianWriteFrontmatter
							? await identities.ensure(source.path)
							: undefined;
					payload = {
						mode: "cleaned",
						html: cleaned.html,
						source: { ...source, noteIdentity },
						links: cleaned.links,
						assets: collected,
					};
				}
				checkCancelled(job.signal);
				return { payload, destinations: configuredDestinations(profile, payload.source, frontmatter, host, job) };
			},
			() => {
				try {
					rendering.dispose();
				} finally {
					this.rendering = undefined;
					progress.close();
				}
			}
		);
		if (!this.unloading)
			messages.notice(
				results.map(result => `${result.id}: ${result.message}`).join("\n"),
				results.some(result => result.status === "failure") ? "error" : "info",
				results.some(result => result.status === "failure") ? 12000 : 6000
			);
	}
	onunload(): void {
		this.unloading = true;
		this.coordinator.cancel();
		this.rendering?.dispose();
	}
}
