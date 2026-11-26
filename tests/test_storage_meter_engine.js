// Gate H.3 (2026-11-26): app-data size measurement and the pre-flight fit check in
// storageAnalyticsEngine.js. Pure functions, runs directly under `node`.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

global.window = global.window || {};
eval(fs.readFileSync(path.join(__dirname, "..", "src", "js", "storageAnalyticsEngine.js"), "utf8")); // eslint-disable-line no-eval
const engine = window.PCC.storageAnalyticsEngine;

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

const LIMIT = 5242880;

check("the limit is Chromium's 5 MiB localStorage quota in characters", () => {
  assert.strictEqual(engine.LOCAL_STORAGE_LIMIT_CHARS, LIMIT);
});

check("measureAppData on empty data: total is the serialized length, no collections", () => {
  const m = engine.measureAppData({});
  assert.strictEqual(m.totalChars, 2);
  assert.deepStrictEqual(m.collections, []);
});

check("measureAppData on typical data: exact per-collection sizes, largest first", () => {
  const data = {
    schema_version: 67,
    projects: [{ id: "p1", name: "Tower" }],
    activities: [{ id: "a1", name: "Pour slab level 3" }, { id: "a2", name: "Strip formwork" }],
    settings: { theme: "dark" },
  };
  const m = engine.measureAppData(data);
  assert.strictEqual(m.totalChars, JSON.stringify(data).length);
  assert.deepStrictEqual(
    m.collections.map((c) => c.key),
    ["activities", "projects", "settings", "schema_version"]
  );
  assert.strictEqual(m.collections[0].chars, JSON.stringify(data.activities).length);
  assert.strictEqual(m.collections[3].chars, 2); // "67"
});

check("checkStorageFit: well inside the limit fits, with an exact percentage", () => {
  const fit = engine.checkStorageFit(1000000, 48576);
  assert.strictEqual(fit.projectedChars, 1048576);
  assert.strictEqual(fit.limitChars, LIMIT);
  assert.strictEqual(fit.percent, 20);
  assert.strictEqual(fit.fits, true);
});

check("checkStorageFit: exactly at the limit still fits, one character over does not", () => {
  assert.strictEqual(engine.checkStorageFit(LIMIT - 10, 10).fits, true);
  assert.strictEqual(engine.checkStorageFit(LIMIT - 10, 11).fits, false);
});

check("checkStorageFit: over the limit reports more than 100%", () => {
  const fit = engine.checkStorageFit(LIMIT, LIMIT);
  assert.strictEqual(fit.fits, false);
  assert.strictEqual(fit.percent, 200);
});

check("storageFullMessage names the projected percentage and where to free space", () => {
  const msg = engine.storageFullMessage(engine.checkStorageFit(5000000, 500000));
  assert.ok(/105%/.test(msg), msg);
  assert.ok(/Storage Management/.test(msg), msg);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
