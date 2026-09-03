// End-to-end jsdom test against the ACTUAL bundled index.html for UI/UX Overhaul Gate 5
// (Executive Center redesign). The Overview tab used to be one flat vertical stack of
// 13 KPI sections + 6 major panels (~3650px of scroll even on a near-empty project) —
// restructured into "summary first, detail on demand": an always-visible hero (name/
// client/RAG badge + 5 condensed at-a-glance figures) and a Summary/Schedule/Cost &
// Commitments/Risk & Compliance[/Resources] sub-tab row. Zero change to
// buildProjectContext()/the health engine/CPM engine — this gate only reorganizes
// WHERE each already-computed figure renders. Also retrofits Diagnostics/Management
// Action List (this file) and Dashboard's own Management Attention panel onto Gate 1's
// .attention-list/.attention-item primitive (first adopted by Workspace, Gate 4).
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

function findButtonByText(dom, text, root) {
  const scope = root || dom.window.document;
  return Array.from(scope.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
}
function subTabButtons(dom) {
  return Array.from(dom.window.document.querySelectorAll(".toolbar button"));
}
function clickSubTab(dom, label) {
  const btn = subTabButtons(dom).find((b) => b.textContent.trim() === label);
  if (!btn) throw new Error("sub-tab button not found: " + label);
  btn.click();
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
    assert.ok(win.PCC.pages.executiveCenter, "executiveCenter page must be bundled");
  });

  var projectId;
  await check("seed a project with real data across schedule/cost/risk/rfi/change/meeting/resources", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({
        name: "Riverside Tower", client: "Acme Developers", status: "at_risk", progress: 62,
        budget: 4500000, currency: "USD",
      });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      data.schedules.push(schedule);
      data.activities.push(win.PCC.store.newActivity({
        project_id: projectId, schedule_id: schedule.id, name: "Site Handover",
        activity_type: "milestone", planned_start: pastIso, planned_finish: pastIso,
      }));

      data.risks.push(win.PCC.store.newRisk({ project_id: projectId, type: "risk", title: "Weather delay", status: "open", probability: "high", impact: "high" }));
      data.rfis.push(win.PCC.store.newRfi({ project_id: projectId, type: "rfi", number: "RFI-001", subject: "Foundation detail", status: "open", date_required: pastIso }));
      data.change_orders.push(win.PCC.store.newChangeOrder({ project_id: projectId, number: "CO-001", title: "Extra scope", status: "pending" }));

      var meeting = win.PCC.store.newMeeting({ project_id: projectId, title: "Kickoff", meeting_date: pastIso });
      meeting.actions.push(win.PCC.store.newMeetingAction({ description: "Confirm supplier", due_date: pastIso, status: "open" }));
      data.meetings.push(meeting);

      data.cost_budget_items.push(win.PCC.store.newCostBudgetItem({ project_id: projectId, name: "Materials", planned_amount: 1000 }));
      data.cost_actuals.push(win.PCC.store.newCostActual({ project_id: projectId, amount: 5000 }));
    });
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    assert.ok(projectId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the hero row is always visible with real condensed figures, regardless of sub-tab", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Riverside Tower") !== -1);
    assert.ok(text.indexOf("Acme Developers") !== -1);
    assert.ok(text.indexOf("PROGRESS") !== -1 && text.indexOf("62%") !== -1);
    assert.ok(text.indexOf("OPEN RISKS") !== -1);
    assert.ok(text.indexOf("OVERDUE RFIs") !== -1);
  });

  await check("Summary is the default sub-tab: Health Score/Diagnostics/Executive Summary/Management Action List show, but the old flat KPI sections do not", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Project Health Score") !== -1);
    assert.ok(text.indexOf("Project Health Diagnostics") !== -1);
    assert.ok(text.indexOf("Executive Summary") !== -1);
    assert.ok(text.indexOf("Management Action List") !== -1);
    assert.ok(text.indexOf("Recent Activity") !== -1);
    assert.ok(text.indexOf("Upcoming Items") !== -1);
    assert.ok(text.indexOf("Critical Activities") === -1, "Schedule sub-tab content must not leak onto Summary");
    assert.ok(text.indexOf("Change Orders — Status") === -1, "chart content must not leak onto Summary");
  });

  await check("Diagnostics panel items use the .attention-list/.attention-item primitive with correct severity", () => {
    var panel = Array.from(outlet().querySelectorAll(".panel")).find((p) => p.textContent.indexOf("Project Health Diagnostics") !== -1);
    assert.ok(panel);
    var items = panel.querySelectorAll(".attention-item");
    assert.ok(items.length > 0, "expected at least one diagnostics attention-item");
    var warningIcons = panel.querySelectorAll(".attention-item__icon--warning");
    assert.ok(warningIcons.length > 0, "the high-severity risk diagnostic should render as a warning-severity item");
  });

  await check("Management Action List items use .attention-list/.attention-item and clicking one navigates", async () => {
    var panel = Array.from(outlet().querySelectorAll(".panel")).find((p) => p.textContent.indexOf("Management Action List") !== -1);
    assert.ok(panel);
    var items = Array.from(panel.querySelectorAll(".attention-item"));
    assert.ok(items.length > 0);
    var riskItem = items.find((i) => i.textContent.indexOf("Critical risk") !== -1);
    assert.ok(riskItem, "critical risk item not found in Management Action List");
    riskItem.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "risks");
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
  });

  await check("Schedule sub-tab shows schedule KPI sections and its own charts, not Summary content", async () => {
    clickSubTab(dom, "Schedule");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("PROGRESS") !== -1 && text.indexOf("Schedule Progress") !== -1);
    assert.ok(text.indexOf("SCHEDULE PERFORMANCE") !== -1);
    assert.ok(text.indexOf("Progress S-Curve") !== -1);
    assert.ok(text.indexOf("Milestone Timeline") !== -1);
    assert.ok(text.indexOf("Project Health Score") === -1, "Summary-only content must not leak onto Schedule");
  });

  await check("Cost & Commitments sub-tab shows Cost/Commitments/EVM", async () => {
    clickSubTab(dom, "Cost & Commitments");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("COST") !== -1);
    assert.ok(text.indexOf("COMMITMENTS") !== -1);
    assert.ok(text.indexOf("EVM") !== -1, "budget items exist so EVM should render");
    assert.ok(text.indexOf("SPI") !== -1 && text.indexOf("CPI") !== -1);
  });

  await check("Risk & Compliance sub-tab shows Risks/Issues/RFIs/Changes and their charts", async () => {
    clickSubTab(dom, "Risk & Compliance");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Open Risks") !== -1);
    assert.ok(text.indexOf("Open RFIs") !== -1);
    assert.ok(text.indexOf("Open Change Orders") !== -1);
    assert.ok(text.indexOf("Risk Heat Map") !== -1);
    assert.ok(text.indexOf("RFI / TQ") !== -1);
    assert.ok(text.indexOf("Change Orders — Status") !== -1);
  });

  await check("Resources sub-tab is absent when the module has no data anywhere in the app", () => {
    assert.strictEqual(subTabButtons(dom).find((b) => b.textContent.trim() === "Resources"), undefined);
  });

  await check("Resources sub-tab appears once the module has real data, and clicking Summary returns to the landing view", async () => {
    win.PCC.store.update(function (data) {
      var resource = win.PCC.store.newResource({ name: "Crane Operator", type: "labor" });
      data.resources.push(resource);
    });
    win.PCC.router.render();
    var resourcesTab = subTabButtons(dom).find((b) => b.textContent.trim() === "Resources");
    assert.ok(resourcesTab, "Resources sub-tab should appear now that a resource exists");
    resourcesTab.click();
    await flush();
    assert.ok(outlet().textContent.indexOf("Resources Assigned") !== -1);

    clickSubTab(dom, "Summary");
    await flush();
    assert.ok(outlet().textContent.indexOf("Project Health Score") !== -1, "Summary must be reachable again after visiting Resources");
  });

  await check("Dashboard's Management Attention panel also uses .attention-list/.attention-item", () => {
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    var panel = Array.from(outlet().querySelectorAll(".panel")).find((p) => p.textContent.indexOf("Management Attention") !== -1);
    assert.ok(panel, "Management Attention panel not found on Dashboard");
    var items = panel.querySelectorAll(".attention-item");
    assert.ok(items.length > 0, "expected at least one attention-item on Dashboard's Management Attention panel");
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.risks.length, 1);
    assert.strictEqual(data.rfis.length, 1);
    assert.strictEqual(data.change_orders.length, 1);
    assert.strictEqual(data.resources.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "projectWorkspace",
    "executiveCenter", "vendors", "vendorPerformanceCentre", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "delayRecoveryDashboard", "risks",
    "meetings", "rfis", "changeOrders", "decisionRegister", "lessonsLearned", "knowledgeBase",
    "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Executive Center redesign", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
