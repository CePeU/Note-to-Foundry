import { SettingDefinitionItem } from "obsidian";
import { group, row, SettingsContext } from "../controls";

export function profileManagement(ctx: SettingsContext): SettingDefinitionItem[] {
	return [group("Create and clone", [row("New profile name", setting => {
		let newName = "";
		setting.addText(control => control.onChange(value => { newName = value; }))
			.addButton(button => button.setButtonText("Create").onClick(() => ctx.run(() => ctx.repository.create(newName), true)))
			.addButton(button => button.setButtonText("Clone active").onClick(() => ctx.run(() => ctx.repository.clone(ctx.name, newName), true)))
			.addButton(button => button.setButtonText("Rename active").onClick(() => ctx.run(() => ctx.repository.rename(ctx.name, newName), true)));
	})]),
	group("Profile management", ctx.repository.listNames().map(name => row(name, setting => {
		setting.addButton(button => button.setButtonText("Export JSON").onClick(() => ctx.files.export(name)))
			.addButton(button => button.setButtonText("Delete").setDisabled(ctx.repository.listNames().length === 1)
				.onClick(() => ctx.run(() => ctx.repository.remove(name), true)));
	}))),
	group("Import profile", [row("Import a profile file", setting => {
		setting.addButton(button => button.setButtonText("Choose JSON").onClick(() => ctx.files.import(ctx.refresh)));
	})])];
}
