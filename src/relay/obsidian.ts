import { requestUrl } from "obsidian";
import type { RelayTransport } from "./types";
export const obsidianTransport: RelayTransport = async request => {
	const response = await requestUrl(request);
	return { status: response.status, text: response.text, headers: response.headers };
};
