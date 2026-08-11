// Standalone Node test for scheduleGanttLayout.js. Pure calculation module, no DOM,
// so this runs directly under `node` without jsdom.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

global.window = global.window || {};
const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "scheduleGanttLayout.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);
const layoutEngine = window.PCC.scheduleGanttLayout;

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

function baseActivity(overrides) {
  return Object.assign(
    {
      id: "act_1",
      name: "Excavate",
      activity_type: "task",
      planned_start: null,
      planned_finish: null,
      early_start: null,
      early_finish: null,
      total_float: null,
      percent_complete: null,
    },
    overrides
  );
}

// ---------------------------------------------------------------------------
// Date precedence: calculated wins over planned, matching scheduleBaselineEngine.js
// ---------------------------------------------------------------------------
check("prefers calculated (early_*) dates over planned when both present", () => {
  const a = baseActivity({
    planned_start: "2026-01-01",
    planned_finish: "2026-01-05",
    early_start: "2026-01-03",
    early_finish: "2026-01-07",
  });
  const result = layoutEngine.computeLayout([a], {});
  assert.strictEqual(result.rows[0].dateSource, "calculated");
  assert.strictEqual(result.rows[0].start, "2026-01-03");
  assert.strictEqual(result.rows[0].finish, "2026-01-07");
});

check("falls back to planned dates when no calculated dates exist", () => {
  const a = baseActivity({ planned_start: "2026-01-01", planned_finish: "2026-01-05" });
  const result = layoutEngine.computeLayout([a], {});
  assert.strictEqual(result.rows[0].dateSource, "planned");
  assert.strictEqual(result.rows[0].durationDays, 4);
});

check("an activity with neither calculated nor planned dates is 'none' and excluded from range", () => {
  const a = baseActivity({});
  const result = layoutEngine.computeLayout([a], {});
  assert.strictEqual(result.rows[0].dateSource, "none");
  assert.strictEqual(result.datedCount, 0);
  assert.strictEqual(result.undatedCount, 1);
  assert.strictEqual(result.rangeStart, null);
  assert.strictEqual(result.rangeEnd, null);
});

// ---------------------------------------------------------------------------
// Milestones: single date treated as a zero-width point
// ---------------------------------------------------------------------------
check("a milestone with only a calculated early_start becomes a zero-width dated point", () => {
  const a = baseActivity({ activity_type: "milestone", early_start: "2026-03-01", early_finish: null });
  const result = layoutEngine.computeLayout([a], {});
  assert.strictEqual(result.rows[0].isMilestone, true);
  assert.strictEqual(result.rows[0].dateSource, "calculated");
  assert.strictEqual(result.rows[0].start, "2026-03-01");
  assert.strictEqual(result.rows[0].finish, "2026-03-01");
  assert.strictEqual(result.rows[0].durationDays, 0);
});

check("a milestone with only a planned_start falls back to that as a planned point", () => {
  const a = baseActivity({ activity_type: "milestone", planned_start: "2026-03-01" });
  const result = layoutEngine.computeLayout([a], {});
  assert.strictEqual(result.rows[0].dateSource, "planned");
  assert.strictEqual(result.rows[0].start, "2026-03-01");
});

// ---------------------------------------------------------------------------
// Criticality flag
// ---------------------------------------------------------------------------
check("isCritical is true when total_float is 0 or negative", () => {
  const a = baseActivity({ planned_start: "2026-01-01", planned_finish: "2026-01-02", total_float: 0 });
  const b = baseActivity({ id: "act_2", planned_start: "2026-01-01", planned_finish: "2026-01-02", total_float: -2 });
  const c = baseActivity({ id: "act_3", planned_start: "2026-01-01", planned_finish: "2026-01-02", total_float: 3 });
  const result = layoutEngine.computeLayout([a, b, c], {});
  const byId = {};
  result.rows.forEach((r) => (byId[r.id] = r));
  assert.strictEqual(byId.act_1.isCritical, true);
  assert.strictEqual(byId.act_2.isCritical, true);
  assert.strictEqual(byId.act_3.isCritical, false);
});

check("isCritical is false (not true) when total_float hasn't been calculated yet", () => {
  const a = baseActivity({ planned_start: "2026-01-01", planned_finish: "2026-01-02", total_float: null });
  const result = layoutEngine.computeLayout([a], {});
  assert.strictEqual(result.rows[0].isCritical, false);
  assert.strictEqual(result.rows[0].hasFloatData, false);
});

// ---------------------------------------------------------------------------
// Sorting and range
// ---------------------------------------------------------------------------
check("dated rows sort by start date ascending; undated rows are appended after, sorted by name", () => {
  const late = baseActivity({ id: "late", name: "Z Late", planned_start: "2026-02-01", planned_finish: "2026-02-03" });
  const early = baseActivity({ id: "early", name: "A Early", planned_start: "2026-01-01", planned_finish: "2026-01-03" });
  const undatedB = baseActivity({ id: "u_b", name: "B Undated" });
  const undatedA = baseActivity({ id: "u_a", name: "A Undated" });
  const result = layoutEngine.computeLayout([late, early, undatedB, undatedA], {});
  assert.deepStrictEqual(
    result.rows.map((r) => r.id),
    ["early", "late", "u_a", "u_b"]
  );
});

check("rangeStart/rangeEnd span the earliest start and latest finish across dated activities", () => {
  const a = baseActivity({ id: "a", planned_start: "2026-01-10", planned_finish: "2026-01-15" });
  const b = baseActivity({ id: "b", planned_start: "2026-01-05", planned_finish: "2026-01-20" });
  const result = layoutEngine.computeLayout([a, b], {});
  assert.strictEqual(result.rangeStart, "2026-01-05");
  assert.strictEqual(result.rangeEnd, "2026-01-20");
});

check("a data_date outside the activity span extends the range to include it", () => {
  const a = baseActivity({ planned_start: "2026-01-10", planned_finish: "2026-01-15" });
  const result = layoutEngine.computeLayout([a], { dataDate: "2026-02-01" });
  assert.strictEqual(result.rangeEnd, "2026-02-01");
  assert.strictEqual(result.dataDate, "2026-02-01");
});

check("a data_date is passed through unchanged even with no dated activities", () => {
  const a = baseActivity({});
  const result = layoutEngine.computeLayout([a], { dataDate: "2026-02-01" });
  assert.strictEqual(result.dataDate, "2026-02-01");
  assert.strictEqual(result.rangeStart, null);
});

// ---------------------------------------------------------------------------
// diffDays / addDays helpers
// ---------------------------------------------------------------------------
check("diffDays computes calendar-day distance regardless of time-of-day drift", () => {
  assert.strictEqual(layoutEngine.diffDays("2026-01-01", "2026-01-10"), 9);
  assert.strictEqual(layoutEngine.diffDays("2026-01-10", "2026-01-01"), -9);
});

check("addDays round-trips with diffDays", () => {
  assert.strictEqual(layoutEngine.addDays("2026-01-01", 30), "2026-01-31");
  assert.strictEqual(layoutEngine.diffDays("2026-01-01", layoutEngine.addDays("2026-01-01", 30)), 30);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
