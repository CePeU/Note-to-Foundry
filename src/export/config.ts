import type { NoteToFoundrySettings } from "../profiles/types";
import { cloneProfile } from "../profiles/defaults";
import { ClipboardDestination } from "../destinations/clipboard";
import { FileDestination } from "../destinations/file";
import { FoundryDestination } from "../destinations/foundry";
import { resolveTarget } from "../destinations/foundry/frontmatter";
import { obsidianTransport } from "../relay/obsidian";
import { configureDestination } from "./registry";
import type { ConfiguredDestination, DestinationHost, SourceDescriptor } from "./types";
import type { JobContext } from "./coordinator";
import type { CleanConfig } from "./clean-service";

export function cleanConfig(profile: NoteToFoundrySettings): CleanConfig {
	return {
		attributeList: [...profile.attributeList],
		classList: [...profile.classList],
		rulesForTags: cloneProfile(profile.rulesForTags),
		rulesForRegex: cloneProfile(profile.rulesForRegex),
		jsCode: profile.jsCode,
		internalLinkResolution: profile.internalLinkResolution,
		removeFrontmatter: profile.removeFrontmatter,
		encodePictures: profile.encodePictures,
	};
}
export function configuredDestinations(
	profile: NoteToFoundrySettings,
	source: SourceDescriptor,
	frontmatter: Readonly<Record<string, unknown>>,
	host: DestinationHost,
	job: JobContext
): ConfiguredDestination[] {
	const destinations: ConfiguredDestination[] = [];
	if (profile.exportClipboard)
		destinations.push(
			configureDestination(new ClipboardDestination(), {
				...job,
				host,
				config: { header: profile.footerAndHeader.clipboard[0], footer: profile.footerAndHeader.clipboard[1] },
			})
		);
	if (profile.exportFoundry)
		destinations.push(
			configureDestination(new FoundryDestination(obsidianTransport), {
				...job,
				host,
				config: { profile: cloneProfile(profile), target: resolveTarget(profile, frontmatter, source) },
			})
		);
	if (profile.exportFile)
		destinations.push(
			configureDestination(new FileDestination(), {
				...job,
				host,
				config: {
					directory: profile.htmlExportFilePath,
					linkDirectory: profile.htmlLinkPath,
					pictureDirectory: profile.htmlPictureExportFilePath,
					pictureReference: profile.htmlPictureRelativeExportFilePath,
					vaultStructure: profile.isExportVaultPaths,
					encodePictures: profile.encodePictures,
					header: profile.footerAndHeader.fileHTML[0],
					footer: profile.footerAndHeader.fileHTML[1],
				},
			})
		);
	return destinations;
}
