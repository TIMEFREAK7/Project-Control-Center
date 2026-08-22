// End-to-end jsdom test against the ACTUAL bundled index.html for Document Control's
// Gate 11 (Reminders/Notifications): a portfolio-wide "Document Reminders" panel on the
// Dashboard (this app's home page) plus two new KPI cards ("Overdue Docs", "Due Soon").
// This app is a single offline file:// deliverable with no server and no channel for
// real push/email — the Dashboard, as the first thing seen on open, is the in-app
// equivalent. Covers: the empty state, an overdue row, a due-soon row (within 14 days),
// a required-but-far-future row correctly excluded, an available row excluded even with
// a past due date, sort order (overdue before due-soon), the KPI counts, and "View
// Project" navigating into Portfolio with that project expanded.
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
  return valueEl ? Number(valueEl.textContent) : undefined;
}
function todayPlusDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Redesign Gate 7 added a "Portfolio Exceptions" panel to Dashboard with a "Pending
// RFIs / TQs" stat chip — its label text happens to contain the substring "RFIs", which
// collides with this file's own whole-page "RFIs" substring checks (there's a document
// TYPE literally named "RFIs" in the seed data, unrelated to that chip). Scopes a check
// to the Document Reminders panel specifically instead of the whole page's text.
function remindersPanelText(dom) {
  const heading = Array.from(dom.window.document.querySelectorAll("h3")).find((h) => h.textContent.indexOf("Document Reminders") === 0);
  return heading ? heading.closest(".panel").textContent : "";
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
  });

  var projectId, boqTypeId, itpTypeId, rfiTypeId;
  await check("seed one project via the store", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Reminders Test Project" });
      d.projects.push(p);
      projectId = p.id;
      boqTypeId = d.document_types.find((t) => t.name === "BOQ").id;
      itpTypeId = d.document_types.find((t) => t.name === "ITP").id;
      rfiTypeId = d.document_types.find((t) => t.name === "RFIs").id;
    });
    assert.ok(projectId && boqTypeId && itpTypeId && rfiTypeId);
  });

  await check("Dashboard shows the empty-state reminders panel and zero-value KPIs before any requirement exists", () => {
    win.PCC.router.go("dashboard");
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Document Reminders (0)") !== -1);
    assert.ok(text.indexOf("Nothing overdue or due within the next 14 days") !== -1);
    assert.strictEqual(kpiValue(dom, "OVERDUE DOCS"), 0);
    assert.strictEqual(kpiValue(dom, "DUE SOON"), 0);
  });

  await check("seed four requirements: overdue, due-soon (within 14 days), far-future required, and available-despite-past-due", () => {
    win.PCC.store.update(function (d) {
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: boqTypeId, planned_submission_date: "2020-01-01" })
      );
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: itpTypeId, planned_submission_date: todayPlusDays(5) })
      );
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: rfiTypeId, planned_submission_date: todayPlusDays(90) })
      );
      var vendorTypeId = d.document_types.find((t) => t.name === "As-Built Drawings").id;
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({ project_id: projectId, document_type_id: vendorTypeId, planned_submission_date: "2020-01-01" })
      );
      d.documents.push(win.PCC.store.newDocument({ project_id: projectId, filename: "asbuilt.pdf", document_type_id: vendorTypeId }));
    });
    win.PCC.router.render();
  });

  await check("the panel shows exactly the overdue and due-soon rows, excluding the far-future one and the available one", () => {
    var text = remindersPanelText(dom);
    assert.ok(text.indexOf("Document Reminders (2)") !== -1, "only 2 of the 4 seeded requirements should qualify; got: " + text.match(/Document Reminders \(\d+\)/));
    assert.ok(text.indexOf("BOQ") !== -1, "the overdue BOQ requirement must appear");
    assert.ok(text.indexOf("ITP") !== -1, "the due-soon ITP requirement must appear");
    assert.ok(text.indexOf("RFIs") === -1, "the far-future (90 days out) RFI requirement must NOT appear");
    // "As-Built Drawings" has a matching document, so it's Available and must not appear
    // despite its own past due date.
    assert.ok(text.indexOf("As-Built Drawings") === -1, "an Available requirement must never appear, even with a past due date");
  });

  await check("rows are sorted overdue-before-due-soon (a single ascending date sort), with correct status badges", () => {
    var text = outlet().textContent;
    var posBoq = text.indexOf("BOQ");
    var posItp = text.indexOf("ITP");
    assert.ok(posBoq !== -1 && posItp !== -1 && posBoq < posItp, "the overdue BOQ row must render before the due-soon ITP row");
    assert.ok(text.indexOf("OVERDUE") !== -1 || text.indexOf("Overdue") !== -1);
    assert.ok(text.indexOf("REQUIRED") !== -1 || text.indexOf("Required") !== -1, "the due-soon row (no matching document) should read Required, not Overdue");
  });

  await check("the KPI cards show the correct overdue and due-soon counts", () => {
    assert.strictEqual(kpiValue(dom, "OVERDUE DOCS"), 1);
    assert.strictEqual(kpiValue(dom, "DUE SOON"), 1);
  });

  await check("'View Project' navigates to Portfolio with the project's Details expanded", () => {
    var viewBtn = findButtonByText(dom, "View Project");
    assert.ok(viewBtn, "View Project button not found");
    viewBtn.click();

    assert.strictEqual(win.PCC.router.currentRouteName(), "portfolio");
    var text = outlet().textContent;
    assert.ok(text.indexOf("Reminders Test Project") !== -1);
    assert.ok(text.indexOf("Hide Details") !== -1, "clicking View Project must land with that project's Details already expanded");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("attaching a matching document for the overdue BOQ requirement removes it from the reminders panel on the next render", () => {
    win.PCC.store.update(function (d) {
      d.documents.push(win.PCC.store.newDocument({ project_id: projectId, filename: "boq.pdf", document_type_id: boqTypeId }));
    });
    win.PCC.router.go("dashboard");
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Document Reminders (1)") !== -1, "fulfilling the overdue requirement must drop the count from 2 to 1; got: " + text.match(/Document Reminders \(\d+\)/));
    assert.ok(text.indexOf("BOQ") === -1, "the now-fulfilled BOQ requirement must no longer appear");
    assert.strictEqual(kpiValue(dom, "OVERDUE DOCS"), 0);
  });

  await check("route 'dashboard' still renders without throwing after this gate's changes", () => {
    thrownErrors.length = 0;
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
