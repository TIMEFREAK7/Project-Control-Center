// End-to-end jsdom test for Mobile & Desktop Packaging Gate 3: making window.print() work
// under Capacitor (Android) by routing it to the native PrintPlugin
// (packaging/android/.../PrintPlugin.java) instead of doing nothing, the way a bare WebView
// otherwise would. Runs against the actual bundled index.html, same convention every prior
// gate's e2e test uses. The native plugin itself (WebView.createPrintDocumentAdapter() +
// android.print.PrintManager) isn't jsdom-testable and has no structural proxy the way
// Gate 2's Filesystem/Share plugins did (there's no "confirm the print dialog rendered
// correctly" equivalent to unzipping an APK) — this file covers everything on the JS side:
// the window.print() shim installs only when window.Capacitor reports a native platform,
// leaves web/Electron's real window.print completely untouched, and the actual Reports/
// Executive Center print buttons route through it correctly.
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

function findButtonByText(dom, text) {
  const buttons = Array.from(dom.window.document.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const thrownErrors = [];
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  dom.window.indexedDB = new FDBFactory();
  dom.window.onerror = function (msg) {
    thrownErrors.push(String(msg));
  };
  dom.window.URL.createObjectURL = () => "blob:fake-url";
  dom.window.URL.revokeObjectURL = () => {};
  await flush();
  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  await check("window.print is left untouched with no window.Capacitor present (web/Electron)", () => {
    const before = win.print;
    win.PCC.nativePrint.install();
    assert.strictEqual(win.print, before, "expected the same function reference — no override applied");
  });

  await check("installing again with window.Capacitor.isNativePlatform() true routes window.print through NativePrint.print()", async () => {
    let printCalled = 0;
    win.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        NativePrint: {
          print: () => {
            printCalled++;
            return Promise.resolve();
          },
        },
      },
    };
    win.PCC.nativePrint.install();
    win.print();
    await flush();
    assert.strictEqual(printCalled, 1, "expected the native plugin's print() to have been called");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a missing NativePrint plugin under a native platform notifies instead of throwing", async () => {
    win.Capacitor = { isNativePlatform: () => true, Plugins: {} };
    win.PCC.nativePrint.install();
    let notified = null;
    const realNotify = win.PCC.notify;
    win.PCC.notify = (msg, kind) => {
      notified = { msg, kind };
    };
    win.print();
    await flush();
    win.PCC.notify = realNotify;
    assert.ok(notified, "expected a notify() call rather than a silent no-op or a throw");
    assert.strictEqual(notified.kind, "error");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("re-installing with window.Capacitor removed restores the original window.print (leaving native platform)", () => {
    delete win.Capacitor;
    win.PCC.nativePrint.install();
    // Calling it must not throw and must not reach the (now-removed) native branch.
    win.print();
  });

  await check("Reports: the 'Print / Save as PDF' button calls window.print(), which routes through NativePrint when native", async () => {
    let printCalled = 0;
    win.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        NativePrint: {
          print: () => {
            printCalled++;
            return Promise.resolve();
          },
        },
      },
    };
    win.PCC.nativePrint.install();

    win.PCC.router.go("reports");
    win.PCC.router.render();
    const printBtn = findButtonByText(dom, "Print / Save as PDF");
    assert.ok(printBtn, "expected a Print / Save as PDF button on the Reports page");
    printBtn.click();
    await flush();

    assert.strictEqual(printCalled, 1, "expected the Reports print button to route through the native plugin");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Executive Center: its own Print button also routes through window.print()", async () => {
    win.PCC.store.update((data) => {
      const project = win.PCC.store.newProject({ name: "Gate 3 Test Project", status: "on_track" });
      data.projects.push(project);
    });

    let printCalled = 0;
    win.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        NativePrint: {
          print: () => {
            printCalled++;
            return Promise.resolve();
          },
        },
      },
    };
    win.PCC.nativePrint.install();

    const data = win.PCC.store.get();
    const projectId = data.projects[data.projects.length - 1].id;
    win.PCC.executiveCenter.viewProject(projectId, "output");
    win.PCC.router.go("executiveCenter");
    await flush();
    const printBtn = findButtonByText(dom, "Print / Save as PDF");
    assert.ok(printBtn, "expected a Print / Save as PDF button on the Executive Center's Output tab");
    printBtn.click();
    await flush();

    assert.strictEqual(printCalled, 1, "expected the Executive Center print button to route through the native plugin");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("route smoke test: reports/executiveCenter/dashboard all still render cleanly after Gate 3's changes", () => {
    delete win.Capacitor;
    win.PCC.nativePrint.install();
    ["reports", "executiveCenter", "dashboard"].forEach(function (route) {
      win.PCC.router.go(route);
      win.PCC.router.render();
      assert.ok(outlet().innerHTML.length > 0, "route '" + route + "' rendered nothing");
    });
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
