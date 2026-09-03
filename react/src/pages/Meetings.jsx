/* Meetings, migrated to React as part of the page-by-page migration (Post-Phase-5
 * Engineering Evolution). Reproduces the prior vanilla page's exact text, field ids
 * (meetingfield-*), button labels, and CSS class names (panel/form-grid/field/
 * project-card/project-details/detail-grid/attention-list/attention-item/status-badge/
 * toolbar/btn) — same visual result, only the implementation moved. See
 * src/js/pages/meetings.js (now a small stub) for the router registration and the
 * window.PCC.meetings public API (filterByProject/expandMeeting) other still-vanilla
 * pages depend on, preserved via the same pending-prop channel established for other
 * migrated pages' cross-page handoffs.
 *
 * The add/edit form is UNCONTROLLED (fields read via form.querySelector at submit time,
 * like every other migrated register). Action Items and Recordings are dynamic row
 * editors: which rows exist is React state (an array of row objects, added to on
 * "+ Add Action"/"+ Add Recording", removed by filtering), but each row's own fields are
 * uncontrolled — read straight off the DOM at submit, exactly like readActionsFromForm/
 * readRecordingsFromForm in the original vanilla page. An action row's Activity/RFI/Risk
 * pickers are scoped to the meeting's currently-selected Project; switching Project does
 * NOT restore a row's prior selection for those three fields (vendor is portfolio-wide
 * and unaffected) — it's a fresh rescope every time, matching the vanilla behavior
 * test_meeting_action_links_e2e.js pins down explicitly. Implemented via a
 * `projectResetVersion` counter bumped on every Project onChange and folded into each
 * dependent select's `key`, so the selects remount (and their `defaultValue` computation
 * only preserves the row's original link on the very first render, before any Project
 * change has happened).
 *
 * All store reads/writes go through meetingsService.js (master prompt §9).
 */
import React, { useState } from "react";
import {
  getData,
  projectName,
  todayStr,
  activitiesForProject,
  vendorOptions,
  rfisForProject,
  risksForProject,
  isOverdue,
  overdueCount,
  allOpenActions,
  newMeeting,
  newMeetingAction,
  newMeetingRecording,
  saveMeeting,
  deleteMeeting,
  getProjectContext,
  setProjectContext,
  viewActivityInSchedule,
  openDocument,
  createRiskFromMeeting,
  createDocumentFromMeeting,
  createRfiFromMeeting,
  createChangeOrderFromMeeting,
  createDecisionFromMeeting,
  createLessonFromMeeting,
} from "../services/meetingsService.js";

function ActionRow({ action, data, projectId, resetVersion, onRemove }) {
  const preserveOriginal = resetVersion === 0;
  const resetKey = projectId + "-" + resetVersion;
  return (
    <div
      className="action-editor-row"
      data-action-id={action.id}
      style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}
    >
      <input type="text" className="action-desc" placeholder="Action description" defaultValue={action.description || ""} style={{ flex: "2 1 200px" }} />
      <input type="text" className="action-owner" placeholder="Owner" defaultValue={action.owner || ""} style={{ flex: "1 1 120px" }} />
      <input type="date" className="action-due" defaultValue={action.due_date || ""} style={{ flex: "1 1 140px" }} />
      <select className="action-status" defaultValue={action.status || "open"} style={{ flex: "0 1 100px" }}>
        <option value="open">Open</option>
        <option value="done">Done</option>
      </select>
      <select className="action-vendor" title="Linked Vendor" defaultValue={action.vendor_id || ""} style={{ flex: "1 1 140px" }}>
        <option value="">No vendor</option>
        {vendorOptions(data).map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      <select className="action-activity" key={"act-" + resetKey} title="Linked Activity" defaultValue={preserveOriginal ? action.activity_id || "" : ""} style={{ flex: "1 1 160px" }}>
        <option value="">(none)</option>
        {activitiesForProject(data, projectId).map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      <select className="action-rfi" key={"rfi-" + resetKey} title="Linked RFI" defaultValue={preserveOriginal ? action.rfi_id || "" : ""} style={{ flex: "1 1 160px" }}>
        <option value="">No RFI</option>
        {rfisForProject(data, projectId).map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <select className="action-risk" key={"risk-" + resetKey} title="Linked Risk" defaultValue={preserveOriginal ? action.risk_id || "" : ""} style={{ flex: "1 1 160px" }}>
        <option value="">No risk</option>
        {risksForProject(data, projectId).map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn--ghost" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function RecordingRow({ recording, onRemove }) {
  return (
    <div
      className="recording-editor-row"
      data-recording-id={recording.id}
      data-uploaded-at={recording.uploaded_at}
      style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}
    >
      <input type="text" className="recording-filename" placeholder="Filename, e.g. kickoff-call.mp3" defaultValue={recording.filename || ""} style={{ flex: "2 1 200px" }} />
      <input type="text" className="recording-duration" placeholder="Duration, e.g. 42:15" defaultValue={recording.duration || ""} style={{ flex: "1 1 100px" }} />
      <input type="text" className="recording-uploaded-by" placeholder="Uploaded by" defaultValue={recording.uploaded_by || ""} style={{ flex: "1 1 140px" }} />
      <button type="button" className="btn btn--ghost" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function MeetingForm({ isNew, meeting, projects, data, onCancel, onSaved }) {
  const activeProjects = projects.filter((p) => !p.archived);
  const initialProjectId = meeting.project_id || (activeProjects[0] ? activeProjects[0].id : "");
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [projectResetVersion, setProjectResetVersion] = useState(0);
  const [showError, setShowError] = useState(false);
  const [actionRows, setActionRows] = useState(() => meeting.actions || []);
  const [recordingRows, setRecordingRows] = useState(() => meeting.recordings || []);

  function handleProjectChange(e) {
    setSelectedProjectId(e.target.value);
    setProjectResetVersion((v) => v + 1);
  }

  function handleAddAction() {
    setActionRows((prev) => prev.concat([newMeetingAction()]));
  }
  function handleRemoveAction(id) {
    setActionRows((prev) => prev.filter((a) => a.id !== id));
  }
  function handleAddRecording() {
    setRecordingRows((prev) => prev.concat([newMeetingRecording()]));
  }
  function handleRemoveRecording(id) {
    setRecordingRows((prev) => prev.filter((r) => r.id !== id));
  }

  function readActionsFromForm(formEl) {
    var rows = formEl.querySelectorAll(".action-editor-row");
    var actions = [];
    rows.forEach(function (row) {
      var description = row.querySelector(".action-desc").value.trim();
      var owner = row.querySelector(".action-owner").value.trim();
      var due_date = row.querySelector(".action-due").value;
      var status = row.querySelector(".action-status").value;
      var vendor_id = row.querySelector(".action-vendor").value;
      var activity_id = row.querySelector(".action-activity").value;
      var rfi_id = row.querySelector(".action-rfi").value;
      var risk_id = row.querySelector(".action-risk").value;
      if (!description && !owner && !due_date) return;
      actions.push({
        id: row.dataset.actionId,
        description: description,
        owner: owner,
        due_date: due_date,
        status: status,
        vendor_id: vendor_id,
        activity_id: activity_id,
        rfi_id: rfi_id,
        risk_id: risk_id,
      });
    });
    return actions;
  }

  function readRecordingsFromForm(formEl) {
    var rows = formEl.querySelectorAll(".recording-editor-row");
    var recordings = [];
    rows.forEach(function (row) {
      var filename = row.querySelector(".recording-filename").value.trim();
      var duration = row.querySelector(".recording-duration").value.trim();
      var uploaded_by = row.querySelector(".recording-uploaded-by").value.trim();
      if (!filename && !duration && !uploaded_by) return;
      recordings.push({
        id: row.dataset.recordingId,
        filename: filename,
        duration: duration,
        uploaded_by: uploaded_by,
        uploaded_at: row.dataset.uploadedAt || new Date().toISOString(),
      });
    });
    return recordings;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const values = {
      project_id: selectedProjectId,
      activity_id: form.querySelector("#meetingfield-activity_id").value,
      title: form.querySelector("#meetingfield-title").value,
      meeting_date: form.querySelector("#meetingfield-meeting_date").value,
      attendees: form.querySelector("#meetingfield-attendees").value,
      agenda: form.querySelector("#meetingfield-agenda").value,
      minutes: form.querySelector("#meetingfield-minutes").value,
    };
    if (!values.project_id || !values.title.trim() || !values.meeting_date) {
      setShowError(true);
      return;
    }
    setShowError(false);
    values.actions = readActionsFromForm(form);
    values.recordings = readRecordingsFromForm(form);
    saveMeeting(isNew, meeting.id, values);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Meeting" : "Edit Meeting"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Project *</label>
            {activeProjects.length === 0 ? (
              <select id="meetingfield-project_id" disabled defaultValue="">
                <option value="">No projects yet — add one in Portfolio first</option>
              </select>
            ) : (
              <select id="meetingfield-project_id" value={selectedProjectId} onChange={handleProjectChange}>
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
            <select
              id="meetingfield-activity_id"
              key={"meeting-act-" + selectedProjectId + "-" + projectResetVersion}
              defaultValue={projectResetVersion === 0 ? meeting.activity_id || "" : ""}
            >
              <option value="">(none)</option>
              {activitiesForProject(data, selectedProjectId).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Title *</label>
            <input type="text" id="meetingfield-title" defaultValue={meeting.title || ""} />
          </div>

          <div className="field">
            <label>Date *</label>
            <input type="date" id="meetingfield-meeting_date" defaultValue={meeting.meeting_date || todayStr()} />
          </div>

          <div className="field">
            <label>Attendees</label>
            <input type="text" id="meetingfield-attendees" placeholder="Comma-separated names" defaultValue={meeting.attendees || ""} />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Agenda</label>
            <textarea id="meetingfield-agenda" rows={2} defaultValue={meeting.agenda || ""} />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Minutes</label>
            <textarea id="meetingfield-minutes" rows={4} defaultValue={meeting.minutes || ""} />
          </div>
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Action Items</label>
          <div id="action-rows-container">
            {actionRows.map((a) => (
              <ActionRow
                key={a.id}
                action={a}
                data={data}
                projectId={selectedProjectId}
                resetVersion={projectResetVersion}
                onRemove={() => handleRemoveAction(a.id)}
              />
            ))}
          </div>
          <button type="button" className="btn btn--ghost" onClick={handleAddAction}>
            + Add Action
          </button>
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Recordings</label>
          <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "0 0 var(--space-2)" }}>
            Reference only — tracks the filename and details, but the actual audio/video file has to be placed in /files yourself. Recordings
            are too large to safely store inside the app's own data.
          </p>
          <div id="recording-rows-container">
            {recordingRows.map((r) => (
              <RecordingRow key={r.id} recording={r} onRemove={() => handleRemoveRecording(r.id)} />
            ))}
          </div>
          <button type="button" className="btn btn--ghost" onClick={handleAddRecording}>
            + Add Recording
          </button>
        </div>

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>Project, Title, and Date are required.</p> : null}

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary" disabled={activeProjects.length === 0}>
            {isNew ? "Add Meeting" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function MeetingDetails({ m, data, projects }) {
  const linkedActivity = m.activity_id ? data.activities.find((a) => a.id === m.activity_id) : null;
  const linkedRisks = data.risks.filter((r) => r.source_meeting_id === m.id);
  const linkedDocs = data.documents.filter((d) => d.meeting_id === m.id);
  const linkedRfis = data.rfis.filter((r) => r.source_meeting_id === m.id);
  const linkedChangeOrders = data.change_orders.filter((co) => co.source_meeting_id === m.id);
  const linkedDecisions = data.decisions.filter((d) => d.source_meeting_id === m.id);

  return (
    <div className="project-details">
      <div className="detail-grid">
        <div>
          <span className="detail-item__label">ATTENDEES</span>
          <span className="detail-item__value">{m.attendees || "—"}</span>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span className="detail-item__label">AGENDA</span>
          <span className="detail-item__value">{m.agenda || "—"}</span>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span className="detail-item__label">MINUTES</span>
          <span className="detail-item__value">{m.minutes || "—"}</span>
        </div>
      </div>

      {linkedActivity ? (
        <div className="attention-list" style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--divider)" }}>
          <div
            className="attention-item attention-item--clickable"
            onClick={() => viewActivityInSchedule(m.project_id, linkedActivity.schedule_id, linkedActivity.id)}
          >
            <span className="attention-item__icon attention-item__icon--info" />
            <div className="attention-item__body">
              <div className="attention-item__text">{linkedActivity.name}</div>
              <div className="attention-item__meta">LINKED ACTIVITY</div>
            </div>
          </div>
        </div>
      ) : null}

      {m.actions.length > 0 ? (
        <>
          <p className="detail-item__label" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
            ACTION ITEMS
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {m.actions.map((a) => {
              const overdue = isOverdue(a);
              const linkParts = [];
              if (a.vendor_id) {
                const v = data.vendors.find((x) => x.id === a.vendor_id);
                if (v) linkParts.push("Vendor: " + (v.vendor_name || "(unnamed vendor)"));
              }
              if (a.activity_id) {
                const linkedAct = data.activities.find((x) => x.id === a.activity_id);
                if (linkedAct) linkParts.push("Activity: " + (linkedAct.name || "(unnamed activity)"));
              }
              if (a.rfi_id) {
                const linkedRfi = data.rfis.find((x) => x.id === a.rfi_id);
                if (linkedRfi) linkParts.push((linkedRfi.type === "technical_query" ? "TQ: " : "RFI: ") + (linkedRfi.number || ""));
              }
              if (a.risk_id) {
                const linkedRisk = data.risks.find((x) => x.id === a.risk_id);
                if (linkedRisk) linkParts.push("Risk: " + (linkedRisk.title || "(untitled)"));
              }
              const label =
                (a.description || "(no description)") +
                (a.owner ? " — " + a.owner : "") +
                (a.due_date ? " · " + a.due_date : "") +
                (linkParts.length ? " · " + linkParts.join(", ") : "");
              return (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", gap: "var(--space-2)" }}>
                  <span style={overdue ? { color: "var(--status-critical)" } : undefined}>{label}</span>
                  <span className={"status-badge status-badge--" + (a.status === "done" ? "complete" : overdue ? "critical" : "on_track")}>
                    {a.status === "done" ? "Done" : overdue ? "Overdue" : "Open"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {m.recordings && m.recordings.length > 0 ? (
        <>
          <p className="detail-item__label" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
            RECORDINGS
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {m.recordings.map((r) => (
              <p key={r.id} className="mono" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
                {(r.filename || "(unnamed)") + (r.duration ? " · " + r.duration : "") + (r.uploaded_by ? " · uploaded by " + r.uploaded_by : "")}
              </p>
            ))}
          </div>
          <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
            Reference only — actual files live in /files.
          </p>
        </>
      ) : null}

      {linkedRisks.length > 0 ? (
        <>
          <p className="detail-item__label" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
            RISKS / ISSUES RAISED ({linkedRisks.length})
          </p>
          {linkedRisks.map((r) => (
            <p key={r.id} style={{ fontSize: "var(--text-sm)", margin: "0 0 2px" }}>
              {r.title || "(untitled)"}
            </p>
          ))}
        </>
      ) : null}

      {linkedRfis.length > 0 ? (
        <>
          <p className="detail-item__label" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
            RFI / TQ RAISED ({linkedRfis.length})
          </p>
          {linkedRfis.map((r) => (
            <p key={r.id} style={{ fontSize: "var(--text-sm)", margin: "0 0 2px" }}>
              <span className="mono">{r.number}</span> — {r.subject || "(untitled)"}
            </p>
          ))}
        </>
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

      {linkedDecisions.length > 0 ? (
        <>
          <p className="detail-item__label" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
            DECISIONS RAISED ({linkedDecisions.length})
          </p>
          {linkedDecisions.map((d) => (
            <p key={d.id} style={{ fontSize: "var(--text-sm)", margin: "0 0 2px" }}>
              {d.title || "(untitled)"}
            </p>
          ))}
        </>
      ) : null}

      {linkedDocs.length > 0 ? (
        <>
          <p className="detail-item__label" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
            ATTACHED DOCUMENTS ({linkedDocs.length})
          </p>
          {linkedDocs.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", marginBottom: 2 }}>
              <span>{d.filename}</span>
              <button className="btn btn--ghost" onClick={() => openDocument(d)}>
                Open File
              </button>
            </div>
          ))}
        </>
      ) : null}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          marginTop: "var(--space-4)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--divider)",
        }}
      >
        <button className="btn btn--ghost" onClick={() => createRiskFromMeeting(m.project_id, m.id)}>
          + Add Risk / Issue / Opportunity
        </button>
        <button className="btn btn--ghost" onClick={() => createDocumentFromMeeting(m.project_id, m.id)}>
          + Attach Document
        </button>
        <button className="btn btn--ghost" onClick={() => createRfiFromMeeting(m.project_id, m.id)}>
          + Add RFI / Technical Query
        </button>
        <button className="btn btn--ghost" onClick={() => createChangeOrderFromMeeting(m.project_id, m.id)}>
          + Add Change Order
        </button>
        <button className="btn btn--ghost" onClick={() => createDecisionFromMeeting(m.project_id, m.id)}>
          + Add Decision
        </button>
        <button className="btn btn--ghost" onClick={() => createLessonFromMeeting(m.project_id, m.id)}>
          + Add Lesson Learned
        </button>
      </div>
    </div>
  );
}

function MeetingEntry({ m, projects, expanded, data, onToggleDetails, onEdit, onDelete }) {
  const overdue = overdueCount(m);
  return (
    <div className="project-entry">
      <div className="project-card">
        <div className="project-card__main">
          <div className="project-card__name">{m.title || "(untitled)"}</div>
          <div className="project-card__meta">
            {m.meeting_date} · {projectName(projects, m.project_id)}
          </div>
        </div>
        {overdue > 0 ? (
          <span className="status-badge status-badge--critical">{overdue} Overdue</span>
        ) : m.actions.length > 0 ? (
          <span className="status-badge status-badge--on_track">
            {m.actions.length} Action{m.actions.length === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="status-badge status-badge--complete">No actions</span>
        )}
        <div className="project-card__actions">
          <button className="btn btn--ghost" onClick={onToggleDetails}>
            {expanded ? "Hide" : "Details"}
          </button>
          <button className="btn btn--ghost" onClick={onEdit}>
            Edit
          </button>
          <button className="btn btn--ghost" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      {expanded ? <MeetingDetails m={m} data={data} projects={projects} /> : null}
    </div>
  );
}

function OverduePanel({ meetings }) {
  const overdueItems = allOpenActions(meetings).filter((entry) => isOverdue(entry.action));
  if (overdueItems.length === 0) return null;

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)", borderColor: "var(--status-critical)" }}>
      <h3 style={{ marginBottom: "var(--space-2)", color: "var(--status-critical)" }}>Overdue Action Items ({overdueItems.length})</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {overdueItems.slice(0, 8).map((entry, i) => (
          <div key={i} style={{ fontSize: "var(--text-sm)", display: "flex", justifyContent: "space-between" }}>
            <span>
              {(entry.action.description || "(no description)") + (entry.action.owner ? " — " + entry.action.owner : "") + " "}
            </span>
            <span className="mono" style={{ color: "var(--status-critical)" }}>
              {entry.action.due_date}
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

export default function MeetingsPage({ initialProjectFilter, initialExpandedId }) {
  const [data, setData] = useState(() => getData());
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState(() => {
    if (initialProjectFilter) return initialProjectFilter;
    const ctxProjectId = getProjectContext();
    return ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(initialExpandedId || null);

  function refresh() {
    setData(getData());
  }

  const projects = data.projects;

  function meetingMatchesFilters(m) {
    if (projectFilter && m.project_id !== projectFilter) return false;
    if (search) {
      const pName = projectName(projects, m.project_id);
      const haystack = [m.title, m.attendees, m.agenda, m.minutes, pName].join(" ").toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  const meetingBeingEdited = !editingId ? null : editingId === "new" ? newMeeting() : data.meetings.find((m) => m.id === editingId);

  function handleDelete(m) {
    if (!window.confirm("Delete this meeting? This can't be undone.")) return;
    deleteMeeting(m.id);
    refresh();
  }

  const hasActiveProjects = projects.some((p) => !p.archived);
  const filtered = data.meetings.filter(meetingMatchesFilters).slice().sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));

  return (
    <>
      <h2 style={{ marginBottom: "var(--space-4)" }}>Meetings</h2>

      <OverduePanel meetings={data.meetings} />

      {meetingBeingEdited ? (
        <MeetingForm
          key={editingId}
          isNew={editingId === "new"}
          meeting={meetingBeingEdited}
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
        <input type="text" placeholder="Search title, attendees, agenda, minutes…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
          disabled={!hasActiveProjects}
          title={hasActiveProjects ? "" : "Add a project in Portfolio first"}
          onClick={() => setEditingId("new")}
        >
          + Add Meeting
        </button>
      </div>

      <div>
        {filtered.length === 0 ? (
          <div className="panel empty-state">
            {data.meetings.length === 0
              ? hasActiveProjects
                ? "No meetings logged yet. Click “+ Add Meeting” to start."
                : "Add a project in Portfolio first, then log meetings against it."
              : "No meetings match this search/filter."}
          </div>
        ) : (
          <div className="project-list">
            {filtered.map((m) => (
              <MeetingEntry
                key={m.id}
                m={m}
                projects={projects}
                data={data}
                expanded={expandedId === m.id}
                onToggleDetails={() => setExpandedId(expandedId === m.id ? null : m.id)}
                onEdit={() => setEditingId(m.id)}
                onDelete={() => handleDelete(m)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
