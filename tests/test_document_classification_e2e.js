// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 16 (Document
// Control 3: Classification + Nomenclature) — same convention every prior gate's e2e
// test uses. The real file-driven upload+extraction pipeline isn't jsdom-testable in
// this codebase (see Gate 10's own e2e test comment on Documents' activity_id check —
// "upload flow is file-driven, not form-submit"), so this file covers everything that
// doesn't require actually picking a file: the classification form fields render/wire
// correctly, a directly-seeded document's classification metadata displays correctly,
// the Project Code field, and the Settings nomenclature pattern editor. The actual
// nomenclature warning banner (which does require a real picked file) was verified via
// real-browser Playwright instead — see this gate's README write-up.
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
function findFieldByLabel(dom, labelText) {
  const labels = Array.from(dom.window.document.querySelectorAll(".field label"));
  const match = labels.find((l) => l.textContent.trim() === labelText);
  return match ? match.parentElement.querySelector("input, select, textarea") : null;
}
// The Settings page is React-controlled/uncontrolled-with-onChange. Setting `el.value = x`
// directly does NOT make React's onChange fire — React patches the native value-property
// setter (even for an uncontrolled input) to track "last known value," and a raw
// assignment updates that tracker too, so React sees no real change when the event fires
// next. Bypass React's patched setter via the native prototype descriptor first, then
// dispatch the event — see tests/test_document_types_e2e.js for the same pattern.
function setReactInputValue(win, el, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
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
    assert.ok(win.PCC.documentNomenclatureEngine, "documentNomenclatureEngine must be bundled");
  });

  let projectId, vendorId, rfiTypeId;
  await check("seed a project (with project_code), a vendor, and read a seeded document type", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "ABC Power Plant", project_code: "ABC", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;

      var vendor = win.PCC.store.newVendor({ vendor_name: "Acme Electrical" });
      data.vendors.push(vendor);
      vendorId = vendor.id;
    });
    var rfiType = win.PCC.store.get().document_types.find(function (t) { return t.name === "RFIs"; });
    assert.ok(rfiType, "seeded RFIs document type must exist from Gate 14");
    rfiTypeId = rfiType.id;
  });

  await check("Portfolio's Add Project form has a Project Code field, and it persists", async () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    // portfolio.js is a React-migrated page — flush before interacting and after every
    // click whose state update commits asynchronously (see CLAUDE.md's React
    // migration notes).
    await flush();
    findButtonByText(dom, "+ Add Project").click();
    await flush();
    var codeInput = findFieldByLabel(dom, "Project Code");
    assert.ok(codeInput, "Project Code field not found in the Add Project form");
    dom.window.document.querySelector("#field-name").value = "Second Project";
    codeInput.value = "SEC";
    findButtonByText(dom, "Add Project").click();
    await flush();
    var created = win.PCC.store.get().projects.find(function (p) { return p.name === "Second Project"; });
    assert.strictEqual(created.project_code, "SEC");
  });

  await check("the Documents upload form shows a Classification section with Document Type/Vendor selects populated", () => {
    win.PCC.router.go("documents");
    win.PCC.router.render();
    findButtonByText(dom, "+ Add Document").click();

    var docTypeSelect = findFieldByLabel(dom, "Document Type");
    assert.ok(docTypeSelect, "Document Type select not found");
    var docTypeOptionLabels = Array.from(docTypeSelect.options).map(function (o) { return o.textContent; });
    assert.ok(docTypeOptionLabels.some(function (t) { return t.indexOf("RFIs") !== -1; }), "Document Type select must list seeded types");

    var vendorSelect = findFieldByLabel(dom, "Vendor");
    assert.ok(vendorSelect, "Vendor select not found");
    var vendorOptionLabels = Array.from(vendorSelect.options).map(function (o) { return o.textContent; });
    assert.ok(vendorOptionLabels.indexOf("Acme Electrical") !== -1, "Vendor select must list seeded vendors");

    assert.ok(findFieldByLabel(dom, "Discipline"), "Discipline field not found");
    assert.ok(findFieldByLabel(dom, "Document Number"), "Document Number field not found");
    assert.ok(findFieldByLabel(dom, "Revision"), "Revision field not found");
    assert.ok(findFieldByLabel(dom, "Package"), "Package field not found");
    assert.ok(findFieldByLabel(dom, "Contract / PO"), "Contract / PO field not found");
    assert.ok(findFieldByLabel(dom, "Priority"), "Priority field not found");
    assert.ok(findFieldByLabel(dom, "Criticality"), "Criticality field not found");
    assert.ok(findFieldByLabel(dom, "Remarks"), "Remarks field not found");
  });

  await check("selecting a Document Type auto-suggests that type's default_criticality, still freely editable", () => {
    var docTypeSelect = findFieldByLabel(dom, "Document Type");
    docTypeSelect.value = rfiTypeId;
    docTypeSelect.dispatchEvent(new win.Event("change"));

    var criticalitySelect = findFieldByLabel(dom, "Criticality");
    var rfiType = win.PCC.store.get().document_types.find(function (t) { return t.id === rfiTypeId; });
    assert.strictEqual(criticalitySelect.value, rfiType.default_criticality);

    // Still freely overridable.
    criticalitySelect.value = "critical";
    criticalitySelect.dispatchEvent(new win.Event("change"));
    assert.strictEqual(criticalitySelect.value, "critical");
  });

  await check("the existing Category field (pre-Gate-16) is untouched — still the 5-value list", () => {
    var categorySelect = findFieldByLabel(dom, "Category");
    var labels = Array.from(categorySelect.options).map(function (o) { return o.textContent; });
    assert.deepStrictEqual(labels, ["Contract", "Drawing", "Photo", "Invoice", "Other"]);
  });

  var documentId;
  await check("a directly-seeded document (bypassing the file-driven upload flow) with classification fields displays correctly in the list", () => {
    win.PCC.store.update(function (data) {
      var doc = win.PCC.store.newDocument({
        project_id: projectId,
        filename: "ABC-ELE-RFI-001-REV02.pdf",
        document_type_id: rfiTypeId,
        discipline: "ELE",
        document_number: "001",
        revision: "02",
        vendor_id: vendorId,
        priority: "high",
        criticality: "critical",
        remarks: "Awaiting vendor response",
      });
      data.documents.push(doc);
      documentId = doc.id;
    });
    win.PCC.router.go("documents");
    win.PCC.router.render();
    var outletText = win.document.getElementById("page-outlet").textContent;
    // UI/UX Overhaul Gate 6: the single-line "Label: Value" meta text was split into a
    // compact list row (project/document number) plus a full-detail preview pane (a
    // .detail-grid of separate label/value elements, no colon between them) — this
    // single seeded document auto-selects into that preview pane.
    assert.ok(outletText.indexOf("TypeRFIs") !== -1, "preview pane must show the linked document type name");
    assert.ok(outletText.indexOf("ELE") !== -1, "preview pane must show discipline");
    assert.ok(outletText.indexOf("001 Rev 02") !== -1, "document row/preview must show document number + revision");
    assert.ok(outletText.indexOf("VendorAcme Electrical") !== -1, "preview pane must show the linked vendor name");
  });

  await check("'View Vendor' on the document row navigates to Vendors and opens that vendor's profile", () => {
    var viewVendorBtn = findButtonByText(dom, "View Vendor");
    assert.ok(viewVendorBtn, "View Vendor button not found");
    viewVendorBtn.click();
    win.PCC.router.render();
    assert.strictEqual(win.location.hash, "#/vendors");
    var outletText = win.document.getElementById("page-outlet").textContent;
    assert.ok(outletText.indexOf("Acme Electrical") !== -1, "should have navigated into Acme Electrical's own profile view");
  });

  await check("Settings has a Document Nomenclature panel with a pattern input and enable toggle, and edits persist", () => {
    win.PCC.router.go("settings");
    win.PCC.router.render();
    var patternInput = findFieldByLabel(dom, "Pattern");
    assert.ok(patternInput, "Pattern field not found in Settings");
    assert.strictEqual(patternInput.value, "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV");

    setReactInputValue(win, patternInput, "DOCUMENTTYPE_NUMBER_REV");
    assert.strictEqual(win.PCC.store.get().settings.document_nomenclature_pattern, "DOCUMENTTYPE_NUMBER_REV");

    var enabledCheckbox = win.document.querySelector('input[type="checkbox"]');
    assert.ok(enabledCheckbox.checked, "nomenclature checking should default to enabled");
    enabledCheckbox.click();
    assert.strictEqual(win.PCC.store.get().settings.document_nomenclature_enabled, false);
    // restore for any later checks in this file
    enabledCheckbox.click();
    assert.strictEqual(win.PCC.store.get().settings.document_nomenclature_enabled, true);
  });

  await check("the master document_types and vendors lists are unchanged by any classification-field save above", () => {
    var data = win.PCC.store.get();
    var rfiType = data.document_types.find(function (t) { return t.id === rfiTypeId; });
    assert.strictEqual(rfiType.name, "RFIs");
    assert.strictEqual(rfiType.code, "RFI");
    var vendor = data.vendors.find(function (v) { return v.id === vendorId; });
    assert.strictEqual(vendor.vendor_name, "Acme Electrical");
  });

  // ---- Route smoke test across every page ----
  var routes = ["dashboard", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "resources", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 16 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
