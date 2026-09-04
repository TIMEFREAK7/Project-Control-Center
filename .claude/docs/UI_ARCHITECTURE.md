# PCC UI Architecture

Where things live and how navigation/rendering actually works, as of 2026-09-04 (full React +
strict-mode TypeScript migration complete — see `HANDOFF.md`'s "TypeScript conversion — COMPLETE"
section). This is a map for UI work, not a proposal — see CLAUDE.md's own "Architecture" section
for the authoritative, longer version; this file is the UI-specific subset kept close to
`.claude/skills/pcc-ui/`.

## Shell

`src/js/layout.js` builds the persistent chrome: sidebar (desktop ≥1024px, collapsible,
`buildNavList()` shared with the mobile drawer), title-block header (page title + metadata cells,
still one shared DOM/class per Gate 2's deferred note), footer status bar, hamburger+overlay drawer
below 1024px. 27 nav routes, real SVG icons since Gate 3 (not two-letter codes).

## Routing

`src/js/router.js` (48 lines) — hash-based (`#/dashboard` etc.), a flat `routes` map, no route
params. `router.render()` calls `window.PCC.reactBridge.unmount()` before wiping `#page-outlet`,
then the target page's render function. Every route is React now (`window.PCC.pages.<name>` is a
~10-line stub calling `reactBridge.mount(reactPages.<name>, {}, outlet)`); the router's contract to
page modules is unchanged from the vanilla-JS era, so it doesn't need to know that.

**No shared "current project" context exists** — every project-scoped page keeps its own
module-local project filter state; this was flagged as a real architectural gap during the PCC
Redesign's Phase A inspection (its own Gate 6, "Global Project Context") and, per HANDOFF.md's
"Next phase" section, has not been confirmed as started. Don't assume cross-page project context
exists when scoping new work — check the current gate status with Aditya first.

## Page / component layer

`react/src/pages/*.tsx` (strict TypeScript) — one component per route, registered onto
`window.PCC.reactPages.<name>` by `react/src/index.js`. Each page has a thin service module in
`react/src/services/*.ts` that wraps `window.PCC.*` engine/store globals — **React never owns core
calculations** (CPM, EVM, delay impact, etc. all stay in `src/js/*Engine.js`, called through the
service layer, never reimplemented). See CLAUDE.md's React-migration bullet list for the specific,
hard-won gotchas (stale-reference refresh bug, `flushSync`-only-covers-initial-mount, one-shot
pending-prop timing, the router's `suppressNextHashRender` race) — those are correctness
constraints on any future React page work, not optional reading.

## Styling

One file, `src/css/styles.css`, tokens at the top (`:root`, plus a `[data-theme="dark"]` /
`prefers-color-scheme` pair — see DESIGN_SYSTEM.md). No CSS-in-JS, no Tailwind, no CSS modules —
every component styles via plain class selectors shared between whatever page uses them. A new
component's classes go in this one file, following the existing naming convention (`.block__elem`,
`.block--modifier`), not a new stylesheet.

## Build

`node build.js` — runs the `react/` esbuild step first (must run before `node build.js` bundles
`src/`, and `js/vendor/react-bundle.js` must load before `js/vendor/jszip.min.js` in `JS_ORDER` —
see CLAUDE.md for why), then `tsc --noEmit` (added at the TypeScript pilot, fails the build on a
real type error), then inlines everything into the single `index.html`. Any new `src/js/*.js` file
needs adding to `JS_ORDER` or it silently doesn't ship.

## Responsive shape (what actually changes, not just "shrinks")

Real breakpoints in `styles.css` (grep-verified): `min-width:1024px` (persistent sidebar on),
`max-width:1023px`/`780px` (hamburger+drawer, tablet-tier spacing tightening), `480px`/`420px`
(further mobile tuning), plus a dedicated `@media print` block for reports. Navigation genuinely
restructures (sidebar → drawer), not just visually shrinks — matching this master prompt's own
"Responsive Design Rule" (§10) which is already, independently, the app's real practice.

## Cross-cutting gotchas worth knowing before touching shared UI

- A trashed/hidden document must stay excluded from every consumer — Phase 6 (Document/File
  Storage Engine) found 17 call sites across 11 page modules that had to be fixed together when
  "hidden" was introduced; grep app-wide for any collection a new "hide from view" concept needs
  to affect, don't assume one page is the only consumer.
- Never assume a `window.PCC.store.get()`-derived value used in a React `useState` refresh is
  fresh without wrapping it (`Object.assign({}, ...)`) — see CLAUDE.md's own bug writeup.
