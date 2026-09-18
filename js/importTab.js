import { parseGristSchema } from "./parser.js";
import { resolveColumnType, describeType, TABLE_ID_RE } from "./gristTypes.js";
import { el, clear } from "./dom.js";
import { fetchDocSchema, existingColumnIds } from "./schema.js";
import { withTimeout, errorMessage, pluralize, GRIST_CALL_TIMEOUT_MS } from "./util.js";

const TIMEOUT_MESSAGE = "Délai dépassé en attendant la réponse du document Grist.";

export function initImportTab(grist, gristAvailable) {
  const sourceInput = document.getElementById("source-input");
  const analyzeBtn = document.getElementById("analyze-btn");
  const modeBlock = document.getElementById("mode-block");
  const modeRadios = Array.from(document.querySelectorAll('input[name="import-mode"]'));
  const previewSection = document.getElementById("preview-section");
  const tablePickerRow = document.getElementById("table-picker-row");
  const tableSelect = document.getElementById("table-select");
  const tableIdRow = document.getElementById("table-id-row");
  const tableIdInput = document.getElementById("table-id-input");
  const tableIdError = document.getElementById("table-id-error");
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
  let selectedIndex = 0;
  let tableIdEditedByUser = false;
  let existingTableIds = null;
  let docSchema = null;
  let currentColumns = [];

  analyzeBtn.addEventListener("click", onAnalyze);
  tableSelect.addEventListener("change", onTableSelectionChange);
  tableIdInput.addEventListener("input", () => {
    tableIdEditedByUser = true;
    renderSelectedTable();
  });
  targetTableSelect.addEventListener("change", renderSelectedTable);
  for (const radio of modeRadios) radio.addEventListener("change", onModeChange);
  actionBtn.addEventListener("click", onAction);

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
    tableIdEditedByUser = false;
    selectedIndex = 0;
    existingTableIds = null;
    docSchema = null;

    const hasTables = tables.length > 0;
    modeBlock.hidden = !hasTables;
    previewSection.hidden = false;
    columnsPreview.hidden = !hasTables;
    createActions.hidden = !hasTables;
    tablePickerRow.hidden = true;

    if (!hasTables) {
      clear(columnsBody);
      currentColumns = [];
      actionBtn.disabled = true;
      renderWarnings(baseWarnings);
      return;
    }

    analyzeBtn.disabled = true;
    try {
      existingTableIds = await withTimeout(grist.docApi.listTables(), GRIST_CALL_TIMEOUT_MS, TIMEOUT_MESSAGE);
      await ensureDocSchema();
    } catch (err) {
      baseWarnings = [
        ...baseWarnings,
        `Impossible de récupérer les informations de ce document : ${errorMessage(err)}.`,
      ];
    } finally {
      analyzeBtn.disabled = false;
    }

    populateTableSelect(tables);
    if (mode() === "existing") populateTargetTableSelect();
    renderSelectedTable();
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
    updateModeUI();
    if (parsedTables.length > 0 && !docSchema && needsDocSchema()) {
      analyzeBtn.disabled = true;
      await ensureDocSchema();
      analyzeBtn.disabled = false;
    }
    if (mode() === "existing") populateTargetTableSelect();
    renderSelectedTable();
  }

  function updateModeUI() {
    const existing = mode() === "existing";
    tableIdRow.hidden = existing;
    targetTableRow.hidden = !existing;
    statusColumnHeader.hidden = !existing;
    if (!existing) actionBtn.textContent = "Créer la table dans ce document";
  }

  function populateTableSelect(tables) {
    clear(tableSelect);
    tables.forEach((table, index) => {
      tableSelect.appendChild(el("option", { value: String(index), text: table.tableId }));
    });
    tableSelect.value = "0";
    tablePickerRow.hidden = tables.length <= 1;
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
    tableIdEditedByUser = false;
    renderSelectedTable();
  }

  function renderSelectedTable() {
    const table = parsedTables[selectedIndex];
    if (!table) return;
    if (mode() === "create") renderCreateMode(table);
    else renderExistingMode(table);
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
    const match = docSchema.allColumns.find(
      (c) => c.parentId === targetTable.tableRef && c.colId === visibleColId
    );
    return match ? match.id : null;
  }

  function resolveColumns(table, targetTableId) {
    const resolutionWarnings = [];
    const resolvedColumns = table.columns.map((col) => {
      const resolved = resolveColumnType(col.dslType, col.argsRaw, col.id, resolutionWarnings);
      if (resolved.refTarget && existingTableIds) {
        const targetExists =
          resolved.refTarget === targetTableId || existingTableIds.includes(resolved.refTarget);
        if (!targetExists) {
          resolutionWarnings.push(
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
          resolutionWarnings.push(
            `Colonne « ${col.id} » : colonne d'affichage « ${resolved.visibleColId} » introuvable dans ` +
              `la table « ${resolved.refTarget} » de ce document, ignorée (visible_col).`
          );
        }
      }
      return { ...col, resolved };
    });
    return { resolvedColumns, resolutionWarnings };
  }

  function renderCreateMode(table) {
    if (!tableIdEditedByUser) tableIdInput.value = table.tableId;
    const { resolvedColumns, resolutionWarnings } = resolveColumns(table, tableIdInput.value.trim());

    clear(columnsBody);
    for (const col of resolvedColumns) {
      columnsBody.appendChild(
        el("tr", {}, [el("td", { text: col.id }), el("td", { text: describeType(col.resolved.type) })])
      );
    }

    currentColumns = resolvedColumns;
    renderWarnings([...baseWarnings, ...resolutionWarnings]);
    validateTableId();
  }

  function renderExistingMode(table) {
    const target = getTargetTable();
    const known = target && docSchema ? existingColumnIds(docSchema.allColumns, target.ref) : null;
    const { resolvedColumns: resolved, resolutionWarnings } = resolveColumns(table, target && target.tableId);
    const resolvedColumns = resolved.map((col) => ({ ...col, isNew: known ? !known.has(col.id) : true }));

    clear(columnsBody);
    for (const col of resolvedColumns) {
      columnsBody.appendChild(
        el("tr", {}, [
          el("td", { text: col.id }),
          el("td", { text: describeType(col.resolved.type) }),
          el("td", {}, [
            col.isNew
              ? el("span", { class: "status-pill status-pill-new", text: "Nouvelle" })
              : el("span", { class: "status-pill status-pill-skip", text: "Déjà présente" }),
          ]),
        ])
      );
    }

    currentColumns = resolvedColumns;
    renderWarnings([...baseWarnings, ...resolutionWarnings]);

    const newCount = resolvedColumns.filter((col) => col.isNew).length;
    actionBtn.disabled = !known || newCount === 0;
    actionBtn.textContent = !known
      ? "Choisissez une table à compléter"
      : newCount === 0
      ? "Aucune nouvelle colonne à ajouter"
      : `Ajouter ${newCount} ${pluralize(newCount, "colonne")} à cette table`;
  }

  function validateTableId() {
    const value = tableIdInput.value.trim();
    let message = "";
    if (!value) {
      message = "L'identifiant de table ne peut pas être vide.";
    } else if (!TABLE_ID_RE.test(value)) {
      message =
        "L'identifiant doit commencer par une lettre ou « _ » et ne contenir que des lettres, " +
        "chiffres et « _ » (pas d'espace ni d'accent).";
    } else if (existingTableIds && existingTableIds.includes(value)) {
      message = `Une table « ${value} » existe déjà dans ce document ; choisissez un autre identifiant.`;
    }
    tableIdError.hidden = !message;
    tableIdError.textContent = message;
    const valid = !message;
    actionBtn.disabled = !valid || currentColumns.length === 0;
    return valid;
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
      renderSelectedTable();
    }
  }

  async function runCreate() {
    if (currentColumns.length === 0 || !validateTableId()) return;
    const tableId = tableIdInput.value.trim();

    setStatus("Création de la table en cours…", "info");
    try {
      const freshTables = await withTimeout(grist.docApi.listTables(), GRIST_CALL_TIMEOUT_MS, TIMEOUT_MESSAGE);
      if (freshTables.includes(tableId)) {
        setStatus(`La table « ${tableId} » existe déjà dans ce document. Choisissez un autre identifiant.`, "error");
        return;
      }
      const columnsPayload = currentColumns.map(buildColumnPayload);
      await grist.docApi.applyUserActions([["AddTable", tableId, columnsPayload]]);
      existingTableIds = [...(existingTableIds || []), tableId];

      let visibleColNote = "";
      const visibleColActions = buildVisibleColActions(tableId, currentColumns);
      if (visibleColActions.length > 0) {
        // A separate call: AddTable's own column payload silently ignores a
        // `visibleCol` field (confirmed against Grist's own source, see
        // README.md), so it must be applied afterwards, exactly as Grist's
        // client itself does for "SHOW COLUMN". A failure here does not
        // undo the table/columns that were already created successfully.
        try {
          await grist.docApi.applyUserActions(visibleColActions);
        } catch (err) {
          const n = visibleColActions.length / 2;
          visibleColNote = ` ${pluralize(n, "Colonne", "Colonnes")} d'affichage (visible_col) ${pluralize(n, "non appliquée", "non appliquées")} : ${errorMessage(err)}.`;
        }
      }

      setStatus(
        `Table « ${tableId} » créée avec ${columnsPayload.length} ${pluralize(columnsPayload.length, "colonne")}.` +
          visibleColNote,
        "success"
      );
    } catch (err) {
      setStatus(`Échec de la création de la table : ${errorMessage(err)}`, "error");
    }
  }

  async function runAddColumns() {
    const target = getTargetTable();
    if (!target) return;

    setStatus(`Ajout des colonnes à « ${target.tableId} » en cours…`, "info");
    try {
      const freshSchema = await withTimeout(fetchDocSchema(grist), GRIST_CALL_TIMEOUT_MS, TIMEOUT_MESSAGE);
      const known = existingColumnIds(freshSchema.allColumns, target.ref);
      const newColumns = currentColumns.filter((col) => !known.has(col.id));

      if (newColumns.length === 0) {
        docSchema = freshSchema;
        setStatus(`Aucune nouvelle colonne : toutes existent déjà dans « ${target.tableId} ».`, "info");
        return;
      }

      const actions = newColumns.map((col) => ["AddColumn", target.tableId, col.id, buildColumnPayload(col)]);
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
