/* Change Management, migrated to React as part of the page-by-page migration
 * (Post-Phase-5 Engineering Evolution). Reproduces the prior vanilla page's exact text,
 * field ids (cofield-*), button labels, and CSS class names (panel/form-grid/field/
 * project-card/project-details/detail-grid/attention-list/attention-item/status-badge/
 * bulk-action-bar/toolbar/btn) — same visual result, only the implementation moved. See
 * src/js/pages/changeOrders.js (now a ~45-line stub) for the router registration and the
 * window.PCC.changeOrders public API (filterByProject/createFromMeeting/createFromRfi/
 * createFromRisk/expandChangeOrder) other still-vanilla pages depend on, preserved via
 * the same pending-prop channel established for other migrated pages' cross-page
 * handoffs.
 *
 * The add/edit form is UNCONTROLLED (fields read via form.querySelector at submit time,
 * like every other migrated register). The per-entry revision-note draft (author/note)
 * is plain component-local state on CoEntry — safe since React keeps that component
 * instance alive across a data refresh as long as its `key={co.id}` doesn't change,
 * matching the vanilla page's own per-id uiState.revisionDrafts persistence.
 *
 * All store reads/writes go through changeOrdersService.js (master prompt §9).
 */
import React, { useState } from "react";
import {
  STATUS_LABELS,
  WAITING_ON_LABELS,
  getData,
  projectName,
  formatMoney,
  formatDays,
  statusBadgeClass,
  sourceOptionsFor,
  activitiesForProject,
  newChangeOrder,
  saveChangeOrder,
  deleteChangeOrder,
  bulkSetStatus,
  bulkDelete,
  addRevisionNote,
  getLastRequestedBy,
  getProjectContext,
  setProjectContext,
  viewMeeting,
  viewRfi,
  viewRisk,
  viewActivityInSchedule,
} from "../services/changeOrdersService.js";

function ChangeOrderForm({ isNew, co, projects, data, onCancel, onSaved }) {
  const activeProjects = projects.filter((p) => !p.archived);
  const [selectedProjectId, setSelectedProjectId] = useState(co.project_id || (activeProjects[0] ? activeProjects[0].id : ""));
  const [showError, setShowError] = useState(false);

  const activityOptions = activitiesForProject(data, selectedProjectId);
  const sources = sourceOptionsFor(data, selectedProjectId);

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const values = {
      title: form.querySelector("#cofield-title").value,
      description: form.querySelector("#cofield-description").value,
      justification: form.querySelector("#cofield-justification").value,
      requested_by: form.querySelector("#cofield-requested_by").value,
      date_requested: form.querySelector("#cofield-date_requested").value,
      waiting_on_party: form.querySelector("#cofield-waiting_on_party").value,
      cost_impact_amount: form.querySelector("#cofield-cost_impact_amount").value,
      schedule_impact_days: form.querySelector("#cofield-schedule_impact_days").value,
      project_id: selectedProjectId,
      activity_id: form.querySelector("#cofield-activity_id").value,
      source_rfi_id: form.querySelector("#cofield-source_rfi_id").value,
      source_risk_id: form.querySelector("#cofield-source_risk_id").value,
    };
    values.cost_impact_amount = values.cost_impact_amount === "" ? null : Number(values.cost_impact_amount);
    values.schedule_impact_days = values.schedule_impact_days === "" ? null : Number(values.schedule_impact_days);

    if (!isNew) {
      const statusEl = form.querySelector("#cofield-status");
      const decisionByEl = form.querySelector("#cofield-decision_by");
      const dateDecidedEl = form.querySelector("#cofield-date_decided");
      if (statusEl) values.status = statusEl.value;
      if (decisionByEl) values.decision_by = decisionByEl.value;
      if (dateDecidedEl) values.date_decided = dateDecidedEl.value;
    }

    if (!values.title || !values.title.trim() || !values.description || !values.description.trim() || !values.project_id) {
      setShowError(true);
      return;
    }
    setShowError(false);
    saveChangeOrder(isNew, co.id, values, isNew ? co.source_meeting_id : null);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Change Order" : "Edit " + (co.number || "Entry")}</h3>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Project *</label>
          {activeProjects.length === 0 ? (
            <select id="cofield-project_id" disabled defaultValue="">
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select id="cofield-project_id" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "(unnamed project)"}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="field">
          <label>Linked Activity (optional)</label>
          <select id="cofield-activity_id" key={"act-" + selectedProjectId} defaultValue={co.activity_id || ""}>
            <option value="">(none)</option>
            {activityOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="cofield-title">Title *</label>
            <input type="text" id="cofield-title" defaultValue={co.title || ""} required />
          </div>
          <div className="field">
            <label htmlFor="cofield-requested_by">Requested By</label>
            <input type="text" id="cofield-requested_by" defaultValue={co.requested_by || ""} />
          </div>
          <div className="field">
            <label htmlFor="cofield-date_requested">Date Requested</label>
            <input type="date" id="cofield-date_requested" defaultValue={co.date_requested || ""} />
          </div>
          <div className="field">
            <label htmlFor="cofield-waiting_on_party">Waiting On</label>
            <select id="cofield-waiting_on_party" defaultValue={co.waiting_on_party || ""}>
              <option value="">Not set</option>
              {window.PCC.store.WAITING_ON_PARTIES.map((val) => (
                <option key={val} value={val}>
                  {WAITING_ON_LABELS[val] || val}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cofield-cost_impact_amount">Cost Impact (reference only — not applied to contract value)</label>
            <input type="number" step="any" id="cofield-cost_impact_amount" placeholder="e.g. 25000 or -5000" defaultValue={co.cost_impact_amount == null ? "" : co.cost_impact_amount} />
          </div>
          <div className="field">
            <label htmlFor="cofield-schedule_impact_days">Schedule Impact (days)</label>
            <input type="number" step="any" id="cofield-schedule_impact_days" placeholder="e.g. 10 or -3" defaultValue={co.schedule_impact_days == null ? "" : co.schedule_impact_days} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="cofield-description">Description — what is changing *</label>
            <textarea id="cofield-description" rows={3} defaultValue={co.description || ""} required />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="cofield-justification">Justification / Reason</label>
            <textarea id="cofield-justification" rows={3} defaultValue={co.justification || ""} />
          </div>

          <div className="field">
            <label>Source RFI / TQ (optional)</label>
            <select id="cofield-source_rfi_id" key={"rfi-" + selectedProjectId} defaultValue={co.source_rfi_id || ""}>
              <option value="">None</option>
              {sources.rfis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number + " — " + (r.subject || "(untitled)")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Source Risk / Issue (optional)</label>
            <select id="cofield-source_risk_id" key={"risk-" + selectedProjectId} defaultValue={co.source_risk_id || ""}>
              <option value="">None</option>
              {sources.risks.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title || "(untitled)"}
                </option>
              ))}
            </select>
          </div>

          {!isNew ? (
            <>
              <div className="field">
                <label htmlFor="cofield-status">Status</label>
                <select id="cofield-status" defaultValue={co.status}>
                  {window.PCC.store.CHANGE_ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="cofield-decision_by">Decision By</label>
                <input type="text" id="cofield-decision_by" defaultValue={co.decision_by || ""} />
              </div>
              <div className="field">
                <label htmlFor="cofield-date_decided">Date Decided</label>
                <input type="date" id="cofield-date_decided" defaultValue={co.date_decided || ""} />
              </div>
            </>
          ) : null}
        </div>

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Title, Description, and Project are required.</p> : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={activeProjects.length === 0}>
            {isNew ? "Add Change Order" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ChangeOrderDetails({ co, data, onChanged }) {
  const [draftAuthor, setDraftAuthor] = useState("");
  const [draftNote, setDraftNote] = useState("");

  const costStr = formatMoney(co.cost_impact_amount);
  const daysStr = formatDays(co.schedule_impact_days);

  const fields = [
    { label: "REQUESTED BY", value: co.requested_by || "—" },
    { label: "DATE REQUESTED", value: co.date_requested || "—" },
    { label: "DECISION BY", value: co.decision_by || "—" },
    { label: "DATE DECIDED", value: co.date_decided || "—" },
    { label: "COST IMPACT", value: costStr === null ? "— (not specified)" : costStr + " (reference only)" },
    { label: "SCHEDULE IMPACT", value: daysStr === null ? "— (not specified)" : daysStr },
    { label: "DESCRIPTION", value: co.description || "—", wide: true },
    { label: "JUSTIFICATION", value: co.justification || "—", wide: true },
  ];

  const links = [];
  if (co.source_meeting_id) {
    const m = data.meetings.find((x) => x.id === co.source_meeting_id);
    if (m) links.push({ label: "RAISED IN MEETING", text: m.title + " (" + m.meeting_date + ")", go: () => viewMeeting(m.id) });
  }
  if (co.source_rfi_id) {
    const r = data.rfis.find((x) => x.id === co.source_rfi_id);
    if (r) links.push({ label: "SOURCE RFI / TQ", text: r.number + " — " + (r.subject || "(untitled)"), go: () => viewRfi(r.id) });
  }
  if (co.source_risk_id) {
    const risk = data.risks.find((x) => x.id === co.source_risk_id);
    if (risk) links.push({ label: "SOURCE RISK / ISSUE", text: risk.title || "(untitled)", go: () => viewRisk(risk.id) });
  }
  if (co.activity_id) {
    const linkedActivity = data.activities.find((x) => x.id === co.activity_id);
    if (linkedActivity) {
      links.push({
        label: "LINKED ACTIVITY",
        text: linkedActivity.name,
        go: () => viewActivityInSchedule(co.project_id, linkedActivity.schedule_id, linkedActivity.id),
      });
    }
  }

  function handleAddNote() {
    if (!draftNote.trim()) return;
    addRevisionNote(co.id, draftAuthor, draftNote);
    setDraftAuthor("");
    setDraftNote("");
    onChanged();
  }

  return (
    <div className="project-details">
      <div className="detail-grid">
        {fields.map((f) => (
          <div key={f.label} style={f.wide ? { gridColumn: "1 / -1" } : undefined}>
            <span className="detail-item__label">{f.label}</span>
            <span className="detail-item__value">{f.value}</span>
          </div>
        ))}
      </div>

      {links.length > 0 ? (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
          <div className="attention-list">
            {links.map((link) => (
              <div className="attention-item attention-item--clickable" key={link.label} onClick={link.go}>
                <span className="attention-item__icon attention-item__icon--info" />
                <div className="attention-item__body">
                  <div className="attention-item__text">{link.text}</div>
                  <div className="attention-item__meta">{link.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
        <p className="detail-item__label" style={{ marginBottom: 6 }}>
          APPROVAL / DECISION HISTORY ({co.revisions.length})
        </p>
        {co.revisions.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: 13, margin: "0 0 8px" }}>
            No notes logged yet.
          </p>
        ) : (
          co.revisions
            .slice()
            .reverse()
            .map((rev, i) => (
              <div key={i} style={{ fontSize: 13, marginBottom: 6 }}>
                <span className="mono" style={{ color: "var(--text-secondary)" }}>
                  {rev.date}
                </span>
                {rev.author ? (
                  <>
                    {" — "}
                    <strong>{rev.author}</strong>
                  </>
                ) : null}
                {": " + rev.note}
              </div>
            ))
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Author"
            style={{ maxWidth: 140 }}
            value={draftAuthor}
            onChange={(e) => setDraftAuthor(e.target.value)}
          />
          <input
            type="text"
            placeholder="Add an approval/decision note…"
            style={{ flex: 1, minWidth: 180 }}
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
          />
          <button className="btn btn--ghost" type="button" onClick={handleAddNote}>
            Add Note
          </button>
        </div>
      </div>
    </div>
  );
}

function CoEntry({ co, data, projects, expanded, selected, onToggleSelect, onToggleDetails, onEdit, onClone, onDelete, onChanged }) {
  const costStr = formatMoney(co.cost_impact_amount);
  const daysStr = formatDays(co.schedule_impact_days);

  return (
    <div className="project-entry">
      <div className="project-card">
        <input
          type="checkbox"
          className="project-card__select"
          aria-label="Select this entry for a bulk action"
          checked={selected}
          onChange={onToggleSelect}
        />
        <div className="project-card__main">
          <div className="project-card__name">
            <span className="mono">{co.number}</span> — {co.title || "(untitled)"}
          </div>
          <div className="project-card__meta">
            {projectName(projects, co.project_id)}
            {co.requested_by ? " · " + co.requested_by : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className={"status-badge " + statusBadgeClass(co.status)}>{STATUS_LABELS[co.status]}</span>
          {costStr !== null ? (
            <span className={"status-badge " + (co.cost_impact_amount > 0 ? "status-badge--at_risk" : "status-badge--on_track")}>{costStr}</span>
          ) : null}
          {daysStr !== null ? (
            <span className={"status-badge " + (co.schedule_impact_days > 0 ? "status-badge--at_risk" : "status-badge--on_track")}>{daysStr}</span>
          ) : null}
        </div>
        <div className="project-card__actions">
          <button className="btn btn--ghost" onClick={onToggleDetails}>
            {expanded ? "Hide" : "Details"}
          </button>
          <button className="btn btn--ghost" onClick={onEdit}>
            Edit
          </button>
          <button className="btn btn--ghost" onClick={onClone}>
            Clone
          </button>
          <button className="btn btn--ghost" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      {expanded ? <ChangeOrderDetails co={co} data={data} onChanged={onChanged} /> : null}
    </div>
  );
}

export default function ChangeOrdersPage({ initialProjectFilter, initialPrefill, initialExpandedId }) {
  const [data, setData] = useState(() => getData());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState(() => {
    if (initialProjectFilter) return initialProjectFilter;
    const ctxProjectId = getProjectContext();
    return ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });
  const [editingId, setEditingId] = useState(() => (initialPrefill ? "new" : null));
  const [pendingPrefill, setPendingPrefill] = useState(initialPrefill || null);
  const [expandedId, setExpandedId] = useState(initialExpandedId || null);
  const [selectedIds, setSelectedIds] = useState({});

  function refresh() {
    setData(getData());
  }

  const projects = data.projects;

  function matchesFilters(co) {
    if (statusFilter && co.status !== statusFilter) return false;
    if (projectFilter && co.project_id !== projectFilter) return false;
    if (search) {
      const haystack = (co.number + " " + co.title + " " + co.description + " " + co.requested_by).toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  const coBeingEdited = !editingId ? null : editingId === "new" ? newChangeOrder(pendingPrefill || {}) : data.change_orders.find((co) => co.id === editingId);

  function handleToggleSelect(id) {
    setSelectedIds((prev) => {
      const next = Object.assign({}, prev);
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function handleDelete(co) {
    if (!window.confirm("Delete this Change Order? This can't be undone.")) return;
    deleteChangeOrder(co.id);
    refresh();
  }

  function handleClone(co) {
    setPendingPrefill({
      project_id: co.project_id,
      title: co.title,
      description: co.description,
      justification: co.justification,
      requested_by: co.requested_by,
      waiting_on_party: co.waiting_on_party,
      activity_id: co.activity_id,
      cost_impact_amount: co.cost_impact_amount,
      schedule_impact_days: co.schedule_impact_days,
    });
    setEditingId("new");
  }

  function handleAdd() {
    const lastRequestedBy = getLastRequestedBy();
    setPendingPrefill(lastRequestedBy ? { requested_by: lastRequestedBy } : null);
    setEditingId("new");
  }

  const selectedCount = Object.keys(selectedIds).length;
  const noun = selectedCount === 1 ? "entry" : "entries";

  function handleBulkStatus(newStatus, verb) {
    bulkSetStatus(selectedIds, newStatus);
    window.PCC.notify(selectedCount + (selectedCount === 1 ? " Change Order " : " Change Orders ") + verb + ".", "success");
    setSelectedIds({});
    refresh();
  }

  function handleDeleteSelected() {
    if (!window.confirm("Delete " + selectedCount + " selected " + noun + "? This can't be undone.")) return;
    bulkDelete(selectedIds);
    window.PCC.notify(selectedCount + " " + noun + " deleted.", "info");
    setSelectedIds({});
    refresh();
  }

  const hasActiveProjects = projects.some((p) => !p.archived);
  const filtered = data.change_orders.filter(matchesFilters);

  return (
    <>
      <h2 style={{ marginBottom: 16 }}>Change Management</h2>
      <p className="text-secondary" style={{ fontSize: 12, marginTop: -10, marginBottom: 14 }}>
        Cost and schedule impact are tracked for reference only — they don't change a project's contract value in Portfolio automatically.
      </p>

      {coBeingEdited ? (
        <ChangeOrderForm
          key={editingId}
          isNew={editingId === "new"}
          co={coBeingEdited}
          projects={projects}
          data={data}
          onCancel={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar">
        <input type="text" placeholder="Search number, title, description…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {window.PCC.store.CHANGE_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            if (e.target.value) setProjectContext(e.target.value);
          }}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "(unnamed project)"}
            </option>
          ))}
        </select>
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" disabled={!hasActiveProjects} title={hasActiveProjects ? "" : "Add a project in Portfolio first"} onClick={handleAdd}>
          + Add Change Order
        </button>
      </div>

      <div>
        {selectedCount > 0 ? (
          <div className="bulk-action-bar">
            <span className="bulk-action-bar__count">{selectedCount} selected</span>
            <button className="btn btn--ghost" onClick={() => handleBulkStatus("approved", "approved")}>
              Approve Selected
            </button>
            <button className="btn btn--ghost" onClick={() => handleBulkStatus("rejected", "rejected")}>
              Reject Selected
            </button>
            <div className="bulk-action-bar__spacer" />
            <button className="btn btn--ghost" onClick={() => setSelectedIds({})}>
              Clear Selection
            </button>
            <button className="btn btn--ghost" onClick={handleDeleteSelected}>
              Delete Selected
            </button>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="panel empty-state">
            {data.change_orders.length === 0
              ? projects.filter((p) => !p.archived).length === 0
                ? "Add a project in Portfolio first, then log Change Orders against it."
                : "No Change Orders yet. Click “+ Add Change Order” to log your first one."
              : "No entries match this search/filter."}
          </div>
        ) : (
          <div className="project-list">
            {filtered.map((co) => (
              <CoEntry
                key={co.id}
                co={co}
                data={data}
                projects={projects}
                expanded={expandedId === co.id}
                selected={!!selectedIds[co.id]}
                onToggleSelect={() => handleToggleSelect(co.id)}
                onToggleDetails={() => setExpandedId(expandedId === co.id ? null : co.id)}
                onEdit={() => setEditingId(co.id)}
                onClone={() => handleClone(co)}
                onDelete={() => handleDelete(co)}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
