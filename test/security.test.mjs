/** What the widget must never contain: it only edits the document it is opened in. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { read } from "./helpers.mjs";

const sources = readdirSync(new URL("../js/", import.meta.url))
  .filter((name) => name.endsWith(".js"))
  .map((name) => [`js/${name}`, read(`js/${name}`)]);

const FORBIDDEN = [
  [/\b(?:onRecords?|onNewRecord|fetchSelected(?:Table|Record)|getTable)\b/, "reading the rows of a table"],
  [/\[\s*["'](?:Remove|Delete|Rename|Bulk|Clear|AddRecord|SetTable)\w*["']\s*,/, "an action that removes, renames or rewrites what exists"],
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\s*\(|(?<![.\w])Function\s*\(/, "the Function constructor"],
  [/\.(?:inner|outer)HTML\b|[{,]\s*["']?(?:inner|outer)HTML["']?\s*:/, "innerHTML / outerHTML, assigned or given as the key of a property"],
  [/\binsertAdjacentHTML\b|\bdocument\.write(?:ln)?\s*\(/, "markup injection"],
  [/\bset(?:Timeout|Interval)\s*\(\s*["'`]/, "a timer given a string"],
  [/\bimport\(/, "dynamic import()"],
  [/\b(?:fetch|sendBeacon)\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource)\b/, "network access"],
  [/\bwindow\.open\b|\blocation\s*=/, "navigation"],
];

for (const [pattern, what] of FORBIDDEN) {
  test(`no ${what} in js/`, () => {
    const found = sources.filter(([, text]) => pattern.test(text)).map(([path]) => path);
    assert.deepEqual(found, []);
  });
}

test("index.html loads no script but the Grist plugin API, from the origin of the page, and the widget's own", () => {
  const scripts = [...read("index.html").matchAll(/<script[^>]*\ssrc="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts.sort(), ["/grist-plugin-api.js", "js/app.js", "js/theme-init.js"]);
});

test("index.html declares a CSP that blocks every other origin and any network call", () => {
  const csp = read("index.html").match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)?.[1] ?? "";
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.equal(csp.match(/script-src ([^;]*)/)[1], "'self' 'unsafe-eval'", "the scripts of the page and the evaluation that Grist's API needs, from no other origin");
  assert.doesNotMatch(csp, /https?:|\/\//, "the policy names no origin but its own");
});

test("every action of the workflows is pinned by the commit of a version, which a tag could not guarantee", () => {
  const workflows = readdirSync(new URL("../.github/workflows/", import.meta.url));
  assert.ok(workflows.length > 0);
  for (const name of workflows) {
    for (const [, action] of read(`.github/workflows/${name}`).matchAll(/\buses:\s+(\S+)/g)) {
      if (!action.startsWith("./")) assert.match(action, /@[0-9a-f]{40}$/, `${name}: ${action}`);
    }
  }
});

test("every container image of the workflows is pinned by digest, as a tag can be moved", () => {
  const images = readdirSync(new URL("../.github/workflows/", import.meta.url)).flatMap((name) =>
    [...read(`.github/workflows/${name}`).matchAll(/^\s*(?:-\s+)?image:\s+(.+?)\s*$/gm)].map((match) => [name, match[1]])
  );
  assert.ok(images.length > 0, "the images were read");
  for (const [name, image] of images) assert.match(image, /@sha256:[0-9a-f]{64}$|^\$\{\{ matrix\./, `${name}: ${image}`);
});

const readme = read("README.md");
const ACTIONS = ["AddTable", "AddVisibleColumn", "ModifyColumn", "SetDisplayFormula", "UpdateRecord"];
const METADATA_TABLES = ["_grist_Tables", "_grist_Tables_column", "_grist_Views_section"];

test("the only actions the widget sends to Grist are the ones the README lists, and only the importer sends them", () => {
  const verbs = /\["((?:Add|Modify|Set|Update|Remove|Rename|Delete|Bulk|Clear)[A-Za-z]*)",/g;
  const sent = new Set(sources.flatMap(([, text]) => [...text.matchAll(verbs)].map((match) => match[1])));
  assert.deepEqual([...sent].sort(), [...ACTIONS].sort());
  for (const action of ACTIONS) assert.ok(readme.includes(`\`${action}\``), `README: ${action}`);
  assert.deepEqual(sources.filter(([, text]) => text.includes("applyUserActions")).map(([path]) => path), ["js/importer.js"]);
});

test("the only calls to Grist besides those actions read the list of the tables and their structure, which the README says", () => {
  const calls = new Set(sources.flatMap(([, text]) => [...text.matchAll(/\bdocApi\.(\w+)/g)].map((match) => match[1])));
  assert.deepEqual([...calls].sort(), ["applyUserActions", "fetchTable", "listTables"]);
  assert.match(read("js/schema.js"), /\["_grist_Tables", "_grist_Tables_column", "_grist_Views_section"\]\.map\(\(name\) => grist\.docApi\.fetchTable\(name\)\)/);
  for (const name of [...METADATA_TABLES, "listTables"]) assert.ok(readme.includes(`\`${name}\``), `README: ${name}`);
  assert.match(readme, /requiredAccess: "full"/);
  assert.match(read("js/app.js"), /requiredAccess: "full"/);
});

test("the only things written in the browser are the two display preferences, and only the storage module and the head script touch the storage", () => {
  const touching = sources.filter(([, text]) => /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(text)).map(([path]) => path);
  assert.deepEqual(touching.sort(), ["js/storage.js", "js/theme-init.js"]);
  const keys = new Set(sources.flatMap(([, text]) => [...text.matchAll(/["'`](gristFactory\.[\w.]+)["'`]/g)].map((match) => match[1])));
  assert.deepEqual([...keys].sort(), ["gristFactory.locale", "gristFactory.theme"]);
  for (const key of keys) assert.ok(readme.includes(`\`${key}\``), `README: ${key}`);
});

test("the README says where Grist's API comes from, in the repository and once published, and the publication does what it says", () => {
  const tag = read("index.html").match(/<script src="\/grist-plugin-api\.js">/)[0];
  assert.ok(readme.includes(tag), "the form an instance serves");
  const workflow = read(".github/workflows/pages.yml");
  const [, from, to] = workflow.match(/sed -i 's\|(.+?)\|(.+?)\|' _site\/index\.html/);
  assert.equal(from, tag, "the publication rewrites the tag of the page");
  assert.ok(readme.includes(to), "to the one the README says the published page has");
  const origin = "https://docs.getgrist.com/grist-plugin-api.js";
  assert.ok(workflow.includes(`_site/grist-plugin-api.js ${origin}`) && readme.includes(origin), "the file is fetched from the address the README names, and published beside the page");
  assert.match(readme, /`script-src 'self'`/);
});
