// PCC Architecture Upgrade Phase 3 (export half) — DOM-level e2e test against the real
// bundled index.html, proving the "Export to Primavera P6" button in schedule.js's
// toolbar wires together: gathers the selected schedule's WBS/Activities/
// Relationships/Calendar, calls p6XerService.exportScheduleToXer(), and hands the
// result to nativeFile.save() — same convention as test_msp_xml_export_e2e.js.
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
    thrownErrors.push(String(msg));
  };
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  let projectId;

  await check("seed a project with a schedule (WBS + activities + a relationship + a calendar) and navigate to Schedule", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_xer_export_1", name: "XER Export Test Project", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var calendar = win.PCC.store.newCalendar({ project_id: projectId, name: "Standard", is_default: true });
      data.calendars.push(calendar);

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "XER Export Test Schedule", status: "active" });
      data.schedules.push(schedule);

      var wbs = win.PCC.store.newWbsItem({ project_id: projectId, schedule_id: schedule.id, code: "1", name: "Sitework" });
      data.wbs_items.push(wbs);

      var act1 = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: schedule.id, wbs_id: wbs.id, name: "Clear Site",
        duration: 5, planned_start: "2026-04-01", planned_finish: "2026-04-05", calendar_id: calendar.id, external_id: "A1000",
      });
      var act2 = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: schedule.id, wbs_id: wbs.id, name: "Excavate",
        duration: 10, planned_start: "2026-04-08", planned_finish: "2026-04-19", calendar_id: calendar.id, external_id: "A1010",
      });
      data.activities.push(act1, act2);
      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: schedule.id, predecessor_id: act1.id, successor_id: act2.id, type: "FS", lag: 0 }));
    });

    win.PCC.projectContext.set(projectId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
  });

  await check("'Export to Primavera P6' is enabled once a schedule is selected, and produces a well-formed XER file via nativeFile.save()", async () => {
    var exportBtn = findButtonByText(win, "Export to Primavera P6");
    assert.ok(exportBtn, "'Export to Primavera P6' button not found");
    assert.strictEqual(exportBtn.disabled, false);

    var savedBlob = null;
    var savedFilename = null;
    var realSave = win.PCC.nativeFile.save;
    win.PCC.nativeFile.save = function (blob, filename) {
      savedBlob = blob;
      savedFilename = filename;
      return Promise.resolve();
    };

    exportBtn.click();
    await flush();

    win.PCC.nativeFile.save = realSave;

    assert.ok(savedBlob, "expected nativeFile.save() to have been called with a Blob");
    assert.strictEqual(savedFilename, "XER Export Test Schedule.xer");
    assert.strictEqual(savedBlob.type, "application/octet-stream");

    var xerText = await savedBlob.text();
    assert.strictEqual(xerText.split("\n")[0].split("\t")[0], "ERMHDR", "exported file must start with an ERMHDR line");
    assert.ok(xerText.indexOf("Clear Site") !== -1);
    assert.ok(xerText.indexOf("Excavate") !== -1);
    assert.ok(xerText.indexOf("%T\tCALENDAR") !== -1, "the schedule's calendar should be included");

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the exported file round-trips through this app's own P6 XER importer with no errors", async () => {
    var savedBlob = null;
    var realSave = win.PCC.nativeFile.save;
    win.PCC.nativeFile.save = function (blob) {
      savedBlob = blob;
      return Promise.resolve();
    };
    findButtonByText(win, "Export to Primavera P6").click();
    await flush();
    win.PCC.nativeFile.save = realSave;

    var xerText = await savedBlob.text();
    var reimported = win.PCC.p6XerService.parseXer(xerText);
    assert.strictEqual(reimported.errors.length, 0, "unexpected errors: " + JSON.stringify(reimported.errors));
    assert.strictEqual(reimported.activities.length, 2);
    assert.strictEqual(reimported.wbsEntries.length, 1);
    assert.strictEqual(reimported.relationships.length, 1);
    assert.ok(reimported.calendar);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
