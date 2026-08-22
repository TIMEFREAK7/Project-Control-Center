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

## Android (Capacitor)

```
node build.js                    # from the repo root — rebuild index.html first
cd packaging/android
npm run assets:generate          # regenerate icon/splash from packaging/icons/pcc-icon-source.png
npm run android:build:debug      # produce android/app/build/outputs/apk/debug/app-debug.apk
```

Needs a JDK and the Android SDK (`compileSdkVersion`/`platforms;android-36` +
`build-tools;36.0.0` — check `android/variables.gradle` if Capacitor bumps this) with
`ANDROID_HOME` set and `android/local.properties` pointing at it. `scripts/copy-app.js` copies the
repo root's `index.html` into `www/` and the shared icon into `assets/` before each
sync/build — never hand-edit those, they're overwritten every time.

**Gate 1 (bare wrapper) is done.** `window.print()` (Reports/Executive Center) and
Export/Import/"Open File" (currently `Blob`/`window.open()`) both still need real native plugin
work (`@capacitor/filesystem`, `@capacitor/share`, a print plugin) that a bare Android WebView
doesn't give you for free — **both are known-broken in the current APK**, deferred to their own
gates rather than bundled into the base wrapper.

Release signing isn't set up yet — Gate 1 only produces a debug build (signed with the standard
Android debug key, not for distribution). When that gate happens: generate a **dedicated** keystore
for this app specifically (`com.pcc.projectcontrolcenter`) — don't reuse a keystore from an
unrelated app; there's no benefit to sharing one across different `applicationId`s, and it only
adds cross-app blast radius if it's ever compromised. Treat it exactly like the Electron section
above treats secrets: generate once, guard forever, hand it off immediately since it's not safe to
leave sitting only in an ephemeral container.
