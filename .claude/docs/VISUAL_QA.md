# PCC Visual QA Procedure

This app's real QA method is already real-Chromium via Playwright — CLAUDE.md documents this
explicitly and every gate in HANDOFF.md uses it. This doc formalizes the checklist so a future
audit doesn't have to reinvent it; it does not introduce a new tool.

## Environment

- `/opt/pw-browsers/chromium-1194/chrome-linux/chrome --no-sandbox`, driven by the globally
  installed `playwright` package (`/opt/node22/lib/node_modules/playwright`) in this sandbox.
- Always test the **built** `index.html` (`node build.js` first) via a real `file://` (or
  `http://localhost` for convenience — but confirm `file://` too before shipping, since Documents/
  Android/`content://` behavior only shows up there) — never the unbundled `src/`.

## Viewport matrix (master prompt §18, adopted as-is — matches real device classes)

Desktop: 1920×1080, 1440×900, 1280×800. Tablet: 1024×768 (exactly PCC's own sidebar breakpoint —
test both sides of it). Mobile: 412×915, 390×844. One intermediate width between tablet and mobile
(e.g. 900px) to catch a breakpoint gap the two named tiers alone would miss.

## Per-screen checklist

**Layout**: clipping, overflow (`overflow-x` should never appear on `<body>` — wide tables/Gantt
must scroll in their own container), alignment, whitespace, section ordering at each breakpoint.

**Typography**: readability, hierarchy, wrapping/truncation of long real values (see Data below),
line-height, no ad-hoc font-size outside the type scale.

**Components**: every interactive element's default/hover/focus/active/disabled states actually
exist (not assumed) — see DESIGN_SYSTEM.md's component list.

**Data**: test with realistic project-controls data, not "Project A"/"Task 1" — long project and
activity names, multiple statuses simultaneously visible, overdue items, large tables, empty
datasets, missing/null fields, conflicting states. A screen that only works with tidy seed data is
not verified.

**Responsive**: nav (sidebar↔drawer transition at 1024px), tables (horizontal scroll containment),
filters, dialogs (`.modal`/`.drawer` — never viewport-clipped), the Gantt chart, touch target size
(≥24×24 CSS px per WCAG 2.5.8, PCC's own `.icon-btn` sizing has an existing regression test —
`test_uiux_gate8_tablet_mobile_e2e.js` — don't break what it already asserts).

**Motion**: no unnecessary/decorative animation, no jank, transitions actually complete (not
interrupted mid-flight by a re-render), reduced-motion behaviour once implemented (see
`MOTION_SYSTEM.md` — currently unimplemented, tracked as a finding, not yet checkable).

## Accessibility pass (see `.claude/skills/pcc-ui/SKILL.md` for the full WCAG summary)

Four passes, per the vendored WCAG skill — a green automated scan alone is never sufficient:

1. **Automated**: inject axe-core into the running page (don't add it as a project dependency —
   this app ships as one dependency-free file; axe stays dev-time only, exactly the same
   discipline this repo already applies to Playwright itself). See the vendored snippet at
   `.claude/skills/pcc-visual-qa/references/running-axe.md`.
2. **Keyboard-only**: tab through the full flow — every interactive element reachable, visible
   focus ring, logical order, `Esc` closes `.modal`/`.drawer`, no trap.
3. **Contrast + zoom**: 4.5:1 text / 3:1 large-text-and-UI (`--status-*` badges against their
   background tint are the most likely place for a silent regression — Gate 2's own bug was
   exactly a background-tint drift after a token change); reflow at 320px/400% zoom, no
   horizontal scroll.
4. **Screen-reader/semantics**: heading order, landmarks, real `<button>`/`<label>` semantics
   (not `role="button"` on a `<div>`), meaningful alt text, dynamic status announced via a live
   region.

## Regression discipline

Before and after any UI change: `node build.js` then `cd tests && npm test` (currently 2,630+
checks) must show 0 new failures. A UI/UX gate is never "done" from source-code inspection alone —
this master prompt's own §14/§29 rule, already this project's standing practice per CLAUDE.md's
Testing conventions section.

## Report format

Match the master prompt's own GATE report shape (§29): STATUS, INSPECTED, CHANGED, TESTED, ISSUES
FOUND (with severity), ISSUES FIXED, ISSUES REMAINING, REGRESSION STATUS, NEXT STEP. Findings use
Impeccable's P0-P3 severity scale (P0 blocking → P3 polish, no real user impact) — see
`.claude/skills/pcc-ui/SKILL.md`'s audit rubric for the exact bands.
