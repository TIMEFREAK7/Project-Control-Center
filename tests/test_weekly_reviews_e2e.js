// End-to-end jsdom test against the ACTUAL bundled index.html for Weekly Project Review
// (PCC Evolution Roadmap, Tier D: Management — first confirmed gate, 2026-08-19). A
// fresh inspection found Executive Centre (Gate 9) and Executive Summary/Reporting
// already largely built, but no persisted "weekly review" record existed anywhere —
// the closest artifact, Executive Center's Project Snapshot print view, is explicitly
// commented as fit for "weekly/client/steering-committee use" but is a live, ephemeral
// render with no saved history. This gate adds a new "Weekly Reviews" tab to Executive
// Center: each review freezes a KPI snapshot at creation time (never recalculated,
// same precedent as Gate 4's Schedule Baselines) plus three editable notes fields.
// Covers: capturing a snapshot, that it stays frozen after live data changes, delta
// markers between reviews, editing notes without disturbing the snapshot, and delete.
// schema_version 38 -> 39.
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
// executiveCenter.js is React-migrated: the Weekly Review form's fields are
// React-controlled, so a raw `.value =` assignment doesn't reliably reach onChange
// (React patches the native setter to track "last known value" — see CLAUDE.md's React
// migration notes). Bypass via the native prototype descriptor before dispatching.
function setReactInputValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
}
function setReactTextareaValue(win, el, value) {
  Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
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
    assert.ok(win.PCC.pages.executiveCenter, "executiveCenter page module must be bundled");
  });

  var projectId, riskId;
  await check("seed a project with one open high-severity risk", async () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Weekly Review Test Project" });
      d.projects.push(p);
      projectId = p.id;
      var r = win.PCC.store.newRisk({ project_id: projectId, type: "risk", title: "Foundation delay risk", probability: "high", impact: "high", status: "open" });
      d.risks.push(r);
      riskId = r.id;
    });
    win.PCC.executiveCenter.viewProject(projectId);
    win.PCC.router.go("executiveCenter");
    await flush();
    assert.ok(outlet().textContent.indexOf("Weekly Review Test Project") !== -1);
  });

  await check("the 'Weekly Reviews' tab shows the empty state before any review is captured", async () => {
    findButtonByText(dom, "Weekly Reviews").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("No weekly reviews logged yet") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  var firstReviewId;
  await check("'+ New Weekly Review' captures a live snapshot showing the seeded high risk", async () => {
    findButtonByText(dom, "+ New Weekly Review").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Snapshot captured just now") !== -1);
    assert.ok(outlet().querySelector("#wrfield-review_date"), "review_date field not found");
  });

  await check("filling in notes and saving persists the review with its frozen snapshot", async () => {
    setReactInputValue(win, outlet().querySelector("#wrfield-reviewed_by"), "Project Director");
    setReactInputValue(win, outlet().querySelector("#wrfield-attendees"), "PM, Site Engineer");
    setReactTextareaValue(win, outlet().querySelector("#wrfield-progress_notes"), "Foundation works 40% complete.");
    setReactTextareaValue(win, outlet().querySelector("#wrfield-issues_notes"), "Soil conditions causing delay.");
    setReactTextareaValue(win, outlet().querySelector("#wrfield-actions_notes"), "Order precast alternative.");
    await flush();
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.weekly_reviews.length, 1);
    var review = data.weekly_reviews[0];
    firstReviewId = review.id;
    assert.strictEqual(review.project_id, projectId);
    assert.strictEqual(review.reviewed_by, "Project Director");
    assert.strictEqual(review.snapshot.open_risks, 1, "snapshot must reflect the one seeded open risk");
    assert.strictEqual(review.snapshot.high_risks, 1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the review list shows the saved review with its RAG badge and notes on Details", async () => {
    var text = outlet().textContent;
    assert.ok(text.indexOf("Project Director") !== -1);
    findButtonByText(dom, "Details").click();
    await flush();
    text = outlet().textContent;
    assert.ok(text.indexOf("Foundation works 40% complete.") !== -1);
    assert.ok(text.indexOf("Open Risks (high-severity)") !== -1);
    assert.ok(text.indexOf("1 (1)") !== -1, "expected '1 (1)' for open (high-severity) risks, got: " + text);
  });

  await check("closing an existing risk afterward does NOT change the already-saved review's frozen snapshot", async () => {
    win.PCC.store.update(function (d) {
      var r = d.risks.find(function (x) { return x.id === riskId; });
      r.status = "closed";
    });
    var data = win.PCC.store.get();
    var review = data.weekly_reviews.find(function (r) { return r.id === firstReviewId; });
    assert.strictEqual(review.snapshot.open_risks, 1, "the frozen snapshot must still show 1 open risk even though the risk is now closed");

    // A plain render() remounts the page fresh, defaulting back to the Overview tab's
    // Summary sub-tab — re-navigate to Weekly Reviews and re-expand Details to confirm
    // the rendered card still shows the frozen figure, not today's live 0.
    win.PCC.executiveCenter.viewProject(projectId, "weeklyReviews");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "Details").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("1 (1)") !== -1, "the rendered review must still show the frozen '1 (1)', not today's live 0");
  });

  var secondReviewId;
  await check("a second review captures the new (now-zero) open-risk count, and shows a delta vs. the first review", async () => {
    win.PCC.executiveCenter.viewProject(projectId, "weeklyReviews");
    win.PCC.router.render();
    await flush();
    findButtonByText(dom, "+ New Weekly Review").click();
    await flush();
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    assert.strictEqual(data.weekly_reviews.length, 2);
    var second = data.weekly_reviews.find(function (r) { return r.id !== firstReviewId; });
    secondReviewId = second.id;
    assert.strictEqual(second.snapshot.open_risks, 0, "the risk is now closed, so the new snapshot must show 0 open risks");

    // The newest review (0 open risks) should render first (newest-first ordering);
    // expand its Details to see the delta line against the older review's 1.
    var detailsButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Details");
    detailsButtons[0].click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Open Risks (high-severity)") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Edit Notes' changes only the notes fields, never the frozen snapshot", async () => {
    var editButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Edit Notes");
    // Edit the SECOND (first-listed, newest) review's notes.
    editButtons[0].click();
    await flush();
    setReactTextareaValue(win, outlet().querySelector("#wrfield-progress_notes"), "Updated progress note.");
    await flush();
    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    var data = win.PCC.store.get();
    var second = data.weekly_reviews.find(function (r) { return r.id === secondReviewId; });
    assert.strictEqual(second.progress_notes, "Updated progress note.");
    assert.strictEqual(second.snapshot.open_risks, 0, "editing notes must never touch the frozen snapshot");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("'Delete' removes a review", async () => {
    var origConfirm = win.confirm;
    win.confirm = () => true;
    var deleteButtons = Array.from(outlet().querySelectorAll("button")).filter((b) => b.textContent.trim() === "Delete");
    deleteButtons[0].click();
    await flush();
    win.confirm = origConfirm;

    var data = win.PCC.store.get();
    assert.strictEqual(data.weekly_reviews.length, 1, "one of the two reviews must be gone");
  });

  await check("this gate's record counts are as expected after all edits above", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.weekly_reviews.length, 1);
    assert.strictEqual(data.risks.length, 1);
    assert.strictEqual(data.projects.length, 1);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "actionCentre", "projectLookahead", "portfolio", "executiveCenter", "vendors",
    "vendorPerformanceCentre", "documents", "documentTypes", "documentControlDashboard",
    "dailylog", "schedule", "delayRecoveryDashboard", "risks", "meetings", "rfis",
    "changeOrders", "decisionRegister", "cost", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after adding Weekly Project Review", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
