// End-to-end jsdom tests for the 2026-09-24 audit's first fix group, against the real
// bundled index.html:
//   1. Word-document previews are sanitized (fileViewer.js's sanitizePreviewHtml): a real
//      .docx carried a `javascript:` hyperlink that ran code in the app when clicked.
//   2. A debounced save still pending when the page is hidden/closed is written at once
//      (store.js's flushPendingSave): an edit made in the last 250ms before a reload was lost.
//   3. Knowledge Base "open file" goes through the in-app viewer, not window.open(blob:).
//   4. The toolbar's project filter can't be wider than its row (styles.css) — checked here
//      at the CSS-rule level; the real layout effect is verified in Chromium separately,
//      since jsdom has no layout engine.
// The Electron-side fixes (navigation guard, mirror filename lock) are plain-Node tested in
// test_navigation_guard.js and test_mirror_file_writer.js.
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

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const errors = [];
  let windowOpenCalls = 0;
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.open = function () {
        windowOpenCalls++;
        return null;
      };
    },
  });
  dom.window.indexedDB = new FDBFactory();
  // jsdom lacks these; Node's own implementations are what blobStore.js's compression uses
  // (same approach as test_blob_compression_gate4_e2e.js).
  dom.window.CompressionStream = CompressionStream;
  dom.window.DecompressionStream = DecompressionStream;
  dom.window.Response = Response;
  dom.window.onerror = function (msg) {
    errors.push(msg);
  };
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  const win = dom.window;
  const doc = win.document;
  const sanitize = win.PCC.fileViewer.sanitizePreviewHtml;
  const key = "pcc_local_data_v1"; // store.js's LOCAL_STORAGE_KEY

  function sanitizeToContainer(htmlText) {
    const div = doc.createElement("div");
    div.appendChild(sanitize(htmlText));
    return div;
  }

  // ---- 1. Word preview sanitizing ----

  await check("the exact mammoth output from the audit's malicious .docx loses its javascript: href", () => {
    const out = sanitizeToContainer('<p><a href="javascript:window.__pwn=1">Click here</a></p>');
    const a = out.querySelector("a");
    assert.ok(a, "the link text itself should survive");
    assert.strictEqual(a.textContent, "Click here");
    assert.strictEqual(a.hasAttribute("href"), false, "javascript: href must be removed, got " + a.getAttribute("href"));
  });

  await check("case/whitespace/entity tricks on the scheme don't get through either", () => {
    ["JaVaScRiPt:alert(1)", "  javascript:alert(1)", "java&#x09;script:alert(1)", "vbscript:x", "data:text/html,<script>alert(1)</script>", "file:///C:/Windows/calc.exe", "blob:http://localhost/x"].forEach((href) => {
      const out = sanitizeToContainer('<a href="' + href + '">x</a>');
      assert.strictEqual(out.querySelector("a").hasAttribute("href"), false, href);
    });
  });

  await check("genuine web/mail links and in-page anchors are kept; external ones open outside the app", () => {
    const out = sanitizeToContainer('<a href="https://example.com/spec">w</a><a href="mailto:qs@example.com">m</a><a href="#ref1">i</a>');
    const [w, m, i] = out.querySelectorAll("a");
    assert.strictEqual(w.getAttribute("href"), "https://example.com/spec");
    assert.strictEqual(w.getAttribute("target"), "_blank");
    assert.strictEqual(w.getAttribute("rel"), "noopener noreferrer");
    assert.strictEqual(m.getAttribute("href"), "mailto:qs@example.com");
    assert.strictEqual(i.getAttribute("href"), "#ref1");
    assert.strictEqual(i.hasAttribute("target"), false, "an in-page anchor stays in-page");
  });

  await check("active elements and every on* handler attribute are stripped", () => {
    const out = sanitizeToContainer(
      '<p onclick="x()">t</p><script>window.__pwn=1</script><iframe src="https://e.x"></iframe><object data="x"></object>' +
        '<embed src="x"><form action="x"><input value="1"><button>b</button></form><svg onload="x()"></svg><style>*{}</style>' +
        '<img src="x" onerror="window.__pwn=1">'
    );
    assert.strictEqual(out.querySelectorAll("script,iframe,object,embed,form,input,button,svg,style").length, 0, out.innerHTML);
    assert.strictEqual(out.querySelectorAll("[onclick],[onerror],[onload]").length, 0, out.innerHTML);
    assert.strictEqual(out.querySelector("p").textContent, "t");
    assert.strictEqual(win.__pwn, undefined);
  });

  await check("embedded (data:) images from the document are kept; remote image URLs are dropped", () => {
    const out = sanitizeToContainer('<img src="data:image/png;base64,iVBORw0KGgo="><img src="https://tracker.example/p.gif">');
    const imgs = out.querySelectorAll("img");
    assert.strictEqual(imgs[0].getAttribute("src"), "data:image/png;base64,iVBORw0KGgo=");
    assert.strictEqual(imgs[1].hasAttribute("src"), false);
  });

  await check("ordinary document formatting survives untouched", () => {
    const out = sanitizeToContainer("<h1>Title</h1><p><strong>Bold</strong> and <em>italic</em></p><ul><li>one</li></ul><table><tr><td>cell</td></tr></table>");
    assert.strictEqual(out.innerHTML, "<h1>Title</h1><p><strong>Bold</strong> and <em>italic</em></p><ul><li>one</li></ul><table><tbody><tr><td>cell</td></tr></tbody></table>");
  });

  // ---- 2. Pending save flushed when the page is hidden/closed ----

  await check("an edit still inside the 250ms save window is written to localStorage on pagehide", () => {
    win.PCC.store.update((d) => d.projects.push(win.PCC.store.newProject({ name: "Added just before close" })));
    assert.ok((win.localStorage.getItem(key) || "").indexOf("Added just before close") === -1, "precondition: not saved yet (still debounced)");
    win.dispatchEvent(new win.Event("pagehide"));
    assert.ok(win.localStorage.getItem(key).indexOf("Added just before close") !== -1, "pagehide should flush the pending save");
  });

  await check("…and on the app being backgrounded (visibilitychange → hidden)", () => {
    win.PCC.store.update((d) => d.projects.push(win.PCC.store.newProject({ name: "Added before backgrounding" })));
    Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => "hidden" });
    doc.dispatchEvent(new win.Event("visibilitychange"));
    Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => "visible" });
    assert.ok(win.localStorage.getItem(key).indexOf("Added before backgrounding") !== -1);
  });

  // ---- 3. Knowledge Base opens files in the in-app viewer ----

  await check("Knowledge Base 'attached file' opens the in-app file viewer, never window.open", async () => {
    let articleId;
    win.PCC.store.update((d) => {
      const a = win.PCC.store.newKnowledgeBaseArticle({ title: "Pour procedure", filename: "procedure.txt", mime_type: "text/plain", file_size: 5 });
      d.knowledge_base_articles.push(a);
      articleId = a.id;
    });
    await win.PCC.blobStore.putBlob(articleId, "data:text/plain;base64," + Buffer.from("hello").toString("base64"));
    win.PCC.router.go("knowledgeBase");
    await flush();
    const details = Array.from(doc.querySelectorAll("#page-outlet button")).find((b) => b.textContent.trim() === "Details");
    assert.ok(details, "article Details button not found");
    details.click();
    await flush();
    const fileRow = Array.from(doc.querySelectorAll("#page-outlet .attention-item--clickable")).find((r) => r.textContent.indexOf("procedure.txt") !== -1);
    assert.ok(fileRow, "attached-file row not found");
    fileRow.click();
    for (let i = 0; i < 20 && !doc.getElementById("file-viewer-overlay"); i++) await flush();
    assert.ok(doc.getElementById("file-viewer-overlay"), "the in-app file viewer should open");
    assert.strictEqual(windowOpenCalls, 0, "window.open must not be used");
    win.PCC.fileViewer.close();
  });

  // ---- 4. Toolbar select width cap (CSS rule present in the shipped bundle) ----

  await check("the shipped stylesheet caps .toolbar select at its row width", () => {
    const rules = [];
    Array.from(doc.styleSheets).forEach((sheet) => Array.from(sheet.cssRules).forEach((r) => rules.push(r)));
    const capped = rules.some((r) => r.selectorText === ".toolbar select" && r.style.maxWidth === "100%" && r.style.minWidth === "0px");
    assert.ok(capped, ".toolbar select { max-width: 100%; min-width: 0 } not found");
  });

  await check("no uncaught errors across the whole run", () => {
    assert.strictEqual(errors.length, 0, "window.onerror: " + errors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
