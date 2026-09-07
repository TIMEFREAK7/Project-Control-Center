// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 28
// (Bidirectional Delay Comments). Feature request #4: "I should be able to add
// comments to the delayed activities in schedule, in delay registry and the comment
// should sync with each other." There is no separate "Delay Registry" store collection
// — the Schedule page's Activity Detail Panel and the Delay & Recovery Dashboard's own
// "Delay Records (worst first)" register are both just views over the SAME
// data.delay_records array, so a single shared `comments` array on the Delay Record
// itself gives "add from either place, see it in both" for free — this file proves
// that's actually true end-to-end, not just at the data layer.
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
  for (let i = 0; i < 20; i++) await sleep(0);
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

  await check("app boots on the bundled index.html without throwing, and a fresh Delay Record has an empty comments array", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    var rec = win.PCC.store.newDelayRecord({});
    assert.deepStrictEqual(Array.from(rec.comments), []);
  });

  let projectId, scheduleId, activityId, delayId;
  await check("seed a project/schedule/activity with a Delay Record", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Comments Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;
      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-01-01" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Foundation Works", activity_type: "task", duration: 10 });
      data.activities.push(a);
      activityId = a.id;
      var delay = win.PCC.store.newDelayRecord({ activity_id: activityId, project_id: projectId, description: "Late rebar delivery", delay_days: 5 });
      data.delay_records.push(delay);
      delayId = delay.id;
      data.delay_activity_links.push(win.PCC.store.newDelayActivityLink({ delay_id: delayId, activity_id: activityId, project_id: projectId }));
    });
    assert.ok(projectId && scheduleId && activityId && delayId);
  });

  await check("adding a comment from the Schedule page's Activity Detail Panel persists it on the Delay Record", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.go("schedule");
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Comments (0)") !== -1, "expected a collapsed 'Comments (0)' disclosure on the Delay Record");

    var commentsDetails = Array.from(outlet().querySelectorAll("details")).find((d) => d.textContent.indexOf("Comments (") === 0);
    assert.ok(commentsDetails, "Comments <details> not found");
    commentsDetails.setAttribute("open", "");
    await flush();

    var textarea = Array.from(outlet().querySelectorAll("textarea")).find((t) => (t.getAttribute("placeholder") || "").indexOf("Delay & Recovery Dashboard") !== -1);
    assert.ok(textarea, "comment textarea not found on the Schedule page");
    setReactTextareaValue(win, textarea, "Vendor confirmed delivery for Thursday.");
    findButtonByText(dom, "Add Comment").click();
    await flush();

    var data = win.PCC.store.get();
    var rec = data.delay_records.find((r) => r.id === delayId);
    assert.strictEqual(rec.comments.length, 1);
    assert.strictEqual(rec.comments[0].text, "Vendor confirmed delivery for Thursday.");
    assert.ok(rec.comments[0].created_at);
    assert.ok(rec.comments[0].id);
    assert.ok(outlet().textContent.indexOf("Vendor confirmed delivery for Thursday.") !== -1, "the new comment should be visible immediately without leaving the page");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("that SAME comment is visible on the Delay & Recovery Dashboard's own Delay Records register — no separate sync step needed", async () => {
    win.PCC.router.go("delayRecoveryDashboard");
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Delay Records (worst first)") !== -1, "expected the dashboard's own delay register panel");
    assert.ok(text.indexOf("Comments (1)") !== -1, "the comment added from Schedule must already show up here — same underlying delay_records[].comments array, no export/import step");
  });

  await check("adding a SECOND comment from the Dashboard itself persists it, and it's visible back on the Schedule page too", async () => {
    var commentsDetails = Array.from(outlet().querySelectorAll("details")).find((d) => d.textContent.indexOf("Comments (") === 0);
    assert.ok(commentsDetails, "Comments <details> not found on the dashboard");
    commentsDetails.setAttribute("open", "");
    await flush();

    var textarea = Array.from(outlet().querySelectorAll("textarea")).find((t) => (t.getAttribute("placeholder") || "").indexOf("Activity Detail Panel") !== -1);
    assert.ok(textarea, "comment textarea not found on the dashboard");
    setReactTextareaValue(win, textarea, "Recovery plan agreed with site team.");
    findButtonByText(dom, "Add Comment").click();
    await flush();

    var data = win.PCC.store.get();
    var rec = data.delay_records.find((r) => r.id === delayId);
    assert.strictEqual(rec.comments.length, 2);
    assert.strictEqual(rec.comments[1].text, "Recovery plan agreed with site team.");

    // Back to Schedule — both comments must be there, in order.
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.go("schedule");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Comments (2)") !== -1);
    assert.ok(text.indexOf("Vendor confirmed delivery for Thursday.") !== -1);
    assert.ok(text.indexOf("Recovery plan agreed with site team.") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("removing a comment from the Schedule page removes it from the Dashboard too, and a blank comment is silently ignored", async () => {
    var commentsDetails = Array.from(outlet().querySelectorAll("details")).find((d) => d.textContent.indexOf("Comments (") === 0);
    commentsDetails.setAttribute("open", "");
    await flush();

    // Blank comment: the Add Comment button must be a silent no-op, not push an empty entry.
    var textarea = Array.from(outlet().querySelectorAll("textarea")).find((t) => (t.getAttribute("placeholder") || "").indexOf("Delay & Recovery Dashboard") !== -1);
    setReactTextareaValue(win, textarea, "   ");
    findButtonByText(dom, "Add Comment").click();
    await flush();
    assert.strictEqual(win.PCC.store.get().delay_records.find((r) => r.id === delayId).comments.length, 2, "a blank/whitespace-only comment must not be added");

    var removeButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Remove");
    assert.ok(removeButtons.length > 0, "expected at least one comment 'Remove' button");
    removeButtons[0].click();
    await flush();

    var data = win.PCC.store.get();
    var rec = data.delay_records.find((r) => r.id === delayId);
    assert.strictEqual(rec.comments.length, 1);
    assert.strictEqual(rec.comments[0].text, "Recovery plan agreed with site team.");

    win.PCC.router.go("delayRecoveryDashboard");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Comments (1)") !== -1);
    assert.strictEqual(text.indexOf("Vendor confirmed delivery for Thursday."), -1, "the removed comment must be gone from the dashboard too");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate's changes don't break the rest of the app — every route still renders cleanly", async () => {
    var routes = [
      "dashboard", "myWork", "actionCentre", "portfolio", "executiveCenter", "schedule",
      "delayRecoveryDashboard", "risks", "meetings", "rfis", "changeOrders", "settings",
    ];
    for (var i = 0; i < routes.length; i++) {
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "route '" + routes[i] + "' threw: " + thrownErrors.join(" | "));
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
