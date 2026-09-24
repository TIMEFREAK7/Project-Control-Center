// Plain-Node test for packaging/electron/navigationGuard.js (main.js's will-navigate /
// setWindowOpenHandler rules) — same "pure helper, no real Electron" approach as
// test_mirror_file_writer.js. Added with the 2026-09-24 audit's security fixes.
"use strict";
const path = require("path");
const assert = require("assert");
const { isExternalUrl, isSameDocument } = require(path.join(__dirname, "..", "packaging", "electron", "navigationGuard.js"));

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

check("web and mail links count as external (handed to the system browser/mail client)", () => {
  assert.ok(isExternalUrl("https://example.com/x"));
  assert.ok(isExternalUrl("http://example.com"));
  assert.ok(isExternalUrl("mailto:someone@example.com"));
});

check("script, file, data, blob and garbage URLs are never external — they are refused outright", () => {
  ["javascript:alert(1)", "JavaScript:alert(1)", "file:///C:/Windows/System32/calc.exe", "data:text/html,<script>1</script>", "blob:file:///abc", "vbscript:x", "", "not a url", undefined].forEach((u) => {
    assert.strictEqual(isExternalUrl(u), false, String(u));
  });
});

check("an in-app route change (same file, different #hash) is the same document", () => {
  assert.ok(isSameDocument("file:///C:/app/electron/index.html#/risks", "file:///C:/app/electron/index.html#/dashboard"));
  assert.ok(isSameDocument("file:///C:/app/electron/index.html", "file:///C:/app/electron/index.html#/x"));
});

check("anything else is a navigation away from the app", () => {
  assert.ok(!isSameDocument("https://evil.example/", "file:///C:/app/electron/index.html#/risks"));
  assert.ok(!isSameDocument("file:///C:/other.html", "file:///C:/app/electron/index.html"));
  assert.ok(!isSameDocument("garbage", "file:///C:/app/electron/index.html"));
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
