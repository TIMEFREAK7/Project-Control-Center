// End-to-end jsdom test against the ACTUAL bundled index.html for wiring Recovery
// Actions and Decisions into diagnostics/Executive Summary/Reports (PCC Evolution
// Roadmap, Tier D: Management follow-on, 2026-08-19). A fresh inspection found that
// Vendor Performance, Recovery Actions, and Decisions — the three registers built
// earlier this session — were invisible to Executive Summary's auto-text, Reports'
// sections, and Dashboard's Management Attention panel. Vendor Performance was
// excluded from this fix on inspection: its `project_id` field is never actually set
// by any UI (vendors.js's Performance tab form only ever saves `vendor_id`), so it
// can't be meaningfully project-scoped, and it already has its own portfolio-wide
// Vendor Performance Centre page. This gate wires in Recovery Actions and Decisions
// only: a new rule in projectHealthEngine.computeDiagnostics() (shared by Executive
// Center's own Diagnostics panel AND Dashboard's Management Attention panel via
// getDiagnostics()), plus new Executive Summary auto-text lines and new Reports
// sections. No schema change.
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
  const pastIso = "2020-01-01";

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.projectHealthEngine, "projectHealthEngine must be bundled");
  });

  var projectId, scheduleId, activityId, recoveryActionId, decisionId;
  await check("seed a project with an overdue recovery action and a pending decision", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Reporting Wiring Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(s);
      scheduleId = s.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Structural Steel Erection" });
      d.activities.push(a);
      activityId = a.id;

      var r = win.PCC.store.newRecoveryAction({
        activity_id: activityId, project_id: projectId,
        description: "Add night shift crew", target_recovery_date: pastIso, status: "open",
      });
      d.recovery_actions.push(r);
      recoveryActionId = r.id;

      var dec = win.PCC.store.newDecision({ project_id: projectId, title: "Confirm precast vendor", status: "pending" });
      d.decisions.push(dec);
      decisionId = dec.id;
    });
    assert.ok(projectId && recoveryActionId && decisionId);
  });

  await check("Executive Center's Diagnostics panel shows both the overdue recovery action and the pending decision as WARNING alerts", () => {
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Recovery action overdue: Add night shift crew") !== -1, "got: " + text.slice(0, 400));
    assert.ok(text.indexOf("Decision pending: “Confirm precast vendor”.") !== -1);
    var badges = Array.from(outlet().querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(badges.filter((b) => b === "Warning").length >= 2, "expected at least 2 Warning badges (recovery + decision), got: " + badges.join(", "));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clicking 'View' on the pending-decision alert navigates to the Decision Register with that decision expanded", () => {
    var rows = Array.from(outlet().querySelectorAll(".detail-card")).filter((r) => r.textContent.indexOf("Confirm precast vendor") !== -1);
    assert.strictEqual(rows.length, 1, "expected exactly one diagnostics row for the pending decision");
    var viewBtn = Array.from(rows[0].querySelectorAll("button")).find((b) => b.textContent.trim() === "View");
    assert.ok(viewBtn, "View button not found on the decision diagnostics row");
    viewBtn.click();
    win.PCC.router.render();
    assert.strictEqual(win.PCC.router.currentRouteName(), "decisionRegister");
    assert.ok(outlet().textContent.indexOf("Confirm precast vendor") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Executive Summary's Challenges section mentions the overdue recovery action, and Management Attention mentions the pending decision", () => {
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("1 recovery action(s) overdue.") !== -1, "got: " + text.slice(0, 800));
    assert.ok(text.indexOf("1 decision(s) pending in the Decision Register.") !== -1);
  });

  await check("Dashboard's Management Attention panel surfaces both alerts portfolio-wide", () => {
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Management Attention") !== -1);
    assert.ok(text.indexOf("Recovery action overdue: Add night shift crew") !== -1, "got: " + text.slice(0, 800));
    assert.ok(text.indexOf("Decision pending: “Confirm precast vendor”.") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Project Status Report shows a Recovery Actions section and a Decisions section with the seeded rows", () => {
    win.PCC.router.go("reports");
    win.PCC.router.render();
    var projSelects = Array.from(outlet().querySelectorAll("select"));
    var reportTypeSelect = projSelects[0];
    reportTypeSelect.value = "project";
    reportTypeSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    var projSelect = Array.from(outlet().querySelectorAll("select"))[1];
    projSelect.value = projectId;
    projSelect.dispatchEvent(new win.Event("change", { bubbles: true }));

    var text = outlet().textContent;
    assert.ok(text.indexOf("Recovery Actions — 1 open, 1 overdue") !== -1, "got: " + text.slice(0, 1200));
    assert.ok(text.indexOf("Add night shift crew") !== -1);
    assert.ok(text.indexOf("Structural Steel Erection") !== -1, "the report's recovery-action row must show the linked activity's name");
    assert.ok(text.indexOf("Decisions — 1 pending of 1 total") !== -1);
    assert.ok(text.indexOf("Confirm precast vendor") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Portfolio Summary Report shows portfolio-wide Recovery Actions and Decisions counts", () => {
    var reportTypeSelect = Array.from(outlet().querySelectorAll("select"))[0];
    reportTypeSelect.value = "portfolio";
    reportTypeSelect.dispatchEvent(new win.Event("change", { bubbles: true }));

    var text = outlet().textContent;
    assert.ok(text.indexOf("Recovery Actions — 1 open, 1 overdue across portfolio") !== -1, "got: " + text.slice(0, 1200));
    assert.ok(text.indexOf("Decisions — 1 pending across portfolio") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back — recovery_actions/decisions are byte-for-byte unchanged after all this rendering", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.recovery_actions.length, 1);
    assert.strictEqual(data.decisions.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after wiring Recovery Actions/Decisions into reporting", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
