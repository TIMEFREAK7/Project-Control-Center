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
  review_cadence_days?: number | null;
  start_date?: string;
  created_at?: string;
  updated_at?: string;
  company_id?: string;
  client_id?: string;
  status?: string;
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
  name?: string;
  status?: string;
  revision_number: number;
  updated_at: string;
  near_critical_threshold_days?: number | null;
}

export interface PCCCompany {
  id: string;
  name?: string;
  notes?: string;
  archived?: boolean;
  updated_at?: string;
}

export interface PCCClient {
  id: string;
  company_id: string;
  name?: string;
  notes?: string;
  archived?: boolean;
  updated_at?: string;
}

export interface PCCKnowledgeBaseArticle {
  id: string;
  project_id?: string;
  title?: string;
  category?: string;
  tags?: string;
  body?: string;
  filename?: string;
  file_size?: number;
  mime_type?: string;
  updated_at?: string;
}

export interface PCCLessonLearned {
  id: string;
  project_id: string;
  title?: string;
  category?: string;
  impact_type?: string;
  date_identified?: string;
  identified_by?: string;
  description?: string;
  recommendation?: string;
  activity_id?: string;
  source_meeting_id?: string;
  updated_at?: string;
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
  planned_finish?: string | null;
  total_float?: number | null;
  responsible_person?: string;
  contractor?: string;
  updated_at?: string;
}

export interface PCCDelayRecord {
  id: string;
  project_id: string;
  status: string;
  activity_id?: string | null;
  delay_category?: string;
  description?: string;
  responsible_party?: string;
  delay_days?: number | null;
  is_excusable?: boolean;
  delay_cause?: string;
  responsibility_classification?: string;
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
  estimated_recovery_days?: number | null;
  estimated_cost?: number | null;
  updated_at?: string;
}

export interface PCCChangeOrder {
  id: string;
  project_id: string;
  status: string;
  number?: string;
  title?: string;
  requested_by?: string;
  waiting_on_party?: string;
}

export interface PCCDecision {
  id: string;
  project_id: string;
  status: string;
  title?: string;
  waiting_on_party?: string;
}

export interface PCCRisk {
  id: string;
  project_id: string;
  type?: string;
  title?: string;
  updated_at?: string;
}

export interface PCCWeeklyReview {
  project_id: string;
  review_date: string;
}

export interface PCCSettings {
  action_centre_upcoming_days?: number | null;
  company_name?: string;
  company_logo_filename?: string;
  company_logo_mime_type?: string;
  document_reminder_due_soon_days?: number | null;
  document_nomenclature_enabled?: boolean;
  document_nomenclature_pattern?: string;
  backup_reminder_days?: number | null;
}

export interface PCCMeta {
  last_saved_at?: string | null;
  last_exported_at?: string | null;
}

export interface PCCMeeting {
  id: string;
  project_id: string;
  title?: string;
  meeting_date?: string;
  actions?: PCCMeetingAction[];
  updated_at?: string;
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
  waiting_on_party?: string;
  updated_at?: string;
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
  next_follow_up_date?: string;
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
  decisions: PCCDecision[];
  risks: PCCRisk[];
  weekly_reviews: PCCWeeklyReview[];
  settings: PCCSettings;
  meta: PCCMeta;
  lessons_learned: PCCLessonLearned[];
  knowledge_base_articles: PCCKnowledgeBaseArticle[];
  companies: PCCCompany[];
  clients: PCCClient[];
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
        exportToFile(): Promise<void>;
        resetAll(): void;
        listRecoveryBackups?(): string[];
        downloadRecoveryBackup(key: string): void;
        deleteRecoveryBackup(key: string): void;
        newLessonLearned(prefill: Partial<PCCLessonLearned>): PCCLessonLearned;
        rememberLastUsedName(key: string, value: string | undefined): void;
        getLastUsedName(key: string): string;
        LESSON_LEARNED_CATEGORIES: string[];
        LESSON_LEARNED_IMPACT_TYPES: string[];
        KNOWLEDGE_BASE_CATEGORIES: string[];
        newKnowledgeBaseArticle(prefill: Partial<PCCKnowledgeBaseArticle>): PCCKnowledgeBaseArticle;
        newCompany(prefill: Partial<PCCCompany>): PCCCompany;
        newClient(prefill: Partial<PCCClient>): PCCClient;
        DELAY_RECORD_STATUSES: string[];
        DELAY_CATEGORIES: string[];
        DELAY_RESPONSIBILITY_CLASSIFICATIONS: string[];
        DELAY_RECORD_CAUSES: string[];
      };
      pendingProjectPrefill?: { company_id?: string; client_id?: string };
      delayImpactEngine: {
        computeDelayImpact(
          delayRecord: PCCDelayRecord,
          links: PCCDelayActivityLink[],
          data: PCCStoreData
        ): { overall_criticality: string };
      };
      blobStore: {
        listBlobIds(): Promise<string[]>;
        getBlob(id: string): Promise<string | null>;
        putBlob(id: string, dataUri: string): Promise<void>;
        deleteBlob(id: string): Promise<void>;
      };
      layout: {
        refreshTitleBlock(): void;
        refreshBackupNudge?(): void;
      };
      archive: {
        exportAll(projects: PCCProject[], documents: PCCDocument[]): void;
      };
      sqliteMigrationEngine: {
        initSqlJsBrowser(): Promise<any>;
      };
      sqliteBackupService: {
        createFullBackup(SQL: any, data: PCCStoreData): Promise<{ blob: Blob; fileCount: number; skipped: number }>;
        restoreFullBackup(SQL: any, file: File): Promise<{ restoredFileCount: number }>;
      };
      nativeFile: {
        save(blob: Blob, filename: string): Promise<void>;
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
      decisionRegister: {
        expandDecision(decisionId: string): void;
      };
      vendors: {
        openProfile(vendorId: string): void;
      };
      risks: {
        expandRisk(riskId: string): void;
      };
      executiveCenter: {
        viewProject(projectId: string, tab?: string): void;
      };
    };
  }
}
