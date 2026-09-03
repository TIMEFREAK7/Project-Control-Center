// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 22 (PCC Evolution
// Roadmap, Tier F: Baseline & Schedule Revision Control — 2026-08-20). Inspection found the
// core baseline machinery already fully built (scheduleBaselineEngine.js/
// scheduleBaselineStore.js/the Baselines tab, Gate 4/5) — the genuine gaps closed here: baseline
// rename, an "Official Baseline" designation (at most one per project, locked against deletion,
// and driving Executive Center's Schedule Variance instead of the plain planned_finish-based
// figure), auto-superseding a project's prior active schedule revision on reimport, and retiring
// the dead/disconnected schedule.is_baseline checkbox. Aditya confirmed both the fuller options
// via AskUserQuestion: auto-supersede should be automatic (not manual), and the Official
// Baseline designation should actually drive variance elsewhere, not just live as a label.
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
function findButtonsByText(dom, text) {
  const buttons = Array.from(dom.window.document.querySelectorAll("button"));
  return buttons.filter((b) => b.textContent.trim() === text);
}
// schedule.js is React-migrated: an inline rename input is React-controlled, so a raw
// `.value =` assignment doesn't reliably reach onChange (React patches the native
// setter to track "last known value" — see CLAUDE.md's React migration notes).
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

  await check("app boots on the bundled index.html without throwing, and is_baseline is gone from newSchedule()", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    var s = win.PCC.store.newSchedule({ project_id: "x", name: "y" });
    assert.ok(!("is_baseline" in s), "is_baseline was dead, disconnected UI decoration — retired in Gate 22");
  });

  // ---- Seed: one project, one active schedule with two activities (one finishing
  // later than the other, so the project finish is unambiguous), planned_finish set so
  // a pre-Gate-22 (planned_finish-based) variance figure is well-defined too. ----
  let projectId, scheduleId, activityId;
  await check("seed a project, active schedule, and two activities", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-01-01" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var a = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Foundation",
        activity_type: "task", duration: 10, planned_start: "2026-01-01", planned_finish: "2026-01-11",
      });
      data.activities.push(a);
      activityId = a.id;
    });
    assert.ok(projectId && scheduleId && activityId);
  });

  await check("navigate to the schedule route and Save Baseline captures a project finish at capture time", async () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var saveBtn = findButtonByText(dom, "Save Baseline");
    assert.ok(saveBtn, "Save Baseline button not found");
    saveBtn.click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedule_baselines.length, 1);
    var b = data.schedule_baselines[0];
    assert.strictEqual(b.is_official, false, "a newly captured baseline is never automatically official");
    assert.ok(b.baseline_project_finish, "baseline_project_finish must be computed synchronously at capture time");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Baselines tab shows the captured project finish in the row's meta line", async () => {
    var baselinesTabBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Baselines");
    baselinesTabBtn.click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("project finish at capture") !== -1);
  });

  await check("renaming a baseline through the inline Rename control persists the new name and escapes it against HTML injection", async () => {
    var renameBtn = findButtonByText(dom, "Rename");
    assert.ok(renameBtn, "Rename button not found");
    renameBtn.click();
    await flush();

    var input = outlet().querySelector("input[type='text']");
    assert.ok(input, "expected an inline rename text input");
    setReactInputValue(win, input, "<img src=x onerror=alert(1)>Rev 0 Baseline");
    var saveBtn = findButtonByText(dom, "Save");
    assert.ok(saveBtn, "inline rename Save button not found");
    saveBtn.click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedule_baselines[0].name, "<img src=x onerror=alert(1)>Rev 0 Baseline", "the raw name is stored as typed");
    assert.strictEqual(outlet().querySelectorAll("img").length, 0, "the malicious markup must render as escaped text, not a live <img> element");
    assert.ok(outlet().textContent.indexOf("<img src=x onerror=alert(1)>Rev 0 Baseline") !== -1, "the escaped name should still be visible as plain text");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("marking a baseline Official shows the badge, flips the button, disables Delete, and toasts the correct (non-inverted) message", async () => {
    var officialBtn = findButtonByText(dom, "Mark Official");
    assert.ok(officialBtn, "Mark Official button not found");
    officialBtn.click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedule_baselines[0].is_official, true);

    var text = outlet().textContent;
    assert.ok(text.indexOf("Official") !== -1);
    assert.ok(findButtonByText(dom, "Unmark Official"), "button should now read Unmark Official");

    var deleteBtn = findButtonByText(dom, "Delete");
    assert.strictEqual(deleteBtn.disabled, true, "Delete must be locked while the baseline is Official");

    // Regression: the notify() call reads b.is_official AFTER store.update() has
    // already mutated that same object in place — reading it post-mutation would
    // report the opposite of what just happened ("unmarked" right after marking).
    var toastText = win.document.getElementById("toast-stack").textContent;
    assert.ok(toastText.indexOf("Baseline marked Official") !== -1, "expected the 'marked Official' toast, not an inverted 'unmarked' one; got: " + toastText);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("unmarking Official toasts the correct message too (not stuck on 'marked')", async () => {
    var unmarkBtn = findButtonByText(dom, "Unmark Official");
    unmarkBtn.click();
    await flush();
    var toastText = win.document.getElementById("toast-stack").textContent;
    assert.ok(toastText.indexOf("Baseline unmarked as Official") !== -1, "expected the 'unmarked' toast; got: " + toastText);

    // Restore Official for the subsequent checks, which assume it's set.
    findButtonByText(dom, "Mark Official").click();
    await flush();
    assert.strictEqual(win.PCC.store.get().schedule_baselines[0].is_official, true);
  });

  await check("Executive Center's Schedule Variance now measures against the Official Baseline, not planned_finish", async () => {
    // Extend duration (which genuinely shifts the CPM engine's own computed
    // project finish, unlike planned_finish alone — a not-started activity's
    // early_finish is ES+duration, not derived from planned_finish at all) to
    // 2026-02-01, AND separately change planned_finish to a different, unrelated
    // date (2026-01-20). This makes the two possible variance sources disagree:
    // the OLD (pre-Gate-22) planned_finish-based figure would be cpm.projectFinish
    // (2026-02-01) minus the CURRENT planned_finish (2026-01-20) = +12d, while the
    // Official Baseline's captured finish (2026-01-11, frozen at capture time,
    // before either change) gives +21d. Asserting +21d proves the KPI is reading
    // the baseline, not silently still reading current planned_finish.
    win.PCC.store.update(function (d) {
      var a = d.activities.find((x) => x.id === activityId);
      a.duration = 31;
      a.planned_finish = "2026-01-20";
    });

    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    await flush();
    // UI/UX Overhaul Gate 5: Schedule Variance now lives on the Schedule sub-tab.
    var scheduleTab = Array.from(outlet().querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Schedule");
    assert.ok(scheduleTab, "Schedule sub-tab not found");
    scheduleTab.click();
    await flush();

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    var varianceCard = kpiCards.find((c) => c.textContent.indexOf("Schedule Variance") !== -1);
    assert.ok(varianceCard, "Schedule Variance KPI card not found");
    assert.strictEqual(varianceCard.querySelector(".kpi-card__value").textContent, "+21d", "+21d (vs the Official Baseline) proves this, not +12d (vs current planned_finish)");

    var text = outlet().textContent;
    assert.ok(text.indexOf("Schedule Variance measured against the Official Baseline") !== -1, "footnote must name the Official Baseline as the source");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("capturing and marking a second baseline Official un-marks the first (at most one Official per project)", async () => {
    win.PCC.router.go("schedule");
    var saveBtn = findButtonByText(dom, "Save Baseline");
    saveBtn.click();
    await flush();

    var baselinesTabBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Baselines");
    baselinesTabBtn.click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedule_baselines.length, 2);
    var secondBaselineId = data.schedule_baselines.find((b) => !b.is_official).id;

    var markOfficialBtns = findButtonsByText(dom, "Mark Official");
    assert.strictEqual(markOfficialBtns.length, 1, "exactly one baseline should still be markable (the non-official second one)");
    markOfficialBtns[0].click();
    await flush();

    data = win.PCC.store.get();
    var first = data.schedule_baselines.find((b) => b.id !== secondBaselineId);
    var second = data.schedule_baselines.find((b) => b.id === secondBaselineId);
    assert.strictEqual(first.is_official, false, "marking the second Official must unmark the first");
    assert.strictEqual(second.is_official, true);

    var deleteBtns = findButtonsByText(dom, "Delete");
    assert.strictEqual(deleteBtns.filter((b) => b.disabled).length, 1, "exactly one Delete button (the now-Official second baseline) should be locked");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Auto-supersede on reimport. commitImport() lives behind a real file-upload
  // flow (FileReader + XLSX parsing) that every import-adjacent test in this suite
  // bypasses in favor of mirroring the resulting store write directly (see
  // test_schedule_excel_editor_e2e.js's own "bypassing FileReader" precedent) — no test
  // in this codebase drives a real binary .xlsx through jsdom. This mirrors the exact
  // write commitImport() now performs (schedule.js, Gate 22): mark every "active"
  // schedule in the project "superseded" before pushing the new revision. ----
  await check("importing a new revision auto-supersedes the project's prior active schedule (mirroring commitImport()'s write)", () => {
    var dataBefore = win.PCC.store.get();
    assert.strictEqual(dataBefore.schedules.find((s) => s.id === scheduleId).status, "active", "the original schedule starts active");

    win.PCC.store.update(function (d) {
      d.schedules.forEach(function (s) {
        if (s.project_id === projectId && s.status === "active") s.status = "superseded";
      });
      var rev1 = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 1 Import", revision_number: 1, status: "active" });
      d.schedules.push(rev1);
    });

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedules.find((s) => s.id === scheduleId).status, "superseded", "the prior active revision must be auto-superseded");
    assert.strictEqual(data.schedules.filter((s) => s.project_id === projectId && s.status === "active").length, 1, "exactly the new revision should be active");
  });

  await check("draft/archived revisions are never auto-touched — only 'active' ones supersede", () => {
    win.PCC.store.update(function (d) {
      var draftSchedule = win.PCC.store.newSchedule({ project_id: projectId, name: "A draft, never imported over", status: "draft" });
      d.schedules.push(draftSchedule);
      // Same mirrored write as above, scoped to this project.
      d.schedules.forEach(function (s) {
        if (s.project_id === projectId && s.status === "active") s.status = "superseded";
      });
      var rev2 = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 2 Import", revision_number: 2, status: "active" });
      d.schedules.push(rev2);
    });

    var data = win.PCC.store.get();
    var draft = data.schedules.find((s) => s.name === "A draft, never imported over");
    assert.strictEqual(draft.status, "draft", "a draft schedule must never be auto-superseded");
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 22 (Baseline & Schedule Revision Control)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
