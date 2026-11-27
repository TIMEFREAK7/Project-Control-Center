# PCC Design System

Reference for the tokens and components that actually exist in `src/css/styles.css` today
(post the 12-gate "PCC Redesign" — see `docs/BUILD_HISTORY.md`'s "PCC Redesign" section and Gates 1-4). This
file describes the shipped system; it does not propose a new one. If a value here disagrees with
`styles.css`, `styles.css` is right and this file is stale — fix the file, don't silently follow it.

## Identity

Professional PMO/SaaS, not the original "industrial/engineering-drawing" identity (blueprint navy,
grid texture, mono-everything) — that was deliberately retired at Gate 1 of the PCC Redesign.
Calm, precise, dense-but-legible project-controls tooling. Impeccable's "Operate mode" framing
(`.claude/skills/pcc-ui/SKILL.md` §Operate) is the right lens: familiarity over novelty, the tool
should disappear into the task.

## Typography

- `--font-display: "Space Grotesk"` — page titles / title-block only.
- `--font-body: "Inter"` — everything else: labels, buttons, body copy, table cells.
- `--font-mono: "IBM Plex Mono"` — reserved for genuinely tabular/numeric alignment only
  (`.kpi-card__value`, `.project-card__figures`, `.card-stat__value`, `.progress-bar__value`,
  the `.mono` utility). Gate 1 deliberately removed mono from title-block/sidebar/footer labels
  ("instrument readout" styling) — don't reintroduce it outside numeric alignment.
- Type scale (fixed rem/px, not fluid clamp() — this is Operate mode, not a marketing page):
  `--text-xs: 11px`, `--text-sm: 12.5px`, `--text-base: 14px`, `--text-md: 15px`,
  `--text-lg: 18px`, `--text-xl: 22px`, `--text-2xl: 28px`.

## Colour

- Accent: `--signal-amber: #3d63dd` (name is historical — it's blue now, changed at Gate 1;
  don't rename the token, its value is what changed). `--signal-amber-dark: #2f4fb8` for hover/
  active states.
- Status vocabulary (semantic, not decorative — use these, not new one-off colours):
  `--status-on-track` (green `#1f9d6c`), `--status-at-risk` (amber `#d69e2e`), `--status-warning`
  (orange `#dd6b20`), `--status-critical` (red `#e53e3e`), `--status-info` (teal `#0e9aa7`,
  deliberately distinct from the blue accent).
- Dark theme surfaces: `--bg-default #0e1015` / `--bg-paper #15171e` / `--bg-paper-raised #1d2029`
  — neutral slate, not navy (Gate 1 removed the "blueprint" navy family on purpose).
- Light theme: `--bg-default #f4f5f7` / `--bg-paper #ffffff` / `--bg-paper-raised #f7f8fa`.
- `--text-primary` / `--text-secondary`, `--divider`, `--hover-bg` all theme-swapped; never
  hard-code a colour that has a token — Gate 2's own bug (hardcoded `rgba()` status tints
  silently drifting from the token values after a palette change) is exactly the failure mode
  to avoid. Grep for literal `rgba(` before shipping a new colour use.
- Elevation via `box-shadow` is reserved for genuine overlays only: `--shadow-sm/md/lg` are used
  by `.modal`, `.drawer`, `.card-menu__dropdown`, the loading overlay. Resting cards/panels
  (`.panel`, `.kpi-card`, `.project-card`, `.detail-card`) use a border only, no shadow — removed
  deliberately at Gate 2 ("shadow = elevation signal, not decoration").

## Spacing

8px-rooted scale: `--space-1: 4px` `--space-2: 8px` `--space-3: 12px` `--space-4: 16px`
`--space-5: 24px` `--space-6: 32px` `--space-7: 40px` `--space-8: 48px`. Two responsive overrides
exist (tablet ~780px tightens `--space-3/4/5` down; a wider print/dense context expands them) —
see `styles.css` lines ~1834-1842. Use the scale; don't hand-write pixel margins.

## Radius

`--radius-sm: 6px` / `--radius-md: 10px` / `--radius-lg: 16px` — softened from the original
sharper 4/8/12px "technical drawing" scale at Gate 1. Cascades through nearly every component
automatically since border-radius is tokenized almost everywhere; a hand-written `border-radius`
value on a new component is very likely wrong.

## Module accent tokens

Per-nav-group identity cue: `--module-accent-planning/controls/management/vendors/documents/
site/reporting/system` (`styles.css`, defined once in `:root` — not theme-swapped, only used at
low opacity so one hue works across both themes). `layout.js`'s `setActiveNav(routeName)` sets
`documentElement[data-nav-group]` to the active NAV_GROUPS group's slug on every navigation
(`GROUP_SLUGS` map, same file); `styles.css`'s `[data-nav-group="…"] .title-block` rules pick a
token into `--module-accent`, and `.title-block` itself renders it as a ~6% background wash + a
tinted bottom border via `color-mix()`. OVERVIEW has no rule and stays neutral (home base). This
is an identity cue only ("which area of the app am I in"), never state — deliberately a separate
palette from `--status-*`/`--signal-amber` so a module's header tint can never be misread as a
status. Applies once, app-wide, via `.title-block` (the persistent shell header) — no per-page
component changes needed, and nothing here overrides Operate mode's "colour is restrained by
default" rule, since the wash is low-opacity and the border is the only saturated element.

**Real bug hit shipping this**: a CSS comment describing this feature contained the literal
substring `--status-*/--signal-amber` — the `*/` inside it closed the comment early, and
everything until the next real `*/` got parsed as garbage, silently dropping the very next
declaration (`--module-accent-planning`) with no console error. Confirmed via real Chromium
(`getComputedStyle` returned `""` for that one token while its neighbors resolved fine) — jsdom's
test suite didn't catch it since it doesn't validate `color-mix()` output. **Never write a bare
`*/`-forming substring (e.g. `foo-*` immediately followed by `/bar`) inside a CSS comment** —
review any new comment mentioning multiple `--token-*` prefixes side by side for this before
shipping.

## Motion tokens

`--transition-fast: 120ms ease` (hover/press feedback), `--transition-base: 180ms ease`
(state/reveal transitions). See `.claude/docs/MOTION_SYSTEM.md` for usage rules — the tokens
already exist and are already within Impeccable's Operate-mode 150-250ms band; the real gap found
during this audit is that **no `prefers-reduced-motion` rule exists anywhere in `src/`** (grep
confirmed zero matches) — every transition currently runs unconditionally.

## Layout constants

`--sidebar-width: 236px`. Real breakpoints in active use (`styles.css`, grep-verified): persistent
desktop sidebar at `min-width: 1024px`; collapse to hamburger+overlay drawer at `max-width: 1023px`
/ `780px`; tighter mobile tuning at `480px` and `420px`. A dedicated `@media print` block exists
for report views. See `UI_ARCHITECTURE.md` for the shell structure these apply to.

## Components (existing, don't reinvent)

`.panel`, `.kpi-card` (+`--link` variant), `.btn` (+`--primary`/`--ghost`/`--sm`/`--danger`),
`.toast` (+`--success`/`--error`/`--info`/`--warning`), `.tab-bar`/`.tab-btn` (+`--active`),
`.card-menu` (+`__overlay`/`__dropdown`/`__item`/`__checkbox-item`), `.status-badge`
(+`--on_track`/`--at_risk`/`--warning`/`--critical`/`--complete`/`--info`), `.modal`
(+`__header`/`__title`/`__body`/`__footer`, `.modal-overlay`), `.drawer` (+`--left`,
`__header`/`__title`/`__body`, `.drawer-overlay`; reuses `.sidebar__nav`/`.sidebar__link`
internally — the mobile drawer and desktop sidebar share one nav renderer, `buildNavList()`,
per Gate 4; never build a second nav implementation).

Every interactive component should define default/hover/focus/active/disabled states at minimum
(loading/error where applicable) — Impeccable's Operate-mode rule, and this audit's per-component
check (`VISUAL_QA.md`) verifies it, doesn't assume it.

## Icons

27 nav-route SVG icons + 7 shell-chrome icons, `stroke="currentColor"`, 24×24 viewBox, inherit
`.sidebar__link`'s colour (Gate 3). Any new nav destination needs a new icon built the same way,
checked against neighbours for silhouette collisions at actual render size (Gate 3 caught and
fixed a real Meetings/Resources lookalike this way — don't skip the zoomed-comparison check).

## Phase 7 target (decided at Gate 7.0, 2026-11-26 — NOT shipped yet)

Everything above describes `styles.css` as it ships today. This section is what Aditya chose
from the Gate 7.0 comparison sheets (Variant A). Gate 7.2 puts the tokens into `styles.css`
(token NAMES stay; only values change), Gate 7.3 the shell and icons, Gate 7.4 the components.
Once a value ships, move it up into the sections above and delete it here.

**Gate 7.1 (shipped) left interim tokens for 7.2 to fold in by value:** `--text-9`, `--text-10`,
`--text-10-5`, `--text-12`, `--text-13`, `--text-13-5`, `--text-17`, `--text-20`, `--text-24`
(each at exactly that px), `--radius-xs: 4px`, and `--surface-2: #2a2a2a` / `--border-default:
#444` in `:root`, which are dark greys in BOTH themes today (a pre-existing light-mode bug kept
as-is in 7.1). 7.2 gives those two real per-theme values and maps every interim size onto the
final scale.

**Typeface: Inter for everything.** Titles, body and figures in one family; weight and size do
the work. Figures use `font-variant-numeric: tabular-nums`, weight 600. `--font-display` becomes
Inter (Space Grotesk's two files, ~26 KB, are removed in 7.2). `--font-mono` (IBM Plex Mono)
stays only for identifiers: activity IDs, document numbers, codes (`.mono`), never KPI figures
or labels.

**Colour tokens:**

| Token | Light | Dark |
|---|---|---|
| `--bg-default` (page = content surface) | `#ffffff` | `#0b0f14` |
| `--bg-paper` | `#ffffff` | `#0b0f14` |
| `--bg-paper-raised` (menus, raised rows) | `#f8fafc` | `#111821` |
| `--text-primary` | `#0f172a` | `#e2e8f0` |
| `--text-secondary` | `#475569` | `#94a3b8` |
| `--divider` (hairlines) | `#e2e8f0` | `#1e293b` |
| `--hover-bg` | `#f1f5f9` | `#131b26` |
| `--signal-amber` (the accent: selection, focus, links only) | `#2563eb` | `#60a5fa` |
| `--signal-amber-dark` | `#1d4ed8` | `#3b82f6` |
| new `--ink` / `--on-ink` (primary button) | `#0f172a` / `#ffffff` | `#e2e8f0` / `#0b0f14` |

Status tokens (`--status-on-track/at-risk/warning/critical/info`) keep their names and hues; 7.2
re-measures each on the new surfaces and adjusts lightness only where contrast needs it. Contrast
target 4.5:1, measured with axe (the 7.0 preview of these values had zero color-contrast
failures on Dashboard, Schedule Activities and Risk Register, both themes, both sizes).

**Primary button: ink** (`--ink` fill, `--on-ink` text). The accent never fills a button.

**Geometry:** `--radius-sm: 6px` (controls), `--radius-md: 8px` and `--radius-lg: 8px` (cards).
No shadow at rest; shadows only on things that float (menus, dialogs, toasts, drawer).

**Structure:** page and content share one surface; sections split by space + a hairline; a
bordered card only for a discrete object (a project, a risk, a dialog). KPIs as one stat strip
with hairline dividers (two columns on phones). Status in lists = small dot + text, the neutral
state (`--info`, complete) uncoloured; pills stay for record headers and cards. Sentence-case
labels; uppercase tracking only on table column headers. One tab design (underline).

**Module tint: hairline.** No wash on `.title-block`; a 2 px bottom border mixing
`--module-accent` 55% into `--divider`. OVERVIEW stays neutral.

**Title block:** kept and refined as the one distinctive element: crisp hairline cells between
Sheet / Company / Client / Project / Date.

**Icons: Kubai duotone** (`kubai-icons`, `icons-duotone/`, MIT; keep its copyright notice in the
source that embeds them). Static only, no hover motion. Body and accent both `currentColor`
(body at 0.3 opacity): `--text-secondary` at rest, `--signal-amber` on the active item. Exported
with the pack's `styles/duotone/export.mjs` (`--size 18`). Route → icon:
dashboard `grid` · myWork `list-checks` · actionCentre `bell` · projectLookahead `calendar` ·
portfolio `briefcase` · organizations `building-office` · projectWorkspace `layers` ·
executiveCenter `chart-bar` · vendors `truck` · vendorPerformanceCentre `chart-line` ·
documents `folder` · documentTypes `file-text` · documentControlDashboard `clipboard` ·
dailylog `notebook` · risks `triangle-alert` · meetings `messages-square` · rfis `circle-help` ·
changeOrders `file-diff` · decisionRegister `flag` · lessonsLearned `bookmark` ·
knowledgeBase `book-open` · schedule `chart-gantt` · delayRecoveryDashboard `alarm-clock` ·
cost `wallet` · commitments `receipt` · resources `users` · reports `file-chart` · settings `settings`.
Weak fits to redraw with the pack's duotone rules in 7.3: rfis, changeOrders, projectLookahead.
