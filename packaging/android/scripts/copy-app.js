// Copies the repo root's built index.html into www/ (Capacitor's webDir) and the shared
// icon source into assets/ before generating icons or building. Run before `cap sync` /
// gradlew — never hand-edit www/index.html or assets/*.png, they're overwritten every time.
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const ICON_SRC = path.join(REPO_ROOT, "packaging", "icons", "pcc-icon-source.png");
const INDEX_SRC = path.join(REPO_ROOT, "index.html");

const WWW_DIR = path.join(__dirname, "..", "www");
const ASSETS_DIR = path.join(__dirname, "..", "assets");

if (!fs.existsSync(INDEX_SRC)) {
  throw new Error(`${INDEX_SRC} not found — run "node build.js" from the repo root first.`);
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
