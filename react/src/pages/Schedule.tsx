import React, { useState } from "react";
import {
  SCHEDULE_STATUS_LABELS,
  SCHEDULE_TYPE_LABELS,
  SCHEDULE_PLATFORM_LABELS,
  CALC_MODE_LABELS,
  WEEKDAY_LABELS,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_STATUS_LABELS,
  PRIORITY_LABELS,
  ACTIVITY_FIELD_CONFIG,
  ACTIVITY_GRID_COLUMNS,
  getData,
  fmtMoney,
  projectName,
  wbsName,
  activityName,
  saveSchedule,
  captureBaseline,
  isCpmStale,
  runCalculation,
  computeWbsLevel,
  indentWbsItem,
  outdentWbsItem,
  saveWbsItem,
  deleteWbsItem,
  wouldCreateRelationshipCycle,
  saveRelationship,
  deleteRelationship,
  formatWorkingDays,
  saveCalendar,
  setDefaultCalendar,
  deleteCalendar,
  setProjectContext,
  getProjectContext,
  activityMatchesActivitiesTabFilter,
  sortActivitiesForGrid,
  saveActivity,
  clonePrefillFrom,
  bulkShiftActivities,
  deleteActivityWithConfirm,
  commitInlineActivityEdit,
  addDaysIso,
  getExcelGridFields,
  getImportMappingTargets,
  readImportFile,
  applyColumnMappingAndReview,
  commitImport,
  exportMspXml,
  exportP6Xer,
  buildExcelEditorRows,
  reviewExcelEdits,
  applyExcelEdits,
  GANTT_ZOOM_LABELS,
  truncateLabel,
  ganttPxPerDay,
  ganttTickIntervalDays,
  formatAxisDate,
  todayIso,
  activityMatchesGanttFilter,
  matchKeyFor,
  loadBaselineOverlay,
  computeGanttLayout,
  commitGanttDrag,
  activityNotReady,
  computeRequirementStatus,
  REQUIREMENT_STATUS_BADGE,
  getLinkedRecords,
  recoveryActionOverdue,
  saveRecoveryAction,
  deleteRecoveryAction,
  computeDelayImpact,
  computeProjectFinishImpact,
  computeRecoveryForecast,
  deriveDelayStatusLabel,
  activityScheduleId,
  describeRelatedRecords,
  saveDelayRecord,
  deleteDelayRecord,
  linkDelayActivity,
  delayRecoveryGap,
  DELAY_CAUSE_LABELS,
  DELAY_STATUS_LABELS,
  DELAY_STATUS_BADGE_CLASS,
  DELAY_CATEGORY_LABELS,
  DELAY_RESPONSIBILITY_LABELS,
  DELAY_CRITICALITY_LABELS,
  MITIGATION_TYPE_LABELS,
  RECOVERY_ACTION_STATUS_LABELS,
  runBaselineComparison,
  renameBaseline,
  toggleOfficialBaseline,
  deleteBaseline,
  runWhatIf,
  ActivityFieldConfig,
  ActivitiesTabFilter,
  GanttFilter,
  ExcelEditorRow,
  LinkedRecordRow,
  WhatIfResult,
} from "../services/scheduleService";
import type {
  PCCStoreData,
  PCCSchedule,
  PCCWbsItem,
  PCCActivity,
  PCCRelationship,
  PCCCalendar,
  PCCVendor,
  PCCScheduleBaseline,
  PCCRecoveryAction,
  PCCDelayRecord,
  PCCDelayActivityLink,
  GanttLayout,
  GanttLayoutRow,
  BaselineSnapshotActivity,
  BaselineComparisonResult,
  ParsedScheduleImport,
  ReadImportFileResult,
  DuplicateFileMatch,
  ImportFileInfo,
  DelayActivityImpact,
} from "../types/pcc";

interface ScheduleFormProps {
  schedule: PCCSchedule;
  isNew: boolean;
  projectId: string;
  onDone: (newId: string | null) => void;
}

interface ScheduleBarProps {
  data: PCCStoreData;
  projectId: string;
  scheduleId: string;
  onProjectChange: (id: string) => void;
  onScheduleChange: (id: string) => void;
  onEditSchedule: () => void;
  onNewSchedule: () => void;
  onOpenImport: () => void;
  onOpenExcelEditor: (schedule: PCCSchedule | undefined) => void;
  onExportMsp: (schedule: PCCSchedule | undefined) => void;
  onExportXer: (schedule: PCCSchedule | undefined) => void;
  onCalculate: () => void;
  baselineSaving: boolean;
  onSaveBaseline: () => void;
}

interface WbsFormProps {
  wbsItem: PCCWbsItem;
  isNew: boolean;
  wbsItems: PCCWbsItem[];
  projectId: string;
  scheduleId: string;
  onDone: () => void;
}

interface WbsTabProps {
  data: PCCStoreData;
  projectId: string;
  scheduleId: string;
  refresh: () => void;
}

interface RelationshipFormProps {
  relationship: PCCRelationship;
  isNew: boolean;
  activities: PCCActivity[];
  scheduleId: string;
  onDone: () => void;
}

interface RelationshipsTabProps {
  data: PCCStoreData;
  scheduleId: string;
  initialPrefillPredecessorId: string | null;
  refresh: () => void;
}

interface CalendarFormProps {
  calendar: PCCCalendar;
  isNew: boolean;
  projectId: string;
  onDone: () => void;
}

interface CalendarsTabProps {
  data: PCCStoreData;
  projectId: string;
  refresh: () => void;
}

interface ActivityFieldProps {
  cfg: ActivityFieldConfig;
  value: any;
  onChange: (v: string) => void;
}

interface ActivityFormProps {
  activity: PCCActivity;
  isNew: boolean;
  wbsItems: PCCWbsItem[];
  vendors: PCCVendor[];
  calendars: PCCCalendar[];
  projectId: string;
  scheduleId: string;
  onDone: () => void;
}

interface ActivityRowMenuProps {
  activity: PCCActivity;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}

interface ActivityMobileCardProps {
  a: PCCActivity;
  wbsItems: PCCWbsItem[];
  selected: boolean;
  onToggleSelect: () => void;
  rowMenuOpen: boolean;
  onToggleRowMenu: () => void;
  onCloseRowMenu: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}

interface InlineEditCellProps {
  editing: boolean;
  onBegin: () => void;
  display: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

interface ActivityRowProps {
  a: PCCActivity;
  wbsItems: PCCWbsItem[];
  visibleColumns: { [key: string]: boolean };
  selected: boolean;
  onToggleSelect: () => void;
  inlineEdit: { activityId: string | null; field: string | null };
  onBeginInline: (field: string) => void;
  onEndInline: () => void;
  rowMenuOpen: boolean;
  onToggleRowMenu: () => void;
  onCloseRowMenu: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}

interface ActivitiesTabProps {
  data: PCCStoreData;
  projectId: string;
  scheduleId: string;
  initialActivityTypeHint: string | null;
  initialEditingActivityId: string | null;
  refresh: () => void;
}

interface ParsedIssuesToggleProps {
  parsed: ParsedScheduleImport;
}

interface ImportPanelProps {
  data: PCCStoreData;
  projectId: string;
  onDone: () => void;
  onImported: (scheduleId: string) => void;
}

interface ExcelCellControlProps {
  rowIndex: number;
  field: { key: string; label: string };
  value: string;
  onChange: (v: string) => void;
}

interface ExcelEditorPanelProps {
  schedule: PCCSchedule;
  data: PCCStoreData;
  onDone: () => void;
}

interface GanttRowProps {
  row: GanttLayoutRow;
  activity: PCCActivity | undefined;
  y: number;
  rowHeight: number;
  chartWidth: number;
  pxPerDay: number;
  xForDate: (iso: string) => number;
  baselineRow: GanttLayoutRow | undefined;
  notReady: boolean;
  scheduleId: string;
  onOpenDetail: (id: string) => void;
  onCommitted: () => void;
}

interface GanttToolbarProps {
  data: PCCStoreData;
  projectId: string;
  allActivities: PCCActivity[];
  wbsItems: PCCWbsItem[];
  filter: GanttFilter;
  setFilter: React.Dispatch<React.SetStateAction<GanttFilter>>;
  zoom: string;
  setZoom: (z: string) => void;
  onAddActivity: () => void;
  onAddMilestone: () => void;
  showBaseline: boolean;
  baselineId: string;
  baselineLoading: boolean;
  onToggleBaseline: (checked: boolean, projectBaselines: PCCScheduleBaseline[]) => void;
  onChangeBaselineId: (id: string) => void;
}

interface GanttBaselineSnapshot {
  baselineId: string;
  activities: BaselineSnapshotActivity[];
}

interface GanttChartProps {
  data: PCCStoreData;
  schedule: PCCSchedule | undefined;
  allActivities: PCCActivity[];
  wbsItems: PCCWbsItem[];
  filter: GanttFilter;
  zoom: string;
  showBaseline: boolean;
  baselineSnapshot: GanttBaselineSnapshot | null;
  baselineId: string;
  scheduleId: string;
  onOpenDetail: (id: string) => void;
  refresh: () => void;
  detailPanel: React.ReactNode;
}

interface GanttTabProps {
  data: PCCStoreData;
  projectId: string;
  scheduleId: string;
  initialDetailActivityId: string | null;
  onSwitchToActivities: (typeHint: string | null) => void;
  onEditActivity: (id: string) => void;
  onAddRelationship: (id: string) => void;
  refresh: () => void;
}

interface ActivityDataProps {
  activity: PCCActivity;
  data: PCCStoreData;
}

interface RecoveryActionFormProps {
  editing: PCCRecoveryAction;
  isNew: boolean;
  activity: PCCActivity;
  data: PCCStoreData;
  onDone: () => void;
}

interface RecoveryActionsSectionProps {
  activity: PCCActivity;
  data: PCCStoreData;
  refresh: () => void;
}

interface ImpactSummaryRowProps {
  label: string;
  value: React.ReactNode;
  colorVar?: string | null;
}

interface DelayScheduleImpactProps {
  delayRecord: PCCDelayRecord;
  links: PCCDelayActivityLink[];
  data: PCCStoreData;
  scheduleId: string;
}

interface RecoveryForecastProgressionProps {
  delayRecord: PCCDelayRecord;
  links: PCCDelayActivityLink[];
  data: PCCStoreData;
}

interface DelayTimelineProps {
  delayRecord: PCCDelayRecord;
}

interface DelayLinkActivityPickerProps {
  delayRecord: PCCDelayRecord;
  links: PCCDelayActivityLink[];
  data: PCCStoreData;
  scheduleId: string;
  refresh: () => void;
}

interface RecordLinkFieldProps {
  id: string;
  label: string;
  records: any[];
  labelFn: (r: any) => string;
  value: string;
  onChange: (v: string) => void;
}

interface DelayRecordFormProps {
  editing: PCCDelayRecord;
  isNew: boolean;
  activity: PCCActivity;
  data: PCCStoreData;
  onDone: () => void;
}

interface DelayRecordsSectionProps {
  activity: PCCActivity;
  data: PCCStoreData;
  scheduleId: string;
  refresh: () => void;
}

interface ActivityDetailPanelProps {
  activity: PCCActivity;
  data: PCCStoreData;
  wbsItems: PCCWbsItem[];
  scheduleActivities: PCCActivity[];
  relationships: PCCRelationship[];
  scheduleId: string;
  onClose: () => void;
  onEditActivity: (id: string) => void;
  onAddRelationship: (id: string) => void;
  refresh: () => void;
}

interface BaselineCompareResultProps {
  result: BaselineComparisonResult;
  currentScheduleName: string;
}

interface BaselineRowProps {
  b: PCCScheduleBaseline;
  scheduleId: string;
  refresh: () => void;
}

interface BaselinesTabProps {
  data: PCCStoreData;
  projectId: string;
  scheduleId: string;
  refresh: () => void;
}

interface WhatIfTabProps {
  data: PCCStoreData;
  scheduleId: string;
}

interface SchedulePageProps {
  initialProjectId?: string;
  initialScheduleId?: string;
  initialTab?: string;
  initialGanttDetailActivityId?: string;
}

// ===== Schedule create/edit form =====

function ScheduleForm({ schedule, isNew, projectId, onDone }: ScheduleFormProps) {
  const [name, setName] = useState(schedule.name || "");
  const [revisionNumber, setRevisionNumber] = useState<number | string>(schedule.revision_number || 0);
  const [version, setVersion] = useState(schedule.version || "");
  const [dataDate, setDataDate] = useState(schedule.data_date || "");
  const [nearCriticalThresholdDays, setNearCriticalThresholdDays] = useState<number | string>(schedule.near_critical_threshold_days || 0);
  const [calculationMode, setCalculationMode] = useState(schedule.calculation_mode || "progress_override");
  const [calendarAware, setCalendarAware] = useState(!!schedule.calendar_aware);
  const [constraintsEnabled, setConstraintsEnabled] = useState(!!schedule.constraints_enabled);
  const [status, setStatus] = useState(schedule.status || "draft");
  const [scheduleType, setScheduleType] = useState(schedule.schedule_type || "current");
  const [scheduleOwner, setScheduleOwner] = useState(schedule.schedule_owner || "");
  const [description, setDescription] = useState(schedule.description || "");
  const [error, setError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setError(false);
    const newId = saveSchedule(isNew, schedule.id, projectId, {
      name: trimmed,
      revision_number: Number(revisionNumber) || 0,
      version: version,
      data_date: dataDate,
      near_critical_threshold_days: Number(nearCriticalThresholdDays) || 0,
      calculation_mode: calculationMode,
      calendar_aware: calendarAware,
      constraints_enabled: constraintsEnabled,
      status: status,
      schedule_type: scheduleType,
      schedule_owner: scheduleOwner,
      description: description,
    });
    onDone(newId);
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "New Schedule" : "Edit Schedule"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="schedfield-name">Schedule Name *</label>
            <input id="schedfield-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="schedfield-revision_number">Revision Number</label>
            <input id="schedfield-revision_number" type="number" value={revisionNumber} onChange={(e) => setRevisionNumber(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="schedfield-version">Version</label>
            <input id="schedfield-version" type="text" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="schedfield-data_date">Data Date</label>
            <input id="schedfield-data_date" type="date" value={dataDate} onChange={(e) => setDataDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="schedfield-near_critical_threshold_days">Near-Critical Threshold (days)</label>
            <input id="schedfield-near_critical_threshold_days" type="number" value={nearCriticalThresholdDays} onChange={(e) => setNearCriticalThresholdDays(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="schedfield-calculation_mode">Out-of-Sequence Calculation Mode</label>
            <select id="schedfield-calculation_mode" value={calculationMode} onChange={(e) => setCalculationMode(e.target.value)}>
              {window.PCC.store.CALCULATION_MODES.map((m) => (
                <option key={m} value={m}>
                  {CALC_MODE_LABELS[m] || m}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <input id="schedfield-calendar_aware" type="checkbox" checked={calendarAware} onChange={(e) => setCalendarAware(e.target.checked)} />
              Calendar-Aware Calculation (respect working days/holidays)
            </label>
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <input id="schedfield-constraints_enabled" type="checkbox" checked={constraintsEnabled} onChange={(e) => setConstraintsEnabled(e.target.checked)} />
              Honor Date Constraints (Must Start On, Start No Earlier Than, etc. from import)
            </label>
          </div>
          <div className="field">
            <label htmlFor="schedfield-status">Status</label>
            <select id="schedfield-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {window.PCC.store.SCHEDULE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SCHEDULE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedfield-schedule_type">Schedule Type</label>
            <select id="schedfield-schedule_type" value={scheduleType} onChange={(e) => setScheduleType(e.target.value)}>
              {window.PCC.store.SCHEDULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SCHEDULE_TYPE_LABELS[t] || t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedfield-owner">Schedule Owner</label>
            <input id="schedfield-owner" type="text" value={scheduleOwner} onChange={(e) => setScheduleOwner(e.target.value)} />
          </div>
          {!isNew && schedule.source_platform ? (
            <div className="field">
              <label>Source</label>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                {(SCHEDULE_PLATFORM_LABELS[schedule.source_platform] || schedule.source_platform) +
                  (schedule.source_format ? " (." + schedule.source_format + ")" : "") +
                  " — where this schedule's data came from; not editable."}
              </p>
            </div>
          ) : null}
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="schedfield-description">Description</label>
            <textarea id="schedfield-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        {error ? (
          <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>Schedule name is required.</p>
        ) : null}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Create Schedule" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onDone(null)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ===== Schedule picker bar =====

function ScheduleBar({
  data,
  projectId,
  scheduleId,
  onProjectChange,
  onScheduleChange,
  onEditSchedule,
  onNewSchedule,
  onOpenImport,
  onOpenExcelEditor,
  onExportMsp,
  onExportXer,
  onCalculate,
  baselineSaving,
  onSaveBaseline,
}: ScheduleBarProps) {
  const activeProjects = data.projects.filter((p) => !p.archived);
  const projectSchedules = data.schedules.filter((s) => s.project_id === projectId);
  const currentSchedule = data.schedules.find((s) => s.id === scheduleId);
  const activityCount = data.activities.filter((a) => a.schedule_id === scheduleId).length;

  return (
    <div className="toolbar focus-mode-hide">
      {activeProjects.length === 0 ? (
        <select aria-label="Select project" disabled>
          <option value="">No projects yet — add one in Portfolio first</option>
        </select>
      ) : (
        <select aria-label="Select project" value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "(unnamed project)"}
            </option>
          ))}
        </select>
      )}

      {projectSchedules.length === 0 ? (
        <select aria-label="Select schedule" disabled>
          <option value="">No schedules yet</option>
        </select>
      ) : (
        <select aria-label="Select schedule" value={scheduleId} onChange={(e) => onScheduleChange(e.target.value)}>
          {projectSchedules.map((s) => {
            const typeSuffix = s.schedule_type && s.schedule_type !== "current" ? ", " + (SCHEDULE_TYPE_LABELS[s.schedule_type] || s.schedule_type) : "";
            return (
              <option key={s.id} value={s.id}>
                {s.name + " (Rev " + s.revision_number + typeSuffix + ")"}
              </option>
            );
          })}
        </select>
      )}

      <div className="toolbar__spacer" />

      <button className="btn btn--ghost" disabled={!scheduleId} onClick={onEditSchedule}>
        Edit Schedule
      </button>
      <button className="btn btn--primary" disabled={activeProjects.length === 0} onClick={onNewSchedule}>
        + New Schedule
      </button>
      <button className="btn btn--ghost" disabled={activeProjects.length === 0} onClick={onOpenImport}>
        Import Schedule
      </button>
      <button
        className="btn btn--ghost"
        title={currentSchedule && currentSchedule.source_platform !== "excel" ? "This schedule wasn't imported from an Excel file, so there's nothing to edit here." : ""}
        disabled={!currentSchedule || currentSchedule.source_platform !== "excel"}
        onClick={() => onOpenExcelEditor(currentSchedule)}
      >
        Edit Excel
      </button>
      <button className="btn btn--ghost" disabled={!currentSchedule} onClick={() => onExportMsp(currentSchedule)}>
        Export to MS Project
      </button>
      <button className="btn btn--ghost" disabled={!currentSchedule} onClick={() => onExportXer(currentSchedule)}>
        Export to Primavera P6
      </button>
      <button className="btn btn--ghost" disabled={!scheduleId} onClick={onCalculate}>
        Calculate Schedule
      </button>
      {currentSchedule && isCpmStale(currentSchedule, data) ? (
        <span
          className="text-secondary"
          style={{ color: "var(--status-at-risk)", fontSize: "12.5px", alignSelf: "center" }}
          title="Activities, dates, or relationships have changed since the critical path was last calculated."
        >
          ⚠ Critical path out of date
        </span>
      ) : null}
      <button className="btn btn--ghost" disabled={!scheduleId || baselineSaving || activityCount === 0} onClick={onSaveBaseline}>
        {baselineSaving ? "Saving Baseline…" : "Save Baseline"}
      </button>
    </div>
  );
}

// ===== WBS tab =====

function WbsForm({ wbsItem, isNew, wbsItems, projectId, scheduleId, onDone }: WbsFormProps) {
  const [code, setCode] = useState(wbsItem.code || "");
  const [name, setName] = useState(wbsItem.name || "");
  const [parentWbsId, setParentWbsId] = useState(wbsItem.parent_wbs_id || "");
  const [description, setDescription] = useState(wbsItem.description || "");
  const [error, setError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setError(false);
    saveWbsItem(isNew, wbsItem, wbsItems, projectId, scheduleId, {
      code: code,
      name: trimmed,
      parent_wbs_id: parentWbsId,
      description: description,
    });
    onDone();
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add WBS Item" : "Edit WBS Item"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="wbsfield-code">WBS Code</label>
            <input id="wbsfield-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="wbsfield-name">Name *</label>
            <input id="wbsfield-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="wbsfield-parent_id">Parent WBS</label>
            <select id="wbsfield-parent_id" value={parentWbsId} onChange={(e) => setParentWbsId(e.target.value)}>
              <option value="">(top level)</option>
              {wbsItems
                .filter((w) => w.id !== wbsItem.id)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code ? w.code + " — " + w.name : w.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="wbsfield-description">Description</label>
            <textarea id="wbsfield-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>WBS name is required.</p> : null}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add WBS Item" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function WbsTab({ data, projectId, scheduleId, refresh }: WbsTabProps) {
  const [editingWbsId, setEditingWbsId] = useState<string | null>(null);
  const wbsItems = data.wbs_items.filter((w) => w.schedule_id === scheduleId);

  let editingItem = null;
  if (editingWbsId) {
    editingItem = editingWbsId === "new" ? window.PCC.store.newWbsItem({}) : wbsItems.find((w) => w.id === editingWbsId);
  }

  const sorted = wbsItems.slice().sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return (a.code || "").localeCompare(b.code || "");
  });

  return (
    <React.Fragment>
      {editingItem ? (
        <WbsForm
          wbsItem={editingItem}
          isNew={editingWbsId === "new"}
          wbsItems={wbsItems}
          projectId={projectId}
          scheduleId={scheduleId}
          onDone={() => {
            setEditingWbsId(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar">
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" disabled={!scheduleId} onClick={() => setEditingWbsId("new")}>
          + Add WBS Item
        </button>
      </div>

      {wbsItems.length === 0 ? (
        <div className="panel empty-state">{scheduleId ? "No WBS items yet. Click “+ Add WBS Item” to add the first one." : "Create a schedule first."}</div>
      ) : (
        <div className="project-list">
          {sorted.map((w) => {
            const siblings = wbsItems
              .filter((x) => x.parent_wbs_id === w.parent_wbs_id)
              .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
            const myIndex = siblings.findIndex((x) => x.id === w.id);
            const prevSibling = myIndex > 0 ? siblings[myIndex - 1] : null;
            const currentParent = w.parent_wbs_id ? wbsItems.find((x) => x.id === w.parent_wbs_id) : null;

            return (
              <div key={w.id} className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginLeft: w.level * 20, marginBottom: "var(--space-2)" }}>
                <div>
                  <strong>{(w.code ? w.code + " — " : "") + w.name}</strong>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button
                    className="btn btn--ghost"
                    title={prevSibling ? "Nest under “" + (prevSibling.code ? prevSibling.code + " — " : "") + prevSibling.name + "”" : "No previous item at this level to nest under"}
                    disabled={!prevSibling}
                    onClick={() => {
                      indentWbsItem(w.id, prevSibling!.id);
                      window.PCC.notify("Indented under “" + (prevSibling!.code ? prevSibling!.code + " — " : "") + prevSibling!.name + "”.", "success");
                      refresh();
                    }}
                  >
                    → Indent
                  </button>
                  <button
                    className="btn btn--ghost"
                    title={currentParent ? "Promote to the same level as “" + (currentParent.code ? currentParent.code + " — " : "") + currentParent.name + "”" : "Already at the top level"}
                    disabled={!currentParent}
                    onClick={() => {
                      const newParentId = currentParent!.parent_wbs_id || null;
                      outdentWbsItem(w.id, newParentId);
                      window.PCC.notify("Outdented “" + w.name + "”.", "success");
                      refresh();
                    }}
                  >
                    ← Outdent
                  </button>
                  <button className="btn btn--ghost" onClick={() => setEditingWbsId(w.id)}>
                    Edit
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      if (deleteWbsItem(w, wbsItems, data.activities)) refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </React.Fragment>
  );
}

// ===== Relationships tab =====

function RelationshipForm({ relationship, isNew, activities, scheduleId, onDone }: RelationshipFormProps) {
  const [predecessorId, setPredecessorId] = useState(relationship.predecessor_id || activities[0].id);
  const [successorId, setSuccessorId] = useState(relationship.successor_id || activities[1].id);
  const [type, setType] = useState(relationship.type || "FS");
  const [lag, setLag] = useState<number | string>(relationship.lag || 0);
  const [error, setError] = useState("");

  if (activities.length < 2) {
    return (
      <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
        <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Relationship" : "Edit Relationship"}</h3>
        <p className="text-secondary">Add at least two activities to this schedule before creating a relationship.</p>
        <button className="btn btn--ghost" onClick={onDone}>
          Close
        </button>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = saveRelationship(isNew, relationship, scheduleId, {
      predecessor_id: predecessorId,
      successor_id: successorId,
      type: type,
      lag: Number(lag) || 0,
    });
    if (err) {
      setError(err);
      return;
    }
    setError("");
    onDone();
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Relationship" : "Edit Relationship"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="relfield-predecessor_id">Predecessor *</label>
            <select id="relfield-predecessor_id" value={predecessorId} onChange={(e) => setPredecessorId(e.target.value)}>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="relfield-successor_id">Successor *</label>
            <select id="relfield-successor_id" value={successorId} onChange={(e) => setSuccessorId(e.target.value)}>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="relfield-type">Relationship Type</label>
            <select id="relfield-type" value={type} onChange={(e) => setType(e.target.value)}>
              {window.PCC.store.RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t + " — " + { FS: "Finish-to-Start", SS: "Start-to-Start", FF: "Finish-to-Finish", SF: "Start-to-Finish" }[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="relfield-lag">Lag (days, negative = lead)</label>
            <input id="relfield-lag" type="number" value={lag} onChange={(e) => setLag(e.target.value)} />
          </div>
        </div>
        {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Relationship" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function RelationshipsTab({ data, scheduleId, initialPrefillPredecessorId, refresh }: RelationshipsTabProps) {
  // A prefill hand-off from the Activity Detail Panel's "+ Add Relationship" means
  // "open the new-relationship form already filled in" — not just arrive on this tab
  // with the value on standby, matching vanilla's own addRelBtn handler (which sets
  // editingRelationshipId = "new" directly, not just relationshipPrefillId).
  const [editingRelationshipId, setEditingRelationshipId] = useState(() => (initialPrefillPredecessorId ? "new" : null));
  const [prefillPredecessorId, setPrefillPredecessorId] = useState(() => initialPrefillPredecessorId || null);
  const activities = data.activities.filter((a) => a.schedule_id === scheduleId);
  const relationships = data.relationships.filter((r) => r.schedule_id === scheduleId);

  let editingItem = null;
  if (editingRelationshipId) {
    editingItem =
      editingRelationshipId === "new"
        ? window.PCC.store.newRelationship(prefillPredecessorId ? { predecessor_id: prefillPredecessorId } : {})
        : relationships.find((r) => r.id === editingRelationshipId);
  }

  return (
    <React.Fragment>
      {editingItem ? (
        <RelationshipForm
          relationship={editingItem}
          isNew={editingRelationshipId === "new"}
          activities={activities}
          scheduleId={scheduleId}
          onDone={() => {
            setEditingRelationshipId(null);
            setPrefillPredecessorId(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar">
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" disabled={activities.length < 2} onClick={() => setEditingRelationshipId("new")}>
          + Add Relationship
        </button>
      </div>

      {relationships.length === 0 ? (
        <div className="panel empty-state">
          {!scheduleId ? "Create a schedule first." : activities.length < 2 ? "Add at least two activities before creating relationships." : "No relationships yet."}
        </div>
      ) : (
        <div className="project-list">
          {relationships.map((r) => (
            <div key={r.id} className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <div>
                <strong>{activityName(activities, r.predecessor_id)}</strong> →{" "}
                <strong>{activityName(activities, r.successor_id)}</strong>
                <br />
                <span className="text-secondary" style={{ fontSize: 12 }}>
                  {r.type} · Lag: {r.lag} day(s)
                </span>
              </div>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  if (deleteRelationship(r)) refresh();
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

// ===== Calendars tab =====

function CalendarForm({ calendar, isNew, projectId, onDone }: CalendarFormProps) {
  const [name, setName] = useState(calendar.name || "");
  const [workingDays, setWorkingDays] = useState((calendar.working_days || []).slice());
  const [holidays, setHolidays] = useState((calendar.holidays || []).slice());
  const [newHoliday, setNewHoliday] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setError(false);
    saveCalendar(isNew, calendar, projectId, {
      name: trimmed,
      working_days: workingDays,
      holidays: holidays.slice(),
    });
    onDone();
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Calendar" : "Edit Calendar"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="calfield-name">Calendar Name *</label>
          <input id="calfield-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Working Days</label>
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <label key={label} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <input
                  id={"calfield-workingday-" + i}
                  type="checkbox"
                  checked={!!workingDays[i]}
                  onChange={(e) => {
                    const next = workingDays.slice();
                    next[i] = e.target.checked;
                    setWorkingDays(next);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Holidays</label>
          {holidays.length > 0 ? (
            <div style={{ marginBottom: "var(--space-2)" }}>
              {holidays.map((dateStr, idx) => (
                <div key={dateStr} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                  <span className="mono">{dateStr}</span>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      const next = holidays.slice();
                      next.splice(idx, 1);
                      setHolidays(next);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input id="calfield-new-holiday" type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} />
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (!newHoliday) return;
                if (holidays.indexOf(newHoliday) === -1) {
                  const next = holidays.concat([newHoliday]).sort();
                  setHolidays(next);
                }
                setNewHoliday("");
              }}
            >
              + Add Holiday
            </button>
          </div>
        </div>
        {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>Calendar name is required.</p> : null}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Calendar" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function CalendarsTab({ data, projectId, refresh }: CalendarsTabProps) {
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const calendars = data.calendars.filter((c) => c.project_id === projectId);

  let editingItem = null;
  if (editingCalendarId) {
    editingItem = editingCalendarId === "new" ? window.PCC.store.newCalendar() : calendars.find((c) => c.id === editingCalendarId);
  }

  return (
    <React.Fragment>
      {editingItem ? (
        <CalendarForm
          calendar={editingItem}
          isNew={editingCalendarId === "new"}
          projectId={projectId}
          onDone={() => {
            setEditingCalendarId(null);
            refresh();
          }}
        />
      ) : null}

      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
        Calendars belong to this project and apply across all its schedules. Assign one to an activity from its own Edit form; Calculate Schedule only respects them once “Calendar-Aware
        Calculation” is turned on in Schedule Settings.
      </p>

      <div className="toolbar">
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" onClick={() => setEditingCalendarId("new")}>
          + Add Calendar
        </button>
      </div>

      {calendars.length === 0 ? (
        <div className="panel empty-state">No calendars yet for this project.</div>
      ) : (
        <div className="project-list">
          {calendars.map((cal) => {
            const referencingCount = data.activities.filter((a) => a.calendar_id === cal.id).length;
            return (
              <div key={cal.id} className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                <div>
                  <strong>{cal.name}</strong>
                  {cal.is_default ? (
                    <span className="text-secondary" style={{ fontSize: 11, border: "1px solid var(--divider)", borderRadius: 4, padding: "1px 6px", marginLeft: 6 }}>
                      Default
                    </span>
                  ) : null}
                  <br />
                  <span className="text-secondary" style={{ fontSize: 12 }}>
                    {formatWorkingDays(cal.working_days)} · {(cal.holidays || []).length} holiday{(cal.holidays || []).length === 1 ? "" : "s"} · used by {referencingCount} activit
                    {referencingCount === 1 ? "y" : "ies"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  {!cal.is_default ? (
                    <button
                      className="btn btn--ghost"
                      onClick={() => {
                        setDefaultCalendar(cal.id, projectId);
                        refresh();
                      }}
                    >
                      Set as Default
                    </button>
                  ) : null}
                  <button className="btn btn--ghost" onClick={() => setEditingCalendarId(cal.id)}>
                    Edit
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      if (deleteCalendar(cal, referencingCount)) refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </React.Fragment>
  );
}

// ===== Activity form =====

function ActivityField({ cfg, value, onChange }: ActivityFieldProps) {
  const id = "actfield-" + cfg.key;
  if (cfg.type === "select") {
    const opts: string[] = cfg.options ? (window.PCC.store as any)[cfg.options] : cfg.staticOptions || [];
    return (
      <div className="field">
        <label htmlFor={id}>{cfg.label + (cfg.required ? " *" : "")}</label>
        <select id={id} value={value == null ? "" : value} onChange={(e) => onChange(e.target.value)}>
          {opts.map((val) => (
            <option key={val} value={val}>
              {(cfg.labels || {})[val] || val}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (cfg.type === "textarea") {
    return (
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor={id}>{cfg.label + (cfg.required ? " *" : "")}</label>
        <textarea id={id} rows={2} value={value || ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{cfg.label + (cfg.required ? " *" : "")}</label>
      <input
        id={id}
        type={cfg.type}
        min={cfg.key === "duration" ? "0" : undefined}
        value={value == null ? "" : value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ActivityForm({ activity, isNew, wbsItems, vendors, calendars, projectId, scheduleId, onDone }: ActivityFormProps) {
  const defaultCalendar = calendars.find((c) => c.is_default);
  const [wbsId, setWbsId] = useState(activity.wbs_id || "");
  const [vendorId, setVendorId] = useState(activity.vendor_id || "");
  const [calendarId, setCalendarId] = useState(activity.calendar_id || (isNew && defaultCalendar ? defaultCalendar.id : ""));
  const [fields, setFields] = useState<{ [key: string]: any }>(() => {
    const init: { [key: string]: any } = {};
    ACTIVITY_FIELD_CONFIG.forEach((cfg) => {
      init[cfg.key] = (activity as any)[cfg.key] == null ? "" : (activity as any)[cfg.key];
    });
    return init;
  });
  const [error, setError] = useState("");

  function setField(key: string, value: any) {
    setFields((prev) => Object.assign({}, prev, { [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = String(fields.name || "").trim();
    if (!name) {
      setError("Activity name is required.");
      return;
    }
    if (fields.duration !== "" && Number(fields.duration) < 0) {
      setError("Duration can't be negative.");
      return;
    }
    setError("");

    const values: any = { wbs_id: wbsId || null, vendor_id: vendorId || "", calendar_id: calendarId || null };
    ACTIVITY_FIELD_CONFIG.forEach((cfg) => {
      const raw = fields[cfg.key];
      values[cfg.key] = cfg.type === "number" ? (raw === "" ? null : Number(raw)) : raw;
    });
    values.name = name;

    saveActivity(isNew, activity, projectId, scheduleId, values);
    onDone();
  }

  let calcBox = null;
  if (!isNew) {
    if (activity.early_start == null) {
      calcBox = (
        <div className="panel text-secondary" style={{ padding: "var(--space-3)", marginTop: -4, marginBottom: "var(--space-3)", fontSize: "var(--text-sm)" }}>
          Early/Late Start/Finish, Total Float, and Free Float aren't calculated yet — use “Calculate Schedule” above.
        </div>
      );
    } else {
      const floatLabel = activity.total_float! <= 0 ? "Critical (0 float)" : activity.total_float + " day(s) float";
      const data = window.PCC.store.get();
      const scheduleForStaleCheck = data.schedules.find((s) => s.id === activity.schedule_id);
      const stale = isCpmStale(scheduleForStaleCheck, data);
      calcBox = (
        <div className="panel" style={{ padding: "var(--space-3)", marginTop: -4, marginBottom: "var(--space-3)", borderColor: stale ? "var(--status-at-risk)" : undefined }}>
          {stale ? (
            <strong style={{ color: "var(--status-at-risk)" }}>Calculated (out of date)</strong>
          ) : (
            <strong>Calculated (read-only)</strong>
          )}{" "}
          {stale ? "— changed since the last “Calculate Schedule” run; these numbers may no longer be correct. — " : "— "}
          {floatLabel}
          <br />
          <span className="text-secondary" style={{ fontSize: 12 }}>
            ES {activity.early_start} · EF {activity.early_finish} · LS {activity.late_start} · LF {activity.late_finish} · Free Float {activity.free_float} day(s)
          </span>
        </div>
      );
    }
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Activity" : "Edit Activity"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="actfield-wbs_id">WBS</label>
          <select id="actfield-wbs_id" value={wbsId} onChange={(e) => setWbsId(e.target.value)}>
            <option value="">(none)</option>
            {wbsItems.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code ? w.code + " — " + w.name : w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="actfield-vendor_id">Vendor</label>
          <select id="actfield-vendor_id" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">(none)</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor_name || "(unnamed vendor)"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="actfield-calendar_id">Calendar</label>
          <select id="actfield-calendar_id" value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
            <option value="">(none)</option>
            {calendars.map((cal) => (
              <option key={cal.id} value={cal.id}>
                {cal.name + (cal.is_default ? " (default)" : "")}
              </option>
            ))}
          </select>
        </div>
        <div className="form-grid">
          {ACTIVITY_FIELD_CONFIG.map((cfg) => (
            <ActivityField key={cfg.key} cfg={cfg} value={fields[cfg.key]} onChange={(v) => setField(cfg.key, v)} />
          ))}
        </div>
        {calcBox}
        {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Activity" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ===== Activities tab =====

function ActivityRowMenu({ activity, open, onToggle, onClose, onEdit, onClone, onDelete }: ActivityRowMenuProps) {
  return (
    <div className="card-menu">
      <button className="icon-btn" aria-label="More actions" onClick={onToggle}>
        ⋯
      </button>
      {open ? (
        <React.Fragment>
          <button className="card-menu__overlay" aria-label="Close menu" onClick={onClose} />
          <div className="card-menu__dropdown">
            <button className="card-menu__item" onClick={onEdit}>
              Edit
            </button>
            <button className="card-menu__item" onClick={onClone}>
              Clone
            </button>
            <button className="card-menu__item" onClick={onDelete}>
              Delete
            </button>
          </div>
        </React.Fragment>
      ) : null}
    </div>
  );
}

function ActivityMobileCard({ a, wbsItems, selected, onToggleSelect, rowMenuOpen, onToggleRowMenu, onCloseRowMenu, onEdit, onClone, onDelete }: ActivityMobileCardProps) {
  const metaBits = [wbsName(wbsItems, a.wbs_id), ACTIVITY_TYPE_LABELS[a.activity_type]];
  if (a.planned_start || a.planned_finish) metaBits.push((a.planned_start || "—") + " → " + (a.planned_finish || "—"));
  metaBits.push((a.percent_complete || 0) + "% complete");

  return (
    <div className="project-card">
      <input type="checkbox" className="project-card__select" aria-label="Select this activity for a bulk action" checked={selected} onChange={onToggleSelect} />
      <div className="project-card__main">
        <div className="project-card__name">
          {a.name || "(unnamed activity)"}
          {a.is_out_of_sequence ? " ⚠" : ""}
        </div>
        <div className="project-card__meta">{metaBits.join(" · ")}</div>
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <span className={"status-badge " + (a.status === "complete" ? "status-badge--complete" : a.status === "on_hold" ? "status-badge--at_risk" : "status-badge--info")}>
          {ACTIVITY_STATUS_LABELS[a.status || ""]}
        </span>
        {a.total_float != null ? (
          <span className={"status-badge " + (a.total_float <= 0 ? "status-badge--critical" : "status-badge--info")}>
            {a.total_float <= 0 ? "Critical" : a.total_float + "d float"}
          </span>
        ) : null}
      </div>
      <div className="project-card__actions">
        <ActivityRowMenu activity={a} open={rowMenuOpen} onToggle={onToggleRowMenu} onClose={onCloseRowMenu} onEdit={onEdit} onClone={onClone} onDelete={onDelete} />
      </div>
    </div>
  );
}

function InlineEditCell({ editing, onBegin, display, title, children }: InlineEditCellProps) {
  if (editing) return <td>{children}</td>;
  return (
    <td style={{ cursor: "pointer" }} title={title} onClick={onBegin}>
      {display}
    </td>
  );
}

function ActivityRow({ a, wbsItems, visibleColumns, selected, onToggleSelect, inlineEdit, onBeginInline, onEndInline, rowMenuOpen, onToggleRowMenu, onCloseRowMenu, onEdit, onClone, onDelete }: ActivityRowProps) {
  const isEditingField = (field: string) => inlineEdit.activityId === a.id && inlineEdit.field === field;
  const focusSelectRef = (el: HTMLInputElement | HTMLSelectElement | null) => {
    if (el) {
      el.focus();
      if ((el as HTMLInputElement).select) (el as HTMLInputElement).select();
    }
  };

  return (
    <tr>
      <td>
        {a.name || "(unnamed activity)"}
        {a.is_out_of_sequence ? (
          <span title="Out of sequence: this activity had actual progress recorded before its predecessor logic would have allowed it to start."> ⚠</span>
        ) : null}
      </td>
      <td>
        <input type="checkbox" aria-label="Select this activity for a bulk action" checked={selected} onChange={onToggleSelect} />
      </td>
      {visibleColumns.wbs ? <td>{wbsName(wbsItems, a.wbs_id)}</td> : null}
      {visibleColumns.type ? <td>{ACTIVITY_TYPE_LABELS[a.activity_type]}</td> : null}
      {visibleColumns.start ? (
        <InlineEditCell editing={isEditingField("start")} onBegin={() => onBeginInline("start")} display={a.planned_start || "—"} title="Click to change the start date">
          <input
            ref={focusSelectRef}
            type="date"
            defaultValue={a.planned_start || ""}
            onBlur={(e) => {
              if (!isEditingField("start")) return;
              commitInlineActivityEdit(a.id, { planned_start: e.target.value });
              onEndInline();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") onEndInline();
            }}
          />
        </InlineEditCell>
      ) : null}
      {visibleColumns.finish ? (
        <InlineEditCell editing={isEditingField("finish")} onBegin={() => onBeginInline("finish")} display={a.planned_finish || "—"} title="Click to change the finish date">
          <input
            ref={focusSelectRef}
            type="date"
            defaultValue={a.planned_finish || ""}
            onBlur={(e) => {
              if (!isEditingField("finish")) return;
              commitInlineActivityEdit(a.id, { planned_finish: e.target.value });
              onEndInline();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") onEndInline();
            }}
          />
        </InlineEditCell>
      ) : null}
      {visibleColumns.percent_complete ? (
        <InlineEditCell
          editing={isEditingField("percent_complete")}
          onBegin={() => onBeginInline("percent_complete")}
          display={
            <React.Fragment>
              {(a.percent_complete || 0) + "%"}
              <br />
              <span className="text-secondary" style={{ fontSize: 11 }}>
                {(a.physical_progress || 0) + "% physical"}
              </span>
            </React.Fragment>
          }
          title="Click to change % complete"
        >
          <input
            ref={focusSelectRef}
            type="number"
            min="0"
            max="100"
            style={{ width: 70 }}
            defaultValue={a.percent_complete || 0}
            onBlur={(e) => {
              if (!isEditingField("percent_complete")) return;
              const clamped = Math.max(0, Math.min(100, Number(e.target.value) || 0));
              commitInlineActivityEdit(a.id, { percent_complete: clamped });
              onEndInline();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") onEndInline();
            }}
          />
        </InlineEditCell>
      ) : null}
      {visibleColumns.float ? (
        <td>
          {a.total_float != null ? (
            <span className={"status-badge " + (a.total_float <= 0 ? "status-badge--critical" : "status-badge--info")}>{a.total_float <= 0 ? "Critical" : a.total_float + "d float"}</span>
          ) : (
            "—"
          )}
        </td>
      ) : null}
      {visibleColumns.status ? (
        isEditingField("status") ? (
          <td>
            <select
              aria-label={"Status for " + (a.name || "activity")}
              ref={focusSelectRef}
              defaultValue={a.status}
              onChange={(e) => {
                commitInlineActivityEdit(a.id, { status: e.target.value });
                onEndInline();
              }}
              onBlur={() => {
                if (!isEditingField("status")) return;
                onEndInline();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") onEndInline();
              }}
            >
              {window.PCC.store.ACTIVITY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ACTIVITY_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </td>
        ) : (
          <td style={{ cursor: "pointer" }} title="Click to change status" onClick={() => onBeginInline("status")}>
            <span className={"status-badge " + (a.status === "complete" ? "status-badge--complete" : a.status === "on_hold" ? "status-badge--at_risk" : "status-badge--info")}>
              {ACTIVITY_STATUS_LABELS[a.status || ""]}
            </span>
          </td>
        )
      ) : null}
      <td>
        <ActivityRowMenu activity={a} open={rowMenuOpen} onToggle={onToggleRowMenu} onClose={onCloseRowMenu} onEdit={onEdit} onClone={onClone} onDelete={onDelete} />
      </td>
    </tr>
  );
}

function ActivitiesTab({ data, projectId, scheduleId, initialActivityTypeHint, initialEditingActivityId, refresh }: ActivitiesTabProps) {
  const [filter, setFilter] = useState<ActivitiesTabFilter>({ search: "", wbsId: "", status: "", critical: false });
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState("asc");
  const [visibleColumns, setVisibleColumns] = useState<{ [key: string]: boolean }>({ wbs: true, type: true, start: true, finish: true, percent_complete: true, float: true, status: true });
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ activityId: string | null; field: string | null }>({ activityId: null, field: null });
  const [selectedIds, setSelectedIds] = useState<{ [id: string]: boolean }>({});
  const [bulkShiftDays, setBulkShiftDays] = useState("");
  // "+ Add Milestone" on the Gantt tab (onSwitchToActivities("milestone")) hands off only
  // a type hint, not an editing id — the form must still open on first render, matching
  // the same "one-shot pending prop set inside initial state, not a useEffect" fix
  // already applied to RelationshipsTab's own prefill (see CLAUDE.md's React migration
  // notes: an effect runs in React's later passive-effects phase, even on first mount).
  const [editingActivityId, setEditingActivityId] = useState(() => initialEditingActivityId || (initialActivityTypeHint ? "new" : null));
  const [activityTypeHint, setActivityTypeHint] = useState(() => initialActivityTypeHint || null);
  const [clonePrefill, setClonePrefill] = useState<Partial<PCCActivity> | null>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scheduleActivities = data.activities.filter((a) => a.schedule_id === scheduleId);
  const wbsItems = data.wbs_items.filter((w) => w.schedule_id === scheduleId);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = Object.assign({}, prev);
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function beginInline(activityId: string, field: string) {
    setInlineEdit({ activityId: activityId, field: field });
  }
  function endInline() {
    setInlineEdit({ activityId: null, field: null });
  }

  let editingActivity = null;
  if (editingActivityId) {
    editingActivity =
      editingActivityId === "new"
        ? window.PCC.store.newActivity(clonePrefill || (activityTypeHint ? { activity_type: activityTypeHint } : {}))
        : scheduleActivities.find((a) => a.id === editingActivityId);
  }
  const projectCalendars = data.calendars.filter((c) => c.project_id === projectId);

  const filtered = sortActivitiesForGrid(scheduleActivities.filter((a) => activityMatchesActivitiesTabFilter(a, filter)), wbsItems, sortKey, sortDir);

  function sortButton(key: string, label: string) {
    return (
      <button
        type="button"
        className="data-table__sort-btn"
        onClick={() => {
          if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else {
            setSortKey(key);
            setSortDir("asc");
          }
        }}
      >
        {label}
        {sortKey === key ? <span className="data-table__sort-arrow">{sortDir === "desc" ? "▼" : "▲"}</span> : null}
      </button>
    );
  }

  const selectedCount = Object.keys(selectedIds).length;

  const VIRTUALIZE_THRESHOLD = 150;
  const ROW_HEIGHT_ESTIMATE = 52;
  const HEADER_HEIGHT_ESTIMATE = 34;
  const ROW_BUFFER = 15;
  const isVirtualized = filtered.length > VIRTUALIZE_THRESHOLD;

  React.useEffect(() => {
    if (!isVirtualized || !scrollRef.current) return;
    const el = scrollRef.current;
    function recompute() {
      const range = window.PCC.scheduleGanttLayout.visibleRowRange(filtered.length, el.scrollTop, el.clientHeight, ROW_HEIGHT_ESTIMATE, HEADER_HEIGHT_ESTIMATE, ROW_BUFFER);
      setVisibleRange((prev) => (prev.start === range.start && prev.end === range.end ? prev : range));
    }
    recompute();
    let rafPending = false;
    function onScroll() {
      if (rafPending) return;
      rafPending = true;
      (window.requestAnimationFrame || function (cb: FrameRequestCallback) { cb(0); })(() => {
        rafPending = false;
        recompute();
      });
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line
  }, [isVirtualized, filtered.length]);

  const rowsToRender = isVirtualized ? filtered.slice(visibleRange.start, visibleRange.end) : filtered;
  const columnCount = 3 + Object.keys(visibleColumns).filter((k) => visibleColumns[k]).length;

  return (
    <React.Fragment>
      {editingActivity ? (
        <ActivityForm
          activity={editingActivity}
          isNew={editingActivityId === "new"}
          wbsItems={wbsItems}
          vendors={data.vendors}
          calendars={projectCalendars}
          projectId={projectId}
          scheduleId={scheduleId}
          onDone={() => {
            setEditingActivityId(null);
            setActivityTypeHint(null);
            setClonePrefill(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <input type="text" placeholder="Search activity name…" value={filter.search} onChange={(e) => setFilter((f) => Object.assign({}, f, { search: e.target.value }))} />
        <select aria-label="Filter by WBS" value={filter.wbsId} onChange={(e) => setFilter((f) => Object.assign({}, f, { wbsId: e.target.value }))}>
          <option value="">WBS: All</option>
          {wbsItems.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code ? w.code + " — " + w.name : w.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={filter.status} onChange={(e) => setFilter((f) => Object.assign({}, f, { status: e.target.value }))}>
          <option value="">Status: All</option>
          {Object.keys(ACTIVITY_STATUS_LABELS).map((s) => (
            <option key={s} value={s}>
              {ACTIVITY_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
          <input type="checkbox" checked={filter.critical} onChange={(e) => setFilter((f) => Object.assign({}, f, { critical: e.target.checked }))} />
          Critical only
        </label>
        {filter.search || filter.wbsId || filter.status || filter.critical ? (
          <button className="btn btn--ghost" onClick={() => setFilter({ search: "", wbsId: "", status: "", critical: false })}>
            Clear Filters
          </button>
        ) : null}
        <div className="card-menu">
          <button className="btn btn--ghost" onClick={() => setColumnsMenuOpen((v) => !v)}>
            Columns
          </button>
          {columnsMenuOpen ? (
            <React.Fragment>
              <button className="card-menu__overlay" aria-label="Close column menu" onClick={() => setColumnsMenuOpen(false)} />
              <div className="card-menu__dropdown">
                {ACTIVITY_GRID_COLUMNS.map((col) => (
                  <label key={col.key} className="card-menu__checkbox-item">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key]}
                      onChange={(e) => setVisibleColumns((prev) => Object.assign({}, prev, { [col.key]: e.target.checked }))}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </React.Fragment>
          ) : null}
        </div>
        <div className="toolbar__spacer" />
        <button
          className="btn btn--primary"
          disabled={!scheduleId}
          onClick={() => {
            setActivityTypeHint(null);
            setClonePrefill(null);
            setEditingActivityId("new");
          }}
        >
          + Add Activity
        </button>
      </div>

      {selectedCount > 0 ? (
        <div className="bulk-action-bar">
          <span className="bulk-action-bar__count">{selectedCount} selected</span>
          <input type="number" placeholder="Days" title="Positive shifts later, negative shifts earlier" style={{ width: 80 }} value={bulkShiftDays} onChange={(e) => setBulkShiftDays(e.target.value)} />
          <button
            className="btn btn--ghost"
            onClick={() => {
              const days = Number(bulkShiftDays);
              if (!bulkShiftDays || isNaN(days) || days === 0) {
                window.PCC.notify("Enter a non-zero number of days to shift.", "warning");
                return;
              }
              bulkShiftActivities(selectedIds, days);
              setSelectedIds({});
              setBulkShiftDays("");
              refresh();
            }}
          >
            Shift Selected
          </button>
          <div className="bulk-action-bar__spacer" />
          <button className="btn btn--ghost" onClick={() => setSelectedIds({})}>
            Clear Selection
          </button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {scheduleId ? (scheduleActivities.length === 0 ? "No activities yet. Click “+ Add Activity” to add the first one." : "No activities match this search/filter.") : "Create a schedule first."}
        </div>
      ) : (
        <React.Fragment>
          <div className="project-list activities-mobile-cards">
            {filtered.map((a) => (
              <ActivityMobileCard
                key={a.id}
                a={a}
                wbsItems={wbsItems}
                selected={!!selectedIds[a.id]}
                onToggleSelect={() => toggleSelect(a.id)}
                rowMenuOpen={rowMenuId === a.id}
                onToggleRowMenu={() => setRowMenuId((cur) => (cur === a.id ? null : a.id))}
                onCloseRowMenu={() => setRowMenuId(null)}
                onEdit={() => {
                  setEditingActivityId(a.id);
                  setRowMenuId(null);
                }}
                onClone={() => {
                  setClonePrefill(clonePrefillFrom(a));
                  setEditingActivityId("new");
                  setRowMenuId(null);
                }}
                onDelete={() => {
                  deleteActivityWithConfirm(a, () => {
                    setRowMenuId(null);
                    refresh();
                  });
                }}
              />
            ))}
          </div>

          <div className="panel activities-table-wrap">
            <div ref={scrollRef} style={{ overflowX: "auto", maxHeight: isVirtualized ? "70vh" : undefined, overflowY: isVirtualized ? "auto" : undefined }}>
              <table className="data-table data-table--sticky-header data-table--frozen-first-col">
                <thead>
                  <tr>
                    <th>{sortButton("name", "Activity")}</th>
                    <th></th>
                    {ACTIVITY_GRID_COLUMNS.map((col) => (visibleColumns[col.key] ? <th key={col.key}>{sortButton(col.key, col.label)}</th> : null))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {isVirtualized && visibleRange.start > 0 ? (
                    <tr>
                      <td colSpan={columnCount} style={{ padding: 0, border: "none", height: visibleRange.start * ROW_HEIGHT_ESTIMATE }} />
                    </tr>
                  ) : null}
                  {rowsToRender.map((a) => (
                    <ActivityRow
                      key={a.id}
                      a={a}
                      wbsItems={wbsItems}
                      visibleColumns={visibleColumns}
                      selected={!!selectedIds[a.id]}
                      onToggleSelect={() => toggleSelect(a.id)}
                      inlineEdit={inlineEdit}
                      onBeginInline={(field) => beginInline(a.id, field)}
                      onEndInline={endInline}
                      rowMenuOpen={rowMenuId === a.id}
                      onToggleRowMenu={() => setRowMenuId((cur) => (cur === a.id ? null : a.id))}
                      onCloseRowMenu={() => setRowMenuId(null)}
                      onEdit={() => {
                        setEditingActivityId(a.id);
                        setRowMenuId(null);
                      }}
                      onClone={() => {
                        setClonePrefill(clonePrefillFrom(a));
                        setEditingActivityId("new");
                        setRowMenuId(null);
                      }}
                      onDelete={() => {
                        deleteActivityWithConfirm(a, () => {
                          setRowMenuId(null);
                          refresh();
                        });
                      }}
                    />
                  ))}
                  {isVirtualized && visibleRange.end < filtered.length ? (
                    <tr>
                      <td colSpan={columnCount} style={{ padding: 0, border: "none", height: (filtered.length - visibleRange.end) * ROW_HEIGHT_ESTIMATE }} />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

// ===== Import panel =====

function ParsedIssuesToggle({ parsed }: ParsedIssuesToggleProps) {
  const summary = parsed.summary;
  if (summary.warnings === 0 && summary.errors === 0) return null;
  return (
    <details style={{ marginBottom: "var(--space-3)" }}>
      <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)" }}>View {summary.errors + summary.warnings} issue(s)</summary>
      <div style={{ maxHeight: 220, overflowY: "auto", marginTop: "var(--space-2)" }}>
        {parsed.errors.map((e, i) => (
          <p key={"e" + i} style={{ fontSize: "var(--text-sm)", color: "var(--status-critical)" }}>
            {(e.row ? "Row " + e.row + ": " : "") + e.message}
          </p>
        ))}
        {parsed.warnings.map((w, i) => (
          <p key={"w" + i} style={{ fontSize: "var(--text-sm)", color: "var(--status-at-risk)" }}>
            {(w.row ? "Row " + w.row + ": " : "") + w.message}
          </p>
        ))}
      </div>
    </details>
  );
}

function ImportPanel({ data, projectId, onDone, onImported }: ImportPanelProps) {
  const [step, setStep] = useState("pick");
  const [error, setError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<ImportFileInfo | null>(null);
  const [scheduleName, setScheduleName] = useState("");
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateFileMatch<PCCSchedule>[]>([]);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [columnMapping, setColumnMapping] = useState<{ [colIndex: number]: string | undefined }>({});
  const [parsed, setParsed] = useState<ParsedScheduleImport | null>(null);
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError(null);
    readImportFile(file, projectId)
      .then((result) => {
        setSourceType(result.sourceType);
        setImportFile(result.importFile);
        setScheduleName(result.scheduleName);
        setDuplicateMatches(result.duplicateMatches);
        setDuplicateAcknowledged(false);
        if (result.needsManualMapping) {
          setHeaders(result.headers || []);
          setRawRows(result.rawRows || []);
          setColumnMapping(result.columnMapping || {});
          setStep("mapping");
        } else {
          setParsed(result.parsed);
          setStep("reviewing");
        }
      })
      .catch((err: any) => setError(err.message));
  }

  function handleConfirmImport() {
    setCommitting(true);
    setError(null);
    commitImport(projectId, parsed!, scheduleName, importFile!, sourceType!)
      .then((newScheduleId) => {
        setCommitting(false);
        onImported(newScheduleId);
      })
      .catch((err: any) => {
        setCommitting(false);
        setError(err.message);
      });
  }

  if (step === "pick") {
    return (
      <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
        <h3 style={{ marginBottom: "var(--space-3)" }}>Import Schedule</h3>
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          <strong>Excel (.xlsx/.xls)</strong> — expected columns (any order, extras ignored): <strong>Activity ID*, Activity Name*</strong>, WBS Code, WBS Name, Activity Type
          (Task/Milestone/Summary/WBS Summary), Duration, Planned Start, Planned Finish, Predecessors (e.g. <code>A010FS+2,A020</code>), % Complete, Discipline, Contractor, Responsible Person,
          Status, Notes.
          <br />
          <strong>Microsoft Project (.xml)</strong> — export from MS Project via File → Export/Save As → Project XML. WBS Summary tasks become PCC WBS items; leaf tasks become Activities with
          their relationships, dates, progress, and constraints preserved where the format allows — see the warnings after parsing for anything approximated or skipped.
          <br />
          <strong>Primavera P6 (.xer)</strong> — export from P6 via File → Export → Project Export (XER). WBS nodes, Activities, relationships, dates, progress, constraints, and the calendar
          actually used for duration/lag conversion are read directly from the file's own tables — see the warnings after parsing for anything not imported (Resources, activity codes, and P6's
          own calendar work-pattern/holiday data aren't decoded yet).
          <br />
          Either way, this always creates a <strong>new schedule revision</strong> — it never overwrites an existing one.
        </p>
        <input type="file" accept=".xlsx,.xls,.xml,.xer" onChange={handleFileChange} />
        {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>{error}</p> : null}
        <div>
          <button className="btn btn--ghost" style={{ marginTop: "var(--space-3)" }} onClick={() => onDone()}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === "mapping") {
    const mappingTargets = getImportMappingTargets();
    const REQUIRED_MAPPING_KEYS: { [key: string]: boolean } = { external_id: true, name: true };
    const targetCounts: { [key: string]: number } = {};
    headers.forEach((h, i) => {
      const v = columnMapping[i];
      if (v) targetCounts[v] = (targetCounts[v] || 0) + 1;
    });
    const duplicateTargets = mappingTargets.filter((t) => (targetCounts[t.key] || 0) > 1);
    const missingRequired = mappingTargets.filter((t) => REQUIRED_MAPPING_KEYS[t.key] && (targetCounts[t.key] || 0) === 0);

    return (
      <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
        <h3 style={{ marginBottom: "var(--space-3)" }}>Import Schedule</h3>
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          Some column headers in <strong>{importFile ? importFile.name : "this file"}</strong> didn't match PCC's expected names. Match each uploaded column to a PCC field below, or leave it as
          “— Ignore this column —”. <strong>Activity ID</strong> and <strong>Activity Name</strong> (marked *) are required for a row to import.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) minmax(100px, 1fr) minmax(160px, 1.2fr)", gap: "var(--space-2) var(--space-3)", alignItems: "center", marginBottom: "var(--space-3)", maxHeight: 360, overflowY: "auto" }}>
          <div className="text-secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.4px" }}>
            UPLOADED COLUMN
          </div>
          <div className="text-secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.4px" }}>
            SAMPLE VALUE
          </div>
          <div className="text-secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.4px" }}>
            MAPS TO PCC FIELD
          </div>
          {headers.map((h, i) => {
            const sampleRow = rawRows.find((r) => r[i] !== undefined && r[i] !== "");
            const sampleVal = sampleRow ? sampleRow[i] : "";
            return (
              <React.Fragment key={i}>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{String(h || "").trim() || "(Column " + (i + 1) + ")"}</div>
                <div className="text-secondary" style={{ fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sampleVal instanceof Date ? sampleVal.toISOString().slice(0, 10) : String(sampleVal)}
                </div>
                <select
                  aria-label={"Map column " + (String(h || "").trim() || i + 1)}
                  value={columnMapping[i] || ""}
                  onChange={(e) => setColumnMapping((prev) => Object.assign({}, prev, { [i]: e.target.value }))}
                >
                  <option value="">— Ignore this column —</option>
                  {mappingTargets.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label + (REQUIRED_MAPPING_KEYS[t.key] ? " *" : "")}
                    </option>
                  ))}
                </select>
              </React.Fragment>
            );
          })}
        </div>
        {duplicateTargets.length > 0 ? (
          <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
            Each PCC field can only come from one column — fix the duplicate mapping for: {duplicateTargets.map((t) => t.label).join(", ")}.
          </p>
        ) : null}
        {missingRequired.length > 0 ? (
          <p style={{ color: "var(--status-at-risk)", fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
            {missingRequired.map((t) => t.label).join(" and ")} {missingRequired.length === 1 ? "isn't" : "aren't"} mapped to any column — rows will fail to import without{" "}
            {missingRequired.length === 1 ? "it" : "them"}.
          </p>
        ) : null}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button
            className="btn btn--primary"
            disabled={duplicateTargets.length > 0}
            onClick={() => {
              setParsed(applyColumnMappingAndReview(headers, rawRows, columnMapping));
              setStep("reviewing");
            }}
          >
            Continue
          </button>
          <button className="btn btn--ghost" onClick={() => onDone()}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // step === "reviewing"
  const summary = parsed!.summary;
  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-3)" }}>Import Schedule</h3>
      {duplicateMatches.length > 0 && !duplicateAcknowledged ? (
        <div style={{ border: "1px solid var(--status-at-risk)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", marginBottom: "var(--space-4)", background: "rgba(214, 158, 46, 0.08)" }}>
          <p style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>This file looks like it may have been imported before</p>
          {duplicateMatches.map((m, i) => (
            <p key={i} style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
              <strong>{m.record.name}</strong> (Rev {m.record.revision_number}) — imported {m.record.import_date ? new Date(m.record.import_date).toLocaleDateString() : "unknown date"}
              <br />
              <span className="text-secondary">{m.reason}</span>
            </p>
          ))}
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            <button className="btn btn--ghost" onClick={() => setDuplicateAcknowledged(true)}>
              Continue Anyway
            </button>
            <button className="btn btn--ghost" onClick={() => onDone()}>
              Cancel Import
            </button>
          </div>
        </div>
      ) : null}

      <p style={{ fontSize: "var(--text-base)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
        Parsed {summary.total_rows} row(s) — {summary.imported} activities will be imported, {summary.warnings} warning(s), {summary.errors} error(s).
      </p>
      {summary.errors > 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          Rows with errors are excluded entirely — fix them in the source file and re-import if needed.
        </p>
      ) : null}
      <ParsedIssuesToggle parsed={parsed!} />

      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="importfield-schedule_name">Schedule Name</label>
        <input id="importfield-schedule_name" type="text" value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <button
          className="btn btn--primary"
          disabled={summary.imported === 0 || committing || (duplicateMatches.length > 0 && !duplicateAcknowledged)}
          onClick={handleConfirmImport}
        >
          {committing ? "Saving…" : "Confirm Import (" + summary.imported + " activities)"}
        </button>
        <button className="btn btn--ghost" disabled={committing} onClick={() => onDone()}>
          Cancel
        </button>
      </div>
      {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>{error}</p> : null}
    </div>
  );
}

// ===== Excel Editor panel =====

function ExcelCellControl({ rowIndex, field, value, onChange }: ExcelCellControlProps) {
  const id = "excelgrid-" + rowIndex + "-" + field.key;
  if (field.key === "activity_type") {
    return (
      <select id={id} aria-label={field.label + ", row " + (rowIndex + 1)} style={{ width: "100%" }} value={value || "task"} onChange={(e) => onChange(e.target.value)}>
        {["task", "milestone", "summary", "wbs_summary"].map((k) => (
          <option key={k} value={k}>
            {ACTIVITY_TYPE_LABELS[k]}
          </option>
        ))}
      </select>
    );
  }
  if (field.key === "status") {
    return (
      <select id={id} aria-label={field.label + ", row " + (rowIndex + 1)} style={{ width: "100%" }} value={value || "not_started"} onChange={(e) => onChange(e.target.value)}>
        {Object.keys(ACTIVITY_STATUS_LABELS).map((k) => (
          <option key={k} value={k}>
            {ACTIVITY_STATUS_LABELS[k]}
          </option>
        ))}
      </select>
    );
  }
  let type = "text";
  if (field.key === "planned_start" || field.key === "planned_finish") type = "date";
  else if (field.key === "duration" || field.key === "percent_complete") type = "number";
  return <input id={id} type={type} step={type === "number" ? "any" : undefined} style={{ width: "100%", boxSizing: "border-box" }} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
}

function ExcelEditorPanel({ schedule, data, onDone }: ExcelEditorPanelProps) {
  const fields = getExcelGridFields();
  const rowIdCounter = React.useRef(0);
  // Separate from rowIdCounter (which keys every row, loaded or added): vanilla's own
  // excelEditorNextNewSeq started at 1 regardless of how many rows were already loaded
  // from the schedule, so a freshly-opened grid's first "+ Add Row" always suggests
  // "NEW-1" — reusing rowIdCounter here (its value already at the loaded row count) was
  // a real porting bug, caught by test_schedule_excel_editor_e2e.js.
  const newRowSeq = React.useRef(0);
  const [rows, setRows] = useState(() =>
    buildExcelEditorRows(schedule, data).map((r) => {
      rowIdCounter.current += 1;
      return Object.assign({ _rowId: "r" + rowIdCounter.current }, r);
    })
  );
  const [step, setStep] = useState("grid");
  const [review, setReview] = useState<ParsedScheduleImport | null>(null);
  const [handAddedAcknowledged, setHandAddedAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setCell(rowId: string, key: string, value: string) {
    setRows((prev) => prev.map((r) => (r._rowId === rowId ? Object.assign({}, r, { [key]: value }) : r)));
  }

  function addRow() {
    rowIdCounter.current += 1;
    newRowSeq.current += 1;
    setRows((prev) =>
      prev.concat([
        {
          _rowId: "r" + rowIdCounter.current,
          external_id: "NEW-" + newRowSeq.current,
          name: "",
          activity_type: "task",
          wbs_code: "",
          wbs_name: "",
          duration: "",
          planned_start: "",
          planned_finish: "",
          predecessors: "",
          percent_complete: "",
          discipline: "",
          contractor: "",
          responsible_person: "",
          status: "not_started",
          notes: "",
        },
      ])
    );
  }

  function deleteRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r._rowId !== rowId));
  }

  if (step === "grid") {
    return (
      <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
        <h3 style={{ marginBottom: "var(--space-3)" }}>Edit Excel — {schedule.name}</h3>
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          Editing here updates the attached Excel file and this schedule's Activities/WBS/Relationships together — no separate download or re-upload needed. Recognized columns only (same set as
          Import); extra columns from the original file aren't shown.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <button type="button" className="btn btn--ghost" onClick={addRow}>
            + Add Row
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
            No activities from the original Excel file remain on this schedule. Click “+ Add Row” to start adding some, or Close and use the Activities tab instead.
          </p>
        ) : null}
        <div style={{ overflowX: "auto", maxHeight: 440, overflowY: "auto", border: "1px solid var(--divider)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-3)" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>
                {fields.map((f) => (
                  <th key={f.key} style={{ textAlign: "left", padding: "var(--space-2)", borderBottom: "1px solid var(--divider)", position: "sticky", top: 0, backgroundColor: "var(--bg-paper-raised)", whiteSpace: "nowrap" }}>
                    {f.label}
                  </th>
                ))}
                <th style={{ borderBottom: "1px solid var(--divider)", position: "sticky", top: 0, backgroundColor: "var(--bg-paper-raised)" }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row._rowId}>
                  {fields.map((f) => (
                    <td key={f.key} style={{ padding: "3px 6px", borderBottom: "1px solid var(--divider)", minWidth: f.key === "name" || f.key === "notes" ? 160 : 110 }}>
                      <ExcelCellControl rowIndex={rowIndex} field={f} value={row[f.key]} onChange={(v) => setCell(row._rowId, f.key, v)} />
                    </td>
                  ))}
                  <td style={{ padding: "3px 6px", borderBottom: "1px solid var(--divider)" }}>
                    <button type="button" className="btn btn--ghost" style={{ padding: "2px var(--space-2)" }} title="Delete row" onClick={() => deleteRow(row._rowId)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setReview(reviewExcelEdits(rows));
              setStep("review");
            }}
          >
            Review Changes
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Close
          </button>
        </div>
        {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>{error}</p> : null}
      </div>
    );
  }

  // step === "review"
  const summary = review!.summary;
  const handAdded = data.activities.filter((a) => a.schedule_id === schedule.id && !a.external_id);
  const blockedByHandAdded = handAdded.length > 0 && !handAddedAcknowledged;

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-3)" }}>Edit Excel — {schedule.name}</h3>
      {blockedByHandAdded ? (
        <div style={{ border: "1px solid var(--status-at-risk)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", marginBottom: "var(--space-4)", background: "rgba(214, 158, 46, 0.08)" }}>
          <p style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
            {handAdded.length} activit{handAdded.length === 1 ? "y" : "ies"} on this schedule {handAdded.length === 1 ? "isn’t" : "aren’t"} from the Excel file
          </p>
          <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
            They were added by hand on the Activities tab and have no Activity ID, so they can't appear in this grid. Applying replaces this schedule's full activity list from the grid, so
            continuing will delete them.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            <button type="button" className="btn btn--ghost" onClick={() => setHandAddedAcknowledged(true)}>
              Delete Them and Continue
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setStep("grid")}>
              Back to Grid
            </button>
          </div>
        </div>
      ) : null}

      <p style={{ fontSize: "var(--text-base)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
        {summary.imported} activit{summary.imported === 1 ? "y" : "ies"} will be applied to this schedule, {summary.warnings} warning(s), {summary.errors} error(s).
      </p>
      {summary.errors > 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          Rows with errors are excluded entirely — go back, fix them in the grid, and click Review Changes again.
        </p>
      ) : null}
      <ParsedIssuesToggle parsed={review!} />

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <button
          type="button"
          className="btn btn--primary"
          disabled={summary.imported === 0 || saving || blockedByHandAdded}
          onClick={() => {
            setSaving(true);
            setError(null);
            applyExcelEdits(schedule, rows, review!)
              .then(() => {
                setSaving(false);
                onDone();
              })
              .catch((e: any) => {
                setSaving(false);
                setError("Could not save changes: " + e.message);
              });
          }}
        >
          {saving ? "Applying…" : "Apply to Schedule (" + summary.imported + " activities)"}
        </button>
        <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setStep("grid")}>
          Back to Grid
        </button>
      </div>
      {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}>{error}</p> : null}
    </div>
  );
}

// ===== Gantt tab =====

var SVG_NS = "http://www.w3.org/2000/svg";

/** Gate 8 drag interaction, translated to React refs instead of vanilla's captured DOM
 * arguments — `barRef`/`progressRef` point at the actual SVG elements being visually
 * transformed live during the drag (direct attribute mutation, not React state, for a
 * smooth 60fps drag — matching the vanilla implementation's own approach exactly).
 * pointermove/pointerup are attached to the event's own view (window) rather than
 * relying on setPointerCapture, same reasoning as the original. */
function startGanttDrag(
  e: React.PointerEvent,
  {
    barRef,
    progressRef,
    activity,
    mode,
    pxPerDay,
    scheduleId,
    onClickNoMove,
    onCommitted,
  }: {
    barRef: React.RefObject<any>;
    progressRef: React.RefObject<any> | null;
    activity: PCCActivity | undefined;
    mode: string;
    pxPerDay: number;
    scheduleId: string;
    onClickNoMove: () => void;
    onCommitted: () => void;
  }
) {
  if (typeof e.button === "number" && e.button !== 0) return;
  if (!activity) return;
  const origStart = activity.planned_start || activity.early_start;
  const origFinish = activity.planned_finish || activity.early_finish;
  if (!origStart || !origFinish) return;
  e.preventDefault();
  e.stopPropagation();

  const targetEl = barRef.current;
  const progressEl = progressRef ? progressRef.current : null;
  const startClientX = e.clientX;
  const baseWidth = Number(targetEl.getAttribute("data-base-width")) || Number(targetEl.getAttribute("width")) || 0;
  let moved = false;
  const win: Window = (e.view as unknown as Window) || window;

  function onMove(ev: PointerEvent) {
    const deltaPx = ev.clientX - startClientX;
    if (Math.abs(deltaPx) >= 4) moved = true;
    const dayDelta = window.PCC.scheduleGanttLayout.daysFromPixelDelta(deltaPx, pxPerDay);
    const snappedPx = dayDelta * pxPerDay;
    if (mode === "move") {
      targetEl.setAttribute("transform", "translate(" + snappedPx + ",0)");
      if (progressEl) progressEl.setAttribute("transform", "translate(" + snappedPx + ",0)");
    } else {
      targetEl.setAttribute("width", Math.max(baseWidth + snappedPx, 3));
      if (progressEl) progressEl.style.display = "none";
    }
  }
  function onUp(ev: PointerEvent) {
    win.removeEventListener("pointermove", onMove);
    win.removeEventListener("pointerup", onUp);
    targetEl.removeAttribute("transform");
    if (progressEl) {
      progressEl.removeAttribute("transform");
      progressEl.style.display = "";
    }
    const deltaPx = ev.clientX - startClientX;
    const dayDelta = window.PCC.scheduleGanttLayout.daysFromPixelDelta(deltaPx, pxPerDay);
    if (!moved || dayDelta === 0) {
      onClickNoMove();
      return;
    }
    commitGanttDrag(activity!, mode, origStart!, origFinish!, dayDelta, scheduleId);
    onCommitted();
  }
  win.addEventListener("pointermove", onMove);
  win.addEventListener("pointerup", onUp);
}

function GanttRow({ row, activity, y, rowHeight, chartWidth, pxPerDay, xForDate, baselineRow, notReady, scheduleId, onOpenDetail, onCommitted }: GanttRowProps) {
  const barRef = React.useRef<any>(null);
  const progressRef = React.useRef<any>(null);
  const rowCenter = y + rowHeight / 2;

  const labelTitle = row.name;
  const labelClick = () => onOpenDetail(row.id);

  if (row.dateSource === "none") {
    return (
      <React.Fragment>
        <line x1={0} y1={y + rowHeight} x2={chartWidth} y2={y + rowHeight} stroke="var(--divider)" strokeWidth={1} />
        <text x={6} y={rowCenter + 4} fontSize={11} fill="var(--text-primary)" style={{ cursor: "pointer" }} onClick={labelClick}>
          {truncateLabel(row.name, 26)}
          <title>{labelTitle}</title>
        </text>
        <text x={200 + 4} y={rowCenter + 4} fontSize={11} fill="var(--text-secondary)" fontStyle="italic">
          No dates set
        </text>
      </React.Fragment>
    );
  }

  const baseColor = row.isCritical ? "var(--status-critical)" : row.dateSource === "calculated" ? "var(--status-info)" : "var(--text-secondary)";

  if (row.isMilestone) {
    const cx = xForDate(row.start!) + pxPerDay / 2;
    const size = 8;
    const d = "M " + cx + " " + (rowCenter - size) + " L " + (cx + size) + " " + rowCenter + " L " + cx + " " + (rowCenter + size) + " L " + (cx - size) + " " + rowCenter + " Z";
    return (
      <React.Fragment>
        <line x1={0} y1={y + rowHeight} x2={chartWidth} y2={y + rowHeight} stroke="var(--divider)" strokeWidth={1} />
        <text x={6} y={rowCenter + 4} fontSize={11} fill="var(--text-primary)" style={{ cursor: "pointer" }} onClick={labelClick}>
          {truncateLabel(row.name, 26)}
          <title>{labelTitle}</title>
        </text>
        <path
          ref={barRef}
          d={d}
          fill={row.isCritical ? "var(--status-critical)" : "var(--signal-amber)"}
          stroke="var(--bg-paper)"
          strokeWidth={1}
          data-activity-id={row.id}
          style={{ cursor: "grab" }}
          onPointerDown={(e) =>
            activity &&
            startGanttDrag(e, { barRef, progressRef: null, activity, mode: "move", pxPerDay, scheduleId, onClickNoMove: labelClick, onCommitted })
          }
        />
      </React.Fragment>
    );
  }

  const barX = xForDate(row.start!);
  const barW = Math.max((row.durationDays || 0) * pxPerDay, 3);
  const barY = y + 5;
  const barH = rowHeight - 10;
  const progressW = row.percentComplete > 0 ? Math.max((barW * Math.min(row.percentComplete, 100)) / 100, 2) : 0;

  return (
    <React.Fragment>
      <line x1={0} y1={y + rowHeight} x2={chartWidth} y2={y + rowHeight} stroke="var(--divider)" strokeWidth={1} />
      <text x={6} y={rowCenter + 4} fontSize={11} fill="var(--text-primary)" style={{ cursor: "pointer" }} onClick={labelClick}>
        {truncateLabel(row.name, 26)}
        <title>{labelTitle}</title>
      </text>
      {baselineRow && !baselineRow.isMilestone ? (
        <rect
          x={xForDate(baselineRow.start!)}
          y={y + rowHeight - 7}
          width={Math.max((baselineRow.durationDays || 0) * pxPerDay, 3)}
          height={4}
          rx={2}
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth={1.5}
          strokeDasharray="2,2"
        />
      ) : null}
      <rect
        ref={barRef}
        x={barX}
        y={barY}
        width={barW}
        height={barH}
        rx={3}
        fill={baseColor}
        fillOpacity={0.28}
        stroke={baseColor}
        strokeWidth={1}
        strokeDasharray={row.dateSource === "planned" ? "4,2" : "none"}
        data-activity-id={row.id}
        data-base-width={barW}
        style={{ cursor: "grab" }}
        onPointerDown={(e) => activity && startGanttDrag(e, { barRef, progressRef, activity, mode: "move", pxPerDay, scheduleId, onClickNoMove: labelClick, onCommitted })}
      />
      {row.percentComplete > 0 ? <rect ref={progressRef} x={barX} y={barY} width={progressW} height={barH} rx={3} fill={baseColor} style={{ pointerEvents: "none" }} /> : null}
      {notReady ? (
        <circle cx={barX + barW - 1} cy={barY - 1} r={5} fill="var(--status-critical)" stroke="var(--bg-paper)" strokeWidth={1} data-readiness-marker-for={row.id} style={{ pointerEvents: "none" }}>
          <title>Not Ready — one or more governing documents are not yet Available</title>
        </circle>
      ) : null}
      {activity ? (
        <rect
          x={barX + barW - 3}
          y={barY}
          width={6}
          height={barH}
          fill="transparent"
          style={{ cursor: "ew-resize" }}
          data-resize-handle-for={activity.id}
          onPointerDown={(e) => startGanttDrag(e, { barRef, progressRef, activity, mode: "resize", pxPerDay, scheduleId, onClickNoMove: labelClick, onCommitted })}
        />
      ) : null}
    </React.Fragment>
  );
}

function GanttToolbar({ data, projectId, allActivities, wbsItems, filter, setFilter, zoom, setZoom, onAddActivity, onAddMilestone, showBaseline, baselineId, baselineLoading, onToggleBaseline, onChangeBaselineId }: GanttToolbarProps) {
  function uniqueValues(key: string): string[] {
    const seen: { [value: string]: boolean } = {};
    const out: string[] = [];
    allActivities.forEach((a) => {
      const v = (a as any)[key];
      if (v && !seen[v]) {
        seen[v] = true;
        out.push(v);
      }
    });
    return out.sort();
  }

  const projectBaselines = data.schedule_baselines.filter((b) => b.project_id === projectId);
  const anyFilterActive = filter.search || filter.wbsId || filter.discipline || filter.contractor || filter.responsiblePerson || filter.quick;

  return (
    <React.Fragment>
      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search ID, name, WBS, contractor, discipline…"
          value={filter.search}
          style={{ minWidth: 220 }}
          onChange={(e) => setFilter((f) => Object.assign({}, f, { search: e.target.value }))}
        />
        <select aria-label="Filter by WBS" value={filter.wbsId} onChange={(e) => setFilter((f) => Object.assign({}, f, { wbsId: e.target.value }))}>
          <option value="">WBS: All</option>
          {wbsItems.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code ? w.code + " — " + w.name : w.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by discipline" value={filter.discipline} onChange={(e) => setFilter((f) => Object.assign({}, f, { discipline: e.target.value }))}>
          <option value="">Discipline: All</option>
          {uniqueValues("discipline").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Filter by contractor" value={filter.contractor} onChange={(e) => setFilter((f) => Object.assign({}, f, { contractor: e.target.value }))}>
          <option value="">Contractor: All</option>
          {uniqueValues("contractor").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Filter by responsible person" value={filter.responsiblePerson} onChange={(e) => setFilter((f) => Object.assign({}, f, { responsiblePerson: e.target.value }))}>
          <option value="">Responsible: All</option>
          {uniqueValues("responsible_person").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Quick filter" value={filter.quick} onChange={(e) => setFilter((f) => Object.assign({}, f, { quick: e.target.value }))}>
          <option value="">Show: All Activities</option>
          <option value="critical">Critical</option>
          <option value="near_critical">Near Critical</option>
          <option value="delayed">Delayed</option>
          <option value="completed">Completed</option>
          <option value="in_progress">In Progress</option>
          <option value="not_started">Not Started</option>
          <option value="milestones">Milestones Only</option>
        </select>
        {anyFilterActive ? (
          <button className="btn btn--ghost" onClick={() => setFilter({ search: "", wbsId: "", discipline: "", contractor: "", responsiblePerson: "", quick: "" })}>
            Clear Filters
          </button>
        ) : null}
      </div>

      <div className="toolbar" style={{ flexWrap: "wrap", marginTop: "var(--space-2)" }}>
        <span className="gantt-chart-only-control" style={{ display: "contents" }}>
          <span className="text-secondary" style={{ fontSize: "var(--text-sm)", alignSelf: "center" }}>
            Zoom:
          </span>
          {["auto", "day", "week", "month", "quarter", "year"].map((z) => (
            <button key={z} className={"btn " + (zoom === z ? "btn--primary" : "btn--ghost")} onClick={() => setZoom(z)}>
              {GANTT_ZOOM_LABELS[z]}
            </button>
          ))}
        </span>
        <div className="toolbar__spacer" />
        <button className="btn btn--ghost" onClick={onAddActivity}>
          + Add Activity
        </button>
        <button className="btn btn--ghost" onClick={onAddMilestone}>
          + Add Milestone
        </button>
      </div>

      {projectBaselines.length > 0 ? (
        <div className="toolbar gantt-chart-only-control" style={{ flexWrap: "wrap", marginTop: "var(--space-2)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={showBaseline} onChange={(e) => onToggleBaseline(e.target.checked, projectBaselines)} />
            Show Baseline
          </label>
          <select aria-label="Compare to baseline" value={baselineId || projectBaselines[0].id} disabled={!showBaseline} onChange={(e) => onChangeBaselineId(e.target.value)}>
            {projectBaselines.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {baselineLoading ? (
            <span className="text-secondary" style={{ alignSelf: "center", fontSize: "var(--text-sm)" }}>
              Loading baseline…
            </span>
          ) : null}
        </div>
      ) : null}
    </React.Fragment>
  );
}

function GanttChart({ data, schedule, allActivities, wbsItems, filter, zoom, showBaseline, baselineSnapshot, baselineId, scheduleId, onOpenDetail, refresh, detailPanel }: GanttChartProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  const referenceDate = (schedule && schedule.data_date) || todayIso();
  const nearCriticalThresholdDays = (schedule && schedule.near_critical_threshold_days) || 5;
  const activities = allActivities.filter((a) => activityMatchesGanttFilter(a, wbsItems, Object.assign({ nearCriticalThresholdDays: nearCriticalThresholdDays }, filter), referenceDate));

  const layout = computeGanttLayout(activities, { dataDate: schedule && schedule.data_date ? schedule.data_date : null });

  // rowHeight/headerHeight and the virtualization scroll-listener effect below are hoisted
  // above the empty-state early return so every render calls the exact same hooks in the
  // same order — a real bug, hit and fixed during the Gate G test sweep: with these (and
  // the useEffect) defined only in the "has dated activities" branch, going from 0 dated
  // activities (early return, 2 hooks) to >0 (main branch, 3 hooks) — e.g. right after
  // "Calculate Schedule" populates early_start/early_finish on previously-undated
  // activities — threw React's "Rendered more hooks than during the previous render."
  const rowHeight = 26;
  const headerHeight = 44;
  const GANTT_ROW_BUFFER = 15;

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function recompute() {
      const range = window.PCC.scheduleGanttLayout.visibleRowRange(layout.rows.length, el!.scrollTop, el!.clientHeight, rowHeight, headerHeight, GANTT_ROW_BUFFER);
      setVisibleRange((prev) => (prev.start === range.start && prev.end === range.end ? prev : range));
    }
    recompute();
    let rafPending = false;
    function onScroll() {
      if (rafPending) return;
      rafPending = true;
      (window.requestAnimationFrame || function (cb: FrameRequestCallback) { cb(0); })(() => {
        rafPending = false;
        recompute();
      });
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line
  }, [layout.rows.length, rowHeight]);

  if (layout.datedCount === 0) {
    return (
      <React.Fragment>
        {detailPanel}
        <div className="panel empty-state">
          {allActivities.length === 0
            ? "No activities in this schedule yet. Add some on the Activities tab first."
            : activities.length === 0
            ? "No activities match the current filters."
            : "None of this schedule's " + activities.length + " activity(ies) have a Planned Start/Finish or a calculated date yet. Add planned dates on the Activities tab, or run “Calculate Schedule” above."}
        </div>
      </React.Fragment>
    );
  }

  const diffDays = window.PCC.scheduleGanttLayout.diffDays;
  const bufferDays = 1;
  const rangeStart: string = layout.rangeStart!;
  const rangeEnd: string = layout.rangeEnd!;
  const totalSpanDays = diffDays(rangeStart, rangeEnd) + 1 + bufferDays * 2;
  const pxPerDay = ganttPxPerDay(totalSpanDays, zoom === "auto" ? null : zoom);
  const labelWidth = 200;
  const chartWidth = labelWidth + totalSpanDays * pxPerDay;
  const chartHeight = headerHeight + layout.rows.length * rowHeight + 6;

  function xForDate(iso: string): number {
    return labelWidth + (diffDays(rangeStart, iso) + bufferDays) * pxPerDay;
  }

  const tickIntervalDays = ganttTickIntervalDays(totalSpanDays);
  const ticks: { t: number; iso: string; x: number }[] = [];
  for (let t = 0; t <= totalSpanDays; t += tickIntervalDays) {
    const tickIso = window.PCC.scheduleGanttLayout.addDays(rangeStart, t - bufferDays);
    ticks.push({ t: t, iso: tickIso, x: labelWidth + t * pxPerDay });
  }

  const ddx = layout.dataDate ? xForDate(layout.dataDate) : null;
  const todayMarkerIso = todayIso();
  const todayInRange = todayMarkerIso >= rangeStart && todayMarkerIso <= rangeEnd;
  const tdx = todayInRange ? xForDate(todayMarkerIso) : null;
  const markersClose = ddx !== null && tdx !== null && Math.abs(ddx - tdx) < 60;
  const ddLabelY = markersClose ? headerHeight - 6 : headerHeight - 12;
  const tdLabelY = markersClose ? headerHeight - 18 : headerHeight - 12;

  const baselineByMatchKey: { [key: string]: GanttLayoutRow } = {};
  if (showBaseline && baselineSnapshot && baselineSnapshot.baselineId === baselineId) {
    const baselineLayout = computeGanttLayout(baselineSnapshot.activities as unknown as PCCActivity[], {});
    baselineLayout.rows.forEach((r) => {
      if (r.dateSource !== "none") baselineByMatchKey[matchKeyFor(r)] = r;
    });
  }

  const activityById: { [id: string]: PCCActivity } = {};
  activities.forEach((a) => {
    activityById[a.id] = a;
  });

  const rowsToRender = layout.rows.slice(visibleRange.start, visibleRange.end);

  function legendItem(colorCss: string, label: string, dashed?: boolean) {
    return (
      <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span
          style={{
            width: 14,
            height: 10,
            borderRadius: "var(--radius-sm)",
            background: dashed ? "transparent" : colorCss,
            border: dashed ? "1px dashed " + colorCss : undefined,
          }}
        />
        <span className="text-secondary">{label}</span>
      </span>
    );
  }

  return (
    <React.Fragment>
      {layout.undatedCount > 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          {layout.undatedCount} activity(ies) have no planned or calculated dates and aren't shown on the chart.
        </p>
      ) : null}

      <div className="gantt-chart-only-control" style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", marginBottom: -4, flexWrap: "wrap" }}>
        <button
          className="btn btn--ghost"
          disabled={!(todayInRange && todayMarkerIso >= rangeStart && todayMarkerIso <= rangeEnd)}
          onClick={() => {
            wrapRef.current!.scrollLeft = Math.max(0, xForDate(todayMarkerIso) - 80);
          }}
        >
          Today
        </button>
        <button className="btn btn--ghost" onClick={() => (wrapRef.current!.scrollLeft = Math.max(0, xForDate(rangeStart) - 80))}>
          Project Start
        </button>
        <button className="btn btn--ghost" onClick={() => (wrapRef.current!.scrollLeft = Math.max(0, xForDate(rangeEnd) - 80))}>
          Project Finish
        </button>
        {layout.dataDate ? (
          <button className="btn btn--ghost" onClick={() => (wrapRef.current!.scrollLeft = Math.max(0, xForDate(layout.dataDate!) - 80))}>
            Data Date
          </button>
        ) : null}
      </div>

      {(() => {
        const chartPanel = (
          <div ref={wrapRef} className="panel gantt-chart-panel" style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
            <svg width={chartWidth} height={chartHeight} style={{ display: "block" }}>
              {ticks.map((tick) => (
                <React.Fragment key={tick.t}>
                  <line x1={tick.x} y1={0} x2={tick.x} y2={chartHeight} stroke="var(--grid-line)" strokeWidth={1} />
                  <text x={tick.x + 3} y={12} fontSize={10} fill="var(--text-secondary)">
                    {formatAxisDate(tick.iso)}
                  </text>
                </React.Fragment>
              ))}
              <line x1={labelWidth} y1={0} x2={labelWidth} y2={chartHeight} stroke="var(--divider)" strokeWidth={1} />
              {ddx !== null ? (
                <React.Fragment>
                  <line x1={ddx} y1={0} x2={ddx} y2={chartHeight} stroke="var(--signal-amber)" strokeWidth={2} strokeDasharray="4,3" />
                  <text x={ddx + 4} y={ddLabelY} fontSize={10} fill="var(--signal-amber)" fontWeight={600}>
                    Data Date
                  </text>
                </React.Fragment>
              ) : null}
              {tdx !== null ? (
                <React.Fragment>
                  <line x1={tdx} y1={0} x2={tdx} y2={chartHeight} stroke="var(--status-on-track)" strokeWidth={2} />
                  <text x={tdx + 4} y={tdLabelY} fontSize={10} fill="var(--status-on-track)" fontWeight={600}>
                    Today
                  </text>
                </React.Fragment>
              ) : null}
              <g>
                {rowsToRender.map((row, i) => {
                  const actualIndex = visibleRange.start + i;
                  const activity = activityById[row.id];
                  const baselineRow = baselineByMatchKey[matchKeyFor(activity || { id: row.id, external_id: null })];
                  const notReady = !!(activity && activityNotReady(activity, data));
                  return (
                    <GanttRow
                      key={row.id}
                      row={row}
                      activity={activity}
                      y={headerHeight + actualIndex * rowHeight}
                      rowHeight={rowHeight}
                      chartWidth={chartWidth}
                      pxPerDay={pxPerDay}
                      xForDate={xForDate}
                      baselineRow={baselineRow}
                      notReady={notReady}
                      scheduleId={scheduleId}
                      onOpenDetail={onOpenDetail}
                      onCommitted={refresh}
                    />
                  );
                })}
              </g>
            </svg>
          </div>
        );
        // UI/UX Overhaul Gate 7 (Side-by-Side Views): once the chart can actually
        // render (this branch, past the empty-state early return above), an open
        // Activity Detail Panel moves into a side-by-side row with the chart instead
        // of sitting full-width above it — same two-panel pattern Documents' own
        // register+preview already uses. Matches vanilla's own DOM-surgery version of
        // this (see git history), just composed declaratively instead.
        return detailPanel ? (
          <div className="gantt-layout-row">
            {chartPanel}
            <div className="gantt-detail-pane">{detailPanel}</div>
          </div>
        ) : (
          chartPanel
        );
      })()}

      <div className="gantt-chart-only-control" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>
        {legendItem("var(--status-critical)", "Critical (0 or negative float)")}
        {legendItem("var(--status-info)", "Calculated")}
        {legendItem("var(--text-secondary)", "Planned only — not yet calculated", true)}
        {legendItem("var(--signal-amber)", "Milestone")}
        {layout.dataDate ? legendItem("var(--signal-amber)", "Data Date", true) : null}
        {legendItem("var(--status-on-track)", "Today")}
        {showBaseline ? legendItem("var(--text-secondary)", "Baseline (ghost)", true) : null}
        {legendItem("var(--status-critical)", "Not Ready (governing document missing)")}
      </div>

      <p className="text-secondary gantt-chart-only-control" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-2)" }}>
        Drag a bar to move it, drag its right edge to resize, or click a bar/milestone/label to open its details. Every edit recalculates the schedule automatically.
      </p>

      {typeof window !== "undefined" && window.innerWidth <= 780 ? (
        <div className="project-list gantt-mobile-timeline">
          {activities
            .slice()
            .sort((a, b) => {
              const da = a.planned_start || a.early_start || "";
              const db = b.planned_start || b.early_start || "";
              return da < db ? -1 : da > db ? 1 : 0;
            })
            .map((a) => {
              const start = a.planned_start || a.early_start;
              const finish = a.planned_finish || a.early_finish;
              const metaBits = [wbsName(wbsItems, a.wbs_id), ACTIVITY_TYPE_LABELS[a.activity_type]];
              if (start || finish) metaBits.push((start || "—") + " → " + (finish || "—"));
              return (
                <div key={a.id} className="project-card" style={{ cursor: "pointer" }} onClick={() => onOpenDetail(a.id)}>
                  <div className="project-card__main">
                    <div className="project-card__name">{a.name || "(unnamed activity)"}</div>
                    <div className="project-card__meta">{metaBits.join(" · ")}</div>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <span className={"status-badge " + (a.status === "complete" ? "status-badge--complete" : a.status === "on_hold" ? "status-badge--at_risk" : "status-badge--info")}>
                      {ACTIVITY_STATUS_LABELS[a.status || ""]}
                    </span>
                    {a.total_float != null && a.total_float <= 0 ? <span className="status-badge status-badge--critical">Critical</span> : null}
                  </div>
                </div>
              );
            })}
        </div>
      ) : null}
    </React.Fragment>
  );
}

function GanttTab({ data, projectId, scheduleId, initialDetailActivityId, onSwitchToActivities, onEditActivity, onAddRelationship, refresh }: GanttTabProps) {
  const [filter, setFilter] = useState({ search: "", wbsId: "", discipline: "", contractor: "", responsiblePerson: "", quick: "" });
  const [zoom, setZoom] = useState("auto");
  const [detailActivityId, setDetailActivityId] = useState(() => initialDetailActivityId || null);
  const [showBaseline, setShowBaseline] = useState(false);
  const [baselineId, setBaselineId] = useState("");
  const [baselineSnapshot, setBaselineSnapshot] = useState<GanttBaselineSnapshot | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);

  const schedule = data.schedules.find((s) => s.id === scheduleId);
  const allActivities = data.activities.filter((a) => a.schedule_id === scheduleId);
  const wbsItems = data.wbs_items.filter((w) => w.schedule_id === scheduleId);
  const relationships = data.relationships.filter((r) => r.schedule_id === scheduleId);

  let detailActivity = null;
  if (detailActivityId) {
    detailActivity = allActivities.find((a) => a.id === detailActivityId);
  }

  function handleToggleBaseline(checked: boolean, projectBaselines: PCCScheduleBaseline[]) {
    setShowBaseline(checked);
    if (checked) {
      const useId = baselineId || projectBaselines[0].id;
      if (!baselineId) setBaselineId(useId);
      if (!baselineSnapshot || baselineSnapshot.baselineId !== useId) {
        setBaselineLoading(true);
        loadBaselineOverlay(useId)
          .then((snap) => {
            setBaselineSnapshot(snap);
            setBaselineLoading(false);
          })
          .catch((err) => {
            console.error("Could not load baseline for Gantt overlay", err);
            setBaselineLoading(false);
            setShowBaseline(false);
            window.PCC.notify("Could not load that baseline's stored data.", "error");
          });
      }
    }
  }

  function handleChangeBaselineId(id: string) {
    setBaselineId(id);
    setBaselineLoading(true);
    loadBaselineOverlay(id)
      .then((snap) => {
        setBaselineSnapshot(snap);
        setBaselineLoading(false);
      })
      .catch((err) => {
        console.error("Could not load baseline for Gantt overlay", err);
        setBaselineLoading(false);
        setShowBaseline(false);
        window.PCC.notify("Could not load that baseline's stored data.", "error");
      });
  }

  return (
    <React.Fragment>
      <GanttToolbar
        data={data}
        projectId={projectId}
        allActivities={allActivities}
        wbsItems={wbsItems}
        filter={filter}
        setFilter={setFilter}
        zoom={zoom}
        setZoom={setZoom}
        onAddActivity={() => onSwitchToActivities(null)}
        onAddMilestone={() => onSwitchToActivities("milestone")}
        showBaseline={showBaseline}
        baselineId={baselineId}
        baselineLoading={baselineLoading}
        onToggleBaseline={handleToggleBaseline}
        onChangeBaselineId={handleChangeBaselineId}
      />

      <GanttChart
        data={data}
        schedule={schedule}
        allActivities={allActivities}
        wbsItems={wbsItems}
        filter={filter}
        zoom={zoom}
        showBaseline={showBaseline}
        baselineSnapshot={baselineSnapshot}
        baselineId={baselineId}
        scheduleId={scheduleId}
        onOpenDetail={setDetailActivityId}
        refresh={refresh}
        detailPanel={
          detailActivity ? (
            <ActivityDetailPanel
              activity={detailActivity}
              data={data}
              wbsItems={wbsItems}
              scheduleActivities={allActivities}
              relationships={relationships}
              scheduleId={scheduleId}
              onClose={() => setDetailActivityId(null)}
              onEditActivity={onEditActivity}
              onAddRelationship={onAddRelationship}
              refresh={refresh}
            />
          ) : null
        }
      />
    </React.Fragment>
  );
}

// ===== Activity Detail Panel =====

function DocumentReadinessSection({ activity, data }: ActivityDataProps) {
  const typesById: { [id: string]: any } = {};
  data.document_types.forEach((t) => {
    typesById[t.id] = t;
  });
  const rows = data.project_document_requirements.filter((r) => r.activity_id === activity.id && typesById[r.document_type_id]);

  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--divider)" }}>
      <p className="detail-item__label" style={{ marginBottom: "var(--space-2)" }}>
        DOCUMENT READINESS ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          No document requirements are linked to this activity yet — link one from Portfolio's Add/Edit Project form (Document Requirements section).
        </p>
      ) : (
        (() => {
          const statuses = rows.map((r) => computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date));
          const notReady = statuses.some((s) => s !== "available");
          return (
            <React.Fragment>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, margin: "0 0 var(--space-2)", color: notReady ? "var(--status-critical)" : "var(--status-on-track)" }}>
                {notReady ? "NOT READY — one or more governing documents are not yet Available" : "READY — every governing document is Available"}
              </p>
              {rows.map((r, idx) => {
                const t = typesById[r.document_type_id];
                const badgeInfo = REQUIREMENT_STATUS_BADGE[statuses[idx]];
                return (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", marginBottom: "var(--space-1)" }}>
                    <span>
                      {t.name + (t.code ? " (" + t.code + ")" : "") + (r.planned_submission_date ? " — due " + r.planned_submission_date : "")}
                    </span>
                    <span className={"status-badge status-badge--" + badgeInfo.className} style={{ fontSize: "var(--text-xs)" }}>
                      {badgeInfo.label}
                    </span>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })()
      )}
    </div>
  );
}

function LinkedRecordsSection({ activity, data }: ActivityDataProps) {
  const rows = getLinkedRecords(data, activity);
  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--divider)" }}>
      <p className="detail-item__label" style={{ marginBottom: "var(--space-2)" }}>
        LINKED RECORDS ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          No Risks/Issues, RFIs, Meetings, Documents, Daily Log entries, or Change Orders are linked to this activity yet — link one from that record's own Add/Edit form.
        </p>
      ) : (
        <div className="attention-list">
          {rows.map((row, i) => (
            <div key={i} className="attention-item attention-item--clickable" onClick={row.view}>
              <span className={"attention-item__icon attention-item__icon--" + (row.badge ? row.badge.className : "info")} />
              <div className="attention-item__body">
                <div className="attention-item__text">{row.text}</div>
                {row.badge ? <div className="attention-item__meta">{row.badge.label}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecoveryActionForm({ editing, isNew, activity, data, onDone }: RecoveryActionFormProps) {
  const [description, setDescription] = useState(editing.description || "");
  const [responsiblePerson, setResponsiblePerson] = useState(editing.responsible_person || "");
  const [targetDate, setTargetDate] = useState(editing.target_recovery_date || "");
  const [status, setStatus] = useState(editing.status || "open");
  const [estRecoveryDays, setEstRecoveryDays] = useState(editing.estimated_recovery_days == null ? "" : editing.estimated_recovery_days);
  const [estCost, setEstCost] = useState(editing.estimated_cost == null ? "" : editing.estimated_cost);
  const [actualRecoveryDays, setActualRecoveryDays] = useState(editing.actual_recovery_days == null ? "" : editing.actual_recovery_days);
  const [delayId, setDelayId] = useState(editing.delay_id || "");
  const [mitigationType, setMitigationType] = useState(editing.mitigation_type || "other");
  const [comments, setComments] = useState(editing.comments || "");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    setError("");
    saveRecoveryAction(isNew, editing.id, activity, {
      description: description.trim(),
      responsible_person: responsiblePerson,
      target_recovery_date: targetDate,
      status: status,
      estimated_recovery_days: estRecoveryDays === "" ? null : Number(estRecoveryDays),
      estimated_cost: estCost === "" ? null : Number(estCost),
      actual_recovery_days: actualRecoveryDays === "" ? null : Number(actualRecoveryDays),
      delay_id: delayId,
      mitigation_type: mitigationType,
      comments: comments,
      updated_at: new Date().toISOString(),
    });
    onDone();
  }

  const delaysForActivity = data.delay_records.filter((dr) => dr.activity_id === activity.id);

  return (
    <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="recactionfield-description">Description *</label>
            <textarea id="recactionfield-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="recactionfield-responsible_person">Responsible Person</label>
            <input id="recactionfield-responsible_person" type="text" value={responsiblePerson} onChange={(e) => setResponsiblePerson(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="recactionfield-target_recovery_date">Target Recovery Date</label>
            <input id="recactionfield-target_recovery_date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="recactionfield-status">Status</label>
            <select id="recactionfield-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {window.PCC.store.RECOVERY_ACTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RECOVERY_ACTION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="recactionfield-estimated_recovery_days">Estimated Recovery (days)</label>
            <input id="recactionfield-estimated_recovery_days" type="number" value={estRecoveryDays} onChange={(e) => setEstRecoveryDays(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="recactionfield-estimated_cost">Estimated Cost</label>
            <input id="recactionfield-estimated_cost" type="number" value={estCost} onChange={(e) => setEstCost(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="recactionfield-actual_recovery_days">Actual Recovery (days)</label>
            <input id="recactionfield-actual_recovery_days" type="number" value={actualRecoveryDays} onChange={(e) => setActualRecoveryDays(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="recactionfield-delay_id">Responds to Delay</label>
            <select id="recactionfield-delay_id" value={delayId} onChange={(e) => setDelayId(e.target.value)}>
              <option value="">No specific delay</option>
              {delaysForActivity.map((dr) => (
                <option key={dr.id} value={dr.id}>
                  {dr.description || "(untitled delay)"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="recactionfield-mitigation_type">Mitigation Type</label>
            <select id="recactionfield-mitigation_type" value={mitigationType} onChange={(e) => setMitigationType(e.target.value)}>
              {window.PCC.store.MITIGATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MITIGATION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="recactionfield-comments">Comments</label>
          <textarea id="recactionfield-comments" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
        </div>
        {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Recovery Action" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function RecoveryActionsSection({ activity, data, refresh }: RecoveryActionsSectionProps) {
  const [editingRecoveryActionId, setEditingRecoveryActionId] = useState<string | null>(null);
  const rows = data.recovery_actions
    .filter((r) => r.activity_id === activity.id)
    .sort((a, b) => (a.target_recovery_date || "9999-99-99").localeCompare(b.target_recovery_date || "9999-99-99"));

  let editing = null;
  if (editingRecoveryActionId) {
    editing = editingRecoveryActionId === "new" ? window.PCC.store.newRecoveryAction({ activity_id: activity.id, project_id: activity.project_id }) : rows.find((r) => r.id === editingRecoveryActionId);
  }

  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--divider)" }}>
      <p className="detail-item__label" style={{ marginBottom: "var(--space-2)" }}>
        RECOVERY ACTIONS ({rows.length})
      </p>
      <button className="btn btn--ghost" style={{ marginBottom: "var(--space-2)" }} onClick={() => setEditingRecoveryActionId("new")}>
        + Add Recovery Action
      </button>
      {editing ? (
        <RecoveryActionForm
          editing={editing}
          isNew={editingRecoveryActionId === "new"}
          activity={activity}
          data={data}
          onDone={() => {
            setEditingRecoveryActionId(null);
            refresh();
          }}
        />
      ) : null}
      {rows.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          No recovery actions logged against this activity yet.
        </p>
      ) : (
        rows.map((r) => {
          const overdue = recoveryActionOverdue(r);
          return (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)", marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
              <div>
                <strong>{r.description}</strong>{" "}
                <span className="text-secondary" style={{ fontSize: 12 }}>
                  ({MITIGATION_TYPE_LABELS[r.mitigation_type || ""]})
                </span>
                <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  {(r.responsible_person ? r.responsible_person + " · " : "") +
                    (r.target_recovery_date ? "target " + r.target_recovery_date : "no target date") +
                    (r.estimated_recovery_days != null ? " · est. " + r.estimated_recovery_days + "d recovery" : "") +
                    (r.actual_recovery_days != null ? " · actual " + r.actual_recovery_days + "d" : "") +
                    (fmtMoney(r.estimated_cost) != null ? " · est. cost " + fmtMoney(r.estimated_cost) : "") +
                    (r.delay_id ? " · linked to delay" : "")}
                </p>
                {r.comments ? (
                  <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    {r.comments}
                  </p>
                ) : null}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
                <span className={"status-badge status-badge--" + (overdue ? "critical" : r.status === "completed" ? "complete" : r.status === "cancelled" ? "info" : "at_risk")} style={{ fontSize: "var(--text-xs)" }}>
                  {overdue ? "Overdue" : RECOVERY_ACTION_STATUS_LABELS[r.status]}
                </span>
                <button className="btn btn--ghost" onClick={() => setEditingRecoveryActionId(r.id)}>
                  Edit
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    deleteRecoveryAction(r.id);
                    refresh();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ImpactSummaryRow({ label, value, colorVar }: ImpactSummaryRowProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", fontSize: "var(--text-xs)", marginTop: 2 }}>
      <span className="text-secondary">{label}</span>
      <span style={{ fontWeight: 600, color: colorVar ? "var(" + colorVar + ")" : undefined }}>{value}</span>
    </div>
  );
}

function DelayScheduleImpact({ delayRecord, links, data, scheduleId }: DelayScheduleImpactProps) {
  const boxStyle = { marginTop: "var(--space-2)", padding: "var(--space-2) var(--space-3)", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", background: "var(--bg-default)" };

  if (links.length === 0) {
    return (
      <div className="text-secondary" style={Object.assign({ fontSize: "var(--text-sm)" }, boxStyle)}>
        Schedule Impact Not Yet Assessed — no activity linked.
      </div>
    );
  }

  const impact = computeDelayImpact(delayRecord, links, data);

  if (!impact.any_schedule_calculated) {
    return (
      <div style={boxStyle}>
        <p className="text-secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", margin: "0 0 4px" }}>
          IMPACT SUMMARY
        </p>
        <ImpactSummaryRow label="Status" value="Schedule not yet calculated" />
        <p className="text-secondary" style={{ fontSize: "var(--text-xs)", margin: "4px 0 0" }}>
          Run Calculate Schedule on this schedule for float/criticality/project-impact figures.
        </p>
      </div>
    );
  }

  const worst =
    impact.per_activity.reduce<DelayActivityImpact | null>((best, a) => {
      if (a.float_consumed == null) return best;
      if (!best || a.float_consumed > (best.float_consumed as number)) return a;
      return best;
    }, null) || impact.per_activity[0];

  const milestoneSlippageDays = impact.milestone_impact ? impact.milestone_impact.finish_slippage_days : null;

  let projectImpactDays: number | null | undefined = null;
  let projectImpactRow;
  if (impact.overall_criticality === "critical") {
    const sid = activityScheduleId(data, delayRecord, scheduleId);
    const projectImpact = sid ? computeProjectFinishImpact(sid, data) : { available: false };
    if (projectImpact.available) {
      projectImpactDays = projectImpact.project_impact_days;
      projectImpactRow = (
        <ImpactSummaryRow
          label="Project Finish Impact"
          value={projectImpactDays === 0 ? "No current impact" : ((projectImpactDays || 0) > 0 ? "+" : "") + projectImpactDays + "d"}
          colorVar={(projectImpactDays || 0) > 0 ? "--status-critical" : null}
        />
      );
    } else {
      projectImpactRow = <ImpactSummaryRow label="Project Finish Impact" value={"Not available — " + (projectImpact.reason || "schedule incomplete")} />;
    }
  } else {
    projectImpactRow = <ImpactSummaryRow label="Project Finish Impact" value="No current impact" />;
  }

  const status = deriveDelayStatusLabel(impact, milestoneSlippageDays, projectImpactDays);

  return (
    <div style={boxStyle}>
      <p className="text-secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", margin: "0 0 4px" }}>
        IMPACT SUMMARY
      </p>
      <ImpactSummaryRow
        label="Activity Impact"
        value={worst && worst.finish_slippage_days != null ? (worst.finish_slippage_days >= 0 ? "+" : "") + worst.finish_slippage_days + "d (" + (worst.activity_name || "activity") + ")" : "—"}
      />
      <ImpactSummaryRow
        label="Float"
        value={
          worst && worst.current_total_float != null
            ? "Original " + (worst.original_total_float != null ? worst.original_total_float + "d" : "—") + " → Current " + worst.current_total_float + "d (Consumed " + (worst.float_consumed != null ? worst.float_consumed + "d" : "—") + ")"
            : "Not yet calculated"
        }
      />
      {!delayRecord.milestone_activity_id ? (
        <ImpactSummaryRow label="Milestone Impact" value="None" />
      ) : !impact.milestone_impact ? (
        <ImpactSummaryRow label="Milestone Impact" value="Linked milestone not found" colorVar="--status-at-risk" />
      ) : (
        <ImpactSummaryRow
          label="Milestone Impact"
          value={(impact.milestone_impact.activity_name || "Milestone") + (milestoneSlippageDays != null ? ": " + (milestoneSlippageDays > 0 ? "+" : "") + milestoneSlippageDays + "d" : " — not yet calculated")}
          colorVar={(milestoneSlippageDays || 0) > 0 ? "--status-critical" : null}
        />
      )}
      {projectImpactRow}
      <ImpactSummaryRow label="Status" value={status.text} colorVar={status.colorVar} />
      <p className="text-secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", margin: "var(--space-2) 0 4px" }}>
        AFFECTED ACTIVITIES ({impact.per_activity.length})
      </p>
      {impact.per_activity.map((a, i) => (
        <div key={i} className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: 2 }}>
          {(a.activity_name || "(activity)") +
            (delayRecord.milestone_activity_id === a.activity_id ? " (milestone)" : "") +
            " — Original Finish " +
            (a.original_planned_finish || "—") +
            " → Current Forecast " +
            (a.forecast_finish || "—") +
            (a.finish_slippage_days != null ? " (" + (a.finish_slippage_days >= 0 ? "+" : "") + a.finish_slippage_days + "d)" : "") +
            " · Float " +
            (a.current_total_float != null ? a.current_total_float + "d" : "not calculated") +
            (a.criticality ? " · " + DELAY_CRITICALITY_LABELS[a.criticality] : "")}
        </div>
      ))}
    </div>
  );
}

function RecoveryForecastProgression({ delayRecord, links, data }: RecoveryForecastProgressionProps) {
  if (links.length === 0) return null;
  const forecast = computeRecoveryForecast(delayRecord, links, data.recovery_actions, data);
  if (!forecast.available) return null;

  return (
    <div style={{ marginTop: "var(--space-2)", padding: "var(--space-2) var(--space-3)", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", background: "var(--bg-default)" }}>
      <p className="text-secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", margin: "0 0 4px" }}>
        RECOVERY FORECAST
      </p>
      <ImpactSummaryRow label="Original Finish" value={forecast.original_finish || "—"} />
      <ImpactSummaryRow label="Delay Forecast" value={forecast.delay_forecast || "—"} />
      <ImpactSummaryRow
        label="Recovery Forecast"
        value={forecast.recovery_forecast ? forecast.recovery_forecast + ((forecast.active_recovery_days_planned || 0) > 0 ? " (" + forecast.active_recovery_days_planned + "d planned recovery)" : "") : "—"}
      />
      <ImpactSummaryRow label="Latest Forecast" value={forecast.latest_forecast || "—"} />
      <ImpactSummaryRow label="Actual Finish" value={forecast.actual_finish || "Not yet finished"} />
    </div>
  );
}

function DelayTimeline({ delayRecord }: DelayTimelineProps) {
  const history = delayRecord.status_history || [];
  return (
    <details style={{ marginTop: "var(--space-2)" }}>
      <summary className="text-secondary" style={{ cursor: "pointer", fontSize: "var(--text-xs)" }}>
        Timeline ({history.length})
      </summary>
      <div style={{ marginTop: 4 }}>
        {history.map((entry, i) => {
          const when = entry.changed_at ? new Date(entry.changed_at).toLocaleDateString() : "—";
          return (
            <div key={i} className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: 2 }}>
              {when + " — " + (DELAY_STATUS_LABELS[entry.status] || entry.status) + (entry.note ? ": " + entry.note : "")}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function DelayLinkActivityPicker({ delayRecord, links, data, scheduleId, refresh }: DelayLinkActivityPickerProps) {
  const [linking, setLinking] = useState(false);
  const [selection, setSelection] = useState("");

  if (!linking) {
    return (
      <div style={{ marginTop: "var(--space-2)" }}>
        <button type="button" className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }} onClick={() => setLinking(true)}>
          + Link Another Activity
        </button>
      </div>
    );
  }

  const linkedIds: { [id: string]: boolean } = {};
  links.forEach((l) => {
    linkedIds[l.activity_id] = true;
  });
  const sid = activityScheduleId(data, delayRecord, scheduleId);
  const candidateActivities = data.activities.filter((a) => a.schedule_id === sid && !linkedIds[a.id]).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <select aria-label="Select activity to link" value={selection} disabled={candidateActivities.length === 0} onChange={(e) => setSelection(e.target.value)}>
          {candidateActivities.length === 0 ? (
            <option value="">No other activities on this schedule</option>
          ) : (
            <React.Fragment>
              <option value="">Choose an activity…</option>
              {candidateActivities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || "(unnamed activity)"}
                </option>
              ))}
            </React.Fragment>
          )}
        </select>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!selection}
          onClick={() => {
            const act = data.activities.find((a) => a.id === selection);
            if (!act) return;
            linkDelayActivity(delayRecord.id, act);
            setLinking(false);
            setSelection("");
            refresh();
          }}
        >
          Link
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setLinking(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RecordLinkField({ id, label, records, labelFn, value, onChange }: RecordLinkFieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">(none)</option>
        {records.map((r) => (
          <option key={r.id} value={r.id}>
            {labelFn(r)}
          </option>
        ))}
      </select>
    </div>
  );
}

function DelayRecordForm({ editing, isNew, activity, data, onDone }: DelayRecordFormProps) {
  const [status, setStatus] = useState(editing.status || "open");
  const [category, setCategory] = useState(editing.delay_category || "other");
  const [responsibility, setResponsibility] = useState(editing.responsibility_classification || "unconfirmed");
  const [cause, setCause] = useState(editing.delay_cause || "other");
  const [delayDays, setDelayDays] = useState(editing.delay_days == null ? "" : editing.delay_days);
  const [actualDays, setActualDays] = useState(editing.actual_impact_days == null ? "" : editing.actual_impact_days);
  const [identifiedDate, setIdentifiedDate] = useState(editing.identified_date || "");
  const [responsibleParty, setResponsibleParty] = useState(editing.responsible_party || "");
  const [isExcusable, setIsExcusable] = useState(!!editing.is_excusable);
  const [milestoneId, setMilestoneId] = useState(editing.milestone_activity_id || "");
  const [riskId, setRiskId] = useState(editing.risk_id || "");
  const [issueId, setIssueId] = useState(editing.issue_id || "");
  const [rfiId, setRfiId] = useState(editing.rfi_id || "");
  const [dailyLogId, setDailyLogId] = useState(editing.daily_log_id || "");
  const [meetingId, setMeetingId] = useState(editing.meeting_id || "");
  const [vendorId, setVendorId] = useState(editing.vendor_id || "");
  const [changeOrderId, setChangeOrderId] = useState(editing.change_order_id || "");
  const [immediateCause, setImmediateCause] = useState(editing.immediate_cause || "");
  const [underlyingCause, setUnderlyingCause] = useState(editing.underlying_cause || "");
  const [description, setDescription] = useState(editing.description || "");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    setError("");
    saveDelayRecord(isNew, editing.id, editing.status, activity, {
      status: status,
      delay_category: category,
      responsibility_classification: responsibility,
      delay_cause: cause,
      delay_days: delayDays === "" ? null : Number(delayDays),
      actual_impact_days: actualDays === "" ? null : Number(actualDays),
      identified_date: identifiedDate,
      responsible_party: responsibleParty,
      is_excusable: isExcusable,
      immediate_cause: immediateCause,
      underlying_cause: underlyingCause,
      milestone_activity_id: milestoneId,
      risk_id: riskId,
      issue_id: issueId,
      rfi_id: rfiId,
      daily_log_id: dailyLogId,
      meeting_id: meetingId,
      vendor_id: vendorId,
      change_order_id: changeOrderId,
      description: description.trim(),
      updated_at: new Date().toISOString(),
    });
    onDone();
  }

  const milestones = data.activities
    .filter((a) => a.schedule_id === activity.schedule_id && a.activity_type === "milestone")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const projectVendorIds: { [id: string]: boolean } = {};
  data.vendor_project_links.filter((l) => l.project_id === activity.project_id).forEach((l) => {
    projectVendorIds[l.vendor_id || ""] = true;
  });

  return (
    <div className="panel" style={{ marginBottom: "var(--space-3)" }}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="delayfield-status">Status</label>
            <select id="delayfield-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {window.PCC.store.DELAY_RECORD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {DELAY_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="delayfield-delay_category">Delay Category</label>
            <select id="delayfield-delay_category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {window.PCC.store.DELAY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DELAY_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="delayfield-responsibility_classification">Responsibility Classification</label>
            <select id="delayfield-responsibility_classification" value={responsibility} onChange={(e) => setResponsibility(e.target.value)}>
              {window.PCC.store.DELAY_RESPONSIBILITY_CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {DELAY_RESPONSIBILITY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="delayfield-delay_cause">Delay Cause (contractual bucket)</label>
            <select id="delayfield-delay_cause" value={cause} onChange={(e) => setCause(e.target.value)}>
              {window.PCC.store.DELAY_RECORD_CAUSES.map((c) => (
                <option key={c} value={c}>
                  {DELAY_CAUSE_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="delayfield-delay_days">Estimated Impact (days)</label>
            <input id="delayfield-delay_days" type="number" value={delayDays} onChange={(e) => setDelayDays(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="delayfield-actual_impact_days">Actual Impact (days)</label>
            <input id="delayfield-actual_impact_days" type="number" value={actualDays} onChange={(e) => setActualDays(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="delayfield-identified_date">Identified Date</label>
            <input id="delayfield-identified_date" type="date" value={identifiedDate} onChange={(e) => setIdentifiedDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="delayfield-responsible_party">Responsible Party</label>
            <input id="delayfield-responsible_party" type="text" value={responsibleParty} onChange={(e) => setResponsibleParty(e.target.value)} />
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <input id="delayfield-is_excusable" type="checkbox" checked={isExcusable} onChange={(e) => setIsExcusable(e.target.checked)} />
              Excusable
            </label>
          </div>
          <div className="field">
            <label htmlFor="delayfield-milestone_activity_id">Affected Milestone</label>
            <select id="delayfield-milestone_activity_id" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
              <option value="">(none)</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || "(unnamed milestone)"}
                </option>
              ))}
            </select>
          </div>
          <p className="text-secondary" style={{ gridColumn: "1 / -1", fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", margin: "var(--space-2) 0 0" }}>
            RELATED RECORDS (optional)
          </p>
          <RecordLinkField
            id="delayfield-risk_id"
            label="Related Risk"
            records={data.risks.filter((r) => r.project_id === activity.project_id && r.type === "risk")}
            labelFn={(r) => r.title || "(untitled risk)"}
            value={riskId}
            onChange={setRiskId}
          />
          <RecordLinkField
            id="delayfield-issue_id"
            label="Related Issue"
            records={data.risks.filter((r) => r.project_id === activity.project_id && r.type === "issue")}
            labelFn={(r) => r.title || "(untitled issue)"}
            value={issueId}
            onChange={setIssueId}
          />
          <RecordLinkField
            id="delayfield-rfi_id"
            label="Related RFI / TQ"
            records={data.rfis.filter((r) => r.project_id === activity.project_id)}
            labelFn={(r) => (r.number ? r.number + " — " : "") + (r.subject || "(untitled)")}
            value={rfiId}
            onChange={setRfiId}
          />
          <RecordLinkField
            id="delayfield-daily_log_id"
            label="Related Daily Log"
            records={data.daily_logs.filter((r) => r.project_id === activity.project_id).sort((a, b) => (b.log_date || "").localeCompare(a.log_date || ""))}
            labelFn={(r) => "Daily Log — " + (r.log_date || "(undated)")}
            value={dailyLogId}
            onChange={setDailyLogId}
          />
          <RecordLinkField
            id="delayfield-meeting_id"
            label="Related Meeting"
            records={data.meetings.filter((r) => r.project_id === activity.project_id)}
            labelFn={(r) => (r.title || "(untitled meeting)") + (r.meeting_date ? " (" + r.meeting_date + ")" : "")}
            value={meetingId}
            onChange={setMeetingId}
          />
          <RecordLinkField
            id="delayfield-vendor_id"
            label="Related Vendor"
            records={data.vendors.filter((v) => projectVendorIds[v.id]).sort((a, b) => (a.vendor_name || "").localeCompare(b.vendor_name || ""))}
            labelFn={(v) => v.vendor_name || "(unnamed vendor)"}
            value={vendorId}
            onChange={setVendorId}
          />
          <RecordLinkField
            id="delayfield-change_order_id"
            label="Related Change / Variation"
            records={data.change_orders.filter((r) => r.project_id === activity.project_id)}
            labelFn={(r) => (r.number ? r.number + " — " : "") + (r.title || "(untitled)")}
            value={changeOrderId}
            onChange={setChangeOrderId}
          />
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="delayfield-immediate_cause">Immediate Cause — what directly prevented/delayed the activity?</label>
            <input id="delayfield-immediate_cause" type="text" value={immediateCause} onChange={(e) => setImmediateCause(e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="delayfield-underlying_cause">Underlying Cause — why did that condition occur?</label>
            <input id="delayfield-underlying_cause" type="text" value={underlyingCause} onChange={(e) => setUnderlyingCause(e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="delayfield-description">Description *</label>
            <textarea id="delayfield-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Delay Record" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function DelayRecordsSection({ activity, data, scheduleId, refresh }: DelayRecordsSectionProps) {
  const [editingDelayRecordId, setEditingDelayRecordId] = useState<string | null>(null);
  const rows = data.delay_records.filter((r) => r.activity_id === activity.id).sort((a, b) => (b.identified_date || "").localeCompare(a.identified_date || ""));

  let editing = null;
  if (editingDelayRecordId) {
    editing = editingDelayRecordId === "new" ? window.PCC.store.newDelayRecord({ activity_id: activity.id, project_id: activity.project_id }) : rows.find((r) => r.id === editingDelayRecordId);
  }

  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--divider)" }}>
      <p className="detail-item__label" style={{ marginBottom: "var(--space-2)" }}>
        DELAY RECORDS ({rows.length})
      </p>
      <button className="btn btn--ghost" style={{ marginBottom: "var(--space-2)" }} onClick={() => setEditingDelayRecordId("new")}>
        + Add Delay Record
      </button>
      {editing ? (
        <DelayRecordForm
          editing={editing}
          isNew={editingDelayRecordId === "new"}
          activity={activity}
          data={data}
          onDone={() => {
            setEditingDelayRecordId(null);
            refresh();
          }}
        />
      ) : null}
      {rows.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          No delay records logged against this activity yet.
        </p>
      ) : (
        rows.map((r) => {
          const relatedText = describeRelatedRecords(r, data);
          const links = data.delay_activity_links.filter((l) => l.delay_id === r.id);
          return (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)", marginBottom: "var(--space-3)", fontSize: "var(--text-sm)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{r.description}</strong>
                <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  {DELAY_CATEGORY_LABELS[r.delay_category || ""] +
                    " · " +
                    DELAY_RESPONSIBILITY_LABELS[r.responsibility_classification || ""] +
                    " · " +
                    DELAY_CAUSE_LABELS[r.delay_cause || ""] +
                    (r.responsible_party ? " (" + r.responsible_party + ")" : "") +
                    (r.delay_days != null ? " · est. " + r.delay_days + "d" : "") +
                    (r.actual_impact_days != null ? " · actual " + r.actual_impact_days + "d" : "") +
                    (r.identified_date ? " · identified " + r.identified_date : "")}
                </p>
                {relatedText ? (
                  <p className="text-secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    Related: {relatedText}
                  </p>
                ) : null}
                <DelayScheduleImpact delayRecord={r} links={links} data={data} scheduleId={scheduleId} />
                <RecoveryForecastProgression delayRecord={r} links={links} data={data} />
                <DelayTimeline delayRecord={r} />
                <DelayLinkActivityPicker delayRecord={r} links={links} data={data} scheduleId={scheduleId} refresh={refresh} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-2)", flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <span className={"status-badge status-badge--" + DELAY_STATUS_BADGE_CLASS[r.status || ""]} style={{ fontSize: "var(--text-xs)" }}>
                    {DELAY_STATUS_LABELS[r.status || ""]}
                  </span>
                  <span className={"status-badge status-badge--" + (r.is_excusable ? "complete" : "at_risk")} style={{ fontSize: "var(--text-xs)" }}>
                    {r.is_excusable ? "Excusable" : "Non-Excusable"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button className="btn btn--ghost" onClick={() => setEditingDelayRecordId(r.id)}>
                    Edit
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      deleteDelayRecord(r.id);
                      refresh();
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function DelayRecoveryGapNote({ activity, data }: ActivityDataProps) {
  const gap = delayRecoveryGap(activity, data);
  if (!gap) return null;
  return (
    <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-3) 0 0" }}>
      {gap.gapDays > 0
        ? gap.delayDays + "d delay logged, " + gap.recoveryDays + "d recovery estimated — " + gap.gapDays + "d unaddressed."
        : gap.delayDays + "d delay logged, " + gap.recoveryDays + "d recovery estimated — fully addressed."}
    </p>
  );
}

function ActivityDetailPanel({ activity, data, wbsItems, scheduleActivities, relationships, scheduleId, onClose, onEditActivity, onAddRelationship, refresh }: ActivityDetailPanelProps) {
  function detailItem(label: string, value: any) {
    return (
      <div key={label}>
        <span className="detail-item__label">{label}</span>
        <div>{value === null || value === undefined || value === "" ? "—" : String(value)}</div>
      </div>
    );
  }

  const vendor = activity.vendor_id ? data.vendors.find((v) => v.id === activity.vendor_id) : null;
  const preds = relationships.filter((r) => r.successor_id === activity.id);
  const succs = relationships.filter((r) => r.predecessor_id === activity.id);

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)", borderColor: "var(--signal-amber)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-3)" }}>
        <h3>{activity.name || "(unnamed activity)"}</h3>
        <button className="btn btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="detail-grid">
        {detailItem("Activity ID", activity.external_id || activity.id)}
        {detailItem("WBS", wbsName(wbsItems, activity.wbs_id))}
        {detailItem("Type", ACTIVITY_TYPE_LABELS[activity.activity_type])}
        {detailItem("Status", ACTIVITY_STATUS_LABELS[activity.status || ""])}
        {detailItem("Duration (days)", activity.duration)}
        {detailItem("Remaining Duration (days)", activity.remaining_duration)}
        {detailItem("Planned Start", activity.planned_start)}
        {detailItem("Planned Finish", activity.planned_finish)}
        {detailItem(
          "Float",
          activity.total_float == null
            ? "Not yet calculated"
            : activity.total_float <= 0
            ? "Critical (0 float)"
            : activity.total_float + " day(s) total, " + (activity.free_float == null ? "—" : activity.free_float) + " free"
        )}
        {detailItem("Out of Sequence", activity.is_out_of_sequence ? "Yes — actual progress preceded predecessor logic" : "No")}
        {detailItem("% Complete", (activity.percent_complete || 0) + "%")}
        {detailItem("Physical Progress", (activity.physical_progress || 0) + "%")}
        {detailItem("Discipline", activity.discipline)}
        {detailItem("Contractor", activity.contractor)}
        {detailItem("Responsible Person", activity.responsible_person)}
        {detailItem("Vendor", vendor ? vendor.vendor_name || "(unnamed vendor)" : activity.vendor_id ? "(deleted vendor)" : "")}
        {detailItem("Constraint", activity.constraint_type ? activity.constraint_type + (activity.constraint_date ? " (" + activity.constraint_date + ")" : "") : "")}
      </div>

      {activity.notes ? (
        <p style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>
          <strong>Notes:</strong> {activity.notes}
        </p>
      ) : null}

      <div style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>
        <p>
          <strong>Predecessors:</strong>{" "}
          {preds.length ? preds.map((r) => activityName(scheduleActivities, r.predecessor_id) + " (" + r.type + (r.lag ? ", lag " + r.lag : "") + ")").join(", ") : "none"}
        </p>
        <p style={{ marginTop: "var(--space-1)" }}>
          <strong>Successors:</strong>{" "}
          {succs.length ? succs.map((r) => activityName(scheduleActivities, r.successor_id) + " (" + r.type + (r.lag ? ", lag " + r.lag : "") + ")").join(", ") : "none"}
        </p>
      </div>

      <LinkedRecordsSection activity={activity} data={data} />
      <DocumentReadinessSection activity={activity} data={data} />
      <RecoveryActionsSection activity={activity} data={data} refresh={refresh} />
      <DelayRecordsSection activity={activity} data={data} scheduleId={scheduleId} refresh={refresh} />
      <DelayRecoveryGapNote activity={activity} data={data} />

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <button className="btn btn--primary" onClick={() => onEditActivity(activity.id)}>
          Edit
        </button>
        <button className="btn btn--ghost" disabled={scheduleActivities.length < 2} onClick={() => onAddRelationship(activity.id)}>
          + Add Relationship
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            deleteActivityWithConfirm(activity, () => {
              onClose();
              refresh();
            });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ===== Baselines tab =====

function BaselineCompareResult({ result, currentScheduleName }: BaselineCompareResultProps) {
  const s = result.summary;
  const finishBit =
    s.project_finish_variance_days === null
      ? "Overall finish variance: not comparable (missing dates on one side)."
      : "Overall finish variance: " +
        (s.project_finish_variance_days > 0 ? "+" : "") +
        s.project_finish_variance_days +
        " day(s) (" +
        (s.project_finish_variance_days > 0 ? "later" : s.project_finish_variance_days < 0 ? "earlier" : "unchanged") +
        " than baseline).";

  const changed = result.activities.matched
    .filter((m) => m.comparable && (m.finish_variance_days !== 0 || m.criticality_changed || m.calendar_changed || m.constraint_changed))
    .sort((a, b) => Math.abs(b.finish_variance_days) - Math.abs(a.finish_variance_days));

  const floatErosion = result.activities.matched
    .filter((m) => m.baseline.total_float != null && m.current.total_float != null && m.baseline.total_float - m.current.total_float > 0)
    .map((m) => Object.assign({ erosion: m.baseline.total_float! - m.current.total_float! }, m))
    .sort((a, b) => b.erosion - a.erosion);

  return (
    <div className="panel" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-4)" }}>
      <h4 style={{ marginBottom: "var(--space-3)" }}>Baseline vs Current — comparing against "{currentScheduleName}"</h4>
      <p style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
        {s.activity_count_baseline} activities in baseline · {s.activity_count_current} in current · {s.added_count} added · {s.removed_count} removed
        {s.not_comparable_count ? " · " + s.not_comparable_count + " not comparable (no calculated or planned dates)" : ""}
        <br />
        {s.delayed_count} delayed · {s.on_time_count} on time · {s.ahead_count} ahead
        {s.max_delay_days > 0 ? " · worst slip: " + s.max_delay_days + " day(s)" : ""}
        <br />
        {finishBit}
        {result.relationship_changes.added || result.relationship_changes.removed ? (
          <React.Fragment>
            <br />
            Logic changes: {result.relationship_changes.added} added, {result.relationship_changes.removed} removed
          </React.Fragment>
        ) : null}
        {result.calendar_changes.modified_count || result.calendar_changes.added.length || result.calendar_changes.removed.length ? (
          <React.Fragment>
            <br />
            Calendar changes:{" "}
            {result.calendar_changes.modified_count ? result.calendar_changes.modified_count + " modified (" + result.calendar_changes.modified_names.join(", ") + ")" : ""}
            {result.calendar_changes.added.length ? (result.calendar_changes.modified_count ? " · " : "") + result.calendar_changes.added.length + " added" : ""}
            {result.calendar_changes.removed.length ? " · " + result.calendar_changes.removed.length + " removed" : ""}
            {s.calendar_changed_count ? " · " + s.calendar_changed_count + " activities affected" : ""}
          </React.Fragment>
        ) : null}
        {s.constraint_changed_count ? (
          <React.Fragment>
            <br />
            Constraint changes: {s.constraint_changed_count} activit{s.constraint_changed_count === 1 ? "y" : "ies"}
          </React.Fragment>
        ) : null}
        <br />
        {result.critical_path_changes.changed
          ? "Critical path movement: " + result.critical_path_changes.entered.length + " entered, " + result.critical_path_changes.left.length + " left (" + result.critical_path_changes.stable_count + " unchanged)"
          : "Critical path: unchanged (" + result.critical_path_changes.stable_count + " activities)"}
      </p>

      {changed.length > 0 ? (
        <React.Fragment>
          <div className="project-list">
            {changed.slice(0, 50).map((m, i) => {
              const varianceLabel = (m.finish_variance_days > 0 ? "+" : "") + m.finish_variance_days + " day(s)" + (m.mixed_date_sources ? " (baseline/current use different date sources — verify)" : "");
              return (
                <div key={i} className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                  <div>
                    <strong>{m.name}</strong>
                    <br />
                    <span className="text-secondary" style={{ fontSize: 12 }}>
                      Baseline finish: {m.baseline.finish || "—"} → Current finish: {m.current.finish || "—"} ({varianceLabel})
                      {m.criticality_changed ? " · criticality changed" : ""}
                      {m.calendar_changed ? " · calendar changed" : ""}
                      {m.constraint_changed ? " · constraint changed" : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {changed.length > 50 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              +{changed.length - 50} more changed activities not shown.
            </p>
          ) : null}
        </React.Fragment>
      ) : (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
          No finish-date or criticality changes among matched activities.
        </p>
      )}

      {floatErosion.length > 0 ? (
        <React.Fragment>
          <h4 style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>
            Float Erosion ({floatErosion.length}) — activities consuming float since baseline
          </h4>
          <div className="project-list">
            {floatErosion.slice(0, 20).map((m, i) => (
              <div key={i} className="detail-card" style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                <strong>{m.name}</strong>
                <br />
                <span className="text-secondary" style={{ fontSize: 12 }}>
                  {m.baseline.total_float}d → {m.current.total_float}d float (−{m.erosion}d){m.current.is_critical ? " · now critical" : ""}
                </span>
              </div>
            ))}
          </div>
          {floatErosion.length > 20 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              +{floatErosion.length - 20} more not shown.
            </p>
          ) : null}
        </React.Fragment>
      ) : null}

      {result.critical_path_changes.changed ? (
        <React.Fragment>
          <h4 style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)" }}>Critical Path Movement</h4>
          <div className="project-list">
            {result.critical_path_changes.entered.slice(0, 20).map((m, i) => (
              <div key={"e" + i} className="detail-card" style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                <strong>{m.name}</strong> — entered the critical path
              </div>
            ))}
            {result.critical_path_changes.left.slice(0, 20).map((m, i) => (
              <div key={"l" + i} className="detail-card" style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                <strong>{m.name}</strong> — left the critical path
              </div>
            ))}
          </div>
          {result.critical_path_changes.entered.length + result.critical_path_changes.left.length > 40 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)" }}>
              +{result.critical_path_changes.entered.length + result.critical_path_changes.left.length - 40} more not shown.
            </p>
          ) : null}
        </React.Fragment>
      ) : null}

      {result.activities.added.length > 0 || result.activities.removed.length > 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
          {result.activities.added.length ? result.activities.added.length + " activities exist in current but not in baseline. " : ""}
          {result.activities.removed.length ? result.activities.removed.length + " activities exist in baseline but not in current." : ""}
        </p>
      ) : null}
    </div>
  );
}

function BaselineRow({ b, scheduleId, refresh }: BaselineRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(b.name || "");
  const [compareState, setCompareState] = useState<{ open: boolean; pending: boolean; result: BaselineComparisonResult | null; error: string | null }>({ open: false, pending: false, result: null, error: null });

  function handleCompareClick() {
    if (compareState.open && !compareState.pending) {
      setCompareState({ open: false, pending: false, result: null, error: null });
      return;
    }
    setCompareState({ open: true, pending: true, result: null, error: null });
    runBaselineComparison(b, scheduleId)
      .then((result) => setCompareState({ open: true, pending: false, result: result, error: null }))
      .catch((err) => {
        console.error("Could not load/compare baseline", err);
        setCompareState({ open: true, pending: false, result: null, error: "Could not load this baseline's stored data." });
      });
  }

  return (
    <React.Fragment>
      <div className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <div>
          {renaming ? (
            <React.Fragment>
              <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} style={{ marginBottom: "var(--space-1)" }} />
              <div>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    const trimmed = renameValue.trim();
                    if (trimmed) renameBaseline(b.id, trimmed);
                    setRenaming(false);
                    refresh();
                  }}
                >
                  Save
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setRenaming(false)}>
                  Cancel
                </button>
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <strong>{b.name}</strong>
              {b.is_official ? <span className="status-badge status-badge--complete">Official</span> : null}
              <br />
              <span className="text-secondary" style={{ fontSize: 12 }}>
                Captured {new Date(b.captured_at || "").toLocaleString()} · {b.activity_count} activities · from Rev {b.schedule_revision_number}
                {b.baseline_project_finish ? " · project finish at capture " + b.baseline_project_finish : ""}
              </span>
            </React.Fragment>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button className="btn btn--ghost" disabled={!scheduleId} onClick={handleCompareClick}>
            {compareState.open && compareState.pending ? "Comparing…" : compareState.open ? "Hide Comparison" : "Compare to Current"}
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => {
              setRenameValue(b.name || "");
              setRenaming(true);
            }}
          >
            Rename
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => {
              toggleOfficialBaseline(b);
              refresh();
            }}
          >
            {b.is_official ? "Unmark Official" : "Mark Official"}
          </button>
          <button
            className="btn btn--ghost"
            disabled={!!b.is_official}
            title={b.is_official ? "Unmark as Official before deleting." : ""}
            onClick={() => {
              if (!confirm('Delete baseline "' + b.name + '"? This cannot be undone.')) return;
              deleteBaseline(b.id);
              refresh();
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {compareState.open && compareState.pending ? (
        <div className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          Loading stored baseline data…
        </div>
      ) : compareState.open && compareState.error ? (
        <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>{compareState.error}</p>
      ) : compareState.open && compareState.result ? (
        <BaselineCompareResult result={compareState.result} currentScheduleName={window.PCC.store.get().schedules.find((s) => s.id === scheduleId)?.name || "(no schedule selected)"} />
      ) : null}
    </React.Fragment>
  );
}

function BaselinesTab({ data, projectId, scheduleId, refresh }: BaselinesTabProps) {
  const baselines = data.schedule_baselines.filter((b) => b.project_id === projectId).sort((a, b) => new Date(b.captured_at || "").getTime() - new Date(a.captured_at || "").getTime());

  if (baselines.length === 0) {
    return <div className="panel empty-state">No baselines saved for this project yet. Click "Save Baseline" above to freeze the currently selected schedule's dates and logic for later comparison.</div>;
  }

  return (
    <React.Fragment>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
        Baselines from every schedule revision in this project. "Compare" checks a baseline against whichever schedule is currently selected above. At most one baseline can be Official — marking
        one locks it against deletion and drives Executive Center's Schedule Variance.
      </p>
      <div className="project-list">
        {baselines.map((b) => (
          <BaselineRow key={b.id} b={b} scheduleId={scheduleId} refresh={refresh} />
        ))}
      </div>
    </React.Fragment>
  );
}

// ===== What-If tab =====

function WhatIfTab({ data, scheduleId }: WhatIfTabProps) {
  const [activityId, setActivityId] = useState("");
  const [reduceDaysInput, setReduceDaysInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatIfResult | null>(null);

  const schedule = data.schedules.find((s) => s.id === scheduleId);
  const scheduleActivities = data.activities.filter((a) => a.schedule_id === scheduleId);
  const scheduleRelationships = data.relationships.filter((r) => r.schedule_id === scheduleId);

  if (scheduleActivities.length === 0) {
    return (
      <React.Fragment>
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          Explore “what if we recover N days on this activity” without changing anything — nothing here is saved. Decide on a number, then log it against a Recovery Action from the Activity Detail
          Panel.
        </p>
        <div className="panel empty-state">Add some activities before exploring a what-if scenario.</div>
      </React.Fragment>
    );
  }

  function handleRun() {
    const reduceDays = Number(reduceDaysInput);
    const outcome = runWhatIf(schedule!, scheduleActivities, scheduleRelationships, activityId, reduceDays);
    if (outcome.error) {
      setError(outcome.error);
      setResult(null);
    } else {
      setError(null);
      setResult(outcome.result || null);
    }
  }

  function handleReset() {
    setActivityId("");
    setReduceDaysInput("");
    setResult(null);
    setError(null);
  }

  return (
    <React.Fragment>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
        Explore “what if we recover N days on this activity” without changing anything — nothing here is saved. Decide on a number, then log it against a Recovery Action from the Activity Detail
        Panel.
      </p>
      <div className="panel">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="whatiffield-activity">Activity</label>
            <select id="whatiffield-activity" value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              <option value="">Select an activity…</option>
              {scheduleActivities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || "(unnamed activity)"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="whatiffield-days">Reduce Duration By (days)</label>
            <input id="whatiffield-days" type="number" min="0" value={reduceDaysInput} onChange={(e) => setReduceDaysInput(e.target.value)} />
          </div>
        </div>
        {error ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="button" className="btn btn--primary" onClick={handleRun}>
            Run What-If
          </button>
          {result ? (
            <button type="button" className="btn btn--ghost" onClick={handleReset}>
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="panel" style={{ marginTop: "var(--space-3)" }}>
          <h4 style={{ marginBottom: "var(--space-3)" }}>What-If Result — {result.activityName || "(unnamed activity)"}</h4>
          {result.actualReduction < result.requestedReduction ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
              Requested {result.requestedReduction}d, but this activity only had {result.actualReduction}d of {result.fieldToReduce === "remaining_duration" ? "remaining duration" : "duration"} to
              give — clamped at 0.
            </p>
          ) : null}
          {!result.wasCritical ? (
            <p style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)", color: "var(--status-at-risk)" }}>
              This activity was NOT on the critical path before this change — reducing its duration may not move the project finish at all.
            </p>
          ) : null}
          <p style={{ fontSize: "var(--text-sm)" }}>
            <strong>Project Finish:</strong> {result.beforeFinish || "—"} → {result.afterFinish || "—"}
            {result.varianceDays != null ? " (" + (result.varianceDays < 0 ? result.varianceDays + "d earlier" : result.varianceDays > 0 ? "+" + result.varianceDays + "d later" : "no change") + ")" : ""}
            <br />
            <strong>Critical Activities:</strong> {result.beforeCriticalCount} → {result.afterCriticalCount}
          </p>
          {result.newlyNonCritical.length > 0 ? (
            <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>No longer critical: {result.newlyNonCritical.join(", ")}</p>
          ) : null}
          {result.newlyCritical.length > 0 ? <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>Newly critical: {result.newlyCritical.join(", ")}</p> : null}
        </div>
      ) : null}
    </React.Fragment>
  );
}

// ===== Top-level page =====

var TABS = [
  { key: "activities", label: "Activities" },
  { key: "gantt", label: "Gantt" },
  { key: "wbs", label: "WBS" },
  { key: "relationships", label: "Relationships" },
  { key: "calendars", label: "Calendars" },
  { key: "baselines", label: "Baselines" },
  { key: "whatif", label: "What-If" },
];

export default function SchedulePage({ initialProjectId, initialScheduleId, initialTab, initialGanttDetailActivityId }: SchedulePageProps) {
  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);
  const data = getData();

  const [tab, setTab] = useState(() => initialTab || "activities");
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [excelEditorScheduleId, setExcelEditorScheduleId] = useState<string | null>(null);
  const [baselineSaving, setBaselineSaving] = useState(false);
  const [pendingRelationshipPrefillId, setPendingRelationshipPrefillId] = useState<string | null>(null);
  const [pendingActivityTypeHint, setPendingActivityTypeHint] = useState<string | null>(null);
  const [pendingEditActivityId, setPendingEditActivityId] = useState<string | null>(null);
  const [pendingGanttDetailActivityId] = useState(() => initialGanttDetailActivityId || null);

  const activeProjects = data.projects.filter((p) => !p.archived);

  const [projectId, setProjectIdState] = useState(() => {
    const ctxProjectId = initialProjectId || getProjectContext();
    if (ctxProjectId && activeProjects.some((p) => p.id === ctxProjectId)) return ctxProjectId;
    return activeProjects.length > 0 ? activeProjects[0].id : "";
  });
  const [scheduleId, setScheduleIdState] = useState(() => {
    if (initialScheduleId) return initialScheduleId;
    const projectSchedules = data.schedules.filter((s) => s.project_id === projectId);
    return projectSchedules.length > 0 ? projectSchedules[0].id : "";
  });

  function handleProjectChange(newProjectId: string) {
    setProjectIdState(newProjectId);
    setProjectContext(newProjectId);
    const projectSchedules = data.schedules.filter((s) => s.project_id === newProjectId);
    setScheduleIdState(projectSchedules.length > 0 ? projectSchedules[0].id : "");
  }

  function handleScheduleChange(newScheduleId: string) {
    setScheduleIdState(newScheduleId);
  }

  // Auto-correct scheduleId if it no longer belongs to the current project (e.g. after
  // an edit elsewhere) — same self-correcting behavior vanilla's renderScheduleBar had.
  const projectSchedules = data.schedules.filter((s) => s.project_id === projectId);
  const effectiveScheduleId = projectSchedules.some((s) => s.id === scheduleId) ? scheduleId : projectSchedules.length > 0 ? projectSchedules[0].id : "";
  if (effectiveScheduleId !== scheduleId && projectSchedules.length > 0) {
    // Deferred to next tick via a plain setState call during render is unsafe; instead
    // just use the effective id for this render's reads below and let onScheduleChange
    // (or the project switch above) keep it consistent going forward.
  }
  const currentScheduleId = effectiveScheduleId || scheduleId;

  function switchTab(key: string) {
    setTab(key);
    setPendingRelationshipPrefillId(null);
    setPendingActivityTypeHint(null);
    setPendingEditActivityId(null);
  }

  function openImport() {
    setImportPanelOpen(true);
  }
  function openExcelEditor(currentSchedule: PCCSchedule | undefined) {
    if (currentSchedule) setExcelEditorScheduleId(currentSchedule.id);
  }
  function exportMsp(schedule: PCCSchedule | undefined) {
    if (schedule) exportMspXml(schedule);
  }
  function exportXer(schedule: PCCSchedule | undefined) {
    if (schedule) exportP6Xer(schedule);
  }

  function handleCalculate() {
    runCalculation(currentScheduleId);
    refresh();
  }

  function handleSaveBaseline() {
    const schedule = data.schedules.find((s) => s.id === currentScheduleId);
    if (!schedule) return;
    setBaselineSaving(true);
    captureBaseline(schedule).finally(() => {
      setBaselineSaving(false);
      refresh();
    });
  }

  let editingSchedule = null;
  if (editingScheduleId) {
    editingSchedule = editingScheduleId === "new" ? window.PCC.store.newSchedule({}) : data.schedules.find((s) => s.id === editingScheduleId);
  }

  return (
    <React.Fragment>
      <h2 className="focus-mode-hide" style={{ marginBottom: "var(--space-2)" }}>
        Schedule
      </h2>
      <p className="text-secondary focus-mode-hide" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
        Hand-enter activities, import from Excel, or calculate the critical path. View the Gantt tab for a timeline, and save/compare baselines from the Baselines tab.
      </p>

      <ScheduleBar
        data={data}
        projectId={projectId}
        scheduleId={currentScheduleId}
        onProjectChange={handleProjectChange}
        onScheduleChange={handleScheduleChange}
        onEditSchedule={() => setEditingScheduleId(currentScheduleId)}
        onNewSchedule={() => setEditingScheduleId("new")}
        onOpenImport={openImport}
        onOpenExcelEditor={openExcelEditor}
        onExportMsp={exportMsp}
        onExportXer={exportXer}
        onCalculate={handleCalculate}
        baselineSaving={baselineSaving}
        onSaveBaseline={handleSaveBaseline}
      />

      {importPanelOpen ? (
        <ImportPanel
          data={data}
          projectId={projectId}
          onDone={() => setImportPanelOpen(false)}
          onImported={(newScheduleId) => {
            setImportPanelOpen(false);
            setScheduleIdState(newScheduleId);
            setTab("activities");
            refresh();
          }}
        />
      ) : null}

      {excelEditorScheduleId
        ? (() => {
            const excelSchedule = data.schedules.find((s) => s.id === excelEditorScheduleId);
            if (!excelSchedule) return null;
            return (
              <ExcelEditorPanel
                schedule={excelSchedule}
                data={data}
                onDone={() => {
                  setExcelEditorScheduleId(null);
                  setTab("activities");
                  refresh();
                }}
              />
            );
          })()
        : null}

      {editingSchedule ? (
        <ScheduleForm
          schedule={editingSchedule}
          isNew={editingScheduleId === "new"}
          projectId={projectId}
          onDone={(newId) => {
            if (newId) setScheduleIdState(newId);
            setEditingScheduleId(null);
            refresh();
          }}
        />
      ) : null}

      {!currentScheduleId ? (
        <div className="panel empty-state">{activeProjects.length === 0 ? "Add a project in Portfolio first, then create a schedule against it." : "No schedule selected. Click “+ New Schedule” above to create one."}</div>
      ) : (
        <React.Fragment>
          <div className="tab-bar" style={{ marginTop: "var(--space-4)" }}>
            {TABS.map((t) => (
              <button key={t.key} className={"tab-btn" + (tab === t.key ? " tab-btn--active" : "")} onClick={() => switchTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "activities" ? (
            <ActivitiesTab
              data={data}
              projectId={projectId}
              scheduleId={currentScheduleId}
              initialActivityTypeHint={pendingActivityTypeHint}
              initialEditingActivityId={pendingEditActivityId}
              refresh={refresh}
            />
          ) : null}
          {tab === "gantt" ? (
            <GanttTab
              data={data}
              projectId={projectId}
              scheduleId={currentScheduleId}
              initialDetailActivityId={pendingGanttDetailActivityId}
              onSwitchToActivities={(typeHint) => {
                setTab("activities");
                setPendingActivityTypeHint(typeHint);
              }}
              onEditActivity={(activityId) => {
                setTab("activities");
                setPendingEditActivityId(activityId);
              }}
              onAddRelationship={(activityId) => {
                setTab("relationships");
                setPendingRelationshipPrefillId(activityId);
              }}
              refresh={refresh}
            />
          ) : null}
          {tab === "wbs" ? <WbsTab data={data} projectId={projectId} scheduleId={currentScheduleId} refresh={refresh} /> : null}
          {tab === "relationships" ? (
            <RelationshipsTab data={data} scheduleId={currentScheduleId} initialPrefillPredecessorId={pendingRelationshipPrefillId} refresh={refresh} />
          ) : null}
          {tab === "calendars" ? <CalendarsTab data={data} projectId={projectId} refresh={refresh} /> : null}
          {tab === "baselines" ? <BaselinesTab data={data} projectId={projectId} scheduleId={currentScheduleId} refresh={refresh} /> : null}
          {tab === "whatif" ? <WhatIfTab data={data} scheduleId={currentScheduleId} /> : null}
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
