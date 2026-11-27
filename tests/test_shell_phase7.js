// Gate 7.3 (2026-11-27): the Phase 7 shell. Sidebar active row is a plain fill (no blurred
// blob, no left stripe), group headers and title-block labels are sentence case, every nav
// route carries a Kubai duotone icon, the title block keeps only the 2 px module hairline (no
// wash), toasts are the ink surface with a status dot, and at phone width Export / Import /
// Density / Focus move from the header into the nav drawer so the page name has room.
// jsdom can't measure layout, so "the page name no longer truncates at 412 px" is checked in
// real Chromium (HANDOFF.md, Gate 7.3); this file checks the markup, behaviour and CSS source.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const ROOT = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "src", "css", "styles.css"), "utf8");

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

// Every top-level rule whose selector list matches `re`, as "selector { body }" text.
function rules(re) {
  const out = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const r = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = r.exec(stripped))) if (re.test(m[1])) out.push(m[1].trim() + " {" + m[2] + "}");
  return out;
}
const isShouty = (s) => /[A-Z]{3,}/.test(s) && s === s.toUpperCase();

(async () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const errors = [];
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously", resources: "usable", pretendToBeVisual: true });
  dom.window.indexedDB = new FDBFactory();
  dom.window.onerror = (msg) => errors.push(msg);
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  const win = dom.window;
  const doc = win.document;

  await check("app boots without throwing", () => assert.deepStrictEqual(errors, []));

  await check("sidebar active row is a plain fill: no blurred blob element, no filter, no left stripe", () => {
    assert.strictEqual(doc.querySelectorAll(".sidebar__link-blob").length, 0, "blob spans still rendered");
    const sb = rules(/\.sidebar__link/);
    assert.ok(!sb.some((r) => /filter\s*:/.test(r)), "a .sidebar__link rule still sets filter");
    assert.ok(!sb.some((r) => /border-left/.test(r)), "a .sidebar__link rule still draws a left border/stripe");
    const active = rules(/\.sidebar__link\.active\s*$/m).join("\n");
    assert.ok(/background-color/.test(active), "active row has no fill: " + active);
  });

  await check("nav group headers are sentence case, not uppercase with tracking", () => {
    const labels = Array.from(doc.querySelectorAll(".sidebar__group-label")).map((n) => n.textContent);
    assert.ok(labels.length === 9, "expected 9 groups, got " + labels.length);
    assert.deepStrictEqual(labels.filter(isShouty), []);
    assert.ok(!rules(/\.sidebar__group-label/).some((r) => /letter-spacing|text-transform/.test(r)), "group label still tracked/uppercased");
  });

  await check("every nav route has a Kubai duotone icon (body + mark), Storage Management included", () => {
    const links = Array.from(doc.querySelectorAll(".sidebar__link[data-route]"));
    assert.ok(links.length >= 29, "expected every route, got " + links.length);
    const missing = links.filter((a) => !a.querySelector(".sidebar__icon svg .duo-body") || !a.querySelector(".sidebar__icon svg .duo-mark")).map((a) => a.getAttribute("data-route"));
    assert.deepStrictEqual(missing, []);
    assert.ok(rules(/\.duo-body/).some((r) => /opacity:\s*0?\.3/.test(r)), "no .duo-body rule at 0.3 opacity");
  });

  await check("title block: module colour is a 2 px hairline only (no background wash)", () => {
    const tb = rules(/^\s*\.title-block\s*$/m).join("\n");
    assert.ok(!/module-accent[^;]*\)\s*6%|background-color:\s*color-mix/.test(tb), "title block still washes the background: " + tb);
    assert.ok(/border-bottom-width:\s*2px/.test(tb), "module hairline is not 2px: " + tb);
  });

  await check("title-block, context and footer labels are sentence case", () => {
    const shouty = Array.from(doc.querySelectorAll(".title-block__label, footer.app-footer span")).map((n) => n.textContent).filter(isShouty);
    assert.deepStrictEqual(shouty, []);
  });

  await check("command palette group labels are not uppercased by CSS", () => {
    assert.ok(!rules(/\.command-palette__group-label/).some((r) => /text-transform:\s*uppercase/.test(r)));
  });

  await check("toasts: ink surface with a status dot, no full status-colour fill", () => {
    const t = rules(/\.toast/).join("\n");
    assert.ok(/background-color:\s*var\(--ink\)/.test(t) && /var\(--on-ink\)/.test(t), "toast is not ink/on-ink");
    assert.ok(!/\.toast--\w+\s*\{[^}]*background-color:\s*var\(--status/.test(t), "a toast variant still fills with a status colour");
    assert.ok(/::before/.test(t), "no status dot");
  });

  // ---- phone: four header actions move into the drawer ----
  const HEADER_IDS = ["title-export-btn", "title-import-btn", "density-toggle-btn", "focus-mode-toggle-btn"];
  await check("header Export/Import/Density/Focus are hidden at phone width (icon-btn--hide-mobile)", () => {
    const bad = HEADER_IDS.filter((id) => { const b = doc.getElementById(id); return !b || !b.classList.contains("icon-btn--hide-mobile"); });
    assert.deepStrictEqual(bad, []);
  });

  function openDrawer() {
    doc.querySelector(".icon-btn--menu").click();
    const o = doc.getElementById("nav-overlay");
    assert.ok(o, "drawer did not open");
    return o;
  }
  const row = (o, a) => o.querySelector('.drawer__action[data-action="' + a + '"]');

  await check("the nav drawer has phone-only rows for Export, Import, Density and Focus", () => {
    const o = openDrawer();
    const bad = ["export", "import", "density", "focus"].filter((a) => !row(o, a));
    assert.deepStrictEqual(bad, []);
    assert.ok(rules(/\.drawer__action/).some((r) => /display:\s*none/.test(r)), "rows are not hidden above phone width");
  });

  await check("drawer Density row cycles the persisted density and closes the drawer", async () => {
    const before = win.PCC.store.get().settings.density || "comfortable";
    row(doc.getElementById("nav-overlay") || openDrawer(), "density").click();
    await flush();
    assert.notStrictEqual(win.PCC.store.get().settings.density, before);
    assert.strictEqual(doc.getElementById("nav-overlay"), null);
  });

  await check("drawer Focus row toggles focus mode", async () => {
    const was = doc.body.classList.contains("focus-mode");
    row(openDrawer(), "focus").click();
    await flush();
    assert.strictEqual(doc.body.classList.contains("focus-mode"), !was);
    row(openDrawer(), "focus").click();
    await flush();
  });

  await check("drawer Export row runs the real export", async () => {
    let called = 0;
    const real = win.PCC.store.exportToFile;
    win.PCC.store.exportToFile = () => { called++; return Promise.resolve(); };
    row(openDrawer(), "export").click();
    await flush();
    win.PCC.store.exportToFile = real;
    assert.strictEqual(called, 1);
  });

  await check("drawer Import row opens the real file picker", async () => {
    const input = doc.querySelector('.title-block__actions input[type="file"]');
    let clicked = 0;
    input.click = () => { clicked++; };
    row(openDrawer(), "import").click();
    await flush();
    assert.strictEqual(clicked, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
