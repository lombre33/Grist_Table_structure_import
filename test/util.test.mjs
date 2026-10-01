import { test } from "node:test";
import assert from "node:assert/strict";
import { callGrist, reportError } from "../js/util.js";
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

test("reportError gives the message and the details Grist's RPC attaches, and logs the error", (t) => {
  const log = t.mock.method(console, "error", () => {});
  assert.equal(reportError(new Error("boom")), "boom");
  assert.equal(reportError(Object.assign(new Error("boom"), { details: "no such table" })), "boom (no such table)");
  assert.equal(reportError({ message: "boom", data: { details: "boom" } }), "boom");
  assert.equal(reportError("plain text"), "plain text");
  assert.equal(log.mock.callCount(), 4);
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
