// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 15 (Document
// Control 2: Project-Specific Document Requirements) — same convention every prior
// gate's e2e test uses. Covers the Portfolio "DOCUMENT REQUIREMENTS" section: manual
// toggle on/off, "Apply Template" (add-only, no duplicates, only matches active types),
// deactivating a type hides it from the checklist without touching a project's existing
// selection, and confirms the master document_types repository is never modified by
// anything this section does.
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
function findLabelContaining(dom, text) {
  const labels = Array.from(dom.window.document.querySelectorAll("label"));
  return labels.find((l) => l.textContent.indexOf(text) !== -1);
}
function requirementCount(dom) {
  const body = dom.window.document.body.textContent;
  const m = body.match(/DOCUMENT REQUIREMENTS \((\d+) of (\d+)\)/);
  return m ? { selected: Number(m[1]), total: Number(m[2]) } : null;
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
    assert.ok(win.PCC.store.PROJECT_TEMPLATES, "PROJECT_TEMPLATES must be bundled");
  });

  var seededTypeCount;
  let projectId;
  await check("seed a project and read the master document_types repository", () => {
    seededTypeCount = win.PCC.store.get().document_types.length;
    assert.ok(seededTypeCount > 0, "the master repository must already be seeded from Gate 14");

    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Requirements Test Project", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;
    });
  });

  await check("the Portfolio Details panel shows a DOCUMENT REQUIREMENTS section with the master count", () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    findButtonByText(dom, "Details").click();
    win.PCC.router.render();

    var count = requirementCount(dom);
    assert.ok(count, "DOCUMENT REQUIREMENTS header not found");
    assert.strictEqual(count.selected, 0, "a new project starts with zero requirements selected");
    assert.strictEqual(count.total, seededTypeCount);

    // Checklist itself is collapsed until "Manage" is clicked.
    assert.ok(!findLabelContaining(dom, "BOQ"), "checklist should be collapsed by default");
  });

  await check("Manage expands the checklist, grouped, with every active type as an unchecked checkbox", () => {
    findButtonByText(dom, "Manage").click();
    var boqLabel = findLabelContaining(dom, "BOQ");
    assert.ok(boqLabel, "BOQ row must appear once the checklist is expanded");
    var checkbox = boqLabel.querySelector('input[type="checkbox"]');
    assert.ok(checkbox && !checkbox.checked, "BOQ must start unchecked for a new project");
  });

  await check("checking a box adds exactly one project_document_requirements row", () => {
    var boqLabel = findLabelContaining(dom, "BOQ");
    var checkbox = boqLabel.querySelector('input[type="checkbox"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new win.Event("change"));

    var data = win.PCC.store.get();
    var boqType = data.document_types.find((t) => t.name === "BOQ");
    var rows = data.project_document_requirements.filter((r) => r.project_id === projectId && r.document_type_id === boqType.id);
    assert.strictEqual(rows.length, 1);

    var count = requirementCount(dom);
    assert.strictEqual(count.selected, 1);
  });

  await check("unchecking the same box removes the row (not just hides it)", () => {
    var boqLabel = findLabelContaining(dom, "BOQ");
    var checkbox = boqLabel.querySelector('input[type="checkbox"]');
    assert.ok(checkbox.checked, "BOQ should still be checked from the prior step");
    checkbox.checked = false;
    checkbox.dispatchEvent(new win.Event("change"));

    var data = win.PCC.store.get();
    var boqType = data.document_types.find((t) => t.name === "BOQ");
    var rows = data.project_document_requirements.filter((r) => r.project_id === projectId && r.document_type_id === boqType.id);
    assert.strictEqual(rows.length, 0);
    assert.strictEqual(requirementCount(dom).selected, 0);
  });

  await check("Apply Template (EPC) adds requirements only for matching active types, none removed", () => {
    var selects = Array.from(win.document.querySelectorAll("select"));
    var templateSelect = selects.find((s) => Array.from(s.options).some((o) => o.textContent === "EPC"));
    assert.ok(templateSelect, "template select not found");
    templateSelect.value = "epc";
    templateSelect.dispatchEvent(new win.Event("change"));

    findButtonByText(dom, "Apply").click();

    var data = win.PCC.store.get();
    var epcTemplate = win.PCC.store.PROJECT_TEMPLATES.find((t) => t.key === "epc");
    var rows = data.project_document_requirements.filter((r) => r.project_id === projectId);
    assert.strictEqual(rows.length, epcTemplate.suggested_type_names.length, "row count should match the EPC template's suggested name count (all match seeded types)");

    var count = requirementCount(dom);
    assert.strictEqual(count.selected, epcTemplate.suggested_type_names.length);
  });

  await check("applying the same template again adds nothing new (no duplicate rows)", () => {
    var before = win.PCC.store.get().project_document_requirements.filter((r) => r.project_id === projectId).length;
    findButtonByText(dom, "Apply").click();
    var after = win.PCC.store.get().project_document_requirements.filter((r) => r.project_id === projectId).length;
    assert.strictEqual(after, before, "re-applying the same template must not create duplicate requirement rows");
  });

  await check("the master document_types repository is untouched by any of the above (same length, same ids)", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.document_types.length, seededTypeCount, "no document types should be added or removed by requirement selection");
    var boq = data.document_types.find((t) => t.name === "BOQ");
    assert.strictEqual(boq.active, true, "BOQ's own record must be untouched");
  });

  await check("deactivating a document type hides it from the checklist without touching this project's other selections", () => {
    var data = win.PCC.store.get();
    var boqType = data.document_types.find((t) => t.name === "BOQ");
    var selectedCountBefore = data.project_document_requirements.filter((r) => r.project_id === projectId).length;

    win.PCC.store.update(function (d) {
      var t = d.document_types.find((x) => x.id === boqType.id);
      t.active = false;
    });
    win.PCC.router.render();

    assert.ok(!findLabelContaining(dom, "BOQ"), "a deactivated type must disappear from the active-types checklist");

    var count = requirementCount(dom);
    assert.strictEqual(count.total, seededTypeCount - 1, "total shown must reflect only ACTIVE types");
    // The requirement row for BOQ still exists in the store even though it's no longer
    // shown (deactivating a type doesn't retroactively un-require it from a project that
    // already selected it) — this section only hides it from the active-types checklist.
    var stillThere = win.PCC.store.get().project_document_requirements.some((r) => r.project_id === projectId && r.document_type_id === boqType.id);
    assert.ok(stillThere, "an existing requirement for a since-deactivated type should not be silently deleted");
    assert.strictEqual(win.PCC.store.get().project_document_requirements.filter((r) => r.project_id === projectId).length, selectedCountBefore);
  });

  // ---- Route smoke test across every page ----
  var routes = ["dashboard", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "resources", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 15 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
