/* Document Control Dashboard (Gate 26 — Document Control 12: Dashboards).
 *
 * A portfolio-wide, read-only compliance rollup for the Document Control sub-spec — distinct
 * from Gate 25's Dashboard "Document Reminders" panel (that's time-sensitive Overdue/Due-Soon
 * alerts) and from the later Executive Summary (gate 13, narrative text) and Portfolio
 * Compliance (gate 14, a rollup/report) gates. This gate is charts/tables only: overall
 * Available/Required/Overdue counts across every active project's document requirements, a
 * per-project compliance breakdown (worst-compliance-first, so problem projects surface), and a
 * per-document-type breakdown. Nothing is written back — every number here is computed at render
 * time from project_document_requirements, same "computed, never denormalized" convention every
 * Document Control gate since Gate 18 has used.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var REQUIREMENT_STATUS_BADGE = {
    available: { className: "complete", label: "Available" },
    overdue: { className: "critical", label: "Overdue" },
    required: { className: "at_risk", label: "Required" },
  };

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  // Same Available/Overdue/Required computation as portfolio.js/vendors.js/schedule.js/
  // dashboard.js's own copies — duplicated here per this app's per-module-helpers convention.
  function computeRequirementStatus(data, projectId, documentTypeId, plannedDate) {
    var available = data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at;
    });
    if (available) return "available";
    if (plannedDate && plannedDate < todayIso()) return "overdue";
    return "required";
  }

  function pct(numerator, denominator) {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 100);
  }

  function kpiCard(label, value, colorVar) {
    var card = document.createElement("div");
    card.className = "kpi-card";
    var valueStyle = colorVar ? ' style="color:var(' + colorVar + ')"' : "";
    card.innerHTML =
      '<span class="kpi-card__label">' + label + '</span><span class="kpi-card__value mono"' + valueStyle + ">" + value + "</span>";
    return card;
  }

  /** Groups `rows` (each `{ row, status }`) by `keyFn`, returning an array of
   * `{ key, total, available, overdue, pctAvailable }`, sorted worst-compliance-first
   * (lowest % Available), ties broken by highest overdue count first. */
  function groupCompliance(rows, keyFn) {
    var byKey = {};
    var order = [];
    rows.forEach(function (x) {
      var key = keyFn(x.row);
      if (!byKey[key]) {
        byKey[key] = { key: key, total: 0, available: 0, overdue: 0 };
        order.push(key);
      }
      byKey[key].total++;
      if (x.status === "available") byKey[key].available++;
      if (x.status === "overdue") byKey[key].overdue++;
    });
    var groups = order.map(function (key) {
      var g = byKey[key];
      g.pctAvailable = pct(g.available, g.total);
      return g;
    });
    groups.sort(function (a, b) {
      if (a.pctAvailable !== b.pctAvailable) return a.pctAvailable - b.pctAvailable;
      return b.overdue - a.overdue;
    });
    return groups;
  }

  // Redesign Gate 10 (Module Consistency Pass): retrofitted onto the same
  // .attention-list/.attention-item primitive every other panel-turned-list in this app
  // now uses, replacing the original hand-built row + status-badge + separate "View
  // Project" ghost button. Whole row is the click target only when onClick is given
  // (the by-project panel passes one; the by-document-type panel passes null, since
  // document types have no dedicated page to link to — same as before this gate).
  function renderComplianceRow(label, group, onClick) {
    var row = document.createElement("div");
    row.className = "attention-item" + (onClick ? " attention-item--clickable" : "");
    if (onClick) row.onclick = onClick;

    var icon = document.createElement("span");
    icon.className = "attention-item__icon attention-item__icon--" + (group.overdue > 0 ? "critical" : group.pctAvailable < 100 ? "at_risk" : "on_track");
    row.appendChild(icon);

    var body = document.createElement("div");
    body.className = "attention-item__body";
    var text = document.createElement("div");
    text.className = "attention-item__text";
    text.textContent = label;
    body.appendChild(text);
    var meta = document.createElement("div");
    meta.className = "attention-item__meta";
    meta.textContent =
      group.available + " of " + group.total + " available (" + group.pctAvailable + "%)" +
      (group.overdue > 0 ? " · " + group.overdue + " overdue" : "");
    body.appendChild(meta);
    row.appendChild(body);

    return row;
  }

  function render(outlet) {
    var data = window.PCC.store.get();
    var activeProjects = data.projects.filter(function (p) {
      return !p.archived;
    });
    var activeProjectIds = {};
    activeProjects.forEach(function (p) {
      activeProjectIds[p.id] = true;
    });
    var projectsById = {};
    activeProjects.forEach(function (p) {
      projectsById[p.id] = p;
    });
    var typesById = {};
    data.document_types.forEach(function (t) {
      typesById[t.id] = t;
    });

    var rows = data.project_document_requirements
      .filter(function (r) {
        return activeProjectIds[r.project_id] && typesById[r.document_type_id];
      })
      .map(function (r) {
        return { row: r, status: computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date) };
      });

    var wrap = document.createElement("div");

    var h1 = document.createElement("h2");
    h1.textContent = "Document Control Dashboard";
    h1.style.marginBottom = "4px";
    wrap.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "20px";
    sub.textContent =
      rows.length === 0
        ? "No document requirements assigned across the active portfolio yet — assign some from Portfolio's Add/Edit Project form."
        : "Portfolio-wide document compliance across " + activeProjects.length + " active project" + (activeProjects.length === 1 ? "" : "s") + ".";
    wrap.appendChild(sub);

    if (rows.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "Nothing to show yet. Once projects have document requirements assigned, this dashboard will break down compliance by project and by document type.";
      wrap.appendChild(empty);
      outlet.appendChild(wrap);
      return;
    }

    var totalCount = rows.length;
    var availableCount = rows.filter(function (x) {
      return x.status === "available";
    }).length;
    var overdueCount = rows.filter(function (x) {
      return x.status === "overdue";
    }).length;
    var requiredCount = totalCount - availableCount - overdueCount;

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";
    kpiGrid.appendChild(kpiCard("TOTAL REQUIREMENTS", totalCount, null));
    kpiGrid.appendChild(kpiCard("AVAILABLE", pct(availableCount, totalCount) + "%", "--status-on-track"));
    kpiGrid.appendChild(kpiCard("REQUIRED", requiredCount, requiredCount > 0 ? "--status-at-risk" : null));
    kpiGrid.appendChild(kpiCard("OVERDUE", overdueCount, overdueCount > 0 ? "--status-critical" : null));
    wrap.appendChild(kpiGrid);

    var projectGroups = groupCompliance(rows, function (r) {
      return r.project_id;
    });
    var projectPanel = document.createElement("div");
    projectPanel.className = "panel";
    projectPanel.style.marginTop = "16px";
    var projectHeading = document.createElement("h3");
    projectHeading.style.marginBottom = "8px";
    projectHeading.textContent = "Compliance by Project (worst first)";
    projectPanel.appendChild(projectHeading);
    var projectList = document.createElement("div");
    projectList.className = "attention-list";
    projectGroups.forEach(function (g) {
      var project = projectsById[g.key];
      var onClick = null;
      if (project && window.PCC.portfolio) {
        onClick = function () {
          window.PCC.portfolio.viewProject(project.id);
          window.PCC.router.go("portfolio");
        };
      }
      projectList.appendChild(renderComplianceRow(project ? project.name || "(unnamed project)" : "(deleted project)", g, onClick));
    });
    projectPanel.appendChild(projectList);
    wrap.appendChild(projectPanel);

    var typeGroups = groupCompliance(rows, function (r) {
      return r.document_type_id;
    });
    var typePanel = document.createElement("div");
    typePanel.className = "panel";
    typePanel.style.marginTop = "16px";
    var typeHeading = document.createElement("h3");
    typeHeading.style.marginBottom = "8px";
    typeHeading.textContent = "Compliance by Document Type (worst first)";
    typePanel.appendChild(typeHeading);
    var typeList = document.createElement("div");
    typeList.className = "attention-list";
    typeGroups.forEach(function (g) {
      var t = typesById[g.key];
      var label = t ? t.name + (t.code ? " (" + t.code + ")" : "") : "(deleted type)";
      typeList.appendChild(renderComplianceRow(label, g, null));
    });
    typePanel.appendChild(typeList);
    wrap.appendChild(typePanel);

    outlet.appendChild(wrap);
  }

  window.PCC.pages.documentControlDashboard = render;
})();
