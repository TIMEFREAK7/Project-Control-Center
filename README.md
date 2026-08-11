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

## Locked build order (unchanged)

**Tier 1** (complete): Portfolio → Documents → Daily Site Log → Risk/Issue Register → Meetings →
RFI/TQ → Change Management → Basic Reporting → Backup & Recovery

**Tier 2** (in progress — Schedule import, CPM/float engine, and Gantt are done; next up is Cost
tracking): Schedule import (Excel/MSP first) + CPM/float engine + Gantt → Cost tracking → EVM
engine → Resource Management

**Tier 3 (deferred until Tier 1 is in daily use):** AI Document Processing, Knowledge Base, AI Project
Assistant, Lessons Learned, final polish

## Next phase

Tier 2 continues with Cost tracking (budget vs. actuals) — scope to be decided explicitly before
building, same as every prior gate.
