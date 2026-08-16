/* Schedule module — Gate 1 only.
 * Storage and hand-editing of Schedules, WBS, Activities, and Relationships. No file
 * import (Gate 2) and no CPM calculation (Gate 3) live here \u2014 early/late start/finish
 * and float always render as "Not yet calculated" in this gate, never as inputs.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var SCHEDULE_STATUS_LABELS = { draft: "Draft", active: "Active", superseded: "Superseded", archived: "Archived" };
  var ACTIVITY_TYPE_LABELS = { task: "Task", milestone: "Milestone", summary: "Summary", wbs_summary: "WBS Summary" };
  var ACTIVITY_STATUS_LABELS = { not_started: "Not Started", in_progress: "In Progress", complete: "Complete", on_hold: "On Hold" };
  var RELATIONSHIP_TYPE_LABELS = { FS: "Finish-to-Start", SS: "Start-to-Start", FF: "Finish-to-Finish", SF: "Start-to-Finish" };
  var PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" };

  var uiState = {
    projectId: "", // currently selected project \u2014 everything below scopes to this
    scheduleId: "", // currently selected schedule within that project
    tab: "activities", // 'activities' | 'wbs' | 'relationships' | 'baselines'
    editingScheduleId: null, // schedule id, or 'new', or null
    editingWbsId: null,
    editingActivityId: null,
    editingRelationshipId: null,
    activityFilter: "",
    // Gate 4: baseline capture/compare. Baseline list is scoped to the selected
    // *project* (not the selected schedule) since comparing a baseline against a
    // later re-imported revision is the point \u2014 see scheduleBaselineEngine.js header.
    baselineSaving: false,
    baselineCompareId: null, // baseline id currently expanded for comparison, or null
    baselineComparePending: false,
    baselineCompareResult: null,
    baselineCompareError: null,
    // Gate 2 import flow
    importPanelOpen: false,
    importStep: "pick", // 'pick' | 'reviewing' | 'importing'
    importFile: null, // { name, size, buffer, hash, hashMethod }
    importParsed: null, // result of scheduleImportService.parseRows()
    importDuplicateMatches: [], // schedules in this project that appear to be the same source file
    importDuplicateAcknowledged: false,
    importScheduleName: "",
    importError: null,
    // Gate 8: interactive Gantt editing.
    ganttFilter: {
      search: "",
      wbsId: "",
      discipline: "",
      contractor: "",
      responsiblePerson: "",
      quick: "", // '' | 'critical' | 'near_critical' | 'delayed' | 'completed' | 'in_progress' | 'not_started' | 'milestones'
    },
    ganttZoom: "auto", // 'auto' | 'day' | 'week' | 'month' | 'quarter' | 'year'
    ganttDetailActivityId: null,
    ganttShowBaseline: false,
    ganttBaselineId: "",
    ganttBaselineSnapshot: null, // { baselineId, activities } once loaded
    ganttBaselineLoading: false,
    relationshipPrefillId: null, // predecessor id to prefill when "+ Add Relationship" is used from the Gantt detail panel
  };

  function projectName(projects, projectId) {
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "Unassigned";
  }

  function wbsName(wbsItems, wbsId) {
    if (!wbsId) return "\u2014";
    var w = wbsItems.find(function (x) {
      return x.id === wbsId;
    });
    return w ? (w.code ? w.code + " \u2014 " + w.name : w.name) : "\u2014";
  }

  function activityName(activities, activityId) {
    var a = activities.find(function (x) {
      return x.id === activityId;
    });
    return a ? a.name || "(unnamed activity)" : "(deleted activity)";
  }

  /** Shared by the Activities tab list and the Gantt tab's detail panel (Gate 8) so
   * both delete the same way — confirm, then remove the activity and any relationship
   * referencing it, matching the pattern every other register's delete already uses. */
  function deleteActivityWithConfirm(activity, rerender) {
    if (!confirm('Delete activity "' + activity.name + '"? This also removes any relationships referencing it.')) return;
    window.PCC.store.update(function (data2) {
      data2.activities = data2.activities.filter(function (item) {
        return item.id !== activity.id;
      });
      data2.relationships = data2.relationships.filter(function (rel) {
        return rel.predecessor_id !== activity.id && rel.successor_id !== activity.id;
      });
    });
    window.PCC.notify("Activity deleted.", "success");
    if (uiState.ganttDetailActivityId === activity.id) uiState.ganttDetailActivityId = null;
    rerender();
  }

  // ---------------------------------------------------------------------------------
  // Schedule picker \u2014 project selector, schedule selector within it, "+ New Schedule"
  // ---------------------------------------------------------------------------------

  function renderScheduleForm(container, schedule, projects, rerender) {
    var isNew = uiState.editingScheduleId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "New Schedule" : "Edit Schedule";
    panel.appendChild(heading);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    function textField(label, key, value, type) {
      var field = document.createElement("div");
      field.className = "field";
      var lab = document.createElement("label");
      lab.textContent = label;
      field.appendChild(lab);
      var input = document.createElement("input");
      input.type = type || "text";
      input.id = "schedfield-" + key;
      input.value = value || "";
      field.appendChild(input);
      return field;
    }

    grid.appendChild(textField("Schedule Name *", "name", schedule.name));
    grid.appendChild(textField("Revision Number", "revision_number", schedule.revision_number, "number"));
    grid.appendChild(textField("Version", "version", schedule.version));
    grid.appendChild(textField("Data Date", "data_date", schedule.data_date, "date"));
    grid.appendChild(textField("Near-Critical Threshold (days)", "near_critical_threshold_days", schedule.near_critical_threshold_days, "number"));

    var statusField = document.createElement("div");
    statusField.className = "field";
    statusField.innerHTML = "<label>Status</label>";
    var statusSelect = document.createElement("select");
    statusSelect.id = "schedfield-status";
    window.PCC.store.SCHEDULE_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = SCHEDULE_STATUS_LABELS[s];
      statusSelect.appendChild(opt);
    });
    statusSelect.value = schedule.status;
    statusField.appendChild(statusSelect);
    grid.appendChild(statusField);

    var baselineField = document.createElement("div");
    baselineField.className = "field";
    var baselineLabel = document.createElement("label");
    baselineLabel.style.display = "flex";
    baselineLabel.style.alignItems = "center";
    baselineLabel.style.gap = "8px";
    var baselineCheckbox = document.createElement("input");
    baselineCheckbox.type = "checkbox";
    baselineCheckbox.id = "schedfield-is_baseline";
    baselineCheckbox.checked = !!schedule.is_baseline;
    baselineLabel.appendChild(baselineCheckbox);
    baselineLabel.appendChild(document.createTextNode("Mark as baseline"));
    baselineField.appendChild(baselineLabel);
    grid.appendChild(baselineField);

    var descField = document.createElement("div");
    descField.className = "field";
    descField.style.gridColumn = "1 / -1";
    descField.innerHTML = "<label>Description</label>";
    var descArea = document.createElement("textarea");
    descArea.id = "schedfield-description";
    descArea.rows = 2;
    descArea.value = schedule.description || "";
    descField.appendChild(descArea);
    grid.appendChild(descField);

    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Schedule name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Create Schedule" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingScheduleId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var name = form.querySelector("#schedfield-name").value.trim();
      if (!name) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = {
        name: name,
        revision_number: Number(form.querySelector("#schedfield-revision_number").value) || 0,
        version: form.querySelector("#schedfield-version").value,
        data_date: form.querySelector("#schedfield-data_date").value,
        near_critical_threshold_days: Number(form.querySelector("#schedfield-near_critical_threshold_days").value) || 0,
        status: form.querySelector("#schedfield-status").value,
        is_baseline: form.querySelector("#schedfield-is_baseline").checked,
        description: form.querySelector("#schedfield-description").value,
      };

      window.PCC.store.update(function (data) {
        if (isNew) {
          var newSched = window.PCC.store.newSchedule(
            Object.assign({ project_id: uiState.projectId }, values)
          );
          data.schedules.push(newSched);
          uiState.scheduleId = newSched.id;
        } else {
          var existing = data.schedules.find(function (s) {
            return s.id === schedule.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Schedule created." : "Schedule updated.", "success");
      uiState.editingScheduleId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  // ---------------------------------------------------------------------------------
  // Gate 2 \u2014 Excel import
  // ---------------------------------------------------------------------------------

  function resetImportState() {
    uiState.importPanelOpen = false;
    uiState.importStep = "pick";
    uiState.importFile = null;
    uiState.importParsed = null;
    uiState.importDuplicateMatches = [];
    uiState.importDuplicateAcknowledged = false;
    uiState.importScheduleName = "";
    uiState.importError = null;
  }

  function handleImportFileSelected(file, data, rerender) {
    uiState.importError = null;
    var ext = /\.([a-z0-9]+)$/i.exec(file.name || "");
    ext = ext ? ext[1].toLowerCase() : "";
    if (ext !== "xlsx" && ext !== "xls") {
      uiState.importError = "Unsupported file type. Use .xlsx or .xls \u2014 MS Project XML import is a separate, later gate.";
      rerender();
      return;
    }

    var reader = new FileReader();
    reader.onerror = function () {
      uiState.importError = "Could not read that file.";
      rerender();
    };
    reader.onload = function () {
      var buffer = reader.result;
      var workbook, sheet, headers, rows;
      try {
        var bytes = new Uint8Array(buffer);
        workbook = window.XLSX.read(bytes, { type: "array", cellDates: true });
        sheet = workbook.Sheets[workbook.SheetNames[0]];
        var sheetRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        headers = sheetRows.length ? sheetRows[0] : [];
        rows = sheetRows.slice(1);
      } catch (e) {
        uiState.importError = "Could not parse this as an Excel file: " + e.message;
        rerender();
        return;
      }

      var parsed = window.PCC.scheduleImportService.parseRows(headers, rows);

      window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
        uiState.importFile = { name: file.name, size: file.size, hash: fp.hash, hashMethod: fp.method };
        uiState.importParsed = parsed;
        uiState.importScheduleName = file.name.replace(/\.(xlsx|xls)$/i, "");
        uiState.importDuplicateAcknowledged = false;

        var projectSchedules = data.schedules.filter(function (s) {
          return s.project_id === uiState.projectId;
        });
        uiState.importDuplicateMatches = window.PCC.duplicateService.findFileDuplicates(
          projectSchedules,
          { hash: fp.hash, method: fp.method, filename: file.name, size: file.size, projectId: uiState.projectId },
          { fields: { hash: "content_hash", method: "hash_method", filename: "source_file_name", size: "source_file_size", projectId: "project_id" } }
        );

        uiState.importStep = "reviewing";
        rerender();
      });
    };
    reader.readAsArrayBuffer(file);
  }

  function commitImport(data, rerender) {
    var parsed = uiState.importParsed;
    var scheduleName = uiState.importScheduleName.trim() || uiState.importFile.name;

    var existingRevisions = data.schedules
      .filter(function (s) {
        return s.project_id === uiState.projectId;
      })
      .map(function (s) {
        return s.revision_number || 0;
      });
    var nextRevision = existingRevisions.length ? Math.max.apply(null, existingRevisions) + 1 : 0;

    var newSchedule = window.PCC.store.newSchedule({
      project_id: uiState.projectId,
      name: scheduleName,
      revision_number: nextRevision,
      status: "active",
      import_date: new Date().toISOString(),
      source_file_name: uiState.importFile.name,
      source_file_size: uiState.importFile.size,
      content_hash: uiState.importFile.hash,
      hash_method: uiState.importFile.hashMethod,
    });

    // WBS: create every parsed entry first so a code\u2192id map exists before wiring
    // parent_wbs_id \u2014 order of creation doesn't matter since parents are resolved by
    // code lookup afterward, not by creation sequence.
    var wbsCodeToId = {};
    var newWbsItems = parsed.wbsEntries.map(function (w) {
      var item = window.PCC.store.newWbsItem({
        project_id: uiState.projectId,
        schedule_id: newSchedule.id,
        code: w.code,
        name: w.name,
        level: w.level,
      });
      wbsCodeToId[w.code] = item.id;
      return item;
    });
    newWbsItems.forEach(function (item, i) {
      var parentCode = parsed.wbsEntries[i].parent_code;
      item.parent_wbs_id = parentCode ? wbsCodeToId[parentCode] || null : null;
    });

    var externalIdToActivityId = {};
    var newActivities = parsed.activities.map(function (a) {
      var activity = window.PCC.store.newActivity({
        project_id: uiState.projectId,
        schedule_id: newSchedule.id,
        wbs_id: a.wbs_code ? wbsCodeToId[a.wbs_code] || null : null,
        name: a.name,
        activity_type: a.activity_type,
        duration: a.duration,
        remaining_duration: a.duration,
        original_duration: a.duration,
        planned_start: a.planned_start,
        planned_finish: a.planned_finish,
        percent_complete: a.percent_complete,
        discipline: a.discipline,
        contractor: a.contractor,
        responsible_person: a.responsible_person,
        status: a.status,
        notes: a.notes,
        external_id: a.external_id,
      });
      externalIdToActivityId[a.external_id] = activity.id;
      return activity;
    });

    var newRelationships = parsed.relationships.map(function (r) {
      return window.PCC.store.newRelationship({
        schedule_id: newSchedule.id,
        predecessor_id: externalIdToActivityId[r.predecessor_external_id],
        successor_id: externalIdToActivityId[r.successor_external_id],
        type: r.type,
        lag: r.lag,
      });
    });

    window.PCC.store.update(function (d) {
      d.schedules.push(newSchedule);
      d.wbs_items = d.wbs_items.concat(newWbsItems);
      d.activities = d.activities.concat(newActivities);
      d.relationships = d.relationships.concat(newRelationships);
    });

    window.PCC.notify(
      "Imported " + newActivities.length + " activities as a new schedule (Rev " + nextRevision + ").",
      "success"
    );

    uiState.scheduleId = newSchedule.id;
    uiState.tab = "activities";
    resetImportState();
    rerender();
  }

  function renderImportPanel(container, data, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "10px";
    heading.textContent = "Import Schedule from Excel";
    panel.appendChild(heading);

    if (uiState.importStep === "pick") {
      var help = document.createElement("p");
      help.className = "text-secondary";
      help.style.fontSize = "12px";
      help.style.marginBottom = "10px";
      help.innerHTML =
        "Expected columns (any order, extras ignored): <strong>Activity ID*, Activity Name*</strong>, " +
        "WBS Code, WBS Name, Activity Type (Task/Milestone/Summary/WBS Summary), Duration, Planned Start, " +
        "Planned Finish, Predecessors (e.g. <code>A010FS+2,A020</code>), % Complete, Discipline, Contractor, " +
        "Responsible Person, Status, Notes. This always creates a <strong>new schedule revision</strong> \u2014 " +
        "it never overwrites an existing one.";
      panel.appendChild(help);

      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".xlsx,.xls";
      fileInput.onchange = function () {
        if (fileInput.files && fileInput.files[0]) {
          handleImportFileSelected(fileInput.files[0], data, rerender);
        }
      };
      panel.appendChild(fileInput);

      if (uiState.importError) {
        var err = document.createElement("p");
        err.style.color = "var(--status-critical)";
        err.style.fontSize = "13px";
        err.style.marginTop = "8px";
        err.textContent = uiState.importError;
        panel.appendChild(err);
      }

      var cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn--ghost";
      cancelBtn.style.marginTop = "12px";
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = function () {
        resetImportState();
        rerender();
      };
      panel.appendChild(cancelBtn);
    } else if (uiState.importStep === "reviewing") {
      var parsed = uiState.importParsed;
      var summary = parsed.summary;

      if (uiState.importDuplicateMatches.length > 0 && !uiState.importDuplicateAcknowledged) {
        var dupBox = document.createElement("div");
        dupBox.style.border = "1px solid var(--status-at-risk)";
        dupBox.style.borderRadius = "8px";
        dupBox.style.padding = "12px";
        dupBox.style.marginBottom = "14px";
        dupBox.style.background = "rgba(230, 162, 60, 0.08)";
        var dupTitle = document.createElement("p");
        dupTitle.style.fontWeight = "600";
        dupTitle.style.fontSize = "13px";
        dupTitle.textContent = "This file looks like it may have been imported before";
        dupBox.appendChild(dupTitle);
        uiState.importDuplicateMatches.forEach(function (m) {
          var line = document.createElement("p");
          line.style.fontSize = "12px";
          line.style.marginTop = "6px";
          line.innerHTML =
            "<strong>" + m.record.name + "</strong> (Rev " + m.record.revision_number + ") \u2014 imported " +
            (m.record.import_date ? new Date(m.record.import_date).toLocaleDateString() : "unknown date") +
            "<br/><span class='text-secondary'>" + m.reason + "</span>";
          dupBox.appendChild(line);
        });
        var dupActions = document.createElement("div");
        dupActions.style.display = "flex";
        dupActions.style.gap = "10px";
        dupActions.style.marginTop = "10px";
        var continueBtn = document.createElement("button");
        continueBtn.className = "btn btn--ghost";
        continueBtn.textContent = "Continue Anyway";
        continueBtn.onclick = function () {
          uiState.importDuplicateAcknowledged = true;
          rerender();
        };
        var cancelDupBtn = document.createElement("button");
        cancelDupBtn.className = "btn btn--ghost";
        cancelDupBtn.textContent = "Cancel Import";
        cancelDupBtn.onclick = function () {
          resetImportState();
          rerender();
        };
        dupActions.appendChild(continueBtn);
        dupActions.appendChild(cancelDupBtn);
        dupBox.appendChild(dupActions);
        panel.appendChild(dupBox);
      }

      var summaryLine = document.createElement("p");
      summaryLine.style.fontSize = "14px";
      summaryLine.style.fontWeight = "600";
      summaryLine.style.marginBottom = "4px";
      summaryLine.textContent =
        "Parsed " + summary.total_rows + " row(s) \u2014 " + summary.imported + " activities will be imported, " +
        summary.warnings + " warning(s), " + summary.errors + " error(s).";
      panel.appendChild(summaryLine);

      if (summary.errors > 0) {
        var errNote = document.createElement("p");
        errNote.className = "text-secondary";
        errNote.style.fontSize = "12px";
        errNote.style.marginBottom = "10px";
        errNote.textContent = "Rows with errors are excluded entirely \u2014 fix them in the source file and re-import if needed.";
        panel.appendChild(errNote);
      }

      if (summary.warnings > 0 || summary.errors > 0) {
        var issuesToggle = document.createElement("details");
        issuesToggle.style.marginBottom = "12px";
        var summaryTag = document.createElement("summary");
        summaryTag.style.cursor = "pointer";
        summaryTag.style.fontSize = "13px";
        summaryTag.textContent = "View " + (summary.errors + summary.warnings) + " issue(s)";
        issuesToggle.appendChild(summaryTag);
        var issuesList = document.createElement("div");
        issuesList.style.maxHeight = "220px";
        issuesList.style.overflowY = "auto";
        issuesList.style.marginTop = "8px";
        parsed.errors.forEach(function (e) {
          var p = document.createElement("p");
          p.style.fontSize = "12px";
          p.style.color = "var(--status-critical)";
          p.textContent = (e.row ? "Row " + e.row + ": " : "") + e.message;
          issuesList.appendChild(p);
        });
        parsed.warnings.forEach(function (w) {
          var p = document.createElement("p");
          p.style.fontSize = "12px";
          p.style.color = "var(--status-at-risk)";
          p.textContent = (w.row ? "Row " + w.row + ": " : "") + w.message;
          issuesList.appendChild(p);
        });
        issuesToggle.appendChild(issuesList);
        panel.appendChild(issuesToggle);
      }

      var nameField = document.createElement("div");
      nameField.className = "field";
      nameField.style.maxWidth = "360px";
      nameField.innerHTML = "<label>Schedule Name</label>";
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = uiState.importScheduleName;
      nameInput.oninput = function () {
        uiState.importScheduleName = nameInput.value;
      };
      nameField.appendChild(nameInput);
      panel.appendChild(nameField);

      var actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "10px";
      actions.style.marginTop = "14px";

      var confirmBtn = document.createElement("button");
      confirmBtn.className = "btn btn--primary";
      confirmBtn.textContent = "Confirm Import (" + summary.imported + " activities)";
      confirmBtn.disabled = summary.imported === 0 || (uiState.importDuplicateMatches.length > 0 && !uiState.importDuplicateAcknowledged);
      confirmBtn.onclick = function () {
        commitImport(data, rerender);
      };
      actions.appendChild(confirmBtn);

      var cancelReviewBtn = document.createElement("button");
      cancelReviewBtn.className = "btn btn--ghost";
      cancelReviewBtn.textContent = "Cancel";
      cancelReviewBtn.onclick = function () {
        resetImportState();
        rerender();
      };
      actions.appendChild(cancelReviewBtn);

      panel.appendChild(actions);
    }

    container.appendChild(panel);
  }

  function renderScheduleBar(container, data, rerender) {
    var bar = document.createElement("div");
    bar.className = "toolbar";

    var projSelect = document.createElement("select");
    var activeProjects = data.projects.filter(function (p) {
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
      if (!uiState.projectId || !activeProjects.some(function (p) { return p.id === uiState.projectId; })) {
        uiState.projectId = activeProjects[0].id;
      }
      projSelect.value = uiState.projectId;
    }
    projSelect.onchange = function () {
      uiState.projectId = projSelect.value;
      uiState.scheduleId = "";
      rerender();
    };
    bar.appendChild(projSelect);

    var projectSchedules = data.schedules.filter(function (s) {
      return s.project_id === uiState.projectId;
    });

    var schedSelect = document.createElement("select");
    if (projectSchedules.length === 0) {
      var noSchedOpt = document.createElement("option");
      noSchedOpt.value = "";
      noSchedOpt.textContent = "No schedules yet";
      schedSelect.appendChild(noSchedOpt);
      schedSelect.disabled = true;
    } else {
      projectSchedules.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name + " (Rev " + s.revision_number + (s.is_baseline ? ", Baseline" : "") + ")";
        schedSelect.appendChild(opt);
      });
      if (!uiState.scheduleId || !projectSchedules.some(function (s) { return s.id === uiState.scheduleId; })) {
        uiState.scheduleId = projectSchedules[0].id;
      }
      schedSelect.value = uiState.scheduleId;
    }
    schedSelect.onchange = function () {
      uiState.scheduleId = schedSelect.value;
      rerender();
    };
    bar.appendChild(schedSelect);

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    bar.appendChild(spacer);

    var editSchedBtn = document.createElement("button");
    editSchedBtn.className = "btn btn--ghost";
    editSchedBtn.textContent = "Edit Schedule";
    editSchedBtn.disabled = !uiState.scheduleId;
    editSchedBtn.onclick = function () {
      uiState.editingScheduleId = uiState.scheduleId;
      rerender();
    };
    bar.appendChild(editSchedBtn);

    var newSchedBtn = document.createElement("button");
    newSchedBtn.className = "btn btn--primary";
    newSchedBtn.textContent = "+ New Schedule";
    newSchedBtn.disabled = activeProjects.length === 0;
    newSchedBtn.onclick = function () {
      uiState.editingScheduleId = "new";
      rerender();
    };
    bar.appendChild(newSchedBtn);

    var importBtn = document.createElement("button");
    importBtn.className = "btn btn--ghost";
    importBtn.textContent = "Import Excel";
    importBtn.disabled = activeProjects.length === 0;
    importBtn.onclick = function () {
      resetImportState();
      uiState.importPanelOpen = true;
      rerender();
    };
    bar.appendChild(importBtn);

    var calcBtn = document.createElement("button");
    calcBtn.className = "btn btn--ghost";
    calcBtn.textContent = "Calculate Schedule";
    calcBtn.disabled = !uiState.scheduleId;
    calcBtn.onclick = function () {
      runCalculation(data, rerender);
    };
    bar.appendChild(calcBtn);

    var saveBaselineBtn = document.createElement("button");
    saveBaselineBtn.className = "btn btn--ghost";
    saveBaselineBtn.textContent = uiState.baselineSaving ? "Saving Baseline\u2026" : "Save Baseline";
    var currentScheduleForBaseline = data.schedules.find(function (s) {
      return s.id === uiState.scheduleId;
    });
    var activityCountForBaseline = data.activities.filter(function (a) {
      return a.schedule_id === uiState.scheduleId;
    }).length;
    saveBaselineBtn.disabled = !uiState.scheduleId || uiState.baselineSaving || activityCountForBaseline === 0;
    saveBaselineBtn.onclick = function () {
      captureBaseline(currentScheduleForBaseline, data, rerender);
    };
    bar.appendChild(saveBaselineBtn);

    container.appendChild(bar);
  }

  /** Freezes the currently selected schedule's WBS/Activities/Relationships into a new
   * baseline: full trimmed payload to IndexedDB (async, scheduleBaselineEngine.js
   * decides what's worth keeping), thin index row into the main store (sync, same as
   * every other record). The two writes aren't atomic \u2014 if the IndexedDB write
   * succeeds but the app closes before the store write, you get an orphaned snapshot
   * with no index row (harmless, just unreferenced bytes); the reverse (index row with
   * no snapshot) is guarded against by only writing the index row inside this same
   * .then(), after the snapshot write has already resolved. */
  function captureBaseline(schedule, data, rerender) {
    if (!schedule) return;
    var wbsItems = data.wbs_items.filter(function (w) {
      return w.schedule_id === schedule.id;
    });
    var activities = data.activities.filter(function (a) {
      return a.schedule_id === schedule.id;
    });
    var relationships = data.relationships.filter(function (r) {
      return r.schedule_id === schedule.id;
    });

    var snapshot = window.PCC.scheduleBaselineEngine.buildSnapshot(schedule, wbsItems, activities, relationships);
    var baselineRecord = window.PCC.store.newScheduleBaseline({
      schedule_id: schedule.id,
      project_id: schedule.project_id,
      name: schedule.name + " \u2014 " + new Date().toLocaleDateString(),
      schedule_revision_number: schedule.revision_number,
      wbs_count: wbsItems.length,
      activity_count: activities.length,
      relationship_count: relationships.length,
    });

    uiState.baselineSaving = true;
    rerender();

    window.PCC.scheduleBaselineStore
      .putSnapshot(baselineRecord.id, snapshot)
      .then(function () {
        window.PCC.store.update(function (d) {
          d.schedule_baselines.push(baselineRecord);
        });
        uiState.baselineSaving = false;
        window.PCC.notify("Baseline saved (" + activities.length + " activities).", "success");
        rerender();
      })
      .catch(function (err) {
        uiState.baselineSaving = false;
        console.error("Could not save baseline", err);
        window.PCC.notify("Could not save baseline \u2014 IndexedDB may be unavailable.", "error");
        rerender();
      });
  }

  /** Runs the CPM engine over the current schedule's activities/relationships and
   * writes the results back onto each activity. Read-only fields per Gate 1's own
   * comment (early/late start/finish, float) \u2014 this is the only code path allowed to
   * set them; the CRUD forms never do. */
  function runCalculation(data, rerender) {
    var schedule = data.schedules.find(function (s) {
      return s.id === uiState.scheduleId;
    });
    if (!schedule) return;

    var scheduleActivities = data.activities.filter(function (a) {
      return a.schedule_id === uiState.scheduleId;
    });
    var scheduleRelationships = data.relationships.filter(function (r) {
      return r.schedule_id === uiState.scheduleId;
    });

    if (scheduleActivities.length === 0) {
      window.PCC.notify("Add some activities before calculating.", "error");
      return;
    }

    var result = window.PCC.scheduleCpmEngine.calculateSchedule(scheduleActivities, scheduleRelationships, {
      dataDate: schedule.data_date,
      nearCriticalThresholdDays: schedule.near_critical_threshold_days,
    });

    window.PCC.store.update(function (d) {
      d.activities.forEach(function (a) {
        if (a.schedule_id !== uiState.scheduleId) return;
        var r = result.results[a.id];
        if (!r) {
          // Cyclic \u2014 leave previous calculated values in place rather than wiping them
          // to null, since a stale-but-real number is more useful mid-edit than
          // silently blanking a field the user might not notice changed.
          return;
        }
        a.early_start = r.early_start;
        a.early_finish = r.early_finish;
        a.late_start = r.late_start;
        a.late_finish = r.late_finish;
        a.total_float = r.total_float;
        a.free_float = r.free_float;
        a.updated_at = new Date().toISOString();
      });
    });

    var insufficientCount = Object.keys(result.results).filter(function (id) {
      return result.results[id] && result.results[id].insufficient_data;
    }).length;

    if (result.cyclicActivityIds.length > 0) {
      window.PCC.notify(
        "Calculated with " + result.cyclicActivityIds.length + " activity(ies) skipped due to a circular dependency \u2014 check Relationships.",
        "error"
      );
    } else {
      var varianceMsg =
        result.forecastVarianceDays != null
          ? result.forecastVarianceDays > 0
            ? ", forecast " + result.forecastVarianceDays + " day(s) behind plan"
            : result.forecastVarianceDays < 0
            ? ", forecast " + Math.abs(result.forecastVarianceDays) + " day(s) ahead of plan"
            : ", forecast on plan"
          : "";
      var insufficientMsg = insufficientCount > 0 ? " (" + insufficientCount + " activity(ies) have insufficient data to forecast reliably)" : "";
      window.PCC.notify(
        "Calculated \u2014 project finish " + result.projectFinish + varianceMsg + ", " +
          result.criticalActivityIds.length + " critical activity(ies)." + insufficientMsg,
        insufficientCount > 0 ? "error" : "success"
      );
    }

    rerender();
  }

  // ---------------------------------------------------------------------------------
  // Activities tab
  // ---------------------------------------------------------------------------------

  var ACTIVITY_FIELD_CONFIG = [
    { key: "name", label: "Activity Name", type: "text", required: true },
    { key: "activity_type", label: "Type", type: "select", options: "ACTIVITY_TYPES", labels: ACTIVITY_TYPE_LABELS },
    { key: "status", label: "Status", type: "select", options: "ACTIVITY_STATUSES", labels: ACTIVITY_STATUS_LABELS },
    { key: "priority", label: "Priority", type: "select", options: null, labels: PRIORITY_LABELS, staticOptions: ["low", "medium", "high"] },
    { key: "planned_start", label: "Planned Start", type: "date" },
    { key: "planned_finish", label: "Planned Finish", type: "date" },
    { key: "actual_start", label: "Actual Start", type: "date" },
    { key: "actual_finish", label: "Actual Finish", type: "date" },
    { key: "duration", label: "Duration (days)", type: "number" },
    { key: "remaining_duration", label: "Remaining Duration (days)", type: "number" },
    { key: "percent_complete", label: "% Complete", type: "number" },
    { key: "discipline", label: "Discipline", type: "text" },
    { key: "contractor", label: "Contractor", type: "text" },
    { key: "responsible_person", label: "Responsible Person", type: "text" },
    { key: "constraint_type", label: "Constraint Type", type: "text" },
    { key: "constraint_date", label: "Constraint Date", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  function buildActivityField(cfg, activity) {
    var field = document.createElement("div");
    field.className = "field";
    if (cfg.type === "textarea") field.style.gridColumn = "1 / -1";

    var label = document.createElement("label");
    label.textContent = cfg.label + (cfg.required ? " *" : "");
    field.appendChild(label);

    var input;
    if (cfg.type === "select") {
      input = document.createElement("select");
      var opts = cfg.options ? window.PCC.store[cfg.options] : cfg.staticOptions;
      opts.forEach(function (val) {
        var opt = document.createElement("option");
        opt.value = val;
        opt.textContent = cfg.labels[val] || val;
        input.appendChild(opt);
      });
      input.value = activity[cfg.key];
    } else if (cfg.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 2;
      input.value = activity[cfg.key] || "";
    } else {
      input = document.createElement("input");
      input.type = cfg.type;
      input.value = activity[cfg.key] == null ? "" : activity[cfg.key];
    }
    input.id = "actfield-" + cfg.key;
    field.appendChild(input);
    return field;
  }

  function renderActivityForm(container, activity, wbsItems, rerender) {
    var isNew = uiState.editingActivityId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Activity" : "Edit Activity";
    panel.appendChild(heading);

    var form = document.createElement("form");

    var wbsField = document.createElement("div");
    wbsField.className = "field";
    wbsField.innerHTML = "<label>WBS</label>";
    var wbsSelect = document.createElement("select");
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "(none)";
    wbsSelect.appendChild(noneOpt);
    wbsItems.forEach(function (w) {
      var opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = w.code ? w.code + " \u2014 " + w.name : w.name;
      wbsSelect.appendChild(opt);
    });
    wbsSelect.value = activity.wbs_id || "";
    wbsField.appendChild(wbsSelect);
    form.appendChild(wbsField);

    var grid = document.createElement("div");
    grid.className = "form-grid";
    ACTIVITY_FIELD_CONFIG.forEach(function (cfg) {
      grid.appendChild(buildActivityField(cfg, activity));
    });
    form.appendChild(grid);

    if (!isNew) {
      var calcBox = document.createElement("div");
      calcBox.className = "panel";
      calcBox.style.padding = "10px 12px";
      calcBox.style.marginTop = "-4px";
      calcBox.style.marginBottom = "10px";
      if (activity.early_start == null) {
        calcBox.className += " text-secondary";
        calcBox.style.fontSize = "12px";
        calcBox.textContent =
          "Early/Late Start/Finish, Total Float, and Free Float aren't calculated yet \u2014 use \u201cCalculate Schedule\u201d above.";
      } else {
        var floatLabel =
          activity.total_float <= 0
            ? "Critical (0 float)"
            : activity.total_float + " day(s) float";
        calcBox.innerHTML =
          "<strong>Calculated (read-only)</strong> \u2014 " + floatLabel + "<br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          "ES " + activity.early_start + " \u00b7 EF " + activity.early_finish + " \u00b7 " +
          "LS " + activity.late_start + " \u00b7 LF " + activity.late_finish + " \u00b7 " +
          "Free Float " + activity.free_float + " day(s)</span>";
      }
      form.appendChild(calcBox);
    }

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Activity name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Activity" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingActivityId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var name = form.querySelector("#actfield-name").value.trim();
      if (!name) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = { wbs_id: wbsSelect.value || null };
      ACTIVITY_FIELD_CONFIG.forEach(function (cfg) {
        var el = form.querySelector("#actfield-" + cfg.key);
        if (!el) return;
        if (cfg.type === "number") {
          values[cfg.key] = el.value === "" ? null : Number(el.value);
        } else {
          values[cfg.key] = el.value;
        }
      });

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.activities.push(
            window.PCC.store.newActivity(
              Object.assign(
                { project_id: uiState.projectId, schedule_id: uiState.scheduleId },
                values
              )
            )
          );
        } else {
          var existing = data.activities.find(function (a) {
            return a.id === activity.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Activity added." : "Activity updated.", "success");
      uiState.editingActivityId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function renderActivitiesTab(container, data, rerender) {
    var scheduleActivities = data.activities.filter(function (a) {
      return a.schedule_id === uiState.scheduleId;
    });
    var wbsItems = data.wbs_items.filter(function (w) {
      return w.schedule_id === uiState.scheduleId;
    });

    if (uiState.editingActivityId) {
      var activityBeingEdited =
        uiState.editingActivityId === "new"
          ? window.PCC.store.newActivity(uiState.newActivityTypeHint ? { activity_type: uiState.newActivityTypeHint } : {})
          : scheduleActivities.find(function (a) {
              return a.id === uiState.editingActivityId;
            });
      uiState.newActivityTypeHint = null;
      if (activityBeingEdited) renderActivityForm(container, activityBeingEdited, wbsItems, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search activity name\u2026";
    searchInput.value = uiState.activityFilter;
    searchInput.oninput = function () {
      uiState.activityFilter = searchInput.value;
      renderList();
    };
    toolbar.appendChild(searchInput);

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Activity";
    addBtn.disabled = !uiState.scheduleId;
    addBtn.onclick = function () {
      uiState.editingActivityId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    var listWrap = document.createElement("div");
    container.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = scheduleActivities.filter(function (a) {
        if (!uiState.activityFilter) return true;
        return a.name.toLowerCase().indexOf(uiState.activityFilter.toLowerCase()) !== -1;
      });

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent = uiState.scheduleId
          ? scheduleActivities.length === 0
            ? "No activities yet. Click \u201c+ Add Activity\u201d to add the first one."
            : "No activities match this search."
          : "Create a schedule first.";
        listWrap.appendChild(empty);
        return;
      }

      var table = document.createElement("div");
      table.className = "project-list";
      filtered.forEach(function (a) {
        var row = document.createElement("div");
        row.className = "project-entry";

        var card = document.createElement("div");
        card.className = "detail-card";
        card.style.display = "flex";
        card.style.justifyContent = "space-between";
        card.style.alignItems = "center";
        card.style.gap = "12px";
        card.style.flexWrap = "wrap";

        var main = document.createElement("div");
        main.innerHTML =
          "<strong>" + a.name + "</strong><br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          wbsName(wbsItems, a.wbs_id) + " \u00b7 " + ACTIVITY_TYPE_LABELS[a.activity_type] +
          (a.planned_start ? " \u00b7 " + a.planned_start : "") +
          (a.planned_finish ? " \u2192 " + a.planned_finish : "") +
          " \u00b7 " + (a.percent_complete || 0) + "% complete</span>";
        card.appendChild(main);

        var badge = document.createElement("span");
        badge.className =
          "status-badge " +
          (a.status === "complete" ? "status-badge--complete" : a.status === "on_hold" ? "status-badge--at_risk" : "status-badge--info");
        badge.textContent = ACTIVITY_STATUS_LABELS[a.status];
        card.appendChild(badge);

        if (a.total_float != null) {
          var floatBadge = document.createElement("span");
          floatBadge.style.marginLeft = "6px";
          if (a.total_float <= 0) {
            floatBadge.className = "status-badge status-badge--critical";
            floatBadge.textContent = "Critical";
          } else {
            floatBadge.className = "status-badge status-badge--info";
            floatBadge.textContent = a.total_float + "d float";
          }
          card.appendChild(floatBadge);
        }

        var actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";

        var editBtn = document.createElement("button");
        editBtn.className = "btn btn--ghost";
        editBtn.textContent = "Edit";
        editBtn.onclick = function () {
          uiState.editingActivityId = a.id;
          rerender();
        };
        actions.appendChild(editBtn);

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn--ghost";
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = function () {
          deleteActivityWithConfirm(a, rerender);
        };
        actions.appendChild(deleteBtn);

        card.appendChild(actions);
        row.appendChild(card);
        table.appendChild(row);
      });
      listWrap.appendChild(table);
    }

    renderList();
  }

  // ---------------------------------------------------------------------------------
  // WBS tab
  // ---------------------------------------------------------------------------------

  function renderWbsForm(container, wbsItem, wbsItems, rerender) {
    var isNew = uiState.editingWbsId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add WBS Item" : "Edit WBS Item";
    panel.appendChild(heading);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    var codeField = document.createElement("div");
    codeField.className = "field";
    codeField.innerHTML = "<label>WBS Code</label>";
    var codeInput = document.createElement("input");
    codeInput.type = "text";
    codeInput.id = "wbsfield-code";
    codeInput.value = wbsItem.code || "";
    codeField.appendChild(codeInput);
    grid.appendChild(codeField);

    var nameField = document.createElement("div");
    nameField.className = "field";
    nameField.innerHTML = "<label>Name *</label>";
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "wbsfield-name";
    nameInput.value = wbsItem.name || "";
    nameField.appendChild(nameInput);
    grid.appendChild(nameField);

    var parentField = document.createElement("div");
    parentField.className = "field";
    parentField.innerHTML = "<label>Parent WBS</label>";
    var parentSelect = document.createElement("select");
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "(top level)";
    parentSelect.appendChild(noneOpt);
    wbsItems
      .filter(function (w) {
        return w.id !== wbsItem.id; // can't be its own parent
      })
      .forEach(function (w) {
        var opt = document.createElement("option");
        opt.value = w.id;
        opt.textContent = w.code ? w.code + " \u2014 " + w.name : w.name;
        parentSelect.appendChild(opt);
      });
    parentSelect.value = wbsItem.parent_wbs_id || "";
    parentField.appendChild(parentSelect);
    grid.appendChild(parentField);

    var descField = document.createElement("div");
    descField.className = "field";
    descField.style.gridColumn = "1 / -1";
    descField.innerHTML = "<label>Description</label>";
    var descArea = document.createElement("textarea");
    descArea.id = "wbsfield-description";
    descArea.rows = 2;
    descArea.value = wbsItem.description || "";
    descField.appendChild(descArea);
    grid.appendChild(descField);

    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "WBS name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add WBS Item" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingWbsId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var name = nameInput.value.trim();
      if (!name) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var parentId = parentSelect.value || null;
      // level is derived from the parent chain, not user-entered, so it can't drift
      // out of sync with parent_wbs_id.
      var level = 0;
      var walk = parentId;
      var guard = 0;
      while (walk && guard < 50) {
        var parentItem = wbsItems.find(function (w) {
          return w.id === walk;
        });
        if (!parentItem) break;
        level++;
        walk = parentItem.parent_wbs_id;
        guard++;
      }

      var values = {
        code: codeInput.value,
        name: name,
        parent_wbs_id: parentId,
        level: level,
        description: descArea.value,
      };

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.wbs_items.push(
            window.PCC.store.newWbsItem(
              Object.assign({ project_id: uiState.projectId, schedule_id: uiState.scheduleId }, values)
            )
          );
        } else {
          var existing = data.wbs_items.find(function (w) {
            return w.id === wbsItem.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "WBS item added." : "WBS item updated.", "success");
      uiState.editingWbsId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function renderWbsTab(container, data, rerender) {
    var wbsItems = data.wbs_items.filter(function (w) {
      return w.schedule_id === uiState.scheduleId;
    });

    if (uiState.editingWbsId) {
      var wbsBeingEdited =
        uiState.editingWbsId === "new"
          ? window.PCC.store.newWbsItem({})
          : wbsItems.find(function (w) {
              return w.id === uiState.editingWbsId;
            });
      if (wbsBeingEdited) renderWbsForm(container, wbsBeingEdited, wbsItems, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add WBS Item";
    addBtn.disabled = !uiState.scheduleId;
    addBtn.onclick = function () {
      uiState.editingWbsId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    if (wbsItems.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = uiState.scheduleId
        ? "No WBS items yet. Click \u201c+ Add WBS Item\u201d to add the first one."
        : "Create a schedule first.";
      container.appendChild(empty);
      return;
    }

    // Sorted by level then code so the hierarchy reads top-to-bottom even though
    // storage is a flat list \u2014 this is display-only ordering, not a stored tree.
    var sorted = wbsItems.slice().sort(function (a, b) {
      if (a.level !== b.level) return a.level - b.level;
      return (a.code || "").localeCompare(b.code || "");
    });

    var list = document.createElement("div");
    list.className = "project-list";
    sorted.forEach(function (w) {
      var row = document.createElement("div");
      row.className = "detail-card";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginLeft = w.level * 20 + "px";
      row.style.marginBottom = "6px";

      var main = document.createElement("div");
      main.innerHTML = "<strong>" + (w.code ? w.code + " \u2014 " : "") + w.name + "</strong>";
      row.appendChild(main);

      var actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      var editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.textContent = "Edit";
      editBtn.onclick = function () {
        uiState.editingWbsId = w.id;
        rerender();
      };
      actions.appendChild(editBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        var hasChildren = wbsItems.some(function (x) {
          return x.parent_wbs_id === w.id;
        });
        var hasActivities = data.activities.some(function (a) {
          return a.wbs_id === w.id;
        });
        if (hasChildren || hasActivities) {
          alert("Can't delete this WBS item \u2014 it has child WBS items or activities assigned to it. Reassign or delete those first.");
          return;
        }
        if (!confirm('Delete WBS item "' + w.name + '"?')) return;
        window.PCC.store.update(function (data2) {
          data2.wbs_items = data2.wbs_items.filter(function (item) {
            return item.id !== w.id;
          });
        });
        window.PCC.notify("WBS item deleted.", "success");
        rerender();
      };
      actions.appendChild(deleteBtn);

      row.appendChild(actions);
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  // ---------------------------------------------------------------------------------
  // Relationships tab
  // ---------------------------------------------------------------------------------

  function renderRelationshipForm(container, relationship, activities, rerender) {
    var isNew = uiState.editingRelationshipId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Relationship" : "Edit Relationship";
    panel.appendChild(heading);

    if (activities.length < 2) {
      var note = document.createElement("p");
      note.className = "text-secondary";
      note.textContent = "Add at least two activities to this schedule before creating a relationship.";
      panel.appendChild(note);
      var closeBtn = document.createElement("button");
      closeBtn.className = "btn btn--ghost";
      closeBtn.textContent = "Close";
      closeBtn.onclick = function () {
        uiState.editingRelationshipId = null;
        rerender();
      };
      panel.appendChild(closeBtn);
      container.appendChild(panel);
      return;
    }

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    function activitySelect(id, selectedId) {
      var select = document.createElement("select");
      select.id = id;
      activities.forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.name;
        select.appendChild(opt);
      });
      select.value = selectedId || activities[0].id;
      return select;
    }

    var predField = document.createElement("div");
    predField.className = "field";
    predField.innerHTML = "<label>Predecessor *</label>";
    var predSelect = activitySelect("relfield-predecessor_id", relationship.predecessor_id);
    predField.appendChild(predSelect);
    grid.appendChild(predField);

    var succField = document.createElement("div");
    succField.className = "field";
    succField.innerHTML = "<label>Successor *</label>";
    var succSelect = activitySelect("relfield-successor_id", relationship.successor_id || activities[1].id);
    succField.appendChild(succSelect);
    grid.appendChild(succField);

    var typeField = document.createElement("div");
    typeField.className = "field";
    typeField.innerHTML = "<label>Relationship Type</label>";
    var typeSelect = document.createElement("select");
    typeSelect.id = "relfield-type";
    window.PCC.store.RELATIONSHIP_TYPES.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t + " \u2014 " + RELATIONSHIP_TYPE_LABELS[t];
      typeSelect.appendChild(opt);
    });
    typeSelect.value = relationship.type;
    typeField.appendChild(typeSelect);
    grid.appendChild(typeField);

    var lagField = document.createElement("div");
    lagField.className = "field";
    lagField.innerHTML = "<label>Lag (days, negative = lead)</label>";
    var lagInput = document.createElement("input");
    lagInput.type = "number";
    lagInput.id = "relfield-lag";
    lagInput.value = relationship.lag || 0;
    lagField.appendChild(lagInput);
    grid.appendChild(lagField);

    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Predecessor and successor must be different activities.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Relationship" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingRelationshipId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      if (predSelect.value === succSelect.value) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = {
        predecessor_id: predSelect.value,
        successor_id: succSelect.value,
        type: typeSelect.value,
        lag: Number(lagInput.value) || 0,
      };

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.relationships.push(
            window.PCC.store.newRelationship(Object.assign({ schedule_id: uiState.scheduleId }, values))
          );
        } else {
          var existing = data.relationships.find(function (r) {
            return r.id === relationship.id;
          });
          if (existing) Object.assign(existing, values);
        }
      });

      window.PCC.notify(isNew ? "Relationship added." : "Relationship updated.", "success");
      uiState.editingRelationshipId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function renderRelationshipsTab(container, data, rerender) {
    var activities = data.activities.filter(function (a) {
      return a.schedule_id === uiState.scheduleId;
    });
    var relationships = data.relationships.filter(function (r) {
      return r.schedule_id === uiState.scheduleId;
    });

    if (uiState.editingRelationshipId) {
      var relBeingEdited =
        uiState.editingRelationshipId === "new"
          ? window.PCC.store.newRelationship(uiState.relationshipPrefillId ? { predecessor_id: uiState.relationshipPrefillId } : {})
          : relationships.find(function (r) {
              return r.id === uiState.editingRelationshipId;
            });
      uiState.relationshipPrefillId = null;
      if (relBeingEdited) renderRelationshipForm(container, relBeingEdited, activities, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Relationship";
    addBtn.disabled = activities.length < 2;
    addBtn.onclick = function () {
      uiState.editingRelationshipId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    if (relationships.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = !uiState.scheduleId
        ? "Create a schedule first."
        : activities.length < 2
        ? "Add at least two activities before creating relationships."
        : "No relationships yet.";
      container.appendChild(empty);
      return;
    }

    var list = document.createElement("div");
    list.className = "project-list";
    relationships.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "detail-card";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "6px";

      var main = document.createElement("div");
      main.innerHTML =
        "<strong>" + activityName(activities, r.predecessor_id) + "</strong> \u2192 " +
        "<strong>" + activityName(activities, r.successor_id) + "</strong><br/>" +
        "<span class='text-secondary' style='font-size:12px;'>" +
        r.type + " \u00b7 Lag: " + r.lag + " day(s)</span>";
      row.appendChild(main);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        if (!confirm("Delete this relationship?")) return;
        window.PCC.store.update(function (data2) {
          data2.relationships = data2.relationships.filter(function (item) {
            return item.id !== r.id;
          });
        });
        window.PCC.notify("Relationship deleted.", "success");
        rerender();
      };
      row.appendChild(deleteBtn);

      list.appendChild(row);
    });
    container.appendChild(list);
  }

  // ---------------------------------------------------------------------------------
  // Gantt tab (Gate 5, editing added Gate 8) — built on scheduleGanttLayout.js's pure
  // row/date computation and drag-math. Activities can still be edited through the
  // Activities tab form; the Gantt now ALSO supports dragging a bar to reschedule it,
  // dragging its right edge to resize duration, and clicking it to open a detail panel
  // — every edit writes to planned_start/planned_finish (never the calculated fields)
  // and immediately re-runs the CPM engine, same as the toolbar's own "Calculate
  // Schedule" button, so float/critical-path/project-finish never go stale after a drag.
  // ---------------------------------------------------------------------------------

  var SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        el.setAttribute(k, attrs[k]);
      });
    }
    return el;
  }

  function truncateLabel(name, maxChars) {
    if (name.length <= maxChars) return name;
    return name.slice(0, maxChars - 1) + "…";
  }

  // Gate 8: explicit zoom presets, in addition to the pre-existing "auto" heuristic
  // (picks a density from the schedule's own span so a 2-week schedule and a 2-year one
  // both render legibly without the user having to touch the zoom control at all).
  var GANTT_ZOOM_PX_PER_DAY = { day: 32, week: 16, month: 6, quarter: 2.2, year: 0.7 };
  var GANTT_ZOOM_LABELS = { auto: "Auto", day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" };

  function ganttPxPerDay(totalSpanDays, zoom) {
    if (zoom && GANTT_ZOOM_PX_PER_DAY[zoom]) return GANTT_ZOOM_PX_PER_DAY[zoom];
    if (totalSpanDays <= 30) return 24;
    if (totalSpanDays <= 90) return 14;
    if (totalSpanDays <= 180) return 8;
    return 4;
  }

  function ganttTickIntervalDays(totalSpanDays) {
    if (totalSpanDays <= 45) return 7;
    if (totalSpanDays <= 120) return 14;
    return 30;
  }

  function formatAxisDate(iso) {
    var d = new Date(iso + "T00:00:00Z");
    return (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Gate 8 filters: WBS / Discipline / Contractor / Responsible Person / a single
   * "quick" status filter (Critical / Near Critical / Delayed / Completed / In Progress
   * / Not Started / Milestones) / free-text search across Activity ID, Name, WBS,
   * Contractor, Discipline. "Delayed" means it has a usable finish date that's already
   * past the schedule's data date (or today, if no data date) and isn't marked complete
   * — computed at filter time, never stored, same convention every overdue check in
   * this app already uses. */
  function activityMatchesGanttFilter(a, wbsItems, filter, referenceDateIso) {
    if (filter.search) {
      var needle = filter.search.toLowerCase();
      var wbs = wbsItems.find(function (w) { return w.id === a.wbs_id; });
      var haystack = [
        a.external_id || "",
        a.name || "",
        wbs ? (wbs.code || "") + " " + (wbs.name || "") : "",
        a.contractor || "",
        a.discipline || "",
      ].join(" ").toLowerCase();
      if (haystack.indexOf(needle) === -1) return false;
    }
    if (filter.wbsId && a.wbs_id !== filter.wbsId) return false;
    if (filter.discipline && a.discipline !== filter.discipline) return false;
    if (filter.contractor && a.contractor !== filter.contractor) return false;
    if (filter.responsiblePerson && a.responsible_person !== filter.responsiblePerson) return false;

    switch (filter.quick) {
      case "critical":
        if (!(a.total_float != null && a.total_float <= 0)) return false;
        break;
      case "near_critical":
        if (!(a.total_float != null && a.total_float > 0 && a.total_float <= (filter.nearCriticalThresholdDays || 5))) return false;
        break;
      case "delayed": {
        var finish = a.early_finish || a.planned_finish;
        if (!finish || !referenceDateIso || finish >= referenceDateIso || a.status === "complete") return false;
        break;
      }
      case "completed":
        if (a.status !== "complete") return false;
        break;
      case "in_progress":
        if (a.status !== "in_progress") return false;
        break;
      case "not_started":
        if (a.status !== "not_started") return false;
        break;
      case "milestones":
        if (a.activity_type !== "milestone") return false;
        break;
      default:
        break;
    }
    return true;
  }

  /** Loads (and caches) the trimmed activity snapshot for a baseline so the Gantt can
   * draw ghost bars behind current activities. Matching uses the same external_id-then-
   * id precedence scheduleBaselineEngine.js's compareBaselineToCurrent() uses, so a
   * baseline captured before a re-import still lines up correctly. */
  function matchKeyFor(a) {
    if (a.external_id !== null && a.external_id !== undefined && a.external_id !== "") return "ext:" + a.external_id;
    return "id:" + a.id;
  }

  function loadBaselineOverlay(baselineId, rerender) {
    uiState.ganttBaselineLoading = true;
    rerender();
    window.PCC.scheduleBaselineStore
      .getSnapshot(baselineId)
      .then(function (snapshot) {
        uiState.ganttBaselineSnapshot = { baselineId: baselineId, activities: snapshot ? snapshot.activities : [] };
        uiState.ganttBaselineLoading = false;
        rerender();
      })
      .catch(function (err) {
        console.error("Could not load baseline for Gantt overlay", err);
        uiState.ganttBaselineLoading = false;
        uiState.ganttShowBaseline = false;
        window.PCC.notify("Could not load that baseline's stored data.", "error");
        rerender();
      });
  }

  function renderGanttToolbar(container, data, allActivities, wbsItems, rerender) {
    var bar = document.createElement("div");
    bar.className = "toolbar";
    bar.style.flexWrap = "wrap";

    var search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search ID, name, WBS, contractor, discipline…";
    search.value = uiState.ganttFilter.search;
    search.style.minWidth = "220px";
    search.oninput = function () {
      uiState.ganttFilter.search = search.value;
      rerender();
    };
    bar.appendChild(search);

    function uniqueValues(key) {
      var seen = {};
      var out = [];
      allActivities.forEach(function (a) {
        var v = a[key];
        if (v && !seen[v]) {
          seen[v] = true;
          out.push(v);
        }
      });
      return out.sort();
    }

    function selectFilter(labelText, value, options, onChange) {
      var sel = document.createElement("select");
      var allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = labelText;
      sel.appendChild(allOpt);
      options.forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      sel.value = value || "";
      sel.onchange = function () {
        onChange(sel.value);
        rerender();
      };
      return sel;
    }

    bar.appendChild(
      selectFilter("WBS: All", uiState.ganttFilter.wbsId, wbsItems.map(function (w) {
        return { value: w.id, label: w.code ? w.code + " — " + w.name : w.name };
      }), function (v) { uiState.ganttFilter.wbsId = v; })
    );
    bar.appendChild(
      selectFilter("Discipline: All", uiState.ganttFilter.discipline, uniqueValues("discipline").map(function (v) {
        return { value: v, label: v };
      }), function (v) { uiState.ganttFilter.discipline = v; })
    );
    bar.appendChild(
      selectFilter("Contractor: All", uiState.ganttFilter.contractor, uniqueValues("contractor").map(function (v) {
        return { value: v, label: v };
      }), function (v) { uiState.ganttFilter.contractor = v; })
    );
    bar.appendChild(
      selectFilter("Responsible: All", uiState.ganttFilter.responsiblePerson, uniqueValues("responsible_person").map(function (v) {
        return { value: v, label: v };
      }), function (v) { uiState.ganttFilter.responsiblePerson = v; })
    );
    bar.appendChild(
      selectFilter("Show: All Activities", uiState.ganttFilter.quick, [
        { value: "critical", label: "Critical" },
        { value: "near_critical", label: "Near Critical" },
        { value: "delayed", label: "Delayed" },
        { value: "completed", label: "Completed" },
        { value: "in_progress", label: "In Progress" },
        { value: "not_started", label: "Not Started" },
        { value: "milestones", label: "Milestones Only" },
      ], function (v) { uiState.ganttFilter.quick = v; })
    );

    if (uiState.ganttFilter.search || uiState.ganttFilter.wbsId || uiState.ganttFilter.discipline || uiState.ganttFilter.contractor || uiState.ganttFilter.responsiblePerson || uiState.ganttFilter.quick) {
      var clearBtn = document.createElement("button");
      clearBtn.className = "btn btn--ghost";
      clearBtn.textContent = "Clear Filters";
      clearBtn.onclick = function () {
        uiState.ganttFilter = { search: "", wbsId: "", discipline: "", contractor: "", responsiblePerson: "", quick: "" };
        rerender();
      };
      bar.appendChild(clearBtn);
    }

    container.appendChild(bar);

    // Zoom + jump + baseline-overlay controls, on their own row.
    var bar2 = document.createElement("div");
    bar2.className = "toolbar";
    bar2.style.flexWrap = "wrap";
    bar2.style.marginTop = "8px";

    var zoomLabel = document.createElement("span");
    zoomLabel.className = "text-secondary";
    zoomLabel.style.fontSize = "12px";
    zoomLabel.style.alignSelf = "center";
    zoomLabel.textContent = "Zoom:";
    bar2.appendChild(zoomLabel);

    ["auto", "day", "week", "month", "quarter", "year"].forEach(function (z) {
      var zBtn = document.createElement("button");
      zBtn.className = "btn " + (uiState.ganttZoom === z ? "btn--primary" : "btn--ghost");
      zBtn.textContent = GANTT_ZOOM_LABELS[z];
      zBtn.onclick = function () {
        uiState.ganttZoom = z;
        rerender();
      };
      bar2.appendChild(zBtn);
    });

    var spacer2 = document.createElement("div");
    spacer2.className = "toolbar__spacer";
    bar2.appendChild(spacer2);

    var addActivityBtn = document.createElement("button");
    addActivityBtn.className = "btn btn--ghost";
    addActivityBtn.textContent = "+ Add Activity";
    addActivityBtn.onclick = function () {
      uiState.tab = "activities";
      uiState.editingActivityId = "new";
      rerender();
    };
    bar2.appendChild(addActivityBtn);

    var addMilestoneBtn = document.createElement("button");
    addMilestoneBtn.className = "btn btn--ghost";
    addMilestoneBtn.textContent = "+ Add Milestone";
    addMilestoneBtn.onclick = function () {
      uiState.tab = "activities";
      uiState.editingActivityId = "new";
      uiState.newActivityTypeHint = "milestone";
      rerender();
    };
    bar2.appendChild(addMilestoneBtn);

    container.appendChild(bar2);

    var projectBaselines = data.schedule_baselines.filter(function (b) {
      return b.project_id === uiState.projectId;
    });
    if (projectBaselines.length > 0) {
      var bar3 = document.createElement("div");
      bar3.className = "toolbar";
      bar3.style.flexWrap = "wrap";
      bar3.style.marginTop = "8px";

      var baselineToggle = document.createElement("label");
      baselineToggle.style.display = "flex";
      baselineToggle.style.alignItems = "center";
      baselineToggle.style.gap = "6px";
      baselineToggle.style.fontSize = "13px";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = uiState.ganttShowBaseline;
      checkbox.onchange = function () {
        uiState.ganttShowBaseline = checkbox.checked;
        if (uiState.ganttShowBaseline) {
          if (!uiState.ganttBaselineId) uiState.ganttBaselineId = projectBaselines[0].id;
          if (!uiState.ganttBaselineSnapshot || uiState.ganttBaselineSnapshot.baselineId !== uiState.ganttBaselineId) {
            loadBaselineOverlay(uiState.ganttBaselineId, rerender);
            return;
          }
        }
        rerender();
      };
      baselineToggle.appendChild(checkbox);
      baselineToggle.appendChild(document.createTextNode("Show Baseline"));
      bar3.appendChild(baselineToggle);

      var baselineSelect = document.createElement("select");
      projectBaselines.forEach(function (b) {
        var o = document.createElement("option");
        o.value = b.id;
        o.textContent = b.name;
        baselineSelect.appendChild(o);
      });
      baselineSelect.value = uiState.ganttBaselineId || projectBaselines[0].id;
      baselineSelect.disabled = !uiState.ganttShowBaseline;
      baselineSelect.onchange = function () {
        uiState.ganttBaselineId = baselineSelect.value;
        loadBaselineOverlay(uiState.ganttBaselineId, rerender);
      };
      bar3.appendChild(baselineSelect);

      if (uiState.ganttBaselineLoading) {
        var loadingNote = document.createElement("span");
        loadingNote.className = "text-secondary";
        loadingNote.style.fontSize = "12px";
        loadingNote.style.alignSelf = "center";
        loadingNote.textContent = "Loading baseline…";
        bar3.appendChild(loadingNote);
      }

      container.appendChild(bar3);
    }
  }

  /** Gate 10 (Activity Linking): every register that can now optionally carry an
   * `activity_id` — Risks/Issues/Opportunities, RFI/TQ, Meetings, Documents, Daily
   * Log, Change Orders — surfaced here as one flat, real, live-queried list. Nothing
   * duplicated or cached: this reads straight from `data` each render, same as every
   * other cross-module rollup in this app (Portfolio's Details panel, the Meetings
   * hub). Each row's "View" button uses that module's own existing expand/navigate
   * API (added in this same gate for Documents/Daily Log; already existed for the
   * other four), matching the bidirectional-link pattern Change Orders established
   * for source_rfi_id/source_risk_id/source_meeting_id. */
  var LINKED_RECORD_SOURCES = [
    {
      module: "risks",
      label: function (r) { return (r.type === "risk" ? "Risk" : r.type === "issue" ? "Issue" : "Opportunity") + ": " + (r.title || "(untitled)"); },
      list: function (data, activityId) { return data.risks.filter(function (r) { return r.activity_id === activityId; }); },
      view: function (r) {
        if (window.PCC.risks && window.PCC.risks.expandRisk) window.PCC.risks.expandRisk(r.id);
        window.PCC.router.go("risks");
      },
    },
    {
      module: "rfis",
      label: function (r) { return r.number + " — " + (r.subject || "(untitled)"); },
      list: function (data, activityId) { return data.rfis.filter(function (r) { return r.activity_id === activityId; }); },
      view: function (r) {
        if (window.PCC.rfis && window.PCC.rfis.expandRfi) window.PCC.rfis.expandRfi(r.id);
        window.PCC.router.go("rfis");
      },
    },
    {
      module: "meetings",
      label: function (m) { return "Meeting: " + (m.title || "(untitled)") + " (" + m.meeting_date + ")"; },
      list: function (data, activityId) { return data.meetings.filter(function (m) { return m.activity_id === activityId; }); },
      view: function (m) {
        if (window.PCC.meetings) window.PCC.meetings.expandMeeting(m.id);
        window.PCC.router.go("meetings");
      },
    },
    {
      module: "documents",
      label: function (d) { return "Document: " + d.filename; },
      list: function (data, activityId) { return data.documents.filter(function (d) { return d.activity_id === activityId; }); },
      view: function (d) {
        if (window.PCC.documents && window.PCC.documents.expandDocument) window.PCC.documents.expandDocument(d.id);
        window.PCC.router.go("documents");
      },
    },
    {
      module: "dailylog",
      label: function (l) { return "Daily Log: " + l.log_date; },
      list: function (data, activityId) { return data.daily_logs.filter(function (l) { return l.activity_id === activityId; }); },
      view: function (l) {
        if (window.PCC.dailyLog && window.PCC.dailyLog.expandLog) window.PCC.dailyLog.expandLog(l.id);
        window.PCC.router.go("dailylog");
      },
    },
    {
      module: "changeOrders",
      label: function (co) { return co.number + " — " + (co.title || "(untitled)"); },
      list: function (data, activityId) { return data.change_orders.filter(function (co) { return co.activity_id === activityId; }); },
      view: function (co) {
        if (window.PCC.changeOrders && window.PCC.changeOrders.expandChangeOrder) window.PCC.changeOrders.expandChangeOrder(co.id);
        window.PCC.router.go("changeOrders");
      },
    },
  ];

  function renderLinkedRecordsSection(activity, data) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "14px";
    wrap.style.paddingTop = "10px";
    wrap.style.borderTop = "1px solid var(--divider)";

    var rows = [];
    LINKED_RECORD_SOURCES.forEach(function (source) {
      source.list(data, activity.id).forEach(function (record) {
        rows.push({ text: source.label(record), view: function () { source.view(record); } });
      });
    });

    var heading = document.createElement("p");
    heading.className = "detail-item__label";
    heading.style.marginBottom = "6px";
    heading.textContent = "LINKED RECORDS (" + rows.length + ")";
    wrap.appendChild(heading);

    if (rows.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "12px";
      empty.textContent = "No Risks/Issues, RFIs, Meetings, Documents, Daily Log entries, or Change Orders are linked to this activity yet — link one from that record's own Add/Edit form.";
      wrap.appendChild(empty);
    } else {
      rows.forEach(function (row) {
        var rowEl = document.createElement("div");
        rowEl.style.display = "flex";
        rowEl.style.justifyContent = "space-between";
        rowEl.style.alignItems = "center";
        rowEl.style.fontSize = "13px";
        rowEl.style.marginBottom = "4px";

        var text = document.createElement("span");
        text.textContent = row.text;
        rowEl.appendChild(text);

        var viewBtn = document.createElement("button");
        viewBtn.className = "btn btn--ghost";
        viewBtn.textContent = "View";
        viewBtn.onclick = row.view;
        rowEl.appendChild(viewBtn);

        wrap.appendChild(rowEl);
      });
    }

    return wrap;
  }

  function renderActivityDetailPanel(container, activity, data, wbsItems, scheduleActivities, relationships, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";
    panel.style.borderColor = "var(--signal-amber)";

    var header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "flex-start";
    header.style.marginBottom = "10px";
    var heading = document.createElement("h3");
    heading.textContent = activity.name || "(unnamed activity)";
    header.appendChild(heading);
    var closeBtn = document.createElement("button");
    closeBtn.className = "btn btn--ghost";
    closeBtn.textContent = "Close";
    closeBtn.onclick = function () {
      uiState.ganttDetailActivityId = null;
      rerender();
    };
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var grid = document.createElement("div");
    grid.className = "detail-grid";

    function item(label, value) {
      var div = document.createElement("div");
      var l = document.createElement("span");
      l.className = "detail-item__label";
      l.textContent = label;
      var v = document.createElement("div");
      v.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
      div.appendChild(l);
      div.appendChild(v);
      grid.appendChild(div);
    }

    item("Activity ID", activity.external_id || activity.id);
    item("WBS", wbsName(wbsItems, activity.wbs_id));
    item("Type", ACTIVITY_TYPE_LABELS[activity.activity_type]);
    item("Status", ACTIVITY_STATUS_LABELS[activity.status]);
    item("Duration (days)", activity.duration);
    item("Remaining Duration (days)", activity.remaining_duration);
    item("Planned Start", activity.planned_start);
    item("Planned Finish", activity.planned_finish);
    item(
      "Float",
      activity.total_float == null
        ? "Not yet calculated"
        : activity.total_float <= 0
        ? "Critical (0 float)"
        : activity.total_float + " day(s) total, " + (activity.free_float == null ? "—" : activity.free_float) + " free"
    );
    item("% Complete", (activity.percent_complete || 0) + "%");
    item("Discipline", activity.discipline);
    item("Contractor", activity.contractor);
    item("Responsible Person", activity.responsible_person);
    item("Constraint", activity.constraint_type ? activity.constraint_type + (activity.constraint_date ? " (" + activity.constraint_date + ")" : "") : "");
    panel.appendChild(grid);

    if (activity.notes) {
      var notesP = document.createElement("p");
      notesP.style.marginTop = "10px";
      notesP.style.fontSize = "13px";
      notesP.innerHTML = "<strong>Notes:</strong> " + activity.notes;
      panel.appendChild(notesP);
    }

    var preds = relationships.filter(function (r) { return r.successor_id === activity.id; });
    var succs = relationships.filter(function (r) { return r.predecessor_id === activity.id; });

    var relWrap = document.createElement("div");
    relWrap.style.marginTop = "12px";
    relWrap.style.fontSize = "13px";
    var predLine = document.createElement("p");
    predLine.innerHTML =
      "<strong>Predecessors:</strong> " +
      (preds.length ? preds.map(function (r) { return activityName(scheduleActivities, r.predecessor_id) + " (" + r.type + (r.lag ? ", lag " + r.lag : "") + ")"; }).join(", ") : "none");
    var succLine = document.createElement("p");
    succLine.style.marginTop = "4px";
    succLine.innerHTML =
      "<strong>Successors:</strong> " +
      (succs.length ? succs.map(function (r) { return activityName(scheduleActivities, r.successor_id) + " (" + r.type + (r.lag ? ", lag " + r.lag : "") + ")"; }).join(", ") : "none");
    relWrap.appendChild(predLine);
    relWrap.appendChild(succLine);
    panel.appendChild(relWrap);

    panel.appendChild(renderLinkedRecordsSection(activity, data));

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "14px";

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--primary";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.tab = "activities";
      uiState.editingActivityId = activity.id;
      rerender();
    };
    actions.appendChild(editBtn);

    var addRelBtn = document.createElement("button");
    addRelBtn.className = "btn btn--ghost";
    addRelBtn.textContent = "+ Add Relationship";
    addRelBtn.disabled = scheduleActivities.length < 2;
    addRelBtn.onclick = function () {
      uiState.tab = "relationships";
      uiState.editingRelationshipId = "new";
      uiState.relationshipPrefillId = activity.id;
      rerender();
    };
    actions.appendChild(addRelBtn);

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      deleteActivityWithConfirm(activity, rerender);
    };
    actions.appendChild(deleteBtn);

    panel.appendChild(actions);
    container.appendChild(panel);
  }

  function renderGanttTab(container, data, rerender) {
    var schedule = data.schedules.find(function (s) {
      return s.id === uiState.scheduleId;
    });
    var allActivities = data.activities.filter(function (a) {
      return a.schedule_id === uiState.scheduleId;
    });
    var wbsItems = data.wbs_items.filter(function (w) {
      return w.schedule_id === uiState.scheduleId;
    });
    var relationships = data.relationships.filter(function (r) {
      return r.schedule_id === uiState.scheduleId;
    });

    renderGanttToolbar(container, data, allActivities, wbsItems, rerender);

    if (uiState.ganttDetailActivityId) {
      var detailActivity = allActivities.find(function (a) { return a.id === uiState.ganttDetailActivityId; });
      if (detailActivity) {
        renderActivityDetailPanel(container, detailActivity, data, wbsItems, allActivities, relationships, rerender);
      } else {
        uiState.ganttDetailActivityId = null;
      }
    }

    var referenceDate = (schedule && schedule.data_date) || todayIso();
    var nearCriticalThresholdDays = (schedule && schedule.near_critical_threshold_days) || 5;
    var activities = allActivities.filter(function (a) {
      return activityMatchesGanttFilter(a, wbsItems, Object.assign({ nearCriticalThresholdDays: nearCriticalThresholdDays }, uiState.ganttFilter), referenceDate);
    });

    var layout = window.PCC.scheduleGanttLayout.computeLayout(activities, {
      dataDate: schedule && schedule.data_date ? schedule.data_date : null,
    });

    if (layout.datedCount === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent =
        allActivities.length === 0
          ? "No activities in this schedule yet. Add some on the Activities tab first."
          : activities.length === 0
          ? "No activities match the current filters."
          : "None of this schedule's " + activities.length + " activity(ies) have a Planned Start/Finish " +
            "or a calculated date yet. Add planned dates on the Activities tab, or run “Calculate " +
            "Schedule” above.";
      container.appendChild(empty);
      return;
    }

    if (layout.undatedCount > 0) {
      var note = document.createElement("p");
      note.className = "text-secondary";
      note.style.fontSize = "12px";
      note.style.marginBottom = "10px";
      note.textContent =
        layout.undatedCount + " activity(ies) have no planned or calculated dates and aren't shown on the chart.";
      container.appendChild(note);
    }

    var diffDays = window.PCC.scheduleGanttLayout.diffDays;
    var bufferDays = 1;
    var totalSpanDays = diffDays(layout.rangeStart, layout.rangeEnd) + 1 + bufferDays * 2;
    var pxPerDay = ganttPxPerDay(totalSpanDays, uiState.ganttZoom === "auto" ? null : uiState.ganttZoom);
    var labelWidth = 200;
    var rowHeight = 26;
    var headerHeight = 28;
    var chartWidth = labelWidth + totalSpanDays * pxPerDay;
    var chartHeight = headerHeight + layout.rows.length * rowHeight + 6;

    function xForDate(iso) {
      return labelWidth + (diffDays(layout.rangeStart, iso) + bufferDays) * pxPerDay;
    }

    var wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.style.overflowX = "auto";
    wrap.style.overflowY = "auto";
    wrap.style.maxHeight = "70vh";

    var svg = svgEl("svg", { width: chartWidth, height: chartHeight, style: "display:block;" });

    // Axis gridlines + date labels, drawn first so bars/labels sit on top.
    var tickIntervalDays = ganttTickIntervalDays(totalSpanDays);
    for (var t = 0; t <= totalSpanDays; t += tickIntervalDays) {
      var tickIso = window.PCC.scheduleGanttLayout.addDays(layout.rangeStart, t - bufferDays);
      var tx = labelWidth + t * pxPerDay;
      svg.appendChild(
        svgEl("line", { x1: tx, y1: 0, x2: tx, y2: chartHeight, stroke: "var(--grid-line)", "stroke-width": 1 })
      );
      svg.appendChild(
        svgEl("text", { x: tx + 3, y: 12, "font-size": 10, fill: "var(--text-secondary)" })
      ).textContent = formatAxisDate(tickIso);
    }
    svg.appendChild(
      svgEl("line", { x1: labelWidth, y1: 0, x2: labelWidth, y2: chartHeight, stroke: "var(--divider)", "stroke-width": 1 })
    );

    // Data date marker, if the schedule has one set.
    if (layout.dataDate) {
      var ddx = xForDate(layout.dataDate);
      svg.appendChild(
        svgEl("line", {
          x1: ddx, y1: 0, x2: ddx, y2: chartHeight,
          stroke: "var(--signal-amber)", "stroke-width": 2, "stroke-dasharray": "4,3",
        })
      );
      var ddLabel = svgEl("text", { x: ddx + 4, y: headerHeight - 4, "font-size": 10, fill: "var(--signal-amber)", "font-weight": "600" });
      ddLabel.textContent = "Data Date";
      svg.appendChild(ddLabel);
    }

    // Today line — distinct from Data Date (Section 4/7's spec calls out both). Only
    // drawn when it falls inside the chart's own date range, same guard the Data Date
    // marker doesn't currently need since it's always derived from within the schedule.
    var todayMarkerIso = todayIso();
    if (todayMarkerIso >= layout.rangeStart && todayMarkerIso <= layout.rangeEnd) {
      var tdx = xForDate(todayMarkerIso);
      svg.appendChild(
        svgEl("line", { x1: tdx, y1: 0, x2: tdx, y2: chartHeight, stroke: "var(--status-on-track)", "stroke-width": 2 })
      );
      var tdLabel = svgEl("text", { x: tdx + 4, y: headerHeight - 16, "font-size": 10, fill: "var(--status-on-track)", "font-weight": "600" });
      tdLabel.textContent = "Today";
      svg.appendChild(tdLabel);
    }

    // Baseline ghost bars, drawn behind current bars — matched by external_id (falling
    // back to id) against the loaded snapshot, same precedence scheduleBaselineEngine.js
    // uses so a baseline captured before a re-import still lines up correctly.
    var baselineByMatchKey = {};
    if (uiState.ganttShowBaseline && uiState.ganttBaselineSnapshot && uiState.ganttBaselineSnapshot.baselineId === uiState.ganttBaselineId) {
      var baselineLayout = window.PCC.scheduleGanttLayout.computeLayout(uiState.ganttBaselineSnapshot.activities, {});
      baselineLayout.rows.forEach(function (r) {
        if (r.dateSource !== "none") baselineByMatchKey[matchKeyFor(r)] = r;
      });
    }

    layout.rows.forEach(function (row, i) {
      var y = headerHeight + i * rowHeight;
      var rowCenter = y + rowHeight / 2;
      var activity = activities.find(function (a) { return a.id === row.id; });

      var divider = svgEl("line", {
        x1: 0, y1: y + rowHeight, x2: chartWidth, y2: y + rowHeight,
        stroke: "var(--divider)", "stroke-width": 1,
      });
      svg.appendChild(divider);

      var labelText = svgEl("text", { x: 6, y: rowCenter + 4, "font-size": 11, fill: "var(--text-primary)", style: "cursor:pointer;" });
      labelText.textContent = truncateLabel(row.name, 26);
      var titleEl = svgEl("title");
      titleEl.textContent = row.name;
      labelText.appendChild(titleEl);
      labelText.addEventListener("click", function () {
        uiState.ganttDetailActivityId = row.id;
        rerender();
      });
      svg.appendChild(labelText);

      // Baseline ghost, if this row has a matched baseline activity — drawn as a thin
      // outline directly above/behind the current bar's row, before the current bar so
      // the current (authoritative) bar always paints on top.
      var baselineRow = baselineByMatchKey[matchKeyFor(activity || { id: row.id, external_id: null })];
      if (baselineRow && !baselineRow.isMilestone && !row.isMilestone) {
        var blBarX = xForDate(baselineRow.start);
        var blBarW = Math.max((baselineRow.durationDays || 0) * pxPerDay, 3);
        svg.appendChild(
          svgEl("rect", {
            x: blBarX, y: y + rowHeight - 7, width: blBarW, height: 4, rx: 2,
            fill: "none", stroke: "var(--text-secondary)", "stroke-width": 1.5, "stroke-dasharray": "2,2",
          })
        );
      }

      if (row.dateSource === "none") {
        var noneText = svgEl("text", { x: labelWidth + 4, y: rowCenter + 4, "font-size": 11, fill: "var(--text-secondary)", "font-style": "italic" });
        noneText.textContent = "No dates set";
        svg.appendChild(noneText);
        return;
      }

      var baseColor = row.isCritical
        ? "var(--status-critical)"
        : row.dateSource === "calculated"
        ? "var(--status-info)"
        : "var(--text-secondary)";

      if (row.isMilestone) {
        var cx = xForDate(row.start) + pxPerDay / 2;
        var size = 8;
        var diamond = svgEl("path", {
          d: "M " + cx + " " + (rowCenter - size) + " L " + (cx + size) + " " + rowCenter +
            " L " + cx + " " + (rowCenter + size) + " L " + (cx - size) + " " + rowCenter + " Z",
          fill: row.isCritical ? "var(--status-critical)" : "var(--signal-amber)",
          stroke: "var(--bg-paper)",
          "stroke-width": 1,
          "data-activity-id": row.id,
          style: "cursor:grab;",
        });
        svg.appendChild(diamond);
        if (activity) attachGanttDrag(diamond, null, activity, "move", pxPerDay, rerender);
        return;
      }

      var barX = xForDate(row.start);
      var barW = Math.max((row.durationDays || 0) * pxPerDay, 3);
      var barY = y + 5;
      var barH = rowHeight - 10;

      var barRect = svgEl("rect", {
        x: barX, y: barY, width: barW, height: barH, rx: 3,
        fill: baseColor, "fill-opacity": 0.28,
        stroke: baseColor, "stroke-width": 1,
        "stroke-dasharray": row.dateSource === "planned" ? "4,2" : "none",
        "data-activity-id": row.id,
        "data-base-width": barW,
        style: "cursor:grab;",
      });
      svg.appendChild(barRect);

      var progressRect = null;
      if (row.percentComplete > 0) {
        var progressW = Math.max(barW * Math.min(row.percentComplete, 100) / 100, row.percentComplete > 0 ? 2 : 0);
        progressRect = svgEl("rect", { x: barX, y: barY, width: progressW, height: barH, rx: 3, fill: baseColor, style: "pointer-events:none;" });
        svg.appendChild(progressRect);
      }

      if (activity) attachGanttDrag(barRect, progressRect, activity, "move", pxPerDay, rerender);

      // Resize handle: a narrow strip at the bar's right edge. Drawn after (on top of)
      // the bar so it captures the pointerdown for that sliver instead of the move
      // handler — no stopPropagation needed since SVG hit-testing only fires the
      // topmost element under the pointer.
      if (activity) {
        var handle = svgEl("rect", {
          x: barX + barW - 3, y: barY, width: 6, height: barH,
          fill: "transparent", style: "cursor:ew-resize;",
          "data-resize-handle-for": activity.id,
        });
        svg.appendChild(handle);
        attachGanttDrag(barRect, progressRect, activity, "resize", pxPerDay, rerender, handle);
      }
    });

    wrap.appendChild(svg);
    container.appendChild(wrap);

    // Jump controls — scroll the chart's own container to a meaningful date. Built
    // after the chart so xForDate/wrap are already in scope; appended to the toolbar
    // area visually via being placed right above the chart panel.
    var jumpBar = document.createElement("div");
    jumpBar.style.display = "flex";
    jumpBar.style.gap = "8px";
    jumpBar.style.marginTop = "10px";
    jumpBar.style.marginBottom = "-4px";
    jumpBar.style.flexWrap = "wrap";

    function jumpButton(label, iso) {
      var btn = document.createElement("button");
      btn.className = "btn btn--ghost";
      btn.textContent = label;
      btn.disabled = !iso || iso < layout.rangeStart || iso > layout.rangeEnd;
      btn.onclick = function () {
        wrap.scrollLeft = Math.max(0, xForDate(iso) - 80);
      };
      return btn;
    }

    jumpBar.appendChild(jumpButton("Today", todayMarkerIso >= layout.rangeStart && todayMarkerIso <= layout.rangeEnd ? todayMarkerIso : null));
    jumpBar.appendChild(jumpButton("Project Start", layout.rangeStart));
    jumpBar.appendChild(jumpButton("Project Finish", layout.rangeEnd));
    if (layout.dataDate) jumpBar.appendChild(jumpButton("Data Date", layout.dataDate));
    container.insertBefore(jumpBar, wrap);

    var legend = document.createElement("div");
    legend.style.display = "flex";
    legend.style.flexWrap = "wrap";
    legend.style.gap = "16px";
    legend.style.marginTop = "10px";
    legend.style.fontSize = "12px";

    function legendItem(colorCss, label, dashed) {
      var itemEl = document.createElement("span");
      itemEl.style.display = "inline-flex";
      itemEl.style.alignItems = "center";
      itemEl.style.gap = "6px";
      var swatch = document.createElement("span");
      swatch.style.width = "14px";
      swatch.style.height = "10px";
      swatch.style.borderRadius = "2px";
      swatch.style.background = colorCss;
      if (dashed) {
        swatch.style.background = "transparent";
        swatch.style.border = "1px dashed " + colorCss;
      }
      var text = document.createElement("span");
      text.className = "text-secondary";
      text.textContent = label;
      itemEl.appendChild(swatch);
      itemEl.appendChild(text);
      return itemEl;
    }

    legend.appendChild(legendItem("var(--status-critical)", "Critical (0 or negative float)"));
    legend.appendChild(legendItem("var(--status-info)", "Calculated"));
    legend.appendChild(legendItem("var(--text-secondary)", "Planned only — not yet calculated", true));
    legend.appendChild(legendItem("var(--signal-amber)", "Milestone"));
    if (layout.dataDate) legend.appendChild(legendItem("var(--signal-amber)", "Data Date", true));
    legend.appendChild(legendItem("var(--status-on-track)", "Today"));
    if (uiState.ganttShowBaseline) legend.appendChild(legendItem("var(--text-secondary)", "Baseline (ghost)", true));
    container.appendChild(legend);

    var dragHint = document.createElement("p");
    dragHint.className = "text-secondary";
    dragHint.style.fontSize = "11px";
    dragHint.style.marginTop = "6px";
    dragHint.textContent = "Drag a bar to move it, drag its right edge to resize, or click a bar/milestone/label to open its details. Every edit recalculates the schedule automatically.";
    container.appendChild(dragHint);
  }

  /** Gate 8 drag interaction. `targetEl` is the element being visually transformed
   * live during the drag (a bar rect or a milestone diamond); `progressEl` (bar-only)
   * gets the same translate so its fill tracks the bar during a move, and is hidden
   * during a resize since its width would otherwise read as stale until the drop
   * commits and a full rerender fixes it precisely. `hitEl`, when given (the resize
   * handle), is what actually receives the pointerdown — otherwise `targetEl` does.
   * pointermove/pointerup are attached to `window` rather than relying on
   * setPointerCapture (not implemented in every test/embed environment this app runs
   * in) so a fast drag that leaves the thin bar's hit area is never dropped. */
  function attachGanttDrag(targetEl, progressEl, activity, mode, pxPerDay, rerender, hitEl) {
    var CLICK_THRESHOLD_PX = 4;
    (hitEl || targetEl).addEventListener("pointerdown", function (e) {
      if (typeof e.button === "number" && e.button !== 0) return;
      var origStart = activity.planned_start || activity.early_start;
      var origFinish = activity.planned_finish || activity.early_finish;
      if (!origStart || !origFinish) return;
      e.preventDefault();
      e.stopPropagation();

      var startClientX = e.clientX;
      var baseWidth = Number(targetEl.getAttribute("data-base-width")) || Number(targetEl.getAttribute("width")) || 0;
      var moved = false;

      function onMove(ev) {
        var deltaPx = ev.clientX - startClientX;
        if (Math.abs(deltaPx) >= CLICK_THRESHOLD_PX) moved = true;
        var dayDelta = window.PCC.scheduleGanttLayout.daysFromPixelDelta(deltaPx, pxPerDay);
        var snappedPx = dayDelta * pxPerDay;
        if (mode === "move") {
          targetEl.setAttribute("transform", "translate(" + snappedPx + ",0)");
          if (progressEl) progressEl.setAttribute("transform", "translate(" + snappedPx + ",0)");
        } else {
          targetEl.setAttribute("width", Math.max(baseWidth + snappedPx, 3));
          if (progressEl) progressEl.style.display = "none";
        }
      }

      function onUp(ev) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        targetEl.removeAttribute("transform");
        if (progressEl) {
          progressEl.removeAttribute("transform");
          progressEl.style.display = "";
        }
        var deltaPx = ev.clientX - startClientX;
        var dayDelta = window.PCC.scheduleGanttLayout.daysFromPixelDelta(deltaPx, pxPerDay);

        if (!moved || dayDelta === 0) {
          uiState.ganttDetailActivityId = activity.id;
          rerender();
          return;
        }

        var result =
          mode === "move"
            ? window.PCC.scheduleGanttLayout.moveDates(origStart, origFinish, dayDelta)
            : window.PCC.scheduleGanttLayout.resizeFinish(origStart, origFinish, dayDelta);

        window.PCC.store.update(function (d) {
          var act = d.activities.find(function (x) { return x.id === activity.id; });
          if (!act) return;
          act.planned_start = result.start;
          act.planned_finish = result.finish;
          act.duration = window.PCC.scheduleGanttLayout.diffDays(result.start, result.finish);
          act.updated_at = new Date().toISOString();
        });
        window.PCC.notify(
          (mode === "move" ? "Moved “" : "Resized “") + activity.name + "” by " + Math.abs(dayDelta) + " day(s) — recalculating…",
          "success"
        );
        runCalculation(window.PCC.store.get(), rerender);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  // ---------------------------------------------------------------------------------
  // Baselines tab (Gate 4)
  // ---------------------------------------------------------------------------------

  /** Loads the stored snapshot for `baseline` from IndexedDB and runs the comparison
   * against whatever schedule is currently selected in the toolbar. "Current" is
   * deliberately the toolbar's selected schedule, not necessarily the schedule the
   * baseline was captured from \u2014 comparing a baseline against a later re-imported
   * revision (a different schedule_id) is the point; switch the schedule dropdown
   * above to compare against a different revision. */
  function runBaselineComparison(baseline, data, rerender) {
    uiState.baselineCompareId = baseline.id;
    uiState.baselineComparePending = true;
    uiState.baselineCompareResult = null;
    uiState.baselineCompareError = null;
    rerender();

    window.PCC.scheduleBaselineStore
      .getSnapshot(baseline.id)
      .then(function (snapshot) {
        if (!snapshot) {
          throw new Error("Baseline snapshot not found in storage.");
        }
        var currentWbsItems = data.wbs_items.filter(function (w) {
          return w.schedule_id === uiState.scheduleId;
        });
        var currentActivities = data.activities.filter(function (a) {
          return a.schedule_id === uiState.scheduleId;
        });
        var currentRelationships = data.relationships.filter(function (r) {
          return r.schedule_id === uiState.scheduleId;
        });
        uiState.baselineCompareResult = window.PCC.scheduleBaselineEngine.compareBaselineToCurrent(
          snapshot,
          currentWbsItems,
          currentActivities,
          currentRelationships
        );
        uiState.baselineComparePending = false;
        rerender();
      })
      .catch(function (err) {
        console.error("Could not load/compare baseline", err);
        uiState.baselineComparePending = false;
        uiState.baselineCompareError = "Could not load this baseline's stored data.";
        rerender();
      });
  }

  function renderBaselineCompareResult(container, result, currentScheduleName) {
    var s = result.summary;
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginTop = "10px";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h4");
    heading.style.marginBottom = "10px";
    heading.textContent = "Baseline vs Current \u2014 comparing against \u201c" + currentScheduleName + "\u201d";
    panel.appendChild(heading);

    var summaryLine = document.createElement("p");
    summaryLine.style.fontSize = "13px";
    summaryLine.style.marginBottom = "10px";
    var finishBit =
      s.project_finish_variance_days === null
        ? "Overall finish variance: not comparable (missing dates on one side)."
        : "Overall finish variance: " +
          (s.project_finish_variance_days > 0 ? "+" : "") +
          s.project_finish_variance_days +
          " day(s) (" +
          (s.project_finish_variance_days > 0 ? "later" : s.project_finish_variance_days < 0 ? "earlier" : "unchanged") +
          " than baseline).";
    summaryLine.innerHTML =
      s.activity_count_baseline + " activities in baseline \u00b7 " + s.activity_count_current + " in current \u00b7 " +
      s.added_count + " added \u00b7 " + s.removed_count + " removed" +
      (s.not_comparable_count ? " \u00b7 " + s.not_comparable_count + " not comparable (no calculated or planned dates)" : "") +
      "<br/>" + s.delayed_count + " delayed \u00b7 " + s.on_time_count + " on time \u00b7 " + s.ahead_count + " ahead" +
      (s.max_delay_days > 0 ? " \u00b7 worst slip: " + s.max_delay_days + " day(s)" : "") +
      "<br/>" + finishBit +
      (result.relationship_changes.added || result.relationship_changes.removed
        ? "<br/>Logic changes: " + result.relationship_changes.added + " added, " + result.relationship_changes.removed + " removed"
        : "");
    panel.appendChild(summaryLine);

    var changed = result.activities.matched
      .filter(function (m) {
        return m.comparable && (m.finish_variance_days !== 0 || m.criticality_changed);
      })
      .sort(function (a, b) {
        return Math.abs(b.finish_variance_days) - Math.abs(a.finish_variance_days);
      });

    if (changed.length > 0) {
      var table = document.createElement("div");
      table.className = "project-list";
      changed.slice(0, 50).forEach(function (m) {
        var row = document.createElement("div");
        row.className = "detail-card";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.marginBottom = "6px";

        var main = document.createElement("div");
        var varianceLabel =
          (m.finish_variance_days > 0 ? "+" : "") + m.finish_variance_days + " day(s)" +
          (m.mixed_date_sources ? " (baseline/current use different date sources \u2014 verify)" : "");
        main.innerHTML =
          "<strong>" + m.name + "</strong><br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          "Baseline finish: " + (m.baseline.finish || "\u2014") + " \u2192 Current finish: " + (m.current.finish || "\u2014") +
          " (" + varianceLabel + ")" +
          (m.criticality_changed ? " \u00b7 criticality changed" : "") +
          "</span>";
        row.appendChild(main);
        table.appendChild(row);
      });
      panel.appendChild(table);
      if (changed.length > 50) {
        var more = document.createElement("p");
        more.className = "text-secondary";
        more.style.fontSize = "12px";
        more.textContent = "+" + (changed.length - 50) + " more changed activities not shown.";
        panel.appendChild(more);
      }
    } else {
      var noChange = document.createElement("p");
      noChange.className = "text-secondary";
      noChange.style.fontSize = "13px";
      noChange.textContent = "No finish-date or criticality changes among matched activities.";
      panel.appendChild(noChange);
    }

    if (result.activities.added.length > 0 || result.activities.removed.length > 0) {
      var addRemoveNote = document.createElement("p");
      addRemoveNote.className = "text-secondary";
      addRemoveNote.style.fontSize = "12px";
      addRemoveNote.style.marginTop = "8px";
      addRemoveNote.textContent =
        (result.activities.added.length ? result.activities.added.length + " activities exist in current but not in baseline. " : "") +
        (result.activities.removed.length ? result.activities.removed.length + " activities exist in baseline but not in current." : "");
      panel.appendChild(addRemoveNote);
    }

    container.appendChild(panel);
  }

  function renderBaselinesTab(container, data, rerender) {
    var currentSchedule = data.schedules.find(function (s) {
      return s.id === uiState.scheduleId;
    });
    var currentScheduleName = currentSchedule ? currentSchedule.name : "(no schedule selected)";

    var baselines = data.schedule_baselines
      .filter(function (b) {
        return b.project_id === uiState.projectId;
      })
      .sort(function (a, b) {
        return new Date(b.captured_at) - new Date(a.captured_at);
      });

    if (baselines.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent =
        "No baselines saved for this project yet. Click \u201cSave Baseline\u201d above to freeze the " +
        "currently selected schedule's dates and logic for later comparison.";
      container.appendChild(empty);
      return;
    }

    var note = document.createElement("p");
    note.className = "text-secondary";
    note.style.fontSize = "12px";
    note.style.marginBottom = "10px";
    note.textContent =
      "Baselines from every schedule revision in this project. \u201cCompare\u201d checks a baseline " +
      "against whichever schedule is currently selected above.";
    container.appendChild(note);

    var list = document.createElement("div");
    list.className = "project-list";
    baselines.forEach(function (b) {
      var row = document.createElement("div");
      row.className = "detail-card";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "6px";

      var main = document.createElement("div");
      main.innerHTML =
        "<strong>" + b.name + "</strong><br/>" +
        "<span class='text-secondary' style='font-size:12px;'>" +
        "Captured " + new Date(b.captured_at).toLocaleString() + " \u00b7 " +
        b.activity_count + " activities \u00b7 from Rev " + b.schedule_revision_number +
        "</span>";
      row.appendChild(main);

      var actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      var compareBtn = document.createElement("button");
      compareBtn.className = "btn btn--ghost";
      compareBtn.disabled = !uiState.scheduleId;
      compareBtn.textContent =
        uiState.baselineCompareId === b.id && uiState.baselineComparePending
          ? "Comparing\u2026"
          : uiState.baselineCompareId === b.id
          ? "Hide Comparison"
          : "Compare to Current";
      compareBtn.onclick = function () {
        if (uiState.baselineCompareId === b.id && !uiState.baselineComparePending) {
          uiState.baselineCompareId = null;
          uiState.baselineCompareResult = null;
          rerender();
          return;
        }
        runBaselineComparison(b, data, rerender);
      };
      actions.appendChild(compareBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        if (!confirm('Delete baseline "' + b.name + '"? This cannot be undone.')) return;
        window.PCC.scheduleBaselineStore.deleteSnapshot(b.id).catch(function () {});
        window.PCC.store.update(function (d) {
          d.schedule_baselines = d.schedule_baselines.filter(function (item) {
            return item.id !== b.id;
          });
        });
        if (uiState.baselineCompareId === b.id) {
          uiState.baselineCompareId = null;
          uiState.baselineCompareResult = null;
        }
        window.PCC.notify("Baseline deleted.", "success");
        rerender();
      };
      actions.appendChild(deleteBtn);

      row.appendChild(actions);
      list.appendChild(row);

      if (uiState.baselineCompareId === b.id) {
        if (uiState.baselineComparePending) {
          var loading = document.createElement("p");
          loading.className = "text-secondary";
          loading.style.fontSize = "12px";
          loading.style.marginBottom = "10px";
          loading.textContent = "Loading stored baseline data\u2026";
          list.appendChild(loading);
        } else if (uiState.baselineCompareError) {
          var errP = document.createElement("p");
          errP.style.color = "var(--status-critical)";
          errP.style.fontSize = "13px";
          errP.textContent = uiState.baselineCompareError;
          list.appendChild(errP);
        } else if (uiState.baselineCompareResult) {
          renderBaselineCompareResult(list, uiState.baselineCompareResult, currentScheduleName);
        }
      }
    });
    container.appendChild(list);
  }

  // ---------------------------------------------------------------------------------
  // Top-level render
  // ---------------------------------------------------------------------------------

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    var h1 = document.createElement("h2");
    h1.textContent = "Schedule";
    h1.style.marginBottom = "6px";
    outlet.appendChild(h1);

    var gateNote = document.createElement("p");
    gateNote.className = "text-secondary";
    gateNote.style.fontSize = "12px";
    gateNote.style.marginBottom = "16px";
    gateNote.textContent =
      "Hand-enter activities, import from Excel, or calculate the critical path. " +
      "View the Gantt tab for a timeline, and save/compare baselines from the Baselines tab.";
    outlet.appendChild(gateNote);

    renderScheduleBar(outlet, data, rerender);

    if (uiState.importPanelOpen) {
      renderImportPanel(outlet, data, rerender);
    }

    if (uiState.editingScheduleId) {
      var schedBeingEdited =
        uiState.editingScheduleId === "new"
          ? window.PCC.store.newSchedule({})
          : data.schedules.find(function (s) {
              return s.id === uiState.editingScheduleId;
            });
      if (schedBeingEdited) renderScheduleForm(outlet, schedBeingEdited, data.projects, rerender);
    }

    if (!uiState.scheduleId) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = data.projects.filter(function (p) { return !p.archived; }).length === 0
        ? "Add a project in Portfolio first, then create a schedule against it."
        : "No schedule selected. Click \u201c+ New Schedule\u201d above to create one.";
      outlet.appendChild(empty);
      return;
    }

    var tabBar = document.createElement("div");
    tabBar.className = "tab-bar";
    tabBar.style.marginTop = "16px";

    [
      { key: "activities", label: "Activities" },
      { key: "gantt", label: "Gantt" },
      { key: "wbs", label: "WBS" },
      { key: "relationships", label: "Relationships" },
      { key: "baselines", label: "Baselines" },
    ].forEach(function (t) {
      var btn = document.createElement("button");
      btn.className = "tab-btn" + (uiState.tab === t.key ? " tab-btn--active" : "");
      btn.textContent = t.label;
      btn.onclick = function () {
        uiState.tab = t.key;
        uiState.editingActivityId = null;
        uiState.editingWbsId = null;
        uiState.editingRelationshipId = null;
        uiState.ganttDetailActivityId = null;
        rerender();
      };
      tabBar.appendChild(btn);
    });
    outlet.appendChild(tabBar);

    var tabContent = document.createElement("div");
    outlet.appendChild(tabContent);

    if (uiState.tab === "activities") renderActivitiesTab(tabContent, data, rerender);
    else if (uiState.tab === "gantt") renderGanttTab(tabContent, data, rerender);
    else if (uiState.tab === "wbs") renderWbsTab(tabContent, data, rerender);
    else if (uiState.tab === "relationships") renderRelationshipsTab(tabContent, data, rerender);
    else if (uiState.tab === "baselines") renderBaselinesTab(tabContent, data, rerender);
  }

  window.PCC.pages.schedule = render;
  window.PCC.schedule = {
    /** Gate 10: the reverse-navigation half of activity linking — every other
     * register's "View in Gantt" button calls this, then routes to #/schedule. Jumps
     * straight to the Gantt tab with that activity's own Detail Panel already open,
     * matching the same "land exactly on the linked record" convention every other
     * cross-module link in this app already follows (expandRisk/expandRfi/
     * expandMeeting/expandChangeOrder). */
    viewActivity: function (projectId, scheduleId, activityId) {
      uiState.projectId = projectId;
      uiState.scheduleId = scheduleId;
      uiState.tab = "gantt";
      uiState.ganttDetailActivityId = activityId;
    },
  };
})();
