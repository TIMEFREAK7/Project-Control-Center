// Phase 2 (Windows storage relocation): tests packaging/electron/relocateStorage.js's pure
// helpers directly with a real temp directory. This module is deliberately factored out of
// main.js so it's testable here without running inside an actual Electron process.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");

const { computeRelocatedPath, hasContent, migrateIfNeeded } = require(
  path.join(__dirname, "..", "packaging", "electron", "relocateStorage.js")
);

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.message);
  }
}

function freshTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pcc-relocate-test-"));
}

check("computeRelocatedPath puts PCC-Data next to the exe's own directory", () => {
  const exePath =
    process.platform === "win32"
      ? "D:\\PCC\\Project Control Center.exe"
      : "/opt/PCC/Project Control Center";
  const result = computeRelocatedPath(exePath);
  assert.strictEqual(result, path.join(path.dirname(exePath), "PCC-Data"));
});

check("hasContent returns false for a directory that doesn't exist", () => {
  const dir = path.join(freshTempDir(), "does-not-exist");
  assert.strictEqual(hasContent(dir), false);
});

check("hasContent returns false for an empty existing directory", () => {
  const dir = freshTempDir();
  assert.strictEqual(hasContent(dir), false);
});

check("hasContent returns true once a file exists inside the directory", () => {
  const dir = freshTempDir();
  fs.writeFileSync(path.join(dir, "Local Storage"), "leveldb-stand-in");
  assert.strictEqual(hasContent(dir), true);
});

check("migrateIfNeeded copies real data from the original path to a fresh new path", () => {
  const original = freshTempDir();
  fs.mkdirSync(path.join(original, "IndexedDB"), { recursive: true });
  fs.writeFileSync(path.join(original, "IndexedDB", "pcc_blobs_v1.ldb"), "blob-bytes");
  const newPath = path.join(freshTempDir(), "PCC-Data");

  const result = migrateIfNeeded(original, newPath);

  assert.strictEqual(result.migrated, true);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(
    fs.readFileSync(path.join(newPath, "IndexedDB", "pcc_blobs_v1.ldb"), "utf8"),
    "blob-bytes"
  );
  // Never deletes the original — it stays exactly as it was.
  assert.strictEqual(
    fs.readFileSync(path.join(original, "IndexedDB", "pcc_blobs_v1.ldb"), "utf8"),
    "blob-bytes"
  );
});

check("migrateIfNeeded is a no-op (not migrated, no error) when the new path already has data", () => {
  const original = freshTempDir();
  fs.writeFileSync(path.join(original, "data.txt"), "old");
  const newPath = freshTempDir();
  fs.writeFileSync(path.join(newPath, "data.txt"), "already-migrated");

  const result = migrateIfNeeded(original, newPath);

  assert.strictEqual(result.migrated, false);
  assert.strictEqual(result.error, undefined);
  // The already-relocated copy is untouched, not overwritten by the older original.
  assert.strictEqual(fs.readFileSync(path.join(newPath, "data.txt"), "utf8"), "already-migrated");
});

check("migrateIfNeeded is a no-op (not migrated, no error) on a genuinely fresh install with no prior data", () => {
  const original = path.join(freshTempDir(), "never-existed");
  const newPath = path.join(freshTempDir(), "PCC-Data");

  const result = migrateIfNeeded(original, newPath);

  assert.strictEqual(result.migrated, false);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(fs.existsSync(newPath), false);
});

check("migrateIfNeeded reports an error instead of throwing when the copy target is unwritable", () => {
  const original = freshTempDir();
  fs.writeFileSync(path.join(original, "data.txt"), "old");
  // A file (not a directory) at the parent path makes mkdirSync underneath it fail.
  const blockerFile = freshTempDir();
  fs.writeFileSync(path.join(blockerFile, "blocker"), "");
  const newPath = path.join(blockerFile, "blocker", "PCC-Data");

  const result = migrateIfNeeded(original, newPath);

  assert.strictEqual(result.migrated, false);
  assert.ok(result.error instanceof Error);
  // The original is still there, untouched, since the migration never got far enough to
  // risk it.
  assert.strictEqual(fs.readFileSync(path.join(original, "data.txt"), "utf8"), "old");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
