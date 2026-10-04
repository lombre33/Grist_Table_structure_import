/**
 * The entry point: it announces the widget to Grist, asks for the access it needs and sets the two tabs and the
 * Réglages dialog going.
 *
 * "full" is the level that lets the widget read Grist's metadata tables (`_grist_Tables`, `_grist_Tables_column` and
 * `_grist_Views_section`, which Export and the checks of Import read) and create tables and columns. It never reads or
 * writes the rows of a table; the README (« Accès demandé à Grist ») says what is read and written, and when.
 */

import { $ } from "./dom.js";
import { initSettings } from "./settings.js";
import { initImportTab } from "./importTab.js";
import { initExportTab } from "./exportTab.js";

initSettings();
const grist = window.grist;
grist?.ready({ requiredAccess: "full" });

const exportTab = initExportTab(grist);
initImportTab(grist);

/** The tabs, in the order of the tablist: each has a button `tab-<name>` and a panel `panel-<name>`. */
const TABS = ["import", "export"];

function activate(name) {
  for (const tab of TABS) {
    $(`tab-${tab}`).setAttribute("aria-selected", String(tab === name));
    $(`tab-${tab}`).tabIndex = tab === name ? 0 : -1;
    $(`panel-${tab}`).hidden = tab !== name;
  }
  if (name === "export") exportTab.activate();
}

/** The tab a key leads to (arrows wrap around, Home and End go to the ends), or undefined. */
function tabAfter(key, tab) {
  const index = TABS.indexOf(tab);
  if (key === "Home") return TABS[0];
  if (key === "End") return TABS.at(-1);
  if (key === "ArrowLeft") return TABS[(index - 1 + TABS.length) % TABS.length];
  if (key === "ArrowRight") return TABS[(index + 1) % TABS.length];
}

for (const tab of TABS) {
  $(`tab-${tab}`).addEventListener("click", () => activate(tab));
  $(`tab-${tab}`).addEventListener("keydown", (event) => {
    const target = tabAfter(event.key, tab);
    if (!target) return;
    event.preventDefault();
    activate(target);
    $(`tab-${target}`).focus();
  });
}
