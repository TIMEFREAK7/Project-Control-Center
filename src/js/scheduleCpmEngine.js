/* Schedule CPM (Critical Path Method) engine \u2014 calculation only. No DOM, no store
 * writes. Callers pass activities + relationships for a single schedule and get back
 * calculated dates/float per activity; writing those results onto the store is the
 * caller's job (schedule.js), same separation as scheduleImportService.js.
 *
 * SCOPE, DELIBERATELY:
 * - Calendar-naive. Durations are calendar days, not working days \u2014 there is no
 *   calendar entity yet (Gate 1 left calendar_id as a placeholder for a later gate),
 *   so this does plain date arithmetic rather than pretending to respect weekends/
 *   holidays it has no data for.
 * - Summary/WBS-summary activities are treated as ordinary network nodes if they
 *   participate in relationships, not rolled up from their children's dates. Roll-up
 *   is a distinct feature or store its own duration/relationships they get calculated
 *   like any other activity; if they don't, they're just left uncalculated like any
 *   isolated node with no duration.
 * - Free Float uses a generalized single definition across all four relationship
 *   types (see freeFloatConstraint below) rather than the type-specific conventions
 *   different commercial tools disagree on. Total Float and critical-path
 *   identification are the parts of CPM that must be unambiguous; free float already
 *   varies by implementation industry-wide, so a documented, consistent choice here
 *   is preferable to silently picking one.
 *
 * STATUS-DATE REFORECASTING (added after Gate 3 shipped pure-duration CPM):
 * - Three activity states, by presence of actual dates, not by percent_complete:
 *     completed:    actual_finish is set. Anchor = [actual_start||actual_finish, actual_finish],
 *                   fixed, ignores predecessor constraints for its own ES.
 *     in_progress:  actual_start is set, actual_finish is not. Anchor ES = max(dataDate,
 *                   actual_start); EF = anchor ES + remaining_duration. Ignores predecessor
 *                   constraints for its own ES (work already began).
 *     not_started:  neither set. Unchanged pure-CPM behavior \u2014 ES from predecessors/dataDate,
 *                   EF = ES + duration.
 * - remaining_duration is NEVER derived from percent_complete. If an in-progress activity has
 *   no remaining_duration, remaining is treated as 0 (not invented) and the activity is flagged
 *   insufficient_data so the resulting forecast is visibly unreliable rather than silently wrong.
 * - Both forward EF and backward LS use the SAME effective duration for a given activity
 *   (remaining for in-progress, actual elapsed for completed, planned duration for not-started)
 *   so total_float = LS-ES = LF-EF holds by construction even when ES is a fixed historical date
 *   rather than a network-derived one \u2014 this is also how a completed activity that actually
 *   finished late can legitimately show negative float: a real slippage signal, not a bug.
 * - options.ignoreActuals=true restores the original pure-duration CPM exactly (predecessor/
 *   duration-only, actual dates never consulted) for any future caller that explicitly wants a
 *   baseline-style calculation rather than a status-date reforecast.
 * - Data-consistency problems (100% complete with no actual_finish; actual_finish set with no
 *   actual_start; actual_finish before actual_start; in-progress with no remaining_duration) are
 *   flagged, never silently resolved by guessing a number.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var DAY_MS = 24 * 60 * 60 * 1000;

  function toDayNumber(isoDateStr) {
    var d = new Date(isoDateStr + "T00:00:00Z");
    return Math.round(d.getTime() / DAY_MS);
  }
  function toIsoDate(dayNumber) {
    return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
  }

  /** Given a predecessor's [ES,EF] (as day numbers), a relationship type + lag, and
   * the successor's own duration, returns the minimum day number the successor's ES
   * may start at because of this one relationship. Forward-pass building block. */
  function earliestStartConstraint(predES, predEF, type, lag, succDuration) {
    switch (type) {
      case "SS":
        return predES + lag;
      case "FF":
        return predEF + lag - succDuration;
      case "SF":
        return predES + lag - succDuration;
      case "FS":
      default:
        return predEF + lag;
    }
  }

  /** Mirror of earliestStartConstraint for the backward pass: given a successor's
   * [LS,LF], returns the maximum day number the predecessor's LF may end at. */
  function latestFinishConstraint(succLS, succLF, type, lag, predDuration) {
    switch (type) {
      case "SS":
        return succLS - lag + predDuration;
      case "FF":
        return succLF - lag;
      case "SF":
        return succLF - lag + predDuration;
      case "FS":
      default:
        return succLS - lag;
    }
  }

  /** Classifies one activity's status-date treatment and computes its fixed anchor
   * (if any) plus the effective duration used for both EF (forward) and LS (backward).
   * Returns null anchorES when the activity should be calculated the normal
   * predecessor-driven way (not_started, or ignoreActuals mode). */
  function classifyActivity(a, dataDay, warnings, ignoreActuals) {
    var planned = a.duration == null ? 0 : a.duration;

    if (ignoreActuals) {
      return { fixedES: null, effDuration: planned, status: "not_started" };
    }

    var hasActualFinish = !!a.actual_finish;
    var hasActualStart = !!a.actual_start;

    if (hasActualFinish) {
      if (!hasActualStart) {
        warnings.push({ activityId: a.id, message: "Actual Finish is set without an Actual Start \u2014 flagged as inconsistent data." });
      }
      var startDay = hasActualStart ? toDayNumber(a.actual_start) : toDayNumber(a.actual_finish);
      var finishDay = toDayNumber(a.actual_finish);
      if (finishDay < startDay) {
        warnings.push({ activityId: a.id, message: "Actual Finish is earlier than Actual Start \u2014 flagged as inconsistent data; treated as 0 days elapsed." });
        finishDay = startDay;
      }
      return { fixedES: startDay, effDuration: finishDay - startDay, status: "completed" };
    }

    if (hasActualStart) {
      if ((a.percent_complete || 0) >= 100) {
        warnings.push({ activityId: a.id, message: "Marked 100% complete but has no Actual Finish \u2014 flagged as inconsistent data; still treated as in-progress." });
      }
      var anchorES = Math.max(dataDay, toDayNumber(a.actual_start));
      var remaining = a.remaining_duration;
      var insufficientData = false;
      if (remaining == null) {
        // Deliberately NOT derived from percent_complete \u2014 that fallback was rejected
        // as an implicit assumption PCC shouldn't make. Remaining is 0 (not invented),
        // and this activity's forecast is flagged so it reads as unreliable, not exact.
        warnings.push({ activityId: a.id, message: "In progress with no Remaining Duration \u2014 insufficient data to forecast; treated as 0 days remaining." });
        remaining = 0;
        insufficientData = true;
      }
      return { fixedES: anchorES, effDuration: remaining, status: "in_progress", insufficientData: insufficientData };
    }

    return { fixedES: null, effDuration: planned, status: "not_started" };
  }

  /** Calculates ES/EF/LS/LF/float for every activity in one schedule.
   *
   * @param activities  array of { id, duration, activity_type, actual_start, actual_finish,
   *                                remaining_duration, percent_complete, planned_finish }
   * @param relationships  array of { predecessor_id, successor_id, type, lag }
   * @param options.dataDate  ISO date string, the project's day-zero / status date (defaults to today)
   * @param options.nearCriticalThresholdDays  float <= this (but > 0) is "near critical" (default 5)
   * @param options.ignoreActuals  true = pure planned-duration CPM, actual dates never consulted
   * @returns {
   *   results: { [activityId]: { early_start, early_finish, late_start, late_finish,
   *                               total_float, free_float, is_critical, is_near_critical,
   *                               status, insufficient_data } },
   *   projectFinish, plannedProjectFinish, forecastVarianceDays,  (ISO date strings / integer or null)
   *   criticalActivityIds: [...],
   *   cyclicActivityIds: [...],   // excluded from calculation entirely, results[id] is null
   *   warnings: [{ activityId, message }]
   * }
   */
  function calculateSchedule(activities, relationships, options) {
    options = options || {};
    var dataDate = options.dataDate || new Date().toISOString().slice(0, 10);
    var dataDay = toDayNumber(dataDate);
    var nearCriticalThreshold = options.nearCriticalThresholdDays != null ? options.nearCriticalThresholdDays : 5;
    var ignoreActuals = !!options.ignoreActuals;

    var warnings = [];
    var byId = {};
    var duration = {}; // effective duration used for THIS activity's own EF (fwd) and LS (bwd)
    var fixedES = {}; // non-null day number for completed/in_progress activities
    var statusById = {};
    var insufficientById = {};

    activities.forEach(function (a) {
      byId[a.id] = a;
      var classified = classifyActivity(a, dataDay, warnings, ignoreActuals);
      duration[a.id] = classified.effDuration;
      fixedES[a.id] = classified.fixedES;
      statusById[a.id] = classified.status;
      insufficientById[a.id] = !!classified.insufficientData;
      if (classified.status === "not_started" && !ignoreActuals && a.duration == null) {
        warnings.push({ activityId: a.id, message: "No duration set \u2014 treated as 0 days for calculation." });
      }
    });

    // Only keep relationships between activities that actually exist in this batch.
    var rels = relationships.filter(function (r) {
      return byId[r.predecessor_id] && byId[r.successor_id];
    });

    var successors = {}; // id -> [{ toId, type, lag }]
    var predecessors = {}; // id -> [{ fromId, type, lag }]
    activities.forEach(function (a) {
      successors[a.id] = [];
      predecessors[a.id] = [];
    });
    rels.forEach(function (r) {
      successors[r.predecessor_id].push({ toId: r.successor_id, type: r.type, lag: r.lag || 0 });
      predecessors[r.successor_id].push({ fromId: r.predecessor_id, type: r.type, lag: r.lag || 0 });
    });

    // Kahn's algorithm for topological order + cycle detection. Any activity left
    // out of `order` once the queue drains is part of a cycle \u2014 excluded from
    // calculation entirely rather than producing numbers that would be meaningless.
    var inDegree = {};
    activities.forEach(function (a) {
      inDegree[a.id] = predecessors[a.id].length;
    });
    var queue = activities.filter(function (a) { return inDegree[a.id] === 0; }).map(function (a) { return a.id; });
    var order = [];
    var inDegreeWorking = Object.assign({}, inDegree);
    while (queue.length) {
      var id = queue.shift();
      order.push(id);
      successors[id].forEach(function (edge) {
        inDegreeWorking[edge.toId]--;
        if (inDegreeWorking[edge.toId] === 0) queue.push(edge.toId);
      });
    }
    var orderedSet = {};
    order.forEach(function (id) { orderedSet[id] = true; });
    var cyclicActivityIds = activities.filter(function (a) { return !orderedSet[a.id]; }).map(function (a) { return a.id; });
    cyclicActivityIds.forEach(function (id) {
      warnings.push({ activityId: id, message: "Part of a circular dependency \u2014 excluded from calculation." });
    });

    // Relationships touching any cyclic activity are dropped from both passes so a
    // cycle elsewhere in the schedule can't corrupt the acyclic part of the network.
    var cyclicSet = {};
    cyclicActivityIds.forEach(function (id) { cyclicSet[id] = true; });
    var safeRels = rels.filter(function (r) { return !cyclicSet[r.predecessor_id] && !cyclicSet[r.successor_id]; });
    var safeSuccessors = {};
    var safePredecessors = {};
    order.forEach(function (id) { safeSuccessors[id] = []; safePredecessors[id] = []; });
    safeRels.forEach(function (r) {
      safeSuccessors[r.predecessor_id].push({ toId: r.successor_id, type: r.type, lag: r.lag || 0 });
      safePredecessors[r.successor_id].push({ fromId: r.predecessor_id, type: r.type, lag: r.lag || 0 });
    });

    // ---- Forward pass: ES/EF in topological order ----
    // Completed/in-progress activities use their fixed anchor and ignore predecessor
    // constraints for their OWN start \u2014 the work already began regardless of what
    // logic says, but they still constrain their successors normally via EF below.
    var ES = {};
    var EF = {};
    order.forEach(function (id) {
      var es;
      if (fixedES[id] != null) {
        es = fixedES[id];
      } else {
        var preds = safePredecessors[id];
        es = dataDay;
        preds.forEach(function (edge) {
          var c = earliestStartConstraint(ES[edge.fromId], EF[edge.fromId], edge.type, edge.lag, duration[id]);
          if (c > es) es = c;
        });
      }
      ES[id] = es;
      EF[id] = es + duration[id];
    });

    var projectFinishDay = order.length ? Math.max.apply(null, order.map(function (id) { return EF[id]; })) : null;

    // ---- Backward pass: LS/LF in reverse topological order ----
    // Runs uniformly for every activity, fixed-anchor or not \u2014 retrospective float on
    // a completed activity is meaningful (see file header: negative float = real slippage).
    var LS = {};
    var LF = {};
    order
      .slice()
      .reverse()
      .forEach(function (id) {
        var succs = safeSuccessors[id];
        var lf = projectFinishDay;
        succs.forEach(function (edge) {
          var c = latestFinishConstraint(LS[edge.toId], LF[edge.toId], edge.type, edge.lag, duration[id]);
          if (c < lf) lf = c;
        });
        LF[id] = lf;
        LS[id] = lf - duration[id];
      });

    // ---- Float ----
    var results = {};
    var criticalActivityIds = [];
    order.forEach(function (id) {
      var totalFloat = LS[id] - ES[id];
      var succs = safeSuccessors[id];
      var freeFloat;
      if (succs.length === 0) {
        freeFloat = totalFloat;
      } else {
        freeFloat = Math.min.apply(
          null,
          succs.map(function (edge) {
            var succDuration = duration[edge.toId];
            var requiredIfCritical = earliestStartConstraint(ES[id], EF[id], edge.type, edge.lag, succDuration);
            return ES[edge.toId] - requiredIfCritical;
          })
        );
      }
      var isCritical = totalFloat <= 0;
      var isNearCritical = !isCritical && totalFloat <= nearCriticalThreshold;
      if (isCritical) criticalActivityIds.push(id);

      results[id] = {
        early_start: toIsoDate(ES[id]),
        early_finish: toIsoDate(EF[id]),
        late_start: toIsoDate(LS[id]),
        late_finish: toIsoDate(LF[id]),
        total_float: totalFloat,
        free_float: freeFloat,
        is_critical: isCritical,
        is_near_critical: isNearCritical,
        status: statusById[id],
        insufficient_data: insufficientById[id],
      };
    });
    cyclicActivityIds.forEach(function (id) {
      results[id] = null;
    });

    // Planned Project Finish vs Forecast Project Finish \u2014 Section 7's variance. Only
    // meaningful if at least one activity actually has a planned_finish recorded;
    // otherwise there's nothing to compare the forecast against, and reporting a
    // variance against a missing baseline would be inventing a number.
    var plannedFinishDays = activities
      .map(function (a) { return a.planned_finish ? toDayNumber(a.planned_finish) : null; })
      .filter(function (d) { return d != null; });
    var plannedProjectFinishDay = plannedFinishDays.length ? Math.max.apply(null, plannedFinishDays) : null;
    var forecastVarianceDays =
      plannedProjectFinishDay != null && projectFinishDay != null ? projectFinishDay - plannedProjectFinishDay : null;

    return {
      results: results,
      projectFinish: projectFinishDay != null ? toIsoDate(projectFinishDay) : null,
      plannedProjectFinish: plannedProjectFinishDay != null ? toIsoDate(plannedProjectFinishDay) : null,
      forecastVarianceDays: forecastVarianceDays,
      criticalActivityIds: criticalActivityIds,
      cyclicActivityIds: cyclicActivityIds,
      warnings: warnings,
    };
  }

  window.PCC.scheduleCpmEngine = { calculateSchedule: calculateSchedule };
})();

