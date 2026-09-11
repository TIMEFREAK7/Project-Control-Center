// Ollama AI integration (Electron/Windows only pilot): tests
// packaging/electron/ollamaClient.js's pure HTTP logic directly, with global.fetch mocked
// — same "testable with plain Node" reasoning as mirrorFileWriter.js/relocateStorage.js.
// This is the ONLY place in the app that actually calls Ollama over HTTP (runs in the
// Electron main process, not the renderer — see that file's own header comment for why);
// everything above it (src/js/ollamaService.js, react/src/services/ollamaService.ts) is
// covered separately in tests/test_fuzzy_search.js-style jsdom e2e files, since those need
// the real bundled index.html, not a Node-only test.
"use strict";
const path = require("path");
const assert = require("assert");

const { ollamaGenerate, ollamaListModels } = require(path.join(__dirname, "..", "packaging", "electron", "ollamaClient.js"));

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

function mockFetch(handler) {
  global.fetch = handler;
}

(async () => {
  await check("ollamaGenerate rejects a missing host/model/prompt before ever calling fetch", async () => {
    mockFetch(() => {
      throw new Error("fetch should not have been called");
    });
    await assert.rejects(() => ollamaGenerate("", "llama3", "hi"), /host/i);
    await assert.rejects(() => ollamaGenerate("http://localhost:11434", "", "hi"), /model/i);
    await assert.rejects(() => ollamaGenerate("http://localhost:11434", "llama3", ""), /[Ee]mpty prompt/);
  });

  await check("ollamaGenerate posts to <host>/api/generate with the model/prompt and returns the response text", async () => {
    let capturedUrl, capturedBody;
    mockFetch(async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ response: "This is the summary." }) };
    });
    const result = await ollamaGenerate("http://localhost:11434", "llama3", "Summarize this schedule.");
    assert.strictEqual(capturedUrl, "http://localhost:11434/api/generate");
    assert.deepStrictEqual(capturedBody, { model: "llama3", prompt: "Summarize this schedule.", stream: false });
    assert.strictEqual(result, "This is the summary.");
  });

  await check("ollamaGenerate strips a trailing slash from the configured host", async () => {
    let capturedUrl;
    mockFetch(async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ response: "" }) };
    });
    await ollamaGenerate("http://localhost:11434/", "llama3", "hi");
    assert.strictEqual(capturedUrl, "http://localhost:11434/api/generate");
  });

  await check("ollamaGenerate surfaces a clear 'is it running?' error when fetch itself throws (server not up)", async () => {
    mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    await assert.rejects(() => ollamaGenerate("http://localhost:11434", "llama3", "hi"), /is it running/i);
  });

  await check("ollamaGenerate surfaces the HTTP status when Ollama returns a non-ok response (e.g. model not pulled)", async () => {
    mockFetch(async () => ({ ok: false, status: 404, text: async () => "model \"llama3\" not found" }));
    await assert.rejects(() => ollamaGenerate("http://localhost:11434", "llama3", "hi"), /404/);
  });

  await check("ollamaListModels returns just the model names from <host>/api/tags", async () => {
    let capturedUrl;
    mockFetch(async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ models: [{ name: "llama3:latest" }, { name: "mistral:latest" }] }) };
    });
    const models = await ollamaListModels("http://localhost:11434");
    assert.strictEqual(capturedUrl, "http://localhost:11434/api/tags");
    assert.deepStrictEqual(models, ["llama3:latest", "mistral:latest"]);
  });

  await check("ollamaListModels returns an empty array (not a throw) when Ollama has no models pulled yet", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ models: [] }) }));
    const models = await ollamaListModels("http://localhost:11434");
    assert.deepStrictEqual(models, []);
  });

  await check("ollamaListModels surfaces a clear 'is it running?' error when the server is unreachable", async () => {
    mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    await assert.rejects(() => ollamaListModels("http://localhost:11434"), /is it running/i);
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
})();
