// Copies the repo root's built index.html into electron/ so electron-builder can
// package it (its "files" resolution stays within this package.json's directory).
// Run before electron:dev / electron:build — never hand-edit electron/index.html,
// it's overwritten every time this runs.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "..", "index.html");
const DEST = path.join(__dirname, "..", "electron", "index.html");

if (!fs.existsSync(SRC)) {
  throw new Error(`${SRC} not found — run "node build.js" from the repo root first.`);
}

fs.copyFileSync(SRC, DEST);
console.log(`Copied ${SRC} -> ${DEST}`);
