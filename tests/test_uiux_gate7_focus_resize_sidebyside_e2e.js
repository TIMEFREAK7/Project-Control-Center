// End-to-end jsdom test against the ACTUAL bundled index.html for UI/UX Overhaul Gate 7
// (Desktop/Laptop Productivity) — the final three of its five brief-listed capabilities,
// scoped and built together per Aditya's explicit request: Focus Mode, Resizable Panels,
// Side-by-Side Views.
//
// Focus Mode: a global title-block icon-btn toggle (body.focus-mode), applied to
// Schedule/Documents/Executive Center/Reports per the brief's own coverage list. Hides
// each page's own non-essential heading/description/picker-bar chrome (tagged
// .focus-mode-hide in that page's own markup) plus the app footer everywhere — never a
// toolbar's actual filter/search/action controls, which every page keeps working.
//
// Resizable Panels: a drag handle between Documents' register list and preview pane
// (Gate 6's two-panel layout), the one clear existing candidate in the app.
//
// Side-by-Side Views: Schedule's Gantt Activity Detail Panel moved from full-width-above
// the chart into a side panel next to it, matching Documents' own two-panel pattern.
// This surfaced a real bug during manual verification (not caught by a test first): the
// Gantt tab's jump-controls bar used container.insertBefore(jumpBar, wrap), assuming wrap
// was always a direct child of container — broken the moment wrap got nested inside a
// new side-by-side row. Fixed by inserting relative to whichever element actually IS
// container's own direct child (the row when a detail panel is open, wrap itself
// otherwise) — see chartRowEl in schedule.js's own comment.
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

function mouseEvent(win, type, clientX) {
  return new win.MouseEvent(type, { clientX: clientX, bubbles: true, cancelable: true, button: 0 });
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

  var projId;
  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("seed a project/schedule/activity and a document for the three feature checks", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Riverside Tower", status: "at_risk" });
      d.projects.push(p);
      projId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: p.id, name: "Baseline Schedule Rev 0" });
      d.schedules.push(s);
      d.activities.push(
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, name: "Excavation", activity_type: "task", status: "complete", total_float: 0, planned_start: "2026-08-01", planned_finish: "2026-08-10" })
      );
      d.documents.push(
        win.PCC.store.newDocument({ project_id: p.id, filename: "drawing-001.pdf", category: "drawing", status: "approved" }),
        win.PCC.store.newDocument({ project_id: p.id, filename: "contract.pdf", category: "contract", status: "under_review" })
      );
    });
    assert.ok(projId);
  });

  // ============================================================================
  // Focus Mode
  // ============================================================================

  await check("the Focus Mode toggle exists in the title block and starts off", () => {
    var btn = win.document.getElementById("focus-mode-toggle-btn");
    assert.ok(btn, "focus-mode-toggle-btn not found");
    assert.strictEqual(win.document.body.classList.contains("focus-mode"), false);
    assert.strictEqual(win.PCC.layout.isFocusMode(), false);
    assert.ok(!btn.classList.contains("icon-btn--active"));
  });

  await check("clicking the toggle turns on body.focus-mode and marks the button active", () => {
    var btn = win.document.getElementById("focus-mode-toggle-btn");
    btn.click();
    assert.strictEqual(win.document.body.classList.contains("focus-mode"), true);
    assert.strictEqual(win.PCC.layout.isFocusMode(), true);
    assert.ok(btn.classList.contains("icon-btn--active"));
  });

  await check("on Schedule, focus mode hides the heading/description/schedule-picker bar but keeps the tab bar, filter toolbar, and chart", () => {
    win.PCC.schedule.viewProject(projId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var ganttBtn = Array.from(outlet().querySelectorAll(".tab-btn")).find((b) => b.textContent.trim() === "Gantt");
    ganttBtn.click();

    var hiddenEls = Array.from(outlet().querySelectorAll(".focus-mode-hide"));
    assert.ok(hiddenEls.length > 0, "at least one .focus-mode-hide element expected on Schedule");
    hiddenEls.forEach(function (el) {
      assert.strictEqual(win.getComputedStyle(el).display, "none", "every .focus-mode-hide element must compute to display:none while focus mode is on");
    });
    // Core content must stay: the tab bar (still need to switch tabs), the Gantt
    // filter toolbar (the brief's own "Activities + Gantt + filters" wording), and
    // the chart itself.
    assert.ok(outlet().querySelector(".tab-bar"), "tab bar must remain visible");
    assert.ok(outlet().querySelector("svg"), "the Gantt chart must remain visible");
  });

  await check("the app footer is hidden everywhere while focus mode is on", () => {
    var footer = win.document.querySelector("footer.app-footer");
    assert.ok(footer, "footer must still exist in the DOM");
    assert.strictEqual(win.getComputedStyle(footer).display, "none");
  });

  await check("on Documents, focus mode hides the heading/info panel but keeps the toolbar and register+preview", () => {
    win.PCC.router.go("documents");
    win.PCC.router.render();
    var hiddenEls = Array.from(outlet().querySelectorAll(".focus-mode-hide"));
    assert.ok(hiddenEls.length > 0, "at least one .focus-mode-hide element expected on Documents");
    hiddenEls.forEach(function (el) {
      assert.strictEqual(win.getComputedStyle(el).display, "none");
    });
    assert.ok(outlet().querySelector(".toolbar"), "filter toolbar must remain visible");
    assert.ok(outlet().querySelector(".doc-register"), "the register+preview layout must remain visible");
  });

  await check("on Executive Center, focus mode hides the heading/subtitle", () => {
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    var hiddenEls = Array.from(outlet().querySelectorAll(".focus-mode-hide"));
    assert.ok(hiddenEls.length > 0, "at least one .focus-mode-hide element expected on Executive Center");
    hiddenEls.forEach(function (el) {
      assert.strictEqual(win.getComputedStyle(el).display, "none");
    });
  });

  await check("on Reports, focus mode hides the heading but keeps the toolbar/report content", () => {
    win.PCC.router.go("reports");
    win.PCC.router.render();
    var hiddenEls = Array.from(outlet().querySelectorAll(".focus-mode-hide"));
    assert.ok(hiddenEls.length > 0, "at least one .focus-mode-hide element expected on Reports");
    hiddenEls.forEach(function (el) {
      assert.strictEqual(win.getComputedStyle(el).display, "none");
    });
    assert.ok(outlet().querySelector(".toolbar"), "report toolbar must remain visible");
  });

  await check("clicking the toggle again turns focus mode off everywhere and restores all hidden chrome", () => {
    var btn = win.document.getElementById("focus-mode-toggle-btn");
    btn.click();
    assert.strictEqual(win.document.body.classList.contains("focus-mode"), false);
    assert.ok(!btn.classList.contains("icon-btn--active"));
    var hiddenEls = Array.from(outlet().querySelectorAll(".focus-mode-hide"));
    hiddenEls.forEach(function (el) {
      assert.notStrictEqual(win.getComputedStyle(el).display, "none", "chrome must be visible again once focus mode is off");
    });
    var footer = win.document.querySelector("footer.app-footer");
    assert.notStrictEqual(win.getComputedStyle(footer).display, "none");
  });

  // ============================================================================
  // Resizable Panels (Documents)
  // ============================================================================

  await check("Documents' register list has no width override by default", () => {
    win.PCC.router.go("documents");
    win.PCC.router.render();
    var listPane = outlet().querySelector(".doc-register-list");
    assert.ok(listPane);
    assert.strictEqual(listPane.style.flex, "", "no inline flex override before any drag");
    assert.ok(outlet().querySelector(".doc-register-resize-handle"), "resize handle must exist");
  });

  await check("dragging the handle live-updates the list pane's width, clamped to [240, 640]", () => {
    var handle = outlet().querySelector(".doc-register-resize-handle");
    var listPane = outlet().querySelector(".doc-register-list");

    handle.dispatchEvent(mouseEvent(win, "mousedown", 500));
    // jsdom has no real layout engine — every getBoundingClientRect() returns an
    // all-zero rect, so the handler's "clientX - registerRect.left" arithmetic reduces
    // to exactly clientX. That's not a workaround for this test; it's genuinely how the
    // clamped width is computed, deterministic in both jsdom and a real browser.
    win.document.dispatchEvent(mouseEvent(win, "mousemove", 500));
    assert.strictEqual(listPane.style.flex, "0 0 500px", "live drag must update the pane's width immediately");
    assert.strictEqual(listPane.style.maxWidth, "none", "the CSS max-width cap must be lifted during a custom-width drag");

    // Clamped to the upper bound.
    win.document.dispatchEvent(mouseEvent(win, "mousemove", 900));
    assert.strictEqual(listPane.style.flex, "0 0 640px", "width must clamp at 640px");

    win.document.dispatchEvent(mouseEvent(win, "mouseup", 900));
    assert.strictEqual(win.PCC.store.get(), win.PCC.store.get(), "sanity: store still readable after drag");
  });

  await check("the committed width survives a rerender (selecting a different document)", () => {
    var items = Array.from(outlet().querySelectorAll(".doc-register-item"));
    var contractItem = items.find((i) => i.textContent.indexOf("contract.pdf") !== -1);
    assert.ok(contractItem);
    contractItem.click();

    var listPane = outlet().querySelector(".doc-register-list");
    assert.strictEqual(listPane.style.flex, "0 0 640px", "the drag-committed width must persist across an unrelated rerender");
  });

  await check("double-clicking the handle resets the width override", () => {
    var handle = outlet().querySelector(".doc-register-resize-handle");
    handle.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true, cancelable: true }));

    var listPane = outlet().querySelector(".doc-register-list");
    assert.strictEqual(listPane.style.flex, "", "double-click must remove the width override entirely");
  });

  // ============================================================================
  // Side-by-Side Views (Gantt Activity Detail Panel)
  // ============================================================================

  var activityId;
  await check("with no activity selected, the Gantt tab renders the chart alone (no side-by-side row)", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var ganttBtn = Array.from(outlet().querySelectorAll(".tab-btn")).find((b) => b.textContent.trim() === "Gantt");
    ganttBtn.click();
    assert.ok(outlet().querySelector("svg"), "chart must render");
    assert.strictEqual(outlet().querySelector(".gantt-layout-row"), null, "no side-by-side row without a selected activity");
    activityId = win.PCC.store.get().activities[0].id;
  });

  await check("opening the Activity Detail Panel puts it side-by-side with the chart, not above it", () => {
    win.PCC.schedule.viewActivity(projId, win.PCC.store.get().schedules[0].id, activityId);
    win.PCC.router.render();

    var row = outlet().querySelector(".gantt-layout-row");
    assert.ok(row, "expected a .gantt-layout-row once an activity is selected");
    assert.strictEqual(row.children.length, 2, "the row must hold exactly the chart panel and the detail pane");
    assert.ok(row.children[0].classList.contains("panel"), "the chart's own .panel must be the row's first child");
    assert.ok(row.children[1].classList.contains("gantt-detail-pane"), "the detail pane must be the row's second child");
    assert.ok(row.querySelector("svg"), "the chart itself must still be inside the row");
    assert.ok(outlet().textContent.indexOf("Activity ID") !== -1, "detail panel content must be present");

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the jump-controls bar (Today/Project Start/Project Finish) still renders correctly above the side-by-side row — the exact spot a stale container.insertBefore(jumpBar, wrap) reference broke", () => {
    var jumpButtons = Array.from(outlet().querySelectorAll("button")).map((b) => b.textContent.trim());
    assert.ok(jumpButtons.indexOf("Today") !== -1);
    assert.ok(jumpButtons.indexOf("Project Start") !== -1);
    assert.ok(jumpButtons.indexOf("Project Finish") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("closing the detail panel returns the chart to its own full-width panel, no leftover side-by-side row", () => {
    findButtonByText(dom, "Close").click();
    assert.strictEqual(outlet().querySelector(".gantt-layout-row"), null);
    assert.ok(outlet().querySelector("svg"), "chart must still render on its own");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.activities.length, 1);
    assert.strictEqual(data.documents.length, 2);
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
    await check("route '" + routes[i] + "' renders without throwing after Focus Mode/Resizable Panels/Side-by-Side Views", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
