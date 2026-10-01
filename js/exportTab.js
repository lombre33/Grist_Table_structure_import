import { $, el, checklistItem, statusWriter } from "./dom.js";
import { fetchDocSchema, buildExportSchema, findReferencedTables } from "./schema.js";
import { generateCode } from "./codeGenerator.js";
import { callGrist, reportError } from "./util.js";
import { t, tn, onLocaleChange } from "./i18n.js";

export function initExportTab(grist) {
  const tableList = $("export-table-list");
  const tablesEmpty = $("export-tables-empty");
  const refreshBtn = $("refresh-tables-btn");
  const generateBtn = $("generate-btn");
  const outputBlock = $("export-output-block");
  const output = $("export-output");
  const copyBtn = $("copy-btn");
  const copyStatus = $("copy-status");
  const refsBanner = $("export-refs-banner");
  const setStatus = statusWriter($("export-status-region"));

  if (!grist) {
    refreshBtn.disabled = true;
    setStatus(t("error.noGristApi"), "error");
    return { activate() {} };
  }

  let docSchema = null;
  let loaded = false;
  let dismissed = null; // the tables the user chose to do without, as missingTables().key

  refreshBtn.addEventListener("click", loadTables);
  generateBtn.addEventListener("click", onGenerate);
  copyBtn.addEventListener("click", onCopy);
  tableList.addEventListener("change", refresh);
  $("refs-include-btn").addEventListener("click", onInclude);
  $("refs-dismiss-btn").addEventListener("click", () => {
    dismissed = missingTables().key;
    updateRefsBanner();
  });
  onLocaleChange(updateRefsBanner);

  const selected = () => Array.from(tableList.querySelectorAll("input:checked"), (input) => input.value);

  /** The tables the ticked ones refer to without those being ticked themselves. */
  function missingTables() {
    const referencedBy = docSchema ? findReferencedTables(docSchema.tables, docSchema.allColumns, selected()) : new Map();
    const ids = Array.from(referencedBy.keys());
    return { referencedBy, ids, key: ids.join("\0") };
  }

  function refresh() {
    generateBtn.disabled = selected().length === 0;
    updateRefsBanner();
  }

  async function loadTables() {
    setStatus(null);
    outputBlock.hidden = tablesEmpty.hidden = true;
    refreshBtn.disabled = generateBtn.disabled = true;
    dismissed = null;
    tableList.replaceChildren();
    try {
      docSchema = await callGrist(fetchDocSchema(grist));
      tablesEmpty.hidden = docSchema.tables.length > 0;
      tableList.replaceChildren(...docSchema.tables.map((table) => checklistItem(table.tableId, table.tableId)));
    } catch (err) {
      setStatus(t("export.error.fetchTables", { error: reportError(err) }), "error");
    } finally {
      refreshBtn.disabled = false;
      refresh();
    }
  }

  /** Generating without the referenced tables is allowed: Import turns such references into Any. */
  function updateRefsBanner() {
    const { referencedBy, ids, key } = missingTables();
    refsBanner.hidden = ids.length === 0 || key === dismissed;
    if (refsBanner.hidden) return;
    $("export-refs-banner-intro").textContent = tn("export.refs.intro", ids.length);
    $("export-refs-list").replaceChildren(
      ...ids.map((tableId) => el("li", { text: t("export.refs.item", { tableId, columns: referencedBy.get(tableId).join(", ") }) }))
    );
  }

  function onInclude() {
    const { ids } = missingTables();
    for (const input of tableList.querySelectorAll("input")) if (ids.includes(input.value)) input.checked = true;
    refresh(); // the tables just included may refer to others
  }

  async function onGenerate() {
    if (selected().length === 0) return;
    setStatus(t("export.status.generating"));
    generateBtn.disabled = true;
    try {
      docSchema = await callGrist(fetchDocSchema(grist)); // columns may have changed since the list was loaded
      const schema = buildExportSchema(docSchema.tables, docSchema.allColumns, selected());
      output.value = generateCode(schema);
      outputBlock.hidden = false;
      copyStatus.textContent = "";
      const columns = schema.reduce((total, table) => total + table.columns.length, 0);
      setStatus(t("export.success.generated", { tablesPhrase: tn("common.tablesCount", schema.length), columnsPhrase: tn("common.columnsCount", columns) }), "success");
    } catch (err) {
      setStatus(t("export.error.generateFailed", { error: reportError(err) }), "error");
    } finally {
      generateBtn.disabled = selected().length === 0;
    }
  }

  async function onCopy() {
    output.focus();
    output.select();
    try {
      await navigator.clipboard.writeText(output.value);
      copyStatus.textContent = t("export.copy.done");
    } catch {
      copyStatus.textContent = t("export.copy.fallback");
    }
  }

  return {
    activate() {
      if (loaded) return;
      loaded = true;
      loadTables();
    },
  };
}
