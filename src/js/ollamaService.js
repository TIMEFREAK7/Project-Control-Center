/** Ollama AI integration — Electron/Windows only, off by default. See
 * packaging/electron/ollamaClient.js's header comment for why the actual HTTP call runs
 * in the main process (via IPC) rather than a renderer fetch(): it sidesteps browser CORS
 * entirely rather than gambling on a given Ollama version's defaults for a file://-opened
 * origin. isAvailable() below is what enforces "Electron only" — it's false on Android and
 * in a plain browser-opened index.html, same "no-op elsewhere" posture as
 * dataMirror.js's isElectronMirrorAvailable().
 *
 * Gated behind settings.ollama_enabled (off by default, schema v66) so nothing here ever
 * calls out to a local server without the user explicitly opting in and configuring a
 * model — same posture as the data mirror's settings.sync_mirror_enabled.
 *
 * This file only ever forwards a prompt string to Ollama and returns its response text —
 * it has no opinion on what a caller asks. Building the actual prompt (e.g. "summarize
 * this schedule") is the calling feature's job (see
 * react/src/services/ollamaService.ts's buildScheduleSummaryPrompt), which is what keeps
 * this file reusable for whatever capability comes next instead of hardcoding one.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  function isAvailable() {
    return !!(window.PCC_ELECTRON && window.PCC_ELECTRON.ollamaGenerate && window.PCC_ELECTRON.ollamaListModels);
  }

  function settings() {
    var s = (window.PCC.store.get() || {}).settings || {};
    return {
      enabled: !!s.ollama_enabled,
      host: s.ollama_host || "http://localhost:11434",
      model: s.ollama_model || "",
    };
  }

  var UNAVAILABLE_MESSAGE = "Ollama integration is only available in the Windows desktop app.";

  function listModels() {
    if (!isAvailable()) return Promise.reject(new Error(UNAVAILABLE_MESSAGE));
    return window.PCC_ELECTRON.ollamaListModels(settings().host);
  }

  function ask(prompt) {
    if (!isAvailable()) return Promise.reject(new Error(UNAVAILABLE_MESSAGE));
    var s = settings();
    if (!s.enabled) return Promise.reject(new Error("Ollama integration is turned off in Settings."));
    if (!s.model) return Promise.reject(new Error("No Ollama model is configured in Settings."));
    return window.PCC_ELECTRON.ollamaGenerate(s.host, s.model, prompt);
  }

  window.PCC.ollama = {
    isAvailable: isAvailable,
    settings: settings,
    listModels: listModels,
    ask: ask,
  };
})();
