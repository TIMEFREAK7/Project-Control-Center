(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var TYPE_LABELS = { rfi: "RFI", technical_query: "Technical Query" };
  var STATUS_LABELS = { open: "Open", answered: "Answered", closed: "Closed" };
  var PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" };

  var FIELD_CONFIG = [
    { key: "subject", label: "Subject", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: "RFI_TYPES", labels: TYPE_LABELS },
    { key: "priority", label: "Priority", type: "select", options: "RFI_PRIORITIES", labels: PRIORITY_LABELS },
    { key: "raised_by", label: "Raised By", type: "text" },
    { key: "assigned_to", label: "Assigned To", type: "text" },
    { key: "date_raised", label: "Date Raised", type: "date" },
    { key: "date_required", label: "Response Required By", type: "date" },
    { key: "question", label: "Question / Query", type: "textarea", required: true },
  ];

  var uiState = {
    search: "",
    typeFilter: "",
    statusFilter: "", // unlike Risk Register, closed RFIs stay useful reference (what was asked/answered), so default shows all
    projectFilter: "",
    editingId: null,
    expandedId: null,
    revisionDrafts: {}, // { [rfiId]: { author, note } } — in-progress "add revision" inputs, kept across rerenders
    pendingPrefill: null, // { project_id, source_meeting_id } set by createFromMeeting()
  };

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function isOverdue(r) {
    return r.status === "open" && !!r.date_required && r.date_required < today();
  }

  function projectName(projects, projectId) {
    if (!projectId) return "Unassigned";
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "Unassigned";
  }

  function buildField(cfg, rfi) {
    var field = document.createElement("div");
    field.className = "field";
    if (cfg.type === "textarea") field.style.gridColumn = "1 / -1";

    var label = document.createElement("label");
    label.textContent = cfg.label + (cfg.required ? " *" : "");
    label.setAttribute("for", "rfifield-" + cfg.key);
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
      input.value = rfi[cfg.key];
    } else if (cfg.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
      input.value = rfi[cfg.key] || "";
    } else {
      input = document.createElement("input");
      input.type = cfg.type;
      input.value = rfi[cfg.key] || "";
    }
    input.id = "rfifield-" + cfg.key;
    input.name = cfg.key;
    if (cfg.required) input.required = true;

    field.appendChild(input);
    return field;
  }

  function buildCheckboxField(key, label, checked) {
    var field = document.createElement("div");
    field.className = "field";
    var wrap = document.createElement("label");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "6px";
    wrap.style.fontWeight = "normal";

    var input = document.createElement("input");
    input.type = "checkbox";
    input.id = "rfifield-" + key;
    input.name = key;
    input.checked = !!checked;

    wrap.appendChild(input);
    var span = document.createElement("span");
    span.textContent = label;
    wrap.appendChild(span);
    field.appendChild(wrap);
    return field;
  }

  function readFormValues(formEl) {
    var values = {};
    FIELD_CONFIG.forEach(function (cfg) {
      var el = formEl.querySelector("#rfifield-" + cfg.key);
      if (el) values[cfg.key] = el.value;
    });
    var costEl = formEl.querySelector("#rfifield-cost_impact");
    var schedEl = formEl.querySelector("#rfifield-schedule_impact");
    if (costEl) values.cost_impact = costEl.checked;
    if (schedEl) values.schedule_impact = schedEl.checked;
    return values;
  }

  function renderForm(container, rfi, projects, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add RFI / Technical Query" : "Edit " + (rfi.number || "Entry");
    panel.appendChild(heading);

    if (rfi.source_meeting_id) {
      var sourceMeeting = window.PCC.store.get().meetings.find(function (m) {
        return m.id === rfi.source_meeting_id;
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
    projSelect.id = "rfifield-project_id";
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
      projSelect.value = rfi.project_id || activeProjects[0].id;
    }
    projField.appendChild(projSelect);
    form.appendChild(projField);

    var grid = document.createElement("div");
    grid.className = "form-grid";
    FIELD_CONFIG.forEach(function (cfg) {
      grid.appendChild(buildField(cfg, rfi));
    });
    grid.appendChild(buildCheckboxField("cost_impact", "Cost Impact", rfi.cost_impact));
    grid.appendChild(buildCheckboxField("schedule_impact", "Schedule Impact", rfi.schedule_impact));

    if (!isNew) {
      var responseField = document.createElement("div");
      responseField.className = "field";
      responseField.style.gridColumn = "1 / -1";
      var responseLabel = document.createElement("label");
      responseLabel.textContent = "Response";
      responseLabel.setAttribute("for", "rfifield-response");
      var responseInput = document.createElement("textarea");
      responseInput.rows = 3;
      responseInput.id = "rfifield-response";
      responseInput.name = "response";
      responseInput.value = rfi.response || "";
      responseField.appendChild(responseLabel);
      responseField.appendChild(responseInput);
      grid.appendChild(responseField);

      var statusField = document.createElement("div");
      statusField.className = "field";
      var statusLabel = document.createElement("label");
      statusLabel.textContent = "Status";
      statusLabel.setAttribute("for", "rfifield-status");
      var statusInput = document.createElement("select");
      statusInput.id = "rfifield-status";
      statusInput.name = "status";
      window.PCC.store.RFI_STATUSES.forEach(function (val) {
        var opt = document.createElement("option");
        opt.value = val;
        opt.textContent = STATUS_LABELS[val];
        statusInput.appendChild(opt);
      });
      statusInput.value = rfi.status;
      statusField.appendChild(statusLabel);
      statusField.appendChild(statusInput);
      grid.appendChild(statusField);
    }

    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Subject, Question, and Project are required.";
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
      if (isNew) values.source_meeting_id = rfi.source_meeting_id || "";

      if (!isNew) {
        var responseEl = form.querySelector("#rfifield-response");
        var statusEl = form.querySelector("#rfifield-status");
        if (responseEl) values.response = responseEl.value;
        if (statusEl) values.status = statusEl.value;
      }

      if (!values.subject || !values.subject.trim() || !values.question || !values.question.trim() || !values.project_id) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      window.PCC.store.update(function (data) {
        if (isNew) {
          values.number = window.PCC.store.nextRfiNumber(data.rfis, values.type || "rfi");
          data.rfis.push(window.PCC.store.newRfi(values));
        } else {
          var existing = data.rfis.find(function (r) {
            return r.id === rfi.id;
          });
          if (existing) {
            var wasAnswered = existing.status !== "answered" && existing.status !== "closed" && values.status === "answered";
            Object.assign(existing, values);
            if (wasAnswered && !existing.date_answered) existing.date_answered = today();
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Entry added." : "Entry updated.", "success");
      uiState.editingId = null;
      onSaved();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function rfiMatchesFilters(r) {
    if (uiState.typeFilter && r.type !== uiState.typeFilter) return false;
    if (uiState.statusFilter && r.status !== uiState.statusFilter) return false;
    if (uiState.projectFilter && r.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var haystack = (r.number + " " + r.subject + " " + r.question + " " + r.raised_by + " " + r.assigned_to).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderRfiCard(r, projects, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card";

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'>" +
      "<span class='mono'>" + r.number + "</span> \u2014 " + (r.subject || "(untitled)") +
      "</div><div class='project-card__meta'>" +
      TYPE_LABELS[r.type] + " \u00b7 " + projectName(projects, r.project_id) + (r.assigned_to ? " \u00b7 " + r.assigned_to : "") +
      "</div>";

    var statusBadge = document.createElement("span");
    statusBadge.className =
      "status-badge status-badge--" + (r.status === "closed" ? "complete" : r.status === "answered" ? "on_track" : "info");
    statusBadge.textContent = STATUS_LABELS[r.status];

    var priorityBadge = document.createElement("span");
    priorityBadge.className =
      "status-badge status-badge--" + (r.priority === "high" ? "critical" : r.priority === "medium" ? "at_risk" : "on_track");
    priorityBadge.textContent = PRIORITY_LABELS[r.priority] + " Priority";

    var badgeWrap = document.createElement("div");
    badgeWrap.style.display = "flex";
    badgeWrap.style.gap = "6px";
    badgeWrap.style.flexWrap = "wrap";
    badgeWrap.appendChild(statusBadge);
    badgeWrap.appendChild(priorityBadge);

    if (isOverdue(r)) {
      var overdueBadge = document.createElement("span");
      overdueBadge.className = "status-badge status-badge--critical";
      overdueBadge.textContent = "Overdue";
      badgeWrap.appendChild(overdueBadge);
    }

    var actions = document.createElement("div");
    actions.className = "project-card__actions";

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === r.id ? "Hide" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === r.id ? null : r.id;
      onChanged();
    };

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingId = r.id;
      onChanged();
    };

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      if (!window.confirm("Delete this " + TYPE_LABELS[r.type] + "? This can't be undone.")) return;
      window.PCC.store.update(function (data) {
        data.rfis = data.rfis.filter(function (item) {
          return item.id !== r.id;
        });
      });
      window.PCC.notify("Entry deleted.", "info");
      onChanged();
    };

    actions.appendChild(detailsBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(main);
    card.appendChild(badgeWrap);
    card.appendChild(actions);
    return card;
  }

  function renderRfiDetails(r, onChanged) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";
    var grid = document.createElement("div");
    grid.className = "detail-grid";

    var fields = [
      { label: "RAISED BY", value: r.raised_by || "\u2014" },
      { label: "ASSIGNED TO", value: r.assigned_to || "\u2014" },
      { label: "DATE RAISED", value: r.date_raised || "\u2014" },
      { label: "RESPONSE REQUIRED BY", value: r.date_required || "\u2014" },
      { label: "COST IMPACT", value: r.cost_impact ? "Yes" : "No" },
      { label: "SCHEDULE IMPACT", value: r.schedule_impact ? "Yes" : "No" },
      { label: "QUESTION / QUERY", value: r.question || "\u2014", wide: true },
      { label: "RESPONSE", value: r.response || "\u2014 (awaiting response)", wide: true },
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

    var linkedChangeOrders = window.PCC.store.get().change_orders.filter(function (co) {
      return co.source_rfi_id === r.id;
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
    addCoBtn.style.marginTop = "8px";
    addCoBtn.textContent = "+ Raise Change Order from this Entry";
    addCoBtn.onclick = function () {
      if (window.PCC.changeOrders) window.PCC.changeOrders.createFromRfi(r.project_id, r.id);
      window.PCC.router.go("changeOrders");
    };
    wrap.appendChild(addCoBtn);

    // Revision history — a running, append-only log of what happened to this entry
    // over time. Distinct from the Question/Response fields, which hold the current
    // state; this is the "what changed and when" thread underneath them.
    var revisionsWrap = document.createElement("div");
    revisionsWrap.style.marginTop = "14px";
    revisionsWrap.style.paddingTop = "10px";
    revisionsWrap.style.borderTop = "1px solid var(--divider)";

    var revisionsHeading = document.createElement("p");
    revisionsHeading.className = "detail-item__label";
    revisionsHeading.style.marginBottom = "6px";
    revisionsHeading.textContent = "REVISION HISTORY (" + r.revisions.length + ")";
    revisionsWrap.appendChild(revisionsHeading);

    if (r.revisions.length === 0) {
      var noRevisions = document.createElement("p");
      noRevisions.className = "text-secondary";
      noRevisions.style.fontSize = "13px";
      noRevisions.style.margin = "0 0 8px";
      noRevisions.textContent = "No revision notes logged yet.";
      revisionsWrap.appendChild(noRevisions);
    } else {
      r.revisions
        .slice()
        .reverse()
        .forEach(function (rev) {
          var row = document.createElement("div");
          row.style.fontSize = "13px";
          row.style.marginBottom = "6px";
          row.innerHTML =
            "<span class='mono' style='color:var(--text-secondary)'>" + rev.date + "</span>" +
            (rev.author ? " \u2014 <strong>" + rev.author + "</strong>" : "") +
            ": " + rev.note;
          revisionsWrap.appendChild(row);
        });
    }

    var draft = uiState.revisionDrafts[r.id] || { author: "", note: "" };

    var revForm = document.createElement("div");
    revForm.style.display = "flex";
    revForm.style.gap = "6px";
    revForm.style.marginTop = "6px";
    revForm.style.flexWrap = "wrap";

    var authorInput = document.createElement("input");
    authorInput.type = "text";
    authorInput.placeholder = "Author";
    authorInput.style.maxWidth = "140px";
    authorInput.value = draft.author;
    authorInput.oninput = function () {
      uiState.revisionDrafts[r.id] = { author: authorInput.value, note: noteInput.value };
    };

    var noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.placeholder = "Add a revision note\u2026";
    noteInput.style.flex = "1";
    noteInput.style.minWidth = "180px";
    noteInput.value = draft.note;
    noteInput.oninput = function () {
      uiState.revisionDrafts[r.id] = { author: authorInput.value, note: noteInput.value };
    };

    var addRevBtn = document.createElement("button");
    addRevBtn.className = "btn btn--ghost";
    addRevBtn.type = "button";
    addRevBtn.textContent = "Add Note";
    addRevBtn.onclick = function () {
      if (!noteInput.value.trim()) return;
      window.PCC.store.update(function (data) {
        var existing = data.rfis.find(function (item) {
          return item.id === r.id;
        });
        if (existing) {
          existing.revisions.push(
            window.PCC.store.newRfiRevision({ author: authorInput.value.trim(), note: noteInput.value.trim() })
          );
          existing.updated_at = new Date().toISOString();
        }
      });
      delete uiState.revisionDrafts[r.id];
      onChanged();
    };

    revForm.appendChild(authorInput);
    revForm.appendChild(noteInput);
    revForm.appendChild(addRevBtn);
    revisionsWrap.appendChild(revForm);

    wrap.appendChild(revisionsWrap);

    return wrap;
  }

  function renderRfiEntry(r, projects, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderRfiCard(r, projects, onChanged));
    if (uiState.expandedId === r.id) entry.appendChild(renderRfiDetails(r, onChanged));
    return entry;
  }

  function renderOverduePanel(rfis, projects) {
    var overdueItems = rfis.filter(isOverdue);
    if (overdueItems.length === 0) return null;

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";
    panel.style.borderColor = "var(--status-critical)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "8px";
    heading.style.color = "var(--status-critical)";
    heading.textContent = "Overdue RFIs / Technical Queries (" + overdueItems.length + ")";
    panel.appendChild(heading);

    var list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    overdueItems.slice(0, 8).forEach(function (r) {
      var row = document.createElement("div");
      row.style.fontSize = "13px";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.innerHTML =
        "<span><span class='mono'>" + r.number + "</span> \u2014 " + (r.subject || "(untitled)") +
        " <span class='text-secondary'>(" + projectName(projects, r.project_id) + ")</span></span>" +
        "<span class='mono' style='color:var(--status-critical)'>" + r.date_required + "</span>";
      list.appendChild(row);
    });
    panel.appendChild(list);

    if (overdueItems.length > 8) {
      var more = document.createElement("p");
      more.className = "text-secondary";
      more.style.fontSize = "11px";
      more.style.marginTop = "4px";
      more.textContent = "+" + (overdueItems.length - 8) + " more overdue.";
      panel.appendChild(more);
    }

    return panel;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();
    var projects = data.projects;

    var h1 = document.createElement("h2");
    h1.textContent = "RFI / Technical Query Management";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    var overduePanel = renderOverduePanel(data.rfis, projects);
    if (overduePanel) outlet.appendChild(overduePanel);

    if (uiState.editingId) {
      var rfiBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newRfi(uiState.pendingPrefill || {})
          : data.rfis.find(function (r) {
              return r.id === uiState.editingId;
            });
      if (uiState.editingId === "new") uiState.pendingPrefill = null;
      renderForm(outlet, rfiBeingEdited, projects, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search number, subject, question\u2026";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      renderList();
    };

    var typeSelect = document.createElement("select");
    var allTypesOpt = document.createElement("option");
    allTypesOpt.value = "";
    allTypesOpt.textContent = "All types";
    typeSelect.appendChild(allTypesOpt);
    window.PCC.store.RFI_TYPES.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      opt.textContent = TYPE_LABELS[t];
      typeSelect.appendChild(opt);
    });
    typeSelect.value = uiState.typeFilter;
    typeSelect.onchange = function () {
      uiState.typeFilter = typeSelect.value;
      renderList();
    };

    var statusSelect = document.createElement("select");
    var allStatusOpt = document.createElement("option");
    allStatusOpt.value = "";
    allStatusOpt.textContent = "All statuses";
    statusSelect.appendChild(allStatusOpt);
    window.PCC.store.RFI_STATUSES.forEach(function (s) {
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
      renderList();
    };

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add RFI / TQ";
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
      var filtered = data.rfis.filter(rfiMatchesFilters);

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.rfis.length === 0
            ? projects.filter(function (p) { return !p.archived; }).length === 0
              ? "Add a project in Portfolio first, then log RFIs and Technical Queries against it."
              : "No entries yet. Click \u201c+ Add RFI / TQ\u201d to log your first one."
            : "No entries match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (r) {
        list.appendChild(renderRfiEntry(r, projects, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.rfis = render;
  window.PCC.rfis = {
    filterByProject: function (projectId) {
      uiState.projectFilter = projectId;
      uiState.statusFilter = "";
      uiState.search = "";
    },
    createFromMeeting: function (projectId, meetingId) {
      uiState.pendingPrefill = { project_id: projectId, source_meeting_id: meetingId };
      uiState.editingId = "new";
    },
    expandRfi: function (rfiId) {
      uiState.expandedId = rfiId;
    },
  };
})();
