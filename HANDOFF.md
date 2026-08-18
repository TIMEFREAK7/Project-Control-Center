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
  change itself is genuinely ambiguous (e.g. two branches independently claiming the same
  schema version — see the Gates 8-13 reconciliation note further down for when that happened).
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
- **Document Control is a separate 14-gate sub-spec being built incrementally, one confirmed
  gate at a time.** Aditya provided the full spec up front but is explicit that it must NOT be
  built all at once — inspect current state, propose the next gate's scope in a short paragraph,
  wait for "yes, build it," then build exactly that and stop. Four gates in as of this handoff
  (see below); do not jump ahead to a later gate's fields "while you're in there."

## Where things stand — everything is merged into `main`, Document Control gates 1-4 done

As of this handoff, **`main` has everything through Gate 17**, `schema_version` is **28**, and
the full test suite (**23 files, 477 checks**) passes clean. There is no other unmerged branch
carrying app features — `main` is the one place to build from next.

**Feature summary, in build order (Gates 1-13 summarized; Gates 14-17 — Document Control — in
full detail since they're what's newest and least likely to be in a future session's training/
memory of this project):**

- **Gates 1-7:** Portfolio, Documents (basic), Daily Site Log, Risk/Issue/Opportunity Register,
  Meetings, RFI/TQ, Change Management, Reporting, Backup & Recovery, Schedule import + CPM/float
  engine, Gantt visualization, Cost Tracking, EVM engine — Tier 1 and most of Tier 2.
- **Gate 8 — Interactive Gantt Editing.** Drag-to-reschedule and resize-to-change-duration
  directly on the Gantt bars, filters, zoom presets, an Activity Detail Panel with a Linked
  Records section (see Gate 10).
- **Gate 9 — Project Executive Center.** Per-project KPI rollups, a configurable weighted health
  score, diagnostics, an editable Executive Summary, SVG charts, Project Snapshot/Management Pack
  print views (`window.print()`, no PDF library).
- **Gate 10 — Activity Linking.** Risk/Issue/Opportunity, RFI/TQ, Meetings, Documents, Daily
  Log, and Change Orders can each optionally link to one Schedule activity, bidirectionally.
- **Gate 11 — Resource Management.** A portfolio-wide resource pool, assignments to activities,
  genuine cross-project over-allocation detection.
- **Gate 12 — In-App Excel Editor for Schedules.** Edit an imported schedule's Activities/WBS/
  Relationships via an in-page grid, reusing the import parser verbatim so edits validate the
  same way a fresh import would.
- **Gate 13 — Vendor Management.** A portfolio-wide Vendor Master, dashboard, searchable list,
  9-tab profile. Established the `document_group_id`/`revision_number` version-history pattern
  (on `vendor_documents`) that Gate 17 later reused verbatim for Documents.
- *(Gates 8-13 were built across two parallel sessions that independently claimed overlapping
  schema version numbers without knowing about each other; reconciled into one history via PR #9.
  If you're ever confused why the README's Gate 12/13 write-ups mention "renumbered from Gate
  8/9," that's why — see README.md's own Gate 12/13 sections for the full story, not repeated
  here since it's settled history now.)*

### Document Control (Gates 14-17) — the current frontier, one gate at a time

Aditya's Document Control spec has 14 gates total (Master Repository → Project Requirements →
Classification/Nomenclature → Status/Version Control → Schedule Due Dates → Vendor Register →
Schedule↔Document Linking → Schedule-Driven Dates/Lead Time → Vendor Lookahead → Readiness/
Constraints → Reminders/Notifications → Dashboards → Executive Summary → Portfolio Compliance).
**Only the first four are built.** Each was scoped in a short paragraph, confirmed by Aditya
("yes, build Gate N as scoped"), then built — that back-and-forth pattern should continue for
Gate 5 onward, not be skipped.

- **Gate 14 — Master Document Repository.** The first user-configurable taxonomy in this app:
  `document_types` (name/code/category/default_criticality/active), seeded with ~28 starting
  types (BOQ, ITP, Method Statement, RFI, ...), managed from a new `pages/documentTypes.js`
  page. Deliberately does NOT touch Documents' existing `category` field or Vendor Management's
  `VENDOR_DOCUMENT_CATEGORIES` — reconciling those into one scheme is explicitly deferred (still
  open as of this handoff).
- **Gate 15 — Project-Specific Document Requirements.** `project_document_requirements`: a flat
  join (existence of a row = "this type applies to this project"), managed from a new "DOCUMENT
  REQUIREMENTS" section in Portfolio's project details panel. Five suggested project templates
  (EPC/Industrial Construction/Manufacturing/Infrastructure/Energy) add matching requirements by
  type *name* — additive only, never touches `document_types` itself.
- **Gate 16 — Classification + Nomenclature.** Documents (`pages/documents.js`) gained optional
  classification fields (`document_type_id`, `discipline`, `document_number`, `revision`,
  `package`, `contract_or_po`, `vendor_id`, `priority`, `criticality`, `remarks`) — all additive
  on top of the pre-existing `category` field, untouched. A configurable filename pattern
  (`PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV` by default, editable in Settings) is checked at
  upload time via a new pure `documentNomenclatureEngine.js`; a mismatch shows a warning and
  **never blocks the upload**. Added `project_code` to Project (didn't exist before, needed for
  the PROJECT token).
- **Gate 17 — Status + Version Control.** Documents gained `status` (plain select — draft/
  submitted/under_review/approved/rejected/resubmitted/superseded/archived, NOT an enforced
  workflow) and real version control: `document_group_id`/`revision_number`, reusing
  `vendor_documents`' Gate 13 pattern verbatim. "New Revision" pre-fills classification from the
  latest version and resets status to draft; "History" shows older revisions; the document list
  (and Portfolio's ATTACHMENTS section) collapse to latest-revision-per-group via a new shared
  `window.PCC.files.latestOnly()` helper; Delete removes the whole revision history at once.

**Deliberately still open / explicitly deferred, don't assume these got done:**
- Reconciling Documents' `category` / Vendor's `VENDOR_DOCUMENT_CATEGORIES` / the Gate 14 master
  repository into one classification scheme (deferred at both Gate 14 and Gate 16).
- Everything from Document Control Gate 5 onward (schedule-linked due dates, lead time, vendor
  lookahead, readiness/constraint flagging on activities, reminders, dashboards, executive/
  portfolio compliance rollups).
- Rate × usage from Resource Management feeding Cost Tracking/EVM (deferred at Gate 11).
- Portfolio-level executive dashboard filtering by client/country/sector/PM/date range.

## Key technical conventions to carry forward

- `src/` is source of truth; `index.html` is a generated artifact — never hand-edit it. Run
  `node build.js` after every `src/` change (order-sensitive `JS_ORDER` in `build.js`).
- Pure calculation engines have **zero DOM/store access**: `scheduleCpmEngine.js`,
  `scheduleBaselineEngine.js`, `scheduleGanttLayout.js`, `costEvmEngine.js`,
  `projectHealthEngine.js`, `resourceLevelingEngine.js`, `documentNomenclatureEngine.js` (new,
  Gate 16). Each duplicates small helpers rather than sharing a util layer — established
  convention, not an oversight.
- **Version-history pattern** (Vendor Documents Gate 13, Documents Gate 17): a flat array where
  every upload is its own row; `document_group_id` ties revisions together (defaults to the
  record's own id on first upload); `revision_number` increments on a new revision; "latest" is
  always *computed at render time* (highest `revision_number` in the group) — never a
  denormalized `is_latest` flag that could drift. Never overwrite a previous revision's row.
  Delete removes the whole group, not just the visible row. If you add version history to a
  fourth thing, reuse this exact shape again rather than inventing a variant.
- **Status-like fields are plain selects, not enforced state machines**: `VENDOR_STATUSES`,
  `PROJECT_STATUSES`, `ACTIVITY_STATUSES`, `DOCUMENT_STATUSES` (Gate 17) all let the user pick
  any value at any time. PCC doesn't gate transitions — it warns/informs, it doesn't block.
- **"Suggested, not enforced" is a recurring relationship, not a one-off**: Gate 15's project
  templates suggest requirements (user can still change them); a document's `criticality`
  auto-suggests from its linked document type's `default_criticality` (Gate 16) but stays
  independently editable. Match this shape for any future "smart default" — offer it, never lock
  it in.
- Date precedence convention (used identically everywhere): calculated (`early_start`/
  `early_finish`) wins over planned; milestones with only one date are a zero-width point.
- Transparency-over-blending: never silently combine numbers of different precision/source —
  always flag it in the UI. Nomenclature mismatches and duplicate-file matches both follow this:
  warn visibly, never silently reject or silently merge.
- **This app has no server, no SQL, no API layer** — one JS object in `localStorage` +
  IndexedDB for blobs. If a future feature request is written in generic ERP/backend language,
  translate it explicitly before building (see Gate 13's and Gate 16's README entries for how
  that translation was reasoned through and written down as a decision each time — e.g. Gate 16
  explicitly declined to model "Package"/"Contract/PO" as real entities, using free text instead,
  since no such entity exists anywhere in this app and inventing one was out of scope).
- **Cross-module linking pattern:** when a new module needs to reference records in an existing
  module, prefer a **join array** owned by the new module, populated entirely from the new
  module's own UI, reusing the target module's existing `expand*()`/`filterByProject()` hooks —
  don't add fields to the existing module's schema. Gates 10, 13, and 15 all follow this.
- Every register module exposes a small public API on `window.PCC.<module>`:
  `filterByProject(projectId)` and often `expandX(id)`/`viewX(id)`/`openProfile(id)`. Documents
  also now exposes `window.PCC.files.latestOnly(documents)` (Gate 17) — reuse it (don't
  re-implement latest-revision grouping) anywhere else that lists documents.
- Register modules (Risk/Issue/Opportunity, RFI/TQ) use "one shape distinguished by a `type`
  field" — Cost Tracking and Vendor Documents deliberately don't, since those are genuinely
  different shapes.
- Project assignment is mandatory on every *existing* register — never add "Unassigned" back.
  Vendor Documents (Gate 13) is a **deliberate, disclosed exception** (optional `project_id`).
- Change Orders never write back to `contract_value` (deliberate, manual reconciliation only).
- Reports are printable HTML (`window.print()`), not generated PDFs.
- No File System Access API; export/import-as-JSON is the deliberate cross-platform answer.
- **Schema migration test convention:** one canonical file targeting the latest version
  (`tests/test_store_schema_v28_migration.js` as of this handoff) — when you bump
  `SCHEMA_VERSION`, `git mv` it to the new version number and fold in new assertions, rather than
  keeping old version-specific files around.
- Testing: `cd tests && npm test` must pass before anything ships (23 files, 477 checks as of
  this handoff). Pure-logic tests eval the real source file directly. E2E tests load the actual
  bundled `index.html` via jsdom (+ `fake-indexeddb` for IndexedDB-touching code). Also do one
  real-Chromium pass per gate (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --no-sandbox`,
  via the globally installed `playwright` package at `/opt/node22/lib/node_modules/playwright`).
  For a distributable zip specifically, the real-Chromium pass should open the file from a
  *fresh extraction*, not the dev working copy.
- **The real file-driven upload/extraction pipeline (documents.js, vendor documents) is NOT
  jsdom-testable in this codebase** — jsdom can't reliably drive pdf.js/mammoth/SheetJS through a
  real `<input type=file>` + `FileReader`. Established pattern (Gates 10, 16, 17): jsdom e2e
  tests seed document records *directly via the store*, and the real upload flow gets verified
  separately in real Chromium. For that real-Chromium pass, a hand-built minimal valid PDF works
  well and is cheap to construct inline in a throwaway script:
  ```
  %PDF-1.4
  1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
  2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
  3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
  trailer<</Size 4/Root 1 0 R>>
  %%EOF
  ```
  pdf.js parses this as a valid one-page, textless PDF — good enough to exercise the real
  upload → extraction → save pipeline without needing a "real" document.
- **Playwright gotcha (new this round):** `page.click('input[type="file"]')` or similar untyped
  selectors can match the WRONG file input — this app has a second, hidden `<input type="file">`
  in the title-block for JSON data import (`layout.js`), which sits earlier in the DOM than any
  page-specific upload input. Scope file-input selectors to `#page-outlet input[type="file"]`,
  not just `input[type="file"]`, or you'll silently upload to the wrong handler with no error.
- **Playwright gotcha (existing):** `page.click('text=Foo')` / `hasText` do substring matching —
  "Manage" can match inside "Management Pack" elsewhere on the page and click the wrong element
  with no error thrown. Prefer `button:has-text("Exact Label")` scoped to a specific button, or
  an anchored regex, especially for short/common button labels.
- **jsdom gotcha:** arrays from `win.PCC.store.get()` inside a jsdom test are jsdom-realm arrays.
  `assert.deepStrictEqual(thatArray, [1, 2])` fails on prototype identity even when every
  element matches — compare via `.join(",")` or length + individual elements instead.

## Recently fixed bugs / notable gotchas worth knowing about

- `formatMoney()` in `cost.js` caps `maximumFractionDigits: 2` — EAC/VAC are fractional
  (division results) and would otherwise render as `"$3,083.333"`.
- CPI/SPI are `null` (not `0`) when nothing is linked yet, guarded by `linkedBac > 0`.
- `ACTIVITY_TYPE_ALIASES` in `scheduleImportService.js` has a `wbs_summary` (underscore) alias —
  the raw internal value for that activity type, needed for the Gate 12 Excel grid's round-trip.
- Gantt drag/resize tests must snapshot primitive date strings *before* dispatching a drag event
  — a `before` variable holding a live store-object reference gets mutated in place mid-test.
- `router.go()` only sets `window.location.hash`; it does not call `render()` itself in jsdom
  tests. Call `win.PCC.router.render()` explicitly right after any `router.go()`-triggering click.
- Text inputs in this app generally do NOT trigger a full rerender on every keystroke (`oninput`
  updates `uiState` only) — full rerenders on typing would blow away focus/cursor position. When
  a dependent UI element needs to reflect a text field's latest value (e.g. Gate 16's nomenclature
  notice reacting to the Discipline/Document Number/Revision fields), wire `onblur = rerender` in
  addition to `oninput`, rather than rerendering on every keystroke.

## Repo/branch state

`main` is fully up to date through Gate 17 (`8c774e5`). PRs #9 through #13 are all merged
(Gates 8-13 reconciliation, then Gates 14/15/16/17 each as their own PR). No other branch carries
unmerged app features — start any new work from `main` directly:
`git fetch origin main && git checkout -b <new-branch> origin/main`.

**Zip delivered this round:** `Project-Control-Center.zip` — `index.html` + `README.md` +
`data/`/`files/` (existing `README.txt` placeholders), verified via a fresh extraction opened in
real Chromium.

**Next steps, in likely priority order:**
1. Ask Aditya whether Document Control Gate 5 (document schedule + due dates) is next, or
   whether something else takes priority — do not assume and start building without the explicit
   "yes, build Gate N as scoped" confirmation this project has consistently required so far.
2. If Gate 5 is next: it needs a planned-submission-date concept on `project_document_requirements`
   (manual, or later derived from a schedule activity/milestone per Gate 7-8 of the sub-spec) —
   read spec sections 7-8 (Document Timeline, Document Lead Time) before proposing scope, and keep
   Gate 5 itself small (due dates only; schedule *linking* is explicitly Gate 7, lead-time
   calculation is explicitly Gate 8 — don't collapse three gates into one).
3. Optional cleanup: these branches on `origin` are all fully merged into `main` and safe to
   delete (not urgent) — `integration/gates-8-13`, `claude/phase-11c-planning-executive-frty7j`,
   `claude/excel-schedule-pcc-editing-dgyy9m`, `claude/doc-control-gate14-master-repo`,
   `claude/doc-control-gate15-project-requirements`,
   `claude/doc-control-gate16-classification-nomenclature`,
   `claude/doc-control-gate17-status-version-control`. `claude/project-setup-tooling-gcwsu3`
   also still exists on origin — verify it's merged before deleting it, since this handoff round
   didn't touch it.
4. Tier 3 (AI Document Processing, Knowledge Base, AI Project Assistant, Lessons Learned, final
   polish) remains deferred until Tier 1/2 are in daily use.
