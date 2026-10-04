/**
 * The Export tab: the tables of the document are listed, the ones ticked (and what is kept of them) are written as
 * Code View text. The list (exportTables), the banner of the tables referred to (exportRefs) and the code (exportOutput)
 * are its parts; this module reads the document and makes them work together. `ctx` is
 * { grist, ui, setStatus, state, output, tables, banner, showElements }.
 */

import { $, byIds, restoreFocus, statusWriter } from "./dom.js";
import { fetchDocSchema, buildExportSchema, omitFromExport } from "./schema.js";
import { elementCounts } from "./elements.js";
import { elementsPicker } from "./elementsPicker.js";
import { generateCode } from "./codeGenerator.js";
import { callGrist, reportError } from "./util.js";
import { t, tn, onLocaleChange } from "./i18n.js";
import { createTableList } from "./exportTables.js";
import { createRefsBanner, missingTables } from "./exportRefs.js";
import { createOutput } from "./exportOutput.js";

export function initExportTab(grist) {
  const ui = byIds({ refreshBtn: "refresh-tables-btn", generateBtn: "generate-btn", elementsBox: "export-elements" });
  const setStatus = statusWriter($("export-status-region"));
  if (!grist) {
    ui.refreshBtn.disabled = true;
    setStatus(t("error.noGristApi"), "error");
    return { activate() {} };
  }

  // docSchema: the document's tables and columns; busy: the list is being read, or the code generated;
  // omitted: the elements (see elements.js) the user leaves out of the code
  const state = { docSchema: null, loaded: false, busy: false, omitted: new Set() };
  const ctx = { grist, ui, setStatus, state, output: createOutput() };
  ctx.showElements = elementsPicker($("export-elements-list"), (element, kept) => {
    if (kept) state.omitted.delete(element);
    else state.omitted.add(element);
  });
  ctx.tables = createTableList({ onChange: () => refresh(ctx) });
  ctx.banner = createRefsBanner({ onInclude: () => include(ctx), onDismiss: () => dismiss(ctx) });

  ui.refreshBtn.addEventListener("click", () => loadTables(ctx));
  ui.generateBtn.addEventListener("click", () => generate(ctx));
  onLocaleChange(() => refresh(ctx));

  return {
    activate() {
      if (state.loaded) return;
      state.loaded = true;
      loadTables(ctx);
    },
  };
}

const missing = ({ state, tables }) => missingTables(state.docSchema, tables.selected());

/** Writes again what depends on the tables ticked: the list, the button, the elements offered, the banner. */
function refresh(ctx) {
  const { ui, state, tables, banner, showElements } = ctx;
  tables.render();
  const selected = tables.selected();
  ui.generateBtn.disabled = state.busy || selected.length === 0;
  const schema = state.docSchema ? buildExportSchema(state.docSchema.tables, state.docSchema.allColumns, selected) : [];
  ui.elementsBox.hidden = !showElements(elementCounts(schema.flatMap((table) => table.columns), schema), (element) => !state.omitted.has(element));
  banner.render(missing(ctx));
}

/** Actualiser and Générer wait for each other: the list is not read again while the code is generated, nor the code generated twice. */
function setBusy(ctx, value) {
  ctx.state.busy = ctx.ui.refreshBtn.disabled = value;
  refresh(ctx);
}

/** Inclure ces tables: the tables the ticked ones refer to are ticked too. */
function include(ctx) {
  ctx.tables.tick(missing(ctx).ids);
  refresh(ctx); // the tables just included may refer to others
  if (ctx.banner.isHidden()) ctx.ui.generateBtn.focus({ preventScroll: true }); // the button that had the focus is gone with the banner
}

/** Continuer sans elles. */
function dismiss(ctx) {
  ctx.banner.dismiss(missing(ctx));
  ctx.ui.generateBtn.focus({ preventScroll: true }); // the banner, which had the focus, is gone: the next step is here
}

/** Reads the document's tables again, keeping the ones that were ticked. */
async function loadTables(ctx) {
  const { grist, ui, state, setStatus, tables, banner, output } = ctx;
  const kept = new Set(tables.selected());
  setStatus(t("export.status.loading"));
  output.hide();
  tables.hide();
  banner.reset();
  setBusy(ctx, true);
  try {
    state.docSchema = await callGrist(fetchDocSchema(grist));
    setStatus(null);
    tables.show(state.docSchema.tables, kept);
  } catch (err) {
    setStatus(t("export.error.fetchTables", { error: reportError(err) }), "error");
  } finally {
    setBusy(ctx, false);
    restoreFocus(ui.refreshBtn);
  }
}

/** Writes the code of the tables ticked, with the elements that are kept. */
async function generate(ctx) {
  const { grist, ui, state, setStatus, tables, output } = ctx;
  if (tables.selected().length === 0) return;
  setStatus(t("export.status.generating"));
  setBusy(ctx, true);
  try {
    state.docSchema = await callGrist(fetchDocSchema(grist)); // columns may have changed since the list was loaded
    const schema = omitFromExport(buildExportSchema(state.docSchema.tables, state.docSchema.allColumns, tables.selected()), state.omitted);
    output.show(generateCode(schema));
    const columns = schema.reduce((total, table) => total + table.columns.length, 0);
    setStatus(t("export.success.generated", { tablesPhrase: tn("common.tablesCount", schema.length), columnsPhrase: tn("common.columnsCount", columns) }), "success");
    output.reveal();
  } catch (err) {
    setStatus(t("export.error.generateFailed", { error: reportError(err) }), "error");
  } finally {
    setBusy(ctx, false);
    restoreFocus(ui.generateBtn);
  }
}
