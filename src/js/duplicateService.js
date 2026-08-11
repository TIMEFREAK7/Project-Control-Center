/* Duplicate detection service — reusable across modules.
 *
 * Two independent matching strategies, because "duplicate" means different things
 * depending on whether a record wraps an uploaded file or not:
 *
 *  - findFileDuplicates(): content-identity matching for file-bearing records
 *    (Documents today; Attachments/Recordings later). Prefers a SHA-256 fingerprint,
 *    falls back to filename+size when Web Crypto isn't available.
 *  - findFieldDuplicates(): deterministic field matching for everything else (Risks,
 *    Tasks, RFIs, ...). No file exists to hash, so this was never going to be
 *    hash-based — a module just declares which fields count and how much each is worth.
 *
 * Both return the same shape ({ record, reason, strength }) so callers (UI panels,
 * badges, search filters) don't need to know which strategy produced a match.
 *
 * Deliberately deterministic only — no fuzzy/similarity scoring in v1. That's a real
 * extension point (see findFieldDuplicates' `rules`/`threshold` shape, and the
 * `strength` field already on every match), not an oversight; adding a scoring model
 * later shouldn't require touching call sites.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  function bufferToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      hex += h.length === 1 ? "0" + h : h;
    }
    return hex;
  }

  /** Computes a content fingerprint for a file already read into an ArrayBuffer.
   * Resolves to { hash, method } where method is 'sha256' (trustworthy content-identity
   * match) or 'name-size' (fallback — only tells you two files have the same name and
   * byte length, not that their contents match). Callers must branch on `method`, not
   * assume every fingerprint is a real hash: crypto.subtle needs a secure context, and
   * this app is opened via file:// (secure in Chrome) and content:// on Android, where
   * that hasn't been verified. Never throws — always resolves to something usable. */
  function fingerprintFile(buffer, filename, size) {
    var fallback = function () {
      return { hash: (filename || "") + "|" + size, method: "name-size" };
    };
    if (window.crypto && window.crypto.subtle && window.isSecureContext !== false) {
      try {
        return window.crypto.subtle
          .digest("SHA-256", buffer)
          .then(function (digest) {
            return { hash: bufferToHex(digest), method: "sha256" };
          })
          .catch(fallback);
      } catch (e) {
        return Promise.resolve(fallback());
      }
    }
    return Promise.resolve(fallback());
  }

  function newGroupId() {
    return "dup_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  var DEFAULT_FILE_FIELDS = {
    hash: "content_hash",
    method: "hash_method",
    filename: "filename",
    size: "file_size",
    projectId: "project_id",
  };

  /** File-identity matching. `existing` is an array of records already carrying the
   * fields named in DEFAULT_FILE_FIELDS (override via options.fields for a module that
   * names things differently). `candidate` is { hash, method, filename, size, projectId }
   * — the shape fingerprintFile() plus a filename/size/projectId produces.
   * options.sameProjectOnly defaults to true (matches your "mandatory project
   * assignment" rule elsewhere — a duplicate check shouldn't cross project boundaries
   * unless a module explicitly opts out). */
  function findFileDuplicates(existing, candidate, options) {
    options = options || {};
    var f = Object.assign({}, DEFAULT_FILE_FIELDS, options.fields || {});
    var sameProjectOnly = options.sameProjectOnly !== false;

    var matches = [];
    (existing || []).forEach(function (rec) {
      if (sameProjectOnly && candidate.projectId && rec[f.projectId] !== candidate.projectId) return;

      var sameHash =
        candidate.hash &&
        candidate.method === "sha256" &&
        rec[f.method] === "sha256" &&
        rec[f.hash] === candidate.hash;

      var sameNameSize =
        candidate.filename &&
        rec[f.filename] === candidate.filename &&
        candidate.size != null &&
        rec[f.size] === candidate.size;

      var sameNameOnly = candidate.filename && rec[f.filename] === candidate.filename && !sameNameSize;

      if (sameHash) {
        matches.push({ record: rec, reason: "Identical file content (SHA-256 match).", strength: "strong" });
      } else if (sameNameSize) {
        var contentUnverified = candidate.method !== "sha256" || rec[f.method] !== "sha256";
        matches.push({
          record: rec,
          reason: contentUnverified
            ? "Same filename and file size (content hash unavailable on this device, so this isn't confirmed byte-for-byte)."
            : "Same filename and file size, but file content differs.",
          strength: "moderate",
        });
      } else if (sameNameOnly) {
        matches.push({
          record: rec,
          reason: "Same filename, but file size differs \u2014 could be a revised version of this file, or an unrelated file that happens to share a name.",
          strength: "weak",
        });
      }
    });
    return matches;
  }

  function normalizeValue(v) {
    return String(v == null ? "" : v)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  /** Deterministic field matching for records with no file to fingerprint.
   * `rules`: [{ field, label, weight }]. A record matches if the sum of weights for
   * exactly-equal (post-normalization) fields meets options.threshold — default
   * threshold is "every rule must match" (sum of all weights), i.e. strict by default;
   * pass a lower threshold to allow partial matches (e.g. title+project match even if
   * due date differs). `candidate` and each record in `existing` are plain objects read
   * by `rule.field`. */
  function findFieldDuplicates(existing, candidate, rules, options) {
    options = options || {};
    var totalWeight = rules.reduce(function (sum, r) {
      return sum + (r.weight || 1);
    }, 0);
    var threshold = options.threshold != null ? options.threshold : totalWeight;

    var matches = [];
    (existing || []).forEach(function (rec) {
      var score = 0;
      var matchedLabels = [];
      rules.forEach(function (rule) {
        var a = normalizeValue(candidate[rule.field]);
        var b = normalizeValue(rec[rule.field]);
        if (a && a === b) {
          score += rule.weight || 1;
          matchedLabels.push(rule.label || rule.field);
        }
      });
      if (score > 0 && score >= threshold) {
        matches.push({
          record: rec,
          reason: "Matching " + matchedLabels.join(", ") + ".",
          strength: score >= totalWeight ? "strong" : "moderate",
        });
      }
    });
    return matches;
  }

  window.PCC.duplicateService = {
    fingerprintFile: fingerprintFile,
    findFileDuplicates: findFileDuplicates,
    findFieldDuplicates: findFieldDuplicates,
    newGroupId: newGroupId,
  };
})();
