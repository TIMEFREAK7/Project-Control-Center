// PCC Architecture Upgrade Phase 5 (SQLite) — completion increment: "Full Backup
// (SQLite)". Standalone Node test for sqliteBackupService.js + store.js's new
// importFromSqliteBackup(), covering the real create-backup / restore-backup round trip
// with real blobs, and corruption handling.
//
// Real, documented environment discovery made while building this: JSZip's async
// pipeline — both zip.generateAsync() (writing) AND entry.async() (reading) — never
// resolves under jsdom, regardless of output type (blob/uint8array/nodebuffer/base64/
// string all hang indefinitely). This is a jsdom limitation, not a bug in this app's
// code — confirmed by testing the *same* vendored JSZip build directly, unrelated to
// anything sqliteBackupService.js does. So this file deliberately does NOT use jsdom:
// it evals the real source files into a plain Node "window" object (same pattern
// test_sqlite_persistence.js already uses for store.js/sqliteMigrationEngine.js), with
// a real Node `jszip` package (added as a devDependency solely for this test) standing
// in for the browser-vendored copy — same JSZip API, so the app code under test is
// identical either way. The actual browser build (window.JSZip from the vendored
// sql-wasm-style inline) is verified separately by the real-Chromium Playwright smoke
// test, which doesn't have jsdom's limitation. See test_sqlite_full_backup_e2e.js's own
// header for the corresponding jsdom-side trim.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
const initSqlJs = require("sql.js");
const JSZip = require("jszip");

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
    key: (i) => Object.keys(store)[i],
    get length() { return Object.keys(store).length; },
  };
}

function freshWindow() {
  return {
    localStorage: makeFakeLocalStorage(),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    indexedDB: new FDBFactory(),
    CompressionStream: CompressionStream,
    DecompressionStream: DecompressionStream,
    Response: Response,
    JSZip: JSZip,
    atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
    btoa: (bin) => Buffer.from(bin, "binary").toString("base64"),
  };
}

function loadModules(win) {
  global.window = win;
  ["store.js", "blobStore.js", "sqliteMigrationEngine.js", "sqliteBackupService.js"].forEach((file) => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", file), "utf8");
    // eslint-disable-next-line no-eval
    eval(src);
  });
  return { store: win.PCC.store, blobStore: win.PCC.blobStore, engine: win.PCC.sqliteMigrationEngine, backup: win.PCC.sqliteBackupService };
}

function dataUriFromText(mime, text) {
  return "data:" + mime + ";base64," + Buffer.from(text, "utf8").toString("base64");
}
function textFromDataUri(dataUri) {
  return Buffer.from(dataUri.split(",")[1], "base64").toString("utf8");
}

(async () => {
  const SQL = await initSqlJs();

  await check("createFullBackup() produces a zip with manifest.json, database/pcc.sqlite, and files/<id> for every resolvable blob", async () => {
    const win = freshWindow();
    const { store, blobStore, backup } = loadModules(win);

    store.update((d) => {
      d.projects.push(store.newProject({ id: "proj_1", name: "Backup Service Test" }));
      const doc1 = store.newDocument({ id: "doc_1", project_id: "proj_1", filename: "a.jpg" });
      doc1.file_data = null;
      const doc2 = store.newDocument({ id: "doc_2", project_id: "proj_1", filename: "b.jpg" });
      doc2.file_data = null;
      const doc3Unresolvable = store.newDocument({ id: "doc_3", project_id: "proj_1", filename: "missing.jpg" });
      doc3Unresolvable.file_data = null;
      d.documents.push(doc1, doc2, doc3Unresolvable);
    });
    await blobStore.putBlob("doc_1", dataUriFromText("image/jpeg", "bytes-for-doc-1"));
    await blobStore.putBlob("doc_2", dataUriFromText("image/jpeg", "bytes-for-doc-2"));
    // doc_3 deliberately has no blob anywhere — simulates a genuinely missing file.

    const result = await backup.createFullBackup(SQL, store.get());
    assert.strictEqual(result.fileCount, 2, "expected exactly 2 resolvable blobs");
    assert.strictEqual(result.skipped, 1, "expected exactly 1 skipped (unresolvable) blob");

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    assert.ok(zip.file("manifest.json"), "manifest.json must be present");
    assert.ok(zip.file("database/pcc.sqlite"), "database/pcc.sqlite must be present");
    assert.ok(zip.file("files/doc_1"), "files/doc_1 must be present");
    assert.ok(zip.file("files/doc_2"), "files/doc_2 must be present");
    assert.ok(!zip.file("files/doc_3"), "files/doc_3 must be ABSENT — its blob was never resolvable");

    const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
    assert.strictEqual(manifest.file_count, 2);
    assert.strictEqual(manifest.files_skipped, 1);
    assert.strictEqual(manifest.files.find((f) => f.id === "doc_1").mime, "image/jpeg");

    const dbBytes = await zip.file("database/pcc.sqlite").async("uint8array");
    const db = new SQL.Database(dbBytes);
    const validation = win.PCC.sqliteMigrationEngine.validateDatabase(db);
    assert.strictEqual(validation.valid, true);
    const exported = win.PCC.sqliteMigrationEngine.exportToJson(db);
    assert.strictEqual(exported.documents.find((d) => d.id === "doc_1").file_data, null, "hybrid-storage design: the database itself must never carry file bytes");
  });

  await check("FULL ROUND TRIP: create a backup, wipe the store, restore, and every record AND every blob's exact bytes come back", async () => {
    const win = freshWindow();
    const { store, blobStore, backup } = loadModules(win);

    store.update((d) => {
      d.projects.push(store.newProject({ id: "proj_rt", name: "Round Trip Project" }));
      const sched = store.newSchedule({ project_id: "proj_rt", name: "Sched" });
      d.schedules.push(sched);
      d.activities.push(store.newActivity({ project_id: "proj_rt", schedule_id: sched.id, name: "Act 1", duration: 3 }));
      d.risks.push(store.newRisk({ project_id: "proj_rt", type: "risk", title: "A real risk" }));
      const doc = store.newDocument({ id: "doc_rt", project_id: "proj_rt", filename: "photo.png" });
      doc.file_data = null;
      d.documents.push(doc);
      const log = store.newDailyLog({ project_id: "proj_rt", notes: "Pour" });
      const photo = store.newDailyLogPhoto({ id: "photo_rt", caption: "Block A" });
      log.photos.push(photo);
      d.daily_logs.push(log);
    });
    await blobStore.putBlob("doc_rt", dataUriFromText("image/png", "REAL-DOC-BYTES"));
    await blobStore.putBlob("photo_rt", dataUriFromText("image/jpeg", "REAL-PHOTO-BYTES"));

    const result = await backup.createFullBackup(SQL, store.get());

    // Wipe the live store entirely — same effect as "Reset all data".
    store.resetAll();
    assert.strictEqual(store.get().projects.length, 0, "sanity: the store must actually be empty before restore");

    const restoreInfo = await backup.restoreFullBackup(SQL, await result.blob.arrayBuffer());
    assert.strictEqual(restoreInfo.restoredFileCount, 2, "both blobs should have been restored");

    const d = store.get();
    const project = d.projects.find((p) => p.id === "proj_rt");
    assert.ok(project, "the project must be restored");
    assert.strictEqual(project.name, "Round Trip Project");
    assert.ok(d.activities.some((a) => a.name === "Act 1"));
    assert.ok(d.risks.some((r) => r.title === "A real risk"));

    const doc = d.documents.find((doc2) => doc2.id === "doc_rt");
    assert.ok(doc, "the document metadata must be restored");
    assert.strictEqual(doc.file_data, null, "the restored document's blob must live in blobStore.js, not be re-inlined into the JSON store");
    const restoredDocDataUri = await blobStore.getBlob("doc_rt");
    assert.strictEqual(textFromDataUri(restoredDocDataUri), "REAL-DOC-BYTES", "the restored document's bytes must exactly match the original");

    const log = d.daily_logs.find((l) => l.photos.some((p) => p.id === "photo_rt"));
    assert.ok(log, "the daily log must be restored");
    const restoredPhotoDataUri = await blobStore.getBlob("photo_rt");
    assert.strictEqual(textFromDataUri(restoredPhotoDataUri), "REAL-PHOTO-BYTES", "the restored photo's bytes must exactly match the original");
  });

  await check("PARTIAL FILE LOSS: a manifest entry with no matching files/<id> in the zip restores the record but leaves that one blob absent, without crashing", async () => {
    const win = freshWindow();
    const { store, blobStore, backup } = loadModules(win);

    store.update((d) => {
      d.projects.push(store.newProject({ id: "proj_partial", name: "Partial" }));
      const doc = store.newDocument({ id: "doc_partial", project_id: "proj_partial", filename: "x.jpg" });
      doc.file_data = null;
      d.documents.push(doc);
    });
    await blobStore.putBlob("doc_partial", dataUriFromText("image/jpeg", "will-be-stripped"));

    const result = await backup.createFullBackup(SQL, store.get());
    // Tamper: rebuild the zip with the manifest intact but the actual file entry removed,
    // simulating a backup .zip that got its files/ folder partially truncated/corrupted.
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    zip.remove("files/doc_partial");
    const tamperedBlob = await zip.generateAsync({ type: "nodebuffer" });

    // Restore into a genuinely fresh app instance (new store, new blobStore IndexedDB) —
    // store.resetAll() alone wouldn't prove this, since it only clears the JSON store,
    // not blobStore.js's separate IndexedDB (a real, separate, pre-existing fact about
    // resetAll() unrelated to this feature).
    const win2 = freshWindow();
    const restored = loadModules(win2);
    const restoreInfo = await restored.backup.restoreFullBackup(SQL, tamperedBlob);
    assert.strictEqual(restoreInfo.restoredFileCount, 0, "the missing file must not count as restored");

    const doc = restored.store.get().documents.find((d) => d.id === "doc_partial");
    assert.ok(doc, "the document's metadata must still be restored even though its file is missing");
    assert.strictEqual(doc.file_data, null);
    const blob = await restored.blobStore.getBlob("doc_partial");
    assert.ok(!blob, "no blob should exist for a file that was never in the backup");
  });

  await check("CORRUPTION HANDLING: a zip with no database/pcc.sqlite is rejected with a clear, specific error", async () => {
    const win = freshWindow();
    const { backup } = loadModules(win);
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ files: [] }));
    const badBlob = await zip.generateAsync({ type: "nodebuffer" });

    await assert.rejects(
      () => backup.restoreFullBackup(SQL, badBlob),
      /pcc\.sqlite is missing/i
    );
  });

  await check("CORRUPTION HANDLING: a zip whose database/pcc.sqlite is garbage bytes is rejected via validateDatabase, not a crash", async () => {
    const win = freshWindow();
    const { backup } = loadModules(win);
    const zip = new JSZip();
    zip.file("database/pcc.sqlite", Buffer.from("not a real sqlite file at all"));
    zip.file("manifest.json", JSON.stringify({ files: [] }));
    const badBlob = await zip.generateAsync({ type: "nodebuffer" });

    await assert.rejects(
      () => backup.restoreFullBackup(SQL, badBlob),
      /corrupt or unreadable/i
    );
  });

  await check("importFromSqliteBackup() rejects data with no schema_version, the same way importFromFile() rejects a non-PCC JSON file", async () => {
    const win = freshWindow();
    const { store } = loadModules(win);
    await new Promise((resolve) => {
      store.importFromSqliteBackup({ not_a_real_export: true }, {}, (err) => {
        assert.ok(err, "expected a rejection");
        assert.ok(/doesn't look like/i.test(err.message));
        resolve();
      });
    });
  });

  await check("PERFORMANCE: a realistic 500-document backup+restore round trip completes without timing out or losing any record", async () => {
    const win = freshWindow();
    const { store, blobStore, backup } = loadModules(win);

    store.update((d) => {
      d.projects.push(store.newProject({ id: "proj_perf", name: "Perf" }));
      for (let i = 0; i < 500; i++) {
        const doc = store.newDocument({ id: "doc_perf_" + i, project_id: "proj_perf", filename: "f" + i + ".jpg" });
        doc.file_data = null;
        d.documents.push(doc);
      }
    });
    const puts = [];
    for (let i = 0; i < 500; i++) {
      puts.push(blobStore.putBlob("doc_perf_" + i, dataUriFromText("image/jpeg", "content-" + i)));
    }
    await Promise.all(puts);

    const start = Date.now();
    const result = await backup.createFullBackup(SQL, store.get());
    store.resetAll();
    const restoreInfo = await backup.restoreFullBackup(SQL, await result.blob.arrayBuffer());
    const elapsedMs = Date.now() - start;

    assert.strictEqual(result.fileCount, 500);
    assert.strictEqual(restoreInfo.restoredFileCount, 500);
    assert.strictEqual(store.get().documents.length, 500);
    console.log("      (500-document backup+restore round trip took " + elapsedMs + "ms)");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
