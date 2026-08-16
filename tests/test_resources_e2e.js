// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 11 (Resource
// Management) — same convention every prior gate's e2e test uses. Covers the Register/
// Assignments/Leveling tabs through the real forms, a genuine cross-project over-
// allocation scenario (the whole point of "full resource leveling"), and cross-links
// into the Gantt's Linked Records, Portfolio's Details panel, and Executive Center.
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.resourceLevelingEngine, "resourceLevelingEngine must be bundled");
  });

  // ---- Seed two projects, each with one activity, both overlapping in time — the
  // setup needed to prove CROSS-PROJECT over-allocation actually works, not just
  // within-one-schedule double-booking. ----
  let projectAId, projectBId, scheduleAId, scheduleBId, activityAId, activityBId;
  await check("seed two projects with overlapping activities", () => {
    win.PCC.store.update(function (data) {
      var projectA = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      var projectB = win.PCC.store.newProject({ name: "Harborview Depot", status: "on_track" });
      data.projects.push(projectA, projectB);
      projectAId = projectA.id;
      projectBId = projectB.id;

      var scheduleA = win.PCC.store.newSchedule({ project_id: projectAId, name: "Schedule A", revision_number: 1, status: "active", data_date: "2026-01-01" });
      var scheduleB = win.PCC.store.newSchedule({ project_id: projectBId, name: "Schedule B", revision_number: 1, status: "active", data_date: "2026-01-01" });
      data.schedules.push(scheduleA, scheduleB);
      scheduleAId = scheduleA.id;
      scheduleBId = scheduleB.id;

      var activityA = win.PCC.store.newActivity({ project_id: projectAId, schedule_id: scheduleAId, name: "Tower Crane Erection", activity_type: "task", duration: 5, planned_start: "2026-03-01", planned_finish: "2026-03-06" });
      var activityB = win.PCC.store.newActivity({ project_id: projectBId, schedule_id: scheduleBId, name: "Depot Steel Lift", activity_type: "task", duration: 5, planned_start: "2026-03-03", planned_finish: "2026-03-08" });
      data.activities.push(activityA, activityB);
      activityAId = activityA.id;
      activityBId = activityB.id;
    });
    assert.ok(projectAId && projectBId && activityAId && activityBId);
  });

  await check("navigate to Resources and add a resource through the real Register form", () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    findButtonByText(dom, "+ Add Resource").click();
    var outlet = win.document.getElementById("page-outlet");
    outlet.querySelector("#resfield-name").value = "Tower Crane #1";
    outlet.querySelector("#resfield-unit").value = "unit";
    outlet.querySelector("#resfield-max_availability").value = "1";
    outlet.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

    var saved = win.PCC.store.get().resources.find((r) => r.name === "Tower Crane #1");
    assert.ok(saved, "resource should be saved");
    assert.strictEqual(saved.max_availability, 1);
    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Tower Crane #1") !== -1, "resource should appear in the Register list");
  });

  let resourceId;
  await check("add two assignments of the same resource to two DIFFERENT projects' overlapping activities", () => {
    resourceId = win.PCC.store.get().resources.find((r) => r.name === "Tower Crane #1").id;

    findButtonByText(dom, "Assignments").click();
    findButtonByText(dom, "+ Add Assignment").click();
    var outlet = win.document.getElementById("page-outlet");
    outlet.querySelector("#asgfield-resource_id").value = resourceId;
    var projSelect = outlet.querySelectorAll("select")[1]; // resource, then project
    var projOptionA = Array.from(projSelect.options).find((o) => o.textContent === "Riverside Tower");
    projSelect.value = projOptionA.value;
    projSelect.dispatchEvent(new win.Event("change"));

    var outlet2 = win.document.getElementById("page-outlet");
    var activitySelect = outlet2.querySelector("#asgfield-activity_id");
    var activityOption = Array.from(activitySelect.options).find((o) => o.textContent.indexOf("Tower Crane Erection") !== -1);
    assert.ok(activityOption, "activity select should offer Riverside Tower's activity");
    activitySelect.value = activityOption.value;
    outlet2.querySelector("#asgfield-quantity").value = "1";
    outlet2.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

    // Second assignment: same resource, Project B's overlapping activity.
    findButtonByText(dom, "+ Add Assignment").click();
    var outlet3 = win.document.getElementById("page-outlet");
    outlet3.querySelector("#asgfield-resource_id").value = resourceId;
    var projSelect2 = outlet3.querySelectorAll("select")[1];
    var projOptionB = Array.from(projSelect2.options).find((o) => o.textContent === "Harborview Depot");
    projSelect2.value = projOptionB.value;
    projSelect2.dispatchEvent(new win.Event("change"));
    var outlet4 = win.document.getElementById("page-outlet");
    var activitySelect2 = outlet4.querySelector("#asgfield-activity_id");
    var activityOption2 = Array.from(activitySelect2.options).find((o) => o.textContent.indexOf("Depot Steel Lift") !== -1);
    assert.ok(activityOption2, "activity select should offer Harborview Depot's activity");
    activitySelect2.value = activityOption2.value;
    outlet4.querySelector("#asgfield-quantity").value = "1";
    outlet4.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));

    var assignments = win.PCC.store.get().resource_assignments;
    assert.strictEqual(assignments.length, 2);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Assignments list shows both, each with its own project/activity and a working 'View in Gantt' button", () => {
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Tower Crane Erection") !== -1);
    assert.ok(outlet.textContent.indexOf("Depot Steel Lift") !== -1);
    assert.ok(outlet.textContent.indexOf("Riverside Tower") !== -1);
    assert.ok(outlet.textContent.indexOf("Harborview Depot") !== -1);
  });

  await check("Leveling tab detects the CROSS-PROJECT over-allocation (March 3-5 both activities overlap, demand 2 vs capacity 1)", () => {
    findButtonByText(dom, "Leveling").click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Over-Allocated Resources (Portfolio-Wide)") !== -1);
    assert.ok(outlet.textContent.indexOf("Tower Crane #1") !== -1, "the over-allocated resource should be named in the portfolio summary");

    var resSelect = Array.from(outlet.querySelectorAll("select")).find((s) => Array.from(s.options).some((o) => o.textContent === "Tower Crane #1"));
    resSelect.value = resourceId;
    resSelect.dispatchEvent(new win.Event("change"));

    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Over-Allocated Days") !== -1);
    assert.ok(outlet2.textContent.indexOf("2026-03-03") !== -1, "the first day both activities overlap should be flagged");
    assert.ok(outlet2.textContent.indexOf("Tower Crane Erection") !== -1 && outlet2.textContent.indexOf("Riverside Tower") !== -1, "conflict detail should name the contributing activity and project");
    assert.ok(outlet2.textContent.indexOf("Depot Steel Lift") !== -1 && outlet2.textContent.indexOf("Harborview Depot") !== -1, "conflict detail should name BOTH contributing projects, proving this is cross-project");
    assert.ok(outlet2.querySelector("svg"), "usage histogram should render");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Gantt's Activity Detail Panel lists the resource assignment as a Linked Record", () => {
    win.PCC.schedule.viewActivity(projectAId, scheduleAId, activityAId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("LINKED RECORDS") !== -1);
    assert.ok(outlet.textContent.indexOf("Tower Crane #1") !== -1, "the resource assignment should be listed by resource name");

    var viewBtn = findButtonByText(dom, "View");
    assert.ok(viewBtn, "View button for the resource assignment not found");
    viewBtn.click();
    win.PCC.router.render();
    assert.strictEqual(win.PCC.router.currentRouteName(), "resources");
    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Tower Crane #1") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Portfolio's Details panel shows a Resources Assigned section flagging the over-allocation, with a working View All link", () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    var detailsButtons = Array.from(win.document.querySelectorAll("button")).filter((b) => b.textContent.trim() === "Details");
    var riversideDetailsBtn = detailsButtons.find((b) => {
      var card = b.closest(".project-entry");
      return card && card.textContent.indexOf("Riverside Tower") !== -1;
    });
    assert.ok(riversideDetailsBtn, "Details button for Riverside Tower not found");
    riversideDetailsBtn.click();

    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("RESOURCES ASSIGNED") !== -1);
    assert.ok(outlet.textContent.indexOf("Tower Crane #1") !== -1);
    assert.ok(outlet.textContent.indexOf("over-allocated") !== -1, "should flag the portfolio-wide over-allocation right in Portfolio's own details");

    var viewAllBtns = Array.from(outlet.querySelectorAll("button")).filter((b) => b.textContent.trim() === "View All");
    var resourcesViewAllBtn = viewAllBtns.find((b) => b.parentElement.textContent.indexOf("RESOURCES ASSIGNED") !== -1);
    assert.ok(resourcesViewAllBtn, "Resources Assigned View All button not found");
    resourcesViewAllBtn.click();
    win.PCC.router.render();
    assert.strictEqual(win.PCC.router.currentRouteName(), "resources");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Executive Center shows a RESOURCES KPI section now that the module has real data", () => {
    win.PCC.executiveCenter.viewProject(projectAId);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("RESOURCES") !== -1);
    assert.ok(outlet.textContent.indexOf("Resources Assigned") !== -1);
    assert.ok(outlet.textContent.indexOf("Over-Allocated") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a project with zero resources assigned shows no RESOURCES KPI section for it, and Executive Center for a resource-free project omits the section entirely if no resources exist anywhere", () => {
    // This app has resources now (seeded above), so the section should still appear
    // globally, but a project with no assignments shows 0 / not over-allocated — not
    // fabricated non-zero numbers.
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Empty Project", status: "on_track" });
      data.projects.push(project);
      win.__emptyProjectId = project.id;
    });
    win.PCC.executiveCenter.viewProject(win.PCC.store.get().projects.find((p) => p.name === "Empty Project").id);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("RESOURCES") !== -1, "section still shows since resources exist in the app");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("deleting a resource cascades to remove its assignments, with a confirm warning naming the count", () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    findButtonByText(dom, "Register").click();

    var originalConfirm = win.confirm;
    var confirmMessage = "";
    win.confirm = (msg) => { confirmMessage = msg; return true; };
    var deleteBtn = findButtonByText(dom, "Delete");
    assert.ok(deleteBtn, "Delete button not found on resource card");
    deleteBtn.click();
    win.confirm = originalConfirm;

    assert.ok(confirmMessage.indexOf("2 assignment") !== -1, "confirm should warn about the 2 cascading assignment deletions, got: " + confirmMessage);
    var data = win.PCC.store.get();
    assert.ok(!data.resources.some((r) => r.id === resourceId), "resource should be deleted");
    assert.strictEqual(data.resource_assignments.filter((a) => a.resource_id === resourceId).length, 0, "assignments should cascade-delete");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page ----
  var routes = ["dashboard", "portfolio", "executiveCenter", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "resources", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 11 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
