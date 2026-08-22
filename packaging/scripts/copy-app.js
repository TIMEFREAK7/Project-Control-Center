// Copies the repo root's built index.html, plus the shared app icon, into electron/ so
// electron-builder can package them (its "files" resolution stays within this
// package.json's directory — only electron/**/* is included in the built app, so the
// icon has to live here too, not just under packaging/icons/, or main.js's BrowserWindow
// icon reference would break in a packaged build even though it works fine in
// electron:dev). Run before electron:dev / electron:build — never hand-edit
// electron/index.html or electron/icon.png, both are overwritten every time this runs.
const fs = require("fs");
const path = require("path");

const INDEX_SRC = path.join(__dirname, "..", "..", "index.html");
const INDEX_DEST = path.join(__dirname, "..", "electron", "index.html");
const ICON_SRC = path.join(__dirname, "..", "icons", "pcc-icon-source.png");
const ICON_DEST = path.join(__dirname, "..", "electron", "icon.png");

if (!fs.existsSync(INDEX_SRC)) {
  throw new Error(`${INDEX_SRC} not found — run "node build.js" from the repo root first.`);
}
if (!fs.existsSync(ICON_SRC)) {
  throw new Error(`${ICON_SRC} not found.`);
}

fs.copyFileSync(INDEX_SRC, INDEX_DEST);
fs.copyFileSync(ICON_SRC, ICON_DEST);
console.log(`Copied ${INDEX_SRC} -> ${INDEX_DEST}`);
console.log(`Copied ${ICON_SRC} -> ${ICON_DEST}`);
