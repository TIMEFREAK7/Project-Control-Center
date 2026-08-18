# Aditya Abhyankar's Project Control Center

Project Planning, Controls & Portfolio Management System — for one person, fully local, fully portable.

## Open this: `index.html`

That one file is the entire app — HTML, CSS, fonts, and all JavaScript bundled inside it, nothing
external. Double-click it, it opens in your browser. No install, no cmd, no login, no server.

### Why it's bundled into one file (not several, like the first version)

The first version split things into `css/styles.css`, several `js/*.js` files, and font files, all
loaded by reference from `index.html`. That works fine on a laptop's `file://` browsing, but it broke on
Android: when you open a file from a phone's file manager, Android hands the browser a `content://`
reference instead of a real `file://` path (this has been true since Android 7, for security reasons),
and a `content://` reference has no real folder behind it — so every one of those relative file loads
silently failed, leaving a blank white screen. Bundling everything into one file removes the problem at
the root: there's nothing relative left to fail to load.

## How your data works

- Everything autosaves instantly to your browser's local storage as you work — no save button needed
  for normal use.
- To move to another laptop/desktop, or back up before a job/project change: click the **export icon**
  in the header (or Settings → Export data file). This downloads one file,
  `project-data-YYYY-MM-DD.json`, containing everything — move it into the `/data` folder here.
- On the new machine: open `index.html`, click the **import icon**, and pick that file.
- Copy the whole `project-control-center` folder (pen drive, external drive, cloud sync) and it works
  anywhere — no install, nothing to configure.

**One real limitation, worth knowing rather than discovering later:** browsers block pages opened via
`file://` (or `content://` on Android) from silently reading/writing arbitrary files on disk. That's why
export/import is a manual two-click step instead of invisible autosave-to-one-file — there's no way
around that without running a local server, which is exactly what you asked to avoid. Autosave-to-
browser-storage is instant and automatic; the file is what carries your data between machines.

## Documents (contracts, drawings, photos)

Built (see below) — upload Excel/Word/PDF, get the data extracted, and the original file itself is
stored with the record. No `/files` folder needed anymore; everything travels in the one exported JSON.

## Design direction

Industrial / engineering-drawing identity: blueprint navy + graphite in dark mode, cool light paper in
light mode, a single signal-amber accent, Space Grotesk / Inter / IBM Plex Mono type (embedded directly
in the file as base64 — no CDN, works with no internet connection at all), and a title-block header
styled like a technical drawing's title block (sheet name, company, date).

## What's built (Phase 1 — Foundation, Phase 2 — Portfolio, Phase 3 — Documents, Phase 4 — Daily Log,
Phase 5 — Risk Register, Phase 6 — Meetings, Phase 7 — RFI / Technical Query Management,
Phase 8 — Change Management, Phase 9 — Basic Reporting, Phase 10 — Backup & Recovery,
Phase 11 — Photos on Daily Log, Phase 12 — Blobs-only IndexedDB migration — Tier 1 complete)

**Project assignment is mandatory everywhere it applies** (Documents, Daily Log, Risk Register) — no
"Unassigned" option anywhere anymore. Started as a Risk Register fix, then applied consistently across
every module rather than left as a one-off, since an entry with nowhere to surface defeats the point of
a tracker.

- App shell: sidebar, title-block header, footer
- Light/dark theme, persisted
- Toast notification system
- Hash-based routing (`#/dashboard`, `#/settings`, etc. — necessary since there's no server for real
  path-based routing under `file://`)
- Data layer: single JS object → localStorage autosave → export/import to one JSON file, with schema
  migration so older exported files upgrade cleanly (now at schema v4)
- Settings page: company name, data export/import/reset
- **Portfolio**: full project CRUD — add, edit, archive/unarchive, search, filter by status, all 19
  spec'd fields, plus an expandable Details panel per project showing every field
- Dashboard shows real portfolio health (active/on-track/at-risk/critical counts) and a recent projects
  list
- **Documents**: upload a document, attach it to a project (or leave unassigned), categorize it. All
  three formats extract client-side, no internet needed:
  - **Excel** (.xlsx/.xls) — SheetJS reads the sheet, previewed as a table, saved as structured rows
  - **Word** (.docx) — mammoth.js extracts the raw text
  - **PDF** — pdf.js extracts text per page (won't work on scanned/image-only PDFs — no text layer to
    read; that would need OCR, a different and heavier problem)
  - **The original file itself is stored**, not just referenced — as a base64 data URI alongside the
    extracted data, in the same JSON that autosaves and exports. An **Open File** button on every
    document reconstructs and opens/downloads the exact original (PDFs render inline in a new tab;
    Word/Excel typically download, since browsers don't render those natively — normal, not a bug)
  - Saved documents have a **View/Hide** toggle to see the extracted data/text again later
  - **Delete** removes a document, its stored file, and its extracted data — with a
    confirmation prompt, matching every other register's delete pattern. Also cleans up
    the id from the parent project's `attachments` array so nothing goes stale.
  - **Portfolio's Details panel** lists a project's attached documents with their own Open File buttons,
    so you can see and open what's attached without leaving the project view
  - **Export Archive**: one click (per project, from its Details panel, or "Export Document Archive" in
    Settings for everything at once) downloads a real `.zip` with a folder per project, containing the
    actual attached files — unzip it onto your pen drive for a browsable, organized document archive
    outside the app, or as a growing portfolio over time
- **Daily Log**: one entry per project per day — weather, manpower, equipment on site, visitors,
  deliveries, activities, safety notes, incidents, general notes. Incident badge on the card so you can
  scan for days with problems without opening each entry. Search across activities/notes/weather, filter
  by project, edit, delete. **Photos aren't attached here yet** — deferred rather than rushed; when
  added it'll reuse the same file-storage pattern already built and tested for Documents.
- **Risk Register**: unified Risk / Issue / Opportunity register (one shape, distinguished by type,
  rather than three near-identical modules). Probability × impact **heat map** using the standard 3×3
  risk matrix — click a cell to filter the list to that combination. Severity (Low/Medium/High) is
  derived automatically from probability and impact, not entered by hand. Owner, mitigation/response,
  status (Open/Mitigating/Closed — closed items hidden by default so the working list stays relevant),
  search, filter by type/status/project. **Project assignment is required**, not optional — an
  unassigned entry has nowhere to surface and defeats the point of a tracker; this was flagged after the
  first version shipped with an "Unassigned" option, matching Documents' pattern, which didn't fit here.
  Portfolio's Details panel shows a project's open risks/issues (closed ones excluded there on purpose)
  with a working View All link.
- **Meetings is now a hub for the modules that already exist.** "+ Add Risk / Issue / Opportunity" and
  "+ Attach Document" buttons in a meeting's Details panel jump to Risk Register / Documents with the
  project and meeting already pre-linked — no re-selecting anything. Both relationships are
  bidirectional: a risk raised in a meeting shows "Raised in meeting: [title]" with a link back; a
  document attached from a meeting shows "From meeting: [title]" the same way; the meeting itself lists
  everything raised or attached from it. **Recordings are reference-only, by deliberate choice**: the
  app tracks filename/duration/uploaded-by, but never embeds the actual audio/video file — a single MP3
  can be several MB and an MP4 can be hundreds, which would blow past the entire ~5-10MB browser storage
  budget on its own. The real recording file has to be placed in `/files` manually, same as any file
  the app doesn't store. **Not yet wired in:** "Add RFI," "Add Technical Query," and "Add Change
  Request" — those modules don't exist yet. The plan is to build the meeting-link into each one as it's
  built (RFI/TQ next), not stub out links to nothing now.
- **Meetings**: minutes, agenda, attendees, and a dynamic **action items** list per meeting — each with
  its own owner, due date, and status. **Overdue is computed automatically** at render time (open +
  past due date), never stored as a stale flag, so it's always correct relative to today. An "Overdue
  Action Items" panel at the top of the page aggregates every overdue item across all meetings and
  projects, sorted soonest-first. Portfolio's Details panel shows a project's meetings with an overdue
  count badge, and a working View All link — built in from the start, same as Risk Register.
  **Portfolio's Details panel now also shows a project's Daily Logs** (date + incident status, up to 5
  most recent, "View All" jumps to Daily Log pre-filtered to that project) — added after the first
  version shipped without it and that gap was reported, same as Attachments getting added earlier.
- **RFI / Technical Query Management**: a unified register (schema v10) — one shape distinguished by
  `type` (RFI / Technical Query), same "one shape, not two near-identical modules" pattern already
  established by Risk Register, rather than two separate CRUD screens for what's structurally the same
  workflow. Auto-numbered per type (`RFI-001`, `TQ-001`, ...) from the highest existing number of that
  type, so a deleted entry never causes a number to be reused. Workflow is **Open → Answered → Closed**;
  marking an entry Answered auto-stamps `date_answered` if it wasn't already set. Cost Impact and
  Schedule Impact are tracked as explicit yes/no flags per entry, common fields on real RFI logs.
  **Overdue is computed the same way Meetings does it** — open + past "Response Required By" date,
  derived at render time rather than stored, plus an aggregated "Overdue RFIs / Technical Queries" panel
  at the top of the page. **Revision history** is a separate append-only log per entry (date/author/note)
  distinct from the current Question/Response fields — the "what happened and when" thread underneath
  the current state, e.g. "sent to structural engineer for clarification," not a diff of field changes.
  **Project assignment is mandatory**, same as every other register. **Wired into the Meetings hub**,
  completing the cross-linking pattern started in Phase 6: a "+ Add RFI / Technical Query" quick action
  in a meeting's Details panel jumps to this module with project and meeting pre-linked; the relationship
  is bidirectional — an RFI raised in a meeting shows "Raised in meeting: [title]" with a working link
  back, and the meeting lists everything raised from it under "RFI / TQ RAISED." **Portfolio's Details
  panel** shows a project's open RFIs/TQs with overdue badges and a working View All link, matching the
  Risk Register and Meetings sections already there. A pre-existing cosmetic gap was also fixed in
  passing: `status-badge--info` (used by Risk Register's "Open" status badge since Phase 5) was
  referenced in code but never defined in `styles.css`, so open risks rendered with no badge color —
  fixed for both modules, not introduced by this phase.
- **Documents now has a Delete button** (was missing entirely through Phase 6/7 — reported after
  RFI/TQ shipped). Confirms before deleting, removes the stored file and extracted data, and cleans up
  the id from the parent project's `attachments` array. No schema change — pure UI/behavior fix.
- **Change Management** (schema v11): a Change Order register, deliberately kept as **a log only** — a
  project-owner decision made explicitly before building this phase, not a default. Cost Impact and
  Schedule Impact are tracked per entry for reference and reporting, but **never write back to a
  project's `contract_value` in Portfolio** — approving a Change Order here does not silently move
  budget numbers; that reconciliation stays a deliberate, separate act. Verified in testing: creating,
  editing, and approving Change Orders leaves `contract_value` untouched in every case. Workflow is
  **Pending → Approved / Rejected → Closed**; moving out of Pending auto-stamps `date_decided` if not
  already set. Auto-numbered `CO-001`, `CO-002`, ... using the same non-reuse-after-delete logic as
  RFI/TQ. Each entry has its own **Approval / Decision History** log (date/author/note), separate from
  Meetings/RFI's system — same pattern, own instance, since a Change Order's approval trail is a
  different thing from an RFI's Q&A trail even though both are append-only logs. **Project assignment
  is mandatory**, same as every other register.
  **Optional source links**, independent of each other: a Change Order can (but doesn't have to) point
  back to the RFI/TQ or Risk/Issue that triggered it, and separately can be raised directly from a
  Meeting. All three relationships are bidirectional, matching the pattern already established:
  - **RFI/TQ details** get a "+ Raise Change Order from this Entry" button; the created Change Order
    carries `source_rfi_id`; the RFI/TQ's own details then list it under "CHANGE ORDERS RAISED."
  - **Risk/Issue details** get the same, via `source_risk_id` and its own "CHANGE ORDERS RAISED" list —
    this also meant adding an `expandRisk()` export to `risks.js`, which didn't exist yet (Risk Register
    was the source of the meetings-hub pattern but had never itself been a link *target* before).
  - **Meetings' Details panel** gets a "+ Add Change Order" quick action alongside the existing Risk/
    Document/RFI ones, via `source_meeting_id`, and lists what a meeting raised under "CHANGE ORDERS
    RAISED" — completing the quick-action set the original spec sketched out for the Meetings hub.
  **Portfolio's Details panel** shows a project's open Change Orders (Pending/Approved, excluding
  Closed/Rejected) with status badges and a working View All link, matching every other register's
  section there.
- **Basic Reporting** — two report types, both decided before building rather than assumed:
  - **Project Status Report**: overview (status, progress, contract value, dates, PM) plus a live pull
    from every other module for the selected project — open Risks/Issues/Opportunities with severity,
    open RFI/TQs with overdue flagged, open Change Orders with their cost/schedule impact totaled,
    recent Meetings with open action-item counts, recent Daily Log entries with incidents called out,
    and a document count by category.
  - **Portfolio Summary Report**: every active project with status/progress/contract value, aggregate
    contract value, a status breakdown, and portfolio-wide open counts for Risks/Issues/Opportunities,
    RFI/TQs (with overdue), and Change Orders (with pending).
  - **Output is a printable HTML view, not a generated PDF file** — a project-owner decision made
    explicitly before building this phase: `window.print()` (browser's native Print / Save-as-PDF)
    rather than bundling a PDF-generation library, which would have added real weight to the single
    `index.html` file for something the browser already does. A new `@media print` stylesheet block
    hides the sidebar, title bar, footer, and the report's own toolbar when printing, and gives the
    report itself light, high-contrast, ink-friendly styling regardless of which theme (dark/light) was
    active on screen — a printed report should look the same on paper either way.
  - Both report types read live from the store — nothing is cached or snapshotted, so the report always
    reflects the data as of the moment you open Reports.
- **Backup & Recovery** (schema v12) — scoped from two real gaps found by reading the existing
  export/import code, not from a generic "backups are good" starting point: import had zero
  confirmation before overwriting all data, and a corrupted/unparseable localStorage value on load
  silently reset to empty with nothing but a console log. Both fixed, plus a proactive reminder:
  - **Import now confirms before overwriting.** Same pattern Reset All already used, extended to
    Import: a warning naming the file and stating this can't be undone, with a cancel path. Declining
    leaves existing data completely untouched — verified directly, not assumed.
  - **A corrupted load no longer silently destroys data.** If `JSON.parse` fails on the stored data,
    the raw unreadable string is immediately copied to its own separate localStorage key (never the
    key normal saves use, so a future autosave can never overwrite it) *before* anything else happens
    — recoverable regardless of what the person does next, including if they miss the banner entirely.
    A prominent banner appears that session with a one-click "Download Raw Backup," and every such
    snapshot — there can be more than one, one per corruption event — is also listed permanently under
    **Settings → Data Recovery** with its own Download/Delete, so the recovery path survives a missed
    or dismissed banner. Snapshots are never auto-pruned; only explicit deletion removes them.
  - **A recurring "time to back up" nudge** — a project-owner decision made explicitly before building
    this phase: active and dismissible, not passive, and dismissing snoozes rather than silences
    permanently (re-appears after another `backup_reminder_days`, default 7, configurable in Settings
    down to 0 to disable). Tracks `meta.last_exported_at`, stamped on every export. Re-evaluated on
    export, import, reset, and hourly for long-running sessions, so it can't show a stale day-count.
  - The pre-existing "Export data file" and "Export Document Archive" buttons, and Reset All, were
    left as they were apart from wiring the new nudge/confirmation logic through them — no unrelated
    behavior changed.
- **Photos on Daily Log** (schema v13) — the last Tier 1 item. Each Daily Log entry now has a `photos`
  array; each photo is stored as a base64 data URI in `file_data`, the same approach Documents already
  uses, not a reference to an external `/files` folder — no dependency introduced, survives the JSON
  export/import round trip byte-for-byte. Managed from a log entry's expanded Details panel rather than
  the Add/Edit form, matching how Risk/RFI/Change-Order revision logs already work in this codebase:
  each photo add or remove is its own direct `store.update()`, not staged form state that could be lost
  by cancelling. Multiple photos can be selected and added in one go; each gets an editable caption
  (saved independently per photo) and a thumbnail that links to the full-size image in a new tab.
  Removing a photo asks for confirmation, same as every other delete in this app. A soft warning (not a
  block, since storage size isn't a constraint here) appears if a photo is unusually large. The card
  view now shows a photo-count badge alongside the existing incident badge when a log entry has any.
  Deleting a log entry removes its photos with it automatically — they're nested inside the entry, not
  a separate array requiring cleanup, so there's no orphan-reference risk the way Documents' `file_data`
  needed the `attachments`-array fix for.
  - **Two bugs found on-device after this shipped, both fixed same-session**: (1) "view full size" used
    a raw `data:` URI as a link target, which Chrome (especially on Android) blocks as a top-level
    navigation for security — showed as `about:blank#blocked`. Fixed by reusing the `Blob` +
    `URL.createObjectURL()` pattern Documents' "Open File" already used correctly; photos never had a
    reason to do this differently. (2) `persistToLocalStorage()` was stamping `meta.last_saved_at` even
    when the write failed, so the exact moment autosave broke was also the moment Settings would have
    shown a fresh "just saved" timestamp — fixed to only stamp on confirmed success. Neither bug lost
    data: `data` in memory is only ever mutated by `store.update()`, never by the save attempt itself,
    so a failed autosave leaves the in-memory state intact — confirmed directly in testing, not assumed.
  - **The real problem underneath both bug reports**: two 1.8MB photos was enough to hit the browser's
    `localStorage` quota (commonly 5–10MB per origin, often less on mobile/WebView) and trigger the
    "could not autosave" error. This is a genuine ceiling that photos exposed sooner than Documents
    would have, not a bug — `localStorage` has no relationship to the device's actual free disk space.
    **Decided (Aditya, 2026-08-07): the correct fix is moving photo/document storage off `localStorage`
    onto IndexedDB** (much higher quota, no compression needed). Built same day — see Phase 12 below.

## Phase 12 — Blobs-only IndexedDB migration (2026-08-07)

Scoped explicitly before building, same as every architecture-level phase in this project: **blobs
only** move to IndexedDB (photo/document `file_data`), not the whole app. Every other module — Portfolio,
Risks, Meetings, RFI/TQ, Change Orders, Reports — is completely untouched and still fully synchronous
against `localStorage`; only code that actually touches a photo or document's file bytes needed to
become async-aware. Considered and rejected: migrating everything to IndexedDB, which would have meant
every module needing a startup loading state and re-verifying work already confirmed across 11 prior
phases, to solve a problem (file size) that only photos/documents actually have.

- **New `blobStore.js`**: a small Promise-based IndexedDB wrapper (`putBlob`, `getBlob`, `deleteBlob`,
  `listBlobIds`, and `resolve(id, inlineFileData)` — the dual-path lookup that lets old inline records
  and new IndexedDB-backed ones coexist without a blocking, all-or-nothing migration at startup).
- **Documents and Daily Log photos**: saving now writes the blob to IndexedDB *first*, and only commits
  the metadata record if that succeeds — deliberately, so a failed blob write can never leave a document
  or photo entry pointing at a file that doesn't actually exist anywhere. Deleting does the reverse:
  metadata removed first, blob delete is best-effort after (a failed blob delete just leaves an orphaned
  blob sitting harmlessly in IndexedDB, rather than blocking the delete the person actually asked for).
- **Export still produces one self-contained, portable JSON file**, per Aditya's explicit call — it
  gathers every blob from IndexedDB (or uses it inline for any not-yet-migrated legacy record) into a
  deep-cloned copy of the data, embeds them, and downloads that. The live in-memory/`localStorage` copy
  is never mutated by this — it stays blob-free throughout. Export and Import both became async as a
  result (blob reads/writes take a moment), so both export buttons now show a brief "Preparing…"/disabled
  state instead of assuming the old synchronous instant-download behavior.
- **Import** does the mirror operation: an imported file still carries blobs inline (that's what
  portability requires), so each one gets written to IndexedDB and nulled out of the record before being
  committed — otherwise import would immediately re-inflate `localStorage` right back to the size problem
  this phase exists to fix.
- **One-time legacy migration**, run automatically at startup (`app.js`, non-blocking — the app is fully
  usable immediately either way): finds any document/photo still carrying its file bytes inline from
  before this migration existed, writes each to IndexedDB, and nulls the field once that succeeds,
  shrinking what autosave has to write from then on. Verified idempotent — safe if it somehow ran twice.
- **No `localStorage`-vs-`IndexedDB` split risk left unhandled**: the corruption-recovery banner and
  Data Recovery panel from Phase 10 still operate correctly on the (now much smaller) primary JSON:
  worth knowing as a real, documented limitation, though — if `localStorage` itself gets corrupted, the
  *metadata* resets to empty via Phase 10's existing recovery path, while any blobs already sitting in
  IndexedDB become orphaned (referenced by nothing). The blobs aren't lost, but nothing in the UI
  currently surfaces "here are some orphaned files with no metadata" — that's a real gap, just an
  intentionally out-of-scope one for this phase, since blobs-only was chosen specifically to keep this
  change small and contained rather than solving every edge case in one pass.
- **Three real bugs found and fixed while building this, all the same class**: "Open File" in
  Documents, the equivalent buttons in Meetings' and Portfolio's linked-document lists, and the JSZip
  Document Archive export all either gated visibility on `doc.file_data` being truthy or read it
  directly — every one of which is now `null` by design for any document saved after this migration.
  Left as originally written, all three would have silently broken (a vanished "Open File" button, and
  documents silently missing from ZIP archives) for every single document or photo saved from this point
  forward. Caught and fixed in the same session, before delivery — not discovered after shipping.

## On document upload + data extraction

All three formats extract client-side, fully offline, **and** the original file is stored and can be
reopened exactly as uploaded — so nothing depends on the extraction being perfect; it's a convenience
layer on top of the real, unmodified file. What extraction still can't do: know that a particular number
in a contract *is* "the contract value" versus any other number. That kind of field-level understanding
needs an AI model and therefore internet access for that one feature specifically. Worth deciding
explicitly later if you want it; not built now.

**Storage tradeoff, worth understanding clearly:** storing full files means the browser's own storage
cap matters now, not just your pen drive's. `localStorage` typically caps around 5–10MB total per site
across all browsers — a handful of PDFs or Word docs can hit that well before your pen drive would ever
notice. The app warns you in the UI when a selected file is large, and already has handling for when
autosave fails due to storage limits (a toast telling you to export immediately). **Practical habit:**
export your data regularly once you're attaching real files — the exported JSON itself has no such
limit, only the live in-browser copy does.

## What's NOT built yet

**Tier 1 is complete**, including the IndexedDB migration (Phase 12) that resolves the storage-ceiling
issue found in real on-device testing. One known, documented, out-of-scope-by-design limitation remains:
if `localStorage` itself gets corrupted, Phase 10's existing recovery path restores the metadata to
empty, but any photo/document blobs already in IndexedDB at that point become orphaned (not lost, just
not currently surfaced anywhere in the UI). Tier 2 (Schedule/CPM, Cost/EVM, Resources) is next.

## On "just save files to a real folder per project automatically"

Not possible from a page opened locally — browsers block a webpage from creating folders or writing
files to arbitrary disk locations on its own, on every platform, for security reasons. The one API that
allows it (File System Access API) is desktop Chrome/Edge only — no Firefox, no Safari, **no Android or
iOS at all** — and generally needs the page served over `https://`, not opened as a file. Using it would
mean giving up either phone access or the no-server requirement, both of which were explicit asks. Export
Archive (above) is the realistic alternative: same organized-folder outcome, achieved through a normal
file download instead of direct disk access, and it works identically everywhere this app already does.

## Tested before delivery

- All source JS passes Node syntax checking
- A headless DOM test (jsdom) runs the actual bundled `index.html` end to end. Phases 1–6 were verified
  in earlier sessions (shell/nav/theme/settings; full Portfolio CRUD, Details panel, schema migration;
  Documents extraction/storage/archive; Daily Log; Risk Register heat map and CRUD; Meetings actions,
  overdue tracking, and the meetings-as-hub cross-linking). This session ran a fresh **40-check** jsdom
  suite scoped to Phase 7 (RFI / Technical Query Management) plus a route-level smoke test across every
  page, since this delivered zip didn't include the earlier test file to extend:
  - Schema: `schema_version` is 10, `rfis` array present, a simulated v9 file migrates cleanly to v10
    with an empty `rfis` array added
  - CRUD: add via the real form (not just the store), mandatory Subject/Question/Project validation,
    auto-numbering (`RFI-001`, `RFI-002`, ...), numbers not reused after deleting an entry, RFI and
    Technical Query numbered independently (`RFI-001` / `TQ-001` don't collide)
  - Workflow: overdue detection (open + past "Response Required By") and the aggregated overdue panel
    render correctly
  - Revision history: a note can be added and renders in the expanded details panel
  - Mandatory project assignment: the "+ Add RFI / TQ" button is disabled with no active projects,
    matching every other register
  - Meetings hub linking, both directions: "+ Add RFI / Technical Query" from a meeting pre-links
    project + meeting, the created entry carries `source_meeting_id`, the meeting's Details panel lists
    it under "RFI / TQ RAISED," and the entry's own details show "Raised in meeting" with a working
    link back
  - Portfolio's Details panel shows a project's open RFIs/TQs
  - Route smoke test: every page (including the new `rfis` route) renders without throwing

What this session's suite does **not** re-verify: Phases 1–6 in this exact zip. Nothing in those
modules was touched except the two additive hub-linking edits called out above (a button + a details
section in `meetings.js`, a details section in `portfolio.js`), and the CSS badge-color fix, so the risk
is low — but it's still a scope gap worth knowing rather than assuming away, since this environment has
no browser or device to confirm on either.

- **Documents delete** (7 checks, fresh session): delete button appears on every document card, deleting
  removes it from `data.documents` and cleans the id out of the owning project's `attachments`, the
  empty state renders correctly once the last document is gone, and declining the confirm dialog leaves
  the document untouched.
- **Change Management** (Phase 8, 43 checks, fresh session, first run passed clean):
  - Schema: `schema_version` is 11, `change_orders` array present, a simulated v10 file migrates to v11
    with an empty `change_orders` array added
  - CRUD via the real form: mandatory Title/Description/Project validation, auto-numbering (`CO-001`,
    `CO-002`, ...) with the same non-reuse-after-delete behavior as RFI/TQ
  - **The core design constraint, verified directly**: creating a Change Order, editing it, and moving
    it through Pending → Approved never changes `projects[].contract_value` — checked after each of
    those three operations, not assumed from the code reading correctly
  - Workflow: approving/rejecting from Pending auto-stamps `date_decided` if not already set
  - Approval / Decision History: a note can be added and renders in the expanded details panel, under
    its own heading, separate from RFI/TQ's revision log despite the identical underlying shape
  - Mandatory project assignment: "+ Add Change Order" is disabled with no active projects
  - **All three source links, each direction**: raising a Change Order from an RFI/TQ's details carries
    `source_rfi_id` and shows up under that RFI's own "CHANGE ORDERS RAISED"; same for Risk/Issue via
    `source_risk_id` (which also required adding `expandRisk()` to `risks.js` — didn't exist before this
    phase); same for a Meeting's "+ Add Change Order" quick action via `source_meeting_id`
  - Portfolio's Details panel shows a project's open Change Orders (Pending/Approved only)
  - Route smoke test: every page, including the new `changeOrders` route, renders without throwing
- **Basic Reporting** (Phase 9, 28 checks, fresh session): seeded a dataset spanning every module for
  two projects, then verified —
  - Project Status Report pulls real data correctly: contract value formats and totals right, open
    Risks/Issues show while closed ones are excluded, an overdue RFI is flagged as OVERDUE in the table,
    a Change Order's cost impact appears in both the section total and its own row, a meeting and a
    Daily Log incident both surface, document counts group by category
  - Switching the project selector actually swaps report content (checked against the report body only,
    not the dropdown's own option list, after an early version of this exact test caught itself on that)
  - Portfolio Summary Report aggregates correctly across both seeded projects: total contract value sums
    right, open-risk/overdue-RFI/pending-CO counts are portfolio-wide, and the project selector correctly
    hides itself since this report type doesn't need one
  - **Print button calls `window.print()`** — confirmed directly by stubbing it and checking it fired,
    not inferred from the button existing
  - The bundled `index.html` actually contains the `@media print` block and the sidebar-hiding rule,
    checked in the built output, not just the source file
  - Reports page with zero projects renders without throwing
- **Backup & Recovery** (Phase 10, 46 checks across four scenarios, fresh session):
  - **Fresh load + import/export/nudge** (26 checks): schema is 12 with the new fields correctly
    defaulted; import declined at the confirm dialog leaves existing data byte-for-byte untouched
    (checked directly, not inferred); import accepted actually replaces data; `exportToFile()` stamps
    `last_exported_at`; the nudge banner appears when overdue and hides when not; **dismissing snoozes
    rather than silences** — forced the dismissal timestamp back to the same age as the reminder
    threshold and confirmed the banner reappears, since a reminder that a single click turns off forever
    isn't a reminder; "Export Now" from inside the banner clears it; setting the reminder to 0 disables
    it entirely; Settings renders the new "Last exported" line and reminder-days input
  - **Corruption recovery in isolation** (8 checks): pre-seeded genuinely unparseable JSON into
    localStorage, loaded `store.js` standalone, and confirmed the fallback to empty data happens *and*
    the raw corrupted string survives — under its own key, retrievable via `listRecoveryBackups()`,
    deletable on request
  - **Corruption banner in the full built app** (8 checks): same corrupted-load scenario but through
    the actual bundled `index.html`, confirming the banner renders, is visible, names what happened, and
    offers a working download — and that Settings → Data Recovery lists the same snapshot with its own
    Download/Delete, so the recovery path doesn't depend on catching the one-time banner
  - **Migration** (4 checks): a simulated v11 file migrates to v12 with all three new fields
    (`last_exported_at`, `backup_reminder_days`, `backup_nudge_dismissed_at`) correctly defaulted
  - Route smoke test: every page renders without throwing, including after all of the above
- **Photos on Daily Log** (Phase 11, 28 checks, fresh session, first run passed clean):
  - Schema: `schema_version` is 13, a new Daily Log entry starts with an empty `photos` array
  - Adding two photos through the real file input (with a stubbed `FileReader`, since jsdom doesn't
    implement `readAsDataURL`) actually lands both in the store with filename, `file_data` as a proper
    `data:` URI, file size, and an empty starting caption — checked on the store, not assumed from the
    UI alone
  - The card view picks up a "2 photos" badge, the Details panel shows both thumbnails as real `<img>`
    elements with correct `src`, and each thumbnail is wrapped in a link to view full size
  - Editing a caption saves it to the correct photo, not just "a" photo
  - Removing a photo (with confirm) drops it from the store and the UI count updates to match
  - Deleting the whole log entry removes its photos with it, with nothing left orphaned
  - Migration: a simulated v12 file with a Daily Log entry that predates the `photos` field migrates
    to v13 with an empty `photos` array added to that existing entry
  - Route smoke test: every page renders without throwing
- **Same-session bug fixes** (9 checks, fresh session): simulated a real `localStorage.setItem` failure
  (not a mocked function replacement — jsdom's `Storage` object doesn't allow that, so the test
  replaces `window.localStorage` itself via `Object.defineProperty`, closer to how a real quota error
  actually surfaces) and confirmed: the error toast fires, `last_saved_at` is NOT updated on the failed
  attempt, in-memory data survives untouched, and a subsequent successful save correctly updates
  `last_saved_at` again once storage recovers. Separately confirmed the photo full-size link no longer
  points at a raw `data:` URI, has no `target=_blank` pointed straight at one, and clicking it opens a
  `blob:` URL via `window.open()` instead — the exact failure mode reported was `data:` URI navigation,
  so the test checks the fix at that level, not just that "a link exists."
- **Phase 12 — blobs-only IndexedDB migration** (38 checks across 8 scenarios, fresh session, using
  `fake-indexeddb` since jsdom doesn't implement IndexedDB natively — final run passed clean, 0 failed):
  - **Document blob → IndexedDB** (4 checks): saving a document leaves `file_data: null` in the store,
    confirms the actual blob bytes are absent from the raw `localStorage` JSON string (checked directly
    against the stored string, not inferred from the code), and confirms the blob IS retrievable from
    IndexedDB by the document's id
  - **Open File button** (6 checks): confirmed it still renders even though `file_data` is `null` — the
    exact bug this phase found and fixed — and that clicking it resolves the blob and opens a real
    `blob:` URL, not a broken reference
  - **Daily Log photos, full real-UI flow** (16 checks): add via the actual file input, confirm the blob
    lands in IndexedDB and not inline, confirm the thumbnail's `<img>` resolves its `src` asynchronously
    after starting from a placeholder, open full-size, remove — and confirm the blob is actually deleted
    from IndexedDB afterward, not just the metadata
  - **Export embeds blobs** (3 checks): captured the actual generated file content and confirmed the
    real blob bytes are embedded in the downloaded JSON — export still produces one self-contained,
    portable file despite blobs living in IndexedDB day-to-day, per Aditya's explicit requirement
  - **Import writes blobs to IndexedDB** (5 checks): an imported file with an inline blob gets that blob
    written to IndexedDB and nulled out of the record before being committed, confirmed against the raw
    `localStorage` string afterward so `localStorage` doesn't silently re-inflate on every import
  - **Legacy migration** (10 checks, the highest-risk part since it runs against every existing user's
    data on their very next load): seeded a record with old-style inline blobs, ran the migration,
    confirmed both the document and the photo were moved and correctly nulled, confirmed the blobs
    landed in IndexedDB byte-for-byte intact, confirmed `localStorage` no longer contains the old inline
    bytes, and explicitly **confirmed idempotency** — running the migration a second time is a no-op,
    not a duplicate-write or an error, in case it somehow gets triggered twice
  - **Document Archive resolves blobs** (2 checks): confirmed the archive-building step actually reaches
    the real JSZip file-add call and that a document with `file_data: null` gets included, not silently
    skipped — the exact class of bug found in `archive.js`, `meetings.js`, and `portfolio.js` during this
    phase (all three either gated visibility on `doc.file_data` being truthy or read it directly; all
    three would have silently broken for every document/photo saved after this migration if left as
    originally written — caught by grepping the whole codebase for `.file_data` after the main work
    looked done, not by luck)
  - Route smoke test: every page still renders without throwing after all of the above
- A **separate standalone test** (6 more checks) verifies the archive-building algorithm itself —
  folder-per-project naming, invalid-character sanitization, filename deduplication, and byte-exact
  content — against Node's real `jszip` runtime, replicating `archive.js`'s exact logic line-for-line.
  This exists because JSZip's async zip generation hangs specifically when run inside jsdom-in-Node (a
  known friction point for browser-oriented libraries in that hybrid environment) — not evidence of a
  problem in an actual browser, but I wasn't willing to just assert that without verifying the algorithm
  some other way. The in-browser test still confirms the Export Archive buttons exist and don't throw.
- Three real bugs were caught by this process and fixed before delivery:
  1. Portfolio's archive/unarchive toast text was inverted — fixed, pinned by regression tests.
  2. **The bundler was silently corrupting the build** via a `String.replace()` `$`-pattern collision
     with SheetJS's own source (`$&` in SheetJS was interpreted as a replacement directive). Fixed by
     switching to function replacers; verified with byte-for-byte comparison between source and bundle
     for all four vendor libraries now embedded.
  3. **A find-and-replace slip while adding the text-preview feature deleted a function's own
     declaration line**, which `node --check` caught immediately — worth mentioning because it's a
     reminder that even small edits get verified here, not assumed correct.
- pdf.js's "fake worker" (main-thread) fallback is used deliberately instead of a real Worker thread —
  simpler, avoids ~1.5MB of base64 Blob-Worker bundling, and works identically here to in a browser. The
  worker script just loads as a plain script alongside the rest of the bundle.

What I have **not** been able to test in this environment: actually opening this on your phone or laptop
(no browser or device available here). Tell me what you see and I'll fix it.

## Gate 4 — Schedule Baselines (2026-08-11)

Adds baseline capture and baseline-vs-current comparison on top of Gates 1–3's CPM engine. This section
predates the phase numbering above (this zip's README wasn't kept in sync with the schedule Gates —
see the note at the top of `store.js`'s schema history if the phase numbers below look out of order).

**What changed and why:**

- **Baseline storage is its own IndexedDB database** (`scheduleBaselineStore.js`, `pcc_schedule_baselines_v1`),
  not a new object store inside `blobStore.js`'s existing DB. `blobStore.js`'s own header is explicit that
  it's deliberately scoped to binary blobs only, specifically so every other module keeps its synchronous
  `store.get()` assumption. Adding structured JSON baseline snapshots there would've quietly reversed that
  decision. The live schedule (Activities/Relationships/WBS) is untouched — still synchronous, still in the
  main `localStorage` JSON, still what the CPM engine reads.
- **Baseline records are split the same way documents/photos are**: a thin index row (`schedule_baselines`
  in the main store — name, captured date, counts) for anything that lists baselines, and the full frozen
  WBS/Activity/Relationship payload in IndexedDB, loaded only when a comparison is actually run.
- **Snapshots are trimmed, not full record copies** — only fields that matter for schedule comparison
  (dates, duration, float, WBS/relationship structure). Notes, contractor, responsible person, actuals,
  and status are left out on purpose; they don't affect variance and would just bloat every snapshot.
- **Matching across a re-import uses `external_id` first, falling back to `id`.** Comparing a baseline
  against a later *re-imported* revision — not just hand-edits to the same schedule — is the common case,
  and re-imports mint fresh activity ids. Without this, every re-imported schedule's comparison would show
  100% added + 100% removed instead of the real variance.
- **Variance uses calculated dates (`early_start`/`early_finish`) when available, falling back to planned
  dates**, and flags (`mixed_date_sources`) when one side of a comparison is calculated and the other is
  only planned, rather than silently comparing the two as if they meant the same thing.
- Baselines list is scoped to the **project**, not the currently selected schedule, since the point is
  comparing across revisions — the "Compare to Current" action always compares against whatever schedule
  is selected in the toolbar, regardless of which revision the baseline itself came from.

**New files:** `scheduleBaselineStore.js` (IndexedDB), `scheduleBaselineEngine.js` (snapshot build +
compare, pure logic, no DOM/store writes — same separation `scheduleCpmEngine.js` keeps).
**Changed:** `store.js` (schema 17→18, `schedule_baselines` index + `newScheduleBaseline()`),
`schedule.js` (Save Baseline button, Baselines tab, compare view), `build.js` (bundle order).

**Tested before delivery (45 checks across 4 files, fresh session, all passed clean):**
- **Engine, pure logic** (13 checks): snapshot field trimming; variance math; calculated-vs-planned date
  precedence; `mixed_date_sources` flagging; not-comparable handling when neither side has usable dates;
  `external_id` matching surviving an id change across a simulated re-import (and confirming that *without*
  `external_id`, a changed id correctly shows as added+removed rather than a false match); added/removed
  activity detection; criticality-flip detection (and confirming unknown-vs-known float never registers as
  a change); relationship logic diffing via matched activity key, not raw relationship id; project-level
  overall finish variance.
- **IndexedDB round-trip** (9 checks, `fake-indexeddb`): put/get round-trips the exact object; missing id
  resolves `null` not an error; empty id short-circuits without touching IndexedDB; put rejects with no id;
  overwrite-on-put; delete then get resolves null; delete on a never-stored id doesn't throw; `listSnapshotIds`;
  multiple snapshots under different ids don't clobber each other.
- **Schema migration** (4 checks): a v17 dataset gets `schedule_baselines: []` added, lands on schema 18,
  and — the actual regression risk — existing projects/schedules/activities from before this migration
  survive untouched; a minimal legacy (no `schema_version` at all) dataset runs the *entire* migration
  chain through to 18 without throwing; a brand-new install starts clean; `newScheduleBaseline()` produces
  unique ids.
- **End-to-end against the actual bundled `index.html`** (19 checks, jsdom + `fake-indexeddb`, not a
  reimplementation): app boots clean; seeded project/schedule/activity; schedule route renders; clicking
  the real "Save Baseline" button writes both the index row and the matching IndexedDB snapshot; Baselines
  tab lists it; clicking "Compare to Current" with no changes reports no variance; editing the activity's
  planned finish by 5 days and re-comparing correctly reports "+5 day(s)"; every other route (dashboard,
  portfolio, documents, daily log, risks, meetings, RFIs, change orders, reports, settings) still renders
  without throwing after the schema bump.

**What I have not tested:** this on your actual device. Per the usual gate discipline, treat this as
built-and-verified-in-this-environment, not confirmed — same standard as every prior gate.

## Gate 5 — Gantt Chart View (2026-08-11)

Completes the Tier 2 line item "Schedule import + CPM/float engine + Gantt" — Gates 1-4 built
manual entry, Excel import, CPM calculation, and baselines, but there was no visual timeline of
any of it until now.

**What changed and why:**

- **Visualization only, deliberately** — no drag-to-reschedule, no inline editing. Activities are
  still edited through the existing Activities tab form; the chart is a read view built on data
  the CPM engine and Activities tab already produce, not a new editing surface. Folding in
  drag-to-reschedule would be a separate, later decision.
- **New pure module `scheduleGanttLayout.js`** — same "calculation only, no DOM" separation
  `scheduleCpmEngine.js` and `scheduleBaselineEngine.js` already keep. It turns a schedule's
  activities into plain row/date data (`computeLayout()`); `schedule.js`'s new Gantt tab is the
  only place that turns that into SVG.
- **Date precedence matches Gate 4's `scheduleBaselineEngine.js`**: calculated (`early_start`/
  `early_finish`) dates win when both are present, falling back to planned dates, so a schedule
  that hasn't been through "Calculate Schedule" yet still draws something meaningful instead of an
  empty chart — planned-only bars render with a dashed border to mark them as not-yet-calculated.
- **Critical-path activities** (`total_float <= 0`) render in red, matching the Activities tab's
  existing "Critical" badge color. Milestones render as diamonds rather than bars. Activities with
  no calculated or planned dates at all are called out by name below the chart rather than
  silently omitted.
- **The schedule's Data Date renders as a marker line** on the chart when set, using the same
  amber accent as the rest of the app's signal color.
- **No calendar/working-days awareness**, matching `scheduleCpmEngine.js`'s own documented scope —
  a bar's width is calendar days between its two dates, nothing fancier.
- Rendered with plain SVG (`createElementNS`), no charting library — consistent with the app
  having zero npm dependencies for anything shipped to the browser.

**New file:** `scheduleGanttLayout.js` (pure layout/date logic, no DOM).
**Changed:** `schedule.js` (new Gantt tab between Activities and WBS), `build.js` (bundle order).

**Tested before delivery (13 + 19 checks across 2 files, fresh session, all passed clean):**

- **Layout, pure logic** (13 checks): calculated-vs-planned date precedence (matching
  `scheduleBaselineEngine.js`'s own precedence); a milestone with only one date becomes a
  zero-width point, calculated or planned; an activity with no dates at all is excluded from the
  date range and reported separately; `isCritical` true only when `total_float` is 0 or negative,
  false (not true) when float hasn't been calculated yet; dated rows sort by start date ascending
  with undated rows appended after, sorted by name; `rangeStart`/`rangeEnd` span the earliest
  start to the latest finish; a Data Date outside the activity span still extends the range;
  `diffDays`/`addDays` round-trip correctly.
- **End-to-end against the actual bundled `index.html`** (19 checks, jsdom + `fake-indexeddb`,
  not a reimplementation): seeded a two-task critical chain (Design → Build), an isolated
  milestone, and a genuinely undated activity; before calculation, planned-only bars render
  dashed, the milestone renders as a `<path>` diamond (not a bar), and the undated activity is
  named in a "no dates" callout; clicking "Calculate Schedule" and then checking the **actual
  store values** (not a hardcoded assumption about CPM's internals) confirms each bar's fill color
  matches its real calculated `total_float`; the Data Date renders as a dashed marker line;
  switching to a schedule with zero activities shows the correct empty state; every other route
  still renders without throwing after the change.
- **Real-browser verification** (Chromium via Playwright, this environment's one way to check
  beyond jsdom — see the Testing conventions note below): seeded the same scenario through the
  live UI, screenshotted before and after "Calculate Schedule." Confirmed visually: dashed
  planned-only bars, the two critical activities turning solid red after calculation, the isolated
  milestone staying its non-critical amber diamond, the data-date marker and legend rendering
  correctly, and zero console/page errors throughout.
- While verifying, also found and fixed two stale doc issues from earlier gates (not part of this
  feature, caught in passing): all four `tests/*.js` files referenced a nonexistent `pcc/`
  subdirectory for `store.js`/`scheduleBaselineEngine.js`/`scheduleBaselineStore.js`/
  `index.html`, so `npm test` failed outright (0 passed, 4 failed) from a clean checkout — fixed
  to point at the real paths. The Schedule page's on-screen note still said Excel import and
  critical-path calculation "are not built yet" despite both shipping in Gates 2-3 — fixed to
  describe what's actually there.

**What I have not tested:** this on your actual device. Per the usual gate discipline, treat this
as built-and-verified-in-this-environment, not confirmed — same standard as every prior gate.

## Gate 6 — Cost Tracking (2026-08-11)

The next Tier 2 line item after Gantt: budget line items vs. actual costs incurred, per project.
**Scope decided explicitly before building** (Aditya, this session): budget-vs-actual variance
only — no EVM (Planned Value / Earned Value / CPI / SPI), that's its own separate, later gate per
the locked Tier 2 order.

**What changed and why:**

- **Schema v18 → v19** (`store.js`): two new arrays, `cost_budget_items` and `cost_actuals`.
  Deliberately **two separate shapes, not one distinguished by a `type` field** — unlike Risk/
  Issue/Opportunity or RFI/TQ, a budget line item and an actual cost entry genuinely aren't the
  same shape (date, vendor, invoice ref only make sense on an actual; a budget item is just a
  planned amount against a category). Applying the "one shape" pattern where the shapes actually
  differ would have forced awkward always-empty fields on one side or the other.
- **No automatic link to a project's `contract_value` or to Change Orders' `cost_impact_amount`**
  — the exact same "reconciliation stays a manual, deliberate act" decision already made for
  Change Orders (Aditya, 2026-08-06), applied consistently here rather than re-litigated.
- **New page `cost.js`** (route `#/cost`, sidebar "Cost Tracking"), three tabs:
  - **Budget** — line items (Project *, Category *, Name/Scope *, Planned Amount *, Notes).
    Standard construction categories: Labor, Materials, Equipment, Subcontractor, Permits/Fees,
    Other.
  - **Actuals** — a cost log (Project *, Category *, Description *, Amount *, Date *, optional
    Vendor/Invoice Ref/Notes) with an **optional** link to a Budget tab line item via "Against
    Budget Item" — logging an unbudgeted/miscellaneous cost is still worth doing even with nothing
    to link it to.
  - **Summary** — portfolio-wide stat tiles (Total Budgeted / Total Actual / Variance, scoped to
    active projects, same convention Reports' Portfolio Summary Report uses) plus a per-project
    budget-vs-actual-vs-variance table.
  - **Project assignment is mandatory** on both Budget and Actuals, same as every other register
    — "+ Add Budget Item" / "+ Log Actual Cost" are disabled with zero active projects.
- **Deleting a budget item unlinks rather than orphans its actual cost entries** — any actual
  referencing the deleted item has `budget_item_id` cleared, matching the pattern Documents'
  delete already established for cleaning up references rather than leaving stale ids around.
- **Portfolio's Details panel gets a Cost Tracking section**, right after Change Orders, matching
  the pattern every other register already has there: budgeted/actual/variance for the project
  plus a working "View All" link into the Cost page filtered to it.

**New file:** `cost.js`. **Changed:** `store.js` (schema 18→19, `newCostBudgetItem()`/
`newCostActual()`/`COST_CATEGORIES`), `portfolio.js` (Cost Tracking details section),
`layout.js`/`app.js`/`build.js` (new route/nav/bundle entry).

**Tested before delivery (7 + 28 checks across 2 files, fresh session, all passed clean):**

- **Schema migration** (`test_store_schema_v19_migration.js`, 7 checks; replaces the prior
  gate's migration-chain test file, same "one canonical full-chain test targeting latest" pattern
  as before): a v18 dataset gets both new arrays added and lands on schema 19 with existing
  projects/schedules/activities/baselines untouched; a minimal legacy (no `schema_version` at
  all) dataset runs the entire chain through to 19; a brand-new install starts clean;
  `newCostBudgetItem()`/`newCostActual()` factory defaults (category defaults to "other",
  `budget_item_id` defaults to unlinked, date defaults to today); `COST_CATEGORIES` has the
  expected six categories.
- **End-to-end against the actual bundled `index.html`** (`test_cost_e2e.js`, 28 checks, not a
  reimplementation): added a budget item and an actual cost through the **real forms**, confirmed
  the "Against Budget Item" dropdown offers the just-created item and the link is stored
  correctly; logged a second, deliberately unlinked actual and confirmed `budget_item_id` stays
  empty; edited a budget item through the real form; the Summary tab's totals matched hand-checked
  arithmetic across both actuals; **deleting the linked budget item left both actuals intact with
  the link cleared** (the specific "unlink, don't orphan" behavior, checked against the store
  directly); deleting an actual cost entry removed only that entry; Portfolio's Details panel
  shows the Cost Tracking section with correct numbers and a working View All link; mandatory
  project assignment confirmed by archiving the only project and checking both "+" buttons
  disable; every other route still renders without throwing after the schema bump.
- **Real-browser verification** (Chromium via Playwright): added a budget item and a linked
  actual cost through the live UI, confirmed the Summary tab's stat tiles and per-project table
  render correctly, and confirmed the Cost Tracking section appears in Portfolio's Details panel
  in the right place (after Change Orders) with the right numbers — zero console/page errors
  throughout.

**What I have not tested:** this on your actual device. Per the usual gate discipline, treat this
as built-and-verified-in-this-environment, not confirmed — same standard as every prior gate.

## UI/UX Design Pass (2026-08-11)

Not a numbered Gate — a design-only pass, no schema change, no new feature. **Scope decided
explicitly first** (Aditya, this session): keep the existing industrial/blueprint-navy + amber-
accent identity and title-block header exactly as designed, refine within it. Priorities named
up front: general polish, density/clutter, navigation/findability, and mobile/small-screen.

**What changed and why:**

- **Found and fixed a real mobile layout bug, not a cosmetic one**: below the 780px breakpoint,
  `#app-shell` never switched from a row flexbox to a column one, so the sidebar's "become a
  horizontal strip at the top" CSS was fighting the parent's row layout — on an actual phone
  viewport the sidebar and page content were squeezed side-by-side into two narrow columns
  instead of stacking, both nearly unusable. This is exactly the class of bug the README's own
  Testing conventions note says jsdom structurally can't catch (no real viewport) and every prior
  gate could only flag as "not tested on your actual device" — caught here specifically because
  this pass took real Chromium screenshots at a 375px phone viewport for the first time, not just
  the 1280px desktop width every previous verification pass used.
- **Found and fixed a second real bug**: `.detail-card` — used for every row in Schedule's
  Activities/WBS/Relationships/Baselines tabs and Cost Tracking's Budget/Actuals/Summary lists (8
  call sites) — had **no CSS rule defined at all**. Those rows have rendered as bare unstyled
  `<div>`s (no background, border, padding, or spacing) since Schedule's Gate 1, invisible in every
  jsdom test because jsdom doesn't render CSS, only DOM structure. Added a `.detail-card` rule
  matching `.project-card`'s established visual language.
- **Design tokens**: added a spacing scale (`--space-1` … `--space-6`), elevation shadows
  (`--shadow-sm`/`--shadow-md`, tuned separately per theme), and transition tokens — additive to
  the existing token set, nothing renamed or removed.
- **Button/control states that were simply missing**: `:disabled` had no visual treatment at all
  (a disabled "+ Add Entry" button looked identical to an enabled one except for the cursor);
  `:focus-visible` outlines existed on form fields but not on buttons or links, a real keyboard-
  accessibility gap. Both fixed app-wide via the shared `.btn`/`.icon-btn` rules, not per-page.
- **Sidebar grouped into sections** (Overview / Registers / Planning / Output) now that it holds
  13 items — directly addresses the navigation/findability priority. Purely a presentation
  grouping in `layout.js`'s `NAV_GROUPS`; routing and `PAGE_TITLES` are untouched flat maps.
- **Tabs get their own visual language**: Schedule's and Cost Tracking's tab bars
  (Activities/Gantt/WBS/… and Budget/Actuals/Summary) previously reused the same `.btn`/
  `.btn--primary` classes as toolbar filter and action buttons, so a page's primary navigation
  looked identical to an unrelated "+ Add" button. New `.tab-bar`/`.tab-btn`/`.tab-btn--active`
  classes give tabs an underline style instead, applied in both `schedule.js` and `cost.js`.
- **Density/polish**: heat map cells and cards get hover feedback (they were `cursor: pointer`
  with zero visual response); toasts get a subtle entrance animation; empty states get a dashed
  border to read as "nothing here yet" rather than a regular content panel; meta text (the
  `·`-separated fact lines used throughout every register) gets `line-height: 1.5` instead of the
  browser default, since several facts packed onto one line were reading cramped.
- **Mobile toolbar stacking**: below 780px, the search input and filter `<select>`s now each take
  a full row instead of wrapping mid-row — easier to read and tap than the desktop's wrapped strip
  shrunk down.

**Changed:** `styles.css` (tokens, the `#app-shell` flex-direction fix, `.detail-card`,
`.tab-bar`/`.tab-btn`, button/focus states, mobile toolbar rule), `layout.js` (`NAV_GROUPS`),
`schedule.js` and `cost.js` (tab bar markup switched to the new classes).

**Tested before delivery:**

- `cd tests && npm test` — all 108 existing checks still pass unchanged (this pass is CSS/markup
  only; one test assertion in `test_cost_e2e.js` that checked for the old `btn--primary` class on
  the active tab was updated to check for `tab-btn--active` instead, since that's the actual
  behavior being verified — a class-name rename, not a behavior change).
- **Real-browser verification, both themes and two viewports** (Chromium via Playwright — this is
  the pass where that mattered most, given both real bugs found were invisible to jsdom):
  Dashboard, Portfolio (with Details panel expanded), Risk Register (heat map + cards), Schedule
  (Activities and Gantt tabs), and Cost Tracking (Budget and Summary tabs) screenshotted at a
  1280px desktop viewport in both dark and light theme, and at a 375px phone viewport in dark
  theme (Dashboard, Portfolio, Risk Register) — zero console/page errors across all of it, and the
  mobile screenshots are what surfaced the `#app-shell` layout bug in the first place.

**What I have not tested:** this on your actual device — same standing caveat as always, though
this specific pass is the one gate where that caveat mattered most, and it's exactly what caught
both real bugs above.

## Cost Tracking: fall back to Portfolio's Budget field (2026-08-11)

Reported by Aditya: Cost Tracking's "Total Budgeted" only ever reflected budget line items added
inside Cost Tracking itself — a project's own "Budget" field (set on the Portfolio Add/Edit
Project form) was completely ignored, so a project where someone filled in Budget but never
visited Cost Tracking showed $0 budgeted, which read as a bug even though it matched Cost
Tracking's original explicit design (no automatic link to any Portfolio field, mirroring Change
Orders' `cost_impact_amount`).

**Scope clarified explicitly before changing anything** (Aditya, this session), since "Budget"
and "Contract Value" are two different Portfolio fields (internal planned spend vs. the signed
contract's value — a cost concept and a revenue concept) and there were several ways this could
plausibly work:

- **Only `budget` feeds in — not `contract_value`.** They mean different things; blending them
  would be a modeling error, not a fix.
- **Fallback only, never a silent override.** Cost Tracking budget line items remain the source
  of truth whenever any exist for a project — they carry real category-level detail a single
  top-level number can't. Portfolio's Budget field is used only when a project has **zero**
  budget line items, so the total is never misleadingly $0 while still not letting a coarser
  number quietly override real ones. Adding a single budget line item for a project turns the
  fallback off for that project immediately.
- **Never silent about which source is in play** — same transparency convention as the Gantt
  chart's calculated-vs-planned distinction and the baseline engine's `mixed_date_sources` flag.
  Whenever the fallback is active, both the Summary tab's per-project row and Portfolio's Details
  panel say so explicitly ("from Portfolio's Budget field — no Cost Tracking line items yet"),
  rather than presenting a Portfolio-sourced number identically to a real line-item total.

**Changed:** `cost.js`'s `projectCostSummary()` (the shared function both the Summary tab and
Portfolio's Details panel already called) now checks for budget line items first, falls back to
`project.budget` if none exist, and returns a `usingPortfolioBudget` flag; both call sites render
the disclosure note when it's true. `portfolio.js`'s Cost Tracking details section updated to
show the same note.

**Tested before delivery (3 new checks in `test_cost_e2e.js`, full suite re-run clean):** a
project with `budget` set and no line items falls back correctly (`projectCostSummary()` checked
directly, plus the Summary tab and Portfolio's Details panel both checked for the actual rendered
number and disclosure text); adding a real budget line item for that project immediately turns
the fallback off and the total switches to the line-item sum. The existing 28 Cost Tracking
checks all still pass unchanged, since the seeded project in those never had `budget` set — undefined
correctly does not trigger the fallback, same as before this change. Full suite: 111/111 passing.
Verified visually in real Chromium: the fallback figure and note appear on both the Summary tab
and Portfolio Details panel, and both switch to the real line-item total (with the note gone) the
moment a budget line item is added.

## Gate 7 — EVM Engine (2026-08-11)

The last Tier 2 line item before Resource Management: Planned Value, Earned Value, CPI, and SPI.

**Scope decided explicitly before building** (Aditya, this session), choosing the detailed option
over a simpler project-level approximation: a budget item can optionally link to one Schedule
activity, so Planned Value is time-phased from that activity's own real dates and Earned Value
comes from that activity's own real `percent_complete` — not a project-wide average or a single
straight line across the whole project.

**What changed and why:**

- **Schema v19 → v20**: `cost_budget_items` gets `activity_id`, an optional link to one Schedule
  activity. **Many-to-one, not many-to-many** — several budget items may point at the same
  activity (e.g. separate Labor and Equipment lines for one dig), but one item can't span several
  activities. Same shape as the existing `budget_item_id` link on `cost_actuals`, applied
  consistently. Unlinked is fully valid: the item still counts toward Budget at Completion, it
  just has no PV/EV.
- **New pure module `costEvmEngine.js`** — same "calculation only, no DOM" separation every prior
  engine in this app keeps (`scheduleCpmEngine.js`, `scheduleBaselineEngine.js`,
  `scheduleGanttLayout.js`). Per linked item: PV is a **linear distribution of that item's budget
  across its own activity's date span** (calculated `early_start`/`early_finish` preferred, falling
  back to planned — same precedence Gantt and baselines already use; a zero-duration span, i.e. a
  milestone, is a step function, not a division by zero). EV is that item's budget × its activity's
  real `percent_complete`. **Actual Cost is always the full total for the project, linked or not**
  — money already spent doesn't stop being real just because it isn't tied to a schedule activity.
- **Unlinked budget still counts toward BAC but is explicitly excluded from PV/EV, never silently
  blended in.** A "coverage %" (linked budget ÷ total budget) is always visible; when it's below
  100% the EVM tab says so directly rather than presenting a partial-coverage number identically
  to a fully-covered one — same transparency convention as Gantt's dashed "not yet calculated"
  bars and Cost Tracking's `usingPortfolioBudget` disclosure.
- **CPI/SPI stay `null` (not a misleading `0.00`) when nothing is linked yet**, even if real actual
  cost has already been logged — `EV = 0` from "nothing measurable" and `EV = 0` from "measured and
  genuinely 0% earned" are different situations, and only the second one is a real performance
  signal. Guarded on `linkedBac > 0`, not just on `ac`/`pv` being positive.
- **EAC uses the BAC/CPI formula specifically** — one of several industry-standard EAC formulas,
  documented as a deliberate choice (it assumes the project's current cost efficiency holds for
  the remaining work), same "ambiguous industry convention, pick one and say so" approach
  `scheduleCpmEngine.js` already takes for Free Float. ETC = EAC − AC, VAC = BAC − EAC follow from
  it.
- **New "EVM" tab on the Cost Tracking page** (not a separate page — it's built entirely from
  numbers Cost Tracking and Schedule already track): portfolio-wide EARNED VALUE / ACTUAL COST /
  CPI / SPI tiles (CPI/SPI colored red when below 1.0), a coverage disclosure when below 100%, and
  a "By Project" breakdown with each project's own EV/AC/PV/CPI/SPI/EAC and a VAC badge.
- **The Budget Item form gets a "Schedule Activity" field**, listing that project's activities
  across all of its schedule revisions, each labeled with its schedule's name so linking stays
  unambiguous when a project has more than one revision. Same dependent-select pattern the Actuals
  form already uses for "Against Budget Item."
- Found and fixed a real formatting bug while verifying: `formatMoney()` never capped fraction
  digits, so EAC/VAC (genuinely fractional, unlike every other whole-dollar figure in this app)
  displayed raw floating-point noise like "3,083.333" instead of standard 2-decimal currency
  precision — invisible until real division produced a non-integer result to look at.

**New file:** `costEvmEngine.js`. **Changed:** `store.js` (schema 19→20, `activity_id` on
`newCostBudgetItem()`), `cost.js` (EVM tab, Schedule Activity form field, `formatMoney()` fix),
`build.js` (bundle order).

**Tested before delivery (19 pure-logic + 22 e2e checks, full suite re-run clean):**

- **Engine, pure logic** (`test_cost_evm_engine.js`, 19 checks): PV linear interpolation at an
  activity's midpoint, before its span, and after it; the milestone step-function case; calculated-
  vs-planned date precedence; an activity with no usable dates excluded (not guessed); EV from real
  percent_complete, clamped to [0,100]; two budget items linked to the same activity earning
  independently; an unlinked item counting toward BAC but not PV/EV; a deleted activity's dangling
  `activity_id` treated as unlinked rather than crashing; AC always summing every actual regardless
  of linkage; the `usingPortfolioBudget`-style `options.bac`/`options.ac` override; **the specific
  CPI/SPI-stays-null-with-nothing-linked scenario** and its inverse (a genuine 0%-complete linked
  activity correctly producing a real CPI/SPI of 0); a full on-plan scenario where PV=EV=AC and
  CPI=SPI=1; CPI/SPI null on zero AC/PV; the EAC/ETC/VAC formula chain; an all-zero project.
- **End-to-end against the actual bundled `index.html`** (`test_cost_evm_e2e.js`, 22 checks, not a
  reimplementation): the Schedule Activity dropdown on the real Budget Item form offers the seeded
  activity labeled with its schedule name; submitting the form actually stores `activity_id`; the
  budget item's list row shows what it's linked to and its % complete; a hand-checkable exact-
  midpoint scenario (10-day activity, data date at day 5, 50% complete, on-budget) produces PV=EV=
  AC=500 and CPI=SPI=1.00 on the real EVM tab; adding a second unlinked item drops coverage to 50%
  and the disclosure note appears; the EVM tab's own empty state with zero active projects; full
  route smoke test.
- **Real-browser verification** (Chromium via Playwright): a two-activity scenario (one behind
  schedule and over budget, one ahead) hand-verified against the actual rendered numbers —
  PV=2,100, EV=1,800, AC=1,850, CPI=0.97, SPI=0.86, EAC=3,083.33, VAC=−83.33, all matching hand
  arithmetic exactly, with CPI/SPI/VAC correctly rendering red for the over-budget/behind-schedule
  result. This same pass is what surfaced the `formatMoney()` decimal-precision bug above.

**What I have not tested:** this on your actual device. Per the usual gate discipline, treat this
as built-and-verified-in-this-environment, not confirmed — same standard as every prior gate.

## Gate 8 — Interactive Gantt Editing (2026-08-16)

Gate 5 shipped the Gantt as a read-only visualization, deliberately — "no drag-to-reschedule,
no inline editing... a separate, later decision." This gate is that later decision: the Gantt
becomes the primary way to reschedule activities day-to-day, not just view them.

**Scope decided explicitly before building:** drag-to-move, drag-to-resize, and a click-to-open
detail panel, with every edit auto-recalculating the schedule — matching the spec's "no manual
refresh should be required." **Deliberately NOT built this pass, and said so in the UI rather than
silently omitted:** linking an activity to Risks/Issues/RFIs/Meetings/Documents/Vendors/Change
Orders (none of those registers carry an activity reference — adding one to five-plus modules is
a schema change on the scale of its own gate) and virtualized rendering for 10,000+ activities
(current SVG rendering is fine for realistic project sizes but untested at that scale).

**What changed and why:**

- **`scheduleGanttLayout.js` gained three pure, testable functions** — `daysFromPixelDelta()`,
  `moveDates()`, `resizeFinish()` — same "calculation here, DOM there" split every engine in this
  app keeps. Both date functions always write to `planned_start`/`planned_finish`, never the
  calculated early/late fields, matching the Activities tab form's existing rule.
- **Drag-to-move**: dragging a bar (or a milestone diamond) shifts both dates by the same number
  of days, preserving duration. **Drag-to-resize**: a narrow handle at a bar's right edge extends
  only the finish date (and therefore duration) — clamped so finish can never end up before start.
  Live visual feedback during the drag is a plain SVG `transform`/`width` tweak on the existing
  elements (no rerender until drop); the commit on pointer-up writes to the store and immediately
  re-runs `scheduleCpmEngine.calculateSchedule()`, the same call the toolbar's own "Calculate
  Schedule" button makes, so float/critical-path/project-finish are never stale after an edit.
  pointermove/pointerup are attached to `window`, not via `setPointerCapture` (not universally
  available across every environment this app runs in), so a fast drag that leaves the bar's thin
  hit area is never dropped.
- **Click vs. drag disambiguation**: a pointer-down/up with no real movement (under a 4px
  threshold) opens a new **Activity Detail Panel** instead of committing a zero-day edit — ID
  (external, falling back to the internal id), WBS, type, status, duration, remaining duration,
  planned dates, float, % complete, discipline, contractor, responsible person, constraint,
  notes, and a live Predecessors/Successors list, with Edit / + Add Relationship / Delete actions.
  The panel says explicitly that cross-module linking isn't built yet rather than showing an empty
  or broken section.
- **Filters**: WBS, Discipline, Contractor, Responsible Person (all populated from the schedule's
  own real values, not a fixed list), plus a single "quick" status filter (Critical / Near
  Critical / Delayed / Completed / In Progress / Not Started / Milestones Only) and free-text
  search across Activity ID / Name / WBS / Contractor / Discipline. "Delayed" is computed at
  filter time from the effective (calculated-preferred, planned-fallback) finish date vs. the
  schedule's data date — never stored, same convention every other overdue check in this app uses.
- **Zoom presets** (Auto / Daily / Weekly / Monthly / Quarterly / Yearly) alongside the pre-existing
  size-based "Auto" heuristic, plus **Today / Project Start / Project Finish / Data Date** buttons
  that scroll the chart's own container to the relevant date. A solid **Today line**, distinct
  from the existing dashed amber Data Date marker, renders when today falls inside the chart's
  date range.
- **Baseline overlay**: a "Show Baseline" toggle (when the project has at least one saved
  baseline) loads that baseline's IndexedDB snapshot and draws thin dashed ghost bars behind the
  matching current bars — matched by `external_id` falling back to `id`, the same precedence
  `scheduleBaselineEngine.js`'s own comparison already uses, so a baseline captured before a
  re-import still lines up correctly.
- **Quick-add**: "+ Add Activity" / "+ Add Milestone" buttons jump to the Activities tab's existing
  form (pre-selecting Milestone as the type for the latter) rather than duplicating the form here.

**Changed:** `scheduleGanttLayout.js` (drag-math functions), `schedule.js` (the Gantt tab
rewritten with editing/filters/zoom/detail panel/baseline overlay; a shared
`deleteActivityWithConfirm()` extracted so the Activities tab and the new detail panel delete the
same way). **New (unused by this gate, prep for Gate 9 below):** `projectHealthEngine.js`, schema
v20 → v21.

**Tested before delivery (16 + 23 checks, fresh session, all passed clean):**

- **`projectHealthEngine.js`, pure logic** (16 checks) — see Gate 9 below, built alongside this
  gate but not wired into any UI until Gate 9.
- **End-to-end against the actual bundled `index.html`** (`test_schedule_gantt_editing_e2e.js`,
  23 checks, not a reimplementation, real `pointerdown`/`pointermove`/`pointerup` events dispatched
  with `clientX` set): dragging a bar 3 days right shifts both planned dates and preserves
  duration; a plain click with no movement opens the detail panel instead of editing dates
  (checked against the store, not just the UI); resizing a bar's right edge by 5 days extends only
  the finish date and grows duration; dragging a milestone diamond moves its single date; editing
  auto-recalculates without a manual "Calculate Schedule" click; the search filter narrows the
  chart to matching activities only; "+ Add Milestone" pre-selects the Milestone type on the real
  form; deleting an activity from the detail panel removes it and any relationship referencing it;
  full route smoke test across every page.
- **Real-browser verification** (Chromium via Playwright, both themes, desktop and 375px mobile
  viewports): seeded a five-activity/one-milestone scenario, dragged a bar with real mouse
  move/down/up events and confirmed the toast + recalculated critical-path count, clicked a bar to
  open the detail panel and confirmed every field renders correctly in both themes, confirmed the
  filter/zoom/jump toolbar lays out cleanly — zero console/page errors throughout.

**What I have not tested:** this on your actual device, and Gantt rendering performance at
10,000+ activities (explicitly out of scope this pass, noted above). Per the usual gate
discipline, treat this as built-and-verified-in-this-environment, not confirmed.

## Gate 9 — Project Executive Center (2026-08-16)

The management-facing counterpart to Gate 8's operational Gantt: a per-project rollup
consolidating Portfolio, Schedule, Cost Tracking, Risk Register, RFI/TQ, Change Management, and
Meetings into one screen, plus printable output for meetings and steering committees.

**Scope decided explicitly before building**, several items deliberately cut and documented rather
than silently skipped: **no Resource Management KPIs** (that module doesn't exist yet — nothing
here is a placeholder for it); **Cost KPIs are Budget/Actual/Variance plus EAC when EVM is
available** — Commitments and Cash Flow have no underlying data model anywhere in PCC and are
called out as untracked rather than shown as a permanently-empty tile; **EVM tiles/charts only
render when the project actually has Cost Tracking budget items** — no fabricated PV/EV/CPI for a
project that's never touched Cost Tracking; **per-activity linking to Risks/Issues/RFIs/Meetings/
Documents/Vendors/Change Orders is not built** (same reason as Gate 8 — no register carries an
`activity_id`); **no PDF/Word/Excel library** — Project Snapshot and the Management Pack reuse
`reports.js`'s existing `window.print()`/`.report-doc` architecture, per the standing decision
that this app never bundles a document-generation library; **no persisted/logo-customizable report
templates** — deferred as a separate, later polish item.

**What changed and why:**

- **Schema v20 → v21**: `newProject()` gains `project_type`, `current_phase`, and an optional
  manual `forecast_finish_date` override (used only when no schedule has been calculated —
  the Executive Center prefers the CPM engine's live-calculated finish and says which source is
  in play, same transparency convention as Gantt's dashed "not yet calculated" bars). New
  `settings.health_score_weights` (defaults below). New `executive_summaries` array +
  `newExecutiveSummary()` — one record per project, storing only the user's *edited overrides* for
  the Executive Summary's five sections; the default text is always computed fresh from real data,
  never stored, so it can't drift stale.
- **New pure module `projectHealthEngine.js`** (same "calculation only, no DOM" split every other
  engine here keeps): `computeHealthScore(context, weights)` returns a 0–100 score, a RAG
  (on_track/at_risk/critical), and a full **breakdown** — every factor's raw inputs, sub-score,
  weight, and contribution, so the "why" is never hidden, per the spec's explicit requirement. Six
  factors (Schedule 25 / Cost 20 / Risk 20 / Issue 10 / RFI 15 / Change 10, defaults, editable in
  the UI and applied portfolio-wide): a factor with no underlying data (e.g. no budget set yet) is
  marked `available: false` and **excluded** from the score — weights re-normalize over just the
  available factors, so a project that simply hasn't used Cost Tracking yet doesn't get penalized
  as if it were over budget. `computeDiagnostics(context)` produces rule-based alerts (SPI/CPI
  below threshold, EAC over BAC, cost over budget, critical/near-critical activities, milestone
  slippage, high risks, overdue RFIs, overdue meeting actions, pending change orders) — no AI,
  every alert traces to a real record.
- **New page `executiveCenter.js`** (route `#/executiveCenter`, "Executive Center" button on every
  Portfolio project card, sidebar entry under Overview):
  - **Project Overview**: name/client/location/sector/project type/contract value/budget (with
    the same Portfolio-budget-fallback disclosure Cost Tracking already established)/planned and
    forecast finish/data date/PM/planner/progress, with an RAG health badge.
  - **KPI cards** grouped Progress / Schedule / Cost / EVM (conditional) / Risks / Issues / RFIs /
    Changes — Schedule KPIs (critical/near-critical/delayed counts, upcoming milestones, schedule
    variance) are computed **live** via `scheduleCpmEngine` at render time rather than reading
    possibly-stale stored `total_float`, so the dashboard reflects reality even if nobody has
    clicked "Calculate Schedule" recently on the Schedule page — directly satisfying the spec's
    "if an activity changes, the dashboard must reflect it."
  - **Health Score panel**: gauge, RAG badge, and the full breakdown table from
    `projectHealthEngine.js`; weights are editable inline and persist to
    `settings.health_score_weights`.
  - **Project Health Diagnostics**: the rule-based alert list, each linking back to its source
    record (a risk, an RFI, a change order, a meeting) via the same cross-page navigation pattern
    Portfolio's Details panel and the Meetings hub already use (`window.PCC.<module>.expandX()` +
    `router.go()`).
  - **Executive Summary**: five sections (Status/Achievements/Challenges/Management Attention/
    Upcoming), each showing computed default text unless the user has edited and saved an
    override — template/data-driven, never AI-generated, per the spec's explicit requirement.
  - **Charts**, all plain SVG (no charting library, consistent with the Gantt's own approach):
    Progress S-Curve (a real duration-weighted **planned** cumulative curve — there's no stored
    day-by-day actual-progress history anywhere in PCC, only current `percent_complete`, so
    "actual" is a single labeled point rather than a fabricated curve), Critical vs Non-Critical
    donut, Float Distribution histogram, Milestone Timeline, Risk Heat Map, RFI Open/Closed,
    Change Order status. Every chart shows "No data available" instead of a misleadingly empty
    axis when a project has nothing to plot.
  - **Recent Activity** feed, **Upcoming Items** (configurable 7/14/30/60/90-day range), and a
    **Management Action List** aggregating delayed activities / high risks / overdue RFIs /
    pending approvals / outstanding meeting actions / cost warnings / schedule slippage, each
    linking to its source.
  - **Project Snapshot**: a fixed one-page **A4 landscape** printable summary (a new CSS named
    page, `page: snapshot-page`, applied only to `.snapshot-doc` — the existing portrait
    `@media print` rules for Reports' own output are untouched) for weekly/client/steering-
    committee use.
  - **Management Pack**: one click assembles a checkbox-driven, multi-section printable document
    (cover, executive summary, snapshot, KPI dashboard, progress, schedule, milestones, cost, EVM,
    risks, issues, RFIs, changes, daily log, meetings) — a section with genuinely no data still
    renders (with its own "no data" note) if explicitly checked, per the spec's "don't include
    empty sections unless the user explicitly chooses to."

**Changed:** `build.js` (JS_ORDER), `layout.js` (nav entry + page title), `app.js` (route),
`portfolio.js` ("Executive Center" button on every project card), `styles.css` (the
`snapshot-page` named-page print rule). **New:** `projectHealthEngine.js`, `executiveCenter.js`.

**Tested before delivery (31 checks, fresh session, all passed clean):**

- **End-to-end against the actual bundled `index.html`** (`test_executive_center_e2e.js`, not a
  reimplementation): seeded one project with real data across every rolled-up module (a critical-
  path activity, a high risk, an overdue RFI, a pending change order, an overdue meeting action, a
  Cost Tracking budget item linked to an activity) and confirmed — the Executive Center is
  reachable from Portfolio's own "Executive Center" button; KPI tiles show the real seeded numbers
  (not fabricated ones); the EVM section renders (because real budget items exist) and disappears
  entirely for a second, zero-budget-item project (checked directly — "SPI" doesn't appear
  anywhere on that project's page); the Health Score panel renders a numeric score/RAG/breakdown;
  editing a weight in "Configure Weights" persists to the store; Diagnostics lists the real risk/
  RFI/change-order/meeting-action by name/number; the Management Action List surfaces the same
  real items; the Executive Summary's auto-generated text mentions the real completed activity;
  editing and saving a summary section persists an override that then displays instead of the
  auto text; every chart SVG renders without throwing; the Snapshot and Management Pack both
  render real numbers, "Print / Save as PDF" calls `window.print()`, toggling a Management Pack
  section checkbox on/off actually adds/removes that section from the assembled document; full
  route smoke test including the new route.
- **`projectHealthEngine.js`, pure logic** (16 checks, listed under Gate 8 above since it was
  built in that same session — a fully healthy project scores 100/on_track; a factor with no
  underlying data is excluded rather than scored as 0; critical activities/schedule slippage/
  over-budget/high-risks/critical-issues/overdue-RFIs/pending-COs each measurably lower their own
  factor; malformed or non-100-summing weights are re-normalized rather than distorting the score;
  RAG thresholds; every diagnostic rule fires correctly (SPI/CPI/EAC-over-BAC/cost-over-budget/
  critical-and-near-critical activities/milestone slippage/high risks/overdue RFIs/overdue meeting
  actions/pending change orders) with a correct severity and a real record link; alerts sort
  critical-then-warning-then-info; empty/undefined context produces no alerts without throwing).
- **Real-browser verification** (Chromium via Playwright, both themes, desktop and 375px mobile):
  seeded a realistic multi-module scenario, confirmed the Overview/KPI/Health-Score/Diagnostics/
  Executive-Summary/Charts/Recent-Activity/Upcoming/Management-Action sections all render
  correctly and legibly in both themes and at mobile width; confirmed the Project Snapshot and
  Management Pack both render with real numbers and every Management Pack section checkbox toggles
  correctly — zero console/page errors throughout.

**What I have not tested:** this on your actual device. Per the usual gate discipline, treat this
as built-and-verified-in-this-environment, not confirmed — same standard as every prior gate.

## Gate 10 — Activity Linking (2026-08-16)

Gate 8's Activity Detail Panel shipped with an explicit note that cross-module linking "isn't
built yet — those registers don't currently carry an activity reference." This gate is that: an
optional `activity_id` on Risk/Issue/Opportunity, RFI/TQ, Meetings, Documents, Daily Log, and
Change Orders, plus a real, live Linked Records list in the Gantt's Activity Detail Panel and
"Linked Activity"/"View in Gantt" on every one of those six registers' own detail views — the
cross-module drill-down the Gantt was missing.

**Scope decided explicitly before building:** the six registers link, not "Vendors" (no Vendor
Management module exists in PCC — nothing to link to) and not "Meeting Actions" individually (a
Meeting links as a whole, same granularity `source_meeting_id` already uses everywhere else in
this app, rather than introducing action-item-level linking as a one-off). Daily Log links to a
single optional activity too, even though a day's log realistically touches several — modeling a
many-to-many would be the only such relationship anywhere in PCC; a single pointer still covers
the common case and stays consistent with every other register's link shape.

**What changed and why:**

- **Schema v21 → v22**: `activity_id: ""` added to `newRisk()`, `newRfi()`, `newMeeting()`,
  `newDocument()`, `newDailyLog()`, `newChangeOrder()` — same many-to-one shape
  `cost_budget_items.activity_id` (Gate 7) already established: several records may point at the
  same activity, one record can't span several. Unlinked is fully valid and remains the default.
- **A "Linked Activity (optional)" dropdown** on all six forms, listing that project's activities
  across every one of its schedule revisions, each labeled with its schedule's name — the exact
  same `activityOptionsFor()` helper cost.js's Budget Item form established in Gate 7 for linking
  to a Schedule Activity, duplicated into each module (self-contained page modules, no shared util
  layer, matching this codebase's existing convention) rather than factored out.
- **Each register's own detail/expanded view** gains a "LINKED ACTIVITY" row with a "View in
  Gantt" button when set — same visual pattern as the existing "RAISED IN MEETING"/source-link rows
  Risk Register, RFI/TQ, and Change Orders already had from earlier gates.
- **`schedule.js` gained its first public API**, `window.PCC.schedule.viewActivity(projectId,
  scheduleId, activityId)` — jumps straight to the Gantt tab with that activity's own Detail Panel
  already open, the reverse-navigation half every "View in Gantt" button calls, matching the same
  "land exactly on the linked record" convention `expandRisk`/`expandRfi`/`expandMeeting`/
  `expandChangeOrder` already established.
- **The Gantt's Activity Detail Panel's old "not built yet" note is now a real "Linked Records"
  section** — queries all six registers live (`activity_id === this activity's id`, nothing
  cached or duplicated) and lists every match with its own "View" button that navigates to and
  expands that exact record. `documents.js` and `dailyLog.js` gained `expandDocument()`/
  `expandLog()` public exports to support this (the other four already had an equivalent).
  An activity with nothing linked shows a clear empty state pointing at where to link one, not a
  blank section.

**Changed:** `store.js` (schema v21→v22), `risks.js`, `rfis.js`, `meetings.js`, `documents.js`,
`dailyLog.js`, `changeOrders.js` (Linked Activity field + display + navigation on each),
`schedule.js` (Linked Records section, `window.PCC.schedule` export).

**Tested before delivery (10 + 24 checks, fresh session, all passed clean):**

- **Schema migration** (`test_store_schema_v22_migration.js`, 10 checks, replacing the v21 file
  per the "one canonical test targeting latest" pattern): a v20 dataset reaches v22 in one pass
  with Gate 9's fields AND Gate 10's `activity_id` correctly backfilled onto one existing record
  in every one of the six registers, every other field left untouched; the full legacy migration
  chain (no `schema_version` at all) still reaches v22 without throwing; a brand-new install;
  all six factories default `activity_id` to `""`.
- **End-to-end against the actual bundled `index.html`** (`test_activity_linking_e2e.js`, 24
  checks, not a reimplementation): each of the six registers' real Add form offers the Linked
  Activity select (populated with the seeded schedule's activities, labeled with the schedule
  name) and persists `activity_id` on submit, checked directly against the store; **two full
  bidirectional round trips** as the deep verification — a Risk's "View in Gantt" button lands on
  the correct activity's Detail Panel with that risk listed under Linked Records, and from there
  the RFI's own "View" button navigates to RFI/TQ with that exact entry expanded showing its own
  "LINKED ACTIVITY" row back; a second, unlinked activity correctly shows "LINKED RECORDS (0)"
  and the empty-state explanation rather than fabricated content; full route smoke test.
- **Real-browser verification** (Chromium via Playwright, both themes): seeded a risk and an RFI
  both linked to one activity, confirmed the Gantt's Linked Records section lists both with
  working View buttons, and confirmed the Risk Register's own details panel shows "LINKED
  ACTIVITY" with a working "View in Gantt" button — zero console/page errors throughout.

**What I have not tested:** this on your actual device. Per the usual gate discipline, treat this
as built-and-verified-in-this-environment, not confirmed — same standard as every prior gate.

## Gate 11 — Resource Management (2026-08-16)

The last item in Tier 2's locked build order: a shared, portfolio-wide resource pool (labor/
equipment/material), assignments to Schedule activities, and cross-project resource leveling —
a day-by-day usage histogram plus over-allocation detection, the same kind of resource histogram
commercial scheduling tools ship.

**Scope decided explicitly before building** (Aditya, this session, asked directly): **full
leveling**, not a bare register — an Assignments tab plus a Leveling tab with a real histogram and
over-allocation detection, not just CRUD. **No cost linkage** — quantity/availability only this
gate; rate × usage feeding Cost Tracking/EVM is deferred, matching the same "reconciliation stays
a deliberate, separate act" pattern Change Orders and Cost Tracking's Portfolio-budget fallback
already established.

**What changed and why:**

- **Schema v22 → v23**: two new shapes, deliberately **not** following the "project assignment is
  mandatory on every register" rule enforced everywhere else in this app. A **Resource**
  (`newResource`) — name, type (labor/equipment/material), unit, `max_availability` per day — is a
  shared, reusable ASSET, not an event or artifact that belongs to one project; forcing project
  assignment on it would be a modeling error. A **ResourceAssignment** (`newResourceAssignment`) —
  resource_id + activity_id + quantity — IS project-scoped, but transitively, through the activity
  it points at. That's also what makes real cross-project leveling possible at all: the same crane
  can be assigned to activities in two different projects' schedules, and the engine can catch the
  conflict precisely because assignments aren't siloed per project.
- **New pure module `resourceLevelingEngine.js`** (same "calculation only, no DOM" split every
  other engine here keeps): `computeResourceUsageTimeline()` does a day-by-day scan across
  **every** assignment for a resource regardless of which project its activity belongs to,
  returning allocated quantity per day plus which activities/projects contributed (so a conflict
  is explainable, not just flagged). `detectOverAllocations()` compares against
  `max_availability` — unset (null) means "not computable," never "zero capacity," same discipline
  `projectHealthEngine.js` established for a factor with no underlying data. Milestones and
  undated/zero-duration activities are excluded from allocation (a point in time doesn't consume a
  resource over a span) and counted, not silently dropped. `portfolioOverAllocationSummary()`
  rolls this up across every resource for quick "what's over-allocated right now" signals.
  `bucketTimeline()` buckets a long day range into weekly/monthly bars for the histogram, taking
  the **max** per bucket (not average) so a short sharp spike survives the chart.
- **New page `resources.js`** (route `#/resources`, sidebar entry under Planning): **Register**
  tab (CRUD, deleting a resource cascades to its assignments with a confirm naming the count, same
  pattern Activity delete already uses for its relationships); **Assignments** tab (Resource →
  Project → Activity dependent selects, the same `activityOptionsFor()` pattern Cost Tracking's
  Budget Item form established in Gate 7, plus a quantity, with "View in Gantt" on each row);
  **Leveling** tab (a portfolio-wide "currently over-allocated" summary up top, a per-resource
  picker below with KPI tiles, an SVG usage histogram — red bars where demand exceeds capacity,
  a dashed line at max availability — and a day-by-day conflict list naming exactly which
  activities/projects are contending for the resource, so there's something to actually act on,
  not just a red flag).
- **Cross-linked into everything Gate 8-10 already built**: resource assignments are a 7th source
  in the Gantt's Activity Detail Panel's Linked Records section (fits the same `activity_id`-driven
  array pattern the other six use, decorated with the resource's name since the assignment record
  itself doesn't carry one); Portfolio's Details panel gets a "RESOURCES ASSIGNED" section listing
  each resource assigned to that project with a portfolio-wide over-allocation flag when relevant;
  Executive Center gets a RESOURCES KPI section — **only once `data.resources.length > 0`**,
  completing the promise Gate 9 made when it explicitly skipped Resource KPIs because the module
  didn't exist yet.

**Changed:** `build.js` (JS_ORDER), `layout.js` (nav entry + page title), `app.js` (route),
`schedule.js` (7th Linked Records source), `portfolio.js` (Resources Assigned section),
`executiveCenter.js` (RESOURCES KPI section + context gathering). **New:**
`resourceLevelingEngine.js`, `resources.js`.

**Tested before delivery (13 + 15 + 25 checks, fresh session, all passed clean):**

- **Schema migration** (`test_store_schema_v23_migration.js`, 13 checks, replacing the v22 file
  per the "one canonical test targeting latest" pattern): a v20 dataset reaches v23 in one hop
  with Gates 9/10/11's fields all correctly added/backfilled; the full legacy chain and a
  brand-new install both reach v23 cleanly; `newResource()`/`newResourceAssignment()` factory
  defaults; `RESOURCE_TYPES` has all three types.
- **Engine, pure logic** (`test_resource_leveling_engine.js`, 15 checks): allocation across a
  span is start-inclusive/finish-exclusive; calculated dates preferred over planned; two
  overlapping assignments to the same resource sum correctly; **the core cross-project claim,
  verified directly** — the same resource assigned to two different projects' activities sums
  demand across both, with contributors correctly attributed to each project; milestones,
  undated activities, zero/missing quantity, and a deleted activity are all excluded and counted,
  never guessed or crashed on; `max_availability` unset correctly reads as "not computable" rather
  than zero capacity; over-allocated days are flagged exactly and only where demand exceeds
  capacity; the portfolio summary excludes resources with unset availability and resources with no
  conflicts; bucketing takes the max (not average) per bucket and handles an empty timeline.
- **End-to-end against the actual bundled `index.html`** (`test_resources_e2e.js`, 25 checks, not
  a reimplementation): seeded two projects with **overlapping activities** specifically to prove
  cross-project detection, not just within-one-schedule double-booking; added a resource and two
  assignments (one per project) through the real forms; the Leveling tab's portfolio summary and
  per-resource view both correctly flag the conflict, name the exact overlapping date, and list
  **both** contributing projects/activities in the conflict detail (the specific claim that proves
  this isn't just single-project math); the Gantt's Linked Records section lists the assignment
  and its "View" button lands on the Assignments tab; Portfolio's Details panel shows the
  over-allocation flag with a working View All link; Executive Center's RESOURCES section shows
  real assigned/over-allocated counts for a project with assignments, and still renders (correctly,
  since resources exist app-wide) rather than fabricating zeros for a second, resource-free
  project; deleting a resource cascades to its assignments with a confirm naming the count; full
  route smoke test including the new route.
- **Real-browser verification** (Chromium via Playwright, both themes, desktop and 375px mobile):
  the same cross-project scenario, confirming the histogram renders with red over-capacity bars
  and a dashed max-availability line, the KPI tiles and conflict list read cleanly in both themes
  — zero console/page errors throughout.

**What I have not tested:** this on your actual device. Per the usual gate discipline, treat this
as built-and-verified-in-this-environment, not confirmed — same standard as every prior gate.

## Gate 12 — In-App Excel Editor for Schedules (2026-08-12)

Requested directly (Aditya): when a schedule's Excel file is imported, it should be attached to
the project and editable **in PCC itself** — not downloaded, hand-edited in real Excel, and
re-imported — with the schedule updating automatically from those edits. This sits on top of the
existing Gate 2 import pipeline rather than replacing it.

**Scope decided before building:** the editable grid covers the same recognized columns Import
already understands (Activity ID, Name, Type, WBS Code/Name, Duration, dates, Predecessors, %
Complete, Discipline, Contractor, Responsible, Status, Notes) — not a generic spreadsheet grid with
arbitrary columns/formulas. Extra columns from the original file were never stored even before this
gate (Import only ever kept the *parsed* result), so there's nothing to preserve there. Edits apply
via an explicit "Review Changes" → "Apply to Schedule" step (not live-as-you-type) and update the
*same* schedule in place — no new revision — matching how hand-editing an Activity already works
today; only a fresh Import from a new file creates a new revision.

**What changed and why:**

- **The original Excel file is now actually stored.** Import always parsed the file but discarded
  the bytes afterward; `commitImport()` now writes them to `blobStore` (IndexedDB, keyed by the
  schedule's id — same store Documents/Photos already use) before writing the schedule record, so a
  schedule that claims a source file always genuinely has one. Schedules imported before this gate
  have no stored blob and just don't get an "Edit Excel" option — no attempt to fabricate one.
- **New "Edit Excel" toolbar button**, enabled only when the selected schedule has
  `source_file_name` set. Opens an in-page panel (not `window.open`, not a download) — the one thing
  explicitly ruled out, since Documents' existing "open original file" already downloads/new-tabs
  Word/Excel files and that's exactly what wasn't wanted here.
- **The grid is built from the schedule's current Activities/WBS/Relationships, not by re-parsing
  the stored file's bytes.** After the first Apply, the attached file is regenerated from exactly
  what was applied, so both stay in sync either way — but sourcing the grid from live data (rather
  than the file) means there's only ever one source of truth to keep consistent, not two.
- **Reuses `scheduleImportService.parseRows()` verbatim for Apply** — the grid's "Review Changes"
  step feeds its rows through the identical parser Import uses (same header-recognition, date/number
  validation, WBS-hierarchy derivation, predecessor-token parsing, and circular-dependency
  detection), via a new `CANONICAL_HEADERS` export that's the single source of truth for which
  columns the grid shows and what labels represent them — so grid edits can never be validated more
  loosely than a fresh Import.
- **`buildScheduleRecords()`** factored out of `commitImport()` so both a fresh Import (new schedule)
  and an Excel-edit Apply (existing schedule, in place) build WBS/Activity/Relationship records
  through identical logic — no separate, potentially-drifting copy for the "editing" path.
- **Hand-added-activity safety gate:** an activity added by hand on the Activities tab has no
  Activity ID, so it can't be represented in the grid at all — and Apply replaces a schedule's full
  activity list from the grid's contents. Rather than silently deleting such activities, Apply is
  blocked behind an explicit "N activities aren't from the Excel file — delete them and continue?"
  warning (same pattern as Import's existing duplicate-file warning) until acknowledged.
- **`ACTIVITY_TYPE_ALIASES` gained a `wbs_summary` (underscore) alias** — the raw value the app
  stores internally for that activity type — so a grid `<select>` round-trips through parseRows
  without tripping the "unrecognized activity type" warning on every single Apply.

**New file:** none (kept inside `scheduleImportService.js` and `schedule.js`, both already Gate 2's
home). **Changed:** `scheduleImportService.js` (`CANONICAL_HEADERS`, `wbs_summary` alias),
`schedule.js` (blob storage on import, `buildScheduleRecords()`, the full Excel-editor grid/review/
apply flow, shared `renderParsedIssuesToggle()`).

**Tested before delivery (4 pure-logic + 21 e2e checks, full suite re-run clean):**

- **Parser round-trip** (`test_schedule_import_service.js`, 4 checks): every `CANONICAL_HEADERS`
  label maps back to its own key with zero unrecognized-header warnings; the `wbs_summary` alias
  round-trips without a spurious type warning; status passes through as a raw key with no aliasing,
  matching what the grid's `<select>` stores.
- **End-to-end against the actual bundled `index.html`** (`test_schedule_excel_editor_e2e.js`, 21
  checks): a schedule seeded to look like a real import (source file, blob, two activities with an
  FS relationship, one WBS item) shows "Edit Excel" enabled and pre-populates the grid correctly,
  including reconstructing the Predecessors cell from the relationship; editing a name, adding a row,
  reviewing, and applying updates the store **in place** (same schedule id, revision stays 0) and
  rewrites the attached blob to a genuinely different value, not the placeholder; the hand-added-
  activity warning blocks Apply until acknowledged, then deletes it on confirm; full route smoke test
  across every page.
- **Real-browser verification** (Chromium via Playwright, screenshots reviewed): the grid, review
  step, and post-Apply state all render correctly with the dark theme; an edited activity name
  ("Excavate (Chromium Edit)") applied and appeared in the Activities tab immediately, with the
  success toast confirming the attached file was updated to match.

**What I have not tested:** this on your actual device. Same standard as every prior gate.

## Gate 13 — Vendor Management Module (2026-08-12)

Requested directly (Aditya) via a full feature spec: a "single source of truth" for vendor
information across every project — master list, project links, documents, meetings, RFI/TQ, risk,
and performance, all reachable from one vendor profile. Like Gate 12, this wasn't on the locked Tier
2/3 roadmap — it's a directly-requested addition, built in a separate parallel session alongside
Gates 8-11 above and reconciled into `main` together with them here.

**Architecture translation, decided before building:** the spec was written in general ERP language
("database design," "normalized tables," "foreign keys," "API endpoints," "the project's folder
structure") that doesn't map onto this app's actual architecture — no server, no SQL, no API layer,
just one JS object in `localStorage` plus IndexedDB for blobs (see "Architecture" above). Every
"table" in the spec became a flat array in `store.js` with id-string references, "foreign keys"
became the same convention every existing register already uses, and "API endpoints" simply doesn't
apply. "The project's folder structure" doesn't exist in this app either (see "On 'just save files
to a real folder automatically'" above) — vendor documents use `blobStore.js`, same as every other
file this app stores.

**Scope decisions made explicitly before building:**

- **Vendor Master is portfolio-wide, not project-scoped** — unlike Documents/Risk/RFI/Change Orders
  (which are mandatory-project registers per this file's own stated convention), a vendor is closer
  to a Project itself: one master record, linked to zero or more projects via a join array
  (`vendor_project_links`), each link carrying its own role/scope of work/contract status.
- **Vendor<->Meeting/RFI/Risk linking never touches meetings.js/rfis.js/risks.js.** Those three join
  arrays (`vendor_meeting_links`, `vendor_rfi_links`, `vendor_risk_links`) are populated entirely
  from the Vendor Profile side, and "open the real record" reuses those modules' own existing public
  `expandMeeting()`/`expandRfi()`/`expandRisk()` hooks (the same hooks Risk's "raise from meeting"
  flow already uses) rather than adding a field to their schemas. This is the literal reading of "do
  not modify or break existing modules" — those three files have zero changes in this gate.
- **RFIs and Technical Queries are one integration point, not two** — this app already stores them
  as a single register distinguished by a `type` field (the same "one shape, one type field" pattern
  this file documents for Risk/Issue/Opportunity), so `vendor_rfi_links` covers both.
- **Vendor Documents get an OPTIONAL `project_id`, breaking from the mandatory-project rule** on
  purpose: a vendor's GST certificate or insurance policy isn't "for" any one project, but a
  project-specific PO or M.O.M. genuinely is. Both needed to be representable, so this register is a
  deliberate, disclosed exception to that rule rather than an oversight.
- **Version history is real, not cosmetic:** every upload is its own row; re-uploading over an
  existing document creates a new row sharing that document's `document_group_id` with
  `revision_number` incremented. "Latest revision" is computed at render time (highest
  `revision_number` in the group), not a denormalized `is_latest` flag that could drift.
- **"Custom document categories added later"** doesn't need a schema change to satisfy: the 19
  categories from the spec are a fixed list plus "Other" with a free-text `custom_category_label` —
  the escape hatch a 20th category will need, decided now rather than guessed at.
- **Skipped:** the "Change Requests" vendor tab from the spec's profile-tabs list — Change Orders
  wasn't in the spec's own top-level integration list (Portfolio, Documents, Meetings, RFI, Risk,
  Project) and has no DB table in the spec's own database-design section either, so this reads as a
  spec inconsistency rather than a real requirement. AI document extraction/OCR/automation were
  explicitly excluded by the spec itself ("Tier 2... do not implement AI, OCR, document parsing").
- **"Preview" matches this app's existing behavior for stored files** (View/Download via a new tab —
  PDFs render inline, other types download, same as Documents' `openStoredFile()`) rather than
  building a second, richer preview system alongside the one Documents already has.
- **Overall performance rating is always computed** (average of Quality/Delivery/Communication/
  Safety, unrated categories excluded rather than dragging the score toward 0), never a
  separately-editable field that could disagree with its own inputs.

**What changed:** `store.js` (schema v23→v24: nine new arrays — `vendors`, `vendor_contacts`,
`vendor_project_links`, `vendor_documents`, `vendor_meeting_links`, `vendor_rfi_links`,
`vendor_risk_links`, `vendor_performance`, `vendor_notes` — plus `VENDOR_STATUSES`,
`VENDOR_DOCUMENT_CATEGORIES`, `VENDOR_PROJECT_CONTRACT_STATUSES`, `nextVendorCode()`, and nine new
factory functions). **New file:** `pages/vendors.js` — Dashboard (summary cards + recent activity),
Vendor Master list (search across vendor/company/contact/trade/project/document name, plus status/
project/trade/document-type filters), and a tabbed Vendor Profile (Overview, Projects, Contacts,
Documents, Meetings, RFI/TQ, Risks, Performance, Notes). **Changed:** `app.js` (route registration),
`layout.js` (sidebar nav under OVERVIEW next to Portfolio, matching its cross-project nature),
`build.js` (bundle order).

**Tested before delivery (7 pure-logic + 29 e2e checks + updated migration tests, full suite re-run
clean):**

- **Schema migration** (folded into the canonical `test_store_schema_v24_migration.js` at
  reconciliation time): a v19 dataset and a very old legacy dataset both migrate cleanly through to
  schema_version 24 with the new vendor arrays backfilled and no data loss to existing records.
- **End-to-end against the actual bundled `index.html`** (`test_vendors_e2e.js`, 29 checks): create a
  vendor with a primary contact (verifying the contact is upserted into `vendor_contacts`, not
  duplicated onto the vendor record); link a project with role/scope/contract status; add a second
  contact; a directly-seeded document displays correctly with category/expiry/tags, and uploading a
  new revision correctly increments `revision_number` while sharing `document_group_id`; linking an
  existing meeting/RFI/risk and clicking "View X" actually navigates to that module and reuses its
  real expand hook; a performance review's computed overall rating is hand-verified (4+5+3+4)/4 =
  4.0; a note is added and listed; the dashboard's summary cards and per-project breakdown reflect
  seeded data correctly; search-by-trade and status-filter both narrow the list correctly; deleting a
  vendor cascades to every linked record and its stored blob; full route smoke test.
- **Real-browser verification** (Chromium via Playwright, screenshots reviewed): the dashboard,
  vendor form, profile tabs, meeting-linking flow, document upload form, and performance tab all
  render correctly in the dark theme; a real end-to-end vendor creation → project link → meeting
  link → performance review flow was hand-verified, including the exact 4.5/5 overall rating
  computation ((5+4+4+5)/4) matching what real Chromium displayed.

**What I have not tested:** this on your actual device. Same standard as every prior gate.

## Portfolio ↔ Vendor Management linking (2026-08-12)

Requested directly (Aditya): linking a vendor to a project needed to be possible from the **project's
own page**, not only from the Vendor Profile's Projects tab — and changes from either side had to
show up on the other automatically.

That last part came for free from Gate 9's own design: `vendor_project_links` is one shared array,
not two copies, so any UI that reads/writes it is automatically in sync with every other UI that
does — no separate sync logic needed, ever. This change is purely a second UI surface onto that same
array.

**What changed:** Portfolio's project details panel (`renderProjectDetails()`) gets a new "VENDORS"
section, in the same read-summary-plus-"View All" style as its existing Risks/Meetings/Change Orders
sections — except this one also gets a "+ Link Vendor" quick-action (a plain vendor picker, no role/
scope/contract-status fields, since editing those stays the Vendor Profile Projects tab's job) and a
per-row "Unlink," since the ask was specifically for project-side linking capability, not just a
read-only summary. `renderProjectDetails()` now takes the page's `rerender` callback (previously
didn't need one, since every other section in it was purely read-only) so the new picker can update
the view after linking/unlinking. `vendors.js` gained `filterByProject()`, the same "View All" hook
every other register already exposes.

**Tested:** three new checks added to `test_vendors_e2e.js` (32 total in that file now): linking from
the Vendor Profile shows up correctly in Portfolio's Vendors section (role included); unlinking from
Portfolio removes it from the store and re-linking from Portfolio's picker restores it; the
Portfolio-made link is visible back on the vendor's own Projects tab. Full suite re-run clean.
Real-browser verification (Chromium via Playwright, screenshots reviewed): the Vendors section and
its Link Vendor picker render correctly and already-linked vendors are correctly excluded from the
picker's options.

## Gate 14 — Document Control 1: Master Document Repository (2026-08-18)

Requested directly (Aditya) via a full 14-gate Document Control specification: evolve Documents
from a flat file-upload register into a proper project document control system (requirements
before submission, revisions, schedule-driven due dates, vendor lookahead, readiness/constraint
flagging, dashboards, executive/portfolio compliance). Per the spec's own explicit instruction —
"do NOT build everything at once... start with the FIRST gate that is appropriate" — this delivery
is only Gate 1 of that 14-gate spec (numbered Gate 14 here, continuing this file's own running
count): the Master Document Repository. Every later gate in the spec (project-specific
requirements, nomenclature, status/revision workflow, schedule linking, vendor lookahead,
dashboards, ...) depends on document TYPES existing as real, addressable records — this gate is
that foundation, nothing more.

**Inspection before building, per the spec's own "verify first" instruction:** confirmed
`documents.js` is a flat upload register (project-scoped, 5 hardcoded categories, duplicate
detection via `duplicateService.js`, no requirement-before-submission concept, no revision
control, no status lifecycle) and that Vendor Management's `vendor_documents` (Gate 13) already
has a real revision-history pattern (`document_group_id`/`revision_number`) worth reusing as a
template later, but isn't linked to schedule activities. Critically: **no user-configurable
taxonomy register exists anywhere in this app yet** — every prior "types" list
(`DOCUMENT_CATEGORIES`, `VENDOR_DOCUMENT_CATEGORIES`, `RESOURCE_TYPES`, `COST_CATEGORIES`) is a
hardcoded JS array the user can't add to, edit, or deactivate. That gap is exactly what Gate 1 of
the spec asks for, and it's a genuine prerequisite for every later gate — confirming the spec's
own suggested starting point was also this codebase's actual starting point.

**Scope decided before building:**

- **This is only the master repository** — a flat, portfolio-wide list of document type
  *definitions* (BOQ, ITP, Method Statement, ...). It does not decide which types apply to which
  project (a later "project-specific document requirements" gate) and does not touch
  `documents.js`'s existing `category` field or Vendor Management's `VENDOR_DOCUMENT_CATEGORIES`
  — reconciling those into one classification scheme is real design work for a later gate, not
  this one. Nothing existing was changed to make room for this.
- **Seeded, not empty, on day one** — pre-populated with the ~28 example document types the spec
  itself enumerated (Contract, BOQ, Specifications, Drawings, ..., Closeout Documents), each with
  a short code (for a later nomenclature gate), a free-text category bucket, and
  `default_criticality: "normal"`. Every seeded criticality is deliberately "normal," not guessed
  higher — that's a project-specific judgment call for the user to set, not something this app
  should presume on their behalf just because it seeded the type. Fully editable/deactivatable/
  deletable afterward; this is a starting point, not a locked list.
- **Deactivate, not just delete, as the primary retirement path** — so a type referenced by id
  from a later gate's requirements keeps working even if retired from active use. Hard delete is
  also offered since nothing in the app references `document_types` yet this gate; once a later
  gate adds real references, delete should get a usage guard the same way Resources' delete
  already warns about cascading assignment deletes.
- **`category` and `code` are free text**, not enums — same convention this app already uses for
  Activity's `discipline` and Vendor's `category`/`trade_discipline` (open-ended classification
  fields stay free text rather than guessing a fixed taxonomy the spec didn't actually enumerate).

**What changed:** `store.js` (schema v24→v25: `document_types` array, `newDocumentType()`
factory, `DOCUMENT_TYPE_CRITICALITY_LEVELS` constant, `seedDocumentTypes()` helper shared by
`emptyData()` and the migration so a fresh install and an upgraded existing install both get the
same seeded starting point). **New file:** `pages/documentTypes.js` — search/category/active
filters, add/edit form, deactivate/reactivate toggle, delete, and a small public
`window.PCC.documentTypes.activeTypes()` API for later gates to read the active portion of the
repository without reaching into this page's own UI state. **Changed:** `app.js` (route
registration), `layout.js` (sidebar nav under REGISTERS next to Documents), `build.js` (bundle
order).

**Tested before delivery (22 pure-logic + 25 e2e checks + updated migration tests, full suite
re-run clean):**

- **Schema migration** (`test_store_schema_v25_migration.js`, renamed from the v24 file per this
  project's "one canonical test targeting latest" convention): a v20 dataset and a very old
  legacy dataset both migrate cleanly through to schema_version 25 with `document_types` seeded
  (not left empty) and every seeded entry active; a brand-new install gets the same seed list;
  `newDocumentType()` defaults verified (`active: true`, `default_criticality: "normal"`, unique
  ids); seed list checked for no duplicate ids.
- **End-to-end against the actual bundled `index.html`** (`test_document_types_e2e.js`, 25
  checks): the seeded repository renders on first navigation; add/edit through the real form
  persists correctly with no duplicate record created on edit; deactivate hides a type from the
  default (active-only) view and Show Inactive reveals it marked INACTIVE; reactivate restores
  it; search narrows the list by name/code; `activeTypes()` correctly excludes deactivated types;
  delete removes the record; full route smoke test across all 16 routes including the new one.
- **Real-browser verification** (Chromium via Playwright): the seeded list, add form, and
  deactivate/reactivate toggle all render and function correctly in the dark theme; regression-
  checked that Documents' existing 5-category upload form and Vendor Management's own document
  category list are both untouched by this gate.

**What I have not tested:** this on your actual device. Same standard as every prior gate. Also
not done, deliberately, per the spec's own incremental-gates instruction: everything from Gate 2
of the Document Control spec onward (project-specific requirements, nomenclature validation,
status/revision workflow, schedule linking, vendor lookahead, dashboards, executive/portfolio
compliance) — this delivery is the foundation only.

## Gate 15 — Document Control 2: Project-Specific Document Requirements (2026-08-18)

Second gate of the 14-gate Document Control spec: not every document type in Gate 14's master
repository applies to every project — a manufacturing project has no use for a Baseline Programme
the way an EPC contract does. This gate is where a project's applicable subset gets selected,
kept editable throughout the project's life, and — per the spec's own explicit constraint — never
written back into the master repository itself.

**Scope decided before building:**

- **A flat join, same convention as `vendor_project_links`:** `project_document_requirements` is
  one row per (project, document_type) pairing, and a row's mere existence means "applicable to
  this project." No boolean flag that could sit in a false/undecided state, no fields beyond the
  pairing itself — due dates, status, and submission tracking are later Document Control gates'
  job (schedule linking, status/revision workflow), not this one. This gate only answers "does
  this type apply to this project."
- **Lives in Portfolio's project details panel**, not a new page — a new "DOCUMENT REQUIREMENTS"
  section next to the existing ATTACHMENTS/VENDORS/RESOURCES ASSIGNED sections, collapsed by
  default behind a "Manage" toggle (a full checklist of every active type would otherwise
  dominate an already-dense panel). Checking/unchecking a box toggles the join row immediately —
  no separate save step, matching how every other quick-toggle in this panel already works.
- **"Apply Template" is additive-only, and matches by name, never by touching `document_types`.**
  The five suggested templates (EPC, Industrial Construction, Manufacturing, Infrastructure,
  Energy — `PROJECT_TEMPLATES` in `store.js`) are hardcoded lists of suggested type *names*.
  Applying one adds a requirement for every ACTIVE type whose name matches, skips a name with no
  matching active type rather than fabricating one, and never removes an existing selection or
  edits a `document_types` record — "templates should only provide suggested document
  requirements... I must still be able to modify them," per the spec. Re-applying the same
  template is a safe no-op past the first pass (nothing to add twice).
- **Deactivating a document type (Gate 14's own control) hides it from the checklist going
  forward, but does not retroactively delete a requirement a project already selected for it** —
  a project's existing decision isn't silently revoked just because the type was later retired
  from the active list; it simply stops being offered as a *new* selection.

**What changed:** `store.js` (schema v25→v26: `project_document_requirements` array,
`newProjectDocumentRequirement()` factory, `PROJECT_TEMPLATES` constant — five templates whose
suggested names were all verified to match Gate 14's own seed list, so templates are usable out
of the box on a fresh install, not just in principle). **Changed:** `pages/portfolio.js` — new
`renderDocumentRequirementsSection()`, inserted into `renderProjectDetails()` right after
ATTACHMENTS; two new `uiState` fields (`docRequirementsOpen`, `docRequirementsTemplate`).

**Tested before delivery (25 pure-logic + 26 e2e checks + updated migration tests, full suite
re-run clean):**

- **Schema migration** (`test_store_schema_v26_migration.js`, renamed from the v25 file): the
  full v20→v26 chain and a legacy/brand-new install both land correctly with
  `project_document_requirements: []`; `newProjectDocumentRequirement()` factory defaults
  verified; every `PROJECT_TEMPLATES` suggested name checked against the actual seeded
  `document_types` list so a mismatched template name would fail this suite, not surface silently
  as "nothing happened" in the UI later.
- **End-to-end against the actual bundled `index.html`** (`test_project_document_requirements_e2e.js`,
  26 checks): a new project starts at 0 of N requirements; the checklist is collapsed by default
  and expands via Manage; checking/unchecking a box adds/removes exactly one join row (not a
  hidden flag); applying the EPC template adds exactly the matching-name count with zero
  duplicates on a second apply; the master `document_types` array is byte-for-byte unchanged
  (same length, same ids) after every operation above; deactivating a type removes it from the
  checklist's "of N" total while leaving an already-selected project's requirement for it intact;
  full 16-route smoke test.
- **Real-browser verification** (Chromium via Playwright): the checklist renders grouped by
  category with correct checkbox state; applying the Infrastructure template visibly checked
  exactly its 18 matching types with a toast confirmation; regression-checked that Documents'
  upload form, Document Types' master list, and Vendor Management are all untouched.

**What I have not tested:** this on your actual device. Same standard as every prior gate. Not
done, deliberately: Document Control gates 3-14 (nomenclature, status/revision workflow, schedule
linking, vendor lookahead, dashboards, executive/portfolio compliance) — still just the next
incremental piece of the foundation, not the whole system.

## Gate 16 — Document Control 3: Classification + Nomenclature (2026-08-18)

Third gate of the 14-gate Document Control spec, and the spec's own gate list bundles these two
together (Gate 3 — Classification + Nomenclature) rather than as separate items, so this delivery
does too. Documents move from "just a category + optional links" to carrying real classification
metadata, and uploads get a non-blocking naming-convention check.

**Scope decided before building:**

- **Classification fields are additive on top of the existing `category` field, not a
  replacement.** `documents.js`'s existing 5-value category and everything that reads it (upload
  form, filtering) is completely untouched — reconciling `category`/`VENDOR_DOCUMENT_CATEGORIES`/
  the Gate 14 master repository into one scheme was explicitly deferred when Gate 14 shipped, and
  stays deferred here; this gate adds new, independent fields alongside it.
- **`document_type_id` links to Gate 14's master repository**; `criticality` is suggested from
  that type's own `default_criticality` when picked, but stays independently editable — the same
  "suggested, not enforced" relationship Gate 15's templates have with the master repository, not
  a new pattern invented for this gate.
- **`package` and `contract_or_po` are free text, not real entities.** No Package/Contract/PO
  model exists anywhere in this app (confirmed during Gate 14's own inspection), and building one
  now would be commercial-module scope, not classification scope. Free text captures the
  reference without pretending it's a modeled relationship it isn't.
- **`vendor_id` reuses the existing Vendor Master** (Gate 13) — no new vendor data, just a link,
  with a "View Vendor" quick-nav button matching the existing "View Meeting"/"View in Gantt"
  pattern on the same row.
- **Nomenclature is warn-only, exactly per the spec's explicit "do not silently reject the
  document."** A configurable pattern (default `PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV`,
  editable in Settings, with an on/off toggle) is checked against the filename at upload time;
  a mismatch shows the expected name and never blocks or gates the Save button. Requires a new
  `project_code` field on Project (didn't exist before — added minimally, optional, for the
  PROJECT token specifically) since the spec's own example (`ABC-ELE-RFI-001-REV02`) needs a
  short project identifier that nothing in this app previously modeled.
- **The nomenclature check is a pure, standalone engine** (`documentNomenclatureEngine.js`, zero
  DOM/store access, same separation as every other engine in this app) — token substitution and
  case-insensitive, extension-agnostic comparison only; `documents.js` is the only place that
  gathers real values and renders the result.

**What changed:** `store.js` (schema v26→v27: `project_code` on `newProject()`; `document_type_id`
/`discipline`/`document_number`/`revision`/`package`/`contract_or_po`/`vendor_id`/`priority`/
`criticality`/`remarks` on `newDocument()`; `settings.document_nomenclature_pattern`/
`document_nomenclature_enabled`). **New file:** `documentNomenclatureEngine.js` (pure). **Changed:**
`pages/documents.js` (a new "Classification (optional)" field group in the upload form, a
non-blocking nomenclature notice, "View Vendor" quick-nav, classification metadata shown on each
document row), `pages/portfolio.js` (Project Code field in the Add/Edit form and details grid),
`pages/settings.js` (a new "Document Nomenclature" panel: enable toggle + pattern input),
`build.js` (bundle order).

**Tested before delivery (35 pure-logic + 26 e2e checks + updated migration tests, full suite
re-run clean):**

- **Schema migration** (`test_store_schema_v27_migration.js`, renamed from the v26 file): the
  full v20→v27 chain and a legacy/brand-new install both land correctly with every new field
  backfilled/defaulted (`project_code: ""`, `revision: "00"`, `priority: "medium"`, nomenclature
  settings defaulted), and the pre-existing `category` field confirmed completely untouched.
- **Pure engine logic** (`test_document_nomenclature_engine.js`, 8 checks): token substitution
  with all tokens present, with blanks (including the literal token `REV` itself resolving
  correctly), a custom pattern with a different separator/order, extension-stripping, and
  case-insensitive match/mismatch comparison, including the all-blank-tokens edge case.
- **End-to-end against the actual bundled `index.html`** (`test_document_classification_e2e.js`,
  26 checks): Portfolio's Project Code field persists; the Documents upload form's Document
  Type/Vendor selects are populated from the real store; picking a Document Type auto-suggests
  (and lets you override) Criticality; the existing Category field's 5-value list is unchanged;
  a document's classification metadata (type name, discipline, number+revision, vendor) displays
  correctly on its row; "View Vendor" navigates to and opens that vendor's real profile; the
  Settings nomenclature pattern and enable-toggle persist; the master `document_types`/`vendors`
  lists are confirmed unchanged throughout; full 16-route smoke test. The real file-driven
  upload+extraction pipeline itself isn't jsdom-testable in this codebase (documented precedent
  from Gate 10's own e2e test), so this file covers everything reachable without picking a file.
- **Real-browser verification** (Chromium via Playwright, a hand-built minimal valid PDF used to
  actually exercise the file-driven upload path jsdom can't): uploading `wrong-name.pdf` showed
  "Filename doesn't match the configured naming convention. Expected: “ABC-ELE--001-REV02”"
  (DOCUMENTTYPE blank since no type was picked in that pass); uploading
  `ABC-ELE-RFI-001-REV02.pdf` with Document Type = RFIs and matching classification fields showed
  "Filename matches the configured naming convention." — confirming the full pattern
  substitution, PDF extraction, and non-blocking warning/confirmation UI all work together
  end to end, not just in isolation.

**What I have not tested:** this on your actual device. Same standard as every prior gate. Not
done, deliberately: Document Control gates 4-14 (status/revision workflow, schedule↔document
linking, vendor lookahead, readiness/constraints, reminders, dashboards, executive/portfolio
compliance) — this is still the classification foundation, not the workflow on top of it.

## Locked build order (unchanged)

**Tier 1** (complete): Portfolio → Documents → Daily Site Log → Risk/Issue Register → Meetings →
RFI/TQ → Change Management → Basic Reporting → Backup & Recovery

**Tier 2** (complete — Schedule import, CPM/float engine, interactive Gantt, Cost Tracking, the
EVM engine, and Resource Management are all done): Schedule import (Excel/MSP first) + CPM/float
engine + Gantt (visualization, then Gate 8's editing) → Cost tracking → EVM engine → Resource
Management (Gate 11 — register + assignments + cross-project leveling, no cost linkage)

**Project Executive Center** (Gate 9, done) — sits above Tier 2 rather than inside its original
line items, per the architecture this gate was built against: Project → the operational modules
(Schedule/Cost/Risk/RFI/Change/Meetings/etc.) → **Project Executive Center** → Management Pack.
Consumes Tier 2's data, adds nothing that duplicates it. Portfolio-level executive dashboard
enhancements beyond what Dashboard already shows (portfolio-wide filtering by client/country/
sector/PM/date range) are still open — noted as follow-on work, not done here.

**Activity Linking** (Gate 10, done) — Risk/Issue/Opportunity, RFI/TQ, Meetings, Documents, Daily
Log, and Change Orders can each optionally link to one Schedule activity, surfaced bidirectionally
(each register's own details, and the Gantt's Activity Detail Panel's Linked Records section).

**In-App Excel Editor** (Gate 12, done) and **Vendor Management** (Gate 13, done) — both directly
requested ad hoc additions, same footing as Executive Center/Activity Linking above rather than
line items on the original locked Tier 2/3 list. Built in a separate parallel session alongside
Gates 8-11 and reconciled into `main` together with them (see each gate's own write-up above for
the schema-numbering note on how the reconciliation renumbered them).

**Document Control** (Gates 14-16 = Document Control gates 1-3 of a separate 14-gate sub-spec,
done) — same footing as Executive Center/Activity Linking/Vendor Management above: a directly
requested, explicitly incremental upgrade to Documents, not a Tier 1/2/3 line item. The Master
Document Repository (the type taxonomy, Gate 14), Project-Specific Document Requirements (which
types apply to which project, Gate 15), and Classification + Nomenclature (document-level
metadata + a non-blocking naming-convention check, Gate 16) are built; Document Control gates
4-14 (status/revision workflow, schedule↔document linking, vendor lookahead,
readiness/constraints, reminders, dashboards, executive/portfolio compliance) are intentionally
not started — see Gates 14-16's own write-ups above.

**Tier 3 (deferred until Tier 1 is in daily use):** AI Document Processing, Knowledge Base, AI Project
Assistant, Lessons Learned, final polish

## Next phase

**Tier 2 is complete**, and Vendor Management / the in-app Excel editor / the Document Control
foundation (repository + per-project requirements + classification/nomenclature) are all done
alongside it. The most likely next piece of work is **Document Control gate 4 (status + version
control)** — a real submission/review/approval lifecycle and revision history for documents,
following Vendor Management's own `document_group_id`/`revision_number` pattern as the natural
template — per the sub-spec's own locked gate order, but confirm scope before starting it rather
than assuming, same discipline as every gate before this one. Other open items, none blocking
daily use: rate × usage from Resource Management feeding Cost Tracking/EVM (explicitly deferred,
Gate 11); a persisted/logo-customizable report-template system; portfolio-level executive
dashboard filtering; 10,000+ activity Gantt virtualization; per-activity linking extended to
Resource Assignments' own sub-fields if that turns out to matter in practice; Vendor↔Cost/Schedule
integration beyond the current Vendor↔Project/Meeting/RFI/Risk links, if that turns out to matter
in practice; reconciling Documents' `category` / Vendor Management's document categories / the
Gate 14 master repository into one classification scheme, explicitly deferred twice now (Gates 14
and 16) — worth revisiting once real usage shows whether it's actually needed. Tier 3 (AI Document
Processing, Knowledge Base, AI Project Assistant, Lessons Learned, final polish) remains deferred
until Tier 1/2 are in daily use.
