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
- **Always merge the working branch into `main` immediately after completing a gate/phase —
  don't ask first, don't wait to be told each time.** Rebuild, run the full suite, merge (direct
  merge is fine, same "solo repo, no CI, no reviewers" reasoning as the PR bullet above — a PR
  isn't required), push `main`, then restart the working branch from the new `main` before
  starting the next gate. Standing instruction as of this session (Aditya, verbatim: *"Always
  merge the branches to main after completing the gate/phase"*) — apply it to every gate/phase
  from here on without being asked again. Also written into `CLAUDE.md` itself now, not just
  here.
- **Document Control is a separate 14-gate sub-spec being built incrementally, one confirmed
  gate at a time.** Aditya provided the full spec up front but is explicit that it must NOT be
  built all at once — inspect current state, propose the next gate's scope in a short paragraph,
  wait for "yes, build it," then build exactly that and stop. Twelve gates in as of this handoff
  (see below); do not jump ahead to a later gate's fields "while you're in there."

## Where things stand — everything through Gate 26 is merged into `main`

`main` is fully up to date through **Gate 26** (Document Control gate 12 of 14: Dashboards), merge
commit `a51322d`, `schema_version` still **33** (this gate added no schema fields either — a new
page, purely computed from existing `project_document_requirements`). This session built and
merged two gates in sequence — Gate 25 (Reminders/Notifications, merged as `a626fc1`), then Gate
26 — each time rebuilding, running the full suite, merging directly (no PR — standing instruction,
see above), pushing `main`, and restarting `claude/gate-5-startup-1ubxfh` from the new `main`
before starting the next gate. The full test suite (**27 files, 571 checks**) passes clean, and a
real-Chromium pass confirmed the new "Document Control Dashboard" page end to end — sidebar
navigation, KPI counts, and both compliance breakdowns rendered with exactly the expected numbers.
**No branch currently carries unmerged app features** — `claude/gate-5-startup-1ubxfh` was reset
to match `main` after the Gate 26 merge and has no commits of its own on top. Verify with
`git log origin/main..HEAD` before assuming this is still true by the time you read this.

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

### Document Control (Gates 14-26 = sub-spec gates 1-12) — the current frontier, one gate at a time

Aditya's Document Control spec has 14 gates total (Master Repository → Project Requirements →
Classification/Nomenclature → Status/Version Control → Schedule Due Dates → Vendor Register →
Schedule↔Document Linking → Schedule-Driven Dates/Lead Time → Vendor Lookahead → Readiness/
Constraints → Reminders/Notifications → Dashboards → Executive Summary → Portfolio Compliance).
**The first twelve are built** (plus Gate 18, an unnumbered UX fix between sub-spec gates 4 and 5).
Each was scoped in a short paragraph, confirmed by Aditya ("yes, build Gate N as scoped"), then
built — that back-and-forth pattern should continue for gate 13 onward, not be skipped.

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
- **Gate 18 — Document Control UX Refinement (not a numbered spec gate — direct user feedback on
  Gate 14/15's shipped UX, fixed before starting Gate 5).** Aditya's feedback, verbatim: *"There
  is a issue the document types sits separately I wanted it to be part of project creation. Where
  I will select which documents are currently available and which I will required later on. Also
  there are only vendor related documents. There is no project creation related documents."*
  Confirmed scope via `AskUserQuestion` (three separate questions) before touching code, then:
  requirement selection moved from a separately-toggled Portfolio Details section into the
  Add/Edit Project form itself (`renderDocumentRequirementsField()`, operating on an uncommitted
  `uiState.formSelectedDocTypeIds` array reconciled into `project_document_requirements`
  atomically with the project record on Save); "Available"/"Required" became a **computed** status
  (`computeRequirementAvailability()` — does a document with a matching `document_type_id` exist
  for this project? — never stored); ten project-setup-flavored types added to the master
  repository (`PROJECT_SETUP_TYPE_SEED` in `store.js` — Project Charter, Kickoff Checklist,
  Statutory/Regulatory Approvals, Land/Site Handover, Insurance Documents, Permits & Licenses,
  Project Organization Chart, Communication Plan, Project Execution Plan, Project Quality Plan)
  alongside the original vendor/execution-submittal-heavy seed list, seeded fresh and backfilled
  on upgrade with dedup-by-name. Portfolio Details' section is now read-only (status summary +
  an "Edit Requirements" button into the form), not a second live-editing surface for the same
  data.
- **Gate 19 — Document Control 5: Schedule Due Dates (this session).** Scoped in a short
  paragraph, confirmed via `AskUserQuestion`, then built exactly that and nothing more — the
  sub-spec splits due dates (gate 5), schedule↔document *linking* (gate 7), and lead-time
  calculation off that link (gate 8) into three separate gates; this is due dates only, manual,
  no schedule link. `project_document_requirements` gained `planned_submission_date` (optional
  date string, `null` default). `computeRequirementStatus()` returns `available`/`overdue`/
  `required` — `overdue` when no matching document exists yet and the date has passed — same
  "computed at render time, never stored" pattern as Gate 18's availability. The Add/Edit Project
  form's requirement checklist grows a date input per checked type (mirrored in a new
  `uiState.formDueDates` map, seeded at the same three button-click moments
  `formSelectedDocTypeIds` already was); the read-only Details summary shows the due date inline
  and an overdue count in the section header, only when nonzero.
- **Gate 20 — Document Control 6: Vendor Register (this session, follow-up round on the same
  branch).** Scoped and confirmed via `AskUserQuestion`, flagging up front that this app already
  has a full Vendor Management module (Gate 13) unrelated to this sub-spec, so "Vendor Register"
  could have meant a competing vendor list. Confirmed as: reuse the existing `vendors`, don't
  invent a second one. `project_document_requirements` gained `vendor_id` (optional, `""`
  default) — which existing Vendor Management vendor is expected to submit this document. The
  form's checklist grows a `<select>` of `data.vendors` next to Gate 19's date input, mirrored in
  a new `uiState.formVendorIds` map with the same seeded-at-button-click/uncommitted-until-Save
  treatment; the read-only Details summary appends the assigned vendor's name inline. Nothing
  reads or acts on the assignment yet — that's gate 9 (Vendor Lookahead), not this gate.
- **Gate 21 — Document Control 7: Schedule↔Document Linking (this session, on the restarted
  branch after Gates 19-20 merged).** Scoped and confirmed via `AskUserQuestion`. A requirement
  can now link to one of the project's own Schedule `activities` (`project_document_requirements`
  gained `activity_id`, optional, `""` default) — purely a link, deliberately reading/writing
  nothing else: no date is derived from it in either direction (that's gate 8's job). New
  `activityOptionsFor()` helper (same shape as `documents.js`/`risks.js`'s own Gate 10 version,
  duplicated per this app's per-module-helpers convention) populates a "Linked Activity" select
  next to Gate 20's vendor select, mirrored in `uiState.formActivityIds` with the same
  seeded-at-button-click/uncommitted-until-Save treatment; the read-only Details summary appends
  `"<schedule name>: <activity name>"` inline. Picked up a test-scoping gotcha worth remembering:
  once more than one project card is expanded/collapsed across a test file's checks, a plain
  "find the button labeled 'Details'" can silently target the wrong card (an already-expanded
  card reads "Hide Details," so a stale assumption about which state a card is in clicks nothing,
  or worse, clicks the wrong card) — fixed with an `ensureCardExpanded()` helper that checks
  state first rather than assuming it.
- **Gate 22 — Document Control 8: Schedule-Driven Dates/Lead Time (this session, on a branch
  freshly restarted from `main` after Gate 21 merged).** Scoped and confirmed. Builds on Gate 21's
  `activity_id`: `project_document_requirements` gained `lead_time_days` (optional, `null`
  default) — combined with the linked activity's start date (new `activityStartDate()` helper,
  applying this app's standing calculated-wins-over-planned date precedence), it produces a
  *suggested* due date via new `computeSuggestedDueDate()`. The suggestion is purely advisory —
  never auto-applied. The form's checklist grows a lead-time number input next to Gate 21's
  activity select, mirrored in `uiState.formLeadTimes`; when a suggestion is computable and
  differs from the current due date, a `"Suggested: <date>"` note with a **"Use"** button appears
  — one explicit click copies it into the due-date field, and the note disappears once applied.
  New day-math helpers (`toDayNumber`/`toIsoDate`/`addDays`) duplicate `scheduleGanttLayout.js`'s
  own versions, per this app's per-module-helpers convention. Read-only Details summary appends
  `"(Nd lead time)"` after the linked activity's name.
- **Gate 23 — Document Control 9: Vendor Lookahead (this session, on a branch freshly restarted
  from `main` after Gate 22 merged).** Scoped and confirmed — flagged up front, same as Gate 20
  was, that this app already has a full Vendor Management module (Gate 13) with its own 9-tab
  Vendor Profile, so "Vendor Lookahead" means a new tab there, not a new page/register. A 10th
  tab, **"Document Lookahead,"** on `pages/vendors.js`'s existing profile: pure read-only
  aggregation, no schema changes. New `renderLookaheadTab()` lists every
  `project_document_requirements` row with a matching `vendor_id` across ALL of that vendor's
  projects (deliberately not scoped to `vendor_project_links` — the requirement assignment itself
  is the source of truth for what's expected), sorted soonest-due-first (no-due-date rows sort
  last), each showing document type, project name, due date, a computed Available/Overdue/Required
  badge (`computeRequirementStatus()`, same logic as `portfolio.js`'s own, duplicated per
  convention), and the linked Schedule activity + lead time when set. A summary line at top:
  total assigned, project count, overdue count (only when nonzero). Empty state points back to
  where assignment actually happens (Portfolio's Add/Edit Project form).
- **Gate 24 — Document Control 10: Readiness/Constraints (this session, on a branch freshly
  restarted from `main` after Gate 23 merged).** Scoped and confirmed — Gantt-bar visual overlay
  was raised as an option and explicitly deferred to a later Dashboards-style gate; this gate
  stayed to the existing Activity Detail Panel (`pages/schedule.js`). Reads Gate 21's `activity_id`
  link **in reverse**: a new "Document Readiness" section (right after the existing Linked Records
  section) lists every `project_document_requirements` row naming this activity, with a computed
  Available/Overdue/Required badge per row (`computeRequirementStatus()`, same logic duplicated a
  third time now — `portfolio.js`, `vendors.js`, `schedule.js`) and an overall READY/NOT READY
  summary line — NOT READY the moment even one linked requirement isn't yet Available, regardless
  of how many others are. Purely informational: the Edit button and everything else on the
  activity stays fully usable regardless of readiness, matching this app's "no workflow-blocking
  anywhere" pattern (Gate 17's document status is a plain select, not a gate, either). No schema
  changes.
- **Gate 25 — Document Control 11: Reminders/Notifications (this session, on a branch freshly
  restarted from `main` after Gate 24 merged).** Scoped and confirmed — this app is a single
  offline `file://` deliverable with no server and no channel for real push/email, so the
  Dashboard (the first thing seen on open) is the deliberate in-app equivalent. New
  `computeReminders()` in `pages/dashboard.js`: every `project_document_requirements` row, across
  ALL active projects, that's Overdue OR Required with a due date inside the next 14 days
  (`DUE_SOON_WINDOW_DAYS`, currently hardcoded); Available rows and rows with no due date never
  surface. `computeRequirementStatus()` duplicated a fourth time now (`portfolio.js`,
  `vendors.js`, `schedule.js`, `dashboard.js`). A single ascending date sort already puts every
  Overdue row (a past date) ahead of every Due Soon row — no separate grouping needed. New
  "Document Reminders" panel (type, project, due date, vendor if assigned, status badge, "View
  Project") plus two new KPI cards ("Overdue Docs", "Due Soon (14d)"). New tiny public API,
  `window.PCC.portfolio.viewProject(projectId)`, so "View Project" lands on Portfolio with that
  project's Details expanded — same pattern `executiveCenter.js`'s own `viewProject()` already
  established. No schema changes.
- **Gate 26 — Document Control 12: Dashboards (this session, on a branch freshly restarted from
  `main` after Gate 25 merged).** Scoped and confirmed — deliberately distinct from Gate 25's
  time-sensitive reminders panel and from the later Executive Summary (narrative text) / Portfolio
  Compliance (rollup/report) gates; this one is charts/tables only. New page,
  `pages/documentControlDashboard.js` (registered in `app.js`, added to the sidebar under
  REGISTERS next to Document Types in `layout.js`, added to `build.js`'s `JS_ORDER`): overall
  Available/Required/Overdue KPIs across every active project's requirements, plus **worst-
  compliance-first** breakdowns by project and by document type (new `groupCompliance()` helper —
  groups, computes % Available, sorts ascending on that %, ties broken by highest overdue count).
  `computeRequirementStatus()` duplicated a fifth time now (`portfolio.js`, `vendors.js`,
  `schedule.js`, `dashboard.js`, `documentControlDashboard.js`). Each project row reuses Gate 25's
  `window.PCC.portfolio.viewProject()` hook for a "View Project" button. Purely computed,
  read-only, no schema changes.

**Deliberately still open / explicitly deferred, don't assume these got done:**
- Reconciling Documents' `category` / Vendor's `VENDOR_DOCUMENT_CATEGORIES` / the Gate 14 master
  repository into one classification scheme (deferred at both Gate 14 and Gate 16).
- Document Control gates 13-14: executive summary (gate 13), portfolio compliance rollups
  (gate 14). Gates 5 through 12 (manual due dates, vendor assignment, schedule link, lead time,
  vendor lookahead, readiness, reminders, and the compliance dashboard) are now all done — see
  Gates 19/20/21/22/23/24/25/26 above; everything from gate 13 on is still unstarted.
- A Gantt-bar-level visual flag for "not ready" activities — considered at Gate 24, deliberately
  deferred as a bigger lift than that gate's own scope; the readiness signal today only surfaces
  inside the Activity Detail Panel.
- The Document Reminders panel's 14-day due-soon window (`DUE_SOON_WINDOW_DAYS` in
  `dashboard.js`) is hardcoded, not user-configurable — noted as a possible follow-up, not done at
  Gate 25.
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
- **"Computed at render time, never denormalized" extends beyond version history**: Gate 18's
  `computeRequirementAvailability()` (does a matching document exist for this project+type?)
  follows the exact same shape Gate 13/17 established for "latest revision" — no new stored field,
  recomputed from existing data on every render. Reach for this pattern before adding a stored
  status flag anywhere a value can be derived instead.
- **Uncommitted per-form working state must be initialized at the button-click moment the form
  opens, never inside `render()`/`renderForm()` itself** (Gate 18): `render()` rebuilds a fresh
  placeholder object on every rerender, so any temp array/flag tied to an open form (like Gate 18's
  `uiState.formSelectedDocTypeIds`) has to be seeded once by the "+ Add"/"Edit" button handler —
  seeding it inside the render path would wipe out a user's in-progress checkbox toggles on their
  next keystroke-triggered rerender.
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
  (`tests/test_store_schema_v33_migration.js` as of this handoff) — when you bump
  `SCHEMA_VERSION`, `git mv` it to the new version number and fold in new assertions, rather than
  keeping old version-specific files around. Also remember to update the filename inside
  `tests/package.json`'s `test` script — it's not derived automatically and a stale reference
  there fails `npm test` with a bare `MODULE_NOT_FOUND` even though every individual test file is
  fine (hit this exact thing shipping Gate 19; fixed by editing `tests/package.json` alongside the
  `git mv`).
- Testing: `cd tests && npm test` must pass before anything ships (27 files, 571 checks as of
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

`main` is fully up to date through **Gate 26** (`a51322d`, a direct merge — no PR, per Aditya's
now-standing "always merge after completing a gate/phase" instruction, see above).
`schema_version` on `main` is **33**. `claude/gate-5-startup-1ubxfh` was reset to match this `main`
immediately after the merge and carries no commits of its own on top — it's the correct starting
point for the next gate, no restart needed before you begin. No branch carries unmerged app
features. Verify with `git log origin/main..claude/gate-5-startup-1ubxfh` and `git status` before
assuming this is still true by the time you read this.

**Zip delivered this round:** `Project-Control-Center.zip` — `index.html` + `README.md` +
`data/`/`files/` (existing `README.txt` placeholders), verified via a fresh extraction opened in
real Chromium (title and `#page-outlet` render, zero console errors).

**Next steps, in likely priority order:**
1. Ask Aditya whether Document Control Gate 13 (Executive Summary) is next — narrative
   document-control status text, likely following Gate 9's own Executive-Summary-override pattern
   — do not assume and start building without the explicit "yes, build Gate N as scoped"
   confirmation this project has consistently required so far.
2. Optional cleanup: these branches on `origin` are all fully merged into `main` and safe to
   delete (not urgent) — `integration/gates-8-13`, `claude/phase-11c-planning-executive-frty7j`,
   `claude/excel-schedule-pcc-editing-dgyy9m`, `claude/doc-control-gate14-master-repo`,
   `claude/doc-control-gate15-project-requirements`,
   `claude/doc-control-gate16-classification-nomenclature`,
   `claude/doc-control-gate17-status-version-control`. `claude/project-setup-tooling-gcwsu3`
   also still exists on origin — verify it's merged before deleting it, since this handoff round
   didn't touch it.
3. Tier 3 (AI Document Processing, Knowledge Base, AI Project Assistant, Lessons Learned, final
   polish) remains deferred until Tier 1/2 are in daily use.
