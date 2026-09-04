/* Service boundary for the Storage Management page (master prompt §9: "React must not own
 * core calculations... React should request calculations from domain/service modules").
 *
 * This is a THIN WRAPPER, not a reimplementation. The actual calculation logic
 * (collectFileRecords/summarizeStorage/findOrphans) still lives entirely in
 * src/js/storageAnalyticsEngine.js — the same pure, DOM-free engine the old vanilla page
 * called directly. blobStore.js remains the only thing that ever touches IndexedDB. This
 * module's only job is giving the React component a small, promise-based, React-agnostic
 * surface to call instead of reaching into window.PCC.* engine/store globals itself —
 * exactly the React -> Service -> Engine chain the master prompt's §6/§9 diagrams.
 *
 * First TypeScript conversion (strict mode) in the react/ tree — see ../types/pcc.d.ts
 * for the window.PCC.* boundary this file's types are declared against.
 */
import type { PCCStoreData, FileRecord, StorageSummary } from "../types/pcc";

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + " KB";
  return (kb / 1024).toFixed(2) + " MB";
}

export function projectName(data: PCCStoreData, projectId: string): string {
  if (!projectId) return "Unassigned";
  const p = data.projects.find((proj) => proj.id === projectId);
  return p ? p.name || "(unnamed project)" : "Unassigned";
}

export interface StorageSnapshot {
  data: PCCStoreData;
  records: FileRecord[];
  summary: StorageSummary;
}

/** Reads the current store snapshot and derives the storage summary for it. Synchronous —
 * store.get() and storageAnalyticsEngine's functions are both synchronous/pure. */
export function getStorageSnapshot(): StorageSnapshot {
  const data = window.PCC.store.get();
  const records = window.PCC.storageAnalyticsEngine.collectFileRecords(data);
  const summary = window.PCC.storageAnalyticsEngine.summarizeStorage(records);
  return { data, records, summary };
}

export interface OrphanBlob {
  id: string;
  size: number;
}

export interface ScanResult {
  orphanBlobs: OrphanBlob[];
  missingBlobRecords: FileRecord[];
}

/** Section 29 (Orphan File Detection). Reads blobStore.listBlobIds() (the one IndexedDB
 * call this feature needs) and resolves orphan blob sizes — the only place real blob
 * bytes get read, and only for the handful of orphans found, never the whole library. */
export function scanStorage(): Promise<ScanResult> {
  const data = window.PCC.store.get();
  const records = window.PCC.storageAnalyticsEngine.collectFileRecords(data);
  return window.PCC.blobStore.listBlobIds().then((blobIds) => {
    const result = window.PCC.storageAnalyticsEngine.findOrphans(records, blobIds);
    return Promise.all(
      result.orphanBlobIds.map((id) =>
        window.PCC.blobStore
          .getBlob(id)
          .then((dataUri) => {
            const size = dataUri ? Math.round((dataUri.length - dataUri.indexOf(",") - 1) * 0.75) : 0;
            return { id, size };
          })
          .catch(() => ({ id, size: 0 }))
      )
    ).then((orphanBlobs) => ({
      orphanBlobs,
      missingBlobRecords: result.missingBlobRecords,
    }));
  });
}

/** Deletion stays a deliberate, per-item, confirmed action — never automatic (§29). The
 * confirm() prompt itself stays the component's job, since it's a UI concern, not a
 * storage-layer one; this function only performs the delete once the caller decides to. */
export function deleteOrphanBlob(id: string): Promise<void> {
  return window.PCC.blobStore.deleteBlob(id);
}
