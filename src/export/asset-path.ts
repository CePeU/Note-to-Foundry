/** Convert captured resource URIs to vault link paths; preserve relative paths. */
export function assetLinkPath(uri: string, vaultBasePath?: string, caseInsensitive = false): string | null {
	let path: string;
	try {
		path = decodeURIComponent(uri.replace(/\?[^?]*$/, "")).replace(/\\/g, "/");
	} catch {
		throw new Error("An image has an invalid URI.");
	}
	if (path.startsWith("app://")) {
		if (!vaultBasePath) return null;
		path = path.replace(/^app:\/\/[^/]+\//, "").replace(/^\/+/, "");
		const base = vaultBasePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
		const compare = (value: string) => (caseInsensitive ? value.toLowerCase() : value);
		if (!compare(path).startsWith(compare(base) + "/")) return null;
		return path.slice(base.length + 1);
	}
	if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
	return path;
}
