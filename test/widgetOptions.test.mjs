import { test } from "node:test";
import assert from "node:assert/strict";
import { optionKinds, sanitizeWidgetOptions, selectOptions } from "../js/widgetOptions.js";

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

test("sanitizeWidgetOptions keeps __proto__ out of its result", () => {
  const options = JSON.parse('{"__proto__": {"polluted": true}, "alignment": "left"}');
  const kept = sanitizeWidgetOptions(options);
  assert.deepEqual(kept, { alignment: "left" });
  assert.equal(Object.getPrototypeOf(kept), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test("sanitizeWidgetOptions does not mistake the names of the properties of every object for styles", () => {
  const options = JSON.parse('{"__defineGetter__": 3, "valueOf": 4, "wrap": "no", "choiceOptions": {"A": {"constructor": 1, "__defineGetter__": 2, "fillColor": "#112233"}}}');
  assert.deepEqual(sanitizeWidgetOptions(options), { __defineGetter__: 3, valueOf: 4, choiceOptions: { A: { fillColor: "#112233" } } });
});

test("optionKinds tells a choice list from the other options, as the Export would write them", () => {
  assert.deepEqual(optionKinds({ choices: ["a"] }), { choices: true, display: false });
  assert.deepEqual(optionKinds({ choiceOptions: { a: { fontBold: true } } }), { choices: true, display: false }, "the styles of choices go with the choices");
  assert.deepEqual(optionKinds({ alignment: "center", dropdownCondition: { text: "$A", parsed: "x" } }), { choices: false, display: true });
  assert.deepEqual(optionKinds({ choices: ["a"], wrap: true }), { choices: true, display: true });
});

test("optionKinds finds nothing in what the Export would not write", () => {
  const none = { choices: false, display: false };
  assert.deepEqual(optionKinds({ choices: [], rulesOptions: [{ fillColor: "#112233" }], textColor: "red", choiceOptions: { a: { fillColor: "red" } } }), none);
  for (const options of [null, undefined, {}, [], "text"]) assert.deepEqual(optionKinds(options), none, String(options));
});

test("selectOptions keeps the kinds asked, and nothing when none is left", () => {
  const options = { choices: ["a"], choiceOptions: { a: { fontBold: true } }, alignment: "center", rulesOptions: [] };
  assert.deepEqual(selectOptions(options, { choices: true, display: false }), { choices: ["a"], choiceOptions: { a: { fontBold: true } } });
  assert.deepEqual(selectOptions(options, { choices: false, display: true }), { alignment: "center", rulesOptions: [] });
  assert.deepEqual(selectOptions(options, { choices: true, display: true }), options);
  assert.equal(selectOptions(options, { choices: false, display: false }), null);
  assert.equal(selectOptions({ alignment: "center" }, { choices: true, display: false }), null);
  for (const empty of [null, undefined, {}, []]) assert.equal(selectOptions(empty, { choices: true, display: true }), null, String(empty));
});
