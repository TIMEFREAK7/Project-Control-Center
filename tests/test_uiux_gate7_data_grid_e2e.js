// End-to-end jsdom test against the ACTUAL bundled index.html for UI/UX Overhaul Gate 7
// (Desktop/Laptop Productivity — Better Data Grids, the second of Gate 7's five
// brief-listed capabilities). Aditya picked Schedule Activities as the first module to
// convert — it matches the brief's own literal example table ("ID | Activity | Start |
// Finish | Duration | Progress | Float | Status") almost field-for-field — and chose the
// fuller scope (sorting + sticky header + horizontal scroll + column visibility + a
// frozen first column) over a smaller core-three-only slice.
//
// Inspection before building found .data-table/.data-table--sticky-header (CSS reserved
// for "better data grids") had exactly one real caller in the whole app — Portfolio's
// Compare view — with none of sorting/column-visibility/frozen-columns actually built
// anywhere. Every other dense list, including Schedule Activities itself (already
// touched in Gate 6 for its filter toolbar), was still the .detail-card flex-row
// pattern, not a real <table>.
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
  const grid = () => outlet().querySelector(".data-table");
  const headerLabels = () =>
    Array.from(grid().querySelectorAll("thead th")).map((th) => th.textContent.replace(/[▲▼]/g, "").trim());
  const bodyRows = () => Array.from(grid().querySelectorAll("tbody tr"));

  var projId, wbsFoundationId, wbsStructureId;
  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("seed a project/schedule with activities spanning WBS/float/dates for grid checks", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Riverside Tower", status: "at_risk" });
      d.projects.push(p);
      projId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: p.id, name: "Baseline Schedule Rev 0" });
      d.schedules.push(s);

      var wbsFoundation = win.PCC.store.newWbsItem({ project_id: p.id, schedule_id: s.id, code: "01", name: "Foundations" });
      var wbsStructure = win.PCC.store.newWbsItem({ project_id: p.id, schedule_id: s.id, code: "02", name: "Structure" });
      d.wbs_items.push(wbsFoundation, wbsStructure);
      wbsFoundationId = wbsFoundation.id;
      wbsStructureId = wbsStructure.id;

      d.activities.push(
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, wbs_id: wbsFoundation.id, name: "Excavation", activity_type: "task", status: "complete", total_float: 0, planned_start: "2026-08-01", planned_finish: "2026-08-10", percent_complete: 100, physical_progress: 95 }),
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, wbs_id: wbsFoundation.id, name: "Foundation Pour", activity_type: "task", status: "in_progress", total_float: 0, planned_start: "2026-08-11", planned_finish: "2026-08-20", percent_complete: 40, is_out_of_sequence: true }),
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, wbs_id: wbsStructure.id, name: "Steel Erection", activity_type: "task", status: "not_started", total_float: 5, planned_start: "2026-08-21", planned_finish: "2026-09-15" }),
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, wbs_id: wbsStructure.id, name: "Structure Complete", activity_type: "milestone", status: "not_started", total_float: null, planned_start: "2026-09-15", planned_finish: "2026-09-15" })
      );
    });
    win.PCC.schedule.viewProject(projId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var actBtn = Array.from(outlet().querySelectorAll(".tab-btn")).find((b) => b.textContent.trim() === "Activities");
    actBtn.click();
    assert.ok(projId && wbsFoundationId && wbsStructureId);
  });

  await check("the Activities tab is a real <table class='data-table data-table--sticky-header data-table--frozen-first-col'> with all 7 optional columns visible by default", () => {
    assert.ok(grid(), "expected a real <table class='data-table'>");
    assert.ok(grid().classList.contains("data-table--sticky-header"));
    assert.ok(grid().classList.contains("data-table--frozen-first-col"));
    assert.deepStrictEqual(headerLabels(), ["Activity", "", "WBS", "Type", "Start", "Finish", "% Complete", "Float", "Status", ""]);
    assert.strictEqual(bodyRows().length, 4);
  });

  await check("Out of Sequence shows as an inline warning marker on the Activity cell, not a separate badge column", () => {
    var row = bodyRows().find((r) => r.textContent.indexOf("Foundation Pour") !== -1);
    assert.ok(row);
    assert.ok(row.cells[0].textContent.indexOf("⚠") !== -1, "expected the out-of-sequence marker on the name cell");
  });

  await check("clicking the Float column header sorts ascending, then descending, treating an unset float as the least-critical end either way", () => {
    var floatTh = Array.from(grid().querySelectorAll("thead th")).find((th) => th.textContent.indexOf("Float") !== -1);
    var sortBtn = floatTh.querySelector(".data-table__sort-btn");
    assert.ok(sortBtn);

    sortBtn.click();
    var namesAsc = bodyRows().map((r) => r.cells[0].textContent.replace("⚠", "").trim());
    assert.deepStrictEqual(namesAsc, ["Excavation", "Foundation Pour", "Steel Erection", "Structure Complete"], "ascending: 0, 0, 5, then the unset float last");
    // renderList() rebuilds the table on every sort click, so the ORIGINAL floatTh
    // reference above is now a detached node — re-query the live header for the arrow.
    var floatThAfterAsc = Array.from(grid().querySelectorAll("thead th")).find((th) => th.textContent.indexOf("Float") !== -1);
    assert.ok(floatThAfterAsc.textContent.indexOf("▲") !== -1, "ascending arrow must show on the active sort column");

    floatThAfterAsc.querySelector(".data-table__sort-btn").click();
    var namesDesc = bodyRows().map((r) => r.cells[0].textContent.replace("⚠", "").trim());
    assert.deepStrictEqual(namesDesc, ["Structure Complete", "Steel Erection", "Excavation", "Foundation Pour"], "descending: the unset float first, then 5, then the two 0s in their original relative order (stable sort)");
  });

  await check("clicking the Activity column header sorts back to a clean alphabetical order", () => {
    var nameTh = Array.from(grid().querySelectorAll("thead th"))[0];
    nameTh.querySelector(".data-table__sort-btn").click();
    var names = bodyRows().map((r) => r.cells[0].textContent.replace("⚠", "").trim());
    assert.deepStrictEqual(names, ["Excavation", "Foundation Pour", "Steel Erection", "Structure Complete"]);
  });

  await check("the WBS/status/critical filters from Gate 6 still narrow the grid's rows correctly", () => {
    var toolbar = outlet().querySelectorAll(".toolbar")[1];
    var wbsSelect = Array.from(toolbar.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent.indexOf("Structure") !== -1)
    );
    wbsSelect.value = wbsStructureId;
    wbsSelect.dispatchEvent(new win.Event("change"));
    assert.strictEqual(bodyRows().length, 2);
    wbsSelect = Array.from(outlet().querySelectorAll(".toolbar")[1].querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent.indexOf("Structure") !== -1)
    );
    wbsSelect.value = "";
    wbsSelect.dispatchEvent(new win.Event("change"));
    assert.strictEqual(bodyRows().length, 4, "clearing the filter must restore all rows");
  });

  await check("the 'Columns' menu hides and re-shows a column, and never offers to hide Activity or Actions", () => {
    var columnsBtn = findButtonByText(dom, "Columns", outlet());
    assert.ok(columnsBtn);
    columnsBtn.click();

    var checkItems = Array.from(outlet().querySelectorAll(".card-menu__checkbox-item"));
    var labels = checkItems.map((i) => i.textContent.trim());
    assert.deepStrictEqual(labels, ["WBS", "Type", "Start", "Finish", "% Complete", "Float", "Status"], "Activity and Actions must never be offered as hideable");

    var typeItem = checkItems.find((i) => i.textContent.trim() === "Type");
    typeItem.querySelector("input").click();

    assert.ok(headerLabels().indexOf("Type") === -1, "Type column must be gone from the header once hidden");
    assert.strictEqual(bodyRows()[0].cells.length, 9, "one fewer <td> per row once a column is hidden (was 10: name+select+7+actions)");

    // The menu itself stays open — toggling a checkbox only rerenders the grid, not the
    // menu's own open/closed state — so re-show by finding the (still-open) checklist
    // again directly, not by clicking "Columns" a second time (which would close it).
    var typeItem2 = Array.from(outlet().querySelectorAll(".card-menu__checkbox-item")).find((i) => i.textContent.trim() === "Type");
    assert.ok(typeItem2, "the column menu must still be open after toggling one checkbox");
    typeItem2.querySelector("input").click();
    assert.ok(headerLabels().indexOf("Type") !== -1, "Type column must be back after re-checking it");

    // Close the menu so later checks in this file don't have to account for it still
    // being open (its own overlay button closes it, same as every other .card-menu).
    outlet().querySelector(".card-menu__overlay").click();
    assert.strictEqual(outlet().querySelector(".card-menu__dropdown"), null, "columns menu must be closed");
  });

  await check("the row-level '⋯' menu opens with Edit/Clone/Delete, and Edit opens the activity form", () => {
    var row = bodyRows().find((r) => r.cells[0].textContent.indexOf("Excavation") !== -1);
    var menuBtn = row.querySelector('.icon-btn[aria-label="More actions"]');
    assert.ok(menuBtn, "row menu toggle not found");
    menuBtn.click();

    // menuBtn.click() rerenders the whole tab, so the row reference above is now
    // detached — re-find it, and scope the dropdown lookup to it specifically (not the
    // whole outlet) so this can't accidentally match some other .card-menu on the page.
    var refreshedRow = bodyRows().find((r) => r.cells[0].textContent.indexOf("Excavation") !== -1);
    var dropdown = refreshedRow.querySelector(".card-menu__dropdown");
    assert.ok(dropdown, "dropdown must open on menu click");
    var items = Array.from(dropdown.querySelectorAll(".card-menu__item")).map((b) => b.textContent.trim());
    assert.deepStrictEqual(items, ["Edit", "Clone", "Delete"]);

    var editItem = Array.from(dropdown.querySelectorAll(".card-menu__item")).find((b) => b.textContent.trim() === "Edit");
    editItem.click();
    assert.ok(outlet().textContent.indexOf("Edit Activity") !== -1, "edit form must open");
    assert.strictEqual(outlet().querySelector(".card-menu__dropdown"), null, "menu must close once Edit is clicked");
    findButtonByText(dom, "Cancel").click();
  });

  await check("declining the delete confirm leaves the row and the grid intact", () => {
    var originalConfirm = win.confirm;
    win.confirm = () => false;
    try {
      var beforeCount = win.PCC.store.get().activities.length;
      var row = bodyRows().find((r) => r.cells[0].textContent.indexOf("Excavation") !== -1);
      row.querySelector('.icon-btn[aria-label="More actions"]').click();
      var deleteItem = Array.from(outlet().querySelectorAll(".card-menu__item")).find((b) => b.textContent.trim() === "Delete");
      deleteItem.click();
      assert.strictEqual(win.PCC.store.get().activities.length, beforeCount, "no activity should be deleted when the confirm is declined");
    } finally {
      win.confirm = originalConfirm;
    }
  });

  await check("a search/filter with zero matches still shows the correct empty state, not a broken/empty table", () => {
    var toolbar = outlet().querySelectorAll(".toolbar")[1];
    var searchInput = toolbar.querySelector("input[type=text]");
    searchInput.value = "nonexistent-activity-xyz";
    searchInput.dispatchEvent(new win.Event("input"));
    assert.ok(outlet().textContent.indexOf("No activities match this search/filter.") !== -1);
    assert.strictEqual(outlet().querySelector(".data-table"), null, "no table should render for a zero-match filter");
    searchInput.value = "";
    searchInput.dispatchEvent(new win.Event("input"));
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
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
    await check("route '" + routes[i] + "' renders without throwing after the Schedule Activities data grid conversion", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
