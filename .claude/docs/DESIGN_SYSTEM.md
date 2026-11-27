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

- **Inter for everything** (Gate 7.2): `--font-display` and `--font-body` are both Inter; Space
  Grotesk was removed (−33.7 KB per app). Figures (`.kpi-card__value` incl. `.kpi-card__value.mono`,
  `.card-stat__value`, `.progress-bar__value`, `.project-card__figures`) use Inter with
  `font-variant-numeric: tabular-nums` (verified: the bundled subset has tabular digits).
- `--font-mono: "IBM Plex Mono"` — identifiers only (`.mono`: RFI/CO numbers, codes, file names,
  paths). ~6 `.mono` uses on dates/scores are left for the Gate 7.5 page passes.
- Type scale (fixed px, not fluid clamp() — Operate mode): `--text-xs: 11px`, `--text-sm: 12.5px`,
  `--text-base: 14px`, `--text-md: 15px`, `--text-lg: 18px`, `--text-xl: 22px`, `--text-2xl: 28px`.
  Gate 7.1's `--text-9/10/10-5/12/13/13-5/17/20/24` are aliases onto it since 7.2
  (9–10.5→xs, 12–13→sm, 13.5→base, 17→lg, 20–24→xl). No literal sizes anywhere
  (`test_no_style_literals.js`).

## Colour

- Accent (selection, focus, links only): `--signal-amber` `#2563eb` light / `#60a5fa` dark (name is
  historical; never rename). Primary buttons are **ink**: `--ink`/`--on-ink` `#0f172a`/`#fff`
  light, `#e2e8f0`/`#0b0f14` dark (Gate 7.2).
- Status vocabulary (semantic, not decorative): `--status-on-track/at-risk/warning/critical/info`.
  Dark keeps the `:root` hues (`#1f9d6c #d69e2e #dd6b20 #e53e3e #0e9aa7`). Light overrides them
  darker (`#1a855b #956e20 #ba5a1b #d63a3a #0c818c`) so status text clears 4.6:1 on white; the
  `--status-badge-*-text` and `--heatmap-high-text` shades were re-solved against the new tints.
  Values solved per colour for >= 4.6:1 in every text use (scratch script), not eyeballed.
- Surfaces (page and content share one): dark `#0b0f14` / raised `#111821`; light `#ffffff` /
  raised `#f8fafc`. Text `#e2e8f0`/`#94a3b8` dark, `#0f172a`/`#475569` light. Hairline
  `--divider` `#1e293b` / `#e2e8f0`. `--surface-2`/`--border-default` are per theme since 7.2.
- Placeholders use `--text-secondary` app-wide (the browser grey was 4.17:1 on dark).
- Measured at Gate 7.2 with axe on 28 screens × both themes: 0 color-contrast failures (22 before).
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

`--radius-xs: 4px` (tags) / `--radius-sm: 6px` (controls) / `--radius-md: 8px` and `--radius-lg:
8px` (cards) since Gate 7.2 (was 6/10/16). Cascades through nearly every component
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

## Phase 7 target (decided at Gate 7.0, 2026-11-26)

**Shipped in Gate 7.2 (now in the sections above):** typeface, all colour tokens, ink primary
button, radii, the interim-size fold, and the two module hues moved off violet (planning
`hsl(60 38% 42%)`, management `hsl(130 26% 42%)`). **Still to ship:** structure (7.4), module
tint as a hairline, title block and Kubai icons (7.3). The text below is the original decision.

Everything above describes `styles.css` as it ships today. This section is what Aditya chose
from the Gate 7.0 comparison sheets (Variant A). Gate 7.2 puts the tokens into `styles.css`
(token NAMES stay; only values change), Gate 7.3 the shell and icons, Gate 7.4 the components.
Once a value ships, move it up into the sections above and delete it here.

**Gate 7.1's interim tokens are resolved (Gate 7.2):** the `--text-9` … `--text-24` sizes alias the
named scale, and `--surface-2` / `--border-default` have per-theme values (they were one dark grey
in both themes before).

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
