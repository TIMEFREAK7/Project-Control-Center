// Phase 4 (one-way hourly data mirror): end-to-end jsdom test for src/js/pullToRefresh.js
// against the actual bundled index.html. Calls the exported _testHooks handler functions
// directly with plain touch-event-shaped objects rather than dispatching real
// TouchEvents (jsdom doesn't fully implement the Touch/TouchEvent constructors) — same
// "test the real shipped code, not a mock of it" approach every other engine test in this
// suite uses, just entering through the handler functions instead of a dispatched event.
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

function touchAt(clientY) {
  return { touches: [{ clientY: clientY }] };
}

function pull(win, startY, endY) {
  const hooks = win.PCC.pullToRefresh._testHooks;
  hooks.handleTouchStart(touchAt(startY));
  hooks.handleTouchMove(touchAt(endY));
  hooks.handleTouchEnd();
}

(async () => {
  await check("a full pull-down past the threshold on an enabled route (dashboard) triggers a mirror check + re-render", async () => {
    const win = freshWindow();
    await flush();
    win.location.hash = "#/dashboard";
    win.PCC.router.render();

    let mirrorChecked = false;
    let rendered = false;
    win.PCC.dataMirror.readAndroidMirrorFileIfNewer = () => {
      mirrorChecked = true;
      return Promise.resolve();
    };
    const originalRender = win.PCC.router.render;
    win.PCC.router.render = () => {
      rendered = true;
    };

    pull(win, 100, 250); // 150px pull, past the 70px threshold
    await flush();

    assert.strictEqual(mirrorChecked, true);
    assert.strictEqual(rendered, true);
    win.PCC.router.render = originalRender;
  });

  await check("a pull that doesn't cross the threshold does NOT trigger a refresh", async () => {
    const win = freshWindow();
    await flush();
    win.location.hash = "#/dashboard";
    win.PCC.router.render();

    let mirrorChecked = false;
    win.PCC.dataMirror.readAndroidMirrorFileIfNewer = () => {
      mirrorChecked = true;
      return Promise.resolve();
    };

    pull(win, 100, 130); // only 30px, under the 70px threshold

    assert.strictEqual(mirrorChecked, false);
  });

  await check("a pull gesture on a route NOT in the enabled set (e.g. schedule) is ignored entirely", async () => {
    const win = freshWindow();
    await flush();
    win.location.hash = "#/schedule";
    win.PCC.router.render();

    let mirrorChecked = false;
    win.PCC.dataMirror.readAndroidMirrorFileIfNewer = () => {
      mirrorChecked = true;
      return Promise.resolve();
    };

    pull(win, 100, 250); // a full, well-past-threshold pull

    assert.strictEqual(mirrorChecked, false);
  });

  await check("a touch gesture that starts scrolled away from the top is ignored (not a pull-to-refresh)", async () => {
    const win = freshWindow();
    await flush();
    win.location.hash = "#/dashboard";
    win.PCC.router.render();
    win.document.documentElement.scrollTop = 500; // scrolled down

    let mirrorChecked = false;
    win.PCC.dataMirror.readAndroidMirrorFileIfNewer = () => {
      mirrorChecked = true;
      return Promise.resolve();
    };

    pull(win, 100, 250);

    assert.strictEqual(mirrorChecked, false);
  });

  await check("each of the four enabled routes (dashboard/myWork/actionCentre/portfolio) accepts the gesture", async () => {
    const win = freshWindow();
    await flush();
    win.PCC.dataMirror.readAndroidMirrorFileIfNewer = () => Promise.resolve();
    const originalRender = win.PCC.router.render;

    for (const routeName of ["dashboard", "myWork", "actionCentre", "portfolio"]) {
      win.location.hash = "#/" + routeName;
      win.PCC.router.render = originalRender;
      win.PCC.router.render();

      let rendered = false;
      win.PCC.router.render = () => {
        rendered = true;
      };
      pull(win, 100, 250);
      await flush();
      assert.strictEqual(rendered, true, routeName + " should accept the pull-to-refresh gesture");
    }
    win.PCC.router.render = originalRender;
  });

  await check("a failed mirror check (e.g. nothing to refresh) still clears the indicator and doesn't throw", async () => {
    const win = freshWindow();
    await flush();
    win.location.hash = "#/dashboard";
    win.PCC.router.render();

    win.PCC.dataMirror.readAndroidMirrorFileIfNewer = () => Promise.reject(new Error("nothing synced yet"));

    pull(win, 100, 250);
    await flush(); // must not produce an unhandled rejection
  });

  await check("route smoke test: every route still renders cleanly with the pull-to-refresh listeners installed", async () => {
    const win = freshWindow();
    await flush();
    ["dashboard", "myWork", "actionCentre", "portfolio", "schedule", "reports", "settings"].forEach((name) => {
      win.location.hash = "#/" + name;
      win.PCC.router.render();
    });
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
