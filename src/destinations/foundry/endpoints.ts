import { RelayClient } from "../../relay/client";
import { record, RelayError, stringField } from "../../relay/types";

export interface RelayWorld {
	clientId: string;
	worldTitle: string;
	customName: string;
	isOnline?: boolean;
}
export interface RemoteFile {
	name: string;
	path: string;
	type?: string;
}

export class FoundryEndpoints {
	constructor(
		readonly client: RelayClient,
		readonly clientId?: string
	) {}
	async clients(): Promise<RelayWorld[]> {
		const response = record(await this.client.request("/clients"), "client list");
		if (!Array.isArray(response.clients)) throw new RelayError("Missing client list in relay response.", "response");
		return response.clients.map(value => {
			const entry = record(value, "client");
			if (entry.isOnline !== undefined && typeof entry.isOnline !== "boolean")
				throw new RelayError("Invalid client online status.", "response");
			return {
				clientId: stringField(entry.clientId ?? entry.id, "client ID"),
				worldTitle: typeof entry.worldTitle === "string" ? entry.worldTitle : "Foundry world",
				customName: typeof entry.customName === "string" ? entry.customName : "",
				isOnline: entry.isOnline as boolean | undefined,
			};
		});
	}
	async executeJs<T>(script: string, decode: (result: unknown) => T): Promise<T> {
		const response = record(
			await this.client.request("/execute-js", {
				method: "POST",
				query: { clientId: this.clientId },
				json: { script },
			}),
			"execute-js"
		);
		if (response.success !== true || !Object.prototype.hasOwnProperty.call(response, "result"))
			throw new RelayError("Incomplete execute-js result. No mutation was retried.", "response");
		return decode(response.result);
	}
	async createJournal(name: string, folderId?: string): Promise<string> {
		const response = record(
			await this.client.request("/create", {
				method: "POST",
				query: { clientId: this.clientId },
				json: {
					entityType: "JournalEntry",
					...(folderId ? { folder: `Folder.${folderId}` } : {}),
					data: { name, pages: [] },
				},
			}),
			"journal creation"
		);
		const uuid = stringField(response.uuid, "created journal UUID");
		if (!/^JournalEntry\.[^.]+$/.test(uuid)) throw new RelayError("Unexpected created journal UUID.", "response");
		return uuid.split(".")[1];
	}
	async updateJournal(journalId: string, pages: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
		const response = record(
			await this.client.request("/update", {
				method: "PUT",
				query: { clientId: this.clientId, uuid: `JournalEntry.${journalId}`, selected: false },
				json: { data: { pages } },
			}),
			"journal update"
		);
		// Confirmed in the REST module's entity router; live world validation remains separate.
		if (!Array.isArray(response.entity) || !response.entity.length)
			throw new RelayError("Missing updated journal in relay response.", "response");
		const entity = record(response.entity[0], "updated journal");
		if (!Array.isArray(entity.pages)) throw new RelayError("Missing pages in updated journal response.", "response");
		return entity.pages.map(page => record(page, "updated page"));
	}
	async files(path = "/"): Promise<RemoteFile[]> {
		const response = record(
			await this.client.request("/file-system", {
				query: { clientId: this.clientId, source: "data", path, recursive: true },
			}),
			"file list"
		);
		if (!Array.isArray(response.results)) throw new RelayError("Missing file inventory in relay response.", "response");
		return response.results.map(value => {
			const file = record(value, "file");
			return {
				name: stringField(file.name, "file name"),
				path: stringField(file.path, "file path"),
				type: typeof file.type === "string" ? file.type : undefined,
			};
		});
	}
	/**
	 * Uploads captured image bytes using the relay's JSON file upload contract.
	 * @param directoryPath Directory relative to Foundry's data source.
	 * @param imageFilename Filename including its content hash and extension.
	 * @param imageBinary Captured image bytes as an ArrayBuffer.
	 * @param requestedMimeType Optional MIME type; defaults to application/octet-stream.
	 * @returns The remote path confirmed by the relay.
	 */
	async UploadAsset(directoryPath: string, imageFilename: string, imageBinary: ArrayBuffer, requestedMimeType?: string): Promise<string> {
		let mediaType = "application/octet-stream";
		if (requestedMimeType !== undefined && requestedMimeType.trim() !== "") {
			mediaType = requestedMimeType;
		}
		// The relay's JSON upload contract carries a data URI through to Foundry's file upload handler.
		const uploadResponse = record(
			await this.client.request("/upload", {
				method: "POST",
				query: { clientId: this.clientId, source: "data", path: directoryPath, filename: imageFilename },
				json: {
					fileData: `data:${mediaType};base64,${Buffer.from(imageBinary).toString("base64")}`,
					mimeType: mediaType,
					overwrite: true,
				},
			}),
			"upload"
		);
		if (uploadResponse.success !== true) throw new RelayError("The upload was not confirmed.", "response");
		return stringField(uploadResponse.path, "uploaded path");
	}
}

export async function resolveClient(
	endpoints: FoundryEndpoints,
	explicit: string,
	allowed?: readonly string[]
): Promise<string> {
	if (explicit) {
		if (allowed?.length && !allowed.includes(explicit))
			throw new RelayError("This key does not allow the configured client. Select an allowed client.", "permission");
		return explicit;
	}
	if (allowed?.length === 1) return allowed[0];
	const clients = (await endpoints.clients()).filter(
		client => client.isOnline !== false && (!allowed?.length || allowed.includes(client.clientId))
	);
	if (!clients.length)
		throw new RelayError("No allowed Foundry client is online. Connect a world or start a headless session.", "remote");
	if (clients.length !== 1)
		throw new RelayError("Several Foundry clients are online. Select the target client in this profile.", "remote");
	return clients[0].clientId;
}
