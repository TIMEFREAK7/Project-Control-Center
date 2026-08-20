// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 21 (PCC Evolution
// Roadmap, Tier F: Status-Date Reforecasting — 2026-08-20). Inspection found the CPM engine
// already did most of status-date reforecasting (actuals-anchored ES/EF, held-fixed completed
// dates) — the two genuine gaps closed here are out-of-sequence (OOS) progress detection (an
// activity with actual progress recorded before its predecessor logic would have allowed it to
// start) and a real, user-selectable Retained Logic calculation mode alongside the existing
// Progress Override behavior (the only mode that existed before this gate, kept as the default
// so every pre-existing schedule calculates exactly as it always did). The pure engine math is
// covered in test_schedule_cpm_engine.js; this file covers the schedule.js UI (calculation-mode
// selector, OOS badges, Activity Detail Panel) and Executive Center's Status Date panel surfacing
// the same OOS signal.
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

  await check("app boots on the bundled index.html without throwing, and CALCULATION_MODES is bundled", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.deepStrictEqual(Array.from(win.PCC.store.CALCULATION_MODES), ["progress_override", "retained_logic"]);
  });

  // ---- Seed: A (not started) -> B (in-progress, started well before A would permit —
  // out of sequence) via FS. ----
  let projectId, scheduleId, activityAId, activityBId;
  await check("seed a schedule with an out-of-sequence activity (B started before A's predecessor logic would allow)", () => {
    win.PCC.store.update(function (d) {
      var project = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      d.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active", data_date: "2026-06-01" });
      d.schedules.push(schedule);
      scheduleId = schedule.id;
      assert.strictEqual(schedule.calculation_mode, "progress_override", "new schedules default to progress_override");

      var activityA = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Foundation",
        activity_type: "task", status: "not_started", duration: 10,
      });
      d.activities.push(activityA);
      activityAId = activityA.id;

      var activityB = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Framing",
        activity_type: "task", status: "in_progress", duration: 5,
        actual_start: "2026-01-03", remaining_duration: 5,
      });
      d.activities.push(activityB);
      activityBId = activityB.id;

      d.relationships.push(win.PCC.store.newRelationship({
        schedule_id: scheduleId, predecessor_id: activityAId, successor_id: activityBId, type: "FS", lag: 0,
      }));
    });
    assert.ok(projectId && scheduleId && activityAId && activityBId);
  });

  await check("Calculate Schedule (progress_override, the default) flags Framing out of sequence but keeps its actual-dates forecast", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    // Land directly on this schedule/activity via the same navigation hook Executive
    // Center's own "View Activity" links already use.
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityBId);
    win.PCC.router.render();

    var calcBtn = findButtonByText(dom, "Calculate Schedule");
    assert.ok(calcBtn, "Calculate Schedule button not found");
    calcBtn.click();
    win.PCC.router.render();

    var data = win.PCC.store.get();
    var b = data.activities.find((a) => a.id === activityBId);
    assert.strictEqual(b.is_out_of_sequence, true);
    assert.strictEqual(b.early_start, "2026-06-01", "progress_override: forecast still anchored on B's own actual/data-date, ignoring A's logic");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Activities tab list shows an 'Out of Sequence' badge on Framing", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Out of Sequence") !== -1);
  });

  await check("the Activity Detail Panel reports Out of Sequence: Yes for Framing", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityBId);
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Yes — actual progress preceded predecessor logic") !== -1);
  });

  await check("switching the schedule to Retained Logic mode and recalculating pushes Framing's forecast to respect Foundation's logic", () => {
    // Written directly via the store rather than driving the schedule-edit form's DOM,
    // since the calculation_mode <select>'s own render/submit wiring is simple enough
    // (same pattern as every other <select> field on this form) that this test's value is
    // in proving the ENGINE + UI SURFACING behave correctly once the mode is set, not in
    // re-testing generic form plumbing this app already relies on everywhere.
    win.PCC.store.update(function (d) {
      var schedule = d.schedules.find((s) => s.id === scheduleId);
      schedule.calculation_mode = "retained_logic";
    });
    win.PCC.router.render();

    var calcBtn = findButtonByText(dom, "Calculate Schedule");
    calcBtn.click();
    win.PCC.router.render();

    var data = win.PCC.store.get();
    var a = data.activities.find((x) => x.id === activityAId);
    var b = data.activities.find((x) => x.id === activityBId);
    assert.strictEqual(b.is_out_of_sequence, true, "still flagged — the signal doesn't change, only the forecast treatment does");
    assert.strictEqual(b.early_start, a.early_finish, "retained_logic: B's forecast start is pushed to A's forecast finish");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Executive Center's STATUS DATE panel shows the Out of Sequence KPI and lists Framing under the active mode", () => {
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();

    var text = outlet().textContent;
    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    var oosCard = kpiCards.find((c) => c.textContent.indexOf("Out of Sequence") !== -1);
    assert.ok(oosCard, "Out of Sequence KPI card not found");
    assert.strictEqual(oosCard.querySelector(".kpi-card__value").textContent, "1");

    assert.ok(text.indexOf("Out of Sequence (1) — Retained Logic mode") !== -1, "detail panel must reflect the schedule's current mode");
    assert.ok(text.indexOf("Framing") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("switching back to Progress Override mode updates Executive Center's panel without a Calculate Schedule click (live recompute)", () => {
    win.PCC.store.update(function (d) {
      var schedule = d.schedules.find((s) => s.id === scheduleId);
      schedule.calculation_mode = "progress_override";
    });
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Out of Sequence (1) — Progress Override mode") !== -1);
  });

  await check("this gate writes nothing back beyond the deliberate seed/recalculation above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.activities.length, 2);
    assert.strictEqual(data.relationships.length, 1);
    assert.strictEqual(data.schedules.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 21 (Status-Date Reforecasting)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
