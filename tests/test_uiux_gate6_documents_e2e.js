// End-to-end jsdom test against the ACTUAL bundled index.html for UI/UX Overhaul Gate 6
// (Documents — first module of "Existing Modules, one at a time"). Inspection found
// Documents was the only register in the app with NO filter toolbar at all — render()
// showed every document across every project in one flat list, and had no
// filterByProject() hook (a known gap since Gate 4's Workspace build). Confirmed with
// Aditya via AskUserQuestion (two questions) before building: add a filter toolbar +
// the Workspace hook (baseline), AND include the brief's own "Document Experience"
// two-panel register+preview layout in this same gate rather than deferring it.
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

function findButtonByText(dom, text, root) {
  const scope = root || dom.window.document;
  return Array.from(scope.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
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
  const outlet = () => win.document.getElementById("page-outlet");

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.files && win.PCC.files.filterByProject, "documents.js's filterByProject() must be bundled");
  });

  var projA, projB;
  await check("seed two projects with documents spanning categories/statuses", () => {
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newProject({ name: "Riverside Tower", status: "at_risk" });
      d.projects.push(a);
      projA = a.id;
      var b = win.PCC.store.newProject({ name: "Harbor Bridge", status: "on_track" });
      d.projects.push(b);
      projB = b.id;

      d.documents.push(
        win.PCC.store.newDocument({ project_id: projA, filename: "site-plan.pdf", category: "drawing", status: "approved", document_number: "DR-001" }),
        win.PCC.store.newDocument({ project_id: projA, filename: "contract.pdf", category: "contract", status: "under_review" }),
        win.PCC.store.newDocument({ project_id: projB, filename: "invoice-04.pdf", category: "invoice", status: "draft" })
      );
    });
    win.PCC.router.go("documents");
    win.PCC.router.render();
    assert.ok(projA && projB);
  });

  await check("the filter toolbar exists with search, category, status, and project selects", () => {
    var toolbar = outlet().querySelector(".toolbar");
    assert.ok(toolbar, "filter toolbar not found");
    assert.ok(toolbar.querySelector("input[type=text]"), "search input not found");
    var selects = toolbar.querySelectorAll("select");
    assert.strictEqual(selects.length, 3, "expected category/status/project selects");
  });

  await check("all three documents show in the register list with no filter applied", () => {
    var items = outlet().querySelectorAll(".doc-register-item");
    assert.strictEqual(items.length, 3);
  });

  await check("the two-panel layout auto-selects a document into the preview pane", () => {
    var preview = outlet().querySelector(".doc-register-preview");
    assert.ok(preview, "preview pane not found");
    assert.ok(outlet().querySelector(".doc-register-item--selected"), "one list item must be marked selected");
  });

  await check("filtering by project narrows the register list to just that project's documents", () => {
    var projectSelect = Array.from(outlet().querySelectorAll(".toolbar select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Harbor Bridge")
    );
    assert.ok(projectSelect, "project filter select not found");
    projectSelect.value = projB;
    projectSelect.dispatchEvent(new win.Event("change"));
    var items = outlet().querySelectorAll(".doc-register-item");
    assert.strictEqual(items.length, 1);
    assert.ok(outlet().textContent.indexOf("invoice-04.pdf") !== -1);
    assert.ok(outlet().textContent.indexOf("site-plan.pdf") === -1);
  });

  await check("filtering by category and clearing back to all projects both work correctly", () => {
    var projectSelect = Array.from(outlet().querySelectorAll(".toolbar select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Harbor Bridge")
    );
    projectSelect.value = "";
    projectSelect.dispatchEvent(new win.Event("change"));

    var categorySelect = Array.from(outlet().querySelectorAll(".toolbar select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Drawing")
    );
    categorySelect.value = "drawing";
    categorySelect.dispatchEvent(new win.Event("change"));
    var items = outlet().querySelectorAll(".doc-register-item");
    assert.strictEqual(items.length, 1);
    assert.ok(outlet().textContent.indexOf("site-plan.pdf") !== -1);
    categorySelect.value = "";
    categorySelect.dispatchEvent(new win.Event("change"));
  });

  await check("search narrows by filename", () => {
    var searchInput = outlet().querySelector(".toolbar input[type=text]");
    searchInput.value = "invoice";
    searchInput.dispatchEvent(new win.Event("input"));
    var items = outlet().querySelectorAll(".doc-register-item");
    assert.strictEqual(items.length, 1);
    assert.ok(outlet().textContent.indexOf("invoice-04.pdf") !== -1);
    searchInput.value = "";
    searchInput.dispatchEvent(new win.Event("input"));
  });

  await check("a search/filter with zero matches shows the correct empty state, not a crash", () => {
    var searchInput = outlet().querySelector(".toolbar input[type=text]");
    searchInput.value = "nonexistent-file-xyz";
    searchInput.dispatchEvent(new win.Event("input"));
    assert.ok(outlet().textContent.indexOf("No documents match this search/filter.") !== -1);
    searchInput.value = "";
    searchInput.dispatchEvent(new win.Event("input"));
  });

  await check("clicking a different list item selects it into the preview pane", () => {
    var items = Array.from(outlet().querySelectorAll(".doc-register-item"));
    var contractItem = items.find((i) => i.textContent.indexOf("contract.pdf") !== -1);
    assert.ok(contractItem);
    contractItem.click();
    // rerender() rebuilds the whole outlet, so the old node reference above is now
    // detached — re-query the freshly-rendered DOM rather than checking the stale one.
    var refreshedItems = Array.from(outlet().querySelectorAll(".doc-register-item"));
    var refreshedContractItem = refreshedItems.find((i) => i.textContent.indexOf("contract.pdf") !== -1);
    assert.ok(refreshedContractItem.classList.contains("doc-register-item--selected"));
    var preview = outlet().querySelector(".doc-register-preview");
    assert.ok(preview.textContent.indexOf("contract.pdf") !== -1);
    assert.ok(preview.textContent.indexOf("Open File") !== -1);
    assert.ok(preview.textContent.indexOf("Delete") !== -1);
  });

  await check("clicking '+ Add Document' while a project filter is active pre-fills the upload form to that project", () => {
    var projectSelect = Array.from(outlet().querySelectorAll(".toolbar select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Harbor Bridge")
    );
    projectSelect.value = projB;
    projectSelect.dispatchEvent(new win.Event("change"));
    findButtonByText(dom, "+ Add Document").click();
    var formPanel = Array.from(outlet().querySelectorAll(".panel")).find((p) => p.textContent.indexOf("Add Document") !== -1 && p.querySelector("select"));
    assert.ok(formPanel, "upload form panel not found");
    var formProjectSelect = formPanel.querySelector("select");
    assert.ok(formProjectSelect, "upload form project select not found");
    assert.strictEqual(formProjectSelect.value, projB, "upload form must default to the currently filtered project");
    findButtonByText(dom, "Cancel").click();
    projectSelect = Array.from(outlet().querySelectorAll(".toolbar select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Harbor Bridge")
    );
    projectSelect.value = "";
    projectSelect.dispatchEvent(new win.Event("change"));
  });

  await check("the register/preview still renders below an open upload form (form doesn't hide the existing list)", () => {
    findButtonByText(dom, "+ Add Document").click();
    assert.ok(outlet().textContent.indexOf("Add Document") !== -1 && outlet().querySelector("select"), "upload form not open");
    assert.ok(outlet().querySelector(".doc-register"), "existing register must still render below the open form");
    findButtonByText(dom, "Cancel").click();
  });

  await check("Workspace's Documents tab now lands pre-filtered to the right project (the Gate 4 gap is closed)", async () => {
    win.PCC.projectWorkspace.viewProject(projB);
    win.PCC.router.go("projectWorkspace");
    win.PCC.router.render();
    var nav = Array.from(outlet().querySelectorAll(".toolbar")).find((t) => t.textContent.indexOf("Executive Center") !== -1);
    assert.ok(nav, "workspace nav not found");
    findButtonByText(dom, "Documents", nav).click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "documents");
    var items = outlet().querySelectorAll(".doc-register-item");
    assert.strictEqual(items.length, 1, "Documents tab must land pre-filtered to Harbor Bridge only");
    assert.ok(outlet().textContent.indexOf("invoice-04.pdf") !== -1);
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 2);
    assert.strictEqual(data.documents.length, 3);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "projectWorkspace",
    "executiveCenter", "vendors", "vendorPerformanceCentre", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "delayRecoveryDashboard", "risks",
    "meetings", "rfis", "changeOrders", "decisionRegister", "lessonsLearned", "knowledgeBase",
    "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Documents redesign", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
