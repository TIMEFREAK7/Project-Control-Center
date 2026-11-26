// Gate H.2 (2026-11-26): data saved by a NEWER app version (schema_version above this
// build's SCHEMA_VERSION) is refused everywhere, never migrated or saved over. Three apps
// ship on separate schedules, so an older build will meet newer data. Against the real
// bundled index.html.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
const SCHEMA_VERSION = require("./schemaVersion");

const INDEX_PATH = path.join(__dirname, "..", "index.html");
const KEY = "pcc_local_data_v1";
const MESSAGE = "This file was saved by a newer version of Project Control Center. Update this app, then import again.";
const FUTURE = SCHEMA_VERSION + 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function flush() {
  for (let i = 0; i < 12; i++) await sleep(0);
}

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

async function boot(seedRaw) {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const errors = [];
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(w) {
      if (seedRaw !== undefined) w.localStorage.setItem(KEY, seedRaw);
      w.addEventListener("error", (e) => errors.push(e.message));
    },
  });
  dom.window.indexedDB = new FDBFactory();
  dom.window.CompressionStream = CompressionStream;
  dom.window.DecompressionStream = DecompressionStream;
  dom.window.Response = Response;
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  return { win: dom.window, errors };
}

function importJson(win, text) {
  return new Promise((resolve) => win.PCC.store.importFromJsonString(text, (err) => resolve(err)));
}
function importSqlite(win, parsed) {
  return new Promise((resolve) => win.PCC.store.importFromSqliteBackup(parsed, {}, (err) => resolve(err)));
}

(async () => {
  // ---- Imports on a normal install ----
  const { win, errors } = await boot();
  win.PCC.store.update((d) => d.projects.push({ id: "keep", name: "Existing tower", archived: false, status: "on_track", progress: 0, attachments: [] }));
  await sleep(400); // past the 250 ms autosave debounce
  const rawBefore = win.localStorage.getItem(KEY);
  // Not equal to rawBefore: persistToLocalStorage() stamps meta.last_saved_at after writing.
  const storeBefore = JSON.stringify(win.PCC.store.get());
  const futureFile = { schema_version: FUTURE, projects: [{ id: "new", name: "From a newer app" }], settings: {} };

  await check("a JSON import from a newer version is rejected with the update message", async () => {
    const err = await importJson(win, JSON.stringify(futureFile));
    assert.ok(err, "expected the import to fail");
    assert.strictEqual(err.message, MESSAGE);
  });

  await check("a SQLite backup restore from a newer version is rejected with the same message", async () => {
    const err = await importSqlite(win, JSON.parse(JSON.stringify(futureFile)));
    assert.ok(err, "expected the restore to fail");
    assert.strictEqual(err.message, MESSAGE);
  });

  await check("after both rejections the store and the saved data are byte-identical", async () => {
    await sleep(400);
    assert.strictEqual(win.localStorage.getItem(KEY), rawBefore);
    assert.strictEqual(JSON.stringify(win.PCC.store.get()), storeBefore);
  });

  await check("a file from THIS version still imports (the guard is an upper bound only)", async () => {
    const err = await importJson(win, JSON.stringify({ schema_version: SCHEMA_VERSION, projects: [{ id: "cur", name: "Current" }], settings: {} }));
    assert.strictEqual(err, null);
    assert.ok(win.PCC.store.get().projects.some((p) => p.id === "cur"));
  });

  await check("a normal install shows no newer-version dialog", () => {
    assert.strictEqual(win.document.getElementById("newer-version-overlay"), null);
    assert.strictEqual(errors.length, 0, errors.join(" | "));
  });

  // ---- Booting an older build over newer saved data ----
  const futureRaw = JSON.stringify({ schema_version: FUTURE, projects: [{ id: "f1", name: "Saved by a newer app" }], settings: { theme: "dark" }, a_future_collection: [1, 2] });
  const b = await boot(futureRaw);

  await check("booting over newer saved data shows a blocking dialog with the update message", () => {
    const overlay = b.win.document.getElementById("newer-version-overlay");
    assert.ok(overlay, "expected the blocking dialog");
    assert.ok(overlay.textContent.indexOf("newer version of Project Control Center") !== -1, overlay.textContent);
    const buttons = Array.from(overlay.querySelectorAll("button")).map((x) => x.textContent.trim());
    assert.deepStrictEqual(buttons, ["Export this data"], "one action only, no way to dismiss: " + buttons.join(", "));
  });

  await check("the newer saved data survives the boot, autosave, an update() and a forced flush unchanged", async () => {
    await sleep(400);
    assert.strictEqual(b.win.localStorage.getItem(KEY), futureRaw, "changed by boot/autosave");
    b.win.PCC.store.update((d) => d.projects.push({ id: "x", name: "should not persist" }));
    await sleep(400);
    b.win.PCC.store.flushPendingSave();
    assert.strictEqual(b.win.localStorage.getItem(KEY), futureRaw, "changed by update()/flush");
  });

  await check("Escape does not dismiss the dialog", () => {
    b.win.document.dispatchEvent(new b.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.ok(b.win.document.getElementById("newer-version-overlay"));
  });

  await check("'Export this data' saves the raw newer data unchanged as a .json file", async () => {
    let saved = null;
    b.win.PCC.nativeFile.save = (blob, filename) => {
      saved = { blob, filename };
      return Promise.resolve();
    };
    const btn = Array.from(b.win.document.querySelectorAll("#newer-version-overlay button")).find((x) => x.textContent.trim() === "Export this data");
    btn.click();
    await flush();
    assert.ok(saved, "expected nativeFile.save to be called");
    assert.ok(/\.json$/.test(saved.filename), saved.filename);
    assert.strictEqual(await saved.blob.text(), futureRaw);
    assert.strictEqual(b.win.localStorage.getItem(KEY), futureRaw);
  });

  await check("no uncaught errors while blocked", () => {
    assert.strictEqual(b.errors.length, 0, b.errors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
