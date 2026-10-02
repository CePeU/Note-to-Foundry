import { checkCancelled } from "../../export/types";
import { record, RelayError, stringField } from "../../relay/types";
import { FoundryContext } from "./context";

export function folderScript(name: string, parentId: string): string {
	const data = JSON.stringify({ name, type: "JournalEntry", folder: parentId === "root" ? null : parentId });
	return `const folder = await Folder.create(${data}); if (!folder?.id) throw new Error("Folder creation failed"); return { id: folder.id };`;
}
export async function ensureFolder(context: FoundryContext, path: string): Promise<string> {
	let parent = "root",
		currentPath = "";
	for (const name of path.split("/").filter(Boolean)) {
		checkCancelled(context.signal);
		const matches = context.folders.filter(
			folder => folder.type === "JournalEntry" && folder.parent === parent && folder.name === name
		);
		if (matches.length > 1)
			throw new RelayError(
				"Duplicate journal folders match the destination. Rename them or choose an unambiguous folder.",
				"remote"
			);
		currentPath = currentPath ? `${currentPath}/${name}` : name;
		if (matches.length) parent = matches[0].id;
		else {
			const id = await context.endpoints.executeJs(folderScript(name, parent), value =>
				stringField(record(value, "created folder").id, "folder ID")
			);
			context.folders.push({ id, name, type: "JournalEntry", parent, fullFolderPath: currentPath });
			parent = id;
		}
	}
	return parent;
}
