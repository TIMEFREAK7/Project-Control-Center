/* PCC Architecture Upgrade Phase 5 (SQLite) — EVALUATION-STAGE, ISOLATED PROTOTYPE.
 *
 * This file does NOT touch the live app. Nothing in schedule.js, store.js, or any page
 * module calls anything here. It exists to answer the master upgrade prompt's own
 * Phase 5 question — "can PCC's data move into SQLite without losing anything?" — with
 * a real, tested answer, before any live code path is ever changed. Per the master
 * prompt's own Section 20 ("do NOT make SQLite the first architectural change...
 * evaluate SQLite") and Section 36's Phase 5 test gate ("design schema, build migration
 * system, migrate controlled test data, reconcile data" — a design+prototype exercise,
 * not "cut the app over tonight"), and per Aditya's own explicit request to treat this
 * phase as the risky one and checkpoint first: this is intentionally scoped to design +
 * round-trip verification only.
 *
 * WHY sql.js (WebAssembly SQLite), NOT a native binding:
 * PCC is one self-contained HTML file that must run identically via file://, inside
 * Electron, and inside the Capacitor Android WebView — no build step, no native
 * modules, no per-platform code fork (Phase 0's own inspection confirmed Windows/
 * Android are both thin wrappers around the same bundle, not separate codebases).
 * better-sqlite3 and native Capacitor SQLite plugins only work from a Node/native
 * context (Electron's main process, or a compiled Android plugin) — using either would
 * fork this app's architecture per platform, exactly what the master prompt's Section
 * 29 ("do NOT force the Windows architecture onto Android") and Section 46 ("do not
 * increase deployment complexity" without justification) warn against. sql.js runs
 * identically everywhere with zero native code, vendored the same way xlsx/pdf.js/
 * mammoth already are (see src/js/vendor/sql-wasm.js + sql-wasm.wasm, embedded as
 * base64 by build.js's inlineSqlWasm() — no runtime fetch, verified in real Chromium
 * against the actual built index.html).
 *
 * WHY A HYBRID SCHEMA, NOT ~50 HAND-NORMALIZED TABLES:
 * PCC's data model already spans roughly 50 distinct top-level collections (projects,
 * schedules, activities, risks, vendors, and dozens more — see store.js). Hand-writing
 * and maintaining a fully-normalized SQL table for every one, kept in sync by hand with
 * every future store.js schema_version bump, is a large, permanent maintenance burden
 * that itself becomes a data-loss risk (one missed column on a future schema bump
 * silently drops a field forever). Instead, every collection gets ONE table with:
 *   - a handful of REAL, indexed columns for the fields that actually drive
 *     cross-register relational queries today (id, project_id, schedule_id) —
 *     detected generically by scanning the data, not hand-listed per collection, so
 *     this keeps working as store.js's shape evolves without this file changing too;
 *   - a `data` column holding the complete record as JSON.
 * This gives real indexed/relational query power on the fields that matter, without a
 * second schema that silently drifts out of sync with the real one. `id` is
 * deliberately NOT a SQL PRIMARY KEY/UNIQUE constraint — real-world data that has
 * passed through dozens of schema migrations isn't guaranteed perfectly unique, and a
 * constraint violation on insert would silently drop or reject a row, which is exactly
 * the "unexplained data loss" Section 21/36 forbid. SQLite's own implicit `rowid` is
 * the uniqueness/ordering handle instead.
 *
 * WHAT THIS FILE PROVIDES:
 *   buildDatabase(SQL, data)   — data (the full store.js shape) -> a new sql.js Database
 *   exportToJson(db)           — a Database -> the same shape data was in
 *   reconcile(original, roundTripped) -> { ok, issues[] } — a structured diff, not a
 *                                 boolean claim; see its own header for what it checks
 *   initSqlJsBrowser()         — the one browser-specific piece (decodes the embedded
 *                                 base64 WASM and calls window.initSqlJs); Node tests
 *                                 use the real sql.js npm package's own initSqlJs
 *                                 instead and pass the resulting SQL into the pure
 *                                 functions above, so the core logic is tested
 *                                 identically to how it will run in the browser.
 *
 * NOT YET DECIDED OR BUILT (deliberately, this increment): whether/how the live app
 * ever reads or writes through SQLite instead of (or alongside) the current
 * localStorage JSON blob; incremental/partial sync; concurrent-write handling; a real
 * on-disk .sqlite file (sql.js is in-memory — real persistence would mean serializing
 * db.export() into IndexedDB, the same place blobStore.js already persists binary
 * data, but that wiring doesn't exist yet either). All of that is exactly the kind of
 * "does this actually work, is it worth the complexity" decision the master prompt's
 * own Section 47 framework says to answer before building — not before this prototype
 * has proven the model works and been reviewed.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var FK_CANDIDATE_COLUMNS = ["id", "project_id", "schedule_id"];

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  /** Which of FK_CANDIDATE_COLUMNS actually appear (as an own property, on at least one
   * record) in this collection — detected from the real data, not hand-listed, so a
   * future collection or a new field on an existing one is picked up automatically. */
  function detectColumns(records) {
    var present = {};
    records.forEach(function (r) {
      if (!isPlainObject(r)) return;
      FK_CANDIDATE_COLUMNS.forEach(function (c) {
        if (Object.prototype.hasOwnProperty.call(r, c)) present[c] = true;
      });
    });
    return FK_CANDIDATE_COLUMNS.filter(function (c) {
      return present[c];
    });
  }

  function quoteIdent(name) {
    // SQLite identifier quoting: double the internal double-quotes, wrap in double-quotes.
    // Collection names here are all store.js's own hardcoded field names (never
    // user-supplied strings), but quoting defensively costs nothing.
    return '"' + String(name).replace(/"/g, '""') + '"';
  }

  /** Builds a fresh in-memory sql.js Database from PCC's full store.js data shape.
   * `SQL` is the constructor sql.js's initSqlJs() resolves to — passed in rather than
   * loaded here, so this function is identical whether the caller is the real app
   * (initSqlJsBrowser() below) or a Node test (the sql.js npm package directly). */
  function buildDatabase(SQL, data) {
    var db = new SQL.Database();
    db.run('CREATE TABLE "_meta" (key TEXT, value TEXT);');
    var insertMeta = db.prepare('INSERT INTO "_meta" VALUES (?, ?)');

    Object.keys(data).forEach(function (key) {
      var value = data[key];
      if (!Array.isArray(value)) {
        // Scalars/objects (schema_version, meta, settings, ...) — not a collection to
        // give its own table, but still real data that must not be dropped.
        insertMeta.run([key, JSON.stringify(value === undefined ? null : value)]);
        return;
      }

      var columns = detectColumns(value);
      var allColumns = columns.concat(["data"]);
      db.run(
        "CREATE TABLE " + quoteIdent(key) + " (" +
          allColumns.map(function (c) { return quoteIdent(c) + " TEXT"; }).join(", ") +
          ");"
      );
      if (columns.length > 0) {
        columns.forEach(function (c) {
          db.run("CREATE INDEX " + quoteIdent("idx_" + key + "_" + c) + " ON " + quoteIdent(key) + " (" + quoteIdent(c) + ");");
        });
      }

      var placeholders = allColumns.map(function () { return "?"; }).join(", ");
      var insertStmt = db.prepare("INSERT INTO " + quoteIdent(key) + " VALUES (" + placeholders + ")");
      value.forEach(function (record) {
        var row = columns.map(function (c) {
          return isPlainObject(record) && record[c] !== undefined ? String(record[c]) : null;
        });
        row.push(JSON.stringify(record === undefined ? null : record));
        insertStmt.run(row);
      });
      insertStmt.free();
    });

    insertMeta.free();
    return db;
  }

  /** Reads a Database built by buildDatabase() (or an equivalent one) back into the
   * same shape the original data was in. Row order (SQLite's implicit rowid, which
   * matches insertion order) is preserved, so a collection's array order round-trips
   * unchanged too — nothing here relies on it, but nothing should have to care either
   * way, and preserving it is free. */
  function exportToJson(db) {
    var result = {};

    var metaRows = db.exec('SELECT key, value FROM "_meta"');
    if (metaRows.length > 0) {
      metaRows[0].values.forEach(function (row) {
        result[row[0]] = JSON.parse(row[1]);
      });
    }

    var tables = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_meta' ORDER BY name"
    );
    if (tables.length > 0) {
      tables[0].values.forEach(function (row) {
        var tableName = row[0];
        var dataRows = db.exec("SELECT data FROM " + quoteIdent(tableName) + " ORDER BY rowid");
        result[tableName] = dataRows.length > 0 ? dataRows[0].values.map(function (r) { return JSON.parse(r[0]); }) : [];
      });
    }

    return result;
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;
    if (typeof a !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    var aKeys = Object.keys(a);
    var bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (var k = 0; k < aKeys.length; k++) {
      var key = aKeys[k];
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  /** Compares `original` (the data passed into buildDatabase()) against `roundTripped`
   * (exportToJson()'s output) and reports every discrepancy found — never just a
   * boolean. For an array collection, records are matched by `.id` when every record
   * in both sides has one (the common case); otherwise matched by array position. This
   * is the actual "reconcile" step the master prompt's Section 21/36 both call for —
   * it's meant to be read, not just checked for `.ok`. */
  function reconcile(original, roundTripped) {
    var issues = [];
    var allKeys = Object.keys(original).concat(
      Object.keys(roundTripped).filter(function (k) {
        return !Object.prototype.hasOwnProperty.call(original, k);
      })
    );

    allKeys.forEach(function (key) {
      var orig = original[key];
      var rt = roundTripped[key];

      if (!Object.prototype.hasOwnProperty.call(roundTripped, key)) {
        issues.push({ collection: key, type: "missing_collection", detail: "present in original, absent after round-trip" });
        return;
      }

      if (!Array.isArray(orig)) {
        if (!deepEqual(orig, rt)) {
          issues.push({ collection: key, type: "value_mismatch", detail: "non-array value differs after round-trip" });
        }
        return;
      }

      if (!Array.isArray(rt)) {
        issues.push({ collection: key, type: "type_mismatch", detail: "was an array, is not after round-trip" });
        return;
      }

      var canMatchById = orig.every(function (r) { return isPlainObject(r) && r.id !== undefined; }) &&
        rt.every(function (r) { return isPlainObject(r) && r.id !== undefined; });

      if (canMatchById) {
        var origById = {};
        orig.forEach(function (r) { origById[r.id] = r; });
        var rtById = {};
        rt.forEach(function (r) { rtById[r.id] = r; });

        Object.keys(origById).forEach(function (id) {
          if (!Object.prototype.hasOwnProperty.call(rtById, id)) {
            issues.push({ collection: key, type: "missing_record", detail: "id " + id + " present in original, missing after round-trip" });
          } else if (!deepEqual(origById[id], rtById[id])) {
            issues.push({ collection: key, type: "field_mismatch", detail: "id " + id + " differs after round-trip" });
          }
        });
        Object.keys(rtById).forEach(function (id) {
          if (!Object.prototype.hasOwnProperty.call(origById, id)) {
            issues.push({ collection: key, type: "extra_record", detail: "id " + id + " present after round-trip but not in original" });
          }
        });
      } else {
        if (orig.length !== rt.length) {
          issues.push({ collection: key, type: "count_mismatch", detail: orig.length + " records originally, " + rt.length + " after round-trip" });
        }
        var minLen = Math.min(orig.length, rt.length);
        for (var i = 0; i < minLen; i++) {
          if (!deepEqual(orig[i], rt[i])) {
            issues.push({ collection: key, type: "field_mismatch", detail: "index " + i + " differs after round-trip" });
          }
        }
      }
    });

    return { ok: issues.length === 0, issues: issues };
  }

  /** Browser-only convenience: decodes the base64 WASM build.js embedded (see this
   * file's own header) and initializes sql.js from it — no network/file fetch. Node
   * tests skip this and call the real sql.js npm package's own initSqlJs() instead,
   * since window.PCC_SQL_WASM_BASE64/window.initSqlJs only exist in the built bundle. */
  function initSqlJsBrowser() {
    function base64ToUint8Array(b64) {
      var binary = window.atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    return window.initSqlJs({ wasmBinary: base64ToUint8Array(window.PCC_SQL_WASM_BASE64) });
  }

  window.PCC.sqliteMigrationEngine = {
    buildDatabase: buildDatabase,
    exportToJson: exportToJson,
    reconcile: reconcile,
    initSqlJsBrowser: initSqlJsBrowser,
  };
})();
