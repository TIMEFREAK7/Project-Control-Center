// Gate H.4 (2026-11-26): the bundled SheetJS must be at least 0.20.2. 0.18.5 (the last on
// npm) has CVE-2023-30533 (prototype pollution, fixed 0.19.3) and CVE-2024-22363 (ReDoS,
// fixed 0.20.2), and it parses user-supplied files (preview, document extraction, schedule
// import). Newer builds come from cdn.sheetjs.com, never npm. Against the real index.html.
"use strict";
process.env.TZ = process.env.TZ || "Asia/Kolkata";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const INDEX_PATH = path.join(__dirname, "..", "index.html");

let passed = 0;
let failed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.stack || e.message);
  }
}

function atLeast(version, min) {
  const a = version.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}

(async () => {
  const dom = new JSDOM(fs.readFileSync(INDEX_PATH, "utf8"), { url: "http://localhost/", runScripts: "dangerously", resources: "usable", pretendToBeVisual: true });
  dom.window.indexedDB = new FDBFactory();
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  const XLSX = dom.window.XLSX;

  await check("the bundled SheetJS is 0.20.2 or later (both published advisories fixed)", () => {
    assert.ok(XLSX && XLSX.version, "window.XLSX missing");
    assert.ok(atLeast(XLSX.version, "0.20.2"), "bundled SheetJS is " + XLSX.version);
  });

  await check("it still reads a workbook the way the app calls it (cellDates, header:1, defval)", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Activity ID", "Name", "Start", "Duration"],
      // The page's own Date: SheetJS skips a Date from another realm (instanceof fails).
      ["A100", "Pour slab", new dom.window.Date(2026, 8, 24), 5],
      ["A110", "", "", 3],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const back = XLSX.read(new Uint8Array(bytes), { type: "array", cellDates: true });
    const rows = XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1, defval: "" });
    // Array.from: the row arrays come from the page's realm (a different Array prototype).
    assert.deepStrictEqual(Array.from(rows[0]), ["Activity ID", "Name", "Start", "Duration"]);
    assert.strictEqual(rows[1][0], "A100");
    assert.strictEqual(rows[2][1], "", "defval fills empty cells");
    // The date cell comes back as a Date that the app's dateCellToIso() reads in the
    // device's zone (test_time_zone_setting_e2e.js / test_local_dates_ist_e2e.js pin that).
    assert.ok(rows[1][2] instanceof dom.window.Date || rows[1][2] instanceof Date, "date cell is a Date: " + typeof rows[1][2]);
    assert.strictEqual(dom.window.PCC.scheduleImportService.dateCellToIso(rows[1][2]), "2026-09-24");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
