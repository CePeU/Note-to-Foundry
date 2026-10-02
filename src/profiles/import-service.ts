import { cloneProfile } from "./defaults";
import { ImportCandidate } from "./io";
import { validateName } from "./normalize";
import { ProfileOrigin, ProfileRepository } from "./repository";

export function suggestImportName(name: string, repository: ProfileRepository): string {
	if (!repository.has(name)) return name;
	let suggestion = `${name} imported`,
		suffix = 2;
	while (repository.has(suggestion)) suggestion = `${name} imported ${suffix++}`;
	return suggestion;
}
export interface ImportReview {
	candidate: ImportCandidate;
	name: string;
	overwrite: boolean;
	activate: boolean;
	expected?: ProfileOrigin;
	isValid?: () => boolean;
}
export async function commitImport(repository: ProfileRepository, review: ImportReview): Promise<string> {
	const name = validateName(review.name);
	const settings = cloneProfile(review.candidate.settings);
	settings.foundryAuthMetadata = null;
	await repository.importProfile(name, settings, review.overwrite, review.activate, review.expected, review.isValid);
	return name;
}
