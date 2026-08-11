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

  var uiState = {
    formOpen: false,
    pendingFile: null, // { name, size, type, extraction } once read
    pendingProjectId: "",
    pendingCategory: "contract",
    pendingMeetingId: "", // set by createFromMeeting() when opened via a meeting's "Attach Document" button
    readError: null,
    readingLabel: null,
    expandedDocId: null, // document id whose extracted data/text is expanded, or null
    duplicateMatches: [], // [{ record, reason, strength }] for the current pendingFile, or []
    duplicateAcknowledged: false, // true once the user clicks "Continue Anyway" on a warning
  };

  function projectName(data, projectId) {
    if (!projectId) return "Unassigned";
    var p = data.projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "Unassigned";
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
      uiState.duplicateMatches = window.PCC.duplicateService.findFileDuplicates(data.documents, {
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
    wrap.style.marginTop = "10px";

    var note = document.createElement("p");
    note.className = "text-secondary";
    note.style.fontSize = "12px";
    note.style.marginBottom = "8px";
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
    table.style.fontSize = "12px";
    table.className = "mono";

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    extraction.headers.forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h || "\u2014";
      th.style.textAlign = "left";
      th.style.padding = "6px 10px";
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
        td.style.padding = "5px 10px";
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
      more.style.fontSize = "11px";
      more.style.marginTop = "4px";
      more.textContent = "+" + (extraction.rows.length - 15) + " more row(s) not shown here, but saved.";
      wrap.appendChild(more);
    }

    return wrap;
  }

  function renderTextPreview(extraction) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "10px";

    var note = document.createElement("p");
    note.className = "text-secondary";
    note.style.fontSize = "12px";
    note.style.marginBottom = "8px";
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
    box.style.fontSize = "12px";
    box.style.maxHeight = "220px";
    box.style.overflowY = "auto";
    box.style.border = "1px solid var(--divider)";
    box.style.borderRadius = "var(--radius-sm)";
    box.style.padding = "10px 12px";
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
    box.style.borderRadius = "8px";
    box.style.padding = "12px";
    box.style.marginTop = "10px";
    box.style.background = "rgba(230, 162, 60, 0.08)";

    var title = document.createElement("p");
    title.style.fontWeight = "600";
    title.style.fontSize = "13px";
    title.style.marginBottom = "8px";
    title.textContent =
      "Possible duplicate " + (matches.length === 1 ? "record" : "records") + " found";
    box.appendChild(title);

    matches.forEach(function (m) {
      var row = document.createElement("div");
      row.style.fontSize = "12px";
      row.style.padding = "6px 0";
      row.style.borderTop = "1px solid var(--border-subtle, rgba(255,255,255,0.08))";

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
      rowActions.style.gap = "8px";
      rowActions.style.marginTop = "6px";

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
    decisionRow.style.gap = "10px";
    decisionRow.style.marginTop = "10px";

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

  function renderUploadForm(container, data, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = "Add Document";
    panel.appendChild(heading);

    if (uiState.pendingMeetingId) {
      var meetingForLink = data.meetings.find(function (m) {
        return m.id === uiState.pendingMeetingId;
      });
      if (meetingForLink) {
        var linkNote = document.createElement("p");
        linkNote.className = "text-secondary";
        linkNote.style.fontSize = "12px";
        linkNote.style.marginTop = "-8px";
        linkNote.style.marginBottom = "14px";
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
    projSelect.onchange = function () {
      uiState.pendingProjectId = projSelect.value;
      // Duplicate matching is scoped per-project (see duplicateService docs), so a
      // project change after a file's already been fingerprinted needs a re-check —
      // otherwise a stale warning (or a missed one) could carry over from the old project.
      if (uiState.pendingFile && uiState.pendingFile.hash) {
        var d = window.PCC.store.get();
        uiState.duplicateMatches = window.PCC.duplicateService.findFileDuplicates(d.documents, {
          hash: uiState.pendingFile.hash,
          method: uiState.pendingFile.hashMethod,
          filename: uiState.pendingFile.name,
          size: uiState.pendingFile.size,
          projectId: uiState.pendingProjectId,
        });
        uiState.duplicateAcknowledged = false;
        rerender();
      }
    };
    projField.appendChild(projSelect);
    grid.appendChild(projField);

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
      var loading = document.createElement("p");
      loading.className = "text-secondary";
      loading.style.fontSize = "13px";
      loading.textContent = uiState.readingLabel;
      panel.appendChild(loading);
    }

    if (uiState.readError) {
      var err = document.createElement("p");
      err.style.color = "var(--status-critical)";
      err.style.fontSize = "13px";
      err.textContent = uiState.readError;
      panel.appendChild(err);
    }

    if (uiState.pendingFile) {
      var fileInfo = document.createElement("p");
      fileInfo.style.fontSize = "13px";
      fileInfo.style.marginTop = "8px";
      fileInfo.innerHTML =
        "<strong>" + uiState.pendingFile.name + "</strong> \u00b7 " + formatBytes(uiState.pendingFile.size);
      panel.appendChild(fileInfo);

      if (uiState.pendingFile.size > LARGE_FILE_WARNING_BYTES) {
        var sizeWarning = document.createElement("p");
        sizeWarning.style.fontSize = "12px";
        sizeWarning.style.color = "var(--status-at-risk)";
        sizeWarning.style.marginTop = "4px";
        sizeWarning.textContent =
          "This is a fairly large file. The original is stored with this document, and browsers " +
          "typically cap local storage around 5\u201310MB total \u2014 export your data soon after saving " +
          "large files so this doesn't get lost if that limit is hit.";
        panel.appendChild(sizeWarning);
      }

      if (uiState.duplicateMatches.length > 0 && !uiState.duplicateAcknowledged) {
        panel.appendChild(renderDuplicateWarning(uiState.duplicateMatches, data, rerender));
      }

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
        noExtraction.style.fontSize = "12px";
        noExtraction.style.marginTop = "8px";
        noExtraction.textContent = "No data could be extracted from this file.";
        panel.appendChild(noExtraction);
      }
    }

    // Actions
    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "14px";

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

      var doc = window.PCC.store.newDocument({
        project_id: uiState.pendingProjectId,
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
          uiState.pendingCategory = "contract";
          uiState.pendingMeetingId = "";
          uiState.duplicateMatches = [];
          uiState.duplicateAcknowledged = false;
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
      rerender();
    };

    actions.appendChild(saveBtn);
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
    window.PCC.blobStore
      .resolve(doc.id, doc.file_data)
      .then(function (fileData) {
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
        var url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        window.setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 30000);
      })
      .catch(function (e) {
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

  function renderDocumentRow(doc, data, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card";

    var linkedMeeting = doc.meeting_id
      ? data.meetings.find(function (m) {
          return m.id === doc.meeting_id;
        })
      : null;

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'>" +
      doc.filename +
      "</div><div class='project-card__meta'>" +
      projectName(data, doc.project_id) +
      " \u00b7 " +
      formatBytes(doc.file_size) +
      " \u00b7 " +
      new Date(doc.uploaded_at).toLocaleDateString() +
      (linkedMeeting ? " \u00b7 From meeting: " + linkedMeeting.title : "") +
      "</div>";

    var badge = document.createElement("span");
    badge.className = "status-badge status-badge--complete";
    badge.textContent = CATEGORY_LABELS[doc.category] || doc.category;

    var dupBadge = null;
    if (doc.is_duplicate) {
      dupBadge = document.createElement("span");
      dupBadge.className = "status-badge status-badge--at_risk";
      dupBadge.style.marginLeft = "6px";
      dupBadge.textContent = "Possible Duplicate";
      dupBadge.title = doc.duplicate_reason || "Flagged as a possible duplicate at upload time.";
    }

    var extractionNote = document.createElement("div");
    extractionNote.className = "project-card__figures";
    extractionNote.textContent = extractionSummary(doc.extraction);

    var actions = document.createElement("div");
    actions.className = "project-card__actions";
    if (doc.extraction) {
      var viewBtn = document.createElement("button");
      viewBtn.className = "btn btn--ghost";
      viewBtn.textContent = uiState.expandedDocId === doc.id ? "Hide" : "View";
      viewBtn.onclick = function () {
        uiState.expandedDocId = uiState.expandedDocId === doc.id ? null : doc.id;
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

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      var warning = "Delete \u201c" + doc.filename + "\u201d? This removes the stored file and extracted data. This can't be undone.";
      if (!window.confirm(warning)) return;
      window.PCC.store.update(function (d) {
        d.documents = d.documents.filter(function (item) {
          return item.id !== doc.id;
        });
        // Keep project.attachments in sync — it's not what rendering reads from (that
        // filters data.documents directly), but leaving stale ids in there would make
        // the field mean nothing the next time something does rely on it.
        d.projects.forEach(function (p) {
          if (p.attachments) {
            p.attachments = p.attachments.filter(function (id) {
              return id !== doc.id;
            });
          }
        });
      });
      // Best-effort — the metadata record is already gone either way, so a failed blob
      // delete here just means an orphaned blob sits harmlessly in IndexedDB rather than
      // blocking the delete the person actually asked for.
      window.PCC.blobStore.deleteBlob(doc.id).catch(function () {});
      if (uiState.expandedDocId === doc.id) uiState.expandedDocId = null;
      window.PCC.notify("Document deleted.", "info");
      onChanged();
    };
    actions.appendChild(deleteBtn);

    card.appendChild(main);
    card.appendChild(badge);
    if (dupBadge) card.appendChild(dupBadge);
    card.appendChild(extractionNote);
    card.appendChild(actions);
    return card;
  }

  function renderDocumentEntry(doc, data, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderDocumentRow(doc, data, onChanged));
    if (uiState.expandedDocId === doc.id && doc.extraction) {
      var detailsWrap = document.createElement("div");
      detailsWrap.className = "project-details";
      detailsWrap.appendChild(
        doc.extraction.type === "excel" ? renderExcelPreview(doc.extraction) : renderTextPreview(doc.extraction)
      );
      entry.appendChild(detailsWrap);
    }
    return entry;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    var h1 = document.createElement("h2");
    h1.textContent = "Documents";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    var infoPanel = document.createElement("div");
    infoPanel.className = "panel";
    infoPanel.style.marginBottom = "16px";
    infoPanel.innerHTML =
      "<p class='text-secondary' style='margin:0; font-size:13px;'>Excel, Word, and PDF files are read " +
      "client-side, and both the extracted data/text and the original file itself are saved with the " +
      "document \u2014 no internet needed, nothing distorted. \u201cOpen File\u201d always reproduces the exact " +
      "file you uploaded. PDF text extraction won't work on scanned/image-only PDFs (no text layer to " +
      "read), but the original still opens fine. Browser storage typically caps around 5\u201310MB total, " +
      "so export your data regularly once you're attaching real files.</p>";
    outlet.appendChild(infoPanel);

    if (uiState.formOpen) {
      renderUploadForm(outlet, data, rerender);
    } else {
      var addBtn = document.createElement("button");
      addBtn.className = "btn btn--primary";
      addBtn.textContent = "+ Add Document";
      addBtn.style.marginBottom = "16px";
      var hasActiveProjectsForDoc = data.projects.some(function (p) {
        return !p.archived;
      });
      addBtn.disabled = !hasActiveProjectsForDoc;
      addBtn.title = hasActiveProjectsForDoc ? "" : "Add a project in Portfolio first";
      addBtn.onclick = function () {
        uiState.formOpen = true;
        rerender();
      };
      outlet.appendChild(addBtn);
    }

    if (data.documents.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      var hasProjectsForEmpty = data.projects.some(function (p) {
        return !p.archived;
      });
      empty.textContent = hasProjectsForEmpty
        ? "No documents yet. Click \u201c+ Add Document\u201d to upload one."
        : "Add a project in Portfolio first, then upload documents against it.";
      outlet.appendChild(empty);
      return;
    }

    var list = document.createElement("div");
    list.className = "project-list";
    data.documents
      .slice()
      .sort(function (a, b) {
        return new Date(b.uploaded_at) - new Date(a.uploaded_at);
      })
      .forEach(function (doc) {
        list.appendChild(renderDocumentEntry(doc, data, rerender));
      });
    outlet.appendChild(list);
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
  };
})();
