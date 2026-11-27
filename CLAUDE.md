# Project Control Center

Offline-first project/portfolio management app for one person (Aditya), shipped as ONE
self-contained `index.html`. Rules only here; the story behind each is in `docs/GOTCHAS.md`
(the previous CLAUDE.md, unedited; section names below). Build history: `docs/BUILD_HISTORY.md`.
**Next work: `DEFERRED_ROADMAP.md`**; update a gate's Status line when it closes. State: `HANDOFF.md`.

## Commands
```
cd react && npm install; cd ../tests && npm install   # once per clone (also mirror-app/)
git config core.hooksPath .githooks   # once per clone: pre-push refuses a stale index.html
node build.js            # after ANY src/ or react/src change (runs tsc + the react bundle)
cd tests && npm test     # full suite; before every merge, in UTC AND with TZ=Asia/Kolkata
node --check src/js/x.js
cd tests/visual && node shots.js --out <dir>   # Phase 7 screenshots (dev-only; npm install there once)
node mirror-app/build.js # after store/projectContext/notifications.js, the 4 shared pages,
                         # react/src/services|utils|types, styles.css or mirror-app/src changes
```
This PC (Windows, exFAT SSD, tools from `env.cmd`): the mirror build needs symlinks, so build it
from a C: temp copy with junctions (HANDOFF.md, Gate H.2). Playwright browsers: install to a temp
folder, then copy into `tools\playwright` (its lock fails on exFAT).

## Closed decisions (don't reopen without a new reason)
`.mpp` import (no dependency-free parser; MSP XML covers it) · UI/UX Overhaul Gate 6 (superseded
by the Redesign + React) · title-block DOM split (no room at phone width) · Content Security
Policy (would need `'unsafe-inline'`) · separate Spreadsheet Review (inside Document Review) ·
AI on Android (Ollama on the LAN without auth) · `.sml`/`.plf` import (not used) · master-prompt
Phases 8–9 (text lost) · GitHub CI (local pre-push check instead) · pdf.js 4.x (the H.1 flag is
enough) · ExcelJS stays 4.4.0 (write-only use) · Resource rate×usage cost (not picked).

## Architecture (G: Architecture)
- `src/` is the source; `index.html` is a build artifact, never hand-edit it. New `src/js` files
  must be added to `JS_ORDER` in `build.js` or they silently don't ship.
- Goal that never changes: one dependency-free `index.html` that opens from `file://`/`content://`.
  No runtime npm, no CDN, no network.
- Pages are React (`react/src/pages/*.tsx`) mounted via `reactBridge.mount()` from a ~10-line stub
  `src/js/pages/<name>.js`; route contract `window.PCC.pages.<name>` is unchanged.
  `reactBridge.js` is the only file that knows both React and the router.
- **React never owns calculations**: services in `react/src/services` call the real engines
  (`costEvmEngine`, `scheduleCpmEngine`, `delayImpactEngine`…); new maths = pure engine functions.
- `react-bundle.js` must load before `jszip.min.js` in `JS_ORDER` (jszip's `setImmediate` polyfill
  breaks React's scheduler: blank page, no error).
- A service's "snapshot for refresh" must return a fresh wrapper (`Object.assign({}, store.get())`);
  `store.get()` is one mutated object and `setState` with it is a silent no-op.
- React state resets on every remount (new root per `router.render()`); don't design or test as if
  it persists.
- Only the first render after navigation is synchronous (`flushSync` in `reactBridge`); after any
  click/typing on a mounted React page, tests `await flush()`.
- One-shot "pending prop" hand-offs are read in a `useState` initializer, never a `useEffect`.
- `router.js`'s `suppressNextHashRender` is one boolean: tests `await flush()` after every `go()`,
  even at the end of a check. Don't "fix" router.js without a real user repro.
- Tests driving React inputs: native value setter + bubbling `input`/`change` event
  (`setReactInputValue` in `test_document_types_e2e.js`); checkboxes via `el.click()`.
- Register modules share one shape distinguished by `type`; copy that, not a module.
- `delayImpactEngine.js` reads persisted CPM output; `computeProjectFinishImpact()` is per single
  delay, never in a portfolio loop.
- No "Delay Registry" collection: Schedule and the Delay & Recovery Dashboard both view
  `data.delay_records`. `delayRecoveryDashboardService.ts` duplicates `scheduleService.ts`'s
  delay labels ON PURPOSE: change a delay status/label in BOTH.
- `delay_records.comments` and `auto_generated` default safely; read `comments || []`.
  `runAutoDelayDetection()` only ever touches `auto_generated` records against the OFFICIAL
  baseline; `"resolved"` ≠ `"recovered"` ≠ `"closed"`.
- One primary action visible; the rest in a "⋯" `.card-menu__dropdown`. Before calling something
  missing, check those menus.
- Every `.modal-overlay` goes through `modalA11y.attach()` / `useModalA11y` (focus, Tab trap,
  Escape = top layer). Pass `fallbackFocus` when opened from a "⋯" item.
- Command palette owns no navigation: records jump via `filterByProject()` THEN `expand<X>()`.
  New register = one `RECORD_TYPES` entry + a `test_command_palette_e2e.js` case. Documents' API is
  `window.PCC.files`; tests of a Documents jump need a NEWER decoy in a DIFFERENT project.
- Header space at phone width is used up: new shell actions go in the nav drawer.
- No literal font size, radius or colour in React pages or `styles.css` (outside token
  definitions): use `var(--text-*)`, `var(--radius-*)`, colour tokens. `test_no_style_literals.js`
  enforces it, so restyling stays a token-value change in `styles.css`.
- Blobs (file bytes) live in IndexedDB (`blobStore.js`, binary only); everything else is one
  `localStorage` value. One IDB database `pcc_data_v1`: `blobs`, `content`, `snapshots`.
- `store.js` flushes a pending save on `pagehide`/`beforeunload`/hidden; its listeners are guarded
  because unit tests eval it against a stub `window`.

## Security (G: Security rules)
- File-derived HTML is untrusted: always `fileViewer.sanitizePreviewHtml()`, never raw `innerHTML`.
- Electron never navigates away or opens windows; never `window.open(blob:)`, use `fileViewer.open()`.
- Every `pdfjsLib.getDocument()` passes `isEvalSupported: false` (CVE-2024-4367).
- SheetJS comes from `cdn.sheetjs.com/xlsx-<ver>/package/dist/xlsx.core.min.js`, never npm (stuck at
  0.18.5); `test_sheetjs_version_e2e.js` requires ≥ 0.20.2.
- The mirror IPC writes only `pcc-mirror.json` (`ALLOWED_FILENAME`); extend the allowlist deliberately.

## Data, dates, schema (G: Dates / migrate / Bumping SCHEMA_VERSION)
- "Today" = `window.PCC.dates` (Settings → Time zone, `""` = device), never
  `toISOString().slice(0,10)`. Display via `formatDate/formatDateTime/formatTime`, never bare
  `toLocale*String()`. UTC maths on `YYYY-MM-DD` strings is fine.
- Spreadsheet `Date` cells → `dateCellToIso()`, which is DEVICE-local on purpose.
- Date-sensitive tests pin `TZ=Asia/Kolkata` with a clock inside 00:00–05:30.
- Data from a newer build is refused (`migrate()` throws `NEWER_VERSION_MESSAGE`); `load()` then
  blocks all saves. New import paths go through `migrate()`; new writes through
  `persistToLocalStorage()`.
- Storage ceiling 5,242,880 chars across all keys (`storageAnalyticsEngine.js`). Anything that adds
  a lot pre-flights with `storageFitError()` BEFORE writing to IndexedDB or `update()`.
- `migrate()`'s final backfill only adds whole missing keys; each bump still backfills its fields.
- Schema bump: a migration step (it sets the version, not the constant) + bump
  `FINAL_SCHEMA_VERSION` in `test_store_schema_v54_migration.js`. Other tests use
  `tests/schemaVersion.js`, never a literal. Current: **67**.

## Mirror app "At a Glance" (G: One-way data mirror)
- One-way Windows → Android, read-only, no write-back. `dataMirror.js` writes on Windows only
  (`settings.sync_mirror_enabled`, off by default).
- `mirror-app/` reuses the REAL Dashboard/MyWork/ActionCentre/Portfolio, their services, and
  `store.js`/`projectContext.js`/`notifications.js`; never fork them. One React copy via
  symlinks/junctions, never esbuild `--alias`/tsconfig `paths`. `shim/pcc.ts` is the map of which
  `window.PCC.*` modules are real vs. safe no-op stubs.
- `shim/writeGuard.ts` DEEP-clones (never a reference) and reverts non-settings writes, with a
  toast; success toasts are dropped. `hideWriteButtons.ts` observes `.mirror-app-shell`, not the
  re-keyed outlet. The outlet needs the real `main.page` class.
- The phone reads `pcc-mirror.json` from a user-picked folder (`MirrorFolderPlugin.java`, SAF);
  `mirrorRead.ts` uses `store.migrate()`, not `importFromJsonString()`.
- `packaging/android-mirror/` is its own Capacitor project, keystore and version.

## AI / Ollama (G: Ollama AI integration)
- Windows only, through the Electron main process (IPC `ollamaClient.js`), never renderer `fetch`.
  Off by default; absent when `isOllamaAvailable()` is false. `src/js/ollamaService.js` is the
  single gate (`isAvailable/listModels/ask`), rejecting with a displayable message.
- One pure prompt-builder per capability in `ollamaService.ts`, reading only computed/extracted
  data, capped; figures come from engines; output is a draft, never auto-saved.
- Tests stub `window.PCC_ELECTRON.ollamaGenerate`, capture the prompt and assert real seeded data.

## Release installers (G: Building release installers)
- Windows: `cd packaging && npm ci && node node_modules/electron/install.js && npm run
  electron:build` (on Linux add wine64 + wine32:i386). Never call `electron-builder` directly.
  Verify the asar's `electron/index.html` is byte-identical. No signing cert (accepted).
- Android, BOTH apps: bump `versionCode`/`versionName` every build; a real keystore is required
  (else an unsigned APK that won't install); a newly generated keystore is a NEW signing identity,
  so tell Aditya to uninstall first. Verify `apksigner` (+ cert SHA-256) and `zipalign`.
  The mirror APK needs `node mirror-app/build.js` first and its own keystore.
- Adaptive icons need `icon-only`, `icon-foreground` AND `icon-background` PNGs; check the
  generated `ic_launcher_foreground.png` is the real logo.
- Maven 429 on Linux: Google mirror init script (G). `gradlew | tee`: grep BUILD SUCCESSFUL.
- Files over ~30 MB: `split -b 25M -d -a 2`, verify SHA-256, give the `cmd /c copy /b …` command.

## Testing (G: Testing conventions)
- Tests run the real code: unit tests eval `src/js/*.js`; e2e loads the real `index.html` in jsdom
  with fake-indexeddb (stub `FileReader.readAsDataURL` where needed). Each new test is proven to
  fail on the old build first.
- UI changes: real Chromium at 1440×900 and 412×915, zero console errors, no sideways scroll,
  screenshots sent (`pcc-visual-qa` skill). The mirror app is verified only in Chromium.

## Working and shipping (G: Working conventions / PR / shipping)
- Project is mandatory on every register (no "Unassigned"). Change Orders never write
  `contract_value`. Reports are printable HTML. No File System Access API. Never rewrite a
  user's record for them. Build exactly the scope asked, nothing extra.
- Per gate: inspect, propose scope, wait for Aditya's yes, build, pass the test gate, merge to
  `main` and push (no PR needed; merge a comment-free PR without asking), restart the branch from
  `main`. Commit before any `git reset --hard`.
- After every gate: the end-user zip (`index.html`, `README.md`, `manifest.json`, `icons/`, empty
  `data/` + `files/` with their README.txt), verified from a fresh extraction in Chromium; update
  `HANDOFF.md` and send it with the zip.
- Docs per gate: a new rule → one line here + its story in `docs/GOTCHAS.md`; the gate write-up →
  append to `docs/BUILD_HISTORY.md`; `README.md` stays a short user guide (it ships in the zip).
