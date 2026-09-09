/** Consolidates what used to be two separate IndexedDB databases — blobStore.js's
 * `pcc_blobs_v1` (object stores `blobs` + `content`) and scheduleBaselineStore.js's
 * `pcc_schedule_baselines_v1` (object store `snapshots`) — into one shared database,
 * `pcc_data_v1`, with all three object stores. This is a storage-BACKEND change only:
 * blobStore.js's and scheduleBaselineStore.js's public APIs (putBlob/getBlob/etc.,
 * putSnapshot/getSnapshot/etc.) are completely unchanged, and so is the JSON shape every
 * other module already depends on — every existing caller needs zero changes.
 *
 * Deliberately NOT consolidating store.js's own `pc_local_data_v1` localStorage JSON into
 * this database too: localStorage is synchronous and store.js has many synchronous call
 * sites across the whole app (`store.get()` everywhere). Folding that into async IndexedDB
 * would force a much larger synchronous-to-async rewrite across the entire codebase — out
 * of scope here. Only the two databases that were already IndexedDB (already async-only,
 * already isolated behind a clean module API) get merged.
 *
 * One-time, copy-only migration from the two old databases runs the first time this
 * module's openDb() is called, per store, only when the corresponding new store is still
 * empty — so a normal launch after the first migrated one does no extra work. Never
 * deletes the old databases; they're left in place, orphaned, as a safety net exactly like
 * Phase 2's filesystem-level migration for Windows storage relocation.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var DB_NAME = "pcc_data_v1";
  var DB_VERSION = 1;
  var BLOBS_STORE = "blobs";
  var CONTENT_STORE = "content";
  var SNAPSHOTS_STORE = "snapshots";

  var OLD_BLOBS_DB_NAME = "pcc_blobs_v1";
  var OLD_BASELINES_DB_NAME = "pcc_schedule_baselines_v1";

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
        if (!db.objectStoreNames.contains(BLOBS_STORE)) {
          db.createObjectStore(BLOBS_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CONTENT_STORE)) {
          db.createObjectStore(CONTENT_STORE, { keyPath: "hash" });
        }
        if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
          db.createObjectStore(SNAPSHOTS_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        dbPromise = null; // allow retry on a later call rather than caching a dead promise
        reject(req.error || new Error("Could not open the shared IndexedDB database."));
      };
    }).then(function (db) {
      return migrateFromOldDatabasesIfNeeded(db).then(function () {
        return db;
      });
    });
    return dbPromise;
  }

  function storeIsEmpty(db, storeName) {
    return new Promise(function (resolve) {
      var tx = db.transaction(storeName, "readonly");
      var req = tx.objectStore(storeName).count();
      req.onsuccess = function () {
        resolve(req.result === 0);
      };
      // Conservative on a read failure: assume NOT empty, so migration is skipped
      // rather than risking a duplicate/overwriting copy.
      req.onerror = function () {
        resolve(false);
      };
    });
  }

  /** Opens a legacy database WITHOUT specifying a version, so this check can never trigger
   * an upgrade or misjudge an existing-but-older-version database as "doesn't exist" — a
   * version-less open() opens at whatever version the database already is. onupgradeneeded
   * only fires when the database genuinely never existed before (oldVersion === 0), in
   * which case the upgrade transaction is aborted so this check itself creates nothing. */
  function openLegacyDbIfExists(name) {
    return new Promise(function (resolve) {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      var req = window.indexedDB.open(name);
      var didNotExistBefore = false;
      req.onupgradeneeded = function (event) {
        // oldVersion lives on the IDBVersionChangeEvent argument, not on the request
        // object itself. oldVersion === 0 means this database genuinely did not exist
        // before this call — a fresh install with nothing to migrate.
        if (event.oldVersion === 0) {
          didNotExistBefore = true;
          try {
            req.transaction.abort();
          } catch (e) {
            /* already aborting */
          }
        }
      };
      req.onsuccess = function () {
        resolve(didNotExistBefore ? null : req.result);
      };
      req.onerror = function () {
        resolve(null);
      };
      req.onblocked = function () {
        resolve(null);
      };
    });
  }

  // Reads every record out of the given legacy database's stores, then closes the
  // connection. MUST close: an open, un-closed connection to a database blocks any later
  // attempt (by this app or, in tests, by code inspecting the database directly) to open
  // that same database at a different version — IndexedDB's onblocked semantics — which
  // would otherwise hang indefinitely with no error, since most callers don't specifically
  // handle onblocked.
  function readAllThenClose(db, storeNames) {
    var reads = storeNames.map(function (storeName) {
      return getAllFromStore(db, storeName);
    });
    return Promise.all(reads).then(
      function (results) {
        db.close();
        return results;
      },
      function (err) {
        db.close();
        throw err;
      }
    );
  }

  function getAllFromStore(db, storeName) {
    return new Promise(function (resolve, reject) {
      var tx;
      try {
        tx = db.transaction(storeName, "readonly");
      } catch (e) {
        resolve([]); // store genuinely doesn't exist on this legacy db — nothing to copy
        return;
      }
      var req = tx.objectStore(storeName).getAll();
      req.onsuccess = function () {
        resolve(req.result || []);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function putAllInto(db, storeName, records) {
    if (!records.length) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(storeName, "readwrite");
      records.forEach(function (record) {
        tx.objectStore(storeName).put(record);
      });
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
    });
  }

  function migrateFromOldDatabasesIfNeeded(db) {
    return Promise.all([storeIsEmpty(db, BLOBS_STORE), storeIsEmpty(db, SNAPSHOTS_STORE)])
      .then(function (empties) {
        var tasks = [];
        if (empties[0]) {
          tasks.push(
            openLegacyDbIfExists(OLD_BLOBS_DB_NAME).then(function (oldDb) {
              if (!oldDb) return;
              return readAllThenClose(oldDb, [BLOBS_STORE, CONTENT_STORE]).then(function (results) {
                return Promise.all([
                  putAllInto(db, BLOBS_STORE, results[0]),
                  putAllInto(db, CONTENT_STORE, results[1]),
                ]);
              });
            })
          );
        }
        if (empties[1]) {
          tasks.push(
            openLegacyDbIfExists(OLD_BASELINES_DB_NAME).then(function (oldDb) {
              if (!oldDb) return;
              return readAllThenClose(oldDb, [SNAPSHOTS_STORE]).then(function (results) {
                return putAllInto(db, SNAPSHOTS_STORE, results[0]);
              });
            })
          );
        }
        return Promise.all(tasks);
      })
      .catch(function (err) {
        // A migration failure must never break normal app startup — the app still works
        // against the (possibly still-empty) new database, and the old databases are
        // completely untouched, so nothing is ever lost, just not yet migrated.
        if (window.console && window.console.error) {
          window.console.error("[PCC] IndexedDB consolidation migration failed:", err);
        }
      });
  }

  window.PCC.sharedIndexedDb = {
    openDb: openDb,
    BLOBS_STORE: BLOBS_STORE,
    CONTENT_STORE: CONTENT_STORE,
    SNAPSHOTS_STORE: SNAPSHOTS_STORE,
  };
})();
