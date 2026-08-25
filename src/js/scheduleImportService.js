/* Schedule Excel import \u2014 parsing and validation only. No DOM, no store writes, no
 * SheetJS calls here (that stays in schedule.js, same as documents.js's convention).
 * Kept UI-independent for the same reason the spec insists the CPM engine (Gate 3)
 * must be: so it's directly testable and so parsing logic never ends up tangled into
 * render code. Callers pass already-parsed { headers, rows } (SheetJS's
 * sheet_to_json(sheet, { header: 1 }) shape) and get back structured import
 * candidates plus a full warnings/errors list \u2014 nothing is written anywhere yet.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var ACTIVITY_TYPE_ALIASES = {
    task: "task",
    activity: "task",
    milestone: "milestone",
    ms: "milestone",
    summary: "summary",
    "wbs summary": "wbs_summary",
    wbssummary: "wbs_summary",
    // Underscore form recognized too — it's the raw value the app stores internally
    // (see store.js's newActivity), so the in-app Excel grid editor (schedule.js) can
    // round-trip a WBS Summary activity through <select value="wbs_summary"> without a
    // spurious "unrecognized type" warning on every Apply.
    wbs_summary: "wbs_summary",
  };

  var HEADER_MAP = {
    // NOTE: "completion date" is mapped to planned_finish below on the assumption it
    // means the target/plan date, not an as-built actual finish \u2014 that's a real
    // ambiguity in scheduling terminology, not a settled convention. If your files use
    // "Completion Date" for actual completion, say so and it should map to
    // actual_finish instead (which currently has no header aliases at all).
    "activity id": "external_id",
    id: "external_id",
    "activity name": "name",
    name: "name",
    "task name": "name",
    "wbs code": "wbs_code",
    wbs: "wbs_code",
    "wbs name": "wbs_name",
    "activity type": "activity_type",
    type: "activity_type",
    duration: "duration",
    "duration (days)": "duration",
    "planned start": "planned_start",
    "planned start date": "planned_start",
    start: "planned_start",
    "start date": "planned_start",
    "target start": "planned_start",
    "baseline start": "planned_start",
    "planned finish": "planned_finish",
    "planned finish date": "planned_finish",
    "planned end": "planned_finish",
    "planned end date": "planned_finish",
    finish: "planned_finish",
    "finish date": "planned_finish",
    "end date": "planned_finish",
    end: "planned_finish",
    "target finish": "planned_finish",
    "baseline finish": "planned_finish",
    "completion date": "planned_finish", // ambiguous \u2014 see comment above HEADER_MAP
    "target completion": "planned_finish",
    predecessors: "predecessors",
    predecessor: "predecessors",
    "% complete": "percent_complete",
    "percent complete": "percent_complete",
    progress: "percent_complete",
    discipline: "discipline",
    contractor: "contractor",
    "responsible person": "responsible_person",
    responsible: "responsible_person",
    owner: "responsible_person",
    status: "status",
    notes: "notes",
    comments: "notes",
  };

  // Canonical (key, label) pairs for the recognized schedule columns, in the order
  // shown throughout the UI (import help text, the in-app Excel grid editor). Every
  // label here is guaranteed to round-trip through HEADER_MAP back to the same key —
  // this is the single source of truth for that pairing so the grid editor's column
  // set and the import-review help text can't drift apart from each other.
  var CANONICAL_HEADERS = [
    { key: "external_id", label: "Activity ID" },
    { key: "name", label: "Activity Name" },
    { key: "activity_type", label: "Activity Type" },
    { key: "wbs_code", label: "WBS Code" },
    { key: "wbs_name", label: "WBS Name" },
    { key: "duration", label: "Duration" },
    { key: "planned_start", label: "Planned Start" },
    { key: "planned_finish", label: "Planned Finish" },
    { key: "predecessors", label: "Predecessors" },
    { key: "percent_complete", label: "% Complete" },
    { key: "discipline", label: "Discipline" },
    { key: "contractor", label: "Contractor" },
    { key: "responsible_person", label: "Responsible Person" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" },
  ];

  function normalizeHeader(h) {
    return String(h || "").trim().toLowerCase();
  }

  /** Best-guess column mapping for an uploaded header row — the same lookup parseRows()
   * used to do unconditionally before manual column mapping existed. Returns
   * { [headerIndex]: canonicalKey }, omitting any index HEADER_MAP doesn't recognize (the
   * caller/UI treats a missing entry as "unmapped," same as an empty string would).
   * Exposed so schedule.js's column-mapping step can pre-fill its pickers with this guess
   * rather than starting the user from a blank sheet every time — they only need to fix
   * the columns that didn't match, not re-map everything by hand. */
  function autoDetectColumnMapping(headers) {
    var mapping = {};
    headers.forEach(function (h, i) {
      var key = HEADER_MAP[normalizeHeader(h)];
      if (key) mapping[i] = key;
    });
    return mapping;
  }

  function parseDate(v) {
    if (v === "" || v == null) return { value: "", valid: true };
    if (v instanceof Date && !isNaN(v.getTime())) {
      return { value: v.toISOString().slice(0, 10), valid: true };
    }
    var s = String(v).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return { value: s.slice(0, 10), valid: true };
    var d = new Date(s);
    if (!isNaN(d.getTime())) return { value: d.toISOString().slice(0, 10), valid: true };
    return { value: "", valid: false };
  }

  function parseNumber(v) {
    if (v === "" || v == null) return { value: null, valid: true };
    var n = Number(v);
    return isNaN(n) ? { value: null, valid: false } : { value: n, valid: true };
  }

  /** Parses SheetJS-shaped { headers, rows } into { activities, wbsEntries,
   * relationships, warnings, errors, summary }. Rows with a fatal problem (no
   * Activity ID, duplicate Activity ID, no name) are excluded from `activities` and
   * counted in `errors` \u2014 they truly can't be salvaged. Everything else that's
   * questionable (bad date, bad duration, unknown predecessor, unrecognized type)
   * becomes a `warning`: the field is left blank/defaulted and the row still imports,
   * per "do not silently discard invalid records, do not invent data."
   *
   * `columnMapping`, if given, is { [headerIndex]: canonicalKey | "" } and FULLY
   * overrides the automatic HEADER_MAP lookup \u2014 schedule.js's manual column-mapping step
   * builds this from autoDetectColumnMapping() plus whatever the user corrected, so by
   * the time it reaches here every column's fate (mapped to a specific field, or
   * deliberately ignored) has already been decided by a human, not guessed again. Omit
   * it (or pass null/undefined) to fall back to the original auto-detect-only behavior \u2014
   * every existing caller that never heard of manual mapping keeps working unchanged. */
  function parseRows(headers, rows, columnMapping) {
    var colMap = {};
    var manualMapping = !!columnMapping;
    if (manualMapping) {
      Object.keys(columnMapping).forEach(function (idx) {
        var key = columnMapping[idx];
        if (key) colMap[Number(idx)] = key;
      });
    } else {
      headers.forEach(function (h, i) {
        var key = HEADER_MAP[normalizeHeader(h)];
        if (key) colMap[i] = key;
      });
    }

    var errors = [];
    var warnings = [];
    var activities = [];
    var seenExternalIds = {};
    var wbsCodesSeen = {};

    // Header recognition is exact-match against HEADER_MAP, which means a column
    // whose name isn't on that list is silently invisible to everything below \u2014 not
    // "imported blank with a warning" like a bad date, just gone, no per-row signal at
    // all. That's a worse failure mode than a bad cell, so it gets reported once, up
    // front, rather than relying on per-row symptoms (e.g. "no dates anywhere") to
    // surface it indirectly. Skipped entirely under manual mapping \u2014 the schedule.js
    // column-mapping step already showed the user every column and let them decide, so
    // a column left unmapped there was a deliberate "ignore this one," not an oversight
    // worth a redundant warning about.
    var mappedKeys = {};
    Object.keys(colMap).forEach(function (i) {
      mappedKeys[colMap[i]] = true;
    });
    var unrecognizedHeaders = manualMapping
      ? []
      : headers.filter(function (h) {
          var norm = normalizeHeader(h);
          return norm && !HEADER_MAP[norm];
        });
    if (unrecognizedHeaders.length > 0) {
      warnings.push({
        row: null,
        message:
          "Column header(s) not recognized and ignored: " + unrecognizedHeaders.join(", ") +
          ". Check these against the expected column names if data seems to be missing.",
      });
    }
    if (!mappedKeys.planned_start && !mappedKeys.planned_finish) {
      warnings.push({
        row: null,
        message:
          "No column was recognized as Planned Start or Planned Finish \u2014 no dates were imported for any activity. " +
          "Rename the date column(s) to one of the expected names and re-import.",
      });
    }

    rows.forEach(function (row, rowIndex) {
      var lineNo = rowIndex + 2; // header occupies row 1
      var rec = {};
      Object.keys(colMap).forEach(function (i) {
        rec[colMap[i]] = row[i] !== undefined ? row[i] : "";
      });

      var isBlankRow = Object.keys(rec).every(function (k) {
        return rec[k] === "" || rec[k] == null;
      });
      if (isBlankRow) return;

      var externalId = String(rec.external_id || "").trim();
      var name = String(rec.name || "").trim();

      if (!externalId) {
        errors.push({ row: lineNo, message: "Missing Activity ID \u2014 row skipped." });
        return;
      }
      if (seenExternalIds[externalId]) {
        errors.push({
          row: lineNo,
          message: 'Duplicate Activity ID "' + externalId + '" (first seen on row ' + seenExternalIds[externalId] + ") \u2014 row skipped.",
        });
        return;
      }
      seenExternalIds[externalId] = lineNo;

      if (!name) {
        errors.push({ row: lineNo, message: 'Activity "' + externalId + '" is missing a name \u2014 row skipped.' });
        return;
      }

      var typeRaw = normalizeHeader(rec.activity_type);
      var activityType = ACTIVITY_TYPE_ALIASES[typeRaw] || "task";
      if (typeRaw && !ACTIVITY_TYPE_ALIASES[typeRaw]) {
        warnings.push({ row: lineNo, message: 'Unrecognized activity type "' + rec.activity_type + '" \u2014 defaulted to Task.' });
      }

      var plannedStart = parseDate(rec.planned_start);
      if (!plannedStart.valid) {
        warnings.push({ row: lineNo, message: 'Unreadable Planned Start "' + rec.planned_start + '" \u2014 left blank.' });
      }
      var plannedFinish = parseDate(rec.planned_finish);
      if (!plannedFinish.valid) {
        warnings.push({ row: lineNo, message: 'Unreadable Planned Finish "' + rec.planned_finish + '" \u2014 left blank.' });
      }
      var duration = parseNumber(rec.duration);
      if (!duration.valid) {
        warnings.push({ row: lineNo, message: 'Unreadable Duration "' + rec.duration + '" \u2014 left blank.' });
      } else if (duration.value != null && duration.value < 0) {
        // Bug fix (Daily-Use Audit, Phase 1): a negative duration doesn't make sense for
        // CPM and would corrupt calculation output downstream \u2014 same "questionable data
        // gets a warning and is left blank rather than silently imported" treatment as
        // an unreadable value above, not a hard import failure.
        warnings.push({ row: lineNo, message: "Negative Duration (" + duration.value + ") \u2014 left blank." });
        duration = { value: null, valid: true };
      }
      var pctComplete = parseNumber(rec.percent_complete);
      if (!pctComplete.valid) {
        warnings.push({ row: lineNo, message: 'Unreadable % Complete "' + rec.percent_complete + '" \u2014 left blank.' });
      }

      var wbsCode = String(rec.wbs_code || "").trim();
      if (!wbsCode) {
        warnings.push({ row: lineNo, message: 'Activity "' + externalId + '" has no WBS Code \u2014 imported without a WBS assignment.' });
      } else if (!wbsCodesSeen[wbsCode]) {
        wbsCodesSeen[wbsCode] = String(rec.wbs_name || "").trim() || wbsCode;
      }

      activities.push({
        row: lineNo,
        external_id: externalId,
        name: name,
        activity_type: activityType,
        wbs_code: wbsCode || null,
        duration: duration.value,
        planned_start: plannedStart.value,
        planned_finish: plannedFinish.value,
        percent_complete: pctComplete.value || 0,
        predecessors_raw: String(rec.predecessors || "").trim(),
        discipline: String(rec.discipline || "").trim(),
        contractor: String(rec.contractor || "").trim(),
        responsible_person: String(rec.responsible_person || "").trim(),
        status: String(rec.status || "").trim() || "not_started",
        notes: String(rec.notes || "").trim(),
      });
    });

    // WBS hierarchy is derived from dot-separated codes ("1.1.2" \u2192 parent "1.1" \u2192
    // parent "1") \u2014 but ONLY when that parent code is itself present among the codes
    // actually given in the file. Flat decimal numbering ("1.0", "2.0") looks like it
    // has a dot too, and without a real "1" in the data there's no way to tell that
    // apart from genuine hierarchy \u2014 so rather than guess, an implied parent that
    // isn't actually in the file is left unlinked (top-level) instead of fabricated.
    // Inventing a placeholder node here would violate the same "do not invent data"
    // rule this parser already follows for dates/durations/etc.
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
            'WBS "' + w.code + '" implies a parent code "' + w.parent_code + '" that isn\u2019t itself in this file ' +
            "\u2014 imported as a top-level WBS item instead of inventing that parent.",
        });
        w.parent_code = null;
        w.level = 0;
      }
    });

    // Relationships: "A010FS+2,A020,A030SS-1" style comma-separated tokens on the
    // Predecessors column. Unknown/self-referencing tokens become warnings and are
    // skipped rather than silently dropped without explanation.
    var relationshipsRaw = [];
    activities.forEach(function (act) {
      if (!act.predecessors_raw) return;
      act.predecessors_raw.split(",").forEach(function (token) {
        token = token.trim();
        if (!token) return;
        var m = /^([A-Za-z0-9._-]+?)(FS|SS|FF|SF)?([+-]\d+)?$/i.exec(token);
        if (!m) {
          warnings.push({ row: act.row, message: 'Unrecognized predecessor entry "' + token + '" on "' + act.external_id + '" \u2014 skipped.' });
          return;
        }
        var predId = m[1];
        var type = (m[2] || "FS").toUpperCase();
        var lag = m[3] ? parseInt(m[3], 10) : 0;
        if (predId === act.external_id) {
          warnings.push({ row: act.row, message: 'Activity "' + act.external_id + '" lists itself as its own predecessor \u2014 skipped.' });
          return;
        }
        if (!seenExternalIds[predId]) {
          warnings.push({ row: act.row, message: 'Predecessor "' + predId + '" for "' + act.external_id + '" was not found in this file \u2014 skipped.' });
          return;
        }
        relationshipsRaw.push({ predecessor_external_id: predId, successor_external_id: act.external_id, type: type, lag: lag });
      });
    });

    // Circular-dependency check, batch-local only (this file's relationships against
    // each other \u2014 not cross-checked against relationships already in the target
    // schedule; that full-graph check belongs to the CPM engine in Gate 3, which
    // actually needs to walk the whole graph to compute float anyway). Conservative:
    // any relationship whose *both* endpoints are on a detected cycle gets skipped,
    // which can over-flag adjacent-but-acyclic edges through a cyclic node \u2014 accepted
    // tradeoff for a warn-and-skip pass rather than a full SCC decomposition.
    var adjacency = {};
    relationshipsRaw.forEach(function (r) {
      (adjacency[r.predecessor_external_id] = adjacency[r.predecessor_external_id] || []).push(r.successor_external_id);
    });
    var visiting = {};
    var visited = {};
    var circularSet = {};
    function dfs(node, stack) {
      if (visiting[node]) {
        var idx = stack.indexOf(node);
        for (var i = idx; i < stack.length; i++) circularSet[stack[i]] = true;
        return;
      }
      if (visited[node]) return;
      visiting[node] = true;
      stack.push(node);
      (adjacency[node] || []).forEach(function (next) {
        dfs(next, stack);
      });
      stack.pop();
      visiting[node] = false;
      visited[node] = true;
    }
    Object.keys(adjacency).forEach(function (node) {
      dfs(node, []);
    });

    var circularPairs = 0;
    var relationships = relationshipsRaw.filter(function (r) {
      var circular = circularSet[r.predecessor_external_id] && circularSet[r.successor_external_id];
      if (circular) {
        circularPairs++;
        warnings.push({
          row: null,
          message: 'Circular dependency involving "' + r.predecessor_external_id + '" \u2192 "' + r.successor_external_id + '" \u2014 relationship skipped.',
        });
      }
      return !circular;
    });

    return {
      activities: activities,
      wbsEntries: wbsEntries,
      relationships: relationships,
      warnings: warnings,
      errors: errors,
      summary: {
        total_rows: rows.length,
        imported: activities.length,
        warnings: warnings.length,
        errors: errors.length,
        circular_relationships_skipped: circularPairs,
        unrecognized_headers: unrecognizedHeaders,
      },
    };
  }

  window.PCC.scheduleImportService = {
    parseRows: parseRows,
    CANONICAL_HEADERS: CANONICAL_HEADERS,
    autoDetectColumnMapping: autoDetectColumnMapping,
  };
})();
