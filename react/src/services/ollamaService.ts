/* Ollama AI integration — service boundary for the React layer (master prompt §9: React
 * must not own core calculations). The actual HTTP call lives in
 * packaging/electron/ollamaClient.js (Electron main process, IPC-only — see its header
 * comment for why); src/js/ollamaService.js gates and forwards to it. This file is a thin
 * wrapper over that, plus the one pure, fully-testable piece that belongs here: building
 * the actual prompt text for the pilot capability (Schedule summarization) from data this
 * app has already calculated.
 *
 * buildScheduleSummaryPrompt() reads total_float/early_finish/etc. straight off
 * data.activities and classifies criticality via the real, shared
 * window.PCC.delayImpactEngine.classifyCriticality() — the exact fields
 * scheduleCpmEngine.js's calculateSchedule() already wrote there the last time "Calculate
 * Schedule" ran. It NEVER re-invokes the CPM engine and never invents its own criticality
 * rule — same "read-only layer over persisted output" convention delayImpactEngine.js
 * itself follows (see that file's own header comment).
 */
import type { PCCStoreData, PCCActivity, PCCDelayRecord, PCCRecoveryAction } from "../types/pcc";

export function isOllamaAvailable(): boolean {
  return window.PCC.ollama.isAvailable();
}

export function getOllamaSettings(): { enabled: boolean; host: string; model: string } {
  return window.PCC.ollama.settings();
}

export function listOllamaModels(): Promise<string[]> {
  return window.PCC.ollama.listModels();
}

export function askOllama(prompt: string): Promise<string> {
  return window.PCC.ollama.ask(prompt);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  return String(iso).slice(0, 10);
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Array<[string, number]> {
  var counts: { [key: string]: number } = {};
  items.forEach(function (item) {
    var key = keyFn(item) || "(unspecified)";
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.keys(counts)
    .map(function (k): [string, number] {
      return [k, counts[k]];
    })
    .sort(function (a, b) {
      return b[1] - a[1];
    });
}

/** Builds the Schedule Summary (AI) prompt from data this app has already calculated —
 * never a second calculation engine, matching delayImpactEngine.js's own "read-only layer
 * over persisted output" rule (see this file's header comment). Every number below comes
 * from either a stored field (total_float, early_finish, baseline_project_finish, ...) or
 * one sanctioned, single-schedule read-only engine call
 * (delayImpactEngine.computeProjectFinishImpact — explicitly safe to call once per
 * schedule per that function's own header comment, unlike a portfolio-wide loop). */
export function buildScheduleSummaryPrompt(data: PCCStoreData, scheduleId: string): string {
  var schedule = data.schedules.find(function (s) {
    return s.id === scheduleId;
  });
  var project = schedule ? data.projects.find(function (p) { return p.id === schedule!.project_id; }) : undefined;
  var activities: PCCActivity[] = data.activities.filter(function (a) {
    return a.schedule_id === scheduleId;
  });
  var activityIds = activities.map(function (a) { return a.id; });

  var total = activities.length;
  var completed = activities.filter(function (a) {
    return a.status === "completed" || (a.percent_complete || 0) >= 100;
  }).length;
  var avgPercentComplete = total
    ? Math.round(activities.reduce(function (sum, a) { return sum + (a.percent_complete || 0); }, 0) / total)
    : 0;
  var criticalActivities = activities.filter(function (a) {
    return window.PCC.delayImpactEngine.classifyCriticality(a.total_float, schedule ? schedule.near_critical_threshold_days : null) === "critical";
  });
  var nearCriticalActivities = activities.filter(function (a) {
    return window.PCC.delayImpactEngine.classifyCriticality(a.total_float, schedule ? schedule.near_critical_threshold_days : null) === "near_critical";
  });

  // Real forecast-finish math via the CPM engine's own read-only, single-schedule call --
  // never the naive "latest activity finish date" proxy this prompt used before.
  var finishImpact = window.PCC.delayImpactEngine.computeProjectFinishImpact(scheduleId, data);

  // Baseline slippage: the official baseline's own cached finish date vs the current
  // forecast above -- no IndexedDB snapshot load needed for this comparison, the row
  // already carries baseline_project_finish (set when the baseline was captured).
  var officialBaseline = (data.schedule_baselines || []).find(function (b) {
    return b.schedule_id === scheduleId && b.is_official;
  });

  var delayRecords: PCCDelayRecord[] = (data.delay_records || []).filter(function (d) {
    return d.project_id === (schedule ? schedule.project_id : "") && (!d.activity_id || activityIds.indexOf(d.activity_id) !== -1);
  });
  var openDelays = delayRecords.filter(function (d) {
    return d.status === "open" || d.status === "investigating" || d.status === "mitigation_in_progress" || d.status === "recovery_in_progress";
  });
  var totalOpenDelayDays = openDelays.reduce(function (sum, d) {
    return sum + (d.delay_days || 0);
  }, 0);
  var delayIds = delayRecords.map(function (d) { return d.id; });
  var recoveryActions: PCCRecoveryAction[] = (data.recovery_actions || []).filter(function (r) {
    return r.delay_id && delayIds.indexOf(r.delay_id) !== -1;
  });

  var criticalByDiscipline = countBy(criticalActivities, function (a) { return a.discipline || a.contractor || ""; });
  var delaysByCategory = countBy(openDelays, function (d) { return d.delay_category || ""; });
  var delaysByResponsible = countBy(openDelays, function (d) { return d.responsible_party || ""; });
  var recoveryByStatus = countBy(recoveryActions, function (r) { return r.status || ""; });

  var criticalLines = criticalActivities.slice(0, 15).map(function (a) {
    return "- " + (a.name || a.id) + " (total float " + (a.total_float != null ? a.total_float : "unknown") + " days, finish " + formatDate(a.early_finish || a.planned_finish) + (a.discipline ? ", " + a.discipline : "") + (a.contractor ? ", " + a.contractor : "") + ")";
  });
  var delayLines = openDelays.slice(0, 10).map(function (d) {
    var cause = d.immediate_cause || d.description || "(no description)";
    return "- [" + (d.delay_category || "uncategorized") + ", " + (d.delay_days != null ? d.delay_days + "d" : "days unknown") + ", " + (d.responsible_party || "responsible party unassigned") + "] " + cause;
  });

  var lines: string[] = [];
  lines.push(
    "You are a senior project controls analyst reviewing a construction schedule for a project manager. " +
    "Produce an in-depth, structured analysis using ONLY the facts given below -- never invent activities, " +
    "dates, causes, or numbers that are not listed. If a section has no supporting data, say so briefly " +
    "rather than guessing. Write these sections, each with a short heading:\n" +
    "1. Overview -- overall progress and schedule health in plain language.\n" +
    "2. Critical Path & Schedule Risk -- which activities/disciplines are driving risk, and how tight the float is.\n" +
    "3. Delay Analysis -- root causes and who's responsible, grounded in the categories/descriptions given.\n" +
    "4. Recovery Status -- what recovery effort exists (if any) and whether it looks sufficient given the numbers.\n" +
    "5. Recommendations -- 2-4 concrete, specific next actions a planner could actually take this week."
  );
  lines.push("");
  lines.push("=== PROJECT & SCHEDULE ===");
  lines.push("Project: " + (project ? project.name || "(unnamed project)" : "(unknown project)"));
  lines.push("Schedule: " + (schedule ? schedule.name || schedule.id : scheduleId));
  lines.push("Total activities: " + total + " (" + completed + " completed, " + avgPercentComplete + "% average physical progress)");
  lines.push("Critical activities (total float <= 0): " + criticalActivities.length);
  lines.push("Near-critical activities: " + nearCriticalActivities.length);

  lines.push("");
  lines.push("=== FORECAST FINISH ===");
  if (finishImpact.available) {
    lines.push("Current forecast finish: " + formatDate(finishImpact.project_finish));
    lines.push("Originally planned finish: " + formatDate(finishImpact.planned_project_finish));
    lines.push("Forecast variance vs plan: " + (finishImpact.project_impact_days != null ? finishImpact.project_impact_days + " days" : "unknown"));
  } else {
    lines.push("Not available: " + (finishImpact.reason || "schedule has not been calculated yet."));
  }
  if (officialBaseline && officialBaseline.baseline_project_finish) {
    lines.push("Official baseline finish (captured " + formatDate(officialBaseline.captured_at) + "): " + formatDate(officialBaseline.baseline_project_finish));
    if (finishImpact.available && finishImpact.project_finish) {
      var baselineDate = new Date(officialBaseline.baseline_project_finish).getTime();
      var currentDate = new Date(finishImpact.project_finish).getTime();
      if (!isNaN(baselineDate) && !isNaN(currentDate)) {
        var slippageDays = Math.round((currentDate - baselineDate) / 86400000);
        lines.push("Slippage vs official baseline: " + slippageDays + " days" + (slippageDays > 0 ? " (later than baseline)" : slippageDays < 0 ? " (ahead of baseline)" : " (on baseline)"));
      }
    }
  } else {
    lines.push("No official baseline is set for this schedule -- no slippage-vs-baseline figure available.");
  }

  if (criticalLines.length) {
    lines.push("");
    lines.push("=== CRITICAL PATH ACTIVITIES (not in strict float order; capped at 15 of " + criticalActivities.length + ") ===");
    lines.push.apply(lines, criticalLines);
  }
  if (criticalByDiscipline.length) {
    lines.push("");
    lines.push("Critical activities by discipline/contractor:");
    criticalByDiscipline.forEach(function (pair) {
      lines.push("- " + pair[0] + ": " + pair[1]);
    });
  }

  lines.push("");
  lines.push("=== DELAY RECORDS ===");
  lines.push("Open/in-progress delay records: " + openDelays.length + " (" + totalOpenDelayDays + " total estimated delay days)");
  if (delaysByCategory.length) {
    lines.push("By category: " + delaysByCategory.map(function (p) { return p[0] + " (" + p[1] + ")"; }).join(", "));
  }
  if (delaysByResponsible.length) {
    lines.push("By responsible party: " + delaysByResponsible.map(function (p) { return p[0] + " (" + p[1] + ")"; }).join(", "));
  }
  if (delayLines.length) {
    lines.push("Open delay details (capped at 10 of " + openDelays.length + "):");
    lines.push.apply(lines, delayLines);
  }

  lines.push("");
  lines.push("=== RECOVERY ACTIONS ===");
  if (recoveryActions.length) {
    lines.push("Total recovery actions tied to these delays: " + recoveryActions.length);
    lines.push("By status: " + recoveryByStatus.map(function (p) { return p[0] + " (" + p[1] + ")"; }).join(", "));
  } else {
    lines.push("No recovery actions are recorded against any of this schedule's delay records.");
  }

  return lines.join("\n");
}
