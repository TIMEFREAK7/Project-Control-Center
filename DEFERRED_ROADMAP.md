# PCC Deferred-Items Roadmap — master prompt

Saved in the repo on purpose: the PCC Evolution Roadmap and the engineering master prompt were
only ever pasted into chat, so later sessions couldn't tell what was done (see HANDOFF.md's
superseded 2026-08-19 snapshot). This file is the source of truth for the work below. Update
each gate's **Status** line when it closes.

Compiled 2026-09-25 from every "deferred / not done / skipped" note in README.md and HANDOFF.md,
each checked against the code at `edcedbd`. Items that turned out to be already built (portfolio
filtering, Gantt readiness flag, configurable reminder windows, Daily Log photos, fuzzy search,
Spreadsheet Review) are not listed.

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

## Recommended order

0.1 → 0.2 → 0.3 → 1.1 → 3.1 → 1.2 → 2.1 → (2.2) → 3.3 → 3.2 → 4.1 → 3.7 → the rest as needed.

---

## Kick-off prompt for a new session

> Read `CLAUDE.md` and `DEFERRED_ROADMAP.md` in full. Start at the first gate whose Status is
> `open` in the recommended order. Follow "How to work through this": inspect the code first,
> propose that gate's exact scope, and wait for my confirmation before writing code. Then build,
> pass every item of the test gate, ship per CLAUDE.md, update the gate's Status line, and STOP.
