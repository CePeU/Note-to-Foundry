export interface NoteToFoundrySettings {
	profileVersion: {
		MAJOR: number;
		MINOR: number;
		PATCH: number;
	};
	isDebugOutput: boolean;
	attributeList: string[];
	classList: string[];
	isActiveProfile: boolean;
	rulesForTags: string[][];
	rulesForRegex: string[][];
	jsCode: string;
	exportDirty: boolean;
	exportFile: boolean;
	isExportVaultPaths: boolean;
	htmlPictureExportFilePath: string;
	htmlPictureRelativeExportFilePath: string;
	exportClipboard: boolean;
	internalLinkResolution: boolean;
	htmlExportFilePath: string; //file path for hmtl export file
	htmlLinkPath: string;
	encodePictures: boolean; // Setting if image encoding shall take place
	removeFrontmatter: boolean; // Setting for removing frontmatter
	assetSaveRuleset: string[][]; // NOT implemented yet
	excludeFoldersByregex: string; //NOT implemented yet
	footerAndHeader: {
		clipboard: string[];
		fileHTML: string[];
		foundryHTML: string[];
	}; //setting for a footer and header which might include css to be added to html as last step
	exportFoundry: boolean; // flag for discerning if a foundry export shall take place
	foundryApiKey: string; // api key for foundry export
	foundryAuthMetadata: { grantedScopes: string[]; clientIds: string[] } | null;
	foundryHeadlessCredentialMode: "explicit" | "stored";
	foundryRelayServer: string; // ip or url for foundry relay server
	foundryHeadlessUsed: boolean;
	foundryUser: string;
	foundryPW: string; //
	foundryWorld: string;
	foundryIP: string;
	foundryClientId: string;
	foundrySettingsUsed: boolean; // flag if specific foundry export settings shall be used
	foundryFolder: string; //standard foundry export folder
	foundryJournal: string; //standard foundry Journal entry
	foundryPicturePath: string; // standard save path for pictures
	foundryMacroLinkingRun: boolean;
	ObsidianWriteFrontmatter: boolean; // flag for discerning if frontmatter entries shall be read and written back into obsidian pages
	foundryFrontmatterWriteBack: {
		isWriteBack: boolean;
		Folder: boolean;
		Journal: boolean;
		PageTitle: boolean;
		Page: boolean;
		PicturePath: boolean;
		UUID: boolean;
	};
}

export interface ProfileSettings {
	[profileName: string]: NoteToFoundrySettings;
}
