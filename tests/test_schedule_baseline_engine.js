// Standalone Node test for scheduleBaselineEngine.js. Pure calculation module, no DOM,
// so this runs directly under `node` without jsdom.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

global.window = global.window || {};
const src = fs.readFileSync(
  path.join(__dirname, "..", "src", "js", "scheduleBaselineEngine.js"),
  "utf8"
);
// eslint-disable-next-line no-eval
eval(src);
const engine = window.PCC.scheduleBaselineEngine;

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
// buildSnapshot: trims to comparison-relevant fields only
// ---------------------------------------------------------------------------
check("buildSnapshot keeps only comparison-relevant activity fields", () => {
  const schedule = { id: "sch_1", name: "Rev 1", revision_number: 1, data_date: "2026-01-01" };
  const wbsItems = [{ id: "wbs_1", code: "1.0", name: "Foundations", parent_wbs_id: null, level: 0, schedule_id: "sch_1" }];
  const activities = [
    {
      id: "act_1",
      external_id: "SRC-1",
      name: "Excavate",
      activity_type: "task",
      wbs_id: "wbs_1",
      duration: 5,
      planned_start: "2026-02-01",
      planned_finish: "2026-02-05",
      early_start: null,
      early_finish: null,
      late_start: null,
      late_finish: null,
      total_float: null,
      notes: "should not appear in snapshot",
      contractor: "ACME",
      responsible_person: "Bob",
      schedule_id: "sch_1",
    },
  ];
  const relationships = [{ id: "rel_1", predecessor_id: "act_1", successor_id: "act_1", type: "FS", lag: 0, schedule_id: "sch_1" }];

  const snap = engine.buildSnapshot(schedule, wbsItems, activities, relationships);
  assert.strictEqual(snap.schedule_id, "sch_1");
  assert.strictEqual(snap.activities.length, 1);
  assert.strictEqual(snap.activities[0].name, "Excavate");
  assert.strictEqual(snap.activities[0].notes, undefined, "notes must not be carried into the snapshot");
  assert.strictEqual(snap.activities[0].contractor, undefined, "contractor must not be carried into the snapshot");
  assert.ok(snap.captured_at, "captured_at must be set");
});

// ---------------------------------------------------------------------------
// compareBaselineToCurrent: basic matched-by-id variance
// ---------------------------------------------------------------------------
function makeSnapshot(activities, relationships, calendars) {
  return {
    schedule_id: "sch_1",
    captured_at: "2026-01-01T00:00:00.000Z",
    wbs: [],
    activities: activities,
    relationships: relationships || [],
    calendars: calendars || [],
  };
}

check("matched activity: finish delayed by 3 days using planned dates", () => {
  const snapshot = makeSnapshot([
    {
      id: "act_1", external_id: null, name: "Pour Slab", duration: 5,
      planned_start: "2026-02-01", planned_finish: "2026-02-05",
      early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null,
    },
  ]);
  const current = [
    {
      id: "act_1", external_id: null, name: "Pour Slab", duration: 5,
      planned_start: "2026-02-04", planned_finish: "2026-02-08",
      early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null,
    },
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.activities.matched.length, 1);
  const m = result.activities.matched[0];
  assert.strictEqual(m.comparable, true);
  assert.strictEqual(m.finish_variance_days, 3);
  assert.strictEqual(m.start_variance_days, 3);
  assert.strictEqual(result.summary.delayed_count, 1);
  assert.strictEqual(result.summary.on_time_count, 0);
});

check("matched activity: prefers calculated (early_*) dates over planned when both present", () => {
  const snapshot = makeSnapshot([
    {
      id: "act_1", external_id: null, name: "A", duration: 5,
      planned_start: "2026-02-01", planned_finish: "2026-02-05",
      early_start: "2026-02-03", early_finish: "2026-02-07",
      late_start: null, late_finish: null, total_float: 0,
    },
  ]);
  const current = [
    {
      id: "act_1", external_id: null, name: "A", duration: 5,
      planned_start: "2026-02-01", planned_finish: "2026-02-05", // unchanged planned dates
      early_start: "2026-02-10", early_finish: "2026-02-14", // but calculated dates moved
      late_start: null, late_finish: null, total_float: 0,
    },
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  const m = result.activities.matched[0];
  assert.strictEqual(m.baseline.source, "calculated");
  assert.strictEqual(m.current.source, "calculated");
  assert.strictEqual(m.finish_variance_days, 7, "should compare early_finish (2/7 -> 2/14), not planned_finish");
});

check("matched activity: flags mixed_date_sources instead of silently comparing planned vs calculated", () => {
  const snapshot = makeSnapshot([
    {
      id: "act_1", external_id: null, name: "A", duration: 5,
      planned_start: "2026-02-01", planned_finish: "2026-02-05",
      early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null,
    },
  ]);
  const current = [
    {
      id: "act_1", external_id: null, name: "A", duration: 5,
      planned_start: "2026-02-01", planned_finish: "2026-02-05",
      early_start: "2026-02-06", early_finish: "2026-02-10", // Calculate Schedule has since been run
      late_start: null, late_finish: null, total_float: 3,
    },
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  const m = result.activities.matched[0];
  assert.strictEqual(m.comparable, true);
  assert.strictEqual(m.mixed_date_sources, true);
});

check("not comparable when neither side has any usable date", () => {
  const snapshot = makeSnapshot([
    { id: "act_1", external_id: null, name: "A", duration: null, planned_start: "", planned_finish: "", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ]);
  const current = [
    { id: "act_1", external_id: null, name: "A", duration: null, planned_start: "", planned_finish: "", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  const m = result.activities.matched[0];
  assert.strictEqual(m.comparable, false);
  assert.strictEqual(result.summary.not_comparable_count, 1);
  assert.strictEqual(result.summary.delayed_count, 0);
});

// ---------------------------------------------------------------------------
// Cross-revision matching via external_id (the actual point of Gate 4)
// ---------------------------------------------------------------------------
check("matches by external_id when id differs across a re-imported revision", () => {
  const snapshot = makeSnapshot([
    {
      id: "act_from_rev1", external_id: "SRC-42", name: "Excavate", duration: 5,
      planned_start: "2026-02-01", planned_finish: "2026-02-05",
      early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null,
    },
  ]);
  // Re-import mints a brand new activity id, but preserves the source file's own ID
  // on external_id (per scheduleImportService.js) — this is exactly the case the
  // engine's header comment calls out as the common one, not the exception.
  const current = [
    {
      id: "act_from_rev2_freshly_generated", external_id: "SRC-42", name: "Excavate", duration: 5,
      planned_start: "2026-02-08", planned_finish: "2026-02-12",
      early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null,
    },
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.activities.matched.length, 1, "should match via external_id, not id");
  assert.strictEqual(result.activities.added.length, 0);
  assert.strictEqual(result.activities.removed.length, 0);
  assert.strictEqual(result.activities.matched[0].finish_variance_days, 7);
});

check("without external_id on either side, a changed id across revisions shows as added+removed (not a false match)", () => {
  const snapshot = makeSnapshot([
    { id: "act_rev1", external_id: null, name: "Excavate", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ]);
  const current = [
    { id: "act_rev2", external_id: null, name: "Excavate", duration: 5, planned_start: "2026-02-08", planned_finish: "2026-02-12", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.activities.matched.length, 0);
  assert.strictEqual(result.activities.added.length, 1);
  assert.strictEqual(result.activities.removed.length, 1);
});

// ---------------------------------------------------------------------------
// Added / removed activities
// ---------------------------------------------------------------------------
check("detects added and removed activities correctly", () => {
  const snapshot = makeSnapshot([
    { id: "act_1", external_id: null, name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
    { id: "act_2", external_id: null, name: "B (will be removed)", duration: 3, planned_start: "2026-02-01", planned_finish: "2026-02-03", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ]);
  const current = [
    { id: "act_1", external_id: null, name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
    { id: "act_3", external_id: null, name: "C (newly added)", duration: 2, planned_start: "2026-02-06", planned_finish: "2026-02-08", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.activities.matched.length, 1);
  assert.strictEqual(result.activities.added.length, 1);
  assert.strictEqual(result.activities.added[0].name, "C (newly added)");
  assert.strictEqual(result.activities.removed.length, 1);
  assert.strictEqual(result.activities.removed[0].name, "B (will be removed)");
});

// ---------------------------------------------------------------------------
// Criticality change
// ---------------------------------------------------------------------------
check("flags criticality_changed when total_float crosses the zero line", () => {
  const snapshot = makeSnapshot([
    { id: "act_1", external_id: null, name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: "2026-02-01", early_finish: "2026-02-05", late_start: null, late_finish: null, total_float: 4 },
  ]);
  const current = [
    { id: "act_1", external_id: null, name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: "2026-02-01", early_finish: "2026-02-05", late_start: null, late_finish: null, total_float: 0 },
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.activities.matched[0].criticality_changed, true);
  assert.strictEqual(result.activities.matched[0].baseline.is_critical, false);
  assert.strictEqual(result.activities.matched[0].current.is_critical, true);
});

check("does not claim criticality_changed when total_float is unknown on either side", () => {
  const snapshot = makeSnapshot([
    { id: "act_1", external_id: null, name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ]);
  const current = [
    { id: "act_1", external_id: null, name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: "2026-02-01", early_finish: "2026-02-05", late_start: null, late_finish: null, total_float: 0 },
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.activities.matched[0].criticality_changed, false, "unknown-vs-known must not register as a change");
});

// ---------------------------------------------------------------------------
// Relationship (logic) changes, matched by activity key not raw relationship id
// ---------------------------------------------------------------------------
check("relationship logic comparison survives id changes across a re-import via external_id matching", () => {
  const snapshot = makeSnapshot(
    [
      { id: "act_1_rev1", external_id: "SRC-1", name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
      { id: "act_2_rev1", external_id: "SRC-2", name: "B", duration: 3, planned_start: "2026-02-06", planned_finish: "2026-02-08", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
    ],
    [{ predecessor_id: "act_1_rev1", successor_id: "act_2_rev1", type: "FS", lag: 0 }]
  );
  const current = [
    { id: "act_1_rev2", external_id: "SRC-1", name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
    { id: "act_2_rev2", external_id: "SRC-2", name: "B", duration: 3, planned_start: "2026-02-06", planned_finish: "2026-02-08", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ];
  const currentRelationships = [{ predecessor_id: "act_1_rev2", successor_id: "act_2_rev2", type: "FS", lag: 0 }];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, currentRelationships);
  assert.strictEqual(result.relationship_changes.added, 0, "same logic under new ids must not register as added");
  assert.strictEqual(result.relationship_changes.removed, 0, "same logic under new ids must not register as removed");
});

check("detects a genuinely added relationship", () => {
  const snapshot = makeSnapshot(
    [
      { id: "act_1", external_id: "SRC-1", name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
      { id: "act_2", external_id: "SRC-2", name: "B", duration: 3, planned_start: "2026-02-06", planned_finish: "2026-02-08", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
    ],
    []
  );
  const current = [
    { id: "act_1", external_id: "SRC-1", name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
    { id: "act_2", external_id: "SRC-2", name: "B", duration: 3, planned_start: "2026-02-06", planned_finish: "2026-02-08", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ];
  const currentRelationships = [{ predecessor_id: "act_1", successor_id: "act_2", type: "FS", lag: 0 }];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, currentRelationships);
  assert.strictEqual(result.relationship_changes.added, 1);
  assert.strictEqual(result.relationship_changes.removed, 0);
});

// ---------------------------------------------------------------------------
// Project-level finish variance
// ---------------------------------------------------------------------------
check("project_finish_variance_days uses the overall (max) finish across all activities on each side", () => {
  const snapshot = makeSnapshot([
    { id: "act_1", external_id: null, name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
    { id: "act_2", external_id: null, name: "B", duration: 3, planned_start: "2026-02-01", planned_finish: "2026-02-10", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ]);
  const current = [
    { id: "act_1", external_id: null, name: "A", duration: 5, planned_start: "2026-02-01", planned_finish: "2026-02-05", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
    { id: "act_2", external_id: null, name: "B", duration: 3, planned_start: "2026-02-01", planned_finish: "2026-02-15", early_start: null, early_finish: null, late_start: null, late_finish: null, total_float: null },
  ]; // overall finish slipped from 2/10 to 2/15 -> +5
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.summary.baseline_overall_finish, "2026-02-10");
  assert.strictEqual(result.summary.current_overall_finish, "2026-02-15");
  assert.strictEqual(result.summary.project_finish_variance_days, 5);
});

// ---------------------------------------------------------------------------
// Phase 4 (Schedule Versioning & Comparison), master upgrade prompt Section 52:
// calendar changes, constraint changes, and critical path movement as their own
// reported signals.
// ---------------------------------------------------------------------------

function makeActivity(overrides) {
  return Object.assign(
    {
      id: "act_1", external_id: null, name: "A", duration: 5,
      planned_start: "2026-02-01", planned_finish: "2026-02-05",
      early_start: null, early_finish: null, late_start: null, late_finish: null,
      total_float: null, calendar_id: null, constraint_type: "", constraint_date: "",
    },
    overrides
  );
}

check("buildSnapshot carries calendar_id/constraint_type/constraint_date onto each activity, and trims calendars to their comparison-relevant fields", () => {
  const schedule = { id: "sch_1", name: "Rev 1", revision_number: 1, data_date: "2026-01-01" };
  const activities = [makeActivity({ calendar_id: "cal_1", constraint_type: "SNET", constraint_date: "2026-02-01" })];
  const calendars = [{ id: "cal_1", project_id: "proj_1", name: "5-Day", is_default: true, working_days: [true, true, true, true, true, false, false], holidays: ["2026-01-01"], created_at: "x", updated_at: "x" }];
  const snap = engine.buildSnapshot(schedule, [], activities, [], calendars);
  assert.strictEqual(snap.activities[0].calendar_id, "cal_1");
  assert.strictEqual(snap.activities[0].constraint_type, "SNET");
  assert.strictEqual(snap.calendars.length, 1);
  assert.strictEqual(snap.calendars[0].name, "5-Day");
  assert.strictEqual(snap.calendars[0].created_at, undefined, "created_at has no comparison value and must not be carried into the snapshot");
});

check("a calendar's working_days/holidays being edited (same id) flags every activity assigned to it as calendar_changed", () => {
  const cal5Day = { id: "cal_1", name: "5-Day", working_days: [true, true, true, true, true, false, false], holidays: [] };
  const cal6Day = { id: "cal_1", name: "5-Day", working_days: [true, true, true, true, true, true, false], holidays: [] };
  const snapshot = makeSnapshot([makeActivity({ calendar_id: "cal_1" })], [], [cal5Day]);
  const current = [makeActivity({ calendar_id: "cal_1" })];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, [], [cal6Day]);
  assert.strictEqual(result.activities.matched[0].calendar_changed, true);
  assert.strictEqual(result.calendar_changes.modified_count, 1);
  assert.deepStrictEqual(result.calendar_changes.modified_names, ["5-Day"]);
  assert.strictEqual(result.summary.calendar_changed_count, 1);
});

check("reassigning an activity to a different calendar_id flags calendar_changed even if neither calendar's own definition changed", () => {
  const calA = { id: "cal_a", name: "A", working_days: [true, true, true, true, true, false, false], holidays: [] };
  const calB = { id: "cal_b", name: "B", working_days: [true, true, true, true, true, false, false], holidays: [] };
  const snapshot = makeSnapshot([makeActivity({ calendar_id: "cal_a" })], [], [calA, calB]);
  const current = [makeActivity({ calendar_id: "cal_b" })];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, [], [calA, calB]);
  assert.strictEqual(result.activities.matched[0].calendar_changed, true);
  assert.strictEqual(result.calendar_changes.modified_count, 0, "neither calendar's own definition changed");
});

check("no calendar change reports calendar_changed: false and an empty calendar_changes summary", () => {
  const cal = { id: "cal_1", name: "5-Day", working_days: [true, true, true, true, true, false, false], holidays: [] };
  const snapshot = makeSnapshot([makeActivity({ calendar_id: "cal_1" })], [], [cal]);
  const current = [makeActivity({ calendar_id: "cal_1" })];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, [], [cal]);
  assert.strictEqual(result.activities.matched[0].calendar_changed, false);
  assert.strictEqual(result.calendar_changes.modified_count, 0);
  assert.strictEqual(result.summary.calendar_changed_count, 0);
});

check("backward compatibility: comparing against a pre-Phase-4 snapshot with no calendars field at all doesn't crash and reports no calendar changes", () => {
  const oldSnapshot = { schedule_id: "sch_1", captured_at: "x", wbs: [], activities: [makeActivity({})], relationships: [] };
  delete oldSnapshot.calendars;
  const current = [makeActivity({})];
  const result = engine.compareBaselineToCurrent(oldSnapshot, [], current, []); // currentCalendars omitted entirely too
  assert.strictEqual(result.calendar_changes.modified_count, 0);
  assert.strictEqual(result.activities.matched[0].calendar_changed, false);
});

check("a constraint_type or constraint_date change flags constraint_changed and counts it in the summary", () => {
  const snapshot = makeSnapshot([makeActivity({ constraint_type: "", constraint_date: "" })]);
  const current = [makeActivity({ constraint_type: "SNET", constraint_date: "2026-03-01" })];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.activities.matched[0].constraint_changed, true);
  assert.strictEqual(result.summary.constraint_changed_count, 1);
});

check("no constraint change (both unset) does not flag constraint_changed", () => {
  const snapshot = makeSnapshot([makeActivity({})]);
  const current = [makeActivity({})];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.activities.matched[0].constraint_changed, false);
  assert.strictEqual(result.summary.constraint_changed_count, 0);
});

check("CRITICAL PATH MOVEMENT: an activity crossing from non-critical (float > 0) to critical (float 0) is reported as 'entered'; the reverse as 'left'", () => {
  const snapshot = makeSnapshot([
    makeActivity({ id: "act_1", name: "Was slack, now critical", total_float: 5 }),
    makeActivity({ id: "act_2", name: "Was critical, now has slack", total_float: 0 }),
    makeActivity({ id: "act_3", name: "Stayed critical", total_float: 0 }),
  ]);
  const current = [
    makeActivity({ id: "act_1", name: "Was slack, now critical", total_float: 0 }),
    makeActivity({ id: "act_2", name: "Was critical, now has slack", total_float: 4 }),
    makeActivity({ id: "act_3", name: "Stayed critical", total_float: 0 }),
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.critical_path_changes.changed, true);
  assert.strictEqual(result.critical_path_changes.entered.length, 1);
  assert.strictEqual(result.critical_path_changes.entered[0].name, "Was slack, now critical");
  assert.strictEqual(result.critical_path_changes.left.length, 1);
  assert.strictEqual(result.critical_path_changes.left[0].name, "Was critical, now has slack");
  assert.strictEqual(result.critical_path_changes.stable_count, 1, "the activity that was and remains critical counts as stable, not entered/left");
});

check("CRITICAL PATH MOVEMENT: no crossings reports changed: false, with every still-critical activity counted as stable", () => {
  const snapshot = makeSnapshot([
    makeActivity({ id: "act_1", total_float: 0 }),
    makeActivity({ id: "act_2", total_float: 3 }),
  ]);
  const current = [
    makeActivity({ id: "act_1", total_float: 0 }),
    makeActivity({ id: "act_2", total_float: 2 }),
  ];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.critical_path_changes.changed, false);
  assert.strictEqual(result.critical_path_changes.entered.length, 0);
  assert.strictEqual(result.critical_path_changes.left.length, 0);
  assert.strictEqual(result.critical_path_changes.stable_count, 1);
});

check("CRITICAL PATH MOVEMENT: unknown total_float on either side is excluded from entered/left/stable, not guessed", () => {
  const snapshot = makeSnapshot([makeActivity({ id: "act_1", total_float: null })]);
  const current = [makeActivity({ id: "act_1", total_float: 0 })];
  const result = engine.compareBaselineToCurrent(snapshot, [], current, []);
  assert.strictEqual(result.critical_path_changes.entered.length, 0);
  assert.strictEqual(result.critical_path_changes.left.length, 0);
  assert.strictEqual(result.critical_path_changes.stable_count, 0);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
