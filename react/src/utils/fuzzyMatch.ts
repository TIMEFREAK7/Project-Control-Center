// Dependency-free fuzzy text matching, shared by every module's search box (Risks, RFIs,
// Documents, Vendors, Schedule, Cost, Commitments, Change Orders, Decision Register, Meetings,
// Daily Log, Lessons Learned, Knowledge Base, Resources, Portfolio, Organizations, Document
// Types). No npm package on purpose — this app ships as a single dependency-free index.html
// (see CLAUDE.md's React migration section on why even React itself is bundled in rather than
// left as a live import); a fuzzy-search library would violate that the same way Framer Motion
// would (see MOTION_SYSTEM.md's "What NOT to add").
//
// Two-tier match, in order:
//   1. Fast path: a plain substring match (case-insensitive) -- this is the ENTIRE match logic
//      every module used before this file existed, so every existing exact/partial search still
//      behaves identically; nothing regresses.
//   2. Typo tolerance: per-word Levenshtein (edit) distance, scaled to word length. Only kicks
//      in for words of 4+ characters -- a 1-2 letter query already got its answer from the
//      substring check above, and fuzzy-matching something that short would make nearly every
//      row match, which is worse than useless in a dense professional register (Operate mode:
//      density and precision, not a firehose of near-matches -- see DESIGN_SYSTEM.md).
//      Multi-word queries require EVERY query word to find its own fuzzy match somewhere in the
//      haystack (AND, not OR) -- "risk conc" should narrow toward "Risk — Concrete delay", not
//      match anything containing either word alone.

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  var prevRow: number[] = new Array(b.length + 1);
  var currRow: number[] = new Array(b.length + 1);
  for (var j = 0; j <= b.length; j++) prevRow[j] = j;

  for (var i = 1; i <= a.length; i++) {
    currRow[0] = i;
    for (var k = 1; k <= b.length; k++) {
      var substitutionCost = a[i - 1] === b[k - 1] ? 0 : 1;
      currRow[k] = Math.min(
        prevRow[k] + 1, // deletion
        currRow[k - 1] + 1, // insertion
        prevRow[k - 1] + substitutionCost // substitution
      );
    }
    var swap = prevRow;
    prevRow = currRow;
    currRow = swap;
  }
  return prevRow[b.length];
}

function typoTolerance(wordLength: number): number {
  if (wordLength <= 3) return 0; // too short to fuzz safely -- substring-only
  if (wordLength <= 5) return 1;
  if (wordLength <= 8) return 2;
  return 3;
}

function tokenize(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

/** True if `query` fuzzy-matches `haystack`. Case-insensitive; an empty/whitespace-only
 * query always matches (same "no filter active" behavior every module's search box already
 * relies on). */
export function fuzzyMatch(query: string, haystack: string): boolean {
  var q = (query || "").trim().toLowerCase();
  if (!q) return true;
  var h = (haystack || "").toLowerCase();

  if (h.indexOf(q) !== -1) return true;

  var queryWords = tokenize(q);
  if (queryWords.length === 0) return false;
  var haystackWords = tokenize(h);
  if (haystackWords.length === 0) return false;

  return queryWords.every(function (qw) {
    var threshold = typoTolerance(qw.length);
    if (threshold === 0) return false; // already ruled out by the substring check above
    return haystackWords.some(function (hw) {
      if (Math.abs(hw.length - qw.length) > threshold) return false; // cheap pre-filter
      return levenshteinDistance(qw, hw) <= threshold;
    });
  });
}
