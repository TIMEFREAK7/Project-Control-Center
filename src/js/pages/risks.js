(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var TYPE_LABELS = { risk: "Risk", issue: "Issue", opportunity: "Opportunity" };
  var STATUS_LABELS = { open: "Open", mitigating: "Mitigating", closed: "Closed" };
  var LEVEL_LABELS = { low: "Low", medium: "Medium", high: "High" };

  // Standard 3x3 risk matrix: severity = f(probability, impact).
  var SEVERITY_MATRIX = {
    high: { low: "medium", medium: "high", high: "high" },
    medium: { low: "low", medium: "medium", high: "high" },
    low: { low: "low", medium: "low", high: "medium" },
  };

  var FIELD_CONFIG = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: "RISK_TYPES", labels: TYPE_LABELS },
    { key: "status", label: "Status", type: "select", options: "RISK_STATUSES", labels: STATUS_LABELS },
    { key: "probability", label: "Probability", type: "select", options: "RISK_LEVELS", labels: LEVEL_LABELS },
    { key: "impact", label: "Impact", type: "select", options: "RISK_LEVELS", labels: LEVEL_LABELS },
    { key: "owner", label: "Owner", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "mitigation", label: "Mitigation / Response", type: "textarea" },
  ];

  var uiState = {
    search: "",
    typeFilter: "",
    statusFilter: "open", // default to hiding closed items, matches how registers get used day to day
    projectFilter: "",
    // Redesign Gate 6 (Global Project Context): true once this page has ever checked
    // window.PCC.projectContext for an initial filter value, whether or not one applied
    // — so seeding only ever happens once per session, never overwriting a user's own
    // later choice (including deliberately clearing back to "All projects").
    projectFilterInitialized: false,
    heatmapFilter: null, // { probability, impact } or null
    editingId: null,
    expandedId: null,
    openMenuId: null, // risk id whose "⋯" card menu is open, or null
    pendingPrefill: null, // { project_id, source_meeting_id } set by createFromMeeting()
  };

  function severityOf(risk) {
    return SEVERITY_MATRIX[risk.probability][risk.impact];
  }

  function projectName(projects, projectId) {
    if (!projectId) return "Unassigned";
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "Unassigned";
  }

  function buildField(cfg, risk) {
    var field = document.createElement("div");
    field.className = "field";
    if (cfg.type === "textarea") field.style.gridColumn = "1 / -1";

    var label = document.createElement("label");
    label.textContent = cfg.label + (cfg.required ? " *" : "");
    label.setAttribute("for", "riskfield-" + cfg.key);
    field.appendChild(label);

    var input;
    if (cfg.type === "select") {
      input = document.createElement("select");
      window.PCC.store[cfg.options].forEach(function (val) {
        var opt = document.createElement("option");
        opt.value = val;
        opt.textContent = cfg.labels[val] || val;
        input.appendChild(opt);
      });
      input.value = risk[cfg.key];
    } else if (cfg.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
      input.value = risk[cfg.key] || "";
    } else {
      input = document.createElement("input");
      input.type = cfg.type;
      input.value = risk[cfg.key] || "";
    }
    input.id = "riskfield-" + cfg.key;
    input.name = cfg.key;
    if (cfg.required) input.required = true;

    field.appendChild(input);
    return field;
  }

  /** Gate 10: populates an "Activity" <select> with every activity across all of a
   * project's schedule revisions, each labeled with its schedule's name so linking
   * stays unambiguous when a project has more than one revision — same helper/pattern
   * cost.js's Budget Item form already established for linking to a Schedule Activity
   * (Gate 7, for EVM). Duplicated here rather than shared, matching this codebase's
   * existing convention of self-contained page modules. */
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

  function readFormValues(formEl) {
    var values = {};
    FIELD_CONFIG.forEach(function (cfg) {
      var el = formEl.querySelector("#riskfield-" + cfg.key);
      if (el) values[cfg.key] = el.value;
    });
    return values;
  }

  function renderForm(container, risk, projects, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Register Entry" : "Edit Register Entry";
    panel.appendChild(heading);

    if (risk.source_meeting_id) {
      var sourceMeeting = window.PCC.store.get().meetings.find(function (m) {
        return m.id === risk.source_meeting_id;
      });
      if (sourceMeeting) {
        var linkNote = document.createElement("p");
        linkNote.className = "text-secondary";
        linkNote.style.fontSize = "12px";
        linkNote.style.marginTop = "-8px";
        linkNote.style.marginBottom = "14px";
        linkNote.textContent = "Linked to meeting: \u201c" + sourceMeeting.title + "\u201d (" + sourceMeeting.meeting_date + ")";
        panel.appendChild(linkNote);
      }
    }

    var form = document.createElement("form");

    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project *</label>";
    var projSelect = document.createElement("select");
    projSelect.id = "riskfield-project_id";
    var activeProjects = projects.filter(function (p) {
      return !p.archived;
    });
    if (activeProjects.length === 0) {
      var noProjOpt = document.createElement("option");
      noProjOpt.value = "";
      noProjOpt.textContent = "No projects yet \u2014 add one in Portfolio first";
      projSelect.appendChild(noProjOpt);
      projSelect.disabled = true;
    } else {
      activeProjects.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "(unnamed project)";
        projSelect.appendChild(opt);
      });
      projSelect.value = risk.project_id || activeProjects[0].id;
    }
    projField.appendChild(projSelect);
    form.appendChild(projField);

    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Linked Activity (optional)</label>";
    var activitySelect = document.createElement("select");
    activitySelect.id = "riskfield-activity_id";
    activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, risk.activity_id);
    activityField.appendChild(activitySelect);
    form.appendChild(activityField);
    projSelect.onchange = function () {
      activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, "");
    };

    var grid = document.createElement("div");
    grid.className = "form-grid";
    FIELD_CONFIG.forEach(function (cfg) {
      grid.appendChild(buildField(cfg, risk));
    });
    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Title and Project are required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Entry" : "Save Changes";
    saveBtn.disabled = activeProjects.length === 0;

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
      values.project_id = projSelect.value;
      values.activity_id = activitySelect.value;
      if (isNew) values.source_meeting_id = risk.source_meeting_id || "";
      if (!values.title || !values.title.trim() || !values.project_id) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.risks.push(window.PCC.store.newRisk(values));
        } else {
          var existing = data.risks.find(function (r) {
            return r.id === risk.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Register entry added." : "Register entry updated.", "success");
      uiState.editingId = null;
      onSaved();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  // UI/UX Overhaul Gate 6 (Risk Register): split out of the old single riskMatchesFilters()
  // so the heat map can share the toolbar's own type/status/project/search filters
  // without also applying the heat map's OWN probability x impact filter (which it
  // produces, not consumes) — see the bug this fixes in renderHeatmap()'s own comment.
  function riskMatchesToolbarFilters(r) {
    if (uiState.typeFilter && r.type !== uiState.typeFilter) return false;
    if (uiState.statusFilter && r.status !== uiState.statusFilter) return false;
    if (uiState.projectFilter && r.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var haystack = (r.title + " " + r.description + " " + r.owner).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function riskMatchesFilters(r) {
    if (!riskMatchesToolbarFilters(r)) return false;
    if (uiState.heatmapFilter && (r.probability !== uiState.heatmapFilter.probability || r.impact !== uiState.heatmapFilter.impact)) return false;
    return true;
  }

  // UI/UX Overhaul Gate 6 (Risk Register): this used to count `allRisks` — every risk
  // in the whole app, regardless of the toolbar's own type/status/project/search
  // filters — so filtering the list below to one project left the heat map showing
  // stale, misleading counts from every project. Now counts only the risks the
  // toolbar's filters currently allow through (still ignoring the heat map's OWN
  // probability x impact filter, since that's what these cells produce, not consume).
  function renderHeatmap(allRisks, rerender) {
    var risksInScope = allRisks.filter(riskMatchesToolbarFilters);
    var isNarrowed = risksInScope.length !== allRisks.length;

    var wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "4px";
    heading.textContent = "Heat Map";
    wrap.appendChild(heading);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.fontSize = "12px";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "12px";
    sub.textContent = isNarrowed
      ? "Reflects the current search/type/status/project filters below. Click a cell to also filter by that probability/impact combination."
      : "Click a cell to filter the list below by that probability/impact combination.";
    wrap.appendChild(sub);

    var grid = document.createElement("div");
    grid.className = "heatmap";

    var corner = document.createElement("div");
    corner.className = "heatmap-corner";
    grid.appendChild(corner);

    ["low", "medium", "high"].forEach(function (impact) {
      var colLabel = document.createElement("div");
      colLabel.className = "heatmap-col-label";
      colLabel.textContent = LEVEL_LABELS[impact] + " Impact";
      grid.appendChild(colLabel);
    });

    ["high", "medium", "low"].forEach(function (prob) {
      var rowLabel = document.createElement("div");
      rowLabel.className = "heatmap-row-label";
      rowLabel.textContent = LEVEL_LABELS[prob] + " Prob.";
      grid.appendChild(rowLabel);

      ["low", "medium", "high"].forEach(function (impact) {
        var count = risksInScope.filter(function (r) {
          return r.probability === prob && r.impact === impact;
        }).length;
        var severity = SEVERITY_MATRIX[prob][impact];
        var cell = document.createElement("div");
        var isActive = uiState.heatmapFilter && uiState.heatmapFilter.probability === prob && uiState.heatmapFilter.impact === impact;
        cell.className = "heatmap-cell heatmap-cell--" + severity + (isActive ? " heatmap-cell--active" : "");
        cell.textContent = count;
        cell.title = LEVEL_LABELS[prob] + " probability \u00d7 " + LEVEL_LABELS[impact] + " impact";
        cell.onclick = function () {
          uiState.heatmapFilter = isActive ? null : { probability: prob, impact: impact };
          rerender();
        };
        grid.appendChild(cell);
      });
    });

    wrap.appendChild(grid);

    if (uiState.heatmapFilter) {
      var clearBtn = document.createElement("button");
      clearBtn.className = "btn btn--ghost";
      clearBtn.style.marginTop = "10px";
      clearBtn.textContent = "Clear heat map filter";
      clearBtn.onclick = function () {
        uiState.heatmapFilter = null;
        rerender();
      };
      wrap.appendChild(clearBtn);
    }

    return wrap;
  }

  function renderRiskCard(r, projects, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card";

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'>" +
      (r.title || "(untitled)") +
      "</div><div class='project-card__meta'>" +
      TYPE_LABELS[r.type] + " \u00b7 " + projectName(projects, r.project_id) + (r.owner ? " \u00b7 " + r.owner : "") +
      "</div>";

    var severity = severityOf(r);
    var severityBadge = document.createElement("span");
    severityBadge.className = "status-badge status-badge--" + (severity === "high" ? "critical" : severity === "medium" ? "at_risk" : "on_track");
    severityBadge.textContent = LEVEL_LABELS[severity] + " Severity";

    var statusBadge = document.createElement("span");
    statusBadge.className = "status-badge status-badge--" + (r.status === "closed" ? "complete" : r.status === "mitigating" ? "at_risk" : "info");
    statusBadge.textContent = STATUS_LABELS[r.status];

    var badgeWrap = document.createElement("div");
    badgeWrap.style.display = "flex";
    badgeWrap.style.gap = "6px";
    badgeWrap.appendChild(severityBadge);
    badgeWrap.appendChild(statusBadge);

    var actions = document.createElement("div");
    actions.className = "project-card__actions";

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === r.id ? "Hide" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === r.id ? null : r.id;
      onChanged();
    };

    actions.appendChild(detailsBtn);

    // UI/UX Overhaul Gate 6 (Risk Register): Edit/Delete moved off the card face and into
    // a "⋯" contextual menu, matching the pattern established in portfolio.js (Gate 3) —
    // Details stays as the one primary always-visible action.
    var menuWrap = document.createElement("div");
    menuWrap.className = "card-menu";

    var menuBtn = document.createElement("button");
    menuBtn.className = "icon-btn";
    menuBtn.setAttribute("aria-label", "More actions");
    menuBtn.textContent = "⋯";
    menuBtn.onclick = function () {
      uiState.openMenuId = uiState.openMenuId === r.id ? null : r.id;
      onChanged();
    };
    menuWrap.appendChild(menuBtn);

    if (uiState.openMenuId === r.id) {
      var overlay = document.createElement("button");
      overlay.className = "card-menu__overlay";
      overlay.setAttribute("aria-label", "Close menu");
      overlay.onclick = function () {
        uiState.openMenuId = null;
        onChanged();
      };
      menuWrap.appendChild(overlay);

      var dropdown = document.createElement("div");
      dropdown.className = "card-menu__dropdown";

      var editItem = document.createElement("button");
      editItem.className = "card-menu__item";
      editItem.textContent = "Edit";
      editItem.onclick = function () {
        uiState.editingId = r.id;
        uiState.openMenuId = null;
        onChanged();
      };

      var deleteItem = document.createElement("button");
      deleteItem.className = "card-menu__item";
      deleteItem.textContent = "Delete";
      deleteItem.onclick = function () {
        if (!window.confirm("Delete this register entry? This can't be undone.")) return;
        window.PCC.store.update(function (data) {
          data.risks = data.risks.filter(function (item) {
            return item.id !== r.id;
          });
        });
        window.PCC.notify("Register entry deleted.", "info");
        uiState.openMenuId = null;
        onChanged();
      };

      dropdown.appendChild(editItem);
      dropdown.appendChild(deleteItem);
      menuWrap.appendChild(dropdown);
    }

    actions.appendChild(menuWrap);

    card.appendChild(main);
    card.appendChild(badgeWrap);
    card.appendChild(actions);
    return card;
  }

  function renderRiskDetails(r) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";
    var grid = document.createElement("div");
    grid.className = "detail-grid";

    var fields = [
      { label: "PROBABILITY", value: LEVEL_LABELS[r.probability] },
      { label: "IMPACT", value: LEVEL_LABELS[r.impact] },
      { label: "OWNER", value: r.owner || "\u2014" },
      { label: "DESCRIPTION", value: r.description || "\u2014", wide: true },
      { label: "MITIGATION / RESPONSE", value: r.mitigation || "\u2014", wide: true },
    ];

    fields.forEach(function (f) {
      var item = document.createElement("div");
      if (f.wide) item.style.gridColumn = "1 / -1";
      item.innerHTML = "<span class='detail-item__label'>" + f.label + "</span><span class='detail-item__value'>" + f.value + "</span>";
      grid.appendChild(item);
    });

    wrap.appendChild(grid);

    if (r.source_meeting_id) {
      var sourceMeeting = window.PCC.store.get().meetings.find(function (m) {
        return m.id === r.source_meeting_id;
      });
      if (sourceMeeting) {
        var sourceRow = document.createElement("div");
        sourceRow.style.marginTop = "12px";
        sourceRow.style.paddingTop = "10px";
        sourceRow.style.borderTop = "1px solid var(--divider)";
        sourceRow.style.display = "flex";
        sourceRow.style.justifyContent = "space-between";
        sourceRow.style.alignItems = "center";
        sourceRow.style.fontSize = "13px";

        var sourceLabel = document.createElement("span");
        sourceLabel.innerHTML = "<span class='detail-item__label'>RAISED IN MEETING</span>" + sourceMeeting.title + " (" + sourceMeeting.meeting_date + ")";

        var viewMeetingBtn = document.createElement("button");
        viewMeetingBtn.className = "btn btn--ghost";
        viewMeetingBtn.textContent = "View Meeting";
        viewMeetingBtn.onclick = function () {
          if (window.PCC.meetings) window.PCC.meetings.expandMeeting(sourceMeeting.id);
          window.PCC.router.go("meetings");
        };

        sourceRow.appendChild(sourceLabel);
        sourceRow.appendChild(viewMeetingBtn);
        wrap.appendChild(sourceRow);
      }
    }

    if (r.activity_id) {
      var linkedActivity = window.PCC.store.get().activities.find(function (a) {
        return a.id === r.activity_id;
      });
      if (linkedActivity) {
        var schedule = window.PCC.store.get().schedules.find(function (s) {
          return s.id === linkedActivity.schedule_id;
        });
        var activityRow = document.createElement("div");
        activityRow.style.marginTop = "12px";
        activityRow.style.paddingTop = "10px";
        activityRow.style.borderTop = "1px solid var(--divider)";
        activityRow.style.display = "flex";
        activityRow.style.justifyContent = "space-between";
        activityRow.style.alignItems = "center";
        activityRow.style.fontSize = "13px";

        var activityLabel = document.createElement("span");
        activityLabel.innerHTML = "<span class='detail-item__label'>LINKED ACTIVITY</span>" + linkedActivity.name;

        var viewActivityBtn = document.createElement("button");
        viewActivityBtn.className = "btn btn--ghost";
        viewActivityBtn.textContent = "View in Gantt";
        viewActivityBtn.onclick = function () {
          if (window.PCC.schedule) window.PCC.schedule.viewActivity(r.project_id, linkedActivity.schedule_id, linkedActivity.id);
          window.PCC.router.go("schedule");
        };

        activityRow.appendChild(activityLabel);
        activityRow.appendChild(viewActivityBtn);
        wrap.appendChild(activityRow);
      }
    }

    var linkedChangeOrders = window.PCC.store.get().change_orders.filter(function (co) {
      return co.source_risk_id === r.id;
    });
    if (linkedChangeOrders.length > 0) {
      var coHeading = document.createElement("p");
      coHeading.className = "detail-item__label";
      coHeading.style.marginTop = "14px";
      coHeading.style.marginBottom = "6px";
      coHeading.textContent = "CHANGE ORDERS RAISED (" + linkedChangeOrders.length + ")";
      wrap.appendChild(coHeading);
      linkedChangeOrders.forEach(function (co) {
        var row = document.createElement("p");
        row.style.fontSize = "13px";
        row.style.margin = "0 0 2px";
        row.innerHTML = "<span class='mono'>" + co.number + "</span> \u2014 " + (co.title || "(untitled)");
        wrap.appendChild(row);
      });
    }

    var addCoBtn = document.createElement("button");
    addCoBtn.className = "btn btn--ghost";
    addCoBtn.style.marginTop = "12px";
    addCoBtn.textContent = "+ Raise Change Order from this Risk/Issue";
    addCoBtn.onclick = function () {
      if (window.PCC.changeOrders) window.PCC.changeOrders.createFromRisk(r.project_id, r.id);
      window.PCC.router.go("changeOrders");
    };
    wrap.appendChild(addCoBtn);

    return wrap;
  }

  function renderRiskEntry(r, projects, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderRiskCard(r, projects, onChanged));
    if (uiState.expandedId === r.id) entry.appendChild(renderRiskDetails(r));
    return entry;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();
    var projects = data.projects;

    // Redesign Gate 6 (Global Project Context): pre-fill the project filter from the
    // shared active project on this page's first render only — still fully overridable
    // (including clearing back to "All projects"), never re-applied after that.
    if (!uiState.projectFilterInitialized) {
      uiState.projectFilterInitialized = true;
      var ctxProjectId = window.PCC.projectContext.get();
      if (ctxProjectId && projects.some(function (p) { return p.id === ctxProjectId; })) {
        uiState.projectFilter = ctxProjectId;
      }
    }

    var h1 = document.createElement("h2");
    h1.textContent = "Risk Register";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    // UI/UX Overhaul Gate 6: the heat map now reflects the toolbar's own filters (see
    // riskMatchesToolbarFilters()/renderHeatmap()'s own comments for the bug this
    // fixes), so it needs its own refreshable container — the toolbar's search/type/
    // status/project handlers below call refreshFilteredViews() instead of the lighter
    // renderList() alone, updating both the heat map and the list without a full-page
    // rerender (which would blow away the search input's focus/cursor position mid-type,
    // the same reason renderList() existed as a separate partial-update path already).
    var heatmapWrap = document.createElement("div");
    outlet.appendChild(heatmapWrap);
    function renderHeatmapPanel() {
      heatmapWrap.innerHTML = "";
      heatmapWrap.appendChild(renderHeatmap(data.risks, refreshFilteredViews));
    }
    renderHeatmapPanel();

    if (uiState.editingId) {
      var riskBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newRisk(uiState.pendingPrefill || {})
          : data.risks.find(function (r) {
              return r.id === uiState.editingId;
            });
      if (uiState.editingId === "new") uiState.pendingPrefill = null;
      renderForm(outlet, riskBeingEdited, projects, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search title, description, owner\u2026";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      refreshFilteredViews();
    };

    var typeSelect = document.createElement("select");
    var allTypesOpt = document.createElement("option");
    allTypesOpt.value = "";
    allTypesOpt.textContent = "All types";
    typeSelect.appendChild(allTypesOpt);
    window.PCC.store.RISK_TYPES.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      opt.textContent = TYPE_LABELS[t];
      typeSelect.appendChild(opt);
    });
    typeSelect.value = uiState.typeFilter;
    typeSelect.onchange = function () {
      uiState.typeFilter = typeSelect.value;
      refreshFilteredViews();
    };

    var statusSelect = document.createElement("select");
    var allStatusOpt = document.createElement("option");
    allStatusOpt.value = "";
    allStatusOpt.textContent = "All statuses";
    statusSelect.appendChild(allStatusOpt);
    window.PCC.store.RISK_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABELS[s];
      statusSelect.appendChild(opt);
    });
    statusSelect.value = uiState.statusFilter;
    statusSelect.onchange = function () {
      uiState.statusFilter = statusSelect.value;
      refreshFilteredViews();
    };

    var projSelectFilter = document.createElement("select");
    var allProjOpt = document.createElement("option");
    allProjOpt.value = "";
    allProjOpt.textContent = "All projects";
    projSelectFilter.appendChild(allProjOpt);
    projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projSelectFilter.appendChild(opt);
    });
    projSelectFilter.value = uiState.projectFilter;
    projSelectFilter.onchange = function () {
      uiState.projectFilter = projSelectFilter.value;
      // Redesign Gate 6: picking a specific project carries it to every other module too
      // (schedule.js/executiveCenter.js/etc. all read the same shared context); clearing
      // back to "All projects" is just this register's own view and does NOT clear the
      // shared context — a Pattern-A page (Schedule etc.) can't have "no project" at all,
      // so there's nothing sensible for it to fall back to if this cleared it.
      if (uiState.projectFilter) window.PCC.projectContext.set(uiState.projectFilter);
      refreshFilteredViews();
    };

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Entry";
    var hasActiveProjects = projects.some(function (p) {
      return !p.archived;
    });
    addBtn.disabled = !hasActiveProjects;
    addBtn.title = hasActiveProjects ? "" : "Add a project in Portfolio first";
    addBtn.onclick = function () {
      uiState.editingId = "new";
      rerender();
    };

    toolbar.appendChild(searchInput);
    toolbar.appendChild(typeSelect);
    toolbar.appendChild(statusSelect);
    toolbar.appendChild(projSelectFilter);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.risks.filter(riskMatchesFilters);

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.risks.length === 0
            ? projects.filter(function (p) { return !p.archived; }).length === 0
              ? "Add a project in Portfolio first, then log risks, issues, and opportunities against it."
              : "No entries yet. Click \u201c+ Add Entry\u201d to log your first risk, issue, or opportunity."
            : "No entries match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (r) {
        list.appendChild(renderRiskEntry(r, projects, rerender));
      });
      listWrap.appendChild(list);
    }

    // Refreshes both the heat map and the list without a full-page rerender — used by
    // every toolbar filter control so the heat map's counts never go stale relative to
    // what's actually listed below it.
    function refreshFilteredViews() {
      renderHeatmapPanel();
      renderList();
    }

    renderList();
  }

  window.PCC.pages.risks = render;
  window.PCC.risks = {
    filterByProject: function (projectId) {
      uiState.projectFilter = projectId;
      uiState.statusFilter = "";
      uiState.search = "";
      uiState.heatmapFilter = null;
    },
    createFromMeeting: function (projectId, meetingId) {
      uiState.pendingPrefill = { project_id: projectId, source_meeting_id: meetingId };
      uiState.editingId = "new";
    },
    expandRisk: function (riskId) {
      uiState.expandedId = riskId;
    },
  };
})();
