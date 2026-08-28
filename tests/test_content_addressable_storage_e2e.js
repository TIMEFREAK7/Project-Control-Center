// PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Content-Addressable
// Storage — the last deferred Phase 6 item. End-to-end jsdom test against the actual
// bundled index.html. Verifies blobStore.js actually stores identical file content once
// (refcounted), not once per referencing id, while keeping every existing caller's
// id-keyed contract (putBlob/getBlob/deleteBlob/listBlobIds/resolve) unchanged.
//
// jsdom's own `window.crypto` has no `.subtle` (confirmed directly: `typeof
// window.crypto.subtle === "undefined"` under jsdom 30) — real content-addressing can
// never activate without it, so this file polyfills `window.crypto.subtle` with Node's
// own real WebCrypto (`require("crypto").webcrypto.subtle`) to actually exercise the CAS
// path (real SHA-256, real dedup/refcounting) rather than only ever hitting blobStore.js's
// no-hash-available fallback. One check further down explicitly removes the polyfill to
// confirm that fallback path is still safe on its own.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
const { webcrypto } = require("crypto");

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

// Reads a raw record straight out of IndexedDB, bypassing blobStore.js entirely, so the
// test can inspect the actual on-disk shape (the {id, ref} pointer, the {hash, refCount}
// content entry) rather than trusting blobStore's own read path.
function readRaw(win, storeName, key) {
  return new Promise((resolve, reject) => {
    const req = win.indexedDB.open("pcc_blobs_v1", 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(storeName, "readonly");
      const getReq = tx.objectStore(storeName).get(key);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function contentStoreKeyCount(win) {
  return new Promise((resolve, reject) => {
    const req = win.indexedDB.open("pcc_blobs_v1", 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("content", "readonly");
      const getReq = tx.objectStore("content").getAllKeys();
      getReq.onsuccess = () => resolve(getReq.result.length);
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function writeLegacyRecord(win, id, dataUri) {
  return new Promise((resolve, reject) => {
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

const CONTENT_A = "data:application/pdf;base64," + Buffer.from("Identical content A, repeated for realism. ".repeat(50)).toString("base64");
const CONTENT_B = "data:application/pdf;base64," + Buffer.from("Totally different content B. ".repeat(50)).toString("base64");
const CONTENT_C = "data:application/pdf;base64," + Buffer.from("Content C, used only for the isolated dedup-count check. ".repeat(50)).toString("base64");
const CONTENT_D = "data:application/pdf;base64," + Buffer.from("Content D, used only for the real-document call-site check. ".repeat(50)).toString("base64");

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
  dom.window.crypto.subtle = webcrypto.subtle; // jsdom has no real SubtleCrypto — see header comment
  dom.window.isSecureContext = true;
  dom.window.onerror = function (msg) {
    thrownErrors.push(String(msg));
  };
  await flush();
  const win = dom.window;

  await check("two ids with byte-identical content (same mime) both become {ref} pointers to the SAME hash", async () => {
    await win.PCC.blobStore.putBlob("doc-1", CONTENT_A);
    await win.PCC.blobStore.putBlob("doc-2", CONTENT_A);

    const rec1 = await readRaw(win, "blobs", "doc-1");
    const rec2 = await readRaw(win, "blobs", "doc-2");
    assert.ok(rec1.ref, "expected doc-1 to be a CAS pointer");
    assert.ok(rec2.ref, "expected doc-2 to be a CAS pointer");
    assert.strictEqual(rec1.ref, rec2.ref, "identical content under different ids must share one hash");

    const content = await readRaw(win, "content", rec1.ref);
    assert.ok(content, "expected a content-store entry for the shared hash");
    assert.strictEqual(content.refCount, 2, "two ids reference this content, refCount must be 2");
  });

  await check("getBlob() on both ids returns the identical, correct data URI despite sharing storage", async () => {
    const r1 = await win.PCC.blobStore.getBlob("doc-1");
    const r2 = await win.PCC.blobStore.getBlob("doc-2");
    const b64Original = CONTENT_A.slice(CONTENT_A.indexOf(",") + 1);
    assert.strictEqual(r1.slice(r1.indexOf(",") + 1), b64Original);
    assert.strictEqual(r2.slice(r2.indexOf(",") + 1), b64Original);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("deleting one of two referencing ids decrements refCount but keeps the bytes for the survivor", async () => {
    const rec1 = await readRaw(win, "blobs", "doc-1");
    const hash = rec1.ref;

    await win.PCC.blobStore.deleteBlob("doc-1");

    const contentAfter = await readRaw(win, "content", hash);
    assert.ok(contentAfter, "content must still exist — doc-2 still references it");
    assert.strictEqual(contentAfter.refCount, 1);

    const stillThere = await win.PCC.blobStore.getBlob("doc-2");
    assert.ok(stillThere, "doc-2's blob must still be readable after doc-1 was deleted");

    const gone = await win.PCC.blobStore.getBlob("doc-1");
    assert.strictEqual(gone, null, "doc-1 itself must be gone");
  });

  await check("deleting the last referencing id actually frees the shared content entry", async () => {
    const rec2 = await readRaw(win, "blobs", "doc-2");
    const hash = rec2.ref;

    await win.PCC.blobStore.deleteBlob("doc-2");

    const contentAfter = await readRaw(win, "content", hash);
    assert.strictEqual(contentAfter, null, "content entry must be deleted once nothing references it — no orphaned bytes left behind");
  });

  await check("identical bytes with a DIFFERENT declared mime type do NOT collide — separate content entries, correct mime on read", async () => {
    const base64 = Buffer.from("Same bytes, different claimed mime.").toString("base64");
    const asText = "data:text/plain;base64," + base64;
    const asOctet = "data:application/octet-stream;base64," + base64;

    await win.PCC.blobStore.putBlob("mime-text", asText);
    await win.PCC.blobStore.putBlob("mime-octet", asOctet);

    const recText = await readRaw(win, "blobs", "mime-text");
    const recOctet = await readRaw(win, "blobs", "mime-octet");
    assert.notStrictEqual(recText.ref, recOctet.ref, "same bytes but different mime must NOT share a content entry");

    const resultText = await win.PCC.blobStore.getBlob("mime-text");
    const resultOctet = await win.PCC.blobStore.getBlob("mime-octet");
    assert.ok(resultText.startsWith("data:text/plain;base64,"), "must read back with its own correct mime, not the other's");
    assert.ok(resultOctet.startsWith("data:application/octet-stream;base64,"), "must read back with its own correct mime, not the other's");
  });

  await check("re-putting the exact same content under the same id is a true no-op — refCount does not inflate", async () => {
    await win.PCC.blobStore.putBlob("stable-1", CONTENT_B);
    const rec = await readRaw(win, "blobs", "stable-1");
    const contentBefore = await readRaw(win, "content", rec.ref);
    assert.strictEqual(contentBefore.refCount, 1);

    await win.PCC.blobStore.putBlob("stable-1", CONTENT_B); // re-save, same bytes, same id
    await win.PCC.blobStore.putBlob("stable-1", CONTENT_B); // and again

    const contentAfter = await readRaw(win, "content", rec.ref);
    assert.strictEqual(contentAfter.refCount, 1, "re-saving identical content under the SAME id must not inflate refCount");
  });

  await check("overwriting an id with genuinely different content releases the old ref and creates/joins the new one", async () => {
    await win.PCC.blobStore.putBlob("changing-1", CONTENT_A);
    const recA = await readRaw(win, "blobs", "changing-1");
    const hashA = recA.ref;
    const contentAAfterFirst = await readRaw(win, "content", hashA);
    assert.strictEqual(contentAAfterFirst.refCount, 1);

    await win.PCC.blobStore.putBlob("changing-1", CONTENT_B); // overwrite with different content
    const recB = await readRaw(win, "blobs", "changing-1");
    assert.notStrictEqual(recB.ref, hashA, "the id must now point at a different hash");

    const oldContentGone = await readRaw(win, "content", hashA);
    assert.strictEqual(oldContentGone, null, "the old content's only reference is gone, so it must be freed");

    const result = await win.PCC.blobStore.getBlob("changing-1");
    const expectedB64 = CONTENT_B.slice(CONTENT_B.indexOf(",") + 1);
    assert.strictEqual(result.slice(result.indexOf(",") + 1), expectedB64, "must now read back the new content, not the old");
  });

  await check("a legacy pre-CAS record and a fresh CAS write with the SAME logical content coexist independently", async () => {
    await writeLegacyRecord(win, "legacy-cas-1", CONTENT_A);
    await win.PCC.blobStore.putBlob("fresh-cas-1", CONTENT_A);

    const legacyResult = await win.PCC.blobStore.getBlob("legacy-cas-1");
    const freshResult = await win.PCC.blobStore.getBlob("fresh-cas-1");
    const expectedB64 = CONTENT_A.slice(CONTENT_A.indexOf(",") + 1);
    assert.strictEqual(legacyResult.slice(legacyResult.indexOf(",") + 1), expectedB64);
    assert.strictEqual(freshResult.slice(freshResult.indexOf(",") + 1), expectedB64);

    const legacyRaw = await readRaw(win, "blobs", "legacy-cas-1");
    assert.ok(legacyRaw.data, "the legacy record must remain untouched in its old shape — no forced migration");
  });

  await check("re-saving a legacy record joins the existing CAS content entry when its bytes already match one", async () => {
    await win.PCC.blobStore.putBlob("cas-anchor", CONTENT_A);
    const anchorRec = await readRaw(win, "blobs", "cas-anchor");
    const anchorContentBefore = await readRaw(win, "content", anchorRec.ref);
    const refCountBefore = anchorContentBefore.refCount;

    await writeLegacyRecord(win, "legacy-to-upgrade", CONTENT_A);
    await win.PCC.blobStore.putBlob("legacy-to-upgrade", CONTENT_A); // simulates a re-save/new revision

    const upgraded = await readRaw(win, "blobs", "legacy-to-upgrade");
    assert.ok(upgraded.ref, "expected the legacy record to become a CAS pointer after re-save");
    assert.strictEqual(upgraded.ref, anchorRec.ref, "must join the SAME content entry as the identical-content anchor, not create a duplicate");

    const anchorContentAfter = await readRaw(win, "content", anchorRec.ref);
    assert.strictEqual(anchorContentAfter.refCount, refCountBefore + 1, "joining an existing content entry must increment its refCount");
  });

  await check("listBlobIds() still returns exactly the record ids — content-store hashes never leak into it", async () => {
    const ids = await win.PCC.blobStore.listBlobIds();
    assert.ok(ids.includes("fresh-cas-1"), "expected a real id in the list");
    assert.ok(ids.includes("legacy-cas-1"), "expected a real id in the list");
    // Sanity: none of the ids look like a raw 64-char hex hash (a content-store key leaking through).
    ids.forEach(function (id) {
      assert.ok(!/^[0-9a-f]{64}$/.test(id), "a content-store hash key must never appear in listBlobIds(): " + id);
    });
  });

  await check("real storage saving is measurable: N ids with identical content produce exactly ONE content-store entry", async () => {
    const before = await contentStoreKeyCount(win);
    await win.PCC.blobStore.putBlob("dedup-a", CONTENT_C);
    await win.PCC.blobStore.putBlob("dedup-b", CONTENT_C);
    await win.PCC.blobStore.putBlob("dedup-c", CONTENT_C);
    await win.PCC.blobStore.putBlob("dedup-d", CONTENT_C);
    const after = await contentStoreKeyCount(win);
    assert.strictEqual(after, before + 1, "4 ids with identical content must add exactly 1 content-store entry, not 4");

    const rec = await readRaw(win, "blobs", "dedup-a");
    const content = await readRaw(win, "content", rec.ref);
    assert.strictEqual(content.refCount, 4);
  });

  await check("without a strong hash available, putBlob() safely falls back to a direct (non-deduplicated) write — never throws, never hangs", async () => {
    const realSubtle = win.crypto.subtle;
    win.crypto.subtle = undefined;
    try {
      await win.PCC.blobStore.putBlob("no-hash-1", CONTENT_B);
      const rec = await readRaw(win, "blobs", "no-hash-1");
      assert.ok(!rec.ref, "with no strong hash available, must NOT create a CAS pointer");
      assert.ok(rec.gz, "must still store the compressed bytes directly");
      const result = await win.PCC.blobStore.getBlob("no-hash-1");
      const expectedB64 = CONTENT_B.slice(CONTENT_B.indexOf(",") + 1);
      assert.strictEqual(result.slice(result.indexOf(",") + 1), expectedB64, "content must still round-trip correctly without CAS");
    } finally {
      win.crypto.subtle = realSubtle;
    }
  });

  await check("resolve() still prefers inline file_data over IndexedDB, unchanged by CAS", async () => {
    const inline = "data:image/png;base64,aW5saW5l";
    const result = await win.PCC.blobStore.resolve("fresh-cas-1", inline);
    assert.strictEqual(result, inline, "inline data must win over whatever is in IndexedDB");
  });

  await check("real call site: two documents uploaded with byte-identical content end up sharing one content-store entry", async () => {
    win.PCC.store.update((data) => {
      const project = win.PCC.store.newProject({ name: "CAS Test Project", status: "on_track" });
      data.projects.push(project);
      const doc1 = win.PCC.store.newDocument({ project_id: project.id, filename: "copy-1.pdf" });
      doc1.file_data = null;
      data.documents.push(doc1);
      const doc2 = win.PCC.store.newDocument({ project_id: project.id, filename: "copy-2.pdf" });
      doc2.file_data = null;
      data.documents.push(doc2);
      win._casDoc1 = doc1.id;
      win._casDoc2 = doc2.id;
    });

    const before = await contentStoreKeyCount(win);
    await win.PCC.blobStore.putBlob(win._casDoc1, CONTENT_D);
    await win.PCC.blobStore.putBlob(win._casDoc2, CONTENT_D);
    const after = await contentStoreKeyCount(win);
    assert.strictEqual(after, before + 1, "two documents with identical file content must add exactly one content-store entry");

    win.PCC.router.go("documents");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test ----
  const routes = ["dashboard", "portfolio", "documents", "storageManagement", "dailylog", "schedule", "risks", "vendors", "reports", "settings"];
  for (const route of routes) {
    await check("route '" + route + "' renders without throwing after the Content-Addressable Storage feature", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(route);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
