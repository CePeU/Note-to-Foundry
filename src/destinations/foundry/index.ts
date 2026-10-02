import {
	checkCancelled,
	DestinationContext,
	DestinationResult,
	ExportCancelled,
	ExportDestination,
	ExportPayload,
} from "../../export/types";
import { RelayClient } from "../../relay/client";
import { record, RelayError, RelayTransport } from "../../relay/types";
import { FoundryContext } from "./context";
import { FoundryConfig } from "./types";
import { UploadAssets } from "./assets";
import { savePage } from "./pages";
import { writeBack } from "./frontmatter";
import { LINK_UPDATE_CODE } from "./scripts";

export class FoundryDestination implements ExportDestination<FoundryConfig> {
	readonly id = "foundry";
	constructor(private transport: RelayTransport) {}
	async export(
		payload: ExportPayload,
		{ config, host, signal }: DestinationContext<FoundryConfig>
	): Promise<DestinationResult> {
		if (payload.mode === "raw")
			return { id: this.id, status: "skipped", message: "Foundry export is disabled for raw HTML." };
		let context: FoundryContext | undefined, outputIdentity: string | undefined;
		let result: DestinationResult = { id: this.id, status: "failure", message: "Foundry export failed." };
		try {
			checkCancelled(signal);
			context = new FoundryContext(
				config,
				new RelayClient(
					{ baseUrl: config.profile.foundryRelayServer, apiKey: config.profile.foundryApiKey },
					this.transport,
					host.diagnostics
				),
				signal
			);
			await context.initialize(!config.profile.encodePictures && payload.assets.length > 0);
			const html = await UploadAssets(context, payload, host);
			const [header, footer] = config.profile.footerAndHeader.foundryHTML;
			const saved = await savePage(context, payload, header + html + footer);
			outputIdentity = saved.uuid;
			// A completed remote page write owns its local identity writeback even if
			// cancellation arrives while the remote request is in flight.
			await writeBack(host, config.profile, config.target, saved.pageId, saved.created);
			if (config.profile.foundryMacroLinkingRun) {
				checkCancelled(signal);
				await context.endpoints.executeJs(LINK_UPDATE_CODE, value => {
					if (record(value, "linking").success !== true)
						throw new RelayError("Link repair was not confirmed.", "response");
				});
			}
			result = { id: this.id, status: "success", message: "Foundry page saved.", outputIdentity };
		} catch (error) {
			result = {
				id: this.id,
				status: error instanceof ExportCancelled ? "cancelled" : "failure",
				outputIdentity,
				message:
					(outputIdentity ? "The Foundry page was saved, but a following step did not finish. " : "") +
					(error instanceof RelayError || error instanceof ExportCancelled
						? error.message
						: "Check the destination and local note write permissions. Already-started remote effects may have completed."),
			};
		} finally {
			try {
				await context?.close();
			} catch {
				result = {
					...result,
					status: "failure",
					message:
						result.message + " The owned headless session could not be closed. Check sessions in the relay dashboard.",
				};
			}
		}
		return result;
	}
}
