import { allocateIdentity } from "../export/identity";
export function processCallouts(el: HTMLElement): void {
	const n2fCallouts = el.querySelectorAll<HTMLDivElement>('[data-callout^="n2f-"]');

	// Transform inner callouts first so their markup survives the outer copy.
	Array.from(n2fCallouts)
		.reverse()
		.forEach(callout => {
			// Extract the part after "n2f-" from data-callout attribute
			const dataCallout = callout.getAttribute("data-callout") || "";
			const calloutType = dataCallout.replace("n2f-", "");

			const metaData = callout.getAttribute("data-callout-metadata") || "";

			const contentEl = callout.querySelector(".callout-content") as HTMLElement | null;

			// Check if content is collapsedconst dataCallout = callout.getAttribute("data-callout") || "";
			//const isCollapsed = contentEl?.classList.contains("is-collapsed") ?? false;
			const dataCalloutFoldValue = callout.getAttribute("data-callout-fold") ?? "";

			const contentElTitle = callout.querySelector(".callout-title") as HTMLElement | null;

			// Fallback: use entire callout content if no specific content region found
			const contentHTML = contentEl ? contentEl.innerHTML : callout.innerHTML;

			// Create a div element to wrap NoteToFoundry hmtl into
			const divTag = document.createElement("div");
			divTag.classList.add("n2f");
			divTag.classList.add(calloutType);
			// Create new section element
			const section = document.createElement("section");

			// Generate random ID and set attribute with random ID if the callout is of type secret
			if (calloutType === "secret") {
				section.classList.add(calloutType);
				const randomId = `secret-${allocateIdentity()}`;
				section.id = randomId;
			}
			// Create details + summary + div structure
			const details = document.createElement("details");
			details.classList.add("n2f-callout");

			// Set open attribute if not collapsed
			if (dataCalloutFoldValue !== "-") {
				details.setAttribute("open", "");
			}

			const summary = document.createElement("summary");
			summary.classList.add("n2f-callout-title");
			summary.textContent = contentElTitle?.textContent?.trim() ?? "";

			const contentDiv = document.createElement("div");
			contentDiv.classList.add("n2f-callout-content");
			contentDiv.innerHTML = contentHTML;

			// Combine elements
			details.appendChild(summary);
			details.appendChild(contentDiv);
			divTag.appendChild(details);
			section.appendChild(divTag);

			//details.appendChild(summary);
			//details.appendChild(contentDiv);
			//section.appendChild(details);
			//divTag.appendChild(section);

			// Replace callout in DOM with new divTag/section element
			callout.parentElement?.replaceChild(section, callout);
		});
}
