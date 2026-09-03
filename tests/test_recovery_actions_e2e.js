// End-to-end jsdom test against the ACTUAL bundled index.html for Recovery Actions
// (PCC Evolution Roadmap, Tier C: Delay & Recovery Management — entry half, 2026-08-19).
// A fresh inspection found Delay analysis already shipped (Gate 4/5's baseline compare —
// finish variance, delayed/ahead/on-time counts) but Recovery had zero footprint
// anywhere. This gate adds recovery_actions: corrective actions logged against a
// Schedule activity, entered from that activity's own Detail Panel — description,
// responsible person, target recovery date, status. Covers: add/edit/remove, the
// overdue computation, and that deleting an activity cascades its recovery actions
// (unlike risks/rfis/meetings, whose activity_id link is allowed to go stale — a
// recovery action has no independent existence apart from the activity it recovers).
// schema_version 36 -> 37.
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.pages.schedule, "schedule page module must be bundled");
  });

  var projectId, scheduleId, activityId, activity2Id;
  await check("seed a project, a schedule, and two activities via the store", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Recovery Actions Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(s);
      scheduleId = s.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Structural Steel Erection", activity_type: "task", duration: 20 });
      d.activities.push(a);
      activityId = a.id;
      var a2 = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Doomed Activity", activity_type: "task", duration: 5 });
      d.activities.push(a2);
      activity2Id = a2.id;
    });
    assert.ok(projectId && scheduleId && activityId && activity2Id);
  });

  await check("the Activity Detail Panel shows 'RECOVERY ACTIONS (0)' and the empty state before any action is logged", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.go("schedule");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("RECOVERY ACTIONS (0)") !== -1, "got: " + text.match(/RECOVERY ACTIONS \(\d+\)/));
    assert.ok(text.indexOf("No recovery actions logged against this activity yet.") !== -1);
  });

  await check("'+ Add Recovery Action' opens a form requiring a description", async () => {
    findButtonByText(dom, "+ Add Recovery Action").click();
    await flush();
    var descInput = outlet().querySelector("#recactionfield-description");
    assert.ok(descInput, "description field not found");
    var form = Array.from(outlet().querySelectorAll("form")).find((f) => f.querySelector("#recactionfield-description"));
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Description is required.") !== -1);
    var data = win.PCC.store.get();
    assert.strictEqual(data.recovery_actions.length, 0, "nothing should be saved when validation fails");
  });

  var overdueId;
  await check("filling in and submitting the form persists a new, overdue recovery action (target date in the past, status open)", async () => {
    setReactTextareaValue(win, outlet().querySelector("#recactionfield-description"), "Add night shift crew to catch up structural steel");
    setReactInputValue(win, outlet().querySelector("#recactionfield-responsible_person"), "Site Manager");
    setReactInputValue(win, outlet().querySelector("#recactionfield-target_recovery_date"), "2020-01-01");
    setReactSelectValue(win, outlet().querySelector("#recactionfield-status"), "open");
    var form = Array.from(outlet().querySelectorAll("form")).find((f) => f.querySelector("#recactionfield-description"));
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.recovery_actions.length, 1);
    var action = data.recovery_actions[0];
    overdueId = action.id;
    assert.strictEqual(action.activity_id, activityId);
    assert.strictEqual(action.project_id, projectId);
    assert.strictEqual(action.description, "Add night shift crew to catch up structural steel");
    assert.strictEqual(action.status, "open");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Detail Panel now shows 'RECOVERY ACTIONS (1)' with an 'Overdue' badge (past target date, still open)", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("RECOVERY ACTIONS (1)") !== -1);
    assert.ok(text.indexOf("Add night shift crew to catch up structural steel") !== -1);
    var badges = Array.from(outlet().querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(badges.indexOf("Overdue") !== -1, "expected an Overdue badge; got: " + badges.join(", "));
  });

  await check("editing the action to status 'completed' clears the Overdue badge even though the target date is still in the past", async () => {
    findButtonByText(dom, "Edit").click();
    await flush();
    setReactSelectValue(win, outlet().querySelector("#recactionfield-status"), "completed");
    var form = Array.from(outlet().querySelectorAll("form")).find((f) => f.querySelector("#recactionfield-description"));
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.recovery_actions.find((r) => r.id === overdueId).status, "completed");
    var badges = Array.from(outlet().querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(badges.indexOf("Overdue") === -1, "a completed action must never show Overdue regardless of target date");
    assert.ok(badges.indexOf("Completed") !== -1);
  });

  await check("'Remove' deletes the recovery action and the panel returns to the empty state", async () => {
    findButtonByText(dom, "Remove").click();
    await flush();
    var data = win.PCC.store.get();
    assert.strictEqual(data.recovery_actions.length, 0);
    var text = outlet().textContent;
    assert.ok(text.indexOf("RECOVERY ACTIONS (0)") !== -1);
    assert.ok(text.indexOf("No recovery actions logged against this activity yet.") !== -1);
  });

  await check("recovery actions on a different activity never show up on this one — no cross-contamination", async () => {
    win.PCC.store.update(function (d) {
      d.recovery_actions.push(win.PCC.store.newRecoveryAction({ activity_id: activity2Id, project_id: projectId, description: "Belongs to the other activity" }));
    });
    // A bare render() after a store mutation remounts the page (reactBridge.js mounts a
    // fresh root every render()) — re-call the pending-prop setter so the detail panel
    // stays open on the same activity, matching CLAUDE.md's React migration notes.
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.render();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("RECOVERY ACTIONS (0)") !== -1, "Structural Steel Erection's panel must still show 0");
    assert.ok(text.indexOf("Belongs to the other activity") === -1);
  });

  await check("deleting an activity cascades its recovery actions, unlike risks/rfis/meetings whose activity_id link is left stale", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activity2Id);
    win.PCC.router.render();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("RECOVERY ACTIONS (1)") !== -1, "Doomed Activity must show its own recovery action before deletion");

    var origConfirm = win.confirm;
    win.confirm = () => true;
    findButtonByText(dom, "Delete").click();
    await flush();
    win.confirm = origConfirm;

    var data = win.PCC.store.get();
    assert.strictEqual(data.activities.find((a) => a.id === activity2Id), undefined, "activity must be deleted");
    assert.strictEqual(data.recovery_actions.length, 0, "the deleted activity's recovery action must be cascaded away, not left orphaned");
  });

  await check("this gate's own record counts are as expected after all edits above", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.activities.length, 1, "only Structural Steel Erection remains");
    assert.strictEqual(data.recovery_actions.length, 0);
    assert.strictEqual(data.schedules.length, 1);
    assert.strictEqual(data.projects.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding Recovery Actions", async () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
