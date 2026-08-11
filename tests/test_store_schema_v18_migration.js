// Standalone Node test for store.js's migrate() function, exercised indirectly through
// load() (migrate() itself isn't exported \u2014 load() is the only path that calls it, and
// it runs at module-eval time by reading window.localStorage synchronously). No jsdom
// needed: a minimal localStorage stub is enough, and keeps this fast given migrate()
// bugs in this project have historically been the kind that silently drop data.
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
  global.window = { localStorage: makeFakeLocalStorage(rawJsonString) };
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "store.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(src);
  return global.window.PCC.store;
}

// ---------------------------------------------------------------------------
// v17 -> v18: schedule_baselines gets added, nothing else touched
// ---------------------------------------------------------------------------
check("a v17 dataset gets schedule_baselines added and lands on schema_version 18", () => {
  const v17 = {
    schema_version: 17,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [{ id: "sch_1", project_id: "proj_1", name: "Rev 1", revision_number: 1, near_critical_threshold_days: 5 }],
    wbs_items: [],
    activities: [{ id: "act_1", schedule_id: "sch_1", project_id: "proj_1", name: "Excavate", external_id: null, duration: 5 }],
    relationships: [],
  };
  const store = loadStoreWith(JSON.stringify(v17));
  const data = store.get();

  assert.strictEqual(data.schema_version, 18);
  assert.ok(Array.isArray(data.schedule_baselines), "schedule_baselines must be an array after migration");
  assert.strictEqual(data.schedule_baselines.length, 0, "no baselines should be fabricated for a pre-Gate-4 dataset");

  // The actual regression risk: existing Gate 1-3 data must survive untouched.
  assert.strictEqual(data.projects.length, 1);
  assert.strictEqual(data.projects[0].name, "Existing Project");
  assert.strictEqual(data.schedules.length, 1);
  assert.strictEqual(data.schedules[0].name, "Rev 1");
  assert.strictEqual(data.activities.length, 1);
  assert.strictEqual(data.activities[0].name, "Excavate");
});

// ---------------------------------------------------------------------------
// Full chain from a very old (v1-shaped) dataset still reaches v18 cleanly
// ---------------------------------------------------------------------------
check("a minimal legacy dataset (no schema_version at all) migrates all the way to 18 without throwing", () => {
  const legacy = {
    projects: [{ id: "proj_1", name: "Old Project" }],
    documents: [],
  };
  const store = loadStoreWith(JSON.stringify(legacy));
  const data = store.get();
  assert.strictEqual(data.schema_version, 18);
  assert.ok(Array.isArray(data.schedule_baselines));
  assert.strictEqual(data.projects[0].name, "Old Project", "pre-existing project must survive the full migration chain");
});

// ---------------------------------------------------------------------------
// A brand-new install (no stored data at all) gets schedule_baselines from emptyData()
// ---------------------------------------------------------------------------
check("a brand-new install with no stored data starts with schedule_baselines: []", () => {
  const store = loadStoreWith(null);
  const data = store.get();
  assert.strictEqual(data.schema_version, 18);
  assert.deepStrictEqual(data.schedule_baselines, []);
});

// ---------------------------------------------------------------------------
// newScheduleBaseline() factory sanity
// ---------------------------------------------------------------------------
check("newScheduleBaseline() produces a well-formed record with a unique id", () => {
  const store = loadStoreWith(null);
  const b1 = store.newScheduleBaseline({ schedule_id: "sch_1", project_id: "proj_1", name: "B1" });
  const b2 = store.newScheduleBaseline({ schedule_id: "sch_1", project_id: "proj_1", name: "B2" });
  assert.ok(b1.id && b2.id && b1.id !== b2.id, "each baseline must get a unique id");
  assert.strictEqual(b1.schedule_id, "sch_1");
  assert.strictEqual(b1.activity_count, 0);
  assert.ok(b1.created_at);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
