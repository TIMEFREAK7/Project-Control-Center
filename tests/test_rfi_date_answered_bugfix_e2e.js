// Daily-Use Audit, Phase 1 — regression test for a real bug: closing an RFI/TQ directly
// (open -> closed, skipping the intermediate "answered" status — a very normal daily
// flow when something is answered verbally) used to never set date_answered, silently
// losing that audit-trail field with no way to backfill it. rfis.js has no other
// dedicated test file, so this is scoped narrowly to the fix itself, not a full RFI
// module test suite.
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
    thrownErrors.push(msg);
  };

  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  var projectId, rfiId;
  await check("seed a project and an open RFI", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "RFI Bugfix Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var rfi = win.PCC.store.newRfi({ project_id: projectId, type: "rfi", number: "RFI-001", subject: "Roof detail", question: "Confirm flashing detail.", status: "open" });
      d.rfis.push(rfi);
      rfiId = rfi.id;
    });
    assert.ok(projectId && rfiId);
    assert.strictEqual(win.PCC.store.get().rfis[0].date_answered, "");
  });

  await check("closing an RFI directly from 'open' to 'closed' (skipping 'answered') still records date_answered", async () => {
    win.PCC.router.go("rfis");
    // rfis.js is a React-migrated page — a click's state update commits asynchronously
    // (see CLAUDE.md's React migration notes), so await flush() before reading the
    // resulting DOM.
    await flush();
    findButtonByText(dom, "Edit").click();
    await flush();
    var statusSelect = outlet().querySelector("#rfifield-status");
    assert.ok(statusSelect, "status field not found");
    statusSelect.value = "closed";
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var rfi = win.PCC.store.get().rfis.find((r) => r.id === rfiId);
    assert.strictEqual(rfi.status, "closed");
    assert.ok(rfi.date_answered, "date_answered must be backfilled when an RFI is closed directly, not left blank");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var rfiId2;
  await check("an RFI answered then closed (going through 'answered' first) keeps its original date_answered, not overwritten on the later close", async () => {
    win.PCC.store.update(function (d) {
      var rfi = win.PCC.store.newRfi({ project_id: projectId, type: "rfi", number: "RFI-002", subject: "Second question", question: "Confirm something else.", status: "answered", date_answered: "2020-01-01" });
      d.rfis.push(rfi);
      rfiId2 = rfi.id;
    });
    win.PCC.router.render();
    await flush();
    var editButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Edit");
    editButtons[editButtons.length - 1].click();
    await flush();
    var statusSelect = outlet().querySelector("#rfifield-status");
    statusSelect.value = "closed";
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var rfi = win.PCC.store.get().rfis.find((r) => r.id === rfiId2);
    assert.strictEqual(rfi.status, "closed");
    assert.strictEqual(rfi.date_answered, "2020-01-01", "an already-set date_answered must never be overwritten");
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
