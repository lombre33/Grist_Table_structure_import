/**
 * Canonical, exhaustive coverage for every Grist column type this widget's
 * Import understands from a pasted "Code View" `grist.Xxx(...)` constructor
 * (see resolveBareType() in js/gristTypes.js — this file's SIMPLE_TYPES /
 * describe() blocks below are meant to mirror that switch one-for-one: a
 * type added there without a matching case here should be treated as a gap
 * in this suite, not just in gristTypes.js).
 *
 * Other test files already cover individual behaviors (kwarg parsing,
 * sanitizeWidgetOptions, generateCode formatting...) in more depth; this
 * file's job is narrower and specific: for each type, (1) resolveColumnType
 * produces the right `type` string and no spurious warning, (2) describeType
 * gives a sensible label, (3) buildTypeExpression is the exact inverse used
 * by Export, (4) defaultLiteralForType matches Grist's own
 * `usertypes.py:_type_defaults`, and (5) a full
 * generateCode -> parseGristSchema -> resolveColumnType round trip comes
 * back with the same type (and, where relevant, the same metadata).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveColumnType, describeType, buildTypeExpression, defaultLiteralForType } from "../js/gristTypes.js";
import { generateCode } from "../js/codeGenerator.js";
import { parseGristSchema } from "../js/parser.js";

function resolve(dslType, argsRaw = "") {
  const warnings = [];
  const result = resolveColumnType(dslType, argsRaw, "Col", warnings);
  return { ...result, warnings };
}

// Types with no positional constructor argument and no type-specific
// metadata: DSL constructor name, resolved Grist `type`, describeType label,
// and the Python literal used for a blank formula of that type.
const SIMPLE_TYPES = [
  { dsl: "Text", label: "Texte", literal: "''" },
  { dsl: "Numeric", label: "Numérique", literal: "0.0" },
  { dsl: "Int", label: "Entier", literal: "0" },
  { dsl: "Bool", label: "Case à cocher", literal: "False" },
  { dsl: "Date", label: "Date", literal: "None" },
  { dsl: "Any", label: "Quelconque (Any)", literal: "None" },
  { dsl: "Attachments", label: "Pièces jointes", literal: "None" },
  // Real Grist type (see usertypes.py's _type_defaults), but not offered by
  // Grist's own column-type picker — kept here so a regression that
  // silently downgrades it back to Any is caught.
  { dsl: "Blob", label: "Binaire (Blob)", literal: "None" },
];

describe("simple (argument-less) column types", () => {
  for (const c of SIMPLE_TYPES) {
    test(`${c.dsl}: resolves, describes, round-trips its own constructor, has the right blank-formula default`, () => {
      const { type, widgetOptions, refTarget, warnings } = resolve(c.dsl, "");
      assert.equal(type, c.dsl);
      assert.equal(widgetOptions, null);
      assert.equal(refTarget, null);
      assert.deepEqual(warnings, []);
      assert.equal(describeType(type), c.label);
      assert.equal(buildTypeExpression(type), `grist.${c.dsl}()`);
      assert.equal(defaultLiteralForType(type), c.literal);
    });
  }
});

describe("Choice / ChoiceList", () => {
  for (const [dsl, label, literal] of [
    ["Choice", "Choix (liste déroulante)", "''"],
    ["ChoiceList", "Choix multiples (liste déroulante)", "None"],
  ]) {
    test(`${dsl}: bare constructor has no widgetOptions`, () => {
      const { type, widgetOptions, warnings } = resolve(dsl, "");
      assert.equal(type, dsl);
      assert.equal(widgetOptions, null);
      assert.deepEqual(warnings, []);
    });

    test(`${dsl}: choices= is captured as widgetOptions.choices`, () => {
      const { widgetOptions } = resolve(dsl, "choices=['A', 'B', 'C']");
      assert.deepEqual(widgetOptions, { choices: ["A", "B", "C"] });
    });

    test(`${dsl}: describeType / buildTypeExpression / defaultLiteralForType`, () => {
      assert.equal(describeType(dsl), label);
      assert.equal(buildTypeExpression(dsl), `grist.${dsl}()`);
      assert.equal(defaultLiteralForType(dsl), literal);
    });
  }
});

describe("DateTime (the one type with a required, defaulted positional argument)", () => {
  test("defaults to UTC with a warning when no timezone is given", () => {
    const { type, warnings } = resolve("DateTime", "");
    assert.equal(type, "DateTime:UTC");
    assert.equal(warnings.length, 1);
  });

  test("keeps an explicit timezone, no warning", () => {
    const { type, warnings } = resolve("DateTime", "'America/New_York'");
    assert.equal(type, "DateTime:America/New_York");
    assert.deepEqual(warnings, []);
  });

  test("describeType / buildTypeExpression / defaultLiteralForType", () => {
    assert.equal(describeType("DateTime:UTC"), "Date et heure (UTC)");
    assert.equal(buildTypeExpression("DateTime:UTC"), "grist.DateTime('UTC')");
    assert.equal(defaultLiteralForType("DateTime:UTC"), "None");
  });
});

describe("Reference / ReferenceList", () => {
  for (const [dsl, prefix, ctor, label, literal] of [
    ["Reference", "Ref", "Reference", "Référence vers « Foo »", "0"],
    ["ReferenceList", "RefList", "ReferenceList", "Références vers « Foo » (liste)", "None"],
  ]) {
    test(`${dsl}: valid target resolves to ${prefix}:<table>`, () => {
      const { type, refTarget, warnings } = resolve(dsl, "'Other_Table'");
      assert.equal(type, `${prefix}:Other_Table`);
      assert.equal(refTarget, "Other_Table");
      assert.deepEqual(warnings, []);
    });

    test(`${dsl}: missing or syntactically invalid target falls back to Any with a warning`, () => {
      for (const args of ["", "'Not A Valid Id'"]) {
        const { type, refTarget, warnings } = resolve(dsl, args);
        assert.equal(type, "Any");
        assert.equal(refTarget, null);
        assert.equal(warnings.length, 1);
      }
    });

    test(`${dsl}: describeType / buildTypeExpression / defaultLiteralForType`, () => {
      assert.equal(describeType(`${prefix}:Foo`), label);
      assert.equal(buildTypeExpression(`${prefix}:Foo`), `grist.${ctor}('Foo')`);
      assert.equal(defaultLiteralForType(`${prefix}:Foo`), literal);
    });
  }
});

test("an unrecognized DSL type falls back to Any with a warning (forward compatibility)", () => {
  const { type, warnings } = resolve("SomeFutureGristType", "");
  assert.equal(type, "Any");
  assert.equal(warnings.length, 1);
});

describe("full pipeline round trip: generateCode -> parseGristSchema -> resolveColumnType, every type in one table", () => {
  const schema = [
    {
      tableId: "AllTypes",
      columns: [
        { colId: "VisibleName", type: "Text", isFormula: false },
        { colId: "ColText", type: "Text", isFormula: false },
        { colId: "ColNumeric", type: "Numeric", isFormula: false },
        { colId: "ColInt", type: "Int", isFormula: false },
        { colId: "ColBool", type: "Bool", isFormula: false },
        { colId: "ColDate", type: "Date", isFormula: false },
        { colId: "ColDateTime", type: "DateTime:Europe/Paris", isFormula: false },
        {
          colId: "ColChoice",
          type: "Choice",
          isFormula: false,
          widgetOptions: { choices: ["Rouge", "Vert (ok)", "Bleu"] },
        },
        {
          colId: "ColChoiceList",
          type: "ChoiceList",
          isFormula: false,
          widgetOptions: { choices: ["Tag A", "Tag B"] },
        },
        {
          colId: "ColRef",
          type: "Ref:AllTypes",
          isFormula: false,
          visibleColId: "VisibleName",
        },
        { colId: "ColRefList", type: "RefList:AllTypes", isFormula: false },
        { colId: "ColAttachments", type: "Attachments", isFormula: false },
        { colId: "ColAny", type: "Any", isFormula: false },
        { colId: "ColBlob", type: "Blob", isFormula: false },
        { colId: "ColFormula", type: "Numeric", isFormula: true, formula: "$ColInt * 2" },
      ],
    },
  ];

  const text = generateCode(schema);
  const { tables, warnings: parseWarnings } = parseGristSchema(text);

  test("every column round-trips to the exact same source type", () => {
    assert.equal(tables.length, 1);
    assert.deepEqual(parseWarnings, []);

    const resolved = new Map();
    const resolutionWarnings = [];
    for (const col of tables[0].columns) {
      resolved.set(col.id, resolveColumnType(col.dslType, col.argsRaw, col.id, resolutionWarnings));
    }
    assert.deepEqual(resolutionWarnings, []);

    for (const original of schema[0].columns) {
      assert.equal(resolved.get(original.colId).type, original.type, `column ${original.colId}`);
    }
  });

  test("Choice/ChoiceList choices survive the round trip", () => {
    const resolved = new Map();
    for (const col of tables[0].columns) {
      resolved.set(col.id, resolveColumnType(col.dslType, col.argsRaw, col.id, []));
    }
    assert.deepEqual(resolved.get("ColChoice").widgetOptions, { choices: ["Rouge", "Vert (ok)", "Bleu"] });
    assert.deepEqual(resolved.get("ColChoiceList").widgetOptions, { choices: ["Tag A", "Tag B"] });
  });

  test("Reference's visible_col survives the round trip", () => {
    const resolved = new Map();
    for (const col of tables[0].columns) {
      resolved.set(col.id, resolveColumnType(col.dslType, col.argsRaw, col.id, []));
    }
    assert.equal(resolved.get("ColRef").visibleColId, "VisibleName");
    assert.equal(resolved.get("ColRef").refTarget, "AllTypes");
  });

  test("the formula column keeps its Numeric type and is not treated as a data column", () => {
    const formulaCol = tables[0].columns.find((c) => c.id === "ColFormula");
    assert.ok(formulaCol);
    assert.match(text, /@grist\.formulaType\(grist\.Numeric\(\)\)\n {2}def ColFormula\(rec, table\):\n {4}return \$ColInt \* 2\n/);
  });
});
