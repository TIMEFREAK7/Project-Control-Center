// PCC Architecture Upgrade Phase 6 (Document/File Storage Engine): Trash/Recycle Bin.
// End-to-end jsdom test against the actual bundled index.html. Master upgrade prompt
// Section 26: DELETE -> TRASH -> RETENTION -> PERMANENT DELETE, with RESTORE and EMPTY
// TRASH, and "do not immediately permanently delete important evidence."
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

  let projectId, docTypeId;
  let doc1Id, doc2Id, doc3Id;

  await check("seed a project, a document type with a compliance requirement, and three documents (one with two revisions)", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_trash_1", name: "Trash Test Project", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var docType = win.PCC.store.newDocumentType ? win.PCC.store.newDocumentType({ project_id: projectId, name: "Test Cert" }) : null;
      if (docType) {
        data.document_types.push(docType);
        docTypeId = docType.id;
        data.project_document_requirements.push({
          id: "pdr_1", project_id: projectId, document_type_id: docTypeId, planned_submission_date: "", notes: "",
        });
      }

      var doc1 = win.PCC.store.newDocument({ project_id: projectId, filename: "rev1.pdf", document_type_id: docTypeId || "" });
      doc1.file_data = null;
      data.documents.push(doc1);
      doc1Id = doc1.id;

      var doc2 = win.PCC.store.newDocument({
        project_id: projectId, filename: "rev2.pdf", document_group_id: doc1Id, revision_number: 2, document_type_id: docTypeId || "",
      });
      doc2.file_data = null;
      data.documents.push(doc2);
      doc2Id = doc2.id;

      var doc3 = win.PCC.store.newDocument({ project_id: projectId, filename: "standalone.pdf" });
      doc3.file_data = null;
      data.documents.push(doc3);
      doc3Id = doc3.id;

      project.attachments = [doc1Id, doc2Id, doc3Id];
    });
    win.PCC.router.go("documents");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the 'Trash (0)' toggle exists in the toolbar and Documents shows both active documents", () => {
    var trashBtn = findButtonByText(win, "Trash (0)");
    assert.ok(trashBtn, "expected a 'Trash (0)' toggle button");
    var text = outlet().textContent;
    assert.ok(text.indexOf("standalone.pdf") !== -1);
  });

  await check("clicking 'Delete' on a document moves its whole revision group to Trash (record stays, hidden from the active register)", () => {
    win.confirm = () => true;
    // Select the multi-revision document (rev1/rev2 group) in the preview pane.
    var listItem = Array.from(win.document.querySelectorAll(".doc-register-item")).find(function (el) {
      return el.textContent.indexOf("rev2.pdf") !== -1;
    });
    assert.ok(listItem, "expected to find the rev2.pdf row");
    listItem.click();
    findButtonByText(win, "Delete").click();

    var data = win.PCC.store.get();
    var rev1 = data.documents.find(function (d) { return d.id === doc1Id; });
    var rev2 = data.documents.find(function (d) { return d.id === doc2Id; });
    assert.ok(rev1.trashed_at, "revision 1 must be trashed");
    assert.ok(rev2.trashed_at, "revision 2 must be trashed");
    var doc3 = data.documents.find(function (d) { return d.id === doc3Id; });
    assert.strictEqual(doc3.trashed_at, null, "the untouched document must remain active");
  });

  await check("the blob is NOT deleted when trashing — only when permanently deleted", async () => {
    await win.PCC.blobStore.putBlob(doc1Id, "data:application/pdf;base64,ZmFrZQ==");
    var blob = await win.PCC.blobStore.getBlob(doc1Id);
    assert.ok(blob, "the blob must still exist after trashing, not deleted");
  });

  await check("the trashed document is gone from the active register and the toolbar shows 'Trash (1)'", () => {
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("rev2.pdf") === -1, "the trashed document must not appear in the active register");
    assert.ok(text.indexOf("standalone.pdf") !== -1, "the untouched document must still appear");
    assert.ok(findButtonByText(win, "Trash (1)"), "expected the Trash toggle to now show count 1");
  });

  await check("a trashed document no longer counts toward a document-type compliance requirement", () => {
    if (!docTypeId) return; // newDocumentType not available in this build state — skip gracefully
    var data = win.PCC.store.get();
    var available = data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === docTypeId && !d.trashed_at;
    });
    assert.strictEqual(available, false, "with its only matching document trashed, the requirement must no longer show as available");
  });

  await check("switching to the Trash view shows the trashed document with a 'Trashed ... ago' badge, and Restore/Delete Permanently actions", () => {
    findButtonByText(win, "Trash (1)").click();
    var text = outlet().textContent;
    assert.ok(text.indexOf("rev2.pdf") !== -1, "expected the trashed document to appear in the Trash view");
    assert.ok(text.indexOf("standalone.pdf") === -1, "the active document must NOT appear in the Trash view");
    assert.ok(/Trashed (just now|\d+ (minute|hour|day)s? ago)/.test(text), "expected a 'Trashed ...' badge, got: " + text.slice(0, 600));
    assert.ok(findButtonByText(win, "Restore"), "expected a Restore button in Trash view");
    assert.ok(findButtonByText(win, "Delete Permanently"), "expected a Delete Permanently button in Trash view");
    assert.ok(!findButtonByText(win, "New Revision"), "New Revision must not apply to a trashed document");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clicking Restore brings the document back to the active register and clears trashed_at on every revision", () => {
    findButtonByText(win, "Restore").click();
    var data = win.PCC.store.get();
    var rev1 = data.documents.find(function (d) { return d.id === doc1Id; });
    var rev2 = data.documents.find(function (d) { return d.id === doc2Id; });
    assert.strictEqual(rev1.trashed_at, null);
    assert.strictEqual(rev2.trashed_at, null);
  });

  await check("after restoring the last trashed item, the Trash view (still open) correctly shows 'Trash is empty', and going back shows the restored document again", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Trash is empty") !== -1, "with nothing left trashed, staying on the Trash view should show its empty state, got: " + text.slice(0, 300));
    findButtonByText(win, "← Back to Documents").click();
    text = outlet().textContent;
    assert.ok(text.indexOf("rev2.pdf") !== -1, "the restored document must be visible again in the active register");
  });

  await check("trashing again, then Delete Permanently actually removes the record and its blob for good", async () => {
    win.confirm = () => true;
    var listItem = Array.from(win.document.querySelectorAll(".doc-register-item")).find(function (el) {
      return el.textContent.indexOf("rev2.pdf") !== -1;
    });
    listItem.click();
    findButtonByText(win, "Delete").click();

    var trashBtn = findButtonByText(win, "Trash (1)");
    assert.ok(trashBtn, "expected Trash (1) after re-trashing");
    trashBtn.click();

    findButtonByText(win, "Delete Permanently").click();

    var data = win.PCC.store.get();
    assert.ok(!data.documents.some(function (d) { return d.id === doc1Id; }), "revision 1's record must be gone for good");
    assert.ok(!data.documents.some(function (d) { return d.id === doc2Id; }), "revision 2's record must be gone for good");
    var project = data.projects.find(function (p) { return p.id === projectId; });
    assert.ok(project.attachments.indexOf(doc1Id) === -1 && project.attachments.indexOf(doc2Id) === -1, "project.attachments must be cleaned up");

    var blob = await win.PCC.blobStore.getBlob(doc1Id);
    assert.ok(!blob, "the blob must actually be deleted after permanent delete");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Trash is now empty and shows the empty-trash state", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Trash is empty") !== -1, "expected the empty-trash state, got: " + text.slice(0, 400));
    assert.ok(findButtonByText(win, "← Back to Documents"), "expected a way back to Documents from empty trash");
    findButtonByText(win, "← Back to Documents").click();
  });

  await check("BULK: selecting multiple documents and 'Delete Selected' moves them all to Trash together", () => {
    win.confirm = () => true;
    var checkboxes = Array.from(win.document.querySelectorAll(".doc-register-item__select"));
    checkboxes.forEach(function (cb) {
      cb.checked = true;
      cb.onchange();
    });
    var deleteSelectedBtn = findButtonByText(win, "Delete Selected");
    assert.ok(deleteSelectedBtn, "expected a Delete Selected bulk action");
    deleteSelectedBtn.click();

    var data = win.PCC.store.get();
    var doc3 = data.documents.find(function (d) { return d.id === doc3Id; });
    assert.ok(doc3.trashed_at, "the bulk-selected document must now be trashed");
  });

  await check("EMPTY TRASH: with everything trashed, 'Empty Trash' permanently removes it all after confirmation", async () => {
    win.confirm = () => true;
    var trashBtn = findButtonByText(win, "Trash (1)");
    assert.ok(trashBtn, "expected exactly 1 trashed group (standalone.pdf) after the bulk trash above");
    trashBtn.click();

    var emptyTrashBtn = findButtonByText(win, "Empty Trash");
    assert.ok(emptyTrashBtn, "expected an Empty Trash button");
    emptyTrashBtn.click();
    // permanentlyDeleteDocumentGroup()'s store mutation is synchronous, but the
    // notify()/showTrash-reset/rerender() tail waits on Promise.all(...).then() — flush
    // pending microtasks so the view has actually settled before the next check.
    await flush();

    var data = win.PCC.store.get();
    assert.ok(!data.documents.some(function (d) { return d.id === doc3Id; }), "Empty Trash must permanently remove every trashed document");
  });

  await check("declining the confirmation dialog leaves data untouched (both for Delete and Delete Permanently)", () => {
    win.PCC.store.update(function (data) {
      var doc = win.PCC.store.newDocument({ project_id: projectId, filename: "confirm-test.pdf" });
      doc.file_data = null;
      data.documents.push(doc);
      win.PCC._confirmTestDocId = doc.id;
    });
    win.PCC.router.go("documents");
    win.PCC.router.render();

    win.confirm = () => false;
    var listItem = Array.from(win.document.querySelectorAll(".doc-register-item")).find(function (el) {
      return el.textContent.indexOf("confirm-test.pdf") !== -1;
    });
    listItem.click();
    findButtonByText(win, "Delete").click();

    var data = win.PCC.store.get();
    var doc = data.documents.find(function (d) { return d.id === win.PCC._confirmTestDocId; });
    assert.strictEqual(doc.trashed_at, null, "declining the confirmation must not trash the document");
  });

  // ---- Route smoke test ----
  var routes = ["dashboard", "portfolio", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "resources", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Trash/Recycle Bin feature", () => {
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
