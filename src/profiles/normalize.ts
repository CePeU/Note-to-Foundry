import { VERSION_CONSTANTS } from "../versionConstant";
import { cloneProfile, createDefaultProfile, createDefaultProfiles } from "./defaults";
import type { NoteToFoundrySettings, ProfileSettings } from "./types";

const reserved = new Set(["__proto__", "prototype", "constructor"]);
export class ProfileValidationError extends Error {}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	);
}

export function validateName(value: string): string {
	const name = value.trim();
	if (!name || /[\x00-\x1f\x7f]/.test(name) || reserved.has(name)) {
		throw new ProfileValidationError(
			"Enter a nonempty profile name without control characters or reserved object keys."
		);
	}
	return name;
}

export function assertSafeKeys(value: unknown, path = "profile"): void {
	if (!value || typeof value !== "object") return;
	for (const key of Object.keys(value)) {
		if (reserved.has(key)) throw new ProfileValidationError(`Reserved field at ${path}.`);
		assertSafeKeys((value as Record<string, unknown>)[key], `${path}.${key}`);
	}
}

export interface NormalizeOptions {
	allowUnknown?: boolean;
	warnings?: string[];
}

function normalizeValue(value: unknown, fallback: unknown, path: string, options: NormalizeOptions): unknown {
	if (value === undefined) return cloneProfile(fallback);
	if (path === "settings.foundryAuthMetadata") {
		if (value === null) return null;
		if (
			!isRecord(value) ||
			Object.keys(value).some(key => !["grantedScopes", "clientIds"].includes(key)) ||
			![value.grantedScopes, value.clientIds].every(
				list => Array.isArray(list) && list.every(item => typeof item === "string")
			)
		) {
			throw new ProfileValidationError("Invalid scoped-key metadata.");
		}
		return cloneProfile(value);
	}
	if (path === "settings.foundryHeadlessCredentialMode" && value !== "explicit" && value !== "stored") {
		throw new ProfileValidationError("Invalid headless credential mode.");
	}
	if (Array.isArray(fallback)) {
		if (!Array.isArray(value)) throw new ProfileValidationError(`Expected an array at ${path}.`);
		if (Array.isArray(fallback[0])) {
			if (
				!value.every(
					row => Array.isArray(row) && row.length >= 2 && row.length <= 3 && row.every(cell => typeof cell === "string")
				)
			) {
				throw new ProfileValidationError(`Expected rule rows with two or three text columns at ${path}.`);
			}
		} else if (
			!value.every(item => typeof item === "string") ||
			(path.includes("footerAndHeader.") && value.length !== 2)
		) {
			throw new ProfileValidationError(
				`Expected ${path.includes("footerAndHeader.") ? "a header/footer pair" : "text entries"} at ${path}.`
			);
		}
		return cloneProfile(value);
	}
	if (isRecord(fallback)) {
		if (!isRecord(value)) throw new ProfileValidationError(`Expected an object at ${path}.`);
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(value)) {
			if (!Object.prototype.hasOwnProperty.call(fallback, key)) {
				if (!options.allowUnknown) throw new ProfileValidationError(`Unsupported field at ${path}.${key}.`);
				options.warnings?.push(`${path}.${key}`);
			}
		}
		for (const key of Object.keys(fallback))
			result[key] = normalizeValue(value[key], fallback[key], `${path}.${key}`, options);
		return result;
	}
	if (typeof value !== typeof fallback || (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))) {
		throw new ProfileValidationError(`Invalid value type at ${path}.`);
	}
	return value;
}

export function normalizeProfile(input: unknown, options: NormalizeOptions = {}): NoteToFoundrySettings {
	assertSafeKeys(input);
	if (!isRecord(input)) throw new ProfileValidationError("Expected a profile settings object.");
	const profile = normalizeValue(input, createDefaultProfile(), "settings", options) as NoteToFoundrySettings;
	for (const component of ["MAJOR", "MINOR", "PATCH"] as const) {
		if (profile.profileVersion[component] > VERSION_CONSTANTS[component]) {
			throw new ProfileValidationError("This profile was saved by a newer plugin version.");
		}
		if (profile.profileVersion[component] < VERSION_CONSTANTS[component]) break;
	}
	profile.profileVersion = { ...VERSION_CONSTANTS };
	if (/^https:\/\/foundryvtt-rest-api-relay\.fly\.dev\/?$/.test(profile.foundryRelayServer.trim())) {
		profile.foundryRelayServer = "https://foundryrestapi.com";
		profile.foundryAuthMetadata = null;
	}
	return profile;
}

export interface ProfileState {
	profiles: ProfileSettings;
	activeName: string;
}

export function normalizeCollection(input: unknown): ProfileState {
	if (input === null || input === undefined || (isRecord(input) && !Object.keys(input).length)) {
		return { profiles: createDefaultProfiles(), activeName: "default" };
	}
	assertSafeKeys(input);
	if (!isRecord(input)) throw new ProfileValidationError("Stored profiles must be a collection of named settings.");
	const profiles: ProfileSettings = {};
	for (const originalName of Object.keys(input)) {
		const name = validateName(originalName);
		if (Object.prototype.hasOwnProperty.call(profiles, name))
			throw new ProfileValidationError("Profile names collide after trimming.");
		profiles[name] = normalizeProfile(input[originalName]);
	}
	const names = Object.keys(profiles).sort();
	const active = Object.keys(input)
		.filter(name => isRecord(input[name]) && input[name].isActiveProfile === true)
		.map(name => name.trim());
	const activeName = active.length === 1 ? active[0] : names.includes("default") ? "default" : names[0];
	for (const name of names) profiles[name].isActiveProfile = name === activeName;
	return { profiles, activeName };
}
