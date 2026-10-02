import { randomBytes } from "crypto";

/** Synchronous compatibility API for custom scripts and generated callout IDs. */
export function allocateIdentity(): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	while (result.length < 16)
		for (const byte of randomBytes(24)) {
			if (byte < 248) result += alphabet[byte % alphabet.length];
			if (result.length === 16) break;
		}
	return result;
}
export interface IdentityHost {
	readIdentity(path: string): string | undefined;
	update(path: string, change: (frontmatter: Record<string, unknown>) => void): Promise<void>;
}
export class NoteIdentities {
	private pending = new Map<string, Promise<string>>();
	constructor(private host: IdentityHost) {}
	ensure(path: string): Promise<string> {
		const pending = this.pending.get(path);
		if (pending) return pending;
		const operation = this.ensurePersisted(path);
		this.pending.set(path, operation);
		void operation.then(
			() => this.pending.delete(path),
			() => this.pending.delete(path)
		);
		return operation;
	}
	private async ensurePersisted(path: string): Promise<string> {
		let identity = this.host.readIdentity(path);
		if (identity) return identity;
		await this.host.update(path, frontmatter => {
			// Recheck under the host's frontmatter edit, after any concurrent edit.
			identity = typeof frontmatter.UUID === "string" && frontmatter.UUID ? frontmatter.UUID : allocateIdentity();
			frontmatter.UUID = identity;
		});
		return identity!;
	}
}
