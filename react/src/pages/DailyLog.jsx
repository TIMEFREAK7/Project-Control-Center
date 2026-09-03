/* Daily Log, migrated to React as part of the page-by-page migration (Post-Phase-5
 * Engineering Evolution). Reproduces the prior vanilla page's exact text, field ids
 * (dlfield- / dailylogdelay- prefixed), button labels, and CSS class names (panel/form-grid/
 * field/project-card/project-details/detail-grid/attention-list/attention-item/
 * status-badge/toolbar/btn) — same visual result, only the implementation moved. See
 * src/js/pages/dailyLog.js (now a ~20-line stub) for the router registration and the
 * window.PCC.dailyLog public API (filterByProject/expandLog) other still-vanilla pages
 * depend on, preserved via the same pending-prop channel established for other migrated
 * pages' cross-page handoffs.
 *
 * The add/edit form is UNCONTROLLED (fields read via form.querySelector at submit time)
 * except for the duplicate-entry guard: same "warn once, confirm on second submit" UX
 * the vanilla page had, tracked as component-local state (duplicateWarningAcknowledged),
 * reset via a real onChange on the Project select / Date input — exactly mirrors the
 * vanilla page's own reset-on-change listeners.
 *
 * All store/blobStore reads/writes go through dailyLogService.js (master prompt §9).
 */
import React, { useState } from "react";
import {
  FIELD_CONFIG,
  DETAIL_FIELDS,
  DAILY_LOG_DELAY_CATEGORY_LABELS,
  formatBytes,
  getData,
  projectName,
  activitiesForProject,
  newDailyLog,
  findDuplicateLog,
  saveDailyLog,
  deleteDailyLog,
  getProjectContext,
  setProjectContext,
  viewActivityInSchedule,
  viewActivityForDelay,
  openPhotoFullSize,
  resolvePhotoThumbnail,
  updatePhotoCaption,
  removePhoto,
  addPhotos,
  createDelayFromLog,
} from "../services/dailyLogService.js";

function DailyLogForm({ isNew, log, projects, data, onCancel, onSaved }) {
  const [selectedProjectId, setSelectedProjectId] = useState(log.project_id || (projects[0] ? projects[0].id : ""));
  const [errorText, setErrorText] = useState(null);
  const [errorLevel, setErrorLevel] = useState("critical");
  const [duplicateWarningAcknowledged, setDuplicateWarningAcknowledged] = useState(false);

  const activeProjects = projects.filter((p) => !p.archived);
  const activityOptions = activitiesForProject(data, selectedProjectId);

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const values = {};
    FIELD_CONFIG.forEach((cfg) => {
      const el = form.querySelector("#dlfield-" + cfg.key);
      if (el) values[cfg.key] = el.value;
    });
    values.project_id = selectedProjectId;
    values.activity_id = form.querySelector("#dlfield-activity_id").value;

    if (!values.project_id || !values.log_date) {
      setErrorText("Project and Date are required.");
      setErrorLevel("critical");
      return;
    }

    if (isNew && !duplicateWarningAcknowledged) {
      const duplicate = findDuplicateLog(values.project_id, values.log_date);
      if (duplicate) {
        setErrorText(
          "A daily log already exists for this project on " +
            values.log_date +
            '. Click "' +
            (isNew ? "Add Log" : "Save Changes") +
            '" again to add another entry anyway.'
        );
        setErrorLevel("at_risk");
        setDuplicateWarningAcknowledged(true);
        return;
      }
    }
    setErrorText(null);
    saveDailyLog(isNew, log.id, values);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Daily Log" : "Edit Daily Log"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Project *</label>
          {projects.length === 0 ? (
            <select id="dlfield-project_id" disabled defaultValue="">
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select
              id="dlfield-project_id"
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setDuplicateWarningAcknowledged(false);
              }}
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
          <select id="dlfield-activity_id" key={selectedProjectId} defaultValue={log.activity_id || ""}>
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
              <label htmlFor={"dlfield-" + cfg.key}>
                {cfg.label}
                {cfg.required ? " *" : ""}
              </label>
              {cfg.type === "textarea" ? (
                <textarea id={"dlfield-" + cfg.key} name={cfg.key} rows={3} defaultValue={log[cfg.key] || ""} />
              ) : (
                <input
                  id={"dlfield-" + cfg.key}
                  name={cfg.key}
                  type={cfg.type}
                  placeholder={cfg.placeholder || ""}
                  defaultValue={log[cfg.key] || ""}
                  required={cfg.required}
                  onChange={cfg.key === "log_date" ? () => setDuplicateWarningAcknowledged(false) : undefined}
                />
              )}
            </div>
          ))}
        </div>

        {errorText ? (
          <p style={{ color: errorLevel === "critical" ? "var(--status-critical)" : "var(--status-at-risk)", fontSize: 13 }}>{errorText}</p>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={projects.length === 0}>
            {isNew ? "Add Log" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function PhotoCell({ log, photo, onChanged }) {
  const [src, setSrc] = useState(
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E"
  );

  React.useEffect(() => {
    let cancelled = false;
    resolvePhotoThumbnail(photo)
      .then((fileData) => {
        if (!cancelled && fileData) setSrc(fileData);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id]);

  function handleRemove() {
    if (!window.confirm("Remove this photo? This can't be undone.")) return;
    removePhoto(log.id, photo.id);
    onChanged();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <a
        href="#"
        title="Open full size"
        onClick={(e) => {
          e.preventDefault();
          openPhotoFullSize(photo);
        }}
      >
        <img
          alt={photo.caption || photo.filename || "site photo"}
          style={{
            width: "100%",
            height: 90,
            objectFit: "cover",
            borderRadius: 4,
            border: "1px solid var(--divider)",
            display: "block",
            background: "var(--surface-2, #2a2a2a)",
          }}
          src={src}
        />
      </a>
      <input
        type="text"
        placeholder="Caption…"
        defaultValue={photo.caption || ""}
        style={{ fontSize: 12, padding: "4px 6px" }}
        onChange={(e) => updatePhotoCaption(log.id, photo.id, e.target.value)}
      />
      <span className="text-secondary" style={{ fontSize: 11 }}>
        {formatBytes(photo.file_size)}
      </span>
      <button className="btn btn--ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={handleRemove}>
        Remove
      </button>
    </div>
  );
}

function PhotosSection({ log, onChanged }) {
  const [adding, setAdding] = useState(false);
  const fileInputRef = React.useRef(null);

  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setAdding(true);
    addPhotos(log.id, files).then(({ anyLarge, anyFailed }) => {
      setAdding(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (anyFailed) {
        window.PCC.notify("Some photos couldn't be saved. Check available storage and try again.", "error");
      } else if (anyLarge) {
        window.PCC.notify("Photo(s) added. One or more were quite large — the export file will be bigger accordingly.", "info");
      } else {
        window.PCC.notify(files.length === 1 ? "Photo added." : files.length + " photos added.", "success");
      }
      onChanged();
    });
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
      <p className="detail-item__label" style={{ marginBottom: 8 }}>
        PHOTOS ({log.photos.length})
      </p>
      {log.photos.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: 13, margin: "0 0 8px" }}>
          No photos attached yet.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 8 }}>
          {log.photos.map((photo) => (
            <PhotoCell key={photo.id} log={log} photo={photo} onChanged={onChanged} />
          ))}
        </div>
      )}
      <label className="btn btn--ghost" style={{ display: "inline-block", cursor: "pointer" }}>
        {adding ? "Adding…" : "+ Add Photos"}
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFileChange} />
      </label>
    </div>
  );
}

function CreateDelayForm({ log, onCancel, onSaved }) {
  const [errorText, setErrorText] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const description = form.querySelector("#dailylogdelay-description").value;
    if (!description.trim()) {
      setErrorText("Description is required.");
      return;
    }
    setErrorText(null);
    createDelayFromLog(
      log.id,
      form.querySelector("#dailylogdelay-category").value,
      form.querySelector("#dailylogdelay-days").value,
      description
    );
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 10 }}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Delay Category</label>
            <select id="dailylogdelay-category" defaultValue="other">
              {window.PCC.store.DELAY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DAILY_LOG_DELAY_CATEGORY_LABELS[c] || c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Estimated Impact (days)</label>
            <input type="number" id="dailylogdelay-days" defaultValue="" />
          </div>
        </div>
        <div className="field">
          <label>Description *</label>
          <textarea id="dailylogdelay-description" rows={2} defaultValue="" />
        </div>
        {errorText ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>{errorText}</p> : null}
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button type="submit" className="btn btn--primary">
            Log Delay
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function DailyLogDelaysSection({ log, data, onChanged }) {
  const [creatingDelay, setCreatingDelay] = useState(false);
  const delaysForLog = data.delay_records.filter((r) => r.daily_log_id === log.id);

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
      <p className="detail-item__label" style={{ marginBottom: 8 }}>
        DELAYS ({delaysForLog.length})
      </p>
      <button className="btn btn--ghost" style={{ marginBottom: 8 }} onClick={() => setCreatingDelay(true)}>
        + Log Delay
      </button>

      {creatingDelay ? (
        <CreateDelayForm
          log={log}
          onCancel={() => setCreatingDelay(false)}
          onSaved={() => {
            setCreatingDelay(false);
            onChanged();
          }}
        />
      ) : null}

      {delaysForLog.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: 13 }}>
          No delays logged against this entry yet.
        </p>
      ) : (
        <div className="attention-list">
          {delaysForLog.map((r) => {
            const isActive = r.status !== "closed" && r.status !== "recovered";
            return (
              <div
                key={r.id}
                className={"attention-item" + (r.activity_id ? " attention-item--clickable" : "")}
                onClick={r.activity_id ? () => viewActivityForDelay(log.project_id, r.activity_id, data) : undefined}
              >
                <span className={"attention-item__icon attention-item__icon--" + (isActive ? "warning" : "info")} />
                <div className="attention-item__body">
                  <div className="attention-item__text">{r.description || "(untitled delay)"}</div>
                  <div className="attention-item__meta">
                    {(DAILY_LOG_DELAY_CATEGORY_LABELS[r.delay_category] || r.delay_category) +
                      (r.activity_id ? "" : " · Schedule Impact Not Yet Assessed")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LogDetails({ log, data, onChanged }) {
  const linkedActivity = log.activity_id ? data.activities.find((a) => a.id === log.activity_id) : null;

  return (
    <div className="project-details">
      <div className="detail-grid">
        {DETAIL_FIELDS.map((cfg) => {
          const value = log[cfg.key] && log[cfg.key].trim() ? log[cfg.key] : "—";
          return (
            <div key={cfg.key} style={cfg.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
              <span className="detail-item__label">{cfg.label.toUpperCase()}</span>
              <span className="detail-item__value">{value}</span>
            </div>
          );
        })}
      </div>

      {linkedActivity ? (
        <div className="attention-list" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
          <div
            className="attention-item attention-item--clickable"
            onClick={() => viewActivityInSchedule(log.project_id, linkedActivity.schedule_id, linkedActivity.id)}
          >
            <span className="attention-item__icon attention-item__icon--info" />
            <div className="attention-item__body">
              <div className="attention-item__text">{linkedActivity.name}</div>
              <div className="attention-item__meta">LINKED ACTIVITY</div>
            </div>
          </div>
        </div>
      ) : null}

      <DailyLogDelaysSection log={log} data={data} onChanged={onChanged} />
      <PhotosSection log={log} onChanged={onChanged} />
    </div>
  );
}

function LogEntry({ log, projects, expanded, onToggleDetails, onEdit, onClone, onDelete, data, onChanged }) {
  const pName = projectName(projects, log.project_id) || "(project removed)";
  return (
    <div className="project-entry">
      <div className="project-card">
        <div className="project-card__main">
          <div className="project-card__name">
            {log.log_date} · {pName}
          </div>
          <div className="project-card__meta">
            {log.activities ? log.activities.slice(0, 90) + (log.activities.length > 90 ? "…" : "") : "No activities logged"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {log.incidents && log.incidents.trim() ? (
            <span className="status-badge status-badge--critical">Incident</span>
          ) : (
            <span className="status-badge status-badge--on_track">No incidents</span>
          )}
          {log.photos && log.photos.length > 0 ? (
            <span className="status-badge status-badge--info">
              {log.photos.length + (log.photos.length === 1 ? " photo" : " photos")}
            </span>
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
      {expanded ? <LogDetails log={log} data={data} onChanged={onChanged} /> : null}
    </div>
  );
}

export default function DailyLogPage({ initialProjectFilter, initialExpandedId }) {
  const [data, setData] = useState(() => getData());
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState(() => {
    if (initialProjectFilter) return initialProjectFilter;
    const ctxProjectId = getProjectContext();
    return ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });
  const [editingId, setEditingId] = useState(null);
  const [pendingPrefill, setPendingPrefill] = useState(null);
  const [expandedId, setExpandedId] = useState(initialExpandedId || null);

  function refresh() {
    setData(getData());
  }

  const projects = data.projects;

  function matchesFilters(log) {
    if (projectFilter && log.project_id !== projectFilter) return false;
    if (search) {
      const pName = projectName(projects, log.project_id) || "";
      const haystack = [pName, log.activities, log.notes, log.weather].join(" ").toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  const logBeingEdited = !editingId ? null : editingId === "new" ? newDailyLog(pendingPrefill || {}) : data.daily_logs.find((d) => d.id === editingId);

  function handleDelete(log) {
    if (!window.confirm("Delete this daily log entry? This can't be undone.")) return;
    deleteDailyLog(log.id);
    refresh();
  }

  function handleClone(log) {
    setPendingPrefill({
      project_id: log.project_id,
      weather: log.weather,
      manpower: log.manpower,
      equipment: log.equipment,
      visitors: log.visitors,
      deliveries: log.deliveries,
      activities: log.activities,
      safety_notes: log.safety_notes,
      notes: log.notes,
      activity_id: log.activity_id,
    });
    setEditingId("new");
  }

  const filtered = data.daily_logs.filter(matchesFilters);
  const sorted = filtered.slice().sort((a, b) => b.log_date.localeCompare(a.log_date) || new Date(b.created_at) - new Date(a.created_at));

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>Daily Log</h2>
      <p className="text-secondary" style={{ marginTop: 0, marginBottom: 16 }}>
        Weather, manpower, equipment, visitors, deliveries, activities, safety, and incidents — one entry per project per day. Open an
        entry's Details to attach photos.
      </p>

      {logBeingEdited ? (
        <DailyLogForm
          key={editingId}
          isNew={editingId === "new"}
          log={logBeingEdited}
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
        <input type="text" placeholder="Search activities, notes, weather…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <button
          className="btn btn--primary"
          disabled={projects.length === 0}
          title={projects.length === 0 ? "Add a project in Portfolio first" : ""}
          onClick={() => {
            setPendingPrefill(null);
            setEditingId("new");
          }}
        >
          + Add Daily Log
        </button>
      </div>

      <div>
        {filtered.length === 0 ? (
          <div className="panel empty-state">
            {data.daily_logs.length === 0
              ? projects.length === 0
                ? "Add a project in Portfolio first, then start logging daily site activity here."
                : "No daily logs yet. Click “+ Add Daily Log” to start."
              : "No logs match this search/filter."}
          </div>
        ) : (
          <div className="project-list">
            {sorted.map((log) => (
              <LogEntry
                key={log.id}
                log={log}
                projects={projects}
                data={data}
                expanded={expandedId === log.id}
                onToggleDetails={() => setExpandedId(expandedId === log.id ? null : log.id)}
                onEdit={() => setEditingId(log.id)}
                onClone={() => handleClone(log)}
                onDelete={() => handleDelete(log)}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
