/* Project Lookahead — Gate 30 (PCC Evolution Roadmap, Gate 2 of ~27). A consolidated,
 * forward-only, chronological view answering "what's coming next?" across a 7/14/30/60-day
 * window the user picks. Distinct from Gate 29's Planner Action Centre in two ways: this is
 * a flat DATE-sorted table, not urgency buckets, and it's forward-only — nothing overdue
 * shows here (that's the Action Centre's job) — and it's the first cross-module planner
 * view to include Schedule activities/milestones and upcoming Meetings.
 *
 * Sources, all read-only, nothing written back:
 * - Schedule activities/milestones (`activity_type` "task" or "milestone" only — summary/
 *   wbs_summary rows are structural, not real work; excludes completed activities). Date is
 *   `early_start || planned_start` — same calculated-wins-over-planned precedence as
 *   `scheduleGanttLayout.js`'s own `effectiveDates()`, duplicated here per this app's
 *   per-module-helpers convention. Status badge reuses the schedule's own
 *   `near_critical_threshold_days` against `total_float`, same threshold `schedule.js`'s
 *   Gantt view and Executive Center both already use. Reads the PERSISTED calculated fields
 *   (from the schedule's last "Calculate" run) rather than re-running the CPM engine live —
 *   matches the Gantt view's own trust model, not Executive Center's live-recompute (that's
 *   a deliberate outlier there for health-score freshness).
 * - Meetings — the meeting's own `meeting_date` (new: nothing in PCC surfaced "you have a
 *   meeting on this date" before this gate) — plus Meeting Actions (`due_date`, reused from
 *   Gate 29).
 * - RFI/TQ (`date_required`, status "open" only — reused from Gate 29).
 * - Document Requirements — reuses the Available/Overdue/Required computation every Document
 *   Control gate since Gate 18 has used (the ninth independent copy now); only "required" rows
 *   ever land in a forward window by construction (an "overdue" row's date is already in the
 *   past, so it's excluded by the date filter itself — no special-casing needed).
 *
 * Deliberately excluded, same reasoning as Gate 29: Change Orders and Risks/Issues have no
 * due-date field in the schema at all, so they can never sit on a date-driven timeline.
 *
 * Planning & Scheduling-Centric Delay Management, Gate G: every upcoming Activity/
 * Milestone item now also shows how many Delay Records still being tracked (status not
 * recovered/closed) are linked to it, via delay_activity_links — a plain count appended
 * to the item's own meta line (see activeDelayCountsByActivity()). Deliberately doesn't
 * touch the item's existing badgeClass, which stays driven only by the Schedule's own
 * persisted float/criticality — an open delay doesn't change what the CPM engine itself
 * already says about an activity (spec point 2, never a second calculation).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var WINDOW_OPTIONS = [7, 14, 30, 60];
  var DEFAULT_WINDOW_DAYS = 7;

  var uiState = {
    windowDays: DEFAULT_WINDOW_DAYS,
    // Daily-Use Audit Phase 2: live-syncs with the shared Global Project Context
    // (Redesign Gate 6) — see dashboard.js's identical block for the full reasoning on
    // why this compares against the last-observed context value rather than a one-time
    // seed flag. This page's name implied per-project scoping it never actually had.
    projectFilter: "",
    lastSyncedContextId: undefined,
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }
  function addDaysIso(isoDateStr, days) {
    var d = new Date(isoDateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // Same Available/Overdue/Required computation as portfolio.js/vendors.js/schedule.js/
  // dashboard.js/documentControlDashboard.js/executiveCenter.js/actionCentre.js's own
  // copies — duplicated here per this app's per-module-helpers convention.
  function computeRequirementStatus(data, projectId, documentTypeId, plannedDate) {
    var available = data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === documentTypeId;
    });
    if (available) return "available";
    if (plannedDate && plannedDate < todayIso()) return "overdue";
    return "required";
  }

  // Same primary-schedule selection as executiveCenter.js's own pickPrimarySchedule() —
  // duplicated here per convention: prefer an active schedule, highest revision number,
  // most recently updated as the tiebreak.
  function pickPrimarySchedule(schedules) {
    if (schedules.length === 0) return null;
    var active = schedules.filter(function (s) {
      return s.status === "active";
    });
    var pool = active.length ? active : schedules;
    return pool.slice().sort(function (a, b) {
      if (a.revision_number !== b.revision_number) return b.revision_number - a.revision_number;
      return new Date(b.updated_at) - new Date(a.updated_at);
    })[0];
  }

  // Gate G (Planning & Scheduling-Centric Delay Management: Dashboard & Lookahead
  // integration): activityId -> count of Delay Records still being tracked (status not
  // recovered/closed — same "active" definition dashboard.js's getDelayImpactSummary()
  // uses) linked via delay_activity_links. Purely a count for the item's own meta line —
  // never touches the item's existing badgeClass, which stays driven only by the
  // Schedule's own persisted float/criticality (single source of truth, spec point 2);
  // an open delay doesn't change what the Schedule itself already says about an activity.
  function activeDelayCountsByActivity(data) {
    var delayRecordsById = {};
    data.delay_records.forEach(function (r) {
      if (r.status === "recovered" || r.status === "closed") return;
      delayRecordsById[r.id] = r;
    });
    var counts = {};
    data.delay_activity_links.forEach(function (link) {
      if (!delayRecordsById[link.delay_id]) return;
      counts[link.activity_id] = (counts[link.activity_id] || 0) + 1;
    });
    return counts;
  }

  function collectItems(data, activeProjectIds, windowDays) {
    var today = todayIso();
    var windowEnd = addDaysIso(today, windowDays);
    var items = [];
    var delayCounts = activeDelayCountsByActivity(data);

    var schedulesByProject = {};
    data.schedules.forEach(function (s) {
      if (!activeProjectIds[s.project_id]) return;
      (schedulesByProject[s.project_id] = schedulesByProject[s.project_id] || []).push(s);
    });
    Object.keys(schedulesByProject).forEach(function (projectId) {
      var schedule = pickPrimarySchedule(schedulesByProject[projectId]);
      if (!schedule) return;
      var thresholdDays = schedule.near_critical_threshold_days || 5;
      data.activities.forEach(function (a) {
        if (a.schedule_id !== schedule.id) return;
        if (a.activity_type !== "task" && a.activity_type !== "milestone") return;
        if (a.status === "complete") return;
        var date = a.early_start || a.planned_start;
        if (!date || date < today || date > windowEnd) return;
        var floatVal = a.total_float;
        var critical = floatVal != null && floatVal <= 0;
        var nearCritical = floatVal != null && floatVal > 0 && floatVal <= thresholdDays;
        var openDelayCount = delayCounts[a.id] || 0;
        items.push({
          kind: a.activity_type === "milestone" ? "Milestone" : "Activity",
          title: a.name || "(unnamed activity)",
          projectId: projectId,
          owner: a.responsible_person || a.contractor || "—",
          date: date,
          badgeClass: critical ? "critical" : nearCritical ? "at_risk" : "on_track",
          openDelayCount: openDelayCount,
          view: (function (pId, schedId, actId) {
            return function () {
              window.PCC.schedule.viewActivity(pId, schedId, actId);
              window.PCC.router.go("schedule");
            };
          })(projectId, schedule.id, a.id),
        });
      });
    });

    data.meetings.forEach(function (m) {
      if (!activeProjectIds[m.project_id]) return;
      if (m.meeting_date && m.meeting_date >= today && m.meeting_date <= windowEnd) {
        items.push({
          kind: "Meeting",
          title: m.title || "(untitled meeting)",
          projectId: m.project_id,
          owner: "—",
          date: m.meeting_date,
          badgeClass: "info",
          view: (function (id) {
            return function () {
              window.PCC.meetings.expandMeeting(id);
              window.PCC.router.go("meetings");
            };
          })(m.id),
        });
      }
      (m.actions || []).forEach(function (a) {
        if (a.status !== "open") return;
        if (!a.due_date || a.due_date < today || a.due_date > windowEnd) return;
        items.push({
          kind: "Meeting Action",
          title: a.description || "(no description)",
          projectId: m.project_id,
          owner: a.owner || "—",
          date: a.due_date,
          badgeClass: "info",
          view: (function (id) {
            return function () {
              window.PCC.meetings.expandMeeting(id);
              window.PCC.router.go("meetings");
            };
          })(m.id),
        });
      });
    });

    data.rfis.forEach(function (r) {
      if (!activeProjectIds[r.project_id]) return;
      if (r.status !== "open") return;
      if (!r.date_required || r.date_required < today || r.date_required > windowEnd) return;
      items.push({
        kind: r.type === "technical_query" ? "TQ" : "RFI",
        title: (r.number || "") + (r.subject ? " — " + r.subject : ""),
        projectId: r.project_id,
        owner: r.assigned_to || "—",
        date: r.date_required,
        badgeClass: "info",
        view: (function (id) {
          return function () {
            window.PCC.rfis.expandRfi(id);
            window.PCC.router.go("rfis");
          };
        })(r.id),
      });
    });

    var typesById = {};
    data.document_types.forEach(function (t) {
      typesById[t.id] = t;
    });
    var vendorsById = {};
    data.vendors.forEach(function (v) {
      vendorsById[v.id] = v;
    });
    data.project_document_requirements.forEach(function (req) {
      if (!activeProjectIds[req.project_id]) return;
      var type = typesById[req.document_type_id];
      if (!type) return;
      var status = computeRequirementStatus(data, req.project_id, req.document_type_id, req.planned_submission_date);
      if (status !== "required") return;
      if (!req.planned_submission_date || req.planned_submission_date < today || req.planned_submission_date > windowEnd) return;
      var vendor = req.vendor_id ? vendorsById[req.vendor_id] : null;
      items.push({
        kind: "Document",
        title: type.name + (type.code ? " (" + type.code + ")" : ""),
        projectId: req.project_id,
        owner: vendor ? vendor.vendor_name || "(unnamed vendor)" : "—",
        date: req.planned_submission_date,
        badgeClass: "at_risk",
        view: (function (pId) {
          return function () {
            window.PCC.portfolio.viewProject(pId);
            window.PCC.router.go("portfolio");
          };
        })(req.project_id),
      });
    });

    return items;
  }

  function windowToggle(rerender) {
    var wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.gap = "8px";
    wrap.style.marginBottom = "16px";

    WINDOW_OPTIONS.forEach(function (days) {
      var btn = document.createElement("button");
      btn.className = "btn" + (uiState.windowDays === days ? "" : " btn--ghost");
      btn.textContent = days + " Day";
      btn.onclick = function () {
        uiState.windowDays = days;
        rerender();
      };
      wrap.appendChild(btn);
    });

    return wrap;
  }

  // Redesign Gate 10 (Module Consistency Pass): retrofitted onto the same
  // .attention-list/.attention-item primitive Action Centre's own itemRow() (Gate 7)
  // already moved to — same hand-built row + status-badge + separate "View" ghost
  // button shape, same fix. Whole row is the click target now, only when a linked
  // project still exists (a deleted project's items stay listed but non-clickable,
  // same as before this gate).
  function itemRow(item, projectsById) {
    var project = projectsById[item.projectId];

    var row = document.createElement("div");
    row.className = "attention-item" + (project ? " attention-item--clickable" : "");
    if (project) row.onclick = item.view;

    var icon = document.createElement("span");
    icon.className = "attention-item__icon attention-item__icon--" + item.badgeClass;
    row.appendChild(icon);

    var body = document.createElement("div");
    body.className = "attention-item__body";
    var text = document.createElement("div");
    text.className = "attention-item__text";
    text.textContent = "[" + item.kind + "] " + item.title;
    body.appendChild(text);
    var meta = document.createElement("div");
    meta.className = "attention-item__meta";
    meta.textContent =
      item.date + " · " +
      (project ? project.name || "(unnamed project)" : "(deleted project)") +
      " · " + item.owner +
      (item.openDelayCount ? " · " + item.openDelayCount + " open delay" + (item.openDelayCount === 1 ? "" : "s") : "");
    body.appendChild(meta);
    row.appendChild(body);

    return row;
  }

  function render(outlet) {
    var data = window.PCC.store.get();
    var allActiveProjects = data.projects.filter(function (p) {
      return !p.archived;
    });
    var projectsById = {};
    allActiveProjects.forEach(function (p) {
      projectsById[p.id] = p;
    });

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

    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var items = collectItems(data, activeProjectIds, uiState.windowDays);
    items.sort(function (a, b) {
      return a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title);
    });

    var wrap = document.createElement("div");

    var h1 = document.createElement("h2");
    h1.textContent = "Project Lookahead";
    h1.style.marginBottom = "4px";
    wrap.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "16px";
    sub.textContent = uiState.projectFilter
      ? "Schedule activities, milestones, meetings, RFI/TQ, and document submissions due in the next " +
        uiState.windowDays + " day" + (uiState.windowDays === 1 ? "" : "s") +
        " for " + (projectsById[uiState.projectFilter].name || "(unnamed project)") + "."
      : "Schedule activities, milestones, meetings, RFI/TQ, and document submissions due in the next " +
        uiState.windowDays + " day" + (uiState.windowDays === 1 ? "" : "s") +
        " across " + allActiveProjects.length + " active project" + (allActiveProjects.length === 1 ? "" : "s") + ".";
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
        rerender();
      };
      toolbar.appendChild(projSelect);
      wrap.appendChild(toolbar);
    }

    wrap.appendChild(windowToggle(rerender));

    var panel = document.createElement("div");
    panel.className = "panel";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "8px";
    heading.textContent = "Coming Up (" + items.length + ")";
    panel.appendChild(heading);

    if (items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.margin = "0";
      empty.textContent = "Nothing scheduled, due, or required in the next " + uiState.windowDays + " days" +
        (uiState.projectFilter ? " for this project." : " across the active portfolio.");
      panel.appendChild(empty);
    } else {
      var list = document.createElement("div");
      list.className = "attention-list";
      items.forEach(function (item) {
        list.appendChild(itemRow(item, projectsById));
      });
      panel.appendChild(list);
    }

    wrap.appendChild(panel);
    outlet.appendChild(wrap);
  }

  window.PCC.pages.projectLookahead = render;
})();
