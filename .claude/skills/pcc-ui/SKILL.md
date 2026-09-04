---
name: pcc-ui
description: >
  PCC-specific UI/UX engineering rules — information hierarchy, navigation, component reuse,
  responsive/motion/accessibility standards, and the project's actual design-system state. Use
  before any UI/UX change to Project Control Center (dashboards, registers, schedule/Gantt,
  forms, reports). Distilled from Impeccable (pbakaus/impeccable), the WCAG 2.2 AA skill
  (84emllc/claude-wcag-skill), and delphi-ai/animate-skill, adapted to PCC's real constraints —
  not a generic frontend checklist.
---

# PCC UI Skill

Read `.claude/docs/DESIGN_SYSTEM.md`, `UX_RULES.md`, `MOTION_SYSTEM.md`, `UI_ARCHITECTURE.md`, and
`VISUAL_QA.md` first — this file is the entry point and the accessibility/critique-rubric
reference; those files hold the actual token values, component list, and architecture.

**Before any UI change**: check `HANDOFF.md`'s "Next phase" section for what's already been
decided or already shipped. This app has run multiple full UI/UX redesign programs already (UI
Modernization, an 8-gate UI/UX Overhaul, and the 12-gate "PCC Redesign" — Visual Language
Foundation, Component Restyling, Icon System, Navigation Architecture all done as of 2026-08-22).
Don't propose "modernize the UI" as if starting from zero; check what gate this actually is.

## Register: this is all "Operate" mode (Impeccable's term)

Every PCC screen is Operate mode — the user is completing a task (data entry, review, analysis),
not being persuaded or entertained. Concretely, that means:

- One type family carries everything (`--font-body`/Inter) except page titles
  (`--font-display`/Space Grotesk) and genuinely numeric alignment (`--font-mono`). Don't add a
  second display face "for personality."
- Fixed rem/px type scale, not fluid `clamp()` — desktop-first tool, consistent DPI expectation.
- Colour defaults to restrained: the accent (`--signal-amber`, now blue) marks primary actions,
  current selection, and state — never decoration. A single surface (e.g. a KPI dashboard) can
  earn more colour commitment; that's the exception, not the default.
- Standard navigation/form affordances only — no custom scrollbars, no invented modal behavior,
  no reinvented dropdowns. `.modal`/`.drawer` already exist; reuse them.
- **Modal is not the first thought.** Exhaust inline/progressive alternatives (an expandable
  Details panel, a drawer) before reaching for a new `.modal`. PCC already has a working
  expandable-panel pattern (Portfolio's Details panel) — prefer extending that pattern.
- Density is allowed and expected — this is a professional tool for someone who wants to see 40
  activities at once, not a consumer app that needs breathing room to feel "clean." See
  `UX_RULES.md`'s Information Density section for how to handle it without shrinking text.

## Schedule / Gantt — hard constraint

The Gantt UI **consumes** `scheduleCpmEngine.js`'s persisted results (`total_float`,
`early_finish`, etc.) — never recompute them in the UI layer, and never modify the CPM engine to
make rendering easier. See CLAUDE.md's note on `delayImpactEngine.js` being read-only over the CPM
engine's output — the same constraint applies to any UI work touching the Gantt. Activity IDs,
durations, relationship types (FS/SS/FF/SF), critical path, float, baseline, actuals, forecast,
and status date are all protected data — a UI change must not silently alter any of them.

## Delay Register — hard constraint

Not standalone CRUD. Preserve the full chain: delay event → cause → affected activity → schedule
impact → responsible party → risk/issue → evidence → mitigation → recovery action → forecast
impact → final outcome. The schedule stays the source of truth for schedule impact — no UI
shortcut that computes or overrides impact outside the CPM engine.

## Accessibility (WCAG 2.2 AA — condensed from the vendored skill)

Full checklist and per-criterion text: request the upstream `84emllc/claude-wcag-skill` repo's
`references/wcag-2.2-full.md` if a specific criterion's exact wording is needed (not vendored here
— it's the verbatim W3C spec, large, and rarely needed word-for-word). Four required passes, one
automated scan is never sufficient — see `.claude/skills/pcc-visual-qa/references/running-axe.md`
for how to run the automated pass against PCC specifically without adding a dependency.

**New in WCAG 2.2, most commonly missed — check these first on any PCC screen:**

| # | Name | Check |
|---|------|-------|
| 2.4.11 | Focus Not Obscured | Focused element not hidden behind PCC's sticky title-block/footer |
| 2.5.7 | Dragging Movements | Gantt drag-move needs a non-drag (click/keyboard) alternative |
| 2.5.8 | Target Size | Pointer targets ≥24×24 CSS px — `.icon-btn` already has a regression test for this, don't break it |
| 3.2.6 | Consistent Help | N/A today (no in-app help mechanism) — note if one is ever added |
| 3.3.7 | Redundant Entry | Don't re-ask for data already entered in the same flow/form |
| 3.3.8 | Accessible Auth | N/A — PCC has no authentication |

**Common mistakes to catch in review**: colour alone signalling status (every `.status-badge`
already pairs colour with text — keep that); `outline:none` with no `:focus-visible` replacement;
placeholder used as the only label; `role="button"` on a `<div>` instead of a real `<button>`.

## Motion

See `MOTION_SYSTEM.md`. One live finding as of this audit: **no `prefers-reduced-motion` rule
exists anywhere in `src/`** — grep-confirmed. Any new animation work should add the guard from
`MOTION_SYSTEM.md` rather than adding one more unconditional transition on top of the gap.

## Reference material worth pulling in for a deeper critique pass

The full Impeccable critique rubric (Nielsen's 10 heuristics, cognitive-load checklist,
persona-based testing) lives in the upstream `pbakaus/impeccable` repo at
`skill/reference/critique.md` — not vendored verbatim here (it's 800+ lines, tool-mechanics-heavy,
and assumes the `npx impeccable` CLI PCC doesn't run). If a future audit wants the full heuristic
scoring pass, re-clone that repo and read `critique.md` directly rather than relying on a stale
local copy. The parts that generalize cleanly and *are* captured here: the 5-dimension audit rubric
below, and Operate-mode's typography/colour/layout/motion rules (already folded into
`DESIGN_SYSTEM.md`/`UX_RULES.md`/`MOTION_SYSTEM.md`).

### Audit scoring rubric (from Impeccable's `audit.md`, adapted)

Score 0-4 per dimension when running a fresh gap audit: **Accessibility**, **Performance**,
**Theming** (token discipline — hardcoded colours are the #1 historical PCC bug, see Gate 2's
writeup), **Responsive Design**, **Implementation Integrity** (does it look like one coherent
product, or bolted-together patterns). Tag every finding P0 (blocking) through P3 (polish, no real
user impact) — never report a finding without its user-facing impact and a specific fix, and
always note what's already working, not just gaps.
