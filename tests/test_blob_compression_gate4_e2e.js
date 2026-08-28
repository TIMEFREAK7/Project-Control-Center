// End-to-end jsdom test for Mobile & Desktop Packaging Gate 4: blobStore.js's storage
// format change from a base64 data URI string to raw gzip-compressed bytes
// (CompressionStream/DecompressionStream). Unlike Gates 1-3, this is fully testable
// end-to-end in jsdom — no native plugin, no platform branching — so this file covers
// real compress/decompress round-trip integrity (byte-for-byte, not just "didn't throw"),
// the actual on-disk record shape, backward compatibility with pre-Gate-4 records, and
// opportunistic (not bulk) migration on re-save. Runs against the actual bundled
// index.html, same convention every prior gate's e2e test uses.
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
// Compression/decompression via CompressionStream/DecompressionStream involves real
// stream processing, not just promise-chain microtasks — its duration varies with system
// load (observed flaky under a long, resource-contended full-suite run even though a
// fixed flush() was reliable standalone). Poll instead of guessing a tick count.
async function waitFor(conditionFn, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 5000);
  while (Date.now() < deadline) {
    if (conditionFn()) return;
    await sleep(10);
  }
  throw new Error("waitFor() timed out after " + timeoutMs + "ms");
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

// A real, non-trivial PNG (this repo's own app icon) makes a good "already compressed,
// expect near-zero gzip gain" test case — reading it directly rather than a synthetic blob.
const REAL_PNG = fs.readFileSync(path.join(__dirname, "..", "packaging", "icons", "pcc-icon-source.png"));
const REAL_PNG_B64 = REAL_PNG.toString("base64");

// Reads a raw record straight out of IndexedDB, bypassing blobStore.js entirely, so the
// test can inspect the actual on-disk shape rather than trusting blobStore's own read path.
function readRawRecord(win, id) {
  return new Promise((resolve, reject) => {
    // Version 2 since PCC Architecture Upgrade Phase 6's content-addressable storage
    // increment added a second object store ("content") — opening at version 1 here would
    // now throw a VersionError once blobStore.js itself has already upgraded the DB to 2.
    const req = win.indexedDB.open("pcc_blobs_v1", 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("blobs", "readonly");
      const getReq = tx.objectStore("blobs").get(id);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

// Directly inserts a pre-Gate-4-shaped record ({id, data: <data URI string>}), simulating
// a blob saved by the app before this gate shipped — exactly what backward compatibility
// needs to handle.
function writeLegacyRecord(win, id, dataUri) {
  return new Promise((resolve, reject) => {
    // Version 2 since PCC Architecture Upgrade Phase 6's content-addressable storage
    // increment added a second object store ("content") — opening at version 1 here would
    // now throw a VersionError once blobStore.js itself has already upgraded the DB to 2.
    const req = win.indexedDB.open("pcc_blobs_v1", 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put({ id: id, data: dataUri });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
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
  await flush();
  const win = dom.window;

  await check("putBlob() then getBlob() round-trips a real PNG byte-for-byte", async () => {
    const dataUri = "data:image/png;base64," + REAL_PNG_B64;
    await win.PCC.blobStore.putBlob("png-1", dataUri);
    const result = await win.PCC.blobStore.getBlob("png-1");
    assert.ok(result, "expected a value back");
    const resultB64 = result.slice(result.indexOf(",") + 1);
    assert.strictEqual(resultB64, REAL_PNG_B64, "decompressed bytes must exactly match the original — any mismatch is data corruption");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the on-disk record is the new compressed shape, not a base64 string", async () => {
    const record = await readRawRecord(win, "png-1");
    assert.ok(record, "expected a stored record");
    assert.strictEqual(typeof record.data, "undefined", "must not use the old {data: string} shape for a fresh write");
    assert.ok(record.gz instanceof win.ArrayBuffer || record.gz instanceof ArrayBuffer, "expected record.gz to be raw compressed bytes");
    assert.strictEqual(record.mime, "image/png");
  });

  await check("compression ratio on a real (already-compressed) PNG is small, as expected — measured, not assumed", async () => {
    const record = await readRawRecord(win, "png-1");
    const rawBytes = REAL_PNG.length;
    const compressedBytes = record.gz.byteLength;
    const ratio = (1 - compressedBytes / rawBytes) * 100;
    console.log(`     (measured: ${rawBytes} raw -> ${compressedBytes} compressed, ${ratio.toFixed(1)}% smaller)`);
    // No hard assertion on the exact ratio (genuinely content-dependent) — this is here to
    // keep the real number visible in test output, not to assert a specific target.
    assert.ok(compressedBytes < rawBytes * 1.05, "compressed size blew up unexpectedly — something is wrong, not just 'compression didn't help'");
  });

  await check("compression ratio on highly-compressible content (repeated text) is large", async () => {
    const text = "Gate 4 compression test content. ".repeat(2000);
    const rawBytes = new TextEncoder().encode(text).length;
    const dataUri = "data:text/plain;base64," + Buffer.from(text).toString("base64");
    await win.PCC.blobStore.putBlob("text-1", dataUri);
    const record = await readRawRecord(win, "text-1");
    const ratio = (1 - record.gz.byteLength / rawBytes) * 100;
    console.log(`     (measured: ${rawBytes} raw -> ${record.gz.byteLength} compressed, ${ratio.toFixed(1)}% smaller)`);
    assert.ok(ratio > 90, "expected a large reduction on highly repetitive content, got " + ratio.toFixed(1) + "%");
    const result = await win.PCC.blobStore.getBlob("text-1");
    const resultText = Buffer.from(result.slice(result.indexOf(",") + 1), "base64").toString("utf8");
    assert.strictEqual(resultText, text, "round-tripped text must match exactly");
  });

  await check("a pre-Gate-4 legacy record is returned as-is, untouched, no forced migration", async () => {
    const legacyDataUri = "data:image/png;base64," + REAL_PNG_B64;
    await writeLegacyRecord(win, "legacy-1", legacyDataUri);
    const before = await readRawRecord(win, "legacy-1");
    assert.strictEqual(before.data, legacyDataUri, "sanity check on the seeded legacy shape");

    const result = await win.PCC.blobStore.getBlob("legacy-1");
    assert.strictEqual(result, legacyDataUri, "legacy record must come back completely unchanged");

    const after = await readRawRecord(win, "legacy-1");
    assert.strictEqual(after.data, legacyDataUri, "getBlob() must NOT rewrite the legacy record in place — no bulk/forced migration");
    assert.strictEqual(typeof after.gz, "undefined");
  });

  await check("a legacy record migrates to the new compressed format the next time it's re-saved", async () => {
    const legacyDataUri = "data:image/png;base64," + REAL_PNG_B64;
    await writeLegacyRecord(win, "legacy-2", legacyDataUri);

    await win.PCC.blobStore.putBlob("legacy-2", legacyDataUri); // simulates a new revision being uploaded
    const after = await readRawRecord(win, "legacy-2");
    assert.strictEqual(typeof after.data, "undefined", "expected the legacy shape to be gone after a re-save");
    assert.ok(after.gz, "expected the new compressed shape after a re-save");

    const result = await win.PCC.blobStore.getBlob("legacy-2");
    const resultB64 = result.slice(result.indexOf(",") + 1);
    assert.strictEqual(resultB64, REAL_PNG_B64, "content must still match exactly after migrating format");
  });

  await check("getBlob() on a nonexistent id resolves null, not an error", async () => {
    const result = await win.PCC.blobStore.getBlob("does-not-exist");
    assert.strictEqual(result, null);
  });

  await check("resolve() still prefers inline file_data over IndexedDB, unchanged from before this gate", async () => {
    const inline = "data:image/png;base64,aW5saW5l";
    const result = await win.PCC.blobStore.resolve("png-1", inline);
    assert.strictEqual(result, inline, "inline data must win over whatever is in IndexedDB");
  });

  await check("real call site still works end-to-end: a seeded Document's Open File opens the (now-compressed) blob correctly", async () => {
    win.PCC.store.update((data) => {
      const project = win.PCC.store.newProject({ name: "Gate 4 Test Project", status: "on_track" });
      data.projects.push(project);
      const doc = win.PCC.store.newDocument({
        project_id: project.id,
        filename: "gate4-icon.png",
        mime_type: "image/png",
        category: "specification",
      });
      data.documents.push(doc);
      win._gate4DocId = doc.id;
    });
    await win.PCC.blobStore.putBlob(win._gate4DocId, "data:image/png;base64," + REAL_PNG_B64);

    let openedWith = null;
    const realOpen = win.PCC.fileViewer.open;
    win.PCC.fileViewer.open = (opts) => {
      openedWith = opts;
    };
    win.PCC.router.go("documents");
    win.PCC.router.render();
    const openBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Open File");
    assert.ok(openBtn, "expected an Open File button");
    openBtn.click();
    await waitFor(() => openedWith !== null, 5000);
    win.PCC.fileViewer.open = realOpen;

    assert.ok(openedWith, "expected fileViewer.open to have been called");
    const openedB64 = await new Promise((resolve, reject) => {
      const reader = new win.FileReader();
      reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(",") + 1));
      reader.onerror = reject;
      reader.readAsDataURL(openedWith.blob);
    });
    assert.strictEqual(openedB64, REAL_PNG_B64, "the file opened through the real UI must be byte-identical to what was uploaded");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
