/* Schedule Gantt layout — calculation only, no DOM, no store writes. Same separation
 * scheduleCpmEngine.js and scheduleBaselineEngine.js keep: this module turns a
 * schedule's activities into plain row/date data; schedule.js is the only place that
 * turns that into SVG.
 *
 * SCOPE, DELIBERATELY (Gate 5 — Gantt chart view, completing the Tier 2 "Schedule
 * import + CPM/float engine + Gantt" line item):
 * - Visualization only. No drag-to-reschedule, no inline editing — activities are
 *   still edited through the existing Activities tab form. Adding chart-driven editing
 *   would be a separate, later decision, not something to fold in here.
 * - Date precedence matches scheduleBaselineEngine.js's effectiveDates(): calculated
 *   (early_start/early_finish) wins when both are present, falling back to planned
 *   dates, so a schedule that hasn't been through "Calculate Schedule" yet still draws
 *   something meaningful instead of an empty chart.
 * - No calendar/working-days awareness, matching scheduleCpmEngine.js's own documented
 *   scope — a bar's width is calendar days between its two dates, nothing fancier.
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
  function addDays(isoDateStr, days) {
    return toIsoDate(toDayNumber(isoDateStr) + days);
  }

  /** Same date precedence as scheduleBaselineEngine.js's effectiveDates(): calculated
   * dates win when both early_start/early_finish are present, else planned dates, else
   * this activity has no usable dates at all. */
  function effectiveDates(a) {
    if (a.early_start && a.early_finish) {
      return { start: a.early_start, finish: a.early_finish, source: "calculated" };
    }
    if (a.planned_start && a.planned_finish) {
      return { start: a.planned_start, finish: a.planned_finish, source: "planned" };
    }
    // A milestone typically carries a single date rather than a start+finish pair —
    // treat one present calculated/planned date as both ends of a zero-width bar
    // rather than excluding every milestone that wasn't given a matching pair.
    if (a.activity_type === "milestone") {
      if (a.early_start) return { start: a.early_start, finish: a.early_start, source: "calculated" };
      if (a.planned_start) return { start: a.planned_start, finish: a.planned_start, source: "planned" };
    }
    return { start: null, finish: null, source: "none" };
  }

  function diffDays(fromIso, toIso) {
    return toDayNumber(toIso) - toDayNumber(fromIso);
  }

  /** Builds Gantt row data for one schedule's activities. `options.dataDate` is the
   * schedule's data_date (optional) — passed through unchanged so the caller can draw
   * a "today"/data-date marker; this module doesn't interpret it further. */
  function computeLayout(activities, options) {
    options = options || {};
    var dataDate = options.dataDate || null;

    var rows = activities.map(function (a) {
      var dates = effectiveDates(a);
      var isMilestone = a.activity_type === "milestone";
      return {
        id: a.id,
        name: a.name || "(unnamed activity)",
        activityType: a.activity_type,
        isMilestone: isMilestone,
        isCritical: a.total_float != null && a.total_float <= 0,
        hasFloatData: a.total_float != null,
        dateSource: dates.source,
        start: dates.start,
        finish: dates.finish,
        durationDays: dates.source === "none" ? null : Math.max(0, diffDays(dates.start, dates.finish)),
        percentComplete: a.percent_complete == null ? 0 : Number(a.percent_complete) || 0,
      };
    });

    var dated = rows.filter(function (r) {
      return r.dateSource !== "none";
    });
    var undated = rows.filter(function (r) {
      return r.dateSource === "none";
    });

    dated.sort(function (a, b) {
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    undated.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    var rangeStart = null;
    var rangeEnd = null;
    dated.forEach(function (r) {
      if (rangeStart === null || r.start < rangeStart) rangeStart = r.start;
      if (rangeEnd === null || r.finish > rangeEnd) rangeEnd = r.finish;
    });
    // A data date outside the activity span (e.g. a schedule calculated far past its
    // last planned finish) still belongs on the axis, so it can extend the range too.
    if (dataDate && rangeStart !== null) {
      if (dataDate < rangeStart) rangeStart = dataDate;
      if (dataDate > rangeEnd) rangeEnd = dataDate;
    }

    return {
      rows: dated.concat(undated),
      datedCount: dated.length,
      undatedCount: undated.length,
      rangeStart: rangeStart,
      rangeEnd: rangeEnd,
      dataDate: dataDate,
    };
  }

  window.PCC.scheduleGanttLayout = {
    computeLayout: computeLayout,
    diffDays: diffDays,
    addDays: addDays,
  };
})();
