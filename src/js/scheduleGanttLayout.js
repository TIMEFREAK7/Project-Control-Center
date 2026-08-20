/* Schedule Gantt layout — calculation only, no DOM, no store writes. Same separation
 * scheduleCpmEngine.js and scheduleBaselineEngine.js keep: this module turns a
 * schedule's activities into plain row/date data; schedule.js is the only place that
 * turns that into SVG.
 *
 * SCOPE, DELIBERATELY (Gate 5 — Gantt chart view, completing the Tier 2 "Schedule
 * import + CPM/float engine + Gantt" line item):
 * - Date precedence matches scheduleBaselineEngine.js's effectiveDates(): calculated
 *   (early_start/early_finish) wins when both are present, falling back to planned
 *   dates, so a schedule that hasn't been through "Calculate Schedule" yet still draws
 *   something meaningful instead of an empty chart.
 * - No calendar/working-days awareness, matching scheduleCpmEngine.js's own documented
 *   scope — a bar's width is calendar days between its two dates, nothing fancier.
 *
 * GATE 8 (Interactive Gantt Editing) ADDITION: drag-to-move/drag-to-resize date math
 * lives here as plain, pure, testable functions — `schedule.js` is the only place that
 * turns a pointer drag into a pixel delta and calls these, same "calculation here,
 * rendering there" split the rest of this module already keeps. Both functions always
 * write to `planned_start`/`planned_finish` (the user-editable source dates), never to
 * the calculated early/late fields — matching the same rule the Activities tab form
 * already enforces. Neither function touches the store; the caller commits the result.
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

  /** Pixels-of-drag -> whole days, rounding to the nearest day rather than truncating so
   * a small drag past the halfway point of a day-column snaps forward, matching how
   * every commercial Gantt's drag-snap behaves. */
  function daysFromPixelDelta(deltaPx, pxPerDay) {
    if (!pxPerDay) return 0;
    return Math.round(deltaPx / pxPerDay);
  }

  /** Drag-to-move: shifts both dates by the same number of days, preserving duration.
   * `startIso`/`finishIso` must both be present (caller seeds from effective dates —
   * calculated falling back to planned — before starting a drag, same precedence as
   * the rest of this module) — this function itself does no fallback. */
  function moveDates(startIso, finishIso, dayDelta) {
    if (!dayDelta) return { start: startIso, finish: finishIso };
    return { start: addDays(startIso, dayDelta), finish: addDays(finishIso, dayDelta) };
  }

  /** Drag-to-resize (right-edge handle): shifts only the finish date, so duration
   * changes. Clamped so finish can never end up before start — a zero-duration result
   * is allowed (matches a milestone's own zero-width convention) but negative isn't. */
  function resizeFinish(startIso, finishIso, dayDelta) {
    if (!dayDelta) return { start: startIso, finish: finishIso };
    var newFinish = addDays(finishIso, dayDelta);
    if (newFinish < startIso) newFinish = startIso;
    return { start: startIso, finish: newFinish };
  }

  /** Tier 3 "final polish" — Gantt virtualization. Given the full row count and the
   * chart container's current scroll/viewport metrics, returns the [start, end) slice
   * of `rows` that actually needs real DOM (plus `bufferRows` extra on each side, so a
   * fast scroll doesn't show blank rows before the next repaint). Pure and DOM-free —
   * `schedule.js` is the only place that turns this into actual SVG nodes, same
   * "calculation here, rendering there" split every function in this module keeps.
   *
   * `viewportHeight` of 0/falsy means the caller has no real layout to measure from
   * (this is jsdom's default for every element — it does no box-model layout at all,
   * so `clientHeight` is always 0 there) — in that case every row is returned, which
   * is exactly the pre-virtualization behavior every existing Gantt test already
   * depends on. Real virtualization only engages where a real viewport height is
   * available, i.e. an actual browser. */
  function visibleRowRange(totalRows, scrollTop, viewportHeight, rowHeight, headerHeight, bufferRows) {
    if (!viewportHeight) {
      return { start: 0, end: totalRows };
    }
    var firstVisible = Math.floor(Math.max(0, scrollTop - headerHeight) / rowHeight);
    var visibleCount = Math.ceil(viewportHeight / rowHeight) + 1;
    var start = Math.max(0, firstVisible - bufferRows);
    var end = Math.min(totalRows, firstVisible + visibleCount + bufferRows);
    return { start: start, end: end };
  }

  window.PCC.scheduleGanttLayout = {
    computeLayout: computeLayout,
    diffDays: diffDays,
    addDays: addDays,
    daysFromPixelDelta: daysFromPixelDelta,
    moveDates: moveDates,
    resizeFinish: resizeFinish,
    visibleRowRange: visibleRowRange,
  };
})();
