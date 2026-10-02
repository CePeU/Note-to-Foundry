/** Owns a modal's asynchronous read/write and ignores results after it closes. */
export class ProfileFileOperation {
	private controller = new AbortController();
	private running = false;
	get busy(): boolean { return this.running; }
	get closed(): boolean { return this.controller.signal.aborted; }
	dispose(): void { this.controller.abort(); }
	async run<T>(work: (signal: AbortSignal) => Promise<T>, accept: (value: T) => void, fail: (error: unknown) => void): Promise<void> {
		if (this.running || this.closed) return;
		this.running = true;
		try {
			const value = await work(this.controller.signal);
			if (!this.closed) accept(value);
		} catch (error) {
			if (!this.closed) fail(error);
		} finally { this.running = false; }
	}
}
