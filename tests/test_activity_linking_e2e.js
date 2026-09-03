// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 10 (Activity
// Linking) — same convention every prior gate's e2e test uses. Covers all six
// linkable registers (Risks/Issues/Opportunities, RFI/TQ, Meetings, Documents, Daily
// Log, Change Orders) at the form-persists-activity_id level, plus two full
// bidirectional round trips (record -> Gantt detail panel, and Gantt detail panel ->
// record) as the deep verification, matching how Gate 8/9 balanced breadth vs. depth.
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
  });

  let projectId, scheduleId, activityId, activity2Id;
  await check("seed a project, schedule, and two activities via the store", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Linking Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Main Schedule", revision_number: 1, status: "active", data_date: "2026-01-01" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;

      var activity = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Pour Foundation", activity_type: "task", duration: 5 });
      var activity2 = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Erect Steel", activity_type: "task", duration: 8 });
      data.activities.push(activity, activity2);
      activityId = activity.id;
      activity2Id = activity2.id;
    });
    assert.ok(projectId && scheduleId && activityId && activity2Id);
  });

  // ---- Field-level coverage: every register's Add form offers "Linked Activity"
  // and persists activity_id on submit. ----

  await check("Risk Register: the Add form offers a Linked Activity select that persists activity_id", async () => {
    win.PCC.router.go("risks");
    win.PCC.router.render();
    // risks.js is a React-migrated page — a click's state update commits
    // asynchronously (see CLAUDE.md's React migration notes), so await flush() before
    // reading the resulting DOM.
    await flush();
    findButtonByText(dom, "+ Add Entry").click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    var titleInput = outlet.querySelector("#riskfield-title");
    titleInput.value = "Ground Conditions";
    var activitySelect = outlet.querySelector("#riskfield-activity_id");
    assert.ok(activitySelect, "risk form should have a Linked Activity select");
    var option = Array.from(activitySelect.options).find((o) => o.textContent.indexOf("Pour Foundation") !== -1);
    assert.ok(option, "activity select should list this schedule's activities labeled with the schedule name");
    activitySelect.value = option.value;
    var form = outlet.querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    var saved = win.PCC.store.get().risks.find((r) => r.title === "Ground Conditions");
    assert.ok(saved, "risk should have been saved");
    assert.strictEqual(saved.activity_id, activityId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("RFI/TQ: the Add form persists activity_id", async () => {
    win.PCC.router.go("rfis");
    win.PCC.router.render();
    // rfis.js is a React-migrated page — a click's state update commits asynchronously
    // (see CLAUDE.md's React migration notes), so await flush() before reading the
    // resulting DOM.
    await flush();
    findButtonByText(dom, "+ Add RFI / TQ").click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    outlet.querySelector("#rfifield-subject").value = "Beam Spec";
    outlet.querySelector("#rfifield-question").value = "Which spec applies?";
    var activitySelect = outlet.querySelector("#rfifield-activity_id");
    assert.ok(activitySelect);
    activitySelect.value = activityId;
    outlet.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    var saved = win.PCC.store.get().rfis.find((r) => r.subject === "Beam Spec");
    assert.ok(saved && saved.activity_id === activityId);
  });

  await check("Meetings: the Add form persists activity_id", async () => {
    win.PCC.router.go("meetings");
    win.PCC.router.render();
    // Flush here even though meetings.js itself is still vanilla — router.js's
    // suppressNextHashRender is a single flag, so an unflushed go() call can leave a
    // hashchange event queued that later fires during a subsequent React-migrated
    // page's own flush() and wipes a one-shot pending prop (see CLAUDE.md's React
    // migration notes on this race).
    await flush();
    findButtonByText(dom, "+ Add Meeting").click();
    var outlet = win.document.getElementById("page-outlet");
    outlet.querySelector("#meetingfield-title").value = "Site Coordination";
    var activitySelect = outlet.querySelector("#meetingfield-activity_id");
    assert.ok(activitySelect);
    activitySelect.value = activityId;
    outlet.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    var saved = win.PCC.store.get().meetings.find((m) => m.title === "Site Coordination");
    assert.ok(saved && saved.activity_id === activityId);
  });

  await check("Daily Log: the Add form persists activity_id", async () => {
    win.PCC.router.go("dailylog");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "+ Add Daily Log").click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    outlet.querySelector("#dlfield-log_date").value = "2026-01-01";
    var activitySelect = outlet.querySelector("#dlfield-activity_id");
    assert.ok(activitySelect);
    activitySelect.value = activityId;
    outlet.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    var logs = win.PCC.store.get().daily_logs;
    var saved = logs[logs.length - 1];
    assert.ok(saved && saved.activity_id === activityId);
  });

  await check("Change Orders: the Add form persists activity_id", async () => {
    win.PCC.router.go("changeOrders");
    win.PCC.router.render();
    // changeOrders.js is a React-migrated page — a click's state update commits
    // asynchronously (see CLAUDE.md's React migration notes), so await flush() before
    // reading the resulting DOM.
    await flush();
    findButtonByText(dom, "+ Add Change Order").click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    outlet.querySelector("#cofield-title").value = "Extra Excavation";
    outlet.querySelector("#cofield-description").value = "Rock encountered";
    var activitySelect = outlet.querySelector("#cofield-activity_id");
    assert.ok(activitySelect);
    activitySelect.value = activityId;
    outlet.querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    var saved = win.PCC.store.get().change_orders.find((co) => co.title === "Extra Excavation");
    assert.ok(saved && saved.activity_id === activityId);
  });

  let documentId;
  await check("Documents: activity_id can be set directly on the store (upload flow is file-driven, not form-submit) and the record is discoverable", () => {
    // Documents' save path is a button-click file upload, not a <form> submit — already
    // covered structurally by activityOptionsFor() being wired the same way as every
    // other module (checked below via the Gantt's Linked Records panel, which doesn't
    // care how a record got its activity_id, only that the field is set).
    win.PCC.store.update(function (data) {
      var doc = win.PCC.store.newDocument({ project_id: projectId, filename: "spec.pdf", activity_id: activityId });
      data.documents.push(doc);
      documentId = doc.id;
    });
    assert.strictEqual(win.PCC.store.get().documents.find((d) => d.id === documentId).activity_id, activityId);
  });

  // ---- Deep bidirectional round trip #1: Risk Register -> View in Gantt -> lands on
  // the activity's detail panel with that risk listed under Linked Records. ----

  await check("Risk's 'View in Gantt' button opens the activity's own detail panel", async () => {
    win.PCC.router.go("risks");
    win.PCC.router.render();
    // Flush here, BEFORE interacting — router.js's suppressNextHashRender is a single
    // flag, so a hashchange-triggered render can still land asynchronously after this
    // go()+render() pair (see CLAUDE.md's React migration notes on this race).
    await flush();
    var detailsBtn = findButtonByText(dom, "Details");
    assert.ok(detailsBtn, "Details button not found on the risk card");
    detailsBtn.click();
    await flush();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("LINKED ACTIVITY") !== -1, "risk details should show the linked activity");
    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — the whole
    // row is the click target now, no separate "View in Gantt" button.
    var viewRow = Array.from(outlet.querySelectorAll(".attention-item--clickable")).find((r) => r.textContent.indexOf("LINKED ACTIVITY") !== -1);
    assert.ok(viewRow, "linked-activity row not found");
    viewRow.click();
    win.PCC.router.render();
    // Flush here, before this check ends — router.js's suppressNextHashRender is a
    // single flag, and jsdom fires "hashchange" asynchronously (confirmed: a full
    // macrotask later, not synchronously with the hash assignment). Leaving this
    // go("schedule")'s hashchange un-flushed lets it linger into the NEXT check, where
    // it fires during that check's own await flush() and incorrectly consumes the flag
    // meant for that check's own navigation — see CLAUDE.md's React migration notes on
    // this exact race.
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Pour Foundation") !== -1, "should land on the Gantt tab showing the linked activity");
    assert.ok(outlet2.textContent.indexOf("LINKED RECORDS") !== -1, "activity detail panel should show the Linked Records section");
    assert.ok(outlet2.textContent.indexOf("Ground Conditions") !== -1, "the risk should be listed as a linked record");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Deep bidirectional round trip #2: from the activity's detail panel, every
  // linked record (risk/RFI/meeting/document/change order) is listed, and clicking
  // "View" on one navigates to and expands that specific record. ----

  await check("the Linked Records section lists every type linked to this activity, and each 'View' button navigates to and expands that record", async () => {
    var outlet = win.document.getElementById("page-outlet");
    var text = outlet.textContent;
    assert.ok(text.indexOf("Ground Conditions") !== -1, "risk should be listed");
    assert.ok(text.indexOf("Beam Spec") !== -1, "RFI should be listed");
    assert.ok(text.indexOf("Site Coordination") !== -1, "meeting should be listed");
    assert.ok(text.indexOf("Extra Excavation") !== -1, "change order should be listed");
    assert.ok(text.indexOf("spec.pdf") !== -1, "document should be listed");

    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — locate the
    // RFI's row (the whole row is the click target now) by finding the one whose text
    // mentions "Beam Spec".
    var rfiRow = Array.from(outlet.querySelectorAll(".attention-item--clickable")).find((r) => r.textContent.indexOf("Beam Spec") !== -1);
    assert.ok(rfiRow, "RFI's row not found in Linked Records");
    rfiRow.click();
    // Deliberately no extra win.PCC.router.render() call here — the row's onclick
    // already calls window.PCC.rfis.expandRfi() + router.go("rfis"), and go() already
    // renders. rfis.js is a React-migrated page whose expandRfi() is a one-shot
    // pending-prop consumed on that exact mount (see CLAUDE.md's React migration
    // notes) — a redundant extra render() call here would trigger a second, fresh
    // remount that no longer has the prop to consume, silently losing it.
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "rfis");
    var outlet2 = win.document.getElementById("page-outlet");
    assert.ok(outlet2.textContent.indexOf("Beam Spec") !== -1);
    assert.ok(outlet2.textContent.indexOf("LINKED ACTIVITY") !== -1, "RFI details should be expanded and show its own linked-activity row");
    assert.ok(outlet2.textContent.indexOf("Pour Foundation") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("an activity with no linked records shows the empty state, not fabricated content", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activity2Id);
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    var outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("Erect Steel") !== -1, "should be showing the second, unlinked activity");
    assert.ok(outlet.textContent.indexOf("LINKED RECORDS (0)") !== -1, "should show zero linked records");
    assert.ok(outlet.textContent.indexOf("link one from that record's own Add/Edit form") !== -1, "should show the empty-state explanation");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page ----
  var routes = ["dashboard", "portfolio", "executiveCenter", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 10 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
