// End-to-end jsdom test against the ACTUAL bundled index.html for the Decision Register
// (PCC Evolution Roadmap, Tier C: Project Performance — Decision Register gate,
// 2026-08-19). A fresh inspection found no decisions register anywhere: no `decisions`
// array in store.js, and every "decision" hit in the codebase was just the English word
// inside Change Order/RFI approval copy. This gate adds a new register — same
// project-scoped shape as Risk/Issue/Opportunity and RFI/TQ — with an optional Schedule
// activity link (Gate 10 pattern) and, per direct confirmation, the same
// createFromMeeting()/pendingPrefill "raise from a Meeting" pattern Risk/RFI/Change
// Orders already have. Covers: add/edit/delete, filters, the activity link, and the full
// round trip through a Meeting's "+ Add Decision" button and "DECISIONS RAISED" list.
// schema_version 37 -> 38.
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
    assert.ok(win.PCC.pages.decisionRegister, "decisionRegister page module must be bundled");
  });

  await check("the sidebar links to Decision Register, and the empty state shows before any project exists", () => {
    win.PCC.router.go("decisionRegister");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Decision Register") !== -1);
    assert.ok(text.indexOf("Add a project in Portfolio first") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var projectId, scheduleId, activityId;
  await check("seed a project, a schedule, and an activity via the store", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Decision Register Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(s);
      scheduleId = s.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Foundation Design" });
      d.activities.push(a);
      activityId = a.id;
    });
    win.PCC.router.render();
    assert.ok(projectId && scheduleId && activityId);
  });

  await check("'+ Add Decision' opens a form requiring Title and Project, defaulting status to Pending", async () => {
    // decisionRegister is a React-migrated page — a click's state update commits
    // asynchronously (see CLAUDE.md's React migration notes), so await flush() before
    // reading the resulting DOM.
    findButtonByText(dom, "+ Add Decision").click();
    await flush();
    var statusSelect = outlet().querySelector("#decfield-status");
    assert.ok(statusSelect, "status field not found");
    assert.strictEqual(statusSelect.value, "pending");
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.ok(outlet().textContent.indexOf("Title and Project are required.") !== -1);
    assert.strictEqual(win.PCC.store.get().decisions.length, 0, "nothing should be saved when validation fails");
  });

  var decisionId;
  await check("filling in the form and linking the activity persists a new decision", async () => {
    outlet().querySelector("#decfield-title").value = "Use precast foundations instead of cast-in-place";
    outlet().querySelector("#decfield-decided_by").value = "Project Director";
    outlet().querySelector("#decfield-decision_date").value = "2026-08-19";
    outlet().querySelector("#decfield-description").value = "Site soil conditions require a faster foundation method.";
    outlet().querySelector("#decfield-decision").value = "Approved switch to precast foundation system.";
    outlet().querySelector("#decfield-status").value = "decided";
    var activitySelect = outlet().querySelector("#decfield-activity_id");
    activitySelect.value = activityId;
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.decisions.length, 1);
    var decision = data.decisions[0];
    decisionId = decision.id;
    assert.strictEqual(decision.project_id, projectId);
    assert.strictEqual(decision.activity_id, activityId);
    assert.strictEqual(decision.status, "decided");
    assert.strictEqual(decision.decision, "Approved switch to precast foundation system.");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the list shows the new decision with a 'Decided' status badge", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Use precast foundations instead of cast-in-place") !== -1);
    var badges = Array.from(outlet().querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(badges.indexOf("Decided") !== -1, "expected a Decided badge; got: " + badges.join(", "));
  });

  await check("Details shows the linked activity and clicking its row navigates to the Schedule module", async () => {
    findButtonByText(dom, "Details").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("LINKED ACTIVITY") !== -1);
    assert.ok(text.indexOf("Foundation Design") !== -1);

    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — the whole
    // row is the click target now, no separate "View in Gantt" button.
    var row = Array.from(outlet().querySelectorAll(".attention-item--clickable")).find((r) => r.textContent.indexOf("Foundation Design") !== -1);
    assert.ok(row, "clickable row for the linked activity not found");
    row.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    assert.ok(outlet().textContent.indexOf("Foundation Design") !== -1, "must land with the linked activity's own Detail Panel open");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // decisionRegister is a React-migrated page: a raw `.value =` assignment doesn't reach
  // a controlled <select>'s onChange (React patches the native setter to track "last
  // known value" — see CLAUDE.md's React migration notes), so bypass it via the native
  // prototype descriptor before dispatching the change event.
  function setReactSelectValue(select, value) {
    Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(select, value);
    select.dispatchEvent(new win.Event("change", { bubbles: true }));
  }

  await check("status/project filters narrow the list correctly", async () => {
    win.PCC.router.go("decisionRegister");
    win.PCC.router.render();
    // Flush here, BEFORE interacting — router.js's suppressNextHashRender is a single
    // flag, so a hashchange-triggered render can still land asynchronously after this
    // go()+render() pair and wipe a just-made state change (see CLAUDE.md's React
    // migration notes on this race).
    await flush();

    var statusFilter = outlet().querySelectorAll("select")[0];
    setReactSelectValue(statusFilter, "pending");
    await flush();
    assert.ok(outlet().textContent.indexOf("No decisions match this search/filter.") !== -1);

    setReactSelectValue(statusFilter, "decided");
    await flush();
    assert.ok(outlet().textContent.indexOf("Use precast foundations instead of cast-in-place") !== -1);
  });

  var meetingId;
  await check("seed a meeting on the same project", () => {
    win.PCC.store.update(function (d) {
      var m = win.PCC.store.newMeeting({ project_id: projectId, title: "Design Coordination Meeting" });
      d.meetings.push(m);
      meetingId = m.id;
    });
    assert.ok(meetingId);
  });

  await check("the Meeting's '+ Add Decision' button opens a prefilled Decision form linked to that meeting", async () => {
    win.PCC.meetings.expandMeeting(meetingId);
    win.PCC.router.go("meetings");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "+ Add Decision").click();
    await flush();

    assert.strictEqual(win.PCC.router.currentRouteName(), "decisionRegister");
    var text = outlet().textContent;
    assert.ok(text.indexOf("Linked to meeting: “Design Coordination Meeting”") !== -1);
    var projSelect = outlet().querySelector("#decfield-project_id");
    assert.strictEqual(projSelect.value, projectId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("saving that prefilled form persists source_meeting_id, and the Meeting's own Details shows it under DECISIONS RAISED", async () => {
    outlet().querySelector("#decfield-title").value = "Confirm long-lead equipment vendor";
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    var meetingDecision = data.decisions.find((d) => d.title === "Confirm long-lead equipment vendor");
    assert.ok(meetingDecision, "meeting-sourced decision not found");
    assert.strictEqual(meetingDecision.source_meeting_id, meetingId);
    assert.strictEqual(meetingDecision.project_id, projectId);

    win.PCC.meetings.expandMeeting(meetingId);
    win.PCC.router.go("meetings");
    win.PCC.router.render();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("DECISIONS RAISED (1)") !== -1, "got: " + text.match(/DECISIONS RAISED \(\d+\)/));
    assert.ok(text.indexOf("Confirm long-lead equipment vendor") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Delete' removes a decision", async () => {
    win.PCC.router.go("decisionRegister");
    win.PCC.router.render();
    await flush();
    var origConfirm = win.confirm;
    win.confirm = () => true;
    var deleteButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Delete");
    deleteButtons[0].click();
    win.confirm = origConfirm;

    var data = win.PCC.store.get();
    assert.strictEqual(data.decisions.length, 1, "one of the two decisions must be gone");
  });

  await check("this gate's record counts are as expected after all edits above", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.decisions.length, 1);
    assert.strictEqual(data.meetings.length, 1);
    assert.strictEqual(data.activities.length, 1);
    assert.strictEqual(data.projects.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding the Decision Register", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
