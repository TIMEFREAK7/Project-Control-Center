// End-to-end jsdom smoke test against the ACTUAL bundled index.html (not a
// reimplementation) — same convention the README describes for prior gates. Exercises:
// the real Add Budget Item / Log Actual Cost forms, the Summary tab's rollup math,
// unlink-on-delete for a budget item with linked actuals, Portfolio's Details panel
// Cost Tracking section, and mandatory project assignment.
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

  let projectId;
  await check("seed a project via the store", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_cost_1", name: "Cost Test Tower", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;
    });
    assert.ok(projectId);
  });

  await check("navigate to the cost route and it renders without throwing", () => {
    win.PCC.router.go("cost");
    win.PCC.router.render();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.innerHTML.length > 0, "cost route should render content");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Budget tab is the default and its empty state renders with an active project", () => {
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("No budget items yet") !== -1, "expected the budget empty state");
  });

  let budgetItemId;
  await check("'+ Add Budget Item' opens the real form and submitting it creates a budget item", () => {
    var addBtn = findButtonByText(win, "+ Add Budget Item");
    assert.ok(addBtn, "Add Budget Item button not found");
    assert.strictEqual(addBtn.disabled, false, "should be enabled with an active project present");
    addBtn.click();

    win.document.querySelector("#costbudgetfield-name").value = "Rebar Supply";
    win.document.querySelector("#costbudgetfield-category").value = "materials";
    win.document.querySelector("#costbudgetfield-planned_amount").value = "50000";
    var form = win.document.querySelector("#costbudgetfield-name").closest("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

    var data = win.PCC.store.get();
    assert.strictEqual(data.cost_budget_items.length, 1);
    var item = data.cost_budget_items[0];
    budgetItemId = item.id;
    assert.strictEqual(item.name, "Rebar Supply");
    assert.strictEqual(item.category, "materials");
    assert.strictEqual(item.planned_amount, 50000);
    assert.strictEqual(item.project_id, projectId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the new budget item renders in the list with the right details", () => {
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Rebar Supply") !== -1);
    assert.ok(outlet.textContent.indexOf("Materials") !== -1);
    assert.ok(outlet.textContent.indexOf("Cost Test Tower") !== -1);
    assert.ok(outlet.textContent.indexOf("50,000") !== -1, "expected the formatted planned amount");
  });

  await check("editing a budget item through the real form updates the store", () => {
    var editBtn = findButtonByText(win, "Edit");
    assert.ok(editBtn, "Edit button not found on the budget item card");
    editBtn.click();
    var amountField = win.document.querySelector("#costbudgetfield-planned_amount");
    amountField.value = "60000";
    var form = amountField.closest("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

    var data = win.PCC.store.get();
    var item = data.cost_budget_items.find((b) => b.id === budgetItemId);
    assert.strictEqual(item.planned_amount, 60000);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  let linkedActualId, unlinkedActualId;
  await check("'+ Log Actual Cost' offers the budget item in its dropdown and submitting links them", () => {
    var actualsTabBtn = findButtonByText(win, "Actuals");
    actualsTabBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("No actual costs logged yet") !== -1);

    var logBtn = findButtonByText(win, "+ Log Actual Cost");
    logBtn.click();

    var budgetSelect = win.document.querySelector("#costactualfield-budget_item_id");
    var options = Array.from(budgetSelect.options).map((o) => o.textContent);
    assert.ok(options.some((t) => t.indexOf("Rebar Supply") !== -1), "budget item should be offered in the dropdown, got: " + options.join(", "));

    budgetSelect.value = budgetItemId;
    win.document.querySelector("#costactualfield-description").value = "First rebar delivery";
    win.document.querySelector("#costactualfield-amount").value = "12000";
    win.document.querySelector("#costactualfield-date").value = "2026-03-01";
    win.document.querySelector("#costactualfield-vendor").value = "ACME Steel";
    var form = win.document.querySelector("#costactualfield-description").closest("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

    var data = win.PCC.store.get();
    assert.strictEqual(data.cost_actuals.length, 1);
    linkedActualId = data.cost_actuals[0].id;
    assert.strictEqual(data.cost_actuals[0].budget_item_id, budgetItemId);
    assert.strictEqual(data.cost_actuals[0].amount, 12000);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the linked actual cost shows 'against' the budget item's name in the list", () => {
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("against") !== -1 && outlet.textContent.indexOf("Rebar Supply") !== -1);
  });

  await check("logging a second, unlinked actual cost leaves budget_item_id empty", () => {
    var logBtn = findButtonByText(win, "+ Log Actual Cost");
    logBtn.click();
    // Leave "Against Budget Item" at its default "(none — unbudgeted)".
    win.document.querySelector("#costactualfield-description").value = "Site fencing";
    win.document.querySelector("#costactualfield-category").value = "other";
    win.document.querySelector("#costactualfield-amount").value = "3000";
    win.document.querySelector("#costactualfield-date").value = "2026-03-05";
    var form = win.document.querySelector("#costactualfield-description").closest("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

    var data = win.PCC.store.get();
    assert.strictEqual(data.cost_actuals.length, 2);
    var unlinked = data.cost_actuals.find((a) => a.description === "Site fencing");
    unlinkedActualId = unlinked.id;
    assert.strictEqual(unlinked.budget_item_id, "");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Summary tab totals budgeted/actual/variance correctly across both actuals", () => {
    var summaryTabBtn = findButtonByText(win, "Summary");
    summaryTabBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    // Budgeted: 60,000 (after the edit). Actual: 12,000 + 3,000 = 15,000. Variance: +45,000.
    assert.ok(outlet.textContent.indexOf("60,000") !== -1, "expected total budgeted, got: " + outlet.textContent.slice(0, 500));
    assert.ok(outlet.textContent.indexOf("15,000") !== -1, "expected total actual");
    assert.ok(outlet.textContent.indexOf("45,000") !== -1, "expected the variance");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("deleting the linked budget item unlinks (not deletes) its actual cost entries", () => {
    var budgetTabBtn = findButtonByText(win, "Budget");
    budgetTabBtn.click();
    var deleteBtn = findButtonByText(win, "Delete");
    assert.ok(deleteBtn, "Delete button not found on budget item card");
    var originalConfirm = win.confirm;
    win.confirm = () => true;
    deleteBtn.click();
    win.confirm = originalConfirm;

    var data = win.PCC.store.get();
    assert.strictEqual(data.cost_budget_items.length, 0, "budget item should be deleted");
    assert.strictEqual(data.cost_actuals.length, 2, "actual cost entries must survive the budget item's deletion");
    var stillLinked = data.cost_actuals.find((a) => a.id === linkedActualId);
    assert.strictEqual(stillLinked.budget_item_id, "", "the previously-linked actual should now be unlinked, not orphaned-referencing a deleted id");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("deleting an actual cost entry removes only that entry", () => {
    var actualsTabBtn = findButtonByText(win, "Actuals");
    actualsTabBtn.click();
    var deleteButtons = Array.from(win.document.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Delete");
    assert.ok(deleteButtons.length >= 1, "expected at least one Delete button on the Actuals tab");
    var originalConfirm = win.confirm;
    win.confirm = () => true;
    deleteButtons[0].click();
    win.confirm = originalConfirm;

    var data = win.PCC.store.get();
    assert.strictEqual(data.cost_actuals.length, 1, "exactly one actual cost entry should remain");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Portfolio's Details panel shows the project's Cost Tracking summary", () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    var detailsBtn = findButtonByText(win, "Details");
    assert.ok(detailsBtn, "Details button not found on the project card");
    detailsBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("COST TRACKING") !== -1, "expected a Cost Tracking section in project details");
    assert.ok(outlet.textContent.indexOf("Budgeted") !== -1 && outlet.textContent.indexOf("variance") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'View All' from the Cost Tracking section jumps to the Cost page filtered to this project", () => {
    var viewAllBtns = Array.from(win.document.querySelectorAll("button")).filter((b) => b.textContent.trim() === "View All");
    var costViewAllBtn = viewAllBtns[viewAllBtns.length - 1];
    assert.ok(costViewAllBtn, "Cost Tracking's View All button not found");
    costViewAllBtn.click();
    win.PCC.router.render();
    assert.strictEqual(win.PCC.router.currentRouteName(), "cost");
    var outlet = win.document.getElementById("page-outlet");
    // filterByProject() forces the Budget tab; the budget item was deleted earlier, so
    // this project's filtered list should be the (project-scoped) empty state.
    assert.strictEqual(findButtonByText(win, "Budget").className.indexOf("tab-btn--active") !== -1, true, "should land on the Budget tab");
    assert.ok(outlet.textContent.indexOf("No budget items yet") !== -1, "expected the empty state, got: " + outlet.textContent.slice(0, 300));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  let fallbackProjectId;
  await check("a project with a Portfolio Budget field but no Cost Tracking line items falls back to it", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_cost_fallback", name: "Fallback Test Project", archived: false, status: "on_track", progress: 0, budget: 75000, attachments: [] };
      data.projects.push(project);
      fallbackProjectId = project.id;
    });
    var summary = win.PCC.cost.projectCostSummary(win.PCC.store.get(), fallbackProjectId);
    assert.strictEqual(summary.budgeted, 75000, "should fall back to the project's Budget field");
    assert.strictEqual(summary.usingPortfolioBudget, true);
    assert.strictEqual(summary.actual, 0);

    win.PCC.router.go("cost");
    win.PCC.router.render();
    var summaryTabBtn = findButtonByText(win, "Summary");
    summaryTabBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Fallback Test Project") !== -1);
    assert.ok(outlet.textContent.indexOf("75,000") !== -1, "expected the Portfolio Budget figure on the Summary tab");
    assert.ok(
      outlet.textContent.indexOf("from Portfolio's Budget field") !== -1,
      "expected a note flagging this number came from Portfolio, not line items"
    );
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Portfolio's Details panel shows the same fallback figure and note for that project", () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    // Two projects now exist; find the card containing "Fallback Test Project" specifically,
    // rather than assuming array-index alignment with any other button list.
    var cards = Array.from(win.document.querySelectorAll(".project-card"));
    var fallbackCard = cards.find((c) => c.textContent.indexOf("Fallback Test Project") !== -1);
    assert.ok(fallbackCard, "Fallback Test Project card not found");
    var detailsBtn = Array.from(fallbackCard.querySelectorAll("button")).find((b) => b.textContent.trim() === "Details");
    assert.ok(detailsBtn, "Details button not found within the Fallback Test Project card");
    detailsBtn.click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("75,000") !== -1, "expected the fallback figure in Portfolio's Details panel");
    assert.ok(
      outlet.textContent.indexOf("Budgeted from this project's Budget field") !== -1,
      "expected the fallback note in Portfolio's Details panel"
    );
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("adding a real Cost Tracking budget line item turns the fallback off", () => {
    win.PCC.store.update(function (data) {
      data.cost_budget_items.push(
        win.PCC.store.newCostBudgetItem({ project_id: fallbackProjectId, name: "Site Prep", category: "labor", planned_amount: 9000 })
      );
    });
    var summary = win.PCC.cost.projectCostSummary(win.PCC.store.get(), fallbackProjectId);
    assert.strictEqual(summary.usingPortfolioBudget, false, "a real line item should take over as the source of truth");
    assert.strictEqual(summary.budgeted, 9000, "budgeted should now be the line-item sum, not the Portfolio Budget field (75,000)");
  });

  await check("with no active projects, '+ Add Budget Item' and '+ Log Actual Cost' are disabled", () => {
    win.PCC.store.update(function (data) {
      data.projects.forEach(function (p) {
        p.archived = true;
      });
    });
    win.PCC.router.go("cost");
    win.PCC.router.render();
    var budgetTabBtn = findButtonByText(win, "Budget");
    budgetTabBtn.click();
    var addBtn = findButtonByText(win, "+ Add Budget Item");
    assert.strictEqual(addBtn.disabled, true, "Add Budget Item should be disabled with zero active projects");

    var actualsTabBtn = findButtonByText(win, "Actuals");
    actualsTabBtn.click();
    var logBtn = findButtonByText(win, "+ Log Actual Cost");
    assert.strictEqual(logBtn.disabled, true, "Log Actual Cost should be disabled with zero active projects");

    // Restore for the route smoke test below.
    win.PCC.store.update(function (data) {
      data.projects.forEach(function (p) {
        p.archived = false;
      });
    });
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page, matching the README's stated convention,
  // since this gate bumps store.js's schema (v18->v19) and adds a new page/route. ----
  var routes = ["dashboard", "portfolio", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Cost Tracking gate", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
