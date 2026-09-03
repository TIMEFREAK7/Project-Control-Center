// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 24 (PCC Evolution
// Roadmap, Tier F: Recovery & Mitigation Planning — 2026-08-20). Inspection found Recovery
// Actions was a plain to-do (description/responsible person/target date/status) with zero
// schedule-impact quantification anywhere, and nowhere in the app could you ask "what if we
// recover N days on this activity" and see the CPM-calculated effect. Aditya confirmed via
// AskUserQuestion: the what-if tool should be a standalone sandbox (not tied to any one
// Recovery Action), and Recovery Actions should also gain an estimated-cost field alongside
// estimated recovery days, for cost/schedule tradeoff comparison between options.
//
// Two genuine gaps closed:
// - What-If Sandbox: a new "What-If" tab in schedule.js. Pick any activity, propose reducing
//   its duration (or remaining_duration if in-progress) by N days, and see a before/after CPM
//   comparison (project finish, critical activity count, which activities flip criticality) —
//   entirely in-memory, nothing persisted.
// - Recovery Actions gain estimated_recovery_days and estimated_cost (schema v46), surfaced on
//   the Activity Detail Panel's own row and rolled up (open actions only) on the Delay &
//   Recovery Dashboard.
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
function setReactSelectValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}
function setReactInputValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
}
function setReactTextareaValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value").set.call(el, value);
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
  });

  // ---- Seed: A -> B (FS), and an unrelated longer C anchoring the project finish so
  // B starts with 10 days of float before we crash it below — same setup shape Gate
  // 23's Float Erosion test used, reused here since it's exactly the scenario needed
  // to prove "reducing a non-critical activity may not move the finish." ----
  let projectId, scheduleId, activityAId, activityBId, activityCId;
  await check("seed a project/schedule with A -> B (FS) and an unrelated longer C giving B 10 days of float", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-01-01" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Design", activity_type: "task", duration: 5 });
      data.activities.push(a);
      activityAId = a.id;

      var b = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Foundation", activity_type: "task", duration: 5 });
      data.activities.push(b);
      activityBId = b.id;

      var c = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Long Lead Procurement", activity_type: "task", duration: 20 });
      data.activities.push(c);
      activityCId = c.id;

      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: activityAId, successor_id: activityBId, type: "FS", lag: 0 }));
    });
    assert.ok(projectId && scheduleId && activityAId && activityBId && activityCId);
  });

  await check("navigate to the schedule route and the What-If tab exists", async () => {
    win.PCC.router.go("schedule");
    await flush();
    var whatIfTabBtn = findButtonByText(dom, "What-If");
    assert.ok(whatIfTabBtn, "What-If tab button not found");
    whatIfTabBtn.click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Explore “what if we recover N days") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("running a what-if on the NON-critical Foundation (float 10d), reducing by only 3 days, shows no project-finish change", async () => {
    var activitySelect = outlet().querySelector("#whatiffield-activity");
    var daysInput = outlet().querySelector("#whatiffield-days");
    setReactSelectValue(win, activitySelect, activityBId);
    setReactInputValue(win, daysInput, "3");
    findButtonByText(dom, "Run What-If").click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("What-If Result — Foundation") !== -1);
    assert.ok(text.indexOf("was NOT on the critical path") !== -1, "Foundation has 10d of float, so a 3-day reduction shouldn't move the finish");
    assert.ok(text.indexOf("no change") !== -1, "expected 'no change' in the project finish line; got: " + text.slice(text.indexOf("Project Finish"), text.indexOf("Project Finish") + 150));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    // Nothing should be persisted by a what-if run.
    var data = win.PCC.store.get();
    var b = data.activities.find((x) => x.id === activityBId);
    assert.strictEqual(b.duration, 5, "the what-if must never write back to the real activity");
  });

  await check("running a what-if that exceeds the activity's own duration clamps at 0 and reports the clamp", async () => {
    var activitySelect = outlet().querySelector("#whatiffield-activity");
    var daysInput = outlet().querySelector("#whatiffield-days");
    setReactSelectValue(win, activitySelect, activityBId);
    setReactInputValue(win, daysInput, "100"); // Foundation only has 5 days of duration to give
    findButtonByText(dom, "Run What-If").click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Requested 100d, but this activity only had 5d") !== -1, "got: " + text.slice(0, 400));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    var data = win.PCC.store.get();
    var b = data.activities.find((x) => x.id === activityBId);
    assert.strictEqual(b.duration, 5, "still never persisted, even for a clamped scenario");
  });

  await check("running a what-if on Long Lead Procurement (the critical path itself) shows the project finish actually moving earlier", async () => {
    var activitySelect = outlet().querySelector("#whatiffield-activity");
    var daysInput = outlet().querySelector("#whatiffield-days");
    setReactSelectValue(win, activitySelect, activityCId);
    setReactInputValue(win, daysInput, "5");
    findButtonByText(dom, "Run What-If").click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("What-If Result — Long Lead Procurement") !== -1);
    assert.ok(text.indexOf("was NOT on the critical path") === -1, "Procurement (20d, no predecessors) IS the critical path in this seed");
    assert.ok(text.indexOf("-5d earlier") !== -1, "reducing the critical activity by 5d should pull the finish in by 5d; got: " + text.slice(text.indexOf("Project Finish"), text.indexOf("Project Finish") + 150));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("selecting no activity, or a non-positive day count, shows a validation error and no result (regression: the error must survive rerender(), not live only on a discarded local DOM node)", async () => {
    var resetBtn = findButtonByText(dom, "Reset");
    assert.ok(resetBtn, "Reset button not found");
    resetBtn.click();
    await flush();

    findButtonByText(dom, "Run What-If").click();
    await flush();
    // rerender() fully rebuilds this tab on every click — an error message assigned
    // only to a local variable's .style.display, rather than stored in uiState and
    // re-read on the next build, would be silently thrown away right here.
    assert.ok(outlet().textContent.indexOf("Select an activity first") !== -1, "got: " + outlet().textContent.slice(0, 300));

    var activitySelect = outlet().querySelector("#whatiffield-activity");
    var daysInput = outlet().querySelector("#whatiffield-days");
    setReactSelectValue(win, activitySelect, activityBId);
    setReactInputValue(win, daysInput, "0");
    findButtonByText(dom, "Run What-If").click();
    await flush();
    assert.ok(outlet().textContent.indexOf("Enter a positive number of days") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("adding a Recovery Action with estimated days/cost persists both and shows them on the Activity Detail Panel row", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityBId);
    win.PCC.router.render();
    await flush();

    var addBtn = findButtonByText(dom, "+ Add Recovery Action");
    assert.ok(addBtn, "+ Add Recovery Action button not found");
    addBtn.click();
    await flush();

    setReactTextareaValue(win, outlet().querySelector("#recactionfield-description"), "Add a second crew to Foundation.");
    setReactInputValue(win, outlet().querySelector("#recactionfield-responsible_person"), "Site Super");
    setReactInputValue(win, outlet().querySelector("#recactionfield-estimated_recovery_days"), "3");
    setReactInputValue(win, outlet().querySelector("#recactionfield-estimated_cost"), "15000");
    findButtonByText(dom, "Add Recovery Action").click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.recovery_actions.length, 1);
    var rec = data.recovery_actions[0];
    assert.strictEqual(rec.estimated_recovery_days, 3);
    assert.strictEqual(rec.estimated_cost, 15000);

    var text = outlet().textContent;
    assert.ok(text.indexOf("est. 3d recovery") !== -1);
    assert.ok(text.indexOf("est. cost 15,000") !== -1, "got: " + text.slice(text.indexOf("Add a second crew"), text.indexOf("Add a second crew") + 200));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Delay & Recovery Dashboard rolls up the open recovery action's estimated days/cost", async () => {
    win.PCC.router.go("delayRecoveryDashboard");
    await flush();

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    function kpiValue(label) {
      var card = kpiCards.find((c) => c.textContent.indexOf(label) !== -1);
      return card ? card.querySelector(".kpi-card__value").textContent : undefined;
    }
    assert.strictEqual(kpiValue("EST. RECOVERY DAYS (OPEN)"), "3");
    assert.strictEqual(kpiValue("EST. RECOVERY COST (OPEN)"), "15,000");

    var text = outlet().textContent;
    assert.ok(text.indexOf("est. 3d recovery") !== -1);
    assert.ok(text.indexOf("est. cost 15,000") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("marking the recovery action Completed drops it out of the OPEN rollup (its estimate is now historical)", () => {
    win.PCC.store.update(function (d) {
      d.recovery_actions[0].status = "completed";
    });
    win.PCC.router.render();

    var kpiCards = Array.from(outlet().querySelectorAll(".kpi-card"));
    var estDaysCard = kpiCards.find((c) => c.textContent.indexOf("EST. RECOVERY DAYS") !== -1);
    assert.ok(!estDaysCard, "the est. days/cost KPI row should disappear entirely once no OPEN action has an estimate");
  });

  await check("this gate writes nothing back beyond the deliberate seed/recovery-action edits above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.activities.length, 3);
    assert.strictEqual(data.relationships.length, 1);
    assert.strictEqual(data.schedules.length, 1);
    assert.strictEqual(data.recovery_actions.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 24 (Recovery & Mitigation Planning)", async () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
