import { parseGristSchema } from "./parser.js";
import { el, clear, syncCheckedClass, statusWriter } from "./dom.js";
import { fetchDocSchema, existingColumnIds } from "./schema.js";
import { addColumns, checkTableId, createTables, defaultTableId, resolveColumns } from "./importer.js";
import { withTimeout, errorMessage, GRIST_CALL_TIMEOUT_MS } from "./util.js";
import { t, tn, typeLabel, onLocaleChange } from "./i18n.js";

const $ = (id) => document.getElementById(id);

export function initImportTab(grist, gristAvailable) {
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
  const warningsBlock = $("warnings-block");
  const warningsList = $("warnings-list");
  const createActions = $("create-actions");
  const actionBtn = $("action-btn");
  const announcement = $("import-announcement");
  const setStatus = statusWriter($("import-status-region"));

  if (!gristAvailable) {
    analyzeBtn.disabled = true;
    setStatus(t("error.noGristApi"), "error");
    return;
  }

  let parsed; // tables found in the source text
  let warnings; // about the text and about reading the document
  let docSchema; // this document's tables and columns, null when unreadable
  let createEntries; // "new table" mode, one per ticked table: { index, table, id, excluded, columns, input, error }
  let existingIndex; // "existing table" mode: which parsed table is the source
  let existingExcluded; // ... which of its columns are unticked
  let existingColumns; // ... and its resolved columns, each flagged isNew
  let busy = false;
  reset();

  const mode = () => modeRadios.find((radio) => radio.checked)?.value ?? "create";
  const render = () => (mode() === "existing" ? renderExisting() : renderCreate());
  const documentTableIds = () => docSchema?.tableIds ?? null;

  analyzeBtn.addEventListener("click", onAnalyze);
  clearBtn.addEventListener("click", onClear);
  sourceSelect.addEventListener("change", () => {
    existingIndex = Number(sourceSelect.value);
    existingExcluded = new Set();
    renderExisting();
  });
  checklist.addEventListener("change", onChecklistChange);
  targetSelect.addEventListener("change", renderExisting);
  for (const radio of modeRadios) radio.addEventListener("change", onModeChange);
  actionBtn.addEventListener("click", onAction);
  sourceInput.addEventListener("input", () => parsed.length > 0 && !busy && clearResults());
  onLocaleChange(render);

  syncCheckedClass(modeRadios, "is-checked", ".mode-card");
  updateModeUI();

  function reset() {
    parsed = [];
    warnings = [];
    docSchema = null;
    createEntries = [];
    existingIndex = 0;
    existingExcluded = new Set();
    existingColumns = [];
  }

  /** A disabled button drops the keyboard focus: give it back once the button is usable again. */
  function restoreFocus(button) {
    if (document.activeElement === document.body && !button.disabled) button.focus();
  }

  async function loadSchema() {
    analyzeBtn.disabled = true;
    try {
      docSchema = await withTimeout(fetchDocSchema(grist), GRIST_CALL_TIMEOUT_MS, t("error.timeout"));
    } catch (err) {
      docSchema = null;
      warnings = [...warnings, { key: "import.error.fetchDocInfo", params: { error: errorMessage(err) } }];
    } finally {
      analyzeBtn.disabled = false;
      restoreFocus(analyzeBtn);
    }
  }

  async function onAnalyze() {
    setStatus(null);
    reset();
    const result = parseGristSchema(sourceInput.value);
    parsed = result.tables;
    warnings = result.warnings;

    const found = parsed.length > 0;
    modeBlock.hidden = columnsPreview.hidden = createActions.hidden = !found;
    previewSection.hidden = false;
    if (!found) {
      for (const node of [columnsBody, tableIdsList, checklist]) clear(node);
      sourcePickerRow.hidden = checklistRow.hidden = tableIdRow.hidden = targetRow.hidden = true;
      actionBtn.disabled = true;
      renderWarnings();
      announcement.textContent = t("import.announce.none");
      return;
    }

    setStatus(t("import.status.analyzing"));
    await loadSchema();
    setStatus(null);

    fillSourceSelect();
    fillChecklist();
    fillTargetSelect();
    updateModeUI();
    createEntries = parsed.map((table, index) => newEntry(table, index));
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
    for (const node of [columnsBody, tableIdsList, checklist, warningsList]) clear(node);
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
    const existing = mode() === "existing";
    const several = parsed.length > 1;
    tableIdRow.hidden = existing;
    sourcePickerRow.hidden = !(existing && several);
    checklistRow.hidden = existing || !several;
    targetRow.hidden = !existing;
    statusHeader.hidden = !existing;
  }

  function fillSourceSelect() {
    clear(sourceSelect);
    parsed.forEach((table, index) => sourceSelect.appendChild(el("option", { value: String(index), text: table.tableId })));
  }

  function fillChecklist() {
    clear(checklist);
    parsed.forEach((table, index) => {
      const input = el("input", { type: "checkbox", value: String(index), checked: true });
      checklist.appendChild(el("li", {}, [el("label", {}, [input, el("span", { text: table.tableId })])]));
    });
  }

  function fillTargetSelect() {
    clear(targetSelect);
    const problem = !docSchema ? "import.error.noTableList" : docSchema.tables.length === 0 ? "import.error.noTablesToComplete" : null;
    targetError.hidden = !problem;
    targetError.textContent = problem ? t(problem) : "";
    for (const table of docSchema?.tables ?? []) {
      targetSelect.appendChild(el("option", { value: String(table.tableRef), text: table.tableId }));
    }
  }

  const targetTable = () => docSchema?.tables.find((table) => String(table.tableRef) === targetSelect.value) ?? null;

  function newEntry(table, index) {
    return { index, table, id: defaultTableId(table.tableId), excluded: new Set() };
  }

  /** Keeps the entry (id typed, columns unticked) of every table that stays ticked. */
  function onChecklistChange() {
    const ticked = parsed.length > 1 ? Array.from(checklist.querySelectorAll("input:checked")).map((input) => Number(input.value)) : [0];
    const previous = new Map(createEntries.map((entry) => [entry.index, entry]));
    createEntries = ticked.map((index) => previous.get(index) ?? newEntry(parsed[index], index));
    renderTableIds();
    renderCreate();
  }

  function renderTableIds() {
    clear(tableIdsList);
    createEntries.forEach((entry, position) => {
      const inputId = `table-id-${position}`;
      entry.input = el("input", { type: "text", id: inputId, autocomplete: "off", value: entry.id, "aria-describedby": `${inputId}-error` });
      entry.error = el("p", { class: "field-error", id: `${inputId}-error`, hidden: true });
      entry.input.addEventListener("input", () => {
        entry.id = entry.input.value;
        renderCreate();
      });
      tableIdsList.appendChild(el("div", { class: "table-id-entry" }, [el("label", { text: entry.table.tableId, for: inputId }), entry.input, entry.error]));
    });
  }

  /** One row per column, with a checkbox that takes it out of (or back into) what will be applied; `locked` for a column that is there already. */
  function columnRow(col, excluded, statusCell, rerender, locked = false) {
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
    const cells = [el("td", { class: "col-checkbox" }, [checkbox]), el("td", { text: col.id }), el("td", { text: typeLabel(col.type) })];
    return el("tr", {}, statusCell ? [...cells, statusCell] : cells);
  }

  /** Re-resolves and re-validates every ticked table: called after each change the user makes. */
  function renderCreate() {
    const several = createEntries.length > 1;
    const destination = new Map(createEntries.map((entry) => [entry.table.tableId, entry.id.trim()]));
    const notes = [];
    let valid = createEntries.length > 0;
    let anyColumn = false;

    clear(columnsBody);
    for (const entry of createEntries) {
      const id = entry.id.trim();
      const resolved = resolveColumns(entry.table, destination, documentTableIds(), entry.excluded);
      entry.columns = resolved.columns;
      notes.push(...resolved.warnings.map((warning) => ({ ...warning, table: id || entry.table.tableId })));

      if (several) columnsBody.appendChild(el("tr", { class: "table-separator" }, [el("td", { colspan: "3", text: id || entry.table.tableId })]));
      for (const col of entry.columns) columnsBody.appendChild(columnRow(col, entry.excluded, null, renderCreate));
      anyColumn ||= entry.columns.some((col) => !entry.excluded.has(col.id));

      const others = createEntries.filter((other) => other !== entry).map((other) => other.id.trim());
      const problem = checkTableId(id, documentTableIds(), others);
      entry.error.hidden = !problem;
      entry.error.textContent = problem ? t(problem, { id }) : "";
      entry.input.setAttribute("aria-invalid", String(Boolean(problem)));
      valid &&= !problem;
    }

    renderWarnings(notes);
    actionBtn.disabled = busy || !valid || !anyColumn;
    actionBtn.textContent = several ? tn("import.action.createTables", createEntries.length) : t("import.action.create");
  }

  function renderExisting() {
    const table = parsed[existingIndex];
    if (!table) return;
    const target = targetTable();
    const known = target ? existingColumnIds(docSchema.allColumns, target.tableRef) : null;
    const resolved = resolveColumns(table, new Map(target ? [[table.tableId, target.tableId]] : []), documentTableIds(), existingExcluded);
    existingColumns = resolved.columns.map((col) => ({ ...col, isNew: !known || !known.has(col.id.toLowerCase()) }));

    clear(columnsBody);
    for (const col of existingColumns) {
      const pill = col.isNew ? ["new", t("import.status.new")] : ["skip", t("import.status.existing")];
      const status = el("td", {}, [el("span", { class: `status-pill status-pill-${pill[0]}`, text: pill[1] })]);
      columnsBody.appendChild(columnRow(col, existingExcluded, status, renderExisting, !col.isNew));
    }

    renderWarnings(resolved.warnings);
    const newCount = existingColumns.filter((col) => col.isNew && !existingExcluded.has(col.id)).length;
    actionBtn.disabled = busy || !known || newCount === 0;
    actionBtn.textContent = !known
      ? t("import.action.chooseTarget")
      : newCount === 0
      ? t("import.action.noNewColumns")
      : tn("import.action.addColumns", newCount);
  }

  function renderWarnings(more = []) {
    const all = [...warnings, ...more].map(({ key, params, table }) => {
      const message = t(key, params);
      return table && parsed.length > 1 ? t("warn.tablePrefix", { tableId: table, message }) : message;
    });
    clear(warningsList);
    warningsBlock.hidden = all.length === 0;
    for (const text of all) warningsList.appendChild(el("li", { text }));
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
    const tables = createEntries.map((entry) => ({
      id: entry.id.trim(),
      columns: entry.columns.filter((col) => !entry.excluded.has(col.id)),
    }));
    setStatus(tn("import.status.creating", tables.length));
    try {
      const { tables: created, note } = await createTables(grist, tables);
      await loadSchema();
      const columnsPhrase = tn("common.columnsCount", created.reduce((total, table) => total + table.columns.length, 0));
      const summary =
        created.length > 1
          ? t("import.success.createdMulti", { count: created.length, ids: created.map((table) => table.id).join(", "), columnsPhrase })
          : t("import.success.createdSingle", { id: created[0].id, columnsPhrase });
      parsed = createEntries = [];
      previewSection.hidden = modeBlock.hidden = true;
      setStatus(summary + note, "success");
    } catch (err) {
      setStatus(t("import.error.createFailed", { error: errorMessage(err) }), "error");
    }
  }

  async function runAddColumns() {
    const target = targetTable();
    if (!target) return;
    setStatus(t("import.status.addingColumns", { table: target.tableId }));
    try {
      const { added, note } = await addColumns(grist, target, existingColumns.filter((col) => !existingExcluded.has(col.id)));
      await loadSchema();
      if (added === 0) setStatus(t("import.info.noNewColumns", { table: target.tableId }));
      else setStatus(tn("import.success.columnsAdded", added, { table: target.tableId }) + note, "success");
    } catch (err) {
      setStatus(t("import.error.addColumnsFailed", { error: errorMessage(err) }), "error");
    }
  }
}
