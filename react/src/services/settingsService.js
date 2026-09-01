/* Service boundary for the Settings page (master prompt §9: "React must not own core
 * calculations... React should request calculations from domain/service modules").
 *
 * Thin wrapper only — every operation here is a direct pass-through to the existing
 * window.PCC.store/blobStore/archive/sqliteMigrationEngine/sqliteBackupService/nativeFile
 * globals, unchanged from the vanilla page. Nothing here reimplements any calculation or
 * storage logic. Any function that returns the store snapshot for a React
 * useState-then-refresh pattern returns a FRESH top-level object reference
 * (Object.assign({}, store.get())) — window.PCC.store.get() returns the SAME mutable
 * object every call, so handing that straight to a React setState after a mutation would
 * be an Object.is no-op and silently skip the re-render (real bug, hit and documented
 * during the Document Types migration — see CLAUDE.md).
 */

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function updateSettings(mutator) {
  window.PCC.store.update(function (d) {
    mutator(d.settings);
  });
}

export function refreshTitleBlock() {
  window.PCC.layout.refreshTitleBlock();
}

export function refreshBackupNudge() {
  if (window.PCC.layout.refreshBackupNudge) window.PCC.layout.refreshBackupNudge();
}

export function getLogoBlob() {
  return window.PCC.blobStore.getBlob("company_logo");
}

export function saveLogo(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      window.PCC.blobStore
        .putBlob("company_logo", reader.result)
        .then(function () {
          updateSettings(function (s) {
            s.company_logo_filename = file.name;
            s.company_logo_mime_type = file.type || "";
          });
          resolve();
        })
        .catch(reject);
    };
    reader.onerror = function () {
      reject(new Error("Could not read that file."));
    };
    reader.readAsDataURL(file);
  });
}

export function removeLogo() {
  return window.PCC.blobStore.deleteBlob("company_logo").finally(function () {
    updateSettings(function (s) {
      s.company_logo_filename = "";
      s.company_logo_mime_type = "";
    });
  });
}

export function exportDataFile() {
  return window.PCC.store.exportToFile();
}

export function exportDocumentArchive() {
  var d = window.PCC.store.get();
  window.PCC.archive.exportAll(d.projects, d.documents);
}

export function createFullBackup() {
  return window.PCC.sqliteMigrationEngine.initSqlJsBrowser().then(function (SQL) {
    return window.PCC.sqliteBackupService.createFullBackup(SQL, window.PCC.store.get());
  });
}

export function saveFile(blob, filename) {
  return window.PCC.nativeFile.save(blob, filename);
}

export function restoreFullBackup(file) {
  return window.PCC.sqliteMigrationEngine.initSqlJsBrowser().then(function (SQL) {
    return window.PCC.sqliteBackupService.restoreFullBackup(SQL, file);
  });
}

export function resetAllData() {
  window.PCC.store.resetAll();
}

export function rerenderApp() {
  window.PCC.router.render();
}

export function notify(message, level) {
  window.PCC.notify(message, level);
}

export function listRecoveryBackups() {
  return window.PCC.store.listRecoveryBackups ? window.PCC.store.listRecoveryBackups() : [];
}

export function downloadRecoveryBackup(key) {
  window.PCC.store.downloadRecoveryBackup(key);
}

export function deleteRecoveryBackup(key) {
  window.PCC.store.deleteRecoveryBackup(key);
}
