// End-to-end jsdom test against the ACTUAL bundled index.html for UI/UX Overhaul Gate 6
// (Risk Register — second module of "Existing Modules, one at a time"). Inspection found
// Risk Register already close to the target UX state, unlike Documents, but surfaced two
// concrete issues confirmed with Aditya via AskUserQuestion before building:
//   1. The Heat Map counted `data.risks` — every risk in the whole app — with no regard
//      to the toolbar's own type/status/project/search filters, so filtering the list to
//      one project (or relying on the default "Open" status filter) left the heat map
//      showing stale, misleading counts. Fixed by scoping heat map counts to
//      riskMatchesToolbarFilters() and rewiring the toolbar's filter handlers to refresh
//      both the heat map and the list together (refreshFilteredViews()).
//   2. Risk cards always showed three full-width buttons (Details/Edit/Delete). Moved
//      Edit/Delete into a "⋯" contextual menu, matching the .card-menu pattern already
//      built in portfolio.js (Gate 3) — Details stays the one primary visible action.
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.risks && win.PCC.risks.filterByProject, "risks.js's filterByProject() must be bundled");
  });

  var projA, projB;
  await check("seed two projects with risks spanning type/probability/impact/status", () => {
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newProject({ name: "Riverside Tower", status: "at_risk" });
      d.projects.push(a);
      projA = a.id;
      var b = win.PCC.store.newProject({ name: "Harbor Bridge", status: "on_track" });
      d.projects.push(b);
      projB = b.id;

      d.risks.push(
        win.PCC.store.newRisk({ project_id: projA, type: "risk", title: "Open high/high in A", probability: "high", impact: "high", status: "open" }),
        win.PCC.store.newRisk({ project_id: projA, type: "risk", title: "Closed high/high in A", probability: "high", impact: "high", status: "closed" }),
        win.PCC.store.newRisk({ project_id: projB, type: "issue", title: "Open low/low in B", probability: "low", impact: "low", status: "open" })
      );
    });
    win.PCC.router.go("risks");
    win.PCC.router.render();
    assert.ok(projA && projB);
  });

  await check("heat map already reflects the default 'Open' status filter on first render (the stale-count bug is fixed)", () => {
    // 2 risks are status=open (default statusFilter), 1 is closed and must not count.
    var cells = outlet().querySelectorAll(".heatmap-cell");
    var total = Array.from(cells).reduce(function (sum, c) { return sum + parseInt(c.textContent, 10); }, 0);
    assert.strictEqual(total, 2, "heat map must only count the 2 open risks, not all 3");
    assert.ok(outlet().textContent.indexOf("Reflects the current search/type/status/project filters") !== -1, "narrowed subtitle must be shown");
  });

  await check("filtering the toolbar to one project also narrows the heat map, not just the list", () => {
    var projectSelect = Array.from(outlet().querySelectorAll(".toolbar select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Harbor Bridge")
    );
    assert.ok(projectSelect, "project filter select not found");
    projectSelect.value = projB;
    projectSelect.dispatchEvent(new win.Event("change"));

    var cells = outlet().querySelectorAll(".heatmap-cell");
    var total = Array.from(cells).reduce(function (sum, c) { return sum + parseInt(c.textContent, 10); }, 0);
    assert.strictEqual(total, 1, "heat map must narrow to Harbor Bridge's 1 open risk");

    var listItems = outlet().querySelectorAll(".project-card");
    assert.strictEqual(listItems.length, 1, "list must also show just Harbor Bridge's 1 open risk");

    projectSelect = Array.from(outlet().querySelectorAll(".toolbar select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Harbor Bridge")
    );
    projectSelect.value = "";
    projectSelect.dispatchEvent(new win.Event("change"));
  });

  await check("switching the status filter to 'All statuses' widens the heat map back out", () => {
    var statusSelect = Array.from(outlet().querySelectorAll(".toolbar select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "All statuses")
    );
    assert.ok(statusSelect);
    statusSelect.value = "";
    statusSelect.dispatchEvent(new win.Event("change"));

    var cells = outlet().querySelectorAll(".heatmap-cell");
    var total = Array.from(cells).reduce(function (sum, c) { return sum + parseInt(c.textContent, 10); }, 0);
    assert.strictEqual(total, 3, "heat map must count all 3 risks once the status filter is cleared");
    assert.ok(outlet().textContent.indexOf("Reflects the current search/type/status/project filters") === -1, "subtitle must revert to the unnarrowed copy");

    statusSelect = Array.from(outlet().querySelectorAll(".toolbar select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "All statuses")
    );
    statusSelect.value = "open";
    statusSelect.dispatchEvent(new win.Event("change"));
  });

  await check("risk cards show only 'Details' directly — Edit/Delete are not visible buttons on the card face", () => {
    var card = outlet().querySelector(".project-card");
    assert.ok(card, "risk card not found");
    var actions = card.querySelector(".project-card__actions");
    var directButtons = Array.from(actions.querySelectorAll(":scope > button")).map((b) => b.textContent.trim());
    assert.ok(directButtons.indexOf("Details") !== -1, "Details must remain a direct primary action");
    assert.strictEqual(directButtons.indexOf("Edit"), -1, "Edit must not be a direct card button anymore");
    assert.strictEqual(directButtons.indexOf("Delete"), -1, "Delete must not be a direct card button anymore");
    assert.ok(actions.querySelector(".card-menu"), "card must have a .card-menu wrapper");
    assert.ok(actions.querySelector(".card-menu .icon-btn"), "card must have a '⋯' menu toggle button");
  });

  await check("clicking the '⋯' menu opens a dropdown with Edit, Clone, and Delete, and the overlay closes it again", () => {
    var menuBtn = outlet().querySelector(".card-menu .icon-btn");
    menuBtn.click();
    var dropdown = outlet().querySelector(".card-menu__dropdown");
    assert.ok(dropdown, "dropdown must open on menu click");
    var items = Array.from(dropdown.querySelectorAll(".card-menu__item")).map((b) => b.textContent.trim());
    assert.deepStrictEqual(items, ["Edit", "Clone", "Delete"]);

    var overlay = outlet().querySelector(".card-menu__overlay");
    assert.ok(overlay, "overlay must render while the menu is open");
    overlay.click();
    assert.strictEqual(outlet().querySelector(".card-menu__dropdown"), null, "dropdown must close after clicking the overlay");
  });

  await check("clicking 'Edit' in the card menu opens the edit form and closes the menu", () => {
    var menuBtn = outlet().querySelector(".card-menu .icon-btn");
    menuBtn.click();
    var editItem = Array.from(outlet().querySelectorAll(".card-menu__item")).find((b) => b.textContent.trim() === "Edit");
    assert.ok(editItem);
    editItem.click();
    assert.ok(outlet().textContent.indexOf("Edit Register Entry") !== -1, "edit form must open");
    assert.strictEqual(outlet().querySelector(".card-menu__dropdown"), null, "menu must close once Edit is clicked");
    findButtonByText(dom, "Cancel").click();
  });

  await check("clicking 'Delete' in the card menu, then confirming, removes the entry and closes the menu", () => {
    var originalConfirm = win.confirm;
    win.confirm = () => true;
    try {
      var beforeCount = win.PCC.store.get().risks.length;
      var menuBtn = outlet().querySelector(".card-menu .icon-btn");
      menuBtn.click();
      var deleteItem = Array.from(outlet().querySelectorAll(".card-menu__item")).find((b) => b.textContent.trim() === "Delete");
      assert.ok(deleteItem);
      deleteItem.click();
      assert.strictEqual(win.PCC.store.get().risks.length, beforeCount - 1, "entry must be deleted");
      assert.strictEqual(outlet().querySelector(".card-menu__dropdown"), null, "menu must be closed after deleting");
    } finally {
      win.confirm = originalConfirm;
    }
  });

  await check("declining the confirm dialog leaves the entry and the menu open", () => {
    var originalConfirm = win.confirm;
    win.confirm = () => false;
    try {
      var beforeCount = win.PCC.store.get().risks.length;
      var menuBtn = outlet().querySelector(".card-menu .icon-btn");
      menuBtn.click();
      var deleteItem = Array.from(outlet().querySelectorAll(".card-menu__item")).find((b) => b.textContent.trim() === "Delete");
      deleteItem.click();
      assert.strictEqual(win.PCC.store.get().risks.length, beforeCount, "entry must not be deleted when the confirm is declined");
    } finally {
      win.confirm = originalConfirm;
    }
  });

  await check("this gate's read-only checks leave the remaining seeded projects untouched", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 2);
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
    await check("route '" + routes[i] + "' renders without throwing after the Risk Register redesign", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
