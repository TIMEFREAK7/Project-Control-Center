// Standalone Node test for resourceLevelingEngine.js — pure calculation, no DOM, same
// approach test_schedule_gantt_layout.js and test_cost_evm_engine.js already use for
// the other pure engines in this app.
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
const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "resourceLevelingEngine.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);
const engine = global.window.PCC.resourceLevelingEngine;

function activity(overrides) {
  return Object.assign({ id: "a1", project_id: "p1", activity_type: "task", planned_start: "", planned_finish: "", early_start: null, early_finish: null }, overrides);
}

// ---------------------------------------------------------------------------
// computeResourceUsageTimeline
// ---------------------------------------------------------------------------

check("allocates the resource's quantity across every day of the activity's span (start inclusive, finish exclusive)", () => {
  var resource = { id: "r1" };
  var act = activity({ id: "a1", planned_start: "2026-01-01", planned_finish: "2026-01-06" }); // 5 days: Jan 1-5
  var assignment = { id: "asg1", resource_id: "r1", activity_id: "a1", quantity: 3 };
  var timeline = engine.computeResourceUsageTimeline(resource, [assignment], [act]);
  assert.strictEqual(timeline.days.length, 5);
  assert.strictEqual(timeline.rangeStart, "2026-01-01");
  assert.strictEqual(timeline.rangeEnd, "2026-01-05");
  timeline.days.forEach((d) => assert.strictEqual(d.allocated, 3));
});

check("prefers calculated (early_*) dates over planned when both present", () => {
  var resource = { id: "r1" };
  var act = activity({ planned_start: "2026-01-01", planned_finish: "2026-01-10", early_start: "2026-02-01", early_finish: "2026-02-04" });
  var assignment = { id: "asg1", resource_id: "r1", activity_id: "a1", quantity: 1 };
  var timeline = engine.computeResourceUsageTimeline(resource, [assignment], [act]);
  assert.strictEqual(timeline.rangeStart, "2026-02-01");
  assert.strictEqual(timeline.rangeEnd, "2026-02-03");
});

check("sums quantity across two overlapping assignments to the same resource", () => {
  var resource = { id: "r1" };
  var a1 = activity({ id: "a1", planned_start: "2026-01-01", planned_finish: "2026-01-06" });
  var a2 = activity({ id: "a2", planned_start: "2026-01-03", planned_finish: "2026-01-08" });
  var assignments = [
    { id: "asg1", resource_id: "r1", activity_id: "a1", quantity: 2 },
    { id: "asg2", resource_id: "r1", activity_id: "a2", quantity: 3 },
  ];
  var timeline = engine.computeResourceUsageTimeline(resource, assignments, [a1, a2]);
  var byDate = {};
  timeline.days.forEach((d) => { byDate[d.date] = d.allocated; });
  assert.strictEqual(byDate["2026-01-01"], 2, "only a1 active");
  assert.strictEqual(byDate["2026-01-03"], 5, "both a1 and a2 active");
  assert.strictEqual(byDate["2026-01-07"], 3, "only a2 active");
});

check("cross-project: sums allocation for the same resource across two different projects' activities", () => {
  var resource = { id: "r1" };
  var a1 = activity({ id: "a1", project_id: "proj_A", planned_start: "2026-01-01", planned_finish: "2026-01-05" });
  var a2 = activity({ id: "a2", project_id: "proj_B", planned_start: "2026-01-02", planned_finish: "2026-01-06" });
  var assignments = [
    { id: "asg1", resource_id: "r1", activity_id: "a1", quantity: 2 },
    { id: "asg2", resource_id: "r1", activity_id: "a2", quantity: 2 },
  ];
  var timeline = engine.computeResourceUsageTimeline(resource, assignments, [a1, a2]);
  var day2 = timeline.days.find((d) => d.date === "2026-01-02");
  assert.strictEqual(day2.allocated, 4, "the same crane double-booked across two projects should sum, not silently pick one");
  assert.strictEqual(day2.contributors.length, 2);
  assert.ok(day2.contributors.some((c) => c.projectId === "proj_A"));
  assert.ok(day2.contributors.some((c) => c.projectId === "proj_B"));
});

check("milestones are skipped (a point in time doesn't consume a resource over a span), and counted", () => {
  var resource = { id: "r1" };
  var milestone = activity({ id: "a1", activity_type: "milestone", planned_start: "2026-01-01" });
  var assignment = { id: "asg1", resource_id: "r1", activity_id: "a1", quantity: 1 };
  var timeline = engine.computeResourceUsageTimeline(resource, [assignment], [milestone]);
  assert.strictEqual(timeline.days.length, 0);
  assert.strictEqual(timeline.skippedCount, 1);
});

check("an activity with no usable dates is skipped and counted, not guessed", () => {
  var resource = { id: "r1" };
  var undated = activity({ id: "a1" });
  var assignment = { id: "asg1", resource_id: "r1", activity_id: "a1", quantity: 1 };
  var timeline = engine.computeResourceUsageTimeline(resource, [assignment], [undated]);
  assert.strictEqual(timeline.skippedCount, 1);
});

check("an assignment with zero/null/missing quantity is skipped and counted", () => {
  var resource = { id: "r1" };
  var act = activity({ id: "a1", planned_start: "2026-01-01", planned_finish: "2026-01-03" });
  var assignments = [
    { id: "asg1", resource_id: "r1", activity_id: "a1", quantity: 0 },
    { id: "asg2", resource_id: "r1", activity_id: "a1", quantity: null },
  ];
  var timeline = engine.computeResourceUsageTimeline(resource, assignments, [act]);
  assert.strictEqual(timeline.skippedCount, 2);
  assert.strictEqual(timeline.days.length, 0);
});

check("an assignment pointing at a deleted/missing activity is skipped, not a crash", () => {
  var resource = { id: "r1" };
  var assignment = { id: "asg1", resource_id: "r1", activity_id: "does_not_exist", quantity: 2 };
  var timeline = engine.computeResourceUsageTimeline(resource, [assignment], []);
  assert.strictEqual(timeline.skippedCount, 1);
  assert.deepStrictEqual(timeline.days, []);
});

check("assignments belonging to a different resource are ignored entirely", () => {
  var resource = { id: "r1" };
  var act = activity({ id: "a1", planned_start: "2026-01-01", planned_finish: "2026-01-03" });
  var assignment = { id: "asg1", resource_id: "r2", activity_id: "a1", quantity: 5 };
  var timeline = engine.computeResourceUsageTimeline(resource, [assignment], [act]);
  assert.strictEqual(timeline.days.length, 0);
  assert.strictEqual(timeline.skippedCount, 0, "not this resource's assignment at all, so not even 'skipped'");
});

// ---------------------------------------------------------------------------
// detectOverAllocations
// ---------------------------------------------------------------------------

check("max_availability unset (null) means 'not computable' — available: false, not zero capacity", () => {
  var resource = { id: "r1", max_availability: null };
  var timeline = { days: [{ date: "2026-01-01", allocated: 100, contributors: [] }] };
  var result = engine.detectOverAllocations(resource, timeline);
  assert.strictEqual(result.available, false);
  assert.deepStrictEqual(result.overAllocatedDays, []);
});

check("flags exactly the days where allocated exceeds max_availability", () => {
  var resource = { id: "r1", max_availability: 3 };
  var timeline = {
    days: [
      { date: "2026-01-01", allocated: 2, contributors: [] },
      { date: "2026-01-02", allocated: 3, contributors: [] }, // at capacity, not over
      { date: "2026-01-03", allocated: 5, contributors: [{ activityName: "X" }] },
    ],
  };
  var result = engine.detectOverAllocations(resource, timeline);
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.count, 1);
  assert.strictEqual(result.overAllocatedDays[0].date, "2026-01-03");
  assert.strictEqual(result.overAllocatedDays[0].overBy, 2);
  assert.strictEqual(result.maxOverBy, 2);
  assert.strictEqual(result.firstDate, "2026-01-03");
  assert.strictEqual(result.lastDate, "2026-01-03");
});

check("no over-allocated days produces count 0 and null maxOverBy/first/lastDate, not zeros", () => {
  var resource = { id: "r1", max_availability: 10 };
  var timeline = { days: [{ date: "2026-01-01", allocated: 2, contributors: [] }] };
  var result = engine.detectOverAllocations(resource, timeline);
  assert.strictEqual(result.count, 0);
  assert.strictEqual(result.maxOverBy, null);
  assert.strictEqual(result.firstDate, null);
});

// ---------------------------------------------------------------------------
// portfolioOverAllocationSummary
// ---------------------------------------------------------------------------

check("summarizes over-allocation across all resources, excluding resources with no max_availability set and resources with no conflicts", () => {
  var resources = [
    { id: "r1", name: "Crane", max_availability: 1 },
    { id: "r2", name: "Electricians", max_availability: null },
    { id: "r3", name: "Excavator", max_availability: 5 },
  ];
  var activities = [
    activity({ id: "a1", planned_start: "2026-01-01", planned_finish: "2026-01-05" }),
    activity({ id: "a2", planned_start: "2026-01-02", planned_finish: "2026-01-04" }),
  ];
  var assignments = [
    { id: "asg1", resource_id: "r1", activity_id: "a1", quantity: 1 },
    { id: "asg2", resource_id: "r1", activity_id: "a2", quantity: 1 }, // r1 double-booked
    { id: "asg3", resource_id: "r2", activity_id: "a1", quantity: 999 }, // unset availability, excluded
    { id: "asg4", resource_id: "r3", activity_id: "a1", quantity: 1 }, // well under capacity
  ];
  var summary = engine.portfolioOverAllocationSummary(resources, assignments, activities);
  assert.strictEqual(summary.length, 1);
  assert.strictEqual(summary[0].resourceId, "r1");
  assert.strictEqual(summary[0].resourceName, "Crane");
  assert.ok(summary[0].overAllocatedDayCount > 0);
});

// ---------------------------------------------------------------------------
// bucketTimeline
// ---------------------------------------------------------------------------

check("buckets a day timeline by the given size, taking the MAX (not average) allocated per bucket", () => {
  var days = [
    { date: "2026-01-01", allocated: 1 },
    { date: "2026-01-02", allocated: 9 },
    { date: "2026-01-03", allocated: 2 },
    { date: "2026-01-04", allocated: 1 },
  ];
  var buckets = engine.bucketTimeline(days, 2);
  assert.strictEqual(buckets.length, 2);
  assert.strictEqual(buckets[0].allocatedMax, 9, "a short spike must survive bucketing, not get averaged away");
  assert.strictEqual(buckets[1].allocatedMax, 2);
});

check("bucketTimeline on an empty day list returns an empty array without throwing", () => {
  assert.deepStrictEqual(engine.bucketTimeline([], 7), []);
});

// ---------------------------------------------------------------------------
// levelResourceWithinFloat (PCC Architecture Upgrade Phase 7, Advanced Scheduling:
// Resource-Constrained Leveling — the last of the three deferred Phase 7 items)
// ---------------------------------------------------------------------------

function calculatedActivity(overrides) {
  // A "Calculate Schedule" has already run: early_start/early_finish/late_start/
  // total_float are all real, persisted fields, matching schedule.js's own
  // runCalculation() write-back shape.
  return activity(Object.assign({ total_float: 0 }, overrides));
}

check("leveling: a single-resource conflict is resolved by pushing the activity with MORE float later, leaving the more-critical one untouched", () => {
  var resource = { id: "r1", max_availability: 1 };
  var critical = calculatedActivity({ id: "A", early_start: "2026-01-01", early_finish: "2026-01-03", late_start: "2026-01-01", total_float: 0 });
  var slack = calculatedActivity({ id: "B", early_start: "2026-01-01", early_finish: "2026-01-03", late_start: "2026-01-06", total_float: 5 });
  var assignments = [
    { id: "asg1", resource_id: "r1", activity_id: "A", quantity: 1 },
    { id: "asg2", resource_id: "r1", activity_id: "B", quantity: 1 },
  ];
  var result = engine.levelResourceWithinFloat(resource, assignments, [critical, slack]);
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.leveled, true);
  assert.strictEqual(result.proposals.length, 1);
  assert.strictEqual(result.proposals[0].activityId, "B", "the activity with float, not the critical one, must be the one that moves");
  assert.strictEqual(result.proposals[0].originalStart, "2026-01-01");
  assert.strictEqual(result.proposals[0].proposedStart, "2026-01-03", "must be pushed until the resource is actually free");
  assert.strictEqual(result.proposals[0].proposedFinish, "2026-01-05");
  assert.strictEqual(result.proposals[0].shiftedByDays, 2);
  assert.deepStrictEqual(result.unresolved, [], "the shift must fully resolve the conflict, nothing left over");
});

check("leveling: a conflict that can't fit within either activity's float is reported as unresolved, never force-fit or silently extended", () => {
  var resource = { id: "r1", max_availability: 1 };
  var a = calculatedActivity({ id: "A", early_start: "2026-01-01", early_finish: "2026-01-04", late_start: "2026-01-01", total_float: 0 });
  var b = calculatedActivity({ id: "B", early_start: "2026-01-01", early_finish: "2026-01-04", late_start: "2026-01-02", total_float: 1 });
  var assignments = [
    { id: "asg1", resource_id: "r1", activity_id: "A", quantity: 1 },
    { id: "asg2", resource_id: "r1", activity_id: "B", quantity: 1 },
  ];
  var result = engine.levelResourceWithinFloat(resource, assignments, [a, b]);
  assert.strictEqual(result.leveled, false, "B never actually found a fitting slot, so nothing should be reported as moved");
  assert.strictEqual(result.proposals.length, 0);
  assert.ok(result.unresolved.length > 0, "the real, unresolved conflict must still be surfaced, not hidden");
  assert.ok(result.unresolved.every((d) => d.overBy === 1));
});

check("leveling: an activity with no total_float/early_start (never CPM-calculated) is excluded from leveling and reported, not guessed at", () => {
  var resource = { id: "r1", max_availability: 5 };
  var calculated = calculatedActivity({ id: "A", early_start: "2026-01-01", early_finish: "2026-01-03", late_start: "2026-01-01", total_float: 0 });
  var neverCalculated = activity({ id: "B", planned_start: "2026-01-01", planned_finish: "2026-01-03", early_start: null, early_finish: null, total_float: null });
  var assignments = [
    { id: "asg1", resource_id: "r1", activity_id: "A", quantity: 3 },
    { id: "asg2", resource_id: "r1", activity_id: "B", quantity: 3 }, // 6 > 5 capacity, but B can't be moved
  ];
  var result = engine.levelResourceWithinFloat(resource, assignments, [calculated, neverCalculated]);
  assert.deepStrictEqual(result.excludedActivityIds, ["B"]);
  assert.strictEqual(result.proposals.length, 0, "an uncalculated activity can never be the one that moves");
  assert.ok(result.unresolved.length > 0, "its fixed demand still correctly contributes to the (unresolvable, since B can't move) conflict");
});

check("leveling: a resource with max_availability unset is 'not computable' — no leveling attempted, matching detectOverAllocations' own convention", () => {
  var resource = { id: "r1", max_availability: null };
  var a = calculatedActivity({ id: "A", early_start: "2026-01-01", early_finish: "2026-01-03", late_start: "2026-01-01" });
  var result = engine.levelResourceWithinFloat(resource, [{ id: "asg1", resource_id: "r1", activity_id: "A", quantity: 999 }], [a]);
  assert.strictEqual(result.available, false);
  assert.strictEqual(result.leveled, false);
  assert.deepStrictEqual(result.proposals, []);
});

check("leveling: no conflict at all means nothing is proposed", () => {
  var resource = { id: "r1", max_availability: 5 };
  var a = calculatedActivity({ id: "A", early_start: "2026-01-01", early_finish: "2026-01-03", late_start: "2026-01-01", total_float: 0 });
  var b = calculatedActivity({ id: "B", early_start: "2026-01-03", early_finish: "2026-01-05", late_start: "2026-01-10", total_float: 5 });
  var assignments = [
    { id: "asg1", resource_id: "r1", activity_id: "A", quantity: 2 },
    { id: "asg2", resource_id: "r1", activity_id: "B", quantity: 2 },
  ];
  var result = engine.levelResourceWithinFloat(resource, assignments, [a, b]);
  assert.strictEqual(result.leveled, false);
  assert.deepStrictEqual(result.proposals, []);
  assert.deepStrictEqual(result.unresolved, []);
});

check("leveling: a resource_unavailability window is respected — leveling pushes an activity past a leave day, not just past other activities", () => {
  var resource = { id: "r1", max_availability: 1 };
  // A alone would have plenty of room (capacity 1, A needs 1, no other activity
  // competing) — but a leave day right in its natural slot forces it to shift anyway.
  var a = calculatedActivity({ id: "A", early_start: "2026-01-01", early_finish: "2026-01-02", late_start: "2026-01-05", total_float: 4 });
  var unavailabilities = [{ resource_id: "r1", start_date: "2026-01-01", end_date: "2026-01-01", quantity: 1 }];
  var result = engine.levelResourceWithinFloat(resource, [{ id: "asg1", resource_id: "r1", activity_id: "A", quantity: 1 }], [a], unavailabilities);
  assert.strictEqual(result.leveled, true);
  assert.strictEqual(result.proposals[0].proposedStart, "2026-01-02", "must skip the leave day even though no OTHER activity was competing for it");
  assert.deepStrictEqual(result.unresolved, []);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
