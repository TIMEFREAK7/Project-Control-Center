// End-to-end jsdom test for the command palette (src/js/commandPalette.js), against the
// real bundled index.html.
//
// The core claim being tested: picking a record in the palette lands on its own page with
// THAT record visible — even when it's closed/rejected/superseded and belongs to a
// different project than the current context, which is exactly the case where just doing
// router.go("<register>") would hide it (registers default to "open only" + the current
// project). Each record type is checked against that control: plain navigation hides the
// record, palette navigation shows it.
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

function press(win, key, opts) {
  const target = win.document.activeElement || win.document.body;
  const e = new win.KeyboardEvent("keydown", Object.assign({ key: key, bubbles: true, cancelable: true }, opts || {}));
  target.dispatchEvent(e);
  return e;
}

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  dom.window.indexedDB = new FDBFactory();
  const errors = [];
  dom.window.onerror = function (msg) {
    errors.push(msg);
  };
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  const win = dom.window;
  const doc = win.document;
  const S = win.PCC.store;
  const P = win.PCC.commandPalette;

  const ids = {};
  S.update((d) => {
    const a = S.newProject({ name: "Alpha Plant" });
    const b = S.newProject({ name: "Bravo Terminal", project_code: "BRV" });
    const archived = S.newProject({ name: "Ghost Archived Project", archived: true });
    d.projects.push(a, b, archived);
    ids.a = a.id;
    ids.b = b.id;
    const sch = S.newSchedule({ project_id: b.id, name: "Bravo Master" });
    d.schedules.push(sch);
    const act = S.newActivity({ project_id: b.id, schedule_id: sch.id, name: "Zephyrpour slab", external_id: "A1010" });
    d.activities.push(act);
    ids.activity = act.id;
    // Every record lives in project B (NOT the context project A) and is in a closed-ish
    // status the register hides by default.
    d.risks.push(S.newRisk({ project_id: b.id, title: "Zephyrrisk crane", status: "closed" }));
    d.rfis.push(S.newRfi({ project_id: b.id, number: "RFI-77", subject: "Zephyrrfi rebar", status: "closed" }));
    d.change_orders.push(S.newChangeOrder({ project_id: b.id, number: "CO-9", title: "Zephyrco extra", status: "rejected" }));
    d.decisions.push(S.newDecision({ project_id: b.id, title: "Zephyrdec choose", status: "superseded" }));
    d.meetings.push(S.newMeeting({ project_id: b.id, title: "Zephyrmeet weekly" }));
    d.lessons_learned.push(S.newLessonLearned({ project_id: b.id, title: "Zephyrlesson curing" }));
    d.daily_logs.push(S.newDailyLog({ project_id: b.id, log_date: "2026-01-05", weather: "Zephyrlog sunny" }));
    d.vendors.push(S.newVendor({ vendor_name: "Zephyrvendor Ltd", status: "inactive" }));
    d.documents.push(S.newDocument({ project_id: b.id, filename: "Zephyrdoc.pdf", document_number: "DOC-1", status: "superseded" }));
    d.commitments.push(S.newCommitment({ project_id: b.id, po_contract_number: "PO-Zephyr", status: "closed" }));
    // A record under an archived project must never be offered.
    d.risks.push(S.newRisk({ project_id: archived.id, title: "Zephyrghost risk" }));
  });
  win.PCC.projectContext.set(ids.a);
  win.PCC.router.go("dashboard");
  await flush();

  function outletText() {
    return doc.getElementById("page-outlet").textContent;
  }

  async function openAndType(query) {
    P.open();
    const input = doc.getElementById("command-palette-input");
    input.value = query;
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    return input;
  }

  await check("app boots; Ctrl+K opens the palette as a labelled dialog with focus in the search box", () => {
    assert.strictEqual(errors.length, 0, "window.onerror: " + errors.join(" | "));
    const e = press(win, "k", { ctrlKey: true });
    assert.ok(e.defaultPrevented, "Ctrl+K should be claimed by the app (not the browser's own)");
    const overlay = doc.getElementById("command-palette-overlay");
    assert.ok(overlay, "palette did not open");
    const dialog = overlay.querySelector(".modal");
    assert.strictEqual(dialog.getAttribute("role"), "dialog");
    assert.strictEqual(dialog.getAttribute("aria-label"), "Search pages and records");
    assert.strictEqual(doc.activeElement, doc.getElementById("command-palette-input"));
  });

  await check("empty query lists every sidebar page (and only pages)", () => {
    const groups = Array.from(doc.querySelectorAll(".command-palette__group-label")).map((g) => g.textContent);
    assert.deepStrictEqual(groups, ["Pages"]);
    const labels = Array.from(doc.querySelectorAll(".command-palette__label")).map((l) => l.textContent);
    // Array.from: navItems() returns a jsdom-realm array, whose prototype differs from
    // Node's, which deepStrictEqual would otherwise report as a mismatch.
    const navLabels = Array.from(win.PCC.layout.navItems(), (n) => n.label);
    assert.deepStrictEqual(labels, navLabels, "palette pages must mirror the sidebar exactly");
  });

  await check("Escape closes it; Ctrl+K toggles it closed too", () => {
    press(win, "Escape");
    assert.ok(!doc.getElementById("command-palette-overlay"));
    press(win, "k", { ctrlKey: true });
    assert.ok(doc.getElementById("command-palette-overlay"));
    press(win, "k", { ctrlKey: true });
    assert.ok(!doc.getElementById("command-palette-overlay"));
    assert.strictEqual(win.PCC.modalA11y.isOpen(), false);
  });

  await check("the title-block search button opens it and gets focus back on close", () => {
    const btn = doc.getElementById("command-palette-btn");
    assert.ok(btn, "title-block search button missing");
    btn.focus();
    btn.click();
    assert.ok(doc.getElementById("command-palette-overlay"));
    press(win, "Escape");
    assert.strictEqual(doc.activeElement, btn);
  });

  await check("the nav drawer's search button (the phone entry point) closes the drawer and opens the palette", () => {
    const hamburger = doc.querySelector('.icon-btn[title="Open navigation menu"]');
    assert.ok(hamburger, "hamburger button not found");
    hamburger.click();
    const navSearch = doc.getElementById("nav-search-btn");
    assert.ok(navSearch, "drawer search button missing");
    navSearch.click();
    assert.ok(!doc.getElementById("nav-overlay"), "drawer should close");
    assert.ok(doc.getElementById("command-palette-overlay"), "palette should open");
    assert.strictEqual(doc.activeElement, doc.getElementById("command-palette-input"));
    press(win, "Escape");
    assert.ok(!doc.getElementById("command-palette-overlay"));
  });

  await check("typing a page name + Enter navigates to that page", async () => {
    await openAndType("change mgmt");
    press(win, "Enter");
    await flush();
    assert.ok(!doc.getElementById("command-palette-overlay"), "palette should close on selection");
    assert.strictEqual(win.PCC.router.currentRouteName(), "changeOrders");
  });

  await check("arrow keys move the active option (wrapping), with aria-activedescendant + aria-selected kept in sync", async () => {
    const input = await openAndType("");
    const options = doc.querySelectorAll(".command-palette__option");
    assert.strictEqual(input.getAttribute("aria-activedescendant"), options[0].id);
    press(win, "ArrowDown");
    assert.strictEqual(input.getAttribute("aria-activedescendant"), options[1].id);
    assert.strictEqual(options[1].getAttribute("aria-selected"), "true");
    assert.strictEqual(options[0].getAttribute("aria-selected"), "false");
    press(win, "ArrowUp");
    press(win, "ArrowUp");
    assert.strictEqual(input.getAttribute("aria-activedescendant"), options[options.length - 1].id, "ArrowUp from the first should wrap to the last");
    press(win, "Escape");
  });

  await check("no match shows a clear empty state and announces 'No results'", async () => {
    await openAndType("qqqqxxxxzzzz");
    assert.strictEqual(doc.querySelectorAll(".command-palette__option").length, 0);
    assert.ok(doc.querySelector(".command-palette__empty").textContent.indexOf("qqqqxxxxzzzz") !== -1);
    assert.strictEqual(doc.querySelector(".command-palette__status").textContent, "No results");
    press(win, "Escape");
  });

  await check("records under an archived project are never offered", () => {
    const all = P.search("Zephyrghost");
    const labels = [].concat.apply([], all.map((g) => g.items.map((i) => i.label)));
    assert.ok(labels.indexOf("Zephyrghost risk") === -1, "archived-project record leaked into results: " + labels.join(", "));
  });

  await check("an exact match in a later group outranks a typo-level fuzzy match in an earlier one", () => {
    // "Zephyrrfi" is within fuzzy distance of the RISK "Zephyrrisk", and Risks comes
    // before RFIs in type order — the exact RFI hit must still be the first group/option.
    const groups = P.search("Zephyrrfi");
    assert.strictEqual(groups[0].group, "RFIs & TQs");
    assert.strictEqual(groups[0].items[0].label, "RFI-77 · Zephyrrfi rebar");
  });

  await check("fuzzy (typo) matching reuses the registers' own matcher", () => {
    const groups = P.search("Zephyrvendr"); // one letter dropped
    const vendors = groups.find((g) => g.group === "Vendors");
    assert.ok(vendors && vendors.items[0].label === "Zephyrvendor Ltd");
  });

  // Each record type: [query, expected group, route, text that proves the record is shown].
  const CASES = [
    ["Zephyrrisk", "Risks & Issues", "risks", "Zephyrrisk crane"],
    ["Zephyrrfi", "RFIs & TQs", "rfis", "Zephyrrfi rebar"],
    ["Zephyrco", "Change Orders", "changeOrders", "Zephyrco extra"],
    ["Zephyrdec", "Decisions", "decisionRegister", "Zephyrdec choose"],
    ["Zephyrmeet", "Meetings", "meetings", "Zephyrmeet weekly"],
    ["Zephyrlesson", "Lessons Learned", "lessonsLearned", "Zephyrlesson curing"],
    ["Zephyrdoc", "Documents", "documents", "Zephyrdoc.pdf"],
    ["PO-Zephyr", "Commitments", "commitments", "PO-Zephyr"],
  ];

  for (const [query, group, route, proof] of CASES) {
    await check(`${group}: plain navigation hides the closed, other-project record, but the palette lands on it visible`, async () => {
      win.PCC.projectContext.set(ids.a);
      win.PCC.router.go(route);
      await flush();
      assert.ok(outletText().indexOf(proof) === -1, `control failed: "${proof}" is already visible on plain navigation to ${route}, so this check proves nothing`);
      win.PCC.router.go("dashboard");
      await flush();

      await openAndType(query);
      const firstGroup = doc.querySelector(".command-palette__group-label");
      assert.strictEqual(firstGroup.textContent, group, "top result group should be " + group);
      press(win, "Enter");
      await flush();
      assert.strictEqual(win.PCC.router.currentRouteName(), route);
      assert.ok(outletText().indexOf(proof) !== -1, `"${proof}" should be visible on ${route} after jumping from the palette`);
    });
  }

  await check("Daily Logs: jumps to the other-project log", async () => {
    win.PCC.projectContext.set(ids.a);
    await openAndType("2026-01-05");
    assert.strictEqual(doc.querySelector(".command-palette__group-label").textContent, "Daily Logs");
    press(win, "Enter");
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "dailylog");
    assert.ok(outletText().indexOf("Zephyrlog sunny") !== -1, "the log's own content should be shown (expanded)");
  });

  await check("Activities: jumps to the Schedule with that activity's project/schedule selected and the activity shown", async () => {
    win.PCC.projectContext.set(ids.a);
    await openAndType("A1010");
    assert.strictEqual(doc.querySelector(".command-palette__group-label").textContent, "Activities");
    press(win, "Enter");
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "schedule");
    assert.strictEqual(win.PCC.projectContext.get(), ids.b, "project context should follow the activity's project");
    assert.ok(outletText().indexOf("Zephyrpour slab") !== -1);
  });

  await check("Vendors: an inactive vendor opens on its profile", async () => {
    await openAndType("Zephyrvendor");
    press(win, "Enter");
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "vendors");
    assert.ok(outletText().indexOf("Zephyrvendor Ltd") !== -1);
  });

  await check("Projects: clicking a project result opens its Project Workspace", async () => {
    win.PCC.projectContext.set(ids.a);
    await openAndType("Bravo");
    const projectOpt = Array.from(doc.querySelectorAll(".command-palette__option")).find((o) => o.querySelector(".command-palette__label").textContent === "Bravo Terminal");
    assert.ok(projectOpt, "project result not listed");
    projectOpt.click();
    await flush();
    assert.strictEqual(win.PCC.router.currentRouteName(), "projectWorkspace");
    assert.ok(outletText().indexOf("Bravo Terminal") !== -1);
  });

  await check("Ctrl+K does nothing while another dialog is already open (never stacks under/over it)", () => {
    win.PCC.keyboardShortcuts.showHelp();
    press(win, "k", { ctrlKey: true });
    assert.ok(!doc.getElementById("command-palette-overlay"));
    press(win, "Escape");
    assert.ok(!doc.getElementById("shortcuts-help-overlay"));
  });

  await check("the keyboard-shortcuts help lists Ctrl+K", () => {
    win.PCC.keyboardShortcuts.showHelp();
    const text = doc.getElementById("shortcuts-help-overlay").textContent;
    press(win, "Escape");
    assert.ok(text.indexOf("Ctrl+K") !== -1);
  });

  await check("no uncaught errors across the whole run", () => {
    assert.strictEqual(errors.length, 0, "window.onerror: " + errors.join(" | "));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
