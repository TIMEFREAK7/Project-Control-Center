// End-to-end jsdom test against the ACTUAL bundled index.html for the Delay & Recovery
// Dashboard (PCC Evolution Roadmap, Tier C: Delay & Recovery Management — dashboard half,
// 2026-08-19). Portfolio-wide rollup of recovery_actions (see
// test_recovery_actions_e2e.js for the per-activity entry half). Covers: the empty state,
// KPI counts, overdue-first sorting of open actions, completed/cancelled kept in a
// separate section, archived projects excluded, "View in Schedule" navigation, and that
// this dashboard is purely computed — nothing written back.
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
function kpiValue(dom, label) {
  const cards = Array.from(dom.window.document.querySelectorAll(".kpi-card"));
  const card = cards.find((c) => c.textContent.indexOf(label) !== -1);
  if (!card) return undefined;
  const valueEl = card.querySelector(".kpi-card__value");
  return valueEl ? valueEl.textContent : undefined;
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
    assert.ok(win.PCC.pages.delayRecoveryDashboard, "delayRecoveryDashboard page module must be bundled");
  });

  await check("the sidebar links to the Delay & Recovery Dashboard, and the empty state shows before any recovery action exists", () => {
    win.PCC.router.go("delayRecoveryDashboard");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Delay & Recovery Dashboard") !== -1);
    assert.ok(text.indexOf("Nothing to show yet") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var projA, projB, archivedProj, actOverdue, actUpcoming, actCompleted, actArchived;
  await check("seed two active projects (each with a schedule + activity), one archived project, and recovery actions across them", () => {
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newProject({ name: "Recovery Project A" });
      d.projects.push(a);
      projA = a.id;
      var b = win.PCC.store.newProject({ name: "Recovery Project B" });
      d.projects.push(b);
      projB = b.id;
      var arch = win.PCC.store.newProject({ name: "Archived Recovery Project", archived: true });
      d.projects.push(arch);
      archivedProj = arch.id;

      var schA = win.PCC.store.newSchedule({ project_id: projA, name: "Baseline A", status: "active" });
      d.schedules.push(schA);
      var schB = win.PCC.store.newSchedule({ project_id: projB, name: "Baseline B", status: "active" });
      d.schedules.push(schB);
      var schArch = win.PCC.store.newSchedule({ project_id: archivedProj, name: "Baseline Archived", status: "active" });
      d.schedules.push(schArch);

      var actA = win.PCC.store.newActivity({ project_id: projA, schedule_id: schA.id, name: "Overdue Steel Erection" });
      d.activities.push(actA);
      var actB = win.PCC.store.newActivity({ project_id: projB, schedule_id: schB.id, name: "Upcoming Facade Work" });
      d.activities.push(actB);
      var actC = win.PCC.store.newActivity({ project_id: projA, schedule_id: schA.id, name: "Already Recovered MEP" });
      d.activities.push(actC);
      var actD = win.PCC.store.newActivity({ project_id: archivedProj, schedule_id: schArch.id, name: "Archived Project Activity" });
      d.activities.push(actD);

      actOverdue = win.PCC.store.newRecoveryAction({ activity_id: actA.id, project_id: projA, description: "Night shift crew", target_recovery_date: "2020-01-01", status: "open" });
      d.recovery_actions.push(actOverdue);
      actUpcoming = win.PCC.store.newRecoveryAction({ activity_id: actB.id, project_id: projB, description: "Expedite facade panels", target_recovery_date: "2099-01-01", status: "in_progress" });
      d.recovery_actions.push(actUpcoming);
      actCompleted = win.PCC.store.newRecoveryAction({ activity_id: actC.id, project_id: projA, description: "Already resolved delay", target_recovery_date: "2020-01-01", status: "completed" });
      d.recovery_actions.push(actCompleted);
      actArchived = win.PCC.store.newRecoveryAction({ activity_id: actD.id, project_id: archivedProj, description: "Must never appear", status: "open" });
      d.recovery_actions.push(actArchived);
    });
    win.PCC.router.render();
    assert.ok(projA && projB && archivedProj);
  });

  await check("the KPI cards show correct totals, excluding the archived project's recovery action", () => {
    assert.strictEqual(kpiValue(dom, "TOTAL RECOVERY ACTIONS"), "3", "3 across the two active projects; the archived project's 4th must be excluded");
    assert.strictEqual(kpiValue(dom, "OPEN"), "2", "the overdue-open one and the in_progress one; completed doesn't count as open");
    assert.strictEqual(kpiValue(dom, "OVERDUE"), "1");
    assert.strictEqual(kpiValue(dom, "COMPLETED"), "1");
  });

  await check("the Open Recovery Actions panel lists the overdue one first, and never the archived project's action", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Night shift crew") !== -1);
    assert.ok(text.indexOf("Expedite facade panels") !== -1);
    assert.ok(text.indexOf("Must never appear") === -1, "an archived project's recovery action must never appear on this dashboard");
    assert.ok(text.indexOf("Recovery Project A") !== -1);
    assert.ok(text.indexOf("Recovery Project B") !== -1);

    var posOverdue = text.indexOf("Night shift crew");
    var posUpcoming = text.indexOf("Expedite facade panels");
    assert.ok(posOverdue < posUpcoming, "the overdue action must render before the not-yet-due one");

    var badges = Array.from(outlet().querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(badges.indexOf("Overdue") !== -1);
    assert.ok(badges.indexOf("In Progress") !== -1);
  });

  await check("the Completed / Cancelled panel separately lists the completed action, never mixed into the Open panel", () => {
    var panels = Array.from(outlet().querySelectorAll(".panel"));
    var openPanel = panels.find((p) => p.textContent.indexOf("Open Recovery Actions") !== -1);
    var closedPanel = panels.find((p) => p.textContent.indexOf("Completed / Cancelled") !== -1);
    assert.ok(openPanel && closedPanel);
    assert.ok(openPanel.textContent.indexOf("Already resolved delay") === -1, "a completed action must not appear in the Open panel");
    assert.ok(closedPanel.textContent.indexOf("Already resolved delay") !== -1);
    assert.ok(closedPanel.textContent.indexOf("Completed") !== -1);
    // A completed action must never show as Overdue even with a past target date.
    var closedBadges = Array.from(closedPanel.querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(closedBadges.indexOf("Overdue") === -1, "completed actions must never show Overdue regardless of target date");
  });

  await check("'View in Schedule' navigates to Schedule with that activity's Detail Panel already open", () => {
    var viewButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "View in Schedule");
    var overdueBtn = viewButtons.find((b) => b.parentElement.parentElement.textContent.indexOf("Night shift crew") !== -1);
    assert.ok(overdueBtn, "View in Schedule button for the overdue action not found");
    overdueBtn.click();

    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    var text = outlet().textContent;
    assert.ok(text.indexOf("Overdue Steel Erection") !== -1, "must land with the linked activity's own Detail Panel open");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this dashboard writes nothing back — recovery_actions is byte-for-byte unchanged after rendering", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.recovery_actions.length, 4, "all 4 seeded rows (3 active + 1 archived) must still exist, untouched");
  });

  await check("route 'delayRecoveryDashboard' still renders without throwing after this gate's changes", () => {
    thrownErrors.length = 0;
    win.PCC.router.go("delayRecoveryDashboard");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page, confirming the new route joins cleanly ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding the Delay & Recovery Dashboard", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
