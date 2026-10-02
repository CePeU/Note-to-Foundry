import { VERSION_STRING } from "../versionConstant";
import { createDefaultProfile } from "./defaults";
import { assertSafeKeys, isRecord, normalizeProfile, ProfileValidationError, validateName } from "./normalize";
import type { NoteToFoundrySettings } from "./types";
import { LEGACY_PROFILE_SCHEMA, PROFILE_SCHEMA } from "../identity";

export const SECRET_FIELDS = ["foundryApiKey", "foundryPW"] as const;
export interface ProfileFileV1 {
	schema: typeof PROFILE_SCHEMA | typeof LEGACY_PROFILE_SCHEMA;
	schemaVersion: 1;
	name: string;
	pluginVersion?: string;
	exportedAt?: string;
	secrets: { included: boolean; omittedFields: string[] };
	settings: Partial<NoteToFoundrySettings>;
}
export interface ImportCandidate {
	name: string;
	settings: NoteToFoundrySettings;
	includesSecrets: boolean;
	warnings: string[];
}

export function serializeProfile(name: string, snapshot: NoteToFoundrySettings, includeSecrets = false): string {
	const settings: Partial<NoteToFoundrySettings> = normalizeProfile(snapshot);
	delete settings.isActiveProfile;
	delete settings.foundryAuthMetadata;
	if (!includeSecrets) for (const key of SECRET_FIELDS) delete settings[key];
	const file: ProfileFileV1 = {
		schema: PROFILE_SCHEMA,
		schemaVersion: 1,
		name: validateName(name),
		pluginVersion: VERSION_STRING,
		exportedAt: new Date().toISOString(),
		secrets: { included: includeSecrets, omittedFields: includeSecrets ? [] : [...SECRET_FIELDS] },
		settings,
	};
	return JSON.stringify(file, null, 2) + "\n";
}

function candidate(name: string, raw: unknown, included?: boolean, warnings: string[] = []): ImportCandidate {
	if (!isRecord(raw)) throw new ProfileValidationError("Expected profile settings.");
	const includesSecrets = included ?? SECRET_FIELDS.some(key => typeof raw[key] === "string" && raw[key] !== "");
	if (included === false && SECRET_FIELDS.some(key => raw[key] !== undefined && raw[key] !== ""))
		throw new ProfileValidationError("Secret metadata contradicts the settings.");
	const settings = normalizeProfile(raw, { allowUnknown: true, warnings });
	settings.isActiveProfile = false;
	settings.foundryAuthMetadata = null;
	// Defaults and the current profile must never supply credentials to an import.
	for (const key of SECRET_FIELDS) settings[key] = typeof raw[key] === "string" ? (raw[key] as string) : "";
	return { name: validateName(name), settings, includesSecrets, warnings };
}

export function parseProfileFile(text: string, filename: string): ImportCandidate[] {
	let input: unknown;
	try {
		input = JSON.parse(text);
	} catch {
		throw new ProfileValidationError("The selected file is not valid JSON.");
	}
	assertSafeKeys(input);
	if (!isRecord(input) || !Object.keys(input).length)
		throw new ProfileValidationError("The file does not contain a profile.");
	if (Object.prototype.hasOwnProperty.call(input, "schema")) {
		if ((input.schema !== PROFILE_SCHEMA && input.schema !== LEGACY_PROFILE_SCHEMA) || input.schemaVersion !== 1)
			throw new ProfileValidationError("Unsupported profile file format or version.");
		if (
			typeof input.name !== "string" ||
			!isRecord(input.secrets) ||
			typeof input.secrets.included !== "boolean" ||
			!Array.isArray(input.secrets.omittedFields)
		)
			throw new ProfileValidationError("Missing profile file metadata.");
		const omitted = input.secrets.omittedFields;
		const expected = input.secrets.included ? [] : [...SECRET_FIELDS];
		if (omitted.length !== expected.length || expected.some(key => !omitted.includes(key)))
			throw new ProfileValidationError("Invalid omitted-secret metadata.");
		for (const key of ["pluginVersion", "exportedAt"])
			if (input[key] !== undefined && typeof input[key] !== "string")
				throw new ProfileValidationError("Invalid profile file metadata.");
		const warnings = Object.keys(input).filter(
			key => !["schema", "schemaVersion", "name", "secrets", "settings", "pluginVersion", "exportedAt"].includes(key)
		);
		return [candidate(input.name, input.settings, input.secrets.included, warnings)];
	}
	const known = Object.keys(createDefaultProfile());
	if (Object.keys(input).some(key => known.includes(key) && !isRecord(input[key]))) {
		return [candidate(filename.replace(/\.[^.]*$/, ""), input)];
	}
	// A minimal legacy profile can consist solely of a nested settings object.
	if (
		["profileVersion", "footerAndHeader", "foundryFrontmatterWriteBack"].some(key =>
			Object.prototype.hasOwnProperty.call(input, key)
		)
	) {
		return [candidate(filename.replace(/\.[^.]*$/, ""), input)];
	}
	return Object.entries(input).map(([name, settings]) => candidate(name, settings));
}

export function suggestedFilename(name: string): string {
	let safe =
		name
			.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
			.replace(/[. ]+$/g, "")
			.slice(0, 120) || "profile";
	if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
	return `${safe}.json`;
}
