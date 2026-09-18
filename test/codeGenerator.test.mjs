import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCode } from "../js/codeGenerator.js";
import { parseGristSchema } from "../js/parser.js";
import { resolveColumnType } from "../js/gristTypes.js";

test("reproduces Grist's exact header and a plain data column", () => {
  const text = generateCode([
    { tableId: "T", columns: [{ colId: "A", type: "Text", isFormula: false }] },
  ]);
  assert.equal(
    text,
    "import grist\n" +
      "from functions import *       # global uppercase functions\n" +
      "import datetime, math, re     # modules commonly needed in formulas\n" +
      "\n\n" +
      "@grist.UserTable\n" +
      "class T:\n" +
      "  A = grist.Text()\n"
  );
});

test("a blank formula becomes 'return <type default>', matching Grist for each type", () => {
  const text = generateCode([
    {
      tableId: "T",
      columns: [
        { colId: "F1", type: "Text", isFormula: true, formula: "" },
        { colId: "F2", type: "Date", isFormula: true, formula: "   " },
        { colId: "F3", type: "Ref:Other", isFormula: true, formula: "" },
        { colId: "F4", type: "Any", isFormula: true, formula: "" },
      ],
    },
  ]);
  assert.match(text, /@grist\.formulaType\(grist\.Text\(\)\)\n {2}def F1\(rec, table\):\n {4}return ''\n/);
  assert.match(text, /@grist\.formulaType\(grist\.Date\(\)\)\n {2}def F2\(rec, table\):\n {4}return None\n/);
  assert.match(
    text,
    /@grist\.formulaType\(grist\.Reference\('Other'\)\)\n {2}def F3\(rec, table\):\n {4}return 0\n/
  );
  // Any-typed formulas get no @grist.formulaType decorator, like gencode.py.
  assert.match(text, /\n {2}def F4\(rec, table\):\n {4}return None\n/);
  assert.ok(!text.includes("formulaType(grist.Any())"));
});

test("blank lines separate data columns from formula columns, and formula columns from each other", () => {
  const text = generateCode([
    {
      tableId: "T",
      columns: [
        { colId: "D1", type: "Text", isFormula: false },
        { colId: "D2", type: "Int", isFormula: false },
        { colId: "F1", type: "Text", isFormula: true, formula: "" },
        { colId: "F2", type: "Text", isFormula: true, formula: "" },
      ],
    },
  ]);
  assert.equal(
    text,
    "import grist\n" +
      "from functions import *       # global uppercase functions\n" +
      "import datetime, math, re     # modules commonly needed in formulas\n" +
      "\n\n" +
      "@grist.UserTable\n" +
      "class T:\n" +
      "  D1 = grist.Text()\n" +
      "  D2 = grist.Int()\n" +
      "\n" +
      "  @grist.formulaType(grist.Text())\n" +
      "  def F1(rec, table):\n" +
      "    return ''\n" +
      "\n" +
      "  @grist.formulaType(grist.Text())\n" +
      "  def F2(rec, table):\n" +
      "    return ''\n"
  );
});

test("a single-line non-blank formula gets an implicit return", () => {
  const text = generateCode([
    {
      tableId: "T",
      columns: [{ colId: "Total", type: "Numeric", isFormula: true, formula: "$A + $B" }],
    },
  ]);
  assert.match(text, /def Total\(rec, table\):\n {4}return \$A \+ \$B\n/);
});

test("a single-line formula that is already a statement is left untouched", () => {
  const text = generateCode([
    {
      tableId: "T",
      columns: [{ colId: "X", type: "Numeric", isFormula: true, formula: "return 42" }],
    },
  ]);
  assert.match(text, /def X\(rec, table\):\n {4}return 42\n/);
});

test("a multi-line formula is reproduced (dedented) rather than invented", () => {
  const text = generateCode([
    {
      tableId: "T",
      columns: [
        {
          colId: "X",
          type: "Numeric",
          isFormula: true,
          formula: "  if $A:\n    return 1\n  return 0",
        },
      ],
    },
  ]);
  assert.match(text, /def X\(rec, table\):\n {4}if \$A:\n {6}return 1\n {4}return 0\n/);
});

test("an empty table body is 'pass', like gencode.py", () => {
  const text = generateCode([{ tableId: "Empty", columns: [] }]);
  assert.match(text, /class Empty:\n {2}pass\n/);
});

test("multiple tables are separated the same way as after the header", () => {
  const text = generateCode([
    { tableId: "First", columns: [{ colId: "A", type: "Text", isFormula: false }] },
    { tableId: "Second", columns: [{ colId: "B", type: "Int", isFormula: false }] },
  ]);
  assert.equal(
    text,
    "import grist\n" +
      "from functions import *       # global uppercase functions\n" +
      "import datetime, math, re     # modules commonly needed in formulas\n" +
      "\n\n" +
      "@grist.UserTable\n" +
      "class First:\n" +
      "  A = grist.Text()\n" +
      "\n\n" +
      "@grist.UserTable\n" +
      "class Second:\n" +
      "  B = grist.Int()\n"
  );
});

test("round-trips through parseGristSchema: same column ids and types come back out", () => {
  const schema = [
    {
      tableId: "RoundTrip",
      columns: [
        { colId: "Name", type: "Text", isFormula: false },
        { colId: "Age", type: "Int", isFormula: false },
        { colId: "Active", type: "Bool", isFormula: false },
        { colId: "Mood", type: "Choice", isFormula: false },
        { colId: "Tags", type: "ChoiceList", isFormula: false },
        { colId: "Birthday", type: "Date", isFormula: false },
        { colId: "Created", type: "DateTime:Europe/Paris", isFormula: false },
        { colId: "Owner", type: "Ref:RoundTrip", isFormula: false },
        { colId: "Friends", type: "RefList:RoundTrip", isFormula: false },
        { colId: "Photo", type: "Attachments", isFormula: false },
        { colId: "Computed", type: "Numeric", isFormula: true, formula: "$Age * 2" },
        { colId: "Untyped", type: "Any", isFormula: true, formula: "" },
      ],
    },
  ];

  const text = generateCode(schema);
  const { tables, warnings } = parseGristSchema(text);

  assert.equal(tables.length, 1);
  assert.equal(tables[0].tableId, "RoundTrip");

  const resolved = tables[0].columns.map((col) => {
    const colWarnings = [];
    const r = resolveColumnType(col.dslType, col.argsRaw, col.id, colWarnings);
    return [col.id, r.type];
  });

  assert.deepEqual(resolved, [
    ["Name", "Text"],
    ["Age", "Int"],
    ["Active", "Bool"],
    ["Mood", "Choice"],
    ["Tags", "ChoiceList"],
    ["Birthday", "Date"],
    ["Created", "DateTime:Europe/Paris"],
    ["Owner", "Ref:RoundTrip"],
    ["Friends", "RefList:RoundTrip"],
    ["Photo", "Attachments"],
    ["Computed", "Numeric"],
    ["Untyped", "Any"],
  ]);
  assert.deepEqual(warnings, []);
});
