/** In-app file viewer — one implementation shared by every platform (web, Electron, Android),
 * not a per-platform patch. Replaces the old `window.open(blob:..., "_blank")` pattern used by
 * Documents/Daily Log photos/Vendor documents: that relied on a browser's own "new tab," which
 * doesn't exist in a bare WebView (Capacitor *or* Electron) — so this was already fragile
 * outside a real browser, not just an Android-specific gap.
 *
 * Self-contained by design: given just a Blob + filename + mimeType, it renders PDFs (via the
 * already-bundled pdf.js, real page rendering — not just the extracted text), images, and
 * Word/Excel (via the already-bundled mammoth.js/SheetJS) directly from the file's own bytes —
 * it doesn't depend on a caller's pre-computed `extraction` data, so any call site can use it.
 * Anything else falls back to "no in-app preview" with a prominent Save/Share action.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var PDF_MAX_PAGES_SHOWN = 20;
  var EXCEL_MAX_ROWS_SHOWN = 300;

  function extensionOf(filename) {
    var m = /\.([a-z0-9]+)$/i.exec(filename || "");
    return m ? m[1].toLowerCase() : "";
  }

  function closeViewer() {
    var overlay = document.getElementById("file-viewer-overlay");
    if (overlay) overlay.remove();
    document.removeEventListener("keydown", handleEscape);
  }

  function handleEscape(e) {
    if (e.key === "Escape") closeViewer();
  }

  function buildChrome(filename, blob) {
    var overlay = document.createElement("div");
    overlay.id = "file-viewer-overlay";
    overlay.className = "modal-overlay";
    overlay.onclick = function (e) {
      if (e.target === overlay) closeViewer();
    };

    var modal = document.createElement("div");
    modal.className = "modal";
    modal.style.maxWidth = "900px";
    modal.style.width = "min(900px, 92vw)";
    modal.style.maxHeight = "88vh";

    var header = document.createElement("div");
    header.className = "modal__header";
    var title = document.createElement("div");
    title.className = "modal__title";
    title.textContent = filename;
    title.style.overflow = "hidden";
    title.style.textOverflow = "ellipsis";
    title.style.whiteSpace = "nowrap";
    header.appendChild(title);
    var closeBtn = document.createElement("button");
    closeBtn.className = "icon-btn";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "✕";
    closeBtn.onclick = closeViewer;
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = document.createElement("div");
    body.className = "modal__body";
    body.style.flex = "1";
    body.style.minHeight = "200px";
    modal.appendChild(body);

    var footer = document.createElement("div");
    footer.className = "modal__footer";
    var saveBtn = document.createElement("button");
    saveBtn.className = "btn btn--secondary";
    saveBtn.textContent = "Save / Share";
    saveBtn.onclick = function () {
      window.PCC.nativeFile.save(blob, filename).catch(function (e) {
        if (window.PCC.notify) window.PCC.notify("Could not save this file: " + e.message, "error");
      });
    };
    footer.appendChild(saveBtn);
    var closeFooterBtn = document.createElement("button");
    closeFooterBtn.className = "btn";
    closeFooterBtn.textContent = "Close";
    closeFooterBtn.onclick = closeViewer;
    footer.appendChild(closeFooterBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", handleEscape);

    return body;
  }

  function renderLoading(body) {
    body.appendChild(window.PCC.loadingIndicator.buildInline("Loading preview…"));
  }

  function renderUnsupported(body, reason) {
    body.innerHTML = "";
    var msg = document.createElement("p");
    msg.className = "text-secondary";
    msg.textContent = reason || "No in-app preview is available for this file type. Use Save / Share to open it in another app.";
    body.appendChild(msg);
  }

  function renderImage(body, blob) {
    var url = URL.createObjectURL(blob);
    body.innerHTML = "";
    var img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "100%";
    img.style.display = "block";
    img.style.margin = "0 auto";
    img.onload = function () {
      URL.revokeObjectURL(url);
    };
    body.appendChild(img);
  }

  function renderPdf(body, blob) {
    blob
      .arrayBuffer()
      .then(function (buffer) {
        return window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      })
      .then(function (pdf) {
        body.innerHTML = "";
        var pagesToRender = Math.min(pdf.numPages, PDF_MAX_PAGES_SHOWN);
        var chain = Promise.resolve();
        var _loop = function (pageNum) {
          chain = chain.then(function () {
            return pdf.getPage(pageNum).then(function (page) {
              var viewport = page.getViewport({ scale: 1.25 });
              var canvas = document.createElement("canvas");
              canvas.style.display = "block";
              canvas.style.margin = "0 auto 12px";
              canvas.style.maxWidth = "100%";
              canvas.style.border = "1px solid var(--divider)";
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              body.appendChild(canvas);
              return page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
            });
          });
        };
        for (var pageNum = 1; pageNum <= pagesToRender; pageNum++) _loop(pageNum);
        chain.then(function () {
          if (pdf.numPages > pagesToRender) {
            var more = document.createElement("p");
            more.className = "text-secondary";
            more.style.fontSize = "12px";
            more.textContent =
              "+" + (pdf.numPages - pagesToRender) + " more page(s) not shown here — Save / Share to view the full file.";
            body.appendChild(more);
          }
        });
      })
      .catch(function (e) {
        renderUnsupported(body, "Could not render this PDF (" + e.message + "). Use Save / Share instead.");
      });
  }

  function renderDocx(body, blob) {
    blob
      .arrayBuffer()
      .then(function (buffer) {
        return window.mammoth.convertToHtml({ arrayBuffer: buffer });
      })
      .then(function (result) {
        body.innerHTML = "";
        var content = document.createElement("div");
        content.className = "file-viewer-docx";
        content.innerHTML = result.value || "<p class=\"text-secondary\">(empty document)</p>";
        body.appendChild(content);
      })
      .catch(function (e) {
        renderUnsupported(body, "Could not render this document (" + e.message + "). Use Save / Share instead.");
      });
  }

  function renderExcel(body, blob) {
    blob
      .arrayBuffer()
      .then(function (buffer) {
        var workbook = window.XLSX.read(new Uint8Array(buffer), { type: "array" });
        var firstSheetName = workbook.SheetNames[0];
        var sheet = workbook.Sheets[firstSheetName];
        var rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        var capped = rows.slice(0, EXCEL_MAX_ROWS_SHOWN);

        body.innerHTML = "";
        var note = document.createElement("p");
        note.className = "text-secondary";
        note.style.fontSize = "12px";
        note.style.marginBottom = "8px";
        note.textContent =
          "Sheet “" + firstSheetName + "” — " + rows.length + " row" + (rows.length === 1 ? "" : "s") +
          (rows.length > EXCEL_MAX_ROWS_SHOWN ? " (showing first " + EXCEL_MAX_ROWS_SHOWN + ")" : "") + ".";
        body.appendChild(note);

        var tableWrap = document.createElement("div");
        tableWrap.style.overflowX = "auto";
        var table = document.createElement("table");
        table.className = "mono";
        table.style.borderCollapse = "collapse";
        table.style.width = "100%";
        table.style.fontSize = "12px";

        capped.forEach(function (row, rowIdx) {
          var tr = document.createElement("tr");
          row.forEach(function (cell) {
            var cellEl = document.createElement(rowIdx === 0 ? "th" : "td");
            cellEl.textContent = cell === null || cell === undefined ? "" : String(cell);
            cellEl.style.textAlign = "left";
            cellEl.style.padding = "5px 10px";
            cellEl.style.borderBottom = "1px solid var(--divider)";
            if (rowIdx === 0) {
              cellEl.style.position = "sticky";
              cellEl.style.top = "0";
              cellEl.style.backgroundColor = "var(--bg-paper-raised)";
            }
            tr.appendChild(cellEl);
          });
          table.appendChild(tr);
        });
        tableWrap.appendChild(table);
        body.appendChild(tableWrap);
      })
      .catch(function (e) {
        renderUnsupported(body, "Could not render this spreadsheet (" + e.message + "). Use Save / Share instead.");
      });
  }

  /** Open the in-app viewer for `blob` (named `filename`, of type `mimeType`). */
  function open(options) {
    var filename = options.filename || "file";
    var mimeType = options.mimeType || "";
    var blob = options.blob;
    var ext = extensionOf(filename);

    var body = buildChrome(filename, blob);
    renderLoading(body);

    if (mimeType.indexOf("image/") === 0 || ["png", "jpg", "jpeg", "gif", "webp", "svg"].indexOf(ext) !== -1) {
      renderImage(body, blob);
    } else if (mimeType === "application/pdf" || ext === "pdf") {
      renderPdf(body, blob);
    } else if (ext === "docx" || mimeType.indexOf("wordprocessingml") !== -1) {
      renderDocx(body, blob);
    } else if (["xlsx", "xls"].indexOf(ext) !== -1 || mimeType.indexOf("spreadsheetml") !== -1 || mimeType === "application/vnd.ms-excel") {
      renderExcel(body, blob);
    } else {
      renderUnsupported(body);
    }
  }

  window.PCC.fileViewer = { open: open, close: closeViewer };
})();
