// Standalone Node test for store.js's migrate() function, exercised indirectly through
// load() (migrate() itself isn't exported — load() is the only path that calls it, and
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
// v19 -> v20: activity_id backfilled onto existing budget items, nothing else touched
// ---------------------------------------------------------------------------
check("a v19 dataset gets activity_id backfilled onto existing budget items and lands on schema_version 20", () => {
  const v19 = {
    schema_version: 19,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    cost_budget_items: [{ id: "cb_1", project_id: "proj_1", category: "materials", name: "Rebar", planned_amount: 50000, notes: "" }],
    cost_actuals: [{ id: "ca_1", project_id: "proj_1", budget_item_id: "cb_1", amount: 12000 }],
  };
  const store = loadStoreWith(JSON.stringify(v19));
  const data = store.get();

  // Migration is a chain — a v19 dataset now also runs the v20->v21 (Gate 9, Vendor
  // Management) step on the way through, so it lands on the CURRENT schema_version,
  // not frozen at 20 forever. That's inherent to how migrate() works, not a re-scoping
  // of what this test checks (the v19->v20 assertions below are unchanged).
  assert.strictEqual(data.schema_version, 21);
  assert.strictEqual(data.cost_budget_items.length, 1, "no budget items should be fabricated or dropped");
  assert.strictEqual(data.cost_budget_items[0].activity_id, "", "pre-Gate-7 budget items get an empty (unlinked) activity_id, not undefined");
  assert.strictEqual(data.cost_budget_items[0].name, "Rebar", "existing fields must survive untouched");
  assert.strictEqual(data.cost_actuals.length, 1);
  assert.strictEqual(data.cost_actuals[0].budget_item_id, "cb_1");
});

// ---------------------------------------------------------------------------
// Full chain from a very old (v1-shaped) dataset still reaches v20 cleanly
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
  assert.ok(Array.isArray(data.vendors), "Gate 9's vendors array must be backfilled by the full chain");
  assert.ok(Array.isArray(data.vendor_documents));
  assert.strictEqual(data.projects[0].name, "Old Project", "pre-existing project must survive the full migration chain");
});

// ---------------------------------------------------------------------------
// A brand-new install (no stored data at all) gets everything from emptyData()
// ---------------------------------------------------------------------------
check("a brand-new install with no stored data starts with cost_budget_items/cost_actuals: []", () => {
  const store = loadStoreWith(null);
  const data = store.get();
  assert.strictEqual(data.schema_version, 21);
  assert.deepStrictEqual(data.cost_budget_items, []);
  assert.deepStrictEqual(data.cost_actuals, []);
  assert.deepStrictEqual(data.vendors, []);
});

// ---------------------------------------------------------------------------
// newScheduleBaseline() factory sanity (kept from the prior schema-migration test)
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

// ---------------------------------------------------------------------------
// newCostBudgetItem() / newCostActual() factory sanity
// ---------------------------------------------------------------------------
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
