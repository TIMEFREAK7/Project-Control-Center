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
  client?: string;
  country?: string;
  sector?: string;
  project_manager?: string;
  planner?: string;
  project_type?: string;
  company?: string;
  progress?: number;
  finish_date?: string;
  budget?: number;
  currency?: string;
  contract_type?: string;
  contract_value?: number;
  location?: string;
}

export interface PCCDocument {
  id: string;
  project_id: string;
  document_type_id: string;
  trashed_at?: string | null;
  uploaded_at?: string;
  filename?: string;
  category?: string;
  package_id?: string;
  meeting_id?: string;
}

export interface PCCCommitment {
  id: string;
  project_id: string;
  vendor_id?: string;
  package_id?: string;
  type?: string;
  po_contract_number?: string;
  commitment_date?: string;
  committed_value?: number | null;
  approved_value?: number | null;
  status?: string;
  budget_item_id?: string;
  activity_id?: string;
  notes?: string;
  updated_at?: string;
}

export interface PCCPackage {
  id: string;
  name?: string;
  code?: string;
  notes?: string;
  updated_at?: string;
}

export interface PCCCostActual {
  id: string;
  project_id?: string;
  commitment_id?: string;
  budget_item_id?: string;
  category?: string;
  description?: string;
  amount?: number | null;
  date?: string;
  vendor?: string;
  invoice_ref?: string;
  notes?: string;
  updated_at?: string;
}

export interface PCCCostBudgetItem {
  id: string;
  project_id: string;
  name?: string;
  category?: string;
  planned_amount?: number | null;
  activity_id?: string;
  notes?: string;
  updated_at?: string;
}

export interface PCCProjectCostSummary {
  budgeted: number;
  actual: number;
  variance: number;
  usingPortfolioBudget?: boolean;
}

export interface PCCProjectEvm {
  bac: number;
  ac: number;
  pv: number;
  ev: number;
  linkedBac: number;
  cpi: number | null;
  spi: number | null;
  eac?: number | null;
  vac?: number | null;
  coveragePct?: number | null;
}

export interface PCCDailyLog {
  id: string;
  project_id: string;
  activity_id?: string;
  log_date?: string;
  weather?: string;
  manpower?: string;
  equipment?: string;
  visitors?: string;
  deliveries?: string;
  activities?: string;
  safety_notes?: string;
  incidents?: string;
  notes?: string;
  photos: PCCDailyLogPhoto[];
  updated_at?: string;
  created_at?: string;
}

export interface PCCDailyLogPhoto {
  id: string;
  filename?: string;
  file_data?: string | null;
  file_size?: number;
  caption?: string;
}

export interface PCCReportTemplate {
  id: string;
  report_type: string;
  name?: string;
  sections: { [key: string]: boolean };
  updated_at?: string;
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
  percent_complete?: number;
  updated_at?: string;
  early_finish?: string | null;
  late_start?: string | null;
  constraint_type?: string;
  constraint_date?: string;
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
  daily_log_id?: string;
  identified_date?: string;
  created_at?: string;
  status_history?: { status: string; changed_at?: string; note?: string }[];
}

export interface PCCDelayActivityLink {
  delay_id: string;
  activity_id: string;
  project_id?: string;
  original_planned_start?: string;
  original_planned_finish?: string;
  original_total_float?: number | null;
}

export interface PCCMeetingAction {
  id: string;
  status: string;
  due_date?: string;
  description?: string;
  owner?: string;
  vendor_id?: string;
  activity_id?: string;
  rfi_id?: string;
  risk_id?: string;
}

export interface PCCMeetingRecording {
  id: string;
  filename?: string;
  duration?: string;
  uploaded_by?: string;
  uploaded_at?: string;
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
  updated_at?: string;
  cost_impact_amount?: number | null;
  schedule_impact_days?: number | null;
  source_risk_id?: string;
  source_rfi_id?: string;
  description?: string;
  justification?: string;
  date_requested?: string;
  activity_id?: string;
  decision_by?: string;
  date_decided?: string;
  source_meeting_id?: string;
  revisions: PCCChangeOrderRevision[];
}

export interface PCCChangeOrderRevision {
  date: string;
  author?: string;
  note: string;
}

export interface PCCDecision {
  id: string;
  project_id: string;
  status: string;
  title?: string;
  waiting_on_party?: string;
  decision_date?: string;
  decided_by?: string;
  description?: string;
  decision?: string;
  source_meeting_id?: string;
  activity_id?: string;
  updated_at?: string;
}

export interface PCCRisk {
  id: string;
  project_id: string;
  type?: string;
  title?: string;
  status?: string;
  probability?: string;
  impact?: string;
  owner?: string;
  description?: string;
  mitigation?: string;
  source_meeting_id?: string;
  activity_id?: string;
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
  actions: PCCMeetingAction[];
  recordings?: PCCMeetingRecording[];
  activity_id?: string;
  attendees?: string;
  agenda?: string;
  minutes?: string;
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
  priority?: string;
  raised_by?: string;
  question?: string;
  date_raised?: string;
  cost_impact?: boolean;
  schedule_impact?: boolean;
  response?: string;
  date_answered?: string;
  activity_id?: string;
  source_meeting_id?: string;
  revisions: PCCRfiRevision[];
}

export interface PCCRfiRevision {
  date: string;
  author?: string;
  note: string;
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
  id?: string;
  project_id: string;
  document_type_id: string;
  planned_submission_date?: string;
  vendor_id?: string;
}

export interface PCCResource {
  id: string;
  name?: string;
  type?: string;
  unit?: string;
  max_availability?: number | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PCCResourceAssignment {
  id: string;
  resource_id?: string;
  activity_id?: string;
  quantity?: number | null;
  actual_quantity?: number | null;
  planned_hours_per_day?: number | null;
  overtime_hours?: number | null;
  vendor_id?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PCCResourceUnavailability {
  id: string;
  resource_id?: string;
  start_date?: string;
  end_date?: string;
  quantity?: number | null;
  reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ResourceTimelineContributor {
  assignmentId: string;
  activityId: string;
  activityName: string;
  projectId?: string;
  quantity: number;
}

export interface ResourceTimelineDay {
  date: string;
  allocated: number;
  contributors: ResourceTimelineContributor[];
}

export interface ResourceUsageTimeline {
  days: ResourceTimelineDay[];
  rangeStart: string | null;
  rangeEnd: string | null;
  skippedCount: number;
}

export interface OverAllocatedDay {
  date: string;
  allocated: number;
  available: number | null;
  overBy: number;
  contributors: ResourceTimelineContributor[];
}

export interface OverAllocationResult {
  available: boolean;
  overAllocatedDays: OverAllocatedDay[];
  count: number;
  maxOverBy: number | null;
  firstDate: string | null;
  lastDate: string | null;
}

export interface UtilisationDay {
  date: string;
  allocated: number;
  available: number | null;
  utilisationPct: number | null;
}

export interface UtilisationResult {
  available: boolean;
  days: UtilisationDay[];
  averageUtilisationPct: number | null;
  totalDemandUnitDays: number;
  totalAvailableUnitDays: number | null;
  totalShortfallUnitDays: number | null;
}

export interface UtilisationBucket {
  bucketStart: string;
  bucketEnd: string;
  avgUtilisationPct: number | null;
}

export interface TimelineBucket {
  bucketStart: string;
  bucketEnd: string;
  allocatedMax: number;
}

export interface PortfolioOverAllocationEntry {
  resourceId: string;
  resourceName: string;
  available: boolean;
  overAllocatedDayCount: number;
  maxOverBy: number | null;
}

export interface LevelingProposal {
  activityId: string;
  activityName: string;
  originalStart: string;
  originalFinish: string;
  proposedStart: string;
  proposedFinish: string;
  shiftedByDays: number;
}

export interface UnresolvedOverAllocation {
  date: string;
  allocated: number;
  available: number;
  overBy: number;
}

export interface LevelingResult {
  available: boolean;
  leveled: boolean;
  proposals: LevelingProposal[];
  unresolved: UnresolvedOverAllocation[];
  excludedActivityIds: string[];
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
  daily_logs: PCCDailyLog[];
  report_templates: PCCReportTemplate[];
  commitments: PCCCommitment[];
  packages: PCCPackage[];
  cost_actuals: PCCCostActual[];
  cost_budget_items: PCCCostBudgetItem[];
  document_types: PCCDocumentType[];
  vendors: PCCVendor[];
  project_document_requirements: PCCProjectDocumentRequirement[];
  resources: PCCResource[];
  resource_assignments: PCCResourceAssignment[];
  resource_unavailability: PCCResourceUnavailability[];
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
        newDecision(prefill: Partial<PCCDecision>): PCCDecision;
        DECISION_STATUSES: string[];
        WAITING_ON_PARTIES: string[];
        newReportTemplate(values: Partial<PCCReportTemplate>): PCCReportTemplate;
        newRisk(prefill: Partial<PCCRisk>): PCCRisk;
        RISK_TYPES: string[];
        RISK_STATUSES: string[];
        RISK_LEVELS: string[];
        newCommitment(prefill: Partial<PCCCommitment>): PCCCommitment;
        newPackage(prefill: Partial<PCCPackage>): PCCPackage;
        COMMITMENT_TYPES: string[];
        COMMITMENT_STATUSES: string[];
        newChangeOrder(prefill: Partial<PCCChangeOrder>): PCCChangeOrder;
        nextChangeOrderNumber(existing: PCCChangeOrder[]): string;
        newChangeOrderRevision(values: { author: string; note: string }): PCCChangeOrderRevision;
        CHANGE_ORDER_STATUSES: string[];
        newRfi(prefill: Partial<PCCRfi>): PCCRfi;
        nextRfiNumber(existing: PCCRfi[], type: string): string;
        newRfiRevision(values: { author: string; note: string }): PCCRfiRevision;
        RFI_TYPES: string[];
        RFI_PRIORITIES: string[];
        RFI_STATUSES: string[];
        newDailyLog(prefill: Partial<PCCDailyLog>): PCCDailyLog;
        newDailyLogPhoto(values: Partial<PCCDailyLogPhoto>): PCCDailyLogPhoto;
        newDelayRecord(values: Partial<PCCDelayRecord>): PCCDelayRecord;
        newDelayActivityLink(values: Partial<PCCDelayActivityLink>): PCCDelayActivityLink;
        newMeeting(overrides: Partial<PCCMeeting>): PCCMeeting;
        newMeetingAction(): PCCMeetingAction;
        newMeetingRecording(): PCCMeetingRecording;
        newCostBudgetItem(values: Partial<PCCCostBudgetItem>): PCCCostBudgetItem;
        newCostActual(values: Partial<PCCCostActual>): PCCCostActual;
        COST_CATEGORIES: string[];
        newResource(overrides: Partial<PCCResource>): PCCResource;
        newResourceAssignment(overrides: Partial<PCCResourceAssignment>): PCCResourceAssignment;
        newResourceUnavailability(overrides: Partial<PCCResourceUnavailability>): PCCResourceUnavailability;
        RESOURCE_TYPES: string[];
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
        resolve(id: string, inlineFileData?: string | null): Promise<string | null>;
      };
      loadingIndicator: {
        show(message: string): void;
        hide(): void;
      };
      fileViewer: {
        open(file: { filename: string; mimeType: string; blob: Blob }): void;
      };
      layout: {
        refreshTitleBlock(): void;
        refreshBackupNudge?(): void;
        buildContextSwitcher(prefix: string): HTMLElement;
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
        createFromMeeting?(projectId: string, meetingId: string): void;
      };
      portfolio: {
        viewProject(projectId: string): void;
        filterByStatus?(status: string): void;
      };
      changeOrders: {
        expandChangeOrder(changeOrderId: string): void;
        createFromRisk?(projectId: string, riskId: string): void;
        createFromRfi?(projectId: string, rfiId: string): void;
        createFromMeeting?(projectId: string, meetingId: string): void;
      };
      lessonsLearned?: {
        createFromMeeting?(projectId: string, meetingId: string): void;
      };
      cost?: {
        projectCostSummary(data: PCCStoreData, projectId: string): PCCProjectCostSummary;
      };
      costEvmEngine: {
        computeEvm(
          budgetItems: PCCCostBudgetItem[],
          actuals: PCCCostActual[],
          activities: PCCActivity[],
          schedules: PCCSchedule[],
          options: { bac: number }
        ): PCCProjectEvm;
      };
      scheduleGanttLayout: {
        addDays(isoDateStr: string, days: number): string;
      };
      files?: {
        filterByProject(projectId: string): void;
        open?(doc: PCCDocument): void;
        createFromMeeting?(projectId: string, meetingId: string): void;
      };
      decisionRegister: {
        expandDecision(decisionId: string): void;
        createFromMeeting?(projectId: string, meetingId: string): void;
      };
      vendors: {
        openProfile(vendorId: string): void;
      };
      risks: {
        expandRisk(riskId: string): void;
        createFromMeeting?(projectId: string, meetingId: string): void;
      };
      executiveCenter: {
        viewProject(projectId: string, tab?: string): void;
        getSchedulePerformanceSummary?(projectId: string): { unaddressedDelayDays: number };
        getDelayImpactSummary?(projectId: string): { openDelayCount: number; criticalDelayCount: number };
        getDiagnostics?(projectId: string): { severity: string; description: string }[];
      };
      resourceLevelingEngine: {
        computeResourceUsageTimeline(resource: PCCResource, assignments: PCCResourceAssignment[], activities: PCCActivity[]): ResourceUsageTimeline;
        detectOverAllocations(resource: PCCResource, timeline: ResourceUsageTimeline, unavailabilities: PCCResourceUnavailability[]): OverAllocationResult;
        computeUtilisation(resource: PCCResource, timeline: ResourceUsageTimeline, unavailabilities: PCCResourceUnavailability[]): UtilisationResult;
        portfolioOverAllocationSummary(
          resources: PCCResource[],
          assignments: PCCResourceAssignment[],
          activities: PCCActivity[],
          unavailabilities: PCCResourceUnavailability[]
        ): PortfolioOverAllocationEntry[];
        bucketTimeline(days: ResourceTimelineDay[], bucketSizeDays: number): TimelineBucket[];
        bucketUtilisation(days: UtilisationDay[], bucketSizeDays: number): UtilisationBucket[];
        levelResourceWithinFloat(
          resource: PCCResource,
          assignments: PCCResourceAssignment[],
          activities: PCCActivity[],
          unavailabilities: PCCResourceUnavailability[]
        ): LevelingResult;
      };
    };
  }
}
