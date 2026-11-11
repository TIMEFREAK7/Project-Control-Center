# PCC Deferred-Items Roadmap — master prompt

Saved in the repo on purpose: the PCC Evolution Roadmap and the engineering master prompt were
only ever pasted into chat, so later sessions couldn't tell what was done (see HANDOFF.md's
superseded 2026-08-19 snapshot). This file is the source of truth for the work below. Update
each gate's **Status** line when it closes.

Compiled 2026-09-25 from every "deferred / not done / skipped" note in README.md and HANDOFF.md,
each checked against the code at `edcedbd`. Items that turned out to be already built (portfolio
filtering, Gantt readiness flag, configurable reminder windows, Daily Log photos, fuzzy search,
Spreadsheet Review) are not listed.

**Added 2026-11-11** from a whole-project audit at `e29740e`: Phase 0.5 (hardening), Phase 6
(foundation and maintenance) and Phase 7 (visual refresh). The same gate process and test gate
apply to all three.

---

## How to work through this (read before any gate)

You are working on Project Control Center. Read `CLAUDE.md`, then the relevant `README.md` /
`HANDOFF.md` sections, before touching code. Then, for every gate:

1. **Inspect first.** Confirm against the real code that the gap still exists. Backlog notes in
   this repo have been stale before. If it's already done, say so and close the gate.
2. **Propose the gate's exact scope** (what's in, what's out, schema impact, files touched) and
   **wait for Aditya's confirmation**. Use `AskUserQuestion` for genuine choices.
3. **Build exactly that.** No extra features, and nothing from a later gate.
4. **Pass the test gate** (below).
5. **Ship it**, following the CLAUDE.md shipping conventions:
   - Merge to `main`.
   - Build the end-user zip, verified by a fresh extraction in Chromium.
   - Update `HANDOFF.md` and send it.
   - Update this file's Status line.
6. **STOP.** Report, then wait for approval before the next gate. Never chain gates.

### Rules every gate keeps

- **Offline and single-file.** `index.html` still opens via `file://` with zero install. No
  new runtime dependency, no CDN, and no cloud calls.
- **React never owns calculations.** Services call the real engines (`costEvmEngine.js`,
  `scheduleCpmEngine.js`, `delayImpactEngine.js`), and new maths goes into those engines as
  pure functions with unit tests.
- **Never rewrite a user's record on their behalf.** Links, matches, suggestions and migrations
  are opt-in and confirmed by the user. Old values are kept, never deleted.
- **Change Orders never write to `contract_value`.** Project assignment stays mandatory, and
  reports stay printable HTML.
- **Schema bumps:**
  - Each bump needs a migration step and a `tests/test_store_schema_v<N>_migration.js`.
  - Each bump updates the tests that hardcode the version: 43 `schema_version, 67` assertions
    across 7 files today. Gate 0.2 exists to shrink that.
  - `migrate()`'s backfill safety net is for whole missing keys only; new fields still need
    their own step.
- **Dates** follow `window.PCC.dates`, the local zone, never `toISOString().slice(0,10)`.
- **Shared-code blast radius:**
  - A change to `store.js`, `projectContext.js`, `notifications.js`, or to Dashboard, My Work,
    Action Centre, Portfolio or their services, also changes the At a Glance app. Run
    `node mirror-app/build.js` too.
  - A `delay_records` label or status change must update BOTH `scheduleService.ts` and
    `delayRecoveryDashboardService.ts`.
- **AI rules (Phase 3):**
  - Windows (Electron) only, through `window.PCC.ollama`. Off by default.
  - One pure prompt-builder per capability in `react/src/services/ollamaService.ts`. It reads
    only already-computed or already-extracted data, never runs a second calculation or a
    second parse, and caps injected text as `REVIEW_TEXT_CHAR_CAP` does.
  - Every figure in a prompt comes from the engines.
  - AI output is a draft or a suggestion. It never writes to the store without a click per item.
  - The button is absent when `isOllamaAvailable()` is false.

### Test gate (a gate isn't done until all of these pass)

1. `npx tsc --noEmit` is clean in `react/` (and `mirror-app/` if touched). Run `node build.js`
   (plus `node mirror-app/build.js` if relevant).
2. **New tests run against the real bundle**, following existing patterns:
   - jsdom e2e against `index.html` with fake-indexeddb;
   - pure-engine unit tests for new maths;
   - a migration test for any schema bump;
   - for AI gates, a stubbed `window.PCC_ELECTRON.ollamaGenerate` that captures the prompt, and
     assertions that it contains specific real seeded data;
   - add each new file to `tests/package.json`'s test chain.
3. **Each new test proven to fail against the pre-change build** (control run), then pass.
4. **Full suite green in UTC AND `TZ=Asia/Kolkata`** (`cd tests && npm test`). Date-sensitive
   tests pin IST themselves.
5. **Real Chromium pass** at desktop (1440×900) and phone (412×915):
   - zero console errors;
   - no horizontal scroll;
   - screenshots sent to Aditya at meaningful states (empty, populated, error);
   - `pcc-visual-qa` skill for UI gates.
6. **Adversarial re-read of the diff** before merging.
7. **Docs updated:** CLAUDE.md (new conventions and gotchas), README.md (a gate write-up saying
   what was decided and why), HANDOFF.md, and this file's Status line.
8. **Installers are built only when Aditya asks.** Then bump `versionCode`/`versionName` for each
   Android app you build, and `packaging/package.json`'s version. Verify signatures, alignment,
   the byte-identical embedded `index.html`, and the SHA-256.

---

## Phase 0 — Verification debt and housekeeping (do first)

**Gate 0.1 — Device verification (Aditya on his phone, no code unless something fails).**
- **Check:** At a Glance 1.9's folder picker:
  1. pick the folder;
  2. data loads;
  3. force-close and reopen, and it still loads without picking again;
  4. switch back to the app after a sync, and it refreshes.
- Also check the main app's predictive-back gesture.
- **If anything fails:** root-cause it from the on-screen message, fix it, and ship a new APK
  (versionCode 11+).
- **Status:** open.

**Gate 0.2 — Make schema bumps cheaper (tests only).**
- Replace boot-check `schema_version` assertions with `>=` checks, or read the expected value
  from `store.js`.
- Keep exact numbers only in the dedicated `test_store_schema_v*_migration.js` files, as
  HANDOFF.md's own lesson recommends.
- **Test gate:** the full suite is green, and a trial bump of `SCHEMA_VERSION` to 68 (reverted
  afterwards) breaks only migration tests.
- **Status:** open.

**Gate 0.3 — Record decisions (docs only).** Record these in README.md and HANDOFF.md so no
future session re-opens them by accident:
- **Closed:**
  - `.mpp` import (no viable dependency-free parser);
  - UI/UX Overhaul Gate 6 (superseded by the 12-gate PCC Redesign and the React migration);
  - title-block DOM split (header space at phone width is used up);
  - Content Security Policy (it would need `'unsafe-inline'`);
  - a separate Spreadsheet Review capability (it already exists inside Document Review);
  - AI on Android (it would expose Ollama on the LAN with no authentication).
- **Ask Aditya:**
  - what produces `.sml` and `.plf` files;
  - to paste the engineering master prompt's Phases 8–9 (never saved), then add them to this
    file.
- **Status:** open.

---

## Phase 0.5 — Hardening (added 2026-11-11, do before any Phase 1+ feature)

Found by the 2026-11-11 whole-project audit (130/130 test files green, both builds current, 29
pages clean in Chromium at the time). Each finding below was measured against the code at
`e29740e`. These come first because every later phase adds data to a store with a hard ceiling
and features behind parsers that read untrusted files.

**Gate H.1 — Turn off script evaluation in the PDF parser (no schema change).**
- **Gap:** the bundled pdf.js is 3.11.174 and both call sites leave `isEvalSupported` at its
  default (on): `src/js/fileViewer.js` (`getDocument({ data: ... })`) and
  `react/src/services/documentsService.ts` (`.getDocument({ data: typedArray })`). That version
  range is covered by CVE-2024-4367 (fixed upstream in 4.2.67): a crafted font in a PDF runs
  script in the page. The exploit was NOT reproduced here; the version, the default and the
  `new Function("c","size",…)` code path in `pdf.min.js` were confirmed.
- **Why it matters here:** pdf.js runs on the main thread in this app (no `workerSrc`), so such
  script would run with full access to `window.PCC` and `window.PCC_ELECTRON`. It is the same
  class as the Word-preview hole closed on 2026-09-24.
- **Build:** pass `isEvalSupported: false` at both call sites. Grep for any third
  `getDocument(` first.
- **Out:** upgrading pdf.js to 4.x (ES-module only; a much larger change to `build.js`). Record
  that as a closed decision unless H.1 turns out not to be enough.
- **Tests:**
  - e2e: wrap `window.pdfjsLib.getDocument`, open a PDF through the viewer and through the
    Documents upload/extraction path, and assert both calls carried `isEvalSupported === false`;
  - control run proving the old build fails that assertion;
  - the existing PDF tests (`test_pdf_layout_aware_extraction_e2e.js`,
    `test_file_viewer_gate2_e2e.js`) still pass, and a real PDF still previews and extracts
    text in Chromium.
- **Status:** open.

**Gate H.2 — Refuse data saved by a newer app version (no schema change).**
- **Gap:** `migrate()` has no upper bound. Measured: a file with `schema_version: 999` imported
  with no error and the store kept 999. Three apps ship on separate schedules, so an older
  build WILL eventually meet newer data.
- **Build:** one shared check (in `store.js`, exported so the mirror app reuses it) applied at
  every entry point:
  - `importFromJsonString` and `importFromSqliteBackup`: reject, store untouched, message
    "This file was saved by a newer version of Project Control Center. Update this app, then
    import again.";
  - `load()` from `localStorage` (an older build installed over newer data): do NOT migrate and
    do NOT autosave over it. Show a blocking message with an "Export this data" action. This is
    the case that can destroy data, so it needs the most care;
  - `mirror-app/src/mirrorRead.ts`: show the same message in the mirror status line and keep
    the previously loaded data on screen.
- **Out:** forward-compatibility ("best effort" reading of newer files).
- **Tests:**
  - import of a v(SCHEMA_VERSION+1) file is rejected and the store is byte-identical before
    and after;
  - a `localStorage` payload from the future survives a boot unchanged (read the raw key back);
  - control run on the old build;
  - mirror app in Chromium at 412×915 with the mocked plugin returning a future file.
- **Blast radius:** `store.js` is shared, so rebuild and re-check the mirror app.
- **Status:** open.

**Gate H.3 — Storage meter and pre-flight size check (no schema change).**
- **Gap:** everything except file bytes lives in ONE `localStorage` value
  (`pcc_local_data_v1`). Measured in Chromium: 6,000 bare activities saved (4.73M characters);
  at 7,500 (5.90M) the save failed and a reload returned 6,000. The wall is about 5.2M
  characters. An activity is about 800 characters, a relationship about 220, and each
  document's extracted text is stored in the same value, capped at 50,000 characters. The
  failure IS reported (toast plus "NOT SAVED" in the footer), but nothing warns beforehand,
  and Storage Management only measures file blobs.
- **Build:**
  - A pure function in `storageAnalyticsEngine.js`: total serialized size, percentage of the
    limit, and size per top-level collection (largest first).
  - Storage Management: an "App data" panel showing that meter and the per-collection
    breakdown.
  - One warning toast per session at 80%, with a link to Storage Management.
  - Pre-flight on the three bulk entry points (schedule import, JSON import, document text
    extraction save): if the result would not fit, refuse BEFORE committing and say why,
    instead of accepting in memory and failing to save.
- **Out:** moving the data (that is Gate 6.2); any automatic pruning.
- **Tests:** engine unit tests (empty, typical, over the limit); e2e for the panel, the 80%
  toast firing once, and a refused over-size import leaving the store unchanged; control run.
- **Hand-off:** ask Aditya for the meter reading on his real data. Gate 6.2 depends on it.
- **Status:** open.

**Gate H.4 — Update the spreadsheet parser (no schema change).**
- **Gap:** `src/js/vendor/xlsx.core.min.js` is SheetJS 0.18.5, the last version on npm. It has
  two published advisories fixed later (prototype pollution, fixed in 0.19.3; a regular
  expression denial of service, fixed in 0.20.2), and it parses user-supplied files in
  `fileViewer.js`, `documentsService.ts` and `scheduleService.ts`.
- **Inspect first:** confirm the advisories against SheetJS's own notes, confirm the current
  release and its licence, and check whether the container can reach `cdn.sheetjs.com` (newer
  builds are not on npm). Also record the bundled ExcelJS version (file header says
  19-10-2023) and whether it has open advisories.
- **Build:** replace the vendored file with the current `xlsx.core.min.js`. No API changes are
  expected. Keep the date-cell rule: `dateCellToIso()` must still read SheetJS dates in the
  device's zone (`test_time_zone_setting_e2e.js` and `test_local_dates_ist_e2e.js` pin this).
- **Tests:** the whole suite in UTC and `TZ=Asia/Kolkata`; a real .xlsx schedule import, an
  "Edit Excel" round trip and a spreadsheet preview in Chromium.
- **Status:** open.

---

## Phase 1 — Cost controls

**Gate 1.1 — Commitments in the cost forecast (no schema change).**
- **Gap:** `costEvmEngine.js` ignores `commitments`, so EAC = BAC/CPI can't see a signed PO
  until it's invoiced.
- **Build:**
  - A pure engine function for open commitment exposure (approved or committed value minus the
    live sum of linked `cost_actuals`, never below zero).
  - A second, labelled forecast: EAC(committed) = AC + open commitments + uncommitted remaining
    budget.
  - Show it next to the existing EAC on Cost and Executive Center, and feed it to
    `buildProjectReportPrompt`.
- **Out:** changing CPI/SPI or the existing EAC; any write to `contract_value`.
- **Tests:**
  - engine unit tests: none linked, partly invoiced, over-invoiced, cancelled or draft
    commitments;
  - e2e: both figures render;
  - a control run proving the old build lacks the new figure.
- **Status:** open.

**Gate 1.2 — Vendor ↔ Cost link (schema → 68).**
- **Gap:** `cost_actuals.vendor` is free text. Commitments already have `vendor_id`.
- **Build:**
  - Optional `vendor_id` on `cost_actuals`, backfilled `""`, with the free text kept.
  - A vendor picker on the actual-cost form.
  - A per-row "Link to vendor…" action with suggested matches (fuzzy on name); the user
    confirms each one. No bulk automatic matching.
  - A read-only **Cost** tab on Vendor Profile showing commitments, actuals and
    invoiced-vs-committed per project.
- **Tests:**
  - migration v67→v68;
  - linking one row changes only that row;
  - the Cost tab totals match the engine;
  - an unlinked free-text row is still shown.
- **Status:** open.

**Gate 1.3 — Portfolio cost position (conditional on 1.1).**
- Only if Aditya still wants it: a Dashboard chip built from Gate 1.1's per-project figures,
  never a raw sum.
- Resource and vendor "position" stay out unless separately justified.
- **Status:** open, conditional.

---

## Phase 2 — Document classification

**Gate 2.1 — Category inspection (no code).**
- **Inputs:** a real export of Aditya's data (ask for it). Measure how three schemes are used:
  - `DOCUMENT_CATEGORIES` (5);
  - `VENDOR_DOCUMENT_CATEGORIES` (19);
  - Document Types' free-text `category`.
- **Output:** a proposed single master list plus a mapping table, or a recommendation to keep
  them separate if the data shows no real conflict.
- **Status:** open.

**Gate 2.2 — Category migration (schema bump, only if 2.1 recommends it).**
- **Build:**
  - Add the unified field alongside the old ones (old values are never deleted).
  - Map existing values to it, showing a preview the user confirms.
  - Update every reader: Documents, Vendor Profile, Document Types, the Document Control
    dashboards, the command palette, and the Document Review prompt.
- **Tests:** the migration test, per-screen e2e, and a round trip of an old export file.
- **Status:** open, conditional.

---

## Phase 3 — AI capabilities (Windows only)

**Gate 3.0 — Reopen decision (docs only).**
- AI Document Processing and AI Project Assistant are recorded as skipped because they needed a
  cloud or bundled model. Local Ollama now removes that blocker.
- Ask Aditya to confirm reopening them, then record the decision in README.md and HANDOFF.md.
- **Status:** open.

**Gate 3.1 — Meeting minutes → proposed action items.**
- **Build:**
  - `buildMeetingActionsPrompt(meeting, data)` asks for strictly structured output.
  - Parse it defensively. Malformed output is shown as text, never saved.
  - Show a checklist of proposed actions (text, owner, due date).
  - Only the ticked items are created, via the existing `newMeetingAction`.
- **Tests:**
  - the prompt contains the seeded notes;
  - unticked items are never created;
  - malformed model output causes no store write.
- **Status:** open.

**Gate 3.2 — Delay narrative / EOT draft.**
- **Build:** `buildDelayNarrativePrompt(delayRecord, data)`, using the delay record, the float
  and project-finish impact from `delayImpactEngine.js` (single-delay call only), the recovery
  actions, and the linked records.
- **Output:** a copyable draft in a modal. It's never saved into the record unless the user
  pastes it.
- **Status:** open.

**Gate 3.3 — AI Document Processing (suggestions on upload). Should follow Phase 2.**
- **Build:**
  - A "Suggest (AI)" action on a document with `extraction`.
  - It proposes type, category, discipline, revision and key dates.
  - Each suggestion is a separate checkbox, and nothing is filled until ticked.
- **Out:** automatic filing, and anything running in the background on every upload.
- **Status:** open.

**Gate 3.4 — RFI response draft.**
- **Build:** a draft from the RFI text plus the linked documents' extracted text (already
  capped). A copyable draft only.
- **Status:** open.

**Gate 3.5 — Weekly Project Review draft (conditional).**
- First decide whether it's genuinely different from Project Report (AI). If not, close it.
- **Status:** open, conditional.

**Gate 3.6 — Lessons-learned synthesis.**
- **Build:** themes across closed projects' Lessons Learned records, capped. A copyable draft.
- **Status:** open.

**Gate 3.7 — AI Project Assistant (questions about a project).**
- **Build:**
  - A question box on Project Workspace.
  - The context is a deterministic facts block covering schedule, delays, risks, RFIs, change
    orders, commitments and meetings for ONE project, capped. Say so when it's truncated.
  - Every answer lists the records it used, as jump links through the command palette's
    existing hand-off.
- **Out:**
  - saved chat history (that would need a schema bump; a separate decision);
  - questions spanning the whole portfolio;
  - any action taken by the AI.
- **Tests:** the facts block contains the seeded records, and the answer view renders the
  source links.
- **Status:** open.

**Gate 3.8 — OCR for scanned PDFs (conditional on real need).**
- **Only via an Ollama vision model**, never Tesseract.js (the WebAssembly engine and language
  data would bloat the single file and all three apps).
- **Build:** on demand per document, render each page to an image with the existing pdf.js,
  send it through IPC, and store the result as `extraction` with a visible "may contain errors"
  label.
- Needs an IPC change for image input in `ollamaClient.js`, plus its own unit tests.
- **Status:** open, conditional.

---

## Phase 4 — Schedule interoperability

**Gate 4.1 — Saved column mappings for schedule import.**
- **Build:** "Save this mapping" in `settings`, keyed by a signature of the source headers.
  Auto-applied when the same headers are seen again, and always editable.
- **Schema:** a small bump for the settings key.
- **Status:** open.

**Gate 4.2 — MSP XML / P6 XER resource assignment import.**
- **Build:**
  - Import `RSRC`/`TASKRSRC` (XER) and Resources/Assignments (MSP XML).
  - Match to existing PCC Resources by name. Show a preview of new vs. matched resources.
  - Never create a duplicate without confirmation.
- Activity codes are a separate decision.
- **Tests:** fixture files for both formats; matched, new and duplicate cases.
- **Status:** open.

**Gate 4.3 — Resource assignment export (after 4.2).**
- **Build:** emit the same tables. Round-trip tests.
- **Status:** open, conditional.

**Gate 4.4 — `.sml` / `.plf` import.**
- Blocked until Gate 0.3 identifies the producing software. Then inspect feasibility before
  scoping.
- **Status:** blocked.

---

## Phase 5 — Decision required before any scoping

- **Resource rate × usage → cost.** It's a standing "not picked" decision. If Aditya reopens
  it, scope it as **planned cost only** (budgeting), never as actuals, because two sources of
  actual cost would double-count in EVM.
- **Mobile Gantt simplification.** Only after a concrete pain point on a real phone.
- **Foldable / expanded-window QA.** Only if a foldable is in real use.
- **Master-prompt Phases 8–9.** Only after Aditya supplies their text (Gate 0.3).

---

## Phase 6 — Foundation and maintenance (added 2026-11-11)

From the same audit as Phase 0.5. None of these change what the app does for the user; they
make it safer to keep changing.

**Gate 6.1 — Automated checks on every push.**
- **Gap:** there is no `.github` folder. The "committed build is stale" mistake has shipped
  before (see CLAUDE.md) and only a manual diff catches it.
- **Build:** one workflow, on push and pull request:
  1. `npm ci` in `react/`, `tests/` and `mirror-app/`;
  2. `npx tsc --noEmit` in `react/` and `mirror-app/`;
  3. `node build.js` and `node mirror-app/build.js`;
  4. `git diff --exit-code index.html mirror-app/index.html` (both builds were confirmed
     reproducible on 2026-11-11: a fresh build produced no diff);
  5. `npm test` twice, in UTC and with `TZ=Asia/Kolkata`.
- **Out:** building installers in CI (needs the signing keystores, which never leave Aditya's
  machine).
- **Cost:** the suite takes about 5 minutes per zone. Confirm with Aditya that GitHub Actions
  minutes are acceptable for this repo before enabling.
- **Docs:** CLAUDE.md's "solo repo with no CI" lines change to "merge when the check is green".
- **Status:** open.

**Gate 6.2 — Lift the storage ceiling (conditional on Gate H.3's reading).**
- **Decide first, from Aditya's real meter reading:** below about 50% with slow growth, close
  this gate and re-check yearly. Otherwise pick ONE of the two options below and get it
  confirmed. This is the highest-risk gate in this file: a mistake loses data.
- **Option A — move only extracted document text out.** `extraction.text` (up to 50,000
  characters per document) goes to IndexedDB and the record keeps a reference. Small, and
  likely the largest single consumer for a document-heavy user. It needs a deliberate
  exception to "`blobStore.js` holds binary blobs only", or its own object store in
  `sharedIndexedDb.js`. Every reader of `extraction.text` must be found and made to load it
  (Documents, Document Review prompt, command palette search, export, the mirror snapshot).
- **Option B — move the whole store to IndexedDB.** Requirements, none optional:
  - `store.get()` stays synchronous. Only loading at boot and saving become asynchronous, and
    the router's first render waits for the load.
  - **Spike before scoping:** prove in real Chromium AND in the Android WebView that a write
    started from `pagehide`/`visibilitychange` actually commits. `localStorage` is synchronous,
    which is what makes today's `flushPendingSave` reliable. If the IndexedDB write does not
    reliably commit, keep a small synchronous write-ahead copy of the pending change in
    `localStorage` and replay it at boot.
  - One-time copy from `localStorage`; the old value is kept under a renamed key and is never
    deleted automatically.
  - If IndexedDB is unavailable, fall back to today's `localStorage` path unchanged.
  - The mirror app (which loads `store.js` and has no persistent data) keeps working.
  - Unit tests evaluate `store.js` against a stub `window`; they must keep passing.
- **Tests (either option):** a migration test from a real-shaped `localStorage` payload; kill
  the page mid-save and reload; export and re-import round trip byte-equal; the fallback path;
  the full suite; a Chromium run with 10,000 activities saving and reloading.
- **Status:** open, conditional.

**Gate 6.3 — Make the docs usable (docs only, nothing deleted).**
- **Gap:** `HANDOFF.md` is 622 KB, `README.md` 533 KB, `CLAUDE.md` 72 KB. `CLAUDE.md` is
  loaded into every session, and `README.md` ships to end users inside the zip.
- **Build:**
  - `CLAUDE.md`: standing rules and commands only, target under 15 KB. Each bug history
    becomes one rule line plus a pointer; the full stories move to `docs/GOTCHAS.md`.
  - `HANDOFF.md`: current state plus the last two sessions. Older sessions move, unedited, to
    `docs/HANDOFF_ARCHIVE.md`.
  - `README.md`: a short user guide (what it is, how to open it, backup, the three apps). The
    build history moves, unedited, to `docs/BUILD_HISTORY.md`.
  - The end-user zip keeps shipping only the short `README.md`.
- **Check:** every file path and command named in the new `CLAUDE.md` exists and runs; every
  rule in the old `CLAUDE.md` is still findable in the new one or in `docs/GOTCHAS.md` (do
  this as a line-by-line pass, not by memory).
- **Status:** open.

**Gate 6.4 — Small correctness fixes (no schema change).**
- Commitments shows "$" for every project: `formatMoney` in
  `react/src/services/commitmentsService.ts` hardcodes it, while Cost, Portfolio, Executive
  Center and Reports use the project's `currency`. Use the row's project currency. Check the
  Commitments totals row: if it can span projects with different currencies, show per-currency
  totals, never one mixed sum.
- Generated text such as "10 activity(ies)" (6 places in `react/src/services/`): real plurals.
- **Tests:** e2e with two projects in different currencies; control run.
- **Status:** open.

**Gate 6.5 — Cold-start time (conditional).**
- **Measured:** first content at 0.75 s unthrottled, 3.1 s at 4× CPU throttle, 4.7 s at 6×,
  because all 6.4 MB is parsed on every launch. About 4.2 MB of that is libraries needed only
  when a file is opened (xlsx, ExcelJS, mammoth, pdf.js and its worker, sql.js).
- **Decide first:** time a cold launch on Aditya's phone. Under about 2 seconds, close this.
- **Build, if needed:** ship those libraries as inert `<script type="text/plain">` blocks and
  evaluate each on first use through one small loader. Every caller is already asynchronous
  (they parse files). Still one self-contained `index.html`, no network. Keep the rule that
  React loads before jszip.
- **Tests:** each file type still opens after a cold start in Chromium; the suite; before and
  after timings recorded in HANDOFF.md.
- **Status:** open, conditional.

**Gate 6.6 — Development dependency advisories (no shipped change).**
- `tests/` reports 2 high (undici, through jsdom) and `packaging/` reports 12 (the
  electron-builder chain). None of this code ships inside the app. Run `npm audit fix`
  without `--force` in each, re-run the suite, and before the next Windows build confirm the
  Electron major in `packaging/package.json` is still a supported one.
- **Status:** open.

---

## Phase 7 — Visual refresh (added 2026-11-11)

### Read this before any Phase 7 gate

**This is the fourth visual programme on this app** (UI Modernization, the 8-gate UI/UX
Overhaul, the 12-gate PCC Redesign). Read the `pcc-ui` skill and `.claude/docs/*.md` first. The
structure those programmes built (navigation groups, React pages, modal accessibility, command
palette, density setting, status-badge icons) stays. Phase 7 changes how it looks and how much
it shows at once, not how it works.

**What the 2026-11-11 screenshots showed** (seeded data, light and dark, 1366×820 and 412×915):
1. Everything is a white rounded card with a border on a grey page, including cards inside
   cards. Nothing is more important than anything else.
2. The active sidebar item has a blurred violet glow and a coloured left stripe.
3. Three typefaces with three jobs: Space Grotesk titles, Inter body, IBM Plex Mono for every
   number (with slashed zeros). KPI figures look like terminal output.
4. Small uppercase letter-spaced labels on nearly every field, tile and column.
5. A tinted pill badge on every table row, even for the neutral state ("NOT STARTED" ten times
   in a row).
6. The Schedule toolbar is nine equal-weight buttons wrapping to two rows.
7. Two different tab designs (underline on Schedule, filled buttons on Executive Center).
8. On a phone, Portfolio stacks seven full-width KPI cards (about 800 px) above the first
   project, and the title block truncates the page name to "Por…".
9. Most pages open with a sentence explaining the page under its title.
10. 425 of the 1,215 inline `style={{…}}` objects in `react/src/pages` set `fontSize` directly,
    so the type scale cannot be changed from `styles.css` today.

Items 1–5 and 9 together are what makes an interface read as machine-generated: each choice is
the most common default, and they are applied evenly everywhere. The fix is not a different set
of defaults. It is deciding, per screen, what matters most and letting the rest recede.

**Direction (recommended; Gate 7.0 confirms it on real screens before anything ships):**
- **Fewer boxes.** Page and content share one surface. Sections are separated by space and a
  hairline. A bordered card is for a discrete object you can act on (a project, a risk, a
  dialog), never a wrapper for a heading plus a table.
- **One family for text.** Titles, body and figures in the same family, with weight and size
  doing the work. Figures use tabular numerals, not a monospace face. Monospace stays only for
  identifiers (activity IDs, document numbers, codes).
- **Neutral primary, colour means status.** The primary button is ink (near-black on light,
  near-white on dark). One accent hue is used only for selection, focus and links. Green,
  amber, orange and red then carry status and nothing else.
- **Quiet by default, loud by exception.** In tables, status is a small dot plus text; the
  neutral state has no colour at all. Pill badges stay for record headers and cards.
- **One primary action per view.** Everything else goes into grouped menus, following the
  existing "⋯" convention in CLAUDE.md.
- **Sentence-case labels.** Uppercase tracking stays on table column headers only.
- **Tighter geometry.** Card radius 8 px, controls 6 px. Shadows only on things that float
  (menus, dialogs, toasts, the drawer).
- **Keep the title block.** "Sheet / Company / Client / Project / Date" borrows from a drawing
  title block. It is the one element that belongs to this trade; refine it, don't replace it.

**Do not build any of these** (they are the look to get away from):
- gradients on surfaces, text or buttons; glows; blurred coloured shadows; `backdrop-filter`;
- an indigo or violet accent; more than one accent hue; decorative colour on headings;
- coloured left-edge stripes on cards or rows as decoration;
- emoji, or a sparkle icon for AI features (the label says "AI"; that is enough);
- a rounded card around every section; cards inside cards; radius above 8 px;
- uppercase letter-spaced labels outside table headers;
- large centred illustration-style empty states;
- a subtitle that restates the page title, or instructions under a title;
- new animation. `MOTION_SYSTEM.md` already covers what exists.

**Copy rules for every Phase 7 gate:** labels are nouns, buttons are verbs, numbers come with
their unit. No sentence under a page title unless it states something the user cannot see on
the page. Help text lives in the empty state and in field hints.

**Hard constraints:**
- Offline and single file. Any font is a local OFL-licensed woff2 inlined by `build.js`
  (today: 7 files, 136 KB). Fonts ship in all three apps, so record the size change.
- `styles.css` is shared with the mirror app. Every Phase 7 gate rebuilds it and checks its
  four tabs at 412×915.
- Both themes in every gate. Text contrast at least 4.5:1, measured with the axe procedure in
  the `pcc-visual-qa` skill, not judged by eye.
- Token NAMES stay (`--signal-amber` included: tests reference it by name). Values change.
  `test_module_accent_tint.js`, the `.icon-btn` target-size test and the Gantt fill assertions
  in `test_schedule_gantt_e2e.js` must keep passing or be updated in the same gate with the
  reason written down.
- No change to any engine, store shape, route name or public page hand-off
  (`filterByProject`, `expand<X>`, `createFromMeeting`).
- Header space at phone width is used up (CLAUDE.md). Nothing new goes in the title block.
- The density setting and focus mode keep working.
- A React page's state resets on remount; do not design anything that assumes otherwise.

**How a Phase 7 gate is accepted:** before-and-after screenshot pairs from the same seeded
dataset, same screens, both themes, 1440×900 and 412×915, sent to Aditya. He approves the look
of each gate. Tests prove nothing broke; they cannot prove it looks right.

**Gate 7.0 — Baseline and direction (nothing ships).**
- **Build (dev-only):** `tests/visual/shots.js`: seeds a fixed dataset (three projects in
  different health states, a 10-activity schedule each, risks, RFIs, a change order, a
  commitment, a document) and screenshots Dashboard, Portfolio, Schedule (Activities and
  Gantt), Risk Register, Executive Center, Documents and Settings, in both themes at both
  sizes. Not part of `npm test`. Every later gate reuses it.
- **Then:** apply the direction above to three screens only (Dashboard, Schedule Activities,
  Risk Register) as a throwaway override stylesheet, and show Aditya two variants side by
  side with the current look:
  - **Variant A:** Inter for everything (drops Space Grotesk, adds no bytes), cool neutral
    greys, one restrained blue accent.
  - **Variant B:** IBM Plex Sans with the existing IBM Plex Mono (one family with an
    engineering character; drops Inter and Space Grotesk), slightly warm neutral greys, a
    teal or green-blue accent.
- **Aditya decides** (use `AskUserQuestion`, with the screenshots): typeface; accent hue;
  ink primary button yes or no; whether the per-module header tints stay, shrink to a
  hairline, or go.
- **Output:** the decisions written into `.claude/docs/DESIGN_SYSTEM.md` as exact token
  values, and the `pcc-ui` skill's typography lines updated to match. The override stylesheet
  is deleted.
- **Status:** open.

**Gate 7.1 — Make the type scale changeable (no visual change).**
- **Build:** replace inline `fontSize` (425 occurrences) and any inline colour or radius in
  `react/src/pages/*.tsx` with the existing `--text-*` tokens or a small set of text classes
  in `styles.css`. Same for the 30 literal `font-size` values in `styles.css`. Work page group
  by page group.
- **Acceptance:** screenshots before and after are visually identical (allow sub-pixel text
  differences only where a 13.5 px value snapped to a token; list each one). Suite green.
- **Out:** changing any value. This gate exists so that 7.2 is a one-file change.
- **Status:** open.

**Gate 7.2 — Foundation tokens (`styles.css` only).**
- **Build:** the typeface, neutral scale, accent, status colours, radii, shadows and focus
  ring decided in 7.0, for both themes. Tabular numerals on every figure (verify in Chromium
  that the bundled font subset actually contains them; if not, re-subset or keep the mono face
  inside tables only). Remove unused font files.
- **Acceptance:** contrast measured on badges, heat map cells, secondary text, placeholder
  text and disabled controls in both themes; bundle size before and after recorded.
- **Status:** open.

**Gate 7.3 — Shell.**
- **Build:** sidebar (active item is a plain filled row, no glow, no stripe; group headers
  quieter), title block (refined, and the page name no longer truncates to "Por…" at 412 px:
  drop or shrink the "Sheet" label there before truncating the name), footer, command
  palette, toasts, dialogs, drawer, "⋯" menus.
- **Tests:** the navigation, modal, palette and tablet/mobile e2e files stay green.
- **Status:** open.

**Gate 7.4 — Shared components.**
- **Build:**
  - buttons: three levels only (primary, secondary, quiet), one size per density;
  - inputs and selects: one height, one chevron, visible labels (about 15 pages have a
    filter input whose only label is its placeholder);
  - tabs: one design everywhere;
  - status: dot plus text in tables, pill in headers and cards, nothing coloured for neutral;
  - KPI figures: one stat strip (a single row with hairline dividers) on desktop, a compact
    two-column grid on phones, replacing the grid of equal cards;
  - tables: row height per density, right-aligned figures, sticky header;
  - empty states: one line of what is missing plus the action that fixes it;
  - pointer targets at least 24×24 px (Schedule has 31 smaller at phone width, Reports 13).
- **Tests:** an e2e check that no visible control on the eight baseline screens is under
  24 px, and that every visible input has an accessible name.
- **Status:** open.

**Gate 7.5 — Page passes (five separate gates; stop after each).**
Apply 7.2–7.4 and the "one primary action" rule. No new features, no moved data.
- **7.5a Overview:** Dashboard, My Work, Action Centre, Portfolio, Project Workspace,
  Executive Center. These are also the mirror app's pages. Dashboard: the "Current context"
  card duplicates the title-block switcher on desktop; show it only where the title block
  hides the switcher. Portfolio on a phone: first project visible without scrolling.
- **7.5b Schedule:** toolbar becomes one primary action plus grouped menus (Import / Export /
  Baseline); Activities table; Gantt colours from tokens. The Gantt reads the CPM engine's
  results and must not recompute or alter them (see the `pcc-ui` skill's hard constraint).
- **7.5c Registers:** Risk Register (heat map from tokens, quieter), RFI/TQ, Change
  Management, Decision Register, Meetings, Delay & Recovery, Lookahead.
- **7.5d Cost and supply:** Cost, Commitments, Resources, Vendors, Vendor Performance.
- **7.5e Documents and system:** Documents, Document Types, Document Control, Storage,
  Daily Log, Lessons Learned, Knowledge Base, Reports (the screen), Settings.
- **Status:** open (all five).

**Gate 7.6 — In-app confirmation dialogs (conditional).**
- **Gap:** 48 native `confirm()` calls. They look like the browser, not the app, and cannot
  name the thing being deleted in a styled way.
- **Build:** one shared confirm dialog on the existing `.modal` + `modalA11y`, with the
  destructive action labelled by what it does ("Delete schedule"), never "OK".
- **Cost to weigh first:** it makes every confirmation asynchronous, and 20 test files stub
  `window.confirm`. Decide with Aditya whether the gain is worth that churn. If not, close it.
- **Status:** open, conditional.

**Gate 7.7 — Printed reports.**
- **Why separate:** reports are the only part of this app other people see. They are
  printable HTML with their own styles in `react/src/services/reportsService.ts`, so nothing
  in 7.2–7.5 reaches them.
- **Build:** the 7.0 typeface and neutral scale; a proper title block (project, report, date,
  page); tables that break across pages without orphaned headers; figures right-aligned with
  units. Still `window.print()`, still no PDF library.
- **Acceptance:** each report type printed to PDF from Chromium, before and after, sent to
  Aditya. `test_report_template_system_e2e.js` and `test_native_print_gate3_e2e.js` green.
- **Status:** open.

**Out of scope for Phase 7 unless Aditya reopens them:** a new logo or app icon; charts or
illustrations that do not exist today; onboarding or sample data; mobile Gantt simplification
(Phase 5); any change to navigation groups or route names.

---

## Recommended order

0.1 → 0.2 → **H.1 → H.2 → H.3 → H.4** → 0.3 → 6.1 → 6.4 → 6.3 → then two tracks, one gate at a
time, never two open at once:

- **Look:** 7.0 → 7.1 → 7.2 → 7.3 → 7.4 → 7.5a–e → 7.7 → (7.6).
- **Features:** 1.1 → 3.1 → 1.2 → 2.1 → (2.2) → 3.3 → 3.2 → 4.1 → 3.7 → the rest as needed.

Do 7.0–7.4 before any feature gate that adds a new screen or panel, so new UI is built once in
the new look. 6.2, 6.5 and 6.6 run when their own conditions say so. (Order revised 2026-11-11;
the original was 0.1 → 0.2 → 0.3 → 1.1 → ….)

---

## Kick-off prompt for a new session

> Read `CLAUDE.md` and `DEFERRED_ROADMAP.md` in full. Start at the first gate whose Status is
> `open` in the recommended order. Follow "How to work through this": inspect the code first,
> propose that gate's exact scope, and wait for my confirmation before writing code. Then build,
> pass every item of the test gate, ship per CLAUDE.md, update the gate's Status line, and STOP.
>
> If this file was handed to you directly and the repo's `DEFERRED_ROADMAP.md` differs, the
> handed copy is the newer one (it adds Phases 0.5, 6 and 7): commit it over the repo's copy
> before anything else.
