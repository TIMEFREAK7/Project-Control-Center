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
  change to `src/`. New files must be added to `JS_ORDER` or they silently won't ship.
- **No framework, no npm deps for the app itself.** Vanilla JS, hash-based routing
  (`src/js/router.js`), plain DOM manipulation per page module. This is deliberate — the whole
  point is one dependency-free file that opens via `file://` with zero install.
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

## Commands

```
node build.js          # rebuild index.html from src/ — run after every src/ change
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
- **After every gate/phase/tier, compile everything and hand over a zip file Aditya can send to a
  laptop or to other people and they can use directly** — not just push to `main`. Rebuild
  (`node build.js`), run the full suite, then assemble a clean end-user package: `index.html`,
  `README.md`, and empty `data/`/`files/` placeholder folders (with their own `README.txt`) — **not**
  `src/`, `build.js`, `tests/`, `.claude/`, `CLAUDE.md`, or `HANDOFF.md`, which are dev-only and just
  add confusion for someone who isn't going to edit the code. The whole point is that the recipient
  needs zero setup — extract and double-click `index.html`, nothing to install, no dependency on this
  repo or Claude Code being present. Verify the zip actually works before sending it: extract it
  fresh (not the dev working copy) and open `index.html` in real Chromium — see the Testing
  conventions section above for why that matters here specifically.
- If the branch backing an already-merged PR is reused for the next piece of work, restart it from
  the latest `main` first (`git fetch origin main && git reset --hard origin/main`, or rebase if
  there's already unmerged work sitting on the branch) rather than stacking new commits on old
  history — GitHub doesn't move a branch ref forward on merge, so the local/remote branch will
  otherwise silently drift behind `main`. **Commit before running any `git reset --hard`** — it
  discards uncommitted changes in tracked files with no warning.
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
