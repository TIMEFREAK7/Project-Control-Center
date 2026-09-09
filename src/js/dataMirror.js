/** One-way, hourly data mirror: Windows -> Android, read-only. No write-back path exists
 * anywhere in this file, by design — a prior "mark meeting complete / attach recording
 * from phone" write-back idea was explicitly scrapped in favor of this simpler, safer
 * scope.
 *
 * Windows (Electron): while the app is open, writes a full export snapshot (the same
 * data store.js's own Export button produces — see buildExportJson()) to a folder the
 * user configures once in Settings, roughly every hour, plus once on app quit. Writing
 * is silent — no dialog, no download prompt — via a small IPC bridge
 * (packaging/electron/preload.js + main.js) added specifically for this, since a
 * contextIsolated renderer has no direct filesystem access otherwise.
 *
 * Android (Capacitor): reads from its own fixed, app-accessible folder
 * (Directory.Documents/PCC-Mirror/pcc-mirror.json) on every app resume and
 * pull-to-refresh (src/js/pullToRefresh.js) — never an arbitrary user-chosen path, since
 * Android's scoped storage won't let this app read one without a one-time
 * Storage-Access-Framework grant this feature deliberately avoids needing. Getting the
 * mirror file INTO that folder is the user's own external setup (e.g. pointing Syncthing
 * at it) — entirely outside this app.
 *
 * Both platforms are gated behind the same settings.sync_mirror_enabled flag (off by
 * default) so nothing here activates without the user explicitly opting in.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var MIRROR_FILENAME = "pcc-mirror.json";
  var ANDROID_MIRROR_DIRECTORY = "DOCUMENTS";
  var ANDROID_MIRROR_PATH = "PCC-Mirror/" + MIRROR_FILENAME;
  var MIRROR_INTERVAL_MS = 60 * 60 * 1000;

  var lastAppliedMirrorMtime = null; // in-memory only — reset each app session, on purpose

  function isElectronMirrorAvailable() {
    return !!(window.PCC_ELECTRON && window.PCC_ELECTRON.writeMirrorFile);
  }

  function isCapacitorNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
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

  // ---- Android (Capacitor) read side ----

  /** Checks the fixed mirror path for a file newer than whatever's already been loaded
   * this session; if found, reads and imports it (read-only — never writes back).
   * Resolves quietly (no error) when there's nothing to do: not enabled, not on Android,
   * the mirror file doesn't exist yet (Syncthing not set up, or hasn't synced yet), or
   * it's not newer than what's already loaded. */
  function readAndroidMirrorFileIfNewer() {
    var settings = mirrorSettings();
    if (!settings.enabled || !isCapacitorNative()) return Promise.resolve();
    var Filesystem = (window.Capacitor.Plugins || {}).Filesystem;
    if (!Filesystem) return Promise.resolve();

    return Filesystem.stat({ path: ANDROID_MIRROR_PATH, directory: ANDROID_MIRROR_DIRECTORY })
      .then(function (stat) {
        var mtime = stat.mtime;
        if (lastAppliedMirrorMtime !== null && mtime <= lastAppliedMirrorMtime) {
          return; // already loaded this exact version this session
        }
        return Filesystem.readFile({
          path: ANDROID_MIRROR_PATH,
          directory: ANDROID_MIRROR_DIRECTORY,
          encoding: "utf8",
        }).then(function (result) {
          return new Promise(function (resolve, reject) {
            window.PCC.store.importFromJsonString(result.data, function (err) {
              if (err) {
                reject(err);
                return;
              }
              lastAppliedMirrorMtime = mtime;
              resolve();
            });
          });
        });
      })
      .catch(function (err) {
        // Missing file (nothing synced yet) is the common, expected case — not an error
        // worth surfacing. A genuine read/parse failure is still logged, for diagnosis,
        // but never thrown onward — a failed background refresh must never break the
        // page the user is already looking at.
        if (err && err.message && err.message.indexOf("does not exist") === -1) {
          console.error("[PCC] Mirror read failed:", err);
        }
      });
  }

  function startAndroidMirrorListeners() {
    if (!isCapacitorNative()) return;
    var AppPlugin = (window.Capacitor.Plugins || {}).App;
    if (AppPlugin && AppPlugin.addListener) {
      AppPlugin.addListener("resume", function () {
        readAndroidMirrorFileIfNewer();
      });
    }
    readAndroidMirrorFileIfNewer(); // also check once on initial load
  }

  /** Sets up the Windows timer/quit-hook and Android resume listener, based on whatever
   * platform globals (window.PCC_ELECTRON / window.Capacitor) are present right now.
   * Called once for real at load time below — also exposed on window.PCC.dataMirror so
   * tests can call it again after installing platform mocks, same pattern
   * src/js/nativePrint.js's own install() already uses for the same reason. */
  function install() {
    startWindowsMirrorTimer();
    startAndroidMirrorListeners();
  }

  install();

  window.PCC.dataMirror = {
    install: install,
    runWindowsMirrorExport: runWindowsMirrorExport,
    readAndroidMirrorFileIfNewer: readAndroidMirrorFileIfNewer,
  };
})();
