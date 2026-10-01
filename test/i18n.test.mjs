import { test } from "node:test";
import assert from "node:assert/strict";
import { typeLabel } from "../js/i18n.js";

test("typeLabel gives a readable name, with the target or time zone when there is one", () => {
  assert.equal(typeLabel("Text"), "Texte");
  assert.equal(typeLabel("Ref:Foo"), "Référence vers « Foo »");
  assert.equal(typeLabel("RefList:Foo"), "Références vers « Foo » (liste)");
  assert.equal(typeLabel("DateTime:UTC"), "Date et heure (UTC)");
});
