// End-to-end jsdom test for Settings → Time zone (settings.time_zone, schema v67), against the
// real bundled index.html. The DEVICE is Asia/Kolkata with the clock frozen at 01:00 IST on
// 24 September (= 19:30 UTC on the 23rd), so every zone choice below lands on a
// predictable, different "today":
//   Automatic (device, IST) → 2026-09-24
//   America/New_York (15:30 on the 23rd) → 2026-09-23
//   Asia/Tokyo (04:30 on the 24th) → 2026-09-24
"use strict";
process.env.TZ = "Asia/Kolkata"; // the device's zone — set before any Date exists

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const INDEX_PATH = path.join(__dirname, "..", "index.html");
const FROZEN_NOW = Date.parse("2026-09-24T01:00:00+05:30");

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

function setReactSelectValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const errors = [];
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(w) {
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
  const D = win.PCC.dates;

  function setZone(tz) {
    S.update((d) => {
      d.settings.time_zone = tz;
    });
  }
  function titleBlockDate() {
    return doc.getElementById("title-block-date").textContent;
  }

  await check("a fresh install is schema v67 with time_zone '' (Automatic)", () => {
    assert.strictEqual(S.get().schema_version, 67);
    assert.strictEqual(S.get().settings.time_zone, "");
    assert.strictEqual(D.chosenTimeZone(), "");
    // ICU still reports India under its older canonical name on many builds (Node, Chromium).
    assert.ok(/^Asia\/(Kolkata|Calcutta)$/.test(D.deviceTimeZone()), D.deviceTimeZone());
    assert.strictEqual(D.effectiveTimeZone(), D.deviceTimeZone());
  });

  await check("migrating a v66 file adds time_zone '' and leaves a stored choice alone", () => {
    const m = S.migrate({ schema_version: 66, projects: [], settings: { theme: "dark" } });
    assert.strictEqual(m.schema_version, 67);
    assert.strictEqual(m.settings.time_zone, "");
    const kept = S.migrate({ schema_version: 67, projects: [], settings: { time_zone: "Asia/Dubai" } });
    assert.strictEqual(kept.settings.time_zone, "Asia/Dubai");
  });

  await check("Automatic follows the device: today is the 24th (IST)", () => {
    setZone("");
    assert.strictEqual(D.localIsoDate(), "2026-09-24");
    assert.strictEqual(S.newDailyLog({}).log_date, "2026-09-24");
  });

  await check("choosing America/New_York moves 'today' to the 23rd — defaults, CPM data date, and the title bar", () => {
    setZone("America/New_York");
    win.PCC.layout.refreshTitleBlock();
    assert.strictEqual(D.localIsoDate(), "2026-09-23");
    assert.strictEqual(S.newDailyLog({}).log_date, "2026-09-23");
    assert.strictEqual(S.newMeeting({}).meeting_date, "2026-09-23");
    const r = win.PCC.scheduleCpmEngine.calculateSchedule([{ id: "a", duration: 1, activity_type: "task" }], [], {});
    assert.strictEqual(r.results.a.early_start, "2026-09-23");
    assert.strictEqual(titleBlockDate(), "2026-09-23");
  });

  await check("choosing Asia/Tokyo puts it back on the 24th", () => {
    setZone("Asia/Tokyo");
    assert.strictEqual(D.localIsoDate(), "2026-09-24");
  });

  await check("overdue/due-today buckets follow the chosen zone (Action Centre)", async () => {
    S.update((d) => {
      const p = S.newProject({ name: "TZ Project" });
      d.projects.push(p);
      d.rfis.push(S.newRfi({ project_id: p.id, subject: "due 23rd", date_required: "2026-09-23", status: "open" }));
    });
    const kpi = (label) =>
      Number(
        Array.from(doc.querySelectorAll(".kpi-card"))
          .find((c) => c.querySelector(".kpi-card__label").textContent === label)
          .querySelector(".kpi-card__value").textContent
      );
    setZone("America/New_York"); // today = 23rd → due today
    win.PCC.router.go("actionCentre");
    await flush();
    assert.strictEqual(kpi("DUE TODAY"), 1);
    assert.strictEqual(kpi("OVERDUE"), 0);
    setZone("Asia/Tokyo"); // today = 24th → overdue
    win.PCC.router.go("dashboard");
    await flush();
    win.PCC.router.go("actionCentre");
    await flush();
    assert.strictEqual(kpi("OVERDUE"), 1);
    assert.strictEqual(kpi("DUE TODAY"), 0);
  });

  await check("timestamps display in the chosen zone", () => {
    const instant = "2026-09-24T06:00:00.000Z"; // 11:30 IST, 10:00 Dubai, 02:00 New York
    setZone("Asia/Dubai");
    assert.ok(/10:00/.test(D.formatDateTime(instant)), D.formatDateTime(instant));
    setZone("America/New_York");
    assert.ok(/2:00/.test(D.formatDateTime(instant)), D.formatDateTime(instant));
  });

  await check("a date-only value is displayed as that calendar date in EVERY zone (never shifted a day)", () => {
    ["", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata"].forEach((tz) => {
      setZone(tz);
      assert.strictEqual(D.formatDate("2026-09-24"), "9/24/2026", "zone " + (tz || "Automatic"));
    });
  });

  await check("empty or invalid input displays as '' instead of 'Invalid Date'", () => {
    assert.strictEqual(D.formatDate(""), "");
    assert.strictEqual(D.formatDate("garbage"), "");
    assert.strictEqual(D.formatDateTime(undefined), "");
  });

  await check("a stored zone this device doesn't recognise falls back to Automatic without throwing", () => {
    setZone("Mars/Olympus_Mons");
    assert.strictEqual(D.chosenTimeZone(), "");
    assert.strictEqual(D.localIsoDate(), "2026-09-24");
  });

  await check("Excel date cells are NOT shifted by the chosen zone (they're built in the device's zone)", () => {
    setZone("America/New_York");
    const XLSX = win.XLSX;
    const ws = XLSX.utils.aoa_to_sheet([["Activity ID", "Activity Name", "Duration", "Planned Start"], ["A1", "Pour", 1, ""]]);
    ws.D2 = { t: "n", v: 46096, z: "yyyy-mm-dd" }; // 2026-03-15
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const read = XLSX.read(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), { type: "array", cellDates: true });
    const rows = XLSX.utils.sheet_to_json(read.Sheets.S, { header: 1, defval: "" });
    assert.strictEqual(win.PCC.scheduleImportService.parseRows(rows[0], rows.slice(1)).activities[0].planned_start, "2026-03-15");
  });

  await check("Settings → Time zone: Automatic names the device zone; picking a zone saves it and updates the title bar", async () => {
    setZone("");
    win.PCC.router.go("settings");
    await flush();
    const select = doc.getElementById("settingsfield-time_zone");
    assert.ok(select, "Time zone select not found");
    assert.strictEqual(select.options[0].value, "");
    assert.ok(/Asia\/(Kolkata|Calcutta)/.test(select.options[0].textContent), select.options[0].textContent);
    assert.ok(select.options.length > 20, "should offer a real list of zones, got " + select.options.length);
    setReactSelectValue(win, select, "America/New_York");
    await flush();
    assert.strictEqual(S.get().settings.time_zone, "America/New_York");
    assert.strictEqual(titleBlockDate(), "2026-09-23", "title bar should update immediately");
    assert.ok(doc.getElementById("page-outlet").textContent.indexOf("Today: 2026-09-23") !== -1, "preview line should show the new today");
    setReactSelectValue(win, doc.getElementById("settingsfield-time_zone"), "");
    await flush();
    assert.strictEqual(S.get().settings.time_zone, "");
    assert.strictEqual(titleBlockDate(), "2026-09-24");
  });

  await check("no uncaught errors across the whole run", () => {
    assert.strictEqual(errors.length, 0, "window.onerror: " + errors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
