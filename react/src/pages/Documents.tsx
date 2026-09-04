import React, { useState } from "react";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  CRITICALITY_LABELS,
  STATUS_LABELS,
  BULK_STATUS_LABELS,
  LARGE_FILE_WARNING_BYTES,
  getData,
  projectName,
  latestDocuments,
  revisionsFor,
  formatBytes,
  formatRevisionToken,
  extractionSummary,
  categoryLabel,
  openStoredFile,
  documentMatchesFilters,
  trashDocumentGroup,
  restoreDocumentGroup,
  permanentlyDeleteDocumentGroup,
  trashedAgoLabel,
  readAndExtractFile,
  findDuplicateMatches,
  nomenclatureCheck,
  saveDocument,
  updateDocumentStatus,
  readAndFingerprintForBulk,
  findBulkDuplicateMatch,
  commitBulkImport,
  viewMeeting,
  viewVendor,
  viewActivityInSchedule,
  getProjectContext,
  setProjectContext,
  DocumentFilters,
  DocumentFormState,
  ReadExtractedFile,
  DuplicateMatch,
  BulkEntry,
  BulkImportResult,
} from "../services/documentsService";
import type { PCCStoreData, PCCDocument, PCCDocumentExtraction, PCCProject } from "../types/pcc";

interface ActivityOption {
  id: string;
  label: string;
}

function activityOptionsFor(data: PCCStoreData, projectId: string): ActivityOption[] {
  var scheduleNameById: { [id: string]: string | undefined } = {};
  data.schedules
    .filter(function (s) {
      return s.project_id === projectId;
    })
    .forEach(function (s) {
      scheduleNameById[s.id] = s.name;
    });
  return data.activities
    .filter(function (a) {
      return a.project_id === projectId;
    })
    .map(function (a) {
      return { id: a.id, label: (scheduleNameById[a.schedule_id] || "(schedule)") + ": " + (a.name || "(unnamed activity)") };
    });
}

function ExcelPreview({ extraction }: { extraction: PCCDocumentExtraction }) {
  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
        Extracted from sheet “{extraction.sheet_name}” — {extraction.rows.length} row{extraction.rows.length === 1 ? "" : "s"}
        {extraction.truncated ? " (showing first 300 rows/20 columns)" : ""}. This data will be saved with the document.
      </p>
      <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto", border: "1px solid var(--divider)", borderRadius: "var(--radius-sm)" }}>
        <table className="mono" style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr>
              {extraction.headers.map((h: string, i: number) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left",
                    padding: "var(--space-2) var(--space-3)",
                    borderBottom: "1px solid var(--divider)",
                    position: "sticky",
                    top: 0,
                    backgroundColor: "var(--bg-paper-raised)",
                  }}
                >
                  {h || "—"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {extraction.rows.slice(0, 15).map((row: string[], ri: number) => (
              <tr key={ri}>
                {row.map((cell: string, ci: number) => (
                  <td key={ci} style={{ padding: "var(--space-1) var(--space-3)", borderBottom: "1px solid var(--divider)" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {extraction.rows.length > 15 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
          +{extraction.rows.length - 15} more row(s) not shown here, but saved.
        </p>
      ) : null}
    </div>
  );
}

function TextPreview({ extraction }: { extraction: PCCDocumentExtraction }) {
  var TEXT_CHAR_CAP = 50000;
  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
        {extraction.char_count.toLocaleString()} character{extraction.char_count === 1 ? "" : "s"} extracted
        {extraction.page_count ? " from " + extraction.page_count + " page" + (extraction.page_count === 1 ? "" : "s") : ""}
        {extraction.truncated ? " (showing first " + TEXT_CHAR_CAP.toLocaleString() + " characters)" : ""}. This text will be saved with the document.
      </p>
      <div
        className="mono"
        style={{
          whiteSpace: "pre-wrap",
          fontSize: "var(--text-sm)",
          maxHeight: 220,
          overflowY: "auto",
          border: "1px solid var(--divider)",
          borderRadius: "var(--radius-sm)",
          padding: "10px var(--space-3)",
          backgroundColor: "var(--bg-default)",
        }}
      >
        {extraction.text.trim() ? extraction.text : "(No extractable text found in this file.)"}
      </div>
    </div>
  );
}

function ExtractionPreview({ extraction }: { extraction: PCCDocumentExtraction | null | undefined }) {
  if (!extraction) return null;
  return extraction.type === "excel" ? <ExcelPreview extraction={extraction} /> : <TextPreview extraction={extraction} />;
}

function DuplicateWarning({ matches, data, onAcknowledge, onCancel }: { matches: DuplicateMatch[]; data: PCCStoreData; onAcknowledge: () => void; onCancel: () => void }) {
  return (
    <div
      style={{
        border: "1px solid var(--status-at-risk)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        marginTop: "var(--space-3)",
        background: "rgba(214, 158, 46, 0.08)",
      }}
    >
      <p style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
        Possible duplicate {matches.length === 1 ? "record" : "records"} found
      </p>
      {matches.map(function (m, i) {
        return (
          <div key={i} style={{ fontSize: "var(--text-sm)", padding: "var(--space-2) 0", borderTop: "1px solid var(--divider)" }}>
            <div>
              <strong>{m.record.filename}</strong>
              <br />
              {projectName(data, m.record.project_id)} · {new Date(m.record.uploaded_at || "").toLocaleDateString()} · {CATEGORY_LABELS[m.record.category || ""] || m.record.category}
              <br />
              <span className="text-secondary">{m.reason}</span>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <button className="btn btn--ghost" onClick={() => openStoredFile(m.record)}>
                Open Existing
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <button className="btn btn--ghost" onClick={onAcknowledge}>
          Continue Anyway
        </button>
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel Upload
        </button>
      </div>
    </div>
  );
}

function NomenclatureNotice({ data, pendingFile, form }: { data: PCCStoreData; pendingFile: ReadExtractedFile | null; form: DocumentFormState }) {
  var result = nomenclatureCheck(data, pendingFile, form);
  if (!result) return null;
  var ok = result.matches;
  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        padding: "10px var(--space-3)",
        marginTop: "var(--space-2)",
        fontSize: "var(--text-sm)",
        border: ok ? "1px solid var(--status-on_track, #3fa66a)" : "1px solid var(--status-at-risk)",
        background: ok ? "rgba(31, 157, 108, 0.08)" : "rgba(214, 158, 46, 0.08)",
      }}
    >
      {ok
        ? "Filename matches the configured naming convention."
        : "Filename doesn't match the configured naming convention. Expected: “" +
          result.expected +
          "” (got “" +
          result.stem +
          "”). This is a warning only — the document can still be saved as-is."}
    </div>
  );
}

interface UploadFormPrefill {
  projectId?: string;
  activityId?: string;
  category?: string;
  documentTypeId?: string;
  discipline?: string;
  documentNumber?: string;
  revision?: string;
  packageId?: string;
  contractOrPo?: string;
  vendorId?: string;
  priority?: string;
  criticality?: string;
  status?: string;
  remarks?: string;
  meetingId?: string;
  revisionGroupId?: string;
}

interface UploadFormProps {
  data: PCCStoreData;
  prefill: UploadFormPrefill;
  onSaved: () => void;
  onCancel: () => void;
}

function UploadForm({ data, prefill, onSaved, onCancel }: UploadFormProps) {
  var activeProjects = data.projects.filter(function (p) {
    return !p.archived;
  });
  var activeDocTypes = window.PCC.documentTypes ? window.PCC.documentTypes.activeTypes() : [];

  const [form, setForm] = useState<DocumentFormState>(function () {
    return {
      projectId: prefill.projectId || (activeProjects[0] && activeProjects[0].id) || "",
      activityId: prefill.activityId || "",
      category: prefill.category || "contract",
      documentTypeId: prefill.documentTypeId || "",
      discipline: prefill.discipline || "",
      documentNumber: prefill.documentNumber || "",
      revision: prefill.revision || "00",
      packageId: prefill.packageId || "",
      contractOrPo: prefill.contractOrPo || "",
      vendorId: prefill.vendorId || "",
      priority: prefill.priority || "medium",
      criticality: prefill.criticality || "",
      status: prefill.status || "draft",
      remarks: prefill.remarks || "",
      meetingId: prefill.meetingId || "",
      revisionGroupId: prefill.revisionGroupId || "",
    };
  });
  const [pendingFile, setPendingFile] = useState<ReadExtractedFile | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [readingLabel, setReadingLabel] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  function set(key: keyof DocumentFormState, value: string) {
    setForm(function (prev) {
      return Object.assign({}, prev, { [key]: value });
    });
  }

  function handleProjectChange(projectId: string) {
    set("projectId", projectId);
    set("activityId", "");
    if (pendingFile && pendingFile.hash) {
      setDuplicateMatches(findDuplicateMatches(data, pendingFile, projectId));
      setDuplicateAcknowledged(false);
    }
  }

  function handleDocTypeChange(documentTypeId: string) {
    set("documentTypeId", documentTypeId);
    var chosen = activeDocTypes.find(function (t) {
      return t.id === documentTypeId;
    });
    set("criticality", chosen ? chosen.default_criticality || "" : "");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    setReadError(null);
    setDuplicateMatches([]);
    setDuplicateAcknowledged(false);
    var extMatch = /\.([a-z0-9]+)$/i.exec(file.name || "");
    var ext = extMatch ? extMatch[1].toLowerCase() : "";
    setReadingLabel(ext === "docx" ? "Reading Word document…" : ext === "pdf" ? "Reading PDF…" : "Reading spreadsheet…");
    readAndExtractFile(file).then(
      function (result) {
        setReadingLabel(null);
        setPendingFile(result);
        setDuplicateMatches(findDuplicateMatches(data, result, form.projectId));
      },
      function (err) {
        setReadingLabel(null);
        setReadError(err.message);
        setPendingFile(null);
      }
    );
  }

  var blockedByDuplicate = duplicateMatches.length > 0 && !duplicateAcknowledged;

  function handleSave() {
    if (!pendingFile || !form.projectId || blockedByDuplicate) return;
    setSaving(true);
    saveDocument(data, form, pendingFile, duplicateMatches)
      .then(function () {
        window.PCC.notify("Document saved — the original file is stored with it. Export soon to back it up.", "success");
        onSaved();
      })
      .catch(function (e) {
        window.PCC.notify("Could not store the file: " + e.message, "error");
        setSaving(false);
      });
  }

  var linkedMeeting = form.meetingId
    ? data.meetings.find(function (m) {
        return m.id === form.meetingId;
      })
    : null;
  var activityOptions = activityOptionsFor(data, form.projectId);

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{form.revisionGroupId ? "Upload New Revision" : "Add Document"}</h3>
      {linkedMeeting ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: -8, marginBottom: "var(--space-4)" }}>
          Linked to meeting: “{linkedMeeting.title}” ({linkedMeeting.meeting_date})
        </p>
      ) : null}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="docfield-project_id">Project *</label>
          {activeProjects.length === 0 ? (
            <select id="docfield-project_id" disabled>
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select id="docfield-project_id" value={form.projectId} onChange={(e) => handleProjectChange(e.target.value)}>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "(unnamed project)"}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="field">
          <label htmlFor="docfield-activity_id">Linked Activity (optional)</label>
          <select id="docfield-activity_id" value={form.activityId} onChange={(e) => set("activityId", e.target.value)}>
            <option value="">(none)</option>
            {activityOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="docfield-category">Category</label>
          <select id="docfield-category" value={form.category} onChange={(e) => set("category", e.target.value)}>
            {window.PCC.store.DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] || c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h4 className="text-secondary" style={{ margin: "14px 0 var(--space-2)", fontSize: "var(--text-sm)" }}>
        Classification (optional)
      </h4>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="docfield-document_type_id">Document Type</label>
          <select id="docfield-document_type_id" value={form.documentTypeId} onChange={(e) => handleDocTypeChange(e.target.value)}>
            <option value="">(none)</option>
            {activeDocTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name + (t.code ? " (" + t.code + ")" : "")}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="docfield-discipline">Discipline</label>
          <input type="text" id="docfield-discipline" value={form.discipline} onChange={(e) => set("discipline", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="docfield-document_number">Document Number</label>
          <input type="text" id="docfield-document_number" value={form.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="docfield-revision">Revision</label>
          <input type="text" id="docfield-revision" value={form.revision} onChange={(e) => set("revision", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="docfield-package_id">Package</label>
          <select id="docfield-package_id" value={form.packageId} onChange={(e) => set("packageId", e.target.value)}>
            <option value="">(none)</option>
            {data.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name + (p.code ? " (" + p.code + ")" : "")}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="docfield-contract_or_po">Contract / PO</label>
          <input type="text" id="docfield-contract_or_po" value={form.contractOrPo} onChange={(e) => set("contractOrPo", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="docfield-vendor_id">Vendor</label>
          <select id="docfield-vendor_id" value={form.vendorId} onChange={(e) => set("vendorId", e.target.value)}>
            <option value="">(none)</option>
            {data.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor_name || "(unnamed vendor)"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="docfield-priority">Priority</label>
          <select id="docfield-priority" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {["low", "medium", "high"].map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="docfield-criticality">Criticality</label>
          <select id="docfield-criticality" value={form.criticality} onChange={(e) => set("criticality", e.target.value)}>
            <option value="">(not set)</option>
            {window.PCC.store.DOCUMENT_TYPE_CRITICALITY_LEVELS.map((c) => (
              <option key={c} value={c}>
                {CRITICALITY_LABELS[c] || c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="docfield-status">Status</label>
          <select id="docfield-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
            {window.PCC.store.DOCUMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] || s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginTop: "var(--space-2)" }}>
        <label htmlFor="docfield-remarks">Remarks</label>
        <textarea id="docfield-remarks" rows={2} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="docfield-file">File (.xlsx, .xls, .docx, .pdf)</label>
        <input type="file" id="docfield-file" accept=".xlsx,.xls,.docx,.pdf" onChange={handleFileChange} />
      </div>

      {readingLabel ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          {readingLabel}
        </p>
      ) : null}
      {readError ? (
        <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>{readError}</p>
      ) : null}

      {pendingFile ? (
        <>
          <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
            <strong>{pendingFile.name}</strong> · {formatBytes(pendingFile.size)}
          </p>
          {pendingFile.size > LARGE_FILE_WARNING_BYTES ? (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--status-at-risk)", marginTop: "var(--space-1)" }}>
              This is a fairly large file. The original is stored with this document, and browsers typically cap local storage around
              5–10MB total — export your data soon after saving large files so this doesn't get lost if that limit is hit.
            </p>
          ) : null}

          {duplicateMatches.length > 0 && !duplicateAcknowledged ? (
            <DuplicateWarning
              matches={duplicateMatches}
              data={data}
              onAcknowledge={() => setDuplicateAcknowledged(true)}
              onCancel={() => {
                setPendingFile(null);
                setDuplicateMatches([]);
                setDuplicateAcknowledged(false);
              }}
            />
          ) : null}

          <NomenclatureNotice data={data} pendingFile={pendingFile} form={form} />

          {pendingFile.extraction ? (
            <ExtractionPreview extraction={pendingFile.extraction} />
          ) : (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
              No data could be extracted from this file.
            </p>
          )}
        </>
      ) : null}

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <button className="btn btn--primary" disabled={!pendingFile || !form.projectId || blockedByDuplicate || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save Document"}
        </button>
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface BulkImportPanelProps {
  data: PCCStoreData;
  initialProjectId: string;
  onClose: () => void;
  onImported: () => void;
}

function BulkImportPanel({ data, initialProjectId, onClose, onImported }: BulkImportPanelProps) {
  const [projectId, setProjectId] = useState(initialProjectId || (data.projects.find((p) => !p.archived) || ({} as PCCProject)).id || "");
  const [category, setCategory] = useState("other");
  const [discipline, setDiscipline] = useState("");
  const [files, setFiles] = useState<BulkEntry[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<BulkImportResult | null>(null);

  var activeProjects = data.projects.filter(function (p) {
    return !p.archived;
  });

  function scanFiles(fileList: FileList) {
    var picked = Array.prototype.slice.call(fileList) as File[];
    if (picked.length === 0) return;
    setSummary(null);
    var entries: BulkEntry[] = picked.map(function (file) {
      return { file: file, name: file.name, size: file.size, type: file.type, status: "scanning", hash: null, hashMethod: null, dataUri: null, duplicateMatch: null, errorMessage: null };
    });
    setFiles((prev) => prev.concat(entries));

    entries.reduce(function (chain: Promise<void>, entry) {
      return chain.then(function () {
        return readAndFingerprintForBulk(entry.file).then(
          function (result) {
            entry.hash = result.hash;
            entry.hashMethod = result.hashMethod;
            entry.dataUri = result.dataUri;
            var liveData = { documents: window.PCC.store.get().documents } as PCCStoreData;
            entry.duplicateMatch = projectId ? findBulkDuplicateMatch(liveData, entry, projectId) : null;
            entry.status = entry.duplicateMatch ? "duplicate" : "ready";
            setFiles((prev) => prev.slice());
          },
          function () {
            entry.status = "error";
            entry.errorMessage = "Could not read this file.";
            setFiles((prev) => prev.slice());
          }
        );
      });
    }, Promise.resolve());
  }

  function handleProjectChange(newProjectId: string) {
    setProjectId(newProjectId);
    var liveData = { documents: window.PCC.store.get().documents } as PCCStoreData;
    files.forEach(function (entry) {
      if (entry.status === "scanning" || entry.status === "error" || !entry.hash) return;
      entry.duplicateMatch = findBulkDuplicateMatch(liveData, entry, newProjectId);
      entry.status = entry.duplicateMatch ? "duplicate" : "ready";
    });
    setFiles((prev) => prev.slice());
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleImport() {
    if (!projectId) return;
    var toImport = files.filter(function (e) {
      return e.status === "ready" || e.status === "duplicate";
    });
    if (toImport.length === 0) return;
    setProgress({ done: 0, total: toImport.length });
    commitBulkImport(files, projectId, category, "", discipline, function (done, total) {
      setProgress({ done: done, total: total });
    }).then(function (result) {
      setSummary(result);
      setProgress(null);
      setFiles([]);
      window.PCC.notify(
        "Bulk import complete: " +
          result.imported +
          " file" +
          (result.imported === 1 ? "" : "s") +
          " imported" +
          (result.duplicates ? " (" + result.duplicates + " flagged as possible duplicates)" : "") +
          (result.errors ? ", " + result.errors + " failed" : "") +
          (result.skipped ? ", " + result.skipped + " skipped" : "") +
          ".",
        result.errors ? "warning" : "success"
      );
      onImported();
    });
  }

  var totalCount = files.length;
  var readyCount = files.filter((e) => e.status === "ready").length;
  var duplicateCount = files.filter((e) => e.status === "duplicate").length;
  var errorCount = files.filter((e) => e.status === "error").length;
  var scanningCount = files.filter((e) => e.status === "scanning").length;
  var totalSize = files.reduce((sum, e) => sum + (e.size || 0), 0);
  var importableCount = readyCount + duplicateCount;

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-2)" }}>Bulk Import</h3>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
        Import many files at once, all assigned to the same project. Each file is checked for duplicates against this project's existing
        documents before import — a possible duplicate is still imported and flagged, never silently skipped, so you can review it
        afterward.
      </p>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="docbulkfield-project_id">Project *</label>
          {activeProjects.length === 0 ? (
            <select id="docbulkfield-project_id" disabled>
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select id="docbulkfield-project_id" value={projectId} onChange={(e) => handleProjectChange(e.target.value)}>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "(unnamed project)"}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="field">
          <label htmlFor="docbulkfield-category">Category (applied to every file)</label>
          <select id="docbulkfield-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {window.PCC.store.DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] || c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="docbulkfield-discipline">Discipline (applied to every file, optional)</label>
          <input type="text" id="docbulkfield-discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
        </div>
      </div>

      <div
        className="panel"
        style={{ border: "2px dashed var(--border-default, #444)", textAlign: "center", padding: "var(--space-5)", marginTop: "var(--space-3)", marginBottom: "var(--space-3)" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) scanFiles(e.dataTransfer.files);
        }}
      >
        Drag and drop files here, or use the buttons below.
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <button
          className="btn btn--ghost"
          onClick={() => (document.getElementById("bulkimport-files-input") as HTMLInputElement).click()}
        >
          Choose Files
        </button>
        <input
          id="bulkimport-files-input"
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length) scanFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          className="btn btn--ghost"
          onClick={() => (document.getElementById("bulkimport-folder-input") as HTMLInputElement).click()}
        >
          Choose Folder
        </button>
        <input
          id="bulkimport-folder-input"
          type="file"
          multiple
          {...({ webkitdirectory: "" } as any)}
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length) scanFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {totalCount > 0 ? (
        <>
          <p style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
            <strong>{totalCount}</strong> file{totalCount === 1 ? "" : "s"} selected ({formatBytes(totalSize)}) — {readyCount} ready ·{" "}
            {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"}
            {errorCount ? " · " + errorCount + " error" + (errorCount === 1 ? "" : "s") : ""}
            {scanningCount ? " · " + scanningCount + " scanning…" : ""}
          </p>
          <div className="project-list" style={{ maxHeight: 320, overflowY: "auto" }}>
            {files.map((entry, index) => {
              var statusNote =
                entry.status === "duplicate" && entry.duplicateMatch
                  ? " — matches “" + entry.duplicateMatch.record.filename + "” (" + entry.duplicateMatch.reason + ")"
                  : entry.status === "error"
                  ? " — " + entry.errorMessage
                  : "";
              return (
                <div key={index} className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                  <div>
                    <strong>{entry.name}</strong> · {formatBytes(entry.size)}
                    <br />
                    <span className="text-secondary" style={{ fontSize: 12 }}>
                      {(BULK_STATUS_LABELS[entry.status] || entry.status) + statusNote}
                    </span>
                  </div>
                  <button className="btn btn--ghost" disabled={!!progress} onClick={() => removeFile(index)}>
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {progress ? (
        <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>
          Importing {progress.done} of {progress.total}…
        </p>
      ) : null}

      {summary ? (
        <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>
          <strong>Import complete:</strong> {summary.imported} imported
          {summary.duplicates ? " (" + summary.duplicates + " flagged as possible duplicates)" : ""}
          {summary.errors ? " · " + summary.errors + " failed" : ""}
          {summary.skipped ? " · " + summary.skipped + " skipped (still scanning or errored)" : ""}.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <button className="btn btn--primary" disabled={!projectId || importableCount === 0 || !!progress} onClick={handleImport}>
          {progress ? "Importing…" : "Import " + importableCount + " File" + (importableCount === 1 ? "" : "s")}
        </button>
        <button className="btn btn--ghost" disabled={!!progress} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

interface DocumentBulkBarProps {
  selectedIds: { [id: string]: boolean };
  filtered: PCCDocument[];
  trashMode: boolean;
  onCleared: () => void;
  onChanged: () => void;
}

function DocumentBulkBar({ selectedIds, filtered, trashMode, onCleared, onChanged }: DocumentBulkBarProps) {
  var n = Object.keys(selectedIds).length;
  if (n === 0) return null;
  var noun = n === 1 ? "document" : "documents";
  function selectedDocs() {
    return filtered.filter((doc) => selectedIds[doc.id]);
  }

  if (trashMode) {
    return (
      <div className="bulk-action-bar">
        <span className="bulk-action-bar__count">{n} selected</span>
        <button
          className="btn btn--primary"
          onClick={() => {
            selectedDocs().forEach((doc) => restoreDocumentGroup(doc.document_group_id));
            window.PCC.notify(n + " " + noun + " restored.", "success");
            onCleared();
            onChanged();
          }}
        >
          Restore Selected
        </button>
        <div className="bulk-action-bar__spacer" />
        <button className="btn btn--ghost" onClick={onCleared}>
          Clear Selection
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            var docs = selectedDocs();
            var totalRevisions = 0;
            var data = window.PCC.store.get();
            docs.forEach((doc) => (totalRevisions += revisionsFor(data.documents, doc.document_group_id).length));
            if (
              !window.confirm(
                "Permanently delete " + n + " selected " + noun + " (" + totalRevisions + " total revision" + (totalRevisions === 1 ? "" : "s") + ")? This removes every stored file and extracted data. This CANNOT be undone."
              )
            )
              return;
            Promise.all(docs.map((doc) => permanentlyDeleteDocumentGroup(data.documents, doc.document_group_id))).then(() => {
              window.PCC.notify(n + " " + noun + " permanently deleted.", "info");
              onCleared();
              onChanged();
            });
          }}
        >
          Delete Selected Permanently
        </button>
      </div>
    );
  }

  return (
    <div className="bulk-action-bar">
      <span className="bulk-action-bar__count">{n} selected</span>
      <button
        className="btn btn--ghost"
        onClick={() => {
          window.PCC.store.update((d) => {
            d.documents.forEach((item) => {
              if (selectedIds[item.id]) item.status = "approved";
            });
          });
          window.PCC.notify(n + " " + noun + " marked approved.", "success");
          onCleared();
          onChanged();
        }}
      >
        Approve Selected
      </button>
      <button
        className="btn btn--ghost"
        onClick={() => {
          window.PCC.store.update((d) => {
            d.documents.forEach((item) => {
              if (selectedIds[item.id]) item.status = "rejected";
            });
          });
          window.PCC.notify(n + " " + noun + " marked rejected.", "success");
          onCleared();
          onChanged();
        }}
      >
        Reject Selected
      </button>
      <div className="bulk-action-bar__spacer" />
      <button className="btn btn--ghost" onClick={onCleared}>
        Clear Selection
      </button>
      <button
        className="btn btn--ghost"
        onClick={() => {
          var docs = selectedDocs();
          var totalRevisions = 0;
          var data = window.PCC.store.get();
          docs.forEach((doc) => (totalRevisions += revisionsFor(data.documents, doc.document_group_id).length));
          if (
            !window.confirm(
              "Move " + n + " selected " + noun + " (" + totalRevisions + " total revision" + (totalRevisions === 1 ? "" : "s") + ") to Trash? You can restore them later from the Trash view."
            )
          )
            return;
          docs.forEach((doc) => trashDocumentGroup(doc.document_group_id));
          window.PCC.notify(n + " " + noun + " moved to Trash.", "info");
          onCleared();
          onChanged();
        }}
      >
        Delete Selected
      </button>
    </div>
  );
}

interface DocumentListItemProps {
  doc: PCCDocument;
  data: PCCStoreData;
  isSelected: boolean;
  onSelect: () => void;
  isChecked: boolean;
  onCheckChange: (checked: boolean) => void;
  trashMode: boolean;
}

function DocumentListItem({ doc, data, isSelected, onSelect, isChecked, onCheckChange, trashMode }: DocumentListItemProps) {
  return (
    <div className={"doc-register-item" + (isSelected ? " doc-register-item--selected" : "")} onClick={onSelect}>
      <input
        type="checkbox"
        className="doc-register-item__select"
        aria-label="Select this document for a bulk action"
        checked={isChecked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onCheckChange(e.target.checked)}
      />
      <div className="doc-register-item__name">{doc.filename}</div>
      <div className="doc-register-item__meta">
        {projectName(data, doc.project_id)}
        {doc.document_number ? " · " + doc.document_number + (doc.revision ? " Rev " + doc.revision : "") : ""}
      </div>
      <div className="doc-register-item__badges">
        <span className="status-badge status-badge--complete">{CATEGORY_LABELS[doc.category || ""] || doc.category}</span>
        <span className="status-badge status-badge--info">{STATUS_LABELS[doc.status || ""] || doc.status}</span>
        {doc.is_duplicate ? (
          <span className="status-badge status-badge--at_risk" title={doc.duplicate_reason || "Flagged as a possible duplicate at upload time."}>
            Possible Duplicate
          </span>
        ) : null}
        {trashMode && doc.trashed_at ? <span className="status-badge status-badge--warning">{trashedAgoLabel(doc.trashed_at)}</span> : null}
      </div>
    </div>
  );
}

interface DocumentPreviewPanelProps {
  doc: PCCDocument;
  data: PCCStoreData;
  trashMode: boolean;
  previewExtractionExpanded: boolean;
  onToggleExtraction: () => void;
  expandedRevisionsGroupId: string | null;
  onToggleHistory: () => void;
  onChanged: () => void;
  onNewRevision: (doc: PCCDocument) => void;
  onDeletedSelection: (allRevisionIds: string[]) => void;
}

function DocumentPreviewPanel({
  doc,
  data,
  trashMode,
  previewExtractionExpanded,
  onToggleExtraction,
  expandedRevisionsGroupId,
  onToggleHistory,
  onChanged,
  onNewRevision,
  onDeletedSelection,
}: DocumentPreviewPanelProps) {
  var allRevisions = revisionsFor(data.documents, doc.document_group_id);
  var linkedMeeting = doc.meeting_id ? data.meetings.find((m) => m.id === doc.meeting_id) : null;
  var linkedActivity = doc.activity_id ? data.activities.find((a) => a.id === doc.activity_id) : null;
  var linkedDocType = doc.document_type_id ? data.document_types.find((t) => t.id === doc.document_type_id) : null;
  var linkedVendor = doc.vendor_id ? data.vendors.find((v) => v.id === doc.vendor_id) : null;
  var linkedPackage = doc.package_id ? data.packages.find((p) => p.id === doc.package_id) : null;

  function item(label: string, value: string | number | null | undefined) {
    return (
      <div key={label}>
        <span className="detail-item__label">{label}</span>
        <div>{value === null || value === undefined || value === "" ? "—" : value}</div>
      </div>
    );
  }

  return (
    <div className="panel doc-register-preview">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-3)" }}>
        <div>
          <h3 style={{ marginBottom: 2, wordBreak: "break-word" }}>{doc.filename}</h3>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
          <span className="status-badge status-badge--complete">{CATEGORY_LABELS[doc.category || ""] || doc.category}</span>
          {doc.is_duplicate ? (
            <span className="status-badge status-badge--at_risk" title={doc.duplicate_reason || "Flagged as a possible duplicate at upload time."}>
              Possible Duplicate
            </span>
          ) : null}
          {trashMode && doc.trashed_at ? <span className="status-badge status-badge--warning">{trashedAgoLabel(doc.trashed_at)}</span> : null}
        </div>
      </div>

      <div style={{ marginBottom: "var(--space-4)" }}>
        <label className="detail-item__label" htmlFor="docstatusfield-status">STATUS</label>
        <select
          id="docstatusfield-status"
          style={{ display: "block", marginTop: "var(--space-1)" }}
          value={doc.status}
          onChange={(e) => {
            updateDocumentStatus(doc.id, e.target.value);
            onChanged();
          }}
        >
          {window.PCC.store.DOCUMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s] || s}
            </option>
          ))}
        </select>
      </div>

      <div className="detail-grid">
        {item("Project", projectName(data, doc.project_id))}
        {item("Size", formatBytes(doc.file_size))}
        {item("Uploaded", new Date(doc.uploaded_at || "").toLocaleDateString())}
        {item("Revision", doc.revision_number)}
        {linkedDocType ? item("Type", linkedDocType.name) : null}
        {doc.discipline ? item("Discipline", doc.discipline) : null}
        {doc.document_number ? item("Document No.", doc.document_number + (doc.revision ? " Rev " + doc.revision : "")) : null}
        {linkedVendor ? item("Vendor", linkedVendor.vendor_name || "(unnamed vendor)") : null}
        {linkedPackage ? item("Package", linkedPackage.name) : null}
        {linkedMeeting ? item("From Meeting", linkedMeeting.title || "(untitled)") : null}
        {linkedActivity ? item("Linked Activity", linkedActivity.name) : null}
      </div>

      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-4) 0 0" }}>
        {extractionSummary(doc.extraction)}
      </p>

      <div className="project-card__actions" style={{ marginTop: "var(--space-4)" }}>
        {doc.extraction ? (
          <button className="btn btn--ghost" onClick={onToggleExtraction}>
            {previewExtractionExpanded ? "Hide Extracted Data" : "View Extracted Data"}
          </button>
        ) : null}
        <button className="btn btn--ghost" onClick={() => openStoredFile(doc)}>
          Open File
        </button>
        {linkedMeeting ? (
          <button className="btn btn--ghost" onClick={() => viewMeeting(linkedMeeting!.id)}>
            View Meeting
          </button>
        ) : null}
        {linkedVendor ? (
          <button className="btn btn--ghost" onClick={() => viewVendor(linkedVendor!.id)}>
            View Vendor
          </button>
        ) : null}
        {linkedActivity ? (
          <button className="btn btn--ghost" onClick={() => viewActivityInSchedule(doc.project_id, linkedActivity!.schedule_id, linkedActivity!.id)}>
            View in Gantt
          </button>
        ) : null}

        {trashMode ? (
          <>
            <button
              className="btn btn--primary"
              onClick={() => {
                restoreDocumentGroup(doc.document_group_id);
                window.PCC.notify(allRevisions.length > 1 ? "Document and its revision history restored." : "Document restored.", "success");
                onChanged();
              }}
            >
              Restore
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                var warning =
                  allRevisions.length > 1
                    ? "Permanently delete “" + doc.filename + "” and all " + allRevisions.length + " of its revisions? This removes every stored file and extracted data in this revision history. This CANNOT be undone."
                    : "Permanently delete “" + doc.filename + "”? This removes the stored file and extracted data. This CANNOT be undone.";
                if (!window.confirm(warning)) return;
                permanentlyDeleteDocumentGroup(data.documents, doc.document_group_id).then((allRevisionIds) => {
                  onDeletedSelection(allRevisionIds);
                  window.PCC.notify(allRevisions.length > 1 ? "Document and its revision history permanently deleted." : "Document permanently deleted.", "info");
                  onChanged();
                });
              }}
            >
              Delete Permanently
            </button>
          </>
        ) : (
          <>
            <button className="btn btn--ghost" onClick={() => onNewRevision(doc)}>
              New Revision
            </button>
            {allRevisions.length > 1 ? (
              <button className="btn btn--ghost" onClick={onToggleHistory}>
                History ({allRevisions.length})
              </button>
            ) : null}
            <button
              className="btn btn--ghost"
              onClick={() => {
                var warning =
                  allRevisions.length > 1
                    ? "Move “" + doc.filename + "” and all " + allRevisions.length + " of its revisions to Trash? You can restore it later from the Trash view."
                    : "Move “" + doc.filename + "” to Trash? You can restore it later from the Trash view.";
                if (!window.confirm(warning)) return;
                trashDocumentGroup(doc.document_group_id);
                window.PCC.notify(allRevisions.length > 1 ? "Document and its revision history moved to Trash." : "Document moved to Trash.", "info");
                onChanged();
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>

      {previewExtractionExpanded && doc.extraction ? (
        <div className="project-details" style={{ marginTop: "var(--space-4)" }}>
          <ExtractionPreview extraction={doc.extraction} />
        </div>
      ) : null}

      {expandedRevisionsGroupId === doc.document_group_id && allRevisions.length > 1 ? (
        <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--divider)" }}>
          <h4 style={{ marginBottom: "var(--space-2)" }}>Revision History</h4>
          <div className="attention-list">
            {allRevisions.slice(1).map((rev) => (
              <div key={rev.id} className="attention-item attention-item--clickable" onClick={() => openStoredFile(rev)}>
                <span className="attention-item__icon attention-item__icon--info" />
                <div className="attention-item__body">
                  <div className="attention-item__text">
                    Rev {rev.revision_number} — {rev.filename}
                  </div>
                  <div className="attention-item__meta">
                    {(STATUS_LABELS[rev.status || ""] || rev.status) + " · " + new Date(rev.uploaded_at || "").toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface DocumentsPageProps {
  initialFormOpen?: boolean;
  initialProjectId?: string;
  initialMeetingId?: string;
  initialProjectFilter?: string;
  initialSelectedDocId?: string;
}

export default function DocumentsPage({ initialFormOpen, initialProjectId, initialMeetingId, initialProjectFilter, initialSelectedDocId }: DocumentsPageProps) {
  const [data, setData] = useState<PCCStoreData>(() => getData());
  const [filters, setFilters] = useState<DocumentFilters>(() => {
    var ctxProjectId = getProjectContext();
    var projectFilter = initialProjectFilter || (ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "");
    return { search: "", categoryFilter: "", statusFilter: "", projectFilter: projectFilter };
  });
  const [formOpen, setFormOpen] = useState(!!initialFormOpen);
  const [formPrefill, setFormPrefill] = useState<UploadFormPrefill>(function () {
    return { projectId: initialProjectId || "", meetingId: initialMeetingId || "" };
  });
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialSelectedDocId || null);
  const [selectedIds, setSelectedIds] = useState<{ [id: string]: boolean }>({});
  const [previewExtractionExpanded, setPreviewExtractionExpanded] = useState(false);
  const [expandedRevisionsGroupId, setExpandedRevisionsGroupId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);

  function refresh() {
    setData(getData());
  }

  function selectDocument(docId: string) {
    setSelectedDocId(docId);
    setPreviewExtractionExpanded(false);
  }

  var hasActiveProjects = data.projects.some((p) => !p.archived);
  var activeDocCount = data.documents.filter((d) => !d.trashed_at).length;
  var trashedGroupCount = latestDocuments(data.documents.filter((d) => d.trashed_at)).length;

  function openAddForm() {
    setFormPrefill({ projectId: filters.projectFilter || "" });
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  function openNewRevisionForm(doc: PCCDocument) {
    setFormPrefill({
      projectId: doc.project_id,
      activityId: doc.activity_id || "",
      category: doc.category,
      documentTypeId: doc.document_type_id || "",
      discipline: doc.discipline || "",
      documentNumber: doc.document_number || "",
      revision: doc.revision || "00",
      packageId: doc.package_id || "",
      contractOrPo: doc.contract_or_po || "",
      vendorId: doc.vendor_id || "",
      priority: doc.priority || "medium",
      criticality: doc.criticality || "",
      status: "draft",
      revisionGroupId: doc.document_group_id,
    });
    setFormKey((k) => k + 1);
    setFormOpen(true);
    refresh();
  }

  // The upload form / bulk-import panel MUST render at a fixed position in the tree
  // regardless of which branch below is active — a document being added/imported can
  // itself flip activeDocCount from 0 to nonzero (or trashedGroupCount's related
  // states), and if these panels lived inside per-branch early returns, that flip would
  // swap out the whole surrounding JSX shape and remount them, discarding their own
  // in-progress state (e.g. BulkImportPanel's just-set completion summary, wiped before
  // the user ever sees it). Matches the vanilla page's own render() structure, where the
  // form/bulk-import panel is appended before the empty-state/register branching, not
  // inside it.
  var trashEmpty = showTrash && trashedGroupCount === 0;
  var isEmpty = !showTrash && activeDocCount === 0;

  var filtered = !isEmpty && !trashEmpty
    ? showTrash
      ? latestDocuments(data.documents.filter((d) => d.trashed_at)).sort((a, b) => new Date(b.trashed_at || "").getTime() - new Date(a.trashed_at || "").getTime())
      : latestDocuments(data.documents.filter((d) => !d.trashed_at))
          .filter((doc) => documentMatchesFilters(doc, filters))
          .sort((a, b) => new Date(b.uploaded_at || "").getTime() - new Date(a.uploaded_at || "").getTime())
    : [];

  var effectiveSelectedId = selectedDocId && filtered.some((d) => d.id === selectedDocId) ? selectedDocId : filtered[0] ? filtered[0].id : null;
  var selectedDoc = filtered.find((d) => d.id === effectiveSelectedId);

  var toolbar =
    !isEmpty && !trashEmpty ? (
      <div className="toolbar">
        <input
          type="text"
          placeholder="Search filename, document number…"
          value={filters.search}
          onChange={(e) => setFilters((prev) => Object.assign({}, prev, { search: e.target.value }))}
        />
        <select aria-label="Filter by category" value={filters.categoryFilter} onChange={(e) => setFilters((prev) => Object.assign({}, prev, { categoryFilter: e.target.value }))}>
          <option value="">All categories</option>
          {Object.keys(CATEGORY_LABELS).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={filters.statusFilter} onChange={(e) => setFilters((prev) => Object.assign({}, prev, { statusFilter: e.target.value }))}>
          <option value="">All statuses</option>
          {window.PCC.store.DOCUMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s] || s}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by project"
          value={filters.projectFilter}
          onChange={(e) => {
            var value = e.target.value;
            setFilters((prev) => Object.assign({}, prev, { projectFilter: value }));
            if (value) setProjectContext(value);
          }}
        >
          <option value="">All projects</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "(unnamed project)"}
            </option>
          ))}
        </select>
        <div className="toolbar__spacer" />
        {!formOpen && !bulkImportOpen && !showTrash ? (
          <>
            <button className="btn btn--primary" disabled={!hasActiveProjects} onClick={openAddForm}>
              + Add Document
            </button>
            <button className="btn btn--ghost" disabled={!hasActiveProjects} onClick={() => setBulkImportOpen(true)}>
              Bulk Import
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setShowTrash(true);
                setSelectedIds({});
                setSelectedDocId(null);
              }}
            >
              Trash ({trashedGroupCount})
            </button>
          </>
        ) : null}
        {showTrash ? (
          <>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setShowTrash(false);
                setSelectedIds({});
                setSelectedDocId(null);
              }}
            >
              ← Back to Documents
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                var trashedGroups = latestDocuments(data.documents.filter((d) => d.trashed_at));
                var totalRevisions = 0;
                trashedGroups.forEach((doc) => (totalRevisions += revisionsFor(data.documents, doc.document_group_id).length));
                if (
                  !window.confirm(
                    "Empty Trash? This permanently deletes " +
                      trashedGroups.length +
                      " document" +
                      (trashedGroups.length === 1 ? "" : "s") +
                      " (" +
                      totalRevisions +
                      " total revision" +
                      (totalRevisions === 1 ? "" : "s") +
                      ") and every stored file. This CANNOT be undone."
                  )
                )
                  return;
                Promise.all(trashedGroups.map((doc) => permanentlyDeleteDocumentGroup(data.documents, doc.document_group_id))).then(() => {
                  window.PCC.notify("Trash emptied.", "info");
                  setSelectedIds({});
                  setSelectedDocId(null);
                  setShowTrash(false);
                  refresh();
                });
              }}
            >
              Empty Trash
            </button>
          </>
        ) : null}
      </div>
    ) : null;

  var body;
  if (isEmpty) {
    body = (
      <>
        {!formOpen && !bulkImportOpen ? (
          <>
            <button className="btn btn--primary" style={{ marginBottom: "var(--space-4)", marginRight: "var(--space-3)" }} disabled={!hasActiveProjects} onClick={openAddForm}>
              + Add Document
            </button>
            <button className="btn btn--ghost" disabled={!hasActiveProjects} onClick={() => setBulkImportOpen(true)}>
              Bulk Import
            </button>
            {trashedGroupCount > 0 ? (
              <button className="btn btn--ghost" onClick={() => setShowTrash(true)}>
                Trash ({trashedGroupCount})
              </button>
            ) : null}
          </>
        ) : null}
        <div className="panel empty-state">
          {hasActiveProjects ? "No documents yet. Click “+ Add Document” to upload one." : "Add a project in Portfolio first, then upload documents against it."}
        </div>
      </>
    );
  } else if (trashEmpty) {
    body = (
      <>
        <button className="btn btn--ghost" style={{ marginBottom: "var(--space-4)" }} onClick={() => setShowTrash(false)}>
          ← Back to Documents
        </button>
        <div className="panel empty-state">Trash is empty.</div>
      </>
    );
  } else if (filtered.length === 0) {
    body = (
      <>
        {toolbar}
        <div className="panel empty-state">No documents match this search/filter.</div>
      </>
    );
  } else {
    body = (
      <>
        {toolbar}
        <div className="doc-register">
          <div className="doc-register-list" style={listWidth != null ? { flex: "0 0 " + listWidth + "px", maxWidth: "none" } : undefined}>
            <DocumentBulkBar selectedIds={selectedIds} filtered={filtered} trashMode={showTrash} onCleared={() => setSelectedIds({})} onChanged={refresh} />
            {filtered.map((doc) => (
              <DocumentListItem
                key={doc.id}
                doc={doc}
                data={data}
                isSelected={doc.id === effectiveSelectedId}
                onSelect={() => selectDocument(doc.id)}
                isChecked={!!selectedIds[doc.id]}
                onCheckChange={(checked) => {
                  setSelectedIds((prev) => {
                    var next = Object.assign({}, prev);
                    if (checked) next[doc.id] = true;
                    else delete next[doc.id];
                    return next;
                  });
                }}
                trashMode={showTrash}
              />
            ))}
          </div>

          <div
            className="doc-register-resize-handle"
            role="separator"
            aria-label="Resize document list"
            title="Drag to resize, double-click to reset"
            onMouseDown={(downEvent: React.MouseEvent<HTMLDivElement>) => {
              downEvent.preventDefault();
              // The DOM spec nulls out event.currentTarget once the dispatching event's
              // own listeners finish running — capturing the element itself (not the
              // event) is required here since onMouseMove/onMouseUp fire later, on
              // separate events (confirmed real jsdom/Chromium behavior, not a quirk).
              var handleEl = downEvent.currentTarget;
              var registerEl = handleEl.parentElement as HTMLElement;
              var listPaneEl = registerEl.querySelector(".doc-register-list") as HTMLElement;
              var registerRect = registerEl.getBoundingClientRect();
              var lastWidth: number | null = null;
              handleEl.classList.add("doc-register-resize-handle--dragging");

              function onMouseMove(moveEvent: MouseEvent) {
                var raw = moveEvent.clientX - registerRect.left;
                var clamped = Math.max(240, Math.min(640, raw));
                lastWidth = clamped;
                listPaneEl.style.flex = "0 0 " + clamped + "px";
                listPaneEl.style.maxWidth = "none";
              }
              function onMouseUp() {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                handleEl.classList.remove("doc-register-resize-handle--dragging");
                if (lastWidth != null) setListWidth(Math.round(lastWidth));
              }
              document.addEventListener("mousemove", onMouseMove);
              document.addEventListener("mouseup", onMouseUp);
            }}
            onDoubleClick={() => setListWidth(null)}
          />

          {selectedDoc ? (
            <DocumentPreviewPanel
              doc={selectedDoc}
              data={data}
              trashMode={showTrash}
              previewExtractionExpanded={previewExtractionExpanded}
              onToggleExtraction={() => setPreviewExtractionExpanded((v) => !v)}
              expandedRevisionsGroupId={expandedRevisionsGroupId}
              onToggleHistory={() => setExpandedRevisionsGroupId((cur) => (cur === selectedDoc!.document_group_id ? null : selectedDoc!.document_group_id || null))}
              onChanged={refresh}
              onNewRevision={openNewRevisionForm}
              onDeletedSelection={(allRevisionIds) => {
                if (allRevisionIds.indexOf(effectiveSelectedId || "") !== -1) setSelectedDocId(null);
              }}
            />
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="focus-mode-hide" style={{ marginBottom: "var(--space-4)" }}>
        Documents
      </h2>
      <div className="panel focus-mode-hide" style={{ marginBottom: "var(--space-4)" }}>
        <p className="text-secondary" style={{ margin: 0, fontSize: 13 }}>
          Excel, Word, and PDF files are read client-side, and both the extracted data/text and the original file itself are saved with
          the document — no internet needed, nothing distorted. “Open File” always reproduces the exact file you uploaded. PDF text
          extraction won't work on scanned/image-only PDFs (no text layer to read), but the original still opens fine. Browser storage
          typically caps around 5–10MB total, so export your data regularly once you're attaching real files.
        </p>
      </div>

      {formOpen ? (
        <UploadForm
          key={formKey}
          data={data}
          prefill={formPrefill}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
          onCancel={() => setFormOpen(false)}
        />
      ) : null}
      {bulkImportOpen ? (
        <BulkImportPanel data={data} initialProjectId={filters.projectFilter || ""} onClose={() => setBulkImportOpen(false)} onImported={refresh} />
      ) : null}

      {body}
    </>
  );
}
