/** What the page asks for is what the Pages workflow publishes: a file left out would only show in production. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { read } from "./helpers.mjs";

const workflow = read(".github/workflows/pages.yml");
const published = [...workflow.matchAll(/^\s*cp\s+(.+?)\s+_site\/\S*\s*$/gm)].flatMap(([, sources]) => sources.split(/\s+/));
const fetched = [...workflow.matchAll(/--output\s+_site\/(\S+)/g)].map((match) => match[1]); // what the publication downloads instead of copying
const isPublished = (path) =>
  fetched.includes(path) || published.some((source) => source === path || (source.includes("*") && new RegExp(`^${source.replaceAll(".", "\\.").replace("*", "[^/]*")}$`).test(path)));

/** The page as it is published: the workflow rewrites one tag of index.html (a sed), the one that asks for Grist's API. */
function publishedPage() {
  const [, from, to] = workflow.match(/sed -i 's\|(.+?)\|(.+?)\|' _site\/index\.html/);
  const page = read("index.html");
  assert.ok(page.includes(from), "the tag the workflow rewrites is in the page");
  return page.replace(from, to);
}

test("every file the page, its styles and its modules ask for is published", () => {
  const html = publishedPage();
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
