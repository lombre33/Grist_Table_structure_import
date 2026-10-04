import { test } from "node:test";
import assert from "node:assert/strict";
import {
  zipRows,
  userColumns,
  existingColumnIds,
  fetchDocSchema,
  buildExportSchema,
  findReferencedTables,
  omitFromExport,
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

test("userColumns hides reserved/helper columns and orders data before formulas", () => {
  const columns = [
    { parentId: 1, colId: "manualSort", parentPos: 0, isFormula: false },
    { parentId: 1, colId: "id", parentPos: 0.5, isFormula: false },
    { parentId: 1, colId: "gristHelper_Display", parentPos: 1, isFormula: true },
    { parentId: 1, colId: "Computed", parentPos: 2, isFormula: true },
    { parentId: 1, colId: "Name", parentPos: 3, isFormula: false },
    { parentId: 1, colId: "Age", parentPos: 1.5, isFormula: false },
    { parentId: 2, colId: "OtherTable", parentPos: 0, isFormula: false },
  ];
  const result = userColumns(columns, 1).map((c) => c.colId);
  assert.deepEqual(result, ["Age", "Name", "Computed"]);
});

test("existingColumnIds lists reserved columns too, lower-cased (Grist ids are unique ignoring case)", () => {
  const columns = [
    { parentId: 1, colId: "id" },
    { parentId: 1, colId: "Name" },
    { parentId: 2, colId: "Other" },
  ];
  assert.deepEqual(existingColumnIds(columns, 1), new Set(["id", "name"]));
});

function stubGrist(tablesById, columnsById, sectionsById = { id: [], description: [] }) {
  return {
    docApi: {
      async fetchTable(tableId) {
        if (tableId === "_grist_Tables") return tablesById;
        if (tableId === "_grist_Tables_column") return columnsById;
        if (tableId === "_grist_Views_section") return sectionsById;
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

function metadataFixture() {
  return {
    tables: [
      { tableRef: 10, tableId: "Foo" },
      { tableRef: 20, tableId: "Bar" },
    ],
    allColumns: [
      {
        id: 1,
        parentId: 10,
        colId: "Mood",
        type: "Choice",
        isFormula: false,
        formula: "",
        parentPos: 1,
        label: "Humeur",
        description: "Une note",
        widgetOptions: JSON.stringify({ choices: ["A", "B"], rulesOptions: [{ fillColor: "#FF0000" }] }),
        visibleCol: 0,
      },
      {
        id: 2,
        parentId: 10,
        colId: "Owner",
        type: "Ref:Bar",
        isFormula: false,
        formula: "",
        parentPos: 2,
        label: "Owner",
        description: "",
        widgetOptions: "",
        visibleCol: 3,
      },
      {
        id: 3,
        parentId: 20,
        colId: "Name",
        type: "Text",
        isFormula: false,
        formula: "",
        parentPos: 1,
        label: "Name",
        description: "",
        widgetOptions: "",
        visibleCol: 0,
      },
    ],
  };
}

test("buildExportSchema captures label, description, parsed widgetOptions and a resolved visibleColId", () => {
  const { tables, allColumns } = metadataFixture();
  const schema = buildExportSchema(tables, allColumns, ["Foo"]);
  const [mood, owner] = schema[0].columns;

  assert.equal(mood.label, "Humeur");
  assert.equal(mood.description, "Une note");
  assert.deepEqual(mood.widgetOptions, { choices: ["A", "B"], rulesOptions: [{ fillColor: "#FF0000" }] });
  assert.equal(mood.visibleColId, null);

  assert.equal(owner.label, "Owner");
  assert.equal(owner.description, null);
  assert.equal(owner.widgetOptions, null);
  assert.equal(owner.visibleColId, "Name"); // resolved from the raw visibleCol row id (3) to a colId
});

test("buildExportSchema gives the id of the column a two-way reference is linked to", () => {
  const tables = [{ tableRef: 10, tableId: "Pets" }, { tableRef: 20, tableId: "People" }];
  const allColumns = [
    { id: 1, parentId: 10, colId: "Owner", type: "Ref:People", isFormula: false, formula: "", parentPos: 1, reverseCol: 2 },
    { id: 2, parentId: 20, colId: "Pets", type: "RefList:Pets", isFormula: false, formula: "", parentPos: 2, reverseCol: 1 },
    { id: 3, parentId: 20, colId: "Name", type: "Text", isFormula: false, formula: "", parentPos: 1, reverseCol: 0 },
  ];
  const [pets, people] = buildExportSchema(tables, allColumns, ["Pets", "People"]);
  assert.deepEqual([pets.columns[0].reverseColId, people.columns.map((col) => col.reverseColId)], ["Pets", [null, "Owner"]]);
});

test("buildExportSchema never throws on an unparseable widgetOptions string", () => {
  const tables = [{ tableRef: 10, tableId: "Foo" }];
  const allColumns = [
    { id: 1, parentId: 10, colId: "A", type: "Text", isFormula: false, formula: "", parentPos: 1, widgetOptions: "{not json" },
  ];
  const schema = buildExportSchema(tables, allColumns, ["Foo"]);
  assert.equal(schema[0].columns[0].widgetOptions, null);
});

test("findReferencedTables finds a Ref target that isn't itself selected", () => {
  const { tables, allColumns } = metadataFixture();
  const referenced = findReferencedTables(tables, allColumns, ["Foo"]);
  assert.deepEqual(Array.from(referenced.keys()), ["Bar"]);
  assert.deepEqual(referenced.get("Bar"), ["Foo.Owner"]);
});

test("findReferencedTables is empty when the referenced table is already selected", () => {
  const { tables, allColumns } = metadataFixture();
  const referenced = findReferencedTables(tables, allColumns, ["Foo", "Bar"]);
  assert.equal(referenced.size, 0);
});

test("findReferencedTables ignores a reference to a table that doesn't exist among exportable tables", () => {
  const tables = [{ tableRef: 10, tableId: "Foo" }];
  const allColumns = [
    { id: 1, parentId: 10, colId: "Owner", type: "Ref:Deleted_Table", isFormula: false, formula: "", parentPos: 1 },
  ];
  const referenced = findReferencedTables(tables, allColumns, ["Foo"]);
  assert.equal(referenced.size, 0);
});

test("findReferencedTables handles RefList and groups multiple referencing columns", () => {
  const tables = [
    { tableRef: 10, tableId: "Foo" },
    { tableRef: 20, tableId: "Bar" },
  ];
  const allColumns = [
    { id: 1, parentId: 10, colId: "Owners", type: "RefList:Bar", isFormula: false, formula: "", parentPos: 1 },
    { id: 2, parentId: 10, colId: "BackupOwner", type: "Ref:Bar", isFormula: false, formula: "", parentPos: 2 },
    { id: 3, parentId: 20, colId: "Name", type: "Text", isFormula: false, formula: "", parentPos: 1 },
  ];
  const referenced = findReferencedTables(tables, allColumns, ["Foo"]);
  assert.deepEqual(referenced.get("Bar"), ["Foo.Owners", "Foo.BackupOwner"]);
});

test("fetchDocSchema also lists the id of every table, summary ones included", async () => {
  const grist = stubGrist(
    { id: [1, 2], tableId: ["Zebra", "Zebra_summary_X"], summarySourceTable: [0, 1] },
    { id: [], parentId: [], colId: [], type: [], isFormula: [], formula: [], parentPos: [] }
  );
  assert.deepEqual((await fetchDocSchema(grist)).tableIds, ["Zebra", "Zebra_summary_X"]);
});

test("findReferencedTables lists the tables alphabetically", () => {
  const tables = [{ tableId: "A", tableRef: 1 }, { tableId: "Zed", tableRef: 2 }, { tableId: "Bee", tableRef: 3 }];
  const columns = [
    { id: 1, parentId: 1, colId: "ToZed", type: "Ref:Zed", isFormula: false, parentPos: 1 },
    { id: 2, parentId: 1, colId: "ToBee", type: "RefList:Bee", isFormula: false, parentPos: 2 },
  ];
  assert.deepEqual([...findReferencedTables(tables, columns, ["A"])], [["Bee", ["A.ToBee"]], ["Zed", ["A.ToZed"]]]);
});

const exportedColumn = (colId, extra = {}) => ({ colId, type: "Text", isFormula: false, formula: "", label: null, description: null, widgetOptions: null, visibleColId: null, reverseColId: null, ...extra });

const SCHEMA = [
  {
    tableId: "Tasks",
    description: "Ce qu'il y a à faire",
    columns: [
      exportedColumn("Title", { label: "Titre", description: "Ce qu'il faut faire", widgetOptions: { alignment: "left" } }),
      exportedColumn("Status", { type: "Choice", widgetOptions: { choices: ["Todo", "Done"], choiceOptions: { Done: { fillColor: "#2A9D53" } } } }),
      exportedColumn("Owner", { type: "Ref:People", visibleColId: "Name", reverseColId: "Tasks" }),
      exportedColumn("Stamp", { type: "Int", formula: "NOW()" }),
      exportedColumn("Late", { type: "Bool", isFormula: true, formula: "$Due < TODAY()" }),
      exportedColumn("Blank", { type: "Numeric", isFormula: true, formula: "" }),
    ],
  },
  { tableId: "People", description: null, columns: [exportedColumn("Name")] },
];

test("omitFromExport with nothing omitted gives the schema as it is", () => {
  assert.deepEqual(omitFromExport(SCHEMA, new Set()), SCHEMA);
});

test("omitFromExport leaves out the elements asked, in every table, without touching the schema given", () => {
  const original = structuredClone(SCHEMA);
  const columns = (omitted) => omitFromExport(SCHEMA, new Set(omitted))[0].columns;
  const [title, status, owner] = columns(["labels", "descriptions", "choices", "options", "displayColumns", "twoWay"]);
  assert.deepEqual([title.label, title.description, title.widgetOptions], [null, null, null]);
  assert.equal(status.widgetOptions, null);
  assert.deepEqual([owner.visibleColId, owner.reverseColId], [null, null]);
  assert.deepEqual(columns(["labels"]).map((col) => col.label), [null, null, null, null, null, null]);
  assert.deepEqual(columns(["choices"])[1].widgetOptions, null);
  assert.deepEqual(columns(["options"]).map((col) => col.widgetOptions), [null, SCHEMA[0].columns[1].widgetOptions, null, null, null, null]);
  assert.deepEqual(SCHEMA, original, "not changed");
});

test("omitFromExport writes a column whose formula is left out as plain data, trigger formulas and empty formulas included", () => {
  const [, , , stamp, late, blank] = omitFromExport(SCHEMA, new Set(["formulas"]))[0].columns;
  assert.deepEqual([stamp.isFormula, stamp.formula, stamp.type], [false, "", "Int"]);
  assert.deepEqual([late.isFormula, late.formula, late.type], [false, "", "Bool"]);
  assert.deepEqual([blank.isFormula, blank.formula, blank.type], [false, "", "Numeric"], "a column that is a formula column is no longer one, even with nothing in it");
  const [title, status, owner] = omitFromExport(SCHEMA, new Set(["formulas"]))[0].columns;
  assert.deepEqual([title, status, owner], SCHEMA[0].columns.slice(0, 3), "only the formulas go");
  assert.deepEqual(omitFromExport(SCHEMA, new Set(["labels"]))[0].columns.slice(3).map((col) => [col.isFormula, col.formula]), [[false, "NOW()"], [true, "$Due < TODAY()"], [true, ""]], "formulas stay unless asked");
});

test("omitFromExport leaves out the descriptions of the tables, and only them", () => {
  const [tasks, people] = omitFromExport(SCHEMA, new Set(["tableDescriptions"]));
  assert.deepEqual([tasks.description, people.description], [null, null]);
  assert.deepEqual(tasks.columns, SCHEMA[0].columns, "the columns keep what they carry");
  assert.equal(omitFromExport(SCHEMA, new Set(["descriptions"]))[0].description, "Ce qu'il y a à faire", "the descriptions of the columns are another element");
});

test("fetchDocSchema gives each table the description of its raw data widget, which is also where it is written", async () => {
  const columns = { id: [], parentId: [], colId: [], type: [], isFormula: [], formula: [], parentPos: [] };
  const grist = stubGrist(
    { id: [1, 2, 3], tableId: ["Described", "Plain", "Blank"], summarySourceTable: [0, 0, 0], rawViewSectionRef: [10, 11, 12] },
    columns,
    { id: [10, 11, 12, 13], description: ["About it\non two lines", "", "", "A widget, not a table"] }
  );
  const { tables } = await fetchDocSchema(grist);
  assert.deepEqual(tables.map((table) => [table.tableId, table.rawViewSectionRef, table.description]), [["Blank", 12, null], ["Described", 10, "About it\non two lines"], ["Plain", 11, null]]);
});

test("fetchDocSchema copes with a Grist whose widgets have no description", async () => {
  const columns = { id: [], parentId: [], colId: [], type: [], isFormula: [], formula: [], parentPos: [] };
  const grist = stubGrist({ id: [1], tableId: ["Old"], summarySourceTable: [0], rawViewSectionRef: [10] }, columns, { id: [10] });
  assert.equal((await fetchDocSchema(grist)).tables[0].description, null);
});

test("buildExportSchema gives the description of each table", () => {
  const tables = [{ tableRef: 10, tableId: "Foo", description: "About Foo" }, { tableRef: 20, tableId: "Bar", description: null }, { tableRef: 30, tableId: "Old" }];
  const schema = buildExportSchema(tables, [], ["Foo", "Bar", "Old"]);
  assert.deepEqual(schema.map((table) => table.description), ["About Foo", null, null]);
});
