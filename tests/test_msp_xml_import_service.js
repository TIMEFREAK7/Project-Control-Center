// PCC Architecture Upgrade Phase 2 — standalone Node test for
// mspXmlImportService.js's parseMspXml(). Same eval-the-real-file approach as
// test_schedule_import_service.js, using jsdom's DOMParser (verified to support
// application/xml parsing, including a <parsererror> element on malformed input).
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

// A minimal but realistic MSPDI document: a project summary task (ID 0, skipped), two
// WBS Summary tasks (1, 2), four leaf tasks under them with a full mix of what the
// importer is meant to preserve — durations, dates, a milestone, actual dates/progress,
// a constraint, FS/SS relationships (one with lag), and a default Calendar with a
// Saturday/Sunday non-working pattern plus one holiday exception.
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>Sample Construction Programme</Name>
  <CalendarUID>1</CalendarUID>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <WeekDays>
        <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
        <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>3</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>4</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>5</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>6</DayType><DayWorking>1</DayWorking></WeekDay>
        <WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
        <WeekDay>
          <DayType>0</DayType>
          <DayWorking>0</DayWorking>
          <TimePeriod><FromDate>2026-01-01T00:00:00</FromDate><ToDate>2026-01-01T00:00:00</ToDate></TimePeriod>
        </WeekDay>
      </WeekDays>
      <Exceptions>
        <Exception>
          <DayWorking>0</DayWorking>
          <TimePeriod><FromDate>2026-01-01T00:00:00</FromDate><ToDate>2026-01-01T00:00:00</ToDate></TimePeriod>
        </Exception>
      </Exceptions>
    </Calendar>
  </Calendars>
  <Tasks>
    <Task>
      <UID>0</UID><ID>0</ID><Name>Sample Construction Programme</Name><Summary>1</Summary>
    </Task>
    <Task>
      <UID>1</UID><ID>1</ID><Name>Sitework</Name><WBS>1</WBS><OutlineLevel>1</OutlineLevel><Summary>1</Summary>
    </Task>
    <Task>
      <UID>2</UID><ID>2</ID><Name>Foundations</Name><WBS>2</WBS><OutlineLevel>1</OutlineLevel><Summary>1</Summary>
    </Task>
    <Task>
      <UID>10</UID><ID>3</ID><Name>Clear Site</Name><WBS>1.1</WBS><OutlineLevel>2</OutlineLevel>
      <Duration>PT40H0M0S</Duration><Start>2026-01-05T08:00:00</Start><Finish>2026-01-09T17:00:00</Finish>
      <PercentComplete>100</PercentComplete><ActualStart>2026-01-05T08:00:00</ActualStart><ActualFinish>2026-01-09T17:00:00</ActualFinish>
    </Task>
    <Task>
      <UID>11</UID><ID>4</ID><Name>Excavate</Name><WBS>1.2</WBS><OutlineLevel>2</OutlineLevel>
      <Duration>PT80H0M0S</Duration><RemainingDuration>PT40H0M0S</RemainingDuration>
      <Start>2026-01-12T08:00:00</Start><Finish>2026-01-21T17:00:00</Finish><PercentComplete>50</PercentComplete>
      <ActualStart>2026-01-12T08:00:00</ActualStart>
      <PredecessorLink><PredecessorUID>10</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
    <Task>
      <UID>20</UID><ID>5</ID><Name>Pour Foundations</Name><WBS>2.1</WBS><OutlineLevel>2</OutlineLevel>
      <Duration>PT24H0M0S</Duration><Start>2026-01-22T08:00:00</Start><Finish>2026-01-24T17:00:00</Finish>
      <PercentComplete>0</PercentComplete><ConstraintType>4</ConstraintType><ConstraintDate>2026-01-22T08:00:00</ConstraintDate>
      <PredecessorLink><PredecessorUID>11</PredecessorUID><Type>1</Type><LinkLag>20</LinkLag></PredecessorLink>
    </Task>
    <Task>
      <UID>21</UID><ID>6</ID><Name>Foundations Complete</Name><WBS>2.2</WBS><OutlineLevel>2</OutlineLevel>
      <Duration>PT0H0M0S</Duration><Milestone>1</Milestone><Start>2026-01-24T17:00:00</Start><Finish>2026-01-24T17:00:00</Finish>
      <PredecessorLink><PredecessorUID>20</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
  </Tasks>
</Project>`;

function loadService() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  global.window = dom.window;
  global.DOMParser = dom.window.DOMParser;
  const excelSrc = fs.readFileSync(path.join(__dirname, "..", "src", "js", "scheduleImportService.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(excelSrc);
  const mspSrc = fs.readFileSync(path.join(__dirname, "..", "src", "js", "mspXmlImportService.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(mspSrc);
  return dom.window.PCC.mspXmlImportService;
}

const svc = loadService();

check("parseIsoDurationHours() handles hours, days, and combined forms", () => {
  assert.strictEqual(svc.parseIsoDurationHours("PT8H0M0S"), 8);
  assert.strictEqual(svc.parseIsoDurationHours("PT40H0M0S"), 40);
  assert.strictEqual(svc.parseIsoDurationHours("P1DT0H0M0S"), 24);
  assert.strictEqual(svc.parseIsoDurationHours(""), null);
  assert.strictEqual(svc.parseIsoDurationHours("not a duration"), null);
});

check("RELATIONSHIP_TYPE_MAP and CONSTRAINT_TYPE_MAP match the documented MSPDI enumerations", () => {
  assert.deepStrictEqual(svc.RELATIONSHIP_TYPE_MAP, { 0: "FF", 1: "FS", 2: "SF", 3: "SS" });
  assert.strictEqual(svc.CONSTRAINT_TYPE_MAP[4], "SNET");
});

const result = svc.parseMspXml(SAMPLE_XML);

check("parses without errors and imports exactly the four leaf tasks (project summary + two WBS Summary tasks excluded)", () => {
  assert.deepStrictEqual(result.errors, [], "unexpected errors: " + JSON.stringify(result.errors));
  assert.strictEqual(result.activities.length, 4);
  assert.deepStrictEqual(result.activities.map((a) => a.external_id).sort(), ["10", "11", "20", "21"]);
});

check("WBS Summary tasks become wbsEntries with correct code/name/hierarchy, not activities", () => {
  assert.strictEqual(result.wbsEntries.length, 2);
  const sitework = result.wbsEntries.find((w) => w.code === "1");
  const foundations = result.wbsEntries.find((w) => w.code === "2");
  assert.ok(sitework && foundations);
  assert.strictEqual(sitework.name, "Sitework");
  assert.strictEqual(sitework.parent_code, null, "a single-segment WBS code has no parent");
});

check("each leaf activity is linked to its parent WBS Summary task's code", () => {
  const clearSite = result.activities.find((a) => a.external_id === "10");
  const pourFoundations = result.activities.find((a) => a.external_id === "20");
  assert.strictEqual(clearSite.wbs_code, "1");
  assert.strictEqual(pourFoundations.wbs_code, "2");
});

check("durations converted from hours to days assuming an 8-hour day", () => {
  const clearSite = result.activities.find((a) => a.external_id === "10");
  const excavate = result.activities.find((a) => a.external_id === "11");
  assert.strictEqual(clearSite.duration, 5, "PT40H0M0S -> 40/8 = 5 days");
  assert.strictEqual(excavate.duration, 10, "PT80H0M0S -> 80/8 = 10 days");
  assert.strictEqual(excavate.remaining_duration, 5, "PT40H0M0S remaining -> 5 days");
});

check("dates, percent complete, and actual start/finish are preserved", () => {
  const clearSite = result.activities.find((a) => a.external_id === "10");
  assert.strictEqual(clearSite.planned_start, "2026-01-05");
  assert.strictEqual(clearSite.planned_finish, "2026-01-09");
  assert.strictEqual(clearSite.actual_start, "2026-01-05");
  assert.strictEqual(clearSite.actual_finish, "2026-01-09");
  assert.strictEqual(clearSite.percent_complete, 100);

  const excavate = result.activities.find((a) => a.external_id === "11");
  assert.strictEqual(excavate.actual_start, "2026-01-12");
  assert.strictEqual(excavate.actual_finish, "", "no ActualFinish element -> blank, not fabricated");
  assert.strictEqual(excavate.percent_complete, 50);
});

check("Milestone flag maps to activity_type 'milestone', everything else to 'task'", () => {
  const milestone = result.activities.find((a) => a.external_id === "21");
  const task = result.activities.find((a) => a.external_id === "10");
  assert.strictEqual(milestone.activity_type, "milestone");
  assert.strictEqual(task.activity_type, "task");
});

check("ConstraintType/ConstraintDate map to short codes, and ASAP/ALAP-style tasks carry no constraint_date", () => {
  const pourFoundations = result.activities.find((a) => a.external_id === "20");
  assert.strictEqual(pourFoundations.constraint_type, "SNET");
  assert.strictEqual(pourFoundations.constraint_date, "2026-01-22");

  const clearSite = result.activities.find((a) => a.external_id === "10");
  assert.strictEqual(clearSite.constraint_type, "", "no <ConstraintType> element at all -> blank");
});

check("relationships resolve PredecessorUID to external_id, with correct type, and zero lag needs no warning", () => {
  const excavateRel = result.relationships.find((r) => r.successor_external_id === "11");
  assert.ok(excavateRel);
  assert.strictEqual(excavateRel.predecessor_external_id, "10");
  assert.strictEqual(excavateRel.type, "FS");
  assert.strictEqual(excavateRel.lag, 0);
  assert.strictEqual(result.relationships.length, 3);
});

check("non-zero LinkLag is converted assuming tenths-of-a-day, with a per-relationship warning", () => {
  const pourRel = result.relationships.find((r) => r.successor_external_id === "20");
  assert.strictEqual(pourRel.lag, 2, "LinkLag 20 / 10 = 2 days");
  assert.ok(
    result.warnings.some((w) => w.message.indexOf("Lag on a relationship into Task UID 20") !== -1 && w.message.indexOf("day-based units") !== -1),
    "expected a lag-unit-assumption warning naming the affected task"
  );
});

check("a summary warning notes the 8-hour-day duration assumption exactly once (not once per task)", () => {
  const durationWarnings = result.warnings.filter((w) => w.message.indexOf("hour-based format assuming an 8-hour working day") !== -1);
  assert.strictEqual(durationWarnings.length, 1);
});

check("the default Calendar is parsed: Sunday/Saturday non-working per the file, and the exception date becomes a holiday", () => {
  assert.ok(result.calendar);
  assert.strictEqual(result.calendar.name, "Standard");
  // MSPDI DayType 1=Sunday -> PCC index 6; DayType 7=Saturday -> PCC index 5. Both
  // marked DayWorking=0 in the fixture; everything else (Mon-Fri) stays working.
  assert.deepStrictEqual(result.calendar.working_days, [true, true, true, true, true, false, false]);
  assert.ok(result.calendar.holidays.indexOf("2026-01-01") !== -1);
});

check("summary counts match: 4 imported, at least the two documented assumption warnings, zero errors, zero circular relationships", () => {
  assert.strictEqual(result.summary.imported, 4);
  assert.strictEqual(result.summary.errors, 0);
  assert.strictEqual(result.summary.circular_relationships_skipped, 0);
  assert.strictEqual(result.summary.warnings, result.warnings.length);
});

// ---------------------------------------------------------------------------
// Error paths: malformed/unrecognized/empty input never throws, always reports.
// ---------------------------------------------------------------------------
check("malformed (non-well-formed) XML reports a parse error, not a thrown exception", () => {
  const bad = svc.parseMspXml("<Project><Tasks><Task></Project>");
  assert.strictEqual(bad.activities.length, 0);
  assert.ok(bad.errors.length > 0);
  assert.ok(bad.errors[0].message.indexOf("not well-formed") !== -1);
});

check("well-formed XML that isn't a Project file reports a clear error", () => {
  const notProject = svc.parseMspXml("<SomethingElse><Foo>bar</Foo></SomethingElse>");
  assert.strictEqual(notProject.activities.length, 0);
  assert.ok(notProject.errors[0].message.indexOf("<Project> root element") !== -1);
});

check("a Project file with no Task entries reports a clear error", () => {
  const noTasks = svc.parseMspXml("<Project><Tasks></Tasks></Project>");
  assert.ok(noTasks.errors[0].message.indexOf("nothing to import") !== -1);
});

check("a Task with an unrecognized relationship type code falls back to Finish-to-Start with a warning", () => {
  const xml = `<Project><Tasks>
    <Task><UID>1</UID><ID>1</ID><Name>A</Name><Duration>PT8H0M0S</Duration></Task>
    <Task><UID>2</UID><ID>2</ID><Name>B</Name><Duration>PT8H0M0S</Duration>
      <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>99</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
  </Tasks></Project>`;
  const r = svc.parseMspXml(xml);
  assert.strictEqual(r.relationships[0].type, "FS");
  assert.ok(r.warnings.some((w) => w.message.indexOf('unrecognized relationship type code "99"') !== -1));
});

check("a relationship referencing a WBS Summary task's UID is skipped with a distinct warning", () => {
  const xml = `<Project><Tasks>
    <Task><UID>1</UID><ID>1</ID><Name>Summary A</Name><WBS>1</WBS><Summary>1</Summary></Task>
    <Task><UID>2</UID><ID>2</ID><Name>Leaf B</Name><WBS>1.1</WBS><Duration>PT8H0M0S</Duration>
      <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
  </Tasks></Project>`;
  const r = svc.parseMspXml(xml);
  assert.strictEqual(r.relationships.length, 0);
  assert.ok(r.warnings.some((w) => w.message.indexOf("WBS Summary rollup") !== -1));
});

check("a task self-referencing as its own predecessor is skipped with a warning, same as the Excel importer's rule", () => {
  const xml = `<Project><Tasks>
    <Task><UID>1</UID><ID>1</ID><Name>A</Name><Duration>PT8H0M0S</Duration>
      <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
  </Tasks></Project>`;
  const r = svc.parseMspXml(xml);
  assert.strictEqual(r.relationships.length, 0);
  assert.ok(r.warnings.some((w) => w.message.indexOf("own predecessor") !== -1));
});

check("a circular chain of relationships is detected and skipped (reuses scheduleImportService's shared graph-cycle logic)", () => {
  const xml = `<Project><Tasks>
    <Task><UID>1</UID><ID>1</ID><Name>A</Name><Duration>PT8H0M0S</Duration>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
    <Task><UID>2</UID><ID>2</ID><Name>B</Name><Duration>PT8H0M0S</Duration>
      <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
  </Tasks></Project>`;
  const r = svc.parseMspXml(xml);
  assert.strictEqual(r.relationships.length, 0);
  assert.strictEqual(r.summary.circular_relationships_skipped, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
