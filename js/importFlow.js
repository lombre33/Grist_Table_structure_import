/**
 * What the Import tab does with the document, step by step: read the text and the document, apply the choice,
 * go back to the start. `ctx` is { grist, ui, state, setStatus, confirm, render, showElements, onDocumentChange }.
 */

import { parseGristSchema } from "./parser.js";
import { buildElement, checklistItem, restoreFocus } from "./dom.js";
import { fetchDocSchema } from "./schema.js";
import { addColumns, createTables } from "./importer.js";
import { sumCounts } from "./elements.js";
import { callGrist, reportError } from "./util.js";
import { translate, translatePlural } from "./i18n.js";
import { confirmationOf } from "./importConfirm.js";
import { markChosenMode, modeOf } from "./importUi.js";
import { batchOf, newEntry, resetState, withFormulas } from "./importState.js";
import { fillTargetSelect, render, renderElements, renderTableIds, renderWarnings, targetTable, updateModeUI } from "./importView.js";

/** Reads the document's tables and columns: the references and the "existing table" mode need them, and a failure is a note, not an error. */
async function loadSchema({ grist, ui, state }) {
  ui.analyzeBtn.disabled = true;
  try {
    state.docSchema = await callGrist(fetchDocSchema(grist));
  } catch (err) {
    state.docSchema = null;
    state.warnings = [...state.warnings, { key: "import.error.fetchDocInfo", params: { error: reportError(err) } }];
  } finally {
    ui.analyzeBtn.disabled = false;
  }
}

/** Reads the text, then the document, and shows what would be done. */
export async function analyze(ctx) {
  const { ui, state, setStatus } = ctx;
  setStatus(null);
  resetState(state);
  ({ tables: state.parsed, warnings: state.warnings } = parseGristSchema(ui.sourceInput.value));
  const analysed = state.parsed;

  const found = analysed.length > 0;
  ui.modeBlock.hidden = ui.columnsPreview.hidden = ui.createActions.hidden = !found;
  ui.previewSection.hidden = false;
  if (!found) return showNothingFound(ctx);

  setStatus(() => translate("import.status.analyzing"));
  ui.actionBtn.disabled = true; // the button of the previous analysis, its tables gone
  await loadSchema(ctx);
  restoreFocus(ui.analyzeBtn);
  if (state.parsed !== analysed) return; // the text was edited, or cleared, while the document was being read
  setStatus(null);
  showTables(ctx);
}

function showNothingFound(ctx) {
  const { ui } = ctx;
  for (const list of [ui.columnsBody, ui.tableIdsList, ui.checklist]) list.replaceChildren();
  ui.sourcePickerRow.hidden = ui.checklistRow.hidden = ui.tableIdRow.hidden = ui.targetRow.hidden = true;
  ui.actionBtn.disabled = true;
  ui.previewHeading.textContent = translate("import.step2.none");
  renderElements(ctx, sumCounts([]));
  renderWarnings(ctx);
  ui.announcement.textContent = translate("import.announce.none");
}

function showTables(ctx) {
  const { ui, state } = ctx;
  ui.sourceSelect.replaceChildren(...state.parsed.map((table, index) => buildElement("option", { value: String(index), text: table.tableId })));
  ui.checklist.replaceChildren(...state.parsed.map((table, index) => checklistItem(String(index), table.tableId, true)));
  fillTargetSelect(ctx);
  updateModeUI(ctx);
  state.entries = state.parsed.map(newEntry);
  renderTableIds(ctx);
  render(ctx);
  ui.announcement.textContent = translate("import.announce.found", {
    tablesPhrase: translatePlural("common.tablesCount", state.parsed.length),
    columnsPhrase: translatePlural("common.columnsCount", state.parsed.reduce((total, table) => total + table.columns.length, 0)),
  });
  ui.previewSection.scrollIntoView({ block: "nearest" });
}

/** Back to before Analyser, keeping the text and the mode chosen. */
export function clearResults({ ui, state, setStatus }) {
  resetState(state);
  ui.modeBlock.hidden = ui.previewSection.hidden = ui.warningsBlock.hidden = true;
  for (const list of [ui.columnsBody, ui.tableIdsList, ui.checklist, ui.warningsList]) list.replaceChildren();
  ui.actionBtn.disabled = true;
  ui.announcement.textContent = "";
  setStatus(null);
}

/** Effacer: the text goes too, and the mode chosen. */
export function clearAll(ctx) {
  const { ui } = ctx;
  ui.sourceInput.value = "";
  for (const radio of ui.modeRadios) radio.checked = radio.value === "create";
  markChosenMode(ui);
  clearResults(ctx);
  ui.sourceInput.focus();
}

/** The button of the action: once the user has confirmed, creates the tables, or adds the columns, as the mode says. */
export async function apply(ctx) {
  const { ui, state } = ctx;
  if (!(await ctx.confirm(confirmationOf(ctx)))) return; // the preview stays as it is: nothing was written
  state.busy = ui.analyzeBtn.disabled = ui.actionBtn.disabled = true;
  try {
    await (modeOf(ui) === "create" ? create(ctx) : addToExisting(ctx));
  } finally {
    state.busy = false;
    ui.analyzeBtn.disabled = false;
    render(ctx);
    restoreFocus(ui.actionBtn.disabled ? ui.sourceInput : ui.actionBtn, ui.actionBtn); // done, nothing left to press: the next text goes in the box
  }
}

const MAX_IDS_SHOWN = 10;

/** The ids of the tables created, as many as a sentence can hold. */
const listed = (ids) => (ids.length > MAX_IDS_SHOWN ? `${ids.slice(0, MAX_IDS_SHOWN).join(", ")}…` : ids.join(", "));

async function create(ctx) {
  const { grist, state, setStatus } = ctx;
  const batch = batchOf(state);
  setStatus(() => translatePlural("import.status.creating", batch.length));
  try {
    const { tables: created, note } = await createTables(grist, batch, { withFormulas: withFormulas(state) });
    const columnCount = created.reduce((total, table) => total + table.columns.length, 0);
    const summary = () => {
      const columnsPhrase = translatePlural("common.columnsCount", columnCount);
      return created.length > 1
        ? translate("import.success.createdMulti", { count: created.length, ids: listed(created.map((table) => table.id)), columnsPhrase })
        : translate("import.success.createdSingle", { tableId: created[0].id, columnsPhrase });
    };
    clearResults(ctx);
    setStatus(() => summary() + note, "success");
    ctx.onDocumentChange();
  } catch (err) {
    const error = reportError(err);
    setStatus(() => translate("import.error.createFailed", { error }), "error");
  }
}

async function addToExisting(ctx) {
  const { grist, state, setStatus } = ctx;
  const target = targetTable(ctx);
  if (!target) return;
  setStatus(() => translate("import.status.addingColumns", { table: target.tableId }));
  try {
    const columns = state.existing.columns.filter((col) => !state.existing.excluded.has(col.id));
    const { added, note } = await addColumns(grist, target, columns, { withFormulas: withFormulas(state) });
    await loadSchema(ctx);
    if (added === 0) setStatus(() => translate("import.info.noNewColumns", { table: target.tableId }));
    else setStatus(() => translatePlural("import.success.columnsAdded", added, { table: target.tableId }) + note, "success");
    ctx.onDocumentChange();
  } catch (err) {
    const error = reportError(err);
    setStatus(() => translate("import.error.addColumnsFailed", { error }), "error");
  }
}
