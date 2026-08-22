// End-to-end jsdom test for Mobile & Desktop Packaging Gate 2: the shared in-app file
// viewer (fileViewer.js) and the platform-aware save/share helper (nativeFile.js) that
// replace every `window.open(blob:..., "_blank")` call site across Documents, Daily Log
// photos, and Vendor documents — a bare WebView (Capacitor or Electron) has no browser
// "new tab" for that pattern to open into. Runs against the actual bundled index.html,
// same convention every prior gate's e2e test uses (see test_vendors_e2e.js /
// test_document_revision_status_e2e.js for the blob-seeding and button-click patterns
// this file follows). Real PDF/canvas rendering and the Capacitor plugin bridge itself
// aren't jsdom-testable — those were verified via real-Chromium Playwright (fileViewer's
// own rendering) and structural APK inspection (nativeFile's Capacitor branch), same
// split every packaging gate so far has used between automated tests and real-environment
// verification.
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
    thrownErrors.push(String(msg));
  };
  // jsdom doesn't implement URL.createObjectURL/revokeObjectURL — stub them, same
  // convention this project already uses for jsdom's missing FileReader.readAsDataURL.
  let fakeUrlCounter = 0;
  dom.window.URL.createObjectURL = () => "blob:fake-url-" + ++fakeUrlCounter;
  dom.window.URL.revokeObjectURL = () => {};
  await flush();
  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  // ---- nativeFile.js: platform-aware save/share ----

  await check("nativeFile.isNativePlatform() is false with no window.Capacitor present", () => {
    assert.strictEqual(win.PCC.nativeFile.isNativePlatform(), false);
  });

  await check("nativeFile.save() falls back to the browser <a download> path on web/desktop", async () => {
    let clicked = false;
    const realCreateElement = win.document.createElement.bind(win.document);
    win.document.createElement = function (tag) {
      const el = realCreateElement(tag);
      if (tag === "a") {
        const realClick = el.click.bind(el);
        el.click = function () {
          clicked = true;
          realClick();
        };
      }
      return el;
    };
    const blob = new win.Blob(["hello"], { type: "text/plain" });
    await win.PCC.nativeFile.save(blob, "test-export.txt");
    win.document.createElement = realCreateElement;
    assert.strictEqual(clicked, true, "expected the fallback <a download> to be clicked");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("nativeFile.save() uses Capacitor Filesystem+Share instead, when running as a native platform", async () => {
    let writeFileArgs = null;
    let shareArgs = null;
    win.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        Filesystem: {
          writeFile: (args) => {
            writeFileArgs = args;
            return Promise.resolve({ uri: "file:///cache/" + args.path });
          },
        },
        Share: {
          share: (args) => {
            shareArgs = args;
            return Promise.resolve();
          },
        },
      },
    };
    const blob = new win.Blob(["hello native"], { type: "text/plain" });
    await win.PCC.nativeFile.save(blob, "native-export.txt");
    delete win.Capacitor;

    assert.ok(writeFileArgs, "expected Filesystem.writeFile to be called");
    assert.strictEqual(writeFileArgs.path, "native-export.txt");
    assert.strictEqual(writeFileArgs.directory, "CACHE");
    assert.ok(writeFileArgs.data && writeFileArgs.data.length > 0, "expected base64 file data, not the a-download path");
    assert.ok(shareArgs, "expected Share.share to be called");
    assert.strictEqual(shareArgs.url, "file:///cache/native-export.txt");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- fileViewer.js: the in-app modal itself ----

  await check("fileViewer.open() with an image blob renders an <img> inside a modal, not a new tab", () => {
    const blob = new win.Blob(["fake-png-bytes"], { type: "image/png" });
    win.PCC.fileViewer.open({ filename: "site-photo.png", mimeType: "image/png", blob: blob });
    const overlay = win.document.getElementById("file-viewer-overlay");
    assert.ok(overlay, "expected the viewer overlay to be in the DOM");
    assert.ok(overlay.querySelector(".modal__title").textContent === "site-photo.png");
    assert.ok(overlay.querySelector(".modal__body img"), "expected an <img> in the modal body");
    win.PCC.fileViewer.close();
    assert.strictEqual(win.document.getElementById("file-viewer-overlay"), null, "expected close() to remove the overlay");
  });

  await check("fileViewer.open() with an unsupported type shows a fallback message and a working Save/Share button", async () => {
    let saveCalledWith = null;
    const realSave = win.PCC.nativeFile.save;
    win.PCC.nativeFile.save = (blob, filename) => {
      saveCalledWith = filename;
      return Promise.resolve();
    };

    const blob = new win.Blob(["binary junk"], { type: "application/octet-stream" });
    win.PCC.fileViewer.open({ filename: "recording.bin", mimeType: "application/octet-stream", blob: blob });
    const overlay = win.document.getElementById("file-viewer-overlay");
    assert.ok(overlay.querySelector(".modal__body").textContent.indexOf("No in-app preview") !== -1);

    const saveBtn = Array.from(overlay.querySelectorAll("button")).find((b) => b.textContent === "Save / Share");
    assert.ok(saveBtn, "expected a Save / Share button");
    saveBtn.click();
    await flush();
    assert.strictEqual(saveCalledWith, "recording.bin");

    win.PCC.fileViewer.close();
    win.PCC.nativeFile.save = realSave;
  });

  await check("Escape key closes the viewer", () => {
    const blob = new win.Blob(["x"], { type: "text/plain" });
    win.PCC.fileViewer.open({ filename: "a.txt", mimeType: "text/plain", blob: blob });
    assert.ok(win.document.getElementById("file-viewer-overlay"));
    win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
    assert.strictEqual(win.document.getElementById("file-viewer-overlay"), null);
  });

  // ---- Real call sites: Documents / Vendors / Daily Log all route through fileViewer now ----

  let projectId;
  await check("seed a project", () => {
    win.PCC.store.update(function (data) {
      var project = win.PCC.store.newProject({ name: "Gate 2 Test Tower", status: "on_track" });
      data.projects.push(project);
      projectId = project.id;
    });
  });

  let docId;
  await check("Documents: 'Open File' on a seeded document calls fileViewer.open with the real filename, not window.open", async () => {
    win.PCC.store.update(function (data) {
      var doc = win.PCC.store.newDocument({
        project_id: projectId,
        filename: "spec-001.pdf",
        mime_type: "application/pdf",
        category: "specification",
      });
      data.documents.push(doc);
      docId = doc.id;
    });
    await win.PCC.blobStore.putBlob(docId, "data:application/pdf;base64,JVBERi0xLjQK");

    let openedWith = null;
    const realOpen = win.PCC.fileViewer.open;
    win.PCC.fileViewer.open = (opts) => {
      openedWith = opts;
    };

    win.PCC.router.go("documents");
    win.PCC.router.render();
    const openBtn = findButtonByText(dom, "Open File");
    assert.ok(openBtn, "expected an Open File button for the seeded document");
    openBtn.click();
    await flush();

    win.PCC.fileViewer.open = realOpen;
    assert.ok(openedWith, "expected fileViewer.open to have been called");
    assert.strictEqual(openedWith.filename, "spec-001.pdf");
    assert.strictEqual(openedWith.mimeType, "application/pdf");
    assert.ok(openedWith.blob instanceof win.Blob);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  let vendorId, vendorDocId;
  await check("Vendors: 'View / Download' on a seeded vendor document calls fileViewer.open", async () => {
    win.PCC.store.update(function (data) {
      var vendor = win.PCC.store.newVendor({ company_name: "Gate 2 Vendor Co" });
      data.vendors.push(vendor);
      vendorId = vendor.id;
      var doc = win.PCC.store.newVendorDocument({
        vendor_id: vendorId,
        project_id: projectId,
        category: "insurance_document",
        filename: "coi-2026.pdf",
        mime_type: "application/pdf",
      });
      data.vendor_documents.push(doc);
      vendorDocId = doc.id;
    });
    await win.PCC.blobStore.putBlob(vendorDocId, "data:application/pdf;base64,ZmFrZS1wZGY=");

    let openedWith = null;
    const realOpen = win.PCC.fileViewer.open;
    win.PCC.fileViewer.open = (opts) => {
      openedWith = opts;
    };

    win.PCC.router.go("vendors");
    win.PCC.router.render();
    if (win.PCC.vendors) win.PCC.vendors.openProfile(vendorId);
    win.PCC.router.go("vendors");
    win.PCC.router.render();
    findButtonByText(dom, "Documents").click();
    const viewBtn = findButtonByText(dom, "View / Download");
    assert.ok(viewBtn, "expected a View / Download button for the seeded vendor document");
    viewBtn.click();
    await flush();

    win.PCC.fileViewer.open = realOpen;
    assert.ok(openedWith, "expected fileViewer.open to have been called");
    assert.strictEqual(openedWith.filename, "coi-2026.pdf");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  let logId, photoId;
  await check("Daily Log: opening a photo's full size calls fileViewer.open", async () => {
    win.PCC.store.update(function (data) {
      var photo = win.PCC.store.newDailyLogPhoto({ filename: "site.jpg", caption: "Gate 2 test photo" });
      photoId = photo.id;
      var log = win.PCC.store.newDailyLog({ project_id: projectId, photos: [photo] });
      data.daily_logs.push(log);
      logId = log.id;
    });
    await win.PCC.blobStore.putBlob(photoId, "data:image/jpeg;base64,ZmFrZS1qcGVn");

    let openedWith = null;
    const realOpen = win.PCC.fileViewer.open;
    win.PCC.fileViewer.open = (opts) => {
      openedWith = opts;
    };

    win.PCC.router.go("dailylog");
    win.PCC.router.render();
    const detailsBtn = findButtonByText(dom, "Details");
    assert.ok(detailsBtn, "expected a Details button on the seeded log's card");
    detailsBtn.click();
    win.PCC.router.render();

    const photoLink = win.document.querySelector('a[title="Open full size"]');
    assert.ok(photoLink, "expected an 'Open full size' link for the seeded photo");
    photoLink.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
    await flush();

    win.PCC.fileViewer.open = realOpen;
    assert.ok(openedWith, "expected fileViewer.open to have been called");
    assert.strictEqual(openedWith.filename, "Gate 2 test photo.jpg");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Export / recovery-backup download also route through nativeFile.save now ----

  await check("store.exportToFile() saves via nativeFile.save with a project-data-*.json filename", async () => {
    let saveCalledWith = null;
    const realSave = win.PCC.nativeFile.save;
    win.PCC.nativeFile.save = (blob, filename) => {
      saveCalledWith = { blob: blob, filename: filename };
      return Promise.resolve();
    };

    await win.PCC.store.exportToFile();

    win.PCC.nativeFile.save = realSave;
    assert.ok(saveCalledWith, "expected nativeFile.save to have been called");
    assert.ok(/^project-data-\d{4}-\d{2}-\d{2}\.json$/.test(saveCalledWith.filename), "unexpected filename: " + saveCalledWith.filename);
    assert.ok(saveCalledWith.blob instanceof win.Blob);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("route smoke test: documents/vendors/dailylog all still render cleanly after Gate 2's changes", () => {
    ["documents", "vendors", "dailylog", "dashboard"].forEach(function (route) {
      win.PCC.router.go(route);
      win.PCC.router.render();
      assert.ok(outlet().innerHTML.length > 0, "route '" + route + "' rendered nothing");
    });
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
