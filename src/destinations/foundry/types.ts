import type { NoteToFoundrySettings } from "../../profiles/types";
export interface FoundryTarget {
	folder: string;
	journal: string;
	title: string;
	pageId: string;
	isPage: boolean;
	picturePath: string;
}
export interface FoundryConfig {
	profile: NoteToFoundrySettings;
	target: FoundryTarget;
}
export interface FoundryFolder {
	id: string;
	name: string;
	parent: string;
	type: string;
	fullFolderPath: string;
}
export interface FoundryPage {
	pageId: string;
	pageName: string;
	journalId: string;
	flag: Record<string, unknown>;
}
export interface FoundryJournal {
	journalId: string;
	journalName: string;
	folderId: string;
	fullFolderPath: string;
	pages: FoundryPage[];
}
