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

  // ---------------------------------------------------------------------------------
  // Redesign Gate 8: two cheap, CPM-free header vitals the brief's own Project
  // Workspace section explicitly asks for ("Schedule Status", "Key Milestone") — same
  // engine-free discipline this whole page already follows (see the file's own header
  // comment), so both are plain store filters, not new CPM-derived figures.
  // ---------------------------------------------------------------------------------

  /** Same "behind its own plan and likely needs a status/actuals update" rule myWork.js's
   * collectActivitiesToUpdate() already established (Gate 17) — reused as a single
   * boolean here rather than duplicating a second, slightly different heuristic. */
  function computeScheduleStatus(data, projectId) {
    var todayIso = today();
    var behind = data.activities.some(function (a) {
      if (a.project_id !== projectId) return false;
      if (a.activity_type !== "task" && a.activity_type !== "milestone") return false;
      return (
        (a.status === "not_started" && a.planned_start && a.planned_start < todayIso) ||
        (a.status === "in_progress" && a.planned_finish && a.planned_finish < todayIso)
      );
    });
    return behind ? "Behind Schedule" : "On Schedule";
  }

  /** The single soonest milestone (by early_start || planned_start, the same date-
   * preference convention Gate 5/My Work's own upcoming-milestone logic uses),
   * whether already overdue or still upcoming — whichever is most relevant right now.
   * Excludes completed milestones. Returns null when nothing qualifies (no schedule, or
   * every milestone is either complete or undated). */
  function computeKeyMilestone(data, projectId) {
    var scheduleIds = data.schedules
      .filter(function (s) { return s.project_id === projectId; })
      .map(function (s) { return s.id; });
    var candidates = data.activities
      .filter(function (a) {
        return scheduleIds.indexOf(a.schedule_id) !== -1 && a.activity_type === "milestone" && a.status !== "complete";
      })
      .map(function (a) { return { activity: a, date: a.early_start || a.planned_start }; })
      .filter(function (x) { return x.date; });
    candidates.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return candidates.length > 0 ? candidates[0] : null;
  }

  // Redesign Gate 8: replaces the old flat "8 primary buttons + a More overflow"
  // toolbar with the brief's own explicit Project Workspace grouping (PLANNING/
  // CONTROLS/MANAGEMENT/VENDORS/DOCUMENTS/REPORTS), reusing Gate 5's exact global-nav
  // group names/taxonomy (PLANNING & SCHEDULE, PROJECT CONTROLS, PROJECT MANAGEMENT,
  // SITE & KNOWLEDGE) rather than inventing a second, slightly different vocabulary for
  // the same modules — a user learns the grouping once and it applies both in the
  // sidebar and here. "OVERVIEW" isn't a group here (this page IS the overview) and
  // "SYSTEM" doesn't apply to a single project, so those two are dropped; Executive
  // Center stays a separate, prominent standalone link above the groups (it's the
  // project's own rollup dashboard, not a "module" the way Schedule/Cost/Risks are).
  //
  // Every item below is still only ones with a REAL per-project deep-link — Document
  // Types/Document Control Dashboard/Delay & Recovery Dashboard/Vendor Performance
  // Centre/Project Lookahead stay off this list entirely, same as before this gate,
  // because none of them expose a filterByProject()/viewProject() to land on (they're
  // genuine cross-project rollups, not linking in without real project scoping would be
  // misleading). Reports is a NEW addition — it was missing from the old nav entirely
  // despite being genuinely project-scoped since Gate 6 (Global Project Context) gave it
  // a shared-context default; see navigateToModule()'s own "reports" branch below.
  var NAV_GROUPS = [
    {
      label: "PLANNING & SCHEDULE",
      items: [{ key: "schedule", label: "Schedule" }],
    },
    {
      label: "PROJECT CONTROLS",
      items: [
        { key: "cost", label: "Cost Tracking" },
        { key: "commitments", label: "Commitments" },
        { key: "resources", label: "Resources" },
      ],
    },
    {
      label: "PROJECT MANAGEMENT",
      items: [
        { key: "risks", label: "Risks / Issues" },
        { key: "rfis", label: "RFI / TQ" },
        { key: "changeOrders", label: "Change Mgmt" },
        { key: "decisionRegister", label: "Decision Register" },
        { key: "meetings", label: "Meetings" },
      ],
    },
    {
      label: "VENDORS",
      items: [{ key: "vendors", label: "Vendors" }],
    },
    {
      label: "DOCUMENTS",
      items: [{ key: "documents", label: "Documents" }],
    },
    {
      label: "SITE & KNOWLEDGE",
      items: [
        { key: "dailylog", label: "Daily Log" },
        { key: "lessonsLearned", label: "Lessons Learned" },
        { key: "knowledgeBase", label: "Knowledge Base" },
      ],
    },
    {
      label: "REPORTING",
      items: [{ key: "reports", label: "Reports" }],
    },
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
    } else if (key === "reports") {
      // Redesign Gate 8: reports.js has no filterByProject()/viewProject() of its own —
      // Redesign Gate 6 already wired it to default from the shared project context on
      // every render, so setting that context directly is enough to land it on this
      // project, the same way the shell header's own PROJECT switcher does.
      window.PCC.projectContext.set(projectId);
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

  function vitalChip(label, value, colorVar) {
    var chip = document.createElement("div");
    chip.className = "card-stat";
    var valueStyle = colorVar ? ' style="color:var(' + colorVar + ')"' : "";
    chip.innerHTML =
      "<span class='card-stat__label'>" + esc(label) + "</span>" +
      "<span class='card-stat__value card-stat__value--text'" + valueStyle + ">" + esc(value) + "</span>";
    return chip;
  }

  function renderHeader(project, data, rerender) {
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

    // Redesign Gate 8: the brief's own "at the top show" vitals strip for the Project
    // Workspace header — Progress, Schedule Status, Key Milestone, Current Health.
    // Reuses the same .card-stat chip Portfolio's own project cards (Gate 3) and
    // Dashboard's Portfolio Exceptions panel (Gate 7) already established, rather than a
    // third stat-chip style. Progress/Health were already computed elsewhere on this
    // page (the KPI grid, the status badge above) — Schedule Status and Key Milestone
    // are the two genuinely new, CPM-free figures this gate adds (see their own helper
    // comments above).
    var scheduleStatus = computeScheduleStatus(data, project.id);
    var keyMilestone = computeKeyMilestone(data, project.id);

    var vitals = document.createElement("div");
    vitals.className = "project-card__stats";
    vitals.style.marginTop = "14px";
    vitals.style.paddingTop = "14px";
    vitals.style.borderTop = "1px solid var(--divider)";

    vitals.appendChild(vitalChip("PROGRESS", Math.max(0, Math.min(100, project.progress || 0)) + "%"));
    vitals.appendChild(
      vitalChip("SCHEDULE STATUS", scheduleStatus, scheduleStatus === "Behind Schedule" ? "--status-at-risk" : "--status-on-track")
    );
    vitals.appendChild(
      vitalChip(
        "KEY MILESTONE",
        keyMilestone ? (keyMilestone.activity.name || "(unnamed milestone)") + " · " + keyMilestone.date : "None scheduled"
      )
    );
    vitals.appendChild(
      vitalChip(
        "CURRENT HEALTH",
        STATUS_LABELS[project.status] || project.status,
        project.status === "critical" ? "--status-critical" : project.status === "at_risk" ? "--status-at-risk" : project.status === "complete" ? null : "--status-on-track"
      )
    );

    header.appendChild(vitals);
    return header;
  }

  // Redesign Gate 8: the module directory — replaces the old flat "8 primary buttons +
  // a More overflow" toolbar with the brief's own grouped Project Workspace layout (see
  // NAV_GROUPS's own comment above for the full reasoning). Rendered as one panel with a
  // labeled column per group, every item a plain `.card-menu__item` link (the same
  // component the old "More" dropdown already used, just always visible now instead of
  // hidden behind a click) — reuses an existing primitive rather than inventing new nav-
  // link styling. Executive Center stays a separate, prominent button above the groups.
  function renderNav(projectId, rerender) {
    var wrap = document.createElement("div");
    wrap.className = "no-print";
    wrap.style.marginBottom = "16px";

    var topRow = document.createElement("div");
    topRow.className = "toolbar";
    topRow.style.marginBottom = "12px";

    var overviewBtn = document.createElement("button");
    overviewBtn.className = "btn btn--primary";
    overviewBtn.textContent = "Overview";
    topRow.appendChild(overviewBtn);

    var execBtn = document.createElement("button");
    execBtn.className = "btn btn--ghost";
    execBtn.textContent = "Executive Center";
    execBtn.onclick = function () {
      navigateToModule("executiveCenter", projectId);
    };
    topRow.appendChild(execBtn);

    wrap.appendChild(topRow);

    var directory = document.createElement("div");
    directory.className = "panel";

    var grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(160px, 1fr))";
    grid.style.gap = "16px";

    NAV_GROUPS.forEach(function (group) {
      var col = document.createElement("div");

      var heading = document.createElement("p");
      heading.className = "text-secondary";
      heading.style.fontSize = "11px";
      heading.style.fontWeight = "600";
      heading.style.letterSpacing = "0.04em";
      heading.style.margin = "0 0 6px";
      heading.textContent = group.label;
      col.appendChild(heading);

      group.items.forEach(function (item) {
        var link = document.createElement("button");
        link.className = "card-menu__item";
        link.style.display = "block";
        link.style.width = "100%";
        link.textContent = item.label;
        link.onclick = function () {
          navigateToModule(item.key, projectId);
        };
        col.appendChild(link);
      });

      grid.appendChild(col);
    });

    directory.appendChild(grid);
    wrap.appendChild(directory);

    return wrap;
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
    // Redesign Gate 8: PROGRESS moved into the header's own vitals strip (see
    // renderHeader()) — dropped here rather than showing the identical figure twice.
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

    // Redesign Gate 6 (Global Project Context): follow the shared active project
    // whenever it's valid — see schedule.js's own comment on why this can't be
    // conditioned on "only when uiState.projectId is unset/invalid".
    var ctxProjectId = window.PCC.projectContext.get();
    if (ctxProjectId && activeProjects.some(function (p) { return p.id === ctxProjectId; })) {
      uiState.projectId = ctxProjectId;
    } else if (!uiState.projectId || !activeProjects.some(function (p) { return p.id === uiState.projectId; })) {
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
      window.PCC.projectContext.set(uiState.projectId);
      rerender();
    };
    switcher.appendChild(projSelect);
    outlet.appendChild(switcher);

    var project = data.projects.find(function (p) {
      return p.id === uiState.projectId;
    });

    outlet.appendChild(renderHeader(project, data, rerender));
    outlet.appendChild(renderNav(project.id, rerender));
    renderOverview(outlet, data, project, rerender);
  }

  window.PCC.pages.projectWorkspace = render;
  window.PCC.projectWorkspace = {
    viewProject: function (projectId) {
      uiState.projectId = projectId;
      window.PCC.projectContext.set(projectId);
    },
  };
})();
