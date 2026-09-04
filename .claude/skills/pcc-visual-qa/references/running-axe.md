<!--
Vendored from https://github.com/84emllc/claude-wcag-skill (MIT License, Copyright 2026 84EM LLC),
references/running-axe.md, trimmed to what applies to PCC. Kept project-local per CLAUDE.md's own
"PCC-specific knowledge stays project-local, don't pollute global skills" rule — a global install
wouldn't survive this ephemeral session's container anyway. See the original repo for the full
version (whole-site scanning, long-run/reload-survival helpers) if a future audit needs to scan
more than a handful of routes in one pass.
-->

# Running axe-core against PCC, without adding it as a dependency

PCC ships as one dependency-free `index.html` (see CLAUDE.md). axe-core is a dev-time audit tool,
not a runtime dependency — inject it into the running page during a Playwright session, never add
it to any `package.json`.

## Single page, in a real-Chromium Playwright session

```js
await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/axe-core@4/axe.min.js' });
// If this sandbox's network policy blocks the CDN, vendor axe.min.js to the scratchpad
// directory instead and point addScriptTag's `path` at the local file — never at the
// project's own src/ or index.html, and never commit it to the repo.

const results = await page.evaluate(async () => {
  const r = await axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  });
  return {
    url: location.hash || location.pathname,
    violations: r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help })),
    incomplete: r.incomplete.map(i => i.id),
    passCount: r.passes.length,
  };
});
```

The `runOnly` tag filter matters — without it axe also runs best-practice rules that aren't real
WCAG criteria, and the result can't be cited against a specific success criterion.

**Report `incomplete` alongside `violations`.** Incomplete means axe couldn't decide, not that the
check passed — `color-contrast` lands there routinely when text sits over an image or a
translucent layer (PCC's `.card-menu__dropdown`/`.modal` overlays are exactly this shape). Each
incomplete item needs a manual check before any conformance claim.

## Settle before scanning

`color-contrast` resolves against rendered pixels. PCC embeds its fonts as base64 (no external
font-load race), but still wait for layout/paint to settle before scanning a freshly-navigated
React route — `router.js`'s `flushSync`-wrapped initial mount (see CLAUDE.md) makes the DOM
present synchronously, but a `page.waitForTimeout(300)` (or `await page.evaluate(() => document.fonts.ready)`)
after navigation is still worth the one extra line to avoid a bogus contrast finding on a half-
painted frame.

## This replaces one of four required passes, not all four

axe detects roughly a third of AA failures. Always pair an automated PCC scan with the manual
keyboard-only, contrast+zoom, and screen-reader passes described in
`.claude/skills/pcc-ui/SKILL.md`'s accessibility section — never report "axe passed" as "WCAG AA
verified."

## Validate the harness before trusting a clean result

Before reporting "zero violations" on any PCC screen: deliberately break something on that page in
the running DOM (e.g. `document.querySelector('.btn--primary').removeAttribute('aria-label')` if
it has one, or strip an `alt`) and re-run the scan to confirm the harness actually reports it.
Without this check, a scan loop that silently returns nothing looks identical to a clean page.
