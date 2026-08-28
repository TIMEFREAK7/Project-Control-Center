/* PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Storage Analytics &
 * Orphan Detection. Master upgrade prompt Section 28 (Storage Analytics: total storage,
 * breakdown by project/type, largest files, duplicates) and Section 29 (Orphan File
 * Detection: a database record with no matching physical file, and a physical file with
 * no matching database record — "do NOT automatically delete orphan files, show them
 * first").
 *
 * Calculation only: no DOM, no store writes, no IndexedDB calls — same separation
 * scheduleBaselineEngine.js/duplicateService.js already keep. storageManagement.js (the
 * page) owns rendering and the one IndexedDB call (blobStore.listBlobIds()) orphan
 * detection genuinely needs.
 *
 * WHAT COUNTS AS A "FILE" HERE:
 * Every place a binary blob is stored via blobStore.js, unified into one flat record
 * shape — collectFileRecords() is the single place that knows about all of them, so a
 * future new blob-bearing collection only needs one line added here, not a change
 * scattered across the analytics/orphan logic below. Deliberately uses each record's own
 * declared `file_size` (already captured at upload time from the real File object) for
 * the size breakdown, rather than reading every blob's actual bytes from IndexedDB — a
 * blob-shaped analytics report that had to open every stored file just to add up sizes
 * would be exactly the "load everything into memory" mistake the master prompt's Section
 * 33 warns against. The one place actual blob bytes get read is findOrphans() -> the
 * caller resolving a handful of orphan blobs' sizes for display, not this file.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  /** Flattens every blob-bearing collection in `data` into one array of
   * `{id, source, sourceLabel, filename, fileSize, projectId, isDuplicate, trashed}`.
   * `id` is always the same id used as blobStore.js's key for that record. */
  function collectFileRecords(data) {
    var records = [];

    (data.documents || []).forEach(function (d) {
      records.push({
        id: d.id,
        source: "document",
        sourceLabel: "Documents",
        filename: d.filename || "(untitled)",
        fileSize: d.file_size || 0,
        projectId: d.project_id || "",
        isDuplicate: !!d.is_duplicate,
        trashed: !!d.trashed_at,
      });
    });

    (data.daily_logs || []).forEach(function (log) {
      (log.photos || []).forEach(function (p) {
        records.push({
          id: p.id,
          source: "daily_log_photo",
          sourceLabel: "Daily Log Photos",
          filename: p.filename || "(photo)",
          fileSize: p.file_size || 0,
          projectId: log.project_id || "",
          isDuplicate: false,
          trashed: false,
        });
      });
    });

    (data.vendor_documents || []).forEach(function (d) {
      records.push({
        id: d.id,
        source: "vendor_document",
        sourceLabel: "Vendor Documents",
        filename: d.filename || "(untitled)",
        fileSize: d.file_size || 0,
        projectId: d.project_id || "",
        isDuplicate: !!d.is_duplicate,
        trashed: false,
      });
    });

    (data.knowledge_base_articles || []).forEach(function (a) {
      if (a.filename) {
        records.push({
          id: a.id,
          source: "knowledge_base_article",
          sourceLabel: "Knowledge Base",
          filename: a.filename,
          fileSize: a.file_size || 0,
          projectId: "",
          isDuplicate: false,
          trashed: false,
        });
      }
    });

    // A schedule's imported source file (Excel/MSP XML) — one blob per schedule, keyed
    // by the schedule's own id, always overwritten (not versioned) on re-import/re-save.
    (data.schedules || []).forEach(function (s) {
      if (s.source_file_name) {
        records.push({
          id: s.id,
          source: "schedule_import",
          sourceLabel: "Schedule Imports",
          filename: s.source_file_name,
          fileSize: s.source_file_size || 0,
          projectId: s.project_id || "",
          isDuplicate: false,
          trashed: false,
        });
      }
    });

    // Fixed single key, no per-record file_size tracked (see settings.js's logo upload)
    // — included so orphan detection knows this id is legitimately claimed, not so it
    // meaningfully contributes to the size totals (one small icon file either way).
    if (data.settings && data.settings.company_logo_filename) {
      records.push({
        id: "company_logo",
        source: "company_logo",
        sourceLabel: "Company Logo",
        filename: data.settings.company_logo_filename,
        fileSize: 0,
        projectId: "",
        isDuplicate: false,
        trashed: false,
      });
    }

    return records;
  }

  /** Section 28 (Storage Analytics): total storage, breakdown by type/project, largest
   * files, duplicates. Trashed records are counted separately (`trashedBytes`/
   * `trashedCount`), not included in the active totals — they're already hidden from
   * normal use, so their space isn't "storage you're actively using." */
  function summarizeStorage(records) {
    var active = records.filter(function (r) { return !r.trashed; });
    var trashed = records.filter(function (r) { return r.trashed; });
    var duplicates = active.filter(function (r) { return r.isDuplicate; });

    var bySource = {};
    active.forEach(function (r) {
      if (!bySource[r.source]) bySource[r.source] = { label: r.sourceLabel, count: 0, bytes: 0 };
      bySource[r.source].count++;
      bySource[r.source].bytes += r.fileSize;
    });

    var byProject = {};
    active.forEach(function (r) {
      var key = r.projectId || "__unassigned__";
      if (!byProject[key]) byProject[key] = { count: 0, bytes: 0 };
      byProject[key].count++;
      byProject[key].bytes += r.fileSize;
    });

    var largestFiles = active
      .slice()
      .sort(function (a, b) { return b.fileSize - a.fileSize; })
      .slice(0, 20);

    return {
      totalBytes: active.reduce(function (sum, r) { return sum + r.fileSize; }, 0),
      totalCount: active.length,
      trashedBytes: trashed.reduce(function (sum, r) { return sum + r.fileSize; }, 0),
      trashedCount: trashed.length,
      duplicateBytes: duplicates.reduce(function (sum, r) { return sum + r.fileSize; }, 0),
      duplicateCount: duplicates.length,
      bySource: bySource,
      byProject: byProject,
      largestFiles: largestFiles,
    };
  }

  /** Section 29 (Orphan File Detection). `blobIds` is whatever blobStore.listBlobIds()
   * resolved to — the caller's job, not this pure function's. Returns:
   *   - orphanBlobIds: ids present in blobStore with NO matching record at all (safe to
   *     delete — nothing references them — but never done automatically, per the master
   *     prompt's own "show them first" rule; the caller decides).
   *   - missingBlobRecords: records that claim a real file (fileSize > 0) but have no
   *     matching blob in storage — informational only. There is no file to recover, so
   *     the only correct action is telling the person, not attempting an automatic
   *     "repair" that would have to invent bytes that don't exist. */
  function findOrphans(records, blobIds) {
    var recordIds = {};
    records.forEach(function (r) { recordIds[r.id] = true; });
    var blobIdSet = {};
    (blobIds || []).forEach(function (id) { blobIdSet[id] = true; });

    var orphanBlobIds = (blobIds || []).filter(function (id) { return !recordIds[id]; });
    var missingBlobRecords = records.filter(function (r) { return r.fileSize > 0 && !blobIdSet[r.id]; });

    return { orphanBlobIds: orphanBlobIds, missingBlobRecords: missingBlobRecords };
  }

  window.PCC.storageAnalyticsEngine = {
    collectFileRecords: collectFileRecords,
    summarizeStorage: summarizeStorage,
    findOrphans: findOrphans,
  };
})();
