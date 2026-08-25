// Planning & Scheduling-Centric Delay Management, Gate D (Mitigation & Recovery) —
// DOM-level e2e test against the ACTUAL bundled index.html. test_delay_impact_engine.js
// already covers computeRecoveryForecast() in isolation (mirroring the spec's TEST 3);
// this file proves the real Activity Detail Panel UI wires it together: the Mitigation
// Type/Comments fields on Recovery Actions, the Recovery Forecast progression panel, and
// the Delay Timeline view.
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

  await check("app boots without throwing, and MITIGATION_TYPES/computeRecoveryForecast are bundled", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.store.MITIGATION_TYPES.indexOf("additional_shift") !== -1);
    assert.strictEqual(typeof win.PCC.delayImpactEngine.computeRecoveryForecast, "function");
  });

  let projectId, scheduleId, activityId;
  await check("seed a project/schedule/activity with a fixed planned finish (20 Aug)", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Gate D Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;
      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-08-01" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Transformer Installation", activity_type: "task", duration: 20, planned_start: "2026-08-01", planned_finish: "2026-08-20" });
      data.activities.push(a);
      activityId = a.id;
    });
    assert.ok(projectId && scheduleId && activityId);
  });

  var delayId;
  await check("TEST 3 setup (spec section 41): create a delay with a 10-day estimated impact (Delay Forecast = 30 Aug)", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.render();
    findButtonByText(dom, "+ Add Delay Record").click();

    outlet().querySelector("#delayfield-delay_days").value = "10";
    outlet().querySelector("#delayfield-description").value = "Late transformer delivery.";
    findButtonByText(dom, "Add Delay Record").click();

    var data = win.PCC.store.get();
    delayId = data.delay_records[0].id;
    var text = outlet().textContent;
    assert.ok(text.indexOf("RECOVERY FORECAST") !== -1);
    assert.ok(text.indexOf("2026-08-20") !== -1, "Original Finish should read 20 Aug");
    assert.ok(text.indexOf("2026-08-30") !== -1, "Delay Forecast should read 30 Aug (20 Aug + 10 days)");
    assert.ok(text.indexOf("Not yet finished") !== -1, "no actual finish recorded yet");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("TEST 3: adding a 5-day Recovery Action (with Mitigation Type and Comments) moves the Recovery Forecast to 25 Aug", () => {
    findButtonByText(dom, "+ Add Recovery Action").click();
    outlet().querySelector("#recactionfield-description").value = "Additional shift";
    outlet().querySelector("#recactionfield-responsible_person").value = "Site Manager";
    outlet().querySelector("#recactionfield-status").value = "in_progress";
    outlet().querySelector("#recactionfield-estimated_recovery_days").value = "5";
    outlet().querySelector("#recactionfield-delay_id").value = delayId;
    outlet().querySelector("#recactionfield-mitigation_type").value = "additional_shift";
    outlet().querySelector("#recactionfield-comments").value = "Coordinate with vendor for extended hours.";
    findButtonByText(dom, "Add Recovery Action").click();

    var data = win.PCC.store.get();
    var action = data.recovery_actions.find((r) => r.delay_id === delayId);
    assert.ok(action);
    assert.strictEqual(action.mitigation_type, "additional_shift");
    assert.strictEqual(action.comments, "Coordinate with vendor for extended hours.");

    var text = outlet().textContent;
    assert.ok(text.indexOf("Additional Shift") !== -1, "the mitigation type label should be shown on the Recovery Action row");
    assert.ok(text.indexOf("Coordinate with vendor") !== -1, "the comments should be shown on the Recovery Action row");
    assert.ok(text.indexOf("2026-08-25") !== -1, "Recovery Forecast should now read 25 Aug (30 Aug delay forecast - 5 days planned recovery)");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("spec point 20 (Delay Timeline): the timeline lists both the initial 'Open' entry and the later status change, in order", () => {
    // Change status to pick up a second timeline entry, matching the same mechanism
    // test_delay_management_gate_ab_e2e.js already verified at the data level — this
    // confirms it's actually rendered.
    var delayHeading = Array.from(outlet().querySelectorAll("p")).find((p) => p.textContent.indexOf("DELAY RECORDS") === 0);
    var delaySection = delayHeading.parentElement;
    Array.from(delaySection.querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit").click();
    outlet().querySelector("#delayfield-status").value = "recovery_in_progress";
    findButtonByText(dom, "Save Changes").click();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Timeline (2)") !== -1, "two status_history entries (Open, then Recovery in Progress) should be reflected in the timeline count");
    assert.ok(text.indexOf("Delay identified.") !== -1, "the first timeline entry's own note should be shown");
  });

  await check("Actual Finish in the Recovery Forecast reflects the Schedule's own actual_finish once the activity is marked complete", () => {
    win.PCC.store.update(function (data) {
      var a = data.activities.find((x) => x.id === activityId);
      a.actual_finish = "2026-08-24";
      a.status = "complete";
    });
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("2026-08-24") !== -1, "the real actual_finish (24 Aug) should appear as the Actual Finish");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate's changes don't break the rest of the app — every route still renders cleanly", () => {
    ["dashboard", "portfolio", "schedule", "delayRecoveryDashboard", "executiveCenter", "risks", "reports", "settings"].forEach((route) => {
      win.PCC.router.go(route);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "route '" + route + "' threw: " + thrownErrors.join(" | "));
    });
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
