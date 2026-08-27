/* PCC Architecture Upgrade Phase 5 (SQLite) — persistence for the isolated prototype.
 * STILL NOT WIRED INTO THE LIVE APP — see sqliteMigrationEngine.js's own header for the
 * full reasoning. This file answers the next item on the master upgrade prompt's own
 * Phase 5 test gate (Section 36): "test backup, test restore, test corruption
 * handling" — sql.js's Database is in-memory only, so a real backup/restore story
 * needs somewhere durable to put `db.export()`'s bytes and read them back.
 *
 * A DEDICATED IndexedDB database, not a new object store inside blobStore.js's
 * pc_blobs_v1 DB — same reasoning scheduleBaselineStore.js already gave for its own
 * separate database: blobStore.js's own header is explicit that it holds ONLY binary
 * blob payloads for existing app records, and this is a different, still-experimental
 * concern. Storage format mirrors blobStore.js's own gzip-compressed-bytes approach
 * (proven, measured to help on compressible content) rather than inventing a new one.
 *
 * WHAT THIS PROVIDES: saveSnapshot(id, bytes) / loadSnapshot(id) / deleteSnapshot(id) /
 * listSnapshotIds() — a snapshot is the raw Uint8Array db.export() produces. Corruption
 * handling is the caller's job when reconstructing a Database from loaded bytes (see
 * this file's own test for what "gracefully fails" means here) — this module's own
 * responsibility stops at faithfully storing and returning whatever bytes it's given.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var DB_NAME = "pcc_sqlite_prototype_v1";
  var STORE_NAME = "snapshots";
  var DB_VERSION = 1;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }
      var req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        dbPromise = null; // allow retry on a later call rather than caching a dead promise
        reject(req.error || new Error("Could not open IndexedDB."));
      };
    });
    return dbPromise;
  }

  function compressBytes(bytes) {
    var cs = new CompressionStream("gzip");
    var writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(cs.readable).arrayBuffer();
  }

  function decompressBytes(buffer) {
    var ds = new DecompressionStream("gzip");
    var writer = ds.writable.getWriter();
    writer.write(new Uint8Array(buffer));
    writer.close();
    return new Response(ds.readable).arrayBuffer();
  }

  /** Stores (or overwrites) a full SQLite export under `id`. `bytes` is whatever
   * db.export() returned (a Uint8Array) — this function doesn't care what's inside it,
   * only that it's bytes to compress and store faithfully. */
  function saveSnapshot(id, bytes) {
    if (!id) return Promise.reject(new Error("saveSnapshot requires an id"));
    return compressBytes(bytes).then(function (compressed) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put({ id: id, gz: compressed, savedAt: new Date().toISOString(), byteLength: bytes.length });
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            reject(tx.error);
          };
        });
      });
    });
  }

  /** Loads a snapshot back into a plain Uint8Array (ready to pass to `new
   * SQL.Database(bytes)`), or resolves null if nothing is stored under that id —
   * "not there yet" and "never had one" are both valid states, same convention
   * blobStore.js's own getBlob() already uses. */
  function loadSnapshot(id) {
    if (!id) return Promise.resolve(null);
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = function () {
          if (!req.result) {
            resolve(null);
            return;
          }
          decompressBytes(req.result.gz).then(function (buffer) {
            resolve(new Uint8Array(buffer));
          }, reject);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function deleteSnapshot(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function listSnapshotIds() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).getAllKeys();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  window.PCC.sqlitePersistence = {
    saveSnapshot: saveSnapshot,
    loadSnapshot: loadSnapshot,
    deleteSnapshot: deleteSnapshot,
    listSnapshotIds: listSnapshotIds,
  };
})();
