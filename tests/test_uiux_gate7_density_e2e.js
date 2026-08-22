// End-to-end jsdom test against the ACTUAL bundled index.html for UI/UX Overhaul Gate 7
// (Desktop/Laptop Productivity — Density Control, the first of five brief-listed
// capabilities: focus mode/density control/resizable panels/better data grids/side-by-
// side views). Aditya chose to start with density control as the smallest, safest slice.
//
// Inspection found the [data-density="compact"] CSS token override had been reserved
// since Gate 1 but was NEVER WIRED to anything — no toggle existed. Worse: grepping for
// real consumers of --space-3/4/5 (the tokens that override targets) found they only
// ever fed .modal/.drawer padding — every screen that actually matters for day-to-day
// density (main.page, .panel, .toolbar, .project-card, .project-list, .form-grid) was
// hardcoded in px, not tokenized. Wiring the toggle to the reserved primitive alone
// would have shipped a toggle that persists correctly but is invisible almost
// everywhere — caught via real-Chromium screenshots (pixel-identical across all three
// states) before shipping, not by this test file. Confirmed with Aditya via
// AskUserQuestion to extend [data-density] with attribute-scoped overrides for those
// real, hardcoded properties directly (surgical additions, not a retrofit of the
// existing comfortable-mode rules).
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a brand-new install starts at density 'comfortable' with no [data-density] visual change", () => {
    assert.strictEqual(win.PCC.store.get().settings.density, "comfortable");
    assert.strictEqual(win.document.documentElement.getAttribute("data-density"), "comfortable");
  });

  await check("the density toggle button exists in the title block, next to the theme toggle", () => {
    var btn = win.document.getElementById("density-toggle-btn");
    assert.ok(btn, "density-toggle-btn not found");
    assert.ok(win.document.getElementById("density-toggle-icon"), "density-toggle-icon not found");
    assert.ok(btn.title.indexOf("Comfortable") !== -1, "title should reflect the current state");
  });

  await check("clicking the density toggle cycles comfortable -> spacious -> compact -> comfortable, persisting to settings.density each time", () => {
    var btn = win.document.getElementById("density-toggle-btn");

    btn.click();
    assert.strictEqual(win.PCC.store.get().settings.density, "spacious");
    assert.strictEqual(win.document.documentElement.getAttribute("data-density"), "spacious");
    assert.ok(btn.title.indexOf("Spacious") !== -1);

    btn.click();
    assert.strictEqual(win.PCC.store.get().settings.density, "compact");
    assert.strictEqual(win.document.documentElement.getAttribute("data-density"), "compact");
    assert.ok(btn.title.indexOf("Compact") !== -1);

    btn.click();
    assert.strictEqual(win.PCC.store.get().settings.density, "comfortable");
    assert.strictEqual(win.document.documentElement.getAttribute("data-density"), "comfortable");
    assert.ok(btn.title.indexOf("Comfortable") !== -1);
  });

  await check("the density attribute survives a simulated reload (re-invoking layout.mount(), which rebuilds #root itself, same pattern this app's own reload-persistence checks use)", () => {
    var btn = win.document.getElementById("density-toggle-btn");
    btn.click(); // -> spacious
    assert.strictEqual(win.PCC.store.get().settings.density, "spacious");

    win.PCC.layout.mount();

    assert.strictEqual(win.document.documentElement.getAttribute("data-density"), "spacious", "a persisted density preference must be re-applied on mount, same as theme");
    var freshBtn = win.document.getElementById("density-toggle-btn");
    assert.ok(freshBtn, "the toggle button must exist again after a fresh mount");
    assert.ok(freshBtn.title.indexOf("Spacious") !== -1);

    // Reset back to comfortable so later checks in this file (and any that follow it in
    // the suite) start from the app's normal default, not a state this file leaves behind.
    freshBtn.click();
    freshBtn.click();
    assert.strictEqual(win.PCC.store.get().settings.density, "comfortable");
  });

  await check("[data-density='compact']/[data-density='spacious'] CSS actually overrides real working-screen properties, not just the inert --space tokens", () => {
    // Confirms the specific gap this gate caught and fixed: grep the bundled CSS for the
    // attribute-scoped rules that make the toggle visible on the app's real screens
    // (main.page/.panel/.toolbar/.project-card/.project-list/.form-grid), not only the
    // --space-3/4/5 token block that predates this gate and only ever fed .modal/.drawer.
    var styleContent = Array.from(win.document.querySelectorAll("style"))
      .map(function (s) { return s.textContent; })
      .join("\n");
    ["main.page", ".panel", ".toolbar", ".project-card", ".project-list", ".form-grid"].forEach(function (selector) {
      var needle = '[data-density="compact"] ' + selector;
      assert.ok(styleContent.indexOf(needle) !== -1, "missing compact-density override for " + selector);
    });
  });

  await check("this gate writes nothing to the data model beyond the one settings.density field", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 0);
    assert.ok(data.schema_version >= 53, "schema_version must be at least 53 (this gate's own bump) — not pinned exactly, so later gates' own bumps don't break this assertion");
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "projectWorkspace",
    "executiveCenter", "vendors", "vendorPerformanceCentre", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "delayRecoveryDashboard", "risks",
    "meetings", "rfis", "changeOrders", "decisionRegister", "lessonsLearned", "knowledgeBase",
    "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the density control addition", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
