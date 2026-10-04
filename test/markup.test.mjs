/** What the markup says before a script has run: a reader that does not run the code, and the checks that read only the HTML, still find a name on every control. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { read } from "./helpers.mjs";

const html = read("index.html").replace(/<!--[\s\S]*?-->/g, "");
const withoutTags = (markup) => markup.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

test("every button has a name in the markup: a text, an aria-label or a title, even the one whose text the code replaces", () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attributes, content]) => ({ attributes, content }));
  assert.ok(buttons.length >= 10, "the buttons were read");
  const unnamed = buttons.filter(({ attributes, content }) => !withoutTags(content) && !/\b(?:aria-label|aria-labelledby|title)="[^"]+"/.test(attributes)).map(({ attributes }) => attributes.trim());
  assert.deepEqual(unnamed, []);
});
