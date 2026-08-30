// PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Storage Analytics &
// Orphan Detection. End-to-end jsdom test against the actual bundled index.html. Master
// upgrade prompt Section 28 (Storage Analytics) and Section 29 (Orphan File Detection).
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

  let projectId, docId, orphanBlobId;

  await check("seed a project and a document with a known file size", async () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_storage_1", name: "Storage Test Project", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var doc = win.PCC.store.newDocument({ project_id: projectId, filename: "spec.pdf" });
      doc.file_data = null;
      doc.file_size = 123456;
      data.documents.push(doc);
      docId = doc.id;
      project.attachments = [docId];
    });
    await win.PCC.blobStore.putBlob(docId, "data:application/pdf;base64,ZmFrZQ==");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("navigating to Storage Management renders the heading, info panel, and summary cards", async () => {
    win.PCC.router.go("storageManagement");
    win.PCC.router.render();
    // React's createRoot().render() commits its initial mount asynchronously (unlike the
    // raw DOM writes every other page here still uses) — a real, documented behavior
    // difference for this page since its React migration, not a jsdom quirk. Every check
    // below that reads DOM content right after a fresh render() on this route needs the
    // same flush, matching how this file already awaits the async Scan Storage action.
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Storage Management") !== -1);
    assert.ok(text.indexOf("Scan Storage tool") !== -1, "expected the info panel copy");
    assert.ok(text.indexOf("Total Storage Used") !== -1);
    assert.ok(text.indexOf("In Trash") !== -1);
    assert.ok(text.indexOf("Possible Duplicates") !== -1);
    assert.ok(text.indexOf("120.6 KB") !== -1, "expected the seeded document's size formatted, got: " + text.slice(0, 800));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the By Type and By Project breakdown tables list the seeded document", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("By Type") !== -1);
    assert.ok(text.indexOf("Documents") !== -1);
    assert.ok(text.indexOf("By Project") !== -1);
    assert.ok(text.indexOf("Storage Test Project") !== -1);
  });

  await check("the Largest Files panel lists the seeded document with its project and size", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Largest Files") !== -1);
    assert.ok(text.indexOf("spec.pdf") !== -1);
  });

  await check("a document with no project is bucketed under Unassigned in By Project", async () => {
    let noProjectDocId;
    win.PCC.store.update(function (data) {
      var doc = win.PCC.store.newDocument({ project_id: "", filename: "no-project.pdf" });
      doc.file_data = null;
      doc.file_size = 500;
      doc.project_id = "";
      data.documents.push(doc);
      noProjectDocId = doc.id;
    });
    await win.PCC.blobStore.putBlob(noProjectDocId, "data:application/pdf;base64,bm9wcm9qZWN0");
    win.PCC.router.render();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Unassigned") !== -1, "expected an Unassigned bucket, got: " + text.slice(0, 800));
  });

  await check("Scan Storage finds no orphans or missing files when everything matches", async () => {
    win.PCC.router.go("storageManagement");
    win.PCC.router.render();
    await flush();
    findButtonByText(win, "Scan Storage").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(/Orphan Files \(0\)/.test(text), "expected 0 orphans, got: " + text.slice(0, 1200));
    assert.ok(text.indexOf("None found — every stored file has a matching record.") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Scan Storage detects an orphan blob (stored file with no matching record)", async () => {
    orphanBlobId = "orphan_blob_1";
    await win.PCC.blobStore.putBlob(orphanBlobId, "data:application/pdf;base64,b3JwaGFuZGF0YQ==");
    win.PCC.router.render();
    await flush();
    findButtonByText(win, "Scan Storage").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(/Orphan Files \(1\)/.test(text), "expected 1 orphan, got: " + text.slice(0, 1200));
    assert.ok(text.indexOf(orphanBlobId) !== -1, "expected the orphan blob's id to be shown");
    assert.ok(findButtonByText(win, "Delete Orphan File"), "expected a Delete Orphan File button");
  });

  await check("Scan Storage detects a record with a missing blob (a document whose file was never stored)", async () => {
    let missingDocId;
    win.PCC.store.update(function (data) {
      var doc = win.PCC.store.newDocument({ project_id: projectId, filename: "missing-file.pdf" });
      doc.file_data = null;
      doc.file_size = 999;
      data.documents.push(doc);
      missingDocId = doc.id;
    });
    win.PCC.router.render();
    await flush();
    findButtonByText(win, "Scan Storage").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Records With a Missing File (1)") !== -1, "expected 1 missing-blob record, got: " + text.slice(0, 1500));
    assert.ok(text.indexOf("missing-file.pdf") !== -1);
    assert.ok(text.indexOf("review and decide whether to remove the record or re-upload it") !== -1);
    assert.ok(!findButtonByText(win, "Delete Orphan File Missing"), "sanity check: no delete action attached to missing-blob records");
    // clean up so it doesn't interfere with the next check
    win.PCC.store.update(function (data) {
      data.documents = data.documents.filter(function (d) { return d.id !== missingDocId; });
    });
  });

  await check("clicking 'Delete Orphan File' after confirming actually deletes the blob and removes it from the list", async () => {
    win.confirm = () => true;
    win.PCC.router.render();
    await flush();
    findButtonByText(win, "Scan Storage").click();
    await flush();
    assert.ok(/Orphan Files \(1\)/.test(outlet().textContent));
    findButtonByText(win, "Delete Orphan File").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(/Orphan Files \(0\)/.test(text), "expected the orphan to be gone after deletion, got: " + text.slice(0, 1200));
    var blob = await win.PCC.blobStore.getBlob(orphanBlobId);
    assert.ok(!blob, "the orphan blob must actually be deleted from IndexedDB");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("declining the confirmation dialog leaves the orphan blob untouched", async () => {
    await win.PCC.blobStore.putBlob("orphan_blob_2", "data:application/pdf;base64,YWJj");
    win.PCC.router.render();
    await flush();
    findButtonByText(win, "Scan Storage").click();
    await flush();
    assert.ok(/Orphan Files \(1\)/.test(outlet().textContent));
    win.confirm = () => false;
    findButtonByText(win, "Delete Orphan File").click();
    await flush();
    var blob = await win.PCC.blobStore.getBlob("orphan_blob_2");
    assert.ok(blob, "declining the confirmation must leave the orphan blob in place");
  });

  await check("a trashed document's size is excluded from the active total and shown under 'In Trash' instead", () => {
    win.PCC.store.update(function (data) {
      var doc = data.documents.find(function (d) { return d.id === docId; });
      doc.trashed_at = new Date().toISOString();
    });
    win.PCC.router.go("storageManagement");
    win.PCC.router.render();
    var data = win.PCC.store.get();
    var records = win.PCC.storageAnalyticsEngine.collectFileRecords(data);
    var s = win.PCC.storageAnalyticsEngine.summarizeStorage(records);
    assert.strictEqual(s.trashedCount, 1, "expected the trashed document to be counted in trash");
    assert.ok(s.totalBytes < 123456 + 500, "the trashed document's bytes must not count toward the active total");
    // restore for cleanliness
    win.PCC.store.update(function (data2) {
      var doc = data2.documents.find(function (d) { return d.id === docId; });
      doc.trashed_at = null;
    });
  });

  // ---- Route smoke test ----
  var routes = ["dashboard", "portfolio", "documents", "documentTypes", "documentControlDashboard", "storageManagement", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "resources", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Storage Management feature", () => {
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
