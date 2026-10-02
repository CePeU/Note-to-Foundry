import { checkCancelled, DestinationHost, ExportPayload } from "../../export/types";
import { replaceAssetUri } from "../../export/html";
import { FoundryContext, remotePath } from "./context";

/**
 * Encodes raw characters in a returned upload URI while preserving existing percent escapes.
 * @param uploadUri Remote path or URL returned by the relay, as a string.
 * @returns A string suitable for use as an image URI in exported HTML.
 */
function EncodeUploadUri(uploadUri: string): string {
	// Foundry can already encode spaces and Unicode; encoding those escapes again breaks the URL.
	return encodeURI(uploadUri).replace(/%25([0-9a-f]{2})/gi, "%$1");
}

/**
 * Uploads uncached images and substitutes their confirmed URIs into the captured HTML.
 * @param foundryContext FoundryContext containing destination configuration and the upload cache.
 * @param exportPayload ExportPayload containing captured HTML and image metadata.
 * @param destinationHost DestinationHost used to read the captured image bytes.
 * @returns Exported HTML as a string with correctly encoded image references.
 */
export async function UploadAssets(
	foundryContext: FoundryContext,
	exportPayload: ExportPayload,
	destinationHost: DestinationHost
): Promise<string> {
	let exportedHtml = exportPayload.html;
	if (foundryContext.config.profile.encodePictures === true) return exportedHtml;
	let directoryPath = remotePath(foundryContext.config.target.picturePath);
	for (let imageAsset of exportPayload.assets) {
		checkCancelled(foundryContext.signal);
		let targetPath = remotePath(`${directoryPath}/${imageAsset.suggestedFilename}`);
		let uploadedUri = foundryContext.uploaded.get(targetPath);
		if (uploadedUri === undefined) {
			let uploadedPath = await foundryContext.endpoints.UploadAsset(
				directoryPath,
				imageAsset.suggestedFilename,
				await destinationHost.readAsset(imageAsset.vaultPath),
				imageAsset.mediaType
			);
			uploadedUri = EncodeUploadUri(uploadedPath);
			// Cache by the requested filesystem path so duplicate references reuse the confirmed URI.
			foundryContext.uploaded.set(targetPath, uploadedUri);
		}
		exportedHtml = replaceAssetUri(exportedHtml, imageAsset.uri, uploadedUri);
	}
	return exportedHtml;
}
