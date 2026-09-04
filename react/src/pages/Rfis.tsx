/* RFI / Technical Query Management, migrated to React as part of the page-by-page
 * migration (Post-Phase-5 Engineering Evolution). Reproduces the prior vanilla page's
 * exact text, field ids (rfifield-*), button labels, and CSS class names (panel/
 * form-grid/field/project-card/project-details/detail-grid/attention-list/
 * attention-item/status-badge/bulk-action-bar/toolbar/btn) — same visual result, only
 * the implementation moved. See src/js/pages/rfis.js (now a ~35-line stub) for the
 * router registration and the window.PCC.rfis public API
 * (filterByProject/createFromMeeting/expandRfi) other still-vanilla pages depend on,
 * preserved via the same pending-prop channel established for other migrated pages'
 * cross-page handoffs.
 *
 * The add/edit form is UNCONTROLLED (fields read via form.querySelector at submit time,
 * like every other migrated register). The per-entry revision-note draft is plain
 * component-local state on RfiEntry, same pattern as Change Orders' own revision notes.
 *
 * All store reads/writes go through rfisService.js (master prompt §9).
 */
import React, { useState } from "react";
import {
  TYPE_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  WAITING_ON_LABELS,
  FIELD_CONFIG,
  isOverdue,
  getData,
  projectName,
  activitiesForProject,
  newRfi,
  saveRfi,
  deleteRfi,
  bulkClose,
  bulkDelete,
  addRevisionNote,
  getLastRaisedBy,
  getProjectContext,
  setProjectContext,
  viewMeeting,
  viewActivityInSchedule,
  createChangeOrderFromRfi,
} from "../services/rfisService";
import type { FieldConfig, ActivityOption } from "../services/rfisService";
import type { PCCRfi, PCCProject, PCCStoreData, PCCMeeting } from "../types/pcc";

function RfiForm({
  isNew,
  rfi,
  projects,
  data,
  sourceMeeting,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  rfi: PCCRfi;
  projects: PCCProject[];
  data: PCCStoreData;
  sourceMeeting: PCCMeeting | null | undefined;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const activeProjects = projects.filter((p) => !p.archived);
  const [selectedProjectId, setSelectedProjectId] = useState(rfi.project_id || (activeProjects[0] ? activeProjects[0].id : ""));
  const [showError, setShowError] = useState(false);

  const activityOptions: ActivityOption[] = activitiesForProject(data, selectedProjectId);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const values: any = {};
    FIELD_CONFIG.forEach((cfg) => {
      const el = form.querySelector("#rfifield-" + cfg.key) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (el) values[cfg.key] = el.value;
    });
    values.cost_impact = (form.querySelector("#rfifield-cost_impact") as HTMLInputElement).checked;
    values.schedule_impact = (form.querySelector("#rfifield-schedule_impact") as HTMLInputElement).checked;
    values.project_id = selectedProjectId;
    values.activity_id = (form.querySelector("#rfifield-activity_id") as HTMLSelectElement).value;

    if (!isNew) {
      const responseEl = form.querySelector("#rfifield-response") as HTMLTextAreaElement | null;
      const statusEl = form.querySelector("#rfifield-status") as HTMLSelectElement | null;
      if (responseEl) values.response = responseEl.value;
      if (statusEl) values.status = statusEl.value;
    }

    if (!values.subject || !values.subject.trim() || !values.question || !values.question.trim() || !values.project_id) {
      setShowError(true);
      return;
    }
    setShowError(false);
    saveRfi(isNew, rfi.id, values, isNew ? rfi.source_meeting_id : null);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add RFI / Technical Query" : "Edit " + (rfi.number || "Entry")}</h3>
      {sourceMeeting ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: -8, marginBottom: "var(--space-4)" }}>
          Linked to meeting: &#8220;{sourceMeeting.title}&#8221; ({sourceMeeting.meeting_date})
        </p>
      ) : null}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Project *</label>
          {activeProjects.length === 0 ? (
            <select id="rfifield-project_id" disabled defaultValue="">
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select id="rfifield-project_id" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
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
          <select id="rfifield-activity_id" key={selectedProjectId} defaultValue={rfi.activity_id || ""}>
            <option value="">(none)</option>
            {activityOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          {FIELD_CONFIG.map((cfg) => (
            <div className="field" key={cfg.key} style={cfg.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
              <label htmlFor={"rfifield-" + cfg.key}>
                {cfg.label}
                {cfg.required ? " *" : ""}
              </label>
              {cfg.type === "select" ? (
                <select id={"rfifield-" + cfg.key} name={cfg.key} defaultValue={(rfi as any)[cfg.key] || ""}>
                  {cfg.optional ? <option value="">Not set</option> : null}
                  {window.PCC.store[cfg.options!].map((val) => (
                    <option key={val} value={val}>
                      {(cfg.labels && cfg.labels[val]) || val}
                    </option>
                  ))}
                </select>
              ) : cfg.type === "textarea" ? (
                <textarea id={"rfifield-" + cfg.key} name={cfg.key} rows={3} defaultValue={(rfi as any)[cfg.key] || ""} required={cfg.required} />
              ) : (
                <input id={"rfifield-" + cfg.key} name={cfg.key} type={cfg.type} defaultValue={(rfi as any)[cfg.key] || ""} required={cfg.required} />
              )}
            </div>
          ))}

          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontWeight: "normal" }}>
              <input type="checkbox" id="rfifield-cost_impact" name="cost_impact" defaultChecked={!!rfi.cost_impact} />
              <span>Cost Impact</span>
            </label>
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontWeight: "normal" }}>
              <input type="checkbox" id="rfifield-schedule_impact" name="schedule_impact" defaultChecked={!!rfi.schedule_impact} />
              <span>Schedule Impact</span>
            </label>
          </div>

          {!isNew ? (
            <>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="rfifield-response">Response</label>
                <textarea id="rfifield-response" name="response" rows={3} defaultValue={rfi.response || ""} />
              </div>
              <div className="field">
                <label htmlFor="rfifield-status">Status</label>
                <select id="rfifield-status" name="status" defaultValue={rfi.status}>
                  {window.PCC.store.RFI_STATUSES.map((val) => (
                    <option key={val} value={val}>
                      {STATUS_LABELS[val]}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
        </div>

        {showError ? (
          <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>Subject, Question, and Project are required.</p>
        ) : null}

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary" disabled={activeProjects.length === 0}>
            {isNew ? "Add Entry" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function RfiDetails({ r, data, onChanged }: { r: PCCRfi; data: PCCStoreData; onChanged: () => void }) {
  const [draftAuthor, setDraftAuthor] = useState("");
  const [draftNote, setDraftNote] = useState("");

  const fields = [
    { label: "RAISED BY", value: r.raised_by || "—" },
    { label: "ASSIGNED TO", value: r.assigned_to || "—" },
    { label: "DATE RAISED", value: r.date_raised || "—" },
    { label: "RESPONSE REQUIRED BY", value: r.date_required || "—" },
    { label: "COST IMPACT", value: r.cost_impact ? "Yes" : "No" },
    { label: "SCHEDULE IMPACT", value: r.schedule_impact ? "Yes" : "No" },
    { label: "QUESTION / QUERY", value: r.question || "—", wide: true },
    { label: "RESPONSE", value: r.response || "— (awaiting response)", wide: true },
  ];

  const sourceMeeting = r.source_meeting_id ? data.meetings.find((m) => m.id === r.source_meeting_id) : null;
  const linkedActivity = r.activity_id ? data.activities.find((a) => a.id === r.activity_id) : null;
  const linkedChangeOrders = data.change_orders.filter((co) => co.source_rfi_id === r.id);

  function handleAddNote() {
    if (!draftNote.trim()) return;
    addRevisionNote(r.id, draftAuthor, draftNote);
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

      {sourceMeeting ? (
        <div className="attention-list" style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--divider)" }}>
          <div className="attention-item attention-item--clickable" onClick={() => viewMeeting(sourceMeeting.id)}>
            <span className="attention-item__icon attention-item__icon--info" />
            <div className="attention-item__body">
              <div className="attention-item__text">
                {sourceMeeting.title} ({sourceMeeting.meeting_date})
              </div>
              <div className="attention-item__meta">RAISED IN MEETING</div>
            </div>
          </div>
        </div>
      ) : null}

      {linkedActivity ? (
        <div className="attention-list" style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--divider)" }}>
          <div
            className="attention-item attention-item--clickable"
            onClick={() => viewActivityInSchedule(r.project_id, linkedActivity.schedule_id, linkedActivity.id)}
          >
            <span className="attention-item__icon attention-item__icon--info" />
            <div className="attention-item__body">
              <div className="attention-item__text">{linkedActivity.name}</div>
              <div className="attention-item__meta">LINKED ACTIVITY</div>
            </div>
          </div>
        </div>
      ) : null}

      {linkedChangeOrders.length > 0 ? (
        <>
          <p className="detail-item__label" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
            CHANGE ORDERS RAISED ({linkedChangeOrders.length})
          </p>
          {linkedChangeOrders.map((co) => (
            <p key={co.id} style={{ fontSize: "var(--text-sm)", margin: "0 0 2px" }}>
              <span className="mono">{co.number}</span> — {co.title || "(untitled)"}
            </p>
          ))}
        </>
      ) : null}

      <button className="btn btn--ghost" style={{ marginTop: "var(--space-2)" }} onClick={() => createChangeOrderFromRfi(r.project_id, r.id)}>
        + Raise Change Order from this Entry
      </button>

      <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--divider)" }}>
        <p className="detail-item__label" style={{ marginBottom: "var(--space-2)" }}>
          REVISION HISTORY ({r.revisions.length})
        </p>
        {r.revisions.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "0 0 var(--space-2)" }}>
            No revision notes logged yet.
          </p>
        ) : (
          r.revisions
            .slice()
            .reverse()
            .map((rev, i) => (
              <div key={i} style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
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

        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
          <input type="text" placeholder="Author" style={{ maxWidth: 140 }} value={draftAuthor} onChange={(e) => setDraftAuthor(e.target.value)} />
          <input
            type="text"
            placeholder="Add a revision note…"
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

function RfiEntry({
  r,
  data,
  projects,
  expanded,
  selected,
  onToggleSelect,
  onToggleDetails,
  onEdit,
  onClone,
  onDelete,
  onChanged,
}: {
  r: PCCRfi;
  data: PCCStoreData;
  projects: PCCProject[];
  expanded: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleDetails: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
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
            <span className="mono">{r.number}</span> — {r.subject || "(untitled)"}
          </div>
          <div className="project-card__meta">
            {TYPE_LABELS[r.type || ""]} · {projectName(projects, r.project_id)}
            {r.assigned_to ? " · " + r.assigned_to : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <span className={"status-badge status-badge--" + (r.status === "closed" ? "complete" : r.status === "answered" ? "on_track" : "info")}>
            {STATUS_LABELS[r.status]}
          </span>
          <span className={"status-badge status-badge--" + (r.priority === "high" ? "critical" : r.priority === "medium" ? "at_risk" : "on_track")}>
            {PRIORITY_LABELS[r.priority || ""]} Priority
          </span>
          {isOverdue(r) ? <span className="status-badge status-badge--critical">Overdue</span> : null}
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
      {expanded ? <RfiDetails r={r} data={data} onChanged={onChanged} /> : null}
    </div>
  );
}

function OverduePanel({ rfis, projects }: { rfis: PCCRfi[]; projects: PCCProject[] }) {
  const overdueItems = rfis.filter(isOverdue);
  if (overdueItems.length === 0) return null;

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)", borderColor: "var(--status-critical)" }}>
      <h3 style={{ marginBottom: "var(--space-2)", color: "var(--status-critical)" }}>
        Overdue RFIs / Technical Queries ({overdueItems.length})
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {overdueItems.slice(0, 8).map((r) => (
          <div key={r.id} style={{ fontSize: "var(--text-sm)", display: "flex", justifyContent: "space-between" }}>
            <span>
              <span className="mono">{r.number}</span> — {r.subject || "(untitled)"}{" "}
              <span className="text-secondary">({projectName(projects, r.project_id)})</span>
            </span>
            <span className="mono" style={{ color: "var(--status-critical)" }}>
              {r.date_required}
            </span>
          </div>
        ))}
      </div>
      {overdueItems.length > 8 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
          +{overdueItems.length - 8} more overdue.
        </p>
      ) : null}
    </div>
  );
}

export default function RfisPage({
  initialProjectFilter,
  initialPrefill,
  initialExpandedId,
}: {
  initialProjectFilter?: string;
  initialPrefill?: Partial<PCCRfi> | null;
  initialExpandedId?: string | null;
}) {
  const [data, setData] = useState(() => getData());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState(() => {
    if (initialProjectFilter) return initialProjectFilter;
    const ctxProjectId = getProjectContext();
    return ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });
  const [editingId, setEditingId] = useState<string | null>(() => (initialPrefill ? "new" : null));
  const [pendingPrefill, setPendingPrefill] = useState<Partial<PCCRfi> | null>(initialPrefill || null);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId || null);
  const [selectedIds, setSelectedIds] = useState<{ [id: string]: boolean }>({});

  function refresh() {
    setData(getData());
  }

  const projects = data.projects;

  function matchesFilters(r: PCCRfi): boolean {
    if (typeFilter && r.type !== typeFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (projectFilter && r.project_id !== projectFilter) return false;
    if (search) {
      const haystack = ((r.number || "") + " " + (r.subject || "") + " " + (r.question || "") + " " + (r.raised_by || "") + " " + (r.assigned_to || "")).toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  const rfiBeingEdited: PCCRfi | null =
    !editingId ? null : editingId === "new" ? newRfi(pendingPrefill || {}) : data.rfis.find((r) => r.id === editingId) || null;
  const sourceMeeting =
    rfiBeingEdited && rfiBeingEdited.source_meeting_id ? data.meetings.find((m) => m.id === rfiBeingEdited!.source_meeting_id) : null;

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = Object.assign({}, prev);
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function handleDelete(r: PCCRfi) {
    if (!window.confirm("Delete this " + TYPE_LABELS[r.type || ""] + "? This can't be undone.")) return;
    deleteRfi(r.id);
    refresh();
  }

  function handleClone(r: PCCRfi) {
    setPendingPrefill({
      project_id: r.project_id,
      type: r.type,
      subject: r.subject,
      question: r.question,
      priority: r.priority,
      raised_by: r.raised_by,
      assigned_to: r.assigned_to,
      waiting_on_party: r.waiting_on_party,
      activity_id: r.activity_id,
      cost_impact: r.cost_impact,
      schedule_impact: r.schedule_impact,
    });
    setEditingId("new");
  }

  function handleAdd() {
    const lastRaisedBy = getLastRaisedBy();
    setPendingPrefill(lastRaisedBy ? { raised_by: lastRaisedBy } : null);
    setEditingId("new");
  }

  const selectedCount = Object.keys(selectedIds).length;
  const noun = selectedCount === 1 ? "entry" : "entries";

  function handleCloseSelected() {
    bulkClose(selectedIds);
    window.PCC.notify(selectedCount + " " + noun + " closed.", "success");
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
  const filtered = data.rfis.filter(matchesFilters);

  return (
    <>
      <h2 style={{ marginBottom: "var(--space-4)" }}>RFI / Technical Query Management</h2>

      <OverduePanel rfis={data.rfis} projects={projects} />

      {rfiBeingEdited ? (
        <RfiForm
          key={editingId}
          isNew={editingId === "new"}
          rfi={rfiBeingEdited}
          projects={projects}
          data={data}
          sourceMeeting={sourceMeeting}
          onCancel={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar">
        <input type="text" placeholder="Search number, subject, question…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {window.PCC.store.RFI_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {window.PCC.store.RFI_STATUSES.map((s) => (
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
          + Add RFI / TQ
        </button>
      </div>

      <div>
        {selectedCount > 0 ? (
          <div className="bulk-action-bar">
            <span className="bulk-action-bar__count">{selectedCount} selected</span>
            <button className="btn btn--ghost" onClick={handleCloseSelected}>
              Close Selected
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
            {data.rfis.length === 0
              ? projects.filter((p) => !p.archived).length === 0
                ? "Add a project in Portfolio first, then log RFIs and Technical Queries against it."
                : "No entries yet. Click “+ Add RFI / TQ” to log your first one."
              : "No entries match this search/filter."}
          </div>
        ) : (
          <div className="project-list">
            {filtered.map((r) => (
              <RfiEntry
                key={r.id}
                r={r}
                data={data}
                projects={projects}
                expanded={expandedId === r.id}
                selected={!!selectedIds[r.id]}
                onToggleSelect={() => handleToggleSelect(r.id)}
                onToggleDetails={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onEdit={() => setEditingId(r.id)}
                onClone={() => handleClone(r)}
                onDelete={() => handleDelete(r)}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
