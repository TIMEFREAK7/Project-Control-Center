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

// ---------------------------------------------------------------------------
// Calendar-aware calculation (PCC Architecture Upgrade Phase 7, Advanced Scheduling)
// Reference week used throughout: Mon 2026-03-02 .. Fri 2026-03-06, weekend 03-07/03-08,
// next week Mon 2026-03-09 .. Fri 2026-03-13. Verified against a real calendar (`date -d`)
// before writing any assertion below, not hand-computed.
// ---------------------------------------------------------------------------

var MON_FRI = { id: "cal-monfri", working_days: [true, true, true, true, true, false, false], holidays: [] };

check("calendar-aware: a weekend between two FS-linked activities is skipped, not counted as work time", () => {
  var activities = [
    { id: "A", duration: 1, calendar_id: "cal-monfri" },
    { id: "B", duration: 1, calendar_id: "cal-monfri" },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-03-06", calendarAware: true, calendars: [MON_FRI] });
  assert.strictEqual(r.results.A.early_start, "2026-03-06");
  assert.strictEqual(r.results.A.early_finish, "2026-03-07");
  assert.strictEqual(r.results.B.early_start, "2026-03-09", "B must skip Sat/Sun and start the following Monday");
  assert.strictEqual(r.results.B.early_finish, "2026-03-10");
  assert.ok(!r.warnings.some((w) => /calendar/i.test(w.message)), "a fully-resolved, valid calendar must not itself produce a warning");
});

check("calendar-aware: a holiday on the calendar pushes the start further, past the weekend AND the holiday", () => {
  var calWithHoliday = { id: "cal-monfri", working_days: MON_FRI.working_days, holidays: ["2026-03-09"] };
  var activities = [
    { id: "A", duration: 1, calendar_id: "cal-monfri" },
    { id: "B", duration: 1, calendar_id: "cal-monfri" },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-03-06", calendarAware: true, calendars: [calWithHoliday] });
  assert.strictEqual(r.results.B.early_start, "2026-03-10", "expected the Monday holiday to also be skipped, landing on Tuesday");
  assert.strictEqual(r.results.B.early_finish, "2026-03-11");
});

check("calendar-aware: relationship lag is applied in WORKING days, skipping the weekend it spans", () => {
  var activities = [
    { id: "A", duration: 1, calendar_id: "cal-monfri" },
    { id: "B", duration: 1, calendar_id: "cal-monfri" },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 2 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-03-06", calendarAware: true, calendars: [MON_FRI] });
  // A: Fri 03-06 -> EF boundary Sat 03-07. +2 working days from there: Mon 03-09, Tue 03-10.
  assert.strictEqual(r.results.B.early_start, "2026-03-10");
  assert.strictEqual(r.results.B.early_finish, "2026-03-11");
});

check("calendar-aware: Total Float is reported in working days, not raw calendar days", () => {
  var activities = [
    { id: "A", duration: 5, calendar_id: "cal-monfri" }, // Mon-Fri, the critical driver
    { id: "B", duration: 1, calendar_id: "cal-monfri" }, // independent, 1 day of work inside that same week
  ];
  var r = engine.calculateSchedule(activities, [], { dataDate: "2026-03-02", calendarAware: true, calendars: [MON_FRI] });
  assert.strictEqual(r.results.A.early_start, "2026-03-02");
  assert.strictEqual(r.results.A.early_finish, "2026-03-07");
  assert.strictEqual(r.results.A.total_float, 0, "A is the critical (longest) path");
  assert.strictEqual(r.results.B.early_start, "2026-03-02");
  assert.strictEqual(r.results.B.early_finish, "2026-03-03");
  assert.strictEqual(r.results.B.late_start, "2026-03-06");
  assert.strictEqual(r.results.B.late_finish, "2026-03-07");
  assert.strictEqual(r.results.B.total_float, 4, "B can slip across Mon/Tue/Wed/Thu (4 working days) and still finish inside A's window — NOT 5 raw calendar days");
  assert.strictEqual(r.results.B.free_float, 4);
});

check("calendar-aware: an in-progress activity's forecast remaining duration skips the weekend it spans", () => {
  var activities = [{ id: "A", duration: 10, actual_start: "2026-03-05", remaining_duration: 3, calendar_id: "cal-monfri" }];
  var r = engine.calculateSchedule(activities, [], { dataDate: "2026-03-06", calendarAware: true, calendars: [MON_FRI] });
  assert.strictEqual(r.results.A.status, "in_progress");
  assert.strictEqual(r.results.A.early_start, "2026-03-06", "anchor ES = max(dataDate, actual_start)");
  assert.strictEqual(r.results.A.early_finish, "2026-03-11", "3 working days from Friday (Fri, Mon, Tue) must skip the weekend, landing on Wednesday");
});

check("calendar-aware: a COMPLETED activity's early_finish exactly reconstructs its real actual_finish, never renormalized to the calendar", () => {
  // Genuinely elapsed over a real weekend: Friday to the following Monday.
  var activities = [{ id: "A", duration: 10, actual_start: "2026-03-06", actual_finish: "2026-03-09", calendar_id: "cal-monfri" }];
  var r = engine.calculateSchedule(activities, [], { dataDate: "2026-03-10", calendarAware: true, calendars: [MON_FRI] });
  assert.strictEqual(r.results.A.status, "completed");
  assert.strictEqual(r.results.A.early_start, "2026-03-06");
  assert.strictEqual(r.results.A.early_finish, "2026-03-09", "a completed activity's own dates are historical fact, not subject to calendar-aware recalculation");
});

check("calendar-aware: an activity with no resolvable calendar falls back to 'every day is working' and warns, rather than throwing", () => {
  var activities = [{ id: "A", duration: 1, calendar_id: "cal-does-not-exist" }];
  var r = engine.calculateSchedule(activities, [], { dataDate: "2026-03-06", calendarAware: true, calendars: [MON_FRI] });
  assert.strictEqual(r.results.A.early_start, "2026-03-06");
  assert.strictEqual(r.results.A.early_finish, "2026-03-07", "no calendar resolved -> plain calendar-day math for this activity");
  assert.ok(
    r.warnings.some((w) => w.activityId === "A" && /no resolvable calendar/i.test(w.message)),
    "expected a warning naming the unresolved calendar"
  );
});

check("calendar-aware: a calendar with zero working days falls back safely (no infinite loop) and warns", () => {
  var noWorkingDaysCal = { id: "cal-broken", working_days: [false, false, false, false, false, false, false], holidays: [] };
  var activities = [{ id: "A", duration: 2, calendar_id: "cal-broken" }];
  var r = engine.calculateSchedule(activities, [], { dataDate: "2026-03-06", calendarAware: true, calendars: [noWorkingDaysCal] });
  assert.strictEqual(r.results.A.early_start, "2026-03-06");
  assert.strictEqual(r.results.A.early_finish, "2026-03-08", "falls back to plain 2-calendar-day math rather than hanging");
  assert.ok(
    r.warnings.some((w) => w.activityId === "A" && /no working days at all/i.test(w.message)),
    "expected a warning about the broken calendar"
  );
});

check("calendar-aware defaults OFF: omitting options.calendarAware entirely produces identical results to explicitly passing false", () => {
  var activities = [
    { id: "A", duration: 5, calendar_id: "cal-monfri" },
    { id: "B", duration: 3, calendar_id: "cal-monfri" },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 1 }];
  var rDefault = engine.calculateSchedule(activities, rels, { dataDate: "2026-03-02", calendars: [MON_FRI] });
  var rExplicitOff = engine.calculateSchedule(activities, rels, { dataDate: "2026-03-02", calendarAware: false, calendars: [MON_FRI] });
  assert.deepStrictEqual(rDefault.results, rExplicitOff.results);
  // And explicitly differs from the calendar-aware run on the same data, proving the flag actually does something.
  var rAware = engine.calculateSchedule(activities, rels, { dataDate: "2026-03-02", calendarAware: true, calendars: [MON_FRI] });
  assert.notDeepStrictEqual(rDefault.results, rAware.results);
});

// ---------------------------------------------------------------------------
// Date constraints (PCC Architecture Upgrade Phase 7, Advanced Scheduling, follow-on)
// ---------------------------------------------------------------------------

check("constraints: Must Start On (MSO) is honored when compatible with predecessor logic", () => {
  var activities = [{ id: "A", duration: 5, constraint_type: "MSO", constraint_date: "2026-01-10" }];
  var r = engine.calculateSchedule(activities, [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(r.results.A.early_start, "2026-01-10", "MSO must win over the earlier dataDate floor");
  assert.strictEqual(r.results.A.early_finish, "2026-01-15");
  assert.ok(!r.warnings.length, "a satisfiable constraint must not itself produce a warning");
});

check("constraints: MSO conflicting with predecessor logic loses to logic, and is flagged", () => {
  var activities = [
    { id: "A", duration: 5 },
    { id: "B", duration: 1, constraint_type: "MSO", constraint_date: "2026-01-03" },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-01", honorConstraints: true });
  // A: 01-01 -> 01-06. B's predecessor logic requires ES >= 01-06, later than the MSO date.
  assert.strictEqual(r.results.B.early_start, "2026-01-06", "predecessor logic must win over an incompatible hard constraint");
  assert.ok(r.warnings.some((w) => w.activityId === "B" && /Must Start On/i.test(w.message)), "expected a conflict warning");
});

check("constraints: Start No Earlier Than (SNET) floors the start, never pulls it earlier than natural", () => {
  var pushed = engine.calculateSchedule([{ id: "A", duration: 1, constraint_type: "SNET", constraint_date: "2026-01-05" }], [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(pushed.results.A.early_start, "2026-01-05");

  var unaffected = engine.calculateSchedule([{ id: "A", duration: 1, constraint_type: "SNET", constraint_date: "2026-01-05" }], [], { dataDate: "2026-01-10", honorConstraints: true });
  assert.strictEqual(unaffected.results.A.early_start, "2026-01-10", "SNET must never pull an already-later start earlier");
});

check("constraints: Start No Later Than (SNLT) caps the start when compatible with predecessor logic", () => {
  var r = engine.calculateSchedule([{ id: "A", duration: 1, constraint_type: "SNLT", constraint_date: "2026-01-05" }], [], { dataDate: "2026-01-10", honorConstraints: true });
  assert.strictEqual(r.results.A.early_start, "2026-01-05", "SNLT must pull an already-later natural start back to the cap");
});

check("constraints: SNLT conflicting with predecessor logic loses to logic, and is flagged", () => {
  var activities = [
    { id: "A", duration: 5 },
    { id: "B", duration: 1, constraint_type: "SNLT", constraint_date: "2026-01-03" },
  ];
  var rels = [{ predecessor_id: "A", successor_id: "B", type: "FS", lag: 0 }];
  var r = engine.calculateSchedule(activities, rels, { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(r.results.B.early_start, "2026-01-06", "predecessor logic must win — B cannot start before A finishes");
  assert.ok(r.warnings.some((w) => w.activityId === "B" && /Start No Later Than/i.test(w.message)));
});

check("constraints: Must Finish On (MFO) derives the exact start needed, reproducing the constraint date as early_finish", () => {
  var r = engine.calculateSchedule([{ id: "A", duration: 5, constraint_type: "MFO", constraint_date: "2026-01-20" }], [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(r.results.A.early_start, "2026-01-15");
  assert.strictEqual(r.results.A.early_finish, "2026-01-20", "MFO must reproduce the constraint date exactly as early_finish");
});

check("constraints: Finish No Earlier Than (FNET) pushes the start out only when the natural finish would be too early", () => {
  var pushed = engine.calculateSchedule([{ id: "A", duration: 5, constraint_type: "FNET", constraint_date: "2026-01-25" }], [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(pushed.results.A.early_start, "2026-01-20");
  assert.strictEqual(pushed.results.A.early_finish, "2026-01-25");

  var unaffected = engine.calculateSchedule([{ id: "A", duration: 5, constraint_type: "FNET", constraint_date: "2026-01-03" }], [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(unaffected.results.A.early_start, "2026-01-01", "the natural finish already satisfies FNET — no push needed");
});

check("constraints: Finish No Later Than (FNLT) is satisfied silently when already met, and flagged (not force-fit) when violated", () => {
  var ok = engine.calculateSchedule([{ id: "A", duration: 5, constraint_type: "FNLT", constraint_date: "2026-01-10" }], [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(ok.results.A.early_start, "2026-01-01");
  assert.ok(!ok.warnings.length);

  var violated = engine.calculateSchedule([{ id: "A", duration: 5, constraint_type: "FNLT", constraint_date: "2026-01-12" }], [], { dataDate: "2026-01-10", honorConstraints: true });
  assert.strictEqual(violated.results.A.early_start, "2026-01-10", "cannot shrink duration to satisfy FNLT — natural (predecessor/dataDate) start is kept");
  assert.ok(violated.warnings.some((w) => w.activityId === "A" && /Finish No Later Than/i.test(w.message)));
});

check("constraints: ALAP is read but deliberately not enforced — calculated with ordinary ASAP logic, and flagged as such", () => {
  var r = engine.calculateSchedule([{ id: "A", duration: 5, constraint_type: "ALAP" }], [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(r.results.A.early_start, "2026-01-01", "ALAP falls back to plain ASAP-style calculation in this engine");
  assert.ok(r.warnings.some((w) => w.activityId === "A" && /As Late As Possible/i.test(w.message)));
});

check("constraints: a constraint_type with no constraint_date is ignored and flagged, not treated as an error", () => {
  var r = engine.calculateSchedule([{ id: "A", duration: 5, constraint_type: "MSO", constraint_date: "" }], [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(r.results.A.early_start, "2026-01-01");
  assert.ok(r.warnings.some((w) => w.activityId === "A" && /no constraint date set/i.test(w.message)));
});

check("constraints: an unrecognized constraint_type string is ignored and flagged", () => {
  var r = engine.calculateSchedule([{ id: "A", duration: 5, constraint_type: "BOGUS", constraint_date: "2026-01-05" }], [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.strictEqual(r.results.A.early_start, "2026-01-01");
  assert.ok(r.warnings.some((w) => w.activityId === "A" && /Unrecognized constraint type/i.test(w.message)));
});

check("constraints: a COMPLETED or IN-PROGRESS activity's real anchor is never overridden by its own constraint", () => {
  var completed = engine.calculateSchedule(
    [{ id: "A", duration: 10, actual_start: "2026-01-01", actual_finish: "2026-01-05", constraint_type: "MSO", constraint_date: "2026-02-01" }],
    [],
    { dataDate: "2026-01-06", honorConstraints: true }
  );
  assert.strictEqual(completed.results.A.early_start, "2026-01-01");
  assert.strictEqual(completed.results.A.early_finish, "2026-01-05", "a real actual_finish must never be overridden by a constraint");

  var inProgress = engine.calculateSchedule(
    [{ id: "A", duration: 10, actual_start: "2026-01-01", remaining_duration: 3, constraint_type: "MSO", constraint_date: "2026-02-01" }],
    [],
    { dataDate: "2026-01-06", honorConstraints: true }
  );
  assert.strictEqual(inProgress.results.A.early_start, "2026-01-06", "anchor ES = max(dataDate, actual_start), never the constraint date");
});

check("constraints default OFF: omitting options.honorConstraints entirely preserves pre-Phase-7 behavior even when constraint fields are populated", () => {
  var activities = [{ id: "A", duration: 5, constraint_type: "MSO", constraint_date: "2026-01-10" }];
  var rDefault = engine.calculateSchedule(activities, [], { dataDate: "2026-01-01" });
  var rExplicitOff = engine.calculateSchedule(activities, [], { dataDate: "2026-01-01", honorConstraints: false });
  assert.deepStrictEqual(rDefault.results, rExplicitOff.results);
  assert.strictEqual(rDefault.results.A.early_start, "2026-01-01", "an unenforced constraint must not move the date at all");
  var rHonored = engine.calculateSchedule(activities, [], { dataDate: "2026-01-01", honorConstraints: true });
  assert.notDeepStrictEqual(rDefault.results, rHonored.results);
});

check("constraints + calendar-awareness compose: a calendar-aware MFO reproduces the constraint date via a real working-day span", () => {
  // constraint_date's own eve (03-09, Monday) is itself a working day, so the exact
  // constraint date is exactly reproducible as early_finish — see the file header's own
  // note on the (rarer) case where it isn't.
  var r = engine.calculateSchedule(
    [{ id: "A", duration: 1, calendar_id: "cal-monfri", constraint_type: "MFO", constraint_date: "2026-03-10" }],
    [],
    { dataDate: "2026-03-02", honorConstraints: true, calendarAware: true, calendars: [MON_FRI] }
  );
  assert.strictEqual(r.results.A.early_start, "2026-03-09");
  assert.strictEqual(r.results.A.early_finish, "2026-03-10");
});

check("constraints + calendar-awareness: an MFO date that can't land exactly (immediately after a non-working gap) finds the nearest working-day-ending span instead of throwing or ignoring it", () => {
  var r = engine.calculateSchedule(
    [{ id: "A", duration: 1, calendar_id: "cal-monfri", constraint_type: "MFO", constraint_date: "2026-03-09" }], // the Monday right after a weekend
    [],
    { dataDate: "2026-03-02", honorConstraints: true, calendarAware: true, calendars: [MON_FRI] }
  );
  assert.strictEqual(r.results.A.early_start, "2026-03-06", "falls back to the nearest working-day-ending span (Friday) rather than an impossible exact match");
  assert.strictEqual(r.results.A.early_finish, "2026-03-07");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
