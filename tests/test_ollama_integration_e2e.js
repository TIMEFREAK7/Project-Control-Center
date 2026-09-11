// End-to-end jsdom test for the Ollama AI integration pilot (Electron/Windows only — see
// DESIGN_SYSTEM.md's "AI Assistant (Ollama)" or HANDOFF.md's write-up for the full
// architecture). Covers what jsdom CAN verify against the real bundled index.html:
//   - window.PCC.ollama.isAvailable()/ask()/listModels() correctly report "unavailable"
//     when window.PCC_ELECTRON isn't present (every non-Electron target: Android, a plain
//     browser-opened index.html) -- same posture as dataMirror.js's Electron-only gating.
//   - The Settings page's "AI Assistant (Ollama)" panel only renders when
//     window.PCC_ELECTRON is present, and its fields/Test Connection button work end to
//     end against a stubbed window.PCC_ELECTRON.
//   - The Schedule page's "Summarize Schedule (AI)" menu item only appears when Ollama is
//     available, and clicking it builds a real prompt from seeded schedule data (not a
//     canned string) and displays the (stubbed) model's response, or a clear error.
// The actual HTTP call to a real Ollama server (packaging/electron/ollamaClient.js) is
// tested separately in tests/test_ollama_client.js, with plain Node + a mocked fetch --
// there is no real Electron main process or real Ollama server available in this suite,
// by design (same reasoning test_data_mirror_e2e.js gives for stubbing window.PCC_ELECTRON
// rather than spinning up real Electron).
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

function findFieldByLabel(win, labelText) {
  const labels = Array.from(win.document.querySelectorAll(".field label"));
  const match = labels.find((l) => l.textContent.trim() === labelText);
  return match ? match.parentElement.querySelector("input, select, textarea") : null;
}

function setReactInputValue(win, el, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
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

(async () => {
  await check("app boots on the bundled index.html without throwing, schema_version is 66, and Ollama settings default to off", async () => {
    const win = await freshWindow();
    assert.strictEqual(win.__thrownErrors.length, 0, "window.onerror captured: " + win.__thrownErrors.join(" | "));
    const data = win.PCC.store.get();
    assert.strictEqual(data.schema_version, 66);
    assert.strictEqual(data.settings.ollama_enabled, false);
    assert.strictEqual(data.settings.ollama_host, "http://localhost:11434");
    assert.strictEqual(data.settings.ollama_model, "");
  });

  await check("window.PCC.ollama reports unavailable (and ask()/listModels() reject clearly) when window.PCC_ELECTRON isn't present", async () => {
    const win = await freshWindow();
    assert.strictEqual(win.PCC.ollama.isAvailable(), false);
    await assert.rejects(() => win.PCC.ollama.ask("hi"), /only available in the Windows desktop app/i);
    await assert.rejects(() => win.PCC.ollama.listModels(), /only available in the Windows desktop app/i);
  });

  await check("Settings page shows no 'AI Assistant (Ollama)' panel when window.PCC_ELECTRON isn't present", async () => {
    const win = await freshWindow();
    win.PCC.router.go("settings");
    win.PCC.router.render();
    await flush();
    const headings = Array.from(win.document.querySelectorAll("h3")).map((h) => h.textContent);
    assert.ok(headings.indexOf("AI Assistant (Ollama)") === -1, "the Ollama panel must not render outside Electron");
  });

  await check("Settings page shows the 'AI Assistant (Ollama)' panel when window.PCC_ELECTRON IS present, and Test Connection surfaces the real model list", async () => {
    const win = await freshWindow();
    let capturedHost;
    win.PCC_ELECTRON = {
      ollamaGenerate: () => Promise.resolve(""),
      ollamaListModels: (host) => {
        capturedHost = host;
        return Promise.resolve(["llama3:latest", "mistral:latest"]);
      },
    };
    win.PCC.router.go("settings");
    win.PCC.router.render();
    await flush();
    const headings = Array.from(win.document.querySelectorAll("h3")).map((h) => h.textContent);
    assert.ok(headings.indexOf("AI Assistant (Ollama)") !== -1, "the Ollama panel should render under Electron");

    const hostInput = findFieldByLabel(win, "Ollama server address");
    assert.ok(hostInput, "host field not found");
    assert.strictEqual(hostInput.value, "http://localhost:11434");

    const testBtn = Array.from(win.document.querySelectorAll("button")).find((b) => b.textContent === "Test Connection");
    assert.ok(testBtn, "Test Connection button not found");
    testBtn.click();
    await flush();
    assert.strictEqual(capturedHost, "http://localhost:11434");
    const toast = win.document.querySelector(".toast");
    assert.ok(toast && toast.textContent.indexOf("2 model(s)") !== -1, "expected a success toast reporting 2 models, got: " + (toast && toast.textContent));
  });

  await check("enabling Ollama and setting host/model in Settings persists to the store", async () => {
    const win = await freshWindow();
    win.PCC_ELECTRON = { ollamaGenerate: () => Promise.resolve(""), ollamaListModels: () => Promise.resolve([]) };
    win.PCC.router.go("settings");
    win.PCC.router.render();
    await flush();

    const enableLabel = Array.from(win.document.querySelectorAll("label")).find((l) => l.textContent.trim() === "Enable AI features");
    assert.ok(enableLabel, "Enable AI features checkbox label not found");
    enableLabel.querySelector("input[type=checkbox]").click();
    await flush();
    assert.strictEqual(win.PCC.store.get().settings.ollama_enabled, true);

    const modelInput = findFieldByLabel(win, "Model name");
    setReactInputValue(win, modelInput, "llama3");
    await flush();
    assert.strictEqual(win.PCC.store.get().settings.ollama_model, "llama3");
  });

  // ---- Schedule page's "Summarize Schedule (AI)" pilot capability ----
  let win2, projId, schedId;

  await check("seed a project, a calculated schedule, one critical activity, and an open delay record", async () => {
    win2 = await freshWindow();
    win2.PCC.store.update((d) => {
      var p = win2.PCC.store.newProject({ name: "AI Pilot Test" });
      d.projects.push(p);
      projId = p.id;
      var s = { id: "sched-ai-1", project_id: p.id, name: "Main Schedule", revision_number: 1, updated_at: new Date().toISOString(), near_critical_threshold_days: 5 };
      d.schedules.push(s);
      schedId = s.id;
      d.activities.push(
        { id: "act-ai-1", schedule_id: schedId, project_id: p.id, activity_type: "task", name: "Pour Foundation", status: "in_progress", total_float: 0, early_finish: "2026-10-01", percent_complete: 50, discipline: "Concrete" },
        { id: "act-ai-2", schedule_id: schedId, project_id: p.id, activity_type: "task", name: "Erect Steel Frame", status: "not_started", total_float: 12, early_finish: "2026-11-15", percent_complete: 0, discipline: "Steel" }
      );
      var delay = win2.PCC.store.newDelayRecord({
        project_id: p.id,
        activity_id: "act-ai-1",
        status: "open",
        delay_days: 4,
        delay_category: "weather",
        responsible_party: "Owner",
        immediate_cause: "Heavy rain stopped concrete pours for 4 days",
      });
      d.delay_records.push(delay);
      d.recovery_actions.push(
        win2.PCC.store.newRecoveryAction({ project_id: p.id, delay_id: delay.id, status: "in_progress", description: "Weekend crew added to recover lost days" })
      );
    });
  });

  await check("Schedule's ⋯ menu shows no 'Summarize Schedule (AI)' item when Ollama isn't available", async () => {
    win2.PCC.router.go("schedule");
    win2.PCC.router.render();
    await flush();
    win2.PCC.projectContext.set(projId);
    win2.PCC.router.render();
    await flush();
    const menuBtn = win2.document.querySelector('.icon-btn[aria-label="Schedule actions"]');
    assert.ok(menuBtn, "schedule actions menu button should exist");
    menuBtn.click();
    await flush();
    const items = Array.from(win2.document.querySelectorAll(".card-menu__item")).map((b) => b.textContent);
    assert.ok(items.indexOf("Summarize Schedule (AI)") === -1, "the AI menu item must not appear outside Electron");
    menuBtn.click(); // close the menu again
  });

  await check("with Ollama available, clicking 'Summarize Schedule (AI)' builds a real prompt from the seeded data and shows the (stubbed) response", async () => {
    let capturedPrompt = null;
    win2.PCC_ELECTRON = {
      ollamaGenerate: (host, model, prompt) => {
        capturedPrompt = prompt;
        return Promise.resolve("The schedule shows one critical activity, Pour Foundation, with an open weather delay.");
      },
      ollamaListModels: () => Promise.resolve(["llama3"]),
    };
    win2.PCC.store.update((d) => {
      d.settings.ollama_enabled = true;
      d.settings.ollama_model = "llama3";
    });
    win2.PCC.router.go("dashboard");
    win2.PCC.router.render();
    await flush();
    win2.PCC.router.go("schedule");
    win2.PCC.router.render();
    await flush();

    const menuBtn = win2.document.querySelector('.icon-btn[aria-label="Schedule actions"]');
    menuBtn.click();
    await flush();
    const aiItem = Array.from(win2.document.querySelectorAll(".card-menu__item")).find((b) => b.textContent === "Summarize Schedule (AI)");
    assert.ok(aiItem, "'Summarize Schedule (AI)' menu item not found once Ollama is available");
    aiItem.click();
    await flush();

    assert.ok(capturedPrompt, "expected a prompt to have been sent to Ollama");
    assert.ok(capturedPrompt.indexOf("Pour Foundation") !== -1, "prompt should mention the real critical activity by name, not a canned string");
    assert.ok(capturedPrompt.indexOf("Critical activities (total float <= 0): 1") !== -1, "prompt should report the real critical-activity count");
    assert.ok(capturedPrompt.indexOf("Open/in-progress delay records: 1") !== -1, "prompt should report the real open-delay-record count");
    assert.ok(capturedPrompt.indexOf("=== FORECAST FINISH ===") !== -1, "prompt should include a forecast-finish section (real computeProjectFinishImpact output)");
    assert.ok(capturedPrompt.indexOf("Concrete: 1") !== -1, "prompt should break critical activities down by discipline");
    assert.ok(capturedPrompt.indexOf("weather (1)") !== -1, "prompt should break open delays down by category");
    assert.ok(capturedPrompt.indexOf("Owner (1)") !== -1, "prompt should break open delays down by responsible party");
    assert.ok(capturedPrompt.indexOf("Heavy rain stopped concrete pours") !== -1, "prompt should include the real delay's immediate cause text, not just a count");
    assert.ok(capturedPrompt.indexOf("=== RECOVERY ACTIONS ===") !== -1, "prompt should include a recovery-actions section");
    assert.ok(capturedPrompt.indexOf("in_progress (1)") !== -1, "prompt should report the real recovery action's status");

    const modalBody = win2.document.querySelector(".modal__body");
    assert.ok(modalBody, "summary modal did not render");
    assert.ok(modalBody.textContent.indexOf("open weather delay") !== -1, "expected the (stubbed) Ollama response text to be displayed");
  });

  await check("a failed Ollama call shows a clear error in the modal instead of a blank/broken state", async () => {
    win2.PCC_ELECTRON.ollamaGenerate = () => Promise.reject(new Error("Ollama returned 404: model \"llama3\" not found"));
    win2.document.querySelector(".icon-btn[aria-label='Close']").click();
    await flush();
    const menuBtn = win2.document.querySelector('.icon-btn[aria-label="Schedule actions"]');
    menuBtn.click();
    await flush();
    const aiItem = Array.from(win2.document.querySelectorAll(".card-menu__item")).find((b) => b.textContent === "Summarize Schedule (AI)");
    aiItem.click();
    await flush();
    const modalBody = win2.document.querySelector(".modal__body");
    assert.ok(modalBody.textContent.indexOf("not found") !== -1, "expected the real error message to be shown, got: " + modalBody.textContent);
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
