// End-to-end jsdom smoke test against the ACTUAL bundled index.html (not a
// reimplementation) — same convention as test_schedule_baseline_e2e.js and
// test_schedule_excel_editor_e2e.js. Exercises Gate 9 (Vendor Management): create a
// vendor with a primary contact, link a project, add a second contact, link an
// existing meeting/RFI/risk and confirm "View X" actually navigates and reuses those
// modules' own expand hooks, add a performance review and check the computed overall
// average, add a note, check the dashboard's summary cards, search/filter on the
// master list, and confirm deleting a vendor cascades to its contacts/links.
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

// portfolio.js is a React-migrated page: a raw `.value =` assignment doesn't reliably
// reach a controlled <select>'s onChange (React patches the native setter to track "last
// known value" — see CLAUDE.md's React migration notes), so bypass it via the native
// prototype descriptor before dispatching the change event.
function setReactSelectValue(win, select, value) {
  Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set.call(select, value);
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
}

function findButtonByText(dom, text) {
  const buttons = Array.from(dom.window.document.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}
function findButtonsByTextPrefix(dom, prefix) {
  const buttons = Array.from(dom.window.document.querySelectorAll("button"));
  return buttons.filter((b) => b.textContent.trim().indexOf(prefix) === 0);
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

  await check("app boots on the bundled index.html without throwing", () => {
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    assert.ok(win.PCC && win.PCC.store, "window.PCC.store must exist after boot");
  });

  let projectId, meetingId, rfiId, riskId;
  await check("seed a project + a meeting, RFI, and risk on it (for later vendor linking)", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_vendor_1", name: "Vendor Test Tower", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var meeting = win.PCC.store.newMeeting({ project_id: projectId, title: "Kickoff Meeting", meeting_date: "2026-02-01", attendees: "PM, Site Engineer", minutes: "Discussed mobilization schedule." });
      data.meetings.push(meeting);
      meetingId = meeting.id;

      var rfi = win.PCC.store.newRfi({ project_id: projectId, subject: "Foundation rebar spec", type: "rfi", status: "open" });
      rfi.number = win.PCC.store.nextRfiNumber(data.rfis, "rfi");
      data.rfis.push(rfi);
      rfiId = rfi.id;

      var risk = win.PCC.store.newRisk({ project_id: projectId, title: "Late steel delivery", type: "risk", status: "open" });
      data.risks.push(risk);
      riskId = risk.id;
    });
    assert.ok(projectId && meetingId && rfiId && riskId);
  });

  await check("navigate to the vendors route — dashboard is the default view", () => {
    win.PCC.router.go("vendors");
    win.PCC.router.render();
    assert.ok(outlet().textContent.indexOf("Vendor Dashboard") !== -1, "dashboard should be the default view");
    assert.ok(outlet().textContent.toUpperCase().indexOf("TOTAL VENDORS") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  let vendorId;
  await check("switch to Vendor List, add a vendor with a primary contact, and land on its Profile", () => {
    findButtonByText(dom, "Vendor List").click();
    findButtonByText(dom, "+ Add Vendor").click();

    win.document.getElementById("vendorfield-vendor_name").value = "Acme Steel Suppliers";
    win.document.getElementById("vendorfield-company_name").value = "Acme Pvt Ltd";
    win.document.getElementById("vendorfield-trade_discipline").value = "Structural Steel";
    win.document.getElementById("vendorfield-gst_number").value = "GST123456";
    win.document.getElementById("vendorfield-status").value = "preferred";
    win.document.getElementById("vendorfield-contact-name").value = "Rajesh Kumar";
    win.document.getElementById("vendorfield-contact-designation").value = "Sales Manager";
    win.document.getElementById("vendorfield-contact-mobile").value = "9999999999";
    win.document.getElementById("vendorfield-contact-email").value = "rajesh@acme.example";

    findButtonByText(dom, "Add Vendor").click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.vendors.length, 1);
    vendorId = data.vendors[0].id;
    assert.strictEqual(data.vendors[0].vendor_name, "Acme Steel Suppliers");
    assert.strictEqual(data.vendors[0].status, "preferred");
    assert.ok(data.vendors[0].vendor_code, "vendor_code should have been auto-suggested");

    var contacts = data.vendor_contacts.filter((c) => c.vendor_id === vendorId);
    assert.strictEqual(contacts.length, 1, "primary contact should have been upserted from the vendor form");
    assert.strictEqual(contacts[0].name, "Rajesh Kumar");
    assert.strictEqual(contacts[0].is_primary, true);

    assert.ok(outlet().textContent.indexOf("Acme Steel Suppliers") !== -1, "should have navigated to the new vendor's profile");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Projects tab: link the vendor to the seeded project with role/scope/contract status", () => {
    findButtonByText(dom, "Projects").click();
    findButtonByText(dom, "+ Link Project").click();

    var form = win.document.querySelector("form");
    form.querySelector("select").value = projectId; // project select is the form's only <select> before contract_status
    win.document.getElementById("vplfield-role").value = "Steel Supplier";
    win.document.getElementById("vplfield-contract_status").value = "active";
    win.document.getElementById("vplfield-scope_of_work").value = "Supply and deliver structural steel per BOQ.";
    findButtonByText(dom, "Link Project").click();

    var data = win.PCC.store.get();
    var links = data.vendor_project_links.filter((l) => l.vendor_id === vendorId);
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].project_id, projectId);
    assert.strictEqual(links[0].role, "Steel Supplier");
    assert.strictEqual(links[0].contract_status, "active");
    assert.ok(outlet().textContent.indexOf("Vendor Test Tower") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Portfolio's project details panel shows the same link (Vendor Management -> Portfolio direction)", async () => {
    win.PCC.router.go("portfolio");
    win.PCC.router.render();
    // portfolio.js is a React-migrated page — flush before interacting and after every
    // click whose state update commits asynchronously (see CLAUDE.md's React
    // migration notes).
    await flush();
    findButtonByText(dom, "Details").click();
    await flush();
    var text = outlet().textContent;
    assert.ok(text.indexOf("VENDORS (1)") !== -1, "expected the Vendors section to show the 1 link made from the Vendor Profile side, got: " + text.slice(0, 1000));
    assert.ok(text.indexOf("Acme Steel Suppliers") !== -1);
    assert.ok(text.indexOf("Steel Supplier") !== -1, "expected the role set from the Vendor Profile side to show here too");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("unlinking from Portfolio removes it, and '+ Link Vendor' from Portfolio re-links it (Portfolio -> Vendor Management direction)", async () => {
    findButtonByText(dom, "Unlink").click();
    await flush();
    var afterUnlink = win.PCC.store.get();
    assert.strictEqual(afterUnlink.vendor_project_links.filter((l) => l.vendor_id === vendorId).length, 0);
    assert.ok(outlet().textContent.indexOf("VENDORS (0)") !== -1);

    var linkBtn = findButtonByText(dom, "+ Link Vendor");
    assert.strictEqual(linkBtn.disabled, false, "the vendor should be available to link again after unlinking");
    linkBtn.click();
    await flush();
    var picker = Array.from(win.document.querySelectorAll("select")).find((s) => Array.from(s.options).some((o) => o.textContent === "Acme Steel Suppliers"));
    assert.ok(picker, "vendor picker select not found in Portfolio's Link Vendor panel");
    setReactSelectValue(win, picker, vendorId);
    await flush();
    findButtonByText(dom, "Link").click();
    await flush();

    var afterRelink = win.PCC.store.get();
    var relinked = afterRelink.vendor_project_links.filter((l) => l.vendor_id === vendorId && l.project_id === projectId);
    assert.strictEqual(relinked.length, 1);
    assert.ok(outlet().textContent.indexOf("VENDORS (1)") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the Portfolio-side link is visible back on the vendor's own Projects tab (round trip)", () => {
    if (win.PCC.vendors) win.PCC.vendors.openProfile(vendorId);
    win.PCC.router.go("vendors");
    win.PCC.router.render();
    findButtonByText(dom, "Projects").click();
    assert.ok(outlet().textContent.indexOf("Vendor Test Tower") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Contacts tab: primary contact is listed, and a second contact can be added", () => {
    findButtonByText(dom, "Contacts").click();
    assert.ok(outlet().textContent.indexOf("Rajesh Kumar") !== -1);
    assert.ok(outlet().textContent.indexOf("Primary") !== -1);

    findButtonByText(dom, "+ Add Contact").click();
    win.document.getElementById("vcfield-name").value = "Priya Sharma";
    win.document.getElementById("vcfield-designation").value = "Site Coordinator";
    findButtonByText(dom, "Add Contact").click();

    var data = win.PCC.store.get();
    var contacts = data.vendor_contacts.filter((c) => c.vendor_id === vendorId);
    assert.strictEqual(contacts.length, 2);
    assert.ok(contacts.some((c) => c.name === "Priya Sharma" && !c.is_primary));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  let docId;
  await check("Documents tab: a directly-seeded document (rev 1) shows up with view/history controls", async () => {
    win.PCC.store.update(function (data) {
      var doc = win.PCC.store.newVendorDocument({
        vendor_id: vendorId, project_id: projectId, category: "insurance_document",
        filename: "insurance-2026.pdf", file_size: 45000, mime_type: "application/pdf",
        expiry_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 10 days out — within the 30-day "expiring soon" window
        tags: "insurance, 2026",
      });
      data.vendor_documents.push(doc);
      docId = doc.id;
    });
    await win.PCC.blobStore.putBlob(docId, "data:application/pdf;base64,ZmFrZS1wZGY=");

    findButtonByText(dom, "Documents").click();
    assert.ok(outlet().textContent.indexOf("insurance-2026.pdf") !== -1);
    assert.ok(outlet().textContent.indexOf("Insurance Document") !== -1);
    assert.ok(findButtonByText(dom, "View / Download"), "expected a View / Download button for the stored document");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("uploading a new revision increments revision_number and keeps the same document_group_id", () => {
    findButtonByText(dom, "New Revision").click();
    var data = win.PCC.store.get();
    // Simulate the file having been read (bypassing FileReader, same convention as
    // every other file-upload test in this suite — see documents.js/schedule.js tests).
    win.PCC.store.update(function (d) {
      var rev2 = win.PCC.store.newVendorDocument({
        vendor_id: vendorId, project_id: projectId, document_group_id: docId, revision_number: 2,
        category: "insurance_document", filename: "insurance-2026-v2.pdf", file_size: 46000,
      });
      d.vendor_documents.push(rev2);
    });
    var updated = win.PCC.store.get();
    var revisions = updated.vendor_documents.filter((d) => d.document_group_id === docId);
    assert.strictEqual(revisions.length, 2);
    // Compared via .join(), not assert.deepStrictEqual — these arrays come from jsdom's
    // own realm (via win.PCC.store.get()), whose Array.prototype differs from Node's,
    // so deepStrictEqual against a Node-realm [1, 2] literal fails on prototype
    // identity alone even when every element matches.
    var sortedRevs = revisions.map((r) => r.revision_number).sort().join(",");
    assert.strictEqual(sortedRevs, "1,2");
  });

  await check("Meetings tab: linking the seeded meeting and clicking 'View Meeting' navigates to Meetings with it expanded", () => {
    findButtonByText(dom, "Meetings").click();
    findButtonByText(dom, "+ Link Existing Meeting").click();
    var picker = win.document.querySelector(".panel select");
    assert.ok(picker, "meeting picker select not found");
    picker.value = meetingId;
    findButtonByText(dom, "Link").click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.vendor_meeting_links.filter((l) => l.vendor_id === vendorId).length, 1);
    assert.ok(outlet().textContent.indexOf("Kickoff Meeting") !== -1);

    findButtonByText(dom, "View Meeting").click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "meetings");
    assert.ok(outlet().textContent.indexOf("Kickoff Meeting") !== -1, "expected the meetings page to show the linked meeting");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    win.PCC.router.go("vendors");
    win.PCC.router.render();
  });

  await check("RFIs tab: linking the seeded RFI shows correct pending/closed/open-TQ counts and 'View RFI / TQ' navigates", () => {
    if (win.PCC.vendors) win.PCC.vendors.openProfile(vendorId);
    win.PCC.router.render();
    findButtonByText(dom, "RFI / TQ").click();
    findButtonByText(dom, "+ Link Existing RFI / TQ").click();
    var picker = win.document.querySelector(".panel select");
    picker.value = rfiId;
    findButtonByText(dom, "Link").click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.vendor_rfi_links.filter((l) => l.vendor_id === vendorId).length, 1);
    assert.ok(outlet().textContent.indexOf("1") !== -1 && outlet().textContent.indexOf("Pending RFIs") !== -1);

    findButtonByText(dom, "View RFI / TQ").click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "rfis");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    win.PCC.router.go("vendors");
    win.PCC.router.render();
  });

  await check("Risks tab: linking the seeded risk and clicking 'View Risk' navigates to Risk Register", () => {
    if (win.PCC.vendors) win.PCC.vendors.openProfile(vendorId);
    win.PCC.router.render();
    findButtonByText(dom, "Risks").click();
    findButtonByText(dom, "+ Link Existing Risk").click();
    var picker = win.document.querySelector(".panel select");
    picker.value = riskId;
    findButtonByText(dom, "Link").click();

    var data = win.PCC.store.get();
    assert.strictEqual(data.vendor_risk_links.filter((l) => l.vendor_id === vendorId).length, 1);
    assert.ok(outlet().textContent.indexOf("Late steel delivery") !== -1);

    findButtonByText(dom, "View Risk").click();
    assert.strictEqual(win.PCC.router.currentRouteName(), "risks");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));

    win.PCC.router.go("vendors");
    win.PCC.router.render();
  });

  await check("Performance tab: adding a review computes the correct overall average", () => {
    if (win.PCC.vendors) win.PCC.vendors.openProfile(vendorId);
    win.PCC.router.render();
    findButtonByText(dom, "Performance").click();
    findButtonByText(dom, "+ Add Review").click();

    win.document.getElementById("vperffield-quality_rating").value = "4";
    win.document.getElementById("vperffield-delivery_rating").value = "5";
    win.document.getElementById("vperffield-communication_rating").value = "3";
    win.document.getElementById("vperffield-safety_rating").value = "4";
    win.document.getElementById("vperffield-reviewed_by").value = "Site PM";
    findButtonByText(dom, "Add Review").click();

    var data = win.PCC.store.get();
    var reviews = data.vendor_performance.filter((p) => p.vendor_id === vendorId);
    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].quality_rating, 4);
    // (4+5+3+4)/4 = 4.0
    assert.ok(outlet().textContent.indexOf("4.0 / 5") !== -1, "expected computed overall of 4.0/5, got: " + outlet().textContent.slice(0, 500));
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Notes tab: adding a note appends it to the vendor's note log", () => {
    findButtonByText(dom, "Notes").click();
    win.document.querySelector("textarea").value = "Called vendor re: delivery delay.";
    findButtonByText(dom, "Add Note").click();

    var data = win.PCC.store.get();
    var notes = data.vendor_notes.filter((n) => n.vendor_id === vendorId);
    assert.strictEqual(notes.length, 1);
    assert.ok(outlet().textContent.indexOf("Called vendor re: delivery delay.") !== -1);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Dashboard reflects the seeded vendor correctly (Total/Preferred, Vendors per Project, Expiring Documents)", () => {
    findButtonByText(dom, "← Back to Vendor List").click();
    findButtonByText(dom, "Dashboard").click();
    var text = outlet().textContent;
    assert.ok(text.indexOf("Vendor Test Tower — 1 vendor") !== -1, "expected the per-project breakdown, got: " + text.slice(0, 800));
    assert.ok(text.indexOf("insurance-2026-v2.pdf") !== -1 || text.indexOf("Insurance Document") !== -1, "expiring-soon document should be listed (10 days out, within the 30-day window)");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("Vendor List search finds the vendor by trade, and status filter narrows correctly", () => {
    findButtonByText(dom, "Vendor List").click();
    var search = win.document.querySelector('input[type="text"]');
    search.value = "Structural Steel";
    search.dispatchEvent(new win.Event("input"));
    assert.ok(outlet().textContent.indexOf("Acme Steel Suppliers") !== -1);

    search.value = "nonexistent-trade-xyz";
    search.dispatchEvent(new win.Event("input"));
    assert.ok(outlet().textContent.indexOf("No vendors match") !== -1);

    search.value = "";
    search.dispatchEvent(new win.Event("input"));
    var statusSelect = Array.from(win.document.querySelectorAll("select")).find((s) => s.value === "" && Array.from(s.options).some((o) => o.textContent === "Preferred Vendor"));
    assert.ok(statusSelect, "status filter select not found");
    statusSelect.value = "blacklisted";
    statusSelect.dispatchEvent(new win.Event("change"));
    assert.ok(outlet().textContent.indexOf("No vendors match") !== -1, "preferred vendor should be filtered out by a blacklisted-only filter");
  });

  await check("deleting the vendor cascades to its contacts, links, documents, performance, and notes", async () => {
    var confirmed = win.confirm;
    win.confirm = () => true;
    var statusSelect = Array.from(win.document.querySelectorAll("select")).find((s) => Array.from(s.options).some((o) => o.textContent === "Preferred Vendor"));
    statusSelect.value = "";
    statusSelect.dispatchEvent(new win.Event("change"));

    findButtonByText(dom, "Delete").click();
    await flush();
    win.confirm = confirmed;

    var data = win.PCC.store.get();
    assert.strictEqual(data.vendors.length, 0);
    assert.strictEqual(data.vendor_contacts.filter((c) => c.vendor_id === vendorId).length, 0);
    assert.strictEqual(data.vendor_project_links.filter((l) => l.vendor_id === vendorId).length, 0);
    assert.strictEqual(data.vendor_documents.filter((d) => d.vendor_id === vendorId).length, 0);
    assert.strictEqual(data.vendor_meeting_links.filter((l) => l.vendor_id === vendorId).length, 0);
    assert.strictEqual(data.vendor_rfi_links.filter((l) => l.vendor_id === vendorId).length, 0);
    assert.strictEqual(data.vendor_risk_links.filter((l) => l.vendor_id === vendorId).length, 0);
    assert.strictEqual(data.vendor_performance.filter((p) => p.vendor_id === vendorId).length, 0);
    assert.strictEqual(data.vendor_notes.filter((n) => n.vendor_id === vendorId).length, 0);
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  // ---- Route smoke test across every page, matching the README's stated convention ----
  var routes = ["dashboard", "portfolio", "vendors", "documents", "dailylog", "schedule", "risks", "meetings", "rfis", "changeOrders", "cost", "reports", "settings"];
  for (var i = 0; i < routes.length; i++) {
    await check("route '" + routes[i] + "' renders without throwing after the Vendor Management gate", () => {
      thrownErrors.length = 0;
      win.PCC.router.go(routes[i]);
      win.PCC.router.render();
      assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
    });
  }

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
