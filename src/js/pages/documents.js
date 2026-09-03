/* Documents — Gate 6 (register UI), migrated to React (Post-Phase-5 Engineering
 * Evolution, Batch F part 3). All rendering logic now lives in react/src/pages/
 * Documents.jsx (compiled into js/vendor/react-bundle.js by build.js); this file's
 * remaining jobs are (1) registering the route with the existing vanilla router, then
 * handing off to reactBridge.js via a one-shot pending-prop channel for the
 * openProfile-style public API (consumed inside the component's initial useState lazy
 * initializer, never a useEffect — see CLAUDE.md's React migration notes on why), and
 * (2) keeping latestDocuments()/extractionSummary()/categoryLabel()/openStoredFile()
 * defined here, unchanged from the original vanilla page — NOT moved into
 * react/src/services/documentsService.js — because portfolio.js's, meetings', and
 * projectWorkspace's own (already-migrated) React services call
 * window.PCC.files.{latestOnly,summary,categoryLabel,open} directly and synchronously,
 * outside any React render of THIS page. documentsService.js's own copies just forward
 * to these, so there's still only a single implementation each (master prompt §9: React
 * must not own core calculations — same convention as cost.js's projectCostSummary).
 */
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

  /** Gate 17 (Document Control 4): collapses a flat document list down to just the
   * highest-revision_number record per document_group_id. */
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

  function extractionSummary(extraction) {
    if (!extraction) return "No data extracted";
    if (extraction.type === "excel") {
      return "Data extracted (" + extraction.rows.length + " row" + (extraction.rows.length === 1 ? "" : "s") + ")";
    }
    return "Text extracted (" + extraction.char_count.toLocaleString() + " chars" + (extraction.page_count ? ", " + extraction.page_count + " pages" : "") + ")";
  }

  /** Reconstructs the original file from its stored data and opens/downloads it. The
   * data itself may be inline on doc.file_data (a legacy record predating the IndexedDB
   * migration) or need fetching by id from IndexedDB — blobStore.resolve() handles that
   * dual-path lookup so this function doesn't need to know or care which. */
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

  var pendingFormOpen = false;
  var pendingProjectId = "";
  var pendingMeetingId = "";
  var pendingProjectFilter = null;
  var pendingSelectedDocId = null;

  function render(outlet) {
    var props = {
      initialFormOpen: pendingFormOpen,
      initialProjectId: pendingProjectId,
      initialMeetingId: pendingMeetingId,
      initialProjectFilter: pendingProjectFilter,
      initialSelectedDocId: pendingSelectedDocId,
    };
    pendingFormOpen = false;
    pendingProjectId = "";
    pendingMeetingId = "";
    pendingProjectFilter = null;
    pendingSelectedDocId = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.documents, props, outlet);
  }

  window.PCC.pages.documents = render;

  // Shared with portfolio.js's Details panel, which lists a project's attached
  // documents, and with meetings'/projectWorkspace's own React services — see this
  // file's own header comment for why these specific functions stay here.
  window.PCC.files = {
    open: openStoredFile,
    summary: extractionSummary,
    categoryLabel: function (category) {
      return CATEGORY_LABELS[category] || category;
    },
    createFromMeeting: function (projectId, meetingId) {
      pendingFormOpen = true;
      pendingProjectId = projectId;
      pendingMeetingId = meetingId;
    },
    expandDocument: function (docId) {
      pendingSelectedDocId = docId;
    },
    // UI/UX Overhaul Gate 6: cross-page "which project" hand-off convention every other
    // register already has.
    filterByProject: function (projectId) {
      pendingProjectFilter = projectId;
      window.PCC.projectContext.set(projectId);
    },
    // Gate 17: latest-revision-per-group only — see latestDocuments()'s own header
    // comment above.
    latestOnly: latestDocuments,
  };
})();
