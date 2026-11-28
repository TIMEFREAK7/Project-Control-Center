// Gate 7.5c (2026-11-28): the Registers page pass (Risk Register, RFI / TQ, Change Management,
// Decision Register, Meetings, Delay & Recovery Dashboard, Project Lookahead). Row actions are
// Details + "⋯"; empty states offer their action; no sentence under a title; sentence-case
// labels; Change Orders show the project's currency; the heat map is quiet (text face, token
// colours, no tint on empty cells); Delay & Recovery sections are flat; Lookahead dates use the
// app's date format and its window buttons are a pressed set.
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
const ACRONYMS = new Set(["RFI", "RFIS", "TQ", "TQS", "CO", "PM", "ID", "WBS", "INR", "USD", "QS", "RVT", "HLH", "MEP"]);
function shouty(text) {
  return text
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w) && !ACRONYMS.has(w));
}
function cssRule(selector) {
  const i = css.indexOf(selector + " {");
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
}

const REGISTERS = [
  { route: "risks", add: "+ Add Entry", clone: true },
  { route: "rfis", add: "+ Add RFI / TQ", clone: true },
  { route: "changeOrders", add: "+ Add Change Order", clone: true },
  { route: "decisionRegister", add: "+ Add Decision", clone: true },
  { route: "meetings", add: "+ Add Meeting", clone: false },
];

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

  // ---- empty states, no projects ----
  for (const r of REGISTERS) {
    await check(r.route + " with no projects: the empty state offers Go to Portfolio", async () => {
      await go(r.route);
      const es = outlet().querySelector(".empty-state");
      assert.ok(es && btn("Go to Portfolio", es), "no Go to Portfolio in: " + (es && es.textContent));
      btn("Go to Portfolio", es).click();
      await flush();
      assert.strictEqual(win.PCC.router.currentRouteName(), "portfolio");
    });
  }

  let pid;
  S.update((d) => {
    const p = S.newProject({ name: "Riverside Tower", code: "RVT", currency: "INR", status: "on_track", start_date: "2026-09-01" });
    d.projects.push(p);
    pid = p.id;
  });
  await flush();

  for (const r of REGISTERS) {
    await check(r.route + " with a project but no entries: the empty state offers " + r.add + ", which opens the form, and no 'Click …' line", async () => {
      await go(r.route);
      const es = outlet().querySelector(".empty-state");
      assert.ok(es && btn(r.add, es), "no " + r.add + " in: " + (es && es.textContent));
      assert.ok(es.textContent.indexOf("Click") === -1, "still an instruction: " + es.textContent);
      btn(r.add, es).click();
      await flush();
      assert.ok(outlet().querySelector("form"), "no form opened");
    });
  }

  await check("Delay & Recovery with nothing logged: one empty state offering Go to Schedule, no subtitle", async () => {
    await go("delayRecoveryDashboard");
    const es = outlet().querySelector(".empty-state");
    assert.ok(es && es.textContent.indexOf("Nothing to show yet") !== -1 && btn("Go to Schedule", es), "got: " + (es && es.textContent));
    const h = outlet().querySelector("h2");
    assert.ok(!(h.nextElementSibling && h.nextElementSibling.tagName === "P"), "subtitle still there");
  });

  // ---- seed ----
  S.update((d) => {
    const sch = S.newSchedule({ project_id: pid, name: "Rev 0", status: "active" });
    d.schedules.push(sch);
    const act = S.newActivity({ project_id: pid, schedule_id: sch.id, name: "Pile caps", activity_type: "task", duration: 5, planned_start: "2026-11-02", planned_finish: "2026-11-06" });
    d.activities.push(act);
    d.risks.push(S.newRisk({ project_id: pid, type: "risk", title: "Monsoon delays", status: "open", probability: "high", impact: "high", owner: "R. K." }));
    d.rfis.push(S.newRfi({ project_id: pid, type: "rfi", number: "RVT-RFI-014", subject: "Pile cap clash", status: "open", priority: "high", date_raised: "2026-01-10", date_required: "2026-01-18" }));
    d.change_orders.push(S.newChangeOrder({ project_id: pid, number: "RVT-CO-003", title: "Dock pits", status: "pending", cost_impact_amount: 3850000, schedule_impact_days: 9 }));
    d.decisions.push(S.newDecision({ project_id: pid, title: "Precast stairs", status: "pending" }));
    // a meeting 3 days out, so the Lookahead has an item whatever today is
    const soon = win.PCC.dates.localIsoDate(new Date(Date.now() + 3 * 86400000));
    d.meetings.push(S.newMeeting({ project_id: pid, title: "Weekly review", meeting_date: soon, actions: [] }));
    const dr = S.newDelayRecord({ project_id: pid, status: "open", activity_id: act.id, delay_category: "weather", description: "Rain", delay_days: 4, is_excusable: true });
    d.delay_records.push(dr);
    d.recovery_actions.push(S.newRecoveryAction({ project_id: pid, status: "in_progress", activity_id: act.id, delay_id: dr.id, description: "Second crew", target_recovery_date: "2026-01-19", estimated_recovery_days: 3 }));
  });
  await flush();

  for (const r of REGISTERS) {
    await check(r.route + " row: Details plus ⋯ (" + (r.clone ? "Edit, Clone, Delete" : "Edit, Delete") + "); Edit opens the form", async () => {
      await go(r.route);
      const card = outlet().querySelector(".project-card");
      assert.ok(card, "no row");
      const loose = Array.from(card.querySelectorAll(".project-card__actions > .btn")).map((b) => b.textContent.trim());
      assert.deepStrictEqual(loose, ["Details"], "loose row buttons: " + loose.join(", "));
      card.querySelector('[aria-label="More actions"]').click();
      await flush();
      const items = Array.from(card.querySelectorAll(".card-menu__item")).map((b) => b.textContent.trim());
      assert.deepStrictEqual(items, r.clone ? ["Edit", "Clone", "Delete"] : ["Edit", "Delete"]);
      btn("Edit", card).click();
      await flush();
      assert.ok(outlet().querySelector("form"), "Edit did not open the form");
      assert.ok(!outlet().querySelector(".project-card .card-menu__dropdown"), "menu stayed open");
    });

    await check(r.route + ": no capitalised labels with Details open", async () => {
      await go(r.route);
      btn("Details").click();
      await flush();
      const labels = Array.from(outlet().querySelectorAll(".detail-item__label, .attention-item__meta, .kpi-card__label")).map((e) => e.textContent.trim());
      const bad = labels.filter((t) => shouty(t).length);
      assert.deepStrictEqual(bad, []);
    });
  }

  await check("Change Management: no sentence under the title; the cost badge carries the project's currency", async () => {
    await go("changeOrders");
    const h = outlet().querySelector("h2");
    assert.ok(!(h.nextElementSibling && h.nextElementSibling.tagName === "P"), "subtitle still there");
    const badges = Array.from(outlet().querySelectorAll(".project-card .status-badge")).map((b) => b.textContent.trim());
    assert.ok(badges.some((t) => /^\+INR [\d,]+$/.test(t)), "badges: " + badges.join(" | "));
  });

  await check("RFI overdue section is flat and its heading isn't coloured; dates are formatted, not ISO", async () => {
    await go("rfis");
    const h = Array.from(outlet().querySelectorAll("h3")).find((x) => /^Overdue RFIs/.test(x.textContent));
    assert.ok(h, "no overdue section");
    assert.ok(h.parentElement.classList.contains("panel--flat"), "not flat");
    assert.strictEqual(h.getAttribute("style") && /color/.test(h.getAttribute("style")), false, "heading still coloured");
    assert.ok(h.parentElement.textContent.indexOf("2026-01-18") === -1, "raw ISO date still shown");
  });

  await check("heat map: empty cells carry heatmap-cell--empty; the occupied cell doesn't", async () => {
    await go("risks");
    const cells = Array.from(outlet().querySelectorAll(".heatmap-cell"));
    assert.strictEqual(cells.length, 9);
    const empty = cells.filter((c) => c.classList.contains("heatmap-cell--empty"));
    assert.strictEqual(empty.length, 8, "empty cells: " + empty.length);
    assert.ok(cells.every((c) => c.classList.contains("heatmap-cell--empty") === (c.textContent.trim() === "0")));
    assert.ok(!/Click a cell/.test(outlet().textContent), "instruction line still shown");
  });

  await check("heat map CSS: text face (tabular figures), status-token colours, no rgba literals", () => {
    for (const sel of [".heatmap-cell", ".heatmap-row-label"]) assert.ok(!/--font-mono/.test(cssRule(sel)), sel + " still mono");
    assert.ok(/tabular-nums/.test(cssRule(".heatmap-cell")), "no tabular figures");
    for (const lvl of ["low", "medium", "high"]) {
      const rule = cssRule(".heatmap-cell--" + lvl);
      assert.ok(/var\(--status-/.test(rule) && !/rgba\(/.test(rule), lvl + ": " + rule);
    }
    assert.ok(/transparent/.test(cssRule(".heatmap-cell--empty")), "no empty-cell rule");
  });

  await check("Delay & Recovery: no subtitle, every section wrapper flat, figures not in the code font, labels in sentence case", async () => {
    await go("delayRecoveryDashboard");
    const h = outlet().querySelector("h2");
    assert.ok(!(h.nextElementSibling && h.nextElementSibling.tagName === "P"), "subtitle still there");
    const boxed = Array.from(outlet().querySelectorAll(".panel")).filter((p) => !p.classList.contains("panel--flat") && !p.classList.contains("empty-state"));
    assert.strictEqual(boxed.length, 0, boxed.length + " boxed sections");
    assert.strictEqual(outlet().querySelectorAll(".kpi-card__value.mono").length, 0);
    const bad = Array.from(outlet().querySelectorAll(".kpi-card__label")).map((e) => e.textContent).filter((t) => shouty(t).length);
    assert.deepStrictEqual(bad, []);
  });

  await check("Lookahead: no subtitle, no [Kind] brackets, no ISO dates, window buttons a pressed set", async () => {
    await go("projectLookahead");
    const h = outlet().querySelector("h2");
    assert.ok(!(h.nextElementSibling && h.nextElementSibling.tagName === "P"), "subtitle still there");
    const btns = Array.from(outlet().querySelectorAll('[aria-label="Lookahead window"] button'));
    assert.deepStrictEqual(btns.map((b) => b.textContent.trim()), ["7 days", "14 days", "30 days", "60 days"]);
    assert.deepStrictEqual(btns.map((b) => b.getAttribute("aria-pressed")), ["true", "false", "false", "false"]);
    btns[2].click();
    await flush();
    const after = Array.from(outlet().querySelectorAll('[aria-label="Lookahead window"] button')).map((b) => b.getAttribute("aria-pressed"));
    assert.deepStrictEqual(after, ["false", "false", "true", "false"]);
    const items = Array.from(outlet().querySelectorAll(".attention-item"));
    assert.ok(items.length > 0, "no items in 30 days");
    for (const it of items) {
      assert.ok(!/^\[/.test(it.querySelector(".attention-item__text").textContent), "bracket tag: " + it.textContent);
      assert.ok(!/\d{4}-\d{2}-\d{2}/.test(it.querySelector(".attention-item__meta").textContent), "ISO date: " + it.textContent);
    }
  });

  await check("no uncaught errors", () => {
    assert.deepStrictEqual(errors, []);
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
