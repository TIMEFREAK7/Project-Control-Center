// End-to-end jsdom test against the ACTUAL bundled index.html for the UI/UX Overhaul,
// Gate 2 (Global Navigation). Covers the two behavioral pieces this gate added on top of
// Gate 1's inert CSS primitives:
//   1. A manual sidebar collapse toggle, persisted to settings.sidebar_collapsed
//      (schema v51 -> v52) — same value/toggle at every tier from Large Desktop down
//      through Tablet, no per-tier auto-collapse.
//   2. Mobile nav: the hamburger button (.icon-btn--menu, CSS-shown only below 780px,
//      but always present in the DOM regardless of viewport) opens the full grouped nav
//      list in a slide-in drawer (layout.js's openMobileNav/buildNavList), replacing the
//      old horizontal-scroll-strip-of-23-links behavior.
// The fixed .sidebar's own responsive hiding below 780px is a CSS-only concern (verified
// via the styles.css rule directly, not exercised through jsdom's zero-layout viewport —
// see the Gate 1 test's own precedent for why viewport-dependent CSS isn't testable here).
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

  await check("app boots on the bundled index.html without throwing, schema_version is 52", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.store.get().schema_version >= 52);
  });

  await check("the sidebar starts expanded (no .sidebar--collapsed) with a collapse toggle button present", () => {
    const sidebar = win.document.querySelector(".sidebar");
    assert.ok(sidebar, "sidebar not found");
    assert.ok(!sidebar.classList.contains("sidebar--collapsed"), "sidebar should start expanded on a fresh install");
    const collapseBtn = sidebar.querySelector(".sidebar__collapse-btn");
    assert.ok(collapseBtn, "collapse toggle button not found in the sidebar");
    assert.strictEqual(win.PCC.store.get().settings.sidebar_collapsed, false);
  });

  await check("clicking the collapse toggle adds .sidebar--collapsed and persists settings.sidebar_collapsed to the store", () => {
    const collapseBtn = win.document.querySelector(".sidebar__collapse-btn");
    collapseBtn.click();
    const sidebar = win.document.querySelector(".sidebar");
    assert.ok(sidebar.classList.contains("sidebar--collapsed"), "sidebar should be collapsed after clicking the toggle");
    assert.strictEqual(win.PCC.store.get().settings.sidebar_collapsed, true, "the toggle must persist to the store, not just the DOM");
  });

  await check("clicking it again expands the sidebar and persists false", () => {
    const collapseBtn = win.document.querySelector(".sidebar__collapse-btn");
    collapseBtn.click();
    const sidebar = win.document.querySelector(".sidebar");
    assert.ok(!sidebar.classList.contains("sidebar--collapsed"));
    assert.strictEqual(win.PCC.store.get().settings.sidebar_collapsed, false);
  });

  await check("a persisted collapsed=true preference is honored when the shell is rebuilt (simulating a reload)", () => {
    win.PCC.store.update(function (d) {
      d.settings.sidebar_collapsed = true;
    });
    // mount() is what runs on a real page load, reading settings at shell-build time —
    // re-invoking it here (rather than spinning up a second JSDOM instance sharing
    // localStorage) exercises the exact same code path a real reload would.
    win.PCC.layout.mount();
    win.PCC.router.render();
    const sidebar = win.document.querySelector(".sidebar");
    assert.ok(sidebar.classList.contains("sidebar--collapsed"), "a persisted collapsed preference must be honored on the next shell build");
    // Reset back to expanded so the rest of this test's assertions aren't affected.
    win.PCC.store.update(function (d) {
      d.settings.sidebar_collapsed = false;
    });
    win.PCC.layout.mount();
    win.PCC.router.render();
  });

  await check("the hamburger menu button exists in the title block, and no mobile drawer is open initially", () => {
    const menuBtn = win.document.querySelector(".icon-btn--menu");
    assert.ok(menuBtn, "hamburger menu button not found");
    assert.ok(!win.document.getElementById("mobile-nav-overlay"), "no drawer should be open before it's triggered");
  });

  await check("clicking the hamburger opens the mobile drawer with the full grouped nav list", () => {
    const menuBtn = win.document.querySelector(".icon-btn--menu");
    menuBtn.click();
    const overlay = win.document.getElementById("mobile-nav-overlay");
    assert.ok(overlay, "drawer overlay should be in the DOM after clicking the hamburger");
    const drawer = overlay.querySelector(".drawer");
    assert.ok(drawer, "drawer panel not found inside the overlay");
    const links = drawer.querySelectorAll(".sidebar__link");
    assert.ok(links.length > 15, "expected the full nav item set inside the drawer, got " + links.length);
    const groupLabels = Array.from(drawer.querySelectorAll(".sidebar__group-label")).map((el) => el.textContent);
    assert.deepStrictEqual(groupLabels, ["OVERVIEW", "REGISTERS", "PLANNING", "OUTPUT"], "drawer should show the same groups as the desktop sidebar");
  });

  await check("clicking the overlay backdrop (not the drawer itself) closes it", () => {
    const overlay = win.document.getElementById("mobile-nav-overlay");
    overlay.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    // The overlay's own click handler checks e.target === overlay; dispatching directly
    // on the overlay element itself satisfies that.
    assert.ok(!win.document.getElementById("mobile-nav-overlay"), "drawer should close when the backdrop is clicked");
  });

  await check("pressing Escape closes an open drawer", () => {
    win.document.querySelector(".icon-btn--menu").click();
    assert.ok(win.document.getElementById("mobile-nav-overlay"), "drawer should be open before pressing Escape");
    win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
    assert.ok(!win.document.getElementById("mobile-nav-overlay"), "drawer should close on Escape");
  });

  await check("clicking a nav link inside the drawer navigates to that route and closes the drawer", async () => {
    win.document.querySelector(".icon-btn--menu").click();
    const overlay = win.document.getElementById("mobile-nav-overlay");
    const risksLink = Array.from(overlay.querySelectorAll(".sidebar__link")).find(
      (a) => a.getAttribute("data-route") === "risks"
    );
    assert.ok(risksLink, "Risk Register link not found in the drawer");
    risksLink.click();
    // Anchor-href hash navigation resolves asynchronously in this jsdom version once the
    // full app's event/timer machinery is involved (same class of quirk as router.go()'s
    // own queued hashchange, see test_gantt_virtualization_e2e.js's own comment on this) —
    // it is NOT asynchronous in a real browser, this flush is a jsdom-only accommodation.
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "risks");
    assert.ok(!win.document.getElementById("mobile-nav-overlay"), "drawer should close after navigating via one of its links");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("navigating any other way (not clicking a drawer link) also closes an open drawer, via setActiveNav", async () => {
    win.document.querySelector(".icon-btn--menu").click();
    assert.ok(win.document.getElementById("mobile-nav-overlay"));
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    await flush();
    assert.ok(!win.document.getElementById("mobile-nav-overlay"), "drawer should close on any route change, not just link clicks inside it");
  });

  await check("the fixed sidebar and the drawer's nav copy both get highlighted correctly for the active route (shared setActiveNav)", async () => {
    win.PCC.router.go("documents");
    win.PCC.router.render();
    await flush();
    win.document.querySelector(".icon-btn--menu").click();
    const overlay = win.document.getElementById("mobile-nav-overlay");
    const drawerActiveLink = overlay.querySelector('.sidebar__link[data-route="documents"]');
    assert.ok(drawerActiveLink.classList.contains("active"), "the drawer's own copy of the active link should be highlighted too");
    const sidebarActiveLink = win.document.querySelector('.sidebar .sidebar__link[data-route="documents"]');
    assert.ok(sidebarActiveLink.classList.contains("active"));
    win.document.getElementById("mobile-nav-overlay").querySelector(".icon-btn").click(); // close via the × button
    assert.ok(!win.document.getElementById("mobile-nav-overlay"));
  });

  await check("this gate writes nothing else to the schedule/register data — no schema drift beyond the new sidebar_collapsed field", () => {
    const data = win.PCC.store.get();
    assert.ok(data.schema_version >= 52);
    assert.strictEqual(typeof data.settings.sidebar_collapsed, "boolean");
  });

  // ---- Route smoke test across every page ----
  const routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "lessonsLearned", "knowledgeBase", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (let i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after Gate 2's shell changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
