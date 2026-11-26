// Gate H.1 (2026-11-26): pdf.js 3.11.174 is covered by CVE-2024-4367 (a crafted font runs
// script through `new Function` when isEvalSupported is on, its default). pdf.js runs on the
// main thread here, so that script would reach window.PCC and window.PCC_ELECTRON. Both
// call sites must pass isEvalSupported: false: the in-app viewer (fileViewer.js) and the
// Documents upload extraction (documentsService.ts). Against the real bundled index.html.
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
  for (let i = 0; i < 12; i++) await sleep(0);
}
async function waitFor(conditionFn, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 5000);
  while (Date.now() < deadline) {
    if (conditionFn()) return;
    await sleep(10);
  }
  throw new Error("waitFor() timed out after " + timeoutMs + "ms");
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

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const thrownErrors = [];
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously", resources: "usable", pretendToBeVisual: true });
  dom.window.indexedDB = new FDBFactory();
  dom.window.CompressionStream = CompressionStream;
  dom.window.DecompressionStream = DecompressionStream;
  dom.window.Response = Response;
  dom.window.onerror = (msg) => thrownErrors.push(String(msg));
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  // The real pdfjsLib exports getDocument as a getter-only property, so swap the whole
  // object (as test_pdf_layout_aware_extraction_e2e.js does) and record every call's params.
  const calls = [];
  win.pdfjsLib = {
    getDocument(params) {
      calls.push(params);
      return {
        promise: Promise.resolve({
          numPages: 1,
          getPage: () =>
            Promise.resolve({
              getTextContent: () => Promise.resolve({ items: [{ str: "Hello", transform: [10, 0, 0, 10, 0, 700], width: 30 }] }),
              getViewport: () => ({ width: 10, height: 10 }),
              render: () => ({ promise: Promise.resolve() }),
            }),
        }),
      };
    },
  };

  await check("the file viewer opens a PDF with isEvalSupported === false", async () => {
    calls.length = 0;
    const blob = new win.Blob(["%PDF-1.4 viewer"], { type: "application/pdf" });
    win.PCC.fileViewer.open({ filename: "drawing.pdf", mimeType: "application/pdf", blob: blob });
    await waitFor(() => calls.length > 0, 3000);
    win.PCC.fileViewer.close();
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].data instanceof win.Uint8Array || calls[0].data instanceof Uint8Array, "the PDF bytes are still passed");
    assert.strictEqual(calls[0].isEvalSupported, false);
  });

  await check("the Documents upload extraction reads a PDF with isEvalSupported === false", async () => {
    calls.length = 0;
    win.PCC.store.update((data) => {
      data.projects.push({ id: "proj_h1", name: "H.1 Project", archived: false, status: "on_track", progress: 0, attachments: [] });
    });
    win.PCC.router.go("documents");
    await flush();
    const addBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === "+ Add Document");
    assert.ok(addBtn, "'+ Add Document' button not found");
    addBtn.click();
    await flush();
    const fileInput = outlet().querySelector('input[type="file"]');
    assert.ok(fileInput, "file input not found");
    const file = new win.File(["%PDF-1.4 upload"], "spec.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fileInput.dispatchEvent(new win.Event("change", { bubbles: true }));
    await waitFor(() => calls.length > 0, 3000);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].isEvalSupported, false);
    await waitFor(() => !!outlet().querySelector("div.mono"), 3000);
    assert.strictEqual(outlet().querySelector("div.mono").textContent, "Hello", "extraction still produces text");
  });

  await check("no uncaught errors", () => {
    assert.strictEqual(thrownErrors.length, 0, thrownErrors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
