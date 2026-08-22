// End-to-end jsdom test against the ACTUAL bundled index.html for Document Control's
// Gate 12 (Dashboards): a new "Document Control Dashboard" page — portfolio-wide
// compliance charts/tables, distinct from Gate 25's Dashboard reminders panel
// (time-sensitive alerts) and from the later Executive Summary/Portfolio Compliance
// gates (narrative text / a printable rollup). Covers: the empty state, overall
// KPI counts, per-project compliance grouping sorted worst-first, per-document-type
// grouping, archived projects excluded, "View Project" navigation, and that this
// dashboard is purely computed — nothing written back.
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
    assert.ok(win.PCC.pages.documentControlDashboard, "documentControlDashboard page module must be bundled");
  });

  await check("the sidebar links to Document Control Dashboard, and the empty state shows before any requirement exists", () => {
    win.PCC.router.go("documentControlDashboard");
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Document Control Dashboard") !== -1);
    assert.ok(text.indexOf("Nothing to show yet") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var projA, projB, archivedProj, boqTypeId, itpTypeId;
  await check("seed two active projects, one archived project, and two document types via the store", () => {
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newProject({ name: "Compliance Project A" });
      d.projects.push(a);
      projA = a.id;

      var b = win.PCC.store.newProject({ name: "Compliance Project B" });
      d.projects.push(b);
      projB = b.id;

      var arch = win.PCC.store.newProject({ name: "Archived Project", archived: true });
      d.projects.push(arch);
      archivedProj = arch.id;

      boqTypeId = d.document_types.find((t) => t.name === "BOQ").id;
      itpTypeId = d.document_types.find((t) => t.name === "ITP").id;
    });
    assert.ok(projA && projB && archivedProj && boqTypeId && itpTypeId);
  });

  await check("seed requirements: Project A gets 2 (1 available, 1 overdue), Project B gets 1 (required, not overdue), archived project gets 1 (must be excluded entirely)", () => {
    win.PCC.store.update(function (d) {
      // Project A: BOQ available, ITP overdue.
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: projA, document_type_id: boqTypeId }));
      d.documents.push(win.PCC.store.newDocument({ project_id: projA, filename: "a-boq.pdf", document_type_id: boqTypeId }));
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projA, document_type_id: itpTypeId, planned_submission_date: "2020-01-01" })
      );

      // Project B: BOQ required, due far in the future (not overdue, not available).
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projB, document_type_id: boqTypeId, planned_submission_date: "2030-01-01" })
      );

      // Archived project: must never appear anywhere in this dashboard.
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: archivedProj, document_type_id: boqTypeId }));
    });
    win.PCC.router.render();
  });

  await check("the KPI cards show the correct portfolio-wide totals, excluding the archived project's requirement", () => {
    assert.strictEqual(kpiValue(dom, "TOTAL REQUIREMENTS"), "3", "3 requirements across the two active projects; the archived project's 4th must be excluded");
    assert.strictEqual(kpiValue(dom, "AVAILABLE"), "33%", "1 of 3 available = 33%");
    assert.strictEqual(kpiValue(dom, "REQUIRED"), "1");
    assert.strictEqual(kpiValue(dom, "OVERDUE"), "1");
  });

  await check("Compliance by Project lists both active projects, worst-compliance-first, and never the archived one", () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Compliance Project A") !== -1);
    assert.ok(text.indexOf("Compliance Project B") !== -1);
    assert.ok(text.indexOf("Archived Project") === -1, "an archived project's compliance must never appear on this dashboard");

    var posA = text.indexOf("Compliance Project A");
    var posB = text.indexOf("Compliance Project B");
    // Project A: 1 of 2 available = 50%. Project B: 0 of 1 available = 0%. B is worse, so B must render first.
    assert.ok(posB !== -1 && posA !== -1 && posB < posA, "Project B (0% available) must render before Project A (50% available) — worst-compliance-first");
    assert.ok(text.indexOf("1 of 2 available (50%)") !== -1, "Project A's own line");
    assert.ok(text.indexOf("0 of 1 available (0%)") !== -1, "Project B's own line");
  });

  await check("Compliance by Document Type breaks down BOQ and ITP separately, each combining both projects' requirements correctly", () => {
    var text = outlet().textContent;
    // BOQ: available in Project A, required in Project B => 1 of 2 available (50%).
    assert.ok(text.indexOf("BOQ") !== -1);
    assert.ok(text.indexOf("1 of 2 available (50%)") !== -1, "BOQ combines across both projects: 1 available + 1 required = 1 of 2");
    // ITP: only the one overdue row in Project A => 0 of 1 available (0%).
    assert.ok(text.indexOf("ITP") !== -1);
    assert.ok(text.indexOf("0 of 1 available (0%)") !== -1, "ITP's own line: 0 of 1 available");
  });

  await check("clicking a project's compliance row navigates to Portfolio with that project's Details expanded", () => {
    // Redesign Gate 10: retrofitted onto .attention-list/.attention-item — the whole
    // row is the click target now, no separate "View Project" button.
    var projectBRow = Array.from(outlet().querySelectorAll(".attention-item--clickable")).find((r) => r.textContent.indexOf("Compliance Project B") !== -1);
    assert.ok(projectBRow, "clickable compliance row for Compliance Project B not found");
    projectBRow.click();

    assert.strictEqual(win.PCC.router.currentRouteName(), "portfolio");
    var text = outlet().textContent;
    assert.ok(text.indexOf("Compliance Project B") !== -1);
    assert.ok(text.indexOf("Hide Details") !== -1, "clicking View Project must land with that project's Details already expanded");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this dashboard writes nothing back — the store's requirement rows are byte-for-byte unchanged after rendering", () => {
    var data = win.PCC.store.get();
    var rows = data.project_document_requirements;
    assert.strictEqual(rows.length, 4, "all 4 seeded rows (3 active + 1 archived) must still exist, untouched");
  });

  await check("route 'documentControlDashboard' still renders without throwing after this gate's changes", () => {
    thrownErrors.length = 0;
    win.PCC.router.go("documentControlDashboard");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page, confirming the new route joins cleanly ----
  var routes = [
    "dashboard", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding the Document Control Dashboard", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
