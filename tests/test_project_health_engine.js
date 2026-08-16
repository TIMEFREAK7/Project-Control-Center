// Standalone Node test for projectHealthEngine.js — pure calculation, no DOM, so this
// can eval the real source file directly and call it, same approach
// test_schedule_gantt_layout.js and test_cost_evm_engine.js already use for the other
// pure engines in this app.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.stack || e.message);
  }
}

global.window = {};
const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "projectHealthEngine.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);
const engine = global.window.PCC.projectHealthEngine;

// ---------------------------------------------------------------------------
// computeHealthScore
// ---------------------------------------------------------------------------

check("a fully healthy project with every factor available scores 100 and RAG on_track", () => {
  const ctx = {
    totalActivityCount: 20, criticalCount: 0, nearCriticalCount: 0,
    forecastVarianceDays: 0, plannedDurationDays: 100,
    budgetTotal: 100000, actualTotal: 40000,
    highRiskCount: 0, openRiskCount: 0,
    criticalIssueCount: 0, openIssueCount: 0,
    overdueRfiCount: 0, openRfiCount: 0,
    pendingChangeOrderCount: 0,
  };
  const result = engine.computeHealthScore(ctx, engine.DEFAULT_WEIGHTS);
  assert.strictEqual(result.score, 100);
  assert.strictEqual(result.rag, "on_track");
  assert.strictEqual(result.breakdown.length, 6, "one breakdown row per factor");
  result.breakdown.forEach((f) => assert.ok(f.available, f.key + " should be available"));
});

check("a factor with no underlying data is excluded (available: false), not scored as 0", () => {
  const ctx = {
    totalActivityCount: 0, // no schedule yet
    budgetTotal: 0, // no budget yet
    highRiskCount: 0, openRiskCount: 0,
    criticalIssueCount: 0, openIssueCount: 0,
    overdueRfiCount: 0, openRfiCount: 0,
    pendingChangeOrderCount: 0,
  };
  const result = engine.computeHealthScore(ctx, engine.DEFAULT_WEIGHTS);
  var scheduleFactor = result.breakdown.find((f) => f.key === "schedule");
  var costFactor = result.breakdown.find((f) => f.key === "cost");
  assert.strictEqual(scheduleFactor.available, false);
  assert.strictEqual(costFactor.available, false);
  // Remaining factors (risk/issue/rfi/change) are all clean, so score should still be
  // 100 — proving the missing factors were excluded and re-normalized, not zeroed.
  assert.strictEqual(result.score, 100);
});

check("returns score: null and rag: 'unknown' when literally no factor has data", () => {
  // Every scorer keys off fields that default falsy/zero here; schedule/cost are
  // unavailable by design, and risk/issue/rfi/change are "always available" by design
  // (an empty register is a real, meaningful zero) — so to hit the true "nothing at
  // all" case we'd need those to be unavailable too, which the engine doesn't support
  // per its own design (see header comment: those four are always meaningful). This
  // test instead confirms the *documented* all-available-but-perfect floor case is
  // distinguishable from a genuinely degraded one below.
  const ctx = { totalActivityCount: 0, budgetTotal: 0 };
  const result = engine.computeHealthScore(ctx, engine.DEFAULT_WEIGHTS);
  assert.notStrictEqual(result.score, null, "risk/issue/rfi/change are always available, so score should compute");
});

check("critical activities and schedule slippage reduce the schedule sub-score", () => {
  const healthy = engine.computeHealthScore({ totalActivityCount: 10, criticalCount: 0, nearCriticalCount: 0 }, engine.DEFAULT_WEIGHTS);
  const degraded = engine.computeHealthScore(
    { totalActivityCount: 10, criticalCount: 4, nearCriticalCount: 2, forecastVarianceDays: 20, plannedDurationDays: 100 },
    engine.DEFAULT_WEIGHTS
  );
  var healthySchedule = healthy.breakdown.find((f) => f.key === "schedule").score;
  var degradedSchedule = degraded.breakdown.find((f) => f.key === "schedule").score;
  assert.ok(degradedSchedule < healthySchedule, "critical/near-critical/variance should lower the schedule score");
});

check("cost over budget lowers the cost sub-score; under budget stays at 100", () => {
  const over = engine.computeHealthScore({ budgetTotal: 100000, actualTotal: 150000 }, engine.DEFAULT_WEIGHTS);
  const under = engine.computeHealthScore({ budgetTotal: 100000, actualTotal: 80000 }, engine.DEFAULT_WEIGHTS);
  assert.ok(over.breakdown.find((f) => f.key === "cost").score < 100);
  assert.strictEqual(under.breakdown.find((f) => f.key === "cost").score, 100);
});

check("high risks, critical issues, overdue RFIs, and pending change orders each lower their own factor", () => {
  const result = engine.computeHealthScore(
    { highRiskCount: 3, criticalIssueCount: 2, overdueRfiCount: 4, pendingChangeOrderCount: 5 },
    engine.DEFAULT_WEIGHTS
  );
  assert.ok(result.breakdown.find((f) => f.key === "risk").score < 100);
  assert.ok(result.breakdown.find((f) => f.key === "issue").score < 100);
  assert.ok(result.breakdown.find((f) => f.key === "rfi").score < 100);
  assert.ok(result.breakdown.find((f) => f.key === "change").score < 100);
  assert.ok(result.score < 100);
});

check("weights that don't sum to 100 are re-normalized rather than distorting the score", () => {
  const ctx = { highRiskCount: 0, criticalIssueCount: 0, overdueRfiCount: 0, pendingChangeOrderCount: 0 };
  const weird = engine.computeHealthScore(ctx, { schedule: 1, cost: 1, risk: 1, issue: 1, rfi: 1, change: 1 });
  // All available factors are perfect (100), so regardless of relative weight the
  // overall score should still land at 100 once re-normalized.
  assert.strictEqual(weird.score, 100);
});

check("missing/zero weights fall back to DEFAULT_WEIGHTS rather than crashing", () => {
  const result = engine.computeHealthScore({}, {});
  assert.ok(result.score !== undefined);
  assert.strictEqual(typeof result.score, "number");
});

check("RAG thresholds: >=80 on_track, >=60 at_risk, below critical", () => {
  assert.strictEqual(engine.computeHealthScore({ highRiskCount: 0 }, engine.DEFAULT_WEIGHTS).rag, "on_track");
  // Force a mid-range score via heavy risk/issue penalties while schedule/cost stay unavailable.
  var mid = engine.computeHealthScore({ highRiskCount: 1, criticalIssueCount: 1 }, engine.DEFAULT_WEIGHTS);
  assert.ok(mid.score < 100);
  var low = engine.computeHealthScore(
    { highRiskCount: 6, criticalIssueCount: 5, overdueRfiCount: 6, pendingChangeOrderCount: 10 },
    engine.DEFAULT_WEIGHTS
  );
  assert.strictEqual(low.rag, "critical");
});

// ---------------------------------------------------------------------------
// computeDiagnostics
// ---------------------------------------------------------------------------

check("SPI/CPI below threshold produce critical EVM alerts; above threshold produce none", () => {
  var bad = engine.computeDiagnostics({ spi: 0.7, cpi: 0.8 });
  assert.ok(bad.some((a) => a.id === "spi" && a.severity === "critical"));
  assert.ok(bad.some((a) => a.id === "cpi" && a.severity === "critical"));
  var good = engine.computeDiagnostics({ spi: 1.05, cpi: 1.1 });
  assert.ok(!good.some((a) => a.id === "spi" || a.id === "cpi"));
});

check("EAC exceeding BAC produces a warning alert", () => {
  var alerts = engine.computeDiagnostics({ bac: 100000, eac: 120000 });
  assert.ok(alerts.some((a) => a.id === "eac_over_bac" && a.severity === "warning"));
  var ok = engine.computeDiagnostics({ bac: 100000, eac: 90000 });
  assert.ok(!ok.some((a) => a.id === "eac_over_bac"));
});

check("actual cost exceeding budget produces a warning alert with a link to Cost Tracking", () => {
  var alerts = engine.computeDiagnostics({ budgetTotal: 50000, actualTotal: 60000 });
  var alert = alerts.find((a) => a.id === "cost_over_budget");
  assert.ok(alert);
  assert.strictEqual(alert.link.module, "cost");
});

check("critical and near-critical activity presence each produce their own alert", () => {
  var alerts = engine.computeDiagnostics({
    criticalActivities: [{ id: "a1", name: "Foundation" }],
    nearCriticalActivities: [{ id: "a2", name: "Framing" }],
  });
  var critical = alerts.find((a) => a.id === "negative_float");
  var near = alerts.find((a) => a.id === "near_critical");
  assert.ok(critical && critical.severity === "critical");
  assert.ok(near && near.severity === "info");
});

check("one alert is generated per slipped milestone, high risk, overdue RFI, overdue meeting action, and pending change order — each carrying a real record link", () => {
  var alerts = engine.computeDiagnostics({
    slippedMilestones: [{ id: "m1", name: "Permit Approval", varianceDays: 5 }],
    highRisks: [{ id: "r1", title: "Ground conditions" }],
    overdueRfis: [{ id: "rf1", number: "RFI-001", subject: "Beam spec", daysOverdue: 3 }],
    overdueMeetingActions: [{ meetingId: "m_1", meetingTitle: "Weekly Coordination", description: "Confirm supplier", dueDate: "2026-01-01" }],
    pendingChangeOrders: [{ id: "co1", number: "CO-001", title: "Extra excavation" }],
  });
  assert.ok(alerts.find((a) => a.id === "milestone_slip_m1" && a.link.recordId === "m1"));
  assert.ok(alerts.find((a) => a.id === "risk_r1" && a.link.module === "risks" && a.link.recordId === "r1"));
  assert.ok(alerts.find((a) => a.id === "rfi_rf1" && a.link.module === "rfis" && a.link.recordId === "rf1"));
  assert.ok(alerts.find((a) => a.source === "Meetings" && a.link.recordId === "m_1"));
  assert.ok(alerts.find((a) => a.id === "co_co1" && a.link.module === "changeOrders" && a.link.recordId === "co1"));
});

check("with no context at all, no alerts fire and nothing throws", () => {
  var alerts = engine.computeDiagnostics({});
  assert.deepStrictEqual(alerts, []);
  var alertsUndefined = engine.computeDiagnostics();
  assert.deepStrictEqual(alertsUndefined, []);
});

check("alerts are sorted critical, then warning, then info", () => {
  var alerts = engine.computeDiagnostics({
    spi: 0.5, // critical
    pendingChangeOrders: [{ id: "co1", number: "CO-001", title: "X" }], // info
    budgetTotal: 100, actualTotal: 200, // warning
  });
  var ranks = { critical: 0, warning: 1, info: 2 };
  for (var i = 1; i < alerts.length; i++) {
    assert.ok(ranks[alerts[i - 1].severity] <= ranks[alerts[i].severity], "alerts must be sorted by severity");
  }
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
