// Pure helpers for Phase 2's "relocate storage next to the installed app" feature — kept
// separate from main.js so this logic is testable with plain Node + a real temp directory,
// without needing to run inside an actual Electron process (main.js itself can't be
// require()'d outside one, since `require("electron")` only resolves to the real app API
// when Node is launched by the Electron binary).
const path = require("node:path");
const fs = require("node:fs");

function computeRelocatedPath(exePath) {
  return path.join(path.dirname(exePath), "PCC-Data");
}

function hasContent(dir) {
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
  } catch (err) {
    return false;
  }
}

// Copies originalPath -> newPath once, only when newPath has nothing yet and originalPath
// does. Never deletes originalPath. Returns {migrated: boolean, error?: Error} instead of
// throwing, so a failed copy can be handled by staying on the original path rather than
// switching to a possibly-empty new one.
function migrateIfNeeded(originalPath, newPath) {
  if (hasContent(newPath) || !hasContent(originalPath)) {
    return { migrated: false };
  }
  try {
    fs.mkdirSync(newPath, { recursive: true });
    fs.cpSync(originalPath, newPath, { recursive: true });
    return { migrated: true };
  } catch (err) {
    return { migrated: false, error: err };
  }
}

module.exports = { computeRelocatedPath, hasContent, migrateIfNeeded };
