/* Decision Register, migrated to React as part of the page-by-page migration
 * (Post-Phase-5 Engineering Evolution). Reproduces the prior vanilla page's exact text,
 * field ids (decfield-*), button labels, and CSS class names (panel/form-grid/field/
 * project-card/project-details/detail-grid/attention-list/attention-item/status-badge/
 * bulk-action-bar/toolbar/btn) — same visual result, only the implementation moved. See
 * src/js/pages/decisionRegister.js (now a ~30-line stub) for the router registration and
 * the window.PCC.decisionRegister public API (filterByProject/createFromMeeting/
 * expandDecision) other still-vanilla pages depend on, preserved via the same
 * pending-prop channel Lessons Learned's stub already established.
 *
 * The add/edit form is UNCONTROLLED (fields read via form.querySelector at submit time,
 * like Lessons Learned/Knowledge Base) — matches tests/test_decision_register_e2e.js's
 * raw `.value =` + bare `submit` event dispatch with no per-field change events.
 *
 * All store reads/writes go through decisionRegisterService.js (master prompt §9).
 */
import React, { useState } from "react";
import {
  STATUS_LABELS,
  FIELD_CONFIG,
  getData,
  projectName,
  activitiesForProject,
  newDecision,
  saveDecision,
  deleteDecision,
  deferDecisions,
  deleteDecisions,
  getLastUsedDecidedBy,
  getProjectContext,
  setProjectContext,
  viewMeeting,
  viewActivityInSchedule,
} from "../services/decisionRegisterService";
import type { FieldConfig, ActivityOption } from "../services/decisionRegisterService";
import type { PCCDecision, PCCProject, PCCStoreData, PCCMeeting } from "../types/pcc";

function DecisionForm({
  isNew,
  decision,
  projects,
  data,
  sourceMeeting,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  decision: PCCDecision;
  projects: PCCProject[];
  data: PCCStoreData;
  sourceMeeting: PCCMeeting | null | undefined;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const activeProjects = projects.filter((p) => !p.archived);
  const [selectedProjectId, setSelectedProjectId] = useState(decision.project_id || (activeProjects[0] ? activeProjects[0].id : ""));
  const [showError, setShowError] = useState(false);

  const activityOptions: ActivityOption[] = activitiesForProject(data, selectedProjectId);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const values: { [key: string]: string } = {};
    FIELD_CONFIG.forEach((cfg) => {
      const el = form.querySelector("#decfield-" + cfg.key) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (el) values[cfg.key] = el.value;
    });
    values.project_id = selectedProjectId;
    const activityEl = form.querySelector("#decfield-activity_id") as HTMLSelectElement | null;
    values.activity_id = activityEl ? activityEl.value : "";

    if (!values.title || !values.title.trim() || !values.project_id) {
      setShowError(true);
      return;
    }
    setShowError(false);
    saveDecision(isNew, decision.id, values, isNew ? decision.source_meeting_id : null);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Decision" : "Edit Decision"}</h3>
      {sourceMeeting ? (
        <p className="text-secondary" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
          Linked to meeting: &#8220;{sourceMeeting.title}&#8221; ({sourceMeeting.meeting_date})
        </p>
      ) : null}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="decfield-project_id">Project *</label>
          {activeProjects.length === 0 ? (
            <select id="decfield-project_id" disabled defaultValue="">
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select id="decfield-project_id" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "(unnamed project)"}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="field">
          <label htmlFor="decfield-activity_id">Linked Activity (optional)</label>
          <select id="decfield-activity_id" key={selectedProjectId} defaultValue={decision.activity_id || ""}>
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
              <label htmlFor={"decfield-" + cfg.key}>
                {cfg.label}
                {cfg.required ? " *" : ""}
              </label>
              {cfg.type === "select" ? (
                <select id={"decfield-" + cfg.key} name={cfg.key} defaultValue={(decision as any)[cfg.key] || ""}>
                  {cfg.optional ? <option value="">Not set</option> : null}
                  {window.PCC.store[cfg.options!].map((val) => (
                    <option key={val} value={val}>
                      {(cfg.labels && cfg.labels[val]) || val}
                    </option>
                  ))}
                </select>
              ) : cfg.type === "textarea" ? (
                <textarea id={"decfield-" + cfg.key} name={cfg.key} rows={3} defaultValue={(decision as any)[cfg.key] || ""} />
              ) : (
                <input id={"decfield-" + cfg.key} name={cfg.key} type={cfg.type} defaultValue={(decision as any)[cfg.key] || ""} required={cfg.required} />
              )}
            </div>
          ))}
        </div>

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Title and Project are required.</p> : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={activeProjects.length === 0}>
            {isNew ? "Add Decision" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function DecisionDetails({ d, data }: { d: PCCDecision; data: PCCStoreData }) {
  const fields = [
    { label: "STATUS", value: STATUS_LABELS[d.status] },
    { label: "DECISION DATE", value: d.decision_date || "—" },
    { label: "DECIDED BY", value: d.decided_by || "—" },
    { label: "CONTEXT / BACKGROUND", value: d.description || "—", wide: true },
    { label: "DECISION", value: d.decision || "—", wide: true },
  ];

  const sourceMeeting = d.source_meeting_id ? data.meetings.find((m) => m.id === d.source_meeting_id) : null;
  const linkedActivity = d.activity_id ? data.activities.find((a) => a.id === d.activity_id) : null;

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
        <div className="attention-list" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
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
        <div className="attention-list" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
          <div
            className="attention-item attention-item--clickable"
            onClick={() => viewActivityInSchedule(d.project_id, linkedActivity.schedule_id, linkedActivity.id)}
          >
            <span className="attention-item__icon attention-item__icon--info" />
            <div className="attention-item__body">
              <div className="attention-item__text">{linkedActivity.name}</div>
              <div className="attention-item__meta">LINKED ACTIVITY</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function DecisionRegisterPage({
  initialProjectFilter,
  initialPrefill,
  initialExpandedId,
}: {
  initialProjectFilter?: string | null;
  initialPrefill?: Partial<PCCDecision> | null;
  initialExpandedId?: string | null;
}) {
  const [data, setData] = useState(() => getData());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState(() => {
    if (initialProjectFilter) return initialProjectFilter;
    const ctxProjectId = getProjectContext();
    return ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });
  const [editingId, setEditingId] = useState<string | null>(() => (initialPrefill ? "new" : null));
  const [pendingPrefill, setPendingPrefill] = useState<Partial<PCCDecision> | null>(initialPrefill || null);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId || null);
  const [selectedIds, setSelectedIds] = useState<{ [id: string]: boolean }>({});

  function refresh() {
    setData(getData());
  }

  const projects = data.projects;

  function decisionMatchesFilters(d: PCCDecision): boolean {
    if (statusFilter && d.status !== statusFilter) return false;
    if (projectFilter && d.project_id !== projectFilter) return false;
    if (search) {
      const haystack = ((d.title || "") + " " + (d.description || "") + " " + (d.decision || "") + " " + (d.decided_by || "")).toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  const decisionBeingEdited: PCCDecision | null = !editingId
    ? null
    : editingId === "new"
    ? newDecision(pendingPrefill || {})
    : data.decisions.find((d) => d.id === editingId) || null;

  const sourceMeeting =
    decisionBeingEdited && decisionBeingEdited.source_meeting_id
      ? data.meetings.find((m) => m.id === decisionBeingEdited!.source_meeting_id)
      : null;

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = Object.assign({}, prev);
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function handleDelete(d: PCCDecision) {
    if (!window.confirm("Delete this decision? This can't be undone.")) return;
    deleteDecision(d.id);
    refresh();
  }

  function handleClone(d: PCCDecision) {
    setPendingPrefill({
      project_id: d.project_id,
      title: d.title,
      description: d.description,
      waiting_on_party: d.waiting_on_party,
      activity_id: d.activity_id,
    });
    setEditingId("new");
  }

  function handleAdd() {
    const lastDecidedBy = getLastUsedDecidedBy();
    setPendingPrefill(lastDecidedBy ? { decided_by: lastDecidedBy } : null);
    setEditingId("new");
  }

  const selectedCount = Object.keys(selectedIds).length;
  const noun = selectedCount === 1 ? "entry" : "entries";

  function handleDeferSelected() {
    deferDecisions(selectedIds);
    window.PCC.notify(selectedCount + " " + noun + " deferred.", "success");
    setSelectedIds({});
    refresh();
  }

  function handleDeleteSelected() {
    if (!window.confirm("Delete " + selectedCount + " selected " + noun + "? This can't be undone.")) return;
    deleteDecisions(selectedIds);
    window.PCC.notify(selectedCount + " " + noun + " deleted.", "info");
    setSelectedIds({});
    refresh();
  }

  const hasActiveProjects = projects.some((p) => !p.archived);
  const filtered = data.decisions.filter(decisionMatchesFilters);

  return (
    <>
      <h2 style={{ marginBottom: 16 }}>Decision Register</h2>

      {decisionBeingEdited ? (
        <DecisionForm
          key={editingId}
          isNew={editingId === "new"}
          decision={decisionBeingEdited}
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
        <input type="text" placeholder="Search title, context, decision, decided by…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {window.PCC.store.DECISION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by project"
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
          + Add Decision
        </button>
      </div>

      <div>
        {selectedCount > 0 ? (
          <div className="bulk-action-bar">
            <span className="bulk-action-bar__count">{selectedCount} selected</span>
            <button className="btn btn--ghost" onClick={handleDeferSelected}>
              Defer Selected
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
            {data.decisions.length === 0
              ? projects.filter((p) => !p.archived).length === 0
                ? "Add a project in Portfolio first, then log decisions against it."
                : "No decisions logged yet. Click “+ Add Decision” to log your first one."
              : "No decisions match this search/filter."}
          </div>
        ) : (
          <div className="project-list">
            {filtered.map((d) => (
              <DecisionEntry
                key={d.id}
                d={d}
                data={data}
                projects={projects}
                expanded={expandedId === d.id}
                selected={!!selectedIds[d.id]}
                onToggleSelect={() => handleToggleSelect(d.id)}
                onToggleDetails={() => setExpandedId(expandedId === d.id ? null : d.id)}
                onEdit={() => setEditingId(d.id)}
                onClone={() => handleClone(d)}
                onDelete={() => handleDelete(d)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function DecisionEntry({
  d,
  data,
  projects,
  expanded,
  selected,
  onToggleSelect,
  onToggleDetails,
  onEdit,
  onClone,
  onDelete,
}: {
  d: PCCDecision;
  data: PCCStoreData;
  projects: PCCProject[];
  expanded: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleDetails: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
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
          <div className="project-card__name">{d.title || "(untitled)"}</div>
          <div className="project-card__meta">
            {projectName(projects, d.project_id)}
            {d.decided_by ? " · " + d.decided_by : ""}
            {d.decision_date ? " · " + d.decision_date : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span
            className={
              "status-badge status-badge--" +
              (d.status === "decided" ? "complete" : d.status === "superseded" ? "info" : d.status === "deferred" ? "at_risk" : "info")
            }
          >
            {STATUS_LABELS[d.status]}
          </span>
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
      {expanded ? <DecisionDetails d={d} data={data} /> : null}
    </div>
  );
}
