import type { RequestOptions } from "./types";

export type Severity = "info" | "warn" | "error";
export interface DiagnosticEvent {
	event: string;
	severity?: Severity;
	details?: unknown;
}
export type DiagnosticSink = (event: DiagnosticEvent) => void;
const sensitive = /api.?key|authorization|cookie|password|foundrypw|secret|token|approval|exchange|private.?key|encrypted/i;
// Upload bodies contain private image bytes just as HTML bodies contain private note text.
const NTF_CONTENT_FIELDS = /^(html|content|script|code|command|text|fileData)$/i;
function summarizeContent(value: string) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
	return { characters: value.length, digest: `fnv1a-${(hash >>> 0).toString(16)}`, contents: "[omitted]" };
}

/** Produces detached, bounded records. Never pass raw errors/responses to a console. */
export function sanitize(value: unknown, secrets: readonly string[] = []): unknown {
	const replacements = Array.from(new Set(secrets.filter(Boolean).flatMap(value => [value, encodeURIComponent(value)])))
		.sort((a, b) => b.length - a.length);
	const seen = new Set<object>();
	let budget = 16000;
	const cleanString = (value: string) => {
		for (const secret of replacements) value = value.split(secret).join("[redacted]");
		value = value.replace(/https?:\/\/\S*\/(?:approve|auth\/key-request)\/[^\s"<>]+/gi, "[approval URL redacted]");
		value = value.replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[redacted]@");
		value = value.replace(/((?:api[-_ ]?key|password|authorization|token|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]");
		const limit = Math.max(0, Math.min(2000, budget));
		budget -= Math.min(value.length, limit);
		return value.length > limit ? value.slice(0, limit) + "[truncated]" : value;
	};
	const visit = (item: unknown, depth: number): unknown => {
		if (typeof item === "string") return cleanString(item);
		if (item === null || typeof item === "boolean" || typeof item === "number") return item;
		if (item === undefined) return undefined;
		if (item instanceof Error) return "[error details omitted]";
		if (item instanceof ArrayBuffer || ArrayBuffer.isView(item)) return { bytes: item.byteLength };
		if (typeof item !== "object") return "[unsupported value]";
		if (depth > 6 || budget <= 0) return "[truncated]";
		if (seen.has(item)) return "[circular]";
		seen.add(item);
		if (Array.isArray(item)) {
			const result = item.slice(0, 100).map(value => visit(value, depth + 1));
			if (item.length > 100) result.push("[truncated]");
			return result;
		}
		const result: Record<string, unknown> = Object.create(null);
		for (const [key, val] of Object.entries(item).slice(0, 100)) {
			const label = cleanString(key);
			result[label] = sensitive.test(key) ? "[redacted]"
				: NTF_CONTENT_FIELDS.test(key) && typeof val === "string" ? summarizeContent(val)
				: visit(val, depth + 1);
		}
		if (Object.keys(item).length > 100) result.truncated = true;
		return result;
	};
	return visit(value, 0);
}

export function requestDetails(baseUrl: string, path: string, options: RequestOptions, secrets: readonly string[]): unknown {
	const url = new URL(path.replace(/^\/+/, ""), baseUrl);
	const auth = /(?:^|\/)(?:auth|.*session)(?:\/|$)/i.test(url.pathname);
	url.username = url.password = "";
	url.pathname = url.pathname.replace(/(\/auth\/key-request\/)[^/]+(\/status)/i, "$1[redacted]$2");
	const query: Record<string, unknown> = Object.create(null);
	url.searchParams.forEach((value, key) => { query[key] = value; });
	Object.assign(query, options.query);
	url.search = url.hash = "";
	const body = options.json && typeof options.json === "object" ? options.json as Record<string, unknown> : undefined;
	return sanitize({
		method: options.method ?? "GET", endpoint: url.toString(), query,
		payload: auth ? { kind: "authentication", scopes: body?.scopes, clientIds: body?.clientIds, clientId: body?.clientId }
			: options.binary ? { contentType: "application/octet-stream", bytes: options.binary.byteLength } : options.json,
	}, secrets);
}
