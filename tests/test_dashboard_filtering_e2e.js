// End-to-end jsdom test against the ACTUAL bundled index.html for "final polish" Gate 3
// (Dashboard-level filtering). Confirmed via AskUserQuestion: the identical filter set
// Portfolio's own toolbar already has (Gate 16) — Client/Country/Sector/PM/Planner/Type/
// Year — so switching between Dashboard and Portfolio never drops a filter option a user
// just got used to. Every panel on the page (KPI strip, Management Attention, Document
// Reminders, Recent Projects) now computes over the FILTERED active project set instead
// of always the full active portfolio. No schema change — purely computed UI state,
// same as Portfolio's own filters.
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

function kpiValue(dom, label) {
  const cards = Array.from(dom.window.document.querySelectorAll(".kpi-card"));
  const card = cards.find((c) => c.textContent.indexOf(label) !== -1);
  if (!card) return undefined;
  const valueEl = card.querySelector(".kpi-card__value");
  return valueEl ? Number(valueEl.textContent) : undefined;
}
function findSelectWithOption(dom, optionText) {
  const selects = Array.from(dom.window.document.querySelectorAll("select"));
  return selects.find((s) => Array.from(s.options).some((o) => o.textContent === optionText));
}

// Company/Client/Project Management redesign: Dashboard now also renders its own
// prominent global Company/Client/Project context switcher (spec point 6) — a DIFFERENT,
// intentionally independent picker from this page's own Client/Country/etc. filter row
// under test here. That switcher's Project <select> is deliberately NOT scoped to this
// page's local Client filter (it's the global context, not a local view filter), so its
// <option> list legitimately keeps listing every active project — including one this
// page's own filter just narrowed out — and <option> text counts toward .textContent even
// though only the selected option is visible. Every "must not appear anywhere" check below
// needs the body text with that switcher's own project list excluded, or it would see
// "Harbor Plaza" sitting harmlessly in an unselected <option> and call it a bug.
function bodyTextExcludingContextSwitcher(outletEl) {
  const clone = outletEl.cloneNode(true);
  const contextGroup = clone.querySelector(".title-block__context-group");
  if (contextGroup) contextGroup.remove();
  return clone.textContent;
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

  await check("app boots on the bundled index.html without throwing, no filter row before any project exists", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    assert.strictEqual(findSelectWithOption(dom, "All clients"), undefined, "filter row must not render with zero active projects");
  });

  var projectAId, projectBId;
  await check("seed two active projects with different Client/Country/Sector/PM/Planner/Type/Year, and a risk on each", () => {
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newProject({
        name: "Riverside Tower", status: "on_track", client: "Acme Corp", country: "India", sector: "Residential",
        project_manager: "Asha Rao", planner: "Vikram Nair", project_type: "Construction", start_date: "2025-06-01",
      });
      d.projects.push(a);
      projectAId = a.id;
      var b = win.PCC.store.newProject({
        name: "Harbor Plaza", status: "at_risk", client: "Beta Industries", country: "UAE", sector: "Commercial",
        project_manager: "Deepak Shah", planner: "Meera Iyer", project_type: "Fit-Out", start_date: "2026-01-15",
      });
      d.projects.push(b);
      projectBId = b.id;
      d.risks.push(win.PCC.store.newRisk({ project_id: projectAId, type: "risk", title: "Riverside Tower risk", status: "open", probability: "high", impact: "high" }));
      d.risks.push(win.PCC.store.newRisk({ project_id: projectBId, type: "risk", title: "Harbor Plaza risk", status: "open", probability: "high", impact: "high" }));
    });
    win.PCC.router.render();
    assert.ok(projectAId && projectBId);
  });

  await check("the filter row renders with both projects' distinct values, and KPIs/Recent Projects reflect the unfiltered full set", () => {
    var clientSelect = findSelectWithOption(dom, "All clients");
    assert.ok(clientSelect, "client filter select not found");
    var clientOptions = Array.from(clientSelect.options).map((o) => o.textContent);
    assert.deepStrictEqual(clientOptions, ["All clients", "Acme Corp", "Beta Industries"]);

    assert.strictEqual(kpiValue(dom, "ACTIVE PROJECTS"), 2);
    var text = bodyTextExcludingContextSwitcher(outlet());
    assert.ok(text.indexOf("Riverside Tower") !== -1 && text.indexOf("Harbor Plaza") !== -1);
    assert.ok(text.indexOf("across 2 active projects.") !== -1, "got: " + text.slice(0, 300));
  });

  await check("filtering by Client 'Acme Corp' narrows the KPI strip, Recent Projects, and Management Attention to just that project", () => {
    var clientSelect = findSelectWithOption(dom, "All clients");
    clientSelect.value = "Acme Corp";
    clientSelect.dispatchEvent(new win.Event("change", { bubbles: true }));

    assert.strictEqual(kpiValue(dom, "ACTIVE PROJECTS"), 1);
    var text = bodyTextExcludingContextSwitcher(outlet());
    assert.ok(text.indexOf("Riverside Tower") !== -1);
    assert.ok(text.indexOf("Harbor Plaza") === -1, "Harbor Plaza must be filtered out everywhere, including Recent Projects and Management Attention");
    assert.ok(text.indexOf("Riverside Tower risk") !== -1, "Management Attention must still show the matching project's own alert");
    assert.ok(text.indexOf("Harbor Plaza risk") === -1, "Management Attention must not show the filtered-out project's alert");
    assert.ok(text.indexOf("across 1 of 2 active projects matching these filters.") !== -1, "got: " + text.slice(0, 300));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("combining with a non-matching Country filter excludes everything and shows the 'no match' empty state", () => {
    var countrySelect = findSelectWithOption(dom, "All countries");
    countrySelect.value = "UAE"; // Acme Corp's project is India, not UAE — no project satisfies both filters
    countrySelect.dispatchEvent(new win.Event("change", { bubbles: true }));

    assert.strictEqual(kpiValue(dom, "ACTIVE PROJECTS"), 0);
    var text = bodyTextExcludingContextSwitcher(outlet());
    assert.ok(text.indexOf("No active projects match these filters.") !== -1, "got: " + text.slice(0, 400));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    // Reset both filters back to "All" for subsequent checks.
    countrySelect.value = "";
    countrySelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    var clientSelect = findSelectWithOption(dom, "Acme Corp");
    clientSelect.value = "";
    clientSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
  });

  await check("resetting filters back to 'All' restores the full unfiltered view", () => {
    assert.strictEqual(kpiValue(dom, "ACTIVE PROJECTS"), 2);
    var text = bodyTextExcludingContextSwitcher(outlet());
    assert.ok(text.indexOf("Riverside Tower") !== -1 && text.indexOf("Harbor Plaza") !== -1);
  });

  await check("the Year filter is built from start_date and narrows correctly", () => {
    var yearSelect = findSelectWithOption(dom, "All years");
    assert.ok(yearSelect, "year filter select not found");
    var yearOptions = Array.from(yearSelect.options).map((o) => o.textContent);
    assert.deepStrictEqual(yearOptions, ["All years", "2025", "2026"]);

    yearSelect.value = "2026";
    yearSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    assert.strictEqual(kpiValue(dom, "ACTIVE PROJECTS"), 1);
    assert.ok(outlet().textContent.indexOf("Harbor Plaza") !== -1);
    yearSelect.value = "";
    yearSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
  });

  await check("this gate writes nothing back — record counts unchanged, no schema change", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 2);
    assert.strictEqual(data.risks.length, 2);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "lessonsLearned", "knowledgeBase", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after this gate's changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
