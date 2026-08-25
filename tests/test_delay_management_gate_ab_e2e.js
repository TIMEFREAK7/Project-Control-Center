// Planning & Scheduling-Centric Delay Management, Gate A (Data Foundation) + Gate B
// (Schedule Integration) — DOM-level e2e test against the ACTUAL bundled index.html.
// test_delay_impact_engine.js already covers delayImpactEngine.js's own calculations in
// isolation (mirroring the spec's numbered TEST 1-7 scenarios); this file proves the real
// Activity Detail Panel UI wires it all together: the enriched Delay Record form (status/
// category/responsibility/cause structure), the live Schedule Impact summary, multi-
// activity linking (spec point 9 — one Delay, many Activities), the auto timeline
// (status_history), and Recovery Actions linking to a specific Delay.
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

  await check("app boots without throwing, and the new store exports are bundled", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.store.DELAY_RECORD_STATUSES.indexOf("recovery_in_progress") !== -1);
    assert.ok(win.PCC.store.DELAY_CATEGORIES.indexOf("late_material") !== -1);
    assert.ok(win.PCC.store.DELAY_RESPONSIBILITY_CLASSIFICATIONS.indexOf("vendor") !== -1);
    assert.strictEqual(typeof win.PCC.delayImpactEngine.computeDelayImpact, "function");
  });

  // Same A -> B (FS) + unrelated longer C setup test_advanced_delay_analysis_e2e.js uses,
  // giving B (Foundation) 10 days of real float once calculated.
  let projectId, scheduleId, activityAId, activityBId, activityCId;
  await check("seed a project/schedule with A -> B (FS) and an unrelated longer C giving B 10 days of float, then calculate", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Gate A/B Test Tower", status: "on_track" });
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
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    findButtonByText(dom, "Calculate Schedule").click();
    var b = win.PCC.store.get().activities.find((x) => x.id === activityBId);
    assert.strictEqual(b.total_float, 10);
  });

  var delayId;
  await check("Add Delay Record from the Activity Detail Panel: the enriched fields (status/category/responsibility/cause structure) all persist, and status_history seeds one entry", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityBId);
    win.PCC.router.render();
    findButtonByText(dom, "+ Add Delay Record").click();

    outlet().querySelector("#delayfield-status").value = "investigating";
    outlet().querySelector("#delayfield-delay_category").value = "late_material";
    outlet().querySelector("#delayfield-responsibility_classification").value = "vendor";
    outlet().querySelector("#delayfield-delay_cause").value = "contractor_caused";
    outlet().querySelector("#delayfield-delay_days").value = "6";
    outlet().querySelector("#delayfield-immediate_cause").value = "Rebar delivery late";
    outlet().querySelector("#delayfield-underlying_cause").value = "Supplier capacity shortfall";
    outlet().querySelector("#delayfield-description").value = "Late rebar delivery delaying Foundation.";

    findButtonByText(dom, "Add Delay Record").click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 1);
    var rec = data.delay_records[0];
    delayId = rec.id;
    assert.strictEqual(rec.status, "investigating");
    assert.strictEqual(rec.delay_category, "late_material");
    assert.strictEqual(rec.responsibility_classification, "vendor");
    assert.strictEqual(rec.immediate_cause, "Rebar delivery late");
    assert.strictEqual(rec.underlying_cause, "Supplier capacity shortfall");
    assert.strictEqual(rec.status_history.length, 1, "creating a delay must seed its own timeline with one entry");
    assert.strictEqual(rec.status_history[0].status, "investigating");

    // Spec point 9/35: the primary activity is auto-linked with a frozen snapshot.
    var links = data.delay_activity_links.filter((l) => l.delay_id === delayId);
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].activity_id, activityBId);
    assert.strictEqual(links[0].original_total_float, 10, "the snapshot must capture Foundation's float AT THE MOMENT of delay creation");

    var text = outlet().textContent;
    assert.ok(text.indexOf("Late Material") !== -1);
    assert.ok(text.indexOf("Vendor") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the live Impact Summary reads current float/criticality straight from the Schedule, not a duplicated calculation", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("IMPACT SUMMARY") !== -1);
    assert.ok(text.indexOf("ON TRACK") !== -1, "10 days of float, threshold 5 -> non-critical -> ON TRACK status");
    assert.ok(text.indexOf("Consumed 0d") !== -1, "no schedule change since the snapshot was taken — nothing consumed yet");
    assert.ok(text.indexOf("No current impact") !== -1, "non-critical delay must never report a project-finish impact");
    assert.ok(text.indexOf("Foundation") !== -1);
  });

  await check("spec point 9 ('one Delay, many Activities'): '+ Link Another Activity' adds a second affected activity to the SAME delay, not a duplicate delay", () => {
    findButtonByText(dom, "+ Link Another Activity").click();
    var selects = Array.from(outlet().querySelectorAll("select"));
    var pickerSelect = selects.find((s) => Array.from(s.options).some((o) => o.textContent === "Long Lead Procurement"));
    assert.ok(pickerSelect, "the activity picker should offer 'Long Lead Procurement' (same schedule, not yet linked)");
    pickerSelect.value = activityCId;
    pickerSelect.dispatchEvent(new win.Event("change"));

    findButtonByText(dom, "Link").click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 1, "still exactly one Delay record — not a second one for the second activity");
    var links = data.delay_activity_links.filter((l) => l.delay_id === delayId);
    assert.strictEqual(links.length, 2, "the delay now affects two activities");
    // Plain Node-realm array via Array.from — links itself is a jsdom-realm array, and
    // deepStrictEqual across realms fails on constructor identity even with identical
    // string contents (the same cross-realm gotcha comparing an empty [] hit earlier in
    // this project — see test_company_client_project_management_e2e.js's own notes).
    var linkedActivityIds = Array.from(links, (l) => l.activity_id).sort();
    assert.deepStrictEqual(linkedActivityIds, [activityBId, activityCId].sort());

    var text = outlet().textContent;
    assert.ok(text.indexOf("Long Lead Procurement") !== -1, "the newly linked activity's own schedule impact should now be shown too");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("spec point 20 (Delay Timeline): editing the delay's Status appends a new status_history entry, not just silently overwriting the old one", () => {
    var editBtns = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Edit");
    editBtns[0].click(); // the Delay Record's own Edit (Recovery Actions section not present here yet)
    var statusSelect = outlet().querySelector("#delayfield-status");
    assert.ok(statusSelect, "expected the Delay Record edit form to be open");
    statusSelect.value = "recovery_in_progress";
    findButtonByText(dom, "Save Changes").click();

    var data = win.PCC.store.get();
    var rec = data.delay_records.find((r) => r.id === delayId);
    assert.strictEqual(rec.status, "recovery_in_progress");
    assert.strictEqual(rec.status_history.length, 2, "a real status change must append to the timeline");
    assert.strictEqual(rec.status_history[1].status, "recovery_in_progress");
    assert.ok(outlet().textContent.indexOf("Recovery in Progress") !== -1);
  });

  await check("Recovery Action can link to this specific Delay (not just the activity), with its own Actual Recovery (days) field", () => {
    findButtonByText(dom, "+ Add Recovery Action").click();
    outlet().querySelector("#recactionfield-description").value = "Expedite rebar via air freight.";
    outlet().querySelector("#recactionfield-responsible_person").value = "Site Manager";
    outlet().querySelector("#recactionfield-status").value = "in_progress";
    outlet().querySelector("#recactionfield-estimated_recovery_days").value = "4";
    outlet().querySelector("#recactionfield-actual_recovery_days").value = "3";
    var delaySelect = outlet().querySelector("#recactionfield-delay_id");
    assert.ok(delaySelect, "expected a 'Responds to Delay' picker on the Recovery Action form");
    var delayOption = Array.from(delaySelect.options).find((o) => o.value === delayId);
    assert.ok(delayOption, "the Delay Record just created should be selectable here");
    delaySelect.value = delayId;

    findButtonByText(dom, "Add Recovery Action").click();

    var data = win.PCC.store.get();
    var action = data.recovery_actions.find((r) => r.activity_id === activityBId);
    assert.ok(action);
    assert.strictEqual(action.delay_id, delayId);
    assert.strictEqual(action.actual_recovery_days, 3);
    assert.ok(outlet().textContent.indexOf("actual 3d") !== -1);
    assert.ok(outlet().textContent.indexOf("linked to delay") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("removing a Delay Record cleans up its delay_activity_links and un-links (not deletes) any Recovery Action that pointed to it", () => {
    // Both the Recovery Actions section and the Delay Records section render their own
    // "Remove" button with identical text — scope to the DELAY RECORDS section's own
    // container specifically (found via its own heading) rather than assuming DOM order.
    var delayHeading = Array.from(outlet().querySelectorAll("p")).find((p) => p.textContent.indexOf("DELAY RECORDS") === 0);
    assert.ok(delayHeading, "DELAY RECORDS section heading not found");
    var delaySection = delayHeading.parentElement;
    var removeBtn = Array.from(delaySection.querySelectorAll("button")).find((b) => b.textContent.trim() === "Remove");
    assert.ok(removeBtn, "the Delay Record's own Remove button not found within its section");
    removeBtn.click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 0);
    assert.strictEqual(data.delay_activity_links.filter((l) => l.delay_id === delayId).length, 0, "orphaned links must be cleaned up");
    var action = data.recovery_actions.find((r) => r.activity_id === activityBId);
    assert.ok(action, "the Recovery Action itself must NOT be deleted — only its delay link cleared");
    assert.strictEqual(action.delay_id, "", "the dangling delay_id reference must be cleared, not left pointing at a deleted record");
  });

  await check("this gate's changes don't break the rest of the Schedule module — every route still renders cleanly", () => {
    ["dashboard", "portfolio", "projectWorkspace", "executiveCenter", "schedule", "delayRecoveryDashboard", "risks", "reports", "settings"].forEach((route) => {
      win.PCC.router.go(route);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "route '" + route + "' threw: " + thrownErrors.join(" | "));
    });
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
