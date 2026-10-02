import { App, FileSystemAdapter, TFile, normalizePath } from "obsidian";
import xxhash from "xxhash-wasm";
import type { SourceAsset } from "./types";
import { assetLinkPath } from "./asset-path";

const mediaTypes: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	bmp: "image/bmp",
	svg: "image/svg+xml",
	webp: "image/webp",
	avif: "image/avif",
};
export class NoteAssets {
	private binaries = new Map<string, ArrayBuffer>();
	constructor(
		private app: App,
		private source: TFile,
		private sourcePath = source.path
	) {}
	private resolve(uri: string): TFile | null {
		const adapter = this.app.vault.adapter;
		const path = assetLinkPath(
			uri,
			adapter instanceof FileSystemAdapter ? adapter.getBasePath() : undefined,
			process.platform === "win32"
		);
		if (path === null) return null;
		return this.app.metadataCache.getFirstLinkpathDest(normalizePath(path), this.sourcePath);
	}
	async collect(parent: HTMLElement): Promise<SourceAsset[]> {
		const result: SourceAsset[] = [];
		const hasher = await xxhash();
		for (const image of Array.from(parent.querySelectorAll<HTMLImageElement>("img[src]"))) {
			const uri = image.getAttribute("src") ?? "";
			if (!uri || /^(https?:|data:|blob:)/i.test(uri)) continue;
			const file = this.resolve(uri);
			if (!file) throw new Error("A local image could not be resolved from the captured note.");
			let binary = this.binaries.get(file.path);
			if (!binary) {
				binary = await this.app.vault.readBinary(file);
				this.binaries.set(file.path, binary);
			}
			const hash = hasher.h64Raw(new Uint8Array(binary), BigInt(987654321)).toString(16).padStart(16, "0");
			result.push({
				uri,
				vaultPath: file.path,
				mediaType: mediaTypes[file.extension.toLowerCase()] ?? "application/octet-stream",
				hash,
				suggestedFilename: `${file.basename}_${hash}.${file.extension}`,
			});
		}
		return result;
	}
	async read(path: string): Promise<ArrayBuffer> {
		const data = this.binaries.get(path);
		if (!data) throw new Error("Image data is unavailable for this export job.");
		return data.slice(0);
	}
}
