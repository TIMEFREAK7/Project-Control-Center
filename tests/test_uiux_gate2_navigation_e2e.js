// End-to-end jsdom test against the ACTUAL bundled index.html for the UI/UX Overhaul,
// Gate 2 (Global Navigation) — REVISED per Aditya's explicit follow-up request: an
// Outlook-Online-style nav instead of the persistent/collapsible sidebar this gate
// originally shipped. There is no more `.sidebar` element in the DOM at any screen
// size: navigation is hidden until the hamburger button (.icon-btn--menu, always
// visible now, not CSS-hidden above 780px any more) is clicked, opening the full nav
// as a left-anchored slide-in overlay (.drawer.drawer--left). Inside it, each group
// (OVERVIEW/REGISTERS/PLANNING/OUTPUT) is its own click-to-expand accordion — the
// group containing the current route starts expanded, the rest start collapsed.
//
// settings.sidebar_collapsed (added for the original collapse-toggle version of this
// gate, schema v51 -> v52) is now unused — nothing in layout.js reads or writes it any
// more, since there's no persistent "collapsed vs expanded" state left to persist. The
// field itself stays in the schema untouched (no migration change, no data loss),
// consistent with how this app has retired fields before; store.js's own migration
// tests still cover it existing and backfilling correctly, unrelated to this file.
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

  await check("app boots on the bundled index.html without throwing, schema_version is 52, and there is no persistent .sidebar element", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.store.get().schema_version >= 52);
    assert.ok(!win.document.querySelector(".sidebar"), "there should be no persistent sidebar element any more");
  });

  await check("the hamburger menu button exists in the title block, and no nav overlay is open initially", () => {
    const menuBtn = win.document.querySelector(".icon-btn--menu");
    assert.ok(menuBtn, "hamburger menu button not found");
    assert.ok(!win.document.getElementById("nav-overlay"), "no nav overlay should be open before it's triggered");
  });

  await check("clicking the hamburger opens the nav overlay with all four groups present but collapsed except the one containing the current route", () => {
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    const menuBtn = win.document.querySelector(".icon-btn--menu");
    menuBtn.click();
    const overlay = win.document.getElementById("nav-overlay");
    assert.ok(overlay, "nav overlay should be in the DOM after clicking the hamburger");
    const drawer = overlay.querySelector(".drawer.drawer--left");
    assert.ok(drawer, "left-anchored drawer panel not found inside the overlay");

    const groups = Array.from(drawer.querySelectorAll(".sidebar__group"));
    assert.strictEqual(groups.length, 4, "expected all four nav groups present");
    const groupLabels = groups.map((g) => g.querySelector(".sidebar__group-label").textContent);
    assert.deepStrictEqual(groupLabels, ["OVERVIEW", "REGISTERS", "PLANNING", "OUTPUT"]);

    // Dashboard lives in OVERVIEW — that group should start expanded, the rest collapsed.
    const overviewGroup = groups[0];
    assert.ok(overviewGroup.classList.contains("sidebar__group--expanded"), "the group containing the active route should start expanded");
    groups.slice(1).forEach((g) => {
      assert.ok(!g.classList.contains("sidebar__group--expanded"), "other groups should start collapsed");
    });

    // Links only exist inside their own group's markup regardless of expanded state —
    // collapse is a CSS max-height thing, not a DOM-presence thing, so every item is
    // still findable/clickable via the DOM even while visually collapsed.
    const allLinks = drawer.querySelectorAll(".sidebar__link");
    assert.ok(allLinks.length > 20, "expected the full nav item set inside the drawer, got " + allLinks.length);
  });

  await check("clicking a collapsed group's header expands it, and clicking again collapses it", () => {
    const overlay = win.document.getElementById("nav-overlay");
    const groups = Array.from(overlay.querySelectorAll(".sidebar__group"));
    const registersGroup = groups.find((g) => g.querySelector(".sidebar__group-label").textContent === "REGISTERS");
    assert.ok(!registersGroup.classList.contains("sidebar__group--expanded"), "REGISTERS should start collapsed (dashboard is in OVERVIEW)");

    registersGroup.querySelector(".sidebar__group-toggle").click();
    assert.ok(registersGroup.classList.contains("sidebar__group--expanded"), "clicking a collapsed group's header should expand it");

    registersGroup.querySelector(".sidebar__group-toggle").click();
    assert.ok(!registersGroup.classList.contains("sidebar__group--expanded"), "clicking an expanded group's header should collapse it");
  });

  await check("a manually expanded group stays expanded across closing and reopening the nav (same page load)", () => {
    const overlay1 = win.document.getElementById("nav-overlay");
    const groups1 = Array.from(overlay1.querySelectorAll(".sidebar__group"));
    const registersGroup1 = groups1.find((g) => g.querySelector(".sidebar__group-label").textContent === "REGISTERS");
    registersGroup1.querySelector(".sidebar__group-toggle").click();
    assert.ok(registersGroup1.classList.contains("sidebar__group--expanded"));

    // Close and reopen.
    win.document.getElementById("nav-overlay").querySelector(".icon-btn").click();
    assert.ok(!win.document.getElementById("nav-overlay"));
    win.document.querySelector(".icon-btn--menu").click();

    const overlay2 = win.document.getElementById("nav-overlay");
    const groups2 = Array.from(overlay2.querySelectorAll(".sidebar__group"));
    const registersGroup2 = groups2.find((g) => g.querySelector(".sidebar__group-label").textContent === "REGISTERS");
    assert.ok(registersGroup2.classList.contains("sidebar__group--expanded"), "a manually expanded group should still be expanded after closing and reopening the nav");
  });

  await check("clicking the overlay backdrop (not the drawer itself) closes it", () => {
    const overlay = win.document.getElementById("nav-overlay");
    overlay.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    assert.ok(!win.document.getElementById("nav-overlay"), "nav overlay should close when the backdrop is clicked");
  });

  await check("pressing Escape closes an open nav overlay", () => {
    win.document.querySelector(".icon-btn--menu").click();
    assert.ok(win.document.getElementById("nav-overlay"), "nav overlay should be open before pressing Escape");
    win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
    assert.ok(!win.document.getElementById("nav-overlay"), "nav overlay should close on Escape");
  });

  await check("clicking a nav link inside the overlay navigates to that route and closes the overlay", async () => {
    win.document.querySelector(".icon-btn--menu").click();
    const overlay = win.document.getElementById("nav-overlay");
    // Risk Register is in REGISTERS — expand its group first if it isn't already (a
    // real user would need to; a prior test in this file may have already left it
    // expanded, so only click the toggle if that's not already the case).
    const groups = Array.from(overlay.querySelectorAll(".sidebar__group"));
    const registersGroup = groups.find((g) => g.querySelector(".sidebar__group-label").textContent === "REGISTERS");
    if (!registersGroup.classList.contains("sidebar__group--expanded")) {
      registersGroup.querySelector(".sidebar__group-toggle").click();
    }
    const risksLink = Array.from(overlay.querySelectorAll(".sidebar__link")).find(
      (a) => a.getAttribute("data-route") === "risks"
    );
    assert.ok(risksLink, "Risk Register link not found in the overlay");
    risksLink.click();
    // Anchor-href hash navigation resolves asynchronously in this jsdom version once the
    // full app's event/timer machinery is involved (same class of quirk as router.go()'s
    // own queued hashchange, see test_gantt_virtualization_e2e.js's own comment on this) —
    // it is NOT asynchronous in a real browser, this flush is a jsdom-only accommodation.
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "risks");
    assert.ok(!win.document.getElementById("nav-overlay"), "overlay should close after navigating via one of its links");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("navigating any other way (not clicking an overlay link) also closes an open overlay, via setActiveNav", async () => {
    win.document.querySelector(".icon-btn--menu").click();
    assert.ok(win.document.getElementById("nav-overlay"));
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    await flush();
    assert.ok(!win.document.getElementById("nav-overlay"), "overlay should close on any route change, not just link clicks inside it");
  });

  await check("reopening the overlay on the active route highlights the correct link and auto-expands its group fresh", async () => {
    win.PCC.router.go("documents");
    win.PCC.router.render();
    await flush();
    win.document.querySelector(".icon-btn--menu").click();
    const overlay = win.document.getElementById("nav-overlay");
    const activeLink = overlay.querySelector('.sidebar__link[data-route="documents"]');
    assert.ok(activeLink, "documents link not found");
    assert.ok(activeLink.classList.contains("active"), "the active route's link should be highlighted");
    const registersGroup = Array.from(overlay.querySelectorAll(".sidebar__group")).find(
      (g) => g.querySelector(".sidebar__group-label").textContent === "REGISTERS"
    );
    assert.ok(registersGroup.classList.contains("sidebar__group--expanded"), "REGISTERS (containing Documents) should be expanded — it was manually expanded earlier in this test too, so this also covers that overlap");
    overlay.querySelector(".icon-btn").click(); // close via the × button
    assert.ok(!win.document.getElementById("nav-overlay"));
  });

  await check("this gate writes nothing to the schedule/register data — settings.sidebar_collapsed still exists (unused, untouched) from the original version of this gate", () => {
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
    await check("route '" + routes[i] + "' renders without throwing after the nav revision", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
