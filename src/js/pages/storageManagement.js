/* PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Storage Management.
 * Master upgrade prompt Section 98: a dedicated "how much space is PCC using, which
 * projects/files are largest, are there duplicates, are there orphan files" view.
 * Read-only analytics (storageAnalyticsEngine.js) plus one real action: Scan Storage for
 * orphans (Section 29), which only ever surfaces findings — deleting an orphan blob is
 * a deliberate, per-item, confirmed action, never automatic.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var uiState = {
    scanning: false,
    scanResult: null, // { orphanBlobIds: [{id, size}], missingBlobRecords: [...] } once scanned
    scanError: null,
  };

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    var kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + " KB";
    return (kb / 1024).toFixed(2) + " MB";
  }

  function projectName(data, projectId) {
    if (!projectId) return "Unassigned";
    var p = data.projects.find(function (proj) { return proj.id === projectId; });
    return p ? p.name || "(unnamed project)" : "Unassigned";
  }

  function runScan(data, rerender) {
    uiState.scanning = true;
    uiState.scanError = null;
    rerender();

    var records = window.PCC.storageAnalyticsEngine.collectFileRecords(data);
    window.PCC.blobStore
      .listBlobIds()
      .then(function (blobIds) {
        var result = window.PCC.storageAnalyticsEngine.findOrphans(records, blobIds);
        // Orphan blobs' sizes aren't known from the (nonexistent) record — this is the
        // one place actual blob bytes get read, and only for the handful of orphans
        // found, never the whole library (see the engine's own header on why).
        return Promise.all(
          result.orphanBlobIds.map(function (id) {
            return window.PCC.blobStore
              .getBlob(id)
              .then(function (dataUri) {
                var size = dataUri ? Math.round((dataUri.length - dataUri.indexOf(",") - 1) * 0.75) : 0;
                return { id: id, size: size };
              })
              .catch(function () {
                return { id: id, size: 0 };
              });
          })
        ).then(function (orphanBlobsWithSize) {
          uiState.scanResult = {
            orphanBlobs: orphanBlobsWithSize,
            missingBlobRecords: result.missingBlobRecords,
          };
          uiState.scanning = false;
          rerender();
        });
      })
      .catch(function (e) {
        uiState.scanError = "Could not scan storage: " + e.message;
        uiState.scanning = false;
        rerender();
      });
  }

  function deleteOrphanBlob(id, rerender) {
    if (!window.confirm("Permanently delete this orphan file? It has no matching record in PCC, so nothing else references it. This can't be undone.")) return;
    window.PCC.blobStore.deleteBlob(id).then(function () {
      if (uiState.scanResult) {
        uiState.scanResult.orphanBlobs = uiState.scanResult.orphanBlobs.filter(function (o) { return o.id !== id; });
      }
      window.PCC.notify("Orphan file deleted.", "info");
      rerender();
    }).catch(function (e) {
      window.PCC.notify("Could not delete: " + e.message, "error");
    });
  }

  function renderSummaryCards(summary) {
    var grid = document.createElement("div");
    grid.className = "kpi-grid";

    function card(label, value, sub) {
      var el = document.createElement("div");
      el.className = "panel kpi-card";
      el.innerHTML =
        "<div class='kpi-card__label'>" + label + "</div>" +
        "<div class='kpi-card__value'>" + value + "</div>" +
        (sub ? "<div class='text-secondary' style='font-size:12px;margin-top:4px;'>" + sub + "</div>" : "");
      return el;
    }

    grid.appendChild(card("Total Storage Used", formatBytes(summary.totalBytes), summary.totalCount + " file" + (summary.totalCount === 1 ? "" : "s")));
    grid.appendChild(card("In Trash", formatBytes(summary.trashedBytes), summary.trashedCount + " file" + (summary.trashedCount === 1 ? "" : "s")));
    grid.appendChild(card("Possible Duplicates", formatBytes(summary.duplicateBytes), summary.duplicateCount + " file" + (summary.duplicateCount === 1 ? "" : "s")));
    return grid;
  }

  function renderBreakdownTable(heading, rows, labelFn) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginTop = "var(--space-4)";
    var h = document.createElement("h3");
    h.style.marginBottom = "var(--space-3)";
    h.textContent = heading;
    panel.appendChild(h);

    if (rows.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "var(--text-sm)";
      empty.textContent = "Nothing to show yet.";
      panel.appendChild(empty);
      return panel;
    }

    var list = document.createElement("div");
    list.className = "project-list";
    rows.forEach(function (row) {
      var item = document.createElement("div");
      item.className = "detail-card";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.marginBottom = "var(--space-2)";
      item.innerHTML =
        "<span>" + labelFn(row) + "</span>" +
        "<span class='text-secondary' style='font-size:13px;'>" + row.count + " file" + (row.count === 1 ? "" : "s") + " · " + formatBytes(row.bytes) + "</span>";
      list.appendChild(item);
    });
    panel.appendChild(list);
    return panel;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    var h1 = document.createElement("h2");
    h1.className = "focus-mode-hide";
    h1.textContent = "Storage Management";
    h1.style.marginBottom = "var(--space-4)";
    outlet.appendChild(h1);

    var infoPanel = document.createElement("div");
    infoPanel.className = "panel focus-mode-hide";
    infoPanel.style.marginBottom = "var(--space-4)";
    infoPanel.innerHTML =
      "<p class='text-secondary' style='margin:0; font-size:13px;'>How much space PCC is using across every document, " +
      "photo, vendor file, knowledge base attachment, and schedule import — plus a Scan Storage tool that finds files " +
      "with no matching record, or records with no matching file. Scanning never deletes anything automatically; " +
      "you decide what to do with each finding.</p>";
    outlet.appendChild(infoPanel);

    var records = window.PCC.storageAnalyticsEngine.collectFileRecords(data);
    var summary = window.PCC.storageAnalyticsEngine.summarizeStorage(records);

    outlet.appendChild(renderSummaryCards(summary));

    var bySourceRows = Object.keys(summary.bySource)
      .map(function (key) { return summary.bySource[key]; })
      .sort(function (a, b) { return b.bytes - a.bytes; });
    outlet.appendChild(renderBreakdownTable("By Type", bySourceRows, function (row) { return row.label; }));

    var byProjectRows = Object.keys(summary.byProject)
      .map(function (key) { return Object.assign({ projectId: key }, summary.byProject[key]); })
      .sort(function (a, b) { return b.bytes - a.bytes; });
    outlet.appendChild(renderBreakdownTable("By Project", byProjectRows, function (row) {
      return row.projectId === "__unassigned__" ? "Unassigned" : projectName(data, row.projectId);
    }));

    if (summary.largestFiles.length > 0) {
      var largestPanel = document.createElement("div");
      largestPanel.className = "panel";
      largestPanel.style.marginTop = "var(--space-4)";
      var largestHeading = document.createElement("h3");
      largestHeading.style.marginBottom = "var(--space-3)";
      largestHeading.textContent = "Largest Files";
      largestPanel.appendChild(largestHeading);
      var largestList = document.createElement("div");
      largestList.className = "project-list";
      summary.largestFiles.forEach(function (r) {
        var row = document.createElement("div");
        row.className = "detail-card";
        row.style.marginBottom = "var(--space-2)";
        row.innerHTML =
          "<strong>" + r.filename + "</strong><br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          r.sourceLabel + " · " + projectName(data, r.projectId) + " · " + formatBytes(r.fileSize) +
          "</span>";
        largestList.appendChild(row);
      });
      largestPanel.appendChild(largestList);
      outlet.appendChild(largestPanel);
    }

    // ---- Scan Storage (Section 29: Orphan File Detection) ----
    var scanPanel = document.createElement("div");
    scanPanel.className = "panel";
    scanPanel.style.marginTop = "var(--space-4)";
    var scanHeading = document.createElement("h3");
    scanHeading.style.marginBottom = "var(--space-3)";
    scanHeading.textContent = "Storage Integrity";
    scanPanel.appendChild(scanHeading);

    var scanBtn = document.createElement("button");
    scanBtn.className = "btn btn--primary";
    scanBtn.textContent = uiState.scanning ? "Scanning…" : "Scan Storage";
    scanBtn.disabled = uiState.scanning;
    scanBtn.onclick = function () {
      runScan(data, rerender);
    };
    scanPanel.appendChild(scanBtn);

    if (uiState.scanError) {
      var errEl = document.createElement("p");
      errEl.style.color = "var(--status-critical)";
      errEl.style.fontSize = "var(--text-sm)";
      errEl.style.marginTop = "var(--space-2)";
      errEl.textContent = uiState.scanError;
      scanPanel.appendChild(errEl);
    }

    if (uiState.scanResult) {
      var result = uiState.scanResult;

      var orphanHeading = document.createElement("h4");
      orphanHeading.style.marginTop = "var(--space-4)";
      orphanHeading.style.marginBottom = "var(--space-2)";
      orphanHeading.textContent = "Orphan Files (" + result.orphanBlobs.length + ") — stored but no record references them";
      scanPanel.appendChild(orphanHeading);

      if (result.orphanBlobs.length === 0) {
        var noOrphans = document.createElement("p");
        noOrphans.className = "text-secondary";
        noOrphans.style.fontSize = "var(--text-sm)";
        noOrphans.textContent = "None found — every stored file has a matching record.";
        scanPanel.appendChild(noOrphans);
      } else {
        var orphanList = document.createElement("div");
        orphanList.className = "project-list";
        result.orphanBlobs.forEach(function (o) {
          var row = document.createElement("div");
          row.className = "detail-card";
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.marginBottom = "var(--space-2)";
          var info = document.createElement("span");
          info.className = "mono";
          info.style.fontSize = "12px";
          info.textContent = o.id + " · ~" + formatBytes(o.size);
          row.appendChild(info);
          var delBtn = document.createElement("button");
          delBtn.className = "btn btn--ghost";
          delBtn.textContent = "Delete Orphan File";
          delBtn.onclick = function () {
            deleteOrphanBlob(o.id, rerender);
          };
          row.appendChild(delBtn);
          orphanList.appendChild(row);
        });
        scanPanel.appendChild(orphanList);
      }

      var missingHeading = document.createElement("h4");
      missingHeading.style.marginTop = "var(--space-4)";
      missingHeading.style.marginBottom = "var(--space-2)";
      missingHeading.textContent = "Records With a Missing File (" + result.missingBlobRecords.length + ")";
      scanPanel.appendChild(missingHeading);

      if (result.missingBlobRecords.length === 0) {
        var noMissing = document.createElement("p");
        noMissing.className = "text-secondary";
        noMissing.style.fontSize = "var(--text-sm)";
        noMissing.textContent = "None found — every record's file is actually there.";
        scanPanel.appendChild(noMissing);
      } else {
        var missingNote = document.createElement("p");
        missingNote.className = "text-secondary";
        missingNote.style.fontSize = "var(--text-sm)";
        missingNote.style.marginBottom = "var(--space-2)";
        missingNote.textContent = "There is no file left to recover for these — review and decide whether to remove the record or re-upload it from its own page.";
        scanPanel.appendChild(missingNote);
        var missingList = document.createElement("div");
        missingList.className = "project-list";
        result.missingBlobRecords.forEach(function (r) {
          var row = document.createElement("div");
          row.className = "detail-card";
          row.style.marginBottom = "var(--space-2)";
          row.innerHTML =
            "<strong>" + r.filename + "</strong><br/>" +
            "<span class='text-secondary' style='font-size:12px;'>" + r.sourceLabel + " · " + projectName(data, r.projectId) + "</span>";
          missingList.appendChild(row);
        });
        scanPanel.appendChild(missingList);
      }
    }

    outlet.appendChild(scanPanel);
  }

  window.PCC.pages.storageManagement = render;
})();
