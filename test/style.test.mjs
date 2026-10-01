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

test("the tab icon is drawn in the accent of the charter, the only colour the widget's own marks have", () => {
  const accent = light.find((declaration) => declaration.startsWith("--accent:")).split(":")[1].trim();
  const fills = [...readFileSync(new URL("../favicon.svg", import.meta.url), "utf8").matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((match) => match[1].toLowerCase());
  assert.deepEqual(fills, [accent]);
});

const valuesOf = (list) => Object.fromEntries(list.map((declaration) => [declaration.slice(0, declaration.indexOf(":")), declaration.slice(declaration.indexOf(":") + 1).trim()]));
const THEMES = { light: valuesOf(light), dark: { ...valuesOf(light), ...valuesOf(darkByChoice) } };

/** The hex colour of a token, following `var(--other)` references. */
function colour(tokens, name) {
  let value = tokens[name];
  for (let reference; (reference = value?.match(/^var\((--[\w-]+)\)$/)); ) value = tokens[reference[1]];
  assert.match(value ?? "", /^#[0-9a-f]{6}$/i, `${name} is a hex colour`);
  return value;
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

// What must be readable (text, 4.5:1) or visible (the outline of a field, 3:1) on what: WCAG 2.1 AA, 1.4.3 and 1.4.11.
const MINIMUMS = [
  ["--ink", ["--bg", "--surface", "--surface-sunken", "--accent-soft", "--warning-soft", "--info-soft"], 4.5],
  ["--muted", ["--bg", "--surface", "--surface-sunken", "--accent-soft", "--info-soft"], 4.5],
  ["--accent-text", ["--bg", "--surface", "--surface-sunken", "--accent-soft"], 4.5],
  ["--accent-ink", ["--accent", "--accent-hover"], 4.5],
  ["--danger", ["--danger-soft", "--surface", "--surface-sunken"], 4.5],
  ["--success", ["--success-soft"], 4.5],
  ["--warning", ["--warning-soft"], 4.5],
  ["--info", ["--info-soft"], 4.5],
  ["--field-border", ["--bg", "--surface", "--surface-sunken"], 3],
];

for (const [theme, tokens] of Object.entries(THEMES)) {
  test(`${theme}: text and field outlines are contrasted enough on what they sit on`, () => {
    for (const [foreground, backgrounds, minimum] of MINIMUMS) {
      for (const background of backgrounds) {
        const ratio = contrast(colour(tokens, foreground), colour(tokens, background));
        assert.ok(ratio >= minimum, `${foreground} on ${background}: ${ratio.toFixed(2)}:1, ${minimum}:1 needed`);
      }
    }
  });
}
