export interface RelayConfig {
	baseUrl: string;
	apiKey?: string;
}
export interface TransportRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string | ArrayBuffer;
	throw: false;
}
export interface TransportResponse {
	status: number;
	text: string;
	headers?: Record<string, string>;
}
export type RelayTransport = (request: TransportRequest) => Promise<TransportResponse>;
export interface RequestOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE";
	query?: Record<string, string | number | boolean | undefined>;
	json?: unknown;
	binary?: ArrayBuffer;
	headers?: Record<string, string>;
	public?: boolean;
}
export class RelayError extends Error {
	constructor(
		message: string,
		public readonly kind: "auth" | "permission" | "rate-limit" | "transport" | "response" | "remote",
		public readonly status?: number
	) {
		super(message);
		this.name = "RelayError";
	}
}
export function record(value: unknown, operation: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new RelayError(`Unexpected ${operation} response.`, "response");
	return value as Record<string, unknown>;
}
export function stringField(value: unknown, operation: string): string {
	if (typeof value !== "string" || !value.trim())
		throw new RelayError(`Missing ${operation} in relay response.`, "response");
	return value;
}
export function stringArray(value: unknown, operation: string): string[] {
	if (!Array.isArray(value) || !value.every(item => typeof item === "string"))
		throw new RelayError(`Invalid ${operation} in relay response.`, "response");
	return [...value];
}
