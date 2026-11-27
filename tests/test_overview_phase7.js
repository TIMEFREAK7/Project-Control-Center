// Gate 7.5a (2026-11-27): the Overview page pass (Dashboard, My Work, Action Centre, Portfolio,
// Project Workspace, Executive Center; also the mirror app's pages). One primary action per
// view, no sentence under a title that repeats the page, sentence-case labels, section panels
// flattened (.panel--flat), empty states that offer their fixing action, dates in the text face,
// Dashboard's context card working where the title block hides its switcher, and Portfolio's
// phone filters folded so the first project shows without scrolling (measured in Chromium).
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const ROOT = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "src", "css", "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

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
function mediaBlocks(q) {
  const out = [];
  for (let i = css.indexOf("@media (" + q + ")"); i >= 0; i = css.indexOf("@media (" + q + ")", i + 1)) {
    let depth = 0;
    for (let j = css.indexOf("{", i); j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) { out.push(css.slice(i, j)); break; }
    }
  }
  return out.join("\n");
}

// Abbreviations that stay in capitals inside sentence-case labels.
const ACRONYMS = new Set(["SPI", "CPI", "BAC", "EAC", "ETC", "VAC", "EVM", "RFI", "RFIS", "TQ", "TQS", "INR", "PM", "PMS", "WBS", "ID", "KPI", "CO", "NA", "OK", "PCC", "PDF", "CSV", "XML", "XER", "MSP"]);
// Shouting = an all-capitals word of 3+ letters that isn't an abbreviation, even next to a
// mixed-case plural like "RFIs" ("OVERDUE RFIs" slipped past an all-or-nothing check).
function shouty(text) {
  const words = text.trim().split(/[^A-Za-z]+/).filter((w) => w && !/\d/.test(w));
  return words.some((w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w) && !ACRONYMS.has(w));
}

(async () => {
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
  const outlet = () => doc.getElementById("page-outlet");
  const go = async (route) => { win.PCC.router.go(route); await flush(); };
  const btn = (text, root) => Array.from((root || outlet()).querySelectorAll("button")).find((b) => b.textContent.trim() === text);

  // ---- empty states (before any data) ----
  await check("Portfolio with no projects: the empty state offers + Add Project, which opens the form", async () => {
    await go("portfolio");
    const es = outlet().querySelector(".empty-state");
    assert.ok(es, "no empty state");
    const b = btn("+ Add Project", es);
    assert.ok(b, "no + Add Project inside the empty state: " + es.textContent);
    b.click();
    await flush();
    assert.ok(outlet().querySelector("form"), "the project form did not open");
  });

  for (const route of ["executiveCenter", "projectWorkspace"]) {
    await check(route + " with no projects: the empty state offers Go to Portfolio, which navigates there", async () => {
      await go(route);
      const es = outlet().querySelector(".empty-state");
      assert.ok(es, "no empty state");
      const b = btn("Go to Portfolio", es);
      assert.ok(b, "no Go to Portfolio button: " + es.textContent);
      b.click();
      await flush();
      assert.strictEqual(win.PCC.router.currentRouteName(), "portfolio");
    });
  }

  await check("Action Centre's empty state is one short line (no action exists that fixes it)", async () => {
    await go("actionCentre");
    const es = outlet().querySelector(".empty-state");
    assert.ok(es, "no empty state");
    assert.ok(es.textContent.trim().length <= 110, "still a paragraph: " + es.textContent.trim().length + " chars");
  });

  // ---- seed ----
  let p1;
  S.update((d) => {
    const a = S.newProject({ name: "Riverside Tower", status: "on_track", progress: 40, start_date: "2026-01-10", finish_date: "2026-12-20", client: "Meridian" });
    const b = S.newProject({ name: "Harbour Hub", status: "at_risk", progress: 20, start_date: "2026-03-01", client: "Portline" });
    d.projects.push(a, b);
    p1 = a.id;
    const s = S.newSchedule({ project_id: a.id, name: "Rev 0" });
    d.schedules.push(s);
    d.activities.push(S.newActivity({ project_id: a.id, schedule_id: s.id, name: "Excavation", activity_type: "task", status: "in_progress", planned_start: "2026-08-01", planned_finish: "2026-08-10" }));
  });
  await flush();

  await check("Portfolio: no match offers Clear filters, which brings the projects back", async () => {
    await go("portfolio");
    const search = outlet().querySelector(".toolbar input.search-input");
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
    setter.call(search, "zzz-no-such-project");
    search.dispatchEvent(new win.Event("input", { bubbles: true }));
    await flush();
    const es = outlet().querySelector(".empty-state");
    assert.ok(es && btn("Clear filters", es), "no Clear filters in the empty state");
    btn("Clear filters", es).click();
    await flush();
    assert.ok(outlet().querySelectorAll(".project-card").length >= 2, "projects did not come back");
  });

  // ---- views with data ----
  const VIEWS = [["dashboard"], ["myWork"], ["actionCentre"], ["portfolio"], ["projectWorkspace"],
    ["executiveCenter", "Summary"], ["executiveCenter", "Schedule"], ["executiveCenter", "Cost & Commitments"], ["executiveCenter", "Risk & Compliance"],
    ["executiveCenter", "Weekly Reviews"], ["executiveCenter", "Snapshot & Management Pack"]];
  async function visit(route, tab) {
    if (route === "projectWorkspace" || route === "executiveCenter") win.PCC.projectContext.set(p1);
    await go(route);
    if (tab) {
      const t = Array.from(outlet().querySelectorAll(".tab-btn")).find((b) => b.textContent.trim() === tab);
      if (t) { t.click(); await flush(); }
    }
  }
  const live = (sel) => Array.from(outlet().querySelectorAll(sel)).filter((el) => !el.closest(".modal-overlay, .card-menu__dropdown, form"));

  await check("one primary action per view on every Overview page", async () => {
    const bad = [];
    for (const [r, t] of VIEWS) {
      await visit(r, t);
      const prim = live(".btn--primary").map((b) => b.textContent.trim());
      if (prim.length > 1) bad.push(r + (t ? "/" + t : "") + ": " + prim.join(" | "));
    }
    assert.deepStrictEqual(bad, []);
  });

  await check("no sentence under the title that repeats or explains the page (Dashboard, Action Centre, Executive Center); My Work's states only the scope", async () => {
    const bad = [];
    for (const r of ["dashboard", "actionCentre", "executiveCenter"]) {
      await visit(r);
      const h = outlet().querySelector("h2");
      const n = h && h.nextElementSibling;
      if (n && n.tagName === "P") bad.push(r + ": " + n.textContent.trim().slice(0, 60));
    }
    await visit("myWork");
    const n = outlet().querySelector("h2").nextElementSibling;
    if (!(n && /^(Across \d+ active projects?|For .+)\.$/.test(n.textContent.trim()))) bad.push("myWork: " + (n ? n.textContent.trim().slice(0, 60) : "(none)"));
    assert.deepStrictEqual(bad, []);
  });

  await check("labels are sentence case on every Overview view (capitals kept only for abbreviations and table headers)", async () => {
    const bad = [];
    for (const [r, t] of VIEWS) {
      await visit(r, t);
      const w = doc.createTreeWalker(outlet(), win.NodeFilter.SHOW_TEXT);
      let node;
      while ((node = w.nextNode())) {
        const el = node.parentElement;
        if (!el || el.closest("th, option, script, style, .modal-overlay, .mono, code")) continue;
        if (shouty(node.textContent)) bad.push(r + (t ? "/" + t : "") + ": " + node.textContent.trim().slice(0, 32));
      }
    }
    assert.deepStrictEqual(Array.from(new Set(bad)), []);
  });

  await check("shared label styles no longer force capitals (status pills, card stats, detail labels)", () => {
    const bad = [];
    for (const sel of [".status-badge", ".card-stat__label", ".detail-item__label"]) {
      const re = new RegExp("(^|[\\s,}])" + sel.replace(/[.]/g, "\\.") + "\\s*\\{([^}]*)\\}", "g");
      let m;
      while ((m = re.exec(css))) if (/text-transform:\s*uppercase/.test(m[2])) bad.push(sel);
    }
    assert.deepStrictEqual(bad, []);
  });

  await check("dates on Executive Center and Project Workspace are in the text face, not .mono", async () => {
    const bad = [];
    for (const [r, t] of [["projectWorkspace"], ["executiveCenter", "Summary"], ["executiveCenter", "Schedule"]]) {
      await visit(r, t);
      live(".mono").filter((el) => /^\d{4}-\d{2}-\d{2}/.test(el.textContent.trim())).forEach((el) => bad.push(r + ": " + el.textContent.trim()));
    }
    assert.deepStrictEqual(bad, []);
  });

  await check("Project Workspace switches Overview / Executive Center with the underline tabs", async () => {
    await visit("projectWorkspace");
    const active = outlet().querySelector(".tab-bar .tab-btn--active");
    assert.ok(active && active.textContent.trim() === "Overview", "no active Overview tab");
    const ec = btn("Executive Center", outlet().querySelector(".tab-bar"));
    assert.ok(ec, "no Executive Center tab");
    ec.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "executiveCenter");
  });

  await check("section wrappers are flat (.panel--flat) on the Overview pages; light theme draws no box, dark keeps the lifted surface", async () => {
    const counts = {};
    for (const r of ["dashboard", "myWork", "projectWorkspace", "executiveCenter"]) {
      await visit(r);
      counts[r] = live(".panel--flat").length;
    }
    const none = Object.keys(counts).filter((k) => !counts[k]);
    assert.deepStrictEqual(none, [], JSON.stringify(counts));
    assert.ok(/\.panel--flat\s*\{[^}]*border:\s*none/.test(css), "no flat rule");
    assert.ok(/html\[data-theme="dark"\]\s*\.panel--flat\s*\{[^}]*background-color:\s*var\(--bg-paper\)/.test(css), "dark theme loses the lifted surface");
  });

  await check("Executive Center has no box inside a box (KPI strip and sections are not nested in bordered panels)", async () => {
    await visit("executiveCenter", "Summary");
    const nested = live(".panel:not(.panel--flat) .panel:not(.panel--flat), .panel:not(.panel--flat) .kpi-grid");
    assert.strictEqual(nested.length, 0, nested.length + " nested boxes");
  });

  await check("Dashboard's context card has its own class and its selects are not caught by the title block's hide rules", async () => {
    await visit("dashboard");
    const card = outlet().querySelector(".dashboard-context-card");
    assert.ok(card, "no .dashboard-context-card");
    assert.ok(card.querySelectorAll("select").length === 3, "card has no Company/Client/Project selects");
    for (const q of ["max-width: 1150px", "max-width: 780px"]) {
      const b = mediaBlocks(q);
      assert.ok(!/(^|[,{}])\s*\.title-block__cell:not\(\.title-block__cell--grow\)\s*[,{]/.test(b), q + " still hides every .title-block__cell, including the card's");
    }
  });

  await check("the card shows only where the title block hides its switcher (<=1150px), and always in the mirror app", () => {
    assert.ok(/\.dashboard-context-card\s*\{[^}]*display:\s*none/.test(mediaBlocks("min-width: 1151px")), "card not hidden above 1150px");
    assert.ok(/\.mirror-app-shell\s+\.dashboard-context-card\s*\{[^}]*display:\s*block/.test(css), "mirror app would lose the card");
  });

  await check("Portfolio's filters fold behind a Filters toggle on phones, and still filter when used", async () => {
    await visit("portfolio");
    const toggle = outlet().querySelector(".filter-fold__toggle");
    assert.ok(toggle, "no Filters toggle");
    const fold = outlet().querySelector(".filter-fold");
    assert.ok(fold && fold.querySelectorAll("select").length >= 9, "selects not inside the fold");
    toggle.click();
    await flush();
    assert.ok(outlet().querySelector(".filter-fold--open"), "toggle didn't open the fold");
    const status = Array.from(outlet().querySelectorAll(".filter-fold select")).find((s) => s.getAttribute("aria-label") === "Filter by status");
    const setter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set;
    setter.call(status, "at_risk");
    status.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush();
    assert.strictEqual(outlet().querySelectorAll(".project-card").length, 1, "status filter inside the fold no longer filters");
    assert.ok(/\(1\)/.test(outlet().querySelector(".filter-fold__toggle").textContent), "toggle doesn't count active filters");
    const ph = mediaBlocks("max-width: 780px");
    assert.ok(/\.filter-fold\s*\{[^}]*display:\s*none/.test(ph) && /\.filter-fold--open\s*\{[^}]*display:\s*contents/.test(ph), "phone fold CSS missing");
  });

  await check("no page errors", () => assert.deepStrictEqual(errors, []));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
