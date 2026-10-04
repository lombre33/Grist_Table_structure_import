import { test } from "node:test";
import assert from "node:assert/strict";
import { queryMatcher } from "../js/search.js";

test("a query without a word is held by every text", () => {
  for (const query of ["", "   ", "\t\n"]) {
    const matches = queryMatcher(query);
    assert.deepEqual(["Clients", "", "_"].map(matches), [true, true, true], JSON.stringify(query));
  }
});

test("case and accents do not matter, on either side", () => {
  assert.equal(queryMatcher("BENEVOLES")("Bénévoles"), true);
  assert.equal(queryMatcher("événement")("EVENEMENTS_2026"), true);
  assert.equal(queryMatcher("garçon")("Garcon"), true);
  assert.equal(queryMatcher("benevoles")("Bénévoles"), true, "a text that composes its accents as a letter and a mark");
  assert.equal(queryMatcher("benevoles")("Bénévoles"), true);
});

test("a part of a word is enough, wherever it is, and an underscore is a character like another", () => {
  const matches = queryMatcher("act");
  assert.deepEqual(["Activites", "Benevoles_Activites", "Reaction", "Clients"].map(matches), [true, true, true, false]);
  assert.equal(queryMatcher("s_a")("Benevoles_Activites"), true);
  assert.equal(queryMatcher("_")("Clients"), false);
});

test("every word must be in the text, in any order", () => {
  const matches = queryMatcher("  activ  BENEV ");
  assert.equal(matches("Benevoles_Activites"), true);
  assert.equal(matches("Activites_Benevoles"), true);
  assert.equal(matches("Benevoles"), false, "one word is missing");
  assert.equal(queryMatcher("a a")("a"), true, "a word said twice is held once");
});

test("what is typed is text, never a pattern", () => {
  assert.equal(queryMatcher("a.b")("axb"), false);
  assert.equal(queryMatcher("a.b")("a.b"), true);
  assert.equal(queryMatcher("(")("Clients"), false);
  assert.equal(queryMatcher("[a-z]+")("Clients"), false);
  assert.equal(queryMatcher("[a-z]+")("x[a-z]+y"), true);
  assert.equal(queryMatcher("\\")("a\\b"), true);
});
