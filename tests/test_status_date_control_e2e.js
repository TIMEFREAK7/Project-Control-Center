// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 20 (PCC Evolution
// Roadmap, Tier F: Status-Date Control — 2026-08-20). A fresh inspection found almost
// everything the spec asks for already existed under different names: the Status Date
// itself (schedule.data_date, already the live reference point for CPM reforecasting,
// delayed-activity detection, and reports), Original Plan vs Forecast (plannedProjectFinish
// vs projectFinish in scheduleCpmEngine.js), Baseline vs Current (scheduleBaselineEngine.js,
// Gate 4/5), and Critical/Near-Critical/Overdue (already in Executive Center). The genuine
// gaps closed here: a per-activity in-progress/not-started count, a remaining-duration
// rollup (with a data-quality flag when in-progress activities are missing it), and a
// per-activity "forecast to finish late" list — distinct from "overdue," which compares
// against the reference date rather than each activity's own planned_finish. Float Changes/
// Milestone Variance point at the existing Baselines tab (which already computes both via
// scheduleBaselineEngine.js) rather than duplicating that async IndexedDB-backed UI a
// second time inside Executive Center.
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

function diffDays(fromIso, toIso) {
  return Math.round((new Date(toIso + "T00:00:00Z") - new Date(fromIso + "T00:00:00Z")) / 86400000);
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.schedule.viewBaselines, "schedule.js's new viewBaselines() must be bundled");
  });

  // ---- Seed: one project/schedule, one completed, two in-progress (one missing
  // remaining_duration), one not-started activity whose data_date-anchored forecast
  // finish lands well after its own planned_finish (forecast late) but still before the
  // reference date itself (so it's NOT also flagged "delayed" — a genuinely distinct
  // metric from "overdue"). ----
  let projectId, scheduleId, lateActivityId;
  await check("seed a schedule with completed / in-progress / not-started activities, one forecast-late", () => {
    win.PCC.store.update(function (d) {
      var project = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      d.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active", data_date: "2026-06-01" });
      d.schedules.push(schedule);
      scheduleId = schedule.id;

      d.activities.push(win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Site Mobilization",
        activity_type: "task", status: "complete", duration: 5,
        actual_start: "2026-01-01", actual_finish: "2026-01-05",
      }));
      d.activities.push(win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Foundation Pour",
        activity_type: "task", status: "in_progress", duration: 10,
        actual_start: "2026-05-01", remaining_duration: 3,
      }));
      d.activities.push(win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Structural Steel",
        activity_type: "task", status: "in_progress", duration: 10,
        actual_start: "2026-05-15", // remaining_duration deliberately NOT set
      }));
      var lateActivity = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Roofing",
        activity_type: "task", status: "not_started", duration: 5,
        planned_start: "2026-01-01", planned_finish: "2026-01-10",
      });
      d.activities.push(lateActivity);
      lateActivityId = lateActivity.id;
    });
    assert.ok(projectId && scheduleId && lateActivityId);
  });

  await check("Executive Center's STATUS DATE section shows the correct Completed/In Progress/Not Started/Remaining Duration counts", async () => {
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    await flush();
    // UI/UX Overhaul Gate 5: STATUS DATE now lives on the Schedule sub-tab. Every check
    // after this one stays on the Schedule sub-tab too, since nothing here navigates away.
    var scheduleTab = Array.from(outlet().querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Schedule");
    assert.ok(scheduleTab, "Schedule sub-tab not found");
    scheduleTab.click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("STATUS DATE (2026-06-01)") !== -1, "section header must show the schedule's own data_date as the status date");

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    function kpiValue(label) {
      var card = kpiCards.find((c) => c.textContent.indexOf(label) !== -1);
      return card ? card.querySelector(".kpi-card__value").textContent : undefined;
    }
    assert.strictEqual(kpiValue("Completed"), "1");
    assert.strictEqual(kpiValue("In Progress"), "2");
    assert.strictEqual(kpiValue("Not Started"), "1");
    assert.strictEqual(kpiValue("Remaining Duration"), "8d", "3 (Foundation Pour) + 5 (Roofing, full duration since not started)");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Forecast Late list shows Roofing with the correct variance, and it's NOT also counted as overdue/delayed", () => {
    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    var lateCard = kpiCards.find((c) => c.textContent.indexOf("Forecast Late") !== -1);
    assert.strictEqual(lateCard.querySelector(".kpi-card__value").textContent, "1");

    var text = outlet().textContent;
    assert.ok(text.indexOf("Forecast to Finish Late (1)") !== -1);
    // CPM has no predecessors for Roofing, so ES anchors at data_date (2026-06-01);
    // EF = ES + duration (5) = 2026-06-06, exclusive-end convention like every other
    // engine in this app.
    var expectedForecastFinish = "2026-06-06";
    var expectedVariance = diffDays("2026-01-10", expectedForecastFinish);
    assert.ok(
      text.indexOf("Roofing — planned 2026-01-10, forecast " + expectedForecastFinish + " (+" + expectedVariance + "d)") !== -1,
      "expected exact planned/forecast/variance text not found; actual text: " + text.slice(text.indexOf("Forecast to Finish Late"), text.indexOf("Forecast to Finish Late") + 200)
    );

    var delayedCard = kpiCards.find((c) => c.textContent.indexOf("Delayed Activities") !== -1);
    assert.strictEqual(delayedCard.querySelector(".kpi-card__value").textContent, "0", "forecast-late (finishing after data_date) is distinct from overdue (finishing before it)");
  });

  await check("a data-quality note appears for the in-progress activity missing Remaining Duration", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("1 in-progress activity has no Remaining Duration set") !== -1);
  });

  await check("with no baseline captured yet, the panel says so and offers no misleading data", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("No baseline captured for this schedule yet") !== -1);
  });

  await check("capturing a baseline updates the panel's count and the View Baselines button lands on the Baselines tab", async () => {
    win.PCC.store.update(function (d) {
      d.schedule_baselines.push(win.PCC.store.newScheduleBaseline({ schedule_id: scheduleId, project_id: projectId, name: "Initial Baseline" }));
    });
    // A plain render() remounts Executive Center fresh, resetting to the Summary
    // sub-tab — re-navigate to the Schedule sub-tab to see the updated panel.
    win.PCC.router.render();
    await flush();
    var scheduleTab = Array.from(outlet().querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Schedule");
    assert.ok(scheduleTab, "Schedule sub-tab not found");
    scheduleTab.click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("1 captured baseline on the Baselines tab") !== -1);

    var viewBtn = findButtonByText(dom, "View Baselines");
    assert.ok(viewBtn, "View Baselines button not found");
    viewBtn.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    var activeTabBtn = Array.from(outlet().querySelectorAll(".tab-btn--active")).find((b) => b.textContent.trim() === "Baselines");
    assert.ok(activeTabBtn, "Baselines tab should be the active tab after navigating");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back beyond the one deliberate baseline-metadata seed above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.activities.length, 4);
    assert.strictEqual(data.schedule_baselines.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 20 (Status-Date Control)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
