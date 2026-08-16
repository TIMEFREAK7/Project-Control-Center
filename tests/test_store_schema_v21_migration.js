// Standalone Node test for store.js's migrate() function, exercised indirectly through
// load() — same approach test_store_schema_v20_migration.js used, replaced here per the
// "one canonical full-chain test targeting latest" pattern established at Gate 6 (this
// file supersedes the v20 one; its own checks are folded in below rather than kept as a
// separate frozen-in-time file).
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
// v20 -> v21 (Gate 9): project_type/current_phase/forecast_finish_date backfilled onto
// existing projects, health_score_weights defaulted, executive_summaries added.
// ---------------------------------------------------------------------------
check("a v20 dataset gets Gate 9 project fields/weights/array backfilled and lands on schema_version 21", () => {
  const v20 = {
    schema_version: 20,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [],
  };
  const store = loadStoreWith(JSON.stringify(v20));
  const data = store.get();

  assert.strictEqual(data.schema_version, 21);
  assert.strictEqual(data.projects[0].name, "Existing Project", "existing project fields must survive untouched");
  assert.strictEqual(data.projects[0].project_type, "");
  assert.strictEqual(data.projects[0].current_phase, "");
  assert.strictEqual(data.projects[0].forecast_finish_date, "");
  assert.ok(data.settings.health_score_weights, "health_score_weights must be defaulted");
  assert.strictEqual(data.settings.health_score_weights.schedule, 25);
  assert.deepStrictEqual(data.executive_summaries, []);
});

// ---------------------------------------------------------------------------
// Full chain from a very old (v1-shaped) dataset still reaches v21 cleanly
// ---------------------------------------------------------------------------
check("a minimal legacy dataset (no schema_version at all) migrates all the way to 21 without throwing", () => {
  const legacy = {
    projects: [{ id: "proj_1", name: "Old Project" }],
    documents: [],
  };
  const store = loadStoreWith(JSON.stringify(legacy));
  const data = store.get();
  assert.strictEqual(data.schema_version, 21);
  assert.ok(Array.isArray(data.schedule_baselines));
  assert.ok(Array.isArray(data.cost_budget_items));
  assert.ok(Array.isArray(data.cost_actuals));
  assert.ok(Array.isArray(data.executive_summaries));
  assert.strictEqual(data.projects[0].name, "Old Project", "pre-existing project must survive the full migration chain");
  assert.strictEqual(data.projects[0].project_type, "");
});

// ---------------------------------------------------------------------------
// A brand-new install (no stored data at all) gets everything from emptyData()
// ---------------------------------------------------------------------------
check("a brand-new install with no stored data starts with executive_summaries: [] and default health weights", () => {
  const store = loadStoreWith(null);
  const data = store.get();
  assert.strictEqual(data.schema_version, 21);
  assert.deepStrictEqual(data.executive_summaries, []);
  assert.deepStrictEqual(data.settings.health_score_weights, {
    schedule: 25, cost: 20, risk: 20, issue: 10, rfi: 15, change: 10,
  });
});

// ---------------------------------------------------------------------------
// newProject() Gate 9 fields
// ---------------------------------------------------------------------------
check("newProject() defaults project_type/current_phase/forecast_finish_date to empty string", () => {
  const store = loadStoreWith(null);
  const p = store.newProject({ name: "New Project" });
  assert.strictEqual(p.project_type, "");
  assert.strictEqual(p.current_phase, "");
  assert.strictEqual(p.forecast_finish_date, "");
});

// ---------------------------------------------------------------------------
// newExecutiveSummary() factory sanity
// ---------------------------------------------------------------------------
check("newExecutiveSummary() produces a well-formed record with all overrides empty by default", () => {
  const store = loadStoreWith(null);
  const s1 = store.newExecutiveSummary({ project_id: "proj_1" });
  const s2 = store.newExecutiveSummary({ project_id: "proj_1" });
  assert.ok(s1.id && s2.id && s1.id !== s2.id, "each summary must get a unique id");
  assert.strictEqual(s1.project_id, "proj_1");
  assert.strictEqual(s1.status_override, "");
  assert.strictEqual(s1.achievements_override, "");
  assert.strictEqual(s1.challenges_override, "");
  assert.strictEqual(s1.management_attention_override, "");
  assert.strictEqual(s1.upcoming_override, "");
  assert.ok(s1.updated_at);
});

// ---------------------------------------------------------------------------
// Prior-gate factory sanity, kept so this file remains the one canonical schema test
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

check("newCostBudgetItem() defaults category to 'other', activity_id to unlinked, and produces a unique id", () => {
  const store = loadStoreWith(null);
  const b1 = store.newCostBudgetItem({ project_id: "proj_1", name: "Rebar", planned_amount: 50000 });
  const b2 = store.newCostBudgetItem({ project_id: "proj_1", name: "Formwork", planned_amount: 20000 });
  assert.ok(b1.id && b2.id && b1.id !== b2.id, "each budget item must get a unique id");
  assert.strictEqual(b1.category, "other");
  assert.strictEqual(b1.planned_amount, 50000);
  assert.strictEqual(b1.activity_id, "", "unlinked by default");
  assert.ok(b1.created_at);
});

check("newCostActual() defaults budget_item_id to '' (unbudgeted) and stamps today's date", () => {
  const store = loadStoreWith(null);
  const a1 = store.newCostActual({ project_id: "proj_1", description: "Rebar delivery", amount: 12000 });
  assert.strictEqual(a1.budget_item_id, "");
  assert.strictEqual(a1.amount, 12000);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(a1.date), "date should default to today in YYYY-MM-DD form");
});

check("COST_CATEGORIES includes the standard construction cost categories", () => {
  const store = loadStoreWith(null);
  ["labor", "materials", "equipment", "subcontractor", "permits_fees", "other"].forEach((c) => {
    assert.ok(store.COST_CATEGORIES.indexOf(c) !== -1, "missing category: " + c);
  });
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
