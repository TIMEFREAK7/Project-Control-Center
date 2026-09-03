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

// This page is React-controlled (unlike the old vanilla uncontrolled DOM form this test was
// originally written against). Setting `el.value = x` directly does NOT make React's onChange
// fire — React patches the native value-property setter to track "last known value," and a
// raw assignment updates that tracker too, so the framework sees no real change when the
// event fires next. The fix real user typing already gets for free: bypass React's patched
// setter via the native prototype descriptor, THEN dispatch the event, so React's tracker
// sees a genuine mismatch and its onChange handler actually runs. Needed for every
// React-controlled form field this suite drives programmatically from here on.
function setReactInputValue(win, el, value) {
  const proto = el.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
}
function setReactSelectValue(win, el, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set;
  nativeSetter.call(el, value);
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

  // This page is React-controlled. Unlike a vanilla page's synchronous raw-DOM writes, a
  // React 18 state update triggered from an event handler (a button click, a checkbox
  // toggle, typing) commits asynchronously — confirmed real behavior in real Chromium too,
  // not a jsdom quirk (only the very first render after navigation is forced synchronous,
  // via reactBridge.js's flushSync wrapper). Every interaction below that expects the DOM
  // to reflect a state change needs an `await flush()` first.
  let newTypeId;
  await check("Add Document Type creates a new type through the real form", async () => {
    findButtonByText(dom, "+ Add Document Type").click();
    await flush();
    const nameInput = win.document.querySelector("#dtfield-name");
    const codeInput = win.document.querySelector("#dtfield-code");
    const categoryInput = win.document.querySelector("#dtfield-category");
    const critSelect = win.document.querySelector("#dtfield-criticality");
    setReactInputValue(win, nameInput, "Cable Schedule");
    setReactInputValue(win, codeInput, "CS");
    setReactInputValue(win, categoryInput, "Engineering");
    setReactSelectValue(win, critSelect, "major");
    findButtonByText(dom, "Add Document Type").click();
    await flush();

    const data = win.PCC.store.get();
    const created = data.document_types.find((t) => t.name === "Cable Schedule");
    assert.ok(created, "new document type must be saved to the store");
    assert.strictEqual(created.code, "CS");
    assert.strictEqual(created.category, "Engineering");
    assert.strictEqual(created.default_criticality, "major");
    assert.strictEqual(created.active, true);
    newTypeId = created.id;
  });

  await check("Edit updates an existing type in place (no duplicate created)", async () => {
    const before = win.PCC.store.get().document_types.length;
    // Find the Edit button belonging to the "Cable Schedule" card specifically.
    const cards = Array.from(win.document.querySelectorAll(".detail-card"));
    const targetCard = cards.find((c) => c.textContent.indexOf("Cable Schedule") !== -1);
    assert.ok(targetCard, "Cable Schedule card must be present");
    const editBtn = Array.from(targetCard.querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit");
    editBtn.click();
    await flush();

    const nameInput = win.document.querySelector("#dtfield-name");
    assert.strictEqual(nameInput.value, "Cable Schedule");
    setReactInputValue(win, nameInput, "Cable Schedule (Rev)");
    findButtonByText(dom, "Save Changes").click();
    await flush();

    const data = win.PCC.store.get();
    assert.strictEqual(data.document_types.length, before, "editing must not create a new record");
    const updated = data.document_types.find((t) => t.id === newTypeId);
    assert.strictEqual(updated.name, "Cable Schedule (Rev)");
  });

  await check("Deactivate hides a type from the default (active-only) view, Show Inactive reveals it", async () => {
    const cards = () => Array.from(win.document.querySelectorAll(".detail-card"));
    const targetCard = cards().find((c) => c.textContent.indexOf("Cable Schedule (Rev)") !== -1);
    const deactivateBtn = Array.from(targetCard.querySelectorAll("button")).find((b) => b.textContent.trim() === "Deactivate");
    deactivateBtn.click();
    await flush();

    const data = win.PCC.store.get();
    const type = data.document_types.find((t) => t.id === newTypeId);
    assert.strictEqual(type.active, false);

    // Default view (Show Inactive unchecked) must no longer list it.
    assert.ok(!cards().some((c) => c.textContent.indexOf("Cable Schedule (Rev)") !== -1), "deactivated type should be hidden by default");

    // Checking "Show Inactive" reveals it again, marked INACTIVE. `.click()`, not manually
    // setting `.checked` + dispatching a synthetic event — a real user always toggles a
    // checkbox via a real click, which fires the browser's own native toggle+event sequence
    // React listens to; manually driving `.checked` bypassed that and silently failed to
    // reach React's onChange in this exact case (confirmed by direct comparison).
    const showInactiveCheckbox = win.document.querySelector('input[type="checkbox"]');
    showInactiveCheckbox.click();
    await flush();
    const revealedCard = cards().find((c) => c.textContent.indexOf("Cable Schedule (Rev)") !== -1);
    assert.ok(revealedCard, "Show Inactive must reveal the deactivated type");
    assert.ok(revealedCard.textContent.indexOf("INACTIVE") !== -1);
  });

  await check("Reactivate flips it back to active", async () => {
    const cards = () => Array.from(win.document.querySelectorAll(".detail-card"));
    const targetCard = cards().find((c) => c.textContent.indexOf("Cable Schedule (Rev)") !== -1);
    const reactivateBtn = Array.from(targetCard.querySelectorAll("button")).find((b) => b.textContent.trim() === "Reactivate");
    reactivateBtn.click();
    await flush();
    const data = win.PCC.store.get();
    assert.strictEqual(data.document_types.find((t) => t.id === newTypeId).active, true);
  });

  await check("Search filters the list by name/code", async () => {
    win.PCC.router.go("documentTypes");
    win.PCC.router.render();
    const search = win.document.querySelector('input[type="text"]');
    setReactInputValue(win, search, "BOQ");
    await flush();
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

  await check("Delete removes a document type from the store", async () => {
    // A fresh navigation remounts this React page from scratch, so its local UI state
    // (search term, Show Inactive) resets to defaults every time — unlike the old vanilla
    // page's persistent module-level uiState, which used to carry "BOQ" and "checked" over
    // from earlier checks. Real, accepted behavior difference for a React-migrated page
    // (see reactBridge.js: every mount() call creates a brand new root/component instance).
    win.PCC.router.go("documentTypes");
    win.PCC.router.render();
    const search = win.document.querySelector('input[type="text"]');
    setReactInputValue(win, search, "");
    await flush();
    const showInactiveCheckbox = win.document.querySelector('input[type="checkbox"]');
    showInactiveCheckbox.click();
    await flush();

    const before = win.PCC.store.get().document_types.length;
    const cards = Array.from(win.document.querySelectorAll(".detail-card"));
    const targetCard = cards.find((c) => c.textContent.indexOf("Retired Type") !== -1);
    assert.ok(targetCard, "Retired Type card must be present after checking Show Inactive on this fresh mount");
    const originalConfirm = win.confirm;
    win.confirm = () => true;
    const deleteBtn = Array.from(targetCard.querySelectorAll("button")).find((b) => b.textContent.trim() === "Delete");
    deleteBtn.click();
    await flush();
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
