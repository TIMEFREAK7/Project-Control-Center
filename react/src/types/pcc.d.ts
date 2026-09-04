/* Ambient type declarations for the `window.PCC.*` surface — the boundary between this
 * TypeScript layer and the vanilla-JS domain engines in src/js/ (store.js, blobStore.js,
 * and every *Engine.js file). Those files are NOT part of the TypeScript conversion and
 * are NOT type-checked themselves; this file only describes their *shape* to the
 * TypeScript side that calls into them.
 *
 * DELIBERATELY INCREMENTAL, matching the same page-at-a-time discipline the JSX migration
 * itself used: this declares ONLY the functions/fields a converted page or service
 * actually calls, not the full API surface of every engine. When the next page gets
 * converted to TypeScript, extend the relevant interface below with whatever new fields/
 * functions it needs — don't pre-declare engines or store fields nothing uses yet. A
 * half-guessed declaration for code nobody's calling is worse than no declaration: it's
 * never exercised by a real conversion, so a wrong guess can sit unnoticed indefinitely.
 *
 * PCCStoreData is the shared shape of window.PCC.store.get()'s return value. It is a
 * CLOSED interface (no index signature) on purpose — every field on it must be added
 * explicitly by whichever conversion first needs it. This is stricter than a catch-all
 * `[key: string]: any` would be, and that's deliberate: it keeps this file always
 * accurate to what the TypeScript layer actually reads, rather than silently permissive
 * about fields nothing has verified yet.
 */

export interface PCCProject {
  id: string;
  name?: string;
}

export interface PCCStoreData {
  projects: PCCProject[];
}

export interface FileRecord {
  id: string;
  source: string;
  sourceLabel: string;
  filename: string;
  fileSize: number;
  projectId: string;
  isDuplicate: boolean;
  trashed: boolean;
}

export interface StorageBreakdownEntry {
  label: string;
  count: number;
  bytes: number;
}

export interface StorageProjectEntry {
  count: number;
  bytes: number;
}

export interface StorageSummary {
  totalBytes: number;
  totalCount: number;
  trashedBytes: number;
  trashedCount: number;
  duplicateBytes: number;
  duplicateCount: number;
  bySource: { [source: string]: StorageBreakdownEntry };
  byProject: { [projectId: string]: StorageProjectEntry };
  largestFiles: FileRecord[];
}

export interface OrphanResult {
  orphanBlobIds: string[];
  missingBlobRecords: FileRecord[];
}

declare global {
  interface Window {
    PCC: {
      store: {
        get(): PCCStoreData;
      };
      blobStore: {
        listBlobIds(): Promise<string[]>;
        getBlob(id: string): Promise<string | null>;
        deleteBlob(id: string): Promise<void>;
      };
      storageAnalyticsEngine: {
        collectFileRecords(data: PCCStoreData): FileRecord[];
        summarizeStorage(records: FileRecord[]): StorageSummary;
        findOrphans(records: FileRecord[], blobIds: string[]): OrphanResult;
      };
      notify(message: string, kind?: string): void;
    };
  }
}
