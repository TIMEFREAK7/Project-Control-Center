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
    h1.style.marginBottom = "20px";
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
    upcomingField.style.marginTop = "10px";
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
    nomenEnabledLabel.style.gap = "8px";
    nomenEnabledLabel.style.fontSize = "13px";
    nomenEnabledLabel.style.marginTop = "8px";
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
    patternField.style.marginTop = "10px";
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
      "portfolio archive.</p>";

    var btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "10px";
    btnRow.style.marginTop = "10px";
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
    btnRow.appendChild(resetBtn);
    dataPanel.appendChild(btnRow);

    var lastSaved = document.createElement("p");
    lastSaved.className = "text-secondary mono";
    lastSaved.style.fontSize = "12px";
    lastSaved.style.marginTop = "12px";
    lastSaved.textContent =
      "Last autosaved: " + (data.meta.last_saved_at ? new Date(data.meta.last_saved_at).toLocaleString() : "never yet");
    dataPanel.appendChild(lastSaved);

    var lastExported = document.createElement("p");
    lastExported.className = "text-secondary mono";
    lastExported.style.fontSize = "12px";
    lastExported.style.marginTop = "2px";
    lastExported.textContent =
      "Last exported: " + (data.meta.last_exported_at ? new Date(data.meta.last_exported_at).toLocaleString() : "never yet");
    dataPanel.appendChild(lastExported);

    var reminderField = document.createElement("div");
    reminderField.className = "field";
    reminderField.style.marginTop = "12px";
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
        row.style.gap = "8px";
        row.style.marginTop = "8px";
        row.style.fontSize = "13px";

        var label = document.createElement("span");
        label.className = "mono";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = key.replace("pcc_corrupted_backup_", "");

        var btnGroup = document.createElement("span");
        btnGroup.style.display = "flex";
        btnGroup.style.gap = "6px";
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
