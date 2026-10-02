import { checkCancelled, ExportPayload } from "../../export/types";
import { RelayError, stringField } from "../../relay/types";
import { FoundryContext } from "./context";
import { ensureFolder } from "./folders";
import { FoundryJournal, FoundryPage } from "./types";
import { FOUNDRY_FLAG_NAMESPACE } from "../../identity";

export function linkFlags(payload: ExportPayload): Record<string, unknown>[] {
	return payload.links.map(link => ({
		obsidianNoteUUID: payload.source.noteIdentity ?? "",
		linkPath: link.vaultPath,
		linkFileName: link.filename,
		linkText: link.text,
		linkDestinationUUID: link.noteIdentity ?? "",
		isAnkerLink: !!link.anchor,
		ankerLink: link.anchor,
		linkResolved: false,
	}));
}
export function pageData(
	payload: ExportPayload,
	title: string,
	html: string,
	pageId?: string
): Record<string, unknown> {
	return {
		name: title,
		type: "text",
		text: { content: html, format: 1 },
		...(pageId ? { _id: pageId } : {}),
		flags: {
			[FOUNDRY_FLAG_NAMESPACE]: {
				uuid: payload.source.noteIdentity ?? "",
				vault: "",
				filePath: payload.source.path,
				noteTitle: payload.source.basename,
				noteHash: "",
				cTime: payload.source.ctime,
				mTime: payload.source.mtime,
				uploadTime: Date.now(),
				journalLinks: linkFlags(payload),
				unresolvedLinks: payload.links.length,
			},
		},
		title: { show: true, level: 1 },
		ownership: { default: -1 },
	};
}
export async function savePage(
	context: FoundryContext,
	payload: ExportPayload,
	html: string
): Promise<{ pageId: string; uuid: string; created: boolean }> {
	const target = context.config.target;
	let journal: FoundryJournal | undefined, page: FoundryPage | undefined;
	if (target.pageId) {
		const matches = context.journals.flatMap(journal =>
			journal.pages
				.filter(
					page =>
						page.pageId === target.pageId ||
						`JournalEntry.${journal.journalId}.JournalEntryPage.${page.pageId}` === target.pageId
				)
				.map(page => ({ journal, page }))
		);
		if (matches.length !== 1)
			throw new RelayError(
				"VTT_UUID does not identify one page in this world. Correct or clear it before creating a page.",
				"remote"
			);
		({ journal, page } = matches[0]);
	}
	if (!journal) {
		const folderId = await ensureFolder(context, target.folder);
		const matches = context.journals.filter(item => item.folderId === folderId && item.journalName === target.journal);
		if (matches.length > 1)
			throw new RelayError(
				"Duplicate journals match the configured destination. Choose an unambiguous journal.",
				"remote"
			);
		journal = matches[0];
		if (!journal) {
			checkCancelled(context.signal);
			const journalId = await context.endpoints.createJournal(
				target.journal,
				folderId === "root" ? undefined : folderId
			);
			journal = { journalId, journalName: target.journal, folderId, fullFolderPath: target.folder, pages: [] };
			context.journals.push(journal);
		}
		const pages = journal.pages.filter(item => item.pageName === target.title);
		if (pages.length > 1)
			throw new RelayError(
				"Several pages have this title. Set VTT_UUID to the intended page before updating.",
				"remote"
			);
		page = pages[0];
	}
	checkCancelled(context.signal);
	const existingIds = new Set(journal.pages.map(item => item.pageId));
	const updated = await context.endpoints.updateJournal(journal.journalId, [
		pageData(payload, target.title, html, page?.pageId),
	]);
	const result = page
		? updated.filter(item => item._id === page!.pageId)
		: updated.filter(item => typeof item._id === "string" && !existingIds.has(item._id) && item.name === target.title);
	if (result.length !== 1)
		throw new RelayError(
			"The page write returned an ambiguous result. Inspect Foundry before trying again.",
			"response"
		);
	// Confirm the response did not drop sibling pages; never retry a write automatically.
	if (journal.pages.some(item => !updated.some(row => row._id === item.pageId)))
		throw new RelayError(
			"The journal response is missing existing pages. Inspect Foundry before further writes.",
			"response"
		);
	const pageId = stringField(result[0]._id, "saved page ID");
	return { pageId, uuid: `JournalEntry.${journal.journalId}.JournalEntryPage.${pageId}`, created: !page };
}
