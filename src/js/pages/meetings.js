(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var uiState = {
    search: "",
    projectFilter: "",
    editingId: null,
    expandedId: null,
  };

  function projectName(projects, projectId) {
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "(project removed)";
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Gate 10: see risks.js's identical helper for the full rationale. */
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

  // Gate 33 (PCC Evolution Roadmap, Tier B: Meeting Action → Control Linking). Same
  // "clear + rebuild options, set value" pattern as activityOptionsFor() above, one per
  // linkable type an individual action item can now carry.
  function vendorOptionsFor(select, data, selectedVendorId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "No vendor";
    select.appendChild(noneOpt);
    data.vendors.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.vendor_name || "(unnamed vendor)";
      select.appendChild(opt);
    });
    select.value = selectedVendorId || "";
  }

  function rfiOptionsFor(select, data, projectId, selectedRfiId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "No RFI";
    select.appendChild(noneOpt);
    data.rfis
      .filter(function (r) { return r.project_id === projectId; })
      .forEach(function (r) {
        var opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = (r.number || "") + (r.subject ? " — " + r.subject : "");
        select.appendChild(opt);
      });
    select.value = selectedRfiId || "";
  }

  function riskOptionsFor(select, data, projectId, selectedRiskId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "No risk";
    select.appendChild(noneOpt);
    data.risks
      .filter(function (r) { return r.project_id === projectId; })
      .forEach(function (r) {
        var opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = r.title || "(untitled)";
        select.appendChild(opt);
      });
    select.value = selectedRiskId || "";
  }

  function isOverdue(action) {
    return action.status === "open" && action.due_date && action.due_date < todayStr();
  }

  function overdueCount(meeting) {
    return meeting.actions.filter(isOverdue).length;
  }

  function allOpenActions(meetings, projects) {
    var out = [];
    meetings.forEach(function (m) {
      m.actions.forEach(function (a) {
        if (a.status === "open") {
          out.push({ action: a, meeting: m });
        }
      });
    });
    out.sort(function (x, y) {
      return (x.action.due_date || "9999").localeCompare(y.action.due_date || "9999");
    });
    return out;
  }

  // ===== Action-item sub-editor (dynamic rows within the meeting form) =====

  function buildActionRow(action, data, projectId) {
    var row = document.createElement("div");
    row.className = "action-editor-row";
    row.dataset.actionId = action.id;
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.marginBottom = "8px";
    row.style.flexWrap = "wrap";
    row.style.alignItems = "center";

    var desc = document.createElement("input");
    desc.type = "text";
    desc.className = "action-desc";
    desc.placeholder = "Action description";
    desc.value = action.description || "";
    desc.style.flex = "2 1 200px";

    var owner = document.createElement("input");
    owner.type = "text";
    owner.className = "action-owner";
    owner.placeholder = "Owner";
    owner.value = action.owner || "";
    owner.style.flex = "1 1 120px";

    var due = document.createElement("input");
    due.type = "date";
    due.className = "action-due";
    due.value = action.due_date || "";
    due.style.flex = "1 1 140px";

    var status = document.createElement("select");
    status.className = "action-status";
    status.style.flex = "0 1 100px";
    ["open", "done"].forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s === "open" ? "Open" : "Done";
      status.appendChild(opt);
    });
    status.value = action.status || "open";

    // Gate 33 (PCC Evolution Roadmap, Tier B: Meeting Action → Control Linking). Four
    // optional links, independent of the parent meeting's own single activity_id — an
    // action item can relate to a different vendor/activity/RFI/risk than the meeting
    // as a whole. `title` gives a native tooltip since the row has no room for full
    // field labels; each select's own placeholder option names the field instead.
    var vendorSelect = document.createElement("select");
    vendorSelect.className = "action-vendor";
    vendorSelect.title = "Linked Vendor";
    vendorSelect.style.flex = "1 1 140px";
    vendorOptionsFor(vendorSelect, data, action.vendor_id);

    var activitySelect = document.createElement("select");
    activitySelect.className = "action-activity";
    activitySelect.title = "Linked Activity";
    activitySelect.style.flex = "1 1 160px";
    activityOptionsFor(activitySelect, data, projectId, action.activity_id);

    var rfiSelect = document.createElement("select");
    rfiSelect.className = "action-rfi";
    rfiSelect.title = "Linked RFI";
    rfiSelect.style.flex = "1 1 160px";
    rfiOptionsFor(rfiSelect, data, projectId, action.rfi_id);

    var riskSelect = document.createElement("select");
    riskSelect.className = "action-risk";
    riskSelect.title = "Linked Risk";
    riskSelect.style.flex = "1 1 160px";
    riskOptionsFor(riskSelect, data, projectId, action.risk_id);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--ghost";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = function () {
      row.remove();
    };

    row.appendChild(desc);
    row.appendChild(owner);
    row.appendChild(due);
    row.appendChild(status);
    row.appendChild(vendorSelect);
    row.appendChild(activitySelect);
    row.appendChild(rfiSelect);
    row.appendChild(riskSelect);
    row.appendChild(removeBtn);
    return row;
  }

  // `projSelect` is the meeting's own Project <select> element, not a resolved project
  // id string — read live via `projSelect.value` everywhere below (including inside the
  // "+ Add Action" handler), so a brand-new row always scopes its Activity/RFI/Risk
  // options to whichever project is currently selected, not whatever it was when this
  // editor first rendered.
  function renderActionsEditor(container, initialActions, data, projSelect) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    wrap.style.gridColumn = "1 / -1";
    wrap.innerHTML = "<label>Action Items</label>";

    var rowsContainer = document.createElement("div");
    rowsContainer.id = "action-rows-container";
    initialActions.forEach(function (a) {
      rowsContainer.appendChild(buildActionRow(a, data, projSelect.value));
    });
    wrap.appendChild(rowsContainer);

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn--ghost";
    addBtn.textContent = "+ Add Action";
    addBtn.onclick = function () {
      rowsContainer.appendChild(buildActionRow(window.PCC.store.newMeetingAction(), window.PCC.store.get(), projSelect.value));
    };
    wrap.appendChild(addBtn);

    container.appendChild(wrap);
    return rowsContainer;
  }

  function readActionsFromForm(formEl) {
    var rows = formEl.querySelectorAll(".action-editor-row");
    var actions = [];
    rows.forEach(function (row) {
      var description = row.querySelector(".action-desc").value.trim();
      var owner = row.querySelector(".action-owner").value.trim();
      var due_date = row.querySelector(".action-due").value;
      var status = row.querySelector(".action-status").value;
      var vendor_id = row.querySelector(".action-vendor").value;
      var activity_id = row.querySelector(".action-activity").value;
      var rfi_id = row.querySelector(".action-rfi").value;
      var risk_id = row.querySelector(".action-risk").value;
      // Skip fully-empty rows (e.g. an "+ Add Action" row nobody filled in) rather than
      // saving blank action items.
      if (!description && !owner && !due_date) return;
      actions.push({
        id: row.dataset.actionId,
        description: description,
        owner: owner,
        due_date: due_date,
        status: status,
        vendor_id: vendor_id,
        activity_id: activity_id,
        rfi_id: rfi_id,
        risk_id: risk_id,
      });
    });
    return actions;
  }

  // ===== Recording sub-editor (reference-only — metadata only, no file upload) =====

  function buildRecordingRow(recording) {
    var row = document.createElement("div");
    row.className = "recording-editor-row";
    row.dataset.recordingId = recording.id;
    row.dataset.uploadedAt = recording.uploaded_at;
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.marginBottom = "8px";
    row.style.flexWrap = "wrap";
    row.style.alignItems = "center";

    var filename = document.createElement("input");
    filename.type = "text";
    filename.className = "recording-filename";
    filename.placeholder = "Filename, e.g. kickoff-call.mp3";
    filename.value = recording.filename || "";
    filename.style.flex = "2 1 200px";

    var duration = document.createElement("input");
    duration.type = "text";
    duration.className = "recording-duration";
    duration.placeholder = "Duration, e.g. 42:15";
    duration.value = recording.duration || "";
    duration.style.flex = "1 1 100px";

    var uploadedBy = document.createElement("input");
    uploadedBy.type = "text";
    uploadedBy.className = "recording-uploaded-by";
    uploadedBy.placeholder = "Uploaded by";
    uploadedBy.value = recording.uploaded_by || "";
    uploadedBy.style.flex = "1 1 140px";

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--ghost";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = function () {
      row.remove();
    };

    row.appendChild(filename);
    row.appendChild(duration);
    row.appendChild(uploadedBy);
    row.appendChild(removeBtn);
    return row;
  }

  function renderRecordingsEditor(container, initialRecordings) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    wrap.style.gridColumn = "1 / -1";
    wrap.innerHTML = "<label>Recordings</label>";

    var note = document.createElement("p");
    note.className = "text-secondary";
    note.style.fontSize = "12px";
    note.style.margin = "0 0 8px";
    note.textContent =
      "Reference only \u2014 tracks the filename and details, but the actual audio/video file has to be " +
      "placed in /files yourself. Recordings are too large to safely store inside the app's own data.";
    wrap.appendChild(note);

    var rowsContainer = document.createElement("div");
    rowsContainer.id = "recording-rows-container";
    initialRecordings.forEach(function (r) {
      rowsContainer.appendChild(buildRecordingRow(r));
    });
    wrap.appendChild(rowsContainer);

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn--ghost";
    addBtn.textContent = "+ Add Recording";
    addBtn.onclick = function () {
      rowsContainer.appendChild(buildRecordingRow(window.PCC.store.newMeetingRecording()));
    };
    wrap.appendChild(addBtn);

    container.appendChild(wrap);
  }

  function readRecordingsFromForm(formEl) {
    var rows = formEl.querySelectorAll(".recording-editor-row");
    var recordings = [];
    rows.forEach(function (row) {
      var filename = row.querySelector(".recording-filename").value.trim();
      var duration = row.querySelector(".recording-duration").value.trim();
      var uploaded_by = row.querySelector(".recording-uploaded-by").value.trim();
      if (!filename && !duration && !uploaded_by) return;
      recordings.push({
        id: row.dataset.recordingId,
        filename: filename,
        duration: duration,
        uploaded_by: uploaded_by,
        uploaded_at: row.dataset.uploadedAt || new Date().toISOString(),
      });
    });
    return recordings;
  }

  // ===== Main meeting form =====

  function renderForm(container, meeting, projects, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Meeting" : "Edit Meeting";
    panel.appendChild(heading);

    var form = document.createElement("form");

    var grid = document.createElement("div");
    grid.className = "form-grid";

    // Project (required)
    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project *</label>";
    var projSelect = document.createElement("select");
    projSelect.id = "meetingfield-project_id";
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
      projSelect.value = meeting.project_id || activeProjects[0].id;
    }
    projField.appendChild(projSelect);
    grid.appendChild(projField);

    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Linked Activity (optional)</label>";
    var activitySelect = document.createElement("select");
    activitySelect.id = "meetingfield-activity_id";
    activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, meeting.activity_id);
    activityField.appendChild(activitySelect);
    grid.appendChild(activityField);
    projSelect.onchange = function () {
      activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, "");
      var freshData = window.PCC.store.get();
      Array.from(actionRowsContainer.querySelectorAll(".action-editor-row")).forEach(function (row) {
        activityOptionsFor(row.querySelector(".action-activity"), freshData, projSelect.value, "");
        rfiOptionsFor(row.querySelector(".action-rfi"), freshData, projSelect.value, "");
        riskOptionsFor(row.querySelector(".action-risk"), freshData, projSelect.value, "");
      });
    };

    var titleField = document.createElement("div");
    titleField.className = "field";
    titleField.innerHTML = "<label>Title *</label>";
    var titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.id = "meetingfield-title";
    titleInput.value = meeting.title || "";
    titleField.appendChild(titleInput);
    grid.appendChild(titleField);

    var dateField = document.createElement("div");
    dateField.className = "field";
    dateField.innerHTML = "<label>Date *</label>";
    var dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.id = "meetingfield-meeting_date";
    dateInput.value = meeting.meeting_date || todayStr();
    dateField.appendChild(dateInput);
    grid.appendChild(dateField);

    var attendeesField = document.createElement("div");
    attendeesField.className = "field";
    attendeesField.innerHTML = "<label>Attendees</label>";
    var attendeesInput = document.createElement("input");
    attendeesInput.type = "text";
    attendeesInput.id = "meetingfield-attendees";
    attendeesInput.placeholder = "Comma-separated names";
    attendeesInput.value = meeting.attendees || "";
    attendeesField.appendChild(attendeesInput);
    grid.appendChild(attendeesField);

    var agendaField = document.createElement("div");
    agendaField.className = "field";
    agendaField.style.gridColumn = "1 / -1";
    agendaField.innerHTML = "<label>Agenda</label>";
    var agendaInput = document.createElement("textarea");
    agendaInput.id = "meetingfield-agenda";
    agendaInput.rows = 2;
    agendaInput.value = meeting.agenda || "";
    agendaField.appendChild(agendaInput);
    grid.appendChild(agendaField);

    var minutesField = document.createElement("div");
    minutesField.className = "field";
    minutesField.style.gridColumn = "1 / -1";
    minutesField.innerHTML = "<label>Minutes</label>";
    var minutesInput = document.createElement("textarea");
    minutesInput.id = "meetingfield-minutes";
    minutesInput.rows = 4;
    minutesInput.value = meeting.minutes || "";
    minutesField.appendChild(minutesInput);
    grid.appendChild(minutesField);

    form.appendChild(grid);

    var actionRowsContainer = renderActionsEditor(form, meeting.actions || [], window.PCC.store.get(), projSelect);
    renderRecordingsEditor(form, meeting.recordings || []);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Project, Title, and Date are required.";
    form.appendChild(errorMsg);

    var actionsRow2 = document.createElement("div");
    actionsRow2.style.display = "flex";
    actionsRow2.style.gap = "10px";
    actionsRow2.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Meeting" : "Save Changes";
    saveBtn.disabled = activeProjects.length === 0;

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingId = null;
      onSaved();
    };

    actionsRow2.appendChild(saveBtn);
    actionsRow2.appendChild(cancelBtn);
    form.appendChild(actionsRow2);

    form.onsubmit = function (e) {
      e.preventDefault();
      var values = {
        project_id: projSelect.value,
        activity_id: activitySelect.value,
        title: titleInput.value,
        meeting_date: dateInput.value,
        attendees: attendeesInput.value,
        agenda: agendaInput.value,
        minutes: minutesInput.value,
      };
      if (!values.project_id || !values.title.trim() || !values.meeting_date) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";
      values.actions = readActionsFromForm(form);
      values.recordings = readRecordingsFromForm(form);

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.meetings.push(window.PCC.store.newMeeting(values));
        } else {
          var existing = data.meetings.find(function (m) {
            return m.id === meeting.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Meeting added." : "Meeting updated.", "success");
      uiState.editingId = null;
      onSaved();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  // ===== List / card views =====

  function meetingMatchesFilters(m, projects) {
    if (uiState.projectFilter && m.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var pName = projectName(projects, m.project_id);
      var haystack = [m.title, m.attendees, m.agenda, m.minutes, pName].join(" ").toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderMeetingCard(m, projects, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card";

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'>" +
      (m.title || "(untitled)") +
      "</div><div class='project-card__meta'>" +
      m.meeting_date + " \u00b7 " + projectName(projects, m.project_id) +
      "</div>";

    var overdue = overdueCount(m);
    var badge = document.createElement("span");
    if (overdue > 0) {
      badge.className = "status-badge status-badge--critical";
      badge.textContent = overdue + " Overdue";
    } else if (m.actions.length > 0) {
      badge.className = "status-badge status-badge--on_track";
      badge.textContent = m.actions.length + " Action" + (m.actions.length === 1 ? "" : "s");
    } else {
      badge.className = "status-badge status-badge--complete";
      badge.textContent = "No actions";
    }

    var actionsRow = document.createElement("div");
    actionsRow.className = "project-card__actions";

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === m.id ? "Hide" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === m.id ? null : m.id;
      onChanged();
    };

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingId = m.id;
      onChanged();
    };

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      if (!window.confirm("Delete this meeting? This can't be undone.")) return;
      window.PCC.store.update(function (data) {
        data.meetings = data.meetings.filter(function (item) {
          return item.id !== m.id;
        });
      });
      window.PCC.notify("Meeting deleted.", "info");
      onChanged();
    };

    actionsRow.appendChild(detailsBtn);
    actionsRow.appendChild(editBtn);
    actionsRow.appendChild(deleteBtn);

    card.appendChild(main);
    card.appendChild(badge);
    card.appendChild(actionsRow);
    return card;
  }

  function renderMeetingDetails(m, projects) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";

    var grid = document.createElement("div");
    grid.className = "detail-grid";
    [
      { label: "ATTENDEES", value: m.attendees || "\u2014" },
      { label: "AGENDA", value: m.agenda || "\u2014", wide: true },
      { label: "MINUTES", value: m.minutes || "\u2014", wide: true },
    ].forEach(function (f) {
      var item = document.createElement("div");
      if (f.wide) item.style.gridColumn = "1 / -1";
      item.innerHTML = "<span class='detail-item__label'>" + f.label + "</span><span class='detail-item__value'>" + f.value + "</span>";
      grid.appendChild(item);
    });
    wrap.appendChild(grid);

    if (m.activity_id) {
      var linkedActivity = window.PCC.store.get().activities.find(function (a) {
        return a.id === m.activity_id;
      });
      if (linkedActivity) {
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
          if (window.PCC.schedule) window.PCC.schedule.viewActivity(m.project_id, linkedActivity.schedule_id, linkedActivity.id);
          window.PCC.router.go("schedule");
        };

        activityRow.appendChild(activityLabel);
        activityRow.appendChild(viewActivityBtn);
        wrap.appendChild(activityRow);
      }
    }

    if (m.actions.length > 0) {
      var actionsHeading = document.createElement("p");
      actionsHeading.className = "detail-item__label";
      actionsHeading.style.marginTop = "14px";
      actionsHeading.style.marginBottom = "6px";
      actionsHeading.textContent = "ACTION ITEMS";
      wrap.appendChild(actionsHeading);

      var list = document.createElement("div");
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "6px";

      var linkData = window.PCC.store.get();
      m.actions.forEach(function (a) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var overdue = isOverdue(a);
        var label = document.createElement("span");
        // Gate 33 (PCC Evolution Roadmap, Tier B: Meeting Action \u2192 Control Linking) \u2014
        // append whichever of the four optional links are set, same "only show what's
        // actually there" convention every other reciprocal display in this app follows.
        var linkParts = [];
        if (a.vendor_id) {
          var v = linkData.vendors.find(function (x) { return x.id === a.vendor_id; });
          if (v) linkParts.push("Vendor: " + (v.vendor_name || "(unnamed vendor)"));
        }
        if (a.activity_id) {
          var linkedAct = linkData.activities.find(function (x) { return x.id === a.activity_id; });
          if (linkedAct) linkParts.push("Activity: " + (linkedAct.name || "(unnamed activity)"));
        }
        if (a.rfi_id) {
          var linkedRfi = linkData.rfis.find(function (x) { return x.id === a.rfi_id; });
          if (linkedRfi) linkParts.push((linkedRfi.type === "technical_query" ? "TQ: " : "RFI: ") + (linkedRfi.number || ""));
        }
        if (a.risk_id) {
          var linkedRisk = linkData.risks.find(function (x) { return x.id === a.risk_id; });
          if (linkedRisk) linkParts.push("Risk: " + (linkedRisk.title || "(untitled)"));
        }
        label.textContent =
          (a.description || "(no description)") + (a.owner ? " \u2014 " + a.owner : "") + (a.due_date ? " \u00b7 " + a.due_date : "") +
          (linkParts.length ? " \u00b7 " + linkParts.join(", ") : "");
        if (overdue) label.style.color = "var(--status-critical)";

        var statusBadge = document.createElement("span");
        statusBadge.className = "status-badge status-badge--" + (a.status === "done" ? "complete" : overdue ? "critical" : "on_track");
        statusBadge.textContent = a.status === "done" ? "Done" : overdue ? "Overdue" : "Open";

        row.appendChild(label);
        row.appendChild(statusBadge);
        list.appendChild(row);
      });

      wrap.appendChild(list);
    }

    if (m.recordings && m.recordings.length > 0) {
      var recHeading = document.createElement("p");
      recHeading.className = "detail-item__label";
      recHeading.style.marginTop = "14px";
      recHeading.style.marginBottom = "6px";
      recHeading.textContent = "RECORDINGS";
      wrap.appendChild(recHeading);

      var recList = document.createElement("div");
      recList.style.display = "flex";
      recList.style.flexDirection = "column";
      recList.style.gap = "4px";

      m.recordings.forEach(function (r) {
        var row = document.createElement("p");
        row.style.fontSize = "13px";
        row.style.margin = "0";
        row.className = "mono";
        row.textContent =
          (r.filename || "(unnamed)") +
          (r.duration ? " \u00b7 " + r.duration : "") +
          (r.uploaded_by ? " \u00b7 uploaded by " + r.uploaded_by : "");
        recList.appendChild(row);
      });
      wrap.appendChild(recList);

      var recNote = document.createElement("p");
      recNote.className = "text-secondary";
      recNote.style.fontSize = "11px";
      recNote.style.marginTop = "4px";
      recNote.textContent = "Reference only \u2014 actual files live in /files.";
      wrap.appendChild(recNote);
    }

    var linkedRisks = window.PCC.store.get().risks.filter(function (r) {
      return r.source_meeting_id === m.id;
    });
    var linkedDocs = window.PCC.store.get().documents.filter(function (d) {
      return d.meeting_id === m.id;
    });

    if (linkedRisks.length > 0) {
      var risksHeading = document.createElement("p");
      risksHeading.className = "detail-item__label";
      risksHeading.style.marginTop = "14px";
      risksHeading.style.marginBottom = "6px";
      risksHeading.textContent = "RISKS / ISSUES RAISED (" + linkedRisks.length + ")";
      wrap.appendChild(risksHeading);

      linkedRisks.forEach(function (r) {
        var row = document.createElement("p");
        row.style.fontSize = "13px";
        row.style.margin = "0 0 2px";
        row.textContent = r.title || "(untitled)";
        wrap.appendChild(row);
      });
    }

    var linkedRfis = window.PCC.store.get().rfis.filter(function (r) {
      return r.source_meeting_id === m.id;
    });

    if (linkedRfis.length > 0) {
      var rfisHeading = document.createElement("p");
      rfisHeading.className = "detail-item__label";
      rfisHeading.style.marginTop = "14px";
      rfisHeading.style.marginBottom = "6px";
      rfisHeading.textContent = "RFI / TQ RAISED (" + linkedRfis.length + ")";
      wrap.appendChild(rfisHeading);

      linkedRfis.forEach(function (r) {
        var row = document.createElement("p");
        row.style.fontSize = "13px";
        row.style.margin = "0 0 2px";
        row.innerHTML = "<span class='mono'>" + r.number + "</span> \u2014 " + (r.subject || "(untitled)");
        wrap.appendChild(row);
      });
    }

    var linkedChangeOrders = window.PCC.store.get().change_orders.filter(function (co) {
      return co.source_meeting_id === m.id;
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

    if (linkedDocs.length > 0) {
      var docsHeading = document.createElement("p");
      docsHeading.className = "detail-item__label";
      docsHeading.style.marginTop = "14px";
      docsHeading.style.marginBottom = "6px";
      docsHeading.textContent = "ATTACHED DOCUMENTS (" + linkedDocs.length + ")";
      wrap.appendChild(docsHeading);

      linkedDocs.forEach(function (d) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.marginBottom = "2px";

        var label = document.createElement("span");
        label.textContent = d.filename;
        row.appendChild(label);

        // Always shown, not gated on d.file_data \u2014 see documents.js for why.
        var openDocBtn = document.createElement("button");
        openDocBtn.className = "btn btn--ghost";
        openDocBtn.textContent = "Open File";
        openDocBtn.onclick = function () {
          window.PCC.files.open(d);
        };
        row.appendChild(openDocBtn);

        wrap.appendChild(row);
      });
    }

    // Quick actions: create a linked Risk/Issue/Opportunity or attach a Document,
    // pre-linked to this meeting and project.
    var quickActions = document.createElement("div");
    quickActions.style.display = "flex";
    quickActions.style.gap = "8px";
    quickActions.style.marginTop = "14px";
    quickActions.style.paddingTop = "10px";
    quickActions.style.borderTop = "1px solid var(--divider)";

    var addRiskBtn = document.createElement("button");
    addRiskBtn.className = "btn btn--ghost";
    addRiskBtn.textContent = "+ Add Risk / Issue / Opportunity";
    addRiskBtn.onclick = function () {
      if (window.PCC.risks) window.PCC.risks.createFromMeeting(m.project_id, m.id);
      window.PCC.router.go("risks");
    };

    var attachDocBtn = document.createElement("button");
    attachDocBtn.className = "btn btn--ghost";
    attachDocBtn.textContent = "+ Attach Document";
    attachDocBtn.onclick = function () {
      if (window.PCC.files) window.PCC.files.createFromMeeting(m.project_id, m.id);
      window.PCC.router.go("documents");
    };

    var addRfiBtn = document.createElement("button");
    addRfiBtn.className = "btn btn--ghost";
    addRfiBtn.textContent = "+ Add RFI / Technical Query";
    addRfiBtn.onclick = function () {
      if (window.PCC.rfis) window.PCC.rfis.createFromMeeting(m.project_id, m.id);
      window.PCC.router.go("rfis");
    };

    var addChangeOrderBtn = document.createElement("button");
    addChangeOrderBtn.className = "btn btn--ghost";
    addChangeOrderBtn.textContent = "+ Add Change Order";
    addChangeOrderBtn.onclick = function () {
      if (window.PCC.changeOrders) window.PCC.changeOrders.createFromMeeting(m.project_id, m.id);
      window.PCC.router.go("changeOrders");
    };

    quickActions.appendChild(addRiskBtn);
    quickActions.appendChild(attachDocBtn);
    quickActions.appendChild(addRfiBtn);
    quickActions.appendChild(addChangeOrderBtn);
    wrap.appendChild(quickActions);

    return wrap;
  }

  function renderMeetingEntry(m, projects, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderMeetingCard(m, projects, onChanged));
    if (uiState.expandedId === m.id) entry.appendChild(renderMeetingDetails(m, projects));
    return entry;
  }

  function renderOverduePanel(meetings, projects) {
    var overdueItems = allOpenActions(meetings, projects).filter(function (entry) {
      return isOverdue(entry.action);
    });
    if (overdueItems.length === 0) return null;

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";
    panel.style.borderColor = "var(--status-critical)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "8px";
    heading.style.color = "var(--status-critical)";
    heading.textContent = "Overdue Action Items (" + overdueItems.length + ")";
    panel.appendChild(heading);

    var list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    overdueItems.slice(0, 8).forEach(function (entry) {
      var row = document.createElement("div");
      row.style.fontSize = "13px";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.innerHTML =
        "<span>" +
        (entry.action.description || "(no description)") +
        (entry.action.owner ? " \u2014 " + entry.action.owner : "") +
        " <span class='text-secondary'>(" + projectName(projects, entry.meeting.project_id) + ")</span></span>" +
        "<span class='mono' style='color:var(--status-critical)'>" + entry.action.due_date + "</span>";
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
    h1.textContent = "Meetings";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    var overduePanel = renderOverduePanel(data.meetings, projects);
    if (overduePanel) outlet.appendChild(overduePanel);

    if (uiState.editingId) {
      var meetingBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newMeeting()
          : data.meetings.find(function (m) {
              return m.id === uiState.editingId;
            });
      renderForm(outlet, meetingBeingEdited, projects, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search title, attendees, agenda, minutes\u2026";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
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
    addBtn.textContent = "+ Add Meeting";
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
    toolbar.appendChild(projSelectFilter);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.meetings.filter(function (m) {
        return meetingMatchesFilters(m, projects);
      });
      filtered.sort(function (a, b) {
        return b.meeting_date.localeCompare(a.meeting_date);
      });

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.meetings.length === 0
            ? hasActiveProjects
              ? "No meetings logged yet. Click \u201c+ Add Meeting\u201d to start."
              : "Add a project in Portfolio first, then log meetings against it."
            : "No meetings match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (m) {
        list.appendChild(renderMeetingEntry(m, projects, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.meetings = render;
  window.PCC.meetings = {
    filterByProject: function (projectId) {
      uiState.projectFilter = projectId;
      uiState.search = "";
    },
    expandMeeting: function (meetingId) {
      uiState.projectFilter = "";
      uiState.search = "";
      uiState.expandedId = meetingId;
    },
  };
})();
