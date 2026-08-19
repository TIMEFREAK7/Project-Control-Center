// End-to-end jsdom test against the ACTUAL bundled index.html for Meeting Action →
// Control Linking — PCC Evolution Roadmap Gate 5 (2026-08-19, this session's own
// numbering: Gate 33, Tier B: Control Integration's final gate). Individual meeting
// action items gain four optional links (vendor_id, activity_id, rfi_id, risk_id),
// independent of the parent meeting's own single activity_id (Gate 10). Covers: the
// Action form's four pickers, persistence, the read-only Meeting Details display, live
// rescoping of Activity/RFI/Risk options when the meeting's project changes, and
// surfacing in the Planner Action Centre's meeting-action rows (Gate 29). schema_version
// 35 -> 36.
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
    assert.ok(win.PCC.pages.meetings, "meetings page module must be bundled");
  });

  var project1Id, project2Id, schedule1Id, activity1Id, activity2Id, vendorId, rfi1Id, rfi2Id, risk1Id, risk2Id;
  await check("seed two projects, each with an activity/RFI/risk, and a portfolio-wide vendor", () => {
    win.PCC.store.update(function (d) {
      var p1 = win.PCC.store.newProject({ name: "Meeting Link Project One" });
      d.projects.push(p1);
      project1Id = p1.id;
      var p2 = win.PCC.store.newProject({ name: "Meeting Link Project Two" });
      d.projects.push(p2);
      project2Id = p2.id;

      var s1 = win.PCC.store.newSchedule({ project_id: project1Id, name: "Baseline", status: "active" });
      d.schedules.push(s1);
      schedule1Id = s1.id;
      var a1 = win.PCC.store.newActivity({ project_id: project1Id, schedule_id: schedule1Id, name: "Project One Activity" });
      d.activities.push(a1);
      activity1Id = a1.id;

      var s2 = win.PCC.store.newSchedule({ project_id: project2Id, name: "Baseline", status: "active" });
      d.schedules.push(s2);
      var a2 = win.PCC.store.newActivity({ project_id: project2Id, schedule_id: s2.id, name: "Project Two Activity" });
      d.activities.push(a2);
      activity2Id = a2.id;

      var v = win.PCC.store.newVendor({ vendor_name: "ABC Electrical" });
      d.vendors.push(v);
      vendorId = v.id;

      var r1 = win.PCC.store.newRfi({ project_id: project1Id, subject: "Project One Query", status: "open" });
      d.rfis.push(r1);
      rfi1Id = r1.id;
      var r2 = win.PCC.store.newRfi({ project_id: project2Id, subject: "Project Two Query", status: "open" });
      d.rfis.push(r2);
      rfi2Id = r2.id;

      var risk1 = win.PCC.store.newRisk({ project_id: project1Id, type: "risk", title: "Project One Risk" });
      d.risks.push(risk1);
      risk1Id = risk1.id;
      var risk2 = win.PCC.store.newRisk({ project_id: project2Id, type: "risk", title: "Project Two Risk" });
      d.risks.push(risk2);
      risk2Id = risk2.id;
    });
    assert.ok(project1Id && project2Id && activity1Id && activity2Id && vendorId && rfi1Id && rfi2Id && risk1Id && risk2Id);
  });

  await check("the Add Meeting form's Action row offers Vendor/Activity/RFI/Risk pickers scoped to the selected project", () => {
    win.PCC.router.go("meetings");
    win.PCC.router.render();
    findButtonByText(dom, "+ Add Meeting").click();

    var titleInput = outlet().querySelector("#meetingfield-title");
    titleInput.value = "Coordination Meeting";
    var projSelect = outlet().querySelector("#meetingfield-project_id");
    projSelect.value = project1Id;

    findButtonByText(dom, "+ Add Action").click();

    var row = outlet().querySelector(".action-editor-row");
    assert.ok(row, "action row not found");
    row.querySelector(".action-desc").value = "Submit revised drawing";

    var vendorSelect = row.querySelector(".action-vendor");
    var activitySelect = row.querySelector(".action-activity");
    var rfiSelect = row.querySelector(".action-rfi");
    var riskSelect = row.querySelector(".action-risk");
    assert.ok(vendorSelect && activitySelect && rfiSelect && riskSelect, "all four link pickers must be present on the action row");

    var activityLabels = Array.from(activitySelect.options).map((o) => o.textContent);
    assert.ok(activityLabels.some((t) => t.indexOf("Project One Activity") !== -1), "Activity picker must offer Project One's own activity");
    assert.ok(!activityLabels.some((t) => t.indexOf("Project Two Activity") !== -1), "Activity picker must NOT offer Project Two's activity while Project One is selected");

    var rfiLabels = Array.from(rfiSelect.options).map((o) => o.textContent);
    assert.ok(rfiLabels.some((t) => t.indexOf("Project One Query") !== -1));
    assert.ok(!rfiLabels.some((t) => t.indexOf("Project Two Query") !== -1));

    var riskLabels = Array.from(riskSelect.options).map((o) => o.textContent);
    assert.ok(riskLabels.some((t) => t === "Project One Risk"));
    assert.ok(!riskLabels.some((t) => t === "Project Two Risk"));

    vendorSelect.value = vendorId;
    activitySelect.value = activity1Id;
    rfiSelect.value = rfi1Id;
    riskSelect.value = risk1Id;
  });

  await check("switching the meeting's project to Project Two live-rescopes the action row's Activity/RFI/Risk pickers (but not Vendor, which is portfolio-wide)", () => {
    var projSelect = outlet().querySelector("#meetingfield-project_id");
    projSelect.value = project2Id;
    projSelect.dispatchEvent(new win.Event("change", { bubbles: true }));

    var row = outlet().querySelector(".action-editor-row");
    var activityLabels = Array.from(row.querySelector(".action-activity").options).map((o) => o.textContent);
    assert.ok(activityLabels.some((t) => t.indexOf("Project Two Activity") !== -1), "Activity picker must now offer Project Two's activity");
    assert.ok(!activityLabels.some((t) => t.indexOf("Project One Activity") !== -1), "Project One's activity must no longer be offered");

    var vendorLabels = Array.from(row.querySelector(".action-vendor").options).map((o) => o.textContent);
    assert.ok(vendorLabels.some((t) => t === "ABC Electrical"), "Vendor list is portfolio-wide and must be unaffected by the project switch");

    // Re-select Project One and re-apply the links for the save step below — switching
    // back doesn't restore a prior selection, it's a fresh rescope each time.
    projSelect.value = project1Id;
    projSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    row.querySelector(".action-vendor").value = vendorId;
    row.querySelector(".action-activity").value = activity1Id;
    row.querySelector(".action-rfi").value = rfi1Id;
    row.querySelector(".action-risk").value = risk1Id;
  });

  await check("saving persists all four links on the meeting's action item", () => {
    outlet().querySelector("form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    var meeting = win.PCC.store.get().meetings.find((m) => m.title === "Coordination Meeting");
    assert.ok(meeting, "meeting was not saved");
    assert.strictEqual(meeting.actions.length, 1);
    var action = meeting.actions[0];
    assert.strictEqual(action.vendor_id, vendorId);
    assert.strictEqual(action.activity_id, activity1Id);
    assert.strictEqual(action.rfi_id, rfi1Id);
    assert.strictEqual(action.risk_id, risk1Id);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the read-only Meeting Details view shows all four links inline", () => {
    win.PCC.router.go("meetings");
    win.PCC.router.render();
    findButtonByText(dom, "Details").click();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Vendor: ABC Electrical") !== -1, "expected Vendor link text; got: " + text);
    assert.ok(text.indexOf("Activity: Project One Activity") !== -1);
    assert.ok(text.indexOf("RFI:") !== -1);
    assert.ok(text.indexOf("Risk: Project One Risk") !== -1);
  });

  await check("the Planner Action Centre shows the linked meeting action with Vendor and Activity annotated", () => {
    win.PCC.router.go("actionCentre");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Submit revised drawing") !== -1);
    assert.ok(text.indexOf("Vendor: ABC Electrical") !== -1);
    assert.ok(text.indexOf("Activity: Project One Activity") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing back beyond the deliberate action edits above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 2);
    assert.strictEqual(data.vendors.length, 1);
    assert.strictEqual(data.rfis.length, 2);
    assert.strictEqual(data.risks.length, 2);
    assert.strictEqual(data.activities.length, 2);
    assert.strictEqual(data.meetings.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding Meeting Action Links", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
