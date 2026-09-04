/* Commitment Management, migrated to React as part of the page-by-page migration
 * (Post-Phase-5 Engineering Evolution). Reproduces the prior vanilla page's exact text,
 * field ids (cmtfield- / pkgfield- prefixed), button labels, and CSS class names (panel/
 * form-grid/field/tab-bar/tab-btn/kpi-grid/kpi-card/detail-card/status-badge/toolbar/
 * btn) — same visual result, only the implementation moved. See
 * src/js/pages/commitments.js (now a ~35-line stub) for the router registration and the
 * window.PCC.commitments public API (filterByProject/expandCommitment) other
 * still-vanilla pages depend on, preserved via the same pending-prop channel established
 * for other migrated pages' cross-page handoffs.
 *
 * Both the Commitment and Package add/edit forms are UNCONTROLLED (fields read via
 * form.querySelector at submit time, like every other migrated register).
 *
 * All store reads/writes go through commitmentsService.js (master prompt §9). Actual
 * Value is never a form field — it's the same live sum of Cost Tracking entries the
 * vanilla page always computed at render time (see that service module's own comment).
 */
import React, { useState } from "react";
import {
  TYPE_LABELS,
  STATUS_LABELS,
  COMMITMENT_RISK_WINDOW_DAYS,
  getData,
  projectName,
  vendorName,
  packageName,
  formatMoney,
  actualValueFor,
  remainingFor,
  commitmentIsAtRisk,
  activitiesForProject,
  budgetItemsForProject,
  newCommitment,
  saveCommitment,
  deleteCommitment,
  newPackage,
  savePackage,
  deletePackage,
  getProjectContext,
  setProjectContext,
  viewActivityInSchedule,
} from "../services/commitmentsService";
import type { ActivityOption, BudgetItemOption } from "../services/commitmentsService";
import type { PCCCommitment, PCCPackage, PCCStoreData, PCCActivity } from "../types/pcc";

function CommitmentForm({
  isNew,
  commitment,
  data,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  commitment: PCCCommitment;
  data: PCCStoreData;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const activeProjects = data.projects.filter((p) => !p.archived);
  const [selectedProjectId, setSelectedProjectId] = useState(commitment.project_id || "");
  const [showError, setShowError] = useState(false);

  const activityOptions: ActivityOption[] = activitiesForProject(data, selectedProjectId);
  const budgetItemOptions: BudgetItemOption[] = budgetItemsForProject(data, selectedProjectId);
  const actual = !isNew ? actualValueFor(data, commitment.id) : 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    if (!selectedProjectId) {
      setShowError(true);
      return;
    }
    setShowError(false);

    const committedValueRaw = (form.querySelector("#cmtfield-committed_value") as HTMLInputElement).value;
    const approvedValueRaw = (form.querySelector("#cmtfield-approved_value") as HTMLInputElement).value;
    const values: Partial<PCCCommitment> = {
      project_id: selectedProjectId,
      vendor_id: (form.querySelector("#cmtfield-vendor_id") as HTMLSelectElement).value,
      package_id: (form.querySelector("#cmtfield-package_id") as HTMLSelectElement).value,
      type: (form.querySelector("#cmtfield-type") as HTMLSelectElement).value,
      po_contract_number: (form.querySelector("#cmtfield-po_contract_number") as HTMLInputElement).value,
      commitment_date: (form.querySelector("#cmtfield-commitment_date") as HTMLInputElement).value,
      committed_value: committedValueRaw === "" ? null : Number(committedValueRaw),
      approved_value: approvedValueRaw === "" ? null : Number(approvedValueRaw),
      status: (form.querySelector("#cmtfield-status") as HTMLSelectElement).value,
      budget_item_id: (form.querySelector("#cmtfield-budget_item_id") as HTMLSelectElement).value,
      activity_id: (form.querySelector("#cmtfield-activity_id") as HTMLSelectElement).value,
      notes: (form.querySelector("#cmtfield-notes") as HTMLTextAreaElement).value,
    };

    saveCommitment(isNew, commitment.id, values);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Commitment" : "Edit Commitment"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Project *</label>
            <select id="cmtfield-project_id" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
              <option value="">(none)</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "(unnamed project)"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Vendor</label>
            <select id="cmtfield-vendor_id" defaultValue={commitment.vendor_id || ""}>
              <option value="">(none)</option>
              {data.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendor_name || "(unnamed vendor)"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Package</label>
            <select id="cmtfield-package_id" defaultValue={commitment.package_id || ""}>
              <option value="">(none)</option>
              {data.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name + (p.code ? " (" + p.code + ")" : "")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select id="cmtfield-type" defaultValue={commitment.type || "purchase_order"}>
              {window.PCC.store.COMMITMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>PO / Contract #</label>
            <input type="text" id="cmtfield-po_contract_number" defaultValue={commitment.po_contract_number || ""} />
          </div>
          <div className="field">
            <label>Commitment Date</label>
            <input type="date" id="cmtfield-commitment_date" defaultValue={commitment.commitment_date || ""} />
          </div>
          <div className="field">
            <label>Committed Value</label>
            <input type="number" step="any" id="cmtfield-committed_value" defaultValue={commitment.committed_value == null ? "" : commitment.committed_value} />
          </div>
          <div className="field">
            <label>Approved Value</label>
            <input type="number" step="any" id="cmtfield-approved_value" defaultValue={commitment.approved_value == null ? "" : commitment.approved_value} />
          </div>
          <div className="field">
            <label>Status</label>
            <select id="cmtfield-status" defaultValue={commitment.status || "draft"}>
              {window.PCC.store.COMMITMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Against Budget Item</label>
            <select id="cmtfield-budget_item_id" key={"bi-" + selectedProjectId} defaultValue={commitment.budget_item_id || ""}>
              <option value="">{selectedProjectId ? "(none)" : "(select a project first)"}</option>
              {budgetItemOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Related Activity</label>
            <select id="cmtfield-activity_id" key={"act-" + selectedProjectId} defaultValue={commitment.activity_id || ""}>
              <option value="">{selectedProjectId ? "(none)" : "(select a project first)"}</option>
              {activityOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea id="cmtfield-notes" rows={2} defaultValue={commitment.notes || ""} />
        </div>

        {!isNew ? (
          <p className="text-secondary" style={{ fontSize: 12 }}>
            Actual Value is computed automatically — {formatMoney(actual)} so far, from Cost Tracking's Actual Cost entries logged against this
            commitment. Log or edit those in Cost Tracking, not here.
          </p>
        ) : null}

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Project is required.</p> : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={activeProjects.length === 0}>
            {isNew ? "Add Commitment" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function KpiStrip({ filtered, data }: { filtered: PCCCommitment[]; data: PCCStoreData }) {
  const totals = { committed: 0, approved: 0, actual: 0, remaining: 0, atRisk: 0 };
  filtered.forEach((c) => {
    const actual = actualValueFor(data, c.id);
    totals.committed += Number(c.committed_value) || 0;
    totals.approved += Number(c.approved_value) || 0;
    totals.actual += actual;
    totals.remaining += remainingFor(c.committed_value, actual) || 0;
    if (commitmentIsAtRisk(c, data)) totals.atRisk++;
  });

  const kpis: { label: string; value: string | number; colorVar?: string | null }[] = [
    { label: "TOTAL COMMITTED", value: formatMoney(totals.committed) },
    { label: "TOTAL APPROVED", value: formatMoney(totals.approved) },
    { label: "TOTAL ACTUAL", value: formatMoney(totals.actual) },
    { label: "TOTAL REMAINING", value: formatMoney(totals.remaining), colorVar: totals.remaining < 0 ? "--status-critical" : null },
    { label: "AT RISK", value: totals.atRisk, colorVar: totals.atRisk > 0 ? "--status-critical" : null },
  ];

  return (
    <div className="kpi-grid" style={{ marginBottom: 16 }}>
      {kpis.map((kpi) => (
        <div className="kpi-card" key={kpi.label}>
          <span className="kpi-card__label">{kpi.label}</span>
          <span className="kpi-card__value mono" style={kpi.colorVar ? { color: "var(" + kpi.colorVar + ")" } : undefined}>
            {kpi.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CommitmentRow({
  c,
  data,
  onEdit,
  onDelete,
}: {
  c: PCCCommitment;
  data: PCCStoreData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const actual = actualValueFor(data, c.id);
  const remaining = remainingFor(c.committed_value, actual);
  const metaParts = [projectName(data.projects, c.project_id), TYPE_LABELS[c.type || ""] || c.type];
  if (c.vendor_id) metaParts.push(vendorName(data.vendors, c.vendor_id));
  if (c.package_id) metaParts.push(packageName(data.packages, c.package_id));
  if (c.commitment_date) metaParts.push(c.commitment_date);
  const activity = c.activity_id ? data.activities.find((a) => a.id === c.activity_id) : null;

  return (
    <div className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
      <div>
        <strong>{c.po_contract_number || "(no PO/Contract #)"}</strong>
        <br />
        <span className="text-secondary" style={{ fontSize: 12 }}>
          {metaParts.join(" · ")}
        </span>
        <br />
        <span style={{ fontSize: 12 }}>
          Committed {formatMoney(c.committed_value)} · Approved {formatMoney(c.approved_value)} · Actual {formatMoney(actual)} ·{" "}
          <span style={{ color: remaining != null && remaining < 0 ? "var(--status-critical)" : "inherit" }}>Remaining {formatMoney(remaining)}</span>
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {commitmentIsAtRisk(c, data) ? (
          <span
            className="status-badge status-badge--critical"
            style={{ fontSize: 11 }}
            title={
              "The linked activity starts within " +
              COMMITMENT_RISK_WINDOW_DAYS +
              " days (or has already started) and this commitment isn't approved yet."
            }
          >
            Procurement Risk
          </span>
        ) : null}
        <span className="status-badge status-badge--info" style={{ fontSize: 11 }}>
          {STATUS_LABELS[c.status || ""] || c.status}
        </span>
        {activity ? (
          <button className="btn btn--ghost" onClick={() => viewActivityInSchedule(activity)}>
            View Activity
          </button>
        ) : null}
        <button className="btn btn--ghost" onClick={onEdit}>
          Edit
        </button>
        <button className="btn btn--ghost" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function CommitmentsTab({
  data,
  editingCommitmentId,
  setEditingCommitmentId,
  initialProjectFilter,
  refresh,
}: {
  data: PCCStoreData;
  editingCommitmentId: string | null;
  setEditingCommitmentId: (id: string | null) => void;
  initialProjectFilter?: string;
  refresh: () => void;
}) {
  const [search, setSearch] = useState("");
  // Redesign Gate 6 (Global Project Context): follow the shared active project on this
  // page's first render whenever no explicit filterByProject() prefill was given — same
  // pattern risks.js/decisionRegister.js's stubs already establish.
  const [projectFilter, setProjectFilter] = useState(() => {
    if (initialProjectFilter) return initialProjectFilter;
    const ctxProjectId = getProjectContext();
    return ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });
  const [vendorFilter, setVendorFilter] = useState("");
  const [packageFilter, setPackageFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const commitmentBeingEdited: PCCCommitment | null =
    !editingCommitmentId
      ? null
      : editingCommitmentId === "new"
      ? newCommitment({})
      : data.commitments.find((c) => c.id === editingCommitmentId) || null;

  function matchesFilters(c: PCCCommitment): boolean {
    if (projectFilter && c.project_id !== projectFilter) return false;
    if (vendorFilter && c.vendor_id !== vendorFilter) return false;
    if (packageFilter && c.package_id !== packageFilter) return false;
    if (typeFilter && c.type !== typeFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const haystack = ((c.po_contract_number || "") + " " + (c.notes || "")).toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  const filtered = data.commitments.filter(matchesFilters);
  const sorted = filtered.slice().sort((a, b) => (b.commitment_date || "").localeCompare(a.commitment_date || ""));
  const hasActiveProjects = data.projects.some((p) => !p.archived);

  function handleDelete(c: PCCCommitment) {
    if (!window.confirm('Delete commitment "' + (c.po_contract_number || "(no PO/Contract #)") + '"? Cost Tracking entries already logged against it are not deleted, just unlinked.')) return;
    deleteCommitment(c.id);
    refresh();
  }

  return (
    <>
      {commitmentBeingEdited ? (
        <CommitmentForm
          key={editingCommitmentId}
          isNew={editingCommitmentId === "new"}
          commitment={commitmentBeingEdited}
          data={data}
          onCancel={() => setEditingCommitmentId(null)}
          onSaved={() => {
            setEditingCommitmentId(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar">
        <input type="text" placeholder="Search PO/Contract #, notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            if (e.target.value) setProjectContext(e.target.value);
          }}
        >
          <option value="">All Projects</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "(unnamed project)"}
            </option>
          ))}
        </select>
        <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
          <option value="">All Vendors</option>
          {data.vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.vendor_name || "(unnamed vendor)"}
            </option>
          ))}
        </select>
        <select value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)}>
          <option value="">All Packages</option>
          {data.packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {window.PCC.store.COMMITMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {window.PCC.store.COMMITMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="toolbar__spacer" />
        <button
          className="btn btn--primary"
          disabled={!hasActiveProjects}
          title={hasActiveProjects ? "" : "Add a project in Portfolio first"}
          onClick={() => setEditingCommitmentId("new")}
        >
          + Add Commitment
        </button>
      </div>

      <KpiStrip filtered={filtered} data={data} />

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {data.commitments.length === 0
            ? "No commitments yet. Click “+ Add Commitment” to add the first Purchase Order, Subcontract, or other commercial commitment."
            : "No commitments match this search/filter."}
        </div>
      ) : (
        <div className="project-list">
          {sorted.map((c) => (
            <CommitmentRow key={c.id} c={c} data={data} onEdit={() => setEditingCommitmentId(c.id)} onDelete={() => handleDelete(c)} />
          ))}
        </div>
      )}
    </>
  );
}

function PackageForm({
  isNew,
  pkg,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  pkg: PCCPackage;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [showError, setShowError] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = (form.querySelector("#pkgfield-name") as HTMLInputElement).value.trim();
    if (!name) {
      setShowError(true);
      return;
    }
    setShowError(false);
    const values = {
      name: name,
      code: (form.querySelector("#pkgfield-code") as HTMLInputElement).value,
      notes: (form.querySelector("#pkgfield-notes") as HTMLTextAreaElement).value,
    };
    savePackage(isNew, pkg.id, values);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Package" : "Edit Package"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Name *</label>
            <input type="text" id="pkgfield-name" defaultValue={pkg.name || ""} required />
          </div>
          <div className="field">
            <label>Code</label>
            <input type="text" id="pkgfield-code" defaultValue={pkg.code || ""} />
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea id="pkgfield-notes" rows={2} defaultValue={pkg.notes || ""} />
        </div>
        {showError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Name is required.</p> : null}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Package" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function PackagesTab({ data, refresh }: { data: PCCStoreData; refresh: () => void }) {
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);

  const pkgBeingEdited: PCCPackage | null =
    !editingPackageId ? null : editingPackageId === "new" ? newPackage({}) : data.packages.find((p) => p.id === editingPackageId) || null;

  function handleDelete(p: PCCPackage, commitmentCount: number, documentCount: number) {
    const warning =
      commitmentCount > 0 || documentCount > 0
        ? 'Delete "' + p.name + '"? ' + commitmentCount + " commitment(s) and " + documentCount + " document(s) referencing it will be unlinked, not deleted."
        : 'Delete "' + p.name + '"?';
    if (!window.confirm(warning)) return;
    deletePackage(p.id);
    refresh();
  }

  return (
    <>
      {pkgBeingEdited ? (
        <PackageForm
          key={editingPackageId}
          isNew={editingPackageId === "new"}
          pkg={pkgBeingEdited}
          onCancel={() => setEditingPackageId(null)}
          onSaved={() => {
            setEditingPackageId(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar">
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" onClick={() => setEditingPackageId("new")}>
          + Add Package
        </button>
      </div>

      {data.packages.length === 0 ? (
        <div className="panel empty-state">
          No packages yet. Click “+ Add Package” to add one — packages are shared across every project and reused by both Commitments and Documents.
        </div>
      ) : (
        <div className="project-list">
          {data.packages.map((p) => {
            const commitmentCount = data.commitments.filter((c) => c.package_id === p.id).length;
            const documentCount = data.documents.filter((d) => d.package_id === p.id && !d.trashed_at).length;
            return (
              <div
                key={p.id}
                className="detail-card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}
              >
                <div>
                  <strong>{p.name}</strong>
                  {p.code ? " (" + p.code + ")" : ""}
                  <br />
                  <span className="text-secondary" style={{ fontSize: 12 }}>
                    {commitmentCount} commitment(s) · {documentCount} document(s)
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn--ghost" onClick={() => setEditingPackageId(p.id)}>
                    Edit
                  </button>
                  <button className="btn btn--ghost" onClick={() => handleDelete(p, commitmentCount, documentCount)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function CommitmentsPage({
  initialTab,
  initialProjectFilter,
  initialEditingCommitmentId,
}: {
  initialTab?: string;
  initialProjectFilter?: string;
  initialEditingCommitmentId?: string | null;
}) {
  const [data, setData] = useState(() => getData());
  const [tab, setTab] = useState(initialTab || "commitments");
  const [editingCommitmentId, setEditingCommitmentId] = useState<string | null>(initialEditingCommitmentId || null);

  function refresh() {
    setData(getData());
  }

  return (
    <>
      <h2 style={{ marginBottom: 6 }}>Commitment Management</h2>
      <p className="text-secondary" style={{ fontSize: 12, marginBottom: 16 }}>
        Purchase Orders, Subcontracts, and other commercial commitments — Actual Value is computed live from Cost Tracking entries logged against
        each commitment, never entered here directly.
      </p>

      <div className="tab-bar">
        {[
          { key: "commitments", label: "Commitments" },
          { key: "packages", label: "Packages" },
        ].map((t) => (
          <button
            key={t.key}
            className={"tab-btn" + (tab === t.key ? " tab-btn--active" : "")}
            onClick={() => {
              setTab(t.key);
              setEditingCommitmentId(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === "commitments" ? (
          <CommitmentsTab
            data={data}
            editingCommitmentId={editingCommitmentId}
            setEditingCommitmentId={setEditingCommitmentId}
            initialProjectFilter={initialProjectFilter}
            refresh={refresh}
          />
        ) : (
          <PackagesTab data={data} refresh={refresh} />
        )}
      </div>
    </>
  );
}
