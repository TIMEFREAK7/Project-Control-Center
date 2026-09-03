// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 26 (PCC Evolution
// Roadmap, Tier F: Integrated Project Controls — 2026-08-20, the final gate of Tier F).
//
// Inspection found Gates 23 (Advanced Delay Analysis) and 24 (Recovery & Mitigation
// Planning) each shipped real capability but had ZERO computed connection to each other,
// despite being the roadmap's own natural pair ("why is this late" / "what are we doing
// about it"). Gate 25's Schedule Performance Score also had no portfolio-wide rollup and
// no presence in the Management Pack report. Aditya confirmed via AskUserQuestion: Health
// Score stays SEPARATE from Schedule Performance (no folding SPI(t) into
// projectHealthEngine.js), and Portfolio Performance DOES get a new Tier F rollup.
//
// Four things this gate adds, all pure computation over already-stored data (delay_records,
// recovery_actions, schedule_performance_snapshots all pre-existed from Gates 23-25) — the
// first gate since Gate 19's follow-on to ship with NO schema_version bump:
// - buildProjectContext() (executiveCenter.js) computes a per-activity Delay <-> Recovery
//   gap: delay days minus OPEN recovery days, floored at 0, never a flat project-wide total
//   (so recovery estimated on one activity can never appear to "cancel out" delay logged on
//   an unrelated one).
// - Executive Center Overview gets a new DELAY & RECOVERY KPI panel + detail list.
// - The Management Pack report gets three new sections: Status Date & Baseline Summary,
//   Delay & Recovery Summary, Schedule Performance Summary.
// - delayRecoveryDashboard.js gets a portfolio-wide "Unaddressed Delay Days" KPI + ranked
//   worst-first activity list; portfolio.js gets the same rollup in its KPI strip plus a new
//   "Sched. Perf." column in the comparison table (via the new
//   window.PCC.executiveCenter.getSchedulePerformanceSummary() export, mirroring
//   getHealthSummary()'s established pattern); schedule.js's Activity Detail Panel gets a
//   small per-activity gap note.
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

  await check("app boots on the bundled index.html without throwing, no schema bump this gate", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.executiveCenter.getSchedulePerformanceSummary, "getSchedulePerformanceSummary export missing");
  });

  // ---- Seed: two projects. Project 1 has two activities designed to hand-verify the
  // per-activity gap rule: Activity A accumulates 15 delay days across two Delay Records,
  // one OPEN recovery action estimating 6 days (an unaddressed gap of 9) and one
  // COMPLETED recovery action estimating 100 days (must NOT count — historical, not live).
  // Activity B accumulates 4 delay days but has an OPEN recovery action estimating 10 days
  // (more than the delay) — its gap must floor at 0, not go negative, and it must NOT
  // appear in the "unaddressed" list even though it has real delay logged. A flat
  // project-wide subtraction (19 total delay - 16 total open-recovery = 3) would give a
  // completely different, wrong number than the correct per-activity total of 9. ----
  let project1Id, project2Id, scheduleId, activityAId, activityBId;
  await check("seed Project 1 with Activity A (15d delay / 6d open recovery / 100d completed recovery) and Activity B (4d delay / 10d open recovery)", () => {
    win.PCC.store.update(function (data) {
      var p1 = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      data.projects.push(p1);
      project1Id = p1.id;

      var p2 = win.PCC.store.newProject({ name: "Harbor Plaza", status: "on_track" });
      data.projects.push(p2);
      project2Id = p2.id;

      var schedule = win.PCC.store.newSchedule({ project_id: project1Id, name: "Rev 0", status: "active", data_date: "2026-01-01" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var a = win.PCC.store.newActivity({ project_id: project1Id, schedule_id: scheduleId, name: "Foundation", activity_type: "task", duration: 5 });
      data.activities.push(a);
      activityAId = a.id;

      var b = win.PCC.store.newActivity({ project_id: project1Id, schedule_id: scheduleId, name: "Structural Steel", activity_type: "task", duration: 5 });
      data.activities.push(b);
      activityBId = b.id;

      data.delay_records.push(win.PCC.store.newDelayRecord({ activity_id: activityAId, project_id: project1Id, delay_cause: "contractor_caused", delay_days: 10, description: "Subcontractor mobilized late." }));
      data.delay_records.push(win.PCC.store.newDelayRecord({ activity_id: activityAId, project_id: project1Id, delay_cause: "weather_force_majeure", delay_days: 5, description: "Rain days." }));
      data.delay_records.push(win.PCC.store.newDelayRecord({ activity_id: activityBId, project_id: project1Id, delay_cause: "design_rfi_driven", delay_days: 4, description: "Awaiting RFI response." }));

      data.recovery_actions.push(win.PCC.store.newRecoveryAction({ activity_id: activityAId, project_id: project1Id, description: "Add weekend shift", status: "open", estimated_recovery_days: 6 }));
      data.recovery_actions.push(win.PCC.store.newRecoveryAction({ activity_id: activityAId, project_id: project1Id, description: "Old superseded plan", status: "completed", estimated_recovery_days: 100 }));
      data.recovery_actions.push(win.PCC.store.newRecoveryAction({ activity_id: activityBId, project_id: project1Id, description: "Expedite RFI response", status: "open", estimated_recovery_days: 10 }));
    });
    assert.ok(project1Id && project2Id && scheduleId && activityAId && activityBId);
  });

  await check("Executive Center Overview shows the DELAY & RECOVERY KPI panel with per-activity gap math, not a flat project-wide subtraction", () => {
    win.PCC.executiveCenter.viewProject(project1Id, "overview");
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    // UI/UX Overhaul Gate 5: DELAY & RECOVERY now lives on the Schedule sub-tab.
    var scheduleTab = Array.from(outlet().querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Schedule");
    assert.ok(scheduleTab, "Schedule sub-tab not found");
    scheduleTab.click();

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    function kpiValue(label) {
      var card = kpiCards.find((c) => c.textContent.indexOf(label) !== -1);
      return card ? card.querySelector(".kpi-card__value").textContent : undefined;
    }
    assert.strictEqual(kpiValue("Delay Records"), "3");
    assert.strictEqual(kpiValue("Total Delay Days"), "19", "15 (A) + 4 (B) = 19");
    assert.strictEqual(kpiValue("Open Recovery Actions"), "2", "the completed action must not count as open");
    assert.strictEqual(
      kpiValue("Unaddressed Delay Days"),
      "9",
      "must be the per-activity sum (A: 15-6=9, B: max(0,4-10)=0 => 9), not the flat 19-16=3 a project-wide subtraction would wrongly give"
    );

    var text = outlet().textContent;
    assert.ok(text.indexOf("Activities With Unaddressed Delay (1)") !== -1, "only Activity A should have a positive gap; got: " + text.slice(0, 400));
    assert.ok(text.indexOf("Foundation") !== -1);
    assert.ok(text.indexOf("15d delay, 6d recovery estimated (9d unaddressed)") !== -1);
    assert.ok(text.indexOf("Structural Steel — 4d delay") === -1, "Activity B's gap floors at 0 and must be excluded from the unaddressed list");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'View in Gantt' from the Delay & Recovery gap detail navigates to Activity A", () => {
    var viewBtn = findButtonByText(dom, "View in Gantt");
    assert.ok(viewBtn, "View in Gantt button not found in the gap detail list");
    viewBtn.click();
    win.PCC.router.render();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    assert.ok(outlet().textContent.indexOf("Foundation") !== -1);
  });

  await check("Activity A's own Detail Panel shows the per-activity gap note (15d delay, 6d recovery, 9d unaddressed)", () => {
    win.PCC.schedule.viewActivity(project1Id, scheduleId, activityAId);
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("15d delay logged, 6d recovery estimated — 9d unaddressed.") !== -1, "got: " + text.slice(0, 600));
  });

  await check("Activity B's own Detail Panel shows the gap note as fully addressed (4d delay, 10d recovery)", () => {
    win.PCC.schedule.viewActivity(project1Id, scheduleId, activityBId);
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("4d delay logged, 10d recovery estimated — fully addressed.") !== -1, "got: " + text.slice(0, 600));
  });

  await check("getSchedulePerformanceSummary() exposes the score/rag separately from Health Score, plus the unaddressed delay total", () => {
    var summary = win.PCC.executiveCenter.getSchedulePerformanceSummary(project1Id);
    assert.strictEqual(summary.unaddressedDelayDays, 9);
    assert.ok("score" in summary && "rag" in summary, "expected score/rag fields");
  });

  await check("Health Score stays untouched by Gate 26 — no Schedule Performance / SPI(t) leakage into projectHealthEngine.js's own breakdown keys", () => {
    var health = win.PCC.executiveCenter.getHealthSummary(project1Id);
    assert.ok(!("schedulePerformanceScore" in health) && !("spiT" in health), "getHealthSummary() must not have grown any Schedule Performance fields");
  });

  await check("the Management Pack's three new sections (Status Date & Baseline, Delay & Recovery, Schedule Performance) render with real figures", async () => {
    win.PCC.router.go("executiveCenter");
    win.PCC.executiveCenter.viewProject(project1Id, "output");
    win.PCC.router.render();

    var modeSelect = Array.from(outlet().querySelectorAll("select")).find((s) => s.textContent.indexOf("Management Pack") !== -1);
    assert.ok(modeSelect, "output mode select not found");
    modeSelect.value = "pack";
    modeSelect.dispatchEvent(new win.Event("change"));
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Status Date & Baseline Summary") !== -1);
    assert.ok(text.indexOf("Status Date") !== -1 && text.indexOf("2026-01-01") !== -1);
    assert.ok(text.indexOf("Delay & Recovery Summary") !== -1);
    assert.ok(text.indexOf("Unaddressed Delay Days") !== -1 && text.indexOf("9") !== -1);
    assert.ok(text.indexOf("Schedule Performance Summary") !== -1);
    assert.ok(text.indexOf("Schedule Performance Score") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("all three new section checkboxes exist and are checked by default", () => {
    var labels = Array.from(outlet().querySelectorAll("label")).map((l) => l.textContent.trim());
    ["Status Date & Baseline Summary", "Delay & Recovery Summary", "Schedule Performance Summary"].forEach(function (name) {
      assert.ok(labels.indexOf(name) !== -1, "checkbox label '" + name + "' not found");
    });
  });

  await check("the Delay & Recovery Dashboard rolls up the portfolio-wide Unaddressed Delay Days KPI and worst-first activity list", async () => {
    win.PCC.router.go("delayRecoveryDashboard");
    win.PCC.router.render();
    // router.js's suppressNextHashRender is a single flag, not a queue — an unflushed
    // go() call here can leave a hashchange event queued that later fires during a
    // subsequent check's own flush() and consumes the flag meant for THAT check's own
    // navigation, triggering an unwanted extra render() there (see CLAUDE.md's React
    // migration notes on this exact cross-check-block race). Flush after every go(),
    // even to a route that itself doesn't need it.
    await flush();

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    function kpiValue(label) {
      var card = kpiCards.find((c) => c.textContent.indexOf(label) !== -1);
      return card ? card.querySelector(".kpi-card__value").textContent : undefined;
    }
    assert.strictEqual(kpiValue("UNADDRESSED DELAY (DAYS)"), "9");

    var text = outlet().textContent;
    assert.ok(text.indexOf("Activities With Unaddressed Delay (worst first)") !== -1);
    assert.ok(text.indexOf("Foundation") !== -1);
    assert.ok(text.indexOf("Riverside Tower") !== -1);
    assert.ok(text.indexOf("15d delay, 6d recovery estimated (9d unaddressed)") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Portfolio Performance's KPI strip shows the same portfolio-wide Unaddressed Delay Days total", async () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    await flush();

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    var card = kpiCards.find((c) => c.textContent.indexOf("UNADDRESSED DELAY (DAYS)") !== -1);
    assert.ok(card, "UNADDRESSED DELAY (DAYS) KPI card not found on Portfolio Performance");
    assert.strictEqual(card.querySelector(".kpi-card__value").textContent, "9");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Portfolio Performance's Compare table has a new 'Sched. Perf.' column with a RAG badge per project", async () => {
    var compareBtn = findButtonByText(dom, "Compare");
    if (compareBtn) {
      compareBtn.click();
      // portfolio.js is a React-migrated page — a click's state update commits
      // asynchronously (see CLAUDE.md's React migration notes), so await flush()
      // before reading the resulting DOM. Deliberately no extra
      // win.PCC.router.render() call here.
      await flush();
    }
    var headerText = outlet().textContent;
    assert.ok(headerText.indexOf("Sched. Perf.") !== -1, "expected a 'Sched. Perf.' column header; got: " + headerText.slice(0, 300));

    var table = outlet().querySelector("table.data-table");
    assert.ok(table, "compare table not found");
    var headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
    assert.deepStrictEqual(headers, ["Project", "Progress", "Schedule", "Risk", "Health", "Sched. Perf."]);

    var rows = Array.from(table.querySelectorAll("tbody tr"));
    assert.strictEqual(rows.length, 2, "expected one row per active project");
    rows.forEach(function (row) {
      var cells = row.querySelectorAll("td");
      assert.strictEqual(cells.length, 6, "expected 6 columns including the new Sched. Perf. one");
    });
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back beyond the deliberate seed above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 2);
    assert.strictEqual(data.activities.length, 2);
    assert.strictEqual(data.delay_records.length, 3);
    assert.strictEqual(data.recovery_actions.length, 3);
  });

  await check("no schema_version bump this gate — Gate 26 is pure computation over already-stored data", () => {
    var data = win.PCC.store.get();
    // Gate 26 itself added no new fields/registers (delay_records/recovery_actions/
    // schedule_performance_snapshots all already existed) and shipped at schema_version
    // 47 unchanged. A later gate (Lessons Learned, Tier 3) has since bumped it further —
    // this assertion only needs schema_version to be AT LEAST 47, not exactly 47, so this
    // test keeps passing against whatever the current bundled index.html's latest schema
    // actually is, rather than hardcoding a number that goes stale the next time any
    // future gate bumps it.
    assert.ok(data.schema_version >= 47, "Gate 26 should not have bumped schema_version below 47 — it computes purely from delay_records/recovery_actions/schedule_performance_snapshots, all of which already existed");
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 26 (Integrated Project Controls)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
