import { constants, publicEncrypt } from "crypto";
import type { NoteToFoundrySettings } from "../../profiles/types";
import { RelayClient } from "../../relay/client";
import { record, RelayError, stringField } from "../../relay/types";
import { checkCancelled } from "../../export/types";

export function encryptPassword(publicKey: string, password: string, nonce: string): string {
	try {
		return publicEncrypt(
			{ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
			Buffer.from(JSON.stringify({ password, nonce }))
		).toString("base64");
	} catch {
		throw new RelayError("Could not encrypt the Foundry password with the relay handshake key.", "response");
	}
}
export interface OwnedSession {
	sessionId: string;
	clientId: string;
	close(): Promise<void>;
}

export async function startSession(
	client: RelayClient,
	profile: NoteToFoundrySettings,
	signal?: AbortSignal
): Promise<OwnedSession> {
	if (signal) checkCancelled(signal);
	let json: unknown;
	if (profile.foundryHeadlessCredentialMode === "explicit") {
		let foundryUrl: URL;
		try {
			foundryUrl = new URL(profile.foundryIP);
		} catch {
			throw new RelayError("Set the Foundry URL for explicit headless login.", "response");
		}
		if (
			!["https:", "http:"].includes(foundryUrl.protocol) ||
			foundryUrl.username ||
			foundryUrl.password ||
			!profile.foundryUser.trim()
		)
			throw new RelayError("Explicit headless login needs a Foundry HTTP(S) URL and username.", "response");
		const handshake = record(
			await client.request("/session-handshake", {
				method: "POST",
				headers: {
					"x-foundry-url": foundryUrl.toString(),
					"x-username": profile.foundryUser,
					...(profile.foundryWorld ? { "x-world-name": profile.foundryWorld } : {}),
				},
			}),
			"session handshake"
		);
		json = {
			handshakeToken: stringField(handshake.token, "handshake token"),
			encryptedPassword: encryptPassword(
				stringField(handshake.publicKey, "public key"),
				profile.foundryPW,
				stringField(handshake.nonce, "nonce")
			),
		};
	}
	if (signal) checkCancelled(signal);
	const response = record(
		await client.request("/start-session", { method: "POST", ...(json === undefined ? {} : { json }) }),
		"session start"
	);
	const sessionId = stringField(response.sessionId, "session ID");
	let clientId: string;
	try {
		clientId = stringField(response.clientId, "session client ID");
	} catch (error) {
		try {
			await client.request("/end-session", { method: "DELETE", query: { sessionId } });
		} catch {
			throw new RelayError(
				"Session start returned no client ID and its session could not be closed. Check sessions in the relay dashboard.",
				"response"
			);
		}
		throw error;
	}
	let closing: Promise<void> | undefined;
	return {
		sessionId,
		clientId,
		close: () => {
			if (!closing)
				closing = client.request("/end-session", { method: "DELETE", query: { sessionId } }).then(() => undefined);
			return closing;
		},
	};
}
