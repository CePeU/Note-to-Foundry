import { SettingDefinition, SettingDefinitionItem } from "obsidian";
import { FooterHeaderModal } from "../../modals";
import { group, row, SettingsContext, text, toggle } from "../controls";

export function headerFooter(ctx: SettingsContext, destination: "clipboard" | "fileHTML" | "foundryHTML", title: string): SettingDefinition {
	return row(title, setting => { setting.addButton(button => button.setButtonText("Edit").onClick(() => {
		const [header, footer] = ctx.profile.footerAndHeader[destination];
		new FooterHeaderModal(ctx.app, header, footer, pair => {
			void ctx.update(profile => { profile.footerAndHeader[destination] = [...pair]; });
		}).open();
	})); });
}
export function exportSettings(ctx: SettingsContext): SettingDefinitionItem[] {
	return [group("Output selection", [
		toggle(ctx, "exportClipboard", "Export to clipboard"), toggle(ctx, "exportFile", "Export HTML to a file"),
		toggle(ctx, "exportFoundry", "Export to Foundry"),
		toggle(ctx, "exportDirty", "Export raw HTML", "Skip cleanup. Raw HTML can be copied or saved locally; Foundry export uses cleaned HTML."),
	]),
	// Shared output handling belongs beside destination selection so every export can use it.
	group("Base Output handling", [
		toggle(ctx, "internalLinkResolution", "Resolve internal links"),
		toggle(ctx, "encodePictures", "Embed pictures as Base64"),
		toggle(ctx, "removeFrontmatter", "Remove rendered frontmatter"),
	]),
	group("Clipboard options", [headerFooter(ctx, "clipboard", "Clipboard header and footer")], () => ctx.valid() && ctx.profile.exportClipboard),
	group("HTML file options", [
		text(ctx, "htmlExportFilePath", "HTML export directory", "Leave empty to write the HTML file in the vault."),
		toggle(ctx, "isExportVaultPaths", "Preserve vault folder structure"), text(ctx, "htmlLinkPath", "HTML link prefix"),
		text(ctx, "htmlPictureExportFilePath", "Picture export directory", "Absolute directory for exported pictures. Takes priority over the relative picture path."),
		text(ctx, "htmlPictureRelativeExportFilePath", "Relative picture path", "Export pictures relative to each HTML file. Use ./ beside the HTML or ./new/assets for a subfolder."),
		headerFooter(ctx, "fileHTML", "File header and footer"),
	], () => ctx.valid() && ctx.profile.exportFile)];
}
