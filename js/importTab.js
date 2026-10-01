import { parseGristSchema } from "./parser.js";
import { $, el, checklistItem, restoreFocus, statusWriter, syncCheckedClass } from "./dom.js";
import { fetchDocSchema, existingColumnIds } from "./schema.js";
import { addColumns, checkTableId, createTables, defaultTableId, isComputed, resolveColumns, twoWayPairs, twoWayWarnings } from "./importer.js";
import { callGrist, reportError } from "./util.js";
import { t, tn, typeLabel, onLocaleChange } from "./i18n.js";

const COMPUTED_TAGS = { formula: "import.preview.formula", trigger: "import.preview.trigger" };

export function initImportTab(grist) {
  const sourceInput = $("source-input");
  const analyzeBtn = $("analyze-btn");
  const clearBtn = $("clear-btn");
  const modeBlock = $("mode-block");
  const modeRadios = Array.from(document.querySelectorAll('input[name="import-mode"]'));
  const previewSection = $("preview-section");
  const sourcePickerRow = $("table-picker-row");
  const sourceSelect = $("table-select");
  const checklistRow = $("table-multi-picker-row");
  const checklist = $("table-multi-select");
  const tableIdRow = $("table-id-row");
  const tableIdsList = $("table-ids-list");
  const targetRow = $("target-table-row");
  const targetSelect = $("target-table-select");
  const targetError = $("target-table-error");
  const columnsPreview = $("columns-preview");
  const statusHeader = $("status-column-header");
  const columnsBody = $("columns-preview-body");
  const formulasRow = $("formulas-row");
  const formulasOption = $("with-formulas");
  const formulasLabel = $("with-formulas-label");
  const warningsBlock = $("warnings-block");
  const warningsList = $("warnings-list");
  const createActions = $("create-actions");
  const actionBtn = $("action-btn");
  const announcement = $("import-announcement");
  const setStatus = statusWriter($("import-status-region"));

  if (!grist) {
    analyzeBtn.disabled = true;
    setStatus(t("error.noGristApi"), "error");
    return;
  }

  let parsed; // the tables found in the source text
  let warnings; // about the text, and about reading the document
  let docSchema; // this document's tables and columns, null when unreadable
  let entries; // "new table" mode, one per ticked table: { index, table, id, excluded, columns, input, error }
  let existing; // "existing table" mode: { index of the source table, excluded column ids, columns }
  let withFormulas; // the formulas are imported too
  let busy = false;
  reset();

  const mode = () => modeRadios.find((radio) => radio.checked)?.value ?? "create";
  const render = () => (mode() === "existing" ? renderExisting() : renderCreate());
  const documentTableIds = () => docSchema?.tableIds ?? null;

  analyzeBtn.addEventListener("click", onAnalyze);
  clearBtn.addEventListener("click", onClear);
  sourceInput.addEventListener("input", () => parsed.length > 0 && !busy && clearResults());
  sourceSelect.addEventListener("change", () => {
    existing = { index: Number(sourceSelect.value), excluded: new Set(), columns: [] };
    renderExisting();
  });
  checklist.addEventListener("change", onChecklistChange);
  formulasOption.addEventListener("change", () => {
    withFormulas = formulasOption.checked;
    render();
  });
  targetSelect.addEventListener("change", renderExisting);
  for (const radio of modeRadios) radio.addEventListener("change", onModeChange);
  actionBtn.addEventListener("click", onAction);
  onLocaleChange(render);

  syncCheckedClass(modeRadios, "is-checked", ".mode-card");
  updateModeUI();

  function reset() {
    parsed = [];
    warnings = [];
    docSchema = null;
    entries = [];
    existing = { index: 0, excluded: new Set(), columns: [] };
    withFormulas = false;
  }

  async function loadSchema() {
    analyzeBtn.disabled = true;
    try {
      docSchema = await callGrist(fetchDocSchema(grist));
    } catch (err) {
      docSchema = null;
      warnings = [...warnings, { key: "import.error.fetchDocInfo", params: { error: reportError(err) } }];
    } finally {
      analyzeBtn.disabled = false;
      restoreFocus(analyzeBtn);
    }
  }

  async function onAnalyze() {
    setStatus(null);
    reset();
    ({ tables: parsed, warnings } = parseGristSchema(sourceInput.value));

    const found = parsed.length > 0;
    modeBlock.hidden = columnsPreview.hidden = createActions.hidden = !found;
    previewSection.hidden = false;
    if (!found) {
      for (const list of [columnsBody, tableIdsList, checklist]) list.replaceChildren();
      sourcePickerRow.hidden = checklistRow.hidden = tableIdRow.hidden = targetRow.hidden = true;
      actionBtn.disabled = true;
      renderWarnings();
      announcement.textContent = t("import.announce.none");
      return;
    }

    setStatus(t("import.status.analyzing"));
    await loadSchema();
    setStatus(null);

    sourceSelect.replaceChildren(...parsed.map((table, index) => el("option", { value: String(index), text: table.tableId })));
    checklist.replaceChildren(...parsed.map((table, index) => checklistItem(String(index), table.tableId, true)));
    fillTargetSelect();
    updateModeUI();
    entries = parsed.map(newEntry);
    renderTableIds();
    render();
    announcement.textContent = t("import.announce.found", {
      tablesPhrase: tn("common.tablesCount", parsed.length),
      columnsPhrase: tn("common.columnsCount", parsed.reduce((total, table) => total + table.columns.length, 0)),
    });
    previewSection.scrollIntoView({ block: "nearest" });
  }

  /** Back to before Analyser, keeping the text and the mode chosen. */
  function clearResults() {
    reset();
    modeBlock.hidden = previewSection.hidden = warningsBlock.hidden = true;
    for (const list of [columnsBody, tableIdsList, checklist, warningsList]) list.replaceChildren();
    actionBtn.disabled = true;
    announcement.textContent = "";
    setStatus(null);
  }

  function onClear() {
    sourceInput.value = "";
    for (const radio of modeRadios) radio.checked = radio.value === "create";
    syncCheckedClass(modeRadios, "is-checked", ".mode-card");
    clearResults();
    sourceInput.focus();
  }

  function onModeChange() {
    syncCheckedClass(modeRadios, "is-checked", ".mode-card");
    updateModeUI();
    render();
  }

  function updateModeUI() {
    const isExisting = mode() === "existing";
    const several = parsed.length > 1;
    tableIdRow.hidden = isExisting;
    sourcePickerRow.hidden = !(isExisting && several);
    checklistRow.hidden = isExisting || !several;
    targetRow.hidden = !isExisting;
    statusHeader.hidden = !isExisting;
  }

  function fillTargetSelect() {
    const problem = !docSchema ? "import.error.noTableList" : docSchema.tables.length === 0 ? "import.error.noTablesToComplete" : null;
    targetError.hidden = !problem;
    targetError.textContent = problem ? t(problem) : "";
    targetSelect.replaceChildren(...(docSchema?.tables ?? []).map((table) => el("option", { value: String(table.tableRef), text: table.tableId })));
  }

  const targetTable = () => docSchema?.tables.find((table) => String(table.tableRef) === targetSelect.value) ?? null;

  const newEntry = (table, index) => ({ index, table, id: defaultTableId(table.tableId), excluded: new Set() });

  /** Keeps the entry (id typed, columns unticked) of every table that stays ticked. */
  function onChecklistChange() {
    const ticked = parsed.length > 1 ? Array.from(checklist.querySelectorAll("input:checked"), (input) => Number(input.value)) : [0];
    const previous = new Map(entries.map((entry) => [entry.index, entry]));
    entries = ticked.map((index) => previous.get(index) ?? newEntry(parsed[index], index));
    renderTableIds();
    renderCreate();
  }

  function renderTableIds() {
    tableIdsList.replaceChildren(
      ...entries.map((entry, position) => {
        const inputId = `table-id-${position}`;
        entry.input = el("input", { type: "text", id: inputId, autocomplete: "off", value: entry.id, "aria-describedby": `${inputId}-error` });
        entry.error = el("p", { class: "field-error", id: `${inputId}-error`, hidden: true });
        entry.input.addEventListener("input", () => {
          entry.id = entry.input.value;
          renderCreate();
        });
        return el("div", { class: "table-id-entry" }, [el("label", { text: entry.table.tableId, for: inputId }), entry.input, entry.error]);
      })
    );
  }

  /** A column's row, with the checkbox that takes it out of (or back into) what will be applied; `locked` when it is there already. */
  function columnRow(col, { excluded, rerender, status = null, locked = false, linked = false }) {
    const checkbox = el("input", {
      type: "checkbox",
      checked: !locked && !excluded.has(col.id),
      disabled: locked,
      "aria-label": t("import.preview.includeColumn", { colId: col.id }),
    });
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) excluded.delete(col.id);
      else excluded.add(col.id);
      const boxes = () => Array.from(columnsBody.querySelectorAll("input[type=checkbox]"));
      const position = boxes().indexOf(checkbox);
      rerender();
      boxes()[position]?.focus();
    });
    const tags = [isComputed(col) && COMPUTED_TAGS[col.kind], linked && "import.preview.twoWay"].filter(Boolean);
    const type = el("td", {}, [typeLabel(col.type), ...tags.flatMap((key) => [" ", el("span", { class: "tag", text: t(key) })])]);
    const cells = [el("td", { class: "col-checkbox" }, [checkbox]), el("td", { text: col.id }), type];
    return el("tr", {}, status ? [...cells, status] : cells);
  }

  /** Resolves and checks every ticked table again: called after each change the user makes. */
  function renderCreate() {
    const destination = new Map(entries.map((entry) => [entry.table.tableId, entry.id.trim()]));
    const resolved = entries.map((entry) => resolveColumns(entry.table, destination, documentTableIds(), { excluded: entry.excluded, withFormulas }));
    entries.forEach((entry, i) => (entry.columns = resolved[i].columns));
    const batch = entries.map((entry) => ({ id: entry.id.trim() || entry.table.tableId, columns: entry.columns.filter((col) => !entry.excluded.has(col.id)) }));
    const linked = new Set(twoWayPairs(batch).flat().map(({ col }) => col));
    const notes = [...resolved.flatMap(({ warnings: found }, i) => found.map((warning) => ({ ...warning, table: batch[i].id }))), ...twoWayWarnings(batch)];

    const rows = entries.flatMap((entry, i) => [
      ...(entries.length > 1 ? [el("tr", { class: "table-separator" }, [el("td", { colspan: "3", text: batch[i].id })])] : []),
      ...entry.columns.map((col) => columnRow(col, { excluded: entry.excluded, rerender: renderCreate, linked: linked.has(col) })),
    ]);

    let valid = entries.length > 0;
    for (const entry of entries) {
      const id = entry.id.trim();
      const others = entries.filter((other) => other !== entry).map((other) => other.id.trim());
      const problem = checkTableId(id, documentTableIds(), others);
      entry.error.hidden = !problem;
      entry.error.textContent = problem ? t(problem, { id }) : "";
      entry.input.setAttribute("aria-invalid", String(Boolean(problem)));
      valid &&= !problem;
    }

    columnsBody.replaceChildren(...rows);
    renderFormulasOption(batch.flatMap((table) => table.columns).filter(isComputed).length);
    renderWarnings(notes);
    actionBtn.disabled = busy || !valid || batch.every((table) => table.columns.length === 0);
    actionBtn.textContent = entries.length > 1 ? tn("import.action.createTables", entries.length) : t("import.action.create");
  }

  function renderExisting() {
    const table = parsed[existing.index];
    if (!table) return;
    const target = targetTable();
    const known = target ? existingColumnIds(docSchema.allColumns, target.tableRef) : null;
    const resolved = resolveColumns(table, new Map(target ? [[table.tableId, target.tableId]] : []), documentTableIds(), { excluded: existing.excluded, withFormulas });
    existing.columns = resolved.columns.map((col) => ({ ...col, isNew: !known || !known.has(col.id.toLowerCase()) }));
    const included = existing.columns.filter((col) => col.isNew && !existing.excluded.has(col.id));
    const batch = [{ id: target?.tableId ?? table.tableId, columns: included }];
    const linked = new Set(twoWayPairs(batch).flat().map(({ col }) => col));

    columnsBody.replaceChildren(
      ...existing.columns.map((col) => {
        const pill = col.isNew ? ["new", t("import.status.new")] : ["skip", t("import.status.existing")];
        const status = el("td", {}, [el("span", { class: `status-pill status-pill-${pill[0]}`, text: pill[1] })]);
        return columnRow(col, { excluded: existing.excluded, rerender: renderExisting, status, locked: !col.isNew, linked: linked.has(col) });
      })
    );

    renderFormulasOption(included.filter(isComputed).length);
    renderWarnings([...resolved.warnings, ...twoWayWarnings(batch)]);
    actionBtn.disabled = busy || !known || included.length === 0;
    actionBtn.textContent = !known ? t("import.action.chooseTarget") : included.length === 0 ? t("import.action.noNewColumns") : tn("import.action.addColumns", included.length);
  }

  /** The checkbox that imports the formulas, offered when some of the columns to create have one. */
  function renderFormulasOption(count) {
    formulasRow.hidden = count === 0;
    formulasOption.checked = withFormulas;
    formulasLabel.textContent = tn("import.formulas.option", count);
  }

  function renderWarnings(more = []) {
    const texts = [...warnings, ...more].map(({ key, params, table }) => {
      const message = t(key, params);
      return table && parsed.length > 1 ? t("warn.tablePrefix", { tableId: table, message }) : message;
    });
    warningsBlock.hidden = texts.length === 0;
    warningsList.replaceChildren(...texts.map((text) => el("li", { text })));
  }

  async function onAction() {
    busy = analyzeBtn.disabled = actionBtn.disabled = true;
    try {
      await (mode() === "create" ? runCreate() : runAddColumns());
    } finally {
      busy = false;
      analyzeBtn.disabled = false;
      render();
      restoreFocus(actionBtn);
    }
  }

  async function runCreate() {
    const tables = entries.map((entry) => ({ id: entry.id.trim(), columns: entry.columns.filter((col) => !entry.excluded.has(col.id)) }));
    setStatus(tn("import.status.creating", tables.length));
    try {
      const { tables: created, note } = await createTables(grist, tables, { withFormulas });
      const columnsPhrase = tn("common.columnsCount", created.reduce((total, table) => total + table.columns.length, 0));
      const summary =
        created.length > 1
          ? t("import.success.createdMulti", { count: created.length, ids: created.map((table) => table.id).join(", "), columnsPhrase })
          : t("import.success.createdSingle", { id: created[0].id, columnsPhrase });
      clearResults();
      setStatus(summary + note, "success");
    } catch (err) {
      setStatus(t("import.error.createFailed", { error: reportError(err) }), "error");
    }
  }

  async function runAddColumns() {
    const target = targetTable();
    if (!target) return;
    setStatus(t("import.status.addingColumns", { table: target.tableId }));
    try {
      const { added, note } = await addColumns(grist, target, existing.columns.filter((col) => !existing.excluded.has(col.id)), { withFormulas });
      await loadSchema();
      if (added === 0) setStatus(t("import.info.noNewColumns", { table: target.tableId }));
      else setStatus(tn("import.success.columnsAdded", added, { table: target.tableId }) + note, "success");
    } catch (err) {
      setStatus(t("import.error.addColumnsFailed", { error: reportError(err) }), "error");
    }
  }
}
