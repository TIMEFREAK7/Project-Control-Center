// Standalone Node test for store.js's migrate() function, exercised indirectly through
// load() — same approach every prior version of this file used, replaced here per the
// "one canonical full-chain test targeting latest" pattern established at Gate 6 (this
// file supersedes the v27 one, whose checks are folded in below).
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
// v20 -> v28 in one hop: project_type/current_phase/forecast_finish_date backfilled
// onto existing projects, health_score_weights defaulted, executive_summaries added
// (v21, Gate 9); activity_id backfilled onto every linkable register's existing
// records (v22, Gate 10); resources/resource_assignments arrays added (v23, Gate 11);
// nine Vendor Management arrays added (v24, Gate 13); document_types repository seeded
// (v25, Gate 14); project_document_requirements added (v26, Gate 15); document
// classification fields + project_code + nomenclature settings added (v27, Gate 16);
// document status + document_group_id/revision_number added (v28, Gate 17); ten
// project-setup-flavored document types added to the master repository (v29, Gate 18
// doc-control UX fix); planned_submission_date backfilled onto existing requirement
// rows (v30, Gate 5: Document Control 5, Schedule Due Dates); vendor_id backfilled onto
// existing requirement rows (v31, Gate 6: Document Control 6, Vendor Register);
// activity_id backfilled onto existing requirement rows (v32, Gate 7: Document Control
// 7, Schedule↔Document Linking); lead_time_days backfilled onto existing requirement
// rows (v33, Gate 8: Document Control 8, Schedule-Driven Dates/Lead Time);
// document_control_override backfilled onto existing executive_summaries rows (v34,
// Gate 27 / Document Control 13, Executive Summary); vendor_id backfilled onto existing
// activities (v35, Gate 32, PCC Evolution Roadmap Tier B: Activity → Vendor);
// vendor_id/activity_id/rfi_id/risk_id backfilled onto existing meeting action items
// (v36, Gate 33, PCC Evolution Roadmap Tier B: Meeting Action → Control Linking).
// ---------------------------------------------------------------------------
check("a v20 dataset gets Gate 9 + Gate 10 + Gate 11 + Gate 13 + Gate 14 + Gate 15 + Gate 16 + Gate 17 + Gate 18 + Gate 5 + Gate 6 + Gate 7 + Gate 8 + Gate 13(DC) fields backfilled (Gates 32-33 add nothing to backfill here — no activities or meeting actions in this v20 fixture) and lands on schema_version 36", () => {
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

  assert.strictEqual(data.schema_version, 46);
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

  // Gate 13: nine brand new Vendor Management arrays, same treatment.
  assert.deepStrictEqual(data.vendors, []);
  assert.deepStrictEqual(data.vendor_contacts, []);
  assert.deepStrictEqual(data.vendor_project_links, []);
  assert.deepStrictEqual(data.vendor_documents, []);
  assert.deepStrictEqual(data.vendor_meeting_links, []);
  assert.deepStrictEqual(data.vendor_rfi_links, []);
  assert.deepStrictEqual(data.vendor_risk_links, []);
  assert.deepStrictEqual(data.vendor_performance, []);
  assert.deepStrictEqual(data.vendor_notes, []);

  // Gate 14: document_types is seeded (not left empty) on upgrade, same as a fresh
  // install — an existing user shouldn't land on an empty master repository.
  assert.ok(Array.isArray(data.document_types));
  assert.ok(data.document_types.length > 0, "document_types must be seeded on upgrade, not left empty");
  assert.ok(data.document_types.every((t) => t.active === true), "seeded types must start active");
  const boq = data.document_types.find((t) => t.name === "BOQ");
  assert.ok(boq, "seed list must include BOQ");
  assert.strictEqual(boq.code, "BOQ");
  assert.strictEqual(boq.default_criticality, "normal");

  // Gate 15: brand new join array, nothing to backfill — an existing project simply
  // starts with no requirements selected.
  assert.deepStrictEqual(data.project_document_requirements, []);

  // Gate 16: project_code backfilled onto the existing project; classification fields
  // backfilled onto the existing document; nomenclature settings defaulted.
  assert.strictEqual(data.projects[0].project_code, "");
  assert.strictEqual(data.documents[0].document_type_id, "");
  assert.strictEqual(data.documents[0].discipline, "");
  assert.strictEqual(data.documents[0].document_number, "");
  assert.strictEqual(data.documents[0].revision, "00");
  assert.strictEqual(data.documents[0].package, "");
  assert.strictEqual(data.documents[0].contract_or_po, "");
  assert.strictEqual(data.documents[0].vendor_id, "");
  assert.strictEqual(data.documents[0].priority, "medium");
  assert.strictEqual(data.documents[0].criticality, "");
  assert.strictEqual(data.documents[0].remarks, "");
  assert.strictEqual(data.settings.document_nomenclature_pattern, "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV");
  assert.strictEqual(data.settings.document_nomenclature_enabled, true);

  // Gate 17: existing document becomes its own single-revision group; status defaults
  // to "draft" (not a claim about where it actually sits in review).
  assert.strictEqual(data.documents[0].status, "draft");
  assert.strictEqual(data.documents[0].document_group_id, "doc_1", "a pre-existing document with no group id must become its own group, keyed by its own id");
  assert.strictEqual(data.documents[0].revision_number, 1);

  // Gate 18: the project-setup-flavored types are appended to an existing install's
  // master repository, on top of the Gate 14 seed list, all starting active.
  const charter = data.document_types.find((t) => t.name === "Project Charter");
  assert.ok(charter, "Gate 18's project-setup types must be backfilled onto an upgrading install");
  assert.strictEqual(charter.code, "PC");
  assert.strictEqual(charter.active, true);
  assert.ok(data.document_types.find((t) => t.name === "BOQ"), "the original Gate 14 seed list must still be present alongside the Gate 18 additions");
});

// ---------------------------------------------------------------------------
// v19 -> v20 step in isolation, kept from the Gate 13 branch's own schema test:
// activity_id backfilled onto existing budget items, nothing else touched, then the
// rest of the chain (through Gate 13) carries the dataset on to the current version.
// ---------------------------------------------------------------------------
check("a v19 dataset gets activity_id backfilled onto existing budget items and lands on schema_version 36", () => {
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

  assert.strictEqual(data.schema_version, 46);
  assert.strictEqual(data.cost_budget_items.length, 1, "no budget items should be fabricated or dropped");
  assert.strictEqual(data.cost_budget_items[0].activity_id, "", "pre-Gate-7 budget items get an empty (unlinked) activity_id, not undefined");
  assert.strictEqual(data.cost_budget_items[0].name, "Rebar", "existing fields must survive untouched");
  assert.strictEqual(data.cost_actuals.length, 1);
  assert.strictEqual(data.cost_actuals[0].budget_item_id, "cb_1");
});

// ---------------------------------------------------------------------------
// Full chain from a very old (v1-shaped) dataset still reaches v34 cleanly
// ---------------------------------------------------------------------------
check("a minimal legacy dataset (no schema_version at all) migrates all the way to 34 without throwing", () => {
  const legacy = {
    projects: [{ id: "proj_1", name: "Old Project" }],
    documents: [{ id: "doc_1", project_id: "proj_1", filename: "legacy.pdf" }],
  };
  const store = loadStoreWith(JSON.stringify(legacy));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.ok(Array.isArray(data.schedule_baselines));
  assert.ok(Array.isArray(data.cost_budget_items));
  assert.ok(Array.isArray(data.cost_actuals));
  assert.ok(Array.isArray(data.executive_summaries));
  assert.ok(Array.isArray(data.resources));
  assert.ok(Array.isArray(data.resource_assignments));
  assert.ok(Array.isArray(data.vendors), "Gate 13's vendors array must be backfilled by the full chain");
  assert.ok(Array.isArray(data.vendor_documents));
  assert.ok(Array.isArray(data.document_types) && data.document_types.length > 0, "Gate 14's document_types must be seeded by the full chain");
  assert.ok(Array.isArray(data.project_document_requirements), "Gate 15's project_document_requirements must be backfilled by the full chain");
  assert.strictEqual(data.projects[0].project_code, "", "Gate 16's project_code must be backfilled by the full chain");
  assert.strictEqual(data.documents[0].status, "draft", "Gate 17's status must be backfilled by the full chain");
  assert.strictEqual(data.documents[0].document_group_id, "doc_1", "Gate 17's document_group_id must default to the document's own id");
  assert.strictEqual(data.documents[0].revision_number, 1, "Gate 17's revision_number must be backfilled by the full chain");
  assert.ok(data.document_types.find((t) => t.name === "Project Charter"), "Gate 18's project-setup types must be backfilled by the full chain");
  assert.strictEqual(data.projects[0].name, "Old Project", "pre-existing project must survive the full migration chain");
  assert.strictEqual(data.projects[0].project_type, "");
});

// ---------------------------------------------------------------------------
// A brand-new install (no stored data at all) gets everything from emptyData()
// ---------------------------------------------------------------------------
check("a brand-new install with no stored data starts with executive_summaries: [] and default health weights", () => {
  const store = loadStoreWith(null);
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.deepStrictEqual(data.executive_summaries, []);
  assert.deepStrictEqual(data.settings.health_score_weights, {
    schedule: 25, cost: 20, risk: 20, issue: 10, rfi: 15, change: 10,
  });
  assert.deepStrictEqual(data.resources, []);
  assert.deepStrictEqual(data.resource_assignments, []);
  assert.deepStrictEqual(data.vendors, []);
  assert.ok(data.document_types.length > 0, "a brand-new install also gets the seeded document_types repository");
  assert.ok(data.document_types.find((t) => t.name === "Project Charter"), "a brand-new install also gets Gate 18's project-setup types");
  assert.deepStrictEqual(data.project_document_requirements, []);
  assert.strictEqual(data.settings.document_nomenclature_pattern, "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV");
  assert.strictEqual(data.settings.document_nomenclature_enabled, true);
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
  assert.strictEqual(s1.document_control_override, "", "no override by default (Gate 27 / Document Control 13)");
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

// ---------------------------------------------------------------------------
// Gate 13 (Vendor Management) factory defaults
// ---------------------------------------------------------------------------
check("newVendor() defaults status to 'active' and produces a unique id", () => {
  const store = loadStoreWith(null);
  const v1 = store.newVendor({ vendor_name: "Acme Rebar" });
  const v2 = store.newVendor({ vendor_name: "Acme Formwork" });
  assert.ok(v1.id && v2.id && v1.id !== v2.id, "each vendor must get a unique id");
  assert.strictEqual(v1.status, "active");
  assert.strictEqual(v1.vendor_name, "Acme Rebar");
  assert.ok(v1.created_at);
});

check("nextVendorCode() suggests V-0001 for an empty list and increments off the highest existing code", () => {
  const store = loadStoreWith(null);
  assert.strictEqual(store.nextVendorCode([]), "V-0001");
  assert.strictEqual(store.nextVendorCode([{ vendor_code: "V-0001" }, { vendor_code: "V-0007" }]), "V-0008");
});

check("newVendorContact() defaults is_primary to false and produces a unique id", () => {
  const store = loadStoreWith(null);
  const c1 = store.newVendorContact({ vendor_id: "vn_1", name: "Ravi" });
  const c2 = store.newVendorContact({ vendor_id: "vn_1", name: "Priya" });
  assert.ok(c1.id && c2.id && c1.id !== c2.id, "each contact must get a unique id");
  assert.strictEqual(c1.is_primary, false);
});

check("newVendorProjectLink() produces a well-formed record with a unique id", () => {
  const store = loadStoreWith(null);
  const l1 = store.newVendorProjectLink({ vendor_id: "vn_1", project_id: "proj_1" });
  const l2 = store.newVendorProjectLink({ vendor_id: "vn_1", project_id: "proj_2" });
  assert.ok(l1.id && l2.id && l1.id !== l2.id, "each link must get a unique id");
  assert.strictEqual(l1.vendor_id, "vn_1");
});

check("VENDOR_STATUSES / VENDOR_DOCUMENT_CATEGORIES / VENDOR_PROJECT_CONTRACT_STATUSES are non-empty", () => {
  const store = loadStoreWith(null);
  assert.ok(store.VENDOR_STATUSES.length > 0);
  assert.ok(store.VENDOR_DOCUMENT_CATEGORIES.length > 0);
  assert.ok(store.VENDOR_PROJECT_CONTRACT_STATUSES.length > 0);
});

// ---------------------------------------------------------------------------
// Gate 14 (Document Control 1: Master Document Repository) factory defaults
// ---------------------------------------------------------------------------
check("newDocumentType() defaults active to true, default_criticality to 'normal', and produces a unique id", () => {
  const store = loadStoreWith(null);
  const t1 = store.newDocumentType({ name: "Method Statement" });
  const t2 = store.newDocumentType({ name: "ITP" });
  assert.ok(t1.id && t2.id && t1.id !== t2.id, "each document type must get a unique id");
  assert.strictEqual(t1.active, true);
  assert.strictEqual(t1.default_criticality, "normal");
  assert.strictEqual(t1.name, "Method Statement");
  assert.ok(t1.created_at);
});

check("DOCUMENT_TYPE_CRITICALITY_LEVELS includes critical, major, normal, and informational", () => {
  const store = loadStoreWith(null);
  ["critical", "major", "normal", "informational"].forEach((c) => {
    assert.ok(store.DOCUMENT_TYPE_CRITICALITY_LEVELS.indexOf(c) !== -1, "missing criticality level: " + c);
  });
});

check("a brand-new install's document_types repository includes the seeded starting list, all active", () => {
  const store = loadStoreWith(null);
  const data = store.get();
  const names = data.document_types.map((t) => t.name);
  ["Contract", "BOQ", "Method Statements", "ITP", "RFIs", "As-Built Drawings"].forEach((n) => {
    assert.ok(names.indexOf(n) !== -1, "seed list missing: " + n);
  });
  assert.ok(data.document_types.every((t) => t.active === true));
  // No duplicate ids within the seeded list.
  const ids = data.document_types.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, "seeded document types must all have unique ids");
});

// ---------------------------------------------------------------------------
// Gate 15 (Document Control 2: Project-Specific Document Requirements)
// ---------------------------------------------------------------------------
check("newProjectDocumentRequirement() produces a well-formed record with a unique id", () => {
  const store = loadStoreWith(null);
  const r1 = store.newProjectDocumentRequirement({ project_id: "proj_1", document_type_id: "dtp_1" });
  const r2 = store.newProjectDocumentRequirement({ project_id: "proj_1", document_type_id: "dtp_2" });
  assert.ok(r1.id && r2.id && r1.id !== r2.id, "each requirement must get a unique id");
  assert.strictEqual(r1.project_id, "proj_1");
  assert.strictEqual(r1.document_type_id, "dtp_1");
  assert.strictEqual(r1.planned_submission_date, null, "no due date by default (Gate 5)");
  assert.strictEqual(r1.vendor_id, "", "no vendor assigned by default (Gate 6)");
  assert.strictEqual(r1.activity_id, "", "no linked activity by default (Gate 7)");
  assert.strictEqual(r1.lead_time_days, null, "no lead time by default (Gate 8)");
  assert.ok(r1.created_at);
});

check("PROJECT_TEMPLATES includes the five named templates, each with suggested type names", () => {
  const store = loadStoreWith(null);
  const keys = store.PROJECT_TEMPLATES.map((t) => t.key);
  ["epc", "industrial_construction", "manufacturing", "infrastructure", "energy"].forEach((k) => {
    assert.ok(keys.indexOf(k) !== -1, "missing template: " + k);
  });
  store.PROJECT_TEMPLATES.forEach((t) => {
    assert.ok(t.label, "template " + t.key + " must have a label");
    assert.ok(Array.isArray(t.suggested_type_names) && t.suggested_type_names.length > 0, "template " + t.key + " must have suggested names");
  });
});

check("every PROJECT_TEMPLATES suggested name matches a seeded document type by name (so templates are actually usable out of the box)", () => {
  const store = loadStoreWith(null);
  const data = store.get();
  const seededNames = data.document_types.map((t) => t.name.toLowerCase());
  store.PROJECT_TEMPLATES.forEach((t) => {
    t.suggested_type_names.forEach((n) => {
      assert.ok(seededNames.indexOf(n.toLowerCase()) !== -1, "template " + t.key + "'s \"" + n + "\" does not match any seeded document type name");
    });
  });
});

// ---------------------------------------------------------------------------
// Gate 16 (Document Control 3: Classification + Nomenclature) factory defaults
// ---------------------------------------------------------------------------
check("newProject() defaults project_code to an empty string", () => {
  const store = loadStoreWith(null);
  const p = store.newProject({ name: "New Project" });
  assert.strictEqual(p.project_code, "");
});

check("newDocument() defaults every Gate 16 classification field", () => {
  const store = loadStoreWith(null);
  const d = store.newDocument({ project_id: "proj_1", filename: "x.pdf" });
  assert.strictEqual(d.document_type_id, "");
  assert.strictEqual(d.discipline, "");
  assert.strictEqual(d.document_number, "");
  assert.strictEqual(d.revision, "00");
  assert.strictEqual(d.package, "");
  assert.strictEqual(d.contract_or_po, "");
  assert.strictEqual(d.vendor_id, "");
  assert.strictEqual(d.priority, "medium");
  assert.strictEqual(d.criticality, "");
  assert.strictEqual(d.remarks, "");
  // category (pre-existing field) must be completely untouched by this gate.
  assert.strictEqual(d.category, "other");
});

// ---------------------------------------------------------------------------
// Gate 17 (Document Control 4: Status + Version Control) factory defaults
// ---------------------------------------------------------------------------
check("newDocument() defaults status to 'draft' and revision_number to 1, and defaults document_group_id to its own id", () => {
  const store = loadStoreWith(null);
  const d1 = store.newDocument({ project_id: "proj_1", filename: "a.pdf" });
  const d2 = store.newDocument({ project_id: "proj_1", filename: "b.pdf" });
  assert.strictEqual(d1.status, "draft");
  assert.strictEqual(d1.revision_number, 1);
  assert.strictEqual(d1.document_group_id, d1.id, "document_group_id must default to the document's own id when not supplied");
  assert.notStrictEqual(d1.document_group_id, d2.document_group_id, "two independently-created documents must not share a group");
});

check("newDocument() honors an explicitly supplied document_group_id (the 'new revision' path)", () => {
  const store = loadStoreWith(null);
  const original = store.newDocument({ project_id: "proj_1", filename: "a.pdf" });
  const revision2 = store.newDocument({ project_id: "proj_1", filename: "a-rev01.pdf", document_group_id: original.document_group_id, revision_number: 2 });
  assert.strictEqual(revision2.document_group_id, original.document_group_id);
  assert.strictEqual(revision2.revision_number, 2);
  assert.notStrictEqual(revision2.id, original.id, "a new revision must still be its own record, never overwriting the original");
});

check("DOCUMENT_STATUSES includes every status from both spec flows", () => {
  const store = loadStoreWith(null);
  ["draft", "submitted", "under_review", "approved", "rejected", "resubmitted", "superseded", "archived"].forEach((s) => {
    assert.ok(store.DOCUMENT_STATUSES.indexOf(s) !== -1, "missing status: " + s);
  });
});

// ---------------------------------------------------------------------------
// Gate 18 (Document Control UX refinement) factory/migration behavior: the master
// repository's original Gate 14 seed list read as execution/vendor-submittal-heavy
// with nothing representing documents a project generates at its own setup/kickoff —
// see PROJECT_SETUP_TYPE_SEED's comment in store.js.
// ---------------------------------------------------------------------------
check("a brand-new install's document_types repository includes all ten Gate 18 project-setup types", () => {
  const store = loadStoreWith(null);
  const names = store.get().document_types.map((t) => t.name);
  [
    "Project Charter", "Kickoff Checklist", "Statutory / Regulatory Approvals",
    "Land / Site Handover", "Insurance Documents", "Permits & Licenses",
    "Project Organization Chart", "Communication Plan", "Project Execution Plan",
    "Project Quality Plan",
  ].forEach((n) => {
    assert.ok(names.indexOf(n) !== -1, "seed list missing Gate 18 type: " + n);
  });
});

check("migrating a v28 dataset that already has a manually-added 'Project Charter' type does not create a duplicate", () => {
  const v28 = {
    schema_version: 28,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [], documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [{ id: "dtp_custom_1", name: "Project Charter", code: "CUSTOM-PC", category: "Custom", active: true, default_criticality: "normal", created_at: "2026-01-01T00:00:00.000Z" }],
    project_document_requirements: [],
  };
  const store = loadStoreWith(JSON.stringify(v28));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  const charters = data.document_types.filter((t) => t.name === "Project Charter");
  assert.strictEqual(charters.length, 1, "an existing hand-added type with a matching name must not be duplicated by the migration");
  assert.strictEqual(charters[0].id, "dtp_custom_1", "the user's own record must survive untouched, not be replaced by the seeded one");
  assert.ok(data.document_types.find((t) => t.name === "Kickoff Checklist"), "other Gate 18 types with no naming collision must still be added");
});

// ---------------------------------------------------------------------------
// Gate 5 (Document Control 5: Schedule Due Dates)
// ---------------------------------------------------------------------------
check("migrating a v29 dataset backfills planned_submission_date: null onto existing requirement rows without a value, and leaves one that already has a date untouched", () => {
  const v29 = {
    schema_version: 29,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [{ id: "dtp_1", name: "BOQ", code: "BOQ", category: "Commercial", active: true, default_criticality: "normal", created_at: "2026-01-01T00:00:00.000Z" }],
    project_document_requirements: [
      { id: "pdr_1", project_id: "proj_1", document_type_id: "dtp_1", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "pdr_2", project_id: "proj_1", document_type_id: "dtp_1", planned_submission_date: "2026-09-01", created_at: "2026-01-01T00:00:00.000Z" },
    ],
  };
  const store = loadStoreWith(JSON.stringify(v29));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.strictEqual(data.project_document_requirements.length, 2, "no requirement should be fabricated or dropped");
  const r1 = data.project_document_requirements.find((r) => r.id === "pdr_1");
  const r2 = data.project_document_requirements.find((r) => r.id === "pdr_2");
  assert.strictEqual(r1.planned_submission_date, null, "a pre-Gate-5 requirement with no due date gets null, not undefined");
  assert.strictEqual(r2.planned_submission_date, "2026-09-01", "an already-dated requirement must survive the migration untouched");
});

// ---------------------------------------------------------------------------
// Gate 6 (Document Control 6: Vendor Register)
// ---------------------------------------------------------------------------
check("migrating a v30 dataset backfills vendor_id: '' onto existing requirement rows without one, and leaves an already-assigned row untouched", () => {
  const v30 = {
    schema_version: 30,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [{ id: "vn_1", vendor_name: "Acme Rebar", status: "active" }],
    vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [{ id: "dtp_1", name: "BOQ", code: "BOQ", category: "Commercial", active: true, default_criticality: "normal", created_at: "2026-01-01T00:00:00.000Z" }],
    project_document_requirements: [
      { id: "pdr_1", project_id: "proj_1", document_type_id: "dtp_1", planned_submission_date: null, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "pdr_2", project_id: "proj_1", document_type_id: "dtp_1", planned_submission_date: null, vendor_id: "vn_1", created_at: "2026-01-01T00:00:00.000Z" },
    ],
  };
  const store = loadStoreWith(JSON.stringify(v30));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.strictEqual(data.project_document_requirements.length, 2, "no requirement should be fabricated or dropped");
  const r1 = data.project_document_requirements.find((r) => r.id === "pdr_1");
  const r2 = data.project_document_requirements.find((r) => r.id === "pdr_2");
  assert.strictEqual(r1.vendor_id, "", "a pre-Gate-6 requirement with no assigned vendor gets '', not undefined");
  assert.strictEqual(r2.vendor_id, "vn_1", "an already-assigned requirement must survive the migration untouched");
});

// ---------------------------------------------------------------------------
// Gate 7 (Document Control 7: Schedule↔Document Linking)
// ---------------------------------------------------------------------------
check("migrating a v31 dataset backfills activity_id: '' onto existing requirement rows without one, and leaves an already-linked row untouched", () => {
  const v31 = {
    schema_version: 31,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [{ id: "sch_1", project_id: "proj_1", name: "Baseline Programme" }],
    wbs_items: [],
    activities: [{ id: "act_1", project_id: "proj_1", schedule_id: "sch_1", name: "Issue for Construction" }],
    relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [{ id: "dtp_1", name: "BOQ", code: "BOQ", category: "Commercial", active: true, default_criticality: "normal", created_at: "2026-01-01T00:00:00.000Z" }],
    project_document_requirements: [
      { id: "pdr_1", project_id: "proj_1", document_type_id: "dtp_1", planned_submission_date: null, vendor_id: "", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "pdr_2", project_id: "proj_1", document_type_id: "dtp_1", planned_submission_date: null, vendor_id: "", activity_id: "act_1", created_at: "2026-01-01T00:00:00.000Z" },
    ],
  };
  const store = loadStoreWith(JSON.stringify(v31));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.strictEqual(data.project_document_requirements.length, 2, "no requirement should be fabricated or dropped");
  const r1 = data.project_document_requirements.find((r) => r.id === "pdr_1");
  const r2 = data.project_document_requirements.find((r) => r.id === "pdr_2");
  assert.strictEqual(r1.activity_id, "", "a pre-Gate-7 requirement with no linked activity gets '', not undefined");
  assert.strictEqual(r2.activity_id, "act_1", "an already-linked requirement must survive the migration untouched");
});

// ---------------------------------------------------------------------------
// Gate 8 (Document Control 8: Schedule-Driven Dates/Lead Time)
// ---------------------------------------------------------------------------
check("migrating a v32 dataset backfills lead_time_days: null onto existing requirement rows without one, and leaves an already-set row untouched", () => {
  const v32 = {
    schema_version: 32,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [{ id: "sch_1", project_id: "proj_1", name: "Baseline Programme" }],
    wbs_items: [],
    activities: [{ id: "act_1", project_id: "proj_1", schedule_id: "sch_1", name: "Issue for Construction" }],
    relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [{ id: "dtp_1", name: "BOQ", code: "BOQ", category: "Commercial", active: true, default_criticality: "normal", created_at: "2026-01-01T00:00:00.000Z" }],
    project_document_requirements: [
      { id: "pdr_1", project_id: "proj_1", document_type_id: "dtp_1", planned_submission_date: null, vendor_id: "", activity_id: "act_1", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "pdr_2", project_id: "proj_1", document_type_id: "dtp_1", planned_submission_date: null, vendor_id: "", activity_id: "act_1", lead_time_days: 14, created_at: "2026-01-01T00:00:00.000Z" },
    ],
  };
  const store = loadStoreWith(JSON.stringify(v32));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.strictEqual(data.project_document_requirements.length, 2, "no requirement should be fabricated or dropped");
  const r1 = data.project_document_requirements.find((r) => r.id === "pdr_1");
  const r2 = data.project_document_requirements.find((r) => r.id === "pdr_2");
  assert.strictEqual(r1.lead_time_days, null, "a pre-Gate-8 requirement with no lead time gets null, not undefined");
  assert.strictEqual(r2.lead_time_days, 14, "an already-set lead time must survive the migration untouched");
});

// ---------------------------------------------------------------------------
// Gate 27 (Document Control 13: Executive Summary)
// ---------------------------------------------------------------------------
check("migrating a v33 dataset backfills document_control_override: '' onto existing executive_summaries rows without one, and leaves an already-set override untouched", () => {
  const v33 = {
    schema_version: 33,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [
      { id: "es_1", project_id: "proj_1", status_override: "", achievements_override: "", challenges_override: "", management_attention_override: "", upcoming_override: "", updated_at: "2026-01-01T00:00:00.000Z" },
      { id: "es_2", project_id: "proj_1", status_override: "", achievements_override: "", challenges_override: "", management_attention_override: "", upcoming_override: "", document_control_override: "All clear.", updated_at: "2026-01-01T00:00:00.000Z" },
    ],
  };
  const store = loadStoreWith(JSON.stringify(v33));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.strictEqual(data.executive_summaries.length, 2, "no summary row should be fabricated or dropped");
  const s1 = data.executive_summaries.find((s) => s.id === "es_1");
  const s2 = data.executive_summaries.find((s) => s.id === "es_2");
  assert.strictEqual(s1.document_control_override, "", "a pre-Gate-27 summary with no override gets '', not undefined");
  assert.strictEqual(s2.document_control_override, "All clear.", "an already-set override must survive the migration untouched");
});

// ---------------------------------------------------------------------------
// Gate 32 (PCC Evolution Roadmap, Tier B: Activity → Vendor)
// ---------------------------------------------------------------------------
check("migrating a v34 dataset backfills vendor_id: '' onto existing activities without one, and leaves an already-set vendor_id untouched", () => {
  const v34 = {
    schema_version: 34,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [{ id: "sch_1", project_id: "proj_1", name: "Baseline Programme" }],
    wbs_items: [],
    activities: [
      { id: "act_1", project_id: "proj_1", schedule_id: "sch_1", name: "Issue for Construction" },
      { id: "act_2", project_id: "proj_1", schedule_id: "sch_1", name: "Already-assigned activity", vendor_id: "vnd_1" },
    ],
    relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [{ id: "vnd_1", vendor_name: "ABC Electrical" }], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [],
  };
  const store = loadStoreWith(JSON.stringify(v34));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.strictEqual(data.activities.length, 2, "no activity should be fabricated or dropped");
  const a1 = data.activities.find((a) => a.id === "act_1");
  const a2 = data.activities.find((a) => a.id === "act_2");
  assert.strictEqual(a1.vendor_id, "", "a pre-Gate-32 activity with no vendor gets '', not undefined");
  assert.strictEqual(a2.vendor_id, "vnd_1", "an already-set vendor_id must survive the migration untouched");
});

// ---------------------------------------------------------------------------
// Gate 33 (PCC Evolution Roadmap, Tier B: Meeting Action → Control Linking)
// ---------------------------------------------------------------------------
check("migrating a v35 dataset backfills vendor_id/activity_id/rfi_id/risk_id: '' onto existing meeting action items without them, and leaves already-set links untouched", () => {
  const v35 = {
    schema_version: 35,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [],
    meetings: [
      {
        id: "m_1",
        project_id: "proj_1",
        title: "Existing Meeting",
        actions: [
          { id: "a_1", description: "Unlinked action", owner: "", due_date: "", status: "open" },
          { id: "a_2", description: "Already-linked action", owner: "", due_date: "", status: "open", vendor_id: "vnd_1", activity_id: "act_1", rfi_id: "rf_1", risk_id: "r_1" },
        ],
      },
    ],
    rfis: [], change_orders: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [],
  };
  const store = loadStoreWith(JSON.stringify(v35));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  const actions = data.meetings[0].actions;
  assert.strictEqual(actions.length, 2, "no action should be fabricated or dropped");
  const a1 = actions.find((a) => a.id === "a_1");
  const a2 = actions.find((a) => a.id === "a_2");
  assert.strictEqual(a1.vendor_id, "", "a pre-Gate-33 action with no links gets '' for each, not undefined");
  assert.strictEqual(a1.activity_id, "");
  assert.strictEqual(a1.rfi_id, "");
  assert.strictEqual(a1.risk_id, "");
  assert.strictEqual(a2.vendor_id, "vnd_1", "already-set links must survive the migration untouched");
  assert.strictEqual(a2.activity_id, "act_1");
  assert.strictEqual(a2.rfi_id, "rf_1");
  assert.strictEqual(a2.risk_id, "r_1");
});

// ---------------------------------------------------------------------------
// PCC Evolution Roadmap, Tier C: Delay & Recovery Management
// ---------------------------------------------------------------------------
check("migrating a v36 dataset backfills recovery_actions: [] — a brand new register, nothing to backfill on existing records", () => {
  const v36 = {
    schema_version: 36,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [{ id: "sch_1", project_id: "proj_1", name: "Baseline Programme" }],
    wbs_items: [],
    activities: [{ id: "act_1", project_id: "proj_1", schedule_id: "sch_1", name: "Issue for Construction" }],
    relationships: [], schedule_baselines: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [],
  };
  const store = loadStoreWith(JSON.stringify(v36));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.ok(Array.isArray(data.recovery_actions), "recovery_actions must be backfilled as an array");
  assert.strictEqual(data.recovery_actions.length, 0, "nothing to backfill — a brand new register starts empty");
  assert.strictEqual(data.activities.length, 1, "no activity should be fabricated or dropped");
});

// ---------------------------------------------------------------------------
// PCC Evolution Roadmap, Tier C: Decision Register
// ---------------------------------------------------------------------------
check("migrating a v37 dataset backfills decisions: [] — a brand new register, nothing to backfill on existing records", () => {
  const v37 = {
    schema_version: 37,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [],
    schedules: [{ id: "sch_1", project_id: "proj_1", name: "Baseline Programme" }],
    wbs_items: [],
    activities: [{ id: "act_1", project_id: "proj_1", schedule_id: "sch_1", name: "Issue for Construction" }],
    relationships: [], schedule_baselines: [], recovery_actions: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [],
  };
  const store = loadStoreWith(JSON.stringify(v37));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.ok(Array.isArray(data.decisions), "decisions must be backfilled as an array");
  assert.strictEqual(data.decisions.length, 0, "nothing to backfill — a brand new register starts empty");
  assert.strictEqual(data.activities.length, 1, "no activity should be fabricated or dropped");
});

// ---------------------------------------------------------------------------
// PCC Evolution Roadmap, Tier D: Weekly Project Review
// ---------------------------------------------------------------------------
check("migrating a v38 dataset backfills weekly_reviews: [] — a brand new register, nothing to backfill on existing records", () => {
  const v38 = {
    schema_version: 38,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [], decisions: [],
    schedules: [{ id: "sch_1", project_id: "proj_1", name: "Baseline Programme" }],
    wbs_items: [],
    activities: [{ id: "act_1", project_id: "proj_1", schedule_id: "sch_1", name: "Issue for Construction" }],
    relationships: [], schedule_baselines: [], recovery_actions: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [],
  };
  const store = loadStoreWith(JSON.stringify(v38));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.ok(Array.isArray(data.weekly_reviews), "weekly_reviews must be backfilled as an array");
  assert.strictEqual(data.weekly_reviews.length, 0, "nothing to backfill — a brand new register starts empty");
  assert.strictEqual(data.activities.length, 1, "no activity should be fabricated or dropped");
});

check("migrating a v39 dataset backfills waiting_on_party onto RFI/TQ, Change Orders, and Decisions, next_follow_up_date onto Vendors, and review_cadence_days onto Projects — leaving already-set values untouched", () => {
  const v39 = {
    schema_version: 39,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [
      { id: "proj_1", name: "No Cadence Set", archived: false, status: "on_track", progress: 0, attachments: [] },
      { id: "proj_2", name: "Already Has Cadence", archived: false, status: "on_track", progress: 0, attachments: [], review_cadence_days: 14 },
    ],
    documents: [], risks: [], daily_logs: [], meetings: [],
    rfis: [
      { id: "rf_1", project_id: "proj_1", type: "rfi", status: "open" },
      { id: "rf_2", project_id: "proj_1", type: "rfi", status: "open", waiting_on_party: "client" },
    ],
    change_orders: [
      { id: "co_1", project_id: "proj_1", status: "pending" },
      { id: "co_2", project_id: "proj_1", status: "pending", waiting_on_party: "management" },
    ],
    decisions: [
      { id: "dec_1", project_id: "proj_1", status: "pending" },
      { id: "dec_2", project_id: "proj_1", status: "pending", waiting_on_party: "vendor" },
    ],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [], recovery_actions: [],
    cost_budget_items: [], cost_actuals: [], resources: [], resource_assignments: [],
    vendors: [
      { id: "v_1", vendor_name: "No Follow-up Set" },
      { id: "v_2", vendor_name: "Already Has Follow-up", next_follow_up_date: "2026-09-01" },
    ],
    vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [], weekly_reviews: [],
  };
  const store = loadStoreWith(JSON.stringify(v39));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);

  const rf1 = data.rfis.find((r) => r.id === "rf_1");
  const rf2 = data.rfis.find((r) => r.id === "rf_2");
  assert.strictEqual(rf1.waiting_on_party, "", "unset RFI gets '' (not categorized), never guessed");
  assert.strictEqual(rf2.waiting_on_party, "client", "already-set RFI is left untouched");

  const co1 = data.change_orders.find((c) => c.id === "co_1");
  const co2 = data.change_orders.find((c) => c.id === "co_2");
  assert.strictEqual(co1.waiting_on_party, "");
  assert.strictEqual(co2.waiting_on_party, "management");

  const dec1 = data.decisions.find((d) => d.id === "dec_1");
  const dec2 = data.decisions.find((d) => d.id === "dec_2");
  assert.strictEqual(dec1.waiting_on_party, "");
  assert.strictEqual(dec2.waiting_on_party, "vendor");

  const v1 = data.vendors.find((v) => v.id === "v_1");
  const v2 = data.vendors.find((v) => v.id === "v_2");
  assert.strictEqual(v1.next_follow_up_date, "");
  assert.strictEqual(v2.next_follow_up_date, "2026-09-01", "already-set follow-up date is left untouched");

  const proj1 = data.projects.find((p) => p.id === "proj_1");
  const proj2 = data.projects.find((p) => p.id === "proj_2");
  assert.strictEqual(proj1.review_cadence_days, 7, "unset cadence defaults to 7 (weekly), same as newProject()");
  assert.strictEqual(proj2.review_cadence_days, 14, "already-set cadence is left untouched");
});

check("migrating a v40 dataset backfills actual_quantity/planned_hours_per_day/overtime_hours/vendor_id onto resource_assignments and adds resource_unavailability: [] — leaving already-set values untouched", () => {
  const v40 = {
    schema_version: 40,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [], decisions: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [], recovery_actions: [],
    cost_budget_items: [], cost_actuals: [],
    resources: [{ id: "res_1", name: "Skilled Labor", type: "labor", unit: "person", max_availability: 5 }],
    resource_assignments: [
      { id: "asg_1", resource_id: "res_1", activity_id: "act_x", quantity: 3 },
      { id: "asg_2", resource_id: "res_1", activity_id: "act_y", quantity: 2, actual_quantity: 2, planned_hours_per_day: 8, overtime_hours: 4, vendor_id: "v_1" },
    ],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [], weekly_reviews: [],
  };
  const store = loadStoreWith(JSON.stringify(v40));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);

  const asg1 = data.resource_assignments.find((a) => a.id === "asg_1");
  assert.strictEqual(asg1.actual_quantity, null, "unset actual_quantity backfills to null, never invented from planned quantity");
  assert.strictEqual(asg1.planned_hours_per_day, null);
  assert.strictEqual(asg1.overtime_hours, null);
  assert.strictEqual(asg1.vendor_id, "");

  const asg2 = data.resource_assignments.find((a) => a.id === "asg_2");
  assert.strictEqual(asg2.actual_quantity, 2, "already-set actual_quantity is left untouched");
  assert.strictEqual(asg2.planned_hours_per_day, 8);
  assert.strictEqual(asg2.overtime_hours, 4);
  assert.strictEqual(asg2.vendor_id, "v_1");

  assert.ok(Array.isArray(data.resource_unavailability), "resource_unavailability must be backfilled as an array");
  assert.strictEqual(data.resource_unavailability.length, 0, "nothing to backfill — a brand new register starts empty");
  assert.strictEqual(data.resources.length, 1, "no resource should be fabricated or dropped");
});

check("newResource()'s expanded RESOURCE_TYPES still includes the legacy labor/equipment/material values", () => {
  const store = loadStoreWith(null);
  assert.ok(store.RESOURCE_TYPES.indexOf("labor") !== -1, "legacy 'labor' must remain valid so Gate 11 resources keep their type");
  assert.ok(store.RESOURCE_TYPES.indexOf("material") !== -1);
  assert.ok(store.RESOURCE_TYPES.indexOf("equipment") !== -1);
  ["employee", "engineer", "supervisor", "skilled_labor", "unskilled_labor", "contractor", "subcontractor", "machinery"].forEach((t) => {
    assert.ok(store.RESOURCE_TYPES.indexOf(t) !== -1, "missing spec category: " + t);
  });
});

check("newResourceUnavailability() produces a well-formed record with a unique id", () => {
  const store = loadStoreWith(null);
  const u = store.newResourceUnavailability({ resource_id: "res_1", start_date: "2026-08-20", end_date: "2026-08-25", quantity: 2, reason: "Annual Leave" });
  assert.ok(u.id);
  assert.strictEqual(u.resource_id, "res_1");
  assert.strictEqual(u.start_date, "2026-08-20");
  assert.strictEqual(u.end_date, "2026-08-25");
  assert.strictEqual(u.quantity, 2);
  assert.strictEqual(u.reason, "Annual Leave");
});

check("migrating a v41 dataset backfills commitment_id onto cost_actuals, package_id onto documents, and adds packages/commitments: [] — leaving already-set values untouched", () => {
  const v41 = {
    schema_version: 41,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [
      { id: "doc_1", project_id: "proj_1", filename: "a.pdf" },
      { id: "doc_2", project_id: "proj_1", filename: "b.pdf", package_id: "pkg_x" },
    ],
    risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [], decisions: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [], recovery_actions: [],
    cost_budget_items: [],
    cost_actuals: [
      { id: "ca_1", project_id: "proj_1", amount: 100 },
      { id: "ca_2", project_id: "proj_1", amount: 200, commitment_id: "cmt_x" },
    ],
    resources: [], resource_assignments: [], resource_unavailability: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [], weekly_reviews: [],
  };
  const store = loadStoreWith(JSON.stringify(v41));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);

  const doc1 = data.documents.find((d) => d.id === "doc_1");
  const doc2 = data.documents.find((d) => d.id === "doc_2");
  assert.strictEqual(doc1.package_id, "", "unset document gets '' (unlinked), never guessed");
  assert.strictEqual(doc2.package_id, "pkg_x", "already-set document is left untouched");

  const ca1 = data.cost_actuals.find((a) => a.id === "ca_1");
  const ca2 = data.cost_actuals.find((a) => a.id === "ca_2");
  assert.strictEqual(ca1.commitment_id, "");
  assert.strictEqual(ca2.commitment_id, "cmt_x", "already-set cost actual is left untouched");

  assert.ok(Array.isArray(data.packages), "packages must be backfilled as an array");
  assert.strictEqual(data.packages.length, 0, "nothing to backfill — a brand new register starts empty");
  assert.ok(Array.isArray(data.commitments));
  assert.strictEqual(data.commitments.length, 0);
});

check("newCommitment() produces a well-formed record defaulting to type purchase_order/status draft, and newPackage() produces a well-formed record", () => {
  const store = loadStoreWith(null);
  const c = store.newCommitment({ project_id: "proj_1", po_contract_number: "PO-100", committed_value: 5000 });
  assert.ok(c.id);
  assert.strictEqual(c.project_id, "proj_1");
  assert.strictEqual(c.po_contract_number, "PO-100");
  assert.strictEqual(c.committed_value, 5000);
  assert.strictEqual(c.type, "purchase_order");
  assert.strictEqual(c.status, "draft");
  assert.strictEqual(c.vendor_id, "");
  assert.strictEqual(c.package_id, "");
  assert.strictEqual(c.activity_id, "");
  assert.strictEqual(c.budget_item_id, "");
  assert.ok(!("actual_value" in c), "actual_value must NOT be a stored field — it's computed from linked cost_actuals");

  const p = store.newPackage({ name: "Electrical Package", code: "PKG-01" });
  assert.ok(p.id);
  assert.strictEqual(p.name, "Electrical Package");
  assert.strictEqual(p.code, "PKG-01");
});

check("COMMITMENT_TYPES and COMMITMENT_STATUSES are exported and non-empty", () => {
  const store = loadStoreWith(null);
  assert.ok(store.COMMITMENT_TYPES.indexOf("purchase_order") !== -1);
  assert.ok(store.COMMITMENT_TYPES.indexOf("subcontract") !== -1);
  assert.ok(store.COMMITMENT_STATUSES.indexOf("draft") !== -1);
  assert.ok(store.COMMITMENT_STATUSES.indexOf("approved") !== -1);
});

check("migrating a v42 dataset backfills calculation_mode='progress_override' onto existing schedules and is_out_of_sequence=false onto existing activities, leaving already-set values untouched", () => {
  const v42 = {
    schema_version: 42,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [], decisions: [],
    schedules: [
      { id: "sch_1", project_id: "proj_1", name: "No mode set" },
      { id: "sch_2", project_id: "proj_1", name: "Already retained_logic", calculation_mode: "retained_logic" },
    ],
    wbs_items: [],
    activities: [
      { id: "act_1", project_id: "proj_1", schedule_id: "sch_1", name: "No flag set" },
      { id: "act_2", project_id: "proj_1", schedule_id: "sch_1", name: "Already flagged", is_out_of_sequence: true },
    ],
    relationships: [], schedule_baselines: [], recovery_actions: [],
    cost_budget_items: [], cost_actuals: [],
    resources: [], resource_assignments: [], resource_unavailability: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [], weekly_reviews: [],
    packages: [], commitments: [],
  };
  const store = loadStoreWith(JSON.stringify(v42));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);

  const sch1 = data.schedules.find((s) => s.id === "sch_1");
  const sch2 = data.schedules.find((s) => s.id === "sch_2");
  assert.strictEqual(sch1.calculation_mode, "progress_override", "backfilled default preserves pre-Gate-21 behavior exactly");
  assert.strictEqual(sch2.calculation_mode, "retained_logic", "already-set schedule is left untouched");

  const act1 = data.activities.find((a) => a.id === "act_1");
  const act2 = data.activities.find((a) => a.id === "act_2");
  assert.strictEqual(act1.is_out_of_sequence, false);
  assert.strictEqual(act2.is_out_of_sequence, true, "already-set activity is left untouched");
});

check("newSchedule() defaults calculation_mode to 'progress_override', and CALCULATION_MODES is exported and non-empty", () => {
  const store = loadStoreWith(null);
  const s = store.newSchedule({ project_id: "proj_1", name: "New Schedule" });
  assert.strictEqual(s.calculation_mode, "progress_override");
  assert.ok(store.CALCULATION_MODES.indexOf("progress_override") !== -1);
  assert.ok(store.CALCULATION_MODES.indexOf("retained_logic") !== -1);
});

check("newActivity() defaults is_out_of_sequence to false", () => {
  const store = loadStoreWith(null);
  const a = store.newActivity({ project_id: "proj_1", schedule_id: "sch_1", name: "New Activity" });
  assert.strictEqual(a.is_out_of_sequence, false);
});

check("migrating a v43 dataset backfills is_official=false and baseline_project_finish=null onto existing schedule_baselines rows, leaving already-set values untouched", () => {
  const v43 = {
    schema_version: 43,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [], decisions: [],
    schedules: [{ id: "sch_1", project_id: "proj_1", name: "Rev 0", calculation_mode: "progress_override" }],
    wbs_items: [], activities: [],
    relationships: [],
    schedule_baselines: [
      { id: "bl_1", schedule_id: "sch_1", project_id: "proj_1", name: "No flags set" },
      { id: "bl_2", schedule_id: "sch_1", project_id: "proj_1", name: "Already official", is_official: true, baseline_project_finish: "2026-06-01" },
    ],
    recovery_actions: [],
    cost_budget_items: [], cost_actuals: [],
    resources: [], resource_assignments: [], resource_unavailability: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [], weekly_reviews: [],
    packages: [], commitments: [],
  };
  const store = loadStoreWith(JSON.stringify(v43));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);

  const bl1 = data.schedule_baselines.find((b) => b.id === "bl_1");
  const bl2 = data.schedule_baselines.find((b) => b.id === "bl_2");
  assert.strictEqual(bl1.is_official, false);
  assert.strictEqual(bl1.baseline_project_finish, null);
  assert.strictEqual(bl2.is_official, true, "already-set baseline is left untouched");
  assert.strictEqual(bl2.baseline_project_finish, "2026-06-01");
});

check("newScheduleBaseline() defaults is_official to false and baseline_project_finish to null; newSchedule() no longer sets is_baseline at all", () => {
  const store = loadStoreWith(null);
  const b = store.newScheduleBaseline({ schedule_id: "sch_1", project_id: "proj_1", name: "New Baseline" });
  assert.strictEqual(b.is_official, false);
  assert.strictEqual(b.baseline_project_finish, null);

  const s = store.newSchedule({ project_id: "proj_1", name: "New Schedule" });
  assert.ok(!("is_baseline" in s), "is_baseline was dead, disconnected UI decoration — retired in Gate 22, not carried forward");
});

check("migrating a v44 dataset backfills delay_records: [] — a brand new register, nothing to backfill on existing records", () => {
  const v44 = {
    schema_version: 44,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [], decisions: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [], recovery_actions: [],
    cost_budget_items: [], cost_actuals: [],
    resources: [], resource_assignments: [], resource_unavailability: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [], weekly_reviews: [],
    packages: [], commitments: [],
  };
  const store = loadStoreWith(JSON.stringify(v44));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);
  assert.ok(Array.isArray(data.delay_records));
  assert.strictEqual(data.delay_records.length, 0);
});

check("newDelayRecord() produces a well-formed record defaulting to cause 'other' and non-excusable, and DELAY_RECORD_CAUSES is exported and non-empty", () => {
  const store = loadStoreWith(null);
  const r = store.newDelayRecord({ activity_id: "act_1", project_id: "proj_1", description: "Late material delivery" });
  assert.ok(r.id);
  assert.strictEqual(r.activity_id, "act_1");
  assert.strictEqual(r.project_id, "proj_1");
  assert.strictEqual(r.description, "Late material delivery");
  assert.strictEqual(r.delay_cause, "other");
  assert.strictEqual(r.is_excusable, false);
  assert.strictEqual(r.delay_days, null);
  assert.strictEqual(r.identified_date, "");
  assert.strictEqual(r.responsible_party, "");

  assert.ok(store.DELAY_RECORD_CAUSES.indexOf("owner_caused") !== -1);
  assert.ok(store.DELAY_RECORD_CAUSES.indexOf("contractor_caused") !== -1);
  assert.ok(store.DELAY_RECORD_CAUSES.indexOf("weather_force_majeure") !== -1);
  assert.ok(store.DELAY_RECORD_CAUSES.indexOf("design_rfi_driven") !== -1);
  assert.ok(store.DELAY_RECORD_CAUSES.indexOf("other") !== -1);
});

check("migrating a v45 dataset backfills estimated_recovery_days=null and estimated_cost=null onto existing recovery_actions rows, leaving already-set values untouched", () => {
  const v45 = {
    schema_version: 45,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null },
    projects: [{ id: "proj_1", name: "Existing Project", archived: false, status: "on_track", progress: 0, attachments: [] }],
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [], decisions: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    recovery_actions: [
      { id: "rec_1", activity_id: "act_1", project_id: "proj_1", description: "No estimate set" },
      { id: "rec_2", activity_id: "act_1", project_id: "proj_1", description: "Already estimated", estimated_recovery_days: 5, estimated_cost: 2500 },
    ],
    delay_records: [],
    cost_budget_items: [], cost_actuals: [],
    resources: [], resource_assignments: [], resource_unavailability: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
    executive_summaries: [], weekly_reviews: [],
    packages: [], commitments: [],
  };
  const store = loadStoreWith(JSON.stringify(v45));
  const data = store.get();
  assert.strictEqual(data.schema_version, 46);

  const rec1 = data.recovery_actions.find((r) => r.id === "rec_1");
  const rec2 = data.recovery_actions.find((r) => r.id === "rec_2");
  assert.strictEqual(rec1.estimated_recovery_days, null);
  assert.strictEqual(rec1.estimated_cost, null);
  assert.strictEqual(rec2.estimated_recovery_days, 5, "already-set recovery action is left untouched");
  assert.strictEqual(rec2.estimated_cost, 2500);
});

check("newRecoveryAction() defaults estimated_recovery_days and estimated_cost to null", () => {
  const store = loadStoreWith(null);
  const r = store.newRecoveryAction({ activity_id: "act_1", project_id: "proj_1", description: "Test" });
  assert.strictEqual(r.estimated_recovery_days, null);
  assert.strictEqual(r.estimated_cost, null);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
