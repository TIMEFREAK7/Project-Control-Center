/** Blobs-only IndexedDB store. Deliberately narrow: this holds ONLY the binary payload
 * (photo/document file_data) keyed by the same id as its owning record in the main JSON
 * store. Everything else — projects, risks, meetings, RFIs, change orders, and every
 * document/photo's own metadata (filename, caption, dates, project link) — stays in the
 * main store.js / localStorage as before.
 *
 * Why: localStorage caps around 5–10MB per origin, often less on mobile/WebView, and
 * has no relationship to the device's actual free disk space. Two 1.8MB site photos was
 * enough to hit it. IndexedDB's quota is dramatically higher. Moving only the blobs —
 * not the whole app — keeps every other module's synchronous store.get() assumption
 * intact; only code that actually touches a photo/document's file bytes needs to be
 * async-aware. (Aditya, 2026-08-07: decided blobs-only over migrating everything.)
 *
 * Mobile & Desktop Packaging Gate 4 (2026-08-22): storage format changed from a base64
 * data URI *string* to raw gzip-compressed bytes (`CompressionStream`/`DecompressionStream`
 * — a native Web API, no new dependency). Base64 alone inflates size by exactly 1/3 over
 * raw bytes; storing raw bytes directly is IndexedDB's own native strength and a
 * guaranteed win regardless of content. Gzip on top is real but format-dependent — near
 * nothing on already-compressed content (photos, well-optimized PDFs), meaningful on
 * lightly-compressed ZIP-based content (.docx/.xlsx) — measured, not assumed; see this
 * gate's README/HANDOFF write-up for real numbers.
 *
 * The public API (putBlob/getBlob/resolve) is UNCHANGED — still takes/returns a plain
 * base64 data URI string, exactly as every caller (documents.js, dailyLog.js, vendors.js,
 * store.js's export/import/migration) already expects. Only the on-disk representation
 * changed; no call site anywhere else in the app needed to change for this gate.
 *
 * No bulk migration: an old record (still a `{id, data: <data URI string>}` shape from
 * before this gate) is detected at read time and returned as-is — getBlob() never rewrites
 * it in place. It naturally upgrades to the new compressed format the next time it's
 * re-saved (a new revision uploaded, etc.), the same "never a risky bulk rewrite, upgrade
 * opportunistically" discipline store.js's own schema_version migrate() chain follows.
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

  function dataUriToBytes(dataUri) {
    var commaIdx = dataUri.indexOf(",");
    var meta = dataUri.slice(0, commaIdx);
    var b64 = dataUri.slice(commaIdx + 1);
    var mimeMatch = /data:(.*);base64/.exec(meta);
    var mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mime: mime, bytes: bytes };
  }

  /** Base64-encodes bytes in fixed-size chunks (avoids both the slow per-byte-string-concat
   * path and the call-stack limit of spreading a huge typed array into
   * String.fromCharCode.apply at once) — same technique documents.js's own upload path uses. */
  function bytesToBase64(bytes) {
    var chunkSize = 8192;
    var chunks = [];
    for (var i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
    }
    return btoa(chunks.join(""));
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

  /** Store (or overwrite) a blob under `id`, given its full data URI. Always writes the
   * new compressed format, regardless of what format (if any) previously existed there. */
  function putBlob(id, dataUri) {
    if (!id) return Promise.reject(new Error("putBlob requires an id"));
    var parts = dataUriToBytes(dataUri);
    return compressBytes(parts.bytes).then(function (compressed) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put({ id: id, mime: parts.mime, gz: compressed });
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

  /** Fetch a blob's data URI by id. Resolves null (not an error) if nothing is stored
   * under that id, since "not there yet" and "never had one" are both valid states a
   * caller has to handle either way. Transparently handles both the old (pre-Gate-4)
   * `{id, data: <data URI string>}` shape and the new `{id, mime, gz: <compressed bytes>}`
   * shape — the caller never needs to know or care which. */
  function getBlob(id) {
    if (!id) return Promise.resolve(null);
    return openDb()
      .then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, "readonly");
          var req = tx.objectStore(STORE_NAME).get(id);
          req.onsuccess = function () {
            resolve(req.result || null);
          };
          req.onerror = function () {
            reject(req.error);
          };
        });
      })
      .then(function (record) {
        if (!record) return null;
        if (record.data) return record.data; // pre-Gate-4 record — already a full data URI
        return decompressBytes(record.gz).then(function (buffer) {
          return "data:" + record.mime + ";base64," + bytesToBase64(new Uint8Array(buffer));
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
   * value, that record predates the IndexedDB migration (or is mid-transition) and is
   * used as-is — no need to touch IndexedDB. Otherwise fetches from IndexedDB by id. This
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
