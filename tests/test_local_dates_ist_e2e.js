// End-to-end jsdom test for the 2026-09-24 audit's timezone fixes, against the real bundled
// index.html, run in Asia/Kolkata (UTC+5:30) with the app's clock frozen at 01:00 IST on
// 24 September — inside the midnight-to-05:30 window where the UTC date is still the 23rd.
//
// Two separate bugs, both invisible to the rest of this suite, which runs in UTC:
//   1. "Today" was `new Date().toISOString().slice(0, 10)` (the UTC date) in ~30 files:
//      title-block date, record default dates, overdue buckets, CPM default data date.
//   2. Excel schedule import read every date ONE DAY EARLY anywhere east of UTC: SheetJS
//      builds a date cell as local midnight (10 seconds early in Asia/Kolkata), and the
//      importer converted it with toISOString(). That also hit every "Edit Excel" round trip.
"use strict";
process.env.TZ = "Asia/Kolkata"; // must be set before any Date is created in this process

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const INDEX_PATH = path.join(__dirname, "..", "index.html");
const FROZEN_NOW = Date.parse("2026-09-24T01:00:00+05:30"); // 2026-09-23T19:30Z

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

(async () => {
  assert.strictEqual(new Date(FROZEN_NOW).getDate(), 24, "precondition: process must really be running in IST");
  assert.strictEqual(new Date(FROZEN_NOW).toISOString().slice(0, 10), "2026-09-23", "precondition: UTC date is still the 23rd");

  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const errors = [];
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(w) {
      // Freeze "now" for the app only (argument-taking Date calls behave normally).
      const RealDate = w.Date;
      class FrozenDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) super(FROZEN_NOW);
          else super(...args);
        }
        static now() {
          return FROZEN_NOW;
        }
      }
      w.Date = FrozenDate;
    },
  });
  dom.window.indexedDB = new FDBFactory();
  dom.window.onerror = function (msg) {
    errors.push(msg);
  };
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  const win = dom.window;
  const doc = win.document;
  const S = win.PCC.store;

  // ---- 1. "Today" is the local date ----

  await check("the title-block DATE shows the local date (24th), not the UTC one (23rd)", () => {
    const cell = Array.from(doc.querySelectorAll(".title-block__cell")).find((c) => /DATE/.test(c.textContent));
    assert.ok(cell, "DATE cell not found");
    assert.ok(cell.textContent.indexOf("2026-09-24") !== -1, "got: " + cell.textContent);
  });

  await check("new records default to the local date (Daily Log, Meeting, RFI raised, Change Order requested, Commitment, Schedule data date)", () => {
    assert.strictEqual(S.newDailyLog({}).log_date, "2026-09-24");
    assert.strictEqual(S.newMeeting({}).meeting_date, "2026-09-24");
    assert.strictEqual(S.newRfi({}).date_raised, "2026-09-24");
    assert.strictEqual(S.newChangeOrder({}).date_requested, "2026-09-24");
    assert.strictEqual(S.newCommitment({}).commitment_date, "2026-09-24");
    assert.strictEqual(S.newSchedule({}).data_date, "2026-09-24");
  });

  await check("the CPM engine's default data date is the local date", () => {
    const r = win.PCC.scheduleCpmEngine.calculateSchedule([{ id: "a", duration: 2, activity_type: "task" }], [], {});
    assert.strictEqual(r.results.a.early_start, "2026-09-24");
  });

  await check("Action Centre buckets by the local date: due-yesterday is OVERDUE, due-today is DUE TODAY", async () => {
    S.update((d) => {
      const p = S.newProject({ name: "IST Project" });
      d.projects.push(p);
      d.rfis.push(S.newRfi({ project_id: p.id, subject: "due yesterday", date_required: "2026-09-23", status: "open" }));
      d.rfis.push(S.newRfi({ project_id: p.id, subject: "due today", date_required: "2026-09-24", status: "open" }));
    });
    win.PCC.router.go("actionCentre");
    await flush();
    const kpi = (label) => {
      const card = Array.from(doc.querySelectorAll(".kpi-card")).find((c) => c.querySelector(".kpi-card__label").textContent === label);
      return Number(card.querySelector(".kpi-card__value").textContent);
    };
    assert.strictEqual(kpi("OVERDUE"), 1, "the RFI due on the 23rd is overdue on the 24th");
    assert.strictEqual(kpi("DUE TODAY"), 1, "the RFI due on the 24th is due today");
  });

  // ---- 2. Excel dates import as the date they say ----

  await check("an Excel schedule's date cells import as the dates they show (SheetJS + the real parseRows, in IST)", () => {
    const XLSX = win.XLSX;
    const ws = XLSX.utils.aoa_to_sheet([["Activity ID", "Activity Name", "Duration", "Planned Start", "Planned Finish"], ["A10", "Pour slab", 5, "", ""]]);
    ws.D2 = { t: "n", v: 46096, z: "yyyy-mm-dd" }; // Excel serial for 2026-03-15
    ws.E2 = { t: "n", v: 46101, z: "yyyy-mm-dd" }; // 2026-03-20
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    // Exactly what scheduleService.ts's Excel import does with an uploaded file:
    const read = XLSX.read(new Uint8Array(bytes), { type: "array", cellDates: true });
    const sheetRows = XLSX.utils.sheet_to_json(read.Sheets[read.SheetNames[0]], { header: 1, defval: "" });
    assert.ok(sheetRows[1][3] instanceof win.Date || Object.prototype.toString.call(sheetRows[1][3]) === "[object Date]", "precondition: SheetJS gave a Date cell");
    const parsed = win.PCC.scheduleImportService.parseRows(sheetRows[0], sheetRows.slice(1));
    assert.strictEqual(parsed.activities[0].planned_start, "2026-03-15");
    assert.strictEqual(parsed.activities[0].planned_finish, "2026-03-20");
  });

  await check("dateCellToIso rounds local midnight, SheetJS's 10-second IST drift, and UTC midnight to the same day", () => {
    const f = win.PCC.scheduleImportService.dateCellToIso;
    assert.strictEqual(f(new win.Date(2026, 2, 15, 0, 0, 0)), "2026-03-15");
    assert.strictEqual(f(new win.Date(2026, 2, 14, 23, 59, 50)), "2026-03-15");
    assert.strictEqual(f(new win.Date(Date.UTC(2026, 2, 15))), "2026-03-15");
  });

  await check("no uncaught errors across the whole run", () => {
    assert.strictEqual(errors.length, 0, "window.onerror: " + errors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
