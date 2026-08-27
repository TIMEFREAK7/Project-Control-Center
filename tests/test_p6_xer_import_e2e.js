// PCC Architecture Upgrade Phase 3 — DOM-level e2e test against the real bundled
// index.html, same convention as test_msp_xml_import_e2e.js: proves the real
// upload -> review -> commit flow for a Primavera P6 XER file wires together in
// schedule.js, including source_platform/calendar/"Edit Excel" gating.
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

const SAMPLE_XER = [
  "ERMHDR\t21.12\t2026-08-27\tProject\tadmin\t\t\t\t\t",
  "%T\tCALENDAR",
  "%F\tclndr_id\tdefault_flag\tclndr_name\tproj_id\tday_hr_cnt",
  "%R\t100\tY\tStandard\tPROJ1\t8",
  "%T\tPROJECT",
  "%F\tproj_id\tproj_short_name",
  "%R\tPROJ1\tXER E2E Sample",
  "%T\tPROJWBS",
  "%F\twbs_id\tproj_id\twbs_short_name\twbs_name\tparent_wbs_id\tseq_num",
  "%R\tW1\tPROJ1\t1\tSitework\t\t1",
  "%T\tTASK",
  "%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\ttarget_start_date\ttarget_end_date",
  "%R\tT1\tPROJ1\tW1\t100\tA1000\tClear Site\tTT_Task\tTK_NotStart\t40\t40\t2026-02-02 08:00\t2026-02-06 17:00",
  "%R\tT2\tPROJ1\tW1\t100\tA1010\tExcavate\tTT_Task\tTK_NotStart\t80\t80\t2026-02-09 08:00\t2026-02-18 17:00",
  "%T\tTASKPRED",
  "%F\ttask_pred_id\tproj_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
  "%R\tP1\tPROJ1\tT2\tT1\tPR_FS\t0",
  "%E",
].join("\n");

function uploadXerFile(win, fileInput, xerText, filename) {
  const file = new win.File([xerText], filename, { type: "application/octet-stream" });
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

  await check("seed a project, navigate to Schedule, and upload a Primavera P6 XER file", async () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_xer_e2e_1", name: "XER E2E Test Project", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;
    });
    win.PCC.projectContext.set(projectId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();

    var importBtn = findButtonByText(win, "Import Schedule");
    assert.ok(importBtn, "'Import Schedule' button not found");
    importBtn.click();

    var fileInput = outlet().querySelector('input[type="file"]');
    assert.ok(fileInput, "file input not found on the 'pick' step");
    assert.ok(fileInput.accept.indexOf(".xer") !== -1, "file input must accept .xer");
    uploadXerFile(win, fileInput, SAMPLE_XER, "sample-programme.xer");

    await waitFor(() => outlet().textContent.indexOf("Parsed 2 row(s)") !== -1);
    assert.ok(outlet().textContent.indexOf("2 activities will be imported") !== -1, outlet().textContent.slice(0, 300));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("confirming the import creates a schedule with source_platform 'p6_xer', correct activities/relationships/WBS, and a new Calendar", async () => {
    var confirmBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.indexOf("Confirm Import") === 0);
    assert.ok(confirmBtn, "Confirm Import button not found");
    confirmBtn.click();
    await flush();

    var data = win.PCC.store.get();
    var schedule = data.schedules.find((s) => s.project_id === projectId);
    assert.ok(schedule, "expected a new schedule to have been created");

    assert.strictEqual(schedule.source_platform, "p6_xer");
    assert.strictEqual(schedule.source_format, "xer");
    assert.strictEqual(schedule.source_file_name, "sample-programme.xer");

    var activities = data.activities.filter((a) => a.schedule_id === schedule.id);
    assert.strictEqual(activities.length, 2);
    var clearSite = activities.find((a) => a.external_id === "A1000");
    var excavate = activities.find((a) => a.external_id === "A1010");
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
    assert.ok(calendar, "expected the file's calendar to have been imported");
    assert.strictEqual(clearSite.calendar_id, calendar.id);
    assert.strictEqual(excavate.calendar_id, calendar.id);

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Edit Excel' stays disabled for a P6-XER-imported schedule, even though it has a source_file_name", async () => {
    win.PCC.projectContext.set(projectId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    await flush();

    var editExcelBtn = findButtonByText(win, "Edit Excel");
    assert.ok(editExcelBtn, "'Edit Excel' button not found");
    assert.strictEqual(editExcelBtn.disabled, true);
  });

  await check("every route still renders without throwing after the P6 XER import feature", async () => {
    var routes = [
      "dashboard", "actionCentre", "myWork", "portfolio", "executiveCenter", "vendors",
      "documents", "dailylog", "schedule", "projectLookahead", "risks", "meetings", "rfis",
      "changeOrders", "cost", "resources", "reports", "settings", "delayRecoveryDashboard",
    ];
    routes.forEach(function (r) {
      win.PCC.router.go(r);
      win.PCC.router.render();
    });
    await flush();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
