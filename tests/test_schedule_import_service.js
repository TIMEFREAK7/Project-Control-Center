// Standalone Node test for scheduleImportService.js. Pure parsing module, no DOM, so
// this runs directly under `node` without jsdom — same convention as
// test_cost_evm_engine.js. Focused on the Gate 8 additions (in-app Excel editor):
// CANONICAL_HEADERS is the single source of truth the editable grid and the review
// step both build on, and every label in it must round-trip back through HEADER_MAP
// to the key it claims to — plus the "wbs_summary" alias needed so a grid-generated
// Activity Type cell round-trips without a spurious "unrecognized type" warning.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

global.window = global.window || {};
const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "scheduleImportService.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);
const svc = window.PCC.scheduleImportService;

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

check("CANONICAL_HEADERS is exported and covers every field the grid editor needs", () => {
  assert.ok(Array.isArray(svc.CANONICAL_HEADERS));
  const keys = svc.CANONICAL_HEADERS.map((f) => f.key);
  [
    "external_id", "name", "activity_type", "wbs_code", "wbs_name", "duration",
    "planned_start", "planned_finish", "predecessors", "percent_complete",
    "discipline", "contractor", "responsible_person", "status", "notes",
  ].forEach((k) => assert.ok(keys.indexOf(k) !== -1, "missing key: " + k));
});

check("every CANONICAL_HEADERS label round-trips through parseRows to its own key", () => {
  const headers = svc.CANONICAL_HEADERS.map((f) => f.label);
  const row = svc.CANONICAL_HEADERS.map((f) => {
    if (f.key === "external_id") return "A010";
    if (f.key === "name") return "Test Activity";
    return "";
  });
  const parsed = svc.parseRows(headers, [row]);
  assert.strictEqual(parsed.summary.unrecognized_headers.length, 0, "every canonical label should be a recognized header");
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.activities.length, 1);
});

check("activity_type 'wbs_summary' (underscore form, as stored internally) round-trips without a warning", () => {
  const headers = svc.CANONICAL_HEADERS.map((f) => f.label);
  const row = svc.CANONICAL_HEADERS.map((f) => {
    if (f.key === "external_id") return "A010";
    if (f.key === "name") return "Sitework";
    if (f.key === "activity_type") return "wbs_summary";
    return "";
  });
  const parsed = svc.parseRows(headers, [row]);
  assert.strictEqual(parsed.activities.length, 1);
  assert.strictEqual(parsed.activities[0].activity_type, "wbs_summary");
  const typeWarnings = parsed.warnings.filter((w) => /unrecognized activity type/i.test(w.message));
  assert.strictEqual(typeWarnings.length, 0, "should not warn on the app's own stored wbs_summary value");
});

check("status round-trips as a raw key with no aliasing (matches how the grid's <select> stores it)", () => {
  const headers = svc.CANONICAL_HEADERS.map((f) => f.label);
  const row = svc.CANONICAL_HEADERS.map((f) => {
    if (f.key === "external_id") return "A010";
    if (f.key === "name") return "Test";
    if (f.key === "status") return "in_progress";
    return "";
  });
  const parsed = svc.parseRows(headers, [row]);
  assert.strictEqual(parsed.activities[0].status, "in_progress");
});

// ---------------------------------------------------------------------------
// Manual Column Mapping — schedule.js's mapping step lets a user tell parseRows()
// exactly which uploaded column is which PCC field when the header text itself
// doesn't match HEADER_MAP's known aliases.
// ---------------------------------------------------------------------------

check("autoDetectColumnMapping() maps recognized headers by index and omits unrecognized ones", () => {
  const headers = ["Task Name", "Kickoff", "Weird Custom Column"];
  const mapping = svc.autoDetectColumnMapping(headers);
  assert.strictEqual(mapping[0], "name", "'Task Name' is a known HEADER_MAP alias");
  assert.strictEqual(mapping[2], undefined, "no HEADER_MAP alias for a made-up column name");
  assert.strictEqual(mapping[1], undefined, "'Kickoff' isn't a recognized alias either");
});

check("parseRows() with an explicit columnMapping maps an otherwise-unrecognized header to the field the user chose", () => {
  const headers = ["Item Ref", "Item Title", "Kickoff"];
  const row = ["A010", "Excavation", "2026-03-01"];
  // Auto-detect would recognize none of these — prove the manual mapping is what's
  // actually driving the result, not a lucky HEADER_MAP alias match.
  const auto = svc.autoDetectColumnMapping(headers);
  assert.deepStrictEqual(auto, {}, "none of these three headers should auto-match");

  const mapping = { 0: "external_id", 1: "name", 2: "planned_start" };
  const parsed = svc.parseRows(headers, [row], mapping);
  assert.strictEqual(parsed.errors.length, 0);
  assert.strictEqual(parsed.activities.length, 1);
  assert.strictEqual(parsed.activities[0].external_id, "A010");
  assert.strictEqual(parsed.activities[0].name, "Excavation");
  assert.strictEqual(parsed.activities[0].planned_start, "2026-03-01");
});

check("parseRows() with an explicit columnMapping suppresses the 'unrecognized header' warning — the user already made an informed choice", () => {
  const headers = ["Item Ref", "Item Title", "Some Other Column"];
  const row = ["A010", "Excavation", "ignored value"];
  const mapping = { 0: "external_id", 1: "name" }; // column 2 deliberately left unmapped ("Ignore")
  const parsed = svc.parseRows(headers, [row], mapping);
  assert.strictEqual(parsed.summary.unrecognized_headers.length, 0);
  const headerWarnings = parsed.warnings.filter((w) => /not recognized and ignored/i.test(w.message));
  assert.strictEqual(headerWarnings.length, 0, "a column left unmapped by explicit user choice isn't the same as an accidental miss");
});

check("parseRows() without a columnMapping argument still behaves exactly as before (backward compatible)", () => {
  const headers = ["Activity ID", "Activity Name", "Unrecognized Column"];
  const row = ["A010", "Excavation", "x"];
  const parsed = svc.parseRows(headers, [row]);
  assert.strictEqual(parsed.activities.length, 1);
  assert.strictEqual(parsed.summary.unrecognized_headers.length, 1);
  assert.strictEqual(parsed.summary.unrecognized_headers[0], "Unrecognized Column");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
