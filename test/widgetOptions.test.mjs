import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeWidgetOptions } from "../js/widgetOptions.js";

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
