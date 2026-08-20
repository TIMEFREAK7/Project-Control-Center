// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 25 (PCC Evolution
// Roadmap, Tier F: Advanced Schedule Performance — 2026-08-20). Inspection found classic SPI
// (costEvmEngine.js, EV/PV) was the only schedule-performance figure anywhere, and it has a
// well-documented flaw: it converges toward 1.0 as a project nears completion regardless of
// how late it actually finishes, because PV stops growing once every activity's planned span
// has elapsed. Aditya confirmed via AskUserQuestion: build Earned Schedule (SPI(t), the
// standard fix) plus a dedicated Schedule Performance Score, captured via a NEW standalone
// snapshot mechanism (not piggybacked on Weekly Reviews) so trend granularity isn't capped by
// how often those get written.
//
// This test reuses the exact near-completion divergence scenario already hand-verified in
// tests/test_cost_evm_engine.js's pure-engine test (two items, one fully done on a short span,
// one 90% done on a long span, data date AT the planned finish): classic SPI reads 0.95
// (looks almost on-track) while Earned Schedule correctly reports SPI(t) 0.90 / 2 days behind
// — proving the UI surfaces the real divergence, not just the pure engine math.
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
  });

  // ---- Seed: Item A (5-day span, fully complete) + Item B (20-day span, 90%
  // complete), data date AT the planned finish — the exact near-completion divergence
  // scenario already hand-verified in test_cost_evm_engine.js. ----
  let projectId, scheduleId, activityAId, activityBId;
  await check("seed a project/schedule with the near-completion SPI-vs-SPI(t) divergence scenario", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-01-21" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var a = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Foundation",
        activity_type: "task", duration: 5, planned_start: "2026-01-01", planned_finish: "2026-01-06",
        percent_complete: 100,
      });
      data.activities.push(a);
      activityAId = a.id;

      var b = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Structural Steel",
        activity_type: "task", duration: 20, planned_start: "2026-01-01", planned_finish: "2026-01-21",
        percent_complete: 90,
      });
      data.activities.push(b);
      activityBId = b.id;

      data.cost_budget_items.push(win.PCC.store.newCostBudgetItem({ project_id: projectId, name: "Foundation Work", planned_amount: 5000, activity_id: activityAId }));
      data.cost_budget_items.push(win.PCC.store.newCostBudgetItem({ project_id: projectId, name: "Steel Erection", planned_amount: 5000, activity_id: activityBId }));
    });
    assert.ok(projectId && scheduleId && activityAId && activityBId);
  });

  await check("Executive Center's SCHEDULE PERFORMANCE panel shows classic SPI (0.95) and Earned Schedule SPI(t) (0.90) diverging correctly", () => {
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    function kpiValue(label) {
      var card = kpiCards.find((c) => c.textContent.indexOf(label) !== -1);
      return card ? card.querySelector(".kpi-card__value").textContent : undefined;
    }
    assert.strictEqual(kpiValue("SPI"), "0.95", "classic SPI should read almost-on-track");
    assert.strictEqual(kpiValue("SPI(t)"), "0.90", "Earned Schedule correctly reads more pessimistic than classic SPI here");
    assert.strictEqual(kpiValue("Earned Schedule Variance"), "-2d", "2 days behind the Earned Schedule plan");

    var scoreCard = kpiCards.find((c) => c.textContent.indexOf("Performance Score") !== -1);
    assert.ok(scoreCard, "Performance Score KPI card not found");
    var scoreValue = Number(scoreCard.querySelector(".kpi-card__value").textContent);
    assert.ok(scoreValue > 0 && scoreValue < 100, "expected a genuine partial score, got: " + scoreValue);

    var text = outlet().textContent;
    assert.ok(text.indexOf("SPI 0.95") !== -1);
    assert.ok(text.indexOf("SPI(t) 0.90") !== -1);
    assert.ok(text.indexOf("2 day(s) behind the Earned Schedule plan") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Progress S-Curve initially prompts to capture a snapshot (no actual-progress history exists yet)", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Capture a Schedule Performance snapshot (below) to start plotting actual progress here.") !== -1);
  });

  await check("clicking 'Capture Performance Snapshot' persists the exact SPI/SPI(t)/score/schedule_progress_pct figures", () => {
    var captureBtn = findButtonByText(dom, "Capture Performance Snapshot");
    assert.ok(captureBtn, "Capture Performance Snapshot button not found");
    captureBtn.click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedule_performance_snapshots.length, 1);
    var snap = data.schedule_performance_snapshots[0];
    assert.strictEqual(snap.project_id, projectId);
    assert.strictEqual(snap.spi, 0.95);
    assert.strictEqual(snap.spi_t, 0.9);
    assert.strictEqual(snap.schedule_variance_days, -2);
    assert.ok(snap.schedule_performance_score > 0 && snap.schedule_performance_score < 100);
    assert.ok(snap.schedule_progress_pct != null, "schedule_progress_pct must be captured for the S-Curve overlay");

    var text = outlet().textContent;
    assert.ok(text.indexOf("1 performance snapshot captured") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Progress S-Curve now plots the actual-progress overlay from the captured snapshot", () => {
    // The snapshot's captured_at defaults to "now" (today's real clock date), which
    // falls well outside the seeded activities' Jan 2026 planned-date range — and is
    // correctly excluded from the chart by design (see sCurveChart()'s own comment on
    // not distorting the shared x-axis). Move it into range directly to prove the
    // overlay itself renders correctly once a snapshot's date IS in range.
    win.PCC.store.update(function (d) {
      d.schedule_performance_snapshots[0].captured_at = "2026-01-15T00:00:00.000Z";
    });
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("vs. actual progress (green) from 1 captured Schedule Performance snapshot(s)") !== -1, "got: " + text.slice(text.indexOf("Planned cumulative"), text.indexOf("Planned cumulative") + 300));
  });

  await check("capturing a second snapshot shows both in the history list, newest first", () => {
    var captureBtn = findButtonByText(dom, "Capture Performance Snapshot");
    captureBtn.click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.schedule_performance_snapshots.length, 2);

    var text = outlet().textContent;
    assert.ok(text.indexOf("2 performance snapshots captured") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back beyond the deliberate seed/capture above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.activities.length, 2);
    assert.strictEqual(data.schedules.length, 1);
    assert.strictEqual(data.cost_budget_items.length, 2);
    assert.strictEqual(data.schedule_performance_snapshots.length, 2);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 25 (Advanced Schedule Performance)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
