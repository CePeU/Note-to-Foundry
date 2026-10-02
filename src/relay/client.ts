import { RelayConfig, RelayError, RelayTransport, RequestOptions } from "./types";
import { DiagnosticSink, requestDetails } from "./diagnostics";

let requestSequence = 0;

export function relayBaseUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new RelayError("Enter a valid relay URL.", "response");
	}
	if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
		throw new RelayError(
			"Relay URL must use HTTP(S), without credentials, query parameters or a fragment.",
			"response"
		);
	}
	url.pathname = url.pathname.replace(/\/+$/, "") + "/";
	return url;
}

/** Errors stay user-safe; optional diagnostics contain only sanitized request context. */
export class RelayClient {
	readonly baseUrl: string;
	private readonly apiKey: string;
	constructor(
		config: RelayConfig,
		private transport: RelayTransport,
		private diagnostics: DiagnosticSink = () => {}
	) {
		this.baseUrl = relayBaseUrl(config.baseUrl).toString();
		this.apiKey = config.apiKey?.trim() ?? "";
	}
	url(path: string, query: RequestOptions["query"] = {}): string {
		const url = new URL(path.replace(/^\/+/, ""), this.baseUrl);
		if (url.origin !== new URL(this.baseUrl).origin || !url.pathname.startsWith(new URL(this.baseUrl).pathname)) {
			throw new RelayError("Invalid relay endpoint path.", "response");
		}
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
		}
		return url.toString();
	}
	async request(path: string, options: RequestOptions = {}): Promise<unknown> {
		const requestId = ++requestSequence;
		try { return await this.perform(path, options); }
		catch (error) {
			const failure = error instanceof RelayError ? error : new RelayError("The relay request could not be prepared.", "response");
			try {
				this.diagnostics({ event: "relay-failure", severity: "error", details: {
					requestId, status: failure.status, category: failure.kind,
					request: requestDetails(this.baseUrl, path, options, [this.apiKey]),
				} });
			} catch { /* Diagnostic errors cannot mask the request failure. */ }
			throw failure;
		}
	}
	private async perform(path: string, options: RequestOptions): Promise<unknown> {
		const method = options.method ?? "GET";
		const headers: Record<string, string> = { ...options.headers };
		if (!options.public) {
			if (!this.apiKey) throw new RelayError("Configure a scoped API key before contacting Foundry.", "auth");
			headers["x-api-key"] = this.apiKey;
		}
		let body: string | ArrayBuffer | undefined;
		if (options.json !== undefined) {
			body = JSON.stringify(options.json);
			headers["Content-Type"] = "application/json";
		}
		if (options.binary !== undefined) {
			body = options.binary;
			headers["Content-Type"] = "application/octet-stream";
		}
		const url = this.url(path, options.query);
		let response;
		try {
			response = await this.transport({ url, method, headers, body, throw: false });
		} catch {
			throw new RelayError(
				method === "GET"
					? "Could not reach the relay. Check the URL and connection."
					: "Relay request did not finish. The remote operation may have completed; check Foundry before retrying.",
				"transport"
			);
		}
		const status = response.status;
		if (status < 200 || status >= 300) {
			if (status === 401)
				throw new RelayError(
					"The scoped key is invalid, expired or disabled. Request or paste a new key.",
					"auth",
					status
				);
			if (status === 403)
				throw new RelayError(
					"The scoped key or Foundry user lacks permission for this operation. Check scopes, client binding and GM access.",
					"permission",
					status
				);
			if (status === 429)
				throw new RelayError("The relay rate limit was reached. Wait before retrying.", "rate-limit", status);
			throw new RelayError(
				`Relay request failed (HTTP ${status}). Check the target client and configuration.`,
				"remote",
				status
			);
		}
		if (status === 204 || response.text === "") return undefined;
		let data: unknown;
		try {
			data = JSON.parse(response.text);
		} catch {
			throw new RelayError("The relay returned invalid JSON.", "response", status);
		}
		if (data && typeof data === "object" && !Array.isArray(data)) {
			const envelope = data as Record<string, unknown>;
			if (
				envelope.success === false ||
				(envelope.error !== undefined && envelope.error !== null && envelope.error !== false && envelope.error !== "")
			) {
				throw new RelayError(
					"Foundry rejected the operation. Check its permissions and module console.",
					"remote",
					status
				);
			}
		}
		return data;
	}
}
