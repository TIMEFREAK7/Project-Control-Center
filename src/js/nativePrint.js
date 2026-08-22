/** Makes window.print() work under Capacitor (Android) by routing it to the native
 * PrintPlugin (packaging/android/.../PrintPlugin.java) instead of doing nothing — a bare
 * WebView has no print() of its own, unlike a real browser or Electron's Chromium (both of
 * which already work and are left completely untouched here). reports.js/executiveCenter.js
 * both just call plain window.print() — since the native plugin prints the WebView's own
 * rendering, the app's existing @media print CSS applies exactly as it does for a desktop
 * Ctrl+P, so neither of those files needed to change for this to work.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  function isNativePlatform() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  var originalPrint = typeof window.print === "function" ? window.print.bind(window) : function () {};

  function nativePrint() {
    var Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    var NativePrint = Plugins.NativePrint;
    if (!NativePrint) {
      if (window.PCC.notify) window.PCC.notify("Print is not available in this build.", "error");
      return;
    }
    NativePrint.print().catch(function (e) {
      if (window.PCC.notify) window.PCC.notify("Could not print: " + e.message, "error");
    });
  }

  /** Re-checks the platform and installs (or restores) the window.print() override. Called
   * once at load time below; also exposed since a real Capacitor WebView injects
   * window.Capacitor before this script ever runs, but a test environment necessarily sets
   * it up afterward — tests re-call this after stubbing window.Capacitor. */
  function install() {
    window.print = isNativePlatform() ? nativePrint : originalPrint;
  }

  install();

  window.PCC.nativePrint = { install: install };
})();
