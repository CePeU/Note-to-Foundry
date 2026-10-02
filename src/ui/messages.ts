import type { NoteToFoundrySettings } from "../profiles/types";
import { DiagnosticEvent, DiagnosticSink, sanitize, Severity } from "../relay/diagnostics";
import { PLUGIN_NAME } from "../identity";

export interface MessageContext {
	profile?: string;
	identity?: number;
	jobId?: string;
	debug: boolean;
	secrets?: readonly string[];
}
type ConsoleSink = (severity: Severity, record: unknown) => void;
const consoleSink: ConsoleSink = (severity, record) => console[severity](PLUGIN_NAME, record);

/** One captured context per operation; independent of later active-profile edits. */
export class Messages {
	private states = new Map<string, string>();
	constructor(
		private show: (message: string, duration?: number) => void,
		private context: MessageContext = { debug: false },
		private output: ConsoleSink = consoleSink
	) {}
	forProfile(name: string, profile: NoteToFoundrySettings, identity?: number): Messages {
		return new Messages(this.show, {
			profile: name, identity, debug: profile.isDebugOutput,
			secrets: [profile.foundryApiKey, profile.foundryPW],
		}, this.output);
	}
	forJob(jobId: string): Messages {
		return new Messages(this.show, { ...this.context, jobId }, this.output);
	}
	withSecrets(secrets: readonly string[]): Messages {
		return new Messages(this.show, { ...this.context, secrets: [...(this.context.secrets ?? []), ...secrets] }, this.output);
	}
	notice(message: string, severity: Severity = "info", duration?: number): void {
		const safe = String(sanitize(message, this.context.secrets));
		this.show(safe, duration);
		this.diagnostic({ event: "notice", severity, details: { message: safe } });
	}
	status(event: string, message: string, severity: Severity = "info"): string {
		const safe = String(sanitize(message, this.context.secrets));
		if (this.states.get(event) !== safe) {
			this.states.set(event, safe);
			if (this.states.size > 100) this.states.delete(this.states.keys().next().value!);
			this.diagnostic({ event, severity, details: { message: safe } });
		}
		return safe;
	}
	diagnostic: DiagnosticSink = (event: DiagnosticEvent): void => {
		if (!this.context.debug) return;
		try {
			const { secrets, debug: _debug, ...context } = this.context;
			this.output(event.severity ?? "info", sanitize({ ...context, ...event }, secrets));
		} catch { /* Observability must not change an operation's outcome. */ }
	};
}
