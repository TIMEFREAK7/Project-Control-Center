(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  function render(outlet) {
    var store = window.PCC.store;
    var data = store.get();

    function rerenderSettings() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var wrap = document.createElement("div");

    var h1 = document.createElement("h2");
    h1.textContent = "Settings";
    h1.style.marginBottom = "var(--space-5)";
    wrap.appendChild(h1);

    // --- General ---
    var generalPanel = document.createElement("div");
    generalPanel.className = "panel";
    generalPanel.style.maxWidth = "480px";
    generalPanel.innerHTML = "<h3 style='margin-bottom:14px;'>General</h3>";

    var companyField = document.createElement("div");
    companyField.className = "field";
    companyField.innerHTML = "<label>Company name</label>";
    var companyInput = document.createElement("input");
    companyInput.type = "text";
    companyInput.value = data.settings.company_name || "";
    companyInput.placeholder = "e.g. PepsiCo India Holdings";
    companyInput.oninput = function () {
      store.update(function (d) {
        d.settings.company_name = companyInput.value;
      });
      window.PCC.layout.refreshTitleBlock();
    };
    companyField.appendChild(companyInput);
    generalPanel.appendChild(companyField);

    // PCC Evolution Roadmap, Tier 3 ("final polish"): Report Template System — the
    // company logo half. One logo, portfolio-wide, reused in every printable report's
    // header (reports.js's two reports, Executive Center's Snapshot and Management
    // Pack). Bytes live in blobStore (IndexedDB) under the fixed key "company_logo",
    // same "binary bytes never live in the main JSON store" rule every other file this
    // app stores already follows — only the filename/mime_type live in settings.
    var logoField = document.createElement("div");
    logoField.className = "field";
    logoField.style.marginTop = "var(--space-3)";
    logoField.innerHTML = "<label>Company logo (used on printed reports)</label>";

    if (data.settings.company_logo_filename) {
      var logoPreviewRow = document.createElement("div");
      logoPreviewRow.style.display = "flex";
      logoPreviewRow.style.alignItems = "center";
      logoPreviewRow.style.gap = "var(--space-3)";
      logoPreviewRow.style.marginBottom = "var(--space-2)";

      var logoImg = document.createElement("img");
      logoImg.style.height = "36px";
      logoImg.style.maxWidth = "120px";
      logoImg.style.objectFit = "contain";
      logoImg.style.background = "var(--surface-2, #2a2a2a)";
      logoImg.style.borderRadius = "var(--radius-sm)";
      logoImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
      window.PCC.blobStore
        .getBlob("company_logo")
        .then(function (fileData) {
          if (fileData) logoImg.src = fileData;
        })
        .catch(function () {
          /* leave placeholder — preview just won't load, not fatal */
        });
      logoPreviewRow.appendChild(logoImg);

      var logoName = document.createElement("span");
      logoName.className = "text-secondary";
      logoName.style.fontSize = "var(--text-sm)";
      logoName.textContent = data.settings.company_logo_filename;
      logoPreviewRow.appendChild(logoName);

      var removeLogoBtn = document.createElement("button");
      removeLogoBtn.type = "button";
      removeLogoBtn.className = "btn btn--ghost";
      removeLogoBtn.textContent = "Remove Logo";
      removeLogoBtn.onclick = function () {
        window.PCC.blobStore.deleteBlob("company_logo").finally(function () {
          store.update(function (d) {
            d.settings.company_logo_filename = "";
            d.settings.company_logo_mime_type = "";
          });
          rerenderSettings();
        });
      };
      logoPreviewRow.appendChild(removeLogoBtn);

      logoField.appendChild(logoPreviewRow);
    }

    var logoInput = document.createElement("input");
    logoInput.type = "file";
    logoInput.accept = "image/*";
    logoInput.onchange = function () {
      var file = logoInput.files && logoInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        // Blob written FIRST, metadata only committed once that succeeds — same "never
        // orphan a reference" rule dailyLog.js's photo upload already established.
        window.PCC.blobStore
          .putBlob("company_logo", reader.result)
          .then(function () {
            store.update(function (d) {
              d.settings.company_logo_filename = file.name;
              d.settings.company_logo_mime_type = file.type || "";
            });
            window.PCC.notify("Logo saved.", "success");
            rerenderSettings();
          })
          .catch(function (e) {
            window.PCC.notify("Could not save the logo: " + e.message, "error");
          });
      };
      reader.onerror = function () {
        window.PCC.notify("Could not read that file.", "error");
      };
      reader.readAsDataURL(file);
    };
    logoField.appendChild(logoInput);
    generalPanel.appendChild(logoField);

    wrap.appendChild(generalPanel);

    // --- Reminder & Lookahead Windows (PCC Evolution Roadmap, Tier 3 "final polish") ---
    // Both used to be hardcoded module constants (DUE_SOON_WINDOW_DAYS in dashboard.js,
    // UPCOMING_WINDOW_DAYS in actionCentre.js) since the gates that introduced them —
    // now editable here, same "Remind me to export after" number-field pattern the Data
    // panel below already establishes.
    var windowsPanel = document.createElement("div");
    windowsPanel.className = "panel";
    windowsPanel.style.maxWidth = "480px";
    windowsPanel.innerHTML = "<h3 style='margin-bottom:6px;'>Reminder &amp; Lookahead Windows</h3>";

    var dueSoonField = document.createElement("div");
    dueSoonField.className = "field";
    dueSoonField.style.maxWidth = "260px";
    dueSoonField.innerHTML = "<label>Dashboard “Due Soon” window (days)</label>";
    var dueSoonInput = document.createElement("input");
    dueSoonInput.type = "number";
    dueSoonInput.min = "1";
    dueSoonInput.step = "1";
    dueSoonInput.value = data.settings.document_reminder_due_soon_days == null ? "14" : data.settings.document_reminder_due_soon_days;
    dueSoonInput.onchange = function () {
      var n = parseInt(dueSoonInput.value, 10);
      if (isNaN(n) || n < 1) n = 14;
      store.update(function (d) {
        d.settings.document_reminder_due_soon_days = n;
      });
      dueSoonInput.value = n;
    };
    dueSoonField.appendChild(dueSoonInput);
    windowsPanel.appendChild(dueSoonField);

    var upcomingField = document.createElement("div");
    upcomingField.className = "field";
    upcomingField.style.marginTop = "var(--space-3)";
    upcomingField.style.maxWidth = "260px";
    upcomingField.innerHTML = "<label>Action Centre “Upcoming” window (days)</label>";
    var upcomingInput = document.createElement("input");
    upcomingInput.type = "number";
    upcomingInput.min = "8";
    upcomingInput.step = "1";
    upcomingInput.value = data.settings.action_centre_upcoming_days == null ? "30" : data.settings.action_centre_upcoming_days;
    upcomingInput.title = "Must be at least 8 — the Due This Week bucket already covers days 1-7.";
    upcomingInput.onchange = function () {
      var n = parseInt(upcomingInput.value, 10);
      if (isNaN(n) || n < 8) n = 30;
      store.update(function (d) {
        d.settings.action_centre_upcoming_days = n;
      });
      upcomingInput.value = n;
    };
    upcomingField.appendChild(upcomingInput);
    windowsPanel.appendChild(upcomingField);

    wrap.appendChild(windowsPanel);

    // --- Document Nomenclature (Gate 16) ---
    var nomenPanel = document.createElement("div");
    nomenPanel.className = "panel";
    nomenPanel.style.maxWidth = "480px";
    nomenPanel.innerHTML =
      "<h3 style='margin-bottom:6px;'>Document Nomenclature</h3>" +
      "<p class='text-secondary' style='margin-top:0; font-size:13px;'>When uploading a document, its filename " +
      "is checked against this pattern and a non-blocking warning is shown on a mismatch — uploads are never " +
      "rejected. Use the literal tokens PROJECT, DISCIPLINE, DOCUMENTTYPE, NUMBER, and REV; any other characters " +
      "(like “-”) pass through as your own separators. Example: " +
      "<span class='mono'>ABC-ELE-RFI-001-REV02</span>.</p>";

    var nomenEnabledLabel = document.createElement("label");
    nomenEnabledLabel.style.display = "flex";
    nomenEnabledLabel.style.alignItems = "center";
    nomenEnabledLabel.style.gap = "var(--space-2)";
    nomenEnabledLabel.style.fontSize = "var(--text-sm)";
    nomenEnabledLabel.style.marginTop = "var(--space-2)";
    var nomenEnabledCheckbox = document.createElement("input");
    nomenEnabledCheckbox.type = "checkbox";
    nomenEnabledCheckbox.checked = data.settings.document_nomenclature_enabled !== false;
    nomenEnabledCheckbox.onchange = function () {
      store.update(function (d) {
        d.settings.document_nomenclature_enabled = nomenEnabledCheckbox.checked;
      });
    };
    nomenEnabledLabel.appendChild(nomenEnabledCheckbox);
    nomenEnabledLabel.appendChild(document.createTextNode("Check filenames against the pattern on upload"));
    nomenPanel.appendChild(nomenEnabledLabel);

    var patternField = document.createElement("div");
    patternField.className = "field";
    patternField.style.marginTop = "var(--space-3)";
    patternField.innerHTML = "<label>Pattern</label>";
    var patternInput = document.createElement("input");
    patternInput.type = "text";
    patternInput.className = "mono";
    patternInput.value = data.settings.document_nomenclature_pattern || "";
    patternInput.placeholder = "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV";
    patternInput.onchange = function () {
      store.update(function (d) {
        d.settings.document_nomenclature_pattern = patternInput.value.trim() || "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV";
      });
    };
    patternField.appendChild(patternInput);
    nomenPanel.appendChild(patternField);
    wrap.appendChild(nomenPanel);

    // --- Data management ---
    var dataPanel = document.createElement("div");
    dataPanel.className = "panel";
    dataPanel.style.maxWidth = "480px";
    dataPanel.innerHTML =
      "<h3 style='margin-bottom:6px;'>Data</h3>" +
      "<p class='text-secondary' style='margin-top:0; font-size:13px;'>Everything is autosaved to this browser as you work. " +
      "Before switching machines, export your data — it produces one file you carry with the app folder. " +
      "\u201cExport Document Archive\u201d separately downloads a .zip with a real folder per project, containing " +
      "the actual attached files \u2014 useful for browsing your documents outside the app, or as a growing " +
      "portfolio archive. \u201cExport as SQLite (Experimental)\u201d downloads a real, standalone .sqlite " +
      "file \u2014 openable in any SQLite tool \u2014 as a one-time snapshot; it is not a live-synced copy, so " +
      "editing it elsewhere never updates PCC.</p>";

    var btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "var(--space-3)";
    btnRow.style.marginTop = "var(--space-3)";
    btnRow.style.flexWrap = "wrap";

    var exportBtn = document.createElement("button");
    exportBtn.className = "btn btn--primary";
    exportBtn.textContent = "Export data file";
    exportBtn.onclick = function () {
      exportBtn.disabled = true;
      var originalLabel = exportBtn.textContent;
      exportBtn.textContent = "Preparing export\u2026";
      store
        .exportToFile()
        .then(function () {
          window.PCC.notify("Exported. Move this file with your app folder when you switch machines.", "success");
          if (window.PCC.layout.refreshBackupNudge) window.PCC.layout.refreshBackupNudge();
          rerenderSettings();
        })
        .catch(function (e) {
          window.PCC.notify("Export failed: " + e.message, "error");
          exportBtn.disabled = false;
          exportBtn.textContent = originalLabel;
        });
    };

    var exportArchiveBtn = document.createElement("button");
    exportArchiveBtn.className = "btn btn--ghost";
    exportArchiveBtn.textContent = "Export Document Archive";
    exportArchiveBtn.onclick = function () {
      var d = store.get();
      window.PCC.archive.exportAll(d.projects, d.documents);
    };

    // Architecture Upgrade Phase 5 (SQLite): a real, openable .sqlite file — a
    // one-way snapshot for inspecting your data with any SQLite tool (DB Browser for
    // SQLite, etc.) or as an additional portable backup format. Deliberately NOT part
    // of the app's actual data layer — editing this file elsewhere never flows back
    // into PCC, since there's no live cutover yet (see sqliteMigrationEngine.js's own
    // header). "Experimental" in the label and the title tooltip on purpose — this is
    // the isolated prototype from the Architecture Upgrade, not a supported backup
    // format PCC's own restore path understands.
    var exportSqliteBtn = document.createElement("button");
    exportSqliteBtn.className = "btn btn--ghost";
    exportSqliteBtn.textContent = "Export as SQLite (Experimental)";
    exportSqliteBtn.title = "A one-time snapshot for use with external SQLite tools. Editing it elsewhere does not update PCC.";
    exportSqliteBtn.onclick = function () {
      exportSqliteBtn.disabled = true;
      var originalLabel = exportSqliteBtn.textContent;
      exportSqliteBtn.textContent = "Preparing…";
      window.PCC.sqliteMigrationEngine
        .initSqlJsBrowser()
        .then(function (SQL) {
          var db = window.PCC.sqliteMigrationEngine.buildDatabase(SQL, store.get());
          var bytes = db.export();
          db.close();
          var blob = new Blob([bytes], { type: "application/x-sqlite3" });
          var filename = "PCC-Export-" + new Date().toISOString().slice(0, 10) + ".sqlite";
          return window.PCC.nativeFile.save(blob, filename);
        })
        .then(function () {
          window.PCC.notify(
            "Exported as a SQLite file — a one-time snapshot for external tools. Editing it elsewhere will not update PCC.",
            "success"
          );
        })
        .catch(function (e) {
          window.PCC.notify("SQLite export failed: " + e.message, "error");
        })
        .then(function () {
          exportSqliteBtn.disabled = false;
          exportSqliteBtn.textContent = originalLabel;
        });
    };

    var resetBtn = document.createElement("button");
    resetBtn.className = "btn btn--ghost";
    resetBtn.textContent = "Reset all data";
    resetBtn.onclick = function () {
      var confirmed = window.confirm(
        "This clears all data in this browser. Make sure you've exported first. Continue?"
      );
      if (!confirmed) return;
      store.resetAll();
      window.PCC.layout.refreshTitleBlock();
      if (window.PCC.layout.refreshBackupNudge) window.PCC.layout.refreshBackupNudge();
      window.PCC.router.render();
      window.PCC.notify("All data cleared.", "warning");
    };

    btnRow.appendChild(exportBtn);
    btnRow.appendChild(exportArchiveBtn);
    btnRow.appendChild(exportSqliteBtn);
    btnRow.appendChild(resetBtn);
    dataPanel.appendChild(btnRow);

    var lastSaved = document.createElement("p");
    lastSaved.className = "text-secondary mono";
    lastSaved.style.fontSize = "var(--text-sm)";
    lastSaved.style.marginTop = "var(--space-3)";
    lastSaved.textContent =
      "Last autosaved: " + (data.meta.last_saved_at ? new Date(data.meta.last_saved_at).toLocaleString() : "never yet");
    dataPanel.appendChild(lastSaved);

    var lastExported = document.createElement("p");
    lastExported.className = "text-secondary mono";
    lastExported.style.fontSize = "var(--text-sm)";
    lastExported.style.marginTop = "2px";
    lastExported.textContent =
      "Last exported: " + (data.meta.last_exported_at ? new Date(data.meta.last_exported_at).toLocaleString() : "never yet");
    dataPanel.appendChild(lastExported);

    var reminderField = document.createElement("div");
    reminderField.className = "field";
    reminderField.style.marginTop = "var(--space-3)";
    reminderField.style.maxWidth = "220px";
    reminderField.innerHTML = "<label>Remind me to export after (days)</label>";
    var reminderInput = document.createElement("input");
    reminderInput.type = "number";
    reminderInput.min = "0";
    reminderInput.step = "1";
    reminderInput.value = data.settings.backup_reminder_days === null || data.settings.backup_reminder_days === undefined ? "7" : data.settings.backup_reminder_days;
    reminderInput.title = "Set to 0 to turn the reminder banner off.";
    reminderInput.onchange = function () {
      var n = parseInt(reminderInput.value, 10);
      if (isNaN(n) || n < 0) n = 0;
      store.update(function (d) {
        d.settings.backup_reminder_days = n;
      });
      if (window.PCC.layout.refreshBackupNudge) window.PCC.layout.refreshBackupNudge();
    };
    reminderField.appendChild(reminderInput);
    dataPanel.appendChild(reminderField);

    wrap.appendChild(dataPanel);

    // --- Data recovery: preserved snapshots from any past corrupted-load event. Only
    // rendered when at least one exists, since an empty "nothing to recover" panel
    // sitting here permanently would just be clutter for the common case. ---
    var recoveryKeys = store.listRecoveryBackups ? store.listRecoveryBackups() : [];
    if (recoveryKeys.length > 0) {
      var recoveryPanel = document.createElement("div");
      recoveryPanel.className = "panel";
      recoveryPanel.style.maxWidth = "480px";
      recoveryPanel.style.borderColor = "var(--status-critical)";
      recoveryPanel.innerHTML =
        "<h3 style='margin-bottom:6px; color:var(--status-critical);'>Data Recovery</h3>" +
        "<p class='text-secondary' style='margin-top:0; font-size:13px;'>This browser's saved data couldn't be read at least once, and the unreadable copy was kept below instead of being silently discarded. Each one is the raw text from that moment \u2014 download and inspect it if you think real project data is in there.</p>";

      recoveryKeys.forEach(function (key) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.gap = "var(--space-2)";
        row.style.marginTop = "var(--space-2)";
        row.style.fontSize = "var(--text-sm)";

        var label = document.createElement("span");
        label.className = "mono";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = key.replace("pcc_corrupted_backup_", "");

        var btnGroup = document.createElement("span");
        btnGroup.style.display = "flex";
        btnGroup.style.gap = "var(--space-2)";
        btnGroup.style.flexShrink = "0";

        var downloadBtn = document.createElement("button");
        downloadBtn.className = "btn btn--ghost";
        downloadBtn.textContent = "Download";
        downloadBtn.onclick = function () {
          store.downloadRecoveryBackup(key);
        };

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn--ghost";
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = function () {
          if (!window.confirm("Delete this recovery snapshot? Make sure you've downloaded it if you might need it. This can't be undone.")) return;
          store.deleteRecoveryBackup(key);
          window.PCC.notify("Recovery snapshot deleted.", "info");
          rerenderSettings();
        };

        btnGroup.appendChild(downloadBtn);
        btnGroup.appendChild(deleteBtn);
        row.appendChild(label);
        row.appendChild(btnGroup);
        recoveryPanel.appendChild(row);
      });

      wrap.appendChild(recoveryPanel);
    }

    // --- Files folder note ---
    var filesPanel = document.createElement("div");
    filesPanel.className = "panel";
    filesPanel.style.maxWidth = "480px";
    filesPanel.innerHTML =
      "<h3 style='margin-bottom:6px;'>Documents storage</h3>" +
      "<p class='text-secondary' style='margin:0; font-size:13px;'>Uploaded documents are referenced from the " +
      "<span class='mono'>/files</span> folder next to this app, not stored inside the data file. When you copy " +
      "the app to a pen drive or cloud folder, copy <span class='mono'>/files</span> along with it.</p>";
    wrap.appendChild(filesPanel);

    outlet.appendChild(wrap);
  }

  window.PCC.pages.settings = render;
})();
