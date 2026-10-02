import { ConfiguredDestination, DestinationResult, ExportCancelled, ExportPayload, freezePayload } from "./types";

export interface JobContext {
	jobId: string;
	signal: AbortSignal;
}
export class ExportCoordinator {
	private active?: AbortController;
	private sequence = 0;
	get busy(): boolean {
		return !!this.active;
	}
	cancel(): void {
		this.active?.abort();
	}
	async run(
		prepare: (job: JobContext) => Promise<{ payload: ExportPayload; destinations: readonly ConfiguredDestination[] }>,
		cleanup: () => void
	): Promise<DestinationResult[]> {
		if (this.active) throw new Error("An export is already running. Wait for it to finish or cancel it.");
		const controller = new AbortController();
		this.active = controller;
		const results: DestinationResult[] = [];
		try {
			const { payload, destinations } = await prepare({ jobId: String(++this.sequence), signal: controller.signal });
			const shared = freezePayload(payload);
			for (const destination of destinations) {
				if (controller.signal.aborted) {
					results.push({
						id: destination.id,
						status: "cancelled",
						message: "Not started because export was cancelled.",
					});
					continue;
				}
				try {
					results.push(await destination.export(shared));
				} catch (error) {
					results.push({
						id: destination.id,
						status: error instanceof ExportCancelled ? "cancelled" : "failure",
						message:
							error instanceof ExportCancelled
								? error.message
								: "The destination failed. Already-started effects may have completed.",
					});
				}
			}
			if (!destinations.length)
				results.push({
					id: "export",
					status: "skipped",
					message: "No export destinations are enabled in this profile.",
				});
		} catch (error) {
			results.push({
				id: "preparation",
				status: error instanceof ExportCancelled || controller.signal.aborted ? "cancelled" : "failure",
				message: controller.signal.aborted
					? "Export cancelled before delivery."
					: "Could not prepare the note. Check local images, cleanup rules, and custom JavaScript.",
			});
		} finally {
			try {
				cleanup();
			} catch {
				results.push({
					id: "cleanup",
					status: "failure",
					message: "A render component could not finish cleanup. Completed destination results are retained.",
				});
			} finally {
				this.active = undefined;
			}
		}
		return results;
	}
}
