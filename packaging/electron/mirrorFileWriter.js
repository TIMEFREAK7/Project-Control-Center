// Pure helper for the "pcc-write-mirror-file" IPC handler (main.js) — kept separate so
// it's testable with plain Node + a real temp directory, same reasoning as
// relocateStorage.js. Validates inputs before touching the filesystem: the renderer is
// trusted app code, not arbitrary web content, but this still guards against writing
// anywhere other than directly inside the configured folder (defense in depth, not just
// blind trust).
const path = require("node:path");
const fs = require("node:fs");

// The ONLY filename the app ever writes (src/js/dataMirror.js's MIRROR_FILENAME). The
// folder is a free-text setting the renderer supplies, so it can't be pinned here without a
// UX change — pinning the name instead is what matters: if script were ever injected into
// the renderer (see fileViewer.js's link sanitizing for the one real path found, 2026-09-24
// audit), it could otherwise drop an arbitrary `.bat`/`.lnk` into e.g. the Windows Startup
// folder. A `pcc-mirror.json` anywhere is inert.
const ALLOWED_FILENAME = "pcc-mirror.json";

function writeMirrorFile(folderPath, filename, content) {
  if (typeof folderPath !== "string" || !folderPath) {
    throw new Error("Mirror folder path is not set.");
  }
  if (typeof filename !== "string" || !filename || filename.includes("/") || filename.includes("\\")) {
    throw new Error("Invalid mirror filename.");
  }
  if (filename !== ALLOWED_FILENAME) {
    throw new Error("Invalid mirror filename: only " + ALLOWED_FILENAME + " may be written.");
  }
  fs.mkdirSync(folderPath, { recursive: true });
  fs.writeFileSync(path.join(folderPath, filename), content, "utf8");
}

module.exports = { writeMirrorFile, ALLOWED_FILENAME };
