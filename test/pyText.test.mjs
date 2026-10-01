import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatchingClose, parseArguments, parseString, parseStringList, quotePython } from "../js/pyText.js";

test("quotePython escapes what would end the literal or break the line", () => {
  assert.equal(quotePython("it's"), "'it\\'s'");
  assert.equal(quotePython("a\\b"), "'a\\\\b'");
  assert.equal(quotePython("1\n2\r3\t4"), "'1\\n2\\r3\\t4'");
  assert.equal(quotePython('say "hi"'), `'say "hi"'`);
});

test("parseString reads Python escapes, and keeps the character of an unknown one", () => {
  assert.equal(parseString("'1\\n2\\r3\\t4'"), "1\n2\r3\t4");
  assert.equal(parseString("'it\\'s \\\"x\\\"'"), `it's "x"`);
  assert.equal(parseString("'a\\\\nb'"), "a\\nb", "an escaped backslash is not the start of another escape");
  assert.equal(parseString("'\\d'"), "d");
});

test("parseString inverts quotePython for any text", () => {
  for (const text of ["", "'", "\\", "\\n", "\n\\n", "'\\'", "é😀", "a'b\"c\\d\ne"]) {
    assert.equal(parseString(quotePython(text)), text);
  }
});

test("parseString reads either quote style, and only a whole literal", () => {
  assert.equal(parseString("'it\\'s'"), "it's");
  assert.equal(parseString('"say \\"hi\\""'), 'say "hi"');
  assert.equal(parseString("''"), "");
  for (const source of ["abc", "'a' + 'b'", "'unterminated", undefined]) assert.equal(parseString(source), null, String(source));
});

test("findMatchingClose skips brackets inside quoted strings", () => {
  const text = "(choices=['Oui (confirmé)', \"B]\"])";
  assert.equal(findMatchingClose(text, 0), text.length - 1);
});

test("findMatchingClose handles escaped quotes, nesting and an unterminated bracket", () => {
  const text = "('it\\'s (nested)')";
  assert.equal(findMatchingClose(text, 0), text.length - 1);
  assert.equal(findMatchingClose("(a(b)c)d", 0), 6);
  assert.equal(findMatchingClose("(abc", 0), -1);
  assert.equal(findMatchingClose("abc)", 0), -1, "not an opening bracket");
});

test("parseArguments splits at top-level commas only", () => {
  const { positional, kwargs } = parseArguments("'People', visible_col='Name', choices=['a, b', 'c'], widget_options='{\"x\": [1, 2]}'");
  assert.deepEqual(positional, ["'People'"]);
  assert.deepEqual(kwargs, { visible_col: "'Name'", choices: "['a, b', 'c']", widget_options: "'{\"x\": [1, 2]}'" });
});

test("parseArguments copes with nothing, a trailing comma and spaces around =", () => {
  assert.deepEqual(parseArguments(""), { positional: [], kwargs: {} });
  assert.deepEqual(parseArguments("'A', label = 'B' ,"), { positional: ["'A'"], kwargs: { label: "'B'" } });
});

test("parseStringList reads the strings of a list, whatever they contain", () => {
  assert.deepEqual(parseStringList("['a', \"b\", 'it\\'s', 'x, y', '']"), ["a", "b", "it's", "x, y", ""]);
  for (const source of ["[]", "['a'", "'a'", "('a', 'b')", undefined]) assert.equal(parseStringList(source), null, String(source));
});
