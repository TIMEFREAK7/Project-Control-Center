/** Schedule baseline snapshots — IndexedDB, deliberately its own database, not a new
 * object store inside blobStore.js's pc_blobs_v1 DB. blobStore.js's own header is
 * explicit that it holds ONLY binary blob payloads and that the app was deliberately
 * NOT migrated wholesale to IndexedDB, precisely so every other module's synchronous
 * store.get() assumption stays intact. A baseline snapshot is structured JSON, not a
 * blob, and the live schedule (Activities/Relationships/WBS that Gates 1-3 already
 * shipped and confirmed on-device) stays exactly where it is, in the main localStorage
 * JSON, read synchronously by the CPM engine. Only the new, isolated baseline-snapshot
 * feature is async-aware — same "don't touch what's already confirmed working" boundary
 * blobStore.js drew for photos/documents, applied again here.
 *
 * A baseline record has two halves:
 *   - a thin index row in the main store (schedule_baselines: id, schedule_id, name,
 *     revision_number, captured_at, activity_count, wbs_count, relationship_count) —
 *     small, stays in localStorage, is what baseline list UIs render from without
 *     touching IndexedDB at all.
 *   - the full snapshot payload (trimmed WBS/Activity/Relationship fields — see
 *     scheduleBaselineEngine.buildSnapshot), stored here, keyed by the same id.
 * This mirrors the blob pattern exactly: metadata stays synchronous, payload is async
 * and only loaded when something actually needs to compare against it.
 *
 * Storage consolidation (PCC storage/sync playbook, Phase 3): the physical database this
 * module reads/writes is now the shared one from sharedIndexedDb.js (`pcc_data_v1`) instead
 * of its own private `pcc_schedule_baselines_v1` database — see that file's header for why
 * and how the one-time migration works. Internal-implementation-only change: every function
 * below still takes/returns exactly what it always did.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var STORE_NAME = window.PCC.sharedIndexedDb.SNAPSHOTS_STORE;

  function openDb() {
    return window.PCC.sharedIndexedDb.openDb();
  }

  /** Store (or overwrite) a baseline snapshot payload under `id`. `snapshot` is a plain
   * JSON-serializable object built by scheduleBaselineEngine.buildSnapshot — this module
   * doesn't know or care about its shape, same separation the CPM engine keeps from
   * schedule.js. */
  function putSnapshot(id, snapshot) {
    if (!id) return Promise.reject(new Error("putSnapshot requires an id"));
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({ id: id, data: snapshot });
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  /** Fetch a snapshot by baseline id. Resolves null (not an error) if nothing is stored
   * under that id — same "not there yet" vs "never had one" distinction as blobStore. */
  function getSnapshot(id) {
    if (!id) return Promise.resolve(null);
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = function () {
          resolve(req.result ? req.result.data : null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function deleteSnapshot(id) {
    if (!id) return Promise.resolve();
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

  window.PCC.scheduleBaselineStore = {
    putSnapshot: putSnapshot,
    getSnapshot: getSnapshot,
    deleteSnapshot: deleteSnapshot,
    listSnapshotIds: listSnapshotIds,
  };
})();
