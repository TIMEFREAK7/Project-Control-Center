// End-to-end jsdom test against the ACTUAL bundled index.html for Management Attention —
// PCC Evolution Roadmap Gate 3 (2026-08-19, this session's own numbering: Gate 31). A new
// "Management Attention" panel on the Dashboard, surfacing Gate 9's existing rule-based
// diagnostics (projectHealthEngine.computeDiagnostics(), via Executive Center's newly
// exported getDiagnostics(projectId)) portfolio-wide instead of one project at a time.
// Scoped to Critical + Warning severities only. No schema changes, no duplicated context
// builder — Dashboard calls the same composed function Executive Center's own Diagnostics
// panel already uses.
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

function attentionPanel(dom) {
  const headings = Array.from(dom.window.document.querySelectorAll("h3"));
  const heading = headings.find((h) => h.textContent.indexOf("Management Attention") === 0);
  return heading ? heading.parentElement : null;
}
function findButtonInPanelByText(panel, text) {
  return Array.from(panel.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
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
    assert.ok(win.PCC.pages.dashboard, "dashboard page module must be bundled");
    assert.ok(win.PCC.executiveCenter && typeof win.PCC.executiveCenter.getDiagnostics === "function", "executiveCenter.getDiagnostics must be exported");
  });

  await check("Dashboard shows no Management Attention panel before any project exists", () => {
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Management Attention") === -1);
  });

  var projA, projB, projC, projArchived;
  await check("seed three active projects (A: will get a critical alert, B: will get a warning alert, C: will get none) and one archived project (would get a critical alert if it counted)", () => {
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newProject({ name: "Attention Project A (Critical)" });
      d.projects.push(a);
      projA = a.id;
      var b = win.PCC.store.newProject({ name: "Attention Project B (Warning)" });
      d.projects.push(b);
      projB = b.id;
      var c = win.PCC.store.newProject({ name: "Attention Project C (Clean)" });
      d.projects.push(c);
      projC = c.id;
      var arch = win.PCC.store.newProject({ name: "Attention Project Archived", archived: true });
      d.projects.push(arch);
      projArchived = arch.id;
    });
    assert.ok(projA && projB && projC && projArchived);
  });

  await check("Project A gets a critical activity on its schedule — getDiagnostics() recomputes CPM live (same as Executive Center's own Overview), so a lone unconstrained activity naturally comes out zero-float/critical regardless of any stored total_float", () => {
    win.PCC.store.update(function (d) {
      var s = win.PCC.store.newSchedule({ project_id: projA, name: "Baseline", status: "active" });
      d.schedules.push(s);
      d.activities.push(win.PCC.store.newActivity({ project_id: projA, schedule_id: s.id, name: "Critical activity", activity_type: "task", duration: 5, status: "not_started" }));
    });
  });

  await check("Project B gets a high-probability/high-impact open risk", () => {
    win.PCC.store.update(function (d) {
      d.risks.push(win.PCC.store.newRisk({ project_id: projB, type: "risk", title: "Late transformer delivery", probability: "high", impact: "high", status: "open" }));
    });
  });

  await check("the Archived project gets the same critical setup as Project A, but must never appear", () => {
    win.PCC.store.update(function (d) {
      var s = win.PCC.store.newSchedule({ project_id: projArchived, name: "Baseline", status: "active" });
      d.schedules.push(s);
      d.activities.push(win.PCC.store.newActivity({ project_id: projArchived, schedule_id: s.id, name: "Archived critical activity", activity_type: "task", duration: 5, status: "not_started" }));
    });
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
  });

  await check("the panel shows exactly 2 alerts across 2 projects, correctly worst-first (Project A's critical alert before Project B's warning)", () => {
    var panel = attentionPanel(dom);
    assert.ok(panel, "Management Attention panel not found");
    assert.ok(panel.textContent.indexOf("Management Attention (2)") !== -1, "expected exactly 2 alerts; got: " + panel.textContent.match(/Management Attention \(\d+\)/));

    var text = panel.textContent;
    assert.ok(text.indexOf("activity(ies) on the critical path") !== -1, "Project A's negative-float alert must appear");
    assert.ok(text.indexOf("High-severity risk open") !== -1 && text.indexOf("Late transformer delivery") !== -1, "Project B's high risk alert must appear");

    var posA = text.indexOf("Attention Project A (Critical)");
    var posB = text.indexOf("Attention Project B (Warning)");
    assert.ok(posA !== -1 && posB !== -1 && posA < posB, "Project A (1 critical) must rank above Project B (0 critical, 1 warning) — worst-first");
  });

  await check("Project C (no issues) and the Archived project never appear in the panel", () => {
    var panel = attentionPanel(dom);
    assert.ok(panel.textContent.indexOf("Attention Project C (Clean)") === -1, "a project with zero critical/warning alerts must not appear");
    assert.ok(panel.textContent.indexOf("Attention Project Archived") === -1, "an archived project must never appear, even with a triggering condition");
    assert.ok(outlet().textContent.indexOf("Archived critical activity") === -1, "an archived project's own alert text must never appear anywhere on the page");
  });

  await check("severity icons mark Project A's alert critical and Project B's alert warning, scoped to their own project's group", () => {
    // UI/UX Overhaul Gate 5: this panel is now built on Gate 1's .attention-list/
    // .attention-item primitive (a colored dot, no text badge) instead of its own
    // hand-built status-badge rows — same worst-first grouping, just a different marker.
    var panel = attentionPanel(dom);
    var lists = panel.querySelectorAll(".attention-list");
    assert.strictEqual(lists.length, 2, "expected one .attention-list per project group");
    assert.ok(lists[0].querySelector(".attention-item__icon--critical"), "Project A's group (first, worst-first) must show a critical-severity item");
    assert.ok(lists[1].querySelector(".attention-item__icon--warning"), "Project B's group (second) must show a warning-severity item");
  });

  await check("'View Project' on Project A's group navigates to Executive Center with that project selected", () => {
    var panel = attentionPanel(dom);
    var btn = findButtonInPanelByText(panel, "View Project");
    assert.ok(btn, "no 'View Project' button found in the panel");
    // The first group in DOM order is Project A (worst-first sort already asserted above).
    btn.click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "executiveCenter");
    assert.ok(outlet().textContent.indexOf("Attention Project A (Critical)") !== -1, "Executive Center must land on Project A");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back — every seeded record is unchanged after rendering (the diagnostics engine only ever reads)", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 4);
    assert.strictEqual(data.risks.length, 1);
    assert.strictEqual(data.schedules.length, 2);
    assert.strictEqual(data.activities.length, 2);
  });

  await check("removing Project A's critical activity clears its alert from the panel on the next render — confirms the diagnostics engine recomputes CPM live rather than trusting a stale stored total_float", () => {
    win.PCC.store.update(function (d) {
      d.activities = d.activities.filter(function (a) {
        return a.project_id !== projA;
      });
    });
    // Daily-Use Audit Phase 2: the earlier "View Project" check above navigated into
    // Project A's own Executive Center, which sets the shared Global Project Context
    // (Redesign Gate 6) to Project A — Dashboard now correctly narrows to just that
    // project on its next render (the exact behavior Phase 2 added). This check is
    // about the diagnostics engine recomputing CPM live, not context-based filtering,
    // so clear the context back to "All Projects" first, same as a real user would via
    // Dashboard's own "Show All Projects" control.
    win.PCC.projectContext.set("");
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    var panel = attentionPanel(dom);
    assert.ok(panel.textContent.indexOf("Management Attention (1)") !== -1, "only Project B's warning should remain; got: " + panel.textContent.match(/Management Attention \(\d+\)/));
    assert.ok(panel.textContent.indexOf("Attention Project A (Critical)") === -1, "Project A must drop out once its critical condition is gone");
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding Management Attention", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
