// PCC Architecture Upgrade Phase 7 (Advanced Scheduling): Resource-Constrained
// Leveling — the last of the three open Phase 7 pieces (Aditya's "Start the open pieces
// of phase 7"). End-to-end jsdom test against the actual bundled index.html: the new
// "Suggested Leveling" panel in the Resources module's Leveling tab, and confirming
// "Apply" actually changes what Calculate Schedule produces on a subsequent run (via the
// Start No Earlier Than constraint it sets — proposals alone don't touch planned dates,
// which don't feed CPM at all, so this is the one thing genuinely worth verifying
// end-to-end rather than trusting the engine's own unit tests).
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

  let projectId, scheduleId, criticalId, slackId, resourceId;

  await check("seed a project/schedule with a critical activity and a slack activity competing for one crane, and calculate", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Leveling UI Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;
      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-01-01", constraints_enabled: true });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      // "Driver" has no crane assignment at all — its only job is to be long enough
      // (6 days, no relationships) that it alone drives the project finish out to
      // 2026-01-07, giving BOTH 2-day crane activities below 4 days of real float.
      // Ties in float are broken by original assignment order (a real, documented
      // property of levelResourceWithinFloat's stable sort) — Critical's assignment is
      // seeded first below, so it claims day one and Flexible is the one that yields.
      var driver = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Driver", activity_type: "task", duration: 6 });
      data.activities.push(driver);
      var critical = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Critical Lift", activity_type: "task", duration: 2 });
      data.activities.push(critical);
      criticalId = critical.id;
      var slack = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Flexible Lift", activity_type: "task", duration: 2 });
      data.activities.push(slack);
      slackId = slack.id;

      var resource = win.PCC.store.newResource({ name: "Tower Crane #1", unit: "unit", max_availability: 1 });
      data.resources.push(resource);
      resourceId = resource.id;
      data.resource_assignments.push(
        win.PCC.store.newResourceAssignment({ resource_id: resourceId, activity_id: criticalId, quantity: 1 }),
        win.PCC.store.newResourceAssignment({ resource_id: resourceId, activity_id: slackId, quantity: 1 })
      );
    });
    win.PCC.projectContext.set(projectId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    findButtonByText(win, "Calculate Schedule").click();
    var data = win.PCC.store.get();
    var critical = data.activities.find(function (a) { return a.id === criticalId; });
    var slack = data.activities.find(function (a) { return a.id === slackId; });
    assert.strictEqual(critical.early_start, "2026-01-01");
    assert.strictEqual(slack.early_start, "2026-01-01", "both start on the same day before leveling — that's the conflict");
    assert.ok(slack.total_float > 0, "the slack activity must actually have float for this scenario to mean anything");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Leveling tab's 'Suggest Leveling' button proposes shifting the activity WITH float, not the critical one", () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    findButtonByText(win, "Leveling").click();
    var resSelect = Array.from(outlet().querySelectorAll("select")).find(function (s) {
      return Array.from(s.options).some(function (o) { return o.textContent === "Tower Crane #1"; });
    });
    resSelect.value = resourceId;
    resSelect.dispatchEvent(new win.Event("change"));

    assert.ok(outlet().textContent.indexOf("Over-Allocated Days") !== -1, "expected a real over-allocation to be detected first");
    findButtonByText(win, "Suggest Leveling").click();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Suggested Leveling") !== -1);
    assert.ok(text.indexOf("Flexible Lift") !== -1, "expected the flexible activity to be named in a proposal");
    assert.ok(text.indexOf("2026-01-01") !== -1 && text.indexOf("2026-01-03") !== -1, "expected the shift from 01-01 to 01-03 to be shown");
    var proposalRows = Array.from(outlet().querySelectorAll(".project-list .detail-card"));
    assert.ok(!proposalRows.some(function (row) { return row.textContent.indexOf("Critical Lift") !== -1; }), "the critical activity must never appear as a proposal row");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clicking 'Apply' sets a Start No Earlier Than constraint at the proposed date, not a planned-date change", () => {
    findButtonByText(win, "Apply").click();
    var data = win.PCC.store.get();
    var slack = data.activities.find(function (a) { return a.id === slackId; });
    assert.strictEqual(slack.constraint_type, "SNET");
    assert.strictEqual(slack.constraint_date, "2026-01-03");
    assert.strictEqual(slack.planned_start, "", "planned_start must NOT be touched — it doesn't feed CPM, a constraint does");
  });

  await check("re-running Calculate Schedule (with Honor Date Constraints already on) now genuinely reflects the applied leveling decision", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    findButtonByText(win, "Calculate Schedule").click();
    var data = win.PCC.store.get();
    var critical = data.activities.find(function (a) { return a.id === criticalId; });
    var slack = data.activities.find(function (a) { return a.id === slackId; });
    assert.strictEqual(critical.early_start, "2026-01-01", "the critical activity must be completely unaffected");
    assert.strictEqual(slack.early_start, "2026-01-03", "the applied leveling constraint must now genuinely change the calculated schedule");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("after applying, re-suggesting leveling on the resource shows the conflict is resolved", () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    findButtonByText(win, "Leveling").click();
    var resSelect = Array.from(outlet().querySelectorAll("select")).find(function (s) {
      return Array.from(s.options).some(function (o) { return o.textContent === "Tower Crane #1"; });
    });
    resSelect.value = resourceId;
    resSelect.dispatchEvent(new win.Event("change"));
    var text = outlet().textContent;
    assert.ok(text.indexOf("Over-Allocated Days0") !== -1, "the KPI card must now read 0 over-allocated days");
    assert.ok(!/Over-Allocated Days \(/.test(text), "the detailed conflict panel (only rendered when count > 0) must be gone entirely");
  });

  // ---- Route smoke test ----
  var routes = ["dashboard", "portfolio", "documents", "schedule", "resources", "delayRecoveryDashboard", "executiveCenter", "risks", "cost", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Resource-Constrained Leveling", () => {
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
