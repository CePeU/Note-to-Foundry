import * as path from "path";
import { pathToFileURL } from "url";
import {
	checkCancelled,
	DestinationContext,
	DestinationResult,
	ExportCancelled,
	ExportDestination,
	ExportPayload,
} from "../export/types";
import { projectLink, replaceAssetUri } from "../export/html";
import { atomicWrite } from "./file-system";

export interface FileConfig {
	directory: string;
	linkDirectory: string;
	pictureDirectory: string;
	pictureReference: string;
	vaultStructure: boolean;
	encodePictures: boolean;
	header: string;
	footer: string;
}
export class FileDestination implements ExportDestination<FileConfig> {
	readonly id = "file";
	constructor(private write = atomicWrite) {}
	async export(
		payload: ExportPayload,
		{ config, host, signal }: DestinationContext<FileConfig>
	): Promise<DestinationResult> {
		let written = 0;
		try {
			checkCancelled(signal);
			const filename = `${payload.source.basename}.html`;
			const root = config.directory || host.vaultBasePath;
			let html = payload.mode === "raw" ? payload.html : config.header + payload.html + config.footer;
			if (!root) {
				if (payload.mode !== "raw" && !config.encodePictures && payload.assets.length)
					throw new Error("A desktop vault directory is required for image export.");
				await host.writeVaultFile(filename, html);
				return { id: this.id, status: "success", message: "HTML saved in the vault.", outputIdentity: filename };
			}
			const folder = config.vaultStructure ? path.join(root, path.dirname(payload.source.path)) : root;
			const target = path.resolve(folder, filename);
			if (payload.mode !== "raw") {
				html = html.replace(/data-heading="([^"]*)"/g, 'id="$1"');
				for (const link of payload.links) {
					if (!link.vaultPath) continue; // inline anchors remain on the current page
					const file = (config.vaultStructure ? link.vaultPath : link.filename).replace(/\.md$/i, ".html");
					const targetLink = pathToFileURL(path.resolve(config.linkDirectory || root, file)).href + link.anchor;
					html = projectLink(html, link.vaultPath + link.anchor, targetLink);
				}
				if (!config.encodePictures) {
					const completed = new Set<string>();
					for (const asset of payload.assets) {
						checkCancelled(signal);
						// An absolute picture directory takes priority; otherwise resolve the relative directory beside the HTML.
						let PictureFolder = folder;
						if (config.pictureDirectory !== "") {
							PictureFolder = config.pictureDirectory;
							// A bare drive in the settings means its root, not Windows' remembered working directory on that drive.
							if (/^[a-z]:$/i.test(PictureFolder)) {
								PictureFolder += "/";
							}
						} else if (config.pictureReference !== "") {
							PictureFolder = path.resolve(folder, config.pictureReference.replace(/\\/g, "/"));
						}
						const N2F_IMAGE_TARGET = path.resolve(PictureFolder, asset.suggestedFilename);
						if (completed.has(N2F_IMAGE_TARGET) === false) {
							await this.write(N2F_IMAGE_TARGET, new Uint8Array(await host.readAsset(asset.vaultPath)));
							written++;
							completed.add(N2F_IMAGE_TARGET);
						}
						// Derive the reference from the actual write location so folder preservation and parent paths agree.
						let PictureReference = path.relative(path.dirname(target), N2F_IMAGE_TARGET).replace(/\\/g, "/");
						if (config.pictureDirectory !== "") {
							PictureReference = N2F_IMAGE_TARGET.replace(/\\/g, "/");
						} else if (config.pictureReference.replace(/\\/g, "/").startsWith("./") && PictureReference.startsWith("../") === false) {
							PictureReference = `./${PictureReference}`;
						}
						// A link prefix changes the published reference without changing the physical export directory.
						if (config.linkDirectory !== "") {
							PictureReference = `${config.linkDirectory.replace(/\\/g, "/").replace(/\/$/, "")}/${PictureReference.replace(/^\.\//, "").replace(/^\/+/, "")}`;
						}
						let EncodedReference = encodeURI(PictureReference).replace(/#/g, "%23").replace(/\?/g, "%3F");
						if (config.pictureDirectory !== "" && config.linkDirectory === "") {
							// File URLs keep absolute drive paths, UNC shares and POSIX paths usable in HTML.
							EncodedReference = pathToFileURL(N2F_IMAGE_TARGET).href;
						}
						html = replaceAssetUri(html, asset.uri, EncodedReference);
					}
				}
			}
			checkCancelled(signal);
			await this.write(target, html);
			return {
				id: this.id,
				status: "success",
				message: "HTML file and required images saved.",
				outputIdentity: target,
			};
		} catch (error) {
			return {
				id: this.id,
				status: error instanceof ExportCancelled ? "cancelled" : "failure",
				message: `${error instanceof ExportCancelled ? "File export cancelled." : "File export failed. Check the output directory and image files."}${written ? " Some image files were already written." : ""}`,
			};
		}
	}
}
