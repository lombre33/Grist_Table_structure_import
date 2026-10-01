import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatchingClose, parseArguments, parseString, parseStringList, quotePython, stringLines } from "../js/pyText.js";

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

test("stringLines flags the lines that start inside a triple-quoted string, and only those", () => {
  const flags = (text) => stringLines(text.split("\n"));
  assert.deepEqual(flags('a = 1\nx = """first\n# not a comment\n  indented\n\nlast"""\ny = 2'), [false, false, true, true, true, true, false]);
  assert.deepEqual(flags("s = '''a\"\"\"b\nc''' + 'd'\nz = 1"), [false, true, false], "the other kind of triple quote is part of the text");
  assert.deepEqual(flags('x = "it\'s" # """ not a string\ny = 3'), [false, false], "a quote in a comment or in another string opens nothing");
  assert.deepEqual(flags('e = ""\nf = """"""\ng = 1'), [false, false, false], "empty strings are closed");
  assert.deepEqual(flags('x = """a \\""" still\nin""" + 1\nout'), [false, true, false], "an escaped quote does not close it");
  assert.deepEqual(flags('u = "unclosed\nnext'), [false, false], "a single-quoted string ends with its line");
});
