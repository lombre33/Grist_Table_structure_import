import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGristSchema, findMatchingClose } from "../js/parser.js";

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

test("findMatchingClose skips brackets inside quoted strings", () => {
  const text = "(choices=['Oui (confirmé)', \"B]\"])";
  assert.equal(findMatchingClose(text, 0), text.length - 1);
});

test("findMatchingClose handles escaped quotes inside a string", () => {
  const text = "('it\\'s (nested)')";
  assert.equal(findMatchingClose(text, 0), text.length - 1);
});

test("findMatchingClose returns -1 for an unterminated bracket", () => {
  assert.equal(findMatchingClose("(abc", 0), -1);
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
  assert.deepEqual(tables.map((t) => [t.tableId, t.columns.map((c) => [c.id, c.computed])]), [["People", [["Name", false], ["Stamp", true]]], ["Empty", []]]);
});

test("a formula column is computed, and its decorator that has no function is reported with its own line", () => {
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
  assert.deepEqual(tables[0].columns.map((c) => [c.id, c.dslType, c.computed]), [["F", "Int", true], ["A", "Text", false]]);
  assert.deepEqual(warnings.map((w) => [w.key, w.params.line]), [["warn.formulaTypeNoFunction", 8]]);
});
