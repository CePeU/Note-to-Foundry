import { promises as fs } from "fs";
import * as path from "path";
import { randomBytes } from "crypto";

/** Write beside the target, then rename; never delete a previous output on failure. */
export async function atomicWrite(target: string, data: string | Uint8Array): Promise<void> {
	const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
	try {
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(temporary, data, { flag: "wx" });
		await fs.rename(temporary, target);
	} catch {
		try {
			await fs.unlink(temporary);
		} catch {
			/* a missing temporary is harmless */
		}
		throw new Error("The local output could not be written. Check its directory and permissions.");
	}
}
