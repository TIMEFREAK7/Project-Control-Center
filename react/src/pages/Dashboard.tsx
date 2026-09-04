/* Dashboard (Portfolio Overview), migrated to React as part of the page-by-page
 * migration (Post-Phase-5 Engineering Evolution). Reproduces the prior vanilla page's
 * exact text, KPI/panel structure and CSS class names (kpi-grid/kpi-card/panel/
 * attention-list/attention-item/status-badge/toolbar/card-stat/btn) — same visual
 * result, only the implementation moved. See src/js/pages/dashboard.js (now a ~10-line
 * stub) for the router registration; there is no separate public API to preserve.
 *
 * The "CURRENT CONTEXT" switcher is a raw DOM widget built by the still-vanilla
 * layout.js (window.PCC.layout.buildContextSwitcher) — its own selects wire plain
 * `onchange` handlers that call window.PCC.router.render() directly, entirely outside
 * React's tree, so it's mounted once via a ref + useEffect on first mount only (empty
 * dependency array) rather than rebuilt by React on every re-render. Confirmed that
 * reactBridge.js's flushSync wrapping of the INITIAL mount also flushes this effect
 * synchronously (not just the render) — verified directly against the real bundled
 * react-dom, so the switcher is present in the DOM the instant router.render() returns,
 * matching every other React-migrated page's synchronous-initial-render guarantee.
 *
 * The Global-Project-Context live-sync (picking up a context change made on another
 * page) uses the same "adjust state during render" pattern as ActionCentre.jsx/
 * MyWork.jsx (see ActionCentre.jsx's own comment for why this isn't an effect).
 *
 * All store/engine reads go through dashboardService.js (master prompt §9).
 */
import React, { useState, useRef, useEffect } from "react";
import {
  STATUS_LABELS,
  getData,
  getProjectContext,
  setProjectContext,
  distinctValues,
  dueSoonWindowDays,
  computeReminders,
  REQUIREMENT_STATUS_BADGE,
  countPortfolioExceptions,
  computeManagementAttention,
  viewProjectInExecutiveCenter,
  viewProjectInPortfolio,
  goToKpiRoute,
  buildContextSwitcher,
} from "../services/dashboardService";
import type { Reminder, PortfolioExceptions, AttentionGroup } from "../services/dashboardService";
import type { PCCProject, PCCStoreData } from "../types/pcc";

function ContextSwitcherPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    containerRef.current!.appendChild(buildContextSwitcher("dashboard-context"));
  }, []);
  return (
    <div className="panel no-print" style={{ marginBottom: 16 }}>
      <div className="text-secondary" style={{ fontSize: 11, letterSpacing: "0.4px", marginBottom: 8 }}>
        CURRENT CONTEXT
      </div>
      <div ref={containerRef} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  colorVar,
  onClick,
}: {
  label: string;
  value: number;
  colorVar?: string | null;
  onClick: () => void;
}) {
  return (
    <button type="button" className="kpi-card kpi-card--link" onClick={onClick}>
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value mono" style={colorVar ? { color: "var(" + colorVar + ")" } : undefined}>
        {value}
      </span>
    </button>
  );
}

function PortfolioExceptionsPanel({ exceptions }: { exceptions: PortfolioExceptions }) {
  const stats = [
    { label: "Open Risks", value: exceptions.openRisks, route: "risks" },
    { label: "Open Issues", value: exceptions.openIssues, route: "risks" },
    { label: "Pending RFIs / TQs", value: exceptions.pendingRfis, route: "rfis" },
    { label: "Pending Decisions", value: exceptions.pendingDecisions, route: "decisionRegister" },
    { label: "Milestones Due (7d)", value: exceptions.upcomingMilestones, route: "projectLookahead" },
    { label: "Delayed Projects", value: exceptions.delayedProjects, route: "delayRecoveryDashboard" },
    { label: "Open Delays", value: exceptions.openDelays, route: "delayRecoveryDashboard" },
    { label: "Critical Delays", value: exceptions.criticalDelays, route: "delayRecoveryDashboard" },
  ];
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 10 }}>Portfolio Exceptions</h3>
      <div className="project-card__stats">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            className="card-stat card-stat--link"
            onClick={() => window.PCC.router.go(stat.route)}
          >
            <span className="card-stat__label">{stat.label}</span>
            <span className="card-stat__value" style={stat.value > 0 ? { color: "var(--status-at-risk)" } : undefined}>
              {stat.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ManagementAttentionPanel({ groups }: { groups: AttentionGroup[] }) {
  const totalAlerts = groups.reduce((sum, g) => sum + g.alerts.length, 0);
  return (
    <div className="panel" style={{ marginBottom: 16, borderColor: totalAlerts > 0 ? "var(--status-critical)" : undefined }}>
      <h3 style={{ marginBottom: 10 }}>Management Attention ({totalAlerts})</h3>
      {groups.length === 0 ? (
        <p className="text-secondary" style={{ margin: 0 }}>
          No critical or warning conditions across the active portfolio right now.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.project.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{g.project.name || "(unnamed project)"}</span>
              <button className="btn btn--ghost" onClick={() => viewProjectInExecutiveCenter(g.project.id)}>
                View Project
              </button>
            </div>
            <div className="attention-list">
              {g.alerts.map((a, i) => (
                <div className="attention-item" key={i}>
                  <span className={"attention-item__icon attention-item__icon--" + (a.severity === "critical" ? "critical" : "warning")} />
                  <div className="attention-item__body">
                    <div className="attention-item__text">{a.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function RemindersPanel({ reminders, data }: { reminders: Reminder[]; data: PCCStoreData }) {
  const typesById: { [id: string]: (typeof data.document_types)[number] } = {};
  data.document_types.forEach((t) => {
    typesById[t.id] = t;
  });
  const vendorsById: { [id: string]: (typeof data.vendors)[number] } = {};
  data.vendors.forEach((v) => {
    vendorsById[v.id] = v;
  });
  const projectsById: { [id: string]: PCCProject } = {};
  data.projects.forEach((p) => {
    projectsById[p.id] = p;
  });

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 10 }}>Document Reminders ({reminders.length})</h3>
      {reminders.length === 0 ? (
        <p className="text-secondary" style={{ margin: 0 }}>
          Nothing overdue or due within the next {dueSoonWindowDays(data)} days across the active portfolio.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reminders.map((x, i) => {
            const r = x.row;
            const t = typesById[r.document_type_id]!;
            const project = projectsById[r.project_id];
            const vendor = r.vendor_id ? vendorsById[r.vendor_id] : null;
            const badgeInfo = REQUIREMENT_STATUS_BADGE[x.status];
            return (
              <div key={r.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, gap: 8 }}>
                <span>
                  {(t.name || "(unnamed type)") + (t.code ? " (" + t.code + ")" : "")} —{" "}
                  {project ? project.name || "(unnamed project)" : "(deleted project)"} — due {r.planned_submission_date}
                  {vendor ? " — " + (vendor.vendor_name || "(unnamed vendor)") : ""}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span className={"status-badge status-badge--" + badgeInfo.className} style={{ fontSize: 11 }}>
                    {badgeInfo.label}
                  </span>
                  {project ? (
                    <button className="btn btn--ghost" onClick={() => viewProjectInPortfolio(project.id)}>
                      View Project
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select aria-label={"Filter by " + label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All {label}</option>
      {options.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

export default function DashboardPage() {
  const [data] = useState(() => getData());
  const [clientFilter, setClientFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [pmFilter, setPmFilter] = useState("");
  const [plannerFilter, setPlannerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [lastSyncedContextId, setLastSyncedContextId] = useState<string | undefined>(undefined);

  const allActive = data.projects.filter((p) => !p.archived);

  const ctxProjectId = getProjectContext();
  let effectiveProjectFilter = projectFilter;
  if (ctxProjectId !== lastSyncedContextId) {
    effectiveProjectFilter = ctxProjectId && allActive.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
    setLastSyncedContextId(ctxProjectId);
    setProjectFilter(effectiveProjectFilter);
  }
  if (effectiveProjectFilter && !allActive.some((p) => p.id === effectiveProjectFilter)) {
    effectiveProjectFilter = "";
  }

  const active = effectiveProjectFilter ? allActive.filter((p) => p.id === effectiveProjectFilter) : allActive;

  function projectMatchesFilters(p: PCCProject): boolean {
    if (clientFilter && p.client !== clientFilter) return false;
    if (countryFilter && p.country !== countryFilter) return false;
    if (sectorFilter && p.sector !== sectorFilter) return false;
    if (pmFilter && p.project_manager !== pmFilter) return false;
    if (plannerFilter && p.planner !== plannerFilter) return false;
    if (typeFilter && p.project_type !== typeFilter) return false;
    if (yearFilter && (p.start_date || "").slice(0, 4) !== yearFilter) return false;
    return true;
  }
  const filtered = active.filter(projectMatchesFilters);

  function countByStatus(status: string): number {
    return filtered.filter((p) => p.status === status).length;
  }

  const reminders = computeReminders(data, filtered);
  const overdueCount = reminders.filter((x) => x.status === "overdue").length;
  const dueSoonCount = reminders.length - overdueCount;

  const kpis = [
    { label: "ACTIVE PROJECTS", value: filtered.length, colorVar: null, route: "portfolio", status: "" },
    { label: "ON TRACK", value: countByStatus("on_track"), colorVar: "--status-on-track", route: "portfolio", status: "on_track" },
    { label: "AT RISK", value: countByStatus("at_risk"), colorVar: "--status-at-risk", route: "portfolio", status: "at_risk" },
    { label: "CRITICAL", value: countByStatus("critical"), colorVar: "--status-critical", route: "portfolio", status: "critical" },
    { label: "OVERDUE DOCS", value: overdueCount, colorVar: overdueCount > 0 ? "--status-critical" : null, route: "documentControlDashboard", status: undefined },
    {
      label: "DUE SOON (" + dueSoonWindowDays(data) + "D)",
      value: dueSoonCount,
      colorVar: dueSoonCount > 0 ? "--status-at-risk" : null,
      route: "documentControlDashboard",
      status: undefined,
    },
  ];

  const years: { [year: string]: boolean } = {};
  active.forEach((p) => {
    if (p.start_date) years[p.start_date.slice(0, 4)] = true;
  });
  const yearOptions = Object.keys(years).sort();

  const focusedProject = effectiveProjectFilter ? data.projects.find((p) => p.id === effectiveProjectFilter) : null;

  const attentionGroups = active.length > 0 ? computeManagementAttention(data, filtered) : [];

  const recentProjects = filtered
    .slice()
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
    .slice(0, 5);

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>Portfolio Overview</h2>
      <p className="text-secondary" style={{ marginTop: 0, marginBottom: 20 }}>
        {active.length === 0
          ? "No active projects yet — add one from the Portfolio page to populate this view."
          : filtered.length === active.length
          ? "Portfolio-wide health across " + active.length + " active project" + (active.length === 1 ? "" : "s") + "."
          : "Portfolio-wide health across " +
            filtered.length +
            " of " +
            active.length +
            " active project" +
            (active.length === 1 ? "" : "s") +
            " matching these filters."}
      </p>

      <ContextSwitcherPanel />

      {effectiveProjectFilter ? (
        <div className="toolbar no-print" style={{ marginBottom: 12 }}>
          <span>Focused on {focusedProject ? focusedProject.name || "(unnamed project)" : ""}</span>
          <button
            className="btn btn--ghost"
            onClick={() => {
              setProjectFilter("");
              setLastSyncedContextId("");
              setProjectContext("");
            }}
          >
            Show All Projects
          </button>
        </div>
      ) : null}

      {active.length > 0 ? (
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <FilterSelect label="clients" value={clientFilter} options={distinctValues(active, "client")} onChange={setClientFilter} />
          <FilterSelect label="countries" value={countryFilter} options={distinctValues(active, "country")} onChange={setCountryFilter} />
          <FilterSelect label="sectors" value={sectorFilter} options={distinctValues(active, "sector")} onChange={setSectorFilter} />
          <FilterSelect label="PMs" value={pmFilter} options={distinctValues(active, "project_manager")} onChange={setPmFilter} />
          <FilterSelect label="planners" value={plannerFilter} options={distinctValues(active, "planner")} onChange={setPlannerFilter} />
          <FilterSelect label="types" value={typeFilter} options={distinctValues(active, "project_type")} onChange={setTypeFilter} />
          <select aria-label="Filter by year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="">All years</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="kpi-grid">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} colorVar={kpi.colorVar} onClick={() => goToKpiRoute(kpi.route, kpi.status)} />
        ))}
      </div>

      {active.length > 0 ? (
        <>
          <PortfolioExceptionsPanel exceptions={countPortfolioExceptions(data, filtered)} />
          <ManagementAttentionPanel groups={attentionGroups} />
          <RemindersPanel reminders={reminders} data={data} />
        </>
      ) : null}

      <div className="panel">
        {active.length === 0 ? (
          <>
            <h3 style={{ marginBottom: 8 }}>Get started</h3>
            <p className="text-secondary" style={{ margin: 0 }}>
              Head to Portfolio and add your first project — it'll show up here immediately.
            </p>
          </>
        ) : filtered.length === 0 ? (
          <>
            <h3 style={{ marginBottom: 8 }}>Recent projects</h3>
            <p className="text-secondary" style={{ margin: 0 }}>
              No active projects match these filters.
            </p>
          </>
        ) : (
          <>
            <h3 style={{ marginBottom: 10 }}>Recent projects</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentProjects.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                  <span>{p.name || "(unnamed project)"}</span>
                  <span className={"status-badge status-badge--" + p.status}>{STATUS_LABELS[p.status || ""] || p.status}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
