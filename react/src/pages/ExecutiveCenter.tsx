import React, { useState } from "react";
import {
  RAG_LABELS,
  RAG_COLOR_VAR,
  SEVERITY_LABEL,
  DIAGNOSTICS_ICON_CLASS,
  ACTIVITY_STATUS_LABEL_MAP,
  SUMMARY_SECTIONS,
  getData,
  today,
  fmtMoney,
  fmtPct,
  riskSeverity,
  buildProjectContext,
  healthContextFrom,
  diagnosticsContextFrom,
  floatDistributionBuckets,
  saveExecutiveSummarySection,
  resetExecutiveSummarySection,
  saveHealthWeight,
  captureSchedulePerformanceSnapshot,
  overallRating,
  captureSnapshot,
  deltaMarker,
  saveWeeklyReview,
  deleteWeeklyReview,
  saveNewPackTemplate,
  updatePackTemplate,
  deletePackTemplate,
  navigateToLink,
  viewActivityInSchedule,
  viewBaselines,
  getProjectContext,
  setProjectContext,
} from "../services/executiveCenterService";
import type {
  PCCStoreData,
  PCCProject,
  PCCActivity,
  PCCRisk,
  PCCWeeklyReview,
  WeeklyReviewSnapshot,
  PopulatedProjectContext,
  HealthScoreResult,
  DiagnosticAlert,
  NamedRef,
} from "../types/pcc";

// ===== Small shared pieces =====

function RagBadge({ rag }: { rag: string | null | undefined }) {
  var cls = rag === "on_track" ? "on_track" : rag === "at_risk" ? "at_risk" : rag === "critical" ? "critical" : "info";
  return <span className={"status-badge status-badge--" + cls}>{RAG_LABELS[rag || ""] || rag}</span>;
}

interface KpiCardProps {
  label: string;
  value: string | number | null | undefined;
  colorVar?: string | null;
}

function KpiCard({ label, value, colorVar }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value mono" style={colorVar ? { color: "var(" + colorVar + ")" } : undefined}>
        {value === null || value === undefined || value === "" ? "—" : value}
      </span>
    </div>
  );
}

interface KpiSectionProps {
  title: string;
  kpis: KpiCardProps[];
  footnote?: string | null;
}

function KpiSection({ title, kpis, footnote }: KpiSectionProps) {
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <h4 className="text-secondary" style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-sm)", letterSpacing: 1 }}>
        {title}
      </h4>
      <div className="kpi-grid">
        {kpis.map((k, i) => (
          <KpiCard key={i} label={k.label} value={k.value} colorVar={k.colorVar} />
        ))}
      </div>
      {footnote ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: -6 }}>
          {footnote}
        </p>
      ) : null}
    </div>
  );
}

function KpiEmptySection({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <h4 className="text-secondary" style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-sm)", letterSpacing: 1 }}>
        {title}
      </h4>
      <div className="panel empty-state">{message}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ flex: "1 1 320px", minWidth: 280 }}>
      <h4 style={{ marginBottom: "var(--space-3)" }}>{title}</h4>
      {children}
    </div>
  );
}

function NoDataNote({ text }: { text?: string }) {
  return (
    <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
      {text || "No data available."}
    </p>
  );
}

// ===== Chart components — plain SVG, no charting library =====

interface ChartItem {
  label: string;
  value: number;
  color?: string;
}

function HorizontalBarChart({ items, labelWidth }: { items: ChartItem[]; labelWidth?: number }) {
  var nonZero = items.filter((i) => i.value > 0);
  if (nonZero.length === 0) return <NoDataNote />;
  var maxVal = Math.max.apply(null, items.map((i) => i.value));
  var rowH = 26;
  var labelW = labelWidth || 130;
  var chartW = 260;
  var height = items.length * rowH + 6;
  return (
    <svg width={labelW + chartW + 40} height={height} style={{ display: "block", maxWidth: "100%" }}>
      {items.map((item, i) => {
        var y = i * rowH;
        var barMaxW = chartW - 4;
        var w = maxVal > 0 ? (item.value / maxVal) * barMaxW : 0;
        return (
          <g key={i}>
            <text x={0} y={y + rowH / 2 + 4} fontSize={11} fill="var(--text-primary)">
              {item.label}
            </text>
            <rect x={labelW} y={y + 4} width={Math.max(w, item.value > 0 ? 2 : 0)} height={rowH - 10} rx={2} fill={item.color || "var(--status-info)"} />
            <text x={labelW + Math.max(w, 2) + 6} y={y + rowH / 2 + 4} fontSize={11} fill="var(--text-secondary)">
              {item.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ items }: { items: ChartItem[] }) {
  var total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return <NoDataNote />;
  var size = 140;
  var r = 52;
  var cx = size / 2;
  var cy = size / 2;
  var circumference = 2 * Math.PI * r;
  var offset = 0;
  var arcs: React.ReactNode[] = [];
  items.forEach((item) => {
    if (item.value <= 0) return;
    var frac = item.value / total;
    var dash = frac * circumference;
    arcs.push(
      <circle
        key={item.label}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={item.color}
        strokeWidth={18}
        strokeDasharray={dash + " " + (circumference - dash)}
        strokeDashoffset={-offset}
        transform={"rotate(-90 " + cx + " " + cy + ")"}
      />
    );
    offset += dash;
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--divider)" strokeWidth={18} />
        {arcs}
        <text x={cx} y={cy + 5} fontSize={20} fontWeight="700" textAnchor="middle" fill="var(--text-primary)">
          {total}
        </text>
      </svg>
      <div style={{ fontSize: "var(--text-sm)" }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, display: "inline-block" }} />
            <span className="text-secondary">
              {item.label}: {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

var RISK_LEVELS = ["low", "medium", "high"];
var SEVERITY_MATRIX: { [probability: string]: { [impact: string]: string } } = {
  high: { low: "medium", medium: "high", high: "high" },
  medium: { low: "low", medium: "medium", high: "high" },
  low: { low: "low", medium: "low", high: "medium" },
};

function RiskHeatMapMini({ risks }: { risks: PCCRisk[] }) {
  if (risks.length === 0) return <NoDataNote />;
  var counts: { [key: string]: number } = {};
  risks.forEach((r) => {
    var key = r.probability + ":" + r.impact;
    counts[key] = (counts[key] || 0) + 1;
  });
  var levelColors: { [severity: string]: string } = { high: "var(--status-critical)", medium: "var(--status-at-risk)", low: "var(--status-on-track)" };
  return (
    <>
      <table style={{ borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
        <tbody>
          {RISK_LEVELS.slice()
            .reverse()
            .map((prob) => (
              <tr key={prob}>
                <td className="text-secondary" style={{ padding: "var(--space-1) var(--space-2)" }}>
                  {prob.toUpperCase()}
                </td>
                {RISK_LEVELS.map((impact) => {
                  var sev = SEVERITY_MATRIX[prob][impact];
                  var count = counts[prob + ":" + impact] || 0;
                  return (
                    <td
                      key={impact}
                      style={{
                        width: 48,
                        height: 36,
                        textAlign: "center",
                        border: "1px solid var(--divider)",
                        background: levelColors[sev],
                        opacity: 0.25,
                        position: "relative",
                      }}
                    >
                      <div style={{ position: "relative", zIndex: 1, fontWeight: 700, opacity: 1, color: "var(--text-primary)" }}>{count || ""}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          <tr>
            <td />
            {RISK_LEVELS.map((impact) => (
              <td key={impact} className="text-secondary" style={{ textAlign: "center", fontSize: "var(--text-xs)" }}>
                {impact.toUpperCase()}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-2)" }}>
        Rows: Probability · Columns: Impact
      </p>
    </>
  );
}

function MilestoneTimelineMini({ milestones, todayIso }: { milestones: (NamedRef & { date: string })[]; todayIso: string }) {
  if (milestones.length === 0) return <NoDataNote text="No upcoming milestones." />;
  var diffDays = window.PCC.scheduleGanttLayout.diffDays;
  var sorted = milestones.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  var minDate = sorted[0].date < todayIso ? sorted[0].date : todayIso;
  var maxDate = sorted[sorted.length - 1].date;
  var totalDays = Math.max(1, diffDays(minDate, maxDate));
  var width = 480;
  var height = 60 + sorted.length * 18;
  return (
    <svg width={width} height={height} style={{ display: "block", maxWidth: "100%" }}>
      <line x1={10} y1={20} x2={width - 10} y2={20} stroke="var(--divider)" strokeWidth={2} />
      {sorted.map((m, i) => {
        var x = 10 + (diffDays(minDate, m.date) / totalDays) * (width - 20);
        return (
          <g key={m.id}>
            <circle cx={x} cy={20} r={5} fill="var(--signal-amber)" />
            <text x={x} y={40 + (i % 3) * 16} fontSize={10} textAnchor="middle" fill="var(--text-secondary)">
              {(m.name || "").length > 18 ? (m.name as string).slice(0, 17) + "…" : m.name}
            </text>
            <text x={x} y={52 + (i % 3) * 16} fontSize={9} textAnchor="middle" fill="var(--text-secondary)">
              {m.date}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface SCurveChartProps {
  activities: PCCActivity[];
  referenceDate: string;
  todayIso: string;
  snapshots: { captured_at?: string; schedule_progress_pct?: number | null }[];
}

function SCurveChart({ activities, referenceDate, todayIso, snapshots }: SCurveChartProps) {
  var dated = activities.filter((a): a is PCCActivity & { planned_start: string; planned_finish: string } => !!a.planned_start && !!a.planned_finish);
  if (dated.length === 0) return <NoDataNote text="No activities with planned dates yet." />;
  var diffDays = window.PCC.scheduleGanttLayout.diffDays;
  var addDays = window.PCC.scheduleGanttLayout.addDays;
  var rangeStart = dated.reduce((min, a) => (a.planned_start < min ? a.planned_start : min), dated[0].planned_start);
  var rangeEnd = dated.reduce((max, a) => (a.planned_finish > max ? a.planned_finish : max), dated[0].planned_finish);
  var totalWeight = dated.reduce((s, a) => s + ((a as any).duration || diffDays(a.planned_start, a.planned_finish) || 1), 0);
  if (totalWeight <= 0) return <NoDataNote />;

  var totalSpan = Math.max(1, diffDays(rangeStart, rangeEnd));
  var steps = Math.min(40, totalSpan);
  var points: { day: string; pct: number }[] = [];
  for (var s = 0; s <= steps; s++) {
    var day = addDays(rangeStart, Math.round((s / steps) * totalSpan));
    var cum = 0;
    dated.forEach((a) => {
      var dur = (a as any).duration || diffDays(a.planned_start, a.planned_finish) || 1;
      var frac;
      if (day <= a.planned_start) frac = 0;
      else if (day >= a.planned_finish) frac = 1;
      else frac = diffDays(a.planned_start, day) / (diffDays(a.planned_start, a.planned_finish) || 1);
      cum += dur * frac;
    });
    points.push({ day: day, pct: (cum / totalWeight) * 100 });
  }

  var width = 480;
  var height = 200;
  var padL = 34;
  var padB = 20;
  var plotW = width - padL - 10;
  var plotH = height - padB - 10;
  function xFor(day: string) {
    return padL + (diffDays(rangeStart, day) / totalSpan) * plotW;
  }
  function yFor(pct: number) {
    return 10 + plotH - (pct / 100) * plotH;
  }

  var pathD = points.map((p, i) => (i === 0 ? "M " : "L ") + xFor(p.day) + " " + yFor(p.pct)).join(" ");

  var actualPoints = (snapshots || [])
    .filter((sn) => sn.schedule_progress_pct != null && (sn.captured_at || "").slice(0, 10) >= rangeStart && (sn.captured_at || "").slice(0, 10) <= rangeEnd)
    .map((sn) => ({ day: (sn.captured_at || "").slice(0, 10), pct: sn.schedule_progress_pct as number }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  var actualPathD = actualPoints.length ? actualPoints.map((ap, i) => (i === 0 ? "M " : "L ") + xFor(ap.day) + " " + yFor(ap.pct)).join(" ") : "";

  return (
    <div>
      <svg width={width} height={height} style={{ display: "block", maxWidth: "100%" }}>
        {[0, 25, 50, 75, 100].map((pct) => {
          var y = yFor(pct);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={width - 10} y2={y} stroke="var(--grid-line)" strokeWidth={1} />
              <text x={2} y={y + 3} fontSize={9} fill="var(--text-secondary)">
                {pct}%
              </text>
            </g>
          );
        })}
        <path d={pathD} fill="none" stroke="var(--status-info)" strokeWidth={2} />
        {referenceDate >= rangeStart && referenceDate <= rangeEnd ? (
          <line x1={xFor(referenceDate)} y1={10} x2={xFor(referenceDate)} y2={10 + plotH} stroke="var(--signal-amber)" strokeWidth={1.5} strokeDasharray="3,3" />
        ) : null}
        {actualPoints.length > 0 ? (
          <>
            <path d={actualPathD} fill="none" stroke="var(--status-on-track)" strokeWidth={2} />
            {actualPoints.map((ap, i) => (
              <circle key={i} cx={xFor(ap.day)} cy={yFor(ap.pct)} r={3} fill="var(--status-on-track)" />
            ))}
          </>
        ) : null}
      </svg>
      <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
        {actualPoints.length > 0
          ? "Planned cumulative progress (blue), duration-weighted across " +
            dated.length +
            " dated activity(ies), vs. actual progress (green) from " +
            actualPoints.length +
            " captured Schedule Performance snapshot(s). Dashed line: data date."
          : "Planned cumulative progress, duration-weighted across " +
            dated.length +
            " dated activity(ies). Dashed line: data date. Capture a Schedule Performance snapshot (below) to start plotting actual progress here."}
      </p>
    </div>
  );
}

function HealthGaugeSvg({ score, rag }: { score: number | null; rag: string | null }) {
  var size = 160;
  var r = 64;
  var cx = size / 2;
  var cy = size / 2 + 10;
  var circumference = Math.PI * r;
  var frac = score != null ? score / 100 : 0;
  var dash = frac * circumference;
  return (
    <svg width={size} height={size / 2 + 30} viewBox={"0 0 " + size + " " + (size / 2 + 30)}>
      <path d={"M " + (cx - r) + " " + cy + " A " + r + " " + r + " 0 0 1 " + (cx + r) + " " + cy} fill="none" stroke="var(--divider)" strokeWidth={16} strokeLinecap="round" />
      {score != null ? (
        <path
          d={"M " + (cx - r) + " " + cy + " A " + r + " " + r + " 0 0 1 " + (cx + r) + " " + cy}
          fill="none"
          stroke={"var(" + RAG_COLOR_VAR[rag || ""] + ")"}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={dash + " " + (circumference - dash)}
        />
      ) : null}
      <text x={cx} y={cy - 6} fontSize={28} fontWeight="700" textAnchor="middle" fill="var(--text-primary)">
        {score == null ? "—" : String(score)}
      </text>
    </svg>
  );
}

// ===== Detail item helper =====

function DetailItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <span className="detail-item__label">{label}</span>
      <div>{value === null || value === undefined || value === "" ? "—" : value}</div>
    </div>
  );
}

// ===== Health Score panel (with configurable weights) =====

function HealthScorePanel({ health, onChanged }: { health: HealthScoreResult; onChanged: () => void }) {
  const [editingWeights, setEditingWeights] = useState(false);
  return (
    <div className="panel" style={{ marginTop: "var(--space-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Project Health Score</h3>
        <button className="btn btn--ghost no-print" onClick={() => setEditingWeights((v) => !v)}>
          {editingWeights ? "Done" : "Configure Weights"}
        </button>
      </div>
      <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ textAlign: "center" }}>
          <HealthGaugeSvg score={health.score} rag={health.rag} />
          <div>
            <RagBadge rag={health.rag} />
          </div>
        </div>
        <div style={{ flex: "1 1 320px", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 420, fontSize: "var(--text-sm)", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Factor", "Weight", "Score", "Contribution", "Why"].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--divider)", padding: "var(--space-1) var(--space-2)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {health.breakdown.map((f) => (
                <tr key={f.key}>
                  <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)", verticalAlign: "top" }}>{f.label}</td>
                  {editingWeights ? (
                    <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)" }}>
                      <input
                        type="number"
                        min="0"
                        style={{ width: 56 }}
                        defaultValue={f.weight}
                        onChange={(e) => {
                          saveHealthWeight(f.key, e.target.value);
                          onChanged();
                        }}
                      />
                    </td>
                  ) : (
                    <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)", verticalAlign: "top" }}>
                      {f.weight + (f.weightPct ? " (" + f.weightPct.toFixed(0) + "% used)" : "")}
                    </td>
                  )}
                  <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)", verticalAlign: "top" }}>
                    {f.available && f.score != null ? f.score.toFixed(0) : "n/a"}
                  </td>
                  <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)", verticalAlign: "top" }}>
                    {f.available ? f.contribution.toFixed(1) : "—"}
                  </td>
                  <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)", verticalAlign: "top" }}>{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-2)" }}>
            Score = weighted average of each available factor's 0–100 sub-score (weights re-normalized over just the factors with real data — a project with no
            budget set yet doesn't get penalized for a missing Cost factor). Edit weights above; they apply to every project.
          </p>
        </div>
      </div>
    </div>
  );
}

// ===== Diagnostics panel =====

function DiagnosticsPanel({ diagnostics, projectId }: { diagnostics: DiagnosticAlert[]; projectId: string }) {
  return (
    <div className="panel" style={{ marginTop: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-3)" }}>Project Health Diagnostics ({diagnostics.length})</h3>
      {diagnostics.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          No rule-based alerts right now.
        </p>
      ) : (
        <div className="attention-list">
          {diagnostics.map((a, i) => (
            <div
              key={i}
              className={"attention-item" + (a.link && a.link.module ? " attention-item--clickable" : "")}
              onClick={a.link && a.link.module ? () => navigateToLink(a.link, projectId) : undefined}
            >
              <span className={"attention-item__icon attention-item__icon--" + (DIAGNOSTICS_ICON_CLASS[a.severity] || "info")} />
              <div className="attention-item__body">
                <div className="attention-item__text">{a.description}</div>
                <div className="attention-item__meta">
                  {SEVERITY_LABEL[a.severity]} · {a.source}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Executive Summary panel =====

function ExecutiveSummaryPanel({ data, ctx, onChanged }: { data: PCCStoreData; ctx: PopulatedProjectContext; onChanged: () => void }) {
  var summaryRecord = data.executive_summaries.find((s) => s.project_id === ctx.project.id);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="panel" style={{ marginTop: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-3)" }}>Executive Summary</h3>
      <p className="text-secondary no-print" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-3)" }}>
        Generated from real project data below. Edit any section to override it before printing/exporting; overrides are saved and persist until reset.
      </p>
      {SUMMARY_SECTIONS.map((section) => {
        var override = summaryRecord ? (summaryRecord as any)[section.overrideKey] : "";
        var autoText = section.auto(ctx);
        var displayText = override || autoText;
        var isEditing = editingSection === section.key;
        return (
          <div key={section.key} style={{ marginBottom: "var(--space-4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "var(--text-sm)" }}>
                {section.label.toUpperCase()}
                {override ? " (edited)" : ""}
              </strong>
              {!isEditing ? (
                <button
                  className="btn btn--ghost no-print"
                  onClick={() => {
                    setDraft(displayText);
                    setEditingSection(section.key);
                  }}
                >
                  Edit
                </button>
              ) : null}
            </div>
            {isEditing ? (
              <>
                <textarea rows={3} style={{ width: "100%", marginTop: "var(--space-2)" }} value={draft} onChange={(e) => setDraft(e.target.value)} />
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                  <button
                    className="btn btn--primary"
                    onClick={() => {
                      saveExecutiveSummarySection(ctx.project.id, section.overrideKey, draft);
                      setEditingSection(null);
                      onChanged();
                    }}
                  >
                    Save
                  </button>
                  {override ? (
                    <button
                      className="btn btn--ghost"
                      onClick={() => {
                        resetExecutiveSummarySection(ctx.project.id, section.overrideKey);
                        setEditingSection(null);
                        onChanged();
                      }}
                    >
                      Reset to Auto-generated
                    </button>
                  ) : null}
                  <button className="btn btn--ghost" onClick={() => setEditingSection(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>{displayText}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===== Recent Activity / Upcoming Items =====

interface TimelineItem {
  date: string | undefined;
  text: string;
}

function RecentActivityPanel({ ctx }: { ctx: PopulatedProjectContext }) {
  var items: TimelineItem[] = [];
  ctx.activities.forEach((a) => items.push({ date: a.updated_at, text: "Activity “" + a.name + "” updated" + (a.status === "complete" ? " (completed)" : "") }));
  ctx.allRisks.forEach((r) =>
    items.push({ date: r.updated_at, text: (r.type === "risk" ? "Risk" : r.type === "issue" ? "Issue" : "Opportunity") + " “" + r.title + "” " + (r.status === "closed" ? "closed" : "logged/updated") })
  );
  ctx.meetings.forEach((m) => items.push({ date: m.updated_at, text: "Meeting “" + (m.title || "(untitled)") + "” logged" }));
  ctx.allRfis.forEach((r) => items.push({ date: r.updated_at, text: r.number + " " + (r.status === "answered" ? "answered" : r.status === "closed" ? "closed" : "submitted") }));
  ctx.allChangeOrders.forEach((co) => items.push({ date: co.updated_at, text: co.number + " " + co.status }));
  ctx.documents.forEach((d) => items.push({ date: d.uploaded_at, text: "Document “" + d.filename + "” uploaded" }));
  ctx.dailyLogs.forEach((l) => items.push({ date: l.updated_at || l.created_at, text: "Daily Log entry for " + l.log_date }));
  var sortedItems = items
    .filter((i) => i.date)
    .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())
    .slice(0, 12);

  return (
    <ChartCard title="Recent Activity">
      {sortedItems.length === 0 ? (
        <NoDataNote text="No activity recorded yet." />
      ) : (
        sortedItems.map((i, idx) => (
          <div key={idx} style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
            <span className="text-secondary">{new Date(i.date as string).toLocaleDateString()}</span> — {i.text}
          </div>
        ))
      )}
    </ChartCard>
  );
}

function UpcomingItemsPanel({ ctx }: { ctx: PopulatedProjectContext }) {
  const [rangeDays, setRangeDays] = useState(30);
  var cutoff = window.PCC.scheduleGanttLayout.addDays(ctx.todayIso, rangeDays);
  var items: TimelineItem[] = [];
  ctx.upcomingMilestones.filter((m) => m.date <= cutoff).forEach((m) => items.push({ date: m.date, text: "Milestone: " + m.name }));
  ctx.criticalActivities.forEach((a) => {
    var act = ctx.activities.find((x) => x.id === a.id);
    var finish = ctx.cpm && ctx.cpm.results[a.id] ? ctx.cpm.results[a.id].early_finish : act && act.planned_finish;
    if (finish && finish >= ctx.todayIso && finish <= cutoff) items.push({ date: finish, text: "Critical activity finishing: " + a.name });
  });
  ctx.upcomingMeetings.filter((m) => (m.meeting_date || "") <= cutoff).forEach((m) => items.push({ date: m.meeting_date, text: "Meeting: " + (m.title || "(untitled)") }));
  ctx.openRfis
    .filter((r) => r.date_required && r.date_required >= ctx.todayIso && r.date_required <= cutoff)
    .forEach((r) => items.push({ date: r.date_required, text: "RFI Due: " + r.number + " " + r.subject }));
  items.sort((a, b) => ((a.date || "") < (b.date || "") ? -1 : 1));

  return (
    <ChartCard title="Upcoming Items">
      <select aria-label="Date range" className="no-print" style={{ marginBottom: "var(--space-2)" }} value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
        {[7, 14, 30, 60, 90].map((d) => (
          <option key={d} value={d}>
            Next {d} days
          </option>
        ))}
      </select>
      {items.length === 0 ? (
        <NoDataNote text={"Nothing upcoming in the next " + rangeDays + " days."} />
      ) : (
        items.map((i, idx) => (
          <div key={idx} style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
            <span className="mono text-secondary">{i.date}</span> — {i.text}
          </div>
        ))
      )}
    </ChartCard>
  );
}

function VendorPerformancePanel({ data, projectId }: { data: PCCStoreData; projectId: string }) {
  var reviewsByVendor: { [vendorId: string]: (typeof data.vendor_performance) } = {};
  data.vendor_performance
    .filter((r) => r.project_id === projectId)
    .forEach((r) => {
      var vid = r.vendor_id || "";
      (reviewsByVendor[vid] = reviewsByVendor[vid] || []).push(r);
    });
  var vendorsById: { [id: string]: (typeof data.vendors)[number] } = {};
  data.vendors.forEach((v) => (vendorsById[v.id] = v));
  var vendorIds = Object.keys(reviewsByVendor);

  return (
    <div className="panel" style={{ marginTop: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-3)" }}>Vendor Performance</h3>
      {vendorIds.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          No vendor performance reviews logged for this project yet.
        </p>
      ) : (
        <div className="attention-list">
          {vendorIds.map((vendorId) => {
            var reviews = reviewsByVendor[vendorId];
            var avg = Math.round((reviews.reduce((sum, r) => sum + overallRating(r), 0) / reviews.length) * 10) / 10;
            var vendor = vendorsById[vendorId];
            var severity = avg > 0 && avg < 3 ? "critical" : avg >= 3 && avg < 4 ? "warning" : "info";
            var text =
              (vendor ? vendor.vendor_name || "(unnamed vendor)" : "(deleted vendor)") +
              ": " +
              (avg > 0 ? avg.toFixed(1).replace(/\.0$/, "") + " / 5" : "Not rated") +
              " (" +
              reviews.length +
              " review" +
              (reviews.length === 1 ? "" : "s") +
              ")";
            return (
              <div key={vendorId} className="attention-item attention-item--clickable" onClick={() => navigateToLink({ module: "vendors", recordId: vendorId }, projectId)}>
                <span className={"attention-item__icon attention-item__icon--" + severity} />
                <div className="attention-item__body">
                  <div className="attention-item__text">{text}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KeyDecisionsPanel({ ctx }: { ctx: PopulatedProjectContext }) {
  return (
    <div className="panel" style={{ marginTop: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-3)" }}>Key Decisions ({ctx.pendingDecisions.length})</h3>
      {ctx.pendingDecisions.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          Nothing pending in the Decision Register.
        </p>
      ) : (
        <div className="attention-list">
          {ctx.pendingDecisions.map((d) => (
            <div key={d.id} className="attention-item attention-item--clickable" onClick={() => navigateToLink({ module: "decisionRegister", recordId: d.id }, ctx.project.id)}>
              <span className="attention-item__icon attention-item__icon--info" />
              <div className="attention-item__body">
                <div className="attention-item__text">{d.title || "(untitled decision)"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ActionListItem {
  severity: string;
  text: string;
  link: { module: string; recordId?: string };
}

function ManagementActionListPanel({ ctx }: { ctx: PopulatedProjectContext }) {
  var items: ActionListItem[] = [];
  ctx.delayedActivities.forEach((a) => items.push({ severity: "critical", text: "Delayed activity: " + a.name + " (finish " + a.finish + ")", link: { module: "schedule" } }));
  ctx.highRisks.forEach((r) => items.push({ severity: "critical", text: "Critical risk: " + r.title, link: { module: "risks", recordId: r.id } }));
  ctx.overdueRfis.forEach((r) => items.push({ severity: "warning", text: "Overdue RFI: " + r.number + " " + r.subject, link: { module: "rfis", recordId: r.id } }));
  ctx.pendingChangeOrders.forEach((co) => items.push({ severity: "info", text: "Pending approval: " + co.number + " " + co.title, link: { module: "changeOrders", recordId: co.id } }));
  ctx.overdueMeetingActions.forEach((a) => items.push({ severity: "warning", text: "Outstanding action (" + a.meetingTitle + "): " + a.description, link: { module: "meetings", recordId: a.meetingId } }));
  ctx.criticalIssues.forEach((r) => items.push({ severity: "critical", text: "Critical issue: " + r.title, link: { module: "risks", recordId: r.id } }));
  ctx.slippedMilestones.forEach((m) => items.push({ severity: "warning", text: "Schedule slippage: milestone “" + m.name + "” +" + m.varianceDays + "d", link: { module: "schedule" } }));
  if (ctx.costSummary.actual > ctx.costSummary.budgeted && ctx.costSummary.budgeted > 0) {
    items.push({ severity: "critical", text: "Cost warning: actual cost exceeds budget", link: { module: "cost" } });
  }

  return (
    <div className="panel" style={{ marginTop: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-3)" }}>Management Action List</h3>
      {items.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          Nothing outstanding.
        </p>
      ) : (
        <div className="attention-list">
          {items.map((i, idx) => (
            <div key={idx} className="attention-item attention-item--clickable" onClick={() => navigateToLink(i.link, ctx.project.id)}>
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

// ===== Schedule sub-tab detail panels =====

function SchedulePerformanceDetail({ ctx, onChanged }: { ctx: PopulatedProjectContext; onChanged: () => void }) {
  var snapshots = ctx.schedulePerformanceSnapshots;
  return (
    <div className="panel" style={{ marginTop: "var(--space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <h4>Schedule Performance Score</h4>
        {ctx.schedulePerformance.rag ? <RagBadge rag={ctx.schedulePerformance.rag} /> : null}
      </div>
      <div style={{ overflowX: "auto", marginBottom: "var(--space-3)" }}>
        <table style={{ width: "100%", minWidth: 360, fontSize: "var(--text-sm)", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Factor", "Weight", "Score", "Why"].map((h) => (
                <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--divider)", padding: "var(--space-1) var(--space-2)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(ctx.schedulePerformance.factors).map((key) => {
              var f = ctx.schedulePerformance.factors[key];
              return (
                <tr key={key}>
                  <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)", verticalAlign: "top" }}>{f.label}</td>
                  <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)", verticalAlign: "top" }}>{f.weight}%</td>
                  <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)", verticalAlign: "top" }}>
                    {f.available && f.score != null ? String(Math.round(f.score)) : "—"}
                  </td>
                  <td style={{ padding: "var(--space-1) var(--space-2)", borderBottom: "1px solid var(--divider)", verticalAlign: "top" }}>{f.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--text-sm)" }}>
          {snapshots.length > 0
            ? snapshots.length + " performance snapshot" + (snapshots.length === 1 ? "" : "s") + " captured — last on " + (snapshots[0].captured_at || "").slice(0, 10) + "."
            : "No performance snapshots captured yet — capture one to start a trend and feed the Progress S-Curve's actual line."}
        </span>
        <button
          className="btn btn--ghost"
          onClick={() => {
            captureSchedulePerformanceSnapshot(ctx.project.id, ctx);
            window.PCC.notify("Performance snapshot captured.", "success");
            onChanged();
          }}
        >
          Capture Performance Snapshot
        </button>
      </div>
      {snapshots.length > 0 ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          {snapshots.slice(0, 10).map((s) => (
            <p key={s.id} className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0" }}>
              {(s.captured_at || "").slice(0, 10)} — SPI {s.spi == null ? "—" : s.spi.toFixed(2)} · SPI(t) {s.spi_t == null ? "—" : s.spi_t.toFixed(2)} · Score{" "}
              {s.schedule_performance_score == null ? "—" : s.schedule_performance_score}
            </p>
          ))}
          {snapshots.length > 10 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              +{snapshots.length - 10} more not shown.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusDateDetail({ ctx }: { ctx: PopulatedProjectContext }) {
  var modeLabel = ctx.schedule && ctx.schedule.calculation_mode === "retained_logic" ? "Retained Logic" : "Progress Override";
  return (
    <>
      {ctx.forecastLateActivities.length > 0 ? (
        <div className="panel" style={{ marginTop: "var(--space-3)" }}>
          <h4 style={{ marginBottom: "var(--space-2)" }}>Forecast to Finish Late ({ctx.forecastLateActivities.length})</h4>
          {ctx.forecastLateActivities.slice(0, 20).map((a) => (
            <p key={a.id} style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0" }}>
              {a.name || "(unnamed activity)"} — planned {a.plannedFinish}, forecast {a.forecastFinish} (+{a.varianceDays}d)
            </p>
          ))}
          {ctx.forecastLateActivities.length > 20 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              +{ctx.forecastLateActivities.length - 20} more not shown.
            </p>
          ) : null}
        </div>
      ) : null}

      {ctx.outOfSequenceActivities.length > 0 ? (
        <div className="panel" style={{ marginTop: "var(--space-3)" }}>
          <h4 style={{ marginBottom: "var(--space-2)" }}>
            Out of Sequence ({ctx.outOfSequenceActivities.length}) — {modeLabel} mode
          </h4>
          {ctx.outOfSequenceActivities.slice(0, 20).map((a) => (
            <p key={a.id} style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0" }}>
              {a.name || "(unnamed activity)"}
            </p>
          ))}
          {ctx.outOfSequenceActivities.length > 20 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              +{ctx.outOfSequenceActivities.length - 20} more not shown.
            </p>
          ) : null}
          <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
            {modeLabel === "Retained Logic"
              ? "These activities had actual progress before their predecessor logic allowed — their forecast is pushed to respect that logic. Change the mode on the Schedule page."
              : "These activities had actual progress before their predecessor logic allowed — their forecast uses actual dates regardless. Change the mode on the Schedule page."}
          </p>
        </div>
      ) : null}

      {ctx.remainingDurationMissingCount > 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
          {ctx.remainingDurationMissingCount} in-progress activit{ctx.remainingDurationMissingCount === 1 ? "y has" : "ies have"} no Remaining Duration set, so
          Remaining Duration above is understated — update it on the Schedule page.
        </p>
      ) : null}

      <div className="panel" style={{ marginTop: "var(--space-3)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--text-sm)" }}>
          {ctx.baselineCount > 0
            ? "Float Changes and Milestone Variance are computed from " + ctx.baselineCount + " captured baseline" + (ctx.baselineCount === 1 ? "" : "s") + " on the Baselines tab."
            : "No baseline captured for this schedule yet — capture one on the Baselines tab to track Float Changes and Milestone Variance."}
        </span>
        {ctx.schedule ? (
          <button className="btn btn--ghost" onClick={() => viewBaselines(ctx.project.id, (ctx.schedule as NonNullable<typeof ctx.schedule>).id)}>
            View Baselines
          </button>
        ) : null}
      </div>
    </>
  );
}

function DelayRecoveryGapDetail({ ctx }: { ctx: PopulatedProjectContext }) {
  if (ctx.unaddressedDelayActivities.length === 0) return null;
  return (
    <div className="panel" style={{ marginTop: "var(--space-3)" }}>
      <h4 style={{ marginBottom: "var(--space-2)" }}>Activities With Unaddressed Delay ({ctx.unaddressedDelayActivities.length})</h4>
      {ctx.unaddressedDelayActivities.slice(0, 20).map((a) => (
        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)", margin: "var(--space-1) 0" }}>
          <span style={{ fontSize: "var(--text-sm)" }}>
            {a.name} — {a.delayDays}d delay, {a.recoveryDays}d recovery estimated ({a.gapDays}d unaddressed)
          </span>
          {a.scheduleId ? (
            <button className="btn btn--ghost" onClick={() => viewActivityInSchedule(ctx.project.id, a.scheduleId || "", a.id)}>
              View in Gantt
            </button>
          ) : null}
        </div>
      ))}
      {ctx.unaddressedDelayActivities.length > 20 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          +{ctx.unaddressedDelayActivities.length - 20} more not shown.
        </p>
      ) : null}
    </div>
  );
}

// ===== Overview sub-tabs =====

interface SubTabProps {
  data: PCCStoreData;
  ctx: PopulatedProjectContext;
  health: HealthScoreResult;
  diagnostics: DiagnosticAlert[];
  onChanged: () => void;
}

function SummarySubTab({ data, ctx, health, diagnostics, onChanged }: SubTabProps) {
  var p = ctx.project;
  return (
    <>
      <div className="panel">
        <h3 style={{ marginBottom: "var(--space-3)" }}>Project Details</h3>
        <div className="detail-grid">
          <DetailItem label="Location" value={[p.location, p.country].filter(Boolean).join(", ")} />
          <DetailItem label="Current Phase" value={p.current_phase} />
          <DetailItem label="Contract Value" value={fmtMoney(p.contract_value, p.currency)} />
          <DetailItem label="Budget" value={fmtMoney(ctx.costSummary.budgeted, p.currency) + (ctx.costSummary.usingPortfolioBudget ? " (from Portfolio field)" : "")} />
          <DetailItem label="Actual Cost" value={fmtMoney(ctx.costSummary.actual, p.currency)} />
          <DetailItem label="Start Date" value={ctx.plannedStart} />
          <DetailItem label="Planned Finish" value={ctx.plannedFinish} />
          <DetailItem label="Forecast Finish" value={ctx.forecastFinish ? ctx.forecastFinish + (ctx.forecastFinishSource === "calculated" ? " (calculated)" : " (manual)") : null} />
          <DetailItem label="Data Date" value={ctx.schedule ? ctx.schedule.data_date : null} />
          <DetailItem label="Project Manager" value={p.project_manager} />
          <DetailItem label="Planner" value={p.planner} />
          <DetailItem label="Overall Progress" value={fmtPct(p.progress)} />
        </div>
      </div>

      <HealthScorePanel health={health} onChanged={onChanged} />
      <DiagnosticsPanel diagnostics={diagnostics} projectId={p.id} />
      <ExecutiveSummaryPanel data={data} ctx={ctx} onChanged={onChanged} />

      <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
        <RecentActivityPanel ctx={ctx} />
        <UpcomingItemsPanel ctx={ctx} />
      </div>

      <VendorPerformancePanel data={data} projectId={p.id} />
      <KeyDecisionsPanel ctx={ctx} />
      <ManagementActionListPanel ctx={ctx} />
    </>
  );
}

function ScheduleSubTab({ ctx, onChanged }: { ctx: PopulatedProjectContext; onChanged: () => void }) {
  var p = ctx.project;
  return (
    <>
      <KpiSection
        title="PROGRESS"
        kpis={[
          { label: "Overall Progress", value: fmtPct(p.progress) },
          { label: "Schedule Progress", value: fmtPct(ctx.scheduleProgressPct) },
          { label: "Physical Progress", value: fmtPct(ctx.physicalProgressPct) },
        ]}
      />

      {ctx.totalActivityCount > 0 ? (
        <KpiSection
          title="SCHEDULE"
          kpis={[
            { label: "Critical Activities", value: ctx.criticalActivities.length, colorVar: ctx.criticalActivities.length ? "--status-critical" : null },
            { label: "Near-Critical", value: ctx.nearCriticalActivities.length, colorVar: ctx.nearCriticalActivities.length ? "--status-at-risk" : null },
            { label: "Delayed Activities", value: ctx.delayedActivities.length, colorVar: ctx.delayedActivities.length ? "--status-critical" : null },
            { label: "Upcoming Milestones", value: ctx.upcomingMilestones.length },
            {
              label: "Schedule Variance",
              value: ctx.forecastVarianceDays == null ? "—" : (ctx.forecastVarianceDays > 0 ? "+" : "") + ctx.forecastVarianceDays + "d",
              colorVar: (ctx.forecastVarianceDays || 0) > 0 ? "--status-critical" : null,
            },
          ]}
          footnote={ctx.scheduleVarianceSource === "official_baseline" && ctx.officialBaseline ? 'Schedule Variance measured against the Official Baseline ("' + ctx.officialBaseline.name + '").' : null}
        />
      ) : (
        <KpiEmptySection title="SCHEDULE" message="No schedule with activities yet — see the Schedule page." />
      )}

      {ctx.totalActivityCount > 0 ? (
        <>
          <KpiSection
            title={"STATUS DATE (" + ctx.referenceDate + ")"}
            kpis={[
              { label: "Completed", value: ctx.completedActivityCount },
              { label: "In Progress", value: ctx.inProgressActivityCount },
              { label: "Not Started", value: ctx.notStartedActivityCount },
              { label: "Forecast Late", value: ctx.forecastLateActivities.length, colorVar: ctx.forecastLateActivities.length ? "--status-critical" : null },
              { label: "Remaining Duration", value: ctx.remainingDurationTotalDays + "d" },
              { label: "Out of Sequence", value: ctx.outOfSequenceActivities.length, colorVar: ctx.outOfSequenceActivities.length ? "--status-at-risk" : null },
            ]}
          />
          <StatusDateDetail ctx={ctx} />
        </>
      ) : null}

      {ctx.totalActivityCount > 0 ? (
        <>
          <KpiSection
            title="SCHEDULE PERFORMANCE"
            kpis={[
              { label: "SPI", value: ctx.evm && ctx.evm.spi != null ? ctx.evm.spi.toFixed(2) : "—", colorVar: ctx.evm && ctx.evm.spi != null && ctx.evm.spi < 1 ? "--status-critical" : null },
              {
                label: "SPI(t)",
                value: ctx.earnedSchedule && ctx.earnedSchedule.spiT != null ? ctx.earnedSchedule.spiT.toFixed(2) : "—",
                colorVar: ctx.earnedSchedule && ctx.earnedSchedule.spiT != null && ctx.earnedSchedule.spiT < 1 ? "--status-critical" : null,
              },
              {
                label: "Earned Schedule Variance",
                value:
                  ctx.earnedSchedule && ctx.earnedSchedule.scheduleVarianceDays != null
                    ? (ctx.earnedSchedule.scheduleVarianceDays > 0 ? "+" : "") + ctx.earnedSchedule.scheduleVarianceDays + "d"
                    : "—",
                colorVar: ctx.earnedSchedule && ctx.earnedSchedule.scheduleVarianceDays != null && ctx.earnedSchedule.scheduleVarianceDays < 0 ? "--status-critical" : null,
              },
              {
                label: "Performance Score",
                value: ctx.schedulePerformance.score == null ? "—" : ctx.schedulePerformance.score,
                colorVar: ctx.schedulePerformance.rag === "critical" ? "--status-critical" : ctx.schedulePerformance.rag === "at_risk" ? "--status-at-risk" : null,
              },
            ]}
          />
          <SchedulePerformanceDetail ctx={ctx} onChanged={onChanged} />
        </>
      ) : (
        <KpiEmptySection title="SCHEDULE PERFORMANCE" message="No schedule with activities yet — see the Schedule page." />
      )}

      {ctx.allDelayRecords.length > 0 || ctx.allRecoveryActions.length > 0 ? (
        <>
          <KpiSection
            title="DELAY & RECOVERY"
            kpis={[
              { label: "Delay Records", value: ctx.allDelayRecords.length },
              { label: "Total Delay Days", value: ctx.totalDelayDays, colorVar: ctx.totalDelayDays > 0 ? "--status-critical" : null },
              { label: "Open Recovery Actions", value: ctx.openRecoveryActions.length },
              { label: "Unaddressed Delay Days", value: ctx.totalUnaddressedDelayDays, colorVar: ctx.totalUnaddressedDelayDays > 0 ? "--status-critical" : null },
            ]}
          />
          <DelayRecoveryGapDetail ctx={ctx} />
        </>
      ) : (
        <KpiEmptySection title="DELAY & RECOVERY" message="No delay records or recovery actions logged for this project yet — see an activity's own Detail Panel in the Schedule module." />
      )}

      <div style={{ marginTop: "var(--space-4)" }}>
        <h4 style={{ marginBottom: "var(--space-3)" }}>Charts</h4>
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <ChartCard title="Progress S-Curve">
            <SCurveChart activities={ctx.activities} referenceDate={ctx.referenceDate} todayIso={ctx.todayIso} snapshots={ctx.schedulePerformanceSnapshots} />
          </ChartCard>
          <ChartCard title="Critical vs Non-Critical Activities">
            {ctx.totalActivityCount > 0 ? (
              <DonutChart
                items={[
                  { label: "Critical", value: ctx.criticalActivities.length, color: "var(--status-critical)" },
                  { label: "Near-Critical", value: ctx.nearCriticalActivities.length, color: "var(--status-at-risk)" },
                  { label: "Normal", value: Math.max(0, ctx.totalActivityCount - ctx.criticalActivities.length - ctx.nearCriticalActivities.length), color: "var(--status-on-track)" },
                ]}
              />
            ) : (
              <NoDataNote />
            )}
          </ChartCard>
          <ChartCard title="Float Distribution">
            <HorizontalBarChart items={floatDistributionBuckets(ctx.activities)} />
          </ChartCard>
        </div>
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
          <ChartCard title="Milestone Timeline">
            <MilestoneTimelineMini milestones={ctx.upcomingMilestones} todayIso={ctx.todayIso} />
          </ChartCard>
        </div>
      </div>
    </>
  );
}

function CostSubTab({ ctx }: { ctx: PopulatedProjectContext }) {
  var p = ctx.project;
  return (
    <>
      <KpiSection
        title="COST"
        kpis={[
          { label: "Budget", value: fmtMoney(ctx.costSummary.budgeted, p.currency) },
          { label: "Actual", value: fmtMoney(ctx.costSummary.actual, p.currency) },
          { label: "Variance", value: fmtMoney(ctx.costSummary.variance, p.currency), colorVar: ctx.costSummary.variance < 0 ? "--status-critical" : "--status-on-track" },
        ]}
        footnote="Cash Flow isn't tracked anywhere in PCC yet, so it's left off rather than shown as an always-empty tile."
      />

      {ctx.commitmentSummary.count > 0 ? (
        <KpiSection
          title="COMMITMENTS"
          kpis={[
            { label: "Committed", value: fmtMoney(ctx.commitmentSummary.committed, p.currency) },
            { label: "Approved", value: fmtMoney(ctx.commitmentSummary.approved, p.currency) },
            { label: "Actual", value: fmtMoney(ctx.commitmentSummary.actual, p.currency) },
            { label: "Remaining", value: fmtMoney(ctx.commitmentSummary.remaining, p.currency), colorVar: ctx.commitmentSummary.remaining < 0 ? "--status-critical" : null },
            { label: "At Risk", value: ctx.commitmentSummary.atRisk, colorVar: ctx.commitmentSummary.atRisk > 0 ? "--status-critical" : null },
          ]}
        />
      ) : (
        <KpiEmptySection title="COMMITMENTS" message="No commitments logged for this project yet — see the Commitments page." />
      )}

      {ctx.evm ? (
        <KpiSection
          title={"EVM" + (ctx.evm.coveragePct != null && ctx.evm.coveragePct < 100 ? " (" + ctx.evm.coveragePct + "% of budget linked to schedule)" : "")}
          kpis={[
            { label: "PV", value: fmtMoney(ctx.evm.pv, p.currency) },
            { label: "EV", value: fmtMoney(ctx.evm.ev, p.currency) },
            { label: "AC", value: fmtMoney(ctx.evm.ac, p.currency) },
            { label: "SPI", value: ctx.evm.spi == null ? "—" : ctx.evm.spi.toFixed(2), colorVar: ctx.evm.spi != null && ctx.evm.spi < 1 ? "--status-critical" : null },
            { label: "CPI", value: ctx.evm.cpi == null ? "—" : ctx.evm.cpi.toFixed(2), colorVar: ctx.evm.cpi != null && ctx.evm.cpi < 1 ? "--status-critical" : null },
            { label: "BAC", value: fmtMoney(ctx.evm.bac, p.currency) },
            { label: "EAC", value: fmtMoney(ctx.evm.eac, p.currency) },
            { label: "ETC", value: fmtMoney(ctx.evm.etc, p.currency) },
            { label: "VAC", value: fmtMoney(ctx.evm.vac, p.currency), colorVar: ctx.evm.vac != null && ctx.evm.vac < 0 ? "--status-critical" : null },
          ]}
        />
      ) : null}
    </>
  );
}

function RiskSubTab({ ctx }: { ctx: PopulatedProjectContext }) {
  var closedRfis = ctx.allRfis.length - ctx.openRfis.length;
  return (
    <>
      <KpiSection title="RISKS" kpis={[{ label: "Open Risks", value: ctx.openRisks.length }, { label: "High Risks", value: ctx.highRisks.length, colorVar: ctx.highRisks.length ? "--status-critical" : null }]} />
      <KpiSection
        title="ISSUES"
        kpis={[{ label: "Open Issues", value: ctx.openIssues.length }, { label: "Critical Issues", value: ctx.criticalIssues.length, colorVar: ctx.criticalIssues.length ? "--status-critical" : null }]}
      />
      <KpiSection
        title="RFIs"
        kpis={[
          { label: "Open RFIs", value: ctx.openRfis.length },
          { label: "Overdue RFIs", value: ctx.overdueRfis.length, colorVar: ctx.overdueRfis.length ? "--status-critical" : null },
          { label: "Avg. Response Time", value: ctx.avgRfiResponseDays == null ? "—" : ctx.avgRfiResponseDays.toFixed(1) + "d" },
        ]}
      />
      <KpiSection
        title="CHANGES"
        kpis={[
          { label: "Open Change Orders", value: ctx.openChangeOrders.length },
          { label: "Pending Approvals", value: ctx.pendingChangeOrders.length, colorVar: ctx.pendingChangeOrders.length ? "--status-at-risk" : null },
          { label: "Approved", value: ctx.approvedChangeOrders.length },
        ]}
      />

      <div style={{ marginTop: "var(--space-4)" }}>
        <h4 style={{ marginBottom: "var(--space-3)" }}>Charts</h4>
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <ChartCard title="Risk Heat Map (open)">
            <RiskHeatMapMini risks={ctx.openRisks.concat(ctx.openIssues)} />
          </ChartCard>
          <ChartCard title="RFI / TQ — Open vs Closed">
            <HorizontalBarChart
              items={[
                { label: "Open", value: ctx.openRfis.length, color: "var(--status-at-risk)" },
                { label: "Overdue", value: ctx.overdueRfis.length, color: "var(--status-critical)" },
                { label: "Closed", value: closedRfis, color: "var(--status-on-track)" },
              ]}
            />
          </ChartCard>
          <ChartCard title="Change Orders — Status">
            <HorizontalBarChart
              items={[
                { label: "Pending", value: ctx.pendingChangeOrders.length, color: "var(--status-at-risk)" },
                { label: "Approved", value: ctx.approvedChangeOrders.length, color: "var(--status-on-track)" },
                { label: "Rejected", value: ctx.rejectedChangeOrders.length, color: "var(--status-critical)" },
              ]}
            />
          </ChartCard>
        </div>
      </div>
    </>
  );
}

function ResourcesSubTab({ ctx }: { ctx: PopulatedProjectContext }) {
  return (
    <KpiSection
      title="RESOURCES"
      kpis={[
        { label: "Resources Assigned", value: ctx.assignedResourceCount },
        { label: "Over-Allocated (Portfolio-Wide)", value: ctx.overAllocatedResources.length, colorVar: ctx.overAllocatedResources.length ? "--status-critical" : null },
      ]}
    />
  );
}

function OverviewTab({ data, ctx, health, diagnostics, onChanged }: SubTabProps) {
  var p = ctx.project;
  var subTabs: { key: string; label: string }[] = [
    { key: "summary", label: "Summary" },
    { key: "schedule", label: "Schedule" },
    { key: "cost", label: "Cost & Commitments" },
    { key: "risk", label: "Risk & Compliance" },
  ];
  if (data.resources.length > 0) subTabs.push({ key: "resources", label: "Resources" });
  const [subTab, setSubTab] = useState("summary");
  var effectiveSubTab = subTabs.some((t) => t.key === subTab) ? subTab : "summary";

  return (
    <>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-3)" }}>
          <div>
            <h3 style={{ marginBottom: 2 }}>{p.name || "(unnamed project)"}</h3>
            <span className="text-secondary" style={{ fontSize: 12 }}>
              {p.client || "—"}
              {p.sector ? " · " + p.sector : ""}
              {p.project_type ? " · " + p.project_type : ""}
            </span>
          </div>
          <RagBadge rag={health.rag} />
        </div>
        <div className="kpi-grid">
          <KpiCard label="PROGRESS" value={fmtPct(p.progress)} />
          <KpiCard
            label="SCHEDULE VARIANCE"
            value={ctx.forecastVarianceDays == null ? "—" : (ctx.forecastVarianceDays > 0 ? "+" : "") + ctx.forecastVarianceDays + "d"}
            colorVar={(ctx.forecastVarianceDays || 0) > 0 ? "--status-critical" : null}
          />
          <KpiCard label="COST VARIANCE" value={fmtMoney(ctx.costSummary.variance, p.currency)} colorVar={ctx.costSummary.variance < 0 ? "--status-critical" : null} />
          <KpiCard label="OPEN RISKS" value={ctx.openRisks.length} colorVar={ctx.highRisks.length ? "--status-critical" : null} />
          <KpiCard label="OVERDUE RFIs" value={ctx.overdueRfis.length} colorVar={ctx.overdueRfis.length ? "--status-critical" : null} />
        </div>
      </div>

      <div className="toolbar no-print" style={{ marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        {subTabs.map((t) => (
          <button key={t.key} className={"btn " + (effectiveSubTab === t.key ? "btn--primary" : "btn--ghost")} onClick={() => setSubTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {effectiveSubTab === "schedule" ? (
        <ScheduleSubTab ctx={ctx} onChanged={onChanged} />
      ) : effectiveSubTab === "cost" ? (
        <CostSubTab ctx={ctx} />
      ) : effectiveSubTab === "risk" ? (
        <RiskSubTab ctx={ctx} />
      ) : effectiveSubTab === "resources" ? (
        <ResourcesSubTab ctx={ctx} />
      ) : (
        <SummarySubTab data={data} ctx={ctx} health={health} diagnostics={diagnostics} onChanged={onChanged} />
      )}
    </>
  );
}

// ===== Weekly Reviews tab =====

interface ReviewCardProps {
  review: PCCWeeklyReview;
  previousReview: PCCWeeklyReview | null;
  currency: string | undefined;
  onChanged: (action: string, id?: string) => void;
}

function ReviewCard({ review, previousReview, currency, onChanged }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  var s = review.snapshot as WeeklyReviewSnapshot;
  var prev = previousReview ? previousReview.snapshot : null;

  return (
    <div className="project-entry">
      <div className="project-card">
        <div className="project-card__main">
          <div className="project-card__name">{review.review_date}</div>
          <div className="project-card__meta">
            {review.reviewed_by || "—"}
            {review.attendees ? " · Attendees: " + review.attendees : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <RagBadge rag={s.rag} />
        </div>
        <div className="project-card__actions">
          <button className="btn btn--ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide" : "Details"}
          </button>
          <button className="btn btn--ghost" onClick={() => onChanged("edit", review.id)}>
            Edit Notes
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => {
              if (!window.confirm("Delete this weekly review? This can't be undone.")) return;
              deleteWeeklyReview(review.id);
              window.PCC.notify("Weekly review deleted.", "info");
              onChanged("refresh");
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="project-details">
          <div className="detail-grid">
            <DetailItem label="Health Score" value={(s.health_score == null ? "—" : s.health_score) + (prev ? deltaMarker(s.health_score, prev.health_score, true) : "")} />
            <DetailItem
              label="Schedule Progress"
              value={fmtPct(s.schedule_progress_pct) + (prev ? deltaMarker(Math.round(s.schedule_progress_pct || 0), Math.round(prev.schedule_progress_pct || 0), true) : "")}
            />
            <DetailItem
              label="Physical Progress"
              value={fmtPct(s.physical_progress_pct) + (prev ? deltaMarker(Math.round(s.physical_progress_pct || 0), Math.round(prev.physical_progress_pct || 0), true) : "")}
            />
            <DetailItem label="Cost Variance" value={fmtMoney(s.cost_variance, currency)} />
            <DetailItem label="Open Risks (high-severity)" value={s.open_risks + " (" + s.high_risks + ")"} />
            <DetailItem label="Open RFIs (overdue)" value={s.open_rfis + " (" + s.overdue_rfis + ")"} />
            <DetailItem label="Pending Change Orders" value={s.pending_change_orders} />
            <DetailItem label="Open Recovery Actions (overdue)" value={s.open_recovery_actions + " (" + s.overdue_recovery_actions + ")"} />
            <DetailItem label="Pending Decisions" value={s.pending_decisions} />
          </div>
          {[
            { label: "Progress This Week", value: review.progress_notes },
            { label: "Issues / Blockers", value: review.issues_notes },
            { label: "Actions for Next Week", value: review.actions_notes },
          ]
            .filter((f) => f.value)
            .map((f) => (
              <p key={f.label} style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>
                <strong>{f.label}:</strong> {f.value}
              </p>
            ))}
        </div>
      ) : null}
    </div>
  );
}

interface WeeklyReviewForm {
  review_date: string;
  reviewed_by: string;
  attendees: string;
  progress_notes: string;
  issues_notes: string;
  actions_notes: string;
}

function WeeklyReviewsTab({ data, ctx, health, onProjectChanged }: { data: PCCStoreData; ctx: PopulatedProjectContext; health: HealthScoreResult; onProjectChanged: () => void }) {
  var reviews = data.weekly_reviews
    .filter((r) => r.project_id === ctx.project.id)
    .sort((a, b) => b.review_date.localeCompare(a.review_date) || (b.created_at || "").localeCompare(a.created_at || ""));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<WeeklyReviewSnapshot | null>(null);
  const [form, setForm] = useState<WeeklyReviewForm>({ review_date: "", reviewed_by: "", attendees: "", progress_notes: "", issues_notes: "", actions_notes: "" });

  function openNew() {
    setPendingSnapshot(captureSnapshot(ctx, health));
    setForm({ review_date: today(), reviewed_by: "", attendees: "", progress_notes: "", issues_notes: "", actions_notes: "" });
    setEditingId("new");
  }
  function openEdit(reviewId: string) {
    var r = reviews.find((x) => x.id === reviewId);
    if (!r) return;
    setForm({
      review_date: r.review_date || "",
      reviewed_by: r.reviewed_by || "",
      attendees: r.attendees || "",
      progress_notes: r.progress_notes || "",
      issues_notes: r.issues_notes || "",
      actions_notes: r.actions_notes || "",
    });
    setEditingId(reviewId);
  }

  var isNew = editingId === "new";
  var editingReview = isNew ? { project_id: ctx.project.id, snapshot: pendingSnapshot || undefined } : reviews.find((r) => r.id === editingId);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingReview) return;
    var values = {
      review_date: form.review_date || today(),
      reviewed_by: form.reviewed_by,
      attendees: form.attendees,
      progress_notes: form.progress_notes,
      issues_notes: form.issues_notes,
      actions_notes: form.actions_notes,
    };
    saveWeeklyReview(isNew, editingReview, values);
    window.PCC.notify(isNew ? "Weekly review saved." : "Weekly review updated.", "success");
    setEditingId(null);
    setPendingSnapshot(null);
    onProjectChanged();
  }

  return (
    <>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
        Each review freezes this project's key numbers at that moment — a review from a month ago shows what was true then, not today's live figures.
      </p>
      <button className="btn btn--primary no-print" style={{ marginBottom: "var(--space-3)" }} onClick={openNew}>
        + New Weekly Review
      </button>

      {editingId && editingReview ? (
        <div className="panel no-print" style={{ marginBottom: "var(--space-4)" }}>
          <h3 style={{ marginBottom: "var(--space-3)" }}>{isNew ? "New Weekly Review" : "Edit Weekly Review"}</h3>
          {isNew ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: -6, marginBottom: "var(--space-3)" }}>
              Snapshot captured just now — Health {pendingSnapshot!.rag ? RAG_LABELS[pendingSnapshot!.rag as string] : "—"} ({pendingSnapshot!.health_score == null ? "—" : pendingSnapshot!.health_score}), Schedule{" "}
              {fmtPct(pendingSnapshot!.schedule_progress_pct)}, Physical {fmtPct(pendingSnapshot!.physical_progress_pct)}.
            </p>
          ) : null}
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="wrfield-review_date">Review Date</label>
                <input id="wrfield-review_date" type="date" value={form.review_date} onChange={(e) => setForm((f) => Object.assign({}, f, { review_date: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="wrfield-reviewed_by">Reviewed By</label>
                <input id="wrfield-reviewed_by" type="text" value={form.reviewed_by} onChange={(e) => setForm((f) => Object.assign({}, f, { reviewed_by: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="wrfield-attendees">Attendees</label>
                <input id="wrfield-attendees" type="text" value={form.attendees} onChange={(e) => setForm((f) => Object.assign({}, f, { attendees: e.target.value }))} />
              </div>
            </div>
            <div className="field" style={{ marginTop: "var(--space-3)" }}>
              <label htmlFor="wrfield-progress_notes">Progress This Week</label>
              <textarea id="wrfield-progress_notes" rows={2} value={form.progress_notes} onChange={(e) => setForm((f) => Object.assign({}, f, { progress_notes: e.target.value }))} />
            </div>
            <div className="field" style={{ marginTop: "var(--space-3)" }}>
              <label htmlFor="wrfield-issues_notes">Issues / Blockers</label>
              <textarea id="wrfield-issues_notes" rows={2} value={form.issues_notes} onChange={(e) => setForm((f) => Object.assign({}, f, { issues_notes: e.target.value }))} />
            </div>
            <div className="field" style={{ marginTop: "var(--space-3)" }}>
              <label htmlFor="wrfield-actions_notes">Actions for Next Week</label>
              <textarea id="wrfield-actions_notes" rows={2} value={form.actions_notes} onChange={(e) => setForm((f) => Object.assign({}, f, { actions_notes: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
              <button type="submit" className="btn btn--primary">
                {isNew ? "Save Review" : "Save Changes"}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setEditingId(null);
                  setPendingSnapshot(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {reviews.length === 0 ? (
        <div className="panel empty-state">No weekly reviews logged yet for this project. Click “+ New Weekly Review” to capture the first one.</div>
      ) : (
        <div className="project-list">
          {reviews.map((r, idx) => (
            <ReviewCard
              key={r.id}
              review={r}
              previousReview={idx + 1 < reviews.length ? reviews[idx + 1] : null}
              currency={ctx.project.currency}
              onChanged={(action, id) => {
                if (action === "edit") openEdit(id as string);
                else onProjectChanged();
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ===== Output tab: Project Snapshot + Management Pack =====

function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number | undefined)[][] }) {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, ci) => (
              <td key={ci}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="report-doc__section">
      <h3 style={{ marginBottom: "var(--space-2)" }}>{title}</h3>
      {children}
    </div>
  );
}

function ReportEmptyNote({ text }: { text: string }) {
  return (
    <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0 0" }}>
      {text}
    </p>
  );
}

function LogoImg({ data, style }: { data: PCCStoreData; style?: React.CSSProperties }) {
  const [src, setSrc] = useState("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E");
  React.useEffect(() => {
    if (!data.settings.company_logo_filename) return;
    window.PCC.blobStore
      .getBlob("company_logo")
      .then((fileData) => {
        if (fileData) setSrc(fileData);
      })
      .catch(() => {});
  }, [data.settings.company_logo_filename]);
  if (!data.settings.company_logo_filename) return null;
  return <img style={Object.assign({ maxHeight: 48, maxWidth: 160, objectFit: "contain" }, style)} src={src} alt="" />;
}

interface ReportDocProps {
  data: PCCStoreData;
  ctx: PopulatedProjectContext;
  health: HealthScoreResult;
  diagnostics: DiagnosticAlert[];
}

function ProjectSnapshotDoc({ data, ctx, health, diagnostics }: ReportDocProps) {
  return (
    <div className="report-doc snapshot-doc">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>{ctx.project.name || "(unnamed project)"}</h2>
          <p className="text-secondary" style={{ fontSize: 11, margin: 0 }}>
            Project Snapshot · {ctx.project.client || ""} · Data Date {ctx.schedule ? ctx.schedule.data_date : "—"} · Generated {today()}
          </p>
        </div>
        <LogoImg data={data} />
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <RagBadge rag={health.rag} />
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            {health.score == null ? "—" : health.score}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)" }}>
        <ReportSection title="Overview">
          <ReportTable
            headers={["Field", "Value"]}
            rows={[
              ["Status", ctx.project.status || "—"],
              ["Overall Progress", fmtPct(ctx.project.progress)],
              ["Schedule Progress", fmtPct(ctx.scheduleProgressPct)],
              ["Planned Finish", ctx.plannedFinish || "—"],
              ["Forecast Finish", ctx.forecastFinish || "—"],
              ["Project Manager", ctx.project.project_manager || "—"],
            ]}
          />
        </ReportSection>
        <ReportSection title="KPI Summary">
          <ReportTable
            headers={["Metric", "Value"]}
            rows={[
              ["Critical Activities", String(ctx.criticalActivities.length)],
              ["Delayed Activities", String(ctx.delayedActivities.length)],
              ["Budget", fmtMoney(ctx.costSummary.budgeted, ctx.project.currency)],
              ["Actual Cost", fmtMoney(ctx.costSummary.actual, ctx.project.currency)],
              ["Open Risks", String(ctx.openRisks.length + ctx.openIssues.length)],
              ["Open RFIs (overdue)", ctx.openRfis.length + " (" + ctx.overdueRfis.length + ")"],
            ]}
          />
        </ReportSection>
        <ReportSection title="Milestones">
          {ctx.upcomingMilestones.length === 0 ? (
            <ReportEmptyNote text="No upcoming milestones." />
          ) : (
            <ReportTable headers={["Milestone", "Date"]} rows={ctx.upcomingMilestones.slice(0, 6).map((m) => [m.name, m.date])} />
          )}
        </ReportSection>
      </div>

      <ReportSection title="Executive Summary">
        {SUMMARY_SECTIONS.map((s) => {
          var summaryRecord = data.executive_summaries.find((rec) => rec.project_id === ctx.project.id);
          var text = (summaryRecord && (summaryRecord as any)[s.overrideKey]) || s.auto(ctx);
          return (
            <p key={s.key} style={{ fontSize: "var(--text-xs)", margin: "var(--space-1) 0" }}>
              <strong>{s.label}:</strong> {text}
            </p>
          );
        })}
      </ReportSection>

      <ReportSection title="Management Actions">
        {diagnostics.length === 0 ? (
          <ReportEmptyNote text="Nothing outstanding." />
        ) : (
          <ReportTable headers={["Severity", "Source", "Description"]} rows={diagnostics.slice(0, 8).map((a) => [SEVERITY_LABEL[a.severity], a.source, a.description])} />
        )}
      </ReportSection>
    </div>
  );
}

var PACK_SECTION_LABELS: { [key: string]: string } = {
  cover: "Cover Page",
  summary: "Executive Summary",
  snapshot: "Project Snapshot",
  kpis: "KPI Dashboard",
  progress: "Progress Summary (S-Curve)",
  schedule: "Schedule Summary",
  statusDate: "Status Date & Baseline Summary",
  delayRecovery: "Delay & Recovery Summary",
  schedulePerformance: "Schedule Performance Summary",
  milestones: "Milestone Status",
  cost: "Cost Summary",
  evm: "EVM Summary",
  risks: "Risk Summary",
  issues: "Issue Summary",
  rfis: "RFI Summary",
  changes: "Change Summary",
  dailylog: "Daily Site Log Summary",
  meetings: "Meeting Action Summary",
};

function ManagementPackDoc({ data, ctx, health, diagnostics, sections }: ReportDocProps & { sections: { [key: string]: boolean } }) {
  var p = ctx.project;
  return (
    <div className="report-doc">
      {sections.cover ? (
        <div style={{ marginBottom: "var(--space-5)", textAlign: "center", paddingTop: 60 }}>
          <LogoImg data={data} style={{ display: "block", margin: "0 auto var(--space-3)" }} />
          <h1 style={{ marginBottom: 6 }}>{p.name || "(unnamed project)"}</h1>
          <p className="text-secondary">Management Pack</p>
          <p className="text-secondary" style={{ fontSize: 12 }}>
            {data.settings.company_name || ""} · Generated {today()} · Data Date {ctx.schedule ? ctx.schedule.data_date : "—"}
          </p>
        </div>
      ) : null}

      {sections.summary ? (
        <ReportSection title="Executive Summary">
          {SUMMARY_SECTIONS.map((s) => {
            var summaryRecord = data.executive_summaries.find((rec) => rec.project_id === p.id);
            var text = (summaryRecord && (summaryRecord as any)[s.overrideKey]) || s.auto(ctx);
            return (
              <p key={s.key} style={{ fontSize: "var(--text-sm)" }}>
                <strong>{s.label}:</strong> {text}
              </p>
            );
          })}
        </ReportSection>
      ) : null}

      {sections.snapshot ? (
        <ReportSection title="Project Snapshot">
          <ProjectSnapshotDoc data={data} ctx={ctx} health={health} diagnostics={diagnostics} />
        </ReportSection>
      ) : null}

      {sections.kpis ? (
        <ReportSection title="KPI Dashboard">
          <ReportTable
            headers={["Metric", "Value"]}
            rows={[
              ["Overall Progress", fmtPct(p.progress)],
              ["Schedule Progress", fmtPct(ctx.scheduleProgressPct)],
              ["Physical Progress", fmtPct(ctx.physicalProgressPct)],
              ["Critical Activities", String(ctx.criticalActivities.length)],
              ["Near-Critical Activities", String(ctx.nearCriticalActivities.length)],
              ["Delayed Activities", String(ctx.delayedActivities.length)],
              ["Budget", fmtMoney(ctx.costSummary.budgeted, p.currency)],
              ["Actual Cost", fmtMoney(ctx.costSummary.actual, p.currency)],
              ["Open Risks / High", ctx.openRisks.length + " / " + ctx.highRisks.length],
              ["Open Issues / Critical", ctx.openIssues.length + " / " + ctx.criticalIssues.length],
              ["Open RFIs / Overdue", ctx.openRfis.length + " / " + ctx.overdueRfis.length],
              ["Open Change Orders / Pending", ctx.openChangeOrders.length + " / " + ctx.pendingChangeOrders.length],
              ["Health Score", health.score == null ? "—" : String(health.score) + " (" + RAG_LABELS[health.rag] + ")"],
            ]}
          />
        </ReportSection>
      ) : null}

      {sections.progress ? (
        <ReportSection title="Progress Summary (S-Curve)">
          <SCurveChart activities={ctx.activities} referenceDate={ctx.referenceDate} todayIso={ctx.todayIso} snapshots={ctx.schedulePerformanceSnapshots} />
        </ReportSection>
      ) : null}

      {sections.schedule ? (
        <ReportSection title="Schedule Summary">
          {ctx.totalActivityCount === 0 ? (
            <ReportEmptyNote text="No schedule with activities for this project." />
          ) : (
            <React.Fragment>
              <ReportTable
                headers={["Metric", "Value"]}
                rows={[
                  ["Total Activities", String(ctx.totalActivityCount)],
                  ["Completed", String(ctx.completedActivityCount)],
                  ["Critical Path Activities", String(ctx.criticalActivities.length)],
                  ["Forecast Finish", ctx.forecastFinish || "—"],
                  ["Schedule Variance", ctx.forecastVarianceDays == null ? "—" : (ctx.forecastVarianceDays > 0 ? "+" : "") + ctx.forecastVarianceDays + " day(s)"],
                ]}
              />
              <ReportSection title="Critical Path Summary">
                {ctx.criticalActivities.length === 0 ? (
                  <ReportEmptyNote text="No activities currently on the critical path." />
                ) : (
                  <ReportTable headers={["Activity"]} rows={ctx.criticalActivities.slice(0, 20).map((a) => [a.name])} />
                )}
              </ReportSection>
            </React.Fragment>
          )}
        </ReportSection>
      ) : null}

      {sections.statusDate ? (
        <ReportSection title="Status Date & Baseline Summary">
          {!ctx.schedule ? (
            <ReportEmptyNote text="No schedule for this project." />
          ) : (
            <ReportTable
              headers={["Metric", "Value"]}
              rows={[
                ["Status Date", ctx.schedule.data_date || "—"],
                ["Out of Sequence Activities", String(ctx.outOfSequenceActivities.length)],
                ["Forecast to Finish Late", String(ctx.forecastLateActivities.length)],
                ["Captured Baselines", String(ctx.baselineCount)],
                ["Official Baseline", ctx.officialBaseline ? ctx.officialBaseline.name : "None set"],
              ]}
            />
          )}
        </ReportSection>
      ) : null}

      {sections.delayRecovery ? (
        <ReportSection title="Delay & Recovery Summary">
          {ctx.allDelayRecords.length === 0 && ctx.allRecoveryActions.length === 0 ? (
            <ReportEmptyNote text="No delay records or recovery actions logged for this project." />
          ) : (
            <React.Fragment>
              <ReportTable
                headers={["Metric", "Value"]}
                rows={[
                  ["Delay Records", String(ctx.allDelayRecords.length)],
                  ["Total Delay Days", String(ctx.totalDelayDays)],
                  ["Open Recovery Actions", String(ctx.openRecoveryActions.length)],
                  ["Unaddressed Delay Days", String(ctx.totalUnaddressedDelayDays)],
                ]}
              />
              {ctx.unaddressedDelayActivities.length > 0 ? (
                <ReportTable
                  headers={["Activity", "Delay Days", "Recovery Days", "Unaddressed Days"]}
                  rows={ctx.unaddressedDelayActivities.slice(0, 20).map((a) => [a.name, String(a.delayDays), String(a.recoveryDays), String(a.gapDays)])}
                />
              ) : null}
            </React.Fragment>
          )}
        </ReportSection>
      ) : null}

      {sections.schedulePerformance ? (
        <ReportSection title="Schedule Performance Summary">
          <ReportTable
            headers={["Metric", "Value"]}
            rows={[
              ["Schedule Performance Score", ctx.schedulePerformance.score == null ? "—" : String(ctx.schedulePerformance.score) + " (" + RAG_LABELS[ctx.schedulePerformance.rag || ""] + ")"],
              ["SPI", ctx.evm && ctx.evm.spi != null ? ctx.evm.spi.toFixed(2) : "—"],
              ["SPI(t)", ctx.earnedSchedule && !ctx.earnedSchedule.insufficientData && ctx.earnedSchedule.spiT != null ? ctx.earnedSchedule.spiT.toFixed(2) : "—"],
            ]}
          />
        </ReportSection>
      ) : null}

      {sections.milestones ? (
        <ReportSection title="Milestone Status">
          {(() => {
            var allMilestones = ctx.activities.filter((a) => a.activity_type === "milestone");
            return allMilestones.length === 0 ? (
              <ReportEmptyNote text="No milestones defined." />
            ) : (
              <ReportTable headers={["Milestone", "Date", "Status"]} rows={allMilestones.map((a) => [a.name, a.planned_start || "—", ACTIVITY_STATUS_LABEL_MAP[a.status || ""] || a.status])} />
            );
          })()}
        </ReportSection>
      ) : null}

      {sections.cost ? (
        <React.Fragment>
          <ReportSection title="Cost Summary">
            <ReportTable
              headers={["Metric", "Value"]}
              rows={[
                ["Budget", fmtMoney(ctx.costSummary.budgeted, p.currency) + (ctx.costSummary.usingPortfolioBudget ? " (from Portfolio field)" : "")],
                ["Actual", fmtMoney(ctx.costSummary.actual, p.currency)],
                ["Variance", fmtMoney(ctx.costSummary.variance, p.currency)],
              ]}
            />
            <ReportEmptyNote text="Cash Flow isn't tracked anywhere in PCC yet." />
          </ReportSection>
          <ReportSection title="Commitments Summary">
            {ctx.commitmentSummary.count === 0 ? (
              <ReportEmptyNote text="No commitments logged for this project." />
            ) : (
              <ReportTable
                headers={["Metric", "Value"]}
                rows={[
                  ["Committed", fmtMoney(ctx.commitmentSummary.committed, p.currency)],
                  ["Approved", fmtMoney(ctx.commitmentSummary.approved, p.currency)],
                  ["Actual", fmtMoney(ctx.commitmentSummary.actual, p.currency)],
                  ["Remaining", fmtMoney(ctx.commitmentSummary.remaining, p.currency)],
                ]}
              />
            )}
          </ReportSection>
        </React.Fragment>
      ) : null}

      {sections.evm ? (
        <ReportSection title="EVM Summary">
          {!ctx.evm ? (
            <ReportEmptyNote text="No Cost Tracking budget items for this project — EVM not available." />
          ) : (
            <ReportTable
              headers={["Metric", "Value"]}
              rows={[
                ["PV", fmtMoney(ctx.evm.pv, p.currency)],
                ["EV", fmtMoney(ctx.evm.ev, p.currency)],
                ["AC", fmtMoney(ctx.evm.ac, p.currency)],
                ["SPI", ctx.evm.spi == null ? "—" : ctx.evm.spi.toFixed(2)],
                ["CPI", ctx.evm.cpi == null ? "—" : ctx.evm.cpi.toFixed(2)],
                ["BAC", fmtMoney(ctx.evm.bac, p.currency)],
                ["EAC", fmtMoney(ctx.evm.eac, p.currency)],
                ["VAC", fmtMoney(ctx.evm.vac, p.currency)],
              ]}
            />
          )}
        </ReportSection>
      ) : null}

      {sections.risks ? (
        <ReportSection title="Risk Summary">
          {ctx.openRisks.length === 0 ? (
            <ReportEmptyNote text="No open risks." />
          ) : (
            <ReportTable headers={["Title", "Severity", "Owner"]} rows={ctx.openRisks.map((r) => [r.title, riskSeverity(r), r.owner || "—"])} />
          )}
        </ReportSection>
      ) : null}

      {sections.issues ? (
        <ReportSection title="Issue Summary">
          {ctx.openIssues.length === 0 ? (
            <ReportEmptyNote text="No open issues." />
          ) : (
            <ReportTable headers={["Title", "Severity", "Owner"]} rows={ctx.openIssues.map((r) => [r.title, riskSeverity(r), r.owner || "—"])} />
          )}
        </ReportSection>
      ) : null}

      {sections.rfis ? (
        <ReportSection title="RFI / TQ Summary">
          {ctx.openRfis.length === 0 ? (
            <ReportEmptyNote text="No open RFIs/TQs." />
          ) : (
            <ReportTable headers={["Number", "Subject", "Status"]} rows={ctx.openRfis.map((r) => [r.number, r.subject, r.status])} />
          )}
        </ReportSection>
      ) : null}

      {sections.changes ? (
        <ReportSection title="Change Order Summary">
          {ctx.allChangeOrders.length === 0 ? (
            <ReportEmptyNote text="No Change Orders." />
          ) : (
            <ReportTable headers={["Number", "Title", "Status"]} rows={ctx.allChangeOrders.map((co) => [co.number, co.title, co.status])} />
          )}
        </ReportSection>
      ) : null}

      {sections.dailylog ? (
        <ReportSection title="Daily Site Log Summary">
          {ctx.dailyLogs.length === 0 ? (
            <ReportEmptyNote text="No Daily Log entries." />
          ) : (
            <ReportEmptyNote text={ctx.dailyLogs.length + " entries logged, " + ctx.dailyLogs.filter((l) => l.incidents && l.incidents.trim()).length + " with incidents noted."} />
          )}
        </ReportSection>
      ) : null}

      {sections.meetings ? (
        <ReportSection title="Meeting Action Summary">
          {ctx.overdueMeetingActions.length === 0 ? (
            <ReportEmptyNote text="No outstanding meeting actions." />
          ) : (
            <ReportTable headers={["Meeting", "Action", "Due"]} rows={ctx.overdueMeetingActions.map((a) => [a.meetingTitle, a.description, a.dueDate])} />
          )}
        </ReportSection>
      ) : null}
    </div>
  );
}

function OutputTab({ data, ctx, health, diagnostics }: ReportDocProps) {
  const [mode, setMode] = useState("snapshot");
  const [packSections, setPackSections] = useState<{ [key: string]: boolean }>({
    cover: true, summary: true, snapshot: true, kpis: true, progress: true,
    schedule: true, statusDate: true, delayRecovery: true, schedulePerformance: true,
    milestones: true, cost: true, evm: true, risks: true,
    issues: true, rfis: true, changes: true, dailylog: true, meetings: true,
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [savingAsNew, setSavingAsNew] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [, forceRefresh] = useState(0);

  var packTemplates = data.report_templates.filter((t) => t.report_type === "management_pack");
  var currentTemplate = packTemplates.find((t) => t.id === selectedTemplateId);

  return (
    <>
      <div className="toolbar no-print">
        <select aria-label="Report mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="snapshot">Project Snapshot (1-page)</option>
          <option value="pack">Management Pack</option>
        </select>
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      {mode === "pack" ? (
        <div className="panel no-print" style={{ marginBottom: "var(--space-4)" }}>
          <h4 style={{ marginBottom: "var(--space-2)" }}>Sections to include</h4>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
            <span style={{ fontSize: "var(--text-sm)" }} id="mgmtpack-template-label">Template:</span>
            <select
              aria-labelledby="mgmtpack-template-label"
              value={selectedTemplateId}
              onChange={(e) => {
                var chosen = packTemplates.find((t) => t.id === e.target.value);
                if (chosen) {
                  var applied: { [key: string]: boolean } = {};
                  Object.keys(PACK_SECTION_LABELS).forEach((k) => (applied[k] = chosen!.sections[k] !== false));
                  setPackSections(applied);
                  setSelectedTemplateId(chosen.id);
                } else {
                  setSelectedTemplateId("");
                }
              }}
            >
              <option value="">— Custom selection —</option>
              {packTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {currentTemplate ? (
              <>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    updatePackTemplate(currentTemplate!.id, packSections);
                    window.PCC.notify("Template updated.", "success");
                    forceRefresh((n) => n + 1);
                  }}
                >
                  Save Changes
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    if (!window.confirm('Delete the template "' + currentTemplate!.name + '"? This can\'t be undone.')) return;
                    deletePackTemplate(currentTemplate!.id);
                    setSelectedTemplateId("");
                    window.PCC.notify("Template deleted.", "info");
                    forceRefresh((n) => n + 1);
                  }}
                >
                  Delete Template
                </button>
              </>
            ) : null}
            <button
              className="btn btn--ghost"
              onClick={() => {
                setSavingAsNew(true);
                setNewTemplateName("");
              }}
            >
              Save as New…
            </button>
          </div>

          {savingAsNew ? (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <input type="text" placeholder='Template name, e.g. "Client Report"' value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} />
              <button
                className="btn btn--primary"
                onClick={() => {
                  var name = newTemplateName.trim();
                  if (!name) {
                    window.PCC.notify("Enter a template name.", "warning");
                    return;
                  }
                  var newTemplate = saveNewPackTemplate(name, packSections);
                  setSelectedTemplateId(newTemplate.id);
                  setSavingAsNew(false);
                  window.PCC.notify("Template saved.", "success");
                  forceRefresh((n) => n + 1);
                }}
              >
                Save
              </button>
              <button className="btn btn--ghost" onClick={() => setSavingAsNew(false)}>
                Cancel
              </button>
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "var(--space-2)" }}>
            {Object.keys(PACK_SECTION_LABELS).map((key) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                <input
                  type="checkbox"
                  checked={!!packSections[key]}
                  onChange={(e) => setPackSections((prev) => Object.assign({}, prev, { [key]: e.target.checked }))}
                />
                {PACK_SECTION_LABELS[key]}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="panel">
        {mode === "snapshot" ? (
          <ProjectSnapshotDoc data={data} ctx={ctx} health={health} diagnostics={diagnostics} />
        ) : (
          <ManagementPackDoc data={data} ctx={ctx} health={health} diagnostics={diagnostics} sections={packSections} />
        )}
      </div>
    </>
  );
}

// ===== Top-level page =====

interface ExecutiveCenterPageProps {
  initialProjectId?: string;
  initialTab?: string;
}

export default function ExecutiveCenterPage({ initialProjectId, initialTab }: ExecutiveCenterPageProps) {
  const [data, setData] = useState<PCCStoreData>(() => getData());
  const [projectId, setProjectId] = useState(() => {
    var activeProjects = data.projects.filter((p) => !p.archived);
    if (initialProjectId && activeProjects.some((p) => p.id === initialProjectId)) return initialProjectId;
    var ctxProjectId = getProjectContext();
    if (ctxProjectId && activeProjects.some((p) => p.id === ctxProjectId)) return ctxProjectId;
    return activeProjects[0] ? activeProjects[0].id : "";
  });
  const [tab, setTab] = useState(initialTab || "overview");

  function refresh() {
    setData(getData());
  }

  var activeProjects = data.projects.filter((p) => !p.archived);
  var effectiveProjectId = activeProjects.some((p) => p.id === projectId) ? projectId : activeProjects[0] ? activeProjects[0].id : "";

  return (
    <>
      <h2 className="focus-mode-hide" style={{ marginBottom: "var(--space-2)" }}>
        Project Executive Center
      </h2>
      <p className="text-secondary focus-mode-hide" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
        Management rollup for one project — every number reads live from Portfolio, Schedule, Cost Tracking, Risk Register, RFI/TQ, Change Management, and Meetings.
      </p>

      <div className="toolbar no-print">
        {activeProjects.length === 0 ? (
          <select aria-label="Select project" disabled>
            <option>No projects yet — add one in Portfolio first</option>
          </select>
        ) : (
          <select
            aria-label="Select project"
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
        )}
        <div className="toolbar__spacer" />
        {[
          { key: "overview", label: "Overview" },
          { key: "weeklyReviews", label: "Weekly Reviews" },
          { key: "output", label: "Snapshot & Management Pack" },
        ].map((t) => (
          <button key={t.key} className={"btn " + (tab === t.key ? "btn--primary" : "btn--ghost")} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeProjects.length === 0 ? (
        <div className="panel empty-state">Add a project in Portfolio first to see its Executive Center.</div>
      ) : (
        (() => {
          var ctx = buildProjectContext(data, effectiveProjectId) as PopulatedProjectContext;
          var health = window.PCC.projectHealthEngine.computeHealthScore(healthContextFrom(ctx), data.settings.health_score_weights);
          var diagnostics = window.PCC.projectHealthEngine.computeDiagnostics(diagnosticsContextFrom(ctx));

          if (tab === "weeklyReviews") {
            return <WeeklyReviewsTab data={data} ctx={ctx} health={health} onProjectChanged={refresh} />;
          } else if (tab === "output") {
            return <OutputTab data={data} ctx={ctx} health={health} diagnostics={diagnostics} />;
          }
          return <OverviewTab data={data} ctx={ctx} health={health} diagnostics={diagnostics} onChanged={refresh} />;
        })()
      )}
    </>
  );
}
