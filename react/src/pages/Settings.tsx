/* Settings — migrated to React (Post-Phase-5 Engineering Evolution, progressive React
 * migration, one page at a time — see StorageManagement.jsx for the pilot pattern this
 * follows).
 *
 * Reproduces the prior vanilla page's exact text, labels, and CSS class names
 * (panel/field/btn/btn--primary/btn--ghost/text-secondary/mono) — same visual result, only
 * the implementation moved. Every store/blobStore/archive/sqliteMigrationEngine/
 * sqliteBackupService/nativeFile call goes through settingsService.js, unchanged from the
 * vanilla page's own calls.
 *
 * Each `.field` div keeps its `<label>` as a sibling of its `<input>/<select>` (not wrapped
 * inside it) — several OTHER pages' tests locate a Settings field by its label text via a
 * `.field label` + `parentElement.querySelector("input, select, textarea")` helper (see
 * tests/test_document_classification_e2e.js), so this structure is load-bearing, not just
 * cosmetic.
 */
import React, { useState } from "react";
import {
  getData,
  updateSettings,
  refreshTitleBlock,
  refreshBackupNudge,
  getLogoBlob,
  saveLogo,
  removeLogo,
  exportDataFile,
  exportDocumentArchive,
  createFullBackup,
  saveFile,
  restoreFullBackup,
  resetAllData,
  rerenderApp,
  notify,
  listRecoveryBackups,
  downloadRecoveryBackup,
  deleteRecoveryBackup,
} from "../services/settingsService";

var BLANK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";

function LogoPreview({ filename }: { filename: string | undefined }) {
  const [src, setSrc] = useState(BLANK_IMG);
  React.useEffect(() => {
    let cancelled = false;
    getLogoBlob()
      .then((fileData) => {
        if (!cancelled && fileData) setSrc(fileData);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [filename]);
  return <img src={src} style={{ height: 36, maxWidth: 120, objectFit: "contain", background: "var(--surface-2, #2a2a2a)", borderRadius: "var(--radius-sm)" }} />;
}

export default function SettingsPage() {
  const [data, setData] = useState(() => getData());
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const settings = data.settings;

  function refresh() {
    setData(getData());
  }

  function handleCompanyNameInput(e: React.ChangeEvent<HTMLInputElement>) {
    updateSettings((s) => {
      s.company_name = e.target.value;
    });
    refreshTitleBlock();
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    saveLogo(file)
      .then(() => {
        notify("Logo saved.", "success");
        refresh();
      })
      .catch((err: Error) => {
        notify("Could not save the logo: " + err.message, "error");
      });
  }

  function handleRemoveLogo() {
    removeLogo().then(refresh);
  }

  function handleDueSoonChange(e: React.ChangeEvent<HTMLInputElement>) {
    let n = parseInt(e.target.value, 10);
    if (isNaN(n) || n < 1) n = 14;
    updateSettings((s) => {
      s.document_reminder_due_soon_days = n;
    });
    refresh();
  }

  function handleUpcomingChange(e: React.ChangeEvent<HTMLInputElement>) {
    let n = parseInt(e.target.value, 10);
    if (isNaN(n) || n < 8) n = 30;
    updateSettings((s) => {
      s.action_centre_upcoming_days = n;
    });
    refresh();
  }

  function handleNomenEnabledChange(e: React.ChangeEvent<HTMLInputElement>) {
    updateSettings((s) => {
      s.document_nomenclature_enabled = e.target.checked;
    });
    refresh();
  }

  function handlePatternChange(e: React.ChangeEvent<HTMLInputElement>) {
    updateSettings((s) => {
      s.document_nomenclature_pattern = e.target.value.trim() || "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV";
    });
    refresh();
  }

  function handleExport() {
    setExporting(true);
    exportDataFile()
      .then(() => {
        notify("Exported. Move this file with your app folder when you switch machines.", "success");
        refreshBackupNudge();
        refresh();
      })
      .catch((e: Error) => {
        notify("Export failed: " + e.message, "error");
      })
      .then(() => setExporting(false));
  }

  function handleExportArchive() {
    exportDocumentArchive();
  }

  function handleFullBackup() {
    setBackingUp(true);
    createFullBackup()
      .then((result) => {
        const filename = "PCC-Full-Backup-" + new Date().toISOString().slice(0, 10) + ".zip";
        return saveFile(result.blob, filename).then(() => {
          let msg = "Full backup downloaded (" + result.fileCount + " file" + (result.fileCount === 1 ? "" : "s") + " included).";
          if (result.skipped > 0) {
            msg += " " + result.skipped + " file" + (result.skipped === 1 ? "" : "s") + " had no stored content and " + (result.skipped === 1 ? "was" : "were") + " skipped.";
          }
          notify(msg, "success");
          refreshBackupNudge();
        });
      })
      .catch((e: Error) => {
        notify("Full backup failed: " + e.message, "error");
      })
      .then(() => setBackingUp(false));
  }

  function handleRestoreFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const confirmed = window.confirm(
      "Restoring replaces ALL current data in this browser with the contents of “" + file.name + "”. This can't be undone. Make sure you've backed up your current data first if you want to keep it. Continue?"
    );
    if (!confirmed) {
      e.target.value = "";
      return;
    }
    setRestoring(true);
    restoreFullBackup(file)
      .then((info) => {
        notify("Full backup restored (" + info.restoredFileCount + " file" + (info.restoredFileCount === 1 ? "" : "s") + ").", "success");
        refreshTitleBlock();
        refreshBackupNudge();
        rerenderApp();
      })
      .catch((err: Error) => {
        notify("Restore failed: " + err.message, "error");
      })
      .then(() => {
        setRestoring(false);
        e.target.value = "";
      });
  }

  function handleReset() {
    if (!window.confirm("This clears all data in this browser. Make sure you've exported first. Continue?")) return;
    resetAllData();
    refreshTitleBlock();
    refreshBackupNudge();
    rerenderApp();
    notify("All data cleared.", "warning");
  }

  function handleReminderDaysChange(e: React.ChangeEvent<HTMLInputElement>) {
    let n = parseInt(e.target.value, 10);
    if (isNaN(n) || n < 0) n = 0;
    updateSettings((s) => {
      s.backup_reminder_days = n;
    });
    refreshBackupNudge();
    refresh();
  }

  function handleDeleteRecovery(key: string) {
    if (!window.confirm("Delete this recovery snapshot? Make sure you've downloaded it if you might need it. This can't be undone.")) return;
    deleteRecoveryBackup(key);
    notify("Recovery snapshot deleted.", "info");
    refresh();
  }

  const recoveryKeys = listRecoveryBackups();

  return (
    <div>
      <h2 style={{ marginBottom: "var(--space-5)" }}>Settings</h2>

      <div className="panel" style={{ maxWidth: 480 }}>
        <h3 style={{ marginBottom: 14 }}>General</h3>

        <div className="field">
          <label htmlFor="settingsfield-company_name">Company name</label>
          <input id="settingsfield-company_name" type="text" defaultValue={settings.company_name || ""} placeholder="e.g. PepsiCo India Holdings" onChange={handleCompanyNameInput} />
        </div>

        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="settingsfield-company_logo">Company logo (used on printed reports)</label>
          {settings.company_logo_filename ? (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
              <LogoPreview filename={settings.company_logo_filename} />
              <span className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
                {settings.company_logo_filename}
              </span>
              <button type="button" className="btn btn--ghost" onClick={handleRemoveLogo}>
                Remove Logo
              </button>
            </div>
          ) : null}
          <input id="settingsfield-company_logo" type="file" accept="image/*" onChange={handleLogoChange} />
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 480 }}>
        <h3 style={{ marginBottom: 6 }}>Reminder &amp; Lookahead Windows</h3>

        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="settingsfield-due_soon_days">Dashboard "Due Soon" window (days)</label>
          <input
            id="settingsfield-due_soon_days"
            type="number"
            min="1"
            step="1"
            defaultValue={settings.document_reminder_due_soon_days == null ? "14" : settings.document_reminder_due_soon_days}
            key={"due-soon-" + settings.document_reminder_due_soon_days}
            onChange={handleDueSoonChange}
          />
        </div>

        <div className="field" style={{ marginTop: "var(--space-3)", maxWidth: 260 }}>
          <label htmlFor="settingsfield-upcoming_days">Action Centre "Upcoming" window (days)</label>
          <input
            id="settingsfield-upcoming_days"
            type="number"
            min="8"
            step="1"
            defaultValue={settings.action_centre_upcoming_days == null ? "30" : settings.action_centre_upcoming_days}
            key={"upcoming-" + settings.action_centre_upcoming_days}
            title="Must be at least 8 — the Due This Week bucket already covers days 1-7."
            onChange={handleUpcomingChange}
          />
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 480 }}>
        <h3 style={{ marginBottom: 6 }}>Document Nomenclature</h3>
        <p className="text-secondary" style={{ marginTop: 0, fontSize: 13 }}>
          When uploading a document, its filename is checked against this pattern and a non-blocking warning is shown on a
          mismatch — uploads are never rejected. Use the literal tokens PROJECT, DISCIPLINE, DOCUMENTTYPE, NUMBER, and REV;
          any other characters (like "-") pass through as your own separators. Example: <span className="mono">ABC-ELE-RFI-001-REV02</span>.
        </p>

        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
          <input type="checkbox" checked={settings.document_nomenclature_enabled !== false} onChange={handleNomenEnabledChange} />
          Check filenames against the pattern on upload
        </label>

        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="settingsfield-nomenclature_pattern">Pattern</label>
          <input
            id="settingsfield-nomenclature_pattern"
            type="text"
            className="mono"
            defaultValue={settings.document_nomenclature_pattern || ""}
            key={"pattern-" + settings.document_nomenclature_pattern}
            placeholder="PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV"
            onChange={handlePatternChange}
          />
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 480 }}>
        <h3 style={{ marginBottom: 6 }}>Data</h3>
        <p className="text-secondary" style={{ marginTop: 0, fontSize: 13 }}>
          Everything is autosaved to this browser as you work. Before switching machines, export your data — it produces
          one file you carry with the app folder. "Export Document Archive" separately downloads a .zip with a real folder
          per project, containing the actual attached files — useful for browsing your documents outside the app, or as a
          growing portfolio archive. "Full Backup (SQLite)" downloads a complete, restorable backup — every record AND your
          document/photo files — as one .zip containing a real, standalone .sqlite database (openable in any SQLite tool)
          plus your files; restore it anytime with "Restore from Full Backup," which replaces all current data.
        </p>

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
          <button className="btn btn--primary" disabled={exporting} onClick={handleExport}>
            {exporting ? "Preparing export…" : "Export data file"}
          </button>
          <button className="btn btn--ghost" onClick={handleExportArchive}>
            Export Document Archive
          </button>
          <button
            className="btn btn--ghost"
            disabled={backingUp}
            title="A complete, restorable backup — every record and your document/photo files — as one .zip containing a real, standalone .sqlite database (openable in any SQLite tool) plus your files."
            onClick={handleFullBackup}
          >
            {backingUp ? "Preparing…" : "Create Full Backup (SQLite)"}
          </button>
          <button
            className="btn btn--ghost"
            disabled={restoring}
            title="Restore a Full Backup .zip created by this app, replacing all current data."
            onClick={() => document.getElementById("settings-restore-input")?.click()}
          >
            {restoring ? "Restoring…" : "Restore from Full Backup"}
          </button>
          <input id="settings-restore-input" type="file" accept=".zip" style={{ display: "none" }} onChange={handleRestoreFileChange} />
          <button className="btn btn--ghost" onClick={handleReset}>
            Reset all data
          </button>
        </div>

        <p className="text-secondary mono" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>
          Last autosaved: {data.meta.last_saved_at ? new Date(data.meta.last_saved_at).toLocaleString() : "never yet"}
        </p>
        <p className="text-secondary mono" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
          Last exported: {data.meta.last_exported_at ? new Date(data.meta.last_exported_at).toLocaleString() : "never yet"}
        </p>

        <div className="field" style={{ marginTop: "var(--space-3)", maxWidth: 220 }}>
          <label htmlFor="settingsfield-reminder_days">Remind me to export after (days)</label>
          <input
            id="settingsfield-reminder_days"
            type="number"
            min="0"
            step="1"
            defaultValue={settings.backup_reminder_days == null ? "7" : settings.backup_reminder_days}
            key={"reminder-" + settings.backup_reminder_days}
            title="Set to 0 to turn the reminder banner off."
            onChange={handleReminderDaysChange}
          />
        </div>
      </div>

      {recoveryKeys.length > 0 ? (
        <div className="panel" style={{ maxWidth: 480, borderColor: "var(--status-critical)" }}>
          <h3 style={{ marginBottom: 6, color: "var(--status-critical)" }}>Data Recovery</h3>
          <p className="text-secondary" style={{ marginTop: 0, fontSize: 13 }}>
            This browser's saved data couldn't be read at least once, and the unreadable copy was kept below instead of
            being silently discarded. Each one is the raw text from that moment — download and inspect it if you think real
            project data is in there.
          </p>
          {recoveryKeys.map((key) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-2)", fontSize: "var(--text-sm)" }}>
              <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {key.replace("pcc_corrupted_backup_", "")}
              </span>
              <span style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                <button className="btn btn--ghost" onClick={() => downloadRecoveryBackup(key)}>
                  Download
                </button>
                <button className="btn btn--ghost" onClick={() => handleDeleteRecovery(key)}>
                  Delete
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="panel" style={{ maxWidth: 480 }}>
        <h3 style={{ marginBottom: 6 }}>Documents storage</h3>
        <p className="text-secondary" style={{ margin: 0, fontSize: 13 }}>
          Uploaded documents are referenced from the <span className="mono">/files</span> folder next to this app, not
          stored inside the data file. When you copy the app to a pen drive or cloud folder, copy{" "}
          <span className="mono">/files</span> along with it.
        </p>
      </div>
    </div>
  );
}
