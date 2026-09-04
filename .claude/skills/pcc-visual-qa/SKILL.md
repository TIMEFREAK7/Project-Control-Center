---
name: pcc-visual-qa
description: >
  Real-Chromium visual QA procedure for Project Control Center — viewport matrix, per-screen
  checklist, and the axe-core injection method for accessibility scanning. Use when asked to
  visually verify a PCC UI change, run a responsive check, or audit a screen before shipping.
  Uses PCC's already-established Playwright/Chromium QA method; does not introduce a new tool.
---

# PCC Visual QA Skill

Full procedure: `.claude/docs/VISUAL_QA.md`. This file is the quick-start; read that doc for the
complete checklist and report format.

## Quick start

1. `node build.js` (never audit unbundled `src/` — `index.html` is the real artifact).
2. Launch real Chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome --no-sandbox`, driven
   via the globally installed `playwright` package, pointed at the built `index.html`.
3. Walk the viewport matrix in `VISUAL_QA.md` (desktop 1920/1440/1280, tablet 1024×768 — exactly
   PCC's sidebar breakpoint, test both sides — mobile 412/390, plus one intermediate width).
4. Per screen: layout/typography/components/data/responsive/motion checklist in `VISUAL_QA.md`.
5. Accessibility: inject axe-core per `.claude/skills/pcc-visual-qa/references/running-axe.md`,
   then the three manual passes (keyboard-only, contrast+zoom, screen-reader/semantics) — an
   automated scan alone is never sufficient to claim WCAG AA.
6. Test with realistic data — long names, multiple simultaneous statuses, overdue items, empty
   datasets — never only the seed/demo data.
7. `cd tests && npm test` before and after any change — 0 new failures is the gate, not optional.
8. Report findings in the GATE format from `VISUAL_QA.md` / the master toolchain prompt's §29,
   with Impeccable's P0-P3 severity on every finding.

## Scope discipline

This skill reports findings. It does not fix them as a side effect of auditing — CLAUDE.md's own
"scope discipline" standing instruction and this repo's gate-by-gate history (every redesign gate
was proposed, confirmed, then built — never bundled into an audit) both apply here. A "fresh gap
audit" run should end in a findings report, not a diff, unless the user explicitly asked for fixes
in the same pass.
