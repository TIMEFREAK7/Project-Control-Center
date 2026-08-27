/* Primavera P6 XER — parsing AND export of P6's native tabular export format. No DOM
 * manipulation of the app's own UI, no store writes — same separation
 * scheduleImportService.js (Excel) and mspXmlService.js (MS Project) already keep.
 * parseXer() returns the *exact same shape* parseRows() does ({ activities, wbsEntries,
 * relationships, warnings, errors, summary }, plus one addition, `calendar`) so
 * schedule.js's existing buildScheduleRecords() consumes any of the three importers
 * identically — the whole point of the Architecture Upgrade Phase 1 canonical model
 * this file feeds into.
 *
 * PCC Architecture Upgrade Phase 3 (Primavera P6 File Interoperability). Per the
 * master upgrade prompt's own instruction: XER is P6's own practical *exchange*
 * format — a plain tab-delimited text file (File → Export → Project Export (XER) in
 * P6), not a database file requiring P6 itself to read. No new dependency: this is a
 * simple line-based text format, built and parsed with plain string splitting.
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
 * EXPORT: A REAL, HIGHER-RISK CAVEAT THAN MSP EXPORT HAD. exportScheduleToXer()'s
 * output is verified by re-importing it through this same file's parseXer() and
 * confirming the data survives — proving PCC's own import/export are mutually
 * consistent, same standard mspXmlService.js's export holds itself to. It has NOT been
 * opened in a real Primavera P6 installation (none is available in this environment).
 * Unlike MSPDI (a well-documented, widely-tolerant Microsoft interchange format), real
 * P6 is known in the field to validate XER imports considerably more strictly, and a
 * genuine, real-world P6 export typically carries far more columns per table (often
 * several dozen) than this file emits — only the fields this file's own importer reads
 * back are written, on the principle that a minimal-but-honest file beats a padded one
 * built from guessed values with no real data behind them. If a file this function
 * produces is ever rejected or only partially accepted by a real P6 installation, that
 * is the expected, documented risk here, not a bug to silently work around — widen the
 * emitted field set deliberately, informed by what a real P6 actually asked for.
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
 * - exportScheduleToXer() mints fresh sequential IDs (proj_id/wbs_id/task_id/
 *   task_pred_id/clndr_id) on every export, same reasoning as mspXmlService.js's
 *   export — PCC has no concept of "this activity's canonical prior XER task_id" to
 *   preserve. `task_code` is taken from PCC's own `external_id` when present (so a
 *   schedule that was originally imported FROM an XER file keeps its original activity
 *   codes on export) or synthesized from the activity's name otherwise.
 * - The exported CALENDAR row carries only `clndr_name`/`day_hr_cnt`/`week_hr_cnt` — no
 *   `clndr_data` (P6's proprietary nested work-week/holiday format) is fabricated,
 *   mirroring import's own refusal to decode it. A real P6 installation may or may not
 *   accept a calendar row with no `clndr_data` at all; this is a known, unverified risk
 *   specific to the calendar table, not silently assumed to work.
 * - Export does not emit Resources/Assignments/Codes, matching import's own scope
 *   limits above.
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

  // ---------------------------------------------------------------------------------
  // Export: PCC schedule -> Primavera P6 XER. See this file's own header for the
  // round-trip verification caveat (a real one, more so than MSP export's) and the
  // deliberate scope limits (fresh IDs, no clndr_data, no Resources/Codes).
  // ---------------------------------------------------------------------------------

  function reverseMap(map) {
    var out = {};
    Object.keys(map).forEach(function (k) {
      out[map[k]] = k;
    });
    return out;
  }
  // NOT reverseMap(TASK_TYPE_MAP): that map is many-to-one (TT_Task/TT_Rsrc/TT_LOE all
  // -> "task"), so a naive reverse would have "task" resolve to whichever key iterated
  // last (TT_LOE) rather than the one actually wanted — a real bug caught before
  // shipping, not a hypothetical. Explicit here instead.
  var TASK_TYPE_EXPORT_MAP = { task: "TT_Task", milestone: "TT_Mile", wbs_summary: "TT_WBS" };
  var STATUS_CODE_REVERSE = reverseMap(STATUS_CODE_MAP);
  var PRED_TYPE_REVERSE = reverseMap(PRED_TYPE_MAP);
  var CONSTRAINT_TYPE_REVERSE = reverseMap(CONSTRAINT_TYPE_MAP);
  var EXPORT_DAY_HR_CNT = 8;

  function xerField(v) {
    // XER is tab/newline-delimited with no escaping mechanism at all — a tab or
    // newline inside a value would corrupt the file structure. Strip rather than
    // silently truncate; real activity names/codes containing a literal tab are not a
    // realistic case worth a warnings-array plumbing exercise for this format.
    return String(v == null ? "" : v).replace(/[\t\r\n]/g, " ");
  }

  function daysToHours(days) {
    return days == null ? "" : String(Math.round(days * EXPORT_DAY_HR_CNT * 100) / 100);
  }

  function toXerDateTime(dateStr, endOfDay) {
    if (!dateStr) return "";
    return dateStr + " " + (endOfDay ? "17:00" : "08:00");
  }

  function tableBlock(tableName, fields, rows) {
    var lines = ["%T\t" + tableName, "%F\t" + fields.join("\t")];
    rows.forEach(function (row) {
      lines.push("%R\t" + fields.map(function (f) { return xerField(row[f]); }).join("\t"));
    });
    return lines.join("\n");
  }

  /** Exports one schedule's WBS/Activities/Relationships (plus, optionally, one
   * Project calendar) into an XER string. Every array is expected already scoped to
   * the one schedule being exported, same "caller owns scoping" convention
   * mspXmlService.js's export and buildScheduleRecords() (schedule.js) already use. */
  function exportScheduleToXer(input) {
    var schedule = input.schedule;
    var wbsItems = input.wbsItems || [];
    var activities = input.activities || [];
    var relationships = input.relationships || [];
    var calendar = input.calendar || null;

    var PROJ_ID = "PROJ1";
    var CLNDR_ID = "1";

    var idCounter = 0;
    function nextId() {
      idCounter++;
      return String(idCounter);
    }

    // WBS: parent-before-child order purely for a readable file — P6 doesn't require
    // any particular row order in PROJWBS since every row carries its own real
    // parent_wbs_id FK (no outline-position dependency the way MSPDI's Task order has).
    var wbsIdByPccId = {};
    var visitedWbsIds = {};
    var wbsRowsOrdered = [];
    var childrenByParent = {};
    wbsItems.forEach(function (w) {
      var key = w.parent_wbs_id || "__root__";
      (childrenByParent[key] = childrenByParent[key] || []).push(w);
    });
    function walkWbs(parentKey) {
      (childrenByParent[parentKey] || []).forEach(function (w) {
        if (visitedWbsIds[w.id]) return; // cycle guard
        visitedWbsIds[w.id] = true;
        wbsIdByPccId[w.id] = nextId();
        wbsRowsOrdered.push(w);
        walkWbs(w.id);
      });
    }
    walkWbs("__root__");

    var wbsRows = wbsRowsOrdered.map(function (w) {
      return {
        wbs_id: wbsIdByPccId[w.id],
        proj_id: PROJ_ID,
        wbs_short_name: w.code || w.name,
        wbs_name: w.name,
        parent_wbs_id: w.parent_wbs_id ? wbsIdByPccId[w.parent_wbs_id] || "" : "",
        seq_num: String(wbsRowsOrdered.indexOf(w) + 1),
      };
    });

    var taskIdByPccId = {};
    var seenTaskCodes = {};
    var taskRows = activities.map(function (a, idx) {
      taskIdByPccId[a.id] = nextId();
      var taskType = TASK_TYPE_EXPORT_MAP[a.activity_type] || "TT_Task";
      var statusCode = STATUS_CODE_REVERSE[a.status] || "TK_NotStart";
      var taskCode = a.external_id || "A" + (idx + 1).toString().padStart(4, "0");
      if (seenTaskCodes[taskCode]) taskCode = taskCode + "-" + (idx + 1); // keep codes unique on export even if two PCC activities happened to share one
      seenTaskCodes[taskCode] = true;

      var row = {
        task_id: taskIdByPccId[a.id],
        proj_id: PROJ_ID,
        wbs_id: a.wbs_id ? wbsIdByPccId[a.wbs_id] || "" : "",
        clndr_id: CLNDR_ID,
        task_code: taskCode,
        task_name: a.name,
        task_type: taskType,
        status_code: statusCode,
        target_drtn_hr_cnt: daysToHours(a.duration),
        remain_drtn_hr_cnt: daysToHours(a.remaining_duration != null ? a.remaining_duration : a.duration),
        target_start_date: toXerDateTime(a.planned_start, false),
        target_end_date: toXerDateTime(a.planned_finish, true),
        act_start_date: toXerDateTime(a.actual_start, false),
        act_end_date: toXerDateTime(a.actual_finish, true),
        cstr_type: a.constraint_type && CONSTRAINT_TYPE_REVERSE[a.constraint_type] !== undefined ? CONSTRAINT_TYPE_REVERSE[a.constraint_type] : "",
        cstr_date: "",
      };
      if (row.cstr_type) row.cstr_date = toXerDateTime(a.constraint_date, false);
      return row;
    });

    var taskPredRows = [];
    relationships.forEach(function (r) {
      var predId = taskIdByPccId[r.predecessor_id];
      var succId = taskIdByPccId[r.successor_id];
      if (!predId || !succId) return; // a relationship pointing outside this scoped set
      taskPredRows.push({
        task_pred_id: nextId(),
        proj_id: PROJ_ID,
        task_id: succId,
        pred_task_id: predId,
        pred_type: PRED_TYPE_REVERSE[r.type] || "PR_FS",
        lag_hr_cnt: daysToHours(r.lag || 0),
      });
    });

    var calendarRows = [
      {
        clndr_id: CLNDR_ID,
        default_flag: "Y",
        clndr_name: (calendar && calendar.name) || "Standard",
        proj_id: "", // a project-specific (non-global) calendar would set this; kept global/blank, same as a typical "Standard" calendar
        day_hr_cnt: String(EXPORT_DAY_HR_CNT),
        week_hr_cnt: String(EXPORT_DAY_HR_CNT * 5),
      },
    ];

    var today = new Date().toISOString().slice(0, 10);
    var lines = [
      "ERMHDR\t21.12\t" + today + "\tProject\tpcc\tpcc\tProject Control Center\tUSD\t",
      tableBlock("PROJECT", ["proj_id", "proj_short_name"], [{ proj_id: PROJ_ID, proj_short_name: xerField(schedule.name || "PCC Schedule").slice(0, 100) }]),
      tableBlock("CALENDAR", ["clndr_id", "default_flag", "clndr_name", "proj_id", "day_hr_cnt", "week_hr_cnt"], calendarRows),
      tableBlock("PROJWBS", ["wbs_id", "proj_id", "wbs_short_name", "wbs_name", "parent_wbs_id", "seq_num"], wbsRows),
      tableBlock(
        "TASK",
        ["task_id", "proj_id", "wbs_id", "clndr_id", "task_code", "task_name", "task_type", "status_code", "target_drtn_hr_cnt", "remain_drtn_hr_cnt", "target_start_date", "target_end_date", "act_start_date", "act_end_date", "cstr_type", "cstr_date"],
        taskRows
      ),
      tableBlock("TASKPRED", ["task_pred_id", "proj_id", "task_id", "pred_task_id", "pred_type", "lag_hr_cnt"], taskPredRows),
      "%E",
    ];

    return lines.join("\n") + "\n";
  }

  window.PCC.p6XerService = {
    parseXer: parseXer,
    exportScheduleToXer: exportScheduleToXer,
    TASK_TYPE_MAP: TASK_TYPE_MAP,
    STATUS_CODE_MAP: STATUS_CODE_MAP,
    PRED_TYPE_MAP: PRED_TYPE_MAP,
    CONSTRAINT_TYPE_MAP: CONSTRAINT_TYPE_MAP,
  };
})();
