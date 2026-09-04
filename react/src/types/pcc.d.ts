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

// ===== Domain record shapes =====
// Grown incrementally, one page conversion at a time — each interface only carries the
// fields some already-converted page/service actually reads. Extend, don't guess ahead.

export interface PCCProject {
  id: string;
  name?: string;
  archived?: boolean;
}

export interface PCCDocument {
  id: string;
  project_id: string;
  document_type_id: string;
  trashed_at?: string | null;
}

export interface PCCSchedule {
  id: string;
  project_id: string;
  status?: string;
  revision_number: number;
  updated_at: string;
  near_critical_threshold_days?: number | null;
}

export interface PCCActivity {
  id: string;
  schedule_id: string;
  project_id: string;
  activity_type: string;
  status?: string;
  name?: string;
  early_start?: string | null;
  planned_start?: string | null;
  total_float?: number | null;
  responsible_person?: string;
  contractor?: string;
}

export interface PCCDelayRecord {
  id: string;
  project_id: string;
  status: string;
  activity_id?: string | null;
  delay_category?: string;
  description?: string;
  responsible_party?: string;
}

export interface PCCDelayActivityLink {
  delay_id: string;
  activity_id: string;
}

export interface PCCMeetingAction {
  status: string;
  due_date?: string;
  description?: string;
  owner?: string;
  vendor_id?: string;
  activity_id?: string;
}

export interface PCCRecoveryAction {
  id: string;
  project_id: string;
  status: string;
  target_recovery_date?: string;
  activity_id?: string;
  description?: string;
  responsible_person?: string;
}

export interface PCCChangeOrder {
  id: string;
  project_id: string;
  status: string;
  number?: string;
  title?: string;
  requested_by?: string;
}

export interface PCCSettings {
  action_centre_upcoming_days?: number | null;
}

export interface PCCMeeting {
  id: string;
  project_id: string;
  title?: string;
  meeting_date?: string;
  actions?: PCCMeetingAction[];
}

export interface PCCRfi {
  id: string;
  project_id: string;
  type?: string;
  status: string;
  number?: string;
  subject?: string;
  date_required?: string;
  assigned_to?: string;
}

export interface PCCDocumentType {
  id: string;
  name: string;
  code?: string;
  category?: string;
  default_criticality?: string;
  description?: string;
  active?: boolean;
  updated_at?: string;
}

export interface PCCDocumentTypeValues {
  name: string;
  code: string;
  category: string;
  default_criticality: string;
  description: string;
}

export interface PCCVendor {
  id: string;
  vendor_name?: string;
}

export interface PCCProjectDocumentRequirement {
  project_id: string;
  document_type_id: string;
  planned_submission_date?: string;
  vendor_id?: string;
}

export interface PCCStoreData {
  projects: PCCProject[];
  documents: PCCDocument[];
  schedules: PCCSchedule[];
  activities: PCCActivity[];
  delay_records: PCCDelayRecord[];
  delay_activity_links: PCCDelayActivityLink[];
  meetings: PCCMeeting[];
  rfis: PCCRfi[];
  recovery_actions: PCCRecoveryAction[];
  change_orders: PCCChangeOrder[];
  settings: PCCSettings;
  document_types: PCCDocumentType[];
  vendors: PCCVendor[];
  project_document_requirements: PCCProjectDocumentRequirement[];
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
        update(mutator: (data: PCCStoreData) => void): void;
        newDocumentType(values: Partial<PCCDocumentTypeValues>): PCCDocumentType;
        DOCUMENT_TYPE_CRITICALITY_LEVELS: string[];
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
      projectContext: {
        get(): string;
        set(projectId: string): void;
      };
      router: {
        go(routeName: string): void;
        render(): void;
        currentRouteName(): string;
      };
      schedule: {
        viewActivity(projectId: string, scheduleId: string, activityId: string): void;
      };
      meetings: {
        expandMeeting(meetingId: string): void;
      };
      rfis: {
        expandRfi(rfiId: string): void;
      };
      portfolio: {
        viewProject(projectId: string): void;
      };
      changeOrders: {
        expandChangeOrder(changeOrderId: string): void;
      };
    };
  }
}
