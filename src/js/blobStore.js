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
 *
 * PCC Architecture Upgrade Phase 6 (Document/File Storage Engine), content-addressable
 * storage (the last deferred Phase 6 item, 2026-08-28): identical file content uploaded
 * under different ids (a duplicate re-upload, the same PDF attached to two records, a
 * bulk-imported copy) used to be written to disk twice. Bytes are now stored once, keyed
 * by a SHA-256 hash of (declared mime type + content) in a second object store,
 * `CONTENT_STORE_NAME`, with a `refCount` so the physical bytes are only freed once
 * nothing references them anymore. The `id`-keyed `blobs` store — the public contract
 * every caller already depends on ("keyed by the same id as its owning record") — is
 * UNCHANGED as an addressing scheme: putBlob/getBlob/deleteBlob/listBlobIds/resolve all
 * still take/return exactly what they did before. A `blobs` record now just holds either
 * the bytes directly (old shapes, or a fresh write when no strong hash is available) or a
 * `{id, ref: <hash>}` pointer into `content` (the normal path in any real browser).
 *
 * Mime is folded into the hash (not bytes alone) deliberately: two files that happen to
 * share identical bytes but a different declared mime type are NOT the same stored object
 * — serving one back with the other's mime would be a real correctness bug, not a
 * theoretical one, so they get separate content-store entries instead of colliding.
 *
 * Safety over cleverness: content-addressing only ever activates when a real SHA-256 hash
 * is available (`window.crypto.subtle`, a secure context). A weak fallback key (like
 * duplicateService.js's name+size fallback, which is fine for a "possibly a duplicate,
 * please review" UI badge) would be actively dangerous here — two DIFFERENT files that
 * happen to share a name and size would silently share stored bytes, corrupting one of
 * them from the other's point of view. When no strong hash is available, a `putBlob` just
 * falls back to the pre-CAS direct-write behavior (safe, simply not deduplicated).
 *
 * Same opportunistic-upgrade discipline as the Gate 4 compression change above: an
 * existing legacy record (`{id, data}` or `{id, mime, gz}`) is read as-is and only
 * converted to a `{id, ref}` pointer the next time that id is re-saved — no bulk rewrite.
 * DB_VERSION bumps 1 -> 2 solely to add the new `content` object store; the existing
 * `blobs` store and every record already in it are untouched by the upgrade itself.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var DB_NAME = "pcc_blobs_v1";
  var STORE_NAME = "blobs";
  var CONTENT_STORE_NAME = "content";
  var DB_VERSION = 2;
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
        if (!db.objectStoreNames.contains(CONTENT_STORE_NAME)) {
          db.createObjectStore(CONTENT_STORE_NAME, { keyPath: "hash" });
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

  function bufferToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      hex += h.length === 1 ? "0" + h : h;
    }
    return hex;
  }

  /** SHA-256 over (mime + a null separator + content bytes), so two files with identical
   * bytes but a different declared mime type never collide (see the file header comment).
   * Resolves null — never rejects — when no strong hash is available; callers must treat
   * null as "don't content-address this write," not retry or fall back to a weaker key. */
  function hashContent(mime, bytes) {
    if (!(window.crypto && window.crypto.subtle && window.isSecureContext !== false)) {
      return Promise.resolve(null);
    }
    try {
      var mimeBytes = new TextEncoder().encode(mime || "");
      var combined = new Uint8Array(mimeBytes.length + 1 + bytes.length);
      combined.set(mimeBytes, 0);
      combined[mimeBytes.length] = 0;
      combined.set(bytes, mimeBytes.length + 1);
      return window.crypto.subtle
        .digest("SHA-256", combined)
        .then(function (digest) {
          return bufferToHex(digest);
        })
        .catch(function () {
          return null;
        });
    } catch (e) {
      return Promise.resolve(null);
    }
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

  /** Store (or overwrite) a blob under `id`, given its full data URI. When a strong
   * content hash is available, the bytes are written once into `content` (or a matching
   * entry's refCount is bumped, if identical content is already stored under some other
   * id) and `blobs[id]` becomes a `{id, ref: hash}` pointer; any previous content this id
   * pointed to has its refCount released (and is deleted once nothing references it).
   * Without a strong hash, falls back to the pre-CAS direct write — always compressed,
   * never deduplicated — exactly as before this Phase 6 increment. */
  function putBlob(id, dataUri) {
    if (!id) return Promise.reject(new Error("putBlob requires an id"));
    var parts = dataUriToBytes(dataUri);
    return Promise.all([hashContent(parts.mime, parts.bytes), compressBytes(parts.bytes)]).then(function (results) {
      var hash = results[0];
      var compressed = results[1];
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction([STORE_NAME, CONTENT_STORE_NAME], "readwrite");
          var blobsStore = tx.objectStore(STORE_NAME);
          var contentStore = tx.objectStore(CONTENT_STORE_NAME);
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            reject(tx.error);
          };

          function writeDirect() {
            blobsStore.put({ id: id, mime: parts.mime, gz: compressed });
          }

          function writeRef() {
            var getExistingContent = contentStore.get(hash);
            getExistingContent.onsuccess = function () {
              var existingContent = getExistingContent.result;
              if (existingContent) {
                existingContent.refCount = (existingContent.refCount || 1) + 1;
                contentStore.put(existingContent);
              } else {
                contentStore.put({ hash: hash, mime: parts.mime, gz: compressed, refCount: 1 });
              }
              blobsStore.put({ id: id, ref: hash });
            };
          }

          function releaseOldRef(oldRecord, then) {
            if (!oldRecord || !oldRecord.ref) {
              then();
              return;
            }
            var oldHash = oldRecord.ref;
            var getOldContent = contentStore.get(oldHash);
            getOldContent.onsuccess = function () {
              var oldContent = getOldContent.result;
              if (oldContent) {
                if (oldContent.refCount > 1) {
                  oldContent.refCount--;
                  contentStore.put(oldContent);
                } else {
                  contentStore.delete(oldHash);
                }
              }
              then();
            };
          }

          var getExisting = blobsStore.get(id);
          getExisting.onsuccess = function () {
            var oldRecord = getExisting.result;
            if (!hash) {
              // No strong hash this write — release whatever CAS ref this id held before
              // (it's being replaced by a direct, non-deduplicated write) and write direct.
              releaseOldRef(oldRecord, writeDirect);
              return;
            }
            if (oldRecord && oldRecord.ref === hash) return; // already correctly referenced — true no-op
            releaseOldRef(oldRecord, writeRef);
          };
        });
      });
    });
  }

  /** Fetch a blob's data URI by id. Resolves null (not an error) if nothing is stored
   * under that id, since "not there yet" and "never had one" are both valid states a
   * caller has to handle either way. Transparently handles the old (pre-Gate-4)
   * `{id, data: <data URI string>}` shape, the Gate-4 `{id, mime, gz}` direct shape, and
   * the CAS `{id, ref: hash}` pointer shape — the caller never needs to know or care which. */
  function getBlob(id) {
    if (!id) return Promise.resolve(null);
    return openDb()
      .then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction([STORE_NAME, CONTENT_STORE_NAME], "readonly");
          var blobsStore = tx.objectStore(STORE_NAME);
          var contentStore = tx.objectStore(CONTENT_STORE_NAME);
          var req = blobsStore.get(id);
          req.onsuccess = function () {
            var record = req.result;
            if (!record) {
              resolve(null);
              return;
            }
            if (record.ref) {
              var getContent = contentStore.get(record.ref);
              getContent.onsuccess = function () {
                resolve(getContent.result || null); // null: a dangling ref shouldn't happen, but never throw over it
              };
              getContent.onerror = function () {
                reject(getContent.error);
              };
              return;
            }
            resolve(record);
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

  /** Deletes the `blobs[id]` reference. When `id` pointed into the content-addressed
   * store, releases that reference (decrementing refCount, or deleting the shared content
   * entry once nothing else references it) rather than assuming this id owned the bytes
   * outright — another id may still be pointing at the same content. */
  function deleteBlob(id) {
    if (!id) return Promise.resolve();
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([STORE_NAME, CONTENT_STORE_NAME], "readwrite");
        var blobsStore = tx.objectStore(STORE_NAME);
        var contentStore = tx.objectStore(CONTENT_STORE_NAME);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };

        var getExisting = blobsStore.get(id);
        getExisting.onsuccess = function () {
          var record = getExisting.result;
          blobsStore.delete(id);
          if (record && record.ref) {
            var getContent = contentStore.get(record.ref);
            getContent.onsuccess = function () {
              var content = getContent.result;
              if (content) {
                if (content.refCount > 1) {
                  content.refCount--;
                  contentStore.put(content);
                } else {
                  contentStore.delete(record.ref);
                }
              }
            };
          }
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
