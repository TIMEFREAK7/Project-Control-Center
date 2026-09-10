// Copies mirror-app's own built index.html (NOT the main app's repo-root index.html --
// this is the standalone "At a Glance" app's separate build, see ../../../mirror-app/build.js)
// into www/ (Capacitor's webDir) and the shared icon source into assets/ before generating
// icons or building. Run before `cap sync` / gradlew -- never hand-edit www/index.html or
// assets/*.png, they're overwritten every time.
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
// This app's own distinct icon (amber background, magnifier "glance" badge) -- deliberately
// NOT the main app's pcc-icon-source.png, so the two APKs are visually distinguishable on a
// device's home screen/app drawer, not just by name. Same bars motif for brand family
// resemblance; see the icon's own generation notes in HANDOFF.md for how it was made.
const ICON_SRC = path.join(REPO_ROOT, "packaging", "icons", "pcc-mirror-icon-source.png");
const INDEX_SRC = path.join(REPO_ROOT, "mirror-app", "index.html");

const WWW_DIR = path.join(__dirname, "..", "www");
const ASSETS_DIR = path.join(__dirname, "..", "assets");

if (!fs.existsSync(INDEX_SRC)) {
  throw new Error(`${INDEX_SRC} not found — run "node build.js" from mirror-app/ first.`);
}
if (!fs.existsSync(ICON_SRC)) {
  throw new Error(`${ICON_SRC} not found.`);
}

fs.mkdirSync(WWW_DIR, { recursive: true });
fs.mkdirSync(ASSETS_DIR, { recursive: true });

fs.copyFileSync(INDEX_SRC, path.join(WWW_DIR, "index.html"));
fs.copyFileSync(ICON_SRC, path.join(ASSETS_DIR, "icon-only.png"));
fs.copyFileSync(ICON_SRC, path.join(ASSETS_DIR, "splash.png"));

console.log(`Copied ${INDEX_SRC} -> www/index.html`);
console.log(`Copied ${ICON_SRC} -> assets/icon-only.png, assets/splash.png`);
