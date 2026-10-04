/** The one function that builds the page's elements takes text and plain properties, never markup. */
import { test } from "node:test";
import assert from "node:assert/strict";

/** Enough of an element for `buildElement`: the properties it sets, and the attributes it falls back on. */
const fakeElement = () => ({ className: "", textContent: "", hidden: false, attributes: {}, children: [], setAttribute(key, value) { this.attributes[key] = value; }, append(...nodes) { this.children.push(...nodes); } });

/** `buildElement`, with a `document` that makes the fake elements above, for the length of the test. */
async function buildElementIn(t) {
  globalThis.document = { createElement: fakeElement };
  t.after(() => delete globalThis.document);
  return (await import("../js/dom.js")).buildElement;
}

test("buildElement sets the class, the text, the properties the element has and the attributes it has not", async (t) => {
  const buildElement = await buildElementIn(t);
  const child = fakeElement();
  const node = buildElement("p", { class: "note", text: "<b>not markup</b>", hidden: true, "aria-live": "polite" }, [child]);
  assert.deepEqual([node.className, node.textContent, node.hidden, node.attributes, node.children], ["note", "<b>not markup</b>", true, { "aria-live": "polite" }, [child]]);
});

test("buildElement refuses the keys that would write markup or code, whatever their case", async (t) => {
  const buildElement = await buildElementIn(t);
  for (const key of ["innerHTML", "outerHTML", "srcdoc", "onclick", "onerror", "onLoad", "INNERHTML"]) {
    assert.throws(() => buildElement("p", { [key]: "<img src=x onerror=alert(1)>" }), /would write markup or code/, key);
  }
  for (const key of ["text", "title", "value", "type", "role"]) assert.doesNotThrow(() => buildElement("p", { [key]: "x" }), key);
});
