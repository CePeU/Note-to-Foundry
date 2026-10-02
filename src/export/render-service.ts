import { App, Component, MarkdownRenderer } from "obsidian";
import { checkCancelled, ExportCancelled } from "./types";

export interface RenderInput {
	markdown?: string;
	viewClone?: HTMLElement;
	sourcePath: string;
}
export class RenderService {
	private container?: HTMLElement;
	private component?: Component;
	private observer?: MutationObserver;
	private touch?: () => void;
	private abortWait?: () => void;
	private failWait?: () => void;
	constructor(private app: App) {}
	postprocess(element: HTMLElement, sourcePath: string): void {
		if (
			sourcePath === this.sourcePath &&
			this.container &&
			(element === this.container || this.container.contains(element))
		)
			this.touch?.();
	}
	private sourcePath = "";
	async render(input: RenderInput, signal: AbortSignal): Promise<HTMLElement> {
		checkCancelled(signal);
		this.sourcePath = input.sourcePath;
		const container = document.createElement("div");
		this.container = container;
		container.classList.add("markdown-preview-view");
		Object.assign(container.style, {
			position: "fixed",
			left: "-100000px",
			top: "0",
			width: "900px",
			pointerEvents: "none",
		});
		document.body.appendChild(container);
		const component = new Component();
		this.component = component;
		component.load();
		let renderComplete = false;
		const ready = new Promise<void>((resolve, reject) => {
			let quiet: ReturnType<typeof setTimeout> | undefined;
			const finish = (error?: Error) => {
				clearTimeout(quiet);
				clearTimeout(limit);
				signal.removeEventListener("abort", aborted);
				this.touch = undefined;
				this.abortWait = undefined;
				this.failWait = undefined;
				error ? reject(error) : resolve();
			};
			const aborted = () => finish(new ExportCancelled());
			const limit = setTimeout(() => finish(new Error("Rendering timed out.")), 30000);
			this.abortWait = aborted;
			this.failWait = () => finish(new Error("The Markdown renderer failed."));
			this.touch = () => {
				clearTimeout(quiet);
				if (renderComplete) quiet = setTimeout(() => finish(), 500);
			};
			this.observer = new MutationObserver(() => this.touch?.());
			this.observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
			signal.addEventListener("abort", aborted, { once: true });
		});
		// Renderers can keep working after their returned promise; retain the component
		// and the historical 500 ms quiet-period heuristic, bounded by a deadline.
		const viewClone = input.viewClone;
		const rendering = Promise.resolve().then(async () => {
			if (viewClone) container.appendChild(viewClone);
			else await MarkdownRenderer.render(this.app, input.markdown ?? "", container, input.sourcePath, component);
		});
		void rendering.then(
			() => {
				renderComplete = true;
				this.touch?.();
			},
			() => this.failWait?.()
		);
		await ready;
		checkCancelled(signal);
		this.observer?.disconnect();
		return container.cloneNode(true) as HTMLElement;
	}
	dispose(): void {
		this.abortWait?.();
		this.observer?.disconnect();
		try {
			this.component?.unload();
		} finally {
			this.container?.remove();
			this.container = undefined;
			this.component = undefined;
			this.touch = undefined;
		}
	}
}
