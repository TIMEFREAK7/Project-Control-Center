// Phase 4 (one-way hourly data mirror): tests packaging/electron/mirrorFileWriter.js's
// pure write+validation logic directly with a real temp directory.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");

const { writeMirrorFile } = require(path.join(__dirname, "..", "packaging", "electron", "mirrorFileWriter.js"));

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
  return fs.mkdtempSync(path.join(os.tmpdir(), "pcc-mirror-write-test-"));
}

check("writes the content to the given filename inside the folder, creating the folder if needed", () => {
  const dir = path.join(freshTempDir(), "nested", "mirror-folder");
  writeMirrorFile(dir, "pcc-mirror.json", '{"schema_version":65}');
  assert.strictEqual(fs.readFileSync(path.join(dir, "pcc-mirror.json"), "utf8"), '{"schema_version":65}');
});

check("overwrites an existing file with new content", () => {
  const dir = freshTempDir();
  writeMirrorFile(dir, "pcc-mirror.json", "first");
  writeMirrorFile(dir, "pcc-mirror.json", "second");
  assert.strictEqual(fs.readFileSync(path.join(dir, "pcc-mirror.json"), "utf8"), "second");
});

check("rejects a missing/empty folder path", () => {
  assert.throws(() => writeMirrorFile("", "pcc-mirror.json", "x"), /folder path/i);
  assert.throws(() => writeMirrorFile(undefined, "pcc-mirror.json", "x"), /folder path/i);
});

check("rejects a filename containing a forward slash (path traversal attempt)", () => {
  const dir = freshTempDir();
  assert.throws(() => writeMirrorFile(dir, "../escape.json", "x"), /[Ii]nvalid.*filename/);
  assert.throws(() => writeMirrorFile(dir, "sub/dir.json", "x"), /[Ii]nvalid.*filename/);
});

check("rejects a filename containing a backslash (Windows path traversal attempt)", () => {
  const dir = freshTempDir();
  assert.throws(() => writeMirrorFile(dir, "..\\escape.json", "x"), /[Ii]nvalid.*filename/);
});

check("rejects a missing/empty filename", () => {
  const dir = freshTempDir();
  assert.throws(() => writeMirrorFile(dir, "", "x"), /[Ii]nvalid.*filename/);
  assert.throws(() => writeMirrorFile(dir, undefined, "x"), /[Ii]nvalid.*filename/);
});

check("rejects every filename other than pcc-mirror.json, so injected script can't drop an executable (2026-09-24 audit)", () => {
  const dir = freshTempDir();
  ["evil.bat", "pcc-mirror.json.bat", "PCC-MIRROR.JSON", "startup.lnk", "pcc-mirror.js"].forEach((name) => {
    assert.throws(() => writeMirrorFile(dir, name, "x"), /[Ii]nvalid.*filename/, name);
    assert.ok(!fs.existsSync(path.join(dir, name)), name + " must not have been written");
  });
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
