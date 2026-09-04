/* Lessons Learned — migrated to React (Post-Phase-5 Engineering Evolution, progressive
 * React migration — see DocumentTypes.jsx for the closest sibling pattern: a full CRUD
 * register with an add/edit form).
 *
 * The form is deliberately UNCONTROLLED (defaultValue only, no onChange-driven state) and
 * read straight from the DOM at submit time via each field's `lsnfield-<key>` id — the
 * exact same "read the form at submit" contract the vanilla page's readFormValues()
 * used, and what tests/test_lessons_learned_e2e.js's own checks assume (they set
 * `.value =` directly and dispatch a bare `submit` event, no per-field change events).
 * This sidesteps the controlled-input testing gotchas entirely for this page: there is no
 * React state to fight since nothing re-renders the field as the user types.
 *
 * Reproduces the prior vanilla page's exact text, ids, and CSS class names (panel/field/
 * form-grid/project-card/project-card__main/project-card__name/project-card__meta/
 * project-card__actions/project-entry/project-details/detail-grid/status-badge/
 * attention-list/attention-item/toolbar/empty-state/btn/btn--primary/btn--ghost) — same
 * visual result, only the implementation moved.
 */
import React, { useState } from "react";
import {
  CATEGORY_LABELS,
  IMPACT_LABELS,
  FIELD_CONFIG,
  getData,
  optionsFor,
  projectName,
  activityOptionsFor,
  newLessonLearned,
  saveLessonLearned,
  deleteLessonLearned,
  getLastIdentifiedBy,
  getProjectContext,
  setProjectContext,
  notify,
  navigateToMeeting,
  navigateToActivity,
} from "../services/lessonsLearnedService";
import type { FieldConfig, ActivityOption } from "../services/lessonsLearnedService";
import type { PCCLessonLearned, PCCProject, PCCStoreData } from "../types/pcc";

function FormField({ cfg, lesson }: { cfg: FieldConfig; lesson: PCCLessonLearned }) {
  const id = "lsnfield-" + cfg.key;
  const value = (lesson as any)[cfg.key] || "";
  if (cfg.type === "select") {
    return (
      <div className="field">
        <label htmlFor={id}>{cfg.label + (cfg.required ? " *" : "")}</label>
        <select id={id} name={cfg.key} defaultValue={value} key={id + "-" + (lesson.id || "new")}>
          {optionsFor(cfg.options!).map((val) => (
            <option key={val} value={val}>
              {(cfg.labels && cfg.labels[val]) || val}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (cfg.type === "textarea") {
    return (
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor={id}>{cfg.label + (cfg.required ? " *" : "")}</label>
        <textarea id={id} name={cfg.key} rows={3} defaultValue={value} key={id + "-" + (lesson.id || "new")} />
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{cfg.label + (cfg.required ? " *" : "")}</label>
      <input
        id={id}
        name={cfg.key}
        type={cfg.type}
        required={!!cfg.required}
        defaultValue={value}
        key={id + "-" + (lesson.id || "new")}
      />
    </div>
  );
}

function LessonForm({
  lesson,
  isNew,
  projects,
  data,
  onCancel,
  onSaved,
}: {
  lesson: PCCLessonLearned;
  isNew: boolean;
  projects: PCCProject[];
  data: PCCStoreData;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [showError, setShowError] = useState(false);
  const activeProjects = projects.filter((p) => !p.archived);
  const [selectedProjectId, setSelectedProjectId] = useState(lesson.project_id || (activeProjects[0] ? activeProjects[0].id : ""));

  const sourceMeeting = lesson.source_meeting_id ? data.meetings.find((m) => m.id === lesson.source_meeting_id) : null;
  const activityOptions: ActivityOption[] = activityOptionsFor(data, selectedProjectId);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const values: { [key: string]: string } = {};
    FIELD_CONFIG.forEach((cfg) => {
      const el = form.querySelector("#lsnfield-" + cfg.key) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (el) values[cfg.key] = el.value;
    });
    values.project_id = (form.querySelector("#lsnfield-project_id") as HTMLSelectElement).value;
    values.activity_id = (form.querySelector("#lsnfield-activity_id") as HTMLSelectElement).value;
    if (isNew) values.source_meeting_id = lesson.source_meeting_id || "";

    if (!values.title || !values.title.trim() || !values.project_id) {
      setShowError(true);
      return;
    }
    setShowError(false);

    saveLessonLearned(isNew, lesson.id, values);
    notify(isNew ? "Lesson Learned added." : "Lesson Learned updated.", "success");
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Lesson Learned" : "Edit Lesson Learned"}</h3>
      {sourceMeeting ? (
        <p className="text-secondary" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
          {"Linked to meeting: “" + sourceMeeting.title + "” (" + sourceMeeting.meeting_date + ")"}
        </p>
      ) : null}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Project *</label>
          {activeProjects.length === 0 ? (
            <select id="lsnfield-project_id" disabled>
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select
              id="lsnfield-project_id"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
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
          <select id="lsnfield-activity_id" defaultValue={lesson.activity_id || ""} key={"activity-" + selectedProjectId}>
            {activityOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          {FIELD_CONFIG.map((cfg) => (
            <FormField key={cfg.key} cfg={cfg} lesson={lesson} />
          ))}
        </div>

        {showError ? (
          <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Title and Project are required.</p>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={activeProjects.length === 0}>
            {isNew ? "Add Lesson Learned" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function LessonDetails({ l }: { l: PCCLessonLearned }) {
  const data = getData();
  const sourceMeeting = l.source_meeting_id ? data.meetings.find((m) => m.id === l.source_meeting_id) : null;
  const linkedActivity = l.activity_id ? data.activities.find((a) => a.id === l.activity_id) : null;

  const fields = [
    { label: "CATEGORY", value: CATEGORY_LABELS[l.category || ""] },
    { label: "IMPACT", value: IMPACT_LABELS[l.impact_type || ""] },
    { label: "DATE IDENTIFIED", value: l.date_identified || "—" },
    { label: "IDENTIFIED BY", value: l.identified_by || "—" },
    { label: "WHAT HAPPENED", value: l.description || "—", wide: true },
    { label: "RECOMMENDATION", value: l.recommendation || "—", wide: true },
  ];

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
          <div className="attention-item attention-item--clickable" onClick={() => navigateToMeeting(sourceMeeting.id)}>
            <span className="attention-item__icon attention-item__icon--info" />
            <div className="attention-item__body">
              <div className="attention-item__text">{sourceMeeting.title + " (" + sourceMeeting.meeting_date + ")"}</div>
              <div className="attention-item__meta">RAISED IN MEETING</div>
            </div>
          </div>
        </div>
      ) : null}

      {linkedActivity ? (
        <div className="attention-list" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
          <div className="attention-item attention-item--clickable" onClick={() => navigateToActivity(l.project_id, linkedActivity.schedule_id, linkedActivity.id)}>
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

function LessonEntry({
  l,
  projects,
  expanded,
  onToggleDetails,
  onEdit,
  onClone,
  onDelete,
}: {
  l: PCCLessonLearned;
  projects: PCCProject[];
  expanded: boolean;
  onToggleDetails: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="project-entry">
      <div className="project-card">
        <div className="project-card__main">
          <div className="project-card__name">{l.title || "(untitled)"}</div>
          <div className="project-card__meta">
            {projectName(projects, l.project_id) + " · " + CATEGORY_LABELS[l.category || ""] + (l.identified_by ? " · " + l.identified_by : "") + (l.date_identified ? " · " + l.date_identified : "")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span className={"status-badge status-badge--" + (l.impact_type === "positive" ? "on_track" : "critical")}>{IMPACT_LABELS[l.impact_type || ""]}</span>
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
      {expanded ? <LessonDetails l={l} /> : null}
    </div>
  );
}

export default function LessonsLearnedPage({
  initialPrefill,
  initialExpandedId,
}: {
  initialPrefill?: Partial<PCCLessonLearned> | null;
  initialExpandedId?: string | null;
}) {
  const [data, setData] = useState(() => getData());
  // Opening the prefilled form is folded into the initial state itself, not a useEffect —
  // flushSync (reactBridge.js) only forces the INITIAL render synchronous; an effect runs
  // in a later, asynchronous phase even on first mount, which would leave a real caller
  // (meetings.js's "+ Add Lesson Learned" button, via createFromMeeting()) seeing a blank
  // form for a tick before the prefill applies. Doing it here means it's simultaneous with
  // the synchronous initial commit, no separate async step at all.
  const [editingId, setEditingId] = useState<string | null>(() => (initialPrefill ? "new" : null));
  const [pendingPrefill, setPendingPrefill] = useState<Partial<PCCLessonLearned> | null>(initialPrefill || null);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId || null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [impactFilter, setImpactFilter] = useState("");
  // Global Project Context: read once on mount, same as the vanilla page's own
  // "projectFilterInitialized" one-time check — a fresh mount happens on every
  // navigation to this page (reactBridge.js), so "once per mount" here.
  const [projectFilter, setProjectFilter] = useState(() => {
    const ctxProjectId = getProjectContext();
    const snapshot = getData();
    return ctxProjectId && snapshot.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });

  function refresh() {
    setData(getData());
  }

  const projects = data.projects;

  function handleAdd() {
    const lastIdentifiedBy = getLastIdentifiedBy();
    setPendingPrefill(lastIdentifiedBy ? { identified_by: lastIdentifiedBy } : null);
    setEditingId("new");
  }

  function handleSaved() {
    setEditingId(null);
    refresh();
  }

  function handleDelete(l: PCCLessonLearned) {
    if (!window.confirm("Delete this lesson learned? This can't be undone.")) return;
    deleteLessonLearned(l.id);
    notify("Lesson Learned deleted.", "info");
    refresh();
  }

  function handleClone(l: PCCLessonLearned) {
    setPendingPrefill({
      project_id: l.project_id,
      category: l.category,
      impact_type: l.impact_type,
      title: l.title,
      description: l.description,
      recommendation: l.recommendation,
      activity_id: l.activity_id,
    });
    setEditingId("new");
  }

  const lessonBeingEdited: PCCLessonLearned | null =
    !editingId ? null : editingId === "new" ? newLessonLearned(pendingPrefill || {}) : data.lessons_learned.find((l) => l.id === editingId) || null;

  function matchesFilters(l: PCCLessonLearned): boolean {
    if (categoryFilter && l.category !== categoryFilter) return false;
    if (impactFilter && l.impact_type !== impactFilter) return false;
    if (projectFilter && l.project_id !== projectFilter) return false;
    if (search) {
      const haystack = ((l.title || "") + " " + (l.description || "") + " " + (l.recommendation || "") + " " + (l.identified_by || "")).toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  const filtered = data.lessons_learned.filter(matchesFilters);
  const hasActiveProjects = projects.some((p) => !p.archived);

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Lessons Learned</h2>

      {editingId && lessonBeingEdited ? (
        <LessonForm
          lesson={lessonBeingEdited}
          isNew={editingId === "new"}
          projects={projects}
          data={data}
          onCancel={() => setEditingId(null)}
          onSaved={handleSaved}
        />
      ) : null}

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search title, what happened, recommendation, identified by…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {optionsFor("LESSON_LEARNED_CATEGORIES").map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)}>
          <option value="">All impact</option>
          {optionsFor("LESSON_LEARNED_IMPACT_TYPES").map((i) => (
            <option key={i} value={i}>
              {IMPACT_LABELS[i]}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => {
            const value = e.target.value;
            setProjectFilter(value);
            if (value) setProjectContext(value);
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
          + Add Lesson Learned
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {data.lessons_learned.length === 0
            ? projects.filter((p) => !p.archived).length === 0
              ? "Add a project in Portfolio first, then log lessons learned against it."
              : "No lessons learned logged yet. Click “+ Add Lesson Learned” to log your first one."
            : "No lessons learned match this search/filter."}
        </div>
      ) : (
        <div className="project-list">
          {filtered.map((l) => (
            <LessonEntry
              key={l.id}
              l={l}
              projects={projects}
              expanded={expandedId === l.id}
              onToggleDetails={() => setExpandedId(expandedId === l.id ? null : l.id)}
              onEdit={() => setEditingId(l.id)}
              onClone={() => handleClone(l)}
              onDelete={() => handleDelete(l)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
