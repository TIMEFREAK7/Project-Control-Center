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
      return d.project_id === projectId && d.document_type_id === documentTypeId;
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

  function renderComplianceRow(label, group, viewBtn) {
    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.fontSize = "13px";
    row.style.gap = "8px";
    row.style.padding = "6px 0";
    row.style.borderBottom = "1px solid var(--divider)";

    var left = document.createElement("span");
    left.textContent = label + " — " + group.available + " of " + group.total + " available (" + group.pctAvailable + "%)";
    row.appendChild(left);

    var right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "8px";
    right.style.flexShrink = "0";

    if (group.overdue > 0) {
      var overdueBadge = document.createElement("span");
      overdueBadge.className = "status-badge status-badge--critical";
      overdueBadge.style.fontSize = "11px";
      overdueBadge.textContent = group.overdue + " overdue";
      right.appendChild(overdueBadge);
    }

    if (viewBtn) right.appendChild(viewBtn);

    row.appendChild(right);
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
    projectGroups.forEach(function (g) {
      var project = projectsById[g.key];
      var viewBtn = null;
      if (project && window.PCC.portfolio) {
        viewBtn = document.createElement("button");
        viewBtn.className = "btn btn--ghost";
        viewBtn.textContent = "View Project";
        viewBtn.onclick = function () {
          window.PCC.portfolio.viewProject(project.id);
          window.PCC.router.go("portfolio");
          window.PCC.router.render();
        };
      }
      projectPanel.appendChild(renderComplianceRow(project ? project.name || "(unnamed project)" : "(deleted project)", g, viewBtn));
    });
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
    typeGroups.forEach(function (g) {
      var t = typesById[g.key];
      var label = t ? t.name + (t.code ? " (" + t.code + ")" : "") : "(deleted type)";
      typePanel.appendChild(renderComplianceRow(label, g, null));
    });
    wrap.appendChild(typePanel);

    outlet.appendChild(wrap);
  }

  window.PCC.pages.documentControlDashboard = render;
})();
