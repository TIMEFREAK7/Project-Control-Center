// Gate 7.5b (2026-11-28): the Schedule page pass. The toolbar is one primary action (+ New
// Schedule) plus Calculate Schedule and grouped menus (Import ▾, Export ▾, ⋯ with Save Baseline);
// each tab has one primary; empty states offer their fixing action; real plurals; Gantt text
// sizes come from tokens; and opening the Gantt never recomputes the CPM results it draws.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const ROOT = path.join(__dirname, "..");
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
  const bar = () => outlet().querySelector(".toolbar.focus-mode-hide");
  const tab = async (name) => {
    const t = Array.from(outlet().querySelectorAll(".tab-btn")).find((b) => b.textContent.trim() === name);
    t.click();
    await flush();
  };

  // ---- empty states ----
  await check("no projects: the empty state offers Go to Portfolio, which navigates there", async () => {
    await go("schedule");
    const es = outlet().querySelector(".empty-state");
    assert.ok(es && btn("Go to Portfolio", es), "no Go to Portfolio in: " + (es && es.textContent));
    btn("Go to Portfolio", es).click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "portfolio");
  });

  let projectId;
  S.update((d) => {
    const p = S.newProject({ name: "Riverside Tower", status: "on_track", start_date: "2026-08-01" });
    d.projects.push(p);
    projectId = p.id;
  });
  await flush();

  await check("project but no schedule: the empty state offers + New Schedule, which opens the form", async () => {
    win.PCC.projectContext.set(projectId);
    await go("schedule");
    const es = outlet().querySelector(".empty-state");
    assert.ok(es && btn("+ New Schedule", es), "no + New Schedule in: " + (es && es.textContent));
    assert.ok(es.textContent.indexOf("Click") === -1, "still an instruction: " + es.textContent);
    btn("+ New Schedule", es).click();
    await flush();
    const h = Array.from(outlet().querySelectorAll("h3")).find((x) => x.textContent === "New Schedule");
    assert.ok(h, "the schedule form did not open");
  });

  // ---- a schedule with a WBS-less, relationship-less start ----
  let scheduleId;
  S.update((d) => {
    const s = S.newSchedule({ project_id: projectId, name: "Rev 0" });
    d.schedules.push(s);
    scheduleId = s.id;
  });
  await flush();
  await go("schedule");

  for (const [tabName, label] of [["Activities", "+ Add Activity"], ["WBS", "+ Add WBS Item"], ["Calendars", "+ Add Calendar"]]) {
    await check(tabName + " tab, nothing yet: the empty state offers " + label + ", which opens the form", async () => {
      await tab(tabName);
      const es = outlet().querySelector(".empty-state");
      assert.ok(es && btn(label, es), "no " + label + " in: " + (es && es.textContent));
      assert.ok(es.textContent.indexOf("Click") === -1, "still an instruction: " + es.textContent);
      btn(label, es).click();
      await flush();
      assert.ok(outlet().querySelector("form"), "no form opened");
    });
  }

  // ---- seed activities + logic, then calculate ----
  S.update((d) => {
    const mk = (name, ps, pf) => S.newActivity({ project_id: projectId, schedule_id: scheduleId, name, activity_type: "task", duration: 5, planned_start: ps, planned_finish: pf });
    const a = mk("Excavation", "2026-08-03", "2026-08-07");
    const b = mk("Footings", "2026-08-10", "2026-08-14");
    const c = mk("Slab", "2026-08-17", "2026-08-21");
    d.activities.push(a, b, c);
    d.relationships.push(S.newRelationship({ schedule_id: scheduleId, project_id: projectId, predecessor_id: a.id, successor_id: b.id, type: "FS", lag: 0 }));
    d.relationships.push(S.newRelationship({ schedule_id: scheduleId, project_id: projectId, predecessor_id: b.id, successor_id: c.id, type: "FS", lag: 0 }));
  });
  await flush();
  await go("schedule");
  btn("Calculate Schedule", bar()).click();
  await flush();

  await check("no sentence under the page title", () => {
    const h = Array.from(outlet().querySelectorAll("h2")).find((x) => x.textContent.trim() === "Schedule");
    assert.ok(h, "no Schedule heading");
    const next = h.nextElementSibling;
    assert.ok(!(next && next.tagName === "P"), "subtitle still there: " + (next && next.textContent.slice(0, 80)));
  });

  await check("toolbar: one primary (+ New Schedule), and the moved actions are not loose buttons", async () => {
    const primaries = bar().querySelectorAll(".btn--primary");
    assert.strictEqual(primaries.length, 1, "primaries: " + primaries.length);
    assert.strictEqual(primaries[0].textContent.trim(), "+ New Schedule");
    for (const t of ["Import Schedule", "Edit Excel", "Export to MS Project", "Export to Primavera P6", "Save Baseline", "Edit Schedule"]) {
      assert.ok(!btn(t, bar()), "'" + t + "' is still a loose toolbar button");
    }
    assert.ok(btn("Calculate Schedule", bar()), "Calculate Schedule must stay visible");
  });

  const MENUS = [
    ["Import ▾", ["Import Schedule", "Edit Excel"]],
    ["Export ▾", ["Export to MS Project", "Export to Primavera P6"]],
  ];
  for (const [toggle, items] of MENUS) {
    await check("toolbar menu " + toggle + " holds " + items.join(", "), async () => {
      const t = btn(toggle, bar());
      assert.ok(t, "no " + toggle + " button");
      t.click();
      await flush();
      assert.strictEqual(t.getAttribute("aria-expanded"), "true");
      const dd = bar().querySelector(".card-menu__dropdown");
      assert.deepStrictEqual(Array.from(dd.querySelectorAll(".card-menu__item")).map((b) => b.textContent.trim()), items);
      bar().querySelector('[aria-label="Close ' + toggle.replace(" ▾", "").toLowerCase() + ' menu"]').click();
      await flush();
      assert.ok(!bar().querySelector(".card-menu__dropdown"), "menu did not close");
    });
  }

  await check("⋯ holds Save Baseline and Edit Schedule; an item closes the menu and does its job", async () => {
    bar().querySelector('[aria-label="Schedule actions"]').click();
    await flush();
    const names = Array.from(bar().querySelectorAll(".card-menu__item")).map((b) => b.textContent.trim());
    for (const n of ["Save Baseline", "Edit Schedule", "Delete Schedule…"]) assert.ok(names.indexOf(n) !== -1, "missing " + n + " in " + names.join(", "));
    btn("Edit Schedule", bar()).click();
    await flush();
    assert.ok(!bar().querySelector(".card-menu__dropdown"), "menu stayed open");
    assert.ok(Array.from(outlet().querySelectorAll("h3")).some((x) => x.textContent === "Edit Schedule"), "the edit form did not open");
  });

  for (const tabName of ["Activities", "Gantt", "WBS", "Relationships", "Calendars"]) {
    await check(tabName + " tab: at most one primary below the toolbar", async () => {
      await go("schedule");
      await tab(tabName);
      const all = Array.from(outlet().querySelectorAll(".btn--primary")).filter((b) => !bar().contains(b) && !b.closest("form"));
      assert.ok(all.length <= 1, all.map((b) => b.textContent.trim()).join(" | "));
    });
  }

  await check("Relationships tab, two activities but no logic: the empty state offers + Add Relationship", async () => {
    S.update((d) => { d.relationships = d.relationships.filter((r) => r.schedule_id !== scheduleId); });
    await go("schedule");
    await tab("Relationships");
    const es = outlet().querySelector(".empty-state");
    assert.ok(es && btn("+ Add Relationship", es), "no + Add Relationship in: " + (es && es.textContent));
  });

  await check("opening the Gantt draws the stored CPM results without recalculating them", async () => {
    // put the logic back and recalculate, so the Gantt has calculated dates to draw
    const acts = S.get().activities.filter((a) => a.schedule_id === scheduleId);
    S.update((d) => {
      d.relationships.push(S.newRelationship({ schedule_id: scheduleId, project_id: projectId, predecessor_id: acts[0].id, successor_id: acts[1].id, type: "FS", lag: 0 }));
    });
    await go("schedule");
    btn("Calculate Schedule", bar()).click();
    await flush();
    const before = JSON.stringify(S.get().activities);
    const engine = win.PCC.scheduleCpmEngine;
    const real = engine.calculateSchedule;
    let calls = 0;
    engine.calculateSchedule = function () { calls++; return real.apply(this, arguments); };
    try {
      await tab("Gantt");
      assert.ok(outlet().querySelector(".gantt-chart-panel svg"), "no Gantt chart");
      assert.strictEqual(calls, 0, "the Gantt called calculateSchedule " + calls + " time(s)");
      assert.strictEqual(JSON.stringify(S.get().activities), before, "opening the Gantt changed stored activities");
    } finally {
      engine.calculateSchedule = real;
    }
  });

  await check("Gantt: bar fills are colour tokens and no SVG text has a literal font-size attribute", async () => {
    const svg = outlet().querySelector(".gantt-chart-panel svg");
    const fills = Array.from(svg.querySelectorAll("rect[fill]")).map((r) => r.getAttribute("fill")).filter((f) => f !== "none" && f !== "transparent");
    assert.ok(fills.length > 0, "no filled bars");
    for (const f of fills) assert.ok(/^var\(--/.test(f), "literal fill " + f);
    const literal = Array.from(svg.querySelectorAll("text[font-size]"));
    assert.strictEqual(literal.length, 0, literal.length + " text elements still set font-size directly");
  });

  await check("section wrappers are flat: the activities table and the Gantt chart use .panel--flat", async () => {
    assert.ok(outlet().querySelector(".gantt-chart-panel.panel--flat"), "Gantt chart panel not flat");
    await tab("Activities");
    assert.ok(outlet().querySelector(".activities-table-wrap.panel--flat"), "activities table not flat");
  });

  await check("no 'word(s)' / 'activity(ies)' text in the Schedule page source", () => {
    const src = fs.readFileSync(path.join(ROOT, "react", "src", "pages", "Schedule.tsx"), "utf8");
    const hits = src.split("\n").filter((l) => !/^\s*\/\//.test(l) && /[a-z]\((s|ies)\)/.test(l));
    assert.strictEqual(hits.length, 0, hits.map((l) => l.trim().slice(0, 90)).join("\n      "));
  });

  await check("no uncaught errors", () => {
    assert.deepStrictEqual(errors, []);
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
