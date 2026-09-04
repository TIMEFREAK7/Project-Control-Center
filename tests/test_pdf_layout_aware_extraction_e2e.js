// Post-Phase-5 Engineering Evolution — layout-aware PDF text extraction (scoped and
// confirmed after inspection found OCR explicitly excluded by the original Tier 2 spec;
// this is a pure text-reconstruction improvement to the already-real pdf.js integration,
// not OCR). End-to-end jsdom test against the actual bundled index.html, driving the real
// Documents "+ Add Document" upload form. window.pdfjsLib.getDocument is stubbed to return
// controlled TextItem data (str/hasEOL/transform/width) — the same shape pdf.js's own
// getTextContent() returns — so the reconstruction logic in
// react/src/services/documentsService.ts's extractPdf()/reconstructPdfPageText() runs for
// real; only the third-party library's own parsing is faked, same "stub the vendored
// library's output shape, keep our own code real" pattern already used for FileReader in
// other upload tests.
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
async function waitFor(conditionFn, timeoutMs) {
  timeoutMs = timeoutMs || 3000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (conditionFn()) return;
    await sleep(20);
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

function findButtonByText(win, text) {
  const buttons = Array.from(win.document.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}

// One page, five text items, engineered to exercise every branch of
// reconstructPdfPageText(): a large horizontal gap on the same line (-> extra spacing),
// a moderate gap on the same line (-> a single space), an explicit hasEOL-driven line
// break, and a line break pdf.js did NOT flag with hasEOL but that a vertical position
// jump reveals.
const FAKE_PDF_ITEMS = [
  // Line 1: "TITLE" then a big horizontal gap then "PAGE", hasEOL on the last item.
  { str: "TITLE", transform: [10, 0, 0, 10, 0, 700], width: 30 },
  { str: "PAGE", transform: [10, 0, 0, 10, 400, 700], width: 24, hasEOL: true },
  // Line 2: "Second" then a moderate horizontal gap then "line" — no hasEOL on the last
  // item, but the next item's y-jump (698 -> 660) is what ends this line.
  { str: "Second", transform: [10, 0, 0, 10, 0, 698], width: 36 },
  { str: "line", transform: [10, 0, 0, 10, 50, 698], width: 24 },
  // Line 3: a lone item, well below line 2's y — proves the y-jump fallback fired even
  // though nothing upstream set hasEOL.
  { str: "ThirdLine", transform: [10, 0, 0, 10, 0, 660], width: 54 },
];

const EXPECTED_TEXT = "TITLE    PAGE\nSecond line\nThirdLine";

function installFakePdfjs(win) {
  // pdf.js's own module object exports getDocument as a non-configurable getter-only
  // property (webpack/ESM interop) — it can't be overridden in place. Replace the whole
  // window.pdfjsLib reference instead (that top-level property is a plain assignment,
  // not a getter); nothing in this test's code path needs any other pdfjsLib member.
  win.pdfjsLib = {
    getDocument: function () {
      return {
        promise: Promise.resolve({
          numPages: 1,
          getPage: function () {
            return Promise.resolve({
              getTextContent: function () {
                return Promise.resolve({ items: FAKE_PDF_ITEMS });
              },
            });
          },
        }),
      };
    },
  };
}

function uploadPdfFile(win, fileInput, filename) {
  const file = new win.File(["%PDF-1.4 fake content for hashing"], filename, { type: "application/pdf" });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fileInput.dispatchEvent(new win.Event("change", { bubbles: true }));
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
    thrownErrors.push(msg);
  };

  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  await check("seed a project, open Add Document, and upload a PDF whose fake text items exercise every reconstruction branch", async () => {
    win.PCC.store.update(function (data) {
      data.projects.push({ id: "proj_pdf_extract_e2e", name: "PDF Extraction E2E Project", archived: false, status: "on_track", progress: 0, attachments: [] });
    });
    win.PCC.router.go("documents");
    await flush();

    installFakePdfjs(win);

    var addBtn = findButtonByText(win, "+ Add Document");
    assert.ok(addBtn, "'+ Add Document' button not found");
    addBtn.click();
    await flush();

    var fileInput = outlet().querySelector('input[type="file"]');
    assert.ok(fileInput, "file input not found on the Add Document form");
    uploadPdfFile(win, fileInput, "layout-test.pdf");

    await waitFor(() => !!outlet().querySelector("div.mono"), 3000);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the extraction preview shows real line breaks and gap-aware spacing, not one run-on string", async () => {
    var previewDiv = outlet().querySelector("div.mono");
    assert.ok(previewDiv, "extraction preview (div.mono) not found");
    assert.strictEqual(previewDiv.textContent, EXPECTED_TEXT, "reconstructed PDF text did not match — got: " + JSON.stringify(previewDiv.textContent));
  });

  await check("the stored document's own extraction.text (after Save) matches the same reconstructed text", async () => {
    var saveBtn = findButtonByText(win, "Save Document");
    assert.ok(saveBtn, "'Save Document' button not found on the Add Document form");
    saveBtn.click();
    await waitFor(() => {
      var data = win.PCC.store.get();
      return data.documents.some((d) => d.filename === "layout-test.pdf");
    }, 3000);

    var data = win.PCC.store.get();
    var doc = data.documents.find((d) => d.filename === "layout-test.pdf");
    assert.ok(doc, "expected the uploaded document to be saved");
    assert.ok(doc.extraction, "expected a stored extraction on the saved document");
    assert.strictEqual(doc.extraction.type, "pdf");
    assert.strictEqual(doc.extraction.text, EXPECTED_TEXT);
    assert.strictEqual(doc.extraction.page_count, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
