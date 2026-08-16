// Standalone Node test for store.js's migrate() function, exercised indirectly through
// load() — same approach every prior version of this file used, replaced here per the
// "one canonical full-chain test targeting latest" pattern established at Gate 6 (this
// file supersedes the v22 one; its own checks are folded in below rather than kept as a
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
// v20 -> v23 in one hop: project_type/current_phase/forecast_finish_date backfilled
// onto existing projects, health_score_weights defaulted, executive_summaries added
// (v21, Gate 9); activity_id backfilled onto every linkable register's existing
// records (v22, Gate 10); resources/resource_assignments arrays added (v23, Gate 11).
// ---------------------------------------------------------------------------
check("a v20 dataset gets Gate 9 + Gate 10 + Gate 11 fields backfilled and lands on schema_version 23", () => {
  const v20 = {
    schema_version: 20,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [{ id: "doc_1", project_id: "proj_1", filename: "x.pdf" }],
    risks: [{ id: "r_1", project_id: "proj_1", type: "risk", title: "Existing Risk" }],
    daily_logs: [{ id: "dl_1", project_id: "proj_1", log_date: "2026-01-01" }],
    meetings: [{ id: "m_1", project_id: "proj_1", title: "Existing Meeting", actions: [] }],
    rfis: [{ id: "rf_1", project_id: "proj_1", type: "rfi", number: "RFI-001" }],
    change_orders: [{ id: "co_1", project_id: "proj_1", number: "CO-001" }],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [],
  };
  const store = loadStoreWith(JSON.stringify(v20));
  const data = store.get();

  assert.strictEqual(data.schema_version, 23);
  assert.strictEqual(data.projects[0].name, "Existing Project", "existing project fields must survive untouched");
  assert.strictEqual(data.projects[0].project_type, "");
  assert.ok(data.settings.health_score_weights, "health_score_weights must be defaulted");
  assert.deepStrictEqual(data.executive_summaries, []);

  // Gate 10: activity_id backfilled as "" (unlinked) on every existing record across
  // all six linkable registers, with every other field left untouched.
  assert.strictEqual(data.documents[0].activity_id, "");
  assert.strictEqual(data.documents[0].filename, "x.pdf");
  assert.strictEqual(data.risks[0].activity_id, "");
  assert.strictEqual(data.risks[0].title, "Existing Risk");
  assert.strictEqual(data.daily_logs[0].activity_id, "");
  assert.strictEqual(data.meetings[0].activity_id, "");
  assert.strictEqual(data.meetings[0].title, "Existing Meeting");
  assert.strictEqual(data.rfis[0].activity_id, "");
  assert.strictEqual(data.change_orders[0].activity_id, "");
  assert.strictEqual(data.change_orders[0].number, "CO-001");

  // Gate 11: brand new arrays, nothing to backfill on a dataset that predates them.
  assert.deepStrictEqual(data.resources, []);
  assert.deepStrictEqual(data.resource_assignments, []);
});

// ---------------------------------------------------------------------------
// Full chain from a very old (v1-shaped) dataset still reaches v23 cleanly
// ---------------------------------------------------------------------------
check("a minimal legacy dataset (no schema_version at all) migrates all the way to 23 without throwing", () => {
  const legacy = {
    projects: [{ id: "proj_1", name: "Old Project" }],
    documents: [],
  };
  const store = loadStoreWith(JSON.stringify(legacy));
  const data = store.get();
  assert.strictEqual(data.schema_version, 23);
  assert.ok(Array.isArray(data.schedule_baselines));
  assert.ok(Array.isArray(data.cost_budget_items));
  assert.ok(Array.isArray(data.cost_actuals));
  assert.ok(Array.isArray(data.executive_summaries));
  assert.ok(Array.isArray(data.resources));
  assert.ok(Array.isArray(data.resource_assignments));
  assert.strictEqual(data.projects[0].name, "Old Project", "pre-existing project must survive the full migration chain");
  assert.strictEqual(data.projects[0].project_type, "");
});

// ---------------------------------------------------------------------------
// A brand-new install (no stored data at all) gets everything from emptyData()
// ---------------------------------------------------------------------------
check("a brand-new install with no stored data starts with executive_summaries: [] and default health weights", () => {
  const store = loadStoreWith(null);
  const data = store.get();
  assert.strictEqual(data.schema_version, 23);
  assert.deepStrictEqual(data.executive_summaries, []);
  assert.deepStrictEqual(data.settings.health_score_weights, {
    schedule: 25, cost: 20, risk: 20, issue: 10, rfi: 15, change: 10,
  });
  assert.deepStrictEqual(data.resources, []);
  assert.deepStrictEqual(data.resource_assignments, []);
});

// ---------------------------------------------------------------------------
// Gate 10 factory defaults: every linkable register's factory defaults activity_id
// to "" (unlinked)
// ---------------------------------------------------------------------------
check("newRisk()/newRfi()/newMeeting()/newDocument()/newDailyLog()/newChangeOrder() all default activity_id to ''", () => {
  const store = loadStoreWith(null);
  assert.strictEqual(store.newRisk({}).activity_id, "");
  assert.strictEqual(store.newRfi({}).activity_id, "");
  assert.strictEqual(store.newMeeting({}).activity_id, "");
  assert.strictEqual(store.newDocument({}).activity_id, "");
  assert.strictEqual(store.newDailyLog({}).activity_id, "");
  assert.strictEqual(store.newChangeOrder({}).activity_id, "");
});

// ---------------------------------------------------------------------------
// Gate 11 factory defaults
// ---------------------------------------------------------------------------
check("newResource() defaults type to 'labor', max_availability to null, and produces a unique id", () => {
  const store = loadStoreWith(null);
  const r1 = store.newResource({ name: "Tower Crane" });
  const r2 = store.newResource({ name: "Electricians" });
  assert.ok(r1.id && r2.id && r1.id !== r2.id, "each resource must get a unique id");
  assert.strictEqual(r1.type, "labor");
  assert.strictEqual(r1.max_availability, null);
  assert.ok(r1.created_at);
});

check("newResourceAssignment() defaults quantity to null and produces a unique id", () => {
  const store = loadStoreWith(null);
  const a1 = store.newResourceAssignment({ resource_id: "res_1", activity_id: "act_1" });
  const a2 = store.newResourceAssignment({ resource_id: "res_1", activity_id: "act_2" });
  assert.ok(a1.id && a2.id && a1.id !== a2.id, "each assignment must get a unique id");
  assert.strictEqual(a1.resource_id, "res_1");
  assert.strictEqual(a1.quantity, null);
});

check("RESOURCE_TYPES includes labor, equipment, and material", () => {
  const store = loadStoreWith(null);
  ["labor", "equipment", "material"].forEach((t) => {
    assert.ok(store.RESOURCE_TYPES.indexOf(t) !== -1, "missing resource type: " + t);
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
