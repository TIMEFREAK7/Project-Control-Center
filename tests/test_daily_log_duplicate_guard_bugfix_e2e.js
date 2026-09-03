// Daily-Use Audit, Phase 1 — regression test for a real bug: dailyLog.js's own subtitle
// claims "one entry per project per day," but nothing enforced it. An accidental
// double-click on "+ Add Daily Log" (a near-daily action for a Coordinator) silently
// created two entries for the same project and date. Scoped narrowly to this fix.
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
    thrownErrors.push(msg);
  };

  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  var projectId;
  await check("seed a project", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Daily Log Duplicate Test Project" });
      d.projects.push(p);
      projectId = p.id;
    });
    assert.ok(projectId);
  });

  await check("a first, genuinely new entry for a date saves immediately (no prior entry to collide with)", async () => {
    win.PCC.router.go("dailylog");
    // dailylog.js is a React-migrated page — a click's state update commits
    // asynchronously (see CLAUDE.md's React migration notes), so await flush() before
    // reading the resulting DOM.
    await flush();
    findButtonByText(dom, "+ Add Daily Log").click();
    await flush();
    var dateInput = outlet().querySelector("#dlfield-log_date");
    dateInput.value = "2026-08-21";
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.daily_logs.length, 1, "a genuinely new project/date combination must save on the first submit");
    assert.strictEqual(data.daily_logs[0].log_date, "2026-08-21");
  });

  await check("double-clicking '+ Add Daily Log' and submitting twice for the same date does NOT create a duplicate, but a second confirmed submit does add one", async () => {
    win.PCC.router.go("dailylog");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "+ Add Daily Log").click();
    await flush();
    var dateInput = outlet().querySelector("#dlfield-log_date");
    dateInput.value = "2026-08-21"; // same date as the entry already saved above
    var form = outlet().querySelector("form");

    // First submit for a date that already has an entry: must warn, not save.
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.strictEqual(win.PCC.store.get().daily_logs.length, 1, "a duplicate project/date must not be saved on the first submit");
    assert.ok(outlet().textContent.indexOf("already exists") !== -1, "no duplicate warning shown to the user");

    // Second submit (the user clicking "Add Log" again, having seen the warning):
    // this is a deliberate confirmation, so it should now go through.
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.strictEqual(win.PCC.store.get().daily_logs.length, 2, "an explicitly confirmed second entry for the same date must be allowed");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("changing the date after seeing the warning resets it — a genuinely different date doesn't need re-confirmation", async () => {
    win.PCC.router.go("dailylog");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "+ Add Daily Log").click();
    await flush();
    var dateInput = outlet().querySelector("#dlfield-log_date");
    dateInput.value = "2026-08-21"; // duplicate — triggers the warning
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.strictEqual(win.PCC.store.get().daily_logs.length, 2, "still just the 2 from before — this submit should have warned, not saved");

    // Now change to a genuinely new date and submit once — should save immediately,
    // not require a second confirming click, since the warning state must reset.
    dateInput.value = "2026-08-22";
    dateInput.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush();
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    var data = win.PCC.store.get();
    assert.strictEqual(data.daily_logs.length, 3, "a genuinely new date must save on its own first submit, not require confirming a stale warning");
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
