// PCC Architecture Upgrade Phase 3 — standalone Node test for p6XerService.js's
// parseXer(). Same eval-the-real-file approach as test_msp_xml_import_service.js.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

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

function loadService() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  global.window = dom.window;
  const excelSrc = fs.readFileSync(path.join(__dirname, "..", "src", "js", "scheduleImportService.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(excelSrc);
  const p6Src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "p6XerService.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(p6Src);
  return dom.window.PCC.p6XerService;
}

const svc = loadService();

// %T/%F/%R blocks built with tab.join() so the fixture stays readable — one project,
// one calendar (day_hr_cnt 8), a two-level WBS, three activities (complete/in-progress/
// milestone) covering duration, remaining duration, percent complete, actual dates, a
// constraint, and a lagged relationship chain.
function buildXer(overrides) {
  overrides = overrides || {};
  const lines = [
    "ERMHDR\t21.12\t2026-08-27\tProject\tadmin\t\t\t\t\t",
    "%T\tCALENDAR",
    "%F\tclndr_id\tdefault_flag\tclndr_name\tproj_id\tday_hr_cnt\tweek_hr_cnt",
    "%R\t100\tY\tStandard\tPROJ1\t8\t40",
    "%T\tPROJECT",
    "%F\tproj_id\tproj_short_name\tplan_start_date",
    "%R\tPROJ1\tSample Project\t2026-01-01",
    "%T\tPROJWBS",
    "%F\twbs_id\tproj_id\twbs_short_name\twbs_name\tparent_wbs_id\tseq_num",
    "%R\tW1\tPROJ1\t1\tSitework\t\t1",
    "%R\tW2\tPROJ1\t1.1\tClearing\tW1\t1",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date\tcstr_type\tcstr_date",
    "%R\tT1\tPROJ1\tW2\t100\tA1000\tClear Site\tTT_Task\tTK_Complete\t40\t0\t2026-01-05 08:00\t2026-01-09 17:00\t2026-01-05 08:00\t2026-01-09 17:00\t\t",
    "%R\tT2\tPROJ1\tW1\t100\tA1010\tExcavate\tTT_Task\tTK_Active\t80\t40\t2026-01-12 08:00\t2026-01-21 17:00\t2026-01-12 08:00\t\tCS_MSOA\t2026-01-12 08:00",
    "%R\tT3\tPROJ1\tW1\t100\tA1020\tFoundations Complete\tTT_Mile\tTK_NotStart\t0\t\t2026-01-22 08:00\t2026-01-22 08:00\t\t\t\t",
    "%T\tTASKPRED",
    "%F\ttask_pred_id\tproj_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
    "%R\tP1\tPROJ1\tT2\tT1\tPR_FS\t0",
    "%R\tP2\tPROJ1\tT3\tT2\tPR_SS\t16",
    "%E",
  ];
  return overrides.raw !== undefined ? overrides.raw : lines.join("\n");
}

const XER = buildXer();
const result = svc.parseXer(XER);

check("parses without errors and imports all three activities", () => {
  assert.deepStrictEqual(result.errors, [], "unexpected errors: " + JSON.stringify(result.errors));
  assert.strictEqual(result.activities.length, 3);
  assert.deepStrictEqual(result.activities.map((a) => a.external_id).sort(), ["A1000", "A1010", "A1020"]);
});

check("task_code is used as external_id (not the internal task_id)", () => {
  assert.ok(result.activities.every((a) => /^A10/.test(a.external_id)));
});

check("WBS hierarchy: real parent_wbs_id references resolve to correct parent_code/level, no dotted-code guessing needed", () => {
  assert.strictEqual(result.wbsEntries.length, 2);
  const sitework = result.wbsEntries.find((w) => w.code === "1");
  const clearing = result.wbsEntries.find((w) => w.code === "1.1");
  assert.strictEqual(sitework.parent_code, null);
  assert.strictEqual(sitework.level, 0);
  assert.strictEqual(clearing.parent_code, "1");
  assert.strictEqual(clearing.level, 1);
});

check("each activity resolves its real wbs_id to the correct WBS code", () => {
  const clearSite = result.activities.find((a) => a.external_id === "A1000");
  const excavate = result.activities.find((a) => a.external_id === "A1010");
  assert.strictEqual(clearSite.wbs_code, "1.1");
  assert.strictEqual(excavate.wbs_code, "1");
});

check("durations and remaining duration are converted exactly using the calendar's real day_hr_cnt (no assumption, no warning)", () => {
  const clearSite = result.activities.find((a) => a.external_id === "A1000");
  const excavate = result.activities.find((a) => a.external_id === "A1010");
  assert.strictEqual(clearSite.duration, 5, "40 hours / 8 hr/day = 5 days");
  assert.strictEqual(excavate.duration, 10, "80 hours / 8 hr/day = 10 days");
  assert.strictEqual(excavate.remaining_duration, 5, "40 hours remaining / 8 = 5 days");
  assert.ok(!result.warnings.some((w) => w.message.indexOf("assumed") !== -1 || w.message.indexOf("hour working day") !== -1), "an exact day_hr_cnt-based conversion needs no assumption warning");
});

check("percent complete: TK_Complete -> 100, duration-percent-complete formula for in-progress, 0 for not-started", () => {
  const clearSite = result.activities.find((a) => a.external_id === "A1000");
  const excavate = result.activities.find((a) => a.external_id === "A1010");
  const milestone = result.activities.find((a) => a.external_id === "A1020");
  assert.strictEqual(clearSite.percent_complete, 100);
  assert.strictEqual(excavate.percent_complete, 50, "(80-40)/80*100 = 50");
  assert.strictEqual(milestone.percent_complete, 0);
});

check("dates, actuals, milestone flag, and status are preserved", () => {
  const clearSite = result.activities.find((a) => a.external_id === "A1000");
  assert.strictEqual(clearSite.planned_start, "2026-01-05");
  assert.strictEqual(clearSite.planned_finish, "2026-01-09");
  assert.strictEqual(clearSite.actual_start, "2026-01-05");
  assert.strictEqual(clearSite.actual_finish, "2026-01-09");
  assert.strictEqual(clearSite.status, "complete");

  const excavate = result.activities.find((a) => a.external_id === "A1010");
  assert.strictEqual(excavate.actual_finish, "", "no act_end_date -> blank, not fabricated");
  assert.strictEqual(excavate.status, "in_progress");

  const milestone = result.activities.find((a) => a.external_id === "A1020");
  assert.strictEqual(milestone.activity_type, "milestone");
  assert.strictEqual(milestone.status, "not_started");
});

check("P6 constraint codes map onto the same short-code vocabulary mspXmlService.js uses", () => {
  const excavate = result.activities.find((a) => a.external_id === "A1010");
  assert.strictEqual(excavate.constraint_type, "SNET", "CS_MSOA -> SNET");
  assert.strictEqual(excavate.constraint_date, "2026-01-12");

  const clearSite = result.activities.find((a) => a.external_id === "A1000");
  assert.strictEqual(clearSite.constraint_type, "", "no cstr_type -> no constraint");
});

check("relationships resolve real task_id references to task_code, with correct type and exact lag conversion", () => {
  assert.strictEqual(result.relationships.length, 2);
  const r1 = result.relationships.find((r) => r.successor_external_id === "A1010");
  assert.strictEqual(r1.predecessor_external_id, "A1000");
  assert.strictEqual(r1.type, "FS");
  assert.strictEqual(r1.lag, 0);

  const r2 = result.relationships.find((r) => r.successor_external_id === "A1020");
  assert.strictEqual(r2.predecessor_external_id, "A1010");
  assert.strictEqual(r2.type, "SS");
  assert.strictEqual(r2.lag, 2, "16 hours / 8 hr/day = 2 days, exact");
});

check("the calendar most activities reference is imported by name, with an honest 'pattern not decoded' warning", () => {
  assert.ok(result.calendar);
  assert.strictEqual(result.calendar.name, "Standard");
  assert.deepStrictEqual(result.calendar.working_days, [true, true, true, true, true, false, false]);
  assert.deepStrictEqual(result.calendar.holidays, []);
  assert.ok(result.warnings.some((w) => w.message.indexOf("not decoded yet") !== -1));
});

check("summary counts are correct", () => {
  assert.strictEqual(result.summary.total_rows, 3);
  assert.strictEqual(result.summary.imported, 3);
  assert.strictEqual(result.summary.errors, 0);
  assert.strictEqual(result.summary.circular_relationships_skipped, 0);
});

// ---------------------------------------------------------------------------
// Error/warning paths
// ---------------------------------------------------------------------------
check("a file missing the ERMHDR header reports a clear error, not a thrown exception", () => {
  const bad = svc.parseXer("not an XER file at all");
  assert.strictEqual(bad.activities.length, 0);
  assert.ok(bad.errors[0].message.indexOf("ERMHDR") !== -1);
});

check("a file with no PROJECT table reports a clear error", () => {
  const noProject = svc.parseXer("ERMHDR\t21.12\n%T\tTASK\n%F\ttask_id\n%R\tT1\n%E");
  assert.ok(noProject.errors[0].message.indexOf("no PROJECT table") !== -1);
});

check("a file with a PROJECT but no TASK rows reports a clear error", () => {
  const noTasks = svc.parseXer(["ERMHDR\t21.12", "%T\tPROJECT", "%F\tproj_id\tproj_short_name", "%R\tPROJ1\tEmpty", "%E"].join("\n"));
  assert.ok(noTasks.errors[0].message.indexOf("nothing to import") !== -1);
});

check("a file with multiple projects imports only the first, with a warning naming it", () => {
  const multi = svc.parseXer([
    "ERMHDR\t21.12",
    "%T\tPROJECT",
    "%F\tproj_id\tproj_short_name",
    "%R\tPROJ1\tFirst Project",
    "%R\tPROJ2\tSecond Project",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code",
    "%R\tT1\tPROJ1\tA1\tTask One\tTT_Task\tTK_NotStart",
    "%R\tT2\tPROJ2\tA2\tTask Two\tTT_Task\tTK_NotStart",
    "%E",
  ].join("\n"));
  assert.strictEqual(multi.activities.length, 1);
  assert.strictEqual(multi.activities[0].external_id, "A1");
  assert.ok(multi.warnings.some((w) => w.message.indexOf("First Project") !== -1));
});

check("an unrecognized task_type falls back to 'task' with a warning", () => {
  const r = svc.parseXer([
    "ERMHDR\t21.12",
    "%T\tPROJECT",
    "%F\tproj_id",
    "%R\tPROJ1",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code",
    "%R\tT1\tPROJ1\tA1\tWeird Task\tTT_Something_New\tTK_NotStart",
    "%E",
  ].join("\n"));
  assert.strictEqual(r.activities[0].activity_type, "task");
  assert.ok(r.warnings.some((w) => w.message.indexOf('unrecognized task type "TT_Something_New"') !== -1));
});

check("an unrecognized relationship type falls back to Finish-to-Start with a warning", () => {
  const r = svc.parseXer([
    "ERMHDR\t21.12",
    "%T\tPROJECT",
    "%F\tproj_id",
    "%R\tPROJ1",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code",
    "%R\tT1\tPROJ1\tA1\tOne\tTT_Task\tTK_NotStart",
    "%R\tT2\tPROJ1\tA2\tTwo\tTT_Task\tTK_NotStart",
    "%T\tTASKPRED",
    "%F\ttask_pred_id\tproj_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
    "%R\tP1\tPROJ1\tT2\tT1\tPR_Weird\t0",
    "%E",
  ].join("\n"));
  assert.strictEqual(r.relationships[0].type, "FS");
  assert.ok(r.warnings.some((w) => w.message.indexOf('Unrecognized relationship type "PR_Weird"') !== -1));
});

check("a self-referencing relationship is skipped with a warning", () => {
  const r = svc.parseXer([
    "ERMHDR\t21.12",
    "%T\tPROJECT",
    "%F\tproj_id",
    "%R\tPROJ1",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code",
    "%R\tT1\tPROJ1\tA1\tOne\tTT_Task\tTK_NotStart",
    "%T\tTASKPRED",
    "%F\ttask_pred_id\tproj_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
    "%R\tP1\tPROJ1\tT1\tT1\tPR_FS\t0",
    "%E",
  ].join("\n"));
  assert.strictEqual(r.relationships.length, 0);
  assert.ok(r.warnings.some((w) => w.message.indexOf("own predecessor") !== -1));
});

check("a circular relationship chain is detected and skipped (reuses scheduleImportService's shared graph-cycle logic)", () => {
  const r = svc.parseXer([
    "ERMHDR\t21.12",
    "%T\tPROJECT",
    "%F\tproj_id",
    "%R\tPROJ1",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code",
    "%R\tT1\tPROJ1\tA1\tOne\tTT_Task\tTK_NotStart",
    "%R\tT2\tPROJ1\tA2\tTwo\tTT_Task\tTK_NotStart",
    "%T\tTASKPRED",
    "%F\ttask_pred_id\tproj_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
    "%R\tP1\tPROJ1\tT2\tT1\tPR_FS\t0",
    "%R\tP2\tPROJ1\tT1\tT2\tPR_FS\t0",
    "%E",
  ].join("\n"));
  assert.strictEqual(r.relationships.length, 0);
  assert.strictEqual(r.summary.circular_relationships_skipped, 2);
});

check("a duplicate WBS short_name across different branches is disambiguated with a warning, not silently merged", () => {
  const r = svc.parseXer([
    "ERMHDR\t21.12",
    "%T\tPROJECT",
    "%F\tproj_id",
    "%R\tPROJ1",
    "%T\tPROJWBS",
    "%F\twbs_id\tproj_id\twbs_short_name\twbs_name\tparent_wbs_id\tseq_num",
    "%R\tW1\tPROJ1\t1\tBranch A\t\t1",
    "%R\tW2\tPROJ1\t1\tBranch B\t\t2",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\ttask_type\tstatus_code",
    "%R\tT1\tPROJ1\tW1\tA1\tOne\tTT_Task\tTK_NotStart",
    "%R\tT2\tPROJ1\tW2\tA2\tTwo\tTT_Task\tTK_NotStart",
    "%E",
  ].join("\n"));
  assert.strictEqual(r.wbsEntries.length, 2);
  const codes = r.wbsEntries.map((w) => w.code);
  assert.strictEqual(new Set(codes).size, 2, "both WBS nodes must keep distinct codes, not collapse into one");
  assert.ok(r.warnings.some((w) => w.message.indexOf("is used by more than one node") !== -1));
  // The two activities must resolve to their OWN correct WBS node, not both to the same one.
  const a1 = r.activities.find((a) => a.external_id === "A1");
  const a2 = r.activities.find((a) => a.external_id === "A2");
  assert.notStrictEqual(a1.wbs_code, a2.wbs_code);
});

check("a cyclic parent_wbs_id chain does not hang parsing (defensive cycle guard)", () => {
  const r = svc.parseXer([
    "ERMHDR\t21.12",
    "%T\tPROJECT",
    "%F\tproj_id",
    "%R\tPROJ1",
    "%T\tPROJWBS",
    "%F\twbs_id\tproj_id\twbs_short_name\twbs_name\tparent_wbs_id\tseq_num",
    "%R\tWA\tPROJ1\tA\tA\tWB\t1",
    "%R\tWB\tPROJ1\tB\tB\tWA\t2",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\ttask_type\tstatus_code",
    "%R\tT1\tPROJ1\tWA\tA1\tOne\tTT_Task\tTK_NotStart",
    "%E",
  ].join("\n"));
  // Must terminate and produce some result rather than hang or throw.
  assert.strictEqual(r.wbsEntries.length, 2);
});

check("a calendar with no day_hr_cnt falls back to an 8-hour assumption, with exactly one summary warning", () => {
  const r = svc.parseXer([
    "ERMHDR\t21.12",
    "%T\tCALENDAR",
    "%F\tclndr_id\tdefault_flag\tclndr_name\tproj_id\tday_hr_cnt",
    "%R\t100\tY\tNo Hours\tPROJ1\t",
    "%T\tPROJECT",
    "%F\tproj_id",
    "%R\tPROJ1",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_drtn_hr_cnt",
    "%R\tT1\tPROJ1\t100\tA1\tOne\tTT_Task\tTK_NotStart\t16",
    "%R\tT2\tPROJ1\t100\tA2\tTwo\tTT_Task\tTK_NotStart\t24",
    "%E",
  ].join("\n"));
  assert.strictEqual(r.activities[0].duration, 2, "16 / 8 fallback = 2 days");
  assert.strictEqual(r.activities[1].duration, 3, "24 / 8 fallback = 3 days");
  const fallbackWarnings = r.warnings.filter((w) => w.message.indexOf("assumed") !== -1 || w.message.indexOf("8-hour working day") !== -1);
  assert.strictEqual(fallbackWarnings.length, 1, "one summary warning, not one per activity");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
