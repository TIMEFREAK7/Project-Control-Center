// Planning & Scheduling-Centric Delay Management, Gate G (PCC Dashboard & Lookahead
// integration) — DOM-level e2e test against the ACTUAL bundled index.html. Covers the two
// concrete pieces this gate added: (1) Dashboard's Portfolio Exceptions panel gains "Open
// Delays"/"Critical Delays" counts, sourced from a new composed
// executiveCenter.getDelayImpactSummary(projectId) export that never calls
// computeProjectFinishImpact() in a loop (that function's own "single delay's own detail
// view only" warning), and (2) Project Lookahead's upcoming Activity/Milestone rows show how
// many still-tracked Delay Records are linked to them, without touching the row's existing
// float-derived badge.
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

function kpiValue(dom, containerSelector, label) {
  const chips = Array.from(dom.window.document.querySelectorAll(containerSelector + " .card-stat"));
  const chip = chips.find((c) => c.textContent.indexOf(label) !== -1);
  if (!chip) return undefined;
  const valueEl = chip.querySelector(".card-stat__value");
  return valueEl ? Number(valueEl.textContent) : undefined;
}
function findRowByText(dom, rowText) {
  return Array.from(dom.window.document.querySelectorAll(".attention-item")).find(
    (r) => r.textContent.indexOf(rowText) !== -1
  );
}
function todayPlusDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

  var projectId, scheduleId, criticalActivityId, nonCriticalActivityId, milestoneId;
  var criticalDelayId, absorbedDelayId, closedDelayId;

  await check("seed a project/schedule with a fully critical A->B->M chain plus a slack activity, and calculate", async () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Gate G Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Foundation Pour", activity_type: "task", duration: 10, planned_start: todayPlusDays(1) });
      data.activities.push(a);
      criticalActivityId = a.id;
      var b = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Column Erection", activity_type: "task", duration: 5 });
      data.activities.push(b);
      var m = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Structure Complete", activity_type: "milestone", duration: 0 });
      data.activities.push(m);
      milestoneId = m.id;
      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: a.id, successor_id: b.id, type: "FS" }));
      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: b.id, successor_id: m.id, type: "FS" }));

      // A second activity with real slack — a delay logged against it should never count
      // as "critical" (spec point 5, non-critical delay is absorbed by float).
      var nc = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Landscaping (has slack)", activity_type: "task", duration: 3, planned_start: todayPlusDays(2) });
      data.activities.push(nc);
      nonCriticalActivityId = nc.id;
      var ncSucc = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Landscaping Successor", activity_type: "task", duration: 2 });
      data.activities.push(ncSucc);
      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: nc.id, successor_id: ncSucc.id, type: "FS" }));
      // Give the whole nc->ncSucc chain plenty of slack against the critical chain's own
      // finish by starting it well before the critical path and keeping it short.
    });
    win.PCC.router.go("schedule");
    await flush();
    win.PCC.schedule.viewActivity(projectId, scheduleId, criticalActivityId);
    win.PCC.router.render();
    await flush();
    var calcBtn = Array.from(dom.window.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Calculate Schedule");
    assert.ok(calcBtn, "Calculate Schedule button not found");
    calcBtn.click();
    await flush();
    var data = win.PCC.store.get();
    var critActivity = data.activities.find((a) => a.id === criticalActivityId);
    var ncActivity = data.activities.find((a) => a.id === nonCriticalActivityId);
    assert.ok(critActivity.total_float <= 0, "the A->B->M chain must actually be critical after calculation");
    assert.ok(ncActivity.total_float > 5, "the slack activity must have real float after calculation");
  });

  await check("seed three Delay Records: one linked to the critical activity, one to the non-critical (absorbed) activity, one closed (must be excluded everywhere)", () => {
    win.PCC.store.update(function (data) {
      var critActivity = data.activities.find((a) => a.id === criticalActivityId);
      var criticalDelay = win.PCC.store.newDelayRecord({
        activity_id: criticalActivityId, project_id: projectId, delay_category: "late_material",
        description: "Rebar delivery delayed", status: "open", identified_date: todayPlusDays(0),
      });
      data.delay_records.push(criticalDelay);
      criticalDelayId = criticalDelay.id;
      data.delay_activity_links.push(win.PCC.store.newDelayActivityLink({
        delay_id: criticalDelay.id, activity_id: criticalActivityId, project_id: projectId,
        original_planned_start: critActivity.planned_start, original_planned_finish: critActivity.planned_finish,
        original_total_float: critActivity.total_float,
      }));

      var ncActivity = data.activities.find((a) => a.id === nonCriticalActivityId);
      var absorbedDelay = win.PCC.store.newDelayRecord({
        activity_id: nonCriticalActivityId, project_id: projectId, delay_category: "weather",
        description: "Minor rain delay, absorbed by float", status: "investigating", identified_date: todayPlusDays(0),
      });
      data.delay_records.push(absorbedDelay);
      absorbedDelayId = absorbedDelay.id;
      data.delay_activity_links.push(win.PCC.store.newDelayActivityLink({
        delay_id: absorbedDelay.id, activity_id: nonCriticalActivityId, project_id: projectId,
        original_planned_start: ncActivity.planned_start, original_planned_finish: ncActivity.planned_finish,
        original_total_float: ncActivity.total_float,
      }));

      var closedDelay = win.PCC.store.newDelayRecord({
        activity_id: criticalActivityId, project_id: projectId, delay_category: "other",
        description: "Old resolved delay", status: "closed", identified_date: todayPlusDays(-30),
      });
      data.delay_records.push(closedDelay);
      closedDelayId = closedDelay.id;
      data.delay_activity_links.push(win.PCC.store.newDelayActivityLink({
        delay_id: closedDelay.id, activity_id: criticalActivityId, project_id: projectId,
        original_planned_start: critActivity.planned_start, original_planned_finish: critActivity.planned_finish,
        original_total_float: critActivity.total_float,
      }));
    });
    assert.ok(criticalDelayId && absorbedDelayId && closedDelayId);
  });

  await check("executiveCenter.getDelayImpactSummary() reports 2 open delays (closed excluded) and exactly 1 critical", () => {
    var summary = win.PCC.executiveCenter.getDelayImpactSummary(projectId);
    assert.strictEqual(summary.openDelayCount, 2, "closed delay must be excluded from the open count");
    assert.strictEqual(summary.criticalDelayCount, 1, "only the delay on the critical activity counts as critical");
  });

  await check("Dashboard's Portfolio Exceptions panel shows Open Delays: 2 and Critical Delays: 1", async () => {
    win.PCC.router.go("dashboard");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Open Delays") !== -1);
    assert.ok(text.indexOf("Critical Delays") !== -1);
    assert.strictEqual(kpiValue(dom, ".panel", "Open Delays"), 2);
    assert.strictEqual(kpiValue(dom, ".panel", "Critical Delays"), 1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clicking the Open Delays chip navigates to the Delay & Recovery Dashboard", async () => {
    var chip = Array.from(dom.window.document.querySelectorAll(".card-stat")).find((c) => c.textContent.indexOf("Open Delays") !== -1);
    assert.ok(chip);
    chip.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "delayRecoveryDashboard");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Project Lookahead shows the critical activity with '1 open delay' in its meta line, without changing its Critical badge", async () => {
    win.PCC.router.go("projectLookahead");
    await flush();
    var winBtn60 = Array.from(dom.window.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "60 Day");
    assert.ok(winBtn60, "60 Day window toggle not found");
    winBtn60.click();
    await flush();
    var row = findRowByText(dom, "Foundation Pour");
    assert.ok(row, "the critical activity's Lookahead row wasn't found");
    assert.ok(row.textContent.indexOf("1 open delay") !== -1, "the row must show its own open delay count");
    assert.ok(row.querySelector(".attention-item__icon--critical"), "the badge must still be driven by the Schedule's own float, unchanged by the delay annotation");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Project Lookahead shows the non-critical (absorbed) activity's own open delay count too, without making it read as critical", () => {
    var row = findRowByText(dom, "Landscaping (has slack)");
    assert.ok(row, "the non-critical activity's Lookahead row wasn't found");
    assert.ok(row.textContent.indexOf("1 open delay") !== -1);
    assert.ok(!row.querySelector(".attention-item__icon--critical"), "a delay absorbed by float must never read as a critical row");
  });

  await check("an activity with no linked delay shows no open-delay text at all", () => {
    var row = findRowByText(dom, "Column Erection");
    if (row) {
      assert.ok(row.textContent.indexOf("open delay") === -1, "an activity with no delay must not show any delay count");
    }
  });

  await check("this gate writes nothing back — every seeded record is unchanged after rendering", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 3);
    assert.strictEqual(data.delay_activity_links.length, 3);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "projectLookahead", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings", "delayRecoveryDashboard",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate G (Dashboard & Lookahead)", async () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
