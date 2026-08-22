/** Getting a file OUT of the app onto the device — the one place a real "download" is the
 * whole point (exporting your data, saving a document's original file), unlike viewing a
 * file in-app (see fileViewer.js) which deliberately avoids ever leaving the app.
 *
 * Two implementations behind one call site, picked at runtime:
 * - Plain web / Electron: the existing Blob + <a download> pattern (unchanged).
 * - Capacitor (Android): a bare WebView has no browser download manager for <a download>
 *   to hand off to, so this writes the file via @capacitor/filesystem and hands it to the
 *   OS's native share sheet via @capacitor/share — the standard Capacitor way to get a file
 *   out of an app (save to Downloads, share via email/drive/etc., all from one sheet).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  function isNativePlatform() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result || "";
        var commaIdx = result.indexOf(",");
        resolve(commaIdx === -1 ? result : result.slice(commaIdx + 1));
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Could not read file data."));
      };
      reader.readAsDataURL(blob);
    });
  }

  function saveViaBrowserDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 30000);
    return Promise.resolve();
  }

  function saveViaCapacitorShare(blob, filename) {
    var Plugins = window.Capacitor.Plugins || {};
    var Filesystem = Plugins.Filesystem;
    var Share = Plugins.Share;
    if (!Filesystem || !Share) {
      return Promise.reject(
        new Error("Filesystem/Share plugins are not available — was `npx cap sync android` run after adding them?")
      );
    }
    return blobToBase64(blob).then(function (base64Data) {
      return Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: "CACHE",
      }).then(function (result) {
        return Share.share({ title: filename, url: result.uri });
      });
    });
  }

  /** Save/share `blob` (named `filename`) onto the device. Returns a Promise. */
  function save(blob, filename) {
    if (isNativePlatform()) {
      return saveViaCapacitorShare(blob, filename);
    }
    return saveViaBrowserDownload(blob, filename);
  }

  window.PCC.nativeFile = {
    save: save,
    isNativePlatform: isNativePlatform,
  };
})();
