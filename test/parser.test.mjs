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
  assert.match(warnings[0], /classe valide/);
});

test("filters reserved column ids and flags duplicates", () => {
  const source = `
@grist.UserTable
class T:
  id = grist.Text()
  A = grist.Text()
  A = grist.Int()
`;
  const { tables, warnings } = parseGristSchema(source);
  assert.deepEqual(
    tables[0].columns.map((c) => c.id),
    ["A", "A"]
  );
  assert.ok(warnings.some((w) => /réservé/.test(w)));
  assert.ok(warnings.some((w) => /double/.test(w)));
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
  assert.ok(warnings.some((w) => /décorateur non reconnu/.test(w)));
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
  assert.ok(warnings.some((w) => /contenu non reconnu/.test(w)));
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
