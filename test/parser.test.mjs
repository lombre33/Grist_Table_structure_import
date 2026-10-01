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
