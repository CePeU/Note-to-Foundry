import {
	checkCancelled,
	DestinationContext,
	DestinationResult,
	ExportDestination,
	ExportPayload,
} from "../export/types";
export interface ClipboardConfig {
	header: string;
	footer: string;
}
export class ClipboardDestination implements ExportDestination<ClipboardConfig> {
	readonly id = "clipboard";
	async export(payload: ExportPayload, context: DestinationContext<ClipboardConfig>): Promise<DestinationResult> {
		checkCancelled(context.signal);
		try {
			await context.host.writeClipboard(
				payload.mode === "raw" ? payload.html : context.config.header + payload.html + context.config.footer
			);
			return { id: this.id, status: "success", message: "HTML copied to clipboard." };
		} catch {
			return {
				id: this.id,
				status: "failure",
				message: "Clipboard access failed. Check desktop clipboard permissions.",
			};
		}
	}
}
