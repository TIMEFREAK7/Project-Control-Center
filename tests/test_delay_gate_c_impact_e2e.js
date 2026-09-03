// Planning & Scheduling-Centric Delay Management, Gate C (Float & Impact) — DOM-level
// e2e test against the ACTUAL bundled index.html. Gates A/B's own test file
// (test_delay_management_gate_ab_e2e.js) already covers the data foundation and basic
// schedule-derived Impact Summary; this file is scoped to what Gate C specifically adds:
// the milestone picker (spec point 33's own "MILESTONE IMPACT" section — the
// milestone_activity_id field existed since Gate A but had no UI to set it until now),
// and Project Finish Impact actually being computed and shown once a delay is on the
// critical path (spec points 11/15 — "Delay Days != Project Delay Days," Level 4).
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
// schedule.js is React-migrated: form fields are React-controlled, so a raw `.value =`
// assignment doesn't reliably reach onChange — see CLAUDE.md's React migration notes.
function setReactSelectValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}
function setReactInputValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
}
function setReactTextareaValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
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

  // A (10d) -> B (10d), fully critical (no parallel path gives either any float) ->
  // M, a milestone succeeding B. Everything on the one chain is critical the instant
  // "Calculate Schedule" runs, so a delay linked to A is critical from the start —
  // exactly the condition Project Finish Impact needs to actually compute.
  let projectId, scheduleId, activityAId, activityBId, milestoneId;
  await check("seed A -> B -> M (milestone), a fully critical chain, and calculate", async () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Gate C Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;
      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-01-01" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Foundation Works", activity_type: "task", duration: 10, planned_start: "2026-01-01", planned_finish: "2026-01-11" });
      data.activities.push(a);
      activityAId = a.id;
      var b = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Structure Works", activity_type: "task", duration: 10, planned_start: "2026-01-11", planned_finish: "2026-01-21" });
      data.activities.push(b);
      activityBId = b.id;
      var m = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Structure Complete", activity_type: "milestone", duration: 0, planned_start: "2026-01-21", planned_finish: "2026-01-21" });
      data.activities.push(m);
      milestoneId = m.id;
      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: activityAId, successor_id: activityBId, type: "FS", lag: 0 }));
      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: activityBId, successor_id: milestoneId, type: "FS", lag: 0 }));
    });
    win.PCC.router.go("schedule");
    await flush();
    findButtonByText(dom, "Calculate Schedule").click();
    await flush();
    var a = win.PCC.store.get().activities.find((x) => x.id === activityAId);
    assert.strictEqual(a.total_float, 0, "the only path in the schedule must be fully critical");
  });

  var delayId;
  await check("the Delay Record form offers milestone-type activities as 'Affected Milestone', and selecting one auto-links it with its own snapshot", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityAId);
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "+ Add Delay Record").click();
    await flush();

    var milestoneSelect = outlet().querySelector("#delayfield-milestone_activity_id");
    assert.ok(milestoneSelect, "'Affected Milestone' picker not found on the Delay Record form");
    var opt = Array.from(milestoneSelect.options).find((o) => o.textContent === "Structure Complete");
    assert.ok(opt, "the milestone activity should be offered by name");
    setReactSelectValue(win, milestoneSelect, milestoneId);

    setReactTextareaValue(win, outlet().querySelector("#delayfield-description"), "Late rebar delivery holding up Foundation Works.");
    setReactInputValue(win, outlet().querySelector("#delayfield-delay_days"), "5");
    findButtonByText(dom, "Add Delay Record").click();
    await flush();

    var data = win.PCC.store.get();
    var rec = data.delay_records[0];
    delayId = rec.id;
    assert.strictEqual(rec.milestone_activity_id, milestoneId);
    var msLink = data.delay_activity_links.find((l) => l.delay_id === delayId && l.activity_id === milestoneId);
    assert.ok(msLink, "selecting a milestone must auto-create its own delay_activity_links snapshot");
    assert.strictEqual(msLink.original_planned_finish, "2026-01-21");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Impact Summary shows 'Milestone Impact: None' style output correctly reflects the linked milestone by name when nothing has slipped yet", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Milestone Impact") !== -1);
    assert.ok(text.indexOf("Structure Complete") !== -1, "the milestone's own name should appear in the Impact Summary");
  });

  await check("Project Finish Impact is computed (via the REAL CPM engine, read-only) once a linked activity is critical, and shows 'No current impact' before any schedule change", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("CRITICAL") !== -1, "Foundation Works has zero float on this single-chain schedule — must read as CRITICAL");
    assert.ok(text.indexOf("Project Finish Impact") !== -1);
    assert.ok(text.indexOf("No current impact") !== -1, "no schedule change has happened yet — project finish must show no impact");
  });

  await check("growing the critical activity's duration and recalculating moves Project Finish Impact by the same amount, and Milestone Impact reflects the slip too", async () => {
    win.PCC.store.update(function (data) {
      var a = data.activities.find((x) => x.id === activityAId);
      a.duration = 15; // 5-day growth on the critical path
      a.remaining_duration = 15;
      a.original_duration = 15;
    });
    win.PCC.router.go("schedule");
    await flush();
    findButtonByText(dom, "Calculate Schedule").click();
    await flush();

    win.PCC.schedule.viewActivity(projectId, scheduleId, activityAId);
    win.PCC.router.render();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("+5d") !== -1, "a 5-day critical-path growth must show as +5d somewhere in the Impact Summary (Activity Impact/Project Finish Impact): " + text.slice(0, 800));
    // Both the milestone (Structure Complete) and the project finish sit on this one
    // chain, so both must move by exactly the same 5 days — proving Level 3 (milestone)
    // and Level 4 (project) are each computed from the real schedule, not guessed.
    var occurrencesOfPlus5 = (text.match(/\+5d/g) || []).length;
    assert.ok(occurrencesOfPlus5 >= 2, "expected +5d to appear for both Milestone Impact and Project Finish Impact, got " + occurrencesOfPlus5 + " occurrence(s)");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate's changes don't break the rest of the app — every route still renders cleanly", async () => {
    for (const route of ["dashboard", "portfolio", "schedule", "delayRecoveryDashboard", "executiveCenter", "risks", "reports", "settings"]) {
      win.PCC.router.go(route);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "route '" + route + "' threw: " + thrownErrors.join(" | "));
    }
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
