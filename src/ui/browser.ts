import { shell } from "electron";
export async function openApprovalUrl(url: string): Promise<void> {
	const parsed = new URL(url);
	if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
		throw new Error("Invalid approval URL.");
	const opened: unknown = await Promise.resolve(shell.openExternal(parsed.toString()));
	if (opened === false) throw new Error("The desktop browser could not be opened.");
}
