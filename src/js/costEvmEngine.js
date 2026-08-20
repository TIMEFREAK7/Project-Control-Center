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
 *
 * EARNED SCHEDULE (Gate 25, PCC Evolution Roadmap Tier F: Advanced Schedule
 * Performance): classic SPI (spi = ev/pv, above) has a well-documented flaw — it
 * mathematically converges to 1.0 as a project nears completion regardless of how late
 * it actually finishes, since PV stops growing once every activity's planned span has
 * elapsed while EV can still catch up to it. Earned Schedule (Lipke) is the standard
 * fix: instead of comparing dollars, it asks "at what point on the PLANNED time curve
 * would today's EV have been earned?" (ES, in days) and compares that to how much time
 * has actually elapsed (AT). SPI(t) = ES/AT doesn't have classic SPI's end-of-project
 * convergence problem. computeEarnedSchedule() rebuilds the same per-item linear PV(t)
 * ramps itemPlannedValue() already computes (one call per item at a single date) into a
 * full day-by-day PV(t) CURVE, then walks it forward from EV=0 to find the day ES
 * crosses today's actual EV, interpolating within that day for a smooth (non-stepped)
 * value. A plain forward linear scan, not a closed-form inversion or binary search —
 * this app avoids algorithmic cleverness where a simple, obviously-correct loop suffices
 * (same style scheduleCpmEngine.js's forward/backward passes already use), and a
 * project's day count here is small enough that the scan cost is irrelevant.
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

  /** Earned Schedule — see the file header for why this exists alongside classic SPI.
   * Rebuilds the linked items' [bac, start, finish] spans independently of computeEvm()
   * (this can be called on its own, e.g. from a captured snapshot's own recomputation)
   * and walks a day-by-day PV(t) curve to find where EV would sit on the PLANNED
   * timeline. `options.ev`/`options.dataDate` are required — pass the EV computeEvm()
   * already produced rather than recomputing it here, so there's one source of truth
   * for "what EV means" across both figures. Returns insufficientData:true (never a
   * guessed number) when there's no usable dated/linked item to build a curve from. */
  function computeEarnedSchedule(budgetItems, activities, options) {
    options = options || {};
    var ev = options.ev;
    var dataDate = options.dataDate;
    var insufficient = { earnedScheduleDays: null, actualTimeDays: null, spiT: null, scheduleVarianceDays: null, projectStart: null, projectFinish: null, insufficientData: true };
    if (ev == null || !dataDate) return insufficient;

    var spans = [];
    budgetItems.forEach(function (item) {
      if (!item.activity_id) return;
      var activity = activities.find(function (a) { return a.id === item.activity_id; });
      if (!activity) return;
      var dates = effectiveDates(activity);
      if (dates.source === "none") return;
      spans.push({ bac: Number(item.planned_amount) || 0, start: dates.start, finish: dates.finish });
    });
    if (spans.length === 0) return insufficient;

    var projectStart = spans.reduce(function (min, s) { return s.start < min ? s.start : min; }, spans[0].start);
    var projectFinish = spans.reduce(function (max, s) { return s.finish > max ? s.finish : max; }, spans[0].finish);

    function pvAt(dateIso) {
      var total = 0;
      spans.forEach(function (s) {
        var durationDays = diffDays(s.start, s.finish);
        var fraction;
        if (durationDays <= 0) {
          fraction = dateIso >= s.start ? 1 : 0;
        } else {
          var elapsed = diffDays(s.start, dateIso);
          fraction = Math.max(0, Math.min(1, elapsed / durationDays));
        }
        total += s.bac * fraction;
      });
      return total;
    }

    var totalDays = diffDays(projectStart, projectFinish);
    var pvAtFinish = pvAt(projectFinish);

    var earnedScheduleDays;
    if (ev <= 0) {
      earnedScheduleDays = 0;
    } else if (ev >= pvAtFinish) {
      // Ahead of (or exactly at) the full planned curve — extrapolate past
      // projectFinish using the curve's own average rate rather than capping, so
      // SPI(t) can legitimately read above 1.0 for a project running ahead.
      var rate = totalDays > 0 ? pvAtFinish / totalDays : 0;
      earnedScheduleDays = rate > 0 ? totalDays + (ev - pvAtFinish) / rate : totalDays;
    } else {
      earnedScheduleDays = totalDays; // overwritten by the loop below once it finds the crossing day
      var prevPv = 0;
      for (var d = 1; d <= totalDays; d++) {
        var curDate = toIsoDate(toDayNumber(projectStart) + d);
        var curPv = pvAt(curDate);
        if (curPv >= ev) {
          earnedScheduleDays = curPv === prevPv ? d : d - 1 + (ev - prevPv) / (curPv - prevPv);
          break;
        }
        prevPv = curPv;
      }
    }

    var actualTimeDays = diffDays(projectStart, dataDate);
    var spiT = actualTimeDays > 0 ? earnedScheduleDays / actualTimeDays : null;

    return {
      projectStart: projectStart,
      projectFinish: projectFinish,
      earnedScheduleDays: Math.round(earnedScheduleDays * 10) / 10,
      actualTimeDays: actualTimeDays,
      spiT: spiT,
      scheduleVarianceDays: Math.round((earnedScheduleDays - actualTimeDays) * 10) / 10,
      insufficientData: false,
    };
  }

  window.PCC.costEvmEngine = {
    computeEvm: computeEvm,
    effectiveDates: effectiveDates,
    diffDays: diffDays,
    computeEarnedSchedule: computeEarnedSchedule,
  };
})();
