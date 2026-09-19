import { parseGristSchema } from "./parser.js";
import { resolveColumnType, describeType, TABLE_ID_RE } from "./gristTypes.js";
import { el, clear, syncCheckedClass } from "./dom.js";
import { fetchDocSchema, existingColumnIds } from "./schema.js";
import { withTimeout, errorMessage, pluralize, GRIST_CALL_TIMEOUT_MS } from "./util.js";

const TIMEOUT_MESSAGE = "Délai dépassé en attendant la réponse du document Grist.";

export function initImportTab(grist, gristAvailable) {
  const sourceInput = document.getElementById("source-input");
  const analyzeBtn = document.getElementById("analyze-btn");
  const clearBtn = document.getElementById("clear-btn");
  const modeBlock = document.getElementById("mode-block");
  const modeRadios = Array.from(document.querySelectorAll('input[name="import-mode"]'));
  const previewSection = document.getElementById("preview-section");
  const tablePickerRow = document.getElementById("table-picker-row");
  const tableSelect = document.getElementById("table-select");
  const tableMultiPickerRow = document.getElementById("table-multi-picker-row");
  const tableMultiSelect = document.getElementById("table-multi-select");
  const tableIdRow = document.getElementById("table-id-row");
  const tableIdsList = document.getElementById("table-ids-list");
  const targetTableRow = document.getElementById("target-table-row");
  const targetTableSelect = document.getElementById("target-table-select");
  const targetTableError = document.getElementById("target-table-error");
  const columnsPreview = document.getElementById("columns-preview");
  const statusColumnHeader = document.getElementById("status-column-header");
  const columnsBody = document.getElementById("columns-preview-body");
  const warningsBlock = document.getElementById("warnings-block");
  const warningsList = document.getElementById("warnings-list");
  const createActions = document.getElementById("create-actions");
  const actionBtn = document.getElementById("action-btn");
  const statusRegion = document.getElementById("import-status-region");

  if (!gristAvailable) {
    analyzeBtn.disabled = true;
    setStatus(
      "Impossible de trouver l'API Grist. Ouvrez cette page en tant que widget personnalisé " +
        "dans un document Grist (elle ne fonctionne pas seule, hors d'un document).",
      "error"
    );
    return;
  }

  let parsedTables = [];
  let baseWarnings = [];
  let selectedIndex = 0; // "Table existante" mode: which parsed table is the source.
  let existingTableIds = null;
  let docSchema = null;
  let existingModeColumns = []; // "Table existante" mode: resolved columns of the source table.
  // "Table existante" mode: column ids the user has unchecked in the
  // preview (see columnRow below), reset whenever the source table or the
  // parsed input changes, since the set of candidate columns changes too.
  let existingModeExcludedColIds = new Set();

  // "Nouvelle table" mode: one entry per parsed table the user has checked
  // to create, each owning its own destination-id <input>/error <p> (see
  // renderTableIdsList), its own resolved columns (see renderCreateMode),
  // and its own excludedColIds Set (columns unchecked in the preview for
  // this specific table).
  // { index, table, id, inputEl, errorEl, resolvedColumns, excludedColIds }
  let createTableEntries = [];

  analyzeBtn.addEventListener("click", onAnalyze);
  clearBtn.addEventListener("click", onClear);
  tableSelect.addEventListener("change", onTableSelectionChange);
  tableMultiSelect.addEventListener("change", onCreateSelectionChange);
  targetTableSelect.addEventListener("change", () => renderExistingMode(parsedTables[selectedIndex]));
  for (const radio of modeRadios) radio.addEventListener("change", onModeChange);
  actionBtn.addEventListener("click", onAction);

  syncCheckedClass(modeRadios, "is-checked", ".mode-card");
  updateModeUI();

  function mode() {
    const checked = modeRadios.find((radio) => radio.checked);
    return checked ? checked.value : "create";
  }

  async function onAnalyze() {
    setStatus(null);
    const { tables, warnings } = parseGristSchema(sourceInput.value);
    parsedTables = tables;
    baseWarnings = warnings;
    selectedIndex = 0;
    existingTableIds = null;
    docSchema = null;
    existingModeExcludedColIds = new Set();
    createTableEntries = [];

    const hasTables = tables.length > 0;
    modeBlock.hidden = !hasTables;
    previewSection.hidden = false;
    columnsPreview.hidden = !hasTables;
    createActions.hidden = !hasTables;

    if (!hasTables) {
      clear(columnsBody);
      clear(tableIdsList);
      clear(tableMultiSelect);
      existingModeColumns = [];
      tablePickerRow.hidden = true;
      tableMultiPickerRow.hidden = true;
      actionBtn.disabled = true;
      renderWarnings(baseWarnings);
      return;
    }

    analyzeBtn.disabled = true;
    setStatus("Analyse du document en cours…", "info");
    try {
      existingTableIds = await withTimeout(grist.docApi.listTables(), GRIST_CALL_TIMEOUT_MS, TIMEOUT_MESSAGE);
      await ensureDocSchema();
      setStatus(null);
    } catch (err) {
      baseWarnings = [
        ...baseWarnings,
        `Impossible de récupérer les informations de ce document : ${errorMessage(err)}.`,
      ];
      setStatus(null);
    } finally {
      analyzeBtn.disabled = false;
    }

    populateTableSelect(tables);
    populateTableMultiSelect(tables);
    updateModeUI();
    onCreateSelectionChange();
    if (mode() === "existing") {
      populateTargetTableSelect();
      renderExistingMode(parsedTables[selectedIndex]);
    }
  }

  /**
   * Resets the Import tab to its pristine, pre-Analyser state: empty source
   * text, mode back to the recommended default, nothing parsed. Distinct
   * from onAnalyze()'s own "nothing found" branch, which still shows the
   * preview section (with a warning) since that follows an actual attempt —
   * Effacer means starting over, so the preview section is hidden entirely
   * rather than shown empty.
   */
  function onClear() {
    sourceInput.value = "";
    parsedTables = [];
    baseWarnings = [];
    selectedIndex = 0;
    existingTableIds = null;
    docSchema = null;
    existingModeColumns = [];
    existingModeExcludedColIds = new Set();
    createTableEntries = [];

    for (const radio of modeRadios) radio.checked = radio.value === "create";
    syncCheckedClass(modeRadios, "is-checked", ".mode-card");

    modeBlock.hidden = true;
    previewSection.hidden = true;
    clear(columnsBody);
    clear(tableIdsList);
    clear(tableMultiSelect);
    clear(warningsList);
    warningsBlock.hidden = true;
    actionBtn.disabled = true;
    setStatus(null);
    sourceInput.focus();
  }

  async function fetchSchemaSafely() {
    try {
      return await withTimeout(fetchDocSchema(grist), GRIST_CALL_TIMEOUT_MS, TIMEOUT_MESSAGE);
    } catch (err) {
      baseWarnings = [
        ...baseWarnings,
        `Impossible de lire les tables existantes de ce document : ${errorMessage(err)}.`,
      ];
      return null;
    }
  }

  /**
   * "Table existante" mode always needs the full document schema (to list
   * target tables and detect already-present columns). "Nouvelle table"
   * mode does not, *unless* at least one parsed column carries a
   * `visible_col=` kwarg (this widget's own extension, see
   * js/gristTypes.js), which can only be resolved to a real row id by
   * looking up the target table's columns in that same schema (see
   * resolveVisibleColRef below) — so it is fetched lazily in that case too,
   * to avoid an unnecessary extra read for the common case.
   */
  function needsDocSchema() {
    return mode() === "existing" || parsedTables.some((table) => table.columns.some((col) => col.argsRaw.includes("visible_col")));
  }

  async function ensureDocSchema() {
    if (docSchema || !needsDocSchema()) return docSchema;
    docSchema = await fetchSchemaSafely();
    return docSchema;
  }

  async function onModeChange() {
    syncCheckedClass(modeRadios, "is-checked", ".mode-card");
    updateModeUI();
    if (parsedTables.length > 0 && !docSchema && needsDocSchema()) {
      analyzeBtn.disabled = true;
      await ensureDocSchema();
      analyzeBtn.disabled = false;
    }
    if (mode() === "existing") {
      populateTargetTableSelect();
      renderExistingMode(parsedTables[selectedIndex]);
    } else {
      renderCreateMode();
    }
  }

  function updateModeUI() {
    const existing = mode() === "existing";
    const multi = parsedTables.length > 1;
    tableIdRow.hidden = existing;
    tablePickerRow.hidden = !(existing && multi);
    tableMultiPickerRow.hidden = !(!existing && multi);
    targetTableRow.hidden = !existing;
    statusColumnHeader.hidden = !existing;
  }

  function populateTableSelect(tables) {
    clear(tableSelect);
    tables.forEach((table, index) => {
      tableSelect.appendChild(el("option", { value: String(index), text: table.tableId }));
    });
    tableSelect.value = "0";
  }

  function populateTableMultiSelect(tables) {
    clear(tableMultiSelect);
    tables.forEach((table, index) => {
      tableMultiSelect.appendChild(
        el("li", {}, [
          el("label", {}, [
            el("input", { type: "checkbox", value: String(index), checked: true }),
            el("span", { text: table.tableId }),
          ]),
        ])
      );
    });
  }

  function populateTargetTableSelect() {
    clear(targetTableSelect);
    if (!docSchema) {
      targetTableError.hidden = false;
      targetTableError.textContent = "Impossible de charger la liste des tables de ce document.";
      return;
    }
    if (docSchema.tables.length === 0) {
      targetTableError.hidden = false;
      targetTableError.textContent = "Ce document ne contient aucune table à compléter.";
      return;
    }
    targetTableError.hidden = true;
    for (const table of docSchema.tables) {
      targetTableSelect.appendChild(el("option", { value: String(table.tableRef), text: table.tableId }));
    }
  }

  function getTargetTable() {
    if (!targetTableSelect.value) return null;
    const option = targetTableSelect.selectedOptions[0];
    return { ref: Number(targetTableSelect.value), tableId: option ? option.textContent : null };
  }

  function onTableSelectionChange() {
    selectedIndex = Number(tableSelect.value);
    existingModeExcludedColIds = new Set();
    renderExistingMode(parsedTables[selectedIndex]);
  }

  /**
   * Which parsed-table indices are checked, for "Nouvelle table" mode. When
   * there is only one parsed table, the checklist is never shown (nothing
   * to choose) and that single table always counts as selected.
   */
  function getSelectedCreateIndices() {
    if (parsedTables.length <= 1) return parsedTables.map((_, index) => index);
    return Array.from(tableMultiSelect.querySelectorAll("input:checked")).map((input) => Number(input.value));
  }

  /**
   * Rebuilds `createTableEntries` from the current checklist selection,
   * reusing (rather than resetting) the entry — and whatever destination id
   * and per-column inclusion choices the user already made in it — for a
   * table that stays selected across a checkbox change, per README.md's
   * "en une étape" requirement.
   */
  function onCreateSelectionChange() {
    const indices = getSelectedCreateIndices();
    const previous = new Map(createTableEntries.map((entry) => [entry.index, entry]));
    createTableEntries = indices.map(
      (index) => previous.get(index) || { index, table: parsedTables[index], id: parsedTables[index].tableId, excludedColIds: new Set() }
    );
    renderTableIdsList();
    renderCreateMode();
  }

  function renderTableIdsList() {
    clear(tableIdsList);
    for (const entry of createTableEntries) {
      const input = el("input", { type: "text", autocomplete: "off", value: entry.id });
      const errorEl = el("p", { class: "field-error", hidden: true });
      input.addEventListener("input", () => {
        entry.id = input.value;
        renderCreateMode();
      });
      entry.inputEl = input;
      entry.errorEl = errorEl;
      tableIdsList.appendChild(el("div", { class: "table-id-entry" }, [el("label", { text: entry.table.tableId }), input, errorEl]));
    }
  }

  /**
   * @param excludedColIds Columns to skip when producing resolutionWarnings
   * (still resolved and returned in resolvedColumns, just silently — a
   * warning about a column the user has excluded from this action is noise,
   * not something to act on).
   */
  function resolveColumns(table, targetTableId, excludedColIds) {
    const resolutionWarnings = [];
    const resolvedColumns = table.columns.map((col) => {
      const columnWarnings = excludedColIds.has(col.id) ? [] : resolutionWarnings;
      const resolved = resolveColumnType(col.dslType, col.argsRaw, col.id, columnWarnings);
      if (resolved.refTarget && existingTableIds) {
        const targetExists =
          resolved.refTarget === targetTableId || existingTableIds.includes(resolved.refTarget);
        if (!targetExists) {
          columnWarnings.push(
            `Colonne « ${col.id} » : la table cible « ${resolved.refTarget} » n'existe pas dans ce ` +
              "document, importée en tant que « Any » (vous pourrez la reconfigurer en Référence " +
              "une fois la table cible créée)."
          );
          resolved.type = "Any";
          resolved.widgetOptions = null;
          resolved.visibleColId = null;
        }
      }
      if (resolved.visibleColId && (resolved.type.startsWith("Ref:") || resolved.type.startsWith("RefList:"))) {
        resolved.visibleColRef = resolveVisibleColRef(resolved.refTarget, resolved.visibleColId);
        if (!resolved.visibleColRef) {
          columnWarnings.push(
            `Colonne « ${col.id} » : colonne d'affichage « ${resolved.visibleColId} » introuvable dans ` +
              `la table « ${resolved.refTarget} » de ce document, ignorée (visible_col).`
          );
        }
      }
      return { ...col, resolved };
    });
    return { resolvedColumns, resolutionWarnings };
  }

  /**
   * Resolves a `visible_col='TargetColId'` kwarg (see js/gristTypes.js) to
   * the target column's real row id, by looking it up in the destination
   * document's own schema. Only possible when the referenced table already
   * exists there — which is required anyway for the column to import as a
   * Reference/ReferenceList rather than `Any` (see resolveColumns above) —
   * so this never needs to reason about a table created in the same
   * request. Returns null (caller then warns and drops it) when the schema
   * isn't available or the named column isn't found there.
   */
  function resolveVisibleColRef(refTarget, visibleColId) {
    if (!docSchema) return null;
    const targetTable = docSchema.tables.find((t) => t.tableId === refTarget);
    if (!targetTable) return null;
    const match = docSchema.allColumns.find((c) => c.parentId === targetTable.tableRef && c.colId === visibleColId);
    return match ? match.id : null;
  }

  /**
   * One <tr> for a column in the preview table, with a leading checkbox
   * (per-column inclusion — see README.md) that toggles membership in
   * `excludedColIds` and re-renders. `statusCell` is an extra trailing
   * <td> ("Nouvelle"/"Déjà présente"), only used by "Table existante" mode.
   */
  function columnRow(col, excludedColIds, statusCell, rerender) {
    const checkbox = el("input", {
      type: "checkbox",
      checked: !excludedColIds.has(col.id),
      "aria-label": `Inclure la colonne « ${col.id} »`,
    });
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) excludedColIds.delete(col.id);
      else excludedColIds.add(col.id);
      rerender();
    });
    const cells = [
      el("td", { class: "col-checkbox" }, [checkbox]),
      el("td", { text: col.id }),
      el("td", { text: describeType(col.resolved.type) }),
    ];
    if (statusCell) cells.push(statusCell);
    return el("tr", {}, cells);
  }

  /**
   * Renders the combined preview for every checked table in "Nouvelle
   * table" mode: one discreet separator row per table (only shown when more
   * than one is selected — a single table's preview stays exactly as
   * before) followed by its columns (each with its own inclusion checkbox —
   * see columnRow), and one destination-id field per table (see
   * renderTableIdsList). Re-resolves and re-validates everything on every
   * call, so it stays correct whether triggered by Analyser, a checklist
   * change, typing into any id field, or toggling a column checkbox.
   */
  function renderCreateMode() {
    const multi = createTableEntries.length > 1;
    const idCounts = new Map();
    for (const entry of createTableEntries) {
      const value = entry.id.trim();
      idCounts.set(value, (idCounts.get(value) || 0) + 1);
    }

    clear(columnsBody);
    const allWarnings = [];
    let anyColumns = false;
    let allValid = createTableEntries.length > 0;

    for (const entry of createTableEntries) {
      const destId = entry.id.trim();
      const { resolvedColumns, resolutionWarnings } = resolveColumns(entry.table, destId, entry.excludedColIds);
      entry.resolvedColumns = resolvedColumns;
      allWarnings.push(
        ...(multi ? resolutionWarnings.map((warning) => `Table « ${destId || entry.table.tableId} » — ${warning}`) : resolutionWarnings)
      );

      if (multi) {
        columnsBody.appendChild(
          el("tr", { class: "table-separator" }, [el("td", { colspan: "3", text: destId || entry.table.tableId })])
        );
      }
      for (const col of resolvedColumns) {
        columnsBody.appendChild(columnRow(col, entry.excludedColIds, null, renderCreateMode));
        anyColumns = true;
      }

      const isDuplicate = idCounts.get(destId) > 1;
      if (!validateOneTableId(entry, isDuplicate)) allValid = false;
    }

    renderWarnings([...baseWarnings, ...allWarnings]);
    actionBtn.disabled = !allValid || !anyColumns;
    actionBtn.textContent = multi
      ? `Créer ${createTableEntries.length} tables dans ce document`
      : "Créer la table dans ce document";
  }

  function validateOneTableId(entry, isDuplicate) {
    const value = entry.id.trim();
    let message = "";
    if (!value) {
      message = "L'identifiant ne peut pas être vide.";
    } else if (!TABLE_ID_RE.test(value)) {
      message =
        "L'identifiant doit commencer par une lettre ou « _ » et ne contenir que des lettres, " +
        "chiffres et « _ » (pas d'espace ni d'accent).";
    } else if (isDuplicate) {
      message = "Identifiant utilisé plusieurs fois dans cette sélection.";
    } else if (existingTableIds && existingTableIds.includes(value)) {
      message = `Une table « ${value} » existe déjà dans ce document ; choisissez un autre identifiant.`;
    }
    entry.errorEl.hidden = !message;
    entry.errorEl.textContent = message;
    return !message;
  }

  function renderExistingMode(table) {
    if (!table) return;
    const target = getTargetTable();
    const known = target && docSchema ? existingColumnIds(docSchema.allColumns, target.ref) : null;
    const { resolvedColumns: resolved, resolutionWarnings } = resolveColumns(table, target && target.tableId, existingModeExcludedColIds);
    const resolvedColumns = resolved.map((col) => ({ ...col, isNew: known ? !known.has(col.id) : true }));

    clear(columnsBody);
    for (const col of resolvedColumns) {
      const statusCell = el("td", {}, [
        col.isNew
          ? el("span", { class: "status-pill status-pill-new", text: "Nouvelle" })
          : el("span", { class: "status-pill status-pill-skip", text: "Déjà présente" }),
      ]);
      columnsBody.appendChild(columnRow(col, existingModeExcludedColIds, statusCell, () => renderExistingMode(table)));
    }

    existingModeColumns = resolvedColumns;
    renderWarnings([...baseWarnings, ...resolutionWarnings]);

    const newCount = resolvedColumns.filter((col) => col.isNew && !existingModeExcludedColIds.has(col.id)).length;
    actionBtn.disabled = !known || newCount === 0;
    actionBtn.textContent = !known
      ? "Choisissez une table à compléter"
      : newCount === 0
      ? "Aucune nouvelle colonne à ajouter"
      : `Ajouter ${newCount} ${pluralize(newCount, "colonne")} à cette table`;
  }

  function renderWarnings(list) {
    clear(warningsList);
    warningsBlock.hidden = list.length === 0;
    for (const warning of list) warningsList.appendChild(el("li", { text: warning }));
  }

  async function onAction() {
    analyzeBtn.disabled = true;
    actionBtn.disabled = true;
    try {
      if (mode() === "create") await runCreate();
      else await runAddColumns();
    } finally {
      analyzeBtn.disabled = false;
      if (mode() === "existing") renderExistingMode(parsedTables[selectedIndex]);
      else renderCreateMode();
    }
  }

  async function runCreate() {
    if (createTableEntries.length === 0) return;
    renderCreateMode();
    if (createTableEntries.some((entry) => !entry.errorEl.hidden) || createTableEntries.every((entry) => entry.resolvedColumns.length === 0)) {
      return;
    }

    const multi = createTableEntries.length > 1;
    setStatus(multi ? "Création des tables en cours…" : "Création de la table en cours…", "info");
    try {
      const freshTables = await withTimeout(grist.docApi.listTables(), GRIST_CALL_TIMEOUT_MS, TIMEOUT_MESSAGE);
      const collisions = createTableEntries.filter((entry) => freshTables.includes(entry.id.trim()));
      if (collisions.length > 0) {
        setStatus(
          `${pluralize(collisions.length, "Cette table existe", "Ces tables existent")} déjà dans ce document : ` +
            `${collisions.map((entry) => entry.id.trim()).join(", ")}. Choisissez d'autres identifiants.`,
          "error"
        );
        return;
      }

      const includedColumns = (entry) => entry.resolvedColumns.filter((col) => !entry.excludedColIds.has(col.id));
      const addTableActions = createTableEntries.map((entry) => [
        "AddTable",
        entry.id.trim(),
        includedColumns(entry).map(buildColumnPayload),
      ]);
      await grist.docApi.applyUserActions(addTableActions);
      existingTableIds = [...(existingTableIds || []), ...createTableEntries.map((entry) => entry.id.trim())];

      let visibleColNote = "";
      const allVisibleColActions = createTableEntries.flatMap((entry) =>
        buildVisibleColActions(entry.id.trim(), includedColumns(entry))
      );
      if (allVisibleColActions.length > 0) {
        try {
          await grist.docApi.applyUserActions(allVisibleColActions);
        } catch (err) {
          const n = allVisibleColActions.length / 2;
          visibleColNote = ` ${pluralize(n, "Colonne", "Colonnes")} d'affichage (visible_col) ${pluralize(n, "non appliquée", "non appliquées")} : ${errorMessage(err)}.`;
        }
      }

      const totalColumns = createTableEntries.reduce((n, entry) => n + includedColumns(entry).length, 0);
      const summary = multi
        ? `${createTableEntries.length} tables créées (${createTableEntries.map((entry) => entry.id.trim()).join(", ")}), ` +
          `${totalColumns} ${pluralize(totalColumns, "colonne")} au total.`
        : `Table « ${createTableEntries[0].id.trim()} » créée avec ${totalColumns} ${pluralize(totalColumns, "colonne")}.`;
      setStatus(summary + visibleColNote, "success");
    } catch (err) {
      setStatus(`Échec de la création : ${errorMessage(err)}`, "error");
    }
  }

  async function runAddColumns() {
    const target = getTargetTable();
    if (!target) return;

    setStatus(`Ajout des colonnes à « ${target.tableId} » en cours…`, "info");
    try {
      const freshSchema = await withTimeout(fetchDocSchema(grist), GRIST_CALL_TIMEOUT_MS, TIMEOUT_MESSAGE);
      const known = existingColumnIds(freshSchema.allColumns, target.ref);
      const newColumns = existingModeColumns.filter((col) => !known.has(col.id) && !existingModeExcludedColIds.has(col.id));

      if (newColumns.length === 0) {
        docSchema = freshSchema;
        setStatus(`Aucune nouvelle colonne : toutes existent déjà dans « ${target.tableId} » ou ont été décochées.`, "info");
        return;
      }

      // AddVisibleColumn, not the plainer AddColumn: AddColumn only adds the
      // column to the table's schema and to its "raw data" section — it
      // stays invisible on any regular grid/card view already on a page,
      // only showing up under Raw Data. AddVisibleColumn (same signature)
      // additionally adds a field for the column to every existing 'record'
      // view section of that table, exactly like the "+" column button
      // does in Grist's own grid view. See README.md/SECURITY.md.
      const actions = newColumns.map((col) => ["AddVisibleColumn", target.tableId, col.id, buildColumnPayload(col)]);
      await grist.docApi.applyUserActions(actions);

      let visibleColNote = "";
      const visibleColActions = buildVisibleColActions(target.tableId, newColumns);
      if (visibleColActions.length > 0) {
        try {
          await grist.docApi.applyUserActions(visibleColActions);
        } catch (err) {
          const n = visibleColActions.length / 2;
          visibleColNote = ` ${pluralize(n, "Colonne", "Colonnes")} d'affichage (visible_col) ${pluralize(n, "non appliquée", "non appliquées")} : ${errorMessage(err)}.`;
        }
      }

      docSchema = freshSchema;
      for (const col of newColumns) {
        docSchema.allColumns.push({
          parentId: target.ref,
          colId: col.id,
          isFormula: false,
          formula: "",
          type: col.resolved.type,
          parentPos: Infinity,
        });
      }
      setStatus(
        `${newColumns.length} ${pluralize(newColumns.length, "colonne")} ` +
          `${pluralize(newColumns.length, "ajoutée", "ajoutées")} à « ${target.tableId} ».` +
          visibleColNote,
        "success"
      );
    } catch (err) {
      setStatus(`Échec de l'ajout des colonnes : ${errorMessage(err)}`, "error");
    }
  }

  function buildColumnPayload(col) {
    const payload = {
      id: col.id,
      type: col.resolved.type,
      isFormula: false,
      formula: "",
      label: col.resolved.label || col.id,
    };
    if (col.resolved.description) payload.description = col.resolved.description;
    if (col.resolved.widgetOptions) payload.widgetOptions = JSON.stringify(col.resolved.widgetOptions);
    return payload;
  }

  /**
   * Builds the follow-up actions that set a `visible_col`-resolved display
   * column on the columns that just got created (see resolveVisibleColRef
   * above): `ModifyColumn` to store the real row id in `visibleCol`, and
   * `SetDisplayFormula` so the column also actually *displays* the target's
   * value instead of the raw reference — reproducing exactly the two
   * actions Grist's own client sends together when a user picks "SHOW
   * COLUMN" in the real UI (see README.md's "visible_col" note). Only ever
   * targets `cols` (columns this same action just added), never touching a
   * pre-existing column.
   */
  function buildVisibleColActions(tableId, cols) {
    const actions = [];
    for (const col of cols) {
      if (!col.resolved.visibleColRef) continue;
      actions.push(["ModifyColumn", tableId, col.id, { visibleCol: col.resolved.visibleColRef }]);
      actions.push(["SetDisplayFormula", tableId, null, col.id, `$${col.id}.${col.resolved.visibleColId}`]);
    }
    return actions;
  }

  function setStatus(message, level) {
    clear(statusRegion);
    if (!message) return;
    statusRegion.appendChild(el("p", { class: `status status-${level || "info"}`, text: message }));
  }
}
