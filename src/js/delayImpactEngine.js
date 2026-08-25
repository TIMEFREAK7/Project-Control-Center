/* Planning & Scheduling-Centric Delay Management, Gate B: Schedule Integration.
 *
 * This is deliberately NOT a second schedule/CPM engine. Every "current" value here
 * (early/late dates, total_float, criticality) is read straight off data.activities —
 * the exact fields scheduleCpmEngine.js's calculateSchedule() already wrote there the
 * last time "Calculate Schedule" ran (see schedule.js's runCalculation()). This module
 * only does two things scheduleCpmEngine.js doesn't:
 *   1. Compares a delay_activity_links row's frozen HISTORICAL snapshot (captured once,
 *      at link creation — see newDelayActivityLink() in store.js) against those live
 *      current values, to answer "how much has this moved since the delay was
 *      identified" without ever overwriting the historical figures.
 *   2. For project-finish impact specifically (computeProjectFinishImpact), it calls
 *      the REAL scheduleCpmEngine.calculateSchedule() fresh, read-only, the same way
 *      schedule.js's own What-If Sandbox already does for an on-demand comparison —
 *      never writes the result back onto any activity/schedule record. This is "using
 *      the existing engine's own calculation," not "a competing one."
 *
 * No DOM, no store writes — pure functions, same convention scheduleCpmEngine.js and
 * scheduleImportService.js already follow, so this is directly testable and never ends
 * up tangled into render code.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var DAY_MS = 24 * 60 * 60 * 1000;

  function daysBetween(isoA, isoB) {
    if (!isoA || !isoB) return null;
    var msA = new Date(isoA + "T00:00:00Z").getTime();
    var msB = new Date(isoB + "T00:00:00Z").getTime();
    if (isNaN(msA) || isNaN(msB)) return null;
    return Math.round((msB - msA) / DAY_MS);
  }

  var DEFAULT_NEAR_CRITICAL_THRESHOLD_DAYS = 5;

  /** Same simple threshold rule scheduleCpmEngine.js's own calculateSchedule() applies
   * when it classifies is_critical/is_near_critical — reapplied here to the already-
   * calculated total_float rather than recalculating it, per this file's own "don't
   * duplicate the engine" header comment. Returns null (not "non_critical") when the
   * schedule has never been calculated (total_float == null) — a genuinely unknown
   * state, distinct from "known and fine." */
  function classifyCriticality(totalFloat, nearCriticalThresholdDays) {
    if (totalFloat === null || totalFloat === undefined) return null;
    var threshold = nearCriticalThresholdDays != null ? nearCriticalThresholdDays : DEFAULT_NEAR_CRITICAL_THRESHOLD_DAYS;
    if (totalFloat <= 0) return "critical";
    if (totalFloat <= threshold) return "near_critical";
    return "non_critical";
  }

  /** Level 1-2 impact (spec point 11) for ONE affected activity: the live schedule
   * state (current/forecast dates, float, criticality, progress) read directly from its
   * activity record, set against the link's frozen historical snapshot. Returns null if
   * the linked activity no longer exists (deleted since the delay was created) — the
   * caller decides how to surface that rather than this function guessing. */
  function computeActivityImpact(link, data) {
    var activity = data.activities.find(function (a) {
      return a.id === link.activity_id;
    });
    if (!activity) return null;
    var schedule = data.schedules.find(function (s) {
      return s.id === activity.schedule_id;
    });
    var cpmCalculated = activity.total_float !== null && activity.total_float !== undefined;
    var criticality = classifyCriticality(activity.total_float, schedule ? schedule.near_critical_threshold_days : null);
    var floatConsumed =
      link.original_total_float != null && activity.total_float != null
        ? link.original_total_float - activity.total_float
        : null;
    var currentFinish = activity.actual_finish || activity.early_finish || activity.planned_finish || "";
    var currentStart = activity.actual_start || activity.early_start || activity.planned_start || "";
    var finishSlippageDays = daysBetween(link.original_planned_finish, currentFinish);

    return {
      link_id: link.id,
      activity_id: activity.id,
      activity_name: activity.name,
      activity_type: activity.activity_type,
      wbs_id: activity.wbs_id,
      status: activity.status,
      // Historical (frozen at link creation — spec point 3).
      original_planned_start: link.original_planned_start,
      original_planned_finish: link.original_planned_finish,
      original_total_float: link.original_total_float,
      // Current / forecast (always live — spec point 3, never a stored copy).
      current_start: currentStart,
      current_finish: currentFinish,
      forecast_start: activity.early_start || activity.planned_start || "",
      forecast_finish: activity.early_finish || activity.planned_finish || "",
      duration: activity.duration,
      remaining_duration: activity.remaining_duration,
      percent_complete: activity.percent_complete,
      current_total_float: activity.total_float,
      float_consumed: floatConsumed,
      finish_slippage_days: finishSlippageDays,
      criticality: criticality, // 'critical' | 'near_critical' | 'non_critical' | null (not yet calculated)
      is_out_of_sequence: !!activity.is_out_of_sequence,
      cpm_calculated: cpmCalculated,
    };
  }

  /** Rolls up every linked activity's impact for one Delay (Level 1-3, spec point 11):
   * per-activity detail plus an overall criticality (the worst of any linked activity)
   * and total float consumed (the minimum float_consumed across activities that have
   * one — i.e. the tightest-constrained activity, since that's the one that actually
   * threatens the schedule). Milestone impact (Level 3) is just the same per-activity
   * entry for delayRecord.milestone_activity_id, when one of the links matches it —
   * kept as a plain lookup rather than a special-cased calculation, since a milestone
   * IS an activity (activity_type: "milestone") and gets the exact same treatment. */
  function computeDelayImpact(delayRecord, links, data) {
    var perActivity = links
      .map(function (link) {
        return computeActivityImpact(link, data);
      })
      .filter(Boolean);

    var criticalityRank = { critical: 3, near_critical: 2, non_critical: 1 };
    var overallCriticality = null;
    perActivity.forEach(function (a) {
      if (!a.criticality) return;
      if (!overallCriticality || criticalityRank[a.criticality] > criticalityRank[overallCriticality]) {
        overallCriticality = a.criticality;
      }
    });

    var floatConsumedValues = perActivity
      .map(function (a) {
        return a.float_consumed;
      })
      .filter(function (v) {
        return v !== null && v !== undefined;
      });
    var minFloatConsumed = floatConsumedValues.length ? Math.min.apply(null, floatConsumedValues) : null;
    var maxFloatConsumed = floatConsumedValues.length ? Math.max.apply(null, floatConsumedValues) : null;

    var milestoneImpact = null;
    if (delayRecord.milestone_activity_id) {
      milestoneImpact =
        perActivity.find(function (a) {
          return a.activity_id === delayRecord.milestone_activity_id;
        }) || null;
    }

    var anyCalculated = perActivity.some(function (a) {
      return a.cpm_calculated;
    });

    return {
      per_activity: perActivity,
      overall_criticality: overallCriticality,
      min_float_consumed: minFloatConsumed,
      max_float_consumed: maxFloatConsumed,
      milestone_impact: milestoneImpact,
      any_schedule_calculated: anyCalculated,
    };
  }

  /** Level 4 impact (spec point 11/15): does this delay currently threaten the
   * PROJECT's own finish date? Only meaningful when at least one linked activity is
   * currently critical — a non-critical delay, by definition, is absorbed by float and
   * cannot be moving the project finish (spec's own Test 1/5). When that's true, this
   * calls the REAL scheduleCpmEngine.calculateSchedule() fresh over the schedule's
   * current activities/relationships — read-only, exactly like schedule.js's own
   * What-If Sandbox already does for an on-demand comparison, never written back to any
   * record — and reports its own forecastVarianceDays. This is intentionally the
   * heaviest call in this file, so callers should only invoke it for a single Delay's
   * own detail view, not in a loop over an entire register/list. */
  function computeProjectFinishImpact(scheduleId, data) {
    var schedule = data.schedules.find(function (s) {
      return s.id === scheduleId;
    });
    if (!schedule) return { available: false, reason: "Schedule not found." };

    var scheduleActivities = data.activities.filter(function (a) {
      return a.schedule_id === scheduleId;
    });
    var scheduleRelationships = data.relationships.filter(function (r) {
      return r.schedule_id === scheduleId;
    });
    if (scheduleActivities.length === 0) {
      return { available: false, reason: "This schedule has no activities to calculate." };
    }

    var result = window.PCC.scheduleCpmEngine.calculateSchedule(scheduleActivities, scheduleRelationships, {
      dataDate: schedule.data_date,
      nearCriticalThresholdDays: schedule.near_critical_threshold_days,
      calculationMode: schedule.calculation_mode,
    });

    return {
      available: true,
      project_finish: result.projectFinish,
      planned_project_finish: result.plannedProjectFinish,
      project_impact_days: result.forecastVarianceDays,
    };
  }

  window.PCC.delayImpactEngine = {
    classifyCriticality: classifyCriticality,
    computeActivityImpact: computeActivityImpact,
    computeDelayImpact: computeDelayImpact,
    computeProjectFinishImpact: computeProjectFinishImpact,
  };
})();
