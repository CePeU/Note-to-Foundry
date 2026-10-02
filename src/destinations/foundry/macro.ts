import { NOTE_TO_FOUNDRY_ICON } from "../../ui/icon";
import { LINK_UPDATE_CODE } from "./scripts";

/** Optional helper action. Await every effect so the relay can report failure. */
export const INSTALL_MACRO_CODE = `
const svg = new File([${JSON.stringify(NOTE_TO_FOUNDRY_ICON)}], "NoteToFoundry-icon.svg", { type: "image/svg+xml" });
const upload = await FilePicker.upload("data", "", svg, { overwrite: true });
if (!upload?.path) throw new Error("Macro icon upload was not confirmed");
const macro = await Macro.create({ name: "NoteToFoundry linking", type: "script", command: ${JSON.stringify(LINK_UPDATE_CODE)}, img: upload.path, ownership: { default: 3 } });
if (!macro?.id) throw new Error("Macro creation was not confirmed");
for (let page = 1; page <= 5; page++) {
  const empty = game.user.getHotbarMacros(page).find(entry => !entry.macro);
  if (empty) { await game.user.assignHotbarMacro(macro, empty.slot); break; }
}
return { id: macro.id };
`;
