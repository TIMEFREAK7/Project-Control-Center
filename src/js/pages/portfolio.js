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

  var FIELD_CONFIG = [
    { key: "name", label: "Project Name", type: "text", required: true },
    // Gate 16 (Document Control 3: Nomenclature): short code used as the PROJECT token
    // in the document naming pattern — see documentNomenclatureEngine.js. Optional; a
    // project with no code just can't be validated on that segment yet.
    { key: "project_code", label: "Project Code", type: "text" },
    { key: "client", label: "Client", type: "text" },
    { key: "company", label: "Company", type: "text" },
    { key: "country", label: "Country", type: "text" },
    { key: "location", label: "Location", type: "text" },
    { key: "sector", label: "Sector", type: "text" },
    { key: "contract_type", label: "Contract Type", type: "text" },
    // PCC Evolution Roadmap, Tier E: Portfolio Performance. This field already existed
    // in store.js (Gate 9, shown read-only in Executive Center's Overview subtitle) but
    // had no data-entry path anywhere — same "schema field with no way to ever be set"
    // gap the physical_progress bug turned out to be. Added here so the new Project
    // Type filter below isn't permanently empty.
    { key: "project_type", label: "Project Type", type: "text" },
    { key: "budget", label: "Budget", type: "number" },
    { key: "contract_value", label: "Contract Value", type: "number" },
    { key: "currency", label: "Currency", type: "text" },
    { key: "start_date", label: "Start Date", type: "date" },
    { key: "finish_date", label: "Finish Date", type: "date" },
    { key: "status", label: "Status", type: "select" },
    { key: "progress", label: "Progress (%)", type: "number", min: 0, max: 100 },
    { key: "project_manager", label: "Project Manager", type: "text" },
    { key: "planner", label: "Planner", type: "text" },
    { key: "engineers", label: "Engineers", type: "text" },
    { key: "contractor", label: "Contractor", type: "text" },
    { key: "consultant", label: "Consultant", type: "text" },
    { key: "owner", label: "Owner", type: "text" },
  ];

  // View-local UI state (not persisted — resets each time you navigate away and back).
  var uiState = {
    search: "",
    statusFilter: "",
    showArchived: false,
    // PCC Evolution Roadmap, Tier E: Portfolio Performance. Every field below already
    // existed on the project schema, just never wired as a filter — see the compare-
    // table gate's own scope note.
    clientFilter: "",
    countryFilter: "",
    sectorFilter: "",
    pmFilter: "",
    plannerFilter: "",
    typeFilter: "",
    yearFilter: "", // filters by start_date's year
    view: "cards", // 'cards' | 'compare'
    editingId: null, // null = form closed, "new" = creating, otherwise an existing project id
    expandedId: null, // project id whose details panel is open, or null
    vendorLinkPickerOpen: false, // Gate 9: "+ Link Vendor" inline picker in the Vendors section below
    // Gate 18 (Document Control UX refinement): document-requirement selection lives in
    // the Add/Edit Project form itself now (not a separately-toggled section on an
    // already-created project) — see renderDocumentRequirementsField(). These hold the
    // form's *uncommitted* selection while it's open; nothing is written to the store
    // until Save. Initialized when the form is opened (by the "+ Add Project"/"Edit"/
    // "Edit Requirements" entry points below), not by render() itself, so a checkbox
    // toggle's rerender doesn't wipe out what's already been checked.
    formSelectedDocTypeIds: [],
    formDocTemplateKey: "",
    // Gate 5 (Document Control 5: Schedule Due Dates): uncommitted per-type planned
    // submission dates, keyed by document_type_id, mirroring formSelectedDocTypeIds'
    // "seeded at the button-click moment, never inside render()" treatment.
    formDueDates: {},
    // Gate 6 (Document Control 6: Vendor Register): uncommitted per-type assigned
    // vendor, keyed by document_type_id — which vendor (from the existing Vendor
    // Management module) is expected to submit this document. Same uncommitted-until-
    // Save, seeded-at-button-click treatment as formDueDates.
    formVendorIds: {},
    // Gate 7 (Document Control 7: Schedule↔Document Linking): uncommitted per-type
    // linked Schedule activity, keyed by document_type_id. Same treatment as
    // formDueDates/formVendorIds — purely a link, no date is derived from it here.
    formActivityIds: {},
    // Gate 8 (Document Control 8: Schedule-Driven Dates/Lead Time): uncommitted per-type
    // lead time in days, keyed by document_type_id. Only meaningful alongside
    // formActivityIds — used to compute a *suggested* due date, applied to
    // formDueDates only via an explicit "Use suggested date" action, never
    // automatically. Same seeded-at-button-click treatment as the others.
    formLeadTimes: {},
  };

  function formatMoney(value, currency) {
    if (value === null || value === undefined || value === "") return "\u2014";
    var num = Number(value);
    if (Number.isNaN(num)) return "\u2014";
    return (currency ? currency + " " : "") + num.toLocaleString();
  }

  function buildField(cfg, project) {
    var field = document.createElement("div");
    field.className = "field";

    var label = document.createElement("label");
    label.textContent = cfg.label + (cfg.required ? " *" : "");
    label.setAttribute("for", "field-" + cfg.key);
    field.appendChild(label);

    var input;
    if (cfg.type === "select") {
      input = document.createElement("select");
      window.PCC.store.PROJECT_STATUSES.forEach(function (statusKey) {
        var opt = document.createElement("option");
        opt.value = statusKey;
        opt.textContent = STATUS_LABELS[statusKey] || statusKey;
        input.appendChild(opt);
      });
      input.value = project[cfg.key] || "on_track";
    } else {
      input = document.createElement("input");
      input.type = cfg.type;
      if (cfg.type === "number") {
        if (cfg.min !== undefined) input.min = cfg.min;
        if (cfg.max !== undefined) input.max = cfg.max;
      }
      input.value = project[cfg.key] === null || project[cfg.key] === undefined ? "" : project[cfg.key];
    }
    input.id = "field-" + cfg.key;
    input.name = cfg.key;
    if (cfg.required) input.required = true;

    field.appendChild(input);
    return field;
  }

  function readFormValues(formEl) {
    var values = {};
    FIELD_CONFIG.forEach(function (cfg) {
      var el = formEl.querySelector("#field-" + cfg.key);
      if (!el) return;
      if (cfg.type === "number") {
        values[cfg.key] = el.value === "" ? null : Number(el.value);
      } else {
        values[cfg.key] = el.value;
      }
    });
    return values;
  }

  // Gate 18 (Document Control UX refinement): "Available" vs "Required" is never
  // stored on the requirement row itself — it's computed by checking whether a
  // document already exists for this project with a matching document_type_id. Same
  // "computed at render time, never denormalized" pattern Gate 13/17 used for "latest
  // revision" per document group.
  function computeRequirementAvailability(data, projectId, documentTypeId) {
    return data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === documentTypeId;
    });
  }

  // Gate 5 (Document Control 5: Schedule Due Dates). "Overdue" is computed the same
  // way "Available" is — never stored — by comparing a requirement's manual
  // planned_submission_date against today, and only applies when the requirement isn't
  // already available. Returns "available" | "overdue" | "required".
  function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function computeRequirementStatus(data, projectId, documentTypeId, plannedDate) {
    if (computeRequirementAvailability(data, projectId, documentTypeId)) return "available";
    if (plannedDate && plannedDate < todayIsoDate()) return "overdue";
    return "required";
  }

  var REQUIREMENT_STATUS_BADGE = {
    available: { className: "complete", label: "Available" },
    overdue: { className: "critical", label: "Overdue" },
    required: { className: "at_risk", label: "Required" },
  };

  /** Gate 7 (Document Control 7: Schedule↔Document Linking). Same helper as
   * risks.js/documents.js's own activityOptionsFor() — duplicated per this app's
   * established convention of each page module owning its own small helpers rather
   * than sharing a util layer. Populates `select` with the given project's Schedule
   * activities (labeled "<schedule name>: <activity name>"), plus a "(none)" option. */
  function activityOptionsFor(select, data, projectId, selectedActivityId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "(none)";
    select.appendChild(noneOpt);

    var scheduleNameById = {};
    data.schedules
      .filter(function (s) { return s.project_id === projectId; })
      .forEach(function (s) { scheduleNameById[s.id] = s.name; });

    data.activities
      .filter(function (a) { return a.project_id === projectId; })
      .forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = (scheduleNameById[a.schedule_id] || "(schedule)") + ": " + (a.name || "(unnamed activity)");
        select.appendChild(opt);
      });
    select.value = selectedActivityId || "";
  }

  // Gate 8 (Document Control 8: Schedule-Driven Dates/Lead Time). Same day-math helpers
  // as scheduleGanttLayout.js's own toDayNumber()/toIsoDate()/addDays(), duplicated per
  // this app's per-module-helpers convention.
  var DAY_MS = 24 * 60 * 60 * 1000;
  function toDayNumber(isoDateStr) {
    return Math.round(new Date(isoDateStr + "T00:00:00Z").getTime() / DAY_MS);
  }
  function toIsoDate(dayNumber) {
    return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
  }
  function addDays(isoDateStr, days) {
    return toIsoDate(toDayNumber(isoDateStr) + days);
  }

  /** Same date precedence as scheduleGanttLayout.js's effectiveDates(): calculated
   * (early_start) wins over planned (planned_start) when present. Only the start date
   * matters here — a document requirement's suggested due date is anchored to when the
   * governing activity BEGINS, not when it finishes. */
  function activityStartDate(activity) {
    if (!activity) return null;
    return activity.early_start || activity.planned_start || null;
  }

  /** Returns a suggested planned_submission_date (YYYY-MM-DD) — the linked activity's
   * start date minus the lead time — or null if activity_id/lead_time_days aren't both
   * set, the activity can't be found, or it has no usable start date yet (e.g. the CPM
   * engine hasn't run and no planned_start was given either). Purely advisory: never
   * written to formDueDates except via an explicit "Use suggested date" click. */
  function computeSuggestedDueDate(data, activityId, leadTimeDays) {
    if (!activityId || !leadTimeDays) return null;
    var activity = data.activities.find(function (a) {
      return a.id === activityId;
    });
    var startDate = activityStartDate(activity);
    if (!startDate) return null;
    return addDays(startDate, -leadTimeDays);
  }

  function renderForm(container, project, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Project" : "Edit Project";
    panel.appendChild(heading);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    FIELD_CONFIG.forEach(function (cfg) {
      grid.appendChild(buildField(cfg, project));
    });
    form.appendChild(grid);

    form.appendChild(renderDocumentRequirementsField(project));

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Project Name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Project" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingId = null;
      onSaved();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var values = readFormValues(form);
      if (!values.name || !values.name.trim()) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      window.PCC.store.update(function (data) {
        var projectId;
        if (isNew) {
          var created = window.PCC.store.newProject(values);
          data.projects.push(created);
          projectId = created.id;
        } else {
          var existing = data.projects.find(function (p) {
            return p.id === project.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
          projectId = project.id;
        }

        // Gate 18: reconcile project_document_requirements against the form's
        // uncommitted selection, atomically with the project record itself. Gate 5
        // (Document Control 5) additionally reconciles each selected type's planned
        // submission date from uiState.formDueDates; Gate 6 does the same for the
        // assigned vendor from uiState.formVendorIds; Gate 7 does the same for the
        // linked Schedule activity from uiState.formActivityIds; Gate 8 does the same
        // for the lead time from uiState.formLeadTimes.
        var selected = {};
        uiState.formSelectedDocTypeIds.forEach(function (typeId) {
          selected[typeId] = true;
        });
        var existingByTypeId = {};
        data.project_document_requirements
          .filter(function (r) {
            return r.project_id === projectId;
          })
          .forEach(function (r) {
            existingByTypeId[r.document_type_id] = r;
          });
        data.project_document_requirements = data.project_document_requirements.filter(function (r) {
          return r.project_id !== projectId || selected[r.document_type_id];
        });
        Object.keys(selected).forEach(function (typeId) {
          var plannedDate = uiState.formDueDates[typeId] || null;
          var vendorId = uiState.formVendorIds[typeId] || "";
          var activityId = uiState.formActivityIds[typeId] || "";
          var leadTimeDays = uiState.formLeadTimes[typeId] || null;
          var existingRow = existingByTypeId[typeId];
          if (existingRow) {
            existingRow.planned_submission_date = plannedDate;
            existingRow.vendor_id = vendorId;
            existingRow.activity_id = activityId;
            existingRow.lead_time_days = leadTimeDays;
          } else {
            data.project_document_requirements.push(
              window.PCC.store.newProjectDocumentRequirement({
                project_id: projectId,
                document_type_id: typeId,
                planned_submission_date: plannedDate,
                vendor_id: vendorId,
                activity_id: activityId,
                lead_time_days: leadTimeDays,
              })
            );
          }
        });
      });

      window.PCC.notify(isNew ? "Project added." : "Project updated.", "success");
      uiState.editingId = null;
      onSaved();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function projectMatchesFilters(p) {
    if (!uiState.showArchived && p.archived) return false;
    if (uiState.statusFilter && p.status !== uiState.statusFilter) return false;
    if (uiState.clientFilter && p.client !== uiState.clientFilter) return false;
    if (uiState.countryFilter && p.country !== uiState.countryFilter) return false;
    if (uiState.sectorFilter && p.sector !== uiState.sectorFilter) return false;
    if (uiState.pmFilter && p.project_manager !== uiState.pmFilter) return false;
    if (uiState.plannerFilter && p.planner !== uiState.plannerFilter) return false;
    if (uiState.typeFilter && p.project_type !== uiState.typeFilter) return false;
    if (uiState.yearFilter && (p.start_date || "").slice(0, 4) !== uiState.yearFilter) return false;
    if (uiState.search) {
      var haystack = (p.name + " " + p.client + " " + p.company).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------------
  // Portfolio Performance (PCC Evolution Roadmap, Tier E) — KPI strip, filters, and the
  // Cards/Compare view toggle. Nothing here is stored; every number is computed at
  // render time from data.projects/activities plus executiveCenter.js's exported
  // getHealthSummary(), same "computed, never denormalized" convention this app has
  // used since Document Control's Available/Overdue/Required status.
  // ---------------------------------------------------------------------------------

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

  function projectIsUpcoming(p, data) {
    var todayIso = new Date().toISOString().slice(0, 10);
    if (p.start_date) return p.start_date > todayIso;
    return !data.activities.some(function (a) { return a.project_id === p.id; });
  }

  function computePortfolioKpis(data) {
    var nonArchived = data.projects.filter(function (p) { return !p.archived; });
    var delayedCount = 0;
    var upcomingCount = 0;
    nonArchived.forEach(function (p) {
      var summary = window.PCC.executiveCenter.getHealthSummary(p.id);
      if (summary.delayedActivityCount > 0) delayedCount++;
      if (projectIsUpcoming(p, data)) upcomingCount++;
    });
    return {
      total: data.projects.length,
      active: nonArchived.length,
      completed: data.projects.filter(function (p) { return p.status === "complete"; }).length,
      atRisk: nonArchived.filter(function (p) { return p.status === "at_risk"; }).length,
      delayed: delayedCount,
      upcoming: upcomingCount,
    };
  }

  function renderKpiStrip(kpis) {
    var grid = document.createElement("div");
    grid.className = "kpi-grid";
    grid.style.marginBottom = "16px";
    [
      { label: "TOTAL PROJECTS", value: kpis.total, colorVar: null },
      { label: "ACTIVE", value: kpis.active, colorVar: null },
      { label: "COMPLETED", value: kpis.completed, colorVar: null },
      { label: "AT RISK", value: kpis.atRisk, colorVar: kpis.atRisk > 0 ? "--status-at-risk" : null },
      { label: "DELAYED", value: kpis.delayed, colorVar: kpis.delayed > 0 ? "--status-critical" : null },
      { label: "UPCOMING", value: kpis.upcoming, colorVar: null },
    ].forEach(function (kpi) {
      var card = document.createElement("div");
      card.className = "kpi-card";
      var valueStyle = kpi.colorVar ? ' style="color:var(' + kpi.colorVar + ')"' : "";
      card.innerHTML =
        '<span class="kpi-card__label">' + kpi.label + '</span><span class="kpi-card__value mono"' + valueStyle + ">" + kpi.value + "</span>";
      grid.appendChild(card);
    });
    return grid;
  }

  var RAG_BADGE_CLASS = { on_track: "on_track", at_risk: "at_risk", critical: "critical", unknown: "info" };
  var RAG_LABEL = { on_track: "On Track", at_risk: "At Risk", critical: "Critical", unknown: "—" };

  function ragCell(rag) {
    var span = document.createElement("span");
    span.className = "status-badge status-badge--" + (RAG_BADGE_CLASS[rag] || "info");
    span.textContent = RAG_LABEL[rag] || rag;
    return span;
  }

  /** The comparison table view — Project / Progress / Schedule / Risk / Health, per the
   * roadmap's own example. Schedule/Risk/Health are the *computed* RAG bands from
   * executiveCenter.js's health-score engine, deliberately distinct from the project's
   * own manually-set `status` field the Cards view shows — they can disagree, and
   * that's the point (a transparent, rule-based second opinion, not just an echo of the
   * manual field). Progress is the project's own manually-tracked % (same field Cards
   * already shows), not the schedule-derived percent — Executive Center's own Overview
   * already draws that distinction between "Overall Progress" and "Schedule Progress". */
  function renderCompareTable(projects, onChanged) {
    var wrap = document.createElement("div");
    wrap.className = "panel";

    if (projects.length === 0) {
      wrap.className = "panel empty-state";
      wrap.textContent = "No projects match this search/filter.";
      return wrap;
    }

    var table = document.createElement("table");
    table.className = "data-table";
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Project</th><th>Progress</th><th>Schedule</th><th>Risk</th><th>Health</th></tr>";
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    projects.forEach(function (p) {
      var summary = window.PCC.executiveCenter.getHealthSummary(p.id);
      var row = document.createElement("tr");

      var nameCell = document.createElement("td");
      var nameBtn = document.createElement("button");
      nameBtn.className = "btn btn--ghost";
      nameBtn.textContent = p.name || "(unnamed project)";
      nameBtn.onclick = function () {
        uiState.expandedId = p.id;
        uiState.view = "cards";
        onChanged();
      };
      nameCell.appendChild(nameBtn);
      row.appendChild(nameCell);

      var progressCell = document.createElement("td");
      progressCell.textContent = (p.progress || 0) + "%";
      row.appendChild(progressCell);

      var scheduleCell = document.createElement("td");
      scheduleCell.appendChild(ragCell(summary.scheduleRag));
      row.appendChild(scheduleCell);

      var riskCell = document.createElement("td");
      riskCell.appendChild(ragCell(summary.riskRag));
      row.appendChild(riskCell);

      var healthCell = document.createElement("td");
      healthCell.appendChild(ragCell(summary.rag));
      if (summary.score != null) {
        var scoreSpan = document.createElement("span");
        scoreSpan.className = "text-secondary";
        scoreSpan.style.fontSize = "11px";
        scoreSpan.style.marginLeft = "6px";
        scoreSpan.textContent = summary.score;
        healthCell.appendChild(scoreSpan);
      }
      row.appendChild(healthCell);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderProjectCard(p, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card" + (p.archived ? " project-card--archived" : "");

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'>" +
      (p.name || "(unnamed project)") +
      "</div><div class='project-card__meta'>" +
      [p.client, p.company, p.country].filter(Boolean).join(" \u00b7 ") +
      "</div>";

    var badge = document.createElement("span");
    badge.className = "status-badge status-badge--" + p.status;
    badge.textContent = STATUS_LABELS[p.status] || p.status;

    var progress = document.createElement("div");
    progress.className = "project-card__progress";
    progress.innerHTML =
      "<div class='progress-track'><div class='progress-fill' style='width:" +
      Math.max(0, Math.min(100, p.progress || 0)) +
      "%;'></div></div><span class='mono text-secondary' style='font-size:12px;'>" +
      (p.progress || 0) +
      "%</span>";

    var figures = document.createElement("div");
    figures.className = "project-card__figures";
    figures.innerHTML =
      "Budget " + formatMoney(p.budget, p.currency) + "<br>Finish " + (p.finish_date || "\u2014");

    var actions = document.createElement("div");
    actions.className = "project-card__actions";

    var execCenterBtn = document.createElement("button");
    execCenterBtn.className = "btn btn--ghost";
    execCenterBtn.textContent = "Executive Center";
    execCenterBtn.onclick = function () {
      if (window.PCC.executiveCenter) window.PCC.executiveCenter.viewProject(p.id);
      window.PCC.router.go("executiveCenter");
    };

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === p.id ? "Hide Details" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === p.id ? null : p.id;
      onChanged();
    };

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      var data = window.PCC.store.get();
      var projectRequirements = data.project_document_requirements.filter(function (r) {
        return r.project_id === p.id;
      });
      uiState.formSelectedDocTypeIds = projectRequirements.map(function (r) {
        return r.document_type_id;
      });
      uiState.formDueDates = {};
      uiState.formVendorIds = {};
      uiState.formActivityIds = {};
      uiState.formLeadTimes = {};
      projectRequirements.forEach(function (r) {
        if (r.planned_submission_date) uiState.formDueDates[r.document_type_id] = r.planned_submission_date;
        if (r.vendor_id) uiState.formVendorIds[r.document_type_id] = r.vendor_id;
        if (r.activity_id) uiState.formActivityIds[r.document_type_id] = r.activity_id;
        if (r.lead_time_days) uiState.formLeadTimes[r.document_type_id] = r.lead_time_days;
      });
      uiState.formDocTemplateKey = "";
      uiState.editingId = p.id;
      onChanged();
    };

    var archiveBtn = document.createElement("button");
    archiveBtn.className = "btn btn--ghost";
    archiveBtn.textContent = p.archived ? "Unarchive" : "Archive";
    archiveBtn.onclick = function () {
      var wasArchived = p.archived;
      window.PCC.store.update(function (data) {
        var existing = data.projects.find(function (proj) {
          return proj.id === p.id;
        });
        if (existing) {
          existing.archived = !existing.archived;
          existing.updated_at = new Date().toISOString();
        }
      });
      window.PCC.notify(wasArchived ? "Project unarchived." : "Project archived.", "info");
      onChanged();
    };

    actions.appendChild(execCenterBtn);
    actions.appendChild(detailsBtn);
    actions.appendChild(editBtn);
    actions.appendChild(archiveBtn);

    card.appendChild(main);
    card.appendChild(badge);
    card.appendChild(progress);
    card.appendChild(figures);
    card.appendChild(actions);
    return card;
  }

  var DETAIL_FIELDS = [
    { key: "project_code", label: "Project Code" },
    { key: "sector", label: "Sector" },
    { key: "contract_type", label: "Contract Type" },
    { key: "contract_value", label: "Contract Value", money: true },
    { key: "start_date", label: "Start Date" },
    { key: "location", label: "Location" },
    { key: "project_manager", label: "Project Manager" },
    { key: "planner", label: "Planner" },
    { key: "engineers", label: "Engineers" },
    { key: "contractor", label: "Contractor" },
    { key: "consultant", label: "Consultant" },
    { key: "owner", label: "Owner" },
  ];

  /** Gate 18 (Document Control UX refinement): which of the master repository's ACTIVE
   * document types apply to this project, selected inline as part of the Add/Edit
   * Project form itself — previously this lived in a separately-toggled section that
   * only appeared after the project already existed, which was the exact behavior the
   * user flagged as wrong. Operates on uiState.formSelectedDocTypeIds, an uncommitted
   * array of document_type ids initialized once when the form opens (see the "+ Add
   * Project"/"Edit"/"Edit Requirements" entry points) and reconciled into
   * project_document_requirements rows atomically with the project record on Save — see
   * renderForm()'s submit handler. "Apply Template" (PROJECT_TEMPLATES, store.js) only
   * ADDS ids for types whose name matches one of the template's suggested names among
   * this install's ACTIVE types — it never removes an existing selection. Rebuilds its
   * own subtree on every change (rather than triggering a full form rerender) so
   * in-progress edits to the other fields above aren't disturbed. Gate 5 (Document
   * Control 5: Schedule Due Dates) adds an optional manual due date per selected type,
   * mirrored in uiState.formDueDates the same way selection itself is mirrored in
   * formSelectedDocTypeIds; Gate 6 (Document Control 6: Vendor Register) adds an
   * optional assigned vendor per selected type the same way, in uiState.formVendorIds,
   * reusing the existing Vendor Management vendor list rather than a new register; Gate
   * 7 (Document Control 7: Schedule↔Document Linking) adds an optional link to one of
   * this project's own Schedule activities, in uiState.formActivityIds; Gate 8
   * (Schedule-Driven Dates/Lead Time) adds an optional lead time in
   * uiState.formLeadTimes, used only to compute a *suggested* due date (the linked
   * activity's start date minus the lead time) — applied to formDueDates solely via an
   * explicit "Use" click, never automatically. All five are uncommitted until Save. */
  function renderDocumentRequirementsField(project) {
    var fieldWrap = document.createElement("div");
    fieldWrap.style.marginTop = "18px";
    fieldWrap.style.paddingTop = "14px";
    fieldWrap.style.borderTop = "1px solid var(--divider)";

    function refresh() {
      fieldWrap.innerHTML = "";
      var data = window.PCC.store.get();
      var activeTypes = window.PCC.documentTypes ? window.PCC.documentTypes.activeTypes() : [];

      var label = document.createElement("div");
      label.className = "detail-item__label";
      label.textContent =
        "DOCUMENT REQUIREMENTS (" + uiState.formSelectedDocTypeIds.length + " of " + activeTypes.length + ")";
      fieldWrap.appendChild(label);

      var hint = document.createElement("p");
      hint.className = "text-secondary";
      hint.style.fontSize = "12px";
      hint.style.margin = "4px 0 0";
      hint.textContent =
        "Select which document types this project needs. Status updates automatically once a matching document is attached.";
      fieldWrap.appendChild(hint);

      if (activeTypes.length === 0) {
        var noneNote = document.createElement("p");
        noneNote.className = "text-secondary";
        noneNote.style.fontSize = "13px";
        noneNote.style.margin = "8px 0 0";
        noneNote.textContent = "No active document types in the master repository yet — add some in Document Types first.";
        fieldWrap.appendChild(noneNote);
        return;
      }

      var toolbar = document.createElement("div");
      toolbar.style.display = "flex";
      toolbar.style.gap = "8px";
      toolbar.style.alignItems = "center";
      toolbar.style.flexWrap = "wrap";
      toolbar.style.marginTop = "8px";

      var templateSelect = document.createElement("select");
      var pickOpt = document.createElement("option");
      pickOpt.value = "";
      pickOpt.textContent = "Apply a template…";
      templateSelect.appendChild(pickOpt);
      window.PCC.store.PROJECT_TEMPLATES.forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = t.key;
        opt.textContent = t.label;
        templateSelect.appendChild(opt);
      });
      templateSelect.value = uiState.formDocTemplateKey;
      templateSelect.onchange = function () {
        uiState.formDocTemplateKey = templateSelect.value;
      };
      toolbar.appendChild(templateSelect);

      var applyTemplateBtn = document.createElement("button");
      applyTemplateBtn.type = "button";
      applyTemplateBtn.className = "btn btn--ghost";
      applyTemplateBtn.textContent = "Apply";
      applyTemplateBtn.onclick = function () {
        var template = window.PCC.store.PROJECT_TEMPLATES.find(function (t) {
          return t.key === templateSelect.value;
        });
        if (!template) return;
        var matchedNames = {};
        template.suggested_type_names.forEach(function (n) {
          matchedNames[n.toLowerCase()] = true;
        });
        var selectedSet = {};
        uiState.formSelectedDocTypeIds.forEach(function (id) {
          selectedSet[id] = true;
        });
        var added = 0;
        activeTypes.forEach(function (t) {
          if (matchedNames[(t.name || "").toLowerCase()] && !selectedSet[t.id]) {
            uiState.formSelectedDocTypeIds.push(t.id);
            added++;
          }
        });
        if (added === 0) {
          window.PCC.notify("Nothing new to add — every matching type from “" + template.label + "” is already selected.", "info");
          return;
        }
        window.PCC.notify("Added " + added + " requirement(s) from “" + template.label + "”.", "success");
        refresh();
      };
      toolbar.appendChild(applyTemplateBtn);
      fieldWrap.appendChild(toolbar);

      var byCategory = {};
      var categoryOrder = [];
      activeTypes
        .slice()
        .sort(function (a, b) {
          return (a.name || "").localeCompare(b.name || "");
        })
        .forEach(function (t) {
          var cat = t.category || "(uncategorized)";
          if (!byCategory[cat]) {
            byCategory[cat] = [];
            categoryOrder.push(cat);
          }
          byCategory[cat].push(t);
        });
      categoryOrder.sort();

      var checklist = document.createElement("div");
      checklist.style.marginTop = "10px";
      checklist.style.display = "flex";
      checklist.style.flexDirection = "column";
      checklist.style.gap = "10px";

      categoryOrder.forEach(function (cat) {
        var group = document.createElement("div");

        var groupLabel = document.createElement("div");
        groupLabel.className = "text-secondary";
        groupLabel.style.fontSize = "11px";
        groupLabel.style.fontWeight = "600";
        groupLabel.style.marginBottom = "4px";
        groupLabel.textContent = cat.toUpperCase();
        group.appendChild(groupLabel);

        byCategory[cat].forEach(function (t) {
          var row = document.createElement("label");
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.gap = "8px";
          row.style.fontSize = "13px";
          row.style.padding = "2px 0";

          var checked = uiState.formSelectedDocTypeIds.indexOf(t.id) !== -1;

          var checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = checked;
          checkbox.onchange = function () {
            var idx = uiState.formSelectedDocTypeIds.indexOf(t.id);
            if (checkbox.checked) {
              if (idx === -1) uiState.formSelectedDocTypeIds.push(t.id);
            } else if (idx !== -1) {
              uiState.formSelectedDocTypeIds.splice(idx, 1);
              delete uiState.formDueDates[t.id];
              delete uiState.formVendorIds[t.id];
              delete uiState.formActivityIds[t.id];
              delete uiState.formLeadTimes[t.id];
            }
            refresh();
          };
          row.appendChild(checkbox);

          var textSpan = document.createElement("span");
          textSpan.textContent = t.name + (t.code ? " (" + t.code + ")" : "");
          row.appendChild(textSpan);

          if (checked) {
            // Gate 5 (Document Control 5): manual due date, uncommitted until Save.
            var dueInput = document.createElement("input");
            dueInput.type = "date";
            dueInput.value = uiState.formDueDates[t.id] || "";
            dueInput.style.fontSize = "12px";
            dueInput.style.padding = "2px 4px";
            dueInput.title = "Planned submission date (optional)";
            dueInput.onchange = function () {
              if (dueInput.value) {
                uiState.formDueDates[t.id] = dueInput.value;
              } else {
                delete uiState.formDueDates[t.id];
              }
              refresh();
            };
            row.appendChild(dueInput);

            // Gate 6 (Document Control 6: Vendor Register): optional assigned vendor,
            // uncommitted until Save, reusing the existing Vendor Management vendor
            // list — no new register of its own.
            var vendorSelect = document.createElement("select");
            vendorSelect.style.fontSize = "12px";
            vendorSelect.style.padding = "2px 4px";
            vendorSelect.title = "Vendor expected to submit this document (optional)";
            var noVendorOpt = document.createElement("option");
            noVendorOpt.value = "";
            noVendorOpt.textContent = "(no vendor)";
            vendorSelect.appendChild(noVendorOpt);
            data.vendors.forEach(function (v) {
              var opt = document.createElement("option");
              opt.value = v.id;
              opt.textContent = v.vendor_name || "(unnamed vendor)";
              vendorSelect.appendChild(opt);
            });
            vendorSelect.value = uiState.formVendorIds[t.id] || "";
            vendorSelect.onchange = function () {
              if (vendorSelect.value) {
                uiState.formVendorIds[t.id] = vendorSelect.value;
              } else {
                delete uiState.formVendorIds[t.id];
              }
            };
            row.appendChild(vendorSelect);

            // Gate 7 (Document Control 7: Schedule↔Document Linking): optional link to
            // one of this project's own Schedule activities, uncommitted until Save.
            // Purely a link — doesn't read or write formDueDates in either direction.
            var activitySelect = document.createElement("select");
            activitySelect.style.fontSize = "12px";
            activitySelect.style.padding = "2px 4px";
            activitySelect.title = "Linked Schedule activity (optional)";
            activityOptionsFor(activitySelect, data, project.id, uiState.formActivityIds[t.id] || "");
            activitySelect.onchange = function () {
              if (activitySelect.value) {
                uiState.formActivityIds[t.id] = activitySelect.value;
              } else {
                delete uiState.formActivityIds[t.id];
              }
              refresh();
            };
            row.appendChild(activitySelect);

            // Gate 8 (Document Control 8: Schedule-Driven Dates/Lead Time): optional
            // lead time, only meaningful alongside the linked activity above. Never
            // computes/writes a due date by itself — see the "Use suggested date"
            // affordance below for the one explicit path that does.
            var leadTimeInput = document.createElement("input");
            leadTimeInput.type = "number";
            leadTimeInput.min = "0";
            leadTimeInput.style.fontSize = "12px";
            leadTimeInput.style.padding = "2px 4px";
            leadTimeInput.style.width = "60px";
            leadTimeInput.title = "Lead time in days before the linked activity starts (optional)";
            leadTimeInput.placeholder = "Lead days";
            leadTimeInput.value = uiState.formLeadTimes[t.id] || "";
            leadTimeInput.onchange = function () {
              var num = leadTimeInput.value === "" ? null : Number(leadTimeInput.value);
              if (num) {
                uiState.formLeadTimes[t.id] = num;
              } else {
                delete uiState.formLeadTimes[t.id];
              }
              refresh();
            };
            row.appendChild(leadTimeInput);

            var suggestedDate = computeSuggestedDueDate(data, uiState.formActivityIds[t.id], uiState.formLeadTimes[t.id]);
            if (suggestedDate && suggestedDate !== (uiState.formDueDates[t.id] || "")) {
              var suggestionWrap = document.createElement("span");
              suggestionWrap.style.fontSize = "11px";
              suggestionWrap.style.color = "var(--text-secondary)";
              suggestionWrap.textContent = "Suggested: " + suggestedDate + " ";
              var useSuggestedBtn = document.createElement("button");
              useSuggestedBtn.type = "button";
              useSuggestedBtn.className = "btn btn--ghost";
              useSuggestedBtn.style.fontSize = "11px";
              useSuggestedBtn.style.padding = "1px 6px";
              useSuggestedBtn.textContent = "Use";
              useSuggestedBtn.onclick = function () {
                uiState.formDueDates[t.id] = suggestedDate;
                refresh();
              };
              suggestionWrap.appendChild(useSuggestedBtn);
              row.appendChild(suggestionWrap);
            }

            var status = computeRequirementStatus(data, project.id, t.id, uiState.formDueDates[t.id] || null);
            var badgeInfo = REQUIREMENT_STATUS_BADGE[status];
            var statusBadge = document.createElement("span");
            statusBadge.className = "status-badge status-badge--" + badgeInfo.className;
            statusBadge.style.fontSize = "11px";
            statusBadge.textContent = badgeInfo.label;
            row.appendChild(statusBadge);
          }

          group.appendChild(row);
        });

        checklist.appendChild(group);
      });

      fieldWrap.appendChild(checklist);
    }

    refresh();
    return fieldWrap;
  }

  /** Gate 18 (Document Control UX refinement): read-only summary of this project's
   * document requirements for the Details panel — selection itself now happens in the
   * Add/Edit Project form (see renderDocumentRequirementsField() above). "Available" /
   * "Overdue" (Gate 5: Document Control 5) / "Required" is never stored; it's computed
   * from whether a matching document exists and, if not, whether the manual
   * planned_submission_date has passed — same "computed at render time, never
   * denormalized" pattern Gate 13/17 used for "latest revision". */
  function renderDocumentRequirementsSection(p, onChanged) {
    var data = window.PCC.store.get();
    // Deliberately keyed off ALL document_types, not just active ones: a requirement
    // selected while its type was active must keep showing here (with its name) even
    // if that type is later deactivated — deactivating only hides a type from the
    // *selectable* checklist in the form, it never retroactively drops an existing
    // project's requirement. Only a fully-deleted type (documentTypes.js supports
    // delete, not just deactivate) leaves no entry here, which the filter below guards.
    var typesById = {};
    data.document_types.forEach(function (t) {
      typesById[t.id] = t;
    });
    // Gate 6 (Document Control 6: Vendor Register): looked up the same way — a
    // requirement's assigned vendor keeps showing by name even if that vendor record
    // is later deleted from Vendor Management (falls back to not showing a vendor at
    // all, rather than throwing on a missing lookup).
    var vendorsById = {};
    data.vendors.forEach(function (v) {
      vendorsById[v.id] = v;
    });
    // Gate 7 (Document Control 7: Schedule↔Document Linking): same defensive lookup —
    // a requirement's linked activity keeps showing by name even if that activity is
    // later deleted from the Schedule (falls back to not showing a link at all).
    var activitiesById = {};
    data.activities.forEach(function (a) {
      activitiesById[a.id] = a;
    });
    var scheduleNameByIdForSummary = {};
    data.schedules.forEach(function (s) {
      scheduleNameByIdForSummary[s.id] = s.name;
    });
    var projectRequirements = data.project_document_requirements.filter(function (r) {
      return r.project_id === p.id && typesById[r.document_type_id];
    });
    var availableCount = projectRequirements.filter(function (r) {
      return computeRequirementAvailability(data, p.id, r.document_type_id);
    }).length;
    // Gate 5 (Document Control 5: Schedule Due Dates).
    var overdueCount = projectRequirements.filter(function (r) {
      return computeRequirementStatus(data, p.id, r.document_type_id, r.planned_submission_date) === "overdue";
    }).length;

    var section = document.createElement("div");
    section.style.marginTop = "16px";
    section.style.paddingTop = "14px";
    section.style.borderTop = "1px solid var(--divider)";

    var header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.flexWrap = "wrap";
    header.style.gap = "8px";

    var label = document.createElement("span");
    label.className = "detail-item__label";
    label.textContent =
      "DOCUMENT REQUIREMENTS (" +
      availableCount +
      " of " +
      projectRequirements.length +
      " available" +
      (overdueCount > 0 ? ", " + overdueCount + " overdue" : "") +
      ")";
    header.appendChild(label);

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit Requirements";
    editBtn.onclick = function () {
      uiState.formSelectedDocTypeIds = projectRequirements.map(function (r) {
        return r.document_type_id;
      });
      uiState.formDueDates = {};
      uiState.formVendorIds = {};
      uiState.formActivityIds = {};
      uiState.formLeadTimes = {};
      projectRequirements.forEach(function (r) {
        if (r.planned_submission_date) uiState.formDueDates[r.document_type_id] = r.planned_submission_date;
        if (r.vendor_id) uiState.formVendorIds[r.document_type_id] = r.vendor_id;
        if (r.activity_id) uiState.formActivityIds[r.document_type_id] = r.activity_id;
        if (r.lead_time_days) uiState.formLeadTimes[r.document_type_id] = r.lead_time_days;
      });
      uiState.formDocTemplateKey = "";
      uiState.editingId = p.id;
      onChanged();
    };
    header.appendChild(editBtn);

    section.appendChild(header);

    if (projectRequirements.length === 0) {
      var noneNote = document.createElement("p");
      noneNote.className = "text-secondary";
      noneNote.style.fontSize = "13px";
      noneNote.style.margin = "8px 0 0";
      noneNote.textContent = "No document requirements selected yet. Click “Edit Requirements” to choose which document types this project needs.";
      section.appendChild(noneNote);
      return section;
    }

    var list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";
    list.style.marginTop = "8px";

    projectRequirements
      .slice()
      .sort(function (a, b) {
        var ta = typesById[a.document_type_id];
        var tb = typesById[b.document_type_id];
        return (ta.name || "").localeCompare(tb.name || "");
      })
      .forEach(function (r) {
        var t = typesById[r.document_type_id];
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";

        var vendor = r.vendor_id ? vendorsById[r.vendor_id] : null;
        var linkedActivity = r.activity_id ? activitiesById[r.activity_id] : null;
        var nameSpan = document.createElement("span");
        nameSpan.textContent =
          t.name +
          (t.code ? " (" + t.code + ")" : "") +
          (r.planned_submission_date ? " — due " + r.planned_submission_date : "") +
          (vendor ? " — " + (vendor.vendor_name || "(unnamed vendor)") : "") +
          (linkedActivity
            ? " — linked to " +
              (scheduleNameByIdForSummary[linkedActivity.schedule_id] || "(schedule)") +
              ": " +
              (linkedActivity.name || "(unnamed activity)") +
              (r.lead_time_days ? " (" + r.lead_time_days + "d lead time)" : "")
            : "");
        row.appendChild(nameSpan);

        var status = computeRequirementStatus(data, p.id, r.document_type_id, r.planned_submission_date);
        var badgeInfo = REQUIREMENT_STATUS_BADGE[status];
        var statusBadge = document.createElement("span");
        statusBadge.className = "status-badge status-badge--" + badgeInfo.className;
        statusBadge.style.fontSize = "11px";
        statusBadge.textContent = badgeInfo.label;
        row.appendChild(statusBadge);

        list.appendChild(row);
      });

    section.appendChild(list);
    return section;
  }

  function renderProjectDetails(p, onChanged) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";

    var grid = document.createElement("div");
    grid.className = "detail-grid";

    DETAIL_FIELDS.forEach(function (cfg) {
      var raw = p[cfg.key];
      var value = cfg.money ? formatMoney(raw, p.currency) : raw && String(raw).trim() ? raw : "\u2014";
      var item = document.createElement("div");
      item.innerHTML =
        "<span class='detail-item__label'>" +
        cfg.label +
        "</span><span class='detail-item__value mono'>" +
        value +
        "</span>";
      grid.appendChild(item);
    });

    wrap.appendChild(grid);

    // Gate 17 (Document Control 4): latest revision per document group only — so a
    // document with several revisions still shows as one row here, matching how
    // documents.js's own list collapses to latest-per-group. Falls back to the raw,
    // ungrouped filter if documents.js hasn't loaded its public API yet for some reason.
    var projectDocs = window.PCC.store
      .get()
      .documents.filter(function (d) {
        return d.project_id === p.id;
      });
    var attachedDocs = window.PCC.files && window.PCC.files.latestOnly ? window.PCC.files.latestOnly(projectDocs) : projectDocs;

    var attachmentsSection = document.createElement("div");
    attachmentsSection.style.marginTop = "16px";
    attachmentsSection.style.paddingTop = "14px";
    attachmentsSection.style.borderTop = "1px solid var(--divider)";

    var attachmentsHeader = document.createElement("div");
    attachmentsHeader.style.display = "flex";
    attachmentsHeader.style.justifyContent = "space-between";
    attachmentsHeader.style.alignItems = "center";

    var attachmentsLabel = document.createElement("span");
    attachmentsLabel.className = "detail-item__label";
    attachmentsLabel.textContent = "ATTACHMENTS (" + attachedDocs.length + ")";
    attachmentsHeader.appendChild(attachmentsLabel);

    if (attachedDocs.length > 0) {
      var exportBtn = document.createElement("button");
      exportBtn.className = "btn btn--ghost";
      exportBtn.textContent = "Export Archive";
      exportBtn.onclick = function () {
        window.PCC.archive.exportProject(p, window.PCC.store.get().documents);
      };
      attachmentsHeader.appendChild(exportBtn);
    }

    attachmentsSection.appendChild(attachmentsHeader);

    if (attachedDocs.length === 0) {
      var noneNote = document.createElement("p");
      noneNote.className = "text-secondary";
      noneNote.style.fontSize = "13px";
      noneNote.style.margin = "6px 0 0";
      noneNote.textContent = "No documents attached to this project yet.";
      attachmentsSection.appendChild(noneNote);
    } else {
      var docList = document.createElement("div");
      docList.style.display = "flex";
      docList.style.flexDirection = "column";
      docList.style.gap = "6px";
      docList.style.marginTop = "8px";

      attachedDocs.forEach(function (doc) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";

        var label = document.createElement("span");
        label.textContent =
          doc.filename + " \u00b7 " + (window.PCC.files ? window.PCC.files.categoryLabel(doc.category) : doc.category);

        row.appendChild(label);

        // Always shown, not gated on doc.file_data — see documents.js for why.
        var openBtn = document.createElement("button");
        openBtn.className = "btn btn--ghost";
        openBtn.textContent = "Open File";
        openBtn.onclick = function () {
          window.PCC.files.open(doc);
        };
        row.appendChild(openBtn);

        docList.appendChild(row);
      });

      attachmentsSection.appendChild(docList);
    }

    wrap.appendChild(attachmentsSection);
    wrap.appendChild(renderDocumentRequirementsSection(p, onChanged));

    var projectLogs = window.PCC.store
      .get()
      .daily_logs.filter(function (d) {
        return d.project_id === p.id;
      })
      .sort(function (a, b) {
        return b.log_date.localeCompare(a.log_date);
      });

    var logsSection = document.createElement("div");
    logsSection.style.marginTop = "16px";
    logsSection.style.paddingTop = "14px";
    logsSection.style.borderTop = "1px solid var(--divider)";

    var logsHeader = document.createElement("div");
    logsHeader.style.display = "flex";
    logsHeader.style.justifyContent = "space-between";
    logsHeader.style.alignItems = "center";

    var logsLabel = document.createElement("span");
    logsLabel.className = "detail-item__label";
    logsLabel.textContent = "DAILY LOGS (" + projectLogs.length + ")";
    logsHeader.appendChild(logsLabel);

    if (projectLogs.length > 0) {
      var viewAllBtn = document.createElement("button");
      viewAllBtn.className = "btn btn--ghost";
      viewAllBtn.textContent = "View All";
      viewAllBtn.onclick = function () {
        if (window.PCC.dailyLog) window.PCC.dailyLog.filterByProject(p.id);
        window.PCC.router.go("dailylog");
      };
      logsHeader.appendChild(viewAllBtn);
    }

    logsSection.appendChild(logsHeader);

    if (projectLogs.length === 0) {
      var noLogsNote = document.createElement("p");
      noLogsNote.className = "text-secondary";
      noLogsNote.style.fontSize = "13px";
      noLogsNote.style.margin = "6px 0 0";
      noLogsNote.textContent = "No daily log entries yet for this project.";
      logsSection.appendChild(noLogsNote);
    } else {
      var logsList = document.createElement("div");
      logsList.style.display = "flex";
      logsList.style.flexDirection = "column";
      logsList.style.gap = "6px";
      logsList.style.marginTop = "8px";

      projectLogs.slice(0, 5).forEach(function (log) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";

        var label = document.createElement("span");
        label.className = "mono";
        label.textContent = log.log_date;

        var badge = document.createElement("span");
        if (log.incidents && log.incidents.trim()) {
          badge.className = "status-badge status-badge--critical";
          badge.textContent = "Incident";
        } else {
          badge.className = "status-badge status-badge--on_track";
          badge.textContent = "No incidents";
        }

        row.appendChild(label);
        row.appendChild(badge);
        logsList.appendChild(row);
      });

      logsSection.appendChild(logsList);

      if (projectLogs.length > 5) {
        var moreNote = document.createElement("p");
        moreNote.className = "text-secondary";
        moreNote.style.fontSize = "11px";
        moreNote.style.marginTop = "4px";
        moreNote.textContent = "+" + (projectLogs.length - 5) + " more \u2014 View All to see the rest.";
        logsSection.appendChild(moreNote);
      }
    }

    wrap.appendChild(logsSection);

    var projectRisks = window.PCC.store
      .get()
      .risks.filter(function (r) {
        return r.project_id === p.id && r.status !== "closed";
      });

    var risksSection = document.createElement("div");
    risksSection.style.marginTop = "16px";
    risksSection.style.paddingTop = "14px";
    risksSection.style.borderTop = "1px solid var(--divider)";

    var risksHeader = document.createElement("div");
    risksHeader.style.display = "flex";
    risksHeader.style.justifyContent = "space-between";
    risksHeader.style.alignItems = "center";

    var risksLabel = document.createElement("span");
    risksLabel.className = "detail-item__label";
    risksLabel.textContent = "OPEN RISKS / ISSUES (" + projectRisks.length + ")";
    risksHeader.appendChild(risksLabel);

    if (projectRisks.length > 0) {
      var viewAllRisksBtn = document.createElement("button");
      viewAllRisksBtn.className = "btn btn--ghost";
      viewAllRisksBtn.textContent = "View All";
      viewAllRisksBtn.onclick = function () {
        if (window.PCC.risks) window.PCC.risks.filterByProject(p.id);
        window.PCC.router.go("risks");
      };
      risksHeader.appendChild(viewAllRisksBtn);
    }

    risksSection.appendChild(risksHeader);

    if (projectRisks.length === 0) {
      var noRisksNote = document.createElement("p");
      noRisksNote.className = "text-secondary";
      noRisksNote.style.fontSize = "13px";
      noRisksNote.style.margin = "6px 0 0";
      noRisksNote.textContent = "No open risks or issues for this project.";
      risksSection.appendChild(noRisksNote);
    } else {
      var risksList = document.createElement("div");
      risksList.style.display = "flex";
      risksList.style.flexDirection = "column";
      risksList.style.gap = "6px";
      risksList.style.marginTop = "8px";

      projectRisks.slice(0, 5).forEach(function (r) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var label = document.createElement("span");
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = r.title || "(untitled)";

        row.appendChild(label);
        risksList.appendChild(row);
      });

      risksSection.appendChild(risksList);

      if (projectRisks.length > 5) {
        var moreRisksNote = document.createElement("p");
        moreRisksNote.className = "text-secondary";
        moreRisksNote.style.fontSize = "11px";
        moreRisksNote.style.marginTop = "4px";
        moreRisksNote.textContent = "+" + (projectRisks.length - 5) + " more \u2014 View All to see the rest.";
        risksSection.appendChild(moreRisksNote);
      }
    }

    wrap.appendChild(risksSection);

    var projectMeetings = window.PCC.store
      .get()
      .meetings.filter(function (m) {
        return m.project_id === p.id;
      })
      .sort(function (a, b) {
        return b.meeting_date.localeCompare(a.meeting_date);
      });

    var meetingsSection = document.createElement("div");
    meetingsSection.style.marginTop = "16px";
    meetingsSection.style.paddingTop = "14px";
    meetingsSection.style.borderTop = "1px solid var(--divider)";

    var meetingsHeader = document.createElement("div");
    meetingsHeader.style.display = "flex";
    meetingsHeader.style.justifyContent = "space-between";
    meetingsHeader.style.alignItems = "center";

    var meetingsLabel = document.createElement("span");
    meetingsLabel.className = "detail-item__label";
    meetingsLabel.textContent = "MEETINGS (" + projectMeetings.length + ")";
    meetingsHeader.appendChild(meetingsLabel);

    if (projectMeetings.length > 0) {
      var viewAllMeetingsBtn = document.createElement("button");
      viewAllMeetingsBtn.className = "btn btn--ghost";
      viewAllMeetingsBtn.textContent = "View All";
      viewAllMeetingsBtn.onclick = function () {
        if (window.PCC.meetings) window.PCC.meetings.filterByProject(p.id);
        window.PCC.router.go("meetings");
      };
      meetingsHeader.appendChild(viewAllMeetingsBtn);
    }

    meetingsSection.appendChild(meetingsHeader);

    if (projectMeetings.length === 0) {
      var noMeetingsNote = document.createElement("p");
      noMeetingsNote.className = "text-secondary";
      noMeetingsNote.style.fontSize = "13px";
      noMeetingsNote.style.margin = "6px 0 0";
      noMeetingsNote.textContent = "No meetings logged yet for this project.";
      meetingsSection.appendChild(noMeetingsNote);
    } else {
      var meetingsList = document.createElement("div");
      meetingsList.style.display = "flex";
      meetingsList.style.flexDirection = "column";
      meetingsList.style.gap = "6px";
      meetingsList.style.marginTop = "8px";

      projectMeetings.slice(0, 5).forEach(function (m) {
        var overdueInMeeting = m.actions.filter(function (a) {
          var today = new Date().toISOString().slice(0, 10);
          return a.status === "open" && a.due_date && a.due_date < today;
        }).length;

        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var label = document.createElement("span");
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = m.meeting_date + " \u2014 " + (m.title || "(untitled)");

        row.appendChild(label);

        if (overdueInMeeting > 0) {
          var overdueBadge = document.createElement("span");
          overdueBadge.className = "status-badge status-badge--critical";
          overdueBadge.textContent = overdueInMeeting + " Overdue";
          row.appendChild(overdueBadge);
        }

        meetingsList.appendChild(row);
      });

      meetingsSection.appendChild(meetingsList);

      if (projectMeetings.length > 5) {
        var moreMeetingsNote = document.createElement("p");
        moreMeetingsNote.className = "text-secondary";
        moreMeetingsNote.style.fontSize = "11px";
        moreMeetingsNote.style.marginTop = "4px";
        moreMeetingsNote.textContent = "+" + (projectMeetings.length - 5) + " more \u2014 View All to see the rest.";
        meetingsSection.appendChild(moreMeetingsNote);
      }
    }

    wrap.appendChild(meetingsSection);

    var projectRfis = window.PCC.store
      .get()
      .rfis.filter(function (r) {
        return r.project_id === p.id && r.status !== "closed";
      });

    var rfisSection = document.createElement("div");
    rfisSection.style.marginTop = "16px";
    rfisSection.style.paddingTop = "14px";
    rfisSection.style.borderTop = "1px solid var(--divider)";

    var rfisHeader = document.createElement("div");
    rfisHeader.style.display = "flex";
    rfisHeader.style.justifyContent = "space-between";
    rfisHeader.style.alignItems = "center";

    var rfisLabel = document.createElement("span");
    rfisLabel.className = "detail-item__label";
    rfisLabel.textContent = "OPEN RFIs / TQs (" + projectRfis.length + ")";
    rfisHeader.appendChild(rfisLabel);

    if (projectRfis.length > 0) {
      var viewAllRfisBtn = document.createElement("button");
      viewAllRfisBtn.className = "btn btn--ghost";
      viewAllRfisBtn.textContent = "View All";
      viewAllRfisBtn.onclick = function () {
        if (window.PCC.rfis) window.PCC.rfis.filterByProject(p.id);
        window.PCC.router.go("rfis");
      };
      rfisHeader.appendChild(viewAllRfisBtn);
    }

    rfisSection.appendChild(rfisHeader);

    if (projectRfis.length === 0) {
      var noRfisNote = document.createElement("p");
      noRfisNote.className = "text-secondary";
      noRfisNote.style.fontSize = "13px";
      noRfisNote.style.margin = "6px 0 0";
      noRfisNote.textContent = "No open RFIs or Technical Queries for this project.";
      rfisSection.appendChild(noRfisNote);
    } else {
      var rfisList = document.createElement("div");
      rfisList.style.display = "flex";
      rfisList.style.flexDirection = "column";
      rfisList.style.gap = "6px";
      rfisList.style.marginTop = "8px";

      var today = new Date().toISOString().slice(0, 10);

      projectRfis.slice(0, 5).forEach(function (r) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var label = document.createElement("span");
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = r.number + " \u2014 " + (r.subject || "(untitled)");

        row.appendChild(label);

        if (r.status === "open" && r.date_required && r.date_required < today) {
          var overdueBadge = document.createElement("span");
          overdueBadge.className = "status-badge status-badge--critical";
          overdueBadge.textContent = "Overdue";
          row.appendChild(overdueBadge);
        }

        rfisList.appendChild(row);
      });

      rfisSection.appendChild(rfisList);

      if (projectRfis.length > 5) {
        var moreRfisNote = document.createElement("p");
        moreRfisNote.className = "text-secondary";
        moreRfisNote.style.fontSize = "11px";
        moreRfisNote.style.marginTop = "4px";
        moreRfisNote.textContent = "+" + (projectRfis.length - 5) + " more \u2014 View All to see the rest.";
        rfisSection.appendChild(moreRfisNote);
      }
    }

    wrap.appendChild(rfisSection);

    var projectChangeOrders = window.PCC.store
      .get()
      .change_orders.filter(function (co) {
        return co.project_id === p.id && co.status !== "closed" && co.status !== "rejected";
      });

    var coSection = document.createElement("div");
    coSection.style.marginTop = "16px";
    coSection.style.paddingTop = "14px";
    coSection.style.borderTop = "1px solid var(--divider)";

    var coHeader = document.createElement("div");
    coHeader.style.display = "flex";
    coHeader.style.justifyContent = "space-between";
    coHeader.style.alignItems = "center";

    var coLabel = document.createElement("span");
    coLabel.className = "detail-item__label";
    coLabel.textContent = "OPEN CHANGE ORDERS (" + projectChangeOrders.length + ")";
    coHeader.appendChild(coLabel);

    if (projectChangeOrders.length > 0) {
      var viewAllCoBtn = document.createElement("button");
      viewAllCoBtn.className = "btn btn--ghost";
      viewAllCoBtn.textContent = "View All";
      viewAllCoBtn.onclick = function () {
        if (window.PCC.changeOrders) window.PCC.changeOrders.filterByProject(p.id);
        window.PCC.router.go("changeOrders");
      };
      coHeader.appendChild(viewAllCoBtn);
    }

    coSection.appendChild(coHeader);

    if (projectChangeOrders.length === 0) {
      var noCoNote = document.createElement("p");
      noCoNote.className = "text-secondary";
      noCoNote.style.fontSize = "13px";
      noCoNote.style.margin = "6px 0 0";
      noCoNote.textContent = "No open Change Orders for this project.";
      coSection.appendChild(noCoNote);
    } else {
      var coList = document.createElement("div");
      coList.style.display = "flex";
      coList.style.flexDirection = "column";
      coList.style.gap = "6px";
      coList.style.marginTop = "8px";

      projectChangeOrders.slice(0, 5).forEach(function (co) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var label = document.createElement("span");
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = co.number + " \u2014 " + (co.title || "(untitled)");

        var statusBadge = document.createElement("span");
        statusBadge.className = "status-badge " + (co.status === "approved" ? "status-badge--on_track" : "status-badge--info");
        statusBadge.textContent = co.status === "approved" ? "Approved" : "Pending";

        row.appendChild(label);
        row.appendChild(statusBadge);
        coList.appendChild(row);
      });

      coSection.appendChild(coList);

      if (projectChangeOrders.length > 5) {
        var moreCoNote = document.createElement("p");
        moreCoNote.className = "text-secondary";
        moreCoNote.style.fontSize = "11px";
        moreCoNote.style.marginTop = "4px";
        moreCoNote.textContent = "+" + (projectChangeOrders.length - 5) + " more \u2014 View All to see the rest.";
        coSection.appendChild(moreCoNote);
      }
    }

    wrap.appendChild(coSection);

    // Gate 9: vendor_project_links is the same shared array Vendor Management's own
    // Projects tab reads/writes — linking or unlinking here shows up there immediately
    // and vice versa, since both sides are just views onto the one join array, not two
    // copies that need to be kept in sync.
    var vendorContractLabels = { draft: "Draft", active: "Active", completed: "Completed", terminated: "Terminated" };
    var projectVendorLinks = window.PCC.store
      .get()
      .vendor_project_links.filter(function (l) {
        return l.project_id === p.id;
      });
    var allVendors = window.PCC.store.get().vendors;

    var vendorsSection = document.createElement("div");
    vendorsSection.style.marginTop = "16px";
    vendorsSection.style.paddingTop = "14px";
    vendorsSection.style.borderTop = "1px solid var(--divider)";

    var vendorsHeader = document.createElement("div");
    vendorsHeader.style.display = "flex";
    vendorsHeader.style.justifyContent = "space-between";
    vendorsHeader.style.alignItems = "center";

    var vendorsLabel = document.createElement("span");
    vendorsLabel.className = "detail-item__label";
    vendorsLabel.textContent = "VENDORS (" + projectVendorLinks.length + ")";
    vendorsHeader.appendChild(vendorsLabel);

    var vendorsHeaderBtns = document.createElement("div");
    vendorsHeaderBtns.style.display = "flex";
    vendorsHeaderBtns.style.gap = "8px";

    var linkVendorBtn = document.createElement("button");
    linkVendorBtn.className = "btn btn--ghost";
    linkVendorBtn.textContent = "+ Link Vendor";
    var unlinkedVendors = allVendors.filter(function (v) {
      return !projectVendorLinks.some(function (l) {
        return l.vendor_id === v.id;
      });
    });
    linkVendorBtn.disabled = unlinkedVendors.length === 0;
    linkVendorBtn.title = unlinkedVendors.length === 0 ? (allVendors.length === 0 ? "Add a vendor in Vendor Management first" : "Every vendor is already linked to this project") : "";
    linkVendorBtn.onclick = function () {
      uiState.vendorLinkPickerOpen = true;
      onChanged();
    };
    vendorsHeaderBtns.appendChild(linkVendorBtn);

    if (projectVendorLinks.length > 0) {
      var viewAllVendorsBtn = document.createElement("button");
      viewAllVendorsBtn.className = "btn btn--ghost";
      viewAllVendorsBtn.textContent = "View All";
      viewAllVendorsBtn.onclick = function () {
        if (window.PCC.vendors) window.PCC.vendors.filterByProject(p.id);
        window.PCC.router.go("vendors");
      };
      vendorsHeaderBtns.appendChild(viewAllVendorsBtn);
    }

    vendorsHeader.appendChild(vendorsHeaderBtns);
    vendorsSection.appendChild(vendorsHeader);

    if (uiState.vendorLinkPickerOpen) {
      var pickerWrap = document.createElement("div");
      pickerWrap.style.marginTop = "8px";
      pickerWrap.style.display = "flex";
      pickerWrap.style.gap = "8px";
      pickerWrap.style.alignItems = "center";
      pickerWrap.style.flexWrap = "wrap";

      var vendorSelect = document.createElement("select");
      unlinkedVendors.forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = v.vendor_name || "(unnamed vendor)";
        vendorSelect.appendChild(opt);
      });
      pickerWrap.appendChild(vendorSelect);

      var confirmLinkBtn = document.createElement("button");
      confirmLinkBtn.className = "btn btn--primary";
      confirmLinkBtn.textContent = "Link";
      confirmLinkBtn.onclick = function () {
        window.PCC.store.update(function (d) {
          d.vendor_project_links.push(window.PCC.store.newVendorProjectLink({ vendor_id: vendorSelect.value, project_id: p.id }));
        });
        uiState.vendorLinkPickerOpen = false;
        onChanged();
      };
      pickerWrap.appendChild(confirmLinkBtn);

      var cancelLinkBtn = document.createElement("button");
      cancelLinkBtn.className = "btn btn--ghost";
      cancelLinkBtn.textContent = "Cancel";
      cancelLinkBtn.onclick = function () {
        uiState.vendorLinkPickerOpen = false;
        onChanged();
      };
      pickerWrap.appendChild(cancelLinkBtn);

      vendorsSection.appendChild(pickerWrap);
    }

    if (projectVendorLinks.length === 0) {
      var noVendorsNote = document.createElement("p");
      noVendorsNote.className = "text-secondary";
      noVendorsNote.style.fontSize = "13px";
      noVendorsNote.style.margin = "6px 0 0";
      noVendorsNote.textContent = "No vendors linked to this project yet.";
      vendorsSection.appendChild(noVendorsNote);
    } else {
      var vendorsList = document.createElement("div");
      vendorsList.style.display = "flex";
      vendorsList.style.flexDirection = "column";
      vendorsList.style.gap = "6px";
      vendorsList.style.marginTop = "8px";

      projectVendorLinks.slice(0, 5).forEach(function (link) {
        var vendor = allVendors.find(function (v) {
          return v.id === link.vendor_id;
        });

        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var nameBtn = document.createElement("button");
        nameBtn.className = "btn btn--ghost";
        nameBtn.style.overflow = "hidden";
        nameBtn.style.textOverflow = "ellipsis";
        nameBtn.style.whiteSpace = "nowrap";
        nameBtn.style.padding = "2px 8px";
        nameBtn.textContent = (vendor ? vendor.vendor_name || "(unnamed vendor)" : "(deleted vendor)") + (link.role ? " — " + link.role : "");
        nameBtn.disabled = !vendor;
        nameBtn.onclick = function () {
          if (window.PCC.vendors) window.PCC.vendors.openProfile(link.vendor_id);
          window.PCC.router.go("vendors");
        };
        row.appendChild(nameBtn);

        var rightSide = document.createElement("div");
        rightSide.style.display = "flex";
        rightSide.style.alignItems = "center";
        rightSide.style.gap = "8px";
        rightSide.style.flexShrink = "0";

        var statusBadge = document.createElement("span");
        statusBadge.className = "status-badge " + (link.contract_status === "active" ? "status-badge--on_track" : link.contract_status === "terminated" ? "status-badge--critical" : "status-badge--info");
        statusBadge.textContent = vendorContractLabels[link.contract_status] || link.contract_status;
        rightSide.appendChild(statusBadge);

        var unlinkBtn = document.createElement("button");
        unlinkBtn.className = "btn btn--ghost";
        unlinkBtn.style.padding = "2px 8px";
        unlinkBtn.textContent = "Unlink";
        unlinkBtn.onclick = function () {
          window.PCC.store.update(function (d) {
            d.vendor_project_links = d.vendor_project_links.filter(function (x) {
              return x.id !== link.id;
            });
          });
          onChanged();
        };
        rightSide.appendChild(unlinkBtn);

        row.appendChild(rightSide);
        vendorsList.appendChild(row);
      });

      vendorsSection.appendChild(vendorsList);

      if (projectVendorLinks.length > 5) {
        var moreVendorsNote = document.createElement("p");
        moreVendorsNote.className = "text-secondary";
        moreVendorsNote.style.fontSize = "11px";
        moreVendorsNote.style.marginTop = "4px";
        moreVendorsNote.textContent = "+" + (projectVendorLinks.length - 5) + " more — View All to see the rest.";
        vendorsSection.appendChild(moreVendorsNote);
      }
    }

    wrap.appendChild(vendorsSection);

    var costSection = document.createElement("div");
    costSection.style.marginTop = "16px";
    costSection.style.paddingTop = "14px";
    costSection.style.borderTop = "1px solid var(--divider)";

    var costHeader = document.createElement("div");
    costHeader.style.display = "flex";
    costHeader.style.justifyContent = "space-between";
    costHeader.style.alignItems = "center";

    var costLabel = document.createElement("span");
    costLabel.className = "detail-item__label";
    costLabel.textContent = "COST TRACKING";
    costHeader.appendChild(costLabel);

    var viewAllCostBtn = document.createElement("button");
    viewAllCostBtn.className = "btn btn--ghost";
    viewAllCostBtn.textContent = "View All";
    viewAllCostBtn.onclick = function () {
      if (window.PCC.cost) window.PCC.cost.filterByProject(p.id);
      window.PCC.router.go("cost");
    };
    costHeader.appendChild(viewAllCostBtn);

    costSection.appendChild(costHeader);

    if (window.PCC.cost) {
      var costSummary = window.PCC.cost.projectCostSummary(window.PCC.store.get(), p.id);
      var costLine = document.createElement("p");
      costLine.style.fontSize = "13px";
      costLine.style.margin = "6px 0 0";
      if (costSummary.budgeted === 0 && costSummary.actual === 0) {
        costLine.className = "text-secondary";
        costLine.textContent = "No budget items or actual costs logged for this project yet.";
      } else {
        costLine.innerHTML =
          "Budgeted " + formatMoney(costSummary.budgeted) + " · Actual " + formatMoney(costSummary.actual) +
          " · <span style='color:" + (costSummary.variance < 0 ? "var(--status-critical)" : "var(--status-on-track)") + "'>" +
          (costSummary.variance >= 0 ? "+" : "") + formatMoney(costSummary.variance) + " variance</span>" +
          (costSummary.usingPortfolioBudget
            ? "<br/><span class='text-secondary' style='font-size:11px;'>Budgeted from this project's Budget field — no Cost Tracking line items yet.</span>"
            : "");
      }
      costSection.appendChild(costLine);
    }

    wrap.appendChild(costSection);

    if (window.PCC.resourceLevelingEngine && window.PCC.store.get().resources.length > 0) {
      var data = window.PCC.store.get();
      var projectActivityIds = {};
      data.activities.forEach(function (a) { if (a.project_id === p.id) projectActivityIds[a.id] = true; });
      var projectAssignments = data.resource_assignments.filter(function (a) { return projectActivityIds[a.activity_id]; });

      var resSection = document.createElement("div");
      resSection.style.marginTop = "16px";
      resSection.style.paddingTop = "14px";
      resSection.style.borderTop = "1px solid var(--divider)";

      var resHeader = document.createElement("div");
      resHeader.style.display = "flex";
      resHeader.style.justifyContent = "space-between";
      resHeader.style.alignItems = "center";
      var resLabel = document.createElement("span");
      resLabel.className = "detail-item__label";
      resLabel.textContent = "RESOURCES ASSIGNED";
      resHeader.appendChild(resLabel);
      var viewAllResBtn = document.createElement("button");
      viewAllResBtn.className = "btn btn--ghost";
      viewAllResBtn.textContent = "View All";
      viewAllResBtn.onclick = function () {
        if (window.PCC.resources) window.PCC.resources.filterByProject(p.id);
        window.PCC.router.go("resources");
      };
      resHeader.appendChild(viewAllResBtn);
      resSection.appendChild(resHeader);

      if (projectAssignments.length === 0) {
        var noRes = document.createElement("p");
        noRes.className = "text-secondary";
        noRes.style.fontSize = "13px";
        noRes.style.margin = "6px 0 0";
        noRes.textContent = "No resources assigned to this project's activities yet.";
        resSection.appendChild(noRes);
      } else {
        var portfolioOverAlloc = window.PCC.resourceLevelingEngine.portfolioOverAllocationSummary(data.resources, data.resource_assignments, data.activities);
        var overAllocById = {};
        portfolioOverAlloc.forEach(function (s) { overAllocById[s.resourceId] = s; });

        var seenResourceIds = {};
        projectAssignments.forEach(function (a) {
          if (seenResourceIds[a.resource_id]) return;
          seenResourceIds[a.resource_id] = true;
          var resource = data.resources.find(function (r) { return r.id === a.resource_id; });
          if (!resource) return;
          var overAlloc = overAllocById[resource.id];
          var line = document.createElement("p");
          line.style.fontSize = "13px";
          line.style.margin = "6px 0 0";
          line.appendChild(document.createTextNode(resource.name || "(unnamed resource)"));
          if (overAlloc) {
            var overSpan = document.createElement("span");
            overSpan.style.color = "var(--status-critical)";
            overSpan.textContent = " — over-allocated " + overAlloc.overAllocatedDayCount + " day(s) (portfolio-wide)";
            line.appendChild(overSpan);
          }
          resSection.appendChild(line);
        });
      }

      wrap.appendChild(resSection);
    }

    return wrap;
  }

  function renderProjectEntry(p, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderProjectCard(p, onChanged));
    if (uiState.expandedId === p.id) {
      entry.appendChild(renderProjectDetails(p, onChanged));
    }
    return entry;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    var h1 = document.createElement("h2");
    h1.textContent = "Portfolio";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    outlet.appendChild(renderKpiStrip(computePortfolioKpis(data)));

    if (uiState.editingId) {
      var projectBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newProject()
          : data.projects.find(function (p) {
              return p.id === uiState.editingId;
            });
      renderForm(outlet, projectBeingEdited, rerender);
    }

    // --- Toolbar ---
    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search by name, client, or company\u2026";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      renderList();
    };

    var statusSelect = document.createElement("select");
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All statuses";
    statusSelect.appendChild(allOpt);
    window.PCC.store.PROJECT_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABELS[s];
      statusSelect.appendChild(opt);
    });
    statusSelect.value = uiState.statusFilter;
    statusSelect.onchange = function () {
      uiState.statusFilter = statusSelect.value;
      renderList();
    };

    var archivedLabel = document.createElement("label");
    archivedLabel.style.display = "flex";
    archivedLabel.style.alignItems = "center";
    archivedLabel.style.gap = "6px";
    archivedLabel.style.fontSize = "13px";
    archivedLabel.style.color = "var(--text-secondary)";
    var archivedCheckbox = document.createElement("input");
    archivedCheckbox.type = "checkbox";
    archivedCheckbox.checked = uiState.showArchived;
    archivedCheckbox.onchange = function () {
      uiState.showArchived = archivedCheckbox.checked;
      renderList();
    };
    archivedLabel.appendChild(archivedCheckbox);
    archivedLabel.appendChild(document.createTextNode("Show archived"));

    // PCC Evolution Roadmap, Tier E: Portfolio Performance. Every option list below is
    // built from the *full* project set (data.projects), not the currently-filtered
    // one, so narrowing one filter never removes another filter's own options.
    function filterSelect(label, uiKey, projectField) {
      var select = document.createElement("select");
      var allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = "All " + label;
      select.appendChild(allOpt);
      distinctValues(data.projects, projectField).forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      });
      select.value = uiState[uiKey];
      select.onchange = function () {
        uiState[uiKey] = select.value;
        renderList();
      };
      return select;
    }
    var clientSelect = filterSelect("clients", "clientFilter", "client");
    var countrySelect = filterSelect("countries", "countryFilter", "country");
    var sectorSelect = filterSelect("sectors", "sectorFilter", "sector");
    var pmSelect = filterSelect("PMs", "pmFilter", "project_manager");
    var plannerSelect = filterSelect("planners", "plannerFilter", "planner");
    var typeSelect = filterSelect("types", "typeFilter", "project_type");

    var yearSelect = document.createElement("select");
    var allYearsOpt = document.createElement("option");
    allYearsOpt.value = "";
    allYearsOpt.textContent = "All years";
    yearSelect.appendChild(allYearsOpt);
    var years = {};
    data.projects.forEach(function (p) {
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
      renderList();
    };

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    [
      { key: "cards", label: "Cards" },
      { key: "compare", label: "Compare" },
    ].forEach(function (v) {
      var btn = document.createElement("button");
      btn.className = "btn " + (uiState.view === v.key ? "btn--primary" : "btn--ghost");
      btn.textContent = v.label;
      btn.onclick = function () {
        uiState.view = v.key;
        rerender();
      };
      toolbar.appendChild(btn);
    });

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Project";
    addBtn.onclick = function () {
      uiState.formSelectedDocTypeIds = [];
      uiState.formDocTemplateKey = "";
      uiState.formDueDates = {};
      uiState.formVendorIds = {};
      uiState.formActivityIds = {};
      uiState.formLeadTimes = {};
      uiState.editingId = "new";
      rerender();
    };

    toolbar.appendChild(searchInput);
    toolbar.appendChild(statusSelect);
    toolbar.appendChild(clientSelect);
    toolbar.appendChild(countrySelect);
    toolbar.appendChild(sectorSelect);
    toolbar.appendChild(pmSelect);
    toolbar.appendChild(plannerSelect);
    toolbar.appendChild(typeSelect);
    toolbar.appendChild(yearSelect);
    toolbar.appendChild(archivedLabel);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    // --- List / Compare ---
    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.projects.filter(projectMatchesFilters);

      if (uiState.view === "compare") {
        listWrap.appendChild(renderCompareTable(filtered, rerender));
        return;
      }

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.projects.length === 0
            ? "No projects yet. Click \u201c+ Add Project\u201d to create your first one."
            : "No projects match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (p) {
        list.appendChild(renderProjectEntry(p, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.portfolio = render;
  // Gate 11 (Document Control 11: Reminders/Notifications) — the Dashboard's "Document
  // Reminders" panel needs a way to jump straight to a project's expanded Details, same
  // "expose one small view hook" pattern executiveCenter.js already uses for its own
  // viewProject().
  window.PCC.portfolio = {
    viewProject: function (projectId) {
      uiState.expandedId = projectId;
    },
  };
})();
