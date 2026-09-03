// End-to-end jsdom smoke test against the ACTUAL bundled index.html (not a
// reimplementation) — same convention as test_schedule_baseline_e2e.js. Exercises the
// Gate 8 in-app Excel editor: seed a schedule that looks like it came from an Excel
// import (source_file_name set, an attached blob, activities with external_id, a WBS
// item, and a relationship), open "Edit Excel", edit a cell, add a row, review, and
// apply — then confirm the store's Activities/WBS/Relationships were updated in place
// (same schedule id, no new revision) and the attached blob was rewritten to match.
// Also covers the hand-added-activity safety gate: an activity with no external_id
// must block Apply until explicitly acknowledged.
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

function findButtonByText(dom, text) {
  const buttons = Array.from(dom.window.document.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}
// schedule.js is React-migrated: form fields are React-controlled, so a raw `.value =`
// assignment doesn't reliably reach onChange — see CLAUDE.md's React migration notes.
function setReactInputValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
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
  // jsdom doesn't implement CompressionStream/DecompressionStream/Response — needed since
  // Gate 4 (blobStore.js compression). Reuse Node's own, the real implementation.
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC && win.PCC.store, "window.PCC.store must exist after boot");
  });

  // ---- Seed a schedule that looks like it came from an Excel import: source_file_name
  // set, an attached blob (mirroring what commitImport now writes), two activities with
  // external_id, one WBS item, and an A010->A020 FS relationship. ----
  let projectId, scheduleId, act1Id, act2Id, wbsId;
  await check("seed a project + 'imported' schedule (source file, activities, WBS, relationship) via the store", async () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_excel_1", name: "Excel Editor Test Tower", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({
        project_id: projectId,
        name: "Excel Editor Test Schedule",
        revision_number: 0,
        status: "active",
        source_file_name: "test-schedule.xlsx",
        source_file_size: 1234,
      });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var wbs = win.PCC.store.newWbsItem({ project_id: projectId, schedule_id: scheduleId, code: "1", name: "Sitework", level: 0 });
      data.wbs_items.push(wbs);
      wbsId = wbs.id;

      var act1 = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, wbs_id: wbsId,
        name: "Excavate", external_id: "A010", duration: 5,
        planned_start: "2026-03-01", planned_finish: "2026-03-05",
      });
      var act2 = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, wbs_id: wbsId,
        name: "Backfill", external_id: "A020", duration: 3,
        planned_start: "2026-03-06", planned_finish: "2026-03-09",
      });
      data.activities.push(act1, act2);
      act1Id = act1.id;
      act2Id = act2.id;

      var rel = win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: act1Id, successor_id: act2Id, type: "FS", lag: 0 });
      data.relationships.push(rel);
    });

    await win.PCC.blobStore.putBlob(
      scheduleId,
      "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,ZmFrZQ=="
    );

    assert.ok(projectId && scheduleId && act1Id && act2Id);
  });

  await check("navigate to the schedule route and select the seeded schedule", async () => {
    win.PCC.projectContext.set(projectId);
    win.PCC.router.go("schedule");
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.innerHTML.length > 0, "schedule route should render content");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Edit Excel' is enabled for a schedule with a source file", () => {
    var btn = findButtonByText(dom, "Edit Excel");
    assert.ok(btn, "Edit Excel button not found");
    assert.strictEqual(btn.disabled, false, "Edit Excel should be enabled once an imported schedule is selected");
  });

  await check("clicking 'Edit Excel' opens a grid pre-populated from current Activities/WBS/Relationships", async () => {
    var btn = findButtonByText(dom, "Edit Excel");
    btn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    var idInput0 = win.document.getElementById("excelgrid-0-external_id");
    var idInput1 = win.document.getElementById("excelgrid-1-external_id");
    assert.ok(idInput0 && idInput1, "expected two grid rows for the two seeded activities");
    var ids = [idInput0.value, idInput1.value].sort();
    assert.deepStrictEqual(ids, ["A010", "A020"]);

    var predecessorsInput = win.document.getElementById("excelgrid-1-predecessors");
    assert.strictEqual(predecessorsInput.value, "A010", "A020's predecessors cell should show A010 (FS, no lag — bare id)");
    var wbsCodeInput = win.document.getElementById("excelgrid-0-wbs_code");
    assert.strictEqual(wbsCodeInput.value, "1");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("editing a cell, adding a row, reviewing, and applying updates the store in place", async () => {
    var nameInput0 = win.document.getElementById("excelgrid-0-name");
    setReactInputValue(win, nameInput0, "Excavate (Revised)");

    var addRowBtn = findButtonByText(dom, "+ Add Row");
    addRowBtn.click();
    await flush();

    var newIdInput = win.document.getElementById("excelgrid-2-external_id");
    assert.ok(newIdInput, "expected a third row after Add Row");
    assert.strictEqual(newIdInput.value, "NEW-1");
    setReactInputValue(win, newIdInput, "A030");
    setReactInputValue(win, win.document.getElementById("excelgrid-2-name"), "Third Activity");
    setReactInputValue(win, win.document.getElementById("excelgrid-2-duration"), "2");

    var reviewBtn = findButtonByText(dom, "Review Changes");
    reviewBtn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("3 activities will be applied") !== -1, "expected review summary for 3 activities, got: " + outlet.textContent.slice(0, 300));

    var applyBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim().indexOf("Apply to Schedule") === 0);
    assert.ok(applyBtn, "Apply to Schedule button not found");
    assert.strictEqual(applyBtn.disabled, false);
    applyBtn.click();
    await flush();

    var data = win.PCC.store.get();
    var schedules = data.schedules.filter((s) => s.id === scheduleId);
    assert.strictEqual(schedules.length, 1, "Apply must update the existing schedule, not create a new one");
    assert.strictEqual(schedules[0].revision_number, 0, "in-place Apply must not bump the revision number");

    var scheduleActivities = data.activities.filter((a) => a.schedule_id === scheduleId);
    assert.strictEqual(scheduleActivities.length, 3, "expected 2 edited + 1 added activity");
    var revised = scheduleActivities.find((a) => a.external_id === "A010");
    assert.ok(revised, "A010 should still exist after Apply");
    assert.strictEqual(revised.name, "Excavate (Revised)");
    var added = scheduleActivities.find((a) => a.external_id === "A030");
    assert.ok(added, "newly added A030 should have been created");
    assert.strictEqual(added.duration, 2);

    var storedBlob = await win.PCC.blobStore.getBlob(scheduleId);
    assert.ok(storedBlob && storedBlob.indexOf("base64,") !== -1, "attached file should have been rewritten");
    assert.notStrictEqual(storedBlob, "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,ZmFrZQ==", "blob should be the regenerated workbook, not the placeholder seeded above");

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the regenerated workbook is a real, properly formatted Excel file (ExcelJS), not a bare CSV-in-.xlsx grid", async () => {
    var storedBlob = await win.PCC.blobStore.getBlob(scheduleId);
    var base64 = storedBlob.split(",")[1];
    var binary = win.atob(base64);
    // Must build the typed array via win.Uint8Array (not the bare Node global) — ExcelJS
    // runs inside the jsdom window (evaluated via runScripts:"dangerously"), and its
    // internal JSZip does an `instanceof ArrayBuffer` environment check against the
    // WINDOW's own ArrayBuffer constructor; a Node-realm typed array's .buffer fails
    // that check even though the bytes are identical.
    var bytes = new win.Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    var workbook = new win.ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer);
    var sheet = workbook.getWorksheet("Schedule");
    assert.ok(sheet, "expected a 'Schedule' worksheet in the regenerated file");

    assert.strictEqual(sheet.getRow(1).font && sheet.getRow(1).font.bold, true, "header row must be bold");
    assert.ok(sheet.views && sheet.views[0] && sheet.views[0].state === "frozen" && sheet.views[0].ySplit === 1, "header row must be frozen (views[0]: " + JSON.stringify(sheet.views && sheet.views[0]) + ")");

    // Column order matches CANONICAL_HEADERS: external_id, name, activity_type, wbs_code,
    // wbs_name, duration, planned_start, planned_finish, ...
    // Array.from(): sheet.getRow(1).values is built inside the jsdom window realm, so a
    // direct deepStrictEqual against a plain Node-realm array literal fails on
    // cross-realm prototype identity even when every value matches — same gotcha
    // documented elsewhere in this suite (e.g. test_calendar_management_ui_e2e.js).
    var headerLabels = Array.from(sheet.getRow(1).values).slice(1);
    assert.deepStrictEqual(headerLabels, ["Activity ID", "Activity Name", "Activity Type", "WBS Code", "WBS Name", "Duration", "Planned Start", "Planned Finish", "Predecessors", "% Complete", "Discipline", "Contractor", "Responsible Person", "Status", "Notes"]);

    var row2 = sheet.getRow(2); // A010, "Excavate (Revised)"
    var plannedStartCell = row2.getCell(7);
    // win.Date, not the bare Node global: ExcelJS runs inside the jsdom window and
    // constructs its date cells with the WINDOW's own Date constructor, so a Node-realm
    // `instanceof Date` check fails even though the value genuinely is a Date instance —
    // same cross-realm gotcha as the Array.from() note above, just for Date.
    assert.ok(plannedStartCell.value instanceof win.Date, "Planned Start must be a real Excel date cell, not a date-look-alike string; got: " + JSON.stringify(plannedStartCell.value));
    assert.strictEqual(plannedStartCell.value.toISOString().slice(0, 10), "2026-03-01");
    assert.strictEqual(sheet.getColumn(7).numFmt, "yyyy-mm-dd");

    var percentCol = sheet.getColumn(10);
    assert.strictEqual(percentCol.numFmt, '0"%"', "% Complete column must have a real percent display format");

    assert.strictEqual(sheet.getColumn(2).width, 32, "Activity Name column should be widened for readability");
  });

  // ---- Hand-added-activity safety gate: an activity with no external_id must block
  // Apply until explicitly acknowledged, and is deleted once the user does so. ----
  let handAddedId;
  await check("hand-add an activity (no external_id) to the same schedule via the store", () => {
    win.PCC.store.update(function (data) {
      var handAdded = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Hand-added punch item",
      });
      data.activities.push(handAdded);
      handAddedId = handAdded.id;
    });
    var data = win.PCC.store.get();
    assert.ok(data.activities.some((a) => a.id === handAddedId && !a.external_id));
  });

  await check("re-opening Edit Excel and reviewing shows the hand-added-activity warning and blocks Apply", async () => {
    var editBtn = findButtonByText(dom, "Edit Excel");
    editBtn.click();
    await flush();
    var reviewBtn = findButtonByText(dom, "Review Changes");
    reviewBtn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("isn’t from the Excel file") !== -1, "expected the hand-added warning, got: " + outlet.textContent.slice(0, 400));
    var applyBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim().indexOf("Apply to Schedule") === 0);
    assert.ok(applyBtn.disabled, "Apply should be blocked until the hand-added-activity warning is acknowledged");
  });

  await check("acknowledging the warning and applying deletes the hand-added activity", async () => {
    var ackBtn = findButtonByText(dom, "Delete Them and Continue");
    assert.ok(ackBtn, "acknowledge button not found");
    ackBtn.click();
    await flush();

    var applyBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim().indexOf("Apply to Schedule") === 0);
    assert.strictEqual(applyBtn.disabled, false, "Apply should be enabled after acknowledging");
    applyBtn.click();
    await flush();

    var data = win.PCC.store.get();
    assert.ok(!data.activities.some((a) => a.id === handAddedId), "hand-added activity should have been deleted after acknowledged Apply");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every other page, matching the README's stated
  // convention, since this gate touches schedule.js and scheduleImportService.js which
  // every page's route render can transitively depend on via store.get(). ----
  var routes = ["dashboard", "portfolio", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Excel-editor gate", async () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
