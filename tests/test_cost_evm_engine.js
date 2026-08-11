// Standalone Node test for costEvmEngine.js. Pure calculation module, no DOM, so this
// runs directly under `node` without jsdom.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

global.window = global.window || {};
const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "costEvmEngine.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);
const engine = window.PCC.costEvmEngine;

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.message);
  }
}

function activity(overrides) {
  return Object.assign(
    {
      id: "act_1",
      name: "Excavate",
      activity_type: "task",
      schedule_id: "sch_1",
      percent_complete: 0,
      planned_start: null,
      planned_finish: null,
      early_start: null,
      early_finish: null,
    },
    overrides
  );
}

function budgetItem(overrides) {
  return Object.assign({ id: "cb_1", name: "Excavation", planned_amount: 1000, activity_id: "" }, overrides);
}

// ---------------------------------------------------------------------------
// Planned Value time-phasing (linear across the activity's own span)
// ---------------------------------------------------------------------------
check("PV is 0 before the activity's span starts", () => {
  const a = activity({ planned_start: "2026-03-10", planned_finish: "2026-03-20" });
  const b = budgetItem({ activity_id: a.id });
  const result = engine.computeEvm([b], [], [a], [{ id: "sch_1", data_date: "2026-03-01" }]);
  assert.strictEqual(result.pv, 0);
});

check("PV is the full item budget after the activity's span ends", () => {
  const a = activity({ planned_start: "2026-03-10", planned_finish: "2026-03-20" });
  const b = budgetItem({ activity_id: a.id });
  const result = engine.computeEvm([b], [], [a], [{ id: "sch_1", data_date: "2026-04-01" }]);
  assert.strictEqual(result.pv, 1000);
});

check("PV is linearly interpolated at the midpoint of the activity's span", () => {
  const a = activity({ planned_start: "2026-03-01", planned_finish: "2026-03-11" }); // 10-day span
  const b = budgetItem({ activity_id: a.id, planned_amount: 2000 });
  const result = engine.computeEvm([b], [], [a], [{ id: "sch_1", data_date: "2026-03-06" }]); // 5 days in
  assert.strictEqual(result.pv, 1000); // 50% of 2000
});

check("a zero-duration (milestone) span is a step function, not a division by zero", () => {
  const a = activity({ activity_type: "milestone", planned_start: "2026-03-15", planned_finish: "2026-03-15" });
  const before = budgetItem({ activity_id: a.id, planned_amount: 5000 });
  const beforeResult = engine.computeEvm([before], [], [a], [{ id: "sch_1", data_date: "2026-03-10" }]);
  assert.strictEqual(beforeResult.pv, 0);
  const afterResult = engine.computeEvm([before], [], [a], [{ id: "sch_1", data_date: "2026-03-20" }]);
  assert.strictEqual(afterResult.pv, 5000);
});

check("calculated (early_*) dates win over planned dates for PV, matching Gantt/baseline precedence", () => {
  const a = activity({
    planned_start: "2026-01-01",
    planned_finish: "2026-01-11",
    early_start: "2026-03-01",
    early_finish: "2026-03-11",
  });
  const b = budgetItem({ activity_id: a.id, planned_amount: 1000 });
  // Data date matches the planned span's midpoint, NOT the calculated span's — if
  // calculated dates are used correctly, this is still before the calculated span starts.
  const result = engine.computeEvm([b], [], [a], [{ id: "sch_1", data_date: "2026-01-06" }]);
  assert.strictEqual(result.pv, 0, "should use early_start/early_finish, which haven't started yet by this date");
});

check("an activity with no usable dates leaves PV null-contribution (excluded, not guessed)", () => {
  const a = activity({});
  const b = budgetItem({ activity_id: a.id, planned_amount: 1000 });
  const result = engine.computeEvm([b], [], [a], [{ id: "sch_1", data_date: "2026-03-01" }]);
  assert.strictEqual(result.pv, 0, "no usable dates contributes nothing to the PV total");
  assert.strictEqual(result.items[0].pv, null, "the item's own pv should be null, not 0, to distinguish from a real zero");
});

// ---------------------------------------------------------------------------
// Earned Value from real per-activity percent_complete
// ---------------------------------------------------------------------------
check("EV is the item's budget times its own activity's percent_complete", () => {
  const a = activity({ percent_complete: 40 });
  const b = budgetItem({ activity_id: a.id, planned_amount: 5000 });
  const result = engine.computeEvm([b], [], [a], []);
  assert.strictEqual(result.ev, 2000);
});

check("percent_complete is clamped to [0, 100] defensively", () => {
  const over = activity({ id: "act_over", percent_complete: 150 });
  const under = activity({ id: "act_under", percent_complete: -20 });
  const bOver = budgetItem({ id: "cb_over", activity_id: over.id, planned_amount: 1000 });
  const bUnder = budgetItem({ id: "cb_under", activity_id: under.id, planned_amount: 1000 });
  const overResult = engine.computeEvm([bOver], [], [over], []);
  const underResult = engine.computeEvm([bUnder], [], [under], []);
  assert.strictEqual(overResult.ev, 1000);
  assert.strictEqual(underResult.ev, 0);
});

check("two budget items linked to the same activity both earn value independently", () => {
  const a = activity({ percent_complete: 50 });
  const labor = budgetItem({ id: "cb_labor", activity_id: a.id, planned_amount: 1000 });
  const equipment = budgetItem({ id: "cb_equip", activity_id: a.id, planned_amount: 2000 });
  const result = engine.computeEvm([labor, equipment], [], [a], []);
  assert.strictEqual(result.ev, 1500); // 500 + 1000
  assert.strictEqual(result.linkedBac, 3000);
});

// ---------------------------------------------------------------------------
// Unlinked items: counted in BAC, excluded from PV/EV, flagged via coverage
// ---------------------------------------------------------------------------
check("an unlinked budget item counts toward BAC but contributes nothing to PV or EV", () => {
  const linked = activity({ percent_complete: 100, planned_start: "2026-01-01", planned_finish: "2026-01-02" });
  const linkedItem = budgetItem({ id: "cb_linked", activity_id: linked.id, planned_amount: 1000 });
  const unlinkedItem = budgetItem({ id: "cb_unlinked", activity_id: "", planned_amount: 4000 });
  const result = engine.computeEvm([linkedItem, unlinkedItem], [], [linked], [{ id: "sch_1", data_date: "2026-06-01" }]);
  assert.strictEqual(result.bac, 5000);
  assert.strictEqual(result.linkedBac, 1000);
  assert.strictEqual(result.unlinkedBac, 4000);
  assert.strictEqual(result.ev, 1000);
  assert.strictEqual(result.pv, 1000);
  assert.strictEqual(result.coveragePct, 20); // 1000 / 5000
});

check("a budget item whose activity_id points at a deleted activity is treated as unlinked, not as a crash", () => {
  const item = budgetItem({ activity_id: "act_deleted", planned_amount: 500 });
  const result = engine.computeEvm([item], [], [], []);
  assert.strictEqual(result.unlinkedBac, 500);
  assert.strictEqual(result.ev, 0);
});

// ---------------------------------------------------------------------------
// Actual Cost: always the full total, regardless of linkage
// ---------------------------------------------------------------------------
check("AC sums every actual for the project regardless of whether its budget item is linked", () => {
  const a = activity({});
  const item = budgetItem({ activity_id: "" }); // unlinked
  const actuals = [
    { id: "ca_1", amount: 300 },
    { id: "ca_2", amount: 700 },
  ];
  const result = engine.computeEvm([item], actuals, [a], []);
  assert.strictEqual(result.ac, 1000);
});

check("explicit options.bac/options.ac override the derived totals (for reusing projectCostSummary's numbers)", () => {
  const a = activity({ percent_complete: 50 });
  const item = budgetItem({ activity_id: a.id, planned_amount: 100 });
  const result = engine.computeEvm([item], [{ amount: 50 }], [a], [], { bac: 999999, ac: 111 });
  assert.strictEqual(result.bac, 999999);
  assert.strictEqual(result.ac, 111);
});

check("with zero linked budget items but real actual cost, CPI/SPI stay null rather than falsely reading as 0.00", () => {
  // No budget items linked to any activity at all (e.g. a project relying entirely on
  // the Portfolio-Budget-field fallback), but real money has been spent (AC > 0).
  // EV/PV are both 0 because nothing is measurable, not because performance is zero.
  const unlinked = budgetItem({ activity_id: "" });
  const result = engine.computeEvm([unlinked], [{ amount: 5000 }], [], [], { bac: 250000 });
  assert.strictEqual(result.ev, 0);
  assert.strictEqual(result.ac, 5000);
  assert.strictEqual(result.cpi, null, "should not report a misleading CPI of 0.00 with nothing linked yet");
  assert.strictEqual(result.spi, null);
  assert.strictEqual(result.eac, null);
});

check("once real work is linked, a genuine 0%-complete activity correctly produces CPI/SPI of 0, not null", () => {
  const a = activity({ percent_complete: 0, planned_start: "2026-01-01", planned_finish: "2026-01-11" });
  const item = budgetItem({ activity_id: a.id, planned_amount: 1000 });
  // Data date well past the activity's span (PV = full 1000), but 0% complete (EV = 0)
  // and real actual cost already spent — a genuinely bad, real signal, not a guess.
  const result = engine.computeEvm([item], [{ amount: 300 }], [a], [{ id: "sch_1", data_date: "2026-06-01" }]);
  assert.strictEqual(result.ev, 0);
  assert.strictEqual(result.pv, 1000);
  assert.strictEqual(result.cpi, 0, "0% earned against real spend is a real, meaningful CPI of 0");
  assert.strictEqual(result.spi, 0);
});

// ---------------------------------------------------------------------------
// Derived indices and forecast
// ---------------------------------------------------------------------------
check("CPI/SPI/CV/SV are computed correctly for a simple on-plan scenario", () => {
  const a = activity({ percent_complete: 50, planned_start: "2026-01-01", planned_finish: "2026-01-11" });
  const item = budgetItem({ activity_id: a.id, planned_amount: 1000 });
  // Data date at the midpoint: PV = 500 (50% elapsed), EV = 500 (50% complete), AC = 500 (on budget).
  const result = engine.computeEvm([item], [{ amount: 500 }], [a], [{ id: "sch_1", data_date: "2026-01-06" }]);
  assert.strictEqual(result.pv, 500);
  assert.strictEqual(result.ev, 500);
  assert.strictEqual(result.ac, 500);
  assert.strictEqual(result.cv, 0);
  assert.strictEqual(result.sv, 0);
  assert.strictEqual(result.cpi, 1);
  assert.strictEqual(result.spi, 1);
});

check("CPI/SPI are null (not a divide-by-zero) when AC/PV are zero", () => {
  const a = activity({ percent_complete: 0 });
  const item = budgetItem({ activity_id: a.id, planned_amount: 1000 });
  const result = engine.computeEvm([item], [], [a], []);
  assert.strictEqual(result.ac, 0);
  assert.strictEqual(result.pv, 0);
  assert.strictEqual(result.cpi, null);
  assert.strictEqual(result.spi, null);
  assert.strictEqual(result.eac, null, "EAC depends on CPI; no CPI means no EAC, not a guess");
});

check("EAC/ETC/VAC follow the documented BAC/CPI formula when CPI is known", () => {
  const a = activity({ percent_complete: 25 });
  const item = budgetItem({ activity_id: a.id, planned_amount: 1000 });
  // EV = 250. AC = 500 (running over budget: CPI = 0.5).
  const result = engine.computeEvm([item], [{ amount: 500 }], [a], [], { bac: 1000 });
  assert.strictEqual(result.cpi, 0.5);
  assert.strictEqual(result.eac, 2000); // BAC / CPI = 1000 / 0.5
  assert.strictEqual(result.etc, 1500); // EAC - AC
  assert.strictEqual(result.vac, -1000); // BAC - EAC
});

check("a project with zero budget items reports zero everywhere without throwing", () => {
  const result = engine.computeEvm([], [], [], []);
  assert.strictEqual(result.bac, 0);
  assert.strictEqual(result.ac, 0);
  assert.strictEqual(result.pv, 0);
  assert.strictEqual(result.ev, 0);
  assert.strictEqual(result.coveragePct, null, "0/0 coverage is undefined, not misleadingly 0% or 100%");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
