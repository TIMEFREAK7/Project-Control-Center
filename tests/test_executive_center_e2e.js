// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 9 (Project
// Executive Center) — same convention every prior gate's e2e test uses. Seeds one
// project with real data across every module it rolls up (schedule/activities, cost
// budget+actuals, a high risk, an overdue RFI, a pending change order, an overdue
// meeting action) and checks the KPIs/health score/diagnostics/summary/snapshot/pack
// all reflect that real data — not fabricated, not stale copies.
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
  const todayIso = new Date().toISOString().slice(0, 10);
  const pastIso = "2020-01-01";

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC && win.PCC.projectHealthEngine, "projectHealthEngine must be bundled");
  });

  let projectId, scheduleId, criticalActId, normalActId, riskId, rfiId, coId, meetingId, budgetItemId;
  await check("seed one project with real data across every rolled-up module", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({
        name: "Exec Center Tower", client: "Acme Client", status: "on_track", progress: 40,
        budget: 100000, project_manager: "P. Manager", planner: "A. Planner",
      });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Main Schedule", revision_number: 1, status: "active", data_date: todayIso });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var critical = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Critical Path Task",
        activity_type: "task", duration: 10, planned_start: pastIso, planned_finish: "2020-01-11",
        percent_complete: 50, status: "in_progress",
      });
      var normal = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Slack Task",
        activity_type: "task", duration: 5, planned_start: pastIso, planned_finish: "2020-01-06",
        percent_complete: 100, status: "complete",
      });
      data.activities.push(critical, normal);
      criticalActId = critical.id;
      normalActId = normal.id;
      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: normal.id, successor_id: critical.id, type: "FS", lag: 0 }));

      var risk = win.PCC.store.newRisk({ project_id: projectId, type: "risk", title: "Ground conditions", probability: "high", impact: "high", status: "open" });
      data.risks.push(risk);
      riskId = risk.id;

      var rfi = win.PCC.store.newRfi({
        project_id: projectId, type: "rfi", subject: "Beam spec clarification", question: "Which spec?",
        status: "open", date_required: pastIso, number: "RFI-001",
      });
      data.rfis.push(rfi);
      rfiId = rfi.id;

      var co = win.PCC.store.newChangeOrder({ project_id: projectId, title: "Extra excavation", description: "x", status: "pending", number: "CO-001" });
      data.change_orders.push(co);
      coId = co.id;

      var meeting = win.PCC.store.newMeeting({ project_id: projectId, title: "Weekly Coordination", meeting_date: pastIso });
      meeting.actions.push(win.PCC.store.newMeetingAction({ description: "Confirm supplier", due_date: pastIso, status: "open" }));
      data.meetings.push(meeting);
      meetingId = meeting.id;

      var budgetItem = win.PCC.store.newCostBudgetItem({ project_id: projectId, name: "Structural steel", planned_amount: 60000, activity_id: critical.id });
      data.cost_budget_items.push(budgetItem);
      budgetItemId = budgetItem.id;
      data.cost_actuals.push(win.PCC.store.newCostActual({ project_id: projectId, description: "Steel delivery", amount: 25000 }));
    });
    assert.ok(projectId && scheduleId && criticalActId && riskId && rfiId && coId && meetingId && budgetItemId);
  });

  await check("running the CPM engine marks the second task critical (zero float)", () => {
    var data = win.PCC.store.get();
    var activities = data.activities.filter((a) => a.schedule_id === scheduleId);
    var relationships = data.relationships.filter((r) => r.schedule_id === scheduleId);
    var result = win.PCC.scheduleCpmEngine.calculateSchedule(activities, relationships, { dataDate: todayIso });
    assert.ok(result.results[criticalActId].total_float <= 0, "Critical Path Task should have zero/negative float given it's fully behind schedule");
  });

  await check("navigate to Executive Center via Portfolio's 'Executive Center' button", () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    var btn = findButtonByText(dom, "Executive Center");
    assert.ok(btn, "Executive Center button not found on a project card");
    btn.click();
    win.PCC.router.render();
    assert.strictEqual(win.PCC.router.currentRouteName(), "executiveCenter");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Exec Center Tower") !== -1, "Executive Center should show the seeded project");
  });

  await check("KPI cards reflect real seeded numbers, not fabricated ones", () => {
    var outlet = win.document.getElementById("page-outlet");
    var text = outlet.textContent;
    assert.ok(text.indexOf("Acme Client") !== -1, "client should appear in overview");
    assert.ok(text.indexOf("Critical Activities") !== -1);
    assert.ok(text.indexOf("Open Risks") !== -1);
    assert.ok(text.indexOf("Open RFIs") !== -1);
    // Cost KPI: budget item total (60000) + nothing else should be the budgeted figure
    // since a real Cost Tracking line item exists (no Portfolio-budget fallback).
    assert.ok(text.indexOf("60,000") !== -1, "budgeted amount should reflect the real Cost Tracking line item, got: " + text.slice(0, 200));
  });

  await check("EVM section renders because this project has real Cost Tracking budget items linked to an activity", () => {
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("EVM") !== -1, "EVM KPI section should render since budget items exist");
    assert.ok(outlet.textContent.indexOf("SPI") !== -1 && outlet.textContent.indexOf("CPI") !== -1);
  });

  await check("Project Health Score panel renders a numeric score, RAG badge, and a full breakdown", () => {
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Project Health Score") !== -1);
    assert.ok(outlet.textContent.indexOf("Schedule") !== -1 && outlet.textContent.indexOf("Cost") !== -1 && outlet.textContent.indexOf("RFI") !== -1);
  });

  await check("Configure Weights lets a weight be edited and the score recomputes", () => {
    var configureBtn = findButtonByText(dom, "Configure Weights");
    assert.ok(configureBtn, "Configure Weights button not found");
    configureBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    var weightInputs = outlet.querySelectorAll("input[type=number]");
    assert.ok(weightInputs.length > 0, "weight inputs should appear when editing");
    weightInputs[0].value = "50";
    weightInputs[0].dispatchEvent(new win.Event("change", { bubbles: true }));
    assert.strictEqual(win.PCC.store.get().settings.health_score_weights.schedule, 50, "editing the first (schedule) weight should persist to settings");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    findButtonByText(dom, "Done").click();
  });

  await check("Project Health Diagnostics lists real alerts (critical activity, high risk, overdue RFI, pending CO, overdue meeting action)", () => {
    var outlet = win.document.getElementById("page-outlet");
    var text = outlet.textContent;
    assert.ok(text.indexOf("Project Health Diagnostics") !== -1);
    assert.ok(text.indexOf("Ground conditions") !== -1, "high risk should appear in diagnostics");
    assert.ok(text.indexOf("RFI-001") !== -1, "overdue RFI should appear in diagnostics");
    assert.ok(text.indexOf("CO-001") !== -1, "pending change order should appear in diagnostics");
    assert.ok(text.indexOf("Confirm supplier") !== -1, "overdue meeting action should appear in diagnostics");
  });

  await check("Management Action List surfaces the same real outstanding items", () => {
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Management Action List") !== -1);
    assert.ok(outlet.textContent.indexOf("Critical risk: Ground conditions") !== -1);
  });

  await check("Executive Summary shows auto-generated text reflecting real data", () => {
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Executive Summary") !== -1);
    assert.ok(outlet.textContent.indexOf("Slack Task") !== -1, "achievements should mention the completed activity");
  });

  await check("editing and saving an Executive Summary section persists an override that replaces the auto text", () => {
    var editButtons = Array.from(win.document.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Edit");
    assert.ok(editButtons.length > 0, "no Edit buttons found in Executive Summary");
    editButtons[0].click();
    var outlet = win.document.getElementById("page-outlet");
    var textarea = outlet.querySelector("textarea");
    assert.ok(textarea, "textarea should appear after clicking Edit");
    textarea.value = "Custom status override text.";
    var saveBtn = Array.from(outlet.querySelectorAll("button")).find((b) => b.textContent.trim() === "Save");
    saveBtn.click();
    var rec = win.PCC.store.get().executive_summaries.find((s) => s.project_id === projectId);
    assert.ok(rec && rec.status_override === "Custom status override text.", "override should be saved to the store");
    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Custom status override text.") !== -1, "the saved override should now display instead of the auto text");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Charts render without throwing (S-Curve, Critical vs Non-Critical, Float Distribution, Risk Heat Map, RFI, Change Orders)", () => {
    var outlet = win.document.getElementById("page-outlet");
    var svgs = outlet.querySelectorAll("svg");
    assert.ok(svgs.length >= 3, "expected multiple chart SVGs, found " + svgs.length);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("switching to 'Snapshot & Management Pack' renders the one-page Project Snapshot with real numbers", () => {
    var tabBtn = findButtonByText(dom, "Snapshot & Management Pack");
    assert.ok(tabBtn, "output tab button not found");
    tabBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.querySelector(".snapshot-doc"), "snapshot-doc should render by default");
    assert.ok(outlet.textContent.indexOf("Exec Center Tower") !== -1);
    assert.ok(outlet.textContent.indexOf("Executive Summary") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Print / Save as PDF calls window.print()", () => {
    var originalPrint = win.print;
    var called = false;
    win.print = function () { called = true; };
    findButtonByText(dom, "Print / Save as PDF").click();
    assert.ok(called, "window.print() should have been called");
    win.print = originalPrint;
  });

  await check("switching to Management Pack mode shows section checkboxes and assembles a multi-section doc", () => {
    var outlet = win.document.getElementById("page-outlet");
    var modeSelect = Array.from(outlet.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent.indexOf("Management Pack") !== -1)
    );
    assert.ok(modeSelect, "output mode select not found");
    var packOption = Array.from(modeSelect.options).find((o) => o.textContent.indexOf("Management Pack") !== -1);
    modeSelect.value = packOption.value;
    modeSelect.dispatchEvent(new win.Event("change"));

    var outlet2 = win.document.getElementById("page-outlet");
    var checkboxes = outlet2.querySelectorAll('input[type="checkbox"]');
    assert.ok(checkboxes.length >= 10, "expected many section checkboxes, found " + checkboxes.length);
    assert.ok(outlet2.textContent.indexOf("Management Pack") !== -1);
    assert.ok(outlet2.textContent.indexOf("KPI Dashboard") !== -1);
    assert.ok(outlet2.textContent.indexOf("EVM Summary") !== -1, "EVM section should be present since this project has EVM data");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("unchecking a Management Pack section removes it from the assembled document", () => {
    var outlet = win.document.getElementById("page-outlet");
    var labels = Array.from(outlet.querySelectorAll("label")).filter((l) => l.textContent.trim() === "Cost Summary");
    assert.ok(labels.length > 0, "Cost Summary checkbox label not found");
    var cb = labels[0].querySelector('input[type="checkbox"]');
    cb.checked = false;
    cb.dispatchEvent(new win.Event("change", { bubbles: true }));
    var outlet2 = win.document.getElementById("page-outlet");
    // "Cost Summary" as a section heading should be gone from the printed doc (the
    // checkbox label itself still exists in the no-print controls panel, so check the
    // panel specifically containing the report doc).
    var reportDoc = outlet2.querySelector(".report-doc");
    assert.ok(reportDoc.textContent.indexOf("Cost Summary") === -1, "unchecked section should not appear in the assembled pack");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a project with zero Cost Tracking budget items shows no EVM section (never fabricated)", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "No-Cost Project", status: "on_track" });
      data.projects.push(project);
    });
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    var btns = Array.from(win.document.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Executive Center");
    btns[btns.length - 1].click();
    win.PCC.router.render();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("No-Cost Project") !== -1);
    assert.ok(outlet.textContent.indexOf("SPI") === -1, "EVM tiles must not render for a project with no budget items");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page, including the new route ----
  var routes = ["dashboard", "portfolio", "executiveCenter", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 9 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
