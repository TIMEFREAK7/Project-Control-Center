// End-to-end jsdom test against the ACTUAL bundled index.html for Knowledge Base (PCC
// Evolution Roadmap, Tier 3 — the tier's second gate, after Lessons Learned). Confirmed
// via AskUserQuestion: PORTFOLIO-WIDE (optional project_id), not mandatory-project like
// every other register — a standard procedure or checklist isn't "for" any one project,
// same disclosed exception newVendorDocument() already established. Also confirmed:
// articles carry their OWN file attachment (blob in blobStore, keyed by the article's
// own id — no dual-path inline `file_data` fallback, since this register postdates the
// Phase 12 blobs-only migration).
//
// File-upload UI is deliberately NOT driven through jsdom (`<input type="file">` +
// FileReader) — same established precedent every other file-upload-adjacent test in
// this suite follows (see test_vendors_e2e.js / test_baseline_revision_control_e2e.js's
// own comments on "bypassing FileReader"): the attached-file scenario below seeds a
// blob directly via blobStore.putBlob() and mirrors the resulting store write, rather
// than simulating file selection.
// schema_version 48 -> 49.
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
// The Knowledge Base page is React-controlled/uncontrolled-with-onChange. Setting
// `el.value = x` directly does NOT make React's onChange fire for a controlled element
// (the filter selects/search box here) — React patches the native value-property setter
// to track "last known value," and a raw assignment updates that tracker too, so React
// sees no real change when the event fires next. Bypass React's patched setter via the
// native prototype descriptor first, then dispatch the event — see
// tests/test_document_types_e2e.js for the same pattern.
function setReactSelectValue(win, el, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}
function setReactInputValue(win, el, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
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
  // jsdom doesn't implement CompressionStream/DecompressionStream/Response — needed since
  // Gate 4 (blobStore.js compression). Reuse Node's own, the real implementation.
  dom.window.CompressionStream = CompressionStream;
  dom.window.DecompressionStream = DecompressionStream;
  dom.window.Response = Response;
  dom.window.onerror = function (msg) {
    thrownErrors.push(msg);
  };

  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  await check("app boots on the bundled index.html without throwing, schema_version is 49", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.pages.knowledgeBase, "knowledgeBase page module must be bundled");
    // >= not === : keeps this test passing against whatever schema_version a future
    // gate bumps to next, rather than going stale the moment it does (same lesson the
    // Gate 26 and Lessons Learned tests' own hardcoded === assertions already taught).
    assert.ok(win.PCC.store.get().schema_version >= 49);
  });

  await check("the sidebar links to Knowledge Base, and '+ Add Article' is available even with zero projects (portfolio-wide, no mandatory project)", () => {
    win.PCC.router.go("knowledgeBase");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Knowledge Base") !== -1);
    assert.ok(text.indexOf("No articles yet.") !== -1);
    var addBtn = findButtonByText(dom, "+ Add Article");
    assert.ok(addBtn, "+ Add Article button not found");
    assert.strictEqual(addBtn.disabled, false, "Add Article must never be gated on a project existing, unlike every other register");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'+ Add Article' opens a form requiring only Title, defaulting category to Other and project to General", async () => {
    findButtonByText(dom, "+ Add Article").click();
    await flush();
    var categorySelect = outlet().querySelector("#kbfield-category");
    var projSelect = outlet().querySelector("#kbfield-project_id");
    assert.ok(categorySelect && projSelect, "category/project fields not found");
    assert.strictEqual(categorySelect.value, "other");
    assert.strictEqual(projSelect.value, "");
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.ok(outlet().textContent.indexOf("Title is required.") !== -1);
    assert.strictEqual(win.PCC.store.get().knowledge_base_articles.length, 0, "nothing should be saved when validation fails");
  });

  var articleId;
  await check("filling in Title/Category/Tags/Body with no project and no file persists a portfolio-wide article", async () => {
    outlet().querySelector("#kbfield-title").value = "Rebar Inspection Checklist";
    outlet().querySelector("#kbfield-category").value = "checklist_template";
    outlet().querySelector("#kbfield-tags").value = "rebar, inspection, qa";
    outlet().querySelector("#kbfield-body").value = "Step-by-step checklist for pre-pour rebar inspection.";
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.knowledge_base_articles.length, 1);
    var article = data.knowledge_base_articles[0];
    articleId = article.id;
    assert.strictEqual(article.project_id, "", "portfolio-wide — no project tag");
    assert.strictEqual(article.category, "checklist_template");
    assert.strictEqual(article.tags, "rebar, inspection, qa");
    assert.strictEqual(article.filename, "", "no file attached");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the list shows the new article with 'General (no project)' and no File Attached badge", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Rebar Inspection Checklist") !== -1);
    assert.ok(text.indexOf("General (no project)") !== -1);
    assert.ok(text.indexOf("File Attached") === -1, "no file was attached to this article");
  });

  var projectId;
  await check("seed a project via the store", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Riverside Tower", status: "on_track" });
      d.projects.push(p);
      projectId = p.id;
    });
    win.PCC.router.render();
    assert.ok(projectId);
  });

  await check("adding a second article tagged to that project persists project_id and shows the project name in the list", async () => {
    findButtonByText(dom, "+ Add Article").click();
    await flush();
    outlet().querySelector("#kbfield-title").value = "Riverside Tower Soil Report Interpretation";
    outlet().querySelector("#kbfield-category").value = "reference_material";
    var projSelect = outlet().querySelector("#kbfield-project_id");
    projSelect.value = projectId;
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.knowledge_base_articles.length, 2);
    var tagged = data.knowledge_base_articles.find((a) => a.title === "Riverside Tower Soil Report Interpretation");
    assert.strictEqual(tagged.project_id, projectId);
    var text = outlet().textContent;
    assert.ok(text.indexOf("Riverside Tower") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("category/project filters narrow the list correctly, including the synthetic 'General (no project)' filter", async () => {
    var selects = outlet().querySelectorAll("select");
    var categorySelect = selects[0];
    var projSelectFilter = selects[1];

    setReactSelectValue(win, categorySelect, "reference_material");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Riverside Tower Soil Report Interpretation") !== -1);
    assert.ok(text.indexOf("Rebar Inspection Checklist") === -1, "the checklist article must be filtered out");
    setReactSelectValue(win, categorySelect, "");
    await flush();

    setReactSelectValue(win, projSelectFilter, "__general__");
    await flush();
    text = outlet().textContent;
    assert.ok(text.indexOf("Rebar Inspection Checklist") !== -1);
    assert.ok(text.indexOf("Riverside Tower Soil Report Interpretation") === -1, "the project-tagged article must be filtered out by 'General'");
    setReactSelectValue(win, projSelectFilter, "");
    await flush();
  });

  await check("the search box matches on tags", async () => {
    var searchInput = outlet().querySelector("input[type='text']");
    setReactInputValue(win, searchInput, "qa");
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Rebar Inspection Checklist") !== -1);
    assert.ok(text.indexOf("Riverside Tower Soil Report Interpretation") === -1);
    setReactInputValue(win, searchInput, "");
    await flush();
  });

  await check("Details shows the article's body text", async () => {
    var detailsButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Details");
    detailsButtons[0].click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("BODY") !== -1);
  });

  await check("directly seeding a blob for an existing article (bypassing FileReader, same precedent every file-upload-adjacent test in this suite follows) and updating its metadata shows a File Attached badge and an Open File action", async () => {
    await win.PCC.blobStore.putBlob(articleId, "data:application/pdf;base64,JVBERi0xLjQK");
    win.PCC.store.update(function (d) {
      var a = d.knowledge_base_articles.find((x) => x.id === articleId);
      a.filename = "rebar-checklist.pdf";
      a.file_size = 20480;
      a.mime_type = "application/pdf";
    });
    win.PCC.router.render();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("File Attached") !== -1, "expected a File Attached badge; got: " + text.slice(0, 300));

    // A React page's local state (including expandedId) resets on every remount —
    // router.render() ALWAYS creates a fresh component instance for this route, even when
    // already on it (reactBridge.js unmounts + remounts unconditionally) — unlike the old
    // vanilla page's persistent module-level uiState. Re-open Details explicitly rather
    // than assuming it survived the render() call above.
    findButtonByText(dom, "Details").click();
    await flush();
    text = outlet().textContent;
    assert.ok(text.indexOf("ATTACHED FILE") !== -1, "got: " + text.slice(0, 400));
    assert.ok(text.indexOf("rebar-checklist.pdf") !== -1);
    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — the whole
    // row is the click target now, no separate "Open File" button.
    assert.ok(
      Array.from(outlet().querySelectorAll(".attention-item--clickable")).some((r) => r.textContent.indexOf("rebar-checklist.pdf") !== -1),
      "clickable row for the attached file not found"
    );
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Edit persists a title change", async () => {
    var editButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Edit");
    editButtons[0].click();
    await flush();
    var titleInput = outlet().querySelector("#kbfield-title");
    titleInput.value = "Rebar Inspection Checklist (Rev 2)";
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    var updated = data.knowledge_base_articles.find((a) => a.id === articleId);
    assert.strictEqual(updated.title, "Rebar Inspection Checklist (Rev 2)");
    assert.strictEqual(updated.filename, "rebar-checklist.pdf", "the file attachment must survive an unrelated field edit");
  });

  await check("'Delete' removes an article and its blob", async () => {
    var origConfirm = win.confirm;
    win.confirm = () => true;
    var deleteButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Delete");
    deleteButtons[0].click();
    win.confirm = origConfirm;
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.knowledge_base_articles.length, 1, "one of the two articles must be gone");
    var remainingBlob = await win.PCC.blobStore.getBlob(articleId);
    assert.strictEqual(remainingBlob, null, "the deleted article's blob must be gone too, not orphaned");
  });

  await check("this gate's record counts are as expected after all edits above", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.knowledge_base_articles.length, 1);
    assert.strictEqual(data.projects.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "lessonsLearned", "knowledgeBase", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding Knowledge Base", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
