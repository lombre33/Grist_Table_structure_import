import { parseGristSchema } from "./parser.js";
import { resolveColumnType, describeType, TABLE_ID_RE } from "./gristTypes.js";
import { el, clear } from "./dom.js";

const GRIST_CALL_TIMEOUT_MS = 8000;

const sourceInput = document.getElementById("source-input");
const analyzeBtn = document.getElementById("analyze-btn");
const previewSection = document.getElementById("preview-section");
const tablePickerRow = document.getElementById("table-picker-row");
const tableSelect = document.getElementById("table-select");
const tableIdRow = document.getElementById("table-id-row");
const tableIdInput = document.getElementById("table-id-input");
const tableIdError = document.getElementById("table-id-error");
const columnsPreview = document.getElementById("columns-preview");
const columnsBody = document.getElementById("columns-preview-body");
const warningsBlock = document.getElementById("warnings-block");
const warningsList = document.getElementById("warnings-list");
const createActions = document.getElementById("create-actions");
const createBtn = document.getElementById("create-btn");
const statusRegion = document.getElementById("status-region");

let parsedTables = [];
let baseWarnings = [];
let existingTableIds = null;
let selectedIndex = 0;
let tableIdEditedByUser = false;
let currentColumns = [];

const gristAvailable = typeof window.grist !== "undefined";

if (gristAvailable) {
  window.grist.ready({ requiredAccess: "full" });
} else {
  analyzeBtn.disabled = true;
  setStatus(
    "Impossible de trouver l'API Grist. Ouvrez cette page en tant que widget personnalisé " +
      "dans un document Grist (elle ne fonctionne pas seule, hors d'un document).",
    "error"
  );
}

analyzeBtn.addEventListener("click", onAnalyze);
tableSelect.addEventListener("change", onTableSelectionChange);
tableIdInput.addEventListener("input", () => {
  tableIdEditedByUser = true;
  renderSelectedTable();
});
createBtn.addEventListener("click", onCreate);

async function onAnalyze() {
  if (!gristAvailable) return;

  setStatus(null);
  const { tables, warnings } = parseGristSchema(sourceInput.value);
  parsedTables = tables;
  baseWarnings = warnings;
  tableIdEditedByUser = false;
  selectedIndex = 0;
  existingTableIds = null;

  previewSection.hidden = false;
  const hasTables = tables.length > 0;
  tableIdRow.hidden = !hasTables;
  columnsPreview.hidden = !hasTables;
  createActions.hidden = !hasTables;
  tablePickerRow.hidden = true;

  if (!hasTables) {
    clear(columnsBody);
    currentColumns = [];
    createBtn.disabled = true;
    renderWarnings(baseWarnings);
    return;
  }

  analyzeBtn.disabled = true;
  try {
    existingTableIds = await withTimeout(
      window.grist.docApi.listTables(),
      GRIST_CALL_TIMEOUT_MS,
      "Délai dépassé en attendant la réponse du document Grist."
    );
  } catch (err) {
    existingTableIds = null;
    baseWarnings = [
      ...baseWarnings,
      "Impossible de récupérer la liste des tables existantes de ce document : la vérification " +
        `des collisions de nom et des colonnes de référence est désactivée pour cet aperçu (${errorMessage(err)}).`,
    ];
  } finally {
    analyzeBtn.disabled = false;
  }

  populateTableSelect(tables);
  renderSelectedTable();
}

function populateTableSelect(tables) {
  clear(tableSelect);
  tables.forEach((table, index) => {
    tableSelect.appendChild(el("option", { value: String(index), text: table.tableId }));
  });
  tableSelect.value = "0";
  tablePickerRow.hidden = tables.length <= 1;
}

function onTableSelectionChange() {
  selectedIndex = Number(tableSelect.value);
  tableIdEditedByUser = false;
  renderSelectedTable();
}

function renderSelectedTable() {
  const table = parsedTables[selectedIndex];
  if (!table) return;

  if (!tableIdEditedByUser) {
    tableIdInput.value = table.tableId;
  }

  const resolutionWarnings = [];
  const targetTableId = tableIdInput.value.trim();

  const resolvedColumns = table.columns.map((col) => {
    const resolved = resolveColumnType(col.dslType, col.argsRaw, col.id, resolutionWarnings);
    if (resolved.refTarget && existingTableIds) {
      const targetExists =
        resolved.refTarget === targetTableId || existingTableIds.includes(resolved.refTarget);
      if (!targetExists) {
        resolutionWarnings.push(
          `Colonne « ${col.id} » : la table cible « ${resolved.refTarget} » n'existe pas dans ce ` +
            "document, importée en tant que « Any » (vous pourrez la reconfigurer en Référence une " +
            "fois la table cible créée)."
        );
        resolved.type = "Any";
        resolved.widgetOptions = null;
      }
    }
    return { ...col, resolved };
  });

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
  createBtn.disabled = !valid || currentColumns.length === 0;
  return valid;
}

function renderWarnings(list) {
  clear(warningsList);
  warningsBlock.hidden = list.length === 0;
  for (const warning of list) {
    warningsList.appendChild(el("li", { text: warning }));
  }
}

async function onCreate() {
  if (!gristAvailable || currentColumns.length === 0) return;
  if (!validateTableId()) return;

  const tableId = tableIdInput.value.trim();

  analyzeBtn.disabled = true;
  createBtn.disabled = true;
  setStatus("Création de la table en cours…", "info");

  try {
    const freshTables = await withTimeout(
      window.grist.docApi.listTables(),
      GRIST_CALL_TIMEOUT_MS,
      "Délai dépassé en attendant la réponse du document Grist."
    );
    if (freshTables.includes(tableId)) {
      setStatus(
        `La table « ${tableId} » existe déjà dans ce document. Choisissez un autre identifiant.`,
        "error"
      );
      return;
    }

    const columnsPayload = currentColumns.map(buildColumnPayload);
    await window.grist.docApi.applyUserActions([["AddTable", tableId, columnsPayload]]);

    setStatus(`Table « ${tableId} » créée avec ${columnsPayload.length} colonne(s).`, "success");
  } catch (err) {
    setStatus(`Échec de la création de la table : ${errorMessage(err)}`, "error");
  } finally {
    analyzeBtn.disabled = false;
    createBtn.disabled = false;
  }
}

function buildColumnPayload(col) {
  const payload = {
    id: col.id,
    type: col.resolved.type,
    isFormula: false,
    formula: "",
    label: col.id,
  };
  if (col.resolved.widgetOptions) {
    payload.widgetOptions = JSON.stringify(col.resolved.widgetOptions);
  }
  return payload;
}

function setStatus(message, level) {
  clear(statusRegion);
  if (!message) return;
  statusRegion.appendChild(el("p", { class: `status status-${level || "info"}`, text: message }));
}

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
