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
- **Document Control was a separate 14-gate sub-spec built incrementally, one confirmed gate at
  a time — it is now COMPLETE as of Gate 28.** Aditya provided the full spec up front but was
  explicit that it must NOT be built all at once — inspect current state, propose the next
  gate's scope in a short paragraph, wait for "yes, build it," then build exactly that and stop.
  All 14 gates are done (see below). There is no gate 15 to jump ahead to — any further Document
  Control work is new scope, not a continuation of this sub-spec, and should be treated (and
  confirmed) as such.
- **A new, separate "PCC Evolution Roadmap" started 2026-08-19 (Gate 29 = its own Gate 1).**
  Aditya handed over a large roadmap document (Tiers A-F, ~26 more gates) to evolve PCC from a
  set of registers into a connected "project control centre." Its own explicit gate discipline
  (independent of, but consistent with, the rules above): **inspect the actual codebase first,
  never assume a module exists just because the roadmap describes it, propose one gate's scope,
  wait for confirmation, build exactly that, test, report, then STOP for approval before starting
  the next gate** — do not chain gates automatically the way the Document Control sub-spec's
  later gates sometimes did back-to-back in one session. See the "PCC Evolution Roadmap" section
  below for the inspection findings and Gate 29 detail.
- **Always send Aditya photos (real-Chromium screenshots) during testing, for every future gate
  — standing instruction as of the Gate 29 close-out round.** Not just a JSON pass/fail from a
  Playwright script: actually call `page.screenshot()` at meaningful states (empty state,
  populated state, and again on the zip-verification pass) and send the PNGs via `SendUserFile`
  before or alongside the written report. Applies to every gate from here on, not just this one.

## Where things stand — everything through Gate 29 is merged into `main`

`main` is fully up to date through **Gate 29** (PCC Evolution Roadmap gate 1 of ~27: Planner
Action Centre), merge commit `005dbd2`, `schema_version` **34** (unchanged — Gate 29 added no
schema fields, everything computed at render time from existing data). This session built and
merged Gate 29 on its own, following the same rebuild → full suite → merge (no PR, standing
instruction, see above) → push `main` → restart `claude/gate-5-startup-1ubxfh` from the new
`main` sequence used for every prior gate. The full test suite (**29 files, 630 checks**) passes
clean, and a real-Chromium pass (with screenshots, per the new standing instruction above)
confirmed the new Planner Action Centre page end to end — bucket assignment, KPI counts, View
navigation into Meetings/RFI/Change Orders, zero JS errors. **No branch currently carries
unmerged app features** — `claude/gate-5-startup-1ubxfh` was reset to match `main` after the
Gate 29 merge and has no commits of its own on top. Verify with `git log origin/main..HEAD`
before assuming this is still true by the time you read this.

**The entire 14-gate Document Control sub-spec Aditya originally handed over is complete (Gates
14-28)** — Master Repository, Project Requirements, Classification/Nomenclature, Status/Version
Control, Schedule Due Dates, Vendor Register, Schedule↔Document Linking, Schedule-Driven
Dates/Lead Time, Vendor Lookahead, Readiness/Constraints, Reminders/Notifications, Dashboards,
Executive Summary, and Portfolio Compliance. **A new, separate PCC Evolution Roadmap started
with Gate 29** (see its own section below) — only its first gate (Planner Action Centre) is
done; ~26 more gates remain in that roadmap, none started, none scoped yet.

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

### Document Control (Gates 14-28 = sub-spec gates 1-14) — COMPLETE

Aditya's Document Control spec had 14 gates total (Master Repository → Project Requirements →
Classification/Nomenclature → Status/Version Control → Schedule Due Dates → Vendor Register →
Schedule↔Document Linking → Schedule-Driven Dates/Lead Time → Vendor Lookahead → Readiness/
Constraints → Reminders/Notifications → Dashboards → Executive Summary → Portfolio Compliance).
**All 14 are now built** (plus Gate 18, an unnumbered UX fix between sub-spec gates 4 and 5). Each
was scoped in a short paragraph, confirmed by Aditya ("yes, build Gate N as scoped"), then built —
that back-and-forth pattern held for all 14 gates through to the last one.

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
- **Gate 27 — Document Control 13: Executive Summary (this session, on a branch freshly restarted
  from `main` after Gate 26 merged).** Scoped and confirmed — deliberately reused Gate 9's proven
  "auto-generated text + optional saved override" pattern verbatim rather than inventing a new
  one. `executive_summaries` gained a sixth field, `document_control_override` (schema v33→v34).
  `buildProjectContext()` in `executiveCenter.js` gained a small block computing that project's own
  document requirement counts (total/Available/Overdue + overdue type names) —
  `computeRequirementStatus()` duplicated a sixth time now (`portfolio.js`, `vendors.js`,
  `schedule.js`, `dashboard.js`, `documentControlDashboard.js`, `executiveCenter.js`). New
  `autoDocumentControlText(ctx)` and a "Document Control Status" entry appended to
  `SUMMARY_SECTIONS` — since the Executive Summary panel, Project Snapshot, and Management Pack
  print views all already iterate that array generically (no hardcoded section count anywhere),
  the new section flowed into all three automatically, verified by an explicit e2e check rather
  than assumed. No changes needed to the panel/snapshot/pack rendering code itself.
- **Gate 28 — Document Control 14: Portfolio Compliance (this session, on a branch freshly
  restarted from `main` after Gate 27 merged) — the FINAL gate of the 14-gate sub-spec.** Scoped
  and confirmed via `AskUserQuestion` — resolved as extending the existing printable Portfolio
  Summary Report (`reports.js`, `buildPortfolioReport()`) with a new "Document Control
  Compliance" section, rather than a new page. Portfolio-wide Available/Required/Overdue KPIs
  plus a per-project compliance table sorted worst-compliance-first (reusing the same
  worst-first idea Gate 26's `groupCompliance()` established, though this section computes its
  own since it lives in a different file), excluding archived projects. No schema changes,
  nothing written back — a pure read-only report section, verified by an explicit "requirement
  rows unchanged after rendering" e2e check. Also the **first-ever dedicated test file for
  `reports.js`** (`test_reports_document_control_e2e.js`, 26 checks) — no test file had covered
  that module before this gate. Hit one test-scoping gotcha worth remembering: `reports.js` keeps
  a `display:none` (but still-in-DOM) project-status `<select>` listing every project including
  archived ones at all times, so a whole-page `textContent` search for "the archived project must
  never appear" false-positived on that hidden dropdown's own option text; fixed by scoping
  assertions to the new section's own subtree via a `docControlSection()` helper (finds the
  "Document Control Compliance" `<h3>`, returns its `parentElement`) instead of searching the
  whole page.

### PCC Evolution Roadmap (Gate 29 = roadmap's own Gate 1) — 1 of ~27 gates done

Aditya handed over a large roadmap (Tiers A-F: Daily Planner Value, Control Integration, Project
Performance, Management, Portfolio, then Tier F's advanced planning/controls gates — Resource
Management, Commitment Management, Status-Date Control, Reforecasting, Baseline/Revision Control,
Advanced Delay Analysis, Recovery Planning, Schedule Performance) to evolve PCC from a set of
registers into a connected "project control centre." Before building anything, this session ran a
full inspection against that roadmap and found a lot of it **already exists**: Gate 9 (Executive
Center) already gives a transparent, rule-based project health score + diagnostics — most of the
roadmap's "Project Health / Management Attention" ask; Gate 10 (Activity Linking) already links
Schedule activities bidirectionally to Risks, RFIs, Meetings, Documents, Daily Logs, and Change
Orders — the roadmap's "Schedule → Activity relationships" and "Activity → Risk/Issue/RFI
relationships" gates; Gate 11 is already portfolio-wide Resource Management — the roadmap's own
Tier F Gate 18. Genuinely missing and confirmed as the roadmap's real Gate 1: nothing in PCC
aggregated actionable items with due dates across modules into one "what do I need to do today"
view — that became the Planner Action Centre.

- **Gate 29 — Planner Action Centre.** New page, `pages/actionCentre.js`, sidebar entry in
  OVERVIEW right after Dashboard. Aggregates Meeting Actions (`due_date`, `status: open`), RFI/TQ
  (`date_required`, `status: open` only), and Document Requirements (reusing the Available/
  Overdue/Required computation every Document Control gate since Gate 18 has used — the eighth
  independent copy now) into five buckets: **Overdue** (< today), **Due Today**, **Due This
  Week** (≤ 7 days), **Upcoming** (8-30 days, hardcoded window), and a dateless **Waiting For**
  bucket that also holds Change Orders with `status: pending` (that record has no due-date field
  at all). Each row has a **View** button reusing existing navigation hooks —
  `window.PCC.meetings.expandMeeting()`, `window.PCC.rfis.expandRfi()`,
  `window.PCC.changeOrders.expandChangeOrder()`, `window.PCC.portfolio.viewProject()` — no new
  public API needed. Risks/Issues deliberately excluded: no due-date field exists on that record
  in the schema, so including them would mean fabricating data. No schema change at all —
  `schema_version` stays 34. New test file `test_action_centre_e2e.js` (35 checks) covers every
  bucket boundary explicitly (day 7 vs. day 8, day 30 vs. day 31 falling outside every bucket).

**Next roadmap gate: not yet scoped.** Two candidates raised so far, neither confirmed: (1) a
consolidated **Project Lookahead** (7/14/30/60-day view spanning Schedule, Vendors, Documents,
RFIs, Meetings — a natural extension of Gate 29's `bucketFor()`/`collectItems()` pattern), or (2)
surfacing Gate 9's *existing* health-score/diagnostics engine as a **Management Attention** strip
on the Dashboard (near-zero new code — reuse, don't rebuild). Per the roadmap's own gate
discipline, propose one, get "yes, build it," then build only that.

**Deliberately still open / explicitly deferred, don't assume these got done:**
- Reconciling Documents' `category` / Vendor's `VENDOR_DOCUMENT_CATEGORIES` / the Gate 14 master
  repository into one classification scheme (deferred at both Gate 14 and Gate 16).
- A Gantt-bar-level visual flag for "not ready" activities — considered at Gate 24, deliberately
  deferred as a bigger lift than that gate's own scope; the readiness signal today only surfaces
  inside the Activity Detail Panel.
- The Document Reminders panel's 14-day due-soon window (`DUE_SOON_WINDOW_DAYS` in
  `dashboard.js`) and the Action Centre's 30-day upcoming window (`UPCOMING_WINDOW_DAYS` in
  `actionCentre.js`) are both hardcoded, not user-configurable — noted as a possible follow-up.
- Rate × usage from Resource Management feeding Cost Tracking/EVM (deferred at Gate 11).
- Portfolio-level executive dashboard filtering by client/country/sector/PM/date range.
- Every other gate in the PCC Evolution Roadmap beyond Gate 29 — ~26 gates, none started. See
  the roadmap section above for the two candidates raised for the actual next gate.

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
  (`tests/test_store_schema_v34_migration.js` as of this handoff) — when you bump
  `SCHEMA_VERSION`, `git mv` it to the new version number and fold in new assertions, rather than
  keeping old version-specific files around. Also remember to update the filename inside
  `tests/package.json`'s `test` script — it's not derived automatically and a stale reference
  there fails `npm test` with a bare `MODULE_NOT_FOUND` even though every individual test file is
  fine (hit this exact thing shipping Gate 19; fixed by editing `tests/package.json` alongside the
  `git mv`).
- Testing: `cd tests && npm test` must pass before anything ships (29 files, 630 checks as of
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

`main` is fully up to date through **Gate 29** (`005dbd2`, a direct merge — no PR, per Aditya's
now-standing "always merge after completing a gate/phase" instruction, see above). This is the
first gate of the new PCC Evolution Roadmap, built on top of the already-complete 14-gate
Document Control sub-spec. `schema_version` on `main` is **34**. `claude/gate-5-startup-1ubxfh`
was reset to match this `main` immediately after the merge and carries no commits of its own on
top — it's the correct starting point for whatever comes next, no restart needed before you
begin. No branch carries unmerged app features. Verify with
`git log origin/main..claude/gate-5-startup-1ubxfh` and `git status` before assuming this is still
true by the time you read this.

**Zip delivered this round:** `Project-Control-Center.zip` — `index.html` + `README.md` +
`data/`/`files/` (existing `README.txt` placeholders), verified via a fresh extraction opened in
real Chromium (title and `#page-outlet` render, Action Centre navigable, zero console errors;
screenshots taken and sent per the new standing instruction).

**Next steps, in likely priority order:**
1. **PCC Evolution Roadmap Gate 2 is not yet scoped — ask Aditya before building anything.** The
   two strongest candidates from this session's own inspection are (a) a consolidated Project
   Lookahead (7/14/30/60-day view) or (b) surfacing Gate 9's existing health-score/diagnostics
   engine as a Management Attention strip on the Dashboard. Do not start either without the
   explicit "yes, build X as scoped" confirmation this project has consistently required.
2. Older still-open items, none blocking daily use: category-scheme reconciliation
   (Documents/Vendor/Document-Types), the Gantt-bar readiness flag, the two hardcoded reminder
   windows (14-day Document Reminders, 30-day Action Centre Upcoming), Resource Management rate ×
   usage into Cost/EVM, portfolio dashboard filtering.
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
