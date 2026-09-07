// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 27 (Bulk/Full
// Delete). Feature request #9 from Aditya's own list: "there is no way to bulk delete
// files, activities. nor there is a way to completely delete the imported schedule."
// Documents.tsx already had full bulk-delete (soft-delete to Trash + permanent delete)
// before this gate — inspection confirmed that, so this gate is scoped to the two real
// gaps: bulk-deleting selected Activities on the Schedule page's Activities tab, and a
// real, full deleteSchedule() (distinct from the existing "archived" schedule status,
// which is for keeping an old revision around — this is for undoing a bad import).
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
function findButtonsByText(dom, text) {
  const buttons = Array.from(dom.window.document.querySelectorAll("button"));
  return buttons.filter((b) => b.textContent.trim() === text);
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
  const originalConfirm = dom.window.confirm;

  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  await check("app boots on the bundled index.html without throwing, and bulkDeleteActivities/deleteSchedule are wired", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Bulk delete activities ----
  let projectId, scheduleId, activityAId, activityBId, activityCId, delayId, recoveryId;
  await check("seed a project/schedule with A -> B (FS), an unrelated C, a Delay Record + Recovery Action on A, and calculate", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Bulk Delete Test Tower", status: "on_track" });
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
      var c = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Untouched", activity_type: "task", duration: 3 });
      data.activities.push(c);
      activityCId = c.id;
      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: activityAId, successor_id: activityBId, type: "FS", lag: 0 }));

      var delay = win.PCC.store.newDelayRecord({ activity_id: activityAId, project_id: projectId, description: "Late start", delay_days: 2 });
      data.delay_records.push(delay);
      delayId = delay.id;
      data.delay_activity_links.push(win.PCC.store.newDelayActivityLink({ delay_id: delayId, activity_id: activityAId, project_id: projectId, original_planned_start: "2026-01-01", original_planned_finish: "2026-01-06", original_total_float: 0 }));

      var recovery = win.PCC.store.newRecoveryAction({ activity_id: activityAId, project_id: projectId, description: "Add shift", delay_id: delayId });
      data.recovery_actions.push(recovery);
      recoveryId = recovery.id;
    });
    win.PCC.router.go("schedule");
  });
  await flush();

  await check("selecting Design and Foundation via their checkboxes and clicking 'Delete Selected' removes both plus their relationship, recovery action, and delay_activity_link — but leaves the third activity and the Delay Record itself untouched", async () => {
    // Both the desktop <table> grid and the mobile card list render in jsdom
    // simultaneously (only CSS media queries hide one of them in a real browser), each
    // with its OWN checkbox for the same activity — scope to the desktop table's own
    // checkboxes specifically so this doesn't double-count/double-toggle.
    var table = outlet().querySelector("table");
    assert.ok(table, "expected the desktop Activities data-table");
    var checkboxes = Array.from(table.querySelectorAll('input[aria-label="Select this activity for a bulk action"]'));
    assert.strictEqual(checkboxes.length, 3, "expected one checkbox per activity");
    checkboxes[0].click();
    checkboxes[1].click();
    await flush();

    win.confirm = () => true;
    findButtonByText(dom, "Delete Selected").click();
    win.confirm = originalConfirm;
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.activities.length, 1, "only the untouched third activity should remain");
    assert.strictEqual(data.activities[0].id, activityCId);
    assert.strictEqual(data.relationships.length, 0, "the A->B relationship must be removed");
    assert.strictEqual(data.recovery_actions.length, 0, "the recovery action on the deleted activity must be removed");
    assert.strictEqual(data.delay_activity_links.length, 0, "the delay_activity_link on the deleted activity must be removed");
    assert.strictEqual(data.delay_records.length, 1, "the Delay Record itself must survive — deleting an activity un-links, never cascade-deletes the Delay Record");
    assert.strictEqual(data.delay_records[0].id, delayId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Full schedule delete ----
  let scheduleId2, activityDId, baselineId;
  await check("seed a SECOND schedule (its own project) with an activity, a saved baseline, a Delay Record, and a Recovery Action", async () => {
    var seeded = {};
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Full Delete Test Tower", status: "on_track" });
      data.projects.push(project);
      seeded.projectId = project.id;
      var schedule = win.PCC.store.newSchedule({ project_id: project.id, name: "Bad Import", status: "active", data_date: "2026-01-01" });
      data.schedules.push(schedule);
      seeded.scheduleId = schedule.id;
      var a = win.PCC.store.newActivity({ project_id: project.id, schedule_id: schedule.id, name: "Junk Activity", activity_type: "task", duration: 5 });
      data.activities.push(a);
      seeded.activityId = a.id;
      var delay = win.PCC.store.newDelayRecord({ activity_id: a.id, project_id: project.id, description: "Irrelevant" });
      data.delay_records.push(delay);
      var recovery = win.PCC.store.newRecoveryAction({ activity_id: a.id, project_id: project.id, description: "Irrelevant" });
      data.recovery_actions.push(recovery);
    });
    projectId = seeded.projectId;
    scheduleId2 = seeded.scheduleId;
    activityDId = seeded.activityId;
    // A plain store.update() from outside the page's own event handlers doesn't
    // trigger a React refresh on its own (see CLAUDE.md's React migration notes) —
    // force a fresh render so the schedule-selector's <option> list picks up the
    // newly-seeded project/schedule before we try to select them below.
    win.PCC.router.render();
    await flush();

    // Switch the schedule picker to this new project/schedule, then Save Baseline
    // (real async IndexedDB write via scheduleBaselineStore) so deleteSchedule() has a
    // real snapshot to clean up too, not just the store row.
    var projectSelect = outlet().querySelector('select[aria-label="Select project"]');
    assert.ok(projectSelect, "'Select project' picker not found");
    Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(projectSelect, projectId);
    projectSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush();

    findButtonByText(dom, "Save Baseline").click();
    await flush();

    var data = win.PCC.store.get();
    baselineId = data.schedule_baselines.find((b) => b.schedule_id === scheduleId2).id;
    assert.ok(baselineId, "expected a saved baseline for the new schedule");
    var snapshot = await win.PCC.scheduleBaselineStore.getSnapshot(baselineId);
    assert.ok(snapshot, "the baseline's snapshot must actually exist in IndexedDB before we test deleting it");
  });

  await check("'Delete Schedule' from the ⋯ Schedule actions menu removes the schedule, its activity, its baseline (store row AND IndexedDB snapshot), and everything referencing that activity — but the OTHER project/schedule from the earlier check is untouched", async () => {
    var scheduleActionsBtn = outlet().querySelector('button[aria-label="Schedule actions"]');
    assert.ok(scheduleActionsBtn, "'Schedule actions' (⋯) menu toggle not found");
    scheduleActionsBtn.click();
    await flush();
    var deleteScheduleBtn = findButtonByText(dom, "Delete Schedule…");
    assert.ok(deleteScheduleBtn, "'Delete Schedule…' menu item not found");

    win.confirm = () => true;
    deleteScheduleBtn.click();
    win.confirm = originalConfirm;
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedules.find((s) => s.id === scheduleId2), undefined, "the schedule itself must be gone");
    assert.strictEqual(data.activities.find((a) => a.id === activityDId), undefined, "its activity must be gone");
    assert.strictEqual(data.delay_records.find((r) => r.activity_id === activityDId), undefined, "its Delay Record must be gone too (full schedule delete cascades, unlike a single activity delete)");
    assert.strictEqual(data.recovery_actions.find((r) => r.activity_id === activityDId), undefined, "its Recovery Action must be gone too");
    assert.strictEqual(data.schedule_baselines.find((b) => b.id === baselineId), undefined, "its baseline store row must be gone");
    var snapshotAfter = await win.PCC.scheduleBaselineStore.getSnapshot(baselineId);
    assert.strictEqual(snapshotAfter, null, "the baseline's IndexedDB snapshot must actually be deleted, not just the store row");

    // The first schedule (from the bulk-delete checks above) must be completely untouched.
    assert.ok(data.schedules.find((s) => s.id === scheduleId), "the unrelated first schedule must survive");
    assert.ok(data.activities.find((a) => a.id === activityCId), "the unrelated first schedule's surviving activity must still be there");
    assert.ok(data.delay_records.find((r) => r.id === delayId), "the unrelated first schedule's Delay Record must still be there");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate's changes don't break the rest of the app — every route still renders cleanly", async () => {
    var routes = [
      "dashboard", "myWork", "actionCentre", "portfolio", "executiveCenter", "schedule",
      "delayRecoveryDashboard", "documents", "risks", "meetings", "settings",
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
