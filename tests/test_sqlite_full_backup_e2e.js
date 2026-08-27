// PCC Architecture Upgrade Phase 5 (SQLite) — completion increment: "Full Backup (SQLite)".
// This supersedes the earlier metadata-only "Export as SQLite (Experimental)" button.
//
// Real, documented environment discovery made while building this feature: JSZip's
// async pipeline — both zip.generateAsync() (writing) AND entry.async() (reading) —
// never resolves under jsdom, regardless of output type (blob/uint8array/nodebuffer/
// base64/string all hang indefinitely, confirmed by testing the vendored JSZip build
// directly in isolation). This is a jsdom limitation, not a bug in this app's code, and
// it means the actual click-through Create/Restore flow (real zip generation, real
// download, real restore) cannot be verified in this jsdom-based suite at all — it's
// covered instead by:
//   - tests/test_sqlite_backup_service.js — the full create/restore round trip, blob
//     fidelity, and corruption handling, tested with real Node `jszip` (no jsdom)
//   - a real-Chromium Playwright smoke test (scratchpad) — the actual UI click-through,
//     real browser download, real sqlite3 CLI interop, where JSZip works correctly
//
// This file is deliberately scoped to what jsdom *can* verify reliably: the buttons and
// their copy exist and are correctly wired, and the confirmation-dialog gating behavior
// (declining must not touch live data) — none of which require JSZip's async pipeline
// to actually complete.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const INDEX_PATH = path.join(__dirname, "..", "index.html");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function flush() {
  for (let i = 0; i < 10; i++) await sleep(0);
}

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

function findButtonByText(win, text) {
  const buttons = Array.from(win.document.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const thrownErrors = [];
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  dom.window.indexedDB = new FDBFactory();
  dom.window.CompressionStream = CompressionStream;
  dom.window.DecompressionStream = DecompressionStream;
  dom.window.Response = Response;
  dom.window.onerror = function (msg) {
    thrownErrors.push(String(msg));
  };
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  await check("seed a project and navigate to Settings", () => {
    win.PCC.store.update(function (data) {
      data.projects.push({ id: "proj_full_backup_1", name: "Full Backup Test Project", archived: false, status: "on_track", progress: 0, attachments: [] });
    });
    win.PCC.router.go("settings");
    win.PCC.router.render();
    assert.ok(outlet().textContent.indexOf("Data") !== -1, "expected the Data panel to render");
  });

  await check("'Create Full Backup (SQLite)' and 'Restore from Full Backup' buttons exist, the old metadata-only export is gone, and the panel copy describes a complete, restorable backup", () => {
    const createBtn = findButtonByText(win, "Create Full Backup (SQLite)");
    const restoreBtn = findButtonByText(win, "Restore from Full Backup");
    assert.ok(createBtn, "'Create Full Backup (SQLite)' button not found");
    assert.ok(restoreBtn, "'Restore from Full Backup' button not found");
    assert.ok(!findButtonByText(win, "Export as SQLite (Experimental)"), "the old metadata-only export button should be gone, superseded by Full Backup");
    assert.ok(createBtn.title.toLowerCase().indexOf("document/photo files") !== -1, "the Create button's tooltip must describe including document/photo files");
    assert.ok(restoreBtn.title.toLowerCase().indexOf("replacing all current data") !== -1, "the Restore button's tooltip must warn it replaces all current data");
    const panelText = outlet().textContent.toLowerCase();
    assert.ok(panelText.indexOf("full backup") !== -1 && panelText.indexOf("restorable") !== -1, "the panel copy must describe the Full Backup as complete and restorable");
  });

  await check("clicking 'Restore from Full Backup' opens the hidden file picker for the .zip input", () => {
    const input = win.document.querySelector('input[type="file"][accept=".zip"]');
    assert.ok(input, "expected a hidden .zip file input to exist");
    let clicked = false;
    const realClick = input.click;
    input.click = function () {
      clicked = true;
    };
    findButtonByText(win, "Restore from Full Backup").click();
    input.click = realClick;
    assert.ok(clicked, "the Restore button must trigger the file input's click()");
  });

  await check("declining the restore confirmation dialog leaves all current data untouched", async () => {
    win.confirm = () => false;
    const dummyFile = new win.File(["not actually read, confirm() is declined first"], "PCC-Full-Backup-2026-01-01.zip", { type: "application/zip" });
    const input = win.document.querySelector('input[type="file"][accept=".zip"]');
    Object.defineProperty(input, "files", { value: [dummyFile], configurable: true });
    input.dispatchEvent(new win.Event("change"));
    await flush();
    assert.strictEqual(win.PCC.store.get().projects.length, 1, "declining the confirmation must leave the seeded project untouched");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
