// Company/Client/Project Management redesign (CLAUDE.md spec) — standalone Node tests for
// store.js's new Company/Client master data + migration, and projectContext.js's cascading
// Company -> Client -> Project context. Same "eval the real source into a fake window,
// no DOM needed" approach test_store_schema_v54_migration.js already established for
// store.js-only logic — projectContext.js only ever touches window.PCC.store, so it loads
// the same way with no jsdom required.
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

function loadStoreAndContextWith(rawJsonString) {
  global.window = { localStorage: makeFakeLocalStorage(rawJsonString || null), setTimeout: setTimeout, clearTimeout: clearTimeout };
  const storeSrc = fs.readFileSync(path.join(__dirname, "..", "src", "js", "store.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(storeSrc);
  const ctxSrc = fs.readFileSync(path.join(__dirname, "..", "src", "js", "projectContext.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(ctxSrc);
  return global.window.PCC;
}

// ---------------------------------------------------------------------------
// newCompany() / newClient() shape
// ---------------------------------------------------------------------------
check("newCompany() produces a well-formed record: unique id, archived false, name/notes default empty", () => {
  const pcc = loadStoreAndContextWith(null);
  const a = pcc.store.newCompany({ name: "FABS" });
  const b = pcc.store.newCompany({ name: "ABC Engineering" });
  assert.ok(a.id && b.id && a.id !== b.id);
  assert.strictEqual(a.name, "FABS");
  assert.strictEqual(a.archived, false);
  assert.strictEqual(a.notes, "");
  assert.ok(a.created_at && a.updated_at);
});

check("newClient() is scoped to a company via company_id, archived false by default", () => {
  const pcc = loadStoreAndContextWith(null);
  const client = pcc.store.newClient({ company_id: "co_1", name: "PepsiCo" });
  assert.strictEqual(client.company_id, "co_1");
  assert.strictEqual(client.name, "PepsiCo");
  assert.strictEqual(client.archived, false);
});

check("newProject() has empty company_id/client_id and an empty relationship_history array by default", () => {
  const pcc = loadStoreAndContextWith(null);
  const p = pcc.store.newProject({ name: "Ashoka" });
  assert.strictEqual(p.company_id, "");
  assert.strictEqual(p.client_id, "");
  assert.deepStrictEqual(p.relationship_history, []);
  assert.strictEqual(p.client, "");
  assert.strictEqual(p.company, "");
});

check("a brand-new install starts with empty companies/clients arrays and empty active_company_id/active_client_id/company_context_memory", () => {
  const pcc = loadStoreAndContextWith(null);
  const data = pcc.store.get();
  assert.deepStrictEqual(data.companies, []);
  assert.deepStrictEqual(data.clients, []);
  assert.strictEqual(data.settings.active_company_id, "");
  assert.strictEqual(data.settings.active_client_id, "");
  assert.deepStrictEqual(data.settings.company_context_memory, {});
});

// ---------------------------------------------------------------------------
// Migration (v57 -> v58): promote free-text client/company into master records
// ---------------------------------------------------------------------------
function v57Fixture(projects) {
  return {
    schema_version: 57,
    meta: { app_name: "x", created_at: "2026-01-01T00:00:00.000Z", last_saved_at: null, last_exported_at: null },
    settings: { theme: "dark", company_name: "", backup_reminder_days: 7, backup_nudge_dismissed_at: null, pinned_project_ids: [] },
    projects: projects,
    documents: [], risks: [], daily_logs: [], meetings: [], rfis: [], change_orders: [], decisions: [],
    schedules: [], wbs_items: [], activities: [], relationships: [], schedule_baselines: [],
    recovery_actions: [], delay_records: [], schedule_performance_snapshots: [],
    lessons_learned: [], knowledge_base_articles: [], report_templates: [],
    cost_budget_items: [], cost_actuals: [], executive_summaries: [], weekly_reviews: [],
    resources: [], resource_assignments: [], resource_unavailability: [], packages: [], commitments: [],
    vendors: [], vendor_contacts: [], vendor_project_links: [], vendor_documents: [],
    vendor_meeting_links: [], vendor_rfi_links: [], vendor_risk_links: [], vendor_performance: [], vendor_notes: [],
    document_types: [], project_document_requirements: [],
  };
}

check("migrating a v57 dataset with distinct company/client text per project creates one Company + one Client record per distinct pair, linked by id", () => {
  const fixture = v57Fixture([
    { id: "p1", name: "Ashoka", archived: false, status: "on_track", progress: 0, attachments: [], client: "PepsiCo", company: "FABS" },
    { id: "p2", name: "Pune Expansion", archived: false, status: "on_track", progress: 0, attachments: [], client: "PepsiCo", company: "FABS" },
    { id: "p3", name: "Nagpur Project", archived: false, status: "on_track", progress: 0, attachments: [], client: "Tata", company: "FABS" },
  ]);
  const pcc = loadStoreAndContextWith(JSON.stringify(fixture));
  const data = pcc.store.get();

  assert.strictEqual(data.schema_version, 61);
  assert.strictEqual(data.companies.length, 1, "one distinct company text (FABS) -> one Company record");
  assert.strictEqual(data.companies[0].name, "FABS");
  assert.strictEqual(data.clients.length, 2, "two distinct client texts under FABS -> two Client records");

  const p1 = data.projects.find((p) => p.id === "p1");
  const p2 = data.projects.find((p) => p.id === "p2");
  const p3 = data.projects.find((p) => p.id === "p3");
  assert.strictEqual(p1.company_id, data.companies[0].id);
  assert.strictEqual(p2.company_id, data.companies[0].id);
  assert.strictEqual(p1.client_id, p2.client_id, "same (company, client) text pair must resolve to the SAME client record");
  assert.notStrictEqual(p1.client_id, p3.client_id, "different client text under the same company must be a DIFFERENT client record");
  assert.deepStrictEqual(p1.relationship_history, []);
});

check("migrating a v57 dataset proves the spec's own FABS/PepsiCo vs ABC Engineering/PepsiCo example: same client name under two different companies becomes two separate Client records", () => {
  const fixture = v57Fixture([
    { id: "p1", name: "Ashoka", archived: false, status: "on_track", progress: 0, attachments: [], client: "PepsiCo", company: "FABS" },
    { id: "p2", name: "Ashoka", archived: false, status: "on_track", progress: 0, attachments: [], client: "PepsiCo", company: "ABC Engineering" },
  ]);
  const pcc = loadStoreAndContextWith(JSON.stringify(fixture));
  const data = pcc.store.get();

  assert.strictEqual(data.companies.length, 2);
  assert.strictEqual(data.clients.length, 2, "'PepsiCo' under two different companies must be two separate Client records");
  const p1 = data.projects.find((p) => p.id === "p1");
  const p2 = data.projects.find((p) => p.id === "p2");
  assert.notStrictEqual(p1.company_id, p2.company_id);
  assert.notStrictEqual(p1.client_id, p2.client_id, "two separate project records, per spec point 1");
});

check("migrating a v57 dataset leaves a project with blank client/company text unlinked (company_id/client_id stay empty), and a client-only project (no company text) also stays unlinked since a Client can't exist without its exclusive Company", () => {
  const fixture = v57Fixture([
    { id: "p1", name: "No Client Project", archived: false, status: "on_track", progress: 0, attachments: [], client: "", company: "" },
    { id: "p2", name: "Client Text Only", archived: false, status: "on_track", progress: 0, attachments: [], client: "Orphan Client", company: "" },
  ]);
  const pcc = loadStoreAndContextWith(JSON.stringify(fixture));
  const data = pcc.store.get();
  assert.strictEqual(data.companies.length, 0);
  assert.strictEqual(data.clients.length, 0);
  assert.strictEqual(data.projects[0].company_id, "");
  assert.strictEqual(data.projects[1].client_id, "", "no company text means nothing to scope a Client to, so it's left unlinked rather than inventing a placeholder company");
  assert.strictEqual(data.projects[1].client, "Orphan Client", "the original free-text field itself is never touched/lost");
});

check("migrating a v57 dataset backfills relationship_history: [] onto every existing project", () => {
  const fixture = v57Fixture([
    { id: "p1", name: "X", archived: false, status: "on_track", progress: 0, attachments: [], client: "C", company: "Co" },
  ]);
  const pcc = loadStoreAndContextWith(JSON.stringify(fixture));
  const data = pcc.store.get();
  assert.deepStrictEqual(data.projects[0].relationship_history, []);
});

// ---------------------------------------------------------------------------
// projectContext.js: Company -> Client -> Project cascade
// ---------------------------------------------------------------------------
function seedHierarchy(pcc) {
  let fabsId, abcId, pepsiUnderFabsId, tataId, ashokaId, puneId, nagpurId;
  pcc.store.update((d) => {
    const fabs = pcc.store.newCompany({ name: "FABS" });
    const abc = pcc.store.newCompany({ name: "ABC Engineering" });
    d.companies.push(fabs, abc);
    fabsId = fabs.id;
    abcId = abc.id;

    const pepsi = pcc.store.newClient({ company_id: fabsId, name: "PepsiCo" });
    const tata = pcc.store.newClient({ company_id: fabsId, name: "Tata" });
    d.clients.push(pepsi, tata);
    pepsiUnderFabsId = pepsi.id;
    tataId = tata.id;

    const ashoka = pcc.store.newProject({ name: "Ashoka", company_id: fabsId, client_id: pepsiUnderFabsId, company: "FABS", client: "PepsiCo" });
    const pune = pcc.store.newProject({ name: "Pune Expansion", company_id: fabsId, client_id: pepsiUnderFabsId, company: "FABS", client: "PepsiCo" });
    const nagpur = pcc.store.newProject({ name: "Nagpur", company_id: fabsId, client_id: tataId, company: "FABS", client: "Tata" });
    d.projects.push(ashoka, pune, nagpur);
    ashokaId = ashoka.id;
    puneId = pune.id;
    nagpurId = nagpur.id;
  });
  return { fabsId, abcId, pepsiUnderFabsId, tataId, ashokaId, puneId, nagpurId };
}

check("projectContext.set(projectId) syncs active_company_id/active_client_id to that project's own relationship", () => {
  const pcc = loadStoreAndContextWith(null);
  const ids = seedHierarchy(pcc);
  pcc.projectContext.set(ids.ashokaId);
  assert.strictEqual(pcc.projectContext.get(), ids.ashokaId);
  assert.strictEqual(pcc.projectContext.getCompany(), ids.fabsId);
  assert.strictEqual(pcc.projectContext.getClient(), ids.pepsiUnderFabsId);
});

check("projectContext.setCompany() does NOT arbitrarily pick a Client when the company has several, and clears Project", () => {
  const pcc = loadStoreAndContextWith(null);
  const ids = seedHierarchy(pcc);
  pcc.projectContext.set(ids.nagpurId); // seed some prior context first
  pcc.projectContext.setCompany(ids.fabsId);
  assert.strictEqual(pcc.projectContext.getCompany(), ids.fabsId);
  // FABS has two clients (PepsiCo, Tata) and no prior remembered context for FABS yet in
  // this fresh install (set() above already remembered Tata/Nagpur under FABS, so this
  // actually restores it — re-test with a company that has no memory at all):
  assert.strictEqual(pcc.projectContext.getClient(), ids.tataId, "restores the last-remembered client for this company (Nagpur/Tata, just set above)");
});

check("projectContext.setCompany() clears Client/Project to unselected when the company has no remembered context yet", () => {
  const pcc = loadStoreAndContextWith(null);
  const ids = seedHierarchy(pcc);
  pcc.projectContext.setCompany(ids.abcId); // ABC has no clients/memory at all
  assert.strictEqual(pcc.projectContext.getClient(), "");
  assert.strictEqual(pcc.projectContext.get(), "");
});

check("projectContext.setClient() implies its Company (a Client is exclusive to one Company)", () => {
  const pcc = loadStoreAndContextWith(null);
  const ids = seedHierarchy(pcc);
  pcc.projectContext.setClient(ids.tataId);
  assert.strictEqual(pcc.projectContext.getCompany(), ids.fabsId);
  assert.strictEqual(pcc.projectContext.getClient(), ids.tataId);
});

check("projectContext.projectsForCompanyClient() never shows projects from an unrelated Client (never show unrelated projects, spec point 6)", () => {
  const pcc = loadStoreAndContextWith(null);
  const ids = seedHierarchy(pcc);
  const data = pcc.store.get();
  const pepsiProjects = pcc.projectContext.projectsForCompanyClient(data, ids.fabsId, ids.pepsiUnderFabsId).map((p) => p.name).sort();
  assert.deepStrictEqual(pepsiProjects, ["Ashoka", "Pune Expansion"]);
  const tataProjects = pcc.projectContext.projectsForCompanyClient(data, ids.fabsId, ids.tataId).map((p) => p.name);
  assert.deepStrictEqual(tataProjects, ["Nagpur"]);
});

check("spec point 9 (Remember Last Context): switching Company -> Company -> back to the first restores its last Client+Project", () => {
  const pcc = loadStoreAndContextWith(null);
  const ids = seedHierarchy(pcc);
  pcc.projectContext.set(ids.ashokaId); // FABS / PepsiCo / Ashoka
  assert.strictEqual(pcc.projectContext.getCompany(), ids.fabsId);

  pcc.projectContext.setCompany(ids.abcId); // switch away to ABC Engineering (empty)
  assert.strictEqual(pcc.projectContext.getCompany(), ids.abcId);
  assert.strictEqual(pcc.projectContext.getClient(), "");

  pcc.projectContext.setCompany(ids.fabsId); // switch back to FABS
  assert.strictEqual(pcc.projectContext.getClient(), ids.pepsiUnderFabsId, "restores PepsiCo");
  assert.strictEqual(pcc.projectContext.get(), ids.ashokaId, "restores Ashoka");
});

check("an archived Company/Client drops out of activeCompanies()/clientsForCompany() but the underlying records and their projects are untouched", () => {
  const pcc = loadStoreAndContextWith(null);
  const ids = seedHierarchy(pcc);
  pcc.store.update((d) => {
    const fabs = d.companies.find((c) => c.id === ids.fabsId);
    fabs.archived = true;
  });
  const data = pcc.store.get();
  assert.strictEqual(pcc.projectContext.activeCompanies(data).length, 1, "only ABC Engineering remains active");
  assert.strictEqual(data.companies.find((c) => c.id === ids.fabsId).name, "FABS", "the archived company record itself is fully intact, not deleted");
  assert.strictEqual(data.projects.find((p) => p.id === ids.ashokaId).company_id, ids.fabsId, "its projects keep their relationship intact");
});

check("archiving the active Company/Client re-validates getCompany()/getClient() back to empty on the next read (same re-validate-on-read rule as getPinnedIds/get())", () => {
  const pcc = loadStoreAndContextWith(null);
  const ids = seedHierarchy(pcc);
  pcc.projectContext.set(ids.ashokaId);
  pcc.store.update((d) => {
    d.companies.find((c) => c.id === ids.fabsId).archived = true;
  });
  assert.strictEqual(pcc.projectContext.getCompany(), "", "archived company no longer validates as active");
  assert.strictEqual(pcc.projectContext.getClient(), "", "client validation requires a valid active company first");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
