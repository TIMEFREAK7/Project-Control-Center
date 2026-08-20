// Standalone Node test for scheduleCpmEngine.js. Pure calculation module, no DOM, so this
// runs directly under `node` without jsdom — same approach as test_schedule_baseline_engine.js.
// Focused on Gate 21 (PCC Evolution Roadmap, Tier F: Status-Date Reforecasting): out-of-
// sequence (OOS) detection and the two calculation modes (progress_override, retained_logic).
// Everything predating Gate 21 (plain CPM, status-date anchoring, float, critical path) is
// already exercised indirectly through the e2e suites (test_schedule_gantt_e2e.js,
// test_executive_center_e2e.js, etc.) and isn't re-tested here.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

global.window = global.window || {};
const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "scheduleCpmEngine.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);
const engine = window.PCC.scheduleCpmEngine;

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

// ---------------------------------------------------------------------------
// Out-of-sequence detection
// ---------------------------------------------------------------------------

check("an in-progress successor that started before its predecessor's forecast finish is flagged out-of-sequence", () => {
  var activities = [
    { id: "A", duration: 10 },
    { id: "B", duration: 5, actual_start: "2026-01-03", remaining_duration: 5 },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-06" });
  assert.strictEqual(r.results.B.is_out_of_sequence, true);
  assert.deepStrictEqual(r.outOfSequenceActivityIds, ["B"]);
  assert.ok(
    r.warnings.some((w) => w.activityId === "B" && /[Oo]ut-of-sequence/.test(w.message)),
    "an OOS warning must be pushed"
  );
});

check("a successor that started normally, after its predecessor's forecast finish, is NOT flagged", () => {
  var activities = [
    { id: "A", duration: 5, actual_start: "2026-01-01", actual_finish: "2026-01-05" },
    { id: "B", duration: 5, actual_start: "2026-01-10", remaining_duration: 3 },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-12" });
  assert.strictEqual(r.results.B.is_out_of_sequence, false);
  assert.deepStrictEqual(r.outOfSequenceActivityIds, []);
});

check("an activity with no predecessors is never flagged out-of-sequence, regardless of how early its actual_start is relative to dataDate", () => {
  var activities = [{ id: "A", duration: 5, actual_start: "2026-01-01", remaining_duration: 2 }];
  var r = engine.calculateSchedule(activities, [], { dataDate: "2026-06-01" });
  assert.strictEqual(r.results.A.is_out_of_sequence, false, "starting well before dataDate is normal, not a sequencing problem");
});

check("a not-started activity is never flagged out-of-sequence (it has no actual anchor to be out of sequence against)", () => {
  var activities = [
    { id: "A", duration: 10 },
    { id: "B", duration: 5 },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-01" });
  assert.strictEqual(r.results.B.is_out_of_sequence, false);
});

check("options.ignoreActuals suppresses out-of-sequence detection entirely (pure baseline calc, no actuals consulted)", () => {
  var activities = [
    { id: "A", duration: 10 },
    { id: "B", duration: 5, actual_start: "2026-01-03", remaining_duration: 5 },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-06", ignoreActuals: true });
  assert.strictEqual(r.results.B.is_out_of_sequence, false);
});

// ---------------------------------------------------------------------------
// Calculation modes: progress_override (default) vs retained_logic
// ---------------------------------------------------------------------------

check("progress_override (default, no option passed): an OOS in-progress activity's forecast ignores predecessor logic, exactly as before this gate", () => {
  var activities = [
    { id: "A", duration: 10 },
    { id: "B", duration: 5, actual_start: "2026-01-03", remaining_duration: 5 },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-06" });
  // A: ES=dataDay(2026-01-06), EF = +10 = 2026-01-16
  assert.strictEqual(r.results.A.early_finish, "2026-01-16");
  // B: fixedES = max(dataDay, actual_start) = 2026-01-06 (unaffected by A's logic)
  assert.strictEqual(r.results.B.early_start, "2026-01-06");
  assert.strictEqual(r.results.B.early_finish, "2026-01-11");
});

check("retained_logic: the same OOS in-progress activity's forecast is instead pushed to respect the predecessor tie", () => {
  var activities = [
    { id: "A", duration: 10 },
    { id: "B", duration: 5, actual_start: "2026-01-03", remaining_duration: 5 },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-06", calculationMode: "retained_logic" });
  // A unaffected: still ES=2026-01-06, EF=2026-01-16
  assert.strictEqual(r.results.A.early_finish, "2026-01-16");
  // B pushed to start when A's logic actually permits (A's EF), not its own actual anchor
  assert.strictEqual(r.results.B.early_start, "2026-01-16");
  assert.strictEqual(r.results.B.early_finish, "2026-01-21");
  assert.strictEqual(r.results.B.is_out_of_sequence, true, "still flagged even though the mode changed how it forecasts");
});

check("retained_logic never moves a COMPLETED out-of-sequence activity's own dates — only in-progress forecasts are affected", () => {
  var activities = [
    { id: "A", duration: 10 },
    { id: "B", duration: 5, actual_start: "2026-01-01", actual_finish: "2026-01-05" },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var rOverride = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-06" });
  var rRetained = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-06", calculationMode: "retained_logic" });
  assert.strictEqual(rOverride.results.B.early_start, "2026-01-01");
  assert.strictEqual(rOverride.results.B.early_finish, "2026-01-05");
  assert.strictEqual(rRetained.results.B.early_start, "2026-01-01", "completed work is history, not subject to calculation mode");
  assert.strictEqual(rRetained.results.B.early_finish, "2026-01-05");
  assert.strictEqual(rOverride.results.B.is_out_of_sequence, true);
  assert.strictEqual(rRetained.results.B.is_out_of_sequence, true, "OOS flag is a data-quality signal, reported the same regardless of mode");
});

check("retained_logic with no out-of-sequence activities produces identical results to progress_override (the mode only matters when OOS actually occurs)", () => {
  var activities = [
    { id: "A", duration: 5, actual_start: "2026-01-01", actual_finish: "2026-01-05" },
    { id: "B", duration: 5, actual_start: "2026-01-10", remaining_duration: 3 },
    { id: "C", duration: 4 },
  ];
  var rels = [
    { predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 },
    { predecessor_id: "B", successor_id: "C", type: "FS", lag: 0 },
  ];
  var rOverride = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-12" });
  var rRetained = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-12", calculationMode: "retained_logic" });
  assert.deepStrictEqual(rOverride.results, rRetained.results);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
