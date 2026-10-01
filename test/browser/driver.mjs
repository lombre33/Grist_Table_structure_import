/** What a user does in the Import tab, as functions of a page opened by widgetPage.mjs. */

import { plain } from "../helpers.mjs";

/** The text of an element, in `plain` form. */
export const textOf = async (page, selector) => plain(await page.textContent(selector));

export async function analyse(page, source) {
  await page.fill("#source-input", source);
  await page.click("#analyze-btn");
  await page.waitForFunction(() => !document.getElementById("analyze-btn").disabled && !document.getElementById("preview-section").hidden);
}

/** Clicks the main button and returns the status text once the operation is over. */
export async function apply(page) {
  await page.click("#action-btn");
  await page.waitForSelector("#import-status-region .status-success, #import-status-region .status-error");
  return textOf(page, "#import-status-region");
}

export const warnings = async (page) => (await page.$$eval("#warnings-list li", (items) => items.map((item) => item.textContent))).map(plain);

export const previewRows = (page) =>
  page.$$eval("#columns-preview-body tr", (rows) => rows.map((row) => row.textContent.replace(/\s+/g, " ").trim()));
