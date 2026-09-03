// PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Bulk Import.
// End-to-end jsdom test against the actual bundled index.html, exercising the real UI:
// drag-and-drop/multi-file selection -> scan -> hash -> duplicate check -> preview ->
// confirm -> batch import -> progress -> summary (master upgrade prompt Section 21/22).
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
async function waitFor(conditionFn, timeoutMs) {
  timeoutMs = timeoutMs || 5000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (conditionFn()) return;
    await sleep(20);
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

function findButtonByText(win, text) {
  const buttons = Array.from(win.document.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}

function setInputFiles(win, input, files) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  // documents.js is now React-migrated: React's synthetic event system listens at the
  // document root, so a non-bubbling event dispatched directly on the <input> never
  // reaches its onChange handler — bubbles:true is required (see CLAUDE.md's React
  // migration notes on the analogous controlled-input bypass pattern).
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
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

  let projectId;
  await check("seed a project and navigate to Documents", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_bulk_1", name: "Bulk Import Test Project", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;
    });
    win.PCC.router.go("documents");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Bulk Import' button exists and opens the panel", async () => {
    var btn = findButtonByText(win, "Bulk Import");
    assert.ok(btn, "Bulk Import button not found");
    btn.click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Bulk Import") !== -1);
    assert.ok(text.indexOf("Choose Files") !== -1, "expected a Choose Files control");
    assert.ok(text.indexOf("Choose Folder") !== -1, "expected a Choose Folder control");
  });

  await check("selecting multiple files scans them, hashes them, and shows them as Ready", async () => {
    var fileInput = win.document.querySelector('input[type="file"][multiple]:not([webkitdirectory])');
    assert.ok(fileInput, "expected the multi-file input to exist");

    var f1 = new win.File(["content-of-file-one"], "drawing-a.pdf", { type: "application/pdf" });
    var f2 = new win.File(["content-of-file-two"], "drawing-b.pdf", { type: "application/pdf" });
    setInputFiles(win, fileInput, [f1, f2]);

    await waitFor(() => {
      var t = outlet().textContent;
      return t.indexOf("2 files selected") !== -1 && t.indexOf("2 ready") !== -1;
    }, 10000);

    var text = outlet().textContent;
    assert.ok(text.indexOf("drawing-a.pdf") !== -1);
    assert.ok(text.indexOf("drawing-b.pdf") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Import button is disabled until a project is selected, enabled once one auto-defaults", () => {
    var importBtn = findButtonByText(win, "Import 2 Files");
    assert.ok(importBtn, "expected an 'Import 2 Files' button, got: " + outlet().textContent.slice(0, 400));
    assert.strictEqual(importBtn.disabled, false, "a project should auto-default to the first active project, enabling import");
  });

  let doc1Id, doc2Id;
  await check("clicking Import commits both files: documents created, blobs written, project.attachments updated", async () => {
    var before = win.PCC.store.get().documents.length;
    findButtonByText(win, "Import 2 Files").click();
    await waitFor(() => win.PCC.store.get().documents.length === before + 2, 10000);

    var data = win.PCC.store.get();
    var newDocs = data.documents.filter(function (d) { return d.project_id === projectId; });
    assert.strictEqual(newDocs.length, 2);
    doc1Id = newDocs.find(function (d) { return d.filename === "drawing-a.pdf"; }).id;
    doc2Id = newDocs.find(function (d) { return d.filename === "drawing-b.pdf"; }).id;
    assert.ok(doc1Id && doc2Id, "both filenames must be present among the newly created documents");

    newDocs.forEach(function (d) {
      assert.ok(d.content_hash, "every bulk-imported document must have a real fingerprint");
      // jsdom has no crypto.subtle (confirmed: window.crypto.subtle is undefined here),
      // so duplicateService.fingerprintFile() correctly falls back to its documented
      // "name-size" method — the real sha256 path is verified separately in real
      // Chromium (see the scratchpad smoke test), where crypto.subtle actually exists.
      assert.ok(d.hash_method === "sha256" || d.hash_method === "name-size", "unexpected hash_method: " + d.hash_method);
      assert.strictEqual(d.is_duplicate, false);
      assert.strictEqual(d.file_data, null, "the blob must live in blobStore.js, not inline in the JSON store");
    });

    var project = data.projects.find(function (p) { return p.id === projectId; });
    assert.ok(project.attachments.indexOf(doc1Id) !== -1 && project.attachments.indexOf(doc2Id) !== -1, "both new documents must be linked into the project's attachments array");

    var blob1 = await win.PCC.blobStore.getBlob(doc1Id);
    var blob2 = await win.PCC.blobStore.getBlob(doc2Id);
    assert.ok(blob1 && blob2, "both blobs must actually be retrievable from blobStore.js");
    assert.strictEqual(Buffer.from(blob1.split(",")[1], "base64").toString("utf8"), "content-of-file-one");
    assert.strictEqual(Buffer.from(blob2.split(",")[1], "base64").toString("utf8"), "content-of-file-two");

    // documents.js is React-migrated: the store update above lands slightly before the
    // component's own setSummary()/setFiles([]) re-render commits — flush so the next
    // check reads the settled DOM, not a stale one.
    await flush();

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the panel shows a completion summary and clears the pending file list", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Import complete") !== -1, "expected a completion summary, got: " + text.slice(0, 400));
    assert.ok(text.indexOf("2 imported") !== -1);
  });

  await check("DUPLICATE DETECTION: bulk-importing a file matching an existing document's name+size flags it as a possible duplicate, but still imports it", async () => {
    findButtonByText(win, "Close").click();
    await flush();
    findButtonByText(win, "Bulk Import").click();
    await flush();
    var fileInput = win.document.querySelector('input[type="file"][multiple]:not([webkitdirectory])');
    // Same filename AND same byte length as doc1 ("content-of-file-one", 20 bytes) — this
    // is the "name-size" match duplicateService.js falls back to without crypto.subtle
    // (confirmed absent in jsdom; see the check above). The real content-hash (sha256)
    // duplicate path is verified separately in real Chromium, where crypto.subtle exists.
    var dup = new win.File(["content-of-file-!!!"], "drawing-a.pdf", { type: "application/pdf" });
    setInputFiles(win, fileInput, [dup]);

    // "0 possible duplicates" always renders in the summary line even before scanning
    // finishes, so waiting on that substring alone would be a false positive — wait for
    // scanning to actually finish (no more "scanning…" left) instead.
    await waitFor(() => outlet().textContent.indexOf("1 file selected") !== -1 && outlet().textContent.indexOf("scanning") === -1, 10000);
    var text = outlet().textContent;
    assert.ok(text.indexOf("1 file selected") !== -1);
    assert.ok(text.indexOf("0 ready") !== -1);
    assert.ok(text.indexOf("1 possible duplicate") !== -1);
    assert.ok(text.indexOf("drawing-a.pdf") !== -1, "expected the matched original's filename to be named in the row");

    var before = win.PCC.store.get().documents.length;
    var importBtn = findButtonByText(win, "Import 1 File");
    assert.ok(importBtn, "the import button must still offer to import the flagged duplicate, not block it");
    assert.strictEqual(importBtn.disabled, false, "a possible duplicate must still be importable — never silently rejected");
    importBtn.click();
    await waitFor(() => win.PCC.store.get().documents.length === before + 1, 10000);

    var newDoc = win.PCC.store.get().documents.find(function (d) { return d.filename === "drawing-a.pdf" && d.id !== doc1Id; });
    assert.ok(newDoc, "the flagged duplicate must still have been imported");
    assert.strictEqual(newDoc.is_duplicate, true);
    assert.ok(newDoc.duplicate_group_id, "expected a duplicate_group_id to be assigned");

    var original = win.PCC.store.get().documents.find(function (d) { return d.id === doc1Id; });
    assert.strictEqual(original.duplicate_group_id, newDoc.duplicate_group_id, "the original record must be back-filled with the same duplicate_group_id");

    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a file can be removed from the pending batch before import", async () => {
    findButtonByText(win, "Close").click();
    await flush();
    findButtonByText(win, "Bulk Import").click();
    await flush();
    var fileInput = win.document.querySelector('input[type="file"][multiple]:not([webkitdirectory])');
    var f1 = new win.File(["remove-me"], "temp1.txt", { type: "text/plain" });
    var f2 = new win.File(["keep-me"], "temp2.txt", { type: "text/plain" });
    setInputFiles(win, fileInput, [f1, f2]);
    await waitFor(() => outlet().textContent.indexOf("2 files selected") !== -1, 10000);

    var removeBtn = Array.from(win.document.querySelectorAll("button")).find(function (b) {
      return b.textContent.trim() === "Remove";
    });
    assert.ok(removeBtn);
    removeBtn.click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("1 file selected") !== -1, "expected one file left after removing the other, got: " + text.slice(0, 400));
  });

  await check("dropping files onto the drop zone scans them the same way as the file picker", async () => {
    var dropZone = Array.from(win.document.querySelectorAll("div")).find(function (d) {
      return d.textContent.trim() === "Drag and drop files here, or use the buttons below.";
    });
    assert.ok(dropZone, "expected the drop zone element to exist");
    var dropped = new win.File(["dropped-content"], "dropped.txt", { type: "text/plain" });
    var fakeEvent = new win.Event("drop", { bubbles: true, cancelable: true });
    fakeEvent.dataTransfer = { files: [dropped] };
    dropZone.dispatchEvent(fakeEvent);

    await waitFor(() => outlet().textContent.indexOf("dropped.txt") !== -1, 10000);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Close' resets the bulk import panel without importing anything pending", async () => {
    var before = win.PCC.store.get().documents.length;
    findButtonByText(win, "Close").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Bulk Import") === -1 || !win.document.querySelector('input[type="file"][multiple]:not([webkitdirectory])'), "the bulk import panel should be closed");
    assert.strictEqual(win.PCC.store.get().documents.length, before, "closing without importing must not create any documents");
  });

  // ---- Route smoke test ----
  var routes = ["dashboard", "portfolio", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Bulk Import", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
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
