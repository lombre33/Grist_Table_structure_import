import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { STRINGS, tn, typeLabel } from "../js/i18n.js";

test("typeLabel gives a readable name, with the target or time zone when there is one", () => {
  assert.equal(typeLabel("Text"), "Texte");
  assert.equal(typeLabel("Ref:Foo"), "Référence vers « Foo »");
  assert.equal(typeLabel("RefList:Foo"), "Références vers « Foo » (liste)");
  assert.equal(typeLabel("DateTime:UTC"), "Date et heure (UTC)");
});

test("tn follows the plural rules of the language: in French zero is singular", () => {
  assert.equal(tn("common.columnsCount", 0), "0 colonne");
  assert.equal(tn("common.columnsCount", 1), "1 colonne");
  assert.equal(tn("common.columnsCount", 2), "2 colonnes");
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const [, i18nCode] = read("js/i18n.js").split("const LOCALE_KEY");
const code = [...readdirSync(new URL("../js/", import.meta.url)).filter((name) => name !== "i18n.js").map((name) => read(`js/${name}`)), i18nCode, read("index.html")].join("\n");
const shape = (value) => (typeof value === "string" ? "text" : Object.keys(value).sort().join("/"));
const placeholders = (value) => [...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");

test("French and English define the same keys, with the same plural forms and placeholders", () => {
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.fr).sort());
  for (const [key, fr] of Object.entries(STRINGS.fr)) {
    assert.equal(shape(STRINGS.en[key]), shape(fr), `${key}: form`);
    assert.equal(placeholders(STRINGS.en[key]), placeholders(fr), `${key}: placeholders`);
  }
});

test("a plural entry has a singular and a plural form", () => {
  for (const [key, entry] of Object.entries(STRINGS.fr)) if (typeof entry !== "string") assert.equal(shape(entry), "one/other", key);
});

test("every key the code or the markup uses exists, and every key is used", () => {
  const namespaces = new Set(Object.keys(STRINGS.fr).map((key) => key.split(".")[0]));
  const used = new Set([...code.matchAll(/["'`]([a-z]+(?:\.[A-Za-z0-9]+)+)["'`]/g)].map((match) => match[1]).filter((key) => namespaces.has(key.split(".")[0])));
  for (const key of used) assert.ok(key in STRINGS.fr, `unknown key ${key}`);
  for (const key of Object.keys(STRINGS.fr)) assert.ok(used.has(key) || key.startsWith("type."), `unused key ${key}`);
});
