// Pure helper for the "pcc-ollama-*" IPC handlers (main.js) — kept separate so it's
// testable with plain Node (mock global.fetch), same reasoning as mirrorFileWriter.js/
// relocateStorage.js. Electron 43's bundled Node (20+) has global fetch built in, so this
// needs no npm dependency — same "no runtime package" discipline as everything else in
// this repo.
//
// This is the ONLY place in the whole app that talks to Ollama over HTTP. It runs in the
// Electron MAIN process, not the contextIsolated renderer, specifically to sidestep
// browser CORS entirely: a file://-opened renderer sends "Origin: null", and rather than
// gamble on a given Ollama version's CORS defaults (or ask the user to set OLLAMA_ORIGINS
// just to make a feature work), the renderer asks the main process to make the request on
// its behalf via IPC (see preload.js/main.js) — the same pattern already used for the
// mirror file write. Real consequence, not an oversight: Ollama features are therefore
// Electron/Windows-only, never available in the Android app or a browser-opened
// index.html — src/js/ollamaService.js's isAvailable() gate is what enforces that.

function normalizeHost(host) {
  return String(host || "").replace(/\/+$/, "");
}

async function ollamaGenerate(host, model, prompt) {
  if (typeof host !== "string" || !host) throw new Error("Ollama host is not configured.");
  if (typeof model !== "string" || !model) throw new Error("No Ollama model is configured.");
  if (typeof prompt !== "string" || !prompt) throw new Error("Empty prompt.");

  var url = normalizeHost(host) + "/api/generate";
  var res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // num_predict: every capability this app sends to Ollama asks for a long-form
      // structured document (a multi-section schedule analysis, eventually a report
      // draft), never a short chat reply -- a generous explicit cap here avoids relying
      // on whatever a given Ollama version's own default happens to be, which produced a
      // noticeably truncated "bare minimum" response during the schedule-summary pilot.
      body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { num_predict: 1200 } }),
    });
  } catch (e) {
    throw new Error("Could not reach Ollama at " + host + " — is it running? (" + e.message + ")");
  }
  if (!res.ok) {
    var errText = await res.text().catch(function () {
      return "";
    });
    throw new Error("Ollama returned " + res.status + (errText ? ": " + errText : ""));
  }
  var data = await res.json();
  return typeof data.response === "string" ? data.response : "";
}

async function ollamaListModels(host) {
  if (typeof host !== "string" || !host) throw new Error("Ollama host is not configured.");

  var url = normalizeHost(host) + "/api/tags";
  var res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("Could not reach Ollama at " + host + " — is it running? (" + e.message + ")");
  }
  if (!res.ok) throw new Error("Ollama returned " + res.status);
  var data = await res.json();
  var models = Array.isArray(data.models) ? data.models : [];
  return models.map(function (m) {
    return m.name;
  });
}

module.exports = { ollamaGenerate: ollamaGenerate, ollamaListModels: ollamaListModels };
