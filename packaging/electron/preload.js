// Only add contextBridge APIs here for things the web app genuinely can't do in a
// browser (native file dialogs, OS notifications, etc.) — the app itself stays plain web
// code with no Electron-specific branching, except where it explicitly detects
// window.PCC_ELECTRON (see src/js/dataMirror.js).
//
// One-way hourly data mirror (Phase 4): a contextIsolated renderer (webPreferences:
// contextIsolation: true, nodeIntegration: false, in main.js) has no direct filesystem
// access, so writing the mirror snapshot silently (no save dialog) needs this bridge.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("PCC_ELECTRON", {
  writeMirrorFile: (folderPath, filename, content) =>
    ipcRenderer.invoke("pcc-write-mirror-file", folderPath, filename, content),
  onQuitExportRequested: (callback) => {
    ipcRenderer.on("pcc-mirror-export-on-quit", callback);
  },
  notifyQuitExportDone: () => {
    ipcRenderer.send("pcc-mirror-export-on-quit-done");
  },
  // Ollama AI integration — see ollamaClient.js's own header comment for why this goes
  // through IPC to the main process instead of a direct renderer fetch().
  ollamaGenerate: (host, model, prompt) => ipcRenderer.invoke("pcc-ollama-generate", host, model, prompt),
  ollamaListModels: (host) => ipcRenderer.invoke("pcc-ollama-list-models", host),
});
