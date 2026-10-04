/** The widget as a custom widget inside Grist's own page: real iframe, real plugin API, real access grant. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { launchWidget } from "../browser/widgetPage.mjs";
import { analyse, apply, keepElement } from "../browser/driver.mjs";
import { instance, column, addTable, buildSource, snapshot, tableDescriptions } from "./support.mjs";
import { zipRows } from "../../js/schema.js";

const widget = await launchWidget();
const context = await widget.browser.newContext();
await context.addCookies(instance.cookies);
// The widget asks for Grist's plugin API at its public address: answer with the copy of this very instance.
await context.route("https://docs.getgrist.com/**", async (route) => {
  const script = await fetch(`${instance.url}/grist-plugin-api.js`);
  await route.fulfill({ status: 200, contentType: "text/javascript", body: await script.text() });
});
after(async () => {
  await context.close();
  await widget.close();
});

// The official plugin API injects a <style> for Grist's theme, which the widget's strict CSP refuses; nothing relies on it.
// Chromium words that message differently from one version to the next ("Refused to apply inline style because...",
// "Applying inline style violates..."), so it is recognised by what it says, not how.
const isKnownCspNoise = (text) => text.includes("inline style") && text.includes("style-src 'self'");

/** Opens `doc` on a page showing the widget; returns the page, the widget's frame and what it logged as errors. */
async function openWidgetIn(doc) {
  const [table] = zipRows(await doc.fetchTable("_grist_Tables"));
  const { retValues } = await doc.apply([["CreateViewSection", table.id, 0, "custom", null, null]]);
  const { sectionRef, viewRef } = retValues[0];
  const customView = JSON.stringify({ mode: "url", url: widget.url, access: "full", pluginId: "", sectionId: "", renderAfterReady: false });
  await doc.apply([["UpdateRecord", "_grist_Views_section", sectionRef, { options: JSON.stringify({ customView }) }]]);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => msg.type() === "error" && !isKnownCspNoise(msg.text()) && errors.push(msg.text()));
  await page.goto(`${instance.url}/o/docs/${doc.id}/widget/p/${viewRef}`);
  const frame = await page.waitForEvent("framenavigated", { predicate: (f) => f.url().startsWith(widget.url), timeout: 30000 }).catch(() => null) ?? page.frames().find((f) => f.url().startsWith(widget.url));
  await frame.waitForLoadState("load"); // the markup is there before the module scripts have run, and a click before that is lost
  await frame.waitForSelector("#tab-import");
  return { page, frame, errors };
}

test("the theme <style> noise is recognised in both wordings of Chromium's message, and nothing else is", () => {
  assert.ok(isKnownCspNoise(`Refused to apply inline style because it violates the following Content Security Policy directive: "style-src 'self'". Either the 'unsafe-inline' keyword...`));
  assert.ok(isKnownCspNoise(`Applying inline style violates the following Content Security Policy directive 'style-src 'self''. Either the 'unsafe-inline' keyword...`));
  assert.ok(!isKnownCspNoise(`Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self'".`));
  assert.ok(!isKnownCspNoise(`Refused to load the stylesheet 'https://example.org/a.css' because it violates the following Content Security Policy directive: "style-src 'self'".`));
});

test("the widget is used once its scripts have run, even when they come late: a click on a page that is not wired yet would be lost", async () => {
  const doc = await instance.newDoc("in Grist: late scripts");
  const widgetScripts = (url) => url.origin === new URL(widget.url).origin && url.pathname.endsWith(".js");
  const late = async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600)); // what a loaded machine or a slow network does to the 20 modules of the page
    await route.continue();
  };
  await context.route(widgetScripts, late);
  try {
    const { frame, page, errors } = await openWidgetIn(doc);
    await analyse(frame, "@grist.UserTable\nclass Late:\n  A = grist.Text()\n");
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await context.unroute(widgetScripts, late);
  }
});

test("Export in one document, Import in another, both through Grist's own interface", async () => {
  const source = await instance.newDoc("in Grist: source");
  await buildSource(source, {
    Teams: [{ id: "Title", type: "Text", label: "Intitulé", description: "Nom de l'équipe\nsur deux lignes" }, { id: "Roster", type: "RefList:Members" }],
    Members: [
      { id: "Team", type: "Ref:Teams", visibleCol: "Title", reverse: "Roster" },
      { id: "Mood", type: "Choice", widgetOptions: { choices: ["Content (ok)", "it's"], alignment: "center" } },
      { id: "Shout", type: "Text", formula: "$Mood.upper()" },
    ],
  }, { descriptions: { Teams: "Les équipes" } });

  const exporter = await openWidgetIn(source);
  await exporter.frame.click("#tab-export");
  await exporter.frame.locator("#export-table-list li", { hasText: "Members" }).locator("input").check();
  await exporter.frame.click("#refs-include-btn");
  await exporter.frame.click("#generate-btn");
  await exporter.frame.waitForFunction(() => document.getElementById("export-output").value.includes("class Members"));
  const text = await exporter.frame.inputValue("#export-output");
  assert.deepEqual(exporter.errors, []);
  await exporter.page.close();

  const target = await instance.newDoc("in Grist: target");
  const importer = await openWidgetIn(target);
  await analyse(importer.frame, text);
  await keepElement(importer.frame, "import", "Formules");
  assert.match(await apply(importer.frame), /^2 tables créées \(Members, Teams\)/);
  assert.deepEqual(importer.errors, []);
  await importer.page.close();

  const [before, after] = [await snapshot(source), await snapshot(target)];
  assert.deepEqual(after.Members, before.Members);
  assert.deepEqual(after.Teams, before.Teams);
  assert.equal(after.Teams[0].description, "Nom de l'équipe\nsur deux lignes");
  assert.equal((await tableDescriptions(target)).Teams, "Les équipes", "the description of the table, written to its raw data widget through the plugin API");
  assert.deepEqual([after.Members[0].reverseCol, after.Members.at(-1).formula], ["Roster", "$Mood.upper()"], "the two-way link and the formula came through the plugin API");
});

test("columns added to an existing table show up in its page", async () => {
  const doc = await instance.newDoc("in Grist: existing table");
  await addTable(doc, "Contacts", [column("Name")]);
  const { frame, page, errors } = await openWidgetIn(doc);
  await analyse(frame, "@grist.UserTable\nclass X:\n  name = grist.Text()\n  Email = grist.Text(description='Pro')\n");
  await frame.click('label.segmented-option:has(input[value="existing"])');
  await frame.selectOption("#target-table-select", { label: "Contacts" });
  assert.equal(await apply(frame), "1 colonne ajoutée à « Contacts ».");
  assert.deepEqual(errors, []);
  await page.close();

  assert.deepEqual((await snapshot(doc)).Contacts.map((col) => [col.id, col.description]), [["Name", ""], ["Email", "Pro"]]);

  const [contacts] = zipRows(await doc.fetchTable("_grist_Tables")).filter((table) => table.tableId === "Contacts");
  const pageSections = zipRows(await doc.fetchTable("_grist_Views_section")).filter((section) => section.tableRef === contacts.id && section.parentId !== 0);
  const shown = zipRows(await doc.fetchTable("_grist_Views_section_field")).filter((field) => pageSections.some((section) => section.id === field.parentId));
  const email = (await doc.columns("Contacts")).find((col) => col.colId === "Email");
  assert.ok(shown.some((field) => field.colRef === email.id), "the new column is in the table's grid");
});
