/* Service boundary for the Reports page (master prompt §9). Thin wrapper over the
 * existing store globals, unchanged from the vanilla page.
 *
 * buildProjectReport()/buildPortfolioReport() are kept as plain DOM-building functions
 * (verbatim from the vanilla page, not translated to JSX) — the assembled report is a
 * read-only, printable document with no interactive elements of its own, so there is no
 * functional benefit to a JSX rewrite, only transcription risk for ~500 lines of table-
 * building logic. ReportViewer in Reports.jsx embeds the returned DOM node via a
 * ref + useEffect that reruns whenever the inputs actually change (see that file's own
 * comment for why this is safe — reports.js's own toolbar/template UI is real JSX; only
 * the assembled report document itself is this escape hatch).
 */
import type { PCCStoreData, PCCProject, PCCReportTemplate } from "../types/pcc";

export var SEVERITY_MATRIX: { [probability: string]: { [impact: string]: string } } = {
  high: { low: "medium", medium: "high", high: "high" },
  medium: { low: "low", medium: "medium", high: "high" },
  low: { low: "low", medium: "low", high: "medium" },
};

export var PROJECT_SECTIONS: { [key: string]: string } = {
  overview: "Overview",
  risks: "Risk / Issue / Opportunity Register",
  rfis: "RFI / Technical Query",
  changeOrders: "Change Orders",
  recoveryActions: "Recovery Actions",
  decisions: "Decisions",
  meetings: "Meetings",
  dailyLog: "Daily Log",
  documents: "Documents",
};
export var PORTFOLIO_SECTIONS: { [key: string]: string } = {
  projects: "Projects",
  kpis: "Portfolio KPIs",
  risks: "Risk / Issue / Opportunity Register",
  rfis: "RFI / Technical Query",
  changeOrders: "Change Orders",
  recoveryActions: "Recovery Actions",
  decisions: "Decisions",
  documentCompliance: "Document Control Compliance",
};

export function allSectionsOn(keys: { [key: string]: string }): { [key: string]: boolean } {
  var out: { [key: string]: boolean } = {};
  Object.keys(keys).forEach(function (k) {
    out[k] = true;
  });
  return out;
}

export var REPORT_DAY_WINDOW_OPTIONS = [
  { value: "", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
];

export var REPORT_DAY_SECTION_LABELS: { [key: string]: string } = { dailyLog: "Daily Log", meetings: "Meetings", documents: "Documents" };

function withinReportDayWindow(dateStr: string | undefined, days: string | undefined): boolean {
  if (!days) return true;
  if (!dateStr) return false;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(days));
  return new Date(dateStr) >= cutoff;
}

function renderLogoImg(data: PCCStoreData): HTMLImageElement | null {
  if (!data.settings.company_logo_filename) return null;
  var img = document.createElement("img");
  img.style.maxHeight = "48px";
  img.style.maxWidth = "160px";
  img.style.objectFit = "contain";
  img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
  window.PCC.blobStore
    .getBlob("company_logo")
    .then(function (fileData) {
      if (fileData) img.src = fileData;
    })
    .catch(function () {
      /* leave placeholder — logo just won't load, not fatal */
    });
  return img;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function esc(s: unknown): string {
  var div = document.createElement("div");
  div.textContent = s === null || s === undefined ? "" : String(s);
  return div.innerHTML;
}

function fmtMoney(amount: number | string | null | undefined, currency: string | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  var n = Number(amount);
  if (isNaN(n)) return "—";
  return (currency ? currency + " " : "") + n.toLocaleString();
}

function sectionEl(titleText: string): HTMLDivElement {
  var section = document.createElement("div");
  section.className = "report-doc__section";
  var h3 = document.createElement("h3");
  h3.textContent = titleText;
  h3.style.marginBottom = "6px";
  section.appendChild(h3);
  return section;
}

function emptyNote(text: string): HTMLParagraphElement {
  var p = document.createElement("p");
  p.className = "text-secondary";
  p.style.fontSize = "12px";
  p.style.margin = "4px 0 0";
  p.textContent = text;
  return p;
}

function table(headers: string[], rows: string[][]): HTMLTableElement {
  var t = document.createElement("table");
  var thead = document.createElement("thead");
  var trh = document.createElement("tr");
  headers.forEach(function (h) {
    var th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  t.appendChild(thead);
  var tbody = document.createElement("tbody");
  rows.forEach(function (r) {
    var tr = document.createElement("tr");
    r.forEach(function (cell) {
      var td = document.createElement("td");
      td.innerHTML = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  return t;
}

export function buildProjectReport(
  project: PCCProject,
  data: PCCStoreData,
  sections: { [key: string]: boolean },
  sectionDays: { [key: string]: string }
): HTMLDivElement {
  var doc = document.createElement("div");
  doc.className = "report-doc";

  var header = document.createElement("div");
  header.style.marginBottom = "18px";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "flex-start";
  header.style.gap = "16px";
  var headerText = document.createElement("div");
  headerText.innerHTML =
    "<h2 style='margin-bottom:2px'>" + esc(project.name || "(unnamed project)") + "</h2>" +
    "<p class='text-secondary' style='font-size:12px;margin:0'>Project Status Report · Generated " + today() + "</p>";
  header.appendChild(headerText);
  var logoImg = renderLogoImg(data);
  if (logoImg) header.appendChild(logoImg);
  doc.appendChild(header);

  if (sections.overview) {
    var overview = sectionEl("Overview");
    var overviewRows = [
      ["Status", esc(project.status || "—")],
      ["Progress", (project.progress || 0) + "%"],
      ["Client", esc(project.client || "—")],
      ["Contract Type", esc(project.contract_type || "—")],
      ["Contract Value", esc(fmtMoney(project.contract_value, project.currency))],
      ["Budget", esc(fmtMoney(project.budget, project.currency))],
      ["Start Date", esc(project.start_date || "—")],
      ["Finish Date", esc(project.finish_date || "—")],
      ["Project Manager", esc(project.project_manager || "—")],
      ["Location", esc(project.location || "—")],
    ];
    overview.appendChild(table(["Field", "Value"], overviewRows));
    doc.appendChild(overview);
  }

  if (sections.risks) {
    var risks = data.risks.filter(function (r) {
      return r.project_id === project.id;
    });
    var openRisks = risks.filter(function (r) {
      return r.status !== "closed";
    });
    var riskSection = sectionEl("Risk / Issue / Opportunity Register — " + openRisks.length + " open of " + risks.length + " total");
    if (openRisks.length === 0) {
      riskSection.appendChild(emptyNote("No open risks, issues, or opportunities."));
    } else {
      riskSection.appendChild(
        table(
          ["Title", "Type", "Severity", "Status", "Owner"],
          openRisks.map(function (r) {
            var severity = SEVERITY_MATRIX[r.probability || ""] ? SEVERITY_MATRIX[r.probability || ""][r.impact || ""] : "—";
            return [esc(r.title || "(untitled)"), esc(r.type), esc(severity), esc(r.status), esc(r.owner || "—")];
          })
        )
      );
    }
    doc.appendChild(riskSection);
  }

  if (sections.rfis) {
    var rfis = data.rfis.filter(function (r) {
      return r.project_id === project.id;
    });
    var openRfis = rfis.filter(function (r) {
      return r.status !== "closed";
    });
    var overdueRfis = rfis.filter(function (r) {
      return r.status === "open" && r.date_required && r.date_required < today();
    });
    var rfiSection = sectionEl("RFI / Technical Query — " + openRfis.length + " open, " + overdueRfis.length + " overdue");
    if (openRfis.length === 0) {
      rfiSection.appendChild(emptyNote("No open RFIs or Technical Queries."));
    } else {
      rfiSection.appendChild(
        table(
          ["Number", "Subject", "Status", "Required By", "Assigned To"],
          openRfis.map(function (r) {
            var overdue = r.status === "open" && r.date_required && r.date_required < today();
            return [
              esc(r.number),
              esc(r.subject || "(untitled)"),
              esc(r.status) + (overdue ? " — OVERDUE" : ""),
              esc(r.date_required || "—"),
              esc(r.assigned_to || "—"),
            ];
          })
        )
      );
    }
    doc.appendChild(rfiSection);
  }

  if (sections.changeOrders) {
    var cos = data.change_orders.filter(function (co) {
      return co.project_id === project.id;
    });
    var openCos = cos.filter(function (co) {
      return co.status === "pending" || co.status === "approved";
    });
    var costSum = openCos.reduce(function (sum, co) {
      return sum + (Number(co.cost_impact_amount) || 0);
    }, 0);
    var daysSum = openCos.reduce(function (sum, co) {
      return sum + (Number(co.schedule_impact_days) || 0);
    }, 0);
    var coSection = sectionEl(
      "Change Orders — " + openCos.length + " open · net cost impact " + fmtMoney(costSum, project.currency) + " · net schedule impact " + daysSum + " days"
    );
    if (openCos.length === 0) {
      coSection.appendChild(emptyNote("No open Change Orders."));
    } else {
      coSection.appendChild(
        table(
          ["Number", "Title", "Status", "Cost Impact", "Schedule Impact"],
          openCos.map(function (co) {
            return [
              esc(co.number),
              esc(co.title || "(untitled)"),
              esc(co.status),
              esc(fmtMoney(co.cost_impact_amount, project.currency)),
              co.schedule_impact_days === null || co.schedule_impact_days === undefined ? "—" : esc(co.schedule_impact_days) + " days",
            ];
          })
        )
      );
    }
    doc.appendChild(coSection);
  }

  if (sections.recoveryActions) {
    var recoveryActions = data.recovery_actions.filter(function (r) {
      return r.project_id === project.id;
    });
    var openRecovery = recoveryActions.filter(function (r) {
      return r.status === "open" || r.status === "in_progress";
    });
    var overdueRecovery = openRecovery.filter(function (r) {
      return r.target_recovery_date && r.target_recovery_date < today();
    });
    var activitiesById: { [id: string]: (typeof data.activities)[number] } = {};
    data.activities.forEach(function (a) {
      activitiesById[a.id] = a;
    });
    var recoverySection = sectionEl("Recovery Actions — " + openRecovery.length + " open, " + overdueRecovery.length + " overdue");
    if (openRecovery.length === 0) {
      recoverySection.appendChild(emptyNote("No open recovery actions."));
    } else {
      recoverySection.appendChild(
        table(
          ["Description", "Activity", "Status", "Target Date", "Responsible"],
          openRecovery.map(function (r) {
            var overdue = r.target_recovery_date && r.target_recovery_date < today();
            var activity = activitiesById[r.activity_id || ""];
            return [
              esc(r.description || "(untitled)"),
              esc(activity ? activity.name : "—"),
              esc(r.status) + (overdue ? " — OVERDUE" : ""),
              esc(r.target_recovery_date || "—"),
              esc(r.responsible_person || "—"),
            ];
          })
        )
      );
    }
    doc.appendChild(recoverySection);
  }

  if (sections.decisions) {
    var decisions = data.decisions.filter(function (d) {
      return d.project_id === project.id;
    });
    var pendingDecisions = decisions.filter(function (d) {
      return d.status === "pending";
    });
    var decisionSection = sectionEl("Decisions — " + pendingDecisions.length + " pending of " + decisions.length + " total");
    if (pendingDecisions.length === 0) {
      decisionSection.appendChild(emptyNote("No pending decisions."));
    } else {
      decisionSection.appendChild(
        table(
          ["Title", "Decided By", "Decision Date"],
          pendingDecisions.map(function (d) {
            return [esc(d.title || "(untitled)"), esc(d.decided_by || "—"), esc(d.decision_date || "—")];
          })
        )
      );
    }
    doc.appendChild(decisionSection);
  }

  if (sections.meetings) {
    var meetingDays = sectionDays.meetings;
    var meetings = data.meetings
      .filter(function (m) {
        return m.project_id === project.id && withinReportDayWindow(m.meeting_date, meetingDays);
      })
      .slice()
      .sort(function (a, b) {
        return (b.meeting_date || "").localeCompare(a.meeting_date || "");
      });
    var openActions: { meeting: (typeof meetings)[number]; action: NonNullable<(typeof meetings)[number]["actions"]>[number] }[] = [];
    meetings.forEach(function (m) {
      (m.actions || []).forEach(function (a) {
        if (a.status === "open") openActions.push({ meeting: m, action: a });
      });
    });
    var overdueActions = openActions.filter(function (x) {
      return x.action.due_date && x.action.due_date < today();
    });
    var meetingSection = sectionEl(
      "Meetings" + (meetingDays ? " (last " + meetingDays + " days)" : "") + " — " + meetings.length + " total · " +
        openActions.length + " open action items, " + overdueActions.length + " overdue"
    );
    if (meetings.length === 0) {
      meetingSection.appendChild(emptyNote(meetingDays ? "No meetings in the last " + meetingDays + " days." : "No meetings logged."));
    } else {
      meetingSection.appendChild(
        table(
          ["Date", "Title", "Open Actions"],
          meetings.slice(0, 8).map(function (m) {
            var openCount = (m.actions || []).filter(function (a) {
              return a.status === "open";
            }).length;
            return [esc(m.meeting_date), esc(m.title || "(untitled)"), String(openCount)];
          })
        )
      );
      if (meetings.length > 8) {
        meetingSection.appendChild(emptyNote("+" + (meetings.length - 8) + " more meetings not shown."));
      }
    }
    doc.appendChild(meetingSection);
  }

  if (sections.dailyLog) {
    var dailyLogDays = sectionDays.dailyLog;
    var logs = data.daily_logs
      .filter(function (l) {
        return l.project_id === project.id && withinReportDayWindow(l.log_date, dailyLogDays);
      })
      .slice()
      .sort(function (a, b) {
        return (b.log_date || "").localeCompare(a.log_date || "");
      });
    var incidentLogs = logs.filter(function (l) {
      return l.incidents && l.incidents.trim();
    });
    var dailyLogSection = sectionEl(
      "Daily Log" + (dailyLogDays ? " (last " + dailyLogDays + " days)" : "") + " — " + logs.length + " entries · " +
        incidentLogs.length + " with incidents noted"
    );
    if (logs.length === 0) {
      dailyLogSection.appendChild(emptyNote(dailyLogDays ? "No Daily Log entries in the last " + dailyLogDays + " days." : "No Daily Log entries."));
    } else {
      dailyLogSection.appendChild(
        table(
          ["Date", "Weather", "Manpower", "Incidents"],
          logs.slice(0, 10).map(function (l) {
            return [esc(l.log_date), esc(l.weather || "—"), esc(l.manpower || "—"), l.incidents ? esc(l.incidents) : "—"];
          })
        )
      );
      if (logs.length > 10) {
        dailyLogSection.appendChild(emptyNote("+" + (logs.length - 10) + " more entries not shown."));
      }
    }
    doc.appendChild(dailyLogSection);
  }

  if (sections.documents) {
    var documentsDays = sectionDays.documents;
    var docs = data.documents.filter(function (d) {
      return d.project_id === project.id && !d.trashed_at && withinReportDayWindow(d.uploaded_at, documentsDays);
    });
    var docSection = sectionEl("Documents" + (documentsDays ? " (last " + documentsDays + " days)" : "") + " — " + docs.length + " on file");
    if (docs.length === 0) {
      docSection.appendChild(emptyNote(documentsDays ? "No documents uploaded in the last " + documentsDays + " days." : "No documents on file."));
    } else {
      var byCategory: { [key: string]: number } = {};
      docs.forEach(function (d) {
        var cat = d.category || "other";
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      });
      docSection.appendChild(
        table(
          ["Category", "Count"],
          Object.keys(byCategory).map(function (cat) {
            return [esc(cat), String(byCategory[cat])];
          })
        )
      );
    }
    doc.appendChild(docSection);
  }

  return doc;
}

export function buildPortfolioReport(data: PCCStoreData, sections: { [key: string]: boolean }): HTMLDivElement {
  var doc = document.createElement("div");
  doc.className = "report-doc";

  var header = document.createElement("div");
  header.style.marginBottom = "18px";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "flex-start";
  header.style.gap = "16px";
  var headerText = document.createElement("div");
  headerText.innerHTML =
    "<h2 style='margin-bottom:2px'>Portfolio Summary Report</h2>" +
    "<p class='text-secondary' style='font-size:12px;margin:0'>Generated " + today() + " · " + data.projects.length + " projects</p>";
  header.appendChild(headerText);
  var logoImg = renderLogoImg(data);
  if (logoImg) header.appendChild(logoImg);
  doc.appendChild(header);

  var activeProjects = data.projects.filter(function (p) {
    return !p.archived;
  });

  if (sections.projects) {
    var overviewSection = sectionEl("Projects — " + activeProjects.length + " active");
    if (activeProjects.length === 0) {
      overviewSection.appendChild(emptyNote("No active projects."));
    } else {
      overviewSection.appendChild(
        table(
          ["Project", "Status", "Progress", "Contract Value"],
          activeProjects.map(function (p) {
            return [esc(p.name || "(unnamed project)"), esc(p.status || "—"), (p.progress || 0) + "%", esc(fmtMoney(p.contract_value, p.currency))];
          })
        )
      );
    }
    doc.appendChild(overviewSection);
  }

  if (sections.kpis) {
    var totalContractValue = activeProjects.reduce(function (sum, p) {
      return sum + (Number(p.contract_value) || 0);
    }, 0);
    var statusCounts: { [key: string]: number } = {};
    activeProjects.forEach(function (p) {
      statusCounts[p.status || ""] = (statusCounts[p.status || ""] || 0) + 1;
    });
    var kpiSection = sectionEl("Portfolio KPIs");
    kpiSection.appendChild(
      table(
        ["Metric", "Value"],
        [
          ["Total Contract Value (active projects)", esc(totalContractValue.toLocaleString())],
          ["On Track", String(statusCounts.on_track || 0)],
          ["At Risk", String(statusCounts.at_risk || 0)],
          ["Critical", String(statusCounts.critical || 0)],
          ["Complete", String(statusCounts.complete || 0)],
        ]
      )
    );
    doc.appendChild(kpiSection);
  }

  if (sections.risks) {
    var openRisks = data.risks.filter(function (r) {
      return r.status !== "closed";
    });
    var riskByType: { [key: string]: number } = { risk: 0, issue: 0, opportunity: 0 };
    openRisks.forEach(function (r) {
      riskByType[r.type || ""] = (riskByType[r.type || ""] || 0) + 1;
    });
    var riskSection = sectionEl("Risk / Issue / Opportunity Register — " + openRisks.length + " open across portfolio");
    riskSection.appendChild(
      table(
        ["Type", "Open Count"],
        [
          ["Risks", String(riskByType.risk || 0)],
          ["Issues", String(riskByType.issue || 0)],
          ["Opportunities", String(riskByType.opportunity || 0)],
        ]
      )
    );
    doc.appendChild(riskSection);
  }

  if (sections.rfis) {
    var openRfis = data.rfis.filter(function (r) {
      return r.status !== "closed";
    });
    var overdueRfis = data.rfis.filter(function (r) {
      return r.status === "open" && r.date_required && r.date_required < today();
    });
    var rfiSection = sectionEl("RFI / Technical Query — " + openRfis.length + " open, " + overdueRfis.length + " overdue across portfolio");
    doc.appendChild(rfiSection);
  }

  if (sections.changeOrders) {
    var openCos = data.change_orders.filter(function (co) {
      return co.status === "pending" || co.status === "approved";
    });
    var pendingCos = data.change_orders.filter(function (co) {
      return co.status === "pending";
    });
    var coSection = sectionEl("Change Orders — " + openCos.length + " open, " + pendingCos.length + " pending decision across portfolio");
    doc.appendChild(coSection);
  }

  if (sections.recoveryActions) {
    var activeProjectIdsForRecovery: { [id: string]: boolean } = {};
    activeProjects.forEach(function (p) {
      activeProjectIdsForRecovery[p.id] = true;
    });
    var portfolioOpenRecovery = data.recovery_actions.filter(function (r) {
      return activeProjectIdsForRecovery[r.project_id] && (r.status === "open" || r.status === "in_progress");
    });
    var portfolioOverdueRecovery = portfolioOpenRecovery.filter(function (r) {
      return r.target_recovery_date && r.target_recovery_date < today();
    });
    var recoverySection = sectionEl(
      "Recovery Actions — " + portfolioOpenRecovery.length + " open, " + portfolioOverdueRecovery.length + " overdue across portfolio"
    );
    doc.appendChild(recoverySection);
  }

  if (sections.decisions) {
    var activeProjectIdsForDecisions: { [id: string]: boolean } = {};
    activeProjects.forEach(function (p) {
      activeProjectIdsForDecisions[p.id] = true;
    });
    var portfolioPendingDecisions = data.decisions.filter(function (d) {
      return activeProjectIdsForDecisions[d.project_id] && d.status === "pending";
    });
    var decisionSection = sectionEl("Decisions — " + portfolioPendingDecisions.length + " pending across portfolio");
    doc.appendChild(decisionSection);
  }

  if (!sections.documentCompliance) return doc;
  var docTypesById: { [id: string]: (typeof data.document_types)[number] } = {};
  data.document_types.forEach(function (t) {
    docTypesById[t.id] = t;
  });
  var activeProjectIds: { [id: string]: boolean } = {};
  activeProjects.forEach(function (p) {
    activeProjectIds[p.id] = true;
  });
  var docRows = data.project_document_requirements
    .filter(function (r) {
      return activeProjectIds[r.project_id] && docTypesById[r.document_type_id];
    })
    .map(function (r) {
      var available = data.documents.some(function (d) {
        return d.project_id === r.project_id && d.document_type_id === r.document_type_id && !d.trashed_at;
      });
      var status = available ? "available" : r.planned_submission_date && r.planned_submission_date < today() ? "overdue" : "required";
      return { row: r, status: status };
    });
  var docTotal = docRows.length;
  var docAvailable = docRows.filter(function (x) {
    return x.status === "available";
  }).length;
  var docOverdue = docRows.filter(function (x) {
    return x.status === "overdue";
  }).length;
  var docPct = docTotal === 0 ? 0 : Math.round((docAvailable / docTotal) * 100);
  var docSection = sectionEl("Document Control Compliance — " + docPct + "% available across portfolio (" + docTotal + " requirement(s), " + docOverdue + " overdue)");
  if (docTotal === 0) {
    docSection.appendChild(emptyNote("No document requirements assigned across the active portfolio."));
  } else {
    var byProject: { [projectId: string]: { total: number; available: number; overdue: number } } = {};
    docRows.forEach(function (x) {
      var pid = x.row.project_id;
      if (!byProject[pid]) byProject[pid] = { total: 0, available: 0, overdue: 0 };
      byProject[pid].total++;
      if (x.status === "available") byProject[pid].available++;
      if (x.status === "overdue") byProject[pid].overdue++;
    });
    var docProjectRows = Object.keys(byProject)
      .map(function (pid) {
        var proj = activeProjects.find(function (p) {
          return p.id === pid;
        });
        var stats = byProject[pid];
        var pct = stats.total === 0 ? 0 : Math.round((stats.available / stats.total) * 100);
        return { name: proj ? proj.name || "(unnamed project)" : "(deleted project)", stats: stats, pct: pct };
      })
      .sort(function (a, b) {
        if (a.pct !== b.pct) return a.pct - b.pct;
        return b.stats.overdue - a.stats.overdue;
      });
    docSection.appendChild(
      table(
        ["Project", "Available", "Overdue", "% Available"],
        docProjectRows.map(function (pr) {
          return [esc(pr.name), pr.stats.available + " of " + pr.stats.total, String(pr.stats.overdue), pr.pct + "%"];
        })
      )
    );
  }
  doc.appendChild(docSection);

  return doc;
}

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

export function newReportTemplate(values: Partial<PCCReportTemplate>): PCCReportTemplate {
  return window.PCC.store.newReportTemplate(values);
}

export function saveTemplateChanges(templateId: string, sections: { [key: string]: boolean }): void {
  window.PCC.store.update(function (d) {
    var t = d.report_templates.find(function (x) {
      return x.id === templateId;
    });
    if (t) {
      t.sections = Object.assign({}, sections);
      t.updated_at = new Date().toISOString();
    }
  });
}

export function saveNewTemplate(reportType: string, name: string, sections: { [key: string]: boolean }): PCCReportTemplate {
  var newTemplate = window.PCC.store.newReportTemplate({ report_type: reportType, name: name, sections: Object.assign({}, sections) });
  window.PCC.store.update(function (d) {
    d.report_templates.push(newTemplate);
  });
  return newTemplate;
}

export function deleteTemplate(templateId: string): void {
  window.PCC.store.update(function (d) {
    d.report_templates = d.report_templates.filter(function (t) {
      return t.id !== templateId;
    });
  });
}

export function notify(message: string, level: string): void {
  window.PCC.notify(message, level);
}

export function printPage(): void {
  window.print();
}
