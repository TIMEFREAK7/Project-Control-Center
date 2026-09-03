// End-to-end jsdom test against the ACTUAL bundled index.html for Lessons Learned (PCC
// Evolution Roadmap, Tier 3 — deferred since the original locked build order, taken up
// now that Tiers 1/2 and the "PCC Evolution Roadmap" Tiers A-F are all in daily use;
// this is Tier 3's first gate). Aditya confirmed via AskUserQuestion: skip the tier's
// two AI-dependent items (AI Document Processing, AI Project Assistant) entirely, and
// Knowledge Base (a later gate) will be a plain searchable register, not AI-backed.
//
// Same project-scoped register shape as Risk/RFI/Decisions (decisionRegister.js is the
// direct template, test_decision_register_e2e.js the direct test template) — full CRUD,
// optional Schedule activity link, optional source_meeting_id link via the same
// createFromMeeting()/pendingPrefill "raise from a Meeting" pattern, own top-level
// sidebar page. Deliberately captures BOTH directions via impact_type
// (positive/negative) — "what worked, keep doing it" is just as valuable as "what went
// wrong, avoid it next time." No status field: a captured log, not a workflow.
// schema_version 47 -> 48.
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

  await check("app boots on the bundled index.html without throwing, schema_version is 48", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.pages.lessonsLearned, "lessonsLearned page module must be bundled");
    // >= not === : this gate itself shipped at 48, but a later gate (Knowledge Base)
    // has since bumped it further — same lesson learned (no pun intended) from the
    // Gate 26 test's own stale-assertion fix, so this doesn't go stale again either.
    assert.ok(win.PCC.store.get().schema_version >= 48);
  });

  await check("the sidebar links to Lessons Learned, and the empty state shows before any project exists", () => {
    win.PCC.router.go("lessonsLearned");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Lessons Learned") !== -1);
    assert.ok(text.indexOf("Add a project in Portfolio first") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var projectId, scheduleId, activityId;
  await check("seed a project, a schedule, and an activity via the store", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Lessons Learned Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(s);
      scheduleId = s.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Rebar Procurement" });
      d.activities.push(a);
      activityId = a.id;
    });
    win.PCC.router.render();
    assert.ok(projectId && scheduleId && activityId);
  });

  await check("'+ Add Lesson Learned' opens a form requiring Title and Project, defaulting category to Other and impact to Negative", async () => {
    findButtonByText(dom, "+ Add Lesson Learned").click();
    await flush();
    var categorySelect = outlet().querySelector("#lsnfield-category");
    var impactSelect = outlet().querySelector("#lsnfield-impact_type");
    assert.ok(categorySelect && impactSelect, "category/impact fields not found");
    assert.strictEqual(categorySelect.value, "other");
    assert.strictEqual(impactSelect.value, "negative");
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.ok(outlet().textContent.indexOf("Title and Project are required.") !== -1);
    assert.strictEqual(win.PCC.store.get().lessons_learned.length, 0, "nothing should be saved when validation fails");
  });

  var lessonId;
  await check("filling in the form (negative impact) and linking the activity persists a new lesson learned", async () => {
    outlet().querySelector("#lsnfield-title").value = "Rebar supplier missed delivery window";
    outlet().querySelector("#lsnfield-category").value = "procurement_vendor";
    outlet().querySelector("#lsnfield-impact_type").value = "negative";
    outlet().querySelector("#lsnfield-date_identified").value = "2026-08-20";
    outlet().querySelector("#lsnfield-identified_by").value = "Site Engineer";
    outlet().querySelector("#lsnfield-description").value = "Rebar arrived 10 days late, delaying the foundation pour.";
    outlet().querySelector("#lsnfield-recommendation").value = "Confirm delivery dates with a penalty clause on future POs.";
    var activitySelect = outlet().querySelector("#lsnfield-activity_id");
    activitySelect.value = activityId;
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.lessons_learned.length, 1);
    var lesson = data.lessons_learned[0];
    lessonId = lesson.id;
    assert.strictEqual(lesson.project_id, projectId);
    assert.strictEqual(lesson.activity_id, activityId);
    assert.strictEqual(lesson.category, "procurement_vendor");
    assert.strictEqual(lesson.impact_type, "negative");
    assert.strictEqual(lesson.recommendation, "Confirm delivery dates with a penalty clause on future POs.");
    assert.strictEqual(lesson.status, undefined, "no status field — this is a log, not a workflow");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the list shows the new lesson with a 'Negative' impact badge", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Rebar supplier missed delivery window") !== -1);
    var badges = Array.from(outlet().querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(badges.indexOf("Negative") !== -1, "expected a Negative badge; got: " + badges.join(", "));
  });

  await check("Details shows the linked activity and clicking its row navigates to the Schedule module", async () => {
    findButtonByText(dom, "Details").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("LINKED ACTIVITY") !== -1);
    assert.ok(text.indexOf("Rebar Procurement") !== -1);

    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — the whole
    // row is the click target now, no separate "View in Gantt" button.
    var row = Array.from(outlet().querySelectorAll(".attention-item--clickable")).find((r) => r.textContent.indexOf("Rebar Procurement") !== -1);
    assert.ok(row, "clickable row for the linked activity not found");
    row.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    assert.ok(outlet().textContent.indexOf("Rebar Procurement") !== -1, "must land with the linked activity's own Detail Panel open");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("adding a second, POSITIVE lesson (no activity link) persists correctly and both show in the list", async () => {
    win.PCC.router.go("lessonsLearned");
    win.PCC.router.render();
    findButtonByText(dom, "+ Add Lesson Learned").click();
    await flush();
    outlet().querySelector("#lsnfield-title").value = "Precast sequencing shaved a week off schedule";
    outlet().querySelector("#lsnfield-category").value = "schedule";
    outlet().querySelector("#lsnfield-impact_type").value = "positive";
    outlet().querySelector("#lsnfield-recommendation").value = "Reuse precast sequencing on similar future projects.";
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.lessons_learned.length, 2);
    var positive = data.lessons_learned.find((l) => l.impact_type === "positive");
    assert.ok(positive);
    assert.strictEqual(positive.activity_id, "");
    var badges = Array.from(outlet().querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(badges.indexOf("Positive") !== -1 && badges.indexOf("Negative") !== -1, "expected both badges; got: " + badges.join(", "));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("category/impact/project filters narrow the list correctly", async () => {
    var selects = outlet().querySelectorAll("select");
    var categorySelect = selects[0];
    var impactSelect = selects[1];

    categorySelect.value = "schedule";
    categorySelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Precast sequencing shaved a week off schedule") !== -1);
    assert.ok(text.indexOf("Rebar supplier missed delivery window") === -1, "the procurement lesson must be filtered out");
    categorySelect.value = "";
    categorySelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush();

    impactSelect.value = "negative";
    impactSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush();
    text = outlet().textContent;
    assert.ok(text.indexOf("Rebar supplier missed delivery window") !== -1);
    assert.ok(text.indexOf("Precast sequencing shaved a week off schedule") === -1, "the positive lesson must be filtered out");
    impactSelect.value = "";
    impactSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush();
  });

  var meetingId;
  await check("seed a meeting on the same project", () => {
    win.PCC.store.update(function (d) {
      var m = win.PCC.store.newMeeting({ project_id: projectId, title: "Post-Foundation Retrospective" });
      d.meetings.push(m);
      meetingId = m.id;
    });
    assert.ok(meetingId);
  });

  await check("the Meeting's '+ Add Lesson Learned' button opens a prefilled form linked to that meeting", async () => {
    win.PCC.meetings.expandMeeting(meetingId);
    win.PCC.router.go("meetings");
    // meetings.js is a React-migrated page — go() already renders synchronously;
    // deliberately no extra win.PCC.router.render() call here, since that would trigger
    // a second, fresh remount that no longer has the pendingExpandedId prop to consume,
    // silently losing it (see CLAUDE.md's React migration notes). Then let the
    // "meetings" navigation's own (async) hashchange event settle before firing a second
    // go() from this button's click — router.js's suppressNextHashRender is a single
    // flag, not a queue, so two go() calls issued back-to-back (no tick between them,
    // unlike any real user's click-then-click) can leave the second navigation's
    // hashchange unsuppressed, triggering an extra render().
    await flush();
    findButtonByText(dom, "+ Add Lesson Learned").click();
    await flush();

    assert.strictEqual(win.PCC.router.currentRouteName(), "lessonsLearned");
    var text = outlet().textContent;
    assert.ok(text.indexOf("Linked to meeting: “Post-Foundation Retrospective”") !== -1);
    var projSelect = outlet().querySelector("#lsnfield-project_id");
    assert.strictEqual(projSelect.value, projectId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("saving that prefilled form persists source_meeting_id", async () => {
    outlet().querySelector("#lsnfield-title").value = "Retrospective identified a formwork rework issue";
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    var meetingLesson = data.lessons_learned.find((l) => l.title === "Retrospective identified a formwork rework issue");
    assert.ok(meetingLesson, "meeting-sourced lesson not found");
    assert.strictEqual(meetingLesson.source_meeting_id, meetingId);
    assert.strictEqual(meetingLesson.project_id, projectId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Delete' removes a lesson learned", async () => {
    win.PCC.router.go("lessonsLearned");
    win.PCC.router.render();
    var origConfirm = win.confirm;
    win.confirm = () => true;
    var deleteButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Delete");
    deleteButtons[0].click();
    await flush();
    win.confirm = origConfirm;

    var data = win.PCC.store.get();
    assert.strictEqual(data.lessons_learned.length, 2, "one of the three lessons must be gone");
  });

  await check("this gate's record counts are as expected after all edits above", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.lessons_learned.length, 2);
    assert.strictEqual(data.meetings.length, 1);
    assert.strictEqual(data.activities.length, 1);
    assert.strictEqual(data.projects.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "lessonsLearned", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding Lessons Learned", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
