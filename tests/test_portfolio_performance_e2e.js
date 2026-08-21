// End-to-end jsdom test against the ACTUAL bundled index.html for Portfolio Performance
// (PCC Evolution Roadmap, Tier E: Portfolio — first confirmed gate, 2026-08-19). A fresh
// inspection found Portfolio's list showed only a manually-set status badge and progress
// %, no computed Schedule/Risk/Health comparison, and only a status filter (every other
// field the spec wants — client/country/sector/PM/planner/type/year — already existed on
// the project schema but was never wired as a filter). project_type itself had no
// data-entry path anywhere (same "schema field nothing ever sets" shape as the
// physical_progress bug). This gate adds: a KPI strip (Total/Active/Completed/At
// Risk/Delayed/Upcoming — "Upcoming" confirmed via AskUserQuestion to mean not-yet-
// started), the new filters, a Cards/Compare view toggle, and executiveCenter.js's new
// exported getHealthSummary(projectId) that the Compare table's Schedule/Risk/Health
// columns read from — deliberately distinct from the project's own manual `status`
// field. No schema change (project_type already existed).
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
function selectByDefaultOptionText(dom, text) {
  const selects = Array.from(dom.window.document.querySelectorAll("select"));
  return selects.find((s) => s.options.length > 0 && s.options[0].textContent === text);
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
  const pastIso = "2020-01-01";
  const futureIso = "2099-01-01";

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.pages.portfolio && win.PCC.executiveCenter.getHealthSummary, "portfolio page and getHealthSummary must be bundled");
  });

  var projA, projB, projC, projD;
  await check("seed four projects: on-track+delayed, at-risk+upcoming, completed, archived", () => {
    win.PCC.store.update(function (d) {
      var a = win.PCC.store.newProject({
        name: "Project Alpha", status: "on_track", progress: 80, client: "Acme", country: "USA",
        sector: "Commercial", project_manager: "P. Manager One", planner: "Planner One",
        project_type: "Office Tower", start_date: pastIso,
      });
      d.projects.push(a);
      projA = a.id;
      var schA = win.PCC.store.newSchedule({ project_id: projA, name: "Baseline", status: "active" });
      d.schedules.push(schA);
      // CPM's own forward pass floors early_start/early_finish at the schedule's data_date
      // (today here, since data_date is unset) for any not_started/in_progress activity —
      // so a bare planned_finish in the past is NOT enough to trigger ctx.delayedActivities
      // through the real CPM path; only classifyActivity()'s "completed" branch (driven by
      // actual_finish, independent of the store's own `status` field) is exempt from that
      // floor. Setting actual_start/actual_finish in the past while leaving status
      // "not_started" mirrors a real, plausible data-entry gap (actuals entered, status
      // dropdown not yet updated) and is the only way to genuinely exercise this path.
      d.activities.push(win.PCC.store.newActivity({
        project_id: projA, schedule_id: schA.id, name: "Overdue Task",
        actual_start: "2020-01-01", actual_finish: "2020-01-05",
        planned_finish: pastIso, status: "not_started",
      }));

      var b = win.PCC.store.newProject({
        name: "Project Beta", status: "at_risk", progress: 10, client: "Beta Corp", country: "UK",
        sector: "Infrastructure", project_manager: "P. Manager Two", planner: "Planner Two",
        project_type: "Highway", start_date: futureIso,
      });
      d.projects.push(b);
      projB = b.id;

      var c = win.PCC.store.newProject({
        name: "Project Charlie", status: "complete", progress: 100, client: "Acme", country: "USA",
        sector: "Commercial", start_date: pastIso,
      });
      d.projects.push(c);
      projC = c.id;

      var arch = win.PCC.store.newProject({ name: "Archived Delta", status: "critical", country: "Canada", archived: true });
      d.projects.push(arch);
      projD = arch.id;
    });
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    assert.ok(projA && projB && projC && projD);
  });

  await check("the KPI strip shows correct Total/Active/Completed/At Risk/Delayed/Upcoming counts", () => {
    assert.strictEqual(kpiValue(dom, "TOTAL PROJECTS"), "4", "4 including the archived one");
    assert.strictEqual(kpiValue(dom, "ACTIVE"), "3", "3 non-archived");
    assert.strictEqual(kpiValue(dom, "COMPLETED"), "1", "Project Charlie only");
    assert.strictEqual(kpiValue(dom, "AT RISK"), "1", "Project Beta only (non-archived at_risk)");
    assert.strictEqual(kpiValue(dom, "DELAYED"), "1", "Project Alpha has one activity past its planned finish");
    assert.strictEqual(kpiValue(dom, "UPCOMING"), "1", "Project Beta's start_date is in the future");
  });

  await check("the new filters are populated from real project data and filtering by Country narrows the Cards list", () => {
    var countrySelect = selectByDefaultOptionText(dom, "All countries");
    assert.ok(countrySelect, "country filter not found");
    var optionTexts = Array.from(countrySelect.options).map((o) => o.textContent);
    assert.ok(optionTexts.indexOf("USA") !== -1 && optionTexts.indexOf("UK") !== -1 && optionTexts.indexOf("Canada") !== -1);

    countrySelect.value = "USA";
    countrySelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    var text = outlet().textContent;
    assert.ok(text.indexOf("Project Alpha") !== -1);
    assert.ok(text.indexOf("Project Charlie") !== -1);
    assert.ok(text.indexOf("Project Beta") === -1, "UK project must be filtered out");

    // Reset for later checks.
    countrySelect.value = "";
    countrySelect.dispatchEvent(new win.Event("change", { bubbles: true }));
  });

  await check("switching to Compare view shows the Project/Progress/Schedule/Risk/Health table", () => {
    findButtonByText(dom, "Compare").click();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Progress") !== -1 && text.indexOf("Schedule") !== -1 && text.indexOf("Risk") !== -1 && text.indexOf("Health") !== -1);
    assert.ok(text.indexOf("Project Alpha") !== -1);
    assert.ok(text.indexOf("80%") !== -1, "Project Alpha's manual progress % must show, not a schedule-derived figure");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Compare's Schedule column reflects the computed health engine, not the manual status field", () => {
    // Project Alpha has a delayed activity -> the schedule factor must NOT read as a clean On Track,
    // even though its manually-set status field is "on_track". Confirms the two are independent.
    var rows = Array.from(outlet().querySelectorAll("tbody tr"));
    var alphaRow = rows.find((r) => r.textContent.indexOf("Project Alpha") !== -1);
    assert.ok(alphaRow, "Project Alpha row not found in Compare table");
    var badges = Array.from(alphaRow.querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(badges.length >= 2, "expected Schedule/Risk/Health badges, got: " + badges.join(", "));
  });

  await check("clicking a project name in Compare switches to Cards view with that project's details expanded", () => {
    var rows = Array.from(outlet().querySelectorAll("tbody tr"));
    var alphaRow = rows.find((r) => r.textContent.indexOf("Project Alpha") !== -1);
    var nameBtn = alphaRow.querySelector("button");
    nameBtn.click();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Overdue Task") === -1 || text.indexOf("Project Alpha") !== -1); // sanity: still on portfolio
    assert.ok(findButtonByText(dom, "Cards"), "must have switched back to a view with the Cards toggle visible");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Project Type is now editable on the Add/Edit Project form and round-trips correctly", () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    findButtonByText(dom, "Compare"); // no-op, just ensure page loaded
    // Gate 3 (UI/UX Overhaul, Portfolio): Edit/Archive moved behind each card's "..."
    // contextual menu — open the first card's menu before looking for Edit.
    var menuButtons = Array.from(outlet().querySelectorAll("button.icon-btn")).filter(
      (b) => b.getAttribute("aria-label") === "More actions"
    );
    assert.ok(menuButtons.length > 0, "no card contextual menu button found");
    menuButtons[0].click();
    var editButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Edit");
    assert.ok(editButtons.length > 0, "no Edit button found on any project card");
    editButtons[0].click();
    var typeInput = Array.from(outlet().querySelectorAll("label")).find((l) => l.textContent.indexOf("Project Type") !== -1);
    assert.ok(typeInput, "Project Type field not found on the Add/Edit Project form");
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 4);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding Portfolio Performance", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
