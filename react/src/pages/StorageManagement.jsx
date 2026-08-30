/* Storage Management — the pilot page for PCC's progressive React migration (master
 * prompt §1, priority 1: "React architecture and progressive migration").
 *
 * Chosen as the pilot deliberately: it's a self-contained, non-critical-path page (not on
 * anyone's daily-use golden path), it already sits behind a clean domain engine
 * (storageAnalyticsEngine.js) with zero DOM/store-write coupling, and it exercises real
 * React concerns worth proving out once — async state (Scan Storage), a list with a
 * per-item action (Delete Orphan File), and a window.confirm() gate — without dragging in
 * a big surface area. Every other page module stays exactly as it was; this is one
 * migrated page behind the same router contract, not a rewrite (§7).
 *
 * Reproduces the prior vanilla page's exact text, button labels, and CSS class names
 * (kpi-grid/kpi-card/panel/project-list/detail-card/btn/btn--primary/btn--ghost/
 * text-secondary/mono) — same visual result, same existing e2e test
 * (tests/test_storage_management_e2e.js) unchanged, only the implementation moved.
 */
import React, { useState } from "react";
import { formatBytes, projectName, getStorageSnapshot, scanStorage, deleteOrphanBlob } from "../services/storageService.js";

function KpiCard({ label, value, sub }) {
  return (
    <div className="panel kpi-card">
      <div className="kpi-card__label">{label}</div>
      <div className="kpi-card__value">{value}</div>
      {sub ? (
        <div className="text-secondary" style={{ fontSize: 12, marginTop: 4 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function BreakdownPanel({ heading, rows, labelFor }) {
  return (
    <div className="panel" style={{ marginTop: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-3)" }}>{heading}</h3>
      {rows.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          Nothing to show yet.
        </p>
      ) : (
        <div className="project-list">
          {rows.map((row, i) => (
            <div key={i} className="detail-card" style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
              <span>{labelFor(row)}</span>
              <span className="text-secondary" style={{ fontSize: 13 }}>
                {row.count} file{row.count === 1 ? "" : "s"} · {formatBytes(row.bytes)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StorageManagementPage() {
  const [snapshot, setSnapshot] = useState(() => getStorageSnapshot());
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);

  const { data, summary } = snapshot;

  function refreshSnapshot() {
    setSnapshot(getStorageSnapshot());
  }

  function handleScan() {
    setScanning(true);
    setScanError(null);
    scanStorage()
      .then((result) => {
        setScanResult(result);
        setScanning(false);
      })
      .catch((e) => {
        setScanError("Could not scan storage: " + e.message);
        setScanning(false);
      });
  }

  function handleDeleteOrphan(id) {
    if (!window.confirm("Permanently delete this orphan file? It has no matching record in PCC, so nothing else references it. This can't be undone.")) return;
    deleteOrphanBlob(id)
      .then(() => {
        setScanResult((prev) => (prev ? { ...prev, orphanBlobs: prev.orphanBlobs.filter((o) => o.id !== id) } : prev));
        window.PCC.notify("Orphan file deleted.", "info");
      })
      .catch((e) => {
        window.PCC.notify("Could not delete: " + e.message, "error");
      });
  }

  const bySourceRows = Object.keys(summary.bySource)
    .map((key) => summary.bySource[key])
    .sort((a, b) => b.bytes - a.bytes);

  const byProjectRows = Object.keys(summary.byProject)
    .map((key) => ({ projectId: key, ...summary.byProject[key] }))
    .sort((a, b) => b.bytes - a.bytes);

  return (
    <>
      <h2 className="focus-mode-hide" style={{ marginBottom: "var(--space-4)" }}>
        Storage Management
      </h2>

      <div className="panel focus-mode-hide" style={{ marginBottom: "var(--space-4)" }}>
        <p className="text-secondary" style={{ margin: 0, fontSize: 13 }}>
          How much space PCC is using across every document, photo, vendor file, knowledge base attachment, and schedule
          import — plus a Scan Storage tool that finds files with no matching record, or records with no matching file.
          Scanning never deletes anything automatically; you decide what to do with each finding.
        </p>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Total Storage Used" value={formatBytes(summary.totalBytes)} sub={`${summary.totalCount} file${summary.totalCount === 1 ? "" : "s"}`} />
        <KpiCard label="In Trash" value={formatBytes(summary.trashedBytes)} sub={`${summary.trashedCount} file${summary.trashedCount === 1 ? "" : "s"}`} />
        <KpiCard label="Possible Duplicates" value={formatBytes(summary.duplicateBytes)} sub={`${summary.duplicateCount} file${summary.duplicateCount === 1 ? "" : "s"}`} />
      </div>

      <BreakdownPanel heading="By Type" rows={bySourceRows} labelFor={(row) => row.label} />
      <BreakdownPanel
        heading="By Project"
        rows={byProjectRows}
        labelFor={(row) => (row.projectId === "__unassigned__" ? "Unassigned" : projectName(data, row.projectId))}
      />

      {summary.largestFiles.length > 0 ? (
        <div className="panel" style={{ marginTop: "var(--space-4)" }}>
          <h3 style={{ marginBottom: "var(--space-3)" }}>Largest Files</h3>
          <div className="project-list">
            {summary.largestFiles.map((r) => (
              <div key={r.id} className="detail-card" style={{ marginBottom: "var(--space-2)" }}>
                <strong>{r.filename}</strong>
                <br />
                <span className="text-secondary" style={{ fontSize: 12 }}>
                  {r.sourceLabel} · {projectName(data, r.projectId)} · {formatBytes(r.fileSize)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: "var(--space-4)" }}>
        <h3 style={{ marginBottom: "var(--space-3)" }}>Storage Integrity</h3>
        <button className="btn btn--primary" disabled={scanning} onClick={handleScan}>
          {scanning ? "Scanning…" : "Scan Storage"}
        </button>

        {scanError ? (
          <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>{scanError}</p>
        ) : null}

        {scanResult ? (
          <>
            <h4 style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
              Orphan Files ({scanResult.orphanBlobs.length}) — stored but no record references them
            </h4>
            {scanResult.orphanBlobs.length === 0 ? (
              <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
                None found — every stored file has a matching record.
              </p>
            ) : (
              <div className="project-list">
                {scanResult.orphanBlobs.map((o) => (
                  <div
                    key={o.id}
                    className="detail-card"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}
                  >
                    <span className="mono" style={{ fontSize: 12 }}>
                      {o.id} · ~{formatBytes(o.size)}
                    </span>
                    <button className="btn btn--ghost" onClick={() => handleDeleteOrphan(o.id)}>
                      Delete Orphan File
                    </button>
                  </div>
                ))}
              </div>
            )}

            <h4 style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
              Records With a Missing File ({scanResult.missingBlobRecords.length})
            </h4>
            {scanResult.missingBlobRecords.length === 0 ? (
              <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
                None found — every record's file is actually there.
              </p>
            ) : (
              <>
                <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
                  There is no file left to recover for these — review and decide whether to remove the record or re-upload
                  it from its own page.
                </p>
                <div className="project-list">
                  {scanResult.missingBlobRecords.map((r) => (
                    <div key={r.id} className="detail-card" style={{ marginBottom: "var(--space-2)" }}>
                      <strong>{r.filename}</strong>
                      <br />
                      <span className="text-secondary" style={{ fontSize: 12 }}>
                        {r.sourceLabel} · {projectName(data, r.projectId)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
