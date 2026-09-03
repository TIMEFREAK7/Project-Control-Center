/* Project Workspace, migrated to React as part of the page-by-page migration
 * (Post-Phase-5 Engineering Evolution). Reproduces the prior vanilla page's exact text,
 * panel/nav/vitals structure and CSS class names (panel/card-stat/kpi-grid/kpi-card/
 * attention-list/attention-item/card-menu__item/status-badge/toolbar/btn) — same visual
 * result, only the implementation moved. See src/js/pages/projectWorkspace.js (now a
 * ~20-line stub) for the router registration and window.PCC.projectWorkspace.viewProject()
 * public API other still-vanilla pages depend on, preserved via the same pending-prop
 * channel established for other migrated pages with a cross-page handoff.
 *
 * Deliberately CPM-engine-free, same as the vanilla page (see projectWorkspaceService.js's
 * own header comment).
 *
 * The project switcher mirrors the shared Global Project Context every render (no
 * lastSyncedContextId tracking needed, unlike ActionCentre/MyWork/Dashboard — this page
 * always has exactly one project selected and its own switcher already writes back to
 * the context on change, so context and local selection can never disagree except on the
 * very first render, which the same "adjust state during render" comparison handles).
 *
 * All store/engine reads go through projectWorkspaceService.js (master prompt §9).
 */
import React, { useState } from "react";
import {
  STATUS_LABELS,
  NAV_GROUPS,
  getData,
  getProjectContext,
  setProjectContext,
  fmtMoney,
  computeScheduleStatus,
  computeKeyMilestone,
  projectStats,
  buildAttentionItems,
  buildUpcomingItems,
  buildRecentActivity,
  navigateToModule,
} from "../services/projectWorkspaceService.js";

function VitalChip({ label, value, colorVar }) {
  return (
    <div className="card-stat">
      <span className="card-stat__label">{label}</span>
      <span className="card-stat__value card-stat__value--text" style={colorVar ? { color: "var(" + colorVar + ")" } : undefined}>
        {value}
      </span>
    </div>
  );
}

function Header({ project, data }) {
  const scheduleStatus = computeScheduleStatus(data, project.id);
  const keyMilestone = computeKeyMilestone(data, project.id);

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>{project.name || "(unnamed project)"}</h2>
          <div className="text-secondary" style={{ fontSize: 13 }}>
            {[project.client, project.company, project.country].filter(Boolean).join(" · ")}
          </div>
        </div>
        <span className={"status-badge status-badge--" + project.status}>{STATUS_LABELS[project.status] || project.status}</span>
      </div>

      <div className="project-card__stats" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
        <VitalChip label="PROGRESS" value={Math.max(0, Math.min(100, project.progress || 0)) + "%"} />
        <VitalChip
          label="SCHEDULE STATUS"
          value={scheduleStatus}
          colorVar={scheduleStatus === "Behind Schedule" ? "--status-at-risk" : "--status-on-track"}
        />
        <VitalChip
          label="KEY MILESTONE"
          value={keyMilestone ? (keyMilestone.activity.name || "(unnamed milestone)") + " · " + keyMilestone.date : "None scheduled"}
        />
        <VitalChip
          label="CURRENT HEALTH"
          value={STATUS_LABELS[project.status] || project.status}
          colorVar={
            project.status === "critical"
              ? "--status-critical"
              : project.status === "at_risk"
              ? "--status-at-risk"
              : project.status === "complete"
              ? null
              : "--status-on-track"
          }
        />
      </div>
    </div>
  );
}

function Nav({ projectId }) {
  return (
    <div className="no-print" style={{ marginBottom: 16 }}>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button className="btn btn--primary">Overview</button>
        <button className="btn btn--ghost" onClick={() => navigateToModule("executiveCenter", projectId)}>
          Executive Center
        </button>
      </div>

      <div className="panel">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", margin: "0 0 6px" }}>
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  className="card-menu__item"
                  style={{ display: "block", width: "100%" }}
                  onClick={() => navigateToModule(item.key, projectId)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, colorVar }) {
  return (
    <div className="kpi-card">
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value mono" style={colorVar ? { color: "var(" + colorVar + ")" } : undefined}>
        {value}
      </span>
    </div>
  );
}

function AttentionPanel({ items, projectId }) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 10 }}>Management Attention ({items.length})</h3>
      {items.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
          Nothing outstanding.
        </p>
      ) : (
        <div className="attention-list">
          {items.map((i, idx) => (
            <div className="attention-item attention-item--clickable" key={idx} onClick={() => navigateToModule(i.nav, projectId)}>
              <span className={"attention-item__icon attention-item__icon--" + i.severity} />
              <div className="attention-item__body">
                <div className="attention-item__text">{i.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListPanel({ title, items, dateMono }) {
  return (
    <div className="panel" style={{ flex: "1 1 320px", minWidth: 280 }}>
      <h4 style={{ marginBottom: 10 }}>{title}</h4>
      {items.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: 13 }}>
          Nothing to show.
        </p>
      ) : (
        <div>
          {items.map((i, idx) => (
            <div key={idx} style={{ fontSize: 12, marginBottom: 6 }}>
              {dateMono ? (
                <span className="mono text-secondary">{i.date}</span>
              ) : (
                <span className="text-secondary">{new Date(i.date).toLocaleDateString()}</span>
              )}
              {" — " + i.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Overview({ data, project }) {
  const stats = projectStats(data, project.id);
  const attentionItems = buildAttentionItems(stats);
  const windowDays = (data.settings && data.settings.action_centre_upcoming_days) || 30;
  const upcoming = buildUpcomingItems(data, project.id, windowDays);
  const recent = buildRecentActivity(data, project.id);

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="FINISH" value={project.finish_date || "—"} />
        <KpiCard label="BUDGET" value={fmtMoney(project.budget, project.currency)} />
        <KpiCard label="OPEN RISKS / ISSUES" value={stats.openRisks} colorVar={stats.openRisks > 0 ? "--status-at-risk" : null} />
        <KpiCard label="OPEN RFIs / TQs" value={stats.openRfis} colorVar={stats.overdueRfis.length > 0 ? "--status-critical" : null} />
        <KpiCard label="DOCUMENTS" value={stats.docsAvailable + "/" + stats.docsTotal} />
      </div>

      <AttentionPanel items={attentionItems} projectId={project.id} />

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <ListPanel title={"Upcoming (next " + windowDays + " days)"} items={upcoming} dateMono />
        <ListPanel title="Recent Activity" items={recent} dateMono={false} />
      </div>
    </>
  );
}

export default function ProjectWorkspacePage({ initialProjectId }) {
  const [data] = useState(() => getData());
  const [projectId, setProjectId] = useState(initialProjectId || null);

  const activeProjects = data.projects.filter((p) => !p.archived);

  if (activeProjects.length === 0) {
    return (
      <>
        <h2 style={{ marginBottom: 6 }}>Project Workspace</h2>
        <div className="panel empty-state">Add a project in Portfolio first to open its Workspace.</div>
      </>
    );
  }

  const ctxProjectId = getProjectContext();
  let effectiveProjectId = projectId;
  if (ctxProjectId && activeProjects.some((p) => p.id === ctxProjectId)) {
    effectiveProjectId = ctxProjectId;
  } else if (!projectId || !activeProjects.some((p) => p.id === projectId)) {
    effectiveProjectId = activeProjects[0].id;
  }
  if (effectiveProjectId !== projectId) {
    setProjectId(effectiveProjectId);
  }

  const project = data.projects.find((p) => p.id === effectiveProjectId);

  return (
    <>
      <h2 style={{ marginBottom: 6 }}>Project Workspace</h2>

      <div className="toolbar no-print" style={{ marginBottom: 10 }}>
        <select
          value={effectiveProjectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setProjectContext(e.target.value);
          }}
        >
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "(unnamed project)"}
            </option>
          ))}
        </select>
      </div>

      {project ? (
        <>
          <Header project={project} data={data} />
          <Nav projectId={project.id} />
          <Overview data={data} project={project} />
        </>
      ) : null}
    </>
  );
}
