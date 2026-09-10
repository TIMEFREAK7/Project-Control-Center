// Copies the repo root's built index.html into www/ (Capacitor's webDir) and the shared
// icon source into assets/ before generating icons or building. Run before `cap sync` /
// gradlew — never hand-edit www/index.html or assets/*.png, they're overwritten every time.
//
// Real bug fixed 2026-09-10: assets/icon-only.png alone (this file's previous behavior)
// only feeds @capacitor/assets' "legacy" mipmap/ic_launcher.png generation — it does NOT
// touch the Android 8+ (API 26+) adaptive icon layers (mipmap-anydpi-v26/ic_launcher.xml
// -> mipmap/ic_launcher_foreground.png + @color/ic_launcher_background), which is what
// every real device actually renders on the home screen/app drawer. Left untouched, those
// stay Capacitor's own stock template icon forever — confirmed on a real device, not
// hypothetical. Fix: also provide assets/icon-foreground.png (the same real logo) and
// assets/icon-background.png (a flat fill matching the logo's own background), which
// @capacitor/assets' "Custom Mode" explicitly requires to regenerate the adaptive layers.
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const ICON_SRC = path.join(REPO_ROOT, "packaging", "icons", "pcc-icon-source.png");
const ICON_BG_SRC = path.join(REPO_ROOT, "packaging", "icons", "pcc-icon-background.png");
const INDEX_SRC = path.join(REPO_ROOT, "index.html");

const WWW_DIR = path.join(__dirname, "..", "www");
const ASSETS_DIR = path.join(__dirname, "..", "assets");

if (!fs.existsSync(INDEX_SRC)) {
  throw new Error(`${INDEX_SRC} not found — run "node build.js" from the repo root first.`);
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
