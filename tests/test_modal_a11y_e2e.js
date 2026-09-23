// End-to-end jsdom test for modal accessibility (src/js/modalA11y.js + the React-side
// react/src/utils/useModalA11y.ts wrapper), against the real bundled index.html.
//
// Before this gate, every .modal-overlay dialog closed on a backdrop click (and some on
// Escape), but none moved focus into itself, none kept Tab inside, none returned focus to
// the control that opened it, and none carried role="dialog"/aria-modal. Covers all three
// kinds of modal the app has: a vanilla one (keyboard-shortcuts help), a stacked pair
// (help + the file viewer on top), and a React one (Schedule's "Summarize Schedule (AI)",
// whose opener is a "⋯" dropdown item that unmounts as the modal opens — the fallback-
// focus case).
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

async function freshWindow() {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  dom.window.indexedDB = new FDBFactory();
  dom.window.__errors = [];
  dom.window.onerror = function (msg) {
    dom.window.__errors.push(msg);
  };
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  return dom.window;
}

// Keydown dispatched on whatever currently has focus — the same target a real key press
// has, so modalA11y's capture-phase listener and every bubbling listener both see it.
function press(win, key, opts) {
  const target = win.document.activeElement || win.document.body;
  const e = new win.KeyboardEvent("keydown", Object.assign({ key: key, bubbles: true, cancelable: true }, opts || {}));
  target.dispatchEvent(e);
  return e;
}

function focusablesIn(el) {
  return Array.from(el.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), select, textarea"));
}

(async () => {
  const win = await freshWindow();
  const doc = win.document;

  await check("app boots and exposes window.PCC.modalA11y", () => {
    assert.strictEqual(win.__errors.length, 0, "window.onerror: " + win.__errors.join(" | "));
    assert.strictEqual(typeof win.PCC.modalA11y.attach, "function");
    assert.strictEqual(win.PCC.modalA11y.isOpen(), false);
  });

  let opener;
  await check("opening the keyboard-shortcuts help marks it as a labelled modal dialog and moves focus inside it", () => {
    opener = Array.from(doc.querySelectorAll(".title-block__actions .icon-btn")).find((b) => b.title === "Keyboard shortcuts");
    assert.ok(opener, "title-block keyboard-shortcuts button not found");
    opener.focus();
    opener.click();
    const overlay = doc.getElementById("shortcuts-help-overlay");
    assert.ok(overlay, "help overlay did not open");
    const dialog = overlay.querySelector(".modal");
    assert.strictEqual(dialog.getAttribute("role"), "dialog");
    assert.strictEqual(dialog.getAttribute("aria-modal"), "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    assert.ok(labelledBy, "dialog has no aria-labelledby");
    assert.strictEqual(doc.getElementById(labelledBy).textContent, "Keyboard shortcuts");
    assert.ok(dialog.contains(doc.activeElement), "focus should move into the dialog on open, got " + doc.activeElement.outerHTML.slice(0, 80));
    assert.strictEqual(win.PCC.modalA11y.isOpen(), true);
  });

  await check("Tab from the last focusable wraps to the first, Shift+Tab from the first wraps to the last", () => {
    // Give the help dialog a second focusable so wrap direction is observable.
    const dialog = doc.querySelector("#shortcuts-help-overlay .modal");
    const extra = doc.createElement("button");
    extra.textContent = "extra";
    dialog.querySelector(".modal__body").appendChild(extra);
    const items = focusablesIn(dialog);
    assert.ok(items.length >= 2);
    items[items.length - 1].focus();
    const e1 = press(win, "Tab");
    assert.ok(e1.defaultPrevented, "Tab at the end of the dialog should be intercepted");
    assert.strictEqual(doc.activeElement, items[0], "Tab should wrap to the first focusable");
    const e2 = press(win, "Tab", { shiftKey: true });
    assert.ok(e2.defaultPrevented);
    assert.strictEqual(doc.activeElement, items[items.length - 1], "Shift+Tab should wrap to the last focusable");
  });

  await check("Tab while focus has escaped the dialog (e.g. body) pulls it back inside", () => {
    doc.activeElement.blur();
    assert.strictEqual(doc.activeElement, doc.body);
    press(win, "Tab");
    assert.ok(doc.querySelector("#shortcuts-help-overlay .modal").contains(doc.activeElement));
  });

  await check("single-key page shortcuts ('/', 'n') do nothing to the page behind an open dialog", () => {
    // Put focus on something non-typing inside the dialog, then press "n".
    doc.querySelector("#shortcuts-help-overlay .icon-btn").focus();
    const before = doc.getElementById("page-outlet").innerHTML;
    press(win, "n");
    assert.strictEqual(doc.getElementById("page-outlet").innerHTML, before);
  });

  await check("stacked: a file viewer opened over the help dialog closes first on Escape, then the help dialog, each returning focus to its own opener", async () => {
    const helpInner = doc.querySelector("#shortcuts-help-overlay .icon-btn");
    helpInner.focus();
    win.PCC.fileViewer.open({ blob: new win.Blob(["hello"], { type: "text/plain" }), filename: "notes.txt", mimeType: "text/plain" });
    await flush();
    const viewer = doc.getElementById("file-viewer-overlay");
    assert.ok(viewer, "file viewer did not open");
    assert.ok(viewer.contains(doc.activeElement), "focus should be inside the file viewer");

    const esc1 = press(win, "Escape");
    assert.ok(esc1.defaultPrevented);
    assert.ok(!doc.getElementById("file-viewer-overlay"), "first Escape should close the top (viewer) layer");
    assert.ok(doc.getElementById("shortcuts-help-overlay"), "first Escape must NOT also close the help dialog underneath");
    assert.strictEqual(doc.activeElement, helpInner, "focus should return to the element that opened the viewer");

    press(win, "Escape");
    assert.ok(!doc.getElementById("shortcuts-help-overlay"), "second Escape should close the help dialog");
    assert.strictEqual(doc.activeElement, opener, "focus should return to the title-block button that opened help");
    assert.strictEqual(win.PCC.modalA11y.isOpen(), false);
  });

  await check("closing via the backdrop also releases the dialog (no stale Escape/Tab handling left behind)", () => {
    opener.focus();
    opener.click();
    const overlay = doc.getElementById("shortcuts-help-overlay");
    overlay.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    assert.ok(!doc.getElementById("shortcuts-help-overlay"));
    assert.strictEqual(win.PCC.modalA11y.isOpen(), false);
    assert.strictEqual(doc.activeElement, opener);
    // A stray Escape now must not be swallowed by a leftover handler.
    const e = press(win, "Escape");
    assert.ok(!e.defaultPrevented);
  });

  // ---- React modal: Schedule's "Summarize Schedule (AI)" ----
  let projId;
  await check("React modal (Schedule AI summary): role/aria set, focus moved in, Escape closes it, focus returns to the ⋯ toggle", async () => {
    win.PCC_ELECTRON = {
      ollamaGenerate: () => Promise.resolve("Summary text."),
      ollamaListModels: () => Promise.resolve(["llama3"]),
    };
    win.PCC.store.update((d) => {
      const p = win.PCC.store.newProject({ name: "Modal Test Project" });
      d.projects.push(p);
      projId = p.id;
      d.schedules.push({ id: "sched-m-1", project_id: p.id, name: "Main", revision_number: 1, updated_at: new Date().toISOString(), near_critical_threshold_days: 5 });
      d.activities.push({ id: "act-m-1", schedule_id: "sched-m-1", project_id: p.id, activity_type: "task", name: "Pour", status: "not_started", total_float: 0, early_finish: "2026-10-01", percent_complete: 0 });
      d.settings.ollama_enabled = true;
      d.settings.ollama_model = "llama3";
    });
    win.PCC.projectContext.set(projId);
    win.PCC.router.go("schedule");
    await flush();

    const toggle = doc.querySelector('.icon-btn[aria-label="Schedule actions"]');
    assert.ok(toggle, "Schedule actions toggle not found");
    toggle.focus();
    toggle.click();
    await flush();
    const aiItem = Array.from(doc.querySelectorAll(".card-menu__item")).find((b) => b.textContent === "Summarize Schedule (AI)");
    assert.ok(aiItem, "AI menu item not found");
    aiItem.focus();
    aiItem.click();
    await flush();

    const dialog = doc.querySelector(".modal-overlay .modal");
    assert.ok(dialog, "summary modal did not render");
    assert.strictEqual(dialog.getAttribute("role"), "dialog");
    assert.strictEqual(dialog.getAttribute("aria-modal"), "true");
    assert.strictEqual(doc.getElementById(dialog.getAttribute("aria-labelledby")).textContent, "Schedule Summary (AI)");
    assert.ok(dialog.contains(doc.activeElement), "focus should be inside the React modal");
    assert.ok(!aiItem.isConnected, "precondition: the dropdown item that opened the modal has unmounted");

    press(win, "Escape");
    await flush();
    assert.ok(!doc.querySelector(".modal-overlay"), "Escape should close the React modal");
    assert.strictEqual(doc.activeElement, doc.querySelector('.icon-btn[aria-label="Schedule actions"]'), "focus should fall back to the ⋯ toggle, since the menu item that opened it is gone");
    assert.strictEqual(win.PCC.modalA11y.isOpen(), false);
  });

  await check("React modal's own ✕ button still closes it and releases modalA11y", async () => {
    const toggle = doc.querySelector('.icon-btn[aria-label="Schedule actions"]');
    toggle.click();
    await flush();
    Array.from(doc.querySelectorAll(".card-menu__item")).find((b) => b.textContent === "Summarize Schedule (AI)").click();
    await flush();
    doc.querySelector('.modal-overlay .icon-btn[aria-label="Close"]').click();
    await flush();
    assert.ok(!doc.querySelector(".modal-overlay"));
    assert.strictEqual(win.PCC.modalA11y.isOpen(), false);
  });

  await check("navigating away with a React modal open releases it (effect cleanup on unmount)", async () => {
    const toggle = doc.querySelector('.icon-btn[aria-label="Schedule actions"]');
    toggle.click();
    await flush();
    Array.from(doc.querySelectorAll(".card-menu__item")).find((b) => b.textContent === "Summarize Schedule (AI)").click();
    await flush();
    assert.strictEqual(win.PCC.modalA11y.isOpen(), true);
    win.PCC.router.go("dashboard");
    await flush();
    assert.strictEqual(win.PCC.modalA11y.isOpen(), false, "a modal unmounted by navigation must not keep trapping keys");
  });

  await check("no uncaught errors across the whole run", () => {
    assert.strictEqual(win.__errors.length, 0, "window.onerror: " + win.__errors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
