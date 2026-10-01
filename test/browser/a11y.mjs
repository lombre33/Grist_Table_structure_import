/** What axe-core finds to fix on a page as it is now: WCAG 2.2 levels A and AA, and its best practices. */
import { createRequire } from "node:module";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** One line per violation, naming the rule and the elements: empty when there is nothing to fix. */
export async function violations(page) {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate((tags) => axe.run(document, { runOnly: { type: "tag", values: tags } }), RULES);
  return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}
