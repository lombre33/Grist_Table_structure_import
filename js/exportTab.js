import { el, clear } from "./dom.js";
import { fetchDocSchema, buildExportSchema } from "./schema.js";
import { generateCode } from "./codeGenerator.js";
import { withTimeout, errorMessage, pluralize, GRIST_CALL_TIMEOUT_MS } from "./util.js";

const TIMEOUT_MESSAGE = "Délai dépassé en attendant la réponse du document Grist.";

export function initExportTab(grist, gristAvailable) {
  const tableList = document.getElementById("export-table-list");
  const tablesEmpty = document.getElementById("export-tables-empty");
  const refreshBtn = document.getElementById("refresh-tables-btn");
  const generateBtn = document.getElementById("generate-btn");
  const outputBlock = document.getElementById("export-output-block");
  const output = document.getElementById("export-output");
  const copyBtn = document.getElementById("copy-btn");
  const copyStatus = document.getElementById("copy-status");
  const statusRegion = document.getElementById("export-status-region");

  if (!gristAvailable) {
    refreshBtn.disabled = true;
    setStatus(
      "Impossible de trouver l'API Grist. Ouvrez cette page en tant que widget personnalisé " +
        "dans un document Grist (elle ne fonctionne pas seule, hors d'un document).",
      "error"
    );
    return { activate() {} };
  }

  let docSchema = null;
  let loaded = false;

  refreshBtn.addEventListener("click", () => loadTables());
  generateBtn.addEventListener("click", onGenerate);
  copyBtn.addEventListener("click", onCopy);
  tableList.addEventListener("change", updateGenerateEnabled);

  async function loadTables() {
    setStatus(null);
    outputBlock.hidden = true;
    refreshBtn.disabled = true;
    generateBtn.disabled = true;
    clear(tableList);
    tablesEmpty.hidden = true;

    try {
      docSchema = await withTimeout(fetchDocSchema(grist), GRIST_CALL_TIMEOUT_MS, TIMEOUT_MESSAGE);
      if (docSchema.tables.length === 0) {
        tablesEmpty.hidden = false;
      } else {
        for (const table of docSchema.tables) {
          tableList.appendChild(
            el("li", {}, [
              el("label", {}, [
                el("input", { type: "checkbox", value: table.tableId }),
                el("span", { text: table.tableId }),
              ]),
            ])
          );
        }
      }
    } catch (err) {
      setStatus(`Impossible de lire les tables de ce document : ${errorMessage(err)}.`, "error");
    } finally {
      refreshBtn.disabled = false;
      updateGenerateEnabled();
    }
  }

  function updateGenerateEnabled() {
    generateBtn.disabled = tableList.querySelectorAll("input:checked").length === 0;
  }

  async function onGenerate() {
    const selected = Array.from(tableList.querySelectorAll("input:checked")).map((input) => input.value);
    if (selected.length === 0 || !docSchema) return;

    setStatus("Génération du code en cours…", "info");
    generateBtn.disabled = true;
    try {
      // Re-read fresh, in case columns changed since the table list was loaded.
      docSchema = await withTimeout(fetchDocSchema(grist), GRIST_CALL_TIMEOUT_MS, TIMEOUT_MESSAGE);
      const schema = buildExportSchema(docSchema.tables, docSchema.allColumns, selected);
      output.value = generateCode(schema);
      outputBlock.hidden = false;
      copyStatus.textContent = "";
      const totalColumns = schema.reduce((n, t) => n + t.columns.length, 0);
      setStatus(
        `Code généré pour ${schema.length} ${pluralize(schema.length, "table")}, ` +
          `${totalColumns} ${pluralize(totalColumns, "colonne")} au total.`,
        "success"
      );
    } catch (err) {
      setStatus(`Échec de la génération : ${errorMessage(err)}.`, "error");
    } finally {
      updateGenerateEnabled();
    }
  }

  async function onCopy() {
    output.focus();
    output.select();
    try {
      await navigator.clipboard.writeText(output.value);
      copyStatus.textContent = "Copié.";
    } catch {
      copyStatus.textContent = "Copie automatique indisponible ici : le texte est sélectionné, utilisez Ctrl+C (Cmd+C sur Mac).";
    }
  }

  function setStatus(message, level) {
    clear(statusRegion);
    if (!message) return;
    statusRegion.appendChild(el("p", { class: `status status-${level || "info"}`, text: message }));
  }

  return {
    activate() {
      if (loaded) return;
      loaded = true;
      loadTables();
    },
  };
}
