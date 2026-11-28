# Project Control Center — Session Handoff

Paste this into a new chat to resume work with full context. This file lives in the repo
(`HANDOFF.md` at the root) specifically so a future session can find it without being told a
path — see the standing instructions in `CLAUDE.md` about keeping it current and about handing
it (and a zip) to Aditya directly after every major upgrade, not just committing quietly.

## Current state (2026-11-28)

- `main` has every gate through 7.5a. Gate 7.5b is built on branch `gate-7.5b`, waiting for
  Aditya to approve the look; then merge, zip, push. Schema **67**. 142 test files
  (`cd tests && npm test`), green in UTC and IST. Windows installer builds natively on this PC
  (1.10.0 last built).
- Next in `DEFERRED_ROADMAP.md` after 7.5b: Gate 7.5c (Registers page pass). Features track: 1.1.
- Waiting on Aditya: Gate 0.1 (phone check of At a Glance 1.9 + predictive back) and the real
  Storage Management → App data reading (decides Gate 6.2).
- Docs layout since Gate 6.3: `CLAUDE.md` = rules (10.5 KB); `docs/GOTCHAS.md` = the old
  CLAUDE.md, unedited; `docs/BUILD_HISTORY.md` = README's old history; `docs/HANDOFF_ARCHIVE.md`
  = this file's sessions before 2026-11-11; `README.md` = short user guide (ships in the zip).

## Resuming in a new chat (set up 2026-11-27)

- Branch `gate-7.5b` exists locally, cut from `main` at the 7.5a merge, with no changes yet.
  Start 7.5b from there (or recreate it: `git checkout -B gate-7.5b main`).
- Per gate, as before: inspect → propose scope and wait for Aditya → build → control run
  (new test fails on the old build) → full suite in UTC and `TZ=Asia/Kolkata` → before/after
  sheets in both themes, 1440×900 and 412×915, plus the mirror's 4 tabs → Aditya approves the
  look → merge to `main`, push, zip verified in Chromium, send zip + this file → stop.
- 7.5b scope from the roadmap: Schedule toolbar = one primary + grouped menus (Import / Export /
  Baseline); Activities table; Gantt colours from tokens; the Gantt must NOT recompute CPM
  results. Carry the 7.4/7.5a rules: sentence-case labels (+ update tests that read them, via
  `relabel-tests.js`), `.panel--flat` sections, empty-state actions, no title subtitles.
- Dev helpers (census, sheets, mirror compare, run-each, relabel) live OUTSIDE the repo in
  `scratch/pcc-tools/` with a README; the visual harness is `tests/visual/shots.js`
  (`--axe <scratch/pcc-7.0/axe/axe.min.js> --audit 1`).
- Shell on this PC: PowerShell 5.1. Put `tools\bin` on PATH before `git push` (gh is the
  credential helper). Mirror app: build from a C: temp copy with junctions (H.2 below). Never
  write source or marker files with PowerShell `Set-Content`/`Out-File` (BOM; CLAUDE.md).
- Open small items: Dashboard's own 7 phone filters stack (Portfolio's `.filter-fold` would fix
  it); Executive Center's "INR 42,00,00,000" wraps in its KPI tile; title still truncates for
  the 4 longest page names at 360 px.

## 2026-11-28 — Gate 7.5b: Schedule page pass

- Toolbar: + New Schedule (only primary), Calculate Schedule (with the "out of date" warning),
  Import ▾ (Import Schedule, Edit Excel), Export ▾ (MS Project, P6), ⋯ (Save Baseline, Edit
  Schedule, Summarize (AI), Delete). `ToolbarMenu` in `Schedule.tsx`; button text unchanged.
- **Roadmap vs code:** the Gantt already used colour tokens and never recomputed CPM. Its SVG
  text sizes moved onto `--text-xs`/`--text-10` (via `style`, since an SVG `font-size`
  attribute can't take `var()`).
- Subtitle under "Schedule" removed; one primary per tab (Gantt: + Add Activity primary,
  + Add Milestone quiet); empty states with actions; 16 "word(s)" strings → `plural()`
  ("1 activity has…", "Parsed 4 rows"); table/Gantt/result sections `.panel--flat`; holiday
  dates out of `.mono`.
- **Bug caught in Chromium:** at 412 px the Import and ⋯ dropdowns opened off the left edge
  (right-anchored, toggle wrapped left). `dropdownStyle()` opens toward the side with room,
  inline, so `styles.css` is untouched and the mirror app needs no rebuild.
- Tests: new `test_schedule_phase7.js` (8/21 on the old build, 21/21 now; includes a spy proving
  the Gantt never calls `calculateSchedule`). New `tests/scheduleMenu.js` (`openScheduleMenu`);
  13 older tests call it before looking up a moved button (inserted by
  `scratch/pcc-7.5b/insert-menu-open.js`); 4 tests' plural strings updated.
- Chromium: 8 shots + 16 open-menu states (`scratch/pcc-7.5b/menu-states.js`), both themes,
  both sizes: 0 console errors, 0 contrast failures, audit pass, no sideways scroll, every
  dropdown inside the viewport. Sheets: `scratch/pcc-7.5b/sheets/`, menus: `scratch/pcc-7.5b/menus/`.
- `index.html` 6,360.2 → 6,361.7 KB.

## 2026-11-27 — Gate 7.5a: Overview page pass (Dashboard, My Work, Action Centre, Portfolio, Project Workspace, Executive Center)

- **Bug found:** Dashboard's "Current context" card was empty at <=1150px and in the mirror app:
  it reuses `.title-block__cell`, and the title block's hide rules (1150px and 780px blocks)
  were unscoped. Now `.title-block .title-block__cell…`; the card (`.dashboard-context-card`)
  shows only at <=1150px and always under `.mirror-app-shell`.
- Portfolio phone: the 10 filters + Show archived fold behind a "Filters (n)" toggle at <=780px
  (`.filter-fold` is `display:contents` elsewhere, so desktop is unchanged). First project at
  537 px of 915 (was 1,077).
- One primary per view (Portfolio's "Open Workspace" → secondary; per-card/row actions quiet);
  Project Workspace's Overview/Executive Center switch is a `.tab-bar`.
- Copy: subtitles removed (Dashboard keeps "n of m active projects match these filters." only
  while filtered; My Work states "Across N active projects." / "For <project>."). 64+ uppercase
  labels on these pages (+ `projectWorkspaceService` group labels) → sentence case,
  abbreviations kept; `.status-badge`, `.card-stat__label`, `.detail-item__label` no longer
  force capitals (this reaches every page). Executive Center's Summary headings stay Title Case
  (the print snapshot and tests use them); they were only shown uppercased.
- `.panel--flat` (new) on section wrappers: light = hairline + space, dark = lifted surface
  without a border. Real objects (project cards, attention items, forms) keep the box.
- Empty states with actions: + Add Project, Clear filters (cards and Compare), Go to Portfolio
  (Executive Center, Workspace), + New Weekly Review; Action Centre's is one line.
- Dates on Executive Center / Workspace no longer `.mono`.
- Tests: new `test_overview_phase7.js` (1/17 on the old build, 17/17 now). 19 older tests read
  the old capitals/subtitles: label strings updated inside their quotes only (mapping in this
  gate's scratch `relabel-tests.js`). `test_integrated_project_controls_e2e.js` keeps the
  Delay & Recovery Dashboard's uppercase label (that page is 7.5c). The P6 and column-mapping
  import tests got the same "wait for the import" fix as MSP at 7.4 (both raced under load).
- Chromium: 24 shots (6 pages × 2 themes × 2 sizes) 0 console errors, 0 contrast failures,
  audit pass; mirror rebuilt (682.4 KB), its 4 tabs change. Sheets: `scratch/pcc-7.5a/sheets/`.
- Left: Dashboard's own 7 phone filters still stack above its KPIs (the same fold would fix it);
  Executive Center's "INR 42,00,00,000" wraps inside its KPI tile.
## 2026-11-27 — Gate 7.4: shared components

- Aditya's calls: search boxes = magnifier + screen-reader name (not a visible label); "fewer
  boxes" per page in 7.5; empty states restyled now, actions wired in 7.5.
- Buttons: primary (ink, plain hover; the blurred ::before layer is gone), secondary
  (`.btn--ghost`), new quiet (`.btn--quiet`). Gantt zoom shows its choice with `aria-pressed`
  and the selection fill, not the primary fill.
- One control height `--control-h` (36 / 32 / 40 by density, 44 in the touch tier) for buttons,
  toolbar fields and every unclassed field in pages/dialogs (`:where()` rule, zero
  specificity); native 19 px selects gone. Checkboxes 18 px.
- 18 search boxes on 17 pages: `search-input` class + `aria-label` (Cost was missing from the
  roadmap's count). Tabs: Executive Center (both rows) and Portfolio Cards/Compare are underline
  tabs; the underline is plain (no blur).
- Status in table cells = dot + text (grey for complete/info); KPI grid = one strip, two
  columns on phones; `.data-table` sticky header, `--row-py`, `.num`; quiet empty states.
- **Roadmap vs code:** Schedule had 0 sub-24 px controls at phone width (roadmap said 31);
  Reports' 13 matched (4 native selects + 9 checkboxes). None failed WCAG 2.5.8 with its
  spacing exception, but all are now >= 24 px or 18 px with clearance.
- **Moved to 7.5:** sentence case for KPI and other labels (108 uppercase strings, 18 pages,
  several read by tests).
- **Bug caught before shipping:** a stray U+FEFF (from a PowerShell-written marker file) sat
  mid-`styles.css` and silently dropped the primary-button, tab and empty-state rules (primary
  rendered browser-grey). Removed; `test_components_phase7.js` now fails on any mid-file BOM.
- Tests: new `test_components_phase7.js` (1/16 on the old build, 17/17 now). Ten older tests
  found Executive Center's sub-tabs as `.toolbar button`; they now also accept
  `.tab-bar .tab-btn` (gate5 Executive Center, resources, status-date ×2, commitments ×2,
  physical progress, advanced schedule performance, baseline revision, integrated controls).
  `test_msp_xml_import_e2e.js` had a pre-existing race (one `flush()` after Confirm Import;
  failed 3/5 runs on the 7.3 build too): it now waits for the schedule (10/10). New
  `tests/visual/shots.js --audit 1` (24 px targets with the WCAG spacing exception + accessible
  names): old build fails 10 shots, new build passes 32/32. axe 0, 0 console errors.
- Size: `index.html` 6,354.8 → 6,357.6 KB; mirror 678.7 → 680.4 KB (its four tabs change too:
  KPI strip, 44 px phone controls).
- Sheets: `scratch/pcc-7.4/sheets/` (8 screens × 2 sizes + 4 mirror tabs).

## 2026-11-27 — Gate 7.3: shell (sidebar, title block, icons, palette, toasts)

- **Phone title (roadmap vs code):** the name had 36 px at 412 px because six header icons took
  300 px; every one of the 29 names truncated, and the roadmap's "drop the Sheet label" fix frees
  no width. Aditya chose to move Export / Import / Density / Focus into the nav drawer at
  <=780 px (labelled rows under Search, `.drawer__action`; each clicks the hidden header button).
  Measured in Chromium: 0 of 29 truncate at 412 px; the 4 longest still do at 360 px.
- Sidebar: plain filled active row (the blurred "gooey" layer and left stripe are gone),
  sentence-case group headers (`NAV_GROUPS` labels and `GROUP_SLUGS` keys changed together).
- Kubai duotone icons on all 29 routes via `navIcon()` (unique mask ids per copy; see
  DESIGN_SYSTEM.md "Icons"). Storage Management had no icon before; now `hard-drive`.
- Title block: 2 px module hairline only (no wash), hairline cells, sentence-case labels (also in
  `mirror-app/src/shim/contextSwitcher.ts`). Footer: sentence case ("Saved · time").
- Palette: sentence-case groups, same fill as the sidebar, no stripe; dark detail text on the
  highlight was 4.28:1 (pre-existing, found by opening the palette under axe), now primary.
- Toasts: one ink surface with a status dot. Dialogs, drawer, "⋯" menus: already compliant.
- Tests: new `test_shell_phase7.js` (1/14 on the old build, 14/14 now); nav test's group labels
  updated to sentence case; `test_local_dates_ist_e2e.js` now finds the date cell by its id
  (it matched the old "DATE" label text). axe 0 on 32 baseline shots + 16 shell states (drawer, palette,
  toasts, sidebar; both themes, both sizes), 0 console errors, no sideways scroll.
- Size: `index.html` 6,323.4 → 6,354.8 KB (icons); mirror 678.4 → 678.7 KB, tabs byte-identical.
- Sheets: `scratch/pcc-7.3/sheets/` (8 screens × 2 sizes) and `scratch/pcc-7.3/states/`.
- Left for 7.4: the blur hover on primary buttons and the tab underline (both "gooey" effects).

## 2026-11-27 — Gate 7.2: foundation tokens (the first visible Phase 7 change)

- `styles.css` only (+ the two build scripts' font lists): Gate 7.0's Variant A values in both
  theme blocks, `--ink`/`--on-ink` + ink `.btn--primary`, Inter for titles and figures
  (`tabular-nums`; `.kpi-card__value.mono` too), Space Grotesk removed, radii 6/8/8, interim sizes
  aliased onto the kept scale, module planning/management off violet, `--surface-2` /
  `--border-default` per theme, placeholders `--text-secondary`.
- Contrast, solved then measured: light-theme status hues darkened just enough for 4.6:1 as text
  (badge/heat-map text re-solved too). axe on 28 screens × 2 themes: **0 failures (22 before)**.
- **Revised after Aditya's review:** in dark mode, sections didn't separate (page and content
  were the same near-black). Dark now uses ColorOS-style elevation: page `#0a0a0b`, content
  surfaces `#1c1d21`, raised `#26282d`, neutral text; dark status/badge shades re-solved for the
  grey cards. Light unchanged. Still 0 axe failures. Phase 7's "one surface" is light-only now.
- Size: `index.html` 6,356.7 → 6,323.4 KB; mirror 710.9 → 677.8 KB.
- New `tests/test_design_tokens_phase7.js` (11 checks; fails 10/10 on the old styles).
- Before/after sheets: `scratch/pcc-7.2/sheets/` (8 screens × desktop/phone + 4 mirror tabs).
- Left for 7.5: ~6 `.mono` uses on dates/scores; uppercase label text in pages.
- Lesson repeated: never rebuild `index.html` while a suite runs in the background (the first
  7.2 run was stopped and restarted on the final build).

## 2026-11-27 — Gate 7.1: size/radius/colour literals onto tokens (no visual change)

- `styles.css` `:root`: interim `--text-9/10/10-5/12/13/13-5/17/20/24`, `--radius-xs`,
  `--surface-2` / `--border-default` (dark in both themes on purpose; fix in 7.2). 158 inline
  sizes, 2 radii, 4 colours (3× at-risk 8% → `color-mix`) in 22 pages and 30 CSS sizes moved.
- New `tests/test_no_style_literals.js` (137 files now). Mirror app rebuilt (tabs identical).
- Proof: 32/32 + 80/80 (20 more routes, before = `main`'s build via `shots.js --index`) + 8/8
  mirror shots byte-identical. `shots.js` now seeds `Math.random` (Storage Management's
  character count made runs differ before).
- Work was paused once (SSD removed) as a local WIP commit, then resumed.

## 2026-11-26 — Gate 7.0: visual baseline and direction (nothing shipped)

- Aditya chose Variant A (Inter, slate, blue `#2563eb`), ink primary button, module tint as a
  hairline, Kubai duotone sidebar icons. Tokens + route→icon map: `.claude/docs/DESIGN_SYSTEM.md`
  "Phase 7 target"; `pcc-ui` skill typography lines updated.
- New dev-only harness `tests/visual/` (`npm install` there once; `playwright-core` 1.49.1, uses
  the Chromium in `tools/playwright`): `node shots.js --out <dir> [--screens …] [--css f]
  [--icons map.json] [--fonts dir] [--axe axe.min.js]`. Not in `npm test`.
- Kept in `scratch/pcc-7.0/` (not the repo): baseline/variant shots, 12 comparison sheets,
  `PLAN.md` (critique + token plans), the Kubai export + `icons.json` map (`kubai-map.mjs`), the
  IBM Plex Sans files (unused now), `axe.min.js`. The variant stylesheets were deleted.
- Reference repos added under `repos/`: `impeccable` (partial: README, LICENSE,
  `skill/reference/*.md`; full clone kept failing) and `claude-wcag-skill`.
- Baseline contrast failures for 7.2/7.5: Portfolio (5 light / 3 dark), Documents (2).
- Push-check note: the mirror warning now shows on every push until `mirror-app/index.html` next
  changes in a commit (6.4's services changed but the rebuild was identical).

## 2026-11-26 — Gate 6.3: docs split (docs only)

- Moved UNEDITED (byte-verified): old CLAUDE.md → `docs/GOTCHAS.md`; README from "What's built"
  → `docs/BUILD_HISTORY.md`; HANDOFF from "NEW INITIATIVE: UI/UX Overhaul" →
  `docs/HANDOFF_ARCHIVE.md`. New `CLAUDE.md` (rules, one line each, with the closed decisions);
  README gained "Backing up your data" and "The three apps".
- Rule-by-rule check of the old CLAUDE.md: `docs/RULES_CHECKLIST.md`.

## 2026-11-26 — Gate 6.4: Commitments currency + real plurals

- `commitmentsService.ts`: `formatMoney(value, currency?)` (Cost's format, no more "$"),
  `projectCurrency()`, `formatMoneyTotals()` (one figure per currency, sorted). Commitments
  rows, the form's Actual note and the KPI strip use them.
- New `react/src/utils/plural.ts` → `plural(n, one, many?)`, applied to every "word(s)" string
  in `react/src/services/` (executiveCenter, schedule, reports). Auto-generated delay records
  now say "N days after its baseline" (only new records; old ones keep their text).
- Tests: new `test_commitments_currency_e2e.js` (now 136 files); updated
  `test_commitment_management_e2e.js` (project gets `currency: "USD"`, expects "USD 50,000"),
  `test_recovery_decision_reporting_e2e.js`, `test_reports_document_control_e2e.js`.
- Mirror app rebuilt: byte-identical, so these services don't reach it. The pre-push check
  will still print its mirror warning for this change; that's expected.
- **Not done, noted in the roadmap:** 39 "word(s)" strings in `pages/` (Phase 7), the
  schedule performance engine's "day(s)", and Change Orders showing no currency.

## 2026-11-26 — Gate 6.1: local pre-push check (replaces GitHub CI)

- Aditya chose no GitHub CI. New `.githooks/pre-push` (LF-only via `.gitattributes`). Enable
  once per clone: `git config core.hooksPath .githooks` (already set in this clone).
- Refuses: uncommitted changes in `src/`, `react/src/`, `build.js`; a committed `index.html`
  that differs from a fresh `node build.js` (line endings ignored; it leaves the rebuilt file
  for you to commit). Warns only: mirror-app inputs changed after `mirror-app/index.html`.
- Adds about a minute to every push (the rebuild). Checks the branch you're on only.
- Tested with `git push --dry-run` on a throwaway branch: all four cases behave.
- Next in order: 6.4 (Commitments currency + plurals), then 6.3 (docs split).

## Closed decisions (Gate 0.3, 2026-11-26) — don't reopen without a new reason

Full reasons in README.md's "Closed decisions" section.
- `.mpp` import: no dependency-free parser; MSP XML covers it.
- UI/UX Overhaul Gate 6: on hold since 2026-08-21, superseded by the PCC Redesign + React
  migration.
- Title-block DOM split: no room at phone width.
- Content Security Policy: would need `'unsafe-inline'`.
- Separate Spreadsheet Review: already inside Document Review (AI).
- AI on Android: would expose Ollama on the LAN with no authentication.

- `.sml` / `.plf` import: not needed; no such files in use (Aditya, 2026-11-26). Files in use
  are MSP, Excel, Word and photos. Gate 4.4 closed.
- Master prompt Phases 8–9: no longer available (Aditya, 2026-11-26). Nothing planned from them.
- GitHub CI: not used (Aditya, 2026-11-26); the local pre-push check replaces it.

## 2026-11-26 — Gate H.4: SheetJS 0.18.5 → 0.20.3

- `src/js/vendor/xlsx.core.min.js` replaced with 0.20.3 from
  `cdn.sheetjs.com/xlsx-0.20.3/package/dist/` (507,212 bytes, SHA-256
  `197255B0C278588117E45C14C1B25398562864CD9FFA9752C4B4D29F6D9BFD27`, Apache-2.0, no network
  calls in it). No code change. `index.html` 6,283.8 → 6,352.5 KB. Mirror app unaffected.
- New `tests/test_sheetjs_version_e2e.js` (now 135 files): version ≥ 0.20.2 (fails on 0.18.5)
  plus a read check that passes on both.
- Date behaviour: 0.18.5 returned local midnight minus 1 ms in IST, 0.20.3 returns exact local
  midnight; `dateCellToIso()` gives the same day for both. Both pinned date tests green.
- Chromium (Asia/Kolkata, both sizes): `.xlsx` import exact, Edit Excel round trip moves no
  dates and the regenerated file reads back the 24th, preview renders. Test file was written
  with the OLD SheetJS so the file isn't made by the library under test.
- ExcelJS 4.4.0 kept by decision (write-only use); recorded in CLAUDE.md.
- **Found, not fixed (pre-existing, identical on 0.18.5):** the spreadsheet preview
  (`fileViewer.js renderExcel`) shows date cells as Excel serial numbers (e.g. 46289.00011).
  Offered as a separate fix.
- Phase 0.5 (H.1–H.4) is complete. Next in order: 0.3 → 6.1 → 6.4 → 6.3.

## 2026-11-26 — Gate H.3: storage meter and pre-flight size check

- `storageAnalyticsEngine.js`: `LOCAL_STORAGE_LIMIT_CHARS` (5,242,880), `measureAppData`,
  `checkStorageFit`, `storageFullMessage`. `store.js`: `getLastSavedSize`,
  `getOtherStorageChars`, import pre-flight in `writeInlineBlobsAndCommit` (before any blob
  write). `storageService.ts`: `getAppDataUsage`, `storageFitError`, used by `commitImport`
  (schedule), `saveDocument`, `commitBulkImport`. Storage Management: "App data" panel
  (`<meter>` + top 10 collections + other keys). `layout.js`: one 80% warning per session.
  `notifications.js`: optional `{label, onClick}` button (inherits the toast's text colour).
- New tests (now 134 files): `test_storage_meter_engine.js` (7) and
  `test_storage_meter_e2e.js` (8; it uses a filler `localStorage` key to use up space).
  Both fail on the old build. Chromium checks in `scratch/pcc-h3/`.
- **Open hand-off: Aditya's real meter reading** (Storage Management → App data, the
  percentage and the top three rows). Gate 6.2 is decided from it.
- Mirror app rebuilt (store.js, notifications.js changed) via the C: junction method.
- Schema still 67. No installers built.

## 2026-11-26 — Gate H.2: data from a newer version is refused

- `store.js`: `NEWER_VERSION_MESSAGE` + `isFromNewerVersion()`; `migrate()` throws for
  `schema_version > SCHEMA_VERSION`; `load()` sets `blockedByNewerVersion` instead of
  migrating, and `persistToLocalStorage()` then writes nothing; `exportNewerVersionData()`
  saves the raw stored value. `layout.js`: undismissable `#newer-version-overlay` with one
  "Export this data" button. Mirror app: `"newer"` status, message panel shown above the data
  it already had. Typings in `pcc.d.ts`.
- New `tests/test_newer_version_guard_e2e.js` (now 132 files): 3/10 on the old build, 10/10
  now. Chromium checks for both apps passed (screenshots in `scratch/pcc-h2/`).
- **Building the mirror app from this exFAT SSD:** copy `src/`, `react/`, `mirror-app/` (with
  their `node_modules`) to a temp folder on C:, create the three links as junctions
  (`mklink /J mirror-app\node_modules\{react,react-dom,@types}` →
  `react\node_modules\...`), run `node mirror-app/build.js` there, copy
  `mirror-app/index.html` back, then `rmdir` the junctions BEFORE deleting the temp folder (a
  recursive delete through a junction can follow it). `build.js` itself is unchanged.
- The mirror message reuses the import wording ("…then import again") as the roadmap asked,
  though At a Glance has no import; reword later if it reads oddly on the phone.
- Schema still 67. No installers built. At a Glance APK not rebuilt (needs versionCode bump
  and its keystore when Aditya asks).

## 2026-11-26 — Gate H.1: PDF parser no longer evaluates script

- `src/js/fileViewer.js` and `react/src/services/documentsService.ts` pass
  `isEvalSupported: false` to `pdfjsLib.getDocument()` (CVE-2024-4367 in pdf.js 3.11.174).
  No third call site exists. pdf.js 4.x upgrade recorded as a closed decision.
- New `tests/test_pdf_eval_disabled_e2e.js` (in the `npm test` chain, now 131 files): fails on
  the old build, passes now. Real Chromium at 1440×900 and 412×915: a generated text PDF
  renders in the viewer and its text extracts, zero console errors.
- Schema still 67. The mirror app doesn't bundle pdf.js, so it's unaffected. No installer
  built (none asked for).
- Playwright's Chromium (1255) is on the SSD in `tools\playwright`. Installing straight to
  the SSD fails (Playwright's lock file goes stale on exFAT), so install to a temp folder on
  the PC with `PLAYWRIGHT_BROWSERS_PATH` pointing there, copy the browser folders across, and
  delete the temp folder.

## 2026-11-26 — Gate 0.2: cheaper schema bumps (tests only)

- `tests/schemaVersion.js` reads `SCHEMA_VERSION` from `src/js/store.js`. The 7 boot-check
  assertions in 6 files compare against it. `test_store_schema_v54_migration.js` keeps exact
  numbers behind one `FINAL_SCHEMA_VERSION` constant (was 36 literals). **Next bump: change that
  one constant and add the step's checks; nothing else in `tests/` should need touching.**
- Control: a realistic trial bump (constant 68 + empty v68 step) failed all 7 files before,
  only the migration test after. Reverted. A trial bump needs the step, because `migrate()`
  sets the version per step.
- No `src/` change, `index.html` unchanged, schema still 67. Gate 0.1 (phone check) stays open.
- **Windows dev machine notes (new this session, not repo changes):**
  - Fixed at Aditya's request: `build.js` and `mirror-app/build.js` called
    `execFileSync("npm", …)`, which can't launch `npm.cmd` on Windows (`spawnSync npm
    ENOENT`). Both now use `execSync("npm run …")` through the shell, which also works on
    Linux. `node build.js` verified on Windows: output identical to the committed build.
  - `node mirror-app/build.js` still can't run from this SSD: `ensureReactSymlinks()` needs
    symlinks and the drive is exFAT. Not fixed: copying instead would put a second React copy
    in the bundle (see CLAUDE.md's mirror-app section). The mirror app is Android-only.
  - Fresh builds on Windows differ from the committed ones only by CRLF (`core.autocrlf=true`).
  - Fixed in this gate at Aditya's request: `test_time_zone_setting_e2e.js`'s "date-only value
    … in EVERY zone" check hardcoded `"9/24/2026"`, so it failed on any non-en-US machine (this
    PC is en-IE: `24/9/2026`). It now builds the expected 24 September in the device's own
    locale. Control: re-introducing a day shift in `formatDate` still fails it.
  - Windows installer builds natively here, no wine: `cd packaging && npm ci`, then
    `node node_modules/electron/install.js` (npm 11 skips Electron's install script), then
    `npm run electron:build`. Caches live on the SSD via `ELECTRON_CACHE` /
    `ELECTRON_BUILDER_CACHE` in `env.cmd`. Trial build of 1.10.0 verified (embedded
    `index.html` byte-identical, app launches).

## 2026-11-11 — Whole-project audit (no code changed)

Audit at `e29740e`: 130/130 test files green, `tsc` clean, both committed builds identical to
fresh builds, 29 pages clean in Chromium at 1366×768 and 412×915. Findings were turned into
three new phases in `DEFERRED_ROADMAP.md`, which is where the detail lives:

- **Phase 0.5, Hardening (do first):** PDF parser script evaluation (H.1), newer-version data
  accepted silently (H.2), ~5.2M-character `localStorage` ceiling with no early warning (H.3),
  SheetJS 0.18.5 (H.4).
- **Phase 6, Foundation:** CI, storage ceiling, doc sizes, Commitments currency, cold start.
- **Phase 7, Visual refresh:** direction, banned patterns and gates 7.0–7.7.

Schema is still 67. Nothing was built, so no zip and no installers. The branch
`claude/fervent-gates-lvy9qw` carries these two doc changes only and is not merged to `main`.

## What this project is

Solo-developer, offline-first project/portfolio management app, built as a single
self-contained `index.html`. Repo: `TIMEFREAK7/Project-Control-Center`. Full history and
rationale live in `docs/BUILD_HISTORY.md` (was README.md until Gate 6.3). Rules live in
`CLAUDE.md`, with the full story behind each in `docs/GOTCHAS.md`. Where the two sections below
differ from CLAUDE.md (e.g. the Windows build command), CLAUDE.md is current.

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
  working copy) and open `index.html` in real Chromium. **Extended as of the Mobile & Desktop
  Packaging initiative (Aditya, explicit)**: once a platform installer exists (the Electron
  `.AppImage`/`.dmg`/`.exe`, later the Android `.apk`), it ships in the zip too, alongside
  `index.html`/`README.md`/`data/`/`files/` — `packaging/`'s own source/`node_modules/` stay out,
  same dev-only treatment as `src/`/`build.js`/`tests/`.
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
- **A packaging build that exceeds the ~30MB file-transfer limit (the Windows `.exe`, recurring at
  ~100-105MB) gets split into parts and sent directly, not routed through Git LFS by default or
  skipped.** Standing instruction as of 2026-08-23 (Aditya, verbatim: *"divide the exe in part and
  give it to me... update this into claude.md, handoff.md, and README so as to never lose it
  again"*): `split -b 25M -d -a 2 "<file>" "<file>.part"`, verify the reassembled file's SHA-256
  matches the original *before* sending, send every part via the session's file-delivery tool, and
  give Aditya both the SHA-256 and the exact Windows Command Prompt reassembly command
  (`copy /b part00+part01+...+partNN "output.exe"`). Full worked example in
  `packaging/README.md`'s "Distributing a build" section. Also written into `CLAUDE.md` itself now.
- **ALWAYS bump the Android `versionCode` (and `versionName`) before every APK release build, no
  exceptions — real bug found 2026-08-24.** `versionCode` sat hardcoded at `1`
  (`packaging/android/android/app/build.gradle`) since the very first release build across 5 full
  Daily-Use Audit phases of changes, so every "new" APK handed to Aditya looked identical to
  Android's package manager — which refuses to install an update in place unless the new APK's
  `versionCode` is strictly greater than the currently-installed one — forcing Aditya to uninstall
  the old APK before every single install. Fixed: bumped to `versionCode 2` / `versionName "1.1"`
  this round; **check the file's current values first, don't assume a starting point**, then bump
  `versionCode` by at least 1 and `versionName` to match on every future release build. Also bump
  `packaging/package.json`'s `"version"` (now `1.1.0`) before an `electron:build` — Windows/NSIS
  isn't as strict about this as Android, but keeping both packages' version numbers moving forward
  together is still correct practice. Also written into `CLAUDE.md` itself now.

## Quick reference: building the Windows EXE / Android APK

Added 2026-09-08 so a fresh session doesn't have to re-derive this from scattered session
write-ups. Full troubleshooting detail (the exact apt/gradle commands, why each gotcha happens)
is in this file's "2026-09-08 session: Windows EXE + Android APK release build" entry near the
end of this file, and in `CLAUDE.md`'s "Building release installers" section — this is the
short version. Always `node build.js` at the repo root first.

**Windows** — requires Wine (`wine64` **and** `wine32:i386`; NSIS's stub is 32-bit). Build with
`cd packaging && node scripts/copy-app.js && npx electron-builder --win` — NOT the bare `npm run
electron:build` script, which has no `--win` flag and defaults to the host OS (silently builds a
Linux AppImage on a Linux sandbox, no error). No code-signing cert (standing decision, personal
use only — "Unknown Publisher" warning expected). Verify: extract `app.asar`, diff its
`electron/index.html` against the fresh repo-root build, must be byte-identical.

**Android** — requires JDK 21 + an Android SDK (`platform-tools`, `platforms;android-36`,
`build-tools;36.0.0`) under `ANDROID_HOME`, and the project's real signing keystore at
`packaging/android/android/app/{pcc-release.jks,keystore.properties}` (gitignored; **Aditya holds
the only backup** — a fresh container has none and needs it re-supplied, or `assembleRelease`
silently falls back to an unsigned APK that fails to install at all). **Bump `versionCode`/
`versionName`** in `build.gradle` before every release build, no exceptions (real shipped bug,
2026-08-24). Build: `cd packaging/android && npm install && npm run android:build:release`.
Verify: `apksigner verify --verbose` + `--print-certs` (signer cert SHA-256 must match the
keystore backup's own documented fingerprint exactly) + `zipalign -c -v 4`.

**Both**: `sha256sum` the result; split anything over ~30MB with `split -b 25M -d -a 2` and verify
the reassembled file's checksum before sending (the `.exe` always needs this, ~100-106MB).

**Gotchas worth knowing before hitting them cold**: installing `wine32:i386` on a sandbox that
also has a PHP PPA enabled can silently uninstall `wine`/`wine64` (amd64) as collateral — a
`libgd3` cross-architecture version mismatch; fix by pinning both architectures to the same
`libgd3` version before (re)installing wine. Maven Central can return HTTP 429 during a cold-cache
Gradle build — transient, retry (each attempt reuses cached artifacts and fails less). A
`gradlew ... | tee log` pipeline reports `tee`'s exit code, not gradle's — grep the log for
`BUILD SUCCESSFUL`/`BUILD FAILED` rather than trusting a bare `$?` check.

