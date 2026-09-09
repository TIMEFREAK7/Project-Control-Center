/** One-way, hourly data mirror: Windows write side only. No write-back path exists anywhere
 * in this file, by design — a prior "mark meeting complete / attach recording from phone"
 * write-back idea was explicitly scrapped in favor of this simpler, safer scope.
 *
 * Windows (Electron): while the app is open, writes a full export snapshot (the same
 * data store.js's own Export button produces — see buildExportJson()) to a folder the
 * user configures once in Settings, roughly every hour, plus once on app quit. Writing
 * is silent — no dialog, no download prompt — via a small IPC bridge
 * (packaging/electron/preload.js + main.js) added specifically for this, since a
 * contextIsolated renderer has no direct filesystem access otherwise.
 *
 * The Android READ side of this feature (reading the mirror file, pull-to-refresh) has
 * moved to a separate, dedicated "At a Glance" app/codebase — it is deliberately NOT part
 * of the main Android app anymore, so as not to duplicate this capability across two
 * Android apps. This file now only ever runs the Windows write side; it is a no-op on
 * Android/web (isElectronMirrorAvailable() returns false there).
 *
 * Gated behind settings.sync_mirror_enabled (off by default) so nothing here activates
 * without the user explicitly opting in.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var MIRROR_FILENAME = "pcc-mirror.json";
  var MIRROR_INTERVAL_MS = 60 * 60 * 1000;

  function isElectronMirrorAvailable() {
    return !!(window.PCC_ELECTRON && window.PCC_ELECTRON.writeMirrorFile);
  }

  function mirrorSettings() {
    var s = (window.PCC.store.get() || {}).settings || {};
    return {
      enabled: !!s.sync_mirror_enabled,
      folderPath: s.sync_mirror_folder_path || "",
    };
  }

  // ---- Windows (Electron) write side ----

  function runWindowsMirrorExport() {
    var settings = mirrorSettings();
    if (!settings.enabled || !settings.folderPath || !isElectronMirrorAvailable()) {
      return Promise.resolve();
    }
    return window.PCC.store.buildExportJson().then(function (json) {
      return window.PCC_ELECTRON.writeMirrorFile(settings.folderPath, MIRROR_FILENAME, json);
    });
  }

  function startWindowsMirrorTimer() {
    if (!isElectronMirrorAvailable()) return;
    setInterval(function () {
      runWindowsMirrorExport().catch(function (err) {
        console.error("[PCC] Mirror export failed:", err);
      });
    }, MIRROR_INTERVAL_MS);
    if (window.PCC_ELECTRON.onQuitExportRequested) {
      window.PCC_ELECTRON.onQuitExportRequested(function () {
        runWindowsMirrorExport()
          .catch(function (err) {
            console.error("[PCC] Mirror export on quit failed:", err);
          })
          .then(function () {
            window.PCC_ELECTRON.notifyQuitExportDone();
          });
      });
    }
  }

  /** Sets up the Windows timer/quit-hook, based on whatever platform global
   * (window.PCC_ELECTRON) is present right now. Called once for real at load time below —
   * also exposed on window.PCC.dataMirror so tests can call it again after installing
   * platform mocks, same pattern src/js/nativePrint.js's own install() already uses for
   * the same reason. */
  function install() {
    startWindowsMirrorTimer();
  }

  install();

  window.PCC.dataMirror = {
    install: install,
    runWindowsMirrorExport: runWindowsMirrorExport,
  };
})();
