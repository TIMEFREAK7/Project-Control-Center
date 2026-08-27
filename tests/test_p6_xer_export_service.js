// PCC Architecture Upgrade Phase 3 (export half) — standalone Node test for
// p6XerService.js's exportScheduleToXer(). Verifies the XER table/field/row shape
// directly, and round-trips the output back through this same file's parseXer() to
// confirm PCC's own import/export are mutually consistent — see p6XerService.js's own
// header for why that is NOT the same claim as "a real Primavera P6 installation
// accepts this file" (none is available in this environment, and XER is known to be a
// stricter format in the field than MSPDI).
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

/** Parses %T/%F/%R blocks back into { TABLE: [{field: value}] } for direct assertions
 * on the exported structure — deliberately NOT reusing parseXer() for this, so the
 * "does the shape look right" checks don't depend on the same parser being tested. */
function parseTablesRaw(xerText) {
  const tables = {};
  let currentTable = null;
  let currentFields = null;
  xerText.split("\n").forEach((line) => {
    if (!line) return;
    const parts = line.split("\t");
    if (parts[0] === "%T") {
      currentTable = parts[1];
      tables[currentTable] = tables[currentTable] || [];
      currentFields = null;
    } else if (parts[0] === "%F") {
      currentFields = parts.slice(1);
    } else if (parts[0] === "%R" && currentTable && currentFields) {
      const rec = {};
      currentFields.forEach((f, i) => {
        rec[f] = parts[i + 1] !== undefined ? parts[i + 1] : "";
      });
      tables[currentTable].push(rec);
    }
  });
  return tables;
}

const WBS_ITEMS = [{ id: "wbs_1", code: "1", name: "Sitework", parent_wbs_id: null, level: 0 }];
const ACTIVITIES = [
  { id: "act_1", wbs_id: "wbs_1", name: "Clear Site", activity_type: "task", status: "complete", duration: 5, remaining_duration: 0, planned_start: "2026-03-01", planned_finish: "2026-03-05", actual_start: "2026-03-01", actual_finish: "2026-03-05", constraint_type: "", constraint_date: "", external_id: "A1000" },
  { id: "act_2", wbs_id: "wbs_1", name: "Excavate", activity_type: "task", status: "in_progress", duration: 10, remaining_duration: 5, planned_start: "2026-03-08", planned_finish: "2026-03-19", actual_start: "2026-03-08", actual_finish: "", constraint_type: "SNET", constraint_date: "2026-03-08", external_id: "A1010" },
  { id: "act_3", wbs_id: "wbs_1", name: "Milestone A", activity_type: "milestone", status: "not_started", duration: 0, remaining_duration: null, planned_start: "2026-03-19", planned_finish: "2026-03-19", actual_start: "", actual_finish: "", constraint_type: "", constraint_date: "", external_id: "A1020" },
  { id: "act_orphan", wbs_id: null, name: "Unassigned Rollup", activity_type: "wbs_summary", status: "not_started", duration: 2, remaining_duration: null, planned_start: "2026-03-01", planned_finish: "2026-03-02", actual_start: "", actual_finish: "", constraint_type: "", constraint_date: "", external_id: "" },
];
const RELATIONSHIPS = [
  { predecessor_id: "act_1", successor_id: "act_2", type: "FS", lag: 0 },
  { predecessor_id: "act_2", successor_id: "act_3", type: "SS", lag: 2 },
];
const CALENDAR = { name: "Standard" };

const xer = svc.exportScheduleToXer({
  schedule: { name: "Round-Trip Test Schedule" },
  wbsItems: WBS_ITEMS,
  activities: ACTIVITIES,
  relationships: RELATIONSHIPS,
  calendar: CALENDAR,
});
const tables = parseTablesRaw(xer);

check("starts with an ERMHDR line and ends with %E", () => {
  const lines = xer.split("\n").filter((l) => l);
  assert.strictEqual(lines[0].split("\t")[0], "ERMHDR");
  assert.strictEqual(lines[lines.length - 1], "%E");
});

check("PROJECT/CALENDAR/PROJWBS/TASK/TASKPRED tables are all present with the right row counts", () => {
  assert.strictEqual(tables.PROJECT.length, 1);
  assert.strictEqual(tables.CALENDAR.length, 1);
  assert.strictEqual(tables.PROJWBS.length, 1);
  assert.strictEqual(tables.TASK.length, 4);
  assert.strictEqual(tables.TASKPRED.length, 2);
});

check("every row's proj_id matches the single minted project, consistently", () => {
  const projId = tables.PROJECT[0].proj_id;
  assert.ok(projId);
  [...tables.PROJWBS, ...tables.TASK, ...tables.TASKPRED].forEach((row) => {
    assert.strictEqual(row.proj_id, projId);
  });
});

check("task_code prefers PCC's own external_id, and synthesizes one when blank", () => {
  const codes = tables.TASK.map((t) => t.task_code);
  assert.ok(codes.includes("A1000"));
  assert.ok(codes.includes("A1010"));
  assert.ok(codes.includes("A1020"));
  const orphanCode = codes.find((c) => !["A1000", "A1010", "A1020"].includes(c));
  assert.ok(orphanCode && orphanCode.length > 0, "a blank external_id must still get a real, non-empty task_code");
});

check("durations are converted to hours using the export's own fixed 8-hour day (exact, since export controls the encoding)", () => {
  const excavate = tables.TASK.find((t) => t.task_code === "A1010");
  assert.strictEqual(excavate.target_drtn_hr_cnt, "80", "10 days * 8 = 80 hours");
  assert.strictEqual(excavate.remain_drtn_hr_cnt, "40", "5 days remaining * 8 = 40 hours");
});

check("task_type reverse-maps correctly: task -> TT_Task, milestone -> TT_Mile, wbs_summary -> TT_WBS (not a many-to-one collision)", () => {
  assert.strictEqual(tables.TASK.find((t) => t.task_code === "A1000").task_type, "TT_Task");
  assert.strictEqual(tables.TASK.find((t) => t.task_code === "A1020").task_type, "TT_Mile");
  const orphan = tables.TASK.find((t) => t.task_name === "Unassigned Rollup");
  assert.strictEqual(orphan.task_type, "TT_WBS");
});

check("status_code reverse-maps correctly, and constraint/actuals are emitted only when present", () => {
  const clearSite = tables.TASK.find((t) => t.task_code === "A1000");
  const excavate = tables.TASK.find((t) => t.task_code === "A1010");
  assert.strictEqual(clearSite.status_code, "TK_Complete");
  assert.strictEqual(excavate.status_code, "TK_Active");
  assert.strictEqual(excavate.cstr_type, "CS_MSOA", "SNET -> CS_MSOA");
  assert.strictEqual(excavate.cstr_date, "2026-03-08 08:00");
  assert.strictEqual(clearSite.cstr_type, "", "no constraint_type -> no fabricated cstr_type");
  assert.strictEqual(excavate.act_end_date, "", "a blank actual_finish must not fabricate a date");
});

check("relationships resolve to the correct minted task_ids, with reverse-mapped type and exact lag", () => {
  const clearSiteId = tables.TASK.find((t) => t.task_code === "A1000").task_id;
  const excavateId = tables.TASK.find((t) => t.task_code === "A1010").task_id;
  const milestoneId = tables.TASK.find((t) => t.task_code === "A1020").task_id;

  const rel1 = tables.TASKPRED.find((r) => r.task_id === excavateId);
  assert.strictEqual(rel1.pred_task_id, clearSiteId);
  assert.strictEqual(rel1.pred_type, "PR_FS");
  assert.strictEqual(rel1.lag_hr_cnt, "0");

  const rel2 = tables.TASKPRED.find((r) => r.task_id === milestoneId);
  assert.strictEqual(rel2.pred_task_id, excavateId);
  assert.strictEqual(rel2.pred_type, "PR_SS");
  assert.strictEqual(rel2.lag_hr_cnt, "16", "2 days * 8 hr/day = 16 hours");
});

check("the calendar carries name/day_hr_cnt/week_hr_cnt but no fabricated clndr_data", () => {
  assert.strictEqual(tables.CALENDAR[0].clndr_name, "Standard");
  assert.strictEqual(tables.CALENDAR[0].day_hr_cnt, "8");
  assert.strictEqual(tables.CALENDAR[0].week_hr_cnt, "40");
  assert.ok(!("clndr_data" in tables.CALENDAR[0]));
});

check("a tab or newline inside a name is stripped, not left to corrupt the file structure", () => {
  const xerWithTab = svc.exportScheduleToXer({
    schedule: { name: "Weird\tName\nWith Breaks" },
    wbsItems: [],
    activities: [],
    relationships: [],
    calendar: null,
  });
  const t = parseTablesRaw(xerWithTab);
  assert.ok(!/\t\t|\n/.test(t.PROJECT[0].proj_short_name));
  assert.strictEqual(xerWithTab.split("\n").filter((l) => l.startsWith("%R\t") && l.indexOf("PROJ") !== -1).length, 1);
});

check("a cyclic parent_wbs_id chain does not hang the export (defensive cycle guard)", () => {
  const cyclicWbs = [
    { id: "wbs_a", code: "1", name: "A", parent_wbs_id: "wbs_b", level: 0 },
    { id: "wbs_b", code: "2", name: "B", parent_wbs_id: "wbs_a", level: 0 },
  ];
  const cyclicXer = svc.exportScheduleToXer({ schedule: { name: "Cyclic" }, wbsItems: cyclicWbs, activities: [], relationships: [], calendar: null });
  const t = parseTablesRaw(cyclicXer);
  assert.strictEqual((t.PROJWBS || []).length, 0, "neither node is reachable from a root, so zero WBS rows, not an infinite loop");
});

check("two activities sharing the same external_id still get distinct, non-colliding task_codes on export", () => {
  const dupXer = svc.exportScheduleToXer({
    schedule: { name: "Dup Codes" },
    wbsItems: [],
    activities: [
      { id: "act_a", wbs_id: null, name: "First", activity_type: "task", status: "not_started", duration: 1, planned_start: "2026-01-01", planned_finish: "2026-01-02", external_id: "SAME" },
      { id: "act_b", wbs_id: null, name: "Second", activity_type: "task", status: "not_started", duration: 1, planned_start: "2026-01-01", planned_finish: "2026-01-02", external_id: "SAME" },
    ],
    relationships: [],
    calendar: null,
  });
  const t = parseTablesRaw(dupXer);
  const codes = t.TASK.map((r) => r.task_code);
  assert.strictEqual(new Set(codes).size, 2, "both rows must keep distinct task_codes");
});

// ---------------------------------------------------------------------------
// Round trip: export -> reimport via this same file's parseXer() -> compare.
// ---------------------------------------------------------------------------
const reimported = svc.parseXer(xer);

check("round trip: no errors, and only the expected calendar-pattern-not-decoded warning", () => {
  assert.deepStrictEqual(reimported.errors, []);
  assert.strictEqual(reimported.warnings.length, 1);
  assert.ok(reimported.warnings[0].message.indexOf("not decoded yet") !== -1);
});

check("round trip: all four activities survive with names, WBS assignment, durations, dates, progress, actuals, and constraint intact", () => {
  const byExternalId = {};
  reimported.activities.forEach((a) => {
    byExternalId[a.external_id] = a;
  });
  assert.strictEqual(reimported.activities.length, 4);

  assert.strictEqual(byExternalId["A1000"].wbs_code, "1");
  assert.strictEqual(byExternalId["A1000"].duration, 5);
  assert.strictEqual(byExternalId["A1000"].percent_complete, 100);
  assert.strictEqual(byExternalId["A1000"].actual_finish, "2026-03-05");

  assert.strictEqual(byExternalId["A1010"].duration, 10);
  assert.strictEqual(byExternalId["A1010"].remaining_duration, 5);
  assert.strictEqual(byExternalId["A1010"].percent_complete, 50);
  assert.strictEqual(byExternalId["A1010"].constraint_type, "SNET");
  assert.strictEqual(byExternalId["A1010"].constraint_date, "2026-03-08");

  assert.strictEqual(byExternalId["A1020"].activity_type, "milestone");
});

check("round trip: WBS hierarchy, relationship types/lag, and the Calendar all survive", () => {
  assert.strictEqual(reimported.wbsEntries.length, 1);
  assert.strictEqual(reimported.wbsEntries[0].code, "1");
  assert.strictEqual(reimported.wbsEntries[0].name, "Sitework");

  assert.strictEqual(reimported.relationships.length, 2);
  const ssRel = reimported.relationships.find((r) => r.type === "SS");
  assert.ok(ssRel);
  assert.strictEqual(ssRel.lag, 2);

  assert.ok(reimported.calendar);
  assert.strictEqual(reimported.calendar.name, "Standard");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
