// End-to-end jsdom test against the ACTUAL bundled index.html for "final polish" Gate 1
// (the last remaining tier in this project's history — Tier 3, "final polish"). Two
// small, independent items, confirmed via AskUserQuestion after inspecting the full
// backlog: everything else on the list (report templates, dashboard filtering, resource
// rate/EVM, vendor-cost integration, commitments-EVM wiring, category reconciliation,
// Gantt virtualization) was either already resolved or is a real feature build, not a
// touch-up — those get their own separate gates.
//
// 1. Dashboard's "Due Soon" window (was a hardcoded DUE_SOON_WINDOW_DAYS=14 constant)
//    and Action Centre's "Upcoming" window (was a hardcoded UPCOMING_WINDOW_DAYS=30
//    constant) are now editable on the Settings page
//    (settings.document_reminder_due_soon_days / settings.action_centre_upcoming_days).
// 2. Gantt bars gain a small visual marker (a circle at the bar's top-right corner) when
//    the activity has a not-yet-available governing document requirement — the same
//    "Not Ready" rule the Activity Detail Panel's own Document Readiness section
//    (Gate 24) already computes, now also surfaced on the bar itself.
// schema_version 49 -> 50.
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

// The Settings page is React-controlled/uncontrolled-with-onChange. Setting `el.value = x`
// directly does NOT make React's onChange fire — React patches the native value-property
// setter (even for an uncontrolled input) to track "last known value," and a raw
// assignment updates that tracker too, so React sees no real change when the event fires
// next. Bypass React's patched setter via the native prototype descriptor first, then
// dispatch the event — see tests/test_document_types_e2e.js for the same pattern.
function setReactInputValue(win, el, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}
function todayPlusDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

  await check("app boots on the bundled index.html without throwing, schema_version is 50, both windows default to their old hardcoded values", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    var data = win.PCC.store.get();
    assert.ok(data.schema_version >= 50);
    assert.strictEqual(data.settings.document_reminder_due_soon_days, 14);
    assert.strictEqual(data.settings.action_centre_upcoming_days, 30);
  });

  await check("Settings has editable fields for both windows, and changing them persists to the store", () => {
    win.PCC.router.go("settings");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Reminder & Lookahead Windows") !== -1);

    var inputs = Array.from(outlet().querySelectorAll("input[type='number']"));
    var dueSoonInput = inputs.find((i) => i.value === "14");
    var upcomingInput = inputs.find((i) => i.value === "30");
    assert.ok(dueSoonInput, "due-soon window input not found");
    assert.ok(upcomingInput, "upcoming window input not found");

    setReactInputValue(win, dueSoonInput, "5");
    setReactInputValue(win, upcomingInput, "45");

    var data = win.PCC.store.get();
    assert.strictEqual(data.settings.document_reminder_due_soon_days, 5);
    assert.strictEqual(data.settings.action_centre_upcoming_days, 45);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var projectId, boqTypeId;
  await check("seed a project and a document requirement due in 10 days (inside the old 14-day default, outside the new 5-day setting)", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Windows Test Project" });
      d.projects.push(p);
      projectId = p.id;
      boqTypeId = d.document_types.find((t) => t.name === "BOQ").id;
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({
          project_id: projectId,
          document_type_id: boqTypeId,
          planned_submission_date: todayPlusDays(10),
        })
      );
    });
    assert.ok(projectId && boqTypeId);
  });

  await check("Dashboard's Due Soon reminders panel excludes the 10-day-out requirement now that the window is set to 5 days", () => {
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Nothing overdue or due within the next 5 days") !== -1, "empty-state text must reflect the configured 5-day window; got: " + text.slice(0, 400));
  });

  await check("widening the Due Soon window back to 14 days surfaces the same requirement again", () => {
    win.PCC.store.update(function (d) {
      d.settings.document_reminder_due_soon_days = 14;
    });
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Document Reminders (1)") !== -1, "got: " + text.slice(0, 300));
  });

  await check("Action Centre's Upcoming bucket label reflects the configured 45-day window", () => {
    win.PCC.router.go("actionCentre");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Upcoming (8–45 Days)") !== -1, "got: " + text.slice(0, 400));
  });

  var scheduleId, notReadyActivityId;
  await check("seed a schedule and an activity with planned dates, linked to an unfulfilled document requirement", () => {
    win.PCC.store.update(function (d) {
      var sch = win.PCC.store.newSchedule({ project_id: projectId, name: "Windows Test Schedule", data_date: "2026-03-01" });
      d.schedules.push(sch);
      scheduleId = sch.id;
      var a = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Excavate Foundation",
        activity_type: "task", duration: 5, planned_start: "2026-03-01", planned_finish: "2026-03-06",
      });
      d.activities.push(a);
      notReadyActivityId = a.id;
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: boqTypeId, activity_id: notReadyActivityId })
      );
    });
    assert.ok(scheduleId && notReadyActivityId);
  });

  await check("the Gantt bar for the not-ready activity shows a readiness marker, and the legend explains it", async () => {
    win.PCC.router.go("schedule");
    await flush();
    findButtonByText(dom, "Gantt").click();
    await flush();

    var svg = outlet().querySelector("svg");
    assert.ok(svg, "Gantt tab should render an <svg> chart");
    var marker = svg.querySelector('circle[data-readiness-marker-for="' + notReadyActivityId + '"]');
    assert.ok(marker, "expected a readiness marker circle on the not-ready activity's bar");
    assert.strictEqual(marker.getAttribute("style"), "pointer-events: none;", "the marker must not interfere with drag/resize hit-testing");

    var text = outlet().textContent;
    assert.ok(text.indexOf("Not Ready (governing document missing)") !== -1, "legend must explain the marker");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("attaching a matching document removes the readiness marker on the next render", async () => {
    win.PCC.store.update(function (d) {
      d.documents.push(win.PCC.store.newDocument({ project_id: projectId, filename: "boq.pdf", document_type_id: boqTypeId }));
    });
    // A remount resets local tab state (reactBridge.js mounts a fresh root every
    // render()), so re-select the Gantt tab after the remount.
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "Gantt").click();
    await flush();

    var svg = outlet().querySelector("svg");
    var marker = svg.querySelector('circle[data-readiness-marker-for="' + notReadyActivityId + '"]');
    assert.strictEqual(marker, null, "the marker must disappear once the governing document is Available");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("an activity with zero linked document requirements never shows a readiness marker", async () => {
    var freeActivityId;
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Unrelated Task",
        activity_type: "task", duration: 3, planned_start: "2026-03-10", planned_finish: "2026-03-13",
      });
      d.activities.push(a);
      freeActivityId = a.id;
    });
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "Gantt").click();
    await flush();

    var svg = outlet().querySelector("svg");
    var marker = svg.querySelector('circle[data-readiness-marker-for="' + freeActivityId + '"]');
    assert.strictEqual(marker, null, "an activity with no linked requirements has nothing to flag");
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "lessonsLearned", "knowledgeBase", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after this gate's changes", async () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
