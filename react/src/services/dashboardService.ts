/* Service boundary for the Dashboard (Portfolio Overview) page (master prompt §9). Thin
 * wrapper over the existing store/engine globals, unchanged from the vanilla page.
 * getData() returns a FRESH top-level object reference (see CLAUDE.md's React migration
 * notes on this rule).
 */
import type { PCCStoreData, PCCProject, PCCProjectDocumentRequirement } from "../types/pcc";

export var STATUS_LABELS: { [status: string]: string } = { on_track: "On Track", at_risk: "At Risk", critical: "Critical", complete: "Complete" };

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

export function distinctValues(projects: PCCProject[], key: keyof PCCProject): string[] {
  var seen: { [value: string]: boolean } = {};
  var out: string[] = [];
  projects.forEach(function (p) {
    var v = p[key];
    if (v && typeof v === "string" && !seen[v]) {
      seen[v] = true;
      out.push(v);
    }
  });
  out.sort();
  return out;
}

export function dueSoonWindowDays(data: PCCStoreData): number {
  return data.settings.document_reminder_due_soon_days == null ? 14 : data.settings.document_reminder_due_soon_days;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(isoDateStr: string, days: number): string {
  var d = new Date(isoDateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function computeRequirementStatus(
  data: PCCStoreData,
  projectId: string,
  documentTypeId: string,
  plannedDate: string | undefined
): "available" | "overdue" | "required" {
  var available = data.documents.some(function (d) {
    return d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at;
  });
  if (available) return "available";
  if (plannedDate && plannedDate < todayIso()) return "overdue";
  return "required";
}
export var REQUIREMENT_STATUS_BADGE: { [status: string]: { className: string; label: string } } = {
  available: { className: "complete", label: "Available" },
  overdue: { className: "critical", label: "Overdue" },
  required: { className: "at_risk", label: "Required" },
};

export interface Reminder {
  row: PCCProjectDocumentRequirement;
  status: "available" | "overdue" | "required";
}

export function computeReminders(data: PCCStoreData, activeProjects: PCCProject[]): Reminder[] {
  var typesById: { [id: string]: (typeof data.document_types)[number] } = {};
  data.document_types.forEach(function (t) {
    typesById[t.id] = t;
  });
  var projectsById: { [id: string]: PCCProject } = {};
  activeProjects.forEach(function (p) {
    projectsById[p.id] = p;
  });
  var dueSoonCutoff = addDaysIso(todayIso(), dueSoonWindowDays(data));

  var reminders: Reminder[] = data.project_document_requirements
    .filter(function (r) {
      return projectsById[r.project_id] && typesById[r.document_type_id];
    })
    .map(function (r) {
      return { row: r, status: computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date) };
    })
    .filter(function (x) {
      if (x.status === "available") return false;
      if (x.status === "overdue") return true;
      return !!(x.row.planned_submission_date && x.row.planned_submission_date <= dueSoonCutoff);
    });

  reminders.sort(function (a, b) {
    return (a.row.planned_submission_date || "").localeCompare(b.row.planned_submission_date || "");
  });

  return reminders;
}

export interface PortfolioExceptions {
  openRisks: number;
  openIssues: number;
  pendingRfis: number;
  pendingDecisions: number;
  upcomingMilestones: number;
  delayedProjects: number;
  openDelays: number;
  criticalDelays: number;
}

export function countPortfolioExceptions(data: PCCStoreData, activeProjects: PCCProject[]): PortfolioExceptions {
  var activeProjectIds: { [id: string]: boolean } = {};
  activeProjects.forEach(function (p) {
    activeProjectIds[p.id] = true;
  });
  var openRisks = 0;
  var openIssues = 0;
  data.risks.forEach(function (r) {
    if (!activeProjectIds[r.project_id] || r.status === "closed") return;
    if (r.type === "risk") openRisks++;
    else if (r.type === "issue") openIssues++;
  });
  var pendingRfis = data.rfis.filter(function (r) {
    return activeProjectIds[r.project_id] && r.status !== "closed";
  }).length;
  var pendingDecisions = data.decisions.filter(function (d) {
    return activeProjectIds[d.project_id] && d.status === "pending";
  }).length;

  var today = todayIso();
  var weekEnd = addDaysIso(today, 7);
  var upcomingMilestones = data.activities.filter(function (a) {
    if (!activeProjectIds[a.project_id] || a.activity_type !== "milestone" || a.status === "complete") return false;
    var date = a.early_start || a.planned_start;
    return date && date >= today && date <= weekEnd;
  }).length;

  var delayedProjects = 0;
  if (window.PCC.executiveCenter && window.PCC.executiveCenter.getSchedulePerformanceSummary) {
    activeProjects.forEach(function (p) {
      var summary = window.PCC.executiveCenter.getSchedulePerformanceSummary!(p.id);
      if (summary.unaddressedDelayDays > 0) delayedProjects++;
    });
  }

  var openDelays = 0;
  var criticalDelays = 0;
  if (window.PCC.executiveCenter && window.PCC.executiveCenter.getDelayImpactSummary) {
    activeProjects.forEach(function (p) {
      var summary = window.PCC.executiveCenter.getDelayImpactSummary!(p.id);
      openDelays += summary.openDelayCount;
      criticalDelays += summary.criticalDelayCount;
    });
  }

  return {
    openRisks: openRisks,
    openIssues: openIssues,
    pendingRfis: pendingRfis,
    pendingDecisions: pendingDecisions,
    upcomingMilestones: upcomingMilestones,
    delayedProjects: delayedProjects,
    openDelays: openDelays,
    criticalDelays: criticalDelays,
  };
}

export interface Alert {
  severity: string;
  description: string;
}

export interface AttentionGroup {
  project: PCCProject;
  alerts: Alert[];
  criticalCount: number;
  warningCount: number;
}

export function computeManagementAttention(data: PCCStoreData, activeProjects: PCCProject[]): AttentionGroup[] {
  var groups: AttentionGroup[] = [];
  activeProjects.forEach(function (p) {
    if (!window.PCC.executiveCenter || !window.PCC.executiveCenter.getDiagnostics) return;
    var alerts = window.PCC.executiveCenter.getDiagnostics(p.id).filter(function (a) {
      return a.severity === "critical" || a.severity === "warning";
    });
    if (alerts.length === 0) return;
    var criticalCount = alerts.filter(function (a) {
      return a.severity === "critical";
    }).length;
    groups.push({ project: p, alerts: alerts, criticalCount: criticalCount, warningCount: alerts.length - criticalCount });
  });
  groups.sort(function (a, b) {
    if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount;
    if (a.warningCount !== b.warningCount) return b.warningCount - a.warningCount;
    return (a.project.name || "").localeCompare(b.project.name || "");
  });
  return groups;
}

export function viewProjectInExecutiveCenter(projectId: string): void {
  window.PCC.executiveCenter.viewProject(projectId);
  window.PCC.router.go("executiveCenter");
}

export function viewProjectInPortfolio(projectId: string): void {
  window.PCC.portfolio.viewProject(projectId);
  window.PCC.router.go("portfolio");
}

export function goToKpiRoute(route: string, status: string | undefined): void {
  if (status !== undefined && window.PCC.portfolio && window.PCC.portfolio.filterByStatus) window.PCC.portfolio.filterByStatus(status);
  window.PCC.router.go(route);
}

export function buildContextSwitcher(prefix: string): HTMLElement {
  return window.PCC.layout.buildContextSwitcher(prefix);
}
