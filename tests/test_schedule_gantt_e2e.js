// End-to-end jsdom smoke test against the ACTUAL bundled index.html (not a
// reimplementation) — same convention the README describes for prior gates. Exercises:
// project+schedule+activities setup, the Gantt tab before and after "Calculate
// Schedule", milestone rendering, an undated activity, and the data-date marker.
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC && win.PCC.store, "window.PCC.store must exist after boot");
  });

  // ---- Seed a project, schedule, and four activities covering the cases the Gantt
  // tab has to handle: a two-task critical chain, an isolated milestone, and an
  // activity with no dates at all. ----
  let projectId, scheduleId, designId, buildId, milestoneId, undatedId;
  await check("seed a project, schedule, and activities via the store", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_gantt_1", name: "Gantt Test Tower", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({
        project_id: projectId,
        name: "Gantt Test Schedule",
        revision_number: 1,
        data_date: "2026-03-01",
      });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var design = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Design",
        activity_type: "task", duration: 5, planned_start: "2026-03-01", planned_finish: "2026-03-06",
      });
      var build = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Build",
        activity_type: "task", duration: 10, planned_start: "2026-03-06", planned_finish: "2026-03-16",
      });
      var milestone = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Permit Approved",
        activity_type: "milestone", duration: 0, planned_start: "2026-03-20",
      });
      var undated = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Unscheduled Task",
        activity_type: "task",
      });
      data.activities.push(design, build, milestone, undated);
      designId = design.id;
      buildId = build.id;
      milestoneId = milestone.id;
      undatedId = undated.id;

      data.relationships.push(
        win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: designId, successor_id: buildId, type: "FS", lag: 0 })
      );
    });
    assert.ok(projectId && scheduleId && designId && buildId && milestoneId && undatedId);
  });

  await check("navigate to the schedule route and it renders without throwing", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.innerHTML.length > 0, "schedule route should render content");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Gantt' tab button exists and switches to the Gantt tab", () => {
    var btn = findButtonByText(dom, "Gantt");
    assert.ok(btn, "Gantt tab button not found");
    btn.click();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("before calculation: planned-only bars render, milestone is a diamond, undated activity is called out", () => {
    var outlet = win.document.getElementById("page-outlet");
    var svg = outlet.querySelector("svg");
    assert.ok(svg, "Gantt tab should render an <svg> chart");

    var designRect = svg.querySelector('rect[data-activity-id="' + designId + '"]');
    var buildRect = svg.querySelector('rect[data-activity-id="' + buildId + '"]');
    assert.ok(designRect, "Design activity should render a bar");
    assert.ok(buildRect, "Build activity should render a bar");
    assert.strictEqual(designRect.getAttribute("stroke-dasharray"), "4,2", "planned-only bar should be dashed");

    var milestonePath = svg.querySelector('path[data-activity-id="' + milestoneId + '"]');
    assert.ok(milestonePath, "milestone activity should render as a <path> diamond, not a bar");
    assert.strictEqual(svg.querySelector('rect[data-activity-id="' + milestoneId + '"]'), null, "milestone should not also render a rect");

    assert.ok(
      outlet.textContent.indexOf("1 activity(ies) have no planned or calculated dates") !== -1,
      "should call out the one undated activity, got: " + outlet.textContent.slice(0, 400)
    );
    assert.ok(outlet.textContent.indexOf("No dates set") !== -1, "undated activity's row should say 'No dates set'");

    assert.ok(outlet.textContent.indexOf("Critical") !== -1, "legend should mention Critical");
    assert.ok(outlet.textContent.indexOf("Milestone") !== -1, "legend should mention Milestone");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clicking 'Calculate Schedule' recalculates and the Gantt tab reflects real store values", async () => {
    var calcBtn = findButtonByText(dom, "Calculate Schedule");
    assert.ok(calcBtn, "Calculate Schedule button not found");
    calcBtn.click();
    await flush();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    var data = win.PCC.store.get();
    var design = data.activities.find((a) => a.id === designId);
    var build = data.activities.find((a) => a.id === buildId);
    var milestone = data.activities.find((a) => a.id === milestoneId);
    assert.ok(design.early_start != null, "Design should have calculated dates after Calculate Schedule");

    var outlet = win.document.getElementById("page-outlet");
    var svg = outlet.querySelector("svg");
    assert.ok(svg, "Gantt tab should still render after recalculation");

    var expectedDesignFill = design.total_float != null && design.total_float <= 0 ? "var(--status-critical)" : "var(--status-info)";
    var expectedBuildFill = build.total_float != null && build.total_float <= 0 ? "var(--status-critical)" : "var(--status-info)";
    var designRect = svg.querySelector('rect[data-activity-id="' + designId + '"]');
    var buildRect = svg.querySelector('rect[data-activity-id="' + buildId + '"]');
    assert.strictEqual(designRect.getAttribute("fill"), expectedDesignFill, "Design bar color should match its actual calculated criticality");
    assert.strictEqual(buildRect.getAttribute("fill"), expectedBuildFill, "Build bar color should match its actual calculated criticality");
    assert.strictEqual(designRect.getAttribute("stroke-dasharray"), "none", "a calculated bar should no longer be dashed");

    var expectedMilestoneFill = milestone.total_float != null && milestone.total_float <= 0 ? "var(--status-critical)" : "var(--signal-amber)";
    var milestonePath = svg.querySelector('path[data-activity-id="' + milestoneId + '"]');
    assert.strictEqual(milestonePath.getAttribute("fill"), expectedMilestoneFill, "milestone diamond color should match its actual calculated criticality");
  });

  await check("the schedule's data_date renders as a marker line on the chart", () => {
    var outlet = win.document.getElementById("page-outlet");
    var svg = outlet.querySelector("svg");
    var lines = Array.from(svg.querySelectorAll('line[stroke-dasharray="4,3"]'));
    assert.ok(lines.length >= 1, "expected a dashed data-date marker line");
    assert.ok(outlet.textContent.indexOf("Data Date") !== -1, "chart should label the data date marker");
  });

  // Bug fix: Today/Data Date labels used to sit at a fixed y that collided with the
  // axis date-tick row above them (same y-coordinate), and — when the two markers
  // landed close together in x, which happens often since a data date is usually near
  // "today" by definition — with each other too, rendering as illegible overlapping
  // text. Self-contained (own project/schedule/activity, dates computed relative to the
  // real "today" at test-run time) so it doesn't depend on the file's other fixed 2026
  // dates happening to include today.
  var closeMarkersProjectId;
  await check("seed a project whose schedule spans today, with data_date one day after today", () => {
    function addDays(iso, n) {
      var d = new Date(iso + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    }
    var todayIso = new Date().toISOString().slice(0, 10);
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Close Markers Project", status: "on_track" });
      d.projects.push(p);
      closeMarkersProjectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: p.id, name: "Baseline", status: "active", data_date: addDays(todayIso, 1) });
      d.schedules.push(s);
      d.activities.push(win.PCC.store.newActivity({
        project_id: p.id, schedule_id: s.id, name: "Spanning Task",
        planned_start: addDays(todayIso, -20), planned_finish: addDays(todayIso, 20),
      }));
    });
    win.PCC.schedule.viewProject(closeMarkersProjectId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    assert.ok(closeMarkersProjectId);
  });

  await check("Today and Data Date labels stagger into separate rows, both clear of the axis date-tick row", () => {
    var outlet = win.document.getElementById("page-outlet");
    var svg = outlet.querySelector("svg");
    var texts = Array.from(svg.querySelectorAll("text"));
    var todayLabel = texts.find(function (t) { return t.textContent === "Today"; });
    var dataDateLabel = texts.find(function (t) { return t.textContent === "Data Date"; });
    assert.ok(todayLabel, "Today label not found — today must fall inside the chart's date range");
    assert.ok(dataDateLabel, "Data Date label not found");

    var axisTickY = Number(texts.find(function (t) { return /^\d+\/\d+$/.test(t.textContent); }).getAttribute("y"));
    var todayY = Number(todayLabel.getAttribute("y"));
    var dataDateY = Number(dataDateLabel.getAttribute("y"));

    assert.ok(todayY - axisTickY >= 10, "Today label must sit well clear of the axis date-tick row, not share its y");
    assert.ok(dataDateY - axisTickY >= 10, "Data Date label must sit well clear of the axis date-tick row, not share its y");
    assert.ok(Math.abs(todayY - dataDateY) >= 8, "with the markers this close in x, the two labels must stagger onto separate rows");

    // Switch back to the file's original project — the checks below assume they're
    // still working with that project's own schedules (e.g. the "Empty Schedule" added
    // to it further down), not this check's own throwaway project.
    win.PCC.schedule.viewProject(projectId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
  });

  await check("switching schedules to one with zero activities shows the Gantt empty state", () => {
    win.PCC.store.update(function (data) {
      var empty = win.PCC.store.newSchedule({ project_id: projectId, name: "Empty Schedule", revision_number: 2 });
      data.schedules.push(empty);
    });
    win.PCC.router.render();
    var schedSelect = win.document.querySelectorAll(".toolbar select")[1];
    assert.ok(schedSelect, "schedule select not found");
    var emptyOption = Array.from(schedSelect.options).find((o) => o.textContent.indexOf("Empty Schedule") !== -1);
    assert.ok(emptyOption, "Empty Schedule option not found in schedule select");
    schedSelect.value = emptyOption.value;
    schedSelect.dispatchEvent(new win.Event("change"));

    var ganttBtn = findButtonByText(dom, "Gantt");
    ganttBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.querySelector("svg") === null, "empty schedule should not render a chart");
    assert.ok(
      outlet.textContent.indexOf("No activities in this schedule yet") !== -1,
      "expected the no-activities empty state, got: " + outlet.textContent.slice(0, 400)
    );
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every other page, matching the README's stated
  // convention, since this gate touches build.js's JS_ORDER and adds a new module. ----
  var routes = ["dashboard", "portfolio", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 5 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
