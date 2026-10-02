import { RelayClient } from "../../relay/client";
import { requireScopes } from "../../relay/auth";
import { record, RelayError, stringField } from "../../relay/types";
import { checkCancelled } from "../../export/types";
import { FoundryEndpoints, resolveClient } from "./endpoints";
import { OwnedSession, startSession } from "./sessions";
import { GET_ALL_FOLDERS_CODE, GET_ALL_JOURNALS_CODE } from "./scripts";
import { FoundryConfig, FoundryFolder, FoundryJournal } from "./types";

export class FoundryContext {
	endpoints: FoundryEndpoints;
	folders: FoundryFolder[] = [];
	journals: FoundryJournal[] = [];
	// Requested filesystem paths map to confirmed image URIs, which may already be encoded.
	readonly uploaded = new Map<string, string>();
	private session?: OwnedSession;
	constructor(
		readonly config: FoundryConfig,
		readonly client: RelayClient,
		readonly signal: AbortSignal
	) {
		this.endpoints = new FoundryEndpoints(client);
	}
	async initialize(needsAssets: boolean): Promise<void> {
		const profile = this.config.profile;
		checkCancelled(this.signal);
		requireScopes(profile, [
			"execute-js",
			"entity:write",
			...(needsAssets ? ["file:read", "file:write"] : []),
			...(profile.foundryHeadlessUsed ? ["session:manage"] : []),
		]);
		let clientId: string;
		if (profile.foundryHeadlessUsed) {
			this.session = await startSession(this.client, profile, this.signal);
			// Store ownership before checking cancellation so a late start is closed.
			clientId = this.session.clientId;
			if (profile.foundryAuthMetadata?.clientIds.length && !profile.foundryAuthMetadata.clientIds.includes(clientId))
				throw new RelayError("The started session is outside this key's client bindings.", "permission");
		} else {
			if (!profile.foundryClientId && profile.foundryAuthMetadata?.clientIds.length !== 1)
				requireScopes(profile, ["clients:read"]);
			clientId = await resolveClient(this.endpoints, profile.foundryClientId, profile.foundryAuthMetadata?.clientIds);
		}
		checkCancelled(this.signal);
		this.endpoints = new FoundryEndpoints(this.client, clientId);
		this.folders = await this.endpoints.executeJs(GET_ALL_FOLDERS_CODE, decodeFolders);
		checkCancelled(this.signal);
		this.journals = await this.endpoints.executeJs(GET_ALL_JOURNALS_CODE, decodeJournals);
		checkCancelled(this.signal);
		if (needsAssets === true) {
			for (let remoteFile of await this.endpoints.files()) {
				let filePath = remotePath(remoteFile.path);
				// Inventory entries are filesystem paths; encode them once when creating an image URI.
				this.uploaded.set(filePath, encodeURI(filePath));
			}
		}
		checkCancelled(this.signal);
	}
	async close(): Promise<void> {
		await this.session?.close();
	}
}
export function remotePath(value: string): string {
	return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
function list(value: unknown): unknown[] {
	if (!Array.isArray(value)) throw new RelayError("Expected a Foundry discovery list.", "response");
	return value;
}
export function decodeFolders(value: unknown): FoundryFolder[] {
	return list(value).map(item => {
		const row = record(item, "folder");
		return {
			id: stringField(row.id, "folder ID"),
			name: stringField(row.name, "folder name"),
			parent: typeof row.parent === "string" ? row.parent : "root",
			type: stringField(row.type, "folder type"),
			fullFolderPath: typeof row.fullFolderPath === "string" ? row.fullFolderPath : "",
		};
	});
}
export function decodeJournals(value: unknown): FoundryJournal[] {
	return list(value).map(item => {
		const row = record(item, "journal"),
			journalId = stringField(row.journalId, "journal ID");
		return {
			journalId,
			journalName: stringField(row.journalName, "journal name"),
			folderId: typeof row.folderId === "string" ? row.folderId : "root",
			fullFolderPath: typeof row.fullFolderPath === "string" ? row.fullFolderPath : "",
			pages: list(row.pages).map(item => {
				const page = record(item, "page");
				return {
					pageId: stringField(page.pageId, "page ID"),
					pageName: stringField(page.pageName, "page name"),
					journalId,
					flag: page.flag === undefined ? {} : record(page.flag, "page flags"),
				};
			}),
		};
	});
}
