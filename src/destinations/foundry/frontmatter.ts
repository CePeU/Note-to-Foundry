import type { NoteToFoundrySettings } from "../../profiles/types";
import type { DestinationHost, SourceDescriptor } from "../../export/types";
import type { FoundryTarget } from "./types";

export function resolveTarget(
	profile: NoteToFoundrySettings,
	frontmatter: Readonly<Record<string, unknown>>,
	source: SourceDescriptor
): FoundryTarget {
	const target: FoundryTarget = {
		folder: "",
		journal: "ObsidianExport",
		title: source.basename,
		pageId: "",
		isPage: true,
		picturePath: "assets/pictures",
	};
	if (!profile.foundrySettingsUsed) return target;
	target.folder = profile.foundryFolder || "";
	target.journal = profile.foundryJournal || "ObsidianExport";
	target.picturePath = profile.foundryPicturePath || "assets/pictures";
	if (profile.foundryFrontmatterWriteBack.isWriteBack) {
		const text = (key: string, fallback: string) =>
			typeof frontmatter[key] === "string" ? (frontmatter[key] as string) : fallback;
		// Preserve the historical root-folder fallback when frontmatter mode is used.
		target.folder = text("VTT_Folder", "");
		target.journal = text("VTT_Journal", target.journal) || target.journal;
		target.title = text("VTT_PageTitle", target.title) || target.title;
		target.pageId = text("VTT_UUID", "");
		target.picturePath = text("VTT_PicturePath", target.picturePath) || target.picturePath;
		target.isPage =
			target.journal === "ObsidianExport"
				? true
				: typeof frontmatter.VTT_Page === "boolean"
					? frontmatter.VTT_Page
					: false;
	}
	return target;
}

export async function writeBack(
	host: DestinationHost,
	profile: NoteToFoundrySettings,
	target: FoundryTarget,
	pageId: string,
	created: boolean
): Promise<void> {
	const flags = profile.foundryFrontmatterWriteBack;
	if (!flags.isWriteBack) return;
	const entries = [
		["Folder", target.folder],
		["Journal", target.journal],
		["PageTitle", target.title],
		["Page", target.isPage],
		["PicturePath", target.picturePath],
		["UUID", pageId],
	] as const;
	try {
		await host.writeFrontmatter(frontmatter => {
			for (const [key, value] of entries)
				if (flags[key] && (created || !frontmatter[`VTT_${key}`])) frontmatter[`VTT_${key}`] = value;
		});
	} catch {
		throw new Error("The page was saved in Foundry, but its Obsidian frontmatter could not be updated.");
	}
}
