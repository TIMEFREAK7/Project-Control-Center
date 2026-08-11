// jsdom + fake-indexeddb round-trip test for scheduleBaselineStore.js.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.message);
  }
}

function freshStore() {
  // Fresh indexedDB + fresh window per test so putSnapshot/getSnapshot tests don't leak
  // state into each other via the module's cached dbPromise (openDb() caches dbPromise
  // at module scope, so a fresh `window` + re-eval is what actually resets it, not just
  // a fresh FDBFactory). global.window is left pointing at this dom's window after
  // returning — scheduleBaselineStore.js's openDb() reads `window.indexedDB` lazily,
  // at call time, not once at eval time, so it must still resolve when the async
  // put/get/delete calls actually run later in the test, not just during eval.
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  dom.window.indexedDB = new FDBFactory();
  global.window = dom.window;
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "js", "scheduleBaselineStore.js"),
    "utf8"
  );
  // eslint-disable-next-line no-eval
  eval(src);
  return global.window.PCC.scheduleBaselineStore;
}

(async () => {
  await check("putSnapshot then getSnapshot round-trips the exact object", async () => {
    const store = freshStore();
    const snapshot = { schedule_id: "sch_1", activities: [{ id: "act_1", name: "Excavate" }], relationships: [] };
    await store.putSnapshot("bl_1", snapshot);
    const result = await store.getSnapshot("bl_1");
    assert.deepStrictEqual(result, snapshot);
  });

  await check("getSnapshot resolves null (not an error) for an id that was never stored", async () => {
    const store = freshStore();
    const result = await store.getSnapshot("bl_never_existed");
    assert.strictEqual(result, null);
  });

  await check("getSnapshot resolves null for an empty/falsy id without touching IndexedDB", async () => {
    const store = freshStore();
    const result = await store.getSnapshot("");
    assert.strictEqual(result, null);
  });

  await check("putSnapshot rejects when called without an id", async () => {
    const store = freshStore();
    let threw = false;
    try {
      await store.putSnapshot(null, { foo: "bar" });
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, true);
  });

  await check("putSnapshot overwrites an existing id rather than erroring", async () => {
    const store = freshStore();
    await store.putSnapshot("bl_1", { version: 1 });
    await store.putSnapshot("bl_1", { version: 2 });
    const result = await store.getSnapshot("bl_1");
    assert.deepStrictEqual(result, { version: 2 });
  });

  await check("deleteSnapshot removes it; getSnapshot then resolves null", async () => {
    const store = freshStore();
    await store.putSnapshot("bl_1", { foo: "bar" });
    await store.deleteSnapshot("bl_1");
    const result = await store.getSnapshot("bl_1");
    assert.strictEqual(result, null);
  });

  await check("deleteSnapshot on a never-stored id resolves without throwing", async () => {
    const store = freshStore();
    await store.deleteSnapshot("bl_never_existed"); // must not throw
  });

  await check("listSnapshotIds returns every stored id and nothing else", async () => {
    const store = freshStore();
    await store.putSnapshot("bl_1", { a: 1 });
    await store.putSnapshot("bl_2", { a: 2 });
    const ids = await store.listSnapshotIds();
    assert.deepStrictEqual(ids.slice().sort(), ["bl_1", "bl_2"]);
  });

  await check("multiple snapshots stored under different ids don't clobber each other", async () => {
    const store = freshStore();
    await store.putSnapshot("bl_1", { activities: [{ id: "a" }] });
    await store.putSnapshot("bl_2", { activities: [{ id: "b" }] });
    const s1 = await store.getSnapshot("bl_1");
    const s2 = await store.getSnapshot("bl_2");
    assert.deepStrictEqual(s1, { activities: [{ id: "a" }] });
    assert.deepStrictEqual(s2, { activities: [{ id: "b" }] });
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
