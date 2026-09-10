// Copies mirror-app's own built index.html (NOT the main app's repo-root index.html --
// this is the standalone "At a Glance" app's separate build, see ../../../mirror-app/build.js)
// into www/ (Capacitor's webDir) and this app's own icon source into assets/ before
// generating icons or building. Run before `cap sync` / gradlew -- never hand-edit
// www/index.html or assets/*.png, they're overwritten every time.
//
// Real bug fixed 2026-09-10, same as the main app's copy-app.js: assets/icon-only.png
// alone only feeds the LEGACY mipmap/ic_launcher.png, never the Android 8+ adaptive icon
// layers real devices actually render -- confirmed on a real device showing Capacitor's
// stock default icon instead of this app's own. Fix: also provide icon-foreground.png +
// icon-background.png, which @capacitor/assets' "Custom Mode" needs to regenerate the
// real adaptive layers.
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
// This app's own distinct icon (amber background, magnifier "glance" badge) -- deliberately
// NOT the main app's pcc-icon-source.png, so the two APKs are visually distinguishable on a
// device's home screen/app drawer, not just by name. Same bars motif for brand family
// resemblance; see the icon's own generation notes in HANDOFF.md for how it was made.
const ICON_SRC = path.join(REPO_ROOT, "packaging", "icons", "pcc-mirror-icon-source.png");
const ICON_BG_SRC = path.join(REPO_ROOT, "packaging", "icons", "pcc-mirror-icon-background.png");
const INDEX_SRC = path.join(REPO_ROOT, "mirror-app", "index.html");

const WWW_DIR = path.join(__dirname, "..", "www");
const ASSETS_DIR = path.join(__dirname, "..", "assets");

if (!fs.existsSync(INDEX_SRC)) {
  throw new Error(`${INDEX_SRC} not found — run "node build.js" from mirror-app/ first.`);
}
if (!fs.existsSync(ICON_SRC)) {
  throw new Error(`${ICON_SRC} not found.`);
}
if (!fs.existsSync(ICON_BG_SRC)) {
  throw new Error(`${ICON_BG_SRC} not found.`);
}

fs.mkdirSync(WWW_DIR, { recursive: true });
fs.mkdirSync(ASSETS_DIR, { recursive: true });

fs.copyFileSync(INDEX_SRC, path.join(WWW_DIR, "index.html"));
fs.copyFileSync(ICON_SRC, path.join(ASSETS_DIR, "icon-only.png"));
fs.copyFileSync(ICON_SRC, path.join(ASSETS_DIR, "icon-foreground.png"));
fs.copyFileSync(ICON_BG_SRC, path.join(ASSETS_DIR, "icon-background.png"));
fs.copyFileSync(ICON_SRC, path.join(ASSETS_DIR, "splash.png"));

console.log(`Copied ${INDEX_SRC} -> www/index.html`);
console.log(`Copied ${ICON_SRC} -> assets/icon-only.png, assets/icon-foreground.png, assets/splash.png`);
console.log(`Copied ${ICON_BG_SRC} -> assets/icon-background.png`);
