/* Resource Management, migrated to React as part of the page-by-page migration
 * (Post-Phase-5 Engineering Evolution). Reproduces the prior vanilla page's exact text,
 * field ids (resfield-/asgfield-/unavfield- prefixed), button labels, and CSS class
 * names (panel/form-grid/field/project-list/detail-card/kpi-grid/kpi-card/
 * attention-list/attention-item/tab-bar/tab-btn/toolbar/btn) — same visual result, only
 * the implementation moved. See src/js/pages/resources.js (now a small stub) for the
 * router registration and the window.PCC.resources public API
 * (filterByProject/viewResource/expandAssignment) other still-vanilla pages depend on,
 * preserved via the same pending-prop channel established for other migrated pages'
 * cross-page handoffs.
 *
 * All three add/edit forms are UNCONTROLLED (fields read via form.querySelector at
 * submit time, like every other migrated register), except each form's own Project-like
 * controlled field where one exists (the Assignment form's Project select, whose
 * dependent Activity select must rescope on change).
 *
 * The Leveling tab's per-resource "Suggested Leveling" proposal state
 * (`levelingProposals`) is component-local, reset for free by keying the whole
 * LevelingTab component on the selected resource id — remounting on a resource switch
 * naturally clears any stale proposal for a different resource, matching vanilla's
 * explicit `uiState.levelingProposals = null` on resource change.
 *
 * Histogram and Utilisation Trend charts are plain inline SVG built directly in JSX —
 * React renders SVG tags natively, no separate library or manual createElementNS needed.
 *
 * All store/engine reads and writes go through resourcesService.js (master prompt §9):
 * resourceLevelingEngine.js's pure calculations are never reimplemented here.
 */
import React, { useState } from "react";
import {
  TYPE_LABELS,
  getData,
  projectName,
  resourceName,
  activityLabel,
  vendorName,
  activitiesForProject,
  newResource,
  newResourceAssignment,
  newResourceUnavailability,
  saveResource,
  deleteResource,
  saveAssignment,
  deleteAssignment,
  saveUnavailability,
  deleteUnavailability,
  portfolioOverAllocationSummary,
  computeResourceUsageTimeline,
  detectOverAllocations,
  computeUtilisation,
  bucketUtilisation,
  bucketTimeline,
  levelResourceWithinFloat,
  applyLevelingProposal,
  viewActivityInSchedule,
} from "../services/resourcesService.js";

// ===== Register tab =====

function ResourceForm({ isNew, resource, onCancel, onSaved }) {
  const [showError, setShowError] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.querySelector("#resfield-name").value.trim();
    if (!name) {
      setShowError(true);
      return;
    }
    setShowError(false);
    const availRaw = form.querySelector("#resfield-max_availability").value;
    const values = {
      name: name,
      type: form.querySelector("#resfield-type").value,
      unit: form.querySelector("#resfield-unit").value,
      max_availability: availRaw === "" ? null : Number(availRaw),
      notes: form.querySelector("#resfield-notes").value,
    };
    saveResource(isNew, resource.id, values);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Resource" : "Edit Resource"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Name *</label>
            <input type="text" id="resfield-name" defaultValue={resource.name || ""} required />
          </div>
          <div className="field">
            <label>Type</label>
            <select id="resfield-type" defaultValue={resource.type}>
              {window.PCC.store.RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Unit (e.g. person, unit, m³)</label>
            <input type="text" id="resfield-unit" defaultValue={resource.unit || ""} />
          </div>
          <div className="field">
            <label>Max Availability (per day)</label>
            <input
              type="number"
              min="0"
              step="any"
              id="resfield-max_availability"
              placeholder="leave blank if unknown/unlimited"
              defaultValue={resource.max_availability == null ? "" : resource.max_availability}
            />
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea id="resfield-notes" rows={2} defaultValue={resource.notes || ""} />
        </div>

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>Name is required.</p> : null}

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Resource" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function RegisterTab({ data, editingId, onEdit, onAdd, onCancelEdit, onSaved, onViewLeveling, search, onSearchChange, typeFilter, onTypeFilterChange }) {
  const resourceBeingEdited = !editingId ? null : editingId === "new" ? newResource() : data.resources.find((r) => r.id === editingId);

  function matches(r) {
    if (typeFilter && r.type !== typeFilter) return false;
    if (search && (r.name || "").toLowerCase().indexOf(search.toLowerCase()) === -1) return false;
    return true;
  }

  function handleDelete(r) {
    const assignmentCount = data.resource_assignments.filter((a) => a.resource_id === r.id).length;
    const warning =
      assignmentCount > 0
        ? 'Delete "' + r.name + '"? This also removes its ' + assignmentCount + " assignment(s). This can't be undone."
        : 'Delete "' + r.name + '"?';
    if (!window.confirm(warning)) return;
    deleteResource(r.id);
    onSaved();
  }

  const filtered = data.resources.filter(matches);

  return (
    <>
      {resourceBeingEdited ? (
        <ResourceForm key={editingId} isNew={editingId === "new"} resource={resourceBeingEdited} onCancel={onCancelEdit} onSaved={onSaved} />
      ) : null}

      <div className="toolbar">
        <input type="text" placeholder="Search resource name…" value={search} onChange={(e) => onSearchChange(e.target.value)} />
        <select value={typeFilter} onChange={(e) => onTypeFilterChange(e.target.value)}>
          <option value="">All Types</option>
          {window.PCC.store.RESOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" onClick={onAdd}>
          + Add Resource
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {data.resources.length === 0 ? "No resources yet. Click “+ Add Resource” to add the first one." : "No resources match this search/filter."}
        </div>
      ) : (
        <div className="project-list">
          {filtered.map((r) => {
            const assignmentCount = data.resource_assignments.filter((a) => a.resource_id === r.id).length;
            return (
              <div
                key={r.id}
                className="detail-card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}
              >
                <div>
                  <strong>{r.name}</strong>
                  <br />
                  <span className="text-secondary" style={{ fontSize: 12 }}>
                    {TYPE_LABELS[r.type]}
                    {r.unit ? " · " + r.unit : ""}
                    {r.max_availability != null ? " · Max " + r.max_availability + "/day" : " · max availability not set"}
                    {" · " + assignmentCount + " assignment(s)"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button className="btn btn--ghost" onClick={() => onViewLeveling(r.id)}>
                    View Leveling
                  </button>
                  <button className="btn btn--ghost" onClick={() => onEdit(r.id)}>
                    Edit
                  </button>
                  <button className="btn btn--ghost" onClick={() => handleDelete(r)}>
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

// ===== Assignments tab =====

function AssignmentForm({ isNew, assignment, data, onCancel, onSaved }) {
  const [showError, setShowError] = useState(false);
  const currentActivity = assignment.activity_id ? data.activities.find((a) => a.id === assignment.activity_id) : null;
  const initialProjectId = currentActivity ? currentActivity.project_id : "";
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [projectResetVersion, setProjectResetVersion] = useState(0);
  const activeProjects = data.projects.filter((p) => !p.archived);

  if (data.resources.length === 0) {
    return (
      <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
        <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Assignment" : "Edit Assignment"}</h3>
        <p className="text-secondary">Add a resource in the Register tab first.</p>
        <button className="btn btn--ghost" onClick={onCancel}>
          Close
        </button>
      </div>
    );
  }

  function handleProjectChange(e) {
    setSelectedProjectId(e.target.value);
    setProjectResetVersion((v) => v + 1);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const resourceId = form.querySelector("#asgfield-resource_id").value;
    const activityId = form.querySelector("#asgfield-activity_id").value;
    const qty = Number(form.querySelector("#asgfield-quantity").value);
    if (!resourceId || !activityId || !qty || qty <= 0) {
      setShowError(true);
      return;
    }
    setShowError(false);
    const actualQtyRaw = form.querySelector("#asgfield-actual_quantity").value;
    const hoursRaw = form.querySelector("#asgfield-planned_hours_per_day").value;
    const otRaw = form.querySelector("#asgfield-overtime_hours").value;
    const values = {
      resource_id: resourceId,
      activity_id: activityId,
      quantity: qty,
      actual_quantity: actualQtyRaw === "" ? null : Number(actualQtyRaw),
      planned_hours_per_day: hoursRaw === "" ? null : Number(hoursRaw),
      overtime_hours: otRaw === "" ? null : Number(otRaw),
      vendor_id: form.querySelector("#asgfield-vendor_id").value,
      notes: form.querySelector("#asgfield-notes").value,
    };
    saveAssignment(isNew, assignment.id, values);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Assignment" : "Edit Assignment"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Resource *</label>
            <select id="asgfield-resource_id" defaultValue={assignment.resource_id || data.resources[0].id}>
              {data.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({TYPE_LABELS[r.type]})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Project *</label>
            {activeProjects.length === 0 ? (
              <select disabled defaultValue="">
                <option value="">No projects yet</option>
              </select>
            ) : (
              <select value={selectedProjectId} onChange={handleProjectChange}>
                <option value="">(select a project)</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || "(unnamed project)"}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="field">
            <label>Activity *</label>
            <select
              id="asgfield-activity_id"
              key={"asg-act-" + selectedProjectId + "-" + projectResetVersion}
              defaultValue={projectResetVersion === 0 ? assignment.activity_id || "" : ""}
            >
              <option value="">{selectedProjectId ? "(select an activity)" : "(select a project first)"}</option>
              {activitiesForProject(data, selectedProjectId).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Planned Quantity *</label>
            <input type="number" min="0" step="any" id="asgfield-quantity" defaultValue={assignment.quantity == null ? "" : assignment.quantity} />
          </div>

          <div className="field">
            <label>Actual Quantity</label>
            <input
              type="number"
              min="0"
              step="any"
              id="asgfield-actual_quantity"
              placeholder="not yet recorded"
              defaultValue={assignment.actual_quantity == null ? "" : assignment.actual_quantity}
            />
          </div>

          <div className="field">
            <label>Planned Hours / Day</label>
            <input
              type="number"
              min="0"
              step="any"
              id="asgfield-planned_hours_per_day"
              placeholder="e.g. 8"
              defaultValue={assignment.planned_hours_per_day == null ? "" : assignment.planned_hours_per_day}
            />
          </div>

          <div className="field">
            <label>Overtime Hours</label>
            <input
              type="number"
              min="0"
              step="any"
              id="asgfield-overtime_hours"
              placeholder="total, if any"
              defaultValue={assignment.overtime_hours == null ? "" : assignment.overtime_hours}
            />
          </div>

          <div className="field">
            <label>Sourced From Vendor</label>
            <select id="asgfield-vendor_id" defaultValue={assignment.vendor_id || ""}>
              <option value="">(none)</option>
              {data.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendor_name || "(unnamed vendor)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea id="asgfield-notes" rows={2} defaultValue={assignment.notes || ""} />
        </div>

        {showError ? (
          <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>Resource, Activity, and a positive Quantity are required.</p>
        ) : null}

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Assignment" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function AssignmentsTab({
  data,
  editingId,
  onEdit,
  onAdd,
  onCancelEdit,
  onSaved,
  resourceFilter,
  onResourceFilterChange,
  projectFilter,
  onClearProjectFilter,
}) {
  const assignmentBeingEdited = !editingId ? null : editingId === "new" ? newResourceAssignment() : data.resource_assignments.find((a) => a.id === editingId);

  function matches(a) {
    if (resourceFilter && a.resource_id !== resourceFilter) return false;
    if (projectFilter) {
      const act = data.activities.find((x) => x.id === a.activity_id);
      if (!act || act.project_id !== projectFilter) return false;
    }
    return true;
  }

  function handleDelete(a) {
    if (!window.confirm("Delete this assignment?")) return;
    deleteAssignment(a.id);
    onSaved();
  }

  const filtered = data.resource_assignments.filter(matches);

  return (
    <>
      {assignmentBeingEdited ? (
        <AssignmentForm key={editingId} isNew={editingId === "new"} assignment={assignmentBeingEdited} data={data} onCancel={onCancelEdit} onSaved={onSaved} />
      ) : null}

      <div className="toolbar">
        <select value={resourceFilter} onChange={(e) => onResourceFilterChange(e.target.value)}>
          <option value="">All Resources</option>
          {data.resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {projectFilter ? (
          <>
            <span className="text-secondary" style={{ fontSize: "var(--text-sm)", alignSelf: "center" }}>
              Filtered to {projectName(data.projects, projectFilter)}
            </span>
            <button className="btn btn--ghost" onClick={onClearProjectFilter}>
              Clear
            </button>
          </>
        ) : null}
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" disabled={data.resources.length === 0} onClick={onAdd}>
          + Add Assignment
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {data.resources.length === 0
            ? "Add a resource first, then assign it to a Schedule activity here."
            : data.resource_assignments.length === 0
            ? "No assignments yet. Click “+ Add Assignment” to assign a resource to an activity."
            : "No assignments match this filter."}
        </div>
      ) : (
        <div className="project-list">
          {filtered.map((a) => {
            const activity = data.activities.find((x) => x.id === a.activity_id);
            const qtyText = "planned " + a.quantity + (a.actual_quantity != null ? ", actual " + a.actual_quantity : "");
            const extraParts = [];
            if (a.planned_hours_per_day != null) extraParts.push(a.planned_hours_per_day + " hrs/day");
            if (a.overtime_hours) extraParts.push(a.overtime_hours + " OT hrs");
            if (a.vendor_id) extraParts.push("via " + vendorName(data.vendors, a.vendor_id));
            return (
              <div
                key={a.id}
                className="detail-card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}
              >
                <div>
                  <strong>{resourceName(data.resources, a.resource_id)}</strong> — {qtyText}
                  <br />
                  <span className="text-secondary" style={{ fontSize: 12 }}>
                    {activityLabel(data.activities, a.activity_id)}
                    {activity ? " · " + projectName(data.projects, activity.project_id) : ""}
                    {extraParts.length ? " · " + extraParts.join(" · ") : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  {activity ? (
                    <button className="btn btn--ghost" onClick={() => viewActivityInSchedule(activity.project_id, activity.schedule_id, activity.id)}>
                      View in Gantt
                    </button>
                  ) : null}
                  <button className="btn btn--ghost" onClick={() => onEdit(a.id)}>
                    Edit
                  </button>
                  <button className="btn btn--ghost" onClick={() => handleDelete(a)}>
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

// ===== Unavailability tab =====

function UnavailabilityForm({ isNew, record, data, onCancel, onSaved }) {
  const [showError, setShowError] = useState(false);

  if (data.resources.length === 0) {
    return (
      <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
        <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Leave / Unavailable Period" : "Edit Leave / Unavailable Period"}</h3>
        <p className="text-secondary">Add a resource in the Register tab first.</p>
        <button className="btn btn--ghost" onClick={onCancel}>
          Close
        </button>
      </div>
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const resourceId = form.querySelector("#unavfield-resource_id").value;
    const startDate = form.querySelector("#unavfield-start_date").value;
    const endDate = form.querySelector("#unavfield-end_date").value;
    const qty = Number(form.querySelector("#unavfield-quantity").value);
    const valid = resourceId && startDate && endDate && endDate >= startDate && qty && qty > 0;
    if (!valid) {
      setShowError(true);
      return;
    }
    setShowError(false);
    const values = {
      resource_id: resourceId,
      start_date: startDate,
      end_date: endDate,
      quantity: qty,
      reason: form.querySelector("#unavfield-reason").value,
    };
    saveUnavailability(isNew, record.id, values);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Leave / Unavailable Period" : "Edit Leave / Unavailable Period"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Resource *</label>
            <select id="unavfield-resource_id" defaultValue={record.resource_id || data.resources[0].id}>
              {data.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({TYPE_LABELS[r.type]})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Start Date * (inclusive)</label>
            <input type="date" id="unavfield-start_date" defaultValue={record.start_date || ""} />
          </div>
          <div className="field">
            <label>End Date * (inclusive)</label>
            <input type="date" id="unavfield-end_date" defaultValue={record.end_date || ""} />
          </div>
          <div className="field">
            <label>Quantity Unavailable *</label>
            <input type="number" min="0" step="any" id="unavfield-quantity" placeholder="e.g. 2 of 5 electricians" defaultValue={record.quantity == null ? "" : record.quantity} />
          </div>
          <div className="field">
            <label>Reason</label>
            <input type="text" id="unavfield-reason" placeholder="e.g. Annual Leave, Maintenance, Public Holiday" defaultValue={record.reason || ""} />
          </div>
        </div>

        {showError ? (
          <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>
            Resource, Start Date, End Date (on or after Start Date), and a positive Quantity are required.
          </p>
        ) : null}

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Period" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function UnavailabilityTab({ data, editingId, onEdit, onAdd, onCancelEdit, onSaved, resourceFilter, onResourceFilterChange }) {
  const recordBeingEdited = !editingId ? null : editingId === "new" ? newResourceUnavailability() : data.resource_unavailability.find((u) => u.id === editingId);

  function handleDelete(u) {
    if (!window.confirm("Delete this leave/unavailable period?")) return;
    deleteUnavailability(u.id);
    onSaved();
  }

  const filtered = data.resource_unavailability
    .filter((u) => !resourceFilter || u.resource_id === resourceFilter)
    .slice()
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

  return (
    <>
      {recordBeingEdited ? (
        <UnavailabilityForm key={editingId} isNew={editingId === "new"} record={recordBeingEdited} data={data} onCancel={onCancelEdit} onSaved={onSaved} />
      ) : null}

      <div className="toolbar">
        <select value={resourceFilter} onChange={(e) => onResourceFilterChange(e.target.value)}>
          <option value="">All Resources</option>
          {data.resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" disabled={data.resources.length === 0} onClick={onAdd}>
          + Add Period
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {data.resources.length === 0
            ? "Add a resource first, then record its leave/unavailable periods here."
            : data.resource_unavailability.length === 0
            ? "No leave/unavailable periods recorded yet. Click “+ Add Period” to add one."
            : "No periods match this filter."}
        </div>
      ) : (
        <div className="project-list">
          {filtered.map((u) => (
            <div
              key={u.id}
              className="detail-card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}
            >
              <div>
                <strong>{resourceName(data.resources, u.resource_id)}</strong> — {u.quantity} unavailable
                <br />
                <span className="text-secondary" style={{ fontSize: 12 }}>
                  {u.start_date} to {u.end_date}
                  {u.reason ? " · " + u.reason : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn--ghost" onClick={() => onEdit(u.id)}>
                  Edit
                </button>
                <button className="btn btn--ghost" onClick={() => handleDelete(u)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ===== Leveling tab =====

function UtilisationTrend({ utilisation }) {
  if (!utilisation.available || utilisation.days.length === 0) {
    return (
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
        {utilisation.available ? "No dated assignments to chart yet." : "Max Availability isn't set for this resource, so utilisation can't be computed."}
      </p>
    );
  }

  const bucketSize = utilisation.days.length <= 60 ? 1 : utilisation.days.length <= 260 ? 7 : 30;
  const buckets = bucketUtilisation(utilisation.days, bucketSize);
  const width = Math.max(400, Math.min(900, buckets.length * (bucketSize === 1 ? 10 : 20)));
  const height = 120;
  const padB = 20;
  const barW = width / buckets.length;
  const fullLineY = height - padB - (100 / 150) * (height - padB - 6);

  return (
    <>
      <svg width={width} height={height} style={{ display: "block", maxWidth: "100%" }}>
        {buckets.map((b, i) => {
          if (b.avgUtilisationPct === null) return null;
          const pct = Math.min(b.avgUtilisationPct, 150);
          const barH = (pct / 150) * (height - padB - 6);
          const over = b.avgUtilisationPct > 100;
          return (
            <rect
              key={i}
              x={i * barW + 1}
              y={height - padB - barH}
              width={Math.max(barW - 2, 1)}
              height={barH}
              fill={over ? "var(--status-critical)" : "var(--status-info)"}
            >
              <title>
                {b.bucketStart + (b.bucketEnd !== b.bucketStart ? " to " + b.bucketEnd : "") + ": " + Math.round(b.avgUtilisationPct) + "%"}
              </title>
            </rect>
          );
        })}
        <line x1={0} y1={fullLineY} x2={width} y2={fullLineY} stroke="var(--signal-amber)" strokeWidth={2} strokeDasharray="4,3" />
      </svg>
      <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
        {(bucketSize === 1 ? "Daily" : bucketSize === 7 ? "Weekly" : "Monthly") +
          " average utilisation (allocated ÷ availability after leave). Dashed line is 100%; red bars exceed it."}
      </p>
    </>
  );
}

function Histogram({ timeline, maxAvailability }) {
  if (timeline.days.length === 0) {
    return (
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
        No dated assignments to chart yet.
      </p>
    );
  }

  const bucketSize = timeline.days.length <= 60 ? 1 : timeline.days.length <= 260 ? 7 : 30;
  const buckets = bucketTimeline(timeline.days, bucketSize);
  const width = Math.max(400, Math.min(900, buckets.length * (bucketSize === 1 ? 10 : 20)));
  const height = 160;
  const padB = 20;
  const maxVal = Math.max(maxAvailability || 0, buckets.reduce((m, b) => Math.max(m, b.allocatedMax), 0), 1);
  const barW = width / buckets.length;

  return (
    <>
      <svg width={width} height={height} style={{ display: "block", maxWidth: "100%" }}>
        {buckets.map((b, i) => {
          const barH = (b.allocatedMax / maxVal) * (height - padB - 6);
          const over = maxAvailability != null && b.allocatedMax > maxAvailability;
          return (
            <rect
              key={i}
              x={i * barW + 1}
              y={height - padB - barH}
              width={Math.max(barW - 2, 1)}
              height={barH}
              fill={over ? "var(--status-critical)" : "var(--status-info)"}
            >
              <title>{b.bucketStart + (b.bucketEnd !== b.bucketStart ? " to " + b.bucketEnd : "") + ": " + b.allocatedMax}</title>
            </rect>
          );
        })}
        {maxAvailability != null ? (
          <line
            x1={0}
            y1={height - padB - (maxAvailability / maxVal) * (height - padB - 6)}
            x2={width}
            y2={height - padB - (maxAvailability / maxVal) * (height - padB - 6)}
            stroke="var(--signal-amber)"
            strokeWidth={2}
            strokeDasharray="4,3"
          />
        ) : null}
      </svg>
      <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
        {(bucketSize === 1 ? "Daily" : bucketSize === 7 ? "Weekly (worst day per week)" : "Monthly (worst day per month)") +
          " allocation. Red bars exceed max availability" +
          (maxAvailability != null ? " (dashed line, " + maxAvailability + "/day)" : "") +
          "."}
      </p>
    </>
  );
}

function SuggestedLeveling({ resource, data, onApplied }) {
  const [proposals, setProposals] = useState(null);

  function handleSuggest() {
    setProposals(levelResourceWithinFloat(resource, data));
  }

  function handleApply(p) {
    applyLevelingProposal(p.activityId, p.proposedStart);
    window.PCC.notify(
      "Start No Earlier Than " + p.proposedStart + " set on " + p.activityName + ". Re-run Calculate Schedule on its own schedule (with Honor Date Constraints on) to apply it.",
      "success"
    );
    setProposals(null);
    onApplied();
  }

  return (
    <div className="panel" style={{ marginTop: "var(--space-4)" }}>
      <h4 style={{ marginBottom: "var(--space-2)" }}>Suggested Leveling</h4>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
        Proposes pushing lower-priority activities later, entirely within their own existing float — never extends the project finish, never touches a
        completed/in-progress activity. Applying a proposal sets a Start No Earlier Than constraint on that activity; turn on “Honor Date Constraints” in
        that Schedule's own settings and re-run Calculate Schedule for it to actually take effect.
      </p>
      <button className="btn btn--primary" onClick={handleSuggest}>
        Suggest Leveling
      </button>

      {proposals ? (
        <>
          {proposals.proposals.length === 0 && proposals.unresolved.length === 0 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>
              Nothing to propose — every activity needing this resource already has enough calculated float to fit without a change, or none are eligible
              to move.
            </p>
          ) : null}

          {proposals.excludedActivityIds.length > 0 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>
              Not eligible to move (Calculate Schedule hasn't run for them yet):{" "}
              {proposals.excludedActivityIds
                .map((id) => {
                  const a = data.activities.find((act) => act.id === id);
                  return a ? a.name || "(unnamed activity)" : id;
                })
                .join(", ")}
              .
            </p>
          ) : null}

          {proposals.proposals.length > 0 ? (
            <div className="project-list" style={{ marginTop: "var(--space-3)" }}>
              {proposals.proposals.map((p) => (
                <div
                  key={p.activityId}
                  className="detail-card"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}
                >
                  <div>
                    <strong>{p.activityName}</strong>
                    <br />
                    <span className="text-secondary" style={{ fontSize: 12 }}>
                      {p.originalStart} → {p.originalFinish} becomes {p.proposedStart} → {p.proposedFinish} (+{p.shiftedByDays}d)
                    </span>
                  </div>
                  <button className="btn btn--ghost" onClick={() => handleApply(p)}>
                    Apply
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {proposals.unresolved.length > 0 ? (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--status-critical)", marginTop: "var(--space-3)" }}>
              {proposals.unresolved.length} day(s) remain over-allocated even after leveling within existing float — resolving this needs more capacity,
              less demand, or accepting a later project finish, none of which this tool decides for you.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function LevelingTab({ data, levelingResourceId, onSelectResource, onChanged }) {
  const portfolioSummary = portfolioOverAllocationSummary(data);

  const summaryPanel = (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-2)" }}>Over-Allocated Resources (Portfolio-Wide)</h3>
      {portfolioSummary.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          No resources are currently over-allocated on any dated assignment.
        </p>
      ) : (
        <div className="attention-list">
          {portfolioSummary.map((s) => (
            <div key={s.resourceId} className="attention-item attention-item--clickable" onClick={() => onSelectResource(s.resourceId)}>
              <span className="attention-item__icon attention-item__icon--at_risk" />
              <div className="attention-item__body">
                <div className="attention-item__text">{s.resourceName}</div>
                <div className="attention-item__meta">
                  {s.overAllocatedDayCount} over-allocated day(s), worst +{s.maxOverBy}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (data.resources.length === 0) {
    return (
      <>
        {summaryPanel}
        <div className="panel empty-state">Add a resource in the Register tab to see its leveling chart here.</div>
      </>
    );
  }

  const effectiveResourceId = levelingResourceId && data.resources.some((r) => r.id === levelingResourceId) ? levelingResourceId : data.resources[0].id;
  const resource = data.resources.find((r) => r.id === effectiveResourceId);
  const timeline = computeResourceUsageTimeline(resource, data);
  const overAlloc = detectOverAllocations(resource, timeline, data);
  const utilisation = computeUtilisation(resource, timeline, data);
  const totalAssignments = data.resource_assignments.filter((a) => a.resource_id === resource.id).length;
  const resourceUnavailability = data.resource_unavailability
    .filter((u) => u.resource_id === resource.id)
    .slice()
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

  return (
    <>
      {summaryPanel}

      <div className="toolbar">
        <select value={effectiveResourceId} onChange={(e) => onSelectResource(e.target.value)}>
          {data.resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-card__label">Max Availability</span>
          <span className="kpi-card__value mono">{resource.max_availability == null ? "Not set" : resource.max_availability + "/day"}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Total Assignments</span>
          <span className="kpi-card__value mono">{totalAssignments}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Over-Allocated Days</span>
          <span className="kpi-card__value mono" style={{ color: overAlloc.available && overAlloc.count > 0 ? "var(--status-critical)" : undefined }}>
            {overAlloc.available ? overAlloc.count : "—"}
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Worst Over-Allocation</span>
          <span className="kpi-card__value mono" style={{ color: overAlloc.maxOverBy ? "var(--status-critical)" : undefined }}>
            {overAlloc.maxOverBy == null ? "—" : "+" + overAlloc.maxOverBy}
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Avg. Utilisation</span>
          <span className="kpi-card__value mono">{utilisation.averageUtilisationPct == null ? "—" : Math.round(utilisation.averageUtilisationPct) + "%"}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">Demand vs Available</span>
          <span className="kpi-card__value mono" style={{ color: utilisation.available && utilisation.totalShortfallUnitDays > 0 ? "var(--status-critical)" : undefined }}>
            {utilisation.available ? utilisation.totalDemandUnitDays + " / " + utilisation.totalAvailableUnitDays + " unit-days" : "—"}
          </span>
        </div>
      </div>

      {utilisation.available && utilisation.totalShortfallUnitDays > 0 ? (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--status-critical)", marginTop: -8, marginBottom: "var(--space-3)" }}>
          Shortfall: {utilisation.totalShortfallUnitDays} unit-day(s) of demand exceed availability across this resource's active date range.
        </p>
      ) : null}

      {!overAlloc.available ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: -8, marginBottom: "var(--space-3)" }}>
          Max Availability isn't set for this resource, so over-allocation can't be computed — set it in the Register tab.
        </p>
      ) : null}

      {timeline.skippedCount > 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          {timeline.skippedCount} assignment(s) excluded from this chart (milestone, undated, or zero-quantity activity).
        </p>
      ) : null}

      <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
        <h4 style={{ marginBottom: "var(--space-2)" }}>Usage Histogram</h4>
        <Histogram timeline={timeline} maxAvailability={resource.max_availability} />
      </div>

      <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
        <h4 style={{ marginBottom: "var(--space-2)" }}>Utilisation Trend</h4>
        <UtilisationTrend utilisation={utilisation} />
      </div>

      {resourceUnavailability.length > 0 ? (
        <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
          <h4 style={{ marginBottom: "var(--space-2)" }}>Leave / Unavailable Periods ({resourceUnavailability.length})</h4>
          {resourceUnavailability.map((u) => (
            <p key={u.id} style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0" }}>
              {u.start_date} to {u.end_date} — {u.quantity} unavailable{u.reason ? " (" + u.reason + ")" : ""}
            </p>
          ))}
        </div>
      ) : null}

      {overAlloc.available && overAlloc.count > 0 ? (
        <>
          <div className="panel">
            <h4 style={{ marginBottom: "var(--space-2)" }}>Over-Allocated Days ({overAlloc.count})</h4>
            {overAlloc.overAllocatedDays.slice(0, 20).map((day, i) => (
              <div key={i} className="detail-card" style={{ marginBottom: "var(--space-2)" }}>
                <strong>{day.date}</strong> — {day.allocated} needed vs {day.available} available (+{day.overBy})
                <br />
                <span className="text-secondary" style={{ fontSize: 12 }}>
                  {day.contributors.map((c) => c.activityName + " (" + projectName(data.projects, c.projectId) + ", " + c.quantity + ")").join(", ")}
                </span>
              </div>
            ))}
            {overAlloc.count > 20 ? (
              <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
                +{overAlloc.count - 20} more over-allocated day(s) not shown.
              </p>
            ) : null}
          </div>

          <SuggestedLeveling key={resource.id} resource={resource} data={data} onApplied={onChanged} />
        </>
      ) : null}
    </>
  );
}

// ===== Top-level render =====

export default function ResourcesPage({ initialTab, initialProjectFilter, initialLevelingResourceId }) {
  const [data, setData] = useState(() => getData());
  const [tab, setTab] = useState(initialTab || "register");
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [editingUnavailabilityId, setEditingUnavailabilityId] = useState(null);
  const [resourceSearch, setResourceSearch] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [assignmentResourceFilter, setAssignmentResourceFilter] = useState("");
  const [assignmentProjectFilter, setAssignmentProjectFilter] = useState(initialProjectFilter || "");
  const [unavailabilityResourceFilter, setUnavailabilityResourceFilter] = useState("");
  const [levelingResourceId, setLevelingResourceId] = useState(initialLevelingResourceId || "");

  function refresh() {
    setData(getData());
  }

  function handleTabChange(key) {
    setTab(key);
    setEditingResourceId(null);
    setEditingAssignmentId(null);
    setEditingUnavailabilityId(null);
  }

  return (
    <>
      <h2 style={{ marginBottom: "var(--space-2)" }}>Resource Management</h2>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
        A shared resource pool assigned to Schedule activities across every project, with cross-project over-allocation, leave-adjusted availability, and
        utilisation tracking. Quantity/availability only — no cost linkage.
      </p>

      <div className="tab-bar">
        {[
          { key: "register", label: "Register" },
          { key: "assignments", label: "Assignments" },
          { key: "unavailability", label: "Unavailability" },
          { key: "leveling", label: "Leveling" },
        ].map((t) => (
          <button key={t.key} className={"tab-btn" + (tab === t.key ? " tab-btn--active" : "")} onClick={() => handleTabChange(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "var(--space-4)" }}>
        {tab === "register" ? (
          <RegisterTab
            data={data}
            editingId={editingResourceId}
            onEdit={setEditingResourceId}
            onAdd={() => setEditingResourceId("new")}
            onCancelEdit={() => setEditingResourceId(null)}
            onSaved={() => {
              setEditingResourceId(null);
              refresh();
            }}
            onViewLeveling={(id) => {
              setLevelingResourceId(id);
              setTab("leveling");
            }}
            search={resourceSearch}
            onSearchChange={setResourceSearch}
            typeFilter={resourceTypeFilter}
            onTypeFilterChange={setResourceTypeFilter}
          />
        ) : tab === "assignments" ? (
          <AssignmentsTab
            data={data}
            editingId={editingAssignmentId}
            onEdit={setEditingAssignmentId}
            onAdd={() => setEditingAssignmentId("new")}
            onCancelEdit={() => setEditingAssignmentId(null)}
            onSaved={() => {
              setEditingAssignmentId(null);
              refresh();
            }}
            resourceFilter={assignmentResourceFilter}
            onResourceFilterChange={setAssignmentResourceFilter}
            projectFilter={assignmentProjectFilter}
            onClearProjectFilter={() => setAssignmentProjectFilter("")}
          />
        ) : tab === "unavailability" ? (
          <UnavailabilityTab
            data={data}
            editingId={editingUnavailabilityId}
            onEdit={setEditingUnavailabilityId}
            onAdd={() => setEditingUnavailabilityId("new")}
            onCancelEdit={() => setEditingUnavailabilityId(null)}
            onSaved={() => {
              setEditingUnavailabilityId(null);
              refresh();
            }}
            resourceFilter={unavailabilityResourceFilter}
            onResourceFilterChange={setUnavailabilityResourceFilter}
          />
        ) : (
          <LevelingTab
            data={data}
            levelingResourceId={levelingResourceId}
            onSelectResource={(id) => setLevelingResourceId(id)}
            onChanged={refresh}
          />
        )}
      </div>
    </>
  );
}
