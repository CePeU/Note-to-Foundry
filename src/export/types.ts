import type { DiagnosticSink } from "../relay/diagnostics";

export interface SourceDescriptor {
	readonly path: string;
	readonly name: string;
	readonly basename: string;
	readonly ctime: number;
	readonly mtime: number;
	readonly noteIdentity?: string;
}
export interface SourceLink {
	readonly href: string;
	readonly vaultPath: string;
	readonly filename: string;
	readonly text: string;
	readonly anchor: string;
	readonly noteIdentity?: string;
}
export interface SourceAsset {
	readonly uri: string;
	readonly vaultPath: string;
	readonly mediaType: string;
	readonly hash: string;
	readonly suggestedFilename: string;
}
export interface ExportPayload {
	readonly mode: "raw" | "cleaned";
	readonly html: string;
	readonly source: SourceDescriptor;
	readonly links: readonly SourceLink[];
	readonly assets: readonly SourceAsset[];
}
export type DestinationStatus = "success" | "failure" | "skipped" | "cancelled";
export interface DestinationResult {
	id: string;
	status: DestinationStatus;
	message: string;
	outputIdentity?: string;
}
export interface DestinationHost {
	readAsset(path: string): Promise<ArrayBuffer>;
	writeFrontmatter(update: (frontmatter: Record<string, unknown>) => void): Promise<void>;
	writeClipboard(text: string): Promise<void>;
	writeVaultFile(path: string, text: string): Promise<void>;
	readonly vaultBasePath?: string;
	readonly diagnostics?: DiagnosticSink;
}
export interface DestinationContext<TConfig> {
	readonly config: TConfig;
	readonly host: DestinationHost;
	readonly jobId: string;
	readonly signal: AbortSignal;
}
export interface ExportDestination<TConfig> {
	readonly id: string;
	export(payload: ExportPayload, context: DestinationContext<TConfig>): Promise<DestinationResult>;
}
export interface ConfiguredDestination {
	readonly id: string;
	export(payload: ExportPayload): Promise<DestinationResult>;
}
export class ExportCancelled extends Error {
	constructor() {
		super("Export cancelled. Already-started effects may have completed.");
	}
}
export function checkCancelled(signal: AbortSignal): void {
	if (signal.aborted) throw new ExportCancelled();
}
export function freezePayload(payload: ExportPayload): ExportPayload {
	return Object.freeze({
		...payload,
		source: Object.freeze({ ...payload.source }),
		links: Object.freeze(payload.links.map(link => Object.freeze({ ...link }))),
		assets: Object.freeze(payload.assets.map(asset => Object.freeze({ ...asset }))),
	});
}
