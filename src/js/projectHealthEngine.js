/* Project Health engine (Gate 9 — Project Executive Center) — calculation only, no DOM,
 * no store writes. Same separation every other engine in this app keeps
 * (scheduleCpmEngine.js, scheduleBaselineEngine.js, scheduleGanttLayout.js,
 * costEvmEngine.js): executiveCenter.js gathers real numbers from the store into a plain
 * `context` object, this module turns that into a score/RAG/breakdown and a list of
 * rule-based alerts, and executiveCenter.js is the only place that renders either.
 *
 * SCOPE, DELIBERATELY:
 * - Every input is data that already exists somewhere else in PCC (Schedule/CPM, Cost
 *   Tracking, EVM, Risk Register, RFI/TQ, Change Management, Meetings). Nothing here
 *   invents a number — a factor with no underlying data is marked `available: false`
 *   and excluded from the score (weights re-normalize over just the available factors),
 *   never silently treated as 0 (which would read as "critical" for a project that
 *   simply hasn't set a budget yet, say).
 * - Rule-based only — no AI, no scoring model that isn't a plain documented formula a
 *   user could recompute by hand. The point of `breakdown` is that the "why" is never
 *   hidden: every factor's raw inputs, sub-score, weight, and contribution are returned,
 *   not just the final number.
 * - Weights are supplied by the caller (from `data.settings.health_score_weights`), not
 *   hardcoded here, so Settings can expose them as configurable per the spec. This
 *   module defensively re-normalizes whatever weights it's given (missing/zero/not
 *   summing to 100) rather than assuming the stored config is well-formed.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var DEFAULT_WEIGHTS = { schedule: 25, cost: 20, risk: 20, issue: 10, rfi: 15, change: 10 };
  var FACTOR_LABELS = {
    schedule: "Schedule",
    cost: "Cost",
    risk: "Risk",
    issue: "Issues",
    rfi: "RFI / TQ",
    change: "Change Orders",
  };

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  /** Each factor scorer returns { available, score (0-100, 100 = healthiest), note }. */
  var FACTOR_SCORERS = {
    schedule: function (ctx) {
      if (!ctx.totalActivityCount || ctx.totalActivityCount === 0) {
        return { available: false, score: null, note: "No activities in the active schedule yet." };
      }
      var criticalRatio = ctx.criticalCount / ctx.totalActivityCount;
      var nearCriticalRatio = ctx.nearCriticalCount / ctx.totalActivityCount;
      var variancePenalty = 0;
      var varianceNote = "";
      if (ctx.forecastVarianceDays != null && ctx.plannedDurationDays) {
        var variancePct = ctx.forecastVarianceDays / ctx.plannedDurationDays;
        variancePenalty = clamp(variancePct * 100, 0, 50);
        varianceNote =
          ctx.forecastVarianceDays > 0
            ? " Forecast finish is " + ctx.forecastVarianceDays + " day(s) behind plan."
            : ctx.forecastVarianceDays < 0
            ? " Forecast finish is " + Math.abs(ctx.forecastVarianceDays) + " day(s) ahead of plan."
            : " Forecast finish is on plan.";
      }
      var score = clamp(100 - criticalRatio * 50 - nearCriticalRatio * 20 - variancePenalty, 0, 100);
      return {
        available: true,
        score: score,
        note:
          ctx.criticalCount + " of " + ctx.totalActivityCount + " activities critical, " +
          ctx.nearCriticalCount + " near-critical." + varianceNote,
      };
    },
    cost: function (ctx) {
      if (!ctx.budgetTotal || ctx.budgetTotal <= 0) {
        return { available: false, score: null, note: "No budget recorded yet." };
      }
      var variancePct = (ctx.actualTotal - ctx.budgetTotal) / ctx.budgetTotal;
      var score = clamp(100 - variancePct * 100, 0, 100);
      return {
        available: true,
        score: score,
        note:
          variancePct > 0
            ? "Actual cost is " + (variancePct * 100).toFixed(1) + "% over budget."
            : "Actual cost is within budget (" + Math.abs(variancePct * 100).toFixed(1) + "% under).",
      };
    },
    risk: function (ctx) {
      var score = clamp(100 - (ctx.highRiskCount || 0) * 15, 0, 100);
      return {
        available: true,
        score: score,
        note: (ctx.highRiskCount || 0) + " open high-severity risk(s) of " + (ctx.openRiskCount || 0) + " open total.",
      };
    },
    issue: function (ctx) {
      var score = clamp(100 - (ctx.criticalIssueCount || 0) * 20, 0, 100);
      return {
        available: true,
        score: score,
        note: (ctx.criticalIssueCount || 0) + " open critical (high-severity) issue(s) of " + (ctx.openIssueCount || 0) + " open total.",
      };
    },
    rfi: function (ctx) {
      var score = clamp(100 - (ctx.overdueRfiCount || 0) * 15, 0, 100);
      return {
        available: true,
        score: score,
        note: (ctx.overdueRfiCount || 0) + " overdue RFI/TQ of " + (ctx.openRfiCount || 0) + " open total.",
      };
    },
    change: function (ctx) {
      var score = clamp(100 - (ctx.pendingChangeOrderCount || 0) * 10, 0, 100);
      return {
        available: true,
        score: score,
        note: (ctx.pendingChangeOrderCount || 0) + " Change Order(s) pending decision.",
      };
    },
  };

  function normalizeWeights(weights) {
    var w = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
    var total = 0;
    Object.keys(DEFAULT_WEIGHTS).forEach(function (k) {
      w[k] = Number(w[k]) || 0;
      total += w[k];
    });
    if (total <= 0) return Object.assign({}, DEFAULT_WEIGHTS);
    return w;
  }

  function ragFromScore(score) {
    if (score == null) return "unknown";
    if (score >= 80) return "on_track";
    if (score >= 60) return "at_risk";
    return "critical";
  }

  /** @param context  see FACTOR_SCORERS above for every field a caller may supply.
   *  @param weights  { schedule, cost, risk, issue, rfi, change } — need not sum to 100;
   *                  re-normalized here. Missing keys fall back to DEFAULT_WEIGHTS.
   *  @returns { score (0-100 or null), rag, breakdown: [{ key, label, available, score,
   *             weight, weightPct, contribution, note }] } */
  function computeHealthScore(context, weights) {
    var ctx = context || {};
    var w = normalizeWeights(weights);
    var totalWeight = Object.keys(w).reduce(function (s, k) { return s + w[k]; }, 0);

    var breakdown = Object.keys(FACTOR_SCORERS).map(function (key) {
      var result = FACTOR_SCORERS[key](ctx);
      return {
        key: key,
        label: FACTOR_LABELS[key],
        available: result.available,
        score: result.score,
        weight: w[key],
        note: result.note,
      };
    });

    var availableWeightTotal = breakdown
      .filter(function (f) { return f.available; })
      .reduce(function (s, f) { return s + f.weight; }, 0);

    if (availableWeightTotal <= 0) {
      breakdown.forEach(function (f) { f.weightPct = 0; f.contribution = 0; });
      return { score: null, rag: "unknown", breakdown: breakdown };
    }

    var weightedSum = 0;
    breakdown.forEach(function (f) {
      if (!f.available) {
        f.weightPct = 0;
        f.contribution = 0;
        return;
      }
      f.weightPct = (f.weight / availableWeightTotal) * 100;
      f.contribution = (f.score * f.weightPct) / 100;
      weightedSum += f.contribution;
    });

    var score = Math.round(clamp(weightedSum, 0, 100));
    return { score: score, rag: ragFromScore(score), breakdown: breakdown, totalConfiguredWeight: totalWeight };
  }

  var SEVERITY = { CRITICAL: "critical", WARNING: "warning", INFO: "info" };

  /** Rule-based diagnostics — every alert traces to a real record the caller passed in
   * `context`; nothing here is inferred or predicted. `context` fields used (all
   * optional — an absent array/number just means that rule produces no alerts):
   *   spi, cpi (EVM, null if not computable), spiThreshold, cpiThreshold (default 0.9)
   *   criticalActivities: [{id, name}], nearCriticalActivities: [{id, name}]
   *   slippedMilestones: [{id, name, varianceDays}]
   *   highRisks: [{id, title}]
   *   overdueRfis: [{id, number, subject, daysOverdue}]
   *   overdueMeetingActions: [{meetingId, meetingTitle, description, dueDate}]
   *   pendingChangeOrders: [{id, number, title}]
   *   budgetTotal, actualTotal, bac, eac (numbers or null)
   * @returns [{ id, severity, source, description, date, link }] */
  function computeDiagnostics(context) {
    var ctx = context || {};
    var today = new Date().toISOString().slice(0, 10);
    var alerts = [];
    var spiThreshold = ctx.spiThreshold != null ? ctx.spiThreshold : 0.9;
    var cpiThreshold = ctx.cpiThreshold != null ? ctx.cpiThreshold : 0.9;

    if (ctx.spi != null && ctx.spi < spiThreshold) {
      alerts.push({
        id: "spi",
        severity: SEVERITY.CRITICAL,
        source: "EVM",
        description: "Schedule Performance Index (SPI) is " + ctx.spi.toFixed(2) + ", below the " + spiThreshold.toFixed(2) + " threshold — behind schedule on earned value.",
        date: today,
        link: { module: "cost", tab: "evm" },
      });
    }
    if (ctx.cpi != null && ctx.cpi < cpiThreshold) {
      alerts.push({
        id: "cpi",
        severity: SEVERITY.CRITICAL,
        source: "EVM",
        description: "Cost Performance Index (CPI) is " + ctx.cpi.toFixed(2) + ", below the " + cpiThreshold.toFixed(2) + " threshold — overrunning cost against earned value.",
        date: today,
        link: { module: "cost", tab: "evm" },
      });
    }
    if (ctx.bac != null && ctx.eac != null && ctx.eac > ctx.bac) {
      alerts.push({
        id: "eac_over_bac",
        severity: SEVERITY.WARNING,
        source: "EVM",
        description: "Estimate at Completion (EAC) exceeds Budget at Completion (BAC) — forecast to finish over budget.",
        date: today,
        link: { module: "cost", tab: "evm" },
      });
    }
    if (ctx.budgetTotal != null && ctx.actualTotal != null && ctx.budgetTotal > 0 && ctx.actualTotal > ctx.budgetTotal) {
      alerts.push({
        id: "cost_over_budget",
        severity: SEVERITY.WARNING,
        source: "Cost",
        description: "Actual cost has exceeded the recorded budget.",
        date: today,
        link: { module: "cost", tab: "summary" },
      });
    }
    if ((ctx.criticalActivities || []).length > 0) {
      alerts.push({
        id: "negative_float",
        severity: SEVERITY.CRITICAL,
        source: "Schedule",
        description: ctx.criticalActivities.length + " activity(ies) on the critical path (zero or negative float).",
        date: today,
        link: { module: "schedule", tab: "gantt" },
      });
    }
    if ((ctx.nearCriticalActivities || []).length > 0) {
      alerts.push({
        id: "near_critical",
        severity: SEVERITY.INFO,
        source: "Schedule",
        description: ctx.nearCriticalActivities.length + " activity(ies) near-critical — little float remaining.",
        date: today,
        link: { module: "schedule", tab: "gantt" },
      });
    }
    (ctx.slippedMilestones || []).forEach(function (m) {
      alerts.push({
        id: "milestone_slip_" + m.id,
        severity: SEVERITY.WARNING,
        source: "Schedule",
        description: "Milestone “" + m.name + "” has slipped " + m.varianceDays + " day(s) from plan.",
        date: today,
        link: { module: "schedule", tab: "gantt", recordId: m.id },
      });
    });
    (ctx.highRisks || []).forEach(function (r) {
      alerts.push({
        id: "risk_" + r.id,
        severity: SEVERITY.WARNING,
        source: "Risk",
        description: "High-severity risk open: “" + r.title + "”.",
        date: today,
        link: { module: "risks", recordId: r.id },
      });
    });
    (ctx.overdueRfis || []).forEach(function (r) {
      alerts.push({
        id: "rfi_" + r.id,
        severity: SEVERITY.WARNING,
        source: "RFI",
        description: r.number + " “" + r.subject + "” is overdue by " + r.daysOverdue + " day(s).",
        date: today,
        link: { module: "rfis", recordId: r.id },
      });
    });
    (ctx.overdueMeetingActions || []).forEach(function (a) {
      alerts.push({
        id: "action_" + a.meetingId + "_" + (a.description || "").slice(0, 10),
        severity: SEVERITY.WARNING,
        source: "Meetings",
        description: "Overdue action from “" + a.meetingTitle + "”: " + a.description + " (due " + a.dueDate + ").",
        date: today,
        link: { module: "meetings", recordId: a.meetingId },
      });
    });
    (ctx.pendingChangeOrders || []).forEach(function (co) {
      alerts.push({
        id: "co_" + co.id,
        severity: SEVERITY.INFO,
        source: "Change",
        description: co.number + " “" + co.title + "” is pending a decision.",
        date: today,
        link: { module: "changeOrders", recordId: co.id },
      });
    });

    var severityRank = { critical: 0, warning: 1, info: 2 };
    alerts.sort(function (a, b) { return severityRank[a.severity] - severityRank[b.severity]; });
    return alerts;
  }

  window.PCC.projectHealthEngine = {
    computeHealthScore: computeHealthScore,
    computeDiagnostics: computeDiagnostics,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
  };
})();
