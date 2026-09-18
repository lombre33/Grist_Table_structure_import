/**
 * Reads the real structure of tables already in this document, via Grist's
 * own metadata tables (`_grist_Tables`, `_grist_Tables_column`), which a
 * widget with "full" document access can read like any other table (see
 * SECURITY.md). Used by the Export tab, and by the Import tab's "add
 * columns to an existing table" mode.
 */

const RESERVED_COLUMN_IDS = new Set(["id", "manualSort"]);

function isHiddenColumn(colId) {
  return RESERVED_COLUMN_IDS.has(colId) || colId.startsWith("gristHelper_") || colId.startsWith("#");
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
    const row = { id: ids[i] };
    for (const key of keys) {
      row[key] = columnOriented[key][i];
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
 * Builds the plain schema shape `codeGenerator.generateCode()` expects, for
 * a chosen subset of tables (by tableId), in the given order.
 */
export function buildExportSchema(tables, allColumns, selectedTableIds) {
  const byTableId = new Map(tables.map((table) => [table.tableId, table]));
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
      })),
    }));
}
