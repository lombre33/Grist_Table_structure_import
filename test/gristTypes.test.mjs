import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveColumnType, buildTypeExpression, defaultLiteralForType, splitType } from "../js/gristTypes.js";
import { typeLabel } from "../js/i18n.js";
import { quotePython } from "../js/pyText.js";
import { plain } from "./helpers.mjs";

function resolve(dslType, argsRaw = "") {
  const warnings = [];
  return { ...resolveColumnType(dslType, argsRaw, "Col", warnings), warnings };
}

// type, its constructor in Code View, its label, the Python value of a blank formula (usertypes.py `_type_defaults`)
const TYPES = [
  ["Text", "grist.Text()", "Texte", "''"],
  ["Numeric", "grist.Numeric()", "Numérique", "0.0"],
  ["Int", "grist.Int()", "Entier", "0"],
  ["Bool", "grist.Bool()", "Case à cocher", "False"],
  ["Date", "grist.Date()", "Date", "None"],
  ["DateTime:UTC", "grist.DateTime('UTC')", "Date et heure (UTC)", "None"],
  ["Choice", "grist.Choice()", "Choix (liste déroulante)", "''"],
  ["ChoiceList", "grist.ChoiceList()", "Choix multiples (liste déroulante)", "None"],
  ["Ref:Foo", "grist.Reference('Foo')", "Référence vers « Foo »", "0"],
  ["RefList:Foo", "grist.ReferenceList('Foo')", "Références vers « Foo » (liste)", "None"],
  ["Attachments", "grist.Attachments()", "Pièces jointes", "None"],
  ["Blob", "grist.Blob()", "Binaire (Blob)", "None"],
  ["Any", "grist.Any()", "Quelconque (Any)", "None"],
];

for (const [type, expression, label, blank] of TYPES) {
  test(`${type}: constructor, type, label and blank value agree`, () => {
    const [, dsl, args] = expression.match(/^grist\.(\w+)\((.*)\)$/);
    const resolved = resolve(dsl, args);
    assert.equal(resolved.type, type);
    assert.deepEqual(resolved.warnings, []);
    assert.equal(buildTypeExpression(type), expression);
    assert.equal(plain(typeLabel(type)), label);
    assert.equal(defaultLiteralForType(type), blank);
  });
}

test("splitType separates the name from its argument", () => {
  assert.deepEqual(splitType("Ref:Foo"), { name: "Ref", arg: "Foo" });
  assert.deepEqual(splitType("Text"), { name: "Text", arg: "" });
});

test("a type Grist has but this widget does not know gets the blank value None", () => {
  assert.equal(defaultLiteralForType("SomethingUnknown"), "None");
});

test("an unrecognized constructor becomes Any, with a warning", () => {
  const { type, warnings } = resolve("SomethingMadeUp");
  assert.equal(type, "Any");
  assert.deepEqual(warnings, [{ key: "warn.unknownType", params: { colId: "Col", dslType: "SomethingMadeUp" } }]);
});

test("DateTime without a time zone is UTC, with a warning", () => {
  const { type, warnings } = resolve("DateTime");
  assert.equal(type, "DateTime:UTC");
  assert.equal(warnings.length, 1);
  assert.equal(resolve("DateTime", "'Europe/Paris'").type, "DateTime:Europe/Paris");
});

test("only the name of a time zone goes into the type of a DateTime column: any other text is replaced by UTC, with a warning that quotes its beginning", () => {
  for (const zone of ["UTC", "Europe/Paris", "America/Argentina/Buenos_Aires", "Etc/GMT+5", "America/Port-au-Prince", "GMT-0", "US/Pacific"]) {
    const { type, warnings } = resolve("DateTime", `'${zone}'`);
    assert.deepEqual([type, warnings], [`DateTime:${zone}`, []], zone);
  }
  const notZones = ["Europe Paris", "UTC ", " UTC", "", "UTC'", "a\\b", "UTC\n", "x(1)", "UTC;", "a#b", "1UTC", "Europe//Paris", "/UTC", "UTC/", "é/é", "a".repeat(41), "A/B/C/D/E"];
  for (const zone of notZones.filter(Boolean)) {
    const { type, warnings } = resolve("DateTime", quotePython(zone));
    assert.equal(type, "DateTime:UTC", JSON.stringify(zone));
    assert.deepEqual(warnings.map((warning) => warning.key), ["warn.dateTimeBadTimezone"], JSON.stringify(zone));
    assert.ok(warnings[0].params.given.length <= 41, "what a warning quotes is short: forty characters and an ellipsis");
  }
  assert.equal(resolve("DateTime", `'${"a".repeat(41)}'`).warnings[0].params.given, `${"a".repeat(40)}…`);
});

test("an option that is written but cannot be read is said to be ignored, and one that is not written is not", () => {
  const all = resolve("Choice", "label='A', description='B', choices=['x'], widget_options='{\"alignment\":\"center\"}'");
  assert.deepEqual([all.warnings, all.label, all.description, all.widgetOptions], [[], "A", "B", { alignment: "center", choices: ["x"] }]);
  assert.deepEqual(resolve("Reference", "'People', visible_col='Name', reverse_of='Pets'").warnings, []);
  for (const [dslType, args, option] of [
    ["Text", "label=\u201cNom\u201d", "label"],
    ["Text", "label=u'Nom'", "label"],
    ["Text", "description=name", "description"],
    ["Reference", "'People', visible_col=NAME", "visible_col"],
    ["Reference", "'People', reverse_of=f'x'", "reverse_of"],
    ["Choice", "choices=OPTIONS", "choices"],
    ["Choice", "choices=['a', B]", "choices"],
    ["Choice", "choices=(\u2018a\u2019, \u2018b\u2019)", "choices"],
    ["Text", "widget_options={'alignment': 'center'}", "widget_options"],
  ]) {
    const { warnings } = resolve(dslType, args);
    assert.deepEqual(warnings.map((warning) => [warning.key, warning.params.option]), [["warn.unreadableOption", option]], args);
  }
  assert.deepEqual(resolve("Choice", "choices=['a', B]").widgetOptions, { choices: ["a"] }, "what can be read of a list is kept");
  for (const args of ["choices=[]", "choices=[ ]", "label=''"]) assert.deepEqual(resolve("Choice", args).warnings, [], args);
  assert.equal(resolve("Text", `label=${"x".repeat(200)}`).warnings[0].params.given.length, 41, "what a warning quotes is short");
});

test("a reference must name a table that is a plain identifier, otherwise the column becomes Any", () => {
  for (const target of ["'1bad'", "'two words'", "''", ""]) {
    const { type, refTarget, warnings } = resolve("Reference", target);
    assert.deepEqual([type, refTarget, warnings.length], ["Any", null, 1], target);
  }
  assert.deepEqual([resolve("Reference", "'_private'").type, resolve("Reference", "'Foo'").refTarget], ["Ref:_private", "Foo"]);
});

test("choices are read as text: parentheses, escaped quotes and either quote style", () => {
  assert.equal(resolve("Choice").widgetOptions, null);
  assert.deepEqual(resolve("Choice", "choices=['Oui (confirmé)', 'it\\'s ok', \"Peut-être\"]").widgetOptions, { choices: ["Oui (confirmé)", "it's ok", "Peut-être"] });
  assert.deepEqual(resolve("ChoiceList", "choices=['A', 'B']").widgetOptions, { choices: ["A", "B"] });
  assert.equal(resolve("Text", "choices=['A']").widgetOptions, null, "only choice types have choices");
});

test("label, description, visible_col and reverse_of are read, with either quote style and escapes", () => {
  assert.equal(resolve("Text").label, null);
  const text = resolve("Text", 'label="Say \\"hi\\"", description=\'A note (important) with a \\\'quote\\\'\'');
  assert.deepEqual([text.label, text.description], ['Say "hi"', "A note (important) with a 'quote'"]);
  const ref = resolve("Reference", "'Other_Table', visible_col='DisplayName', reverse_of='Pets'");
  assert.deepEqual([ref.visibleColId, ref.reverseColId], ["DisplayName", "Pets"]);
});

test("a name quoted inside another value, or merely ending in it, is not that argument", () => {
  const { label, description } = resolve("Text", "description='see label=\"x\"', xlabel='y'");
  assert.deepEqual([label, description], [null, 'see label="x"']);
});

test("widget_options is parsed as JSON (never evaluated), and choices win over a conflicting key", () => {
  assert.deepEqual(resolve("Numeric", "widget_options='{\"numMode\":\"currency\",\"currency\":\"EUR\"}'").widgetOptions, { numMode: "currency", currency: "EUR" });
  const { widgetOptions } = resolve("Choice", "choices=['A', 'B'], widget_options='{\"alignment\":\"center\",\"choices\":[\"ignored\"]}'");
  assert.deepEqual(widgetOptions, { choices: ["A", "B"], alignment: "center" });
});

test("malformed widget_options are ignored, with a warning", () => {
  const { widgetOptions, warnings } = resolve("Text", "widget_options='{not valid json'");
  assert.equal(widgetOptions, null);
  assert.deepEqual(warnings.map((warning) => warning.key), ["warn.invalidWidgetOptions"]);
});

test("everything together on a reference column", () => {
  const result = resolve("Reference", "'Other_Table', label='Propriétaire', description='Qui possède', visible_col='Name', widget_options='{\"alignment\":\"left\"}'");
  assert.deepEqual(
    [result.type, result.label, result.description, result.visibleColId, result.widgetOptions],
    ["Ref:Other_Table", "Propriétaire", "Qui possède", "Name", { alignment: "left" }]
  );
});

test("buildTypeExpression escapes a quote in its argument and appends further arguments in order", () => {
  assert.equal(buildTypeExpression("Ref:It's_A_Table"), "grist.Reference('It\\'s_A_Table')");
  assert.equal(buildTypeExpression("Ref:Other", { visible_col: "'Name'", label: "'Owner'" }), "grist.Reference('Other', visible_col='Name', label='Owner')");
  assert.equal(buildTypeExpression("Text", { label: "'Full name'" }), "grist.Text(label='Full name')");
});

test("a constructor named like a property of every object is an unknown type, not a crash", () => {
  for (const dsl of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    const warnings = [];
    assert.equal(resolveColumnType(dsl, "", "Col", warnings).type, "Any", dsl);
    assert.deepEqual(warnings.map((warning) => warning.key), ["warn.unknownType"], dsl);
  }
});
