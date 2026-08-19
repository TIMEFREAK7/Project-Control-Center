// End-to-end jsdom test against the ACTUAL bundled index.html for Document Control's
// Gate 9 (Vendor Lookahead): a new "Document Lookahead" tab on Vendor Management's
// existing Vendor Profile page. Pure read-only aggregation of every
// project_document_requirements row assigned to a vendor (Gate 6's vendor_id) across
// all of that vendor's projects — no new schema fields, nothing written back. Covers:
// the empty state before any assignment, the summary line's assigned/overdue counts,
// per-row project name / due date / computed status badge / linked activity + lead
// time display (Gates 7/8), sorting soonest-due-first, and that assigning/reassigning a
// vendor elsewhere (Portfolio) is reflected here live with no separate wiring.
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
    assert.ok(win.PCC.vendors, "vendors page module must be bundled");
  });

  var vendorId, projectAId, projectBId, boqTypeId, itpTypeId;
  await check("seed a vendor, two projects, and a document type via the store", () => {
    win.PCC.store.update(function (d) {
      var v = win.PCC.store.newVendor({ vendor_name: "Lookahead Test Vendor" });
      d.vendors.push(v);
      vendorId = v.id;

      var pa = win.PCC.store.newProject({ name: "Lookahead Project A" });
      d.projects.push(pa);
      projectAId = pa.id;
      var pb = win.PCC.store.newProject({ name: "Lookahead Project B" });
      d.projects.push(pb);
      projectBId = pb.id;

      var boq = d.document_types.find((t) => t.name === "BOQ");
      boqTypeId = boq.id;
      var itp = d.document_types.find((t) => t.name === "ITP");
      itpTypeId = itp.id;
    });
    assert.ok(vendorId && projectAId && projectBId && boqTypeId && itpTypeId);
  });

  await check("Document Lookahead tab shows an empty state before any requirement is assigned to this vendor", () => {
    win.PCC.vendors.openProfile(vendorId);
    win.PCC.router.go("vendors");
    win.PCC.router.render();
    findButtonByText(dom, "Document Lookahead").click();

    var bodyText = outlet().textContent;
    assert.ok(bodyText.indexOf("No document requirements are currently assigned") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var pastDueReqId, availableReqId, futureLinkedReqId;
  await check("seed three requirements assigned to this vendor: overdue, available, and one linked to an activity with a lead time", () => {
    win.PCC.store.update(function (d) {
      var overdue = win.PCC.store.newProjectDocumentRequirement({
        project_id: projectAId,
        document_type_id: boqTypeId,
        vendor_id: vendorId,
        planned_submission_date: "2020-01-01",
      });
      d.project_document_requirements.push(overdue);
      pastDueReqId = overdue.id;

      var available = win.PCC.store.newProjectDocumentRequirement({
        project_id: projectAId,
        document_type_id: itpTypeId,
        vendor_id: vendorId,
        planned_submission_date: "2020-06-01",
      });
      d.project_document_requirements.push(available);
      availableReqId = available.id;
      d.documents.push(win.PCC.store.newDocument({ project_id: projectAId, filename: "itp.pdf", document_type_id: itpTypeId }));

      var sch = win.PCC.store.newSchedule({ project_id: projectBId, name: "Lookahead Test Schedule" });
      d.schedules.push(sch);
      var act = win.PCC.store.newActivity({ project_id: projectBId, schedule_id: sch.id, name: "Site Mobilization", planned_start: "2027-01-01" });
      d.activities.push(act);
      var futureLinked = win.PCC.store.newProjectDocumentRequirement({
        project_id: projectBId,
        document_type_id: boqTypeId,
        vendor_id: vendorId,
        activity_id: act.id,
        lead_time_days: 15,
      });
      d.project_document_requirements.push(futureLinked);
      futureLinkedReqId = futureLinked.id;
    });
    assert.ok(pastDueReqId && availableReqId && futureLinkedReqId);
  });

  await check("the summary line shows the correct assigned count, project count, and overdue count", () => {
    win.PCC.router.render();
    var bodyText = outlet().textContent;
    assert.ok(bodyText.indexOf("3 document requirements assigned across 2 project(s)") !== -1, "expected the summary line reflecting all 3 rows across both projects; got: " + bodyText);
    assert.ok(bodyText.indexOf("1 overdue") !== -1, "exactly one of the three rows (BOQ in Project A) is overdue");
  });

  await check("the overdue row shows Project A, its due date, and an Overdue badge", () => {
    var bodyText = outlet().textContent;
    assert.ok(bodyText.indexOf("Lookahead Project A") !== -1);
    assert.ok(bodyText.indexOf("Due 2020-01-01") !== -1);
    assert.ok(bodyText.indexOf("OVERDUE") !== -1 || bodyText.indexOf("Overdue") !== -1);
  });

  await check("the row with a matching document shows an Available badge, not Overdue, despite also having a past due date", () => {
    var bodyText = outlet().textContent;
    assert.ok(bodyText.indexOf("AVAILABLE") !== -1 || bodyText.indexOf("Available") !== -1, "a matching document must flip the status to Available even though the due date has passed");
  });

  await check("the activity-linked row shows Project B, the linked schedule/activity name, and the lead time", () => {
    var bodyText = outlet().textContent;
    assert.ok(bodyText.indexOf("Lookahead Project B") !== -1);
    assert.ok(bodyText.indexOf("Lookahead Test Schedule") !== -1);
    assert.ok(bodyText.indexOf("Site Mobilization") !== -1);
    assert.ok(bodyText.indexOf("15d lead time") !== -1);
    assert.ok(bodyText.indexOf("No due date set") !== -1, "this row has no planned_submission_date of its own — the lookahead must not fabricate one, even though it's linked to an activity");
  });

  await check("rows are sorted soonest-due-first (2020-01-01 before 2020-06-01), with the no-due-date row last", () => {
    var bodyText = outlet().textContent;
    var posOverdue = bodyText.indexOf("2020-01-01");
    var posAvailable = bodyText.indexOf("2020-06-01");
    var posNoDue = bodyText.indexOf("No due date set");
    assert.ok(posOverdue !== -1 && posAvailable !== -1 && posNoDue !== -1);
    assert.ok(posOverdue < posAvailable, "the 2020-01-01 row must render before the 2020-06-01 row");
    assert.ok(posAvailable < posNoDue, "a row with no due date must sort after every dated row");
  });

  await check("unassigning the vendor from one requirement removes it from the lookahead on the next render, no separate wiring needed", () => {
    win.PCC.store.update(function (d) {
      var row = d.project_document_requirements.find((r) => r.id === futureLinkedReqId);
      row.vendor_id = "";
    });
    win.PCC.router.render();
    var bodyText = outlet().textContent;
    assert.ok(bodyText.indexOf("2 document requirements assigned across 1 project(s)") !== -1, "unassigning must be reflected live since this tab computes from the store directly; got: " + bodyText);
    assert.ok(bodyText.indexOf("Site Mobilization") === -1, "the unassigned row must no longer appear");
  });

  await check("route 'vendors' still renders without throwing after this gate's changes", () => {
    thrownErrors.length = 0;
    win.PCC.router.go("vendors");
    win.PCC.router.render();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
