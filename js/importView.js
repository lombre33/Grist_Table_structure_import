/**
 * What the Import tab shows, written again from its state after every change: the preview of the columns, the
 * fields of the tables to create, the notes, the button. `ctx` is { grist, ui, state, setStatus, render, showElements }.
 */

import { buildElement, syncMasterCheckbox } from "./dom.js";
import { existingColumnIds } from "./schema.js";
import { checkTableId, isComputed, linkedColumns, resolveColumns, twoWayWarnings } from "./importer.js";
import { elementCounts, omitTable, sumCounts } from "./elements.js";
import { translate, translatePlural, typeLabel } from "./i18n.js";
import { markChosenMode, modeOf } from "./importUi.js";
import { batchOf, documentTableIds, newEntry, tickableColumns, withFormulas } from "./importState.js";

const COMPUTED_TAGS = { formula: "import.preview.formula", trigger: "import.preview.trigger" };

/** Writes the preview again, for the mode that is chosen. */
export function render(ctx) {
  const { ui, state } = ctx;
  ui.previewHeading.textContent = translate(state.parsed.length > 0 ? "import.step2.eyebrow" : "import.step2.none");
  ui.modeHint.textContent = translate(modeOf(ui) === "existing" ? "import.mode.existing.desc" : "import.mode.create.desc");
  renderTargetProblem(ctx);
  return modeOf(ui) === "existing" ? renderExisting(ctx) : renderCreate(ctx);
}

/** The table of the document that the columns are added to, null when there is none to choose. */
export const targetTable = ({ ui, state }) => state.docSchema?.tables.find((table) => String(table.tableRef) === ui.targetSelect.value) ?? null;

/** What stops a table of the document from being completed, if anything: written again with every render, so that it follows the language. */
function renderTargetProblem({ ui, state }) {
  const problem = !state.docSchema ? "import.error.noTableList" : state.docSchema.tables.length === 0 ? "import.error.noTablesToComplete" : null;
  ui.targetError.hidden = !problem;
  ui.targetError.textContent = problem ? translate(problem) : "";
}

/** Shows what the mode chosen needs: the id of each table to create, or the table to complete (and its source, among several). */
export function updateModeUI({ ui, state }) {
  const isExisting = modeOf(ui) === "existing";
  const several = state.parsed.length > 1;
  ui.tableIdRow.hidden = isExisting;
  ui.sourcePickerRow.hidden = !(isExisting && several);
  ui.checklistRow.hidden = isExisting || !several;
  ui.targetRow.hidden = !isExisting;
  ui.statusHeader.hidden = !isExisting;
}

export function fillTargetSelect({ ui, state }) {
  ui.targetSelect.replaceChildren(...(state.docSchema?.tables ?? []).map((table) => buildElement("option", { value: String(table.tableRef), text: table.tableId })));
}

export function onModeChange(ctx) {
  markChosenMode(ctx.ui);
  updateModeUI(ctx);
  render(ctx);
}

/** Keeps the entry (id typed, columns unticked) of every table that stays ticked. */
export function onChecklistChange(ctx) {
  const { ui, state } = ctx;
  const ticked = state.parsed.length > 1 ? Array.from(ui.checklist.querySelectorAll("input:checked"), (input) => Number(input.value)) : [0];
  const previous = new Map(state.entries.map((entry) => [entry.index, entry]));
  state.entries = ticked.map((index) => previous.get(index) ?? newEntry(state.parsed[index], index));
  renderTableIds(ctx);
  renderCreate(ctx);
}

/** The box of the table's head takes all the columns that can be ticked in, or out. */
export function onSelectAll(ctx) {
  const { ui, state } = ctx;
  for (const [col, excluded] of tickableColumns(state, modeOf(ui))) {
    if (ui.selectAllColumns.checked) excluded.delete(col.id);
    else excluded.add(col.id);
  }
  render(ctx);
}

/** One field for the id of each table to create. */
export function renderTableIds(ctx) {
  const { ui, state } = ctx;
  ui.tableIdsList.replaceChildren(...state.entries.map((entry, position) => tableIdField(ctx, entry, position)));
}

function tableIdField(ctx, entry, position) {
  const inputId = `table-id-${position}`;
  entry.input = buildElement("input", { type: "text", id: inputId, autocomplete: "off", value: entry.id, "aria-describedby": `${inputId}-error ${inputId}-description` });
  entry.error = buildElement("p", { class: "field-error", id: `${inputId}-error`, hidden: true });
  entry.about = buildElement("p", { class: "hint table-description", id: `${inputId}-description`, hidden: true });
  entry.input.addEventListener("input", () => {
    entry.id = entry.input.value;
    renderCreate(ctx);
  });
  const label = buildElement("label", { text: entry.table.tableId, for: inputId, class: ctx.state.entries.length > 1 ? "" : "sr-only" });
  return buildElement("div", { class: "table-id-entry" }, [label, entry.input, entry.error, entry.about]);
}

/** A column's row, with the checkbox that takes it out of (or back into) what will be applied; `locked` when it is there already. */
function columnRow(ctx, col, { excluded, rerender, status = null, locked = false, linked = false }) {
  const checkbox = buildElement("input", {
    type: "checkbox",
    checked: !locked && !excluded.has(col.id),
    disabled: locked,
    "aria-label": translate("import.preview.includeColumn", { colId: col.id }),
  });
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) excluded.delete(col.id);
    else excluded.add(col.id);
    const boxes = () => Array.from(ctx.ui.columnsBody.querySelectorAll("input[type=checkbox]"));
    const position = boxes().indexOf(checkbox);
    rerender();
    boxes()[position]?.focus();
  });
  const tags = [isComputed(col) && COMPUTED_TAGS[col.kind], linked && "import.preview.twoWay"].filter(Boolean);
  const included = !locked && !excluded.has(col.id);
  const type = buildElement("td", {}, [typeLabel(col.type), ...tags.flatMap((key) => [" ", buildElement("span", { class: "tag", text: translate(key) })])]);
  const cells = [buildElement("td", { class: "col-checkbox" }, [buildElement("label", {}, [checkbox])]), buildElement("td", { text: col.id }), type];
  return buildElement("tr", { class: included ? "" : "is-excluded" }, status ? [...cells, status] : cells);
}

/** Resolves and checks every ticked table again: called after each change the user makes. */
export function renderCreate(ctx) {
  const { ui, state } = ctx;
  const destination = new Map(state.entries.map((entry) => [entry.table.tableId, entry.id.trim()]));
  const resolved = state.entries.map((entry) =>
    resolveColumns(entry.table, destination, documentTableIds(state), { excluded: entry.excluded, withFormulas: withFormulas(state), omit: state.omitted })
  );
  state.entries.forEach((entry, i) => (entry.columns = resolved[i].columns));
  const batch = batchOf(state);
  const linked = linkedColumns(batch);
  const notes = [...resolved.flatMap(({ warnings }, i) => warnings.map((warning) => ({ ...warning, table: batch[i].id }))), ...twoWayWarnings(batch)];
  const valid = checkTableIds(state);
  renderTableDescriptions(state);

  ui.columnsBody.replaceChildren(...createRows(ctx, batch, linked));
  ui.tableIdsLabel.textContent = translatePlural("import.tableId.label", Math.max(state.entries.length, 1));
  renderSelectAll(ctx);
  renderElements(ctx, sumCounts([...resolved.map(({ counts }) => counts), elementCounts([], state.entries.map((entry) => entry.table))]));
  renderWarnings(ctx, notes);
  const anyColumn = batch.some((table) => table.columns.length > 0);
  ui.actionBtn.disabled = state.busy || !valid || !anyColumn;
  ui.actionBtn.textContent = createLabel(state.entries.length, anyColumn);
}

/** Says, under each field, the description the table will have: the one its code gives it, as long as that element is kept. */
function renderTableDescriptions({ entries, omitted }) {
  for (const entry of entries) {
    const description = omitTable(entry.table, omitted).description ?? "";
    entry.about.textContent = description;
    entry.about.hidden = !description;
  }
}

/** Tells, under each field, what is wrong with the id typed (nothing, for a valid one), and whether every id is valid. */
function checkTableIds(state) {
  let valid = state.entries.length > 0;
  for (const entry of state.entries) {
    const id = entry.id.trim();
    const others = state.entries.filter((other) => other !== entry).map((other) => other.id.trim());
    const problem = checkTableId(id, documentTableIds(state), others);
    entry.error.hidden = !problem;
    entry.error.textContent = problem ? translate(problem, { tableId: id }) : "";
    entry.input.setAttribute("aria-invalid", String(Boolean(problem)));
    if (problem) valid = false;
  }
  return valid;
}

/** The rows of the columns of every table to create, each table named first when there are several. */
function createRows(ctx, batch, linked) {
  const { entries } = ctx.state;
  return entries.flatMap((entry, i) => [
    ...(entries.length > 1 ? [separatorRow(batch[i].id, entry.table.tableId)] : []),
    ...entry.columns.map((col) => columnRow(ctx, col, { excluded: entry.excluded, rerender: () => renderCreate(ctx), linked: linked.has(col) })),
  ]);
}

/** What the button says: what it creates, or what is missing for it to. */
function createLabel(tableCount, anyColumn) {
  if (tableCount === 0) return translate("import.action.chooseTables");
  if (!anyColumn) return translate("import.action.noColumns");
  return tableCount > 1 ? translatePlural("import.action.createTables", tableCount) : translate("import.action.create");
}

/** The row that names a table of several: the id it will have, and the table of the code it comes from when that is another. */
function separatorRow(id, source) {
  const origin = id === source ? [] : [" ", buildElement("span", { class: "tag", text: translate("import.preview.fromTable", { tableId: source }) })];
  return buildElement("tr", { class: "table-separator" }, [buildElement("td", { colspan: "3" }, [id, ...origin])]);
}

/** The checkbox of the table's head: all the columns that can be ticked, or some. */
function renderSelectAll({ ui, state }) {
  const items = tickableColumns(state, modeOf(ui));
  ui.selectAllColumns.disabled = items.length === 0;
  syncMasterCheckbox(ui.selectAllColumns, items.filter(([col, excluded]) => !excluded.has(col.id)).length, items.length);
}

/** Shows the columns the code would add to the table chosen, those it has already being marked and left alone. */
export function renderExisting(ctx) {
  const { ui, state } = ctx;
  const table = state.parsed[state.existing.index];
  if (!table) return;
  const target = targetTable(ctx);
  const known = target ? existingColumnIds(state.docSchema.allColumns, target.tableRef) : null;
  const present = (col) => Boolean(known?.has(col.id.toLowerCase()));
  const excluded = new Set([...state.existing.excluded, ...table.columns.filter(present).map((col) => col.id)]); // those already there are not imported: no note about them
  const resolved = resolveColumns(table, new Map(target ? [[table.tableId, target.tableId]] : []), documentTableIds(state), { excluded, withFormulas: withFormulas(state), omit: state.omitted });
  state.existing.columns = resolved.columns.map((col) => ({ ...col, isNew: !present(col) }));
  const included = state.existing.columns.filter((col) => col.isNew && !state.existing.excluded.has(col.id));
  const batch = [{ id: target?.tableId ?? table.tableId, columns: included }];
  const linked = linkedColumns(batch);

  ui.columnsBody.replaceChildren(...existingRows(ctx, linked));
  renderSelectAll(ctx);
  renderElements(ctx, resolved.counts);
  renderWarnings(ctx, [...resolved.warnings, ...twoWayWarnings(batch)]);
  ui.actionBtn.disabled = state.busy || !known || included.length === 0;
  ui.actionBtn.textContent = addLabel(target, known, included);
}

function existingRows(ctx, linked) {
  const { existing } = ctx.state;
  return existing.columns.map((col) => {
    const pill = col.isNew ? ["new", translate("import.status.new")] : ["skip", translate("import.status.existing")];
    const status = buildElement("td", {}, [buildElement("span", { class: `status-pill status-pill-${pill[0]}`, text: pill[1] })]);
    return columnRow(ctx, col, { excluded: existing.excluded, rerender: () => renderExisting(ctx), status, locked: !col.isNew, linked: linked.has(col) });
  });
}

/** What the button says: what it adds, or what is missing for it to. */
function addLabel(target, known, included) {
  if (!known) return translate("import.action.chooseTarget");
  if (included.length === 0) return translate("import.action.noNewColumns");
  return translatePlural("import.action.addColumns", included.length, { table: target.tableId });
}

/** The elements of the text that the user can keep or leave out, with how many columns carry each. */
export function renderElements({ ui, state, showElements }, counts) {
  ui.elementsBox.hidden = !showElements(counts, (element) => !state.omitted.has(element));
  ui.formulasHint.hidden = counts.formulas === 0;
}

/** The notes about the text and about what would be applied, each naming its table when there are several. */
export function renderWarnings({ ui, state }, more = []) {
  const texts = [...state.warnings, ...more].map(({ key, params, table }) => {
    const message = translate(key, params);
    return table && state.parsed.length > 1 ? translate("warn.tablePrefix", { tableId: table, message }) : message;
  });
  ui.warningsBlock.hidden = texts.length === 0;
  ui.warningsList.replaceChildren(...texts.map((text) => buildElement("li", { text })));
}
