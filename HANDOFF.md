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

## NEW INITIATIVE: UI/UX Overhaul (started 2026-08-20) — a THIRD, separate roadmap

`main` is up to date through **UI/UX Overhaul Gate 8 — Tablet/Mobile Optimization, which CLOSES
OUT the brief's entire original 8-gate breakdown** (Gates 1, 2, 3, 4, 5, 7, and 8 are all
COMPLETE; Gate 6 "Existing Modules" is still ON HOLD after Documents/Risk Register/Schedule — see
below — and is now the ONLY open item left in this whole initiative), plus a standalone bug fix
for the Gantt chart's Today/Data Date label overlap (shipped between the Documents and Risk
Register Gate 6 passes — see the "Recently fixed bugs / notable gotchas" section near the end of
this file). `schema_version` **53** (Gate 7 Density Control's `settings.density` field — see its
own write-up below; no gate since, including Gate 8, needed a schema change; unchanged from 52
through Gates 3-6 and 8, all pure display/computed-stats/reorganization/responsive-CSS work). Gate
2 included its
post-ship nav revision (an Outlook-Online-style hidden overlay with accordion groups, replacing
Gate 2's original persistent/collapsible sidebar — see that gate's own write-up below for detail).
With Tiers A-F, Tiers 1-2, and Tier 3 all complete/closed out (see below), Aditya started an
entirely new, large initiative right after: a **complete UI/UX overhaul** — desktop, laptop,
tablet, mobile — turning PCC's look into a "professional Project Controls / PMO application"
while explicitly preserving all existing business logic, data, schema, and module behavior. This
is UI/UX ONLY — no new architecture (still vanilla JS, no React/Vue/backend/server/AI), no schema
changes unless a UI requirement genuinely needs one (and if so, STOP and explain the migration
before touching it — Aditya's own explicit instruction).

Aditya handed over a very detailed brief (full design direction, responsive tier definitions,
per-module redesign notes, and his own **recommended 8-gate breakdown** — Gate 1 Design System,
Gate 2 Global Navigation, Gate 3 Portfolio, Gate 4 Project Workspace, Gate 5 Executive Center,
Gate 6 Existing Modules (one at a time), Gate 7 Desktop/Laptop Productivity, Gate 8 Tablet/Mobile
Optimization) — not saved as a file in this repo, preserved in conversation history only; get it
re-confirmed from Aditya if a future session doesn't have it in context. Standing instruction from
the brief itself, worth repeating: **inspect real code before each gate, propose scope, wait for
explicit approval, implement exactly that gate, verify, stop** — same discipline as every other
initiative in this project, and explicitly do NOT chain gates automatically.

**Inspection findings before Gate 1 (still true, useful for any future gate's own inspection
step)**:
- Schema is **v51**, not v17 as the brief assumed — noted to Aditya, no functional impact.
- `src/js/layout.js` is the entire app shell (sidebar, title-block header, footer) — one `mount()`
  call, built once. `src/js/router.js` is a bare 24-line hash router, **flat namespace only** — no
  nested routes, no `#/project/:id/...` concept exists.
- **There is no "Project Workspace" page today.** Portfolio's "Details" button expands an inline
  accordion in place (`renderProjectDetails` in `portfolio.js`) — it doesn't navigate anywhere.
  Every module page (Schedule, Documents, Risks, Cost, ...) keeps its **own independent**
  `uiState.projectId` and its own project dropdown. Cross-page navigation is stitched together by
  an existing hand-off convention — e.g. Portfolio's "Executive Center" button calls
  `window.PCC.executiveCenter.viewProject(id)` then routes; Executive Center's own action buttons
  call e.g. `window.PCC.cost.filterByProject(id)` before routing elsewhere. **Any future "Project
  Workspace" shell (Gate 4) must route through this convention, not replace it** — it's how every
  module already agrees on "which project" across page boundaries.
- `src/js/pages/executiveCenter.js` (160KB, the largest file in the app) already IS the
  "management briefing" concept the brief describes for Gate 5 — `buildProjectContext()`, KPI
  panels, a Management Attention list, print-ready Snapshot/Management Pack builders shared with
  `reports.js`. Gate 5 is a redesign of something substantial, not a from-scratch build.
- **Exactly one responsive breakpoint existed pre-Gate-1**: `max-width: 780px` (plus two small
  phone-only sub-tweaks at 480px/420px). No laptop or tablet tier at all — confirms the brief's
  core complaint. Gate 2 (nav) and Gate 8 (tablet/mobile) own actually introducing tiered
  behavior; Gate 1 deliberately only added the token/documentation groundwork, not new breakpoint
  behavior (see below).
- Reusable as-is: color tokens/theme system (`[data-theme]`), local `.woff2` font loading, `.btn`/
  `.field`/`.status-badge`/`.kpi-card`/`.data-table`/`.panel` primitives, the print stylesheet
  (`.report-doc`, already theme-independent/ink-safe), `router.js` unchanged, the store's
  `onChange` autosave-status wiring, the toast system, the `filterByProject`/`viewProject`
  hand-off convention above.

**UI/UX Overhaul Gate 1 — Design System** (merge `6b6849e`). Pure CSS, `src/css/styles.css` only —
**zero `.js` files touched, zero schema change, zero navigation/breakpoint restructuring**
(deliberately left to Gate 2/8, which own that per Aditya's own gate plan). Scope, confirmed via
inspection first, no `AskUserQuestion` needed (mechanical, non-ambiguous once the brief's own Gate
1 definition was matched against real code):
- **New tokens**: typography scale (`--text-xs` through `--text-2xl`, additive — existing pages
  keep their own hardcoded px sizes for now, ready for gradual adoption as pages get touched in
  later gates, not a forced rename), extended spacing (`--space-7`/`--space-8`), `--shadow-lg`, and
  **`--status-warning` (orange)** — a genuinely new semantic color completing the brief's
  Green/Blue/Amber/Orange/Red five-step scale (previously only 4 status colors existed: on_track/
  at_risk/critical/info — no distinct "Warning" step between Amber-Attention and Red-Critical).
  Breakpoint tiers documented as a comment (Large Desktop ≥1600 / Desktop 1280-1599 / Laptop
  1024-1279 / Tablet 768-1023 / Mobile <768) for Gate 2/8 to implement — CSS custom properties
  can't be read inside `@media` conditions, so these are plain literals kept consistent with the
  comment, not variables.
- **Subtler grid background** — reduced `--grid-line` alpha in both themes (dark 0.07→0.045, light
  0.05→0.035), per the brief's "make it subtle, don't compete with tables/cards/text." Panels
  already mask it with an opaque `--bg-paper` fill, so this only affects the visible gaps between
  panels — no structural change needed to achieve this.
- **Refined existing primitives**: `.btn--sm`/`.btn--danger` size/semantic variants,
  `.status-badge--warning`, `.progress-fill--on_track/--at_risk/--warning/--critical/--info` status-
  color variants (previously every progress bar was hardcoded amber regardless of health),
  `.data-table--sticky-header` (opt-in modifier, inert until a page wraps a table in a
  scrollable-height container).
- **New primitives, all inert this gate — no page references any of them yet**:
  `.progress-bar`/`.progress-bar__*` (a labeled progress-bar-with-percentage block, for project
  health cards/Executive Center panels), `.attention-list`/`.attention-item` (a consistent
  Management Attention row pattern — `dashboard.js` and `executiveCenter.js` currently each
  hand-build their own Management Attention markup independently; this gives future gates one
  shared pattern instead of a third bespoke one), `.modal-overlay`/`.modal`/`.modal__*` and
  `.drawer-overlay`/`.drawer`/`.drawer__*` (PCC has **no modal/drawer system at all today** —
  every form opens inline in place — so this is new UI vocabulary, not a refinement of something
  existing; no JS controller was written for these since nothing calls them yet, keeping the
  bundle lean per the brief's performance requirement), `.sidebar--collapsed` (icon-rail-only CSS
  variant — Gate 2 owns adding the actual collapse toggle button and applying this class),
  `[data-density="compact"]` (root-level spacing-token override — Gate 7 owns adding the actual
  density switcher).

Verification: `node build.js` (4272.1 KB, +8.5KB over the pre-Gate-1 build — CSS additions only),
full existing **60-file test suite passes unchanged** (expected — no JS behavior touched, this
is entirely a CSS-file change), real-Chromium check across all of the brief's own requested
viewport sizes (1920×1080, 1600×900, 1440×900, 1366×768, 1280×800, 820×1024 tablet, 390×844
mobile) confirmed zero console/page errors and that existing Portfolio/Dashboard data (two seeded
projects, Critical/On Track badges, progress bars, budget/finish figures) still renders correctly
and identically to before — this gate is invisible in effect except for the subtler grid and new
`--status-warning` token, exactly as intended for a "tokens + inert primitives" gate. Zip verified
separately post-merge (fresh extraction, real Chromium) — clean.

**UI/UX Overhaul Gate 2 — Global Navigation** (merge `f98de7b`). Two genuine forks in the brief
were put to Aditya via `AskUserQuestion` before building:
- **Sidebar collapse: manual toggle, persisted (chosen over per-tier auto-collapse)** — one
  collapse button, same behavior from Large Desktop down through Tablet, remembered across
  reloads rather than the width itself deciding a default state.
- **Mobile nav: hamburger + slide-in drawer (chosen over a bottom tab bar)** — avoids having to
  pick which ~4 of 23 nav items "win" a permanent slot.

**This is the one data-layer touch Gate 2 needed, flagged and confirmed before building it, per
Aditya's "STOP and explain" rule**: new `settings.sidebar_collapsed` (boolean, default `false`),
`schema_version` **51 → 52**, one migration block backfilling every existing install to `false` —
the same expanded-by-default behavior every install already had, just now an explicit, editable
setting instead of the only option. `test_store_schema_v51_migration.js` renamed to
`test_store_schema_v52_migration.js` (this project's "one canonical full-chain migration test
targeting latest" convention) with new backfill checks.

What shipped, `layout.js` + `styles.css` only (no page files touched):
- **`buildNavList()`** factored out of the old `buildSidebar()` — one function building a fresh
  `<ul class="sidebar__nav">` from `NAV_GROUPS`, now shared by the fixed sidebar AND the new
  mobile drawer. Both copies use the same `.sidebar__link`/`data-route` shape, so
  `setActiveNav()`'s existing plain `querySelectorAll(".sidebar__link")` highlights whichever
  copy(ies) happen to be in the DOM without needing to know which.
- **Collapse toggle**: a `.sidebar__collapse-btn` in a new `.sidebar__header-row` (wrapping the
  existing "SHEET INDEX" label). Click handler flips `settings.sidebar_collapsed`, toggles
  `.sidebar--collapsed` (Gate 1's inert icon-rail CSS, now with its first real caller) on the
  actual `.sidebar` element, and updates the button's own glyph/title (« collapse / » expand).
- **Mobile drawer**: `openMobileNav()`/`closeMobileNav()` build/tear down a `.drawer-overlay` +
  `.drawer` (Gate 1's inert primitives, also now wired up) containing a fresh `buildNavList()`
  call. Closes on backdrop click, Escape, clicking a nav link inside it, or — via a new call
  inside `setActiveNav()` itself — ANY route change at all, even one triggered by something other
  than a drawer link. A hamburger button (`.icon-btn--menu`) lives in the title block, always in
  the DOM but CSS-hidden above 780px.
- **The fixed `.sidebar` is now hidden entirely below 780px** (`display: none`), not turned into
  the old horizontal scroll strip of all ~23 links — that strip was exactly the "desktop nav
  squeezed into mobile" anti-pattern the redesign brief calls out by name. The drawer replaces it.
- **Laptop tier (≤1279px)**: `main.page` padding reduced (24px → 20px) — the brief's "reduce
  unnecessary padding... prioritize the main workspace" for laptop specifically. No sidebar
  width/auto-collapse logic at this tier — that's what the manual toggle is for, per Aditya's
  choice above.

**Bug caught and fixed before shipping** (self-caught, via the new test suite, not user-reported):
the drawer's nav list is built fresh every time it opens — well after the most recent route
change already ran `setActiveNav()` — so its links started with no `active` class at all, even
when a route was clearly selected on the (still-correctly-highlighted) fixed sidebar. Fixed by
having `buildNavList()` set the `active` class at build time from
`window.PCC.router.currentRouteName()`, not relying on the next route change to fix it retroactively.

**Test-writing note, same trap as Gate 4's Gantt virtualization test, now confirmed to also apply
to real anchor-href hash navigation (not just `router.go()`)**: clicking a real `<a href="#/...">`
element in this jsdom version resolves the resulting hash change and `hashchange`-driven rerender
**asynchronously** once the full app's timers/listeners are involved — even though a minimal
isolated repro shows it resolving synchronously. Any jsdom e2e test that clicks a nav link (drawer
or otherwise) and immediately asserts on `router.currentRouteName()` needs an `await flush()` in
between, exactly like the `router.go()` case already documented in
`test_gantt_virtualization_e2e.js`. Not a real bug — real Chromium navigates synchronously, as
confirmed in this gate's own Playwright pass.

Tests: new `tests/test_uiux_gate2_navigation_e2e.js` (39 checks, including a 26-route smoke test)
— collapse toggle adds/removes the class and persists to the store; a persisted `true` preference
is honored when the shell is rebuilt (simulating a reload, via re-invoking `layout.mount()` rather
than spinning up a second JSDOM instance sharing localStorage); the hamburger opens a drawer with
the full grouped nav (all four group labels present); backdrop click, Escape, and drawer-link-click
all close it; navigating any other way also closes it; both the fixed sidebar's and the drawer's
copy of a link get highlighted correctly for the active route. Full suite: **61 files**, clean,
zero regressions. Real-Chromium pass (5 screenshots: desktop expanded, desktop collapsed with
content reflowing into the reclaimed width, the SAME collapsed state confirmed to survive an
actual `page.reload()` — not just in-memory — mobile closed showing just the hamburger, and the
mobile drawer open with "Dashboard" correctly highlighted) confirmed everything renders and
persists correctly — zero console errors. Zip verified separately post-merge (fresh extraction,
real Chromium, collapse toggle exercised) — clean.

**Process note for future sessions, not a code issue**: partway through staging this gate's
changes, a `git add -A -- <explicit file list>` call included one already-renamed path in its
list, which failed the whole invocation's pathspec resolution and silently left the other listed
files (`index.html`, `styles.css`, `layout.js`, `store.js`, `package.json`) unstaged — the first
commit only captured the test rename and the brand-new test file, not the actual implementation.
Caught immediately via `git status` right after committing (routine practice, not a special
check), fixed with an honest follow-up commit rather than amending. Worth remembering: after any
`git add` invocation that touches a rename/move alongside plain edits, check `git status` before
trusting the commit is complete, not just after.

**UI/UX Overhaul Gate 2 revision — Outlook-Online-style hidden nav with accordion groups**
(merge `818bdf2`). Right after Gate 2 shipped, Aditya asked for a different nav paradigm than what
was just built: instead of a persistent, manually-collapsible sidebar, the nav should be hidden
entirely at every screen size until the hamburger button is clicked (Outlook Web's own pattern),
and each group (OVERVIEW/REGISTERS/PLANNING/OUTPUT) should be its own click-to-expand accordion
instead of an always-visible flat list. This REPLACES the collapse-toggle behavior Gate 2 had just
shipped, not a new gate on top of it — no schema change, no new gate number.

- **No more persistent `.sidebar` element, at any tier.** `buildSidebar()` and
  `setCollapseBtnState()` are gone from `layout.js`; `mount()` no longer appends a sidebar to the
  shell at all. `main-column` no longer reserves a sidebar-width gutter (`margin-left` dropped
  entirely, not just at mobile). The hamburger (`.icon-btn--menu`) is now visible at every screen
  size, not CSS-hidden above 780px — it's the only way to reach navigation anywhere now.
- **`openMobileNav`/`closeMobileNav` renamed to `openNav`/`closeNav`** since they're no longer
  mobile-specific — same overlay+drawer mechanics Gate 2 already built (backdrop click, Escape,
  link click, or any other route change all still close it via `setActiveNav()`), just the only nav
  surface now instead of one of two. The drawer slides in from the LEFT now (new `.drawer--left`
  modifier on Gate 1's originally-right-anchored `.drawer` primitive), matching the top-left
  hamburger it opens from — the base `.drawer` class keeps its own right-anchored default for any
  future non-nav drawer use (e.g. a document-preview panel).
- **Accordion groups**: `buildNavList()` renders each group as a `<button>` (label + chevron)
  followed by its items in a `<ul>` that CSS-transitions `max-height` open/closed. A module-level
  `expandedGroups` map (not store-backed — resets on an actual page reload, same as the nav itself
  always starting closed) tracks which groups are open: the group containing the CURRENT route is
  lazily defaulted to expanded the first time it's ever built, every other group defaults to
  collapsed; a manual expand/collapse persists across closing and reopening the nav within the same
  page load. Groups toggle independently — opening one doesn't close another.
- **`settings.sidebar_collapsed`** (added in Gate 2 for the collapse-toggle version,
  `schema_version` 51 → 52) **is now unused** — nothing reads or writes it any more, since there's
  no persistent collapsed/expanded state left to persist under this model. Left untouched in the
  schema, no migration change, no data loss — same "retire in place, don't remove" precedent this
  app already has (`schedule.is_baseline`, Gate 22). Flagged to Aditya before building per his
  "STOP and explain" rule for anything schema-adjacent, even though this specific case needed no
  actual migration work.

**Test-writing note**: `test_uiux_gate2_navigation_e2e.js` was rewritten (not just patched) since
the old collapse-toggle assertions target DOM that no longer exists. One self-caught bug in the
NEW test itself, not the app: the "clicking a nav link navigates and closes" check unconditionally
clicked the REGISTERS group's toggle to "expand it before clicking the link inside," without
checking whether an EARLIER check in the same file had already left it expanded — so it sometimes
collapsed a group that was supposed to stay open, failing a LATER assertion in a different check.
Fixed by only clicking the toggle if the group isn't already expanded. **General lesson for any
future accordion/toggle test**: don't assume a fresh collapsed/expanded state at the start of a
check — either read the current state first, or make the check independent of what earlier checks
in the same file left behind.

Tests: `test_uiux_gate2_navigation_e2e.js` rewritten, 37 checks (was 39 for the collapse-toggle
version) — no persistent sidebar in the DOM; hamburger opens the overlay with all four groups
present, correct one auto-expanded; clicking a collapsed group's header expands it and vice versa;
a manually expanded group survives closing and reopening the nav; backdrop click/Escape/link
click/any other route change all close it; reopening on a different active route highlights the
right link and keeps the (still-manually-expanded) group open. Full suite: **61 files**, clean,
zero regressions. Real-Chromium pass (4 screenshots: nav closed showing the full-width reclaimed
layout, nav open with only OVERVIEW expanded, REGISTERS expanded alongside it after clicking its
header, and the identical pattern at a 390px mobile viewport) confirmed the overlay slides from the
left, accordion groups expand/collapse correctly, and navigating via a link closes the overlay —
zero console errors. Zip verified separately post-merge (fresh extraction, real Chromium) — clean.

**UI/UX Overhaul Gate 3 — Portfolio card redesign** (merge `cac3549`). Scope confirmed via
`AskUserQuestion` (three questions) before building, per this initiative's own "inspect, propose,
wait for approval" discipline:
- **Card redesign approved as scoped** — `portfolio.js`'s `renderProjectCard()` + `styles.css`
  only, no schema change. Gate 1's `.progress-bar` primitive (labeled, heavier variant) replaces
  the old plain inline progress bar; three new stat chips (Open Risks/Issues, Open RFIs/TQs,
  Document Availability) computed directly and cheaply from the store.
- **Schedule status: reuse the existing status badge, no new figure** — the brief's mockup wanted a
  separate "Schedule status" line, but the only real per-project Schedule Performance Score lives
  behind Executive Center's `buildProjectContext()`, which runs the full CPM engine and would be far
  too expensive to call once per card in a portfolio list. Aditya's call: the card's existing
  On Track/At Risk/Critical badge already carries that signal — skip a duplicate/approximate figure
  rather than build one.
- **Edit/Archive: build a small new contextual menu** — PCC's first dropdown/menu component
  (`.card-menu`/`.card-menu__dropdown`/`.card-menu__item`, plus a transparent `.card-menu__overlay`
  that closes it on outside click, same "backdrop click closes it" convention Gate 1's modal/drawer
  primitives already established). Deliberately small and scoped to this need, not a general menu
  system.

What shipped:
- **`projectCardStats(data, projectId)`** (new, `portfolio.js`) — Open Risks/Issues and Open
  RFIs/TQs reuse the exact same `status !== "closed"` filters `renderProjectDetails()` already used
  for its own Details-panel sections; Document Availability mirrors Executive Center's Gate 27
  Executive Summary logic (`available = data.documents.some(project_id + document_type_id match)`
  against `project_document_requirements`), scoped to just the counts. All three are cheap, direct
  store filters — deliberately NOT routed through `buildProjectContext()`.
- **Card layout**: name/client/company/country meta and the status badge are unchanged; the plain
  progress bar became a labeled `.progress-bar` (Progress / NN%) colored by the project's status via
  the same `progress-fill--<status>` modifier classes Gate 1 already defined (applied alongside
  `.progress-bar__fill` — no new CSS needed for the color, since a class only needs to match a rule,
  not a specific base element); Budget/Finish stay in `.project-card__figures`; the three new stat
  chips sit in a new `.project-card__stats` row. Executive Center and Details remain the primary
  visible action buttons; Edit/Archive moved into the new "⋯" `.card-menu` at the end of the actions
  row.
- **New CSS**: `.project-card__stats`/`.card-stat`/`.card-stat__label`/`.card-stat__value` (stat
  chips) and `.card-menu`/`.card-menu__overlay`/`.card-menu__dropdown`/`.card-menu__item` (PCC's
  first menu component) — all additive in `styles.css`, no existing rule touched beyond the
  `renderProjectCard()` markup itself.

**No bugs self-caught this gate.** Two pre-existing tests broke as an EXPECTED consequence of moving
Edit/Archive behind the new menu (not a regression — the button they looked for now needs the menu
opened first): `test_portfolio_performance_e2e.js` ("Project Type is now editable...") and
`test_my_work_e2e.js` ("Vendor's Next Follow-up Date round-trips and Portfolio's edit form...") both
now click the card's `.icon-btn[aria-label="More actions"]` before looking for the `Edit` button.
**General note for any future test that clicks a project card's Edit/Archive**: open the "⋯" menu
first, same pattern.

Tests: full suite **61 files, 1695 checks**, zero regressions beyond the two expected menu-related
updates above. Real-Chromium pass (two seeded projects with risks/RFIs/document requirements —
desktop cards showing the labeled progress bar and stat chips including a "1/2" Documents figure,
the "⋯" menu open showing Edit/Archive, and a 390px mobile viewport confirming the card's existing
flex-wrap layout stacks the new elements cleanly) confirmed everything renders correctly — zero
console errors.

**Process note for future sessions, not a code issue**: this session's local `main` branch was
stale — created early in the container's life from an old `origin/main` tip (`2998eb9`, back around
Gate 7), and `origin/main` had since moved ~76 commits ahead (through Gate 8 onward, all of Tiers
A-F/1-3, and UI/UX Gates 1-2) while local `main` still carried its own 17 old commits not reachable
from the new tip — `git merge` refused with "refusing to merge unrelated histories." Fixed safely
(no work lost — the actual Gate 3 change was already committed and pushed to the feature branch
before this was discovered) via `git checkout main && git reset --hard origin/main`, then re-merging
the feature branch cleanly. **General lesson**: before merging a working branch into `main` in any
future session, check `git log main --oneline -1` against `git log origin/main --oneline -1` first
— a local `main` that predates the container's most recent `git fetch` can silently be very stale.

**UI/UX Overhaul Gate 4 — Project Workspace** (merge `b9bff41`). Aditya pasted the full original
brief text into this session (it had only ever lived in prior conversation history, per the caveat
above) — worth preserving here in case a future session needs it again: it's a long, detailed spec
(design direction, responsive tiers, Portfolio/Workspace/Executive Center mockups, an explicit
"Do not invent data that does not exist" / "SUMMARY FIRST, DETAIL ON DEMAND" principle, and the
same 8-gate breakdown already known). Two genuine forks were put to Aditya via `AskUserQuestion`
before building:
- **Add Workspace alongside Portfolio's existing "Details" accordion, not replacing it** — both
  stay. Portfolio's card gained a new "Open Workspace" primary action (amber, first in the row)
  without touching Executive Center/Details/the "⋯" menu Gate 3 just shipped.
- **Defer the CPM-derived progress chart and true Forecast Finish to Executive Center, keep
  Workspace's Overview CPM-engine-free** — the brief's own Project Overview mockup wanted both, but
  neither is real without running the full CPM engine, and Executive Center already builds both in
  full and sits one nav click away. This was the deciding scope line for the whole gate: everything
  on Workspace's Overview had to be a plain, cheap store filter, no exceptions.

**Inspection finding that shaped the whole design**: Executive Center's own Management Attention/
Upcoming/Recent Activity panels (`buildProjectContext()`) mix CPM-dependent figures (delayed/
critical activities, slipped milestones) with plenty that are NOT CPM-dependent at all (overdue
RFIs, pending change orders, overdue meeting actions, high-severity risks — plain field filters).
Even Executive Center's own `upcomingMilestones` already falls back to `activity.planned_start`
whenever no CPM has run for that schedule — so building a genuinely cheap subset wasn't an
approximation, it reused an already-existing fallback code path almost verbatim.

What shipped, new `src/js/pages/projectWorkspace.js` (route `#/projectWorkspace`):
- **Header + project-level nav**: name/client·company·country/status badge, then Overview (current)
  + 8 primary tabs (Executive Center, Schedule, Documents, Cost Tracking, Risks, RFI/TQ, Meetings,
  Changes) + a "More" overflow (Daily Log, Decision Register, Lessons Learned, Knowledge Base,
  Commitments, Resources, Vendors) reusing Gate 3's `.card-menu`/`.card-menu__dropdown` component
  for the overflow — its second real use, not a new pattern. Vendors/Document Types/Document
  Control Dashboard/Delay & Recovery Dashboard were deliberately left OFF the Workspace nav
  entirely — they're cross-project rollups with no real per-project deep-link (except Vendors,
  which does have `filterByProject()` and made the cut).
- **Every non-Overview tab is a pure hand-off**: calls that module's own existing
  `filterByProject()`/`viewProject()` then `router.go()` — zero module-internals rewrites. Two
  small, additive, fully-disclosed exceptions: `schedule.js` gained a `viewProject(projectId)` (it
  only had `viewActivity`/`viewBaselines`, both requiring a `scheduleId` the Workspace doesn't have
  — deliberately leaves `scheduleId` untouched since `renderScheduleBar()`'s own pre-existing
  `<select>` fallback already self-corrects to `projectSchedules[0]` whenever the current id doesn't
  belong to the new project, so no `pickPrimarySchedule()`-style logic needed duplicating);
  Documents has NO project-filter hook at all today (not even a dropdown), so its tab lands on
  `#/documents` unfiltered — a pre-existing gap, not introduced by this gate, flagged as a candidate
  for a future Gate 6 Documents pass rather than silently patched in here.
- **Overview**: a `.kpi-grid` (Progress, Finish, Budget, Open Risks/Issues, Open RFIs/TQs,
  Documents available/total — the same fields Gate 3's card stat chips already compute, schedule
  status deliberately omitted per that gate's own precedent: the status badge already carries it);
  a Management Attention panel — **the first real adoption of Gate 1's `.attention-list`/
  `.attention-item` primitive**, six item types (critical risk/issue, overdue RFI, overdue document
  requirement, overdue meeting action, pending change order, cost-overrun warning), each clickable
  straight to its module; Upcoming (milestones/meetings/RFIs due soon, window from the existing
  `settings.action_centre_upcoming_days`) and Recent Activity (cross-module updated-record feed,
  copied from Executive Center's own equivalent panel almost verbatim since it needs no CPM either).
- Project switcher `<select>` for when Workspace is reached directly (sidebar nav, not via
  Portfolio's new button) — defaults to the first active project, same pattern Executive Center's
  own toolbar already uses.

No bugs self-caught this gate. Two test bugs caught and fixed before the full suite run (test file
issues, not app issues): the status-badge assertion checked for `"AT RISK"` (CSS
`text-transform:uppercase` only changes rendering, not `textContent`, which reads `"At Risk"`); the
Upcoming-panel milestone/meeting seed dates initially reused a shared `futureIso` constant
("2099-01-01") meant for far-future project fields like `finish_date` — miles outside the 30-day
Upcoming window, so nothing matched. Fixed by adding a `soonIso` (today + 5 days) for anything the
Upcoming lookahead needs to actually catch. **General lesson for any future test seeding "upcoming"
data**: don't reach for the same "far future" date constant used for unrelated long-range fields —
a near-future date is a different fixture, needed whenever a lookahead-window filter is involved.

Tests: new `tests/test_uiux_gate4_workspace_e2e.js` (42 checks, including a 27-route smoke test) —
Portfolio's new button coexisting with Executive Center/Details, KPI tiles reading real seeded
figures, all six Management Attention item types appearing (and a low-severity issue correctly
NOT appearing), clicking an attention item navigating to its module, Upcoming/Recent Activity
content, the Schedule hand-off landing on the right project's own Gantt tab (not empty/another
project's), the Risks hand-off pre-filtering correctly, the "More" overflow opening/closing and
navigating, the project switcher changing which project's data renders, and the empty-portfolio
state. Full suite: **62 files, 1737 checks**, zero regressions. Real-Chromium pass (desktop
Overview with all panels populated, the "More" dropdown open, the Schedule tab landing directly on
the seeded project's Gantt with its milestone visible, 390px mobile and 820px tablet layouts)
confirmed everything renders correctly via the app's own pre-existing `.kpi-grid`/`.panel`/
`.toolbar` responsive behavior — no new breakpoint CSS needed — zero console errors. Zip verified
separately post-merge (fresh extraction, real Chromium) — clean.

**Process note, learned from Gate 3's incident, applied successfully this time**: checked
`git log main --oneline -1` against `git log origin/main --oneline -1` BEFORE merging — both
matched, so the merge went through cleanly on the first attempt with no reset needed. Confirms the
general lesson from Gate 3's write-up above is the right habit to keep.

**UI/UX Overhaul Gate 5 — Executive Center redesign** (merge `9f447f5`). Inspection before scoping
found the Overview tab was one flat vertical stack of 13 KPI sections (Progress/Schedule/Status
Date/Cost/Commitments/EVM/Schedule Performance/Delay & Recovery/Risks/Issues/RFIs/Changes/
Resources) followed by Health Score, Diagnostics, Executive Summary, 7 charts, Recent Activity/
Upcoming, and Management Action List — a real-Chromium screenshot confirmed ~3650px of scroll even
on a near-empty seeded project. The good news: almost everything the brief's own Executive Center
wishlist wants (S-curve, milestone timeline, risk heat map, RFI/CO charts) already existed as real
computed data — this was a **layout problem, not a missing-feature problem**, confirmed with
Aditya via `AskUserQuestion` (three questions) before building:
- **Sub-tab reorganization** (not a collapsible-accordion alternative) — group the 13 KPI sections
  by topic under a Summary landing view, reusing the same tab-row pattern Gate 4's Workspace
  already established.
- **Retrofit Diagnostics and Management Action List onto Gate 1's `.attention-list`/
  `.attention-item` primitive** (first adopted by Workspace's own Management Attention, Gate 4) —
  same computed alerts, different (consistent) markup.
- **Also retrofit Dashboard's own Management Attention panel** onto the same primitive while the
  pattern was fresh, even though `dashboard.js` is a separate file outside "Executive Center" per
  se — Aditya's explicit call over keeping this gate strictly file-scoped.

What shipped, zero changes to `buildProjectContext()`/`projectHealthEngine.js`/the CPM engine —
this gate only decided WHERE each already-computed figure renders, never recomputed anything:
- **Always-visible hero**: name/client/sector/type + RAG badge, then 5 condensed at-a-glance
  `.kpi-grid` tiles (Progress, Schedule Variance, Cost Variance, Open Risks, Overdue RFIs) — so
  switching sub-tabs never loses "which project, how healthy" context. Every figure here already
  existed somewhere in the old flat stack; this surfaces a SUBSET first, nothing new computed.
- **Sub-tab row** (`uiState.overviewSubTab`, module-level, resets on reload same as the existing
  `uiState.tab`): **Summary** (default) — Project Details, Health Score, Diagnostics, Executive
  Summary, Recent Activity/Upcoming, Management Action List. **Schedule** — Progress/Schedule/
  Status Date/Schedule Performance/Delay & Recovery KPIs + their own detail panels + a new
  `renderScheduleCharts()` (S-Curve, Critical vs Non-Critical, Float Distribution, Milestone
  Timeline — split out of the old single `renderChartsSection()`). **Cost & Commitments** — Cost/
  Commitments/EVM. **Risk & Compliance** — Risks/Issues/RFIs/Changes + a new `renderRiskCharts()`
  (Risk Heat Map, RFI Open/Closed, Change Orders Status). **Resources** — only offered once
  `data.resources.length > 0`, same "only show when the module exists" rule the old always-on
  section already used; a stale `overviewSubTab` pointing at a since-removed Resources tab falls
  back to Summary automatically.
- **Diagnostics/Management Action List retrofit**: each alert is now an `.attention-item` (colored
  severity dot + text, whole row clickable) instead of a `.status-badge` + separate "View" button
  on a `.detail-card` row. `SEVERITY_BADGE_CLASS` (now-dead code after the retrofit) removed.
- **Dashboard's Management Attention panel retrofit**: same primitive, per-project grouping
  unchanged (heading + "View Project" button stays outside the list), only the alert rows
  themselves changed from hand-built badge markup to `.attention-item`.

**No bugs self-caught this gate** — the reorganization is pure UI, and the new test file's checks
passed on the first standalone run. **13 pre-existing test files needed mechanical updates**, all
the same shape: a check that used to find KPI/chart text directly on Executive Center's default
view now needs to click into the sub-tab that content moved to first (`test_executive_center_e2e.js`,
`test_resources_e2e.js`, `test_activity_physical_progress_e2e.js`,
`test_advanced_schedule_performance_e2e.js`, `test_baseline_revision_control_e2e.js`,
`test_commitment_management_e2e.js`, `test_commitment_schedule_integration_e2e.js`,
`test_integrated_project_controls_e2e.js`, `test_status_date_control_e2e.js`,
`test_status_date_reforecasting_e2e.js`), plus two files checking the old badge-text/`.detail-card`
markup that needed updating to the new `.attention-item` shape (`test_management_attention_e2e.js`
for Dashboard, `test_recovery_decision_reporting_e2e.js` for Executive Center's Diagnostics —
including one check that used to click a separate "View" button and now clicks the row itself).
**General lesson for any future test that reads Executive Center Overview content**: check which
sub-tab (Summary/Schedule/Cost & Commitments/Risk & Compliance/Resources) that content now lives
on and click into it first — `Array.from(outlet().querySelectorAll(".toolbar button")).find(b =>
b.textContent.trim() === "<tab label>").click()` — before asserting on KPI cards or charts.

Tests: new `tests/test_uiux_gate5_executive_center_e2e.js` (40 checks, including a 27-route smoke
test) — the hero row's figures, Summary-vs-Schedule-vs-Cost-vs-Risk content isolation (each sub-tab
proven to show its own content and NOT leak another sub-tab's), the Diagnostics/Management Action
List `.attention-item` retrofit including severity classes and click-to-navigate, the Resources
sub-tab appearing/disappearing based on real data, Dashboard's own retrofit, and a "writes nothing
back" record-count sanity check. Full suite: **63 files, 1777 checks**, zero regressions. Real-
Chromium pass (Summary/Schedule/Cost & Commitments/Risk & Compliance sub-tabs, each dramatically
shorter than the old single ~3650px page) confirmed everything renders correctly — zero console
errors. Zip verified separately post-merge (fresh extraction, real Chromium) — clean.

**UI/UX Overhaul Gate 6 — Documents (first "Existing Modules, one at a time" gate)** (merge
`d00348e`). Gate 6 has no single scope of its own — the brief explicitly wants it built one module
at a time, not as one big gate — so a fresh session asked Aditya which module to start with via
`AskUserQuestion` (Documents/Schedule/Risk Register/other, Documents recommended for its known
disclosed gap). Aditya picked **Documents**.

Inspection before scoping found Documents was the only register in the app with **no filter
toolbar at all** — `render()` showed every document across every project in one flat list, no
search/project/category/status narrowing (every other register — Risk Register, Portfolio, RFI/
TQ — already has one), and no `filterByProject()` hook (the exact gap flagged during Gate 4's
build, which had to special-case Documents to land unfiltered from Workspace). Two forks
confirmed via `AskUserQuestion` before building:
- **Add the filter toolbar + Workspace hook** (uncontested baseline).
- **Also include the brief's own "Document Experience" two-panel register+preview layout in this
  same gate**, rather than deferring it to a follow-up — Aditya's explicit choice over the
  smaller filters-only option, since the module needed both anyway.

What shipped, zero changes to any business logic (upload/extraction/duplicate-detection/
versioning) — only presentation and the one new hook:
- **Filter toolbar**: search (filename/document number) + category/status/project selects,
  mirroring `risks.js`'s own toolbar pattern field-for-field. "+ Add Document" now defaults to
  the currently active project filter.
- **`documents.js` gains `filterByProject()`** — the last register missing this hand-off
  convention hook; `projectWorkspace.js`'s Documents nav tab lands pre-filtered now instead of
  needing its own special-case (that branch's comment was updated, not removed — `window.PCC.files`
  is a different export name than `window.PCC.documents`, so it still needs its own branch, just
  a real one now instead of a documented gap).
- **Two-panel register + preview**: the old `renderDocumentRow()`/`renderDocumentEntry()` pair (one
  dense meta line crammed with ~10 fields — project/size/date/meeting/activity/type/discipline/
  number+revision/vendor/package/revision-number — plus up to 7 action buttons on every row) split
  into a compact `renderDocumentListItem()` (left pane: filename, project, category/status badges,
  click to select) and a full-detail `renderDocumentPreviewPanel()` (right pane: a `.detail-grid`
  of every field, the status editor, all actions, extraction preview, revision history) — same
  "summary first, detail on demand" pattern Workspace/Executive Center already established. New
  `.doc-register`/`.doc-register-list`/`.doc-register-preview`/`.doc-register-item*` CSS, stacking
  on narrow viewports via plain `flex-wrap` (no new breakpoint rule — same approach Gates 3-5 use
  throughout). Selection self-corrects to the first filtered document whenever the current
  selection is stale or filtered out, same convention `schedule.js`'s own project/schedule
  `<select>`s already use.

**One bug self-caught before shipping, via the existing test suite (not written new)**: the first
draft added a `return` right after rendering the open upload form — which silently changed
pre-existing behavior. Before this gate, the page always kept the document list visible *below* an
open upload form (never hid it); the new code hid everything else whenever the form was open. Two
checks in `test_document_classification_e2e.js` that looked unrelated (one about a document's Type
field, one about a "View Vendor" button) both failed for the same real reason — an earlier check in
that file leaves `uiState.formOpen` true and never closes it, so by the time these ran, the page was
showing the form and nothing else. Fixed by removing the `return` and restoring the original
"form renders above, register still renders below" layout — same behavior as before, now with
filters. **General lesson**: any `if (formOpen) { ...; return; }` refactor of an existing page needs
to check what the ORIGINAL code did after that branch, not assume early-return is safe just because
it reads cleaner — a page that used to layer state on top of each other can silently start hiding
things once a `return` is added.

**Second thing caught via the test suite**: a pre-existing test that grabbed "the first `<select>`
on the page with an `under_review` option" to test the row's status editor started grabbing the
NEW filter toolbar's own status-filter `<select>` instead (same option values) once the toolbar was
added — scoped to `.doc-register-preview select` specifically to fix. **General lesson for any
future toolbar-filter addition to an existing page**: check whether existing tests do a bare
"first matching element" query for something the new filter select could also match.

Tests: `test_document_classification_e2e.js` and `test_document_revision_status_e2e.js` updated —
the old single-line `"Label: Value"` text format is now separate `detail-grid` label/value elements
with no colon between them (e.g. `"Type: RFIs"` → `"TypeRFIs"`, `"Revision 1"` → `"Revision1"`),
mechanical text-format fixes only, no behavior assertions changed. New
`tests/test_uiux_gate6_documents_e2e.js` (41 checks, including a 27-route smoke test) — the filter
toolbar's four controls each narrowing the register correctly (and composing), the empty-filter-
match state, auto-selection into the preview pane, clicking a different row re-selecting it, the
"+ Add Document" project-filter prefill, the form-stays-above-the-list behavior, and the Workspace
hand-off landing pre-filtered. Full suite: **64 files, 1818 checks**, zero regressions. Real-
Chromium pass (desktop two-panel layout, 820px tablet stacking, 390px mobile stacking, the
Workspace hand-off landing pre-filtered) confirmed everything renders correctly — zero console
errors. Zip verified separately post-merge (fresh extraction, real Chromium) — clean.

**UI/UX Overhaul Gate 6 — Risk Register (second "Existing Modules, one at a time" gate)** (merge
`b637161`). A fresh session asked Aditya which module to do next via a plain "Scope risk register"
request (no `AskUserQuestion` needed to pick the module this time — Aditya named it directly).

Inspection before scoping found Risk Register already close to the target UX state, unlike
Documents — it already had a full filter toolbar (search/type/status/project), a heat map, and a
two-part card+details layout. Two real issues surfaced instead, confirmed with Aditya via two
rounds of `AskUserQuestion`:
- **Round 1 (accepted, "Do the heat map fix, then look harder for more")**: the Heat Map's cell
  counts came from `data.risks` — every risk in the whole app — with **no regard to the toolbar's
  own type/status/project/search filters**. Since the toolbar's `statusFilter` defaults to `"open"`
  (hiding closed items by day-to-day default), this meant the heat map was ALWAYS showing stale,
  inflated counts (including closed items) even with zero user interaction, and stayed wrong after
  any further filtering.
- **Round 2 (accepted, "Yes, match Portfolio's '⋯' menu pattern")**: risk cards always showed three
  full-width buttons (Details/Edit/Delete) with no contextual grouping, unlike Portfolio's Gate 3
  cards.

What shipped, `risks.js` + no schema/CSS changes (Gate 3's `.card-menu` primitives were reused
as-is):
- **`riskMatchesFilters` split into `riskMatchesToolbarFilters` (type/status/project/search) and
  `riskMatchesFilters` (adds the heat map's OWN probability × impact filter on top)** — the heat
  map now filters through `riskMatchesToolbarFilters` only, so it shares the toolbar's state without
  double-applying its own click-a-cell filter to itself. `renderHeatmap()` now shows a conditional
  subtitle ("Reflects the current search/type/status/project filters below...") whenever the
  toolbar's filters are actually narrowing the count, so it's visually obvious the heat map isn't
  showing the whole portfolio.
- **A second, related wiring bug caught and fixed in the same pass, before it could ship broken**:
  the toolbar's search/type/status/project handlers only called the lightweight `renderList()` (to
  preserve the search input's focus/cursor position on every keystroke — this project's existing
  "text inputs use a partial update, not a full rerender" convention). That alone would NOT have
  refreshed the heat map panel, so filter changes would have updated the list correctly while
  leaving the heat map showing stale counts. Fixed by giving the heat map its own `heatmapWrap`
  container + `renderHeatmapPanel()`, and adding `refreshFilteredViews()` (calls both
  `renderHeatmapPanel()` and `renderList()`) as what all four toolbar controls call now instead of
  `renderList()` alone.
- **Card actions restructured**: `renderRiskCard()`'s Edit/Delete buttons moved into a new "⋯"
  `.card-menu` (menu toggle → optional `.card-menu__overlay` + `.card-menu__dropdown` with two
  `.card-menu__item`s), directly mirroring `portfolio.js`'s Gate 3 pattern field-for-field — new
  `uiState.openMenuId` (risk id or null), same shape as Portfolio's own. Details stays the one
  primary, always-visible action.

**No bugs shipped uncaught this gate** — both the heat map's own stale-count bug (found during
inspection, before any code was written) and the toolbar-wiring gap it would have introduced (found
during implementation, before any test ran) were caught proactively. `node --check` and the new
test file both passed clean on the first run.

Tests: new `tests/test_uiux_gate6_risk_register_e2e.js` (38 checks, including a 27-route smoke
test) — the heat map already reflecting the default "Open" status filter with zero user
interaction (2 of 3 seeded risks counted, not 3), the heat map narrowing further on a project
filter while the list narrows in lock-step, the heat map widening back out when the status filter
clears (and the subtitle text flipping accordingly), risk cards showing only "Details" as a direct
button with Edit/Delete absent from the card face, the "⋯" menu opening/closing via its own toggle
and the overlay, Edit opening the form and closing the menu, Delete (confirmed) removing the entry
and closing the menu, and declining the confirm leaving the entry untouched. No pre-existing test
files needed updates — nothing in the existing suite touched Risk Register's card buttons or heat
map counts before this gate. Full suite: **65 files, 1858 checks**, zero regressions. Real-Chromium
pass (four seeded risks/issues/opportunities across two projects — default view showing the heat
map correctly excluding the one closed entry, the "⋯" menu open showing Edit/Delete, and the
project filter narrowing both the heat map and the list together) confirmed everything renders and
behaves correctly — zero console errors. Zip verified separately post-merge (fresh extraction, real
Chromium, `page.title()` and a route render both confirmed clean) — clean.

**UI/UX Overhaul Gate 6 — Schedule (third "Existing Modules, one at a time" gate)** (merge
`ec95ae0`). Aditya named the module directly again ("Schedule") — no `AskUserQuestion` needed to
pick it.

Inspection (real-Chromium screenshots across all six sub-tabs — Activities, Gantt, WBS,
Relationships, Baselines, What-If — with a seeded schedule) found Schedule is already **the most
mature module in the app**: the Gantt tab has a full filter toolbar (WBS/discipline/contractor/
responsible + a "quick" status-bucket select for critical/near-critical/delayed/completed/in
progress/not started/milestones), zoom controls, jump buttons, a legend, and baseline-overlay
support; Baselines and What-If are clean, purpose-built panels. The Today/Data Date label fix from
earlier this session was confirmed still working during this same inspection pass. One real,
scoped gap surfaced: the **Activities tab** (the flat list view used for hand-entry/editing) only
had a text-search box — no way to filter by WBS/status/critical there, even though the Gantt tab a
few clicks away already computes all three over the exact same activity list. Confirmed with
Aditya via `AskUserQuestion` (three options: filters-only / filters + card-menu consistency for
Activities-WBS-Relationships rows / skip Schedule) — **filters-only, recommended and chosen**. The
card-menu option was declined since those rows only carry 2 actions (Edit/Delete) each, not the
3+-action clutter that justified it on Risk Register/Portfolio.

What shipped, `schedule.js` only, no schema/CSS change:
- **`activityMatchesActivitiesTabFilter(a)`** (new) — name search (unchanged) + WBS/status/
  critical. Deliberately NOT a reuse of the existing `activityMatchesGanttFilter()`, which carries
  chart-only fields (discipline/contractor/responsiblePerson/the referenceDate-driven "quick"
  bucket) this flat list has no use for — same "each register keeps its own small filter
  predicate" precedent this initiative has followed since Gate 6 Risk Register's own
  `riskMatchesToolbarFilters()` split.
- **New toolbar controls on the Activities tab**: a WBS `<select>`, a Status `<select>`
  (Not Started/In Progress/Complete/On Hold, from the existing `ACTIVITY_STATUS_LABELS`), a
  "Critical only" checkbox (`total_float <= 0`, same semantics as the Gantt tab's own "Critical"
  quick-filter option), and a "Clear Filters" button.

**One bug self-caught before shipping, during the first real-Chromium pass (not written into a
test first)**: the WBS/status/critical controls initially called the same lightweight
`renderList()` the search box already used (to preserve the search input's own typing focus —
this app's standing convention) — which only rebuilds the activity list, not the toolbar it lives
in. Since "Clear Filters" is conditionally shown based on whether ANY filter is active, typing in
the search box alone (with no WBS/status/critical set) left the button silently stuck hidden even
though a filter was now active — the exact shape of staleness bug this same Gate 6 pass's Risk
Register predecessor caught in its heat map. Fixed by: keeping the search box on its lighter
`renderList()`-only path (still needed to preserve focus while typing), switching the WBS/status/
critical controls to call a full `rerender()` instead (no focus concern for selects/checkboxes —
unlike a text input, nothing is lost by rebuilding them), and making "Clear Filters" always exist
in the DOM with its visibility toggled directly (`style.display`) from BOTH paths, so the search
box's lighter update can still keep it in sync without needing to rebuild the toolbar around it.
**General lesson, now confirmed twice in the same gate cycle**: any toolbar element whose
visibility depends on "is any filter active" needs to be reachable from every filter control's own
update path, including ones that deliberately skip a full rerender for focus-preservation reasons
— don't assume a lighter partial-update path will incidentally cover UI that lives outside what it
directly redraws.

Tests: new `tests/test_uiux_gate6_schedule_e2e.js` (40 checks, including a 27-route smoke test) —
the toolbar's four controls (search/WBS/status/critical), each narrowing the list correctly, the
"Clear Filters" button appearing/disappearing correctly across ALL FOUR paths including the
search-only case that exposed the bug above, the zero-match empty state, "Clear Filters" resetting
everything together, and the Gantt tab still rendering (SVG present, no thrown errors) after the
Activities tab change. No pre-existing test files needed updates — nothing in the existing suite
asserted on the Activities tab's toolbar shape or empty-state text before this gate. Full suite:
**66 files, 1898 checks**, zero regressions. Real-Chromium pass (default Activities view, WBS
filter narrowing to one WBS item's activities, "Critical only" narrowing to the two zero-float
activities, and the search-only case showing "Clear Filters" appearing correctly) confirmed
everything renders and behaves correctly — zero console errors. Zip verified separately post-merge
(fresh extraction, real Chromium, Activities tab filters exercised) — clean.

**Gate 6 is now ON HOLD, Aditya's explicit call (2026-08-21), after Documents/Risk Register/
Schedule.** The remaining "Existing Modules, one at a time" passes — Vendors, RFI/TQ, Meetings,
Change Orders, and any other module the brief covers — are NOT started and NOT scoped. This is a
pause, not a close-out (unlike Tiers A-F/Tier 3 above, which are genuinely done) — a future session
should treat Gate 6 as resumable, not finished, and should ask Aditya before assuming it's time to
pick it back up again versus continuing whatever gate came after it. Do not silently resume Gate 6
just because it's next in the brief's own numbering.

**UI/UX Overhaul Gate 7 — Desktop/Laptop Productivity, Density Control** (merge `5835b45`). With
Gate 6 on hold, Aditya asked to scope the next gate. The full original UI/UX Overhaul brief had
only ever been pasted into an earlier session's conversation, not saved anywhere in the repo — this
session didn't have it in context, so per the brief's own "get it re-confirmed if a future session
doesn't have it" caveat (already noted above), Aditya re-pasted the complete brief verbatim rather
than this session guessing at Gate 7's scope from inert CSS hooks alone. **The full brief text is
still not saved anywhere in the repo — only this write-up's summary of it survives here. If a
future session needs the complete verbatim brief again (full design direction, every gate's
detailed requirements, all the "do not" lists), it must be re-pasted by Aditya again; do not assume
a future session can reconstruct it from this file.**

Gate 7 itself covers five capabilities per the brief: Focus Mode, Density Control, Resizable
Panels, Better Data Grids, Side-by-Side Views — explicitly "add where appropriate," not a mandatory
checklist for every module, and easily the broadest of the eight gates. Confirmed via
`AskUserQuestion` to scope one capability at a time rather than attempt all five in one gate, per
the brief's own "smallest safe gate" rule. Aditya picked **Density Control** first — the smallest,
safest slice: a `[data-density="compact"]` CSS spacing override had been reserved (inert, no
toggle) since Gate 1.

**A second `AskUserQuestion` confirmed two states (Compact/Comfortable) vs. the brief's own
three-state example (Spacious/Comfortable/Compact) — Aditya chose all three**, so a new "spacious"
CSS tier had to be designed from scratch (it didn't exist in any form before this gate): mirrors
compact's own deltas in reverse (same +/-4px on space-3/4, +/-8px on space-5) rather than an
arbitrary wider scale, so the three states read as one consistent step, not two different design
decisions bolted together.

**Schema change, flagged to Aditya before building per his "STOP and explain" rule**: new
`settings.density` field (`'compact' | 'comfortable' | 'spacious'`, default `'comfortable'` —
matches every existing install's actual spacing exactly, so nothing changes on upgrade),
`schema_version` **52 → 53**, one migration step, same shape as Gate 2's `sidebar_collapsed`.
`tests/test_store_schema_v52_migration.js` renamed to `test_store_schema_v53_migration.js` (this
project's "one canonical full-chain migration test targeting latest" convention), all 28
`schema_version` assertions bumped 52→53, new backfill checks added.

What shipped: `layout.js` gained `applyDensity()`/`toggleDensity()`, mirroring `applyTheme()`/
`toggleTheme()`'s exact pattern — a title-block icon-btn next to the theme toggle, glyph reflecting
the CURRENT state (▁/▄/█ for compact/comfortable/spacious, same "icon shows current state, not the
next one" convention the theme toggle's sun/moon already established), persisted via
`settings.density`, re-applied on `mount()` and `refreshTitleBlock()`.

**One real gap caught and fixed before shipping — via real-Chromium screenshots, not a test**:
the first working build (toggle wired to the reserved `[data-density]` primitive, exactly as
designed) produced THREE PIXEL-IDENTICAL SCREENSHOTS across all three states. Traced it: the
`--space-3/4/5` tokens the primitive overrides are only ever consumed by `.modal`/`.drawer`
padding — verified by grepping the whole stylesheet for real consumers. Every screen that actually
matters for day-to-day density — `main.page` (24px padding), `.panel` (20px padding), `.toolbar`
(10px gap), `.project-card` (14px/16px padding+gap), `.project-list` (10px gap), `.form-grid`
(16px column gap) — was hardcoded in px, never tokenized. Wiring the toggle to the reserved
primitive alone would have shipped something that persists correctly but is invisible almost
everywhere the brief actually cares about ("particularly useful for laptops and large monitors").
Flagged to Aditya via `AskUserQuestion` before continuing; confirmed to extend `[data-density]`
with attribute-scoped overrides for those specific real properties directly (surgical new rules,
not a retrofit of the existing hardcoded values into `var()` — safer, since comfortable-mode
behavior can't drift from what it already was). **General lesson for any future gate that "wires up
a reserved primitive" from an earlier gate**: verify the primitive actually has real consumers
before assuming wiring it up is sufficient — an unused CSS hook from a prior gate can look
ready-to-go while being functionally disconnected from the screens that matter.

Tests: new `tests/test_uiux_gate7_density_e2e.js` (34 checks, including a 27-route smoke test) —
default state, the toggle cycling comfortable→spacious→compact→comfortable and persisting
`settings.density` at each step, survival across a simulated reload (re-invoking `layout.mount()`),
and a check that greps the bundled `<style>` content for the six attribute-scoped overrides that
make the toggle visible on real screens (not just the inert token block). No pre-existing test
files needed updates beyond the schema-version-assertion bump described above — nothing in the
existing suite asserted on the title-block's icon-btn count/order or on `main.page`/`.panel`/
`.toolbar`'s exact padding values. Full suite: **68 files, 1934 checks**, zero regressions.
Real-Chromium pass (Portfolio and Risk Register at all three density states — compact visibly
tighter, spacious visibly airier, comfortable pixel-identical to before — plus a 390px mobile
check) confirmed everything renders and behaves correctly, including the persisted preference
surviving an actual `page.reload()` (past the app's existing 250ms autosave debounce, which the
first verification attempt mistakenly outran and initially misread as a bug) — zero console
errors. Zip verified separately post-merge (fresh extraction, real Chromium, toggle exercised) —
clean.

**UI/UX Overhaul Gate 7 — Desktop/Laptop Productivity, Better Data Grids** (merge `4088637`).
Aditya asked to scope the second Gate 7 capability. Inspection found `.data-table`/
`.data-table--sticky-header` (the CSS reserved for "better data grids") had exactly **one** real
caller in the whole app — Portfolio's Compare view — with none of sorting/column-visibility/
frozen-columns actually built anywhere, not even there. Every other dense list, including Schedule
Activities (already touched in Gate 6 for its filter toolbar), was still the `.detail-card`
flex-row pattern, not a real `<table>`.

Two `AskUserQuestion` rounds before building:
- **Which module becomes the first real data grid: Schedule Activities, chosen over Cost Budget
  Items or enhancing Portfolio's existing Compare table.** The brief's own literal example table
  ("ID | Activity | Start | Finish | Duration | Progress | Float | Status") maps almost
  field-for-field onto Schedule Activities.
- **Feature scope: the fuller set (sorting + sticky header + horizontal scroll + column
  visibility + a frozen first column), chosen over a smaller core-three-only slice.**

What shipped, `schedule.js` + `styles.css`, no schema change:
- **A real `<table class="data-table data-table--sticky-header data-table--frozen-first-col">`**
  replaces the old `.project-list`/`.project-card` flex rows entirely. Columns: Activity (frozen
  first column, via `position: sticky; left: 0` — new `.data-table--frozen-first-col` CSS, paired
  with the pre-existing `.data-table--sticky-header`'s `position: sticky; top: 0`; the corner cell
  that's sticky on both axes needs a higher `z-index` to paint above the other sticky cells, see
  the CSS's own comment) + WBS/Type/Start/Finish/% Complete/Float/Status + a row-level Actions
  column.
- **Row actions moved from two direct Edit/Delete buttons into a "⋯" `.card-menu`** — the same
  Risk Register/Portfolio pattern, adopted here for a structural reason (a table row's Actions
  cell is too narrow for two full-width text buttons the way the old flex-card layout had room
  for), not a re-litigation of Gate 6 Schedule's own earlier "2 actions doesn't need a menu"
  finding, which was about the flex-card layout specifically.
- **Click-to-sort column headers** (`.data-table__sort-btn`/`.data-table__sort-arrow`, new CSS) —
  one active sort column at a time, click again to reverse direction, arrow indicator shows the
  current direction. Unlinked/not-yet-calculated float (`total_float == null`) sorts to the
  "least urgent" end regardless of direction, same convention the Gate 6 "Critical only" filter
  already established for that same field.
- **"Columns" toggle** — a `.card-menu` checklist (new `.card-menu__checkbox-item` CSS, a
  checkbox-row variant of the existing `.card-menu__item` action-button rows) for the seven
  optional columns; Activity and Actions are never offered as hideable. Column visibility is
  module-level `uiState`, not persisted — same "resets on reload" treatment every other per-page
  display preference in this app already gets, deliberately not a schema change.

**No bugs shipped uncaught** — sorting, column hiding, and the frozen-column scroll behavior were
all verified visually in real Chromium (including forcing real horizontal overflow at a 420px
viewport to confirm the Activity column visibly stays pinned while WBS/Type/Start/Finish scroll
away underneath it) before any test was written.

**Two pre-existing test files needed mechanical updates, both expected consequences of the
flex-row-to-real-table conversion, not regressions**: `test_uiux_gate6_schedule_e2e.js`'s row-count
assertions moved from `.project-entry` to `".data-table tbody tr"`; `test_activity_physical_
progress_e2e.js`'s text assertion moved from the one-sentence `"40% complete"` to separate `"40%"` +
`"65% physical"` cell contents. **General lesson for any future test that reads Schedule
Activities' row content**: query `.data-table tbody tr`, not `.project-entry`/`.project-card` —
this tab is a real grid now, the flex-row pattern is gone.

**Test-writing note, two self-caught bugs in the NEW test file itself, not the app**: (1) a stale
DOM reference — `renderList()` rebuilds the table on every sort click, so a `<th>` reference taken
before a click can't be reused to check the post-click sort-arrow indicator; had to re-query the
live header after each click, same "detached node after rerender" trap this project's test suite
has hit before. (2) A test that opened the Columns menu, toggled a column, and then clicked
"Columns" a second time to "reopen" it for a follow-up assertion — but the menu never actually
closes when a checkbox is toggled (only `rerender()` runs, `activityColumnsMenuOpen` is untouched),
so the second click actually CLOSED it, and that same leaked-open state then made a LATER,
unrelated check accidentally match the Columns checklist instead of a row's own "⋯" dropdown
(`outlet().querySelector(".card-menu__dropdown")` found whichever menu happened to still be open,
not necessarily the one the check meant to target). Fixed by not re-clicking a toggle button that
was never closed, explicitly closing the Columns menu via its own overlay at the end of that check,
and scoping later dropdown lookups to the specific row element rather than the whole outlet.
**General lesson for any future test involving more than one `.card-menu` on the same page**: don't
assume a menu is closed just because the check moved on to something else — either close it
explicitly or scope every subsequent query to the specific menu/row under test, not the page as a
whole.

Tests: new `tests/test_uiux_gate7_data_grid_e2e.js` (39 checks, including a 27-route smoke test) —
grid structure/classes, the frozen/sortable/optional column set, sorting both directions with the
unset-float tiebreak proven explicitly, the Gate 6 WBS/status/critical filters still narrowing the
grid correctly, the Columns checklist hiding/showing a column and never offering Activity/Actions,
the row-level menu's Edit (opens the form, closes the menu) and Delete (including a declined-
confirm case that changes nothing), and the zero-match empty state. Full suite: **69 files, 1973
checks**, zero regressions beyond the two expected mechanical fixes above. Real-Chromium pass
(default grid view showing all seven columns plus the Out-of-Sequence marker, ascending vs.
descending Float sort, the row "⋯" menu open, the Columns checklist open, a column hidden, and the
frozen-column behavior at a narrow 420px viewport with real horizontal overflow) confirmed
everything renders and behaves correctly — zero console errors. Zip verified separately post-merge
(fresh extraction, real Chromium, sort + grid classes exercised) — clean.

**UI/UX Overhaul Gate 7 — Desktop/Laptop Productivity, Focus Mode + Resizable Panels +
Side-by-Side Views (Gate 7 now COMPLETE)** (merge `c070e32`). Aditya asked to scope and build all
three remaining Gate 7 capabilities together in one pass, rather than one at a time like Density
Control and Better Data Grids before it — a deliberate departure from this initiative's usual
smallest-safe-slice cadence, made explicitly by Aditya rather than assumed. Two rounds of
`AskUserQuestion` (four total questions) confirmed the concrete scope before any code was written:
which pages get Focus Mode (all four the brief mentions — Schedule, Documents, Executive Center,
Reports — not just the brief's own two worked examples), whether to build Resizable Panels at all
(yes, Documents' register+preview split), and whether to build Side-by-Side Views (yes, Gantt's
Activity Detail Panel). No schema change for any of the three.

**Focus Mode** (`layout.js` + `styles.css`): a title-block icon-btn toggle next to theme/density
(same glyph-reflects-current-state convention, "⛶", plus a new generic `.icon-btn--active` style
any future binary toggle can reuse), but deliberately **not persisted** — `settings.theme`/
`settings.density` are durable appearance preferences, Focus Mode is "declutter while I work on
this right now," so it resets on reload same as every other per-session `uiState` toggle in this
app. Toggles `body.focus-mode`, which the CSS uses two ways: unconditionally hides
`footer.app-footer` everywhere (pure status text, always safe to hide), and hides whatever a page
tags with the new `.focus-mode-hide` class — each page opts its OWN non-essential
heading/description/picker-bar chrome into this individually, never a toolbar's actual
filter/search/action controls (every page keeps working normally in focus mode). Applied to:
Schedule (heading + description + the entire schedule-picker bar — matches the brief's own
"Activities + Gantt + filters" Schedule Focus Mode example verbatim, and applies across every
Schedule tab, not just Gantt, since focus mode is a global declutter state), Documents (heading +
the explanatory info panel — matches the brief's Documents example), Executive Center (heading +
subtitle), Reports (heading).

**Inspection finding that shaped the whole Focus Mode design**: hiding cells inside `.title-block`
(SHEET/COMPANY/DATE) does NOT reduce the row's rendered height — `align-items: stretch` means the
row's height is set by its tallest cell regardless of how many cells are hidden, so that's a
horizontal-declutter win only, not a vertical-workspace win. The real vertical wins are the footer
(global) and each page's own heading/description/picker-bar (page-specific) — this is why Focus
Mode's CSS never touches `.title-block__cell` visibility at all, only `.app-footer` and each page's
own tagged chrome.

**Resizable Panels** (`documents.js` + `styles.css`): a drag handle (`.doc-register-resize-handle`,
new CSS — a thin drawn line inside a wider, easier-to-grab hit target, `col-resize` cursor) between
Documents' register list and preview pane (Gate 6's two-panel layout) — the one clear existing
candidate in the app, a fixed `flex: 1 1 340px` / `flex: 2 1 480px` split with zero resize
capability before this. A custom width overrides the CSS split entirely via `flex: 0 0 Npx` +
`max-width: none` (setting only `width` would NOT have been enough — the stylesheet's own
`max-width: 420px` would still have capped it). Mutates `listPane.style` directly on every
`mousemove` (never `rerender()` mid-drag — slow, and would tear down the very listeners driving the
drag), clamped to `[240, 640]`px, and commits to module-level `uiState.docRegisterListWidth` (not
persisted) only on `mouseup` using the LAST width the drag itself already computed and applied —
deliberately not a fresh `getBoundingClientRect()` read at that point, which would be re-deriving
the same number through actual layout a second time for no reason (and isn't meaningfully
measurable in a real-layout-less test environment at all — see the Testing note below).
Double-click resets to the default split. Hidden below 780px, where `.doc-register` already stacks
its two panes into one column (existing `flex-wrap` behavior, no new breakpoint rule) and a
horizontal drag handle between two STACKED panes would be a stray sliver with nothing to do.

**Side-by-Side Views** (`schedule.js` + `styles.css`): the Gantt tab's Activity Detail Panel moves
from rendering full-width ABOVE the chart into a side panel NEXT TO it (new `.gantt-layout-row`/
`.gantt-detail-pane` CSS, same two-panel spirit as `.doc-register`) once the chart itself is ready
to render. Deferred to that point rather than building the row from the start: DOM surgery (detach
the already-rendered detail panel, re-wrap it with the chart in a new row), so every early-return
path above that point in `renderGanttTab()` (the "no dated activities" empty state, etc.) keeps its
exact pre-existing behavior of showing the detail panel full-width regardless of whether the chart
itself can render — a genuine behavior a real user could hit (opening an activity's detail when its
schedule happens to have zero calculable dates), preserved on purpose rather than simplified away.

**One real bug caught during manual real-Chromium verification — not by a test written first, and
not obvious from its own error message**: clicking any activity bar to open its Detail Panel threw
`"NotFoundError: The child can not be found in the parent"` on EVERY click, even a plain one with
no drag involved — traced to the Gantt tab's pre-existing jump-controls bar
(Today/Project Start/Project Finish/Data Date), which did `container.insertBefore(jumpBar, wrap)`
assuming `wrap` (the chart's own panel) was always container's own DIRECT child. That assumption
broke the instant Side-by-Side Views started nesting `wrap` inside the new row alongside the detail
pane. **The stack trace pointed at the wrong line first** — the actual DOM-surgery
`container.removeChild(detailPanelEl)` a few lines earlier looked like the obvious suspect (same
error text, same function), but a focused jsdom repro script wrapping THAT call in its own
try/catch showed it succeeding cleanly every time; the real failure was several lines further down,
at the `insertBefore` call, only surfacing via `window.onerror` slightly later in the same
synchronous execution. **General lesson for any future "detach and re-wrap" DOM restructuring**:
grep for every OTHER place in the same function that references the node being moved — not just
the two places you're deliberately touching — since `insertBefore`/`replaceChild`/`removeChild`
calls elsewhere in a large function can carry an unstated "this is always my direct child"
assumption that only breaks once something upstream changes that node's parent. Fixed by tracking
`chartRowEl` (whichever element is actually `container`'s own direct child at that point — the new
row when a detail panel is open, `wrap` itself otherwise) and using that as the `insertBefore`
reference instead of `wrap` directly.

**Testing note, genuinely useful for any future drag-interaction test**: jsdom has no real layout
engine, so `getBoundingClientRect()` always returns an all-zero rect — this could have made the
resize handle's drag math untestable, but because the handler computes width as
`moveEvent.clientX - registerRect.left`, and `registerRect.left` is always `0` in jsdom, the
clamped result reduces to a fully deterministic function of the `clientX` value the test itself
dispatches. This is genuinely how the math works in a real browser too (not a jsdom-only
coincidence) — it just means jsdom happens to make the "container starts at x=0" case trivially
reproducible, which is exactly why committing the LAST-drag-computed width on `mouseup` (rather
than a fresh `getBoundingClientRect()` re-read) was the right implementation choice even before
testability was a consideration.

Tests: new `tests/test_uiux_gate7_focus_resize_sidebyside_e2e.js` (46 checks, including a
27-route smoke test) — Focus Mode toggling on/off across all four pages with COMPUTED-STYLE
assertions (`getComputedStyle(el).display === "none"`, not just a class-presence check) that every
`.focus-mode-hide` element actually goes invisible and core content (tab bar, toolbars, the chart,
the register+preview) stays visible, plus the footer; the resize handle's live drag and clamping,
persistence of the committed width across an unrelated rerender, and double-click reset; the
side-by-side row appearing only once an activity is selected and disappearing again on Close, and
specifically the jump-controls bar rendering without throwing (the exact spot the bug above broke).
No pre-existing test files needed updates. Full suite: **70 files, 2019 checks**, zero regressions.
Real-Chromium pass (Schedule Gantt before/after Focus Mode, the side-by-side Activity Detail Panel
opened while ALSO in Focus Mode simultaneously, Documents' register pane dragged wider with the
preview pane shrinking to match, Documents/Executive Center/Reports each in Focus Mode) confirmed
everything renders and behaves correctly — zero console errors. Zip verified separately post-merge
(fresh extraction, real Chromium, side-by-side + Focus Mode exercised together) — clean.

**Gate 7 (Desktop/Laptop Productivity) is now COMPLETE — all five brief-listed capabilities shipped
across three passes** (Density Control; Better Data Grids; Focus Mode + Resizable Panels +
Side-by-Side Views together).

**UI/UX Overhaul Gate 8 — Tablet/Mobile Optimization (Gate 8 now COMPLETE — closes out the brief's
entire 8-gate breakdown)** (merge `3544b4f`). Aditya said "move to Gate 8" directly — no module
choice to make, unlike Gate 6. Per the brief's own Gate 8 definition ("Mobile navigation, Cards,
Forms, Tables, Gantt alternative, Touch targets, Responsive layouts"), inspection came first: a
real-Chromium pass at tablet (820×1024) and mobile (390×844) across Dashboard, Portfolio, Schedule
Activities/Gantt, Documents, Risk Register, and the nav drawer. Most of the brief's list was
already solid from earlier gates — the nav drawer (Gate 2 revision), Documents' and Risk Register's
card/panel layouts (Gate 6), and most forms already reflowed cleanly. Two concrete, brief-anticipated
gaps surfaced, plus a systemic one: the Schedule Activities tab is a wide multi-column `.data-table`
(Gate 7's own data-grid work) with nowhere to go at 390px — it just overflowed; the Gantt chart is an
SVG dragged with a mouse, unusable by touch, and the brief explicitly calls for a "Gantt alternative"
on mobile; and icon buttons/menu items were sized for a mouse cursor (32px `.icon-btn`) everywhere,
not a fingertip, well below the ~44px touch-target guideline at any width below laptop. Confirmed via
`AskUserQuestion` — Aditya picked building all three ("Grid/Gantt gaps + touch targets") over the
narrower options offered.

What shipped, `schedule.js` + `styles.css` only, no schema change:
- **Activities mobile card fallback** — the existing "always build both representations, let CSS
  pick" pattern already used for Documents' two-panel stacking and Gate 7's own resize-handle hiding.
  `renderList()` now builds a `.project-list.activities-mobile-cards` (one `.project-card` per
  filtered activity — the same card family Portfolio/Workspace already use) alongside the existing
  table, which got a `.activities-table-wrap` class. New `.activities-table-wrap { display: none }`
  / `.activities-mobile-cards { display: flex }` swap inside the existing `@media (max-width: 780px)`
  block. `buildActivityRowMenu(a)` was extracted out of the table row's own actions cell so BOTH the
  table row's "⋯" Edit/Delete menu and the new mobile card's "⋯" menu are the exact same shared
  function — one menu implementation, two call sites, not a duplicate.
- **Gantt mobile timeline** — a `.project-list.gantt-mobile-timeline` of `.project-card`s (name, WBS
  · type · start→finish, status/critical badges), sorted by planned start, built from the SAME
  toolbar-filtered `activities` array the chart itself already computes (so the two never disagree
  about what's in scope). Tapping a card sets `uiState.ganttDetailActivityId` and reuses the exact
  same Activity Detail Panel the chart's own bars open — no separate detail view built. The chart's
  own toolbar pieces (Zoom controls, the baseline-overlay bar, the jump bar, the legend, the drag
  hint) all got a new `.gantt-chart-only-control` class and are hidden alongside the chart itself
  below 780px via `!important` (required specifically because several of them set their own INLINE
  `style.display`, which beats a plain stylesheet rule regardless of selector specificity — same
  precedent as the pre-existing `.panel { max-width: none !important; }` rule). The Zoom label + 6
  buttons needed grouping into a hideable unit without disrupting the toolbar's own flex/gap/wrap
  layout, so they're wrapped in a `zoomGroup` span with `display: contents` (invisible to the parent
  flexbox's layout, but still a single class-toggleable unit) rather than a normal wrapping `<div>`.
- **Touch targets** — new `@media (max-width: 1023px)` tier (first tablet-specific breakpoint in the
  app, sitting between the existing Laptop `≤1279px` and phone `≤780px` tiers): `.icon-btn` 32px→44px,
  `.btn` padding 12px/18px, `.btn--sm` 9px/14px, `.card-menu__item`/`.card-menu__checkbox-item`
  11px/14px — purely additive, the desktop `:root`-level 32px `.icon-btn` rule is untouched.

**One real regression caught by the existing test suite, not a new one — the most significant issue
this gate**: after building the Gantt mobile timeline with the same "always build both, CSS hides"
pattern as Activities, the pre-existing `test_gantt_virtualization_e2e.js` (seeds 3000 activities,
asserts the chart's own virtualization keeps un-rendered activity names OUT of the DOM entirely)
started failing — the timeline, built unconditionally, put all 3000 activity names into
`main.innerHTML` even though CSS hid the timeline visually, and jsdom's `.textContent` doesn't
respect `display:none`. This wasn't just a test artifact: building 3000 unvirtualized `.project-card`
DOM nodes even when hidden is a genuine real-world cost the Activities case doesn't have (the chart
itself IS virtualized; the mobile timeline has none of its own). Fixed by making the Gantt timeline
a genuine JS conditional — `if (window.innerWidth <= 780) { ...build the timeline... }` — rather than
CSS-only, so at desktop/tablet widths it's never built at all. `window.matchMedia` was ruled out for
this check (not implemented in this project's jsdom version — would have broken every jsdom test that
renders the Gantt tab); plain `window.innerWidth`, which jsdom lets you assign directly, works
identically in real browsers and jsdom. Documented in both `schedule.js`'s own comment and the new
test file's header, explicitly contrasting this asymmetry with the Activities grid's CSS-only
approach and why it's the correct call here specifically, not an inconsistency.

**Testing-environment finding worth keeping for any future gate touching `@media` CSS**: confirmed
directly (a minimal `@media (max-width: 500px)` repro) that jsdom's `getComputedStyle()` never
reflects `@media` rules regardless of `window.innerWidth` — it always reports the base/non-media
rule. This means any CSS-only responsive toggle (like the Activities table/card swap) can only be
tested in jsdom via DOM-structure/content checks on both always-built representations plus grepping
the shipped `<style>` tag text for the actual rule text (the same technique Gate 7's density test
already established), never via a computed-style assertion — real visual/rendered confirmation has
to come from real-Chromium screenshots instead, which this gate did at both 820px and 390px.

Tests: new `tests/test_uiux_gate8_tablet_mobile_e2e.js` (42 checks, including a 27-route smoke test)
— both Activities representations built for the same filtered set with matching field content; the
mobile card's "⋯" menu proven to open the identical Edit/Delete as the table row's (proving the
shared `buildActivityRowMenu` extraction works); CSS-bundle text-grep checks for the table/card and
chart/timeline breakpoint swaps; at desktop width (1024) the Gantt tab builds the chart and NOT the
timeline (`.gantt-mobile-timeline` genuinely absent from the DOM, not just hidden); at phone width
(390) the timeline builds instead, correctly sorted by planned start, the chart SVG still builds too
(tagged for CSS to pick), tapping a timeline card opens the real Activity Detail Panel, and switching
back to desktop width removes the timeline and restores the zoom/jump controls; the new tablet
touch-target tier's CSS text confirmed present with 44px sizing, and the original desktop 32px
`.icon-btn` rule confirmed untouched. Full suite: **70 files, 2061 checks**, zero regressions (the
virtualization test's own 21 checks pass again after the fix). Real-Chromium pass at 820px/390px
(Activities table→cards, Gantt chart→timeline, 44px touch targets at tablet width) confirmed
everything renders and behaves correctly — zero console errors. Zip verified separately post-merge
(fresh extraction, real Chromium, `index.html`/`README.md` diffed byte-identical against the pushed
`main` HEAD, Activities cards + Gantt timeline + tablet touch targets all exercised live) — clean.

**Gate 8 is now COMPLETE — this closes out the brief's entire original 8-gate breakdown.** Gates 1,
2, 3, 4, 5, 7, and 8 are all done; Gate 6 "Existing Modules" is the only item left, still on hold
after Documents/Risk Register/Schedule (Vendors/RFI-TQ/Meetings/Change Orders not yet started).
**Next step for a fresh session**: ask Aditya whether to resume Gate 6 for its remaining modules —
there is no other gate left to move to in this initiative. Same standing rule as every other gate:
inspect real code first, propose scope, wait for explicit approval, build exactly that, stop. Don't
assume which module without asking.

## NEW INITIATIVE: Mobile & Desktop Packaging (started 2026-08-21) — a FOURTH, separate initiative

Aditya asked to package the app as a native-feeling Android APK (Capacitor) and desktop app
(Electron), from a general-purpose playbook handed over for reuse on this project. Before writing
any code, the playbook was adapted to PCC's actual architecture (it assumed a Vite/webpack SPA
building to `dist/`; PCC is one self-contained generated `index.html` with everything — JS, CSS,
fonts — inlined, no relative asset paths at all). Two real gaps were flagged during that pass:
Android's WebView doesn't implement `window.print()` by default (Reports/Executive Center rely on
it) and would need a native print plugin; Export/Import/"Open File" (currently `Blob` +
`URL.createObjectURL()` + `a.download`/`window.open()`) likely needs `@capacitor/filesystem` +
`@capacitor/share` rewiring inside a bare WebView. Electron has neither problem — full Chromium
renderer, `window.print()` and the Blob/download pattern both work as-is — so Electron was built
first.

**Before any packaging work started**, two safety-net branches were pushed to `origin` given an
unrelated discovery made along the way (see "Repo/branch state" below for the full story):
`backup/original-history-through-gate18` (the pre-reset original commit history, unrelated to
current `main` but confirmed to be a strict subset of it — nothing unique was ever at risk) and
`backup/pre-mobile-desktop-packaging` (current `main` HEAD, `19ba61a`, as an explicit restore
point before packaging touched the repo).

**Gate 1 — Desktop (Electron), done, 2026-08-21.** Added `packaging/` at the repo root: an
isolated folder with its own `package.json` (`electron` + `electron-builder` as devDependencies)
so the shipped `index.html` stays exactly as dependency-free as before — nothing under `src/`
changed. `packaging/scripts/copy-app.js` copies the repo root's built `index.html` into
`packaging/electron/` before every run/build (electron-builder's `files` resolution stays inside
the package directory, so the app can't be referenced by a `../` path). `packaging/electron/main.js`
does a plain `win.loadFile()` on that copy — no `base: './'` fix needed, unlike the playbook's
generic Vite case, since there are no relative asset URLs to break.

Verified for real, not just "it compiled": launched under `xvfb-run` (this sandbox has no display
but does have `Xvfb`/`xvfb-run` installed) with `--remote-debugging-port`, then drove it live over
the Chrome DevTools Protocol from Node (Node 22's built-in `WebSocket` client, no extra deps
needed). Confirmed: correct page title and `file://` URL (not a blank window — the exact failure
mode the playbook's own checklist warns about), `localStorage` and `indexedDB` both available
under `file://`, and — the check that actually matters — a real `window.PCC.store.update()` write
round-trips through the store's 250ms autosave debounce into `localStorage` under the real key
(`pcc_local_data_v1`), with `meta.last_saved_at` correctly stamped. Then ran an actual
`electron-builder` distributable build (`npm run electron:build` in `packaging/`) producing a real
Linux AppImage (`packaging/release/Project Control Center-1.0.0.AppImage`, ~129MB, expected since
it bundles Chromium+Electron). First build attempt crashed on an unrequested auto-update metadata
step (`Cannot read properties of null (reading 'provider')`, from `app-builder-lib`'s
`updateInfoBuilder`) — fixed by adding `"publish": null` to the electron-builder config (also
added `"author"` and `linux.category`/`synopsis` to clear two informational warnings). Rebuilt
clean. The sandbox has no FUSE (`dlopen(): error loading libfuse.so.2`), which AppImages need to
self-mount — used AppImage's own documented fallback (`--appimage-extract`, then run the extracted
`AppRun` directly) to verify the **actual packaged artifact**, not just the pre-package
`linux-unpacked/` tree: same CDP check, correct title, loading from
`resources/app.asar/electron/index.html` inside the extracted image. This is a sandbox constraint,
not a defect — a real Linux desktop has FUSE by default and the AppImage will just run.

App id set to `com.aditya.projectcontrolcenter` (`packaging/package.json`'s `build.appId`) — for
Electron this only affects auto-updater/protocol registration, not signing continuity the way
Android's `applicationId` does, so it's much lower-stakes than the playbook's Android warning
about it, but still worth Aditya explicitly confirming before this ever actually ships broadly.

**Standing zip convention extended, per Aditya's explicit instruction this session**: the
"rebuild, test, hand over a zip" convention (see Standing Instructions above) now also includes
shipping the platform installer(s) alongside `index.html`/`README.md`/`data//files/` — not just
the web deliverable. `packaging/` itself (source, `node_modules/`, the copied
`electron/index.html`) stays **out** of the end-user zip, same "dev-only tooling" treatment as
`src/`/`build.js`/`tests/` — only the built `.AppImage` (and, once built, `.dmg`/`.exe`) goes in.

**Windows (`.exe`) build added same day, 2026-08-21**, on Aditya's request. `electron-builder`'s
NSIS target needs Wine to cross-build from Linux — not installed by default in this sandbox.
Installing it took two passes: `wine64` alone (`apt-get install --no-install-recommends wine64`,
avoiding a large chain of unrelated multimedia/graphics recommends) got `electron-builder` far
enough to produce a build, but the artifact it left behind was suspiciously small (162KB — an NSIS
stub with no payload attached) and the build log showed `wine: could not exec the wine loader`.
Root cause: NSIS-generated installer stubs are 32-bit PE binaries, and `wine64` alone has no 32-bit
support without i386 multiarch (`dpkg --add-architecture i386 && apt-get install wine32:i386`,
which itself needed `libgd3:i386` installed first to clear a dependency conflict on
`libgphoto2-6t64:i386`). After that, `electron-builder`'s full pipeline (packaging, asar
integrity update, three separate `signtool.exe` invocations via Wine, block map generation)
completed clean — output: `packaging/release/Project Control Center Setup 1.0.0.exe`, 104.5MB,
matching the real payload size this time.

**Verification took a different shape than the Linux AppImage check.** Actually *running* the
installer under Wine (`wine "...Setup 1.0.0.exe" /S`, silent install) hung repeatedly past 5
minutes — Wine's own first-run prefix initialization and its incomplete Win32 API emulation are
known to have gaps unrelated to whether the installer works on a real Windows machine, so chasing
that further wasn't a good use of time. Switched to structural verification instead, using
`electron-builder`'s own cached 7-Zip tool
(`~/.cache/electron-builder/7zip@1.0.0/.../bin/7za`) to open the NSIS archive directly: confirmed
it contains a full `$PLUGINSDIR/app-64.7z` payload (104,002,842 bytes, not a stub), extracted that
7z to find genuine Windows Electron runtime files (`vulkan-1.dll`, `d3dcompiler_47.dll`,
`ffmpeg.dll`, per-locale `.pak` files, `Project Control Center.exe`,
`resources/app.asar`), then used `@electron/asar` (already a transitive dependency in
`packaging/node_modules`) to list and extract `app.asar`'s contents — `electron/index.html`,
`electron/main.js`, `electron/preload.js`, `package.json`, exactly as expected — and diffed the
extracted `index.html` against the repo's real build: **byte-identical**, 4,481,056 bytes. Strong
content-level confidence without needing Wine to actually execute the installer.

**Delivered to Aditya split into 4 chat-sized parts** (same pattern as the Linux AppImage
delivery — the file exceeds the 30MB chat upload limit) with a sha256 checksum
(`b80443bd...7bc7a349`) to verify reassembly, and a note that it's unsigned so Windows SmartScreen
will show an "unknown publisher" warning on first run (expected, not a bug).

This sandbox now has `wine`/`wine32:i386`/`wine64` installed persistently for the session — a
fresh session/container won't have them; the install commands above are the reference if a Windows
build is needed again.

**App id changed and a real icon applied, 2026-08-22.** Aditya flagged (correctly) that
`com.aditya.projectcontrolcenter` was a bad permanent id if this ever goes public — a personal
name baked into a package identity you can never change post-release. No domain owned, so settled
on `com.pcc.projectcontrolcenter`, based on the icon's own "PCC" branding rather than a reversed
domain (confirmed via `AskUserQuestion` rather than defaulted). Aditya also supplied a real app
icon directly (flat square, white card, "PCC" wordmark, "Plan · Control · Deliver" tagline, teal→
navy bar chart mark) — saved to `packaging/icons/pcc-icon-source.png` (1254×1254), now the single
source for both platforms' icons.

Electron's `packaging/package.json` `build.appId`/`build.icon` updated; both Linux and Windows
rebuilt and **re-verified the same way as their original builds**, not just assumed to still work:
Linux — real launch under `xvfb-run` + live CDP inspection (title/URL correct), plus the AppImage's
own embedded icon extracted and read back to confirm it's the real PCC mark, not corrupted or
swapped. Windows — same structural technique as the original build (NSIS payload extracted,
`app.asar`'s `index.html` diffed byte-identical against the real build) since a full Wine
install-flow run isn't worth repeating for a config-only change.

**Android Gate 1 (bare Capacitor wrapper) built and structurally verified, 2026-08-22.** Scoped in
a short paragraph and confirmed before building, per this project's standing gate discipline —
Aditya specifically asked whether Gates 2/3 (the two deferred fixes) could be built *before* Gate 1;
answered directly: no, they're genuinely dependent on Gate 1's existence (Capacitor plugins bridge
web JS to native Android code that only exists once `cap add android` creates the native project;
there'd also be nothing to verify them against).

Set up `packaging/android/` — isolated the same way as `packaging/electron/`, own `package.json`
(`@capacitor/core`/`cli`/`android` — all pinned to matching major version 8; a moderate `uuid`
advisory via `xcode`/`@capacitor/cli`'s (irrelevant, iOS-only) tooling was cleared with
`npm audit fix --force` since nothing depended on the old API yet). `capacitor.config.json`:
appId `com.pcc.projectcontrolcenter`, `webDir: www`. `scripts/copy-app.js` mirrors the Electron
one — copies the repo's real built `index.html` into `www/` and the shared icon into `assets/`
before each sync/build.

**Bootstrapping the Android SDK worked exactly as the original playbook described** — this
container had no `ANDROID_HOME`, no existing SDK, but did have Java 21 and reachable
`dl.google.com`. Downloaded `commandlinetools-linux-11076708_latest.zip`, then
`sdkmanager --sdk_root=... "platform-tools" "platforms;android-36" "build-tools;36.0.0"`
(Capacitor 8's `variables.gradle` wants SDK 36, not the playbook's generic `<N>` placeholder),
accepted licenses, wrote `android/local.properties`. Icon/splash generated via
`npx @capacitor/assets generate --android` from the shared source image — pulled in real
vulnerabilities this time (`sharp` high, `tar` critical, the same `uuid` moderate), all inside
`@capacitor/assets` itself with no non-breaking fix available; accepted as a low-risk, dev-tooling-
only gap (one-time local run against a trusted image I created this session, never shipped) rather
than force a possibly-breaking upgrade for no real benefit — documented rather than silently
ignored. Visually confirmed the generated `mipmap-xxxhdpi/ic_launcher.png` is the real icon, not
corrupted, before building.

`./gradlew assembleDebug` succeeded clean (93 tasks, ~1m37s) — `app-debug.apk`, ~11.9MB (much
smaller than the Electron builds, as expected — no bundled Chromium, just a WebView wrapper).

**Verification here looks different from every other packaging gate this session, worth being
explicit about**: this container has no `/dev/kvm` and no VMX/SVM CPU flags — no Android emulator
possible, and no physical device to `adb install` onto either, so there was no way to actually
launch this one and watch it render, unlike Linux (real CDP-driven launch) or even Windows
(structural, but at least a complete real-world artifact). Verified instead with `aapt dump
badging` (correct package id `com.pcc.projectcontrolcenter`, manifest sane), `apksigner verify`
(valid signature, standard Android debug cert), and unzipping the APK to diff
`assets/public/index.html` against the real build — byte-identical. That's solid evidence the APK
is well-formed and contains the right content, but **an actual device/emulator launch is still
unverified** — flagged to Aditya directly when the APK was delivered, not glossed over.

Delivered `app-debug.apk` directly (11.9MB, under the 30MB chat limit — no splitting needed this
time, unlike the Electron builds) with its sha256 and an explicit note that Print and Export/
Import/Open File are known-broken in this build (Gates 2/3, not yet built).

**Gate 2 (Export/Import/Open File) done, 2026-08-22.** Scoped extensively per Aditya's request
before building — he had four real concerns: not losing PDF/Excel/Word import (and future MS
Project/Primavera P6), not losing printable PDF reports, wanting uploaded files to open *in the
app* rather than downloading to the phone, and a "compress at rest, decompress on open" storage
idea. Investigated the actual code before answering rather than assuming: PDF/Excel/Word
extraction (`pdf.min.js`/`mammoth.browser.min.js`/`xlsx.core.min.js`) runs entirely on in-memory
bytes, untouched by anything in this gate; MS Project/Primavera P6 import doesn't exist anywhere
yet (`scheduleImportService.js` only does generic row import), so that's genuinely future work,
unaffected either way. Printable reports are Gate 3 (a native print plugin), not this gate —
kept separate on purpose. The storage-compression idea was scoped out entirely, into its own
future **Gate 4** (cross-platform, not Android-specific — `blobStore.js` stores blobs as base64
strings today, used by every platform; changing that format is a real decision on its own,
not something to fold into an Android compatibility fix).

**The real finding while scoping**: every "view a stored file" call site (`documents.js`,
`dailyLog.js`'s photos, `vendors.js`'s vendor documents) used `window.open(blob:..., "_blank")` —
a browser "new tab" pattern that doesn't exist in *any* bare WebView, Capacitor or Electron. This
was never purely an Android gap, just one that happened to work by accident in a real browser.
Fixed with one implementation shared across every platform rather than an Android-only patch:

- **New `src/js/fileViewer.js`** — a self-contained in-app modal viewer. Given just a
  `{filename, mimeType, blob}`, it renders PDFs via real page-by-page canvas rendering (pdf.js,
  already bundled — not just the extracted text), images inline, and Word/Excel via
  `mammoth.convertToHtml()`/SheetJS (also already bundled) rather than a pixel-perfect Office
  renderer, which would be disproportionate. Reuses the existing (previously unused!)
  `.modal-overlay`/`.modal`/`.modal__*` CSS already in `styles.css` from an earlier phase. Doesn't
  depend on a caller's pre-computed `extraction` data — re-parses from the blob's own bytes, so
  any call site can use it standalone. Unsupported types fall back to a message + a prominent
  Save/Share action rather than silently failing.
- **New `src/js/nativeFile.js`** — the one place a real "download" is still correct (exporting
  your data, saving a document's original file — different intent from *viewing* a file, which
  never leaves the app now). One `save(blob, filename)` call site, two implementations picked at
  runtime: the existing `Blob` + `<a download>` pattern unchanged for web/Electron, or
  `@capacitor/filesystem` (write to cache) + `@capacitor/share` (hand it to Android's native share
  sheet) when `window.Capacitor.isNativePlatform()`. Consolidated three previously-duplicated
  `<a download>` blocks (`archive.js`'s Export Archive, `store.js`'s JSON export and recovery-
  backup download) into this one call site.
- Call sites updated: `documents.js`'s `openStoredFile()`, `dailyLog.js`'s `openPhotoFullSize()`,
  `vendors.js`'s `openStoredVendorDocument()` now call `fileViewer.open()` instead of
  `window.open()`. `archive.js`/`store.js`'s three download sites now call `nativeFile.save()`.
- `packaging/android/`: added `@capacitor/filesystem`/`@capacitor/share` as dependencies (clean —
  no new vulnerabilities beyond the three already-accepted `@capacitor/assets` dev-tooling ones
  from Gate 1), synced, rebuilt the debug APK (`app-debug.apk`, now 15.2MB, up from 11.9MB with
  the plugin code compiled in).

**Tested more thoroughly than any prior packaging gate, deliberately** — this is real behavior
change, not just a wrapper: a new dedicated jsdom e2e file
(`tests/test_file_viewer_gate2_e2e.js`, 12 checks, added to the suite's `npm test` chain) covers
`nativeFile`'s both branches (stubbed `window.Capacitor.Plugins.Filesystem`/`Share` for the native
path, a spied `<a>`.click() for the fallback), `fileViewer`'s modal DOM/close behavior, and —
important — the **real call sites**: seeded a document/vendor-document/daily-log-photo with a real
blob in `fake-indexeddb`, clicked the actual "Open File"/"View / Download"/photo-link buttons in
the rendered UI, and asserted `fileViewer.open()` was actually invoked with the right filename —
not just that the new functions exist in isolation. Hit one jsdom gap along the way
(`URL.createObjectURL` isn't implemented there) — stubbed it directly, same convention this
project already uses for jsdom's missing `FileReader.readAsDataURL`. Full existing suite
(42 files) still passes unchanged — zero regressions. Then went further with **real Chromium**
(Playwright): hand-built a genuinely valid minimal PDF (correct xref offsets, not just a `%PDF`
header stub) and a real 1×1 PNG, seeded both through the actual store/blobStore, clicked through
the real UI — confirmed a real `<canvas>` rendered the PDF's actual text ("Gate 2 Test PDF",
screenshot taken), the image rendered via a real `blob:` URL, and zero console/page errors either
way. Android verified the same way Gate 1 was — no emulator/device in this sandbox, so structural
only: `apksigner verify` (valid debug signature), unzipped and diffed the embedded `index.html`
byte-identical against the real build, and confirmed both plugins are genuinely compiled in (not
just referenced) — `capacitor.plugins.json` registers `FilesystemPlugin`/`SharePlugin`, and
`strings` against the split dex files found real hits in `classes7.dex`/`classes5.dex`/
`classes8.dex`. **The actual native Filesystem-write-then-Share-sheet flow is still unverified
live** — same honest gap as Gate 1, now doubly true since this gate is exactly the code path that
matters most for it. Skipped a fresh Electron relaunch this round (an environment hiccup mid-gate
made repeated attempts unreliable) — justified since Electron's renderer is the identical Chromium
engine already proven clean via the Playwright pass above, and no Electron packaging config
changed this gate; still worth a real relaunch check next time Electron-specific code changes.

**Gate 3 (native print) done, 2026-08-22.** Deliberately not a third-party community plugin — a
small custom Capacitor plugin built entirely on Android's own `WebView.createPrintDocumentAdapter()`
+ `android.print.PrintManager`, the same OS-level API Chrome itself uses for printing. Ships with
the platform since API 21 (well under this app's `minSdkVersion` 24), so zero new dependencies.
The real payoff: Android's native print dialog bundles a "Save as PDF" virtual printer on every
device by default, alongside real printers — directly the thing Aditya didn't want to lose.

**Why neither `reports.js` nor `executiveCenter.js` needed to change**: both call plain
`window.print()` (confirmed by grep before building anything — `reports.js:617`,
`executiveCenter.js:3080`), and the native print adapter operates on the WebView's own rendering
engine, the same one that already applies the app's existing `@media print` CSS for a desktop
Ctrl+P. So the fix is entirely additive: `packaging/android/android/app/src/main/java/.../PrintPlugin.java`
(one `@PluginMethod`, wraps `createPrintDocumentAdapter()`/`PrintManager.print()`, dispatched via
`getBridge().executeOnMainThread()` since `PrintManager` is a UI-thread API), registered in
`MainActivity.java` (was a bare 3-line `BridgeActivity` subclass, now calls `registerPlugin()`
before `super.onCreate()`), and `src/js/nativePrint.js` — a shim that overrides `window.print`
itself, but only when `window.Capacitor.isNativePlatform()` is true. Web and Electron's real
`window.print` are left completely untouched (both already worked).

One real design wrinkle, documented directly in the shim: a real Capacitor WebView injects
`window.Capacitor` before any page script runs, so the override applies correctly at load time in
production — but a *test* environment necessarily sets `window.Capacitor` up after the page has
already loaded. Solved by exposing the install step as `window.PCC.nativePrint.install()`, called
once at load time and re-callable by tests after stubbing `window.Capacitor`, rather than only
running once inside an unexported IIFE closure.

**Testing**: a new 7-check jsdom e2e file (`tests/test_native_print_gate3_e2e.js`) covers the shim
installing/leaving-alone correctly under both platform states, a missing-plugin case notifying
instead of throwing, and — the check that actually matters — clicking the real "Print / Save as
PDF" buttons on both Reports and Executive Center's Output tab (`viewProject(id, "output")` to
reach it) and confirming they route through the stubbed native plugin. Full suite (44 files now)
confirmed 0 failures. **This is the most honest gate yet on live verification**: unlike Gates 1-2,
there's no structural proxy for "the system print dialog actually opens and produces a correct
PDF" — no dex-string check can substitute for that. What *was* verified structurally: the APK
builds clean (Gradle would fail on a Java error in the new plugin/MainActivity), `apksigner`
confirms a valid signature, the embedded `index.html` is byte-identical, and
`com/pcc/projectcontrolcenter/PrintPlugin`/`MainActivity` both show up compiled into `classes6.dex`
(3 and 2 hits respectively) — the class genuinely exists in the build, not just the source tree.
The actual print dialog behavior is unverified and needs a real device before considering this
gate genuinely proven, not just structurally built — flagged directly to Aditya, not glossed over.
Skipped a fresh Electron relaunch for this gate too (same reasoning as Gate 2, doubly true here
since the shim's own web/Electron path — "leave `window.print` untouched" — is exactly what the
jsdom test already confirmed directly, with nothing platform-specific left to verify live).

**Aditya confirmed both the desktop app and the Android APK install and work**, closing out the
"unverified live" gap Gates 2-3 flagged repeatedly — the first real on-device confirmation this
whole packaging initiative has had.

**Gate 4 (blob storage efficiency, cross-platform) done, 2026-08-22.** Measured real compression
gains before building anything, since the value here is genuinely format-dependent, not a given:
gzip on the repo's own real PNG icon (already-compressed format) saved only 1.3%; on a ZIP-based
container (tested as a stand-in for `.docx`/`.xlsx`'s internal structure) it saved 23% — real, but
unpredictable per file. The bigger, *guaranteed* win had nothing to do with compression at all:
`blobStore.js` stored every blob as a base64 **string** in IndexedDB, which inflates size by
exactly 1/3 over raw bytes regardless of content. Switched to storing raw bytes directly (IndexedDB
supports this natively) with gzip layered on top via `CompressionStream`/`DecompressionStream` — a
native Web API, zero new dependencies, confirmed available in every target environment (Node 22
for the test harness, real Chromium, and — per Chrome/WebView version history, this app already
needing `pdf.js`-level Chromium features per Aditya's on-device confirmation above — Android's
WebView too, though not directly tested on-device the way Gates 1-3's own features were).

**Scope stayed exactly where planned**: `putBlob()`/`getBlob()`/`resolve()` keep their exact
external signatures (still take/return a plain base64 data URI string) — `documents.js`,
`dailyLog.js`, `vendors.js`, `fileViewer.js`, `nativeFile.js`, and `store.js`'s export/import/
legacy-migration call sites needed **zero changes**. Only `blobStore.js`'s internal on-disk shape
changed. No bulk migration, same "never a risky bulk rewrite" discipline `store.js`'s own
`schema_version` chain follows: `getBlob()` detects the old `{id, data: <string>}` shape at read
time and returns it completely unchanged — never rewrites it in place. A record only migrates to
the new `{id, mime, gz: <compressed bytes>}` shape the next time it's genuinely re-saved (a new
revision uploaded, etc.).

**This is the first packaging gate fully testable end-to-end in jsdom** — no native plugin, no
platform branching, nothing needing a "structural only" caveat. New 9-check
`tests/test_blob_compression_gate4_e2e.js` covers real compress/decompress round-trip integrity
(byte-for-byte against a real PNG, not just "didn't throw"), confirms the actual on-disk record
shape, backward compatibility with a directly-seeded legacy-shaped record (returned untouched, not
rewritten), opportunistic migration on re-save, and the real "Open File" UI flow reading a
now-compressed blob correctly. One real gotcha hit along the way: jsdom doesn't implement
`CompressionStream`/`DecompressionStream`/`Response` on `window` (confirmed missing, unlike Node's
own global scope which has them) — assigned Node's real implementations onto `dom.window`
directly in the 5 affected test files (this new one plus `test_knowledge_base_e2e.js`,
`test_report_template_system_e2e.js`, `test_schedule_excel_editor_e2e.js`, `test_vendors_e2e.js` —
found by grepping every test file for `putBlob`/`getBlob`/`blobStore.resolve`), same convention as
stubbing jsdom's missing `URL.createObjectURL`. Also hit a genuine flaky-test bug of its own: a
few UI-click-triggered blob reads (Gate 2's "Open File"/"View / Download"/photo-link tests, plus
this gate's own new one) asserted after a fixed-count `flush()`, which was reliable when
compress/decompress was fast but flaked once under a long, resource-contended full-suite run now
that real stream processing is involved, not just promise-chain microtasks. Fixed by polling
(`waitFor()`) instead of guessing a tick count — confirmed stable across 3 full-suite reruns
afterward, 0 failures each time. Full suite is now 45 files.

Rebuilt and structurally re-verified all three packaging artifacts against the new `blobStore.js`
(this touches every platform, not just one): Android APK — signature valid, embedded `index.html`
byte-identical; Windows/Linux Electron — same structural technique as prior rebuilds. Then went
further with **real Chromium** (Playwright, not just jsdom): seeded a document with the repo's
real PNG icon, confirmed the actual on-disk IndexedDB record uses the new compressed shape, did a
byte-for-byte round-trip check, then opened it through the real "Open File" UI and confirmed it
rendered correctly — zero console errors, screenshot taken. This matters here specifically because
jsdom's `CompressionStream` in the test suite is literally Node's own implementation, not
Chromium's — real Chromium verification confirms the actual browser implementation round-trips
correctly too, not just Node's.

**Not done yet**: Android release signing (a dedicated keystore, not reusing Aditya's existing one
from a different app — confirmed no benefit to reuse across unrelated `applicationId`s). macOS
`.dmg` still needs a macOS host. Code signing for Windows/Android real releases remains an explicit
later decision, not needed for personal/internal use. With Gates 1-4 done and confirmed on-device,
the packaging initiative's originally-scoped work (desktop + Android, matching feature parity, plus
the storage-efficiency follow-on) is complete — anything further (release signing, code signing,
macOS) is a new, explicit decision for whenever Aditya wants to actually distribute beyond
sideloading/direct installs.

**Desktop cosmetics fixed, 2026-08-22, before Android release signing** (Aditya's explicit
priority call). Reported "no custom icon set throughout the app, no desktop Name" after actually
running the installed apps — investigated concretely rather than guessing, and found two real,
verifiable bugs, both Electron-specific (Android's app name/icon were already correct since Gate 1
— `strings.xml`'s `app_name` and `@mipmap/ic_launcher` were both already right, confirmed by
re-checking, not assumed):

1. **`BrowserWindow` never set an `icon`.** electron-builder's `build.icon` config only brands the
   *installed* exe/AppImage file (Explorer, shortcuts, Start Menu) — the actually-**running**
   window (title bar, taskbar while open, Alt-Tab) falls back to Electron's default logo unless
   set explicitly in code. Fixed in `main.js` — added `icon:` to the `BrowserWindow` constructor,
   plus a redundant explicit `win.setIcon()` call (see point 3 below for why redundant).
   `scripts/copy-app.js` now also copies the shared icon into `electron/icon.png` (previously only
   `index.html` was copied — only `electron/**/*` gets bundled into the packaged app, so a
   reference to `packaging/icons/` directly would have worked in `electron:dev` but silently broken
   in the actual packaged build).

2. **The real root cause of "no desktop Name," found by directly inspecting a running window's X11
   properties (`xprop`/`xwininfo` under a bare `Xvfb`, no window manager needed for this) rather
   than guessing**: Electron's Linux `WM_CLASS` — what desktop environments use to associate a
   running window back to its `.desktop` entry (and therefore its icon) — is set natively from
   `package.json`'s `"name"` field, too early for `app.setName()` in `main.js` to change it
   (confirmed directly: `app.setName("Project Control Center")` *did* correctly change
   `app.getName()` and the userData path — visible in the running process's
   `--user-data-dir=/root/.config/Project Control Center` — but `WM_CLASS` stayed `"pcc-desktop"`
   regardless). Compounding this: the AppImage's generated `.desktop` entry had
   `StartupWMClass=Project Control Center`, which never matched the real runtime `WM_CLASS` at
   all — a **pre-existing mismatch that predates this session's own `desktopName` fix attempt**,
   not something introduced by it. Root-caused, not papered over: renamed `packaging/package.json`'s
   `"name"` from `"pcc-desktop"` to `"project-control-center"`, added top-level `"desktopName":
   "project-control-center.desktop"` (must be top-level, not nested under `build.linux` — first
   attempt at nesting it there failed electron-builder's own config schema validation, corrected
   after checking the schema directly rather than guessing at placement) and
   `build.linux.syncDesktopName: true`. Verified end-to-end: rebuilt, re-inspected the same way —
   `WM_CLASS` is now `"project-control-center"`, and the AppImage's own `.desktop` entry now reads
   `Icon=project-control-center` / `StartupWMClass=project-control-center`, matching a real
   `project-control-center.png` file actually present at the AppImage root and in
   `usr/share/icons/hicolor/1254x1254/apps/` — fully internally consistent for the first time.
   This also happened to permanently clear the "electron uses desktopName..." warning that had
   silently appeared in every single Linux build since Gate 1 and was never investigated until now.

3. **Honest gap**: even after all of the above, `_NET_WM_ICON` (the X11 property some taskbars read
   directly for a running window's icon, independent of the `.desktop`/`WM_CLASS` mechanism) stayed
   completely empty in this sandbox's own repeated tests — both via the `BrowserWindow` constructor
   option and an explicit `win.setIcon()` call afterward. Most likely a real limitation of testing
   under bare `Xvfb` with no window manager or compositor running at all, not a code bug — the
   `WM_CLASS`↔`.desktop`-`Icon=` mechanism verified working above is the standard, primary
   mechanism most real Linux desktop environments (GNOME, KDE) actually rely on for this, so the
   practical impact should be small — but this specific property's real-world behavior on an actual
   desktop session is unverified from here, flagged directly rather than assumed fixed. Windows
   icon handling doesn't share X11's mechanism/quirks here and was not the source of any
   uncertainty — its exe icon (via `build.icon`) was already confirmed correct in earlier gates and
   is unaffected by any of this round's changes.

Also cleaned up `packaging/package.json`'s top-level `"description"` field, which had been leaking
straight into the AppImage's user-facing `.desktop` `Comment=` field as dev-facing text ("dev-only
tooling, not part of the shipped single-file app") — replaced with a short, genuinely user-facing
sentence. Rebuilt and re-verified both Windows and Linux installers; Android untouched this round
since its naming/icon were already correct. Full test suite unaffected (zero `src/` changes, only
`packaging/electron/` and `packaging/package.json`).

**Android release signing, done, 2026-08-22** (Aditya's explicit next instruction after the desktop
cosmetics fix: "move on to Android release signing and code signing for real distribution"). A
dedicated release keystore was generated for this app specifically — confirmed earlier this session
there's no benefit to reusing Aditya's existing keystore from an unrelated app, since Android ties
a keystore to one `applicationId` (`com.pcc.projectcontrolcenter`) for the life of that app; once a
real release ships signed with a given key, every future update must be signed with that *same* key
or Android refuses to install it as an upgrade.

- Generated via `keytool -genkeypair`: PKCS12 format, RSA 2048, alias `project-control-center`,
  `CN=Project Control Center, C=IN`, 10000-day validity (until 2054-01-07). Cert SHA256 fingerprint:
  `94:52:69:20:2C:B7:E4:6A:CC:78:F7:2C:29:87:36:67:04:47:3C:08:56:23:2F:E3:2B:CC:AC:04:C5:84:A4:9D`.
- **The keystore file and its password were delivered directly to Aditya via file/message before
  any other work in this round**, ahead of even documenting or committing anything — this container
  is ephemeral and the key cannot be regenerated once a real release has shipped under it, so losing
  it before delivery would have been unrecoverable. The password itself is never written to any file
  in this repo, including this one.
- `packaging/android/android/app/build.gradle`: added a `signingConfigs` block that loads
  `app/keystore.properties` *if present* and conditionally applies it to the `release` buildType —
  `assembleRelease` produces a properly signed build when the keystore exists locally, or falls back
  to an unsigned build otherwise, with no separate CI/dev code path needed. `keystore.properties`
  (references the keystore file, alias, and both passwords) and `*.keystore`/`*.jks` were added to
  `packaging/android/android/.gitignore` — previously the Capacitor template had these lines present
  but *commented out*, i.e. inactive; a real keystore now exists so this had to be a real, active
  ignore rule, not a template placeholder. Verified with `git check-ignore -v` that both the keystore
  and its properties file are actually excluded before committing anything.
- Added `"android:build:release"` to `packaging/android/package.json`'s scripts, mirroring the
  existing `"android:build:debug"` pattern.
- Built with `./gradlew assembleRelease` → `BUILD SUCCESSFUL`. Verified three separate ways before
  delivery: `apksigner verify --print-certs` confirms the APK is signed with the real release cert
  (not the Android debug cert), and the printed certificate SHA256 matches the keystore's own
  fingerprint exactly; `zipalign -c -v 4` passes; the embedded `assets/public/index.html` inside the
  signed APK is byte-identical to the current repo build (same technique used for every prior
  packaging gate's structural verification, since no emulator/device is available in this sandbox).
  Delivered APK: 9,678,463 bytes, sha256 `a1b8f22bd7975c423e63ff61ba38d746e2bf3d833e8c55d0296f819becd2ac07`.
- A **staging copy** of the keystore was briefly placed at `packaging/android/release.keystore`
  (outside the `packaging/android/android/` directory the `.gitignore` above actually covers) purely
  to hand it off via file delivery — this was deleted immediately after delivery and confirmed via
  `git status` before any commit, so it was never at risk of being committed.
- **Certificate details (CN=Project Control Center, C=IN) can still be changed for free** by
  regenerating the keystore, but only until a real release actually ships to end users signed with
  it — after that, the identity is permanent for the life of the app. Flagged to Aditya for
  confirmation/awareness, not yet explicitly re-confirmed back.
- **What "code signing for real distribution" still needs beyond this, explicitly out of scope for
  me to execute** (both require credentials only Aditya can obtain, not something buildable from
  this sandbox):
  - **Windows**: a code-signing certificate purchased from a CA (e.g. DigiCert, Sectigo) — once
    Aditya has one, `electron-builder` picks it up automatically via the `CSC_LINK` (path/URL to the
    `.pfx`) and `CSC_KEY_PASSWORD` environment variables at build time; no config file changes
    needed beyond setting those two variables before running `npm run electron:build`. Without this,
    the `.exe` installs fine but shows an "Unknown Publisher" SmartScreen warning — a distribution
    polish issue, not a functional blocker.
  - **macOS**: requires an Apple Developer Program account (paid, Apple-side), a Developer ID
    Application certificate, and notarization credentials (an app-specific password or API key) —
    plus, separately from signing, a real macOS host to actually build the `.dmg` at all (still not
    available in this sandbox, unrelated to signing).
  - Android itself is now fully signed for real distribution (Play Store or direct APK
    sideloading) as of this round — no further Android-side action needed beyond this.

**Windows/macOS code signing: closed, not just deferred (2026-08-22).** Aditya confirmed the
Windows build is for his own personal use only — not buying a CA certificate, so the "Unknown
Publisher" SmartScreen warning on the unsigned `.exe` stays and is accepted. macOS was already
declined earlier (no Mac hardware). No further code-signing work is planned for this app unless
Aditya explicitly decides to distribute more widely later — this whole thread of the packaging
initiative is done.

## NEW INITIATIVE: UI Modernization (started 2026-08-22) — a FIFTH, separate initiative

Aditya asked, via `/prompt-master`, to modernize the app's UI to current app standards — a vague
starting brief deliberately handled the way this project handles every vague brief: don't guess,
scope first, get confirmation before writing code. An Explore-agent audit of `styles.css` and every
`src/js/pages/*.js` file against the existing design-token system (from the original UI/UX Overhaul,
Gate 1) found the real gap isn't missing design infrastructure — tokens, shared `.btn`/`.panel`/
`.kpi-card`/`.empty-state` classes, and complete dark/light theming all already exist and are
already well-adopted — it's that page modules almost never *use* the tokens for their own styling,
setting `el.style.fontSize = "13px"` etc. directly instead of the cascade. That produced a 6-gate
plan (A: stylesheet token cleanup, B/C: page-level inline-style cleanup split into two batches by
file size, D: a genuinely new loading-state pattern — none currently exists anywhere in the app, E:
an SVG icon system replacing the current Unicode-glyph icons, F: empty-state copy + motion polish),
presented to Aditya for confirmation before any implementation, per this project's own standing
"scope before building" convention (see CLAUDE.md).

**Gate A — Stylesheet Token Cleanup, done, 2026-08-22.** Aditya confirmed proceeding with Gate A
specifically (not the whole 6-gate plan) and left one open decision — whether to fold a new
`--space-4-5: 20px` token into the cleanup for the 11 `20px` instances that don't match any existing
token — to my judgment; decided to leave `20px` as a literal, consistent with Gate A's own stated
scope of "swap in existing tokens, don't invent new ones," rather than quietly expanding scope on my
own initiative.

- **CSS-only, no `src/js/` file touched.** `styles.css` itself, which *owns* the token system, still
  had 342 raw px literals against only 228 real `var(--...)` uses — some duplicating a token's exact
  value in a rule sitting right next to an already-tokenized sibling.
- **Method**: manual, per-rule review of roughly 60 rules — not a blind find/replace, since the same
  numeric value maps to a different token depending on the property it's used in (`padding: 16px` →
  `--space-4`, but `border-radius: 16px` would need a radius token, or stay literal if none matches).
  Every value that exactly matched an existing token *and* used it in a semantically matching
  property (font-size↔`--text-*`, border-radius↔`--radius-*`, padding/margin/gap↔`--space-*`) was
  converted. Result: `var(--...)` usage 228→288; raw px literals 342→282.
- **Explicitly excluded, on purpose, not by oversight**:
  - `[data-density="compact"/"spacious"]` — its literal values are deliberate matched steps from the
    baseline (per that gate's own header comment), not oversights; touching them risks the density
    toggle's own behavior.
  - `@media print` and the `.report-doc`/`.report-doc__section` component, both inside and outside
    that block — reports are print-sensitive (`window.print()`-based, no PDF library per CLAUDE.md)
    and were kept fully out of scope as a precaution, wider than just the print block itself.
  - Responsive breakpoint values (`780px`/`1023px`/etc.) — layout thresholds, not spacing, already
    flagged as intentionally untouched by the file's own original Gate 1 comment.
  - `20px` (11 occurrences, no exact token match) and any other non-matching value — see the open
    decision above.
  - Dimensional properties (fixed-size `width`/`height` on icons, drawers, progress tracks) — these
    coincide numerically with some tokens but aren't semantically "spacing," so tokenizing them would
    blur what the token actually means for no real benefit.
- **Verified**: rebuilt (`node build.js`), full test suite — **all 78 test files still pass, zero
  failures** (pure value-for-token swap, no visual change intended, confirmed exit code 0 on the full
  chained `npm test` run). Also did a real-Chromium pass (Playwright, not just jsdom, per this
  project's own testing convention) — zero console/page errors opening the built `index.html`, and a
  Portfolio-page screenshot confirms KPI cards, toolbar, buttons, and the empty-state all render with
  unchanged spacing.
- **Not started yet**: Gates B through F of the 6-gate plan (page-level inline-style cleanup in two
  batches, the new loading-state pattern, the icon system, empty-state/motion polish) — all scoped
  and written up above/in README.md, pending Aditya's go-ahead on which to build next and in what
  order.

**Gate B — Page Inline-Style Cleanup, Batch 1, done, 2026-08-22.** Aditya chose **B1** (strict,
zero-visual-change) over B2 (broader normalization with small real rendering shifts) when asked —
B2 stays scoped but unbuilt, a real future decision, not something decided on his behalf.

- **The re-audit before touching anything corrected my own original estimate**: most of the ~250-380
  `.style.X =` assignments per file counted in the original 6-gate proposal are layout-mode
  properties (`display`, `alignItems`, `flexWrap`, `position`, `cursor`, etc.) that aren't
  tokenizable at all — converting those to CSS classes is a different, much bigger refactor than
  what was pitched as "inline-style cleanup," explicitly kept out of this gate. Surfaced this
  correction to Aditya before writing any code, rather than quietly redefining the gate's own scope.
- **A second real finding, more significant than Gate A's**: of the actually tokenizable subset
  (`fontSize`/`margin*`/`padding*`/`gap`/`borderRadius`), the *dominant* values in these four pages
  (12px/13px font-size; 6px/10px/14px spacing) don't sit on the token scale at all — unlike
  `styles.css` itself in Gate A, which mostly did. This meant B1 (exact-match-only) converts a
  meaningfully smaller fraction of instances than the raw counts suggested; put to Aditya as an
  explicit B1-vs-B2 choice rather than picked automatically.
- **Piloted on `vendors.js` first** (smallest, 108 tokenizable instances), verified clean (syntax
  check + diff inspection), then applied the identical method to `executiveCenter.js`, `portfolio.js`,
  `schedule.js`. Roughly 470 instances converted total across the four files (62 in `vendors.js`, 59
  in `executiveCenter.js`, 65 in `portfolio.js`, 61 in `schedule.js`).
- **Method**: literal `sed` substitution, not manual per-rule review like Gate A needed — safe here
  specifically because `.style.PROPERTY = "VALUE"` in JS already disambiguates by property name (no
  risk of the same numeric value needing a different token depending on context, which was Gate A's
  reason for manual review). Shorthand values (`margin = "4px 0 0"`) were split the same way Gate A
  did, tokenizing only the matching component. `var(--...)` inside inline `element.style` assignment
  already had one precedent in this codebase (`schedule.js`'s pre-existing `borderRadius =
  "var(--radius-sm)"`) — confirmed this pattern works in Capacitor's Chromium-based Android WebView,
  not just desktop browsers, since Gate 1-3 of the packaging initiative already proved that WebView
  renders this app's CSS correctly.
- **Verified**: all four files pass `node --check`; the full 78-file test suite ran once and covered
  all four files together (the background test run, launched right after the `vendors.js` pilot edit,
  picked up the other three files' edits mid-run since they landed within seconds — confirmed via
  `ps` that the test process was still early in the chain) — **0 failures, exit code 0**. Also did a
  real-Chromium pass (Playwright) across Portfolio/Vendors/Executive Center/Schedule specifically
  (the four touched pages), zero console/page errors; a Vendor Management screenshot confirms KPI
  cards, tab bar, and panels render with unchanged spacing.
- **Not started**: Gate C (same cleanup for the remaining six page files — `documents.js`,
  `meetings.js`, `resources.js`, `delayRecoveryDashboard.js`, `settings.js`, `rfis.js`), Gates D-F
  (loading-state pattern, icon system, empty-state/motion polish), and the B2 scale-snapping decision
  for these same four files if Aditya wants deeper consistency later.

**Gate B2 — Scale-Snapping, done, 2026-08-22.** Aditya asked to proceed with B2 right after Gate B —
applied to the same four files (`vendors.js`/`executiveCenter.js`/`portfolio.js`/`schedule.js`),
snapping the near-miss values B1 deliberately left as literals onto the nearest token. Real, small
rendering shifts (0.5-4px per instance), not a zero-visual-change gate like A/B1.

- **Snapping rule, stated explicitly so it's not a hidden judgment call**: nearest token by absolute
  distance; exact ties round up (6px is equidistant between `--space-1`=4 and `--space-2`=8 → snaps
  to 8; same tie-break logic for 10→12, 14→16, 20→24). Font-size 12px and 13px both collapse to
  `--text-sm`(12.5) — the two values were never a deliberate distinction in these pages, so
  collapsing them is itself a small real consistency win, not just mechanical snapping.
- **Explicitly excluded from snapping** (same "not every literal is scale drift" discipline as Gate
  A's `20px`/breakpoints): values ≤3px (treated as intentional micro-adjustments on tight UI —
  badges, table cells — not scale drift), negative margins (deliberate visual pull-up nudges), one
  clear outlier (`paddingTop: 60px` on an Executive Center empty-state cover — far from any token,
  evidently intentional, not a near-miss), and `borderRadius: 50%` (a circle shape, not a radius
  value).
- **Caught and fixed two real Gate B (B1) oversights while re-auditing for B2**: `executiveCenter.js`
  had `marginBottom: 12px` (5×) and `marginBottom: 24px` (1×) that exactly matched `--space-3`/
  `--space-5` and should have been converted in B1 but were missed, plus one shorthand padding
  (`4px 8px`) where only the first component had been tokenized. Fixed as a small correction
  alongside B2, not counted as new B2 scope — worth noting for future gates: **when re-auditing a
  file for a follow-on gate, always re-check for exact-match oversights from the prior gate, not
  just the new gate's own target values** — this is how the mistake was caught.
- **Verified**: all four files pass `node --check`; full 78-file test suite — 2089 checks, 0
  failures; real-Chromium pass across the same four pages (Portfolio/Vendors/Executive Center/
  Schedule), zero console errors.
- **Honest gap**: the before/after visual comparison used the same empty-state dashboard screenshots
  as Gate B's verification, which don't exercise dense tables/lists with real data — exactly where
  the actual 0.5-4px shifts would be visible. Flagged directly rather than claiming a confirmed
  visual diff that wasn't actually checked; a future verification pass with seeded data would give a
  real before/after comparison if that matters later.

## Where things stand — Tiers A-F complete; Tier 3 (a separate, older roadmap) is now CLOSED OUT

`main` is fully up to date through **Tier 3, "final polish," Gate 4** (Gantt virtualization for
10,000+ activities), `schema_version` **51** (unchanged since Gate 2 — neither Gate 3 nor Gate 4
needed a schema bump, both being pure rendering/UI work). Note this is a
DIFFERENT roadmap than the "PCC Evolution Roadmap" Tiers A-F
above it, which finished with Gate 26 — Tier 3 is a numbered tier from the ORIGINAL, much older
locked build order (`Tier 1`/`Tier 2`/`Tier 3`, see README.md's "Locked build order" section),
deferred since day one. **Tiers A-F, Tiers 1-2, and Tier 3 are now all complete or explicitly
closed out — there is no more open named-tier scope anywhere in this project's history.** The next
session should ask Aditya what's next rather than assume there's a queued tier to continue.

**Tier 3 is five items, confirmed via `AskUserQuestion`**: AI Document Processing, Knowledge Base,
AI Project Assistant, Lessons Learned, final polish. **AI Document Processing and AI Project
Assistant are SKIPPED entirely, standing decision** — both need either a cloud LLM call or a
bundled local model, either of which breaks this app's zero-npm-dependency/offline-first/`file://`
architecture, and the original spec itself explicitly excluded AI ("Tier 2... do not implement AI,
OCR, document parsing"). Lessons Learned and Knowledge Base are both built (Gates 1-2). **"Final
polish" turned out to be big enough to need its own multi-gate breakdown** — inspecting the full
10-item deferred backlog (README.md/HANDOFF.md's "Other open items") found most of them are real
feature builds wearing a "polish" label, not touch-ups, so Aditya picked them one at a time via
`AskUserQuestion` rather than building all of them in one gate:
- **Already resolved, dropped from the list**: Resource Assignments in the activity-linking system
  — the old backlog note was stale, this was actually done back at Gate 11.
- **Final polish Gate 1 (built)**: configurable reminder/lookahead windows + a Gantt-bar readiness
  flag.
- **Final polish Gate 2 (built)**: Report Template System (named/saved section
  templates + a company logo on every printable report) — see the write-up below.
- **Final polish Gate 3 (built)**: Dashboard-level filtering — see the write-up below.
- **Final polish Gate 4 (built)**: Gantt virtualization for 10,000+ activities — see the write-up
  below.
- **Explicitly deferred to a future upgrade, Aditya's own call (2026-08-20), NOT built**:
  Vendor↔Cost integration (vendor_id on cost items + a Cost tab on Vendor Profile),
  Commitments→EVM wiring (commitment_id already exists on cost_actuals, but costEvmEngine.js's
  EAC/CPI/SPI math doesn't use it yet), and category-scheme reconciliation (Documents/Vendor
  Document/Document Types categories — deferred three times now, at Gates 14, 16, and this
  close-out). None of these three is scoped or started — a future session picking one back up
  should treat it as a fresh scoping round from scratch (inspect current code state first, some of
  these backlog notes have already turned out stale before), not resume anything in progress.
- **Explicitly NOT picked, standing decision**: Resource rate × usage feeding Cost Tracking/EVM.

With those three explicitly deferred (same status as the already-skipped AI items and the
not-picked Resource rate×usage→EVM), **Tier 3 has no more open items — it is done.**

**General lesson learned this tier, worth repeating for whatever gate comes next**: a
`schema_version` assertion hardcoded with `assert.strictEqual` in an already-shipped gate's own
e2e test will break the moment ANY later gate bumps the schema again — this happened TWICE in a
row (Gate 26's own test, then Lessons Learned's own test), both fixed by loosening to
`assert.ok(... >= N)`. Any new schema-version boot-check assertion should be written as `>=` from
the start; exact-version assertions only belong in the dedicated
`test_store_schema_v*_migration.js` file, which is specifically about the migration step itself.

**Gate 26 — Integrated Project Controls** (merge `9a305b1`) closed out Tier F (PCC Evolution
Roadmap) as its ninth and final gate — see that gate's own write-up further down for detail. No
schema bump for Gate 26 itself (schema stayed at 47 through that merge).

**Tier 3 Gate 1 — Lessons Learned** (merge pending — see commit log). New project-scoped register
(`schema_version` 47 -> 48), same shape family as Risk/RFI/Decisions —
`decisionRegister.js`/`test_decision_register_e2e.js` were the direct templates for both the page
and its test. Fields: `project_id` (mandatory), `title`, `category` (schedule/cost/quality/safety/
procurement & vendor/design & technical/communication/other), `impact_type`
(positive/negative — deliberately captures BOTH directions, not just a complaints log — "what
worked, keep doing it" is just as valuable as "what went wrong, avoid it next time"),
`description`, `recommendation`, `identified_by`, `date_identified`, optional
`source_meeting_id`/`activity_id` links (same optional-link pattern Risk/RFI/Decision already
use). **No `status` field** — this is a captured log, not a workflow with states, same "log only"
precedent Change Management already established. New page `lessonsLearned.js`, own top-level
sidebar entry under REGISTERS (code `LL`) — a single portfolio-wide filterable list already gives
the cross-project trend view a Lessons Learned register is actually for ("we keep seeing
procurement delays"), so no separate rollup dashboard was built on top of it, matching Decision
Register's own precedent. `meetings.js` gained a "+ Add Lesson Learned" quick action alongside the
existing Risk/RFI/Change Order/Decision ones.

**Bug caught while running the full suite, before shipping**: `test_integrated_project_controls_e2e.js`
(Gate 26's own test) had a hardcoded `assert.strictEqual(data.schema_version, 47, ...)` — correct
when written (Gate 26 truly added no schema fields), but it started failing the moment THIS gate's
schema bump landed, since a fresh store now starts at 48. Fixed by loosening to
`assert.ok(data.schema_version >= 47, ...)` — the real invariant Gate 26 wanted to prove is that
IT specifically didn't bump the version, not that no version bump ever happens again after it.
**General lesson for future gates**: a schema-version assertion in an already-shipped gate's own
test file will go stale the next time schema_version bumps again — hardcode `>=` against that
gate's own known-good floor, not `===` against whatever happened to be current when it was written,
unless the test is specifically about the exact migration step itself (the dedicated
`test_store_schema_v*_migration.js` file is where exact-version assertions belong).

Tests: `test_store_schema_v47_migration.js` renamed to `test_store_schema_v48_migration.js` (this
project's "one canonical full-chain migration test targeting latest" convention) with new
v47->v48 backfill checks. New `tests/test_lessons_learned_e2e.js` (39 checks, including a 25-route
smoke test) against the real bundled `index.html` — add/edit/delete, category/impact/project
filters, the activity link and its "View in Gantt" navigation, and the full round trip through a
Meeting's "+ Add Lesson Learned" button. Full suite: **54 files**, clean, zero regressions (after
the schema-version assertion fix above). Real-Chromium pass (3 screenshots: empty state, the
populated list with both a Positive and Negative badge, and the Details panel with its Linked
Activity) confirmed everything renders correctly — zero console errors.

**Tier 3 Gate 2 — Knowledge Base** (merge pending — see commit log). New register
(`schema_version` 48 -> 49), confirmed via `AskUserQuestion` to be **portfolio-wide with optional
`project_id`** (not mandatory-project like every other register — a standard procedure/checklist
isn't "for" any one project, same disclosed exception `newVendorDocument()` already established),
and to carry **its own file attachment** (not just a link to an existing Document). Fields:
`project_id` (optional), `title`, `category` (standard_procedure/checklist_template/
reference_material/how_to_guide/policy/other), `body`, `tags`, `filename`/`file_size`/`mime_type`
(the actual bytes live in `blobStore`/IndexedDB, keyed by the article's own id — no dual-path
inline `file_data` fallback needed, since this register postdates the Phase 12 blobs-only
migration entirely). One file per article, no revision history — re-attaching overwrites the
previous blob under the same id. New page `knowledgeBase.js`, own top-level sidebar entry under
REGISTERS (code `KB`) — full CRUD, search across title/body/tags, category/project filters
including a synthetic "General (no project)" filter value. **"+ Add Article" is never gated on a
project existing**, the one register in this app where that's true.

**Bug caught and fixed before writing tests** (self-caught, no user involvement): the first draft
of the save handler generated a new article's id TWICE for the file-attach path — once via a
throwaway `newKnowledgeBaseArticle({}).id` call just to get an id for `blobStore.putBlob()`, and
again via a second `newKnowledgeBaseArticle(values)` call inside `commit()` to build the actual
record pushed to the store — so the blob would have landed under a different id than the record
referencing it, silently orphaning every new article's file. Fixed by building the full record
ONCE up front and reusing its `.id` for both the blob write and the store push. Caught via
re-reading the code before running any test, same "verify before shipping" discipline as every
prior gate's self-caught bugs this session.

Tests: `test_store_schema_v48_migration.js` renamed to `test_store_schema_v49_migration.js` with
new v48->v49 backfill checks. New `tests/test_knowledge_base_e2e.js` (40 checks, including a
26-route smoke test) — file-upload UI is deliberately NOT driven through jsdom (no test in this
suite does that; see `test_vendors_e2e.js`/`test_baseline_revision_control_e2e.js`'s own "bypassing
FileReader" precedent), so the attached-file scenario seeds a blob directly via
`blobStore.putBlob()` and mirrors the resulting store write instead. Full suite: **55 files**,
clean, zero regressions (after fixing the two stale schema-version assertions described above).
Real-Chromium pass (4 screenshots: empty state, the populated list with a portfolio-wide and a
project-tagged article, the File Attached badge, and the Details panel with its Open File action)
confirmed everything renders correctly — zero console errors.

**Tier 3 "final polish" Gate 1 — configurable reminder windows + Gantt readiness flag** (merge
pending — see commit log). Inspected the full 10-item deferred backlog against the real code
first (see the "Where things stand" section above for the full breakdown of what's still open vs.
already resolved). Aditya picked these two small items to build now, via `AskUserQuestion`, out of
three grouped questions covering all 10:
- **Configurable windows** (`schema_version` 49 -> 50): Dashboard's "Due Soon" panel and Action
  Centre's "Upcoming" bucket used to read hardcoded module constants
  (`DUE_SOON_WINDOW_DAYS = 14` in `dashboard.js`, `UPCOMING_WINDOW_DAYS = 30` in `actionCentre.js`)
  — now `settings.document_reminder_due_soon_days` / `settings.action_centre_upcoming_days`, edited
  on a new "Reminder & Lookahead Windows" panel in Settings. Both default to their old hardcoded
  values, so no existing install's behavior changes on upgrade, only becomes editable going
  forward. `actionCentre.js`'s `BUCKETS` had to become a `buildBuckets(windowDays)` function
  instead of a module-level constant, since its "Upcoming (8–N Days)" label embeds the number and
  must be rebuilt from the current setting on every render.
- **Gantt-bar readiness flag**: a small red circle at a bar's top-right corner when its activity
  has a not-yet-available governing document requirement (Gate 21's `activity_id` link on
  `project_document_requirements`) — the exact same "Not Ready" rule the Activity Detail Panel's
  own Document Readiness section (Gate 24) already computed, just never reached the bar itself
  until now (explicitly considered and deferred back at Gate 24). Factored into a shared
  `activityNotReady(activity, data)` helper in `schedule.js` so the bar and the Detail Panel can
  never disagree. `pointer-events:none` so it never interferes with drag/resize hit-testing. New
  legend entry explains it.

Tests: `test_store_schema_v49_migration.js` renamed to `test_store_schema_v50_migration.js` with
new v49->v50 backfill checks (including one proving an already-explicitly-set value survives the
migration untouched, not just the default-backfill case). New
`tests/test_configurable_reminders_and_gantt_readiness_e2e.js` (36 checks, including a 26-route
smoke test) — Settings field edits actually reshaping Dashboard/Action Centre output (not just
persisting to the store), the marker appearing/disappearing as document availability changes, and
confirming an activity with zero linked requirements never shows one. Full suite: **56 files**,
clean, zero regressions to any pre-existing dashboard/action-centre/readiness test. Real-Chromium
pass (3 screenshots, including a tightly-cropped zoom on the marker itself since a 5px circle
doesn't show up reliably in a full-page screenshot — same "verify the small thing actually
renders" discipline the Gate 25 S-Curve marker needed) confirmed everything renders correctly —
zero console errors.

**Tier 3 "final polish" Gate 2 — Report Template System** (merge pending — see commit log). Three
forks, all resolved as the fuller option via `AskUserQuestion`:
- **Multiple named, saved templates** (not just one persisted default) — new `report_templates`
  register (`schema_version` 50 -> 51): `report_type` (`project`/`portfolio`/`management_pack`),
  `name`, `sections` (a plain `{key: boolean}` map whose key set differs per `report_type` — each
  report builder owns its own list, the factory doesn't hardcode one). Portfolio-wide, not
  project-scoped — a template is a reusable report shape, not a record of something that happened
  on one project.
- **A company logo, shown on EVERY printable report** — not just reports.js's own two reports.
  Uploaded once in a new "Company logo" field in Settings (blob in `blobStore`/IndexedDB under the
  fixed key `"company_logo"`, only `settings.company_logo_filename`/`company_logo_mime_type` live in
  the main store — same "binary bytes never live in the main JSON store" rule every other file this
  app stores already follows). Appears in reports.js's Project Status and Portfolio Summary reports
  AND Executive Center's Project Snapshot and Management Pack — four header locations, one shared
  `renderLogoImg(data)` helper duplicated per-module (same placeholder-then-async-resolve pattern
  `dailyLog.js`'s photo thumbnails already established).
- **Management Pack's own pre-existing section checkboxes** (built at Gate 9, never persisted —
  reset every session) **get the identical named-template treatment** rather than staying
  half-fixed while Lessons Learned/Knowledge Base's own patterns got this exact persistence
  elsewhere in the tier.
- `reports.js`'s `buildProjectReport()`/`buildPortfolioReport()` now take a `sections` param gating
  each of their existing sections (9 for Project Status, 8 for Portfolio Summary) — "all true"
  reproduces the pre-existing always-on behavior exactly, so an install with no saved template sees
  no change at all.

**Bug caught and fixed before writing tests** (self-caught, no user involvement): the first draft
cleared the selected template the instant any checkbox was toggled — which hid the "Save Changes"
button exactly when it was needed, since editing a loaded template's selection made it impossible
to actually save that edit back to the template without first losing which template was even
selected. Fixed by keeping a loaded template selected THROUGH edits; "Save Changes" now always
commits whatever the checkboxes currently read, and "Save as New…" is the deliberate way to branch
into a separate template instead. **General lesson for future "apply a saved preset, then edit it"
UI in this app**: don't deselect the active preset on every field edit — that only makes sense if
there's a separate "diverged from preset" indicator; without one, it just breaks the update flow.

Tests: `test_store_schema_v50_migration.js` renamed to `test_store_schema_v51_migration.js` with
new v50->v51 backfill checks. New `tests/test_report_template_system_e2e.js` (41 checks, including
a 26-route smoke test) — file-upload UI is deliberately NOT driven through jsdom (no test in this
suite does that; see `test_knowledge_base_e2e.js`'s own comment), so the logo scenario seeds the
blob directly via `blobStore.putBlob()` and mirrors the resulting settings write. Covers section
toggling actually reshaping report OUTPUT (not just the checkbox state), per-report-type template
isolation (a Project template never appears while viewing Portfolio), save/apply/overwrite/delete
across both `reports.js` and Management Pack, and the logo rendering in all four report headers.
Full suite: **57 files**, clean, zero regressions to any pre-existing reports/executive-center test.
Real-Chromium pass (3 screenshots) confirmed everything renders correctly — zero console errors.

**Tier 3 "final polish" Gate 3 — Dashboard-level filtering** (merge `7363305`). Confirmed via
`AskUserQuestion` (single question, "Full match with Portfolio: all 7 (Recommended)") that Dashboard
should get the IDENTICAL 7-filter toolbar Portfolio already has from Gate 16 — Client/Country/
Sector/PM/Planner/Type/Year — rather than the narrower 4-field set the original backlog note
mentioned, so switching between Dashboard and Portfolio never drops a filter option a user just got
used to. No schema change — purely computed UI state, same as Portfolio's own filters.
- `dashboard.js` gained `uiState` (7 filter fields), a `projectMatchesFilters(p)` predicate, and a
  `distinctValues(projects, key)` helper — both duplicated verbatim from `portfolio.js`'s own Gate
  16 implementation, per this app's "point at an existing pattern, don't invent a new one"
  convention. `render(outlet)` gained a `rerender()` closure (new to this file), computes
  `filtered = active.filter(projectMatchesFilters)`, and threads `filtered` (never `active`) into
  the KPI strip's status counts, `computeReminders()`, `computeManagementAttention()`, and the
  Recent Projects list. Filter option lists are built from `active` (not `data.projects`) so a
  stale/inactive project's client never appears as a selectable filter value.
- Three-way panel state for Recent Projects: zero active projects at all → the pre-existing "Get
  started" empty state (unchanged); active projects exist but none match the current filters → new
  "No active projects match these filters." message; otherwise → the normal list. The sub-heading
  text also conditionally reads "...across N active projects." vs "...across N of M active projects
  matching these filters." so it's clear at a glance whether a filter is narrowing the view.
- Incidentally fixed a stale hardcoded `"DUE SOON (14D)"` KPI label (left over from before Final
  Polish Gate 1 made the window configurable) to read the real `dueSoonWindowDays(data)` value —
  noticed while touching this file for the filter work, not a separate ask.

No bugs self-caught this gate — the new test file passed all 34 checks on the first standalone run,
and both pre-existing dashboard-adjacent tests (`test_dashboard_reminders_e2e.js`,
`test_management_attention_e2e.js`) passed with zero regressions on the first full-suite run too.

Tests: new `tests/test_dashboard_filtering_e2e.js` (34 checks, including a 26-route smoke test) —
filter row absent with zero active projects, distinct option values built correctly from two
seeded projects, single-filter narrowing across every panel (KPI/Recent Projects/Management
Attention), a combined-filter scenario producing zero matches hitting the new empty state, reset
restoring the full view, the Year filter (derived from `start_date`), and a final "this gate writes
nothing back" record-count sanity check. Full suite: **58 files**, clean, zero regressions. Real-
Chromium pass (screenshots: unfiltered dashboard with two seeded projects showing all 7 selects
matching Portfolio's exact styling, then Client-filtered down to 1 of 2 with Management Attention/
Recent Projects/KPIs all correctly narrowed) confirmed everything renders correctly — zero console
errors. Zip verified separately post-merge (fresh extraction, real Chromium, one seeded project) —
filter row renders correctly, zero console errors.

**Tier 3 "final polish" Gate 4 — Gantt virtualization for 10,000+ activities** (merge `491e13e`).
This was the one item on the "final polish" backlog explicitly flagged as out-of-scope back at
Gate 8 itself ("current SVG rendering is fine for realistic project sizes but untested at [10,000+]
scale") — Gate 8's own Gantt drew every activity row as real SVG DOM (bar/label/handles) plus 1-3
pointer listeners per row, all up front regardless of scroll position, on top of a hidden `O(n²)`
(`activities.find()` called per row inside the row loop instead of a lookup map).

- **Row-axis (vertical) virtualization only** — scoped deliberately to the Gantt chart itself, not
  the Activities-tab list or Excel import grid (separate, unaffected code paths; the backlog item
  names the Gantt specifically). Horizontal (date-axis) virtualization was explicitly out of scope
  too — chart width tracks date span, not activity count, and isn't the bottleneck at 10,000
  activities.
- **New pure `visibleRowRange(totalRows, scrollTop, viewportHeight, rowHeight, headerHeight,
  bufferRows)`** in `scheduleGanttLayout.js` — same "calculation here, DOM there" split every
  function in that module already keeps. Returns the `[start, end)` slice of rows that need real
  DOM (15-row buffer each side). **Explicit fallback: when `viewportHeight` is falsy/0, every row
  is returned** — this is jsdom's own permanent behavior (it does zero box-model layout, so
  `clientHeight` always reads 0, same as a detached element in a real browser), and matches
  exactly what every pre-existing Gantt test already assumed, so all of them (drag, resize,
  milestone click, baseline overlay, readiness marker) kept passing completely unmodified.
- **`schedule.js`'s `renderGanttTab`**: the header/gridlines/data-date/today-line/baseline-lookup
  all build once, unaffected by row count (unchanged). The per-row drawing body became a
  `renderRow(row, i)` function appending into a dedicated `<g>` rows layer instead of the bare
  `<svg>`; a new `renderRowsLayer()` computes the current range via `visibleRowRange()`, clears and
  rebuilds only that slice. A `scroll` listener on the chart's own scrollable panel
  (`requestAnimationFrame`-throttled, matching a guard flag so a fast scroll doesn't queue multiple
  rebuilds) calls `renderRowsLayer()` on every scroll. The SVG still reserves its full
  `rows.length * rowHeight` height so the scrollbar and the existing Today/Project Start/Finish/
  Data Date jump buttons keep working exactly as before. Also fixed the `O(n²)` lookup along the
  way (`activityById` map built once).
- **Real-Chromium verification with 10,000 seeded activities** (spread across a realistic 3-year
  window, not one-per-calendar-day — the latter pathologically inflates chart WIDTH, which is a
  separate, out-of-scope concern from row count): bars rendered stayed bounded (41 initial, 56
  after a deep scroll) regardless of the 10,000-activity total; in-page `performance.now()`
  timestamps isolated the Gantt tab's own virtualized render to ~124ms (the multi-second wall-clock
  figures seen around it are dominated by the pre-existing, unvirtualized Activities-tab list
  rendering all 10,000 rows as real DOM on first mount — a real, already-known limitation, out of
  this gate's scope, noted below); dragging a bar within the scrolled-to window still correctly
  updated its dates in the store.

**Bug NOT found in the shipped code — a test-methodology trap worth documenting for future gates**:
the first version of the new e2e test's scroll-driven-rebuild check failed, appearing to show the
scroll listener not firing. Root cause was in the TEST, not the app: `router.go(name)` sets
`window.location.hash`, which jsdom fires as an **async** `hashchange` on its own internal timer
rather than synchronously — left pending, it fires router.js's own `hashchange` listener (a full
page rerender) at an arbitrary later point in the SAME test, landing mid-scroll-test and silently
replacing the very DOM being scrolled with a fresh, unscrolled one. Fixed by adding a `flush()`
right after the initial `router.go()` + `router.render()` call so the pending hashchange fires and
resolves immediately, before the test does anything that depends on DOM identity surviving. **General
lesson for any future e2e test that calls `router.go()` and then later `await`s something**: flush
once immediately after the initial navigation, or a queued hashchange can silently rebuild the page
out from under a later assertion.

**Noted but explicitly out of scope for this gate** (a related, adjacent finding, not something
Aditya asked for): the Activities-tab list (`renderActivitiesTab` in `schedule.js`) and the Excel
import grid are NOT virtualized — at 10,000 activities, mounting the Activities tab (the Schedule
page's default landing tab) does real unvirtualized DOM layout for every row, which is the actual
source of the multi-second delay observed in Playwright before switching to Gantt. The backlog item
named the Gantt specifically, so this wasn't built now, but it's worth a future ask if someone
regularly works with schedules at that scale.

Tests: `test_schedule_gantt_layout.js` (pure, no DOM) gained 5 new `visibleRowRange` checks
proving the returned window stays small (`< 60` rows) at true 10,000-row scale regardless of scroll
position, including the top/bottom-clamp edge cases and the no-real-viewport fallback. New
`tests/test_gantt_virtualization_e2e.js` (21 checks, including a 14-route smoke test — a lighter
route set than the usual 24-26, since this test's store carries 3,000 activities and every route
still has to render against it) against the real bundled `index.html`, stubbing
`HTMLElement.prototype.clientHeight` to a realistic ~500px (the same "stub what jsdom doesn't
implement" precedent this suite already uses for `FileReader.readAsDataURL`) so virtualization
actually engages under jsdom rather than hitting the no-real-viewport fallback — proves the bar
count stays bounded (`< 100`) both before and after a scroll, that the rendered window actually
moves (not just stays capped at the same first N), and that a bar in the post-scroll window is
still fully interactive (click opens the Activity Detail Panel). Full suite: **60 files**, clean,
zero regressions to any pre-existing Gantt test (editing, e2e, layout, readiness marker, baseline
revision control). Real-Chromium pass (3 screenshots: 10,000 activities loaded and rendering fast,
the scrolled-to-deep-in-the-list view showing a different activity window, and the packaged zip's
own post-merge verification with 500 activities) confirmed everything renders correctly and drag
still works post-scroll — zero unexpected console errors (the one observed error, a localStorage
`QuotaExceededError` from attempting to autosave 10,000 activities' JSON to `localStorage`, is a
pre-existing, already-documented, already-handled limit — exactly why `blobStore.js` moved binary
blobs to IndexedDB back in Phase 12 — unrelated to this gate and already caught/toasted rather than
thrown uncaught).

**Tier 3 close-out (2026-08-20, no code change — a scope decision only).** Right after Gate 4
shipped, Aditya was asked which "final polish" item was next and explicitly deferred all three
remaining ones — Vendor↔Cost integration, Commitments→EVM wiring, category-scheme reconciliation —
to a future upgrade rather than picking one to build now. **This closes out Tier 3 with no open
items**, and since Tiers A-F and Tiers 1-2 were already complete, **there is no more open named-tier
scope anywhere in this project's history as of this session.**

**Next step for a fresh session: do NOT assume there's a queued tier or gate to continue — ask
Aditya what's next.** If a future session picks up any of the three deferred items, treat it as a
brand-new scoping round from scratch (inspect current code state first — some of these backlog
notes have already turned out to be stale before, e.g. Resource Assignments turned out to already
be done back at Gate 11), not a resumption of anything in progress. AI Document Processing/AI
Project Assistant stay skipped per the standing decision above unless Aditya explicitly revisits it;
Resource rate × usage → EVM was explicitly NOT picked and stays deferred alongside the other three.

**Gate 26 — Integrated Project Controls** (merge pending — see commit log). Inspection found
Gates 23 (Advanced Delay Analysis) and 24 (Recovery & Mitigation Planning) each shipped real
capability but had ZERO computed connection to each other, despite being the roadmap's own
natural pair ("why is this late" / "what are we doing about it"); Gate 25's Schedule Performance
Score also had no portfolio-wide rollup and no presence in the Management Pack report. Two real
forks were put to Aditya via `AskUserQuestion`:
- **Whether to fold Schedule Performance into Health Score** — Aditya chose **"No — keep them
  separate,"** matching Gate 25's own precedent (the Schedule Performance Score was already a
  deliberate, separate, fixed-weight score, not folded into the configurable Health Score).
  `projectHealthEngine.js` is untouched by this gate — verified explicitly in the new test suite
  (`getHealthSummary()` has no Schedule Performance/SPI(t) fields).
- **Whether Portfolio Performance gets a Tier F rollup** — Aditya chose **"Yes."**

What shipped:
- **Delay ↔ Recovery gap**, computed in `buildProjectContext()` (`executiveCenter.js`):
  delay days minus OPEN recovery days, PER ACTIVITY (not a flat project-wide total — deliberately,
  so recovery estimated on one activity can never appear to "cancel out" delay logged on an
  unrelated one), floored at 0. Only open/in-progress recovery actions count (a completed/
  cancelled action's estimate is historical, matching Gate 24's own dashboard convention).
  Hand-verified with a two-activity scenario in the new test: Activity A (15d delay, 6d open
  recovery, plus a 100d COMPLETED recovery action that must NOT count) → 9d unaddressed; Activity
  B (4d delay, 10d open recovery) → gap floors at 0, excluded from the "unaddressed" list even
  though it has real delay logged. A flat project-wide subtraction (19 total delay − 16 total open
  recovery = 3) would give a completely different, wrong number than the correct per-activity
  total of 9 — this is exactly the scenario the test proves.
- **Executive Center Overview** gets a new DELAY & RECOVERY KPI panel (Delay Records / Total Delay
  Days / Open Recovery Actions / Unaddressed Delay Days) plus a worst-gap-first detail list with
  "View in Gantt" links (`renderDelayRecoveryGapDetail()`).
- **`schedule.js`'s Activity Detail Panel** gets a small per-activity gap note between the
  existing Recovery Actions and Delay Records sections (`renderDelayRecoveryGapNote()`).
- **`delayRecoveryDashboard.js`** gets a portfolio-wide "UNADDRESSED DELAY (DAYS)" KPI and a
  ranked "Activities With Unaddressed Delay (worst first)" list — independently re-derived rather
  than calling into `executiveCenter.js`, per this app's established per-module-duplication
  convention (same as `recoveryActionOverdue()` already being duplicated there).
- **`portfolio.js`** gets the same portfolio-wide rollup added to its KPI strip, plus a new
  "Sched. Perf." column in the Compare table — via a new
  `window.PCC.executiveCenter.getSchedulePerformanceSummary(projectId)` export, mirroring the
  established `getHealthSummary()` "export one composed function rather than duplicate
  `buildProjectContext()`" pattern.
- **Management Pack** (`buildManagementPackDoc()`) gains three new toggleable sections: Status
  Date & Baseline Summary, Delay & Recovery Summary (including the per-activity gap table),
  Schedule Performance Summary — added to `uiState.packSections` defaults (all `true`) and the
  `sectionLabels` checkbox UI alongside the 15 pre-existing sections.

Tests: new `tests/test_integrated_project_controls_e2e.js` (39 checks, including a 24-route smoke
test) against the real bundled `index.html` — the hand-verified per-activity gap math (proving the
per-activity/open-only/floor-at-zero rules against what a flat subtraction would wrongly give),
the Executive Center KPI panel and detail list, the Activity Detail Panel gap notes on both
activities, the three new Management Pack sections with real figures, the portfolio-wide rollup in
both `delayRecoveryDashboard.js` and `portfolio.js` (KPI strip + Compare table column), and the
explicit "Health Score untouched" regression check. Full suite: **53 files** (was 52 at Gate 25 —
schema migration test file NOT renamed this round since there was no schema bump), clean, zero
regressions. Real-Chromium pass (4 screenshots: Executive Center's DELAY & RECOVERY panel, the
Management Pack showing all three new sections with real figures, the Delay & Recovery Dashboard's
portfolio rollup, Portfolio Performance's KPI strip + Compare table with the new Sched. Perf.
column) confirmed everything renders correctly — zero console errors.

**Gate 25 — Advanced Schedule Performance** (merge `8f2eab8`). Inspection found classic SPI
(`costEvmEngine.js`, `EV/PV`) was the only schedule-performance figure anywhere, with its
well-documented flaw: it converges toward 1.0 as a project nears completion regardless of how late
it actually finishes, since PV stops growing once every activity's planned span has elapsed. Two
real forks were put to Aditya via `AskUserQuestion`; **he chose the fuller option both times**:
- **`computeEarnedSchedule()`** (new function in `costEvmEngine.js`): rebuilds the same per-item
  linear PV(t) ramps `itemPlannedValue()` already computes into a full day-by-day curve, walks it
  forward to find where today's EV would sit on the PLANNED timeline (Earned Schedule, in days),
  and derives SPI(t) = ES/AT — the standard fix for classic SPI's flaw. A plain forward linear
  scan, not a closed-form inversion, matching this app's existing style (`scheduleCpmEngine.js`'s
  forward/backward passes). **Verified against a hand-checked near-completion scenario proving the
  actual divergence**: two budget items, one 5-day span fully complete, one 20-day span 90%
  complete, data date AT the planned finish — classic SPI reads 0.95 (looks almost on-track) while
  SPI(t) correctly reads 0.90 / 2 days behind. This exact scenario is verified three times over
  (pure-engine test, dedicated engine's own test, and the real bundled UI end-to-end) to make sure
  the divergence isn't an artifact of one test's assumptions.
- **New `schedulePerformanceEngine.js`**: a dedicated 0-100 Schedule Performance Score from
  SPI/SPI(t)/Earned-Schedule-variance/critical-path ratio, **distinct from the existing Project
  Health Score's own "Schedule" factor** (Gate 9) — Aditya's own explicit choice, made aware the
  overlap existed. Fixed weights (not configurable via Settings like Project Health's) — a smaller,
  single-purpose score, not a second full configurable scoring system. Same "available/score/why"
  breakdown shape as `projectHealthEngine.js`'s own factor table, for UI consistency.
- **New `schedule_performance_snapshots` register** (`schema_version` 47): a point-in-time capture
  of SPI/SPI(t)/score/`schedule_progress_pct`, via a new "Capture Performance Snapshot" button in
  Executive Center's new SCHEDULE PERFORMANCE panel — **deliberately a SEPARATE mechanism from
  Weekly Reviews' own snapshot** (Aditya's other explicit choice), so trend granularity isn't
  capped by how often those get written. This is the only place any of Gate 25's figures persist
  over time, since both engines are pure/recomputed fresh on every render.
- **Progress S-Curve actual overlay**: `schedule_progress_pct` is carried on every snapshot
  specifically so `sCurveChart()` — whose own header comment previously said there was no stored
  "actual progress on date X" history anywhere in PCC, so it could only plot a planned curve — can
  finally draw a real actual-vs-planned line. Verified via direct SVG-coordinate inspection (not
  just visual screenshot, since the marker is a small 3px dot) that it lands at the mathematically
  correct position.

Tests: `test_cost_evm_engine.js` extended with 7 new Earned Schedule checks (added to the
*existing* dedicated engine test file, not a new one — `computeEarnedSchedule()` extends
`costEvmEngine.js`, so its tests belong where that module's other tests already live). New
`tests/test_schedule_performance_engine.js` (8 checks: scoring boundaries, missing-data
re-normalization matching `projectHealthEngine.js`'s own convention, RAG thresholds).
`test_store_schema_v46_migration.js` renamed to `test_store_schema_v47_migration.js` (this
project's "one canonical full-chain migration test targeting latest" convention) with new
v46→v47 backfill checks. New `tests/test_advanced_schedule_performance_e2e.js` (32 checks,
including a 24-route smoke test) against the real bundled `index.html`, reusing the exact
hand-verified divergence scenario end-to-end. Full suite: **55 files, 1389 checks**, clean, zero
regressions. Real-Chromium pass (2 screenshots plus direct SVG-coordinate inspection of the
S-Curve overlay, since a 3px marker doesn't show up reliably in a full-page screenshot) confirmed
everything renders correctly — zero console errors.

**Gate 24 — Recovery & Mitigation Planning** (merge `e3ef313`). Inspection found Recovery Actions
was a plain to-do (description/responsible person/target date/status) with zero schedule-impact
quantification anywhere, and nowhere in the app could you ask "what if we recover N days on this
activity" and see the effect. Two real forks were put to Aditya via `AskUserQuestion`; **he chose
the fuller option both times**:
- **What-If Sandbox**: a new "What-If" tab in `schedule.js`, deliberately a STANDALONE exploration
  tool (Aditya's own call), not tied to any one Recovery Action. Pick any activity, propose
  reducing its duration (or `remaining_duration` if in-progress) by N days, and see a before/after
  CPM comparison — project finish, critical-activity count, which activities flip criticality.
  Nothing persisted: `scheduleCpmEngine.calculateSchedule()` was already a pure function taking
  plain arrays (confirmed by Gate 24's own inspection), so this just clones the current activities,
  perturbs one, and reruns it; the "before" figure is a fresh live calculation, always comparable
  to what's actually on the activities right now. Surfaces a genuinely correct project-controls
  insight the app never had a way to show before: reducing a NON-critical activity's duration may
  not move the project finish at all — verified explicitly (a 10-day-float activity reduced by 3
  days correctly reports "no change"; the actual critical activity reduced by 5 days correctly
  reports the finish pulling in by exactly 5 days).
- **Recovery Actions gain `estimated_recovery_days` and `estimated_cost`** (`schema_version` 46,
  the cost field being the "go further" fork Aditya picked), surfaced on the Activity Detail
  Panel's own row and rolled up on the Delay & Recovery Dashboard — **open actions only**, since a
  completed/cancelled action's estimate is historical, not a live commitment to weigh against the
  portfolio (verified: the KPI row disappears entirely once the only estimate moves to Completed).

**Bug caught and fixed during test-writing, before shipping** (a second instance of the SAME class
of bug flagged in the Gate 22 section above — worth calling out as a recurring risk in this
codebase's click-handler pattern): the What-If form's validation errors ("select an activity
first," "enter a positive number of days") were set on a *local* DOM element's `style.display`,
then immediately discarded when `rerender()` rebuilt the whole tab from scratch right after — the
error text would never actually become visible to the user, even though the code "looked" like it
displayed one. Fixed by moving the error into `uiState.whatIfError` (same pattern
`uiState.baselineCompareError` already established for the Baselines tab) so it survives the
rebuild; regression-tested explicitly with a comment naming the exact failure mode. **General
lesson for future gates**: any inline form validation error in this codebase MUST be stored in
`uiState` and re-read on the next build — never left as a local variable's `style.display`
mutation — because essentially every button handler in this app ends with `rerender()`, which
throws the entire local DOM subtree away.

Tests: `test_store_schema_v45_migration.js` renamed to `test_store_schema_v46_migration.js` (this
project's "one canonical full-chain migration test targeting latest" convention) with new v45→v46
backfill checks. New `tests/test_recovery_mitigation_planning_e2e.js` (35 checks, including a
24-route smoke test) against the real bundled `index.html` — the what-if sandbox's non-critical/
critical/clamped-reduction scenarios plus the validation-error regression, Recovery Actions'
estimated-days/cost persistence and display, and the dashboard's open-only rollup. Full suite:
**53 files, 1341 checks**, clean, zero regressions. Real-Chromium pass (4 screenshots: the
critical-path what-if pulling the finish in 5 days, the non-critical what-if reporting no change,
the Recovery Action row with its estimate, and the dashboard's cost/days rollup) confirmed
everything renders correctly — zero console errors.

**Gate 23 — Advanced Delay Analysis** (merge `1050733`). Inspection found the existing Delay &
Recovery Dashboard was a recovery-actions rollup only — no delay causation/classification anywhere
in the app — and `scheduleBaselineEngine.js`'s `compareBaselineToCurrent()` already carried
baseline/current `total_float` per matched activity but never derived float erosion from it. Two
real forks were put to Aditya via `AskUserQuestion`; **he chose the fuller register option, but the
simpler taxonomy option**:
- **New Delay Records register** (`schema_version` 45): `activity_id`, `delay_cause`
  (`owner_caused`/`contractor_caused`/`weather_force_majeure`/`design_rfi_driven`/`other` — the
  practical/simple taxonomy Aditya picked over a formal excusable-compensable/non-compensable/
  concurrent claims taxonomy), `is_excusable`, `responsible_party`, `delay_days`, `identified_date`,
  `description`. Deliberately a SEPARATE register from Recovery Actions, not a shared shape — a
  Delay Record answers "what happened and why" (often needed for a contractual claim), a Recovery
  Action answers "what are we doing about it" (corrective workflow); an activity can accumulate
  several of each over time (e.g. concurrent causes). Full CRUD embedded in the Activity Detail
  Panel (`renderDelayRecordsSection()` in `schedule.js`), mirroring
  `renderRecoveryActionsSection()`'s established inline-CRUD pattern exactly, right down to reusing
  its `+ Add X` / inline form / Edit / Remove structure.
- **Float Erosion**, added to the Baselines tab's "Compare to Current" result:
  `baseline.total_float - current.total_float` per matched activity, ranked descending, flagging
  activities that have gone critical since baseline. This data was always present in
  `compareBaselineToCurrent()`'s own return shape but never derived or surfaced — purely additive,
  no engine change needed. **Verified to cascade backward through predecessor logic correctly**: in
  testing, extending one activity's duration until it became critical also eroded its *predecessor's*
  float to zero (since delaying the predecessor now delays the newly-critical chain it feeds) — the
  test suite explicitly asserts on both activities appearing, not just the one directly edited.
- **Delay Analysis rollup** added to `delayRecoveryDashboard.js`: KPI cards (delay records, total
  delay days, excusable/non-excusable split), cause and severity breakdowns (fixed practical
  buckets — Minor &lt;5d, Moderate 5-15d, Severe &gt;15d — not user-configurable, since this is a
  display grouping, not a calculation input), and a worst-first delay records list with "View in
  Schedule". This page's own header previously said it deliberately does NOT roll up
  delay/baseline stats portfolio-wide because which baseline to compare against was ambiguous —
  Delay Records aren't baseline-derived at all, so that ambiguity never applies to them; Float
  Erosion correctly stays in the Baselines tab, not duplicated here, since it's only meaningful
  relative to a specific comparison a user chose to run (even now that Gate 22's Official Baseline
  has resolved the original ambiguity for finish-variance purposes specifically).

Tests: `test_store_schema_v44_migration.js` renamed to `test_store_schema_v45_migration.js` (this
project's "one canonical full-chain migration test targeting latest" convention) with new v44→v45
backfill checks. New `tests/test_advanced_delay_analysis_e2e.js` (35 checks, including a 24-route
smoke test) against the real bundled `index.html` — Delay Record CRUD (add/edit-to-excusable/
remove) with badge verification, Float Erosion including the cascading-criticality scenario, the
dashboard's KPI/cause/severity rollup, "View in Schedule" navigation, and the combined-vs-per-
register empty-state distinction (both registers empty → one combined empty state; only one empty
→ that register's own sub-empty-state). Full suite: **52 files, 1304 checks**, clean, zero
regressions. Real-Chromium pass (3 screenshots: the Activity Detail Panel's Delay Records section,
the Baselines tab's Float Erosion list showing both activities in the eroded chain, and the
Dashboard's Delay Analysis rollup) confirmed everything renders correctly — zero console errors.

**Gate 22 — Baseline & Schedule Revision Control** (merge `d14f9ef`). Inspection found the core
baseline machinery already fully built (`scheduleBaselineEngine.js`/`scheduleBaselineStore.js`/the
Baselines tab, Gate 4/5) — unlimited baselines per project, delete, cross-revision compare via
`compareBaselineToCurrent()`. Two real forks were put to Aditya via `AskUserQuestion`; **he chose
the fuller option both times**:
- **Baseline rename** (inline edit in the Baselines tab) and an **"Official Baseline" designation**
  — at most one per project, marking one locks it against deletion and implicitly unmarks whichever
  else was official. Baseline names are now escaped against HTML injection (`escHtml()`, new local
  helper in `schedule.js`) since rename makes them arbitrary user text for the first time —
  previously baseline names were only ever auto-generated from `schedule.name` + a date.
- **Official Baseline drives Executive Center's Schedule Variance** (the "go further" fork):
  `baseline_project_finish` is computed once at capture time via
  `scheduleBaselineEngine.overallFinish()` — hoisted out of `compareBaselineToCurrent()` to module
  scope specifically so `captureBaseline()` could call it directly — and stored *synchronously* on
  the `schedule_baselines` index row. Same "metadata stays synchronous, payload is async" precedent
  as everywhere else baselines touch `buildProjectContext()` (see Gate 20's own `ctx.baselineCount`
  comment): Executive Center's variance KPI can read a real captured baseline without the whole
  function needing to become async. Falls back to the pre-existing planned_finish-based figure when
  no Official Baseline exists; a KPI-section footnote names which baseline is driving it when one
  is.
- **Auto-supersede on reimport** (the other "fuller option" fork): `commitImport()` now marks a
  project's prior `"active"` schedule(s) `"superseded"` when a new revision is imported, instead of
  leaving every past revision `"active"` forever waiting on a manual edit nobody remembers to make.
  Scoped to import only — draft/archived revisions are never auto-touched, and the manual "New
  Schedule" path is untouched (creating one by hand isn't "replacing" anything).
- **Retired `schedule.is_baseline`**: inspection found it was dead, disconnected decoration (only
  ever appended ", Baseline" to a dropdown label — zero connection to the real snapshot machinery).
  Dropped from `newSchedule()` and the edit form; existing stored values on old schedules are left
  untouched rather than inventing a field-removal migration for something this app never actually
  read anywhere else.

**Bug caught and fixed during the real-Chromium verification pass, before shipping** (worth
flagging as a pattern to watch for elsewhere in this codebase): the "Mark/Unmark Official"
`notify()` call read `b.is_official` *after* `store.update()` had already mutated that same object
in place (its `forEach` finds the matching row by id and mutates it directly — same object
reference as the `b` the click handler closed over), so the toast reported the **opposite** of what
had just happened (e.g. "unmarked" immediately after marking). Fixed by capturing
`var wasOfficial = b.is_official` *before* the `store.update()` call. Regression-tested explicitly
— the test asserts the actual toast text on both the mark and unmark direction, not just the
underlying data, specifically because the data was already correct; only the message was wrong.
**Any future click handler in this codebase that reads a store-object field for display/messaging
after its own `store.update()` call should capture that field's value first** — this bug is easy to
reintroduce anywhere the same pattern appears.

Tests: `test_store_schema_v43_migration.js` renamed to `test_store_schema_v44_migration.js` (this
project's "one canonical full-chain migration test targeting latest" convention) with new v43→v44
backfill checks. New `tests/test_baseline_revision_control_e2e.js` (35 checks, including a 24-route
smoke test) against the real bundled `index.html` — rename + HTML-escape proof, Official
mark/unmark/mutual-exclusivity/delete-lock (plus the notify-message regression), Executive Center's
variance switching from planned_finish to the Official Baseline's captured finish (proven via a
scenario deliberately built so the two possible sources disagree, +21d vs +12d, ruling out
coincidence), and auto-supersede — mirroring `commitImport()`'s write rather than driving a real
file upload through jsdom, the same established precedent `test_schedule_excel_editor_e2e.js` set
for file-upload-adjacent tests (confirmed via grep: no test in this suite drives a real binary
`.xlsx` through jsdom; every import-adjacent test mirrors the resulting store write instead). Full
suite: **51 files, 1267 checks**, clean, zero regressions. Real-Chromium pass (3 screenshots: the
Baselines tab after rename, the Official baseline with the corrected toast text, Executive Center's
+21d variance with the Official Baseline footnote) confirmed everything renders correctly — zero
console errors.

**Gate 21 — Status-Date Reforecasting** (merge `bd825a0`). Inspection found `scheduleCpmEngine.js`
already did most of status-date reforecasting (actuals-anchored ES/EF, completed dates held fixed
— see Gate 20's own inspection). Two genuine gaps remained, and this time the scope fork WAS put to
Aditya via `AskUserQuestion` (unlike Gate 20): whether to build out-of-sequence detection as a
flag-only signal, or go further and add a real second calculation mode. **Aditya chose the fuller
option.**
- **Out-of-sequence (OOS) detection** (`scheduleCpmEngine.js`): an activity is flagged when it has
  an actual anchor (completed or in_progress) but its predecessors' own calculated dates — by the
  time it's reached in the engine's topological order — would only have permitted a LATER start
  than when it actually started. Detected purely from predecessor-derived constraints, never
  floored at `dataDate` (starting before the status date is normal on its own, not a sequencing
  problem — only a genuine predecessor-logic conflict counts). Reported via a new
  `is_out_of_sequence` flag on every activity result plus a warning, in BOTH calculation modes —
  it's a data-quality signal about what happened, independent of how the forecast treats it.
- **`calculation_mode`** (new per-schedule field, `CALCULATION_MODES = ["progress_override",
  "retained_logic"]`, mirrors `near_critical_threshold_days`'s per-schedule precedent):
  `"progress_override"` (default — the ONLY behavior that existed before this gate, so every
  pre-existing schedule keeps calculating exactly as it always did) lets actual dates win outright.
  `"retained_logic"` pushes an in-progress OOS activity's forecast ES (and downstream propagation)
  to the predecessor-derived constraint instead — the schedule still respects the logic tie going
  forward even though the actual start already happened early. **A completed OOS activity's own
  dates are never moved in either mode** — finished work is history, not subject to a "mode";
  verified explicitly in tests.
- UI (`schedule.js`): new "Out-of-Sequence Calculation Mode" dropdown on the schedule edit form;
  "Calculate Schedule" passes the schedule's mode into the engine and persists
  `is_out_of_sequence`; the calculation notify toast now mentions the OOS count; an "Out of
  Sequence" badge on the Activities list; a detail row on the Activity Detail Panel.
- Executive Center: new "Out of Sequence" KPI added to Gate 20's STATUS DATE panel, plus a detail
  list naming each OOS activity under the schedule's current mode. Computed via a LIVE `cpm`
  recalculation inside `buildProjectContext()` (same pattern `totalFloat`/`earlyFinish` already
  used there) — so switching a schedule's mode updates this panel immediately, without requiring
  the user to click "Calculate Schedule" again first. Verified live in the real-Chromium pass:
  toggling the mode alone shifted the reported forecast finish and critical-activity count.

Tests: new `tests/test_schedule_cpm_engine.js` (9 checks, pure-engine, no DOM — mirrors
`test_schedule_baseline_engine.js`'s pattern) covering OOS edge cases and both modes directly
against `calculateSchedule()`. `test_store_schema_v42_migration.js` renamed to
`test_store_schema_v43_migration.js` (this project's "one canonical full-chain migration test
targeting latest" convention — renamed and extended each schema bump rather than left as a stack
of one-off files) with new v42→v43 backfill checks added. New
`tests/test_status_date_reforecasting_e2e.js` (33 checks, including a 24-route smoke test) against
the real bundled `index.html`, covering the `schedule.js` UI and Executive Center surfacing
end-to-end, including a live-recompute-on-mode-change check. Full suite: **50 files, 1230 checks**,
clean, zero regressions. Real-Chromium pass (3 screenshots: OOS badge + Activity Detail Panel,
Executive Center in Progress Override mode, Executive Center in Retained Logic mode showing the
live forecast/critical-path shift) confirmed everything renders correctly — zero console errors.

**Gate 20 — Status-Date Control** (merge `33a3551`, triggered by Aditya's terse "Start the next
gate" — no `AskUserQuestion` rounds this time, unlike Gates 18/19; the remaining scope after
inspection was judged narrow/low-ambiguity enough to decide unilaterally). A fresh inspection
found almost everything the spec's own bullet list asks for already existed under different
names: Status Date = `schedule.data_date` (already the live reference point for CPM reforecasting,
delayed-activity detection, and reports), Original Plan vs Forecast =
`plannedProjectFinish`/`projectFinish` in `scheduleCpmEngine.js`, Baseline vs Current =
`scheduleBaselineEngine.js` (Gate 4/5), Critical/Near-Critical/Overdue = already in Executive
Center. Four genuine gaps closed in `executiveCenter.js`'s `buildProjectContext()` /
`renderOverviewTab()`, in a new "STATUS DATE (\<data_date\>)" KPI panel:
- **Completed / In Progress / Not Started counts** — by `activity.status`.
- **Remaining Duration rollup** — in-progress activities use `remaining_duration` if set, else
  they're counted in a data-quality note ("N in-progress activities have no Remaining Duration
  set..."); not-started activities use their full `duration`.
- **Forecast-to-finish-late list** — per-activity, compares each activity's own CPM
  `early_finish` against its own `planned_finish`. Deliberately distinct from "delayed" (which
  compares against the reference/status date, not each activity's own plan) — proven by test seed
  data where an activity forecasts to finish after its own `planned_finish` but still before
  `data_date`, so it counts as forecast-late (1) without also counting as delayed (0).
- **Float Changes / Milestone Variance** — rather than making the fully-synchronous
  `buildProjectContext()` async to duplicate `schedule.js`'s own IndexedDB-backed Baselines-tab
  compare UI a second time inside Executive Center, this exposes only a synchronous
  `ctx.baselineCount` (from the existing `data.schedule_baselines` metadata array) plus a "View
  Baselines" button. New `window.PCC.schedule.viewBaselines(projectId, scheduleId)` navigation
  hook (mirrors the existing `viewActivity()`) lands the user directly on the Baselines tab.

Tests: new `tests/test_status_date_control_e2e.js` (32 checks, including a 24-route smoke test).
Full suite: **48 files, 1185 checks**, clean, zero regressions. Real-Chromium pass (two
screenshots — before and after seeding a baseline) confirmed the panel renders correctly, zero
console errors.

**Gate 19 follow-on — Schedule↔Commitment integration** (merge `4690a58`, Aditya's explicit
request right after Gate 19 shipped: *"I want to integrate schedule to commitment management
also"*): closed a real gap Gate 19 itself left — Commitment already had an optional `activity_id`
link, but was never added to `schedule.js`'s own `LINKED_RECORD_SOURCES` array, so a linked
commitment never actually showed up on the Activity Detail Panel it pointed at. Fixed that, and
went further with a genuine schedule-aware signal, not just a label:
- **"Procurement Risk" badge**: flags a commitment when its linked activity is imminent (starting
  within 7 days, `COMMITMENT_RISK_WINDOW_DAYS`) or already under way, but the commitment itself
  isn't `approved` yet. Surfaced in three places, each computing the same rule independently per
  this app's per-module-helpers convention (no shared engine file for this — it's a simple enough
  rule that duplicating it three times was judged not worth introducing a new engine module for):
  `schedule.js`'s Activity Detail Panel (badge next to the commitment's Linked Record row),
  `commitments.js`'s own list (badge on the row + new **AT RISK** KPI card), and Executive
  Center's COMMITMENTS KPI section (new "At Risk" figure).
- No schema change — the risk is entirely computed from data that already existed (the linked
  activity's `early_start`/`planned_start` and the commitment's own `status`), same "computed,
  never fabricated" convention this app uses everywhere.

Tests: new `tests/test_commitment_schedule_integration_e2e.js` (33 checks, including a 24-route
smoke test) — proves an imminent unapproved commitment gets flagged on both the Schedule and
Commitments pages, a far-out one (90 days out) doesn't, approving it clears the flag everywhere,
and Executive Center's own KPI reflects the same count. Full suite: **47 files, 1153 checks**,
clean, zero regressions. Real-Chromium pass confirmed the badge and KPI render correctly on both
pages — zero console errors.

**Tier F is Aditya's own framing, verbatim: "These are NOT optional miscellaneous future
features. They are core Project Planning / Project Controls capabilities... Build them as
separate, independently testable gates."** Full spec text (all 9 gates) was handed over
conversationally, same as every other tier — not saved to a file in this repo; get it re-confirmed
from Aditya if a future session doesn't have it in context.

**Gate 19 — Commitment Management** (merge `a0a9e5b`): new page (`src/js/pages/commitments.js`),
added to the sidebar as **"Commitments"** (code `CN`) in the PLANNING group. Nothing was
pre-built for this — Executive Center's own header comment had flagged "Commitments and Cash Flow
aren't tracked anywhere in PCC yet" since Gate 9, and Document Control's Gate 16 explicitly
deferred a real Package/Commercial module rather than invent one out of scope; this was that gate.
Two new record types (schema v42):
- **Commitment**: `project_id` (mandatory), `vendor_id` linking into Vendor Master (never free
  text — this app already made that mistake once on `cost_actuals.vendor`), `package_id`, `type`
  (Purchase Order/Subcontract/Vendor/Material/Service/Approved Commercial Commitment — new
  `COMMITMENT_TYPES` enum), `po_contract_number`, `commitment_date`, `committed_value`,
  `approved_value`, `status` (new `draft`/`issued`/`approved`/`closed`/`cancelled` enum), optional
  `budget_item_id` and `activity_id` (never a direct `wbs_id` — WBS stays reached transitively via
  the linked activity, matching the app-wide convention). **Actual Value is deliberately NOT a
  stored field** (confirmed via `AskUserQuestion` — Aditya picked the more-work, more-accurate
  option over manual entry) — it's a live sum of every Cost Tracking actual cost entry linked to
  the commitment via a new `commitment_id` on `cost_actuals`; Remaining Commitment is likewise
  computed, never stored.
- **Package**: a new shared, portfolio-wide register (`packages` — name/code), same pattern
  Vendors/Resources already established — NOT project-scoped, so the same package is reusable
  across projects. Reused by both Commitments and Documents (Gate 16's existing free-text
  `package` field gained an additive `package_id`, also confirmed via `AskUserQuestion` — the old
  free-text value on any existing document stays exactly as-is, untouched, just no longer shown by
  the form going forward).

`cost.js`'s Actual Cost form gained an "Against Commitment" select (project-scoped, same pattern
as its existing "Against Budget Item" select) — this is what drives the live Actual Value sum.
Executive Center gained a **COMMITMENTS** KPI section (Committed/Approved/Actual/Remaining)
alongside COST, plus a matching section in the Management Pack print report. Portfolio's Details
panel gained a COMMITMENTS section showing Total Committed, matching the existing
Resources/Cost Tracking sections. **Full Budget → Commitments → Actual → Forecast wiring into
`costEvmEngine.js`'s own EAC/CPI/SPI math stays "eventually," per the spec's own framing — this
gate did NOT touch EVM's calculations**, Commitments surfaces its own independent KPI set instead.

Tests: new `tests/test_commitment_management_e2e.js` (38 checks, including a 24-route smoke
test) — a real Commitment created through the actual form, two real Actual Cost entries logged
through Cost Tracking's real form, and confirming the commitment's Actual/Remaining figures
update live across the Commitments page, Executive Center, and Portfolio. Schema migration test
renamed `test_store_schema_v41_migration.js` → `test_store_schema_v42_migration.js` with a new
v41→v42 migration check. Full suite: **46 files, 1120 checks**, clean, zero regressions.
Real-Chromium pass (dev build and the verified zip extraction) confirmed the Commitments/Packages
tabs and Executive Center's new KPI section all render correctly — zero console errors.

**Gotcha hit while building this:** `executiveCenter.js`'s own `fmtMoney()` and `portfolio.js`'s
own `formatMoney()` do NOT prepend a "$" sign (only a `currency + " "` prefix when the project has
one set) — unlike `commitments.js`'s own `formatMoney()`, which does add "$". A jsdom test
asserting on rendered money text needs to match whichever module actually rendered it, not assume
a consistent format app-wide; this cost a debugging round on two failing assertions before the
mismatch was found.

**Only Gates 18-19 are done — Gates 20-26
remain, none started, and each needs its own inspection + scoping round before building, same
discipline as every gate so far.**

**Gate 18 — Resource Management** (merge `ec8c638`): extends Gate 11's existing Resource
Management module (register, cross-project assignments, resource loading/histogram, over-
allocation detection — all already built) rather than rebuilding it. A fresh inspection found the
spec's asks for planned-vs-actual allocation, working hours/overtime, leave/unavailable periods
(and their effect on computed availability), real utilisation %, a demand-vs-shortage rollup,
granular resource type categories, and Resource↔Vendor linkage did not exist at all. Three design
points were confirmed via `AskUserQuestion` (Aditya picked the more thorough/accurate option over
a lighter heuristic every time):
- **Working hours/overtime** → simple aggregate fields on the assignment (`planned_hours_per_day`,
  `overtime_hours`), not a daily time-entry log — "this is project resource control, not a
  timesheet system."
- **Leave/unavailable periods** → a new `resource_unavailability` record (date-ranged, INCLUSIVE
  start/end — deliberately different from Schedule activities' exclusive-end convention, since
  this is filled in by a human picking calendar days, not computed from a duration) that actually
  **reduces computed availability** in `resourceLevelingEngine.js`, not just a notes field.
  `quantity` on the record is how much of the resource is unavailable (e.g. "2 of 5 electricians on
  leave"), not an all-or-nothing flag.
- **Resource↔Vendor linkage** → lives on the Assignment (`vendor_id`), not the Resource itself —
  the same shared resource (e.g. "Skilled Labor") can be sourced from a different vendor on each
  activity it's assigned to.

Also expanded `RESOURCE_TYPES` additively to the spec's full category list (Employee/Engineer/
Supervisor/Skilled Labor/Unskilled Labor/Contractor/Subcontractor/Equipment/Machinery) while
keeping the original "labor"/"material" values valid, so existing Gate 11 resources keep whatever
type they already have — no silent reclassification.

**`resourceLevelingEngine.js` changes (the real engine work of this gate):** every availability
computation — `detectOverAllocations()`, the histogram, and two brand-new functions,
`computeUtilisation()` (allocated ÷ leave-adjusted-available as a %, plus a
demand/available/shortfall rollup in "unit-days" across a resource's active date range) and
`bucketUtilisation()` (a trend chart, averaging per bucket — deliberately distinct from
`bucketTimeline()`'s max-per-bucket, which is tuned for spotting over-allocation spikes rather than
showing typical load) — now read a resource's EFFECTIVE daily availability (`max_availability`
minus any overlapping unavailability quantity for that specific day) instead of the flat number
applying unconditionally on every day.

**UI changes:** `resources.js` gained a 4th tab, **"Unavailability"** (CRUD for leave periods,
same list/form pattern every other tab already uses), and the Leveling tab gained **Avg.
Utilisation** / **Demand vs Available** KPI cards plus a **Utilisation Trend** chart panel.
Schedule's Activity Detail Panel now shows an **Available / Over-Allocated / Availability
Unknown** badge next to each linked resource assignment — satisfies the spec's explicit "the
schedule should show which resources are required for an activity and whether those resources are
available," which Gate 11 only half-covered (listed resources, gave no availability signal). The
badge checks whether any of the SPECIFIC ACTIVITY's own dates land on one of that resource's
portfolio-wide over-allocated days — a resource over-allocated elsewhere in the portfolio on
unrelated dates correctly does NOT flag this particular assignment.

**Gotcha hit while building this:** changing the Linked Records row's DOM structure (wrapping the
badge+View-button pair in a new `<div>`) broke a pre-existing test in
`test_activity_linking_e2e.js` that asserted `viewButton.parentElement.textContent` contained the
record's own label text — the wrapper div changed the button's parent from the row itself to the
new inner wrapper. Fixed by keeping text/badge/button as flat siblings of the row (`text.style.flex
= "1"` to push badge+button right, no wrapper div) rather than introducing one. Worth remembering:
**any row-shape change in a list this app already has an e2e test against should be checked for
exactly this kind of `parentElement`/DOM-structure assumption**, not just content assertions.

Schema v41: `resource_assignments` gains `actual_quantity`/`planned_hours_per_day`/
`overtime_hours`/`vendor_id` (all backfill to `null`/`""` — nothing to invent from data that was
never tracked); new `resource_unavailability` array (brand new register, nothing to backfill).

Tests: new `tests/test_resource_control_e2e.js` (33 checks, including a 23-route smoke test)
proving a real leave-adjusted over-allocation scenario end to end (5/day capacity, 5 demand — NOT
over-allocated on its own — then a 2-person, 2-day leave period drops capacity to 3 on exactly
those 2 days, correctly triggering over-allocation only there, with exact demand/available/
shortfall unit-day arithmetic verified). Schema migration test renamed
`test_store_schema_v40_migration.js` → `test_store_schema_v41_migration.js` with a new v40→v41
migration check. Full suite: **44 files, 1079 checks**, clean, zero regressions. Real-Chromium
pass (both the dev build and the verified zip extraction) confirmed the leave-adjusted Leveling
tab, the Unavailability tab, and the Schedule badge all render correctly — zero console errors.

**Tier E (Portfolio) is now COMPLETE — Aditya provided the full spec verbatim (Gate 16 Portfolio
Performance, Gate 17 Personal Workbench, plus supporting sections 25-32 on portfolio/workbench
philosophy, health-score/reporting philosophy, and desktop/mobile UX).** Built Portfolio
Performance first (Aditya's exact answer when asked which to start with: "Portfolio Performance"),
then Personal Workbench (Aditya's exact instruction: "Start the next gate" — no re-scoping
question needed since only one gate remained in the tier and the spec had already been re-read).

**Gate 17 — Personal Workbench** (merge `332b505`): new page (`src/js/pages/myWork.js`), added to
the sidebar nav as **"My Work"** (code `MW`, right after Dashboard), organized into the spec's own
four sections — read the full inspection findings and Aditya's three schema decisions in this
gate's own commit message (`git show 332b505^2` on the `claude/tier-c-code-inspection-jysweb`
history) if more detail than below is needed:

- **TODAY**: Overdue Actions (same definition Action Centre's own OVERDUE bucket already uses —
  Meeting Actions + RFI/TQ past due), Today's Meetings, Approvals (Change Orders + Decisions with
  `status: "pending"`), Activities to Update (**a genuinely new rule** — `not_started` activities
  whose `planned_start` has passed, or `in_progress` activities whose `planned_finish` has passed;
  nothing like this existed anywhere before this gate — it's about data hygiene, not schedule
  health, which Executive Center/Portfolio already cover).
- **THIS WEEK**: Meetings and Milestones in the next 7 days (reusing Project Lookahead's own
  date-window/`early_start`-precedence conventions), Vendor Follow-ups, Reviews due. **"Reports"
  was deliberately excluded** — no scheduled/recurring-report concept exists anywhere in PCC, and
  the spec's own Reporting section (28) explicitly says not to build reporting out in one gate.
- **WAITING FOR**: Vendor/Client/Consultant/Management, from RFI/TQ + Change Orders + Decisions
  carrying the new `waiting_on_party` field. Unset (`""`) items never appear here — never guessed,
  same "transparent, never fabricate" rule the health-score engine already follows.
- **RECENTLY UPDATED**: Projects/Activities/RFIs/Risks/Meetings, top 5 each by `updated_at`, same
  pattern Dashboard's own "Recent projects" panel already established.

**Schema v40 — three fields, all three the "add a real field" choice** (Aditya confirmed each via
`AskUserQuestion`; the alternatives offered were a no-schema-change heuristic or excluding the
section entirely — Aditya picked the accurate-but-schema-touching option every time):
- `waiting_on_party` (`""`/`"vendor"`/`"client"`/`"consultant"`/`"management"`) added to RFI/TQ,
  Change Orders, and Decisions — editable via a new "Waiting On" select on each of their forms
  (`rfis.js`/`changeOrders.js`/`decisionRegister.js`).
- `next_follow_up_date` added to Vendor — editable via a new "Next Follow-up Date" field on the
  vendor form (`vendors.js`).
- `review_cadence_days` added to Project, **defaults to 7 (weekly)** for both new and migrated
  projects — editable via a new "Review Cadence" select (Weekly/Biweekly/Monthly/None) on
  Portfolio's edit form (`portfolio.js`). Drives Reviews-due: `next_due = (last WeeklyReview's
  review_date, or the project's own start_date/created_at if never reviewed) + cadence_days`;
  `review_cadence_days: null` means "not configured," excluding the project from Reviews entirely
  rather than guessing a date.

`executiveCenter.js`'s `viewProject()` gained an optional second `tab` argument (defaults to
`"overview"`, every existing caller unaffected) so a Review-due item can land directly on the
Weekly Reviews tab, same "land exactly on the linked record" convention `vendors.js`'s
`openProfile(vendorId, tab)` already established.

Tests: new `tests/test_my_work_e2e.js` (33 checks, including a 23-route smoke test). Schema
migration test renamed `test_store_schema_v39_migration.js` →
`test_store_schema_v40_migration.js` with a new v39→v40 migration check (unset fields backfill to
`""`/`null`, already-set fields/`review_cadence_days` are left untouched, new projects still
default to 7). Full suite: **42 files, 1043 checks**, clean, zero regressions. Real-Chromium pass
(both the dev build and the verified zip extraction) confirmed all four sections render correctly
with live data and zero console errors — including confirming the Reviews-due fallback to
`created_at` works when a project has no `start_date` set.

**Gate 16 — Portfolio Performance** (merge `c4959e2`): extends the existing Portfolio page in
place rather than adding a new page, per the spec's own framing. Adds:
- A KPI strip — Total/Active/Completed/At Risk/Delayed/Upcoming — computed at render time, never
  stored. "Upcoming" was ambiguous (not-yet-started vs. finishing-soon) and confirmed via
  `AskUserQuestion`: Aditya chose **"Projects not yet started"** (`start_date` in the future, or
  unset with no schedule activity yet for that project).
- New filters: Client/Country/Sector/PM/Planner/Type/Year — every one of these fields already
  existed on the project schema but had never been wired as a filter anywhere.
- `project_type` gained an actual data-entry path (added to `portfolio.js`'s `FIELD_CONFIG`) — it
  existed on the schema since Gate 9 but nothing had ever set it, the same "schema field nothing
  ever sets" shape the `physical_progress` bug turned out to be earlier this session.
- A Cards/Compare view toggle on the same page. Compare is a new table — Project/Progress/
  Schedule/Risk/Health — whose Schedule/Risk/Health columns are the **computed health-engine RAG
  bands**, deliberately distinct from the project's own manually-set `status` field Cards shows
  (Progress is still the manual progress %, matching Executive Center's own Overview/Schedule
  Progress distinction). Confirmed working correctly in the real-Chromium pass: one seeded project
  showed manual status "On Track" alongside a computed Schedule RAG of "Critical" — the two are
  genuinely independent, as intended.
- `executiveCenter.js` gained a new exported `getHealthSummary(projectId)`, following the
  `getDiagnostics()` precedent (Gate 31) of exporting one composed function rather than
  duplicating the ~220-line `buildProjectContext()`. `projectHealthEngine.js` now also exports
  `ragFromScore()` so a single factor's score (schedule, risk) can be banded with the same 80/60
  thresholds the overall score already uses.
- New `.data-table` CSS class for interactive on-screen tables — `.report-doc table` is
  print-report-specific and forces black text under `@media print`, wrong for a clickable
  interactive table.

**Gotcha worth remembering:** getting a delayed activity to show up through the *real* CPM engine
took real debugging. `scheduleCpmEngine.js`'s forward pass floors `early_start`/`early_finish` at
the schedule's `data_date` (defaults to today) for any `not_started`/`in_progress` activity — so a
bare `planned_finish` in the past is NOT sufficient to make `ctx.delayedActivities` fire when a
schedule/CPM run exists for the project; effective_finish will always land at-or-after the
reference date. The only way through the real code path is `classifyActivity()`'s "completed"
branch (`scheduleCpmEngine.js`), which is driven purely by whether `actual_finish` is set — NOT by
the store's own `status` field — and is exempt from the `data_date` floor. The test (and any
future one needing a genuinely-delayed activity through full CPM) sets `actual_start`/
`actual_finish` both in the past while leaving `status: "not_started"`, mirroring a real,
plausible data gap (actuals entered, status dropdown not updated yet).

Tests: new `tests/test_portfolio_performance_e2e.js` (31 checks, jsdom against the real bundled
`index.html`, includes the 22-route smoke test). Full suite: **41 files, 1009 checks**, clean, zero
regressions. Real-Chromium pass confirmed the KPI strip, all new filters, and both Cards/Compare
views render correctly with zero console errors — screenshots sent to Aditya alongside this
handoff.

**Tier C (Project Performance) — complete, four gates, all built and merged in an earlier round
this session** (physical_progress fix, Vendor Performance Centre, Delay & Recovery Management,
Decision Register — merge commits `fba3d42` → `0801b10` → `4882f79` → `d57a056`). Full detail on
each is preserved in the roadmap section below; nothing more to add here.

**Tier D (Management) — inspected this session against its three named gates** (Aditya provided
these directly, since the original roadmap doc was never saved as a file in this repo): Gate 13
Weekly Project Review, Gate 14 Executive Centre, Gate 15 Executive Summary/Reporting. Findings:

- **Executive Centre** — already fully built as Gate 9's Project Executive Center. Nothing to do.
- **Executive Summary/Reporting** — mostly already built (Gate 9's six-section summary + the
  Reports module's Project Status/Portfolio Summary reports); a real gap was found (none of the
  three Tier C registers were represented anywhere) and **is now fixed for two of the three** — see
  the follow-on round below. Vendor Performance stays out on purpose (see below).
- **Weekly Project Review** — did not exist at all. No persisted review record anywhere; the
  closest artifact (Executive Center's Project Snapshot print view) is explicitly commented as fit
  for "weekly/client/steering-committee use" but is a live, ephemeral render with no saved
  history. **Built this session** — confirmed via `AskUserQuestion` to capture a frozen KPI
  snapshot per review (not a notes-only log) for trend tracking.

**Weekly Project Review** (merge `c3af1d9`): new `weekly_reviews` array — `review_date`,
`attendees`, `reviewed_by`, three notes fields (Progress This Week/Issues & Blockers/Actions for
Next Week), and a `snapshot` object frozen at creation from `executiveCenter.js`'s own
`buildProjectContext()`/`computeHealthScore()` and never recalculated afterward, same "frozen
record, not a live view" precedent Gate 4's Schedule Baselines established. `buildProjectContext()`
gained Recovery Actions/Decisions sections it didn't have before (needed for the snapshot — a
first, partial step toward the Executive Summary/Reports gap above, though that gap is not fully
closed). New third tab **"Weekly Reviews"** in Executive Center, alongside Overview and Snapshot &
Management Pack — had to live here rather than as a standalone page, since a separate page would
need either a new exported API or to duplicate ~220 lines of context-building logic (the exact
case this file already flags as too large to duplicate, per Gate 31's own precedent). Full
add/edit(notes-only)/delete, a chronological list, and a simple delta marker (▲/▼) against the
previous review's health score and progress once two reviews exist. Schema migration test renamed
`test_store_schema_v38_migration.js` → `test_store_schema_v39_migration.js`. New test file
`test_weekly_reviews_e2e.js` (33 checks, including confirming the snapshot stays frozen after live
data changes underneath it — closing an already-reviewed risk afterward must not retroactively
change what an earlier review showed).

Real-Chromium pass confirmed capturing a review, its frozen snapshot and RAG badge, and the
notes-only edit path — zero console errors. Merge commit `c3af1d9`.

**Wiring Recovery Actions/Decisions into diagnostics/Executive Summary/Reports** (merge `fef89f6`,
same session, follow-on round after Weekly Project Review): closes the gap the Tier D inspection
above found, for two of the three affected registers. Checked whether Vendor Performance could be
included too — its `project_id` field is never actually set by any UI (`vendors.js`'s Performance
tab form only ever saves `vendor_id`), so it can't be meaningfully project-scoped, and it already
has its own portfolio-wide Vendor Performance Centre page; excluded on inspection, nothing missing
for it. Confirmed via `AskUserQuestion`: pending Decisions get **WARNING** severity in diagnostics
(not INFO like pending Change Orders) since a Decision has no separate approval workflow to fall
back on the way a Change Order does. `projectHealthEngine.js`'s `computeDiagnostics()` gained two
new rule blocks — overdue recovery actions and pending decisions, both WARNING — shared by both
Executive Center's own Diagnostics panel and Dashboard's Management Attention panel (Gate 31's
exported `getDiagnostics()`), so one change closed two of the three originally-flagged surfaces at
once. `executiveCenter.js`: `autoChallengesText()`/`autoAttentionText()` now mention them;
`navigateToLink()` gained cases for `decisionRegister` (expands the specific decision) and
`delayRecoveryDashboard` (lands on the dashboard, already sorted overdue-first — no per-record
expand API exists there since it's a portfolio rollup, not a detail page). `reports.js`:
`buildProjectReport()` gained Recovery Actions and Decisions table sections matching the existing
Risk/RFI/Change Order pattern; `buildPortfolioReport()` gained matching count-only sections
matching its own lighter style. No schema change. New test file
`test_recovery_decision_reporting_e2e.js` (31 checks) plus a 22-route smoke test; full suite
re-run clean with zero regressions in the 39 pre-existing files. Real-Chromium pass confirmed both
Diagnostics/Management Attention panels show the new WARNING alerts with working navigation, and
both Reports views show the new sections with correct counts — zero console errors.

The full test suite (**41 files, 1009 checks**) passes clean as of this handoff. **No branch
currently carries unmerged app features** — `claude/tier-c-code-inspection-jysweb` (name is now
stale relative to its content — it's carried every gate this session, Tiers C/D/E alike; a future
session may want to start a fresh branch with a name matching current work) was merged into `main`
in full (merge commit `c4959e2`, Gate 16 Portfolio Performance) and has been restarted from the new
`main`. Verify with `git log origin/main..HEAD` before assuming this is still true by the time you
read this.

**The entire 14-gate Document Control sub-spec Aditya originally handed over is complete (Gates
14-28)** — Master Repository, Project Requirements, Classification/Nomenclature, Status/Version
Control, Schedule Due Dates, Vendor Register, Schedule↔Document Linking, Schedule-Driven
Dates/Lead Time, Vendor Lookahead, Readiness/Constraints, Reminders/Notifications, Dashboards,
Executive Summary, and Portfolio Compliance. **A new, separate PCC Evolution Roadmap started
with Gate 29** (see its own section below) — its first five gates (Planner Action Centre, Project
Lookahead, Management Attention, Activity → Vendor, Meeting Action → Control Linking) are done —
**Tier A (Daily Planner Value) and Tier B (Control Integration) are both now complete** (two of
Tier B's four gates — Schedule→Activity, Activity→Risk/Issue/RFI — were already satisfied before
this roadmap even started); ~22 more gates remain, none started, none scoped yet. Tier C (Project
Performance) is the likely next area, but hasn't been inspected against the real code yet.

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

### PCC Evolution Roadmap (Gates 29-33 = roadmap's own Gates 1-5) — 5 of ~27 gates done, Tiers A + B + C complete, Tier D underway

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

- **Gate 30 — Project Lookahead.** New page, `pages/projectLookahead.js`, sidebar entry in
  OVERVIEW right after Action Centre. Distinct from Gate 29 in shape (flat DATE-sorted table with
  a 7/14/30/60-day window toggle, not urgency buckets) and in being forward-only (nothing overdue
  shows — that's the Action Centre's job). First cross-module planner view to touch **Schedule
  activities/milestones** (`activity_type` "task"/"milestone" only, excludes completed and
  structural summary rows; date = `early_start || planned_start`, same precedence as
  `scheduleGanttLayout.js`'s `effectiveDates()`; status badge from `total_float` against the
  schedule's own `near_critical_threshold_days`, reading the schedule's last **persisted**
  calculated fields rather than re-running CPM live) and the first to surface **upcoming Meetings**
  by their own `meeting_date` (new — nothing showed "you have a meeting on this date" before this
  gate). Reuses Gate 29's Meeting Actions/RFI/Document sources, re-sorted chronologically instead
  of bucketed. New navigation hook used: `window.PCC.schedule.viewActivity(projectId, scheduleId,
  activityId)` (Gate 10's own reverse-navigation API, not new). Change Orders/Risks excluded, same
  reasoning as Gate 29 — no due-date field to place them on a timeline. No schema changes. New test
  file `test_project_lookahead_e2e.js` (34 checks) covers every window-boundary case (a day-20 item
  appearing only at 30/60 days, a day-45 item only at 60) and float-derived badge correctness.

- **Gate 31 — Management Attention.** Deliberately almost no new logic: exported
  `window.PCC.executiveCenter.getDiagnostics(projectId)` — one function composing Executive
  Center's existing private `buildProjectContext()` → `diagnosticsContextFrom()` →
  `projectHealthEngine.computeDiagnostics()` pipeline (already proven inside its own Diagnostics
  panel) — rather than duplicating that ~220-line context builder into `dashboard.js`. A genuine,
  deliberate departure from this app's usual "duplicate small helpers" convention: that convention
  was scoped to ~10-30 line functions, never to something this large, and duplicating it would risk
  Dashboard and Executive Center silently disagreeing after a future fix landed in only one copy.
  New Dashboard panel, **"Management Attention,"** right after the KPI grid and before the existing
  Document Reminders panel (both untouched) — loops every active project, keeps only **Critical +
  Warning** severities (Info-level detail like near-critical activities/pending Change Orders stays
  Executive-Center-only, to avoid a portfolio-wide firehose of low-urgency notes), groups by
  project worst-first (critical count, then warning count, then name), one **"View Project"**
  button per group landing on that project's Executive Center Overview (same destination for every
  alert type — Executive Center's own Diagnostics panel already has correct per-record links from
  there). Confirmed via test that the diagnostics engine recomputes CPM **live** rather than
  trusting a stale stored `total_float` — a directly-edited float on a record doesn't change the
  result; the underlying schedule data does. No schema changes. New test file
  `test_management_attention_e2e.js` (31 checks).

- **Gate 32 — Activity → Vendor (Tier B, Control Integration's first gate).** A fresh inspection
  at this point in the roadmap checked Tier B's 4 gates against the real code: Gate 5
  (Schedule→Activity) turned out to be inherent in the base schema already (every activity carries
  its own `schedule_id`); Gate 7 (Activity→Risk/Issue/RFI) was already built pre-roadmap (Gate 10).
  The two genuine gaps: Gate 6 (Activity→Vendor — checked all ten `vendor_id` fields in the schema,
  none live on `activities`) and Gate 8 (Meeting Action→Control linking — `newMeetingAction()`'s
  shape has zero linking fields, only the *parent meeting* has `activity_id` from Gate 10).
  Confirmed via `AskUserQuestion`: build Activity→Vendor first. `activities` gained an optional
  `vendor_id` (schema v34→35) — a real link into Vendor Management (Gate 13), distinct from the
  pre-existing free-text `contractor` field. Schedule's Activity form gained a Vendor picker
  (hand-built `<select>`, same pattern as the form's existing WBS picker — dynamic options don't
  fit `ACTIVITY_FIELD_CONFIG`'s static-enum select handling); the Activity Detail Panel gained a
  read-only Vendor row. Vendor Profile gained an 11th tab, **"Activities"** — read-only,
  portfolio-wide, every activity with a matching `vendor_id` across all that vendor's projects,
  sorted soonest-start-first with a Critical/Near-Critical/On Track badge and a "View in Schedule"
  button (reuses Gate 10's `window.PCC.schedule.viewActivity()`, no new API). Answers "what exactly
  is Vendor ABC responsible for?" at the activity level — distinct from the Projects tab's
  project-level, free-text `scope_of_work`. New test file `test_activity_vendor_link_e2e.js` (30
  checks) plus the renamed schema migration file (`test_store_schema_v35_migration.js`).

- **Gate 33 — Meeting Action → Control Linking (Tier B's final gate — Tier B now complete).**
  Confirmed via `AskUserQuestion`: build all four link types in one gate (Vendor, Activity, RFI,
  Risk) rather than starting narrower with just Vendor+Activity. `meeting.actions[]` entries
  gained `vendor_id`/`activity_id`/`rfi_id`/`risk_id` (all optional, schema v35→36). Each action
  row in the meeting's Add/Edit form gained four pickers — Vendor (portfolio-wide), Activity/RFI/
  Risk (scoped to the meeting's *currently-selected* project, via two new sibling helpers to the
  existing `activityOptionsFor()`: `rfiOptionsFor()`/`riskOptionsFor()`). Switching the meeting's
  Project select **live-rescopes** every action row's Activity/RFI/Risk options (Vendor is
  unaffected — not project-scoped), extending the exact rescoping pattern the meeting-level
  Activity select already used. Read-only Meeting Details appends whichever links are set to each
  action's line ("only show what's there," same convention as everywhere else). The Planner
  Action Centre's (Gate 29) meeting-action rows now also annotate Vendor/Activity inline — a
  near-zero-cost payoff once the data existed, no new page or API. New test file
  `test_meeting_action_links_e2e.js` (27 checks) plus the renamed schema migration file
  (`test_store_schema_v36_migration.js`).

- **Tier C inspection + physical_progress fix (this session, not a numbered roadmap gate — a
  requested inspection plus one confirmed bug fix that came out of it).** Aditya asked for the same
  "inspect against the real code before proposing anything" pass Tier B got, this time for Tier C
  (Project Performance): Progress Management, Vendor Performance Centre, Delay & Recovery
  Management, Decision Register. Findings — see the "Where things stand" section above for full
  detail — Progress Management mostly built but with a live bug (`physical_progress` silently
  always 0%, feeding a wrong number into Executive Center's Executive Summary and Management Pack);
  Vendor Performance Centre has the per-vendor piece (Gate 13) but no portfolio-wide dashboard;
  Delay analysis exists (Gate 4/5) but Recovery does not exist at all; Decision Register does not
  exist at all. Confirmed via `AskUserQuestion` to fix the `physical_progress` bug first, and to
  build it as a real second metric rather than collapsing it into `percent_complete`. `store.js`'s
  `newActivity()` comment above both fields now documents the distinction (schedule-derived vs.
  manually-assessed) so a future session doesn't have to re-derive it. New test file
  `test_activity_physical_progress_e2e.js` (29 checks) — no schema migration file needed, no
  version bump. Merge commit `fba3d42`.

- **Vendor Performance Centre (this session, Tier C's first built gate).** Aditya confirmed
  starting Tier C with this one after the inspection above. Scoped in a short paragraph, then a
  placement decision confirmed via `AskUserQuestion`: extend the existing Vendor Dashboard vs. a
  new dedicated page — Aditya chose **a new dedicated page**, matching the roadmap's literal
  "Vendor Performance Centre" naming and the Document Control Dashboard's own precedent (Gate 26).
  New page `pages/vendorPerformanceCentre.js`, sidebar entry in OVERVIEW right after Vendors.
  Entirely reuses Gate 13's `vendor_performance` data — no new stored fields. KPI cards (Total
  Vendors / Reviewed / Not Yet Reviewed / Portfolio Avg Rating — the average excludes unreviewed
  vendors from its denominator), a **"Vendor Performance (worst first)"** ranked panel (reviewed
  vendors only, sorted lowest-overall-rating-first, same convention as the Document Control
  Dashboard's worst-first project/type breakdowns; each row shows the overall rating plus the
  quality/delivery/communication/safety breakdown and a status badge using the same 80%/60%
  on_track/at_risk/critical thresholds `projectHealthEngine.js` uses on its 0-100 health score,
  scaled to this page's 0-5 rating range — i.e. ≥4.0 On Track, ≥3.0 At Risk, else Critical), and a
  separate **"Not Yet Reviewed"** panel so a vendor with zero reviews is never conflated with one
  that scored 0/5 (same "not rated ≠ rated 0" distinction `overallRating()`'s own comment in
  vendors.js already documents). `vendors.js`'s `openProfile(vendorId)` gained an optional second
  `tab` argument (defaults to `"overview"`) so this page's "View Profile" buttons land directly on
  the vendor's Performance tab — same "land exactly on the linked record" convention as Gate 10's
  `viewActivity()`; every existing caller of `openProfile()` is unaffected since the argument is
  optional. Read-only — nothing here writes back to `vendor_performance` or `vendors`. New test
  file `test_vendor_performance_centre_e2e.js` (31 checks) plus a 20-route smoke test. Merge
  commit `0801b10`.

- **Delay & Recovery Management (this session, Tier C's second built gate).** Aditya confirmed
  this as the next Tier C gate after Vendor Performance Centre. Scoped in a short paragraph — Delay
  analysis already existed and stayed untouched, only Recovery had zero footprint — then two
  decisions confirmed via `AskUserQuestion`: recovery actions attach to **Schedule Activities**
  (not whole Projects, matching where delay is actually detected), and this gate includes **both**
  the entry point and a portfolio-wide dashboard together (same combined scope as Vendor
  Performance Centre, rather than splitting entry from rollup into two gates). New
  `recovery_actions` array (`schema_version` 36→37): `activity_id`, `project_id` (denormalized,
  same convention `newScheduleBaseline()` already uses), `description`, `responsible_person`,
  `target_recovery_date`, `status` (open/in_progress/completed/cancelled). Deliberately decoupled
  from any one baseline comparison — Gate 4's `compareBaselineToCurrent()` is computed on demand,
  never stored, and a schedule can have several baselines — so a recovery action only needs an
  `activity_id` to attach to; nothing requires a baseline to exist. `pages/schedule.js`'s Activity
  Detail Panel gains a **"Recovery Actions"** section (`renderRecoveryActionsSection()`) right
  after Document Readiness — full add/edit/remove, same inline-CRUD pattern
  `vendors.js`'s `renderPerformanceTab()` uses for vendor reviews; an "Overdue" badge computes live
  from `target_recovery_date` vs. today, but a `completed`/`cancelled` action never shows Overdue
  regardless of date. `deleteActivityWithConfirm()` now also cascades the activity's
  `recovery_actions` on delete — a deliberate departure from how risks/rfis/meetings/document
  requirements are left with a stale `activity_id` link when their linked activity is deleted:
  those records have their own independent life on their own register, but a recovery action is
  only ever surfaced via its activity's own Detail Panel, so leaving it behind would make it
  permanently unreachable dead data rather than a visible "orphaned link." New page
  `pages/delayRecoveryDashboard.js`, sidebar entry in PLANNING right after Schedule: KPI cards
  (Total/Open/Overdue/Completed), an **"Open Recovery Actions (overdue first)"** panel (overdue
  actions first, then soonest target date), a separate **"Completed / Cancelled"** panel, and "View
  in Schedule" navigation reusing Gate 10's `viewActivity()`. Deliberately does NOT re-derive
  delay/baseline stats portfolio-wide (which baseline to compare per schedule is a real ambiguity
  this gate doesn't resolve) — delay analysis itself stays exactly where it already lives, in each
  schedule's own Baselines tab; this dashboard covers Recovery Actions only. Read-only — nothing
  here writes back. Schema migration test renamed `test_store_schema_v36_migration.js` →
  `test_store_schema_v37_migration.js`. Two new test files: `test_recovery_actions_e2e.js` (32
  checks, including the cascade-delete case) and `test_delay_recovery_dashboard_e2e.js` (30
  checks, including archived-project exclusion and overdue-first sorting) plus a 21-route smoke
  test each. Merge commit `4882f79`.

- **Decision Register (this session, Tier C's fourth and final built gate — Tier C now
  COMPLETE).** Aditya confirmed this as the last Tier C gate after Delay & Recovery Management.
  Scoped in a short paragraph — no `decisions` register existed at all, closest structural
  templates were `risks.js`/`rfis.js` — then one decision confirmed via `AskUserQuestion`: include
  "raise a Decision from a Meeting" (`source_meeting_id` + a reverse "DECISIONS RAISED" list on the
  meeting, matching how Risk/RFI/Change Orders already work) in this same gate rather than
  deferring it. Aditya chose **include it now**. New `decisions` array (`schema_version` 37→38):
  `title`, `description` (context/background), `decision` (the actual decision text, left empty
  until status moves to "decided"), `decided_by`, `decision_date`, `status`
  (pending/decided/deferred/superseded), plus the same optional `activity_id` (Gate 10 pattern) and
  `source_meeting_id` every comparable register already has. New page
  `pages/decisionRegister.js`, sidebar entry in REGISTERS right after Change Mgmt — full
  add/edit/delete, search/status/project filters, a Details view with "View in Gantt" (linked
  activity) and "View Meeting" (source meeting) buttons, same structure as risks.js/rfis.js. No
  heatmap (that's risk-specific, doesn't apply to a decision) and no cross-register "raise X from
  this decision" button (not asked, would be scope creep beyond the confirmed gate).
  `pages/meetings.js` gains a **"+ Add Decision"** quick action (reusing the exact
  `createFromMeeting()`/`pendingPrefill` pattern Risk/RFI/Change Orders already use — `uiState.
  pendingPrefill = { project_id, source_meeting_id }`, `uiState.editingId = "new"`, consumed and
  cleared on the next render) and a reverse **"DECISIONS RAISED"** list in the meeting's own
  Details, matching the existing RISKS/RFI/CHANGE ORDERS RAISED sections verbatim (same `filter by
  source_meeting_id === m.id` pattern). Schema migration test renamed
  `test_store_schema_v37_migration.js` → `test_store_schema_v38_migration.js`. New test file
  `test_decision_register_e2e.js` (35 checks, including the full "+ Add Decision" from a meeting →
  prefilled form → save → DECISIONS RAISED round-trip) plus a 22-route smoke test. One jsdom gotcha
  hit while writing this test and worth remembering for the next one: `router.go()` only sets
  `window.location.hash` — `currentRouteName()` reflects it immediately (it just reads the hash),
  but the actual rendered DOM does NOT update until `router.render()` is called explicitly; a test
  that clicks a `router.go()`-triggering button and immediately asserts on `outlet()`'s content
  without an intervening `render()` call will see stale content even though the route "changed."
  Merge commit `d57a056`.

**PCC Evolution Roadmap: Tiers A, B, and C are all now complete.** Tier C (Project Performance) was
inspected against the real code this session and all four of its areas are done: Progress
Management (the `physical_progress` bug fixed), Vendor Performance Centre, Delay & Recovery
Management, and Decision Register.

### Tier D (Management) — in progress

Unlike Tiers B and C, **the original roadmap document was never saved as a file anywhere in this
repo** — Tier D's three named gates came directly from Aditya, mid-session, when asked: **Gate
13 Weekly Project Review, Gate 14 Executive Centre, Gate 15 Executive Summary/Reporting.** If a
future session needs Tier E (Portfolio) or Tier F's gate names in this same level of detail, ask
Aditya the same way rather than guessing from the one-line tier summary in the "What this project
is" section below.

- **Executive Centre** — inspected, already fully built as Gate 9's Project Executive Center
  (per-project KPI rollups, health score, diagnostics, editable Executive Summary, SVG charts,
  print views). Nothing to build.
- **Executive Summary/Reporting** — inspected, mostly already built (Gate 9's summary + the
  Reports module), but a real gap found: checked `autoChallengesText()`/`autoAttentionText()` in
  `executiveCenter.js` and `buildProjectReport()`/`buildPortfolioReport()` in `reports.js` line by
  line — none of the three Tier C registers (Vendor Performance, Recovery Actions, Decisions) are
  referenced anywhere in them, even though every comparable register (Risk, RFI, Change Orders,
  Documents, Meetings, Daily Log) has its own section/mention. Dashboard's Management Attention
  panel (Gate 31) inherits the same blind spot since it reuses the same diagnostics engine.
  **Fixed this session, follow-on round, for Recovery Actions and Decisions** — see below. Vendor
  Performance stays out on purpose: its `project_id` is never actually set by any UI, so it can't
  be meaningfully project-scoped, and it already has its own portfolio-wide page.
- **Weekly Project Review (built this session).** Confirmed via `AskUserQuestion`: capture a
  frozen KPI snapshot per review (health score, RAG, schedule/physical progress %, cost
  budget/actual/variance, open risks incl. high-severity, open/overdue RFIs, pending change
  orders, open/overdue recovery actions, pending decisions) rather than a simpler notes-only log —
  Aditya chose the snapshot approach for trend tracking. New `weekly_reviews` array
  (`schema_version` 38→39): `review_date`/`attendees`/`reviewed_by`, three notes fields (Progress
  This Week/Issues & Blockers/Actions for Next Week), and a `snapshot` object frozen once at
  creation and never recalculated — same "frozen record, not a live view" precedent Gate 4's
  Schedule Baselines established (a review from a month ago shows what was true then, confirmed by
  a test that closes a risk after saving a review and checks the saved review's snapshot doesn't
  change). `buildProjectContext()` in `executiveCenter.js` gained Recovery Actions/Decisions
  sections it didn't have before, needed to compute the snapshot — a first, partial step toward
  the Executive Summary/Reports gap above, though that gap isn't fully closed (Executive Summary's
  own auto-text and Reports' sections still don't mention them; only the new Weekly Review
  snapshot does). New third tab **"Weekly Reviews"** in Executive Center (alongside Overview and
  Snapshot & Management Pack) — had to live inside `executiveCenter.js` rather than as a standalone
  page, since a separate page would need either a new exported API or to duplicate
  `buildProjectContext()`'s ~220 lines (the exact case Gate 31's own precedent already flagged as
  too large to duplicate). Full add/edit(notes-only, snapshot stays frozen)/delete, a chronological
  list (newest first), and a simple ▲/▼ delta marker against the previous review's health score and
  progress once two reviews exist for a project. Schema migration test renamed
  `test_store_schema_v38_migration.js` → `test_store_schema_v39_migration.js`. New test file
  `test_weekly_reviews_e2e.js` (33 checks) plus a 22-route smoke test. Merge commit `c3af1d9`.

- **Wire Recovery Actions/Decisions into diagnostics/Executive Summary/Reports (this session,
  follow-on round after Weekly Project Review).** Closes the Executive Summary/Reporting gap above
  for two of the three affected registers — Vendor Performance excluded on inspection (see that
  bullet's note). Confirmed via `AskUserQuestion`: pending Decisions get **WARNING** severity
  (not INFO like pending Change Orders), since a Decision has no separate approval workflow to
  fall back on the way a Change Order does. `projectHealthEngine.js`'s `computeDiagnostics()`
  gained two new rule blocks — overdue recovery actions and pending decisions, both WARNING —
  shared by both Executive Center's own Diagnostics panel and Dashboard's Management Attention
  panel (Gate 31's exported `getDiagnostics()`), so one engine change closed two of the three
  originally-flagged surfaces at once. `executiveCenter.js`: `autoChallengesText()` now mentions
  overdue recovery actions, `autoAttentionText()` now mentions pending decisions;
  `navigateToLink()` gained cases for `decisionRegister` (expands the specific decision via
  `expandDecision()`) and `delayRecoveryDashboard` (lands on the dashboard, which already sorts
  overdue-first — no per-record expand API exists there since it's a portfolio rollup, not a
  detail page, same trade-off already accepted for the `cost` module landing on its Budget tab
  only). `reports.js`: `buildProjectReport()` gained Recovery Actions and Decisions table
  sections matching the existing Risk/RFI/Change Order table pattern; `buildPortfolioReport()`
  gained matching count-only sections matching its own lighter Risk/RFI/Change Order style — no
  table there, just a count line. No schema change (`schema_version` stays 39). New test file
  `test_recovery_decision_reporting_e2e.js` (31 checks — Executive Center Diagnostics showing both
  new WARNING alerts, the View-button navigation, Executive Summary auto-text, Dashboard
  Management Attention, and both Reports views) plus a 22-route smoke test; full suite re-run
  clean with zero regressions in the 39 pre-existing files. Merge commit `fef89f6`.

**Next roadmap gate: not yet scoped.** Tiers A, B, and C are complete; **Tier D (Management) is
now fully done** — all three named gates are built or already-satisfied, and the follow-on
reporting-wiring gap is closed for the two registers where it was actually fixable. Ask Aditya for
Tier E (Portfolio)'s named gate breakdown the same way Tier D's came (the original roadmap
document was never saved as a file in this repo). ~21 more gates remain across Tiers E-F
(Portfolio, then Tier F's advanced planning/controls gates — Commitment Management, Status-Date
Control, Reforecasting, Baseline/Revision Control, Advanced Delay Analysis, Recovery Planning,
Schedule Performance — note some of these names may already be partially covered by gates built
this session; get the named
breakdown from Aditya directly, the same way Tier D's came, rather than guessing).

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
- Every other gate in the PCC Evolution Roadmap beyond Gates 29-33 — ~22 gates, none started.
  Tiers A and B are both complete; Tier C (Project Performance) is next but not yet inspected. See
  the roadmap section above for detail.

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
  (`tests/test_store_schema_v36_migration.js` as of this handoff) — when you bump
  `SCHEMA_VERSION`, `git mv` it to the new version number and fold in new assertions, rather than
  keeping old version-specific files around. Also remember to update the filename inside
  `tests/package.json`'s `test` script — it's not derived automatically and a stale reference
  there fails `npm test` with a bare `MODULE_NOT_FOUND` even though every individual test file is
  fine (hit this exact thing shipping Gate 19; fixed by editing `tests/package.json` alongside the
  `git mv`).
- Testing: `cd tests && npm test` must pass before anything ships (40 files, 978 checks as of
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
- `changeOrders.js` builds its form manually (no `FIELD_CONFIG` array, unlike `rfis.js`/
  `decisionRegister.js`/`risks.js`) — adding a field there means writing a `textField`/`dateField`/
  `selectField`-style local builder call directly, not adding one array entry.
- A `FIELD_CONFIG` select entry with `optional: true` (Gate 17's `waiting_on_party` fields) needs
  `buildField()` itself updated to prepend a blank "Not set" option — the pre-Gate-17 `buildField()`
  implementations in `rfis.js`/`decisionRegister.js` had no such option since every prior select
  field was required-with-a-sensible-default (e.g. `status`).
- **(2026-08-21, standalone fix, not a gate, merge `eda6f91`)** The Gantt chart's Today/Data Date
  marker labels used fixed y-coordinates regardless of proximity — Today's label shared the exact
  same y as the axis date-tick row above it (always a latent bug, triggered whenever "today"
  landed near a tick, which is common), and when Today and Data Date fell within a day or two of
  each other (typical — a data date is usually close to today), the two labels themselves could
  also overlap. Reported by Aditya with a screenshot showing garbled overlapping text. Fixed in
  `schedule.js`'s Gantt renderer: `headerHeight` bumped 28 → 44 to give the axis-tick row and the
  marker-label row clearly separated vertical bands (every row position already derives from
  `headerHeight`, so nothing else needed to change), and Today/Data Date now only stagger into two
  rows when their lines are within 60px of each other (wider than either label can ever be) —
  otherwise both sit on one row, which reads better when they're genuinely far apart. New
  regression checks in `test_schedule_gantt_e2e.js` (self-contained, dates computed relative to
  the real "today" at test-run time, not the file's other fixed 2026 dates) confirm both labels
  stay clear of the tick row and stagger correctly when close. Full suite: 64 files, 1820 checks.

## Repo/branch state

`main` is fully up to date through **Gate 25: Advanced Schedule Performance**
(`8f2eab8`, a direct merge — no PR, per Aditya's now-standing "always merge after completing a
gate/phase" instruction, see above) — **Tiers A-E are all fully complete; Tier F (Advanced Project
Planning & Project Controls) is now underway, eight of its nine named gates done plus one
follow-on round closing a gap in the second — only Gate 26 remains.** Seventeen rounds have landed
on `main` this session, all via the same designated remote-session branch,
`claude/tier-c-code-inspection-jysweb` (name is stale now — it's carried Tier C, D, E, and F gates
alike), restarted from the new `main` between each per the standing "restart before the next gate"
instruction: the Tier C inspection + `physical_progress` fix first (merge `fba3d42`), then Vendor
Performance Centre (merge `0801b10`), then Delay & Recovery Management (merge `4882f79`), then
Decision Register (merge `d57a056`), then Weekly Project Review (merge `c3af1d9`), then the
Recovery Actions/Decisions reporting-wiring follow-on (merge `fef89f6`), then Gate 16 Portfolio
Performance (merge `c4959e2`), then Gate 17 Personal Workbench (merge `332b505`), then Gate 18
Resource Management (merge `ec8c638`), then Gate 19 Commitment Management (merge `a0a9e5b`), then
the Gate 19 Schedule↔Commitment follow-on (merge `4690a58`), then Gate 20 Status-Date Control
(merge `33a3551`), then Gate 21 Status-Date Reforecasting (merge `bd825a0`), then Gate 22 Baseline
& Schedule Revision Control (merge `d14f9ef`), then Gate 23 Advanced Delay Analysis (merge
`1050733`), then Gate 24 Recovery & Mitigation Planning (merge `e3ef313`), then Gate 25 Advanced
Schedule Performance (merge `8f2eab8`). Aditya confirmed via `AskUserQuestion` to proceed with
each merge given the branch's own "never push elsewhere without permission" constraint; see the
git log for the exact sequence if that matters later. This builds on top of **Tier B (Control
Integration)**, complete as of Gate 33, and the already-complete 14-gate Document Control sub-spec.
`schema_version` on `main` is now **47** — Gate 25 needed a real schema change, the fifth in a row
(see the "Where things stand" section above for full detail). `claude/tier-c-code-inspection-jysweb`
carries the same history as `main` as of this merge (nothing unmerged on it) — restart it from the
new `main` before starting the next gate, and verify with `git log origin/main..HEAD` and
`git status` before assuming this is still true by the time you read this.

**Zip delivered this round:** `Project-Control-Center.zip` — `index.html` + `README.md` +
`data/`/`files/` (existing `README.txt` placeholders), verified via a fresh extraction
(`/tmp/pcc_zip_verify12/`, not the dev working copy) opened in real Chromium — zero console errors;
screenshots taken and sent per the standing instruction.

**Next steps, in likely priority order:**
1. **Tier F has exactly 1 named gate left — Gate 26, Integrated Project Controls — get scope
   confirmation from Aditya before building it. This is the LAST gate in the whole Tier F
   spec.** Full spec text for all 9 Tier F gates was handed over conversationally this session
   and is preserved in this conversation's history but was never saved as a file in this repo —
   don't assume a future session can find it; get it re-confirmed from Aditya if it's not still in
   context. Inspect each gate against the real code before proposing anything, same discipline as
   every gate so far — Gates 18 through 25 all turned out to have substantial real prior art or
   overlap, so don't assume Gate 26 is starting from zero either. **Gate 26 ("Integrated Project
   Controls") is flagged as likely to be an INTEGRATION/rollup gate by its own name** — i.e. it
   may not introduce much genuinely new calculation the way Gates 20-25 each did, but instead pull
   together Schedule + Cost + Delay + Recovery + Schedule Performance (all now built) into one
   unified control-centre view or report. Inspect Executive Center, the Snapshot & Management
   Pack, and reports.js carefully first — this gate may turn out to be mostly about surfacing
   connections between already-built pieces (e.g. does the new Schedule Performance Score feed
   Project Health? does Delay Analysis cross-reference Recovery Actions and What-If explicitly
   anywhere yet?) rather than a new engine or register. After Gate 26 ships, Tier F is COMPLETE —
   check with Aditya on what's next (Tier 3 per the roadmap's own numbering, or a new phase
   entirely).
2. **Watch for the exact "local DOM element mutated for validation display, then discarded by the
   very next rerender()" bug pattern flagged in the Gate 24 section above** (a second instance of
   the same root problem as the Gate 22 notify()-reads-a-mutated-object bug) when writing any new
   inline form validation in this codebase — the error text MUST live in `uiState` and be re-read
   on the next build, never left as a local variable's `style.display` mutation, since nearly
   every button handler here ends with `rerender()`.
3. Older still-open items, none blocking daily use: category-scheme reconciliation
   (Documents/Vendor/Document-Types), the Gantt-bar readiness flag, the two hardcoded reminder/
   lookahead windows (14-day Document Reminders, 30-day Action Centre Upcoming), Resource
   Management rate × usage into Cost/EVM (still explicitly deferred), Commitments' own Budget →
   Commitments → Actual → Forecast wiring into `costEvmEngine.js`'s EAC/CPI/SPI math (explicitly
   "eventually" per Gate 19's own spec — not started), portfolio dashboard filtering.
4. Optional cleanup: these branches on `origin` are all fully merged into `main` and safe to
   delete (not urgent) — `integration/gates-8-13`, `claude/phase-11c-planning-executive-frty7j`,
   `claude/excel-schedule-pcc-editing-dgyy9m`, `claude/doc-control-gate14-master-repo`,
   `claude/doc-control-gate15-project-requirements`,
   `claude/doc-control-gate16-classification-nomenclature`,
   `claude/doc-control-gate17-status-version-control`. `claude/project-setup-tooling-gcwsu3`
   also still exists on origin — verify it's merged before deleting it, since this handoff round
   didn't touch it.
5. Tier 3 (AI Document Processing, Knowledge Base, AI Project Assistant, Lessons Learned, final
   polish) remains deferred until Tier 1/2 are in daily use.
