/* Resource leveling engine (Gate 11 — Resource Management) — calculation only, no DOM,
 * no store writes. Same separation every other engine in this app keeps
 * (scheduleCpmEngine.js, costEvmEngine.js, projectHealthEngine.js): resources.js hands
 * this plain arrays from the store, gets back a day-by-day usage timeline and
 * over-allocation detection, and is the only place that renders either.
 *
 * SCOPE, DELIBERATELY:
 * - Cross-project by design. A ResourceAssignment points at one Schedule activity,
 *   and that activity already belongs to one project/schedule — but this engine is
 *   handed the FULL `activities` array (every project's), not one project's, because
 *   the entire point of resource leveling is catching a resource double-booked across
 *   two different projects' schedules, not just within one. Callers that want a
 *   single project's view filter the *output*, not the input.
 * - No cost. Quantity/availability only — see store.js's header comment above
 *   newResource()/newResourceAssignment() for why rate x usage doesn't feed Cost
 *   Tracking/EVM this gate.
 * - Milestones and zero/undated activities don't consume a resource over a span —
 *   a milestone is a point in time, not work with duration, and an activity with no
 *   usable dates has nothing to allocate against. Both are skipped, counted, and
 *   reported back so the caller can say so rather than silently under-counting.
 * - `max_availability` unset (null) means "not computable," never "zero capacity" —
 *   same "don't fabricate, mark unavailable" discipline projectHealthEngine.js
 *   already established for a factor with no underlying data.
 * - Date precedence matches every other engine in this app: calculated (early_start/
 *   early_finish) wins when present, falling back to planned dates.
 *
 * PCC Evolution Roadmap, Tier F (Gate 18): resource_unavailability rows (leave, a
 * public holiday for a labor pool, equipment down for maintenance) now reduce a
 * resource's EFFECTIVE daily availability — `max_availability` minus whatever
 * unavailability quantity overlaps that specific day — rather than the flat
 * `max_availability` number applying unconditionally on every day. Unavailability
 * date ranges are INCLUSIVE of both start_date and end_date (see store.js's
 * newResourceUnavailability comment for why that's a deliberate departure from the
 * exclusive-end [start, finish) convention Schedule activities use).
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
  function diffDays(fromIso, toIso) {
    return toDayNumber(toIso) - toDayNumber(fromIso);
  }
  function addDays(isoDateStr, days) {
    return toIsoDate(toDayNumber(isoDateStr) + days);
  }

  /** Same precedence every engine in this app uses: calculated wins, planned falls
   * back, milestones/undated activities report source: 'none' (see file header). */
  function effectiveDates(activity) {
    if (activity.activity_type === "milestone") return { start: null, finish: null, source: "none" };
    if (activity.early_start && activity.early_finish) {
      return { start: activity.early_start, finish: activity.early_finish, source: "calculated" };
    }
    if (activity.planned_start && activity.planned_finish) {
      return { start: activity.planned_start, finish: activity.planned_finish, source: "planned" };
    }
    return { start: null, finish: null, source: "none" };
  }

  /** Builds a day-by-day allocation timeline for one resource across every assignment
   * that references it, regardless of which project/schedule the assignment's
   * activity belongs to. `activities` should be the FULL cross-project array (see
   * file header). A "day worked" is [start, finish) — a 5-day task starting day 0
   * occupies days 0-4, not day 5, matching how duration is defined everywhere else in
   * this app (diffDays(start,finish) === duration).
   *
   * @returns { days: [{ date, allocated, contributors: [{assignmentId, activityId,
   *             activityName, projectId, quantity}] }], rangeStart, rangeEnd,
   *           skippedCount (assignments excluded: milestone/undated/zero-duration/
   *           no quantity/missing activity) } */
  function computeResourceUsageTimeline(resource, assignments, activities) {
    var relevant = assignments.filter(function (a) { return a.resource_id === resource.id; });
    var activityById = {};
    activities.forEach(function (a) { activityById[a.id] = a; });

    var dayMap = {}; // dayNumber -> { allocated, contributors: [] }
    var rangeStartDay = null;
    var rangeEndDay = null;
    var skippedCount = 0;

    relevant.forEach(function (assignment) {
      var activity = activityById[assignment.activity_id];
      var qty = Number(assignment.quantity);
      if (!activity || !qty || qty <= 0) {
        skippedCount++;
        return;
      }
      var dates = effectiveDates(activity);
      if (dates.source === "none") {
        skippedCount++;
        return;
      }
      var startDay = toDayNumber(dates.start);
      var endDay = toDayNumber(dates.finish); // exclusive
      if (endDay <= startDay) {
        skippedCount++;
        return;
      }
      if (rangeStartDay === null || startDay < rangeStartDay) rangeStartDay = startDay;
      if (rangeEndDay === null || endDay > rangeEndDay) rangeEndDay = endDay;

      for (var d = startDay; d < endDay; d++) {
        if (!dayMap[d]) dayMap[d] = { allocated: 0, contributors: [] };
        dayMap[d].allocated += qty;
        dayMap[d].contributors.push({
          assignmentId: assignment.id,
          activityId: activity.id,
          activityName: activity.name || "(unnamed activity)",
          projectId: activity.project_id,
          quantity: qty,
        });
      }
    });

    var days = [];
    if (rangeStartDay !== null) {
      for (var day = rangeStartDay; day < rangeEndDay; day++) {
        var entry = dayMap[day] || { allocated: 0, contributors: [] };
        days.push({ date: toIsoDate(day), allocated: entry.allocated, contributors: entry.contributors });
      }
    }

    return {
      days: days,
      rangeStart: rangeStartDay !== null ? toIsoDate(rangeStartDay) : null,
      rangeEnd: rangeEndDay !== null ? toIsoDate(rangeEndDay - 1) : null, // inclusive, for display
      skippedCount: skippedCount,
    };
  }

  /** Sum of every unavailability record's `quantity` for one resource that overlaps
   * dayNumber — inclusive on both ends (see file header). Several overlapping records
   * for the same resource stack (e.g. 2 on leave + 1 separately on a training course =
   * 3 unavailable that day), same "several records can independently affect the same
   * day" treatment resourceLevelingEngine.js already gives overlapping assignments. */
  function unavailableQtyOnDay(unavailabilities, resourceId, dayNumber) {
    var total = 0;
    unavailabilities.forEach(function (u) {
      if (u.resource_id !== resourceId || !u.start_date || !u.end_date) return;
      var s = toDayNumber(u.start_date);
      var e = toDayNumber(u.end_date);
      if (dayNumber >= s && dayNumber <= e) total += Number(u.quantity) || 0;
    });
    return total;
  }

  /** Effective availability for one resource on one day: max_availability minus
   * whatever unavailability overlaps that day, floored at 0 (can't go negative — an
   * over-recorded leave quantity just means "fully unavailable," not "negative
   * capacity"). Returns null when max_availability itself isn't set — "not
   * computable," never "zero capacity," same discipline as every caller already
   * expects from a null max_availability. */
  function availabilityOnDay(resource, unavailabilities, dayNumber) {
    if (resource.max_availability === null || resource.max_availability === undefined) return null;
    var reducedBy = unavailableQtyOnDay(unavailabilities, resource.id, dayNumber);
    return Math.max(0, Number(resource.max_availability) - reducedBy);
  }

  /** @param unavailabilities  full resource_unavailability array (filtered internally
   *   to this resource, same convention computeResourceUsageTimeline uses for
   *   assignments) — omit/pass [] for the pre-Gate-18 flat-availability behavior.
   * @returns { available: boolean (false when max_availability isn't set — "not
   *             computable," never "zero capacity"), overAllocatedDays: [{date,
   *             allocated, available, overBy, contributors}], count, maxOverBy,
   *             firstDate, lastDate } */
  function detectOverAllocations(resource, timeline, unavailabilities) {
    unavailabilities = unavailabilities || [];
    if (resource.max_availability === null || resource.max_availability === undefined) {
      return { available: false, overAllocatedDays: [], count: 0, maxOverBy: null, firstDate: null, lastDate: null };
    }
    var overAllocatedDays = timeline.days
      .map(function (d) {
        var avail = availabilityOnDay(resource, unavailabilities, toDayNumber(d.date));
        return { date: d.date, allocated: d.allocated, available: avail, overBy: d.allocated - avail, contributors: d.contributors };
      })
      .filter(function (d) { return d.overBy > 0; });
    var maxOverBy = overAllocatedDays.reduce(function (m, d) { return Math.max(m, d.overBy); }, 0);
    return {
      available: true,
      overAllocatedDays: overAllocatedDays,
      count: overAllocatedDays.length,
      maxOverBy: overAllocatedDays.length ? maxOverBy : null,
      firstDate: overAllocatedDays.length ? overAllocatedDays[0].date : null,
      lastDate: overAllocatedDays.length ? overAllocatedDays[overAllocatedDays.length - 1].date : null,
    };
  }

  /** Portfolio-wide rollup: for every resource, how many over-allocated days does it
   * have right now, across every project it's assigned in. Used by Executive Center /
   * Portfolio's Details panel for a quick "N resources over-allocated" signal without
   * each caller re-running the day-by-day scan itself. Resources with
   * max_availability unset are excluded (not computable), not counted as 0. */
  function portfolioOverAllocationSummary(resources, assignments, activities, unavailabilities) {
    unavailabilities = unavailabilities || [];
    return resources
      .map(function (r) {
        var timeline = computeResourceUsageTimeline(r, assignments, activities);
        var result = detectOverAllocations(r, timeline, unavailabilities);
        return { resourceId: r.id, resourceName: r.name || "(unnamed resource)", available: result.available, overAllocatedDayCount: result.count, maxOverBy: result.maxOverBy };
      })
      .filter(function (r) { return r.available && r.overAllocatedDayCount > 0; })
      .sort(function (a, b) { return b.overAllocatedDayCount - a.overAllocatedDayCount; });
  }

  /** Utilisation (allocated ÷ effective-available, as a %) per day, plus a
   * demand/available/shortfall rollup across the resource's whole active date range
   * (in "unit-days" — e.g. 3 electricians for 4 days = 12 unit-days of demand). A day
   * where available is 0 but something is still allocated has no finite utilisation %
   * to plot (utilisationPct: null for that day) — it's already captured by
   * totalShortfallUnitDays and by detectOverAllocations' own per-day list, so nothing
   * is silently lost, just not forced into a misleading percentage. */
  function computeUtilisation(resource, timeline, unavailabilities) {
    unavailabilities = unavailabilities || [];
    if (resource.max_availability === null || resource.max_availability === undefined) {
      return { available: false, days: [], averageUtilisationPct: null, totalDemandUnitDays: 0, totalAvailableUnitDays: null, totalShortfallUnitDays: null };
    }
    var totalDemand = 0;
    var totalAvailable = 0;
    var totalShortfall = 0;
    var pctSum = 0;
    var pctCount = 0;
    var days = timeline.days.map(function (d) {
      var avail = availabilityOnDay(resource, unavailabilities, toDayNumber(d.date));
      totalDemand += d.allocated;
      totalAvailable += avail;
      if (d.allocated > avail) totalShortfall += d.allocated - avail;
      var pct = avail > 0 ? (d.allocated / avail) * 100 : d.allocated > 0 ? null : 0;
      if (pct !== null) {
        pctSum += pct;
        pctCount++;
      }
      return { date: d.date, allocated: d.allocated, available: avail, utilisationPct: pct };
    });
    return {
      available: true,
      days: days,
      averageUtilisationPct: pctCount ? pctSum / pctCount : null,
      totalDemandUnitDays: totalDemand,
      totalAvailableUnitDays: totalAvailable,
      totalShortfallUnitDays: totalShortfall,
    };
  }

  /** Same bucketing shape as bucketTimeline, but AVERAGES utilisationPct per bucket
   * instead of taking the max — a trend is about typical load, whereas bucketTimeline's
   * max-of-bucket is deliberately tuned for spotting over-allocation spikes instead.
   * Days with a null utilisationPct (see computeUtilisation) are excluded from the
   * average, not treated as 0. */
  function bucketUtilisation(days, bucketSizeDays) {
    if (!days.length) return [];
    var buckets = [];
    for (var i = 0; i < days.length; i += bucketSizeDays) {
      var slice = days.slice(i, i + bucketSizeDays);
      var sum = 0;
      var count = 0;
      slice.forEach(function (d) {
        if (d.utilisationPct !== null) {
          sum += d.utilisationPct;
          count++;
        }
      });
      buckets.push({ bucketStart: slice[0].date, bucketEnd: slice[slice.length - 1].date, avgUtilisationPct: count ? sum / count : null });
    }
    return buckets;
  }

  /** Buckets a day timeline into fixed-size windows (e.g. weekly) for charting long
   * ranges without one bar per day — takes the MAX allocated within each bucket
   * (worst case), not the average, since the point of the chart is spotting
   * over-allocation, and averaging would wash out a short sharp spike. */
  function bucketTimeline(days, bucketSizeDays) {
    if (!days.length) return [];
    var buckets = [];
    for (var i = 0; i < days.length; i += bucketSizeDays) {
      var slice = days.slice(i, i + bucketSizeDays);
      var maxAllocated = slice.reduce(function (m, d) { return Math.max(m, d.allocated); }, 0);
      buckets.push({ bucketStart: slice[0].date, bucketEnd: slice[slice.length - 1].date, allocatedMax: maxAllocated });
    }
    return buckets;
  }

  window.PCC.resourceLevelingEngine = {
    computeResourceUsageTimeline: computeResourceUsageTimeline,
    detectOverAllocations: detectOverAllocations,
    portfolioOverAllocationSummary: portfolioOverAllocationSummary,
    bucketTimeline: bucketTimeline,
    computeUtilisation: computeUtilisation,
    bucketUtilisation: bucketUtilisation,
    diffDays: diffDays,
    addDays: addDays,
  };
})();
