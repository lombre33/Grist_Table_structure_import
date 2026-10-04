/**
 * The Import tab: the text of a table's Code View is read, shown as what it would create (or add to a table), and applied.
 * The tab is made of its elements (importUi), what it holds (importState), what it shows (importView) and what it does (importFlow).
 */

import { statusWriter } from "./dom.js";
import { elementsPicker } from "./elementsPicker.js";
import { translate, onLocaleChange } from "./i18n.js";
import { createConfirmation } from "./importConfirm.js";
import { importUi, markChosenMode } from "./importUi.js";
import { freshExisting, freshState, toggleElement } from "./importState.js";
import { onChecklistChange, onModeChange, onSelectAll, render, renderExisting, updateModeUI } from "./importView.js";
import { analyze, apply, clearAll, clearResults } from "./importFlow.js";

export function initImportTab(grist) {
  const ui = importUi();
  const setStatus = statusWriter(ui.statusRegion);
  if (!grist) {
    ui.analyzeBtn.disabled = true;
    setStatus(translate("error.noGristApi"), "error");
    return;
  }

  const ctx = { grist, ui, setStatus, state: freshState(), confirm: createConfirmation() };
  ctx.render = () => render(ctx);
  ctx.showElements = elementsPicker(
    ui.elementsList,
    (element, kept) => {
      toggleElement(ctx.state, element, kept);
      ctx.render();
    },
    { describedBy: { formulas: "formulas-hint" }, summary: ui.elementsSummary }
  );
  wire(ctx);
  markChosenMode(ui);
  updateModeUI(ctx);
}

/** What each control of the tab does when the user uses it. */
function wire(ctx) {
  const { ui, state } = ctx;
  ui.analyzeBtn.addEventListener("click", () => analyze(ctx));
  ui.clearBtn.addEventListener("click", () => clearAll(ctx));
  ui.sourceInput.addEventListener("input", (event) => {
    if (state.parsed.length > 0 && !state.busy) clearResults(ctx); // what is shown is no longer what is written
    if (event.inputType === "insertFromPaste" && !state.busy && ui.sourceInput.value.trim()) analyze(ctx); // a pasted code has nothing more to wait for
  });
  ui.sourceSelect.addEventListener("change", () => {
    state.existing = freshExisting(Number(ui.sourceSelect.value));
    renderExisting(ctx);
  });
  ui.checklist.addEventListener("change", () => onChecklistChange(ctx));
  ui.selectAllColumns.addEventListener("change", () => onSelectAll(ctx));
  ui.targetSelect.addEventListener("change", () => renderExisting(ctx));
  for (const radio of ui.modeRadios) radio.addEventListener("change", () => onModeChange(ctx));
  ui.actionBtn.addEventListener("click", () => apply(ctx));
  onLocaleChange(ctx.render);
}
