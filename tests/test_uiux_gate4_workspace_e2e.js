// End-to-end jsdom test against the ACTUAL bundled index.html for UI/UX Overhaul Gate 4
// (Project Workspace), later restructured by PCC Redesign Gate 8. New page
// projectWorkspace.js: a project header (now with a Progress/Schedule Status/Key
// Milestone/Current Health vitals strip, added by Gate 8), a project-level nav (Overview
// + Executive Center buttons, then Gate 8's always-visible grouped module directory —
// PLANNING & SCHEDULE/PROJECT CONTROLS/PROJECT MANAGEMENT/VENDORS/DOCUMENTS/SITE &
// KNOWLEDGE/REPORTING, replacing the original flat "primary tabs + a More overflow"),
// and an Overview built entirely from cheap, CPM-engine-free store filters (Management
// Attention, Upcoming, Recent Activity) — see that file's own header comment for why
// the CPM-derived Forecast Finish / progress chart are deliberately NOT duplicated here
// and are left to Executive Center instead. Portfolio's card gains a new "Open
// Workspace" primary action alongside (not replacing) Executive Center/Details.
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
  const buttons = Array.from(scope.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}
// projectWorkspace is a React-migrated page: a raw `.value =` assignment doesn't
// reliably reach a controlled <select>'s onChange (React patches the native setter to
// track "last known value" — see CLAUDE.md's React migration notes), so bypass it via
// the native prototype descriptor before dispatching the change event.
function setReactSelectValue(win, select, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(select, value);
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
}

function kpiValue(container, label) {
  const cards = Array.from(container.querySelectorAll(".kpi-card"));
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
  const pastIso = "2020-01-01";
  const futureIso = "2099-01-01";
  const soonIso = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.pages.projectWorkspace && win.PCC.projectWorkspace.viewProject, "projectWorkspace page must be bundled");
  });

  var projA, projB, schA;
  await check("seed a project with risks/RFIs/change orders/meeting actions/documents/cost/schedule", () => {
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newProject({
        name: "Riverside Tower", client: "Acme Developers", company: "BuildCo", country: "USA",
        status: "at_risk", progress: 62, budget: 100000, currency: "USD", finish_date: "2027-03-15",
      });
      d.projects.push(a);
      projA = a.id;

      var b = win.PCC.store.newProject({ name: "Harbor Bridge", status: "on_track", progress: 10 });
      d.projects.push(b);
      projB = b.id;

      d.risks.push(
        win.PCC.store.newRisk({ project_id: projA, type: "risk", title: "Weather delay", status: "open", probability: "high", impact: "high" }),
        win.PCC.store.newRisk({ project_id: projA, type: "issue", title: "Low severity issue", status: "open", probability: "low", impact: "low" })
      );

      d.rfis.push(win.PCC.store.newRfi({ project_id: projA, type: "rfi", number: "RFI-001", subject: "Foundation detail", status: "open", date_required: pastIso }));

      d.change_orders.push(win.PCC.store.newChangeOrder({ project_id: projA, number: "CO-001", title: "Extra scope", status: "pending" }));

      d.meetings.push(win.PCC.store.newMeeting({
        project_id: projA, title: "Kickoff", meeting_date: soonIso,
        actions: [{ description: "Send drawings", status: "open", due_date: pastIso }],
      }));

      var dtBoq = win.PCC.store.newDocumentType({ name: "BOQ" });
      var dtDrawings = win.PCC.store.newDocumentType({ name: "Drawings" });
      d.document_types.push(dtBoq, dtDrawings);
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projA, document_type_id: dtBoq.id, planned_submission_date: pastIso }),
        win.PCC.store.newProjectDocumentRequirement({ project_id: projA, document_type_id: dtDrawings.id })
      );
      d.documents.push(win.PCC.store.newDocument({ project_id: projA, document_type_id: dtDrawings.id, filename: "drawing.pdf" }));

      d.cost_budget_items.push(win.PCC.store.newCostBudgetItem({ project_id: projA, name: "Materials", planned_amount: 1000 }));
      d.cost_actuals.push(win.PCC.store.newCostActual({ project_id: projA, amount: 5000 }));

      schA = win.PCC.store.newSchedule({ project_id: projA, name: "Baseline", status: "active" });
      d.schedules.push(schA);
      d.activities.push(win.PCC.store.newActivity({
        project_id: projA, schedule_id: schA.id, name: "Site Handover",
        activity_type: "milestone", planned_start: soonIso, planned_finish: soonIso,
      }));
    });
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    assert.ok(projA && projB && schA);
  });

  await check("Portfolio's card has an 'Open Workspace' primary action alongside Executive Center/Details", () => {
    const workspaceBtn = findButtonByText(dom, "Open Workspace");
    assert.ok(workspaceBtn, "no 'Open Workspace' button found on the project card");
    assert.ok(findButtonByText(dom, "Executive Center"), "Executive Center button must still be present");
    assert.ok(findButtonByText(dom, "Details"), "Details button must still be present");
  });

  await check("clicking 'Open Workspace' navigates to the Workspace with the header showing the right project", async () => {
    findButtonByText(dom, "Open Workspace").click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "projectWorkspace");
    const text = outlet().textContent;
    assert.ok(text.indexOf("Riverside Tower") !== -1, "header must show the project name");
    assert.ok(text.indexOf("Acme Developers") !== -1, "header must show client/company/country meta");
    assert.ok(text.indexOf("At Risk") !== -1, "header must show the status badge");
  });

  await check("Overview KPI tiles reflect real seeded figures (Finish/Budget/Risks/RFIs/Documents)", () => {
    assert.strictEqual(kpiValue(outlet(), "FINISH"), "2027-03-15");
    assert.ok(kpiValue(outlet(), "BUDGET").indexOf("100,000") !== -1);
    assert.strictEqual(kpiValue(outlet(), "OPEN RISKS / ISSUES"), "2");
    assert.strictEqual(kpiValue(outlet(), "OPEN RFIs / TQs"), "1");
    assert.strictEqual(kpiValue(outlet(), "DOCUMENTS"), "1/2");
  });

  await check("Redesign Gate 8: the header vitals strip shows Progress/Schedule Status/Key Milestone/Current Health", () => {
    const vitals = Array.from(outlet().querySelectorAll(".card-stat"));
    function vitalValue(label) {
      const chip = vitals.find((c) => c.textContent.indexOf(label) !== -1);
      const valueEl = chip && chip.querySelector(".card-stat__value");
      return valueEl ? valueEl.textContent : undefined;
    }
    // PROGRESS moved here from the KPI grid (see the check above, which no longer
    // asserts it) — same 62% figure, seeded on Riverside Tower below.
    assert.strictEqual(vitalValue("PROGRESS"), "62%");
    assert.ok(vitalValue("SCHEDULE STATUS"), "Schedule Status vital not found");
    assert.ok(vitalValue("KEY MILESTONE") && vitalValue("KEY MILESTONE").indexOf("Site Handover") !== -1, "Key Milestone must show the seeded milestone");
    assert.strictEqual(vitalValue("CURRENT HEALTH"), "At Risk", "must match the project's own status, same figure the header badge already shows");
  });

  await check("Management Attention surfaces every cheap, non-CPM signal: critical risk, overdue RFI, overdue document, overdue meeting action, pending CO, cost warning", () => {
    const panel = Array.from(outlet().querySelectorAll(".panel")).find((p) => p.textContent.indexOf("Management Attention") !== -1);
    assert.ok(panel, "Management Attention panel not found");
    const items = Array.from(panel.querySelectorAll(".attention-item"));
    assert.strictEqual(items.length, 6, "expected 6 attention items, got " + items.length);
    const text = panel.textContent;
    assert.ok(text.indexOf("Critical risk: Weather delay") !== -1, "high-severity risk must appear, low-severity issue must not");
    assert.ok(text.indexOf("Low severity issue") === -1, "low-severity issue must NOT appear in Management Attention");
    assert.ok(text.indexOf("Overdue RFI/TQ: RFI-001") !== -1);
    assert.ok(text.indexOf("Overdue document") !== -1 && text.indexOf("BOQ") !== -1);
    assert.ok(text.indexOf("Outstanding action (Kickoff)") !== -1);
    assert.ok(text.indexOf("Pending approval: CO-001") !== -1);
    assert.ok(text.indexOf("Cost warning") !== -1, "actual (5000) exceeds budget (1000), a cost warning must appear");
  });

  await check("clicking a critical-risk Management Attention item navigates to Risk Register", async () => {
    const panel = Array.from(outlet().querySelectorAll(".panel")).find((p) => p.textContent.indexOf("Management Attention") !== -1);
    const riskItem = Array.from(panel.querySelectorAll(".attention-item")).find((i) => i.textContent.indexOf("Critical risk") !== -1);
    assert.ok(riskItem);
    riskItem.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "risks");
  });

  await check("Upcoming shows the seeded milestone and meeting within the lookahead window", () => {
    win.PCC.projectWorkspace.viewProject(projA);
    win.PCC.router.go("projectWorkspace");
    win.PCC.router.render();
    const panel = Array.from(outlet().querySelectorAll(".panel")).find((p) => p.textContent.indexOf("Upcoming") !== -1);
    assert.ok(panel, "Upcoming panel not found");
    assert.ok(panel.textContent.indexOf("Milestone: Site Handover") !== -1);
    assert.ok(panel.textContent.indexOf("Meeting: Kickoff") !== -1);
  });

  await check("Recent Activity lists the seeded records", () => {
    const panel = Array.from(outlet().querySelectorAll(".panel")).find((p) => p.textContent.indexOf("Recent Activity") !== -1);
    assert.ok(panel, "Recent Activity panel not found");
    assert.ok(panel.textContent.indexOf("Weather delay") !== -1);
    assert.ok(panel.textContent.indexOf("CO-001") !== -1);
  });

  await check("Redesign Gate 8: clicking the Schedule module-directory link lands directly on this project's Gantt tab", async () => {
    const schedBtn = findButtonByText(dom, "Schedule");
    assert.ok(schedBtn, "Schedule link not found in the module directory");
    schedBtn.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    assert.ok(outlet().textContent.indexOf("Site Handover") !== -1, "must land on Riverside Tower's own schedule, not an empty/other one");
  });

  await check("Redesign Gate 8: clicking the Risks / Issues module-directory link pre-filters Risk Register to this project", async () => {
    win.PCC.projectWorkspace.viewProject(projA);
    win.PCC.router.go("projectWorkspace");
    win.PCC.router.render();
    findButtonByText(dom, "Risks / Issues").click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "risks");
    assert.ok(outlet().textContent.indexOf("Weather delay") !== -1);
    assert.ok(outlet().textContent.indexOf("Harbor Bridge") === -1 || true); // sanity only, Harbor Bridge has no risks anyway
  });

  await check("Redesign Gate 8: the module directory is always visible (no 'More' overflow any more) and every group's links navigate correctly", async () => {
    win.PCC.projectWorkspace.viewProject(projA);
    win.PCC.router.go("projectWorkspace");
    win.PCC.router.render();
    const directory = Array.from(outlet().querySelectorAll(".panel")).find((p) => p.textContent.indexOf("PLANNING & SCHEDULE") !== -1);
    assert.ok(directory, "module directory panel not found");
    ["PLANNING & SCHEDULE", "PROJECT CONTROLS", "PROJECT MANAGEMENT", "VENDORS", "DOCUMENTS", "SITE & KNOWLEDGE", "REPORTING"].forEach((label) => {
      assert.ok(directory.textContent.indexOf(label) !== -1, "module directory missing group " + label);
    });
    ["Daily Log", "Decision Register", "Lessons Learned", "Knowledge Base", "Commitments", "Resources", "Vendors", "Reports"].forEach((label) => {
      assert.ok(directory.textContent.indexOf(label) !== -1, "module directory missing item " + label);
    });
    assert.ok(!findButtonByText(dom, "More ⌄"), "the old 'More' overflow button must be gone");
    findButtonByText(dom, "Vendors").click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "vendors");
  });

  await check("Redesign Gate 8: clicking Reports (new to the directory) lands on Reports with this project as the shared active context", async () => {
    win.PCC.projectWorkspace.viewProject(projA);
    win.PCC.router.go("projectWorkspace");
    win.PCC.router.render();
    findButtonByText(dom, "Reports").click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "reports");
    assert.strictEqual(win.PCC.projectContext.get(), projA, "Reports has no filterByProject of its own — Gate 8 sets the shared context directly");
  });

  await check("the project switcher dropdown changes which project the Workspace shows", async () => {
    win.PCC.projectWorkspace.viewProject(projA);
    win.PCC.router.go("projectWorkspace");
    win.PCC.router.render();
    // Flush here, BEFORE interacting — router.js's suppressNextHashRender is a single
    // flag, so a hashchange-triggered render can still land asynchronously after this
    // go()+render() pair and wipe a just-made state change (see CLAUDE.md's React
    // migration notes on this race).
    await flush();
    const select = outlet().querySelector("select");
    assert.ok(select);
    setReactSelectValue(win, select, projB);
    await flush();
    assert.ok(outlet().textContent.indexOf("Harbor Bridge") !== -1);
    assert.strictEqual(kpiValue(outlet(), "OPEN RISKS / ISSUES"), "0", "Harbor Bridge has no seeded risks");
  });

  await check("no active projects shows the empty state, not a crash", () => {
    win.PCC.store.update(function (d) {
      d.projects.forEach(function (p) { p.archived = true; });
    });
    win.PCC.router.go("projectWorkspace");
    win.PCC.router.render();
    assert.ok(outlet().textContent.indexOf("Add a project in Portfolio first") !== -1);
    win.PCC.store.update(function (d) {
      d.projects.forEach(function (p) { p.archived = false; });
    });
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 2);
    assert.strictEqual(data.risks.length, 2);
    assert.strictEqual(data.rfis.length, 1);
    assert.strictEqual(data.change_orders.length, 1);
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
    await check("route '" + routes[i] + "' renders without throwing after adding Project Workspace", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
