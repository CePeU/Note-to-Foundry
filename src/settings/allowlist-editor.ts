import { SettingDefinitionItem } from "obsidian";
import { createDefaultProfile } from "../profiles/defaults";
import { row, SettingsContext } from "./controls";
import { allowlistValues } from "./allowlist-values";

export function allowlistEditor(ctx: SettingsContext, key: "attributeList" | "classList", title: string): SettingDefinitionItem[] {
	return [row(title, setting => {
		setting.addButton(button => button.setButtonText("Reset").onClick(() => ctx.update(profile => {
			profile[key] = [...createDefaultProfile()[key]];
		}, true)));
	}, "One entry per line. Existing wildcard rules are preserved."),
	row("", setting => {
		setting.settingEl.addClass("otf-allowlist");
		setting.infoEl.remove();
		const container = setting.controlEl;
		const tags = container.createDiv({ cls: "otf-allowlist-tags" });
		const textarea = container.createEl("textarea", { attr: { rows: "12", "aria-label": title } });
		const status = container.createEl("p", { attr: { role: "status" } });
		textarea.value = ctx.profile[key].join("\n");
		let sequence = 0, disposed = false;
		const save = async () => {
			const current = ++sequence, values = allowlistValues(textarea.value);
			status.setText(ctx.messages.status(`allowlist-${key}`, "Saving…"));
			try {
				await ctx.repository.update(ctx.name, profile => { profile[key] = values; }, { isValid: () => !disposed && ctx.valid() });
				if (!disposed && current === sequence) status.setText(ctx.messages.status(`allowlist-${key}`, "Saved."));
			} catch {
				if (!disposed && current === sequence) status.setText(ctx.messages.status(`allowlist-${key}`, "Not saved. Your draft is still shown; edit again to retry.", "error"));
			}
		};
		const renderTags = () => {
			tags.empty();
			for (const value of allowlistValues(textarea.value).sort()) {
				const tag = tags.createSpan({ cls: "otf-allowlist-tag" });
				tag.createSpan({ text: value });
				tag.createEl("button", { text: "×", attr: { "aria-label": `Remove ${value}`, type: "button" } }).onclick = () => {
					textarea.value = allowlistValues(textarea.value).filter(item => item !== value).join("\n");
					renderTags(); void save();
				};
			}
		};
		textarea.oninput = () => { renderTags(); void save(); };
		renderTags();
		return ctx.own(() => { disposed = true; textarea.oninput = null; });
	})];
}
