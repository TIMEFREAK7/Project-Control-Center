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

**The routine path, since neither of the above is available to a Claude Code session by
default**: split the built file and send it directly through the session's own file-delivery tool,
in chunks under its transfer limit (~30MB). Standing method (see CLAUDE.md's PR/shipping
conventions — this is a documented, don't-ask-first convention, not a one-off):

```
split -b 25M -d -a 2 "release/Project Control Center Setup 1.0.0.exe" \
  "Project Control Center Setup 1.0.0.exe.part"
sha256sum "release/Project Control Center Setup 1.0.0.exe"     # record this before sending
```

Verify the split is exact by reassembling locally and re-checksumming before sending anything —
`cat *.part* > /tmp/check.exe && sha256sum /tmp/check.exe` should match the line above exactly.
Send every `.part` file, plus the expected SHA-256 and this reassembly command for Aditya's side
(Windows Command Prompt, since the `.exe` is the recurring case here):

```
copy /b "Setup.exe.part00"+"Setup.exe.part01"+"Setup.exe.part02"+... "Project Control Center Setup 1.0.0.exe"
```

(adjust the `+`-joined part list to however many parts this particular build actually split into —
`part00`, `part01`, ... in order). On macOS/Linux, `cat Setup.exe.part* > "Project Control Center Setup 1.0.0.exe"`
does the same thing. Always give the SHA-256 alongside the parts so Aditya can confirm the
reassembled file is byte-identical before installing it.

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

**Gates 1-3 are all done** — bare wrapper, Export/Import/Open File, and native print. Gate 3 added
a hand-written `PrintPlugin.java` (registered in `MainActivity.java`) built entirely on Android's
own `WebView.createPrintDocumentAdapter()` + `PrintManager` — no third-party plugin — plus
`src/js/nativePrint.js`, which routes `window.print()` through it only under Capacitor, leaving
web/Electron's real `window.print` untouched. See the "Mobile & Desktop Packaging — Gate 3" entry
in the main README for the full writeup, including the one thing still unverified: there's no
emulator/device in this sandbox, so the actual print dialog has never been seen live.

Release signing isn't set up yet — Gate 1 only produces a debug build (signed with the standard
Android debug key, not for distribution). When that gate happens: generate a **dedicated** keystore
for this app specifically (`com.pcc.projectcontrolcenter`) — don't reuse a keystore from an
unrelated app; there's no benefit to sharing one across different `applicationId`s, and it only
adds cross-app blast radius if it's ever compromised. Treat it exactly like the Electron section
above treats secrets: generate once, guard forever, hand it off immediately since it's not safe to
leave sitting only in an ephemeral container.
