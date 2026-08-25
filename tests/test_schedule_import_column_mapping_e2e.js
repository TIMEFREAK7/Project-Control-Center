// Manual Column Mapping for Schedule Excel import — DOM-level e2e test against the real
// bundled index.html (not a reimplementation), same convention as
// test_schedule_gantt_e2e.js. scheduleImportService.js's own test file
// (test_schedule_import_service.js) covers the parsing/mapping logic directly; this file
// proves the real upload -> mapping -> review -> commit flow actually wires together in
// schedule.js, including the case where headers already match (no mapping step shown).
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

/** The Import Excel panel renders below Schedule's own project/schedule picker bar,
 * which has its own <select>s (project, schedule) — scoping to the panel itself avoids
 * off-by-N index mistakes when picking out the mapping step's own <select>s. */
function importPanel(win) {
  const heading = Array.from(win.document.querySelectorAll(".panel h3")).find(
    (h) => h.textContent === "Import Schedule from Excel"
  );
  return heading ? heading.closest(".panel") : null;
}

/** Builds a real .xlsx file (via the app's own bundled SheetJS) from a header row + data
 * rows, then delivers it through the actual <input type="file"> the same way a browser
 * would — jsdom supports File/FileReader/readAsArrayBuffer natively, so no stubbing
 * needed here (unlike readAsDataURL elsewhere in this app, per CLAUDE.md). */
function uploadWorkbook(win, fileInput, headers, dataRows, filename) {
  const sheet = win.XLSX.utils.aoa_to_sheet([headers].concat(dataRows));
  const workbook = win.XLSX.utils.book_new();
  win.XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const buffer = win.XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const file = new win.File([buffer], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fileInput.dispatchEvent(new win.Event("change"));
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
  // committing an import stores the uploaded file via blobStore.js's Gate 4 compression.
  // Reuse Node's own, the real implementation (same pattern test_schedule_excel_editor_e2e.js uses).
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
  await check("seed a project and navigate to Schedule, opening the Import Excel panel", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_colmap_1", name: "Column Mapping Test Project", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;
    });
    win.PCC.projectContext.set(projectId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();

    var importBtn = findButtonByText(win, "Import Excel");
    assert.ok(importBtn, "'Import Excel' button not found");
    importBtn.click();
    assert.ok(outlet().textContent.indexOf("Import Schedule from Excel") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("uploading a file whose headers already match PCC's expected names skips straight to the review step (no mapping step, no behavior change)", async () => {
    var fileInput = outlet().querySelector('input[type="file"]');
    assert.ok(fileInput, "file input not found on the 'pick' step");
    uploadWorkbook(
      win,
      fileInput,
      ["Activity ID", "Activity Name", "Planned Start"],
      [["A010", "Excavation", "2026-03-01"]],
      "matching-headers.xlsx"
    );
    await flush();
    assert.ok(outlet().textContent.indexOf("Parsed 1 row(s)") !== -1, "should land directly on the review step: " + outlet().textContent.slice(0, 200));
    assert.strictEqual(outlet().textContent.indexOf("MAPS TO PCC FIELD"), -1, "no mapping step for already-matching headers");

    // Cancel back to a clean 'pick' step for the next check.
    var cancelBtn = findButtonByText(win, "Cancel");
    cancelBtn.click();
    var reopenBtn = findButtonByText(win, "Import Excel");
    reopenBtn.click();
  });

  await check("uploading a file with unrecognized headers opens the manual column-mapping step, pre-filled with auto-detected guesses", async () => {
    var fileInput = outlet().querySelector('input[type="file"]');
    uploadWorkbook(
      win,
      fileInput,
      ["Item Ref", "Item Title", "Kickoff"],
      [["A010", "Excavation Works", "2026-03-01"]],
      "custom-headers.xlsx"
    );
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("MAPS TO PCC FIELD") !== -1, "expected the manual column-mapping step: " + text.slice(0, 300));
    assert.ok(text.indexOf("Item Ref") !== -1 && text.indexOf("Item Title") !== -1 && text.indexOf("Kickoff") !== -1, "all three uploaded column headers should be listed");
    assert.ok(text.indexOf("Excavation Works") !== -1, "a sample value from the uploaded data should be shown to help identify the column");
    assert.ok(text.indexOf("required") !== -1 || text.indexOf("isn't mapped") !== -1 || text.indexOf("aren't mapped") !== -1, "should warn that Activity ID/Activity Name aren't mapped yet");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("manually mapping each column and continuing produces a correctly-mapped review, and the resulting activity has the right field values on import", async () => {
    var selects = Array.from(importPanel(win).querySelectorAll("select"));
    // Order matches the header order the mapping table renders in.
    var itemRefSelect = selects[0];
    var itemTitleSelect = selects[1];
    var kickoffSelect = selects[2];

    itemRefSelect.value = "external_id";
    itemRefSelect.dispatchEvent(new win.Event("change"));
    itemTitleSelect.value = "name";
    itemTitleSelect.dispatchEvent(new win.Event("change"));
    kickoffSelect.value = "planned_start";
    kickoffSelect.dispatchEvent(new win.Event("change"));

    var continueBtn = findButtonByText(win, "Continue");
    assert.ok(continueBtn, "'Continue' button not found on the mapping step");
    assert.strictEqual(continueBtn.disabled, false, "no duplicate mappings, so Continue should be enabled");
    continueBtn.click();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Parsed 1 row(s)") !== -1, "should now be on the review step: " + text.slice(0, 300));
    assert.ok(text.indexOf("1 activities will be imported") !== -1, "the manually-mapped row should parse as one importable activity");

    var confirmBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.indexOf("Confirm Import") === 0);
    assert.ok(confirmBtn, "'Confirm Import' button not found");
    confirmBtn.click();
    await flush();

    var activity = win.PCC.store.get().activities.find((a) => a.project_id === projectId && a.external_id === "A010");
    assert.ok(activity, "expected an activity with external_id 'A010' to have been created");
    assert.strictEqual(activity.name, "Excavation Works");
    assert.strictEqual(activity.planned_start, "2026-03-01");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("choosing the same PCC field for two different columns is blocked with a clear error, not silently accepted", async () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var importBtn = findButtonByText(win, "Import Excel");
    importBtn.click();
    var fileInput = outlet().querySelector('input[type="file"]');
    uploadWorkbook(
      win,
      fileInput,
      ["Ref A", "Ref B"],
      [["X1", "X2"]],
      "duplicate-mapping.xlsx"
    );
    await flush();

    var selects = Array.from(importPanel(win).querySelectorAll("select"));
    selects[0].value = "external_id";
    selects[0].dispatchEvent(new win.Event("change"));
    selects[1].value = "external_id"; // same target as column 0 — must be rejected
    selects[1].dispatchEvent(new win.Event("change"));

    var text = outlet().textContent;
    assert.ok(text.indexOf("can only come from one column") !== -1, "expected a duplicate-mapping error message: " + text.slice(0, 300));
    var continueBtn = findButtonByText(win, "Continue");
    assert.strictEqual(continueBtn.disabled, true, "Continue must be disabled while two columns target the same field");

    // Fixing the duplicate re-enables Continue.
    selects[1].value = "";
    selects[1].dispatchEvent(new win.Event("change"));
    continueBtn = findButtonByText(win, "Continue");
    assert.strictEqual(continueBtn.disabled, false, "Continue should re-enable once the duplicate is resolved");
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
