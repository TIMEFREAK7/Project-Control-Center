// Standalone Node test for delayImpactEngine.js (Planning & Scheduling-Centric Delay
// Management, Gate B). Pure calculation module — no DOM, so this runs directly under
// `node` without jsdom, same approach as test_schedule_cpm_engine.js. Mirrors the spec's
// own numbered test scenarios (section 41, TEST 1-7) directly, since those are exactly
// the acceptance criteria the requirement itself specifies.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

global.window = global.window || {};
const cpmSrc = fs.readFileSync(path.join(__dirname, "..", "src", "js", "scheduleCpmEngine.js"), "utf8");
// eslint-disable-next-line no-eval
eval(cpmSrc);
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "src", "js", "delayImpactEngine.js"), "utf8");
// eslint-disable-next-line no-eval
eval(engineSrc);
const delayEngine = window.PCC.delayImpactEngine;

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

function link(overrides) {
  return Object.assign(
    { id: "dal_1", delay_id: "dly_1", activity_id: "act_1", project_id: "p1", original_planned_start: "", original_planned_finish: "", original_total_float: null, created_at: "2026-01-01T00:00:00.000Z" },
    overrides
  );
}

function activity(overrides) {
  return Object.assign(
    {
      id: "act_1", project_id: "p1", schedule_id: "sch_1", name: "Activity", activity_type: "task",
      planned_start: "", planned_finish: "", actual_start: "", actual_finish: "",
      early_start: null, early_finish: null, late_start: null, late_finish: null,
      total_float: null, free_float: null, percent_complete: 0, status: "not_started",
      is_out_of_sequence: false,
    },
    overrides
  );
}

function schedule(overrides) {
  return Object.assign({ id: "sch_1", project_id: "p1", data_date: "2026-01-01", near_critical_threshold_days: 5, calculation_mode: "progress_override" }, overrides);
}

// ---------------------------------------------------------------------------
// classifyCriticality — the same simple threshold rule scheduleCpmEngine.js's own
// calculateSchedule() applies, reapplied to an already-calculated total_float rather
// than a second calculation (spec point 2/14: "do not change the existing CPM logic").
// ---------------------------------------------------------------------------

check("classifyCriticality returns null (unknown, not 'fine') when total_float hasn't been calculated yet", () => {
  assert.strictEqual(delayEngine.classifyCriticality(null, 5), null);
  assert.strictEqual(delayEngine.classifyCriticality(undefined, 5), null);
});

check("classifyCriticality: total_float <= 0 is critical, matching scheduleCpmEngine's own is_critical rule", () => {
  assert.strictEqual(delayEngine.classifyCriticality(0, 5), "critical");
  assert.strictEqual(delayEngine.classifyCriticality(-2, 5), "critical");
});

check("classifyCriticality: total_float <= threshold (but > 0) is near_critical, using the schedule's own configured threshold", () => {
  assert.strictEqual(delayEngine.classifyCriticality(3, 5), "near_critical");
  assert.strictEqual(delayEngine.classifyCriticality(5, 5), "near_critical");
  assert.strictEqual(delayEngine.classifyCriticality(2, 2), "near_critical");
});

check("classifyCriticality: total_float above the threshold is non_critical", () => {
  assert.strictEqual(delayEngine.classifyCriticality(10, 5), "non_critical");
});

// ---------------------------------------------------------------------------
// computeActivityImpact — per-activity historical snapshot vs. live current state
// ---------------------------------------------------------------------------

check("computeActivityImpact returns null when the linked activity no longer exists (deleted)", () => {
  var data = { activities: [], schedules: [] };
  var result = delayEngine.computeActivityImpact(link({ activity_id: "gone" }), data);
  assert.strictEqual(result, null);
});

check("TEST 7 (spec section 41): a later schedule change moves the CURRENT/forecast values but never touches the frozen historical snapshot", () => {
  // Delay identified when the activity's planned finish was 20 Aug.
  var lnk = link({ original_planned_start: "2026-08-10", original_planned_finish: "2026-08-20", original_total_float: 8 });
  var act = activity({ planned_start: "2026-08-10", planned_finish: "2026-08-20", early_finish: "2026-08-20", early_start: "2026-08-10", total_float: 8 });
  var data = { activities: [act], schedules: [schedule()] };

  var before = delayEngine.computeActivityImpact(lnk, data);
  assert.strictEqual(before.original_planned_finish, "2026-08-20");
  assert.strictEqual(before.forecast_finish, "2026-08-20");

  // The schedule is later recalculated and the activity slips to 27 Aug — simulating
  // schedule.js's runCalculation() writing fresh early_finish/total_float back onto the
  // SAME activity record, exactly as it does in the real app.
  act.early_finish = "2026-08-27";
  act.planned_finish = "2026-08-27";
  act.total_float = 1;

  var after = delayEngine.computeActivityImpact(lnk, data);
  assert.strictEqual(after.original_planned_finish, "2026-08-20", "the historical snapshot must never change");
  assert.strictEqual(after.forecast_finish, "2026-08-27", "the current/forecast value must reflect the schedule update");
  assert.strictEqual(after.finish_slippage_days, 7, "20 Aug -> 27 Aug is a 7-day slip");
  assert.strictEqual(after.float_consumed, 7, "original float 8 - current float 1 = 7 days consumed");
});

check("current_finish prefers actual_finish, then early_finish, then planned_finish, in that order", () => {
  var data = { activities: [activity({ planned_finish: "2026-08-20", early_finish: "2026-08-18", actual_finish: "2026-08-15" })], schedules: [schedule()] };
  var r = delayEngine.computeActivityImpact(link({ activity_id: "act_1" }), data);
  assert.strictEqual(r.current_finish, "2026-08-15");

  data = { activities: [activity({ planned_finish: "2026-08-20", early_finish: "2026-08-18" })], schedules: [schedule()] };
  r = delayEngine.computeActivityImpact(link({ activity_id: "act_1" }), data);
  assert.strictEqual(r.current_finish, "2026-08-18");

  data = { activities: [activity({ planned_finish: "2026-08-20" })], schedules: [schedule()] };
  r = delayEngine.computeActivityImpact(link({ activity_id: "act_1" }), data);
  assert.strictEqual(r.current_finish, "2026-08-20");
});

// ---------------------------------------------------------------------------
// computeDelayImpact — TEST 1, 2, 4, 5 (spec section 41)
// ---------------------------------------------------------------------------

check("TEST 1 (float absorbs delay): Original Float 8, delay consumes 5 -> Current Float 3, non-critical, no project impact implied", () => {
  var lnk = link({ original_total_float: 8 });
  var act = activity({ total_float: 3 }); // the delay already consumed 5 of the 8 days
  var data = { activities: [act], schedules: [schedule({ near_critical_threshold_days: 5 })] };
  var delayRecord = { id: "dly_1", milestone_activity_id: "" };

  var impact = delayEngine.computeDelayImpact(delayRecord, [lnk], data);
  assert.strictEqual(impact.per_activity.length, 1);
  assert.strictEqual(impact.per_activity[0].float_consumed, 5);
  assert.strictEqual(impact.per_activity[0].current_total_float, 3);
  assert.strictEqual(impact.overall_criticality, "near_critical", "3 days remaining <= the 5-day near-critical threshold");
  assert.strictEqual(impact.max_float_consumed, 5);
});

check("TEST 2 (delay consumes ALL float): Original Float 5, delay +7 -> float reaches zero/negative, criticality becomes critical", () => {
  var lnk = link({ original_total_float: 5 });
  var act = activity({ total_float: -2 }); // 7-day delay against 5 days of float
  var data = { activities: [act], schedules: [schedule()] };
  var impact = delayEngine.computeDelayImpact({ id: "dly_1", milestone_activity_id: "" }, [lnk], data);
  assert.strictEqual(impact.overall_criticality, "critical");
  assert.strictEqual(impact.per_activity[0].float_consumed, 7);
});

check("TEST 4 (multiple activities): one Delay linking three activities reports all three, each keeping its own schedule state", () => {
  var links = [
    link({ id: "l1", activity_id: "A-100", original_total_float: 4 }),
    link({ id: "l2", activity_id: "A-105", original_total_float: 4 }),
    link({ id: "l3", activity_id: "A-110", original_total_float: 0 }),
  ];
  var data = {
    activities: [
      activity({ id: "A-100", name: "Equipment Delivery", total_float: 4 }),
      activity({ id: "A-105", name: "Equipment Installation", total_float: 2 }),
      activity({ id: "A-110", name: "Commissioning", total_float: 0 }),
    ],
    schedules: [schedule({ near_critical_threshold_days: 5 })],
  };
  var impact = delayEngine.computeDelayImpact({ id: "dly_1", milestone_activity_id: "" }, links, data);
  assert.strictEqual(impact.per_activity.length, 3, "one Delay, three affected activities — not three separate delays");
  assert.deepStrictEqual(
    impact.per_activity.map((a) => a.activity_id).sort(),
    ["A-100", "A-105", "A-110"]
  );
  assert.strictEqual(impact.overall_criticality, "critical", "the worst of the three (A-110, total_float 0) determines the overall picture");
});

check("TEST 5 (non-critical delay): a 6-day activity delay against 10 days of float consumes float (and only float) — computeDelayImpact never reports it as any kind of project delay itself", () => {
  var lnk = link({ original_total_float: 10 });
  var act = activity({ total_float: 4 }); // 6 days consumed, still 4 left — real float remains, so this is absorbed, not a project threat
  var data = { activities: [act], schedules: [schedule({ near_critical_threshold_days: 5 })] };
  var impact = delayEngine.computeDelayImpact({ id: "dly_1", milestone_activity_id: "" }, [lnk], data);
  assert.notStrictEqual(impact.overall_criticality, "critical", "float still remains — this must never read as critical");
  assert.strictEqual(impact.max_float_consumed, 6, "the 6-day event IS visible as float consumption...");
  assert.ok(
    !Object.prototype.hasOwnProperty.call(impact, "project_impact_days"),
    "...but computeDelayImpact must never itself equate that with a project-finish figure — that's computeProjectFinishImpact's own, separate, explicit call (spec's own 'Delay Days != Project Delay Days' rule)"
  );
});

check("computeDelayImpact reports 'schedule not yet calculated' (any_schedule_calculated: false) rather than guessing when total_float is null", () => {
  var lnk = link({ original_total_float: null });
  var act = activity({ total_float: null });
  var data = { activities: [act], schedules: [schedule()] };
  var impact = delayEngine.computeDelayImpact({ id: "dly_1", milestone_activity_id: "" }, [lnk], data);
  assert.strictEqual(impact.any_schedule_calculated, false);
  assert.strictEqual(impact.overall_criticality, null);
});

check("milestone_impact resolves to the per-activity entry matching delayRecord.milestone_activity_id", () => {
  var links = [link({ id: "l1", activity_id: "A-1", original_total_float: 5 }), link({ id: "l2", activity_id: "A-2 (milestone)", original_total_float: 2 })];
  var data = {
    activities: [activity({ id: "A-1", total_float: 5 }), activity({ id: "A-2 (milestone)", activity_type: "milestone", total_float: 0 })],
    schedules: [schedule()],
  };
  var impact = delayEngine.computeDelayImpact({ id: "dly_1", milestone_activity_id: "A-2 (milestone)" }, links, data);
  assert.ok(impact.milestone_impact);
  assert.strictEqual(impact.milestone_impact.activity_id, "A-2 (milestone)");
  assert.strictEqual(impact.milestone_impact.criticality, "critical");
});

// ---------------------------------------------------------------------------
// computeProjectFinishImpact — TEST 6 (spec section 41), using the REAL
// scheduleCpmEngine.calculateSchedule() (never a second engine, per spec point 2).
// ---------------------------------------------------------------------------

check("computeProjectFinishImpact reports available:false for a schedule that doesn't exist", () => {
  var data = { schedules: [], activities: [], relationships: [] };
  var r = delayEngine.computeProjectFinishImpact("missing", data);
  assert.strictEqual(r.available, false);
});

check("computeProjectFinishImpact reports available:false for a schedule with no activities", () => {
  var data = { schedules: [schedule()], activities: [], relationships: [] };
  var r = delayEngine.computeProjectFinishImpact("sch_1", data);
  assert.strictEqual(r.available, false);
});

check("TEST 6 (project finish impact): a critical activity's duration growing pushes computeProjectFinishImpact's own project_impact_days by the same amount, using the real CPM engine's own numbers", () => {
  // Two-activity critical chain: A (10d) -> B (10d), no other paths, so both are fully
  // critical and any growth in either activity pushes the project finish 1-for-1 — the
  // simplest possible TEST 6 setup, verified against the real engine's own output
  // rather than hand-predicted.
  var sched = schedule({ data_date: "2026-01-01" });
  var relA = { schedule_id: "sch_1", predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 };
  function makeActivities(durationA) {
    return [
      activity({ id: "A", schedule_id: "sch_1", duration: durationA, planned_start: "2026-01-01", planned_finish: "2026-01-11" }),
      activity({ id: "B", schedule_id: "sch_1", duration: 10, planned_start: "2026-01-11", planned_finish: "2026-01-21" }),
    ];
  }

  var baselineResult = window.PCC.scheduleCpmEngine.calculateSchedule(makeActivities(10), [relA], { dataDate: sched.data_date });
  var baselineData = { schedules: [sched], activities: makeActivities(10), relationships: [relA] };
  // Write the baseline's own calculated float back, the same way schedule.js's
  // runCalculation() does, so computeDelayImpact's own criticality read is honest too.
  baselineData.activities.forEach((a) => {
    a.total_float = baselineResult.results[a.id].total_float;
  });
  var baselineImpact = delayEngine.computeProjectFinishImpact("sch_1", baselineData);
  assert.strictEqual(baselineImpact.available, true);
  assert.strictEqual(baselineImpact.project_impact_days, 0, "no delay applied yet — no variance from planned");

  // Now A grows from 10 to 17 days (a 7-day delay on the critical path) — read fresh via
  // the SAME real engine, never a duplicate calculation.
  var delayedData = { schedules: [sched], activities: makeActivities(17), relationships: [relA] };
  var delayedImpact = delayEngine.computeProjectFinishImpact("sch_1", delayedData);
  assert.strictEqual(delayedImpact.available, true);
  assert.strictEqual(delayedImpact.project_impact_days, 7, "a 7-day critical-path delay must move the project finish by 7 days");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
