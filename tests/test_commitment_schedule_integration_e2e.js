// End-to-end jsdom test against the ACTUAL bundled index.html for the Gate 19 follow-on
// round: integrating Schedule with Commitment Management (Aditya, 2026-08-20, explicit
// request after Gate 19 shipped). Gate 19 itself gave Commitment an optional activity_id
// link, but never added it to schedule.js's own LINKED_RECORD_SOURCES array — so a linked
// commitment never actually showed up on the Activity Detail Panel it pointed at. This
// round closes that gap AND adds a genuine schedule-aware signal on top of it: a
// "Procurement Risk" badge/KPI when a commitment's linked activity is imminent (starting
// within 7 days) or already under way, but the commitment itself isn't approved yet —
// surfaced on Schedule's Activity Detail Panel, the Commitments page (badge + new AT RISK
// KPI card), and Executive Center's COMMITMENTS KPI section.
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(days) {
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
  });

  // ---- Seed: one project, two activities (one imminent, one far out), two draft
  // commitments each linked to one of those activities. ----
  let projectId, scheduleId, imminentActivityId, farActivityId, riskyCommitmentId, safeCommitmentId;
  await check("seed a project with an imminent activity + a far-out activity, each with its own draft commitment", () => {
    win.PCC.store.update(function (d) {
      var project = win.PCC.store.newProject({ name: "Coastal Substation", status: "on_track" });
      d.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(schedule);
      scheduleId = schedule.id;

      var imminentActivity = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Cable Pulling",
        activity_type: "task", duration: 5, planned_start: addDaysIso(3), planned_finish: addDaysIso(8),
      });
      d.activities.push(imminentActivity);
      imminentActivityId = imminentActivity.id;

      var farActivity = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Final Commissioning",
        activity_type: "task", duration: 5, planned_start: addDaysIso(90), planned_finish: addDaysIso(95),
      });
      d.activities.push(farActivity);
      farActivityId = farActivity.id;

      var riskyCommitment = win.PCC.store.newCommitment({
        project_id: projectId, activity_id: imminentActivityId, po_contract_number: "PO-RISKY",
        committed_value: 20000, status: "draft",
      });
      d.commitments.push(riskyCommitment);
      riskyCommitmentId = riskyCommitment.id;

      var safeCommitment = win.PCC.store.newCommitment({
        project_id: projectId, activity_id: farActivityId, po_contract_number: "PO-SAFE",
        committed_value: 15000, status: "draft",
      });
      d.commitments.push(safeCommitment);
      safeCommitmentId = safeCommitment.id;
    });
    assert.ok(projectId && imminentActivityId && farActivityId && riskyCommitmentId && safeCommitmentId);
  });

  await check("Schedule's Activity Detail Panel lists the linked commitment as a Linked Record", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, imminentActivityId);
    win.PCC.router.go("schedule");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Commitment: PO-RISKY") !== -1, "commitment must be listed as a linked record");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the imminent, unapproved commitment shows a Procurement Risk badge on the Activity Detail Panel", () => {
    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — the badge
    // label now lives in the row's meta line, and severity is the row's icon color.
    var row = Array.from(outlet().querySelectorAll(".attention-item")).find((el) => el.textContent.indexOf("PO-RISKY") !== -1);
    assert.ok(row, "no linked-record row found for the commitment");
    assert.ok(row.textContent.indexOf("Procurement Risk") !== -1, "row meta text should carry the Procurement Risk label");
    assert.ok(row.querySelector(".attention-item__icon--critical"), "no critical icon found on the commitment's linked-record row");
  });

  await check("the far-out, unapproved commitment does NOT show a Procurement Risk badge (only its status)", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, farActivityId);
    win.PCC.router.render();
    var row = Array.from(outlet().querySelectorAll(".attention-item")).find((el) => el.textContent.indexOf("PO-SAFE") !== -1);
    assert.ok(row);
    assert.strictEqual(row.textContent.indexOf("Procurement Risk"), -1, "an activity 90 days out shouldn't be flagged yet");
  });

  await check("the Commitments page shows a Procurement Risk badge and an AT RISK KPI of 1", async () => {
    win.PCC.commitments.filterByProject(projectId);
    win.PCC.router.go("commitments");
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Procurement Risk") !== -1);

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    var atRiskCard = kpiCards.find((c) => c.textContent.indexOf("AT RISK") !== -1);
    assert.ok(atRiskCard, "AT RISK KPI card not found");
    assert.strictEqual(atRiskCard.querySelector(".kpi-card__value").textContent, "1");
  });

  await check("Executive Center's COMMITMENTS KPI section shows At Risk: 1", async () => {
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    await flush();
    // UI/UX Overhaul Gate 5: COMMITMENTS now lives on the Cost & Commitments sub-tab.
    var costTab = Array.from(outlet().querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Cost & Commitments");
    assert.ok(costTab, "Cost & Commitments sub-tab not found");
    costTab.click();
    await flush();
    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    var atRiskCard = kpiCards.find((c) => c.textContent.indexOf("At Risk") !== -1);
    assert.ok(atRiskCard, "At Risk KPI card not found in Executive Center");
    assert.strictEqual(atRiskCard.querySelector(".kpi-card__value").textContent, "1");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("approving the risky commitment clears the Procurement Risk badge and KPI everywhere", async () => {
    win.PCC.store.update(function (d) {
      var c = d.commitments.find(function (x) { return x.id === riskyCommitmentId; });
      c.status = "approved";
    });

    win.PCC.router.go("commitments");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Procurement Risk") === -1, "no commitment should still be flagged");
    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    var atRiskCard = kpiCards.find((c) => c.textContent.indexOf("AT RISK") !== -1);
    assert.strictEqual(atRiskCard.querySelector(".kpi-card__value").textContent, "0");

    win.PCC.schedule.viewActivity(projectId, scheduleId, imminentActivityId);
    win.PCC.router.go("schedule");
    await flush();
    var row = Array.from(outlet().querySelectorAll(".attention-item")).find((el) => el.textContent.indexOf("PO-RISKY") !== -1);
    assert.ok(row, "no linked-record row found for the commitment");
    assert.ok(row.textContent.indexOf("Approved") !== -1);
    assert.ok(row.querySelector(".attention-item__icon--on_track"), "an approved commitment should show the on_track icon");
  });

  await check("this round writes nothing back beyond the one status edit above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.activities.length, 2);
    assert.strictEqual(data.commitments.length, 2);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Schedule<->Commitment integration", async () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
