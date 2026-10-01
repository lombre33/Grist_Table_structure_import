/** What the README says about the repository is what is in it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { read } from "./helpers.mjs";

const readme = read("README.md");

test("the README's file map lists every module of js/, and only those", () => {
  const listed = [...readme.matchAll(/^(js\/[\w.-]+\.js)\s/gm)].map((match) => match[1]);
  const actual = readdirSync(new URL("../js/", import.meta.url)).map((name) => `js/${name}`);
  assert.deepEqual(listed.sort(), actual.sort());
});

test("every npm script the README tells to run exists", () => {
  const scripts = Object.keys(JSON.parse(read("package.json")).scripts);
  const mentioned = [...readme.matchAll(/\bnpm (?:run ([\w:]+)|(test)\b)/g)].map((match) => match[1] ?? match[2]);
  assert.ok(mentioned.length >= 3, "the commands were read");
  assert.deepEqual(mentioned.filter((name) => !scripts.includes(name)), []);
});
