/* Planner Action Centre — Gate 1 of the PCC evolution roadmap Aditya handed over on
 * 2026-08-19 (Tier A: Daily Planner Value). Answers "what do I need to do today?" by
 * aggregating every existing record type that actually carries a due date — Meeting
 * Actions, RFI/TQ, and Document Requirements — into OVERDUE / DUE TODAY / DUE THIS WEEK /
 * UPCOMING buckets, plus a dateless WAITING FOR bucket for Change Orders pending decision
 * (Change Orders have no due-date field at all, so they can never be date-bucketed, only
 * listed as outstanding).
 *
 * Risks/Issues were deliberately left out of this gate: that record has no due-date field
 * to bucket by (see the 2026-08-19 inspection report) — a future gate can add them once/if
 * one exists. Nothing here is invented or fabricated; every item traces to a real record,
 * same as every other dashboard in this app. Purely computed at render time ("never
 * denormalized" convention) — writes nothing back.
 *
 * Planning & Scheduling-Centric Delay Management, Gate F ("Planner Action Centre"):
 * Recovery Actions (`target_recovery_date` is a real due date this page's own charter —
 * "every existing record type that actually carries a due date" — already calls for) and
 * newly-identified Delay Records now surface here too, alongside every other outstanding
 * item, rather than only in the separate portfolio-wide Delay & Recovery Dashboard rollup
 * (delayRecoveryDashboard.js, which stays the read-only analysis view — this page is the
 * "go DO something" view, same split as every other kind already here). Only Recovery
 * Actions with status open/in_progress are shown (completed/cancelled are historical, same
 * cutoff the Dashboard already uses); only Delay Records still in "open" status are shown
 * — once a delay moves to investigating/mitigation/recovery, the concrete next step is
 * tracked as its own Recovery Action(s), which already appear here with a real due date, so
 * showing the parent Delay too would just be the same outstanding work counted twice. A
 * Delay's own click target is its linked Schedule Activity (the record's own home per the
 * spec's "Schedule Activity -> Create Delay" primary path) when it has one, falling back to
 * the Project when it doesn't — never guessing at a schedule impact the delay doesn't have
 * (see schedule.js's own "Schedule Impact Not Yet Assessed" treatment of the same case).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  // PCC Evolution Roadmap, Tier 3 ("final polish"): this used to be a hardcoded
  // constant — now reads data.settings.action_centre_upcoming_days (edited on the
  // Settings page), defaulting to the same 30 this constant always was.
  // Daily-Use Audit Phase 2: live-syncs with the shared Global Project Context
  // (Redesign Gate 6) — see dashboard.js's identical block for the full reasoning on
  // why this compares against the last-observed context value rather than a one-time
  // seed flag.
  var uiState = {
    projectFilter: "",
    lastSyncedContextId: undefined,
  };

  // Gate F: duplicated from pages/schedule.js's own DELAY_CATEGORY_LABELS verbatim — same
  // established per-module-helpers convention every other label map in this app already
  // follows (vendors.js's VENDOR_DELAY_CATEGORY_LABELS, dailyLog.js's
  // DAILY_LOG_DELAY_CATEGORY_LABELS).
  var ACTION_CENTRE_DELAY_CATEGORY_LABELS = {
    late_material: "Late Material",
    late_vendor_submission: "Late Vendor Submission",
    late_drawing: "Late Drawing",
    design_change: "Design Change",
    client_delay: "Client Delay",
    consultant_delay: "Consultant Delay",
    vendor_delay: "Vendor Delay",
    contractor_delay: "Contractor Delay",
    approval_delay: "Approval Delay",
    rfi_delay: "RFI Delay",
    resource_shortage: "Resource Shortage",
    equipment_shortage: "Equipment Shortage",
    site_access: "Site Access",
    site_constraint: "Site Constraint",
    interface_issue: "Interface Issue",
    weather: "Weather",
    procurement: "Procurement",
    quality_issue: "Quality Issue",
    rework: "Rework",
    change_variation: "Change / Variation",
    other: "Other",
  };

  function upcomingWindowDays(data) {
    return data.settings.action_centre_upcoming_days == null ? 30 : data.settings.action_centre_upcoming_days;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }
  function addDaysIso(isoDateStr, days) {
    var d = new Date(isoDateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // Same Available/Overdue/Required computation as portfolio.js/vendors.js/schedule.js/
  // dashboard.js/documentControlDashboard.js/executiveCenter.js's own copies — duplicated
  // here per this app's per-module-helpers convention.
  function computeRequirementStatus(data, projectId, documentTypeId, plannedDate) {
    var available = data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === documentTypeId;
    });
    if (available) return "available";
    if (plannedDate && plannedDate < todayIso()) return "overdue";
    return "required";
  }

  /** A due date buckets into overdue/today/week/upcoming; no due date (or a date beyond
   * the upcoming window) buckets into "waiting" — still outstanding, just nothing to sort
   * by date. Dates beyond the upcoming window return null (excluded from this gate
   * entirely — a future Lookahead gate covers the longer horizon). */
  function bucketFor(dueDate, windowDays) {
    if (!dueDate) return "waiting";
    var today = todayIso();
    if (dueDate < today) return "overdue";
    if (dueDate === today) return "today";
    if (dueDate <= addDaysIso(today, 7)) return "week";
    if (dueDate <= addDaysIso(today, windowDays)) return "upcoming";
    return null;
  }

  function collectItems(data, activeProjectIds) {
    var items = [];
    var windowDays = upcomingWindowDays(data);

    data.meetings.forEach(function (m) {
      if (!activeProjectIds[m.project_id]) return;
      (m.actions || []).forEach(function (a) {
        if (a.status !== "open") return;
        var bucket = bucketFor(a.due_date || "", windowDays);
        if (!bucket) return;
        // Gate 33 (PCC Evolution Roadmap, Tier B: Meeting Action → Control Linking) —
        // surface whichever of the action's own optional links are set, same "only show
        // what's actually there" convention meetings.js's own read-only detail uses.
        var linkParts = [];
        if (a.vendor_id) {
          var v = data.vendors.find(function (x) { return x.id === a.vendor_id; });
          if (v) linkParts.push("Vendor: " + (v.vendor_name || "(unnamed vendor)"));
        }
        if (a.activity_id) {
          var linkedAct = data.activities.find(function (x) { return x.id === a.activity_id; });
          if (linkedAct) linkParts.push("Activity: " + (linkedAct.name || "(unnamed activity)"));
        }
        items.push({
          kind: "Meeting Action",
          title: (a.description || "(no description)") + (linkParts.length ? " (" + linkParts.join(", ") + ")" : ""),
          projectId: m.project_id,
          owner: a.owner || "—",
          dueDate: a.due_date || "",
          bucket: bucket,
          view: function () {
            window.PCC.meetings.expandMeeting(m.id);
            window.PCC.router.go("meetings");
          },
        });
      });
    });

    data.rfis.forEach(function (r) {
      if (!activeProjectIds[r.project_id]) return;
      if (r.status !== "open") return;
      var bucket = bucketFor(r.date_required || "", windowDays);
      if (!bucket) return;
      items.push({
        kind: r.type === "technical_query" ? "TQ" : "RFI",
        title: (r.number || "") + (r.subject ? " — " + r.subject : ""),
        projectId: r.project_id,
        owner: r.assigned_to || "—",
        dueDate: r.date_required || "",
        bucket: bucket,
        view: function () {
          window.PCC.rfis.expandRfi(r.id);
          window.PCC.router.go("rfis");
        },
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
      if (status === "available") return;
      var bucket = bucketFor(req.planned_submission_date || "", windowDays);
      if (!bucket) return;
      var vendor = req.vendor_id ? vendorsById[req.vendor_id] : null;
      items.push({
        kind: "Document",
        title: type.name + (type.code ? " (" + type.code + ")" : ""),
        projectId: req.project_id,
        owner: vendor ? vendor.vendor_name || "(unnamed vendor)" : "—",
        dueDate: req.planned_submission_date || "",
        bucket: bucket,
        view: function () {
          window.PCC.portfolio.viewProject(req.project_id);
          window.PCC.router.go("portfolio");
        },
      });
    });

    // Gate F: Recovery Actions — the only pre-existing register with a real due date
    // (target_recovery_date) that this page didn't already surface. Same open/in_progress
    // cutoff delayRecoveryDashboard.js's own "Open Recovery Actions" section uses.
    data.recovery_actions.forEach(function (r) {
      if (!activeProjectIds[r.project_id]) return;
      if (r.status !== "open" && r.status !== "in_progress") return;
      var bucket = bucketFor(r.target_recovery_date || "", windowDays);
      if (!bucket) return;
      var activity = data.activities.find(function (a) { return a.id === r.activity_id; });
      items.push({
        kind: "Recovery Action",
        title: r.description || "(no description)",
        projectId: r.project_id,
        owner: r.responsible_person || "—",
        dueDate: r.target_recovery_date || "",
        bucket: bucket,
        // No fallback destination: a Recovery Action's only home is the Schedule Activity
        // it was entered against (renderRecoveryActionsSection() in pages/schedule.js) —
        // if that activity is gone there's nowhere real to send the planner, so the row
        // still shows (real outstanding data) but isn't clickable, same "(deleted
        // project)" treatment itemRow() already gives every other kind.
        view: activity
          ? function () {
              window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
              window.PCC.router.go("schedule");
            }
          : null,
      });
    });

    // Gate F: newly-identified Delay Records — see header comment for why only "open"
    // status ones are shown (later statuses are tracked via their own Recovery Actions,
    // already covered by the block above).
    data.delay_records.forEach(function (r) {
      if (!activeProjectIds[r.project_id]) return;
      if (r.status !== "open") return;
      var activity = r.activity_id ? data.activities.find(function (a) { return a.id === r.activity_id; }) : null;
      var categoryLabel = ACTION_CENTRE_DELAY_CATEGORY_LABELS[r.delay_category] || r.delay_category || "Other";
      items.push({
        kind: "Delay",
        title:
          categoryLabel +
          (r.description ? " — " + r.description : "") +
          (!r.activity_id ? " (Schedule Impact Not Yet Assessed)" : ""),
        projectId: r.project_id,
        owner: r.responsible_party || "—",
        dueDate: "",
        bucket: "waiting",
        view: activity
          ? function () {
              window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
              window.PCC.router.go("schedule");
            }
          : function () {
              window.PCC.portfolio.viewProject(r.project_id);
              window.PCC.router.go("portfolio");
            },
      });
    });

    data.change_orders.forEach(function (co) {
      if (!activeProjectIds[co.project_id]) return;
      if (co.status !== "pending") return;
      items.push({
        kind: "Change Order",
        title: (co.number || "") + (co.title ? " — " + co.title : ""),
        projectId: co.project_id,
        owner: co.requested_by || "—",
        dueDate: "",
        bucket: "waiting",
        view: function () {
          window.PCC.changeOrders.expandChangeOrder(co.id);
          window.PCC.router.go("changeOrders");
        },
      });
    });

    return items;
  }

  // Function, not a module-level constant, since the "Upcoming" label/empty-text embed
  // the now-configurable window — must be rebuilt from the current setting on every
  // render, not computed once at load time.
  function buildBuckets(windowDays) {
    return [
    { key: "overdue", label: "Overdue", badgeClass: "critical", emptyText: "Nothing overdue." },
    { key: "today", label: "Due Today", badgeClass: "at_risk", emptyText: "Nothing due today." },
    { key: "week", label: "Due This Week", badgeClass: "at_risk", emptyText: "Nothing due in the next 7 days." },
    { key: "upcoming", label: "Upcoming (8–" + windowDays + " Days)", badgeClass: "info", emptyText: "Nothing due in the 8–" + windowDays + " day window." },
    // Redesign Gate 7: relabeled from "Waiting For" — that label collided with My
    // Work's own "WAITING FOR" section, which means something different there (items
    // with an explicit waiting_on_party set, grouped by who). This bucket has always
    // meant "no due date at all to bucket by" (see emptyText, unchanged) — functionally
    // identical, only the label changed, so it stops reading as the same concept.
    { key: "waiting", label: "No Due Date", badgeClass: "info", emptyText: "Nothing outstanding without a due date." },
    ];
  }

  function kpiCard(label, value, colorVar) {
    var card = document.createElement("div");
    card.className = "kpi-card";
    var valueStyle = colorVar ? ' style="color:var(' + colorVar + ')"' : "";
    card.innerHTML =
      '<span class="kpi-card__label">' + label + '</span><span class="kpi-card__value mono"' + valueStyle + ">" + value + "</span>";
    return card;
  }

  // Redesign Gate 7: retrofitted onto the same .attention-list/.attention-item
  // primitive myWork.js's own item rows now use (and Executive Center's Diagnostics/
  // Management Action panels, Dashboard's Management Attention panel) — same "whole row
  // is the click target" behavior, only when a linked project still exists (a deleted
  // project's items stay listed but non-clickable, same as before this gate).
  function itemRow(item, badgeClass, projectsById) {
    var project = projectsById[item.projectId];
    var clickable = !!(project && item.view);

    var row = document.createElement("div");
    row.className = "attention-item" + (clickable ? " attention-item--clickable" : "");
    if (clickable) row.onclick = item.view;

    var icon = document.createElement("span");
    icon.className = "attention-item__icon attention-item__icon--" + badgeClass;
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
      (project ? project.name || "(unnamed project)" : "(deleted project)") +
      " · " +
      item.owner +
      (item.dueDate ? " · due " + item.dueDate : "");
    body.appendChild(meta);
    row.appendChild(body);

    return row;
  }

  function bucketPanel(bucketDef, items, projectsById) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "8px";
    heading.textContent = bucketDef.label + " (" + items.length + ")";
    panel.appendChild(heading);

    if (items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.margin = "0";
      empty.textContent = bucketDef.emptyText;
      panel.appendChild(empty);
      return panel;
    }

    var list = document.createElement("div");
    list.className = "attention-list";
    items.forEach(function (item) {
      list.appendChild(itemRow(item, bucketDef.badgeClass, projectsById));
    });
    panel.appendChild(list);

    return panel;
  }

  function render(outlet) {
    var data = window.PCC.store.get();
    var buckets = buildBuckets(upcomingWindowDays(data));
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

    var items = collectItems(data, activeProjectIds);

    var wrap = document.createElement("div");

    var h1 = document.createElement("h2");
    h1.textContent = "Planner Action Centre";
    h1.style.marginBottom = "4px";
    wrap.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "20px";
    sub.textContent =
      items.length === 0
        ? (uiState.projectFilter ? "Nothing outstanding for this project right now." : "Nothing outstanding across the active portfolio right now.")
        : "Meeting actions, RFI/TQ responses, document submissions, recovery actions, newly-identified delays, and pending Change Orders across " +
          activeProjects.length + " active project" + (activeProjects.length === 1 ? "" : "s") + ".";
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

    if (items.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent =
        "Nothing to show yet. Once Meeting Actions, RFI/TQ, Document Requirements, or Change Orders have due dates or pending status, they'll surface here.";
      wrap.appendChild(empty);
      outlet.appendChild(wrap);
      return;
    }

    var byBucket = {};
    buckets.forEach(function (b) {
      byBucket[b.key] = [];
    });
    items.forEach(function (i) {
      byBucket[i.bucket].push(i);
    });
    Object.keys(byBucket).forEach(function (key) {
      byBucket[key].sort(function (a, b) {
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        var projA = projectsById[a.projectId];
        var projB = projectsById[b.projectId];
        var nameA = projA ? projA.name || "" : "";
        var nameB = projB ? projB.name || "" : "";
        return nameA.localeCompare(nameB) || a.kind.localeCompare(b.kind);
      });
    });

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";
    kpiGrid.appendChild(kpiCard("OVERDUE", byBucket.overdue.length, byBucket.overdue.length > 0 ? "--status-critical" : null));
    kpiGrid.appendChild(kpiCard("DUE TODAY", byBucket.today.length, byBucket.today.length > 0 ? "--status-at-risk" : null));
    kpiGrid.appendChild(kpiCard("DUE THIS WEEK", byBucket.week.length, byBucket.week.length > 0 ? "--status-at-risk" : null));
    kpiGrid.appendChild(kpiCard("NO DUE DATE", byBucket.waiting.length, null));
    wrap.appendChild(kpiGrid);

    buckets.forEach(function (b) {
      wrap.appendChild(bucketPanel(b, byBucket[b.key], projectsById));
    });

    outlet.appendChild(wrap);
  }

  window.PCC.pages.actionCentre = render;
})();
