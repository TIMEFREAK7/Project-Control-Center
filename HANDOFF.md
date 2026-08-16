# Project Control Center — Session Handoff

Paste this into a new chat to resume work with full context. This file lives in the repo
(`HANDOFF.md` at the root) specifically so a future session can find it without being told a
path — see the standing instructions in `CLAUDE.md` about keeping it current and about handing
it (and a zip) to Aditya directly after every major upgrade, not just committing quietly.

## What this project is

Solo-developer, offline-first project/portfolio management app, built as a single
self-contained `index.html`. Repo: `TIMEFREAK7/Project-Control-Center`. Full history and
rationale live in `README.md` — read it before making changes. Architecture/build/testing
conventions live in `CLAUDE.md` at the repo root (read this too — it has standing instructions
that override default behavior).

## Standing instructions (already in CLAUDE.md, but repeating since they matter most)

- **If a PR has no comments, merge it — don't ask first.** Solo repo, no CI, no other
  reviewers. Only pause to ask if there *are* comments to address, or something about the
  change itself is genuinely ambiguous — e.g. two branches independently claiming the same
  schema version, which is exactly what happened this round (see below).
- **After every gate/phase/tier, compile everything and hand over a zip file** — not just push
  to `main`. Rebuild (`node build.js`), run the full test suite, then package `index.html`,
  `README.md`, and empty `data/`/`files/` placeholder folders (with their own `README.txt`,
  already present at the repo root — reuse them) — **not** `src/`, `build.js`, `tests/`,
  `.claude/`, `CLAUDE.md`, or `HANDOFF.md`. Verify before sending: extract fresh (not the dev
  working copy) and open `index.html` in real Chromium.
- **After every major upgrade, update `HANDOFF.md` at the repo root AND hand Aditya the complete
  updated file directly**, so a new session can resume without re-deriving everything from git
  log and source.
- **If you're picking up a branch for the *next* piece of work, restart it from the latest
  `main` first** (`git fetch origin main && git reset --hard origin/main`, or rebase if there's
  unmerged work sitting on it) rather than stacking new commits on stale history.

## Where things stand — everything is now merged into `main`

As of this handoff, **`main` has everything through Gate 13**, `schema_version` is **24**, and
the full test suite (18 files, **355 checks**) passes clean. There is no other unmerged branch
carrying app features — `main` is the one place to build from next.

**How it got here — the two-branch reconciliation:** two sessions worked in parallel off the same
Gate-7 base without knowing about each other. This session built Gate 8 (interactive Gantt
editing), Gate 9 (Project Executive Center), Gate 10 (Activity Linking), and Gate 11 (Resource
Management) — schema v20→v23. A separate session (PR #8) built its own "Gate 8" (in-app Excel
editor for schedules) and "Gate 9" (Vendor Management) against schema v20→v21 — genuinely good,
tested work, just numbered as if it were the only branch in flight. When asked to merge
everything into `main`, this collision surfaced; the user explicitly chose to reconcile both
into one history rather than pick one and drop the other. The resolution:

- Renumbered the other branch's work as **Gate 12** (In-App Excel Editor) and **Gate 13**
  (Vendor Management) in the README, since 8-11 were already taken here.
- Ran its schema migration as a new `v23→v24` step (Gate 13) instead of colliding with this
  branch's `v21` (Gate 9/Executive Center).
- Merged `schedule.js`/`app.js`/`layout.js`/`build.js`/`store.js`/`tests/package.json` by hand —
  mostly clean since the two branches touched different insertion points (Gantt editing vs. the
  Excel editor grid; Executive Center/Resources vs. Vendors). `portfolio.js` merged with zero
  manual conflict resolution needed.
- Folded the other branch's schema-migration test assertions into this project's one canonical
  `tests/test_store_schema_v24_migration.js`, per the existing "one test file targets latest"
  convention, rather than keeping two schema test files around.
- PR #9 (`integration/gates-8-13` → `main`) carries the reconciliation commits; merging it
  automatically resolved PR #8 too, since PR #8's actual commits are now contained in `main`'s
  history (a real merge, not a squash/rewrite) — GitHub marked it merged on its own.

**Feature summary, in build order:**

- **Gate 8 — Interactive Gantt Editing.** Drag-to-reschedule and resize-to-change-duration
  directly on the Gantt bars, plus filters (search/WBS/discipline/contractor/responsible
  person/quick filters like "critical"/"delayed"), zoom presets, an Activity Detail Panel, and a
  Linked Records section (see Gate 10) right there in the Gantt.
- **Gate 9 — Project Executive Center.** Per-project KPI rollups, a configurable weighted health
  score, diagnostics, an editable Executive Summary, SVG charts, and Project Snapshot /
  Management Pack print views (`window.print()`, no PDF library).
- **Gate 10 — Activity Linking.** Risk/Issue/Opportunity, RFI/TQ, Meetings, Documents, Daily
  Log, and Change Orders can each optionally link to one Schedule activity, with bidirectional
  navigation (each register's own details ↔ the Gantt's Linked Records section).
- **Gate 11 — Resource Management.** A portfolio-wide (not project-scoped) resource pool,
  assignments to activities, and cross-project over-allocation detection — genuinely
  cross-project, not just per-schedule double-booking.
- **Gate 12 — In-App Excel Editor for Schedules.** The original Excel file behind an imported
  schedule is now stored (`blobStore`); "Edit Excel" opens an in-page grid built from the live
  Activities/WBS/Relationships, reusing `scheduleImportService.parseRows()` verbatim so grid
  edits validate identically to a fresh import. Guards against silently deleting hand-added
  (no-Activity-ID) activities.
- **Gate 13 — Vendor Management.** A portfolio-wide Vendor Master with a dashboard,
  searchable/filterable list, and a 9-tab profile (Overview/Projects/Contacts/Documents/
  Meetings/RFI-TQ/Risks/Performance/Notes). Vendor↔Meeting/RFI/Risk linking is one-directional
  from the Vendor side via join arrays with zero changes to `meetings.js`/`rfis.js`/`risks.js`.
  Portfolio's project details panel got a matching "VENDORS" section (link/unlink from either
  side, same underlying `vendor_project_links` array).

## Key technical conventions to carry forward

- `src/` is source of truth; `index.html` is a generated artifact — never hand-edit it. Run
  `node build.js` after every `src/` change (order-sensitive `JS_ORDER` in `build.js`).
- Pure calculation engines have **zero DOM/store access**: `scheduleCpmEngine.js`,
  `scheduleBaselineEngine.js`, `scheduleGanttLayout.js`, `costEvmEngine.js`,
  `projectHealthEngine.js`, `resourceLevelingEngine.js`. Each duplicates small helpers rather
  than sharing a util layer — established convention, not an oversight.
- Date precedence convention (used identically everywhere): calculated (`early_start`/
  `early_finish`) wins over planned; milestones with only one date are a zero-width point.
- Transparency-over-blending: never silently combine numbers of different precision/source —
  always flag it in the UI.
- **This app has no server, no SQL, no API layer** — one JS object in `localStorage` +
  IndexedDB for blobs. If a future feature request is written in generic ERP/backend language,
  translate it explicitly before building (see Gate 13's README entry for how that was reasoned
  through and written down as a decision).
- **Cross-module linking pattern:** when a new module needs to reference records in an existing
  module, prefer a **join array** owned by the new module, populated entirely from the new
  module's own UI, reusing the target module's existing `expand*()`/`filterByProject()` hooks —
  don't add fields to the existing module's schema. Gates 10 and 13 both follow this.
- Every register module exposes a small public API on `window.PCC.<module>`:
  `filterByProject(projectId)` and often `expandX(id)`/`viewX(id)`/`openProfile(id)`.
- Register modules (Risk/Issue/Opportunity, RFI/TQ) use "one shape distinguished by a `type`
  field" — Cost Tracking and Vendor Documents deliberately don't, since those are genuinely
  different shapes.
- Project assignment is mandatory on every *existing* register — never add "Unassigned" back.
  Vendor Documents (Gate 13) is a **deliberate, disclosed exception** (optional `project_id`).
- Change Orders never write back to `contract_value` (deliberate, manual reconciliation only).
- Reports are printable HTML (`window.print()`), not generated PDFs.
- No File System Access API; export/import-as-JSON is the deliberate cross-platform answer.
- **Schema migration test convention:** one canonical file targeting the latest version
  (`tests/test_store_schema_v24_migration.js` as of this handoff) — when you bump
  `SCHEMA_VERSION`, `git mv` it to the new version number and fold in new assertions, rather than
  keeping old version-specific files around.
- Testing: `cd tests && npm test` must pass before anything ships (18 files, 355 checks as of
  this handoff). Pure-logic tests eval the real source file directly. E2E tests load the actual
  bundled `index.html` via jsdom (+ `fake-indexeddb` for IndexedDB-touching code). Also do one
  real-Chromium pass per gate (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --no-sandbox`,
  via the globally installed `playwright` package at `/opt/node22/lib/node_modules/playwright`).
  For a distributable zip specifically, the real-Chromium pass should open the file from a
  *fresh extraction*, not the dev working copy.
- **jsdom gotcha:** arrays from `win.PCC.store.get()` inside a jsdom test are jsdom-realm arrays.
  `assert.deepStrictEqual(thatArray, [1, 2])` fails on prototype identity even when every
  element matches — compare via `.join(",")` or length + individual elements instead.
- **Playwright gotcha:** `page.locator(tag, { hasText: "X" })` is a substring match — `"Add
  Vendor"` also matches `"+ Add Vendor"` elsewhere on the page. Filter with an anchored regex
  (`^...$`) if two buttons could share a substring, or use the jsdom suite's own
  `findButtonByText()` helper (exact-trim matching) where possible.

## Recently fixed bugs worth knowing about

- `formatMoney()` in `cost.js` caps `maximumFractionDigits: 2` — EAC/VAC are fractional
  (division results) and would otherwise render as `"$3,083.333"`.
- CPI/SPI are `null` (not `0`) when nothing is linked yet, guarded by `linkedBac > 0`.
- `ACTIVITY_TYPE_ALIASES` in `scheduleImportService.js` has a `wbs_summary` (underscore) alias —
  the raw internal value for that activity type, needed for the Gate 12 Excel grid's round-trip.
- Gantt drag/resize tests must snapshot primitive date strings *before* dispatching a drag event
  — a `before` variable holding a live store-object reference gets mutated in place mid-test,
  producing a doubled/wrong expected date.
- `router.go()` only sets `window.location.hash`; it does not call `render()` itself in jsdom
  tests (relies on `hashchange`, which jsdom doesn't reliably fire synchronously). Call
  `win.PCC.router.render()` explicitly right after any `router.go()`-triggering click in tests.

## Repo/branch state

`main` is fully up to date — PR #9 (`integration/gates-8-13` → `main`) merged, which also
resolved PR #8 automatically. The `integration/gates-8-13` branch and the two original feature
branches (`claude/phase-11c-planning-executive-frty7j`, `claude/excel-schedule-pcc-editing-dgyy9m`)
still exist on `origin` but are fully contained in `main`'s history now — safe to delete, not
urgent.

**Zip delivered this round:** `Project-Control-Center.zip` — `index.html` + `README.md` +
`data/`/`files/` (existing `README.txt` placeholders), verified via a fresh extraction opened in
real Chromium (project creation + Vendors/Resources/Executive Center/Schedule/Cost Tracking
routes all render, zero console/page errors).

**Next steps, in likely priority order:**
1. Start any new work from `main` directly (`git fetch origin main && git checkout -b
   <new-branch> origin/main`) — there's no other branch to catch up on anymore.
2. Optional cleanup: delete the now-fully-merged `integration/gates-8-13`,
   `claude/phase-11c-planning-executive-frty7j`, and `claude/excel-schedule-pcc-editing-dgyy9m`
   branches on `origin` once Aditya confirms nothing else was mid-flight on them.
3. Tier 3 (AI Document Processing, Knowledge Base, AI Project Assistant, Lessons Learned, final
   polish) is next per the locked build order, deferred until Tier 1/2 are in daily use — worth
   checking in on before starting it, since Vendor Management/Excel Editor were both ad hoc
   insertions rather than progress toward Tier 3.
