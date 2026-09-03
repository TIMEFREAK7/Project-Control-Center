// End-to-end jsdom test against the ACTUAL bundled index.html for Activity → Vendor —
// PCC Evolution Roadmap Gate 4 (2026-08-19, this session's own numbering: Gate 32,
// Tier B: Control Integration). Schedule activities gain an optional vendor_id — a real
// link into the Vendor Management module (Gate 13), distinct from the pre-existing
// free-text `contractor` field. Covers: the Activity form's new Vendor picker, the
// Activity Detail Panel's read-only Vendor display, and the new "Activities" tab on the
// Vendor Profile page (reciprocal, read-only, portfolio-wide). schema_version 34 -> 35.
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
// schedule.js is React-migrated: form fields are React-controlled, so a raw `.value =`
// assignment doesn't reliably reach onChange (React patches the native setter to track
// "last known value" — see CLAUDE.md's React migration notes).
function setReactSelectValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
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
    assert.ok(win.PCC.pages.schedule && win.PCC.pages.vendors, "schedule and vendors page modules must be bundled");
  });

  var projectId, scheduleId, activityId, vendorAId, vendorBId;
  await check("seed a project, a schedule, one activity, and two vendors via the store", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Vendor Link Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline", status: "active" });
      d.schedules.push(s);
      scheduleId = s.id;
      var a = win.PCC.store.newActivity({ project_id: projectId, schedule_id: scheduleId, name: "Transformer Installation", activity_type: "task", duration: 5 });
      d.activities.push(a);
      activityId = a.id;

      var va = win.PCC.store.newVendor({ vendor_name: "ABC Electrical" });
      d.vendors.push(va);
      vendorAId = va.id;
      var vb = win.PCC.store.newVendor({ vendor_name: "XYZ Mechanical" });
      d.vendors.push(vb);
      vendorBId = vb.id;
    });
    assert.ok(projectId && scheduleId && activityId && vendorAId && vendorBId);
  });

  await check("the Activity Detail Panel shows no Vendor before one is assigned", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.go("schedule");
    // vendors.js (later in this file) is a React-migrated page whose route mounts
    // consume a one-shot pending prop — a hashchange left un-flushed from THIS go()
    // call can leak into a later check and fire an unwanted extra render there (see
    // CLAUDE.md's router.js suppressNextHashRender notes). Flush after every go(),
    // even to this still-vanilla route.
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Transformer Installation") !== -1);
    // "Vendor" the detail-item LABEL should render with an em-dash value since nothing is assigned.
    var vendorLabel = Array.from(outlet().querySelectorAll(".detail-item__label")).find((l) => l.textContent === "Vendor");
    assert.ok(vendorLabel, "Vendor detail item not found");
    assert.strictEqual(vendorLabel.parentElement.querySelector("div").textContent, "—");
  });

  await check("the Activity form offers a Vendor picker populated with every vendor, defaulting to (none)", async () => {
    findButtonByText(dom, "Edit").click();
    await flush();
    var select = outlet().querySelector("#actfield-vendor_id");
    assert.ok(select, "vendor select not found on the Activity form");
    assert.strictEqual(select.value, "", "must default to unassigned");
    var optionLabels = Array.from(select.options).map((o) => o.textContent);
    assert.ok(optionLabels.indexOf("(none)") !== -1);
    assert.ok(optionLabels.indexOf("ABC Electrical") !== -1);
    assert.ok(optionLabels.indexOf("XYZ Mechanical") !== -1);
  });

  await check("assigning Vendor A and saving persists vendor_id on the activity", async () => {
    var select = outlet().querySelector("#actfield-vendor_id");
    setReactSelectValue(win, select, vendorAId);
    var form = outlet().querySelector("form");
    var submitEvent = new win.Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);
    await flush();

    var data = win.PCC.store.get();
    var activity = data.activities.find((a) => a.id === activityId);
    assert.strictEqual(activity.vendor_id, vendorAId);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Activity Detail Panel now shows Vendor A's name", () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.render();
    var vendorLabel = Array.from(outlet().querySelectorAll(".detail-item__label")).find((l) => l.textContent === "Vendor");
    assert.strictEqual(vendorLabel.parentElement.querySelector("div").textContent, "ABC Electrical");
  });

  await check("Vendor A's profile 'Activities' tab shows the assigned activity with the correct project and a badge", async () => {
    win.PCC.vendors.openProfile(vendorAId);
    win.PCC.router.go("vendors");
    findButtonByText(dom, "Activities").click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("Transformer Installation") !== -1);
    assert.ok(text.indexOf("Vendor Link Test Project") !== -1);
    assert.ok(text.indexOf("1 activity assigned across 1 project(s)") !== -1, "got: " + text.match(/\d+ activit\w+ assigned across \d+ project\(s\)/));
    var badges = Array.from(outlet().querySelectorAll(".status-badge")).map((b) => b.textContent.trim());
    assert.ok(
      badges.some((t) => ["On Track", "Critical", "Near-Critical"].indexOf(t) !== -1),
      "expected one of On Track/Critical/Near-Critical among the page's badges; got: " + badges.join(", ")
    );
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Vendor B's profile 'Activities' tab shows the empty state — no cross-contamination between vendors", async () => {
    win.PCC.vendors.openProfile(vendorBId);
    win.PCC.router.go("vendors");
    findButtonByText(dom, "Activities").click();
    await flush();

    var text = outlet().textContent;
    assert.ok(text.indexOf("No Schedule activities are currently assigned to this vendor") !== -1);
    assert.ok(text.indexOf("Transformer Installation") === -1);
  });

  await check("'View in Schedule' from Vendor A's Activities tab navigates to Schedule with the activity's detail panel open", async () => {
    win.PCC.vendors.openProfile(vendorAId);
    win.PCC.router.go("vendors");
    findButtonByText(dom, "Activities").click();
    await flush();

    var viewBtn = findButtonByText(dom, "View in Schedule");
    assert.ok(viewBtn, "View in Schedule button not found");
    viewBtn.click();
    await flush();

    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    assert.ok(outlet().textContent.indexOf("Transformer Installation") !== -1, "the activity detail panel must show the linked activity");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("unassigning the vendor (back to '(none)') clears vendor_id and the activity disappears from Vendor A's Activities tab", async () => {
    win.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    win.PCC.router.go("schedule");
    await flush();
    findButtonByText(dom, "Edit").click();
    await flush();
    var select = outlet().querySelector("#actfield-vendor_id");
    setReactSelectValue(win, select, "");
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.activities.find((a) => a.id === activityId).vendor_id, "");

    win.PCC.vendors.openProfile(vendorAId);
    win.PCC.router.go("vendors");
    findButtonByText(dom, "Activities").click();
    await flush();
    assert.ok(outlet().textContent.indexOf("No Schedule activities are currently assigned to this vendor") !== -1);
  });

  await check("this gate writes nothing back beyond the deliberate vendor_id edits above — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.activities.length, 1);
    assert.strictEqual(data.vendors.length, 2);
    assert.strictEqual(data.schedules.length, 1);
    assert.strictEqual(data.projects.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "risks", "meetings", "rfis",
    "changeOrders", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding Activity → Vendor", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
