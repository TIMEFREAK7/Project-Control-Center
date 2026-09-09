// Phase 4 (one-way hourly data mirror): end-to-end jsdom test against the actual bundled
// index.html, same convention every prior gate's e2e test uses. Covers the Windows write
// side of src/js/dataMirror.js (runWindowsMirrorExport is exposed on window.PCC.dataMirror
// specifically so tests don't need to simulate a real hourly timer — same reasoning as
// every other engine module's test in this suite).
//
// The Android READ side (readAndroidMirrorFileIfNewer, pull-to-refresh) moved to a
// separate, dedicated "At a Glance" app/codebase — no longer part of this file or this
// bundle. See that app's own tests for its coverage.
//
// window.PCC_ELECTRON is installed AFTER the page has already loaded (jsdom's
// runScripts:"dangerously" executes the bundle's scripts synchronously during
// construction, before test code gets a chance to set anything on window first) — then
// window.PCC.dataMirror.install() is called again to re-run detection against the now-
// present mock, the same install()-on-demand pattern src/js/nativePrint.js's own tests
// already use for an identical timing problem.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const INDEX_PATH = path.join(__dirname, "..", "index.html");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function flush() {
  for (let i = 0; i < 10; i++) await sleep(0);
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

function freshWindow() {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  dom.window.indexedDB = new FDBFactory();
  return dom.window;
}

function enableMirror(win, folderPath) {
  win.PCC.store.update(function (d) {
    d.settings.sync_mirror_enabled = true;
    if (folderPath !== undefined) d.settings.sync_mirror_folder_path = folderPath;
  });
}

(async () => {
  await flush(); // let each freshWindow()'s initial async work (migrations, etc.) settle

  // ---- Windows (Electron) write side ----

  await check("runWindowsMirrorExport() is a no-op when the mirror is disabled", async () => {
    const win = freshWindow();
    await flush();
    let writeCalled = false;
    win.PCC_ELECTRON = {
      writeMirrorFile: () => {
        writeCalled = true;
        return Promise.resolve();
      },
    };
    win.PCC.dataMirror.install();
    await win.PCC.dataMirror.runWindowsMirrorExport();
    assert.strictEqual(writeCalled, false);
  });

  await check("runWindowsMirrorExport() is a no-op when enabled but no folder path is set", async () => {
    const win = freshWindow();
    await flush();
    let writeCalled = false;
    win.PCC_ELECTRON = {
      writeMirrorFile: () => {
        writeCalled = true;
        return Promise.resolve();
      },
    };
    win.PCC.dataMirror.install();
    enableMirror(win, "");
    await win.PCC.dataMirror.runWindowsMirrorExport();
    assert.strictEqual(writeCalled, false);
  });

  await check("runWindowsMirrorExport() is a no-op when window.PCC_ELECTRON isn't present (web/Android)", async () => {
    const win = freshWindow();
    await flush();
    enableMirror(win, "C:\\PCC-Sync");
    // No win.PCC_ELECTRON assigned at all.
    await win.PCC.dataMirror.runWindowsMirrorExport();
    // No assertion needed beyond "didn't throw" — there's nothing to spy on here.
  });

  await check("runWindowsMirrorExport() writes the real export JSON to the configured folder/filename when enabled+configured", async () => {
    const win = freshWindow();
    await flush();
    win.PCC.store.update(function (d) {
      d.projects.push(win.PCC.store.newProject({ name: "Mirror Test Project" }));
    });
    let writtenArgs = null;
    win.PCC_ELECTRON = {
      writeMirrorFile: (folderPath, filename, content) => {
        writtenArgs = { folderPath, filename, content };
        return Promise.resolve();
      },
    };
    win.PCC.dataMirror.install();
    enableMirror(win, "C:\\Users\\test\\PCC-Sync");
    await win.PCC.dataMirror.runWindowsMirrorExport();

    assert.ok(writtenArgs, "expected writeMirrorFile to be called");
    assert.strictEqual(writtenArgs.folderPath, "C:\\Users\\test\\PCC-Sync");
    assert.strictEqual(writtenArgs.filename, "pcc-mirror.json");
    const parsed = JSON.parse(writtenArgs.content);
    assert.strictEqual(parsed.schema_version, 65);
    assert.ok(parsed.projects.some((p) => p.name === "Mirror Test Project"));
  });

  await check("the quit-export hook runs one export then notifies done", async () => {
    const win = freshWindow();
    await flush();
    let quitExportRequestedCallback = null;
    let notifiedDone = false;
    let writeCalled = false;
    win.PCC_ELECTRON = {
      writeMirrorFile: () => {
        writeCalled = true;
        return Promise.resolve();
      },
      onQuitExportRequested: (cb) => {
        quitExportRequestedCallback = cb;
      },
      notifyQuitExportDone: () => {
        notifiedDone = true;
      },
    };
    win.PCC.dataMirror.install();
    enableMirror(win, "C:\\PCC-Sync");

    assert.ok(quitExportRequestedCallback, "expected onQuitExportRequested to have registered a callback");
    quitExportRequestedCallback();
    await flush();

    assert.strictEqual(writeCalled, true);
    assert.strictEqual(notifiedDone, true);
  });

  await check("dataMirror.readAndroidMirrorFileIfNewer is no longer exposed -- the Android read side moved to a separate app", async () => {
    const win = freshWindow();
    await flush();
    assert.strictEqual(win.PCC.dataMirror.readAndroidMirrorFileIfNewer, undefined);
  });

  await check("route smoke test: dashboard/myWork/actionCentre/portfolio/settings all still render cleanly after removing the Android read side", async () => {
    const win = freshWindow();
    await flush();
    ["dashboard", "myWork", "actionCentre", "portfolio", "settings"].forEach((name) => {
      win.location.hash = "#/" + name;
      win.PCC.router.render();
    });
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
