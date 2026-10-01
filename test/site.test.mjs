/** What the page asks for is what the Pages workflow publishes: a file left out would only show in production. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { read } from "./helpers.mjs";

const published = [...read(".github/workflows/pages.yml").matchAll(/^\s*cp\s+(.+?)\s+_site\/\S*\s*$/gm)].flatMap(([, sources]) => sources.split(/\s+/));
const isPublished = (path) =>
  published.some((source) => source === path || (source.includes("*") && new RegExp(`^${source.replaceAll(".", "\\.").replace("*", "[^/]*")}$`).test(path)));

test("every file the page, its styles and its modules ask for is published", () => {
  const html = read("index.html");
  const wanted = [
    ...[...html.matchAll(/\b(?:src|href)="([^":#?]+)"/g)].map((match) => match[1]),
    ...[...read("style.css").matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]),
    ...readdirSync(new URL("../js/", import.meta.url)).map((name) => `js/${name}`),
  ];
  assert.ok(wanted.length > 10, "the page was read");
  assert.deepEqual(wanted.filter((path) => !isPublished(path)), []);
});

test("every file the workflow copies exists", () => {
  assert.deepEqual(published.filter((path) => !path.includes("*") && !existsSync(new URL(`../${path}`, import.meta.url))), []);
});
