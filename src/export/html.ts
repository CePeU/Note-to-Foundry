export function escapeAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function replaceAssetUri(html: string, source: string, target: string): string {
	return html.split(escapeAttribute(source)).join(escapeAttribute(target));
}
export function projectLink(html: string, oldHref: string, target: string): string {
	const escaped = escapeAttribute(oldHref).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return html.replace(
		new RegExp(`(\\bhref=)(["'])${escaped}\\2`, "g"),
		(_match, prefix, quote) => `${prefix}${quote}${escapeAttribute(target)}${quote}`
	);
}
