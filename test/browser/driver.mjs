/** What a user does in the Import tab, as functions of a page opened by widgetPage.mjs. */

export async function analyse(page, source) {
  await page.fill("#source-input", source);
  await page.click("#analyze-btn");
  await page.waitForFunction(() => !document.getElementById("analyze-btn").disabled && !document.getElementById("preview-section").hidden);
}

/** Clicks the main button and returns the status text once the operation is over. */
export async function apply(page) {
  await page.click("#action-btn");
  await page.waitForSelector("#import-status-region .status-success, #import-status-region .status-error");
  return page.textContent("#import-status-region");
}

export const warnings = (page) => page.$$eval("#warnings-list li", (items) => items.map((item) => item.textContent));

export const previewRows = (page) =>
  page.$$eval("#columns-preview-body tr", (rows) => rows.map((row) => row.textContent.replace(/\s+/g, " ").trim()));
