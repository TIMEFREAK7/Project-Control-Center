/* Primavera P6 XER — parsing (and, if this gate extends to it, export) of P6's native
 * tabular export format. No DOM manipulation of the app's own UI, no store writes —
 * same separation scheduleImportService.js (Excel) and mspXmlService.js (MS Project)
 * already keep. parseXer() returns the *exact same shape* parseRows() does
 * ({ activities, wbsEntries, relationships, warnings, errors, summary }, plus one
 * addition, `calendar`) so schedule.js's existing buildScheduleRecords() consumes any
 * of the three importers identically — the whole point of the Architecture Upgrade
 * Phase 1 canonical model this file feeds into.
 *
 * PCC Architecture Upgrade Phase 3 (Primavera P6 File Interoperability). Per the
 * master upgrade prompt's own instruction: XER is P6's own practical *exchange*
 * format — a plain tab-delimited text file (File → Export → Project Export (XER) in
 * P6), not a database file requiring P6 itself to read. No new dependency: this is a
 * simple line-based text format, parsed with plain string splitting.
 *
 * XER FILE STRUCTURE (for anyone maintaining this without prior XER exposure):
 *   ERMHDR\t<version>\t<date>\t...                 one header line, first in the file
 *   %T\t<TABLE_NAME>                                 starts a new table
 *   %F\t<field1>\t<field2>\t...                      declares that table's column names
 *   %R\t<value1>\t<value2>\t...                      one data row (repeated per record)
 *   ... more %T/%F/%R blocks, one per table ...
 * Tables relevant here: PROJECT (project metadata), PROJWBS (the real WBS hierarchy —
 * P6 gives actual parent_wbs_id references, unlike MSP XML's dotted-code guessing),
 * TASK (activities), TASKPRED (relationships), CALENDAR (referenced by TASK.clndr_id;
 * `day_hr_cnt` gives this file's *actual* hours-per-working-day, so duration/lag
 * conversion here is exact, not an assumed-8-hours guess like the MSP importer needs).
 *
 * DELIBERATE SCOPE LIMITS (read before extending this file):
 * - Only the FIRST project in the file (first PROJECT row's proj_id) is imported. A
 *   file exported with multiple projects selected gets a warning naming which one was
 *   used rather than silently merging unrelated projects' data together.
 * - Resources/Assignments (RSRC/TASKRSRC tables) and Activity/Project/Resource Codes
 *   (ACTVCODE/TASKACTV and similar) are NOT imported — same reasoning as MSP's Phase 2:
 *   PCC's own Resource Management module has its own dedup rules, and a managed
 *   code-hierarchy is real feature work nobody's asked for yet. Explicitly deferred,
 *   not silently dropped.
 * - CALENDAR's `clndr_data` field (P6's own proprietary nested work-week/holiday
 *   pattern) is NOT decoded — it's a complex, undocumented-by-Oracle nested format.
 *   Only the calendar's flat fields are used: `clndr_name` and `day_hr_cnt` (for exact
 *   duration/lag conversion). The imported Calendar record gets a Mon-Fri placeholder
 *   working-day pattern with no holidays, same as any other new Calendar — real
 *   working-day/holiday data from the source file is NOT preserved. This is a real,
 *   documented limitation, not an oversight.
 * - A P6 Activity's `task_type` of TT_WBS ("WBS Summary" pseudo-activity) maps onto
 *   PCC's existing `activity_type: "wbs_summary"` and stays a normal network Activity —
 *   this is DIFFERENT from how mspXmlService.js treats an MSP "Summary" task (which
 *   becomes a PCC WBS item, not an Activity). That's not an inconsistency: P6's real
 *   WBS hierarchy is the separate PROJWBS table, always imported into `wbs_items[]`
 *   regardless of task_type — TT_WBS is a distinct, optional rollup-bar convention some
 *   schedulers use *within* the Task list, exactly matching how the Excel importer
 *   already lets a "WBS Summary" activity type coexist in the flat activities network
 *   (see scheduleImportService.js's ACTIVITY_TYPE_ALIASES and scheduleCpmEngine.js's
 *   own header on why summary activities are ordinary network nodes here).
 * - Percent complete is derived as duration-percent-complete
 *   ((target-remaining)/target*100), the same convention P6 itself defaults to when a
 *   task's `complete_pct_type` is `CP_Drtn` — P6's `phys_complete_pct` field (used only
 *   under `CP_Phys`) is intentionally NOT read, matching store.js's own newActivity()
 *   rule that `physical_progress` is manually-entered only, never imported from a
 *   schedule file.
 * - Constraint type codes (CS_ALAP/CS_MSO/CS_MSOA/CS_MSOB/CS_MEO/CS_MEOA/CS_MEOB) are
 *   mapped onto the SAME short-code vocabulary mspXmlService.js already uses
 *   (ALAP/MSO/SNET/SNLT/MFO/FNET/FNLT) — deliberately, so `constraint_type` reads
 *   consistently regardless of which platform a schedule was imported from. Based on
 *   Primavera's own documented XER schema constants; like every claim in this file,
 *   this has not been tested against a real P6-produced export (no P6 installation is
 *   available in this environment) — see the round-trip note in mspXmlService.js for
 *   the same honesty standard applied here.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var HOURS_PER_DAY_FALLBACK = 8; // used only when a Calendar/day_hr_cnt can't be resolved

  var TASK_TYPE_MAP = {
    TT_Task: "task",
    TT_Rsrc: "task",
    TT_LOE: "task",
    TT_Mile: "milestone",
    TT_FinMile: "milestone",
    TT_WBS: "wbs_summary",
  };
  var STATUS_CODE_MAP = {
    TK_NotStart: "not_started",
    TK_Active: "in_progress",
    TK_Complete: "complete",
  };
  var PRED_TYPE_MAP = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
  var CONSTRAINT_TYPE_MAP = {
    CS_ALAP: "ALAP",
    CS_MSO: "MSO",
    CS_MSOA: "SNET",
    CS_MSOB: "SNLT",
    CS_MEO: "MFO",
    CS_MEOA: "FNET",
    CS_MEOB: "FNLT",
  };

  /** Parses the generic %T/%F/%R table structure into { TABLE_NAME: { fields, rows } }.
   * `rows` is already an array of { fieldName: value } objects, not raw arrays — every
   * caller below wants named access, so do that conversion once, here. */
  function parseXerTables(xerText) {
    var lines = xerText.split(/\r\n|\r|\n/);
    var tables = {};
    var currentTable = null;
    var currentFields = null;
    lines.forEach(function (line) {
      if (!line) return;
      var parts = line.split("\t");
      var tag = parts[0];
      if (tag === "%T") {
        currentTable = parts[1];
        if (!tables[currentTable]) tables[currentTable] = { fields: [], rows: [] };
        currentFields = null;
      } else if (tag === "%F") {
        currentFields = parts.slice(1);
        if (currentTable) tables[currentTable].fields = currentFields;
      } else if (tag === "%R") {
        if (!currentTable || !currentFields) return;
        var values = parts.slice(1);
        var rec = {};
        currentFields.forEach(function (f, i) {
          rec[f] = values[i] !== undefined ? values[i] : "";
        });
        tables[currentTable].rows.push(rec);
      }
      // %E (end) and any other tag are structurally irrelevant here — ignored.
    });
    return tables;
  }

  /** XER datetimes are "2026-01-05 08:00" — PCC's date fields are plain "YYYY-MM-DD"
   * strings. A missing/unparseable value returns "" (blank), never a fabricated date. */
  function parseXerDate(str) {
    if (!str) return "";
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(str.trim());
    return m ? m[1] : "";
  }

  function hoursToDays(hoursStr, dayHrCnt) {
    if (hoursStr === undefined || hoursStr === null || hoursStr === "") return null;
    var hours = parseFloat(hoursStr);
    if (!isFinite(hours)) return null;
    return hours / (dayHrCnt || HOURS_PER_DAY_FALLBACK);
  }

  /** Parses a P6 XER export into the same shape scheduleImportService.parseRows() and
   * mspXmlService.parseMspXml() return. See this file's own header for the full list
   * of deliberate scope limits (single project, no Resources/Codes, no clndr_data
   * decoding, duration-percent-complete only). */
  function parseXer(xerText) {
    var errors = [];
    var warnings = [];
    var empty = { activities: [], wbsEntries: [], relationships: [], calendar: null, warnings: warnings, errors: errors, summary: { total_rows: 0, imported: 0, warnings: 0, errors: errors.length, circular_relationships_skipped: 0 } };

    var firstLine = (xerText || "").split(/\r\n|\r|\n/)[0] || "";
    if (firstLine.split("\t")[0] !== "ERMHDR") {
      errors.push({ row: null, message: "This doesn't look like a Primavera P6 XER file — missing the expected ERMHDR header line." });
      return empty;
    }

    var tables = parseXerTables(xerText);
    var projectRows = (tables.PROJECT && tables.PROJECT.rows) || [];
    if (projectRows.length === 0) {
      errors.push({ row: null, message: "This file has no PROJECT table — nothing to import." });
      return empty;
    }
    var targetProjId = projectRows[0].proj_id;
    if (projectRows.length > 1) {
      warnings.push({
        row: null,
        message:
          "This file contains " + projectRows.length + ' projects — only the first ("' +
          (projectRows[0].proj_short_name || targetProjId) + '") was imported. Export a single project if you need a different one.',
      });
    }

    var taskRows = ((tables.TASK && tables.TASK.rows) || []).filter(function (t) {
      return t.proj_id === targetProjId;
    });
    if (taskRows.length === 0) {
      errors.push({ row: null, message: "This file has no Activities (TASK rows) for the selected project — nothing to import." });
      return empty;
    }

    // Calendars: build clndr_id -> day_hr_cnt / name, so each activity's own duration
    // converts using the calendar it actually references (see this file's header on
    // why this is exact here, unlike MSP's assumed-8-hours-per-day fallback).
    var calendarRows = (tables.CALENDAR && tables.CALENDAR.rows) || [];
    var calendarById = {};
    calendarRows.forEach(function (c) {
      calendarById[c.clndr_id] = c;
    });
    var usedFallbackHours = false;
    function dayHrCntFor(clndrId) {
      var cal = calendarById[clndrId];
      if (cal && cal.day_hr_cnt) return parseFloat(cal.day_hr_cnt);
      usedFallbackHours = true;
      return HOURS_PER_DAY_FALLBACK;
    }

    // WBS: PROJWBS gives REAL parent_wbs_id references (unlike MSP's dotted-code
    // guessing) — build wbs_id -> code directly, then resolve parent_code from that
    // same map. wbs_short_name isn't guaranteed unique across a large project's
    // branches the way a dotted MSP code is by construction, so disambiguate a
    // collision with a warning rather than letting buildScheduleRecords() (which
    // dedupes wbsEntries by `code`) silently merge two unrelated WBS nodes.
    var wbsRows = ((tables.PROJWBS && tables.PROJWBS.rows) || []).filter(function (w) {
      return w.proj_id === targetProjId;
    });
    var wbsIdToCode = {};
    var codesSeen = {};
    wbsRows.forEach(function (w) {
      var code = w.wbs_short_name || w.wbs_id;
      if (codesSeen[code]) {
        var disambiguated = code + " (" + w.wbs_id + ")";
        warnings.push({
          row: null,
          message: 'WBS code "' + code + '" is used by more than one node in this file — the duplicate was renamed to "' + disambiguated + '" to keep them distinct.',
        });
        code = disambiguated;
      }
      codesSeen[code] = true;
      wbsIdToCode[w.wbs_id] = code;
    });

    var visitedWbsIds = {}; // cycle guard for the level/parent walk below
    function wbsLevel(wbsId, depth) {
      if (depth > 200 || visitedWbsIds[wbsId]) return 0; // malformed/cyclic parent chain
      visitedWbsIds[wbsId] = true;
      var w = wbsRows.find(function (r) {
        return r.wbs_id === wbsId;
      });
      if (!w || !w.parent_wbs_id || !wbsIdToCode[w.parent_wbs_id]) return 0;
      return 1 + wbsLevel(w.parent_wbs_id, depth + 1);
    }

    var wbsEntries = wbsRows.map(function (w) {
      visitedWbsIds = {};
      var parentCode = w.parent_wbs_id ? wbsIdToCode[w.parent_wbs_id] || null : null;
      return {
        code: wbsIdToCode[w.wbs_id],
        name: w.wbs_name || wbsIdToCode[w.wbs_id],
        parent_code: parentCode,
        level: wbsLevel(w.wbs_id, 0),
      };
    });

    // Activities: every TASK row, including TT_WBS ones — see this file's header for
    // why that's correct here and different from MSP's Summary-task treatment.
    var seenTaskCodes = {};
    var activities = taskRows.map(function (t) {
      var externalId = t.task_code || t.task_id;
      if (seenTaskCodes[externalId]) {
        warnings.push({ row: null, message: 'Activity code "' + externalId + '" appears more than once in this file — later occurrences may not link relationships correctly.' });
      }
      seenTaskCodes[externalId] = true;

      var activityType = TASK_TYPE_MAP[t.task_type] || "task";
      if (t.task_type && !TASK_TYPE_MAP[t.task_type]) {
        warnings.push({ row: null, message: 'Activity "' + externalId + '": unrecognized task type "' + t.task_type + '" — defaulted to Task.' });
      }

      var dayHrCnt = dayHrCntFor(t.clndr_id);
      var duration = hoursToDays(t.target_drtn_hr_cnt, dayHrCnt);
      var remaining = hoursToDays(t.remain_drtn_hr_cnt, dayHrCnt);

      var percentComplete = 0;
      if (t.status_code === "TK_Complete") {
        percentComplete = 100;
      } else if (duration != null && duration > 0 && remaining != null) {
        percentComplete = Math.max(0, Math.min(100, Math.round(((duration - remaining) / duration) * 100)));
      }

      var constraintType = t.cstr_type ? CONSTRAINT_TYPE_MAP[t.cstr_type] || "" : "";
      if (t.cstr_type && !CONSTRAINT_TYPE_MAP[t.cstr_type]) {
        warnings.push({ row: null, message: 'Activity "' + externalId + '": unrecognized constraint type "' + t.cstr_type + '" — imported with no constraint.' });
      }

      return {
        row: null,
        external_id: externalId,
        name: t.task_name || externalId,
        activity_type: activityType,
        wbs_code: t.wbs_id ? wbsIdToCode[t.wbs_id] || null : null,
        duration: duration,
        remaining_duration: remaining,
        planned_start: parseXerDate(t.target_start_date),
        planned_finish: parseXerDate(t.target_end_date),
        actual_start: parseXerDate(t.act_start_date),
        actual_finish: parseXerDate(t.act_end_date),
        percent_complete: percentComplete,
        constraint_type: constraintType,
        constraint_date: constraintType ? parseXerDate(t.cstr_date) : "",
        discipline: "",
        contractor: "",
        responsible_person: "",
        status: STATUS_CODE_MAP[t.status_code] || "not_started",
        notes: "",
        _clndr_id: t.clndr_id, // internal use only (calendar selection below) — never surfaced onto the PCC activity
      };
    });

    if (usedFallbackHours) {
      warnings.push({
        row: null,
        message:
          "One or more activities referenced a calendar this file didn't define (or that calendar had no day_hr_cnt) — " +
          "their durations were converted assuming an " + HOURS_PER_DAY_FALLBACK + "-hour working day instead.",
      });
    }

    // Relationships: TASKPRED gives real, unambiguous predecessor/successor task_ids
    // and lag in hours — converted to days using the SUCCESSOR's own calendar (the
    // conventional choice; P6 itself computes lag against the driving relationship's
    // calendar context, but a single, documented convention here is preferable to
    // guessing per-relationship which side's calendar governs).
    var externalIdByTaskId = {};
    taskRows.forEach(function (t) {
      externalIdByTaskId[t.task_id] = t.task_code || t.task_id;
    });
    var clndrIdByTaskId = {};
    taskRows.forEach(function (t) {
      clndrIdByTaskId[t.task_id] = t.clndr_id;
    });
    var relationshipsRaw = [];
    ((tables.TASKPRED && tables.TASKPRED.rows) || [])
      .filter(function (r) {
        return r.proj_id === targetProjId;
      })
      .forEach(function (r) {
        var predExtId = externalIdByTaskId[r.pred_task_id];
        var succExtId = externalIdByTaskId[r.task_id];
        if (!predExtId || !succExtId) {
          warnings.push({ row: null, message: "A relationship referenced an Activity outside this project's Task list — skipped." });
          return;
        }
        if (predExtId === succExtId) {
          warnings.push({ row: null, message: 'Activity "' + predExtId + '" lists itself as its own predecessor — skipped.' });
          return;
        }
        var type = PRED_TYPE_MAP[r.pred_type];
        if (r.pred_type && !type) {
          warnings.push({ row: null, message: 'Unrecognized relationship type "' + r.pred_type + '" between "' + predExtId + '" and "' + succExtId + '" — defaulted to Finish-to-Start.' });
        }
        type = type || "FS";
        var lag = hoursToDays(r.lag_hr_cnt, dayHrCntFor(clndrIdByTaskId[r.task_id]));
        relationshipsRaw.push({ predecessor_external_id: predExtId, successor_external_id: succExtId, type: type, lag: lag || 0 });
      });

    var circResult = window.PCC.scheduleImportService.detectAndSkipCircularRelationships(relationshipsRaw);
    warnings = warnings.concat(circResult.warnings);

    // Calendar: prefer the calendar most of this project's activities actually use;
    // fall back to whichever CALENDAR row is flagged default. Only flat fields are
    // used (see this file's header on why clndr_data itself isn't decoded) — the
    // resulting record gets a placeholder Mon-Fri pattern, same as newCalendar()'s own
    // default, not the source file's real working-day pattern.
    var calendarUsageCounts = {};
    activities.forEach(function (a) {
      if (a._clndr_id) calendarUsageCounts[a._clndr_id] = (calendarUsageCounts[a._clndr_id] || 0) + 1;
    });
    var mostUsedClndrId = Object.keys(calendarUsageCounts).sort(function (a, b) {
      return calendarUsageCounts[b] - calendarUsageCounts[a];
    })[0];
    var chosenCalendar = calendarById[mostUsedClndrId] ||
      calendarRows.find(function (c) {
        return c.default_flag === "Y";
      });
    var calendar = chosenCalendar
      ? { name: chosenCalendar.clndr_name || "Imported Calendar", working_days: [true, true, true, true, true, false, false], holidays: [] }
      : null;
    if (calendar) {
      warnings.push({
        row: null,
        message:
          'Calendar "' + calendar.name + '" was imported by name only — its actual working-day pattern and holidays ' +
          "(P6's own proprietary calendar data) are not decoded yet; it was given a placeholder Mon-Fri, no-holidays pattern instead.",
      });
    }

    activities.forEach(function (a) {
      delete a._clndr_id;
    });

    return {
      activities: activities,
      wbsEntries: wbsEntries,
      relationships: circResult.relationships,
      calendar: calendar,
      warnings: warnings,
      errors: errors,
      summary: {
        total_rows: taskRows.length,
        imported: activities.length,
        warnings: warnings.length,
        errors: errors.length,
        circular_relationships_skipped: circResult.circularPairs,
      },
    };
  }

  window.PCC.p6XerService = {
    parseXer: parseXer,
    TASK_TYPE_MAP: TASK_TYPE_MAP,
    STATUS_CODE_MAP: STATUS_CODE_MAP,
    PRED_TYPE_MAP: PRED_TYPE_MAP,
    CONSTRAINT_TYPE_MAP: CONSTRAINT_TYPE_MAP,
  };
})();
