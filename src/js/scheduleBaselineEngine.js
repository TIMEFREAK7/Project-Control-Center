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
  function buildSnapshot(schedule, wbsItems, activities, relationships, calendars) {
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
          // Phase 4 (Schedule Versioning & Comparison), master upgrade prompt Section 52
          // ("changed relationships... changed calendars"): calendar_id/constraint_*
          // weren't captured before this — a baseline couldn't tell you a re-assigned
          // calendar or a newly-added constraint even happened.
          calendar_id: a.calendar_id,
          constraint_type: a.constraint_type,
          constraint_date: a.constraint_date,
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
      // Phase 4: trimmed to the fields that actually define a calendar's working-time
      // shape — enough to detect "this calendar's definition changed" without carrying
      // created_at/updated_at/project_id, which have no comparison value here.
      calendars: (calendars || []).map(function (c) {
        return {
          id: c.id,
          name: c.name,
          working_days: c.working_days,
          holidays: c.holidays,
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

  /** The overall finish across a list of activities (snapshot or current/live), each
   * judged on its own effective date (calculated if available, else planned) — same
   * "own effective date" convention as effectiveDates() above. Hoisted to module scope
   * (Gate 22, PCC Evolution Roadmap Tier F: Baseline & Schedule Revision Control) so
   * schedule.js's captureBaseline() can call it directly at capture time to store a
   * baseline's own project finish synchronously (see store.js's newScheduleBaseline()
   * comment on baseline_project_finish for why), not just internally within
   * compareBaselineToCurrent() below. */
  function overallFinish(activityList) {
    var finishes = activityList
      .map(function (a) { return effectiveDates(a).finish; })
      .filter(function (f) { return f !== null; });
    if (finishes.length === 0) return null;
    return finishes.reduce(function (max, f) { return f > max ? f : max; });
  }

  /** A calendar's comparison-relevant "shape" as one string \u2014 two calendars with the
   * same id are considered unchanged only if this matches, so a rename alone doesn't
   * count as a working-time change (name is reported separately) but a working-day or
   * holiday-list edit does. */
  function calendarShapeKey(cal) {
    return JSON.stringify({ working_days: cal.working_days, holidays: cal.holidays });
  }

  /** Calendars, matched by id (calendars aren't re-imported with fresh ids the way
   * activities are \u2014 Section 52's "changed calendars"). Returns counts plus the names of
   * any modified calendars, and a lookup a caller can use to tell whether one specific
   * calendar id changed. */
  function compareCalendars(baselineCalendars, currentCalendars) {
    var baselineById = {};
    (baselineCalendars || []).forEach(function (c) { baselineById[c.id] = c; });
    var currentById = {};
    (currentCalendars || []).forEach(function (c) { currentById[c.id] = c; });

    var added = [];
    var removed = [];
    var modifiedIds = {};
    var modifiedNames = [];

    Object.keys(currentById).forEach(function (id) {
      if (!baselineById[id]) added.push({ id: id, name: currentById[id].name });
    });
    Object.keys(baselineById).forEach(function (id) {
      var b = baselineById[id];
      var c = currentById[id];
      if (!c) {
        removed.push({ id: id, name: b.name });
        return;
      }
      if (calendarShapeKey(b) !== calendarShapeKey(c)) {
        modifiedIds[id] = true;
        modifiedNames.push(c.name);
      }
    });

    return { added: added, removed: removed, modifiedIds: modifiedIds, modifiedNames: modifiedNames };
  }

  /** Compare a stored baseline snapshot against a current WBS/Activity/Relationship set.
   * `currentActivities`/`currentRelationships`/`currentWbsItems` need not belong to the
   * same schedule_id the snapshot was captured from \u2014 comparing a baseline against a
   * later re-imported revision is the common case, not the exception (see header).
   * `currentCalendars` is optional (defaults to none) so existing callers/snapshots
   * captured before Phase 4 keep working \u2014 calendar/constraint comparison then simply
   * reports nothing changed rather than erroring on missing data. */
  function compareBaselineToCurrent(snapshot, currentWbsItems, currentActivities, currentRelationships, currentCalendars) {
    var baselineByKey = {};
    snapshot.activities.forEach(function (a) {
      baselineByKey[matchKey(a)] = a;
    });
    var currentByKey = {};
    currentActivities.forEach(function (a) {
      currentByKey[matchKey(a)] = a;
    });

    var calendarDiff = compareCalendars(snapshot.calendars, currentCalendars);

    var matched = [];
    var removed = [];
    var criticalPathEntered = [];
    var criticalPathLeft = [];
    var criticalPathStableCount = 0;
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

      if (baselineCritical !== null && currentCritical !== null) {
        if (!baselineCritical && currentCritical) criticalPathEntered.push({ id: c.id, name: c.name });
        else if (baselineCritical && !currentCritical) criticalPathLeft.push({ id: c.id, name: c.name });
        else if (baselineCritical && currentCritical) criticalPathStableCount++;
      }

      // Section 52: "changed relationships... changed calendars" \u2014 a reassignment to a
      // different calendar counts as changed even if that calendar's own definition
      // didn't, and vice versa: the same calendar_id counts as changed if that
      // calendar's working days/holidays were edited since the baseline was captured.
      var calendarChanged =
        (b.calendar_id || null) !== (c.calendar_id || null) ||
        (!!c.calendar_id && !!calendarDiff.modifiedIds[c.calendar_id]);
      var constraintChanged = (b.constraint_type || "") !== (c.constraint_type || "") || (b.constraint_date || "") !== (c.constraint_date || "");

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
        calendar_changed: calendarChanged,
        constraint_changed: constraintChanged,
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

    var calendarChangedCount = matched.filter(function (m) { return m.calendar_changed; }).length;
    var constraintChangedCount = matched.filter(function (m) { return m.constraint_changed; }).length;

    return {
      schedule_id: snapshot.schedule_id,
      baseline_captured_at: snapshot.captured_at,
      activities: { matched: matched, added: added, removed: removed },
      relationship_changes: { added: logicAdded, removed: logicRemoved },
      calendar_changes: {
        added: calendarDiff.added,
        removed: calendarDiff.removed,
        modified_count: calendarDiff.modifiedNames.length,
        modified_names: calendarDiff.modifiedNames,
      },
      // Section 52's "critical path movement" as its own holistic metric, distinct from
      // the per-activity criticality_changed flag already on each matched entry above —
      // this is "did THE critical path shift," not just "did this one activity flip."
      critical_path_changes: {
        entered: criticalPathEntered,
        left: criticalPathLeft,
        stable_count: criticalPathStableCount,
        changed: criticalPathEntered.length > 0 || criticalPathLeft.length > 0,
      },
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
        calendar_changed_count: calendarChangedCount,
        constraint_changed_count: constraintChangedCount,
      },
    };
  }

  window.PCC.scheduleBaselineEngine = {
    buildSnapshot: buildSnapshot,
    compareBaselineToCurrent: compareBaselineToCurrent,
    matchKey: matchKey,
    overallFinish: overallFinish,
  };
})();
