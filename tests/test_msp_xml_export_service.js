// PCC Architecture Upgrade Phase 2 (export half) — standalone Node test for
// mspXmlService.js's exportScheduleToMspXml(). Verifies the XML shape directly, and
// round-trips the output back through the same file's parseMspXml() to confirm PCC's
// own import/export are mutually consistent — see mspXmlService.js's own header for
// why that is NOT the same claim as "Microsoft Project itself accepts this file"
// (no MS Project installation is available to test against in this environment).
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
  global.DOMParser = dom.window.DOMParser;
  const excelSrc = fs.readFileSync(path.join(__dirname, "..", "src", "js", "scheduleImportService.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(excelSrc);
  const mspSrc = fs.readFileSync(path.join(__dirname, "..", "src", "js", "mspXmlService.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(mspSrc);
  return { svc: dom.window.PCC.mspXmlService, DOMParser: dom.window.DOMParser };
}

const { svc, DOMParser } = loadService();

// A schedule with one WBS group, three activities (one milestone, one with actuals/
// progress/a constraint), a lagged relationship chain, and a Saturday/Sunday-off
// calendar with one holiday — exercises every field the export function handles.
const WBS_ITEMS = [{ id: "wbs_1", code: "1", name: "Sitework", parent_wbs_id: null, level: 0 }];
const ACTIVITIES = [
  { id: "act_1", wbs_id: "wbs_1", name: "Clear Site", activity_type: "task", duration: 5, remaining_duration: null, planned_start: "2026-03-01", planned_finish: "2026-03-05", actual_start: "", actual_finish: "", percent_complete: 0, constraint_type: "", constraint_date: "" },
  { id: "act_2", wbs_id: "wbs_1", name: "Excavate", activity_type: "task", duration: 10, remaining_duration: 5, planned_start: "2026-03-08", planned_finish: "2026-03-19", actual_start: "2026-03-08", actual_finish: "", percent_complete: 50, constraint_type: "SNET", constraint_date: "2026-03-08" },
  { id: "act_3", wbs_id: "wbs_1", name: "Milestone A", activity_type: "milestone", duration: 0, remaining_duration: null, planned_start: "2026-03-19", planned_finish: "2026-03-19", actual_start: "", actual_finish: "", percent_complete: 0, constraint_type: "", constraint_date: "" },
  { id: "act_orphan", wbs_id: null, name: "Unassigned Task", activity_type: "task", duration: 2, remaining_duration: null, planned_start: "2026-03-01", planned_finish: "2026-03-02", actual_start: "", actual_finish: "", percent_complete: 0, constraint_type: "", constraint_date: "" },
];
const RELATIONSHIPS = [
  { predecessor_id: "act_1", successor_id: "act_2", type: "FS", lag: 0 },
  { predecessor_id: "act_2", successor_id: "act_3", type: "SS", lag: 2 },
];
const CALENDAR = { name: "Standard", working_days: [true, true, true, true, true, false, false], holidays: ["2026-03-15"] };

const xml = svc.exportScheduleToMspXml({
  schedule: { name: "Round-Trip Test Schedule" },
  wbsItems: WBS_ITEMS,
  activities: ACTIVITIES,
  relationships: RELATIONSHIPS,
  calendar: CALENDAR,
});

check("produces well-formed XML with a <Project> root element", () => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  assert.strictEqual(doc.getElementsByTagName("parsererror").length, 0, "output must be well-formed XML");
  assert.strictEqual(doc.documentElement.tagName, "Project");
});

check("emits one Task per WBS Summary item and per activity, in outline order with correct OutlineLevel/WBS", () => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const tasks = Array.from(doc.getElementsByTagName("Task"));
  assert.strictEqual(tasks.length, 5, "1 WBS Summary + 4 activities (3 under it + 1 orphan)");
  const sitework = tasks.find((t) => t.getElementsByTagName("Name")[0].textContent === "Sitework");
  assert.strictEqual(sitework.getElementsByTagName("Summary")[0].textContent, "1");
  assert.strictEqual(sitework.getElementsByTagName("WBS")[0].textContent, "1");
  assert.strictEqual(sitework.getElementsByTagName("OutlineLevel")[0].textContent, "1");

  const clearSite = tasks.find((t) => t.getElementsByTagName("Name")[0].textContent === "Clear Site");
  assert.strictEqual(clearSite.getElementsByTagName("WBS")[0].textContent, "1.1");
  assert.strictEqual(clearSite.getElementsByTagName("OutlineLevel")[0].textContent, "2");

  const orphan = tasks.find((t) => t.getElementsByTagName("Name")[0].textContent === "Unassigned Task");
  assert.strictEqual(orphan.getElementsByTagName("WBS").length, 0, "an unassigned activity gets no fabricated WBS field");
  assert.strictEqual(orphan.getElementsByTagName("OutlineLevel")[0].textContent, "1");
});

check("durations are exported as hour-based PT-durations using the same 8-hour-day convention as import", () => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const tasks = Array.from(doc.getElementsByTagName("Task"));
  const excavate = tasks.find((t) => t.getElementsByTagName("Name")[0].textContent === "Excavate");
  assert.strictEqual(excavate.getElementsByTagName("Duration")[0].textContent, "PT80H0M0S", "10 days * 8 = 80 hours");
  assert.strictEqual(excavate.getElementsByTagName("RemainingDuration")[0].textContent, "PT40H0M0S", "5 days remaining * 8 = 40 hours");
});

check("Milestone flag, percent complete, actual dates, and a constraint are emitted correctly", () => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const tasks = Array.from(doc.getElementsByTagName("Task"));
  const milestone = tasks.find((t) => t.getElementsByTagName("Name")[0].textContent === "Milestone A");
  assert.strictEqual(milestone.getElementsByTagName("Milestone")[0].textContent, "1");

  const excavate = tasks.find((t) => t.getElementsByTagName("Name")[0].textContent === "Excavate");
  assert.strictEqual(excavate.getElementsByTagName("PercentComplete")[0].textContent, "50");
  assert.strictEqual(excavate.getElementsByTagName("ActualStart")[0].textContent, "2026-03-08T08:00:00");
  assert.strictEqual(excavate.getElementsByTagName("ActualFinish").length, 0, "a blank actual_finish must not fabricate an element");
  assert.strictEqual(excavate.getElementsByTagName("ConstraintType")[0].textContent, "4", "SNET -> code 4");
  assert.strictEqual(excavate.getElementsByTagName("ConstraintDate")[0].textContent, "2026-03-08T08:00:00");

  const clearSite = tasks.find((t) => t.getElementsByTagName("Name")[0].textContent === "Clear Site");
  assert.strictEqual(clearSite.getElementsByTagName("ConstraintType").length, 0, "no constraint_type -> no fabricated ConstraintType element");
});

check("relationships are emitted as PredecessorLink with the correct reverse type code and LinkLag in tenths-of-a-day, tagged LagFormat=7 (Days)", () => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const tasks = Array.from(doc.getElementsByTagName("Task"));
  const excavate = tasks.find((t) => t.getElementsByTagName("Name")[0].textContent === "Excavate");
  const excavateLink = excavate.getElementsByTagName("PredecessorLink")[0];
  assert.strictEqual(excavateLink.getElementsByTagName("Type")[0].textContent, "1", "FS -> code 1");
  assert.strictEqual(excavateLink.getElementsByTagName("LinkLag")[0].textContent, "0");

  const milestone = tasks.find((t) => t.getElementsByTagName("Name")[0].textContent === "Milestone A");
  const milestoneLink = milestone.getElementsByTagName("PredecessorLink")[0];
  assert.strictEqual(milestoneLink.getElementsByTagName("Type")[0].textContent, "3", "SS -> code 3");
  assert.strictEqual(milestoneLink.getElementsByTagName("LinkLag")[0].textContent, "20", "2 days * 10 = 20 (tenths)");
  assert.strictEqual(milestoneLink.getElementsByTagName("LagFormat")[0].textContent, "7");
});

check("the Calendar is exported with correctly reverse-mapped DayType codes and one Exception per holiday", () => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const calendar = doc.getElementsByTagName("Calendar")[0];
  assert.strictEqual(calendar.getElementsByTagName("Name")[0].textContent, "Standard");
  const weekDays = Array.from(calendar.getElementsByTagName("WeekDay"));
  assert.strictEqual(weekDays.length, 7);
  const sunday = weekDays.find((w) => w.getElementsByTagName("DayType")[0].textContent === "1");
  const saturday = weekDays.find((w) => w.getElementsByTagName("DayType")[0].textContent === "7");
  const monday = weekDays.find((w) => w.getElementsByTagName("DayType")[0].textContent === "2");
  assert.strictEqual(sunday.getElementsByTagName("DayWorking")[0].textContent, "0");
  assert.strictEqual(saturday.getElementsByTagName("DayWorking")[0].textContent, "0");
  assert.strictEqual(monday.getElementsByTagName("DayWorking")[0].textContent, "1");
  const exceptions = doc.getElementsByTagName("Exception");
  assert.strictEqual(exceptions.length, 1);
  assert.strictEqual(exceptions[0].getElementsByTagName("FromDate")[0].textContent, "2026-03-15T00:00:00");
});

check("no Calendar input produces no <Calendars> block at all, not an empty/broken one", () => {
  const noCalXml = svc.exportScheduleToMspXml({
    schedule: { name: "No Calendar" },
    wbsItems: [],
    activities: [ACTIVITIES[0]],
    relationships: [],
    calendar: null,
  });
  const doc = new DOMParser().parseFromString(noCalXml, "application/xml");
  assert.strictEqual(doc.getElementsByTagName("parsererror").length, 0);
  assert.strictEqual(doc.getElementsByTagName("Calendars").length, 0);
});

check("a cyclic parent_wbs_id chain does not hang the export (defensive cycle guard)", () => {
  const cyclicWbs = [
    { id: "wbs_a", code: "1", name: "A", parent_wbs_id: "wbs_b", level: 0 },
    { id: "wbs_b", code: "2", name: "B", parent_wbs_id: "wbs_a", level: 0 },
  ];
  const cyclicXml = svc.exportScheduleToMspXml({
    schedule: { name: "Cyclic" },
    wbsItems: cyclicWbs,
    activities: [],
    relationships: [],
    calendar: null,
  });
  // Neither WBS item has a real root (parent_wbs_id "__root__"), so a correct cycle
  // guard means both are simply never reachable from the walk — zero Tasks emitted,
  // not an infinite loop and not a crash.
  const doc = new DOMParser().parseFromString(cyclicXml, "application/xml");
  assert.strictEqual(doc.getElementsByTagName("Task").length, 0);
});

// ---------------------------------------------------------------------------
// Round trip: export -> reimport via this same file's parseMspXml() -> compare.
// This proves PCC's own import/export are mutually consistent for every field each
// side handles — it does NOT prove real Microsoft Project accepts the file (no MS
// Project installation available to verify against in this environment).
// ---------------------------------------------------------------------------
const reimported = svc.parseMspXml(xml);

check("round trip: no errors, and exactly the three expected warnings (duration assumption + lag assumption + the genuinely-unassigned orphan activity)", () => {
  assert.deepStrictEqual(reimported.errors, []);
  assert.strictEqual(reimported.warnings.length, 3);
  assert.ok(reimported.warnings.some((w) => w.message.indexOf("hour-based format") !== -1));
  assert.ok(reimported.warnings.some((w) => w.message.indexOf("day-based units") !== -1));
  assert.ok(
    reimported.warnings.some((w) => w.message.indexOf('"Unassigned Task"') !== -1),
    "the one activity that was genuinely unassigned in the original data should still be flagged unassigned after the round trip, not silently attached to a WBS group it never belonged to"
  );
});

check("round trip: all four activities survive with names, WBS assignment, durations, dates, progress, actuals, and constraint intact", () => {
  const byName = {};
  reimported.activities.forEach((a) => {
    byName[a.name] = a;
  });
  assert.strictEqual(reimported.activities.length, 4);
  assert.strictEqual(byName["Clear Site"].wbs_code, "1");
  assert.strictEqual(byName["Clear Site"].duration, 5);
  assert.strictEqual(byName["Clear Site"].planned_start, "2026-03-01");
  assert.strictEqual(byName["Clear Site"].planned_finish, "2026-03-05");

  assert.strictEqual(byName["Excavate"].duration, 10);
  assert.strictEqual(byName["Excavate"].remaining_duration, 5);
  assert.strictEqual(byName["Excavate"].percent_complete, 50);
  assert.strictEqual(byName["Excavate"].actual_start, "2026-03-08");
  assert.strictEqual(byName["Excavate"].constraint_type, "SNET");
  assert.strictEqual(byName["Excavate"].constraint_date, "2026-03-08");

  assert.strictEqual(byName["Milestone A"].activity_type, "milestone");
  assert.strictEqual(byName["Unassigned Task"].wbs_code, null);
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
  assert.deepStrictEqual(reimported.calendar.working_days, [true, true, true, true, true, false, false]);
  assert.deepStrictEqual(reimported.calendar.holidays, ["2026-03-15"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
