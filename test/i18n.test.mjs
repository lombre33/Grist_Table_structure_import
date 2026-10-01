import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { STRINGS, tn, typeLabel } from "../js/i18n.js";

test("typeLabel gives a readable name, with the target or time zone when there is one", () => {
  const plain = (type) => typeLabel(type).replaceAll("\u00a0", " ");
  assert.equal(plain("Text"), "Texte");
  assert.equal(plain("Ref:Foo"), "Référence vers « Foo »");
  assert.equal(plain("RefList:Foo"), "Références vers « Foo » (liste)");
  assert.equal(plain("DateTime:UTC"), "Date et heure (UTC)");
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

const values = (entry) => (typeof entry === "string" ? [entry] : Object.values(entry));

test("French text keeps its punctuation attached by no-break spaces, and both languages use typographic apostrophes", () => {
  for (const [key, entry] of Object.entries(STRINGS.fr)) {
    for (const text of values(entry)) assert.doesNotMatch(text, / [:;?!»]|« /, `fr ${key}: a no-break space goes there`);
  }
  for (const locale of ["fr", "en"]) {
    for (const [key, entry] of Object.entries(STRINGS[locale])) {
      for (const text of values(entry)) assert.doesNotMatch(text, /\w'\w/, `${locale} ${key}: ’ rather than '`);
    }
  }
});

const decode = (html) => html.replaceAll("&nbsp;", "\u00a0").replaceAll("&laquo;", "«").replaceAll("&raquo;", "»").replaceAll("&#10;", "\n").replaceAll("&amp;", "&");
const tidy = (text) => text.replace(/\s+/g, " ").trim();

test("the French written in the markup is the dictionary's, so nothing changes when the script takes over", () => {
  const html = read("index.html");
  let checked = 0;
  for (const [, key, text] of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
    assert.equal(tidy(decode(text)), tidy(STRINGS.fr[key]), key);
    checked++;
  }
  for (const [tag, kind, key] of html.matchAll(/<[^>]*data-i18n-(aria-label|placeholder)="([^"]+)"[^>]*>/g).map((match) => [match[0], match[1], match[2]])) {
    assert.equal(tidy(decode(tag.match(new RegExp(`(?<=\\s)${kind}="([^"]*)"`))[1])), tidy(STRINGS.fr[key]), key);
    checked++;
  }
  assert.ok(checked > 40, "the markup was read");
});
