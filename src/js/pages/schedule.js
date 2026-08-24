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
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var ACTIVITY_TYPE_LABELS = { task: "Task", milestone: "Milestone", summary: "Summary", wbs_summary: "WBS Summary" };
  var ACTIVITY_STATUS_LABELS = { not_started: "Not Started", in_progress: "In Progress", complete: "Complete", on_hold: "On Hold" };
  var RELATIONSHIP_TYPE_LABELS = { FS: "Finish-to-Start", SS: "Start-to-Start", FF: "Finish-to-Finish", SF: "Start-to-Finish" };
  var PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" };
  var RECOVERY_ACTION_STATUS_LABELS = { open: "Open", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
  function fmtMoney(amount) {
    if (amount === null || amount === undefined || amount === "" || isNaN(Number(amount))) return null;
    return Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  var DELAY_CAUSE_LABELS = {
    owner_caused: "Owner-Caused",
    contractor_caused: "Contractor-Caused",
    weather_force_majeure: "Weather / Force Majeure",
    design_rfi_driven: "Design / RFI-Driven",
    other: "Other",
  };

  var uiState = {
    projectId: "", // currently selected project \u2014 everything below scopes to this
    scheduleId: "", // currently selected schedule within that project
    tab: "activities", // 'activities' | 'wbs' | 'relationships' | 'baselines'
    editingScheduleId: null, // schedule id, or 'new', or null
    editingWbsId: null,
    editingActivityId: null,
    editingRelationshipId: null,
    activityFilter: "",
    // PCC Evolution Roadmap, Tier C: Delay & Recovery Management. Recovery action id
    // currently being added/edited in the Activity Detail Panel, or "new", or null.
    editingRecoveryActionId: null,
    // Gate 23: delay record id currently being added/edited in the Activity Detail
    // Panel, or "new", or null.
    editingDelayRecordId: null,
    // Gate 24: What-If Sandbox tab state. Purely in-memory and never persisted — see
    // renderWhatIfTab()'s own header comment for why this is a standalone exploration
    // tool rather than tied to any one Recovery Action.
    whatIfActivityId: "",
    whatIfReduceDays: "",
    whatIfResult: null,
    whatIfError: null,
    // Gate 4: baseline capture/compare. Baseline list is scoped to the selected
    // *project* (not the selected schedule) since comparing a baseline against a
    // later re-imported revision is the point \u2014 see scheduleBaselineEngine.js header.
    baselineSaving: false,
    baselineCompareId: null, // baseline id currently expanded for comparison, or null
    baselineComparePending: false,
    baselineCompareResult: null,
    baselineCompareError: null,
    // Gate 22: baseline id currently in inline-rename mode, or null.
    renamingBaselineId: null,
    // Gate 2 import flow
    importPanelOpen: false,
    importStep: "pick", // 'pick' | 'reviewing' | 'importing'
    importFile: null, // { name, size, hash, hashMethod, fileData } — fileData is a base64 data URI, stored via blobStore on commit
    importParsed: null, // result of scheduleImportService.parseRows()
    importDuplicateMatches: [], // schedules in this project that appear to be the same source file
    importDuplicateAcknowledged: false,
    importScheduleName: "",
    importError: null,
    importCommitting: false,
    // Gate 8 (interactive Gantt editing).
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
    // Gate 12: in-app Excel editor. The attached file (blobStore, keyed by schedule.id)
    // is edited as a grid of the recognized columns, then re-run through the same
    // scheduleImportService.parseRows() used at import time and applied back onto the
    // *same* schedule id — see renderExcelEditorPanel() below.
    excelEditorOpen: false,
    excelEditorScheduleId: null,
    excelEditorStep: "grid", // 'grid' | 'review'
    excelEditorRows: [], // [{ external_id, name, activity_type, wbs_code, wbs_name, duration, planned_start, planned_finish, predecessors, percent_complete, discipline, contractor, responsible_person, status, notes }]
    excelEditorHandAddedCount: 0, // activities on this schedule with no external_id — not shown in the grid, deleted if Apply proceeds
    excelEditorHandAddedAcknowledged: false,
    excelEditorReview: null, // result of scheduleImportService.parseRows() from the grid's current contents
    excelEditorError: null,
    excelEditorSaving: false,
    excelEditorNextNewSeq: 1, // suggested "NEW-N" external_id for rows added via "+ Add Row"
    // UI/UX Overhaul Gate 6 (Schedule): the Activities tab used to only offer text
    // search, even though the Gantt tab a few clicks away already computes WBS/status/
    // critical-path filtering over the exact same activity list — see
    // renderActivitiesTab()'s own comment for the gap this closes. Deliberately its own
    // small filter state (not shared with uiState.ganttFilter above) since Gantt's own
    // filter also carries chart-specific fields (discipline/contractor/responsiblePerson/
    // the "quick" bucket) that don't apply to this flat list view.
    activityFilterWbsId: "",
    activityFilterStatus: "",
    activityFilterCritical: false,
    // UI/UX Overhaul Gate 7 (Desktop/Laptop Productivity — Better Data Grids): Schedule
    // Activities became a real sortable <table> grid with a column-visibility toggle
    // and a frozen (pinned) Activity-name column, matching the brief's own literal
    // example table. Deliberately module-level uiState, not a persisted setting — same
    // "resets on reload" treatment every other per-page display preference in this app
    // already gets (uiState.tab, uiState.activityFilter, etc.), not a schema change.
    activitySortKey: null, // one of ACTIVITY_GRID_COLUMNS' keys, or null for insertion order
    activitySortDir: "asc", // 'asc' | 'desc'
    activityVisibleColumns: { wbs: true, type: true, start: true, finish: true, percent_complete: true, float: true, status: true },
    activityColumnsMenuOpen: false,
    activityRowMenuId: null, // activity id whose row-level "⋯" menu is open, or null
    // Daily-Use Audit Phase 4: click-to-edit directly on the grid for the four fields
    // changed most often day to day (status, start/finish date, % complete) — opening
    // the full Edit form just to bump a percentage was real daily friction the audit's
    // own Phase 4 request named. The Edit form (and everything else on it) is untouched
    // — this is purely a faster path for these four fields specifically.
    inlineEditActivityId: null, // activity id currently being inline-edited in the grid, or null
    inlineEditField: null, // 'status' | 'start' | 'finish' | 'percent_complete'
    // Daily-Use Audit Phase 4 ("Planner power tools" — bulk date-shift): { [activityId]:
    // true } for every checked row, same plain-object pattern the Phase 3 registers'
    // uiState.selectedIds already use.
    selectedActivityIds: {},
    bulkShiftDays: "",
    // Daily-Use Audit Phase 4 ("copy-activity"): set by the row menu's "Clone" item,
    // consumed once by renderActivitiesTab() the same way newActivityTypeHint already
    // is — see that field's own comment above.
    activityClonePrefill: null,
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
    if (!confirm('Delete activity "' + activity.name + '"? This also removes any relationships and recovery actions referencing it.')) return;
    window.PCC.store.update(function (data2) {
      data2.activities = data2.activities.filter(function (item) {
        return item.id !== activity.id;
      });
      data2.relationships = data2.relationships.filter(function (rel) {
        return rel.predecessor_id !== activity.id && rel.successor_id !== activity.id;
      });
      // Unlike risks/rfis/meetings/document requirements (which keep their own
      // independent life if their activity_id link goes stale), a recovery_action has
      // no existence apart from the activity it's recovering — it's only ever surfaced
      // via that activity's own Detail Panel, so leaving it behind would make it
      // permanently unreachable dead data rather than a visible "orphaned link."
      data2.recovery_actions = data2.recovery_actions.filter(function (r) {
        return r.activity_id !== activity.id;
      });
    });
    window.PCC.notify("Activity deleted.", "success");
    if (uiState.ganttDetailActivityId === activity.id) uiState.ganttDetailActivityId = null;
    rerender();
  }

  /** Daily-Use Audit Phase 4: shared commit path for the Activities grid's inline-edit
   * cells (status/start/finish/% complete) — same "find, Object.assign, stamp
   * updated_at" shape renderActivityForm()'s own submit handler already uses, just for
   * one field at a time instead of the whole form's worth. */
  function commitInlineActivityEdit(activityId, updates) {
    window.PCC.store.update(function (data) {
      var existing = data.activities.find(function (a) {
        return a.id === activityId;
      });
      if (existing) {
        Object.assign(existing, updates);
        existing.updated_at = new Date().toISOString();
      }
    });
  }

  // ---------------------------------------------------------------------------------
  // Schedule picker \u2014 project selector, schedule selector within it, "+ New Schedule"
  // ---------------------------------------------------------------------------------

  function renderScheduleForm(container, schedule, projects, rerender) {
    var isNew = uiState.editingScheduleId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
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

    var calcModeField = document.createElement("div");
    calcModeField.className = "field";
    calcModeField.innerHTML = "<label>Out-of-Sequence Calculation Mode</label>";
    var calcModeSelect = document.createElement("select");
    calcModeSelect.id = "schedfield-calculation_mode";
    var CALC_MODE_LABELS = { progress_override: "Progress Override (actual dates win)", retained_logic: "Retained Logic (respect predecessor tie)" };
    window.PCC.store.CALCULATION_MODES.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m;
      opt.textContent = CALC_MODE_LABELS[m] || m;
      calcModeSelect.appendChild(opt);
    });
    calcModeSelect.value = schedule.calculation_mode || "progress_override";
    calcModeField.appendChild(calcModeSelect);
    grid.appendChild(calcModeField);

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
    errorMsg.style.fontSize = "var(--text-sm)";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Schedule name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-3)";

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
        calculation_mode: form.querySelector("#schedfield-calculation_mode").value,
        status: form.querySelector("#schedfield-status").value,
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

  /** Base64-encodes an ArrayBuffer in fixed-size chunks (avoids both the slow
   * per-byte-string-concat path and the call-stack limit of spreading a huge typed
   * array into String.fromCharCode.apply at once). Same approach as documents.js's
   * copy of this helper \u2014 kept as a private per-module copy rather than a shared
   * utility, matching this codebase's existing convention (no shared utils module). */
  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunkSize = 8192;
    var chunks = [];
    for (var i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
    }
    return btoa(chunks.join(""));
  }

  var XLSX_MIME_TYPES = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
  };

  function resetImportState() {
    uiState.importPanelOpen = false;
    uiState.importStep = "pick";
    uiState.importFile = null;
    uiState.importParsed = null;
    uiState.importDuplicateMatches = [];
    uiState.importDuplicateAcknowledged = false;
    uiState.importScheduleName = "";
    uiState.importError = null;
    uiState.importCommitting = false;
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
      var fileDataUri = "data:" + (XLSX_MIME_TYPES[ext] || "application/octet-stream") + ";base64," + arrayBufferToBase64(buffer);

      window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
        uiState.importFile = { name: file.name, size: file.size, hash: fp.hash, hashMethod: fp.method, fileData: fileDataUri };
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

  /** Turns a scheduleImportService.parseRows() result into store-shaped WBS/Activity/
   * Relationship records for one schedule. Shared by commitImport (new schedule, Gate
   * 2) and applyExcelEdit (existing schedule, Gate 12) so both go through identical
   * construction logic \u2014 only the target schedule id and whether the records get
   * pushed as new vs. spliced in as a replacement differs between the two callers. */
  function buildScheduleRecords(parsed, projectId, scheduleId) {
    // WBS: create every parsed entry first so a code\u2192id map exists before wiring
    // parent_wbs_id \u2014 order of creation doesn't matter since parents are resolved by
    // code lookup afterward, not by creation sequence.
    var wbsCodeToId = {};
    var wbsItems = parsed.wbsEntries.map(function (w) {
      var item = window.PCC.store.newWbsItem({
        project_id: projectId,
        schedule_id: scheduleId,
        code: w.code,
        name: w.name,
        level: w.level,
      });
      wbsCodeToId[w.code] = item.id;
      return item;
    });
    wbsItems.forEach(function (item, i) {
      var parentCode = parsed.wbsEntries[i].parent_code;
      item.parent_wbs_id = parentCode ? wbsCodeToId[parentCode] || null : null;
    });

    var externalIdToActivityId = {};
    var activities = parsed.activities.map(function (a) {
      var activity = window.PCC.store.newActivity({
        project_id: projectId,
        schedule_id: scheduleId,
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

    var relationships = parsed.relationships.map(function (r) {
      return window.PCC.store.newRelationship({
        schedule_id: scheduleId,
        predecessor_id: externalIdToActivityId[r.predecessor_external_id],
        successor_id: externalIdToActivityId[r.successor_external_id],
        type: r.type,
        lag: r.lag,
      });
    });

    return { wbsItems: wbsItems, activities: activities, relationships: relationships };
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

    var records = buildScheduleRecords(parsed, uiState.projectId, newSchedule.id);

    uiState.importCommitting = true;
    uiState.importError = null;

    function finishImport() {
      var supersededCount = 0;
      window.PCC.store.update(function (d) {
        // Gate 22 (PCC Evolution Roadmap, Tier F: Baseline & Schedule Revision
        // Control): a fresh import is a new revision superseding whatever was active
        // for this project before it \u2014 auto-flip rather than leave every past
        // revision "active" forever waiting on a manual edit nobody remembers to make.
        // Only "active" revisions are touched; "draft"/"archived" are left as the user
        // set them, and this is scoped to import only (the manual "New Schedule" path
        // doesn't get this treatment \u2014 creating one by hand isn't "replacing" anything).
        d.schedules.forEach(function (s) {
          if (s.project_id === uiState.projectId && s.status === "active") {
            s.status = "superseded";
            s.updated_at = new Date().toISOString();
            supersededCount++;
          }
        });
        d.schedules.push(newSchedule);
        d.wbs_items = d.wbs_items.concat(records.wbsItems);
        d.activities = d.activities.concat(records.activities);
        d.relationships = d.relationships.concat(records.relationships);
      });

      window.PCC.notify(
        "Imported " + records.activities.length + " activities as a new schedule (Rev " + nextRevision +
          ")." + (supersededCount > 0 ? " " + supersededCount + " prior active revision(s) marked Superseded." : "") +
          " The original Excel file is attached \u2014 use \u201cEdit Excel\u201d to update it in place.",
        "success"
      );

      uiState.scheduleId = newSchedule.id;
      uiState.tab = "activities";
      resetImportState();
      rerender();
    }

    // Store the original file first (same precedent as documents.js's Save Document
    // handler): if IndexedDB write fails, nothing is written to the main store either,
    // rather than leaving a schedule record that claims a source file that isn't there.
    window.PCC.blobStore
      .putBlob(newSchedule.id, uiState.importFile.fileData)
      .then(finishImport)
      .catch(function (e) {
        uiState.importCommitting = false;
        uiState.importError = "Could not store the original Excel file: " + e.message;
        rerender();
      });
  }

  /** Renders a collapsible list of a parseRows() result's errors/warnings, or null if
   * there's nothing to show. Shared by the Import review step and the Excel-editor
   * review step so the two stay visually identical rather than drifting apart. */
  function renderParsedIssuesToggle(parsed) {
    var summary = parsed.summary;
    if (summary.warnings === 0 && summary.errors === 0) return null;

    var issuesToggle = document.createElement("details");
    issuesToggle.style.marginBottom = "var(--space-3)";
    var summaryTag = document.createElement("summary");
    summaryTag.style.cursor = "pointer";
    summaryTag.style.fontSize = "var(--text-sm)";
    summaryTag.textContent = "View " + (summary.errors + summary.warnings) + " issue(s)";
    issuesToggle.appendChild(summaryTag);
    var issuesList = document.createElement("div");
    issuesList.style.maxHeight = "220px";
    issuesList.style.overflowY = "auto";
    issuesList.style.marginTop = "var(--space-2)";
    parsed.errors.forEach(function (e) {
      var p = document.createElement("p");
      p.style.fontSize = "var(--text-sm)";
      p.style.color = "var(--status-critical)";
      p.textContent = (e.row ? "Row " + e.row + ": " : "") + e.message;
      issuesList.appendChild(p);
    });
    parsed.warnings.forEach(function (w) {
      var p = document.createElement("p");
      p.style.fontSize = "var(--text-sm)";
      p.style.color = "var(--status-at-risk)";
      p.textContent = (w.row ? "Row " + w.row + ": " : "") + w.message;
      issuesList.appendChild(p);
    });
    issuesToggle.appendChild(issuesList);
    return issuesToggle;
  }

  function renderImportPanel(container, data, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-3)";
    heading.textContent = "Import Schedule from Excel";
    panel.appendChild(heading);

    if (uiState.importStep === "pick") {
      var help = document.createElement("p");
      help.className = "text-secondary";
      help.style.fontSize = "var(--text-sm)";
      help.style.marginBottom = "var(--space-3)";
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
        err.style.fontSize = "var(--text-sm)";
        err.style.marginTop = "var(--space-2)";
        err.textContent = uiState.importError;
        panel.appendChild(err);
      }

      var cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn--ghost";
      cancelBtn.style.marginTop = "var(--space-3)";
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
        dupBox.style.borderRadius = "var(--radius-md)";
        dupBox.style.padding = "var(--space-3)";
        dupBox.style.marginBottom = "var(--space-4)";
        dupBox.style.background = "rgba(214, 158, 46, 0.08)";
        var dupTitle = document.createElement("p");
        dupTitle.style.fontWeight = "600";
        dupTitle.style.fontSize = "var(--text-sm)";
        dupTitle.textContent = "This file looks like it may have been imported before";
        dupBox.appendChild(dupTitle);
        uiState.importDuplicateMatches.forEach(function (m) {
          var line = document.createElement("p");
          line.style.fontSize = "var(--text-sm)";
          line.style.marginTop = "var(--space-2)";
          line.innerHTML =
            "<strong>" + m.record.name + "</strong> (Rev " + m.record.revision_number + ") \u2014 imported " +
            (m.record.import_date ? new Date(m.record.import_date).toLocaleDateString() : "unknown date") +
            "<br/><span class='text-secondary'>" + m.reason + "</span>";
          dupBox.appendChild(line);
        });
        var dupActions = document.createElement("div");
        dupActions.style.display = "flex";
        dupActions.style.gap = "var(--space-3)";
        dupActions.style.marginTop = "var(--space-3)";
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
      summaryLine.style.fontSize = "var(--text-base)";
      summaryLine.style.fontWeight = "600";
      summaryLine.style.marginBottom = "var(--space-1)";
      summaryLine.textContent =
        "Parsed " + summary.total_rows + " row(s) \u2014 " + summary.imported + " activities will be imported, " +
        summary.warnings + " warning(s), " + summary.errors + " error(s).";
      panel.appendChild(summaryLine);

      if (summary.errors > 0) {
        var errNote = document.createElement("p");
        errNote.className = "text-secondary";
        errNote.style.fontSize = "var(--text-sm)";
        errNote.style.marginBottom = "var(--space-3)";
        errNote.textContent = "Rows with errors are excluded entirely \u2014 fix them in the source file and re-import if needed.";
        panel.appendChild(errNote);
      }

      var issuesToggle = renderParsedIssuesToggle(parsed);
      if (issuesToggle) panel.appendChild(issuesToggle);

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
      actions.style.gap = "var(--space-3)";
      actions.style.marginTop = "var(--space-4)";

      var confirmBtn = document.createElement("button");
      confirmBtn.className = "btn btn--primary";
      confirmBtn.textContent = uiState.importCommitting ? "Saving…" : "Confirm Import (" + summary.imported + " activities)";
      confirmBtn.disabled =
        summary.imported === 0 ||
        uiState.importCommitting ||
        (uiState.importDuplicateMatches.length > 0 && !uiState.importDuplicateAcknowledged);
      confirmBtn.onclick = function () {
        commitImport(data, rerender);
      };
      actions.appendChild(confirmBtn);

      var cancelReviewBtn = document.createElement("button");
      cancelReviewBtn.className = "btn btn--ghost";
      cancelReviewBtn.textContent = "Cancel";
      cancelReviewBtn.disabled = uiState.importCommitting;
      cancelReviewBtn.onclick = function () {
        resetImportState();
        rerender();
      };
      actions.appendChild(cancelReviewBtn);

      panel.appendChild(actions);

      if (uiState.importError) {
        var reviewErr = document.createElement("p");
        reviewErr.style.color = "var(--status-critical)";
        reviewErr.style.fontSize = "var(--text-sm)";
        reviewErr.style.marginTop = "var(--space-3)";
        reviewErr.textContent = uiState.importError;
        panel.appendChild(reviewErr);
      }
    }

    container.appendChild(panel);
  }

  // ---------------------------------------------------------------------------------
  // Gate 12 — in-app Excel editor. Only offered on schedules that came from an Excel
  // import (source_file_name set — see commitImport above), since the whole pipeline
  // below re-runs scheduleImportService.parseRows() the same way import does, and that
  // requires every row to carry an Activity ID the way an imported activity always
  // does. Hand-built (Gate 1 CRUD) activities have no external_id and so aren't
  // representable in the grid — see the hand-added-activity guard in
  // renderExcelReviewStep()/applyExcelEdits() below.
  // ---------------------------------------------------------------------------------

  var EXCEL_GRID_FIELDS = window.PCC.scheduleImportService.CANONICAL_HEADERS;

  function resetExcelEditorState() {
    uiState.excelEditorOpen = false;
    uiState.excelEditorScheduleId = null;
    uiState.excelEditorStep = "grid";
    uiState.excelEditorRows = [];
    uiState.excelEditorReview = null;
    uiState.excelEditorHandAddedAcknowledged = false;
    uiState.excelEditorError = null;
    uiState.excelEditorSaving = false;
    uiState.excelEditorNextNewSeq = 1;
  }

  /** Reconstructs the "A010FS+2,A020" predecessor token string for one activity from
   * the schedule's relationship records, the same format parseRows() expects on the
   * way back in. A predecessor with no external_id (a hand-added activity — see the
   * module comment above) can't be expressed in this format and is silently dropped
   * from the string; the hand-added-activity guard elsewhere is what surfaces that
   * loss to the user before they commit to it, so this function doesn't need to. */
  function buildPredecessorsString(activity, relationships, activitiesById) {
    var tokens = relationships
      .filter(function (r) {
        return r.successor_id === activity.id;
      })
      .map(function (r) {
        var pred = activitiesById[r.predecessor_id];
        if (!pred || !pred.external_id) return null;
        var token = pred.external_id;
        if (r.type && r.type !== "FS") token += r.type;
        if (r.lag) token += (r.lag > 0 ? "+" : "") + r.lag;
        return token;
      })
      .filter(function (t) {
        return t;
      });
    return tokens.join(",");
  }

  /** Builds the editable grid's row data from the schedule's CURRENT Activities/WBS/
   * Relationships — not by re-reading the attached file's bytes. This means the grid
   * always reflects whatever's live in the schedule (including any prior Apply), and
   * the attached Excel file is kept as a byproduct of Apply rather than the source of
   * truth read on every open. */
  function openExcelEditor(schedule, data, rerender) {
    var wbsById = {};
    data.wbs_items
      .filter(function (w) {
        return w.schedule_id === schedule.id;
      })
      .forEach(function (w) {
        wbsById[w.id] = w;
      });
    var activitiesById = {};
    data.activities
      .filter(function (a) {
        return a.schedule_id === schedule.id;
      })
      .forEach(function (a) {
        activitiesById[a.id] = a;
      });
    var relationships = data.relationships.filter(function (r) {
      return r.schedule_id === schedule.id;
    });

    uiState.excelEditorRows = data.activities
      .filter(function (a) {
        return a.schedule_id === schedule.id && a.external_id;
      })
      .map(function (a) {
        var wbs = a.wbs_id ? wbsById[a.wbs_id] : null;
        return {
          external_id: a.external_id || "",
          name: a.name || "",
          activity_type: a.activity_type || "task",
          wbs_code: wbs ? wbs.code : "",
          wbs_name: wbs ? wbs.name : "",
          duration: a.duration != null ? String(a.duration) : "",
          planned_start: a.planned_start || "",
          planned_finish: a.planned_finish || "",
          predecessors: buildPredecessorsString(a, relationships, activitiesById),
          percent_complete: a.percent_complete != null ? String(a.percent_complete) : "",
          discipline: a.discipline || "",
          contractor: a.contractor || "",
          responsible_person: a.responsible_person || "",
          status: a.status || "not_started",
          notes: a.notes || "",
        };
      });

    uiState.excelEditorOpen = true;
    uiState.excelEditorScheduleId = schedule.id;
    uiState.excelEditorStep = "grid";
    uiState.excelEditorReview = null;
    uiState.excelEditorHandAddedAcknowledged = false;
    uiState.excelEditorError = null;
    uiState.excelEditorNextNewSeq = 1;
    rerender();
  }

  /** Grid cells are read from the DOM only when something needs their current values
   * (adding/deleting a row, or Review Changes) — not on every keystroke — for the same
   * reason renderScheduleForm() above reads its fields at submit time instead of
   * tracking each input in uiState: a full outlet re-render on every keystroke would
   * blow away focus/cursor position mid-edit. */
  function syncExcelEditorRowsFromDom() {
    uiState.excelEditorRows.forEach(function (row, i) {
      EXCEL_GRID_FIELDS.forEach(function (f) {
        var el = document.getElementById("excelgrid-" + i + "-" + f.key);
        if (el) row[f.key] = el.value;
      });
    });
  }

  function excelCellControl(rowIndex, field, value) {
    var id = "excelgrid-" + rowIndex + "-" + field.key;
    if (field.key === "activity_type") {
      var typeSelect = document.createElement("select");
      typeSelect.id = id;
      typeSelect.style.width = "100%";
      ["task", "milestone", "summary", "wbs_summary"].forEach(function (k) {
        var opt = document.createElement("option");
        opt.value = k;
        opt.textContent = ACTIVITY_TYPE_LABELS[k];
        typeSelect.appendChild(opt);
      });
      typeSelect.value = value || "task";
      return typeSelect;
    }
    if (field.key === "status") {
      var statusSelect = document.createElement("select");
      statusSelect.id = id;
      statusSelect.style.width = "100%";
      Object.keys(ACTIVITY_STATUS_LABELS).forEach(function (k) {
        var opt = document.createElement("option");
        opt.value = k;
        opt.textContent = ACTIVITY_STATUS_LABELS[k];
        statusSelect.appendChild(opt);
      });
      statusSelect.value = value || "not_started";
      return statusSelect;
    }
    var input = document.createElement("input");
    input.id = id;
    input.value = value || "";
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    if (field.key === "planned_start" || field.key === "planned_finish") input.type = "date";
    else if (field.key === "duration" || field.key === "percent_complete") {
      input.type = "number";
      input.step = "any";
    } else input.type = "text";
    return input;
  }

  function renderExcelGridStep(panel, schedule, data, rerender) {
    var gridActions = document.createElement("div");
    gridActions.style.display = "flex";
    gridActions.style.gap = "var(--space-3)";
    gridActions.style.marginBottom = "var(--space-3)";

    var addRowBtn = document.createElement("button");
    addRowBtn.type = "button";
    addRowBtn.className = "btn btn--ghost";
    addRowBtn.textContent = "+ Add Row";
    addRowBtn.onclick = function () {
      syncExcelEditorRowsFromDom();
      var seq = uiState.excelEditorNextNewSeq++;
      uiState.excelEditorRows.push({
        external_id: "NEW-" + seq,
        name: "",
        activity_type: "task",
        wbs_code: "",
        wbs_name: "",
        duration: "",
        planned_start: "",
        planned_finish: "",
        predecessors: "",
        percent_complete: "",
        discipline: "",
        contractor: "",
        responsible_person: "",
        status: "not_started",
        notes: "",
      });
      rerender();
    };
    gridActions.appendChild(addRowBtn);
    panel.appendChild(gridActions);

    if (uiState.excelEditorRows.length === 0) {
      var emptyNote = document.createElement("p");
      emptyNote.className = "text-secondary";
      emptyNote.style.fontSize = "var(--text-sm)";
      emptyNote.style.marginBottom = "var(--space-3)";
      emptyNote.textContent = "No activities from the original Excel file remain on this schedule. Click “+ Add Row” to start adding some, or Close and use the Activities tab instead.";
      panel.appendChild(emptyNote);
    }

    var tableWrap = document.createElement("div");
    tableWrap.style.overflowX = "auto";
    tableWrap.style.maxHeight = "440px";
    tableWrap.style.overflowY = "auto";
    tableWrap.style.border = "1px solid var(--divider)";
    tableWrap.style.borderRadius = "var(--radius-sm)";
    tableWrap.style.marginBottom = "var(--space-3)";

    var table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    table.style.fontSize = "var(--text-sm)";

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    EXCEL_GRID_FIELDS.forEach(function (f) {
      var th = document.createElement("th");
      th.textContent = f.label;
      th.style.textAlign = "left";
      th.style.padding = "var(--space-2) var(--space-2)";
      th.style.borderBottom = "1px solid var(--divider)";
      th.style.position = "sticky";
      th.style.top = "0";
      th.style.backgroundColor = "var(--bg-paper-raised)";
      th.style.whiteSpace = "nowrap";
      headRow.appendChild(th);
    });
    var thActions = document.createElement("th");
    thActions.style.borderBottom = "1px solid var(--divider)";
    thActions.style.position = "sticky";
    thActions.style.top = "0";
    thActions.style.backgroundColor = "var(--bg-paper-raised)";
    headRow.appendChild(thActions);
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    uiState.excelEditorRows.forEach(function (row, i) {
      var tr = document.createElement("tr");
      EXCEL_GRID_FIELDS.forEach(function (f) {
        var td = document.createElement("td");
        td.style.padding = "3px 6px";
        td.style.borderBottom = "1px solid var(--divider)";
        td.style.minWidth = f.key === "name" || f.key === "notes" ? "160px" : "110px";
        td.appendChild(excelCellControl(i, f, row[f.key]));
        tr.appendChild(td);
      });
      var tdActions = document.createElement("td");
      tdActions.style.padding = "3px 6px";
      tdActions.style.borderBottom = "1px solid var(--divider)";
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--ghost";
      delBtn.style.padding = "2px var(--space-2)";
      delBtn.title = "Delete row";
      delBtn.textContent = "×";
      delBtn.onclick = function () {
        syncExcelEditorRowsFromDom();
        uiState.excelEditorRows.splice(i, 1);
        rerender();
      };
      tdActions.appendChild(delBtn);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    panel.appendChild(tableWrap);

    var bottomActions = document.createElement("div");
    bottomActions.style.display = "flex";
    bottomActions.style.gap = "var(--space-3)";

    var reviewBtn = document.createElement("button");
    reviewBtn.type = "button";
    reviewBtn.className = "btn btn--primary";
    reviewBtn.textContent = "Review Changes";
    reviewBtn.onclick = function () {
      syncExcelEditorRowsFromDom();
      var headerLabels = EXCEL_GRID_FIELDS.map(function (f) {
        return f.label;
      });
      var rowArrays = uiState.excelEditorRows.map(function (row) {
        return EXCEL_GRID_FIELDS.map(function (f) {
          return row[f.key] || "";
        });
      });
      uiState.excelEditorReview = window.PCC.scheduleImportService.parseRows(headerLabels, rowArrays);
      uiState.excelEditorStep = "review";
      rerender();
    };
    bottomActions.appendChild(reviewBtn);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn--ghost";
    closeBtn.textContent = "Close";
    closeBtn.onclick = function () {
      resetExcelEditorState();
      rerender();
    };
    bottomActions.appendChild(closeBtn);
    panel.appendChild(bottomActions);

    if (uiState.excelEditorError) {
      var gridErr = document.createElement("p");
      gridErr.style.color = "var(--status-critical)";
      gridErr.style.fontSize = "var(--text-sm)";
      gridErr.style.marginTop = "var(--space-3)";
      gridErr.textContent = uiState.excelEditorError;
      panel.appendChild(gridErr);
    }
  }

  function renderExcelReviewStep(panel, schedule, data, rerender) {
    var parsed = uiState.excelEditorReview;
    var summary = parsed.summary;
    var handAdded = data.activities.filter(function (a) {
      return a.schedule_id === schedule.id && !a.external_id;
    });
    var blockedByHandAdded = handAdded.length > 0 && !uiState.excelEditorHandAddedAcknowledged;

    if (blockedByHandAdded) {
      var warnBox = document.createElement("div");
      warnBox.style.border = "1px solid var(--status-at-risk)";
      warnBox.style.borderRadius = "var(--radius-md)";
      warnBox.style.padding = "var(--space-3)";
      warnBox.style.marginBottom = "var(--space-4)";
      warnBox.style.background = "rgba(214, 158, 46, 0.08)";
      var warnTitle = document.createElement("p");
      warnTitle.style.fontWeight = "600";
      warnTitle.style.fontSize = "var(--text-sm)";
      warnTitle.textContent =
        handAdded.length + " activit" + (handAdded.length === 1 ? "y" : "ies") + " on this schedule " +
        (handAdded.length === 1 ? "isn’t" : "aren’t") + " from the Excel file";
      warnBox.appendChild(warnTitle);
      var warnBody = document.createElement("p");
      warnBody.style.fontSize = "var(--text-sm)";
      warnBody.style.marginTop = "var(--space-2)";
      warnBody.textContent =
        "They were added by hand on the Activities tab and have no Activity ID, so they can't appear in this " +
        "grid. Applying replaces this schedule's full activity list from the grid, so continuing will delete them.";
      warnBox.appendChild(warnBody);
      var warnActions = document.createElement("div");
      warnActions.style.display = "flex";
      warnActions.style.gap = "var(--space-3)";
      warnActions.style.marginTop = "var(--space-3)";
      var ackBtn = document.createElement("button");
      ackBtn.type = "button";
      ackBtn.className = "btn btn--ghost";
      ackBtn.textContent = "Delete Them and Continue";
      ackBtn.onclick = function () {
        uiState.excelEditorHandAddedAcknowledged = true;
        rerender();
      };
      var backFromWarnBtn = document.createElement("button");
      backFromWarnBtn.type = "button";
      backFromWarnBtn.className = "btn btn--ghost";
      backFromWarnBtn.textContent = "Back to Grid";
      backFromWarnBtn.onclick = function () {
        uiState.excelEditorStep = "grid";
        rerender();
      };
      warnActions.appendChild(ackBtn);
      warnActions.appendChild(backFromWarnBtn);
      warnBox.appendChild(warnActions);
      panel.appendChild(warnBox);
    }

    var summaryLine = document.createElement("p");
    summaryLine.style.fontSize = "var(--text-base)";
    summaryLine.style.fontWeight = "600";
    summaryLine.style.marginBottom = "var(--space-1)";
    summaryLine.textContent =
      summary.imported + " activit" + (summary.imported === 1 ? "y" : "ies") + " will be applied to this schedule, " +
      summary.warnings + " warning(s), " + summary.errors + " error(s).";
    panel.appendChild(summaryLine);

    if (summary.errors > 0) {
      var errNote = document.createElement("p");
      errNote.className = "text-secondary";
      errNote.style.fontSize = "var(--text-sm)";
      errNote.style.marginBottom = "var(--space-3)";
      errNote.textContent = "Rows with errors are excluded entirely — go back, fix them in the grid, and click Review Changes again.";
      panel.appendChild(errNote);
    }

    var issuesToggle = renderParsedIssuesToggle(parsed);
    if (issuesToggle) panel.appendChild(issuesToggle);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-4)";

    var applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "btn btn--primary";
    applyBtn.textContent = uiState.excelEditorSaving ? "Applying…" : "Apply to Schedule (" + summary.imported + " activities)";
    applyBtn.disabled = summary.imported === 0 || uiState.excelEditorSaving || blockedByHandAdded;
    applyBtn.onclick = function () {
      applyExcelEdits(schedule, data, rerender);
    };
    actions.appendChild(applyBtn);

    var backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "btn btn--ghost";
    backBtn.textContent = "Back to Grid";
    backBtn.disabled = uiState.excelEditorSaving;
    backBtn.onclick = function () {
      uiState.excelEditorStep = "grid";
      rerender();
    };
    actions.appendChild(backBtn);

    panel.appendChild(actions);

    if (uiState.excelEditorError) {
      var reviewErr = document.createElement("p");
      reviewErr.style.color = "var(--status-critical)";
      reviewErr.style.fontSize = "var(--text-sm)";
      reviewErr.style.marginTop = "var(--space-3)";
      reviewErr.textContent = uiState.excelEditorError;
      panel.appendChild(reviewErr);
    }
  }

  /** Regenerates the attached Excel file from exactly the header/row data that was
   * just parsed (same values shown in the review step), so the stored file always
   * matches what Apply actually committed — never a stale copy of the pre-edit file
   * or a copy of grid contents that got rejected as errors. */
  function applyExcelEdits(schedule, data, rerender) {
    var parsed = uiState.excelEditorReview;
    if (!parsed) return;

    var headerLabels = EXCEL_GRID_FIELDS.map(function (f) {
      return f.label;
    });
    var rowArrays = uiState.excelEditorRows.map(function (row) {
      return EXCEL_GRID_FIELDS.map(function (f) {
        return row[f.key] || "";
      });
    });

    var workbook = window.XLSX.utils.book_new();
    var sheet = window.XLSX.utils.aoa_to_sheet([headerLabels].concat(rowArrays));
    window.XLSX.utils.book_append_sheet(workbook, sheet, "Schedule");
    var wbBuffer = window.XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    var fileDataUri = "data:" + XLSX_MIME_TYPES.xlsx + ";base64," + arrayBufferToBase64(wbBuffer);

    var records = buildScheduleRecords(parsed, schedule.project_id, schedule.id);

    uiState.excelEditorSaving = true;
    uiState.excelEditorError = null;

    window.PCC.blobStore
      .putBlob(schedule.id, fileDataUri)
      .then(function () {
        window.PCC.store.update(function (d) {
          d.wbs_items = d.wbs_items.filter(function (w) {
            return w.schedule_id !== schedule.id;
          });
          d.activities = d.activities.filter(function (a) {
            return a.schedule_id !== schedule.id;
          });
          d.relationships = d.relationships.filter(function (r) {
            return r.schedule_id !== schedule.id;
          });
          d.wbs_items = d.wbs_items.concat(records.wbsItems);
          d.activities = d.activities.concat(records.activities);
          d.relationships = d.relationships.concat(records.relationships);

          var sched = d.schedules.find(function (s) {
            return s.id === schedule.id;
          });
          if (sched) {
            sched.source_file_size = wbBuffer.byteLength;
            sched.updated_at = new Date().toISOString();
          }
        });

        window.PCC.notify(
          "Schedule updated from the edited Excel (" + records.activities.length + " activities). " +
            "The attached file was updated to match.",
          "success"
        );

        uiState.excelEditorSaving = false;
        resetExcelEditorState();
        uiState.tab = "activities";
        rerender();
      })
      .catch(function (e) {
        uiState.excelEditorSaving = false;
        uiState.excelEditorError = "Could not save changes: " + e.message;
        rerender();
      });
  }

  function renderExcelEditorPanel(container, data, rerender) {
    var schedule = data.schedules.find(function (s) {
      return s.id === uiState.excelEditorScheduleId;
    });
    if (!schedule) {
      resetExcelEditorState();
      return;
    }

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-3)";
    heading.textContent = "Edit Excel — " + schedule.name;
    panel.appendChild(heading);

    var help = document.createElement("p");
    help.className = "text-secondary";
    help.style.fontSize = "var(--text-sm)";
    help.style.marginBottom = "var(--space-3)";
    help.textContent =
      "Editing here updates the attached Excel file and this schedule's Activities/WBS/Relationships together — " +
      "no separate download or re-upload needed. Recognized columns only (same set as Import); extra columns " +
      "from the original file aren't shown.";
    panel.appendChild(help);

    if (uiState.excelEditorStep === "grid") {
      renderExcelGridStep(panel, schedule, data, rerender);
    } else {
      renderExcelReviewStep(panel, schedule, data, rerender);
    }

    container.appendChild(panel);
  }

  function renderScheduleBar(container, data, rerender) {
    var bar = document.createElement("div");
    bar.className = "toolbar focus-mode-hide";

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
      // Redesign Gate 6 (Global Project Context): follow the shared active project
      // whenever it's valid here — not just when this page's own uiState.projectId is
      // unset/invalid. uiState.projectId is only ever a same-tick mirror of the shared
      // context (every write path below also calls projectContext.set()), so if they
      // differ on render, the context changed elsewhere (the shell switcher, another
      // page) since this page last rendered — that's exactly the "carries across
      // modules" behavior this gate exists to provide, not a case to skip.
      var ctxProjectId = window.PCC.projectContext.get();
      if (ctxProjectId && activeProjects.some(function (p) { return p.id === ctxProjectId; })) {
        if (uiState.projectId !== ctxProjectId) {
          uiState.projectId = ctxProjectId;
          uiState.scheduleId = "";
        }
      } else if (!uiState.projectId || !activeProjects.some(function (p) { return p.id === uiState.projectId; })) {
        uiState.projectId = activeProjects[0].id;
      }
      projSelect.value = uiState.projectId;
    }
    projSelect.onchange = function () {
      uiState.projectId = projSelect.value;
      uiState.scheduleId = "";
      window.PCC.projectContext.set(uiState.projectId);
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
        opt.textContent = s.name + " (Rev " + s.revision_number + ")";
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

    var currentScheduleForExcelEdit = data.schedules.find(function (s) {
      return s.id === uiState.scheduleId;
    });
    var editExcelBtn = document.createElement("button");
    editExcelBtn.className = "btn btn--ghost";
    editExcelBtn.textContent = "Edit Excel";
    editExcelBtn.title = currentScheduleForExcelEdit && !currentScheduleForExcelEdit.source_file_name
      ? "This schedule wasn't imported from an Excel file, so there's nothing to edit here."
      : "";
    editExcelBtn.disabled = !currentScheduleForExcelEdit || !currentScheduleForExcelEdit.source_file_name;
    editExcelBtn.onclick = function () {
      openExcelEditor(currentScheduleForExcelEdit, data, rerender);
    };
    bar.appendChild(editExcelBtn);

    var calcBtn = document.createElement("button");
    calcBtn.className = "btn btn--ghost";
    calcBtn.textContent = "Calculate Schedule";
    calcBtn.disabled = !uiState.scheduleId;
    calcBtn.onclick = function () {
      runCalculation(data, rerender);
    };
    bar.appendChild(calcBtn);

    // Bug fix (Daily-Use Audit, Phase 1): a schedule-level version of the same
    // staleness flag the Activity Detail Panel shows, so a planner can tell the
    // critical path needs recalculating without opening any specific activity first.
    // A separate element rather than changing calcBtn's own label/attributes — keeps
    // the button itself a stable, predictable target (including for tests that find it
    // by its text) while still surfacing the warning right next to it.
    var currentScheduleForCalc = data.schedules.find(function (s) {
      return s.id === uiState.scheduleId;
    });
    if (currentScheduleForCalc && isCpmStale(currentScheduleForCalc, data)) {
      var staleNote = document.createElement("span");
      staleNote.className = "text-secondary";
      staleNote.style.color = "var(--status-at-risk)";
      staleNote.style.fontSize = "12.5px";
      staleNote.style.alignSelf = "center";
      staleNote.title = "Activities, dates, or relationships have changed since the critical path was last calculated.";
      staleNote.textContent = "⚠ Critical path out of date";
      bar.appendChild(staleNote);
    }

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
      baseline_project_finish: window.PCC.scheduleBaselineEngine.overallFinish(snapshot.activities),
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

  /** Bug fix (Daily-Use Audit, Phase 1): the CRUD forms, Excel import, and the Excel
   * grid editor can all change duration/dates/predecessors without ever re-running CPM
   * (deliberately \u2014 recalculating on every keystroke would be its own real cost on a
   * large schedule), but the Activity Detail Panel used to show the last-calculated
   * float/critical-path numbers as if they were always current, with nothing telling a
   * planner otherwise. Rather than chase down and flag every mutation call site (easy to
   * miss one), this compares a cheap fingerprint of the CPM-relevant input fields against
   * the fingerprint captured at the moment of the last successful "Calculate Schedule" \u2014
   * if anything that would change the calculation has changed since, the numbers are
   * stale, however they got that way. Not cryptographic, just change-detection. */
  function cheapFingerprint(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  function cpmInputFingerprint(activities, relationships) {
    var actPart = activities
      .map(function (a) {
        return [a.id, a.activity_type, a.duration, a.planned_start, a.planned_finish, a.actual_start, a.actual_finish, a.percent_complete, a.remaining_duration].join(":");
      })
      .sort()
      .join("|");
    var relPart = relationships
      .map(function (r) {
        return [r.predecessor_id, r.successor_id, r.type, r.lag].join(":");
      })
      .sort()
      .join("|");
    return cheapFingerprint(actPart + "##" + relPart);
  }

  /** True once anything CPM-relevant has changed since the schedule's own
   * cpm_calculated_fingerprint was captured (or the schedule has never been calculated
   * at all). Cheap \u2014 O(activities+relationships) for this one schedule, only computed
   * where it's actually displayed, not on every render of every page. */
  function isCpmStale(schedule, data) {
    if (!schedule || schedule.cpm_calculated_fingerprint == null) return true;
    var activities = data.activities.filter(function (a) {
      return a.schedule_id === schedule.id;
    });
    var relationships = data.relationships.filter(function (r) {
      return r.schedule_id === schedule.id;
    });
    return cpmInputFingerprint(activities, relationships) !== schedule.cpm_calculated_fingerprint;
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
      calculationMode: schedule.calculation_mode,
    });
    var freshFingerprint = cpmInputFingerprint(scheduleActivities, scheduleRelationships);

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
        a.is_out_of_sequence = r.is_out_of_sequence;
        a.updated_at = new Date().toISOString();
      });
      var s = d.schedules.find(function (x) {
        return x.id === uiState.scheduleId;
      });
      if (s) s.cpm_calculated_fingerprint = freshFingerprint;
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
      var oosMsg = result.outOfSequenceActivityIds.length > 0 ? " " + result.outOfSequenceActivityIds.length + " activity(ies) out of sequence." : "";
      window.PCC.notify(
        "Calculated \u2014 project finish " + result.projectFinish + varianceMsg + ", " +
          result.criticalActivityIds.length + " critical activity(ies)." + insufficientMsg + oosMsg,
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
    { key: "physical_progress", label: "Physical Progress (%)", type: "number" },
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

  function renderActivityForm(container, activity, wbsItems, vendors, rerender) {
    var isNew = uiState.editingActivityId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
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

    // Gate 32 (PCC Evolution Roadmap, Tier B: Activity → Vendor). Same hand-built select
    // pattern as the WBS field above (dynamic, data-driven options — not a fit for
    // ACTIVITY_FIELD_CONFIG's static-enum-driven select handling).
    var vendorField = document.createElement("div");
    vendorField.className = "field";
    vendorField.innerHTML = "<label>Vendor</label>";
    var vendorSelect = document.createElement("select");
    vendorSelect.id = "actfield-vendor_id";
    var noVendorOpt = document.createElement("option");
    noVendorOpt.value = "";
    noVendorOpt.textContent = "(none)";
    vendorSelect.appendChild(noVendorOpt);
    vendors.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.vendor_name || "(unnamed vendor)";
      vendorSelect.appendChild(opt);
    });
    vendorSelect.value = activity.vendor_id || "";
    vendorField.appendChild(vendorSelect);
    form.appendChild(vendorField);

    var grid = document.createElement("div");
    grid.className = "form-grid";
    ACTIVITY_FIELD_CONFIG.forEach(function (cfg) {
      grid.appendChild(buildActivityField(cfg, activity));
    });
    form.appendChild(grid);
    // Bug fix (Daily-Use Audit, Phase 1): browser-level hint alongside the real
    // validation in onsubmit below — negative duration doesn't make sense for CPM.
    var durationFieldEl = grid.querySelector("#actfield-duration");
    if (durationFieldEl) durationFieldEl.min = "0";

    if (!isNew) {
      var calcBox = document.createElement("div");
      calcBox.className = "panel";
      calcBox.style.padding = "var(--space-3) var(--space-3)";
      calcBox.style.marginTop = "-4px";
      calcBox.style.marginBottom = "var(--space-3)";
      if (activity.early_start == null) {
        calcBox.className += " text-secondary";
        calcBox.style.fontSize = "var(--text-sm)";
        calcBox.textContent =
          "Early/Late Start/Finish, Total Float, and Free Float aren't calculated yet \u2014 use \u201cCalculate Schedule\u201d above.";
      } else {
        var floatLabel =
          activity.total_float <= 0
            ? "Critical (0 float)"
            : activity.total_float + " day(s) float";
        // Bug fix (Daily-Use Audit, Phase 1): these numbers can silently go stale \u2014
        // editing dates/duration/predecessors, importing Excel, or applying the Excel
        // grid editor never re-runs CPM. Flag it plainly rather than showing a possibly-
        // wrong critical path as if it were current. See isCpmStale()'s own comment.
        var scheduleForStaleCheck = window.PCC.store.get().schedules.find(function (s) {
          return s.id === activity.schedule_id;
        });
        var stale = isCpmStale(scheduleForStaleCheck, window.PCC.store.get());
        calcBox.innerHTML =
          (stale
            ? "<strong style='color:var(--status-at-risk)'>Calculated (out of date)</strong> \u2014 changed since the last " +
              "\u201cCalculate Schedule\u201d run; these numbers may no longer be correct. \u2014 "
            : "<strong>Calculated (read-only)</strong> \u2014 ") + floatLabel + "<br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          "ES " + activity.early_start + " \u00b7 EF " + activity.early_finish + " \u00b7 " +
          "LS " + activity.late_start + " \u00b7 LF " + activity.late_finish + " \u00b7 " +
          "Free Float " + activity.free_float + " day(s)</span>";
        if (stale) {
          calcBox.style.borderColor = "var(--status-at-risk)";
        }
      }
      form.appendChild(calcBox);
    }

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "var(--text-sm)";
    errorMsg.style.display = "none";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-3)";

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
        errorMsg.textContent = "Activity name is required.";
        errorMsg.style.display = "block";
        return;
      }
      // Bug fix (Daily-Use Audit, Phase 1): the Duration field had no floor at all — a
      // negative value saved silently and corrupted CPM output downstream with nothing
      // flagging it here, where it's actually easy to catch.
      var durationEl = form.querySelector("#actfield-duration");
      if (durationEl && durationEl.value !== "" && Number(durationEl.value) < 0) {
        errorMsg.textContent = "Duration can't be negative.";
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = { wbs_id: wbsSelect.value || null, vendor_id: vendorSelect.value || "" };
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

  // UI/UX Overhaul Gate 6 (Schedule): activityMatchesGanttFilter() (above) is
  // deliberately not reused here \u2014 it carries chart-only fields (discipline/
  // contractor/responsiblePerson/the referenceDate-driven "quick" bucket) this flat
  // list doesn't surface. WBS/status/critical are the three dimensions the Gantt tab
  // already computes that this predicate closes the gap on.
  function activityMatchesActivitiesTabFilter(a) {
    if (uiState.activityFilter) {
      if (a.name.toLowerCase().indexOf(uiState.activityFilter.toLowerCase()) === -1) return false;
    }
    if (uiState.activityFilterWbsId && a.wbs_id !== uiState.activityFilterWbsId) return false;
    if (uiState.activityFilterStatus && a.status !== uiState.activityFilterStatus) return false;
    if (uiState.activityFilterCritical && !(a.total_float != null && a.total_float <= 0)) return false;
    return true;
  }

  // UI/UX Overhaul Gate 7 (Better Data Grids): the columns the Activities grid can
  // show/hide via its "Columns" toggle. "name" (the frozen first column) and the
  // Actions column are never hideable, so they're not in this list — only the seven
  // columns the brief's own example table implies (WBS/Type/Start/Finish/%
  // Complete/Float/Status).
  var ACTIVITY_GRID_COLUMNS = [
    { key: "wbs", label: "WBS" },
    { key: "type", label: "Type" },
    { key: "start", label: "Start" },
    { key: "finish", label: "Finish" },
    { key: "percent_complete", label: "% Complete" },
    { key: "float", label: "Float" },
    { key: "status", label: "Status" },
  ];

  function activitySortValue(a, wbsItems, key) {
    switch (key) {
      case "name":
        return (a.name || "").toLowerCase();
      case "wbs":
        return wbsName(wbsItems, a.wbs_id).toLowerCase();
      case "type":
        return ACTIVITY_TYPE_LABELS[a.activity_type] || "";
      case "start":
        return a.planned_start || "";
      case "finish":
        return a.planned_finish || "";
      case "percent_complete":
        return a.percent_complete || 0;
      // Unlinked/not-yet-calculated float sorts to the "least urgent" end regardless of
      // direction — treated as larger than any real float value, same as this tab's
      // pre-existing "Critical only" filter already treats total_float == null as
      // "not critical."
      case "float":
        return a.total_float == null ? Infinity : a.total_float;
      case "status":
        return ACTIVITY_STATUS_LABELS[a.status] || "";
      default:
        return "";
    }
  }

  function sortActivitiesForGrid(activities, wbsItems) {
    if (!uiState.activitySortKey) return activities;
    var key = uiState.activitySortKey;
    var dir = uiState.activitySortDir === "desc" ? -1 : 1;
    // .slice() first: never sort the caller's own filtered array in place.
    return activities.slice().sort(function (a, b) {
      var va = activitySortValue(a, wbsItems, key);
      var vb = activitySortValue(b, wbsItems, key);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
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
          ? window.PCC.store.newActivity(
              // Daily-Use Audit Phase 4 ("copy-activity"): activityClonePrefill (set by
              // the row menu's "Clone" item below) takes priority — it already carries
              // its own activity_type, so newActivityTypeHint only matters on a plain
              // "+ Add Activity"/"+ Add Milestone" click.
              uiState.activityClonePrefill || (uiState.newActivityTypeHint ? { activity_type: uiState.newActivityTypeHint } : {})
            )
          : scheduleActivities.find(function (a) {
              return a.id === uiState.editingActivityId;
            });
      uiState.newActivityTypeHint = null;
      uiState.activityClonePrefill = null;
      if (activityBeingEdited) renderActivityForm(container, activityBeingEdited, wbsItems, data.vendors, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.style.flexWrap = "wrap";

    // "Clear Filters" is always in the DOM (visibility toggled via style.display, not
    // conditionally created) so the search input's oninput handler \u2014 which deliberately
    // calls the lighter renderList() rather than a full rerender(), to preserve the
    // input's focus/cursor position while typing, this app's usual convention \u2014 can
    // still keep it in sync without needing to rebuild the toolbar it lives in. The
    // WBS/status/critical controls have no such focus concern (selects/checkboxes don't
    // lose anything on a full rerender), so they call rerender() directly and get this
    // for free, same as clicking the button itself.
    function updateClearBtnVisibility() {
      clearBtn.style.display =
        uiState.activityFilter || uiState.activityFilterWbsId || uiState.activityFilterStatus || uiState.activityFilterCritical
          ? ""
          : "none";
    }

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search activity name\u2026";
    searchInput.value = uiState.activityFilter;
    searchInput.oninput = function () {
      uiState.activityFilter = searchInput.value;
      renderList();
      updateClearBtnVisibility();
    };
    toolbar.appendChild(searchInput);

    var wbsSelect = document.createElement("select");
    var allWbsOpt = document.createElement("option");
    allWbsOpt.value = "";
    allWbsOpt.textContent = "WBS: All";
    wbsSelect.appendChild(allWbsOpt);
    wbsItems.forEach(function (w) {
      var opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = w.code ? w.code + " \u2014 " + w.name : w.name;
      wbsSelect.appendChild(opt);
    });
    wbsSelect.value = uiState.activityFilterWbsId;
    wbsSelect.onchange = function () {
      uiState.activityFilterWbsId = wbsSelect.value;
      rerender();
    };
    toolbar.appendChild(wbsSelect);

    var statusSelect = document.createElement("select");
    var allStatusOpt = document.createElement("option");
    allStatusOpt.value = "";
    allStatusOpt.textContent = "Status: All";
    statusSelect.appendChild(allStatusOpt);
    Object.keys(ACTIVITY_STATUS_LABELS).forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = ACTIVITY_STATUS_LABELS[s];
      statusSelect.appendChild(opt);
    });
    statusSelect.value = uiState.activityFilterStatus;
    statusSelect.onchange = function () {
      uiState.activityFilterStatus = statusSelect.value;
      rerender();
    };
    toolbar.appendChild(statusSelect);

    var criticalToggle = document.createElement("label");
    criticalToggle.style.display = "flex";
    criticalToggle.style.alignItems = "center";
    criticalToggle.style.gap = "var(--space-2)";
    criticalToggle.style.fontSize = "var(--text-sm)";
    var criticalCheckbox = document.createElement("input");
    criticalCheckbox.type = "checkbox";
    criticalCheckbox.checked = uiState.activityFilterCritical;
    criticalCheckbox.onchange = function () {
      uiState.activityFilterCritical = criticalCheckbox.checked;
      rerender();
    };
    criticalToggle.appendChild(criticalCheckbox);
    criticalToggle.appendChild(document.createTextNode("Critical only"));
    toolbar.appendChild(criticalToggle);

    var clearBtn = document.createElement("button");
    clearBtn.className = "btn btn--ghost";
    clearBtn.textContent = "Clear Filters";
    clearBtn.onclick = function () {
      uiState.activityFilter = "";
      uiState.activityFilterWbsId = "";
      uiState.activityFilterStatus = "";
      uiState.activityFilterCritical = false;
      rerender();
    };
    toolbar.appendChild(clearBtn);
    updateClearBtnVisibility();

    // UI/UX Overhaul Gate 7 (Better Data Grids): column-visibility toggle, same
    // .card-menu popover Portfolio/Risk Register's "⋯" menus already use — a checklist
    // of the grid's seven hideable columns (Activity and Actions are never hideable, so
    // they're not offered here) via .card-menu__checkbox-item.
    var columnsMenuWrap = document.createElement("div");
    columnsMenuWrap.className = "card-menu";

    var columnsMenuBtn = document.createElement("button");
    columnsMenuBtn.className = "btn btn--ghost";
    columnsMenuBtn.textContent = "Columns";
    columnsMenuBtn.onclick = function () {
      uiState.activityColumnsMenuOpen = !uiState.activityColumnsMenuOpen;
      rerender();
    };
    columnsMenuWrap.appendChild(columnsMenuBtn);

    if (uiState.activityColumnsMenuOpen) {
      var columnsOverlay = document.createElement("button");
      columnsOverlay.className = "card-menu__overlay";
      columnsOverlay.setAttribute("aria-label", "Close column menu");
      columnsOverlay.onclick = function () {
        uiState.activityColumnsMenuOpen = false;
        rerender();
      };
      columnsMenuWrap.appendChild(columnsOverlay);

      var columnsDropdown = document.createElement("div");
      columnsDropdown.className = "card-menu__dropdown";
      ACTIVITY_GRID_COLUMNS.forEach(function (col) {
        var itemLabel = document.createElement("label");
        itemLabel.className = "card-menu__checkbox-item";
        var itemCheckbox = document.createElement("input");
        itemCheckbox.type = "checkbox";
        itemCheckbox.checked = uiState.activityVisibleColumns[col.key];
        itemCheckbox.onchange = function () {
          uiState.activityVisibleColumns[col.key] = itemCheckbox.checked;
          rerender();
        };
        itemLabel.appendChild(itemCheckbox);
        itemLabel.appendChild(document.createTextNode(col.label));
        columnsDropdown.appendChild(itemLabel);
      });
      columnsMenuWrap.appendChild(columnsDropdown);
    }
    toolbar.appendChild(columnsMenuWrap);

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

    // UI/UX Overhaul Gate 7 (Better Data Grids): a sortable <th> whose click target is
    // just the label+arrow (.data-table__sort-btn), not the cell's full padding box.
    // Clicking the currently-active column flips direction instead of resetting it \u2014
    // the usual spreadsheet/data-grid convention.
    function buildSortableTh(key, label) {
      var th = document.createElement("th");
      var btn = document.createElement("button");
      btn.className = "data-table__sort-btn";
      btn.type = "button";
      btn.appendChild(document.createTextNode(label));
      if (uiState.activitySortKey === key) {
        var arrow = document.createElement("span");
        arrow.className = "data-table__sort-arrow";
        arrow.textContent = uiState.activitySortDir === "desc" ? "\u25bc" : "\u25b2";
        btn.appendChild(arrow);
      }
      btn.onclick = function () {
        if (uiState.activitySortKey === key) {
          uiState.activitySortDir = uiState.activitySortDir === "asc" ? "desc" : "asc";
        } else {
          uiState.activitySortKey = key;
          uiState.activitySortDir = "asc";
        }
        renderList();
      };
      th.appendChild(btn);
      return th;
    }

    // UI/UX Overhaul Gate 8 (Tablet/Mobile Optimization): the row-level "\u22ef" Edit/Delete
    // menu is identical between the desktop table and the mobile card fallback below \u2014
    // extracted once so the two representations can't silently drift apart.
    function buildActivityRowMenu(a) {
      var rowMenuWrap = document.createElement("div");
      rowMenuWrap.className = "card-menu";

      var rowMenuBtn = document.createElement("button");
      rowMenuBtn.className = "icon-btn";
      rowMenuBtn.setAttribute("aria-label", "More actions");
      rowMenuBtn.textContent = "\u22ef";
      rowMenuBtn.onclick = function () {
        uiState.activityRowMenuId = uiState.activityRowMenuId === a.id ? null : a.id;
        rerender();
      };
      rowMenuWrap.appendChild(rowMenuBtn);

      if (uiState.activityRowMenuId === a.id) {
        var rowOverlay = document.createElement("button");
        rowOverlay.className = "card-menu__overlay";
        rowOverlay.setAttribute("aria-label", "Close menu");
        rowOverlay.onclick = function () {
          uiState.activityRowMenuId = null;
          rerender();
        };
        rowMenuWrap.appendChild(rowOverlay);

        var rowDropdown = document.createElement("div");
        rowDropdown.className = "card-menu__dropdown";

        var editItem = document.createElement("button");
        editItem.className = "card-menu__item";
        editItem.textContent = "Edit";
        editItem.onclick = function () {
          uiState.editingActivityId = a.id;
          uiState.activityRowMenuId = null;
          rerender();
        };

        // Daily-Use Audit Phase 4 ("copy-activity"): opens the Add Activity form
        // pre-filled with this activity's own content fields — reuses the exact
        // pendingPrefill-style pattern the Phase 3 registers already established
        // (activityClonePrefill, consumed once in renderActivitiesTab() above).
        // Progress/status/actual dates/planned dates and every CPM-calculated field
        // deliberately reset fresh — a copy is a new, not-yet-scheduled activity, not a
        // snapshot of where the original currently stands.
        var cloneItem = document.createElement("button");
        cloneItem.className = "card-menu__item";
        cloneItem.textContent = "Clone";
        cloneItem.onclick = function () {
          uiState.activityClonePrefill = {
            wbs_id: a.wbs_id,
            name: a.name,
            activity_type: a.activity_type,
            calendar_id: a.calendar_id,
            duration: a.duration,
            original_duration: a.original_duration,
            remaining_duration: a.remaining_duration,
            priority: a.priority,
            discipline: a.discipline,
            contractor: a.contractor,
            responsible_person: a.responsible_person,
            constraint_type: a.constraint_type,
            constraint_date: a.constraint_date,
            vendor_id: a.vendor_id,
            notes: a.notes,
          };
          uiState.editingActivityId = "new";
          uiState.activityRowMenuId = null;
          rerender();
        };

        var deleteItem = document.createElement("button");
        deleteItem.className = "card-menu__item";
        deleteItem.textContent = "Delete";
        deleteItem.onclick = function () {
          deleteActivityWithConfirm(a, function () {
            uiState.activityRowMenuId = null;
            rerender();
          });
        };

        rowDropdown.appendChild(editItem);
        rowDropdown.appendChild(cloneItem);
        rowDropdown.appendChild(deleteItem);
        rowMenuWrap.appendChild(rowDropdown);
      }

      return rowMenuWrap;
    }

    // UI/UX Overhaul Gate 8: the real <table> data grid (Gate 7) genuinely doesn't work
    // on a phone \u2014 seven-plus columns has nowhere to go at 390px but a fight with
    // horizontal scroll, exactly the "tiny tables" anti-pattern the brief warns against.
    // Rather than shrink the table further, mobile gets its own stacked-card
    // representation of the SAME filtered/sorted data \u2014 reusing the .project-card
    // family this tab used before Gate 7's grid conversion. Both are always built; a
    // CSS breakpoint (not a JS resize listener) shows exactly one, the same
    // declarative "let CSS own the reflow" approach every other responsive layout in
    // this app already uses (.doc-register's flex-wrap, .gantt-layout-row, etc.).
    function buildActivityMobileCard(a) {
      var card = document.createElement("div");
      card.className = "project-card";

      // Daily-Use Audit Phase 4 (bulk date-shift): see risks.js's own .project-card__select
      // comment for this exact pattern, reused here for the Activities grid's mobile
      // card fallback.
      var selectBox = document.createElement("input");
      selectBox.type = "checkbox";
      selectBox.className = "project-card__select";
      selectBox.setAttribute("aria-label", "Select this activity for a bulk action");
      selectBox.checked = !!uiState.selectedActivityIds[a.id];
      selectBox.onchange = function () {
        if (selectBox.checked) uiState.selectedActivityIds[a.id] = true;
        else delete uiState.selectedActivityIds[a.id];
        renderList();
      };
      card.appendChild(selectBox);

      var main = document.createElement("div");
      main.className = "project-card__main";
      var metaBits = [
        wbsName(wbsItems, a.wbs_id),
        ACTIVITY_TYPE_LABELS[a.activity_type],
      ];
      if (a.planned_start || a.planned_finish) {
        metaBits.push((a.planned_start || "\u2014") + " \u2192 " + (a.planned_finish || "\u2014"));
      }
      metaBits.push((a.percent_complete || 0) + "% complete");
      main.innerHTML =
        "<div class='project-card__name'>" + (a.name || "(unnamed activity)") +
        (a.is_out_of_sequence ? " \u26a0" : "") + "</div>" +
        "<div class='project-card__meta'>" + metaBits.join(" \u00b7 ") + "</div>";
      card.appendChild(main);

      var badgeWrap = document.createElement("div");
      badgeWrap.style.display = "flex";
      badgeWrap.style.gap = "var(--space-2)";
      badgeWrap.style.flexWrap = "wrap";

      var statusBadge = document.createElement("span");
      statusBadge.className =
        "status-badge " +
        (a.status === "complete" ? "status-badge--complete" : a.status === "on_hold" ? "status-badge--at_risk" : "status-badge--info");
      statusBadge.textContent = ACTIVITY_STATUS_LABELS[a.status];
      badgeWrap.appendChild(statusBadge);

      if (a.total_float != null) {
        var floatBadge = document.createElement("span");
        if (a.total_float <= 0) {
          floatBadge.className = "status-badge status-badge--critical";
          floatBadge.textContent = "Critical";
        } else {
          floatBadge.className = "status-badge status-badge--info";
          floatBadge.textContent = a.total_float + "d float";
        }
        badgeWrap.appendChild(floatBadge);
      }
      card.appendChild(badgeWrap);

      var actions = document.createElement("div");
      actions.className = "project-card__actions";
      actions.appendChild(buildActivityRowMenu(a));
      card.appendChild(actions);

      return card;
    }

    // Daily-Use Audit Phase 4 ("Planner power tools" — bulk date-shift): shifting a
    // group of activities forward/back a common number of days, a standard daily
    // scheduling operation, used to mean editing each one individually. Shifts
    // planned_start/planned_finish always, and actual_start/actual_finish only when
    // already set (an activity that hasn't actually started/finished yet has nothing
    // there to shift).
    function renderActivityBulkBar() {
      var n = Object.keys(uiState.selectedActivityIds).length;
      if (n === 0) return null;
      var noun = n === 1 ? "activity" : "activities";

      var bar = document.createElement("div");
      bar.className = "bulk-action-bar";

      var countEl = document.createElement("span");
      countEl.className = "bulk-action-bar__count";
      countEl.textContent = n + " selected";
      bar.appendChild(countEl);

      var shiftInput = document.createElement("input");
      shiftInput.type = "number";
      shiftInput.placeholder = "Days";
      shiftInput.title = "Positive shifts later, negative shifts earlier";
      shiftInput.style.width = "80px";
      shiftInput.value = uiState.bulkShiftDays;
      shiftInput.oninput = function () {
        uiState.bulkShiftDays = shiftInput.value;
      };
      bar.appendChild(shiftInput);

      var shiftBtn = document.createElement("button");
      shiftBtn.className = "btn btn--ghost";
      shiftBtn.textContent = "Shift Selected";
      shiftBtn.onclick = function () {
        var days = Number(uiState.bulkShiftDays);
        if (!uiState.bulkShiftDays || isNaN(days) || days === 0) {
          window.PCC.notify("Enter a non-zero number of days to shift.", "warning");
          return;
        }
        window.PCC.store.update(function (data2) {
          data2.activities.forEach(function (item) {
            if (!uiState.selectedActivityIds[item.id]) return;
            if (item.planned_start) item.planned_start = addDaysIso(item.planned_start, days);
            if (item.planned_finish) item.planned_finish = addDaysIso(item.planned_finish, days);
            if (item.actual_start) item.actual_start = addDaysIso(item.actual_start, days);
            if (item.actual_finish) item.actual_finish = addDaysIso(item.actual_finish, days);
            item.updated_at = new Date().toISOString();
          });
        });
        window.PCC.notify(n + " " + noun + " shifted by " + days + " day" + (Math.abs(days) === 1 ? "" : "s") + ".", "success");
        uiState.selectedActivityIds = {};
        uiState.bulkShiftDays = "";
        rerender();
      };
      bar.appendChild(shiftBtn);

      var spacer = document.createElement("div");
      spacer.className = "bulk-action-bar__spacer";
      bar.appendChild(spacer);

      var clearBtn = document.createElement("button");
      clearBtn.className = "btn btn--ghost";
      clearBtn.textContent = "Clear Selection";
      clearBtn.onclick = function () {
        uiState.selectedActivityIds = {};
        renderList();
      };
      bar.appendChild(clearBtn);

      return bar;
    }

    function renderList() {
      listWrap.innerHTML = "";
      var bulkBar = renderActivityBulkBar();
      if (bulkBar) listWrap.appendChild(bulkBar);
      var filtered = sortActivitiesForGrid(scheduleActivities.filter(activityMatchesActivitiesTabFilter), wbsItems);
      // Daily-Use Audit Phase 4: the inline-edit input for whichever cell is currently
      // being edited, if any — .focus()ing it only works once the table is actually in
      // the live document, so it's captured during row-building below and focused once
      // at the very end of this function, not at creation time.
      var inlineEditElementToFocus = null;

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent = uiState.scheduleId
          ? scheduleActivities.length === 0
            ? "No activities yet. Click \u201c+ Add Activity\u201d to add the first one."
            : "No activities match this search/filter."
          : "Create a schedule first.";
        listWrap.appendChild(empty);
        return;
      }

      var mobileCards = document.createElement("div");
      mobileCards.className = "project-list activities-mobile-cards";
      filtered.forEach(function (a) {
        mobileCards.appendChild(buildActivityMobileCard(a));
      });
      listWrap.appendChild(mobileCards);

      var panel = document.createElement("div");
      panel.className = "panel activities-table-wrap";

      // Horizontal scroll lives on its own wrapper, not the .panel itself, so the
      // panel's own border/shadow/padding don't visually break mid-scroll \u2014 same split
      // the Gantt tab's own chart wrapper already uses for the same reason.
      var scrollWrap = document.createElement("div");
      scrollWrap.style.overflowX = "auto";

      var table = document.createElement("table");
      table.className = "data-table data-table--sticky-header data-table--frozen-first-col";

      var thead = document.createElement("thead");
      var headRow = document.createElement("tr");
      headRow.appendChild(buildSortableTh("name", "Activity"));
      // Daily-Use Audit Phase 4 (bulk date-shift): a dedicated select column, placed
      // right after the frozen Activity-name column rather than before it — the frozen-
      // first-col CSS targets whichever column is literally first (see
      // data-table--frozen-first-col's own comment in styles.css), so a checkbox column
      // prepended ahead of Activity would itself become the frozen one instead.
      var selectHeadTh = document.createElement("th");
      selectHeadTh.textContent = "";
      headRow.appendChild(selectHeadTh);
      ACTIVITY_GRID_COLUMNS.forEach(function (col) {
        if (uiState.activityVisibleColumns[col.key]) headRow.appendChild(buildSortableTh(col.key, col.label));
      });
      var actionsHeadTh = document.createElement("th");
      actionsHeadTh.textContent = "";
      headRow.appendChild(actionsHeadTh);
      thead.appendChild(headRow);
      table.appendChild(thead);

      // Daily-Use Audit Phase 4 (Activities grid virtualization): extracted into its own
      // named function (previously inline in a forEach) so both the small-schedule path
      // (every row, unchanged from before this phase) and the large-schedule virtualized
      // path below can build one row on demand from the same code.
      function buildActivityRow(a) {
        var row = document.createElement("tr");

        var nameTd = document.createElement("td");
        nameTd.appendChild(document.createTextNode(a.name || "(unnamed activity)"));
        if (a.is_out_of_sequence) {
          var oosIcon = document.createElement("span");
          oosIcon.textContent = " \u26a0";
          oosIcon.title = "Out of sequence: this activity had actual progress recorded before its predecessor logic would have allowed it to start.";
          nameTd.appendChild(oosIcon);
        }
        row.appendChild(nameTd);

        var selectTd = document.createElement("td");
        var rowSelectBox = document.createElement("input");
        rowSelectBox.type = "checkbox";
        rowSelectBox.setAttribute("aria-label", "Select this activity for a bulk action");
        rowSelectBox.checked = !!uiState.selectedActivityIds[a.id];
        rowSelectBox.onchange = function () {
          if (rowSelectBox.checked) uiState.selectedActivityIds[a.id] = true;
          else delete uiState.selectedActivityIds[a.id];
          renderList();
        };
        selectTd.appendChild(rowSelectBox);
        row.appendChild(selectTd);

        if (uiState.activityVisibleColumns.wbs) {
          var wbsTd = document.createElement("td");
          wbsTd.textContent = wbsName(wbsItems, a.wbs_id);
          row.appendChild(wbsTd);
        }

        if (uiState.activityVisibleColumns.type) {
          var typeTd = document.createElement("td");
          typeTd.textContent = ACTIVITY_TYPE_LABELS[a.activity_type];
          row.appendChild(typeTd);
        }

        // Daily-Use Audit Phase 4: click-to-edit directly on the grid \u2014 clicking the
        // cell's displayed value swaps it for a real input, committed on blur/Enter
        // (Escape cancels without saving) via commitInlineActivityEdit() above. Only
        // ever one cell edits at a time (uiState.inlineEditActivityId/Field), same
        // single-target pattern the row "\u22ef" menu's own openMenuId already uses.
        function beginInlineEdit(field) {
          uiState.inlineEditActivityId = a.id;
          uiState.inlineEditField = field;
          renderList();
        }
        function endInlineEdit() {
          uiState.inlineEditActivityId = null;
          uiState.inlineEditField = null;
        }
        function isEditingField(field) {
          return uiState.inlineEditActivityId === a.id && uiState.inlineEditField === field;
        }

        if (uiState.activityVisibleColumns.start) {
          var startTd = document.createElement("td");
          if (isEditingField("start")) {
            var startInput = document.createElement("input");
            startInput.type = "date";
            startInput.value = a.planned_start || "";
            startInput.onblur = function () {
              if (!isEditingField("start")) return; // Escape already cancelled this edit
              commitInlineActivityEdit(a.id, { planned_start: startInput.value });
              endInlineEdit();
              renderList();
            };
            startInput.onkeydown = function (e) {
              if (e.key === "Enter") startInput.blur();
              else if (e.key === "Escape") { endInlineEdit(); renderList(); }
            };
            startTd.appendChild(startInput);
            inlineEditElementToFocus = startInput;
          } else {
            startTd.textContent = a.planned_start || "\u2014";
            startTd.style.cursor = "pointer";
            startTd.title = "Click to change the start date";
            startTd.onclick = function () { beginInlineEdit("start"); };
          }
          row.appendChild(startTd);
        }

        if (uiState.activityVisibleColumns.finish) {
          var finishTd = document.createElement("td");
          if (isEditingField("finish")) {
            var finishInput = document.createElement("input");
            finishInput.type = "date";
            finishInput.value = a.planned_finish || "";
            finishInput.onblur = function () {
              if (!isEditingField("finish")) return;
              commitInlineActivityEdit(a.id, { planned_finish: finishInput.value });
              endInlineEdit();
              renderList();
            };
            finishInput.onkeydown = function (e) {
              if (e.key === "Enter") finishInput.blur();
              else if (e.key === "Escape") { endInlineEdit(); renderList(); }
            };
            finishTd.appendChild(finishInput);
            inlineEditElementToFocus = finishInput;
          } else {
            finishTd.textContent = a.planned_finish || "\u2014";
            finishTd.style.cursor = "pointer";
            finishTd.title = "Click to change the finish date";
            finishTd.onclick = function () { beginInlineEdit("finish"); };
          }
          row.appendChild(finishTd);
        }

        if (uiState.activityVisibleColumns.percent_complete) {
          var pctTd = document.createElement("td");
          if (isEditingField("percent_complete")) {
            var pctInput = document.createElement("input");
            pctInput.type = "number";
            pctInput.min = "0";
            pctInput.max = "100";
            pctInput.style.width = "70px";
            pctInput.value = a.percent_complete || 0;
            function commitPct() {
              if (!isEditingField("percent_complete")) return;
              var clamped = Math.max(0, Math.min(100, Number(pctInput.value) || 0));
              commitInlineActivityEdit(a.id, { percent_complete: clamped });
              endInlineEdit();
              renderList();
            }
            pctInput.onblur = commitPct;
            pctInput.onkeydown = function (e) {
              if (e.key === "Enter") pctInput.blur();
              else if (e.key === "Escape") { endInlineEdit(); renderList(); }
            };
            pctTd.appendChild(pctInput);
            inlineEditElementToFocus = pctInput;
          } else {
            pctTd.innerHTML =
              (a.percent_complete || 0) + "%" +
              "<br/><span class='text-secondary' style='font-size:11px;'>" + (a.physical_progress || 0) + "% physical</span>";
            pctTd.style.cursor = "pointer";
            pctTd.title = "Click to change % complete";
            pctTd.onclick = function () { beginInlineEdit("percent_complete"); };
          }
          row.appendChild(pctTd);
        }

        if (uiState.activityVisibleColumns.float) {
          var floatTd = document.createElement("td");
          if (a.total_float != null) {
            var floatBadge = document.createElement("span");
            if (a.total_float <= 0) {
              floatBadge.className = "status-badge status-badge--critical";
              floatBadge.textContent = "Critical";
            } else {
              floatBadge.className = "status-badge status-badge--info";
              floatBadge.textContent = a.total_float + "d float";
            }
            floatTd.appendChild(floatBadge);
          } else {
            floatTd.textContent = "\u2014";
          }
          row.appendChild(floatTd);
        }

        if (uiState.activityVisibleColumns.status) {
          var statusTd = document.createElement("td");
          if (isEditingField("status")) {
            var statusEdit = document.createElement("select");
            window.PCC.store.ACTIVITY_STATUSES.forEach(function (s) {
              var opt = document.createElement("option");
              opt.value = s;
              opt.textContent = ACTIVITY_STATUS_LABELS[s];
              statusEdit.appendChild(opt);
            });
            statusEdit.value = a.status;
            statusEdit.onchange = function () {
              commitInlineActivityEdit(a.id, { status: statusEdit.value });
              endInlineEdit();
              renderList();
            };
            statusEdit.onblur = function () {
              if (!isEditingField("status")) return;
              endInlineEdit();
              renderList();
            };
            statusEdit.onkeydown = function (e) {
              if (e.key === "Escape") { endInlineEdit(); renderList(); }
            };
            statusTd.appendChild(statusEdit);
            inlineEditElementToFocus = statusEdit;
          } else {
            var statusBadge = document.createElement("span");
            statusBadge.className =
              "status-badge " +
              (a.status === "complete" ? "status-badge--complete" : a.status === "on_hold" ? "status-badge--at_risk" : "status-badge--info");
            statusBadge.textContent = ACTIVITY_STATUS_LABELS[a.status];
            statusTd.appendChild(statusBadge);
            statusTd.style.cursor = "pointer";
            statusTd.title = "Click to change status";
            statusTd.onclick = function () { beginInlineEdit("status"); };
          }
          row.appendChild(statusTd);
        }

        // Row-level "\u22ef" menu (Edit/Delete), same .card-menu pattern established for
        // Portfolio/Risk Register cards \u2014 a table row's Actions cell is too narrow for
        // two full-width text buttons the way the old flex-card layout had room for.
        // Shared with the mobile card fallback via buildActivityRowMenu() above.
        var actionsTd = document.createElement("td");
        actionsTd.appendChild(buildActivityRowMenu(a));
        row.appendChild(actionsTd);

        return row;
      }

      var tbody = document.createElement("tbody");
      table.appendChild(tbody);

      // Attached to the live document BEFORE any rows are built, not after — the
      // virtualized path below needs scrollWrap.clientHeight to be a real, non-zero
      // measurement on the very first paint (a detached element always reads 0, same as
      // jsdom's permanent 0), not just once the user scrolls for the first time.
      scrollWrap.appendChild(table);
      panel.appendChild(scrollWrap);
      listWrap.appendChild(panel);

      // Daily-Use Audit Phase 4 (Activities grid virtualization): "real 1000+ activity
      // schedules" made every full rerender (every search keystroke, sort click, filter
      // change) build a thousand-plus <tr> elements at once. Reuses the exact windowing
      // primitive (visibleRowRange, in scheduleGanttLayout.js) the Gantt chart's own
      // virtualization already established, rather than inventing a second scheme — see
      // that function's own comment for how the jsdom-vs-real-browser fallback works.
      // Only engages above the threshold: a typical schedule (well under 150 activities)
      // renders exactly as it always has, unbounded height, every row in the DOM.
      var VIRTUALIZE_THRESHOLD = 150;
      var ROW_HEIGHT_ESTIMATE = 52; // the taller of the two row shapes (% Complete's two-line cell)
      var HEADER_HEIGHT_ESTIMATE = 34;
      var ROW_BUFFER = 15;

      if (filtered.length > VIRTUALIZE_THRESHOLD) {
        scrollWrap.style.maxHeight = "70vh";
        scrollWrap.style.overflowY = "auto";
        var columnCount = headRow.children.length;

        function buildSpacerRow(rowCount) {
          var spacerRow = document.createElement("tr");
          var spacerTd = document.createElement("td");
          spacerTd.colSpan = columnCount;
          spacerTd.style.padding = "0";
          spacerTd.style.border = "none";
          spacerTd.style.height = rowCount * ROW_HEIGHT_ESTIMATE + "px";
          spacerRow.appendChild(spacerTd);
          return spacerRow;
        }

        var renderedRange = { start: -1, end: -1 };
        function renderTbodyRows() {
          var range = window.PCC.scheduleGanttLayout.visibleRowRange(
            filtered.length, scrollWrap.scrollTop, scrollWrap.clientHeight, ROW_HEIGHT_ESTIMATE, HEADER_HEIGHT_ESTIMATE, ROW_BUFFER
          );
          if (range.start === renderedRange.start && range.end === renderedRange.end) return;
          renderedRange = range;
          tbody.innerHTML = "";
          if (range.start > 0) tbody.appendChild(buildSpacerRow(range.start));
          for (var i = range.start; i < range.end; i++) {
            tbody.appendChild(buildActivityRow(filtered[i]));
          }
          if (range.end < filtered.length) tbody.appendChild(buildSpacerRow(filtered.length - range.end));
        }

        renderTbodyRows();
        var virtualizeScrollRafPending = false;
        var scheduleVirtualizeFrame = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (cb) { cb(); };
        scrollWrap.addEventListener("scroll", function () {
          if (virtualizeScrollRafPending) return;
          virtualizeScrollRafPending = true;
          scheduleVirtualizeFrame(function () {
            virtualizeScrollRafPending = false;
            renderTbodyRows();
          });
        });
      } else {
        filtered.forEach(function (a) {
          tbody.appendChild(buildActivityRow(a));
        });
      }

      if (inlineEditElementToFocus) {
        inlineEditElementToFocus.focus();
        if (inlineEditElementToFocus.select) inlineEditElementToFocus.select();
      }
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
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
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
    errorMsg.style.fontSize = "var(--text-sm)";
    errorMsg.style.display = "none";
    errorMsg.textContent = "WBS name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-3)";

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

  /** Daily-Use Audit Phase 4 (WBS indent/outdent): same parent-chain walk
   * renderWbsForm()'s own submit handler already uses for `level` — level is derived,
   * never user-entered, so a reparent (from either the form's own Parent WBS dropdown or
   * indent/outdent below) can't leave it out of sync. */
  function computeWbsLevel(parentId, allWbsItems) {
    var level = 0;
    var walk = parentId;
    var guard = 0;
    while (walk && guard < 50) {
      var parentItem = allWbsItems.find(function (w) {
        return w.id === walk;
      });
      if (!parentItem) break;
      level++;
      walk = parentItem.parent_wbs_id;
      guard++;
    }
    return level;
  }

  /** Reparents one WBS item and cascades the level recompute down through every
   * descendant — indenting/outdenting a branch (not just a leaf) must keep the whole
   * subtree's indentation correct, not just the item that was actually clicked. */
  function reparentWbsItem(itemId, newParentId, allWbsItems) {
    var item = allWbsItems.find(function (w) {
      return w.id === itemId;
    });
    if (!item) return;
    item.parent_wbs_id = newParentId;
    item.level = computeWbsLevel(newParentId, allWbsItems);
    item.updated_at = new Date().toISOString();
    var queue = [itemId];
    while (queue.length) {
      var pid = queue.shift();
      allWbsItems
        .filter(function (w) {
          return w.parent_wbs_id === pid;
        })
        .forEach(function (child) {
          child.level = computeWbsLevel(child.parent_wbs_id, allWbsItems);
          queue.push(child.id);
        });
    }
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
      row.style.marginBottom = "var(--space-2)";

      var main = document.createElement("div");
      main.innerHTML = "<strong>" + (w.code ? w.code + " \u2014 " : "") + w.name + "</strong>";
      row.appendChild(main);

      var actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "var(--space-2)";

      // Daily-Use Audit Phase 4 (WBS indent/outdent): a standard outliner operation the
      // audit named directly — until now, changing where a WBS item sits in the
      // hierarchy meant opening Edit and re-picking Parent WBS from a dropdown. Indent
      // nests under the item's own previous sibling (found by code order within the
      // same parent, not the flattened display order, so it stays correct regardless of
      // how the level+code sort happens to interleave unrelated branches); Outdent
      // promotes to the current parent's own parent. Both cascade the level recompute
      // through the whole moved subtree via reparentWbsItem() above.
      var siblings = wbsItems
        .filter(function (x) {
          return x.parent_wbs_id === w.parent_wbs_id;
        })
        .sort(function (a, b) {
          return (a.code || "").localeCompare(b.code || "");
        });
      var myIndex = siblings.findIndex(function (x) {
        return x.id === w.id;
      });
      var prevSibling = myIndex > 0 ? siblings[myIndex - 1] : null;
      var currentParent = w.parent_wbs_id
        ? wbsItems.find(function (x) {
            return x.id === w.parent_wbs_id;
          })
        : null;

      var indentBtn = document.createElement("button");
      indentBtn.className = "btn btn--ghost";
      indentBtn.textContent = "→ Indent";
      indentBtn.title = prevSibling
        ? "Nest under “" + (prevSibling.code ? prevSibling.code + " — " : "") + prevSibling.name + "”"
        : "No previous item at this level to nest under";
      indentBtn.disabled = !prevSibling;
      indentBtn.onclick = function () {
        window.PCC.store.update(function (data2) {
          reparentWbsItem(w.id, prevSibling.id, data2.wbs_items);
        });
        window.PCC.notify("Indented under “" + (prevSibling.code ? prevSibling.code + " — " : "") + prevSibling.name + "”.", "success");
        rerender();
      };
      actions.appendChild(indentBtn);

      var outdentBtn = document.createElement("button");
      outdentBtn.className = "btn btn--ghost";
      outdentBtn.textContent = "← Outdent";
      outdentBtn.title = currentParent ? "Promote to the same level as “" + (currentParent.code ? currentParent.code + " — " : "") + currentParent.name + "”" : "Already at the top level";
      outdentBtn.disabled = !currentParent;
      outdentBtn.onclick = function () {
        var newParentId = currentParent.parent_wbs_id || null;
        window.PCC.store.update(function (data2) {
          reparentWbsItem(w.id, newParentId, data2.wbs_items);
        });
        window.PCC.notify("Outdented “" + w.name + "”.", "success");
        rerender();
      };
      actions.appendChild(outdentBtn);

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

  /** Bug fix (Daily-Use Audit, Phase 1): true if adding predecessor_id -> successor_id
   * would close a cycle given the schedule's other existing relationships — i.e.
   * successor_id can already reach predecessor_id by following existing predecessor ->
   * successor edges forward. Previously a manually-built cycle was only ever caught
   * later, silently, when "Calculate Schedule" ran (the cyclic activities just get
   * dropped from the result — see runCalculation()'s own comment) — nothing stopped a
   * planner from creating one by hand in the first place. */
  function wouldCreateRelationshipCycle(predId, succId, existingRelationships) {
    if (predId === succId) return true;
    var adjacency = {};
    existingRelationships.forEach(function (r) {
      if (!adjacency[r.predecessor_id]) adjacency[r.predecessor_id] = [];
      adjacency[r.predecessor_id].push(r.successor_id);
    });
    var visited = {};
    var queue = [succId];
    while (queue.length) {
      var current = queue.shift();
      if (current === predId) return true;
      if (visited[current]) continue;
      visited[current] = true;
      (adjacency[current] || []).forEach(function (next) {
        if (!visited[next]) queue.push(next);
      });
    }
    return false;
  }

  function renderRelationshipForm(container, relationship, activities, rerender) {
    var isNew = uiState.editingRelationshipId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
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
    errorMsg.style.fontSize = "var(--text-sm)";
    errorMsg.style.display = "none";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-3)";

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
        errorMsg.textContent = "Predecessor and successor must be different activities.";
        errorMsg.style.display = "block";
        return;
      }
      var otherRelationshipsThisSchedule = window.PCC.store.get().relationships.filter(function (r) {
        return r.schedule_id === uiState.scheduleId && r.id !== relationship.id;
      });
      if (wouldCreateRelationshipCycle(predSelect.value, succSelect.value, otherRelationshipsThisSchedule)) {
        errorMsg.textContent = "This would create a circular dependency (the successor already leads back to the predecessor through other relationships) — CPM can't calculate a schedule with a loop in it.";
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
      row.style.marginBottom = "var(--space-2)";

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
    search.id = "gantt-search-input";
    search.placeholder = "Search ID, name, WBS, contractor, discipline…";
    search.value = uiState.ganttFilter.search;
    search.style.minWidth = "220px";
    // Bug fix (Daily-Use Audit, Phase 1): rerender() here rebuilds the whole Gantt tab
    // (toolbar, detail panel, and the full SVG chart via computeLayout()) — unlike the
    // Activities tab's own search, which deliberately calls a lighter list-only
    // render specifically to keep the input focused while typing (see that field's own
    // comment above). Splitting the Gantt tab's render the same way would mean a much
    // larger restructure of computeLayout()/the chart-building code below; simpler and
    // just as effective to let the full rerender happen and then restore focus/caret
    // position on the freshly-built input, via the stable id above — same end result
    // (typing multiple characters actually works) without touching the chart pipeline.
    search.oninput = function () {
      var caretPos = search.selectionStart;
      uiState.ganttFilter.search = search.value;
      rerender();
      var freshSearch = document.getElementById("gantt-search-input");
      if (freshSearch) {
        freshSearch.focus();
        freshSearch.setSelectionRange(caretPos, caretPos);
      }
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
    bar2.style.marginTop = "var(--space-2)";

    // UI/UX Overhaul Gate 8: only the zoom controls specifically are chart-only — Add
    // Activity/Add Milestone below stay useful (and stay unwrapped in bar2 directly) at
    // every width. display:contents makes this wrapper invisible to bar2's own flex
    // layout (its children lay out as if they were bar2's own direct children,
    // preserving the existing gap/wrap behavior) while still being one element the
    // mobile breakpoint can hide as a unit.
    var zoomGroup = document.createElement("span");
    zoomGroup.className = "gantt-chart-only-control";
    zoomGroup.style.display = "contents";
    bar2.appendChild(zoomGroup);

    var zoomLabel = document.createElement("span");
    zoomLabel.className = "text-secondary";
    zoomLabel.style.fontSize = "var(--text-sm)";
    zoomLabel.style.alignSelf = "center";
    zoomLabel.textContent = "Zoom:";
    zoomGroup.appendChild(zoomLabel);

    ["auto", "day", "week", "month", "quarter", "year"].forEach(function (z) {
      var zBtn = document.createElement("button");
      zBtn.className = "btn " + (uiState.ganttZoom === z ? "btn--primary" : "btn--ghost");
      zBtn.textContent = GANTT_ZOOM_LABELS[z];
      zBtn.onclick = function () {
        uiState.ganttZoom = z;
        rerender();
      };
      zoomGroup.appendChild(zBtn);
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
      // UI/UX Overhaul Gate 8: entirely baseline-overlay controls for the interactive
      // chart — nothing here applies to the mobile timeline, so the whole row hides.
      bar3.className = "toolbar gantt-chart-only-control";
      bar3.style.flexWrap = "wrap";
      bar3.style.marginTop = "var(--space-2)";

      var baselineToggle = document.createElement("label");
      baselineToggle.style.display = "flex";
      baselineToggle.style.alignItems = "center";
      baselineToggle.style.gap = "var(--space-2)";
      baselineToggle.style.fontSize = "var(--text-sm)";
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
        var loadingNote = window.PCC.loadingIndicator.buildInline("Loading baseline…");
        loadingNote.style.alignSelf = "center";
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
    {
      // Gate 11: resource assignments link to an activity the same way the other six
      // sources do (activity_id), so this fits the same array-driven pattern — the
      // one difference is the assignment record itself doesn't carry a display name,
      // so list() decorates each match with the resource's name/unit before label()
      // reads it, rather than label() doing its own lookup with no data reference.
      module: "resources",
      label: function (a) { return "Resource: " + a._resourceName + " (" + a.quantity + (a._unit ? " " + a._unit : "") + ")"; },
      list: function (data, activityId) {
        return data.resource_assignments
          .filter(function (a) { return a.activity_id === activityId; })
          .map(function (a) {
            var resource = data.resources.find(function (r) { return r.id === a.resource_id; });
            return Object.assign({}, a, { _resourceName: resource ? resource.name : "(resource deleted)", _unit: resource ? resource.unit : "" });
          });
      },
      view: function (a) {
        if (window.PCC.resources && window.PCC.resources.expandAssignment) window.PCC.resources.expandAssignment(a.id);
        window.PCC.router.go("resources");
      },
      // PCC Evolution Roadmap, Tier F (Gate 18): "the schedule should show which
      // resources are required for an activity AND WHETHER THOSE RESOURCES ARE
      // AVAILABLE" — this is the one LINKED_RECORD_SOURCES entry that needs a live
      // availability read, not just a label. Runs the full cross-project over-
      // allocation scan (same engine the Leveling tab uses) and checks whether any of
      // THIS activity's own days land on one of that resource's over-allocated days —
      // a resource can be over-allocated portfolio-wide on dates outside this
      // activity's own window, which shouldn't flag this particular assignment.
      badge: function (a, data, activity) {
        var resource = data.resources.find(function (r) { return r.id === a.resource_id; });
        if (!resource) return null;
        if (resource.max_availability == null) return { label: "Availability Unknown", className: "info" };
        var timeline = window.PCC.resourceLevelingEngine.computeResourceUsageTimeline(resource, data.resource_assignments, data.activities);
        var overAlloc = window.PCC.resourceLevelingEngine.detectOverAllocations(resource, timeline, data.resource_unavailability);
        if (overAlloc.count === 0) return { label: "Available", className: "on_track" };
        var dates = resourceActivityEffectiveDates(activity);
        if (!dates.start) return { label: "Over-Allocated (Elsewhere)", className: "at_risk" };
        var conflictInWindow = overAlloc.overAllocatedDays.some(function (d) { return d.date >= dates.start && d.date < dates.finish; });
        return conflictInWindow ? { label: "Over-Allocated", className: "critical" } : { label: "Available", className: "on_track" };
      },
    },
    {
      // PCC Evolution Roadmap, Tier F (Gate 19 follow-on, Commitment Management): a
      // Commitment already links to one activity (Gate 19), but was never added to
      // this array, so a linked commitment never actually showed up in the Activity
      // Detail Panel it points at — the "integrate Schedule with Commitment
      // Management" gap Aditya asked to close.
      module: "commitments",
      label: function (c) { return "Commitment: " + (c.po_contract_number || "(no PO/Contract #)") + " (" + (COMMITMENT_STATUS_LABELS[c.status] || c.status) + ")"; },
      list: function (data, activityId) {
        return data.commitments.filter(function (c) { return c.activity_id === activityId; });
      },
      view: function (c) {
        if (window.PCC.commitments && window.PCC.commitments.expandCommitment) window.PCC.commitments.expandCommitment(c.id);
        window.PCC.router.go("commitments");
      },
      // Procurement lead-time risk: this activity is imminent (starting within
      // COMMITMENT_RISK_WINDOW_DAYS) or already under way, but the commitment behind
      // it isn't approved yet — the work may not actually be covered when it starts.
      // Same "computed, transparent, never fabricated" signal the Resources badge
      // above already establishes for a different kind of readiness.
      badge: function (c, data, activity) {
        if (c.status === "approved") return { label: "Approved", className: "on_track" };
        if (c.status === "closed") return { label: "Closed", className: "on_track" };
        if (c.status === "cancelled") return { label: "Cancelled", className: "info" };
        var dates = resourceActivityEffectiveDates(activity);
        var riskCutoff = addDaysIso(todayIso(), COMMITMENT_RISK_WINDOW_DAYS);
        if (dates.start && dates.start <= riskCutoff) {
          return { label: "Procurement Risk", className: "critical" };
        }
        return { label: COMMITMENT_STATUS_LABELS[c.status] || c.status, className: "info" };
      },
    },
  ];

  var COMMITMENT_STATUS_LABELS = { draft: "Draft", issued: "Issued", approved: "Approved", closed: "Closed", cancelled: "Cancelled" };
  var COMMITMENT_RISK_WINDOW_DAYS = 7;

  function addDaysIso(isoDateStr, days) {
    var d = new Date(isoDateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** Same calculated-wins/planned-falls-back precedence as resourceLevelingEngine.js's
   * own effectiveDates() — duplicated here per this app's per-module-helpers
   * convention (that engine has no DOM/store dependency and shouldn't gain one just to
   * be called from here). */
  function resourceActivityEffectiveDates(activity) {
    if (activity.activity_type === "milestone") return { start: null, finish: null };
    if (activity.early_start && activity.early_finish) return { start: activity.early_start, finish: activity.early_finish };
    if (activity.planned_start && activity.planned_finish) return { start: activity.planned_start, finish: activity.planned_finish };
    return { start: null, finish: null };
  }

  // Gate 10 (Document Control 10: Readiness/Constraints). Same "Available"/"Overdue"/
  // "Required" status computation as pages/portfolio.js's computeRequirementStatus() and
  // pages/vendors.js's own copy — duplicated here per this app's per-module-helpers
  // convention rather than sharing a util layer.
  function computeRequirementStatus(data, projectId, documentTypeId, plannedDate) {
    var available = data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === documentTypeId;
    });
    if (available) return "available";
    if (plannedDate && plannedDate < todayIso()) return "overdue";
    return "required";
  }

  var REQUIREMENT_STATUS_BADGE = {
    available: { className: "complete", label: "Available" },
    overdue: { className: "critical", label: "Overdue" },
    required: { className: "at_risk", label: "Required" },
  };

  /** PCC Evolution Roadmap, Tier 3 ("final polish") — same "Not Ready" rule
   * renderDocumentReadinessSection() below computes for the Activity Detail Panel,
   * factored out here so the Gantt bar's own visual flag can reuse it without
   * duplicating the not-ready computation a second time in this file. An activity with
   * zero linked requirements is never "not ready" — nothing to flag. This was
   * explicitly considered and deferred at Gate 24 (Document Readiness); the Detail
   * Panel section has always had the rule, it just never reached the bar itself. */
  function activityNotReady(activity, data) {
    var typesById = {};
    data.document_types.forEach(function (t) {
      typesById[t.id] = t;
    });
    var rows = data.project_document_requirements.filter(function (r) {
      return r.activity_id === activity.id && typesById[r.document_type_id];
    });
    if (rows.length === 0) return false;
    return rows.some(function (r) {
      return computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date) !== "available";
    });
  }

  /** Reads Gate 21's activity_id link in reverse: every project_document_requirements
   * row that names THIS activity as its governing activity. Pure read-only — nothing is
   * written back, and this never blocks editing/scheduling the activity itself; it's a
   * visibility aid, not an enforced constraint (this app has no workflow-blocking
   * anywhere else either, e.g. Gate 17's document status is a plain select). An activity
   * is "Not Ready" when at least one linked requirement isn't yet Available. */
  function renderDocumentReadinessSection(activity, data) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "var(--space-4)";
    wrap.style.paddingTop = "var(--space-3)";
    wrap.style.borderTop = "1px solid var(--divider)";

    var typesById = {};
    data.document_types.forEach(function (t) {
      typesById[t.id] = t;
    });
    var rows = data.project_document_requirements.filter(function (r) {
      return r.activity_id === activity.id && typesById[r.document_type_id];
    });

    var heading = document.createElement("p");
    heading.className = "detail-item__label";
    heading.style.marginBottom = "var(--space-2)";
    heading.textContent = "DOCUMENT READINESS (" + rows.length + ")";
    wrap.appendChild(heading);

    if (rows.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "var(--text-sm)";
      empty.textContent =
        "No document requirements are linked to this activity yet — link one from Portfolio's Add/Edit Project form (Document Requirements section).";
      wrap.appendChild(empty);
      return wrap;
    }

    var statuses = rows.map(function (r) {
      return computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date);
    });
    var notReady = statuses.some(function (s) {
      return s !== "available";
    });

    var readinessLine = document.createElement("p");
    readinessLine.style.fontSize = "var(--text-sm)";
    readinessLine.style.fontWeight = "600";
    readinessLine.style.margin = "0 0 var(--space-2)";
    readinessLine.style.color = notReady ? "var(--status-critical)" : "var(--status-on-track)";
    readinessLine.textContent = notReady ? "NOT READY — one or more governing documents are not yet Available" : "READY — every governing document is Available";
    wrap.appendChild(readinessLine);

    rows.forEach(function (r, idx) {
      var t = typesById[r.document_type_id];
      var badgeInfo = REQUIREMENT_STATUS_BADGE[statuses[idx]];

      var rowEl = document.createElement("div");
      rowEl.style.display = "flex";
      rowEl.style.justifyContent = "space-between";
      rowEl.style.alignItems = "center";
      rowEl.style.fontSize = "var(--text-sm)";
      rowEl.style.marginBottom = "var(--space-1)";

      var text = document.createElement("span");
      text.textContent = t.name + (t.code ? " (" + t.code + ")" : "") + (r.planned_submission_date ? " — due " + r.planned_submission_date : "");
      rowEl.appendChild(text);

      var badge = document.createElement("span");
      badge.className = "status-badge status-badge--" + badgeInfo.className;
      badge.style.fontSize = "var(--text-xs)";
      badge.textContent = badgeInfo.label;
      rowEl.appendChild(badge);

      wrap.appendChild(rowEl);
    });

    return wrap;
  }

  function renderLinkedRecordsSection(activity, data) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "var(--space-4)";
    wrap.style.paddingTop = "var(--space-3)";
    wrap.style.borderTop = "1px solid var(--divider)";

    var rows = [];
    LINKED_RECORD_SOURCES.forEach(function (source) {
      source.list(data, activity.id).forEach(function (record) {
        rows.push({
          text: source.label(record),
          view: function () { source.view(record); },
          badge: source.badge ? source.badge(record, data, activity) : null,
        });
      });
    });

    var heading = document.createElement("p");
    heading.className = "detail-item__label";
    heading.style.marginBottom = "var(--space-2)";
    heading.textContent = "LINKED RECORDS (" + rows.length + ")";
    wrap.appendChild(heading);

    if (rows.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "var(--text-sm)";
      empty.textContent = "No Risks/Issues, RFIs, Meetings, Documents, Daily Log entries, or Change Orders are linked to this activity yet — link one from that record's own Add/Edit form.";
      wrap.appendChild(empty);
    } else {
      // Redesign Gate 10 (Module Consistency Pass): retrofitted onto the same
      // .attention-list/.attention-item primitive every other panel-turned-list in this
      // app now uses, replacing the original hand-built row + optional status-badge +
      // separate "View" ghost button. Whole row is the click target now; the optional
      // per-source badge (Resources' availability, Commitments' procurement risk) moves
      // into the icon color plus the meta line rather than a separate badge element.
      var list = document.createElement("div");
      list.className = "attention-list";
      rows.forEach(function (row) {
        var rowEl = document.createElement("div");
        rowEl.className = "attention-item attention-item--clickable";
        rowEl.onclick = row.view;

        var icon = document.createElement("span");
        icon.className = "attention-item__icon attention-item__icon--" + (row.badge ? row.badge.className : "info");
        rowEl.appendChild(icon);

        var body = document.createElement("div");
        body.className = "attention-item__body";
        var text = document.createElement("div");
        text.className = "attention-item__text";
        text.textContent = row.text;
        body.appendChild(text);
        if (row.badge) {
          var meta = document.createElement("div");
          meta.className = "attention-item__meta";
          meta.textContent = row.badge.label;
          body.appendChild(meta);
        }
        rowEl.appendChild(body);

        list.appendChild(rowEl);
      });
      wrap.appendChild(list);
    }

    return wrap;
  }

  function recoveryActionOverdue(action) {
    if (action.status === "completed" || action.status === "cancelled") return false;
    if (!action.target_recovery_date) return false;
    return action.target_recovery_date < todayIso();
  }

  /** PCC Evolution Roadmap, Tier C: Delay & Recovery Management. Corrective actions
   * logged against THIS activity — full CRUD inline, same "add/edit/remove within the
   * record's own detail view" pattern vendors.js's renderPerformanceTab() uses for
   * vendor reviews. Deliberately not gated on the activity currently showing delay in
   * an open baseline compare (Gate 4) — see newRecoveryAction()'s header comment in
   * store.js for why. */
  function renderRecoveryActionsSection(activity, data, rerender) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "var(--space-4)";
    wrap.style.paddingTop = "var(--space-3)";
    wrap.style.borderTop = "1px solid var(--divider)";

    var rows = data.recovery_actions
      .filter(function (r) { return r.activity_id === activity.id; })
      .sort(function (a, b) { return (a.target_recovery_date || "9999-99-99").localeCompare(b.target_recovery_date || "9999-99-99"); });

    var heading = document.createElement("p");
    heading.className = "detail-item__label";
    heading.style.marginBottom = "var(--space-2)";
    heading.textContent = "RECOVERY ACTIONS (" + rows.length + ")";
    wrap.appendChild(heading);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--ghost";
    addBtn.style.marginBottom = "var(--space-2)";
    addBtn.textContent = "+ Add Recovery Action";
    addBtn.onclick = function () {
      uiState.editingRecoveryActionId = "new";
      rerender();
    };
    wrap.appendChild(addBtn);

    if (uiState.editingRecoveryActionId) {
      var editing =
        uiState.editingRecoveryActionId === "new"
          ? window.PCC.store.newRecoveryAction({ activity_id: activity.id, project_id: activity.project_id })
          : data.recovery_actions.find(function (r) { return r.id === uiState.editingRecoveryActionId; });
      if (editing) {
        var formPanel = document.createElement("div");
        formPanel.className = "panel";
        formPanel.style.marginBottom = "var(--space-3)";
        var form = document.createElement("form");
        var grid = document.createElement("div");
        grid.className = "form-grid";

        var descField = document.createElement("div");
        descField.style.gridColumn = "1 / -1";
        descField.className = "field";
        descField.innerHTML = "<label>Description *</label>";
        var descInput = document.createElement("textarea");
        descInput.id = "recactionfield-description";
        descInput.rows = 2;
        descInput.value = editing.description || "";
        descField.appendChild(descInput);
        grid.appendChild(descField);

        var respField = document.createElement("div");
        respField.className = "field";
        respField.innerHTML = "<label>Responsible Person</label>";
        var respInput = document.createElement("input");
        respInput.type = "text";
        respInput.id = "recactionfield-responsible_person";
        respInput.value = editing.responsible_person || "";
        respField.appendChild(respInput);
        grid.appendChild(respField);

        var dateField = document.createElement("div");
        dateField.className = "field";
        dateField.innerHTML = "<label>Target Recovery Date</label>";
        var dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.id = "recactionfield-target_recovery_date";
        dateInput.value = editing.target_recovery_date || "";
        dateField.appendChild(dateInput);
        grid.appendChild(dateField);

        var statusField = document.createElement("div");
        statusField.className = "field";
        statusField.innerHTML = "<label>Status</label>";
        var statusSelect = document.createElement("select");
        statusSelect.id = "recactionfield-status";
        window.PCC.store.RECOVERY_ACTION_STATUSES.forEach(function (s) {
          var opt = document.createElement("option");
          opt.value = s;
          opt.textContent = RECOVERY_ACTION_STATUS_LABELS[s];
          statusSelect.appendChild(opt);
        });
        statusSelect.value = editing.status || "open";
        statusField.appendChild(statusSelect);
        grid.appendChild(statusField);

        // Gate 24: quantifying the recovery option, not just tracking it as a to-do.
        // Explore the impact with the What-If tab first if you want a CPM-backed
        // estimate rather than a guess.
        var recDaysField = document.createElement("div");
        recDaysField.className = "field";
        recDaysField.innerHTML = "<label>Estimated Recovery (days)</label>";
        var recDaysInput = document.createElement("input");
        recDaysInput.type = "number";
        recDaysInput.id = "recactionfield-estimated_recovery_days";
        recDaysInput.value = editing.estimated_recovery_days == null ? "" : editing.estimated_recovery_days;
        recDaysField.appendChild(recDaysInput);
        grid.appendChild(recDaysField);

        var costField = document.createElement("div");
        costField.className = "field";
        costField.innerHTML = "<label>Estimated Cost</label>";
        var costInput = document.createElement("input");
        costInput.type = "number";
        costInput.id = "recactionfield-estimated_cost";
        costInput.value = editing.estimated_cost == null ? "" : editing.estimated_cost;
        costField.appendChild(costInput);
        grid.appendChild(costField);

        form.appendChild(grid);

        var errorMsg = document.createElement("p");
        errorMsg.style.color = "var(--status-critical)";
        errorMsg.style.fontSize = "var(--text-sm)";
        errorMsg.style.display = "none";
        form.appendChild(errorMsg);

        var formActions = document.createElement("div");
        formActions.style.display = "flex";
        formActions.style.gap = "var(--space-3)";
        formActions.style.marginTop = "var(--space-3)";
        var saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "btn btn--primary";
        saveBtn.textContent = uiState.editingRecoveryActionId === "new" ? "Add Recovery Action" : "Save Changes";
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn--ghost";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = function () {
          uiState.editingRecoveryActionId = null;
          rerender();
        };
        formActions.appendChild(saveBtn);
        formActions.appendChild(cancelBtn);
        form.appendChild(formActions);

        form.onsubmit = function (e) {
          e.preventDefault();
          if (!descInput.value.trim()) {
            errorMsg.textContent = "Description is required.";
            errorMsg.style.display = "block";
            return;
          }
          errorMsg.style.display = "none";
          var values = {
            description: descInput.value.trim(),
            responsible_person: respInput.value,
            target_recovery_date: dateInput.value,
            status: statusSelect.value,
            estimated_recovery_days: recDaysInput.value === "" ? null : Number(recDaysInput.value),
            estimated_cost: costInput.value === "" ? null : Number(costInput.value),
            updated_at: new Date().toISOString(),
          };
          window.PCC.store.update(function (d) {
            if (uiState.editingRecoveryActionId === "new") {
              d.recovery_actions.push(window.PCC.store.newRecoveryAction(Object.assign({ activity_id: activity.id, project_id: activity.project_id }, values)));
            } else {
              var existing = d.recovery_actions.find(function (r) { return r.id === editing.id; });
              if (existing) Object.assign(existing, values);
            }
          });
          window.PCC.notify("Recovery action saved.", "success");
          uiState.editingRecoveryActionId = null;
          rerender();
        };

        formPanel.appendChild(form);
        wrap.appendChild(formPanel);
      }
    }

    if (rows.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "var(--text-sm)";
      empty.textContent = "No recovery actions logged against this activity yet.";
      wrap.appendChild(empty);
      return wrap;
    }

    rows.forEach(function (r) {
      var overdue = recoveryActionOverdue(r);
      var rowEl = document.createElement("div");
      rowEl.style.display = "flex";
      rowEl.style.justifyContent = "space-between";
      rowEl.style.alignItems = "flex-start";
      rowEl.style.gap = "var(--space-2)";
      rowEl.style.marginBottom = "var(--space-2)";
      rowEl.style.fontSize = "var(--text-sm)";

      var left = document.createElement("div");
      left.innerHTML =
        "<strong>" + r.description + "</strong>" +
        "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
        (r.responsible_person ? r.responsible_person + " · " : "") +
        (r.target_recovery_date ? "target " + r.target_recovery_date : "no target date") +
        (r.estimated_recovery_days != null ? " · est. " + r.estimated_recovery_days + "d recovery" : "") +
        (fmtMoney(r.estimated_cost) != null ? " · est. cost " + fmtMoney(r.estimated_cost) : "") +
        "</p>";
      rowEl.appendChild(left);

      var right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "var(--space-2)";
      right.style.flexShrink = "0";

      var badge = document.createElement("span");
      badge.className =
        "status-badge status-badge--" +
        (overdue ? "critical" : r.status === "completed" ? "complete" : r.status === "cancelled" ? "info" : "at_risk");
      badge.style.fontSize = "var(--text-xs)";
      badge.textContent = overdue ? "Overdue" : RECOVERY_ACTION_STATUS_LABELS[r.status];
      right.appendChild(badge);

      var editRowBtn = document.createElement("button");
      editRowBtn.className = "btn btn--ghost";
      editRowBtn.textContent = "Edit";
      editRowBtn.onclick = function () {
        uiState.editingRecoveryActionId = r.id;
        rerender();
      };
      right.appendChild(editRowBtn);

      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Remove";
      removeBtn.onclick = function () {
        window.PCC.store.update(function (d) { d.recovery_actions = d.recovery_actions.filter(function (x) { return x.id !== r.id; }); });
        rerender();
      };
      right.appendChild(removeBtn);

      rowEl.appendChild(right);
      wrap.appendChild(rowEl);
    });

    return wrap;
  }

  /** PCC Evolution Roadmap, Tier F: Advanced Delay Analysis (Gate 23). Delay EVENTS
   * logged against THIS activity — why it happened, whose responsibility, and whether
   * it's excusable — as its own structured register, distinct from Recovery Actions
   * above (which track the corrective response, not the cause). Same inline full-CRUD
   * pattern as renderRecoveryActionsSection() immediately above, deliberately mirrored
   * rather than sharing a helper — the two forms have different fields entirely, and
   * this app's own convention favors small per-purpose builders over a generalized one. */
  function renderDelayRecordsSection(activity, data, rerender) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "var(--space-4)";
    wrap.style.paddingTop = "var(--space-3)";
    wrap.style.borderTop = "1px solid var(--divider)";

    var rows = data.delay_records
      .filter(function (r) { return r.activity_id === activity.id; })
      .sort(function (a, b) { return (b.identified_date || "").localeCompare(a.identified_date || ""); });

    var heading = document.createElement("p");
    heading.className = "detail-item__label";
    heading.style.marginBottom = "var(--space-2)";
    heading.textContent = "DELAY RECORDS (" + rows.length + ")";
    wrap.appendChild(heading);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--ghost";
    addBtn.style.marginBottom = "var(--space-2)";
    addBtn.textContent = "+ Add Delay Record";
    addBtn.onclick = function () {
      uiState.editingDelayRecordId = "new";
      rerender();
    };
    wrap.appendChild(addBtn);

    if (uiState.editingDelayRecordId) {
      var editing =
        uiState.editingDelayRecordId === "new"
          ? window.PCC.store.newDelayRecord({ activity_id: activity.id, project_id: activity.project_id })
          : data.delay_records.find(function (r) { return r.id === uiState.editingDelayRecordId; });
      if (editing) {
        var formPanel = document.createElement("div");
        formPanel.className = "panel";
        formPanel.style.marginBottom = "var(--space-3)";
        var form = document.createElement("form");
        var grid = document.createElement("div");
        grid.className = "form-grid";

        var causeField = document.createElement("div");
        causeField.className = "field";
        causeField.innerHTML = "<label>Delay Cause</label>";
        var causeSelect = document.createElement("select");
        causeSelect.id = "delayfield-delay_cause";
        window.PCC.store.DELAY_RECORD_CAUSES.forEach(function (c) {
          var opt = document.createElement("option");
          opt.value = c;
          opt.textContent = DELAY_CAUSE_LABELS[c];
          causeSelect.appendChild(opt);
        });
        causeSelect.value = editing.delay_cause || "other";
        causeField.appendChild(causeSelect);
        grid.appendChild(causeField);

        var daysField = document.createElement("div");
        daysField.className = "field";
        daysField.innerHTML = "<label>Delay Days</label>";
        var daysInput = document.createElement("input");
        daysInput.type = "number";
        daysInput.id = "delayfield-delay_days";
        daysInput.value = editing.delay_days == null ? "" : editing.delay_days;
        daysField.appendChild(daysInput);
        grid.appendChild(daysField);

        var identifiedField = document.createElement("div");
        identifiedField.className = "field";
        identifiedField.innerHTML = "<label>Identified Date</label>";
        var identifiedInput = document.createElement("input");
        identifiedInput.type = "date";
        identifiedInput.id = "delayfield-identified_date";
        identifiedInput.value = editing.identified_date || "";
        identifiedField.appendChild(identifiedInput);
        grid.appendChild(identifiedField);

        var respField = document.createElement("div");
        respField.className = "field";
        respField.innerHTML = "<label>Responsible Party</label>";
        var respInput = document.createElement("input");
        respInput.type = "text";
        respInput.id = "delayfield-responsible_party";
        respInput.value = editing.responsible_party || "";
        respField.appendChild(respInput);
        grid.appendChild(respField);

        var excusableField = document.createElement("div");
        excusableField.className = "field";
        var excusableLabel = document.createElement("label");
        excusableLabel.style.display = "flex";
        excusableLabel.style.alignItems = "center";
        excusableLabel.style.gap = "var(--space-2)";
        var excusableCheckbox = document.createElement("input");
        excusableCheckbox.type = "checkbox";
        excusableCheckbox.id = "delayfield-is_excusable";
        excusableCheckbox.checked = !!editing.is_excusable;
        excusableLabel.appendChild(excusableCheckbox);
        excusableLabel.appendChild(document.createTextNode("Excusable"));
        excusableField.appendChild(excusableLabel);
        grid.appendChild(excusableField);

        var descField = document.createElement("div");
        descField.style.gridColumn = "1 / -1";
        descField.className = "field";
        descField.innerHTML = "<label>Description *</label>";
        var descInput = document.createElement("textarea");
        descInput.id = "delayfield-description";
        descInput.rows = 2;
        descInput.value = editing.description || "";
        descField.appendChild(descInput);
        grid.appendChild(descField);

        form.appendChild(grid);

        var errorMsg = document.createElement("p");
        errorMsg.style.color = "var(--status-critical)";
        errorMsg.style.fontSize = "var(--text-sm)";
        errorMsg.style.display = "none";
        form.appendChild(errorMsg);

        var formActions = document.createElement("div");
        formActions.style.display = "flex";
        formActions.style.gap = "var(--space-3)";
        formActions.style.marginTop = "var(--space-3)";
        var saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "btn btn--primary";
        saveBtn.textContent = uiState.editingDelayRecordId === "new" ? "Add Delay Record" : "Save Changes";
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn--ghost";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = function () {
          uiState.editingDelayRecordId = null;
          rerender();
        };
        formActions.appendChild(saveBtn);
        formActions.appendChild(cancelBtn);
        form.appendChild(formActions);

        form.onsubmit = function (e) {
          e.preventDefault();
          if (!descInput.value.trim()) {
            errorMsg.textContent = "Description is required.";
            errorMsg.style.display = "block";
            return;
          }
          errorMsg.style.display = "none";
          var values = {
            delay_cause: causeSelect.value,
            delay_days: daysInput.value === "" ? null : Number(daysInput.value),
            identified_date: identifiedInput.value,
            responsible_party: respInput.value,
            is_excusable: excusableCheckbox.checked,
            description: descInput.value.trim(),
            updated_at: new Date().toISOString(),
          };
          window.PCC.store.update(function (d) {
            if (uiState.editingDelayRecordId === "new") {
              d.delay_records.push(window.PCC.store.newDelayRecord(Object.assign({ activity_id: activity.id, project_id: activity.project_id }, values)));
            } else {
              var existing = d.delay_records.find(function (r) { return r.id === editing.id; });
              if (existing) Object.assign(existing, values);
            }
          });
          window.PCC.notify("Delay record saved.", "success");
          uiState.editingDelayRecordId = null;
          rerender();
        };

        formPanel.appendChild(form);
        wrap.appendChild(formPanel);
      }
    }

    if (rows.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "var(--text-sm)";
      empty.textContent = "No delay records logged against this activity yet.";
      wrap.appendChild(empty);
      return wrap;
    }

    rows.forEach(function (r) {
      var rowEl = document.createElement("div");
      rowEl.style.display = "flex";
      rowEl.style.justifyContent = "space-between";
      rowEl.style.alignItems = "flex-start";
      rowEl.style.gap = "var(--space-2)";
      rowEl.style.marginBottom = "var(--space-2)";
      rowEl.style.fontSize = "var(--text-sm)";

      var left = document.createElement("div");
      left.innerHTML =
        "<strong>" + r.description + "</strong>" +
        "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
        DELAY_CAUSE_LABELS[r.delay_cause] +
        (r.responsible_party ? " · " + r.responsible_party : "") +
        (r.delay_days != null ? " · " + r.delay_days + "d" : "") +
        (r.identified_date ? " · identified " + r.identified_date : "") +
        "</p>";
      rowEl.appendChild(left);

      var right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "var(--space-2)";
      right.style.flexShrink = "0";

      var badge = document.createElement("span");
      badge.className = "status-badge status-badge--" + (r.is_excusable ? "complete" : "at_risk");
      badge.style.fontSize = "var(--text-xs)";
      badge.textContent = r.is_excusable ? "Excusable" : "Non-Excusable";
      right.appendChild(badge);

      var editRowBtn = document.createElement("button");
      editRowBtn.className = "btn btn--ghost";
      editRowBtn.textContent = "Edit";
      editRowBtn.onclick = function () {
        uiState.editingDelayRecordId = r.id;
        rerender();
      };
      right.appendChild(editRowBtn);

      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Remove";
      removeBtn.onclick = function () {
        window.PCC.store.update(function (d) { d.delay_records = d.delay_records.filter(function (x) { return x.id !== r.id; }); });
        rerender();
      };
      right.appendChild(removeBtn);

      rowEl.appendChild(right);
      wrap.appendChild(rowEl);
    });

    return wrap;
  }

  /** PCC Evolution Roadmap, Tier F (Gate 26, Integrated Project Controls) — a small note
   * between the two sections above: the same per-activity Delay <-> Recovery gap
   * computation as executiveCenter.js's buildProjectContext() and
   * delayRecoveryDashboard.js's portfolio-wide rollup (see either's own comment for the
   * full reasoning: only open recovery actions count, floored at 0), scoped to just
   * this one activity. Independently re-derived here rather than calling into either of
   * those pages, per this app's established per-module-duplication convention
   * (recoveryActionOverdue() above is the same pattern). Returns null when the activity
   * has no delay logged, so the caller can skip appending anything. */
  function renderDelayRecoveryGapNote(activity, data) {
    var delayDays = data.delay_records
      .filter(function (r) { return r.activity_id === activity.id; })
      .reduce(function (sum, r) { return sum + (r.delay_days || 0); }, 0);
    if (delayDays === 0) return null;
    var recoveryDays = data.recovery_actions
      .filter(function (r) { return r.activity_id === activity.id && (r.status === "open" || r.status === "in_progress"); })
      .reduce(function (sum, r) { return sum + (r.estimated_recovery_days || 0); }, 0);
    var gapDays = Math.max(0, delayDays - recoveryDays);
    var note = document.createElement("p");
    note.className = "text-secondary";
    note.style.fontSize = "var(--text-sm)";
    note.style.margin = "var(--space-3) 0 0";
    note.textContent =
      gapDays > 0
        ? delayDays + "d delay logged, " + recoveryDays + "d recovery estimated — " + gapDays + "d unaddressed."
        : delayDays + "d delay logged, " + recoveryDays + "d recovery estimated — fully addressed.";
    return note;
  }

  function renderActivityDetailPanel(container, activity, data, wbsItems, scheduleActivities, relationships, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";
    panel.style.borderColor = "var(--signal-amber)";

    var header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "flex-start";
    header.style.marginBottom = "var(--space-3)";
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
    item("Out of Sequence", activity.is_out_of_sequence ? "Yes — actual progress preceded predecessor logic" : "No");
    item("% Complete", (activity.percent_complete || 0) + "%");
    item("Physical Progress", (activity.physical_progress || 0) + "%");
    item("Discipline", activity.discipline);
    item("Contractor", activity.contractor);
    item("Responsible Person", activity.responsible_person);
    item(
      "Vendor",
      activity.vendor_id
        ? (function () {
            var v = data.vendors.find(function (x) { return x.id === activity.vendor_id; });
            return v ? v.vendor_name || "(unnamed vendor)" : "(deleted vendor)";
          })()
        : ""
    );
    item("Constraint", activity.constraint_type ? activity.constraint_type + (activity.constraint_date ? " (" + activity.constraint_date + ")" : "") : "");
    panel.appendChild(grid);

    if (activity.notes) {
      var notesP = document.createElement("p");
      notesP.style.marginTop = "var(--space-3)";
      notesP.style.fontSize = "var(--text-sm)";
      notesP.innerHTML = "<strong>Notes:</strong> " + activity.notes;
      panel.appendChild(notesP);
    }

    var preds = relationships.filter(function (r) { return r.successor_id === activity.id; });
    var succs = relationships.filter(function (r) { return r.predecessor_id === activity.id; });

    var relWrap = document.createElement("div");
    relWrap.style.marginTop = "var(--space-3)";
    relWrap.style.fontSize = "var(--text-sm)";
    var predLine = document.createElement("p");
    predLine.innerHTML =
      "<strong>Predecessors:</strong> " +
      (preds.length ? preds.map(function (r) { return activityName(scheduleActivities, r.predecessor_id) + " (" + r.type + (r.lag ? ", lag " + r.lag : "") + ")"; }).join(", ") : "none");
    var succLine = document.createElement("p");
    succLine.style.marginTop = "var(--space-1)";
    succLine.innerHTML =
      "<strong>Successors:</strong> " +
      (succs.length ? succs.map(function (r) { return activityName(scheduleActivities, r.successor_id) + " (" + r.type + (r.lag ? ", lag " + r.lag : "") + ")"; }).join(", ") : "none");
    relWrap.appendChild(predLine);
    relWrap.appendChild(succLine);
    panel.appendChild(relWrap);

    panel.appendChild(renderLinkedRecordsSection(activity, data));
    panel.appendChild(renderDocumentReadinessSection(activity, data));
    panel.appendChild(renderRecoveryActionsSection(activity, data, rerender));
    panel.appendChild(renderDelayRecordsSection(activity, data, rerender));
    var gapNote = renderDelayRecoveryGapNote(activity, data);
    if (gapNote) panel.appendChild(gapNote);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-4)";

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

    // UI/UX Overhaul Gate 7 (Side-by-Side Views): captured rather than appended
    // straight to container — see the appendChild(wrap) site below for why (it moves
    // this into a side-by-side row with the chart once the chart itself is ready).
    var detailPanelEl = null;
    if (uiState.ganttDetailActivityId) {
      var detailActivity = allActivities.find(function (a) { return a.id === uiState.ganttDetailActivityId; });
      if (detailActivity) {
        detailPanelEl = document.createElement("div");
        renderActivityDetailPanel(detailPanelEl, detailActivity, data, wbsItems, allActivities, relationships, rerender);
        container.appendChild(detailPanelEl);
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
      note.style.fontSize = "var(--text-sm)";
      note.style.marginBottom = "var(--space-3)";
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
    // 44 (was 28): the axis date ticks sit at y=12; Today/Data Date labels need their
    // own space below that, not sharing a y-coordinate with them — see the marker
    // block below for why this was bumped (a real overlap bug, not a stylistic choice).
    var headerHeight = 44;
    var chartWidth = labelWidth + totalSpanDays * pxPerDay;
    var chartHeight = headerHeight + layout.rows.length * rowHeight + 6;

    function xForDate(iso) {
      return labelWidth + (diffDays(layout.rangeStart, iso) + bufferDays) * pxPerDay;
    }

    var wrap = document.createElement("div");
    // UI/UX Overhaul Gate 8: gantt-chart-panel is a stable hook for hiding just the
    // interactive SVG chart at mobile widths (see the CSS's own comment) — a separate
    // .gantt-mobile-timeline (built below, once the chart itself is ready) takes over
    // at that breakpoint instead, same "always build both, let CSS pick" approach as
    // the Activities tab's mobile card fallback.
    wrap.className = "panel gantt-chart-panel";
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

    // Data Date / Today markers. Bug fix: these two labels used to sit at fixed y=12
    // (Today) and y=24 (Data Date) regardless of how close their lines were in x — y=12
    // is the SAME row the axis date ticks above already use, so whenever Today (or Data
    // Date) landed near a tick (common — "today" is often close to "now" on the axis),
    // the tick's own date text and "Today" collided directly, rendering as illegible
    // overlapping glyphs. Data Date and Today can also coincide or sit within a day or
    // two of each other (the data date is usually close to today by definition), which
    // made the two marker labels themselves collide. Fixed by: (1) giving the marker
    // labels their own vertical band below the axis-tick row entirely (headerHeight
    // bumped above), and (2) only stacking Today/Data Date into two rows when their
    // lines are actually close enough in x for the labels to overlap — otherwise both
    // sit on the same row, which is the common case and reads better un-stacked.
    var ddx = layout.dataDate ? xForDate(layout.dataDate) : null;
    var todayMarkerIso = todayIso();
    var todayInRange = todayMarkerIso >= layout.rangeStart && todayMarkerIso <= layout.rangeEnd;
    var tdx = todayInRange ? xForDate(todayMarkerIso) : null;
    // ~60px comfortably covers "Data Date" at 10px bold font plus its 4px left margin —
    // wider than the labels can ever need, so this only fires when they'd truly overlap.
    var markersClose = ddx !== null && tdx !== null && Math.abs(ddx - tdx) < 60;
    var ddLabelY = markersClose ? headerHeight - 6 : headerHeight - 12;
    var tdLabelY = markersClose ? headerHeight - 18 : headerHeight - 12;

    // Data date marker, if the schedule has one set.
    if (ddx !== null) {
      svg.appendChild(
        svgEl("line", {
          x1: ddx, y1: 0, x2: ddx, y2: chartHeight,
          stroke: "var(--signal-amber)", "stroke-width": 2, "stroke-dasharray": "4,3",
        })
      );
      var ddLabel = svgEl("text", { x: ddx + 4, y: ddLabelY, "font-size": 10, fill: "var(--signal-amber)", "font-weight": "600" });
      ddLabel.textContent = "Data Date";
      svg.appendChild(ddLabel);
    }

    // Today line — distinct from Data Date (Section 4/7's spec calls out both). Only
    // drawn when it falls inside the chart's own date range, same guard the Data Date
    // marker doesn't currently need since it's always derived from within the schedule.
    if (tdx !== null) {
      svg.appendChild(
        svgEl("line", { x1: tdx, y1: 0, x2: tdx, y2: chartHeight, stroke: "var(--status-on-track)", "stroke-width": 2 })
      );
      var tdLabel = svgEl("text", { x: tdx + 4, y: tdLabelY, "font-size": 10, fill: "var(--status-on-track)", "font-weight": "600" });
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

    var activityById = {};
    activities.forEach(function (a) { activityById[a.id] = a; });

    var rowsLayer = svgEl("g", {});
    svg.appendChild(rowsLayer);

    function renderRow(row, i) {
      var y = headerHeight + i * rowHeight;
      var rowCenter = y + rowHeight / 2;
      var activity = activityById[row.id];

      var divider = svgEl("line", {
        x1: 0, y1: y + rowHeight, x2: chartWidth, y2: y + rowHeight,
        stroke: "var(--divider)", "stroke-width": 1,
      });
      rowsLayer.appendChild(divider);

      var labelText = svgEl("text", { x: 6, y: rowCenter + 4, "font-size": 11, fill: "var(--text-primary)", style: "cursor:pointer;" });
      labelText.textContent = truncateLabel(row.name, 26);
      var titleEl = svgEl("title");
      titleEl.textContent = row.name;
      labelText.appendChild(titleEl);
      labelText.addEventListener("click", function () {
        uiState.ganttDetailActivityId = row.id;
        rerender();
      });
      rowsLayer.appendChild(labelText);

      // Baseline ghost, if this row has a matched baseline activity — drawn as a thin
      // outline directly above/behind the current bar's row, before the current bar so
      // the current (authoritative) bar always paints on top.
      var baselineRow = baselineByMatchKey[matchKeyFor(activity || { id: row.id, external_id: null })];
      if (baselineRow && !baselineRow.isMilestone && !row.isMilestone) {
        var blBarX = xForDate(baselineRow.start);
        var blBarW = Math.max((baselineRow.durationDays || 0) * pxPerDay, 3);
        rowsLayer.appendChild(
          svgEl("rect", {
            x: blBarX, y: y + rowHeight - 7, width: blBarW, height: 4, rx: 2,
            fill: "none", stroke: "var(--text-secondary)", "stroke-width": 1.5, "stroke-dasharray": "2,2",
          })
        );
      }

      if (row.dateSource === "none") {
        var noneText = svgEl("text", { x: labelWidth + 4, y: rowCenter + 4, "font-size": 11, fill: "var(--text-secondary)", "font-style": "italic" });
        noneText.textContent = "No dates set";
        rowsLayer.appendChild(noneText);
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
        rowsLayer.appendChild(diamond);
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
      rowsLayer.appendChild(barRect);

      var progressRect = null;
      if (row.percentComplete > 0) {
        var progressW = Math.max(barW * Math.min(row.percentComplete, 100) / 100, row.percentComplete > 0 ? 2 : 0);
        progressRect = svgEl("rect", { x: barX, y: barY, width: progressW, height: barH, rx: 3, fill: baseColor, style: "pointer-events:none;" });
        rowsLayer.appendChild(progressRect);
      }

      // PCC Evolution Roadmap, Tier 3 ("final polish") — a small marker at the bar's
      // top-right corner when the activity has a not-yet-available governing document,
      // same rule the Activity Detail Panel's own Document Readiness section already
      // computes. pointer-events:none so it never interferes with drag/resize hit-testing.
      if (activity && activityNotReady(activity, data)) {
        var readinessMarker = svgEl("circle", {
          cx: barX + barW - 1, cy: barY - 1, r: 5,
          fill: "var(--status-critical)", stroke: "var(--bg-paper)", "stroke-width": 1,
          "data-readiness-marker-for": activity.id,
          style: "pointer-events:none;",
        });
        var readinessTitle = svgEl("title");
        readinessTitle.textContent = "Not Ready — one or more governing documents are not yet Available";
        readinessMarker.appendChild(readinessTitle);
        rowsLayer.appendChild(readinessMarker);
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
        rowsLayer.appendChild(handle);
        attachGanttDrag(barRect, progressRect, activity, "resize", pxPerDay, rerender, handle);
      }
    }

    // Tier 3 "final polish" — Gantt virtualization. Only the rows inside the current
    // scroll viewport (plus a small buffer) get real DOM; `visibleRowRange()` (pure,
    // in scheduleGanttLayout.js) decides the slice from `wrap`'s own scroll metrics.
    // `wrap` must already be attached to `container` before this runs, since a detached
    // element's `clientHeight` reads 0 same as jsdom's permanent 0 — the fallback in
    // `visibleRowRange()` for that case is "render every row," which is exactly the
    // pre-virtualization behavior every pre-existing Gantt test already depends on.
    var GANTT_ROW_BUFFER = 15;
    var renderedRange = { start: -1, end: -1 };

    function renderRowsLayer() {
      var range = window.PCC.scheduleGanttLayout.visibleRowRange(
        layout.rows.length, wrap.scrollTop, wrap.clientHeight, rowHeight, headerHeight, GANTT_ROW_BUFFER
      );
      if (range.start === renderedRange.start && range.end === renderedRange.end) return;
      renderedRange = range;
      while (rowsLayer.firstChild) rowsLayer.removeChild(rowsLayer.firstChild);
      for (var i = range.start; i < range.end; i++) {
        renderRow(layout.rows[i], i);
      }
    }

    wrap.appendChild(svg);

    // UI/UX Overhaul Gate 7 (Side-by-Side Views): once the chart itself is ready to
    // render, move the Activity Detail Panel (if open) out of its earlier full-width
    // position and into a side-by-side row with the chart — same two-panel pattern
    // Documents' register+preview already established. Deferred to here (rather than
    // building the row from the start) so every early-return path above this point
    // (the "no dated activities" empty state, etc.) keeps its EXISTING behavior of
    // showing the detail panel full-width regardless of whether the chart itself can
    // render — DOM surgery (detach + re-wrap), not a rebuild, so nothing about the
    // panel's own already-rendered content/listeners is disturbed.
    // chartRowEl is whatever actually ends up as container's own direct child here —
    // wrap itself when there's no detail panel, or the new row wrapping both when
    // there is. Everything below that needs to position something relative to "the
    // chart" (the jump-controls bar) must use THIS, not wrap directly — wrap stops
    // being a direct child of container the moment it's nested inside the row.
    var chartRowEl;
    if (detailPanelEl) {
      container.removeChild(detailPanelEl);
      detailPanelEl.classList.add("gantt-detail-pane");
      var ganttLayoutRow = document.createElement("div");
      ganttLayoutRow.className = "gantt-layout-row";
      ganttLayoutRow.appendChild(wrap);
      ganttLayoutRow.appendChild(detailPanelEl);
      container.appendChild(ganttLayoutRow);
      chartRowEl = ganttLayoutRow;
    } else {
      container.appendChild(wrap);
      chartRowEl = wrap;
    }

    renderRowsLayer();
    var ganttScrollRafPending = false;
    var scheduleNextFrame = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (cb) { cb(); };
    wrap.addEventListener("scroll", function () {
      if (ganttScrollRafPending) return;
      ganttScrollRafPending = true;
      scheduleNextFrame(function () {
        ganttScrollRafPending = false;
        renderRowsLayer();
      });
    });

    // Jump controls — scroll the chart's own container to a meaningful date. Built
    // after the chart so xForDate/wrap are already in scope; appended to the toolbar
    // area visually via being placed right above the chart panel. gantt-chart-only-
    // control (UI/UX Overhaul Gate 8): only meaningful alongside the interactive chart
    // it scrolls, so it's hidden at mobile widths same as gantt-chart-panel itself.
    var jumpBar = document.createElement("div");
    jumpBar.className = "gantt-chart-only-control";
    jumpBar.style.display = "flex";
    jumpBar.style.gap = "var(--space-2)";
    jumpBar.style.marginTop = "var(--space-3)";
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
    container.insertBefore(jumpBar, chartRowEl);

    var legend = document.createElement("div");
    legend.className = "gantt-chart-only-control";
    legend.style.display = "flex";
    legend.style.flexWrap = "wrap";
    legend.style.gap = "var(--space-4)";
    legend.style.marginTop = "var(--space-3)";
    legend.style.fontSize = "var(--text-sm)";

    function legendItem(colorCss, label, dashed) {
      var itemEl = document.createElement("span");
      itemEl.style.display = "inline-flex";
      itemEl.style.alignItems = "center";
      itemEl.style.gap = "var(--space-2)";
      var swatch = document.createElement("span");
      swatch.style.width = "14px";
      swatch.style.height = "10px";
      swatch.style.borderRadius = "var(--radius-sm)";
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
    legend.appendChild(legendItem("var(--status-critical)", "Not Ready (governing document missing)"));
    container.appendChild(legend);

    var dragHint = document.createElement("p");
    dragHint.className = "text-secondary gantt-chart-only-control";
    dragHint.style.fontSize = "var(--text-xs)";
    dragHint.style.marginTop = "var(--space-2)";
    dragHint.textContent = "Drag a bar to move it, drag its right edge to resize, or click a bar/milestone/label to open its details. Every edit recalculates the schedule automatically.";
    container.appendChild(dragHint);

    // UI/UX Overhaul Gate 8 (Tablet/Mobile Optimization): the brief's own "Gantt
    // alternative" requirement for mobile — dragging a 2px-wide SVG bar with a
    // fingertip doesn't work, and the toolbar above already consumes a full phone
    // screen before any chart would even be visible. Read-only, sorted by whichever
    // date each row actually has (planned, falling back to calculated), reusing the
    // exact same toolbar filters as the chart it stands in for (activities is already
    // filtered above) so the two views never disagree about what's in scope. Tapping a
    // card opens the same Activity Detail Panel the chart itself uses — no separate
    // mobile-only detail view to keep in sync.
    //
    // Gated on window.innerWidth (not built-always + CSS-hidden like the Activities
    // tab's mobile cards) for a real reason, not just consistency: unlike that table,
    // this list has no virtualization at all — building one .project-card per activity
    // is fine for a normal-sized schedule but genuinely expensive at the thousands-of-
    // activities scale Tier 3 Gate 4's own virtualization work specifically exists to
    // handle. Checked once per render, not on a resize listener — this app has no
    // JS-driven resize reactivity anywhere else either, matching the existing
    // "CSS reflows, JS doesn't re-render on resize" convention. matchMedia isn't used
    // here since jsdom (this project's whole test suite) doesn't implement it at all.
    if (window.innerWidth <= 780) {
      var mobileTimeline = document.createElement("div");
      mobileTimeline.className = "project-list gantt-mobile-timeline";
      var timelineActivities = activities.slice().sort(function (a, b) {
        var da = a.planned_start || a.early_start || "";
        var db = b.planned_start || b.early_start || "";
        return da < db ? -1 : da > db ? 1 : 0;
      });
      timelineActivities.forEach(function (a) {
        var card = document.createElement("div");
        card.className = "project-card";
        card.style.cursor = "pointer";
        card.onclick = function () {
          uiState.ganttDetailActivityId = a.id;
          rerender();
        };

        var main = document.createElement("div");
        main.className = "project-card__main";
        var metaBits = [wbsName(wbsItems, a.wbs_id), ACTIVITY_TYPE_LABELS[a.activity_type]];
        var start = a.planned_start || a.early_start;
        var finish = a.planned_finish || a.early_finish;
        if (start || finish) metaBits.push((start || "—") + " → " + (finish || "—"));
        main.innerHTML =
          "<div class='project-card__name'>" + (a.name || "(unnamed activity)") + "</div>" +
          "<div class='project-card__meta'>" + metaBits.join(" · ") + "</div>";
        card.appendChild(main);

        var badgeWrap = document.createElement("div");
        badgeWrap.style.display = "flex";
        badgeWrap.style.gap = "var(--space-2)";
        badgeWrap.style.flexWrap = "wrap";
        var statusBadge = document.createElement("span");
        statusBadge.className =
          "status-badge " +
          (a.status === "complete" ? "status-badge--complete" : a.status === "on_hold" ? "status-badge--at_risk" : "status-badge--info");
        statusBadge.textContent = ACTIVITY_STATUS_LABELS[a.status];
        badgeWrap.appendChild(statusBadge);
        if (a.total_float != null && a.total_float <= 0) {
          var criticalBadge = document.createElement("span");
          criticalBadge.className = "status-badge status-badge--critical";
          criticalBadge.textContent = "Critical";
          badgeWrap.appendChild(criticalBadge);
        }
        card.appendChild(badgeWrap);

        mobileTimeline.appendChild(card);
      });
      container.appendChild(mobileTimeline);
    }
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
    panel.style.marginTop = "var(--space-3)";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h4");
    heading.style.marginBottom = "var(--space-3)";
    heading.textContent = "Baseline vs Current \u2014 comparing against \u201c" + currentScheduleName + "\u201d";
    panel.appendChild(heading);

    var summaryLine = document.createElement("p");
    summaryLine.style.fontSize = "var(--text-sm)";
    summaryLine.style.marginBottom = "var(--space-3)";
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
        row.style.marginBottom = "var(--space-2)";

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
        more.style.fontSize = "var(--text-sm)";
        more.textContent = "+" + (changed.length - 50) + " more changed activities not shown.";
        panel.appendChild(more);
      }
    } else {
      var noChange = document.createElement("p");
      noChange.className = "text-secondary";
      noChange.style.fontSize = "var(--text-sm)";
      noChange.textContent = "No finish-date or criticality changes among matched activities.";
      panel.appendChild(noChange);
    }

    // Gate 23 (PCC Evolution Roadmap, Tier F: Advanced Delay Analysis): float erosion —
    // baseline.total_float minus current.total_float, per matched activity — was always
    // computable from this same comparison result but never derived or surfaced. Ranked
    // separately from the "changed" table above because float erosion and finish-date
    // slip are genuinely distinct signals: an activity can be consuming float steadily
    // without its finish date having moved yet (still non-critical), which the finish-
    // variance table alone would miss entirely.
    var floatErosion = result.activities.matched
      .filter(function (m) { return m.baseline.total_float != null && m.current.total_float != null && m.baseline.total_float - m.current.total_float > 0; })
      .map(function (m) { return Object.assign({ erosion: m.baseline.total_float - m.current.total_float }, m); })
      .sort(function (a, b) { return b.erosion - a.erosion; });

    if (floatErosion.length > 0) {
      var erosionHeading = document.createElement("h4");
      erosionHeading.style.marginTop = "var(--space-4)";
      erosionHeading.style.marginBottom = "var(--space-2)";
      erosionHeading.textContent = "Float Erosion (" + floatErosion.length + ") — activities consuming float since baseline";
      panel.appendChild(erosionHeading);
      var erosionList = document.createElement("div");
      erosionList.className = "project-list";
      floatErosion.slice(0, 20).forEach(function (m) {
        var erosionRow = document.createElement("div");
        erosionRow.className = "detail-card";
        erosionRow.style.marginBottom = "var(--space-2)";
        erosionRow.style.fontSize = "var(--text-sm)";
        erosionRow.innerHTML =
          "<strong>" + m.name + "</strong><br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          m.baseline.total_float + "d → " + m.current.total_float + "d float (−" + m.erosion + "d)" +
          (m.current.is_critical ? " · now critical" : "") +
          "</span>";
        erosionList.appendChild(erosionRow);
      });
      panel.appendChild(erosionList);
      if (floatErosion.length > 20) {
        var erosionMore = document.createElement("p");
        erosionMore.className = "text-secondary";
        erosionMore.style.fontSize = "var(--text-sm)";
        erosionMore.textContent = "+" + (floatErosion.length - 20) + " more not shown.";
        panel.appendChild(erosionMore);
      }
    }

    if (result.activities.added.length > 0 || result.activities.removed.length > 0) {
      var addRemoveNote = document.createElement("p");
      addRemoveNote.className = "text-secondary";
      addRemoveNote.style.fontSize = "var(--text-sm)";
      addRemoveNote.style.marginTop = "var(--space-2)";
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
    note.style.fontSize = "var(--text-sm)";
    note.style.marginBottom = "var(--space-3)";
    note.textContent =
      "Baselines from every schedule revision in this project. \u201cCompare\u201d checks a baseline " +
      "against whichever schedule is currently selected above. At most one baseline can be Official " +
      "\u2014 marking one locks it against deletion and drives Executive Center's Schedule Variance.";
    container.appendChild(note);

    var list = document.createElement("div");
    list.className = "project-list";
    baselines.forEach(function (b) {
      var row = document.createElement("div");
      row.className = "detail-card";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "var(--space-2)";
      row.style.flexWrap = "wrap";
      row.style.gap = "var(--space-2)";

      var main = document.createElement("div");
      if (uiState.renamingBaselineId === b.id) {
        var renameInput = document.createElement("input");
        renameInput.type = "text";
        renameInput.value = b.name;
        renameInput.style.marginBottom = "var(--space-1)";
        var renameSaveBtn = document.createElement("button");
        renameSaveBtn.type = "button";
        renameSaveBtn.className = "btn btn--ghost";
        renameSaveBtn.textContent = "Save";
        renameSaveBtn.onclick = function () {
          var newName = renameInput.value.trim();
          if (newName) {
            window.PCC.store.update(function (d) {
              var item = d.schedule_baselines.find(function (x) { return x.id === b.id; });
              if (item) item.name = newName;
            });
          }
          uiState.renamingBaselineId = null;
          rerender();
        };
        var renameCancelBtn = document.createElement("button");
        renameCancelBtn.type = "button";
        renameCancelBtn.className = "btn btn--ghost";
        renameCancelBtn.textContent = "Cancel";
        renameCancelBtn.onclick = function () {
          uiState.renamingBaselineId = null;
          rerender();
        };
        main.appendChild(renameInput);
        var renameActions = document.createElement("div");
        renameActions.appendChild(renameSaveBtn);
        renameActions.appendChild(renameCancelBtn);
        main.appendChild(renameActions);
      } else {
        main.innerHTML =
          "<strong>" + escHtml(b.name) + "</strong>" +
          (b.is_official ? " <span class='status-badge status-badge--complete'>Official</span>" : "") +
          "<br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          "Captured " + new Date(b.captured_at).toLocaleString() + " \u00b7 " +
          b.activity_count + " activities \u00b7 from Rev " + b.schedule_revision_number +
          (b.baseline_project_finish ? " \u00b7 project finish at capture " + b.baseline_project_finish : "") +
          "</span>";
      }
      row.appendChild(main);

      var actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "var(--space-2)";
      actions.style.flexWrap = "wrap";

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

      var renameBtn = document.createElement("button");
      renameBtn.className = "btn btn--ghost";
      renameBtn.textContent = "Rename";
      renameBtn.onclick = function () {
        uiState.renamingBaselineId = b.id;
        rerender();
      };
      actions.appendChild(renameBtn);

      var officialBtn = document.createElement("button");
      officialBtn.className = "btn btn--ghost";
      officialBtn.textContent = b.is_official ? "Unmark Official" : "Mark Official";
      officialBtn.onclick = function () {
        // Captured before the store mutation below \u2014 b is the same object reference
        // store.update() mutates in place, so reading b.is_official AFTER the update
        // would already reflect the new state, not the one this click is toggling
        // away from.
        var wasOfficial = b.is_official;
        window.PCC.store.update(function (d) {
          d.schedule_baselines.forEach(function (item) {
            if (item.project_id !== b.project_id) return;
            // At most one official baseline per project (Gate 22) \u2014 marking this one
            // implicitly unmarks whichever else was official, rather than requiring a
            // separate "unmark the old one first" step.
            item.is_official = item.id === b.id ? !wasOfficial : false;
          });
        });
        window.PCC.notify(
          wasOfficial ? "Baseline unmarked as Official." : 'Baseline marked Official \u2014 Executive Center\u2019s Schedule Variance now measures against it.',
          "success"
        );
        rerender();
      };
      actions.appendChild(officialBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.disabled = !!b.is_official;
      deleteBtn.title = b.is_official ? "Unmark as Official before deleting." : "";
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
          var loading = window.PCC.loadingIndicator.buildInline("Loading stored baseline data\u2026");
          loading.style.marginBottom = "var(--space-3)";
          list.appendChild(loading);
        } else if (uiState.baselineCompareError) {
          var errP = document.createElement("p");
          errP.style.color = "var(--status-critical)";
          errP.style.fontSize = "var(--text-sm)";
          errP.textContent = uiState.baselineCompareError;
          list.appendChild(errP);
        } else if (uiState.baselineCompareResult) {
          renderBaselineCompareResult(list, uiState.baselineCompareResult, currentScheduleName);
        }
      }
    });
    container.appendChild(list);
  }

  /** PCC Evolution Roadmap, Tier F: Recovery & Mitigation Planning (Gate 24). A
   * standalone exploration tool, deliberately NOT tied to any one Recovery Action
   * (Aditya's own call via AskUserQuestion) — pick any activity in the current
   * schedule, propose reducing its duration/remaining duration by N days (crashing/
   * fast-tracking), and see the CPM-calculated impact on project finish and the
   * critical path BEFORE committing to anything. Nothing here is persisted:
   * scheduleCpmEngine.calculateSchedule() is a pure function that already only takes
   * plain arrays (no store/DOM access), so this just clones the current activities,
   * perturbs one, and reruns it. The "before" figure is a fresh live calculation
   * against the current, unmodified activities — the same numbers "Calculate
   * Schedule" would produce right now — so what's shown here is always comparable to
   * what's actually on the activities, not a stale prior run. */
  function renderWhatIfTab(container, data, rerender) {
    var schedule = data.schedules.find(function (s) { return s.id === uiState.scheduleId; });
    var scheduleActivities = data.activities.filter(function (a) { return a.schedule_id === uiState.scheduleId; });
    var scheduleRelationships = data.relationships.filter(function (r) { return r.schedule_id === uiState.scheduleId; });

    var intro = document.createElement("p");
    intro.className = "text-secondary";
    intro.style.fontSize = "var(--text-sm)";
    intro.style.marginBottom = "var(--space-3)";
    intro.textContent =
      "Explore “what if we recover N days on this activity” without changing anything — nothing here is saved. Decide on a number, then log it against a Recovery Action from the Activity Detail Panel.";
    container.appendChild(intro);

    if (scheduleActivities.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "Add some activities before exploring a what-if scenario.";
      container.appendChild(empty);
      return;
    }

    var formPanel = document.createElement("div");
    formPanel.className = "panel";
    var grid = document.createElement("div");
    grid.className = "form-grid";

    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Activity</label>";
    var activitySelect = document.createElement("select");
    activitySelect.id = "whatiffield-activity";
    var blankOpt = document.createElement("option");
    blankOpt.value = "";
    blankOpt.textContent = "Select an activity…";
    activitySelect.appendChild(blankOpt);
    scheduleActivities.forEach(function (a) {
      var opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name || "(unnamed activity)";
      activitySelect.appendChild(opt);
    });
    activitySelect.value = uiState.whatIfActivityId || "";
    activityField.appendChild(activitySelect);
    grid.appendChild(activityField);

    var daysField = document.createElement("div");
    daysField.className = "field";
    daysField.innerHTML = "<label>Reduce Duration By (days)</label>";
    var daysInput = document.createElement("input");
    daysInput.type = "number";
    daysInput.id = "whatiffield-days";
    daysInput.min = "0";
    daysInput.value = uiState.whatIfReduceDays;
    daysField.appendChild(daysInput);
    grid.appendChild(daysField);

    formPanel.appendChild(grid);

    // Gate 24 note: the error must live in uiState, not a local DOM element mutated
    // inline — rerender() rebuilds this whole tab from scratch on every click, so a
    // locally-set errorMsg.style.display would be discarded before it's ever seen
    // (caught by this gate's own test suite before shipping).
    if (uiState.whatIfError) {
      var errorMsg = document.createElement("p");
      errorMsg.style.color = "var(--status-critical)";
      errorMsg.style.fontSize = "var(--text-sm)";
      errorMsg.textContent = uiState.whatIfError;
      formPanel.appendChild(errorMsg);
    }

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-3)";

    var runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "btn btn--primary";
    runBtn.textContent = "Run What-If";
    runBtn.onclick = function () {
      var activityId = activitySelect.value;
      var reduceDays = Number(daysInput.value);
      uiState.whatIfActivityId = activityId;
      uiState.whatIfReduceDays = daysInput.value;

      if (!activityId) {
        uiState.whatIfError = "Select an activity first.";
        uiState.whatIfResult = null;
        rerender();
        return;
      }
      var activity = scheduleActivities.find(function (a) { return a.id === activityId; });
      if (activity.status === "complete") {
        uiState.whatIfError = "Completed activities can't be accelerated — their dates are historical.";
        uiState.whatIfResult = null;
        rerender();
        return;
      }
      if (!daysInput.value || isNaN(reduceDays) || reduceDays <= 0) {
        uiState.whatIfError = "Enter a positive number of days to reduce.";
        uiState.whatIfResult = null;
        rerender();
        return;
      }
      uiState.whatIfError = null;

      var fieldToReduce = activity.status === "in_progress" ? "remaining_duration" : "duration";
      var currentValue = activity[fieldToReduce] || 0;
      var newValue = Math.max(0, currentValue - reduceDays);

      var cpmOptions = {
        dataDate: schedule.data_date,
        nearCriticalThresholdDays: schedule.near_critical_threshold_days,
        calculationMode: schedule.calculation_mode,
      };
      var before = window.PCC.scheduleCpmEngine.calculateSchedule(scheduleActivities, scheduleRelationships, cpmOptions);

      var modifiedActivities = scheduleActivities.map(function (a) {
        if (a.id !== activityId) return a;
        var clone = Object.assign({}, a);
        clone[fieldToReduce] = newValue;
        return clone;
      });
      var after = window.PCC.scheduleCpmEngine.calculateSchedule(modifiedActivities, scheduleRelationships, cpmOptions);

      var wasCritical = before.results[activityId] && before.results[activityId].is_critical;
      var beforeCriticalIds = before.criticalActivityIds.slice();
      var afterCriticalIds = after.criticalActivityIds.slice();
      var newlyNonCritical = beforeCriticalIds.filter(function (id) { return afterCriticalIds.indexOf(id) === -1; });
      var newlyCritical = afterCriticalIds.filter(function (id) { return beforeCriticalIds.indexOf(id) === -1; });
      function namesFor(ids) {
        return ids.map(function (id) {
          var a = scheduleActivities.find(function (x) { return x.id === id; });
          return a ? a.name || "(unnamed activity)" : id;
        });
      }

      uiState.whatIfResult = {
        activityName: activity.name,
        fieldToReduce: fieldToReduce,
        requestedReduction: reduceDays,
        actualReduction: currentValue - newValue,
        wasCritical: !!wasCritical,
        beforeFinish: before.projectFinish,
        afterFinish: after.projectFinish,
        varianceDays:
          before.projectFinish && after.projectFinish
            ? window.PCC.scheduleGanttLayout.diffDays(before.projectFinish, after.projectFinish)
            : null,
        beforeCriticalCount: beforeCriticalIds.length,
        afterCriticalCount: afterCriticalIds.length,
        newlyNonCritical: namesFor(newlyNonCritical),
        newlyCritical: namesFor(newlyCritical),
      };
      rerender();
    };
    actions.appendChild(runBtn);

    if (uiState.whatIfResult) {
      var resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "btn btn--ghost";
      resetBtn.textContent = "Reset";
      resetBtn.onclick = function () {
        uiState.whatIfActivityId = "";
        uiState.whatIfReduceDays = "";
        uiState.whatIfResult = null;
        uiState.whatIfError = null;
        rerender();
      };
      actions.appendChild(resetBtn);
    }

    formPanel.appendChild(actions);
    container.appendChild(formPanel);

    if (uiState.whatIfResult) {
      var r = uiState.whatIfResult;
      var resultPanel = document.createElement("div");
      resultPanel.className = "panel";
      resultPanel.style.marginTop = "var(--space-3)";

      var heading = document.createElement("h4");
      heading.style.marginBottom = "var(--space-3)";
      heading.textContent = "What-If Result — " + (r.activityName || "(unnamed activity)");
      resultPanel.appendChild(heading);

      if (r.actualReduction < r.requestedReduction) {
        var clampNote = document.createElement("p");
        clampNote.className = "text-secondary";
        clampNote.style.fontSize = "var(--text-sm)";
        clampNote.style.marginBottom = "var(--space-2)";
        clampNote.textContent =
          "Requested " + r.requestedReduction + "d, but this activity only had " + r.actualReduction + "d of " +
          (r.fieldToReduce === "remaining_duration" ? "remaining duration" : "duration") + " to give — clamped at 0.";
        resultPanel.appendChild(clampNote);
      }

      if (!r.wasCritical) {
        var floatNote = document.createElement("p");
        floatNote.style.fontSize = "var(--text-sm)";
        floatNote.style.marginBottom = "var(--space-2)";
        floatNote.style.color = "var(--status-at-risk)";
        floatNote.textContent =
          "This activity was NOT on the critical path before this change — reducing its duration may not move the project finish at all.";
        resultPanel.appendChild(floatNote);
      }

      var summary = document.createElement("p");
      summary.style.fontSize = "var(--text-sm)";
      summary.innerHTML =
        "<strong>Project Finish:</strong> " + (r.beforeFinish || "—") + " → " + (r.afterFinish || "—") +
        (r.varianceDays != null
          ? " (" + (r.varianceDays < 0 ? r.varianceDays + "d earlier" : r.varianceDays > 0 ? "+" + r.varianceDays + "d later" : "no change") + ")"
          : "") +
        "<br/><strong>Critical Activities:</strong> " + r.beforeCriticalCount + " → " + r.afterCriticalCount;
      resultPanel.appendChild(summary);

      if (r.newlyNonCritical.length > 0) {
        var offCritical = document.createElement("p");
        offCritical.style.fontSize = "var(--text-sm)";
        offCritical.style.marginTop = "var(--space-2)";
        offCritical.textContent = "No longer critical: " + r.newlyNonCritical.join(", ");
        resultPanel.appendChild(offCritical);
      }
      if (r.newlyCritical.length > 0) {
        var onCritical = document.createElement("p");
        onCritical.style.fontSize = "var(--text-sm)";
        onCritical.style.marginTop = "var(--space-1)";
        onCritical.textContent = "Newly critical: " + r.newlyCritical.join(", ");
        resultPanel.appendChild(onCritical);
      }

      container.appendChild(resultPanel);
    }
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
    h1.className = "focus-mode-hide";
    h1.textContent = "Schedule";
    h1.style.marginBottom = "var(--space-2)";
    outlet.appendChild(h1);

    var gateNote = document.createElement("p");
    gateNote.className = "text-secondary focus-mode-hide";
    gateNote.style.fontSize = "var(--text-sm)";
    gateNote.style.marginBottom = "var(--space-4)";
    gateNote.textContent =
      "Hand-enter activities, import from Excel, or calculate the critical path. " +
      "View the Gantt tab for a timeline, and save/compare baselines from the Baselines tab.";
    outlet.appendChild(gateNote);

    // UI/UX Overhaul Gate 7 (Focus Mode): the schedule-picker bar (project/schedule
    // select + Edit/New/Import/Calculate/Save Baseline) is real chrome, not core
    // Activities/Gantt/filters content — matches the brief's own Schedule Focus Mode
    // example verbatim ("hide unnecessary navigation... maximum workspace to Activities
    // + Gantt + filters"). Applies to every Schedule tab, not just Gantt, since focus
    // mode is a global declutter state, not per-tab.
    renderScheduleBar(outlet, data, rerender);

    if (uiState.importPanelOpen) {
      renderImportPanel(outlet, data, rerender);
    }

    if (uiState.excelEditorOpen) {
      renderExcelEditorPanel(outlet, data, rerender);
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
    tabBar.style.marginTop = "var(--space-4)";

    [
      { key: "activities", label: "Activities" },
      { key: "gantt", label: "Gantt" },
      { key: "wbs", label: "WBS" },
      { key: "relationships", label: "Relationships" },
      { key: "baselines", label: "Baselines" },
      { key: "whatif", label: "What-If" },
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
    else if (uiState.tab === "whatif") renderWhatIfTab(tabContent, data, rerender);
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
      window.PCC.projectContext.set(projectId);
    },
    // PCC Evolution Roadmap, Tier F (Gate 20, Status-Date Control): Executive Center's
    // new Status Date panel points here for Float Changes/Milestone Variance rather
    // than duplicating the Baselines tab's own async compare UI — same "land exactly
    // on the linked feature" convention as viewActivity above.
    viewBaselines: function (projectId, scheduleId) {
      uiState.projectId = projectId;
      uiState.scheduleId = scheduleId;
      uiState.tab = "baselines";
      window.PCC.projectContext.set(projectId);
    },
    /** UI/UX Overhaul Gate 4 (Project Workspace): the one small, additive gap in this
     * page's own hand-off convention — viewActivity/viewBaselines above both require a
     * scheduleId the Workspace's nav doesn't have (it only knows the project). Leaves
     * scheduleId untouched on purpose: renderPage()'s own schedule <select> already
     * falls back to projectSchedules[0] whenever the current scheduleId doesn't belong
     * to uiState.projectId (see its onchange handler above), so a stale id from whatever
     * project was last viewed self-corrects on the very next render — no need to
     * duplicate that "pick the primary schedule" logic here. */
    viewProject: function (projectId) {
      uiState.projectId = projectId;
      uiState.tab = "gantt";
      window.PCC.projectContext.set(projectId);
    },
  };
})();
