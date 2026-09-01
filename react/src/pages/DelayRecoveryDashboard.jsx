/* Delay & Recovery Dashboard, migrated to React as part of the page-by-page migration
 * (Post-Phase-5 Engineering Evolution). Reproduces the prior vanilla page's exact text,
 * KPI/panel/badge structure and CSS class names (kpi-grid/kpi-card/panel/status-badge/
 * toolbar/btn/btn--ghost/text-secondary) — same visual result, only the implementation
 * moved. See src/js/pages/delayRecoveryDashboard.js (now a ~10-line stub) for the router
 * registration; there is no separate public API to preserve, same as Organizations.
 *
 * Read-only rollup page — only local UI state is the Delay Register's own Status filter.
 * All store/engine reads go through delayRecoveryDashboardService.js (master prompt §9);
 * criticality is read via the cheap, cached delayImpactEngine.computeDelayImpact() only,
 * never a portfolio-wide computeProjectFinishImpact() loop (see the service module's own
 * header comment).
 */
import React, { useState } from "react";
import {
  RECOVERY_ACTION_STATUS_LABELS,
  DELAY_CAUSE_LABELS,
  DELAY_STATUS_LABELS,
  DELAY_STATUS_BADGE_CLASS,
  DELAY_CATEGORY_LABELS,
  DELAY_RESPONSIBILITY_LABELS,
  DELAY_CRITICALITY_LABELS,
  DELAY_CRITICALITY_BADGE_CLASS,
  getData,
  delayRecordStatuses,
  delayCategories,
  delayResponsibilityClassifications,
  delayRecordCauses,
  delaySeverityBucket,
  delayCriticality,
  recoveryActionOverdue,
  fmtMoney,
  viewActivityInSchedule,
  viewProjectInPortfolio,
} from "../services/delayRecoveryDashboardService.js";

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

function ViewInScheduleBtn({ activity }) {
  return (
    <button className="btn btn--ghost" onClick={() => viewActivityInSchedule(activity)}>
      View in Schedule
    </button>
  );
}

function ActionRow({ r, activity, project, showBadge }) {
  const overdue = recoveryActionOverdue(r);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid var(--divider)",
        fontSize: "var(--text-sm)",
      }}
    >
      <div>
        <strong>{r.description}</strong>
        <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {activity ? activity.name : "(deleted activity)"} — {project ? project.name || "(unnamed project)" : "(deleted project)"}
        </p>
        <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {r.responsible_person ? r.responsible_person + " · " : ""}
          {r.target_recovery_date ? "target " + r.target_recovery_date : "no target date"}
          {r.estimated_recovery_days != null ? " · est. " + r.estimated_recovery_days + "d recovery" : ""}
          {fmtMoney(r.estimated_cost) != null ? " · est. cost " + fmtMoney(r.estimated_cost) : ""}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {showBadge ? (
          <span
            className={
              "status-badge status-badge--" +
              (overdue ? "critical" : r.status === "completed" ? "complete" : r.status === "cancelled" ? "info" : "at_risk")
            }
            style={{ fontSize: "var(--text-xs)" }}
          >
            {overdue ? "Overdue" : RECOVERY_ACTION_STATUS_LABELS[r.status]}
          </span>
        ) : null}
        {activity ? <ViewInScheduleBtn activity={activity} /> : null}
      </div>
    </div>
  );
}

function AnalyticsLine({ label, orderedKeys, counts, labelMap, noBottomMargin }) {
  return (
    <p style={{ fontSize: "var(--text-sm)", marginBottom: noBottomMargin ? 0 : 8 }}>
      <strong>{label}:</strong>{" "}
      {orderedKeys
        .filter((k) => counts[k])
        .map((k) => (labelMap[k] || k) + " (" + counts[k] + ")")
        .join(" · ")}
    </p>
  );
}

function DelayRegisterRow({ r, data, activitiesById, projectsById }) {
  const activity = r.activity_id ? activitiesById[r.activity_id] : null;
  const project = projectsById[r.project_id];
  const activityLine = !r.activity_id ? "Schedule Impact Not Yet Assessed" : activity ? activity.name : "(deleted activity)";
  const criticality = delayCriticality(r, data);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid var(--divider)",
        fontSize: "var(--text-sm)",
      }}
    >
      <div>
        <strong>{r.description}</strong>
        <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {activityLine} — {project ? project.name || "(unnamed project)" : "(deleted project)"}
        </p>
        <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {DELAY_CAUSE_LABELS[r.delay_cause]}
          {r.delay_days != null ? " · " + r.delay_days + "d (" + delaySeverityBucket(r.delay_days) + ")" : ""}
        </p>
        <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {DELAY_STATUS_LABELS[r.status] || r.status} · {DELAY_CATEGORY_LABELS[r.delay_category] || r.delay_category || "Other"} ·{" "}
          {DELAY_RESPONSIBILITY_LABELS[r.responsibility_classification] || "Unconfirmed"}
          {criticality ? " · " + DELAY_CRITICALITY_LABELS[criticality] : ""}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span className={"status-badge status-badge--" + (r.is_excusable ? "complete" : "at_risk")} style={{ fontSize: "var(--text-xs)" }}>
          {r.is_excusable ? "Excusable" : "Non-Excusable"}
        </span>
        <span className={"status-badge status-badge--" + (DELAY_STATUS_BADGE_CLASS[r.status] || "info")} style={{ fontSize: "var(--text-xs)" }}>
          {DELAY_STATUS_LABELS[r.status] || r.status}
        </span>
        {criticality ? (
          <span className={"status-badge status-badge--" + DELAY_CRITICALITY_BADGE_CLASS[criticality]} style={{ fontSize: "var(--text-xs)" }}>
            {DELAY_CRITICALITY_LABELS[criticality]}
          </span>
        ) : null}
        {activity ? (
          <ViewInScheduleBtn activity={activity} />
        ) : project ? (
          <button className="btn btn--ghost" onClick={() => viewProjectInPortfolio(project.id)}>
            View Project
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GapRow({ g }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid var(--divider)",
        fontSize: "var(--text-sm)",
      }}
    >
      <div>
        <strong>{g.activity ? g.activity.name : "(deleted activity)"}</strong>
        <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {g.project ? g.project.name || "(unnamed project)" : "(deleted project)"}
        </p>
        <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {g.delayDays}d delay, {g.recoveryDays}d recovery estimated ({g.gapDays}d unaddressed)
        </p>
      </div>
      {g.activity ? (
        <div style={{ flexShrink: 0 }}>
          <ViewInScheduleBtn activity={g.activity} />
        </div>
      ) : null}
    </div>
  );
}

export default function DelayRecoveryDashboardPage() {
  const [data] = useState(() => getData());
  const [registerStatusFilter, setRegisterStatusFilter] = useState("");

  const activeProjectIds = {};
  data.projects.forEach((p) => {
    if (!p.archived) activeProjectIds[p.id] = true;
  });
  const projectsById = {};
  data.projects.forEach((p) => {
    projectsById[p.id] = p;
  });
  const activitiesById = {};
  data.activities.forEach((a) => {
    activitiesById[a.id] = a;
  });

  const actions = data.recovery_actions.filter((r) => activeProjectIds[r.project_id]);
  const delayRecords = data.delay_records.filter((r) => activeProjectIds[r.project_id]);

  if (actions.length === 0 && delayRecords.length === 0) {
    return (
      <>
        <h2 style={{ marginBottom: 4 }}>Delay & Recovery Dashboard</h2>
        <p className="text-secondary" style={{ marginTop: 0, marginBottom: 24 }}>
          Nothing logged across the active portfolio yet — add a recovery action or delay record from an activity's own Detail
          Panel in the Schedule module (Gantt tab).
        </p>
        <div className="panel empty-state">
          Nothing to show yet. Once activities have recovery actions or delay records logged against them, this dashboard will
          roll them up.
        </div>
      </>
    );
  }

  const activeCount = Object.keys(activeProjectIds).length;

  let delaySection = null;
  if (delayRecords.length > 0) {
    const totalDelayDays = delayRecords.reduce((sum, r) => sum + (r.delay_days || 0), 0);
    const excusableCount = delayRecords.filter((r) => r.is_excusable).length;

    const byCause = {};
    const bySeverity = {};
    delayRecords.forEach((r) => {
      const cause = r.delay_cause || "other";
      byCause[cause] = (byCause[cause] || 0) + 1;
      const bucket = delaySeverityBucket(r.delay_days);
      bySeverity[bucket] = (bySeverity[bucket] || 0) + 1;
    });
    const severityOrder = ["Severe (>15d)", "Moderate (5-15d)", "Minor (<5d)", "Unspecified"];

    const byStatus = {};
    const byCategory = {};
    const byResponsibility = {};
    const byCriticality = {};
    delayRecords.forEach((r) => {
      const status = r.status || "open";
      byStatus[status] = (byStatus[status] || 0) + 1;
      const category = r.delay_category || "other";
      byCategory[category] = (byCategory[category] || 0) + 1;
      const responsibility = r.responsibility_classification || "unconfirmed";
      byResponsibility[responsibility] = (byResponsibility[responsibility] || 0) + 1;
      const criticality = delayCriticality(r, data) || "not_calculated";
      byCriticality[criticality] = (byCriticality[criticality] || 0) + 1;
    });

    const registerRecords = registerStatusFilter ? delayRecords.filter((r) => r.status === registerStatusFilter) : delayRecords;
    const sortedRegisterRecords = registerRecords.slice().sort((a, b) => (b.delay_days || 0) - (a.delay_days || 0));

    const openActionsForGap = actions.filter((r) => r.status === "open" || r.status === "in_progress");
    const gapDelayByActivity = {};
    delayRecords.forEach((r) => {
      gapDelayByActivity[r.activity_id] = (gapDelayByActivity[r.activity_id] || 0) + (r.delay_days || 0);
    });
    const gapRecoveryByActivity = {};
    openActionsForGap.forEach((r) => {
      gapRecoveryByActivity[r.activity_id] = (gapRecoveryByActivity[r.activity_id] || 0) + (r.estimated_recovery_days || 0);
    });
    const gapActivities = [];
    let totalUnaddressedGapDays = 0;
    Object.keys(gapDelayByActivity).forEach((activityId) => {
      const gapDelayDays = gapDelayByActivity[activityId];
      const gapRecoveryDays = gapRecoveryByActivity[activityId] || 0;
      const gapDays = Math.max(0, gapDelayDays - gapRecoveryDays);
      totalUnaddressedGapDays += gapDays;
      if (gapDays > 0) {
        const gapActivity = activitiesById[activityId];
        const gapProject = gapActivity ? projectsById[gapActivity.project_id] : null;
        gapActivities.push({ activity: gapActivity, project: gapProject, delayDays: gapDelayDays, recoveryDays: gapRecoveryDays, gapDays: gapDays });
      }
    });
    gapActivities.sort((a, b) => b.gapDays - a.gapDays);

    delaySection = (
      <>
        <div className="kpi-grid">
          <KpiCard label="DELAY RECORDS" value={delayRecords.length} />
          <KpiCard label="TOTAL DELAY DAYS" value={totalDelayDays} colorVar={totalDelayDays > 0 ? "--status-critical" : null} />
          <KpiCard label="EXCUSABLE" value={excusableCount} />
          <KpiCard label="NON-EXCUSABLE" value={delayRecords.length - excusableCount} />
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Delay Analysis — by Cause and Severity</h3>
          <p style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
            <strong>By cause:</strong>{" "}
            {delayRecordCauses()
              .filter((c) => byCause[c])
              .map((c) => DELAY_CAUSE_LABELS[c] + " (" + byCause[c] + ")")
              .join(" · ")}
          </p>
          <p style={{ fontSize: "var(--text-sm)" }}>
            <strong>By severity:</strong>{" "}
            {severityOrder
              .filter((s) => bySeverity[s])
              .map((s) => s + " (" + bySeverity[s] + ")")
              .join(" · ")}
          </p>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Delay Analytics — Status, Category, Responsibility &amp; Criticality</h3>
          <AnalyticsLine label="By status" orderedKeys={delayRecordStatuses()} counts={byStatus} labelMap={DELAY_STATUS_LABELS} />
          <AnalyticsLine label="By category" orderedKeys={delayCategories()} counts={byCategory} labelMap={DELAY_CATEGORY_LABELS} />
          <AnalyticsLine
            label="By responsibility"
            orderedKeys={delayResponsibilityClassifications()}
            counts={byResponsibility}
            labelMap={DELAY_RESPONSIBILITY_LABELS}
          />
          <AnalyticsLine
            label="By criticality"
            orderedKeys={["critical", "near_critical", "non_critical", "not_calculated"]}
            counts={byCriticality}
            labelMap={{ critical: "Critical", near_critical: "Near Critical", non_critical: "Non-Critical", not_calculated: "Not Yet Calculated" }}
            noBottomMargin
          />
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Delay Records (worst first)</h3>
          <div className="toolbar no-print" style={{ marginBottom: 8 }}>
            <select value={registerStatusFilter} onChange={(e) => setRegisterStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {delayRecordStatuses().map((s) => (
                <option key={s} value={s}>
                  {DELAY_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          {sortedRegisterRecords.length === 0 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              No delay records match this status filter.
            </p>
          ) : (
            sortedRegisterRecords.map((r) => (
              <DelayRegisterRow key={r.id} r={r} data={data} activitiesById={activitiesById} projectsById={projectsById} />
            ))
          )}
        </div>

        <div className="kpi-grid" style={{ marginTop: 12 }}>
          <KpiCard label="UNADDRESSED DELAY (DAYS)" value={totalUnaddressedGapDays} colorVar={totalUnaddressedGapDays > 0 ? "--status-critical" : null} />
        </div>

        {gapActivities.length > 0 ? (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Activities With Unaddressed Delay (worst first)</h3>
            {gapActivities.map((g, i) => (
              <GapRow key={g.activity ? g.activity.id : i} g={g} />
            ))}
          </div>
        ) : null}
      </>
    );
  } else {
    delaySection = <div className="panel empty-state" style={{ marginBottom: 16 }}>No delay records logged across the active portfolio yet.</div>;
  }

  if (actions.length === 0) {
    return (
      <>
        <h2 style={{ marginBottom: 4 }}>Delay & Recovery Dashboard</h2>
        <p className="text-secondary" style={{ marginTop: 0, marginBottom: 24 }}>
          Portfolio-wide recovery actions and delay records across {activeCount} active project{activeCount === 1 ? "" : "s"}.
          Finish-variance/float-erosion analysis itself stays in each schedule's own Baselines tab.
        </p>
        {delaySection}
        <div className="panel empty-state">No recovery actions logged across the active portfolio yet.</div>
      </>
    );
  }

  const open = actions.filter((r) => r.status === "open" || r.status === "in_progress");
  const closed = actions.filter((r) => r.status === "completed" || r.status === "cancelled");
  const overdueCount = open.filter(recoveryActionOverdue).length;

  const openSorted = open.slice().sort((a, b) => {
    const aOverdue = recoveryActionOverdue(a);
    const bOverdue = recoveryActionOverdue(b);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    const aDate = a.target_recovery_date || "9999-99-99";
    const bDate = b.target_recovery_date || "9999-99-99";
    return aDate.localeCompare(bDate);
  });

  const estDaysTotal = open.reduce((sum, r) => sum + (r.estimated_recovery_days || 0), 0);
  const estCostTotal = open.reduce((sum, r) => sum + (r.estimated_cost || 0), 0);

  const closedSorted = closed.slice().sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>Delay & Recovery Dashboard</h2>
      <p className="text-secondary" style={{ marginTop: 0, marginBottom: 24 }}>
        Portfolio-wide recovery actions and delay records across {activeCount} active project{activeCount === 1 ? "" : "s"}.
        Finish-variance/float-erosion analysis itself stays in each schedule's own Baselines tab.
      </p>

      {delaySection}

      <div className="kpi-grid">
        <KpiCard label="TOTAL RECOVERY ACTIONS" value={actions.length} />
        <KpiCard label="OPEN" value={open.length} />
        <KpiCard label="OVERDUE" value={overdueCount} colorVar={overdueCount > 0 ? "--status-critical" : null} />
        <KpiCard label="COMPLETED" value={actions.filter((r) => r.status === "completed").length} />
      </div>

      {estDaysTotal > 0 || estCostTotal > 0 ? (
        <div className="kpi-grid" style={{ marginTop: 12 }}>
          <KpiCard label="EST. RECOVERY DAYS (OPEN)" value={estDaysTotal} />
          <KpiCard label="EST. RECOVERY COST (OPEN)" value={fmtMoney(estCostTotal) || "0"} />
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Open Recovery Actions (overdue first)</h3>
        {openSorted.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
            No open recovery actions — every logged action has been completed or cancelled.
          </p>
        ) : (
          openSorted.map((r) => (
            <ActionRow key={r.id} r={r} activity={activitiesById[r.activity_id]} project={projectsById[r.project_id]} showBadge />
          ))
        )}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Completed / Cancelled ({closed.length})</h3>
        {closed.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
            None yet.
          </p>
        ) : (
          closedSorted.map((r) => (
            <ActionRow key={r.id} r={r} activity={activitiesById[r.activity_id]} project={projectsById[r.project_id]} showBadge />
          ))
        )}
      </div>
    </>
  );
}
