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
import type { PCCStoreData, PCCActivity, PCCDelayRecord } from "../types/pcc";

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

export function buildScheduleSummaryPrompt(data: PCCStoreData, scheduleId: string): string {
  var schedule = data.schedules.find(function (s) {
    return s.id === scheduleId;
  });
  var project = schedule ? data.projects.find(function (p) { return p.id === schedule!.project_id; }) : undefined;
  var activities: PCCActivity[] = data.activities.filter(function (a) {
    return a.schedule_id === scheduleId;
  });

  var total = activities.length;
  var completed = activities.filter(function (a) {
    return a.status === "completed" || (a.percent_complete || 0) >= 100;
  }).length;
  var criticalActivities = activities.filter(function (a) {
    return window.PCC.delayImpactEngine.classifyCriticality(a.total_float, schedule ? schedule.near_critical_threshold_days : null) === "critical";
  });
  var nearCriticalCount = activities.filter(function (a) {
    return window.PCC.delayImpactEngine.classifyCriticality(a.total_float, schedule ? schedule.near_critical_threshold_days : null) === "near_critical";
  }).length;

  var finishDates = activities
    .map(function (a) {
      return a.actual_finish || a.early_finish || a.planned_finish || "";
    })
    .filter(Boolean)
    .sort();
  var projectedFinish = finishDates.length ? finishDates[finishDates.length - 1] : null;

  var delayRecords: PCCDelayRecord[] = (data.delay_records || []).filter(function (d) {
    var activityIds = activities.map(function (a) { return a.id; });
    return d.project_id === (schedule ? schedule.project_id : "") && (!d.activity_id || activityIds.indexOf(d.activity_id) !== -1);
  });
  var openDelays = delayRecords.filter(function (d) {
    return d.status === "open" || d.status === "monitoring";
  });
  var totalOpenDelayDays = openDelays.reduce(function (sum, d) {
    return sum + (d.delay_days || 0);
  }, 0);

  var criticalNames = criticalActivities.slice(0, 15).map(function (a) {
    return "- " + (a.name || a.id) + " (total float " + (a.total_float != null ? a.total_float : "unknown") + " days, finish " + formatDate(a.early_finish || a.planned_finish) + ")";
  });

  var lines: string[] = [];
  lines.push("You are helping a project controls planner understand the current state of a construction schedule. Write a concise, plain-language summary (a few short paragraphs, no headers) covering overall progress, schedule risk, and anything that needs attention. Use only the facts given below -- do not invent activities, dates, or causes that are not listed.");
  lines.push("");
  lines.push("Project: " + (project ? project.name || "(unnamed project)" : "(unknown project)"));
  lines.push("Schedule: " + (schedule ? schedule.name || schedule.id : scheduleId));
  lines.push("Total activities: " + total + " (" + completed + " completed)");
  lines.push("Critical activities (total float <= 0): " + criticalActivities.length);
  lines.push("Near-critical activities: " + nearCriticalCount);
  lines.push("Projected finish (latest known activity finish date): " + (projectedFinish ? formatDate(projectedFinish) : "not yet calculated"));
  lines.push("Open delay records: " + openDelays.length + " (" + totalOpenDelayDays + " total delay days)");
  if (criticalNames.length) {
    lines.push("");
    lines.push("Critical path activities (worst float first is not guaranteed, this is just the current list):");
    lines.push.apply(lines, criticalNames);
    if (criticalActivities.length > criticalNames.length) {
      lines.push("- ...and " + (criticalActivities.length - criticalNames.length) + " more");
    }
  }
  return lines.join("\n");
}
