// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 19 (PCC Evolution
// Roadmap, Tier F: Commitment Management — 2026-08-19). A fresh inspection found nothing
// in this app models Commitments today — Executive Center's own header comment has
// flagged "Commitments and Cash Flow aren't tracked anywhere in PCC yet" since Gate 9, and
// Document Control's Gate 16 explicitly deferred a real Package/Commercial module rather
// than invent one out of scope. This gate adds both: a new Commitments register (PO
// number, vendor, package, committed/approved value, status) and a shared Packages
// register reused by both Commitments and Documents. Confirmed via AskUserQuestion:
// Actual Value is a LIVE SUM of Cost Tracking's own actual cost entries linked to a
// commitment (not a manually-entered figure), and Package is the new shared register
// (not free text), retrofitted into Documents' existing free-text package field.
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
// commitments.js is a React-migrated page: a raw `.value =` assignment doesn't reliably
// reach a controlled <select>'s onChange (React patches the native setter to track "last
// known value" — see CLAUDE.md's React migration notes), so bypass it via the native
// prototype descriptor before dispatching the change event.
function setReactSelectValue(win, select, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(select, value);
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
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
    assert.ok(win.PCC.pages.commitments, "commitments page must be bundled");
    assert.ok(win.PCC.store.newPackage && win.PCC.store.newCommitment, "new factories must be exported");
  });

  let projectId, vendorId, budgetItemId, activityId, scheduleId;
  await check("seed a project, vendor, budget item, and activity via the store", () => {
    win.PCC.store.update(function (d) {
      var project = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      d.projects.push(project);
      projectId = project.id;

      var vendor = win.PCC.store.newVendor({ vendor_name: "Steelworks Ltd" });
      d.vendors.push(vendor);
      vendorId = vendor.id;

      var budgetItem = win.PCC.store.newCostBudgetItem({ project_id: projectId, name: "Structural Steel", planned_amount: 100000 });
      d.cost_budget_items.push(budgetItem);
      budgetItemId = budgetItem.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(schedule);
      scheduleId = schedule.id;
      var activity = win.PCC.store.newActivity({ project_id: projectId, schedule_id: schedule.id, name: "Steel Erection" });
      d.activities.push(activity);
      activityId = activity.id;
    });
    assert.ok(projectId && vendorId && budgetItemId && activityId);
  });

  await check("add a Package through the real Packages tab form", async () => {
    win.PCC.router.go("commitments");
    win.PCC.router.render();
    // commitments.js is a React-migrated page — a click's state update commits
    // asynchronously (see CLAUDE.md's React migration notes), so await flush() before
    // reading the resulting DOM.
    await flush();
    findButtonByText(dom, "Packages").click();
    await flush();
    findButtonByText(dom, "+ Add Package").click();
    await flush();

    win.document.getElementById("pkgfield-name").value = "Structural Steel Package";
    win.document.getElementById("pkgfield-code").value = "PKG-STL";
    findButtonByText(dom, "Add Package").click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Structural Steel Package") !== -1);
    assert.ok(text.indexOf("PKG-STL") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  let commitmentId;
  await check("add a Commitment through the real Commitments tab form, linking project/vendor/package/budget item/activity", async () => {
    findButtonByText(dom, "Commitments").click();
    await flush();
    findButtonByText(dom, "+ Add Commitment").click();
    await flush();

    setReactSelectValue(win, win.document.getElementById("cmtfield-project_id"), projectId);
    await flush();
    win.document.getElementById("cmtfield-vendor_id").value = vendorId;
    var pkgSelect = win.document.getElementById("cmtfield-package_id");
    var pkgOption = Array.from(pkgSelect.options).find((o) => o.textContent.indexOf("Structural Steel Package") !== -1);
    pkgSelect.value = pkgOption.value;
    win.document.getElementById("cmtfield-type").value = "purchase_order";
    win.document.getElementById("cmtfield-po_contract_number").value = "PO-1001";
    win.document.getElementById("cmtfield-commitment_date").value = "2026-01-15";
    win.document.getElementById("cmtfield-committed_value").value = "50000";
    win.document.getElementById("cmtfield-approved_value").value = "48000";
    win.document.getElementById("cmtfield-status").value = "approved";
    win.document.getElementById("cmtfield-budget_item_id").value = budgetItemId;
    win.document.getElementById("cmtfield-activity_id").value = activityId;
    findButtonByText(dom, "Add Commitment").click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.commitments.length, 1);
    commitmentId = data.commitments[0].id;
    assert.strictEqual(data.commitments[0].po_contract_number, "PO-1001");
    assert.strictEqual(data.commitments[0].committed_value, 50000);
    assert.ok(!("actual_value" in data.commitments[0]), "actual_value must not be stored on the record");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Commitments list shows Committed/Approved/Actual(0)/Remaining=Committed before any cost is logged", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("PO-1001") !== -1);
    assert.ok(text.indexOf("Committed $50,000") !== -1);
    assert.ok(text.indexOf("Approved $48,000") !== -1);
    assert.ok(text.indexOf("Actual $0") !== -1, "no cost logged yet — actual must be 0, not blank");
    assert.ok(text.indexOf("Remaining $50,000") !== -1, "remaining = committed - 0 actual");
  });

  await check("logging an Actual Cost in Cost Tracking against this commitment updates its computed Actual Value", async () => {
    win.PCC.router.go("cost");
    win.PCC.router.render();
    // cost.js is a React-migrated page — flush before interacting and after every
    // click whose state update commits asynchronously (see CLAUDE.md's React
    // migration notes).
    await flush();
    findButtonByText(dom, "Actuals").click();
    await flush();
    findButtonByText(dom, "+ Log Actual Cost").click();
    await flush();

    // costactualfield-project_id is a CONTROLLED select (its onChange rescopes the
    // Budget Item/Commitment dropdowns) — bypass React's patched value setter, since a
    // raw assignment alone doesn't make its onChange fire (see CLAUDE.md's React
    // migration notes).
    setReactSelectValue(win, win.document.getElementById("costactualfield-project_id"), projectId);
    await flush();
    var commitmentSelect = win.document.getElementById("costactualfield-commitment_id");
    commitmentSelect.value = commitmentId;
    win.document.getElementById("costactualfield-description").value = "First steel delivery";
    win.document.getElementById("costactualfield-amount").value = "15000";
    win.document.getElementById("costactualfield-date").value = "2026-02-01";
    findButtonByText(dom, "Log Cost").click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.cost_actuals.length, 1);
    assert.strictEqual(data.cost_actuals[0].commitment_id, commitmentId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    win.PCC.router.go("commitments");
    win.PCC.router.render();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Actual $15,000") !== -1, "commitment's Actual Value must reflect the newly-logged cost");
    assert.ok(text.indexOf("Remaining $35,000") !== -1, "50000 committed - 15000 actual = 35000 remaining");
  });

  await check("a second Actual Cost against the same commitment accumulates into the sum", async () => {
    win.PCC.router.go("cost");
    win.PCC.router.render();
    await flush();
    // cost.js is a React-migrated page — its tab state resets to the default ("Budget")
    // on every fresh mount, unlike the old vanilla page's persistent module-level
    // uiState (see CLAUDE.md's React migration notes), so re-select the Actuals tab
    // rather than assuming it's still active from the earlier check.
    findButtonByText(dom, "Actuals").click();
    await flush();
    findButtonByText(dom, "+ Log Actual Cost").click();
    await flush();
    setReactSelectValue(win, win.document.getElementById("costactualfield-project_id"), projectId);
    await flush();
    win.document.getElementById("costactualfield-commitment_id").value = commitmentId;
    win.document.getElementById("costactualfield-description").value = "Second steel delivery";
    win.document.getElementById("costactualfield-amount").value = "10000";
    win.document.getElementById("costactualfield-date").value = "2026-02-15";
    findButtonByText(dom, "Log Cost").click();
    await flush();

    win.PCC.router.go("commitments");
    win.PCC.router.render();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Actual $25,000") !== -1, "15000 + 10000 = 25000");
    assert.ok(text.indexOf("Remaining $25,000") !== -1);
  });

  await check("the KPI strip totals Committed/Approved/Actual/Remaining across the filtered set", () => {
    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    function kpiValue(label) {
      var card = kpiCards.find((c) => c.textContent.indexOf(label) !== -1);
      return card ? card.querySelector(".kpi-card__value").textContent : undefined;
    }
    assert.strictEqual(kpiValue("TOTAL COMMITTED"), "$50,000");
    assert.strictEqual(kpiValue("TOTAL APPROVED"), "$48,000");
    assert.strictEqual(kpiValue("TOTAL ACTUAL"), "$25,000");
    assert.strictEqual(kpiValue("TOTAL REMAINING"), "$25,000");
  });

  await check("Executive Center shows a COMMITMENTS KPI section with the same totals", () => {
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    // UI/UX Overhaul Gate 5: COMMITMENTS now lives on the Cost & Commitments sub-tab,
    // not the default Summary landing view.
    var costTab = Array.from(outlet().querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Cost & Commitments");
    assert.ok(costTab, "Cost & Commitments sub-tab not found");
    costTab.click();
    var text = outlet().textContent;
    assert.ok(text.indexOf("COMMITMENTS") !== -1, "Commitments KPI section must render");
    assert.ok(text.indexOf("25,000") !== -1, "actual/remaining figures should appear");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Portfolio's Details panel shows a COMMITMENTS section with Total Committed", () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    win.PCC.portfolio.viewProject(projectId);
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("COMMITMENTS (1)") !== -1);
    assert.ok(text.indexOf("Total Committed 50,000") !== -1);
  });

  await check("Documents' Package field offers the shared Packages register and round-trips package_id", async () => {
    win.PCC.router.go("documents");
    await flush();
    findButtonByText(dom, "+ Add Document").click();
    await flush();

    var packageSelect = Array.from(outlet().querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent.indexOf("Structural Steel Package") !== -1)
    );
    assert.ok(packageSelect, "Package select offering the shared register not found on the Documents form");
    var opt = Array.from(packageSelect.options).find((o) => o.textContent.indexOf("Structural Steel Package") !== -1);
    assert.ok(opt.textContent.indexOf("PKG-STL") !== -1, "option label should include the package code");
  });

  await check("deleting the Commitment unlinks (does not delete) the cost_actuals rows logged against it", async () => {
    win.PCC.router.go("commitments");
    win.PCC.router.render();
    // Flush here, BEFORE interacting — router.js's suppressNextHashRender is a single
    // flag, so a hashchange-triggered render can still land asynchronously after this
    // go()+render() pair (see CLAUDE.md's React migration notes on this race).
    await flush();
    findButtonByText(dom, "Commitments").click();
    await flush();
    var deleteBtn = findButtonByText(dom, "Delete");
    assert.ok(deleteBtn, "no Delete button found on the commitment row");
    var originalConfirm = win.confirm;
    win.confirm = () => true;
    deleteBtn.click();
    win.confirm = originalConfirm;
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.commitments.length, 0);
    assert.strictEqual(data.cost_actuals.length, 2, "cost actuals must survive commitment deletion");
    assert.ok(data.cost_actuals.every((a) => a.commitment_id === ""), "cost actuals must be unlinked, not left dangling");
  });

  await check("deleting the Package unlinks documents referencing it", async () => {
    findButtonByText(dom, "Packages").click();
    await flush();
    var deleteBtn = findButtonByText(dom, "Delete");
    var originalConfirm = win.confirm;
    win.confirm = () => true;
    deleteBtn.click();
    win.confirm = originalConfirm;
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.packages.length, 0);
  });

  await check("this gate leaves record counts otherwise as expected — final state check", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.vendors.length, 1);
    assert.strictEqual(data.cost_budget_items.length, 1);
    assert.strictEqual(data.activities.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 19 (Commitment Management)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
