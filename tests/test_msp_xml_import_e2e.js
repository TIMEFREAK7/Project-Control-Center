// PCC Architecture Upgrade Phase 2 — DOM-level e2e test against the real bundled
// index.html (not a reimplementation), same convention as
// test_schedule_import_column_mapping_e2e.js: proves the real upload -> review ->
// commit flow for a Microsoft Project XML file actually wires together in schedule.js,
// including the new source_platform/calendar/"Edit Excel" gating from this phase.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const INDEX_PATH = path.join(__dirname, "..", "index.html");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function flush() {
  for (let i = 0; i < 10; i++) await sleep(0);
}
/** FileReader.readAsArrayBuffer() in jsdom takes more real event-loop turns to settle
 * than the fixed-tick flush() above reliably covers for this XML upload path (unlike
 * the sibling Excel test's upload, this one measured as needing real time, not just
 * more microtask ticks) — poll with real waits instead of guessing a tick count. */
async function waitFor(conditionFn, timeoutMs) {
  timeoutMs = timeoutMs || 3000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (conditionFn()) return;
    await sleep(20);
  }
  throw new Error("waitFor() timed out after " + timeoutMs + "ms");
}

let passed = 0;
let failed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.stack || e.message);
  }
}

function findButtonByText(win, text) {
  const buttons = Array.from(win.document.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>MSP E2E Sample</Name>
  <CalendarUID>1</CalendarUID>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <WeekDays>
        <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
        <WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
      </WeekDays>
    </Calendar>
  </Calendars>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>MSP E2E Sample</Name><Summary>1</Summary></Task>
    <Task><UID>1</UID><ID>1</ID><Name>Sitework</Name><WBS>1</WBS><Summary>1</Summary></Task>
    <Task>
      <UID>10</UID><ID>2</ID><Name>Clear Site</Name><WBS>1.1</WBS>
      <Duration>PT40H0M0S</Duration><Start>2026-02-02T08:00:00</Start><Finish>2026-02-06T17:00:00</Finish>
      <PercentComplete>0</PercentComplete>
    </Task>
    <Task>
      <UID>11</UID><ID>3</ID><Name>Excavate</Name><WBS>1.2</WBS>
      <Duration>PT80H0M0S</Duration><Start>2026-02-09T08:00:00</Start><Finish>2026-02-18T17:00:00</Finish>
      <PercentComplete>0</PercentComplete>
      <PredecessorLink><PredecessorUID>10</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
  </Tasks>
</Project>`;

function uploadXmlFile(win, fileInput, xmlText, filename) {
  const file = new win.File([xmlText], filename, { type: "application/xml" });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  // schedule.js is React-migrated: React's synthetic "change" listener is delegated at
  // the root and relies on the native event actually bubbling — a dispatched event
  // without bubbles:true never reaches it (see CLAUDE.md's React migration notes on the
  // same pattern for select/input onChange).
  fileInput.dispatchEvent(new win.Event("change", { bubbles: true }));
}

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const thrownErrors = [];
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  dom.window.indexedDB = new FDBFactory();
  dom.window.CompressionStream = CompressionStream;
  dom.window.DecompressionStream = DecompressionStream;
  dom.window.Response = Response;
  dom.window.onerror = function (msg) {
    thrownErrors.push(msg);
  };

  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  let projectId;
  let newScheduleId;

  await check("seed a project, navigate to Schedule, and upload a Microsoft Project XML file", async () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_msp_e2e_1", name: "MSP E2E Test Project", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;
    });
    win.PCC.projectContext.set(projectId);
    win.PCC.router.go("schedule");
    await flush();

    var importBtn = findButtonByText(win, "Import Schedule");
    assert.ok(importBtn, "'Import Schedule' button not found");
    importBtn.click();
    await flush();

    var fileInput = outlet().querySelector('input[type="file"]');
    assert.ok(fileInput, "file input not found on the 'pick' step");
    uploadXmlFile(win, fileInput, SAMPLE_XML, "sample-programme.xml");
    // total_rows counts every <Task> element in the file, including the project-summary
    // row (UID 0) and the one WBS Summary task (UID 1) that don't become activities —
    // 4 total: UID 0, 1, 10, 11.
    await waitFor(() => outlet().textContent.indexOf("Parsed 4 row(s)") !== -1);

    assert.ok(outlet().textContent.indexOf("Parsed 4 row(s)") !== -1, "expected the reviewing step showing 4 Task rows parsed: " + outlet().textContent.slice(0, 300));
    assert.ok(outlet().textContent.indexOf("2 activities will be imported") !== -1, "1 Summary + 2 leaf tasks -> 2 activities: " + outlet().textContent.slice(0, 300));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("confirming the import creates a schedule with source_platform 'msp_xml', the right activities/relationships/WBS, and a new Calendar wired onto every activity", async () => {
    var confirmBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.indexOf("Confirm Import") === 0);
    assert.ok(confirmBtn, "Confirm Import button not found");
    confirmBtn.click();
    await flush();

    var data = win.PCC.store.get();
    var schedule = data.schedules.find((s) => s.project_id === projectId);
    assert.ok(schedule, "expected a new schedule to have been created");
    newScheduleId = schedule.id;

    assert.strictEqual(schedule.source_platform, "msp_xml");
    assert.strictEqual(schedule.source_format, "xml");
    assert.strictEqual(schedule.source_file_name, "sample-programme.xml");
    assert.strictEqual(schedule.schedule_type, "current");

    var activities = data.activities.filter((a) => a.schedule_id === schedule.id);
    assert.strictEqual(activities.length, 2);
    var clearSite = activities.find((a) => a.external_id === "10");
    var excavate = activities.find((a) => a.external_id === "11");
    assert.ok(clearSite && excavate);
    assert.strictEqual(clearSite.duration, 5);
    assert.strictEqual(excavate.duration, 10);

    var wbsItems = data.wbs_items.filter((w) => w.schedule_id === schedule.id);
    assert.strictEqual(wbsItems.length, 1);
    assert.strictEqual(wbsItems[0].code, "1");
    assert.strictEqual(clearSite.wbs_id, wbsItems[0].id);

    var relationships = data.relationships.filter((r) => r.schedule_id === schedule.id);
    assert.strictEqual(relationships.length, 1);
    assert.strictEqual(relationships[0].predecessor_id, clearSite.id);
    assert.strictEqual(relationships[0].successor_id, excavate.id);

    var calendar = data.calendars.find((c) => c.project_id === projectId && c.name === "Standard");
    assert.ok(calendar, "expected the file's default Calendar to have been imported");
    // Array.from(): calendar.working_days was built inside the jsdom vm realm, so a
    // direct deepStrictEqual against a plain Node-realm array literal fails on
    // cross-realm prototype identity even when every value matches — normalize first.
    assert.deepStrictEqual(Array.from(calendar.working_days), [true, true, true, true, true, false, false]);
    assert.strictEqual(clearSite.calendar_id, calendar.id, "every imported activity should be wired onto the new calendar");
    assert.strictEqual(excavate.calendar_id, calendar.id);

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Edit Excel' stays disabled for an MSP-XML-imported schedule, even though it has a source_file_name", async () => {
    win.PCC.projectContext.set(projectId);
    win.PCC.router.go("schedule");
    await flush();

    // The schedule picker defaults to the most recent schedule for the active project.
    var editExcelBtn = findButtonByText(win, "Edit Excel");
    assert.ok(editExcelBtn, "'Edit Excel' button not found");
    assert.strictEqual(editExcelBtn.disabled, true, "Edit Excel must stay disabled for a schedule that didn't come from Excel");
  });

  await check("every route still renders without throwing after the MSP XML import feature", async () => {
    var routes = [
      "dashboard", "actionCentre", "myWork", "portfolio", "executiveCenter", "vendors",
      "documents", "dailylog", "schedule", "projectLookahead", "risks", "meetings", "rfis",
      "changeOrders", "cost", "resources", "reports", "settings", "delayRecoveryDashboard",
    ];
    for (const r of routes) {
      win.PCC.router.go(r);
      await flush();
    }
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
