/* Service boundary for the Project Workspace page (master prompt §9). Thin wrapper over
 * the existing store/engine globals, unchanged from the vanilla page. getData() returns
 * a FRESH top-level object reference (see CLAUDE.md's React migration notes).
 *
 * Deliberately CPM-engine-free, same as the vanilla page — see its own header comment.
 */
import type { PCCStoreData, PCCProject, PCCActivity, PCCRisk, PCCRfi, PCCChangeOrder } from "../types/pcc";

export var STATUS_LABELS: { [status: string]: string } = { on_track: "On Track", at_risk: "At Risk", critical: "Critical", complete: "Complete" };

var SEVERITY_MATRIX: { [probability: string]: { [impact: string]: string } } = {
  high: { low: "medium", medium: "high", high: "high" },
  medium: { low: "low", medium: "medium", high: "high" },
  low: { low: "low", medium: "low", high: "medium" },
};

export interface NavItem {
  key: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export var NAV_GROUPS: NavGroup[] = [
  { label: "PLANNING & SCHEDULE", items: [{ key: "schedule", label: "Schedule" }] },
  {
    label: "PROJECT CONTROLS",
    items: [
      { key: "cost", label: "Cost Tracking" },
      { key: "commitments", label: "Commitments" },
      { key: "resources", label: "Resources" },
    ],
  },
  {
    label: "PROJECT MANAGEMENT",
    items: [
      { key: "risks", label: "Risks / Issues" },
      { key: "rfis", label: "RFI / TQ" },
      { key: "changeOrders", label: "Change Mgmt" },
      { key: "decisionRegister", label: "Decision Register" },
      { key: "meetings", label: "Meetings" },
    ],
  },
  { label: "VENDORS", items: [{ key: "vendors", label: "Vendors" }] },
  { label: "DOCUMENTS", items: [{ key: "documents", label: "Documents" }] },
  {
    label: "SITE & KNOWLEDGE",
    items: [
      { key: "dailylog", label: "Daily Log" },
      { key: "lessonsLearned", label: "Lessons Learned" },
      { key: "knowledgeBase", label: "Knowledge Base" },
    ],
  },
  { label: "REPORTING", items: [{ key: "reports", label: "Reports" }] },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function riskSeverity(r: PCCRisk): string {
  return r.probability && SEVERITY_MATRIX[r.probability] ? SEVERITY_MATRIX[r.probability][r.impact || ""] || "medium" : "medium";
}

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

export function fmtMoney(value: number | string | null | undefined, currency: string | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  var num = Number(value);
  if (Number.isNaN(num)) return "—";
  return (currency ? currency + " " : "") + num.toLocaleString();
}

export function computeScheduleStatus(data: PCCStoreData, projectId: string): string {
  var todayIso = today();
  var behind = data.activities.some(function (a) {
    if (a.project_id !== projectId) return false;
    if (a.activity_type !== "task" && a.activity_type !== "milestone") return false;
    return (
      (a.status === "not_started" && a.planned_start && a.planned_start < todayIso) ||
      (a.status === "in_progress" && a.planned_finish && a.planned_finish < todayIso)
    );
  });
  return behind ? "Behind Schedule" : "On Schedule";
}

export interface KeyMilestone {
  activity: PCCActivity;
  date: string;
}

export function computeKeyMilestone(data: PCCStoreData, projectId: string): KeyMilestone | null {
  var scheduleIds = data.schedules
    .filter(function (s) {
      return s.project_id === projectId;
    })
    .map(function (s) {
      return s.id;
    });
  var candidates: KeyMilestone[] = data.activities
    .filter(function (a) {
      return scheduleIds.indexOf(a.schedule_id) !== -1 && a.activity_type === "milestone" && a.status !== "complete";
    })
    .map(function (a) {
      return { activity: a, date: (a.early_start || a.planned_start) as string };
    })
    .filter(function (x) {
      return x.date;
    });
  candidates.sort(function (a, b) {
    return a.date < b.date ? -1 : 1;
  });
  return candidates.length > 0 ? candidates[0] : null;
}

export interface OverdueMeetingAction {
  meetingId: string;
  meetingTitle: string;
  description?: string;
}

export interface ProjectStats {
  openRisks: number;
  criticalRisks: PCCRisk[];
  openRfis: number;
  overdueRfis: PCCRfi[];
  docsAvailable: number;
  docsTotal: number;
  overdueDocs: string[];
  pendingChangeOrders: PCCChangeOrder[];
  overdueMeetingActions: OverdueMeetingAction[];
  costSummary: { budgeted: number; actual: number };
}

export function projectStats(data: PCCStoreData, projectId: string): ProjectStats {
  var todayIso = today();
  var projectRisks = data.risks.filter(function (r) {
    return r.project_id === projectId;
  });
  var openRisks = projectRisks.filter(function (r) {
    return r.status !== "closed";
  });
  var criticalRisks = openRisks.filter(function (r) {
    return riskSeverity(r) === "high";
  });

  var projectRfis = data.rfis.filter(function (r) {
    return r.project_id === projectId;
  });
  var openRfis = projectRfis.filter(function (r) {
    return r.status !== "closed";
  });
  var overdueRfis = openRfis.filter(function (r) {
    return !!(r.date_required && r.date_required < todayIso);
  });

  var docTypesById: { [id: string]: (typeof data.document_types)[number] } = {};
  data.document_types.forEach(function (t) {
    docTypesById[t.id] = t;
  });
  var requirements = data.project_document_requirements.filter(function (r) {
    return r.project_id === projectId && docTypesById[r.document_type_id];
  });
  var overdueDocs: string[] = [];
  var docsAvailable = 0;
  requirements.forEach(function (r) {
    var available = data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === r.document_type_id && !d.trashed_at;
    });
    if (available) {
      docsAvailable++;
    } else if (r.planned_submission_date && r.planned_submission_date < todayIso) {
      overdueDocs.push(docTypesById[r.document_type_id].name);
    }
  });

  var pendingChangeOrders = data.change_orders.filter(function (co) {
    return co.project_id === projectId && co.status === "pending";
  });

  var overdueMeetingActions: OverdueMeetingAction[] = [];
  data.meetings
    .filter(function (m) {
      return m.project_id === projectId;
    })
    .forEach(function (m) {
      (m.actions || []).forEach(function (a) {
        if (a.status === "open" && a.due_date && a.due_date < todayIso) {
          overdueMeetingActions.push({ meetingId: m.id, meetingTitle: m.title || "(untitled)", description: a.description });
        }
      });
    });

  var costSummary = window.PCC.cost ? window.PCC.cost.projectCostSummary(data, projectId) : { budgeted: 0, actual: 0 };

  return {
    openRisks: openRisks.length,
    criticalRisks: criticalRisks,
    openRfis: openRfis.length,
    overdueRfis: overdueRfis,
    docsAvailable: docsAvailable,
    docsTotal: requirements.length,
    overdueDocs: overdueDocs,
    pendingChangeOrders: pendingChangeOrders,
    overdueMeetingActions: overdueMeetingActions,
    costSummary: costSummary,
  };
}

export interface AttentionItem {
  severity: string;
  text: string;
  nav: string;
}

export function buildAttentionItems(stats: ProjectStats): AttentionItem[] {
  var items: AttentionItem[] = [];
  stats.criticalRisks.forEach(function (r) {
    items.push({ severity: "critical", text: "Critical " + (r.type === "issue" ? "issue" : "risk") + ": " + r.title, nav: "risks" });
  });
  if (stats.costSummary.budgeted > 0 && stats.costSummary.actual > stats.costSummary.budgeted) {
    items.push({ severity: "critical", text: "Cost warning: actual cost exceeds budget", nav: "cost" });
  }
  stats.overdueRfis.forEach(function (r) {
    items.push({ severity: "warning", text: "Overdue RFI/TQ: " + r.number + " " + r.subject, nav: "rfis" });
  });
  if (stats.overdueDocs.length > 0) {
    items.push({
      severity: "warning",
      text: "Overdue document" + (stats.overdueDocs.length > 1 ? "s" : "") + ": " + stats.overdueDocs.join(", "),
      nav: "documents",
    });
  }
  stats.overdueMeetingActions.forEach(function (a) {
    items.push({ severity: "warning", text: "Outstanding action (" + a.meetingTitle + "): " + a.description, nav: "meetings" });
  });
  stats.pendingChangeOrders.forEach(function (co) {
    items.push({ severity: "info", text: "Pending approval: " + co.number + " " + co.title, nav: "changeOrders" });
  });
  return items;
}

export interface DatedItem {
  date: string;
  text: string;
}

export function buildUpcomingItems(data: PCCStoreData, projectId: string, windowDays: number): DatedItem[] {
  var todayIso = today();
  var cutoff = window.PCC.scheduleGanttLayout.addDays(todayIso, windowDays);
  var items: DatedItem[] = [];

  var projectSchedules = data.schedules.filter(function (s) {
    return s.project_id === projectId;
  });
  var scheduleIds = projectSchedules.map(function (s) {
    return s.id;
  });
  data.activities
    .filter(function (a) {
      return scheduleIds.indexOf(a.schedule_id) !== -1 && a.activity_type === "milestone";
    })
    .forEach(function (a) {
      if (a.planned_start && a.planned_start >= todayIso && a.planned_start <= cutoff) {
        items.push({ date: a.planned_start, text: "Milestone: " + a.name });
      }
    });

  data.meetings
    .filter(function (m) {
      return m.project_id === projectId && m.meeting_date && m.meeting_date >= todayIso && m.meeting_date <= cutoff;
    })
    .forEach(function (m) {
      items.push({ date: m.meeting_date as string, text: "Meeting: " + (m.title || "(untitled)") });
    });

  data.rfis
    .filter(function (r) {
      return r.project_id === projectId && r.status !== "closed" && r.date_required && r.date_required >= todayIso && r.date_required <= cutoff;
    })
    .forEach(function (r) {
      items.push({ date: r.date_required as string, text: "RFI Due: " + r.number + " " + r.subject });
    });

  items.sort(function (a, b) {
    return a.date < b.date ? -1 : 1;
  });
  return items;
}

export function buildRecentActivity(data: PCCStoreData, projectId: string): DatedItem[] {
  var items: { date: string | undefined; text: string }[] = [];
  data.risks
    .filter(function (r) {
      return r.project_id === projectId;
    })
    .forEach(function (r) {
      items.push({
        date: r.updated_at,
        text: (r.type === "risk" ? "Risk" : r.type === "issue" ? "Issue" : "Opportunity") + " “" + r.title + "” " + (r.status === "closed" ? "closed" : "logged/updated"),
      });
    });
  data.meetings
    .filter(function (m) {
      return m.project_id === projectId;
    })
    .forEach(function (m) {
      items.push({ date: m.updated_at, text: "Meeting “" + (m.title || "(untitled)") + "” logged" });
    });
  data.rfis
    .filter(function (r) {
      return r.project_id === projectId;
    })
    .forEach(function (r) {
      items.push({ date: r.updated_at, text: r.number + " " + (r.status === "answered" ? "answered" : r.status === "closed" ? "closed" : "submitted") });
    });
  data.change_orders
    .filter(function (co) {
      return co.project_id === projectId;
    })
    .forEach(function (co) {
      items.push({ date: co.updated_at, text: co.number + " " + co.status });
    });
  data.documents
    .filter(function (d) {
      return d.project_id === projectId && !d.trashed_at;
    })
    .forEach(function (d) {
      items.push({ date: d.uploaded_at, text: "Document “" + d.filename + "” uploaded" });
    });
  data.daily_logs
    .filter(function (l) {
      return l.project_id === projectId;
    })
    .forEach(function (l) {
      items.push({ date: l.updated_at || l.created_at, text: "Daily Log entry for " + l.log_date });
    });

  return (items.filter(function (i) {
    return i.date;
  }) as DatedItem[])
    .sort(function (a, b) {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    })
    .slice(0, 10);
}

export function navigateToModule(key: string, projectId: string): void {
  if (key === "executiveCenter" && window.PCC.executiveCenter) {
    window.PCC.executiveCenter.viewProject(projectId);
  } else if (key === "documents" && window.PCC.files) {
    window.PCC.files.filterByProject(projectId);
  } else if (key === "reports") {
    window.PCC.projectContext.set(projectId);
  } else if ((window.PCC as any)[key] && typeof (window.PCC as any)[key].filterByProject === "function") {
    (window.PCC as any)[key].filterByProject(projectId);
  } else if ((window.PCC as any)[key] && typeof (window.PCC as any)[key].viewProject === "function") {
    (window.PCC as any)[key].viewProject(projectId);
  }
  window.PCC.router.go(key);
}
