/* Document Nomenclature engine (Gate 16 — Document Control 3: Classification +
 * Nomenclature) — calculation only, no DOM, no store access. Same separation every other
 * engine in this app keeps (scheduleCpmEngine.js, costEvmEngine.js,
 * projectHealthEngine.js, resourceLevelingEngine.js): documents.js gathers the real
 * pattern/tokens/filename from the store and the upload form, this module does pure
 * string substitution and comparison, and documents.js is the only place that renders
 * the result (a non-blocking warning — see its own header comment for why this never
 * rejects an upload).
 *
 * SCOPE, DELIBERATELY:
 * - The pattern is a template string containing the literal tokens PROJECT, DISCIPLINE,
 *   DOCUMENTTYPE, NUMBER, REV (e.g. "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV").
 *   Anything else in the pattern (separators like "-" or "_", or a token in a different
 *   order) passes through untouched, so a user can adopt any convention without a schema
 *   or code change — see settings.js.
 * - Comparison is case-insensitive and ignores the file extension (the pattern itself
 *   never encodes one), matching the spec's own example
 *   ("ABC-ELE-RFI-001-REV02.pdf" checked against "PROJECT-DISCIPLINE-DOCUMENTTYPE-
 *   NUMBER-REV").
 * - A token whose underlying value is blank (e.g. a project with no project_code set)
 *   still participates in the comparison as an empty string — checkFilename() doesn't
 *   silently skip it. This is deliberate: it makes an unset token visible in the
 *   "expected" string shown to the user (e.g. "-ELE-RFI-001-REV02"), which is a more
 *   honest nudge to go set it than pretending the check passed.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var TOKEN_PATTERN = /PROJECT|DISCIPLINE|DOCUMENTTYPE|NUMBER|REV/g;

  /** Substitutes every recognized token in `pattern` with its value from `tokens`
   * (an object like { PROJECT, DISCIPLINE, DOCUMENTTYPE, NUMBER, REV }, any of which may
   * be missing/blank). Non-token characters (separators) pass through unchanged. */
  function buildExpectedName(pattern, tokens) {
    tokens = tokens || {};
    return String(pattern || "").replace(TOKEN_PATTERN, function (token) {
      return tokens[token] || "";
    });
  }

  /** Strips a filename's extension (last ".ext" segment) so comparison is against the
   * name stem only, matching how the pattern itself never encodes an extension. A
   * filename with no extension (or a leading dot only, e.g. ".gitignore"-shaped edge
   * case) is returned unchanged. */
  function stripExtension(filename) {
    var m = /^(.+)\.[^.]+$/.exec(String(filename || ""));
    return m ? m[1] : String(filename || "");
  }

  /** Returns { matches, expected, stem }. `matches` is a case-insensitive comparison of
   * the filename's stem against the pattern with tokens substituted in. Never throws on
   * a blank pattern/filename/tokens — callers (documents.js) decide whether to even show
   * this when nomenclature checking is disabled or nothing's been entered yet. */
  function checkFilename(pattern, filename, tokens) {
    var stem = stripExtension(filename);
    var expected = buildExpectedName(pattern, tokens);
    var matches = stem.toLowerCase() === expected.toLowerCase();
    return { matches: matches, expected: expected, stem: stem };
  }

  window.PCC.documentNomenclatureEngine = {
    buildExpectedName: buildExpectedName,
    stripExtension: stripExtension,
    checkFilename: checkFilename,
  };
})();
