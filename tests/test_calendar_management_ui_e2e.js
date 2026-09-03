// PCC Architecture Upgrade Phase 7 (Advanced Scheduling): Calendar Management UI — the
// first of the three remaining open Phase 7 pieces (Aditya's "Start the open pieces of
// phase 7"). End-to-end jsdom test against the actual bundled index.html: the new
// "Calendars" tab in the Schedule module (add/edit/delete/set-default), the new
// "Calendar" field on the Activity form, and confirming a hand-built calendar actually
// drives Calculate Schedule once assigned and calendar-aware calculation is on.
//
// Real gotcha discovered while writing this file, worth remembering for any future test
// that deepStrictEqual's an array pulled off win.PCC.store.get(): under `runScripts:
// "dangerously"`, arrays built by code running INSIDE the JSDOM window live in that
// window's own realm, with a different Array.prototype than Node's top-level one.
// assert.deepStrictEqual treats that as "same structure but not reference-equal" and
// fails even when every element matches — no prior test in this suite had hit it because
// none previously deepStrictEqual'd an array read back from the store. toPlain() below
// (a JSON round-trip) normalizes it before comparing.
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

function toPlain(x) {
  return JSON.parse(JSON.stringify(x));
}

function findButtonByText(win, text) {
  return Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
}
function findAllButtonsByText(win, text) {
  return Array.from(win.document.querySelectorAll("button")).filter((b) => b.textContent.trim() === text);
}
// Activities render as both a desktop <tr> and a mobile .detail-card simultaneously in
// the DOM (CSS-driven show/hide, both present regardless of viewport under jsdom) — find
// whichever row-menu "More actions" button belongs to the row/card containing `text`.
function findRowMenuButtonFor(win, text) {
  var buttons = Array.from(win.document.querySelectorAll('button[aria-label="More actions"]'));
  return buttons.find(function (btn) {
    var row = btn.closest("tr") || btn.closest(".detail-card");
    return row && row.textContent.indexOf(text) !== -1;
  });
}
// schedule.js is React-migrated: form fields are React-controlled, so a raw `.value =`
// / `.checked =` assignment doesn't reliably reach onChange (React patches the native
// setter to track "last known value" — see CLAUDE.md's React migration notes).
function setReactInputValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
}
function setReactSelectValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
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
    thrownErrors.push(String(msg));
  };
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  let projectId, scheduleId;

  await check("seed a project and a schedule with no calendars yet", async () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Calendar UI Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;
      var schedule = win.PCC.store.newSchedule({ project_id: projectId, name: "Rev 0", status: "active", data_date: "2026-03-06" });
      data.schedules.push(schedule);
      scheduleId = schedule.id;
    });
    win.PCC.router.go("schedule");
    await flush();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the 'Calendars' tab exists and shows an empty state for a project with none yet", async () => {
    findButtonByText(win, "Calendars").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("No calendars yet for this project.") !== -1, "expected the empty state, got: " + text.slice(0, 500));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("adding a calendar with custom working days and a holiday creates it correctly", async () => {
    findButtonByText(win, "+ Add Calendar").click();
    await flush();
    setReactInputValue(win, win.document.getElementById("calfield-name"), "Site Crew Calendar");
    // Uncheck Sat/Sun (indices 5,6) is already unchecked by default (newCalendar()'s own
    // Mon-Fri default) — uncheck Friday (index 4) too, to prove custom patterns work, not
    // just the default.
    win.document.getElementById("calfield-workingday-4").click();
    setReactInputValue(win, win.document.getElementById("calfield-new-holiday"), "2026-12-25");
    findButtonByText(win, "+ Add Holiday").click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("2026-12-25") !== -1, "expected the added holiday to show in the draft list before saving");

    findButtonByText(win, "Add Calendar").click();
    await flush();
    var data = win.PCC.store.get();
    var cals = data.calendars.filter(function (c) { return c.project_id === projectId; });
    assert.strictEqual(cals.length, 1);
    assert.strictEqual(cals[0].name, "Site Crew Calendar");
    // toPlain(): arrays read back from win.PCC.store live in the JSDOM window's own
    // realm (a different Array.prototype than Node's) — deepStrictEqual treats that as
    // "not reference-equal" even when every element matches, so normalize through JSON
    // before comparing structurally. See this file's own header note.
    assert.deepStrictEqual(toPlain(cals[0].working_days), [true, true, true, true, false, false, false], "Mon-Thu working, Fri/Sat/Sun off");
    assert.deepStrictEqual(toPlain(cals[0].holidays), ["2026-12-25"]);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the calendar list shows the working-days summary, holiday count, and zero-activity usage", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Mon, Tue, Wed, Thu") !== -1, "expected a working-days summary, got: " + text.slice(0, 800));
    assert.ok(text.indexOf("1 holiday") !== -1);
    assert.ok(text.indexOf("used by 0 activities") !== -1);
  });

  await check("removing a holiday while editing an existing calendar persists correctly", async () => {
    findButtonByText(win, "Edit").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("2026-12-25") !== -1, "expected the existing holiday to reload into the edit form");
    findButtonByText(win, "Remove").click();
    await flush();
    findButtonByText(win, "Save Changes").click();
    await flush();
    var data = win.PCC.store.get();
    var cal = data.calendars.find(function (c) { return c.project_id === projectId; });
    assert.deepStrictEqual(toPlain(cal.holidays), []);
  });

  let secondCalendarId;
  await check("adding a second calendar and setting it as default un-defaults the first", async () => {
    findButtonByText(win, "+ Add Calendar").click();
    await flush();
    setReactInputValue(win, win.document.getElementById("calfield-name"), "Office Calendar");
    findButtonByText(win, "Add Calendar").click();
    await flush();

    var data = win.PCC.store.get();
    var cals = data.calendars.filter(function (c) { return c.project_id === projectId; });
    assert.strictEqual(cals.length, 2);
    var office = cals.find(function (c) { return c.name === "Office Calendar"; });
    secondCalendarId = office.id;
    assert.strictEqual(office.is_default, false, "a newly-added calendar must not silently become the default");

    findAllButtonsByText(win, "Set as Default").find(function (btn) {
      return btn.closest(".detail-card").textContent.indexOf("Office Calendar") !== -1;
    }).click();
    await flush();

    data = win.PCC.store.get();
    cals = data.calendars.filter(function (c) { return c.project_id === projectId; });
    var updatedOffice = cals.find(function (c) { return c.id === secondCalendarId; });
    var siteCrew = cals.find(function (c) { return c.name === "Site Crew Calendar"; });
    assert.strictEqual(updatedOffice.is_default, true);
    assert.strictEqual(siteCrew.is_default, false, "only one calendar per project may be default at a time");
  });

  let activityAId;
  await check("the Activity form has a 'Calendar' field, and a new activity defaults to the project's default calendar", async () => {
    win.PCC.router.go("schedule");
    await flush();
    findButtonByText(win, "Activities").click();
    await flush();
    findButtonByText(win, "+ Add Activity").click();
    await flush();
    var calSelect = win.document.getElementById("actfield-calendar_id");
    assert.ok(calSelect, "expected a Calendar select field on the Activity form");
    assert.strictEqual(calSelect.value, secondCalendarId, "a brand-new activity must default to the project's default calendar, not blank");

    setReactInputValue(win, win.document.getElementById("actfield-name"), "Task A");
    setReactInputValue(win, win.document.getElementById("actfield-duration"), "2");
    findButtonByText(win, "Add Activity").click();
    await flush();

    var data = win.PCC.store.get();
    var a = data.activities.find(function (act) { return act.schedule_id === scheduleId && act.name === "Task A"; });
    assert.ok(a, "expected the new activity to have been created");
    assert.strictEqual(a.calendar_id, secondCalendarId);
    activityAId = a.id;
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("explicitly picking a different calendar on the Activity form persists that choice", async () => {
    win.PCC.store.update(function (data) {
      var a = data.activities.find(function (act) { return act.id === activityAId; });
      a.calendar_id = null; // reset so this check is meaningful
    });
    win.PCC.router.render();
    await flush();
    var rowMenuBtn = findRowMenuButtonFor(win, "Task A");
    assert.ok(rowMenuBtn, "expected to find Task A's row menu button");
    rowMenuBtn.click();
    await flush();
    findButtonByText(win, "Edit").click();
    await flush();

    var calSelect = win.document.getElementById("actfield-calendar_id");
    assert.ok(calSelect, "expected the Calendar field on the edit form too");
    var siteCrewId = win.PCC.store.get().calendars.find(function (c) { return c.name === "Site Crew Calendar"; }).id;
    setReactSelectValue(win, calSelect, siteCrewId);
    findButtonByText(win, "Save Changes").click();
    await flush();

    var a = win.PCC.store.get().activities.find(function (act) { return act.id === activityAId; });
    assert.strictEqual(a.calendar_id, siteCrewId);
  });

  await check("a hand-built calendar assigned through the UI actually drives Calculate Schedule once calendar-aware calculation is on", async () => {
    // Site Crew Calendar is Mon-Thu only (Fri off, per the earlier custom edit — Fri was
    // unchecked and never re-checked). dataDate lands on a Thursday (2026-03-05); Task A's
    // 2-day duration consumes Thursday as its first working day, then must skip Fri/Sat/
    // Sun (Friday isn't a working day on THIS calendar) to reach Monday as its second —
    // landing early_finish on the following Tuesday (03-10), not the plain-calendar-day
    // Saturday (03-07) a naive +2 would give.
    win.PCC.store.update(function (data) {
      var schedule = data.schedules.find(function (s) { return s.id === scheduleId; });
      schedule.data_date = "2026-03-05";
      schedule.calendar_aware = true;
    });
    win.PCC.router.go("schedule");
    await flush();
    findButtonByText(win, "Calculate Schedule").click();
    await flush();
    var a = win.PCC.store.get().activities.find(function (act) { return act.id === activityAId; });
    assert.strictEqual(a.early_start, "2026-03-05");
    assert.strictEqual(a.early_finish, "2026-03-10", "Friday isn't a working day on this hand-built calendar, so the second working day must skip Fri/Sat/Sun to Monday, landing the boundary on Tuesday");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("deleting a calendar still referenced by an activity is blocked with a clear message", async () => {
    findButtonByText(win, "Calendars").click();
    await flush();
    var siteCrewCard = Array.from(win.document.querySelectorAll(".detail-card")).find(function (el) {
      return el.textContent.indexOf("Site Crew Calendar") !== -1;
    });
    assert.ok(siteCrewCard.textContent.indexOf("used by 1 activity") !== -1, "expected usage count to reflect the reassigned activity");
    var deleteBtn = Array.from(siteCrewCard.querySelectorAll("button")).find(function (b) { return b.textContent.trim() === "Delete"; });
    deleteBtn.click();
    await flush();
    var data = win.PCC.store.get();
    assert.strictEqual(data.calendars.filter(function (c) { return c.project_id === projectId; }).length, 2, "the referenced calendar must NOT have been deleted");
  });

  await check("deleting an unreferenced calendar (after confirming) works normally", async () => {
    var realConfirm = win.confirm;
    win.confirm = () => true;
    var officeCard = Array.from(win.document.querySelectorAll(".detail-card")).find(function (el) {
      return el.textContent.indexOf("Office Calendar") !== -1;
    });
    var deleteBtn = Array.from(officeCard.querySelectorAll("button")).find(function (b) { return b.textContent.trim() === "Delete"; });
    deleteBtn.click();
    await flush();
    win.confirm = realConfirm;
    var data = win.PCC.store.get();
    var cals = data.calendars.filter(function (c) { return c.project_id === projectId; });
    assert.strictEqual(cals.length, 1);
    assert.strictEqual(cals[0].name, "Site Crew Calendar");
  });

  // ---- Route smoke test ----
  var routes = ["dashboard", "portfolio", "documents", "schedule", "delayRecoveryDashboard", "executiveCenter", "risks", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Calendar Management UI", async () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
