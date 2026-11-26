// Gate H.3 (2026-11-26): the "App data" meter on Storage Management, the once-per-session
// 80% warning, and the pre-flight refusals that stop an oversized JSON import, schedule
// import or document save BEFORE anything is committed (previously it was accepted in memory
// and then failed to save). Against the real bundled index.html. Space is used up with a
// filler localStorage key: every key counts against the same browser quota.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
const SCHEMA_VERSION = require("./schemaVersion");

const INDEX_PATH = path.join(__dirname, "..", "index.html");
const KEY = "pcc_local_data_v1";
const FILLER_KEY = "pcc_test_filler";
const LIMIT = 5242880;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function flush() {
  for (let i = 0; i < 12; i++) await sleep(0);
}
async function waitFor(fn, ms) {
  const end = Date.now() + (ms || 5000);
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(10);
  }
  throw new Error("waitFor() timed out");
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

function button(win, text) {
  return Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
}

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const thrownErrors = [];
  // A higher quota than jsdom's default so the filler, not jsdom, decides what "full" means.
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, storageQuota: 12000000 });
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
  const S = win.PCC.store;
  const outlet = () => win.document.getElementById("page-outlet");

  // Fills the filler key so that everything stored totals `usedChars`.
  function fillTo(usedChars) {
    win.localStorage.removeItem(FILLER_KEY);
    const app = JSON.stringify(S.get()).length + KEY.length;
    win.localStorage.setItem(FILLER_KEY, "x".repeat(Math.max(0, usedChars - app - FILLER_KEY.length)));
  }
  const blobIds = () => win.PCC.blobStore.listBlobIds();
  const importJson = (text) => new Promise((resolve) => S.importFromJsonString(text, (err) => resolve(err)));

  S.update((d) => d.projects.push({ id: "p1", name: "Meter Tower", archived: false, status: "on_track", progress: 0, attachments: [] }));
  win.PCC.projectContext.set("p1");
  await sleep(400);

  await check("Storage Management shows an App data panel: percentage used and the per-collection breakdown", async () => {
    win.PCC.router.go("storageManagement");
    await flush();
    const text = outlet().textContent;
    assert.ok(text.indexOf("App data") !== -1, "no App data panel");
    assert.ok(/\d+(\.\d)?% used/.test(text), "no percentage: " + text.slice(0, 400));
    assert.ok(text.indexOf("document_types") !== -1 && text.indexOf("projects") !== -1, "no per-collection rows");
  });

  await check("a normal-sized JSON import still works", async () => {
    const err = await importJson(JSON.stringify({ schema_version: SCHEMA_VERSION, projects: [{ id: "p1", name: "Meter Tower", archived: false, status: "on_track", progress: 0, attachments: [] }], settings: {} }));
    assert.strictEqual(err, null);
    await sleep(400);
  });

  const warnings = [];
  const realNotify = win.PCC.notify;
  win.PCC.notify = function (msg, sev, action) {
    if (/storage limit/.test(msg)) warnings.push(msg);
    return realNotify.apply(this, arguments);
  };

  await check("crossing 80% shows one warning toast with an 'Open Storage Management' button", async () => {
    fillTo(Math.round(LIMIT * 0.85));
    S.update((d) => (d.settings.company_name = "Acme"));
    await sleep(400);
    assert.strictEqual(warnings.length, 1, "warnings: " + warnings.join(" | "));
    assert.ok(/8\d%/.test(warnings[0]), warnings[0]);
    const btn = Array.from(win.document.querySelectorAll("#toast-stack .toast button")).find((b) => b.textContent.trim() === "Open Storage Management");
    assert.ok(btn, "no button in the toast");
    win.PCC.router.go("dashboard");
    await flush();
    btn.click();
    await flush();
    assert.ok(/storageManagement/.test(win.location.hash), "hash: " + win.location.hash);
  });

  await check("…and only once per session, however many more saves follow", async () => {
    S.update((d) => (d.settings.company_name = "Acme 2"));
    await sleep(400);
    S.update((d) => (d.settings.company_name = "Acme 3"));
    await sleep(400);
    assert.strictEqual(warnings.length, 1);
  });

  // From here only ~30,000 characters are left.
  const room = () => fillTo(LIMIT - 30000);

  await check("an oversized JSON import is refused before anything is committed or written to IndexedDB", async () => {
    room();
    const rawBefore = win.localStorage.getItem(KEY);
    const storeBefore = JSON.stringify(S.get());
    const idsBefore = await blobIds();
    const big = {
      schema_version: SCHEMA_VERSION,
      projects: [{ id: "big", name: "y".repeat(80000) }],
      documents: [{ id: "doc_big", project_id: "big", filename: "a.txt", file_data: "data:text/plain;base64,QUJD" }],
      settings: {},
    };
    const err = await importJson(JSON.stringify(big));
    assert.ok(err && /Storage Management/.test(err.message), err && err.message);
    await sleep(400);
    assert.strictEqual(win.localStorage.getItem(KEY), rawBefore);
    assert.strictEqual(JSON.stringify(S.get()), storeBefore);
    assert.deepStrictEqual(await blobIds(), idsBefore, "a blob was written");
  });

  await check("an oversized schedule import is refused with the reason, and nothing is stored", async () => {
    room();
    const schedulesBefore = S.get().schedules.length;
    const idsBefore = await blobIds();
    const longName = "Activity ".repeat(10000);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Project xmlns="http://schemas.microsoft.com/project"><Name>Big</Name><Tasks>
      <Task><UID>0</UID><ID>0</ID><Name>Big</Name><Summary>1</Summary></Task>
      <Task><UID>10</UID><ID>1</ID><Name>${longName}</Name><WBS>1</WBS><Duration>PT8H0M0S</Duration><Start>2026-02-02T08:00:00</Start><Finish>2026-02-02T17:00:00</Finish></Task>
      </Tasks></Project>`;
    win.PCC.router.go("schedule");
    await flush();
    button(win, "Import Schedule").click();
    await flush();
    const input = outlet().querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { value: [new win.File([xml], "big.xml", { type: "application/xml" })], configurable: true });
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
    await waitFor(() => Array.from(win.document.querySelectorAll("button")).some((b) => b.textContent.indexOf("Confirm Import") === 0));
    Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent.indexOf("Confirm Import") === 0).click();
    await waitFor(() => outlet().textContent.indexOf("Storage Management") !== -1, 3000);
    assert.strictEqual(S.get().schedules.length, schedulesBefore);
    assert.deepStrictEqual(await blobIds(), idsBefore, "the schedule file was written to IndexedDB");
  });

  await check("a document whose extracted text won't fit is refused, and nothing is stored", async () => {
    room();
    const docsBefore = S.get().documents.length;
    const idsBefore = await blobIds();
    const errors = [];
    win.PCC.notify = function (msg, sev) {
      if (sev === "error") errors.push(msg);
      return realNotify.apply(this, arguments);
    };
    win.pdfjsLib = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () => Promise.resolve({ getTextContent: () => Promise.resolve({ items: [{ str: "z".repeat(60000), transform: [10, 0, 0, 10, 0, 700], width: 30 }] }) }),
        }),
      }),
    };
    win.PCC.router.go("documents");
    await flush();
    button(win, "+ Add Document").click();
    await flush();
    const input = outlet().querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { value: [new win.File(["%PDF-1.4 big"], "big.pdf", { type: "application/pdf" })], configurable: true });
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
    await waitFor(() => !!outlet().querySelector("div.mono"), 3000);
    button(win, "Save Document").click();
    await waitFor(() => errors.length > 0, 3000);
    assert.ok(/Storage Management/.test(errors[0]), errors[0]);
    assert.strictEqual(S.get().documents.length, docsBefore);
    assert.deepStrictEqual(await blobIds(), idsBefore, "the document file was written to IndexedDB");
  });

  await check("no uncaught errors", () => {
    assert.strictEqual(thrownErrors.length, 0, thrownErrors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
