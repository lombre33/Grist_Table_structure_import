import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveColumnType, describeType, TABLE_ID_RE } from "../js/gristTypes.js";

function resolve(dslType, argsRaw) {
  const warnings = [];
  const result = resolveColumnType(dslType, argsRaw, "Col", warnings);
  return { ...result, warnings };
}

test("maps simple scalar types verbatim", () => {
  for (const t of ["Text", "Numeric", "Int", "Bool", "Date", "Any"]) {
    const { type, warnings } = resolve(t, "");
    assert.equal(type, t);
    assert.deepEqual(warnings, []);
  }
});

test("Choice without choices= has no widgetOptions", () => {
  const { type, widgetOptions, warnings } = resolve("Choice", "");
  assert.equal(type, "Choice");
  assert.equal(widgetOptions, null);
  assert.deepEqual(warnings, []);
});

test("Choice with choices= extracts the list without evaluating it", () => {
  const { widgetOptions } = resolve("Choice", "choices=['Oui', 'Non', \"Peut-être\"]");
  assert.deepEqual(widgetOptions, { choices: ["Oui", "Non", "Peut-être"] });
});

test("ChoiceList maps to ChoiceList and also reads choices=", () => {
  const { type, widgetOptions } = resolve("ChoiceList", "choices=['A', 'B']");
  assert.equal(type, "ChoiceList");
  assert.deepEqual(widgetOptions, { choices: ["A", "B"] });
});

test("DateTime defaults to UTC with a warning when no timezone is given", () => {
  const { type, warnings } = resolve("DateTime", "");
  assert.equal(type, "DateTime:UTC");
  assert.equal(warnings.length, 1);
});

test("DateTime keeps an explicit timezone without a warning", () => {
  const { type, warnings } = resolve("DateTime", "'Europe/Paris'");
  assert.equal(type, "DateTime:Europe/Paris");
  assert.deepEqual(warnings, []);
});

test("Reference resolves to Ref:<table> when a target is given", () => {
  const { type, refTarget, warnings } = resolve("Reference", "'Other_Table'");
  assert.equal(type, "Ref:Other_Table");
  assert.equal(refTarget, "Other_Table");
  assert.deepEqual(warnings, []);
});

test("ReferenceList resolves to RefList:<table>", () => {
  const { type, refTarget } = resolve("ReferenceList", "'Other_Table'");
  assert.equal(type, "RefList:Other_Table");
  assert.equal(refTarget, "Other_Table");
});

test("Reference without a valid target falls back to Any with a warning", () => {
  const { type, refTarget, warnings } = resolve("Reference", "");
  assert.equal(type, "Any");
  assert.equal(refTarget, null);
  assert.equal(warnings.length, 1);
});

test("Attachments maps verbatim", () => {
  const { type } = resolve("Attachments", "");
  assert.equal(type, "Attachments");
});

test("unknown DSL types fall back to Any with a warning", () => {
  const { type, warnings } = resolve("SomethingMadeUp", "");
  assert.equal(type, "Any");
  assert.equal(warnings.length, 1);
});

test("describeType produces readable French labels", () => {
  assert.equal(describeType("Text"), "Texte");
  assert.equal(describeType("Ref:Foo"), "Référence vers « Foo »");
  assert.equal(describeType("RefList:Foo"), "Références vers « Foo » (liste)");
  assert.equal(describeType("DateTime:UTC"), "Date et heure (UTC)");
});

test("TABLE_ID_RE matches valid Grist/Python identifiers only", () => {
  assert.ok(TABLE_ID_RE.test("Ma_Table1"));
  assert.ok(TABLE_ID_RE.test("_private"));
  assert.ok(!TABLE_ID_RE.test("1Table"));
  assert.ok(!TABLE_ID_RE.test("Ma Table"));
  assert.ok(!TABLE_ID_RE.test("Ma-Table"));
});
