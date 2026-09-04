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
import type { PCCStoreData, PCCSettings } from "../types/pcc";

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function updateSettings(mutator: (settings: PCCSettings) => void): void {
  window.PCC.store.update(function (d) {
    mutator(d.settings);
  });
}

export function refreshTitleBlock(): void {
  window.PCC.layout.refreshTitleBlock();
}

export function refreshBackupNudge(): void {
  if (window.PCC.layout.refreshBackupNudge) window.PCC.layout.refreshBackupNudge();
}

export function getLogoBlob(): Promise<string | null> {
  return window.PCC.blobStore.getBlob("company_logo");
}

export function saveLogo(file: File): Promise<void> {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      window.PCC.blobStore
        .putBlob("company_logo", reader.result as string)
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

export function removeLogo(): Promise<void> {
  return window.PCC.blobStore.deleteBlob("company_logo").finally(function () {
    updateSettings(function (s) {
      s.company_logo_filename = "";
      s.company_logo_mime_type = "";
    });
  });
}

export function exportDataFile(): Promise<void> {
  return window.PCC.store.exportToFile();
}

export function exportDocumentArchive(): void {
  var d = window.PCC.store.get();
  window.PCC.archive.exportAll(d.projects, d.documents);
}

export function createFullBackup(): Promise<{ blob: Blob; fileCount: number; skipped: number }> {
  return window.PCC.sqliteMigrationEngine.initSqlJsBrowser().then(function (SQL) {
    return window.PCC.sqliteBackupService.createFullBackup(SQL, window.PCC.store.get());
  });
}

export function saveFile(blob: Blob, filename: string): Promise<void> {
  return window.PCC.nativeFile.save(blob, filename);
}

export function restoreFullBackup(file: File): Promise<{ restoredFileCount: number }> {
  return window.PCC.sqliteMigrationEngine.initSqlJsBrowser().then(function (SQL) {
    return window.PCC.sqliteBackupService.restoreFullBackup(SQL, file);
  });
}

export function resetAllData(): void {
  window.PCC.store.resetAll();
}

export function rerenderApp(): void {
  window.PCC.router.render();
}

export function notify(message: string, level: string): void {
  window.PCC.notify(message, level);
}

export function listRecoveryBackups(): string[] {
  return window.PCC.store.listRecoveryBackups ? window.PCC.store.listRecoveryBackups() : [];
}

export function downloadRecoveryBackup(key: string): void {
  window.PCC.store.downloadRecoveryBackup(key);
}

export function deleteRecoveryBackup(key: string): void {
  window.PCC.store.deleteRecoveryBackup(key);
}
