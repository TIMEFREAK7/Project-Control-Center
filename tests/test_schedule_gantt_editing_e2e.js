// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 8 (Interactive
// Gantt Editing) — drag-to-move, drag-to-resize, click-to-open detail panel, filters,
// zoom, and quick-add — same convention test_schedule_gantt_e2e.js already established.
// jsdom has no real pointer capture or layout, so drags are simulated by dispatching
// plain MouseEvents typed "pointerdown"/"pointermove"/"pointerup" with clientX set —
// schedule.js's handlers only read e.clientX/e.button, never call setPointerCapture, so
// this exercises the exact same code path a real drag would.
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

function pointerEvent(win, type, clientX) {
  return new win.MouseEvent(type, { clientX: clientX, bubbles: true, cancelable: true, button: 0 });
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
  });

  let projectId, scheduleId, designId, buildId, milestoneId;
  await check("seed a project, schedule, and activities via the store", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_edit_1", name: "Editable Tower", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({
        project_id: projectId, name: "Edit Test Schedule", revision_number: 1, data_date: "2026-03-01",
      });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var design = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Design",
        activity_type: "task", duration: 10, planned_start: "2026-03-01", planned_finish: "2026-03-11",
        discipline: "Structural", contractor: "Acme Co", responsible_person: "J. Smith",
      });
      var build = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Build",
        activity_type: "task", duration: 15, planned_start: "2026-03-11", planned_finish: "2026-03-26",
      });
      var milestone = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Handover",
        activity_type: "milestone", duration: 0, planned_start: "2026-04-10",
      });
      data.activities.push(design, build, milestone);
      designId = design.id;
      buildId = build.id;
      milestoneId = milestone.id;

      data.relationships.push(
        win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: designId, successor_id: buildId, type: "FS", lag: 0 })
      );
    });
    assert.ok(projectId && scheduleId && designId && buildId && milestoneId);
  });

  await check("navigate to Schedule > Gantt and switch zoom to Daily (deterministic 32px/day)", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var ganttBtn = findButtonByText(dom, "Gantt");
    assert.ok(ganttBtn, "Gantt tab button not found");
    ganttBtn.click();
    var dailyBtn = findButtonByText(dom, "Daily");
    assert.ok(dailyBtn, "Daily zoom button not found");
    dailyBtn.click();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.querySelector("svg"), "Gantt chart should render");
  });

  await check("dragging the Design bar 3 days right shifts planned_start/planned_finish and preserves duration", async () => {
    var outlet = win.document.getElementById("page-outlet");
    var bar = outlet.querySelector('svg rect[data-activity-id="' + designId + '"]');
    assert.ok(bar, "Design bar not found");

    var PX_PER_DAY = 32; // matches the "Daily" zoom preset
    var startX = 300;
    bar.dispatchEvent(pointerEvent(win, "pointerdown", startX));
    win.dispatchEvent(pointerEvent(win, "pointermove", startX + PX_PER_DAY * 3 + 2));
    win.dispatchEvent(pointerEvent(win, "pointerup", startX + PX_PER_DAY * 3 + 2));
    await flush();

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    var design = win.PCC.store.get().activities.find((a) => a.id === designId);
    assert.strictEqual(design.planned_start, "2026-03-04", "start should shift by 3 days");
    assert.strictEqual(design.planned_finish, "2026-03-14", "finish should shift by 3 days, preserving 10-day duration");
    assert.strictEqual(design.duration, 10, "duration must be unchanged by a move");
  });

  await check("a plain click (no movement) on a bar opens the Activity Detail Panel instead of editing dates", () => {
    var outlet = win.document.getElementById("page-outlet");
    var bar = outlet.querySelector('svg rect[data-activity-id="' + buildId + '"]');
    assert.ok(bar, "Build bar not found");
    var before = win.PCC.store.get().activities.find((a) => a.id === buildId);

    bar.dispatchEvent(pointerEvent(win, "pointerdown", 500));
    win.dispatchEvent(pointerEvent(win, "pointerup", 500));

    var after = win.PCC.store.get().activities.find((a) => a.id === buildId);
    assert.strictEqual(after.planned_start, before.planned_start, "a plain click must not change dates");

    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Build") !== -1 && outlet2.textContent.indexOf("Activity ID") !== -1, "detail panel should be showing Build's details");
    assert.ok(outlet2.textContent.indexOf("Predecessors:") !== -1, "detail panel should list predecessors");
    assert.ok(outlet2.textContent.indexOf("Design") !== -1, "Design should be listed as Build's predecessor");
  });

  await check("resizing the Build bar's right edge by 5 days extends only planned_finish/duration", async () => {
    var outlet = win.document.getElementById("page-outlet");
    var handle = outlet.querySelector('svg rect[data-resize-handle-for="' + buildId + '"]');
    assert.ok(handle, "resize handle for Build not found");
    var beforeStart = win.PCC.store.get().activities.find((a) => a.id === buildId).planned_start;
    var beforeFinish = win.PCC.store.get().activities.find((a) => a.id === buildId).planned_finish;

    var PX_PER_DAY = 32;
    var startX = 700;
    handle.dispatchEvent(pointerEvent(win, "pointerdown", startX));
    win.dispatchEvent(pointerEvent(win, "pointermove", startX + PX_PER_DAY * 5 + 2));
    win.dispatchEvent(pointerEvent(win, "pointerup", startX + PX_PER_DAY * 5 + 2));
    await flush();

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    var after = win.PCC.store.get().activities.find((a) => a.id === buildId);
    assert.strictEqual(after.planned_start, beforeStart, "resize must not move the start date");
    var expectedFinish = win.PCC.scheduleGanttLayout.addDays(beforeFinish, 5);
    assert.strictEqual(after.planned_finish, expectedFinish, "finish should extend by 5 days");
    assert.strictEqual(after.duration, 20, "duration should grow from 15 to 20 days");
  });

  await check("dragging a milestone diamond by 2 days shifts its single date", async () => {
    var outlet = win.document.getElementById("page-outlet");
    var diamond = outlet.querySelector('svg path[data-activity-id="' + milestoneId + '"]');
    assert.ok(diamond, "milestone diamond not found");
    var beforeStart = win.PCC.store.get().activities.find((a) => a.id === milestoneId).planned_start;

    var PX_PER_DAY = 32;
    var startX = 900;
    diamond.dispatchEvent(pointerEvent(win, "pointerdown", startX));
    win.dispatchEvent(pointerEvent(win, "pointermove", startX + PX_PER_DAY * 2 + 2));
    win.dispatchEvent(pointerEvent(win, "pointerup", startX + PX_PER_DAY * 2 + 2));
    await flush();

    var after = win.PCC.store.get().activities.find((a) => a.id === milestoneId);
    assert.strictEqual(after.planned_start, win.PCC.scheduleGanttLayout.addDays(beforeStart, 2));
  });

  await check("editing recalculates automatically — Design's early_start/float reflect the drag without a manual Calculate click", () => {
    var design = win.PCC.store.get().activities.find((a) => a.id === designId);
    assert.ok(design.early_start != null, "recalculation should have run automatically after the drag edits above");
  });

  await check("search filter narrows the chart to matching activities only", () => {
    var outlet = win.document.getElementById("page-outlet");
    var searchInput = outlet.querySelector('input[placeholder^="Search"]');
    assert.ok(searchInput, "Gantt search input not found");
    searchInput.value = "Handover";
    searchInput.dispatchEvent(new win.Event("input", { bubbles: true }));

    var outlet2 = win.document.getElementById("page-outlet");
    var svg = outlet2.querySelector("svg");
    assert.ok(svg.querySelector('path[data-activity-id="' + milestoneId + '"]'), "Handover milestone should still be shown");
    assert.strictEqual(svg.querySelector('rect[data-activity-id="' + designId + '"]'), null, "Design should be filtered out");

    var clearBtn = findButtonByText(dom, "Clear Filters");
    assert.ok(clearBtn, "Clear Filters button should appear once a filter is active");
    clearBtn.click();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'+ Add Milestone' jumps to the Activities tab with Type pre-set to Milestone", () => {
    var addMilestoneBtn = findButtonByText(dom, "+ Add Milestone");
    assert.ok(addMilestoneBtn, "+ Add Milestone button not found");
    addMilestoneBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    var typeSelect = outlet.querySelector("#actfield-activity_type");
    assert.ok(typeSelect, "activity_type select not found on the Add Activity form");
    assert.strictEqual(typeSelect.value, "milestone", "new activity form should default to Milestone");
    // Cancel back out so later checks start from a clean Gantt tab.
    var cancelBtn = Array.from(outlet.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cancel");
    if (cancelBtn) cancelBtn.click();
  });

  await check("deleting an activity from the Gantt detail panel removes it and its relationships", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    findButtonByText(dom, "Gantt").click();
    var outlet = win.document.getElementById("page-outlet");
    var bar = outlet.querySelector('svg rect[data-activity-id="' + designId + '"]');
    bar.dispatchEvent(pointerEvent(win, "pointerdown", 300));
    win.dispatchEvent(pointerEvent(win, "pointerup", 300));

    var originalConfirm = win.confirm;
    win.confirm = () => true;
    var outlet2 = win.document.getElementById("page-outlet");
    var deleteBtn = Array.from(outlet2.querySelectorAll("button")).find((b) => b.textContent.trim() === "Delete");
    assert.ok(deleteBtn, "Delete button not found in detail panel");
    deleteBtn.click();
    win.confirm = originalConfirm;

    var data = win.PCC.store.get();
    assert.ok(!data.activities.some((a) => a.id === designId), "Design should be deleted");
    assert.ok(!data.relationships.some((r) => r.predecessor_id === designId || r.successor_id === designId), "relationships referencing it should be gone");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every other page ----
  var routes = ["dashboard", "portfolio", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 8 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
