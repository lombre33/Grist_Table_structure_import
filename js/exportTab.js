import { el, clear } from "./dom.js";
import { fetchDocSchema, buildExportSchema, findReferencedTables } from "./schema.js";
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
  const refsBanner = document.getElementById("export-refs-banner");
  const refsBannerIntro = document.getElementById("export-refs-banner-intro");
  const refsList = document.getElementById("export-refs-list");
  const refsIncludeBtn = document.getElementById("refs-include-btn");
  const refsDismissBtn = document.getElementById("refs-dismiss-btn");

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
  // Key (a joined, sorted list of table ids) of the last "missing
  // referenced tables" set the user explicitly dismissed with "Continuer
  // sans elles". The banner stays hidden for exactly that set; any other
  // set (more, fewer, or different tables) shows it again.
  let dismissedRefsKey = null;

  refreshBtn.addEventListener("click", () => loadTables());
  generateBtn.addEventListener("click", onGenerate);
  copyBtn.addEventListener("click", onCopy);
  tableList.addEventListener("change", () => {
    updateGenerateEnabled();
    updateRefsBanner();
  });
  refsIncludeBtn.addEventListener("click", onIncludeReferencedTables);
  refsDismissBtn.addEventListener("click", onDismissRefsBanner);

  async function loadTables() {
    setStatus(null);
    outputBlock.hidden = true;
    refreshBtn.disabled = true;
    generateBtn.disabled = true;
    clear(tableList);
    tablesEmpty.hidden = true;
    dismissedRefsKey = null;

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
      updateRefsBanner();
    }
  }

  function updateGenerateEnabled() {
    generateBtn.disabled = tableList.querySelectorAll("input:checked").length === 0;
  }

  function selectedTableIds() {
    return Array.from(tableList.querySelectorAll("input:checked")).map((input) => input.value);
  }

  /**
   * Requirement: when the checked selection references tables (via
   * Ref/RefList columns) that are not themselves checked, show an
   * informational (non-blocking) banner listing them, with a choice to
   * include them or to continue without them — see README.md "Export" and
   * js/schema.js's findReferencedTables(). Generating code never requires
   * resolving this banner: an unselected referenced table simply means the
   * generated code will have a Reference/ReferenceList pointing at a table
   * that does not exist in the destination document, which Import already
   * handles gracefully (imported as `Any`, with a warning — see README.md).
   */
  function updateRefsBanner() {
    if (!docSchema) {
      refsBanner.hidden = true;
      return;
    }
    const selected = selectedTableIds();
    const referencedBy = findReferencedTables(docSchema.tables, docSchema.allColumns, selected);
    const missingTableIds = Array.from(referencedBy.keys()).sort((a, b) => a.localeCompare(b));
    const key = missingTableIds.join("\u0000");

    if (missingTableIds.length === 0 || key === dismissedRefsKey) {
      refsBanner.hidden = true;
      return;
    }

    const n = missingTableIds.length;
    refsBannerIntro.textContent =
      `Les tables cochées font référence à ${n} ${pluralize(n, "autre")} ` +
      `${pluralize(n, "table")} ${pluralize(n, "non cochée")} de ce document. ` +
      "Les inclure dans l'export, ou continuer sans elles ?";

    clear(refsList);
    for (const tableId of missingTableIds) {
      const referencingColumns = referencedBy.get(tableId).join(", ");
      refsList.appendChild(
        el("li", { text: `${tableId} — référencée par : ${referencingColumns}` })
      );
    }

    refsBanner.hidden = false;
  }

  function onIncludeReferencedTables() {
    if (!docSchema) return;
    const referencedBy = findReferencedTables(docSchema.tables, docSchema.allColumns, selectedTableIds());
    const toInclude = new Set(referencedBy.keys());
    if (toInclude.size === 0) return;

    for (const input of tableList.querySelectorAll("input")) {
      if (toInclude.has(input.value)) input.checked = true;
    }
    updateGenerateEnabled();
    // Re-evaluate immediately: newly-included tables may themselves
    // reference further tables, cascading the banner rather than hiding it.
    updateRefsBanner();
  }

  function onDismissRefsBanner() {
    if (!docSchema) return;
    const referencedBy = findReferencedTables(docSchema.tables, docSchema.allColumns, selectedTableIds());
    dismissedRefsKey = Array.from(referencedBy.keys()).sort((a, b) => a.localeCompare(b)).join("\u0000");
    updateRefsBanner();
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
