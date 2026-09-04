/* Documents page (Gate 6 register UI, later gates: nomenclature/classification, revision
 * control, Trash/Recycle Bin, Bulk Import) — service layer for the React migration
 * (Post-Phase-5 Engineering Evolution, Batch F part 3). Thin wrapper over the real
 * window.PCC.store/blobStore/duplicateService/documentNomenclatureEngine/documentTypes
 * engines — master prompt §9: React must not own core calculations.
 *
 * latestDocuments()/extractionSummary()/categoryLabel()/openStoredFile() are NOT
 * reimplemented here — they stay defined once, in src/js/pages/documents.js (the stub),
 * exposed as window.PCC.files.{latestOnly,summary,categoryLabel,open}, because
 * portfolio.js's and meetings'/projectWorkspace's own (already-migrated) React services
 * call window.PCC.files.* directly, outside this page's own render. This service's own
 * copies below just forward to those, so there's still only a single implementation each
 * (same convention as costService.js's projectCostSummary forwarding to
 * window.PCC.cost.projectCostSummary).
 */

export var CATEGORY_LABELS = {
  contract: "Contract",
  drawing: "Drawing",
  photo: "Photo",
  invoice: "Invoice",
  other: "Other",
};

export var PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" };
export var CRITICALITY_LABELS = { critical: "Critical", major: "Major", normal: "Normal", informational: "Informational" };
export var STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  resubmitted: "Resubmitted",
  superseded: "Superseded",
  archived: "Archived",
};
export var BULK_STATUS_LABELS = {
  scanning: "Scanning…",
  ready: "Ready",
  duplicate: "Possible duplicate",
  error: "Error",
};

export var LARGE_FILE_WARNING_BYTES = 2 * 1024 * 1024; // 2MB raw (~2.7MB once base64-encoded)
var TEXT_CHAR_CAP = 50000;
var PDF_MAX_PAGES = 50;

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(data, projectId) {
  if (!projectId) return "Unassigned";
  var p = data.projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "Unassigned";
}

/** See this file's own header comment — the real implementation lives in the stub,
 * exposed as window.PCC.files.latestOnly, because portfolio.js's service already calls
 * it directly outside this page's render. */
export function latestDocuments(documents) {
  return window.PCC.files.latestOnly(documents);
}

export function activeDocuments(documents) {
  return documents.filter(function (d) {
    return !d.trashed_at;
  });
}

export function revisionsFor(documents, groupId) {
  return documents
    .filter(function (d) {
      return d.document_group_id === groupId;
    })
    .sort(function (a, b) {
      return b.revision_number - a.revision_number;
    });
}

export function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  var kb = bytes / 1024;
  if (kb < 1024) return Math.round(kb) + " KB";
  return (kb / 1024).toFixed(1) + " MB";
}

export function extensionOf(filename) {
  var m = /\.([a-z0-9]+)$/i.exec(filename || "");
  return m ? m[1].toLowerCase() : "";
}

/** Gate 16 (Document Control 3: Nomenclature). "REV" + a zero-padded 2-digit number for
 * a purely numeric revision, or "REV" + whatever was typed for anything else. */
export function formatRevisionToken(revision) {
  var trimmed = (revision || "").trim();
  if (!trimmed) return "";
  if (/^\d+$/.test(trimmed)) {
    return "REV" + (trimmed.length < 2 ? "0" + trimmed : trimmed);
  }
  return "REV" + trimmed;
}

export function extractionSummary(extraction) {
  return window.PCC.files.summary(extraction);
}

export function categoryLabel(category) {
  return window.PCC.files.categoryLabel(category);
}

export function openStoredFile(doc) {
  window.PCC.files.open(doc);
}

export function documentMatchesFilters(doc, filters) {
  if (filters.projectFilter && doc.project_id !== filters.projectFilter) return false;
  if (filters.categoryFilter && doc.category !== filters.categoryFilter) return false;
  if (filters.statusFilter && doc.status !== filters.statusFilter) return false;
  if (filters.search) {
    var q = filters.search.toLowerCase();
    var haystack = (doc.filename + " " + (doc.document_number || "")).toLowerCase();
    if (haystack.indexOf(q) === -1) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------
// Trash/Recycle Bin (PCC Architecture Upgrade Phase 6). Same semantics as the original
// vanilla page: "Delete" moves a whole revision group to trash (record+blob intact),
// "Delete Permanently" (reachable only from the Trash view) actually removes everything.
// ---------------------------------------------------------------------------------

export function trashDocumentGroup(groupId) {
  var now = new Date().toISOString();
  window.PCC.store.update(function (d) {
    d.documents.forEach(function (item) {
      if (item.document_group_id === groupId) item.trashed_at = now;
    });
  });
}

export function restoreDocumentGroup(groupId) {
  window.PCC.store.update(function (d) {
    d.documents.forEach(function (item) {
      if (item.document_group_id === groupId) item.trashed_at = null;
    });
  });
}

/** Actually removes every revision's record and blob, and cleans up project.attachments.
 * Cannot be undone. Resolves with the list of removed document ids once every blob
 * delete has settled (best-effort — a failed individual blob delete never blocks the rest). */
export function permanentlyDeleteDocumentGroup(documents, groupId) {
  var allRevisionIds = documents
    .filter(function (d) {
      return d.document_group_id === groupId;
    })
    .map(function (d) {
      return d.id;
    });
  window.PCC.store.update(function (d) {
    d.documents = d.documents.filter(function (item) {
      return allRevisionIds.indexOf(item.id) === -1;
    });
    d.projects.forEach(function (p) {
      if (p.attachments) {
        p.attachments = p.attachments.filter(function (id) {
          return allRevisionIds.indexOf(id) === -1;
        });
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

/** A short "trashed N ago" label for the Trash view. */
export function trashedAgoLabel(trashedAtIso) {
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

// ---------------------------------------------------------------------------------
// File reading + content extraction (Excel/Word/PDF), duplicate fingerprinting.
// ---------------------------------------------------------------------------------

function arrayBufferToBase64(buffer) {
  var bytes = new Uint8Array(buffer);
  var chunkSize = 8192;
  var chunks = [];
  for (var i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function extractExcel(buffer) {
  return new Promise(function (resolve, reject) {
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
      resolve({
        type: "excel",
        sheet_name: firstSheetName,
        headers: capped.length ? capped[0] : [],
        rows: capped.slice(1),
        truncated: rows.length > 300,
      });
    } catch (e) {
      reject(e);
    }
  });
}

function extractDocx(buffer) {
  return window.mammoth.extractRawText({ arrayBuffer: buffer }).then(function (result) {
    var fullText = result.value || "";
    return {
      type: "docx",
      text: fullText.slice(0, TEXT_CHAR_CAP),
      char_count: fullText.length,
      truncated: fullText.length > TEXT_CHAR_CAP,
    };
  });
}

function extractPdf(buffer) {
  var typedArray = new Uint8Array(buffer);
  return window.pdfjsLib
    .getDocument({ data: typedArray })
    .promise.then(function (pdf) {
      var pagesToRead = Math.min(pdf.numPages, PDF_MAX_PAGES);
      var pagePromises = [];
      for (var i = 1; i <= pagesToRead; i++) {
        pagePromises.push(
          pdf.getPage(i).then(function (page) {
            return page.getTextContent().then(function (content) {
              return content.items
                .map(function (item) {
                  return item.str;
                })
                .join(" ");
            });
          })
        );
      }
      return Promise.all(pagePromises).then(function (pageTexts) {
        var fullText = pageTexts.join("\n\n");
        return {
          type: "pdf",
          text: fullText.slice(0, TEXT_CHAR_CAP),
          char_count: fullText.length,
          page_count: pdf.numPages,
          truncated: fullText.length > TEXT_CHAR_CAP || pdf.numPages > pagesToRead,
        };
      });
    });
}

/** Reads a single-upload file (.xlsx/.xls/.docx/.pdf), extracts its content, computes
 * the storable data URI, and fingerprints it for duplicate detection — one file read,
 * matching the original vanilla handleFileSelected()+checkForDuplicates() pipeline.
 * Resolves { name, size, type, fileData, extraction, hash, hashMethod }, or rejects with
 * an Error carrying a user-facing message (including the same per-type hint text the
 * vanilla page showed on an extraction failure). */
export function readAndExtractFile(file) {
  var ext = extensionOf(file.name);
  var supported = ext === "xlsx" || ext === "xls" || ext === "docx" || ext === "pdf";
  if (!supported) {
    return Promise.reject(new Error("Unsupported file type. Use .xlsx, .xls, .docx, or .pdf."));
  }
  return new Promise(function (resolve, reject) {
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

      var extractionPromise = ext === "xlsx" || ext === "xls" ? extractExcel(buffer) : ext === "docx" ? extractDocx(buffer) : extractPdf(buffer);

      extractionPromise.then(
        function (extraction) {
          window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
            resolve({
              name: file.name,
              size: file.size,
              type: file.type,
              fileData: fileDataUri,
              extraction: extraction,
              hash: fp.hash,
              hashMethod: fp.method,
            });
          });
        },
        function (err) {
          var hint =
            ext === "pdf"
              ? " Scanned/image-only PDFs don't contain extractable text."
              : ext === "xls" || ext === "xlsx"
              ? " If it's an older .xls file, try re-saving it as .xlsx."
              : "";
          reject(new Error("Couldn't read this file (" + err.message + ")." + hint));
        }
      );
    };
    reader.onerror = function () {
      reject(new Error("Could not read that file."));
    };
    reader.readAsArrayBuffer(file);
  });
}

/** Re-runs duplicate matching for the currently pending file against `projectId` — used
 * both right after a fresh read and again whenever the form's project changes. */
export function findDuplicateMatches(data, pendingFile, projectId) {
  if (!pendingFile || !pendingFile.hash) return [];
  return window.PCC.duplicateService.findFileDuplicates(activeDocuments(data.documents), {
    hash: pendingFile.hash,
    method: pendingFile.hashMethod,
    filename: pendingFile.name,
    size: pendingFile.size,
    projectId: projectId,
  });
}

function strongestMatchOf(matches) {
  return matches.length
    ? matches.reduce(function (best, m) {
        return !best || (m.strength === "strong" && best.strength !== "strong") ? m : best;
      }, null)
    : null;
}

/** Non-blocking only — see documentNomenclatureEngine.js's own header comment. Returns
 * null when nomenclature checking is off, no pattern is configured, or no file is picked
 * yet. */
export function nomenclatureCheck(data, pendingFile, form) {
  if (!data.settings.document_nomenclature_enabled) return null;
  var pattern = data.settings.document_nomenclature_pattern;
  if (!pattern || !pendingFile) return null;

  var project = data.projects.find(function (p) {
    return p.id === form.projectId;
  });
  var documentType = data.document_types.find(function (t) {
    return t.id === form.documentTypeId;
  });
  var tokens = {
    PROJECT: project ? project.project_code : "",
    DISCIPLINE: form.discipline,
    DOCUMENTTYPE: documentType ? documentType.code : "",
    NUMBER: form.documentNumber,
    REV: formatRevisionToken(form.revision),
  };
  return window.PCC.documentNomenclatureEngine.checkFilename(pattern, pendingFile.name, tokens);
}

/** Saves a new document (or a new revision, when form.revisionGroupId is set) — writes
 * the blob first, then the metadata record, same order as every other upload flow in
 * this app (never orphan a document record pointing at a blob that was never written).
 * Resolves the saved document. */
export function saveDocument(data, form, pendingFile, duplicateMatches) {
  var strongestMatch = strongestMatchOf(duplicateMatches);

  var revisionNumber = 1;
  if (form.revisionGroupId) {
    var siblings = data.documents.filter(function (d) {
      return d.document_group_id === form.revisionGroupId;
    });
    revisionNumber =
      1 +
      siblings.reduce(function (max, d) {
        return Math.max(max, d.revision_number);
      }, 0);
  }

  var doc = window.PCC.store.newDocument({
    document_group_id: form.revisionGroupId || "",
    revision_number: revisionNumber,
    status: form.status || "draft",
    project_id: form.projectId,
    activity_id: form.activityId || "",
    filename: pendingFile.name,
    category: form.category,
    file_size: pendingFile.size,
    mime_type: pendingFile.type,
    extraction: pendingFile.extraction,
    file_data: null,
    meeting_id: form.meetingId || "",
    content_hash: pendingFile.hash || null,
    hash_method: pendingFile.hashMethod || null,
    is_duplicate: !!strongestMatch,
    original_record_id: strongestMatch ? strongestMatch.record.id : null,
    duplicate_reason: strongestMatch ? strongestMatch.reason : null,
    duplicate_group_id: strongestMatch ? strongestMatch.record.duplicate_group_id || window.PCC.duplicateService.newGroupId() : null,
    document_type_id: form.documentTypeId || "",
    discipline: form.discipline || "",
    document_number: form.documentNumber || "",
    revision: form.revision || "00",
    package_id: form.packageId || "",
    contract_or_po: form.contractOrPo || "",
    vendor_id: form.vendorId || "",
    priority: form.priority || "medium",
    criticality: form.criticality || "",
    remarks: form.remarks || "",
  });

  return window.PCC.blobStore.putBlob(doc.id, pendingFile.fileData).then(function () {
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
    return doc;
  });
}

export function updateDocumentStatus(docId, status) {
  window.PCC.store.update(function (d) {
    var existing = d.documents.find(function (item) {
      return item.id === docId;
    });
    if (existing) existing.status = status;
  });
}

// ---------------------------------------------------------------------------------
// Bulk Import (PCC Architecture Upgrade Phase 6). Files are hashed/duplicate-checked
// sequentially, not in parallel — bounds peak memory when many/large files are picked
// at once, and deliberately skips content extraction (a single-file nicety, not
// worthwhile across a batch that may be hundreds of files extraction doesn't support).
// ---------------------------------------------------------------------------------

/** Reads one bulk-import file (as an ArrayBuffer), computing both its content
 * fingerprint and its storable data URI from the SAME read. Resolves
 * { hash, hashMethod, dataUri }. */
export function readAndFingerprintForBulk(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      var buffer = reader.result;
      var mimeType = file.type || "application/octet-stream";
      var dataUri = "data:" + mimeType + ";base64," + arrayBufferToBase64(buffer);
      window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
        resolve({ hash: fp.hash, hashMethod: fp.method, dataUri: dataUri });
      });
    };
    reader.onerror = function () {
      reject(new Error("Could not read this file."));
    };
    reader.readAsArrayBuffer(file);
  });
}

/** Re-checks (or initially checks) a bulk-import entry's duplicate status against the
 * live store — used at scan time and again whenever the batch's target project changes. */
export function findBulkDuplicateMatch(data, entry, projectId) {
  if (!projectId || !entry.hash) return null;
  var matches = window.PCC.duplicateService.findFileDuplicates(activeDocuments(data.documents), {
    hash: entry.hash,
    method: entry.hashMethod,
    filename: entry.name,
    size: entry.size,
    projectId: projectId,
  });
  return strongestMatchOf(matches);
}

/** BATCH IMPORT -> PROGRESS -> SUMMARY. Imports every entry currently 'ready' or
 * 'duplicate' (duplicates are flagged, never silently skipped). `onProgress(done, total)`
 * is called after each file commits. Resolves { imported, duplicates, skipped, errors }. */
export function commitBulkImport(entries, projectId, category, documentTypeId, discipline, onProgress) {
  var toImport = entries.filter(function (e) {
    return e.status === "ready" || e.status === "duplicate";
  });
  var skipped = entries.length - toImport.length;
  var imported = 0;
  var duplicatesImported = 0;
  var errors = 0;
  var total = toImport.length;
  var done = 0;

  return toImport
    .reduce(function (chain, entry) {
      return chain.then(function () {
        // Re-check against the LIVE store right before creating this document —
        // catches intra-batch duplicates too (two identical files within the same
        // batch), not just pre-existing ones, since each earlier file in this loop is
        // already a committed document by the time a later one is reached.
        var liveData = window.PCC.store.get();
        var strongestMatch = findBulkDuplicateMatch(liveData, entry, projectId);
        var doc = window.PCC.store.newDocument({
          project_id: projectId,
          filename: entry.name,
          category: category,
          file_size: entry.size,
          mime_type: entry.type || "application/octet-stream",
          file_data: null,
          content_hash: entry.hash,
          hash_method: entry.hashMethod,
          is_duplicate: !!strongestMatch,
          original_record_id: strongestMatch ? strongestMatch.record.id : null,
          duplicate_reason: strongestMatch ? strongestMatch.reason : null,
          duplicate_group_id: strongestMatch ? strongestMatch.record.duplicate_group_id || window.PCC.duplicateService.newGroupId() : null,
          document_type_id: documentTypeId || "",
          discipline: discipline || "",
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
        done++;
        if (onProgress) onProgress(done, total);
      });
    }, Promise.resolve())
    .then(function () {
      return { imported: imported, duplicates: duplicatesImported, skipped: skipped, errors: errors };
    });
}

// ---------------------------------------------------------------------------------
// Cross-page navigation
// ---------------------------------------------------------------------------------

export function viewMeeting(meetingId) {
  if (window.PCC.meetings) window.PCC.meetings.expandMeeting(meetingId);
  window.PCC.router.go("meetings");
}

export function viewVendor(vendorId) {
  if (window.PCC.vendors) window.PCC.vendors.openProfile(vendorId);
  window.PCC.router.go("vendors");
}

export function viewActivityInSchedule(projectId, scheduleId, activityId) {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}

export function getProjectContext() {
  return window.PCC.projectContext.get();
}

export function setProjectContext(projectId) {
  window.PCC.projectContext.set(projectId);
}
