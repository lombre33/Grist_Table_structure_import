import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCode } from "../js/codeGenerator.js";
import { parseGristSchema } from "../js/parser.js";
import { resolveColumnType } from "../js/gristTypes.js";
import { omitFromExport } from "../js/schema.js";

const HEADER = "import grist\nfrom functions import *       # global uppercase functions\nimport datetime, math, re     # modules commonly needed in formulas\n";
const data = (colId, type, extra = {}) => ({ colId, type, isFormula: false, ...extra });
const formula = (colId, type, text, extra = {}) => ({ colId, type, isFormula: true, formula: text, ...extra });
const gen = (...columns) => generateCode([{ tableId: "T", columns }]);

/** What a pasted text gives back for each column of its only table. */
function readBack(text) {
  const { tables, warnings } = parseGristSchema(text);
  assert.deepEqual(warnings, []);
  return new Map(tables[0].columns.map((col) => [col.id, resolveColumnType(col.dslType, col.argsRaw, col.id, [])]));
}

test("reproduces Grist's header and a plain data column", () => {
  assert.equal(gen(data("A", "Text")), `${HEADER}\n\n@grist.UserTable\nclass T:\n  A = grist.Text()\n`);
});

test("a blank formula becomes 'return <type default>', as Grist does, with no decorator for Any", () => {
  const text = gen(formula("F1", "Text", ""), formula("F2", "Date", "   "), formula("F3", "Ref:Other", ""), formula("F4", "Any", ""));
  assert.match(text, /@grist\.formulaType\(grist\.Text\(\)\)\n {2}def F1\(rec, table\):\n {4}return ''\n/);
  assert.match(text, /@grist\.formulaType\(grist\.Date\(\)\)\n {2}def F2\(rec, table\):\n {4}return None\n/);
  assert.match(text, /@grist\.formulaType\(grist\.Reference\('Other'\)\)\n {2}def F3\(rec, table\):\n {4}return 0\n/);
  assert.match(text, /\n {2}def F4\(rec, table\):\n {4}return None\n/);
  assert.ok(!text.includes("formulaType(grist.Any())"));
});

test("blank lines separate data columns from formula columns, and formula columns from each other", () => {
  const text = gen(data("D1", "Text"), data("D2", "Int"), formula("F1", "Text", ""), formula("F2", "Text", ""));
  assert.equal(
    text,
    `${HEADER}\n\n@grist.UserTable\nclass T:\n  D1 = grist.Text()\n  D2 = grist.Int()\n` +
      "\n  @grist.formulaType(grist.Text())\n  def F1(rec, table):\n    return ''\n" +
      "\n  @grist.formulaType(grist.Text())\n  def F2(rec, table):\n    return ''\n"
  );
});

test("a single-line formula gets an implicit return, unless it is a statement already", () => {
  assert.match(gen(formula("Total", "Numeric", "$A + $B")), /def Total\(rec, table\):\n {4}return \$A \+ \$B\n/);
  assert.match(gen(formula("X", "Numeric", "return 42")), /def X\(rec, table\):\n {4}return 42\n/);
});

test("a multi-line formula is reproduced (dedented) rather than invented", () => {
  const text = gen(formula("X", "Numeric", "  if $A:\n    return 1\n  return 0"));
  assert.match(text, /def X\(rec, table\):\n {4}if \$A:\n {6}return 1\n {4}return 0\n/);
});

test("a data column with a trigger formula gets its function before it, as in Code View, and none without", () => {
  const trigger = gen(data("Stamp", "Text", { formula: "'new'" }), data("Plain", "Text", { formula: "" }), data("Other", "Int", { formula: undefined }));
  assert.equal(trigger, `${HEADER}\n\n@grist.UserTable\nclass T:\n\n  def _default_Stamp(rec, table, value, user):\n    return 'new'\n  Stamp = grist.Text()\n  Plain = grist.Text()\n  Other = grist.Int()\n`);
});

test("a trigger formula reads back as the same code on the same column", () => {
  const { tables } = parseGristSchema(gen(data("Stamp", "Text", { formula: "'a' + $B" }), data("B", "Text")));
  assert.deepEqual(tables[0].columns.map((col) => [col.id, col.kind, col.code]), [["Stamp", "trigger", "return 'a' + $B"], ["B", "data", ""]]);
});

test("an empty table body is 'pass', like gencode.py", () => {
  assert.match(generateCode([{ tableId: "Empty", columns: [] }]), /class Empty:\n {2}pass\n/);
});

test("tables are separated the way the first one follows the header", () => {
  const text = generateCode([{ tableId: "First", columns: [data("A", "Text")] }, { tableId: "Second", columns: [data("B", "Int")] }]);
  assert.equal(text, `${HEADER}\n\n@grist.UserTable\nclass First:\n  A = grist.Text()\n\n\n@grist.UserTable\nclass Second:\n  B = grist.Int()\n`);
});

test("choices, widget options, label, description and display column are written when there is something to say", () => {
  assert.match(gen(data("Mood", "Choice", { widgetOptions: { choices: ["Oui (confirmé)", "Non"] } })), /Mood = grist\.Choice\(choices=\['Oui \(confirmé\)', 'Non'\]\)\n/);
  assert.match(gen(data("Name", "Text", { label: "Full name" })), /Name = grist\.Text\(label='Full name'\)\n/);
  assert.match(gen(data("Name", "Text", { label: "Name" })), /Name = grist\.Text\(\)\n/);
  assert.match(gen(data("A", "Text", { description: "Une note (utile)" })), /A = grist\.Text\(description='Une note \(utile\)'\)\n/);
  assert.match(gen(data("Owner", "Ref:Other", { visibleColId: "Name" })), /Owner = grist\.Reference\('Other', visible_col='Name'\)\n/);
});

test("a two-way reference names its counterpart first, as Code View does, and reads back", () => {
  const text = gen(data("Owner", "Ref:People", { reverseColId: "Pets" }), data("Many", "RefList:People", { reverseColId: "Owner", label: "Plusieurs" }), data("Plain", "Ref:People"));
  assert.match(text, /Owner = grist\.Reference\('People', reverse_of='Pets'\)\n/);
  assert.match(text, /Many = grist\.ReferenceList\('People', reverse_of='Owner', label='Plusieurs'\)\n/);
  const read = readBack(text);
  assert.deepEqual([read.get("Owner").reverseColId, read.get("Many").reverseColId, read.get("Plain").reverseColId], ["Pets", "Owner", null]);
});

test("the other widgetOptions go in widget_options, without what must not travel", () => {
  const text = gen(data("Mood", "Choice", { widgetOptions: { choices: ["A", "B"], alignment: "center", rulesOptions: [{ fillColor: "#FF0000" }] } }));
  assert.match(text, /choices=\['A', 'B'\]/);
  assert.match(text, /widget_options='\{"alignment":"center"\}'/);
  assert.ok(!text.includes("rulesOptions"));
});

test("a formula column of type Any keeps its metadata, and stays plain when it has none", () => {
  const text = gen(formula("Plain", "Any", "None"), formula("Described", "Any", "None", { description: "d", label: "L" }));
  assert.doesNotMatch(text, /formulaType\(grist\.Any\(\)\)/);
  const { label, description, type } = readBack(text).get("Described");
  assert.deepEqual([type, label, description], ["Any", "L", "d"]);
});

test("every type survives the round trip with the same type", () => {
  const types = ["Text", "Int", "Numeric", "Bool", "Date", "Choice", "ChoiceList", "DateTime:Europe/Paris", "Ref:T", "RefList:T", "Attachments", "Any", "Blob"];
  const read = readBack(gen(...types.map((type, i) => data(`C${i}`, type)), formula("F", "Numeric", "$C1 * 2")));
  assert.deepEqual([...read.values()].map((col) => col.type), [...types, "Numeric"]);
});

test("every kind of metadata survives the round trip", () => {
  const text = gen(
    data("Mood", "Choice", {
      label: "Humeur (du jour)",
      description: "Une note (avec parenthèses) et une apostrophe : l'humeur",
      widgetOptions: {
        choices: ["Content (ok)", "Neutre", "Absent"],
        choiceOptions: { "Content (ok)": { fillColor: "#2A9D53", textColor: "#FFFFFF", fontBold: true } },
        alignment: "center",
        rulesOptions: [{ fillColor: "#FF0000" }],
      },
    }),
    data("Owner", "Ref:T", { visibleColId: "Mood", widgetOptions: { alignment: "left" } }),
    data("Plain", "Text")
  );
  const read = readBack(text);

  assert.deepEqual(read.get("Mood").widgetOptions, {
    choices: ["Content (ok)", "Neutre", "Absent"],
    choiceOptions: { "Content (ok)": { fillColor: "#2A9D53", textColor: "#FFFFFF", fontBold: true } },
    alignment: "center",
  });
  assert.deepEqual([read.get("Mood").label, read.get("Mood").description], ["Humeur (du jour)", "Une note (avec parenthèses) et une apostrophe : l'humeur"]);
  assert.deepEqual([read.get("Owner").visibleColId, read.get("Owner").widgetOptions], ["Mood", { alignment: "left" }]);
  const { label, description, widgetOptions, visibleColId } = read.get("Plain");
  assert.deepEqual([label, description, widgetOptions, visibleColId], [null, null, null, null]);
});

test("every text value survives the round trip, whatever characters it holds", () => {
  const texts = [
    "multi\nline", "windows\r\nline", "tab\there", "it's", 'say "hi"', "back\\slash", "ends with \\",
    "literal \\n sequence", "émoji 😀", "  padded  ", "a, b", "(x) [y] {z}", "# not a comment", "label = 'x'",
  ];
  const read = readBack(gen(...texts.map((text, i) => data(`C${i}`, "Choice", { label: text, description: text, widgetOptions: { choices: [text, "other"], question: text } }))));

  assert.equal(read.size, texts.length, "no column is lost");
  texts.forEach((text, i) => {
    const col = read.get(`C${i}`);
    assert.equal(col.label, text);
    assert.equal(col.description, text);
    assert.deepEqual(col.widgetOptions, { choices: [text, "other"], question: text });
  });
});

test("a formula's multi-line string is not indented, as in Grist, and reads back as written", () => {
  const code = 'note = """first\n# not a comment\n  indented\n\nlast"""\nreturn note.strip()';
  const text = gen(formula("F", "Text", code), formula("G", "Int", "1"));
  assert.match(text, /def F\(rec, table\):\n {4}note = """first\n# not a comment\n {2}indented\n\nlast"""\n {4}return note.strip\(\)\n/);
  const { tables, warnings } = parseGristSchema(text);
  assert.deepEqual(warnings, []);
  assert.deepEqual(tables[0].columns.map((col) => [col.id, col.code]), [["F", code], ["G", "return 1"]]);
});

test("a multi-line string as indented as the code is indented with it, so that it reads back as written", () => {
  const code = 'x = """a\n      deep\n    four"""\nreturn x';
  const text = gen(formula("F", "Text", code), formula("G", "Int", "1"));
  assert.match(text, /def F\(rec, table\):\n {4}x = """a\n {10}deep\n {8}four"""\n {4}return x\n/);
  const { tables, warnings } = parseGristSchema(text);
  assert.deepEqual(warnings, []);
  assert.deepEqual(tables[0].columns.map((col) => [col.id, col.code]), [["F", code], ["G", "return 1"]]);
});

test("the code of a formula is indented from its own margin, whatever a line of a string leaves", () => {
  const text = gen(formula("F", "Text", '  note = """first\nsecond"""\n  return note'));
  assert.match(text, /def F\(rec, table\):\n {4}note = """first\nsecond"""\n {4}return note\n/);
});

test("a formula of hundreds of thousands of lines is written like any other", () => {
  const lines = gen(formula("F", "Int", `${"x = 1\n".repeat(300000)}return x`)).split("\n");
  assert.ok(lines.length > 300000);
});

const RICH = [
  {
    tableId: "T",
    columns: [
      data("Mood", "Choice", { label: "Humeur", description: "Du jour", widgetOptions: { choices: ["a"], alignment: "center" } }),
      data("Owner", "Ref:People", { visibleColId: "Name", reverseColId: "Pets" }),
      data("Stamp", "Int", { formula: "1" }),
      formula("Late", "Bool", "$A"),
    ],
  },
];
const LEFT_OUT = [
  ["labels", /label='Humeur'/],
  ["descriptions", /description='Du jour'/],
  ["choices", /choices=\['a'\]/],
  ["options", /widget_options='\{"alignment":"center"\}'/],
  ["displayColumns", /visible_col='Name'/],
  ["twoWay", /reverse_of='Pets'/],
  ["formulas", /def Late|def _default_Stamp/],
];

test("an element left out of the export is gone from the text, and only that one", () => {
  const written = (omitted) => generateCode(omitFromExport(RICH, new Set(omitted)));
  for (const [element, pattern] of LEFT_OUT) {
    assert.match(written([]), pattern, `${element} is written when nothing is left out`);
    const text = written([element]);
    assert.doesNotMatch(text, pattern, `${element} is left out`);
    for (const [other, otherPattern] of LEFT_OUT) if (other !== element) assert.match(text, otherPattern, `${other} stays when only ${element} is left out`);
  }
});

test("with every element left out, the export is the types of the columns", () => {
  const text = generateCode(omitFromExport(RICH, new Set(LEFT_OUT.map(([element]) => element))));
  assert.equal(text, `${HEADER}\n\n@grist.UserTable\nclass T:\n  Mood = grist.Choice()\n  Owner = grist.Reference('People')\n  Stamp = grist.Int()\n  Late = grist.Bool()\n`);
});
