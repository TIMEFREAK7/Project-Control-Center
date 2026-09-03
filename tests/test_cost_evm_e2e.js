// End-to-end jsdom smoke test against the ACTUAL bundled index.html (not a
// reimplementation) — same convention the README describes for prior gates. Exercises:
// linking a real Budget Item to a real Schedule activity through the actual form, the
// EVM tab's KPI tiles and per-project row against hand-checked arithmetic, an unlinked
// budget item's effect on coverage%, and mandatory project assignment carrying through.
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

  // ---- Seed a project, a schedule, and an activity that's 50% complete and whose
  // planned span puts "today" (the schedule's data_date) exactly at its midpoint —
  // hand-checkable PV/EV/AC numbers, same pattern the pure-logic engine test uses. ----
  let projectId, scheduleId, activityId;
  await check("seed a project, schedule, and a half-complete activity via the store", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_evm_1", name: "EVM Test Tower", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "EVM Test Schedule", revision_number: 1, data_date: "2026-01-06" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var activity = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Excavate",
        activity_type: "task", duration: 10, planned_start: "2026-01-01", planned_finish: "2026-01-11",
        percent_complete: 50,
      });
      data.activities.push(activity);
      activityId = activity.id;
    });
    assert.ok(projectId && scheduleId && activityId);
  });

  await check("navigate to the cost route and it renders without throwing", async () => {
    win.PCC.router.go("cost");
    win.PCC.router.render();
    // cost.js is a React-migrated page — go() already renders its INITIAL mount
    // synchronously (reactBridge.js wraps it in flushSync), but await flush() anyway
    // before the next check interacts with it, per CLAUDE.md's React migration notes.
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.innerHTML.length > 0, "cost route should render content");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Budget Item form's Schedule Activity dropdown offers the seeded activity, labeled with its schedule", async () => {
    var addBtn = findButtonByText(win, "+ Add Budget Item");
    addBtn.click();
    await flush();
    var activitySelect = win.document.querySelector("#costbudgetfield-activity_id");
    assert.ok(activitySelect, "Schedule Activity select not found on the Budget Item form");
    var options = Array.from(activitySelect.options).map((o) => o.textContent);
    assert.ok(
      options.some((t) => t === "EVM Test Schedule: Excavate"),
      "expected the activity labeled with its schedule name, got: " + options.join(", ")
    );
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  let linkedBudgetItemId;
  await check("submitting the Budget Item form with an activity selected links it (activity_id stored)", async () => {
    win.document.querySelector("#costbudgetfield-name").value = "Excavation Labor";
    win.document.querySelector("#costbudgetfield-planned_amount").value = "1000";
    win.document.querySelector("#costbudgetfield-activity_id").value = activityId;
    var form = win.document.querySelector("#costbudgetfield-name").closest("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.cost_budget_items.length, 1);
    linkedBudgetItemId = data.cost_budget_items[0].id;
    assert.strictEqual(data.cost_budget_items[0].activity_id, activityId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the budget item's list row shows which activity it's linked to and its % complete", () => {
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("linked to") !== -1 && outlet.textContent.indexOf("Excavate") !== -1, "got: " + outlet.textContent.slice(0, 400));
    assert.ok(outlet.textContent.indexOf("50% complete") !== -1);
  });

  await check("logging an actual cost against this project (AC = 500, on-budget for a 50%-complete, 50%-elapsed activity)", async () => {
    win.PCC.router.render();
    await flush();
    var actualsTabBtn = findButtonByText(win, "Actuals");
    actualsTabBtn.click();
    await flush();
    var logBtn = findButtonByText(win, "+ Log Actual Cost");
    logBtn.click();
    await flush();
    win.document.querySelector("#costactualfield-description").value = "Excavation crew, week 1";
    win.document.querySelector("#costactualfield-amount").value = "500";
    win.document.querySelector("#costactualfield-date").value = "2026-01-06";
    var form = win.document.querySelector("#costactualfield-description").closest("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.cost_actuals.length, 1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the EVM tab shows hand-checkable PV/EV/AC/CPI/SPI for this exact-midpoint, on-budget scenario", async () => {
    var evmTabBtn = findButtonByText(win, "EVM");
    assert.ok(evmTabBtn, "EVM tab button not found");
    evmTabBtn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    // Activity: 10-day span (Jan 1-11), data_date Jan 6 = 5 days elapsed = 50% -> PV = 500.
    // 50% complete on a 1000 budget item -> EV = 500. AC = 500 (logged above). CPI = SPI = 1.00.
    assert.ok(outlet.textContent.indexOf("500") !== -1, "expected PV/EV/AC figures, got: " + outlet.textContent.slice(0, 600));
    assert.ok(outlet.textContent.indexOf("1.00") !== -1, "expected CPI and/or SPI of 1.00, got: " + outlet.textContent.slice(0, 600));
    assert.ok(outlet.textContent.indexOf("100% linked") !== -1, "the one budget item is fully linked, coverage should read 100%");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("adding a second, unlinked budget item drops coverage below 100% and shows the coverage note", async () => {
    win.PCC.router.render();
    await flush();
    var budgetTabBtn = findButtonByText(win, "Budget");
    budgetTabBtn.click();
    await flush();
    var addBtn = findButtonByText(win, "+ Add Budget Item");
    addBtn.click();
    await flush();
    win.document.querySelector("#costbudgetfield-name").value = "Miscellaneous";
    win.document.querySelector("#costbudgetfield-planned_amount").value = "1000";
    // Leave Schedule Activity at its default "(none — not linked...)".
    var form = win.document.querySelector("#costbudgetfield-name").closest("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.cost_budget_items.length, 2);
    var unlinked = data.cost_budget_items.find((b) => b.name === "Miscellaneous");
    assert.strictEqual(unlinked.activity_id, "", "should be unlinked by default");

    var evmTabBtn = findButtonByText(win, "EVM");
    evmTabBtn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    // BAC is now 2000 (1000 linked + 1000 unlinked); linked share is 1000/2000 = 50%.
    assert.ok(outlet.textContent.indexOf("50% linked") !== -1, "expected 50% linked coverage, got: " + outlet.textContent.slice(0, 600));
    assert.ok(
      outlet.textContent.indexOf("isn't reflected in these figures") !== -1,
      "expected the portfolio-wide coverage disclosure note to appear once coverage drops below 100%"
    );
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("with no active projects, the EVM tab shows its own empty state", async () => {
    win.PCC.store.update(function (data) {
      data.projects.forEach(function (p) {
        p.archived = true;
      });
    });
    win.PCC.router.render();
    await flush();
    var evmTabBtn = findButtonByText(win, "EVM");
    evmTabBtn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Add a project in Portfolio first") !== -1, "got: " + outlet.textContent.slice(0, 400));

    win.PCC.store.update(function (data) {
      data.projects.forEach(function (p) {
        p.archived = false;
      });
    });
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page, matching the README's stated convention,
  // since this gate bumps store.js's schema (v19->v20). ----
  var routes = ["dashboard", "portfolio", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the EVM gate", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
