(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var STATUS_LABELS = {
    on_track: "On Track",
    at_risk: "At Risk",
    critical: "Critical",
    complete: "Complete",
  };

  // PCC Evolution Roadmap, Tier 3 ("final polish"): Dashboard-level filtering. Same
  // filter set as Portfolio's own (Gate 16) — Client/Country/Sector/PM/Planner/Type/
  // Year — confirmed via AskUserQuestion, so switching between the two pages never
  // drops a filter option a user just got used to. Persists per session (module-level
  // state, like every other page's uiState), resets on reload.
  var uiState = {
    clientFilter: "",
    countryFilter: "",
    sectorFilter: "",
    pmFilter: "",
    plannerFilter: "",
    typeFilter: "",
    yearFilter: "", // filters by start_date's year
    // Daily-Use Audit Phase 2: live-syncs with the shared Global Project Context
    // (Redesign Gate 6) — see render()'s own comment for why this isn't just a
    // seed-once flag. Exposed as a dismissible banner rather than an 8th filter
    // dropdown, since this page's filter row deliberately mirrors Portfolio's own
    // attribute set (client/country/sector/etc, confirmed via AskUserQuestion at Tier
    // 3) — a project-identity filter is a different kind of narrowing than those.
    projectFilter: "",
    lastSyncedContextId: undefined,
  };

  function projectMatchesFilters(p) {
    if (uiState.clientFilter && p.client !== uiState.clientFilter) return false;
    if (uiState.countryFilter && p.country !== uiState.countryFilter) return false;
    if (uiState.sectorFilter && p.sector !== uiState.sectorFilter) return false;
    if (uiState.pmFilter && p.project_manager !== uiState.pmFilter) return false;
    if (uiState.plannerFilter && p.planner !== uiState.plannerFilter) return false;
    if (uiState.typeFilter && p.project_type !== uiState.typeFilter) return false;
    if (uiState.yearFilter && (p.start_date || "").slice(0, 4) !== uiState.yearFilter) return false;
    return true;
  }

  // Duplicated from portfolio.js verbatim per this app's per-module-helpers
  // convention — every option list is built from the FULL project set passed in, not
  // whatever's currently filtered, so narrowing one filter never removes another
  // filter's own options.
  function distinctValues(projects, key) {
    var seen = {};
    var out = [];
    projects.forEach(function (p) {
      var v = p[key];
      if (v && !seen[v]) {
        seen[v] = true;
        out.push(v);
      }
    });
    out.sort();
    return out;
  }

  // Gate 11 (Document Control 11: Reminders/Notifications). This app is a single
  // offline file:// deliverable with no server and no channel for real push/email —
  // the Dashboard, as the first thing seen on open, is the in-app equivalent of a
  // notification surface. Same "Available"/"Overdue"/"Required" status computation as
  // portfolio.js/vendors.js/schedule.js's own copies, duplicated per this app's
  // per-module-helpers convention.
  //
  // PCC Evolution Roadmap, Tier 3 ("final polish"): this used to be a hardcoded
  // constant — now reads data.settings.document_reminder_due_soon_days (edited on the
  // Settings page), defaulting to the same 14 this constant always was.
  function dueSoonWindowDays(data) {
    return data.settings.document_reminder_due_soon_days == null ? 14 : data.settings.document_reminder_due_soon_days;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }
  function addDaysIso(isoDateStr, days) {
    var d = new Date(isoDateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function computeRequirementStatus(data, projectId, documentTypeId, plannedDate) {
    var available = data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at;
    });
    if (available) return "available";
    if (plannedDate && plannedDate < todayIso()) return "overdue";
    return "required";
  }
  var REQUIREMENT_STATUS_BADGE = {
    available: { className: "complete", label: "Available" },
    overdue: { className: "critical", label: "Overdue" },
    required: { className: "at_risk", label: "Required" },
  };

  /** Every document requirement, across ALL active (non-archived) projects, that's
   * either already Overdue or Required with a due date inside the configurable
   * dueSoonWindowDays() window. Available requirements never surface here — nothing to
   * remind about. Requirements with no due date at all are excluded too (nothing time-
   * sensitive to flag), same as Overdue/Vendor Lookahead's own treatment of "no due
   * date set." Sorted soonest-due-first — a single ascending date sort already puts
   * every Overdue row (whose date is in the past) ahead of every Due Soon row (whose
   * date is today or later), so no separate grouping pass is needed. */
  function computeReminders(data, activeProjects) {
    var typesById = {};
    data.document_types.forEach(function (t) {
      typesById[t.id] = t;
    });
    var projectsById = {};
    activeProjects.forEach(function (p) {
      projectsById[p.id] = p;
    });
    var dueSoonCutoff = addDaysIso(todayIso(), dueSoonWindowDays(data));

    var reminders = data.project_document_requirements
      .filter(function (r) {
        return projectsById[r.project_id] && typesById[r.document_type_id];
      })
      .map(function (r) {
        return { row: r, status: computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date) };
      })
      .filter(function (x) {
        if (x.status === "available") return false;
        if (x.status === "overdue") return true;
        return x.row.planned_submission_date && x.row.planned_submission_date <= dueSoonCutoff;
      });

    reminders.sort(function (a, b) {
      return a.row.planned_submission_date.localeCompare(b.row.planned_submission_date);
    });

    return reminders;
  }

  // Redesign Gate 7 (Dashboard + My Work + Action Centre Redesign): the brief's own
  // Dashboard section explicitly asks for Open Risks/Issues, Pending RFIs, Pending
  // Decisions, Delayed Projects, and Upcoming Milestones alongside the existing project-
  // status/document-reminder KPIs — none of these were visible anywhere on this page
  // before this gate. Cheap portfolio-wide counts computed directly from the store, same
  // "status !== closed" open-record convention portfolio.js's own project-card stat
  // chips already established (not this file's own invention) — kept in exact agreement
  // with what a project's own card already shows. Delayed Projects reuses Executive
  // Center's exported getSchedulePerformanceSummary() (its own unaddressedDelayDays
  // figure, the same one Gate 26 defined) rather than a new delay heuristic.
  function countPortfolioExceptions(data, activeProjects) {
    var activeProjectIds = {};
    activeProjects.forEach(function (p) {
      activeProjectIds[p.id] = true;
    });
    var openRisks = 0;
    var openIssues = 0;
    data.risks.forEach(function (r) {
      if (!activeProjectIds[r.project_id] || r.status === "closed") return;
      if (r.type === "risk") openRisks++;
      else if (r.type === "issue") openIssues++;
    });
    var pendingRfis = data.rfis.filter(function (r) {
      return activeProjectIds[r.project_id] && r.status !== "closed";
    }).length;
    var pendingDecisions = data.decisions.filter(function (d) {
      return activeProjectIds[d.project_id] && d.status === "pending";
    }).length;

    var today = todayIso();
    var weekEnd = addDaysIso(today, 7);
    var upcomingMilestones = data.activities.filter(function (a) {
      if (!activeProjectIds[a.project_id] || a.activity_type !== "milestone" || a.status === "complete") return false;
      var date = a.early_start || a.planned_start;
      return date && date >= today && date <= weekEnd;
    }).length;

    var delayedProjects = 0;
    if (window.PCC.executiveCenter && window.PCC.executiveCenter.getSchedulePerformanceSummary) {
      activeProjects.forEach(function (p) {
        var summary = window.PCC.executiveCenter.getSchedulePerformanceSummary(p.id);
        if (summary.unaddressedDelayDays > 0) delayedProjects++;
      });
    }

    // Gate G (Planning & Scheduling-Centric Delay Management: Dashboard & Lookahead
    // integration) — portfolio-wide rollup of the new Delay Management model (status
    // lifecycle + delayImpactEngine's float-derived criticality), via the same "export
    // one composed function" convention delayedProjects above already uses. Deliberately
    // separate from delayedProjects: that's the pre-existing delay-days-minus-recovery-
    // days gap metric (Gate 26), this is "how many delays are still being tracked, and
    // how many of those are currently critical" — a different, complementary question.
    var openDelays = 0;
    var criticalDelays = 0;
    if (window.PCC.executiveCenter && window.PCC.executiveCenter.getDelayImpactSummary) {
      activeProjects.forEach(function (p) {
        var summary = window.PCC.executiveCenter.getDelayImpactSummary(p.id);
        openDelays += summary.openDelayCount;
        criticalDelays += summary.criticalDelayCount;
      });
    }

    return {
      openRisks: openRisks,
      openIssues: openIssues,
      pendingRfis: pendingRfis,
      pendingDecisions: pendingDecisions,
      upcomingMilestones: upcomingMilestones,
      delayedProjects: delayedProjects,
      openDelays: openDelays,
      criticalDelays: criticalDelays,
    };
  }

  function renderPortfolioExceptionsPanel(exceptions) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "10px";
    heading.textContent = "Portfolio Exceptions";
    panel.appendChild(heading);

    var row = document.createElement("div");
    row.className = "project-card__stats";

    [
      { label: "Open Risks", value: exceptions.openRisks, route: "risks" },
      { label: "Open Issues", value: exceptions.openIssues, route: "risks" },
      { label: "Pending RFIs / TQs", value: exceptions.pendingRfis, route: "rfis" },
      { label: "Pending Decisions", value: exceptions.pendingDecisions, route: "decisionRegister" },
      { label: "Milestones Due (7d)", value: exceptions.upcomingMilestones, route: "projectLookahead" },
      { label: "Delayed Projects", value: exceptions.delayedProjects, route: "delayRecoveryDashboard" },
      { label: "Open Delays", value: exceptions.openDelays, route: "delayRecoveryDashboard" },
      { label: "Critical Delays", value: exceptions.criticalDelays, route: "delayRecoveryDashboard" },
    ].forEach(function (stat) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "card-stat card-stat--link";
      var valueStyle = stat.value > 0 ? ' style="color:var(--status-at-risk)"' : "";
      chip.innerHTML =
        "<span class='card-stat__label'>" + stat.label + "</span>" +
        "<span class='card-stat__value'" + valueStyle + ">" + stat.value + "</span>";
      chip.onclick = function () {
        window.PCC.router.go(stat.route);
      };
      row.appendChild(chip);
    });

    panel.appendChild(row);
    return panel;
  }

  // Gate 31 (PCC Evolution Roadmap Gate 3: Management Attention). Reuses Executive
  // Center's existing rule-based diagnostics (via its exported getDiagnostics(projectId)
  // — see that file's own comment for why this is a composed export rather than a
  // duplicated context builder), run for every active project instead of just one.
  // Scoped to Critical + Warning severities only — Info-level detail (near-critical
  // activities, pending Change Orders) stays visible in Executive Center's own
  // per-project Diagnostics panel, not duplicated here, so this stays high-signal rather
  // than becoming a portfolio-wide firehose of every low-urgency note.
  function computeManagementAttention(data, activeProjects) {
    var groups = [];
    activeProjects.forEach(function (p) {
      if (!window.PCC.executiveCenter || !window.PCC.executiveCenter.getDiagnostics) return;
      var alerts = window.PCC.executiveCenter.getDiagnostics(p.id).filter(function (a) {
        return a.severity === "critical" || a.severity === "warning";
      });
      if (alerts.length === 0) return;
      var criticalCount = alerts.filter(function (a) {
        return a.severity === "critical";
      }).length;
      groups.push({ project: p, alerts: alerts, criticalCount: criticalCount, warningCount: alerts.length - criticalCount });
    });
    groups.sort(function (a, b) {
      if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount;
      if (a.warningCount !== b.warningCount) return b.warningCount - a.warningCount;
      return (a.project.name || "").localeCompare(b.project.name || "");
    });
    return groups;
  }

  function renderManagementAttentionPanel(groups) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var totalAlerts = groups.reduce(function (sum, g) {
      return sum + g.alerts.length;
    }, 0);
    if (totalAlerts > 0) panel.style.borderColor = "var(--status-critical)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "10px";
    heading.textContent = "Management Attention (" + totalAlerts + ")";
    panel.appendChild(heading);

    if (groups.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.margin = "0";
      empty.textContent = "No critical or warning conditions across the active portfolio right now.";
      panel.appendChild(empty);
      return panel;
    }

    groups.forEach(function (g) {
      var group = document.createElement("div");
      group.style.marginBottom = "12px";

      var groupHeader = document.createElement("div");
      groupHeader.style.display = "flex";
      groupHeader.style.justifyContent = "space-between";
      groupHeader.style.alignItems = "center";
      groupHeader.style.marginBottom = "4px";

      var projectName = document.createElement("span");
      projectName.style.fontWeight = "600";
      projectName.style.fontSize = "13px";
      projectName.textContent = g.project.name || "(unnamed project)";
      groupHeader.appendChild(projectName);

      var viewBtn = document.createElement("button");
      viewBtn.className = "btn btn--ghost";
      viewBtn.textContent = "View Project";
      viewBtn.onclick = (function (projectId) {
        return function () {
          window.PCC.executiveCenter.viewProject(projectId);
          window.PCC.router.go("executiveCenter");
        };
      })(g.project.id);
      groupHeader.appendChild(viewBtn);

      group.appendChild(groupHeader);

      // UI/UX Overhaul Gate 5: retrofitted onto Gate 1's .attention-list/.attention-item
      // primitive (Workspace's own Management Attention, Gate 4, and Executive Center's
      // Diagnostics/Management Action List, this same gate) instead of this panel's own
      // hand-built badge+row markup — no change to which alerts appear, only how. This
      // panel only ever carries "critical"/"warning" severities (filtered upstream in
      // computeManagementAttention above), never "info".
      var list = document.createElement("div");
      list.className = "attention-list";
      g.alerts.forEach(function (a) {
        var row = document.createElement("div");
        row.className = "attention-item";

        var icon = document.createElement("span");
        icon.className = "attention-item__icon attention-item__icon--" + (a.severity === "critical" ? "critical" : "warning");
        row.appendChild(icon);

        var body = document.createElement("div");
        body.className = "attention-item__body";
        var text = document.createElement("div");
        text.className = "attention-item__text";
        text.textContent = a.description;
        body.appendChild(text);
        row.appendChild(body);

        list.appendChild(row);
      });
      group.appendChild(list);

      panel.appendChild(group);
    });

    return panel;
  }

  function renderRemindersPanel(reminders, data) {
    var typesById = {};
    data.document_types.forEach(function (t) {
      typesById[t.id] = t;
    });
    var vendorsById = {};
    data.vendors.forEach(function (v) {
      vendorsById[v.id] = v;
    });
    var projectsById = {};
    data.projects.forEach(function (p) {
      projectsById[p.id] = p;
    });

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "10px";
    heading.textContent = "Document Reminders (" + reminders.length + ")";
    panel.appendChild(heading);

    if (reminders.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.margin = "0";
      empty.textContent = "Nothing overdue or due within the next " + dueSoonWindowDays(data) + " days across the active portfolio.";
      panel.appendChild(empty);
      return panel;
    }

    var list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "8px";

    reminders.forEach(function (x) {
      var r = x.row;
      var t = typesById[r.document_type_id];
      var project = projectsById[r.project_id];
      var vendor = r.vendor_id ? vendorsById[r.vendor_id] : null;
      var badgeInfo = REQUIREMENT_STATUS_BADGE[x.status];

      var row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.fontSize = "13px";
      row.style.gap = "8px";

      var text = document.createElement("span");
      text.textContent =
        (t.name || "(unnamed type)") +
        (t.code ? " (" + t.code + ")" : "") +
        " — " +
        (project ? project.name || "(unnamed project)" : "(deleted project)") +
        " — due " +
        r.planned_submission_date +
        (vendor ? " — " + (vendor.vendor_name || "(unnamed vendor)") : "");
      row.appendChild(text);

      var right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";
      right.style.flexShrink = "0";

      var badge = document.createElement("span");
      badge.className = "status-badge status-badge--" + badgeInfo.className;
      badge.style.fontSize = "11px";
      badge.textContent = badgeInfo.label;
      right.appendChild(badge);

      if (project) {
        var viewBtn = document.createElement("button");
        viewBtn.className = "btn btn--ghost";
        viewBtn.textContent = "View Project";
        viewBtn.onclick = function () {
          window.PCC.portfolio.viewProject(project.id);
          window.PCC.router.go("portfolio");
        };
        right.appendChild(viewBtn);
      }

      row.appendChild(right);
      list.appendChild(row);
    });

    panel.appendChild(list);
    return panel;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();
    var allActive = data.projects.filter(function (p) {
      return !p.archived;
    });

    // Live-sync, not seed-once: a plain "seed on first render" flag missed the very
    // common case of the header's project switcher (or another page's own switcher)
    // changing context AFTER this page's first render this session but BEFORE its next
    // visit — the exact daily flow the audit flagged. Comparing against the last
    // context value this page actually observed (undefined, not "", so the very first
    // render always syncs) means a genuine context change anywhere in the app is picked
    // up next time this page renders, while an explicit local "Show All Projects" stays
    // put until the context actually changes again — it deliberately updates
    // lastSyncedContextId too, see that button's own handler below.
    var ctxProjectId = window.PCC.projectContext.get();
    if (ctxProjectId !== uiState.lastSyncedContextId) {
      uiState.lastSyncedContextId = ctxProjectId;
      uiState.projectFilter = ctxProjectId && allActive.some(function (p) { return p.id === ctxProjectId; }) ? ctxProjectId : "";
    }
    if (uiState.projectFilter && !allActive.some(function (p) { return p.id === uiState.projectFilter; })) {
      uiState.projectFilter = "";
    }

    var active = uiState.projectFilter
      ? allActive.filter(function (p) { return p.id === uiState.projectFilter; })
      : allActive;
    var filtered = active.filter(projectMatchesFilters);

    var wrap = document.createElement("div");

    var h1 = document.createElement("h2");
    h1.textContent = "Portfolio Overview";
    h1.style.marginBottom = "4px";

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "20px";
    sub.textContent =
      active.length === 0
        ? "No active projects yet \u2014 add one from the Portfolio page to populate this view."
        : filtered.length === active.length
        ? "Portfolio-wide health across " + active.length + " active project" + (active.length === 1 ? "" : "s") + "."
        : "Portfolio-wide health across " + filtered.length + " of " + active.length + " active project" + (active.length === 1 ? "" : "s") + " matching these filters.";

    wrap.appendChild(h1);
    wrap.appendChild(sub);

    // Company/Client/Project Management redesign: the spec's own "prominent global
    // context selector" (point 6) — a bigger, always-reachable copy of the shell header's
    // own Company/Client/Project cascade (same underlying window.PCC.projectContext, so
    // picking a level here IS the global context switch, kept in sync automatically via
    // layout.js's store.onChange listener). Placed here specifically because the header's
    // own copy is hidden on phones (an existing, deliberate space-saving rule applying to
    // every non-growing title-block cell) — this is the one copy guaranteed reachable at
    // every screen size, which is exactly what the spec asks for.
    var contextPanel = document.createElement("div");
    contextPanel.className = "panel no-print";
    contextPanel.style.marginBottom = "16px";
    var contextHeading = document.createElement("div");
    contextHeading.className = "text-secondary";
    contextHeading.style.fontSize = "11px";
    contextHeading.style.letterSpacing = "0.4px";
    contextHeading.style.marginBottom = "8px";
    contextHeading.textContent = "CURRENT CONTEXT";
    contextPanel.appendChild(contextHeading);
    contextPanel.appendChild(window.PCC.layout.buildContextSwitcher("dashboard-context"));
    wrap.appendChild(contextPanel);

    if (uiState.projectFilter) {
      var focusBanner = document.createElement("div");
      focusBanner.className = "toolbar no-print";
      focusBanner.style.marginBottom = "12px";
      var focusLabel = document.createElement("span");
      var focusedProject = data.projects.find(function (p) { return p.id === uiState.projectFilter; });
      focusLabel.textContent = "Focused on " + (focusedProject ? (focusedProject.name || "(unnamed project)") : "");
      focusBanner.appendChild(focusLabel);
      var showAllBtn = document.createElement("button");
      showAllBtn.className = "btn btn--ghost";
      showAllBtn.textContent = "Show All Projects";
      showAllBtn.onclick = function () {
        uiState.projectFilter = "";
        uiState.lastSyncedContextId = "";
        window.PCC.projectContext.set("");
        rerender();
      };
      focusBanner.appendChild(showAllBtn);
      wrap.appendChild(focusBanner);
    }

    // PCC Evolution Roadmap, Tier 3 ("final polish"): Dashboard-level filtering. Same
    // filterSelect() pattern portfolio.js's own filter row already established \u2014 every
    // option list built from `active` (not `filtered`), so narrowing one filter never
    // removes another filter's own options. Built from `active`, not `data.projects`,
    // since Dashboard never shows archived projects at all \u2014 offering a filter value
    // that only exists on an archived project would just produce a silent, unexplained
    // empty result.
    if (active.length > 0) {
      var filterToolbar = document.createElement("div");
      filterToolbar.className = "toolbar";
      filterToolbar.style.marginBottom = "16px";

      function filterSelect(label, uiKey, projectField) {
        var select = document.createElement("select");
        var allOpt = document.createElement("option");
        allOpt.value = "";
        allOpt.textContent = "All " + label;
        select.appendChild(allOpt);
        distinctValues(active, projectField).forEach(function (v) {
          var opt = document.createElement("option");
          opt.value = v;
          opt.textContent = v;
          select.appendChild(opt);
        });
        select.value = uiState[uiKey];
        select.onchange = function () {
          uiState[uiKey] = select.value;
          rerender();
        };
        return select;
      }
      filterToolbar.appendChild(filterSelect("clients", "clientFilter", "client"));
      filterToolbar.appendChild(filterSelect("countries", "countryFilter", "country"));
      filterToolbar.appendChild(filterSelect("sectors", "sectorFilter", "sector"));
      filterToolbar.appendChild(filterSelect("PMs", "pmFilter", "project_manager"));
      filterToolbar.appendChild(filterSelect("planners", "plannerFilter", "planner"));
      filterToolbar.appendChild(filterSelect("types", "typeFilter", "project_type"));

      var yearSelect = document.createElement("select");
      var allYearsOpt = document.createElement("option");
      allYearsOpt.value = "";
      allYearsOpt.textContent = "All years";
      yearSelect.appendChild(allYearsOpt);
      var years = {};
      active.forEach(function (p) {
        if (p.start_date) years[p.start_date.slice(0, 4)] = true;
      });
      Object.keys(years).sort().forEach(function (y) {
        var opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
      });
      yearSelect.value = uiState.yearFilter;
      yearSelect.onchange = function () {
        uiState.yearFilter = yearSelect.value;
        rerender();
      };
      filterToolbar.appendChild(yearSelect);

      wrap.appendChild(filterToolbar);
    }

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";

    function countByStatus(status) {
      return filtered.filter(function (p) {
        return p.status === status;
      }).length;
    }

    var reminders = computeReminders(data, filtered);
    var overdueCount = reminders.filter(function (x) {
      return x.status === "overdue";
    }).length;
    var dueSoonCount = reminders.length - overdueCount;

    // Daily-Use Audit Phase 5 ("Dashboard's own KPI tiles aren't clickable"):
    // "Inconsistent with the Portfolio Exceptions panel directly below it, which uses
    // near-identical chips that ARE clickable — trains the wrong expectation on the
    // very first screen a user sees." Each tile now navigates to wherever that count
    // actually lives — Portfolio (pre-filtered to the matching status, via the new
    // portfolio.filterByStatus()) for the first four, Document Control Dashboard for
    // the two document-reminder tiles, which already is portfolio-wide with no
    // per-status filter of its own to set.
    var kpis = [
      { label: "ACTIVE PROJECTS", value: filtered.length, colorVar: null, route: "portfolio", status: "" },
      { label: "ON TRACK", value: countByStatus("on_track"), colorVar: "--status-on-track", route: "portfolio", status: "on_track" },
      { label: "AT RISK", value: countByStatus("at_risk"), colorVar: "--status-at-risk", route: "portfolio", status: "at_risk" },
      { label: "CRITICAL", value: countByStatus("critical"), colorVar: "--status-critical", route: "portfolio", status: "critical" },
      { label: "OVERDUE DOCS", value: overdueCount, colorVar: overdueCount > 0 ? "--status-critical" : null, route: "documentControlDashboard" },
      { label: "DUE SOON (" + dueSoonWindowDays(data) + "D)", value: dueSoonCount, colorVar: dueSoonCount > 0 ? "--status-at-risk" : null, route: "documentControlDashboard" },
    ];

    kpis.forEach(function (kpi) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "kpi-card kpi-card--link";
      var valueStyle = kpi.colorVar ? ' style="color:var(' + kpi.colorVar + ')"' : "";
      card.innerHTML =
        '<span class="kpi-card__label">' +
        kpi.label +
        '</span><span class="kpi-card__value mono"' +
        valueStyle +
        ">" +
        kpi.value +
        "</span>";
      card.onclick = function () {
        if (kpi.status !== undefined && window.PCC.portfolio) window.PCC.portfolio.filterByStatus(kpi.status);
        window.PCC.router.go(kpi.route);
      };
      kpiGrid.appendChild(card);
    });

    wrap.appendChild(kpiGrid);

    if (active.length > 0) {
      wrap.appendChild(renderPortfolioExceptionsPanel(countPortfolioExceptions(data, filtered)));
      var attentionGroups = computeManagementAttention(data, filtered);
      wrap.appendChild(renderManagementAttentionPanel(attentionGroups));
      wrap.appendChild(renderRemindersPanel(reminders, data));
    }

    var panel = document.createElement("div");
    panel.className = "panel";

    if (active.length === 0) {
      panel.innerHTML =
        "<h3 style='margin-bottom:8px;'>Get started</h3>" +
        "<p class='text-secondary' style='margin:0;'>Head to Portfolio and add your first project \u2014 it'll " +
        "show up here immediately.</p>";
    } else if (filtered.length === 0) {
      panel.innerHTML =
        "<h3 style='margin-bottom:8px;'>Recent projects</h3>" +
        "<p class='text-secondary' style='margin:0;'>No active projects match these filters.</p>";
    } else {
      var heading = document.createElement("h3");
      heading.style.marginBottom = "10px";
      heading.textContent = "Recent projects";
      panel.appendChild(heading);

      var list = document.createElement("div");
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "8px";

      filtered
        .slice()
        .sort(function (a, b) {
          return new Date(b.updated_at) - new Date(a.updated_at);
        })
        .slice(0, 5)
        .forEach(function (p) {
          var row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.fontSize = "14px";
          row.innerHTML =
            "<span>" +
            (p.name || "(unnamed project)") +
            "</span><span class='status-badge status-badge--" +
            p.status +
            "'>" +
            (STATUS_LABELS[p.status] || p.status) +
            "</span>";
          list.appendChild(row);
        });

      panel.appendChild(list);
    }

    wrap.appendChild(panel);
    outlet.appendChild(wrap);
  }

  window.PCC.pages.dashboard = render;
})();
