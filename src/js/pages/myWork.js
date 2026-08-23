/* My Work — Gate 17 (PCC Evolution Roadmap, Tier E: Personal Workbench). The personal
 * project-management cockpit the spec asks for: "what do I need to do, this week, and
 * who am I waiting on?" — distinct from Dashboard (portfolio-wide status board) and
 * Action Centre (date-bucketed due items only). This page organizes by the spec's own
 * four sections instead:
 *
 * TODAY — Overdue Actions (Meeting Actions + RFI/TQ past due, same definition Action
 *   Centre's own OVERDUE bucket uses), Today's Meetings, Approvals (Change Orders +
 *   Decisions pending), Activities to Update (a genuinely new rule — not_started
 *   activities whose planned_start has passed, or in_progress activities whose
 *   planned_finish has passed: behind their own plan, likely needs a status/actuals
 *   update. No such concept existed anywhere before this gate).
 * THIS WEEK — Meetings and Milestones in the next 7 days (reusing Project Lookahead's
 *   own date-window/early_start-precedence conventions), Vendor Follow-ups and Reviews
 *   due (both needed a real schema addition — see below), Reports deliberately excluded
 *   (no scheduled/recurring-report concept exists anywhere in PCC, and the spec's own
 *   Reporting section says not to build reporting out in one gate).
 * WAITING FOR — Vendor/Client/Consultant/Management, from RFI/TQ + Change Orders +
 *   Decisions carrying the new optional waiting_on_party field. Unset ("") items don't
 *   appear here — never guessed, per this app's "transparent, never fabricate" rule.
 * RECENTLY UPDATED — Projects/Activities/RFIs/Risks/Meetings, top 5 each by updated_at,
 *   same pattern Dashboard's own "Recent projects" already established.
 *
 * Schema v40 additions this gate needed (confirmed with Aditya, all three the "add a
 * real field" option rather than a heuristic or an exclusion): waiting_on_party on RFI/
 * TQ, Change Orders, and Decisions; next_follow_up_date on Vendor; review_cadence_days
 * on Project (defaults to 7 = weekly, matching Weekly Project Review's own name).
 *
 * Purely computed at render time, same "never denormalized" convention as every other
 * dashboard in this app — writes nothing back.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var WEEK_WINDOW_DAYS = 7;
  var RECENT_LIMIT = 5;

  // Daily-Use Audit Phase 2: this page had no filter of any kind before — the shared
  // Global Project Context (Redesign Gate 6) never reached it. Live-syncs with it
  // (compares against the last context value this page actually observed, not a plain
  // "seeded once ever" flag — see the schema/reasoning note in render() below) so a
  // context change anywhere else in the app is picked up the next time this page
  // renders, while a local "All Projects" override stays put until context genuinely
  // changes again.
  var uiState = {
    projectFilter: "",
    lastSyncedContextId: undefined,
  };

  var WAITING_ON_LABELS = { vendor: "Vendor", client: "Client", consultant: "Consultant", management: "Management" };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }
  function addDaysIso(isoDateStr, days) {
    var d = new Date(isoDateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString() : "";
  }

  // ---- TODAY ----------------------------------------------------------------------

  /** Same definition Action Centre's own OVERDUE bucket uses (Meeting Actions + RFI/TQ
   * past due) — duplicated here per this app's per-module-helpers convention rather than
   * importing actionCentre.js's private bucketing logic. */
  function collectOverdueActions(data, activeProjectIds) {
    var today = todayIso();
    var items = [];
    data.meetings.forEach(function (m) {
      if (!activeProjectIds[m.project_id]) return;
      (m.actions || []).forEach(function (a) {
        if (a.status !== "open" || !a.due_date || a.due_date >= today) return;
        items.push({
          kind: "Meeting Action",
          title: a.description || "(no description)",
          projectId: m.project_id,
          extra: "due " + a.due_date,
          view: function () {
            window.PCC.meetings.expandMeeting(m.id);
            window.PCC.router.go("meetings");
          },
        });
      });
    });
    data.rfis.forEach(function (r) {
      if (!activeProjectIds[r.project_id]) return;
      if (r.status !== "open" || !r.date_required || r.date_required >= today) return;
      items.push({
        kind: r.type === "technical_query" ? "TQ" : "RFI",
        title: (r.number || "") + (r.subject ? " — " + r.subject : ""),
        projectId: r.project_id,
        extra: "due " + r.date_required,
        view: function () {
          window.PCC.rfis.expandRfi(r.id);
          window.PCC.router.go("rfis");
        },
      });
    });
    items.sort(function (a, b) {
      return a.extra.localeCompare(b.extra);
    });
    return items;
  }

  function collectTodaysMeetings(data, activeProjectIds) {
    var today = todayIso();
    return data.meetings
      .filter(function (m) {
        return activeProjectIds[m.project_id] && m.meeting_date === today;
      })
      .map(function (m) {
        return {
          kind: "Meeting",
          title: m.title || "(untitled meeting)",
          projectId: m.project_id,
          extra: "",
          view: function () {
            window.PCC.meetings.expandMeeting(m.id);
            window.PCC.router.go("meetings");
          },
        };
      });
  }

  function collectApprovals(data, activeProjectIds) {
    var items = [];
    data.change_orders.forEach(function (co) {
      if (!activeProjectIds[co.project_id]) return;
      if (co.status !== "pending") return;
      items.push({
        kind: "Change Order",
        title: (co.number || "") + (co.title ? " — " + co.title : ""),
        projectId: co.project_id,
        extra: co.requested_by ? "requested by " + co.requested_by : "",
        view: function () {
          window.PCC.changeOrders.expandChangeOrder(co.id);
          window.PCC.router.go("changeOrders");
        },
      });
    });
    data.decisions.forEach(function (d) {
      if (!activeProjectIds[d.project_id]) return;
      if (d.status !== "pending") return;
      items.push({
        kind: "Decision",
        title: d.title || "(untitled decision)",
        projectId: d.project_id,
        extra: "",
        view: function () {
          window.PCC.decisionRegister.expandDecision(d.id);
          window.PCC.router.go("decisionRegister");
        },
      });
    });
    return items;
  }

  /** Genuinely new rule (nothing like this existed before this gate) — an activity is
   * "behind its own plan and likely needs a status/actuals update" when it's still
   * not_started after its planned_start has passed, or still in_progress after its
   * planned_finish has passed. Uses raw planned dates directly, not the CPM engine's
   * computed dates — this is about data hygiene ("does this record still reflect
   * reality?"), not schedule health, which Executive Center/Portfolio already cover. */
  function collectActivitiesToUpdate(data, activeProjectIds) {
    var today = todayIso();
    var items = [];
    data.activities.forEach(function (a) {
      if (!activeProjectIds[a.project_id]) return;
      if (a.activity_type !== "task" && a.activity_type !== "milestone") return;
      var stale =
        (a.status === "not_started" && a.planned_start && a.planned_start < today) ||
        (a.status === "in_progress" && a.planned_finish && a.planned_finish < today);
      if (!stale) return;
      items.push({
        kind: a.activity_type === "milestone" ? "Milestone" : "Activity",
        title: a.name || "(unnamed activity)",
        projectId: a.project_id,
        extra: a.status === "not_started" ? "should have started " + a.planned_start : "should have finished " + a.planned_finish,
        view: function () {
          window.PCC.schedule.viewActivity(a.project_id, a.schedule_id, a.id);
          window.PCC.router.go("schedule");
        },
      });
    });
    return items;
  }

  // ---- THIS WEEK --------------------------------------------------------------------

  /** Deliberately excludes today (Today's Meetings above already covers it) — the window
   * is tomorrow through +7 days. */
  function collectWeekMeetings(data, activeProjectIds) {
    var today = todayIso();
    var end = addDaysIso(today, WEEK_WINDOW_DAYS);
    var items = data.meetings
      .filter(function (m) {
        return activeProjectIds[m.project_id] && m.meeting_date > today && m.meeting_date <= end;
      })
      .map(function (m) {
        return {
          kind: "Meeting",
          title: m.title || "(untitled meeting)",
          projectId: m.project_id,
          extra: m.meeting_date,
          view: function () {
            window.PCC.meetings.expandMeeting(m.id);
            window.PCC.router.go("meetings");
          },
        };
      });
    items.sort(function (a, b) {
      return a.extra.localeCompare(b.extra);
    });
    return items;
  }

  /** Same activity_type==="milestone"/early_start-precedence/exclude-complete convention
   * Project Lookahead's own milestone rows already use. Window is today through +7 days
   * (inclusive of today) since there's no separate "milestones today" section to avoid
   * double-showing against, unlike Meetings above. */
  function collectWeekMilestones(data, activeProjectIds) {
    var today = todayIso();
    var end = addDaysIso(today, WEEK_WINDOW_DAYS);
    var items = [];
    data.activities.forEach(function (a) {
      if (!activeProjectIds[a.project_id]) return;
      if (a.activity_type !== "milestone") return;
      if (a.status === "complete") return;
      var date = a.early_start || a.planned_start;
      if (!date || date < today || date > end) return;
      items.push({
        kind: "Milestone",
        title: a.name || "(unnamed milestone)",
        projectId: a.project_id,
        extra: date,
        view: function () {
          window.PCC.schedule.viewActivity(a.project_id, a.schedule_id, a.id);
          window.PCC.router.go("schedule");
        },
      });
    });
    items.sort(function (a, b) {
      return a.extra.localeCompare(b.extra);
    });
    return items;
  }

  /** A single soonest-first list, overdue and due-this-week together (both flow from the
   * same manually-set next_follow_up_date — there's no separate "today" bucket for
   * vendor follow-ups the way meetings/actions have). */
  function collectVendorFollowups(data) {
    var today = todayIso();
    var end = addDaysIso(today, WEEK_WINDOW_DAYS);
    var items = [];
    data.vendors.forEach(function (v) {
      if (!v.next_follow_up_date || v.next_follow_up_date > end) return;
      items.push({
        kind: v.next_follow_up_date < today ? "Overdue" : "Vendor",
        title: v.vendor_name || "(unnamed vendor)",
        projectId: null,
        extra: "follow up by " + v.next_follow_up_date,
        view: function () {
          window.PCC.vendors.openProfile(v.id);
          window.PCC.router.go("vendors");
        },
      });
    });
    items.sort(function (a, b) {
      return a.extra.localeCompare(b.extra);
    });
    return items;
  }

  /** Cadence-based, per project.review_cadence_days (null = not configured, excluded
   * entirely rather than guessed). Next due = last review's review_date + cadence, or
   * the project's own start_date/created_at if it's never been reviewed yet. Includes
   * both already-overdue and due-within-the-window projects in one list, same reasoning
   * as Vendor Follow-ups above — the spec doesn't split Reviews into overdue/this-week. */
  function computeNextReviewDue(project, weeklyReviews) {
    if (project.review_cadence_days == null) return null;
    var lastDate = null;
    weeklyReviews.forEach(function (r) {
      if (r.project_id !== project.id) return;
      if (!lastDate || r.review_date > lastDate) lastDate = r.review_date;
    });
    var base = lastDate || (project.start_date || (project.created_at || "").slice(0, 10));
    if (!base) return null;
    return addDaysIso(base, project.review_cadence_days);
  }

  function collectReviewsDue(data, activeProjects) {
    var today = todayIso();
    var end = addDaysIso(today, WEEK_WINDOW_DAYS);
    var items = [];
    activeProjects.forEach(function (p) {
      var due = computeNextReviewDue(p, data.weekly_reviews);
      if (!due || due > end) return;
      items.push({
        kind: due < today ? "Overdue" : "Review",
        title: p.name || "(unnamed project)",
        projectId: p.id,
        extra: "due " + due,
        view: function () {
          window.PCC.executiveCenter.viewProject(p.id, "weeklyReviews");
          window.PCC.router.go("executiveCenter");
        },
      });
    });
    items.sort(function (a, b) {
      return a.extra.localeCompare(b.extra);
    });
    return items;
  }

  // ---- WAITING FOR --------------------------------------------------------------------

  function collectWaitingFor(data, activeProjectIds) {
    var byParty = { vendor: [], client: [], consultant: [], management: [] };
    function push(party, item) {
      if (byParty[party]) byParty[party].push(item);
    }

    data.rfis.forEach(function (r) {
      if (!activeProjectIds[r.project_id] || r.status !== "open" || !r.waiting_on_party) return;
      push(r.waiting_on_party, {
        kind: r.type === "technical_query" ? "TQ" : "RFI",
        title: (r.number || "") + (r.subject ? " — " + r.subject : ""),
        projectId: r.project_id,
        extra: "",
        view: function () {
          window.PCC.rfis.expandRfi(r.id);
          window.PCC.router.go("rfis");
        },
      });
    });
    data.change_orders.forEach(function (co) {
      if (!activeProjectIds[co.project_id] || co.status !== "pending" || !co.waiting_on_party) return;
      push(co.waiting_on_party, {
        kind: "Change Order",
        title: (co.number || "") + (co.title ? " — " + co.title : ""),
        projectId: co.project_id,
        extra: "",
        view: function () {
          window.PCC.changeOrders.expandChangeOrder(co.id);
          window.PCC.router.go("changeOrders");
        },
      });
    });
    data.decisions.forEach(function (d) {
      if (!activeProjectIds[d.project_id] || d.status !== "pending" || !d.waiting_on_party) return;
      push(d.waiting_on_party, {
        kind: "Decision",
        title: d.title || "(untitled decision)",
        projectId: d.project_id,
        extra: "",
        view: function () {
          window.PCC.decisionRegister.expandDecision(d.id);
          window.PCC.router.go("decisionRegister");
        },
      });
    });
    return byParty;
  }

  // ---- RECENTLY UPDATED ---------------------------------------------------------------

  function topRecentlyUpdated(records) {
    return records
      .slice()
      .sort(function (a, b) {
        return new Date(b.updated_at) - new Date(a.updated_at);
      })
      .slice(0, RECENT_LIMIT);
  }

  function collectRecentlyUpdated(data, activeProjectIds, activeProjects) {
    return {
      projects: topRecentlyUpdated(activeProjects).map(function (p) {
        return {
          kind: "Project",
          title: p.name || "(unnamed project)",
          projectId: p.id,
          extra: "updated " + fmtDate(p.updated_at),
          view: function () {
            window.PCC.executiveCenter.viewProject(p.id);
            window.PCC.router.go("executiveCenter");
          },
        };
      }),
      activities: topRecentlyUpdated(data.activities.filter(function (a) { return activeProjectIds[a.project_id]; })).map(function (a) {
        return {
          kind: "Activity",
          title: a.name || "(unnamed activity)",
          projectId: a.project_id,
          extra: "updated " + fmtDate(a.updated_at),
          view: function () {
            window.PCC.schedule.viewActivity(a.project_id, a.schedule_id, a.id);
            window.PCC.router.go("schedule");
          },
        };
      }),
      rfis: topRecentlyUpdated(data.rfis.filter(function (r) { return activeProjectIds[r.project_id]; })).map(function (r) {
        return {
          kind: r.type === "technical_query" ? "TQ" : "RFI",
          title: (r.number || "") + (r.subject ? " — " + r.subject : ""),
          projectId: r.project_id,
          extra: "updated " + fmtDate(r.updated_at),
          view: function () {
            window.PCC.rfis.expandRfi(r.id);
            window.PCC.router.go("rfis");
          },
        };
      }),
      risks: topRecentlyUpdated(data.risks.filter(function (r) { return activeProjectIds[r.project_id]; })).map(function (r) {
        return {
          kind: r.type === "issue" ? "Issue" : r.type === "opportunity" ? "Opportunity" : "Risk",
          title: r.title || "(untitled)",
          projectId: r.project_id,
          extra: "updated " + fmtDate(r.updated_at),
          view: function () {
            window.PCC.risks.expandRisk(r.id);
            window.PCC.router.go("risks");
          },
        };
      }),
      meetings: topRecentlyUpdated(data.meetings.filter(function (m) { return activeProjectIds[m.project_id]; })).map(function (m) {
        return {
          kind: "Meeting",
          title: m.title || "(untitled meeting)",
          projectId: m.project_id,
          extra: "updated " + fmtDate(m.updated_at),
          view: function () {
            window.PCC.meetings.expandMeeting(m.id);
            window.PCC.router.go("meetings");
          },
        };
      }),
    };
  }

  // ---- Rendering --------------------------------------------------------------------

  // Redesign Gate 7: retrofitted onto the same .attention-list/.attention-item
  // primitive Executive Center's Diagnostics/Management Action panels and Dashboard's
  // own Management Attention panel already use, replacing this page's original hand-
  // built flex-row+ghost-button markup — same "whole row is the click target" behavior
  // those panels established, rather than a separate "View" button. No change to which
  // items appear or what clicking them does, only how the row itself looks.
  function itemRow(item, badgeClass, projectsById) {
    var project = item.projectId ? projectsById[item.projectId] : null;

    var row = document.createElement("div");
    row.className = "attention-item attention-item--clickable";
    row.onclick = item.view;

    var icon = document.createElement("span");
    icon.className = "attention-item__icon attention-item__icon--" + badgeClass;
    row.appendChild(icon);

    var body = document.createElement("div");
    body.className = "attention-item__body";
    var text = document.createElement("div");
    text.className = "attention-item__text";
    text.textContent = item.title;
    body.appendChild(text);
    var meta = document.createElement("div");
    meta.className = "attention-item__meta";
    meta.textContent =
      item.kind +
      (project ? " · " + (project.name || "(unnamed project)") : "") +
      (item.extra ? " · " + item.extra : "");
    body.appendChild(meta);
    row.appendChild(body);

    return row;
  }

  function listPanel(heading, items, emptyText, projectsById, badgeClass) {
    var panel = document.createElement("div");
    panel.className = "panel";

    var h = document.createElement("h3");
    h.style.marginBottom = "8px";
    h.textContent = heading + " (" + items.length + ")";
    panel.appendChild(h);

    if (items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.margin = "0";
      empty.textContent = emptyText;
      panel.appendChild(empty);
      return panel;
    }

    var list = document.createElement("div");
    list.className = "attention-list";
    items.forEach(function (item) {
      list.appendChild(itemRow(item, badgeClass, projectsById));
    });
    panel.appendChild(list);
    return panel;
  }

  function sectionHeading(text) {
    var h = document.createElement("p");
    h.className = "text-secondary";
    h.style.fontSize = "12px";
    h.style.fontWeight = "600";
    h.style.letterSpacing = "0.04em";
    h.style.margin = "24px 0 10px";
    h.textContent = text;
    return h;
  }

  function grid(children) {
    var g = document.createElement("div");
    g.style.display = "grid";
    g.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
    g.style.gap = "16px";
    children.forEach(function (c) { g.appendChild(c); });
    return g;
  }

  function render(outlet) {
    var data = window.PCC.store.get();
    var allActiveProjects = data.projects.filter(function (p) { return !p.archived; });
    var projectsById = {};
    allActiveProjects.forEach(function (p) {
      projectsById[p.id] = p;
    });

    // See dashboard.js's identical block for the full reasoning on why this compares
    // against the last-observed context value rather than a one-time seed flag.
    var ctxProjectId = window.PCC.projectContext.get();
    if (ctxProjectId !== uiState.lastSyncedContextId) {
      uiState.lastSyncedContextId = ctxProjectId;
      uiState.projectFilter = ctxProjectId && allActiveProjects.some(function (p) { return p.id === ctxProjectId; }) ? ctxProjectId : "";
    }
    if (uiState.projectFilter && !allActiveProjects.some(function (p) { return p.id === uiState.projectFilter; })) {
      uiState.projectFilter = "";
    }

    var activeProjects = uiState.projectFilter
      ? allActiveProjects.filter(function (p) { return p.id === uiState.projectFilter; })
      : allActiveProjects;
    var activeProjectIds = {};
    activeProjects.forEach(function (p) {
      activeProjectIds[p.id] = true;
    });

    var wrap = document.createElement("div");

    var h1 = document.createElement("h2");
    h1.textContent = "My Work";
    h1.style.marginBottom = "4px";
    wrap.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "8px";
    sub.textContent = uiState.projectFilter
      ? "Your personal cockpit for " + (projectsById[uiState.projectFilter].name || "(unnamed project)") + "."
      : "Your personal cockpit across " + allActiveProjects.length + " active project" + (allActiveProjects.length === 1 ? "" : "s") + ".";
    wrap.appendChild(sub);

    if (allActiveProjects.length > 0) {
      var toolbar = document.createElement("div");
      toolbar.className = "toolbar no-print";
      toolbar.style.marginBottom = "8px";
      var projSelect = document.createElement("select");
      var allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = "All Projects";
      projSelect.appendChild(allOpt);
      allActiveProjects
        .slice()
        .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); })
        .forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name || "(unnamed project)";
          projSelect.appendChild(opt);
        });
      projSelect.value = uiState.projectFilter;
      projSelect.onchange = function () {
        uiState.projectFilter = projSelect.value;
        uiState.lastSyncedContextId = projSelect.value;
        window.PCC.projectContext.set(projSelect.value);
        window.PCC.router.render();
      };
      toolbar.appendChild(projSelect);
      wrap.appendChild(toolbar);
    }

    // ---- TODAY ----
    wrap.appendChild(sectionHeading("TODAY"));
    wrap.appendChild(
      grid([
        listPanel("Overdue Actions", collectOverdueActions(data, activeProjectIds), "Nothing overdue.", projectsById, "critical"),
        listPanel("Today's Meetings", collectTodaysMeetings(data, activeProjectIds), "No meetings today.", projectsById, "info"),
        listPanel("Approvals", collectApprovals(data, activeProjectIds), "Nothing pending approval.", projectsById, "at_risk"),
        listPanel("Activities to Update", collectActivitiesToUpdate(data, activeProjectIds), "Nothing behind its own plan dates.", projectsById, "at_risk"),
      ])
    );

    // ---- THIS WEEK ----
    wrap.appendChild(sectionHeading("THIS WEEK"));
    wrap.appendChild(
      grid([
        listPanel("Meetings", collectWeekMeetings(data, activeProjectIds), "No meetings in the next " + WEEK_WINDOW_DAYS + " days.", projectsById, "info"),
        listPanel("Milestones", collectWeekMilestones(data, activeProjectIds), "No milestones in the next " + WEEK_WINDOW_DAYS + " days.", projectsById, "info"),
        listPanel("Vendor Follow-ups", collectVendorFollowups(data), "Nothing due.", projectsById, "info"),
        listPanel("Reviews", collectReviewsDue(data, activeProjects), "No reviews due.", projectsById, "info"),
      ])
    );

    // ---- WAITING FOR ----
    wrap.appendChild(sectionHeading("WAITING FOR"));
    var waitingFor = collectWaitingFor(data, activeProjectIds);
    wrap.appendChild(
      grid([
        listPanel("Vendor", waitingFor.vendor, "Nothing waiting on a vendor.", projectsById, "info"),
        listPanel("Client", waitingFor.client, "Nothing waiting on the client.", projectsById, "info"),
        listPanel("Consultant", waitingFor.consultant, "Nothing waiting on a consultant.", projectsById, "info"),
        listPanel("Management", waitingFor.management, "Nothing waiting on management.", projectsById, "info"),
      ])
    );

    // ---- RECENTLY UPDATED ----
    wrap.appendChild(sectionHeading("RECENTLY UPDATED"));
    var recent = collectRecentlyUpdated(data, activeProjectIds, activeProjects);
    wrap.appendChild(
      grid([
        listPanel("Projects", recent.projects, "No recent activity.", projectsById, "info"),
        listPanel("Activities", recent.activities, "No recent activity.", projectsById, "info"),
        listPanel("RFIs", recent.rfis, "No recent activity.", projectsById, "info"),
        listPanel("Risks", recent.risks, "No recent activity.", projectsById, "info"),
        listPanel("Meetings", recent.meetings, "No recent activity.", projectsById, "info"),
      ])
    );

    outlet.appendChild(wrap);
  }

  window.PCC.pages.myWork = render;
})();
