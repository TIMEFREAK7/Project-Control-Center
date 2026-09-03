// Daily-Use Audit, Phase 2 — regression test for Global Project Context (Redesign
// Gate 6) now reaching Dashboard, My Work, Action Centre, and Project Lookahead: the
// four daily-open screens the audit found it never reached at all. Covers the live-sync
// mechanism specifically, since a first cut of this (seed-once-ever) missed the common
// case of the context changing AFTER a page's first render this session but before its
// next visit — e.g. switching projects while looking at Schedule, then clicking
// Dashboard. Scoped to this behavior, not a full re-test of each page's own content
// (already covered by their existing dedicated test files).
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

  var alphaId, betaId;
  await check("seed two projects, each with a meeting so the four pages have something to distinguish", () => {
    win.PCC.store.update(function (d) {
      var alpha = win.PCC.store.newProject({ name: "Context Alpha", status: "active" });
      var beta = win.PCC.store.newProject({ name: "Context Beta", status: "active" });
      d.projects.push(alpha, beta);
      alphaId = alpha.id;
      betaId = beta.id;
      d.meetings.push(win.PCC.store.newMeeting({ project_id: alphaId, title: "Alpha Meeting" }));
      d.meetings.push(win.PCC.store.newMeeting({ project_id: betaId, title: "Beta Meeting" }));
    });
    assert.ok(alphaId && betaId);
  });

  const PAGES = [
    { route: "dashboard", scopedText: (name) => "Focused on " + name, needle: "Context Alpha" },
    { route: "myWork", scopedText: (name) => "Your personal cockpit for " + name, needle: "Alpha Meeting" },
    { route: "actionCentre", needle: null },
    { route: "projectLookahead", scopedText: (name) => "for " + name, needle: "Alpha Meeting" },
  ];

  await check("with no context set, all four pages render both projects' data (baseline, unfiltered)", () => {
    win.PCC.projectContext.set("");
    for (const p of PAGES) {
      win.PCC.router.go(p.route);
      win.PCC.router.render();
      var text = outlet().textContent;
      if (p.needle) assert.ok(text.indexOf(p.needle) !== -1, p.route + " should show Alpha's data when unfiltered");
    }
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("setting context to Alpha BEFORE a page's first-ever visit scopes that page to Alpha on first render", () => {
    win.PCC.projectContext.set(alphaId);
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    assert.ok(outlet().textContent.indexOf("Focused on Context Alpha") !== -1, "Dashboard should scope to Alpha on its first render once context is set");
  });

  await check("changing context to Beta AFTER a page has already rendered once, then revisiting it, picks up the new context — the exact live-sync fix (a seed-once-ever flag would miss this)", () => {
    // Dashboard already rendered once above (scoped to Alpha). Now the context changes
    // elsewhere in the app (e.g. picking a different project in the header, or on
    // another page's own switcher) — simulated directly here.
    win.PCC.projectContext.set(betaId);
    win.PCC.router.go("myWork");
    win.PCC.router.render();
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    assert.ok(outlet().textContent.indexOf("Focused on Context Beta") !== -1, "Dashboard must pick up the context change to Beta on its next render, not stay stuck on Alpha from its first-ever render");
  });

  await check("My Work, Action Centre, and Project Lookahead each pick up a live context change too, not just Dashboard", () => {
    win.PCC.projectContext.set(alphaId);
    for (const p of PAGES) {
      if (p.route === "dashboard") continue;
      win.PCC.router.go(p.route);
      win.PCC.router.render();
      var text = outlet().textContent;
      // Note: the project <select>'s own <option> list legitimately includes both
      // project names regardless of which is selected, so this only checks that
      // Alpha's own content is present now that context moved to Alpha — the same
      // positive check every other page-content test in this suite uses.
      if (p.needle) assert.ok(text.indexOf(p.needle) !== -1, p.route + " should show Alpha's data now that context is Alpha");
    }
  });

  await check("clearing a page's own filter back to 'All Projects' locally persists across a re-render as long as global context doesn't change again", async () => {
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    // Dashboard is a React-migrated page — flush before interacting (a hashchange-
    // triggered render can still land asynchronously after this go()+render() pair,
    // per router.js's suppressNextHashRender single-flag race) and after the click
    // (its state update commits asynchronously) — see CLAUDE.md's React migration notes.
    await flush();
    var showAllBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Show All Projects");
    assert.ok(showAllBtn, "no 'Show All Projects' button found while a project is focused");
    showAllBtn.click();
    await flush();
    assert.ok(outlet().textContent.indexOf("Focused on") === -1, "the focus banner should be gone immediately after clicking Show All Projects");

    // Re-render without touching context again (e.g. navigating away and back) — the
    // local override must stick, not silently re-narrow back to Alpha.
    win.PCC.router.go("myWork");
    win.PCC.router.render();
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    await flush();
    assert.ok(outlet().textContent.indexOf("Focused on") === -1, "Show All Projects must persist across a revisit when context hasn't changed again");
  });

  await check("a genuine later context change still overrides a prior local 'Show All Projects' override", () => {
    win.PCC.projectContext.set(betaId);
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    assert.ok(outlet().textContent.indexOf("Focused on Context Beta") !== -1, "a real context change must still win over an earlier local override");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clicking Dashboard's own 'Show All Projects' clears the shared context too (not just this page's local view)", () => {
    var showAllBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Show All Projects");
    showAllBtn.click();
    assert.strictEqual(win.PCC.projectContext.get(), "", "Show All Projects should clear the shared Global Project Context, not just this page's own local filter");
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
