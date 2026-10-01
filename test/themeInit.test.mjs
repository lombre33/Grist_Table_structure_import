import { test } from "node:test";
import assert from "node:assert/strict";
import { read } from "./helpers.mjs";

const init = read("js/theme-init.js").replace(/\/\/.*$/gm, ""); // code only: a comment cannot make the checks pass

test("the script that applies the saved theme and language before the first paint reads the keys the modules write", () => {
  const keys = [read("js/settings.js").match(/THEME_KEY = "([^"]+)"/)[1], read("js/i18n.js").match(/LOCALE_KEY = "([^"]+)"/)[1]];
  for (const key of keys) assert.ok(init.includes(`"${key}"`), key);
});

test("it accepts the same values as the modules", () => {
  const themes = read("js/settings.js").match(/THEMES = \[([^\]]*)\]/)[1].match(/"(\w+)"/g).map((value) => value.replaceAll('"', ""));
  for (const theme of themes.filter((name) => name !== "system")) assert.ok(init.includes(`"${theme}"`), theme);
  for (const locale of ["fr", "en"]) assert.ok(init.includes(`"${locale}"`), locale);
});
