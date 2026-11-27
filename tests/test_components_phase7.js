// Gate 7.4 (2026-11-27): Phase 7 shared components. Three button levels (no blur on primary),
// one control height per density shared by buttons/inputs/selects, every search box named
// (icon + aria-label, Aditya's call), one tab design (underline, no blur) everywhere, status as a
// dot + text inside tables, KPI figures as one hairline strip (two columns on phones), tables
// with a sticky header + right-aligned figures, quiet one-line empty states, 18 px checkboxes.
// Pixel sizes (24 px targets) need a real browser: tests/visual/shots.js --audit (HANDOFF.md).
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const ROOT = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "src", "css", "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const page = (n) => fs.readFileSync(path.join(ROOT, "react", "src", "pages", n), "utf8");

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
// Top-level and @media-nested rules whose selector matches `re`, as "selector { body }".
function rules(re) {
  const out = [];
  const r = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = r.exec(css))) if (re.test(m[1].trim())) out.push(m[1].trim() + " {" + m[2] + "}");
  return out;
}
// Every @media (q) block's text, joined (styles.css has several blocks per breakpoint).
function mediaBlock(q) {
  const out = [];
  for (let i = css.indexOf("@media (" + q + ")"); i >= 0; i = css.indexOf("@media (" + q + ")", i + 1)) {
    let depth = 0;
    for (let j = css.indexOf("{", i); j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) { out.push(css.slice(i, j)); break; }
    }
  }
  assert.ok(out.length, "no @media (" + q + ")");
  return out.join("\n");
}

(async () => {
  await check("styles.css has no stray byte-order mark (U+FEFF mid-file silently drops the next rule)", () => {
    const raw = fs.readFileSync(path.join(ROOT, "src", "css", "styles.css"), "utf8");
    const at = raw.indexOf("﻿", 1);
    assert.strictEqual(at, -1, "U+FEFF at char " + at + ": " + raw.slice(at, at + 60));
  });

  // ---- CSS: buttons and controls ----
  await check("primary button: plain hover, no blurred ::before layer, no filter anywhere on .btn rules", () => {
    const b = rules(/(^|[\s,])\.btn(--\w+)?([:\s,.]|$)/);
    assert.ok(!b.some((r) => /filter\s*:/.test(r)), b.filter((r) => /filter/.test(r)).join("\n"));
    assert.ok(!rules(/\.btn--primary::before/).length, ".btn--primary::before still exists");
    assert.ok(rules(/\.btn--primary:hover/).some((r) => /background-color/.test(r)), "no plain primary hover colour");
  });

  await check("three button levels: primary (ink), secondary (.btn--ghost, bordered), quiet (.btn--quiet, no border)", () => {
    const q = rules(/^\.btn--quiet$/).join("\n");
    assert.ok(/background-color:\s*transparent/.test(q) && /border-color:\s*transparent/.test(q), "no .btn--quiet: " + q);
    assert.ok(/border-color:\s*var\(--divider\)/.test(rules(/^\.btn--ghost$/).join("")), ".btn--ghost lost its border");
  });

  await check("one control height per density (--control-h) shared by buttons, inputs and selects", () => {
    const root = rules(/^:root$/).join("\n");
    assert.ok(/--control-h:\s*\d+px/.test(root), "no --control-h in :root");
    assert.ok(rules(/^\[data-density="compact"\]$/).some((r) => /--control-h/.test(r)), "compact density doesn't set --control-h");
    assert.ok(rules(/^\[data-density="spacious"\]$/).some((r) => /--control-h/.test(r)), "spacious density doesn't set --control-h");
    assert.ok(rules(/^\.btn$/).some((r) => /min-height:\s*var\(--control-h\)/.test(r)), ".btn doesn't use --control-h");
    const ctl = rules(/main\s+select|\.toolbar\s+select/).join("\n");
    assert.ok(/height:\s*var\(--control-h\)/.test(ctl), "selects/inputs don't use --control-h");
  });

  await check("checkboxes and radios render at 18 px", () => {
    assert.ok(rules(/input\[type="checkbox"\]/).some((r) => /width:\s*18px/.test(r) && /height:\s*18px/.test(r)));
  });

  // ---- CSS: tabs, status, KPI, tables, empty states ----
  await check("tabs: plain underline, no blur/contrast filter", () => {
    const t = rules(/\.tab-btn/);
    assert.ok(t.length, "no .tab-btn rules");
    assert.ok(!t.some((r) => /filter\s*:/.test(r)), "a .tab-btn rule still sets filter");
  });

  await check("status inside a table cell is a dot plus text; neutral states (complete, info) carry no colour", () => {
    const td = rules(/td \.status-badge/).join("\n");
    assert.ok(/background(-color)?:\s*(transparent|none)/.test(td), "pill background still drawn in tables: " + td);
    assert.ok(rules(/td \.status-badge::before/).some((r) => /border-radius:\s*50%/.test(r)), "no dot");
    const neutral = rules(/td \.status-badge--(complete|info)/).join("\n");
    assert.ok(/var\(--text-secondary\)/.test(neutral), "neutral states still coloured in tables: " + neutral);
  });

  await check("KPI figures: one strip with hairline dividers on desktop, no card per figure", () => {
    const g = rules(/^\.kpi-grid$/).join("\n");
    assert.ok(/grid-auto-flow:\s*column/.test(g), ".kpi-grid is not a single row: " + g);
    const c = rules(/^\.kpi-card$/).join("\n");
    assert.ok(/border:\s*(none|0)/.test(c) && /border-left:\s*1px solid var\(--divider\)/.test(c), ".kpi-card still a bordered card: " + c);
  });

  await check("KPI figures on phones: a compact two-column grid", () => {
    assert.ok(/\.kpi-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/.test(mediaBlock("max-width: 780px")), "phone tier is not two columns");
    assert.ok(!/\.kpi-grid\s*\{[^}]*grid-template-columns:\s*1fr/.test(mediaBlock("max-width: 420px")), "420px tier still collapses KPIs to one column");
  });

  await check("tables: sticky header everywhere, right-aligned figures (.num), full-height sort buttons", () => {
    assert.ok(rules(/^\.data-table th$/).some((r) => /position:\s*sticky/.test(r)), "header not sticky by default");
    assert.ok(rules(/\.data-table (td|th)\.num/).some((r) => /text-align:\s*right/.test(r)), "no .num alignment");
    assert.ok(rules(/\.data-table__sort-btn$/).some((r) => /min-height:\s*24px/.test(r)), "sort button under 24px");
  });

  await check("empty states: one quiet left-aligned line, no dashed box or big icon, with an action slot", () => {
    const e = rules(/^\.empty-state$/).join("\n");
    assert.ok(!/dashed/.test(e) && /text-align:\s*left/.test(e), e);
    assert.ok(!rules(/^\.empty-state::before$/).length, "big centred icon still there");
    assert.ok(rules(/\.empty-state__action/).length, "no action slot");
  });

  // ---- page source: tabs and zoom ----
  await check("Executive Center and Portfolio switch views with the underline tabs, not primary/ghost buttons", () => {
    const bad = [];
    for (const n of ["ExecutiveCenter.tsx", "Portfolio.tsx"]) {
      if (/\?\s*"btn--primary"\s*:\s*"btn--ghost"/.test(page(n))) bad.push(n);
    }
    assert.deepStrictEqual(bad, []);
  });

  await check("Gantt zoom shows the selected level with aria-pressed, not the primary fill", () => {
    const s = page("Schedule.tsx");
    assert.ok(!/zoom === z \? "btn--primary"/.test(s), "zoom still uses btn--primary");
    assert.ok(/aria-pressed=\{zoom === z\}/.test(s), "zoom buttons have no aria-pressed");
  });

  // ---- DOM: every visible field has an accessible name ----
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
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
  let projId;
  S.update((d) => {
    const p = S.newProject({ name: "Riverside Tower", status: "at_risk" });
    d.projects.push(p);
    projId = p.id;
    const s = S.newSchedule({ project_id: p.id, name: "Rev 0" });
    d.schedules.push(s);
    d.activities.push(S.newActivity({ project_id: p.id, schedule_id: s.id, name: "Excavation", activity_type: "task", status: "not_started", planned_start: "2026-08-01", planned_finish: "2026-08-10" }));
    // Documents and Vendors only draw their toolbar once a record exists.
    d.documents.push(S.newDocument({ project_id: p.id, filename: "drawing.pdf" }));
    d.vendors.push(S.newVendor({ name: "Acme Steel" }));
  });
  await flush();

  const named = (el) =>
    !!((el.getAttribute("aria-label") || "").trim() || (el.labels && el.labels.length && el.labels[0].textContent.trim()) ||
      (el.getAttribute("title") || "").trim() || el.getAttribute("aria-labelledby"));
  const fields = () => Array.from(doc.querySelectorAll("#page-outlet input:not([type=hidden]), #page-outlet select, #page-outlet textarea"))
    .filter((el) => !el.closest("[hidden], .modal-overlay") && el.style.display !== "none");

  async function visit(route, tab) {
    if (route === "schedule") win.PCC.schedule.viewProject(projId);
    win.PCC.router.go(route);
    await flush();
    if (tab) {
      const b = Array.from(doc.querySelectorAll("#page-outlet .tab-btn")).find((x) => x.textContent.trim() === tab);
      if (b) { b.click(); await flush(); }
    }
  }

  const BASELINE = [["dashboard"], ["portfolio"], ["schedule", "Activities"], ["schedule", "Gantt"], ["risks"], ["executiveCenter"], ["documents"], ["settings"]];
  const SEARCH = ["changeOrders", "commitments", "cost", "dailylog", "decisionRegister", "documentTypes", "documents", "knowledgeBase", "lessonsLearned",
    "meetings", "organizations", "portfolio", "resources", "rfis", "risks", "vendors"];

  await check("every visible input and select on the eight baseline screens has an accessible name (not placeholder-only)", async () => {
    const bad = [];
    for (const [route, tab] of BASELINE) {
      await visit(route, tab);
      fields().filter((el) => !named(el)).forEach((el) => bad.push(route + (tab ? "/" + tab : "") + ": " + el.tagName.toLowerCase() + " '" + (el.placeholder || el.value || "").slice(0, 30) + "'"));
    }
    assert.deepStrictEqual(bad, []);
  });

  await check("every register search box is named and carries the search-icon class (18 boxes on 17 pages incl. Schedule's two)", async () => {
    const bad = [];
    let seen = 0;
    for (const route of SEARCH) {
      await visit(route, route === "vendors" ? "Vendor List" : null);
      const boxes = Array.from(doc.querySelectorAll("#page-outlet .toolbar input[type=text]")).filter((el) => /^(Search|Filter)/.test(el.placeholder || ""));
      if (!boxes.length) bad.push(route + ": no search box rendered");
      boxes.forEach((el) => { seen++; if (!named(el) || !el.classList.contains("search-input")) bad.push(route + ": '" + el.placeholder.slice(0, 24) + "'"); });
    }
    for (const tab of ["Activities", "Gantt"]) {
      await visit("schedule", tab);
      const box = Array.from(doc.querySelectorAll("#page-outlet .toolbar input[type=text]")).find((el) => /^Search/.test(el.placeholder || ""));
      if (!box) bad.push("schedule/" + tab + ": no search box rendered");
      else { seen++; if (!named(box) || !box.classList.contains("search-input")) bad.push("schedule/" + tab); }
    }
    assert.deepStrictEqual(bad, []);
    assert.ok(seen >= 18, "only " + seen + " search boxes checked");
  });

  await check("Executive Center renders its views as .tab-btn in a .tab-bar", async () => {
    await visit("executiveCenter");
    const tabs = doc.querySelectorAll("#page-outlet .tab-bar .tab-btn");
    assert.ok(tabs.length >= 2, "found " + tabs.length);
    assert.ok(doc.querySelector("#page-outlet .tab-bar .tab-btn--active"), "no active tab");
  });

  await check("no page errors while visiting", () => assert.deepStrictEqual(errors, []));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
