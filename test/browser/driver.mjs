/** What a user does in the Import and Export tabs, as functions of a page opened by widgetPage.mjs. */

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

const exactly = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

/** The checkbox of an element in the group of a tab ("import" or "export"), by the name it shows. */
export const choice = (page, tab, name) =>
  page.locator(`#${tab}-elements-list li`).filter({ has: page.locator(".element-name", { hasText: exactly(name) }) }).locator("input");

/** What a group offers, as the screen shows it: for each element that is shown, whether it is ticked, its name and its count. */
export const offered = async (page, tab) =>
  (
    await page.$$eval(`#${tab}-elements-list li:not([hidden])`, (items) =>
      items.map((item) => `${item.querySelector("input").checked ? "[x]" : "[ ]"} ${item.querySelector(".element-name").textContent} (${item.querySelector(".tag").textContent})`)
    )
  ).map(plain);

/** What a box says about itself beyond its name: the text of what it is described by. */
export const description = async (page, selector) =>
  plain(await page.$eval(selector, (box) => box.getAttribute("aria-describedby").split(" ").map((id) => document.getElementById(id).textContent).join(" ")));
