import type { CleanConfig } from "./clean-service";
const removeEmptyLines = (text: string) => text.replace(/^\s*/gm, "");
const isEmpty = (text: string) => !removeEmptyLines(text).length;
export function runJavaScript(
	codeString: string,
	html: string,
	api: { createID(): string; frontMatter(): Record<string, unknown> }
): string {
	try {
		/* creates a function, the function code allways is the last parameter
    The function looks like this 
    function(html, api) {
      ... codeString .....
      } 
    */
		const fn = new Function("html", "api", codeString);
		// In a second step the function is called with two parameters one parameter is the html the other the exposed functions
		const returnHTML = fn(html, api);
		// make sure the html is returned even if the function writer did not set a return statement
		return returnHTML ?? html;
	} catch (e) {
		return `Error: ${(e as Error).message}`;
	}
}
export function replaceInHTMLWithRegex(html: string, settings: CleanConfig): string {
	if (settings.rulesForRegex) {
		for (let i = 0; i < settings.rulesForRegex.length; i++) {
			const singleRuleSet = settings.rulesForRegex[i];
			if (singleRuleSet[0]) {
				let { regexPattern, regexFlags } = parseRegexPattern(singleRuleSet[0]); //parse the input to a regex
				const regex = new RegExp(regexPattern, regexFlags); //create a regex object
				const replacementString = singleRuleSet[1];
				html = html.replace(regex, replacementString); //replace inside of the html an do this for all rules
				regexPattern = ""; //make sure regex input is empty
				regexFlags = ""; //make sure regex input is empty
			}
		}
	}
	return html; //return html with rule based regex changes
}
export function parseRegexPattern(input: string): { regexPattern: string; regexFlags: string } {
	const match = input.match(/(.*)\/([gimsuy]*)$/);
	if (!match) throw new Error("Invalid regex input");
	return {
		regexPattern: match[1],
		regexFlags: match[2] || "",
	};
}
export function replaceTag(parent: HTMLElement, settings: CleanConfig) {
	if (settings.rulesForTags) {
		for (let i = 0; i < settings.rulesForTags.length; i++) {
			const singleRuleSet = settings.rulesForTags[i];
			if (singleRuleSet[0]) {
				// Convert NodeList to Array to avoid issues with dynamic updates
				const tagList = Array.from(parent.querySelectorAll(singleRuleSet[0]));

				tagList.forEach(element => {
					const innerHTMLold = element.innerHTML;
					//node operations could also be used here instead of innerHTML but I do not need to clone the children
					// as I do not need to retain events or other properties of the element
					if (isEmpty(singleRuleSet[1])) {
						element.remove();
						return;
					}
					// Create new element
					const newElement = document.createElement(singleRuleSet[1]);
					newElement.innerHTML = innerHTMLold;
					// Copy attributes
					element.getAttributeNames().forEach(attr => {
						if (element.hasAttribute(attr)) {
							const attrValue = element.getAttribute(attr);
							if (attrValue) {
								newElement.setAttribute(attr, attrValue);
							}
						}
					});
					// Replace element
					element.replaceWith(newElement);
					// Recursively process nested elements by calling the function again
					// This is necessary to ensure that nested elements are also processed
					if (newElement.children.length > 0) {
						replaceTag(newElement, settings);
					}
				});
			}
		}
	}
}
export function removeEmptyContainer(parent: HTMLElement) {
	parent.querySelectorAll("p, div").forEach(node => {
		if (isEmpty(node.innerHTML)) {
			node.remove();
		}
	});
}
export function removeFrontMatter(parent: HTMLElement, settings: CleanConfig) {
	if (settings.removeFrontmatter) {
		const frontmatterNodes = parent.querySelectorAll(".frontmatter, .frontmatter-container");
		frontmatterNodes.forEach(node => node.remove());
	}
}
export function wildcardToRegex(pattern: string): RegExp {
	// 1. Alle speziellen Regex-Zeichen escapen, außer das Sternchen
	// Wir nutzen ein negatives Lookahead, um das '*' zu verschonen
	let escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

	// 2. Das Wildcard '*' in das Regex-Äquivalent '.' umwandeln
	let regexStr = escaped.replace(/\*/g, ".*");

	// 3. Das '?' Wildcard (falls gewünscht) in '.' umwandeln
	regexStr = regexStr.replace(/\?/g, ".");

	// 4. Mit Ankern umschließen, damit der gesamte String gematcht wird, der erste Anker ist ^ = start des Strings und der letzte Anker ist $ = bis ende des Strings
	// 'i' für Case-Insensitive (optional)
	return new RegExp(`^${regexStr}$`, "i");
}
export function removeAttributes(parent: HTMLElement, settings: CleanConfig) {
	const elements = parent.querySelectorAll<HTMLElement>("*"); //select all html elements/nodes

	const classPrefixes = new Set<RegExp>(); // init a Set for prefixes/matches with wildcards - a set only holds unique elements
	const classExacts = new Set<string>(); // init a Set for exact matches of classes in settings.classList

	for (const pattern of settings.classList) {
		//iterate over the classes/patterns in settings.classList
		if (pattern.includes("*") || pattern.includes("?")) {
			//if it is a pattern with a wildcard or questionmark
			classPrefixes.add(wildcardToRegex(pattern)); // then add this pattern without the wildcardstring to the prefix set
		} else {
			classExacts.add(pattern); // if it is not a wildcardstring add it to exact patterns
		}
	}

	// Cache attribute patterns (same logic as classes)
	const attrPrefixes = new Set<RegExp>();
	const attrExacts = new Set<string>();

	for (const pattern of settings.attributeList) {
		if (pattern.includes("*") || pattern.includes("?")) {
			attrPrefixes.add(wildcardToRegex(pattern));
		} else {
			attrExacts.add(pattern);
		}
	}

	elements.forEach(element => {
		const attributesToRemove: string[] = [];
		// create a positiv list of all classes which are to be keept
		const classPrefixArray = Array.from(classPrefixes); // create the prefix array before filtering so the array is not created on each filter run
		const classesToKeep: string[] = Array.from(element.classList).filter(
			(
				classNames //create an array of the classes found on the single DOM element
			) => classExacts.has(classNames) || classPrefixArray.some(prefix => prefix.test(classNames)) //check if that class is in the settings.classList EXACT matches
			// if not in EXACT matches check if the RegEx in the array applied to the classNames returns true (it will if it matches)
		);

		// A shallow copy is created by assigning settings.classList to an empty array. This new array can now be filtered, adjusted and then assigned
		// to classesToKeep without modifying the settings.classList array
		//const classesToKeep: string[] = Object.assign([], settings.classList).filter(cls =>
		// element is the single specific element of the element(s) node list and classList returns an array with all classes of that specific element
		// The read-only classList property of the Element interface contains a live DOMTokenList collection representing the class attribute of the element.
		//  element.classList.includes(cls)
		//);

		//const attributes = element.attributes; // get all attributes of the element

		// loop through all attributes and check if they are in the settings attributeList
		/*for (let i = 0; i < attributes.length; i++) {
      // get the name of the attribute and convert it to lowercase
      const attrName = attributes[i].name.toLowerCase();
      // if the attribute found is not in the attributeListe, add them to the attributesToRemove array
      if (!settings.attributeList.includes(attrName)) {
        attributesToRemove.push(attrName);
      }
    }*/
		// remove all attributes that are not allowed
		// attributesToRemove.forEach(attr => element.removeAttribute(attr));
		// read classes to keep and add them again after they have been removed in the attribute purge

		//    const attributesToRemove: string[] = [];

		// Filter attributes to keep (instead of just checking settings.attributeList)
		const prefixAttrArray = Array.from(attrPrefixes);
		const attributesToKeep: string[] = Array.from(element.attributes)
			.map(attr => attr.name.toLowerCase()) // returns the name of array of element.attributes OBJECTS ==> {name: id, value: some value}
			.filter(attrName => attrName !== "class" && (attrExacts.has(attrName) || prefixAttrArray.some(prefix => prefix.test(attrName))));

		// Remove ALL attributes first, then re-add kept ones
		//Array.from(element.attributes).forEach(attr =>
		//element.removeAttribute(attr.name)
		//);

		// Remove All attributes first but keep their value in memory
		const attrValues: { [key: string]: string } = {};
		Array.from(element.attributes).forEach(attr => {
			attrValues[attr.name] = attr.value;
			element.removeAttribute(attr.name);
		});

		// Re-add allowed attributes
		//attributesToKeep.forEach(attr => {
		// Note: removed attributes lose values, so you'd need to store/retrieve them
		//  element.setAttribute(attr, '');
		//});

		// Re-add with original values
		attributesToKeep.forEach(attr => {
			element.setAttribute(attr, attrValues[attr] || "");
		});

		// class is controlled exclusively by the class allowlist. Empty token-list
		// updates can materialize class="" in the browser, so remove it explicitly.
		if (classesToKeep.length) element.setAttribute("class", classesToKeep.join(" "));
		else element.removeAttribute("class");
	});
}
