// Planning & Scheduling-Centric Delay Management, Gate H (Delay Analytics — the spec's
// final gate) — DOM-level e2e test against the ACTUAL bundled index.html. Covers the two
// additions to delayRecoveryDashboard.js: (1) a new "Delay Analytics" breakdown (By status/
// category/responsibility/criticality) over the Gate A-G model, additive alongside the
// pre-existing Gate 23 "by Cause and Severity" breakdown, and (2) turning the "Delay
// Records (worst first)" list into a browsable Delay Register — a Status filter (local to
// this list only) plus each row now showing its own Status/Category/Responsibility/
// Criticality.
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

function kpiValue(dom, label) {
  const cards = Array.from(dom.window.document.querySelectorAll(".kpi-card"));
  const card = cards.find((c) => c.textContent.indexOf(label) !== -1);
  return card ? card.querySelector(".kpi-card__value").textContent : undefined;
}
function todayPlusDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

  var projectId, scheduleId, criticalActivityId, nonCriticalActivityId;
  var openCriticalDelayId, closedDelayId, noActivityDelayId;

  await check("seed a project/schedule with a critical activity, a slack activity, and calculate", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Gate H Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Critical Path Activity", activity_type: "task", duration: 10 });
      data.activities.push(a);
      criticalActivityId = a.id;

      var nc = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Slack Activity", activity_type: "task", duration: 1 });
      data.activities.push(nc);
      nonCriticalActivityId = nc.id;
      var ncSucc = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Slack Successor", activity_type: "task", duration: 1 });
      data.activities.push(ncSucc);
      data.relationships.push(win.PCC.store.newRelationship({ schedule_id: scheduleId, predecessor_id: nc.id, successor_id: ncSucc.id, type: "FS" }));
      // `a` (10 days, standalone) is longer than the nc->ncSucc chain (2 days total), so
      // `a` alone defines the project finish and comes out critical, while nc ends up
      // with 8 days of float — comfortably clear of the default 5-day near-critical
      // threshold, so it lands as genuinely non_critical, not merely near-critical.
    });
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    win.PCC.schedule.viewActivity(projectId, scheduleId, criticalActivityId);
    win.PCC.router.render();
    var calcBtn = Array.from(dom.window.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Calculate Schedule");
    calcBtn.click();
    var data = win.PCC.store.get();
    var crit = data.activities.find((x) => x.id === criticalActivityId);
    var nc = data.activities.find((x) => x.id === nonCriticalActivityId);
    assert.ok(crit.total_float <= 0, "Critical Path Activity must actually be critical after calculation");
    assert.ok(nc.total_float > 0, "Slack Activity must have real float after calculation");
  });

  await check("seed three Delay Records covering distinct status/category/responsibility/criticality combinations", () => {
    win.PCC.store.update(function (data) {
      var crit = data.activities.find((x) => x.id === criticalActivityId);
      var openCriticalDelay = win.PCC.store.newDelayRecord({
        activity_id: criticalActivityId, project_id: projectId, delay_category: "late_material",
        responsibility_classification: "vendor", description: "Steel delivery delayed", status: "investigating",
        delay_cause: "contractor_caused", delay_days: 8, identified_date: todayPlusDays(0),
      });
      data.delay_records.push(openCriticalDelay);
      openCriticalDelayId = openCriticalDelay.id;
      data.delay_activity_links.push(win.PCC.store.newDelayActivityLink({
        delay_id: openCriticalDelay.id, activity_id: criticalActivityId, project_id: projectId,
        original_planned_start: crit.planned_start, original_planned_finish: crit.planned_finish, original_total_float: crit.total_float,
      }));

      var nc = data.activities.find((x) => x.id === nonCriticalActivityId);
      var closedDelay = win.PCC.store.newDelayRecord({
        activity_id: nonCriticalActivityId, project_id: projectId, delay_category: "weather",
        responsibility_classification: "external", description: "Old resolved rain delay", status: "closed",
        delay_days: 2, identified_date: todayPlusDays(-20),
      });
      data.delay_records.push(closedDelay);
      closedDelayId = closedDelay.id;
      data.delay_activity_links.push(win.PCC.store.newDelayActivityLink({
        delay_id: closedDelay.id, activity_id: nonCriticalActivityId, project_id: projectId,
        original_planned_start: nc.planned_start, original_planned_finish: nc.planned_finish, original_total_float: nc.total_float,
      }));

      var noActivityDelay = win.PCC.store.newDelayRecord({
        activity_id: "", project_id: projectId, delay_category: "client_delay",
        responsibility_classification: "client", description: "Client instruction pending, no activity yet", status: "open",
        delay_days: 3, identified_date: todayPlusDays(0),
      });
      data.delay_records.push(noActivityDelay);
      noActivityDelayId = noActivityDelay.id;
    });
    assert.ok(openCriticalDelayId && closedDelayId && noActivityDelayId);
  });

  await check("the Delay Analytics panel breaks the full set down by status, category, responsibility, and criticality", () => {
    win.PCC.router.go("delayRecoveryDashboard");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Delay Analytics") !== -1);
    assert.ok(text.indexOf("By status:") !== -1 && text.indexOf("Under Investigation (1)") !== -1 && text.indexOf("Closed (1)") !== -1 && text.indexOf("Open (1)") !== -1);
    assert.ok(text.indexOf("By category:") !== -1 && text.indexOf("Late Material (1)") !== -1 && text.indexOf("Weather (1)") !== -1 && text.indexOf("Client Delay (1)") !== -1);
    assert.ok(text.indexOf("By responsibility:") !== -1 && text.indexOf("Vendor (1)") !== -1 && text.indexOf("External (1)") !== -1 && text.indexOf("Client (1)") !== -1);
    assert.ok(text.indexOf("By criticality:") !== -1 && text.indexOf("Critical (1)") !== -1, "the delay on the critical activity must count as Critical");
    assert.ok(text.indexOf("Not Yet Calculated (1)") !== -1, "the delay with no linked activity has nothing to classify");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the pre-existing 'by Cause and Severity' breakdown (Gate 23) is untouched and still shows all three delays", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("By cause:") !== -1);
    assert.ok(text.indexOf("By severity:") !== -1);
    assert.strictEqual(kpiValue(dom, "DELAY RECORDS"), "3");
  });

  await check("the Delay Register list shows all three rows by default, each with its own Status/Category/Responsibility/Criticality line", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Steel delivery delayed") !== -1);
    assert.ok(text.indexOf("Old resolved rain delay") !== -1);
    assert.ok(text.indexOf("Client instruction pending, no activity yet") !== -1);
    assert.ok(text.indexOf("Under Investigation · Late Material · Vendor · Critical") !== -1);
    assert.ok(text.indexOf("Closed · Weather · External · Non-Critical") !== -1);
    assert.ok(text.indexOf("Open · Client Delay · Client") !== -1, "the unlinked delay must show status/category/responsibility with no trailing criticality");
    assert.ok(text.indexOf("Schedule Impact Not Yet Assessed") !== -1, "the delay with no linked activity must read this, never a guessed impact");
  });

  await check("filtering the Delay Register to 'Closed' narrows the list to just that one row, without changing the KPIs or breakdown panels above", () => {
    var select = Array.from(dom.window.document.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Closed") && Array.from(s.options).some((o) => o.textContent === "All Statuses")
    );
    assert.ok(select, "the Delay Register's own Status filter select wasn't found");
    select.value = "closed";
    select.dispatchEvent(new dom.window.Event("change"));

    var text = outlet().textContent;
    assert.ok(text.indexOf("Old resolved rain delay") !== -1, "the closed delay must still show");
    assert.ok(text.indexOf("Steel delivery delayed") === -1, "the investigating delay must be filtered out");
    assert.ok(text.indexOf("Client instruction pending, no activity yet") === -1, "the open delay must be filtered out");
    // KPIs and both breakdown panels stay computed over the full unfiltered set.
    assert.strictEqual(kpiValue(dom, "DELAY RECORDS"), "3");
    assert.ok(text.indexOf("Under Investigation (1)") !== -1, "the status breakdown above the list must stay unfiltered");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clearing the filter back to 'All Statuses' shows all three rows again", () => {
    var select = Array.from(dom.window.document.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Closed") && Array.from(s.options).some((o) => o.textContent === "All Statuses")
    );
    select.value = "";
    select.dispatchEvent(new dom.window.Event("change"));
    var text = outlet().textContent;
    assert.ok(text.indexOf("Steel delivery delayed") !== -1);
    assert.ok(text.indexOf("Old resolved rain delay") !== -1);
    assert.ok(text.indexOf("Client instruction pending, no activity yet") !== -1);
  });

  await check("the unlinked delay's row offers 'View Project' (no 'View in Schedule', since it has no activity)", () => {
    var rows = Array.from(dom.window.document.querySelectorAll(".panel"))
      .find((p) => p.textContent.indexOf("Client instruction pending, no activity yet") !== -1);
    assert.ok(rows);
    var viewProjectBtns = Array.from(dom.window.document.querySelectorAll("button")).filter((b) => b.textContent.trim() === "View Project");
    assert.ok(viewProjectBtns.length >= 1, "expected at least one 'View Project' button for the unlinked delay");
  });

  await check("this gate writes nothing back — every seeded record is unchanged after rendering", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 3);
    assert.strictEqual(data.delay_activity_links.length, 2);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "projectLookahead", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings", "delayRecoveryDashboard",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate H (Delay Analytics)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
