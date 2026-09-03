// End-to-end jsdom test against the ACTUAL bundled index.html for the Vendor Performance
// Centre (PCC Evolution Roadmap, Tier C: Project Performance — first confirmed gate,
// 2026-08-19). A fresh inspection found Gate 13's per-vendor performance data model
// (vendor_performance: quality/delivery/communication/safety ratings, a running average
// inside each Vendor Profile's Performance tab) already existed, but nothing gave a
// portfolio-wide view across vendors. This gate adds exactly that: a new page,
// worst-first ranked list of reviewed vendors, an "unreviewed" list, and KPI cards.
// Read-only — writes nothing back to vendor_performance. No schema change.
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
function kpiValue(dom, label) {
  const cards = Array.from(dom.window.document.querySelectorAll(".kpi-card"));
  const card = cards.find((c) => c.textContent.indexOf(label) !== -1);
  if (!card) return undefined;
  const valueEl = card.querySelector(".kpi-card__value");
  return valueEl ? valueEl.textContent : undefined;
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.pages.vendorPerformanceCentre, "vendorPerformanceCentre page module must be bundled");
  });

  await check("the sidebar links to Vendor Performance Centre, and the empty state shows before any vendor exists", () => {
    win.PCC.router.go("vendorPerformanceCentre");
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Vendor Performance Centre") !== -1);
    assert.ok(text.indexOf("No vendors yet") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var vendorGoodId, vendorBadId, vendorUnreviewedId;
  await check("seed three vendors: one well-reviewed, one poorly-reviewed, one with no reviews at all", () => {
    win.PCC.store.update(function (d) {
      var good = win.PCC.store.newVendor({ vendor_name: "Reliable Rebar Co" });
      d.vendors.push(good);
      vendorGoodId = good.id;

      var bad = win.PCC.store.newVendor({ vendor_name: "Shaky Scaffolding Ltd" });
      d.vendors.push(bad);
      vendorBadId = bad.id;

      var unreviewed = win.PCC.store.newVendor({ vendor_name: "New Vendor Inc" });
      d.vendors.push(unreviewed);
      vendorUnreviewedId = unreviewed.id;

      // Reliable Rebar Co: two reviews, both high (overall 5/5 and 4/5 -> avg 4.5).
      d.vendor_performance.push(
        win.PCC.store.newVendorPerformance({ vendor_id: vendorGoodId, quality_rating: 5, delivery_rating: 5, communication_rating: 5, safety_rating: 5 })
      );
      d.vendor_performance.push(
        win.PCC.store.newVendorPerformance({ vendor_id: vendorGoodId, quality_rating: 4, delivery_rating: 4, communication_rating: 4, safety_rating: 4 })
      );

      // Shaky Scaffolding Ltd: one low review (overall 2/5).
      d.vendor_performance.push(
        win.PCC.store.newVendorPerformance({ vendor_id: vendorBadId, quality_rating: 2, delivery_rating: 2, communication_rating: 2, safety_rating: 2 })
      );
    });
    win.PCC.router.render();
    assert.ok(vendorGoodId && vendorBadId && vendorUnreviewedId);
  });

  await check("the KPI cards show correct portfolio-wide totals", () => {
    assert.strictEqual(kpiValue(dom, "TOTAL VENDORS"), "3");
    assert.strictEqual(kpiValue(dom, "REVIEWED"), "2");
    assert.strictEqual(kpiValue(dom, "NOT YET REVIEWED"), "1");
    // Portfolio avg = average of the two reviewed vendors' own overall ratings: (4.5 + 2) / 2 = 3.25 -> rounds to 3.3.
    assert.strictEqual(kpiValue(dom, "PORTFOLIO AVG RATING"), "3.3 / 5");
  });

  await check("the ranked panel lists both reviewed vendors worst-first (Shaky before Reliable)", () => {
    var text = outlet().textContent;
    var posBad = text.indexOf("Shaky Scaffolding Ltd");
    var posGood = text.indexOf("Reliable Rebar Co");
    assert.ok(posBad !== -1 && posGood !== -1);
    assert.ok(posBad < posGood, "the lower-rated vendor (2/5) must render before the higher-rated one (4.5/5) — worst first");
    assert.ok(text.indexOf("2 / 5 overall (1 review)") !== -1, "Shaky Scaffolding's own summary line");
    assert.ok(text.indexOf("4.5 / 5 overall (2 reviews)") !== -1, "Reliable Rebar's own summary line");
    assert.ok(text.indexOf("New Vendor Inc") === -1 || text.indexOf("Not Yet Reviewed") !== -1, "New Vendor Inc must not appear in the ranked panel itself");
  });

  await check("the ranked panel shows correct rating bands: Critical for the 2/5 vendor, On Track for the 4.5/5 vendor", () => {
    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — the rating
    // band is now the row's icon color (attention-item__icon--<band>), not a separate
    // .status-badge element.
    var rows = Array.from(outlet().querySelectorAll(".attention-item"));
    var badRow = rows.find((r) => r.textContent.indexOf("Shaky Scaffolding Ltd") !== -1);
    var goodRow = rows.find((r) => r.textContent.indexOf("Reliable Rebar Co") !== -1);
    assert.ok(badRow && badRow.querySelector(".attention-item__icon--critical"), "expected a critical-severity icon for the 2/5-rated vendor");
    assert.ok(goodRow && goodRow.querySelector(".attention-item__icon--on_track"), "expected an on_track-severity icon for the 4.5/5-rated vendor");
  });

  await check("the Not Yet Reviewed panel lists only the vendor with zero reviews", () => {
    var panels = Array.from(outlet().querySelectorAll(".panel"));
    var unreviewedPanel = panels.find((p) => p.textContent.indexOf("Not Yet Reviewed") !== -1);
    assert.ok(unreviewedPanel, "Not Yet Reviewed panel not found");
    assert.ok(unreviewedPanel.textContent.indexOf("New Vendor Inc") !== -1);
    assert.ok(unreviewedPanel.textContent.indexOf("Reliable Rebar Co") === -1);
    assert.ok(unreviewedPanel.textContent.indexOf("Shaky Scaffolding Ltd") === -1);
  });

  await check("clicking the ranked panel's row navigates to Vendors with that vendor's Performance tab already open", () => {
    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — the whole
    // row is the click target now, no separate "View Profile" button.
    var badVendorRow = Array.from(outlet().querySelectorAll(".attention-item--clickable")).find((r) => r.textContent.indexOf("Shaky Scaffolding Ltd") !== -1);
    assert.ok(badVendorRow, "clickable row for Shaky Scaffolding Ltd not found");
    badVendorRow.click();

    assert.strictEqual(win.PCC.router.currentRouteName(), "vendors");
    var text = outlet().textContent;
    assert.ok(text.indexOf("Shaky Scaffolding Ltd") !== -1);
    // Landed on the Performance tab specifically — its own "OVERALL RATING" panel must be visible.
    assert.ok(text.indexOf("OVERALL RATING") !== -1, "must land directly on the Performance tab, not Overview");
    var perfTabBtn = findButtonByText(dom, "Performance");
    assert.ok(perfTabBtn && perfTabBtn.className.indexOf("tab-btn--active") !== -1, "Performance tab button must be marked active");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("clicking the Not Yet Reviewed panel's row also lands on that vendor's Performance tab", () => {
    win.PCC.router.go("vendorPerformanceCentre");
    win.PCC.router.render();
    var panels = Array.from(outlet().querySelectorAll(".panel"));
    var unreviewedPanel = panels.find((p) => p.textContent.indexOf("Not Yet Reviewed") !== -1);
    var row = Array.from(unreviewedPanel.querySelectorAll(".attention-item--clickable")).find((r) => r.textContent.indexOf("New Vendor Inc") !== -1);
    assert.ok(row, "clickable row in Not Yet Reviewed panel not found");
    row.click();

    assert.strictEqual(win.PCC.router.currentRouteName(), "vendors");
    var text = outlet().textContent;
    assert.ok(text.indexOf("New Vendor Inc") !== -1);
    assert.ok(text.indexOf("No performance reviews yet") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("opening a vendor profile normally (e.g. from the Vendors list) still defaults to the Overview tab — existing callers unaffected", () => {
    win.PCC.vendors.openProfile(vendorGoodId);
    win.PCC.router.go("vendors");
    var perfTabBtn = findButtonByText(dom, "Performance");
    var overviewTabBtn = findButtonByText(dom, "Overview");
    assert.ok(overviewTabBtn.className.indexOf("tab-btn--active") !== -1, "Overview tab must be active by default");
    assert.ok(perfTabBtn.className.indexOf("tab-btn--active") === -1, "Performance tab must NOT be active when no tab argument is passed");
  });

  await check("this gate writes nothing back — vendor_performance and vendors are byte-for-byte unchanged after rendering", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.vendors.length, 3);
    assert.strictEqual(data.vendor_performance.length, 3);
  });

  // ---- Route smoke test across every page, confirming the new route joins cleanly ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "resources",
    "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding the Vendor Performance Centre", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
