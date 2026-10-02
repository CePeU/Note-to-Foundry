import { SettingDefinition, SettingDefinitionItem } from "obsidian";
import { group, row, SettingsContext, text, toggle } from "../controls";
import { LINK_UPDATE_CODE } from "../../destinations/foundry/scripts";
import { INSTALL_MACRO_CODE } from "../../destinations/foundry/macro";
import { record, stringField } from "../../relay/types";
import { FoundryEndpoints, resolveClient } from "../../destinations/foundry/endpoints";
import { RelayClient } from "../../relay/client";
import { obsidianTransport } from "../../relay/obsidian";
import { requireScopes, requiredScopes } from "../../relay/auth";
import { credentialLabel, keyPrefix } from "../../relay/credential-status";
import { openApprovalUrl } from "../../ui/browser";
import { FoundrySelectIdModal } from "../../modals";
import { headerFooter } from "./export-settings";

function approval(ctx: SettingsContext): SettingDefinition {
	return row("Browser key approval", setting => {
		const render = () => {
			if (!ctx.valid()) return;
			const auth = ctx.auth, state = auth.snapshot();
			setting.controlEl.empty();
			setting.setDesc(`Requested scopes: ${requiredScopes(ctx.profile).join(", ")}. ${state.profileName ? state.profileName + ": " : ""}${state.message}`);
			setting.addButton(button => button.setButtonText("Request key")
				.setDisabled(["requesting", "pending", "saving", "approved-unsaved"].includes(state.phase)).onClick(() => ctx.run(() => auth.start(ctx.name))));
			if (state.phase === "pending" && state.approvalUrl) {
				setting.addButton(button => button.setButtonText("Open approval in browser").onClick(() => ctx.run(() => openApprovalUrl(state.approvalUrl!))));
				setting.addButton(button => button.setButtonText("Copy approval link").onClick(() => ctx.run(async () => {
					await navigator.clipboard.writeText(state.approvalUrl!); ctx.messages.notice("Approval link copied.");
				})));
			}
			if (state.phase === "approved-unsaved") setting.addButton(button => button.setButtonText("Retry save").onClick(() => ctx.run(() => auth.retrySave())));
			if (["requesting", "pending", "approved-unsaved"].includes(state.phase)) setting.addButton(button => button
				.setButtonText(state.phase === "approved-unsaved" ? "Discard unsaved key" : "Cancel request").onClick(() => { auth.cancel(); }));
		};
		render();
		const offAuth = ctx.auth.subscribe(render), offProfiles = ctx.repository.subscribe(render);
		return ctx.own(() => { offAuth(); offProfiles(); });
	});
}
function keyField(ctx: SettingsContext): SettingDefinition {
	return row("Scoped API key", setting => {
		let input: HTMLInputElement;
		setting.addText(control => {
			input = control.inputEl; input.type = "password";
			control.setValue(ctx.profile.foundryApiKey).onChange(value => ctx.update(profile => { profile.foundryApiKey = value; }));
		});
		const render = () => {
			if (!ctx.valid()) return;
			setting.setDesc(keyPrefix(ctx.profile.foundryApiKey));
			if (input.ownerDocument.activeElement !== input) input.value = ctx.profile.foundryApiKey;
		};
		render(); return ctx.own(ctx.repository.subscribe(render));
	});
}
function keyStatus(ctx: SettingsContext): SettingDefinition {
	return row("Key status", setting => {
		const indicator = setting.controlEl.createSpan({ cls: "otf-key-status", attr: { role: "status" } });
		let refreshButton: { setDisabled(value: boolean): unknown };
		setting.addButton(button => { refreshButton = button; button.setButtonText("Check key").onClick(() => ctx.run(() => ctx.credentials.check(ctx.name))); });
		const render = () => {
			if (!ctx.valid()) return;
			const state = ctx.credentials.snapshot(ctx.name);
			indicator.dataset.phase = state.phase;
			indicator.setText(ctx.messages.status("credential-status", credentialLabel(state)));
			refreshButton.setDisabled(state.phase === "checking" || state.phase === "missing");
		};
		render();
		const offStatus = ctx.credentials.subscribe(name => { if (name === ctx.name) render(); });
		const offProfile = ctx.repository.subscribe(render);
		return ctx.own(() => { offStatus(); offProfile(); });
	}, "A recent authenticated read confirms key acceptance. Export scopes and world availability are checked separately.");
}
function clientField(ctx: SettingsContext): SettingDefinition {
	return row("Foundry client ID", setting => {
		let input: HTMLInputElement;
		setting.addText(control => { input = control.inputEl;
			control.setValue(ctx.profile.foundryClientId).onChange(value => ctx.update(profile => { profile.foundryClientId = value; }));
		});
		const render = () => {
			if (!ctx.valid()) return;
			const state = ctx.credentials.snapshot(ctx.name), id = ctx.profile.foundryClientId;
			setting.setDesc(`${id || "No client selected"} · ${state.clientLabel || "World label unavailable; check key or select a client"}${state.clientLabel && state.phase !== "valid" ? " (cached)" : ""}${state.online === false ? " (offline)" : ""}`);
			if (input.ownerDocument.activeElement !== input) input.value = id;
		};
		render();
		const offStatus = ctx.credentials.subscribe(name => { if (name === ctx.name) render(); }), offProfile = ctx.repository.subscribe(render);
		return ctx.own(() => { offStatus(); offProfile(); });
	});
}
export function foundrySettings(ctx: SettingsContext): SettingDefinitionItem[] {
	const connection = group("Connection and scoped key", [text(ctx, "foundryRelayServer", "Relay URL"), keyField(ctx), keyStatus(ctx), approval(ctx),
		row("Granted scopes", setting => {
			const render = () => { if (ctx.valid()) { const metadata = ctx.profile.foundryAuthMetadata;
				setting.setDesc(metadata ? `${metadata.grantedScopes.join(", ") || "None"}. Client bindings: ${metadata.clientIds.join(", ") || "All allowed clients"}` : "No saved approval metadata. Check the key's scopes in the relay dashboard.");
			} }; render(); return ctx.own(ctx.repository.subscribe(render));
		}), clientField(ctx),
		row("Connected Foundry clients", setting => { setting.addButton(button => button.setButtonText("Select client").onClick(() => ctx.run(async () => {
			const origin = ctx.repository.getOrigin(ctx.name);
			const state = await ctx.credentials.check(ctx.name);
			if (!ctx.valid() || !ctx.repository.matches(origin)) return;
			if (state.phase !== "valid") { ctx.messages.notice(credentialLabel(state), "warn"); return; }
			if (!state.clients.length) { ctx.messages.notice("The key was accepted, but no connected clients are available."); return; }
			new FoundrySelectIdModal(ctx.app, state.clients, name => {
				if (name) void ctx.run(async () => {
					await ctx.repository.update(ctx.name, { foundryClientId: name }, { origin });
					await ctx.credentials.check(ctx.name);
				});
			}).open();
		}))); }), toggle(ctx, "foundryHeadlessUsed", "Start a headless session")]);
	const headless = group("Headless session", [row("Headless credentials", setting => {
		setting.addDropdown(control => control.addOptions({ explicit: "Enter Foundry credentials", stored: "Use relay-stored credentials" })
			.setValue(ctx.profile.foundryHeadlessCredentialMode).onChange(value => ctx.update(profile => {
				profile.foundryHeadlessCredentialMode = value === "stored" ? "stored" : "explicit";
			}, true)));
	}), ...([text(ctx, "foundryIP", "Foundry URL"), text(ctx, "foundryUser", "Foundry username"),
		text(ctx, "foundryPW", "Foundry password", "An empty password is allowed.", true), text(ctx, "foundryWorld", "Foundry world", "Optional world name.")]
		.map(definition => ({ ...definition, visible: () => ctx.valid() && ctx.profile.foundryHeadlessCredentialMode === "explicit" })))],
		() => ctx.valid() && ctx.profile.foundryHeadlessUsed);
	const destination = group("Foundry destination", [toggle(ctx, "foundrySettingsUsed", "Use configured Foundry destinations"),
		text(ctx, "foundryFolder", "Foundry folder"), text(ctx, "foundryJournal", "Foundry journal"), text(ctx, "foundryPicturePath", "Foundry picture path"),
		headerFooter(ctx, "foundryHTML", "Foundry header and footer")]);
	const labels = { isWriteBack: "Use Foundry frontmatter and write back", Folder: "Folder", Journal: "Journal", PageTitle: "Page title", Page: "Page", PicturePath: "Picture path", UUID: "Foundry UUID" };
	const linking = group("Linking and frontmatter", [toggle(ctx, "foundryMacroLinkingRun", "Repair links after export", "Runs the plugin's JavaScript directly; an installed macro is not required."),
		row("Optional linking macro", setting => {
			setting.addButton(button => button.setButtonText("Copy script").onClick(() => ctx.run(async () => { await navigator.clipboard.writeText(LINK_UPDATE_CODE); ctx.messages.notice("Linking script copied."); })))
				.addButton(button => button.setButtonText("Install macro").onClick(() => ctx.run(async () => {
					const profile = ctx.profile; requireScopes(profile, ["execute-js"]);
					const client = new RelayClient({ baseUrl: profile.foundryRelayServer, apiKey: profile.foundryApiKey }, obsidianTransport, ctx.messages.diagnostic);
					const clientId = await resolveClient(new FoundryEndpoints(client), profile.foundryClientId, profile.foundryAuthMetadata?.clientIds);
					await new FoundryEndpoints(client, clientId).executeJs(INSTALL_MACRO_CODE, result => stringField(record(result, "macro installation").id, "macro ID"));
					ctx.messages.notice("Linking macro installed.");
				})));
		}), toggle(ctx, "ObsidianWriteFrontmatter", "Write Obsidian note UUIDs"),
		...(Object.keys(labels) as (keyof typeof labels)[]).map(key => row(labels[key], setting => {
			setting.addToggle(control => control.setValue(ctx.profile.foundryFrontmatterWriteBack[key]).onChange(value => ctx.update(profile => { profile.foundryFrontmatterWriteBack[key] = value; })));
		}))]);
	return [connection, headless, destination, linking];
}
