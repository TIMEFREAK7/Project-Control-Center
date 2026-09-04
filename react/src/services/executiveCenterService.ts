/* Project Executive Center (Gate 9) — service layer for the React migration
 * (Post-Phase-5 Engineering Evolution, Batch F part 4, the last of the "big four").
 * buildProjectContext()/healthContextFrom()/diagnosticsContextFrom() and every
 * "autoXText()" default-summary generator are ported here verbatim from the original
 * vanilla page (git history) — this is the single heaviest calculation surface in the
 * whole app (Schedule/Cost/EVM/Risk/RFI/Change/Meetings/Documents/Resources/Recovery/
 * Delay/Decisions rollup for one project), never reimplemented, only relocated.
 *
 * window.PCC.executiveCenter's public API (getHealthSummary/getSchedulePerformanceSummary/
 * getDiagnostics/getDelayImpactSummary/viewProject) is attached at the bottom of this
 * file rather than living in src/js/pages/executiveCenter.js (the stub) — unlike every
 * other migrated page's "calc stays in the stub" pattern (see cost.js's
 * projectCostSummary), because EVERY external caller of window.PCC.executiveCenter.* is
 * itself an already-migrated React service (portfolioService.js, dashboardService.js,
 * myWorkService.js, projectWorkspaceService.js) bundled into this same react-bundle.js —
 * there is no remaining vanilla caller left to force the logic into the stub. The stub
 * still owns viewProject()'s own pending-prop plumbing (it must — only the stub's
 * render() function can consume a one-shot pending prop before mount), so this file's
 * own viewProject forwards to it.
 */
import type {
  PCCStoreData,
  PCCProject,
  PCCSchedule,
  PCCActivity,
  PCCRisk,
  ProjectContext,
  NamedRef,
  CpmResult,
  HealthScoreResult,
  DiagnosticAlert,
  ExecutiveCenterHealthSummary,
  ExecutiveCenterSchedulePerformanceSummary,
  WeeklyReviewSnapshot,
  PCCWeeklyReview,
} from "../types/pcc";

export var SEVERITY_MATRIX: { [probability: string]: { [impact: string]: string } } = {
  high: { low: "medium", medium: "high", high: "high" },
  medium: { low: "low", medium: "medium", high: "high" },
  low: { low: "low", medium: "low", high: "medium" },
};
export var RISK_LEVELS = ["low", "medium", "high"];
export var RAG_LABELS: { [rag: string]: string } = { on_track: "On Track", at_risk: "At Risk", critical: "Critical", unknown: "Not Yet Scored" };
export var RAG_COLOR_VAR: { [rag: string]: string } = { on_track: "--status-on-track", at_risk: "--status-at-risk", critical: "--status-critical", unknown: "--text-secondary" };
export var SEVERITY_LABEL: { [severity: string]: string } = { critical: "Critical", warning: "Warning", info: "Info" };
export var DIAGNOSTICS_ICON_CLASS: { [severity: string]: string } = { critical: "critical", warning: "warning", info: "info" };
export var ACTIVITY_STATUS_LABEL_MAP: { [status: string]: string } = { not_started: "Not Started", in_progress: "In Progress", complete: "Complete", on_hold: "On Hold" };

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fmtMoney(amount: number | string | null | undefined, currency: string | undefined): string {
  if (amount === null || amount === undefined || amount === "" || isNaN(Number(amount))) return "—";
  var n = Number(amount);
  return (currency ? currency + " " : "") + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Math.round(n) + "%";
}

export function riskSeverity(r: PCCRisk): string {
  return SEVERITY_MATRIX[r.probability || ""] ? SEVERITY_MATRIX[r.probability || ""][r.impact || ""] : "medium";
}

function pickPrimarySchedule(schedules: PCCSchedule[]): PCCSchedule | null {
  if (schedules.length === 0) return null;
  var active = schedules.filter(function (s) {
    return s.status === "active";
  });
  var pool = active.length ? active : schedules;
  return pool
    .slice()
    .sort(function (a, b) {
      if (a.revision_number !== b.revision_number) return b.revision_number - a.revision_number;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })[0];
}

/** Every number the rest of this page needs, in one place, so KPIs/health/diagnostics/
 * summary/charts/snapshot all read from the same computed values instead of five
 * slightly-different re-derivations of "what's overdue." */
export function buildProjectContext(data: PCCStoreData, projectId: string): ProjectContext {
  var project = data.projects.find(function (p) {
    return p.id === projectId;
  });
  var todayIso = today();
  var ctx: ProjectContext = { project: project, todayIso: todayIso };
  if (!project) return ctx;

  // ---- Schedule ----
  var projectSchedules = data.schedules.filter(function (s) {
    return s.project_id === projectId;
  });
  var schedule = pickPrimarySchedule(projectSchedules);
  ctx.schedule = schedule;
  ctx.scheduleCount = projectSchedules.length;

  var activities = schedule
    ? data.activities.filter(function (a) {
        return a.schedule_id === (schedule as PCCSchedule).id;
      })
    : [];
  var relationships = schedule
    ? data.relationships.filter(function (r) {
        return r.schedule_id === (schedule as PCCSchedule).id;
      })
    : [];
  ctx.activities = activities;
  ctx.relationships = relationships;

  var cpm: CpmResult | null = null;
  if (schedule && activities.length > 0) {
    cpm = window.PCC.scheduleCpmEngine.calculateSchedule(activities, relationships, {
      dataDate: (schedule as any).data_date,
      nearCriticalThresholdDays: schedule.near_critical_threshold_days,
      calculationMode: (schedule as any).calculation_mode,
      calendarAware: (schedule as any).calendar_aware,
      honorConstraints: (schedule as any).constraints_enabled,
      calendars: (data.calendars || []).filter(function (c) {
        return c.project_id === projectId;
      }),
    });
  }
  ctx.cpm = cpm;

  var referenceDate = (schedule && (schedule as any).data_date) || todayIso;
  ctx.referenceDate = referenceDate;

  var criticalActivities: NamedRef[] = [];
  var nearCriticalActivities: NamedRef[] = [];
  var delayedActivities: (NamedRef & { finish?: string | null })[] = [];
  var completedCount = 0;
  var plannedDates: string[] = [];
  var weightedProgressNumerator = 0;
  var weightedProgressDenominator = 0;
  var weightedPhysicalNumerator = 0;
  var inProgressCount = 0;
  var notStartedCount = 0;
  var remainingDurationTotal = 0;
  var remainingDurationMissingCount = 0;
  var forecastLateActivities: (NamedRef & { plannedFinish?: string; forecastFinish?: string; varianceDays: number })[] = [];
  var outOfSequenceActivities: NamedRef[] = [];

  activities.forEach(function (a) {
    var r = cpm && cpm.results[a.id];
    var totalFloat = r ? r.total_float : a.total_float;
    var earlyFinish = r ? r.early_finish : a.early_finish;
    var effectiveFinish = earlyFinish || a.planned_finish;
    var isOutOfSequence = r ? r.is_out_of_sequence : (a as any).is_out_of_sequence;
    if (isOutOfSequence) outOfSequenceActivities.push({ id: a.id, name: a.name });

    if (totalFloat != null && totalFloat <= 0) criticalActivities.push({ id: a.id, name: a.name });
    else if (totalFloat != null && totalFloat > 0 && totalFloat <= (schedule ? schedule.near_critical_threshold_days || 5 : 5)) {
      nearCriticalActivities.push({ id: a.id, name: a.name });
    }
    if (effectiveFinish && effectiveFinish < referenceDate && a.status !== "complete") {
      delayedActivities.push({ id: a.id, name: a.name, finish: effectiveFinish });
    }
    if (a.status === "complete") {
      completedCount++;
    } else if (a.status === "in_progress") {
      inProgressCount++;
      if ((a as any).remaining_duration != null) remainingDurationTotal += Number((a as any).remaining_duration) || 0;
      else remainingDurationMissingCount++;
    } else if (a.status === "not_started") {
      notStartedCount++;
      if ((a as any).duration != null) remainingDurationTotal += Number((a as any).duration) || 0;
    }
    if (a.status !== "complete" && earlyFinish && a.planned_finish && earlyFinish > a.planned_finish) {
      forecastLateActivities.push({
        id: a.id,
        name: a.name,
        plannedFinish: a.planned_finish,
        forecastFinish: earlyFinish,
        varianceDays: window.PCC.scheduleGanttLayout.diffDays(a.planned_finish, earlyFinish),
      });
    }
    if (a.planned_start) plannedDates.push(a.planned_start);
    if (a.planned_finish) plannedDates.push(a.planned_finish);

    var weight = (a as any).duration != null && (a as any).duration > 0 ? (a as any).duration : 1;
    weightedProgressNumerator += weight * (Number(a.percent_complete) || 0);
    weightedProgressDenominator += weight;
    weightedPhysicalNumerator += weight * (Number((a as any).physical_progress) || 0);
  });
  forecastLateActivities.sort(function (a, b) {
    return b.varianceDays - a.varianceDays;
  });

  ctx.totalActivityCount = activities.length;
  ctx.criticalActivities = criticalActivities;
  ctx.nearCriticalActivities = nearCriticalActivities;
  ctx.delayedActivities = delayedActivities;
  ctx.completedActivityCount = completedCount;
  ctx.inProgressActivityCount = inProgressCount;
  ctx.notStartedActivityCount = notStartedCount;
  ctx.remainingDurationTotalDays = remainingDurationTotal;
  ctx.remainingDurationMissingCount = remainingDurationMissingCount;
  ctx.forecastLateActivities = forecastLateActivities;
  ctx.outOfSequenceActivities = outOfSequenceActivities;
  ctx.baselineCount = schedule
    ? data.schedule_baselines.filter(function (b) {
        return b.schedule_id === (schedule as PCCSchedule).id;
      }).length
    : 0;
  ctx.scheduleProgressPct = weightedProgressDenominator > 0 ? weightedProgressNumerator / weightedProgressDenominator : null;
  ctx.physicalProgressPct = weightedProgressDenominator > 0 ? weightedPhysicalNumerator / weightedProgressDenominator : null;
  ctx.plannedStart = plannedDates.length
    ? plannedDates.reduce(function (a, b) {
        return a < b ? a : b;
      })
    : project.start_date || null;
  ctx.plannedFinish = plannedDates.length
    ? plannedDates.reduce(function (a, b) {
        return a > b ? a : b;
      })
    : project.finish_date || null;
  ctx.plannedDurationDays = ctx.plannedStart && ctx.plannedFinish ? window.PCC.scheduleGanttLayout.diffDays(ctx.plannedStart, ctx.plannedFinish) : null;
  ctx.forecastFinish = cpm && cpm.projectFinish ? cpm.projectFinish : (project as any).forecast_finish_date || null;
  ctx.forecastFinishSource = cpm && cpm.projectFinish ? "calculated" : (project as any).forecast_finish_date ? "manual" : "none";
  ctx.forecastVarianceDays = cpm ? cpm.forecastVarianceDays ?? null : null;
  ctx.officialBaseline =
    data.schedule_baselines.find(function (b) {
      return b.project_id === projectId && b.is_official;
    }) || null;
  if (ctx.officialBaseline && ctx.officialBaseline.baseline_project_finish && cpm && cpm.projectFinish) {
    ctx.forecastVarianceDays = window.PCC.scheduleGanttLayout.diffDays(ctx.officialBaseline.baseline_project_finish, cpm.projectFinish);
    ctx.scheduleVarianceSource = "official_baseline";
  } else {
    ctx.scheduleVarianceSource = "planned_finish";
  }

  // Milestones
  var milestoneActivities = activities.filter(function (a) {
    return a.activity_type === "milestone";
  });
  var upcomingMilestones: (NamedRef & { date: string })[] = [];
  var slippedMilestones: (NamedRef & { varianceDays: number })[] = [];
  milestoneActivities.forEach(function (a) {
    var r = cpm && cpm.results[a.id];
    var calcDate = r ? r.early_start : a.early_start;
    var effDate = calcDate || a.planned_start;
    if (effDate && effDate >= todayIso) upcomingMilestones.push({ id: a.id, name: a.name, date: effDate });
    if (calcDate && a.planned_start && calcDate > a.planned_start) {
      slippedMilestones.push({
        id: a.id,
        name: a.name,
        varianceDays: window.PCC.scheduleGanttLayout.diffDays(a.planned_start, calcDate),
      });
    }
  });
  upcomingMilestones.sort(function (a, b) {
    return a.date < b.date ? -1 : 1;
  });
  ctx.upcomingMilestones = upcomingMilestones;
  ctx.slippedMilestones = slippedMilestones;

  // ---- Cost ----
  var costSummary = window.PCC.cost ? window.PCC.cost.projectCostSummary(data, projectId) : { budgeted: 0, actual: 0, variance: 0, usingPortfolioBudget: false };
  ctx.costSummary = costSummary;
  var budgetItems = data.cost_budget_items.filter(function (b) {
    return b.project_id === projectId;
  });
  var actuals = data.cost_actuals.filter(function (a) {
    return a.project_id === projectId;
  });
  ctx.budgetItemCount = budgetItems.length;
  ctx.evm =
    budgetItems.length > 0
      ? window.PCC.costEvmEngine.computeEvm(budgetItems, actuals, activities, schedule ? [schedule] : [], {
          bac: costSummary.budgeted,
        })
      : null;

  var dataDateForEvm = (schedule && (schedule as any).data_date) || null;
  ctx.earnedSchedule =
    ctx.evm && ctx.evm.ev != null ? window.PCC.costEvmEngine.computeEarnedSchedule(budgetItems, activities, { ev: ctx.evm.ev, dataDate: dataDateForEvm }) : null;
  ctx.schedulePerformance = window.PCC.schedulePerformanceEngine.computeSchedulePerformanceScore({
    spi: ctx.evm ? ctx.evm.spi : null,
    spiT: ctx.earnedSchedule && !ctx.earnedSchedule.insufficientData ? ctx.earnedSchedule.spiT : null,
    scheduleVarianceDays: ctx.earnedSchedule && !ctx.earnedSchedule.insufficientData ? ctx.earnedSchedule.scheduleVarianceDays : null,
    plannedDurationDays: ctx.plannedDurationDays,
    criticalCount: ctx.criticalActivities.length,
    totalActivityCount: ctx.totalActivityCount,
  });
  ctx.schedulePerformanceSnapshots = data.schedule_performance_snapshots
    .filter(function (s) {
      return s.project_id === projectId;
    })
    .sort(function (a, b) {
      return new Date(b.captured_at || "").getTime() - new Date(a.captured_at || "").getTime();
    });

  var COMMITMENT_RISK_WINDOW_DAYS = 7;
  function commitmentAtRisk(c: (typeof data.commitments)[number]): boolean {
    if (!c.activity_id || c.status === "approved" || c.status === "closed" || c.status === "cancelled") return false;
    var act = data.activities.find(function (a) {
      return a.id === c.activity_id;
    });
    if (!act || act.activity_type === "milestone") return false;
    var start = act.early_start || act.planned_start || null;
    if (!start) return false;
    var cutoff = new Date(todayIso + "T00:00:00Z");
    cutoff.setUTCDate(cutoff.getUTCDate() + COMMITMENT_RISK_WINDOW_DAYS);
    return start <= cutoff.toISOString().slice(0, 10);
  }

  var projectCommitments = data.commitments.filter(function (c) {
    return c.project_id === projectId;
  });
  var commitmentTotals = { committed: 0, approved: 0, actual: 0, remaining: 0, atRisk: 0 };
  projectCommitments.forEach(function (c) {
    var actual = data.cost_actuals
      .filter(function (a) {
        return a.commitment_id === c.id;
      })
      .reduce(function (sum, a) {
        return sum + (Number(a.amount) || 0);
      }, 0);
    commitmentTotals.committed += Number(c.committed_value) || 0;
    commitmentTotals.approved += Number((c as any).approved_value) || 0;
    commitmentTotals.actual += actual;
    if (c.committed_value != null) commitmentTotals.remaining += Number(c.committed_value) - actual;
    if (commitmentAtRisk(c)) commitmentTotals.atRisk++;
  });
  ctx.commitmentSummary = Object.assign({ count: projectCommitments.length }, commitmentTotals);

  // ---- Risks / Issues / Opportunities ----
  var projectRisks = data.risks.filter(function (r) {
    return r.project_id === projectId;
  });
  var openRisks = projectRisks.filter(function (r) {
    return r.status !== "closed" && r.type === "risk";
  });
  var openIssues = projectRisks.filter(function (r) {
    return r.status !== "closed" && r.type === "issue";
  });
  var openOpportunities = projectRisks.filter(function (r) {
    return r.status !== "closed" && r.type === "opportunity";
  });
  ctx.allRisks = projectRisks;
  ctx.openRisks = openRisks;
  ctx.openIssues = openIssues;
  ctx.openOpportunities = openOpportunities;
  ctx.highRisks = openRisks.filter(function (r) {
    return riskSeverity(r) === "high";
  });
  ctx.criticalIssues = openIssues.filter(function (r) {
    return riskSeverity(r) === "high";
  });

  // ---- RFI / TQ ----
  var projectRfis = data.rfis.filter(function (r) {
    return r.project_id === projectId;
  });
  var openRfis = projectRfis.filter(function (r) {
    return r.status !== "closed";
  });
  var overdueRfis = projectRfis
    .filter(function (r) {
      return r.status === "open" && r.date_required && r.date_required < todayIso;
    })
    .map(function (r) {
      return {
        id: r.id,
        number: r.number,
        subject: r.subject,
        daysOverdue: window.PCC.scheduleGanttLayout.diffDays(r.date_required as string, todayIso),
      };
    });
  var answeredRfis = projectRfis.filter(function (r) {
    return r.date_answered && r.date_raised;
  });
  var avgResponseDays =
    answeredRfis.length > 0
      ? answeredRfis.reduce(function (sum, r) {
          return sum + window.PCC.scheduleGanttLayout.diffDays(r.date_raised as string, r.date_answered as string);
        }, 0) / answeredRfis.length
      : null;
  ctx.allRfis = projectRfis;
  ctx.openRfis = openRfis;
  ctx.overdueRfis = overdueRfis;
  ctx.avgRfiResponseDays = avgResponseDays;

  // ---- Change Orders ----
  var projectChangeOrders = data.change_orders.filter(function (co) {
    return co.project_id === projectId;
  });
  var pendingChangeOrders = projectChangeOrders.filter(function (co) {
    return co.status === "pending";
  });
  ctx.allChangeOrders = projectChangeOrders;
  ctx.openChangeOrders = projectChangeOrders.filter(function (co) {
    return co.status === "pending" || co.status === "approved";
  });
  ctx.pendingChangeOrders = pendingChangeOrders;
  ctx.approvedChangeOrders = projectChangeOrders.filter(function (co) {
    return co.status === "approved";
  });
  ctx.rejectedChangeOrders = projectChangeOrders.filter(function (co) {
    return co.status === "rejected";
  });

  // ---- Meetings / overdue actions ----
  var projectMeetings = data.meetings.filter(function (m) {
    return m.project_id === projectId;
  });
  var overdueMeetingActions: { meetingId: string; meetingTitle: string; description?: string; dueDate?: string }[] = [];
  projectMeetings.forEach(function (m) {
    (m.actions || []).forEach(function (a) {
      if (a.status === "open" && a.due_date && a.due_date < todayIso) {
        overdueMeetingActions.push({ meetingId: m.id, meetingTitle: m.title || "(untitled)", description: a.description, dueDate: a.due_date });
      }
    });
  });
  ctx.meetings = projectMeetings;
  ctx.overdueMeetingActions = overdueMeetingActions;
  var upcomingMeetings = projectMeetings
    .filter(function (m) {
      return m.meeting_date && m.meeting_date >= todayIso;
    })
    .sort(function (a, b) {
      return (a.meeting_date as string) < (b.meeting_date as string) ? -1 : 1;
    });
  ctx.upcomingMeetings = upcomingMeetings;

  // ---- Documents / Daily Log ----
  ctx.documents = data.documents.filter(function (d) {
    return d.project_id === projectId && !d.trashed_at;
  });
  ctx.dailyLogs = data.daily_logs.filter(function (l) {
    return l.project_id === projectId;
  });

  // ---- Resources ----
  var allProjectActivityIds: { [id: string]: boolean } = {};
  data.activities.forEach(function (a) {
    if (a.project_id === projectId) allProjectActivityIds[a.id] = true;
  });
  var projectAssignments = data.resource_assignments.filter(function (a) {
    return !!a.activity_id && allProjectActivityIds[a.activity_id];
  });
  var assignedResourceIds: { [id: string]: boolean } = {};
  projectAssignments.forEach(function (a) {
    if (a.resource_id) assignedResourceIds[a.resource_id] = true;
  });
  var portfolioOverAlloc = window.PCC.resourceLevelingEngine
    ? window.PCC.resourceLevelingEngine.portfolioOverAllocationSummary(data.resources, data.resource_assignments, data.activities, data.resource_unavailability)
    : [];
  var overAllocById: { [resourceId: string]: (typeof portfolioOverAlloc)[number] } = {};
  portfolioOverAlloc.forEach(function (s) {
    overAllocById[s.resourceId] = s;
  });
  ctx.assignedResourceCount = Object.keys(assignedResourceIds).length;
  ctx.overAllocatedResources = Object.keys(assignedResourceIds)
    .filter(function (id) {
      return overAllocById[id];
    })
    .map(function (id) {
      return overAllocById[id];
    });

  // ---- Document Control ----
  var docTypesById: { [id: string]: (typeof data.document_types)[number] } = {};
  data.document_types.forEach(function (t) {
    docTypesById[t.id] = t;
  });
  var projectDocRequirements = data.project_document_requirements.filter(function (r) {
    return r.project_id === projectId && docTypesById[r.document_type_id];
  });
  var docControlAvailable = 0;
  var docControlOverdue = 0;
  var docControlOverdueTypeNames: string[] = [];
  projectDocRequirements.forEach(function (r) {
    var available = data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === r.document_type_id && !d.trashed_at;
    });
    if (available) {
      docControlAvailable++;
    } else if (r.planned_submission_date && r.planned_submission_date < todayIso) {
      docControlOverdue++;
      docControlOverdueTypeNames.push(docTypesById[r.document_type_id].name);
    }
  });
  ctx.docControlTotal = projectDocRequirements.length;
  ctx.docControlAvailable = docControlAvailable;
  ctx.docControlOverdue = docControlOverdue;
  ctx.docControlOverdueTypeNames = docControlOverdueTypeNames;

  // ---- Recovery Actions ----
  var projectRecoveryActions = data.recovery_actions.filter(function (r) {
    return r.project_id === projectId;
  });
  var openRecoveryActions = projectRecoveryActions.filter(function (r) {
    return r.status === "open" || r.status === "in_progress";
  });
  var overdueRecoveryActions = openRecoveryActions.filter(function (r) {
    return r.target_recovery_date && r.target_recovery_date < todayIso;
  });
  ctx.allRecoveryActions = projectRecoveryActions;
  ctx.openRecoveryActions = openRecoveryActions;
  ctx.overdueRecoveryActions = overdueRecoveryActions;

  // ---- Delay Records + Delay<->Recovery gap ----
  var projectDelayRecords = data.delay_records.filter(function (r) {
    return r.project_id === projectId;
  });
  ctx.allDelayRecords = projectDelayRecords;
  var delayDaysByActivity: { [activityId: string]: number } = {};
  projectDelayRecords.forEach(function (r) {
    var actId = r.activity_id || "";
    delayDaysByActivity[actId] = (delayDaysByActivity[actId] || 0) + (r.delay_days || 0);
  });
  var recoveryDaysByActivity: { [activityId: string]: number } = {};
  openRecoveryActions.forEach(function (r) {
    var actId = r.activity_id || "";
    recoveryDaysByActivity[actId] = (recoveryDaysByActivity[actId] || 0) + (r.estimated_recovery_days || 0);
  });
  var unaddressedDelayActivities: { id: string; scheduleId?: string | null; name?: string; delayDays: number; recoveryDays: number; gapDays: number }[] = [];
  var totalDelayDays = 0;
  var totalUnaddressedDelayDays = 0;
  Object.keys(delayDaysByActivity).forEach(function (activityId) {
    var delayDays = delayDaysByActivity[activityId];
    var recoveryDays = recoveryDaysByActivity[activityId] || 0;
    var gapDays = Math.max(0, delayDays - recoveryDays);
    totalDelayDays += delayDays;
    totalUnaddressedDelayDays += gapDays;
    if (gapDays > 0) {
      var gapActivity = data.activities.find(function (a) {
        return a.id === activityId;
      });
      unaddressedDelayActivities.push({
        id: activityId,
        scheduleId: gapActivity ? gapActivity.schedule_id : null,
        name: gapActivity ? gapActivity.name : "(deleted activity)",
        delayDays: delayDays,
        recoveryDays: recoveryDays,
        gapDays: gapDays,
      });
    }
  });
  unaddressedDelayActivities.sort(function (a, b) {
    return b.gapDays - a.gapDays;
  });
  ctx.totalDelayDays = totalDelayDays;
  ctx.totalUnaddressedDelayDays = totalUnaddressedDelayDays;
  ctx.unaddressedDelayActivities = unaddressedDelayActivities;

  // ---- Decisions ----
  var projectDecisions = data.decisions.filter(function (d) {
    return d.project_id === projectId;
  });
  var pendingDecisions = projectDecisions.filter(function (d) {
    return d.status === "pending";
  });
  ctx.allDecisions = projectDecisions;
  ctx.pendingDecisions = pendingDecisions;

  return ctx;
}

export interface HealthContext {
  totalActivityCount?: number;
  criticalCount: number;
  nearCriticalCount: number;
  forecastVarianceDays?: number | null;
  plannedDurationDays?: number | null;
  budgetTotal: number | null;
  actualTotal: number | null;
  highRiskCount: number;
  openRiskCount: number;
  criticalIssueCount: number;
  openIssueCount: number;
  overdueRfiCount: number;
  openRfiCount: number;
  pendingChangeOrderCount: number;
}

export function healthContextFrom(ctx: ProjectContext): HealthContext {
  return {
    totalActivityCount: ctx.totalActivityCount,
    criticalCount: ctx.criticalActivities ? ctx.criticalActivities.length : 0,
    nearCriticalCount: ctx.nearCriticalActivities ? ctx.nearCriticalActivities.length : 0,
    forecastVarianceDays: ctx.forecastVarianceDays,
    plannedDurationDays: ctx.plannedDurationDays,
    budgetTotal: ctx.costSummary ? ctx.costSummary.budgeted : null,
    actualTotal: ctx.costSummary ? ctx.costSummary.actual : null,
    highRiskCount: ctx.highRisks ? ctx.highRisks.length : 0,
    openRiskCount: ctx.openRisks ? ctx.openRisks.length : 0,
    criticalIssueCount: ctx.criticalIssues ? ctx.criticalIssues.length : 0,
    openIssueCount: ctx.openIssues ? ctx.openIssues.length : 0,
    overdueRfiCount: ctx.overdueRfis ? ctx.overdueRfis.length : 0,
    openRfiCount: ctx.openRfis ? ctx.openRfis.length : 0,
    pendingChangeOrderCount: ctx.pendingChangeOrders ? ctx.pendingChangeOrders.length : 0,
  };
}

export function diagnosticsContextFrom(ctx: ProjectContext) {
  return {
    spi: ctx.evm ? ctx.evm.spi : null,
    cpi: ctx.evm ? ctx.evm.cpi : null,
    bac: ctx.evm ? ctx.evm.bac : null,
    eac: ctx.evm ? ctx.evm.eac : null,
    budgetTotal: ctx.costSummary ? ctx.costSummary.budgeted : null,
    actualTotal: ctx.costSummary ? ctx.costSummary.actual : null,
    criticalActivities: ctx.criticalActivities,
    nearCriticalActivities: ctx.nearCriticalActivities,
    slippedMilestones: ctx.slippedMilestones,
    highRisks: ctx.highRisks
      ? ctx.highRisks.map(function (r) {
          return { id: r.id, title: r.title };
        })
      : [],
    overdueRfis: ctx.overdueRfis,
    overdueMeetingActions: ctx.overdueMeetingActions,
    pendingChangeOrders: ctx.pendingChangeOrders
      ? ctx.pendingChangeOrders.map(function (co) {
          return { id: co.id, number: co.number, title: co.title };
        })
      : [],
    overdueRecoveryActions: ctx.overdueRecoveryActions
      ? ctx.overdueRecoveryActions.map(function (r) {
          return { id: r.id, description: r.description };
        })
      : [],
    pendingDecisions: ctx.pendingDecisions
      ? ctx.pendingDecisions.map(function (d) {
          return { id: d.id, title: d.title };
        })
      : [],
  };
}

export interface FloatBucket {
  label: string;
  color: string;
  value: number;
}

export function floatDistributionBuckets(activities: PCCActivity[]): FloatBucket[] {
  var buckets = [
    { label: "< 0 (over)", test: function (f: number) { return f < 0; }, color: "var(--status-critical)" },
    { label: "0 (critical)", test: function (f: number) { return f === 0; }, color: "var(--status-critical)" },
    { label: "1–5", test: function (f: number) { return f >= 1 && f <= 5; }, color: "var(--status-at-risk)" },
    { label: "6–15", test: function (f: number) { return f >= 6 && f <= 15; }, color: "var(--status-info)" },
    { label: "16+", test: function (f: number) { return f >= 16; }, color: "var(--status-on-track)" },
  ];
  var withFloat = activities.filter(function (a) {
    return a.total_float != null;
  });
  return buckets.map(function (b) {
    return {
      label: b.label,
      color: b.color,
      value: withFloat.filter(function (a) {
        return b.test(a.total_float as number);
      }).length,
    };
  });
}

// ---------------------------------------------------------------------------------
// Executive Summary — template/data-driven, never AI-generated.
// ---------------------------------------------------------------------------------

export function autoStatusText(ctx: ProjectContext): string {
  var p = ctx.project as PCCProject;
  var lines: string[] = [];
  lines.push((p.name || "This project") + " is currently " + (p.status || "on_track").replace("_", " ") + ", " + fmtPct(p.progress) + " complete overall.");
  if ((ctx.totalActivityCount || 0) > 0) {
    lines.push(
      "Schedule progress is " +
        fmtPct(ctx.scheduleProgressPct) +
        " against a planned finish of " +
        (ctx.plannedFinish || "not set") +
        "." +
        (ctx.forecastFinish
          ? " Forecast finish is " +
            ctx.forecastFinish +
            (ctx.forecastVarianceDays ? " (" + (ctx.forecastVarianceDays > 0 ? "+" : "") + ctx.forecastVarianceDays + " day(s) vs plan)" : ", on plan") +
            "."
          : "")
    );
  }
  if (ctx.costSummary && ctx.costSummary.budgeted > 0) {
    lines.push("Cost: " + fmtMoney(ctx.costSummary.actual, p.currency) + " actual against a " + fmtMoney(ctx.costSummary.budgeted, p.currency) + " budget.");
  }
  return lines.join(" ");
}

export function autoAchievementsText(ctx: ProjectContext): string {
  var lines: string[] = [];
  var completedMilestones = (ctx.activities || []).filter(function (a) {
    return a.activity_type === "milestone" && a.status === "complete";
  });
  if (completedMilestones.length) {
    lines.push(
      "Completed milestones: " +
        completedMilestones
          .map(function (a) {
            return a.name;
          })
          .join(", ") +
        "."
    );
  }
  var completedActivities = (ctx.activities || [])
    .filter(function (a) {
      return a.activity_type !== "milestone" && a.status === "complete";
    })
    .sort(function (a, b) {
      return ((b as any).duration || 0) - ((a as any).duration || 0);
    })
    .slice(0, 5);
  if (completedActivities.length) {
    lines.push(
      "Completed activities: " +
        completedActivities
          .map(function (a) {
            return a.name;
          })
          .join(", ") +
        "."
    );
  }
  if (lines.length === 0) return "No completed milestones or activities recorded yet.";
  return lines.join(" ");
}

export function autoChallengesText(ctx: ProjectContext): string {
  var lines: string[] = [];
  var delayedActivities = ctx.delayedActivities || [];
  var highRisks = ctx.highRisks || [];
  var openIssues = ctx.openIssues || [];
  var overdueRecoveryActions = ctx.overdueRecoveryActions || [];
  if (delayedActivities.length) lines.push(delayedActivities.length + " activity(ies) currently delayed.");
  if (highRisks.length)
    lines.push(
      highRisks.length +
        " open high-severity risk(s): " +
        highRisks
          .map(function (r) {
            return r.title;
          })
          .join(", ") +
        "."
    );
  if (openIssues.length) lines.push(openIssues.length + " open issue(s).");
  if (overdueRecoveryActions.length) lines.push(overdueRecoveryActions.length + " recovery action(s) overdue.");
  if (lines.length === 0) return "No significant delays, high risks, or open issues at this time.";
  return lines.join(" ");
}

export function autoAttentionText(ctx: ProjectContext): string {
  var lines: string[] = [];
  var pendingChangeOrders = ctx.pendingChangeOrders || [];
  var overdueRfis = ctx.overdueRfis || [];
  var highRisks = ctx.highRisks || [];
  var pendingDecisions = ctx.pendingDecisions || [];
  if (pendingChangeOrders.length) lines.push(pendingChangeOrders.length + " Change Order(s) awaiting a decision.");
  if (overdueRfis.length) lines.push(overdueRfis.length + " overdue RFI/TQ requiring response.");
  if (highRisks.length) lines.push(highRisks.length + " high-severity risk(s) needing a mitigation decision.");
  if (pendingDecisions.length) lines.push(pendingDecisions.length + " decision(s) pending in the Decision Register.");
  if (lines.length === 0) return "Nothing currently requires management decision or approval.";
  return lines.join(" ");
}

export function autoUpcomingText(ctx: ProjectContext): string {
  var lines: string[] = [];
  var upcomingMilestones = ctx.upcomingMilestones || [];
  var criticalActivities = ctx.criticalActivities || [];
  var upcomingMeetings = ctx.upcomingMeetings || [];
  if (upcomingMilestones.length) {
    lines.push(
      "Upcoming milestones: " +
        upcomingMilestones
          .slice(0, 5)
          .map(function (m) {
            return m.name + " (" + m.date + ")";
          })
          .join(", ") +
        "."
    );
  }
  if (criticalActivities.length) lines.push(criticalActivities.length + " critical-path activity(ies) to watch.");
  if (upcomingMeetings.length) lines.push(upcomingMeetings.length + " meeting(s) scheduled.");
  if (lines.length === 0) return "No upcoming milestones, meetings, or critical activities on record.";
  return lines.join(" ");
}

export function autoDocumentControlText(ctx: ProjectContext): string {
  if (!ctx.docControlTotal) return "No document requirements have been assigned to this project yet.";
  var lines: string[] = [];
  lines.push(ctx.docControlAvailable + " of " + ctx.docControlTotal + " required documents are Available.");
  if ((ctx.docControlOverdue || 0) > 0) {
    lines.push(ctx.docControlOverdue + " overdue: " + (ctx.docControlOverdueTypeNames || []).join(", ") + ".");
  } else {
    lines.push("Nothing is overdue.");
  }
  return lines.join(" ");
}

export interface SummarySection {
  key: string;
  label: string;
  overrideKey: string;
  auto: (ctx: ProjectContext) => string;
}

export var SUMMARY_SECTIONS: SummarySection[] = [
  { key: "status", label: "Project Status", overrideKey: "status_override", auto: autoStatusText },
  { key: "achievements", label: "Achievements", overrideKey: "achievements_override", auto: autoAchievementsText },
  { key: "challenges", label: "Challenges", overrideKey: "challenges_override", auto: autoChallengesText },
  { key: "attention", label: "Management Attention", overrideKey: "management_attention_override", auto: autoAttentionText },
  { key: "upcoming", label: "Upcoming", overrideKey: "upcoming_override", auto: autoUpcomingText },
  { key: "documentControl", label: "Document Control Status", overrideKey: "document_control_override", auto: autoDocumentControlText },
];

export function saveExecutiveSummarySection(projectId: string, overrideKey: string, value: string): void {
  window.PCC.store.update(function (d) {
    var rec = d.executive_summaries.find(function (s) {
      return s.project_id === projectId;
    });
    if (!rec) {
      rec = window.PCC.store.newExecutiveSummary({ project_id: projectId });
      d.executive_summaries.push(rec);
    }
    (rec as any)[overrideKey] = value;
    rec.updated_at = new Date().toISOString();
  });
}

export function resetExecutiveSummarySection(projectId: string, overrideKey: string): void {
  window.PCC.store.update(function (d) {
    var rec = d.executive_summaries.find(function (s) {
      return s.project_id === projectId;
    });
    if (rec) (rec as any)[overrideKey] = "";
  });
}

export function saveHealthWeight(key: string, value: string | number): void {
  window.PCC.store.update(function (d) {
    (d.settings.health_score_weights as any)[key] = Number(value) || 0;
  });
}

export function captureSchedulePerformanceSnapshot(projectId: string, ctx: ProjectContext): void {
  window.PCC.store.update(function (d) {
    d.schedule_performance_snapshots.push(
      window.PCC.store.newSchedulePerformanceSnapshot({
        project_id: projectId,
        spi: ctx.evm ? ctx.evm.spi : null,
        cpi: ctx.evm ? ctx.evm.cpi : null,
        spi_t: ctx.earnedSchedule && !ctx.earnedSchedule.insufficientData ? ctx.earnedSchedule.spiT : null,
        earned_schedule_days: ctx.earnedSchedule && !ctx.earnedSchedule.insufficientData ? ctx.earnedSchedule.earnedScheduleDays : null,
        actual_time_days: ctx.earnedSchedule && !ctx.earnedSchedule.insufficientData ? ctx.earnedSchedule.actualTimeDays : null,
        schedule_variance_days: ctx.earnedSchedule && !ctx.earnedSchedule.insufficientData ? ctx.earnedSchedule.scheduleVarianceDays : null,
        schedule_performance_score: ctx.schedulePerformance ? ctx.schedulePerformance.score : null,
        schedule_performance_rag: ctx.schedulePerformance ? ctx.schedulePerformance.rag : null,
        schedule_progress_pct: ctx.scheduleProgressPct,
      })
    );
  });
}

/** Same overallRating() averaging formula vendors.js's own vendor profile uses. */
export function overallRating(perf: { quality_rating?: number; delivery_rating?: number; communication_rating?: number; safety_rating?: number }): number {
  var vals = [perf.quality_rating, perf.delivery_rating, perf.communication_rating, perf.safety_rating].filter(function (v): v is number {
    return !!v && v > 0;
  });
  if (vals.length === 0) return 0;
  var sum = vals.reduce(function (a, b) {
    return a + b;
  }, 0);
  return Math.round((sum / vals.length) * 10) / 10;
}

/** The exact set of numbers a review freezes, read straight off the already-computed
 * ctx/health for this render — never recomputed later. */
export function captureSnapshot(ctx: ProjectContext, health: HealthScoreResult): WeeklyReviewSnapshot {
  return {
    health_score: health.score,
    rag: health.rag,
    schedule_progress_pct: ctx.scheduleProgressPct,
    physical_progress_pct: ctx.physicalProgressPct,
    cost_budget: ctx.costSummary ? ctx.costSummary.budgeted : null,
    cost_actual: ctx.costSummary ? ctx.costSummary.actual : null,
    cost_variance: ctx.costSummary ? ctx.costSummary.variance : null,
    open_risks: (ctx.openRisks || []).length,
    high_risks: (ctx.highRisks || []).length,
    open_rfis: (ctx.openRfis || []).length,
    overdue_rfis: (ctx.overdueRfis || []).length,
    pending_change_orders: (ctx.pendingChangeOrders || []).length,
    open_recovery_actions: (ctx.openRecoveryActions || []).length,
    overdue_recovery_actions: (ctx.overdueRecoveryActions || []).length,
    pending_decisions: (ctx.pendingDecisions || []).length,
  };
}

/** A small +/-/= delta marker comparing a review's snapshot value against the previous
 * (older) review's. */
export function deltaMarker(current: number | null | undefined, previous: number | null | undefined, higherIsBetter: boolean): string {
  if (previous === null || previous === undefined || current === null || current === undefined) return "";
  var diff = current - previous;
  if (diff === 0) return " (=)";
  var improved = higherIsBetter ? diff > 0 : diff < 0;
  return " (" + (diff > 0 ? "+" : "") + diff + (improved ? " ▲" : " ▼") + ")";
}

export function saveWeeklyReview(isNew: boolean, review: { id?: string; project_id: string; snapshot?: WeeklyReviewSnapshot }, values: Partial<PCCWeeklyReview>): void {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.weekly_reviews.push(window.PCC.store.newWeeklyReview(Object.assign({ project_id: review.project_id, snapshot: review.snapshot }, values)));
    } else {
      var existing = d.weekly_reviews.find(function (r) {
        return r.id === review.id;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
}

export function deleteWeeklyReview(reviewId: string): void {
  window.PCC.store.update(function (d) {
    d.weekly_reviews = d.weekly_reviews.filter(function (r) {
      return r.id !== reviewId;
    });
  });
}

export function saveNewPackTemplate(name: string, sections: { [key: string]: boolean }) {
  var newTemplate = window.PCC.store.newReportTemplate({ report_type: "management_pack", name: name, sections: Object.assign({}, sections) });
  window.PCC.store.update(function (d) {
    d.report_templates.push(newTemplate);
  });
  return newTemplate;
}

export function updatePackTemplate(templateId: string, sections: { [key: string]: boolean }): void {
  window.PCC.store.update(function (d) {
    var t = d.report_templates.find(function (x) {
      return x.id === templateId;
    });
    if (t) {
      t.sections = Object.assign({}, sections);
      t.updated_at = new Date().toISOString();
    }
  });
}

export function deletePackTemplate(templateId: string): void {
  window.PCC.store.update(function (d) {
    d.report_templates = d.report_templates.filter(function (t) {
      return t.id !== templateId;
    });
  });
}

export interface NavigationLink {
  module: string;
  recordId?: string;
  tab?: string;
}

/** Central place every "View" / management-action link goes through. */
export function navigateToLink(link: NavigationLink | null | undefined, projectId: string): void {
  if (!link || !link.module) return;
  if (link.module === "risks" && window.PCC.risks) {
    if (link.recordId && window.PCC.risks.expandRisk) window.PCC.risks.expandRisk(link.recordId);
  } else if (link.module === "rfis" && window.PCC.rfis) {
    if (link.recordId && window.PCC.rfis.expandRfi) window.PCC.rfis.expandRfi(link.recordId);
  } else if (link.module === "meetings" && window.PCC.meetings) {
    if (link.recordId && window.PCC.meetings.expandMeeting) window.PCC.meetings.expandMeeting(link.recordId);
  } else if (link.module === "changeOrders" && window.PCC.changeOrders) {
    if (projectId && window.PCC.changeOrders.filterByProject) window.PCC.changeOrders.filterByProject(projectId);
  } else if (link.module === "decisionRegister" && window.PCC.decisionRegister) {
    if (link.recordId && window.PCC.decisionRegister.expandDecision) window.PCC.decisionRegister.expandDecision(link.recordId);
  } else if (link.module === "delayRecoveryDashboard") {
    // No per-record expand API — landing there is enough.
  } else if (link.module === "cost" && window.PCC.cost && window.PCC.cost.filterByProject) {
    window.PCC.cost.filterByProject(projectId);
  } else if (link.module === "vendors" && window.PCC.vendors) {
    if (link.recordId && window.PCC.vendors.openProfile) window.PCC.vendors.openProfile(link.recordId);
  }
  window.PCC.router.go(link.module);
}

export function viewActivityInSchedule(projectId: string, scheduleId: string, activityId: string): void {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}

export function viewBaselines(projectId: string, scheduleId: string): void {
  if (window.PCC.schedule) window.PCC.schedule.viewBaselines(projectId, scheduleId);
  window.PCC.router.go("schedule");
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}

export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

// ---------------------------------------------------------------------------------
// Public API — window.PCC.executiveCenter. Every external caller (portfolioService.js,
// dashboardService.js, myWorkService.js, projectWorkspaceService.js) is itself an
// already-migrated React service bundled into this same react-bundle.js, so this can be
// defined here directly rather than needing the "stays in the vanilla stub" workaround
// other pages' calc functions use — see this file's own header comment.
// ---------------------------------------------------------------------------------

window.PCC = window.PCC || ({} as any);
window.PCC.executiveCenter = window.PCC.executiveCenter || ({} as any);

window.PCC.executiveCenter.getDiagnostics = function (projectId: string): DiagnosticAlert[] {
  var data = window.PCC.store.get();
  var ctx = buildProjectContext(data, projectId);
  return window.PCC.projectHealthEngine.computeDiagnostics(diagnosticsContextFrom(ctx));
};

window.PCC.executiveCenter.getHealthSummary = function (projectId: string): ExecutiveCenterHealthSummary {
  var data = window.PCC.store.get();
  var ctx = buildProjectContext(data, projectId);
  var health = window.PCC.projectHealthEngine.computeHealthScore(healthContextFrom(ctx), data.settings.health_score_weights);
  var scheduleFactor = health.breakdown.find(function (f) {
    return f.key === "schedule";
  });
  var riskFactor = health.breakdown.find(function (f) {
    return f.key === "risk";
  });
  return {
    score: health.score,
    rag: health.rag,
    scheduleRag: scheduleFactor && scheduleFactor.available ? window.PCC.projectHealthEngine.ragFromScore(scheduleFactor.score) : "unknown",
    riskRag: riskFactor && riskFactor.available ? window.PCC.projectHealthEngine.ragFromScore(riskFactor.score) : "unknown",
    delayedActivityCount: (ctx.delayedActivities || []).length,
  };
};

window.PCC.executiveCenter.getSchedulePerformanceSummary = function (projectId: string): ExecutiveCenterSchedulePerformanceSummary {
  var data = window.PCC.store.get();
  var ctx = buildProjectContext(data, projectId);
  return {
    score: ctx.schedulePerformance ? ctx.schedulePerformance.score : null,
    rag: (ctx.schedulePerformance && ctx.schedulePerformance.rag) || "unknown",
    spi: ctx.evm ? ctx.evm.spi : null,
    spiT: ctx.earnedSchedule && !ctx.earnedSchedule.insufficientData ? ctx.earnedSchedule.spiT ?? null : null,
    unaddressedDelayDays: ctx.totalUnaddressedDelayDays || 0,
  };
};

window.PCC.executiveCenter.getDelayImpactSummary = function (projectId: string): { openDelayCount: number; criticalDelayCount: number } {
  var data = window.PCC.store.get();
  var projectDelayRecords = data.delay_records.filter(function (r) {
    return r.project_id === projectId;
  });
  var activeDelays = projectDelayRecords.filter(function (r) {
    return r.status !== "recovered" && r.status !== "closed";
  });
  var criticalCount = 0;
  activeDelays.forEach(function (r) {
    var links = data.delay_activity_links.filter(function (l) {
      return l.delay_id === r.id;
    });
    var impact = window.PCC.delayImpactEngine.computeDelayImpact(r, links, data);
    if (impact.overall_criticality === "critical") criticalCount++;
  });
  return {
    openDelayCount: activeDelays.length,
    criticalDelayCount: criticalCount,
  };
};

export function viewProject(projectId: string, tab?: string): void {
  window.PCC.executiveCenter.viewProject(projectId, tab);
}
