# packaging/

Dev-only tooling that wraps the repo root's built `index.html` as native desktop (Electron) and,
eventually, Android (Capacitor) apps. Isolated from `src/` on purpose — this folder has its own
`package.json`/`node_modules`, so the shipped `index.html` stays exactly as dependency-free as
before. None of this ships to end users directly; see "Distributing a build" below for what does.

## Desktop (Electron)

```
node build.js                    # from the repo root — rebuild index.html first
cd packaging
npm run electron:dev             # launch the app in a window, for local testing
npm run electron:build           # produce a real installer in packaging/release/
```

`scripts/copy-app.js` copies the repo root's `index.html` into `electron/` before each run/build —
never hand-edit `electron/index.html`, it's overwritten every time.

## Distributing a build

Build artifacts (`packaging/release/`) are gitignored by default — they're regenerable, and
committing 100MB+ binaries to every future commit would bloat the repo forever, even with LFS.

**The actual distribution path is GitHub Releases**: tag a version, attach the built installer(s)
(`.AppImage`/`.dmg`/`.exe`/`.apk`) to the release. GitHub Releases assets live in GitHub's own
storage, separate from git — up to 2GB/file, no repo bloat, no ongoing quota cost. This has to be
done from the GitHub web UI or `gh` CLI directly; Claude Code's GitHub tooling in this repo
doesn't currently include a release/asset-upload tool, so this step isn't automatable from a
session working in this repo.

**Git LFS is configured as a fallback** (`.gitattributes` at the repo root tracks `*.AppImage`,
`*.dmg`, `*.exe`, `*.msi`, `*.apk`, `*.aab`) for the rare case a build genuinely needs to live in
git history directly — e.g. `git add -f packaging/release/some-installer.AppImage` will
automatically go through LFS. Don't reach for this as the default path: GitHub's free LFS tier is
1GB storage + 1GB bandwidth/month, and a single desktop installer is already 100MB+, so routine
use here would exhaust it in a handful of builds.

## Android (Capacitor) — not yet built

Flagged during planning as needing real work beyond `npx cap add android`: a bare Android WebView
doesn't implement `window.print()` (Reports/Executive Center depend on it) or handle
Blob-download/`window.open()` the way a full browser does (Export/Import/Open File currently rely
on both) — both need native plugin wiring (`@capacitor/filesystem`, `@capacitor/share`, a print
plugin), not just wrapping the existing web code.
