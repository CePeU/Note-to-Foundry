import { FOUNDRY_FLAG_NAMESPACE } from "../../identity";
// Plugin-owned scripts; normal export executes them directly.
export const LINK_UPDATE_CODE = `
/**
 * Resolves Obsidian-style links within Foundry Journal entries by mapping Obsidian UUIDs/paths
 * to Foundry UUIDs, then detecting and updating unresolved links within journal pages.
 * @async
 * @function
 * @returns {Promise<void>}
 */
async function resolveObsidianLinksInFoundry() {
    // Get all Journal entries in Foundry.
    const allJournals = game.journal.contents;

    // === Step 1: Build Mapping Maps ===

    /** @type {Map<string, string>} Maps Obsidian UUIDs to Foundry page UUIDs */
    const obsidianUUIDtoFoundryId = new Map();
    /** @type {Map<string, string>} Maps Obsidian file paths to Foundry page UUIDs */
    const obsidianPathtoFoundryId = new Map();
    /** @type {Map<string, Object>} Tracks pages with unresolved links */
    const pageListToResolve = new Map();

    // Traverse all journals and their pages to construct lookup maps and page lists.
    for (const journal of allJournals) {
        const journalId = journal.id;

        // Access raw source pages inside each journal
        for (const pageSource of journal._source.pages) {
            const pageId = pageSource._id;
            const flags = pageSource.flags?.[${JSON.stringify(FOUNDRY_FLAG_NAMESPACE)}] ?? null;
            // Keep the historical flag namespace for existing pages.
            if (!flags) continue;

            // Generate Foundry page UUID
            const foundryPageUuid = \`JournalEntry.\${journalId}.JournalEntryPage.\${pageId}\`;

            // Map Obsidian UUID to Foundry page UUID
            if (flags.uuid) {
                obsidianUUIDtoFoundryId.set(flags.uuid, foundryPageUuid);
            }
            // Map Obsidian path to Foundry page UUID
            if (flags.filePath) {
                obsidianPathtoFoundryId.set(flags.filePath, foundryPageUuid);
            }

            // Record pages that have unresolved links
            if (flags.unresolvedLinks > 0) {
                pageListToResolve.set(foundryPageUuid, {
                    journalId,
                    pageId,
                    pageName: pageSource.name || journal.name,
                    flags,
                    foundryPageUuid
                });
            }
        }
    }

    // === Step 2: Process Each Page with Unresolved Links ===
    for (const [foundryPageUuid, pageData] of pageListToResolve) {
        const { journalId, pageId, pageName, flags } = pageData;
        const pageFlags = flags; // alias for clarity

        // Retrieve JournalEntry document by ID
        const journal = game.journal.get(journalId);
        if (!journal) {
            // Warn if journal is missing and skip
            console.warn(\`❌ Journal not found: \${journalId}\`);
            continue;
        }

        // Retrieve JournalEntryPage document by page ID
        const page = journal.pages.get(pageId);
        if (!page) {
            // Warn if page is missing and skip
            console.warn(\`❌ Page not found: \${pageId} in journal \${journalId}\`);
            continue;
        }

        let content = page.text.content;       // Current HTML content of the page
        let updatedContent = content;           // Will store the modified content

        // Handle every unresolved link in this page's flags
        for (const link of pageFlags.journalLinks) {
            // Skip links that are already resolved - not working yet because update of flags during import
			//FIXME: Find out why flags are not correctly updated
            if (link.linkResolved) continue;

            let targetUuid = null;          // Foundry target UUID to replace with

            // === Step 1: Resolve Target Foundry UUID ===
            if (link.linkDestinationUUID && obsidianUUIDtoFoundryId.has(link.linkDestinationUUID)) {
                targetUuid = obsidianUUIDtoFoundryId.get(link.linkDestinationUUID);
            } else if (link.linkPath && obsidianPathtoFoundryId.has(link.linkPath)) {
                targetUuid = obsidianPathtoFoundryId.get(link.linkPath);
            } else if (link.linkDestinationUUID === "" && link.linkPath === "" && link.ankerLink) {
                // Self-link if both are empty but ankerLink is provided
                targetUuid = foundryPageUuid;
            } else {
                // Warn and skip if target UUID cannot be resolved
                console.warn(\`❌ Could not resolve target for link:\`, link.linkText, link.linkPath || link.linkDestinationUUID);
                continue;
            }

            // === Step 2: Handle Anchor (Heading) Links ===
            let anchorPart = "";
            if (link.isAnkerLink && link.ankerLink) {
                // Split the anchor by hash and slugify the last fragment
                const hashFragments = link.ankerLink.split("#");
                const lastFragment = hashFragments[hashFragments.length - 1];

                // Slugify: lower case, replace spaces with hyphens, trim hyphens
                const slug = lastFragment
                    .toLowerCase()
                    .replace(/ /g, "-")
                    .replace(/^-+|-+$/g, "");

                if (slug) {
                    anchorPart = \`#\${slug}\`;
                }
            }

            // === Step 3: Build Replacement String ===
            const linkText = link.linkText;
            const replacement = \`@UUID[\${targetUuid}\${anchorPart}]{\${linkText}}\`;

            // === Step 4: Find and Replace Original HTML Link ===
            let oldHtml = null;

            // Case 1: Inline anchor only
            if (link.linkDestinationUUID === "" && link.linkPath === "" && link.ankerLink) {
                const escapedLinkPath = escapeRegExp(link.ankerLink);
                oldHtml = \`<a[^>]*href=["']\${escapedLinkPath}["'][^>]*>.*?<\\/a>\`;
            // Case 2: External .md file without anchor
            } else if (link.linkPath && !link.isAnkerLink) {
                const escapedLinkPath = escapeRegExp(link.linkPath);
                oldHtml = \`<a[^>]*href=["']\${escapedLinkPath}["'][^>]*>.*?<\\/a>\`;
            // Case 3: .md file with anchor
            } else if (link.linkPath && link.isAnkerLink) {
                const escapedLinkPath = escapeRegExp(link.linkPath + link.ankerLink);
                oldHtml = \`<a[^>]*href=["']\${escapedLinkPath}["'][^>]*>.*?<\\/a>\`;
            } else {
                // Fallback for other link types; nothing to set
                console.warn(\`❌ Could not match Link:\`, link, \`in page \${pageId} in journal \${journalId}\`);
            }

            // Perform the regex replacement in HTML, if applicable
            if (oldHtml) {
                const regex = new RegExp(oldHtml, "gm");
                const matched = regex.test(updatedContent);
                regex.lastIndex = 0;
                updatedContent = updatedContent.replace(regex, () => replacement);
                // Mark the link as resolved successfully
                if (matched) link.linkResolved = true;
            }
        }

        // === Step 5: Update unresolvedLinks count ===
        pageFlags.unresolvedLinks = pageFlags.journalLinks.filter(l => !l.linkResolved).length;

        // === Step 6: Prepare and perform page update if needed ===
        const updates = {};

        // Update page content if changed
        if (updatedContent !== content) {
            updates["text.content"] = updatedContent;
        }

        // Always update flags to reflect resolved links and unresolved count
        updates[${JSON.stringify("flags." + FOUNDRY_FLAG_NAMESPACE)}] = pageFlags;

        // Only update if there's something to change
        if (Object.keys(updates).length > 0) {
            await page.update(updates,{ render: true });
            console.log(\`✅ Updated: \${pageName}\`);
        } else {
            console.log(\`⏭️ No changes needed: \${pageName}\`);
        }
    }
    // 👇 Force UI refresh if journals with modified pages are open, done in update allready?
	// Extra safety: re-render open sheets 
    for (const journal of allJournals) {
        if (journal.sheet?.rendered) journal.sheet.render();
    }
    console.log("🎉 All unresolved links processed.");
}

/**
 * Escapes special characters for use in regular expressions.
 * @param {string} str - The input string to escape.
 * @returns {string} Escaped string.
 */
function escapeRegExp(str) {
    const attribute = str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const special = ".*+?^" + String.fromCharCode(36) + "{}()|[]" + String.fromCharCode(92);
    return Array.from(attribute).map(char => special.includes(char) ? String.fromCharCode(92) + char : char).join("");
}

// Run the macro to resolve Obsidian links in Foundry
await resolveObsidianLinksInFoundry();
return { success: true };
`;
export const GET_ALL_JOURNALS_CODE = `
function walkUpTreeFromId(folders, startId)
{
	const folderMap = new Map();
	for (const folderObj of folders) {
    // create a map with unique key = folderID and the corresponding folder object
	folderMap.set(folderObj.id, folderObj);
	}

	const result = [];
	//get the folder object with it's id
	let current = folderMap.get(startId);
	let child = null;

	if (!current) {
		return result; // startId not found
	}

	// Walk up the tree, collecting folders with their parent and child info
	while (current) {
    const parent = current._source?.folder ? folderMap.get(current._source?.folder) ?? null : null;


    result.push({
      id: current._id,
      name: current.name,
      level: current.depth,

      parentId: parent ? parent._id : "root",
      parentName: parent ? parent.name : "root",
      parentLevel: parent ? parent.depth : 0,

      childId: child ? child._id : "none",
      childName: child ? child.name : "none",
      childLevel: child ? child.depth : -1,
    });

    child = current;
    current = parent;

    if (current && current.depth < 0) {
      break;
    }
  }

  // Reverse the array so it starts with the root-level folder first (lowest level)
  result.reverse();

  // Insert the root object at index 0
  // Child information comes from the first element of reversed array, if any
  const firstChild = result.length > 0 ? result[0] : null;
  const rootObj = {
    id: "root",
    name: "root",
    level: 0,

    parentId: "none",
    parentName: "none",
    parentLevel: -1,

    childId: firstChild ? firstChild.id : "none",
    childName: firstChild ? firstChild.name : "none",
    childLevel: firstChild ? firstChild.level : -1,
  };

  result.unshift(rootObj);

  return result;
}

function AllJournals(){
	const folderList = game.folders.contents
	console.log(folderList)
	const journalList = game.journal?.contents || []
	let allJournals = []

	if (journalList.length>0){
	allJournals = Object.entries(journalList).map(([_, FoundryJournal]) => {
		let folderId = FoundryJournal?._source?.folder ?? "";
		let folderTree =[];
		let fullFolderPath = "";
		let folderName = "";        
		if (folderId){
			let folder = game.folders.get(folderId);
			folderName = folder?.name ?? "root";
			folderTree = walkUpTreeFromId(folderList,folderId)
			fullFolderPath =folderTree[1]?.name ?? folderTree[0]?.name ?? "root"
			for (let i = 2; i < folderTree.length; i++) { 
				fullFolderPath = fullFolderPath+"/"+folderTree[i].name;
			}
		}
		const sourcePages = FoundryJournal._source.pages || []
		let pages = []
		if (sourcePages.length>0){
			pages = Object.entries(sourcePages).map(([_, page]) => {		
				return {
					pageId: page?._id ?? "",
					pageName: page?.name ?? "",
					journalId: FoundryJournal?._id ?? "",
					journalName: FoundryJournal?.name ?? "",
					folderId: folderId || "root",
					folderName: folderName || "root",
					folderTree: folderTree,
					fullFolderPath: fullFolderPath,
					flag: page?.flags ?? {},
					obsidianUUID: page?.flags?.obsidian?.uuid ?? "",
					obsdianLinksRemaining: page?.flags?.obsidian?.fullyLinked ?? -1
			};
		});
	}
	return {
		journalId: FoundryJournal?._id ?? "",
		journalName: FoundryJournal?.name ?? "",
		flags: FoundryJournal?.flags ?? "",
		ownership: FoundryJournal?.ownership ?? "",
		folderId: folderId || "root",
		folderName: folderName || "root",
		folderTree: folderTree,
		fullFolderPath: fullFolderPath,
		pages: pages || []
	};
	});
}
return allJournals ?? []
}
return AllJournals()
`;
export const GET_ALL_FOLDERS_CODE = `
// Get all folders
function GetAllFolders(){
	const folderList = game.folders?.contents || []
	const folders = Object.entries(folderList).map(([_, folder]) => {
	const folderTree = walkUpTreeFromId(folderList,folder.id)

	let fullFolderPath = folderTree[1].name ?? folderTree[0].name ?? "root"
	for (let i = 2; i < folderTree.length; i++) { 
		fullFolderPath = fullFolderPath+"/"+folderTree[i].name;
	}

	return {
		id: folder.id,
		name: folder.name,
		type: folder.type,
		parent: folder._source?.folder ?? "root",
		depth: folder.depth,
		path: folder.uuid,
		sorting: folder.sort,
		sortingMode: folder.sortingMode,
		folderTree: folderTree,
		fullFolderPath: fullFolderPath
		};
	});
	return folders ?? [];
}

function walkUpTreeFromId(folders, startId){
	const folderMap = new Map();
	for (const folderObj of folders) {
    // create a map with unique key = folderID and the corresponding folder object
	folderMap.set(folderObj.id, folderObj);
	}

	const result = [];
	//get the folder object with it's id
	let current = folderMap.get(startId);
	let child = null;

	if (!current) {
	return result; // startId not found
	}

	// Walk up the tree, collecting folders with their parent and child info
	while (current) {
		const parent = current._source?.folder ? folderMap.get(current._source?.folder) ?? null : null;

	result.push({
		id: current._id,
		name: current.name,
		level: current.depth,

		parentId: parent ? parent._id : "root",
		parentName: parent ? parent.name : "root",
		parentLevel: parent ? parent.depth : 0,

		childId: child ? child._id : "none",
		childName: child ? child.name : "none",
		childLevel: child ? child.depth : -1,
	});

	child = current;
	current = parent;

	if (current && current.depth < 0) {
		break;
		}
	}

	// Reverse the array so it starts with the root-level folder first (lowest level)
	result.reverse();

  	// Insert the root object at index 0
  	// Child information comes from the first element of reversed array, if any
	const firstChild = result.length > 0 ? result[0] : null;
	const rootObj = {
		id: "root",
		name: "root",
		level: 0,

		parentId: "none",
		parentName: "none",
		parentLevel: -1,

		childId: firstChild ? firstChild.id : "none",
		childName: firstChild ? firstChild.name : "none",
		childLevel: firstChild ? firstChild.level : -1,
	};

	result.unshift(rootObj);
	return result;
}
return GetAllFolders()
`;
