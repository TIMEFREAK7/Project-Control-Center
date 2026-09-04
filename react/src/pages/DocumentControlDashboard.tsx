/* Document Control Dashboard — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration, following the Storage Management pilot's pattern).
 *
 * A portfolio-wide, read-only compliance rollup for the Document Control sub-spec (Gate 26 —
 * Document Control 12: Dashboards) — distinct from Gate 25's Dashboard "Document Reminders"
 * panel (time-sensitive Overdue/Due-Soon alerts) and from the later Executive Summary (gate
 * 13, narrative text) and Portfolio Compliance (gate 14, a rollup/report) gates. Charts/tables
 * only: overall Available/Required/Overdue counts across every active project's document
 * requirements, a per-project compliance breakdown (worst-compliance-first), and a
 * per-document-type breakdown. Nothing is written back — every number here is computed at
 * render time via documentControlDashboardService.js.
 *
 * Reproduces the prior vanilla page's exact text, headings, and CSS class names
 * (kpi-grid/kpi-card/kpi-card__label/kpi-card__value/panel/empty-state/attention-list/
 * attention-item/attention-item--clickable/attention-item__icon/attention-item__body/
 * attention-item__text/attention-item__meta/text-secondary/mono) — same visual result, only
 * the implementation moved. No local UI state: this is a pure, read-only report over the
 * store snapshot, recomputed fresh every time reactBridge mounts it (i.e. every navigation to
 * this route), exactly like the old vanilla page recomputed fresh on every router.render().
 */
import React from "react";
import { pct, groupCompliance, getDashboardSnapshot, viewProjectOnPortfolio, ComplianceGroup } from "../services/documentControlDashboardService";

function KpiCard({ label, value, colorVar }: { label: string; value: string | number; colorVar?: string | null }) {
  return (
    <div className="kpi-card">
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value mono" style={colorVar ? { color: `var(${colorVar})` } : undefined}>
        {value}
      </span>
    </div>
  );
}

// Redesign Gate 10 (Module Consistency Pass) primitive: .attention-list/.attention-item, the
// same one every other panel-turned-list in this app uses. The whole row is the click target
// only when onClick is given (the by-project panel passes one; the by-document-type panel
// passes null, since document types have no dedicated page to link to).
function ComplianceRow({ label, group, onClick }: { label: string; group: ComplianceGroup; onClick: (() => void) | null }) {
  const iconStatus = group.overdue > 0 ? "critical" : group.pctAvailable < 100 ? "at_risk" : "on_track";
  return (
    <div className={"attention-item" + (onClick ? " attention-item--clickable" : "")} onClick={onClick || undefined}>
      <span className={"attention-item__icon attention-item__icon--" + iconStatus} />
      <div className="attention-item__body">
        <div className="attention-item__text">{label}</div>
        <div className="attention-item__meta">
          {group.available} of {group.total} available ({group.pctAvailable}%)
          {group.overdue > 0 ? ` · ${group.overdue} overdue` : ""}
        </div>
      </div>
    </div>
  );
}

export default function DocumentControlDashboardPage() {
  const { activeProjects, projectsById, typesById, rows } = getDashboardSnapshot();

  if (rows.length === 0) {
    return (
      <>
        <h2 style={{ marginBottom: 4 }}>Document Control Dashboard</h2>
        <p className="text-secondary" style={{ marginTop: 0, marginBottom: 20 }}>
          No document requirements assigned across the active portfolio yet — assign some from Portfolio's Add/Edit Project
          form.
        </p>
        <div className="panel empty-state">
          Nothing to show yet. Once projects have document requirements assigned, this dashboard will break down compliance
          by project and by document type.
        </div>
      </>
    );
  }

  const totalCount = rows.length;
  const availableCount = rows.filter((x) => x.status === "available").length;
  const overdueCount = rows.filter((x) => x.status === "overdue").length;
  const requiredCount = totalCount - availableCount - overdueCount;

  const projectGroups = groupCompliance(rows, (r) => r.project_id);
  const typeGroups = groupCompliance(rows, (r) => r.document_type_id);

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>Document Control Dashboard</h2>
      <p className="text-secondary" style={{ marginTop: 0, marginBottom: 20 }}>
        Portfolio-wide document compliance across {activeProjects.length} active project{activeProjects.length === 1 ? "" : "s"}.
      </p>

      <div className="kpi-grid">
        <KpiCard label="TOTAL REQUIREMENTS" value={totalCount} />
        <KpiCard label="AVAILABLE" value={`${pct(availableCount, totalCount)}%`} colorVar="--status-on-track" />
        <KpiCard label="REQUIRED" value={requiredCount} colorVar={requiredCount > 0 ? "--status-at-risk" : null} />
        <KpiCard label="OVERDUE" value={overdueCount} colorVar={overdueCount > 0 ? "--status-critical" : null} />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Compliance by Project (worst first)</h3>
        <div className="attention-list">
          {projectGroups.map((g) => {
            const project = projectsById[g.key];
            const clickable = !!(project && window.PCC.portfolio);
            return (
              <ComplianceRow
                key={g.key}
                label={project ? project.name || "(unnamed project)" : "(deleted project)"}
                group={g}
                onClick={clickable ? () => viewProjectOnPortfolio(project.id) : null}
              />
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Compliance by Document Type (worst first)</h3>
        <div className="attention-list">
          {typeGroups.map((g) => {
            const t = typesById[g.key];
            const label = t ? t.name + (t.code ? ` (${t.code})` : "") : "(deleted type)";
            return <ComplianceRow key={g.key} label={label} group={g} onClick={null} />;
          })}
        </div>
      </div>
    </>
  );
}
