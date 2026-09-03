// End-to-end jsdom test against the ACTUAL bundled index.html for UI/UX Overhaul Gate 8
// (Tablet/Mobile Optimization). Aditya asked for the two concretely broken items found
// during real-Chromium inspection at tablet (820px) and mobile (390px) widths, plus
// touch targets: a mobile card fallback for Schedule Activities' Gate 7 data grid (a
// many-column table has nowhere to go at phone widths), a read-only mobile alternative
// to the interactive Gantt chart (the brief's own "Gantt alternative" requirement —
// dragging a 2px SVG bar needs a mouse, not a fingertip), and larger tap targets across
// icon-btn/btn/card-menu items at tablet-and-below widths.
//
// Important environment note, discovered while writing this file: jsdom does NOT
// evaluate viewport-based @media queries when computing styles — getComputedStyle()
// always reflects the base (non-media) rule regardless of window.innerWidth. Confirmed
// directly (a trivial @media max-width test rule never applied in jsdom no matter what
// innerWidth was set to). That means:
//   - The Gantt mobile timeline IS fully testable here — it's gated by a genuine JS
//     window.innerWidth check (schedule.js), not CSS alone, precisely BECAUSE building
//     one .project-card per activity with no virtualization would be a real cost at
//     the thousands-of-activities scale Tier 3 Gate 4's own virtualization guards —
//     see that decision's own comment in schedule.js.
//   - The Activities tab's mobile cards and the touch-target sizing are CSS-only (both
//     representations always exist in the DOM; a breakpoint picks which one shows) —
//     this file checks their STRUCTURE/CONTENT is correct and that the actual CSS rules
//     ship in the bundle (grepping the <style> text, the same technique Gate 7's
//     density test already established for exactly this jsdom limitation), not their
//     rendered visibility, which was verified separately in real Chromium instead.
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
  const styleText = () =>
    Array.from(win.document.querySelectorAll("style")).map((s) => s.textContent).join("\n");

  var projId, schedId;
  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("seed a project/schedule with activities spanning WBS/float/dates", () => {
    win.PCC.store.update(function (d) {
      var p = win.PCC.store.newProject({ name: "Riverside Tower", status: "at_risk" });
      d.projects.push(p);
      projId = p.id;
      var s = win.PCC.store.newSchedule({ project_id: p.id, name: "Baseline Schedule Rev 0" });
      d.schedules.push(s);
      schedId = s.id;
      d.activities.push(
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, name: "Excavation", activity_type: "task", status: "complete", total_float: 0, planned_start: "2026-08-01", planned_finish: "2026-08-10", percent_complete: 100 }),
        win.PCC.store.newActivity({ project_id: p.id, schedule_id: s.id, name: "Foundation Pour", activity_type: "task", status: "in_progress", total_float: 3, planned_start: "2026-08-11", planned_finish: "2026-08-20", percent_complete: 40 })
      );
    });
    assert.ok(projId && schedId);
  });

  // ============================================================================
  // Schedule Activities: mobile card fallback (CSS-driven, structure/content check)
  // ============================================================================

  await check("both the data grid table and the mobile card fallback are built for the same filtered activities", async () => {
    win.PCC.schedule.viewProject(projId);
    win.PCC.router.go("schedule");
    await flush();
    var actBtn = Array.from(outlet().querySelectorAll(".tab-btn")).find((b) => b.textContent.trim() === "Activities");
    actBtn.click();
    await flush();

    var tableRows = outlet().querySelectorAll(".activities-table-wrap tbody tr");
    var mobileCards = outlet().querySelectorAll(".activities-mobile-cards .project-card");
    assert.strictEqual(tableRows.length, 2, "table must have one row per activity");
    assert.strictEqual(mobileCards.length, 2, "mobile cards must have one card per activity");
    assert.ok(outlet().textContent.indexOf("Excavation") !== -1);
    assert.ok(outlet().textContent.indexOf("Foundation Pour") !== -1);
  });

  await check("a mobile card shows the same key fields as its table row counterpart", () => {
    var card = Array.from(outlet().querySelectorAll(".activities-mobile-cards .project-card")).find(
      (c) => c.textContent.indexOf("Foundation Pour") !== -1
    );
    assert.ok(card);
    assert.ok(card.textContent.indexOf("2026-08-11") !== -1, "planned start must show");
    assert.ok(card.textContent.indexOf("2026-08-20") !== -1, "planned finish must show");
    assert.ok(card.textContent.indexOf("40% complete") !== -1);
    assert.ok(card.textContent.indexOf("IN PROGRESS") !== -1 || card.textContent.indexOf("In Progress") !== -1);
    assert.ok(card.querySelector('.icon-btn[aria-label="More actions"]'), "mobile card must have the same row-menu Edit/Delete access as the table row");
  });

  await check("the mobile card's '⋯' menu opens the same Edit/Clone/Delete actions as the table row's menu (shared buildActivityRowMenu)", async () => {
    var card = Array.from(outlet().querySelectorAll(".activities-mobile-cards .project-card")).find(
      (c) => c.textContent.indexOf("Excavation") !== -1
    );
    card.querySelector('.icon-btn[aria-label="More actions"]').click();
    await flush();

    var refreshedCard = Array.from(outlet().querySelectorAll(".activities-mobile-cards .project-card")).find(
      (c) => c.textContent.indexOf("Excavation") !== -1
    );
    var dropdown = refreshedCard.querySelector(".card-menu__dropdown");
    assert.ok(dropdown, "menu must open from the mobile card");
    var items = Array.from(dropdown.querySelectorAll(".card-menu__item")).map((b) => b.textContent.trim());
    assert.deepStrictEqual(items, ["Edit", "Clone", "Delete"]);
    // Close it so later checks aren't affected by a leftover open menu.
    win.document.querySelector(".card-menu__overlay").click();
    await flush();
  });

  await check("the CSS bundle actually contains the table/mobile-card breakpoint swap (jsdom can't evaluate @media, so this checks the shipped rule text directly)", () => {
    var css = styleText();
    assert.ok(css.indexOf(".activities-table-wrap {\n    display: none;") !== -1 || css.indexOf(".activities-table-wrap {\n  display: none;") !== -1 || /\.activities-table-wrap\s*\{\s*display:\s*none;/.test(css), "missing the mobile rule hiding the table");
    assert.ok(/\.activities-mobile-cards\s*\{\s*display:\s*flex;/.test(css), "missing the mobile rule showing the cards");
    assert.ok(/\.activities-mobile-cards\s*\{\s*display:\s*none;\s*\}/.test(css), "missing the default (non-mobile) rule hiding the cards");
  });

  // ============================================================================
  // Gantt: mobile timeline alternative (genuine JS conditional — fully testable)
  // ============================================================================

  await check("at a desktop width, the Gantt tab renders the interactive chart and NOT the mobile timeline", async () => {
    win.innerWidth = 1024;
    // schedule.js is React-migrated: switchTab("gantt") while already on the Gantt tab
    // is a same-value setState (a no-op React bails on), so it would NOT force a
    // re-render to pick up the new window.innerWidth (read directly in the component
    // body, not stored in state). Force a fresh mount instead, via the same pending-prop
    // hand-off every other cross-page "land on this tab" link already uses.
    win.PCC.schedule.viewProject(projId);
    win.PCC.router.render();
    await flush();
    assert.ok(outlet().querySelector("svg"), "interactive chart must render at desktop width");
    assert.strictEqual(outlet().querySelector(".gantt-mobile-timeline"), null, "mobile timeline must not even be built at desktop width — it isn't virtualized, so it must not exist in the DOM when not needed");
  });

  await check("at a phone width, the Gantt tab builds the mobile timeline instead, sorted by planned start", async () => {
    win.innerWidth = 390;
    win.PCC.schedule.viewProject(projId);
    win.PCC.router.render();
    await flush();

    var timeline = outlet().querySelector(".gantt-mobile-timeline");
    assert.ok(timeline, "mobile timeline must be built at phone width");
    var cards = Array.from(timeline.querySelectorAll(".project-card"));
    assert.strictEqual(cards.length, 2);
    var names = cards.map((c) => c.querySelector(".project-card__name").textContent.trim());
    assert.deepStrictEqual(names, ["Excavation", "Foundation Pour"], "timeline must be sorted by planned start ascending");
  });

  await check("the chart itself is still built at phone width (for the CSS toggle's default-shown case at wider widths within the same session) but tagged for CSS to hide", () => {
    assert.ok(outlet().querySelector("svg"), "chart must still be built — jsdom can't verify it's CSS-hidden, but it must exist for a real browser's media query to act on");
    assert.ok(outlet().querySelector(".gantt-chart-panel"), "chart panel must carry the class the mobile breakpoint hides");
  });

  await check("tapping a mobile timeline card opens the same Activity Detail Panel the chart itself uses", async () => {
    var card = Array.from(outlet().querySelectorAll(".gantt-mobile-timeline .project-card")).find(
      (c) => c.textContent.indexOf("Excavation") !== -1
    );
    card.click();
    await flush();
    assert.ok(outlet().textContent.indexOf("Activity ID") !== -1, "detail panel must open");
    assert.ok(outlet().textContent.indexOf("Excavation") !== -1);
    var closeBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.trim() === "Close");
    closeBtn.click();
    await flush();
  });

  await check("switching back to a desktop width and rerendering removes the mobile timeline and shows zoom/jump controls again", async () => {
    win.innerWidth = 1024;
    win.PCC.schedule.viewProject(projId);
    win.PCC.router.render();
    await flush();
    assert.strictEqual(outlet().querySelector(".gantt-mobile-timeline"), null);
    assert.ok(Array.from(outlet().querySelectorAll("button")).some((b) => b.textContent.trim() === "Daily"), "zoom buttons must be present again");
  });

  await check("the CSS bundle contains the chart/timeline breakpoint swap and the zoom-group/baseline-bar hide rules", () => {
    var css = styleText();
    assert.ok(/\.gantt-chart-panel,\s*\n?\s*\.gantt-chart-only-control\s*\{\s*display:\s*none\s*!important;/.test(css), "missing the mobile rule hiding the chart + chart-only controls");
    assert.ok(/\.gantt-mobile-timeline\s*\{\s*display:\s*flex;/.test(css), "missing the mobile rule showing the timeline");
  });

  // ============================================================================
  // Touch targets (CSS-only — check the shipped rule text)
  // ============================================================================

  await check("the CSS bundle contains a tablet/mobile touch-target tier bumping icon-btn/btn/card-menu sizing", () => {
    var css = styleText();
    assert.ok(css.indexOf("@media (max-width: 1023px)") !== -1, "missing the new tablet-and-below touch-target media query");
    var tierMatch = css.match(/@media \(max-width: 1023px\) \{([\s\S]*?)\n\}/);
    assert.ok(tierMatch, "could not isolate the touch-target media block");
    var tier = tierMatch[1];
    assert.ok(/\.icon-btn\s*\{[^}]*width:\s*44px;/.test(tier), "icon-btn must be bumped to a touch-friendly 44px");
    assert.ok(/\.icon-btn\s*\{[^}]*height:\s*44px;/.test(tier), "icon-btn height must match its width");
    assert.ok(tier.indexOf(".card-menu__item") !== -1 && tier.indexOf(".card-menu__checkbox-item") !== -1, "card menu items must also get larger touch padding");
  });

  await check("desktop-width icon-btn sizing (the :root-level rule, not the tablet override) is untouched at 32px — this tier only adds an override, it doesn't change the base rule", () => {
    var css = styleText();
    assert.ok(/\.icon-btn\s*\{[\s\S]{0,200}?width:\s*32px;/.test(css), "the original 32px desktop/laptop icon-btn rule must still exist untouched");
  });

  await check("this gate writes nothing back beyond what was seeded — record counts unchanged", () => {
    var data = win.PCC.store.get();
    assert.strictEqual(data.projects.length, 1);
    assert.strictEqual(data.activities.length, 2);
  });

  // ---- Route smoke test across every page ----
  var routes = [
    "dashboard", "myWork", "actionCentre", "projectLookahead", "portfolio", "projectWorkspace",
    "executiveCenter", "vendors", "vendorPerformanceCentre", "documents", "documentTypes",
    "documentControlDashboard", "dailylog", "schedule", "delayRecoveryDashboard", "risks",
    "meetings", "rfis", "changeOrders", "decisionRegister", "lessonsLearned", "knowledgeBase",
    "cost", "commitments", "resources", "reports", "settings",
  ];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Gate 8 tablet/mobile changes", async () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      await flush();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
