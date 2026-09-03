// End-to-end jsdom test against the ACTUAL bundled index.html for "final polish" Gate 2
// (Report Template System). Two parts, confirmed via three AskUserQuestion forks: (1) a
// company logo, uploaded once in Settings and stored via blobStore (IndexedDB, key
// "company_logo"), shown in every printable report's header — reports.js's two reports
// AND Executive Center's Project Snapshot and Management Pack; (2) named, saved
// section-selection templates (not just one persisted default) for reports.js's two
// reports and, since it was already halfway there with un-persisted checkboxes,
// Executive Center's Management Pack too — new `report_templates` register.
//
// File-upload UI is deliberately NOT driven through jsdom, same established precedent
// every other file-upload-adjacent test in this suite follows (see
// test_knowledge_base_e2e.js's own comment) — the logo scenario seeds the blob directly
// via blobStore.putBlob() and mirrors the resulting settings write.
// schema_version 50 -> 51.
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
function findSelectWithOption(dom, optionText) {
  const selects = Array.from(dom.window.document.querySelectorAll("select"));
  return selects.find((s) => Array.from(s.options).some((o) => o.textContent === optionText));
}
// reports.js is a React-migrated page: a raw `.value =` assignment doesn't reliably
// reach a controlled <select>'s onChange (React patches the native setter to track
// "last known value" — see CLAUDE.md's React migration notes), so bypass it via the
// native prototype descriptor before dispatching the change event.
function setReactSelectValue(win, select, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(select, value);
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
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
  // jsdom doesn't implement CompressionStream/DecompressionStream/Response — needed since
  // Gate 4 (blobStore.js compression). Reuse Node's own, the real implementation.
  dom.window.CompressionStream = CompressionStream;
  dom.window.DecompressionStream = DecompressionStream;
  dom.window.Response = Response;
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

  await check("app boots on the bundled index.html without throwing, schema_version is 51", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    var data = win.PCC.store.get();
    assert.ok(data.schema_version >= 51);
    assert.strictEqual(data.settings.company_logo_filename, "");
    assert.strictEqual(data.report_templates.length, 0);
  });

  await check("seeding a logo blob directly and setting the filename shows a preview and Remove Logo button in Settings", async () => {
    await win.PCC.blobStore.putBlob("company_logo", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
    win.PCC.store.update(function (d) {
      d.settings.company_logo_filename = "logo.png";
      d.settings.company_logo_mime_type = "image/png";
    });
    win.PCC.router.go("settings");
    win.PCC.router.render();
    var text = outlet().textContent;
    assert.ok(text.indexOf("logo.png") !== -1);
    assert.ok(findButtonByText(dom, "Remove Logo"), "Remove Logo button not found");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var projectId;
  await check("seed a project with a risk and an RFI, so the Project Status report has real content to toggle", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Template Test Project" });
      d.projects.push(p);
      projectId = p.id;
      d.risks.push(win.PCC.store.newRisk({ project_id: projectId, type: "risk", title: "Site access delay", status: "open" }));
      d.rfis.push(win.PCC.store.newRfi({ project_id: projectId, type: "rfi", number: "RFI-001", subject: "Foundation detail", status: "open" }));
    });
    assert.ok(projectId);
  });

  await check("Reports page: the logo appears in the Project Status report header", async () => {
    win.PCC.router.go("reports");
    win.PCC.router.render();
    // reports.js is a React-migrated page — flush here, BEFORE interacting, since a
    // hashchange-triggered render can still land asynchronously after this go()+
    // render() pair (router.js's suppressNextHashRender is a single flag — see
    // CLAUDE.md's React migration notes on this race). The assembled report itself is
    // also built by a non-initial effect (see Reports.jsx's own comment), which commits
    // asynchronously, so flush again after this to let the logo blob's async load and
    // the report doc both settle before reading the DOM.
    await flush();
    var img = outlet().querySelector("img");
    assert.ok(img, "expected an <img> logo element in the report header");
  });

  await check("unchecking the Risks section removes it from the assembled Project Status report", async () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Site access delay") !== -1, "risk should show before unchecking");

    var checkboxes = Array.from(outlet().querySelectorAll("input[type='checkbox']"));
    var risksCheckbox = checkboxes.find(function (cb) {
      return cb.parentElement.textContent.trim() === "Risk / Issue / Opportunity Register";
    });
    assert.ok(risksCheckbox, "Risk section checkbox not found");
    // .click(), not a raw .checked= assignment — a controlled checkbox's onChange isn't
    // reliably reached by the latter (see CLAUDE.md's React migration notes).
    risksCheckbox.click();
    await flush();

    // Check the report content itself, not the whole outlet — the checkbox panel's own
    // label always reads "Risk / Issue / Opportunity Register" regardless of checked
    // state, so asserting on that text against the full outlet would be ambiguous.
    var reportDoc = outlet().querySelector(".report-doc");
    assert.ok(reportDoc.textContent.indexOf("Site access delay") === -1, "risk section must be gone from the assembled report");
    assert.ok(reportDoc.textContent.indexOf("RFI-001") !== -1, "RFI section must still show — only Risks was unchecked");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var savedTemplateId;
  await check("'Save as New…' persists a named template with the current (Risks-off) section selection", async () => {
    findButtonByText(dom, "Save as New…").click();
    await flush();
    var nameInput = outlet().querySelector("input[type='text']");
    nameInput.value = "Client Report";
    nameInput.dispatchEvent(new win.Event("input", { bubbles: true }));
    findButtonByText(dom, "Save").click();
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.report_templates.length, 1);
    var t = data.report_templates[0];
    savedTemplateId = t.id;
    assert.strictEqual(t.name, "Client Report");
    assert.strictEqual(t.report_type, "project");
    assert.strictEqual(t.sections.risks, false);
    assert.strictEqual(t.sections.rfis, true);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("switching to the Portfolio Summary report shows an empty template list (templates are per report-type)", async () => {
    var typeSelect = findSelectWithOption(dom, "Project Status Report");
    setReactSelectValue(win, typeSelect, "portfolio");
    await flush();

    var templateSelect = findSelectWithOption(dom, "— Custom selection —");
    var optionTexts = Array.from(templateSelect.options).map((o) => o.textContent);
    assert.deepStrictEqual(optionTexts, ["— Custom selection —"], "no portfolio-type templates exist yet");
  });

  await check("switching back to Project Status Report shows the saved 'Client Report' template in the picker, and selecting it reapplies Risks-off", async () => {
    var typeSelect = findSelectWithOption(dom, "Portfolio Summary Report");
    setReactSelectValue(win, typeSelect, "project");
    await flush();

    var templateSelect = findSelectWithOption(dom, "— Custom selection —");
    var optionTexts = Array.from(templateSelect.options).map((o) => o.textContent);
    assert.ok(optionTexts.indexOf("Client Report") !== -1, "expected 'Client Report' in the template picker; got: " + optionTexts.join(", "));

    setReactSelectValue(win, templateSelect, savedTemplateId);
    await flush();

    var checkboxes = Array.from(outlet().querySelectorAll("input[type='checkbox']"));
    var risksCheckbox = checkboxes.find(function (cb) {
      return cb.parentElement.textContent.trim() === "Risk / Issue / Opportunity Register";
    });
    assert.strictEqual(risksCheckbox.checked, false, "loading the template must reapply its Risks-off state");
    assert.ok(findButtonByText(dom, "Save Changes"), "Save Changes button should appear once a template is selected");
  });

  await check("editing a checkbox after loading a template keeps it selected — 'Save Changes' stays available and commits the edit", async () => {
    var checkboxes = Array.from(outlet().querySelectorAll("input[type='checkbox']"));
    var risksCheckbox = checkboxes.find(function (cb) {
      return cb.parentElement.textContent.trim() === "Risk / Issue / Opportunity Register";
    });
    risksCheckbox.click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Site access delay") !== -1, "risk should be back in the report");
    var saveChangesBtn = findButtonByText(dom, "Save Changes");
    assert.ok(saveChangesBtn, "Save Changes must stay available through the edit, not disappear — otherwise there'd be no way to actually update the template");

    saveChangesBtn.click();
    await flush();
    var data = win.PCC.store.get();
    var t = data.report_templates.find((x) => x.id === savedTemplateId);
    assert.strictEqual(t.sections.risks, true, "Save Changes must commit the edited (risks:true) state, overwriting the original risks:false");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Delete Template' removes it from the store and the picker", async () => {
    var origConfirm = win.confirm;
    win.confirm = () => true;
    findButtonByText(dom, "Delete Template").click();
    win.confirm = origConfirm;
    await flush();
    var data = win.PCC.store.get();
    assert.strictEqual(data.report_templates.length, 0);
    var templateSelect = findSelectWithOption(dom, "— Custom selection —");
    var optionTexts = Array.from(templateSelect.options).map((o) => o.textContent);
    assert.deepStrictEqual(optionTexts, ["— Custom selection —"]);
  });

  var scheduleId, activityId;
  await check("seed a schedule/activity and navigate to Executive Center's Output tab", () => {
    win.PCC.store.update(function (d) {
      var sch = win.PCC.store.newSchedule({ project_id: projectId, name: "Template Test Schedule", status: "active" });
      d.schedules.push(sch);
      scheduleId = sch.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Task A", activity_type: "task", duration: 5 });
      d.activities.push(a);
      activityId = a.id;
    });
    win.PCC.executiveCenter.viewProject(projectId, "output");
    win.PCC.router.go("executiveCenter");
    win.PCC.router.render();
    assert.ok(scheduleId && activityId);
  });

  await check("the Project Snapshot shows the logo", () => {
    var img = outlet().querySelector("img");
    assert.ok(img, "expected the logo <img> on the Project Snapshot");
  });

  await check("switching to Management Pack mode shows a Template picker alongside the section checkboxes, and the logo on the cover", () => {
    var modeSelect = Array.from(outlet().querySelectorAll("select")).find((s) => s.textContent.indexOf("Management Pack") !== -1);
    modeSelect.value = "pack";
    modeSelect.dispatchEvent(new win.Event("change", { bubbles: true }));

    var text = outlet().textContent;
    assert.ok(text.indexOf("Template:") !== -1);
    assert.ok(text.indexOf("— Custom selection —") !== -1);
    var img = outlet().querySelector("img");
    assert.ok(img, "expected the logo <img> on the Management Pack cover");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("saving the current Management Pack section state as a new template persists a management_pack-type record", () => {
    findButtonByText(dom, "Save as New…").click();
    var nameInput = outlet().querySelector("input[type='text']");
    nameInput.value = "Steering Committee Pack";
    nameInput.dispatchEvent(new win.Event("input", { bubbles: true }));
    findButtonByText(dom, "Save").click();

    var data = win.PCC.store.get();
    var t = data.report_templates.find((x) => x.name === "Steering Committee Pack");
    assert.ok(t, "management_pack template not found");
    assert.strictEqual(t.report_type, "management_pack");
    assert.strictEqual(t.sections.cover, true, "default packSections are all true");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate's report_templates count is as expected after all edits above", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.report_templates.length, 1);
    assert.strictEqual(data.report_templates[0].report_type, "management_pack");
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
