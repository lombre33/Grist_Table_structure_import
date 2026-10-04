/**
 * The structure of this document's tables, read from Grist's metadata tables
 * (`_grist_Tables`, `_grist_Tables_column`): readable like any table by a widget
 * with full access.
 */

import { RESERVED_COLUMN_IDS, splitType } from "./gristTypes.js";
import { omitElements, omitTable } from "./elements.js";
import { isPlainObject } from "./widgetOptions.js";

const isHidden = (colId) => RESERVED_COLUMN_IDS.has(colId) || colId.startsWith("gristHelper_") || colId.startsWith("#");

/** Rows of what `fetchTable` returns, which is column-oriented: `{ id: [...], colId: [...] }`. */
export function zipRows(columns) {
  const keys = Object.keys(columns);
  return columns.id.map((_, i) => Object.fromEntries(keys.map((key) => [key, columns[key][i]])));
}

/** The columns of a table that the user sees, in Code View's order: data columns, then formulas, each by position. */
export function userColumns(allColumns, tableRef) {
  return allColumns
    .filter((col) => col.parentId === tableRef && !isHidden(col.colId))
    .sort((a, b) => Number(a.isFormula) - Number(b.isFormula) || a.parentPos - b.parentPos);
}

/**
 * Lower-cased ids of all the columns of a table, hidden ones included: Grist keeps
 * column ids unique ignoring case, so this is what a new id is checked against.
 */
export function existingColumnIds(allColumns, tableRef) {
  return new Set(allColumns.filter((col) => col.parentId === tableRef).map((col) => col.colId.toLowerCase()));
}

/**
 * The user tables (no `_grist_*` and no summary tables, which cannot be recreated), every column
 * row, and the ids of all the tables, summary ones included. A table's description is the one of its
 * raw data widget (`rawViewSectionRef`), which is also where it is written.
 */
export async function fetchDocSchema(grist) {
  const [tablesRaw, columnsRaw, sectionsRaw] = await Promise.all(
    ["_grist_Tables", "_grist_Tables_column", "_grist_Views_section"].map((name) => grist.docApi.fetchTable(name))
  );
  const descriptions = new Map(sectionsRaw.id.map((id, i) => [id, sectionsRaw.description?.[i]]));
  const allTables = zipRows(tablesRaw);
  const tables = allTables
    .filter((table) => !table.tableId.startsWith("_grist_") && !table.summarySourceTable)
    .map((table) => ({ tableRef: table.id, tableId: table.tableId, rawViewSectionRef: table.rawViewSectionRef, description: descriptions.get(table.rawViewSectionRef) || null }))
    .sort((a, b) => a.tableId.localeCompare(b.tableId));
  return { tables, allColumns: zipRows(columnsRaw), tableIds: allTables.map((table) => table.tableId) };
}

function parseWidgetOptions(json) {
  try {
    const options = JSON.parse(json);
    return isPlainObject(options) ? options : null;
  } catch {
    return null;
  }
}

/**
 * What the Export tab writes for the given tables, in that order, each with its description. `visibleColId` and `reverseColId` are
 * the ids of the column a reference displays and of its two-way counterpart: the row ids Grist stores
 * (`visibleCol`, `reverseCol`) mean nothing in another document.
 */
export function buildExportSchema(tables, allColumns, tableIds) {
  const byRef = new Map(allColumns.map((col) => [col.id, col]));
  return tableIds
    .map((tableId) => tables.find((table) => table.tableId === tableId))
    .filter(Boolean)
    .map((table) => ({
      tableId: table.tableId,
      description: table.description ?? null,
      columns: userColumns(allColumns, table.tableRef).map((col) => ({
        colId: col.colId,
        type: col.type,
        isFormula: Boolean(col.isFormula),
        formula: col.formula,
        label: col.label || null,
        description: col.description || null,
        widgetOptions: col.widgetOptions ? parseWidgetOptions(col.widgetOptions) : null,
        visibleColId: byRef.get(col.visibleCol)?.colId ?? null,
        reverseColId: byRef.get(col.reverseCol)?.colId ?? null,
      })),
    }));
}

/** The export schema without the `omitted` elements (a Set): with the formulas left out, a formula column (blank or not) is written as plain data, and a trigger formula is dropped. */
export function omitFromExport(schema, omitted) {
  return schema.map((table) => ({
    ...omitTable(table, omitted),
    columns: table.columns.map((col) => {
      const kept = omitElements(col, omitted);
      return omitted.has("formulas") && (col.isFormula || col.formula?.trim()) ? { ...kept, isFormula: false, formula: "" } : kept;
    }),
  }));
}

/**
 * The other exportable tables that the columns of the given tables refer to, each with the
 * `"table.colId"` of those columns, in alphabetical order. Tables already given are left out.
 * @returns {Map<string, string[]>}
 */
export function findReferencedTables(tables, allColumns, tableIds) {
  const exportable = new Map(tables.map((table) => [table.tableId, table]));
  const referencedBy = new Map();
  for (const tableId of tableIds) {
    for (const col of userColumns(allColumns, exportable.get(tableId)?.tableRef)) {
      const { name, arg } = splitType(col.type);
      if ((name === "Ref" || name === "RefList") && exportable.has(arg) && !tableIds.includes(arg)) {
        referencedBy.set(arg, [...(referencedBy.get(arg) ?? []), `${tableId}.${col.colId}`]);
      }
    }
  }
  return new Map([...referencedBy].sort(([a], [b]) => a.localeCompare(b)));
}
