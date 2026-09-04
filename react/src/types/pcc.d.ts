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
  project_code?: string;
  engineers?: string;
  contractor?: string;
  consultant?: string;
  owner?: string;
  relationship_history?: { company_id?: string; client_id?: string; company_name?: string; client_name?: string; changed_at: string }[];
  attachments?: string[];
  forecast_finish_date?: string | null;
  current_phase?: string;
}

export interface PCCDocumentExtraction {
  type: string;
  [key: string]: any;
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
  document_group_id?: string;
  revision_number?: number;
  status?: string;
  activity_id?: string;
  file_size?: number;
  mime_type?: string;
  extraction?: PCCDocumentExtraction | null;
  file_data?: string | null;
  content_hash?: string | null;
  hash_method?: string | null;
  is_duplicate?: boolean;
  original_record_id?: string | null;
  duplicate_reason?: string | null;
  duplicate_group_id?: string | null;
  discipline?: string;
  document_number?: string;
  revision?: string;
  contract_or_po?: string;
  vendor_id?: string;
  priority?: string;
  criticality?: string;
  remarks?: string;
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
  etc?: number | null;
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
  data_date?: string;
  calculation_mode?: string;
  calendar_aware?: boolean;
  constraints_enabled?: boolean;
  version?: string;
  description?: string;
  import_date?: string | null;
  source_platform?: string;
  source_format?: string | null;
  schedule_type?: string;
  schedule_owner?: string;
  source_file_name?: string | null;
  source_file_size?: number | null;
  content_hash?: string | null;
  hash_method?: string | null;
  cpm_calculated_fingerprint?: number | null;
  created_at?: string;
}

export interface PCCWbsItem {
  id: string;
  project_id: string;
  schedule_id: string;
  code?: string;
  name?: string;
  parent_wbs_id?: string | null;
  level: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
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
  late_finish?: string | null;
  constraint_type?: string;
  constraint_date?: string;
  vendor_id?: string;
  wbs_id?: string | null;
  calendar_id?: string | null;
  duration?: number | null;
  original_duration?: number | null;
  remaining_duration?: number | null;
  actual_start?: string;
  actual_finish?: string;
  free_float?: number | null;
  is_out_of_sequence?: boolean;
  physical_progress?: number;
  priority?: string;
  discipline?: string;
  notes?: string;
  external_id?: string | null;
  created_at?: string;
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
  vendor_id?: string;
  milestone_activity_id?: string;
  risk_id?: string;
  issue_id?: string;
  rfi_id?: string;
  meeting_id?: string;
  change_order_id?: string;
  immediate_cause?: string;
  underlying_cause?: string;
  actual_impact_days?: number | null;
  updated_at?: string;
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
  delay_id?: string;
  actual_recovery_days?: number | null;
  mitigation_type?: string;
  comments?: string;
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

export interface WeeklyReviewSnapshot {
  health_score?: number | null;
  rag?: string;
  schedule_progress_pct?: number | null;
  physical_progress_pct?: number | null;
  cost_budget?: number | null;
  cost_actual?: number | null;
  cost_variance?: number | null;
  open_risks?: number;
  high_risks?: number;
  open_rfis?: number;
  overdue_rfis?: number;
  pending_change_orders?: number;
  open_recovery_actions?: number;
  overdue_recovery_actions?: number;
  pending_decisions?: number;
}

export interface PCCWeeklyReview {
  id: string;
  project_id: string;
  review_date: string;
  attendees?: string;
  reviewed_by?: string;
  progress_notes?: string;
  issues_notes?: string;
  actions_notes?: string;
  snapshot?: WeeklyReviewSnapshot;
  created_at?: string;
  updated_at?: string;
}

export interface PCCHealthScoreWeights {
  schedule: number;
  cost: number;
  risk: number;
  issue: number;
  rfi: number;
  change: number;
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
  health_score_weights: PCCHealthScoreWeights;
}

export interface PCCRelationship {
  id: string;
  schedule_id?: string;
  predecessor_id?: string;
  successor_id?: string;
  type?: string;
  lag?: number;
  created_at?: string;
}

export interface PCCCalendar {
  id: string;
  project_id?: string;
  name?: string;
  is_default?: boolean;
  working_days?: boolean[];
  holidays?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface PCCScheduleBaseline {
  id: string;
  schedule_id?: string;
  project_id?: string;
  name?: string;
  schedule_revision_number?: number | null;
  captured_at?: string;
  wbs_count?: number;
  activity_count?: number;
  relationship_count?: number;
  notes?: string;
  is_official?: boolean;
  baseline_project_finish?: string | null;
  created_at?: string;
}

export interface PCCSchedulePerformanceSnapshot {
  id: string;
  project_id?: string;
  captured_at?: string;
  spi?: number | null;
  cpi?: number | null;
  spi_t?: number | null;
  earned_schedule_days?: number | null;
  actual_time_days?: number | null;
  schedule_variance_days?: number | null;
  schedule_performance_score?: number | null;
  schedule_performance_rag?: string | null;
  schedule_progress_pct?: number | null;
  notes?: string;
  created_at?: string;
}

export interface PCCExecutiveSummary {
  id: string;
  project_id: string;
  status_override?: string;
  achievements_override?: string;
  challenges_override?: string;
  management_attention_override?: string;
  upcoming_override?: string;
  document_control_override?: string;
  updated_at?: string;
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
  vendor_code?: string;
  vendor_name?: string;
  company_name?: string;
  category?: string;
  trade_discipline?: string;
  gst_number?: string;
  pan_number?: string;
  registration_number?: string;
  website?: string;
  office_address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  status?: string;
  notes?: string;
  next_follow_up_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PCCVendorContact {
  id: string;
  vendor_id?: string;
  name?: string;
  designation?: string;
  mobile?: string;
  email?: string;
  is_primary?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PCCVendorProjectLink {
  id: string;
  vendor_id?: string;
  project_id?: string;
  role?: string;
  scope_of_work?: string;
  contract_status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PCCVendorDocument {
  id: string;
  vendor_id?: string;
  project_id?: string;
  document_group_id?: string;
  revision_number?: number;
  category?: string;
  custom_category_label?: string;
  filename?: string;
  file_size?: number;
  mime_type?: string;
  upload_date?: string;
  uploaded_by?: string;
  expiry_date?: string;
  tags?: string;
  comments?: string;
  content_hash?: string | null;
  hash_method?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PCCVendorMeetingLink {
  id: string;
  vendor_id?: string;
  meeting_id?: string;
  created_at?: string;
}

export interface PCCVendorRfiLink {
  id: string;
  vendor_id?: string;
  rfi_id?: string;
  created_at?: string;
}

export interface PCCVendorRiskLink {
  id: string;
  vendor_id?: string;
  risk_id?: string;
  created_at?: string;
}

export interface PCCVendorNote {
  id: string;
  vendor_id?: string;
  note_text?: string;
  author?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PCCProjectDocumentRequirement {
  id?: string;
  project_id: string;
  document_type_id: string;
  planned_submission_date?: string | null;
  vendor_id?: string;
  activity_id?: string;
  lead_time_days?: number | null;
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
  wbs_items: PCCWbsItem[];
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
  vendor_performance: PCCVendorPerformance[];
  vendor_contacts: PCCVendorContact[];
  vendor_project_links: PCCVendorProjectLink[];
  vendor_documents: PCCVendorDocument[];
  vendor_meeting_links: PCCVendorMeetingLink[];
  vendor_rfi_links: PCCVendorRfiLink[];
  vendor_risk_links: PCCVendorRiskLink[];
  vendor_notes: PCCVendorNote[];
  relationships: PCCRelationship[];
  calendars: PCCCalendar[];
  schedule_baselines: PCCScheduleBaseline[];
  schedule_performance_snapshots: PCCSchedulePerformanceSnapshot[];
  executive_summaries: PCCExecutiveSummary[];
}

export interface PCCProjectTemplate {
  key: string;
  label: string;
  suggested_type_names: string[];
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

// ===== Executive Center's aggregated per-project context =====
// A large, deliberately loosely-typed aggregation object (see executiveCenterService.ts's
// buildProjectContext) — every field a real value this file's own code computes and
// reads back, but several nested engine-result shapes (cpm/evm/earnedSchedule/
// schedulePerformance) stay `any`: they come from scheduleCpmEngine/costEvmEngine/
// schedulePerformanceEngine, vanilla engines this conversion doesn't otherwise model in
// detail, and ExecutiveCenter.tsx only ever reads a handful of well-known fields off them.

export interface CpmActivityResult {
  total_float?: number | null;
  early_start?: string | null;
  early_finish?: string | null;
  late_start?: string | null;
  late_finish?: string | null;
  free_float?: number | null;
  is_out_of_sequence?: boolean;
  insufficient_data?: boolean;
  is_critical?: boolean;
  is_near_critical?: boolean;
  status?: string;
}

export interface CpmResult {
  results: { [activityId: string]: CpmActivityResult };
  projectFinish?: string | null;
  plannedProjectFinish?: string | null;
  forecastVarianceDays?: number | null;
  criticalActivityIds: string[];
  cyclicActivityIds: string[];
  outOfSequenceActivityIds: string[];
  [key: string]: any;
}

export interface NamedRef {
  id: string;
  name?: string;
}

export interface ProjectContext {
  project?: PCCProject;
  todayIso: string;
  schedule?: PCCSchedule | null;
  scheduleCount?: number;
  activities?: PCCActivity[];
  relationships?: PCCRelationship[];
  cpm?: CpmResult | null;
  referenceDate?: string;
  totalActivityCount?: number;
  criticalActivities?: NamedRef[];
  nearCriticalActivities?: NamedRef[];
  delayedActivities?: (NamedRef & { finish?: string | null })[];
  completedActivityCount?: number;
  inProgressActivityCount?: number;
  notStartedActivityCount?: number;
  remainingDurationTotalDays?: number;
  remainingDurationMissingCount?: number;
  forecastLateActivities?: (NamedRef & { plannedFinish?: string; forecastFinish?: string; varianceDays: number })[];
  outOfSequenceActivities?: NamedRef[];
  baselineCount?: number;
  scheduleProgressPct?: number | null;
  physicalProgressPct?: number | null;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  plannedDurationDays?: number | null;
  forecastFinish?: string | null;
  forecastFinishSource?: string;
  forecastVarianceDays?: number | null;
  officialBaseline?: PCCScheduleBaseline | null;
  scheduleVarianceSource?: string;
  upcomingMilestones?: (NamedRef & { date: string })[];
  slippedMilestones?: (NamedRef & { varianceDays: number })[];
  costSummary?: PCCProjectCostSummary;
  budgetItemCount?: number;
  evm?: PCCProjectEvm | null;
  earnedSchedule?: { insufficientData?: boolean; spiT?: number | null; scheduleVarianceDays?: number | null; earnedScheduleDays?: number | null; actualTimeDays?: number | null } | null;
  schedulePerformance?: SchedulePerformanceResult;
  schedulePerformanceSnapshots?: PCCSchedulePerformanceSnapshot[];
  commitmentSummary?: { count: number; committed: number; approved: number; actual: number; remaining: number; atRisk: number };
  allRisks?: PCCRisk[];
  openRisks?: PCCRisk[];
  openIssues?: PCCRisk[];
  openOpportunities?: PCCRisk[];
  highRisks?: PCCRisk[];
  criticalIssues?: PCCRisk[];
  allRfis?: PCCRfi[];
  openRfis?: PCCRfi[];
  overdueRfis?: { id: string; number?: string; subject?: string; daysOverdue: number }[];
  avgRfiResponseDays?: number | null;
  allChangeOrders?: PCCChangeOrder[];
  openChangeOrders?: PCCChangeOrder[];
  pendingChangeOrders?: PCCChangeOrder[];
  approvedChangeOrders?: PCCChangeOrder[];
  rejectedChangeOrders?: PCCChangeOrder[];
  meetings?: PCCMeeting[];
  overdueMeetingActions?: { meetingId: string; meetingTitle: string; description?: string; dueDate?: string }[];
  upcomingMeetings?: PCCMeeting[];
  documents?: PCCDocument[];
  dailyLogs?: PCCDailyLog[];
  assignedResourceCount?: number;
  overAllocatedResources?: PortfolioOverAllocationEntry[];
  docControlTotal?: number;
  docControlAvailable?: number;
  docControlOverdue?: number;
  docControlOverdueTypeNames?: string[];
  allRecoveryActions?: PCCRecoveryAction[];
  openRecoveryActions?: PCCRecoveryAction[];
  overdueRecoveryActions?: PCCRecoveryAction[];
  allDelayRecords?: PCCDelayRecord[];
  totalDelayDays?: number;
  totalUnaddressedDelayDays?: number;
  unaddressedDelayActivities?: { id: string; scheduleId?: string | null; name?: string; delayDays: number; recoveryDays: number; gapDays: number }[];
  allDecisions?: PCCDecision[];
  pendingDecisions?: PCCDecision[];
}

/** ExecutiveCenter.tsx only ever renders its many sub-panels once buildProjectContext()
 * has found a real project — every field except the handful that are genuinely nullable
 * even then (schedule/cpm/officialBaseline/evm/earnedSchedule) is unconditionally set by
 * that point (see its own header comment: "if (!project) return ctx" is the only early
 * exit). This alias turns every other ProjectContext field non-optional via Required<>
 * so the many small presentational components below don't need a `ctx.foo!`/`ctx.foo ||
 * []` on every single read — the narrowing happens once, at the ExecutiveCenterPage
 * level, via an `if (!ctx.project) return <empty state>` guard before anything else
 * renders. */
export interface PopulatedProjectContext extends Required<Omit<ProjectContext, "schedule" | "cpm" | "officialBaseline" | "evm" | "earnedSchedule">> {
  schedule: PCCSchedule | null;
  cpm: CpmResult | null;
  officialBaseline: PCCScheduleBaseline | null;
  evm: PCCProjectEvm | null;
  earnedSchedule: { insufficientData?: boolean; spiT?: number | null; scheduleVarianceDays?: number | null; earnedScheduleDays?: number | null; actualTimeDays?: number | null } | null;
}

export interface HealthScoreFactor {
  key: string;
  label: string;
  available: boolean;
  score: number | null;
  weight: number;
  weightPct: number;
  contribution: number;
  note?: string;
}

export interface HealthScoreResult {
  score: number | null;
  rag: string;
  breakdown: HealthScoreFactor[];
  totalConfiguredWeight?: number;
}

export interface DiagnosticAlert {
  id: string;
  severity: string;
  source: string;
  description: string;
  date: string;
  link?: { module: string; recordId?: string; tab?: string };
}

export interface ExecutiveCenterHealthSummary {
  score: number | null;
  rag: string;
  scheduleRag: string;
  riskRag: string;
  delayedActivityCount: number;
}

export interface ExecutiveCenterSchedulePerformanceSummary {
  score: number | null;
  rag: string;
  spi: number | null;
  spiT: number | null;
  unaddressedDelayDays: number;
}

export interface SchedulePerformanceFactor {
  available: boolean;
  score: number | null;
  weight: number;
  note?: string;
  label?: string;
}

export interface SchedulePerformanceResult {
  score: number | null;
  rag: string | null;
  factors: { [key: string]: SchedulePerformanceFactor };
}

export interface PCCVendorPerformance {
  id: string;
  vendor_id?: string;
  project_id?: string;
  quality_rating?: number;
  delivery_rating?: number;
  communication_rating?: number;
  safety_rating?: number;
  comments?: string;
  review_date?: string;
  reviewed_by?: string;
  created_at?: string;
}

// ===== Schedule page (Batch G): Gantt layout, import/export, baseline comparison, delay impact =====

export interface GanttLayoutRow {
  id: string;
  name: string;
  activityType?: string;
  isMilestone: boolean;
  isCritical: boolean;
  hasFloatData: boolean;
  dateSource: string;
  start: string | null;
  finish: string | null;
  durationDays: number | null;
  percentComplete: number;
}

export interface GanttLayout {
  rows: GanttLayoutRow[];
  datedCount: number;
  undatedCount: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  dataDate: string | null;
}

export interface GanttDragResult {
  start: string;
  finish: string;
}

export interface VisibleRowRange {
  start: number;
  end: number;
}

export interface ParseIssue {
  row?: number | string;
  message: string;
}

export interface ParseSummary {
  total_rows: number;
  imported: number;
  warnings: number;
  errors: number;
}

export interface ParsedScheduleWbsEntry {
  code: string;
  name: string;
  level: number;
  parent_code?: string | null;
}

export interface ParsedScheduleActivity {
  external_id: string;
  name?: string;
  activity_type?: string;
  wbs_code?: string;
  duration?: number | null;
  remaining_duration?: number | null;
  planned_start?: string;
  planned_finish?: string;
  actual_start?: string;
  actual_finish?: string;
  constraint_type?: string;
  constraint_date?: string;
  percent_complete?: number;
  discipline?: string;
  contractor?: string;
  responsible_person?: string;
  status?: string;
  notes?: string;
}

export interface ParsedScheduleRelationship {
  predecessor_external_id: string;
  successor_external_id: string;
  type: string;
  lag: number;
}

export interface ParsedScheduleCalendarInfo {
  name?: string;
  working_days?: boolean[];
  holidays?: string[];
}

export interface ParsedScheduleImport {
  wbsEntries: ParsedScheduleWbsEntry[];
  activities: ParsedScheduleActivity[];
  relationships: ParsedScheduleRelationship[];
  calendar?: ParsedScheduleCalendarInfo | null;
  summary: ParseSummary;
  errors: ParseIssue[];
  warnings: ParseIssue[];
}

export interface CanonicalHeaderField {
  key: string;
  label: string;
}

export interface ImportFileInfo {
  name: string;
  size: number;
  hash: string;
  hashMethod: string;
  fileData: string;
}

export interface DuplicateFileMatch<T> {
  record: T;
  strength: string;
  reason: string;
}

export interface ReadImportFileResult {
  sourceType: string;
  importFile: ImportFileInfo;
  scheduleName: string;
  duplicateMatches: DuplicateFileMatch<PCCSchedule>[];
  needsManualMapping: boolean;
  headers: string[] | null;
  rawRows: any[][] | null;
  columnMapping: { [colIndex: number]: string | undefined } | null;
  parsed: ParsedScheduleImport | null;
}

export interface ScheduleExportInput {
  schedule: PCCSchedule;
  wbsItems: PCCWbsItem[];
  activities: PCCActivity[];
  relationships: PCCRelationship[];
  calendar: PCCCalendar | null;
}

export interface BaselineSnapshotActivity {
  id: string;
  external_id?: string | null;
  name?: string;
  activity_type?: string;
  wbs_id?: string | null;
  duration?: number | null;
  planned_start?: string | null;
  planned_finish?: string | null;
  early_start?: string | null;
  early_finish?: string | null;
  late_start?: string | null;
  late_finish?: string | null;
  total_float?: number | null;
  calendar_id?: string | null;
  constraint_type?: string;
  constraint_date?: string;
}

export interface BaselineSnapshot {
  schedule_id: string;
  schedule_name?: string;
  schedule_revision_number?: number;
  data_date?: string;
  captured_at: string;
  wbs: { id: string; code?: string; name?: string; parent_wbs_id?: string | null; level?: number }[];
  activities: BaselineSnapshotActivity[];
  relationships: { predecessor_id?: string; successor_id?: string; type?: string; lag?: number }[];
  calendars: { id: string; name?: string; working_days?: boolean[]; holidays?: string[] }[];
}

export interface BaselineActivityDateInfo {
  start: string | null;
  finish: string | null;
  source: string | null;
  duration?: number | null;
  total_float?: number | null;
  is_critical: boolean | null;
}

export interface BaselineActivityMatch {
  id: string;
  external_id?: string | null;
  name?: string;
  baseline: BaselineActivityDateInfo;
  current: BaselineActivityDateInfo;
  comparable: boolean;
  mixed_date_sources: boolean;
  start_variance_days: number | null;
  finish_variance_days: number;
  duration_variance_days: number | null;
  criticality_changed: boolean;
  calendar_changed: boolean;
  constraint_changed: boolean;
}

export interface BaselineAddedRemovedActivity {
  id: string;
  external_id?: string | null;
  name?: string;
}

export interface BaselineComparisonResult {
  schedule_id: string;
  baseline_captured_at?: string;
  activities: {
    matched: BaselineActivityMatch[];
    added: BaselineAddedRemovedActivity[];
    removed: BaselineAddedRemovedActivity[];
  };
  relationship_changes: { added: number; removed: number };
  calendar_changes: {
    added: { id: string; name?: string }[];
    removed: { id: string; name?: string }[];
    modified_count: number;
    modified_names: string[];
  };
  critical_path_changes: {
    entered: { id: string; name?: string }[];
    left: { id: string; name?: string }[];
    stable_count: number;
    changed: boolean;
  };
  summary: {
    activity_count_baseline: number;
    activity_count_current: number;
    matched_count: number;
    added_count: number;
    removed_count: number;
    not_comparable_count: number;
    delayed_count: number;
    ahead_count: number;
    on_time_count: number;
    max_delay_days: number;
    baseline_overall_finish: string | null;
    current_overall_finish: string | null;
    project_finish_variance_days: number | null;
    calendar_changed_count: number;
    constraint_changed_count: number;
  };
}

export interface DelayActivityImpact {
  link_id?: string;
  activity_id: string;
  activity_name?: string;
  activity_type?: string;
  wbs_id?: string | null;
  status?: string;
  original_planned_start?: string;
  original_planned_finish?: string;
  original_total_float?: number | null;
  current_start?: string;
  current_finish?: string;
  forecast_start?: string;
  forecast_finish?: string;
  duration?: number | null;
  remaining_duration?: number | null;
  percent_complete?: number;
  current_total_float?: number | null;
  float_consumed?: number | null;
  finish_slippage_days?: number | null;
  criticality?: string | null;
  is_out_of_sequence?: boolean;
  cpm_calculated?: boolean;
}

export interface DelayImpactResult {
  per_activity: DelayActivityImpact[];
  overall_criticality: string | null;
  min_float_consumed?: number | null;
  max_float_consumed?: number | null;
  milestone_impact: DelayActivityImpact | null;
  any_schedule_calculated: boolean;
}

export interface ProjectFinishImpactResult {
  available: boolean;
  reason?: string;
  project_finish?: string | null;
  planned_project_finish?: string | null;
  project_impact_days?: number | null;
}

export interface RecoveryForecastResult {
  available: boolean;
  original_finish?: string | null;
  delay_forecast?: string | null;
  recovery_forecast?: string | null;
  latest_forecast?: string | null;
  actual_finish?: string | null;
  active_recovery_days_planned?: number;
}

declare global {
  interface Window {
    XLSX: any;
    mammoth: any;
    pdfjsLib: any;
    ExcelJS: any;
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
        newProject(prefill: Partial<PCCProject>): PCCProject;
        PROJECT_STATUSES: string[];
        PROJECT_TEMPLATES: PCCProjectTemplate[];
        newProjectDocumentRequirement(values: Partial<PCCProjectDocumentRequirement>): PCCProjectDocumentRequirement;
        newVendor(prefill: Partial<PCCVendor>): PCCVendor;
        nextVendorCode(existing: PCCVendor[]): string;
        VENDOR_STATUSES: string[];
        VENDOR_DOCUMENT_CATEGORIES: string[];
        VENDOR_PROJECT_CONTRACT_STATUSES: string[];
        newVendorContact(overrides: Partial<PCCVendorContact>): PCCVendorContact;
        newVendorProjectLink(overrides: Partial<PCCVendorProjectLink>): PCCVendorProjectLink;
        newVendorDocument(overrides: Partial<PCCVendorDocument>): PCCVendorDocument;
        newVendorMeetingLink(overrides: Partial<PCCVendorMeetingLink>): PCCVendorMeetingLink;
        newVendorRfiLink(overrides: Partial<PCCVendorRfiLink>): PCCVendorRfiLink;
        newVendorRiskLink(overrides: Partial<PCCVendorRiskLink>): PCCVendorRiskLink;
        newVendorPerformance(overrides: Partial<PCCVendorPerformance>): PCCVendorPerformance;
        newVendorNote(overrides: Partial<PCCVendorNote>): PCCVendorNote;
        newDocument(values: Partial<PCCDocument>): PCCDocument;
        DOCUMENT_CATEGORIES: string[];
        DOCUMENT_STATUSES: string[];
        newExecutiveSummary(overrides: Partial<PCCExecutiveSummary>): PCCExecutiveSummary;
        newSchedulePerformanceSnapshot(overrides: Partial<PCCSchedulePerformanceSnapshot>): PCCSchedulePerformanceSnapshot;
        newWeeklyReview(overrides: Partial<PCCWeeklyReview>): PCCWeeklyReview;
        newSchedule(overrides: Partial<PCCSchedule>): PCCSchedule;
        newWbsItem(overrides: Partial<PCCWbsItem>): PCCWbsItem;
        newActivity(overrides: Partial<PCCActivity>): PCCActivity;
        newRelationship(overrides: Partial<PCCRelationship>): PCCRelationship;
        newCalendar(overrides?: Partial<PCCCalendar>): PCCCalendar;
        newScheduleBaseline(overrides: Partial<PCCScheduleBaseline>): PCCScheduleBaseline;
        newRecoveryAction(overrides: Partial<PCCRecoveryAction>): PCCRecoveryAction;
        SCHEDULE_STATUSES: string[];
        ACTIVITY_TYPES: string[];
        ACTIVITY_STATUSES: string[];
        RELATIONSHIP_TYPES: string[];
        CALCULATION_MODES: string[];
        SCHEDULE_TYPES: string[];
        RECOVERY_ACTION_STATUSES: string[];
        MITIGATION_TYPES: string[];
      };
      pendingProjectPrefill?: { company_id?: string; client_id?: string };
      delayImpactEngine: {
        computeDelayImpact(delayRecord: PCCDelayRecord, links: PCCDelayActivityLink[], data: PCCStoreData): DelayImpactResult;
        computeProjectFinishImpact(scheduleId: string, data: PCCStoreData): ProjectFinishImpactResult;
        computeRecoveryForecast(
          delayRecord: PCCDelayRecord,
          links: PCCDelayActivityLink[],
          recoveryActions: PCCRecoveryAction[],
          data: PCCStoreData
        ): RecoveryForecastResult;
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
        exportProject(project: PCCProject, documents: PCCDocument[]): void;
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
        isPinned(projectId: string): boolean;
        togglePin(projectId: string): void;
      };
      router: {
        go(routeName: string): void;
        render(): void;
        currentRouteName(): string;
      };
      schedule: {
        viewActivity(projectId: string, scheduleId: string, activityId: string): void;
        viewBaselines(projectId: string, scheduleId: string): void;
      };
      meetings: {
        expandMeeting(meetingId: string): void;
        filterByProject?(projectId: string): void;
      };
      rfis: {
        expandRfi(rfiId: string): void;
        createFromMeeting?(projectId: string, meetingId: string): void;
        filterByProject?(projectId: string): void;
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
        filterByProject?(projectId: string): void;
      };
      lessonsLearned?: {
        createFromMeeting?(projectId: string, meetingId: string): void;
      };
      cost?: {
        projectCostSummary(data: PCCStoreData, projectId: string): PCCProjectCostSummary;
        filterByProject?(projectId: string): void;
      };
      costEvmEngine: {
        computeEvm(
          budgetItems: PCCCostBudgetItem[],
          actuals: PCCCostActual[],
          activities: PCCActivity[],
          schedules: PCCSchedule[],
          options: { bac: number }
        ): PCCProjectEvm;
        computeEarnedSchedule(
          budgetItems: PCCCostBudgetItem[],
          activities: PCCActivity[],
          options: { ev: number | null; dataDate: string | null }
        ): { insufficientData: boolean; spiT?: number | null; scheduleVarianceDays?: number | null; earnedScheduleDays?: number | null; actualTimeDays?: number | null };
      };
      scheduleGanttLayout: {
        addDays(isoDateStr: string, days: number): string;
        diffDays(fromIso: string, toIso: string): number;
        computeLayout(activities: PCCActivity[], options: { dataDate?: string | null }): GanttLayout;
        daysFromPixelDelta(deltaPx: number, pxPerDay: number): number;
        moveDates(startIso: string, finishIso: string, dayDelta: number): GanttDragResult;
        resizeFinish(startIso: string, finishIso: string, dayDelta: number): GanttDragResult;
        visibleRowRange(totalRows: number, scrollTop: number, viewportHeight: number, rowHeight: number, headerHeight: number, bufferRows: number): VisibleRowRange;
      };
      scheduleBaselineEngine: {
        buildSnapshot(schedule: PCCSchedule, wbsItems: PCCWbsItem[], activities: PCCActivity[], relationships: PCCRelationship[], calendars: PCCCalendar[]): BaselineSnapshot;
        compareBaselineToCurrent(
          snapshot: BaselineSnapshot,
          currentWbsItems: PCCWbsItem[],
          currentActivities: PCCActivity[],
          currentRelationships: PCCRelationship[],
          currentCalendars: PCCCalendar[]
        ): BaselineComparisonResult;
        overallFinish(activityList: BaselineSnapshotActivity[]): string | null;
      };
      scheduleBaselineStore: {
        putSnapshot(id: string, snapshot: BaselineSnapshot): Promise<void>;
        getSnapshot(id: string): Promise<BaselineSnapshot | null>;
        deleteSnapshot(id: string): Promise<void>;
      };
      scheduleImportService: {
        parseRows(headers: any[], rows: any[][], columnMapping?: { [colIndex: number]: string | undefined }): ParsedScheduleImport;
        CANONICAL_HEADERS: CanonicalHeaderField[];
        autoDetectColumnMapping(headers: any[]): { [colIndex: number]: string | undefined };
      };
      mspXmlService: {
        parseMspXml(xmlText: string): ParsedScheduleImport;
        exportScheduleToMspXml(input: ScheduleExportInput): string;
      };
      p6XerService: {
        parseXer(xerText: string): ParsedScheduleImport;
        exportScheduleToXer(input: ScheduleExportInput): string;
      };
      files?: {
        filterByProject(projectId: string): void;
        open?(doc: PCCDocument): void;
        createFromMeeting?(projectId: string, meetingId: string): void;
        latestOnly(documents: PCCDocument[]): PCCDocument[];
        summary(extraction: PCCDocumentExtraction): string;
        categoryLabel(category: string | undefined): string;
      };
      documents?: {
        expandDocument(documentId: string): void;
      };
      decisionRegister: {
        expandDecision(decisionId: string): void;
        createFromMeeting?(projectId: string, meetingId: string): void;
      };
      vendors: {
        openProfile(vendorId: string, tab?: string): void;
        filterByProject?(projectId: string): void;
      };
      risks: {
        expandRisk(riskId: string): void;
        createFromMeeting?(projectId: string, meetingId: string): void;
        filterByProject?(projectId: string): void;
      };
      resources?: {
        filterByProject(projectId: string): void;
        expandAssignment?(assignmentId: string): void;
      };
      dailyLog?: {
        filterByProject(projectId: string): void;
        expandLog?(logId: string): void;
      };
      commitments?: {
        filterByProject(projectId: string): void;
        expandCommitment?(commitmentId: string): void;
      };
      projectWorkspace?: {
        viewProject(projectId: string): void;
      };
      documentTypes?: {
        activeTypes(): PCCDocumentType[];
      };
      duplicateService: {
        fingerprintFile(buffer: ArrayBuffer, filename: string, size: number): Promise<{ hash: string; method: string }>;
        findFileDuplicates<T>(
          records: T[],
          candidate: { hash: string; method?: string; filename: string; size: number; projectId?: string },
          options?: { fields?: { hash?: string; method?: string; filename?: string; size?: string; projectId?: string }; sameProjectOnly?: boolean }
        ): DuplicateFileMatch<T>[];
        newGroupId(): string;
      };
      documentNomenclatureEngine: {
        checkFilename(
          pattern: string,
          filename: string,
          tokens: { [token: string]: string | undefined }
        ): { matches: boolean; expected: string; stem: string };
      };
      projectHealthEngine: {
        computeHealthScore(context: any, weights: PCCHealthScoreWeights): HealthScoreResult;
        computeDiagnostics(context: any): DiagnosticAlert[];
        ragFromScore(score: number | null): string;
      };
      schedulePerformanceEngine: {
        computeSchedulePerformanceScore(ctx: any): SchedulePerformanceResult;
      };
      scheduleCpmEngine: {
        calculateSchedule(activities: PCCActivity[], relationships: PCCRelationship[], options: any): CpmResult;
      };
      executiveCenter: {
        viewProject(projectId: string, tab?: string): void;
        getSchedulePerformanceSummary?(projectId: string): ExecutiveCenterSchedulePerformanceSummary;
        getDelayImpactSummary?(projectId: string): { openDelayCount: number; criticalDelayCount: number };
        getDiagnostics?(projectId: string): DiagnosticAlert[];
        getHealthSummary?(projectId: string): ExecutiveCenterHealthSummary;
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
