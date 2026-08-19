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
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var UPCOMING_WINDOW_DAYS = 30;

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
  function bucketFor(dueDate) {
    if (!dueDate) return "waiting";
    var today = todayIso();
    if (dueDate < today) return "overdue";
    if (dueDate === today) return "today";
    if (dueDate <= addDaysIso(today, 7)) return "week";
    if (dueDate <= addDaysIso(today, UPCOMING_WINDOW_DAYS)) return "upcoming";
    return null;
  }

  function collectItems(data, activeProjectIds) {
    var items = [];

    data.meetings.forEach(function (m) {
      if (!activeProjectIds[m.project_id]) return;
      (m.actions || []).forEach(function (a) {
        if (a.status !== "open") return;
        var bucket = bucketFor(a.due_date || "");
        if (!bucket) return;
        items.push({
          kind: "Meeting Action",
          title: a.description || "(no description)",
          projectId: m.project_id,
          owner: a.owner || "—",
          dueDate: a.due_date || "",
          bucket: bucket,
          view: function () {
            window.PCC.meetings.expandMeeting(m.id);
            window.PCC.router.go("meetings");
            window.PCC.router.render();
          },
        });
      });
    });

    data.rfis.forEach(function (r) {
      if (!activeProjectIds[r.project_id]) return;
      if (r.status !== "open") return;
      var bucket = bucketFor(r.date_required || "");
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
          window.PCC.router.render();
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
      var bucket = bucketFor(req.planned_submission_date || "");
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
          window.PCC.router.render();
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
          window.PCC.router.render();
        },
      });
    });

    return items;
  }

  var BUCKETS = [
    { key: "overdue", label: "Overdue", badgeClass: "critical", emptyText: "Nothing overdue." },
    { key: "today", label: "Due Today", badgeClass: "at_risk", emptyText: "Nothing due today." },
    { key: "week", label: "Due This Week", badgeClass: "at_risk", emptyText: "Nothing due in the next 7 days." },
    { key: "upcoming", label: "Upcoming (8–" + UPCOMING_WINDOW_DAYS + " Days)", badgeClass: "info", emptyText: "Nothing due in the 8–" + UPCOMING_WINDOW_DAYS + " day window." },
    { key: "waiting", label: "Waiting For", badgeClass: "info", emptyText: "Nothing outstanding without a due date." },
  ];

  function kpiCard(label, value, colorVar) {
    var card = document.createElement("div");
    card.className = "kpi-card";
    var valueStyle = colorVar ? ' style="color:var(' + colorVar + ')"' : "";
    card.innerHTML =
      '<span class="kpi-card__label">' + label + '</span><span class="kpi-card__value mono"' + valueStyle + ">" + value + "</span>";
    return card;
  }

  function itemRow(item, badgeClass, projectsById) {
    var project = projectsById[item.projectId];

    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.fontSize = "13px";
    row.style.gap = "8px";
    row.style.padding = "6px 0";
    row.style.borderBottom = "1px solid var(--divider)";

    var text = document.createElement("span");
    text.textContent =
      "[" + item.kind + "] " +
      item.title +
      " — " +
      (project ? project.name || "(unnamed project)" : "(deleted project)") +
      " — " +
      item.owner +
      (item.dueDate ? " — due " + item.dueDate : "");
    row.appendChild(text);

    var right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "8px";
    right.style.flexShrink = "0";

    var badge = document.createElement("span");
    badge.className = "status-badge status-badge--" + badgeClass;
    badge.style.fontSize = "11px";
    badge.textContent = item.kind;
    right.appendChild(badge);

    if (project) {
      var viewBtn = document.createElement("button");
      viewBtn.className = "btn btn--ghost";
      viewBtn.textContent = "View";
      viewBtn.onclick = item.view;
      right.appendChild(viewBtn);
    }

    row.appendChild(right);
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

    items.forEach(function (item) {
      panel.appendChild(itemRow(item, bucketDef.badgeClass, projectsById));
    });

    return panel;
  }

  function render(outlet) {
    var data = window.PCC.store.get();
    var activeProjects = data.projects.filter(function (p) {
      return !p.archived;
    });
    var activeProjectIds = {};
    var projectsById = {};
    activeProjects.forEach(function (p) {
      activeProjectIds[p.id] = true;
      projectsById[p.id] = p;
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
        ? "Nothing outstanding across the active portfolio right now."
        : "Meeting actions, RFI/TQ responses, document submissions, and pending Change Orders across " +
          activeProjects.length + " active project" + (activeProjects.length === 1 ? "" : "s") + ".";
    wrap.appendChild(sub);

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
    BUCKETS.forEach(function (b) {
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
    kpiGrid.appendChild(kpiCard("WAITING FOR", byBucket.waiting.length, null));
    wrap.appendChild(kpiGrid);

    BUCKETS.forEach(function (b) {
      wrap.appendChild(bucketPanel(b, byBucket[b.key], projectsById));
    });

    outlet.appendChild(wrap);
  }

  window.PCC.pages.actionCentre = render;
})();
