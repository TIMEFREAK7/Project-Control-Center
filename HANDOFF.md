# Project Control Center — Session Handoff

Paste this into a new chat to resume work with full context. This file lives in the repo
(`HANDOFF.md` at the root) specifically so a future session can find it without being told a
path — see the standing instructions added to `CLAUDE.md` about keeping it current and about
handing it (and a zip) to Aditya directly after every major upgrade, not just committing quietly.

## What this project is

Solo-developer, offline-first project/portfolio management app, built as a single
self-contained `index.html`. Repo: `TIMEFREAK7/Project-Control-Center`. Full history and
rationale live in `README.md` — read it before making changes. Architecture/build/testing
conventions live in `CLAUDE.md` at the repo root (read this too — it has standing instructions
that override default behavior).

## Standing instructions (already in CLAUDE.md, but repeating since they matter most)

- **If a PR has no comments, merge it — don't ask first.** Solo repo, no CI, no other
  reviewers. Only pause to ask if there *are* comments to address, or something about the
  change itself is genuinely ambiguous.
- **After every gate/phase/tier, compile everything and hand over a zip file Aditya can send to
  a laptop or to other people and they can use directly** — not just push to `main`. Rebuild
  (`node build.js`), run the full test suite, then package `index.html`, `README.md`, and empty
  `data/`/`files/` placeholder folders (with their own `README.txt`, already present at the repo
  root — reuse them, don't rewrite) — **not** `src/`, `build.js`, `tests/`, `.claude/`,
  `CLAUDE.md`, or `HANDOFF.md`. The point is zero setup for the recipient: extract, double-click
  `index.html`, nothing to install. Verify before sending: extract fresh (not the dev working
  copy) and open `index.html` in real Chromium.
- **After every major upgrade, update `HANDOFF.md` at the repo root AND hand Aditya the complete
  updated file directly** (same as the zip — don't just leave it committed silently), so a new
  session can resume without re-deriving everything from git log and source.
- Develop on branch `claude/excel-schedule-pcc-editing-dgyy9m` (current branch — see "Repo/
  branch state" below; this may not match whatever branch name a fresh task assignment gives
  you, in which case follow the new assignment instead and treat this file as background only).

## Where things stand

**Tier 2 locked build order** (from README): Schedule import/CPM/Gantt → Cost Tracking → EVM
engine → Resource Management. **Gates 8 and 9 below were NOT on this list** — both were direct,
ad hoc feature requests inserted ahead of Resource Management. Resource Management is still the
last un-started Tier 2 item; nothing has been built for it.

Done so far, in order: Gate 4 (schedule baselines), Gate 5 (Gantt), Gate 6 (Cost Tracking, +
Portfolio-budget fallback fix), a UI/UX polish pass, Gate 7 (EVM engine), then this session's
two big ones:

- **Gate 8 — In-App Excel Editor for Schedules.** The original Excel file behind an imported
  schedule is now actually stored (`blobStore`, previously discarded after parsing). A new
  "Edit Excel" button opens an in-page editable grid (not a download, not `window.open`) built
  from the schedule's live Activities/WBS/Relationships. Edits go through "Review Changes" →
  "Apply to Schedule," reusing `scheduleImportService.parseRows()` verbatim via a new
  `CANONICAL_HEADERS` export, and update the *same* schedule in place (no new revision).
  Guards against silently deleting hand-added activities (no Activity ID) with an explicit
  acknowledgment step.
- **Gate 9 — Vendor Management Module**, plus a same-session follow-up. A portfolio-wide Vendor
  Master (not project-scoped, like Portfolio itself) with a dashboard, searchable/filterable
  list, and a 9-tab profile (Overview/Projects/Contacts/Documents/Meetings/RFI-TQ/Risks/
  Performance/Notes). Vendor↔Meeting/RFI/Risk linking is one-directional from the Vendor side
  via join arrays — **zero changes** to `meetings.js`/`rfis.js`/`risks.js`; "View X" reuses
  their existing `expandMeeting()`/`expandRfi()`/`expandRisk()` hooks. Vendor documents get an
  *optional* project (a GST cert isn't tied to one project) with real revision history
  (`document_group_id` + `revision_number`). **Follow-up in the same session:** Portfolio's
  project details panel also got a "VENDORS" section with its own "+ Link Vendor"/"Unlink" —
  reads/writes the exact same `vendor_project_links` array Vendor Management uses, so linking
  from either side is immediately visible on the other (no sync code, just two UIs on one array).
- **This delivery round:** compiled the distributable zip for Gates 8+9 (had been skipped
  earlier in the session — flagged and caught via this exact handoff process), plus tightened
  the zip/handoff standing instructions themselves in both `CLAUDE.md` and this file to
  explicitly say the zip must be laptop/other-people-shareable with zero setup, and that both
  the zip and this file get handed to Aditya directly, not just committed.

Nothing from this branch is merged to `main` yet — see "Repo/branch state" below. Schema is at
`schema_version: 21`. Test suite is at **12 files, ~209 checks**, all passing as of the last run
(`cd tests && npm test`).

## Key technical conventions to carry forward

- `src/` is source of truth; `index.html` is a generated artifact — never hand-edit it. Run
  `node build.js` after every `src/` change (order-sensitive `JS_ORDER` in `build.js`).
- Pure calculation engines have **zero DOM/store access**: `scheduleCpmEngine.js`,
  `scheduleBaselineEngine.js`, `scheduleGanttLayout.js`, `costEvmEngine.js`. Follow this
  pattern for any new engine-style logic (e.g. resource leveling math, if Resource Management
  needs it).
- Date precedence convention (used identically everywhere dates are computed): calculated
  (`early_start`/`early_finish`) wins over planned (`planned_start`/`planned_finish`);
  milestones with only one date are a zero-width point.
- Transparency-over-blending: never silently combine numbers of different precision/source —
  always flag it in the UI (see `usingPortfolioBudget`, `coveragePct`, dashed Gantt bars for
  planned-only activities).
- **This app has no server, no SQL, no API layer** — one JS object in `localStorage` +
  IndexedDB for blobs. If a future feature request is written in generic ERP/backend language
  ("database tables," "API endpoints," "folder structure"), translate it explicitly before
  building — see Gate 9's README entry for how that translation was reasoned through and
  written down as a decision, not just silently assumed.
- **Cross-module linking pattern (established in Gate 9):** when a new module needs to
  reference records in an existing module (Meetings/RFI/Risk), prefer a **join array** owned by
  the new module, populated/managed entirely from the new module's own UI, and reuse the
  target module's existing public `expand*()`/`filterByProject()` hooks to "open" or "jump to"
  the real record — don't add new fields to the existing module's schema or forms. Keeps "do
  not modify existing modules" literal, not just aspirational.
- Every register module exposes a small public API on `window.PCC.<module>` for cross-module
  use: `filterByProject(projectId)` (used by Portfolio's "View All" buttons) and often an
  `expandX(id)` / `openProfile(id)` to jump straight to one record. Match this convention for
  any new module.
- Register modules (Risk/Issue/Opportunity, RFI/TQ) use "one shape distinguished by a `type`
  field" — Cost Tracking deliberately does NOT use this for budget items vs. actuals, since
  they're genuinely different shapes.
- Project assignment is mandatory on every *existing* register — never add an "Unassigned"
  option back. Gate 9's Vendor Documents is a **deliberate, disclosed exception** (optional
  `project_id`) since a vendor's own documents often aren't tied to one project; don't treat
  that exception as license to relax the rule elsewhere without the same explicit reasoning.
- Change Orders never write back to `contract_value` (deliberate, manual reconciliation only).
- Reports are printable HTML (`window.print()`), not generated PDFs, to avoid a PDF-library
  dependency in the single-file build.
- No File System Access API (desktop-Chrome-only, needs `https://`); export/import-as-JSON is
  the deliberate cross-platform answer.
- The distributable zip's `data/README.txt` and `files/README.txt` already exist at the repo
  root (`/data/README.txt`, `/files/README.txt`) — copy them into the package as-is, don't
  regenerate their text from scratch each time (drifted wording between deliveries would be
  its own small bug).
- Testing: `cd tests && npm test` must pass before anything ships. Pure-logic tests eval the
  real source file directly (plain Node). E2E tests load the actual bundled `index.html` via
  jsdom (+ `fake-indexeddb` for IndexedDB-touching code) — never a reimplementation. Also do
  one real-Chromium pass per gate (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome
  --no-sandbox`, via the globally installed `playwright` package at
  `/opt/node22/lib/node_modules/playwright`) — jsdom has already missed real bugs (unstyled CSS
  class, broken mobile flex layout) that only a real render caught. For the zip specifically,
  the real-Chromium pass should open the file from the *fresh extraction*
  (`file:///path/to/extracted/index.html`), not the dev working copy — that's the only way to
  actually prove "extract and double-click, nothing else needed" rather than assuming it.
- **jsdom gotcha found in the Gate 8/9 session:** arrays derived from `win.PCC.store.get()`
  inside a jsdom test are jsdom-realm arrays, not Node-realm arrays.
  `assert.deepStrictEqual(thatArray, [1, 2])` fails on prototype identity even when every
  element matches ("Values have same structure but are not reference-equal"). Compare via
  `.join(",")` against a string, or check length + individual elements, instead of
  `deepStrictEqual` against a Node-realm array literal.
- **Playwright gotcha found in the Gate 8/9 session:** `page.locator(tag, { hasText: "X" })` is
  a *substring* match, not exact — `"Add Vendor"` will also match a `"+ Add Vendor"` button
  elsewhere on the page, and `.first()` may grab the wrong one. The jsdom test suite's own
  `findButtonByText()` helper does exact-trim matching and doesn't have this problem; for
  ad hoc Playwright verification scripts, filter with an anchored regex (`^...$`) if two
  buttons could share a substring.

## Recently fixed bugs worth knowing about

- `formatMoney()` in `cost.js` now caps `maximumFractionDigits: 2` — EAC/VAC are genuinely
  fractional (division results) and were rendering as `"$3,083.333"` before the fix.
- CPI/SPI are `null` (not `0`) when nothing is linked yet, guarded by `linkedBac > 0`, so "no
  data" is never confused with "a real 0% complete with real spend."
- `.detail-card` had zero CSS for a long time (used in 8+ places) — now styled.
- `#app-shell` didn't switch to `flex-direction: column` below 780px — mobile layout was
  broken until this was added to the mobile media query.
- `ACTIVITY_TYPE_ALIASES` in `scheduleImportService.js` gained a `wbs_summary` (underscore)
  alias in the Gate 8 session — the raw value the app stores internally for that activity type
  wasn't previously recognized as an input alias, which would have broken the Excel grid
  editor's round-trip for WBS Summary activities specifically.
- The Gate 8/9 delivery zip was skipped in the moment it should have shipped (right after Gate
  9) and only caught because this exact handoff-file process surfaced it as an outstanding item
  on the next turn — worth remembering that these standing instructions are easy to let slip
  mid-session when work keeps flowing straight from one gate into the next; check this file's
  own outstanding-items list explicitly before considering a delivery "done."

## Repo/branch state

Branch `claude/excel-schedule-pcc-editing-dgyy9m` is pushed and in sync with origin. **No PR
exists for it yet** (confirmed via `list_pull_requests` — empty result), so it's safe to keep
committing directly on top without any merge/rebase dance. It is ahead of `main` by: `886eaab`
(Gate 8), `fad1c03` (Gate 9), `4c6abe6` (Portfolio↔Vendor linking follow-up), `3b547a6` (added
`HANDOFF.md` + the standing instruction in `CLAUDE.md`), plus this round's commit (zip delivered,
handoff/CLAUDE.md wording tightened). `main` still only has through Gate 7.

**Zip delivered this round:** `project-control-center-2026-08-12-gate9.zip` — `index.html` +
`README.md` + `data/` + `files/` (their existing `README.txt` placeholders), verified via a
fresh extraction opened in real Chromium (all 13 routes render, zero console/page errors,
`index.html`'s SHA-256 matches the freshly-built dev copy exactly).

**Next steps, in likely priority order:**
1. Decide whether/when to open a PR for `claude/excel-schedule-pcc-editing-dgyy9m` → `main`, or
   keep building more on this branch first.
2. Ask whether to resume the original locked Tier 2 order (Resource Management) or whether more
   ad hoc requests are coming first.
3. Going forward: don't let the zip-and-handoff delivery slip again — do it in the same turn a
   gate/major change finishes, not as an afterthought once asked for.
