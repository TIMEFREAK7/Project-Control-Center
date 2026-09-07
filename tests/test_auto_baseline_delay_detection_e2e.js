// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 26 (Auto Baseline Delay
// Detection). Feature request #2/#3 from Aditya's own list: "if the activity starts and finishes
// after its baseline that activity will automatically go in delay registry" / "if later I changed
// the dates back within baseline the activity will no longer be in delay registry." Confirmed via
// AskUserQuestion: auto-resolve and keep the record (never auto-delete).
//
// runAutoDelayDetection() (scheduleService.ts) reuses the project's existing OFFICIAL baseline
// (the same one Executive Center's Schedule Variance already measures against — see
// test_baseline_revision_control_e2e.js) rather than inventing a second "which baseline counts"
// concept, and is wired into runCalculation(), saveActivity(), commitInlineActivityEdit(),
// bulkShiftActivities(), and toggleOfficialBaseline() itself.
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
  for (let i = 0; i < 20; i++) await sleep(0);
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

  await check("app boots on the bundled index.html without throwing, and DELAY_RECORD_STATUSES includes 'resolved'", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.store.DELAY_RECORD_STATUSES.indexOf("resolved") !== -1);
    var rec = win.PCC.store.newDelayRecord({});
    assert.strictEqual(rec.auto_generated, false, "a manually created Delay Record defaults to auto_generated:false");
  });

  let projectId, scheduleId, activityId;
  await check("seed a project/schedule/activity with a 10-day baseline, no Official baseline captured yet", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Auto-Delay Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;
      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-01-01" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;
      var a = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Foundation Works",
        activity_type: "task", duration: 10, planned_start: "2026-01-01", planned_finish: "2026-01-11",
      });
      data.activities.push(a);
      activityId = a.id;
    });
    assert.ok(projectId && scheduleId && activityId);
  });

  await check("Calculate Schedule with no Official baseline creates no delay records (nothing to compare against yet)", async () => {
    win.PCC.router.go("schedule");
    await flush();
    findButtonByText(dom, "Calculate Schedule").click();
    await flush();
    assert.strictEqual(win.PCC.store.get().delay_records.length, 0);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Save Baseline, then Mark Official — still no delay records (the schedule hasn't slipped from its own just-captured baseline)", async () => {
    findButtonByText(dom, "Save Baseline").click();
    await flush();
    var baselinesTabBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Baselines");
    baselinesTabBtn.click();
    await flush();
    var officialBtn = findButtonByText(dom, "Mark Official");
    assert.ok(officialBtn, "Mark Official button not found");
    officialBtn.click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedule_baselines[0].is_official, true);
    assert.strictEqual(data.delay_records.length, 0, "no slip yet — marking Official on an up-to-date schedule must not invent a delay");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("extending the activity's duration past its baseline finish auto-creates an auto_generated Delay Record on the next Calculate Schedule", async () => {
    win.PCC.store.update(function (data) {
      var a = data.activities.find((x) => x.id === activityId);
      a.duration = 16; // 2026-01-01 + 16d => finishes 2026-01-17, 6 days past the 2026-01-11 baseline
    });
    var activitiesTabBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Activities");
    activitiesTabBtn.click();
    await flush();
    findButtonByText(dom, "Calculate Schedule").click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 1, "the schedule slip past the Official baseline should auto-create exactly one Delay Record");
    var rec = data.delay_records[0];
    assert.strictEqual(rec.activity_id, activityId);
    assert.strictEqual(rec.auto_generated, true);
    assert.strictEqual(rec.status, "open");
    assert.strictEqual(rec.delay_days, 6);
    assert.strictEqual(rec.status_history.length, 1);
    assert.strictEqual(rec.status_history[0].status, "open");

    var link = data.delay_activity_links.find((l) => l.delay_id === rec.id);
    assert.ok(link, "an auto-created Delay Record must still get its own delay_activity_links snapshot, same as a manual one");
    assert.strictEqual(link.original_planned_finish, "2026-01-11", "the snapshot must be the BASELINE finish, not the current one");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("re-running Calculate Schedule while still slipped does not create a second Delay Record (no duplicates)", async () => {
    findButtonByText(dom, "Calculate Schedule").click();
    await flush();
    assert.strictEqual(win.PCC.store.get().delay_records.length, 1, "must never duplicate an already-open auto-generated record for the same activity");
  });

  await check("the Delay Record shows an 'Auto-Detected' badge on the Activity Detail Panel", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.render();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Auto-Detected") !== -1, "expected the Auto-Detected badge on the auto-created Delay Record");
  });

  await check("editing the activity's dates back within baseline auto-resolves the Delay Record (status flips to 'resolved', never deleted)", async () => {
    win.PCC.store.update(function (data) {
      var a = data.activities.find((x) => x.id === activityId);
      a.duration = 10; // back to exactly the baseline's own 10-day duration
    });
    var activitiesTabBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Activities");
    activitiesTabBtn.click();
    await flush();
    findButtonByText(dom, "Calculate Schedule").click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 1, "auto-resolve must keep the record, never delete it");
    var rec = data.delay_records[0];
    assert.strictEqual(rec.status, "resolved");
    assert.strictEqual(rec.status_history.length, 2, "a real status change must append to the timeline, not overwrite it");
    assert.strictEqual(rec.status_history[1].status, "resolved");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("slipping past baseline again after a resolve creates a FRESH Delay Record (the resolved one is left alone as history)", async () => {
    win.PCC.store.update(function (data) {
      var a = data.activities.find((x) => x.id === activityId);
      a.duration = 13; // finishes 3 days past baseline again (10 -> 13, same 1:1 as the 10 -> 16 -> +6d case above)
    });
    var activitiesTabBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Activities");
    activitiesTabBtn.click();
    await flush();
    findButtonByText(dom, "Calculate Schedule").click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 2, "the old resolved record stays as history; a new one opens for the new slip");
    var openRec = data.delay_records.find((r) => r.status === "open");
    var resolvedRec = data.delay_records.find((r) => r.status === "resolved");
    assert.ok(openRec && resolvedRec);
    assert.strictEqual(openRec.auto_generated, true);
    assert.strictEqual(openRec.delay_days, 3);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a MANUALLY created Delay Record for the same activity is never touched by auto-resolve", async () => {
    var manualId;
    win.PCC.store.update(function (data) {
      var manual = win.PCC.store.newDelayRecord({
        activity_id: activityId, project_id: projectId, description: "Manually logged: site access dispute.",
        status: "investigating", identified_date: "2026-01-05",
      });
      data.delay_records.push(manual);
      manualId = manual.id;
      // Bring the activity back within baseline again — only the auto-generated OPEN
      // record from the previous check should be touched by this.
      var a = data.activities.find((x) => x.id === activityId);
      a.duration = 10;
    });
    var activitiesTabBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Activities");
    activitiesTabBtn.click();
    await flush();
    findButtonByText(dom, "Calculate Schedule").click();
    await flush();

    var data = win.PCC.store.get();
    var manual = data.delay_records.find((r) => r.id === manualId);
    assert.strictEqual(manual.status, "investigating", "a manually created record must never be auto-resolved");
    assert.strictEqual((manual.status_history || []).length, 0, "a manual record's status_history must be untouched by the auto pass");

    var autoRecords = data.delay_records.filter((r) => r.auto_generated);
    assert.ok(autoRecords.every((r) => r.status === "resolved"), "every auto-generated record should now be resolved (both the original and the re-slip one)");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate's changes don't break the rest of the app — every route still renders cleanly", async () => {
    var routes = [
      "dashboard", "myWork", "actionCentre", "portfolio", "executiveCenter", "schedule",
      "delayRecoveryDashboard", "risks", "meetings", "rfis", "changeOrders", "settings",
    ];
    for (var i = 0; i < routes.length; i++) {
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "route '" + routes[i] + "' threw: " + thrownErrors.join(" | "));
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
