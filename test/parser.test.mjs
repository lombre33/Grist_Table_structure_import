import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGristSchema } from "../js/parser.js";
import { resolveColumnType } from "../js/gristTypes.js";
import { seeded } from "./random.mjs";

test("parses a simple table with assignment and formula-style columns", () => {
  const source = `
import grist
from functions import *

@grist.UserTable
class Volunteers:
  Availability = grist.Choice()

  @grist.formulaType(grist.Text())
  def First_name(rec, table):
    return ''

  def Plain_field(rec, table):
    return None
`;
  const { tables, warnings } = parseGristSchema(source);

  assert.equal(tables.length, 1);
  assert.equal(tables[0].tableId, "Volunteers");
  assert.deepEqual(
    tables[0].columns.map((c) => [c.id, c.dslType]),
    [
      ["Availability", "Choice"],
      ["First_name", "Text"],
      ["Plain_field", "Any"],
    ]
  );
  assert.deepEqual(warnings, []);
});

test("does not misinterpret a formula's return statement as a new column", () => {
  const source = `
@grist.UserTable
class T:
  @grist.formulaType(grist.Numeric())
  def Total(rec, table):
    if rec.A:
      return rec.A + rec.B
    return 0

  Next = grist.Text()
`;
  const { tables } = parseGristSchema(source);
  assert.deepEqual(
    tables[0].columns.map((c) => c.id),
    ["Total", "Next"]
  );
});

test("parses multiple tables from a single paste", () => {
  const source = `
@grist.UserTable
class First:
  A = grist.Text()

@grist.UserTable
class Second:
  B = grist.Int()
`;
  const { tables } = parseGristSchema(source);
  assert.deepEqual(
    tables.map((t) => t.tableId),
    ["First", "Second"]
  );
  assert.equal(tables[0].columns.length, 1);
  assert.equal(tables[1].columns.length, 1);
});

test("reports a warning and finds no table when input has none", () => {
  const { tables, warnings } = parseGristSchema("print('hello')\n");
  assert.equal(tables.length, 0);
  assert.equal(warnings.length, 1);
});

test("warns and skips when the UserTable decorator is not followed by a class", () => {
  const source = `
@grist.UserTable
x = 1
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.equal(tables.length, 0);
  assert.equal(warnings[0].key, "warn.decoratorNoClass");
});

test("skips reserved column ids and duplicates, ignoring the case of ids like Grist does", () => {
  const source = `
@grist.UserTable
class T:
  id = grist.Text()
  A = grist.Text()
  a = grist.Int()
  B = grist.Int()
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(tables[0].columns.map((c) => c.id), ["A", "B"]);
  assert.deepEqual(warnings.map((w) => w.key), ["warn.reservedColumnId", "warn.duplicateColumnId"]);
});

test("ignores comments and unrecognized decorators without crashing", () => {
  const source = `
@grist.UserTable
class T:
  # a plain comment
  @grist.something.else()
  A = grist.Text()
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(
    tables[0].columns.map((c) => c.id),
    ["A"]
  );
  assert.deepEqual(warnings.map((w) => w.key), ["warn.unknownDecorator"]);
});

test("a column value containing a literal parenthesis no longer breaks parsing", () => {
  const source = `
@grist.UserTable
class T:
  Mood = grist.Choice(choices=['Oui (confirmé)', 'Non'], label='Humeur (du jour)', description='Une valeur (test) ici')
  Next = grist.Text()
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(
    tables[0].columns.map((c) => c.id),
    ["Mood", "Next"]
  );
  assert.match(tables[0].columns[0].argsRaw, /choices=\['Oui \(confirmé\)', 'Non'\]/);
  assert.match(tables[0].columns[0].argsRaw, /label='Humeur \(du jour\)'/);
  assert.deepEqual(warnings, []);
});

test("a formulaType value containing parentheses is still recognized", () => {
  const source = `
@grist.UserTable
class T:
  @grist.formulaType(grist.Choice(choices=['A (a)', 'B']))
  def Status(rec, table):
    return ''
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(tables[0].columns.map((c) => [c.id, c.dslType]), [["Status", "Choice"]]);
  assert.match(tables[0].columns[0].argsRaw, /choices=\['A \(a\)', 'B'\]/);
  assert.deepEqual(warnings, []);
});

test("an unterminated call (unbalanced parenthesis) is reported, not mis-parsed", () => {
  const source = `
@grist.UserTable
class T:
  A = grist.Text(label='unterminated
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(tables[0].columns, []);
  assert.deepEqual(warnings.map((w) => w.key), ["warn.unrecognizedContent"]);
});

test("never throws on arbitrary/malicious-looking input", () => {
  const trickyInputs = [
    "",
    "@grist.UserTable\nclass A:\n  x = grist.Text(",
    "__import__('os').system('echo hi')",
    "@grist.UserTable\nclass " + "A".repeat(1000) + ":\n  a = grist.Text()",
    "\u0000\u0001@grist.UserTable\nclass T:\n  a = grist.Text()",
  ];
  for (const input of trickyInputs) {
    assert.doesNotThrow(() => parseGristSchema(input));
  }
});

test("a warning names its table and line", () => {
  const { warnings } = parseGristSchema("@grist.UserTable\nclass T:\n  A = grist.Text()\n  oops\n");
  assert.deepEqual(warnings, [{ key: "warn.unrecognizedContent", params: { line: 4, snippet: "oops" }, table: "T" }]);
});

test("trigger formulas, summary blocks and `pass` of a real Code View raise no warning", () => {
  const source = `
@grist.UserTable
class People:
  Name = grist.Text()

  def _default_Stamp(rec, table, value, user):
    return 'hello'
  Stamp = grist.Text()

  class _Summary:

    @grist.formulaType(grist.Int())
    def count(rec, table):
      return len(rec.group)

@grist.UserTable
class Empty:
  pass
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(warnings, []);
  assert.deepEqual(tables.map((t) => [t.tableId, t.columns.map((c) => [c.id, c.kind])]), [["People", [["Name", "data"], ["Stamp", "trigger"]]], ["Empty", []]]);
});

test("a formula column is a formula, and its decorator that has no function is reported with its own line", () => {
  const source = `
@grist.UserTable
class T:
  @grist.formulaType(grist.Int())
  def F(rec, table):
    return 1

  @grist.formulaType(grist.Text())

  A = grist.Text()
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(tables[0].columns.map((c) => [c.id, c.dslType, c.kind]), [["F", "Int", "formula"], ["A", "Text", "data"]]);
  assert.deepEqual(warnings.map((w) => [w.key, w.params.line]), [["warn.formulaTypeNoFunction", 8]]);
});

test("a formula's code is kept as written, without its indentation, and stops where the next column starts", () => {
  const source = `
@grist.UserTable
class T:
  A = grist.Int()

  @grist.formulaType(grist.Numeric())
  def Double(rec, table):
    x = rec.A
    # inner comment
    if x:
      return x * 2
    return 0

  # about the next column
  Next = grist.Int()

  def Last(rec, table):
    return rec.A`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(warnings, []);
  assert.deepEqual(tables[0].columns.map((c) => [c.id, c.kind, c.code]), [
    ["A", "data", ""],
    ["Double", "formula", "x = rec.A\n# inner comment\nif x:\n  return x * 2\nreturn 0"],
    ["Next", "data", ""],
    ["Last", "formula", "return rec.A"],
  ]);
});

test("a trigger formula belongs to the data column of the same id, wherever it is written", () => {
  const source = `
@grist.UserTable
class T:
  def _default_Stamp(rec, table, value, user):
    return NOW()
  Stamp = grist.DateTime('UTC')
  Other = grist.Text()
  def _default_Missing(rec, table, value, user):
    return 1
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(warnings, []);
  assert.deepEqual(tables[0].columns.map((c) => [c.id, c.kind, c.code]), [["Stamp", "trigger", "return NOW()"], ["Other", "data", ""]]);
});

test("a function without a body, or with comments only, has no code", () => {
  const { tables } = parseGristSchema("@grist.UserTable\nclass T:\n  def A(rec, table):\n  B = grist.Int()\n  def C(rec, table):\n    # nothing\n");
  assert.deepEqual(tables[0].columns.map((c) => [c.id, c.kind, c.code]), [["A", "formula", ""], ["B", "data", ""], ["C", "formula", ""]]);
});

test("input mutated at random never makes the parser throw or stall", () => {
  const sample = readFileSync(new URL("./fixtures/code-view/features.py", import.meta.url), "utf8");
  const pieces = ["'", '"', "(", ")", "[", "]", "\\", ",", "=", "\n", "  ", "@grist.UserTable\n", "class X:\n", "choices=[", "grist.Reference('", "label='", "widget_options='{"];
  const random = seeded(7);
  const pick = (n) => Math.floor(random() * n);
  const started = Date.now();

  for (let round = 0; round < 3000; round++) {
    let text = sample;
    for (let mutation = 0, count = 1 + pick(6); mutation < count; mutation++) {
      const at = pick(text.length);
      const kind = pick(3);
      if (kind === 0) text = text.slice(0, at) + pieces[pick(pieces.length)] + text.slice(at);
      else if (kind === 1) text = text.slice(0, at) + text.slice(at + 1 + pick(20));
      else text = text.slice(0, at) + text.slice(Math.max(0, at - pick(40)), at) + text.slice(at);
    }
    for (const table of parseGristSchema(text).tables) {
      for (const col of table.columns) resolveColumnType(col.dslType, col.argsRaw, col.id, []);
    }
  }
  assert.ok(Date.now() - started < 15000, "3000 mutated texts parse quickly");
});

test("a formula's multi-line string, which Grist writes unindented, stays in the formula and costs no column", () => {
  const source = [
    "@grist.UserTable",
    "class T:",
    "  A = grist.Text()",
    "",
    "  def _default_Stamp(rec, table, value, user):",
    '    return """a',
    'b"""',
    "  Stamp = grist.Text()",
    "",
    "  @grist.formulaType(grist.Text())",
    "  def F(rec, table):",
    '    note = """first',
    "# not a comment",
    "  indented",
    "",
    "@grist.UserTable",
    'after blank"""',
    "    return note.strip()",
    "",
    "  @grist.formulaType(grist.Int())",
    "  def G(rec, table):",
    "    return 1",
  ].join("\n");
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(warnings, []);
  assert.deepEqual(tables.map((table) => table.tableId), ["T"], "a line of the string that looks like a decorator starts no table");
  assert.deepEqual(tables[0].columns.map((col) => [col.id, col.kind]), [["A", "data"], ["Stamp", "trigger"], ["F", "formula"], ["G", "formula"]]);
  assert.equal(tables[0].columns[1].code, 'return """a\nb"""');
  assert.equal(tables[0].columns[2].code, 'note = """first\n# not a comment\n  indented\n\n@grist.UserTable\nafter blank"""\nreturn note.strip()');
});

test("a formula of hundreds of thousands of lines is read like any other", () => {
  const source = `@grist.UserTable\nclass T:\n  def F(rec, table):\n${"    x = 1\n".repeat(300000)}    return x\n  B = grist.Text()\n`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(warnings, []);
  assert.deepEqual(tables[0].columns.map((col) => col.id), ["F", "B"]);
  assert.equal(tables[0].columns[0].code.split("\n").length, 300001);
});

test("a string Grist leaves unindented without triple quotes costs no column, and one never closed costs no table", () => {
  const body = (...lines) => ["@grist.UserTable", "class T:", "  A = grist.Text()", "", ...lines, "", "  B = grist.Text()", ""].join("\n");
  for (const code of ['    x = ("abc"\n"def")\n    return x', "    x = 'abc\\\ndef'\n    return x"]) {
    const { tables, warnings } = parseGristSchema(body("  def F(rec, table):", code));
    assert.deepEqual(warnings, []);
    assert.deepEqual(tables[0].columns.map((col) => col.id), ["A", "F", "B"]);
  }
  const { tables } = parseGristSchema(`${body("  def F(rec, table):", '    return """oops')}\n@grist.UserTable\nclass U:\n  C = grist.Text()\n`);
  assert.deepEqual(tables.map((table) => [table.tableId, table.columns.map((col) => col.id)]), [["T", ["A", "F", "B"]], ["U", ["C"]]]);
});

test("the lines of a multi-line string are read back as written, whether Grist indents them with the code (before 1.7.20) or leaves them (after)", () => {
  const formula = 'note = """first\n# not a comment\n  indented\n\nlast"""\nreturn note.strip()';
  const before = '@grist.UserTable\nclass T:\n  def F(rec, table):\n    note = """first\n    # not a comment\n      indented\n\n    last"""\n    return note.strip()\n  B = grist.Text()\n';
  const after = '@grist.UserTable\nclass T:\n  def F(rec, table):\n    note = """first\n# not a comment\n  indented\n\nlast"""\n    return note.strip()\n  B = grist.Text()\n';
  for (const source of [before, after]) {
    const { tables } = parseGristSchema(source);
    assert.deepEqual(tables[0].columns.map((col) => [col.id, col.code]), [["F", formula], ["B", ""]]);
  }
});

test("when every line of a multi-line string is as indented as the code, the layout cannot be told, and is taken for the older one", () => {
  const source = '@grist.UserTable\nclass T:\n  def F(rec, table):\n    x = """a\n      deep\n    four"""\n    return x\n';
  assert.equal(parseGristSchema(source).tables[0].columns[0].code, 'x = """a\n  deep\nfour"""\nreturn x');
});

test("a string at the top of the text or of a class, which holds what looks like a table, is only a string", () => {
  const source = 'x = """\n@grist.UserTable\nclass Fake:\n  A = grist.Text()\n"""\n\n@grist.UserTable\nclass T:\n  """Doc\nof the table"""\n  B = grist.Text()\n';
  const { tables } = parseGristSchema(source);
  assert.deepEqual(tables.map((table) => [table.tableId, table.columns.map((col) => col.id)]), [["T", ["B"]]]);
});

test("a text of hundreds of thousands of unrecognized lines gives as many warnings, and no exception", () => {
  const { warnings } = parseGristSchema(`@grist.UserTable\nclass T:\n${"  foo bar\n".repeat(200000)}`);
  assert.equal(warnings.length, 200000);
});

const described = (opening) => `@grist.UserTable\nclass T:\n${opening}  A = grist.Text()\n`;

test("a string that opens the class is the description of the table, written like a column's, and is no unrecognized content", () => {
  for (const [opening, expected] of [
    ["  'Table des clients'\n", "Table des clients"],
    ['  "Table des clients"\n', "Table des clients"],
    ["  'ligne 1\\nligne 2 \\'citée\\' \\\\ fin'\n", "ligne 1\nligne 2 'citée' \\ fin"],
    ["  ''\n", null],
    ["", null],
  ]) {
    const { tables, warnings } = parseGristSchema(described(opening));
    assert.equal(tables[0].description, expected, JSON.stringify(opening));
    assert.deepEqual(warnings, [], JSON.stringify(opening));
    assert.deepEqual(tables[0].columns.map((col) => col.id), ["A"]);
  }
});

test("comments and blank lines before the string do not stop it from opening the class", () => {
  const { tables, warnings } = parseGristSchema("@grist.UserTable\nclass T:\n  # un commentaire\n\n  'La table'\n  A = grist.Text()\n");
  assert.deepEqual([tables[0].description, warnings], ["La table", []]);
});

test("a string that is not the first thing in the class is not a description: it is said to be ignored", () => {
  const { tables, warnings } = parseGristSchema("@grist.UserTable\nclass T:\n  A = grist.Text()\n  'Trop tard'\n");
  assert.equal(tables[0].description, null);
  assert.deepEqual(warnings.map((warning) => [warning.key, warning.params.snippet]), [["warn.unrecognizedContent", "'Trop tard'"]]);
});

test("each table has its own description, and a table without one has none", () => {
  const { tables } = parseGristSchema("@grist.UserTable\nclass One:\n  'Première'\n  A = grist.Text()\n\n@grist.UserTable\nclass Two:\n  B = grist.Text()\n\n@grist.UserTable\nclass Three:\n  \"Troisième\"\n  pass\n");
  assert.deepEqual(tables.map((table) => [table.tableId, table.description]), [["One", "Première"], ["Two", null], ["Three", "Troisième"]]);
});

test("a description that is not a one-line string literal is ignored with a warning, never read as code", () => {
  const { tables, warnings } = parseGristSchema('@grist.UserTable\nclass T:\n  """Trois guillemets"""\n  A = grist.Text()\n');
  assert.equal(tables[0].description, null);
  assert.deepEqual(warnings.map((warning) => warning.key), ["warn.unrecognizedContent"]);
  assert.deepEqual(tables[0].columns.map((col) => col.id), ["A"]);
});

test("a class line followed by a very long run of spaces is read in linear time, the text being pasted from anywhere", () => {
  const started = performance.now();
  const { tables, warnings } = parseGristSchema(`@grist.UserTable\nclass A${" ".repeat(100_000)}x\n  B = grist.Text()\n`);
  assert.ok(performance.now() - started < 1000, "a line of that kind took as long as backtracking over every split of the spaces");
  assert.deepEqual(tables, []);
  assert.deepEqual(warnings.map((warning) => warning.key), ["warn.decoratorNoClass", "warn.noTableFound"]);
});

test("the line of a class is read whatever the spaces around its bases and its colon", () => {
  for (const line of ["class A:", "class A :", "class A(Base):", "class  A  (Base)  :  ", "class A(grist.Table)\t:"]) {
    assert.deepEqual(parseGristSchema(`@grist.UserTable\n${line}\n  B = grist.Text()\n`).tables.map((table) => table.tableId), ["A"], line);
  }
});
