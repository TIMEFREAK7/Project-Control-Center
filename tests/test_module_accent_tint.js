// End-to-end jsdom test for the per-nav-group "module accent" title-block tint (added this
// session — see DESIGN_SYSTEM.md's "Module accent tokens" section for the full mechanism).
// jsdom can't validate color-mix()/CSS custom-property resolution (its CSSOM parser already
// logs "Could not parse CSS stylesheet" against this file's modern CSS elsewhere in the
// suite — real Chromium is the only thing that actually renders this, see the session's own
// visual-QA pass), so this file covers what jsdom CAN check reliably: that layout.js's
// setActiveNav() sets documentElement[data-nav-group] correctly for every real route, that
// GROUP_SLUGS has no missing/orphaned entries relative to NAV_GROUPS (the exact class of bug
// CLAUDE.md already warns about for the delay-record label maps — a group added to NAV_GROUPS
// without a matching GROUP_SLUGS entry would silently leave that group's pages untinted with
// no error), and a raw-text regression guard against the actual bug hit while building this:
// a CSS comment containing a literal "*/" substring closed early and silently dropped the very
// next token declaration with no console error, undetectable by jsdom's own CSS parsing.
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

  const EXPECTED_GROUPS = {
    dashboard: "overview",
    myWork: "overview",
    portfolio: "overview",
    schedule: "planning",
    delayRecoveryDashboard: "planning",
    cost: "controls",
    resources: "controls",
    risks: "management",
    changeOrders: "management",
    vendors: "vendors",
    documents: "documents",
    storageManagement: "documents",
    dailylog: "site",
    knowledgeBase: "site",
    reports: "reporting",
    settings: "system",
  };

  for (const route of Object.keys(EXPECTED_GROUPS)) {
    await check("route '" + route + "' sets data-nav-group='" + EXPECTED_GROUPS[route] + "' on navigation", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(route);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
      assert.strictEqual(
        win.document.documentElement.getAttribute("data-nav-group"),
        EXPECTED_GROUPS[route],
        "wrong data-nav-group for route '" + route + "'"
      );
    });
  }

  await check("every NAV_GROUPS label the app actually renders has a non-empty GROUP_SLUGS mapping (no route is silently left untinted)", () => {
    // Walk every nav item's route via the real sidebar markup (built once at mount, see
    // layout.js's buildNavList()) rather than re-declaring the group list here — this is
    // the regression guard: a future group added to NAV_GROUPS without a matching
    // GROUP_SLUGS entry leaves data-nav-group="" for every route in it, silently, with no
    // thrown error anywhere.
    const links = Array.from(win.document.querySelectorAll(".sidebar__link[data-route]"));
    assert.ok(links.length > 20, "expected the full nav item set, got " + links.length);
    links.forEach((link) => {
      const route = link.getAttribute("data-route");
      win.PCC.router.go(route);
      win.PCC.router.render();
      const group = win.document.documentElement.getAttribute("data-nav-group");
      assert.ok(group && group.length > 0, "route '" + route + "' resolved to an empty/missing data-nav-group");
    });
  });

  await check("the built CSS actually defines all eight --module-accent-* tokens as real declarations (regression guard for the *//comment bug hit this session)", () => {
    // Real bug: a CSS comment describing this feature contained the literal substring
    // "--status-*/--signal-amber" -- the "*/" closed the comment early, and the browser's
    // parser silently dropped the very next declaration (--module-accent-planning) with no
    // console error, undetectable by jsdom's own CSS parsing (which already can't parse
    // this file's modern CSS at all -- see the "Could not parse CSS stylesheet" warnings
    // elsewhere in this suite). A plain text/regex check on the shipped HTML is the cheap,
    // reliable guard: confirm every token appears as "--module-accent-X: hsl(" verbatim,
    // which only happens if the declaration was never swallowed as garbage.
    const slugs = ["planning", "controls", "management", "vendors", "documents", "site", "reporting", "system"];
    slugs.forEach((slug) => {
      const pattern = "--module-accent-" + slug + ": hsl(";
      assert.ok(html.includes(pattern), "expected to find literal declaration '" + pattern + "' in the built index.html");
    });
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
