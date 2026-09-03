// Daily-Use Audit, Phase 1 — regression tests for two real bugs in schedule.js's own
// forms: (1) manually adding a circular relationship (A -> B -> C -> A) was silently
// accepted, only caught later and silently when "Calculate Schedule" ran; (2) Activity
// Duration had no floor at all, so a negative value saved without any warning and would
// corrupt CPM output downstream. Neither Activities nor Relationships had a dedicated
// test file before this, so this is scoped narrowly to the two fixes, not a full
// Schedule module test suite.
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
// schedule.js is React-migrated: form fields are React-controlled, so a raw `.value =`
// assignment doesn't reliably reach onChange — see CLAUDE.md's React migration notes.
function setReactSelectValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}
function setReactInputValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
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

  var projectId, scheduleId, actA, actB, actC;
  await check("seed a project, schedule, three activities (A->B, B->C already linked)", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Schedule Validation Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(s);
      scheduleId = s.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Activity A", activity_type: "task", duration: 3 });
      var b = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Activity B", activity_type: "task", duration: 3 });
      var c = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Activity C", activity_type: "task", duration: 3 });
      d.activities.push(a, b, c);
      actA = a.id;
      actB = b.id;
      actC = c.id;
      d.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: actA, successor_id: actB }));
      d.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: actB, successor_id: actC }));
    });
    assert.strictEqual(win.PCC.store.get().relationships.length, 2);
  });

  await check("manually adding C -> A (which would close the A->B->C->A loop) is rejected with a clear error, not silently saved", async () => {
    win.PCC.router.go("schedule");
    await flush();
    var relTabBtn = findButtonByText(dom, "Relationships");
    relTabBtn.click();
    await flush();
    findButtonByText(dom, "+ Add Relationship").click();
    await flush();

    var predSelect = outlet().querySelector("#relfield-predecessor_id");
    var succSelect = outlet().querySelector("#relfield-successor_id");
    assert.ok(predSelect && succSelect, "relationship form fields not found");
    setReactSelectValue(win, predSelect, actC);
    setReactSelectValue(win, succSelect, actA);
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    assert.strictEqual(win.PCC.store.get().relationships.length, 2, "the cyclic relationship must not be saved");
    assert.ok(outlet().textContent.indexOf("circular dependency") !== -1, "no circular-dependency error shown to the user");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a non-cyclic relationship (A -> C directly, a redundant but valid path) is still accepted", async () => {
    var predSelect = outlet().querySelector("#relfield-predecessor_id");
    var succSelect = outlet().querySelector("#relfield-successor_id");
    setReactSelectValue(win, predSelect, actA);
    setReactSelectValue(win, succSelect, actC);
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    assert.strictEqual(win.PCC.store.get().relationships.length, 3, "a genuinely valid (non-cyclic) relationship must still save");
  });

  await check("saving an activity with a negative Duration is rejected with a clear error, not silently saved", async () => {
    win.PCC.router.go("schedule");
    await flush();
    var activitiesTabBtn = findButtonByText(dom, "Activities");
    activitiesTabBtn.click();
    await flush();
    var editButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Edit");
    // Open via the row menu if "Edit" isn't a direct button (fallback to the "..." menu).
    if (editButtons.length === 0) {
      var menuBtns = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "⋯");
      if (menuBtns.length) menuBtns[0].click();
      await flush();
      editButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Edit");
    }
    assert.ok(editButtons.length > 0, "no Edit button found for an activity");
    editButtons[0].click();
    await flush();

    var durationInput = outlet().querySelector("#actfield-duration");
    assert.ok(durationInput, "duration field not found");
    assert.strictEqual(durationInput.min, "0", "duration input should have a min=0 browser-level hint");
    setReactInputValue(win, durationInput, "-5");
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    assert.ok(outlet().textContent.indexOf("Duration can't be negative") !== -1, "no negative-duration error shown to the user");
    var data = win.PCC.store.get();
    var anyNegative = data.activities.some((a) => a.duration != null && a.duration < 0);
    assert.strictEqual(anyNegative, false, "no activity should have a negative duration saved");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
