// End-to-end jsdom smoke test against the ACTUAL bundled index.html (not a
// reimplementation) \u2014 same convention the README describes for prior gates. Exercises:
// project+schedule+activity setup, rendering the schedule route, clicking "Save
// Baseline", and clicking "Compare to Current", checking for thrown errors and for the
// expected data/DOM outcomes at each step.
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
// Async store writes (putSnapshot, etc.) resolve on a microtask/short-macrotask chain;
// a few event-loop turns is enough without hardcoding a specific await depth.
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
    // In case DOMContentLoaded already fired synchronously during JSDOM construction.
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC && win.PCC.store, "window.PCC.store must exist after boot");
  });

  // ---- Seed a project + schedule + activity directly via the store, same as the
  // existing test convention (bypassing form UI for setup, exercising forms is Gate
  // 1-3's own test coverage, not this one's job) ----
  let projectId, scheduleId, activityId;
  await check("seed a project, schedule, and activity via the store", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_test_1", name: "Test Tower", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline Test Schedule", revision_number: 1 });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var activity = win.PCC.store.newActivity({
        project_id: projectId,
        schedule_id: scheduleId,
        name: "Excavate",
        duration: 5,
        planned_start: "2026-02-01",
        planned_finish: "2026-02-05",
      });
      data.activities.push(activity);
      activityId = activity.id;
    });
    assert.ok(projectId && scheduleId && activityId);
  });

  await check("navigate to the schedule route and it renders without throwing", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.innerHTML.length > 0, "schedule route should render content");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  let baselineCountBefore;
  await check("'Save Baseline' button exists and is enabled once a schedule with activities is selected", () => {
    var btn = findButtonByText(dom, "Save Baseline");
    assert.ok(btn, "Save Baseline button not found");
    assert.strictEqual(btn.disabled, false, "Save Baseline should be enabled with 1 activity present");
    baselineCountBefore = win.PCC.store.get().schedule_baselines.length;
  });

  await check("clicking 'Save Baseline' writes a thin index row and a matching IndexedDB snapshot", async () => {
    var btn = findButtonByText(dom, "Save Baseline");
    btn.click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedule_baselines.length, baselineCountBefore + 1, "expected one new baseline row");
    var baseline = data.schedule_baselines[data.schedule_baselines.length - 1];
    assert.strictEqual(baseline.schedule_id, scheduleId);
    assert.strictEqual(baseline.activity_count, 1);

    var snapshot = await win.PCC.scheduleBaselineStore.getSnapshot(baseline.id);
    assert.ok(snapshot, "snapshot must exist in IndexedDB under the baseline's id");
    assert.strictEqual(snapshot.activities.length, 1);
    assert.strictEqual(snapshot.activities[0].id, activityId);

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("switching to the Baselines tab lists the saved baseline", () => {
    var tabButtons = Array.from(win.document.querySelectorAll("button")).filter(function (b) {
      return ["Activities", "WBS", "Relationships", "Baselines"].indexOf(b.textContent.trim()) !== -1;
    });
    var baselinesTabBtn = tabButtons.find(function (b) { return b.textContent.trim() === "Baselines"; });
    assert.ok(baselinesTabBtn, "Baselines tab button not found");
    baselinesTabBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Baseline Test Schedule") !== -1, "baseline list should show a row for this schedule");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clicking 'Compare to Current' with no changes shows a no-variance comparison", async () => {
    var btn = findButtonByText(dom, "Compare to Current");
    assert.ok(btn, "Compare to Current button not found");
    btn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Baseline vs Current") !== -1, "comparison panel should render");
    assert.ok(
      outlet.textContent.indexOf("No finish-date or criticality changes") !== -1,
      "unchanged activity should report no variance, got: " + outlet.textContent.slice(0, 400)
    );
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("editing the activity's planned finish, then comparing again, shows the variance", async () => {
    win.PCC.store.update(function (data) {
      var act = data.activities.find(function (a) { return a.id === activityId; });
      act.planned_finish = "2026-02-10"; // +5 days vs the baseline's 2026-02-05
    });
    // Re-open comparison: click "Hide Comparison" then "Compare to Current" again so it
    // re-runs against the just-edited activity rather than showing a cached result.
    var hideBtn = findButtonByText(dom, "Hide Comparison");
    if (hideBtn) hideBtn.click();
    await flush();
    var compareBtn = findButtonByText(dom, "Compare to Current");
    compareBtn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("+5 day") !== -1, "expected +5 day variance in output, got: " + outlet.textContent.slice(0, 600));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Phase 4 (Schedule Versioning & Comparison), master upgrade prompt Section 52:
  // calendar changes, constraint changes, and critical path movement, exercised through
  // the real UI (not just the engine's own unit tests). ----
  let calendarId;
  await check("assign a calendar and a constraint to the activity, then re-baseline so this becomes the new comparison point", async () => {
    win.PCC.store.update(function (data) {
      var cal = win.PCC.store.newCalendar({ project_id: projectId, name: "5-Day Calendar" });
      data.calendars.push(cal);
      calendarId = cal.id;
      var act = data.activities.find(function (a) { return a.id === activityId; });
      act.calendar_id = calendarId;
      act.constraint_type = "";
      act.constraint_date = "";
      act.total_float = 5; // not on the critical path yet
    });
    var hideBtn = findButtonByText(dom, "Hide Comparison");
    if (hideBtn) hideBtn.click();
    await flush();
    var saveBtn = findButtonByText(dom, "Save Baseline");
    saveBtn.click();
    await flush();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("editing the calendar's working days, adding a constraint, and pushing the activity onto the critical path all show up in the next comparison", async () => {
    win.PCC.store.update(function (data) {
      var cal = data.calendars.find(function (c) { return c.id === calendarId; });
      cal.working_days = [true, true, true, true, true, true, false]; // now a 6-day week
      var act = data.activities.find(function (a) { return a.id === activityId; });
      act.constraint_type = "SNET";
      act.constraint_date = "2026-02-01";
      act.total_float = 0; // now critical
    });
    var compareBtn = findButtonByText(dom, "Compare to Current");
    compareBtn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    var text = outlet.textContent;
    assert.ok(text.indexOf("Calendar changes") !== -1, "expected a Calendar changes line, got: " + text.slice(0, 800));
    assert.ok(text.indexOf("5-Day Calendar") !== -1, "the modified calendar's name should be named in the summary");
    assert.ok(text.indexOf("Constraint changes: 1 activity") !== -1, "expected a Constraint changes line, got: " + text.slice(0, 800));
    assert.ok(text.indexOf("Critical Path Movement") !== -1, "expected a Critical Path Movement section, got: " + text.slice(0, 800));
    assert.ok(text.indexOf("entered the critical path") !== -1, "expected the activity to be listed as having entered the critical path");
    assert.ok(text.indexOf("calendar changed") !== -1, "expected the per-activity row badge for calendar changed");
    assert.ok(text.indexOf("constraint changed") !== -1, "expected the per-activity row badge for constraint changed");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every other page, matching the README's stated
  // convention, since store.js's schema bump (v17->v18) is a change every page's
  // window.PCC.store.get() call runs through. ----
  var routes = ["dashboard", "portfolio", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 4 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
