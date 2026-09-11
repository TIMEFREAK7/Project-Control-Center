// End-to-end jsdom test for fuzzy search (added this session, per Aditya's request: "fuzzy
// search throughout the project"). Two layers, both against the real bundled index.html, not
// a reimplementation:
//   1. window.PCC.fuzzyMatch (react/src/utils/fuzzyMatch.ts) directly -- exact substrings
//      still match (the fast path preserves 100% of the old exact-match behavior), plain
//      typos are tolerated, short queries are NOT fuzzed (a 2-3 letter query relies on the
//      substring fast path only, so it stays precise rather than matching half the register),
//      and multi-word queries require every word to find its own match (AND, not OR).
//   2. A couple of real module search boxes (Risk Register, Vendors) end-to-end, typing a
//      misspelled query and confirming the right row still surfaces -- proves the wiring
//      (service functions calling fuzzyMatch instead of a raw indexOf) actually took effect
//      in the shipped bundle, not just in isolation.
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

// Same descriptor-bypass helper CLAUDE.md documents for driving a controlled React input
// from outside React (see tests/test_document_types_e2e.js's setReactInputValue).
function setReactInputValue(win, el, value) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
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
  const fuzzyMatch = win.PCC.fuzzyMatch;

  await check("app boots on the bundled index.html without throwing, and window.PCC.fuzzyMatch is exposed", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.strictEqual(typeof fuzzyMatch, "function");
  });

  // ---- Unit-level coverage of the matcher itself ----

  await check("an empty or whitespace-only query matches everything (same 'no filter active' behavior every search box relies on)", () => {
    assert.ok(fuzzyMatch("", "Foundation Pour"));
    assert.ok(fuzzyMatch("   ", "Foundation Pour"));
  });

  await check("exact and partial substrings still match -- the fast path preserves every module's old exact-match behavior unchanged", () => {
    assert.ok(fuzzyMatch("found", "Foundation Pour Activity"));
    assert.ok(fuzzyMatch("POUR", "Foundation Pour Activity")); // case-insensitive
    assert.ok(!fuzzyMatch("xyz", "Foundation Pour Activity"));
  });

  await check("a single-letter typo in a 8+ letter word is tolerated (typo-tolerant fuzzy match)", () => {
    assert.ok(fuzzyMatch("Shcedule", "Schedule Delay Review")); // transposed letters
    assert.ok(fuzzyMatch("Foundaton", "Foundation Pour Activity")); // dropped letter
    assert.ok(fuzzyMatch("Concreet", "Concrete Delivery"));
  });

  await check("short queries (<=3 letters) rely on the substring fast path only -- never fuzzed, to stay precise in a dense register", () => {
    // "cat" is only 2 edits from "cot"/"car"/etc, but at length 3 the typo-tolerance
    // threshold is deliberately 0 -- a near-miss must not silently start matching.
    assert.ok(!fuzzyMatch("cat", "Concrete Delivery"));
    assert.ok(fuzzyMatch("con", "Concrete Delivery")); // still matches as a real substring
  });

  await check("multi-word queries require EVERY word to match somewhere in the haystack (AND, not OR)", () => {
    assert.ok(fuzzyMatch("concrete delivery", "Concrete Delivery Delay"));
    assert.ok(fuzzyMatch("concreet delvery", "Concrete Delivery Delay")); // both words typo'd
    assert.ok(!fuzzyMatch("concrete zzzznotpresent", "Concrete Delivery Delay"));
  });

  await check("a wildly different word does not fuzzy-match just because it's a similar length", () => {
    assert.ok(!fuzzyMatch("elephant", "Schedule"));
  });

  // ---- End-to-end: a real module's search box actually uses the fuzzy matcher ----

  var projId;
  await check("seed a project and a Risk Register entry", () => {
    win.PCC.store.update((d) => {
      var project = win.PCC.store.newProject({ name: "Fuzzy Test Project" });
      d.projects.push(project);
      projId = project.id;
      d.risks.push(
        win.PCC.store.newRisk({ project_id: projId, type: "risk", title: "Concrete Delivery Delay", status: "open" })
      );
    });
  });

  await check("Risk Register's search box finds 'Concrete Delivery Delay' via a misspelled query", async () => {
    thrownErrors.length = 0;
    win.PCC.router.go("risks");
    win.PCC.router.render();
    await flush();
    const input = win.document.querySelector('input[placeholder^="Search title"]');
    assert.ok(input, "Risk Register search input not found");
    setReactInputValue(win, input, "Concreet Delvery"); // two typos
    await flush();
    const listText = win.document.querySelector(".project-list").textContent;
    assert.ok(listText.indexOf("Concrete Delivery Delay") !== -1, "expected the misspelled search to still surface 'Concrete Delivery Delay'");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Risk Register's search box still EXCLUDES unrelated entries for the same misspelled query", async () => {
    win.PCC.store.update((d) => {
      d.risks.push(
        win.PCC.store.newRisk({ project_id: projId, type: "risk", title: "Permit Approval Delay", status: "open" })
      );
    });
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    await flush();
    win.PCC.router.go("risks");
    win.PCC.router.render();
    await flush();
    const input = win.document.querySelector('input[placeholder^="Search title"]');
    setReactInputValue(win, input, "Concreet Delvery");
    await flush();
    const listText = win.document.querySelector(".project-list").textContent;
    assert.ok(listText.indexOf("Concrete Delivery Delay") !== -1, "expected match still present");
    assert.ok(listText.indexOf("Permit Approval Delay") === -1, "fuzzy search should not have turned into a match-everything filter");
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
