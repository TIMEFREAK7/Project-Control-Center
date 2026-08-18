// End-to-end jsdom test against the ACTUAL bundled index.html for Gate 14 (Document
// Control 1: Master Document Repository) — same convention every prior gate's e2e test
// uses. Covers the seeded repository, add/edit/deactivate/reactivate/delete through the
// real form and list, search/category/active filters, and a full route smoke test.
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
    assert.ok(win.PCC.documentTypes, "documentTypes public API must be bundled");
  });

  await check("navigating to Document Types shows the seeded repository", () => {
    win.PCC.router.go("documentTypes");
    win.PCC.router.render();
    const outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("BOQ") !== -1, "seed list must include BOQ");
    assert.ok(outlet.textContent.indexOf("Method Statements") !== -1, "seed list must include Method Statements");
    assert.ok(outlet.textContent.indexOf("As-Built Drawings") !== -1, "seed list must include As-Built Drawings");
    const data = win.PCC.store.get();
    assert.ok(data.document_types.length >= 28, "seed list should have at least the ~28 documented starting types");
  });

  let newTypeId;
  await check("Add Document Type creates a new type through the real form", () => {
    findButtonByText(dom, "+ Add Document Type").click();
    const nameInput = win.document.querySelector("#dtfield-name");
    const codeInput = win.document.querySelector("#dtfield-code");
    const categoryInput = win.document.querySelector("#dtfield-category");
    const critSelect = win.document.querySelector("#dtfield-criticality");
    nameInput.value = "Cable Schedule";
    codeInput.value = "CS";
    categoryInput.value = "Engineering";
    critSelect.value = "major";
    findButtonByText(dom, "Add Document Type").click();

    const data = win.PCC.store.get();
    const created = data.document_types.find((t) => t.name === "Cable Schedule");
    assert.ok(created, "new document type must be saved to the store");
    assert.strictEqual(created.code, "CS");
    assert.strictEqual(created.category, "Engineering");
    assert.strictEqual(created.default_criticality, "major");
    assert.strictEqual(created.active, true);
    newTypeId = created.id;
  });

  await check("Edit updates an existing type in place (no duplicate created)", () => {
    const before = win.PCC.store.get().document_types.length;
    const editBtns = findAllButtonsByText(dom, "Edit");
    // Find the Edit button belonging to the "Cable Schedule" card specifically.
    const cards = Array.from(win.document.querySelectorAll(".detail-card"));
    const targetCard = cards.find((c) => c.textContent.indexOf("Cable Schedule") !== -1);
    assert.ok(targetCard, "Cable Schedule card must be present");
    const editBtn = Array.from(targetCard.querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit");
    editBtn.click();

    const nameInput = win.document.querySelector("#dtfield-name");
    assert.strictEqual(nameInput.value, "Cable Schedule");
    nameInput.value = "Cable Schedule (Rev)";
    findButtonByText(dom, "Save Changes").click();

    const data = win.PCC.store.get();
    assert.strictEqual(data.document_types.length, before, "editing must not create a new record");
    const updated = data.document_types.find((t) => t.id === newTypeId);
    assert.strictEqual(updated.name, "Cable Schedule (Rev)");
  });

  await check("Deactivate hides a type from the default (active-only) view, Show Inactive reveals it", () => {
    const cards = () => Array.from(win.document.querySelectorAll(".detail-card"));
    const targetCard = cards().find((c) => c.textContent.indexOf("Cable Schedule (Rev)") !== -1);
    const deactivateBtn = Array.from(targetCard.querySelectorAll("button")).find((b) => b.textContent.trim() === "Deactivate");
    deactivateBtn.click();

    const data = win.PCC.store.get();
    const type = data.document_types.find((t) => t.id === newTypeId);
    assert.strictEqual(type.active, false);

    // Default view (Show Inactive unchecked) must no longer list it.
    assert.ok(!cards().some((c) => c.textContent.indexOf("Cable Schedule (Rev)") !== -1), "deactivated type should be hidden by default");

    // Checking "Show Inactive" reveals it again, marked INACTIVE.
    const showInactiveCheckbox = win.document.querySelector('input[type="checkbox"]');
    showInactiveCheckbox.checked = true;
    showInactiveCheckbox.dispatchEvent(new win.Event("change"));
    const revealedCard = cards().find((c) => c.textContent.indexOf("Cable Schedule (Rev)") !== -1);
    assert.ok(revealedCard, "Show Inactive must reveal the deactivated type");
    assert.ok(revealedCard.textContent.indexOf("INACTIVE") !== -1);
  });

  await check("Reactivate flips it back to active", () => {
    const cards = () => Array.from(win.document.querySelectorAll(".detail-card"));
    const targetCard = cards().find((c) => c.textContent.indexOf("Cable Schedule (Rev)") !== -1);
    const reactivateBtn = Array.from(targetCard.querySelectorAll("button")).find((b) => b.textContent.trim() === "Reactivate");
    reactivateBtn.click();
    const data = win.PCC.store.get();
    assert.strictEqual(data.document_types.find((t) => t.id === newTypeId).active, true);
  });

  await check("Search filters the list by name/code", () => {
    win.PCC.router.go("documentTypes");
    win.PCC.router.render();
    const search = win.document.querySelector('input[type="text"]');
    search.value = "BOQ";
    search.dispatchEvent(new win.Event("input"));
    const outlet = win.document.getElementById("page-outlet");
    assert.ok(outlet.textContent.indexOf("BOQ") !== -1);
    assert.ok(outlet.textContent.indexOf("Method Statements") === -1, "search should narrow the list, not just highlight");
  });

  await check("window.PCC.documentTypes.activeTypes() excludes deactivated types", () => {
    win.PCC.store.update(function (data) {
      data.document_types.push(win.PCC.store.newDocumentType({ name: "Retired Type", active: false }));
    });
    const active = win.PCC.documentTypes.activeTypes();
    assert.ok(!active.some((t) => t.name === "Retired Type"), "activeTypes() must exclude inactive types");
    assert.ok(active.some((t) => t.name === "BOQ"), "activeTypes() must still include active seeded types");
  });

  await check("Delete removes a document type from the store", () => {
    win.PCC.router.go("documentTypes");
    win.PCC.router.render();
    // The "Search filters" check above left uiState.search set to "BOQ" — clear it so
    // "Retired Type" (added after that check) isn't hidden by a stale search term.
    const search = win.document.querySelector('input[type="text"]');
    search.value = "";
    search.dispatchEvent(new win.Event("input"));

    const before = win.PCC.store.get().document_types.length;
    const cards = Array.from(win.document.querySelectorAll(".detail-card"));
    const targetCard = cards.find((c) => c.textContent.indexOf("Retired Type") !== -1);
    assert.ok(targetCard, "Retired Type card must be present (Show Inactive is still checked from an earlier check)");
    const originalConfirm = win.confirm;
    win.confirm = () => true;
    const deleteBtn = Array.from(targetCard.querySelectorAll("button")).find((b) => b.textContent.trim() === "Delete");
    deleteBtn.click();
    win.confirm = originalConfirm;

    const data = win.PCC.store.get();
    assert.strictEqual(data.document_types.length, before - 1);
    assert.ok(!data.document_types.some((t) => t.name === "Retired Type"));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page ----
  var routes = ["dashboard", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "resources", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 14 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
