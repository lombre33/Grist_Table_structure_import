/**
 * The banner of the Export tab that says which tables the ticked ones refer to without those being ticked, and
 * offers to include them. Exporting without them is allowed: Import then keeps a reference only if its table exists where it imports.
 */

import { byIds, el } from "./dom.js";
import { findReferencedTables } from "./schema.js";
import { t, tn } from "./i18n.js";

/** The tables that the `selected` ones refer to without those being selected themselves: `{ referencedBy, ids, key }`. */
export function missingTables(docSchema, selected) {
  const referencedBy = docSchema ? findReferencedTables(docSchema.tables, docSchema.allColumns, selected) : new Map();
  const ids = Array.from(referencedBy.keys());
  return { referencedBy, ids, key: ids.join("\0") };
}

/** `onInclude()` and `onDismiss()` hear the two buttons of the banner. */
export function createRefsBanner({ onInclude, onDismiss }) {
  const ui = byIds({
    banner: "export-refs-banner",
    intro: "export-refs-banner-intro",
    list: "export-refs-list",
    includeBtn: "refs-include-btn",
    dismissBtn: "refs-dismiss-btn",
    announcement: "export-announcement",
  });
  let dismissed = null; // the tables the user chose to do without, as missingTables().key

  ui.includeBtn.addEventListener("click", onInclude);
  ui.dismissBtn.addEventListener("click", onDismiss);

  /** Shows the banner for the tables `missing` (see missingTables), unless the user did without exactly those. */
  function render({ referencedBy, ids, key }) {
    ui.banner.hidden = ids.length === 0 || key === dismissed;
    if (ui.banner.hidden) {
      ui.announcement.textContent = "";
      return;
    }
    const intro = tn("export.refs.intro", ids.length);
    ui.intro.textContent = intro;
    if (ui.announcement.textContent !== intro) ui.announcement.textContent = intro; // a screen reader says again what is written again
    ui.includeBtn.textContent = tn("export.refs.include", ids.length);
    ui.dismissBtn.textContent = tn("export.refs.dismiss", ids.length);
    ui.list.replaceChildren(...ids.map((tableId) => el("li", { text: t("export.refs.item", { tableId, columns: referencedBy.get(tableId).join(", ") }) })));
  }

  return {
    render,
    /** The user does without the tables `missing` (the banner is back if the tables missing become other ones). */
    dismiss(missing) {
      dismissed = missing.key;
      render(missing);
    },
    /** The list of tables is read again: what was dismissed is forgotten. */
    reset() {
      dismissed = null;
    },
    isHidden: () => ui.banner.hidden,
  };
}
