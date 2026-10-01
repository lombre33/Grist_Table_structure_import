import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const block = (pattern) => css.match(pattern)?.[1] ?? assert.fail(`no block for ${pattern}`);
const properties = (body) => body.replace(/\/\*.*?\*\//gs, "").split(";").map((declaration) => declaration.trim()).filter(Boolean).sort();

const light = properties(block(/\n:root \{([^}]*)\}/));
const darkBySystem = properties(block(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{([^}]*)\}/));
const darkByChoice = properties(block(/:root\[data-theme="dark"\] \{([^}]*)\}/));

test("the dark palette is the same whether the system or the user asks for it", () => {
  assert.deepEqual(darkBySystem, darkByChoice);
});

test("the dark palette only overrides properties the light one defines", () => {
  const names = (list) => list.map((declaration) => declaration.split(":")[0]);
  const defined = new Set(names(light));
  assert.deepEqual(names(darkByChoice).filter((name) => name !== "color-scheme" && !defined.has(name)), []);
});

test("every custom property the styles use is defined", () => {
  const defined = new Set(light.map((declaration) => declaration.split(":")[0]));
  const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]));
  assert.deepEqual([...used].filter((name) => !defined.has(name)), []);
});

test("every custom property is used somewhere", () => {
  const defined = light.map((declaration) => declaration.split(":")[0]).filter((name) => name !== "color-scheme");
  const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]));
  assert.deepEqual(defined.filter((name) => !used.has(name)), []);
});
