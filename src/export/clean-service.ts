import type { NoteToFoundrySettings } from "../profiles/types";
import type { SourceAsset, SourceLink } from "./types";
import { allocateIdentity } from "./identity";
import {
	removeAttributes,
	removeEmptyContainer,
	removeFrontMatter,
	replaceInHTMLWithRegex,
	replaceTag,
	runJavaScript,
} from "./transforms";

export type CleanConfig = Pick<
	NoteToFoundrySettings,
	| "attributeList"
	| "classList"
	| "rulesForTags"
	| "rulesForRegex"
	| "jsCode"
	| "internalLinkResolution"
	| "removeFrontmatter"
	| "encodePictures"
>;
export interface CleanDependencies {
	readonly frontmatter: Readonly<Record<string, unknown>>;
	readonly writeLinkedIdentities: boolean;
	resolveLink(path: string): { path: string; name: string; extension: string } | null;
	ensureIdentity(path: string): Promise<string>;
	readAsset(path: string): Promise<ArrayBuffer>;
}

export async function cleanHtml(
	parent: HTMLElement,
	config: CleanConfig,
	assets: readonly SourceAsset[],
	deps: CleanDependencies
): Promise<{ html: string; links: SourceLink[] }> {
	// Keep the historical transform order; the caller owns this DOM clone.
	if (config.encodePictures)
		for (const image of Array.from(parent.querySelectorAll<HTMLImageElement>("img[src]"))) {
			const asset = assets.find(item => item.uri === image.getAttribute("src"));
			if (asset)
				image.setAttribute(
					"src",
					`data:${asset.mediaType};base64,${Buffer.from(await deps.readAsset(asset.vaultPath)).toString("base64")}`
				);
		}
	const links: SourceLink[] = [];
	if (config.internalLinkResolution)
		for (const element of Array.from(parent.querySelectorAll<HTMLAnchorElement>("a.internal-link"))) {
			const href = element.getAttribute("href") ?? "";
			const hash = href.indexOf("#"),
				path = hash < 0 ? href : href.slice(0, hash),
				anchor = hash < 0 ? "" : href.slice(hash);
			const target = path ? deps.resolveLink(path) : null;
			if (target) element.setAttribute("href", target.path + anchor);
			if ((!path && anchor) || target?.extension === "md") {
				const noteIdentity = target && deps.writeLinkedIdentities ? await deps.ensureIdentity(target.path) : undefined;
				links.push({
					href,
					vaultPath: target?.path ?? "",
					filename: target?.name ?? "",
					text: element.textContent ?? "",
					anchor,
					noteIdentity,
				});
			}
		}
	replaceTag(parent, config);
	removeEmptyContainer(parent);
	removeFrontMatter(parent, config);
	removeAttributes(parent, config);
	let html = replaceInHTMLWithRegex(parent.innerHTML, config).replace(/^\s*/gm, "");
	if (config.jsCode)
		html =
			runJavaScript(config.jsCode, html, {
				createID: allocateIdentity,
				frontMatter: () => JSON.parse(JSON.stringify(deps.frontmatter)),
			}) ?? html;
	if (typeof html !== "string") throw new Error("Custom JavaScript must return HTML text or no value.");
	return { html, links };
}
