/* Cost EVM (Earned Value Management) engine — calculation only, no DOM, no store
 * writes. Same separation scheduleCpmEngine.js and scheduleGanttLayout.js keep.
 *
 * SCOPE, DELIBERATELY (Gate 7 — activity-linked EVM, the detailed option chosen
 * explicitly over a simpler project-level approximation, Aditya, this session):
 *
 * - A budget item optionally links to ONE Schedule activity via `activity_id`
 *   (many-to-one: several budget items may point at the same activity, one item can't
 *   span several — same shape as `budget_item_id` on cost_actuals). Only linked items
 *   with usable dates contribute to Planned Value and Earned Value; unlinked items
 *   still count toward Budget at Completion but are excluded from PV/EV and flagged
 *   via `unlinkedBac`/`coveragePct` rather than silently guessed or blended in.
 * - Planned Value per linked item is a LINEAR distribution of that item's budget
 *   across its own activity's date span (calculated early_start/early_finish
 *   preferred, falling back to planned_start/planned_finish — same precedence
 *   scheduleBaselineEngine.js and scheduleGanttLayout.js already use). No day-by-day
 *   time-phased cost curve exists in this app's data model; a straight-line
 *   distribution across each activity's own span is the standard simplification when
 *   finer data isn't available, and it's a real improvement over one project-wide
 *   straight line since it respects each activity's actual timing.
 * - Earned Value per linked item is that item's budget × its activity's real
 *   `percent_complete` — not a project-wide average.
 * - Actual Cost is always the FULL actual-cost total for the project, linked or not —
 *   money already spent doesn't stop being real just because it isn't tied to a
 *   specific schedule activity.
 * - EAC uses BAC/CPI specifically (one of several industry-standard EAC formulas,
 *   documented here as a deliberate choice — same "ambiguous industry convention,
 *   pick one and say so" approach scheduleCpmEngine.js already takes for Free Float).
 *   It assumes the project's current cost efficiency (CPI) holds for the remaining
 *   work; ETC = EAC - AC, VAC = BAC - EAC follow from it.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var DAY_MS = 24 * 60 * 60 * 1000;

  function toDayNumber(isoDateStr) {
    var d = new Date(isoDateStr + "T00:00:00Z");
    return Math.round(d.getTime() / DAY_MS);
  }

  function diffDays(fromIso, toIso) {
    return toDayNumber(toIso) - toDayNumber(fromIso);
  }

  /** Same date precedence as scheduleGanttLayout.js's effectiveDates(): calculated
   * dates win when both early_start/early_finish are present, else planned, else a
   * milestone's single date treated as both ends of a zero-width span, else none. */
  function effectiveDates(activity) {
    if (activity.early_start && activity.early_finish) {
      return { start: activity.early_start, finish: activity.early_finish, source: "calculated" };
    }
    if (activity.planned_start && activity.planned_finish) {
      return { start: activity.planned_start, finish: activity.planned_finish, source: "planned" };
    }
    if (activity.activity_type === "milestone") {
      if (activity.early_start) return { start: activity.early_start, finish: activity.early_start, source: "calculated" };
      if (activity.planned_start) return { start: activity.planned_start, finish: activity.planned_start, source: "planned" };
    }
    return { start: null, finish: null, source: "none" };
  }

  function clampPercent(value) {
    var n = Number(value) || 0;
    return Math.max(0, Math.min(100, n));
  }

  /** PV for one linked item: 0 before its span starts, full budget after it ends,
   * linear in between. A zero-duration span (milestone) is a step function at its
   * single date rather than a division-by-zero. Returns null when there's no usable
   * data date or activity date to compute against — never a guessed number. */
  function itemPlannedValue(itemBac, activity, dataDate) {
    if (!dataDate) return null;
    var dates = effectiveDates(activity);
    if (dates.source === "none") return null;

    var durationDays = diffDays(dates.start, dates.finish);
    var fraction;
    if (durationDays <= 0) {
      fraction = dataDate >= dates.start ? 1 : 0;
    } else {
      var elapsed = diffDays(dates.start, dataDate);
      fraction = Math.max(0, Math.min(1, elapsed / durationDays));
    }
    return itemBac * fraction;
  }

  /** Computes EVM for one project's budget items. `options.bac`/`options.ac` let the
   * caller (cost.js) pass in numbers already computed elsewhere (e.g.
   * projectCostSummary()'s Portfolio-Budget-fallback-aware total) so there's one
   * source of truth for "what does Budget at Completion mean for this project" rather
   * than two divergent calculations; omit either to derive it from budgetItems/actuals
   * directly. `options.dataDate` overrides using each activity's own schedule's
   * data_date (useful for "as of X" what-if views; not used by the current UI). */
  function computeEvm(budgetItems, actuals, activities, schedules, options) {
    options = options || {};

    var linkedBac = 0;
    var unlinkedBac = 0;
    var pv = 0;
    var ev = 0;
    var items = [];

    budgetItems.forEach(function (item) {
      var itemBac = Number(item.planned_amount) || 0;
      var activity = item.activity_id
        ? activities.find(function (a) {
            return a.id === item.activity_id;
          })
        : null;

      if (!activity) {
        unlinkedBac += itemBac;
        items.push({ id: item.id, name: item.name, linked: false, bac: itemBac, ev: null, pv: null });
        return;
      }

      linkedBac += itemBac;
      var itemEv = itemBac * (clampPercent(activity.percent_complete) / 100);
      ev += itemEv;

      var schedule = schedules.find(function (s) {
        return s.id === activity.schedule_id;
      });
      var dataDate = options.dataDate || (schedule && schedule.data_date) || null;
      var itemPv = itemPlannedValue(itemBac, activity, dataDate);
      if (itemPv !== null) pv += itemPv;

      items.push({
        id: item.id,
        name: item.name,
        linked: true,
        activityName: activity.name,
        dateSource: effectiveDates(activity).source,
        bac: itemBac,
        ev: itemEv,
        pv: itemPv,
      });
    });

    var bac = options.bac != null ? options.bac : linkedBac + unlinkedBac;
    var ac =
      options.ac != null
        ? options.ac
        : actuals.reduce(function (sum, a) {
            return sum + (Number(a.amount) || 0);
          }, 0);

    var cv = ev - ac;
    var sv = ev - pv;
    // Guarded on linkedBac > 0, not just ac/pv > 0: with zero linked budget items,
    // ev is 0 because nothing is measurable yet, not because performance is actually
    // zero — showing CPI/SPI as 0.00 in that case would be a false alarm, not a real
    // one. A real 0% (work legitimately hasn't started on linked, dated activities)
    // still correctly produces cpi/spi of 0 once something IS linked.
    var cpi = ac > 0 && linkedBac > 0 ? ev / ac : null;
    var spi = pv > 0 && linkedBac > 0 ? ev / pv : null;
    var eac = cpi ? bac / cpi : null;
    var etc = eac != null ? eac - ac : null;
    var vac = eac != null ? bac - eac : null;
    var coveragePct = bac > 0 ? Math.round((linkedBac / bac) * 100) : null;

    return {
      bac: bac,
      ac: ac,
      pv: pv,
      ev: ev,
      cv: cv,
      sv: sv,
      cpi: cpi,
      spi: spi,
      eac: eac,
      etc: etc,
      vac: vac,
      linkedBac: linkedBac,
      unlinkedBac: unlinkedBac,
      coveragePct: coveragePct,
      items: items,
    };
  }

  window.PCC.costEvmEngine = {
    computeEvm: computeEvm,
    effectiveDates: effectiveDates,
    diffDays: diffDays,
  };
})();
