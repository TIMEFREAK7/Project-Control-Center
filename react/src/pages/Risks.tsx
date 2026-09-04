/* Risk Register, migrated to React as part of the page-by-page migration (Post-Phase-5
 * Engineering Evolution). Reproduces the prior vanilla page's exact text, field ids
 * (riskfield-*), button labels, and CSS class names (panel/form-grid/field/heatmap/
 * heatmap-cell/project-card/card-menu/card-menu__item/project-details/detail-grid/
 * attention-list/attention-item/status-badge/bulk-action-bar/toolbar/btn) — same visual
 * result, only the implementation moved. See src/js/pages/risks.js (now a ~35-line stub)
 * for the router registration and the window.PCC.risks public API
 * (filterByProject/createFromMeeting/expandRisk) other still-vanilla pages depend on,
 * preserved via the same pending-prop channel Lessons Learned's stub established.
 *
 * The add/edit form is UNCONTROLLED (fields read via form.querySelector at submit time,
 * like Decision Register/Lessons Learned/Knowledge Base).
 *
 * All store reads/writes go through risksService.js (master prompt §9).
 */
import React, { useState } from "react";
import {
  TYPE_LABELS,
  STATUS_LABELS,
  LEVEL_LABELS,
  FIELD_CONFIG,
  severityOf,
  getData,
  projectName,
  activitiesForProject,
  newRisk,
  saveRisk,
  deleteRisk,
  closeRisks,
  deleteRisks,
  getProjectContext,
  setProjectContext,
  viewMeeting,
  viewActivityInSchedule,
  createChangeOrderFromRisk,
} from "../services/risksService";
import type { FieldConfig, ActivityOption } from "../services/risksService";
import type { PCCRisk, PCCProject, PCCStoreData, PCCMeeting, PCCActivity } from "../types/pcc";

function RiskForm({
  isNew,
  risk,
  projects,
  data,
  sourceMeeting,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  risk: PCCRisk;
  projects: PCCProject[];
  data: PCCStoreData;
  sourceMeeting: PCCMeeting | null | undefined;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const activeProjects = projects.filter((p) => !p.archived);
  const [selectedProjectId, setSelectedProjectId] = useState(risk.project_id || (activeProjects[0] ? activeProjects[0].id : ""));
  const [showError, setShowError] = useState(false);

  const activityOptions: ActivityOption[] = activitiesForProject(data, selectedProjectId);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const values: { [key: string]: string } = {};
    FIELD_CONFIG.forEach((cfg) => {
      const el = form.querySelector("#riskfield-" + cfg.key) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (el) values[cfg.key] = el.value;
    });
    values.project_id = selectedProjectId;
    const activityEl = form.querySelector("#riskfield-activity_id") as HTMLSelectElement | null;
    values.activity_id = activityEl ? activityEl.value : "";

    if (!values.title || !values.title.trim() || !values.project_id) {
      setShowError(true);
      return;
    }
    setShowError(false);
    saveRisk(isNew, risk.id, values, isNew ? risk.source_meeting_id : null);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Register Entry" : "Edit Register Entry"}</h3>
      {sourceMeeting ? (
        <p className="text-secondary" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
          Linked to meeting: &#8220;{sourceMeeting.title}&#8221; ({sourceMeeting.meeting_date})
        </p>
      ) : null}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Project *</label>
          {activeProjects.length === 0 ? (
            <select id="riskfield-project_id" disabled defaultValue="">
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select id="riskfield-project_id" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
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
          <select id="riskfield-activity_id" key={selectedProjectId} defaultValue={risk.activity_id || ""}>
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
              <label htmlFor={"riskfield-" + cfg.key}>
                {cfg.label}
                {cfg.required ? " *" : ""}
              </label>
              {cfg.type === "select" ? (
                <select id={"riskfield-" + cfg.key} name={cfg.key} defaultValue={(risk as any)[cfg.key]}>
                  {window.PCC.store[cfg.options!].map((val) => (
                    <option key={val} value={val}>
                      {(cfg.labels && cfg.labels[val]) || val}
                    </option>
                  ))}
                </select>
              ) : cfg.type === "textarea" ? (
                <textarea id={"riskfield-" + cfg.key} name={cfg.key} rows={3} defaultValue={(risk as any)[cfg.key] || ""} />
              ) : (
                <input id={"riskfield-" + cfg.key} name={cfg.key} type={cfg.type} defaultValue={(risk as any)[cfg.key] || ""} required={cfg.required} />
              )}
            </div>
          ))}
        </div>

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Title and Project are required.</p> : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
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

interface HeatmapFilter {
  probability: string;
  impact: string;
}

function Heatmap({
  allRisks,
  toolbarFilteredRisks,
  heatmapFilter,
  onCellClick,
  onClear,
}: {
  allRisks: PCCRisk[];
  toolbarFilteredRisks: PCCRisk[];
  heatmapFilter: HeatmapFilter | null;
  onCellClick: (prob: string, impact: string, isActive: boolean) => void;
  onClear: () => void;
}) {
  const isNarrowed = toolbarFilteredRisks.length !== allRisks.length;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 4 }}>Heat Map</h3>
      <p className="text-secondary" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
        {isNarrowed
          ? "Reflects the current search/type/status/project filters below. Click a cell to also filter by that probability/impact combination."
          : "Click a cell to filter the list below by that probability/impact combination."}
      </p>
      <div className="heatmap">
        <div className="heatmap-corner" />
        {["low", "medium", "high"].map((impact) => (
          <div className="heatmap-col-label" key={impact}>
            {LEVEL_LABELS[impact]} Impact
          </div>
        ))}
        {["high", "medium", "low"].map((prob) => (
          <React.Fragment key={prob}>
            <div className="heatmap-row-label">{LEVEL_LABELS[prob]} Prob.</div>
            {["low", "medium", "high"].map((impact) => {
              const count = toolbarFilteredRisks.filter((r) => r.probability === prob && r.impact === impact).length;
              const severity = severityOf({ probability: prob, impact: impact });
              const isActive = heatmapFilter && heatmapFilter.probability === prob && heatmapFilter.impact === impact;
              return (
                <div
                  key={impact}
                  className={"heatmap-cell heatmap-cell--" + severity + (isActive ? " heatmap-cell--active" : "")}
                  title={LEVEL_LABELS[prob] + " probability × " + LEVEL_LABELS[impact] + " impact"}
                  onClick={() => onCellClick(prob, impact, !!isActive)}
                >
                  {count}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {heatmapFilter ? (
        <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={onClear}>
          Clear heat map filter
        </button>
      ) : null}
    </div>
  );
}

function RiskDetails({ r, data }: { r: PCCRisk; data: PCCStoreData }) {
  const fields = [
    { label: "PROBABILITY", value: LEVEL_LABELS[r.probability || ""] },
    { label: "IMPACT", value: LEVEL_LABELS[r.impact || ""] },
    { label: "OWNER", value: r.owner || "—" },
    { label: "DESCRIPTION", value: r.description || "—", wide: true },
    { label: "MITIGATION / RESPONSE", value: r.mitigation || "—", wide: true },
  ];

  const sourceMeeting = r.source_meeting_id ? data.meetings.find((m) => m.id === r.source_meeting_id) : null;
  const linkedActivity = r.activity_id ? data.activities.find((a) => a.id === r.activity_id) : null;
  const linkedChangeOrders = data.change_orders.filter((co) => co.source_risk_id === r.id);

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
          <p className="detail-item__label" style={{ marginTop: 14, marginBottom: 6 }}>
            CHANGE ORDERS RAISED ({linkedChangeOrders.length})
          </p>
          {linkedChangeOrders.map((co) => (
            <p key={co.id} style={{ fontSize: 13, margin: "0 0 2px" }}>
              <span className="mono">{co.number}</span> — {co.title || "(untitled)"}
            </p>
          ))}
        </>
      ) : null}

      <button className="btn btn--ghost" style={{ marginTop: 12 }} onClick={() => createChangeOrderFromRisk(r.project_id, r.id)}>
        + Raise Change Order from this Risk/Issue
      </button>
    </div>
  );
}

function RiskEntry({
  r,
  data,
  projects,
  expanded,
  selected,
  menuOpen,
  onToggleSelect,
  onToggleDetails,
  onToggleMenu,
  onCloseMenu,
  onEdit,
  onClone,
  onDelete,
}: {
  r: PCCRisk;
  data: PCCStoreData;
  projects: PCCProject[];
  expanded: boolean;
  selected: boolean;
  menuOpen: boolean;
  onToggleSelect: () => void;
  onToggleDetails: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const severity = severityOf(r);
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
          <div className="project-card__name">{r.title || "(untitled)"}</div>
          <div className="project-card__meta">
            {TYPE_LABELS[r.type || ""]} · {projectName(projects, r.project_id)}
            {r.owner ? " · " + r.owner : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span className={"status-badge status-badge--" + (severity === "high" ? "critical" : severity === "medium" ? "at_risk" : "on_track")}>
            {LEVEL_LABELS[severity || ""]} Severity
          </span>
          <span className={"status-badge status-badge--" + (r.status === "closed" ? "complete" : r.status === "mitigating" ? "at_risk" : "info")}>
            {STATUS_LABELS[r.status || ""]}
          </span>
        </div>
        <div className="project-card__actions">
          <button className="btn btn--ghost" onClick={onToggleDetails}>
            {expanded ? "Hide" : "Details"}
          </button>
          <div className="card-menu">
            <button className="icon-btn" aria-label="More actions" onClick={onToggleMenu}>
              ⋯
            </button>
            {menuOpen ? (
              <>
                <button className="card-menu__overlay" aria-label="Close menu" onClick={onCloseMenu} />
                <div className="card-menu__dropdown">
                  <button className="card-menu__item" onClick={onEdit}>
                    Edit
                  </button>
                  <button className="card-menu__item" onClick={onClone}>
                    Clone
                  </button>
                  <button className="card-menu__item" onClick={onDelete}>
                    Delete
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
      {expanded ? <RiskDetails r={r} data={data} /> : null}
    </div>
  );
}

export default function RisksPage({
  initialFilterByProject,
  initialProjectFilter,
  initialPrefill,
  initialExpandedId,
}: {
  initialFilterByProject?: boolean;
  initialProjectFilter?: string;
  initialPrefill?: Partial<PCCRisk> | null;
  initialExpandedId?: string | null;
}) {
  const [data, setData] = useState(() => getData());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  // filterByProject() resets status to "All statuses" (matching the vanilla page's own
  // uiState.statusFilter = "" on that call) — everywhere else defaults to "open" (hiding
  // closed items, matching how registers get used day to day).
  const [statusFilter, setStatusFilter] = useState(initialFilterByProject ? "" : "open");
  const [projectFilter, setProjectFilter] = useState(() => {
    if (initialFilterByProject) return initialProjectFilter || "";
    const ctxProjectId = getProjectContext();
    return ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });
  const [heatmapFilter, setHeatmapFilter] = useState<HeatmapFilter | null>(null);
  const [editingId, setEditingId] = useState<string | null>(() => (initialPrefill ? "new" : null));
  const [pendingPrefill, setPendingPrefill] = useState<Partial<PCCRisk> | null>(initialPrefill || null);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId || null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<{ [id: string]: boolean }>({});

  function refresh() {
    setData(getData());
  }

  const projects = data.projects;

  function matchesToolbarFilters(r: PCCRisk): boolean {
    if (typeFilter && r.type !== typeFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (projectFilter && r.project_id !== projectFilter) return false;
    if (search) {
      const haystack = ((r.title || "") + " " + (r.description || "") + " " + (r.owner || "")).toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }
  function matchesFilters(r: PCCRisk): boolean {
    if (!matchesToolbarFilters(r)) return false;
    if (heatmapFilter && (r.probability !== heatmapFilter.probability || r.impact !== heatmapFilter.impact)) return false;
    return true;
  }

  const toolbarFilteredRisks = data.risks.filter(matchesToolbarFilters);

  const riskBeingEdited: PCCRisk | null =
    !editingId ? null : editingId === "new" ? newRisk(pendingPrefill || {}) : data.risks.find((r) => r.id === editingId) || null;
  const sourceMeeting =
    riskBeingEdited && riskBeingEdited.source_meeting_id ? data.meetings.find((m) => m.id === riskBeingEdited!.source_meeting_id) : null;

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = Object.assign({}, prev);
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function handleDelete(r: PCCRisk) {
    if (!window.confirm("Delete this register entry? This can't be undone.")) return;
    deleteRisk(r.id);
    setOpenMenuId(null);
    refresh();
  }

  function handleClone(r: PCCRisk) {
    setPendingPrefill({
      project_id: r.project_id,
      type: r.type,
      title: r.title,
      description: r.description,
      probability: r.probability,
      impact: r.impact,
      owner: r.owner,
      activity_id: r.activity_id,
    });
    setEditingId("new");
    setOpenMenuId(null);
  }

  const selectedCount = Object.keys(selectedIds).length;
  const noun = selectedCount === 1 ? "entry" : "entries";

  function handleCloseSelected() {
    closeRisks(selectedIds);
    notifyBulk("closed");
  }
  function handleDeleteSelected() {
    if (!window.confirm("Delete " + selectedCount + " selected " + noun + "? This can't be undone.")) return;
    deleteRisks(selectedIds);
    notifyBulk("deleted");
  }
  function notifyBulk(verb: string) {
    window.PCC.notify(selectedCount + " " + noun + " " + verb + ".", verb === "deleted" ? "info" : "success");
    setSelectedIds({});
    refresh();
  }

  const hasActiveProjects = projects.some((p) => !p.archived);
  const filtered = data.risks.filter(matchesFilters);

  return (
    <>
      <h2 style={{ marginBottom: 16 }}>Risk Register</h2>

      <Heatmap
        allRisks={data.risks}
        toolbarFilteredRisks={toolbarFilteredRisks}
        heatmapFilter={heatmapFilter}
        onCellClick={(prob, impact, isActive) => setHeatmapFilter(isActive ? null : { probability: prob, impact: impact })}
        onClear={() => setHeatmapFilter(null)}
      />

      {riskBeingEdited ? (
        <RiskForm
          key={editingId}
          isNew={editingId === "new"}
          risk={riskBeingEdited}
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
        <input type="text" placeholder="Search title, description, owner…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {window.PCC.store.RISK_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {window.PCC.store.RISK_STATUSES.map((s) => (
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
        <button className="btn btn--primary" disabled={!hasActiveProjects} title={hasActiveProjects ? "" : "Add a project in Portfolio first"} onClick={() => setEditingId("new")}>
          + Add Entry
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
            {data.risks.length === 0
              ? projects.filter((p) => !p.archived).length === 0
                ? "Add a project in Portfolio first, then log risks, issues, and opportunities against it."
                : "No entries yet. Click “+ Add Entry” to log your first risk, issue, or opportunity."
              : "No entries match this search/filter."}
          </div>
        ) : (
          <div className="project-list">
            {filtered.map((r) => (
              <RiskEntry
                key={r.id}
                r={r}
                data={data}
                projects={projects}
                expanded={expandedId === r.id}
                selected={!!selectedIds[r.id]}
                menuOpen={openMenuId === r.id}
                onToggleSelect={() => handleToggleSelect(r.id)}
                onToggleDetails={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onToggleMenu={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                onCloseMenu={() => setOpenMenuId(null)}
                onEdit={() => {
                  setEditingId(r.id);
                  setOpenMenuId(null);
                }}
                onClone={() => handleClone(r)}
                onDelete={() => handleDelete(r)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
