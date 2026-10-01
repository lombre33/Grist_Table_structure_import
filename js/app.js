import { $ } from "./dom.js";
import { initSettings } from "./settings.js";
import { initImportTab } from "./importTab.js";
import { initExportTab } from "./exportTab.js";

initSettings();
const grist = window.grist;
grist?.ready({ requiredAccess: "full" });

const exportTab = initExportTab(grist);
initImportTab(grist);

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
