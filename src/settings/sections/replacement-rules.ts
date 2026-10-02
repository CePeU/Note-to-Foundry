import { SettingDefinitionItem } from "obsidian";
import { MultiColumnListModal, jsCodeModal } from "../../modals";
import { activeProfile, group, row, SettingsContext } from "../controls";
import { allowlistEditor } from "../allowlist-editor";

export function replacementRules(ctx: SettingsContext): SettingDefinitionItem[] {
	return [group("Tag and regex rules", ([
		["rulesForTags", "Tag replacement rules"], ["rulesForRegex", "Regex replacement rules"],
	] as const).map(([key, label]) => row(label, setting => {
		setting.addButton(button => button.setButtonText("Edit").onClick(() => {
			new MultiColumnListModal(ctx.app, [label, "Rules run in their listed order."], ctx.profile[key], rows => {
				if (rows !== null) void ctx.update(profile => { profile[key] = rows; });
			}, ["Match", "Replacement", "Description"]).open();
		}));
	}))),
	group("Allowed attributes and classes", [
		row("JavaScript replacement code", setting => { setting.addButton(button => button.setButtonText("Edit").onClick(() => {
			new jsCodeModal(ctx.app, ctx.profile, code => { void ctx.update(profile => { profile.jsCode = code; }); }).open();
		})); }),
	]),
	{ type: "page", name: "Allowed attributes", items: [activeProfile(ctx), ...allowlistEditor(ctx, "attributeList", "Allowed attributes")] },
	{ type: "page", name: "Allowed classes", items: [activeProfile(ctx), ...allowlistEditor(ctx, "classList", "Allowed classes")] }];
}
