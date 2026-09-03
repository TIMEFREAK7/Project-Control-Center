// End-to-end jsdom test against the ACTUAL bundled index.html for the physical_progress
// bug fix (2026-08-19). `physical_progress` was a schema field on activities (distinct
// from `percent_complete`) that Executive Center's "Physical Progress" KPI/report line
// already read and weighted-averaged — but nothing in the app ever wrote it, so that KPI
// silently reported 0.0% for every project. This gate wires a real, manual data-entry
// path: an Activity form field and a Detail Panel display, separate from the schedule-
// file-derived `percent_complete`. No schema_version bump — the field already existed.
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.pages.schedule && win.PCC.pages.executiveCenter, "schedule and executiveCenter page modules must be bundled");
  });

  var projectId, scheduleId, activityId;
  await check("seed a project, a schedule, and one activity via the store", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Physical Progress Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(s);
      scheduleId = s.id;
      var a = win.PCC.store.newActivity({
        project_id: projectId,
        schedule_id: scheduleId,
        name: "Foundation Pour",
        activity_type: "task",
        duration: 10,
        percent_complete: 40,
      });
      d.activities.push(a);
      activityId = a.id;
    });
    assert.ok(projectId && scheduleId && activityId);
  });

  await check("physical_progress defaults to 0 and the Detail Panel shows it distinctly from % Complete", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var pctLabel = Array.from(outlet().querySelectorAll(".detail-item__label")).find((l) => l.textContent === "% Complete");
    var physLabel = Array.from(outlet().querySelectorAll(".detail-item__label")).find((l) => l.textContent === "Physical Progress");
    assert.ok(pctLabel && physLabel, "both % Complete and Physical Progress detail items must be present");
    assert.strictEqual(pctLabel.parentElement.querySelector("div").textContent, "40%");
    assert.strictEqual(physLabel.parentElement.querySelector("div").textContent, "0%");
  });

  await check("Executive Center's Physical Progress KPI reads 0.0% before any physical_progress is entered", async () => {
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    await flush();
    // UI/UX Overhaul Gate 5: the PROGRESS KPI section now lives on the Schedule
    // sub-tab, not the default Summary landing view.
    var scheduleTab = Array.from(outlet().querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Schedule");
    assert.ok(scheduleTab, "Schedule sub-tab not found");
    scheduleTab.click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Schedule Progress") !== -1);
    assert.ok(text.indexOf("Physical Progress") !== -1);
    // Schedule Progress should reflect the 40% entered above; Physical Progress must still be 0.
    var kpiValues = Array.from(outlet().querySelectorAll(".kpi-card")).map((c) => c.textContent);
    assert.ok(kpiValues.some((t) => t.indexOf("Physical Progress") !== -1 && t.indexOf("0%") !== -1), "expected Physical Progress KPI at 0%, got: " + kpiValues.join(" | "));
  });

  await check("the Activity form offers a Physical Progress (%) field, separate from % Complete", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    findButtonByText(dom, "Edit").click();
    var pctInput = outlet().querySelector("#actfield-percent_complete");
    var physInput = outlet().querySelector("#actfield-physical_progress");
    assert.ok(pctInput, "percent_complete input not found");
    assert.ok(physInput, "physical_progress input not found");
    assert.strictEqual(pctInput.value, "40");
    assert.strictEqual(physInput.value, "0");
  });

  await check("entering 65 in Physical Progress and saving persists physical_progress independently of percent_complete", () => {
    var physInput = outlet().querySelector("#actfield-physical_progress");
    physInput.value = "65";
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

    var data = win.PCC.store.get();
    var activity = data.activities.find((a) => a.id === activityId);
    assert.strictEqual(activity.physical_progress, 65);
    assert.strictEqual(activity.percent_complete, 40, "percent_complete must be untouched");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Activity Detail Panel now shows 65% Physical Progress alongside 40% Complete", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.render();
    var pctLabel = Array.from(outlet().querySelectorAll(".detail-item__label")).find((l) => l.textContent === "% Complete");
    var physLabel = Array.from(outlet().querySelectorAll(".detail-item__label")).find((l) => l.textContent === "Physical Progress");
    assert.strictEqual(pctLabel.parentElement.querySelector("div").textContent, "40%");
    assert.strictEqual(physLabel.parentElement.querySelector("div").textContent, "65%");
  });

  await check("Executive Center's Physical Progress KPI now reflects the entered value, distinct from Schedule Progress", async () => {
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    await flush();
    var scheduleTab = Array.from(outlet().querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Schedule");
    assert.ok(scheduleTab, "Schedule sub-tab not found");
    scheduleTab.click();
    await flush();
    var kpiValues = Array.from(outlet().querySelectorAll(".kpi-card")).map((c) => c.textContent);
    assert.ok(kpiValues.some((t) => t.indexOf("Schedule Progress") !== -1 && t.indexOf("40%") !== -1), "expected Schedule Progress at 40%, got: " + kpiValues.join(" | "));
    assert.ok(kpiValues.some((t) => t.indexOf("Physical Progress") !== -1 && t.indexOf("65%") !== -1), "expected Physical Progress at 65%, got: " + kpiValues.join(" | "));
  });

  await check("the activities list row shows both % complete and % physical", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    findButtonByText(dom, "Activities").click();
    // UI/UX Overhaul Gate 7 (Better Data Grids) split this row into real <table> cells —
    // "% Complete" and "% Physical" are now separate cell contents ("40%" / "65%
    // physical"), not one "40% complete" sentence.
    var text = outlet().textContent;
    assert.ok(text.indexOf("40%") !== -1, "expected '40%' in the activities grid, got: " + text);
    assert.ok(text.indexOf("65% physical") !== -1, "expected '65% physical' in the activities grid, got: " + text);
  });

  await check("this gate writes nothing back beyond the deliberate physical_progress edit above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.activities.length, 1);
    assert.strictEqual(data.schedules.length, 1);
    assert.strictEqual(data.projects.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding physical_progress data entry", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
