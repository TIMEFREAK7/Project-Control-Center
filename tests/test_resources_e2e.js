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

// resources.js is a React-migrated page: a raw `.value =` assignment doesn't reliably
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

  await check("navigate to Resources and add a resource through the real Register form", async () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    // resources.js is a React-migrated page — go() already renders its INITIAL mount
    // synchronously (reactBridge.js wraps it in flushSync), but await flush() anyway
    // before interacting, and after every click whose state update commits
    // asynchronously (see CLAUDE.md's React migration notes).
    await flush();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    findButtonByText(dom, "+ Add Resource").click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    outlet.querySelector("#resfield-name").value = "Tower Crane #1";
    outlet.querySelector("#resfield-unit").value = "unit";
    outlet.querySelector("#resfield-max_availability").value = "1";
    outlet.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var saved = win.PCC.store.get().resources.find((r) => r.name === "Tower Crane #1");
    assert.ok(saved, "resource should be saved");
    assert.strictEqual(saved.max_availability, 1);
    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Tower Crane #1") !== -1, "resource should appear in the Register list");
  });

  let resourceId;
  await check("add two assignments of the same resource to two DIFFERENT projects' overlapping activities", async () => {
    resourceId = win.PCC.store.get().resources.find((r) => r.name === "Tower Crane #1").id;

    findButtonByText(dom, "Assignments").click();
    await flush();
    findButtonByText(dom, "+ Add Assignment").click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    outlet.querySelector("#asgfield-resource_id").value = resourceId;
    var projSelect = outlet.querySelectorAll("select")[1]; // resource, then project
    var projOptionA = Array.from(projSelect.options).find((o) => o.textContent === "Riverside Tower");
    setReactSelectValue(win, projSelect, projOptionA.value);
    await flush();

    var outlet2 = win.document.getElementById("page-outlet");
    var activitySelect = outlet2.querySelector("#asgfield-activity_id");
    var activityOption = Array.from(activitySelect.options).find((o) => o.textContent.indexOf("Tower Crane Erection") !== -1);
    assert.ok(activityOption, "activity select should offer Riverside Tower's activity");
    activitySelect.value = activityOption.value;
    outlet2.querySelector("#asgfield-quantity").value = "1";
    outlet2.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    // Second assignment: same resource, Project B's overlapping activity.
    findButtonByText(dom, "+ Add Assignment").click();
    await flush();
    var outlet3 = win.document.getElementById("page-outlet");
    outlet3.querySelector("#asgfield-resource_id").value = resourceId;
    var projSelect2 = outlet3.querySelectorAll("select")[1];
    var projOptionB = Array.from(projSelect2.options).find((o) => o.textContent === "Harborview Depot");
    setReactSelectValue(win, projSelect2, projOptionB.value);
    await flush();
    var outlet4 = win.document.getElementById("page-outlet");
    var activitySelect2 = outlet4.querySelector("#asgfield-activity_id");
    var activityOption2 = Array.from(activitySelect2.options).find((o) => o.textContent.indexOf("Depot Steel Lift") !== -1);
    assert.ok(activityOption2, "activity select should offer Harborview Depot's activity");
    activitySelect2.value = activityOption2.value;
    outlet4.querySelector("#asgfield-quantity").value = "1";
    outlet4.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

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

  await check("Leveling tab detects the CROSS-PROJECT over-allocation (March 3-5 both activities overlap, demand 2 vs capacity 1)", async () => {
    findButtonByText(dom, "Leveling").click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Over-Allocated Resources (Portfolio-Wide)") !== -1);
    assert.ok(outlet.textContent.indexOf("Tower Crane #1") !== -1, "the over-allocated resource should be named in the portfolio summary");

    var resSelect = Array.from(outlet.querySelectorAll("select")).find((s) => Array.from(s.options).some((o) => o.textContent === "Tower Crane #1"));
    setReactSelectValue(win, resSelect, resourceId);
    await flush();

    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Over-Allocated Days") !== -1);
    assert.ok(outlet2.textContent.indexOf("2026-03-03") !== -1, "the first day both activities overlap should be flagged");
    assert.ok(outlet2.textContent.indexOf("Tower Crane Erection") !== -1 && outlet2.textContent.indexOf("Riverside Tower") !== -1, "conflict detail should name the contributing activity and project");
    assert.ok(outlet2.textContent.indexOf("Depot Steel Lift") !== -1 && outlet2.textContent.indexOf("Harborview Depot") !== -1, "conflict detail should name BOTH contributing projects, proving this is cross-project");
    assert.ok(outlet2.querySelector("svg"), "usage histogram should render");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Gantt's Activity Detail Panel lists the resource assignment as a Linked Record", async () => {
    win.PCC.schedule.viewActivity(projectAId, scheduleAId, activityAId);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("LINKED RECORDS") !== -1);
    assert.ok(outlet.textContent.indexOf("Tower Crane #1") !== -1, "the resource assignment should be listed by resource name");

    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — the whole
    // row is the click target now, no separate "View" button.
    var viewRow = Array.from(outlet.querySelectorAll(".attention-item--clickable")).find((r) => r.textContent.indexOf("Tower Crane #1") !== -1);
    assert.ok(viewRow, "row for the resource assignment not found");
    viewRow.click();
    // resources.js is a React-migrated page — the row's onclick already calls
    // window.PCC.resources.expandAssignment() + router.go("resources"), and go()
    // already renders. Deliberately no extra win.PCC.router.render() call here — that
    // would trigger a second, fresh remount that no longer has the pending props to
    // consume, silently losing them (see CLAUDE.md's React migration notes).
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "resources");
    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Tower Crane #1") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Portfolio's Details panel shows a Resources Assigned section flagging the over-allocation, with a working View All link", async () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    // portfolio.js is still vanilla, but flush anyway before interacting — leaving this
    // navigation unflushed could leak a pending hashchange into a later check that DOES
    // touch a React-migrated route (see CLAUDE.md's React migration notes on this race).
    await flush();
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
    // resources.js is a React-migrated page — portfolio.js's click handler already
    // calls window.PCC.resources.filterByProject() + router.go("resources") itself,
    // and go() already renders synchronously. Deliberately no extra
    // win.PCC.router.render() call here — see the note above.
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "resources");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Executive Center shows a RESOURCES KPI section now that the module has real data", async () => {
    win.PCC.executiveCenter.viewProject(projectAId);
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    await flush();
    // UI/UX Overhaul Gate 5: the old flat KPI stack is now grouped into sub-tabs; a
    // Resources sub-tab only appears (and needs clicking into) once data.resources has
    // real rows, same "only show when the module exists" condition the old always-on
    // RESOURCES section used to gate itself with.
    var resourcesTab = Array.from(win.document.querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Resources");
    assert.ok(resourcesTab, "Resources sub-tab not found");
    resourcesTab.click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("RESOURCES") !== -1);
    assert.ok(outlet.textContent.indexOf("Resources Assigned") !== -1);
    assert.ok(outlet.textContent.indexOf("Over-Allocated") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a project with zero resources assigned shows no RESOURCES KPI section for it, and Executive Center for a resource-free project omits the section entirely if no resources exist anywhere", async () => {
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
    await flush();
    var resourcesTab = Array.from(win.document.querySelectorAll(".toolbar button")).find((b) => b.textContent.trim() === "Resources");
    assert.ok(resourcesTab, "Resources sub-tab still shows since resources exist in the app");
    resourcesTab.click();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("RESOURCES") !== -1, "section still shows since resources exist in the app");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("deleting a resource cascades to remove its assignments, with a confirm warning naming the count", async () => {
    win.PCC.router.go("resources");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "Register").click();
    await flush();

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
