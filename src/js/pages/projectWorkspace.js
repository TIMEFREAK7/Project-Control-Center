(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  /** UI/UX Overhaul Gate 4: Project Workspace. When a project is "opened" it becomes a
   * dedicated, project-scoped hub rather than a giant vertical page — a header, a row of
   * project-level navigation, and an Overview answering "what's happening with this
   * project?" in seconds (health tiles, Management Attention, Upcoming, Recent Activity).
   *
   * Deliberately CPM-engine-free (matches Gate 3's own "don't invoke the heavy engine
   * where a cheap real number will do" discipline, confirmed with Aditya during Gate 4
   * scoping): every figure here is a plain, cheap store filter. A true CPM-derived
   * Forecast Finish, schedule performance score, and progress chart are NOT duplicated
   * here — Executive Center already builds all three in full and is one nav click away.
   * That's a deliberate scope line, not an oversight — see the "More CPM-dependent
   * figures" note below each section that would otherwise want one.
   *
   * Non-Overview nav items never render inside this page — clicking one calls that
   * module's own existing filterByProject()/viewProject() hand-off function (the same
   * convention Portfolio/Executive Center already use to agree on "which project" across
   * page boundaries) and then routes there. schedule.js gained a matching viewProject()
   * back in Gate 4 (it only had viewActivity/viewBaselines, which require a scheduleId
   * the Workspace doesn't have — see schedule.js's own comment); the Documents nav item
   * now also lands pre-filtered, via documents.js's own filterByProject() added in
   * Gate 6 (Documents was the last register with no project-filter concept at all). */

  var STATUS_LABELS = {
    on_track: "On Track",
    at_risk: "At Risk",
    critical: "Critical",
    complete: "Complete",
  };

  // Same probability×impact matrix risks.js uses for severityOf() — duplicated per this
  // app's established per-module-helpers convention (see e.g. executiveCenter.js's own
  // riskSeverity()) rather than reaching into another page's private closure.
  var SEVERITY_MATRIX = {
    high: { low: "medium", medium: "high", high: "high" },
    medium: { low: "low", medium: "medium", high: "high" },
    low: { low: "low", medium: "low", high: "medium" },
  };

  var uiState = {
    projectId: null,
  };

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s === null || s === undefined ? "" : String(s);
    return div.innerHTML;
  }

  function fmtMoney(value, currency) {
    if (value === null || value === undefined || value === "") return "—";
    var num = Number(value);
    if (Number.isNaN(num)) return "—";
    return (currency ? currency + " " : "") + num.toLocaleString();
  }

  function riskSeverity(r) {
    return SEVERITY_MATRIX[r.probability] ? SEVERITY_MATRIX[r.probability][r.impact] : "medium";
  }

  // Primary project-level nav row + a "More" overflow, mapped onto modules that actually
  // exist and are actually project-scoped (Vendors/Document Types/Document Control
  // Dashboard/Delay & Recovery Dashboard are cross-project rollups with no per-project
  // deep-link — Vendors is the one of those with a real filterByProject(), so it's in
  // More; the other three are left off the Workspace nav entirely rather than linking
  // in without real project scoping).
  var PRIMARY_NAV = [
    { key: "executiveCenter", label: "Executive Center" },
    { key: "schedule", label: "Schedule" },
    { key: "documents", label: "Documents" },
    { key: "cost", label: "Cost Tracking" },
    { key: "risks", label: "Risks" },
    { key: "rfis", label: "RFI / TQ" },
    { key: "meetings", label: "Meetings" },
    { key: "changeOrders", label: "Changes" },
  ];
  var MORE_NAV = [
    { key: "dailylog", label: "Daily Log" },
    { key: "decisionRegister", label: "Decision Register" },
    { key: "lessonsLearned", label: "Lessons Learned" },
    { key: "knowledgeBase", label: "Knowledge Base" },
    { key: "commitments", label: "Commitments" },
    { key: "resources", label: "Resources" },
    { key: "vendors", label: "Vendors" },
  ];

  function navigateToModule(key, projectId) {
    if (key === "executiveCenter" && window.PCC.executiveCenter) {
      window.PCC.executiveCenter.viewProject(projectId);
    } else if (key === "documents" && window.PCC.files) {
      // UI/UX Overhaul Gate 6: documents.js exports as window.PCC.files (not
      // window.PCC.documents), so it needs its own branch here rather than falling into
      // the generic window.PCC[key] lookup below — it now has a real filterByProject()
      // (the gap this comment used to describe is closed).
      window.PCC.files.filterByProject(projectId);
    } else if (window.PCC[key] && typeof window.PCC[key].filterByProject === "function") {
      window.PCC[key].filterByProject(projectId);
    } else if (window.PCC[key] && typeof window.PCC[key].viewProject === "function") {
      window.PCC[key].viewProject(projectId);
    }
    window.PCC.router.go(key);
  }

  // ---------------------------------------------------------------------------------
  // Cheap per-project figures — plain store filters, no CPM engine. Extends the same
  // fields Gate 3's portfolio card stat chips already compute (open risks/RFIs/document
  // availability) with the extra detail Management Attention needs (which requirements
  // are actually overdue, not just the available/total count).
  // ---------------------------------------------------------------------------------

  function projectStats(data, projectId) {
    var todayIso = today();
    var projectRisks = data.risks.filter(function (r) {
      return r.project_id === projectId;
    });
    var openRisks = projectRisks.filter(function (r) {
      return r.status !== "closed";
    });
    var criticalRisks = openRisks.filter(function (r) {
      return riskSeverity(r) === "high";
    });

    var projectRfis = data.rfis.filter(function (r) {
      return r.project_id === projectId;
    });
    var openRfis = projectRfis.filter(function (r) {
      return r.status !== "closed";
    });
    var overdueRfis = openRfis.filter(function (r) {
      return r.date_required && r.date_required < todayIso;
    });

    var docTypesById = {};
    data.document_types.forEach(function (t) {
      docTypesById[t.id] = t;
    });
    var requirements = data.project_document_requirements.filter(function (r) {
      return r.project_id === projectId && docTypesById[r.document_type_id];
    });
    var overdueDocs = [];
    var docsAvailable = 0;
    requirements.forEach(function (r) {
      var available = data.documents.some(function (d) {
        return d.project_id === projectId && d.document_type_id === r.document_type_id;
      });
      if (available) {
        docsAvailable++;
      } else if (r.planned_submission_date && r.planned_submission_date < todayIso) {
        overdueDocs.push(docTypesById[r.document_type_id].name);
      }
    });

    var pendingChangeOrders = data.change_orders.filter(function (co) {
      return co.project_id === projectId && co.status === "pending";
    });

    var overdueMeetingActions = [];
    data.meetings
      .filter(function (m) {
        return m.project_id === projectId;
      })
      .forEach(function (m) {
        (m.actions || []).forEach(function (a) {
          if (a.status === "open" && a.due_date && a.due_date < todayIso) {
            overdueMeetingActions.push({ meetingId: m.id, meetingTitle: m.title || "(untitled)", description: a.description });
          }
        });
      });

    var costSummary = window.PCC.cost
      ? window.PCC.cost.projectCostSummary(data, projectId)
      : { budgeted: 0, actual: 0 };

    return {
      openRisks: openRisks.length,
      criticalRisks: criticalRisks,
      openRfis: openRfis.length,
      overdueRfis: overdueRfis,
      docsAvailable: docsAvailable,
      docsTotal: requirements.length,
      overdueDocs: overdueDocs,
      pendingChangeOrders: pendingChangeOrders,
      overdueMeetingActions: overdueMeetingActions,
      costSummary: costSummary,
    };
  }

  // ---------------------------------------------------------------------------------
  // Management Attention — first real adoption of Gate 1's .attention-list/.attention-
  // item primitive. Deliberately a NARROWER set than Executive Center's own Diagnostics/
  // Management Action List: everything here is CPM-free (critical risks, overdue RFIs,
  // pending change orders, overdue meeting actions, overdue document requirements, a
  // cost overrun warning). Delayed/critical activities and slipped milestones need the
  // CPM engine and are Executive Center's job, not duplicated here.
  // ---------------------------------------------------------------------------------

  function buildAttentionItems(stats, projectId) {
    var items = [];
    stats.criticalRisks.forEach(function (r) {
      items.push({ severity: "critical", text: "Critical " + (r.type === "issue" ? "issue" : "risk") + ": " + r.title, nav: "risks" });
    });
    if (stats.costSummary.budgeted > 0 && stats.costSummary.actual > stats.costSummary.budgeted) {
      items.push({ severity: "critical", text: "Cost warning: actual cost exceeds budget", nav: "cost" });
    }
    stats.overdueRfis.forEach(function (r) {
      items.push({ severity: "warning", text: "Overdue RFI/TQ: " + r.number + " " + r.subject, nav: "rfis" });
    });
    if (stats.overdueDocs.length > 0) {
      items.push({ severity: "warning", text: "Overdue document" + (stats.overdueDocs.length > 1 ? "s" : "") + ": " + stats.overdueDocs.join(", "), nav: "documents" });
    }
    stats.overdueMeetingActions.forEach(function (a) {
      items.push({ severity: "warning", text: "Outstanding action (" + a.meetingTitle + "): " + a.description, nav: "meetings" });
    });
    stats.pendingChangeOrders.forEach(function (co) {
      items.push({ severity: "info", text: "Pending approval: " + co.number + " " + co.title, nav: "changeOrders" });
    });
    return items;
  }

  function renderAttentionPanel(items, projectId) {
    var panel = document.createElement("div");
    panel.className = "panel";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "10px";
    heading.textContent = "Management Attention (" + items.length + ")";
    panel.appendChild(heading);

    if (items.length === 0) {
      var okP = document.createElement("p");
      okP.className = "text-secondary";
      okP.style.fontSize = "13px";
      okP.style.margin = "0";
      okP.textContent = "Nothing outstanding.";
      panel.appendChild(okP);
      return panel;
    }

    var list = document.createElement("div");
    list.className = "attention-list";
    items.forEach(function (i) {
      var row = document.createElement("div");
      row.className = "attention-item attention-item--clickable";
      row.onclick = function () {
        navigateToModule(i.nav, projectId);
      };

      var icon = document.createElement("span");
      icon.className = "attention-item__icon attention-item__icon--" + i.severity;
      row.appendChild(icon);

      var body = document.createElement("div");
      body.className = "attention-item__body";
      var text = document.createElement("div");
      text.className = "attention-item__text";
      text.textContent = i.text;
      body.appendChild(text);
      row.appendChild(body);

      list.appendChild(row);
    });
    panel.appendChild(list);
    return panel;
  }

  // ---------------------------------------------------------------------------------
  // Upcoming — milestones (planned_start, no CPM refinement: the same fallback
  // Executive Center's own upcomingMilestones already uses whenever no CPM has run for
  // that schedule), meetings, RFIs due soon. Window matches Action Centre/Dashboard's
  // own configurable lookahead setting rather than a third hardcoded number.
  // ---------------------------------------------------------------------------------

  function buildUpcomingItems(data, projectId, windowDays) {
    var todayIso = today();
    var cutoff = window.PCC.scheduleGanttLayout.addDays(todayIso, windowDays);
    var items = [];

    var projectSchedules = data.schedules.filter(function (s) {
      return s.project_id === projectId;
    });
    var scheduleIds = projectSchedules.map(function (s) {
      return s.id;
    });
    data.activities
      .filter(function (a) {
        return scheduleIds.indexOf(a.schedule_id) !== -1 && a.activity_type === "milestone";
      })
      .forEach(function (a) {
        if (a.planned_start && a.planned_start >= todayIso && a.planned_start <= cutoff) {
          items.push({ date: a.planned_start, text: "Milestone: " + a.name });
        }
      });

    data.meetings
      .filter(function (m) {
        return m.project_id === projectId && m.meeting_date && m.meeting_date >= todayIso && m.meeting_date <= cutoff;
      })
      .forEach(function (m) {
        items.push({ date: m.meeting_date, text: "Meeting: " + (m.title || "(untitled)") });
      });

    data.rfis
      .filter(function (r) {
        return r.project_id === projectId && r.status !== "closed" && r.date_required && r.date_required >= todayIso && r.date_required <= cutoff;
      })
      .forEach(function (r) {
        items.push({ date: r.date_required, text: "RFI Due: " + r.number + " " + r.subject });
      });

    items.sort(function (a, b) {
      return a.date < b.date ? -1 : 1;
    });
    return items;
  }

  // ---------------------------------------------------------------------------------
  // Recent Activity — same cross-module "recently updated" feed Executive Center's own
  // renderRecentActivityPanel already builds, copied here since it needs no CPM (it only
  // reads updated_at/uploaded_at timestamps).
  // ---------------------------------------------------------------------------------

  function buildRecentActivity(data, projectId) {
    var items = [];
    data.risks
      .filter(function (r) { return r.project_id === projectId; })
      .forEach(function (r) { items.push({ date: r.updated_at, text: (r.type === "risk" ? "Risk" : r.type === "issue" ? "Issue" : "Opportunity") + " “" + r.title + "” " + (r.status === "closed" ? "closed" : "logged/updated") }); });
    data.meetings
      .filter(function (m) { return m.project_id === projectId; })
      .forEach(function (m) { items.push({ date: m.updated_at, text: "Meeting “" + (m.title || "(untitled)") + "” logged" }); });
    data.rfis
      .filter(function (r) { return r.project_id === projectId; })
      .forEach(function (r) { items.push({ date: r.updated_at, text: r.number + " " + (r.status === "answered" ? "answered" : r.status === "closed" ? "closed" : "submitted") }); });
    data.change_orders
      .filter(function (co) { return co.project_id === projectId; })
      .forEach(function (co) { items.push({ date: co.updated_at, text: co.number + " " + co.status }); });
    data.documents
      .filter(function (d) { return d.project_id === projectId; })
      .forEach(function (d) { items.push({ date: d.uploaded_at, text: "Document “" + d.filename + "” uploaded" }); });
    data.daily_logs
      .filter(function (l) { return l.project_id === projectId; })
      .forEach(function (l) { items.push({ date: l.updated_at || l.created_at, text: "Daily Log entry for " + l.log_date }); });

    return items
      .filter(function (i) { return i.date; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); })
      .slice(0, 10);
  }

  function listPanel(title, items, dateMono) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.flex = "1 1 320px";
    panel.style.minWidth = "280px";

    var h = document.createElement("h4");
    h.style.marginBottom = "10px";
    h.textContent = title;
    panel.appendChild(h);

    if (items.length === 0) {
      var p = document.createElement("p");
      p.className = "text-secondary";
      p.style.fontSize = "13px";
      p.textContent = "Nothing to show.";
      panel.appendChild(p);
      return panel;
    }

    var list = document.createElement("div");
    items.forEach(function (i) {
      var row = document.createElement("div");
      row.style.fontSize = "12px";
      row.style.marginBottom = "6px";
      var dateSpan = dateMono
        ? "<span class='mono text-secondary'>" + esc(i.date) + "</span>"
        : "<span class='text-secondary'>" + new Date(i.date).toLocaleDateString() + "</span>";
      row.innerHTML = dateSpan + " — " + esc(i.text);
      list.appendChild(row);
    });
    panel.appendChild(list);
    return panel;
  }

  // ---------------------------------------------------------------------------------
  // Header + nav
  // ---------------------------------------------------------------------------------

  function renderHeader(project, rerender) {
    var header = document.createElement("div");
    header.className = "panel";
    header.style.marginBottom = "16px";

    var top = document.createElement("div");
    top.style.display = "flex";
    top.style.justifyContent = "space-between";
    top.style.alignItems = "flex-start";
    top.style.flexWrap = "wrap";
    top.style.gap = "10px";

    var left = document.createElement("div");
    left.innerHTML =
      "<h2 style='margin-bottom:4px;'>" + esc(project.name || "(unnamed project)") + "</h2>" +
      "<div class='text-secondary' style='font-size:13px;'>" +
      [project.client, project.company, project.country].filter(Boolean).map(esc).join(" · ") +
      "</div>";
    top.appendChild(left);

    var badge = document.createElement("span");
    badge.className = "status-badge status-badge--" + project.status;
    badge.textContent = STATUS_LABELS[project.status] || project.status;
    top.appendChild(badge);

    header.appendChild(top);
    return header;
  }

  function renderNav(projectId, rerender) {
    var nav = document.createElement("div");
    nav.className = "toolbar no-print";
    nav.style.marginBottom = "16px";
    nav.style.flexWrap = "wrap";

    var overviewBtn = document.createElement("button");
    overviewBtn.className = "btn btn--primary";
    overviewBtn.textContent = "Overview";
    nav.appendChild(overviewBtn);

    PRIMARY_NAV.forEach(function (t) {
      var btn = document.createElement("button");
      btn.className = "btn btn--ghost";
      btn.textContent = t.label;
      btn.onclick = function () {
        navigateToModule(t.key, projectId);
      };
      nav.appendChild(btn);
    });

    var moreWrap = document.createElement("div");
    moreWrap.className = "card-menu";
    var moreBtn = document.createElement("button");
    moreBtn.className = "btn btn--ghost";
    moreBtn.textContent = "More ⌄";
    moreBtn.onclick = function () {
      uiState.moreOpen = !uiState.moreOpen;
      rerender();
    };
    moreWrap.appendChild(moreBtn);

    if (uiState.moreOpen) {
      var overlay = document.createElement("button");
      overlay.className = "card-menu__overlay";
      overlay.setAttribute("aria-label", "Close menu");
      overlay.onclick = function () {
        uiState.moreOpen = false;
        rerender();
      };
      moreWrap.appendChild(overlay);

      var dropdown = document.createElement("div");
      dropdown.className = "card-menu__dropdown";
      MORE_NAV.forEach(function (t) {
        var item = document.createElement("button");
        item.className = "card-menu__item";
        item.textContent = t.label;
        item.onclick = function () {
          navigateToModule(t.key, projectId);
        };
        dropdown.appendChild(item);
      });
      moreWrap.appendChild(dropdown);
    }

    nav.appendChild(moreWrap);
    return nav;
  }

  function kpiCard(label, value, colorVar) {
    var card = document.createElement("div");
    card.className = "kpi-card";
    var valueStyle = colorVar ? ' style="color:var(' + colorVar + ')"' : "";
    card.innerHTML =
      '<span class="kpi-card__label">' + esc(label) + '</span><span class="kpi-card__value mono"' + valueStyle + ">" + esc(value) + "</span>";
    return card;
  }

  function renderOverview(outlet, data, project, rerender) {
    var stats = projectStats(data, project.id);

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";
    kpiGrid.appendChild(kpiCard("PROGRESS", Math.max(0, Math.min(100, project.progress || 0)) + "%"));
    kpiGrid.appendChild(kpiCard("FINISH", project.finish_date || "—"));
    kpiGrid.appendChild(kpiCard("BUDGET", fmtMoney(project.budget, project.currency)));
    kpiGrid.appendChild(kpiCard("OPEN RISKS / ISSUES", stats.openRisks, stats.openRisks > 0 ? "--status-at-risk" : null));
    kpiGrid.appendChild(kpiCard("OPEN RFIs / TQs", stats.openRfis, stats.overdueRfis.length > 0 ? "--status-critical" : null));
    kpiGrid.appendChild(kpiCard("DOCUMENTS", stats.docsAvailable + "/" + stats.docsTotal));
    outlet.appendChild(kpiGrid);

    var attentionItems = buildAttentionItems(stats, project.id);
    var attentionPanel = renderAttentionPanel(attentionItems, project.id);
    attentionPanel.style.marginTop = "16px";
    outlet.appendChild(attentionPanel);

    var windowDays = (data.settings && data.settings.action_centre_upcoming_days) || 30;
    var upcoming = buildUpcomingItems(data, project.id, windowDays);
    var recent = buildRecentActivity(data, project.id);

    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "16px";
    row.style.flexWrap = "wrap";
    row.style.marginTop = "16px";
    row.appendChild(listPanel("Upcoming (next " + windowDays + " days)", upcoming, true));
    row.appendChild(listPanel("Recent Activity", recent, false));
    outlet.appendChild(row);
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();
    var activeProjects = data.projects.filter(function (p) {
      return !p.archived;
    });

    var h1 = document.createElement("h2");
    h1.textContent = "Project Workspace";
    h1.style.marginBottom = "6px";
    outlet.appendChild(h1);

    if (activeProjects.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "Add a project in Portfolio first to open its Workspace.";
      outlet.appendChild(empty);
      return;
    }

    if (!uiState.projectId || !activeProjects.some(function (p) { return p.id === uiState.projectId; })) {
      uiState.projectId = activeProjects[0].id;
    }

    var switcher = document.createElement("div");
    switcher.className = "toolbar no-print";
    switcher.style.marginBottom = "10px";
    var projSelect = document.createElement("select");
    activeProjects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projSelect.appendChild(opt);
    });
    projSelect.value = uiState.projectId;
    projSelect.onchange = function () {
      uiState.projectId = projSelect.value;
      uiState.moreOpen = false;
      rerender();
    };
    switcher.appendChild(projSelect);
    outlet.appendChild(switcher);

    var project = data.projects.find(function (p) {
      return p.id === uiState.projectId;
    });

    outlet.appendChild(renderHeader(project, rerender));
    outlet.appendChild(renderNav(project.id, rerender));
    renderOverview(outlet, data, project, rerender);
  }

  window.PCC.pages.projectWorkspace = render;
  window.PCC.projectWorkspace = {
    viewProject: function (projectId) {
      uiState.projectId = projectId;
      uiState.moreOpen = false;
    },
  };
})();
