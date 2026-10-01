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

for (const tab of TABS) {
  $(`tab-${tab}`).addEventListener("click", () => activate(tab));
  $(`tab-${tab}`).addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const other = TABS.find((name) => name !== tab);
    event.preventDefault();
    activate(other);
    $(`tab-${other}`).focus();
  });
}
