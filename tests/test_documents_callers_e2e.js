// End-to-end jsdom test for the cross-page links INTO the Documents register, against the
// real bundled index.html. Written after Schedule's Linked Records "Document" row turned
// out to have silently called a nonexistent API for as long as git history shows (see
// test_activity_linking_e2e.js): the other callers had no coverage at all.
//
// Every check runs with the CURRENT project context set to Alpha while the link targets
// Bravo, and Alpha holds the NEWEST document. That setup is deliberate: Documents
// defaults its list filter to the current project and auto-selects the newest upload, so a
// link that silently does nothing still looks like it "worked" unless the target differs
// from both defaults.
//
// Covered: Project Workspace's "Documents" module link, and Meetings' "+ Attach Document"
// (which also switches the list to the meeting's project; before that fix, a document
// attached from a meeting in another project saved but was hidden by the list's filter).
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
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  dom.window.indexedDB = new FDBFactory();
  const errors = [];
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
  const S = win.PCC.store;

  const ids = {};
  S.update((d) => {
    const alpha = S.newProject({ name: "Alpha Plant" });
    const bravo = S.newProject({ name: "Bravo Terminal" });
    d.projects.push(alpha, bravo);
    const decoy = S.newDocument({ project_id: alpha.id, filename: "alpha-newest.pdf" });
    decoy.uploaded_at = new Date(Date.now() + 60000).toISOString();
    d.documents.push(decoy, S.newDocument({ project_id: bravo.id, filename: "bravo-spec.pdf" }));
    const meeting = S.newMeeting({ project_id: bravo.id, title: "Bravo weekly" });
    d.meetings.push(meeting);
    ids.alpha = alpha.id;
    ids.bravo = bravo.id;
    ids.meeting = meeting.id;
  });

  function listedFiles() {
    return Array.from(doc.querySelectorAll("#page-outlet .doc-register-item")).map((el) =>
      el.textContent.indexOf("alpha-newest.pdf") !== -1 ? "alpha-newest.pdf" : el.textContent.indexOf("bravo-spec.pdf") !== -1 ? "bravo-spec.pdf" : "?"
    );
  }
  function selectedText() {
    const el = doc.querySelector(".doc-register-item--selected");
    return el ? el.textContent : "";
  }
  function projectFilterValue() {
    const sel = doc.querySelector('#page-outlet select[aria-label="Filter by project"]');
    return sel ? sel.value : null;
  }
  async function resetToAlpha() {
    win.PCC.projectContext.set(ids.alpha);
    win.PCC.router.go("dashboard");
    await flush();
  }

  await check("control: a plain visit to Documents with Alpha as the current project lists only Alpha's newest document", async () => {
    await resetToAlpha();
    win.PCC.router.go("documents");
    await flush();
    assert.deepStrictEqual(listedFiles(), ["alpha-newest.pdf"]);
    assert.strictEqual(projectFilterValue(), ids.alpha);
  });

  await check("Project Workspace → Documents (for Bravo) lists and selects Bravo's document, not the current project's", async () => {
    await resetToAlpha();
    win.PCC.projectWorkspace.viewProject(ids.bravo);
    win.PCC.router.go("projectWorkspace");
    await flush();
    const link = Array.from(doc.querySelectorAll("#page-outlet .card-menu__item")).find((el) => el.textContent.trim() === "Documents");
    assert.ok(link, "Project Workspace's Documents module link not found");
    link.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "documents");
    assert.strictEqual(projectFilterValue(), ids.bravo, "list should be filtered to Bravo");
    assert.deepStrictEqual(listedFiles(), ["bravo-spec.pdf"]);
    assert.ok(selectedText().indexOf("bravo-spec.pdf") !== -1, "Bravo's document should be the selected one, got: " + selectedText());
  });

  await check("Meeting '+ Attach Document' opens the upload form preset to the meeting's project, linked to the meeting", async () => {
    await resetToAlpha();
    win.PCC.meetings.filterByProject(ids.bravo);
    win.PCC.meetings.expandMeeting(ids.meeting);
    win.PCC.router.go("meetings");
    await flush();
    // The user switches back to Alpha elsewhere (e.g. the title-block switcher) while the
    // Bravo meeting is still open — the case the list-filter fix is for.
    win.PCC.projectContext.set(ids.alpha);
    const attach = Array.from(doc.querySelectorAll("#page-outlet button")).find((b) => b.textContent.indexOf("Attach Document") !== -1);
    assert.ok(attach, "'+ Attach Document' button not found on the expanded meeting");
    attach.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "documents");
    const projectSelect = doc.getElementById("docfield-project_id");
    assert.ok(projectSelect, "upload form did not open");
    assert.strictEqual(projectSelect.value, ids.bravo, "upload form should be preset to the meeting's project");
    assert.ok(doc.getElementById("page-outlet").textContent.indexOf("Linked to meeting: “Bravo weekly”") !== -1, "upload form should show the linked meeting");
  });

  await check("…and the register under the form is switched to the meeting's project, so the new document won't be hidden after saving", () => {
    assert.strictEqual(projectFilterValue(), ids.bravo, "list filter should follow the meeting's project, got: " + projectFilterValue());
    assert.deepStrictEqual(listedFiles(), ["bravo-spec.pdf"]);
  });

  await check("no uncaught errors across the whole run", () => {
    assert.strictEqual(errors.length, 0, "window.onerror: " + errors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
