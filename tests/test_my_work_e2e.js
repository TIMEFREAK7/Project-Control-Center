// End-to-end jsdom test against the ACTUAL bundled index.html for My Work (PCC Evolution
// Roadmap, Tier E: Personal Workbench — Gate 17, 2026-08-19). A fresh inspection found no
// personal cockpit page existed; Dashboard is portfolio-wide status, Action Centre is
// date-bucketed due items only. This gate adds a new "My Work" page organized by the
// spec's own four sections (TODAY / THIS WEEK / WAITING FOR / RECENTLY UPDATED), plus the
// schema v40 fields it needed: waiting_on_party (RFI/TQ, Change Orders, Decisions),
// next_follow_up_date (Vendor), review_cadence_days (Project, defaults to 7).
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
// Section headings ("TODAY"/"THIS WEEK"/"WAITING FOR"/"RECENTLY UPDATED") repeat panel
// titles across sections (e.g. "Meetings" appears under both THIS WEEK and RECENTLY
// UPDATED), so panels must be scoped to their section rather than searched globally.
function sectionPanels(dom, sectionLabel) {
  const outlet = dom.window.document.getElementById("page-outlet");
  const wrap = outlet.firstElementChild;
  const children = Array.from(wrap.children);
  const idx = children.findIndex((el) => el.tagName === "P" && el.textContent.trim() === sectionLabel);
  if (idx === -1) return [];
  const gridDiv = children[idx + 1];
  return Array.from(gridDiv.querySelectorAll(".panel"));
}
function panelByHeading(dom, sectionLabel, headingStartsWith) {
  return sectionPanels(dom, sectionLabel).find((p) => {
    const h3 = p.querySelector("h3");
    return h3 && h3.textContent.indexOf(headingStartsWith) === 0;
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
    assert.ok(win.PCC.pages.myWork, "myWork page must be bundled");
    assert.ok(win.PCC.store.WAITING_ON_PARTIES, "WAITING_ON_PARTIES must be exported");
  });

  var projId;
  await check("seed one project covering every My Work section", () => {
    win.PCC.store.update(function (d) {
      var proj = win.PCC.store.newProject({
        name: "Riverside Tower",
        status: "on_track",
        start_date: addDaysIso(-10), // -> review due date = start + 7 days = 3 days ago (overdue)
      });
      d.projects.push(proj);
      projId = proj.id;

      var sch = win.PCC.store.newSchedule({ project_id: projId, name: "Baseline", status: "active" });
      d.schedules.push(sch);

      // TODAY: Activities to Update — not_started, planned_start in the past.
      d.activities.push(
        win.PCC.store.newActivity({
          project_id: projId, schedule_id: sch.id, name: "Excavation",
          activity_type: "task", status: "not_started", planned_start: addDaysIso(-2),
        })
      );
      // THIS WEEK: Milestones — not complete, early_start/planned_start within 7 days.
      d.activities.push(
        win.PCC.store.newActivity({
          project_id: projId, schedule_id: sch.id, name: "Slab Pour Complete",
          activity_type: "milestone", status: "not_started", planned_start: addDaysIso(2),
        })
      );

      // TODAY: Overdue Actions (a Meeting Action past due) + Today's Meetings.
      d.meetings.push(
        win.PCC.store.newMeeting({
          project_id: projId, title: "Site Progress Meeting", meeting_date: todayIso(),
          actions: [win.PCC.store.newMeetingAction({ description: "Overdue Punch List Item", due_date: addDaysIso(-1), status: "open" })],
        })
      );
      // THIS WEEK: Meetings.
      d.meetings.push(
        win.PCC.store.newMeeting({ project_id: projId, title: "Design Kickoff Review", meeting_date: addDaysIso(3) })
      );

      // TODAY: Approvals + WAITING FOR (management).
      d.change_orders.push(
        win.PCC.store.newChangeOrder({ project_id: projId, title: "Additional Piling", status: "pending", waiting_on_party: "management" })
      );
      // WAITING FOR (vendor).
      d.change_orders.push(
        win.PCC.store.newChangeOrder({ project_id: projId, title: "Facade Revision", status: "pending", waiting_on_party: "vendor" })
      );

      // TODAY: Approvals + WAITING FOR (consultant).
      d.decisions.push(
        win.PCC.store.newDecision({ project_id: projId, title: "Consultant Sign-off", status: "pending", waiting_on_party: "consultant" })
      );

      // WAITING FOR (client).
      d.rfis.push(
        win.PCC.store.newRfi({ project_id: projId, subject: "Foundation Query", status: "open", date_required: addDaysIso(10), waiting_on_party: "client" })
      );

      // RECENTLY UPDATED (Risks).
      d.risks.push(win.PCC.store.newRisk({ project_id: projId, type: "risk", title: "Ground Conditions Risk", status: "open" }));

      // THIS WEEK: Vendor Follow-ups.
      var vendor = win.PCC.store.newVendor({ vendor_name: "Acme Rebar Supply", next_follow_up_date: addDaysIso(3) });
      d.vendors.push(vendor);
    });
    win.PCC.router.go("myWork");
    win.PCC.router.render();
    assert.ok(projId);
  });

  await check("TODAY: Overdue Actions, Today's Meetings, Approvals, Activities to Update all show their seeded item", () => {
    const overdue = panelByHeading(dom, "TODAY", "Overdue Actions");
    assert.ok(overdue && overdue.textContent.indexOf("Overdue Punch List Item") !== -1, "overdue meeting action must show");

    const todaysMeetings = panelByHeading(dom, "TODAY", "Today's Meetings");
    assert.ok(todaysMeetings && todaysMeetings.textContent.indexOf("Site Progress Meeting") !== -1, "today's meeting must show");

    const approvals = panelByHeading(dom, "TODAY", "Approvals");
    assert.ok(approvals && approvals.textContent.indexOf("Additional Piling") !== -1, "pending change order must show");
    assert.ok(approvals.textContent.indexOf("Consultant Sign-off") !== -1, "pending decision must show");

    const toUpdate = panelByHeading(dom, "TODAY", "Activities to Update");
    assert.ok(toUpdate && toUpdate.textContent.indexOf("Excavation") !== -1, "stale not_started activity must show");
  });

  await check("THIS WEEK: Meetings, Milestones, Vendor Follow-ups, Reviews all show their seeded item", () => {
    const weekMeetings = panelByHeading(dom, "THIS WEEK", "Meetings");
    assert.ok(weekMeetings && weekMeetings.textContent.indexOf("Design Kickoff Review") !== -1, "this week's meeting must show");

    const milestones = panelByHeading(dom, "THIS WEEK", "Milestones");
    assert.ok(milestones && milestones.textContent.indexOf("Slab Pour Complete") !== -1, "this week's milestone must show");

    const followups = panelByHeading(dom, "THIS WEEK", "Vendor Follow-ups");
    assert.ok(followups && followups.textContent.indexOf("Acme Rebar Supply") !== -1, "vendor follow-up must show");

    const reviews = panelByHeading(dom, "THIS WEEK", "Reviews");
    assert.ok(reviews && reviews.textContent.indexOf("Riverside Tower") !== -1, "overdue review (no review ever taken, cadence default 7) must show");
  });

  await check("WAITING FOR: each party bucket shows exactly its own item", () => {
    assert.ok(panelByHeading(dom, "WAITING FOR", "Vendor").textContent.indexOf("Facade Revision") !== -1);
    assert.ok(panelByHeading(dom, "WAITING FOR", "Client").textContent.indexOf("Foundation Query") !== -1);
    assert.ok(panelByHeading(dom, "WAITING FOR", "Consultant").textContent.indexOf("Consultant Sign-off") !== -1);
    assert.ok(panelByHeading(dom, "WAITING FOR", "Management").textContent.indexOf("Additional Piling") !== -1);
  });

  await check("RECENTLY UPDATED: Projects/Activities/RFIs/Risks/Meetings each show a seeded record", () => {
    const recentProjects = panelByHeading(dom, "RECENTLY UPDATED", "Projects");
    assert.ok(recentProjects && recentProjects.textContent.indexOf("Riverside Tower") !== -1);

    const recentActivities = panelByHeading(dom, "RECENTLY UPDATED", "Activities");
    assert.ok(recentActivities && recentActivities.textContent.indexOf("Excavation") !== -1);

    const recentRfis = panelByHeading(dom, "RECENTLY UPDATED", "RFIs");
    assert.ok(recentRfis && recentRfis.textContent.indexOf("Foundation Query") !== -1);

    const recentRisks = panelByHeading(dom, "RECENTLY UPDATED", "Risks");
    assert.ok(recentRisks && recentRisks.textContent.indexOf("Ground Conditions Risk") !== -1);

    const recentMeetings = panelByHeading(dom, "RECENTLY UPDATED", "Meetings");
    assert.ok(recentMeetings && (recentMeetings.textContent.indexOf("Site Progress Meeting") !== -1 || recentMeetings.textContent.indexOf("Design Kickoff Review") !== -1));
  });

  await check("clicking View on an Approvals item navigates to the Decision Register with that decision expanded", () => {
    const approvals = panelByHeading(dom, "TODAY", "Approvals");
    const rows = Array.from(approvals.querySelectorAll("div")).filter((r) => r.textContent.indexOf("Consultant Sign-off") !== -1);
    const viewBtn = rows[0] && Array.from(rows[0].querySelectorAll("button")).find((b) => b.textContent.trim() === "View");
    assert.ok(viewBtn, "View button not found on the Consultant Sign-off row");
    viewBtn.click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "decisionRegister");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    win.PCC.router.go("myWork");
    win.PCC.router.render();
  });

  await check("waiting_on_party (\"Waiting On\") is editable and round-trips on RFI/TQ, Change Order, and Decision forms", () => {
    win.PCC.router.go("rfis");
    win.PCC.router.render();
    var rfiEdit = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit");
    assert.ok(rfiEdit, "no Edit button found on the seeded RFI");
    rfiEdit.click();
    var rfiSelect = win.document.getElementById("rfifield-waiting_on_party");
    assert.ok(rfiSelect, "Waiting On select not found on RFI form");
    assert.strictEqual(rfiSelect.value, "client", "must reflect the seeded value");

    win.PCC.router.go("changeOrders");
    win.PCC.router.render();
    var coEdit = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit");
    assert.ok(coEdit, "no Edit button found on a seeded Change Order");
    coEdit.click();
    var coSelect = win.document.getElementById("cofield-waiting_on_party");
    assert.ok(coSelect, "Waiting On select not found on Change Order form");

    win.PCC.router.go("decisionRegister");
    win.PCC.router.render();
    var decEdit = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit");
    assert.ok(decEdit, "no Edit button found on the seeded Decision");
    decEdit.click();
    var decSelect = win.document.getElementById("decfield-waiting_on_party");
    assert.ok(decSelect, "Waiting On select not found on Decision form");
    assert.strictEqual(decSelect.value, "consultant", "must reflect the seeded value");
  });

  await check("Vendor's Next Follow-up Date round-trips and Portfolio's edit form has a Review Cadence field", () => {
    win.PCC.router.go("vendors");
    win.PCC.router.render();
    findButtonByText(dom, "Vendor List").click();
    var vendorEdit = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit");
    assert.ok(vendorEdit, "no Edit button found on the seeded vendor");
    vendorEdit.click();
    var followUpInput = win.document.getElementById("vendorfield-next_follow_up_date");
    assert.ok(followUpInput, "Next Follow-up Date field not found on the vendor form");
    assert.strictEqual(followUpInput.value, addDaysIso(3), "must reflect the seeded value");

    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    // Gate 3 (UI/UX Overhaul, Portfolio): Edit/Archive moved behind each card's "..."
    // contextual menu — open the first card's menu before looking for Edit.
    var menuButtons = Array.from(outlet().querySelectorAll("button.icon-btn")).filter(
      (b) => b.getAttribute("aria-label") === "More actions"
    );
    assert.ok(menuButtons.length > 0, "no card contextual menu button found");
    menuButtons[0].click();
    var editButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Edit");
    assert.ok(editButtons.length > 0);
    editButtons[0].click();
    var cadenceSelect = win.document.getElementById("field-review_cadence_days");
    assert.ok(cadenceSelect, "Review Cadence field not found on the project edit form");
    assert.strictEqual(cadenceSelect.value, "7", "must default to weekly (7 days)");
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged", () => {
    win.PCC.router.go("myWork");
    win.PCC.router.render();
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.activities.length, 2);
    assert.strictEqual(data.meetings.length, 2);
    assert.strictEqual(data.change_orders.length, 2);
    assert.strictEqual(data.decisions.length, 1);
    assert.strictEqual(data.rfis.length, 1);
    assert.strictEqual(data.risks.length, 1);
    assert.strictEqual(data.vendors.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding My Work", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
