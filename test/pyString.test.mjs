import { test } from "node:test";
import assert from "node:assert/strict";
import { quotePython, unquotePython } from "../js/pyString.js";

test("quotePython escapes what would end the literal or break the line", () => {
  assert.equal(quotePython("it's"), "'it\\'s'");
  assert.equal(quotePython("a\\b"), "'a\\\\b'");
  assert.equal(quotePython("1\n2\r3\t4"), "'1\\n2\\r3\\t4'");
  assert.equal(quotePython('say "hi"'), `'say "hi"'`);
});

test("unquotePython reads Python escapes, and keeps the character of an unknown one", () => {
  assert.equal(unquotePython("1\\n2\\r3\\t4"), "1\n2\r3\t4");
  assert.equal(unquotePython("it\\'s \\\"x\\\""), `it's "x"`);
  assert.equal(unquotePython("a\\\\nb"), "a\\nb", "an escaped backslash is not the start of another escape");
  assert.equal(unquotePython("\\d"), "d");
});

test("unquotePython inverts quotePython for any text", () => {
  for (const text of ["", "'", "\\", "\\n", "\n\\n", "'\\'", "é😀", "a'b\"c\\d\ne"]) {
    assert.equal(unquotePython(quotePython(text).slice(1, -1)), text);
  }
});
