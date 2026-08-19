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

  var uiState = {
    reportType: "project", // "project" | "portfolio"
    projectId: "",
  };

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

  function buildProjectReport(project, data) {
    var doc = document.createElement("div");
    doc.className = "report-doc";

    var header = document.createElement("div");
    header.style.marginBottom = "18px";
    header.innerHTML =
      "<h2 style='margin-bottom:2px'>" + esc(project.name || "(unnamed project)") + "</h2>" +
      "<p class='text-secondary' style='font-size:12px;margin:0'>Project Status Report \u00b7 Generated " + today() + "</p>";
    doc.appendChild(header);

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

    // Risk / Issue / Opportunity Register
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

    // RFI / Technical Query
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

    // Change Orders
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

    // Meetings
    var meetings = data.meetings
      .filter(function (m) { return m.project_id === project.id; })
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
      "Meetings \u2014 " + meetings.length + " total \u00b7 " + openActions.length + " open action items, " + overdueActions.length + " overdue"
    );
    if (meetings.length === 0) {
      meetingSection.appendChild(emptyNote("No meetings logged."));
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

    // Daily Log
    var logs = data.daily_logs
      .filter(function (l) { return l.project_id === project.id; })
      .slice()
      .sort(function (a, b) { return (b.log_date || "").localeCompare(a.log_date || ""); });
    var incidentLogs = logs.filter(function (l) { return l.incidents && l.incidents.trim(); });
    var dailyLogSection = sectionEl("Daily Log \u2014 " + logs.length + " entries \u00b7 " + incidentLogs.length + " with incidents noted");
    if (logs.length === 0) {
      dailyLogSection.appendChild(emptyNote("No Daily Log entries."));
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

    // Documents
    var docs = data.documents.filter(function (d) { return d.project_id === project.id; });
    var docSection = sectionEl("Documents \u2014 " + docs.length + " on file");
    if (docs.length === 0) {
      docSection.appendChild(emptyNote("No documents on file."));
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

    return doc;
  }

  // --- Portfolio-Wide Summary Report ------------------------------------------------

  function buildPortfolioReport(data) {
    var doc = document.createElement("div");
    doc.className = "report-doc";

    var header = document.createElement("div");
    header.style.marginBottom = "18px";
    header.innerHTML =
      "<h2 style='margin-bottom:2px'>Portfolio Summary Report</h2>" +
      "<p class='text-secondary' style='font-size:12px;margin:0'>Generated " + today() + " \u00b7 " + data.projects.length + " projects</p>";
    doc.appendChild(header);

    var activeProjects = data.projects.filter(function (p) { return !p.archived; });

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

    var openRfis = data.rfis.filter(function (r) { return r.status !== "closed"; });
    var overdueRfis = data.rfis.filter(function (r) { return r.status === "open" && r.date_required && r.date_required < today(); });
    var rfiSection = sectionEl("RFI / Technical Query \u2014 " + openRfis.length + " open, " + overdueRfis.length + " overdue across portfolio");
    doc.appendChild(rfiSection);

    var openCos = data.change_orders.filter(function (co) { return co.status === "pending" || co.status === "approved"; });
    var pendingCos = data.change_orders.filter(function (co) { return co.status === "pending"; });
    var coSection = sectionEl("Change Orders \u2014 " + openCos.length + " open, " + pendingCos.length + " pending decision across portfolio");
    doc.appendChild(coSection);

    // Gate 28 (Document Control 14: Portfolio Compliance) \u2014 the final gate of the
    // 14-gate Document Control sub-spec. Same Available/Overdue/Required computation as
    // every Document Control gate since Gate 18 (portfolio.js/vendors.js/schedule.js/
    // dashboard.js/documentControlDashboard.js/executiveCenter.js all have their own
    // copy already; this is the seventh), reused here to complete the existing
    // portfolio-wide printable report rather than building a parallel one.
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
    if (!uiState.projectId && projects.length > 0) uiState.projectId = projects[0].id;
    projSelect.value = uiState.projectId;
    projSelect.style.display = uiState.reportType === "project" ? "" : "none";
    projSelect.onchange = function () {
      uiState.projectId = projSelect.value;
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

    var reportWrap = document.createElement("div");
    reportWrap.className = "panel";

    if (uiState.reportType === "project") {
      if (projects.length === 0) {
        reportWrap.appendChild(emptyNote("Add a project in Portfolio first to generate a status report."));
      } else {
        var project = projects.find(function (p) { return p.id === uiState.projectId; }) || projects[0];
        reportWrap.appendChild(buildProjectReport(project, data));
      }
    } else {
      reportWrap.appendChild(buildPortfolioReport(data));
    }

    outlet.appendChild(reportWrap);

    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }
  }

  window.PCC.pages.reports = render;
})();
