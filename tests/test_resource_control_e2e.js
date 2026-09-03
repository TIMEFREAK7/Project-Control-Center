// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 18 (PCC Evolution
// Roadmap, Tier F: Resource Management — 2026-08-19). A fresh inspection found Gate 11's
// Resource Management already covers a shared portfolio-wide register, assignments,
// cross-project resource loading, a histogram, and over-allocation detection — but the
// spec's own asks for planned-vs-actual allocation, working hours/overtime, leave/
// unavailable periods (and their effect on computed availability), real utilisation %,
// a demand-vs-shortage rollup, granular resource type categories, and Resource<->Vendor
// linkage did not exist at all. This gate adds all of those, confirmed via
// AskUserQuestion: working hours/overtime as simple aggregate fields (not a daily
// time-entry log), leave/unavailable periods as structured date ranges that actually
// reduce computed availability, and the new vendor_id living on the Assignment (not the
// Resource) since the same shared resource can be sourced differently per activity.
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
    assert.ok(win.PCC.store.RESOURCE_TYPES.indexOf("skilled_labor") !== -1, "expanded RESOURCE_TYPES must be bundled");
    assert.ok(win.PCC.resourceLevelingEngine.computeUtilisation, "computeUtilisation must be bundled");
  });

  // ---- Seed: one project, one resource (max_availability 5), one activity/assignment
  // where demand (5) exactly matches capacity — NOT over-allocated on its own. A leave
  // period then reduces capacity below demand on two of those five days, proving
  // over-allocation is now genuinely leave-adjusted, not just a flat daily number. ----
  let projectId, scheduleId, activityId, resourceId, vendorId, assignmentId;
  await check("seed a project/activity, a resource, an assignment matching capacity exactly, and a vendor", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Coastal Substation", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var activity = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Cable Pulling",
        activity_type: "task", duration: 5, planned_start: "2020-01-01", planned_finish: "2020-01-06",
      });
      data.activities.push(activity);
      activityId = activity.id;

      var resource = win.PCC.store.newResource({ name: "Skilled Electricians", type: "skilled_labor", unit: "person", max_availability: 5 });
      data.resources.push(resource);
      resourceId = resource.id;

      var vendor = win.PCC.store.newVendor({ vendor_name: "Voltage Crew Co" });
      data.vendors.push(vendor);
      vendorId = vendor.id;

      var assignment = win.PCC.store.newResourceAssignment({
        resource_id: resourceId, activity_id: activityId, quantity: 5,
        actual_quantity: 4, planned_hours_per_day: 8, overtime_hours: 6, vendor_id: vendorId,
      });
      data.resource_assignments.push(assignment);
      assignmentId = assignment.id;
    });
    assert.ok(projectId && activityId && resourceId && vendorId && assignmentId);
  });

  await check("the Leveling tab shows NO over-allocation yet (demand 5 exactly matches capacity 5)", async () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    // resources.js is a React-migrated page — go() already renders its INITIAL mount
    // synchronously (reactBridge.js wraps it in flushSync), but await flush() anyway
    // before interacting, and after every click whose state update commits
    // asynchronously (see CLAUDE.md's React migration notes).
    await flush();
    findButtonByText(dom, "Leveling").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Skilled Electricians") !== -1);
    assert.ok(text.indexOf("Over-Allocated Days") !== -1);
    // KPI card should read 0, not blank/dash, since max_availability IS set.
    var overAllocCard = Array.from(outlet().querySelectorAll(".kpi-card")).find((c) => c.textContent.indexOf("Over-Allocated Days") !== -1);
    assert.ok(overAllocCard && overAllocCard.querySelector(".kpi-card__value").textContent === "0");
  });

  await check("adding a leave period that reduces capacity below demand triggers over-allocation on exactly those days", async () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "Unavailability").click();
    await flush();
    findButtonByText(dom, "+ Add Period").click();
    await flush();

    win.document.getElementById("unavfield-resource_id").value = resourceId;
    win.document.getElementById("unavfield-start_date").value = "2020-01-03";
    win.document.getElementById("unavfield-end_date").value = "2020-01-04";
    win.document.getElementById("unavfield-quantity").value = "2";
    win.document.getElementById("unavfield-reason").value = "Training Course";
    findButtonByText(dom, "Add Period").click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("2020-01-03 to 2020-01-04") !== -1, "the new period should be listed");
    assert.ok(text.indexOf("Training Course") !== -1);

    findButtonByText(dom, "Leveling").click();
    await flush();
    var levelingText = outlet().textContent;
    var overAllocCard = Array.from(outlet().querySelectorAll(".kpi-card")).find((c) => c.textContent.indexOf("Over-Allocated Days") !== -1);
    assert.strictEqual(overAllocCard.querySelector(".kpi-card__value").textContent, "2", "exactly the 2 leave-overlapping days should now be over-allocated");
    var worstCard = Array.from(outlet().querySelectorAll(".kpi-card")).find((c) => c.textContent.indexOf("Worst Over-Allocation") !== -1);
    assert.strictEqual(worstCard.querySelector(".kpi-card__value").textContent, "+2", "5 needed vs 3 available (5-2 leave) = +2");
    assert.ok(levelingText.indexOf("2020-01-03") !== -1 && levelingText.indexOf("needed vs 3 available") !== -1, "conflict day detail should show leave-adjusted availability (3, not the flat 5)");
  });

  await check("Demand vs Available and Avg. Utilisation KPIs reflect the leave-adjusted numbers", () => {
    var demandCard = Array.from(outlet().querySelectorAll(".kpi-card")).find((c) => c.textContent.indexOf("Demand vs Available") !== -1);
    assert.strictEqual(demandCard.querySelector(".kpi-card__value").textContent, "25 / 21 unit-days", "5/day * 5 days = 25 demand; (5+5+3+3+5) = 21 available after leave");
    var utilCard = Array.from(outlet().querySelectorAll(".kpi-card")).find((c) => c.textContent.indexOf("Avg. Utilisation") !== -1);
    assert.ok(utilCard.querySelector(".kpi-card__value").textContent.indexOf("%") !== -1);
    assert.ok(outlet().textContent.indexOf("Utilisation Trend") !== -1, "trend chart panel must render");
    assert.ok(outlet().textContent.indexOf("Shortfall: 4 unit-day(s)") !== -1, "2 over-allocated days * 2 shortfall each = 4 unit-days");
  });

  await check("the Assignment form round-trips actual quantity, planned/overtime hours, and the sourcing vendor", async () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "Assignments").click();
    await flush();
    var editBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit");
    assert.ok(editBtn, "no Edit button found on the seeded assignment");
    editBtn.click();
    await flush();

    assert.strictEqual(win.document.getElementById("asgfield-actual_quantity").value, "4");
    assert.strictEqual(win.document.getElementById("asgfield-planned_hours_per_day").value, "8");
    assert.strictEqual(win.document.getElementById("asgfield-overtime_hours").value, "6");
    assert.strictEqual(win.document.getElementById("asgfield-vendor_id").value, vendorId);

    var listText = outlet().textContent;
    assert.ok(listText.indexOf("planned 5, actual 4") !== -1, "list row should show planned vs actual");
    assert.ok(listText.indexOf("8 hrs/day") !== -1 && listText.indexOf("6 OT hrs") !== -1);
    assert.ok(listText.indexOf("Voltage Crew Co") !== -1, "sourcing vendor should be shown");
  });

  await check("the expanded resource type list is offered on the Register form, including a legacy value", async () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "Register").click();
    await flush();
    findButtonByText(dom, "+ Add Resource").click();
    await flush();
    var typeSelect = win.document.getElementById("resfield-type");
    var optionValues = Array.from(typeSelect.options).map((o) => o.value);
    ["employee", "engineer", "supervisor", "skilled_labor", "unskilled_labor", "contractor", "subcontractor", "equipment", "machinery", "material", "labor"].forEach((t) => {
      assert.ok(optionValues.indexOf(t) !== -1, "missing resource type option: " + t);
    });
    findButtonByText(dom, "Cancel").click();
    await flush();
  });

  await check("Schedule's Activity Detail Panel shows an Over-Allocated badge for the resource on this activity's own dates", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.go("schedule");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Skilled Electricians") !== -1, "resource assignment must still be listed as a linked record");
    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — availability is
    // now signaled by the row's icon color, not a separate .status-badge element.
    var resourceRow = Array.from(outlet().querySelectorAll(".attention-item")).find((r) => r.textContent.indexOf("Skilled Electricians") !== -1);
    assert.ok(resourceRow, "no linked-record row found for the resource assignment");
    assert.ok(resourceRow.querySelector(".attention-item__icon--critical"), "this activity's own Jan 1-6 window overlaps the Jan 3-4 over-allocated days, so the row should show the critical icon");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a resource with no over-allocation shows an Available badge instead", async () => {
    var okActivityId, okAssignmentId;
    win.PCC.store.update(function (data) {
      var okActivity = win.PCC.store.newActivity({
        project_id: projectId, schedule_id: scheduleId, name: "Panel Testing",
        activity_type: "task", duration: 3, planned_start: "2021-06-01", planned_finish: "2021-06-04",
      });
      data.activities.push(okActivity);
      okActivityId = okActivity.id;
      var okResource = win.PCC.store.newResource({ name: "Test Technician", type: "engineer", max_availability: 2 });
      data.resources.push(okResource);
      var okAssignment = win.PCC.store.newResourceAssignment({ resource_id: okResource.id, activity_id: okActivityId, quantity: 1 });
      data.resource_assignments.push(okAssignment);
      okAssignmentId = okAssignment.id;
    });
    win.PCC.schedule.viewActivity(projectId, scheduleId, okActivityId);
    win.PCC.router.go("schedule");
    await flush();
    var resourceRow = Array.from(outlet().querySelectorAll(".attention-item")).find((r) => r.textContent.indexOf("Test Technician") !== -1);
    assert.ok(resourceRow, "no linked-record row found for the resource assignment");
    assert.ok(resourceRow.querySelector(".attention-item__icon--on_track"), "a non-over-allocated resource should show the on_track icon");
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged apart from the deliberate additions above", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.resources.length, 2);
    assert.strictEqual(data.resource_assignments.length, 2);
    assert.strictEqual(data.resource_unavailability.length, 1);
    assert.strictEqual(data.activities.length, 2);
    assert.strictEqual(data.vendors.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 18 (Resource Management)", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
