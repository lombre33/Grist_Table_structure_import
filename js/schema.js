/**
 * Reads the real structure of tables already in this document, via Grist's
 * own metadata tables (`_grist_Tables`, `_grist_Tables_column`), which a
 * widget with "full" document access can read like any other table (see
 * SECURITY.md). Used by the Export tab, and by the Import tab's "add
 * columns to an existing table" mode.
 */

const RESERVED_COLUMN_IDS = new Set(["id", "manualSort"]);
const REF_ID_FIELDS = new Set(["id", "parentId", "visibleCol"]);

function isHiddenColumn(colId) {
  return RESERVED_COLUMN_IDS.has(colId) || colId.startsWith("gristHelper_") || colId.startsWith("#");
}

/**
 * Coerces a `_grist_Tables`/`_grist_Tables_column` row-id field (`id`,
 * `parentId`, `visibleCol` — all `Ref:` columns onto a metadata table) to a
 * plain number. In the common case the value already is one; this only
 * matters if a future Grist version (or a self-hosted variant) ever encodes
 * a same-document Reference cell in the tagged `[L, tableId, rowId]` form
 * documented for `GristObjCode.Reference` (`app/common/gristTypes.ts`)
 * instead of a bare number — every row-id equality check in this module
 * (`visibleSortedColumns`, `existingColumnIds`, ...) goes through this, so
 * that possibility can't silently make every comparison fail. `0`/missing
 * stays `0` ("no reference"), matching Grist's own convention.
 */
function toRowId(value) {
  if (Array.isArray(value)) return Number(value[value.length - 1]) || 0;
  return Number(value) || 0;
}

/**
 * Converts the column-oriented `{id: [...], colA: [...], ...}` shape
 * returned by `grist.docApi.fetchTable()` into an array of row objects.
 */
export function zipRows(columnOriented) {
  const ids = columnOriented.id || [];
  const keys = Object.keys(columnOriented).filter((key) => key !== "id");
  const rows = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    const row = { id: toRowId(ids[i]) };
    for (const key of keys) {
      const value = columnOriented[key][i];
      row[key] = REF_ID_FIELDS.has(key) ? toRowId(value) : value;
    }
    rows[i] = row;
  }
  return rows;
}

/**
 * Columns of one table (identified by its `_grist_Tables` row id), filtered
 * to user-visible ones and ordered the way Grist's own Code View generator
 * orders them: by position, with all data columns before all formula
 * columns (a stable sort, so each group keeps its relative position order).
 */
export function visibleSortedColumns(allColumns, tableRef) {
  return allColumns
    .filter((col) => col.parentId === tableRef && !isHiddenColumn(col.colId))
    .sort((a, b) => a.parentPos - b.parentPos)
    .sort((a, b) => Number(a.isFormula) - Number(b.isFormula));
}

/**
 * All existing column ids of a table (unfiltered — including reserved and
 * helper ones), used to detect name collisions when adding columns.
 */
export function existingColumnIds(allColumns, tableRef) {
  return new Set(allColumns.filter((col) => col.parentId === tableRef).map((col) => col.colId));
}

/**
 * Reads `_grist_Tables` and `_grist_Tables_column` and returns the list of
 * user-facing tables (excluding Grist's own `_grist_*` metadata tables and
 * summary/pivot tables, which this widget's simple AddTable/AddColumn
 * actions cannot meaningfully reproduce) plus every column row, so callers
 * can look up a specific table's columns with `visibleSortedColumns`.
 */
export async function fetchDocSchema(grist) {
  const [tablesRaw, columnsRaw] = await Promise.all([
    grist.docApi.fetchTable("_grist_Tables"),
    grist.docApi.fetchTable("_grist_Tables_column"),
  ]);

  const allColumns = zipRows(columnsRaw);
  const tables = zipRows(tablesRaw)
    .filter((table) => !String(table.tableId).startsWith("_grist_") && !table.summarySourceTable)
    .map((table) => ({ tableRef: table.id, tableId: table.tableId }))
    .sort((a, b) => a.tableId.localeCompare(b.tableId));

  return { tables, allColumns };
}

/**
 * Best-effort `JSON.parse` of a column's raw `widgetOptions` string (as
 * stored by Grist in `_grist_Tables_column.widgetOptions`): never throws,
 * returns null for anything blank or not a plain JSON object. Only ever
 * used to read data, never to evaluate anything.
 */
function parseWidgetOptions(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a column's `visibleCol` (a raw row id into `_grist_Tables_column`,
 * meaningless outside this document) to the target column's `colId` (a
 * portable name), by looking it up in the full column list. Returns null
 * when there is no visible column set, or it cannot be found (stale
 * reference) — never a raw row id.
 */
function resolveVisibleColId(col, columnsByRowId) {
  if (!col.visibleCol) return null;
  const target = columnsByRowId.get(col.visibleCol);
  return target ? target.colId : null;
}

/**
 * Builds the plain schema shape `codeGenerator.generateCode()` expects, for
 * a chosen subset of tables (by tableId), in the given order. Besides the
 * column's id/type/formula, this also carries the extra metadata Export
 * captures (see README.md "Export"): `label`, `description`, the parsed
 * `widgetOptions` (still the raw, un-filtered object — codeGenerator.js is
 * responsible for filtering it down before writing it out), and, for a
 * Reference/ReferenceList column, `visibleColId` (the target table's
 * display column, resolved to a portable colId — see resolveVisibleColId).
 */
export function buildExportSchema(tables, allColumns, selectedTableIds) {
  const byTableId = new Map(tables.map((table) => [table.tableId, table]));
  const columnsByRowId = new Map(allColumns.map((col) => [col.id, col]));
  return selectedTableIds
    .map((tableId) => byTableId.get(tableId))
    .filter(Boolean)
    .map((table) => ({
      tableId: table.tableId,
      columns: visibleSortedColumns(allColumns, table.tableRef).map((col) => ({
        colId: col.colId,
        type: col.type,
        isFormula: Boolean(col.isFormula),
        formula: col.formula,
        label: col.label || null,
        description: col.description || null,
        widgetOptions: parseWidgetOptions(col.widgetOptions),
        visibleColId: resolveVisibleColId(col, columnsByRowId),
      })),
    }));
}

function refTargetOf(type) {
  if (type.startsWith("Ref:")) return type.slice("Ref:".length);
  if (type.startsWith("RefList:")) return type.slice("RefList:".length);
  return null;
}

/**
 * For a chosen subset of tables (by tableId, the ones about to be
 * exported), finds every *other* exportable table of this document that at
 * least one Reference/ReferenceList column among the selection points to,
 * grouped by that target table's id, each with the list of `"table.colId"`
 * strings of the referencing columns (for display in the Export tab's
 * information banner — see js/exportTab.js). A target that is itself
 * already selected, or that isn't one of this document's exportable tables
 * (already-excluded `_grist_*`/summary tables, or a stale reference to a
 * deleted table — the latter is reported separately as an import-time
 * warning, not here), is left out.
 *
 * @returns {Map<string, string[]>}
 */
export function findReferencedTables(tables, allColumns, selectedTableIds) {
  const selectedSet = new Set(selectedTableIds);
  const byTableId = new Map(tables.map((table) => [table.tableId, table]));
  const referencedBy = new Map();

  for (const tableId of selectedTableIds) {
    const table = byTableId.get(tableId);
    if (!table) continue;
    for (const col of visibleSortedColumns(allColumns, table.tableRef)) {
      const target = refTargetOf(String(col.type));
      if (!target || !byTableId.has(target) || selectedSet.has(target)) continue;
      if (!referencedBy.has(target)) referencedBy.set(target, []);
      referencedBy.get(target).push(`${tableId}.${col.colId}`);
    }
  }

  return referencedBy;
}
