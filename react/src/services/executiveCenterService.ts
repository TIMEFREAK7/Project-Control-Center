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

export var SEVERITY_MATRIX = {
  high: { low: "medium", medium: "high", high: "high" },
  medium: { low: "low", medium: "medium", high: "high" },
  low: { low: "low", medium: "low", high: "medium" },
};
export var RISK_LEVELS = ["low", "medium", "high"];
export var RAG_LABELS = { on_track: "On Track", at_risk: "At Risk", critical: "Critical", unknown: "Not Yet Scored" };
export var RAG_COLOR_VAR = { on_track: "--status-on-track", at_risk: "--status-at-risk", critical: "--status-critical", unknown: "--text-secondary" };
export var SEVERITY_LABEL = { critical: "Critical", warning: "Warning", info: "Info" };
export var DIAGNOSTICS_ICON_CLASS = { critical: "critical", warning: "warning", info: "info" };
export var ACTIVITY_STATUS_LABEL_MAP = { not_started: "Not Started", in_progress: "In Progress", complete: "Complete", on_hold: "On Hold" };

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === "" || isNaN(Number(amount))) return "—";
  var n = Number(amount);
  return (currency ? currency + " " : "") + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function fmtPct(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Math.round(n) + "%";
}

export function riskSeverity(r) {
  return SEVERITY_MATRIX[r.probability] ? SEVERITY_MATRIX[r.probability][r.impact] : "medium";
}

function pickPrimarySchedule(schedules) {
  if (schedules.length === 0) return null;
  var active = schedules.filter(function (s) {
    return s.status === "active";
  });
  var pool = active.length ? active : schedules;
  return pool
    .slice()
    .sort(function (a, b) {
      if (a.revision_number !== b.revision_number) return b.revision_number - a.revision_number;
      return new Date(b.updated_at) - new Date(a.updated_at);
    })[0];
}

/** Every number the rest of this page needs, in one place, so KPIs/health/diagnostics/
 * summary/charts/snapshot all read from the same computed values instead of five
 * slightly-different re-derivations of "what's overdue." */
export function buildProjectContext(data, projectId) {
  var project = data.projects.find(function (p) {
    return p.id === projectId;
  });
  var todayIso = today();
  var ctx = { project: project, todayIso: todayIso };
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
        return a.schedule_id === schedule.id;
      })
    : [];
  var relationships = schedule
    ? data.relationships.filter(function (r) {
        return r.schedule_id === schedule.id;
      })
    : [];
  ctx.activities = activities;
  ctx.relationships = relationships;

  var cpm = null;
  if (schedule && activities.length > 0) {
    cpm = window.PCC.scheduleCpmEngine.calculateSchedule(activities, relationships, {
      dataDate: schedule.data_date,
      nearCriticalThresholdDays: schedule.near_critical_threshold_days,
      calculationMode: schedule.calculation_mode,
      calendarAware: schedule.calendar_aware,
      honorConstraints: schedule.constraints_enabled,
      calendars: (data.calendars || []).filter(function (c) {
        return c.project_id === projectId;
      }),
    });
  }
  ctx.cpm = cpm;

  var referenceDate = (schedule && schedule.data_date) || todayIso;
  ctx.referenceDate = referenceDate;

  var criticalActivities = [];
  var nearCriticalActivities = [];
  var delayedActivities = [];
  var completedCount = 0;
  var plannedDates = [];
  var weightedProgressNumerator = 0;
  var weightedProgressDenominator = 0;
  var weightedPhysicalNumerator = 0;
  var inProgressCount = 0;
  var notStartedCount = 0;
  var remainingDurationTotal = 0;
  var remainingDurationMissingCount = 0;
  var forecastLateActivities = [];
  var outOfSequenceActivities = [];

  activities.forEach(function (a) {
    var r = cpm && cpm.results[a.id];
    var totalFloat = r ? r.total_float : a.total_float;
    var earlyFinish = r ? r.early_finish : a.early_finish;
    var effectiveFinish = earlyFinish || a.planned_finish;
    var isOutOfSequence = r ? r.is_out_of_sequence : a.is_out_of_sequence;
    if (isOutOfSequence) outOfSequenceActivities.push({ id: a.id, name: a.name });

    if (totalFloat != null && totalFloat <= 0) criticalActivities.push({ id: a.id, name: a.name });
    else if (totalFloat != null && totalFloat > 0 && totalFloat <= (schedule ? schedule.near_critical_threshold_days : 5)) {
      nearCriticalActivities.push({ id: a.id, name: a.name });
    }
    if (effectiveFinish && effectiveFinish < referenceDate && a.status !== "complete") {
      delayedActivities.push({ id: a.id, name: a.name, finish: effectiveFinish });
    }
    if (a.status === "complete") {
      completedCount++;
    } else if (a.status === "in_progress") {
      inProgressCount++;
      if (a.remaining_duration != null) remainingDurationTotal += Number(a.remaining_duration) || 0;
      else remainingDurationMissingCount++;
    } else if (a.status === "not_started") {
      notStartedCount++;
      if (a.duration != null) remainingDurationTotal += Number(a.duration) || 0;
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

    var weight = a.duration != null && a.duration > 0 ? a.duration : 1;
    weightedProgressNumerator += weight * (Number(a.percent_complete) || 0);
    weightedProgressDenominator += weight;
    weightedPhysicalNumerator += weight * (Number(a.physical_progress) || 0);
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
        return b.schedule_id === schedule.id;
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
  ctx.forecastFinish = cpm && cpm.projectFinish ? cpm.projectFinish : project.forecast_finish_date || null;
  ctx.forecastFinishSource = cpm && cpm.projectFinish ? "calculated" : project.forecast_finish_date ? "manual" : "none";
  ctx.forecastVarianceDays = cpm ? cpm.forecastVarianceDays : null;
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
  var upcomingMilestones = [];
  var slippedMilestones = [];
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
          ac: costSummary.actual,
        })
      : null;

  var dataDateForEvm = (schedule && schedule.data_date) || null;
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
      return new Date(b.captured_at) - new Date(a.captured_at);
    });

  var COMMITMENT_RISK_WINDOW_DAYS = 7;
  function commitmentAtRisk(c) {
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
    commitmentTotals.approved += Number(c.approved_value) || 0;
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
        daysOverdue: window.PCC.scheduleGanttLayout.diffDays(r.date_required, todayIso),
      };
    });
  var answeredRfis = projectRfis.filter(function (r) {
    return r.date_answered && r.date_raised;
  });
  var avgResponseDays =
    answeredRfis.length > 0
      ? answeredRfis.reduce(function (sum, r) {
          return sum + window.PCC.scheduleGanttLayout.diffDays(r.date_raised, r.date_answered);
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
  var overdueMeetingActions = [];
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
      return a.meeting_date < b.meeting_date ? -1 : 1;
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
  var allProjectActivityIds = {};
  data.activities.forEach(function (a) {
    if (a.project_id === projectId) allProjectActivityIds[a.id] = true;
  });
  var projectAssignments = data.resource_assignments.filter(function (a) {
    return allProjectActivityIds[a.activity_id];
  });
  var assignedResourceIds = {};
  projectAssignments.forEach(function (a) {
    assignedResourceIds[a.resource_id] = true;
  });
  var portfolioOverAlloc = window.PCC.resourceLevelingEngine
    ? window.PCC.resourceLevelingEngine.portfolioOverAllocationSummary(data.resources, data.resource_assignments, data.activities, data.resource_unavailability)
    : [];
  var overAllocById = {};
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
  var docTypesById = {};
  data.document_types.forEach(function (t) {
    docTypesById[t.id] = t;
  });
  var projectDocRequirements = data.project_document_requirements.filter(function (r) {
    return r.project_id === projectId && docTypesById[r.document_type_id];
  });
  var docControlAvailable = 0;
  var docControlOverdue = 0;
  var docControlOverdueTypeNames = [];
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
  var delayDaysByActivity = {};
  projectDelayRecords.forEach(function (r) {
    delayDaysByActivity[r.activity_id] = (delayDaysByActivity[r.activity_id] || 0) + (r.delay_days || 0);
  });
  var recoveryDaysByActivity = {};
  openRecoveryActions.forEach(function (r) {
    recoveryDaysByActivity[r.activity_id] = (recoveryDaysByActivity[r.activity_id] || 0) + (r.estimated_recovery_days || 0);
  });
  var unaddressedDelayActivities = [];
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

export function healthContextFrom(ctx) {
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

export function diagnosticsContextFrom(ctx) {
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

export function floatDistributionBuckets(activities) {
  var buckets = [
    { label: "< 0 (over)", test: function (f) { return f < 0; }, color: "var(--status-critical)" },
    { label: "0 (critical)", test: function (f) { return f === 0; }, color: "var(--status-critical)" },
    { label: "1–5", test: function (f) { return f >= 1 && f <= 5; }, color: "var(--status-at-risk)" },
    { label: "6–15", test: function (f) { return f >= 6 && f <= 15; }, color: "var(--status-info)" },
    { label: "16+", test: function (f) { return f >= 16; }, color: "var(--status-on-track)" },
  ];
  var withFloat = activities.filter(function (a) {
    return a.total_float != null;
  });
  return buckets.map(function (b) {
    return {
      label: b.label,
      color: b.color,
      value: withFloat.filter(function (a) {
        return b.test(a.total_float);
      }).length,
    };
  });
}

// ---------------------------------------------------------------------------------
// Executive Summary — template/data-driven, never AI-generated.
// ---------------------------------------------------------------------------------

export function autoStatusText(ctx) {
  var p = ctx.project;
  var lines = [];
  lines.push((p.name || "This project") + " is currently " + (p.status || "on_track").replace("_", " ") + ", " + fmtPct(p.progress) + " complete overall.");
  if (ctx.totalActivityCount > 0) {
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
  if (ctx.costSummary.budgeted > 0) {
    lines.push("Cost: " + fmtMoney(ctx.costSummary.actual, p.currency) + " actual against a " + fmtMoney(ctx.costSummary.budgeted, p.currency) + " budget.");
  }
  return lines.join(" ");
}

export function autoAchievementsText(ctx) {
  var lines = [];
  var completedMilestones = ctx.activities.filter(function (a) {
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
  var completedActivities = ctx.activities
    .filter(function (a) {
      return a.activity_type !== "milestone" && a.status === "complete";
    })
    .sort(function (a, b) {
      return (b.duration || 0) - (a.duration || 0);
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

export function autoChallengesText(ctx) {
  var lines = [];
  if (ctx.delayedActivities.length) lines.push(ctx.delayedActivities.length + " activity(ies) currently delayed.");
  if (ctx.highRisks.length)
    lines.push(
      ctx.highRisks.length +
        " open high-severity risk(s): " +
        ctx.highRisks
          .map(function (r) {
            return r.title;
          })
          .join(", ") +
        "."
    );
  if (ctx.openIssues.length) lines.push(ctx.openIssues.length + " open issue(s).");
  if (ctx.overdueRecoveryActions.length) lines.push(ctx.overdueRecoveryActions.length + " recovery action(s) overdue.");
  if (lines.length === 0) return "No significant delays, high risks, or open issues at this time.";
  return lines.join(" ");
}

export function autoAttentionText(ctx) {
  var lines = [];
  if (ctx.pendingChangeOrders.length) lines.push(ctx.pendingChangeOrders.length + " Change Order(s) awaiting a decision.");
  if (ctx.overdueRfis.length) lines.push(ctx.overdueRfis.length + " overdue RFI/TQ requiring response.");
  if (ctx.highRisks.length) lines.push(ctx.highRisks.length + " high-severity risk(s) needing a mitigation decision.");
  if (ctx.pendingDecisions.length) lines.push(ctx.pendingDecisions.length + " decision(s) pending in the Decision Register.");
  if (lines.length === 0) return "Nothing currently requires management decision or approval.";
  return lines.join(" ");
}

export function autoUpcomingText(ctx) {
  var lines = [];
  if (ctx.upcomingMilestones.length) {
    lines.push(
      "Upcoming milestones: " +
        ctx.upcomingMilestones
          .slice(0, 5)
          .map(function (m) {
            return m.name + " (" + m.date + ")";
          })
          .join(", ") +
        "."
    );
  }
  if (ctx.criticalActivities.length) lines.push(ctx.criticalActivities.length + " critical-path activity(ies) to watch.");
  if (ctx.upcomingMeetings.length) lines.push(ctx.upcomingMeetings.length + " meeting(s) scheduled.");
  if (lines.length === 0) return "No upcoming milestones, meetings, or critical activities on record.";
  return lines.join(" ");
}

export function autoDocumentControlText(ctx) {
  if (!ctx.docControlTotal) return "No document requirements have been assigned to this project yet.";
  var lines = [];
  lines.push(ctx.docControlAvailable + " of " + ctx.docControlTotal + " required documents are Available.");
  if (ctx.docControlOverdue > 0) {
    lines.push(ctx.docControlOverdue + " overdue: " + ctx.docControlOverdueTypeNames.join(", ") + ".");
  } else {
    lines.push("Nothing is overdue.");
  }
  return lines.join(" ");
}

export var SUMMARY_SECTIONS = [
  { key: "status", label: "Project Status", overrideKey: "status_override", auto: autoStatusText },
  { key: "achievements", label: "Achievements", overrideKey: "achievements_override", auto: autoAchievementsText },
  { key: "challenges", label: "Challenges", overrideKey: "challenges_override", auto: autoChallengesText },
  { key: "attention", label: "Management Attention", overrideKey: "management_attention_override", auto: autoAttentionText },
  { key: "upcoming", label: "Upcoming", overrideKey: "upcoming_override", auto: autoUpcomingText },
  { key: "documentControl", label: "Document Control Status", overrideKey: "document_control_override", auto: autoDocumentControlText },
];

export function saveExecutiveSummarySection(projectId, overrideKey, value) {
  window.PCC.store.update(function (d) {
    var rec = d.executive_summaries.find(function (s) {
      return s.project_id === projectId;
    });
    if (!rec) {
      rec = window.PCC.store.newExecutiveSummary({ project_id: projectId });
      d.executive_summaries.push(rec);
    }
    rec[overrideKey] = value;
    rec.updated_at = new Date().toISOString();
  });
}

export function resetExecutiveSummarySection(projectId, overrideKey) {
  window.PCC.store.update(function (d) {
    var rec = d.executive_summaries.find(function (s) {
      return s.project_id === projectId;
    });
    if (rec) rec[overrideKey] = "";
  });
}

export function saveHealthWeight(key, value) {
  window.PCC.store.update(function (d) {
    d.settings.health_score_weights[key] = Number(value) || 0;
  });
}

export function captureSchedulePerformanceSnapshot(projectId, ctx) {
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
        schedule_performance_score: ctx.schedulePerformance.score,
        schedule_performance_rag: ctx.schedulePerformance.rag,
        schedule_progress_pct: ctx.scheduleProgressPct,
      })
    );
  });
}

/** Same overallRating() averaging formula vendors.js's own vendor profile uses. */
export function overallRating(perf) {
  var vals = [perf.quality_rating, perf.delivery_rating, perf.communication_rating, perf.safety_rating].filter(function (v) {
    return v > 0;
  });
  if (vals.length === 0) return 0;
  var sum = vals.reduce(function (a, b) {
    return a + b;
  }, 0);
  return Math.round((sum / vals.length) * 10) / 10;
}

/** The exact set of numbers a review freezes, read straight off the already-computed
 * ctx/health for this render — never recomputed later. */
export function captureSnapshot(ctx, health) {
  return {
    health_score: health.score,
    rag: health.rag,
    schedule_progress_pct: ctx.scheduleProgressPct,
    physical_progress_pct: ctx.physicalProgressPct,
    cost_budget: ctx.costSummary.budgeted,
    cost_actual: ctx.costSummary.actual,
    cost_variance: ctx.costSummary.variance,
    open_risks: ctx.openRisks.length,
    high_risks: ctx.highRisks.length,
    open_rfis: ctx.openRfis.length,
    overdue_rfis: ctx.overdueRfis.length,
    pending_change_orders: ctx.pendingChangeOrders.length,
    open_recovery_actions: ctx.openRecoveryActions.length,
    overdue_recovery_actions: ctx.overdueRecoveryActions.length,
    pending_decisions: ctx.pendingDecisions.length,
  };
}

/** A small +/-/= delta marker comparing a review's snapshot value against the previous
 * (older) review's. */
export function deltaMarker(current, previous, higherIsBetter) {
  if (previous === null || previous === undefined || current === null || current === undefined) return "";
  var diff = current - previous;
  if (diff === 0) return " (=)";
  var improved = higherIsBetter ? diff > 0 : diff < 0;
  return " (" + (diff > 0 ? "+" : "") + diff + (improved ? " ▲" : " ▼") + ")";
}

export function saveWeeklyReview(isNew, review, values) {
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

export function deleteWeeklyReview(reviewId) {
  window.PCC.store.update(function (d) {
    d.weekly_reviews = d.weekly_reviews.filter(function (r) {
      return r.id !== reviewId;
    });
  });
}

export function saveNewPackTemplate(name, sections) {
  var newTemplate = window.PCC.store.newReportTemplate({ report_type: "management_pack", name: name, sections: Object.assign({}, sections) });
  window.PCC.store.update(function (d) {
    d.report_templates.push(newTemplate);
  });
  return newTemplate;
}

export function updatePackTemplate(templateId, sections) {
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

export function deletePackTemplate(templateId) {
  window.PCC.store.update(function (d) {
    d.report_templates = d.report_templates.filter(function (t) {
      return t.id !== templateId;
    });
  });
}

/** Central place every "View" / management-action link goes through. */
export function navigateToLink(link, projectId) {
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
  } else if (link.module === "cost" && window.PCC.cost) {
    window.PCC.cost.filterByProject(projectId);
  } else if (link.module === "vendors" && window.PCC.vendors) {
    if (link.recordId && window.PCC.vendors.openProfile) window.PCC.vendors.openProfile(link.recordId);
  }
  window.PCC.router.go(link.module);
}

export function viewActivityInSchedule(projectId, scheduleId, activityId) {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}

export function viewBaselines(projectId, scheduleId) {
  if (window.PCC.schedule) window.PCC.schedule.viewBaselines(projectId, scheduleId);
  window.PCC.router.go("schedule");
}

export function getProjectContext() {
  return window.PCC.projectContext.get();
}

export function setProjectContext(projectId) {
  window.PCC.projectContext.set(projectId);
}

// ---------------------------------------------------------------------------------
// Public API — window.PCC.executiveCenter. Every external caller (portfolioService.js,
// dashboardService.js, myWorkService.js, projectWorkspaceService.js) is itself an
// already-migrated React service bundled into this same react-bundle.js, so this can be
// defined here directly rather than needing the "stays in the vanilla stub" workaround
// other pages' calc functions use — see this file's own header comment.
// ---------------------------------------------------------------------------------

window.PCC = window.PCC || {};
window.PCC.executiveCenter = window.PCC.executiveCenter || {};

window.PCC.executiveCenter.getDiagnostics = function (projectId) {
  var data = window.PCC.store.get();
  var ctx = buildProjectContext(data, projectId);
  return window.PCC.projectHealthEngine.computeDiagnostics(diagnosticsContextFrom(ctx));
};

window.PCC.executiveCenter.getHealthSummary = function (projectId) {
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
    delayedActivityCount: ctx.delayedActivities.length,
  };
};

window.PCC.executiveCenter.getSchedulePerformanceSummary = function (projectId) {
  var data = window.PCC.store.get();
  var ctx = buildProjectContext(data, projectId);
  return {
    score: ctx.schedulePerformance.score,
    rag: ctx.schedulePerformance.rag || "unknown",
    spi: ctx.evm ? ctx.evm.spi : null,
    spiT: ctx.earnedSchedule && !ctx.earnedSchedule.insufficientData ? ctx.earnedSchedule.spiT : null,
    unaddressedDelayDays: ctx.totalUnaddressedDelayDays,
  };
};

window.PCC.executiveCenter.getDelayImpactSummary = function (projectId) {
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

export function viewProject(projectId, tab) {
  window.PCC.executiveCenter.viewProject(projectId, tab);
}
