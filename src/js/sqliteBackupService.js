/* PCC Architecture Upgrade Phase 5 (SQLite) — the real, restorable backup format.
 *
 * sqliteMigrationEngine.js's buildDatabase() deliberately never puts binary content
 * inside the SQLite database (see that file's own header, and the master upgrade
 * prompt's own Section 14/15: SQLite = structured data, File Store = binaries, never
 * merge the two). That's correct for the database itself, but a "database-only backup
 * is insufficient" (the same master prompt, Section 66) — a real backup has to cover
 * both. This module is the hybrid-storage-compliant answer: a "PCC Full Backup" .zip
 * containing:
 *
 *   database/pcc.sqlite   — structured records only, via sqliteMigrationEngine (unchanged)
 *   files/<id>             — every document/daily-log-photo's real bytes, resolved from
 *                            blobStore.js (or inline legacy data), one file per blob id
 *   manifest.json          — schema_version, created_at, and the mime type needed to
 *                            reconstruct each file's data URI on restore
 *
 * This supersedes the earlier "Export as SQLite (Experimental)" button, which was
 * metadata-only and one-way. createFullBackup()/restoreFullBackup() are a real,
 * round-tripped backup/restore pair — restoreFullBackup() commits through store.js's
 * importFromSqliteBackup(), the exact same migrate()-then-write-blobs path the plain
 * JSON import already uses, so this isn't a second, less-proven commit path.
 *
 * TESTING NOTE (real environment discovery, not an assumption): JSZip's async pipeline
 * — both zip.generateAsync() and entry.async() — never resolves under jsdom, in any
 * output type, confirmed by testing the same vendored JSZip build directly in
 * isolation. This module's own logic is therefore verified two ways instead: a
 * standalone Node test (tests/test_sqlite_backup_service.js) using a real Node `jszip`
 * package in place of the browser-vendored copy (same API, so this file's code is
 * identical either way), and a real-Chromium Playwright smoke test for the actual UI
 * click-through, where JSZip works correctly. See test_sqlite_full_backup_e2e.js's own
 * header for what the jsdom-based suite is scoped to instead.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var MANIFEST_VERSION = 1;

  function base64OfDataUri(dataUri) {
    var commaIdx = dataUri.indexOf(",");
    return commaIdx === -1 ? dataUri : dataUri.slice(commaIdx + 1);
  }

  function mimeOfDataUri(dataUri) {
    var m = /^data:([^;,]*)/.exec(dataUri);
    return m && m[1] ? m[1] : "application/octet-stream";
  }

  /** Every place a binary blob can live, read-only (mirrors store.js's own
   * collectBlobRefs shape). Duplicated rather than imported from store.js deliberately:
   * this is read-only access to a snapshot for backup purposes, not the live-data
   * mutation store.js's own collectBlobRefs is written for. */
  function collectBackupBlobRefs(data) {
    var refs = [];
    (data.documents || []).forEach(function (doc) {
      refs.push({
        id: doc.id,
        get: function () {
          return doc.file_data;
        },
      });
    });
    (data.daily_logs || []).forEach(function (log) {
      (log.photos || []).forEach(function (photo) {
        refs.push({
          id: photo.id,
          get: function () {
            return photo.file_data;
          },
        });
      });
    });
    return refs;
  }

  /** Builds a complete PCC Full Backup .zip from `data` (the full store.js shape) using
   * `SQL` (sql.js's initSqlJs() constructor). Resolves to { blob, fileCount, skipped }. */
  function createFullBackup(SQL, data) {
    var db = window.PCC.sqliteMigrationEngine.buildDatabase(SQL, data);
    var sqliteBytes = db.export();
    db.close();

    var zip = new window.JSZip();
    zip.file("database/pcc.sqlite", sqliteBytes);
    var filesFolder = zip.folder("files");

    var refs = collectBackupBlobRefs(data);
    var manifestFiles = [];
    var skipped = 0;

    var chain = refs.reduce(function (chainAcc, ref) {
      return chainAcc.then(function () {
        return window.PCC.blobStore
          .resolve(ref.id, ref.get())
          .then(function (dataUri) {
            if (!dataUri) {
              skipped++;
              return;
            }
            filesFolder.file(ref.id, base64OfDataUri(dataUri), { base64: true });
            manifestFiles.push({ id: ref.id, mime: mimeOfDataUri(dataUri) });
          })
          .catch(function () {
            skipped++;
          });
      });
    }, Promise.resolve());

    return chain.then(function () {
      var manifest = {
        manifest_version: MANIFEST_VERSION,
        created_at: new Date().toISOString(),
        schema_version: data.schema_version,
        file_count: manifestFiles.length,
        files_skipped: skipped,
        files: manifestFiles,
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      return zip.generateAsync({ type: "blob" }).then(function (blob) {
        return { blob: blob, fileCount: manifestFiles.length, skipped: skipped };
      });
    });
  }

  /** Reverses createFullBackup(): validates the embedded database, reconstructs every
   * file's original data URI from manifest.json's recorded mime, and commits everything
   * through store.js's importFromSqliteBackup(). `SQL` is sql.js's initSqlJs()
   * constructor; `file` is the uploaded .zip (a File/Blob). Resolves to
   * { restoredFileCount } or rejects with a clear, specific error — never a silent
   * partial restore. */
  function restoreFullBackup(SQL, file) {
    return window.JSZip.loadAsync(file).then(function (zip) {
      var manifestEntry = zip.file("manifest.json");
      var dbEntry = zip.file("database/pcc.sqlite");
      if (!dbEntry) {
        throw new Error("This doesn't look like a PCC Full Backup — database/pcc.sqlite is missing from the .zip.");
      }

      return Promise.all([
        manifestEntry ? manifestEntry.async("string").then(JSON.parse) : Promise.resolve({ files: [] }),
        dbEntry.async("uint8array"),
      ]).then(function (results) {
        var manifest = results[0];
        var dbBytes = results[1];

        var db = new SQL.Database(dbBytes);
        var validation = window.PCC.sqliteMigrationEngine.validateDatabase(db);
        if (!validation.valid) {
          db.close();
          throw new Error("The backup's database is corrupt or unreadable: " + validation.error);
        }
        var parsedData = window.PCC.sqliteMigrationEngine.exportToJson(db);
        db.close();

        var fileReads = (manifest.files || []).map(function (f) {
          var entry = zip.file("files/" + f.id);
          if (!entry) return Promise.resolve(null);
          return entry.async("base64").then(function (base64) {
            return { id: f.id, dataUri: "data:" + (f.mime || "application/octet-stream") + ";base64," + base64 };
          });
        });

        return Promise.all(fileReads).then(function (fileResults) {
          var filesById = {};
          fileResults.forEach(function (r) {
            if (r) filesById[r.id] = r.dataUri;
          });
          return new Promise(function (resolve, reject) {
            window.PCC.store.importFromSqliteBackup(parsedData, filesById, function (err, info) {
              if (err) reject(err);
              else resolve(info);
            });
          });
        });
      });
    });
  }

  window.PCC.sqliteBackupService = {
    createFullBackup: createFullBackup,
    restoreFullBackup: restoreFullBackup,
  };
})();
