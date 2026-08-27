/* Microsoft Project XML (MSPDI — "Microsoft Project Data Interchange") import AND
 * export. No DOM manipulation of the app's own UI, no store writes — same separation
 * scheduleImportService.js (Excel) already keeps. parseMspXml() returns the *exact same
 * shape* parseRows() does ({ activities, wbsEntries, relationships, warnings, errors,
 * summary }, plus one MSP-specific addition, `calendar`) so schedule.js's existing
 * buildScheduleRecords() can consume either importer's output without caring which file
 * format it came from. That's the whole point of the Architecture Upgrade Phase 1
 * canonical model this file feeds into and reads back out of.
 *
 * PCC Architecture Upgrade Phase 2 (Microsoft Project File Interoperability). Per the
 * master upgrade prompt's own instruction: MSP XML is the practical *exchange* format,
 * not the native .mpp binary format (which realistically requires Microsoft Project
 * itself, or a heavyweight third-party binary parser, to read reliably) — this reads
 * the file MS Project produces via File → Export → Project XML (or "Save As" → XML),
 * a well-documented, plain-text, DOM-parseable schema, and produces one MS Project
 * should be able to open the same way. `DOMParser` is a native browser API
 * (Electron/Chromium and the Capacitor Android WebView both have it) — no new
 * dependency, consistent with this app's "no npm deps for the app itself" rule.
 *
 * ROUND-TRIP VERIFICATION, HONESTLY STATED: exportScheduleToMspXml()'s output has been
 * verified by re-importing it through this file's own parseMspXml() and confirming the
 * data survives (see test_msp_xml_export_service.js's round-trip checks) — that proves
 * PCC's own import/export are mutually consistent for every field each side handles.
 * It does NOT prove Microsoft Project itself accepts the file, since no MS Project
 * installation is available to test against in this environment. Per the master
 * prompt's own "do not claim round-trip until tested" rule: treat the *shape* as
 * verified, the *real-MS-Project-openable* claim as unverified until someone confirms
 * it against an actual Microsoft Project installation.
 *
 * DELIBERATE SCOPE LIMITS (read before extending this file):
 * - Resources/assignments are NOT imported or exported here. PCC already has its own portfolio-wide
 *   Resource Management module (Gate 11) with its own dedup/matching conventions —
 *   auto-creating Resources from an MSP file's <Resources> block risks colliding with
 *   that module's own rules and is explicitly deferred to a future, focused gate rather
 *   than bolted on here.
 * - Baselines (<Task><Baseline> sub-elements) are NOT imported — PCC's own baseline
 *   capture (scheduleBaselineEngine.js) already exists and works from data already in
 *   PCC; importing a *second*, MSP-native baseline concept on top of it is future work.
 * - A Task with <Summary>1</Summary> becomes a PCC WBS item (`wbs_items[]`), never a
 *   schedule-network Activity — mirrors how scheduleImportService.js already treats a
 *   WBS row distinctly from a leaf activity. A summary task that itself carries
 *   predecessor/successor links (unusual, but MSP allows it) will have those links
 *   reported as unresolved, same warn-and-skip treatment as any other unmatched
 *   reference — not silently dropped without explanation.
 * - Calendars: only the file's *default* calendar (referenced by the root <Project>'s
 *   own <CalendarUID>, or the first <Calendar> if that's absent) is imported, into one
 *   new Architecture-Upgrade-Phase-1 `calendars[]` record. Per that phase's own scope,
 *   this is purely representational — scheduleCpmEngine.js stays calendar-naive; this
 *   importer does not attempt working-day-aware date math.
 * - Duration/lag unit conversion: MSPDI stores durations as ISO-8601-shaped strings
 *   ("PT40H0M0S") that are always genuinely hour-based (unambiguous), converted here to
 *   PCC's calendar-day duration unit by dividing by 8 (a standard 8-hour working day) —
 *   the file's own calendar may define a different daily-hours setting, so this is a
 *   documented, file-wide assumption (one summary warning), not a per-row guess.
 *   Relationship <LinkLag> is genuinely ambiguous without fully decoding <LagFormat>'s
 *   full enumeration (minutes/hours/days/percent, elapsed vs. working) — rather than
 *   risk a confidently-wrong number, a non-zero lag is converted assuming tenths-of-a-
 *   day (the common case for day-scheduled construction programmes) WITH a per-
 *   relationship warning so it's never presented as a silent, unverified fact. Zero lag
 *   (by far the most common value) needs no conversion and gets no warning.
 * - exportScheduleToMspXml() mints fresh sequential UIDs for every WBS/Activity on each
 *   export rather than trying to preserve a prior file's original UIDs — PCC has no
 *   concept of "this activity's canonical MSP UID" to preserve across edits (its own
 *   `external_id` is reused for a re-*import* match, not guaranteed to be a clean MSP
 *   UID to begin with, e.g. for a hand-built or Excel-sourced activity). Re-importing an
 *   exported file therefore round-trips PCC's own data correctly but does not preserve
 *   UID continuity with whatever file was originally imported, if any.
 * - Export fabricates a start-of-day/end-of-day time (08:00/17:00) on every date, since
 *   PCC's own schedule model has no time-of-day concept (`planned_start` is a plain
 *   "YYYY-MM-DD" date) — this is a presentation convention for a valid MSPDI file, not
 *   information recovered from anywhere.
 * - Export does not emit Resources/Assignments, Baselines, or a project-summary Task
 *   (UID 0) — same scope limits as import, for the same reasons above; most tools
 *   (including real Microsoft Project) synthesize a project-summary task themselves on
 *   open if one isn't present, so omitting it is a safe, common minimal-file convention.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  // MSPDI's own documented enumeration for <PredecessorLink><Type>.
  var RELATIONSHIP_TYPE_MAP = { 0: "FF", 1: "FS", 2: "SF", 3: "SS" };
  // MSPDI's own documented enumeration for <ConstraintType>. Stored onto PCC's
  // free-text constraint_type field (no enum there — see store.js's newActivity) as a
  // short, industry-recognizable code; CPM engine (scheduleCpmEngine.js) doesn't
  // consult this field for date math, so it's informational only, same as it already
  // is for hand-entered/Excel-imported activities.
  var CONSTRAINT_TYPE_MAP = {
    0: "ASAP",
    1: "ALAP",
    2: "MSO",
    3: "MFO",
    4: "SNET",
    5: "SNLT",
    6: "FNET",
    7: "FNLT",
  };
  var HOURS_PER_DAY_ASSUMED = 8;

  function text(el, tagName) {
    if (!el) return "";
    var found = el.getElementsByTagName(tagName)[0];
    return found ? (found.textContent || "").trim() : "";
  }

  /** Parses an MSPDI ISO-8601-shaped duration string ("PT40H0M0S", "P2DT0H0M0S") into
   * total hours. Returns null (not 0) when the string is empty/unparseable, so callers
   * can tell "no duration given" apart from "a real zero-hour duration". */
  function parseIsoDurationHours(str) {
    if (!str) return null;
    var m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(str.trim());
    if (!m) return null;
    var days = parseFloat(m[1] || "0");
    var hours = parseFloat(m[2] || "0");
    var minutes = parseFloat(m[3] || "0");
    var seconds = parseFloat(m[4] || "0");
    return days * 24 + hours + minutes / 60 + seconds / 3600;
  }

  function isoDurationToDays(str) {
    var hours = parseIsoDurationHours(str);
    return hours == null ? null : hours / HOURS_PER_DAY_ASSUMED;
  }

  /** MSPDI datetimes are "2026-01-05T08:00:00" — PCC's date fields are plain
   * "YYYY-MM-DD" strings (see scheduleImportService.js's own parseDate()). A missing or
   * unparseable value returns "" (blank), never a fabricated date. */
  function parseMspDate(str) {
    if (!str) return "";
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(str.trim());
    return m ? m[1] : "";
  }

  /** WBS hierarchy from dotted codes, same "don't invent a parent that isn't in the
   * file" rule scheduleImportService.js's own wbsEntries derivation uses — deliberately
   * duplicated (not shared) since the input shape here (a Map of code -> name from
   * Summary tasks) differs enough from that file's row-based wbsCodesSeen that sharing
   * would need its own translation layer for no real benefit. */
  function buildWbsEntries(wbsCodesSeen, warnings) {
    var wbsEntries = Object.keys(wbsCodesSeen).map(function (code) {
      var segments = code.split(".");
      var parentCode = segments.length > 1 ? segments.slice(0, -1).join(".") : null;
      return { code: code, name: wbsCodesSeen[code], parent_code: parentCode, level: segments.length - 1 };
    });
    var presentCodes = {};
    wbsEntries.forEach(function (w) {
      presentCodes[w.code] = true;
    });
    wbsEntries.forEach(function (w) {
      if (w.parent_code && !presentCodes[w.parent_code]) {
        warnings.push({
          row: null,
          message:
            'WBS "' + w.code + '" implies a parent code "' + w.parent_code + '" that isn’t itself a Summary task in this file ' +
            "— imported as a top-level WBS item instead of inventing that parent.",
        });
        w.parent_code = null;
        w.level = 0;
      }
    });
    return wbsEntries;
  }

  /** Parses the file's default Calendar (the one <Project><CalendarUID> references, or
   * the first <Calendar> if that's absent/unmatched) into a plain object ready for
   * store.newCalendar() — see this file's own header for why this is representational
   * only. Returns null if the file has no <Calendars> block at all. */
  function parseDefaultCalendar(doc, warnings) {
    var calendarsEl = doc.getElementsByTagName("Calendars")[0];
    if (!calendarsEl) return null;
    var calendarEls = calendarsEl.getElementsByTagName("Calendar");
    if (calendarEls.length === 0) return null;

    var projectEl = doc.getElementsByTagName("Project")[0];
    var wantUid = projectEl ? text(projectEl, "CalendarUID") : "";
    var chosen = null;
    for (var i = 0; i < calendarEls.length; i++) {
      if (wantUid && text(calendarEls[i], "UID") === wantUid) {
        chosen = calendarEls[i];
        break;
      }
    }
    if (!chosen) chosen = calendarEls[0];

    // MSPDI DayType: 1=Sunday ... 7=Saturday. PCC's working_days is Mon-first
    // (index 0=Monday ... 6=Sunday) — see newCalendar()'s own comment in store.js.
    var MSP_DAY_TYPE_TO_PCC_INDEX = { 1: 6, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
    var workingDays = [true, true, true, true, true, false, false];
    var weekDayEls = chosen.getElementsByTagName("WeekDay");
    for (var w = 0; w < weekDayEls.length; w++) {
      var dayType = parseInt(text(weekDayEls[w], "DayType"), 10);
      var pccIndex = MSP_DAY_TYPE_TO_PCC_INDEX[dayType];
      if (pccIndex === undefined) continue; // e.g. DayType 0 = a per-date exception entry, handled below instead
      var workingText = text(weekDayEls[w], "DayWorking");
      if (workingText !== "") workingDays[pccIndex] = workingText === "1";
    }

    var holidays = [];
    var exceptionEls = chosen.getElementsByTagName("Exception");
    var HOLIDAY_CAP = 366; // guards against a malformed/pathological date range
    for (var e = 0; e < exceptionEls.length; e++) {
      var exWorking = text(exceptionEls[e], "DayWorking");
      if (exWorking !== "0") continue; // only non-working exceptions are "holidays" here
      var fromStr = parseMspDate(text(exceptionEls[e], "FromDate"));
      var toStr = parseMspDate(text(exceptionEls[e], "ToDate")) || fromStr;
      if (!fromStr) continue;
      var cursor = new Date(fromStr + "T00:00:00Z");
      var end = new Date(toStr + "T00:00:00Z");
      var count = 0;
      while (cursor.getTime() <= end.getTime() && count < HOLIDAY_CAP) {
        holidays.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        count++;
      }
      if (count >= HOLIDAY_CAP) {
        warnings.push({ row: null, message: "A calendar exception spanning more than " + HOLIDAY_CAP + " days was truncated." });
      }
    }

    return {
      name: text(chosen, "Name") || "Imported Calendar",
      working_days: workingDays,
      holidays: holidays,
    };
  }

  /** Parses an MSPDI XML document (as a raw string) into the same shape
   * scheduleImportService.parseRows() returns, plus a `calendar` field. Nothing is
   * written anywhere — schedule.js owns turning this into store records, same
   * separation as the Excel importer. */
  function parseMspXml(xmlText) {
    var errors = [];
    var warnings = [];
    var empty = { activities: [], wbsEntries: [], relationships: [], calendar: null, warnings: warnings, errors: errors, summary: { total_rows: 0, imported: 0, warnings: 0, errors: errors.length, circular_relationships_skipped: 0 } };

    var doc;
    try {
      doc = new DOMParser().parseFromString(xmlText, "application/xml");
    } catch (e) {
      errors.push({ row: null, message: "Could not parse this file as XML: " + e.message });
      return empty;
    }
    if (doc.getElementsByTagName("parsererror").length > 0) {
      errors.push({ row: null, message: "This file is not well-formed XML — check that it wasn't truncated or corrupted." });
      return empty;
    }
    var projectEl = doc.getElementsByTagName("Project")[0];
    if (!projectEl) {
      errors.push({ row: null, message: "This doesn't look like a Microsoft Project XML file — no <Project> root element found." });
      return empty;
    }

    var taskEls = doc.getElementsByTagName("Task");
    if (taskEls.length === 0) {
      errors.push({ row: null, message: "This file has a <Project> element but no <Task> entries — nothing to import." });
      return empty;
    }

    var wbsCodesSeen = {};
    var summaryUids = {}; // uid -> true, so relationships can name summary-task targets distinctly
    var leafTasks = [];
    var appliedDurationAssumption = false;

    for (var t = 0; t < taskEls.length; t++) {
      var taskEl = taskEls[t];
      var uid = text(taskEl, "UID");
      var id = text(taskEl, "ID");
      if (id === "0" || text(taskEl, "IsNull") === "1") continue; // project summary row / deleted placeholder row

      var name = text(taskEl, "Name");
      var isSummary = text(taskEl, "Summary") === "1";
      var wbsCode = text(taskEl, "WBS");

      if (isSummary) {
        summaryUids[uid] = true;
        if (wbsCode) wbsCodesSeen[wbsCode] = name || wbsCode;
        continue;
      }

      if (!uid) {
        warnings.push({ row: null, message: 'A Task named "' + (name || "(unnamed)") + '" has no <UID> — row skipped.' });
        continue;
      }
      if (!name) {
        warnings.push({ row: null, message: 'Task UID ' + uid + " has no <Name> — row skipped." });
        continue;
      }

      var durationStr = text(taskEl, "Duration");
      var durationDays = isoDurationToDays(durationStr);
      if (durationStr && durationDays != null) appliedDurationAssumption = true;
      var remainingDurationDays = isoDurationToDays(text(taskEl, "RemainingDuration"));

      var constraintTypeCode = text(taskEl, "ConstraintType");
      var constraintType = constraintTypeCode !== "" ? CONSTRAINT_TYPE_MAP[parseInt(constraintTypeCode, 10)] || "" : "";
      // ASAP (0) / ALAP (1) carry no meaningful constraint date even if the file has one.
      var constraintDate = constraintType && constraintType !== "ASAP" && constraintType !== "ALAP" ? parseMspDate(text(taskEl, "ConstraintDate")) : "";

      var parentCode = wbsCode && wbsCode.indexOf(".") !== -1 ? wbsCode.slice(0, wbsCode.lastIndexOf(".")) : null;

      var predecessorLinkEls = taskEl.getElementsByTagName("PredecessorLink");
      var predecessors = [];
      for (var p = 0; p < predecessorLinkEls.length; p++) {
        var linkEl = predecessorLinkEls[p];
        var predUid = text(linkEl, "PredecessorUID");
        var typeCode = text(linkEl, "Type");
        var type = typeCode !== "" ? RELATIONSHIP_TYPE_MAP[parseInt(typeCode, 10)] : undefined;
        if (typeCode !== "" && !type) {
          warnings.push({ row: null, message: 'Task UID ' + uid + ': unrecognized relationship type code "' + typeCode + '" — defaulted to Finish-to-Start.' });
        }
        type = type || "FS";
        var lagRaw = text(linkEl, "LinkLag");
        var lag = 0;
        if (lagRaw && parseInt(lagRaw, 10) !== 0) {
          lag = Math.round(parseInt(lagRaw, 10) / 10);
          warnings.push({
            row: null,
            message:
              "Lag on a relationship into Task UID " + uid + " (" + lagRaw + ") was converted to " + lag +
              " day(s) assuming day-based units — verify against the source file if this schedule uses a different lag unit.",
          });
        }
        predecessors.push({ predecessor_uid: predUid, type: type, lag: lag });
      }

      leafTasks.push({
        uid: uid,
        name: name,
        milestone: text(taskEl, "Milestone") === "1",
        wbs_code: wbsCode || null,
        parent_wbs_code: parentCode,
        duration: durationDays,
        remaining_duration: remainingDurationDays,
        planned_start: parseMspDate(text(taskEl, "Start")),
        planned_finish: parseMspDate(text(taskEl, "Finish")),
        actual_start: parseMspDate(text(taskEl, "ActualStart")),
        actual_finish: parseMspDate(text(taskEl, "ActualFinish")),
        percent_complete: (function () {
          var pc = text(taskEl, "PercentComplete");
          var n = pc !== "" ? Number(pc) : 0;
          return isFinite(n) ? n : 0;
        })(),
        constraint_type: constraintType,
        constraint_date: constraintDate,
        predecessors: predecessors,
      });
    }

    if (appliedDurationAssumption) {
      warnings.push({
        row: null,
        message:
          "Task durations were converted from Microsoft Project's hour-based format assuming an " +
          HOURS_PER_DAY_ASSUMED + "-hour working day — verify against the source file if its calendar uses a different daily-hours setting.",
      });
    }

    if (leafTasks.length === 0) {
      errors.push({ row: null, message: "This file has Task entries, but every one of them is either a Summary/rollup row or missing required fields — nothing importable found." });
      return empty;
    }

    var wbsEntries = buildWbsEntries(wbsCodesSeen, warnings);
    var wbsCodesPresent = {};
    wbsEntries.forEach(function (w) {
      wbsCodesPresent[w.code] = true;
    });

    var uidToExternalId = {};
    var activities = leafTasks.map(function (lt) {
      uidToExternalId[lt.uid] = lt.uid;
      var resolvedWbsCode = lt.parent_wbs_code && wbsCodesPresent[lt.parent_wbs_code] ? lt.parent_wbs_code : null;
      if (!resolvedWbsCode) {
        warnings.push({ row: null, message: 'Activity "' + lt.name + '" (UID ' + lt.uid + ") has no matching WBS Summary task — imported without a WBS assignment." });
      }
      return {
        row: null,
        external_id: lt.uid,
        name: lt.name,
        activity_type: lt.milestone ? "milestone" : "task",
        wbs_code: resolvedWbsCode,
        duration: lt.duration,
        remaining_duration: lt.remaining_duration,
        planned_start: lt.planned_start,
        planned_finish: lt.planned_finish,
        actual_start: lt.actual_start,
        actual_finish: lt.actual_finish,
        percent_complete: lt.percent_complete,
        constraint_type: lt.constraint_type,
        constraint_date: lt.constraint_date,
        discipline: "",
        contractor: "",
        responsible_person: "",
        status: "not_started",
        notes: "",
      };
    });

    var relationshipsRaw = [];
    leafTasks.forEach(function (lt) {
      lt.predecessors.forEach(function (pred) {
        if (!pred.predecessor_uid) return;
        if (summaryUids[pred.predecessor_uid]) {
          warnings.push({ row: null, message: 'Task UID ' + lt.uid + "'s predecessor (UID " + pred.predecessor_uid + ") is a WBS Summary rollup, not an importable Activity — relationship skipped." });
          return;
        }
        if (!uidToExternalId[pred.predecessor_uid]) {
          warnings.push({ row: null, message: 'Task UID ' + lt.uid + "'s predecessor (UID " + pred.predecessor_uid + ") was not found in this file — relationship skipped." });
          return;
        }
        if (pred.predecessor_uid === lt.uid) {
          warnings.push({ row: null, message: 'Task UID ' + lt.uid + " lists itself as its own predecessor — skipped." });
          return;
        }
        relationshipsRaw.push({
          predecessor_external_id: pred.predecessor_uid,
          successor_external_id: lt.uid,
          type: pred.type,
          lag: pred.lag,
        });
      });
    });

    var circResult = window.PCC.scheduleImportService.detectAndSkipCircularRelationships(relationshipsRaw);
    warnings = warnings.concat(circResult.warnings);

    var calendar = parseDefaultCalendar(doc, warnings);

    return {
      activities: activities,
      wbsEntries: wbsEntries,
      relationships: circResult.relationships,
      calendar: calendar,
      warnings: warnings,
      errors: errors,
      summary: {
        total_rows: taskEls.length,
        imported: activities.length,
        warnings: warnings.length,
        errors: errors.length,
        circular_relationships_skipped: circResult.circularPairs,
      },
    };
  }

  // ---------------------------------------------------------------------------------
  // Export: PCC schedule -> Microsoft Project XML. See this file's own header for the
  // round-trip verification caveat and the deliberate scope limits (fresh UIDs, no
  // Resources/Baselines/project-summary-task, fabricated 08:00/17:00 times).
  // ---------------------------------------------------------------------------------

  function reverseMap(map) {
    var out = {};
    Object.keys(map).forEach(function (k) {
      out[map[k]] = k;
    });
    return out;
  }
  var RELATIONSHIP_TYPE_REVERSE = reverseMap(RELATIONSHIP_TYPE_MAP); // "FS" -> "1", etc.
  var CONSTRAINT_TYPE_REVERSE = reverseMap(CONSTRAINT_TYPE_MAP); // "ASAP" -> "0", etc.

  function escapeXml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c];
    });
  }

  /** Inverse of isoDurationToDays() above — a PCC day count back into an MSPDI
   * hour-based duration string, using the same 8-hour-day convention (documented in
   * this file's header). Returns null (element omitted) for a missing duration, never
   * a fabricated "PT0H0M0S" that would misrepresent an activity as zero-duration. */
  function daysToIsoDuration(days) {
    if (days == null) return null;
    var hours = Math.round(days * HOURS_PER_DAY_ASSUMED * 100) / 100;
    return "PT" + hours + "H0M0S";
  }

  /** A PCC "YYYY-MM-DD" date string into an MSPDI datetime, fabricating a start-of-day
   * (08:00) or end-of-day (17:00) time — PCC has no time-of-day concept to recover, see
   * this file's header. Returns null (element omitted) for a blank/missing date. */
  function toMspDateTime(dateStr, endOfDay) {
    if (!dateStr) return null;
    return dateStr + (endOfDay ? "T17:00:00" : "T08:00:00");
  }

  /** Builds an MSPDI <Calendars> block from one PCC calendar record (see
   * newCalendar() in store.js) — the reverse of parseDefaultCalendar() above. */
  function buildCalendarXml(calendar) {
    if (!calendar) return "";
    var MSP_DAY_TYPES = [2, 3, 4, 5, 6, 7, 1]; // PCC index 0=Mon..6=Sun -> MSPDI DayType 1=Sun..7=Sat
    var weekDaysXml = calendar.working_days
      .map(function (working, i) {
        return "      <WeekDay><DayType>" + MSP_DAY_TYPES[i] + "</DayType><DayWorking>" + (working ? 1 : 0) + "</DayWorking></WeekDay>";
      })
      .join("\n");
    var exceptionsXml = (calendar.holidays || [])
      .map(function (dateStr) {
        return (
          "      <Exception><DayWorking>0</DayWorking><TimePeriod><FromDate>" + dateStr +
          "T00:00:00</FromDate><ToDate>" + dateStr + "T00:00:00</ToDate></TimePeriod></Exception>"
        );
      })
      .join("\n");
    return (
      "  <CalendarUID>1</CalendarUID>\n" +
      "  <Calendars>\n" +
      "    <Calendar>\n" +
      "      <UID>1</UID>\n" +
      "      <Name>" + escapeXml(calendar.name || "Standard") + "</Name>\n" +
      "      <IsBaseCalendar>1</IsBaseCalendar>\n" +
      "      <WeekDays>\n" + weekDaysXml + "\n      </WeekDays>\n" +
      (exceptionsXml ? "      <Exceptions>\n" + exceptionsXml + "\n      </Exceptions>\n" : "") +
      "    </Calendar>\n" +
      "  </Calendars>\n"
    );
  }

  /** Turns one PCC WBS item or Activity into a <Task> element's inner field lines
   * (everything except the UID/ID/WBS/OutlineLevel/PredecessorLink wiring the caller
   * already handles, since those depend on the emission-order walk below). */
  function buildTaskFields(activity) {
    var lines = [];
    var duration = daysToIsoDuration(activity.duration);
    if (duration) lines.push("      <Duration>" + duration + "</Duration>");
    var remaining = daysToIsoDuration(activity.remaining_duration);
    if (remaining) lines.push("      <RemainingDuration>" + remaining + "</RemainingDuration>");
    var start = toMspDateTime(activity.planned_start, false);
    if (start) lines.push("      <Start>" + start + "</Start>");
    var finish = toMspDateTime(activity.planned_finish, true);
    if (finish) lines.push("      <Finish>" + finish + "</Finish>");
    var actualStart = toMspDateTime(activity.actual_start, false);
    if (actualStart) lines.push("      <ActualStart>" + actualStart + "</ActualStart>");
    var actualFinish = toMspDateTime(activity.actual_finish, true);
    if (actualFinish) lines.push("      <ActualFinish>" + actualFinish + "</ActualFinish>");
    lines.push("      <PercentComplete>" + (activity.percent_complete || 0) + "</PercentComplete>");
    if (activity.activity_type === "milestone") lines.push("      <Milestone>1</Milestone>");
    if (activity.constraint_type && CONSTRAINT_TYPE_REVERSE[activity.constraint_type] !== undefined) {
      lines.push("      <ConstraintType>" + CONSTRAINT_TYPE_REVERSE[activity.constraint_type] + "</ConstraintType>");
      var constraintDate = toMspDateTime(activity.constraint_date, false);
      if (constraintDate) lines.push("      <ConstraintDate>" + constraintDate + "</ConstraintDate>");
    }
    return lines;
  }

  /** Exports one schedule's WBS/Activities/Relationships (plus, optionally, one
   * Project calendar) into an MSPDI XML string. Every array is expected already scoped
   * to the one schedule being exported — this function itself doesn't filter by
   * schedule_id, same "caller owns scoping" convention buildScheduleRecords() (the
   * import-side equivalent, in schedule.js) already follows. */
  function exportScheduleToMspXml(input) {
    var schedule = input.schedule;
    var wbsItems = input.wbsItems || [];
    var activities = input.activities || [];
    var relationships = input.relationships || [];
    var calendar = input.calendar || null;

    var uidCounter = 0;
    var uidByPccId = {};
    function nextUid(pccId) {
      uidCounter++;
      uidByPccId[pccId] = uidCounter;
      return uidCounter;
    }

    var activitiesByWbsId = {};
    activities.forEach(function (a) {
      var key = a.wbs_id || "__unassigned__";
      (activitiesByWbsId[key] = activitiesByWbsId[key] || []).push(a);
    });
    var wbsChildrenByParent = {};
    wbsItems.forEach(function (w) {
      var key = w.parent_wbs_id || "__root__";
      (wbsChildrenByParent[key] = wbsChildrenByParent[key] || []).push(w);
    });

    var taskXmlBlocks = [];
    var idCounter = 0;
    var visitedWbsIds = {}; // guards against a malformed/cyclic parent_wbs_id chain

    function emitTask(uid, id, name, outlineLevel, wbsCode, isSummary, activity) {
      var lines = [];
      lines.push("    <Task>");
      lines.push("      <UID>" + uid + "</UID>");
      lines.push("      <ID>" + id + "</ID>");
      lines.push("      <Name>" + escapeXml(name) + "</Name>");
      if (wbsCode) lines.push("      <WBS>" + escapeXml(wbsCode) + "</WBS>");
      lines.push("      <OutlineLevel>" + outlineLevel + "</OutlineLevel>");
      if (isSummary) {
        lines.push("      <Summary>1</Summary>");
      } else {
        lines = lines.concat(buildTaskFields(activity));
      }
      lines.push("    </Task>");
      taskXmlBlocks.push(lines.join("\n"));
    }

    function walk(parentKey, level) {
      var children = wbsChildrenByParent[parentKey] || [];
      children.forEach(function (w) {
        if (visitedWbsIds[w.id]) return; // cycle guard
        visitedWbsIds[w.id] = true;
        idCounter++;
        var uid = nextUid(w.id);
        emitTask(uid, idCounter, w.name, level, w.code, true, null);
        walk(w.id, level + 1);
        (activitiesByWbsId[w.id] || []).forEach(function (a, idx) {
          idCounter++;
          var actUid = nextUid(a.id);
          // A leaf activity's own WBS value must be a child code under its parent
          // Summary task's code (e.g. parent "1" -> "1.1", "1.2", ...) — mirrors how
          // parseMspXml() resolves a leaf's wbs_code by truncating its own WBS field by
          // one segment. Emitting no WBS field here (as an earlier version of this
          // function did) meant a re-import could never find the parent again.
          emitTask(actUid, idCounter, a.name, level + 1, w.code + "." + (idx + 1), false, a);
        });
      });
    }
    walk("__root__", 1);

    // Activities with no WBS assignment (or pointing at a WBS item not in this set) go
    // last, top-level — same "don't invent a WBS assignment" rule the importer follows.
    var assignedActivityIds = {};
    Object.keys(activitiesByWbsId).forEach(function (key) {
      if (key === "__unassigned__") return;
      activitiesByWbsId[key].forEach(function (a) {
        assignedActivityIds[a.id] = true;
      });
    });
    activities.forEach(function (a) {
      if (uidByPccId[a.id] !== undefined) return; // already emitted above
      idCounter++;
      var uid = nextUid(a.id);
      emitTask(uid, idCounter, a.name, 1, null, false, a);
    });

    var predecessorLinksByActivityId = {};
    relationships.forEach(function (r) {
      var predUid = uidByPccId[r.predecessor_id];
      var succUid = uidByPccId[r.successor_id];
      if (!predUid || !succUid) return; // a relationship pointing outside this scoped set
      (predecessorLinksByActivityId[r.successor_id] = predecessorLinksByActivityId[r.successor_id] || []).push(
        "      <PredecessorLink><PredecessorUID>" + predUid + "</PredecessorUID><Type>" +
          (RELATIONSHIP_TYPE_REVERSE[r.type] !== undefined ? RELATIONSHIP_TYPE_REVERSE[r.type] : RELATIONSHIP_TYPE_REVERSE.FS) +
          "</Type><LinkLag>" + Math.round((r.lag || 0) * 10) + "</LinkLag><LagFormat>7</LagFormat></PredecessorLink>"
      );
    });
    // Splice each activity's PredecessorLink lines in just before its closing </Task> —
    // done as a post-pass so emitTask() above doesn't need relationship data threaded
    // through the recursive WBS walk.
    activities.forEach(function (a) {
      var links = predecessorLinksByActivityId[a.id];
      if (!links || !links.length) return;
      var uid = uidByPccId[a.id];
      var marker = "      <UID>" + uid + "</UID>";
      var blockIndex = taskXmlBlocks.findIndex(function (block) {
        return block.indexOf(marker) !== -1;
      });
      if (blockIndex === -1) return;
      var block = taskXmlBlocks[blockIndex];
      taskXmlBlocks[blockIndex] = block.replace(/\n    <\/Task>$/, "\n" + links.join("\n") + "\n    </Task>");
    });

    var xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Project xmlns="http://schemas.microsoft.com/project">\n' +
      "  <Name>" + escapeXml(schedule.name || "PCC Schedule") + "</Name>\n" +
      buildCalendarXml(calendar) +
      "  <Tasks>\n" + taskXmlBlocks.join("\n") + "\n  </Tasks>\n" +
      "</Project>\n";

    return xml;
  }

  window.PCC.mspXmlService = {
    parseMspXml: parseMspXml,
    exportScheduleToMspXml: exportScheduleToMspXml,
    parseIsoDurationHours: parseIsoDurationHours,
    RELATIONSHIP_TYPE_MAP: RELATIONSHIP_TYPE_MAP,
    CONSTRAINT_TYPE_MAP: CONSTRAINT_TYPE_MAP,
  };
})();
