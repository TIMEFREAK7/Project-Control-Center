// End-to-end jsdom test against the ACTUAL bundled index.html for Document Control's
// Gate 14 (Portfolio Compliance) — the final gate of the 14-gate sub-spec. Adds a
// "Document Control Compliance" section to the existing printable Portfolio Summary
// Report (reports.js), rather than a new page: overall Available/Required/Overdue KPIs
// plus a per-project compliance table, worst-compliance-first. No schema changes,
// nothing written back. Also the first dedicated test file for reports.js itself, since
// none existed before this gate.
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

  // reports.js is a React-migrated page: a raw `.value =` assignment doesn't reliably
  // reach a controlled <select>'s onChange, so bypass it via the native prototype
  // descriptor — and flush both before interacting (router.js's suppressNextHashRender
  // is a single flag; a hashchange-triggered render can land asynchronously after this
  // go()+render() pair) and after (the section select's onChange, and the assembled
  // report's own non-initial effect, both commit asynchronously) — see CLAUDE.md's
  // React migration notes.
  async function switchToPortfolioReport() {
    win.PCC.router.go("reports");
    win.PCC.router.render();
    await flush();
    var select = Array.from(outlet().querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Portfolio Summary Report")
    );
    Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(select, "portfolio");
    select.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush();
  }
  // Scoped to just the "Document Control Compliance" section's own subtree — the page
  // also has a hidden (display:none, but still in the DOM/textContent) project-status
  // dropdown listing EVERY project including archived ones, so a whole-page text search
  // would find "Archived ..." there regardless of what this section itself renders.
  function docControlSection() {
    var heading = Array.from(outlet().querySelectorAll("h3")).find((h) => h.textContent.indexOf("Document Control Compliance") === 0);
    return heading ? heading.parentElement : null;
  }

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.pages.reports, "reports page module must be bundled");
  });

  await check("Portfolio Summary Report shows the Document Control Compliance section's empty state before any requirement exists", async () => {
    await switchToPortfolioReport();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Document Control Compliance") !== -1, "the new section must render");
    assert.ok(text.indexOf("No document requirements assigned across the active portfolio.") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var projA, projB, archivedProj, boqTypeId, itpTypeId;
  await check("seed two active projects, one archived project, and two document types via the store", () => {
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newProject({ name: "Compliance Report Project A" });
      d.projects.push(a);
      projA = a.id;
      var b = win.PCC.store.newProject({ name: "Compliance Report Project B" });
      d.projects.push(b);
      projB = b.id;
      var arch = win.PCC.store.newProject({ name: "Archived Compliance Project", archived: true });
      d.projects.push(arch);
      archivedProj = arch.id;
      boqTypeId = d.document_types.find((t) => t.name === "BOQ").id;
      itpTypeId = d.document_types.find((t) => t.name === "ITP").id;
    });
    assert.ok(projA && projB && archivedProj && boqTypeId && itpTypeId);
  });

  await check("seed requirements: Project A gets 1 available + 1 overdue, Project B gets 1 required (not overdue), archived project gets 1 (must be excluded)", async () => {
    win.PCC.store.update(function (d) {
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: projA, document_type_id: boqTypeId }));
      d.documents.push(win.PCC.store.newDocument({ project_id: projA, filename: "a-boq.pdf", document_type_id: boqTypeId }));
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projA, document_type_id: itpTypeId, planned_submission_date: "2020-01-01" })
      );
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projB, document_type_id: boqTypeId, planned_submission_date: "2030-01-01" })
      );
      d.project_document_requirements.push(win.PCC.store.newProjectDocumentRequirement({ project_id: archivedProj, document_type_id: boqTypeId }));
    });
    await switchToPortfolioReport();
  });

  await check("the section header shows the correct portfolio-wide %, total, and overdue count, excluding the archived project's requirement", () => {
    var text = docControlSection().textContent;
    // 3 active requirements (1 available, 1 overdue, 1 required) => 1/3 = 33%.
    assert.ok(text.indexOf("Document Control Compliance — 33% available across portfolio (3 requirement(s), 1 overdue)") !== -1, "got: " + text.match(/Document Control Compliance[^\n]*/));
  });

  await check("the per-project table lists both active projects worst-first, and never the archived one", () => {
    var text = docControlSection().textContent;
    assert.ok(text.indexOf("Compliance Report Project A") !== -1);
    assert.ok(text.indexOf("Compliance Report Project B") !== -1);
    assert.ok(text.indexOf("Archived Compliance Project") === -1, "an archived project must never appear in this report section");

    var posA = text.indexOf("Compliance Report Project A");
    var posB = text.indexOf("Compliance Report Project B");
    // Project A: 1 of 2 available = 50%. Project B: 0 of 1 available = 0%. B is worse, so B must render first.
    assert.ok(posB !== -1 && posA !== -1 && posB < posA, "Project B (0% available) must render before Project A (50% available) — worst-compliance-first");
  });

  await check("the table cells show the correct available/overdue/percentage values per project", () => {
    var rows = Array.from(docControlSection().querySelectorAll("table tr")).map((tr) => tr.textContent.replace(/\s+/g, " ").trim());
    var rowA = rows.find((r) => r.indexOf("Compliance Report Project A") !== -1);
    var rowB = rows.find((r) => r.indexOf("Compliance Report Project B") !== -1);
    assert.ok(rowA && rowA.indexOf("1 of 2") !== -1 && rowA.indexOf("50%") !== -1, "Project A row: " + rowA);
    assert.ok(rowB && rowB.indexOf("0 of 1") !== -1 && rowB.indexOf("0%") !== -1, "Project B row: " + rowB);
  });

  await check("this report section writes nothing back — all 4 seeded requirement rows are unchanged after rendering", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.project_document_requirements.length, 4);
  });

  await check("Print / Save as PDF still calls window.print() with the new section present", () => {
    var originalPrint = win.print;
    var called = false;
    win.print = function () { called = true; };
    var printBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Print / Save as PDF");
    assert.ok(printBtn, "Print button not found");
    printBtn.click();
    assert.ok(called, "window.print() should have been called");
    win.print = originalPrint;
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding the Document Control Compliance report section", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
