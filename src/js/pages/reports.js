(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  // Replicated locally rather than shared, matching how every other page module in
  // this codebase is self-contained (no shared util layer exists yet).
  var SEVERITY_MATRIX = {
    high: { low: "medium", medium: "high", high: "high" },
    medium: { low: "low", medium: "medium", high: "high" },
    low: { low: "low", medium: "low", high: "medium" },
  };

  // PCC Evolution Roadmap, Tier 3 ("final polish"): Report Template System. Every
  // section each report can build, in render order — "all true" reproduces this gate's
  // pre-existing always-on behavior exactly, so an install with no saved template sees
  // no change. Confirmed via AskUserQuestion: multiple named/saved templates (not just
  // one persisted default), same shape for both report types below.
  var PROJECT_SECTIONS = {
    overview: "Overview", risks: "Risk / Issue / Opportunity Register", rfis: "RFI / Technical Query",
    changeOrders: "Change Orders", recoveryActions: "Recovery Actions", decisions: "Decisions",
    meetings: "Meetings", dailyLog: "Daily Log", documents: "Documents",
  };
  var PORTFOLIO_SECTIONS = {
    projects: "Projects", kpis: "Portfolio KPIs", risks: "Risk / Issue / Opportunity Register",
    rfis: "RFI / Technical Query", changeOrders: "Change Orders", recoveryActions: "Recovery Actions",
    decisions: "Decisions", documentCompliance: "Document Control Compliance",
  };

  function allSectionsOn(keys) {
    var out = {};
    Object.keys(keys).forEach(function (k) { out[k] = true; });
    return out;
  }

  var uiState = {
    reportType: "project", // "project" | "portfolio"
    projectId: "",
    sections: { project: allSectionsOn(PROJECT_SECTIONS), portfolio: allSectionsOn(PORTFOLIO_SECTIONS) },
    // "" means the current checkbox state is a custom/unsaved selection, not tied to
    // any saved template — same "blank option = no filter" convention this app's
    // dropdowns already use elsewhere.
    selectedTemplateId: { project: "", portfolio: "" },
    savingAsNew: false,
    newTemplateName: "",
    // Daily-Use Audit Phase 4: the Project Status Report's three inherently chronological
    // sections (Daily Log, Meetings, Documents — each has its own date field and no
    // open/pending status to narrow it down the way Risks/RFIs/Change Orders already
    // are) always showed every entry, capped only by a fixed "top N" slice. Each gets
    // its own independent "last N days" window — "" means All Time, matching this
    // section's exact pre-existing behavior, so an existing install sees no change
    // until it's actually narrowed. Ephemeral UI state, not persisted (same "resets on
    // reload" treatment as reportType/sections above), and per report-type since the
    // portfolio report has no date-bearing sections of this kind to apply it to.
    reportSectionDays: { dailyLog: "", meetings: "", documents: "" },
  };

  var REPORT_DAY_WINDOW_OPTIONS = [
    { value: "", label: "All time" },
    { value: "7", label: "Last 7 days" },
    { value: "14", label: "Last 14 days" },
    { value: "30", label: "Last 30 days" },
    { value: "60", label: "Last 60 days" },
    { value: "90", label: "Last 90 days" },
  ];

  /** "" (All Time) always passes. A day window with no date on the record excludes it —
   * a record can't be verified to fall inside a recency window it has no date for. */
  function withinReportDayWindow(dateStr, days) {
    if (!days) return true;
    if (!dateStr) return false;
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(days));
    return new Date(dateStr) >= cutoff;
  }

  /** Same placeholder-then-async-resolve pattern dailyLog.js's photo thumbnails and
   * documents.js's stored-file preview already establish — the logo is a single blob
   * (blobStore key "company_logo"), so this is a fire-and-forget <img> src swap, not a
   * structural change to make report-building async. */
  function renderLogoImg(data) {
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

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s === null || s === undefined ? "" : String(s);
    return div.innerHTML;
  }

  function fmtMoney(amount, currency) {
    if (amount === null || amount === undefined || amount === "") return "\u2014";
    var n = Number(amount);
    if (isNaN(n)) return "\u2014";
    return (currency ? currency + " " : "") + n.toLocaleString();
  }

  function sectionEl(titleText) {
    var section = document.createElement("div");
    section.className = "report-doc__section";
    var h3 = document.createElement("h3");
    h3.textContent = titleText;
    h3.style.marginBottom = "6px";
    section.appendChild(h3);
    return section;
  }

  function emptyNote(text) {
    var p = document.createElement("p");
    p.className = "text-secondary";
    p.style.fontSize = "12px";
    p.style.margin = "4px 0 0";
    p.textContent = text;
    return p;
  }

  function table(headers, rows) {
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

  // --- Single-Project Status Report -----------------------------------------------

  function buildProjectReport(project, data, sections, sectionDays) {
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
      "<p class='text-secondary' style='font-size:12px;margin:0'>Project Status Report \u00b7 Generated " + today() + "</p>";
    header.appendChild(headerText);
    var logoImg = renderLogoImg(data);
    if (logoImg) header.appendChild(logoImg);
    doc.appendChild(header);

    if (sections.overview) {
      var overview = sectionEl("Overview");
      var overviewRows = [
        ["Status", esc(project.status || "\u2014")],
        ["Progress", (project.progress || 0) + "%"],
        ["Client", esc(project.client || "\u2014")],
        ["Contract Type", esc(project.contract_type || "\u2014")],
        ["Contract Value", esc(fmtMoney(project.contract_value, project.currency))],
        ["Budget", esc(fmtMoney(project.budget, project.currency))],
        ["Start Date", esc(project.start_date || "\u2014")],
        ["Finish Date", esc(project.finish_date || "\u2014")],
        ["Project Manager", esc(project.project_manager || "\u2014")],
        ["Location", esc(project.location || "\u2014")],
      ];
      overview.appendChild(table(["Field", "Value"], overviewRows));
      doc.appendChild(overview);
    }

    // Risk / Issue / Opportunity Register
    if (sections.risks) {
      var risks = data.risks.filter(function (r) { return r.project_id === project.id; });
      var openRisks = risks.filter(function (r) { return r.status !== "closed"; });
      var riskSection = sectionEl("Risk / Issue / Opportunity Register \u2014 " + openRisks.length + " open of " + risks.length + " total");
      if (openRisks.length === 0) {
        riskSection.appendChild(emptyNote("No open risks, issues, or opportunities."));
      } else {
        riskSection.appendChild(
          table(
            ["Title", "Type", "Severity", "Status", "Owner"],
            openRisks.map(function (r) {
              var severity = SEVERITY_MATRIX[r.probability] ? SEVERITY_MATRIX[r.probability][r.impact] : "\u2014";
              return [esc(r.title || "(untitled)"), esc(r.type), esc(severity), esc(r.status), esc(r.owner || "\u2014")];
            })
          )
        );
      }
      doc.appendChild(riskSection);
    }

    // RFI / Technical Query
    if (sections.rfis) {
    var rfis = data.rfis.filter(function (r) { return r.project_id === project.id; });
    var openRfis = rfis.filter(function (r) { return r.status !== "closed"; });
    var overdueRfis = rfis.filter(function (r) { return r.status === "open" && r.date_required && r.date_required < today(); });
    var rfiSection = sectionEl("RFI / Technical Query \u2014 " + openRfis.length + " open, " + overdueRfis.length + " overdue");
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
              esc(r.status) + (overdue ? " \u2014 OVERDUE" : ""),
              esc(r.date_required || "\u2014"),
              esc(r.assigned_to || "\u2014"),
            ];
          })
        )
      );
    }
    doc.appendChild(rfiSection);
    }

    // Change Orders
    if (sections.changeOrders) {
    var cos = data.change_orders.filter(function (co) { return co.project_id === project.id; });
    var openCos = cos.filter(function (co) { return co.status === "pending" || co.status === "approved"; });
    var costSum = openCos.reduce(function (sum, co) { return sum + (Number(co.cost_impact_amount) || 0); }, 0);
    var daysSum = openCos.reduce(function (sum, co) { return sum + (Number(co.schedule_impact_days) || 0); }, 0);
    var coSection = sectionEl(
      "Change Orders \u2014 " + openCos.length + " open \u00b7 net cost impact " + fmtMoney(costSum, project.currency) + " \u00b7 net schedule impact " + daysSum + " days"
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
              co.schedule_impact_days === null || co.schedule_impact_days === undefined ? "\u2014" : esc(co.schedule_impact_days) + " days",
            ];
          })
        )
      );
    }
    doc.appendChild(coSection);
    }

    // Recovery Actions (PCC Evolution Roadmap, Tier C: Delay & Recovery Management)
    if (sections.recoveryActions) {
    var recoveryActions = data.recovery_actions.filter(function (r) { return r.project_id === project.id; });
    var openRecovery = recoveryActions.filter(function (r) { return r.status === "open" || r.status === "in_progress"; });
    var overdueRecovery = openRecovery.filter(function (r) { return r.target_recovery_date && r.target_recovery_date < today(); });
    var activitiesById = {};
    data.activities.forEach(function (a) { activitiesById[a.id] = a; });
    var recoverySection = sectionEl("Recovery Actions — " + openRecovery.length + " open, " + overdueRecovery.length + " overdue");
    if (openRecovery.length === 0) {
      recoverySection.appendChild(emptyNote("No open recovery actions."));
    } else {
      recoverySection.appendChild(
        table(
          ["Description", "Activity", "Status", "Target Date", "Responsible"],
          openRecovery.map(function (r) {
            var overdue = r.target_recovery_date && r.target_recovery_date < today();
            var activity = activitiesById[r.activity_id];
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

    // Decisions (PCC Evolution Roadmap, Tier C: Decision Register)
    if (sections.decisions) {
    var decisions = data.decisions.filter(function (d) { return d.project_id === project.id; });
    var pendingDecisions = decisions.filter(function (d) { return d.status === "pending"; });
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

    // Meetings
    if (sections.meetings) {
    var meetingDays = sectionDays.meetings;
    var meetings = data.meetings
      .filter(function (m) { return m.project_id === project.id && withinReportDayWindow(m.meeting_date, meetingDays); })
      .slice()
      .sort(function (a, b) { return (b.meeting_date || "").localeCompare(a.meeting_date || ""); });
    var openActions = [];
    meetings.forEach(function (m) {
      (m.actions || []).forEach(function (a) {
        if (a.status === "open") openActions.push({ meeting: m, action: a });
      });
    });
    var overdueActions = openActions.filter(function (x) { return x.action.due_date && x.action.due_date < today(); });
    var meetingSection = sectionEl(
      "Meetings" + (meetingDays ? " (last " + meetingDays + " days)" : "") + " \u2014 " + meetings.length + " total \u00b7 " +
      openActions.length + " open action items, " + overdueActions.length + " overdue"
    );
    if (meetings.length === 0) {
      meetingSection.appendChild(emptyNote(meetingDays ? "No meetings in the last " + meetingDays + " days." : "No meetings logged."));
    } else {
      meetingSection.appendChild(
        table(
          ["Date", "Title", "Open Actions"],
          meetings.slice(0, 8).map(function (m) {
            var openCount = (m.actions || []).filter(function (a) { return a.status === "open"; }).length;
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

    // Daily Log
    if (sections.dailyLog) {
    var dailyLogDays = sectionDays.dailyLog;
    var logs = data.daily_logs
      .filter(function (l) { return l.project_id === project.id && withinReportDayWindow(l.log_date, dailyLogDays); })
      .slice()
      .sort(function (a, b) { return (b.log_date || "").localeCompare(a.log_date || ""); });
    var incidentLogs = logs.filter(function (l) { return l.incidents && l.incidents.trim(); });
    var dailyLogSection = sectionEl(
      "Daily Log" + (dailyLogDays ? " (last " + dailyLogDays + " days)" : "") + " \u2014 " + logs.length + " entries \u00b7 " +
      incidentLogs.length + " with incidents noted"
    );
    if (logs.length === 0) {
      dailyLogSection.appendChild(emptyNote(dailyLogDays ? "No Daily Log entries in the last " + dailyLogDays + " days." : "No Daily Log entries."));
    } else {
      dailyLogSection.appendChild(
        table(
          ["Date", "Weather", "Manpower", "Incidents"],
          logs.slice(0, 10).map(function (l) {
            return [esc(l.log_date), esc(l.weather || "\u2014"), esc(l.manpower || "\u2014"), l.incidents ? esc(l.incidents) : "\u2014"];
          })
        )
      );
      if (logs.length > 10) {
        dailyLogSection.appendChild(emptyNote("+" + (logs.length - 10) + " more entries not shown."));
      }
    }
    doc.appendChild(dailyLogSection);
    }

    // Documents
    if (sections.documents) {
    var documentsDays = sectionDays.documents;
    var docs = data.documents.filter(function (d) { return d.project_id === project.id && withinReportDayWindow(d.uploaded_at, documentsDays); });
    var docSection = sectionEl(
      "Documents" + (documentsDays ? " (last " + documentsDays + " days)" : "") + " \u2014 " + docs.length + " on file"
    );
    if (docs.length === 0) {
      docSection.appendChild(emptyNote(documentsDays ? "No documents uploaded in the last " + documentsDays + " days." : "No documents on file."));
    } else {
      var byCategory = {};
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

  // --- Portfolio-Wide Summary Report ------------------------------------------------

  function buildPortfolioReport(data, sections) {
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
      "<p class='text-secondary' style='font-size:12px;margin:0'>Generated " + today() + " \u00b7 " + data.projects.length + " projects</p>";
    header.appendChild(headerText);
    var logoImg = renderLogoImg(data);
    if (logoImg) header.appendChild(logoImg);
    doc.appendChild(header);

    var activeProjects = data.projects.filter(function (p) { return !p.archived; });

    if (sections.projects) {
    var overviewSection = sectionEl("Projects \u2014 " + activeProjects.length + " active");
    if (activeProjects.length === 0) {
      overviewSection.appendChild(emptyNote("No active projects."));
    } else {
      overviewSection.appendChild(
        table(
          ["Project", "Status", "Progress", "Contract Value"],
          activeProjects.map(function (p) {
            return [esc(p.name || "(unnamed project)"), esc(p.status || "\u2014"), (p.progress || 0) + "%", esc(fmtMoney(p.contract_value, p.currency))];
          })
        )
      );
    }
    doc.appendChild(overviewSection);
    }

    if (sections.kpis) {
    var totalContractValue = activeProjects.reduce(function (sum, p) { return sum + (Number(p.contract_value) || 0); }, 0);
    var statusCounts = {};
    activeProjects.forEach(function (p) {
      statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
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
    var openRisks = data.risks.filter(function (r) { return r.status !== "closed"; });
    var riskByType = { risk: 0, issue: 0, opportunity: 0 };
    openRisks.forEach(function (r) { riskByType[r.type] = (riskByType[r.type] || 0) + 1; });
    var riskSection = sectionEl("Risk / Issue / Opportunity Register \u2014 " + openRisks.length + " open across portfolio");
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
    var openRfis = data.rfis.filter(function (r) { return r.status !== "closed"; });
    var overdueRfis = data.rfis.filter(function (r) { return r.status === "open" && r.date_required && r.date_required < today(); });
    var rfiSection = sectionEl("RFI / Technical Query \u2014 " + openRfis.length + " open, " + overdueRfis.length + " overdue across portfolio");
    doc.appendChild(rfiSection);
    }

    if (sections.changeOrders) {
    var openCos = data.change_orders.filter(function (co) { return co.status === "pending" || co.status === "approved"; });
    var pendingCos = data.change_orders.filter(function (co) { return co.status === "pending"; });
    var coSection = sectionEl("Change Orders \u2014 " + openCos.length + " open, " + pendingCos.length + " pending decision across portfolio");
    doc.appendChild(coSection);
    }

    // Recovery Actions (PCC Evolution Roadmap, Tier C: Delay & Recovery Management)
    if (sections.recoveryActions) {
    var activeProjectIdsForRecovery = {};
    activeProjects.forEach(function (p) { activeProjectIdsForRecovery[p.id] = true; });
    var portfolioOpenRecovery = data.recovery_actions.filter(function (r) {
      return activeProjectIdsForRecovery[r.project_id] && (r.status === "open" || r.status === "in_progress");
    });
    var portfolioOverdueRecovery = portfolioOpenRecovery.filter(function (r) { return r.target_recovery_date && r.target_recovery_date < today(); });
    var recoverySection = sectionEl("Recovery Actions \u2014 " + portfolioOpenRecovery.length + " open, " + portfolioOverdueRecovery.length + " overdue across portfolio");
    doc.appendChild(recoverySection);
    }

    // Decisions (PCC Evolution Roadmap, Tier C: Decision Register)
    if (sections.decisions) {
    var activeProjectIdsForDecisions = {};
    activeProjects.forEach(function (p) { activeProjectIdsForDecisions[p.id] = true; });
    var portfolioPendingDecisions = data.decisions.filter(function (d) {
      return activeProjectIdsForDecisions[d.project_id] && d.status === "pending";
    });
    var decisionSection = sectionEl("Decisions \u2014 " + portfolioPendingDecisions.length + " pending across portfolio");
    doc.appendChild(decisionSection);
    }

    // Gate 28 (Document Control 14: Portfolio Compliance) \u2014 the final gate of the
    // 14-gate Document Control sub-spec. Same Available/Overdue/Required computation as
    // every Document Control gate since Gate 18 (portfolio.js/vendors.js/schedule.js/
    // dashboard.js/documentControlDashboard.js/executiveCenter.js all have their own
    // copy already; this is the seventh), reused here to complete the existing
    // portfolio-wide printable report rather than building a parallel one.
    if (!sections.documentCompliance) return doc;
    var docTypesById = {};
    data.document_types.forEach(function (t) { docTypesById[t.id] = t; });
    var activeProjectIds = {};
    activeProjects.forEach(function (p) { activeProjectIds[p.id] = true; });
    var docRows = data.project_document_requirements
      .filter(function (r) { return activeProjectIds[r.project_id] && docTypesById[r.document_type_id]; })
      .map(function (r) {
        var available = data.documents.some(function (d) { return d.project_id === r.project_id && d.document_type_id === r.document_type_id; });
        var status = available ? "available" : (r.planned_submission_date && r.planned_submission_date < today() ? "overdue" : "required");
        return { row: r, status: status };
      });
    var docTotal = docRows.length;
    var docAvailable = docRows.filter(function (x) { return x.status === "available"; }).length;
    var docOverdue = docRows.filter(function (x) { return x.status === "overdue"; }).length;
    var docPct = docTotal === 0 ? 0 : Math.round((docAvailable / docTotal) * 100);
    var docSection = sectionEl("Document Control Compliance \u2014 " + docPct + "% available across portfolio (" + docTotal + " requirement(s), " + docOverdue + " overdue)");
    if (docTotal === 0) {
      docSection.appendChild(emptyNote("No document requirements assigned across the active portfolio."));
    } else {
      var byProject = {};
      docRows.forEach(function (x) {
        var pid = x.row.project_id;
        if (!byProject[pid]) byProject[pid] = { total: 0, available: 0, overdue: 0 };
        byProject[pid].total++;
        if (x.status === "available") byProject[pid].available++;
        if (x.status === "overdue") byProject[pid].overdue++;
      });
      var docProjectRows = Object.keys(byProject)
        .map(function (pid) {
          var proj = activeProjects.find(function (p) { return p.id === pid; });
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

  function render(outlet) {
    var data = window.PCC.store.get();
    var projects = data.projects;

    var h1 = document.createElement("h2");
    h1.className = "focus-mode-hide";
    h1.textContent = "Reports";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar no-print";

    var typeSelect = document.createElement("select");
    var projectOpt = document.createElement("option");
    projectOpt.value = "project";
    projectOpt.textContent = "Project Status Report";
    var portfolioOpt = document.createElement("option");
    portfolioOpt.value = "portfolio";
    portfolioOpt.textContent = "Portfolio Summary Report";
    typeSelect.appendChild(projectOpt);
    typeSelect.appendChild(portfolioOpt);
    typeSelect.value = uiState.reportType;
    typeSelect.onchange = function () {
      uiState.reportType = typeSelect.value;
      rerender();
    };
    toolbar.appendChild(typeSelect);

    var projSelect = document.createElement("select");
    projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projSelect.appendChild(opt);
    });
    // Redesign Gate 6 (Global Project Context): follow the shared active project
    // whenever it's valid — see schedule.js's own comment on why this can't be
    // conditioned on "only when uiState.projectId is unset".
    var ctxProjectId = window.PCC.projectContext.get();
    if (ctxProjectId && projects.some(function (p) { return p.id === ctxProjectId; })) {
      uiState.projectId = ctxProjectId;
    } else if (!uiState.projectId && projects.length > 0) {
      uiState.projectId = projects[0].id;
    }
    projSelect.value = uiState.projectId;
    projSelect.style.display = uiState.reportType === "project" ? "" : "none";
    projSelect.onchange = function () {
      uiState.projectId = projSelect.value;
      window.PCC.projectContext.set(uiState.projectId);
      rerender();
    };
    toolbar.appendChild(projSelect);

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var printBtn = document.createElement("button");
    printBtn.className = "btn btn--primary";
    printBtn.textContent = "Print / Save as PDF";
    printBtn.onclick = function () {
      window.print();
    };
    toolbar.appendChild(printBtn);

    outlet.appendChild(toolbar);

    // PCC Evolution Roadmap, Tier 3 ("final polish"): Report Template System — named,
    // saved section-selections. Confirmed via AskUserQuestion over the simpler "single
    // persisted default" option, so this is real CRUD (save/apply/rename-by-resave/
    // delete), not just a remembered checkbox state.
    var sectionKeys = uiState.reportType === "project" ? PROJECT_SECTIONS : PORTFOLIO_SECTIONS;
    var currentTemplates = data.report_templates.filter(function (t) { return t.report_type === uiState.reportType; });

    var templatePanel = document.createElement("div");
    templatePanel.className = "panel no-print";
    templatePanel.style.marginBottom = "16px";

    var templateRow = document.createElement("div");
    templateRow.style.display = "flex";
    templateRow.style.alignItems = "center";
    templateRow.style.gap = "8px";
    templateRow.style.flexWrap = "wrap";

    var templateLabel = document.createElement("span");
    templateLabel.style.fontSize = "13px";
    templateLabel.textContent = "Template:";
    templateRow.appendChild(templateLabel);

    var templateSelect = document.createElement("select");
    var customOpt = document.createElement("option");
    customOpt.value = "";
    customOpt.textContent = "— Custom selection —";
    templateSelect.appendChild(customOpt);
    currentTemplates.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      templateSelect.appendChild(opt);
    });
    templateSelect.value = uiState.selectedTemplateId[uiState.reportType];
    templateSelect.onchange = function () {
      var chosen = currentTemplates.find(function (t) { return t.id === templateSelect.value; });
      if (chosen) {
        var applied = {};
        Object.keys(sectionKeys).forEach(function (k) { applied[k] = chosen.sections[k] !== false; });
        uiState.sections[uiState.reportType] = applied;
        uiState.selectedTemplateId[uiState.reportType] = chosen.id;
      } else {
        uiState.selectedTemplateId[uiState.reportType] = "";
      }
      rerender();
    };
    templateRow.appendChild(templateSelect);

    var currentTemplate = currentTemplates.find(function (t) { return t.id === uiState.selectedTemplateId[uiState.reportType]; });

    if (currentTemplate) {
      var saveChangesBtn = document.createElement("button");
      saveChangesBtn.className = "btn btn--ghost";
      saveChangesBtn.textContent = "Save Changes";
      saveChangesBtn.onclick = function () {
        window.PCC.store.update(function (d) {
          var t = d.report_templates.find(function (x) { return x.id === currentTemplate.id; });
          if (t) {
            t.sections = Object.assign({}, uiState.sections[uiState.reportType]);
            t.updated_at = new Date().toISOString();
          }
        });
        window.PCC.notify("Template updated.", "success");
        rerender();
      };
      templateRow.appendChild(saveChangesBtn);

      var deleteTemplateBtn = document.createElement("button");
      deleteTemplateBtn.className = "btn btn--ghost";
      deleteTemplateBtn.textContent = "Delete Template";
      deleteTemplateBtn.onclick = function () {
        if (!window.confirm("Delete the template “" + currentTemplate.name + "”? This can't be undone.")) return;
        window.PCC.store.update(function (d) {
          d.report_templates = d.report_templates.filter(function (t) { return t.id !== currentTemplate.id; });
        });
        uiState.selectedTemplateId[uiState.reportType] = "";
        window.PCC.notify("Template deleted.", "info");
        rerender();
      };
      templateRow.appendChild(deleteTemplateBtn);
    }

    var saveNewBtn = document.createElement("button");
    saveNewBtn.className = "btn btn--ghost";
    saveNewBtn.textContent = "Save as New…";
    saveNewBtn.onclick = function () {
      uiState.savingAsNew = true;
      uiState.newTemplateName = "";
      rerender();
    };
    templateRow.appendChild(saveNewBtn);
    templatePanel.appendChild(templateRow);

    if (uiState.savingAsNew) {
      var saveNewRow = document.createElement("div");
      saveNewRow.style.display = "flex";
      saveNewRow.style.alignItems = "center";
      saveNewRow.style.gap = "8px";
      saveNewRow.style.marginTop = "8px";

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Template name, e.g. “Client Report”";
      nameInput.value = uiState.newTemplateName;
      nameInput.oninput = function () {
        uiState.newTemplateName = nameInput.value;
      };
      saveNewRow.appendChild(nameInput);

      var confirmSaveBtn = document.createElement("button");
      confirmSaveBtn.className = "btn btn--primary";
      confirmSaveBtn.textContent = "Save";
      confirmSaveBtn.onclick = function () {
        var name = nameInput.value.trim();
        if (!name) {
          window.PCC.notify("Enter a template name.", "warning");
          return;
        }
        var newTemplate = window.PCC.store.newReportTemplate({
          report_type: uiState.reportType,
          name: name,
          sections: Object.assign({}, uiState.sections[uiState.reportType]),
        });
        window.PCC.store.update(function (d) {
          d.report_templates.push(newTemplate);
        });
        uiState.selectedTemplateId[uiState.reportType] = newTemplate.id;
        uiState.savingAsNew = false;
        window.PCC.notify("Template saved.", "success");
        rerender();
      };
      saveNewRow.appendChild(confirmSaveBtn);

      var cancelSaveBtn = document.createElement("button");
      cancelSaveBtn.className = "btn btn--ghost";
      cancelSaveBtn.textContent = "Cancel";
      cancelSaveBtn.onclick = function () {
        uiState.savingAsNew = false;
        rerender();
      };
      saveNewRow.appendChild(cancelSaveBtn);

      templatePanel.appendChild(saveNewRow);
    }

    var checkboxGrid = document.createElement("div");
    checkboxGrid.style.display = "grid";
    checkboxGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(200px, 1fr))";
    checkboxGrid.style.gap = "6px";
    checkboxGrid.style.marginTop = "10px";
    Object.keys(sectionKeys).forEach(function (key) {
      var label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      label.style.fontSize = "12px";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = uiState.sections[uiState.reportType][key];
      cb.onchange = function () {
        uiState.sections[uiState.reportType][key] = cb.checked;
        // The loaded template (if any) STAYS selected through edits — otherwise
        // "Save Changes" would disappear right when it's needed, the moment you tweak
        // a checkbox you meant to update the template with. "Save Changes" always
        // commits whatever the checkboxes currently read; "Save as New…" is how you
        // deliberately branch off into a different, separately-named template instead.
        rerender();
      };
      label.appendChild(cb);
      label.appendChild(document.createTextNode(sectionKeys[key]));
      checkboxGrid.appendChild(label);
    });
    templatePanel.appendChild(checkboxGrid);

    // Daily-Use Audit Phase 4: independent "last N days" window per chronological
    // section — Project Status Report only, since Portfolio has no section shaped like
    // Daily Log/Meetings/Documents (an open-ended log with its own date field, no
    // status to narrow it). See reportSectionDays' own uiState comment above.
    if (uiState.reportType === "project") {
      var REPORT_DAY_SECTION_LABELS = { dailyLog: "Daily Log", meetings: "Meetings", documents: "Documents" };
      var dayWindowRow = document.createElement("div");
      dayWindowRow.style.display = "flex";
      dayWindowRow.style.flexWrap = "wrap";
      dayWindowRow.style.alignItems = "center";
      dayWindowRow.style.gap = "12px";
      dayWindowRow.style.marginTop = "12px";
      dayWindowRow.style.paddingTop = "10px";
      dayWindowRow.style.borderTop = "1px solid var(--divider)";

      Object.keys(REPORT_DAY_SECTION_LABELS).forEach(function (key) {
        var wrap = document.createElement("label");
        wrap.style.display = "flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "6px";
        wrap.style.fontSize = "12px";
        var text = document.createElement("span");
        text.textContent = REPORT_DAY_SECTION_LABELS[key] + ":";
        wrap.appendChild(text);

        var daySelect = document.createElement("select");
        REPORT_DAY_WINDOW_OPTIONS.forEach(function (opt) {
          var optionEl = document.createElement("option");
          optionEl.value = opt.value;
          optionEl.textContent = opt.label;
          daySelect.appendChild(optionEl);
        });
        daySelect.value = uiState.reportSectionDays[key];
        daySelect.disabled = !uiState.sections.project[key];
        daySelect.onchange = function () {
          uiState.reportSectionDays[key] = daySelect.value;
          rerender();
        };
        wrap.appendChild(daySelect);
        dayWindowRow.appendChild(wrap);
      });

      templatePanel.appendChild(dayWindowRow);
    }

    outlet.appendChild(templatePanel);

    var reportWrap = document.createElement("div");
    reportWrap.className = "panel";

    if (uiState.reportType === "project") {
      if (projects.length === 0) {
        reportWrap.appendChild(emptyNote("Add a project in Portfolio first to generate a status report."));
      } else {
        var project = projects.find(function (p) { return p.id === uiState.projectId; }) || projects[0];
        reportWrap.appendChild(buildProjectReport(project, data, uiState.sections.project, uiState.reportSectionDays));
      }
    } else {
      reportWrap.appendChild(buildPortfolioReport(data, uiState.sections.portfolio));
    }

    outlet.appendChild(reportWrap);

    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }
  }

  window.PCC.pages.reports = render;
})();
