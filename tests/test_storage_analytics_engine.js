// PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Storage Analytics &
// Orphan Detection. Pure calculation module, no DOM, runs directly under `node`.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

global.window = global.window || {};
const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "storageAnalyticsEngine.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);
const engine = window.PCC.storageAnalyticsEngine;

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

function baseData(overrides) {
  return Object.assign(
    {
      documents: [],
      daily_logs: [],
      vendor_documents: [],
      knowledge_base_articles: [],
      schedules: [],
      settings: {},
    },
    overrides
  );
}

// ---------------------------------------------------------------------------
// collectFileRecords: gathers every blob-bearing collection
// ---------------------------------------------------------------------------
check("collectFileRecords gathers documents, daily log photos, vendor documents, knowledge base attachments, and schedule imports", () => {
  const data = baseData({
    documents: [{ id: "d1", filename: "a.pdf", file_size: 100, project_id: "p1", is_duplicate: false, trashed_at: null }],
    daily_logs: [{ project_id: "p1", photos: [{ id: "ph1", filename: "site.jpg", file_size: 200 }] }],
    vendor_documents: [{ id: "vd1", filename: "insurance.pdf", file_size: 300, project_id: "p1", is_duplicate: false }],
    knowledge_base_articles: [{ id: "kb1", filename: "manual.pdf", file_size: 400 }, { id: "kb2", filename: "" }],
    schedules: [{ id: "s1", source_file_name: "schedule.xlsx", source_file_size: 500, project_id: "p1" }, { id: "s2", source_file_name: null }],
  });
  const records = engine.collectFileRecords(data);
  assert.strictEqual(records.length, 5, "expected 5 records (kb2 and s2 excluded, no file)");
  assert.ok(records.some((r) => r.id === "d1" && r.source === "document"));
  assert.ok(records.some((r) => r.id === "ph1" && r.source === "daily_log_photo"));
  assert.ok(records.some((r) => r.id === "vd1" && r.source === "vendor_document"));
  assert.ok(records.some((r) => r.id === "kb1" && r.source === "knowledge_base_article"));
  assert.ok(records.some((r) => r.id === "s1" && r.source === "schedule_import"));
});

check("collectFileRecords includes the company logo when set, excludes it when not", () => {
  const withLogo = engine.collectFileRecords(baseData({ settings: { company_logo_filename: "logo.png" } }));
  assert.ok(withLogo.some((r) => r.id === "company_logo"));
  const withoutLogo = engine.collectFileRecords(baseData({ settings: {} }));
  assert.ok(!withoutLogo.some((r) => r.id === "company_logo"));
});

check("collectFileRecords marks trashed documents and duplicates correctly", () => {
  const data = baseData({
    documents: [
      { id: "d1", filename: "a.pdf", file_size: 100, project_id: "p1", is_duplicate: true, trashed_at: null },
      { id: "d2", filename: "b.pdf", file_size: 50, project_id: "p1", is_duplicate: false, trashed_at: "2026-01-01T00:00:00.000Z" },
    ],
  });
  const records = engine.collectFileRecords(data);
  assert.strictEqual(records.find((r) => r.id === "d1").isDuplicate, true);
  assert.strictEqual(records.find((r) => r.id === "d2").trashed, true);
});

// ---------------------------------------------------------------------------
// summarizeStorage
// ---------------------------------------------------------------------------
check("summarizeStorage totals active storage, excludes trashed from the active total, and reports trash separately", () => {
  const records = [
    { id: "1", source: "document", sourceLabel: "Documents", filename: "a", fileSize: 1000, projectId: "p1", isDuplicate: false, trashed: false },
    { id: "2", source: "document", sourceLabel: "Documents", filename: "b", fileSize: 2000, projectId: "p1", isDuplicate: false, trashed: true },
  ];
  const summary = engine.summarizeStorage(records);
  assert.strictEqual(summary.totalBytes, 1000, "trashed record must not count toward the active total");
  assert.strictEqual(summary.totalCount, 1);
  assert.strictEqual(summary.trashedBytes, 2000);
  assert.strictEqual(summary.trashedCount, 1);
});

check("summarizeStorage totals duplicate storage from active (non-trashed) records only", () => {
  const records = [
    { id: "1", source: "document", sourceLabel: "Documents", filename: "a", fileSize: 100, projectId: "p1", isDuplicate: true, trashed: false },
    { id: "2", source: "document", sourceLabel: "Documents", filename: "b", fileSize: 200, projectId: "p1", isDuplicate: true, trashed: true },
  ];
  const summary = engine.summarizeStorage(records);
  assert.strictEqual(summary.duplicateBytes, 100, "a trashed duplicate must not count toward the active duplicate total");
  assert.strictEqual(summary.duplicateCount, 1);
});

check("summarizeStorage breaks storage down correctly by type and by project", () => {
  const records = [
    { id: "1", source: "document", sourceLabel: "Documents", filename: "a", fileSize: 100, projectId: "p1", isDuplicate: false, trashed: false },
    { id: "2", source: "document", sourceLabel: "Documents", filename: "b", fileSize: 300, projectId: "p2", isDuplicate: false, trashed: false },
    { id: "3", source: "daily_log_photo", sourceLabel: "Daily Log Photos", filename: "c", fileSize: 50, projectId: "p1", isDuplicate: false, trashed: false },
    { id: "4", source: "document", sourceLabel: "Documents", filename: "d", fileSize: 20, projectId: "", isDuplicate: false, trashed: false },
  ];
  const summary = engine.summarizeStorage(records);
  assert.strictEqual(summary.bySource.document.count, 3);
  assert.strictEqual(summary.bySource.document.bytes, 420);
  assert.strictEqual(summary.bySource.daily_log_photo.bytes, 50);
  assert.strictEqual(summary.byProject.p1.bytes, 150);
  assert.strictEqual(summary.byProject.p2.bytes, 300);
  assert.strictEqual(summary.byProject.__unassigned__.bytes, 20, "a record with no project_id must be bucketed as unassigned, not dropped");
});

check("summarizeStorage's largestFiles is sorted descending and capped at 20", () => {
  const records = [];
  for (let i = 0; i < 25; i++) {
    records.push({ id: "r" + i, source: "document", sourceLabel: "Documents", filename: "f" + i, fileSize: i * 10, projectId: "p1", isDuplicate: false, trashed: false });
  }
  const summary = engine.summarizeStorage(records);
  assert.strictEqual(summary.largestFiles.length, 20);
  assert.strictEqual(summary.largestFiles[0].fileSize, 240, "the largest file must be first");
  assert.strictEqual(summary.largestFiles[19].fileSize, 50, "the 20th-largest, not the 25th, since it's capped");
});

check("summarizeStorage on an empty list returns all-zero totals without throwing", () => {
  const summary = engine.summarizeStorage([]);
  assert.strictEqual(summary.totalBytes, 0);
  assert.strictEqual(summary.totalCount, 0);
  assert.strictEqual(summary.largestFiles.length, 0);
});

// ---------------------------------------------------------------------------
// findOrphans
// ---------------------------------------------------------------------------
check("findOrphans detects a blob with no matching record", () => {
  const records = [{ id: "d1", fileSize: 100 }];
  const blobIds = ["d1", "orphan1"];
  const result = engine.findOrphans(records, blobIds);
  assert.deepStrictEqual(result.orphanBlobIds, ["orphan1"]);
});

check("findOrphans detects a record claiming a file that has no matching blob", () => {
  const records = [{ id: "d1", fileSize: 100 }, { id: "d2", fileSize: 200 }];
  const blobIds = ["d1"];
  const result = engine.findOrphans(records, blobIds);
  assert.strictEqual(result.missingBlobRecords.length, 1);
  assert.strictEqual(result.missingBlobRecords[0].id, "d2");
});

check("findOrphans does not flag a record with fileSize 0 as missing a blob (it never claimed to have one)", () => {
  const records = [{ id: "d1", fileSize: 0 }];
  const blobIds = [];
  const result = engine.findOrphans(records, blobIds);
  assert.strictEqual(result.missingBlobRecords.length, 0);
});

check("findOrphans with everything matching reports no orphans and no missing blobs", () => {
  const records = [{ id: "d1", fileSize: 100 }, { id: "d2", fileSize: 200 }];
  const blobIds = ["d1", "d2"];
  const result = engine.findOrphans(records, blobIds);
  assert.strictEqual(result.orphanBlobIds.length, 0);
  assert.strictEqual(result.missingBlobRecords.length, 0);
});

check("findOrphans handles an empty blobIds list without throwing", () => {
  const records = [{ id: "d1", fileSize: 100 }];
  const result = engine.findOrphans(records, undefined);
  assert.strictEqual(result.orphanBlobIds.length, 0);
  assert.strictEqual(result.missingBlobRecords.length, 1);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
