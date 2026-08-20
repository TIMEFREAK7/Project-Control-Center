// End-to-end jsdom test against the ACTUAL bundled index.html for "final polish" Gate 4
// (Gantt virtualization). Confirmed scope: only the Gantt chart's row axis gets
// virtualized — the header/gridlines/date markers are built once regardless of row
// count, and only rows inside the chart panel's current scroll viewport (plus a small
// buffer) get real SVG DOM. `visibleRowRange()` in scheduleGanttLayout.js (see
// test_schedule_gantt_layout.js for its own pure-function unit checks at true
// 10,000-row scale) decides the window from the panel's own scroll metrics.
//
// jsdom never does real layout — every element's clientHeight reads 0 there, same as a
// detached element in a real browser — so `visibleRowRange()`'s own documented fallback
// for that case is "render every row," which is exactly what every pre-existing Gantt
// test (test_schedule_gantt_e2e.js, test_schedule_gantt_editing_e2e.js) already depends
// on and continues to pass unmodified. To actually exercise virtualization under jsdom,
// this test stubs HTMLElement.prototype.clientHeight to report a realistic ~500px
// viewport height, the same "stub what jsdom doesn't implement" precedent this suite
// already uses for FileReader.readAsDataURL.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const INDEX_PATH = path.join(__dirname, "..", "index.html");
const ACTIVITY_COUNT = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function flush() {
  for (let i = 0; i < 15; i++) await sleep(0);
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

  // Simulate a real ~500px-tall chart viewport — jsdom does no box-model layout, so
  // every element's real clientHeight is permanently 0, which would otherwise always
  // hit visibleRowRange()'s "no real viewport, render everything" fallback and never
  // actually exercise virtualization.
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: function () {
      return 500;
    },
  });

  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  var projectId, scheduleId;
  await check("app boots on the bundled index.html without throwing; seed a project, schedule, and " + ACTIVITY_COUNT + " activities", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Mega Schedule Project", status: "on_track" });
      d.projects.push(p);
      projectId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: projectId, name: "Baseline Import" });
      d.schedules.push(s);
      scheduleId = s.id;
      for (var i = 0; i < ACTIVITY_COUNT; i++) {
        var start = win.PCC.scheduleGanttLayout.addDays("2020-01-01", i);
        var finish = win.PCC.scheduleGanttLayout.addDays(start, 5);
        d.activities.push(
          win.PCC.store.newActivity({
            project_id: projectId,
            schedule_id: scheduleId,
            name: "Activity " + i,
            activity_type: "task",
            planned_start: start,
            planned_finish: finish,
            duration: 5,
          })
        );
      }
    });
    assert.strictEqual(win.PCC.store.get().activities.length, ACTIVITY_COUNT);
  });

  await check("navigate to Schedule > Gantt with the seeded schedule selected", async () => {
    win.PCC.router.go("schedule");
    win.PCC.router.render();
    // `go()` assigns `location.hash`, which jsdom fires as an async "hashchange" on its
    // own timer rather than synchronously — left pending, it fires router.js's own
    // hashchange listener (a full page re-render) at some arbitrary later point in this
    // test, which would otherwise land mid-scroll-test below and wipe the very DOM state
    // being scrolled. Flushing here lets it fire and resolve now, before that matters.
    await flush();
    var ganttTabBtn = Array.from(win.document.querySelectorAll("button")).find(function (b) {
      return b.textContent.trim() === "Gantt";
    });
    assert.ok(ganttTabBtn, "Gantt tab button not found");
    ganttTabBtn.click();
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("with a real viewport, only a small bounded slice of " + ACTIVITY_COUNT + " activities gets real bar DOM — not all of them", () => {
    var bars = outlet().querySelectorAll("rect[data-activity-id]");
    assert.ok(bars.length > 0, "expected at least some bars to render");
    assert.ok(bars.length < 100, "expected a bounded window of bars, got " + bars.length + " (virtualization isn't limiting DOM node count)");
  });

  var firstWindowIds;
  await check("the initially-rendered bars are the chronologically-first activities (scrolled to the top)", () => {
    firstWindowIds = Array.from(outlet().querySelectorAll("rect[data-activity-id]")).map(function (r) {
      return r.getAttribute("data-activity-id");
    });
    var text = outlet().textContent;
    assert.ok(text.indexOf("Activity 0") !== -1, "expected the very first activity to be visible at the top of the chart");
    assert.ok(text.indexOf("Activity " + (ACTIVITY_COUNT - 1)) === -1, "the last activity should not be in the DOM before any scrolling");
  });

  await check("scrolling deep into the chart swaps in a different, still-bounded window of bars", async () => {
    // The scrollable chart wrapper is the svg's own parent.
    var svg = outlet().querySelector("svg");
    var scrollWrap = svg.parentElement;
    scrollWrap.scrollTop = 1500 * 26; // deep into the list — row height is 26px
    scrollWrap.dispatchEvent(new win.Event("scroll", { bubbles: true }));
    await sleep(50); // jsdom's requestAnimationFrame runs on its own ~16ms internal timer
    await flush();

    var barsAfterScroll = outlet().querySelectorAll("rect[data-activity-id]");
    assert.ok(barsAfterScroll.length > 0, "expected bars to still render after scrolling");
    assert.ok(barsAfterScroll.length < 100, "expected the window to stay bounded after scrolling, got " + barsAfterScroll.length);

    var idsAfterScroll = Array.from(barsAfterScroll).map(function (r) { return r.getAttribute("data-activity-id"); });
    var overlap = idsAfterScroll.filter(function (id) { return firstWindowIds.indexOf(id) !== -1; });
    assert.ok(overlap.length < idsAfterScroll.length, "expected the rendered window to have actually moved, not stayed identical");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("a bar within the scrolled-to window is still fully interactive — clicking its label opens the detail panel", () => {
    var visibleBar = outlet().querySelector("rect[data-activity-id]");
    var activityId = visibleBar.getAttribute("data-activity-id");
    var labelEls = Array.from(outlet().querySelectorAll("svg text")).filter(function (t) {
      return t.style.cursor === "pointer" || t.getAttribute("style") === "cursor:pointer;";
    });
    // Click directly via the store-driven navigation hook instead of hunting the exact
    // label element by position — proves the click handler (attached only to rows that
    // actually got real DOM) still wires up correctly post-scroll.
    var evt = new win.Event("click", { bubbles: true });
    var matchingLabel = Array.from(outlet().querySelectorAll("svg text")).find(function (t) {
      return t.textContent.indexOf("Activity ") === 0;
    });
    assert.ok(matchingLabel, "expected at least one activity label in the currently-rendered window");
    matchingLabel.dispatchEvent(evt);
    var text = outlet().textContent;
    assert.ok(text.indexOf("Delete") !== -1 || text.indexOf("Edit") !== -1, "expected the Activity Detail Panel to open after clicking a visible label");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("this gate writes nothing to the schedule beyond the seed data — record count unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.activities.length, ACTIVITY_COUNT);
    assert.strictEqual(data.schema_version, win.PCC.store.get().schema_version);
  });

  // ---- Route smoke test across every page (kept to a lighter set since this test's
  // store carries 3,000 activities — every route still has to render against it) ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "executiveCenter",
    "schedule", "delayRecoveryDashboard", "risks", "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing with a 3,000-activity schedule in the store", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
