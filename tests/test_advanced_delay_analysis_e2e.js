// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 23 (PCC Evolution
// Roadmap, Tier F: Advanced Delay Analysis — 2026-08-20). Inspection found the existing Delay &
// Recovery Dashboard was a recovery-actions rollup only (no delay causation/classification
// anywhere), and scheduleBaselineEngine.js's compareBaselineToCurrent() already carried
// baseline/current total_float per activity but never derived float erosion from it. Aditya
// confirmed via AskUserQuestion: delay causation gets its own new register (Delay Records, not
// fields bolted onto Activity), with a practical/simple cause taxonomy (not a formal
// excusable-compensable/non-compensable/concurrent claims taxonomy).
//
// Three genuine gaps closed:
// - Delay Records: a new register (like Recovery Actions), full CRUD embedded in the Activity
//   Detail Panel (renderDelayRecordsSection() in schedule.js), capturing cause, responsibility,
//   excusable flag, and delay days for one delay event.
// - Float Erosion: baseline.total_float - current.total_float, derived and ranked in the
//   Baselines tab's "Compare to Current" result (schedule.js) — computable before this gate but
//   never surfaced.
// - Portfolio-wide Delay Analysis rollup (severity bucketing, causation breakdown) added to
//   delayRecoveryDashboard.js, which previously explicitly stayed recovery-actions-only.
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

  await check("app boots on the bundled index.html without throwing, and DELAY_RECORD_CAUSES is bundled", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.deepStrictEqual(
      Array.from(win.PCC.store.DELAY_RECORD_CAUSES),
      ["owner_caused", "contractor_caused", "weather_force_majeure", "design_rfi_driven", "other"]
    );
  });

  // ---- Seed: one project, one schedule (data_date 2026-01-01), three activities:
  // A -> B (FS), and an unrelated longer C that anchors the project finish so B starts
  // with real float (10 days) before we erode it below. ----
  let projectId, scheduleId, activityAId, activityBId, activityCId;
  await check("seed a project/schedule with A -> B (FS) and an unrelated longer C giving B 10 days of float", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-01-01" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Design", activity_type: "task", duration: 5 });
      data.activities.push(a);
      activityAId = a.id;

      var b = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Foundation", activity_type: "task", duration: 5 });
      data.activities.push(b);
      activityBId = b.id;

      var c = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Long Lead Procurement", activity_type: "task", duration: 20 });
      data.activities.push(c);
      activityCId = c.id;

      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: activityAId, successor_id: activityBId, type: "FS", lag: 0 }));
    });
    assert.ok(projectId && scheduleId && activityAId && activityBId && activityCId);
  });

  await check("navigate to the schedule route, calculate, and confirm Foundation starts with 10 days of float", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var calcBtn = findButtonByText(dom, "Calculate Schedule");
    calcBtn.click();
    win.PCC.router.render();

    var data = win.PCC.store.get();
    var b = data.activities.find((x) => x.id === activityBId);
    assert.strictEqual(b.total_float, 10, "Foundation should have 10 days of float relative to the 20-day Procurement chain");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Save Baseline captures Foundation's float at 10 days", async () => {
    var saveBtn = findButtonByText(dom, "Save Baseline");
    saveBtn.click();
    await flush();
    var data = win.PCC.store.get();
    assert.strictEqual(data.schedule_baselines.length, 1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("adding a Delay Record from the Activity Detail Panel persists cause/days/excusable and shows the Non-Excusable badge by default", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityBId);
    win.PCC.router.render();

    var addBtn = findButtonByText(dom, "+ Add Delay Record");
    assert.ok(addBtn, "+ Add Delay Record button not found");
    addBtn.click();

    var causeSelect = outlet().querySelector("#delayfield-delay_cause");
    var daysInput = outlet().querySelector("#delayfield-delay_days");
    var respInput = outlet().querySelector("#delayfield-responsible_party");
    var descInput = outlet().querySelector("#delayfield-description");
    causeSelect.value = "contractor_caused";
    daysInput.value = "10";
    respInput.value = "ACME Contracting";
    descInput.value = "Foundation subcontractor mobilized 10 days late.";

    var saveBtn = findButtonByText(dom, "Add Delay Record");
    saveBtn.click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 1);
    var record = data.delay_records[0];
    assert.strictEqual(record.activity_id, activityBId);
    assert.strictEqual(record.delay_cause, "contractor_caused");
    assert.strictEqual(record.delay_days, 10);
    assert.strictEqual(record.responsible_party, "ACME Contracting");
    assert.strictEqual(record.is_excusable, false);

    var text = outlet().textContent;
    assert.ok(text.indexOf("Contractor-Caused") !== -1);
    assert.ok(text.indexOf("Non-Excusable") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("editing the Delay Record to mark it Excusable flips the badge", () => {
    var editBtn = findButtonByText(dom, "Edit");
    assert.ok(editBtn, "Edit button for the delay record not found");
    editBtn.click();

    var excusableCheckbox = outlet().querySelector("#delayfield-is_excusable");
    assert.ok(excusableCheckbox, "excusable checkbox not found");
    excusableCheckbox.checked = true;
    var saveBtn = findButtonByText(dom, "Save Changes");
    saveBtn.click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records[0].is_excusable, true);
    assert.ok(outlet().textContent.indexOf("Excusable") !== -1);
    assert.strictEqual(outlet().textContent.indexOf("Non-Excusable"), -1, "badge text must have flipped, not just appended");
  });

  await check("eroding Foundation's float to 0 (now critical) and comparing to the baseline shows it in Float Erosion, along with Design (its predecessor, now also critical since the chain it feeds is)", async () => {
    win.PCC.store.update(function (d) {
      var b = d.activities.find((x) => x.id === activityBId);
      b.duration = 20; // was 5 — Foundation now finishes as late as Procurement, consuming all its float
    });
    var calcBtn = findButtonByText(dom, "Calculate Schedule");
    calcBtn.click();
    win.PCC.router.render();

    var data = win.PCC.store.get();
    var b = data.activities.find((x) => x.id === activityBId);
    assert.strictEqual(b.total_float, 0, "Foundation should now be exactly critical (0 float) after consuming all 10 baseline days");

    var baselinesTabBtn = Array.from(win.document.querySelectorAll("button")).find((btn) => btn.textContent.trim() === "Baselines");
    baselinesTabBtn.click();
    var compareBtn = findButtonByText(dom, "Compare to Current");
    compareBtn.click();
    await flush();

    var text = outlet().textContent;
    // Both Foundation AND its predecessor Design erode to 0 float: once Foundation
    // becomes critical, delaying Design delays that now-critical chain too, so Design's
    // own float collapses right along with it — a real demonstration of critical-path
    // float erosion cascading backward through logic, not just the one directly-edited
    // activity.
    assert.ok(text.indexOf("Float Erosion (2)") !== -1, "expected both Foundation and Design in the Float Erosion list; got: " + text.slice(0, 200));
    assert.ok(text.indexOf("Foundation") !== -1);
    assert.ok(text.indexOf("Design") !== -1);
    assert.ok(text.indexOf("10d → 0d float (−10d)") !== -1, "expected the exact baseline→current float text; got: " + text.slice(text.indexOf("Float Erosion"), text.indexOf("Float Erosion") + 300));
    assert.ok(text.indexOf("now critical") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Delay & Recovery Dashboard rolls up Delay Analysis: KPIs, cause/severity breakdown, and worst-first list", () => {
    win.PCC.router.go("delayRecoveryDashboard");
    win.PCC.router.render();

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    function kpiValue(label) {
      var card = kpiCards.find((c) => c.textContent.indexOf(label) !== -1);
      return card ? card.querySelector(".kpi-card__value").textContent : undefined;
    }
    assert.strictEqual(kpiValue("DELAY RECORDS"), "1");
    assert.strictEqual(kpiValue("TOTAL DELAY DAYS"), "10");
    assert.strictEqual(kpiValue("EXCUSABLE"), "1");
    assert.strictEqual(kpiValue("NON-EXCUSABLE"), "0");

    var text = outlet().textContent;
    assert.ok(text.indexOf("By cause:") !== -1 && text.indexOf("Contractor-Caused (1)") !== -1);
    assert.ok(text.indexOf("By severity:") !== -1 && text.indexOf("Moderate (5-15d) (1)") !== -1);
    assert.ok(text.indexOf("Delay Records (worst first)") !== -1);
    assert.ok(text.indexOf("ACME Contracting") === -1, "responsible_party isn't rendered on the dashboard row — description/cause/severity is");
    assert.ok(text.indexOf("Foundation subcontractor mobilized 10 days late.") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'View in Schedule' from the dashboard's delay-records list navigates to the right activity", () => {
    var viewBtn = findButtonByText(dom, "View in Schedule");
    assert.ok(viewBtn, "View in Schedule button not found");
    viewBtn.click();
    win.PCC.router.render();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    assert.ok(outlet().textContent.indexOf("Foundation") !== -1);
  });

  await check("removing the Delay Record deletes it and the dashboard reflects zero delay records again", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityBId);
    win.PCC.router.render();
    var removeBtn = findButtonByText(dom, "Remove");
    // The Activity Detail Panel also has a "Remove" nowhere else at this point (Recovery
    // Actions section is empty), so this is unambiguously the delay record's Remove button.
    assert.ok(removeBtn);
    removeBtn.click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 0);

    win.PCC.router.go("delayRecoveryDashboard");
    win.PCC.router.render();
    // No recovery actions exist in this test's seed either, so with delay_records also
    // back to zero, the dashboard's COMBINED empty state fires (both registers empty),
    // not the delay-records-only "No delay records logged..." sub-empty-state (which
    // only ever renders when the OTHER register, recovery actions, is non-empty).
    assert.ok(outlet().textContent.indexOf("Nothing to show yet.") !== -1, "got: " + outlet().textContent);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back beyond the deliberate seed/edit/delete above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.activities.length, 3);
    assert.strictEqual(data.relationships.length, 1);
    assert.strictEqual(data.schedules.length, 1);
    assert.strictEqual(data.schedule_baselines.length, 1);
    assert.strictEqual(data.delay_records.length, 0);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 23 (Advanced Delay Analysis)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
