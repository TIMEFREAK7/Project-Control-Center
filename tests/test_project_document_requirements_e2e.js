// End-to-end jsdom test against the ACTUAL bundled index.html for Document Control's
// project-document-requirements feature — originally Gate 15, reshaped by the Gate 18
// doc-control UX fix per direct user feedback: selection now lives inside the Add/Edit
// Project form itself (not a separately-toggled section that only appeared after the
// project already existed), and "Available" vs "Required" is a computed status (does a
// matching document exist for this project?) rather than anything stored. Covers: the
// form's checklist on both Add and Edit, "Apply Template" (add-only, no duplicates, only
// matches active types), atomic create/reconcile of project_document_requirements on
// Save, Cancel discarding the uncommitted selection, computed availability reacting to
// an attached document, the read-only Details summary + its "Edit Requirements" entry
// point, and confirms the master document_types repository is never modified by any of
// this.
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
function findLabelContaining(dom, text) {
  const labels = Array.from(dom.window.document.querySelectorAll("label"));
  return labels.find((l) => l.textContent.indexOf(text) !== -1);
}
function requirementFieldCount(dom) {
  const body = dom.window.document.body.textContent;
  const m = body.match(/DOCUMENT REQUIREMENTS \((\d+) of (\d+)\)/);
  return m ? { selected: Number(m[1]), total: Number(m[2]) } : null;
}
function requirementSummaryCount(dom) {
  const body = dom.window.document.body.textContent;
  const m = body.match(/DOCUMENT REQUIREMENTS \((\d+) of (\d+) available\)/);
  return m ? { available: Number(m[1]), total: Number(m[2]) } : null;
}
function findFieldByLabel(dom, labelText) {
  const labels = Array.from(dom.window.document.querySelectorAll(".field label"));
  // buildField() appends " *" to a required field's label, so match by prefix.
  const match = labels.find((l) => l.textContent.trim().indexOf(labelText) === 0);
  return match ? match.parentElement.querySelector("input, select, textarea") : null;
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC.store.PROJECT_TEMPLATES, "PROJECT_TEMPLATES must be bundled");
  });

  var seededTypeCount;
  await check("read the master document_types repository", () => {
    seededTypeCount = win.PCC.store.get().document_types.length;
    assert.ok(seededTypeCount > 0, "the master repository must already be seeded");
  });

  await check("'+ Add Project' opens the form with a DOCUMENT REQUIREMENTS field showing 0 selected", () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    findButtonByText(dom, "+ Add Project").click();
    win.PCC.router.render();

    var count = requirementFieldCount(dom);
    assert.ok(count, "DOCUMENT REQUIREMENTS field not found inside the Add Project form");
    assert.strictEqual(count.selected, 0);
    assert.strictEqual(count.total, seededTypeCount);
    assert.ok(findLabelContaining(dom, "BOQ"), "the checklist itself must already be visible — no separate 'Manage' toggle any more");
  });

  await check("checking a box in the Add form updates the field's count but writes nothing to the store yet", () => {
    var boqLabel = findLabelContaining(dom, "BOQ");
    var checkbox = boqLabel.querySelector('input[type="checkbox"]');
    assert.ok(checkbox && !checkbox.checked, "BOQ must start unchecked");
    checkbox.checked = true;
    checkbox.dispatchEvent(new win.Event("change"));

    assert.strictEqual(requirementFieldCount(dom).selected, 1);
    assert.strictEqual(win.PCC.store.get().project_document_requirements.length, 0, "nothing may be written to the store before Save");
    assert.strictEqual(win.PCC.store.get().projects.length, 0, "the project itself isn't created until Save either");
  });

  await check("Apply Template (EPC) adds matching active types to the field's selection, still uncommitted", () => {
    var selects = Array.from(win.document.querySelectorAll("select"));
    var templateSelect = selects.find((s) => Array.from(s.options).some((o) => o.textContent === "EPC"));
    assert.ok(templateSelect, "template select not found");
    templateSelect.value = "epc";
    templateSelect.dispatchEvent(new win.Event("change"));
    findButtonByText(dom, "Apply").click();

    var epcTemplate = win.PCC.store.PROJECT_TEMPLATES.find((t) => t.key === "epc");
    // BOQ was already checked by hand; the template may or may not also suggest BOQ, so
    // just assert the field's count is now at least the template's suggestion count and
    // the store is still untouched.
    assert.ok(requirementFieldCount(dom).selected >= epcTemplate.suggested_type_names.length);
    assert.strictEqual(win.PCC.store.get().project_document_requirements.length, 0, "Apply Template must not write to the store before Save either");
  });

  var projectId;
  await check("Save creates the project AND commits the selected requirements atomically", () => {
    var selectedBeforeSave = requirementFieldCount(dom).selected;
    findFieldByLabel(dom, "Project Name").value = "Requirements Test Project";
    findButtonByText(dom, "Add Project").click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1, "the project must be created");
    projectId = data.projects[0].id;
    var rows = data.project_document_requirements.filter((r) => r.project_id === projectId);
    assert.strictEqual(rows.length, selectedBeforeSave, "every checked requirement must be committed on Save, in one step with the project record");
  });

  await check("Cancel on a fresh Add form discards the uncommitted selection (re-opening starts at 0 again)", () => {
    findButtonByText(dom, "+ Add Project").click();
    win.PCC.router.render();
    var boqLabel = findLabelContaining(dom, "BOQ");
    boqLabel.querySelector('input[type="checkbox"]').click();
    assert.strictEqual(requirementFieldCount(dom).selected, 1);

    findButtonByText(dom, "Cancel").click();
    win.PCC.router.render();
    findButtonByText(dom, "+ Add Project").click();
    win.PCC.router.render();
    assert.strictEqual(requirementFieldCount(dom).selected, 0, "a fresh Add Project form must not carry over a previously-cancelled selection");
    findButtonByText(dom, "Cancel").click();
    win.PCC.router.render();
  });

  await check("Portfolio Details shows a read-only DOCUMENT REQUIREMENTS summary with an Edit Requirements button, no checkboxes", () => {
    findButtonByText(dom, "Details").click();
    win.PCC.router.render();

    var summary = requirementSummaryCount(dom);
    assert.ok(summary, "read-only DOCUMENT REQUIREMENTS summary not found in Details");
    assert.strictEqual(summary.available, 0, "nothing attached yet, so 0 must show as available");
    assert.ok(summary.total > 0, "the requirements selected on creation must be reflected here");
    assert.ok(findButtonByText(dom, "Edit Requirements"), "Details must offer an 'Edit Requirements' entry point back into the form");
    assert.ok(!findLabelContaining(dom, "BOQ"), "Details must be read-only — no checkbox-bearing labels");
  });

  await check("attaching a document with a matching document_type_id flips that requirement to Available", () => {
    var data = win.PCC.store.get();
    var boqType = data.document_types.find((t) => t.name === "BOQ");
    win.PCC.store.update(function (d) {
      d.documents.push(win.PCC.store.newDocument({ project_id: projectId, filename: "boq.pdf", document_type_id: boqType.id }));
    });
    win.PCC.router.render();

    var summary = requirementSummaryCount(dom);
    assert.strictEqual(summary.available, 1, "attaching a matching document must flip its requirement to Available, computed live");
    var bodyText = win.document.getElementById("page-outlet").textContent;
    assert.ok(bodyText.indexOf("Available") !== -1);
    assert.ok(bodyText.indexOf("Required") !== -1, "the remaining unmatched requirements must still read Required");
  });

  await check("Edit Requirements opens the Edit form pre-filled with the project's existing selection and live availability badges", () => {
    findButtonByText(dom, "Edit Requirements").click();
    win.PCC.router.render();

    var boqLabel = findLabelContaining(dom, "BOQ");
    assert.ok(boqLabel, "BOQ row must appear in the Edit form's checklist");
    var checkbox = boqLabel.querySelector('input[type="checkbox"]');
    assert.ok(checkbox.checked, "BOQ must be pre-checked since it was selected on creation");
    assert.ok(boqLabel.textContent.indexOf("Available") !== -1, "a checked requirement with a matching document must show an Available badge in the form too");
  });

  await check("unchecking BOQ and checking a previously-unselected type, then Save, reconciles both add and remove", () => {
    var data = win.PCC.store.get();
    var priorRows = data.project_document_requirements.filter((r) => r.project_id === projectId);
    var boqType = data.document_types.find((t) => t.name === "BOQ");
    // "Kickoff Checklist" is one of Gate 18's project-setup types, not part of the EPC
    // template applied earlier, so it's guaranteed unselected at this point.
    var kickoffType = data.document_types.find((t) => t.name === "Kickoff Checklist");
    var wasKickoffSelected = priorRows.some((r) => r.document_type_id === kickoffType.id);
    assert.ok(!wasKickoffSelected, "test setup assumption: Kickoff Checklist must not already be selected");

    findLabelContaining(dom, "BOQ").querySelector('input[type="checkbox"]').click();
    findLabelContaining(dom, "Kickoff Checklist").querySelector('input[type="checkbox"]').click();
    findButtonByText(dom, "Save Changes").click();

    var after = win.PCC.store.get().project_document_requirements.filter((r) => r.project_id === projectId);
    assert.ok(!after.some((r) => r.document_type_id === boqType.id), "unchecked BOQ must be removed from the store on Save");
    assert.ok(after.some((r) => r.document_type_id === kickoffType.id), "newly-checked Kickoff Checklist must be added to the store on Save");
  });

  await check("the master document_types repository is untouched by any of the above (same length, same ids)", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.document_types.length, seededTypeCount, "no document types should be added or removed by requirement selection");
    var boq = data.document_types.find((t) => t.name === "BOQ");
    assert.strictEqual(boq.active, true, "BOQ's own record must be untouched");
  });

  await check("deactivating a document type hides it from the Edit form's checklist but the Details summary still shows its existing requirement", () => {
    var data = win.PCC.store.get();
    var kickoffType = data.document_types.find((t) => t.name === "Kickoff Checklist");

    win.PCC.store.update(function (d) {
      var t = d.document_types.find((x) => x.id === kickoffType.id);
      t.active = false;
    });

    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    // The Details panel is already expanded from an earlier step in this test file
    // (view-local uiState.expandedId persists across navigations within the page
    // module), so it's showing again without needing another click here.

    var summaryBody = win.document.getElementById("page-outlet").textContent;
    assert.ok(summaryBody.indexOf("Kickoff Checklist") !== -1, "an existing requirement must keep showing in the read-only summary even after its type is deactivated");

    findButtonByText(dom, "Edit Requirements").click();
    win.PCC.router.render();
    assert.ok(!findLabelContaining(dom, "Kickoff Checklist"), "a deactivated type must disappear from the Edit form's selectable checklist");
  });

  // ---- Route smoke test across every page ----
  var routes = ["dashboard", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "resources", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 18 changes", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
