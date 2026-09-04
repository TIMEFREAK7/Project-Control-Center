# PCC Design System

Reference for the tokens and components that actually exist in `src/css/styles.css` today
(post the 12-gate "PCC Redesign" — see `README.md`'s "PCC Redesign" section and Gates 1-4). This
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
