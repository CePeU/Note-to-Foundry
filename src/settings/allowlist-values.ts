/** Preserve editing order and wildcard spelling; sorting is a tag-display concern. */
export function allowlistValues(text: string): string[] {
	return Array.from(new Set(text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)));
}
