// Architecture Upgrade Phase 1 (Canonical Schedule Model, schema v61) — standalone Node
// test for the store.js additions: schedule source_platform/source_format/schedule_type/
// schedule_owner, activity/wbs_item `codes` bags, the new calendars[] entity, and the
// v60 -> v61 migration that backfills all of it onto pre-existing data. Same
// eval-store-directly approach as test_store_schema_v54_migration.js.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.message);
  }
}

function makeFakeLocalStorage(initialRaw) {
  const store = { pcc_local_data_v1: initialRaw };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
}

function loadStoreWith(rawJsonString) {
  global.window = { localStorage: makeFakeLocalStorage(rawJsonString), setTimeout: setTimeout, clearTimeout: clearTimeout };
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "store.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(src);
  return global.window.PCC.store;
}

// ---------------------------------------------------------------------------
// Fresh install: new factories default correctly, with no source data to infer from.
// ---------------------------------------------------------------------------
const store = loadStoreWith(null);

check("newSchedule() defaults source_platform to 'pcc', schedule_type to 'current'", () => {
  const s = store.newSchedule({ project_id: "proj_1", name: "Hand-built" });
  assert.strictEqual(s.source_platform, "pcc");
  assert.strictEqual(s.source_format, null);
  assert.strictEqual(s.schedule_type, "current");
  assert.strictEqual(s.schedule_owner, "");
});

check("newSchedule() accepts an explicit source_platform/source_format override (the Excel importer's call site)", () => {
  const s = store.newSchedule({ project_id: "proj_1", name: "Imported", source_platform: "excel", source_format: "xlsx" });
  assert.strictEqual(s.source_platform, "excel");
  assert.strictEqual(s.source_format, "xlsx");
});

check("newActivity() and newWbsItem() default codes to an empty object", () => {
  const a = store.newActivity({ project_id: "proj_1" });
  const w = store.newWbsItem({ project_id: "proj_1" });
  assert.deepStrictEqual(a.codes, {});
  assert.deepStrictEqual(w.codes, {});
});

check("newActivity() accepts an arbitrary source-system code bag without dropping other fields", () => {
  const a = store.newActivity({ project_id: "proj_1", name: "Pour Foundation", codes: { P6_RESP_CODE: "CIVIL", P6_AREA: "ZONE-A" } });
  assert.deepStrictEqual(a.codes, { P6_RESP_CODE: "CIVIL", P6_AREA: "ZONE-A" });
  assert.strictEqual(a.name, "Pour Foundation");
});

check("newCalendar() defaults to a Mon-Fri working pattern with no holidays and is_default false", () => {
  const c = store.newCalendar({ project_id: "proj_1" });
  assert.deepStrictEqual(c.working_days, [true, true, true, true, true, false, false]);
  assert.deepStrictEqual(c.holidays, []);
  assert.strictEqual(c.is_default, false);
  assert.strictEqual(c.project_id, "proj_1");
  assert.ok(c.id.indexOf("cal_") === 0);
});

check("SCHEDULE_PLATFORMS and SCHEDULE_TYPES are exported for UI selects to use", () => {
  assert.deepStrictEqual(store.SCHEDULE_PLATFORMS, ["pcc", "excel", "msp_xml", "p6_xer", "p6_xml"]);
  assert.deepStrictEqual(store.SCHEDULE_TYPES, ["current", "baseline", "lookahead", "client", "contractor", "recovery", "forecast"]);
});

check("a fresh install starts with an empty calendars array", () => {
  assert.deepStrictEqual(store.get().calendars, []);
});

// ---------------------------------------------------------------------------
// Migration: a v60 dataset with one Excel-imported schedule and one hand-built schedule,
// across two projects, gets everything backfilled correctly and lands on v61.
// ---------------------------------------------------------------------------
check("a v60 dataset migrates to v61: source_platform/source_format inferred correctly, schedule_type/owner defaulted, activity+wbs codes defaulted, one default calendar minted per project and wired onto every existing activity", () => {
  const v60 = {
    schema_version: 60,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [
      { id: "proj_1", name: "Project One", archived: false, status: "on_track", progress: 0, attachments: [] },
      { id: "proj_2", name: "Project Two", archived: false, status: "on_track", progress: 0, attachments: [] },
    ],
    schedules: [
      { id: "sch_1", project_id: "proj_1", name: "Baseline Programme", source_file_name: "Baseline_Programme_Rev0.xlsx" },
      { id: "sch_2", project_id: "proj_2", name: "Hand-built Schedule", source_file_name: null },
    ],
    wbs_items: [{ id: "wbs_1", project_id: "proj_1", schedule_id: "sch_1", code: "1.0", name: "Sitework" }],
    activities: [
      { id: "act_1", project_id: "proj_1", schedule_id: "sch_1", name: "Excavate", calendar_id: null },
      { id: "act_2", project_id: "proj_2", schedule_id: "sch_2", name: "Design Review", calendar_id: null },
      { id: "act_3", project_id: "proj_1", schedule_id: "sch_1", name: "Already Linked", calendar_id: "cal_existing" },
    ],
    relationships: [],
    schedule_baselines: [],
    cost_budget_items: [],
    cost_actuals: [],
  };
  const s = loadStoreWith(JSON.stringify(v60));
  const data = s.get();

  assert.strictEqual(data.schema_version, 61);

  // Excel-sourced schedule: inferred from source_file_name, extension lowercased.
  const sch1 = data.schedules.find((x) => x.id === "sch_1");
  assert.strictEqual(sch1.source_platform, "excel");
  assert.strictEqual(sch1.source_format, "xlsx");
  assert.strictEqual(sch1.schedule_type, "current");
  assert.strictEqual(sch1.schedule_owner, "");
  assert.strictEqual(sch1.name, "Baseline Programme", "existing fields must survive untouched");

  // Hand-built schedule (no source_file_name): inferred as "pcc", no format.
  const sch2 = data.schedules.find((x) => x.id === "sch_2");
  assert.strictEqual(sch2.source_platform, "pcc");
  assert.strictEqual(sch2.source_format, null);

  // codes backfilled on both activities and WBS items.
  assert.deepStrictEqual(data.wbs_items[0].codes, {});
  data.activities.forEach((a) => assert.deepStrictEqual(a.codes, {}, `activity ${a.id} must get an empty codes bag`));

  // One default calendar per project (two projects -> two calendars), both is_default.
  assert.strictEqual(data.calendars.length, 2, "exactly one default calendar per pre-existing project");
  const cal1 = data.calendars.find((c) => c.project_id === "proj_1");
  const cal2 = data.calendars.find((c) => c.project_id === "proj_2");
  assert.ok(cal1 && cal2);
  assert.strictEqual(cal1.is_default, true);
  assert.strictEqual(cal2.is_default, true);

  // Every activity with no calendar_id gets its project's new default calendar; an
  // activity that already had a real calendar_id is left alone (never overwritten).
  const act1 = data.activities.find((x) => x.id === "act_1");
  const act2 = data.activities.find((x) => x.id === "act_2");
  const act3 = data.activities.find((x) => x.id === "act_3");
  assert.strictEqual(act1.calendar_id, cal1.id);
  assert.strictEqual(act2.calendar_id, cal2.id);
  assert.strictEqual(act3.calendar_id, "cal_existing", "an activity that already had a calendar_id must not be overwritten by the migration");
});

check("running migrate() twice (idempotency check via a second load of already-migrated data) does not duplicate calendars or change already-set fields", () => {
  const v60 = {
    schema_version: 60,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "P", archived: false, status: "on_track", progress: 0, attachments: [] }],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [],
  };
  const s1 = loadStoreWith(JSON.stringify(v60));
  const migratedOnce = s1.get();
  assert.strictEqual(migratedOnce.calendars.length, 1);

  // Re-load the ALREADY-migrated (v61) JSON through the store again — schema_version is
  // 61 so the `< 61` migration block must not re-run and mint a second calendar.
  const s2 = loadStoreWith(JSON.stringify(migratedOnce));
  const migratedTwice = s2.get();
  assert.strictEqual(migratedTwice.calendars.length, 1, "re-loading already-migrated data must not mint a second default calendar");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
