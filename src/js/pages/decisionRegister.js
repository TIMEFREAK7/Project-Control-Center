/* Decision Register (PCC Evolution Roadmap, Tier C: Project Performance).
 *
 * A new register recording key project decisions — distinct from Risk/Issue/Opportunity
 * (which tracks uncertainty needing a probability/impact matrix) and RFI/TQ (which tracks
 * a question awaiting an answer). A decision is neither: it's a choice made (or pending),
 * with context, who made it, and when. Same project-scoped register shape as
 * risks.js/rfis.js — full CRUD, an optional Schedule activity link (Gate 10 pattern), and
 * an optional source_meeting_id so a decision can be raised directly from a meeting's
 * minutes, reusing the exact createFromMeeting()/pendingPrefill pattern Risk/RFI/Change
 * Orders already established.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var STATUS_LABELS = { pending: "Pending", decided: "Decided", deferred: "Deferred", superseded: "Superseded" };
  // PCC Evolution Roadmap, Tier E: Personal Workbench ("Waiting For" section).
  var WAITING_ON_LABELS = { vendor: "Vendor", client: "Client", consultant: "Consultant", management: "Management" };

  var FIELD_CONFIG = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "status", label: "Status", type: "select", options: "DECISION_STATUSES", labels: STATUS_LABELS },
    { key: "decision_date", label: "Decision Date", type: "date" },
    { key: "decided_by", label: "Decided By", type: "text" },
    { key: "waiting_on_party", label: "Waiting On", type: "select", options: "WAITING_ON_PARTIES", labels: WAITING_ON_LABELS, optional: true },
    { key: "description", label: "Context / Background", type: "textarea" },
    { key: "decision", label: "Decision", type: "textarea" },
  ];

  var uiState = {
    search: "",
    statusFilter: "",
    projectFilter: "",
    // Redesign Gate 6 (Global Project Context): see risks.js's own uiState comment.
    projectFilterInitialized: false,
    editingId: null,
    expandedId: null,
    pendingPrefill: null, // { project_id, source_meeting_id } set by createFromMeeting()
    // Daily-Use Audit Phase 3 (bulk actions): { [decisionId]: true } for every checked
    // row — see risks.js's own uiState comment on this exact pattern.
    selectedIds: {},
  };

  function projectName(projects, projectId) {
    if (!projectId) return "Unassigned";
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "Unassigned";
  }

  function buildField(cfg, decision) {
    var field = document.createElement("div");
    field.className = "field";
    if (cfg.type === "textarea") field.style.gridColumn = "1 / -1";

    var label = document.createElement("label");
    label.textContent = cfg.label + (cfg.required ? " *" : "");
    label.setAttribute("for", "decfield-" + cfg.key);
    field.appendChild(label);

    var input;
    if (cfg.type === "select") {
      input = document.createElement("select");
      if (cfg.optional) {
        var noneOpt = document.createElement("option");
        noneOpt.value = "";
        noneOpt.textContent = "Not set";
        input.appendChild(noneOpt);
      }
      window.PCC.store[cfg.options].forEach(function (val) {
        var opt = document.createElement("option");
        opt.value = val;
        opt.textContent = cfg.labels[val] || val;
        input.appendChild(opt);
      });
      input.value = decision[cfg.key] || "";
    } else if (cfg.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
      input.value = decision[cfg.key] || "";
    } else {
      input = document.createElement("input");
      input.type = cfg.type;
      input.value = decision[cfg.key] || "";
    }
    input.id = "decfield-" + cfg.key;
    input.name = cfg.key;
    if (cfg.required) input.required = true;

    field.appendChild(input);
    return field;
  }

  /** Gate 10 pattern, duplicated from risks.js/rfis.js per this codebase's existing
   * per-module-helpers convention. */
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
      var el = formEl.querySelector("#decfield-" + cfg.key);
      if (el) values[cfg.key] = el.value;
    });
    return values;
  }

  function renderForm(container, decision, projects, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Decision" : "Edit Decision";
    panel.appendChild(heading);

    if (decision.source_meeting_id) {
      var sourceMeeting = window.PCC.store.get().meetings.find(function (m) {
        return m.id === decision.source_meeting_id;
      });
      if (sourceMeeting) {
        var linkNote = document.createElement("p");
        linkNote.className = "text-secondary";
        linkNote.style.fontSize = "12px";
        linkNote.style.marginTop = "-8px";
        linkNote.style.marginBottom = "14px";
        linkNote.textContent = "Linked to meeting: “" + sourceMeeting.title + "” (" + sourceMeeting.meeting_date + ")";
        panel.appendChild(linkNote);
      }
    }

    var form = document.createElement("form");

    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project *</label>";
    var projSelect = document.createElement("select");
    projSelect.id = "decfield-project_id";
    var activeProjects = projects.filter(function (p) {
      return !p.archived;
    });
    if (activeProjects.length === 0) {
      var noProjOpt = document.createElement("option");
      noProjOpt.value = "";
      noProjOpt.textContent = "No projects yet — add one in Portfolio first";
      projSelect.appendChild(noProjOpt);
      projSelect.disabled = true;
    } else {
      activeProjects.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "(unnamed project)";
        projSelect.appendChild(opt);
      });
      projSelect.value = decision.project_id || activeProjects[0].id;
    }
    projField.appendChild(projSelect);
    form.appendChild(projField);

    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Linked Activity (optional)</label>";
    var activitySelect = document.createElement("select");
    activitySelect.id = "decfield-activity_id";
    activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, decision.activity_id);
    activityField.appendChild(activitySelect);
    form.appendChild(activityField);
    projSelect.onchange = function () {
      activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, "");
    };

    var grid = document.createElement("div");
    grid.className = "form-grid";
    FIELD_CONFIG.forEach(function (cfg) {
      grid.appendChild(buildField(cfg, decision));
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
    saveBtn.textContent = isNew ? "Add Decision" : "Save Changes";
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
      if (isNew) values.source_meeting_id = decision.source_meeting_id || "";
      if (!values.title || !values.title.trim() || !values.project_id) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.decisions.push(window.PCC.store.newDecision(values));
        } else {
          var existing = data.decisions.find(function (d) {
            return d.id === decision.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.store.rememberLastUsedName("decision_decided_by", values.decided_by);
      window.PCC.notify(isNew ? "Decision added." : "Decision updated.", "success");
      uiState.editingId = null;
      onSaved();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function decisionMatchesFilters(d) {
    if (uiState.statusFilter && d.status !== uiState.statusFilter) return false;
    if (uiState.projectFilter && d.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var haystack = (d.title + " " + d.description + " " + d.decision + " " + d.decided_by).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderDecisionCard(d, projects, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card";

    // Daily-Use Audit Phase 3 (bulk actions).
    var selectBox = document.createElement("input");
    selectBox.type = "checkbox";
    selectBox.className = "project-card__select";
    selectBox.setAttribute("aria-label", "Select this entry for a bulk action");
    selectBox.checked = !!uiState.selectedIds[d.id];
    selectBox.onchange = function () {
      if (selectBox.checked) uiState.selectedIds[d.id] = true;
      else delete uiState.selectedIds[d.id];
      onChanged();
    };
    card.appendChild(selectBox);

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'>" +
      (d.title || "(untitled)") +
      "</div><div class='project-card__meta'>" +
      projectName(projects, d.project_id) + (d.decided_by ? " · " + d.decided_by : "") + (d.decision_date ? " · " + d.decision_date : "") +
      "</div>";

    var statusBadge = document.createElement("span");
    statusBadge.className =
      "status-badge status-badge--" +
      (d.status === "decided" ? "complete" : d.status === "superseded" ? "info" : d.status === "deferred" ? "at_risk" : "info");
    statusBadge.textContent = STATUS_LABELS[d.status];

    var badgeWrap = document.createElement("div");
    badgeWrap.style.display = "flex";
    badgeWrap.style.gap = "6px";
    badgeWrap.appendChild(statusBadge);

    var actions = document.createElement("div");
    actions.className = "project-card__actions";

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === d.id ? "Hide" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === d.id ? null : d.id;
      onChanged();
    };

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingId = d.id;
      onChanged();
    };

    // Daily-Use Audit Phase 3 ("duplicate as template"): opens the Add form pre-filled
    // with this decision's context — deliberately excludes the actual `decision` text,
    // decided_by, and decision_date, since a clone is a new pending question, not a copy
    // of an already-made call.
    var cloneBtn = document.createElement("button");
    cloneBtn.className = "btn btn--ghost";
    cloneBtn.textContent = "Clone";
    cloneBtn.onclick = function () {
      uiState.pendingPrefill = {
        project_id: d.project_id,
        title: d.title,
        description: d.description,
        waiting_on_party: d.waiting_on_party,
        activity_id: d.activity_id,
      };
      uiState.editingId = "new";
      onChanged();
    };

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      if (!window.confirm("Delete this decision? This can't be undone.")) return;
      window.PCC.store.update(function (data) {
        data.decisions = data.decisions.filter(function (item) {
          return item.id !== d.id;
        });
      });
      window.PCC.notify("Decision deleted.", "info");
      onChanged();
    };

    actions.appendChild(detailsBtn);
    actions.appendChild(editBtn);
    actions.appendChild(cloneBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(main);
    card.appendChild(badgeWrap);
    card.appendChild(actions);
    return card;
  }

  function renderDecisionDetails(d) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";
    var grid = document.createElement("div");
    grid.className = "detail-grid";

    var fields = [
      { label: "STATUS", value: STATUS_LABELS[d.status] },
      { label: "DECISION DATE", value: d.decision_date || "—" },
      { label: "DECIDED BY", value: d.decided_by || "—" },
      { label: "CONTEXT / BACKGROUND", value: d.description || "—", wide: true },
      { label: "DECISION", value: d.decision || "—", wide: true },
    ];

    fields.forEach(function (f) {
      var item = document.createElement("div");
      if (f.wide) item.style.gridColumn = "1 / -1";
      item.innerHTML = "<span class='detail-item__label'>" + f.label + "</span><span class='detail-item__value'>" + f.value + "</span>";
      grid.appendChild(item);
    });

    wrap.appendChild(grid);

    if (d.source_meeting_id) {
      var sourceMeeting = window.PCC.store.get().meetings.find(function (m) {
        return m.id === d.source_meeting_id;
      });
      if (sourceMeeting) {
        // Redesign Gate 10 (Module Consistency Pass): retrofitted onto the same
        // .attention-list/.attention-item primitive every other panel-turned-list in
        // this app now uses — "info" icon color since this is a plain cross-reference,
        // not a severity alert, same convention My Work's own "Recently Updated"
        // sections already use for non-alert informational rows. Whole row is the click
        // target now, replacing the separate "View Meeting" ghost button.
        var sourceList = document.createElement("div");
        sourceList.className = "attention-list";
        sourceList.style.marginTop = "12px";
        sourceList.style.paddingTop = "10px";
        sourceList.style.borderTop = "1px solid var(--divider)";

        var sourceRow = document.createElement("div");
        sourceRow.className = "attention-item attention-item--clickable";
        sourceRow.onclick = function () {
          if (window.PCC.meetings) window.PCC.meetings.expandMeeting(sourceMeeting.id);
          window.PCC.router.go("meetings");
        };

        var sourceIcon = document.createElement("span");
        sourceIcon.className = "attention-item__icon attention-item__icon--info";
        sourceRow.appendChild(sourceIcon);

        var sourceBody = document.createElement("div");
        sourceBody.className = "attention-item__body";
        var sourceText = document.createElement("div");
        sourceText.className = "attention-item__text";
        sourceText.textContent = sourceMeeting.title + " (" + sourceMeeting.meeting_date + ")";
        sourceBody.appendChild(sourceText);
        var sourceMeta = document.createElement("div");
        sourceMeta.className = "attention-item__meta";
        sourceMeta.textContent = "RAISED IN MEETING";
        sourceBody.appendChild(sourceMeta);
        sourceRow.appendChild(sourceBody);

        sourceList.appendChild(sourceRow);
        wrap.appendChild(sourceList);
      }
    }

    if (d.activity_id) {
      var linkedActivity = window.PCC.store.get().activities.find(function (a) {
        return a.id === d.activity_id;
      });
      if (linkedActivity) {
        // Redesign Gate 10 (Module Consistency Pass): same retrofit as the source-
        // meeting row above.
        var activityList = document.createElement("div");
        activityList.className = "attention-list";
        activityList.style.marginTop = "12px";
        activityList.style.paddingTop = "10px";
        activityList.style.borderTop = "1px solid var(--divider)";

        var activityRow = document.createElement("div");
        activityRow.className = "attention-item attention-item--clickable";
        activityRow.onclick = function () {
          if (window.PCC.schedule) window.PCC.schedule.viewActivity(d.project_id, linkedActivity.schedule_id, linkedActivity.id);
          window.PCC.router.go("schedule");
        };

        var activityIcon = document.createElement("span");
        activityIcon.className = "attention-item__icon attention-item__icon--info";
        activityRow.appendChild(activityIcon);

        var activityBody = document.createElement("div");
        activityBody.className = "attention-item__body";
        var activityText = document.createElement("div");
        activityText.className = "attention-item__text";
        activityText.textContent = linkedActivity.name;
        activityBody.appendChild(activityText);
        var activityMeta = document.createElement("div");
        activityMeta.className = "attention-item__meta";
        activityMeta.textContent = "LINKED ACTIVITY";
        activityBody.appendChild(activityMeta);
        activityRow.appendChild(activityBody);

        activityList.appendChild(activityRow);
        wrap.appendChild(activityList);
      }
    }

    return wrap;
  }

  function renderDecisionEntry(d, projects, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderDecisionCard(d, projects, onChanged));
    if (uiState.expandedId === d.id) entry.appendChild(renderDecisionDetails(d));
    return entry;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();
    var projects = data.projects;

    // Redesign Gate 6 (Global Project Context): see risks.js's own comment on this
    // exact pattern.
    if (!uiState.projectFilterInitialized) {
      uiState.projectFilterInitialized = true;
      var ctxProjectId = window.PCC.projectContext.get();
      if (ctxProjectId && projects.some(function (p) { return p.id === ctxProjectId; })) {
        uiState.projectFilter = ctxProjectId;
      }
    }

    var h1 = document.createElement("h2");
    h1.textContent = "Decision Register";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    if (uiState.editingId) {
      var decisionBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newDecision(uiState.pendingPrefill || {})
          : data.decisions.find(function (d) {
              return d.id === uiState.editingId;
            });
      if (uiState.editingId === "new") uiState.pendingPrefill = null;
      renderForm(outlet, decisionBeingEdited, projects, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search title, context, decision, decided by…";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      renderList();
    };

    var statusSelect = document.createElement("select");
    var allStatusOpt = document.createElement("option");
    allStatusOpt.value = "";
    allStatusOpt.textContent = "All statuses";
    statusSelect.appendChild(allStatusOpt);
    window.PCC.store.DECISION_STATUSES.forEach(function (s) {
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
      if (uiState.projectFilter) window.PCC.projectContext.set(uiState.projectFilter);
      renderList();
    };

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Decision";
    var hasActiveProjects = projects.some(function (p) {
      return !p.archived;
    });
    addBtn.disabled = !hasActiveProjects;
    addBtn.title = hasActiveProjects ? "" : "Add a project in Portfolio first";
    addBtn.onclick = function () {
      // Daily-Use Audit Phase 3 (field memory): pre-fill Decided By with whoever
      // decided the last entry.
      var lastDecidedBy = window.PCC.store.getLastUsedName("decision_decided_by");
      uiState.pendingPrefill = lastDecidedBy ? { decided_by: lastDecidedBy } : null;
      uiState.editingId = "new";
      rerender();
    };

    toolbar.appendChild(searchInput);
    toolbar.appendChild(statusSelect);
    toolbar.appendChild(projSelectFilter);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    // Daily-Use Audit Phase 3 (bulk actions). "Mark as Decided" is deliberately not a
    // bulk action — this register requires the actual `decision` text before status can
    // meaningfully move to "decided" (see newDecision()'s own comment), which a bulk
    // action across dissimilar entries can't supply. Defer Selected needs no such text.
    function selectedCount() {
      return Object.keys(uiState.selectedIds).length;
    }

    function clearSelection() {
      uiState.selectedIds = {};
    }

    function renderBulkBar() {
      var n = selectedCount();
      if (n === 0) return null;
      var noun = n === 1 ? "entry" : "entries";

      var bar = document.createElement("div");
      bar.className = "bulk-action-bar";

      var countEl = document.createElement("span");
      countEl.className = "bulk-action-bar__count";
      countEl.textContent = n + " selected";
      bar.appendChild(countEl);

      var deferBtn = document.createElement("button");
      deferBtn.className = "btn btn--ghost";
      deferBtn.textContent = "Defer Selected";
      deferBtn.onclick = function () {
        window.PCC.store.update(function (data) {
          data.decisions.forEach(function (item) {
            if (uiState.selectedIds[item.id]) {
              item.status = "deferred";
              item.updated_at = new Date().toISOString();
            }
          });
        });
        window.PCC.notify(n + " " + noun + " deferred.", "success");
        clearSelection();
        rerender();
      };
      bar.appendChild(deferBtn);

      var spacer = document.createElement("div");
      spacer.className = "bulk-action-bar__spacer";
      bar.appendChild(spacer);

      var clearBtn = document.createElement("button");
      clearBtn.className = "btn btn--ghost";
      clearBtn.textContent = "Clear Selection";
      clearBtn.onclick = function () {
        clearSelection();
        rerender();
      };
      bar.appendChild(clearBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete Selected";
      deleteBtn.onclick = function () {
        if (!window.confirm("Delete " + n + " selected " + noun + "? This can't be undone.")) return;
        window.PCC.store.update(function (data) {
          data.decisions = data.decisions.filter(function (item) {
            return !uiState.selectedIds[item.id];
          });
        });
        window.PCC.notify(n + " " + noun + " deleted.", "info");
        clearSelection();
        rerender();
      };
      bar.appendChild(deleteBtn);

      return bar;
    }

    function renderList() {
      listWrap.innerHTML = "";
      var bulkBar = renderBulkBar();
      if (bulkBar) listWrap.appendChild(bulkBar);
      var filtered = data.decisions.filter(decisionMatchesFilters);

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.decisions.length === 0
            ? projects.filter(function (p) { return !p.archived; }).length === 0
              ? "Add a project in Portfolio first, then log decisions against it."
              : "No decisions logged yet. Click “+ Add Decision” to log your first one."
            : "No decisions match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (d) {
        list.appendChild(renderDecisionEntry(d, projects, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.decisionRegister = render;
  window.PCC.decisionRegister = {
    filterByProject: function (projectId) {
      uiState.projectFilter = projectId;
      uiState.projectFilterInitialized = true;
      uiState.statusFilter = "";
      uiState.search = "";
      window.PCC.projectContext.set(projectId);
    },
    createFromMeeting: function (projectId, meetingId) {
      uiState.pendingPrefill = { project_id: projectId, source_meeting_id: meetingId };
      uiState.editingId = "new";
    },
    expandDecision: function (decisionId) {
      uiState.expandedId = decisionId;
    },
  };
})();
