// Phase 3 (IndexedDB consolidation): tests sharedIndexedDb.js's one-time, copy-only
// migration from the two previous separate databases (pcc_blobs_v1's `blobs`+`content`
// stores, pcc_schedule_baselines_v1's `snapshots` store) into the new shared `pcc_data_v1`
// database. Legacy databases are populated with raw IndexedDB calls here (bypassing
// blobStore.js/scheduleBaselineStore.js, which now point at the NEW database) to simulate
// a real existing install updating to this version.
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

function freshWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  dom.window.indexedDB = new FDBFactory();
  global.window = dom.window;
  return dom.window;
}

function loadSharedIndexedDb() {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "sharedIndexedDb.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(src);
  return global.window.PCC.sharedIndexedDb;
}

function createLegacyBlobsDb(win, blobRecords, contentRecords) {
  return new Promise((resolve, reject) => {
    const req = win.indexedDB.open("pcc_blobs_v1", 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("blobs", { keyPath: "id" });
      db.createObjectStore("content", { keyPath: "hash" });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["blobs", "content"], "readwrite");
      blobRecords.forEach((r) => tx.objectStore("blobs").put(r));
      (contentRecords || []).forEach((r) => tx.objectStore("content").put(r));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function createLegacyBaselinesDb(win, snapshotRecords) {
  return new Promise((resolve, reject) => {
    const req = win.indexedDB.open("pcc_schedule_baselines_v1", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("snapshots", { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("snapshots", "readwrite");
      snapshotRecords.forEach((r) => tx.objectStore("snapshots").put(r));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function readAll(sharedIndexedDb, storeName) {
  return sharedIndexedDb.openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function readLegacyBlobs(win) {
  return new Promise((resolve, reject) => {
    const req = win.indexedDB.open("pcc_blobs_v1", 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("blobs", "readonly");
      const r = tx.objectStore("blobs").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    };
    req.onerror = () => reject(req.error);
  });
}

(async () => {
  await check("genuinely fresh install (no legacy databases at all) opens cleanly with empty stores", async () => {
    freshWindow();
    const shared = loadSharedIndexedDb();
    const db = await shared.openDb();
    assert.ok(db.objectStoreNames.contains("blobs"));
    assert.ok(db.objectStoreNames.contains("content"));
    assert.ok(db.objectStoreNames.contains("snapshots"));
    assert.deepStrictEqual(await readAll(shared, "blobs"), []);
    assert.deepStrictEqual(await readAll(shared, "snapshots"), []);
  });

  await check("migrates existing blob + content records from the old pcc_blobs_v1 database", async () => {
    const win = freshWindow();
    await createLegacyBlobsDb(
      win,
      [{ id: "doc_1", mime: "image/png", gz: new ArrayBuffer(4) }],
      [{ hash: "abc123", mime: "image/png", gz: new ArrayBuffer(4), refCount: 1 }]
    );
    const shared = loadSharedIndexedDb();
    const blobs = await readAll(shared, "blobs");
    const content = await readAll(shared, "content");
    assert.strictEqual(blobs.length, 1);
    assert.strictEqual(blobs[0].id, "doc_1");
    assert.strictEqual(content.length, 1);
    assert.strictEqual(content[0].hash, "abc123");
  });

  await check("migrates existing snapshot records from the old pcc_schedule_baselines_v1 database", async () => {
    const win = freshWindow();
    await createLegacyBaselinesDb(win, [{ id: "bl_1", data: { activities: [] } }]);
    const shared = loadSharedIndexedDb();
    const snapshots = await readAll(shared, "snapshots");
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].id, "bl_1");
    assert.deepStrictEqual(snapshots[0].data, { activities: [] });
  });

  await check("migrates both old databases together in one openDb() call", async () => {
    const win = freshWindow();
    await createLegacyBlobsDb(win, [{ id: "doc_1", mime: "image/png", gz: new ArrayBuffer(4) }], []);
    await createLegacyBaselinesDb(win, [{ id: "bl_1", data: { activities: [] } }]);
    const shared = loadSharedIndexedDb();
    const blobs = await readAll(shared, "blobs");
    const snapshots = await readAll(shared, "snapshots");
    assert.strictEqual(blobs.length, 1);
    assert.strictEqual(snapshots.length, 1);
  });

  await check("never deletes the old database -- its data is still readable directly afterward", async () => {
    const win = freshWindow();
    await createLegacyBlobsDb(win, [{ id: "doc_1", mime: "image/png", gz: new ArrayBuffer(4) }], []);
    const shared = loadSharedIndexedDb();
    await shared.openDb();
    const oldRecords = await readLegacyBlobs(win);
    assert.strictEqual(oldRecords.length, 1);
    assert.strictEqual(oldRecords[0].id, "doc_1");
  });

  await check("migration is idempotent across a fresh module load -- doesn't duplicate or re-copy once already migrated", async () => {
    const win = freshWindow();
    await createLegacyBlobsDb(win, [{ id: "doc_1", mime: "image/png", gz: new ArrayBuffer(4) }], []);
    const shared = loadSharedIndexedDb();
    await shared.openDb();
    // A brand-new module instance (simulating a later app launch) against the same window/
    // indexedDB must not re-copy or duplicate, relying on the new store already having data
    // rather than any promise-level caching.
    const sharedAgain = loadSharedIndexedDb();
    const blobs = await readAll(sharedAgain, "blobs");
    assert.strictEqual(blobs.length, 1);
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
