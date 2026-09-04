# PCC Motion System

## Current state (as of this audit, 2026-09-04)

Two motion tokens already exist and are already used app-wide: `--transition-fast: 120ms ease`
(hover/press feedback) and `--transition-base: 180ms ease` (state/reveal transitions) — both
already inside Impeccable's Operate-mode recommended band (150-250ms for product UI; PCC's
120ms hover token runs slightly under that band, which is fine for a press/hover micro-interaction
specifically, not a violation).

**Real gap found by this audit**: `grep -rn "prefers-reduced-motion" src/` returns **zero matches**.
Every transition in the app currently runs unconditionally — nothing here yet respects a user's
OS-level reduced-motion preference. This is the one concrete, actionable motion finding; see
`VISUAL_QA.md`'s Gate 1 report for how it's tracked (finding, not yet fixed — this audit is
report-only per current scope).

## Principles (apply to any new motion work)

Motion must be subtle, fast, purposeful, consistent, accessible, performant — and used only to
communicate: state change, hierarchy, causality, feedback, navigation, loading, completion. Never
decorative. This directly matches Impeccable's own Operate-mode motion rules (`operate.md`,
vendored review at `.claude/skills/pcc-ui/SKILL.md`): 150-250ms on most transitions, motion
conveys state not decoration, no orchestrated page-load sequences — PCC's `reactBridge.js`
already flushes the initial render synchronously (see CLAUDE.md's React migration notes), so a
page never gets to "watch itself load" in the first place; keep it that way.

Prefer: opacity, transform (translate/scale), and layout-driven reveals. Avoid: bouncing,
spinning (outside an actual loading spinner), unnecessary rotation, large-distance movement,
parallax, decorative loops — all explicitly called out as anti-patterns by both the vendored
animate-skill's "Golden Rules" and Impeccable's product-motion bans.

- **Only animate `transform` and `opacity`.** GPU-accelerated, no layout thrash — the vendored
  animate-skill's rule #2, and directly relevant here since `styles.css` already has some
  `transition: all` usage worth auditing case-by-case for whether it's animating a layout
  property unintentionally.
- **Exits faster than enters** — roughly 75% of the enter duration (animate-skill's rule #1).
  Applies to `.modal`/`.drawer`/`.toast` show/hide once those get explicit enter/exit timing.
- **200-300ms is the general sweet spot** — PCC's own `--transition-base` (180ms) already runs
  a bit under that, which is appropriate for product UI (users are in flow, not watching
  choreography); don't push existing transitions slower to hit an arbitrary "sweet spot" number.

## What NOT to add

PCC's React layer bundles React+ReactDOM directly (no CDN, no runtime npm dependency — see
CLAUDE.md's React migration section). **Do not add Framer Motion** (the library the vendored
animate-skill's React examples lean on) as a new runtime dependency — that would violate the
single-dependency-free-`index.html` architecture this whole app is built around. Any React-side
motion work stays CSS-transition-based (className toggles driving the existing `--transition-*`
tokens), matching the plain-DOM motion approach the vanilla pages already use — not a new library.

## Reduced motion (the concrete gap)

When motion work is scoped, the fix is a standard, low-risk CSS addition — not a design decision:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Per Impeccable's own accessibility check, a blanket `0.01ms` kill is flagged if it destroys a
transition that's carrying real state-change feedback the user needs (not just decoration) — worth
a second pass once this is actually implemented to confirm nothing load-bearing (e.g. the Gantt
drag-move visual feedback) goes silently invisible under reduced motion, rather than just gated to
instant.
