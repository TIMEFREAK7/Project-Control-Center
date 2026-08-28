(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var CATEGORY_LABELS = {
    contract: "Contract",
    drawing: "Drawing",
    photo: "Photo",
    invoice: "Invoice",
    other: "Other",
  };

  // Gate 16 (Document Control 3): local label map, same "duplicated per module, no
  // shared util layer" convention every other module's own PRIORITY_LABELS already uses
  // (see schedule.js).
  var PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" };
  var CRITICALITY_LABELS = { critical: "Critical", major: "Major", normal: "Normal", informational: "Informational" };

  // Gate 17 (Document Control 4): local label/badge maps, same duplicated-per-module
  // convention as PRIORITY_LABELS above.
  var STATUS_LABELS = {
    draft: "Draft",
    submitted: "Submitted",
    under_review: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    resubmitted: "Resubmitted",
    superseded: "Superseded",
    archived: "Archived",
  };
  var uiState = {
    // UI/UX Overhaul Gate 6 (Documents): this register never had a filter toolbar at
    // all — render() showed every document across every project in one flat list, the
    // only register in the app with no search/project/category/status narrowing (Risk
    // Register/Portfolio/RFI-TQ all have one). Same field names/conventions as
    // risks.js's own uiState (search/statusFilter/projectFilter) plus a categoryFilter.
    search: "",
    categoryFilter: "",
    statusFilter: "",
    projectFilter: "",
    // Redesign Gate 6 (Global Project Context): see risks.js's own uiState comment —
    // true once this page has ever checked window.PCC.projectContext for an initial
    // filter value, so seeding only ever happens once per session.
    projectFilterInitialized: false,
    // Which document is shown in the new two-panel register+preview layout's right-hand
    // pane, or null if none selected yet. Replaces the old per-row inline expand — the
    // preview pane now always shows full detail for whichever document is selected,
    // instead of a separate accordion under each row.
    selectedDocId: null,
    formOpen: false,
    pendingFile: null, // { name, size, type, extraction } once read
    pendingProjectId: "",
    pendingActivityId: "", // Gate 10: optional link to a Schedule activity
    pendingCategory: "contract",
    pendingMeetingId: "", // set by createFromMeeting() when opened via a meeting's "Attach Document" button
    readError: null,
    readingLabel: null,
    // Whether the selected document's extracted data/text is expanded within the
    // preview pane — a plain toggle (not per-document) since only one document is ever
    // selected/previewed at a time; reset whenever the selection changes (see
    // selectDocument() below).
    previewExtractionExpanded: false,
    // UI/UX Overhaul Gate 7 (Resizable Panels): the register list pane's width in px
    // once the user has dragged the handle at least once, or null to use the default
    // CSS flex-basis split. Module-level, not persisted — same "resets on reload"
    // treatment every other per-page display preference in this app already gets.
    docRegisterListWidth: null,
    duplicateMatches: [], // [{ record, reason, strength }] for the current pendingFile, or []
    duplicateAcknowledged: false, // true once the user clicks "Continue Anyway" on a warning
    // Gate 16 (Document Control 3): classification fields, all optional, additive on top
    // of pendingCategory above (untouched). See newDocument()'s own header comment in
    // store.js for why `package`/`contract_or_po` are free text rather than real entities.
    pendingDocumentTypeId: "",
    pendingDiscipline: "",
    pendingDocumentNumber: "",
    pendingRevision: "00",
    // PCC Evolution Roadmap, Tier F (Gate 19): pendingPackageId drives the new
    // `packages` register select; the legacy pendingPackage/document.package free-text
    // field is no longer editable from this form — see the field's own comment below.
    pendingPackageId: "",
    pendingContractOrPo: "",
    pendingVendorId: "",
    pendingPriority: "medium",
    pendingCriticality: "",
    pendingRemarks: "",
    // Gate 17 (Document Control 4): version control. pendingRevisionGroupId is set by
    // "New Revision" (see documentRow's revisionBtn below) — its presence is what makes
    // the upload form say "Upload New Revision" instead of "Add Document" and is what
    // makes the Save handler compute the next revision_number instead of starting at 1.
    // expandedRevisionsGroupId tracks which document's History panel is open, or null.
    pendingStatus: "draft",
    pendingRevisionGroupId: "",
    expandedRevisionsGroupId: null,
    // Daily-Use Audit Phase 3 (bulk actions): { [documentId]: true } for every checked
    // row — see risks.js's own uiState comment on this exact pattern. Keyed by the same
    // top-level document id selectedDocId uses (always the latest revision).
    selectedIds: {},
    // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): bulk import.
    // Deliberately separate from pendingFile/pendingCategory etc. above rather than
    // reusing them — bulk import applies ONE set of batch metadata (project, category,
    // document type, discipline) to every file at once (master upgrade prompt Section
    // 22/23's own examples), not the single-upload form's full per-file classification
    // (document_number/revision/package/vendor/priority/criticality/remarks), and
    // deliberately skips content extraction (Excel/Word/PDF text) — extraction is a
    // single-file nicety, not something worth doing per-file across a batch that may be
    // hundreds of photos/drawings of file types extraction doesn't even support.
    bulkImportOpen: false,
    bulkImportProjectId: "",
    bulkImportCategory: "other",
    bulkImportDocumentTypeId: "",
    bulkImportDiscipline: "",
    // [{ file, name, size, type, status: 'scanning'|'ready'|'duplicate'|'error',
    //    hash, hashMethod, dataUri, duplicateMatch, errorMessage }]
    bulkImportFiles: [],
    bulkImportProgress: null, // { done, total } while committing, else null
    bulkImportSummary: null, // { imported, duplicates, skipped, errors } after commit, else null
    // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash/Recycle
    // Bin. Toggles the whole register between its normal (active-documents) view and
    // the Trash view (trashed documents only) — see trashDocumentGroup()'s own header
    // comment for the full design.
    showTrash: false,
  };

  function resetPendingClassification() {
    uiState.pendingDocumentTypeId = "";
    uiState.pendingDiscipline = "";
    uiState.pendingDocumentNumber = "";
    uiState.pendingRevision = "00";
    uiState.pendingPackageId = "";
    uiState.pendingContractOrPo = "";
    uiState.pendingVendorId = "";
    uiState.pendingPriority = "medium";
    uiState.pendingCriticality = "";
    uiState.pendingRemarks = "";
    uiState.pendingStatus = "draft";
    uiState.pendingRevisionGroupId = "";
  }

  function projectName(data, projectId) {
    if (!projectId) return "Unassigned";
    var p = data.projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "Unassigned";
  }

  /** Gate 17 (Document Control 4): collapses a flat document list down to just the
   * highest-revision_number record per document_group_id — the same "latest computed at
   * render time, never a denormalized flag" convention vendor_documents.js's own
   * latestDocumentsForVendor() already established. Exported (see window.PCC.files
   * below) so portfolio.js's ATTACHMENTS section can show the same "latest only" view
   * instead of listing every historical revision as its own row. */
  function latestDocuments(documents) {
    var groups = {};
    documents.forEach(function (d) {
      var key = d.document_group_id || d.id;
      if (!groups[key] || d.revision_number > groups[key].revision_number) groups[key] = d;
    });
    return Object.keys(groups).map(function (k) {
      return groups[k];
    });
  }

  /** PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash/Recycle
   * Bin. Excludes trashed documents — used wherever "does a document like this already
   * exist" is being asked (duplicate detection), since a trashed document shouldn't
   * block a fresh upload as if it were still active. */
  function activeDocuments(documents) {
    return documents.filter(function (d) {
      return !d.trashed_at;
    });
  }

  /** All revisions in the same group as `doc`, newest first. */
  function revisionsFor(documents, groupId) {
    return documents
      .filter(function (d) {
        return d.document_group_id === groupId;
      })
      .sort(function (a, b) {
        return b.revision_number - a.revision_number;
      });
  }

  // ---------------------------------------------------------------------------------
  // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash/Recycle Bin.
  // Master upgrade prompt Section 26: DELETE -> TRASH -> RETENTION -> PERMANENT DELETE,
  // with RESTORE and EMPTY TRASH, and "do not immediately permanently delete important
  // evidence unless the user explicitly requests permanent deletion." "Delete" (single
  // or bulk) now moves a document's ENTIRE revision group to trash — same "act on the
  // whole group, never just the latest row" rule the old hard-delete already followed —
  // leaving the record and its blob fully intact until Restore or an explicit, separately
  // confirmed Delete Permanently. No automatic time-based purge in this increment
  // (deliberately: the master prompt's own "never silently delete files" applies just as
  // much to a timer as to a button — the retention step here is manual review, not
  // automatic expiry).
  // ---------------------------------------------------------------------------------

  function trashDocumentGroup(groupId) {
    var now = new Date().toISOString();
    window.PCC.store.update(function (d) {
      d.documents.forEach(function (item) {
        if (item.document_group_id === groupId) item.trashed_at = now;
      });
    });
  }

  function restoreDocumentGroup(groupId) {
    window.PCC.store.update(function (d) {
      d.documents.forEach(function (item) {
        if (item.document_group_id === groupId) item.trashed_at = null;
      });
    });
  }

  /** The original hard-delete: actually removes every revision's record and blob, and
   * cleans up project.attachments. Cannot be undone — only reachable from the Trash view
   * behind its own, separately worded confirmation. Resolves once every blob delete has
   * settled (best-effort — a failed individual blob delete never blocks the rest). */
  function permanentlyDeleteDocumentGroup(documents, groupId) {
    var allRevisionIds = documents.filter(function (d) { return d.document_group_id === groupId; }).map(function (d) { return d.id; });
    window.PCC.store.update(function (d) {
      d.documents = d.documents.filter(function (item) { return allRevisionIds.indexOf(item.id) === -1; });
      d.projects.forEach(function (p) {
        if (p.attachments) {
          p.attachments = p.attachments.filter(function (id) { return allRevisionIds.indexOf(id) === -1; });
        }
      });
    });
    return Promise.all(
      allRevisionIds.map(function (id) {
        return window.PCC.blobStore.deleteBlob(id).catch(function () {});
      })
    ).then(function () {
      return allRevisionIds;
    });
  }

  /** PCC Architecture Upgrade Phase 6 (Trash/Recycle Bin): a short "trashed N ago" label
   * for the Trash view, so a person can judge at a glance whether something is safe to
   * clean out for good. */
  function trashedAgoLabel(trashedAtIso) {
    if (!trashedAtIso) return "";
    var ms = Date.now() - new Date(trashedAtIso).getTime();
    var minutes = Math.floor(ms / 60000);
    if (minutes < 1) return "Trashed just now";
    if (minutes < 60) return "Trashed " + minutes + " minute" + (minutes === 1 ? "" : "s") + " ago";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return "Trashed " + hours + " hour" + (hours === 1 ? "" : "s") + " ago";
    var days = Math.floor(hours / 24);
    return "Trashed " + days + " day" + (days === 1 ? "" : "s") + " ago";
  }

  /** Gate 10: see risks.js's identical helper for the full rationale. */
  function activityOptionsFor(select, data, projectId, selectedActivityId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "(none)";
    select.appendChild(noneOpt);

    var scheduleNameById = {};
    data.schedules
      .filter(function (s) { return s.project_id === projectId; })
      .forEach(function (s) { scheduleNameById[s.id] = s.name; });

    data.activities
      .filter(function (a) { return a.project_id === projectId; })
      .forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = (scheduleNameById[a.schedule_id] || "(schedule)") + ": " + (a.name || "(unnamed activity)");
        select.appendChild(opt);
      });
    select.value = selectedActivityId || "";
  }

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s === null || s === undefined ? "" : String(s);
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    var kb = bytes / 1024;
    if (kb < 1024) return Math.round(kb) + " KB";
    return (kb / 1024).toFixed(1) + " MB";
  }

  function extensionOf(filename) {
    var m = /\.([a-z0-9]+)$/i.exec(filename || "");
    return m ? m[1].toLowerCase() : "";
  }

  /** Reads an Excel file with SheetJS and returns { sheet_name, headers, rows }.
   * Capped at 300 rows / 20 columns so the exported JSON doesn't balloon. */
  function extractExcel(buffer, callback) {
    try {
      var data = new Uint8Array(buffer);
      var workbook = window.XLSX.read(data, { type: "array" });
      var firstSheetName = workbook.SheetNames[0];
      var sheet = workbook.Sheets[firstSheetName];
      var rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      var capped = rows.slice(0, 300).map(function (row) {
        return row.slice(0, 20).map(function (cell) {
          return cell === null || cell === undefined ? "" : String(cell);
        });
      });

      callback(null, {
        type: "excel",
        sheet_name: firstSheetName,
        headers: capped.length ? capped[0] : [],
        rows: capped.slice(1),
        truncated: rows.length > 300,
      });
    } catch (e) {
      callback(e, null);
    }
  }

  var TEXT_CHAR_CAP = 50000; // keep exported JSON reasonable

  /** Reads a .docx file with mammoth.js and returns { text, char_count, truncated }. */
  function extractDocx(buffer, callback) {
    window.mammoth
      .extractRawText({ arrayBuffer: buffer })
      .then(function (result) {
        var fullText = result.value || "";
        callback(null, {
          type: "docx",
          text: fullText.slice(0, TEXT_CHAR_CAP),
          char_count: fullText.length,
          truncated: fullText.length > TEXT_CHAR_CAP,
        });
      })
      .catch(function (e) {
        callback(e, null);
      });
  }

  var PDF_MAX_PAGES = 50; // keep large PDFs from taking forever / bloating the export

  /** Reads a PDF with pdf.js. pdf.worker.min.js is loaded as a plain classic script
   * (see build.js/index.html) rather than spun up as a real Worker — its UMD wrapper
   * sets `window.pdfjsWorker` when loaded that way, which pdf.js detects automatically
   * and uses via its documented main-thread fallback path. Simpler and more portable
   * than managing a Blob-based Worker, at the cost of parsing blocking the main thread
   * briefly — acceptable since this only runs once per manual upload. */
  function extractPdf(buffer, callback) {
    var typedArray = new Uint8Array(buffer);
    window.pdfjsLib
      .getDocument({ data: typedArray })
      .promise.then(function (pdf) {
        var pagesToRead = Math.min(pdf.numPages, PDF_MAX_PAGES);
        var pagePromises = [];
        for (var i = 1; i <= pagesToRead; i++) {
          pagePromises.push(
            pdf.getPage(i).then(function (page) {
              return page.getTextContent().then(function (content) {
                return content.items.map(function (item) { return item.str; }).join(" ");
              });
            })
          );
        }
        Promise.all(pagePromises)
          .then(function (pageTexts) {
            var fullText = pageTexts.join("\n\n");
            callback(null, {
              type: "pdf",
              text: fullText.slice(0, TEXT_CHAR_CAP),
              char_count: fullText.length,
              page_count: pdf.numPages,
              truncated: fullText.length > TEXT_CHAR_CAP || pdf.numPages > pagesToRead,
            });
          })
          .catch(function (e) {
            callback(e, null);
          });
      })
      .catch(function (e) {
        callback(e, null);
      });
  }

  /** Base64-encodes an ArrayBuffer in fixed-size chunks (avoids both the slow
   * per-byte-string-concat path and the call-stack limit of spreading a huge
   * typed array into String.fromCharCode.apply at once). */
  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunkSize = 8192;
    var chunks = [];
    for (var i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
    }
    return btoa(chunks.join(""));
  }

  var LARGE_FILE_WARNING_BYTES = 2 * 1024 * 1024; // 2MB raw (~2.7MB once base64-encoded)

  /** Fingerprints the just-selected file and checks it against documents already
   * saved to the same project, storing any matches on uiState for renderUploadForm
   * to display. Runs independently of extraction success/failure — a duplicate check
   * doesn't need the file's text content, just its bytes. */
  function checkForDuplicates(buffer, file, rerender) {
    window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
      uiState.pendingFile.hash = fp.hash;
      uiState.pendingFile.hashMethod = fp.method;

      var data = window.PCC.store.get();
      // PCC Architecture Upgrade Phase 6: a trashed document shouldn't block a fresh
      // upload as if it still existed — exclude it from duplicate matching.
      uiState.duplicateMatches = window.PCC.duplicateService.findFileDuplicates(activeDocuments(data.documents), {
        hash: fp.hash,
        method: fp.method,
        filename: file.name,
        size: file.size,
        projectId: uiState.pendingProjectId,
      });
      uiState.duplicateAcknowledged = false;
      rerender();
    });
  }

  // ---------------------------------------------------------------------------------
  // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Bulk Import.
  // Master upgrade prompt Section 21 (File Import Lifecycle) / Section 22 (Bulk Import):
  // SELECT -> SCAN -> VALIDATE/HASH -> DUPLICATE CHECK -> [preview] -> CONFIRM ->
  // BATCH IMPORT -> PROGRESS -> SUMMARY. Files are hashed/duplicate-checked
  // sequentially, not in parallel (Section 24's "background/batched processing") —
  // bounds peak memory when many/large files are picked at once, and mirrors the exact
  // sequential-chain pattern archive.js's own addDocsToFolder() already uses for the
  // same reason.
  // ---------------------------------------------------------------------------------

  function resetBulkImportState() {
    uiState.bulkImportOpen = false;
    uiState.bulkImportProjectId = "";
    uiState.bulkImportCategory = "other";
    uiState.bulkImportDocumentTypeId = "";
    uiState.bulkImportDiscipline = "";
    uiState.bulkImportFiles = [];
    uiState.bulkImportProgress = null;
    uiState.bulkImportSummary = null;
  }

  /** Reads one bulk-import entry's file once (as an ArrayBuffer), computing both its
   * content fingerprint (for duplicate detection) and its storable data URI from the
   * SAME read — no second file read needed for storage later. */
  function hashAndCheckBulkImportFile(entry, rerender) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        var buffer = reader.result;
        var mimeType = entry.file.type || "application/octet-stream";
        entry.dataUri = "data:" + mimeType + ";base64," + arrayBufferToBase64(buffer);

        window.PCC.duplicateService.fingerprintFile(buffer, entry.name, entry.size).then(function (fp) {
          entry.hash = fp.hash;
          entry.hashMethod = fp.method;

          var data = window.PCC.store.get();
          var matches = uiState.bulkImportProjectId
            ? window.PCC.duplicateService.findFileDuplicates(activeDocuments(data.documents), {
                hash: fp.hash,
                method: fp.method,
                filename: entry.name,
                size: entry.size,
                projectId: uiState.bulkImportProjectId,
              })
            : [];
          entry.duplicateMatch = matches.length
            ? matches.reduce(function (best, m) {
                return !best || (m.strength === "strong" && best.strength !== "strong") ? m : best;
              }, null)
            : null;
          entry.status = entry.duplicateMatch ? "duplicate" : "ready";
          rerender();
          resolve();
        });
      };
      reader.onerror = function () {
        entry.status = "error";
        entry.errorMessage = "Could not read this file.";
        rerender();
        resolve();
      };
      reader.readAsArrayBuffer(entry.file);
    });
  }

  /** SELECT -> SCAN: adds every file in `fileList` to the pending batch immediately
   * (so the count/names show up right away), then hashes/duplicate-checks them one at a
   * time in the background. Appends to any files already staged, so multiple
   * drag-and-drop/select actions accumulate into one batch rather than replacing it. */
  function scanBulkImportFiles(fileList, rerender) {
    var files = Array.prototype.slice.call(fileList);
    if (files.length === 0) return;
    uiState.bulkImportSummary = null;
    var entries = files.map(function (file) {
      return {
        file: file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: "scanning",
        hash: null,
        hashMethod: null,
        dataUri: null,
        duplicateMatch: null,
        errorMessage: null,
      };
    });
    uiState.bulkImportFiles = uiState.bulkImportFiles.concat(entries);
    rerender();

    entries.reduce(function (chain, entry) {
      return chain.then(function () {
        return hashAndCheckBulkImportFile(entry, rerender);
      });
    }, Promise.resolve());
  }

  function removeBulkImportFile(index, rerender) {
    uiState.bulkImportFiles.splice(index, 1);
    rerender();
  }

  /** BATCH IMPORT -> PROGRESS -> SUMMARY. Imports every file currently 'ready' or
   * 'duplicate' (duplicates are flagged, never silently skipped — master upgrade
   * prompt's own "never automatically delete/reject duplicates, show the relationship
   * and let the user decide" principle, same as the single-upload form already
   * follows). Files still 'scanning' or 'error' are left out and counted as skipped.
   * Same blob-then-metadata write order as the single-upload handler (never orphan a
   * document record pointing at a blob that was never actually written). */
  function commitBulkImport(rerender) {
    if (!uiState.bulkImportProjectId) return;
    var toImport = uiState.bulkImportFiles.filter(function (e) {
      return e.status === "ready" || e.status === "duplicate";
    });
    var skipped = uiState.bulkImportFiles.length - toImport.length;
    if (toImport.length === 0) return;

    uiState.bulkImportProgress = { done: 0, total: toImport.length };
    rerender();

    var imported = 0;
    var duplicatesImported = 0;
    var errors = 0;

    toImport
      .reduce(function (chain, entry) {
        return chain.then(function () {
          // Re-check for duplicates against the LIVE store right before creating this
          // document, rather than trusting entry.duplicateMatch from scan time as-is.
          // Scan-time duplicate checking can only compare against documents that already
          // existed BEFORE this batch started — it has no way to catch two files within
          // the SAME batch that turn out to be identical (e.g. the same photo picked up
          // twice from an export folder). Because this loop commits files one at a time,
          // by the time file N is reached, every earlier file in this same batch is
          // already a real, committed document — so re-running the same check here for
          // free catches intra-batch duplicates too, not just pre-existing ones.
          var liveMatches = window.PCC.duplicateService.findFileDuplicates(activeDocuments(window.PCC.store.get().documents), {
            hash: entry.hash,
            method: entry.hashMethod,
            filename: entry.name,
            size: entry.size,
            projectId: uiState.bulkImportProjectId,
          });
          var strongestMatch = liveMatches.length
            ? liveMatches.reduce(function (best, m) {
                return !best || (m.strength === "strong" && best.strength !== "strong") ? m : best;
              }, null)
            : null;
          var doc = window.PCC.store.newDocument({
            project_id: uiState.bulkImportProjectId,
            filename: entry.name,
            category: uiState.bulkImportCategory,
            file_size: entry.size,
            mime_type: entry.type || "application/octet-stream",
            file_data: null,
            content_hash: entry.hash,
            hash_method: entry.hashMethod,
            is_duplicate: !!strongestMatch,
            original_record_id: strongestMatch ? strongestMatch.record.id : null,
            duplicate_reason: strongestMatch ? strongestMatch.reason : null,
            duplicate_group_id: strongestMatch
              ? strongestMatch.record.duplicate_group_id || window.PCC.duplicateService.newGroupId()
              : null,
            document_type_id: uiState.bulkImportDocumentTypeId || "",
            discipline: uiState.bulkImportDiscipline || "",
          });

          return window.PCC.blobStore
            .putBlob(doc.id, entry.dataUri)
            .then(function () {
              window.PCC.store.update(function (d) {
                d.documents.push(doc);
                if (strongestMatch && !strongestMatch.record.duplicate_group_id) {
                  var original = d.documents.find(function (item) {
                    return item.id === strongestMatch.record.id;
                  });
                  if (original) original.duplicate_group_id = doc.duplicate_group_id;
                }
                if (doc.project_id) {
                  var proj = d.projects.find(function (p) {
                    return p.id === doc.project_id;
                  });
                  if (proj) {
                    if (!proj.attachments) proj.attachments = [];
                    proj.attachments.push(doc.id);
                  }
                }
              });
              imported++;
              if (strongestMatch) duplicatesImported++;
            })
            .catch(function () {
              errors++;
            });
        }).then(function () {
          uiState.bulkImportProgress.done++;
          rerender();
        });
      }, Promise.resolve())
      .then(function () {
        uiState.bulkImportSummary = { imported: imported, duplicates: duplicatesImported, skipped: skipped, errors: errors };
        uiState.bulkImportProgress = null;
        uiState.bulkImportFiles = [];
        window.PCC.notify(
          "Bulk import complete: " + imported + " file" + (imported === 1 ? "" : "s") + " imported" +
            (duplicatesImported ? " (" + duplicatesImported + " flagged as possible duplicates)" : "") +
            (errors ? ", " + errors + " failed" : "") +
            (skipped ? ", " + skipped + " skipped" : "") + ".",
          errors ? "warning" : "success"
        );
        rerender();
      });
  }

  function handleFileSelected(file, rerender) {
    uiState.readError = null;
    uiState.duplicateMatches = [];
    uiState.duplicateAcknowledged = false;
    var ext = extensionOf(file.name);

    var supported = ext === "xlsx" || ext === "xls" || ext === "docx" || ext === "pdf";
    if (!supported) {
      uiState.pendingFile = null;
      uiState.readError = "Unsupported file type. Use .xlsx, .xls, .docx, or .pdf.";
      rerender();
      return;
    }

    uiState.readingLabel = ext === "docx" ? "Reading Word document\u2026" : ext === "pdf" ? "Reading PDF\u2026" : "Reading spreadsheet\u2026";
    rerender();

    var reader = new FileReader();
    reader.onload = function () {
      var buffer = reader.result;
      var mimeType =
        file.type ||
        (ext === "pdf"
          ? "application/pdf"
          : ext === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      var fileDataUri = "data:" + mimeType + ";base64," + arrayBufferToBase64(buffer);

      function onExtracted(err, extraction) {
        uiState.readingLabel = null;
        if (err) {
          var hint =
            ext === "pdf"
              ? " Scanned/image-only PDFs don't contain extractable text."
              : ext === "xls" || ext === "xlsx"
              ? " If it's an older .xls file, try re-saving it as .xlsx."
              : "";
          uiState.readError = "Couldn't read this file (" + err.message + ")." + hint;
          uiState.pendingFile = null;
        } else {
          uiState.pendingFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            fileData: fileDataUri,
            extraction: extraction,
            hash: null, // filled in by checkForDuplicates() once fingerprinting resolves
            hashMethod: null,
          };
          checkForDuplicates(buffer, file, rerender);
        }
        rerender();
      }

      if (ext === "xlsx" || ext === "xls") {
        extractExcel(buffer, onExtracted);
      } else if (ext === "docx") {
        extractDocx(buffer, onExtracted);
      } else {
        extractPdf(buffer, onExtracted);
      }
    };
    reader.onerror = function () {
      uiState.readingLabel = null;
      uiState.readError = "Could not read that file.";
      uiState.pendingFile = null;
      rerender();
    };
    reader.readAsArrayBuffer(file);
  }

  function renderExcelPreview(extraction) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "var(--space-3)";

    var note = document.createElement("p");
    note.className = "text-secondary";
    note.style.fontSize = "var(--text-sm)";
    note.style.marginBottom = "var(--space-2)";
    note.textContent =
      "Extracted from sheet \u201c" +
      extraction.sheet_name +
      "\u201d \u2014 " +
      extraction.rows.length +
      " row" +
      (extraction.rows.length === 1 ? "" : "s") +
      (extraction.truncated ? " (showing first 300 rows/20 columns)" : "") +
      ". This data will be saved with the document.";
    wrap.appendChild(note);

    var tableWrap = document.createElement("div");
    tableWrap.style.overflowX = "auto";
    tableWrap.style.maxHeight = "260px";
    tableWrap.style.overflowY = "auto";
    tableWrap.style.border = "1px solid var(--divider)";
    tableWrap.style.borderRadius = "var(--radius-sm)";

    var table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    table.style.fontSize = "var(--text-sm)";
    table.className = "mono";

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    extraction.headers.forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h || "\u2014";
      th.style.textAlign = "left";
      th.style.padding = "var(--space-2) var(--space-3)";
      th.style.borderBottom = "1px solid var(--divider)";
      th.style.position = "sticky";
      th.style.top = "0";
      th.style.backgroundColor = "var(--bg-paper-raised)";
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    extraction.rows.slice(0, 15).forEach(function (row) {
      var tr = document.createElement("tr");
      row.forEach(function (cell) {
        var td = document.createElement("td");
        td.textContent = cell;
        td.style.padding = "var(--space-1) var(--space-3)";
        td.style.borderBottom = "1px solid var(--divider)";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    if (extraction.rows.length > 15) {
      var more = document.createElement("p");
      more.className = "text-secondary";
      more.style.fontSize = "var(--text-xs)";
      more.style.marginTop = "var(--space-1)";
      more.textContent = "+" + (extraction.rows.length - 15) + " more row(s) not shown here, but saved.";
      wrap.appendChild(more);
    }

    return wrap;
  }

  function renderTextPreview(extraction) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "var(--space-3)";

    var note = document.createElement("p");
    note.className = "text-secondary";
    note.style.fontSize = "var(--text-sm)";
    note.style.marginBottom = "var(--space-2)";
    note.textContent =
      extraction.char_count.toLocaleString() +
      " character" +
      (extraction.char_count === 1 ? "" : "s") +
      " extracted" +
      (extraction.page_count ? " from " + extraction.page_count + " page" + (extraction.page_count === 1 ? "" : "s") : "") +
      (extraction.truncated ? " (showing first " + TEXT_CHAR_CAP.toLocaleString() + " characters)" : "") +
      ". This text will be saved with the document.";
    wrap.appendChild(note);

    var box = document.createElement("div");
    box.className = "mono";
    box.style.whiteSpace = "pre-wrap";
    box.style.fontSize = "var(--text-sm)";
    box.style.maxHeight = "220px";
    box.style.overflowY = "auto";
    box.style.border = "1px solid var(--divider)";
    box.style.borderRadius = "var(--radius-sm)";
    box.style.padding = "10px var(--space-3)";
    box.style.backgroundColor = "var(--bg-default)";
    box.textContent = extraction.text.trim() ? extraction.text : "(No extractable text found in this file.)";
    wrap.appendChild(box);

    return wrap;
  }

  /** The comparison panel shown when checkForDuplicates() finds a match. The user's
   * decision is never made for them here \u2014 this only sets uiState.duplicateAcknowledged
   * so Save unlocks; nothing gets written to the store until they explicitly save. */
  function renderDuplicateWarning(matches, data, rerender) {
    var box = document.createElement("div");
    box.style.border = "1px solid var(--status-at-risk)";
    box.style.borderRadius = "var(--radius-md)";
    box.style.padding = "var(--space-3)";
    box.style.marginTop = "var(--space-3)";
    box.style.background = "rgba(214, 158, 46, 0.08)";

    var title = document.createElement("p");
    title.style.fontWeight = "600";
    title.style.fontSize = "var(--text-sm)";
    title.style.marginBottom = "var(--space-2)";
    title.textContent =
      "Possible duplicate " + (matches.length === 1 ? "record" : "records") + " found";
    box.appendChild(title);

    matches.forEach(function (m) {
      var row = document.createElement("div");
      row.style.fontSize = "var(--text-sm)";
      row.style.padding = "var(--space-2) 0";
      row.style.borderTop = "1px solid var(--divider)";

      var meta = document.createElement("div");
      meta.innerHTML =
        "<strong>" + m.record.filename + "</strong><br/>" +
        projectName(data, m.record.project_id) + " \u00b7 " +
        new Date(m.record.uploaded_at).toLocaleDateString() + " \u00b7 " +
        (CATEGORY_LABELS[m.record.category] || m.record.category) + "<br/>" +
        "<span class='text-secondary'>" + m.reason + "</span>";
      row.appendChild(meta);

      var rowActions = document.createElement("div");
      rowActions.style.display = "flex";
      rowActions.style.gap = "var(--space-2)";
      rowActions.style.marginTop = "var(--space-2)";

      var openExistingBtn = document.createElement("button");
      openExistingBtn.className = "btn btn--ghost";
      openExistingBtn.textContent = "Open Existing";
      openExistingBtn.onclick = function (e) {
        e.preventDefault();
        openStoredFile(m.record);
      };
      rowActions.appendChild(openExistingBtn);

      row.appendChild(rowActions);
      box.appendChild(row);
    });

    var decisionRow = document.createElement("div");
    decisionRow.style.display = "flex";
    decisionRow.style.gap = "var(--space-3)";
    decisionRow.style.marginTop = "var(--space-3)";

    var continueBtn = document.createElement("button");
    continueBtn.className = "btn btn--ghost";
    continueBtn.textContent = "Continue Anyway";
    continueBtn.onclick = function (e) {
      e.preventDefault();
      uiState.duplicateAcknowledged = true;
      rerender();
    };
    decisionRow.appendChild(continueBtn);

    var cancelUploadBtn = document.createElement("button");
    cancelUploadBtn.className = "btn btn--ghost";
    cancelUploadBtn.textContent = "Cancel Upload";
    cancelUploadBtn.onclick = function (e) {
      e.preventDefault();
      uiState.pendingFile = null;
      uiState.duplicateMatches = [];
      uiState.duplicateAcknowledged = false;
      rerender();
    };
    decisionRow.appendChild(cancelUploadBtn);

    box.appendChild(decisionRow);
    return box;
  }

  /** Gate 16 (Document Control 3: Nomenclature). "REV" + a zero-padded 2-digit number
   * for a purely numeric revision (matching the spec's own "REV02" example and this
   * app's "00" default), or "REV" + whatever was typed for anything else — never
   * silently drops a non-numeric revision label. */
  function formatRevisionToken(revision) {
    var trimmed = (revision || "").trim();
    if (!trimmed) return "";
    if (/^\d+$/.test(trimmed)) {
      return "REV" + (trimmed.length < 2 ? "0" + trimmed : trimmed);
    }
    return "REV" + trimmed;
  }

  /** Non-blocking only — see documents.js's own header note and the spec's explicit
   * "do not silently reject the document" instruction. Returns null (renders nothing)
   * when nomenclature checking is off, no pattern is configured, or no file is picked
   * yet; otherwise always shows either a match confirmation or a mismatch warning with
   * the expected name, even if every classification field is still blank — an
   * all-blank "expected" string is itself informative (see documentNomenclatureEngine.js
   * header comment). */
  function renderNomenclatureNotice(data, uiState) {
    if (!data.settings.document_nomenclature_enabled) return null;
    var pattern = data.settings.document_nomenclature_pattern;
    if (!pattern || !uiState.pendingFile) return null;

    var project = data.projects.find(function (p) { return p.id === uiState.pendingProjectId; });
    var documentType = data.document_types.find(function (t) { return t.id === uiState.pendingDocumentTypeId; });
    var tokens = {
      PROJECT: project ? project.project_code : "",
      DISCIPLINE: uiState.pendingDiscipline,
      DOCUMENTTYPE: documentType ? documentType.code : "",
      NUMBER: uiState.pendingDocumentNumber,
      REV: formatRevisionToken(uiState.pendingRevision),
    };
    var result = window.PCC.documentNomenclatureEngine.checkFilename(pattern, uiState.pendingFile.name, tokens);

    var box = document.createElement("div");
    box.style.borderRadius = "var(--radius-md)";
    box.style.padding = "10px var(--space-3)";
    box.style.marginTop = "var(--space-2)";
    box.style.fontSize = "var(--text-sm)";

    if (result.matches) {
      box.style.border = "1px solid var(--status-on_track, #3fa66a)";
      box.style.background = "rgba(31, 157, 108, 0.08)";
      box.textContent = "Filename matches the configured naming convention.";
    } else {
      box.style.border = "1px solid var(--status-at-risk)";
      box.style.background = "rgba(214, 158, 46, 0.08)";
      box.textContent =
        "Filename doesn't match the configured naming convention. Expected: “" +
        result.expected +
        "” (got “" + result.stem + "”). This is a warning only — the document can still be saved as-is.";
    }
    return box;
  }

  function renderUploadForm(container, data, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
    heading.textContent = uiState.pendingRevisionGroupId ? "Upload New Revision" : "Add Document";
    panel.appendChild(heading);

    if (uiState.pendingMeetingId) {
      var meetingForLink = data.meetings.find(function (m) {
        return m.id === uiState.pendingMeetingId;
      });
      if (meetingForLink) {
        var linkNote = document.createElement("p");
        linkNote.className = "text-secondary";
        linkNote.style.fontSize = "var(--text-sm)";
        linkNote.style.marginTop = "-8px";
        linkNote.style.marginBottom = "var(--space-4)";
        linkNote.textContent = "Linked to meeting: \u201c" + meetingForLink.title + "\u201d (" + meetingForLink.meeting_date + ")";
        panel.appendChild(linkNote);
      }
    }

    var grid = document.createElement("div");
    grid.className = "form-grid";

    // Project select
    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project *</label>";
    var projSelect = document.createElement("select");
    var activeProjectsForDoc = data.projects.filter(function (p) {
      return !p.archived;
    });
    if (activeProjectsForDoc.length === 0) {
      var noProjOptDoc = document.createElement("option");
      noProjOptDoc.value = "";
      noProjOptDoc.textContent = "No projects yet \u2014 add one in Portfolio first";
      projSelect.appendChild(noProjOptDoc);
      projSelect.disabled = true;
    } else {
      activeProjectsForDoc.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "(unnamed project)";
        projSelect.appendChild(opt);
      });
      if (!uiState.pendingProjectId) uiState.pendingProjectId = activeProjectsForDoc[0].id;
      projSelect.value = uiState.pendingProjectId;
    }

    // Linked Activity select (Gate 10) — built before projSelect.onchange below so
    // that handler can refresh it on project change.
    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Linked Activity (optional)</label>";
    var activitySelect = document.createElement("select");
    activityOptionsFor(activitySelect, data, uiState.pendingProjectId, uiState.pendingActivityId);
    activitySelect.onchange = function () {
      uiState.pendingActivityId = activitySelect.value;
    };
    activityField.appendChild(activitySelect);

    projSelect.onchange = function () {
      uiState.pendingProjectId = projSelect.value;
      // Duplicate matching is scoped per-project (see duplicateService docs), so a
      // project change after a file's already been fingerprinted needs a re-check —
      // otherwise a stale warning (or a missed one) could carry over from the old project.
      if (uiState.pendingFile && uiState.pendingFile.hash) {
        var d = window.PCC.store.get();
        uiState.duplicateMatches = window.PCC.duplicateService.findFileDuplicates(activeDocuments(d.documents), {
          hash: uiState.pendingFile.hash,
          method: uiState.pendingFile.hashMethod,
          filename: uiState.pendingFile.name,
          size: uiState.pendingFile.size,
          projectId: uiState.pendingProjectId,
        });
        uiState.duplicateAcknowledged = false;
      }
      uiState.pendingActivityId = "";
      rerender();
    };
    projField.appendChild(projSelect);
    grid.appendChild(projField);
    grid.appendChild(activityField);

    // Category select
    var catField = document.createElement("div");
    catField.className = "field";
    catField.innerHTML = "<label>Category</label>";
    var catSelect = document.createElement("select");
    window.PCC.store.DOCUMENT_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CATEGORY_LABELS[c] || c;
      catSelect.appendChild(opt);
    });
    catSelect.value = uiState.pendingCategory;
    catSelect.onchange = function () {
      uiState.pendingCategory = catSelect.value;
    };
    catField.appendChild(catSelect);
    grid.appendChild(catField);

    panel.appendChild(grid);

    // Gate 16 (Document Control 3): classification fields, all optional, kept in their
    // own labeled sub-section below the core Project/Activity/Category grid above so
    // this doesn't read as more mandatory fields than it is.
    var classHeading = document.createElement("h4");
    classHeading.style.margin = "14px 0 var(--space-2)";
    classHeading.style.fontSize = "var(--text-sm)";
    classHeading.className = "text-secondary";
    classHeading.textContent = "Classification (optional)";
    panel.appendChild(classHeading);

    var classGrid = document.createElement("div");
    classGrid.className = "form-grid";

    var docTypeField = document.createElement("div");
    docTypeField.className = "field";
    docTypeField.innerHTML = "<label>Document Type</label>";
    var docTypeSelect = document.createElement("select");
    var noDocTypeOpt = document.createElement("option");
    noDocTypeOpt.value = "";
    noDocTypeOpt.textContent = "(none)";
    docTypeSelect.appendChild(noDocTypeOpt);
    var activeDocTypes = window.PCC.documentTypes ? window.PCC.documentTypes.activeTypes() : [];
    activeDocTypes.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name + (t.code ? " (" + t.code + ")" : "");
      docTypeSelect.appendChild(opt);
    });
    docTypeSelect.value = uiState.pendingDocumentTypeId;
    docTypeSelect.onchange = function () {
      uiState.pendingDocumentTypeId = docTypeSelect.value;
      // Suggest this type's own default criticality — still freely overridable via the
      // Criticality select below, same "suggested, not enforced" relationship Gate 15's
      // templates have with the master repository.
      var chosen = activeDocTypes.find(function (t) { return t.id === docTypeSelect.value; });
      uiState.pendingCriticality = chosen ? chosen.default_criticality : "";
      rerender();
    };
    docTypeField.appendChild(docTypeSelect);
    classGrid.appendChild(docTypeField);

    var disciplineField = document.createElement("div");
    disciplineField.className = "field";
    disciplineField.innerHTML = "<label>Discipline</label>";
    var disciplineInput = document.createElement("input");
    disciplineInput.type = "text";
    disciplineInput.value = uiState.pendingDiscipline;
    disciplineInput.oninput = function () {
      uiState.pendingDiscipline = disciplineInput.value;
    };
    // Refresh on blur (not every keystroke, matching this app's usual text-input
    // convention of not rerendering while typing) so the nomenclature notice below
    // reflects the latest value once the user tabs/clicks away.
    disciplineInput.onblur = rerender;
    disciplineField.appendChild(disciplineInput);
    classGrid.appendChild(disciplineField);

    var docNumberField = document.createElement("div");
    docNumberField.className = "field";
    docNumberField.innerHTML = "<label>Document Number</label>";
    var docNumberInput = document.createElement("input");
    docNumberInput.type = "text";
    docNumberInput.value = uiState.pendingDocumentNumber;
    docNumberInput.oninput = function () {
      uiState.pendingDocumentNumber = docNumberInput.value;
    };
    docNumberInput.onblur = rerender;
    docNumberField.appendChild(docNumberInput);
    classGrid.appendChild(docNumberField);

    var revisionField = document.createElement("div");
    revisionField.className = "field";
    revisionField.innerHTML = "<label>Revision</label>";
    var revisionInput = document.createElement("input");
    revisionInput.type = "text";
    revisionInput.value = uiState.pendingRevision;
    revisionInput.oninput = function () {
      uiState.pendingRevision = revisionInput.value;
    };
    revisionInput.onblur = rerender;
    revisionField.appendChild(revisionInput);
    classGrid.appendChild(revisionField);

    // PCC Evolution Roadmap, Tier F (Gate 19, Commitment Management): the free-text
    // `package` field above is legacy display-only now (existing documents keep
    // whatever value they already have, untouched) — new/edited documents select from
    // the shared `packages` register instead, the same one Commitments uses. See
    // newDocument()'s own comment in store.js.
    var packageField = document.createElement("div");
    packageField.className = "field";
    packageField.innerHTML = "<label>Package</label>";
    var packageSelect = document.createElement("select");
    var noPackageOpt = document.createElement("option");
    noPackageOpt.value = "";
    noPackageOpt.textContent = "(none)";
    packageSelect.appendChild(noPackageOpt);
    data.packages.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name + (p.code ? " (" + p.code + ")" : "");
      packageSelect.appendChild(opt);
    });
    packageSelect.value = uiState.pendingPackageId;
    packageSelect.onchange = function () {
      uiState.pendingPackageId = packageSelect.value;
    };
    packageField.appendChild(packageSelect);
    classGrid.appendChild(packageField);

    var contractField = document.createElement("div");
    contractField.className = "field";
    contractField.innerHTML = "<label>Contract / PO</label>";
    var contractInput = document.createElement("input");
    contractInput.type = "text";
    contractInput.value = uiState.pendingContractOrPo;
    contractInput.oninput = function () {
      uiState.pendingContractOrPo = contractInput.value;
    };
    contractField.appendChild(contractInput);
    classGrid.appendChild(contractField);

    var vendorField = document.createElement("div");
    vendorField.className = "field";
    vendorField.innerHTML = "<label>Vendor</label>";
    var vendorSelect = document.createElement("select");
    var noVendorOpt = document.createElement("option");
    noVendorOpt.value = "";
    noVendorOpt.textContent = "(none)";
    vendorSelect.appendChild(noVendorOpt);
    data.vendors.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.vendor_name || "(unnamed vendor)";
      vendorSelect.appendChild(opt);
    });
    vendorSelect.value = uiState.pendingVendorId;
    vendorSelect.onchange = function () {
      uiState.pendingVendorId = vendorSelect.value;
    };
    vendorField.appendChild(vendorSelect);
    classGrid.appendChild(vendorField);

    var priorityField = document.createElement("div");
    priorityField.className = "field";
    priorityField.innerHTML = "<label>Priority</label>";
    var prioritySelect = document.createElement("select");
    ["low", "medium", "high"].forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p;
      opt.textContent = PRIORITY_LABELS[p];
      prioritySelect.appendChild(opt);
    });
    prioritySelect.value = uiState.pendingPriority;
    prioritySelect.onchange = function () {
      uiState.pendingPriority = prioritySelect.value;
    };
    priorityField.appendChild(prioritySelect);
    classGrid.appendChild(priorityField);

    var criticalityField = document.createElement("div");
    criticalityField.className = "field";
    criticalityField.innerHTML = "<label>Criticality</label>";
    var criticalitySelect = document.createElement("select");
    var noCritOpt = document.createElement("option");
    noCritOpt.value = "";
    noCritOpt.textContent = "(not set)";
    criticalitySelect.appendChild(noCritOpt);
    window.PCC.store.DOCUMENT_TYPE_CRITICALITY_LEVELS.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CRITICALITY_LABELS[c] || c;
      criticalitySelect.appendChild(opt);
    });
    criticalitySelect.value = uiState.pendingCriticality;
    criticalitySelect.onchange = function () {
      uiState.pendingCriticality = criticalitySelect.value;
    };
    criticalityField.appendChild(criticalitySelect);
    classGrid.appendChild(criticalityField);

    var statusField = document.createElement("div");
    statusField.className = "field";
    statusField.innerHTML = "<label>Status</label>";
    var statusSelect = document.createElement("select");
    window.PCC.store.DOCUMENT_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABELS[s] || s;
      statusSelect.appendChild(opt);
    });
    statusSelect.value = uiState.pendingStatus;
    statusSelect.onchange = function () {
      uiState.pendingStatus = statusSelect.value;
    };
    statusField.appendChild(statusSelect);
    classGrid.appendChild(statusField);

    panel.appendChild(classGrid);

    var remarksField = document.createElement("div");
    remarksField.className = "field";
    remarksField.style.marginTop = "var(--space-2)";
    remarksField.innerHTML = "<label>Remarks</label>";
    var remarksArea = document.createElement("textarea");
    remarksArea.rows = 2;
    remarksArea.value = uiState.pendingRemarks;
    remarksArea.oninput = function () {
      uiState.pendingRemarks = remarksArea.value;
    };
    remarksField.appendChild(remarksArea);
    panel.appendChild(remarksField);

    // File input
    var fileField = document.createElement("div");
    fileField.className = "field";
    fileField.innerHTML = "<label>File (.xlsx, .xls, .docx, .pdf)</label>";
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".xlsx,.xls,.docx,.pdf";
    fileInput.onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) handleFileSelected(file, rerender);
    };
    fileField.appendChild(fileInput);
    panel.appendChild(fileField);

    if (uiState.readingLabel) {
      panel.appendChild(window.PCC.loadingIndicator.buildInline(uiState.readingLabel));
    }

    if (uiState.readError) {
      var err = document.createElement("p");
      err.style.color = "var(--status-critical)";
      err.style.fontSize = "var(--text-sm)";
      err.textContent = uiState.readError;
      panel.appendChild(err);
    }

    if (uiState.pendingFile) {
      var fileInfo = document.createElement("p");
      fileInfo.style.fontSize = "var(--text-sm)";
      fileInfo.style.marginTop = "var(--space-2)";
      fileInfo.innerHTML =
        "<strong>" + uiState.pendingFile.name + "</strong> \u00b7 " + formatBytes(uiState.pendingFile.size);
      panel.appendChild(fileInfo);

      if (uiState.pendingFile.size > LARGE_FILE_WARNING_BYTES) {
        var sizeWarning = document.createElement("p");
        sizeWarning.style.fontSize = "var(--text-sm)";
        sizeWarning.style.color = "var(--status-at-risk)";
        sizeWarning.style.marginTop = "var(--space-1)";
        sizeWarning.textContent =
          "This is a fairly large file. The original is stored with this document, and browsers " +
          "typically cap local storage around 5\u201310MB total \u2014 export your data soon after saving " +
          "large files so this doesn't get lost if that limit is hit.";
        panel.appendChild(sizeWarning);
      }

      if (uiState.duplicateMatches.length > 0 && !uiState.duplicateAcknowledged) {
        panel.appendChild(renderDuplicateWarning(uiState.duplicateMatches, data, rerender));
      }

      var nomenclatureNotice = renderNomenclatureNotice(data, uiState);
      if (nomenclatureNotice) panel.appendChild(nomenclatureNotice);

      if (uiState.pendingFile.extraction && uiState.pendingFile.extraction.type === "excel") {
        panel.appendChild(renderExcelPreview(uiState.pendingFile.extraction));
      } else if (
        uiState.pendingFile.extraction &&
        (uiState.pendingFile.extraction.type === "docx" || uiState.pendingFile.extraction.type === "pdf")
      ) {
        panel.appendChild(renderTextPreview(uiState.pendingFile.extraction));
      } else {
        var noExtraction = document.createElement("p");
        noExtraction.className = "text-secondary";
        noExtraction.style.fontSize = "var(--text-sm)";
        noExtraction.style.marginTop = "var(--space-2)";
        noExtraction.textContent = "No data could be extracted from this file.";
        panel.appendChild(noExtraction);
      }
    }

    // Actions
    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-4)";

    var blockedByDuplicate = uiState.duplicateMatches.length > 0 && !uiState.duplicateAcknowledged;

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = "Save Document";
    saveBtn.disabled = !uiState.pendingFile || !uiState.pendingProjectId || blockedByDuplicate;
    saveBtn.onclick = function () {
      if (!uiState.pendingFile || !uiState.pendingProjectId || blockedByDuplicate) return;

      // Strongest match only, in case multiple existing documents matched \u2014 the record
      // links to the single closest one, not a list, keeping duplicate_group_id meaningful.
      var strongestMatch = uiState.duplicateMatches.length
        ? uiState.duplicateMatches.reduce(function (best, m) {
            return !best || (m.strength === "strong" && best.strength !== "strong") ? m : best;
          }, null)
        : null;

      // Gate 17: same revision_number computation vendor_documents.js's own upload
      // handler uses \u2014 1 for a brand-new document, or one more than the highest
      // existing revision_number sharing this document_group_id for "New Revision".
      var revisionNumber = 1;
      if (uiState.pendingRevisionGroupId) {
        var siblings = data.documents.filter(function (d) {
          return d.document_group_id === uiState.pendingRevisionGroupId;
        });
        revisionNumber = 1 + siblings.reduce(function (max, d) { return Math.max(max, d.revision_number); }, 0);
      }

      var doc = window.PCC.store.newDocument({
        document_group_id: uiState.pendingRevisionGroupId || "",
        revision_number: revisionNumber,
        status: uiState.pendingStatus || "draft",
        project_id: uiState.pendingProjectId,
        activity_id: uiState.pendingActivityId || "",
        filename: uiState.pendingFile.name,
        category: uiState.pendingCategory,
        file_size: uiState.pendingFile.size,
        mime_type: uiState.pendingFile.type,
        extraction: uiState.pendingFile.extraction,
        file_data: null,
        meeting_id: uiState.pendingMeetingId || "",
        content_hash: uiState.pendingFile.hash || null,
        hash_method: uiState.pendingFile.hashMethod || null,
        is_duplicate: !!strongestMatch,
        original_record_id: strongestMatch ? strongestMatch.record.id : null,
        duplicate_reason: strongestMatch ? strongestMatch.reason : null,
        duplicate_group_id: strongestMatch
          ? strongestMatch.record.duplicate_group_id || window.PCC.duplicateService.newGroupId()
          : null,
        document_type_id: uiState.pendingDocumentTypeId || "",
        discipline: uiState.pendingDiscipline || "",
        document_number: uiState.pendingDocumentNumber || "",
        revision: uiState.pendingRevision || "00",
        package_id: uiState.pendingPackageId || "",
        contract_or_po: uiState.pendingContractOrPo || "",
        vendor_id: uiState.pendingVendorId || "",
        priority: uiState.pendingPriority || "medium",
        criticality: uiState.pendingCriticality || "",
        remarks: uiState.pendingRemarks || "",
      });

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving\u2026";

      window.PCC.blobStore
        .putBlob(doc.id, uiState.pendingFile.fileData)
        .then(function () {
          window.PCC.store.update(function (d) {
            d.documents.push(doc);
            // Back-fill the matched original with the same group id, if it didn't
            // already have one \u2014 so both ends of the pair are findable as a group later
            // (search filters / grouped views), not just the new record pointing backward.
            if (strongestMatch && !strongestMatch.record.duplicate_group_id) {
              var original = d.documents.find(function (item) {
                return item.id === strongestMatch.record.id;
              });
              if (original) original.duplicate_group_id = doc.duplicate_group_id;
            }
            if (doc.project_id) {
              var proj = d.projects.find(function (p) {
                return p.id === doc.project_id;
              });
              if (proj) {
                if (!proj.attachments) proj.attachments = [];
                proj.attachments.push(doc.id);
              }
            }
          });

          window.PCC.notify("Document saved \u2014 the original file is stored with it. Export soon to back it up.", "success");

          uiState.formOpen = false;
          uiState.pendingFile = null;
          uiState.pendingProjectId = "";
          uiState.pendingActivityId = "";
          uiState.pendingCategory = "contract";
          uiState.pendingMeetingId = "";
          uiState.duplicateMatches = [];
          uiState.duplicateAcknowledged = false;
          resetPendingClassification();
          rerender();
        })
        .catch(function (e) {
          window.PCC.notify("Could not store the file: " + e.message, "error");
          saveBtn.disabled = false;
          saveBtn.textContent = "Save Document";
        });
    };

    var cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.formOpen = false;
      uiState.pendingFile = null;
      uiState.pendingMeetingId = "";
      uiState.readError = null;
      uiState.duplicateMatches = [];
      uiState.duplicateAcknowledged = false;
      resetPendingClassification();
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    panel.appendChild(actions);

    container.appendChild(panel);
  }

  var BULK_STATUS_LABELS = {
    scanning: "Scanning…",
    ready: "Ready",
    duplicate: "Possible duplicate",
    error: "Error",
  };

  /** PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Bulk Import panel.
   * Master upgrade prompt Section 22's own worked example (pick a project, category,
   * tags/discipline once for the whole batch, review a preview, confirm) drives this
   * layout — see commitBulkImport()/scanBulkImportFiles() above for the actual
   * SELECT->SCAN->HASH->DUPLICATE CHECK->CONFIRM->IMPORT->PROGRESS->SUMMARY pipeline
   * this panel drives. */
  function renderBulkImportPanel(container, data, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-2)";
    heading.textContent = "Bulk Import";
    panel.appendChild(heading);

    var subtext = document.createElement("p");
    subtext.className = "text-secondary";
    subtext.style.fontSize = "var(--text-sm)";
    subtext.style.marginBottom = "var(--space-4)";
    subtext.textContent =
      "Import many files at once, all assigned to the same project. Each file is checked for " +
      "duplicates against this project's existing documents before import — a possible duplicate " +
      "is still imported and flagged, never silently skipped, so you can review it afterward.";
    panel.appendChild(subtext);

    var activeProjectsForBulk = data.projects.filter(function (p) {
      return !p.archived;
    });

    var grid = document.createElement("div");
    grid.className = "form-grid";

    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project *</label>";
    var projSelect = document.createElement("select");
    if (activeProjectsForBulk.length === 0) {
      var noProjOpt = document.createElement("option");
      noProjOpt.value = "";
      noProjOpt.textContent = "No projects yet — add one in Portfolio first";
      projSelect.appendChild(noProjOpt);
      projSelect.disabled = true;
    } else {
      activeProjectsForBulk.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "(unnamed project)";
        projSelect.appendChild(opt);
      });
      if (!uiState.bulkImportProjectId) uiState.bulkImportProjectId = activeProjectsForBulk[0].id;
      projSelect.value = uiState.bulkImportProjectId;
    }
    projSelect.onchange = function () {
      uiState.bulkImportProjectId = projSelect.value;
      // Duplicate matching is scoped per-project — a project change after files are
      // already hashed needs every entry re-checked, same reasoning the single-upload
      // form's own projSelect.onchange already documents.
      var d = window.PCC.store.get();
      uiState.bulkImportFiles.forEach(function (entry) {
        if (entry.status === "scanning" || entry.status === "error" || !entry.hash) return;
        var matches = window.PCC.duplicateService.findFileDuplicates(activeDocuments(d.documents), {
          hash: entry.hash,
          method: entry.hashMethod,
          filename: entry.name,
          size: entry.size,
          projectId: uiState.bulkImportProjectId,
        });
        entry.duplicateMatch = matches.length
          ? matches.reduce(function (best, m) {
              return !best || (m.strength === "strong" && best.strength !== "strong") ? m : best;
            }, null)
          : null;
        entry.status = entry.duplicateMatch ? "duplicate" : "ready";
      });
      rerender();
    };
    projField.appendChild(projSelect);
    grid.appendChild(projField);

    var catField = document.createElement("div");
    catField.className = "field";
    catField.innerHTML = "<label>Category (applied to every file)</label>";
    var catSelect = document.createElement("select");
    window.PCC.store.DOCUMENT_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CATEGORY_LABELS[c] || c;
      catSelect.appendChild(opt);
    });
    catSelect.value = uiState.bulkImportCategory;
    catSelect.onchange = function () {
      uiState.bulkImportCategory = catSelect.value;
    };
    catField.appendChild(catSelect);
    grid.appendChild(catField);

    var disciplineField = document.createElement("div");
    disciplineField.className = "field";
    disciplineField.innerHTML = "<label>Discipline (applied to every file, optional)</label>";
    var disciplineInput = document.createElement("input");
    disciplineInput.type = "text";
    disciplineInput.value = uiState.bulkImportDiscipline;
    disciplineInput.oninput = function () {
      uiState.bulkImportDiscipline = disciplineInput.value;
    };
    disciplineField.appendChild(disciplineInput);
    grid.appendChild(disciplineField);

    panel.appendChild(grid);

    // ---- Drop zone + file pickers ----
    var dropZone = document.createElement("div");
    dropZone.className = "panel";
    dropZone.style.border = "2px dashed var(--border-default, #444)";
    dropZone.style.textAlign = "center";
    dropZone.style.padding = "var(--space-5)";
    dropZone.style.marginTop = "var(--space-3)";
    dropZone.style.marginBottom = "var(--space-3)";
    dropZone.textContent = "Drag and drop files here, or use the buttons below.";
    dropZone.ondragover = function (e) {
      e.preventDefault();
    };
    dropZone.ondrop = function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        scanBulkImportFiles(e.dataTransfer.files, rerender);
      }
    };
    panel.appendChild(dropZone);

    var pickerRow = document.createElement("div");
    pickerRow.style.display = "flex";
    pickerRow.style.gap = "var(--space-3)";
    pickerRow.style.marginBottom = "var(--space-3)";

    var filesInput = document.createElement("input");
    filesInput.type = "file";
    filesInput.multiple = true;
    filesInput.style.display = "none";
    filesInput.onchange = function (e) {
      if (e.target.files && e.target.files.length) scanBulkImportFiles(e.target.files, rerender);
      filesInput.value = "";
    };
    var chooseFilesBtn = document.createElement("button");
    chooseFilesBtn.className = "btn btn--ghost";
    chooseFilesBtn.textContent = "Choose Files";
    chooseFilesBtn.onclick = function () {
      filesInput.click();
    };

    // Folder import: a plain HTML input attribute (webkitdirectory), not the File
    // System Access API this project deliberately avoids (see CLAUDE.md) — supported by
    // desktop browsers/Electron; Android WebViews that don't support it simply fall back
    // to a normal multi-file picker, so this never blocks anything, it's purely additive.
    var folderInput = document.createElement("input");
    folderInput.type = "file";
    folderInput.multiple = true;
    folderInput.webkitdirectory = true;
    folderInput.style.display = "none";
    folderInput.onchange = function (e) {
      if (e.target.files && e.target.files.length) scanBulkImportFiles(e.target.files, rerender);
      folderInput.value = "";
    };
    var chooseFolderBtn = document.createElement("button");
    chooseFolderBtn.className = "btn btn--ghost";
    chooseFolderBtn.textContent = "Choose Folder";
    chooseFolderBtn.onclick = function () {
      folderInput.click();
    };

    pickerRow.appendChild(chooseFilesBtn);
    pickerRow.appendChild(filesInput);
    pickerRow.appendChild(chooseFolderBtn);
    pickerRow.appendChild(folderInput);
    panel.appendChild(pickerRow);

    // ---- Preview: per-file status ----
    if (uiState.bulkImportFiles.length > 0) {
      var totalCount = uiState.bulkImportFiles.length;
      var readyCount = uiState.bulkImportFiles.filter(function (e) { return e.status === "ready"; }).length;
      var duplicateCount = uiState.bulkImportFiles.filter(function (e) { return e.status === "duplicate"; }).length;
      var errorCount = uiState.bulkImportFiles.filter(function (e) { return e.status === "error"; }).length;
      var scanningCount = uiState.bulkImportFiles.filter(function (e) { return e.status === "scanning"; }).length;
      var totalSize = uiState.bulkImportFiles.reduce(function (sum, e) { return sum + (e.size || 0); }, 0);

      var summaryLine = document.createElement("p");
      summaryLine.style.fontSize = "var(--text-sm)";
      summaryLine.style.marginBottom = "var(--space-2)";
      summaryLine.innerHTML =
        "<strong>" + totalCount + "</strong> file" + (totalCount === 1 ? "" : "s") + " selected (" + formatBytes(totalSize) + ") — " +
        readyCount + " ready · " + duplicateCount + " possible duplicate" + (duplicateCount === 1 ? "" : "s") +
        (errorCount ? " · " + errorCount + " error" + (errorCount === 1 ? "" : "s") : "") +
        (scanningCount ? " · " + scanningCount + " scanning…" : "");
      panel.appendChild(summaryLine);

      var list = document.createElement("div");
      list.className = "project-list";
      list.style.maxHeight = "320px";
      list.style.overflowY = "auto";
      uiState.bulkImportFiles.forEach(function (entry, index) {
        var row = document.createElement("div");
        row.className = "detail-card";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.marginBottom = "var(--space-2)";

        var main = document.createElement("div");
        var statusNote =
          entry.status === "duplicate" && entry.duplicateMatch
            ? " — matches “" + entry.duplicateMatch.record.filename + "” (" + entry.duplicateMatch.reason + ")"
            : entry.status === "error"
            ? " — " + entry.errorMessage
            : "";
        main.innerHTML =
          "<strong>" + entry.name + "</strong> · " + formatBytes(entry.size) +
          "<br/><span class='text-secondary' style='font-size:12px;'>" +
          (BULK_STATUS_LABELS[entry.status] || entry.status) + statusNote +
          "</span>";
        row.appendChild(main);

        var removeBtn = document.createElement("button");
        removeBtn.className = "btn btn--ghost";
        removeBtn.textContent = "Remove";
        removeBtn.disabled = !!uiState.bulkImportProgress;
        removeBtn.onclick = function () {
          removeBulkImportFile(index, rerender);
        };
        row.appendChild(removeBtn);

        list.appendChild(row);
      });
      panel.appendChild(list);
    }

    if (uiState.bulkImportProgress) {
      var progressLine = document.createElement("p");
      progressLine.style.fontSize = "var(--text-sm)";
      progressLine.style.marginTop = "var(--space-3)";
      progressLine.textContent = "Importing " + uiState.bulkImportProgress.done + " of " + uiState.bulkImportProgress.total + "…";
      panel.appendChild(progressLine);
    }

    if (uiState.bulkImportSummary) {
      var s = uiState.bulkImportSummary;
      var summaryPanel = document.createElement("p");
      summaryPanel.style.fontSize = "var(--text-sm)";
      summaryPanel.style.marginTop = "var(--space-3)";
      summaryPanel.innerHTML =
        "<strong>Import complete:</strong> " + s.imported + " imported" +
        (s.duplicates ? " (" + s.duplicates + " flagged as possible duplicates)" : "") +
        (s.errors ? " · " + s.errors + " failed" : "") +
        (s.skipped ? " · " + s.skipped + " skipped (still scanning or errored)" : "") + ".";
      panel.appendChild(summaryPanel);
    }

    // ---- Actions ----
    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-4)";

    var importableCount = uiState.bulkImportFiles.filter(function (e) {
      return e.status === "ready" || e.status === "duplicate";
    }).length;

    var importBtn = document.createElement("button");
    importBtn.className = "btn btn--primary";
    importBtn.textContent = uiState.bulkImportProgress ? "Importing…" : "Import " + importableCount + " File" + (importableCount === 1 ? "" : "s");
    importBtn.disabled = !uiState.bulkImportProjectId || importableCount === 0 || !!uiState.bulkImportProgress;
    importBtn.onclick = function () {
      commitBulkImport(rerender);
    };
    actions.appendChild(importBtn);

    var cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Close";
    cancelBtn.disabled = !!uiState.bulkImportProgress;
    cancelBtn.onclick = function () {
      resetBulkImportState();
      rerender();
    };
    actions.appendChild(cancelBtn);

    panel.appendChild(actions);
    container.appendChild(panel);
  }

  /** Reconstructs the original file from its stored data and opens/downloads it.
   * PDFs typically render inline in a new tab; Word/Excel files typically download,
   * since browsers don't natively render those — that's normal, not a bug.
   * The data itself may be inline on `doc.file_data` (a legacy record predating the
   * IndexedDB migration) or need fetching by id from IndexedDB — blobStore.resolve()
   * handles that dual-path lookup so this function doesn't need to know or care which. */
  function openStoredFile(doc) {
    window.PCC.loadingIndicator.show("Opening file…");
    window.PCC.blobStore
      .resolve(doc.id, doc.file_data)
      .then(function (fileData) {
        window.PCC.loadingIndicator.hide();
        if (!fileData) {
          window.PCC.notify("No original file was stored for this document.", "warning");
          return;
        }
        var commaIdx = fileData.indexOf(",");
        var meta = fileData.slice(0, commaIdx);
        var b64 = fileData.slice(commaIdx + 1);
        var mimeMatch = /data:(.*);base64/.exec(meta);
        var mime = mimeMatch ? mimeMatch[1] : doc.mime_type || "application/octet-stream";
        var binary = atob(b64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var blob = new Blob([bytes], { type: mime });
        window.PCC.fileViewer.open({ filename: doc.filename, mimeType: mime, blob: blob });
      })
      .catch(function (e) {
        window.PCC.loadingIndicator.hide();
        window.PCC.notify("Could not open this file: " + e.message, "error");
      });
  }

  function extractionSummary(extraction) {
    if (!extraction) return "No data extracted";
    if (extraction.type === "excel") {
      return "Data extracted (" + extraction.rows.length + " row" + (extraction.rows.length === 1 ? "" : "s") + ")";
    }
    return "Text extracted (" + extraction.char_count.toLocaleString() + " chars" + (extraction.page_count ? ", " + extraction.page_count + " pages" : "") + ")";
  }

  /** UI/UX Overhaul Gate 6 (Documents): the old renderDocumentRow()/renderDocumentEntry()
   * pair crammed every field (project/size/date/meeting/activity/type/discipline/number+
   * revision/vendor/package/revision-number) into one dense meta line, plus up to 7
   * action buttons — the "expose every database field" pattern the brief calls out.
   * Split into a compact list row (renderDocumentListItem, left pane) and a full-detail
   * preview pane (renderDocumentPreviewPanel, right pane) per the brief's own "Document
   * Experience" section. All business logic below (status edit, delete-with-confirm,
   * new-revision prefill, history expand, extraction preview) is copied verbatim from
   * the old renderDocumentRow — only WHERE it renders changed. */

  function selectDocument(docId) {
    uiState.selectedDocId = docId;
    uiState.previewExtractionExpanded = false;
  }

  // Daily-Use Audit Phase 3 (bulk actions). Delete Selected replicates the single-entry
  // Delete button's own behavior exactly (see its own comment further below): it removes
  // an entire revision history, not just the latest row, and cleans up project
  // attachments + blobStore the same way — a bulk delete that only dropped the latest
  // revision row would silently orphan older revisions.
  function renderDocumentBulkBar(data, filtered, rerender, trashMode) {
    var n = Object.keys(uiState.selectedIds).length;
    if (n === 0) return null;
    var noun = n === 1 ? "document" : "documents";

    function selectedDocs() {
      return filtered.filter(function (doc) {
        return uiState.selectedIds[doc.id];
      });
    }

    function clearSelection() {
      uiState.selectedIds = {};
    }

    var bar = document.createElement("div");
    bar.className = "bulk-action-bar";

    // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash view's own
    // bulk bar is deliberately just Restore/Delete Permanently/Clear — Approve/Reject
    // don't apply to a trashed document, it's not part of the active workflow anymore.
    if (trashMode) {
      var countElTrash = document.createElement("span");
      countElTrash.className = "bulk-action-bar__count";
      countElTrash.textContent = n + " selected";
      bar.appendChild(countElTrash);

      var restoreSelectedBtn = document.createElement("button");
      restoreSelectedBtn.className = "btn btn--primary";
      restoreSelectedBtn.textContent = "Restore Selected";
      restoreSelectedBtn.onclick = function () {
        selectedDocs().forEach(function (doc) {
          restoreDocumentGroup(doc.document_group_id);
        });
        window.PCC.notify(n + " " + noun + " restored.", "success");
        clearSelection();
        rerender();
      };
      bar.appendChild(restoreSelectedBtn);

      var spacerTrash = document.createElement("div");
      spacerTrash.className = "bulk-action-bar__spacer";
      bar.appendChild(spacerTrash);

      var clearBtnTrash = document.createElement("button");
      clearBtnTrash.className = "btn btn--ghost";
      clearBtnTrash.textContent = "Clear Selection";
      clearBtnTrash.onclick = function () {
        clearSelection();
        rerender();
      };
      bar.appendChild(clearBtnTrash);

      var permanentDeleteSelectedBtn = document.createElement("button");
      permanentDeleteSelectedBtn.className = "btn btn--ghost";
      permanentDeleteSelectedBtn.textContent = "Delete Selected Permanently";
      permanentDeleteSelectedBtn.onclick = function () {
        var docs = selectedDocs();
        var totalRevisions = 0;
        docs.forEach(function (doc) {
          totalRevisions += revisionsFor(data.documents, doc.document_group_id).length;
        });
        if (!window.confirm(
          "Permanently delete " + n + " selected " + noun + " (" + totalRevisions + " total revision" + (totalRevisions === 1 ? "" : "s") +
          ")? This removes every stored file and extracted data. This CANNOT be undone."
        )) return;
        Promise.all(docs.map(function (doc) { return permanentlyDeleteDocumentGroup(data.documents, doc.document_group_id); })).then(function (deletedIdLists) {
          var allIds = [].concat.apply([], deletedIdLists);
          if (allIds.indexOf(uiState.selectedDocId) !== -1) selectDocument(null);
          window.PCC.notify(n + " " + noun + " permanently deleted.", "info");
          clearSelection();
          rerender();
        });
      };
      bar.appendChild(permanentDeleteSelectedBtn);

      return bar;
    }

    var countEl = document.createElement("span");
    countEl.className = "bulk-action-bar__count";
    countEl.textContent = n + " selected";
    bar.appendChild(countEl);

    var approveBtn = document.createElement("button");
    approveBtn.className = "btn btn--ghost";
    approveBtn.textContent = "Approve Selected";
    approveBtn.onclick = function () {
      window.PCC.store.update(function (d) {
        d.documents.forEach(function (item) {
          if (uiState.selectedIds[item.id]) item.status = "approved";
        });
      });
      window.PCC.notify(n + " " + noun + " marked approved.", "success");
      clearSelection();
      rerender();
    };
    bar.appendChild(approveBtn);

    var rejectBtn = document.createElement("button");
    rejectBtn.className = "btn btn--ghost";
    rejectBtn.textContent = "Reject Selected";
    rejectBtn.onclick = function () {
      window.PCC.store.update(function (d) {
        d.documents.forEach(function (item) {
          if (uiState.selectedIds[item.id]) item.status = "rejected";
        });
      });
      window.PCC.notify(n + " " + noun + " marked rejected.", "success");
      clearSelection();
      rerender();
    };
    bar.appendChild(rejectBtn);

    var spacer = document.createElement("div");
    spacer.className = "bulk-action-bar__spacer";
    bar.appendChild(spacer);

    var clearBtn = document.createElement("button");
    clearBtn.className = "btn btn--ghost";
    clearBtn.textContent = "Clear Selection";
    clearBtn.onclick = function () {
      clearSelection();
      rerender();
    };
    bar.appendChild(clearBtn);

    // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash/Recycle
    // Bin — moves the whole selected batch's revision groups to trash instead of
    // permanently removing them, same as the single-document Delete button.
    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete Selected";
    deleteBtn.onclick = function () {
      var docs = selectedDocs();
      var totalRevisions = 0;
      docs.forEach(function (doc) {
        totalRevisions += revisionsFor(data.documents, doc.document_group_id).length;
      });
      if (!window.confirm(
        "Move " + n + " selected " + noun + " (" + totalRevisions + " total revision" + (totalRevisions === 1 ? "" : "s") +
        ") to Trash? You can restore them later from the Trash view."
      )) return;
      docs.forEach(function (doc) {
        trashDocumentGroup(doc.document_group_id);
      });
      window.PCC.notify(n + " " + noun + " moved to Trash.", "info");
      clearSelection();
      rerender();
    };
    bar.appendChild(deleteBtn);

    return bar;
  }

  function renderDocumentListItem(doc, data, isSelected, onSelect, onBulkChanged, trashMode) {
    var item = document.createElement("div");
    item.className = "doc-register-item" + (isSelected ? " doc-register-item--selected" : "");
    item.onclick = onSelect;

    // Daily-Use Audit Phase 3 (bulk actions). stopPropagation keeps a checkbox click
    // from also triggering the row's own onclick (which would switch the preview pane).
    var selectBox = document.createElement("input");
    selectBox.type = "checkbox";
    selectBox.className = "doc-register-item__select";
    selectBox.setAttribute("aria-label", "Select this document for a bulk action");
    selectBox.checked = !!uiState.selectedIds[doc.id];
    selectBox.onclick = function (e) {
      e.stopPropagation();
    };
    selectBox.onchange = function () {
      if (selectBox.checked) uiState.selectedIds[doc.id] = true;
      else delete uiState.selectedIds[doc.id];
      onBulkChanged();
    };
    item.appendChild(selectBox);

    var name = document.createElement("div");
    name.className = "doc-register-item__name";
    name.textContent = doc.filename;
    item.appendChild(name);

    var meta = document.createElement("div");
    meta.className = "doc-register-item__meta";
    meta.textContent =
      projectName(data, doc.project_id) +
      (doc.document_number ? " · " + doc.document_number + (doc.revision ? " Rev " + doc.revision : "") : "");
    item.appendChild(meta);

    var badges = document.createElement("div");
    badges.className = "doc-register-item__badges";
    var catBadge = document.createElement("span");
    catBadge.className = "status-badge status-badge--complete";
    catBadge.textContent = CATEGORY_LABELS[doc.category] || doc.category;
    badges.appendChild(catBadge);
    var statusBadge = document.createElement("span");
    statusBadge.className = "status-badge status-badge--info";
    statusBadge.textContent = STATUS_LABELS[doc.status] || doc.status;
    badges.appendChild(statusBadge);
    if (doc.is_duplicate) {
      var dupBadge = document.createElement("span");
      dupBadge.className = "status-badge status-badge--at_risk";
      dupBadge.textContent = "Possible Duplicate";
      dupBadge.title = doc.duplicate_reason || "Flagged as a possible duplicate at upload time.";
      badges.appendChild(dupBadge);
    }
    if (trashMode && doc.trashed_at) {
      var trashedBadge = document.createElement("span");
      trashedBadge.className = "status-badge status-badge--warning";
      trashedBadge.textContent = trashedAgoLabel(doc.trashed_at);
      badges.appendChild(trashedBadge);
    }
    item.appendChild(badges);

    return item;
  }

  function renderDocumentPreviewPanel(doc, data, onChanged, trashMode) {
    var panel = document.createElement("div");
    panel.className = "panel doc-register-preview";

    // Gate 17 (Document Control 4): version control. `doc` is always the latest
    // revision (see render()'s use of latestDocuments()) — allRevisions is every row
    // sharing its document_group_id, newest first, doc itself always allRevisions[0].
    var allRevisions = revisionsFor(data.documents, doc.document_group_id);

    var linkedMeeting = doc.meeting_id
      ? data.meetings.find(function (m) { return m.id === doc.meeting_id; })
      : null;
    var linkedActivity = doc.activity_id
      ? data.activities.find(function (a) { return a.id === doc.activity_id; })
      : null;
    var linkedDocType = doc.document_type_id
      ? data.document_types.find(function (t) { return t.id === doc.document_type_id; })
      : null;
    var linkedVendor = doc.vendor_id
      ? data.vendors.find(function (v) { return v.id === doc.vendor_id; })
      : null;
    var linkedPackage = doc.package_id
      ? data.packages.find(function (p) { return p.id === doc.package_id; })
      : null;

    var header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "flex-start";
    header.style.marginBottom = "var(--space-3)";
    var titleWrap = document.createElement("div");
    titleWrap.innerHTML = "<h3 style='margin-bottom:2px;word-break:break-word;'>" + esc(doc.filename) + "</h3>";
    header.appendChild(titleWrap);
    var headerBadges = document.createElement("div");
    headerBadges.style.display = "flex";
    headerBadges.style.gap = "var(--space-2)";
    headerBadges.style.flexShrink = "0";
    var catBadge = document.createElement("span");
    catBadge.className = "status-badge status-badge--complete";
    catBadge.textContent = CATEGORY_LABELS[doc.category] || doc.category;
    headerBadges.appendChild(catBadge);
    if (doc.is_duplicate) {
      var dupBadge = document.createElement("span");
      dupBadge.className = "status-badge status-badge--at_risk";
      dupBadge.textContent = "Possible Duplicate";
      dupBadge.title = doc.duplicate_reason || "Flagged as a possible duplicate at upload time.";
      headerBadges.appendChild(dupBadge);
    }
    if (trashMode && doc.trashed_at) {
      var trashedHeaderBadge = document.createElement("span");
      trashedHeaderBadge.className = "status-badge status-badge--warning";
      trashedHeaderBadge.textContent = trashedAgoLabel(doc.trashed_at);
      headerBadges.appendChild(trashedHeaderBadge);
    }
    header.appendChild(headerBadges);
    panel.appendChild(header);

    // Gate 17: status is editable right here — a document's lifecycle state is expected
    // to change over time without reopening the whole classification form, same "quick
    // toggle, no separate save step" convention as Document Types' Deactivate button.
    var statusRow = document.createElement("div");
    statusRow.style.marginBottom = "var(--space-4)";
    var statusLabel = document.createElement("label");
    statusLabel.className = "detail-item__label";
    statusLabel.textContent = "STATUS";
    statusRow.appendChild(statusLabel);
    var statusSelect = document.createElement("select");
    statusSelect.style.display = "block";
    statusSelect.style.marginTop = "var(--space-1)";
    window.PCC.store.DOCUMENT_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABELS[s] || s;
      statusSelect.appendChild(opt);
    });
    statusSelect.value = doc.status;
    statusSelect.onchange = function () {
      window.PCC.store.update(function (d) {
        var existing = d.documents.find(function (item) { return item.id === doc.id; });
        if (existing) existing.status = statusSelect.value;
      });
      onChanged();
    };
    statusRow.appendChild(statusSelect);
    panel.appendChild(statusRow);

    var grid = document.createElement("div");
    grid.className = "detail-grid";
    function item(label, value) {
      var div = document.createElement("div");
      div.innerHTML = "<span class='detail-item__label'>" + esc(label) + "</span><div>" + (value === null || value === undefined || value === "" ? "—" : esc(value)) + "</div>";
      grid.appendChild(div);
    }
    item("Project", projectName(data, doc.project_id));
    item("Size", formatBytes(doc.file_size));
    item("Uploaded", new Date(doc.uploaded_at).toLocaleDateString());
    item("Revision", doc.revision_number);
    if (linkedDocType) item("Type", linkedDocType.name);
    if (doc.discipline) item("Discipline", doc.discipline);
    if (doc.document_number) item("Document No.", doc.document_number + (doc.revision ? " Rev " + doc.revision : ""));
    if (linkedVendor) item("Vendor", linkedVendor.vendor_name || "(unnamed vendor)");
    if (linkedPackage) item("Package", linkedPackage.name);
    if (linkedMeeting) item("From Meeting", linkedMeeting.title || "(untitled)");
    if (linkedActivity) item("Linked Activity", linkedActivity.name);
    panel.appendChild(grid);

    var extractionNote = document.createElement("p");
    extractionNote.className = "text-secondary";
    extractionNote.style.fontSize = "var(--text-sm)";
    extractionNote.style.margin = "var(--space-4) 0 0";
    extractionNote.textContent = extractionSummary(doc.extraction);
    panel.appendChild(extractionNote);

    var actions = document.createElement("div");
    actions.className = "project-card__actions";
    actions.style.marginTop = "var(--space-4)";
    if (doc.extraction) {
      var viewBtn = document.createElement("button");
      viewBtn.className = "btn btn--ghost";
      viewBtn.textContent = uiState.previewExtractionExpanded ? "Hide Extracted Data" : "View Extracted Data";
      viewBtn.onclick = function () {
        uiState.previewExtractionExpanded = !uiState.previewExtractionExpanded;
        onChanged();
      };
      actions.appendChild(viewBtn);
    }
    // Always shown, not gated on doc.file_data — every saved document is expected to
    // have a stored file (the save flow writes the blob before the metadata record even
    // exists), and openStoredFile()/blobStore.resolve() already handle a genuinely
    // missing blob gracefully with its own warning notification.
    var openBtn = document.createElement("button");
    openBtn.className = "btn btn--ghost";
    openBtn.textContent = "Open File";
    openBtn.onclick = function () {
      openStoredFile(doc);
    };
    actions.appendChild(openBtn);
    if (linkedMeeting) {
      var viewMeetingBtn = document.createElement("button");
      viewMeetingBtn.className = "btn btn--ghost";
      viewMeetingBtn.textContent = "View Meeting";
      viewMeetingBtn.onclick = function () {
        if (window.PCC.meetings) window.PCC.meetings.expandMeeting(linkedMeeting.id);
        window.PCC.router.go("meetings");
      };
      actions.appendChild(viewMeetingBtn);
    }
    if (linkedVendor) {
      var viewVendorBtn = document.createElement("button");
      viewVendorBtn.className = "btn btn--ghost";
      viewVendorBtn.textContent = "View Vendor";
      viewVendorBtn.onclick = function () {
        if (window.PCC.vendors) window.PCC.vendors.openProfile(linkedVendor.id);
        window.PCC.router.go("vendors");
      };
      actions.appendChild(viewVendorBtn);
    }
    if (linkedActivity) {
      var viewActivityBtn = document.createElement("button");
      viewActivityBtn.className = "btn btn--ghost";
      viewActivityBtn.textContent = "View in Gantt";
      viewActivityBtn.onclick = function () {
        if (window.PCC.schedule) window.PCC.schedule.viewActivity(doc.project_id, linkedActivity.schedule_id, linkedActivity.id);
        window.PCC.router.go("schedule");
      };
      actions.appendChild(viewActivityBtn);
    }

    if (trashMode) {
      // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash view —
      // New Revision/History don't apply to a trashed document (it's not the active
      // register), just Restore and the one place a permanent, unrecoverable delete
      // is still reachable.
      var restoreBtn = document.createElement("button");
      restoreBtn.className = "btn btn--primary";
      restoreBtn.textContent = "Restore";
      restoreBtn.onclick = function () {
        restoreDocumentGroup(doc.document_group_id);
        window.PCC.notify(
          allRevisions.length > 1 ? "Document and its revision history restored." : "Document restored.",
          "success"
        );
        onChanged();
      };
      actions.appendChild(restoreBtn);

      var permanentDeleteBtn = document.createElement("button");
      permanentDeleteBtn.className = "btn btn--ghost";
      permanentDeleteBtn.textContent = "Delete Permanently";
      permanentDeleteBtn.onclick = function () {
        var warning =
          allRevisions.length > 1
            ? "Permanently delete “" + doc.filename + "” and all " + allRevisions.length + " of its revisions? This removes every stored file and extracted data in this revision history. This CANNOT be undone."
            : "Permanently delete “" + doc.filename + "”? This removes the stored file and extracted data. This CANNOT be undone.";
        if (!window.confirm(warning)) return;
        permanentlyDeleteDocumentGroup(data.documents, doc.document_group_id).then(function (allRevisionIds) {
          if (allRevisionIds.indexOf(uiState.selectedDocId) !== -1) selectDocument(null);
          window.PCC.notify(allRevisions.length > 1 ? "Document and its revision history permanently deleted." : "Document permanently deleted.", "info");
          onChanged();
        });
      };
      actions.appendChild(permanentDeleteBtn);
    } else {
      // Gate 17: "New Revision" opens the upload form pre-filled from this (the latest)
      // revision's own classification, carrying document_group_id forward so Save
      // computes the next revision_number instead of starting a new group.
      var newRevisionBtn = document.createElement("button");
      newRevisionBtn.className = "btn btn--ghost";
      newRevisionBtn.textContent = "New Revision";
      newRevisionBtn.onclick = function () {
        uiState.formOpen = true;
        uiState.pendingFile = null;
        uiState.readError = null;
        uiState.duplicateMatches = [];
        uiState.duplicateAcknowledged = false;
        uiState.pendingProjectId = doc.project_id;
        uiState.pendingActivityId = doc.activity_id || "";
        uiState.pendingCategory = doc.category;
        uiState.pendingDocumentTypeId = doc.document_type_id || "";
        uiState.pendingDiscipline = doc.discipline || "";
        uiState.pendingDocumentNumber = doc.document_number || "";
        uiState.pendingRevision = doc.revision || "00";
        uiState.pendingPackageId = doc.package_id || "";
        uiState.pendingContractOrPo = doc.contract_or_po || "";
        uiState.pendingVendorId = doc.vendor_id || "";
        uiState.pendingPriority = doc.priority || "medium";
        uiState.pendingCriticality = doc.criticality || "";
        uiState.pendingRemarks = doc.remarks || "";
        // A new revision hasn't been reviewed yet, regardless of where the previous one
        // ended up — never carries over "approved"/"rejected" from the prior revision.
        uiState.pendingStatus = "draft";
        uiState.pendingRevisionGroupId = doc.document_group_id;
        onChanged();
      };
      actions.appendChild(newRevisionBtn);

      if (allRevisions.length > 1) {
        var historyBtn = document.createElement("button");
        historyBtn.className = "btn btn--ghost";
        historyBtn.textContent = "History (" + allRevisions.length + ")";
        historyBtn.onclick = function () {
          uiState.expandedRevisionsGroupId = uiState.expandedRevisionsGroupId === doc.document_group_id ? null : doc.document_group_id;
          onChanged();
        };
        actions.appendChild(historyBtn);
      }

      // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash/Recycle
      // Bin. "Delete" now moves the whole revision group to trash (record + blob both
      // stay fully intact) instead of permanently removing it — see trashDocumentGroup()'s
      // own header comment. Permanent deletion is a separate, more strongly worded action
      // reachable only from the Trash view.
      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        var warning =
          allRevisions.length > 1
            ? "Move “" + doc.filename + "” and all " + allRevisions.length + " of its revisions to Trash? You can restore it later from the Trash view."
            : "Move “" + doc.filename + "” to Trash? You can restore it later from the Trash view.";
        if (!window.confirm(warning)) return;
        trashDocumentGroup(doc.document_group_id);
        if (uiState.expandedRevisionsGroupId === doc.document_group_id) uiState.expandedRevisionsGroupId = null;
        window.PCC.notify(allRevisions.length > 1 ? "Document and its revision history moved to Trash." : "Document moved to Trash.", "info");
        onChanged();
      };
      actions.appendChild(deleteBtn);
    }
    panel.appendChild(actions);

    if (uiState.previewExtractionExpanded && doc.extraction) {
      var extractionWrap = document.createElement("div");
      extractionWrap.className = "project-details";
      extractionWrap.style.marginTop = "var(--space-4)";
      extractionWrap.appendChild(
        doc.extraction.type === "excel" ? renderExcelPreview(doc.extraction) : renderTextPreview(doc.extraction)
      );
      panel.appendChild(extractionWrap);
    }

    if (uiState.expandedRevisionsGroupId === doc.document_group_id && allRevisions.length > 1) {
      var histWrap = document.createElement("div");
      histWrap.style.marginTop = "var(--space-4)";
      histWrap.style.paddingTop = "var(--space-4)";
      histWrap.style.borderTop = "1px solid var(--divider)";
      var histHeading = document.createElement("h4");
      histHeading.style.marginBottom = "var(--space-2)";
      histHeading.textContent = "Revision History";
      histWrap.appendChild(histHeading);
      // Redesign Gate 10 (Module Consistency Pass): retrofitted onto the same
      // .attention-list/.attention-item primitive every other panel-turned-list in this
      // app now uses, replacing the original hand-built row + separate "Open File"
      // ghost button. Whole row is the click target now.
      // allRevisions[0] is doc itself (already shown above) — only older ones here.
      var revList = document.createElement("div");
      revList.className = "attention-list";
      allRevisions.slice(1).forEach(function (rev) {
        var revRow = document.createElement("div");
        revRow.className = "attention-item attention-item--clickable";
        revRow.onclick = function () {
          openStoredFile(rev);
        };

        var icon = document.createElement("span");
        icon.className = "attention-item__icon attention-item__icon--info";
        revRow.appendChild(icon);

        var body = document.createElement("div");
        body.className = "attention-item__body";
        var text = document.createElement("div");
        text.className = "attention-item__text";
        text.textContent = "Rev " + rev.revision_number + " — " + rev.filename;
        body.appendChild(text);
        var meta = document.createElement("div");
        meta.className = "attention-item__meta";
        meta.textContent = (STATUS_LABELS[rev.status] || rev.status) + " · " + new Date(rev.uploaded_at).toLocaleDateString();
        body.appendChild(meta);
        revRow.appendChild(body);

        revList.appendChild(revRow);
      });
      histWrap.appendChild(revList);
      panel.appendChild(histWrap);
    }

    return panel;
  }

  // UI/UX Overhaul Gate 6 (Documents): this register never had a filter toolbar or a
  // search box at all — the old render() showed literally every document across every
  // project in one flat list, unlike every other register (Risk Register/Portfolio/
  // RFI-TQ all have search + project/type/status filters). Same predicate shape as
  // risks.js's own riskMatchesFilters().
  function documentMatchesFilters(doc, data) {
    if (uiState.projectFilter && doc.project_id !== uiState.projectFilter) return false;
    if (uiState.categoryFilter && doc.category !== uiState.categoryFilter) return false;
    if (uiState.statusFilter && doc.status !== uiState.statusFilter) return false;
    if (uiState.search) {
      var q = uiState.search.toLowerCase();
      var haystack = (doc.filename + " " + (doc.document_number || "")).toLowerCase();
      if (haystack.indexOf(q) === -1) return false;
    }
    return true;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    // Redesign Gate 6 (Global Project Context): pre-fill the project filter from the
    // shared active project on this page's first render only — see risks.js's own
    // comment on this exact pattern.
    if (!uiState.projectFilterInitialized) {
      uiState.projectFilterInitialized = true;
      var ctxProjectId = window.PCC.projectContext.get();
      if (ctxProjectId && data.projects.some(function (p) { return p.id === ctxProjectId; })) {
        uiState.projectFilter = ctxProjectId;
      }
    }

    var h1 = document.createElement("h2");
    h1.className = "focus-mode-hide";
    h1.textContent = "Documents";
    h1.style.marginBottom = "var(--space-4)";
    outlet.appendChild(h1);

    // UI/UX Overhaul Gate 7 (Focus Mode): matches the brief's own Documents Focus Mode
    // example verbatim ("Document register + preview") — this explanatory panel is
    // useful once, not on every visit, so it's the first thing to go for more workspace.
    var infoPanel = document.createElement("div");
    infoPanel.className = "panel focus-mode-hide";
    infoPanel.style.marginBottom = "var(--space-4)";
    infoPanel.innerHTML =
      "<p class='text-secondary' style='margin:0; font-size:13px;'>Excel, Word, and PDF files are read " +
      "client-side, and both the extracted data/text and the original file itself are saved with the " +
      "document — no internet needed, nothing distorted. “Open File” always reproduces the exact " +
      "file you uploaded. PDF text extraction won't work on scanned/image-only PDFs (no text layer to " +
      "read), but the original still opens fine. Browser storage typically caps around 5–10MB total, " +
      "so export your data regularly once you're attaching real files.</p>";
    outlet.appendChild(infoPanel);

    var hasActiveProjectsForDoc = data.projects.some(function (p) { return !p.archived; });

    // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash/Recycle
    // Bin. A trashed document is hidden from the normal register entirely — these two
    // counts (not just a boolean) are what the empty-state text and the "Trash (N)"
    // toggle button both need.
    var activeDocCount = data.documents.filter(function (d) { return !d.trashed_at; }).length;
    var trashedGroupCount = latestDocuments(data.documents.filter(function (d) { return d.trashed_at; })).length;

    // Same as before this gate: the upload form, when open, renders ABOVE the register
    // rather than replacing it — the existing document list/preview stays visible below
    // it (no `return` here), so uploading doesn't hide what's already on file.
    if (uiState.formOpen) {
      renderUploadForm(outlet, data, rerender);
    }
    if (uiState.bulkImportOpen) {
      renderBulkImportPanel(outlet, data, rerender);
    }

    if (!uiState.showTrash && activeDocCount === 0) {
      if (!uiState.formOpen && !uiState.bulkImportOpen) {
        var addBtnEmpty = document.createElement("button");
        addBtnEmpty.className = "btn btn--primary";
        addBtnEmpty.textContent = "+ Add Document";
        addBtnEmpty.style.marginBottom = "var(--space-4)";
        addBtnEmpty.style.marginRight = "var(--space-3)";
        addBtnEmpty.disabled = !hasActiveProjectsForDoc;
        addBtnEmpty.title = hasActiveProjectsForDoc ? "" : "Add a project in Portfolio first";
        addBtnEmpty.onclick = function () {
          uiState.formOpen = true;
          rerender();
        };
        outlet.appendChild(addBtnEmpty);

        var bulkImportBtnEmpty = document.createElement("button");
        bulkImportBtnEmpty.className = "btn btn--ghost";
        bulkImportBtnEmpty.textContent = "Bulk Import";
        bulkImportBtnEmpty.disabled = !hasActiveProjectsForDoc;
        bulkImportBtnEmpty.title = hasActiveProjectsForDoc ? "" : "Add a project in Portfolio first";
        bulkImportBtnEmpty.onclick = function () {
          uiState.bulkImportOpen = true;
          rerender();
        };
        outlet.appendChild(bulkImportBtnEmpty);

        if (trashedGroupCount > 0) {
          var trashBtnEmpty = document.createElement("button");
          trashBtnEmpty.className = "btn btn--ghost";
          trashBtnEmpty.textContent = "Trash (" + trashedGroupCount + ")";
          trashBtnEmpty.onclick = function () {
            uiState.showTrash = true;
            rerender();
          };
          outlet.appendChild(trashBtnEmpty);
        }
      }

      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = hasActiveProjectsForDoc
        ? "No documents yet. Click “+ Add Document” to upload one."
        : "Add a project in Portfolio first, then upload documents against it.";
      outlet.appendChild(empty);
      return;
    }

    if (uiState.showTrash && trashedGroupCount === 0) {
      var backFromEmptyTrashBtn = document.createElement("button");
      backFromEmptyTrashBtn.className = "btn btn--ghost";
      backFromEmptyTrashBtn.textContent = "← Back to Documents";
      backFromEmptyTrashBtn.style.marginBottom = "var(--space-4)";
      backFromEmptyTrashBtn.onclick = function () {
        uiState.showTrash = false;
        rerender();
      };
      outlet.appendChild(backFromEmptyTrashBtn);

      var emptyTrash = document.createElement("div");
      emptyTrash.className = "panel empty-state";
      emptyTrash.textContent = "Trash is empty.";
      outlet.appendChild(emptyTrash);
      return;
    }

    // ---- Filter toolbar ----
    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search filename, document number…";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      rerender();
    };
    toolbar.appendChild(searchInput);

    var categorySelect = document.createElement("select");
    var allCatOpt = document.createElement("option");
    allCatOpt.value = "";
    allCatOpt.textContent = "All categories";
    categorySelect.appendChild(allCatOpt);
    Object.keys(CATEGORY_LABELS).forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CATEGORY_LABELS[c];
      categorySelect.appendChild(opt);
    });
    categorySelect.value = uiState.categoryFilter;
    categorySelect.onchange = function () {
      uiState.categoryFilter = categorySelect.value;
      rerender();
    };
    toolbar.appendChild(categorySelect);

    var statusFilterSelect = document.createElement("select");
    var allStatusOpt = document.createElement("option");
    allStatusOpt.value = "";
    allStatusOpt.textContent = "All statuses";
    statusFilterSelect.appendChild(allStatusOpt);
    window.PCC.store.DOCUMENT_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABELS[s] || s;
      statusFilterSelect.appendChild(opt);
    });
    statusFilterSelect.value = uiState.statusFilter;
    statusFilterSelect.onchange = function () {
      uiState.statusFilter = statusFilterSelect.value;
      rerender();
    };
    toolbar.appendChild(statusFilterSelect);

    var projectFilterSelect = document.createElement("select");
    var allProjOpt = document.createElement("option");
    allProjOpt.value = "";
    allProjOpt.textContent = "All projects";
    projectFilterSelect.appendChild(allProjOpt);
    data.projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projectFilterSelect.appendChild(opt);
    });
    projectFilterSelect.value = uiState.projectFilter;
    projectFilterSelect.onchange = function () {
      uiState.projectFilter = projectFilterSelect.value;
      // Redesign Gate 6: see risks.js's own comment on this exact pattern — clearing to
      // "All projects" stays local to this register, doesn't clear the shared context.
      if (uiState.projectFilter) window.PCC.projectContext.set(uiState.projectFilter);
      rerender();
    };
    toolbar.appendChild(projectFilterSelect);

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    // Hidden while the upload form is already open (below) — avoids a redundant second
    // "+ Add Document" trigger on screen at once, same as the pre-Gate-6 behavior where
    // the single add button lived only in the non-form branch.
    if (!uiState.formOpen && !uiState.bulkImportOpen && !uiState.showTrash) {
      var addBtn = document.createElement("button");
      addBtn.className = "btn btn--primary";
      addBtn.textContent = "+ Add Document";
      addBtn.disabled = !hasActiveProjectsForDoc;
      addBtn.title = hasActiveProjectsForDoc ? "" : "Add a project in Portfolio first";
      addBtn.onclick = function () {
        uiState.formOpen = true;
        // Gate 6: default the upload form to whichever project is currently filtered, so
        // filtering to a project then clicking "+ Add Document" doesn't lose that context.
        if (uiState.projectFilter) uiState.pendingProjectId = uiState.projectFilter;
        rerender();
      };
      toolbar.appendChild(addBtn);

      // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Bulk Import.
      var bulkImportBtn = document.createElement("button");
      bulkImportBtn.className = "btn btn--ghost";
      bulkImportBtn.textContent = "Bulk Import";
      bulkImportBtn.disabled = !hasActiveProjectsForDoc;
      bulkImportBtn.title = hasActiveProjectsForDoc ? "" : "Add a project in Portfolio first";
      bulkImportBtn.onclick = function () {
        uiState.bulkImportOpen = true;
        if (uiState.projectFilter) uiState.bulkImportProjectId = uiState.projectFilter;
        rerender();
      };
      toolbar.appendChild(bulkImportBtn);

      // PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash/Recycle
      // Bin — always visible (not just when non-empty) for discoverability, same reason
      // "Bulk Import" is always visible rather than hidden until needed.
      var trashToggleBtn = document.createElement("button");
      trashToggleBtn.className = "btn btn--ghost";
      trashToggleBtn.textContent = "Trash (" + trashedGroupCount + ")";
      trashToggleBtn.onclick = function () {
        uiState.showTrash = true;
        uiState.selectedIds = {};
        uiState.selectedDocId = null;
        rerender();
      };
      toolbar.appendChild(trashToggleBtn);
    }

    if (uiState.showTrash) {
      var backToDocsBtn = document.createElement("button");
      backToDocsBtn.className = "btn btn--ghost";
      backToDocsBtn.textContent = "← Back to Documents";
      backToDocsBtn.onclick = function () {
        uiState.showTrash = false;
        uiState.selectedIds = {};
        uiState.selectedDocId = null;
        rerender();
      };
      toolbar.appendChild(backToDocsBtn);

      // Empty Trash is exactly Delete Permanently applied to every trashed group at
      // once — its own, most strongly worded confirmation, since unlike a single/bulk
      // permanent delete this can wipe out everything currently in the Trash view.
      var emptyTrashBtn = document.createElement("button");
      emptyTrashBtn.className = "btn btn--ghost";
      emptyTrashBtn.textContent = "Empty Trash";
      emptyTrashBtn.onclick = function () {
        var trashedGroups = latestDocuments(data.documents.filter(function (d) { return d.trashed_at; }));
        var totalRevisions = 0;
        trashedGroups.forEach(function (doc) {
          totalRevisions += revisionsFor(data.documents, doc.document_group_id).length;
        });
        if (!window.confirm(
          "Empty Trash? This permanently deletes " + trashedGroups.length + " document" + (trashedGroups.length === 1 ? "" : "s") +
          " (" + totalRevisions + " total revision" + (totalRevisions === 1 ? "" : "s") + ") and every stored file. This CANNOT be undone."
        )) return;
        Promise.all(trashedGroups.map(function (doc) { return permanentlyDeleteDocumentGroup(data.documents, doc.document_group_id); })).then(function () {
          window.PCC.notify("Trash emptied.", "info");
          uiState.selectedIds = {};
          uiState.selectedDocId = null;
          // Unlike a single Restore (which deliberately stays on the Trash view to show
          // its new, still-relevant empty state), emptying the trash was itself the
          // whole point of being here — nothing left to do in this view, so return to
          // the active register instead of leaving an empty screen behind an extra click.
          uiState.showTrash = false;
          rerender();
        });
      };
      toolbar.appendChild(emptyTrashBtn);
    }

    outlet.appendChild(toolbar);

    // ---- Two-panel register + preview (Gate 6) ----
    // Gate 17: only the latest revision of each document group is a top-level row — see
    // latestDocuments()'s own header comment. Older revisions are reached via "History".
    // PCC Architecture Upgrade Phase 6: showTrash swaps which set of documents feeds the
    // exact same register+preview UI — trashed-only instead of active-only. The filter
    // toolbar's search/category/status/project controls stay in the DOM either way (no
    // reason to hide them) but only apply in the normal view; Trash is deliberately just
    // "show everything trashed," not another set of filters to build and maintain.
    var filtered = uiState.showTrash
      ? latestDocuments(data.documents.filter(function (d) { return d.trashed_at; }))
          .sort(function (a, b) { return new Date(b.trashed_at) - new Date(a.trashed_at); })
      : latestDocuments(data.documents.filter(function (d) { return !d.trashed_at; }))
      .filter(function (doc) { return documentMatchesFilters(doc, data); })
      .sort(function (a, b) { return new Date(b.uploaded_at) - new Date(a.uploaded_at); });

    if (filtered.length === 0) {
      var noMatch = document.createElement("div");
      noMatch.className = "panel empty-state";
      noMatch.textContent = "No documents match this search/filter.";
      outlet.appendChild(noMatch);
      return;
    }

    // Self-correcting selection, same "pick the first valid option" convention
    // schedule.js's own scheduleId/projectId selects already use: a selection that's
    // stale (deleted) or filtered out of view falls back to the first visible document.
    if (!uiState.selectedDocId || !filtered.some(function (d) { return d.id === uiState.selectedDocId; })) {
      uiState.selectedDocId = filtered[0].id;
    }
    var selectedDoc = filtered.find(function (d) { return d.id === uiState.selectedDocId; });

    var register = document.createElement("div");
    register.className = "doc-register";

    var listPane = document.createElement("div");
    listPane.className = "doc-register-list";
    // UI/UX Overhaul Gate 7 (Resizable Panels): a custom width overrides the default
    // CSS flex-basis (1 1 340px, capped at max-width: 420px) entirely — flex:0 0 Npx
    // pins an exact width regardless of grow/shrink, and max-width:none lifts the CSS
    // cap that would otherwise clip a wider drag result.
    if (uiState.docRegisterListWidth != null) {
      listPane.style.flex = "0 0 " + uiState.docRegisterListWidth + "px";
      listPane.style.maxWidth = "none";
    }
    // Daily-Use Audit Phase 3 (bulk actions): "No bulk actions on any register" —
    // documents.js was one of five named. status change (approve/reject) + delete cover
    // the two highest-frequency bulk operations named in the audit.
    var bulkBar = renderDocumentBulkBar(data, filtered, rerender, uiState.showTrash);
    if (bulkBar) listPane.appendChild(bulkBar);

    filtered.forEach(function (doc) {
      listPane.appendChild(
        renderDocumentListItem(doc, data, doc.id === uiState.selectedDocId, function () {
          selectDocument(doc.id);
          rerender();
        }, rerender, uiState.showTrash)
      );
    });
    register.appendChild(listPane);

    // UI/UX Overhaul Gate 7 (Resizable Panels): a drag handle between the register list
    // and the preview pane. Deliberately mutates listPane's own inline style directly
    // during the drag rather than calling rerender() on every mousemove (which would be
    // both slow and would tear down/rebuild the very listeners driving the drag) —
    // uiState is only written once, on mouseup, so a LATER rerender (selecting a
    // different document, changing a filter) still preserves the chosen width.
    var resizeHandle = document.createElement("div");
    resizeHandle.className = "doc-register-resize-handle";
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-label", "Resize document list");
    resizeHandle.title = "Drag to resize, double-click to reset";
    resizeHandle.onmousedown = function (downEvent) {
      downEvent.preventDefault();
      var registerRect = register.getBoundingClientRect();
      // Tracks the last width the drag itself computed and applied, so mouseup commits
      // exactly what was visually shown — not a fresh getBoundingClientRect() read,
      // which would mean re-deriving the same number through actual layout a second
      // time for no reason (and isn't meaningfully measurable in a no-layout-engine
      // test environment at all).
      var lastWidth = null;
      resizeHandle.classList.add("doc-register-resize-handle--dragging");

      function onMouseMove(moveEvent) {
        var raw = moveEvent.clientX - registerRect.left;
        var clamped = Math.max(240, Math.min(640, raw));
        lastWidth = clamped;
        listPane.style.flex = "0 0 " + clamped + "px";
        listPane.style.maxWidth = "none";
      }
      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        resizeHandle.classList.remove("doc-register-resize-handle--dragging");
        if (lastWidth != null) uiState.docRegisterListWidth = Math.round(lastWidth);
      }
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
    resizeHandle.ondblclick = function () {
      uiState.docRegisterListWidth = null;
      rerender();
    };
    register.appendChild(resizeHandle);

    register.appendChild(renderDocumentPreviewPanel(selectedDoc, data, rerender, uiState.showTrash));

    outlet.appendChild(register);
  }

  window.PCC.pages.documents = render;
  // Shared with portfolio.js's Details panel, which lists a project's attached documents.
  window.PCC.files = {
    open: openStoredFile,
    summary: extractionSummary,
    categoryLabel: function (category) {
      return CATEGORY_LABELS[category] || category;
    },
    createFromMeeting: function (projectId, meetingId) {
      uiState.formOpen = true;
      uiState.pendingProjectId = projectId;
      uiState.pendingMeetingId = meetingId;
      uiState.pendingFile = null;
      uiState.readError = null;
    },
    expandDocument: function (docId) {
      selectDocument(docId);
    },
    // UI/UX Overhaul Gate 6: the one piece of the cross-page "which project" hand-off
    // convention Documents was missing (flagged as a known gap during Gate 4's build) —
    // every other register already has this. Workspace's Documents nav tab now lands
    // pre-filtered instead of showing every project's documents unfiltered.
    filterByProject: function (projectId) {
      uiState.projectFilter = projectId;
      uiState.projectFilterInitialized = true;
      window.PCC.projectContext.set(projectId);
    },
    // Gate 17: latest-revision-per-group only — see latestDocuments()'s own header
    // comment. portfolio.js's ATTACHMENTS section uses this so a document with several
    // revisions shows as one row there too, not one row per historical revision.
    latestOnly: latestDocuments,
  };
})();
