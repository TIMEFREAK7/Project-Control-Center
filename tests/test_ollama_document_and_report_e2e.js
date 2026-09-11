// End-to-end jsdom test for the two Ollama capabilities added after the Schedule Summary
// pilot: Document Review (AI) (Documents page) and Project Report (AI) (Reports page). Same
// approach as tests/test_ollama_integration_e2e.js -- window.PCC_ELECTRON stubbed, real
// bundled index.html, captured prompts asserted for real seeded data (not just "a prompt was
// sent"). See CLAUDE.md's "Ollama AI integration" section for the architecture these follow.
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

async function freshWindow() {
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
  dom.window.__thrownErrors = thrownErrors;
  return dom.window;
}

function stubOllama(win) {
  var captured = { prompt: null };
  win.PCC_ELECTRON = {
    ollamaGenerate: (host, model, prompt) => {
      captured.prompt = prompt;
      return Promise.resolve("(stubbed AI response)");
    },
    ollamaListModels: () => Promise.resolve(["llama3"]),
  };
  win.PCC.store.update((d) => {
    d.settings.ollama_enabled = true;
    d.settings.ollama_model = "llama3";
  });
  return captured;
}

(async () => {
  // ---- Document Review (AI) ----
  let winA, projIdA;

  await check("seed a project and a PDF document with real extracted text", async () => {
    winA = await freshWindow();
    winA.PCC.store.update((d) => {
      var p = winA.PCC.store.newProject({ name: "Doc Review Test" });
      d.projects.push(p);
      projIdA = p.id;
      d.documents.push(
        winA.PCC.store.newDocument({
          project_id: p.id,
          filename: "Inspection-Report-Rev2.pdf",
          category: "inspection",
          revision_number: 2,
          extraction: { type: "pdf", text: "Site inspection completed 2026-09-01. No deficiencies noted. Signed by J. Smith.", char_count: 82, page_count: 1, truncated: false },
        })
      );
    });
  });

  await check("Documents page shows no 'Review Document (AI)' button when Ollama isn't available", async () => {
    winA.PCC.router.go("documents");
    winA.PCC.router.render();
    await flush();
    const buttons = Array.from(winA.document.querySelectorAll("button")).map((b) => b.textContent);
    assert.ok(buttons.indexOf("Review Document (AI)") === -1, "the AI review button must not appear outside Electron");
  });

  await check("with Ollama available, 'Review Document (AI)' sends a prompt with the real extracted text and shows the response", async () => {
    var captured = stubOllama(winA);
    winA.PCC.router.go("dashboard");
    winA.PCC.router.render();
    await flush();
    winA.PCC.router.go("documents");
    winA.PCC.router.render();
    await flush();

    const reviewBtn = Array.from(winA.document.querySelectorAll("button")).find((b) => b.textContent === "Review Document (AI)");
    assert.ok(reviewBtn, "'Review Document (AI)' button not found once Ollama is available");
    reviewBtn.click();
    await flush();

    assert.ok(captured.prompt, "expected a prompt to have been sent to Ollama");
    assert.ok(captured.prompt.indexOf("Inspection-Report-Rev2.pdf") !== -1, "prompt should name the real file");
    assert.ok(captured.prompt.indexOf("revision 2") !== -1, "prompt should include the real revision number");
    assert.ok(captured.prompt.indexOf("Site inspection completed 2026-09-01") !== -1, "prompt should include the real extracted text, not a canned string");
    assert.ok(captured.prompt.indexOf("Document Review") === -1 || captured.prompt.indexOf("Completeness Check") !== -1, "prompt should use the document-review structure");

    const modalBody = winA.document.querySelector(".modal__body");
    assert.ok(modalBody && modalBody.textContent.indexOf("stubbed AI response") !== -1, "expected the (stubbed) response to be displayed");
    assert.strictEqual(winA.__thrownErrors.length, 0, "window.onerror captured: " + winA.__thrownErrors.join(" | "));
  });

  // ---- Excel documents route to the spreadsheet-review prompt, not the text one ----
  let winB;

  await check("an Excel document's 'Review Document (AI)' sends the row-based spreadsheet prompt, not the text prompt", async () => {
    winB = await freshWindow();
    var captured = stubOllama(winB);
    var projId;
    winB.PCC.store.update((d) => {
      var p = winB.PCC.store.newProject({ name: "Excel Review Test" });
      d.projects.push(p);
      projId = p.id;
      d.documents.push(
        winB.PCC.store.newDocument({
          project_id: p.id,
          filename: "Cost-Budget.xlsx",
          category: "cost",
          extraction: { type: "excel", sheet_name: "Sheet1", headers: ["Item", "Amount"], rows: [["Concrete", "50000"], ["Steel", "75000"]], truncated: false },
        })
      );
    });
    winB.PCC.router.go("documents");
    winB.PCC.router.render();
    await flush();
    const reviewBtn = Array.from(winB.document.querySelectorAll("button")).find((b) => b.textContent === "Review Document (AI)");
    assert.ok(reviewBtn, "'Review Document (AI)' button not found for the Excel document");
    reviewBtn.click();
    await flush();

    assert.ok(captured.prompt.indexOf("Concrete | 50000") !== -1, "prompt should include the real extracted rows");
    assert.ok(captured.prompt.indexOf("Totals Check") !== -1, "prompt should use the spreadsheet-review structure, not the document-review one");
    assert.ok(captured.prompt.indexOf("Completeness Check") === -1, "spreadsheet review should not use the document-review section headings");
  });

  // ---- Project Report (AI) ----
  let winC, projIdC;

  await check("seed a project spanning schedule, cost, risk, RFI, daily log, and meeting data", async () => {
    winC = await freshWindow();
    winC.PCC.store.update((d) => {
      var p = winC.PCC.store.newProject({ name: "Full Report Test", status: "on_track", progress: 42 });
      d.projects.push(p);
      projIdC = p.id;

      var s = { id: "sched-report-1", project_id: p.id, name: "Main Schedule", revision_number: 1, updated_at: new Date().toISOString(), schedule_type: "current" };
      d.schedules.push(s);
      d.activities.push({ id: "act-report-1", schedule_id: s.id, project_id: p.id, activity_type: "task", name: "Foundation Pour", status: "in_progress", total_float: 0, early_finish: "2026-10-01" });

      d.cost_budget_items.push(winC.PCC.store.newCostBudgetItem({ project_id: p.id, category: "concrete", name: "Foundation", planned_amount: 100000 }));
      d.cost_actuals.push(winC.PCC.store.newCostActual({ project_id: p.id, category: "concrete", description: "Pour 1", amount: 45000 }));

      d.risks.push(winC.PCC.store.newRisk({ project_id: p.id, type: "risk", title: "Rebar delivery delay risk", status: "open", probability: "medium", impact: "high" }));

      d.rfis.push(winC.PCC.store.newRfi({ project_id: p.id, number: "RFI-001", subject: "Confirm rebar spacing at grid line 4", status: "open", waiting_on_party: "Structural Engineer" }));

      d.daily_logs.push(winC.PCC.store.newDailyLog({ project_id: p.id, log_date: "2026-09-10", activities: "Poured foundation section A, no issues." }));
      d.meetings.push(winC.PCC.store.newMeeting({ project_id: p.id, title: "Weekly Coordination Meeting", meeting_date: "2026-09-09" }));
    });
  });

  await check("Reports page shows no 'Generate Project Report (AI)' button when Ollama isn't available", async () => {
    winC.PCC.router.go("reports");
    winC.PCC.router.render();
    await flush();
    const buttons = Array.from(winC.document.querySelectorAll("button")).map((b) => b.textContent);
    assert.ok(buttons.indexOf("Generate Project Report (AI)") === -1, "the AI report button must not appear outside Electron");
  });

  await check("with Ollama available, 'Generate Project Report (AI)' sends a prompt aggregating real facts from every module", async () => {
    var captured = stubOllama(winC);
    winC.PCC.router.go("dashboard");
    winC.PCC.router.render();
    await flush();
    winC.PCC.router.go("reports");
    winC.PCC.router.render();
    await flush();

    // The project select defaults to the context project if set; make sure our seeded
    // project is the one selected before generating.
    var projectSelect = winC.document.querySelector('select[aria-label="Select project"]');
    if (projectSelect && projectSelect.value !== projIdC) {
      var nativeSetter = Object.getOwnPropertyDescriptor(winC.HTMLSelectElement.prototype, "value").set;
      nativeSetter.call(projectSelect, projIdC);
      projectSelect.dispatchEvent(new winC.Event("change", { bubbles: true }));
      await flush();
    }

    const genBtn = Array.from(winC.document.querySelectorAll("button")).find((b) => b.textContent === "Generate Project Report (AI)");
    assert.ok(genBtn, "'Generate Project Report (AI)' button not found once Ollama is available");
    genBtn.click();
    await flush();

    assert.ok(captured.prompt, "expected a prompt to have been sent to Ollama");
    assert.ok(captured.prompt.indexOf("Full Report Test") !== -1, "prompt should name the real project");
    assert.ok(captured.prompt.indexOf("Progress: 42%") !== -1, "prompt should include real portfolio facts");
    assert.ok(captured.prompt.indexOf("Foundation Pour") !== -1, "prompt should include real schedule facts (reused from the Schedule Summary facts block)");
    assert.ok(captured.prompt.indexOf("Budgeted: 100,000") !== -1 || captured.prompt.indexOf("Budgeted: 100000") !== -1, "prompt should include the real cost summary");
    assert.ok(captured.prompt.indexOf("Rebar delivery delay risk") !== -1, "prompt should include the real open risk");
    assert.ok(captured.prompt.indexOf("RFI-001") !== -1, "prompt should include the real open RFI");
    assert.ok(captured.prompt.indexOf("Poured foundation section A") !== -1 || captured.prompt.indexOf("Weekly Coordination Meeting") !== -1, "prompt should include real recent activity");

    const modalBody = winC.document.querySelector(".modal__body");
    assert.ok(modalBody && modalBody.textContent.indexOf("stubbed AI response") !== -1, "expected the (stubbed) response to be displayed");
    assert.strictEqual(winC.__thrownErrors.length, 0, "window.onerror captured: " + winC.__thrownErrors.join(" | "));
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
