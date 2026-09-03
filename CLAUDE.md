# Project Control Center

Solo-developer, offline-first project/portfolio management app for one person. See `README.md`
for the full phase-by-phase build history and feature rationale — read it before making changes,
it documents *why* things are shaped the way they are, not just what exists.

## Architecture

- **Source of truth is `src/`** — `src/js/*.js`, `src/js/pages/*.js`, `src/css/styles.css`,
  `src/js/vendor/*.js`, fonts. **`index.html` at the repo root is a generated build artifact.**
  Never hand-edit `index.html` — edit `src/`, then rebuild.
- **Build:** `node build.js` bundles everything in `src/` (in the exact order defined by
  `JS_ORDER` in `build.js`) into the single self-contained `index.html`. Run this after every
  change to `src/`. New files must be added to `JS_ORDER` or they silently won't ship. This now
  also runs the `react/` build first (see below) — `node build.js` stays the one command.
- **Vanilla JS by default, hash-based routing** (`src/js/router.js`), plain DOM manipulation per
  page module — still true for every page not yet migrated to React. This was originally an
  absolute "no framework, no npm deps" rule; the Post-Phase-5 Engineering Evolution's React
  migration (started with the Storage Management page) revises it specifically for the
  **frontend UI layer**, while preserving the actual goal that rule protected: a single
  dependency-free `index.html` that opens via `file://`/`content://` with zero install for the end
  user. See "React migration" below for how that's kept true.
- **React migration (progressive, one page at a time — Post-Phase-5 Engineering Evolution).**
  React source lives in `react/src/` (its own `package.json`, `node_modules` — dev/build-time
  only, `cd react && npm install` once). `react/src/index.js` bundles React + ReactDOM directly in
  via esbuild (`react/package.json`'s `build` script) into `js/vendor/react-bundle.js`, an IIFE
  with no CDN and no runtime npm dependency — `node build.js` runs this automatically before
  bundling `src/` (fails with a clear message if `react/node_modules` is missing). The output
  gets inlined into `index.html` exactly like every other vendor library, so the shipped
  Electron/Capacitor build (or a raw `index.html` opened via `file://`) never needs Node, npm, or
  the `react/` directory present — only development/packaging does.
  - **Migrating a page**: write the component in `react/src/pages/*.jsx` (React.createElement via
    JSX + esbuild's classic transform — no separate JSX runtime config needed, just
    `import React from "react"` in each file that uses JSX), a thin service module in
    `react/src/services/*.js` that wraps the existing `window.PCC.*` engine/store globals (§9 of
    the master prompt: **React must not own core calculations** — the service calls the real,
    unchanged domain engine, never reimplements it), then register the component in
    `react/src/index.js` onto `window.PCC.reactPages.<routeName>`. The page's existing
    `src/js/pages/<name>.js` module becomes a ~10-line stub:
    `window.PCC.pages.<name> = function(outlet) { window.PCC.reactBridge.mount(window.PCC.reactPages.<name>, {}, outlet); };`
    — the router's route-registration contract (`window.PCC.pages.<name>`) is completely
    unchanged, so every unmigrated page needs zero changes.
  - **`src/js/reactBridge.js`** is the only file that knows both "React" and "the router" exist:
    `mount(Component, props, container)` / `unmount()`. `router.js` calls `reactBridge.unmount()`
    once, right before its existing `outlet.innerHTML = ""` wipe, so a page's React effects get
    real cleanup instead of being silently abandoned on navigation — that's the only change made
    to `router.js` itself.
  - **`js/vendor/react-bundle.js` MUST load before `js/vendor/jszip.min.js` in `JS_ORDER`** — a
    real, confirmed bug (not hypothetical): jszip.min.js leaks a global `setImmediate` polyfill
    onto `window`, and React's scheduler package locks onto whatever scheduling primitive exists
    the moment it first evaluates. If jszip loads first, scheduler picks up its broken
    `setImmediate` and every future `createRoot().render()` silently never commits — no thrown
    error, just a permanently blank page. Loading React first avoids this. Reproduced and fixed
    during the Storage Management pilot; if `JS_ORDER` is ever reordered, keep this constraint.
  - **A service function that returns `window.PCC.store.get()`'s result directly must return a
    FRESH reference, or a React refresh-after-mutation is a silent no-op.** `store.get()` returns
    the SAME mutable module-level object on every call (`store.js`: single object, mutated in
    place, never replaced) — so a `useState(() => getX())` + `setX(getX())` "refresh" pattern
    calls `setState` with a reference `Object.is`-equal to the current state, and React silently
    bails on re-rendering. Real bug, hit and fixed during the Document Types migration: its
    service's `getData()` returned `window.PCC.store.get()` directly, so deactivating a record
    updated the store correctly but the list never re-filtered until an unrelated state change
    (e.g. a checkbox toggle) forced a render for some other reason. Fixed by having the service
    return `Object.assign({}, window.PCC.store.get())` — a fresh top-level wrapper each call, so
    `Object.is` sees a genuine change; nested arrays/objects stay the same references (fine,
    since a render always reads their current, already-mutated contents). Storage Management
    avoided this by accident, not by design — its snapshot function already built a brand-new
    `{data, records, summary}` wrapper object every call. **Any new service's "read the current
    snapshot for a refresh" function needs this same fresh-wrapper treatment**, not just ones that
    happen to compute a derived object already.
  - **Testing a React-controlled form/checkbox from outside React needs the right simulation, not
    a raw DOM property assignment** — real, confirmed-in-Chromium behavior, not a jsdom quirk:
    - Text/select inputs: `el.value = x` alone does NOT make a controlled input's `onChange`
      fire — React patches the native value-property setter to track "last known value," and a
      raw assignment updates that tracker too, so React sees no real change on the next event.
      Bypass React's patched setter via the native prototype descriptor first, then dispatch the
      event: `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,
      "value").set.call(el, x); el.dispatchEvent(new Event("input", {bubbles:true}))` (use
      `HTMLSelectElement.prototype` + a `"change"` event for a `<select>`). See
      `tests/test_document_types_e2e.js`'s `setReactInputValue`/`setReactSelectValue` helpers.
    - Checkboxes: don't set `.checked` manually at all, even with the descriptor-bypass trick —
      it did NOT reliably reach a controlled checkbox's `onChange` in testing (confirmed by direct
      comparison). Use `el.click()` instead — the same real interaction a user actually performs,
      firing the browser's native toggle + event sequence React listens to.
  - **A one-shot "pending prop" channel for cross-page navigation (a stub-file module
    variable read once via a `useState` lazy initializer, e.g. `createFromMeeting()` on
    Lessons Learned) must be set INSIDE the initial state itself, never inside a
    `useEffect`.** `flushSync` (above) only forces the very first `root.render()`
    synchronous — an effect still runs in React's later, separate passive-effects phase,
    even on first mount. Real bug hit and fixed on Lessons Learned: opening the prefilled
    form via `useEffect(() => { if (initialPrefill) setEditingId("new") }, [])` left a real
    caller (`meetings.js`'s "+ Add Lesson Learned" button) seeing the plain list for a tick
    before the form appeared — fixed by initializing `editingId` directly:
    `useState(() => (initialPrefill ? "new" : null))`.
  - **`router.js`'s `suppressNextHashRender` is a single boolean, not a queue — two
    `go()` calls fired back-to-back (no tick between them) can leave the second
    navigation's hashchange event unsuppressed, triggering an extra, unwanted `render()`.**
    For a React page reading a one-shot "pending prop" (see above), that extra render can
    arrive AFTER the prop was already consumed and cleared by the first (correct) render,
    silently discarding it. Real, reproducible edge case — confirmed by direct comparison,
    fixed by isolating it — but not one a real user's own click-then-click can trigger (real
    interaction always has wall-clock time between two clicks, letting the first
    navigation's hashchange settle first); only back-to-back *programmatic* `go()` calls
    with no await between them hit it, which in practice means test code, not `router.js`
    itself. Fixed in the test (`tests/test_lessons_learned_e2e.js`: an `await flush()`
    between the two navigations), not in the shared router — don't "fix" this in
    `router.js` without a real user-facing repro; the master prompt's own regression
    caution applies double to a file every page depends on.
  - **The same single-flag race also leaks ACROSS separate `check()` blocks in a test
    file, not just between two `go()` calls inside one block — a jsdom-confirmed detail
    that makes this bite in a non-obvious place.** Confirmed directly: `window.location.hash
    = x` in jsdom dispatches `hashchange` as a real macrotask (one full `setTimeout(…, 0)`
    tick later), never synchronously — so a `go()` call left un-flushed at the END of one
    `check()` block queues a hashchange that is still pending when the NEXT block starts.
    If that next block does its own `go()` (setting `suppressNextHashRender = true` again)
    and then `await flush()`s, the STALE hashchange from the previous block fires first,
    reads the flag as `true`, and resets it — leaving the flag `false` by the time the
    current block's own (later-queued) hashchange fires, which then runs an unwanted extra
    `render()` and wipes that block's one-shot pending prop. Real bug, hit and fixed in
    `tests/test_activity_linking_e2e.js`: a `viewRow.click(); window.PCC.router.render();`
    at the tail of one `check()` (vanilla `schedule` route, so the redundant manual
    `render()` call looked harmless) with no trailing `await flush()` silently broke a
    LATER, unrelated check's `rfis.expandRfi()` pending-prop two blocks later. Fix is the
    same either way: `await flush()` after every `go()` a check performs, even ones to a
    still-vanilla route and even at the very end of a check block — don't reason "this
    route doesn't need it" per-block; reason about the queue the whole file shares.
  - **A React page's `useState` resets to defaults on every remount — unlike the old vanilla
    page's persistent module-level `uiState`.** `reactBridge.js`'s `mount()` creates a brand new
    root (and therefore a brand new component instance) on every `router.render()` call for that
    route, including navigating away and back. A test (or a real user) that expects a filter/search
    term/checkbox to still be set after leaving and returning to a React-migrated page will find it
    reset — this is a real, accepted UX behavior difference for a migrated page, not a bug to
    "fix," and tests must not assume otherwise (re-set any needed UI state after a fresh
    `router.go()` back to the page, don't assume it survived from an earlier check).
  - **React 18's `createRoot().render()` is asynchronous by default; `reactBridge.js` forces
    only the INITIAL one synchronous.** Confirmed real behavior (not a jsdom quirk) that a React-migrated route's
    content would otherwise NOT be in the DOM the instant `router.render()` returns, unlike every
    vanilla page's raw synchronous DOM writes — which would have meant hunting down and patching
    every existing test that reads a migrated page's DOM content right after navigating to it
    (there is no single dedicated test file per page; coverage for most pages is scattered across
    many files' shared route-smoke arrays). Fixed once, at the source, instead:
    `react/src/index.js` also exposes `react-dom`'s `flushSync` on `window.PCC.ReactDOM`, and
    `reactBridge.js`'s `mount()` wraps every initial `root.render()` call in it — so a React page's
    content is synchronously present the moment `mount()`/`router.render()` returns, exactly like
    a vanilla page. **No existing or future test needs to know or care that a given route is
    React-backed.** Confirmed against `tests/test_storage_management_e2e.js` with zero
    React-specific accommodations needed in the test itself.
  - **This `flushSync` fix covers ONLY the very first render after navigation — a state update
    from an event handler on an already-mounted page (a button click, a checkbox toggle, typing)
    still commits asynchronously.** Real React 18 behavior, confirmed identically in real
    Chromium (not a jsdom gap): unlike the initial mount, wrapping every component's every
    `onClick`/`onChange` in `flushSync` would be impractical and fights React's own automatic
    batching, so this is NOT "fixed at the source" the way the initial mount was. Any test
    interaction with an already-mounted React page — clicking a button that opens a form, saving
    it, toggling a checkbox, typing into a filter — needs `await flush()` afterward before reading
    the resulting DOM, the same way this suite already awaits genuinely-async operations
    (IndexedDB, promise chains). See `tests/test_document_types_e2e.js` for the pattern across a
    full add/edit/deactivate/reactivate/delete flow.
- **Data layer:** `src/js/store.js` — single JS object, autosaved to `localStorage`, with a
  `schema_version` + `migrate()` chain so old exported JSON files upgrade cleanly. Bumping the
  schema is a real decision (new fields need defaults + a migration step), not a rename.
- **Blobs (photo/document file bytes) live in IndexedDB**, not `localStorage` —
  `src/js/blobStore.js`. This split is deliberate and scoped: *only* binary blobs moved off
  `localStorage` (Phase 12, after hitting the ~5-10MB browser storage quota with photos); every
  other module stays synchronous against `localStorage`. Don't add new things to `blobStore.js`
  unless they're binary blobs — see its own header comment.
- **Schedule baselines are a separate IndexedDB database** (`scheduleBaselineStore.js`,
  `pcc_schedule_baselines_v1`) — not inside `blobStore.js`'s DB, for the same reason: keeping
  `blobStore.js` scoped to binary blobs only.
- Each register module (Risk/Issue/Opportunity, RFI/TQ, Change Orders) follows the same "one
  shape distinguished by a `type` field" pattern rather than near-duplicate modules — follow this
  pattern for any new register-style feature instead of copy-pasting a whole new module.
- **`src/js/delayImpactEngine.js` is a read-only layer over `scheduleCpmEngine.js`'s persisted
  output, never a second calculation engine.** It reads `total_float`/`early_finish`/etc. straight
  off `data.activities` — the exact fields `calculateSchedule()` already wrote there the last time
  "Calculate Schedule" ran — and only re-invokes the real CPM engine (read-only, via
  `computeProjectFinishImpact()`) for a single delay's own project-finish impact, never in a
  portfolio-wide loop (that function's own header comment warns against exactly this — see it
  before calling it from a new list/dashboard). See the file's own header comment for the full
  reasoning before adding anything to it.

## Commands

```
cd react && npm install  # first time only
node build.js          # rebuild index.html from src/ (also runs the react/ build) — run after every src/ or react/src change
cd tests && npm install  # first time only
cd tests && npm test    # run the full jsdom/fake-indexeddb suite (must pass before shipping)
node --check src/js/whatever.js   # quick syntax check on a single file
```

## Testing conventions (match the project's existing discipline)

- Every phase/"Gate" in the README was shipped with a fresh test suite run before delivery —
  match that: after any change, rebuild and run `cd tests && npm test`, and don't report a change
  as done without both passing.
- Tests eval the real `src/js/*.js` files directly (not reimplementations) and, for end-to-end
  checks, load the actual bundled `index.html` via jsdom — see `tests/test_schedule_baseline_e2e.js`
  for the pattern. Keep new tests consistent with that: test the real shipped code, not a mock of it.
- jsdom doesn't implement IndexedDB — tests that touch `blobStore.js` or `scheduleBaselineStore.js`
  use `fake-indexeddb`. jsdom also doesn't implement `FileReader.readAsDataURL` — stub it directly
  where needed (see existing photo-upload tests).
- **This environment has real Chromium available** (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
  launch with `--no-sandbox`) via the globally-installed `playwright` package
  (`/opt/node22/lib/node_modules/playwright`). Use it to actually open the built `index.html` and
  click through a flow when you want stronger confidence than jsdom — jsdom can't catch real
  rendering/CSS/Chrome-specific issues (e.g. the `data:` URI navigation-block bug the README
  documents was exactly that kind of gap). This is the one thing genuinely un-verifiable from the
  README's own test suite; use it, don't skip it.

## Working conventions specific to this project

- **Project assignment is mandatory** on every register (Documents, Daily Log, Risk Register,
  RFI/TQ, Change Orders) — never add an "Unassigned" option back in; this was explicitly reverted
  once already.
- **Change Orders never write back to `contract_value`** — that reconciliation is a deliberate,
  separate manual act. Don't "helpfully" wire that up.
- **Reports are printable HTML (`window.print()`), not generated PDFs** — a deliberate choice to
  avoid bundling a PDF library into the single-file deliverable.
- Don't casually reach for the File System Access API to write files directly — it's
  desktop-Chrome/Edge-only, needs `https://`, and this app is explicitly built to also work on
  Android/iOS opened via `file://`/`content://`. Export/import-as-JSON is the deliberate answer to
  "why isn't this automatic," not an oversight.
- The author values scope discipline: each phase's README entry states what was decided and why
  *before* building it. When adding a feature, keep it scoped to what was asked — this project has
  explicitly rejected doing more than asked in several places (e.g. Change Management staying "a
  log only," `blobStore.js` staying blobs-only).

## PR / shipping conventions (Aditya, standing instruction)

- **If a PR has no comments, merge it — don't ask first.** This is a solo repo with no CI and no
  other reviewers; a clean PR (tests pass, no review comments) is ready by definition. Still stop
  and ask before merging if there *are* comments to address, or if something is genuinely
  ambiguous about the change itself.
- **Always merge the working branch into `main` after completing a gate/phase — don't ask first,
  don't wait to be told each time.** Rebuild, run the full suite, merge (direct merge is fine,
  same "solo repo, no CI, no reviewers" reasoning as above — a PR isn't required), push `main`,
  then restart the working branch from the new `main` before starting the next gate. This is a
  standing instruction, not a one-off — apply it to every gate/phase from here on without being
  asked again.
- **After every gate/phase/tier, compile everything and hand over a zip file Aditya can send to a
  laptop or to other people and they can use directly** — not just push to `main`. Rebuild
  (`node build.js`), run the full suite, then assemble a clean end-user package: `index.html`,
  `README.md`, `manifest.json`, `icons/` (favicon/PWA icon PNGs — added Gate 12, "App Icon &
  Branding"; regenerate with `node generate-icons.js` if `src/icons/favicon.svg` ever changes), and
  empty `data/`/`files/` placeholder folders (with their own `README.txt`) — **not** `src/`,
  `build.js`, `generate-icons.js`, `tests/`, `.claude/`, `CLAUDE.md`, or `HANDOFF.md`, which are
  dev-only and just add confusion for someone who isn't going to edit the code. The whole point is
  that the recipient needs zero setup — extract and double-click `index.html`, nothing to install,
  no dependency on this repo or Claude Code being present. Verify the zip actually works before sending it: extract it
  fresh (not the dev working copy) and open `index.html` in real Chromium — see the Testing
  conventions section above for why that matters here specifically.
- **Any single file being handed to Aditya that exceeds the ~30MB file-transfer limit (the Windows
  `.exe` installer is the recurring case, ~100-105MB) gets split, not skipped or routed through Git
  LFS by default** — LFS's free tier is only 1GB storage + 1GB bandwidth/month, too small to spend
  on routine, repeated builds. Standing method, don't ask first: `split -b 25M -d -a 2 "<file>"
  "<file>.part"` (produces `.part00`, `.part01`, ...), verify the reassembled file's SHA-256 matches
  the original *before* sending, send every part, and give Aditya both the exact Windows Command
  Prompt reassembly command (`copy /b part00+part01+...+partNN "output.exe"`) and the expected
  SHA-256 to verify against after reassembling. See `packaging/README.md`'s "Distributing a build"
  section for the full worked example. Git LFS stays the documented fallback for the rare case this
  doesn't fit (e.g. the file needs to live in git history directly), not the routine path.
- **ALWAYS bump the Android `versionCode` (and `versionName`) before every `assembleRelease` build,
  with no exceptions** — discovered as a real bug 2026-08-24: `versionCode` sat hardcoded at `1` since
  the very first release build across 5 full audit phases of changes, so every "new" APK Aditya was
  handed looked identical to Android's package manager, which refuses to install an update in place
  unless the new APK's `versionCode` is strictly greater than the currently-installed one — Aditya had
  to uninstall the old APK before every single install. Fixed in
  `packaging/android/android/app/build.gradle`: bump `versionCode` by at least 1 (e.g. 2 → 3) and give
  `versionName` a matching human-readable bump (e.g. "1.1" → "1.2") every time an APK is (re)built for
  delivery — check the current values in that file first, don't assume a starting point. Also bump
  `packaging/package.json`'s `"version"` field to match before an `electron:build` — Windows/NSIS
  isn't as strict about this as Android, but keeping both packages' version numbers in sync and moving
  forward is still correct practice, not optional.
- **An Android APK MUST be signed before delivering it — an unsigned APK cannot be installed at
  all, unlike an unsigned Windows EXE (which just triggers an OS warning the user can click
  through).** Discovered as a real bug 2026-08-27: `packaging/android/android/app/build.gradle`
  silently falls back to an unsigned build when no `app/keystore.properties` exists (a real
  keystore is a secret and never committed to git, so a fresh sandbox container starts with none)
  — the resulting `app-release-unsigned.apk` fails on-device with "App not installed as package
  appears to be invalid," not a warning. If no keystore exists when a release build is needed,
  generate one (`keytool -genkeypair -keystore app/pcc-release.jks -alias pcc-release -keyalg RSA
  -keysize 2048 -validity 10950 -dname "CN=Project Control Center, ..."`), write a matching
  `app/keystore.properties` (`storeFile`/`storePassword`/`keyAlias`/`keyPassword`), confirm both
  are actually excluded by `.gitignore` (add `android/app/keystore.properties` and
  `android/app/*.jks` there if they aren't — the build.gradle comment claims they're gitignored,
  but nothing enforced that until this fix), then rebuild. Verify with `apksigner verify
  --verbose` and `zipalign -c -v 4` before sending. **Tell the user explicitly** that a
  newly-generated keystore is a NEW signing identity — if they have any earlier build of the app
  installed, Android will refuse to install over it ("conflicts with an existing package") until
  they uninstall the old one first; this is a one-time reset, not a recurring issue, as long as
  future builds keep reusing the same keystore file.
- **Always build the Windows/macOS/Linux installer via `npm run electron:build`, never `npx
  electron-builder` directly** — real mistake made 2026-08-24: calling `electron-builder` directly
  skips `scripts/copy-app.js`, the step that copies the repo root's freshly-built `index.html` into
  `packaging/electron/` before packaging, so the resulting installer silently embeds whatever stale
  copy happened to already be sitting in `packaging/electron/index.html` from the previous packaging
  round — the build still "succeeds" with no error or warning. Caught only by the existing
  verification step (extract `app.asar`, diff the embedded `electron/index.html` against the repo
  root's current `index.html`, byte-for-byte) — always do that verification before sending an EXE to
  Aditya, it's the only thing that actually catches this. If you must invoke `electron-builder`
  directly for some reason, run `node scripts/copy-app.js` yourself immediately before it.
- If the branch backing an already-merged PR is reused for the next piece of work, restart it from
  the latest `main` first (`git fetch origin main && git reset --hard origin/main`, or rebase if
  there's already unmerged work sitting on the branch) rather than stacking new commits on old
  history — GitHub doesn't move a branch ref forward on merge, so the local/remote branch will
  otherwise silently drift behind `main`. **Commit before running any `git reset --hard`** — it
  discards uncommitted changes in tracked files with no warning.
- **Building the Windows installer on a Linux sandbox needs `wine` + `wine32:i386` + a clean
  `~/.wine` prefix — discovered 2026-08-27 provisioning a fresh container.** Three distinct
  failures in sequence: (1) `wine process failed ENOENT` — no `wine` installed at all, fixed with
  `apt-get install -y --no-install-recommends wine`; (2) a WOW64 `ntdll.dll` load failure during
  electron-builder's own post-build self-check (it runs the freshly-built installer under wine to
  verify it) — the installed `wine` was 64-bit-only and NSIS installers are 32-bit, fixed with
  `dpkg --add-architecture i386 && apt-get update && apt-get install -y wine32:i386` (install
  `libgd3:i386` first if this reports an unmet dependency via `libgphoto2`); (3) `wine:
  '/root/.wine' is a 64-bit installation, it cannot be used with a 32-bit wineserver` — the first
  failed attempt had already created a 64-bit-only prefix, fixed with `rm -rf /root/.wine` before
  the next build so a fresh WOW64-capable prefix gets created. This is sandbox setup, not a
  repo-committed fix — a genuinely fresh container needs all three steps redone before its first
  Windows build. See `HANDOFF.md`'s 2026-08-27 section for the full write-up.
- **After every major upgrade (a gate, a significant follow-up change), update `HANDOFF.md` at the
  repo root AND hand Aditya the complete updated file directly** (not just leave it committed silently
  — send it the same way the zip gets sent) with current session context — what shipped, current
  schema version, test file/check count, exact repo/branch state (ahead-of-main commit list, whether
  a PR exists, whether it's merged), and any new conventions/gotchas discovered that a fresh session
  would otherwise have to re-derive from git log and source. Kept at a fixed, discoverable repo path
  deliberately — a session can't act on a handoff file it doesn't know exists, so it can't live only
  in an upload/paste that has to be re-supplied each time. If the user separately maintains their own
  pasted-in handoff copy outside the repo, update that too when asked, but `HANDOFF.md` is the one
  that persists on its own.
