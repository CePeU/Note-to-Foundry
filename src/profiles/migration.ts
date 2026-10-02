import { LEGACY_PLUGIN_ID, PLUGIN_ID } from "../identity";
import { normalizeCollection } from "./normalize";

export interface ProfileStorageReader {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
}
export interface ProfileBootstrap { source: "current" | "legacy" | "fresh"; data: unknown; }
export function profileStoragePaths(configDirectory: string) {
	const directory = configDirectory.replace(/\\/g, "/").replace(/\/$/, "");
	if (!directory || directory.startsWith("/") || directory.includes(":") || directory.split("/").some(part => !part || part === "." || part === ".."))
		throw new Error("The vault configuration directory must be a relative vault path.");
	return { current: `${directory}/plugins/${PLUGIN_ID}/data.json`, legacy: `${directory}/plugins/${LEGACY_PLUGIN_ID}/data.json`, enabled: `${directory}/community-plugins.json` };
}
async function readJson(storage: ProfileStorageReader, path: string): Promise<unknown> {
	try { return JSON.parse((await storage.read(path)).replace(/^\uFEFF/, "")); }
	catch { throw new Error(`Could not read valid JSON from ${path}. Preserve the file and follow the migration recovery guide.`); }
}
/** Selection is read-only. Only ProfileRepository persists the selected collection. */
export async function selectProfileBootstrap(storage: ProfileStorageReader, configDirectory: string): Promise<ProfileBootstrap> {
	const paths = profileStoragePaths(configDirectory);
	if (await storage.exists(paths.enabled)) {
		const enabled = await readJson(storage, paths.enabled);
		if (!Array.isArray(enabled) || !enabled.every(id => typeof id === "string"))
			throw new Error("Could not verify enabled plugin IDs. Check the vault's community-plugins.json before migrating.");
		if (enabled.includes(LEGACY_PLUGIN_ID)) throw new Error("Disable MarkdownToFoundry in Community plugins, then reload NoteToFoundry. Both export plugins must not run together.");
	}
	for (const source of ["current", "legacy"] as const) {
		const path = paths[source];
		if (!await storage.exists(path)) continue;
		const data = await readJson(storage, path);
		if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Expected a profile collection in ${path}. No settings were overwritten.`);
		try { normalizeCollection(data); }
		catch { throw new Error(`The profile collection in ${path} is invalid or unsupported. No settings were overwritten.`); }
		return { source, data };
	}
	return { source: "fresh", data: null };
}
