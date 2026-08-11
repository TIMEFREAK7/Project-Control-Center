/** Blobs-only IndexedDB store. Deliberately narrow: this holds ONLY the binary payload
 * (photo/document file_data as a base64 data URI) keyed by the same id as its owning
 * record in the main JSON store. Everything else \u2014 projects, risks, meetings, RFIs,
 * change orders, and every document/photo's own metadata (filename, caption, dates,
 * project link) \u2014 stays in the main store.js / localStorage as before.
 *
 * Why: localStorage caps around 5\u201310MB per origin, often less on mobile/WebView, and
 * has no relationship to the device's actual free disk space. Two 1.8MB site photos was
 * enough to hit it. IndexedDB's quota is dramatically higher. Moving only the blobs \u2014
 * not the whole app \u2014 keeps every other module's synchronous store.get() assumption
 * intact; only code that actually touches a photo/document's file bytes needs to be
 * async-aware. (Aditya, 2026-08-07: decided blobs-only over migrating everything.)
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var DB_NAME = "pcc_blobs_v1";
  var STORE_NAME = "blobs";
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

  /** Store (or overwrite) a blob's data URI under `id`. */
  function putBlob(id, dataUri) {
    if (!id) return Promise.reject(new Error("putBlob requires an id"));
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({ id: id, data: dataUri });
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  /** Fetch a blob's data URI by id. Resolves null (not an error) if nothing is stored
   * under that id, since "not there yet" and "never had one" are both valid states a
   * caller has to handle either way. */
  function getBlob(id) {
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

  function deleteBlob(id) {
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

  function listBlobIds() {
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

  /** Resolves the display data URI for a document/photo, given its id and whatever is
   * currently in its metadata's `file_data` field. If `file_data` is already a real
   * value, that record predates this migration (or is mid-transition) and is used
   * as-is \u2014 no need to touch IndexedDB. Otherwise fetches from IndexedDB by id. This
   * dual-path lookup is what lets old and new records coexist without a blocking,
   * all-or-nothing migration at startup. */
  function resolve(id, inlineFileData) {
    if (inlineFileData) return Promise.resolve(inlineFileData);
    return getBlob(id);
  }

  window.PCC.blobStore = {
    putBlob: putBlob,
    getBlob: getBlob,
    deleteBlob: deleteBlob,
    listBlobIds: listBlobIds,
    resolve: resolve,
  };
})();
