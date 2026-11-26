// Gate 6.4 (2026-11-26): Commitments showed "$" for every project (its own formatMoney
// hardcoded it) and its KPI totals summed every visible commitment into ONE figure even
// across currencies. Now each row uses its project's currency, like Cost/Portfolio/Reports,
// and totals are per currency, never one mixed sum. Against the real bundled index.html.
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
  for (let i = 0; i < 12; i++) await sleep(0);
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
  const dom = new JSDOM(fs.readFileSync(INDEX_PATH, "utf8"), { url: "http://localhost/", runScripts: "dangerously", resources: "usable", pretendToBeVisual: true });
  dom.window.indexedDB = new FDBFactory();
  const errors = [];
  dom.window.onerror = (m) => errors.push(String(m));
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  const win = dom.window;
  const S = win.PCC.store;
  const outlet = () => win.document.getElementById("page-outlet");
  const n = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }); // device locale, like the app

  S.update((d) => {
    d.projects.push({ id: "pin", name: "Mumbai Tower", currency: "INR", archived: false, status: "on_track", progress: 0, attachments: [] });
    d.projects.push({ id: "pus", name: "Austin Plant", currency: "USD", archived: false, status: "on_track", progress: 0, attachments: [] });
    d.commitments.push(S.newCommitment({ project_id: "pin", po_contract_number: "PO-IN-1", type: "purchase_order", status: "issued", committed_value: 1200000, approved_value: 1000000 }));
    d.commitments.push(S.newCommitment({ project_id: "pus", po_contract_number: "PO-US-1", type: "purchase_order", status: "issued", committed_value: 50000, approved_value: 50000 }));
  });

  function rowText(po) {
    const card = Array.from(outlet().querySelectorAll(".detail-card")).find((c) => c.textContent.indexOf(po) !== -1);
    return card ? card.textContent : "";
  }
  function kpi(label) {
    const card = Array.from(outlet().querySelectorAll(".kpi-card")).find((c) => c.querySelector(".kpi-card__label").textContent === label);
    return card ? card.querySelector(".kpi-card__value").textContent : null;
  }

  await check("each commitment row shows money in its own project's currency, never '$'", async () => {
    win.PCC.router.go("commitments");
    await flush();
    assert.ok(rowText("PO-IN-1").indexOf("Committed INR " + n(1200000)) !== -1, rowText("PO-IN-1"));
    assert.ok(rowText("PO-US-1").indexOf("Committed USD " + n(50000)) !== -1, rowText("PO-US-1"));
    assert.strictEqual(outlet().textContent.indexOf("$"), -1, "a '$' is still shown");
  });

  await check("with both projects visible, totals are per currency, not one mixed sum", () => {
    assert.strictEqual(kpi("TOTAL COMMITTED"), "INR " + n(1200000) + " · USD " + n(50000));
    assert.strictEqual(kpi("TOTAL APPROVED"), "INR " + n(1000000) + " · USD " + n(50000));
  });

  await check("filtered to one project, the total is that project's currency alone", async () => {
    win.PCC.commitments.filterByProject("pus");
    win.PCC.router.go("commitments");
    await flush();
    assert.strictEqual(kpi("TOTAL COMMITTED"), "USD " + n(50000));
  });

  await check("no uncaught errors", () => assert.strictEqual(errors.length, 0, errors.join(" | ")));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
