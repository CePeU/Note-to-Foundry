import { copyFile, lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Only these build artifacts may enter the installable directory. Never copy
// the workspace wholesale: it can contain real profiles and credentials.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (manifest.id !== "notetofoundry" || pkg.name.toLowerCase() !== manifest.id || pkg.version !== manifest.version) {
	throw new Error("Plugin identity/version mismatch. Correct metadata before packaging.");
}
const files = new Map([
	["main.js", "dist/main.js"],
	["manifest.json", "manifest.json"],
	["styles.css", "dist/styles.css"],
	["secret.svg", "src/styles/secret.svg"],
]);
const stage = join(root, "dist", "release", manifest.id);
async function requireDirectory(path) {
	await mkdir(path, { recursive: true });
	const stat = await lstat(path);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Package directory must be an ordinary local directory.");
}
await requireDirectory(join(root, "dist"));
await requireDirectory(join(root, "dist", "release"));
await requireDirectory(stage);
for (const entry of await readdir(stage, { withFileTypes: true })) {
	if (!files.has(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
		throw new Error("Unexpected staged file. Inspect dist/release/notetofoundry before packaging again.");
	}
}
// Validate all inputs before replacing any previously staged artifact.
for (const source of files.values()) {
	const stat = await lstat(join(root, source));
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error(`Missing or invalid build artifact: ${source}`);
}
for (const [name, source] of files) await copyFile(join(root, source), join(stage, name));
console.log(`Staged ${manifest.id} ${manifest.version}: ${[...files.keys()].join(", ")}`);
