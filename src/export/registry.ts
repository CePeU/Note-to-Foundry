import type { ConfiguredDestination, DestinationContext, ExportDestination } from "./types";

/** Bind config with its matching adapter before entering generic coordination. */
export function configureDestination<T>(
	destination: ExportDestination<T>,
	context: DestinationContext<T>
): ConfiguredDestination {
	return { id: destination.id, export: payload => destination.export(payload, context) };
}
