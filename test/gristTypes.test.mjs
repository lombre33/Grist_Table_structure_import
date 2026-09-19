import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveColumnType,
  describeType,
  TABLE_ID_RE,
  buildTypeExpression,
  defaultLiteralForType,
  sanitizeWidgetOptions,
} from "../js/gristTypes.js";

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

test("buildTypeExpression mirrors gencode.py's get_grist_type", () => {
  assert.equal(buildTypeExpression("Text"), "grist.Text()");
  assert.equal(buildTypeExpression("Any"), "grist.Any()");
  assert.equal(buildTypeExpression("Choice"), "grist.Choice()");
  assert.equal(buildTypeExpression("DateTime:UTC"), "grist.DateTime('UTC')");
  assert.equal(buildTypeExpression("Ref:Other_Table"), "grist.Reference('Other_Table')");
  assert.equal(buildTypeExpression("RefList:Other_Table"), "grist.ReferenceList('Other_Table')");
  assert.equal(buildTypeExpression("Attachments"), "grist.Attachments()");
});

test("buildTypeExpression escapes a single quote in its argument", () => {
  assert.equal(buildTypeExpression("Ref:It's_A_Table"), "grist.Reference('It\\'s_A_Table')");
});

test("defaultLiteralForType matches Grist's _type_defaults", () => {
  assert.equal(defaultLiteralForType("Text"), "''");
  assert.equal(defaultLiteralForType("Choice"), "''");
  assert.equal(defaultLiteralForType("Date"), "None");
  assert.equal(defaultLiteralForType("ChoiceList"), "None");
  assert.equal(defaultLiteralForType("Bool"), "False");
  assert.equal(defaultLiteralForType("Numeric"), "0.0");
  assert.equal(defaultLiteralForType("Int"), "0");
  assert.equal(defaultLiteralForType("Ref:Foo"), "0");
  assert.equal(defaultLiteralForType("RefList:Foo"), "None");
  assert.equal(defaultLiteralForType("Any"), "None");
  assert.equal(defaultLiteralForType("SomethingUnknown"), "None");
});

test("choices= extracts a list containing literal parentheses", () => {
  const { widgetOptions } = resolve("Choice", "choices=['Oui (confirmé)', 'Non']");
  assert.deepEqual(widgetOptions, { choices: ["Oui (confirmé)", "Non"] });
});

test("choices= unescapes escaped quotes inside a choice value", () => {
  const { widgetOptions } = resolve("Choice", "choices=['it\\'s ok', 'B']");
  assert.deepEqual(widgetOptions, { choices: ["it's ok", "B"] });
});

test("label= is captured only when present", () => {
  const withLabel = resolve("Text", "label='Full name'");
  assert.equal(withLabel.label, "Full name");
  const without = resolve("Text", "");
  assert.equal(without.label, null);
});

test("description= is captured, with escaped quotes and parentheses", () => {
  const { description } = resolve("Text", "description='A note (important) with a \\'quote\\''");
  assert.equal(description, "A note (important) with a 'quote'");
});

test("visible_col= is captured as a plain column id string", () => {
  const { visibleColId } = resolve("Reference", "'Other_Table', visible_col='DisplayName'");
  assert.equal(visibleColId, "DisplayName");
});

test("extended kwargs also accept double-quoted values, not just single-quoted", () => {
  const result = resolve("Text", 'label="Full name", description="A note"');
  assert.equal(result.label, "Full name");
  assert.equal(result.description, "A note");
});

test("double-quoted kwarg values support escaped quotes the same way as single-quoted ones", () => {
  const { label } = resolve("Text", 'label="Say \\"hi\\""');
  assert.equal(label, 'Say "hi"');
});

test("widget_options= is JSON-parsed (never evaluated) and merged into widgetOptions", () => {
  const { widgetOptions } = resolve("Numeric", "widget_options='{\"numMode\":\"currency\",\"currency\":\"EUR\"}'");
  assert.deepEqual(widgetOptions, { numMode: "currency", currency: "EUR" });
});

test("widget_options= merged with choices=, choices always wins over a conflicting key", () => {
  const { widgetOptions } = resolve(
    "Choice",
    "choices=['A', 'B'], widget_options='{\"alignment\":\"center\",\"choices\":[\"ignored\"]}'"
  );
  assert.deepEqual(widgetOptions, { choices: ["A", "B"], alignment: "center" });
});

test("a malformed widget_options= JSON payload is ignored (with a warning), not evaluated or thrown", () => {
  const { widgetOptions, warnings } = resolve("Text", "widget_options='{not valid json'");
  assert.equal(widgetOptions, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /widget_options/);
});

test("all extended kwargs together on a Reference column", () => {
  const result = resolve(
    "Reference",
    "'Other_Table', label='Propriétaire', description='Qui possède cet enregistrement', " +
      "visible_col='Name', widget_options='{\"alignment\":\"left\"}'"
  );
  assert.equal(result.type, "Ref:Other_Table");
  assert.equal(result.label, "Propriétaire");
  assert.equal(result.description, "Qui possède cet enregistrement");
  assert.equal(result.visibleColId, "Name");
  assert.deepEqual(result.widgetOptions, { alignment: "left" });
});

test("sanitizeWidgetOptions drops rulesOptions entirely", () => {
  const out = sanitizeWidgetOptions({ alignment: "left", rulesOptions: [{ fillColor: "#FF0000" }] });
  assert.deepEqual(out, { alignment: "left" });
});

test("sanitizeWidgetOptions narrows dropdownCondition to its text only", () => {
  const out = sanitizeWidgetOptions({ dropdownCondition: { text: "$Active", parsed: "[SOME, AST]" } });
  assert.deepEqual(out, { dropdownCondition: { text: "$Active" } });
});

test("sanitizeWidgetOptions drops a dropdownCondition with no text", () => {
  const out = sanitizeWidgetOptions({ dropdownCondition: { parsed: "x" }, alignment: "left" });
  assert.deepEqual(out, { alignment: "left" });
});

test("sanitizeWidgetOptions validates root color keys (valid hex kept, invalid dropped)", () => {
  const out = sanitizeWidgetOptions({ textColor: "#112233", fillColor: "not-a-color" });
  assert.deepEqual(out, { textColor: "#112233" });
});

test("sanitizeWidgetOptions validates root boolean keys (non-boolean dropped)", () => {
  const out = sanitizeWidgetOptions({ fontBold: true, wrap: "yes" });
  assert.deepEqual(out, { fontBold: true });
});

test("sanitizeWidgetOptions keeps only the known choiceOptions style keys, valid colors only", () => {
  const out = sanitizeWidgetOptions({
    choiceOptions: {
      A: { fillColor: "#FF0000", textColor: "bogus", fontBold: true, someUnknownKey: 1 },
      B: { fontItalic: "not-a-bool" },
    },
  });
  assert.deepEqual(out, { choiceOptions: { A: { fillColor: "#FF0000", fontBold: true } } });
});

test("sanitizeWidgetOptions passes unknown generic keys through untouched", () => {
  const out = sanitizeWidgetOptions({ numMode: "currency", question: "How many?", widget: "TextBox" });
  assert.deepEqual(out, { numMode: "currency", question: "How many?", widget: "TextBox" });
});

test("sanitizeWidgetOptions always excludes choices (represented separately)", () => {
  const out = sanitizeWidgetOptions({ choices: ["A", "B"], alignment: "left" });
  assert.deepEqual(out, { alignment: "left" });
});

test("sanitizeWidgetOptions returns null for nothing left / non-object input", () => {
  assert.equal(sanitizeWidgetOptions(null), null);
  assert.equal(sanitizeWidgetOptions({ rulesOptions: [] }), null);
});

test("buildTypeExpression appends extra kwargs in insertion order after the positional argument", () => {
  assert.equal(
    buildTypeExpression("Ref:Other", { visible_col: "'Name'", label: "'Owner'" }),
    "grist.Reference('Other', visible_col='Name', label='Owner')"
  );
  assert.equal(buildTypeExpression("Text", { label: "'Full name'" }), "grist.Text(label='Full name')");
  assert.equal(buildTypeExpression("Text"), "grist.Text()");
});

test("TABLE_ID_RE matches valid Grist/Python identifiers only", () => {
  assert.ok(TABLE_ID_RE.test("Ma_Table1"));
  assert.ok(TABLE_ID_RE.test("_private"));
  assert.ok(!TABLE_ID_RE.test("1Table"));
  assert.ok(!TABLE_ID_RE.test("Ma Table"));
  assert.ok(!TABLE_ID_RE.test("Ma-Table"));
});
