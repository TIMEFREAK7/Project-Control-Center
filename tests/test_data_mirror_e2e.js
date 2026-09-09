// Phase 4 (one-way hourly data mirror): end-to-end jsdom test against the actual bundled
// index.html, same convention every prior gate's e2e test uses. Covers both platform
// sides of src/js/dataMirror.js directly (runWindowsMirrorExport/
// readAndroidMirrorFileIfNewer are both exposed on window.PCC.dataMirror specifically so
// tests don't need to simulate a real hourly timer or a real Capacitor resume event —
// same reasoning as every other engine module's test in this suite).
//
// window.PCC_ELECTRON / window.Capacitor are installed AFTER the page has already loaded
// (jsdom's runScripts:"dangerously" executes the bundle's scripts synchronously during
// construction, before test code gets a chance to set anything on window first) — then
// window.PCC.dataMirror.install() is called again to re-run detection against the now-
// present mocks, the same install()-on-demand pattern src/js/nativePrint.js's own tests
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

  // ---- Android (Capacitor) read side ----

  function capacitorMock(overrides) {
    return Object.assign(
      {
        isNativePlatform: () => true,
        Plugins: {
          Filesystem: {
            stat: () => Promise.reject(new Error("does not exist")),
            readFile: () => Promise.reject(new Error("not implemented in this mock")),
          },
        },
      },
      overrides
    );
  }

  await check("readAndroidMirrorFileIfNewer() is a no-op when the mirror is disabled", async () => {
    const win = freshWindow();
    await flush();
    let readCalled = false;
    win.Capacitor = capacitorMock({
      Plugins: { Filesystem: { stat: () => { readCalled = true; return Promise.reject(new Error("x")); }, readFile: () => Promise.reject(new Error("x")) } },
    });
    win.PCC.dataMirror.install();
    await win.PCC.dataMirror.readAndroidMirrorFileIfNewer();
    assert.strictEqual(readCalled, false);
  });

  await check("readAndroidMirrorFileIfNewer() is a no-op when not running under Capacitor", async () => {
    const win = freshWindow();
    await flush();
    enableMirror(win);
    // No win.Capacitor assigned — plain web/Electron context.
    await win.PCC.dataMirror.readAndroidMirrorFileIfNewer(); // must not throw
  });

  await check("readAndroidMirrorFileIfNewer() silently does nothing when the mirror file doesn't exist yet", async () => {
    const win = freshWindow();
    await flush();
    enableMirror(win);
    win.Capacitor = capacitorMock();
    win.PCC.dataMirror.install();
    await win.PCC.dataMirror.readAndroidMirrorFileIfNewer(); // must not throw
  });

  await check("readAndroidMirrorFileIfNewer() reads and imports a real mirror snapshot when one exists", async () => {
    const win = freshWindow();
    await flush();
    enableMirror(win);

    const exportJson = await win.PCC.store.buildExportJson();
    const exportedProjectCount = JSON.parse(exportJson).projects.length;

    win.Capacitor = capacitorMock({
      Plugins: {
        Filesystem: {
          stat: () => Promise.resolve({ mtime: 1000 }),
          readFile: () => Promise.resolve({ data: exportJson }),
        },
      },
    });
    win.PCC.dataMirror.install();

    // Wipe local data first so the import is actually observable.
    win.PCC.store.resetAll();
    assert.strictEqual(win.PCC.store.get().projects.length, 0);

    await win.PCC.dataMirror.readAndroidMirrorFileIfNewer();
    await flush();

    assert.strictEqual(win.PCC.store.get().projects.length, exportedProjectCount);
  });

  await check("readAndroidMirrorFileIfNewer() does NOT re-read when the file's mtime hasn't advanced", async () => {
    const win = freshWindow();
    await flush();
    enableMirror(win);

    const exportJson = await win.PCC.store.buildExportJson();
    let readFileCallCount = 0;
    win.Capacitor = capacitorMock({
      Plugins: {
        Filesystem: {
          stat: () => Promise.resolve({ mtime: 2000 }),
          readFile: () => {
            readFileCallCount++;
            return Promise.resolve({ data: exportJson });
          },
        },
      },
    });
    // install() itself already does one "check once on initial load" (real Android
    // app-start behavior) — don't also call readAndroidMirrorFileIfNewer() explicitly
    // here, that would double-count the first read.
    win.PCC.dataMirror.install();
    await flush();
    assert.strictEqual(readFileCallCount, 1);

    await win.PCC.dataMirror.readAndroidMirrorFileIfNewer();
    await flush();
    assert.strictEqual(readFileCallCount, 1, "a second check at the same mtime must not re-read the file");
  });

  await check("readAndroidMirrorFileIfNewer() DOES re-read when the file's mtime has advanced", async () => {
    const win = freshWindow();
    await flush();
    enableMirror(win);

    const exportJson = await win.PCC.store.buildExportJson();
    let mtime = 3000;
    let readFileCallCount = 0;
    win.Capacitor = capacitorMock({
      Plugins: {
        Filesystem: {
          stat: () => Promise.resolve({ mtime: mtime }),
          readFile: () => {
            readFileCallCount++;
            return Promise.resolve({ data: exportJson });
          },
        },
      },
    });
    // As above: install() itself already does one initial-load check.
    win.PCC.dataMirror.install();
    await flush();
    assert.strictEqual(readFileCallCount, 1);

    mtime = 4000; // a newer snapshot has since synced in
    await win.PCC.dataMirror.readAndroidMirrorFileIfNewer();
    await flush();
    assert.strictEqual(readFileCallCount, 2);
  });

  await check("route smoke test: dashboard/myWork/actionCentre/portfolio/settings all still render cleanly after Phase 4's changes", async () => {
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
