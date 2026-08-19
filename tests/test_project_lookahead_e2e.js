// End-to-end jsdom test against the ACTUAL bundled index.html for the Project Lookahead —
// PCC Evolution Roadmap Gate 2 (2026-08-19, this session's own numbering: Gate 30). A new
// page showing a flat, chronological, forward-only view of what's coming up in a 7/14/30/60
// day window: Schedule activities/milestones (new — first cross-module planner view to touch
// Schedule), upcoming Meetings (new), Meeting Actions, RFI/TQ, and Document Requirements
// (reused from Gate 29's Planner Action Centre). No schema changes.
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
function findButtonInRowByText(dom, rowText, buttonText) {
  const buttons = Array.from(dom.window.document.querySelectorAll("button")).filter((b) => b.textContent.trim() === buttonText);
  return buttons.find((b) => b.parentElement.parentElement.textContent.indexOf(rowText) !== -1);
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.pages.projectLookahead, "projectLookahead page module must be bundled");
  });

  await check("Project Lookahead shows its empty state and defaults to a 7-day window before any project exists", () => {
    win.PCC.router.go("projectLookahead");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Project Lookahead") !== -1);
    assert.ok(text.indexOf("next 7 days") !== -1);
    assert.ok(text.indexOf("Nothing scheduled, due, or required in the next 7 days") !== -1);
  });

  var projectId, archivedProjectId, scheduleId;
  await check("seed one active project (with an active schedule), one archived project (with its own schedule), and a document type", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Lookahead Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(s);
      scheduleId = s.id;

      var arch = win.PCC.store.newProject({ name: "Archived Lookahead Project", archived: true });
      d.projects.push(arch);
      archivedProjectId = arch.id;
      var archSchedule = win.PCC.store.newSchedule({ project_id: archivedProjectId, name: "Archived Schedule", status: "active" });
      d.schedules.push(archSchedule);
      d.activities.push(
        win.PCC.store.newActivity({ project_id: archivedProjectId, schedule_id: archSchedule.id, name: "Archived project activity", activity_type: "task", early_start: todayPlusDays(2), status: "not_started" })
      );
    });
    assert.ok(projectId && archivedProjectId && scheduleId);
  });

  var criticalActId, nearCriticalActId, onTrackActId, milestoneId, farFutureActId;
  await check("seed schedule activities/milestones covering every filter: critical, near-critical, on-track, a milestone, a structural summary row (excluded), a completed activity (excluded), a past-due activity (excluded, forward-only), and a far-future activity (day 45, outside every window except 60)", () => {
    win.PCC.store.update(function (d) {
      var critical = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Critical foundation pour", activity_type: "task", early_start: todayPlusDays(3), total_float: -2, status: "not_started", responsible_person: "Site Team" });
      d.activities.push(critical);
      criticalActId = critical.id;

      var nearCritical = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Near critical steel erection", activity_type: "task", early_start: todayPlusDays(5), total_float: 3, status: "not_started" });
      d.activities.push(nearCritical);
      nearCriticalActId = nearCritical.id;

      var onTrack = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "On track cabling", activity_type: "task", early_start: todayPlusDays(6), total_float: 20, status: "not_started" });
      d.activities.push(onTrack);
      onTrackActId = onTrack.id;

      var milestone = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Substantial completion milestone", activity_type: "milestone", early_start: todayPlusDays(2), status: "not_started" });
      d.activities.push(milestone);
      milestoneId = milestone.id;

      d.activities.push(win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "WBS summary row", activity_type: "summary", early_start: todayPlusDays(1), status: "not_started" }));
      d.activities.push(win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Already completed activity", activity_type: "task", early_start: todayPlusDays(1), status: "complete" }));
      d.activities.push(win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Past due activity", activity_type: "task", early_start: todayPlusDays(-1), status: "not_started" }));

      var farFuture = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Far future commissioning", activity_type: "task", early_start: todayPlusDays(45), status: "not_started" });
      d.activities.push(farFuture);
      farFutureActId = farFuture.id;
    });
    win.PCC.router.go("projectLookahead");
    win.PCC.router.render();
  });

  var meetingId;
  await check("seed meetings: one within the 7-day window (with an open action + a done action), one far out at day 20 (outside 7/14, inside 30/60)", () => {
    win.PCC.store.update(function (d) {
      var m = win.PCC.store.newMeeting({ project_id: projectId, title: "Weekly Coordination", meeting_date: todayPlusDays(4) });
      m.actions = [
        win.PCC.store.newMeetingAction({ description: "Circulate updated drawing", owner: "Planner", due_date: todayPlusDays(2), status: "open" }),
        win.PCC.store.newMeetingAction({ description: "Already done action", owner: "Planner", due_date: todayPlusDays(1), status: "done" }),
      ];
      d.meetings.push(m);
      meetingId = m.id;

      d.meetings.push(win.PCC.store.newMeeting({ project_id: projectId, title: "Client Review (Day 20)", meeting_date: todayPlusDays(20) }));
    });
    win.PCC.router.render();
  });

  await check("seed RFIs: one open within window, one answered (excluded regardless of date), one open far-future (day 45, outside 7/14/30, inside 60)", () => {
    win.PCC.store.update(function (d) {
      d.rfis.push(win.PCC.store.newRfi({ project_id: projectId, subject: "Cladding detail query", date_required: todayPlusDays(1), status: "open" }));
      d.rfis.push(win.PCC.store.newRfi({ project_id: projectId, subject: "Already answered query", date_required: todayPlusDays(1), status: "answered" }));
      d.rfis.push(win.PCC.store.newRfi({ project_id: projectId, subject: "Far future query", date_required: todayPlusDays(45), status: "open" }));
    });
    win.PCC.router.render();
  });

  await check("seed document requirements: one required (no document) within window, one available (has a document, excluded despite a future date), one overdue (past date, excluded — forward-only)", () => {
    win.PCC.store.update(function (d) {
      var boqTypeId = d.document_types.find((t) => t.name === "BOQ").id;
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: boqTypeId, planned_submission_date: todayPlusDays(3) }));

      var itpTypeId = d.document_types.find((t) => t.name === "ITP").id;
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: itpTypeId, planned_submission_date: todayPlusDays(1) }));
      d.documents.push(win.PCC.store.newDocument({ project_id: projectId, filename: "itp.pdf", document_type_id: itpTypeId }));

      var msTypeId = d.document_types.find((t) => t.name === "Method Statements").id;
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: msTypeId, planned_submission_date: todayPlusDays(-2) }));
    });
    win.PCC.router.go("projectLookahead");
    win.PCC.router.render();
  });

  await check("the default 7-day window shows exactly the 8 in-window items and excludes everything else", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Coming Up (8)") !== -1, "expected exactly 8 items in the default 7-day window; got: " + text.match(/Coming Up \(\d+\)/));

    ["Critical foundation pour", "Near critical steel erection", "On track cabling", "Substantial completion milestone",
     "Weekly Coordination", "Circulate updated drawing", "Cladding detail query", "[Document] BOQ"].forEach(function (needle) {
      assert.ok(text.indexOf(needle) !== -1, "expected to find: " + needle);
    });

    ["WBS summary row", "Already completed activity", "Past due activity", "Far future commissioning",
     "Already done action", "Client Review (Day 20)", "Already answered query", "Far future query",
     "Archived project activity"].forEach(function (needle) {
      assert.ok(text.indexOf(needle) === -1, "must NOT appear in the 7-day window: " + needle);
    });

    // The overdue Method Statements requirement and the available ITP requirement must
    // never appear — check the Document kind specifically since "BOQ" / "ITP" could
    // otherwise collide with unrelated substrings elsewhere on the page.
    assert.ok(text.indexOf("[Document] ITP") === -1, "an Available requirement must never appear, even with a date in-window");
    assert.ok(text.indexOf("Method Statements") === -1, "an overdue (past-date) requirement must never appear in a forward-only Lookahead");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("badges reflect float-derived criticality correctly", () => {
    var text = outlet().textContent;
    var critRow = Array.from(outlet().querySelectorAll("span")).find((s) => s.textContent.indexOf("Critical foundation pour") !== -1);
    assert.ok(critRow, "critical activity row not found");
    assert.ok(critRow.parentElement.textContent.indexOf("Critical") !== -1);
    var nearRow = Array.from(outlet().querySelectorAll("span")).find((s) => s.textContent.indexOf("Near critical steel erection") !== -1);
    assert.ok(nearRow.parentElement.textContent.indexOf("Near-Critical") !== -1);
    var onTrackRow = Array.from(outlet().querySelectorAll("span")).find((s) => s.textContent.indexOf("On track cabling") !== -1);
    assert.ok(onTrackRow.parentElement.textContent.indexOf("On Track") !== -1);
  });

  await check("items are sorted ascending by date (RFI day 1 before the near-critical activity on day 5)", () => {
    var text = outlet().textContent;
    var posRfi = text.indexOf("Cladding detail query");
    var posNear = text.indexOf("Near critical steel erection");
    assert.ok(posRfi !== -1 && posNear !== -1 && posRfi < posNear);
  });

  await check("switching to the 30-day window adds the day-20 meeting but still excludes the day-45 items", () => {
    var btn = findButtonByText(dom, "30 Day");
    assert.ok(btn, "30 Day toggle button not found");
    btn.click();
    var text = outlet().textContent;
    assert.ok(text.indexOf("next 30 days") !== -1);
    assert.ok(text.indexOf("Client Review (Day 20)") !== -1, "the day-20 meeting must appear once the window is 30 days");
    assert.ok(text.indexOf("Far future commissioning") === -1, "day-45 activity must still be excluded at a 30-day window");
    assert.ok(text.indexOf("Far future query") === -1, "day-45 RFI must still be excluded at a 30-day window");
    assert.ok(text.indexOf("Coming Up (9)") !== -1, "expected exactly one more item (the day-20 meeting) than the 7-day window; got: " + text.match(/Coming Up \(\d+\)/));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("switching to the 60-day window adds both day-45 items", () => {
    var btn = findButtonByText(dom, "60 Day");
    assert.ok(btn, "60 Day toggle button not found");
    btn.click();
    var text = outlet().textContent;
    assert.ok(text.indexOf("next 60 days") !== -1);
    assert.ok(text.indexOf("Far future commissioning") !== -1);
    assert.ok(text.indexOf("Far future query") !== -1);
    assert.ok(text.indexOf("Coming Up (11)") !== -1, "expected 11 items at the 60-day window; got: " + text.match(/Coming Up \(\d+\)/));
  });

  await check("'View' on the critical schedule activity navigates to Schedule with that activity's detail panel open", () => {
    var btn = findButtonInRowByText(dom, "Critical foundation pour", "View");
    assert.ok(btn, "View button not found for the critical activity row");
    btn.click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    assert.ok(outlet().textContent.indexOf("Critical foundation pour") !== -1, "the activity detail panel must show the activity's own name");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'View' on the meeting navigates to Meetings with that meeting expanded", () => {
    win.PCC.router.go("projectLookahead");
    win.PCC.router.render();
    var btn = findButtonInRowByText(dom, "Weekly Coordination", "View");
    assert.ok(btn, "View button not found for the meeting row");
    btn.click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "meetings");
    assert.ok(outlet().textContent.indexOf("Hide") !== -1, "the linked meeting must land already expanded");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back — every seeded record is unchanged after rendering", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.activities.length, 9);
    assert.strictEqual(data.meetings.length, 2);
    assert.strictEqual(data.rfis.length, 3);
    assert.strictEqual(data.project_document_requirements.length, 3);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding the Project Lookahead", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
