// PCC Architecture Upgrade Phase 5 (SQLite) — standalone Node test for
// sqlitePersistence.js, completing the remaining items on the master upgrade prompt's
// own Phase 5 test gate (Section 36): "test backup, test restore, test corruption
// handling" — sqliteMigrationEngine.js's own tests already covered schema design and
// lossless migration; this file covers the full save -> reload -> reconstruct -> verify
// lifecycle, plus what happens when the stored bytes are damaged.
//
// Still NOT wired into the live app — see sqliteMigrationEngine.js's header. Uses
// fake-indexeddb (same convention blobStore.js/scheduleBaselineStore.js tests already
// use) since jsdom doesn't implement IndexedDB and this doesn't need a DOM otherwise.
// CompressionStream/DecompressionStream/Response are Node's own real, native
// implementations (available since Node 18) — not stubs.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
const initSqlJs = require("sql.js");

let passed = 0;
let failed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.stack || e.message);
  }
}

function makeFakeLocalStorage() {
  const store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
}

function freshWindow() {
  // A fresh FDBFactory per call, matching a fresh app launch — persistence tests
  // deliberately re-open a NEW "instance" to prove data survives across it, the same
  // way blobStore.js's own tests distinguish "still in this session" from "actually
  // durable."
  return {
    localStorage: makeFakeLocalStorage(),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    indexedDB: new FDBFactory(),
    CompressionStream: CompressionStream,
    DecompressionStream: DecompressionStream,
    Response: Response,
  };
}

function loadModules(win) {
  global.window = win;
  ["store.js", "sqliteMigrationEngine.js", "sqlitePersistence.js"].forEach((file) => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", file), "utf8");
    // eslint-disable-next-line no-eval
    eval(src);
  });
  return { store: win.PCC.store, engine: win.PCC.sqliteMigrationEngine, persistence: win.PCC.sqlitePersistence };
}

(async () => {
  const SQL = await initSqlJs();

  await check("saveSnapshot() then loadSnapshot() in the SAME session returns byte-identical data", async () => {
    const win = freshWindow();
    const { persistence } = loadModules(win);
    const original = new Uint8Array([1, 2, 3, 4, 5, 250, 0, 255]);
    await persistence.saveSnapshot("test1", original);
    const loaded = await persistence.loadSnapshot("test1");
    assert.deepStrictEqual(Array.from(loaded), Array.from(original));
  });

  await check("loadSnapshot() for an id that was never saved resolves null, not an error", async () => {
    const win = freshWindow();
    const { persistence } = loadModules(win);
    const loaded = await persistence.loadSnapshot("never_saved");
    assert.strictEqual(loaded, null);
  });

  await check("FULL BACKUP/RESTORE LIFECYCLE: build a realistic dataset, export to SQLite, save the snapshot, simulate an app restart (fresh IndexedDB handle), reload, reconstruct a Database from the loaded bytes, export back to JSON, and reconcile against the original with zero issues", async () => {
    // "App session 1": build real data, migrate it into SQLite, export, and persist.
    const winSession1 = freshWindow();
    const { store, engine, persistence } = loadModules(winSession1);

    const data = store.get();
    const proj = store.newProject({ id: "proj_1", name: "Tower A" });
    data.projects.push(proj);
    for (let i = 0; i < 50; i++) {
      data.activities.push(store.newActivity({ project_id: proj.id, name: "Activity " + i, duration: i + 1 }));
    }

    const db = engine.buildDatabase(SQL, data);
    const exportedBytes = db.export();
    await persistence.saveSnapshot("main", exportedBytes);
    db.close();

    // "App session 2": nothing carried over in memory except what's in IndexedDB —
    // reload the module fresh (as if the page had actually been closed and reopened),
    // but reuse the SAME underlying fake IndexedDB (a real app restart keeps the same
    // browser-managed IndexedDB storage; only the in-memory JS state resets).
    global.window = null; // guard against accidentally reusing session 1's in-memory state
    const winSession2 = { ...freshWindow(), indexedDB: winSession1.indexedDB };
    const { engine: engine2, persistence: persistence2 } = loadModules(winSession2);

    const loadedBytes = await persistence2.loadSnapshot("main");
    assert.ok(loadedBytes, "expected the snapshot saved in session 1 to still be there in session 2");

    const restoredDb = new SQL.Database(loadedBytes);
    const roundTripped = engine2.exportToJson(restoredDb);
    const report = engine2.reconcile(data, roundTripped);
    assert.deepStrictEqual(report.issues, [], "unexpected issues: " + JSON.stringify(report.issues, null, 2));
    assert.strictEqual(roundTripped.activities.length, 50);
    assert.strictEqual(roundTripped.projects[0].name, "Tower A");
  });

  await check("CORRUPTION HANDLING: new SQL.Database() never throws on truncated bytes (a real, tested sql.js behavior) — validateDatabase() is what actually detects it, via a real read", async () => {
    const win = freshWindow();
    const { store, engine } = loadModules(win);
    const data = store.get();
    data.projects.push(store.newProject({ id: "proj_1", name: "Tower A" }));
    const db = engine.buildDatabase(SQL, data);
    const exportedBytes = db.export();
    db.close();

    const truncated = exportedBytes.slice(0, Math.floor(exportedBytes.length / 3));
    // Documented, tested finding: construction itself never throws, no matter how
    // corrupt the bytes are — SQLite validates lazily, on first real read. Asserting
    // "no throw" here isn't a weak test; it's confirming the actual behavior a naive
    // try/catch-around-`new Database()` would get wrong.
    const truncatedDb = new SQL.Database(truncated);
    const report = engine.validateDatabase(truncatedDb);
    assert.strictEqual(report.valid, false, "a real read against truncated bytes must fail");
    assert.ok(report.error, "expected a real error message, not just false");
  });

  await check("CORRUPTION HANDLING: a snapshot that is simply garbage bytes (never a real SQLite export) is faithfully stored/returned by the persistence layer, and validateDatabase() correctly flags it as invalid once reconstructed", async () => {
    const win = freshWindow();
    const { engine, persistence } = loadModules(win);
    const garbage = new Uint8Array(200);
    for (let i = 0; i < garbage.length; i++) garbage[i] = i % 256;
    await persistence.saveSnapshot("garbage", garbage);
    const loaded = await persistence.loadSnapshot("garbage");
    assert.deepStrictEqual(Array.from(loaded), Array.from(garbage), "the persistence layer itself must still faithfully store/return whatever bytes it's given — corruption detection is the caller's job when reconstructing a Database, not this layer's");

    const garbageDb = new SQL.Database(loaded);
    const report = engine.validateDatabase(garbageDb);
    assert.strictEqual(report.valid, false, "garbage bytes must fail validateDatabase()'s real read, not silently pass as an empty-but-valid database");
  });

  await check("validateDatabase() reports valid:true for a genuinely well-formed database, including a freshly-built empty one", async () => {
    const win = freshWindow();
    const { engine } = loadModules(win);
    const db = engine.buildDatabase(SQL, {});
    const report = engine.validateDatabase(db);
    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.error, null);
  });

  await check("saveSnapshot() overwrites a prior snapshot under the same id rather than accumulating", async () => {
    const win = freshWindow();
    const { persistence } = loadModules(win);
    await persistence.saveSnapshot("main", new Uint8Array([1, 1, 1]));
    await persistence.saveSnapshot("main", new Uint8Array([2, 2, 2, 2]));
    const loaded = await persistence.loadSnapshot("main");
    assert.deepStrictEqual(Array.from(loaded), [2, 2, 2, 2]);
    const ids = await persistence.listSnapshotIds();
    assert.deepStrictEqual(ids, ["main"]);
  });

  await check("deleteSnapshot() removes it — loadSnapshot() afterward resolves null again", async () => {
    const win = freshWindow();
    const { persistence } = loadModules(win);
    await persistence.saveSnapshot("temp", new Uint8Array([9, 9]));
    await persistence.deleteSnapshot("temp");
    const loaded = await persistence.loadSnapshot("temp");
    assert.strictEqual(loaded, null);
  });

  await check("a larger (5,000-activity) dataset survives the full compress/store/reload/decompress/reconstruct round trip", async () => {
    const winSession1 = freshWindow();
    const { store, engine, persistence } = loadModules(winSession1);
    const data = { activities: [] };
    for (let i = 0; i < 5000; i++) {
      data.activities.push(store.newActivity({ project_id: "proj_1", name: "Activity " + i, duration: (i % 20) + 1 }));
    }
    const db = engine.buildDatabase(SQL, data);
    const exportedBytes = db.export();
    await persistence.saveSnapshot("large", exportedBytes);
    db.close();

    const winSession2 = { ...freshWindow(), indexedDB: winSession1.indexedDB };
    const { engine: engine2, persistence: persistence2 } = loadModules(winSession2);
    const loadedBytes = await persistence2.loadSnapshot("large");
    const restoredDb = new SQL.Database(loadedBytes);
    const roundTripped = engine2.exportToJson(restoredDb);
    const report = engine2.reconcile(data, roundTripped);
    assert.deepStrictEqual(report.issues, []);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
