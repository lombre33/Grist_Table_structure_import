import { $, el, checklistItem, restoreFocus, statusWriter } from "./dom.js";
import { fetchDocSchema, buildExportSchema, findReferencedTables } from "./schema.js";
import { generateCode } from "./codeGenerator.js";
import { callGrist, reportError } from "./util.js";
import { t, tn, onLocaleChange } from "./i18n.js";

export function initExportTab(grist) {
  const tableList = $("export-table-list");
  const selectAllRow = $("export-select-all-row");
  const selectAll = $("export-select-all");
  const tablesEmpty = $("export-tables-empty");
  const refreshBtn = $("refresh-tables-btn");
  const generateBtn = $("generate-btn");
  const outputBlock = $("export-output-block");
  const output = $("export-output");
  const copyBtn = $("copy-btn");
  const copyStatus = $("copy-status");
  const refsBanner = $("export-refs-banner");
  const includeBtn = $("refs-include-btn");
  const dismissBtn = $("refs-dismiss-btn");
  const refsIntro = $("export-refs-banner-intro");
  const refsList = $("export-refs-list");
  const announcement = $("export-announcement");
  const setStatus = statusWriter($("export-status-region"));

  if (!grist) {
    refreshBtn.disabled = true;
    setStatus(t("error.noGristApi"), "error");
    return { activate() {} };
  }

  let docSchema = null;
  let loaded = false;
  let busy = false; // the list is being read, or the code generated
  let dismissed = null; // the tables the user chose to do without, as missingTables().key

  refreshBtn.addEventListener("click", loadTables);
  generateBtn.addEventListener("click", onGenerate);
  copyBtn.addEventListener("click", onCopy);
  tableList.addEventListener("change", refresh);
  selectAll.addEventListener("change", () => {
    for (const input of tableList.querySelectorAll("input")) input.checked = selectAll.checked;
    refresh();
  });
  includeBtn.addEventListener("click", onInclude);
  dismissBtn.addEventListener("click", () => {
    dismissed = missingTables().key;
    updateRefsBanner();
    generateBtn.focus({ preventScroll: true }); // the banner, which had the focus, is gone: the next step is here
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
    const count = tableList.querySelectorAll("input").length;
    const ticked = selected().length;
    selectAll.checked = count > 0 && ticked === count;
    selectAll.indeterminate = ticked > 0 && ticked < count;
    generateBtn.disabled = busy || ticked === 0;
    updateRefsBanner();
  }

  /** Actualiser and Générer wait for each other: the list is not read again while the code is generated, nor the code generated twice. */
  function setBusy(value) {
    busy = refreshBtn.disabled = value;
    refresh();
  }

  /** Reads the document's tables again, keeping the ones that were ticked. */
  async function loadTables() {
    const kept = new Set(selected());
    setStatus(t("export.status.loading"));
    outputBlock.hidden = tablesEmpty.hidden = selectAllRow.hidden = true;
    dismissed = null;
    tableList.replaceChildren();
    setBusy(true);
    try {
      docSchema = await callGrist(fetchDocSchema(grist));
      setStatus(null);
      tablesEmpty.hidden = docSchema.tables.length > 0;
      selectAllRow.hidden = docSchema.tables.length === 0;
      tableList.replaceChildren(...docSchema.tables.map((table) => checklistItem(table.tableId, table.tableId, kept.has(table.tableId))));
    } catch (err) {
      setStatus(t("export.error.fetchTables", { error: reportError(err) }), "error");
    } finally {
      setBusy(false);
      restoreFocus(refreshBtn);
    }
  }

  /** Generating without the referenced tables is allowed: Import turns such references into Any. */
  function updateRefsBanner() {
    const { referencedBy, ids, key } = missingTables();
    refsBanner.hidden = ids.length === 0 || key === dismissed;
    if (refsBanner.hidden) {
      announcement.textContent = "";
      return;
    }
    const intro = tn("export.refs.intro", ids.length);
    refsIntro.textContent = intro;
    if (announcement.textContent !== intro) announcement.textContent = intro; // a screen reader says again what is written again
    includeBtn.textContent = tn("export.refs.include", ids.length);
    dismissBtn.textContent = tn("export.refs.dismiss", ids.length);
    refsList.replaceChildren(
      ...ids.map((tableId) => el("li", { text: t("export.refs.item", { tableId, columns: referencedBy.get(tableId).join(", ") }) }))
    );
  }

  function onInclude() {
    const { ids } = missingTables();
    for (const input of tableList.querySelectorAll("input")) if (ids.includes(input.value)) input.checked = true;
    refresh(); // the tables just included may refer to others
    generateBtn.focus({ preventScroll: true }); // the button that had the focus may be gone with the banner
  }

  async function onGenerate() {
    if (selected().length === 0) return;
    setStatus(t("export.status.generating"));
    setBusy(true);
    try {
      docSchema = await callGrist(fetchDocSchema(grist)); // columns may have changed since the list was loaded
      const schema = buildExportSchema(docSchema.tables, docSchema.allColumns, selected());
      output.value = generateCode(schema);
      outputBlock.hidden = false;
      setCopyStatus("");
      const columns = schema.reduce((total, table) => total + table.columns.length, 0);
      setStatus(t("export.success.generated", { tablesPhrase: tn("common.tablesCount", schema.length), columnsPhrase: tn("common.columnsCount", columns) }), "success");
      outputBlock.scrollIntoView({ block: "start" });
    } catch (err) {
      setStatus(t("export.error.generateFailed", { error: reportError(err) }), "error");
    } finally {
      setBusy(false);
      restoreFocus(generateBtn);
    }
  }

  /** The outcome of Copier: a short confirmation, or what to do instead (which deserves more than a hint's look). */
  function setCopyStatus(message, level = "hint") {
    copyStatus.className = level === "hint" ? "hint" : `status status-${level}`;
    copyStatus.textContent = message;
  }

  async function onCopy() {
    output.focus();
    output.select();
    try {
      await navigator.clipboard.writeText(output.value);
      setCopyStatus(t("export.copy.done"));
    } catch {
      setCopyStatus(t("export.copy.fallback"), "info");
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
