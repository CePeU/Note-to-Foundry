import { Menu, MenuItem } from "obsidian";
import { PLUGIN_ICON_ID } from "../identity";

type ExportProfile = (name: string) => void;
function fillProfileItems(menu: Menu, profiles: readonly string[], onExport: ExportProfile): void {
	for (const name of [...profiles].sort()) menu.addItem(item => item.setTitle(`Export HTML: ${name}`)
		.setIcon(PLUGIN_ICON_ID).onClick(() => onExport(name)));
}

// BEGIN ACTIVE FLAT MENU
export function addProfileExportItems(menu: Menu, profiles: readonly string[], onExport: ExportProfile): void {
	fillProfileItems(menu, profiles, onExport);
}
// END ACTIVE FLAT MENU

// To use the alternate menu, comment out the ACTIVE FLAT MENU declaration and
// uncomment the following same-name declaration. Exactly one must be active.
// setSubmenu is nonstandard; host acceptance on Obsidian 1.13.4 remains required.
/* BEGIN SUBMENU ALTERNATIVE
export function addProfileExportItems(menu: Menu, profiles: readonly string[], onExport: ExportProfile): void {
	addProfileSubmenuItems(menu, profiles, onExport);
}
END SUBMENU ALTERNATIVE */

/** Capability check and flat fallback also make the commented variant testable. */
export function addProfileSubmenuItems(menu: Menu, profiles: readonly string[], onExport: ExportProfile): void {
	const prototype = MenuItem.prototype as MenuItem & { setSubmenu?: () => Menu };
	if (typeof prototype.setSubmenu !== "function") { fillProfileItems(menu, profiles, onExport); return; }
	menu.addItem(item => {
		item.setTitle("Export HTML with profile").setIcon(PLUGIN_ICON_ID);
		fillProfileItems(prototype.setSubmenu!.call(item), profiles, onExport);
	});
}
