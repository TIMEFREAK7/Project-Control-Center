/* My Work — migrated to React (Post-Phase-5 Engineering Evolution, progressive React
 * migration — see ActionCentre.jsx for the closest sibling pattern: a similar cross-
 * register, project-context-synced, read-only aggregation page).
 *
 * Reproduces the prior vanilla page's exact text, section headings, and CSS class names
 * (panel/attention-list/attention-item/attention-item--clickable/attention-item__icon/
 * attention-item__body/attention-item__text/attention-item__meta/toolbar/text-secondary)
 * — same visual result, only the implementation moved. All aggregation logic lives in
 * myWorkService.js, unchanged from the vanilla page.
 */
import React, { useState } from "react";
import {
  getProjectContext,
  setProjectContext,
  collectOverdueActions,
  collectTodaysMeetings,
  collectApprovals,
  collectActivitiesToUpdate,
  collectWeekMeetings,
  collectWeekMilestones,
  collectVendorFollowups,
  collectReviewsDue,
  collectWaitingFor,
  collectRecentlyUpdated,
  WEEK_WINDOW_DAYS,
} from "../services/myWorkService.js";

function ItemRow({ item, badgeClass, projectsById }) {
  const project = item.projectId ? projectsById[item.projectId] : null;
  return (
    <div className="attention-item attention-item--clickable" onClick={item.view}>
      <span className={"attention-item__icon attention-item__icon--" + badgeClass} />
      <div className="attention-item__body">
        <div className="attention-item__text">{item.title}</div>
        <div className="attention-item__meta">
          {item.kind + (project ? " · " + (project.name || "(unnamed project)") : "") + (item.extra ? " · " + item.extra : "")}
        </div>
      </div>
    </div>
  );
}

function ListPanel({ heading, items, emptyText, projectsById, badgeClass }) {
  return (
    <div className="panel">
      <h3 style={{ marginBottom: 8 }}>
        {heading} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-secondary" style={{ margin: 0 }}>
          {emptyText}
        </p>
      ) : (
        <div className="attention-list">
          {items.map((item, i) => (
            <ItemRow key={i} item={item} badgeClass={badgeClass} projectsById={projectsById} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <p className="text-secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", margin: "24px 0 10px" }}>
      {children}
    </p>
  );
}

function Grid({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>{children}</div>
  );
}

export default function MyWorkPage() {
  const [projectFilter, setProjectFilterState] = useState("");
  const [lastSyncedContextId, setLastSyncedContextId] = useState(undefined);

  const data = window.PCC.store.get();
  const allActiveProjects = data.projects.filter((p) => !p.archived);
  const projectsById = {};
  allActiveProjects.forEach((p) => {
    projectsById[p.id] = p;
  });

  // Same "adjusting state during render" pattern ActionCentre.jsx uses to live-sync with
  // the shared Global Project Context — see that file's own comment for the full reasoning.
  const ctxProjectId = getProjectContext();
  let effectiveFilter = projectFilter;
  if (ctxProjectId !== lastSyncedContextId) {
    effectiveFilter = ctxProjectId && allActiveProjects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
    setLastSyncedContextId(ctxProjectId);
    setProjectFilterState(effectiveFilter);
  }
  if (effectiveFilter && !allActiveProjects.some((p) => p.id === effectiveFilter)) {
    effectiveFilter = "";
  }

  const activeProjects = effectiveFilter ? allActiveProjects.filter((p) => p.id === effectiveFilter) : allActiveProjects;
  const activeProjectIds = {};
  activeProjects.forEach((p) => {
    activeProjectIds[p.id] = true;
  });

  function handleProjectFilterChange(e) {
    const value = e.target.value;
    setProjectFilterState(value);
    setLastSyncedContextId(value);
    setProjectContext(value);
  }

  const waitingFor = collectWaitingFor(data, activeProjectIds);
  const recent = collectRecentlyUpdated(data, activeProjectIds, activeProjects);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>My Work</h2>
      <p className="text-secondary" style={{ marginTop: 0, marginBottom: 8 }}>
        {effectiveFilter
          ? "Your personal cockpit for " + (projectsById[effectiveFilter].name || "(unnamed project)") + "."
          : "Your personal cockpit across " + allActiveProjects.length + " active project" + (allActiveProjects.length === 1 ? "" : "s") + "."}
      </p>

      {allActiveProjects.length > 0 ? (
        <div className="toolbar no-print" style={{ marginBottom: 8 }}>
          <select value={effectiveFilter} onChange={handleProjectFilterChange}>
            <option value="">All Projects</option>
            {allActiveProjects
              .slice()
              .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "(unnamed project)"}
                </option>
              ))}
          </select>
        </div>
      ) : null}

      <SectionHeading>TODAY</SectionHeading>
      <Grid>
        <ListPanel heading="Overdue Actions" items={collectOverdueActions(data, activeProjectIds)} emptyText="Nothing overdue." projectsById={projectsById} badgeClass="critical" />
        <ListPanel heading="Today's Meetings" items={collectTodaysMeetings(data, activeProjectIds)} emptyText="No meetings today." projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Approvals" items={collectApprovals(data, activeProjectIds)} emptyText="Nothing pending approval." projectsById={projectsById} badgeClass="at_risk" />
        <ListPanel heading="Activities to Update" items={collectActivitiesToUpdate(data, activeProjectIds)} emptyText="Nothing behind its own plan dates." projectsById={projectsById} badgeClass="at_risk" />
      </Grid>

      <SectionHeading>THIS WEEK</SectionHeading>
      <Grid>
        <ListPanel heading="Meetings" items={collectWeekMeetings(data, activeProjectIds)} emptyText={"No meetings in the next " + WEEK_WINDOW_DAYS + " days."} projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Milestones" items={collectWeekMilestones(data, activeProjectIds)} emptyText={"No milestones in the next " + WEEK_WINDOW_DAYS + " days."} projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Vendor Follow-ups" items={collectVendorFollowups(data)} emptyText="Nothing due." projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Reviews" items={collectReviewsDue(data, activeProjects)} emptyText="No reviews due." projectsById={projectsById} badgeClass="info" />
      </Grid>

      <SectionHeading>WAITING FOR</SectionHeading>
      <Grid>
        <ListPanel heading="Vendor" items={waitingFor.vendor} emptyText="Nothing waiting on a vendor." projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Client" items={waitingFor.client} emptyText="Nothing waiting on the client." projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Consultant" items={waitingFor.consultant} emptyText="Nothing waiting on a consultant." projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Management" items={waitingFor.management} emptyText="Nothing waiting on management." projectsById={projectsById} badgeClass="info" />
      </Grid>

      <SectionHeading>RECENTLY UPDATED</SectionHeading>
      <Grid>
        <ListPanel heading="Projects" items={recent.projects} emptyText="No recent activity." projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Activities" items={recent.activities} emptyText="No recent activity." projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="RFIs" items={recent.rfis} emptyText="No recent activity." projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Risks" items={recent.risks} emptyText="No recent activity." projectsById={projectsById} badgeClass="info" />
        <ListPanel heading="Meetings" items={recent.meetings} emptyText="No recent activity." projectsById={projectsById} badgeClass="info" />
      </Grid>
    </div>
  );
}
