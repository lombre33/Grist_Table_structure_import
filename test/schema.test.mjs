import { test } from "node:test";
import assert from "node:assert/strict";
import {
  zipRows,
  visibleSortedColumns,
  existingColumnIds,
  fetchDocSchema,
  buildExportSchema,
} from "../js/schema.js";

test("zipRows converts column-oriented data into row objects", () => {
  const rows = zipRows({ id: [1, 2], colId: ["A", "B"], type: ["Text", "Int"] });
  assert.deepEqual(rows, [
    { id: 1, colId: "A", type: "Text" },
    { id: 2, colId: "B", type: "Int" },
  ]);
});

test("zipRows handles an empty table", () => {
  assert.deepEqual(zipRows({ id: [] }), []);
});

test("visibleSortedColumns hides reserved/helper columns and orders data before formulas", () => {
  const columns = [
    { parentId: 1, colId: "manualSort", parentPos: 0, isFormula: false },
    { parentId: 1, colId: "id", parentPos: 0.5, isFormula: false },
    { parentId: 1, colId: "gristHelper_Display", parentPos: 1, isFormula: true },
    { parentId: 1, colId: "Computed", parentPos: 2, isFormula: true },
    { parentId: 1, colId: "Name", parentPos: 3, isFormula: false },
    { parentId: 1, colId: "Age", parentPos: 1.5, isFormula: false },
    { parentId: 2, colId: "OtherTable", parentPos: 0, isFormula: false },
  ];
  const result = visibleSortedColumns(columns, 1).map((c) => c.colId);
  assert.deepEqual(result, ["Age", "Name", "Computed"]);
});

test("existingColumnIds includes reserved columns (used for collision checks)", () => {
  const columns = [
    { parentId: 1, colId: "id" },
    { parentId: 1, colId: "Name" },
    { parentId: 2, colId: "Name" },
  ];
  assert.deepEqual(existingColumnIds(columns, 1), new Set(["id", "Name"]));
});

function stubGrist(tablesById, columnsById) {
  return {
    docApi: {
      async fetchTable(tableId) {
        if (tableId === "_grist_Tables") return tablesById;
        if (tableId === "_grist_Tables_column") return columnsById;
        throw new Error(`unexpected fetchTable(${tableId})`);
      },
    },
  };
}

test("fetchDocSchema excludes _grist_* tables and summary tables, sorts alphabetically", async () => {
  const grist = stubGrist(
    {
      id: [1, 2, 3, 4],
      tableId: ["Zebra", "_grist_Tables_column", "Apple", "Zebra_summary_X"],
      summarySourceTable: [0, 0, 0, 1],
    },
    { id: [], parentId: [], colId: [], type: [], isFormula: [], formula: [], parentPos: [] }
  );

  const { tables } = await fetchDocSchema(grist);
  assert.deepEqual(
    tables.map((t) => t.tableId),
    ["Apple", "Zebra"]
  );
});

test("buildExportSchema assembles the shape codeGenerator expects, in selection order", async () => {
  const grist = stubGrist(
    { id: [10, 20], tableId: ["Foo", "Bar"], summarySourceTable: [0, 0] },
    {
      id: [1, 2, 3],
      parentId: [10, 10, 20],
      colId: ["A", "B", "C"],
      type: ["Text", "Int", "Bool"],
      isFormula: [false, false, false],
      formula: ["", "", ""],
      parentPos: [1, 2, 1],
    }
  );

  const { tables, allColumns } = await fetchDocSchema(grist);
  const schema = buildExportSchema(tables, allColumns, ["Bar", "Foo"]);

  assert.deepEqual(
    schema.map((t) => t.tableId),
    ["Bar", "Foo"]
  );
  assert.deepEqual(schema[1].columns.map((c) => c.colId), ["A", "B"]);
});
