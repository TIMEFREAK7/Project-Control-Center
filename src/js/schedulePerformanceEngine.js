/* Schedule Performance engine (Gate 25, PCC Evolution Roadmap Tier F: Advanced
 * Schedule Performance) — calculation only, no DOM, no store writes. Same separation
 * every other engine in this app keeps (scheduleCpmEngine.js, costEvmEngine.js,
 * projectHealthEngine.js).
 *
 * A DEDICATED score, distinct from projectHealthEngine.js's own "Schedule" factor
 * (Gate 9) — Aditya's own call via AskUserQuestion, made explicitly aware that the
 * overall Project Health Score already has a schedule-related factor. That factor
 * blends critical/near-critical ratios with plan-vs-forecast-finish variance into one
 * contribution toward the OVERALL project score; this is a schedule-only score built
 * from the genuinely new Gate 25 metrics (classic SPI, Earned-Schedule SPI(t),
 * Earned-Schedule variance in days) plus the existing critical-path ratio.
 *
 * Weights here are FIXED, not configurable via Settings the way
 * projectHealthEngine.js's are — this is a smaller, single-purpose score, not a second
 * full configurable scoring system; introducing a second Settings-configurable weight
 * set for a narrower score would be more machinery than this gate's own scope asked
 * for. Same "available/score/note" per-factor breakdown shape as
 * projectHealthEngine.js's FACTOR_SCORERS, though, so the UI convention (a Factor /
 * Score / Why table) stays consistent between the two scores.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var WEIGHTS = { spi: 30, spiT: 30, scheduleVarianceDays: 20, criticalRatio: 20 };
  var FACTOR_LABELS = { spi: "SPI (Cost-Based)", spiT: "SPI(t) (Earned Schedule)", scheduleVarianceDays: "Earned Schedule Variance", criticalRatio: "Critical Path Ratio" };

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  // A performance ratio (SPI, SPI(t)) of 1.0 = fully healthy (100). Ratios at or above
  // 1.0 (on or ahead of plan) all score 100 — this is a health score, not a reward for
  // running arbitrarily far ahead. Below 0.7 scores 0; linear in between, the same
  // "pick one documented scale and say so" approach this app's other engines use for
  // similarly ambiguous industry conventions (see costEvmEngine.js's EAC formula
  // choice, scheduleCpmEngine.js's Free Float definition).
  function scoreFromRatio(ratio) {
    if (ratio == null) return null;
    if (ratio >= 1) return 100;
    return clamp(((ratio - 0.7) / 0.3) * 100, 0, 100);
  }

  // Earned Schedule variance in days: 0 or ahead-of-plan (positive ES-AT) scores 100;
  // behind scales down to 0 at half the project's planned duration behind.
  function scoreFromVarianceDays(days, plannedDurationDays) {
    if (days == null || !plannedDurationDays) return null;
    if (days >= 0) return 100;
    var pctBehind = -days / plannedDurationDays;
    return clamp(100 - pctBehind * 200, 0, 100);
  }

  // Critical-path ratio: 0% critical scores 100; 67%+ critical scores 0.
  function scoreFromCriticalRatio(criticalCount, totalCount) {
    if (!totalCount) return null;
    var ratio = criticalCount / totalCount;
    return clamp(100 - ratio * 150, 0, 100);
  }

  /** `ctx`: { spi, spiT, scheduleVarianceDays, plannedDurationDays, criticalCount,
   * totalActivityCount }. Every input is data Gate 21/25's own engines already
   * produce — nothing invented here. A factor with no underlying data is marked
   * `available: false` and excluded from the score (remaining weights re-normalize),
   * same convention projectHealthEngine.js uses. */
  function computeSchedulePerformanceScore(ctx) {
    var factors = {
      spi: {
        available: ctx.spi != null,
        score: scoreFromRatio(ctx.spi),
        weight: WEIGHTS.spi,
        note: ctx.spi != null ? "SPI " + ctx.spi.toFixed(2) + " (EV/PV)." : "No linked, dated budget items with actuals yet.",
      },
      spiT: {
        available: ctx.spiT != null,
        score: scoreFromRatio(ctx.spiT),
        weight: WEIGHTS.spiT,
        note: ctx.spiT != null ? "SPI(t) " + ctx.spiT.toFixed(2) + " (Earned Schedule)." : "Not enough linked, dated budget items to compute Earned Schedule.",
      },
      scheduleVarianceDays: {
        available: ctx.scheduleVarianceDays != null,
        score: scoreFromVarianceDays(ctx.scheduleVarianceDays, ctx.plannedDurationDays),
        weight: WEIGHTS.scheduleVarianceDays,
        note:
          ctx.scheduleVarianceDays == null
            ? "No Earned Schedule variance available."
            : ctx.scheduleVarianceDays < 0
            ? Math.abs(ctx.scheduleVarianceDays) + " day(s) behind the Earned Schedule plan."
            : "On or ahead of the Earned Schedule plan.",
      },
      criticalRatio: {
        available: ctx.totalActivityCount > 0,
        score: scoreFromCriticalRatio(ctx.criticalCount, ctx.totalActivityCount),
        weight: WEIGHTS.criticalRatio,
        note: ctx.totalActivityCount > 0 ? ctx.criticalCount + " of " + ctx.totalActivityCount + " activities critical." : "No activities in the active schedule yet.",
      },
    };

    var totalWeight = 0;
    var weightedSum = 0;
    Object.keys(factors).forEach(function (key) {
      var f = factors[key];
      f.label = FACTOR_LABELS[key];
      if (f.available && f.score != null) {
        totalWeight += f.weight;
        weightedSum += f.score * f.weight;
      }
    });

    var score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
    var rag = score == null ? null : score >= 70 ? "on_track" : score >= 40 ? "at_risk" : "critical";

    return { score: score, rag: rag, factors: factors };
  }

  window.PCC.schedulePerformanceEngine = { computeSchedulePerformanceScore: computeSchedulePerformanceScore };
})();
