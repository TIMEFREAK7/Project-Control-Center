// Gate 7.5d (2026-11-28): the Cost and supply page pass (Cost Tracking, Commitments, Resources,
// Vendors, Vendor Performance Centre). Cost money carries the project's currency and totals stay
// per currency (an INR + USD sum was one wrong figure); money shows whole units; a portfolio
// CPI/SPI is withheld when currencies differ. Rows keep one visible action plus "⋯"; Vendor List
// has one primary; no sentence under a title; sentence-case labels; figures out of the code
// font; flat sections; empty states offer their action; dates in the app's format.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    console.log("FAIL:", label, "\n     ", e.message);
  }
}
const ACRONYMS = new Set(["CPI", "SPI", "EVM", "INR", "USD", "VAC", "EAC", "BAC", "PO"]);
const shouty = (t) => t.split(/[^A-Za-z]+/).some((w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w) && !ACRONYMS.has(w));

(async () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously", resources: "usable", pretendToBeVisual: true });
  dom.window.indexedDB = new FDBFactory();
  const errors = [];
  dom.window.onerror = (m) => errors.push(m);
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  const win = dom.window;
  const doc = win.document;
  const S = win.PCC.store;
  const outlet = () => doc.getElementById("page-outlet");
  const go = async (route) => { win.PCC.router.go(route); await flush(); };
  const btn = (text, root) => Array.from((root || outlet()).querySelectorAll("button")).find((b) => b.textContent.trim() === text);
  const tab = async (name) => { btn(name).click(); await flush(); };
  const n = (v) => Number(v).toLocaleString();
  const noSubtitle = () => {
    const h = outlet().querySelector("h2");
    return !(h && h.nextElementSibling && h.nextElementSibling.tagName === "P");
  };

  // ---- empty states (one project, nothing else) ----
  S.update((d) => d.projects.push(S.newProject({ name: "Empty Co", status: "on_track" })));
  await flush();
  const EMPTY = [
    ["cost", null, "+ Add Budget Item"],
    ["cost", "Actuals", "+ Log Actual Cost"],
    ["commitments", null, "+ Add Commitment"],
    ["commitments", "Packages", "+ Add Package"],
    ["resources", null, "+ Add Resource"],
    ["vendors", "Vendor List", "+ Add Vendor"],
  ];
  for (const [route, t, label] of EMPTY) {
    await check(route + (t ? " / " + t : "") + " empty: the empty state offers " + label + ", with no 'Click …' line", async () => {
      await go(route);
      if (t) await tab(t);
      const es = outlet().querySelector(".empty-state");
      assert.ok(es && btn(label, es), "got: " + (es && es.textContent));
      assert.ok(es.textContent.indexOf("Click") === -1, "instruction left: " + es.textContent);
    });
  }
  await check("Vendor Performance Centre with no vendors: one empty state with Go to Vendors, no subtitle", async () => {
    await go("vendorPerformanceCentre");
    const es = outlet().querySelector(".empty-state");
    assert.ok(es && btn("Go to Vendors", es), "got: " + (es && es.textContent));
    assert.ok(noSubtitle(), "subtitle still there");
  });

  // ---- seed: an INR project and a USD project ----
  S.update((d) => {
    d.projects = [];
    const v = S.newVendor({ vendor_code: "V-1", vendor_name: "Apex Steel", status: "active" });
    d.vendors.push(v);
    [["Pune Tower", "INR", 1000000, 250000.4], ["Austin Plant", "USD", 50000, 12000.6]].forEach(([name, cur, planned, spent], i) => {
      const p = S.newProject({ name, currency: cur, status: "on_track", start_date: "2026-01-01" });
      d.projects.push(p);
      const s = S.newSchedule({ project_id: p.id, name: "Rev 0" });
      d.schedules.push(s);
      const a = S.newActivity({ project_id: p.id, schedule_id: s.id, name: "Work " + i, activity_type: "task", duration: 10, planned_start: "2026-01-05", planned_finish: "2026-01-16", percent_complete: 50 });
      d.activities.push(a);
      const b = S.newCostBudgetItem({ project_id: p.id, name: "Line " + i, category: "materials", planned_amount: planned, activity_id: a.id });
      d.cost_budget_items.push(b);
      const c = S.newCommitment({ project_id: p.id, vendor_id: v.id, type: "purchase_order", po_contract_number: "PO-" + i, commitment_date: "2026-01-02", committed_value: planned, approved_value: planned, status: "approved" });
      d.commitments.push(c);
      d.cost_actuals.push(S.newCostActual({ project_id: p.id, budget_item_id: b.id, commitment_id: c.id, category: "materials", description: "Bill " + i, amount: spent, date: "2026-01-10" }));
      if (i === 0) {
        const r = S.newResource({ name: "Crew A", type: "employee", unit: "crew", max_availability: 1 });
        d.resources.push(r);
        d.resource_assignments.push(S.newResourceAssignment({ resource_id: r.id, activity_id: a.id, quantity: 2 }));
        d.resource_unavailability.push(S.newResourceUnavailability({ resource_id: r.id, start_date: "2026-01-06", end_date: "2026-01-07", quantity: 1, reason: "Training" }));
      }
    });
    d.vendor_performance.push(S.newVendorPerformance({ vendor_id: v.id, project_id: d.projects[0].id, quality_rating: 4, delivery_rating: 3, communication_rating: 4, safety_rating: 5, review_date: "2026-01-12" }));
  });
  await flush();

  await check("Cost rows carry their project's currency; amounts show whole units", async () => {
    await go("cost");
    const text = outlet().textContent;
    assert.ok(text.indexOf("Planned INR " + n(1000000)) !== -1, "INR row: " + text.slice(0, 300));
    assert.ok(text.indexOf("Planned USD " + n(50000)) !== -1, "USD row");
    await tab("Actuals");
    const t2 = outlet().textContent;
    assert.ok(t2.indexOf("INR " + n(250000)) !== -1 && t2.indexOf("USD " + n(12001)) !== -1, "actuals rounded with currency: " + t2.slice(0, 400));
    assert.ok(!/\d\.\d\d?\b/.test(Array.from(outlet().querySelectorAll(".detail-card")).map((e) => e.textContent).join(" ")), "decimals left on a money figure");
    assert.ok(t2.indexOf("2026-01-10") === -1, "raw ISO date on an actual");
  });

  await check("Cost Summary totals are per currency, never one mixed sum", async () => {
    await go("cost");
    await tab("Summary");
    const v = Array.from(outlet().querySelectorAll(".kpi-card")).find((k) => k.querySelector(".kpi-card__label").textContent === "Total budgeted");
    assert.ok(v, "no 'Total budgeted' tile");
    assert.strictEqual(v.querySelector(".kpi-card__value").textContent, "INR " + n(1000000) + " · USD " + n(50000));
  });

  await check("Cost EVM: money per currency; no portfolio CPI/SPI across two currencies", async () => {
    await go("cost");
    await tab("EVM");
    const kpis = {};
    outlet().querySelectorAll(".kpi-card").forEach((k) => (kpis[k.querySelector(".kpi-card__label").textContent] = k.querySelector(".kpi-card__value").textContent));
    assert.ok(/^INR [\d,]+ · USD [\d,]+$/.test(kpis["Earned value"]), "EV: " + kpis["Earned value"]);
    assert.strictEqual(kpis["CPI"], "—");
    assert.strictEqual(kpis["SPI"], "—");
    assert.ok(outlet().textContent.indexOf("different currencies") !== -1, "no explanation for the missing CPI/SPI");
  });

  await check("Cost EVM with one currency still shows the portfolio CPI", async () => {
    S.update((d) => d.projects.forEach((p) => (p.currency = "INR")));
    await go("cost");
    await tab("EVM");
    const cpi = Array.from(outlet().querySelectorAll(".kpi-card")).find((k) => k.querySelector(".kpi-card__label").textContent === "CPI");
    assert.ok(/^\d+\.\d\d$/.test(cpi.querySelector(".kpi-card__value").textContent), "CPI: " + cpi.textContent);
    S.update((d) => (d.projects[1].currency = "USD"));
    await flush();
  });

  const ROWS = [
    ["cost", null, ".detail-card"],
    ["cost", "Actuals", ".detail-card"],
    ["commitments", null, ".detail-card"],
    ["resources", null, ".detail-card"],
    ["resources", "Assignments", ".detail-card"],
    ["resources", "Unavailability", ".detail-card"],
    ["vendors", "Vendor List", ".project-card"],
  ];
  for (const [route, t, sel] of ROWS) {
    await check(route + (t ? " / " + t : "") + ": rows have no loose Edit/Delete; ⋯ holds them", async () => {
      await go(route);
      if (t) await tab(t);
      const row = outlet().querySelector(sel);
      assert.ok(row, "no row");
      const loose = Array.from(row.querySelectorAll(".btn")).map((b) => b.textContent.trim()).filter((x) => x === "Edit" || x === "Delete");
      assert.deepStrictEqual(loose, []);
      row.querySelector('[aria-label="More actions"]').click();
      await flush();
      assert.deepStrictEqual(Array.from(row.querySelectorAll(".card-menu__item")).map((b) => b.textContent.trim()), ["Edit", "Delete"]);
    });
  }

  await check("Vendor List: one primary action on the page", async () => {
    await go("vendors");
    await tab("Vendor List");
    const prim = Array.from(outlet().querySelectorAll(".btn--primary")).map((b) => b.textContent.trim());
    assert.deepStrictEqual(prim, ["+ Add Vendor"]);
  });

  await check("Vendor dashboard: one figure strip, no boxed tiles, no repeated heading", async () => {
    await go("vendors");
    assert.ok(outlet().querySelector(".kpi-grid"), "no figure strip");
    assert.ok(outlet().textContent.indexOf("Vendor Dashboard") === -1, "heading still repeats the tab");
    const boxed = Array.from(outlet().querySelectorAll(".panel")).filter((p) => !p.classList.contains("panel--flat") && !p.classList.contains("empty-state"));
    assert.strictEqual(boxed.length, 0, boxed.length + " boxed tiles");
  });

  const PAGES = [["cost", "Summary"], ["cost", "EVM"], ["commitments", null], ["resources", "Leveling"], ["vendors", null], ["vendorPerformanceCentre", null]];
  for (const [route, t] of PAGES) {
    await check(route + (t ? " / " + t : "") + ": no subtitle, sentence-case labels, no code-font figures, sections flat", async () => {
      await go(route);
      if (t) await tab(t);
      assert.ok(noSubtitle(), "subtitle still there");
      const labels = Array.from(outlet().querySelectorAll(".kpi-card__label")).map((e) => e.textContent).filter(shouty);
      assert.deepStrictEqual(labels, []);
      assert.strictEqual(outlet().querySelectorAll(".kpi-card__value.mono").length, 0, "figures still mono");
      const boxed = Array.from(outlet().querySelectorAll(".panel")).filter((p) => !p.classList.contains("panel--flat") && !p.classList.contains("empty-state") && !p.querySelector("form"));
      assert.strictEqual(boxed.length, 0, boxed.map((p) => (p.querySelector("h3,h4") || p).textContent.slice(0, 40)).join(" | "));
    });
  }

  await check("Commitments rows and Resources periods show dates in the app's format", async () => {
    await go("commitments");
    assert.ok(outlet().textContent.indexOf("2026-01-02") === -1, "raw ISO commitment date");
    await go("resources");
    await tab("Unavailability");
    assert.ok(outlet().textContent.indexOf("2026-01-06") === -1, "raw ISO period date");
  });

  await check("no 'word(s)' text left in the five pages' source", () => {
    const dir = path.join(__dirname, "..", "react", "src", "pages");
    const bad = [];
    for (const f of ["Cost.tsx", "Commitments.tsx", "Resources.tsx", "VendorPerformanceCentre.tsx"]) {
      fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((l, i) => {
        if (!/^\s*(\/\/|\*)/.test(l) && /[a-z]\((s|ies)\)/.test(l)) bad.push(f + ":" + (i + 1));
      });
    }
    assert.deepStrictEqual(bad, []);
  });

  await check("no uncaught errors", () => {
    assert.deepStrictEqual(errors, []);
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
