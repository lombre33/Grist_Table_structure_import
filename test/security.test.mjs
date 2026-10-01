/** What the widget must never contain: it only edits the document it is opened in. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sources = readdirSync(new URL("../js/", import.meta.url))
  .filter((name) => name.endsWith(".js"))
  .map((name) => [`js/${name}`, read(`js/${name}`)]);

const FORBIDDEN = [
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\s*\(|(?<![.\w])Function\s*\(/, "the Function constructor"],
  [/\.(?:inner|outer)HTML\b/, "innerHTML / outerHTML"],
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

test("index.html loads no script but the official Grist plugin API and the widget's own", () => {
  const scripts = [...read("index.html").matchAll(/<script[^>]*\ssrc="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts.sort(), ["https://docs.getgrist.com/grist-plugin-api.js", "js/app.js", "js/theme-init.js"]);
});

test("index.html declares a CSP that blocks every other origin and any network call", () => {
  const csp = read("index.html").match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)?.[1] ?? "";
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
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
    [...read(`.github/workflows/${name}`).matchAll(/^\s*(?:-\s+)?image:\s+(\S+)/gm)].map((match) => [name, match[1]])
  );
  assert.ok(images.length > 0, "the images were read");
  for (const [name, image] of images) assert.match(image, /@sha256:[0-9a-f]{64}$|^\$\{\{ matrix\./, `${name}: ${image}`);
});
