// End-to-end jsdom test against the ACTUAL bundled index.html for Document Control's
// Gate 10 (Readiness/Constraints): a new "Document Readiness" section on the Schedule
// module's existing Activity Detail Panel, next to Gate 10 (Activity Linking)'s own
// Linked Records section. Reads Gate 21's activity_id link in reverse — every
// project_document_requirements row that names an activity as its governing activity —
// and shows a computed Available/Overdue/Required badge per row plus an overall
// READY/NOT READY summary line. Pure read-only, no new schema fields, nothing written
// back, no enforcement (an activity stays fully editable regardless of readiness).
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.schedule, "schedule page module must be bundled");
  });

  var projectId, scheduleId, notReadyActivityId, readyActivityId, unlinkedActivityId, boqTypeId, itpTypeId;
  await check("seed a project, a schedule, and three activities via the store", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Readiness Test Project" });
      d.projects.push(p);
      projectId = p.id;

      var sch = win.PCC.store.newSchedule({ project_id: projectId, name: "Readiness Test Schedule" });
      d.schedules.push(sch);
      scheduleId = sch.id;

      var notReady = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Excavate Foundation" });
      d.activities.push(notReady);
      notReadyActivityId = notReady.id;

      var ready = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Pour Concrete" });
      d.activities.push(ready);
      readyActivityId = ready.id;

      var unlinked = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Erect Steel" });
      d.activities.push(unlinked);
      unlinkedActivityId = unlinked.id;

      boqTypeId = d.document_types.find((t) => t.name === "BOQ").id;
      itpTypeId = d.document_types.find((t) => t.name === "ITP").id;
    });
    assert.ok(projectId && scheduleId && notReadyActivityId && readyActivityId && unlinkedActivityId);
  });

  await check("an activity with no linked document requirements shows the empty state, not fabricated content", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, unlinkedActivityId);
    win.PCC.router.go("schedule");

    var text = outlet().textContent;
    assert.ok(text.indexOf("Erect Steel") !== -1, "should be showing the unlinked activity");
    assert.ok(text.indexOf("DOCUMENT READINESS (0)") !== -1);
    assert.ok(text.indexOf("No document requirements are linked to this activity yet") !== -1);
    assert.ok(text.indexOf("READY") === -1 && text.indexOf("NOT READY") === -1, "no readiness line should render when there's nothing to be ready about");
  });

  await check("linking one requirement with no matching document shows NOT READY with a Required badge", () => {
    win.PCC.store.update(function (d) {
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({
          project_id: projectId,
          document_type_id: boqTypeId,
          activity_id: notReadyActivityId,
          planned_submission_date: "2027-01-01",
        })
      );
    });
    win.PCC.schedule.viewActivity(projectId, scheduleId, notReadyActivityId);
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Excavate Foundation") !== -1);
    assert.ok(text.indexOf("DOCUMENT READINESS (1)") !== -1);
    assert.ok(text.indexOf("NOT READY") !== -1, "one unfulfilled requirement must flag the activity as not ready");
    assert.ok(text.indexOf("BOQ") !== -1);
    assert.ok(text.indexOf("due 2027-01-01") !== -1);
    assert.ok(text.indexOf("REQUIRED") !== -1 || text.indexOf("Required") !== -1);
  });

  await check("a past due date on an unfulfilled requirement shows an Overdue badge, still NOT READY", () => {
    win.PCC.store.update(function (d) {
      var row = d.project_document_requirements.find((r) => r.activity_id === notReadyActivityId);
      row.planned_submission_date = "2020-01-01";
    });
    // A plain render() remounts Schedule fresh, so the Activity Detail Panel's
    // one-shot pending prop must be re-set before each render, not just once.
    win.PCC.schedule.viewActivity(projectId, scheduleId, notReadyActivityId);
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("NOT READY") !== -1);
    assert.ok(text.indexOf("OVERDUE") !== -1 || text.indexOf("Overdue") !== -1);
  });

  await check("attaching a matching document flips the badge to Available and the activity to READY", () => {
    win.PCC.store.update(function (d) {
      d.documents.push(win.PCC.store.newDocument({ project_id: projectId, filename: "boq.pdf", document_type_id: boqTypeId }));
    });
    win.PCC.schedule.viewActivity(projectId, scheduleId, notReadyActivityId);
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("READY") !== -1 && text.indexOf("NOT READY") === -1, "with its only requirement now Available, the activity must read READY, not NOT READY");
    assert.ok(text.indexOf("AVAILABLE") !== -1 || text.indexOf("Available") !== -1);
  });

  await check("an activity with two linked requirements is NOT READY if even one of them isn't Available yet", () => {
    win.PCC.store.update(function (d) {
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({
          project_id: projectId,
          document_type_id: boqTypeId,
          activity_id: readyActivityId,
        })
      );
      d.documents.push(win.PCC.store.newDocument({ project_id: projectId, filename: "ready-boq.pdf", document_type_id: boqTypeId }));
      d.project_document_requirements.push(
        win.PCC.store.newProjectDocumentRequirement({
          project_id: projectId,
          document_type_id: itpTypeId,
          activity_id: readyActivityId,
        })
      );
      // No matching ITP document exists — this second requirement stays unfulfilled.
    });
    win.PCC.schedule.viewActivity(projectId, scheduleId, readyActivityId);
    win.PCC.router.render();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Pour Concrete") !== -1);
    assert.ok(text.indexOf("DOCUMENT READINESS (2)") !== -1);
    assert.ok(text.indexOf("NOT READY") !== -1, "one Available + one still-Required requirement must still read NOT READY overall");
  });

  await check("this gate does not block editing the activity — Edit is still available regardless of readiness", () => {
    var editBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit");
    assert.ok(editBtn, "Edit button must still be present — readiness is informational, never enforced");
  });

  await check("route 'schedule' still renders without throwing after this gate's changes", () => {
    thrownErrors.length = 0;
    win.PCC.router.go("schedule");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
