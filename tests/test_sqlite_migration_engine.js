// PCC Architecture Upgrade Phase 5 (SQLite) — standalone Node test for
// sqliteMigrationEngine.js. Pure calculation/data module, no DOM — runs directly under
// `node` using the real sql.js npm package (the same WASM binary the app itself
// vendors, just loaded via Node instead of the browser-specific base64 embedding).
//
// This engine is NOT wired into the live app yet (see the engine's own header) — these
// tests exist to answer the master upgrade prompt's Phase 5 question ("can PCC's data
// move into SQLite without losing anything?") against realistic data built from
// store.js's own factories, not a hand-rolled approximation of its shape.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const initSqlJs = require("sql.js");

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.stack || e.message);
  }
}
async function checkAsync(label, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.stack || e.message);
  }
}

function makeFakeLocalStorage() {
  const store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
}

/** Loads store.js fresh (no pre-existing data) so its own newXxx() factories are
 * available for building a realistic dataset — same approach
 * test_store_schema_v54_migration.js uses, minus the migration-fixture part. */
function loadStore() {
  global.window = { localStorage: makeFakeLocalStorage(), setTimeout: setTimeout, clearTimeout: clearTimeout };
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "store.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(src);
  return global.window.PCC.store;
}

function loadEngine() {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "sqliteMigrationEngine.js"), "utf8");
  // eslint-disable-next-line no-eval
  eval(src);
  return global.window.PCC.sqliteMigrationEngine;
}

const store = loadStore();
const engine = loadEngine();

let SQL;

(async () => {
  SQL = await initSqlJs();

  // -------------------------------------------------------------------------
  // A fresh install (store.get() with nothing ever saved) — every collection empty,
  // schema_version/meta/settings populated. The simplest possible real shape.
  // -------------------------------------------------------------------------
  check("a fresh install (every collection empty) round-trips losslessly", () => {
    const data = store.get();
    const db = engine.buildDatabase(SQL, data);
    const roundTripped = engine.exportToJson(db);
    const report = engine.reconcile(data, roundTripped);
    assert.deepStrictEqual(report.issues, []);
    assert.strictEqual(report.ok, true);
    assert.strictEqual(roundTripped.schema_version, data.schema_version);
  });

  // -------------------------------------------------------------------------
  // A realistic populated dataset, built from store.js's own factories — not a
  // hand-rolled approximation. Covers: multiple projects, a schedule with WBS/
  // activities/relationships, risks, vendors, cost items, and nested/edge-case field
  // values (special characters, unicode, an empty codes object, null dates).
  // -------------------------------------------------------------------------
  function buildRealisticData() {
    // A fresh store instance each call — store.get() returns the SAME mutable
    // singleton every time for one loaded instance, and this helper is called from
    // multiple checks below; reusing store.get() directly would silently accumulate
    // duplicate projects/activities across calls instead of each test getting its own
    // isolated dataset. loadEngine()'s already-extracted `engine` functions are pure
    // (take SQL/data as parameters, don't reference window.PCC internally) so
    // reassigning global.window here doesn't affect them.
    const freshStore = loadStore();
    const data = freshStore.get();
    const proj1 = freshStore.newProject({ id: "proj_1", name: "Tower A", status: "on_track" });
    const proj2 = freshStore.newProject({ id: "proj_2", name: 'Tower "B" & Co.', status: "at_risk" });
    data.projects.push(proj1, proj2);

    const cal = freshStore.newCalendar({ project_id: proj1.id, is_default: true });
    data.calendars.push(cal);

    const sched = freshStore.newSchedule({ project_id: proj1.id, name: "Baseline Programme", status: "active" });
    data.schedules.push(sched);

    const wbs1 = freshStore.newWbsItem({ project_id: proj1.id, schedule_id: sched.id, code: "1", name: "Sitework" });
    data.wbs_items.push(wbs1);

    const act1 = freshStore.newActivity({
      project_id: proj1.id, schedule_id: sched.id, wbs_id: wbs1.id, calendar_id: cal.id,
      name: "Clear Site", duration: 5, planned_start: "2026-01-05", planned_finish: "2026-01-09",
      codes: { P6_AREA: "ZONE-A" },
    });
    const act2 = freshStore.newActivity({
      project_id: proj1.id, schedule_id: sched.id, wbs_id: wbs1.id, calendar_id: cal.id,
      name: "Excavate\t(tabbed)\nnewline", duration: 10, notes: "unicode: café, 日本語, emoji 🏗️",
    });
    const act3 = freshStore.newActivity({
      project_id: proj1.id, schedule_id: sched.id, name: "Unassigned", duration: null, planned_start: "",
    });
    data.activities.push(act1, act2, act3);

    data.relationships.push(freshStore.newRelationship({ schedule_id: sched.id, predecessor_id: act1.id, successor_id: act2.id, type: "FS", lag: 0 }));

    data.risks.push(freshStore.newRisk({ project_id: proj1.id, type: "risk", title: "Weather delay" }));

    // No current store.js collection happens to hold plain primitives rather than
    // records, but the engine must handle one if a future collection ever does —
    // added synthetically here to exercise that path rather than assume it never
    // occurs. Real per-project data (not a fabricated project) placed in a made-up field.
    data.synthetic_primitive_array_for_test = [proj1.id, proj2.id];

    data.settings.company_name = "Acme Construction & Sons";
    return data;
  }

  check("a realistic populated dataset (multiple projects, schedule/WBS/activities/relationships, special characters, unicode, nulls) round-trips losslessly", () => {
    const data = buildRealisticData();
    const db = engine.buildDatabase(SQL, data);
    const roundTripped = engine.exportToJson(db);
    const report = engine.reconcile(data, roundTripped);
    assert.deepStrictEqual(report.issues, [], "unexpected issues: " + JSON.stringify(report.issues, null, 2));

    const rtActivities = roundTripped.activities;
    assert.strictEqual(rtActivities.length, 3);
    assert.ok(rtActivities.some((a) => a.name === "Excavate\t(tabbed)\nnewline"));
    assert.ok(rtActivities.some((a) => a.notes && a.notes.indexOf("日本語") !== -1));
    assert.ok(rtActivities.some((a) => a.duration === null));
    assert.deepStrictEqual(roundTripped.synthetic_primitive_array_for_test, ["proj_1", "proj_2"]);
    assert.strictEqual(roundTripped.settings.company_name, "Acme Construction & Sons");
  });

  check("indexed columns are created only for fields actually present in a collection (detected from data, not hand-listed)", () => {
    const data = buildRealisticData();
    const db = engine.buildDatabase(SQL, data);

    const activityCols = db.exec('PRAGMA table_info("activities")')[0].values.map((r) => r[1]);
    assert.ok(activityCols.includes("id"));
    assert.ok(activityCols.includes("project_id"));
    assert.ok(activityCols.includes("schedule_id"));
    assert.ok(activityCols.includes("data"));

    // synthetic_primitive_array_for_test holds plain strings, not objects — none of id/project_id/
    // schedule_id apply, so only the `data` column should exist for it.
    const pinnedCols = db.exec('PRAGMA table_info("synthetic_primitive_array_for_test")')[0].values.map((r) => r[1]);
    assert.deepStrictEqual(pinnedCols, ["data"]);

    // An index should exist for each detected FK column on activities.
    const indexNames = db.exec("SELECT name FROM sqlite_master WHERE type='index'")[0].values.map((r) => r[0]);
    assert.ok(indexNames.includes("idx_activities_project_id"));
    assert.ok(indexNames.includes("idx_activities_schedule_id"));
  });

  check("relational queries actually work: filtering activities by project_id via SQL, not just JSON round-trip", () => {
    const data = buildRealisticData();
    const db = engine.buildDatabase(SQL, data);
    const rows = db.exec('SELECT data FROM "activities" WHERE project_id = ?', ["proj_1"]);
    assert.strictEqual(rows[0].values.length, 3, "all 3 activities belong to proj_1");
    const noRows = db.exec('SELECT data FROM "activities" WHERE project_id = ?', ["proj_nonexistent"]);
    assert.strictEqual(noRows.length, 0, "sql.js omits the result set entirely when zero rows match");
  });

  // -------------------------------------------------------------------------
  // reconcile() must actually detect real corruption, not just report "ok" on a
  // matching pair — otherwise a passing round-trip test proves nothing.
  // -------------------------------------------------------------------------
  check("reconcile() detects a missing record", () => {
    const original = { projects: [{ id: "p1", name: "A" }, { id: "p2", name: "B" }] };
    const corrupted = { projects: [{ id: "p1", name: "A" }] };
    const report = engine.reconcile(original, corrupted);
    assert.strictEqual(report.ok, false);
    assert.ok(report.issues.some((i) => i.type === "missing_record" && i.detail.indexOf("p2") !== -1));
  });

  check("reconcile() detects an extra/fabricated record", () => {
    const original = { projects: [{ id: "p1", name: "A" }] };
    const corrupted = { projects: [{ id: "p1", name: "A" }, { id: "p2", name: "Fabricated" }] };
    const report = engine.reconcile(original, corrupted);
    assert.strictEqual(report.ok, false);
    assert.ok(report.issues.some((i) => i.type === "extra_record"));
  });

  check("reconcile() detects a field-level mismatch on an otherwise-matching record", () => {
    const original = { projects: [{ id: "p1", name: "Correct Name" }] };
    const corrupted = { projects: [{ id: "p1", name: "Wrong Name" }] };
    const report = engine.reconcile(original, corrupted);
    assert.strictEqual(report.ok, false);
    assert.ok(report.issues.some((i) => i.type === "field_mismatch"));
  });

  check("reconcile() detects a missing collection entirely", () => {
    const original = { projects: [], risks: [{ id: "r1" }] };
    const corrupted = { projects: [] };
    const report = engine.reconcile(original, corrupted);
    assert.strictEqual(report.ok, false);
    assert.ok(report.issues.some((i) => i.collection === "risks" && i.type === "missing_collection"));
  });

  check("reconcile() reports ok:true and zero issues for a genuinely identical pair", () => {
    const data = { projects: [{ id: "p1", name: "A" }], settings: { theme: "dark" } };
    const report = engine.reconcile(data, JSON.parse(JSON.stringify(data)));
    assert.strictEqual(report.ok, true);
    assert.deepStrictEqual(report.issues, []);
  });

  // -------------------------------------------------------------------------
  // Defensive/edge cases
  // -------------------------------------------------------------------------
  check("a record missing an id entirely does not crash the build, and round-trips by position", () => {
    const data = { widgets: [{ name: "no id here" }] };
    const db = engine.buildDatabase(SQL, data);
    const roundTripped = engine.exportToJson(db);
    assert.strictEqual(roundTripped.widgets.length, 1);
    assert.strictEqual(roundTripped.widgets[0].name, "no id here");
  });

  check("undefined top-level value is preserved as null through the _meta table, not dropped", () => {
    const data = { some_flag: undefined };
    const db = engine.buildDatabase(SQL, data);
    const roundTripped = engine.exportToJson(db);
    assert.strictEqual(roundTripped.some_flag, null);
  });

  await checkAsync("a 5,000-activity dataset builds and round-trips losslessly within a reasonable time (performance smoke check)", async () => {
    const data = { activities: [] };
    for (let i = 0; i < 5000; i++) {
      data.activities.push(store.newActivity({ project_id: "proj_1", schedule_id: "sch_1", name: "Activity " + i, duration: (i % 20) + 1 }));
    }
    const start = Date.now();
    const db = engine.buildDatabase(SQL, data);
    const buildMs = Date.now() - start;
    const exportStart = Date.now();
    const roundTripped = engine.exportToJson(db);
    const exportMs = Date.now() - exportStart;

    const report = engine.reconcile(data, roundTripped);
    assert.deepStrictEqual(report.issues, []);
    console.log(`     (5,000 activities: build ${buildMs}ms, export ${exportMs}ms)`);
    assert.ok(buildMs < 10000, "build took unexpectedly long: " + buildMs + "ms");
    assert.ok(exportMs < 10000, "export took unexpectedly long: " + exportMs + "ms");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
