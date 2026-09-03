// Company/Client/Project Management redesign (CLAUDE.md spec) — DOM-level e2e test,
// loading the real bundled index.html the way test_global_project_context_daily_screens_e2e.js
// does, since Portfolio's inline "+ Add New Company/Client" flow, the new Organizations
// page, and the header/Dashboard cascading selectors are all real DOM/event-wiring that
// store.js/projectContext.js's own standalone tests (test_company_client_project_management.js)
// can't exercise on their own.
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
  const byText = (tag, text) => Array.from(outlet().querySelectorAll(tag)).find((el) => el.textContent.trim() === text);

  function selectByVisibleText(select, text) {
    const opt = Array.from(select.options).find((o) => o.textContent === text);
    assert.ok(opt, `option "${text}" not found in select (options: ${Array.from(select.options).map((o) => o.textContent).join(", ")})`);
    // Several of these selects (Portfolio's Company/Client pickers, the header/Dashboard
    // context switchers) are React-controlled: a raw `.value =` assignment doesn't
    // reliably reach a controlled <select>'s onChange (React patches the native setter
    // to track "last known value" — see CLAUDE.md's React migration notes), so bypass it
    // via the native prototype descriptor before dispatching the change event.
    Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(select, opt.value);
    select.dispatchEvent(new win.Event("change", { bubbles: true }));
  }

  // -------------------------------------------------------------------------
  // Portfolio: relationship-based creation (spec point 5B) via inline "+ Add New
  // Company…"/"+ Add New Client…" right inside the Add Project form.
  // -------------------------------------------------------------------------
  var projectId;
  await check("Portfolio's Add Project form: creating a new Company and Client inline, then saving, links the project by id and syncs the legacy client/company text fields", async () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    // portfolio.js is a React-migrated page — flush before interacting and after every
    // click whose state update commits asynchronously (see CLAUDE.md's React
    // migration notes).
    await flush();
    var addBtn = byText("button", "+ Add Project");
    assert.ok(addBtn, "'+ Add Project' button not found");
    addBtn.click();
    await flush();

    var nameInput = outlet().querySelector("#field-name");
    nameInput.value = "Ashoka";
    nameInput.dispatchEvent(new win.Event("input"));

    var companySelect = outlet().querySelector("#field-company_id");
    var clientSelect = outlet().querySelector("#field-client_id");
    assert.ok(companySelect && clientSelect, "Company/Client selects not found in the Add Project form");

    selectByVisibleText(companySelect, "+ Add New Company…");
    await flush();
    companySelect = outlet().querySelector("#field-company_id");
    var companyNameInput = companySelect.parentElement.querySelector("input[type=text]");
    var companyNameSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
    companyNameSetter.call(companyNameInput, "FABS");
    companyNameInput.dispatchEvent(new win.Event("input", { bubbles: true }));
    var companyCreateBtn = Array.from(companySelect.parentElement.querySelectorAll("button")).find((b) => b.textContent === "Create");
    companyCreateBtn.click();
    await flush();

    assert.ok(win.PCC.store.get().companies.some((c) => c.name === "FABS"), "Company must be created in the store immediately");
    companySelect = outlet().querySelector("#field-company_id");
    assert.strictEqual(Array.from(companySelect.options).find((o) => o.selected).textContent, "FABS", "the newly created Company must be auto-selected");

    clientSelect = outlet().querySelector("#field-client_id");
    selectByVisibleText(clientSelect, "+ Add New Client…");
    await flush();
    clientSelect = outlet().querySelector("#field-client_id");
    var clientNameInput = clientSelect.parentElement.querySelector("input[type=text]");
    var clientNameSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
    clientNameSetter.call(clientNameInput, "PepsiCo");
    clientNameInput.dispatchEvent(new win.Event("input", { bubbles: true }));
    var clientCreateBtn = Array.from(clientSelect.parentElement.querySelectorAll("button")).find((b) => b.textContent === "Create");
    clientCreateBtn.click();
    await flush();

    var createdClient = win.PCC.store.get().clients.find((c) => c.name === "PepsiCo");
    assert.ok(createdClient, "Client must be created in the store immediately");
    assert.strictEqual(createdClient.company_id, win.PCC.store.get().companies.find((c) => c.name === "FABS").id, "the new Client must be scoped to the just-created Company");

    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { cancelable: true, bubbles: true }));
    await flush();

    var project = win.PCC.store.get().projects.find((p) => p.name === "Ashoka");
    assert.ok(project, "project must have been saved");
    projectId = project.id;
    var fabs = win.PCC.store.get().companies.find((c) => c.name === "FABS");
    var pepsi = win.PCC.store.get().clients.find((c) => c.name === "PepsiCo");
    assert.strictEqual(project.company_id, fabs.id);
    assert.strictEqual(project.client_id, pepsi.id);
    assert.strictEqual(project.company, "FABS", "legacy display-label field must be synced");
    assert.strictEqual(project.client, "PepsiCo", "legacy display-label field must be synced");
    assert.strictEqual(project.relationship_history.length, 0, "no history yet — this is the initial assignment, not a change");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // -------------------------------------------------------------------------
  // Relationship change (spec points 12/13): editing the project onto a different
  // Company/Client must record the PRIOR relationship in history, never lose it.
  // -------------------------------------------------------------------------
  await check("editing an existing project's Company/Client to a different pair records the prior relationship in relationship_history and preserves all other project data", async () => {
    win.PCC.store.update((d) => {
      var abc = win.PCC.store.newCompany({ name: "ABC Engineering" });
      d.companies.push(abc);
      var tata = win.PCC.store.newClient({ company_id: abc.id, name: "Tata" });
      d.clients.push(tata);
    });

    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    await flush();
    // Open this specific project's Edit form via its card menu.
    var cards = Array.from(outlet().querySelectorAll(".project-card"));
    var card = cards.find((c) => c.textContent.indexOf("Ashoka") !== -1);
    assert.ok(card, "Ashoka project card not found");
    var toggle = Array.from(card.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "More actions");
    assert.ok(toggle, "card menu toggle ('More actions') not found on the Ashoka card");
    toggle.click();
    await flush();
    var editItem = Array.from(outlet().querySelectorAll(".card-menu__item")).find((b) => b.textContent.trim() === "Edit");
    assert.ok(editItem, "Edit menu item not found on the Ashoka card");
    editItem.click();
    await flush();

    var companySelect = outlet().querySelector("#field-company_id");
    var clientSelect = outlet().querySelector("#field-client_id");
    selectByVisibleText(companySelect, "ABC Engineering");
    await flush();
    clientSelect = outlet().querySelector("#field-client_id");
    selectByVisibleText(clientSelect, "Tata");
    await flush();

    var form = outlet().querySelector("form");
    form.dispatchEvent(new win.Event("submit", { cancelable: true, bubbles: true }));
    await flush();

    var project = win.PCC.store.get().projects.find((p) => p.id === projectId);
    var abc = win.PCC.store.get().companies.find((c) => c.name === "ABC Engineering");
    var tata = win.PCC.store.get().clients.find((c) => c.name === "Tata");
    assert.strictEqual(project.company_id, abc.id);
    assert.strictEqual(project.client_id, tata.id);
    assert.strictEqual(project.name, "Ashoka", "the project's own data must be untouched by a relationship change");

    assert.strictEqual(project.relationship_history.length, 1, "the prior FABS/PepsiCo relationship must be recorded");
    var priorEntry = project.relationship_history[0];
    assert.strictEqual(priorEntry.company_name, "FABS");
    assert.strictEqual(priorEntry.client_name, "PepsiCo");
    assert.ok(priorEntry.changed_at);
  });

  // -------------------------------------------------------------------------
  // Organizations page: browse the hierarchy, archive/unarchive, "+ New Project" handoff.
  // -------------------------------------------------------------------------
  await check("Organizations page lists Companies with their Clients and Projects, and archiving a Company keeps everything intact but drops it from active pickers", async () => {
    win.PCC.router.go("organizations");
    win.PCC.router.render();
    // Flush here, BEFORE interacting — router.js's suppressNextHashRender is a single
    // flag, so a hashchange-triggered render can still land asynchronously after this
    // go()+render() pair; flushing now (rather than only after the click below) keeps
    // that extra render from landing on top of our own state change and wiping it (see
    // CLAUDE.md's React migration notes on this race).
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("ABC Engineering") !== -1);
    assert.ok(text.indexOf("FABS") !== -1);

    // Expand ABC Engineering to see its Tata client and the Ashoka project under it.
    // Organizations is a React-migrated page — a click's state update commits
    // asynchronously (see CLAUDE.md's React migration notes), so await flush() before
    // reading the resulting DOM.
    var expandBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.indexOf("ABC Engineering") !== -1);
    expandBtn.click();
    await flush();
    assert.ok(outlet().textContent.indexOf("Tata") !== -1, "Tata client should be visible once ABC Engineering is expanded");
    assert.ok(outlet().textContent.indexOf("Ashoka") !== -1, "Ashoka project should be visible under ABC Engineering / Tata");

    // Archive FABS (now has zero active projects since Ashoka moved to ABC Engineering).
    // Scoped to FABS's own card header specifically — ABC Engineering is expanded above,
    // so its Tata client card also has its own "Archive" button in the DOM; a plain
    // document-wide first-match would grab the wrong one.
    var fabsExpandBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.indexOf("FABS") !== -1);
    var fabsPanel = fabsExpandBtn.closest(".panel");
    assert.ok(fabsPanel, "FABS company panel not found");
    var fabsArchiveBtn = Array.from(fabsPanel.children[0].querySelectorAll("button")).find((b) => b.textContent === "Archive");
    assert.ok(fabsArchiveBtn, "FABS's own Archive button not found in its card header");
    fabsArchiveBtn.click();
    await flush();

    var fabs = win.PCC.store.get().companies.find((c) => c.name === "FABS");
    assert.strictEqual(fabs.archived, true);
    assert.ok(win.PCC.store.get().clients.some((c) => c.name === "PepsiCo"), "PepsiCo client record must still exist after its Company is archived");
    assert.strictEqual(outlet().textContent.indexOf("FABS"), -1, "an archived company must drop out of the default (non-archived) list view");

    // "Show archived" brings it back into view, proving the data is still there. Use
    // .click(), not a raw .checked= assignment — a controlled checkbox's onChange isn't
    // reliably reached by the latter (see CLAUDE.md's React migration notes).
    var showArchivedCheckbox = outlet().querySelector('input[type=checkbox]');
    showArchivedCheckbox.click();
    await flush();
    assert.ok(outlet().textContent.indexOf("FABS") !== -1, "Show archived must reveal the archived company again");
  });

  await check("Organizations page's '+ New Project' hands off to Portfolio with Company/Client pre-selected (spec point 5B)", async () => {
    win.PCC.router.go("organizations");
    win.PCC.router.render();
    await flush();
    // Organizations is a React-migrated page: unlike a vanilla page's persistent
    // module-level uiState, its local useState (including the expand/collapse toggle)
    // resets on every fresh mount (see CLAUDE.md's React migration notes) — so re-expand
    // ABC Engineering here rather than assuming it survived from the earlier check.
    var expandBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent.indexOf("ABC Engineering") !== -1);
    expandBtn.click();
    await flush();
    var newProjectBtn = Array.from(outlet().querySelectorAll("button")).find((b) => b.textContent === "+ New Project");
    assert.ok(newProjectBtn, "'+ New Project' button not found under ABC Engineering / Tata");
    newProjectBtn.click();
    await flush();

    assert.strictEqual(win.PCC.router.currentRouteName(), "portfolio", "must navigate to Portfolio");
    var heading = outlet().querySelector("h3");
    assert.strictEqual(heading.textContent, "Add Project", "the Add Project form must already be open");
    var companySelect = outlet().querySelector("#field-company_id");
    var clientSelect = outlet().querySelector("#field-client_id");
    var abc = win.PCC.store.get().companies.find((c) => c.name === "ABC Engineering");
    var tata = win.PCC.store.get().clients.find((c) => c.name === "Tata");
    assert.strictEqual(companySelect.value, abc.id, "Company must be pre-selected");
    assert.strictEqual(clientSelect.value, tata.id, "Client must be pre-selected");

    // Cancelling and reopening a fresh "+ Add Project" must NOT still carry the old prefill.
    // Flush between the two clicks — portfolio.js is a React-migrated page, and two
    // setEditingId() calls fired back-to-back with no tick between them (unlike any
    // real user's click-then-click, which always has wall-clock time in between) can
    // get batched into a single React 18 render, so ProjectForm's key={editingId} never
    // actually changes and the form never remounts to reset its state (see CLAUDE.md's
    // React migration notes on this general class of back-to-back-interaction race).
    var cancelBtn = byText("button", "Cancel");
    cancelBtn.click();
    await flush();
    var addBtn = byText("button", "+ Add Project");
    addBtn.click();
    await flush();
    var freshCompanySelect = outlet().querySelector("#field-company_id");
    assert.strictEqual(freshCompanySelect.value, "", "a later unrelated '+ Add Project' must not inherit a stale prefill");
  });

  // -------------------------------------------------------------------------
  // Shell header + Dashboard: the cascading Company/Client/Project global switcher.
  // -------------------------------------------------------------------------
  await check("the shell header's Company/Client/Project selects cascade: picking a Company scopes Client options, picking a Client scopes Project options, and never shows unrelated projects", () => {
    win.PCC.router.go("dashboard");
    win.PCC.router.render();
    var companySelect = win.document.getElementById("title-block-company-select");
    var clientSelect = win.document.getElementById("title-block-client-select");
    var projectSelect = win.document.getElementById("title-block-project-select");
    assert.ok(companySelect && clientSelect && projectSelect, "header context selects not found");

    var abc = win.PCC.store.get().companies.find((c) => c.name === "ABC Engineering");
    selectByVisibleText(companySelect, "ABC Engineering");
    assert.strictEqual(win.PCC.projectContext.getCompany(), abc.id);
    var clientOptionTexts = Array.from(clientSelect.options).map((o) => o.textContent);
    assert.ok(clientOptionTexts.indexOf("Tata") !== -1);
    assert.strictEqual(clientOptionTexts.indexOf("PepsiCo"), -1, "PepsiCo belongs to FABS, not ABC Engineering — must never appear here");

    // With a Company chosen but no Client yet, the Project select must be disabled
    // rather than showing an unscoped list (spec points 7-8).
    assert.strictEqual(projectSelect.disabled, true);

    selectByVisibleText(clientSelect, "Tata");
    assert.strictEqual(projectSelect.disabled, false);
    var projectOptionTexts = Array.from(projectSelect.options).map((o) => o.textContent);
    assert.ok(projectOptionTexts.indexOf("Ashoka") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Dashboard's own prominent context switcher (spec point 6) shares the exact same global context as the header, kept in sync automatically", () => {
    var dashCompanySelect = win.document.getElementById("dashboard-context-company-select");
    var dashClientSelect = win.document.getElementById("dashboard-context-client-select");
    var dashProjectSelect = win.document.getElementById("dashboard-context-project-select");
    assert.ok(dashCompanySelect && dashClientSelect && dashProjectSelect, "Dashboard's own context switcher not found");
    var abc = win.PCC.store.get().companies.find((c) => c.name === "ABC Engineering");
    assert.strictEqual(dashCompanySelect.value, abc.id, "Dashboard's switcher must reflect the context already set via the header");

    var ashoka = win.PCC.store.get().projects.find((p) => p.name === "Ashoka");
    selectByVisibleText(dashProjectSelect, "Ashoka");
    assert.strictEqual(win.PCC.projectContext.get(), ashoka.id, "picking a Project on Dashboard's own switcher IS the global context change, not a local filter");

    // The header's own selects must reflect this too — same shared state, not two
    // independent copies (spec point 10: "not merely a Dashboard filter").
    var headerProjectSelect = win.document.getElementById("title-block-project-select");
    assert.strictEqual(headerProjectSelect.value, ashoka.id);
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
