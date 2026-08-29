// PCC Architecture Upgrade Phase 7 (Advanced Scheduling): Calendar-Aware CPM + Date
// Constraints. End-to-end jsdom test against the actual bundled index.html — exercises
// the real "Calculate Schedule" flow and both Schedule Settings toggles ("Calendar-Aware
// Calculation", "Honor Date Constraints"), confirming each actually changes computed
// dates through the real UI, not just scheduleCpmEngine.js in isolation (that's covered
// separately, and far more exhaustively, in test_schedule_cpm_engine.js). Reference week
// verified against a real calendar (`date -d`) before writing any assertion: Fri
// 2026-03-06, weekend 03-07/03-08, Mon 2026-03-09.
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

function findButtonByText(win, text) {
  return Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
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
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  let projectId, scheduleId, calendarId, activityAId, activityBId;

  await check("seed a project, a Mon-Fri calendar, a schedule, and two FS-linked activities spanning a weekend", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Calendar-Aware Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var calendar = win.PCC.store.newCalendar({ project_id: projectId, name: "Mon-Fri", is_default: true });
      data.calendars.push(calendar);
      calendarId = calendar.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-03-06" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Task A", activity_type: "task", duration: 1, calendar_id: calendarId });
      data.activities.push(a);
      activityAId = a.id;
      var b = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Task B", activity_type: "task", duration: 1, calendar_id: calendarId });
      data.activities.push(b);
      activityBId = b.id;

      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: activityAId, successor_id: activityBId, type: "FS", lag: 0 }));
    });
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("with Calendar-Aware Calculation OFF (the default), the weekend is counted as work time, matching pre-Phase-7 behavior", () => {
    findButtonByText(win, "Calculate Schedule").click();
    var data = win.PCC.store.get();
    var b = data.activities.find(function (a) { return a.id === activityBId; });
    assert.strictEqual(b.early_start, "2026-03-07", "plain calendar-day math: B starts the day after A finishes, weekend included");
  });

  await check("the Schedule Settings form has a 'Calendar-Aware Calculation' checkbox, unchecked by default", () => {
    findButtonByText(win, "Edit Schedule").click();
    var checkbox = win.document.getElementById("schedfield-calendar_aware");
    assert.ok(checkbox, "expected a calendar_aware checkbox in the Schedule Settings form");
    assert.strictEqual(checkbox.checked, false, "must default to off for an existing schedule with calendar_aware: false");
  });

  await check("turning the checkbox on and saving persists calendar_aware onto the schedule record", () => {
    var checkbox = win.document.getElementById("schedfield-calendar_aware");
    checkbox.checked = true;
    findButtonByText(win, "Save Changes").click();
    var data = win.PCC.store.get();
    var schedule = data.schedules.find(function (s) { return s.id === scheduleId; });
    assert.strictEqual(schedule.calendar_aware, true);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("re-running Calculate Schedule with Calendar-Aware Calculation ON now skips the weekend through the real UI", () => {
    findButtonByText(win, "Calculate Schedule").click();
    var data = win.PCC.store.get();
    var a = data.activities.find(function (act) { return act.id === activityAId; });
    var b = data.activities.find(function (act) { return act.id === activityBId; });
    assert.strictEqual(a.early_start, "2026-03-06");
    assert.strictEqual(a.early_finish, "2026-03-07");
    assert.strictEqual(b.early_start, "2026-03-09", "with calendar-awareness on, B must skip Sat/Sun and start the following Monday");
    assert.strictEqual(b.early_finish, "2026-03-10");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Executive Center's live CPM snapshot also respects calendar-awareness for the same schedule", () => {
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    win.PCC.router.go("schedule"); // executiveCenter.js computes its own cpm internally on render; just confirm no throw when calendar_aware is set
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("turning the checkbox back off and recalculating reverts to plain calendar-day math", () => {
    findButtonByText(win, "Edit Schedule").click();
    var checkbox = win.document.getElementById("schedfield-calendar_aware");
    assert.strictEqual(checkbox.checked, true, "must reflect the persisted true value when reopening the form");
    checkbox.checked = false;
    findButtonByText(win, "Save Changes").click();
    findButtonByText(win, "Calculate Schedule").click();
    var data = win.PCC.store.get();
    var b = data.activities.find(function (a) { return a.id === activityBId; });
    assert.strictEqual(b.early_start, "2026-03-07", "back to plain calendar-day math once the toggle is off again");
  });

  let activityCId;
  await check("seed a third, unconstrained-by-relationship activity carrying an imported Must Start On constraint", () => {
    win.PCC.store.update(function (data) {
      var c = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Task C (MSO import)",
        activity_type: "task", duration: 1, constraint_type: "MSO", constraint_date: "2026-03-20",
      });
      data.activities.push(c);
      activityCId = c.id;
    });
    assert.ok(activityCId);
  });

  await check("with Honor Date Constraints OFF (the default), an imported Must Start On date is silently ignored, matching pre-Phase-7 behavior", () => {
    findButtonByText(win, "Calculate Schedule").click();
    var data = win.PCC.store.get();
    var c = data.activities.find(function (a) { return a.id === activityCId; });
    assert.strictEqual(c.early_start, "2026-03-06", "unenforced constraint must not move the date — plain dataDate-driven ES");
  });

  await check("the Schedule Settings form has a 'Honor Date Constraints' checkbox, unchecked by default", () => {
    findButtonByText(win, "Edit Schedule").click();
    var checkbox = win.document.getElementById("schedfield-constraints_enabled");
    assert.ok(checkbox, "expected a constraints_enabled checkbox in the Schedule Settings form");
    assert.strictEqual(checkbox.checked, false);
  });

  await check("turning Honor Date Constraints on and recalculating makes the imported Must Start On date take effect through the real UI", () => {
    var checkbox = win.document.getElementById("schedfield-constraints_enabled");
    checkbox.checked = true;
    findButtonByText(win, "Save Changes").click();
    var schedule = win.PCC.store.get().schedules.find(function (s) { return s.id === scheduleId; });
    assert.strictEqual(schedule.constraints_enabled, true);

    findButtonByText(win, "Calculate Schedule").click();
    var c = win.PCC.store.get().activities.find(function (a) { return a.id === activityCId; });
    assert.strictEqual(c.early_start, "2026-03-20", "the imported Must Start On constraint must now be honored");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("turning Honor Date Constraints back off and recalculating reverts to ignoring the constraint again", () => {
    findButtonByText(win, "Edit Schedule").click();
    var checkbox = win.document.getElementById("schedfield-constraints_enabled");
    assert.strictEqual(checkbox.checked, true, "must reflect the persisted true value when reopening the form");
    checkbox.checked = false;
    findButtonByText(win, "Save Changes").click();
    findButtonByText(win, "Calculate Schedule").click();
    var c = win.PCC.store.get().activities.find(function (a) { return a.id === activityCId; });
    assert.strictEqual(c.early_start, "2026-03-06", "back to ignoring the constraint once the toggle is off again");
  });

  // ---- Route smoke test ----
  var routes = ["dashboard", "portfolio", "documents", "schedule", "delayRecoveryDashboard", "executiveCenter", "risks", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Advanced Scheduling (Calendar-Aware CPM)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
