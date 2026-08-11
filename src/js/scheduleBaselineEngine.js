/* Schedule baseline engine \u2014 builds a trimmed, comparison-only snapshot of a schedule's
 * WBS/Activities/Relationships, and compares a stored snapshot against a current set of
 * WBS/Activities/Relationships. Calculation only: no DOM, no store writes, no IndexedDB
 * calls \u2014 callers (schedule.js) own persistence, same separation scheduleCpmEngine.js
 * and scheduleImportService.js already keep.
 *
 * WHAT GOES IN A SNAPSHOT, DELIBERATELY:
 * Only the fields baseline-vs-current comparison actually needs: identity (id,
 * external_id, name, wbs linkage), the schedule-logic fields (duration, planned/early/
 * late dates, total_float), and enough WBS/relationship structure to show reparenting
 * and logic changes. Left out on purpose: notes, contractor, responsible_person,
 * discipline, actual_start/actual_finish, percent_complete, status \u2014 none of those
 * carry comparison value here and copying them just bloats every snapshot written to
 * IndexedDB for no benefit. If a future gate needs baseline-vs-actual-progress, extend
 * the snapshot shape then \u2014 don't carry weight for a comparison nobody's asked for yet.
 *
 * MATCHING ACROSS REVISIONS:
 * A baseline is very often compared against a *different* schedule revision than the
 * one it was captured from (re-import after a change), not just later edits to the same
 * schedule_id. Revision re-imports mint fresh activity ids (newActivityId(), Gate 1) but
 * scheduleImportService.js preserves the source spreadsheet's own Activity ID on
 * `external_id` specifically so re-imports can be matched against what's already there.
 * This engine reuses that: two activities match if both have a non-empty external_id
 * and those match; otherwise they match if the live `id` matches (same schedule, no
 * re-import involved). Getting this wrong silently turns every re-imported schedule's
 * comparison into 100% "added" + 100% "removed", which is worse than not having the
 * feature \u2014 it would look broken rather than just being wrong.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  function matchKey(activity) {
    if (activity.external_id !== null && activity.external_id !== undefined && activity.external_id !== "") {
      return "ext:" + activity.external_id;
    }
    return "id:" + activity.id;
  }

  function isCriticalFromFloat(totalFloat) {
    if (totalFloat === null || totalFloat === undefined) return null; // unknown, not "not critical"
    return totalFloat <= 0;
  }

  /** Build the trimmed snapshot payload for one schedule. `schedule`, `wbsItems`,
   * `activities`, `relationships` should already be filtered to a single schedule_id by
   * the caller (schedule.js already does this filtering for every other schedule
   * operation, so this stays consistent with that convention rather than re-filtering
   * against a `data` object this module has no business knowing the shape of). */
  function buildSnapshot(schedule, wbsItems, activities, relationships) {
    return {
      schedule_id: schedule.id,
      schedule_name: schedule.name,
      schedule_revision_number: schedule.revision_number,
      data_date: schedule.data_date,
      captured_at: new Date().toISOString(),
      wbs: wbsItems.map(function (w) {
        return {
          id: w.id,
          code: w.code,
          name: w.name,
          parent_wbs_id: w.parent_wbs_id,
          level: w.level,
        };
      }),
      activities: activities.map(function (a) {
        return {
          id: a.id,
          external_id: a.external_id,
          name: a.name,
          activity_type: a.activity_type,
          wbs_id: a.wbs_id,
          duration: a.duration,
          planned_start: a.planned_start,
          planned_finish: a.planned_finish,
          early_start: a.early_start,
          early_finish: a.early_finish,
          late_start: a.late_start,
          late_finish: a.late_finish,
          total_float: a.total_float,
        };
      }),
      relationships: relationships.map(function (r) {
        return {
          predecessor_id: r.predecessor_id,
          successor_id: r.successor_id,
          type: r.type,
          lag: r.lag,
        };
      }),
    };
  }

  /** The date this activity's schedule position is judged on: calculated (early_*) if
   * the schedule has been through "Calculate Schedule" since, else the planned date the
   * user entered directly. Returns {start, finish, source} where source is "calculated"
   * or "planned" or null if neither side has a usable date \u2014 callers use `source` to
   * avoid comparing a calculated date on one side against a merely-planned date on the
   * other, which would misreport variance as real schedule slip when it might just be
   * "nobody hit Calculate Schedule yet." */
  function effectiveDates(a) {
    if (a.early_start && a.early_finish) {
      return { start: a.early_start, finish: a.early_finish, source: "calculated" };
    }
    if (a.planned_start && a.planned_finish) {
      return { start: a.planned_start, finish: a.planned_finish, source: "planned" };
    }
    return { start: null, finish: null, source: null };
  }

  function daysBetween(isoA, isoB) {
    if (!isoA || !isoB) return null;
    var a = new Date(isoA + "T00:00:00Z").getTime();
    var b = new Date(isoB + "T00:00:00Z").getTime();
    return Math.round((b - a) / (24 * 60 * 60 * 1000));
  }

  function relationshipSignature(rel, keyById) {
    var predKey = keyById[rel.predecessor_id] || ("id:" + rel.predecessor_id);
    var succKey = keyById[rel.successor_id] || ("id:" + rel.successor_id);
    return predKey + ">" + succKey + ":" + rel.type + ":" + rel.lag;
  }

  /** Compare a stored baseline snapshot against a current WBS/Activity/Relationship set.
   * `currentActivities`/`currentRelationships`/`currentWbsItems` need not belong to the
   * same schedule_id the snapshot was captured from \u2014 comparing a baseline against a
   * later re-imported revision is the common case, not the exception (see header). */
  function compareBaselineToCurrent(snapshot, currentWbsItems, currentActivities, currentRelationships) {
    var baselineByKey = {};
    snapshot.activities.forEach(function (a) {
      baselineByKey[matchKey(a)] = a;
    });
    var currentByKey = {};
    currentActivities.forEach(function (a) {
      currentByKey[matchKey(a)] = a;
    });

    var matched = [];
    var removed = [];
    Object.keys(baselineByKey).forEach(function (key) {
      var b = baselineByKey[key];
      var c = currentByKey[key];
      if (!c) {
        removed.push({ id: b.id, external_id: b.external_id, name: b.name });
        return;
      }
      var bDates = effectiveDates(b);
      var cDates = effectiveDates(c);
      var comparable = bDates.source !== null && cDates.source !== null;
      var sameSource = bDates.source === cDates.source;
      var startVarianceDays = comparable ? daysBetween(bDates.start, cDates.start) : null;
      var finishVarianceDays = comparable ? daysBetween(bDates.finish, cDates.finish) : null;
      var durationVarianceDays =
        b.duration !== null && b.duration !== undefined && c.duration !== null && c.duration !== undefined
          ? c.duration - b.duration
          : null;
      var baselineCritical = isCriticalFromFloat(b.total_float);
      var currentCritical = isCriticalFromFloat(c.total_float);

      matched.push({
        id: c.id,
        external_id: c.external_id,
        name: c.name,
        baseline: { start: bDates.start, finish: bDates.finish, source: bDates.source, duration: b.duration, total_float: b.total_float, is_critical: baselineCritical },
        current: { start: cDates.start, finish: cDates.finish, source: cDates.source, duration: c.duration, total_float: c.total_float, is_critical: currentCritical },
        comparable: comparable,
        mixed_date_sources: comparable && !sameSource, // e.g. baseline was calculated, current is only planned (or vice versa)
        start_variance_days: startVarianceDays,
        finish_variance_days: finishVarianceDays,
        duration_variance_days: durationVarianceDays,
        criticality_changed: baselineCritical !== null && currentCritical !== null && baselineCritical !== currentCritical,
      });
    });
    var added = [];
    Object.keys(currentByKey).forEach(function (key) {
      if (!baselineByKey[key]) {
        var c = currentByKey[key];
        added.push({ id: c.id, external_id: c.external_id, name: c.name });
      }
    });

    // Relationship (logic) changes, matched by activity key rather than raw id so a
    // re-imported revision's fresh relationship ids don't register as "all logic
    // changed" when the actual predecessor/successor structure didn't.
    var baselineActivityKeyById = {};
    snapshot.activities.forEach(function (a) {
      baselineActivityKeyById[a.id] = matchKey(a);
    });
    var currentActivityKeyById = {};
    currentActivities.forEach(function (a) {
      currentActivityKeyById[a.id] = matchKey(a);
    });
    var baselineSignatures = {};
    snapshot.relationships.forEach(function (r) {
      baselineSignatures[relationshipSignature(r, baselineActivityKeyById)] = r;
    });
    var currentSignatures = {};
    currentRelationships.forEach(function (r) {
      currentSignatures[relationshipSignature(r, currentActivityKeyById)] = r;
    });
    var logicAdded = Object.keys(currentSignatures).filter(function (sig) {
      return !baselineSignatures[sig];
    }).length;
    var logicRemoved = Object.keys(baselineSignatures).filter(function (sig) {
      return !currentSignatures[sig];
    }).length;

    // Project-level finish variance: overall finish across ALL baseline activities
    // (not just matched ones) vs overall finish across ALL current activities, each
    // using its own effective (calculated-if-available, else planned) date \u2014 mirrors
    // the same planned-vs-forecast convention scheduleCpmEngine.js already uses within
    // a single schedule, applied here across the baseline/current boundary instead.
    function overallFinish(activityList) {
      var finishes = activityList
        .map(function (a) { return effectiveDates(a).finish; })
        .filter(function (f) { return f !== null; });
      if (finishes.length === 0) return null;
      return finishes.reduce(function (max, f) { return f > max ? f : max; });
    }
    var baselineOverallFinish = overallFinish(snapshot.activities);
    var currentOverallFinish = overallFinish(currentActivities);
    var projectFinishVarianceDays = daysBetween(baselineOverallFinish, currentOverallFinish);

    var comparableMatched = matched.filter(function (m) { return m.comparable; });
    var delayed = comparableMatched.filter(function (m) { return m.finish_variance_days > 0; }).length;
    var ahead = comparableMatched.filter(function (m) { return m.finish_variance_days < 0; }).length;
    var onTime = comparableMatched.filter(function (m) { return m.finish_variance_days === 0; }).length;
    var maxDelayDays = comparableMatched.reduce(function (max, m) {
      return m.finish_variance_days > max ? m.finish_variance_days : max;
    }, 0);

    return {
      schedule_id: snapshot.schedule_id,
      baseline_captured_at: snapshot.captured_at,
      activities: { matched: matched, added: added, removed: removed },
      relationship_changes: { added: logicAdded, removed: logicRemoved },
      summary: {
        activity_count_baseline: snapshot.activities.length,
        activity_count_current: currentActivities.length,
        matched_count: matched.length,
        added_count: added.length,
        removed_count: removed.length,
        not_comparable_count: matched.length - comparableMatched.length,
        delayed_count: delayed,
        ahead_count: ahead,
        on_time_count: onTime,
        max_delay_days: maxDelayDays,
        baseline_overall_finish: baselineOverallFinish,
        current_overall_finish: currentOverallFinish,
        project_finish_variance_days: projectFinishVarianceDays,
      },
    };
  }

  window.PCC.scheduleBaselineEngine = {
    buildSnapshot: buildSnapshot,
    compareBaselineToCurrent: compareBaselineToCurrent,
    matchKey: matchKey,
  };
})();
