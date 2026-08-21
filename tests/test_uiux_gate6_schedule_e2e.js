// End-to-end jsdom test against the ACTUAL bundled index.html for UI/UX Overhaul Gate 6
// (Schedule — third module of "Existing Modules, one at a time"). Inspection found
// Schedule already the most mature module in the app (a real Gantt with a full filter
// toolbar, zoom, jump buttons, and a legend; clean Baselines/What-If tabs) — the one real
// gap was the Activities tab (the flat list view), which only had a text-search box, with
// no way to filter by WBS/status/critical there even though the Gantt tab a few clicks
// away already computes all three. Confirmed with Aditya via AskUserQuestion before
// building: add WBS/status/critical filter controls to the Activities tab toolbar only,
// nothing else.
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

function findButtonByText(dom, text, root) {
  const scope = root || dom.window.document;
  return Array.from(scope.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
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
  // The Activities tab toolbar is the SECOND .toolbar on the page — the first is the
  // schedule bar's own project/schedule select + action-button row.
  const actToolbar = () => outlet().querySelectorAll(".toolbar")[1];

  var projId, schedId, wbsFoundationId, wbsStructureId;
  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("seed a project/schedule with activities spanning WBS/status/critical-float", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Riverside Tower", status: "at_risk" });
      d.projects.push(p);
      projId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: p.id, name: "Baseline Schedule Rev 0" });
      d.schedules.push(s);
      schedId = s.id;

      var wbsFoundation = win.PCC.store.newWbsItem({ project_id: p.id, schedule_id: s.id, code: "01", name: "Foundations" });
      var wbsStructure = win.PCC.store.newWbsItem({ project_id: p.id, schedule_id: s.id, code: "02", name: "Structure" });
      d.wbs_items.push(wbsFoundation, wbsStructure);
      wbsFoundationId = wbsFoundation.id;
      wbsStructureId = wbsStructure.id;

      d.activities.push(
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, wbs_id: wbsFoundation.id, name: "Excavation", activity_type: "task", status: "complete", total_float: 0, planned_start: "2026-08-01", planned_finish: "2026-08-10" }),
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, wbs_id: wbsFoundation.id, name: "Foundation Pour", activity_type: "task", status: "in_progress", total_float: 0, planned_start: "2026-08-11", planned_finish: "2026-08-20" }),
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, wbs_id: wbsStructure.id, name: "Steel Erection", activity_type: "task", status: "not_started", total_float: 5, planned_start: "2026-08-21", planned_finish: "2026-09-15" }),
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, wbs_id: wbsStructure.id, name: "Structure Complete", activity_type: "milestone", status: "not_started", total_float: null, planned_start: "2026-09-15", planned_finish: "2026-09-15" })
      );
    });
    win.PCC.schedule.viewProject(projId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var actBtn = Array.from(outlet().querySelectorAll(".tab-btn")).find((b) => b.textContent.trim() === "Activities");
    assert.ok(actBtn);
    actBtn.click();
    assert.ok(projId && schedId && wbsFoundationId && wbsStructureId);
  });

  await check("the Activities tab toolbar has search, WBS filter, status filter, and a critical-only checkbox", () => {
    var toolbar = actToolbar();
    assert.ok(toolbar, "activities filter toolbar not found");
    assert.ok(toolbar.querySelector("input[type=text]"), "search input not found");
    var selects = toolbar.querySelectorAll("select");
    assert.strictEqual(selects.length, 2, "expected WBS and status selects");
    assert.ok(toolbar.querySelector("input[type=checkbox]"), "critical-only checkbox not found");
  });

  await check("'Clear Filters' is hidden with no filters active", () => {
    var clearBtn = findButtonByText(dom, "Clear Filters", actToolbar());
    assert.ok(clearBtn, "Clear Filters button must exist in the DOM even when hidden");
    assert.strictEqual(clearBtn.style.display, "none");
  });

  await check("all four activities show with no filter applied", () => {
    var rows = outlet().querySelectorAll(".data-table tbody tr");
    assert.strictEqual(rows.length, 4);
  });

  await check("filtering by WBS narrows the list to that WBS item's activities, and 'Clear Filters' appears", () => {
    var wbsSelect = Array.from(actToolbar().querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent.indexOf("Structure") !== -1)
    );
    assert.ok(wbsSelect, "WBS filter select not found");
    wbsSelect.value = wbsStructureId;
    wbsSelect.dispatchEvent(new win.Event("change"));

    var rows = outlet().querySelectorAll(".data-table tbody tr");
    assert.strictEqual(rows.length, 2);
    assert.ok(outlet().textContent.indexOf("Steel Erection") !== -1);
    assert.ok(outlet().textContent.indexOf("Excavation") === -1);

    var clearBtn = findButtonByText(dom, "Clear Filters", actToolbar());
    assert.notStrictEqual(clearBtn.style.display, "none", "Clear Filters must appear once a filter is active");

    wbsSelect = Array.from(actToolbar().querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent.indexOf("Structure") !== -1)
    );
    wbsSelect.value = "";
    wbsSelect.dispatchEvent(new win.Event("change"));
  });

  await check("filtering by status narrows the list correctly", () => {
    var statusSelect = Array.from(actToolbar().querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "In Progress")
    );
    assert.ok(statusSelect, "status filter select not found");
    statusSelect.value = "in_progress";
    statusSelect.dispatchEvent(new win.Event("change"));

    var rows = outlet().querySelectorAll(".data-table tbody tr");
    assert.strictEqual(rows.length, 1);
    assert.ok(outlet().textContent.indexOf("Foundation Pour") !== -1);

    statusSelect = Array.from(actToolbar().querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "In Progress")
    );
    statusSelect.value = "";
    statusSelect.dispatchEvent(new win.Event("change"));
  });

  await check("the 'Critical only' checkbox narrows to activities with total_float <= 0", () => {
    var checkbox = actToolbar().querySelector("input[type=checkbox]");
    assert.ok(checkbox);
    checkbox.checked = true;
    checkbox.dispatchEvent(new win.Event("change"));

    var rows = outlet().querySelectorAll(".data-table tbody tr");
    // Excavation (float 0) and Foundation Pour (float 0) are critical; Steel Erection
    // (float 5) and the milestone (float null) are not.
    assert.strictEqual(rows.length, 2);
    assert.ok(outlet().textContent.indexOf("Excavation") !== -1);
    assert.ok(outlet().textContent.indexOf("Foundation Pour") !== -1);
    assert.ok(outlet().textContent.indexOf("Steel Erection") === -1);

    checkbox = actToolbar().querySelector("input[type=checkbox]");
    checkbox.checked = false;
    checkbox.dispatchEvent(new win.Event("change"));
  });

  await check("typing in search alone also makes 'Clear Filters' appear (the exact staleness bug this gate caught before shipping)", () => {
    var searchInput = actToolbar().querySelector("input[type=text]");
    searchInput.value = "Steel";
    searchInput.dispatchEvent(new win.Event("input"));

    var rows = outlet().querySelectorAll(".data-table tbody tr");
    assert.strictEqual(rows.length, 1);
    assert.ok(outlet().textContent.indexOf("Steel Erection") !== -1);

    var clearBtn = findButtonByText(dom, "Clear Filters", actToolbar());
    assert.notStrictEqual(clearBtn.style.display, "none", "Clear Filters must appear from a search-only change, without a full toolbar rebuild");
  });

  await check("a search/filter with zero matches shows the correct empty state, not a crash", () => {
    var searchInput = actToolbar().querySelector("input[type=text]");
    searchInput.value = "nonexistent-activity-xyz";
    searchInput.dispatchEvent(new win.Event("input"));
    assert.ok(outlet().textContent.indexOf("No activities match this search/filter.") !== -1);
  });

  await check("clicking 'Clear Filters' resets search/WBS/status/critical together and hides the button again", () => {
    var clearBtn = findButtonByText(dom, "Clear Filters", actToolbar());
    clearBtn.click();

    var rows = outlet().querySelectorAll(".data-table tbody tr");
    assert.strictEqual(rows.length, 4, "all activities must show again after clearing");

    var freshClearBtn = findButtonByText(dom, "Clear Filters", actToolbar());
    assert.strictEqual(freshClearBtn.style.display, "none");
    assert.strictEqual(actToolbar().querySelector("input[type=text]").value, "");
    assert.strictEqual(actToolbar().querySelector("input[type=checkbox]").checked, false);
  });

  await check("the Gantt tab's own filtering/legend/Today+Data Date markers still render without throwing", () => {
    thrownErrors.length = 0;
    var ganttBtn = Array.from(outlet().querySelectorAll(".tab-btn")).find((b) => b.textContent.trim() === "Gantt");
    ganttBtn.click();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(outlet().querySelector("svg"), "Gantt chart must still render");
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.schedules.length, 1);
    assert.strictEqual(data.activities.length, 4);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "projectWorkspace",
    "executiveCenter", "vendors", "vendorPerformanceCentre", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "delayRecoveryDashboard", "risks",
    "meetings", "rfis", "changeOrders", "decisionRegister", "lessonsLearned", "knowledgeBase",
    "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Schedule Activities filter addition", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
