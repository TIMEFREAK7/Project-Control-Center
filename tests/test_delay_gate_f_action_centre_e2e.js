// Planning & Scheduling-Centric Delay Management, Gate F (Planner Action Centre) — DOM-level
// e2e test against the ACTUAL bundled index.html. Covers surfacing open/in_progress Recovery
// Actions (by their real target_recovery_date) and newly-identified ("open" status) Delay
// Records into the existing Planner Action Centre (pages/actionCentre.js), alongside every
// other outstanding item that page already aggregates.
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

function findClickableRowByText(dom, rowText) {
  return Array.from(dom.window.document.querySelectorAll(".attention-item--clickable")).find(
    (r) => r.textContent.indexOf(rowText) !== -1
  );
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

  var projectId, scheduleId, activityId, activityForOrphanId;
  var overdueRecActionId, doneRecActionId, orphanRecActionId;
  var openDelayId, openDelayNoActivityId, investigatingDelayId;

  await check("seed a project/schedule/activity, Recovery Actions in various states, and Delay Records in various states", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Gate F Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var activity = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Cable Tray Installation", activity_type: "task", duration: 5 });
      data.activities.push(activity);
      activityId = activity.id;

      var activityForOrphan = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Temp Activity For Orphan Test", activity_type: "task", duration: 5 });
      data.activities.push(activityForOrphan);
      activityForOrphanId = activityForOrphan.id;

      // Overdue, open recovery action — must surface in the Overdue bucket.
      var overdueRecAction = win.PCC.store.newRecoveryAction({
        activity_id: activityId, project_id: projectId, description: "Expedite cable tray delivery",
        responsible_person: "Site Engineer", target_recovery_date: todayPlusDays(-3), status: "open",
      });
      data.recovery_actions.push(overdueRecAction);
      overdueRecActionId = overdueRecAction.id;

      // Completed recovery action with a due date — must be excluded (historical, not outstanding).
      var doneRecAction = win.PCC.store.newRecoveryAction({
        activity_id: activityId, project_id: projectId, description: "Already-finished recovery step",
        responsible_person: "Site Engineer", target_recovery_date: todayPlusDays(-10), status: "completed",
      });
      data.recovery_actions.push(doneRecAction);
      doneRecActionId = doneRecAction.id;

      // Recovery action against an activity that will be deleted — real outstanding data, but
      // with nowhere left to send the planner, so it must show without being clickable.
      var orphanRecAction = win.PCC.store.newRecoveryAction({
        activity_id: activityForOrphanId, project_id: projectId, description: "Recovery step for a since-deleted activity",
        responsible_person: "Site Engineer", target_recovery_date: todayPlusDays(-1), status: "in_progress",
      });
      data.recovery_actions.push(orphanRecAction);
      orphanRecActionId = orphanRecAction.id;

      // Newly-identified delay, linked to a real activity.
      var openDelay = win.PCC.store.newDelayRecord({
        activity_id: activityId, project_id: projectId, delay_category: "late_material",
        description: "Cable tray shipment delayed at port", status: "open", identified_date: todayPlusDays(0),
      });
      openDelay.status_history = [{ status: "open", changed_at: openDelay.created_at, note: "Delay identified." }];
      data.delay_records.push(openDelay);
      openDelayId = openDelay.id;

      // Newly-identified delay with NO linked activity — must read "Schedule Impact Not Yet
      // Assessed" and fall back to the Project as its click target.
      var openDelayNoActivity = win.PCC.store.newDelayRecord({
        activity_id: "", project_id: projectId, delay_category: "weather",
        description: "Heavy rain reported on site", status: "open", identified_date: todayPlusDays(0),
      });
      openDelayNoActivity.status_history = [{ status: "open", changed_at: openDelayNoActivity.created_at, note: "Delay identified." }];
      data.delay_records.push(openDelayNoActivity);
      openDelayNoActivityId = openDelayNoActivity.id;

      // Delay already past "open" — its own Recovery Action(s) are the actionable item now,
      // so it must NOT be duplicated here.
      var investigatingDelay = win.PCC.store.newDelayRecord({
        activity_id: activityId, project_id: projectId, delay_category: "design_change",
        description: "Design change under investigation", status: "investigating", identified_date: todayPlusDays(-5),
      });
      data.delay_records.push(investigatingDelay);
      investigatingDelayId = investigatingDelay.id;

      // Now remove the orphan's activity, leaving orphanRecAction pointing at nothing.
      data.activities = data.activities.filter(function (a) { return a.id !== activityForOrphanId; });
    });
    win.PCC.router.go("actionCentre");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the overdue Recovery Action lands in the Overdue bucket as a clickable row", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Expedite cable tray delivery") !== -1);
    assert.ok(text.indexOf("[Recovery Action]") !== -1);
    var row = findClickableRowByText(dom, "Expedite cable tray delivery");
    assert.ok(row, "the overdue recovery action row must be clickable (its activity still exists)");
    assert.ok(row.textContent.indexOf("Site Engineer") !== -1);
    assert.ok(row.textContent.indexOf(todayPlusDays(-3)) !== -1);
  });

  await check("the completed Recovery Action is excluded entirely", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Already-finished recovery step") === -1, "a completed recovery action must not appear — it's historical, not outstanding");
  });

  await check("the orphaned Recovery Action (activity since deleted) still shows as real outstanding data, but is not clickable", () => {
    var row = findRowByText(dom, "Recovery step for a since-deleted activity");
    assert.ok(row, "the orphaned recovery action must still be listed — it's real outstanding data");
    assert.ok(row.className.indexOf("attention-item--clickable") === -1, "with no activity left to navigate to, the row must not be clickable");
  });

  await check("the newly-identified Delay (linked to an activity) lands in No Due Date, and is clickable", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Late Material") !== -1 && text.indexOf("Cable tray shipment delayed at port") !== -1);
    assert.ok(text.indexOf("[Delay]") !== -1);
    var row = findClickableRowByText(dom, "Cable tray shipment delayed at port");
    assert.ok(row, "a delay linked to a real activity must be clickable");
  });

  await check("the newly-identified Delay with NO linked activity reads 'Schedule Impact Not Yet Assessed' and is still clickable (falls back to the project)", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Heavy rain reported on site") !== -1);
    assert.ok(text.indexOf("Schedule Impact Not Yet Assessed") !== -1);
    var row = findClickableRowByText(dom, "Heavy rain reported on site");
    assert.ok(row, "an unlinked delay must still be clickable — it falls back to the project");
  });

  await check("the delay past 'open' status (investigating) is NOT duplicated here — its own Recovery Action is the actionable item", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Design change under investigation") === -1, "an investigating-status delay must not appear in the Action Centre");
  });

  await check("clicking the overdue Recovery Action row navigates to Schedule with its activity open", () => {
    var row = findClickableRowByText(dom, "Expedite cable tray delivery");
    row.click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    assert.ok(outlet().textContent.indexOf("Cable Tray Installation") !== -1, "the linked activity must land open in the Schedule detail panel");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clicking the unlinked Delay row navigates to the Project (fallback), not Schedule", () => {
    win.PCC.router.go("actionCentre");
    win.PCC.router.render();
    var row = findClickableRowByText(dom, "Heavy rain reported on site");
    row.click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "portfolio");
    assert.ok(outlet().textContent.indexOf("Gate F Test Tower") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back — every seeded record is unchanged after rendering", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.recovery_actions.length, 3);
    assert.strictEqual(data.delay_records.length, 3);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders",
    "cost", "resources", "reports", "settings", "delayRecoveryDashboard",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate F (Planner Action Centre)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
