import { initImportTab } from "./importTab.js";
import { initExportTab } from "./exportTab.js";

const gristAvailable = typeof window.grist !== "undefined";
if (gristAvailable) {
  window.grist.ready({ requiredAccess: "full" });
}

const tabImport = document.getElementById("tab-import");
const tabExport = document.getElementById("tab-export");
const panelImport = document.getElementById("panel-import");
const panelExport = document.getElementById("panel-export");

const exportTab = initExportTab(window.grist, gristAvailable);
initImportTab(window.grist, gristAvailable);

function activateTab(name) {
  const importActive = name === "import";
  tabImport.setAttribute("aria-selected", String(importActive));
  tabExport.setAttribute("aria-selected", String(!importActive));
  tabImport.tabIndex = importActive ? 0 : -1;
  tabExport.tabIndex = importActive ? -1 : 0;
  panelImport.hidden = !importActive;
  panelExport.hidden = importActive;
  if (!importActive) exportTab.activate();
}

tabImport.addEventListener("click", () => activateTab("import"));
tabExport.addEventListener("click", () => activateTab("export"));
tabImport.addEventListener("keydown", (event) => handleArrowKey(event, "export", tabExport));
tabExport.addEventListener("keydown", (event) => handleArrowKey(event, "import", tabImport));

function handleArrowKey(event, otherName, otherButton) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  activateTab(otherName);
  otherButton.focus();
}
