// Pure helper for the "pcc-write-mirror-file" IPC handler (main.js) — kept separate so
// it's testable with plain Node + a real temp directory, same reasoning as
// relocateStorage.js. Validates inputs before touching the filesystem: the renderer is
// trusted app code, not arbitrary web content, but this still guards against writing
// anywhere other than directly inside the configured folder (defense in depth, not just
// blind trust).
const path = require("node:path");
const fs = require("node:fs");

function writeMirrorFile(folderPath, filename, content) {
  if (typeof folderPath !== "string" || !folderPath) {
    throw new Error("Mirror folder path is not set.");
  }
  if (typeof filename !== "string" || !filename || filename.includes("/") || filename.includes("\\")) {
    throw new Error("Invalid mirror filename.");
  }
  fs.mkdirSync(folderPath, { recursive: true });
  fs.writeFileSync(path.join(folderPath, filename), content, "utf8");
}

module.exports = { writeMirrorFile };
