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
import type { PCCStoreData, PCCActivity, PCCDelayRecord, PCCRecoveryAction, PCCDocument, PCCDocumentExtraction, PCCProject } from "../types/pcc";

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

/** Builds just the schedule FACTS block (no instructions) from data this app has already
 * calculated — never a second calculation engine, matching delayImpactEngine.js's own
 * "read-only layer over persisted output" rule (see this file's header comment). Every
 * number below comes from either a stored field (total_float, early_finish,
 * baseline_project_finish, ...) or one sanctioned, single-schedule read-only engine call
 * (delayImpactEngine.computeProjectFinishImpact — explicitly safe to call once per
 * schedule per that function's own header comment, unlike a portfolio-wide loop).
 * Shared by buildScheduleSummaryPrompt() (its own instructions + this block) and
 * buildProjectReportPrompt() (the {{SCHEDULE_FACTS}} slot) — one fact-gathering
 * implementation, not two. */
export function buildScheduleFactsBlock(data: PCCStoreData, scheduleId: string): string {
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

// Reviewed via /prompt-master against its own Ollama/Llama routing guidance (2026-09-11):
// the original version packed role+task+grounding-constraint into one dense run-on sentence
// before the numbered list, which buries the "never invent facts" rule for a weaker
// open-weight model instead of isolating it. Restructured into a standalone RULES block
// (strong signal words: NEVER, not "avoid") + a flat per-section instruction list, plus an
// explicit no-preamble instruction and a fixed fallback string for empty sections -- local
// models commonly prepend a chatty "Sure, here's the analysis:" greeting and phrase "no
// data" differently every run without being told not to.
var SCHEDULE_SUMMARY_INSTRUCTIONS =
  "You are a senior project controls analyst. Analyze the schedule data below and write a structured report for a project manager.\n\n" +
  "RULES (follow exactly):\n" +
  "- Use ONLY the facts given below. NEVER invent activities, dates, causes, or numbers.\n" +
  '- If a section has no supporting data, write "No data available for this section" instead of guessing.\n' +
  '- Do not add any introduction, greeting, or closing remarks. Start directly with "1. Overview".\n\n' +
  "Write exactly 5 sections, in this order, each starting with its number and heading:\n\n" +
  "1. Overview\n" +
  "Summarize overall progress and schedule health in 2-3 sentences.\n\n" +
  "2. Critical Path & Schedule Risk\n" +
  "Name which activities or disciplines are driving risk. State how tight the float is.\n\n" +
  "3. Delay Analysis\n" +
  "State the root causes of delays and who is responsible, using only the categories and descriptions given.\n\n" +
  "4. Recovery Status\n" +
  "State what recovery effort exists, if any, and whether it looks sufficient based on the numbers given.\n\n" +
  "5. Recommendations\n" +
  "List 2-4 concrete, specific actions a planner could take this week.";

/** The Schedule Summary (AI) pilot's own full prompt -- instructions + buildScheduleFactsBlock()'s
 * facts. Kept as its own exported entry point (same name callers already use) even though the
 * facts-gathering itself now lives in the shared helper above. */
export function buildScheduleSummaryPrompt(data: PCCStoreData, scheduleId: string): string {
  return SCHEDULE_SUMMARY_INSTRUCTIONS + "\n\n" + buildScheduleFactsBlock(data, scheduleId);
}

// Local models have a limited context window -- keep injected extracted content to a few
// thousand words per the prompt's own setup note, and say so explicitly when truncating
// rather than silently cutting content the model has no way of knowing is missing.
var REVIEW_TEXT_CHAR_CAP = 12000;

function documentTypeLabel(doc: PCCDocument, data: PCCStoreData): string {
  var linkedType = doc.document_type_id ? data.document_types.find(function (t) { return t.id === doc.document_type_id; }) : null;
  return (linkedType && linkedType.name) || doc.category || "document";
}

/** Builds the Document Review (AI) prompt for a text-extracted document (PDF/Word) --
 * see buildSpreadsheetReviewPrompt() for the separate Excel path, since
 * extractDocx()/extractPdf() and extractExcel() (documentsService.ts) produce genuinely
 * different shapes (text+char_count vs. headers+rows), not just a styling difference. */
export function buildDocumentReviewPrompt(doc: PCCDocument, data: PCCStoreData): string {
  var extraction = doc.extraction as PCCDocumentExtraction;
  var project = data.projects.find(function (p) { return p.id === doc.project_id; });
  var fullText: string = (extraction && typeof extraction.text === "string" ? extraction.text : "") || "";
  var truncated = fullText.length > REVIEW_TEXT_CHAR_CAP;
  var text = truncated ? fullText.slice(0, REVIEW_TEXT_CHAR_CAP) : fullText;

  return [
    "You are a senior document control specialist reviewing an uploaded project document. Produce a structured review using ONLY the metadata and extracted text given below -- never invent content, dates, names, or numbers not present in the text. If the extracted text is too short or garbled to assess something, say so plainly instead of guessing. Write these sections, each with a short heading:",
    "1. Summary -- what this document actually contains, in plain language (2-4 sentences).",
    "2. Completeness Check -- for a " + documentTypeLabel(doc, data) + " document, note anything that looks missing, incomplete, or inconsistent (e.g. missing dates, signatures, section headers, or references the text itself implies should be present).",
    "3. Items Needing Attention -- open items, unusual values, contradictions, or anything a reviewer should double-check before relying on this document.",
    "4. Recommendation -- one sentence: is this document ready to file as-is, or does it need follow-up (and with whom, if the text names a party)?",
    "",
    "Document: " + (doc.filename || "(unnamed file)") + " (" + documentTypeLabel(doc, data) + ", revision " + (doc.revision_number != null ? doc.revision_number : "unknown") + ", uploaded " + formatDate(doc.uploaded_at) + ", project " + (project ? project.name || "(unnamed project)" : "(unknown project)") + ")",
    "",
    "Extracted text" + (truncated ? " (truncated to the first " + REVIEW_TEXT_CHAR_CAP + " characters of " + fullText.length + " total)" : "") + ":",
    text || "(no text could be extracted from this file)",
  ].join("\n");
}

/** Builds the Excel/Spreadsheet Review (AI) prompt -- see buildDocumentReviewPrompt()'s own
 * comment for why this is a separate function rather than one branching path: Excel
 * extraction (documentsService.ts's extractExcel()) produces headers+rows, never a text
 * blob, so there is no shared "extracted text" to reuse here. */
export function buildSpreadsheetReviewPrompt(doc: PCCDocument, data: PCCStoreData): string {
  var extraction = doc.extraction as PCCDocumentExtraction;
  var project = data.projects.find(function (p) { return p.id === doc.project_id; });
  var headers: string[] = (extraction && extraction.headers) || [];
  var rows: string[][] = (extraction && extraction.rows) || [];
  var rowLines = rows.map(function (row) {
    return row.join(" | ");
  });
  var rowsText = (headers.length ? headers.join(" | ") + "\n" + rowLines.join("\n") : rowLines.join("\n")) || "(no rows could be extracted from this file)";
  var truncated = !!(extraction && extraction.truncated);

  return [
    "You are a senior cost/schedule analyst reviewing an uploaded spreadsheet. Produce a structured review using ONLY the row data given below -- never invent rows, totals, or values not present in the data. If you cannot verify a total or calculation from the rows given, say so rather than guessing. Write these sections, each with a short heading:",
    "1. Summary -- what this spreadsheet contains and its overall scale (row count, apparent categories), in plain language.",
    "2. Totals Check -- do any given subtotals/totals look consistent with the row-level figures? Flag any that don't add up, based only on the numbers given.",
    "3. Outliers & Anomalies -- any values that look unusually high/low/blank/duplicated relative to the rest of the data.",
    "4. Possible Errors -- anything that looks like a formula error, mismatched unit, or inconsistent entry (e.g. a date in a cost column), grounded only in what's visible in the data.",
    "5. Recommendation -- 1-3 specific rows or values worth a human double-checking before this data is relied on.",
    "",
    "Spreadsheet: " + (doc.filename || "(unnamed file)") + " (" + documentTypeLabel(doc, data) + ", project " + (project ? project.name || "(unnamed project)" : "(unknown project)") + ")",
    "Row count: " + rows.length + (truncated ? " (truncated -- more rows exist in the original file)" : ""),
    "",
    "Extracted rows:",
    rowsText,
  ].join("\n");
}

/** Picks the project's most relevant schedule for the report's {{SCHEDULE_FACTS}} slot --
 * prefers the one explicitly typed "current" (see Schedule.tsx's SCHEDULE_TYPE_LABELS),
 * otherwise the most recently updated one. A project with no schedule at all is a normal,
 * valid state (e.g. very early setup) -- handled below, not an error. */
function currentScheduleFor(data: PCCStoreData, projectId: string) {
  var schedules = data.schedules.filter(function (s) { return s.project_id === projectId; });
  if (!schedules.length) return undefined;
  var current = schedules.find(function (s) { return s.schedule_type === "current"; });
  if (current) return current;
  return schedules.slice().sort(function (a, b) {
    return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
  })[0];
}

/** Builds the Project Report (AI) prompt -- the "extensive report" capability, aggregating
 * facts across several already-existing modules for ONE project. Every block is either a
 * stored field or a sanctioned read-only engine call (window.PCC.cost.projectCostSummary,
 * the same shared buildScheduleFactsBlock() the Schedule Summary pilot uses) -- never a
 * second calculation. An empty section renders as "No significant items to report" per the
 * prompt's own instructions, rather than the model padding with invented content. */
export function buildProjectReportPrompt(project: PCCProject, data: PCCStoreData): string {
  var instructions =
    "You are a senior project manager preparing a status report for a client or executive sponsor. " +
    "Write a polished, professional narrative report using ONLY the facts given below -- never invent " +
    "project details, figures, or events not present in the data. If a section has no supporting data, " +
    'write "No significant items to report" rather than guessing or padding. Use this structure, each ' +
    "section with a clear heading:\n" +
    "1. Executive Summary -- 2-3 sentences: overall project status, in language a non-technical stakeholder understands.\n" +
    "2. Schedule Status -- current progress, forecast finish, and any critical risks, grounded in the schedule facts given.\n" +
    "3. Cost & Budget -- spend to date vs budget, and any notable variances, grounded in the cost facts given.\n" +
    "4. Risks & Issues -- the most significant open risks/issues, why they matter, and what's being done.\n" +
    "5. Open Information Requests (RFIs) -- anything currently blocking progress on a decision or clarification.\n" +
    "6. Recent Activity -- notable recent site/meeting activity worth the reader knowing about.\n" +
    "7. Outlook & Next Steps -- 2-4 concrete actions or decisions needed from the reader or the team in the near term.";

  var portfolioFacts = [
    "Status: " + (project.status || "unknown"),
    "Progress: " + (project.progress != null ? project.progress + "%" : "unknown"),
    "Start date: " + formatDate(project.start_date),
    "Planned finish: " + formatDate(project.finish_date),
    "Client: " + (project.client || "(none)"),
    "Company: " + (project.company || "(none)"),
    "Project manager: " + (project.project_manager || "(unassigned)"),
  ].join("\n");

  var schedule = currentScheduleFor(data, project.id);
  var scheduleFacts = schedule ? buildScheduleFactsBlock(data, schedule.id) : "No schedule has been set up for this project yet.";

  var costSummary = window.PCC.cost!.projectCostSummary(data, project.id);
  var costFacts = [
    "Budgeted: " + costSummary.budgeted.toLocaleString(),
    "Actual: " + costSummary.actual.toLocaleString(),
    "Variance: " + costSummary.variance.toLocaleString() + (costSummary.variance < 0 ? " (over budget)" : " (under/on budget)"),
  ].join("\n");

  var openRisks = data.risks.filter(function (r) { return r.project_id === project.id && r.status !== "closed"; });
  var riskFacts = openRisks.length
    ? openRisks.slice(0, 15).map(function (r) {
        return "- [" + (r.type || "risk") + ", " + (r.probability || "?") + "/" + (r.impact || "?") + " prob/impact, " + (r.status || "?") + "] " + (r.title || "(untitled)") + (r.owner ? " (owner: " + r.owner + ")" : "");
      }).join("\n")
    : "No open risks or issues.";

  var openRfis = data.rfis.filter(function (r) { return r.project_id === project.id && r.status === "open"; });
  var rfiFacts = openRfis.length
    ? openRfis.slice(0, 15).map(function (r) {
        return "- " + (r.number || r.id) + ": " + (r.subject || "(no subject)") + (r.date_required ? ", due " + formatDate(r.date_required) : "") + (r.waiting_on_party ? ", waiting on " + r.waiting_on_party : "");
      }).join("\n")
    : "No open RFIs.";

  var recentLogs = data.daily_logs
    .filter(function (d) { return d.project_id === project.id; })
    .slice()
    .sort(function (a, b) { return new Date(b.log_date || 0).getTime() - new Date(a.log_date || 0).getTime(); })
    .slice(0, 5);
  var recentMeetings = data.meetings
    .filter(function (m) { return m.project_id === project.id; })
    .slice()
    .sort(function (a, b) { return new Date(b.meeting_date || 0).getTime() - new Date(a.meeting_date || 0).getTime(); })
    .slice(0, 5);
  var recentActivityLines: string[] = [];
  recentLogs.forEach(function (d) {
    if (d.notes || d.activities) recentActivityLines.push("- [Daily Log, " + formatDate(d.log_date) + "] " + (d.activities || d.notes));
  });
  recentMeetings.forEach(function (m) {
    recentActivityLines.push("- [Meeting, " + formatDate(m.meeting_date) + "] " + (m.title || "(untitled)"));
  });
  var recentActivity = recentActivityLines.length ? recentActivityLines.join("\n") : "No recent daily log or meeting activity recorded.";

  return [
    instructions,
    "",
    "Report date: " + formatDate(new Date().toISOString()),
    "Project: " + (project.name || "(unnamed project)"),
    "",
    "Portfolio facts:",
    portfolioFacts,
    "",
    "Schedule facts:",
    scheduleFacts,
    "",
    "Cost facts:",
    costFacts,
    "",
    "Risk/issue facts:",
    riskFacts,
    "",
    "RFI facts:",
    rfiFacts,
    "",
    "Recent activity (daily log / meetings):",
    recentActivity,
  ].join("\n");
}
