/** What several test files share: a file of the repository, and French text as the tests write it. */
import { readFileSync } from "node:fs";

/** The text of a file of the repository, from its path relative to the root. */
export const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** French text with its no-break spaces as plain ones. */
export const plain = (text) => text.replaceAll(" ", " ");
