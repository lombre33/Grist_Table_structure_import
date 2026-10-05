import { test } from "node:test";
import assert from "node:assert/strict";
import { callGrist, reportError, writeGrist } from "../js/util.js";
import { load, save } from "../js/storage.js";

test("callGrist passes the answer through", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(await callGrist(Promise.resolve(42)), 42);
  await assert.rejects(callGrist(Promise.reject(new Error("refused"))), /refused/);
});

test("callGrist gives up when Grist stays silent", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const silent = callGrist(new Promise(() => {}));
  t.mock.timers.tick(8000);
  await assert.rejects(silent, /Délai dépassé/);
});

test("a write is given two minutes, and the message when they are up says that it may have gone through", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(await writeGrist(Promise.resolve("done")), "done");
  await assert.rejects(writeGrist(Promise.reject(new Error("refused"))), /refused/);

  let outcome = "pending";
  const silent = writeGrist(new Promise(() => {})).then(() => "answered", (err) => (outcome = err.message));
  t.mock.timers.tick(8000); // the deadline of a read is not the one of a write
  await Promise.resolve();
  assert.equal(outcome, "pending");
  t.mock.timers.tick(112000);
  await silent;
  assert.match(outcome, /Elle a pu aboutir.*vérifiez le document avant de recommencer/);
});

test("reportError gives the message and the details Grist's RPC attaches, and logs the error", (t) => {
  const log = t.mock.method(console, "error", () => {});
  assert.equal(reportError(new Error("boom")), "boom");
  assert.equal(reportError(Object.assign(new Error("boom"), { details: "no such table" })), "boom (no such table)");
  assert.equal(reportError({ message: "boom", data: { details: "boom" } }), "boom");
  assert.equal(reportError("plain text"), "plain text");
  assert.equal(log.mock.callCount(), 4);
});

test("reportError tells in the language of the page that the document cannot be changed, and keeps what Grist said", (t) => {
  t.mock.method(console, "error", () => {});
  assert.equal(reportError(new Error("No write access")), "Vous n’avez pas le droit de modifier ce document (No write access).");
  assert.equal(reportError({ message: "Error", details: "no write access to this document" }), "Vous n’avez pas le droit de modifier ce document (Error (no write access to this document)).");
  assert.equal(reportError(new Error("Blocked")), "Blocked", "what is not known is shown as it came");
});

test("load returns what was saved if it is valid, the fallback otherwise, and never throws", (t) => {
  const store = new Map();
  t.after(() => delete globalThis.localStorage);
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.equal(load("k", (value) => value === "a", "fallback"), "fallback");
  save("k", "a");
  assert.equal(load("k", (value) => value === "a", "fallback"), "a");
  save("k", "b");
  assert.equal(load("k", (value) => value === "a", "fallback"), "fallback");

  globalThis.localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(load("k", () => true, "fallback"), "fallback");
  assert.doesNotThrow(() => save("k", "a"));
});
