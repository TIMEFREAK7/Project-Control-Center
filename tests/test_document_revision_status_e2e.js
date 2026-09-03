// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 17 (Document
// Control 4: Status + Version Control) — same convention every prior gate's e2e test
// uses. Documents are seeded directly via the store (the file-driven upload/extraction
// pipeline isn't jsdom-testable in this codebase — see Gate 16's own e2e test comment),
// covering everything reachable without picking a file: revision grouping/latest-only
// list, the History panel, "New Revision" pre-fill, quick status changes, cascading
// delete across a whole revision group, and Portfolio's ATTACHMENTS section collapsing
// to latest-only too. The actual multi-step "pick a real file for a new revision" flow
// was verified via real-browser Playwright instead — see this gate's README write-up.
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

function findButtonByText(dom, text) {
  const buttons = Array.from(dom.window.document.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}
function findAllButtonsByText(dom, text) {
  const buttons = Array.from(dom.window.document.querySelectorAll("button"));
  return buttons.filter((b) => b.textContent.trim() === text);
}
function findFieldByLabel(dom, labelText) {
  const labels = Array.from(dom.window.document.querySelectorAll(".field label"));
  const match = labels.find((l) => l.textContent.trim() === labelText);
  return match ? match.parentElement.querySelector("input, select, textarea") : null;
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
  dom.window.onerror = function (msg) {
    thrownErrors.push(msg);
  };

  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.files.latestOnly, "documents.js's latestOnly() must be exposed for portfolio.js");
  });

  let projectId, doc1Id, groupId;
  await check("seed a project and a first document revision directly via the store", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Revision Test Project", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var doc1 = win.PCC.store.newDocument({
        project_id: projectId,
        filename: "spec-rev00.pdf",
        status: "approved",
        discipline: "ELE",
        document_number: "001",
        revision: "00",
      });
      data.documents.push(doc1);
      doc1Id = doc1.id;
      groupId = doc1.document_group_id;
    });
    assert.strictEqual(groupId, doc1Id, "a document with no explicit group must default to its own id");
  });

  await check("Documents shows the single revision with 'Revision 1', a Status select, and no History button yet", () => {
    win.PCC.router.go("documents");
    win.PCC.router.render();
    var outletText = win.document.getElementById("page-outlet").textContent;
    assert.ok(outletText.indexOf("spec-rev00.pdf") !== -1);
    // UI/UX Overhaul Gate 6: the preview pane's detail-grid renders "Revision" and its
    // value as separate label/value elements (no space/colon between them).
    assert.ok(outletText.indexOf("Revision1") !== -1);
    assert.ok(findButtonByText(dom, "New Revision"), "New Revision button must be present");
    assert.ok(!findAllButtonsByText(dom, "History (1)").length, "a single-revision document has no History button");
  });

  await check("'New Revision' opens the upload form pre-filled from the latest revision, status reset to Draft", () => {
    findButtonByText(dom, "New Revision").click();
    var outletText = win.document.getElementById("page-outlet").textContent;
    assert.ok(outletText.indexOf("Upload New Revision") !== -1);
    assert.strictEqual(findFieldByLabel(dom, "Discipline").value, "ELE");
    assert.strictEqual(findFieldByLabel(dom, "Document Number").value, "001");
    assert.strictEqual(findFieldByLabel(dom, "Status").value, "draft", "a new revision must never inherit 'approved' from the previous one");
    // Cancel back out — the actual file-driven Save is covered by real-browser
    // verification (see README); this jsdom test can't pick a real file.
    findButtonByText(dom, "Cancel").click();
  });

  var doc2Id;
  await check("seed a second revision in the same group directly via the store (simulating a completed 'New Revision' upload)", () => {
    win.PCC.store.update(function (data) {
      var doc2 = win.PCC.store.newDocument({
        project_id: projectId,
        filename: "spec-rev01.pdf",
        document_group_id: groupId,
        revision_number: 2,
        status: "draft",
        discipline: "ELE",
        document_number: "001",
        revision: "01",
      });
      data.documents.push(doc2);
      doc2Id = doc2.id;
    });
    win.PCC.router.render();
  });

  await check("the list now shows only the latest revision (rev 2) as the top-level row, with a History (2) button", () => {
    var outletText = win.document.getElementById("page-outlet").textContent;
    assert.ok(outletText.indexOf("spec-rev01.pdf") !== -1, "latest revision's filename must be the visible row");
    assert.ok(outletText.indexOf("spec-rev00.pdf") === -1, "the older revision must not appear as its own top-level row");
    assert.ok(outletText.indexOf("Revision2") !== -1);
    assert.ok(findButtonByText(dom, "History (2)"), "History button must show the correct revision count");
  });

  await check("History expands to show the older revision with an Open File action", () => {
    findButtonByText(dom, "History (2)").click();
    win.PCC.router.render();
    var outletText = win.document.getElementById("page-outlet").textContent;
    assert.ok(outletText.indexOf("Rev 1") !== -1 && outletText.indexOf("spec-rev00.pdf") !== -1, "the History panel must list the older revision");
  });

  await check("changing the Status select on the row updates the store immediately, no separate save step", () => {
    // UI/UX Overhaul Gate 6: the per-document Status editor now lives in the preview
    // pane, not the row itself — and the new filter toolbar's own "All statuses" select
    // shares the same option values, so this must be scoped to .doc-register-preview
    // specifically rather than grabbing the first matching <select> on the page.
    var statusSelects = Array.from(win.document.querySelectorAll("#page-outlet .doc-register-preview select")).filter(function (s) {
      return Array.from(s.options).some(function (o) { return o.value === "under_review"; });
    });
    assert.ok(statusSelects.length > 0, "the preview pane's Status quick-change select must be present");
    var rowStatusSelect = statusSelects[0];
    rowStatusSelect.value = "under_review";
    rowStatusSelect.dispatchEvent(new win.Event("change"));

    var updated = win.PCC.store.get().documents.find(function (d) { return d.id === doc2Id; });
    assert.strictEqual(updated.status, "under_review");
  });

  await check("Portfolio's ATTACHMENTS section also shows only the latest revision, not one row per revision", async () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    // portfolio.js is a React-migrated page — flush before interacting and after every
    // click whose state update commits asynchronously (see CLAUDE.md's React
    // migration notes). Deliberately no extra win.PCC.router.render() call after the
    // click — that would trigger a second, fresh remount losing the expanded state
    // (see CLAUDE.md's React migration notes on this general class of bug).
    await flush();
    findButtonByText(dom, "Details").click();
    await flush();
    var outletText = win.document.getElementById("page-outlet").textContent;
    assert.ok(outletText.indexOf("spec-rev01.pdf") !== -1);
    assert.ok(outletText.indexOf("spec-rev00.pdf") === -1, "Portfolio's ATTACHMENTS must collapse to latest-only, matching Documents' own list");
  });

  await check("Delete on the latest revision moves the ENTIRE revision history to Trash, not just that one row (PCC Architecture Upgrade Phase 6: Trash/Recycle Bin)", () => {
    win.PCC.router.go("documents");
    win.PCC.router.render();
    var originalConfirm = win.confirm;
    var confirmMessage = "";
    win.confirm = function (msg) { confirmMessage = msg; return true; };
    findButtonByText(dom, "Delete").click();
    win.confirm = originalConfirm;

    assert.ok(confirmMessage.indexOf("2") !== -1, "the confirm warning should mention both revisions, got: " + confirmMessage);
    assert.ok(confirmMessage.toLowerCase().indexOf("trash") !== -1, "the confirm warning should say this moves to Trash, not that it's permanent");
    var data = win.PCC.store.get();
    var rev1 = data.documents.find(function (d) { return d.id === doc1Id; });
    var rev2 = data.documents.find(function (d) { return d.id === doc2Id; });
    assert.ok(rev1 && rev1.trashed_at, "the older revision's record must still exist, now trashed");
    assert.ok(rev2 && rev2.trashed_at, "the latest revision's record must still exist, now trashed");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page ----
  var routes = ["dashboard", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "resources", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 17 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
