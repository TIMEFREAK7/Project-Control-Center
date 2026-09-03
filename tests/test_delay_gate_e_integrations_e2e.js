// Planning & Scheduling-Centric Delay Management, Gate E (Supporting PCC Integrations) —
// DOM-level e2e test against the ACTUAL bundled index.html. Covers the three concrete
// pieces this gate added: (1) the Delay Record form's "Related Records" pickers linking
// existing Risk/Issue/RFI/Daily Log/Meeting/Vendor/Change Order records (spec points 21-25,
// "LINK IT, do not create another copy"), (2) Vendor Delay Analysis (spec point 24), and
// (3) Daily Log -> Create Delay (spec point 22).
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

  let projectId, scheduleId, activityId, riskId, issueId, rfiId, meetingId, vendorId, changeOrderId, dailyLogForPickerLink, dailyLogWithActivityId, dailyLogNoActivityId;
  await check("seed a project with one Risk, one Issue, one RFI, one Meeting, one Vendor (linked to the project), one Change Order, and a Schedule Activity", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Gate E Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;
      var activity = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Transformer Installation", activity_type: "task", duration: 10, planned_start: "2026-08-01", planned_finish: "2026-08-11" });
      data.activities.push(activity);
      activityId = activity.id;

      var risk = win.PCC.store.newRisk({ project_id: projectId, type: "risk", title: "Vendor capacity risk" });
      data.risks.push(risk);
      riskId = risk.id;
      var issue = win.PCC.store.newRisk({ project_id: projectId, type: "issue", title: "Transformer spec mismatch" });
      data.risks.push(issue);
      issueId = issue.id;

      var rfi = win.PCC.store.newRfi({ project_id: projectId, number: "RFI-001", subject: "Transformer rating clarification" });
      data.rfis.push(rfi);
      rfiId = rfi.id;

      var meeting = win.PCC.store.newMeeting({ project_id: projectId, title: "Weekly Progress Meeting", meeting_date: "2026-08-05" });
      data.meetings.push(meeting);
      meetingId = meeting.id;

      var vendor = win.PCC.store.newVendor({ vendor_name: "ABC Electricals" });
      data.vendors.push(vendor);
      vendorId = vendor.id;
      data.vendor_project_links.push(win.PCC.store.newVendorProjectLink({ vendor_id: vendorId, project_id: projectId }));

      var co = win.PCC.store.newChangeOrder({ project_id: projectId, number: "CO-001", title: "Additional transformer bay" });
      data.change_orders.push(co);
      changeOrderId = co.id;

      var logA = win.PCC.store.newDailyLog({ project_id: projectId, log_date: "2026-08-02", activity_id: activityId });
      data.daily_logs.push(logA);
      dailyLogWithActivityId = logA.id;
      var logB = win.PCC.store.newDailyLog({ project_id: projectId, log_date: "2026-08-03" });
      data.daily_logs.push(logB);
      dailyLogNoActivityId = logB.id;
      // A third entry, kept distinct from dailyLogWithActivityId/dailyLogNoActivityId above,
      // so the Related Records picker check (which links a Delay to a Daily Log) doesn't
      // collide with the later "+ Log Delay" checks, which look up a Delay by daily_log_id
      // against those two specific entries.
      var logC = win.PCC.store.newDailyLog({ project_id: projectId, log_date: "2026-08-04" });
      data.daily_logs.push(logC);
      dailyLogForPickerLink = logC.id;
    });
    assert.ok(projectId && scheduleId && activityId && riskId && issueId && rfiId && meetingId && vendorId && changeOrderId);
  });

  var delayId;
  await check("the Delay Record form's Related Records pickers offer and correctly link every existing record — never creating a duplicate", () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.render();
    findButtonByText(dom, "+ Add Delay Record").click();

    outlet().querySelector("#delayfield-risk_id").value = riskId;
    outlet().querySelector("#delayfield-issue_id").value = issueId;
    outlet().querySelector("#delayfield-rfi_id").value = rfiId;
    outlet().querySelector("#delayfield-daily_log_id").value = dailyLogForPickerLink;
    outlet().querySelector("#delayfield-meeting_id").value = meetingId;
    outlet().querySelector("#delayfield-vendor_id").value = vendorId;
    outlet().querySelector("#delayfield-change_order_id").value = changeOrderId;
    outlet().querySelector("#delayfield-description").value = "Late transformer delivery.";
    findButtonByText(dom, "Add Delay Record").click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.delay_records.length, 1, "linking related records must never create a second Delay");
    var rec = data.delay_records[0];
    delayId = rec.id;
    assert.strictEqual(rec.risk_id, riskId);
    assert.strictEqual(rec.issue_id, issueId);
    assert.strictEqual(rec.rfi_id, rfiId);
    assert.strictEqual(rec.daily_log_id, dailyLogForPickerLink);
    assert.strictEqual(rec.meeting_id, meetingId);
    assert.strictEqual(rec.vendor_id, vendorId);
    assert.strictEqual(rec.change_order_id, changeOrderId);
    // No new records were created in any of these registers — pure linking.
    assert.strictEqual(data.risks.length, 2, "exactly the 2 seeded (Risk + Issue), none duplicated");
    assert.strictEqual(data.rfis.length, 1);
    assert.strictEqual(data.meetings.length, 1);
    assert.strictEqual(data.change_orders.length, 1);

    var text = outlet().textContent;
    assert.ok(text.indexOf("Related:") !== -1);
    assert.ok(text.indexOf("Risk: Vendor capacity risk") !== -1);
    assert.ok(text.indexOf("Issue: Transformer spec mismatch") !== -1);
    assert.ok(text.indexOf("Vendor: ABC Electricals") !== -1);
    assert.ok(text.indexOf("Change: CO-001") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("spec point 24 (Vendor Integration): the vendor's Overview shows Delay Analysis — Delay Events/Open/Critical/Total Delay Days/Recovery Actions, no invented performance score", () => {
    win.PCC.store.update(function (data) {
      var rec = data.delay_records.find((r) => r.id === delayId);
      rec.delay_days = 6;
      data.recovery_actions.push(win.PCC.store.newRecoveryAction({ activity_id: activityId, project_id: projectId, delay_id: delayId, description: "Expedite delivery" }));
    });
    win.PCC.router.go("vendors");
    win.PCC.vendors.openProfile(vendorId);
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("DELAY ANALYSIS") !== -1);
    assert.ok(text.indexOf("Delay Events") !== -1);
    assert.ok(text.indexOf("Open Delays") !== -1);
    assert.ok(text.indexOf("Critical") !== -1);
    assert.ok(text.indexOf("Total Delay Days") !== -1);
    assert.ok(text.indexOf("Recovery Actions") !== -1);
    assert.ok(text.indexOf("score") === -1, "no invented vendor performance score, per the spec's own explicit instruction");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("spec point 22 (Daily Site Log): '+ Log Delay' on an entry WITH a linked activity creates a delay already linked to the Schedule, with a real historical snapshot", async () => {
    win.PCC.router.go("dailylog");
    win.PCC.router.render();
    // dailylog.js is a React-migrated page — a click's state update commits
    // asynchronously (see CLAUDE.md's React migration notes), so await flush() before
    // reading the resulting DOM.
    await flush();
    // Expand the entry with an activity link (2 Aug) to reach its own Details panel.
    var detailsButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Details");
    var cards = Array.from(outlet().querySelectorAll(".project-card"));
    var cardIdx = cards.findIndex((c) => c.textContent.indexOf("2026-08-02") !== -1);
    assert.ok(cardIdx !== -1, "the 2 Aug daily log card wasn't found");
    detailsButtons[cardIdx].click();
    await flush();

    var logBtn = findButtonByText(dom, "+ Log Delay");
    assert.ok(logBtn, "'+ Log Delay' button not found on the expanded Daily Log entry");
    logBtn.click();
    await flush();

    outlet().querySelector("#dailylogdelay-category").value = "resource_shortage";
    outlet().querySelector("#dailylogdelay-days").value = "2";
    outlet().querySelector("#dailylogdelay-description").value = "Labour shortage on site.";
    findButtonByText(dom, "Log Delay").click();
    await flush();

    var data = win.PCC.store.get();
    var rec = data.delay_records.find((r) => r.daily_log_id === dailyLogWithActivityId);
    assert.ok(rec);
    assert.strictEqual(rec.activity_id, activityId, "the log's own linked activity must carry over to the delay");
    assert.strictEqual(rec.delay_category, "resource_shortage");
    assert.strictEqual(rec.identified_date, "2026-08-02", "identified_date should default to the log's own date");
    var link = data.delay_activity_links.find((l) => l.delay_id === rec.id);
    assert.ok(link, "a real historical snapshot must be created since an activity was linked");
    assert.strictEqual(link.original_planned_finish, "2026-08-11");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'+ Log Delay' on an entry WITHOUT a linked activity creates a delay correctly showing 'Schedule Impact Not Yet Assessed'", async () => {
    win.PCC.router.go("dailylog");
    win.PCC.router.render();
    await flush();
    var cards = Array.from(outlet().querySelectorAll(".project-card"));
    var cardIdx = cards.findIndex((c) => c.textContent.indexOf("2026-08-03") !== -1);
    assert.ok(cardIdx !== -1, "the 3 Aug daily log card wasn't found");
    var detailsButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Details");
    detailsButtons[cardIdx].click();
    await flush();

    findButtonByText(dom, "+ Log Delay").click();
    await flush();
    outlet().querySelector("#dailylogdelay-description").value = "Weather interruption, no crane access.";
    findButtonByText(dom, "Log Delay").click();
    await flush();

    var data = win.PCC.store.get();
    var rec = data.delay_records.find((r) => r.daily_log_id === dailyLogNoActivityId);
    assert.ok(rec);
    assert.strictEqual(rec.activity_id, "", "no activity was linked on this log, so the delay correctly starts unlinked");
    var link = data.delay_activity_links.find((l) => l.delay_id === rec.id);
    assert.strictEqual(link, undefined, "no snapshot to create — nothing was linked");

    var text = outlet().textContent;
    assert.ok(text.indexOf("Schedule Impact Not Yet Assessed") !== -1, "spec point 5's own required phrasing for a delay with no schedule activity yet");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate's changes don't break the rest of the app — every route still renders cleanly", () => {
    ["dashboard", "portfolio", "schedule", "delayRecoveryDashboard", "vendors", "dailylog", "risks", "rfis", "meetings", "changeOrders", "executiveCenter", "reports", "settings"].forEach((route) => {
      win.PCC.router.go(route);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "route '" + route + "' threw: " + thrownErrors.join(" | "));
    });
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
