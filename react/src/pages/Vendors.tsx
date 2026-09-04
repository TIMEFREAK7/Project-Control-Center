/* Vendor Management, migrated to React as part of the page-by-page migration
 * (Post-Phase-5 Engineering Evolution — Batch F, part 2). Reproduces the prior vanilla
 * page's exact text, field ids (vendorfield-/vplfield-/vcfield-/vdocfield-/vperffield-
 * prefixed), button labels, and CSS class names (panel/form-grid/field/project-card/
 * tab-bar/tab-btn/status-badge/toolbar/btn) — same visual result, only the
 * implementation moved. See src/js/pages/vendors.js (now a small stub) for the router
 * registration and the window.PCC.vendors public API (openProfile/filterByProject)
 * other still-vanilla pages depend on, preserved via the same pending-prop channel
 * established for other migrated pages' cross-page handoffs.
 *
 * All add/edit forms are UNCONTROLLED (fields read via form.querySelector at submit
 * time, like every other migrated register). The Meetings/RFIs/Risks tabs' "link an
 * existing record" flow shares one generic LinkPickerPanel component, matching the
 * vanilla page's own single linkPickerPanel() helper reused three ways.
 *
 * The Documents tab's upload flow (FileReader -> fingerprint -> blobStore.putBlob) is
 * genuinely async; readAndFingerprintFile()/saveVendorDocument() in vendorsService.js
 * return Promises the DocumentsTab component awaits, holding the in-progress upload's
 * state (selected file, computed hash, form fields) as component-local React state —
 * replacing vanilla's uiState.pendingDoc* module fields.
 *
 * All store/blob/file reads and writes go through vendorsService.js (master prompt §9).
 */
import React, { useState } from "react";
import {
  VENDOR_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  VENDOR_DOCUMENT_CATEGORY_LABELS,
  RFI_TYPE_LABELS,
  RFI_STATUS_LABELS,
  EXPIRING_SOON_DAYS,
  REQUIREMENT_STATUS_BADGE,
  VENDOR_FIELD_CONFIG,
  VENDOR_ADDRESS_FIELD_CONFIG,
  formatBytes,
  getData,
  projectName,
  vendorName,
  daysUntil,
  overallRating,
  ratingText,
  latestDocumentsForVendor,
  documentLabel,
  openStoredVendorDocument,
  computeVendorDelayStats,
  vendorMatchesFilters,
  newVendor,
  saveVendor,
  deleteVendor,
  newProjectLink,
  saveProjectLink,
  deleteProjectLink,
  newContact,
  saveContact,
  deleteContact,
  readAndFingerprintFile,
  saveVendorDocument,
  deleteVendorDocumentGroup,
  linkMeeting,
  unlinkMeeting,
  viewMeeting,
  linkRfi,
  unlinkRfi,
  viewRfi,
  linkRisk,
  unlinkRisk,
  viewRisk,
  viewActivityInSchedule,
  newPerformance,
  savePerformance,
  deletePerformance,
  addNote,
  deleteNote,
  computeRequirementStatus,
  getProjectContext,
  setProjectContext,
  FieldConfig,
  VendorFilters,
  PendingFile,
} from "../services/vendorsService";
import type {
  PCCStoreData,
  PCCVendor,
  PCCVendorProjectLink,
  PCCVendorContact,
  PCCVendorDocument,
  PCCVendorPerformance,
  PCCVendorMeetingLink,
  PCCVendorRfiLink,
  PCCVendorRiskLink,
  PCCVendorNote,
  PCCMeeting,
  PCCRfi,
  PCCRisk,
  PCCActivity,
} from "../types/pcc";

function statusBadgeClass(status: string | undefined): string {
  if (status === "preferred") return "status-badge status-badge--on_track";
  if (status === "blacklisted") return "status-badge status-badge--critical";
  if (status === "inactive") return "status-badge status-badge--complete";
  return "status-badge status-badge--info";
}

interface FieldProps {
  cfg: FieldConfig;
  record: any;
  idPrefix: string;
}

function Field({ cfg, record, idPrefix }: FieldProps) {
  const id = idPrefix + cfg.key;
  return (
    <div className="field">
      <label htmlFor={id}>
        {cfg.label}
        {cfg.required ? " *" : ""}
      </label>
      {cfg.type === "select" ? (
        <select id={id} name={cfg.key} defaultValue={record[cfg.key] || (cfg.options && cfg.options[0])}>
          {(cfg.options || []).map((val) => (
            <option key={val} value={val}>
              {(cfg.labels && cfg.labels[val]) || val}
            </option>
          ))}
        </select>
      ) : cfg.type === "textarea" ? (
        <textarea id={id} name={cfg.key} rows={3} defaultValue={record[cfg.key] || ""} />
      ) : (
        <input type={cfg.type} id={id} name={cfg.key} defaultValue={record[cfg.key] || ""} required={cfg.required} />
      )}
    </div>
  );
}

// ===== Vendor Master form =====

interface VendorFormProps {
  isNew: boolean;
  vendor: PCCVendor;
  data: PCCStoreData;
  onCancel: () => void;
  onSaved: (isNew: boolean, savedVendorId: string) => void;
}

function VendorForm({ isNew, vendor, data, onCancel, onSaved }: VendorFormProps) {
  const [showError, setShowError] = useState(false);
  const primaryContact: PCCVendorContact | { name: string; designation: string; mobile: string; email: string } =
    data.vendor_contacts.find((c) => c.vendor_id === vendor.id && c.is_primary) || { name: "", designation: "", mobile: "", email: "" };

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const values: any = {};
    VENDOR_FIELD_CONFIG.concat(VENDOR_ADDRESS_FIELD_CONFIG).forEach((cfg) => {
      const el = form.querySelector("#vendorfield-" + cfg.key) as HTMLInputElement | null;
      if (el) values[cfg.key] = el.value;
    });
    values.status = (form.querySelector("#vendorfield-status") as HTMLSelectElement).value;
    values.next_follow_up_date = (form.querySelector("#vendorfield-next_follow_up_date") as HTMLInputElement).value;
    values.notes = (form.querySelector("#vendorfield-notes") as HTMLTextAreaElement).value;

    if (!values.vendor_name || !values.vendor_name.trim()) {
      setShowError(true);
      return;
    }
    setShowError(false);

    const contactValues = {
      name: (form.querySelector("#vendorfield-contact-name") as HTMLInputElement).value.trim(),
      designation: (form.querySelector("#vendorfield-contact-designation") as HTMLInputElement).value.trim(),
      mobile: (form.querySelector("#vendorfield-contact-mobile") as HTMLInputElement).value.trim(),
      email: (form.querySelector("#vendorfield-contact-email") as HTMLInputElement).value.trim(),
    };

    const savedVendorId = saveVendor(isNew, vendor.id, values, contactValues);
    onSaved(isNew, savedVendorId);
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Vendor" : "Edit Vendor"}</h3>
      <form onSubmit={handleSubmit}>
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
          BASIC INFORMATION
        </p>
        <div className="form-grid">
          {VENDOR_FIELD_CONFIG.map((cfg) => (
            <Field key={cfg.key} cfg={cfg} record={vendor} idPrefix="vendorfield-" />
          ))}
        </div>

        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
          PRIMARY CONTACT (more contacts can be added from the vendor's Contacts tab after saving)
        </p>
        <div className="form-grid">
          <Field cfg={{ key: "name", label: "Contact Person", type: "text" }} record={primaryContact} idPrefix="vendorfield-contact-" />
          <Field cfg={{ key: "designation", label: "Designation", type: "text" }} record={primaryContact} idPrefix="vendorfield-contact-" />
          <Field cfg={{ key: "mobile", label: "Mobile Number", type: "text" }} record={primaryContact} idPrefix="vendorfield-contact-" />
          <Field cfg={{ key: "email", label: "Email Address", type: "email" }} record={primaryContact} idPrefix="vendorfield-contact-" />
        </div>

        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
          ADDRESS
        </p>
        <div className="form-grid">
          {VENDOR_ADDRESS_FIELD_CONFIG.map((cfg) => (
            <Field key={cfg.key} cfg={cfg} record={vendor} idPrefix="vendorfield-" />
          ))}
        </div>

        <div className="form-grid" style={{ marginTop: "var(--space-4)" }}>
          <Field cfg={{ key: "status", label: "Status", type: "select", options: window.PCC.store.VENDOR_STATUSES, labels: VENDOR_STATUS_LABELS }} record={vendor} idPrefix="vendorfield-" />
          <Field cfg={{ key: "next_follow_up_date", label: "Next Follow-up Date", type: "date" }} record={vendor} idPrefix="vendorfield-" />
        </div>

        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label>Notes</label>
          <textarea id="vendorfield-notes" rows={2} defaultValue={vendor.notes || ""} />
        </div>

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>Vendor Name is required.</p> : null}

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Vendor" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ===== Vendor Master list =====

interface VendorCardProps {
  v: PCCVendor;
  data: PCCStoreData;
  onView: () => void;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}

function VendorCard({ v, data, onView, onEdit, onDeleted }: VendorCardProps) {
  const projectCount = data.vendor_project_links.filter((l) => l.vendor_id === v.id).length;
  function handleDelete() {
    if (
      !window.confirm(
        'Delete vendor "' + v.vendor_name + '"? This also removes its contacts, project links, documents, and performance/notes history. This can\'t be undone.'
      )
    )
      return;
    deleteVendor(v.id);
    onDeleted(v.id);
  }
  return (
    <div className="project-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <strong>{v.vendor_name || "(unnamed vendor)"}</strong>
            <span className={statusBadgeClass(v.status)}>{VENDOR_STATUS_LABELS[v.status || ""] || v.status}</span>
          </div>
          <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0 0" }}>
            {[v.vendor_code, v.company_name, v.trade_discipline].filter(Boolean).join(" · ")}
            {v.vendor_code || v.company_name || v.trade_discipline ? " · " : ""}
            {projectCount} project{projectCount === 1 ? "" : "s"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
          <button className="btn btn--primary" onClick={onView}>
            View Profile
          </button>
          <button className="btn btn--ghost" onClick={onEdit}>
            Edit
          </button>
          <button className="btn btn--ghost" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

interface VendorListProps {
  data: PCCStoreData;
  filters: VendorFilters;
  setFilters: React.Dispatch<React.SetStateAction<VendorFilters>>;
  editingVendorId: string | null;
  onEdit: (id: string) => void;
  onAdd: () => void;
  onCancelEdit: () => void;
  onSaved: (isNew: boolean, savedVendorId: string) => void;
  onView: (id: string) => void;
  onDeleted: (id: string) => void;
}

function VendorList({ data, filters, setFilters, editingVendorId, onEdit, onAdd, onCancelEdit, onSaved, onView, onDeleted }: VendorListProps) {
  const vendorBeingEdited = !editingVendorId ? null : editingVendorId === "new" ? newVendor() : data.vendors.find((v) => v.id === editingVendorId);
  const filtered = data.vendors.filter((v) => vendorMatchesFilters(v, data, filters));
  const distinctTrades = Array.from(new Set(data.vendors.map((v) => (v.trade_discipline || "").trim()).filter(Boolean))).sort();

  return (
    <>
      <div className="toolbar">
        <input
          type="text"
          placeholder="Search vendor, company, contact, trade, project, document…"
          value={filters.search}
          onChange={(e) => setFilters((prev) => Object.assign({}, prev, { search: e.target.value }))}
        />
        <select value={filters.statusFilter} onChange={(e) => setFilters((prev) => Object.assign({}, prev, { statusFilter: e.target.value }))}>
          <option value="">All statuses</option>
          {window.PCC.store.VENDOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {VENDOR_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.projectFilter}
          onChange={(e) => {
            const value = e.target.value;
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
        <select value={filters.tradeFilter} onChange={(e) => setFilters((prev) => Object.assign({}, prev, { tradeFilter: e.target.value }))}>
          <option value="">All trades</option>
          {distinctTrades.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={filters.docTypeFilter} onChange={(e) => setFilters((prev) => Object.assign({}, prev, { docTypeFilter: e.target.value }))}>
          <option value="">All document types</option>
          {window.PCC.store.VENDOR_DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {VENDOR_DOCUMENT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" onClick={onAdd}>
          + Add Vendor
        </button>
      </div>

      {vendorBeingEdited ? (
        <VendorForm key={editingVendorId} isNew={editingVendorId === "new"} vendor={vendorBeingEdited} data={data} onCancel={onCancelEdit} onSaved={onSaved} />
      ) : null}

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {data.vendors.length === 0 ? "No vendors yet. Click “+ Add Vendor” to create your first one." : "No vendors match this search/filter."}
        </div>
      ) : (
        <div className="project-list">
          {filtered.map((v) => (
            <VendorCard key={v.id} v={v} data={data} onView={() => onView(v.id)} onEdit={() => onEdit(v.id)} onDeleted={onDeleted} />
          ))}
        </div>
      )}
    </>
  );
}

// ===== Dashboard =====

function SummaryCard({ label, value, sub }: { label: string; value: string | number; sub?: React.ReactNode }) {
  return (
    <div className="panel">
      <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-2)" }}>
        {label.toUpperCase()}
      </p>
      <p style={{ fontSize: "var(--text-2xl)", fontWeight: 600, margin: 0 }}>{value}</p>
      {sub ? <div style={{ marginTop: "var(--space-2)" }}>{sub}</div> : null}
    </div>
  );
}

function MiniList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
        None.
      </p>
    );
  }
  return (
    <div>
      {items.map((text, i) => (
        <p key={i} style={{ fontSize: "var(--text-sm)", margin: "0 0 var(--space-1)" }}>
          {text}
        </p>
      ))}
    </div>
  );
}

function Dashboard({ data }: { data: PCCStoreData }) {
  const activeCount = data.vendors.filter((v) => v.status === "active").length;
  const preferredCount = data.vendors.filter((v) => v.status === "preferred").length;

  const perProject: { [projectId: string]: { [vendorId: string]: boolean } } = {};
  data.vendor_project_links.forEach((l) => {
    const pid = l.project_id || "";
    perProject[pid] = perProject[pid] || {};
    perProject[pid][l.vendor_id || ""] = true;
  });
  const perProjectRows = Object.keys(perProject)
    .map((pid) => ({ projectId: pid, count: Object.keys(perProject[pid]).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((row) => projectName(data.projects, row.projectId) + " — " + row.count + " vendor" + (row.count === 1 ? "" : "s"));

  let allLatestByVendor: PCCVendorDocument[] = [];
  data.vendors.forEach((v) => {
    allLatestByVendor = allLatestByVendor.concat(latestDocumentsForVendor(data.vendor_documents, v.id));
  });

  const expiring = allLatestByVendor
    .filter((d) => {
      if (!d.expiry_date) return false;
      const diff = daysUntil(d.expiry_date);
      return diff !== null && diff <= EXPIRING_SOON_DAYS;
    })
    .sort((a, b) => (a.expiry_date || "").localeCompare(b.expiry_date || ""));

  const recentUploads = data.vendor_documents
    .slice()
    .sort((a, b) => (b.upload_date || "").localeCompare(a.upload_date || ""))
    .slice(0, 5);

  const recentVendors = data.vendors
    .slice()
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 5)
    .map((v) => v.vendor_name + " (" + new Date(v.created_at || "").toLocaleDateString() + ")");

  const recentlyUpdated = data.vendors
    .filter((v) => v.updated_at !== v.created_at)
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
    .slice(0, 5)
    .map((v) => v.vendor_name + " (" + new Date(v.updated_at || "").toLocaleDateString() + ")");

  return (
    <>
      <h3 style={{ marginBottom: "var(--space-3)" }}>Vendor Dashboard</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
        <SummaryCard label="Total Vendors" value={data.vendors.length} />
        <SummaryCard label="Active Vendors" value={activeCount} />
        <SummaryCard label="Preferred Vendors" value={preferredCount} />
        <SummaryCard label="Vendors per Project" value={perProjectRows.length} sub={<MiniList items={perProjectRows} />} />
        <SummaryCard
          label={"Expiring Documents (≤" + EXPIRING_SOON_DAYS + "d)"}
          value={expiring.length}
          sub={
            <MiniList
              items={expiring.slice(0, 5).map((d) => {
                const diff = daysUntil(d.expiry_date) || 0;
                return vendorName(data.vendors, d.vendor_id) + " — " + documentLabel(d) + " — " + (diff < 0 ? "expired " + Math.abs(diff) + "d ago" : diff + "d left");
              })}
            />
          }
        />
        <SummaryCard
          label="Recently Uploaded Documents"
          value={recentUploads.length}
          sub={<MiniList items={recentUploads.map((d) => vendorName(data.vendors, d.vendor_id) + " — " + documentLabel(d))} />}
        />
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: "var(--space-3)" }}>Recent Activity</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
          <div>
            <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Recently Added Vendors</p>
            <MiniList items={recentVendors} />
          </div>
          <div>
            <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Recently Uploaded Documents</p>
            <MiniList items={recentUploads.map((d) => vendorName(data.vendors, d.vendor_id) + " — " + documentLabel(d) + " (" + (d.upload_date || "").slice(0, 10) + ")")} />
          </div>
          <div>
            <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Recently Updated Vendor Information</p>
            <MiniList items={recentlyUpdated} />
          </div>
        </div>
      </div>
    </>
  );
}

// ===== Profile: Overview =====

function OverviewTab({ vendor, data }: { vendor: PCCVendor; data: PCCStoreData }) {
  function Row({ label, value }: { label: string; value: string | undefined }) {
    return (
      <div>
        <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginBottom: 2 }}>
          {label.toUpperCase()}
        </p>
        <p style={{ margin: 0 }}>{value || "—"}</p>
      </div>
    );
  }
  function Stat({ label, count }: { label: string; count: number }) {
    return (
      <div>
        <strong>{count}</strong> <span className="text-secondary" style={{ fontSize: 12 }}>{label}</span>
      </div>
    );
  }

  const delayStats = computeVendorDelayStats(vendor, data);

  return (
    <div className="panel">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-4)" }}>
        <Row label="Vendor Code" value={vendor.vendor_code} />
        <Row label="Company Name" value={vendor.company_name} />
        <Row label="Category" value={vendor.category} />
        <Row label="Trade / Discipline" value={vendor.trade_discipline} />
        <Row label="GST Number" value={vendor.gst_number} />
        <Row label="PAN Number" value={vendor.pan_number} />
        <Row label="Registration Number" value={vendor.registration_number} />
        <Row label="Website" value={vendor.website} />
        <Row label="Address" value={[vendor.office_address, vendor.city, vendor.state, vendor.country, vendor.postal_code].filter(Boolean).join(", ")} />
        <Row label="Next Follow-up Date" value={vendor.next_follow_up_date} />
      </div>

      {vendor.notes ? <p style={{ marginTop: "var(--space-4)", whiteSpace: "pre-wrap" }}>{vendor.notes}</p> : null}

      <div style={{ display: "flex", gap: "var(--space-5)", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
        <Stat label="Projects" count={data.vendor_project_links.filter((l) => l.vendor_id === vendor.id).length} />
        <Stat label="Contacts" count={data.vendor_contacts.filter((c) => c.vendor_id === vendor.id).length} />
        <Stat label="Documents" count={latestDocumentsForVendor(data.vendor_documents, vendor.id).length} />
        <Stat label="Meetings" count={data.vendor_meeting_links.filter((l) => l.vendor_id === vendor.id).length} />
        <Stat label="RFI / TQ" count={data.vendor_rfi_links.filter((l) => l.vendor_id === vendor.id).length} />
        <Stat label="Risks" count={data.vendor_risk_links.filter((l) => l.vendor_id === vendor.id).length} />
      </div>

      {delayStats.totalEvents > 0 ? (
        <>
          <p className="text-secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", margin: "var(--space-4) 0 var(--space-2)" }}>
            DELAY ANALYSIS
          </p>
          <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap" }}>
            <Stat label="Delay Events" count={delayStats.totalEvents} />
            <Stat label="Open Delays" count={delayStats.openCount} />
            <Stat label="Critical" count={delayStats.criticalCount} />
            <Stat label="Total Delay Days" count={delayStats.totalDelayDays} />
            <Stat label="Recovery Actions" count={delayStats.recoveryActionsCount} />
          </div>
          {delayStats.repeatedCauses.length > 0 ? (
            <p className="text-secondary" style={{ fontSize: 12, marginTop: "var(--space-2)" }}>
              Repeated causes: {delayStats.repeatedCauses.join(", ")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ===== Profile: Projects =====

interface ProjectLinkFormProps {
  isNew: boolean;
  link: PCCVendorProjectLink;
  vendor: PCCVendor;
  data: PCCStoreData;
  onCancel: () => void;
  onSaved: () => void;
}

function ProjectLinkForm({ isNew, link, vendor, data, onCancel, onSaved }: ProjectLinkFormProps) {
  const activeProjects = data.projects.filter((p) => !p.archived);
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const values: Partial<PCCVendorProjectLink> = {
      project_id: (form.querySelector("#vplfield-project_id") as HTMLSelectElement).value,
      role: (form.querySelector("#vplfield-role") as HTMLInputElement).value,
      contract_status: (form.querySelector("#vplfield-contract_status") as HTMLSelectElement).value,
      scope_of_work: (form.querySelector("#vplfield-scope_of_work") as HTMLTextAreaElement).value,
    };
    saveProjectLink(isNew, link.id, vendor.id, values);
    onSaved();
  }
  return (
    <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Project *</label>
          <select id="vplfield-project_id" defaultValue={link.project_id || (activeProjects[0] && activeProjects[0].id) || ""}>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || "(unnamed project)"}
              </option>
            ))}
          </select>
        </div>
        <div className="form-grid">
          <Field cfg={{ key: "role", label: "Vendor Role", type: "text" }} record={link} idPrefix="vplfield-" />
          <Field
            cfg={{ key: "contract_status", label: "Contract Status", type: "select", options: window.PCC.store.VENDOR_PROJECT_CONTRACT_STATUSES, labels: CONTRACT_STATUS_LABELS }}
            record={link}
            idPrefix="vplfield-"
          />
        </div>
        <div className="field">
          <label>Scope of Work</label>
          <textarea id="vplfield-scope_of_work" rows={2} defaultValue={link.scope_of_work || ""} />
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Link Project" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ProjectsTab({ vendor, data, onChanged }: { vendor: PCCVendor; data: PCCStoreData; onChanged: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const links = data.vendor_project_links.filter((l) => l.vendor_id === vendor.id);
  const linkBeingEdited = !editingId ? null : editingId === "new" ? newProjectLink(vendor.id) : links.find((l) => l.id === editingId);

  return (
    <>
      <button
        className="btn btn--primary"
        style={{ marginBottom: "var(--space-3)" }}
        disabled={data.projects.filter((p) => !p.archived).length === 0}
        onClick={() => setEditingId("new")}
      >
        + Link Project
      </button>

      {linkBeingEdited ? (
        <ProjectLinkForm
          key={editingId}
          isNew={editingId === "new"}
          link={linkBeingEdited}
          vendor={vendor}
          data={data}
          onCancel={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            onChanged();
          }}
        />
      ) : null}

      {links.length === 0 ? (
        <div className="panel empty-state">No projects linked yet.</div>
      ) : (
        links.map((l) => (
          <div key={l.id} className="project-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>{projectName(data.projects, l.project_id)}</strong>
                <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  {l.role ? "Role: " + l.role + " — " : ""}
                  Contract: {CONTRACT_STATUS_LABELS[l.contract_status || ""] || l.contract_status}
                </p>
                {l.scope_of_work ? <p style={{ fontSize: 13, margin: "6px 0 0" }}>{l.scope_of_work}</p> : null}
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn--ghost" onClick={() => setEditingId(l.id)}>
                  Edit
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    deleteProjectLink(l.id);
                    onChanged();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ===== Profile: Contacts =====

interface ContactFormProps {
  isNew: boolean;
  contact: PCCVendorContact;
  vendor: PCCVendor;
  onCancel: () => void;
  onSaved: () => void;
}

function ContactForm({ isNew, contact, vendor, onCancel, onSaved }: ContactFormProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const values: Partial<PCCVendorContact> = {
      name: (form.querySelector("#vcfield-name") as HTMLInputElement).value.trim(),
      designation: (form.querySelector("#vcfield-designation") as HTMLInputElement).value.trim(),
      mobile: (form.querySelector("#vcfield-mobile") as HTMLInputElement).value.trim(),
      email: (form.querySelector("#vcfield-email") as HTMLInputElement).value.trim(),
      is_primary: (form.querySelector("#vcfield-is_primary") as HTMLInputElement).checked,
    };
    if (!values.name) return;
    saveContact(isNew, contact.id, vendor.id, values);
    onSaved();
  }
  return (
    <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field cfg={{ key: "name", label: "Name", type: "text", required: true }} record={contact} idPrefix="vcfield-" />
          <Field cfg={{ key: "designation", label: "Designation", type: "text" }} record={contact} idPrefix="vcfield-" />
          <Field cfg={{ key: "mobile", label: "Mobile", type: "text" }} record={contact} idPrefix="vcfield-" />
          <Field cfg={{ key: "email", label: "Email", type: "email" }} record={contact} idPrefix="vcfield-" />
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <input type="checkbox" id="vcfield-is_primary" defaultChecked={!!contact.is_primary} />
            Primary contact
          </label>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Contact" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ContactsTab({ vendor, data, onChanged }: { vendor: PCCVendor; data: PCCStoreData; onChanged: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const contacts = data.vendor_contacts.filter((c) => c.vendor_id === vendor.id);
  const contactBeingEdited = !editingId ? null : editingId === "new" ? newContact(vendor.id) : contacts.find((c) => c.id === editingId);

  return (
    <>
      <button className="btn btn--primary" style={{ marginBottom: "var(--space-3)" }} onClick={() => setEditingId("new")}>
        + Add Contact
      </button>

      {contactBeingEdited ? (
        <ContactForm
          key={editingId}
          isNew={editingId === "new"}
          contact={contactBeingEdited}
          vendor={vendor}
          onCancel={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            onChanged();
          }}
        />
      ) : null}

      {contacts.length === 0 ? (
        <div className="panel empty-state">No contacts added yet.</div>
      ) : (
        contacts.map((c) => (
          <div key={c.id} className="project-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>{c.name || "(unnamed)"}</strong>
                {c.is_primary ? <span className="status-badge status-badge--on_track" style={{ marginLeft: 6 }}>Primary</span> : null}
                <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  {[c.designation, c.mobile, c.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn--ghost" onClick={() => setEditingId(c.id)}>
                  Edit
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    deleteContact(c.id);
                    onChanged();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ===== Profile: Documents =====

interface DocumentUploadFormProps {
  vendor: PCCVendor;
  data: PCCStoreData;
  pendingDocGroupId: string | null;
  initialCategory: string;
  initialCustomCategory: string;
  initialProjectId: string;
  onCancel: () => void;
  onSaved: () => void;
}

function DocumentUploadForm({ vendor, data, pendingDocGroupId, initialCategory, initialCustomCategory, initialProjectId, onCancel, onSaved }: DocumentUploadFormProps) {
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [category, setCategory] = useState(initialCategory || "other");
  const [saving, setSaving] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setReadError(null);
    readAndFingerprintFile(file).then(setPendingFile, (err) => setReadError(err.message));
  }

  function handleSave() {
    const category = (document.getElementById("vdocfield-category") as HTMLSelectElement).value;
    const customLabelEl = document.getElementById("vdocfield-custom_category_label") as HTMLInputElement | null;
    const values = {
      project_id: (document.getElementById("vdocfield-project_id") as HTMLSelectElement).value,
      category: category,
      custom_category_label: customLabelEl ? customLabelEl.value.trim() : "",
      expiry_date: (document.getElementById("vdocfield-expiry_date") as HTMLInputElement).value,
      tags: (document.getElementById("vdocfield-tags") as HTMLInputElement).value,
      comments: (document.getElementById("vdocfield-comments") as HTMLTextAreaElement).value,
    };
    setSaving(true);
    saveVendorDocument(vendor, pendingFile, values, pendingDocGroupId).then(
      () => {
        onSaved();
      },
      (err) => {
        window.PCC.notify("Could not store the file: " + err.message, "error");
        setSaving(false);
      }
    );
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
      <h4 style={{ marginBottom: "var(--space-3)" }}>{pendingDocGroupId ? "Upload New Revision" : "Upload Document"}</h4>
      <input type="file" onChange={handleFileChange} />
      {readError ? (
        <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>{readError}</p>
      ) : null}
      {pendingFile ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0" }}>
          {pendingFile.name} · {formatBytes(pendingFile.size)}
        </p>
      ) : null}

      <div className="form-grid" style={{ marginTop: "var(--space-3)" }}>
        <div className="field">
          <label>Document Category</label>
          <select id="vdocfield-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {window.PCC.store.VENDOR_DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {VENDOR_DOCUMENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        {category === "other" ? (
          <div className="field">
            <label>Custom Category Label</label>
            <input type="text" id="vdocfield-custom_category_label" defaultValue={initialCustomCategory || ""} />
          </div>
        ) : null}
        <div className="field">
          <label>Project (optional)</label>
          <select id="vdocfield-project_id" defaultValue={initialProjectId || ""}>
            <option value="">— Not project-specific —</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || "(unnamed project)"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Expiry Date (optional)</label>
          <input type="date" id="vdocfield-expiry_date" defaultValue="" />
        </div>
        <div className="field">
          <label>Tags (comma-separated)</label>
          <input type="text" id="vdocfield-tags" defaultValue="" />
        </div>
      </div>

      <div className="field" style={{ marginTop: "var(--space-2)" }}>
        <label>Comments</label>
        <textarea id="vdocfield-comments" rows={2} defaultValue="" />
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <button type="button" className="btn btn--primary" disabled={!pendingFile || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save Document"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface DocumentsTabUploadState {
  groupId: string | null;
  category: string;
  customCategory: string;
  projectId: string;
}

function DocumentsTab({ vendor, data, onChanged }: { vendor: PCCVendor; data: PCCStoreData; onChanged: () => void }) {
  const [uploadState, setUploadState] = useState<DocumentsTabUploadState | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const latest = latestDocumentsForVendor(data.vendor_documents, vendor.id);

  return (
    <>
      <button
        className="btn btn--primary"
        style={{ marginBottom: "var(--space-3)" }}
        onClick={() => setUploadState({ groupId: null, category: "other", customCategory: "", projectId: "" })}
      >
        + Upload Document
      </button>

      {uploadState ? (
        <DocumentUploadForm
          key={uploadState.groupId || "new"}
          vendor={vendor}
          data={data}
          pendingDocGroupId={uploadState.groupId}
          initialCategory={uploadState.category}
          initialCustomCategory={uploadState.customCategory}
          initialProjectId={uploadState.projectId}
          onCancel={() => setUploadState(null)}
          onSaved={() => {
            setUploadState(null);
            onChanged();
          }}
        />
      ) : null}

      {latest.length === 0 ? (
        <div className="panel empty-state">No documents uploaded yet.</div>
      ) : (
        latest.map((doc) => {
          const groupId = doc.document_group_id;
          const allRevisions = data.vendor_documents
            .filter((d) => d.document_group_id === groupId)
            .sort((a, b) => (b.revision_number || 0) - (a.revision_number || 0));
          const expiry = doc.expiry_date ? daysUntil(doc.expiry_date) : null;
          const expiryText = doc.expiry_date
            ? " · Expires " + doc.expiry_date + (expiry !== null && expiry <= EXPIRING_SOON_DAYS ? (expiry < 0 ? " (EXPIRED)" : " (soon)") : "")
            : "";
          const expanded = expandedGroupId === groupId;
          return (
            <div key={doc.id} className="project-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{documentLabel(doc)}</strong>{" "}
                  <span className="status-badge status-badge--info">Rev {doc.revision_number}</span>
                  <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    {doc.filename} · {formatBytes(doc.file_size)} · {(doc.upload_date || "").slice(0, 10)}
                    {doc.project_id ? " · " + projectName(data.projects, doc.project_id) : ""}
                    {expiryText}
                  </p>
                  {doc.tags ? <p style={{ fontSize: 12, margin: "4px 0 0" }}>Tags: {doc.tags}</p> : null}
                  {doc.comments ? <p style={{ fontSize: 13, margin: "6px 0 0" }}>{doc.comments}</p> : null}
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                  <button className="btn btn--ghost" onClick={() => openStoredVendorDocument(doc)}>
                    View / Download
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() =>
                      setUploadState({ groupId: groupId || null, category: doc.category || "other", customCategory: doc.custom_category_label || "", projectId: doc.project_id || "" })
                    }
                  >
                    New Revision
                  </button>
                  <button className="btn btn--ghost" onClick={() => setExpandedGroupId(expanded ? null : groupId || null)}>
                    {allRevisions.length > 1 ? "History (" + allRevisions.length + ")" : "History"}
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      if (!window.confirm("Delete this document and all its revisions? This can't be undone.")) return;
                      deleteVendorDocumentGroup(allRevisions.map((d) => d.id));
                      onChanged();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {expanded && allRevisions.length > 1 ? (
                <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--divider)" }}>
                  {allRevisions.slice(1).map((rev) => (
                    <div key={rev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", marginBottom: "var(--space-1)" }}>
                      <span>
                        Rev {rev.revision_number} — {rev.filename} · {(rev.upload_date || "").slice(0, 10)}
                      </span>
                      <button className="btn btn--ghost" onClick={() => openStoredVendorDocument(rev)}>
                        View
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </>
  );
}

// ===== Shared: link-an-existing-record picker =====

interface LinkPickerPanelProps<T extends { id: string }> {
  items: T[];
  itemLabel: (item: T) => string;
  onLink: (id: string) => void;
  onClose: () => void;
  emptyText: string;
  buttonText: string;
}

function LinkPickerPanel<T extends { id: string }>({ items, itemLabel, onLink, onClose, emptyText, buttonText }: LinkPickerPanelProps<T>) {
  const [selected, setSelected] = useState(items[0] ? items[0].id : "");
  return (
    <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
      {items.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          {emptyText}
        </p>
      ) : (
        <>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {itemLabel(item)}
              </option>
            ))}
          </select>
          <button className="btn btn--primary" style={{ marginLeft: "var(--space-3)" }} onClick={() => onLink(selected)}>
            {buttonText}
          </button>
        </>
      )}
      <button className="btn btn--ghost" style={{ marginLeft: "var(--space-3)" }} onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

// ===== Profile: Meetings =====

function MeetingsTab({ vendor, data, onChanged }: { vendor: PCCVendor; data: PCCStoreData; onChanged: () => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const linkedProjectIds = data.vendor_project_links.filter((l) => l.vendor_id === vendor.id).map((l) => l.project_id);
  const linkedMeetingIds = data.vendor_meeting_links.filter((l) => l.vendor_id === vendor.id).map((l) => l.meeting_id);
  const links = data.vendor_meeting_links.filter((l) => l.vendor_id === vendor.id);

  return (
    <>
      <button className="btn btn--primary" style={{ marginBottom: "var(--space-3)" }} onClick={() => setPickerOpen(true)}>
        + Link Existing Meeting
      </button>

      {pickerOpen ? (
        <LinkPickerPanel
          items={data.meetings.filter((m) => linkedMeetingIds.indexOf(m.id) === -1 && (linkedProjectIds.length === 0 || linkedProjectIds.indexOf(m.project_id) !== -1))}
          itemLabel={(m) => m.meeting_date + " — " + m.title + " (" + projectName(data.projects, m.project_id) + ")"}
          emptyText="No meetings available to link (from this vendor's linked projects). Link a project first, or add meetings in the Meetings module."
          buttonText="Link"
          onLink={(meetingId) => {
            linkMeeting(vendor.id, meetingId);
            setPickerOpen(false);
            onChanged();
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {links.length === 0 ? (
        <div className="panel empty-state">No meetings linked yet.</div>
      ) : (
        links.map((l) => {
          const m = data.meetings.find((x) => x.id === l.meeting_id);
          if (!m) {
            return (
              <div key={l.id} className="project-card">
                <p className="text-secondary">(linked meeting was deleted)</p>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    unlinkMeeting(l.id);
                    onChanged();
                  }}
                >
                  Remove Link
                </button>
              </div>
            );
          }
          const attachmentCount = data.documents.filter((doc) => doc.meeting_id === m.id && !doc.trashed_at).length;
          return (
            <div key={l.id} className="project-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{m.title}</strong>
                  <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    {m.meeting_date} · Participants: {m.attendees || "—"} · {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"}
                  </p>
                  {m.minutes ? <p style={{ fontSize: 13, margin: "6px 0 0" }}>{m.minutes.slice(0, 200) + (m.minutes.length > 200 ? "…" : "")}</p> : null}
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button className="btn btn--ghost" onClick={() => viewMeeting(m.id)}>
                    View Meeting
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      unlinkMeeting(l.id);
                      onChanged();
                    }}
                  >
                    Unlink
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

// ===== Profile: RFIs =====

function RfisTab({ vendor, data, onChanged }: { vendor: PCCVendor; data: PCCStoreData; onChanged: () => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const linkedProjectIds = data.vendor_project_links.filter((l) => l.vendor_id === vendor.id).map((l) => l.project_id);
  const linkedRfiIds = data.vendor_rfi_links.filter((l) => l.vendor_id === vendor.id).map((l) => l.rfi_id);
  const linkedRfis = data.rfis.filter((r) => linkedRfiIds.indexOf(r.id) !== -1);
  const links = data.vendor_rfi_links.filter((l) => l.vendor_id === vendor.id);

  const counts = { pending: 0, closed: 0, openTq: 0 };
  linkedRfis.forEach((r) => {
    if (r.status === "closed") counts.closed++;
    else if (r.type === "technical_query") counts.openTq++;
    else counts.pending++;
  });

  return (
    <>
      <div style={{ display: "flex", gap: "var(--space-5)", marginBottom: "var(--space-3)", fontSize: "var(--text-sm)" }}>
        <span>
          <strong>{counts.pending}</strong> Pending RFIs
        </span>
        <span>
          <strong>{counts.closed}</strong> Closed
        </span>
        <span>
          <strong>{counts.openTq}</strong> Open Technical Queries
        </span>
      </div>

      <button className="btn btn--primary" style={{ marginBottom: "var(--space-3)" }} onClick={() => setPickerOpen(true)}>
        + Link Existing RFI / TQ
      </button>

      {pickerOpen ? (
        <LinkPickerPanel
          items={data.rfis.filter((r) => linkedRfiIds.indexOf(r.id) === -1 && (linkedProjectIds.length === 0 || linkedProjectIds.indexOf(r.project_id) !== -1))}
          itemLabel={(r) => r.number + " — " + r.subject + " (" + RFI_TYPE_LABELS[r.type || ""] + ", " + RFI_STATUS_LABELS[r.status || ""] + ")"}
          emptyText="No RFIs/TQs available to link (from this vendor's linked projects). Link a project first, or add entries in the RFI / TQ module."
          buttonText="Link"
          onLink={(rfiId) => {
            linkRfi(vendor.id, rfiId);
            setPickerOpen(false);
            onChanged();
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {links.length === 0 ? (
        <div className="panel empty-state">No RFIs / Technical Queries linked yet.</div>
      ) : (
        links.map((l) => {
          const r = data.rfis.find((x) => x.id === l.rfi_id);
          if (!r) {
            return (
              <div key={l.id} className="project-card">
                <p className="text-secondary">(linked RFI/TQ was deleted)</p>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    unlinkRfi(l.id);
                    onChanged();
                  }}
                >
                  Remove Link
                </button>
              </div>
            );
          }
          return (
            <div key={l.id} className="project-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong className="mono">{r.number}</strong> {r.subject} <span className="status-badge status-badge--info">{RFI_TYPE_LABELS[r.type || ""]}</span>
                  <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    Status: {RFI_STATUS_LABELS[r.status || ""]}
                    {r.date_required ? " · Response due: " + r.date_required : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button className="btn btn--ghost" onClick={() => viewRfi(r.id)}>
                    View RFI / TQ
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      unlinkRfi(l.id);
                      onChanged();
                    }}
                  >
                    Unlink
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

// ===== Profile: Risks =====

function RisksTab({ vendor, data, onChanged }: { vendor: PCCVendor; data: PCCStoreData; onChanged: () => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const linkedProjectIds = data.vendor_project_links.filter((l) => l.vendor_id === vendor.id).map((l) => l.project_id);
  const linkedRiskIds = data.vendor_risk_links.filter((l) => l.vendor_id === vendor.id).map((l) => l.risk_id);
  const links = data.vendor_risk_links.filter((l) => l.vendor_id === vendor.id);

  return (
    <>
      <button className="btn btn--primary" style={{ marginBottom: "var(--space-3)" }} onClick={() => setPickerOpen(true)}>
        + Link Existing Risk
      </button>

      {pickerOpen ? (
        <LinkPickerPanel
          items={data.risks.filter((r) => linkedRiskIds.indexOf(r.id) === -1 && (linkedProjectIds.length === 0 || linkedProjectIds.indexOf(r.project_id) !== -1))}
          itemLabel={(r) => r.title + " (" + r.type + ", " + r.status + ")"}
          emptyText="No risks/issues/opportunities available to link (from this vendor's linked projects). Link a project first, or add entries in the Risk Register."
          buttonText="Link"
          onLink={(riskId) => {
            linkRisk(vendor.id, riskId);
            setPickerOpen(false);
            onChanged();
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {links.length === 0 ? (
        <div className="panel empty-state">No risks, issues, or opportunities linked yet.</div>
      ) : (
        links.map((l) => {
          const r = data.risks.find((x) => x.id === l.risk_id);
          if (!r) {
            return (
              <div key={l.id} className="project-card">
                <p className="text-secondary">(linked entry was deleted)</p>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    unlinkRisk(l.id);
                    onChanged();
                  }}
                >
                  Remove Link
                </button>
              </div>
            );
          }
          return (
            <div key={l.id} className="project-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{r.title}</strong> <span className="status-badge status-badge--info">{r.type}</span>
                  <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    Status: {r.status}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button className="btn btn--ghost" onClick={() => viewRisk(r.id)}>
                    View Risk
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      unlinkRisk(l.id);
                      onChanged();
                    }}
                  >
                    Unlink
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

// ===== Profile: Performance =====

interface PerformanceFormProps {
  isNew: boolean;
  perf: PCCVendorPerformance;
  vendor: PCCVendor;
  onCancel: () => void;
  onSaved: () => void;
}

function PerformanceForm({ isNew, perf, vendor, onCancel, onSaved }: PerformanceFormProps) {
  function ratingOptions() {
    return [0, 1, 2, 3, 4, 5].map((n) => (
      <option key={n} value={n}>
        {n === 0 ? "Not rated" : n + " / 5"}
      </option>
    ));
  }
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const values: Partial<PCCVendorPerformance> = {
      quality_rating: Number((form.querySelector("#vperffield-quality_rating") as HTMLSelectElement).value),
      delivery_rating: Number((form.querySelector("#vperffield-delivery_rating") as HTMLSelectElement).value),
      communication_rating: Number((form.querySelector("#vperffield-communication_rating") as HTMLSelectElement).value),
      safety_rating: Number((form.querySelector("#vperffield-safety_rating") as HTMLSelectElement).value),
      review_date: (form.querySelector("#vperffield-review_date") as HTMLInputElement).value,
      reviewed_by: (form.querySelector("#vperffield-reviewed_by") as HTMLInputElement).value,
      comments: (form.querySelector("#vperffield-comments") as HTMLTextAreaElement).value,
    };
    savePerformance(isNew, perf.id, vendor.id, values);
    onSaved();
  }
  return (
    <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Quality Rating</label>
            <select id="vperffield-quality_rating" defaultValue={String(perf.quality_rating || 0)}>
              {ratingOptions()}
            </select>
          </div>
          <div className="field">
            <label>Delivery Rating</label>
            <select id="vperffield-delivery_rating" defaultValue={String(perf.delivery_rating || 0)}>
              {ratingOptions()}
            </select>
          </div>
          <div className="field">
            <label>Communication Rating</label>
            <select id="vperffield-communication_rating" defaultValue={String(perf.communication_rating || 0)}>
              {ratingOptions()}
            </select>
          </div>
          <div className="field">
            <label>Safety Rating</label>
            <select id="vperffield-safety_rating" defaultValue={String(perf.safety_rating || 0)}>
              {ratingOptions()}
            </select>
          </div>
          <Field cfg={{ key: "review_date", label: "Review Date", type: "date" }} record={perf} idPrefix="vperffield-" />
          <Field cfg={{ key: "reviewed_by", label: "Reviewed By", type: "text" }} record={perf} idPrefix="vperffield-" />
        </div>
        <div className="field" style={{ marginTop: "var(--space-2)" }}>
          <label>Comments</label>
          <textarea id="vperffield-comments" rows={2} defaultValue={perf.comments || ""} />
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Review" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function PerformanceTab({ vendor, data, onChanged }: { vendor: PCCVendor; data: PCCStoreData; onChanged: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const reviews = data.vendor_performance.filter((p) => p.vendor_id === vendor.id).slice().sort((a, b) => (b.review_date || "").localeCompare(a.review_date || ""));
  const perfBeingEdited = !editingId ? null : editingId === "new" ? newPerformance(vendor.id) : reviews.find((r) => r.id === editingId);

  return (
    <>
      {reviews.length > 0 ? (
        <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
          <p className="text-secondary" style={{ fontSize: 11, marginBottom: 4 }}>
            OVERALL RATING ({reviews.length} review{reviews.length === 1 ? "" : "s"})
          </p>
          <p style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
            {(Math.round((reviews.reduce((sum, r) => sum + overallRating(r), 0) / reviews.length) * 10) / 10).toFixed(1)} / 5
          </p>
        </div>
      ) : null}

      <button className="btn btn--primary" style={{ marginBottom: "var(--space-3)" }} onClick={() => setEditingId("new")}>
        + Add Review
      </button>

      {perfBeingEdited ? (
        <PerformanceForm
          key={editingId}
          isNew={editingId === "new"}
          perf={perfBeingEdited}
          vendor={vendor}
          onCancel={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            onChanged();
          }}
        />
      ) : null}

      {reviews.length === 0 ? (
        <div className="panel empty-state">No performance reviews yet.</div>
      ) : (
        reviews.map((r) => (
          <div key={r.id} className="project-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>{ratingText(overallRating(r))} overall</strong>
                <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  {r.review_date}
                  {r.reviewed_by ? " · " + r.reviewed_by : ""}
                </p>
                <p style={{ fontSize: 12, margin: "6px 0 0" }}>
                  Quality: {ratingText(r.quality_rating || 0)} · Delivery: {ratingText(r.delivery_rating || 0)} · Communication: {ratingText(r.communication_rating || 0)} · Safety: {ratingText(r.safety_rating || 0)}
                </p>
                {r.comments ? <p style={{ fontSize: 13, margin: "6px 0 0" }}>{r.comments}</p> : null}
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn--ghost" onClick={() => setEditingId(r.id)}>
                  Edit
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    deletePerformance(r.id);
                    onChanged();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ===== Profile: Notes =====

function NotesTab({ vendor, data, onChanged }: { vendor: PCCVendor; data: PCCStoreData; onChanged: () => void }) {
  const [draft, setDraft] = useState("");
  const notes = data.vendor_notes.filter((n) => n.vendor_id === vendor.id).slice().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  function handleAdd() {
    if (!draft.trim()) return;
    addNote(vendor.id, draft.trim());
    setDraft("");
    onChanged();
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
        <textarea rows={3} placeholder="Add a note…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn btn--primary" style={{ marginTop: "var(--space-2)" }} onClick={handleAdd}>
          Add Note
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="panel empty-state">No notes yet.</div>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="project-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.note_text}</p>
                <p className="text-secondary" style={{ fontSize: 11, margin: "6px 0 0" }}>
                  {new Date(n.created_at || "").toLocaleString()}
                </p>
              </div>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  deleteNote(n.id);
                  onChanged();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ===== Profile: Document Lookahead =====

function LookaheadTab({ vendor, data }: { vendor: PCCVendor; data: PCCStoreData }) {
  const typesById: { [id: string]: (typeof data.document_types)[number] } = {};
  data.document_types.forEach((t) => (typesById[t.id] = t));
  const activitiesById: { [id: string]: PCCActivity } = {};
  data.activities.forEach((a) => (activitiesById[a.id] = a));
  const schedulesById: { [id: string]: (typeof data.schedules)[number] } = {};
  data.schedules.forEach((s) => (schedulesById[s.id] = s));

  const rows = data.project_document_requirements.filter((r) => r.vendor_id === vendor.id && typesById[r.document_type_id]);

  if (rows.length === 0) {
    return (
      <div className="panel empty-state">
        No document requirements are currently assigned to this vendor. Assign this vendor to a project's document requirements from Portfolio's Add/Edit Project form (Document Requirements section).
      </div>
    );
  }

  const overdueCount = rows.filter((r) => computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date) === "overdue").length;

  return (
    <>
      <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
        <p className="text-secondary" style={{ fontSize: 11, marginBottom: 4 }}>
          DOCUMENT LOOKAHEAD
        </p>
        <p style={{ fontSize: 13, margin: 0 }}>
          {rows.length} document requirement{rows.length === 1 ? "" : "s"} assigned across {new Set(rows.map((r) => r.project_id)).size} project(s)
          {overdueCount > 0 ? (
            <>
              {", "}
              <strong style={{ color: "var(--status-critical)" }}>{overdueCount} overdue</strong>
            </>
          ) : null}
        </p>
      </div>

      {rows
        .slice()
        .sort((a, b) => (a.planned_submission_date || "9999-99-99").localeCompare(b.planned_submission_date || "9999-99-99"))
        .map((r) => {
          const t = typesById[r.document_type_id];
          const status = computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date);
          const badgeInfo = REQUIREMENT_STATUS_BADGE[status];
          const linkedActivity = r.activity_id ? activitiesById[r.activity_id] : null;
          const linkedSchedule = linkedActivity ? schedulesById[linkedActivity.schedule_id] : null;
          return (
            <div key={r.id} className="project-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>
                  {t.name || "(unnamed type)"}
                  {t.code ? " (" + t.code + ")" : ""}
                </strong>
                <span className={"status-badge status-badge--" + badgeInfo.className}>{badgeInfo.label}</span>
              </div>
              <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0 0" }}>
                Project: {projectName(data.projects, r.project_id)}
                {r.planned_submission_date ? " · Due " + r.planned_submission_date : " · No due date set"}
                {linkedActivity
                  ? " · Linked to " +
                    (linkedSchedule ? linkedSchedule.name : "(schedule)") +
                    ": " +
                    (linkedActivity.name || "(unnamed activity)") +
                    (r.lead_time_days ? " (" + r.lead_time_days + "d lead time)" : "")
                  : ""}
              </p>
            </div>
          );
        })}
    </>
  );
}

// ===== Profile: Activities =====

function ActivitiesTab({ vendor, data }: { vendor: PCCVendor; data: PCCStoreData }) {
  const schedulesById: { [id: string]: (typeof data.schedules)[number] } = {};
  data.schedules.forEach((s) => (schedulesById[s.id] = s));
  const rows = data.activities.filter((a) => a.vendor_id === vendor.id);

  if (rows.length === 0) {
    return (
      <div className="panel empty-state">
        No Schedule activities are currently assigned to this vendor. Assign this vendor from an activity's Edit form on the Schedule page.
      </div>
    );
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
        <p className="text-secondary" style={{ fontSize: 11, marginBottom: 4 }}>
          ASSIGNED ACTIVITIES
        </p>
        <p style={{ fontSize: 13, margin: 0 }}>
          {rows.length} activit{rows.length === 1 ? "y" : "ies"} assigned across {new Set(rows.map((a) => a.project_id)).size} project(s)
        </p>
      </div>

      {rows
        .slice()
        .sort((a, b) => (a.early_start || a.planned_start || "9999-99-99").localeCompare(b.early_start || b.planned_start || "9999-99-99"))
        .map((a) => {
          const schedule = schedulesById[a.schedule_id];
          const thresholdDays = (schedule && schedule.near_critical_threshold_days) || 5;
          const floatVal = a.total_float;
          const critical = floatVal != null && floatVal <= 0;
          const nearCritical = floatVal != null && floatVal > 0 && floatVal <= thresholdDays;
          const badgeClass = critical ? "critical" : nearCritical ? "at_risk" : "on_track";
          const badgeLabel = critical ? "Critical" : nearCritical ? "Near-Critical" : "On Track";
          const date = a.early_start || a.planned_start;
          return (
            <div key={a.id} className="project-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{a.name || "(unnamed activity)"}</strong>
                <span className={"status-badge status-badge--" + badgeClass}>{badgeLabel}</span>
              </div>
              <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0 0" }}>
                Project: {projectName(data.projects, a.project_id)}
                {schedule ? " · " + schedule.name : ""}
                {date ? " · Starts " + date : " · No date set yet"}
              </p>
              {window.PCC.schedule ? (
                <button className="btn btn--ghost" style={{ marginTop: "var(--space-2)" }} onClick={() => viewActivityInSchedule(a.project_id, a.schedule_id, a.id)}>
                  View in Schedule
                </button>
              ) : null}
            </div>
          );
        })}
    </>
  );
}

// ===== Profile shell =====

var PROFILE_TABS = [
  { key: "overview", label: "Overview" },
  { key: "projects", label: "Projects" },
  { key: "contacts", label: "Contacts" },
  { key: "documents", label: "Documents" },
  { key: "meetings", label: "Meetings" },
  { key: "rfis", label: "RFI / TQ" },
  { key: "risks", label: "Risks" },
  { key: "performance", label: "Performance" },
  { key: "notes", label: "Notes" },
  { key: "lookahead", label: "Document Lookahead" },
  { key: "activities", label: "Activities" },
];

interface ProfileProps {
  vendor: PCCVendor;
  data: PCCStoreData;
  tab: string;
  onTabChange: (tab: string) => void;
  onBack: () => void;
  onEdit: () => void;
  onChanged: () => void;
}

function Profile({ vendor, data, tab, onTabChange, onBack, onEdit, onChanged }: ProfileProps) {
  return (
    <>
      <button className="btn btn--ghost" onClick={onBack}>
        ← Back to Vendor List
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h3>{vendor.vendor_name}</h3>
          <span className={statusBadgeClass(vendor.status)} style={{ marginLeft: "var(--space-3)" }}>
            {VENDOR_STATUS_LABELS[vendor.status || ""] || vendor.status}
          </span>
        </div>
        <button className="btn btn--ghost" onClick={onEdit}>
          Edit Vendor
        </button>
      </div>

      <div className="tab-bar" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-4)" }}>
        {PROFILE_TABS.map((t) => (
          <button key={t.key} className={"tab-btn" + (tab === t.key ? " tab-btn--active" : "")} onClick={() => onTabChange(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "overview" ? (
          <OverviewTab vendor={vendor} data={data} />
        ) : tab === "projects" ? (
          <ProjectsTab vendor={vendor} data={data} onChanged={onChanged} />
        ) : tab === "contacts" ? (
          <ContactsTab vendor={vendor} data={data} onChanged={onChanged} />
        ) : tab === "documents" ? (
          <DocumentsTab vendor={vendor} data={data} onChanged={onChanged} />
        ) : tab === "meetings" ? (
          <MeetingsTab vendor={vendor} data={data} onChanged={onChanged} />
        ) : tab === "rfis" ? (
          <RfisTab vendor={vendor} data={data} onChanged={onChanged} />
        ) : tab === "risks" ? (
          <RisksTab vendor={vendor} data={data} onChanged={onChanged} />
        ) : tab === "performance" ? (
          <PerformanceTab vendor={vendor} data={data} onChanged={onChanged} />
        ) : tab === "notes" ? (
          <NotesTab vendor={vendor} data={data} onChanged={onChanged} />
        ) : tab === "lookahead" ? (
          <LookaheadTab vendor={vendor} data={data} />
        ) : (
          <ActivitiesTab vendor={vendor} data={data} />
        )}
      </div>
    </>
  );
}

// ===== Top-level page =====

interface VendorsPageProps {
  initialView?: string;
  initialProfileVendorId?: string;
  initialProfileTab?: string;
  initialProjectFilter?: string;
}

export default function VendorsPage({ initialView, initialProfileVendorId, initialProfileTab, initialProjectFilter }: VendorsPageProps) {
  const [data, setData] = useState<PCCStoreData>(() => getData());
  const [view, setView] = useState(initialView || "dashboard");
  const [profileVendorId, setProfileVendorId] = useState<string | null>(initialProfileVendorId || null);
  const [profileTab, setProfileTab] = useState(initialProfileTab || "overview");
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [filters, setFilters] = useState<VendorFilters>(() => {
    const ctxProjectId = getProjectContext();
    const projectFilter = initialProjectFilter || (ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "");
    return { search: "", statusFilter: "", projectFilter: projectFilter, tradeFilter: "", docTypeFilter: "" };
  });

  function refresh() {
    setData(getData());
  }

  const vendor = profileVendorId ? data.vendors.find((v) => v.id === profileVendorId) : null;

  return (
    <>
      <h2 style={{ marginBottom: "var(--space-2)" }}>Vendor Management</h2>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
        The single source of truth for vendor information across every project — master list, project links, documents, meetings, RFI/TQ, risks, and
        performance, all from one profile.
      </p>

      {view !== "profile" ? (
        <div className="tab-bar" style={{ marginBottom: "var(--space-4)" }}>
          {[
            { key: "dashboard", label: "Dashboard" },
            { key: "list", label: "Vendor List" },
          ].map((t) => (
            <button key={t.key} className={"tab-btn" + (view === t.key ? " tab-btn--active" : "")} onClick={() => setView(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {view === "dashboard" ? (
        <Dashboard data={data} />
      ) : view === "list" ? (
        <VendorList
          data={data}
          filters={filters}
          setFilters={setFilters}
          editingVendorId={editingVendorId}
          onEdit={(id) => setEditingVendorId(id)}
          onAdd={() => setEditingVendorId("new")}
          onCancelEdit={() => setEditingVendorId(null)}
          onSaved={(isNew, savedVendorId) => {
            setEditingVendorId(null);
            if (isNew) {
              setView("profile");
              setProfileVendorId(savedVendorId);
              setProfileTab("overview");
            }
            refresh();
          }}
          onView={(id) => {
            setView("profile");
            setProfileVendorId(id);
            setProfileTab("overview");
          }}
          onDeleted={(deletedId) => {
            if (profileVendorId === deletedId) {
              setView("list");
              setProfileVendorId(null);
            }
            refresh();
          }}
        />
      ) : vendor ? (
        <Profile
          vendor={vendor}
          data={data}
          tab={profileTab}
          onTabChange={setProfileTab}
          onBack={() => {
            setView("list");
            setProfileVendorId(null);
          }}
          onEdit={() => {
            setEditingVendorId(vendor.id);
            setView("list");
          }}
          onChanged={refresh}
        />
      ) : null}
    </>
  );
}
