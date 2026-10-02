import { SettingsContext, toggle } from "../controls";
export function otherSettings(ctx: SettingsContext) {
	return [toggle(ctx, "isDebugOutput", "Diagnostic output", "Keep user messages and sanitized failed-request parameters in the console.")];
}
