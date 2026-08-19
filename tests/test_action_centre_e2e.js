// End-to-end jsdom test against the ACTUAL bundled index.html for the Planner Action
// Centre — Gate 1 of the PCC evolution roadmap (2026-08-19, Tier A: Daily Planner Value).
// A new page aggregating every record type that carries a real due date (Meeting Actions,
// RFI/TQ, Document Requirements) into OVERDUE/DUE TODAY/DUE THIS WEEK/UPCOMING buckets,
// plus a dateless WAITING FOR bucket for Change Orders pending decision. No schema
// changes; everything computed at render time from existing store data.
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

function kpiValue(dom, label) {
  const cards = Array.from(dom.window.document.querySelectorAll(".kpi-card"));
  const card = cards.find((c) => c.textContent.indexOf(label) !== -1);
  if (!card) return undefined;
  const valueEl = card.querySelector(".kpi-card__value");
  return valueEl ? Number(valueEl.textContent) : undefined;
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
    assert.ok(win.PCC.pages.actionCentre, "actionCentre page module must be bundled");
  });

  await check("Action Centre shows its empty state before any project exists", () => {
    win.PCC.router.go("actionCentre");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Planner Action Centre") !== -1);
    assert.ok(text.indexOf("Nothing outstanding across the active portfolio right now.") !== -1);
  });

  var projectId, archivedProjectId, boqTypeId;
  await check("seed one active project, one archived project, and a document type", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Action Centre Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var arch = win.PCC.store.newProject({ name: "Archived Action Centre Project", archived: true });
      d.projects.push(arch);
      archivedProjectId = arch.id;
      boqTypeId = d.document_types.find((t) => t.name === "BOQ").id;
    });
    assert.ok(projectId && archivedProjectId && boqTypeId);
  });

  await check("seed meeting actions covering every bucket: overdue, due today, due this week (day 7), upcoming (day 8 and day 30), beyond the window (day 31, excluded), no due date (waiting), a done action (excluded), and one on the archived project (excluded)", () => {
    win.PCC.store.update(function (d) {
      var m = win.PCC.store.newMeeting({ project_id: projectId, title: "Weekly Coordination" });
      m.actions = [
        win.PCC.store.newMeetingAction({ description: "Overdue action", owner: "Planner", due_date: todayPlusDays(-2), status: "open" }),
        win.PCC.store.newMeetingAction({ description: "Due today action", owner: "Planner", due_date: todayPlusDays(0), status: "open" }),
        win.PCC.store.newMeetingAction({ description: "Due this week action", owner: "Planner", due_date: todayPlusDays(7), status: "open" }),
        win.PCC.store.newMeetingAction({ description: "Upcoming action near", owner: "Planner", due_date: todayPlusDays(8), status: "open" }),
        win.PCC.store.newMeetingAction({ description: "Upcoming action far", owner: "Planner", due_date: todayPlusDays(30), status: "open" }),
        win.PCC.store.newMeetingAction({ description: "Beyond window action", owner: "Planner", due_date: todayPlusDays(31), status: "open" }),
        win.PCC.store.newMeetingAction({ description: "No due date action", owner: "Planner", due_date: "", status: "open" }),
        win.PCC.store.newMeetingAction({ description: "Already done action", owner: "Planner", due_date: todayPlusDays(-5), status: "done" }),
      ];
      d.meetings.push(m);

      var mArch = win.PCC.store.newMeeting({ project_id: archivedProjectId, title: "Archived Project Meeting" });
      mArch.actions = [win.PCC.store.newMeetingAction({ description: "Archived project action", owner: "Nobody", due_date: todayPlusDays(-1), status: "open" })];
      d.meetings.push(mArch);
    });
    win.PCC.router.go("actionCentre");
    win.PCC.router.render();
  });

  await check("meeting actions land in the correct buckets", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Overdue action") !== -1 && text.indexOf("Overdue (1)") !== -1, "overdue action must appear in the Overdue bucket");
    assert.ok(text.indexOf("Due today action") !== -1 && text.indexOf("Due Today (1)") !== -1);
    assert.ok(text.indexOf("Due this week action") !== -1 && text.indexOf("Due This Week (1)") !== -1, "day-7 due date is the edge of the this-week bucket");
    assert.ok(text.indexOf("Upcoming action near") !== -1 && text.indexOf("Upcoming action far") !== -1, "day-8 and day-30 both belong in Upcoming");
    assert.ok(text.indexOf("Upcoming (8") !== -1);
    assert.ok(text.indexOf("Beyond window action") === -1, "day-31 is outside the 30-day upcoming window and must not appear anywhere");
    assert.ok(text.indexOf("No due date action") !== -1, "an open action with no due date must land in Waiting For");
    assert.ok(text.indexOf("Already done action") === -1, "a done action must never appear");
    assert.ok(text.indexOf("Archived project action") === -1, "an action on an archived project must never appear");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var overdueRfiId, waitingRfiId;
  await check("seed RFIs: one open+overdue, one open+no due date (waiting), one answered (excluded)", () => {
    win.PCC.store.update(function (d) {
      var r1 = win.PCC.store.newRfi({ project_id: projectId, subject: "Foundation detail clarification", date_required: todayPlusDays(-3), status: "open" });
      d.rfis.push(r1);
      overdueRfiId = r1.id;
      var r2 = win.PCC.store.newRfi({ project_id: projectId, subject: "Undated open query", date_required: "", status: "open" });
      d.rfis.push(r2);
      waitingRfiId = r2.id;
      d.rfis.push(win.PCC.store.newRfi({ project_id: projectId, subject: "Already answered query", date_required: todayPlusDays(-10), status: "answered" }));
    });
    win.PCC.router.render();
  });

  await check("RFIs land in the correct buckets, answered RFIs are excluded", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Foundation detail clarification") !== -1, "the overdue open RFI must appear");
    assert.ok(text.indexOf("Undated open query") !== -1, "the undated open RFI must land in Waiting For");
    assert.ok(text.indexOf("Already answered query") === -1, "an answered RFI must never appear");
  });

  await check("seed document requirements: one overdue (no document), one available (has a document, excluded despite a past date), one required with no date (waiting)", () => {
    win.PCC.store.update(function (d) {
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: boqTypeId, planned_submission_date: todayPlusDays(-1) }));
      var itpTypeId = d.document_types.find((t) => t.name === "ITP").id;
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: itpTypeId, planned_submission_date: todayPlusDays(-1) }));
      d.documents.push(win.PCC.store.newDocument({ project_id: projectId, filename: "itp.pdf", document_type_id: itpTypeId }));
      var moTypeId = d.document_types.find((t) => t.name === "Method Statements").id;
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: moTypeId, planned_submission_date: "" }));
    });
    win.PCC.router.render();
  });

  await check("document requirements land correctly: overdue shows, available (despite past date) is excluded, undated required lands in Waiting For", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("[Document] BOQ") !== -1, "the overdue BOQ requirement must appear");
    assert.ok(text.indexOf("ITP") === -1, "the ITP requirement has a matching document (Available) and must never appear, even with a past due date");
    assert.ok(text.indexOf("Method Statement") !== -1, "the undated Method Statement requirement must land in Waiting For");
  });

  var pendingCoId;
  await check("seed change orders: one pending (waiting), one approved (excluded)", () => {
    win.PCC.store.update(function (d) {
      var co1 = win.PCC.store.newChangeOrder({ project_id: projectId, title: "Additional scope for site access", status: "pending", requested_by: "Client" });
      d.change_orders.push(co1);
      pendingCoId = co1.id;
      d.change_orders.push(win.PCC.store.newChangeOrder({ project_id: projectId, title: "Already decided change", status: "approved", requested_by: "Client" }));
    });
    win.PCC.router.render();
  });

  await check("the pending Change Order lands in Waiting For, the approved one is excluded, and Waiting For has no due date shown", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Additional scope for site access") !== -1, "the pending Change Order must appear in Waiting For");
    assert.ok(text.indexOf("Already decided change") === -1, "an approved Change Order must never appear");
  });

  await check("the KPI cards show the correct counts", () => {
    assert.strictEqual(kpiValue(dom, "OVERDUE"), 3, "1 meeting action + 1 RFI + 1 document requirement (BOQ, day -1) all overdue");
    assert.strictEqual(kpiValue(dom, "DUE TODAY"), 1);
    assert.strictEqual(kpiValue(dom, "DUE THIS WEEK"), 1);
    assert.strictEqual(kpiValue(dom, "WAITING FOR"), 4, "1 undated meeting action + 1 undated RFI + 1 undated document requirement + 1 pending change order");
  });

  await check("the Overdue bucket sorts ascending by due date (RFI day -3, meeting action day -2, document day -1)", () => {
    var text = outlet().textContent;
    var posRfi = text.indexOf("Foundation detail clarification");
    var posMeeting = text.indexOf("Overdue action");
    var posDoc = text.indexOf("[Document] BOQ");
    assert.ok(posRfi !== -1 && posMeeting !== -1 && posDoc !== -1);
    assert.ok(posRfi < posMeeting && posMeeting < posDoc, "expected ascending date order: RFI (-3), meeting action (-2), document (-1)");
  });

  await check("'View' on the overdue meeting action navigates to Meetings with that meeting expanded", () => {
    var btn = findButtonInRowByText(dom, "Overdue action", "View");
    assert.ok(btn, "View button not found for the overdue meeting action row");
    btn.click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "meetings");
    assert.ok(outlet().textContent.indexOf("Hide") !== -1, "the linked meeting must land already expanded");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'View' on the overdue RFI navigates to RFI/TQ with that record expanded", () => {
    win.PCC.router.go("actionCentre");
    win.PCC.router.render();
    var btn = findButtonInRowByText(dom, "Foundation detail clarification", "View");
    assert.ok(btn, "View button not found for the overdue RFI row");
    btn.click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "rfis");
    assert.ok(outlet().textContent.indexOf("Hide") !== -1, "the linked RFI must land already expanded");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'View' on the Waiting For Change Order navigates to Change Mgmt with that record expanded", () => {
    win.PCC.router.go("actionCentre");
    win.PCC.router.render();
    var btn = findButtonInRowByText(dom, "Additional scope for site access", "View");
    assert.ok(btn, "View button not found for the pending change order row");
    btn.click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "changeOrders");
    assert.ok(outlet().textContent.indexOf("Hide") !== -1, "the linked change order must land already expanded");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back — every seeded record is unchanged after rendering", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.meetings.length, 2);
    assert.strictEqual(data.rfis.length, 3);
    assert.strictEqual(data.project_document_requirements.length, 3);
    assert.strictEqual(data.change_orders.length, 2);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding the Planner Action Centre", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
