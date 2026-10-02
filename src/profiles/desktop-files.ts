import { promises as fs } from "fs";
import { basename, dirname, extname, isAbsolute, join } from "path";
import { randomBytes } from "crypto";

const MAX_PROFILE_BYTES = 10 * 1024 * 1024;
export function profileFilePath(value: string): string {
	const path = value.trim().replace(/^"(.*)"$/, "$1");
	if (!isAbsolute(path) || path.includes("\0") || extname(path).toLowerCase() !== ".json")
		throw new Error("Enter a full local file path ending in .json.");
	return path;
}
async function existingFile(path: string): Promise<boolean> {
	try {
		const stat = await fs.lstat(path);
		if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Choose a regular JSON file, not a directory or symbolic link.");
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}
export async function readProfileFile(value: string): Promise<{ text: string; name: string }> {
	const path = profileFilePath(value);
	try {
		if (!await existingFile(path)) throw new Error("missing");
		const file = await fs.open(path, "r");
		try {
			if ((await file.stat()).size > MAX_PROFILE_BYTES) throw new Error("large");
			const text = await file.readFile("utf8");
			if (Buffer.byteLength(text, "utf8") > MAX_PROFILE_BYTES) throw new Error("large");
			return { text, name: basename(path) };
		} finally { await file.close(); }
	} catch { throw new Error("Could not read the JSON file. Check the path, permissions, and 10 MB size limit."); }
}
export async function saveProfileFile(value: string, text: string, overwrite: boolean, signal?: AbortSignal): Promise<"saved" | "cancelled"> {
	const path = profileFilePath(value);
	if (signal?.aborted) return "cancelled";
	const exists = await existingFile(path);
	if (exists && !overwrite) throw new Error("That file already exists. Enable Replace existing file or choose another path.");
	const temporary = join(dirname(path), `.${basename(path)}.${randomBytes(12).toString("hex")}.tmp`);
	let owned = false;
	try {
		const file = await fs.open(temporary, "wx", 0o600);
		owned = true;
		try { await file.writeFile(text, "utf8"); await file.sync(); }
		finally { await file.close(); }
		if (signal?.aborted) return "cancelled";
		if (overwrite) {
			await existingFile(path);
			if (signal?.aborted) return "cancelled";
			await fs.rename(temporary, path);
			owned = false;
		} else {
			// Publish without replacing a file that appeared since the initial check.
			await fs.link(temporary, path);
		}
		return "saved";
	} catch { throw new Error("The JSON file could not be saved. Check the folder, permissions, and overwrite choice. No download was started."); }
	finally {
		if (owned) await fs.unlink(temporary).catch(() => { /* Only our temporary file may need manual cleanup. */ });
	}
}
