/* Thin service wrapper for the Schedule page's React migration. Mirrors the vanilla
 * src/js/pages/schedule.js exactly — every calculation still runs through the real,
 * unchanged domain engines (scheduleCpmEngine.js, scheduleGanttLayout.js,
 * scheduleBaselineEngine.js, scheduleImportService.js, delayImpactEngine.js,
 * schedulePerformanceEngine.js) via window.PCC.*, never reimplemented here.
 */

import type {
  PCCStoreData,
  PCCProject,
  PCCSchedule,
  PCCWbsItem,
  PCCActivity,
  PCCRelationship,
  PCCCalendar,
  PCCScheduleBaseline,
  PCCRecoveryAction,
  PCCDelayRecord,
  PCCDelayActivityLink,
  CanonicalHeaderField,
  ParsedScheduleImport,
  ImportFileInfo,
  ReadImportFileResult,
  DuplicateFileMatch,
  GanttLayout,
  BaselineSnapshotActivity,
  BaselineComparisonResult,
  DelayImpactResult,
  ProjectFinishImpactResult,
  RecoveryForecastResult,
} from "../types/pcc";

export interface ActivityFieldConfig {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string | null;
  labels?: { [key: string]: string };
  staticOptions?: string[];
}

export interface ActivitiesTabFilter {
  search: string;
  wbsId: string;
  status: string;
  critical: boolean;
}

export interface GanttFilter {
  search: string;
  wbsId: string;
  discipline: string;
  contractor: string;
  responsiblePerson: string;
  quick: string;
  nearCriticalThresholdDays?: number;
}

export interface ExcelEditorRow {
  external_id: string;
  name: string;
  activity_type: string;
  wbs_code: string;
  wbs_name: string;
  duration: string;
  planned_start: string;
  planned_finish: string;
  predecessors: string;
  percent_complete: string;
  discipline: string;
  contractor: string;
  responsible_person: string;
  status: string;
  notes: string;
  [key: string]: string;
}

export interface LinkedRecordRow {
  text: string;
  view: () => void;
  badge: { label: string; className: string } | null;
}

interface LinkedRecordSource {
  module: string;
  label: (record: any) => string;
  list: (data: PCCStoreData, activityId: string) => any[];
  view: (record: any) => void;
  badge?: (record: any, data: PCCStoreData, activity: PCCActivity) => { label: string; className: string } | null;
}

export interface WhatIfResult {
  activityName?: string;
  fieldToReduce: string;
  requestedReduction: number;
  actualReduction: number;
  wasCritical: boolean;
  beforeFinish: string | null;
  afterFinish: string | null;
  varianceDays: number | null;
  beforeCriticalCount: number;
  afterCriticalCount: number;
  newlyNonCritical: string[];
  newlyCritical: string[];
}

export var SCHEDULE_STATUS_LABELS: { [key: string]: string } = { draft: "Draft", active: "Active", superseded: "Superseded", archived: "Archived" };
export var SCHEDULE_TYPE_LABELS: { [key: string]: string } = {
  current: "Current",
  baseline: "Baseline",
  lookahead: "Lookahead",
  client: "Client Schedule",
  contractor: "Contractor Schedule",
  recovery: "Recovery Schedule",
  forecast: "Forecast",
};
export var SCHEDULE_PLATFORM_LABELS: { [key: string]: string } = {
  pcc: "Built in PCC",
  excel: "Imported from Excel",
  msp_xml: "Imported from Microsoft Project (XML)",
  p6_xer: "Imported from Primavera P6 (XER)",
  p6_xml: "Imported from Primavera P6 (XML)",
};
export var ACTIVITY_TYPE_LABELS: { [key: string]: string } = { task: "Task", milestone: "Milestone", summary: "Summary", wbs_summary: "WBS Summary" };
export var ACTIVITY_STATUS_LABELS: { [key: string]: string } = { not_started: "Not Started", in_progress: "In Progress", complete: "Complete", on_hold: "On Hold" };
export var RELATIONSHIP_TYPE_LABELS: { [key: string]: string } = { FS: "Finish-to-Start", SS: "Start-to-Start", FF: "Finish-to-Finish", SF: "Start-to-Finish" };
export var PRIORITY_LABELS: { [key: string]: string } = { low: "Low", medium: "Medium", high: "High" };
export var RECOVERY_ACTION_STATUS_LABELS: { [key: string]: string } = { open: "Open", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
export var DELAY_CAUSE_LABELS: { [key: string]: string } = {
  owner_caused: "Owner-Caused",
  contractor_caused: "Contractor-Caused",
  weather_force_majeure: "Weather / Force Majeure",
  design_rfi_driven: "Design / RFI-Driven",
  other: "Other",
};
export var DELAY_STATUS_LABELS: { [key: string]: string } = {
  open: "Open",
  investigating: "Under Investigation",
  mitigation_in_progress: "Mitigation in Progress",
  recovery_in_progress: "Recovery in Progress",
  recovered: "Recovered",
  closed: "Closed",
};
export var DELAY_STATUS_BADGE_CLASS: { [key: string]: string } = {
  open: "at_risk",
  investigating: "at_risk",
  mitigation_in_progress: "info",
  recovery_in_progress: "info",
  recovered: "complete",
  closed: "complete",
};
export var DELAY_CATEGORY_LABELS: { [key: string]: string } = {
  late_material: "Late Material",
  late_vendor_submission: "Late Vendor Submission",
  late_drawing: "Late Drawing",
  design_change: "Design Change",
  client_delay: "Client Delay",
  consultant_delay: "Consultant Delay",
  vendor_delay: "Vendor Delay",
  contractor_delay: "Contractor Delay",
  approval_delay: "Approval Delay",
  rfi_delay: "RFI Delay",
  resource_shortage: "Resource Shortage",
  equipment_shortage: "Equipment Shortage",
  site_access: "Site Access",
  site_constraint: "Site Constraint",
  interface_issue: "Interface Issue",
  weather: "Weather",
  procurement: "Procurement",
  quality_issue: "Quality Issue",
  rework: "Rework",
  change_variation: "Change / Variation",
  other: "Other",
};
export var DELAY_RESPONSIBILITY_LABELS: { [key: string]: string } = {
  client: "Client",
  consultant: "Consultant",
  main_contractor: "Main Contractor",
  subcontractor: "Subcontractor",
  vendor: "Vendor",
  internal: "Internal",
  external: "External",
  shared: "Shared",
  unconfirmed: "Unconfirmed",
};
export var DELAY_CRITICALITY_LABELS: { [key: string]: string } = {
  critical: "Critical",
  near_critical: "Near Critical",
  non_critical: "Non-Critical",
};
export var DELAY_CRITICALITY_BADGE_CLASS: { [key: string]: string } = {
  critical: "critical",
  near_critical: "at_risk",
  non_critical: "complete",
};
export var MITIGATION_TYPE_LABELS: { [key: string]: string } = {
  resequence_work: "Resequence Work",
  add_resources: "Add Resources",
  add_equipment: "Add Equipment",
  additional_shift: "Additional Shift",
  overtime: "Overtime",
  parallel_working: "Parallel Working",
  alternative_work_front: "Alternative Work Front",
  vendor_expediting: "Vendor Expediting",
  alternative_procurement: "Alternative Procurement",
  engineering_solution: "Engineering Solution",
  temporary_works: "Temporary Works",
  other: "Other",
};
export var WEEKDAY_LABELS: string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export var CALC_MODE_LABELS: { [key: string]: string } = { progress_override: "Progress Override (actual dates win)", retained_logic: "Retained Logic (respect predecessor tie)" };

/** Fresh top-level wrapper every call — see CLAUDE.md's "React migration" note on why a
 * service's refresh function must never return store.get()'s shared reference directly. */
export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function fmtMoney(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined || (amount as any) === "" || isNaN(Number(amount))) return null;
  return Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function projectName(projects: PCCProject[], projectId: string | null | undefined): string {
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "Unassigned";
}

export function wbsName(wbsItems: PCCWbsItem[], wbsId: string | null | undefined): string {
  if (!wbsId) return "—";
  var w = wbsItems.find(function (x) {
    return x.id === wbsId;
  });
  return w ? (w.code ? w.code + " — " + (w.name || "") : w.name || "") : "—";
}

export function activityName(activities: PCCActivity[], activityId: string | null | undefined): string {
  var a = activities.find(function (x) {
    return x.id === activityId;
  });
  return a ? a.name || "(unnamed activity)" : "(deleted activity)";
}

/** Shared by the Activities tab list and the Gantt tab's detail panel so both delete
 * the same way — confirm, then remove the activity and any relationship/recovery
 * action referencing it. */
export function deleteActivityWithConfirm(activity: PCCActivity, onDone?: () => void): boolean {
  if (!confirm('Delete activity "' + activity.name + '"? This also removes any relationships and recovery actions referencing it.')) return false;
  window.PCC.store.update(function (data2) {
    data2.activities = data2.activities.filter(function (item) {
      return item.id !== activity.id;
    });
    data2.relationships = data2.relationships.filter(function (rel) {
      return rel.predecessor_id !== activity.id && rel.successor_id !== activity.id;
    });
    data2.recovery_actions = data2.recovery_actions.filter(function (r) {
      return r.activity_id !== activity.id;
    });
  });
  window.PCC.notify("Activity deleted.", "success");
  if (onDone) onDone();
  return true;
}

export function commitInlineActivityEdit(activityId: string, updates: Partial<PCCActivity>): void {
  window.PCC.store.update(function (data) {
    var existing = data.activities.find(function (a) {
      return a.id === activityId;
    });
    if (existing) {
      Object.assign(existing, updates);
      existing.updated_at = new Date().toISOString();
    }
  });
}

// ---------------------------------------------------------------------------------
// Schedule CRUD
// ---------------------------------------------------------------------------------

/** Returns the id of the (possibly newly created) schedule. */
export function saveSchedule(isNew: boolean, scheduleId: string | null | undefined, projectId: string, values: Partial<PCCSchedule>): string | null {
  var newId = null;
  window.PCC.store.update(function (data) {
    if (isNew) {
      var newSched = window.PCC.store.newSchedule(Object.assign({ project_id: projectId }, values));
      data.schedules.push(newSched);
      newId = newSched.id;
    } else {
      var existing = data.schedules.find(function (s) {
        return s.id === scheduleId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Schedule created." : "Schedule updated.", "success");
  return newId;
}

/** Freezes the given schedule's WBS/Activities/Relationships into a new baseline —
 * async IndexedDB write via scheduleBaselineStore, then a thin index row into the main
 * store once that resolves. Returns a Promise. */
export function captureBaseline(schedule: PCCSchedule): Promise<PCCScheduleBaseline> {
  var data = window.PCC.store.get();
  var wbsItems = data.wbs_items.filter(function (w) {
    return w.schedule_id === schedule.id;
  });
  var activities = data.activities.filter(function (a) {
    return a.schedule_id === schedule.id;
  });
  var relationships = data.relationships.filter(function (r) {
    return r.schedule_id === schedule.id;
  });
  var calendars = data.calendars.filter(function (cal) {
    return cal.project_id === schedule.project_id;
  });

  var snapshot = window.PCC.scheduleBaselineEngine.buildSnapshot(schedule, wbsItems, activities, relationships, calendars);
  var baselineRecord = window.PCC.store.newScheduleBaseline({
    schedule_id: schedule.id,
    project_id: schedule.project_id,
    name: schedule.name + " — " + new Date().toLocaleDateString(),
    schedule_revision_number: schedule.revision_number,
    wbs_count: wbsItems.length,
    activity_count: activities.length,
    relationship_count: relationships.length,
    baseline_project_finish: window.PCC.scheduleBaselineEngine.overallFinish(snapshot.activities),
  });

  return window.PCC.scheduleBaselineStore
    .putSnapshot(baselineRecord.id, snapshot)
    .then(function () {
      window.PCC.store.update(function (d) {
        d.schedule_baselines.push(baselineRecord);
      });
      window.PCC.notify("Baseline saved (" + activities.length + " activities).", "success");
      return baselineRecord;
    })
    .catch(function (err) {
      console.error("Could not save baseline", err);
      window.PCC.notify("Could not save baseline — IndexedDB may be unavailable.", "error");
      throw err;
    });
}

function cheapFingerprint(str: string): number {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function cpmInputFingerprint(activities: PCCActivity[], relationships: PCCRelationship[]): number {
  var actPart = activities
    .map(function (a) {
      return [a.id, a.activity_type, a.duration, a.planned_start, a.planned_finish, a.actual_start, a.actual_finish, a.percent_complete, a.remaining_duration].join(":");
    })
    .sort()
    .join("|");
  var relPart = relationships
    .map(function (r) {
      return [r.predecessor_id, r.successor_id, r.type, r.lag].join(":");
    })
    .sort()
    .join("|");
  return cheapFingerprint(actPart + "##" + relPart);
}

/** True once anything CPM-relevant has changed since the schedule's own
 * cpm_calculated_fingerprint was captured (or it has never been calculated at all). */
export function isCpmStale(schedule: PCCSchedule | null | undefined, data: PCCStoreData): boolean {
  if (!schedule || schedule.cpm_calculated_fingerprint == null) return true;
  var activities = data.activities.filter(function (a) {
    return a.schedule_id === schedule.id;
  });
  var relationships = data.relationships.filter(function (r) {
    return r.schedule_id === schedule.id;
  });
  return cpmInputFingerprint(activities, relationships) !== schedule.cpm_calculated_fingerprint;
}

/** Runs the CPM engine over the given schedule's activities/relationships and writes
 * the results back onto each activity — the only code path allowed to set
 * early/late start/finish and float; the CRUD forms never do. */
export function runCalculation(scheduleId: string): void {
  var data = window.PCC.store.get();
  var schedule = data.schedules.find(function (s) {
    return s.id === scheduleId;
  });
  if (!schedule) return;

  var scheduleActivities = data.activities.filter(function (a) {
    return a.schedule_id === scheduleId;
  });
  var scheduleRelationships = data.relationships.filter(function (r) {
    return r.schedule_id === scheduleId;
  });

  if (scheduleActivities.length === 0) {
    window.PCC.notify("Add some activities before calculating.", "error");
    return;
  }

  var scheduleCalendars = (data.calendars || []).filter(function (c) {
    return c.project_id === schedule!.project_id;
  });
  var result = window.PCC.scheduleCpmEngine.calculateSchedule(scheduleActivities, scheduleRelationships, {
    dataDate: schedule.data_date,
    nearCriticalThresholdDays: schedule.near_critical_threshold_days,
    calculationMode: schedule.calculation_mode,
    calendarAware: schedule.calendar_aware,
    honorConstraints: schedule.constraints_enabled,
    calendars: scheduleCalendars,
  });
  var freshFingerprint = cpmInputFingerprint(scheduleActivities, scheduleRelationships);

  window.PCC.store.update(function (d) {
    d.activities.forEach(function (a) {
      if (a.schedule_id !== scheduleId) return;
      var r = result.results[a.id];
      if (!r) return;
      a.early_start = r.early_start;
      a.early_finish = r.early_finish;
      a.late_start = r.late_start;
      a.late_finish = r.late_finish;
      a.total_float = r.total_float;
      a.free_float = r.free_float;
      a.is_out_of_sequence = r.is_out_of_sequence;
      a.updated_at = new Date().toISOString();
    });
    var s = d.schedules.find(function (x) {
      return x.id === scheduleId;
    });
    if (s) s.cpm_calculated_fingerprint = freshFingerprint;
  });

  var insufficientCount = Object.keys(result.results).filter(function (id) {
    return result.results[id] && result.results[id].insufficient_data;
  }).length;

  if (result.cyclicActivityIds.length > 0) {
    window.PCC.notify(
      "Calculated with " + result.cyclicActivityIds.length + " activity(ies) skipped due to a circular dependency — check Relationships.",
      "error"
    );
  } else {
    var varianceMsg =
      result.forecastVarianceDays != null
        ? result.forecastVarianceDays > 0
          ? ", forecast " + result.forecastVarianceDays + " day(s) behind plan"
          : result.forecastVarianceDays < 0
          ? ", forecast " + Math.abs(result.forecastVarianceDays) + " day(s) ahead of plan"
          : ", forecast on plan"
        : "";
    var insufficientMsg = insufficientCount > 0 ? " (" + insufficientCount + " activity(ies) have insufficient data to forecast reliably)" : "";
    var oosMsg = result.outOfSequenceActivityIds.length > 0 ? " " + result.outOfSequenceActivityIds.length + " activity(ies) out of sequence." : "";
    window.PCC.notify(
      "Calculated — project finish " + result.projectFinish + varianceMsg + ", " +
        result.criticalActivityIds.length + " critical activity(ies)." + insufficientMsg + oosMsg,
      insufficientCount > 0 ? "error" : "success"
    );
  }
}

// ---------------------------------------------------------------------------------
// WBS CRUD
// ---------------------------------------------------------------------------------

export function computeWbsLevel(parentId: string | null | undefined, allWbsItems: PCCWbsItem[]): number {
  var level = 0;
  var walk = parentId;
  var guard = 0;
  while (walk && guard < 50) {
    var parentItem = allWbsItems.find(function (w) {
      return w.id === walk;
    });
    if (!parentItem) break;
    level++;
    walk = parentItem.parent_wbs_id;
    guard++;
  }
  return level;
}

/** Reparents one WBS item and cascades the level recompute down through every
 * descendant. */
export function reparentWbsItem(itemId: string, newParentId: string | null, allWbsItems: PCCWbsItem[]): void {
  var item = allWbsItems.find(function (w) {
    return w.id === itemId;
  });
  if (!item) return;
  item.parent_wbs_id = newParentId;
  item.level = computeWbsLevel(newParentId, allWbsItems);
  item.updated_at = new Date().toISOString();
  var queue = [itemId];
  while (queue.length) {
    var pid = queue.shift();
    allWbsItems
      .filter(function (w) {
        return w.parent_wbs_id === pid;
      })
      .forEach(function (child) {
        child.level = computeWbsLevel(child.parent_wbs_id, allWbsItems);
        queue.push(child.id);
      });
  }
}

export function indentWbsItem(itemId: string, prevSiblingId: string): void {
  window.PCC.store.update(function (data2) {
    reparentWbsItem(itemId, prevSiblingId, data2.wbs_items);
  });
}

export function outdentWbsItem(itemId: string, newParentId: string | null): void {
  window.PCC.store.update(function (data2) {
    reparentWbsItem(itemId, newParentId, data2.wbs_items);
  });
}

export function saveWbsItem(isNew: boolean, wbsItem: PCCWbsItem, wbsItems: PCCWbsItem[], projectId: string, scheduleId: string, values: Partial<PCCWbsItem>): void {
  var parentId = values.parent_wbs_id || null;
  var level = computeWbsLevel(parentId, wbsItems);
  var finalValues = Object.assign({}, values, { parent_wbs_id: parentId, level: level });
  window.PCC.store.update(function (data) {
    if (isNew) {
      data.wbs_items.push(window.PCC.store.newWbsItem(Object.assign({ project_id: projectId, schedule_id: scheduleId }, finalValues)));
    } else {
      var existing = data.wbs_items.find(function (w) {
        return w.id === wbsItem.id;
      });
      if (existing) {
        Object.assign(existing, finalValues);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "WBS item added." : "WBS item updated.", "success");
}

export function deleteWbsItem(w: PCCWbsItem, wbsItems: PCCWbsItem[], activities: PCCActivity[]): boolean {
  var hasChildren = wbsItems.some(function (x) {
    return x.parent_wbs_id === w.id;
  });
  var hasActivities = activities.some(function (a) {
    return a.wbs_id === w.id;
  });
  if (hasChildren || hasActivities) {
    alert("Can't delete this WBS item — it has child WBS items or activities assigned to it. Reassign or delete those first.");
    return false;
  }
  if (!confirm('Delete WBS item "' + w.name + '"?')) return false;
  window.PCC.store.update(function (data2) {
    data2.wbs_items = data2.wbs_items.filter(function (item) {
      return item.id !== w.id;
    });
  });
  window.PCC.notify("WBS item deleted.", "success");
  return true;
}

// ---------------------------------------------------------------------------------
// Relationships CRUD
// ---------------------------------------------------------------------------------

export function wouldCreateRelationshipCycle(predId: string, succId: string, existingRelationships: PCCRelationship[]): boolean {
  if (predId === succId) return true;
  var adjacency: { [id: string]: string[] } = {};
  existingRelationships.forEach(function (r) {
    var pred = r.predecessor_id || "";
    if (!adjacency[pred]) adjacency[pred] = [];
    adjacency[pred].push(r.successor_id || "");
  });
  var visited: { [id: string]: boolean } = {};
  var queue: string[] = [succId];
  while (queue.length) {
    var current = queue.shift();
    if (current === undefined) continue;
    if (current === predId) return true;
    if (visited[current]) continue;
    visited[current] = true;
    (adjacency[current] || []).forEach(function (next: string) {
      if (!visited[next]) queue.push(next);
    });
  }
  return false;
}

/** Returns an error message string, or null on success. */
export function saveRelationship(isNew: boolean, relationship: PCCRelationship, scheduleId: string, values: Partial<PCCRelationship>): string | null {
  if (values.predecessor_id === values.successor_id) {
    return "Predecessor and successor must be different activities.";
  }
  var otherRelationshipsThisSchedule = window.PCC.store.get().relationships.filter(function (r) {
    return r.schedule_id === scheduleId && r.id !== relationship.id;
  });
  if (wouldCreateRelationshipCycle(values.predecessor_id || "", values.successor_id || "", otherRelationshipsThisSchedule)) {
    return "This would create a circular dependency (the successor already leads back to the predecessor through other relationships) — CPM can't calculate a schedule with a loop in it.";
  }
  window.PCC.store.update(function (data) {
    if (isNew) {
      data.relationships.push(window.PCC.store.newRelationship(Object.assign({ schedule_id: scheduleId }, values)));
    } else {
      var existing = data.relationships.find(function (r) {
        return r.id === relationship.id;
      });
      if (existing) Object.assign(existing, values);
    }
  });
  window.PCC.notify(isNew ? "Relationship added." : "Relationship updated.", "success");
  return null;
}

export function deleteRelationship(r: PCCRelationship): boolean {
  if (!confirm("Delete this relationship?")) return false;
  window.PCC.store.update(function (data2) {
    data2.relationships = data2.relationships.filter(function (item) {
      return item.id !== r.id;
    });
  });
  window.PCC.notify("Relationship deleted.", "success");
  return true;
}

// ---------------------------------------------------------------------------------
// Calendars CRUD
// ---------------------------------------------------------------------------------

export function formatWorkingDays(workingDays: boolean[] | null | undefined): string {
  if (!Array.isArray(workingDays)) return "Unknown";
  var selected = WEEKDAY_LABELS.filter(function (_, i) {
    return !!workingDays[i];
  });
  if (selected.length === 0) return "No working days (!)";
  if (selected.length === 7) return "Every day";
  return selected.join(", ");
}

export function saveCalendar(isNew: boolean, calendar: PCCCalendar, projectId: string, values: Partial<PCCCalendar>): void {
  window.PCC.store.update(function (data) {
    if (isNew) {
      data.calendars.push(window.PCC.store.newCalendar(Object.assign({ project_id: projectId }, values)));
    } else {
      var existing = data.calendars.find(function (c) {
        return c.id === calendar.id;
      });
      if (existing) Object.assign(existing, values);
    }
  });
  window.PCC.notify(isNew ? "Calendar added." : "Calendar updated.", "success");
}

export function setDefaultCalendar(calId: string, projectId: string): void {
  window.PCC.store.update(function (data2) {
    data2.calendars.forEach(function (c) {
      if (c.project_id === projectId) c.is_default = c.id === calId;
    });
  });
  window.PCC.notify("Default calendar updated.", "success");
}

export function deleteCalendar(cal: PCCCalendar, referencingCount: number): boolean {
  if (referencingCount > 0) {
    window.PCC.notify(
      "Can't delete — " + referencingCount + " activit" + (referencingCount === 1 ? "y" : "ies") + " still use" + (referencingCount === 1 ? "s" : "") + " this calendar. Reassign them first.",
      "error"
    );
    return false;
  }
  if (!confirm("Delete calendar “" + cal.name + "”?")) return false;
  window.PCC.store.update(function (data2) {
    data2.calendars = data2.calendars.filter(function (c) {
      return c.id !== cal.id;
    });
  });
  window.PCC.notify("Calendar deleted.", "success");
  return true;
}

// ---------------------------------------------------------------------------------
// Activities tab
// ---------------------------------------------------------------------------------

export var ACTIVITY_FIELD_CONFIG: ActivityFieldConfig[] = [
  { key: "name", label: "Activity Name", type: "text", required: true },
  { key: "activity_type", label: "Type", type: "select", options: "ACTIVITY_TYPES", labels: ACTIVITY_TYPE_LABELS },
  { key: "status", label: "Status", type: "select", options: "ACTIVITY_STATUSES", labels: ACTIVITY_STATUS_LABELS },
  { key: "priority", label: "Priority", type: "select", options: null, labels: PRIORITY_LABELS, staticOptions: ["low", "medium", "high"] },
  { key: "planned_start", label: "Planned Start", type: "date" },
  { key: "planned_finish", label: "Planned Finish", type: "date" },
  { key: "actual_start", label: "Actual Start", type: "date" },
  { key: "actual_finish", label: "Actual Finish", type: "date" },
  { key: "duration", label: "Duration (days)", type: "number" },
  { key: "remaining_duration", label: "Remaining Duration (days)", type: "number" },
  { key: "percent_complete", label: "% Complete", type: "number" },
  { key: "physical_progress", label: "Physical Progress (%)", type: "number" },
  { key: "discipline", label: "Discipline", type: "text" },
  { key: "contractor", label: "Contractor", type: "text" },
  { key: "responsible_person", label: "Responsible Person", type: "text" },
  { key: "constraint_type", label: "Constraint Type", type: "text" },
  { key: "constraint_date", label: "Constraint Date", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export var ACTIVITY_GRID_COLUMNS: { key: string; label: string }[] = [
  { key: "wbs", label: "WBS" },
  { key: "type", label: "Type" },
  { key: "start", label: "Start" },
  { key: "finish", label: "Finish" },
  { key: "percent_complete", label: "% Complete" },
  { key: "float", label: "Float" },
  { key: "status", label: "Status" },
];

export function addDaysIso(isoDateStr: string, days: number): string {
  var d = new Date(isoDateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function activityMatchesActivitiesTabFilter(a: PCCActivity, filter: ActivitiesTabFilter): boolean {
  if (filter.search) {
    if ((a.name || "").toLowerCase().indexOf(filter.search.toLowerCase()) === -1) return false;
  }
  if (filter.wbsId && a.wbs_id !== filter.wbsId) return false;
  if (filter.status && a.status !== filter.status) return false;
  if (filter.critical && !(a.total_float != null && a.total_float <= 0)) return false;
  return true;
}

export function activitySortValue(a: PCCActivity, wbsItems: PCCWbsItem[], key: string | null): string | number {
  switch (key) {
    case "name":
      return (a.name || "").toLowerCase();
    case "wbs":
      return wbsName(wbsItems, a.wbs_id).toLowerCase();
    case "type":
      return ACTIVITY_TYPE_LABELS[a.activity_type] || "";
    case "start":
      return a.planned_start || "";
    case "finish":
      return a.planned_finish || "";
    case "percent_complete":
      return a.percent_complete || 0;
    case "float":
      return a.total_float == null ? Infinity : a.total_float;
    case "status":
      return ACTIVITY_STATUS_LABELS[a.status || ""] || "";
    default:
      return "";
  }
}

export function sortActivitiesForGrid(activities: PCCActivity[], wbsItems: PCCWbsItem[], sortKey: string | null, sortDir: string): PCCActivity[] {
  if (!sortKey) return activities;
  var dir = sortDir === "desc" ? -1 : 1;
  return activities.slice().sort(function (a, b) {
    var va = activitySortValue(a, wbsItems, sortKey);
    var vb = activitySortValue(b, wbsItems, sortKey);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

export function saveActivity(isNew: boolean, activity: PCCActivity, projectId: string, scheduleId: string, values: Partial<PCCActivity>): void {
  window.PCC.store.update(function (data) {
    if (isNew) {
      data.activities.push(window.PCC.store.newActivity(Object.assign({ project_id: projectId, schedule_id: scheduleId }, values)));
    } else {
      var existing = data.activities.find(function (a) {
        return a.id === activity.id;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Activity added." : "Activity updated.", "success");
}

export function clonePrefillFrom(a: PCCActivity): Partial<PCCActivity> {
  return {
    wbs_id: a.wbs_id,
    name: a.name,
    activity_type: a.activity_type,
    calendar_id: a.calendar_id,
    duration: a.duration,
    original_duration: a.original_duration,
    remaining_duration: a.remaining_duration,
    priority: a.priority,
    discipline: a.discipline,
    contractor: a.contractor,
    responsible_person: a.responsible_person,
    constraint_type: a.constraint_type,
    constraint_date: a.constraint_date,
    vendor_id: a.vendor_id,
    notes: a.notes,
  };
}

export function bulkShiftActivities(selectedIds: { [id: string]: boolean }, days: number): void {
  var n = Object.keys(selectedIds).length;
  window.PCC.store.update(function (data2) {
    data2.activities.forEach(function (item) {
      if (!selectedIds[item.id]) return;
      if (item.planned_start) item.planned_start = addDaysIso(item.planned_start, days);
      if (item.planned_finish) item.planned_finish = addDaysIso(item.planned_finish, days);
      if (item.actual_start) item.actual_start = addDaysIso(item.actual_start, days);
      if (item.actual_finish) item.actual_finish = addDaysIso(item.actual_finish, days);
      item.updated_at = new Date().toISOString();
    });
  });
  window.PCC.notify(n + " " + (n === 1 ? "activity" : "activities") + " shifted by " + days + " day" + (Math.abs(days) === 1 ? "" : "s") + ".", "success");
}

// ---------------------------------------------------------------------------------
// Import (Excel / MSP XML / P6 XER)
// ---------------------------------------------------------------------------------

// NOT a module-level constant: window.PCC.scheduleImportService isn't loaded yet when
// this module first evaluates (react-bundle.js loads early in JS_ORDER, deliberately
// ahead of jszip — see CLAUDE.md's "React migration" note — which also puts it ahead of
// every other vendor/domain-engine script). Any window.PCC.<engine>.<CONSTANT> read must
// happen lazily, inside a function, never at this file's top level.
export function getExcelGridFields(): CanonicalHeaderField[] {
  return window.PCC.scheduleImportService.CANONICAL_HEADERS;
}
export function getImportMappingTargets(): CanonicalHeaderField[] {
  return window.PCC.scheduleImportService.CANONICAL_HEADERS;
}

var XLSX_MIME_TYPES: { [key: string]: string } = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
};

/** Base64-encodes an ArrayBuffer in fixed-size chunks — same approach as documents.js's
 * own copy of this helper (per-module-helpers convention, no shared utils module). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  var bytes = new Uint8Array(buffer);
  var chunkSize = 8192;
  var chunks: string[] = [];
  for (var i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize))));
  }
  return btoa(chunks.join(""));
}

function findScheduleFileDuplicates(projectId: string, fp: { hash: string; method: string }, file: File): DuplicateFileMatch<PCCSchedule>[] {
  var projectSchedules = window.PCC.store.get().schedules.filter(function (s) {
    return s.project_id === projectId;
  });
  return window.PCC.duplicateService.findFileDuplicates(
    projectSchedules,
    { hash: fp.hash, method: fp.method, filename: file.name, size: file.size, projectId: projectId },
    { fields: { hash: "content_hash", method: "hash_method", filename: "source_file_name", size: "source_file_size", projectId: "project_id" } }
  );
}

/** Dispatches on file extension and returns a Promise resolving to a unified shape:
 * { sourceType, importFile: {name,size,hash,hashMethod,fileData}, scheduleName,
 *   duplicateMatches, needsManualMapping, headers, rawRows, columnMapping, parsed }
 * — `parsed` is present unless needsManualMapping is true (Excel only), in which case
 * the caller collects a mapping and calls applyColumnMappingAndReview() below. */
export function readImportFile(file: File, projectId: string): Promise<ReadImportFileResult> {
  var extMatch = /\.([a-z0-9]+)$/i.exec(file.name || "");
  var ext: string = extMatch ? extMatch[1].toLowerCase() : "";

  if (ext !== "xlsx" && ext !== "xls" && ext !== "xml" && ext !== "xer") {
    return Promise.reject(new Error("Unsupported file type. Use .xlsx/.xls (Excel), .xml (Microsoft Project XML export), or .xer (Primavera P6 export)."));
  }

  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function () {
      reject(new Error("Could not read that file."));
    };
    reader.onload = function () {
      var buffer = reader.result as ArrayBuffer;

      if (ext === "xlsx" || ext === "xls") {
        var workbook: any, sheet: any, headers: any[], rows: any[][];
        try {
          var bytes = new Uint8Array(buffer);
          workbook = window.XLSX.read(bytes, { type: "array", cellDates: true });
          sheet = workbook.Sheets[workbook.SheetNames[0]];
          var sheetRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          headers = sheetRows.length ? sheetRows[0] : [];
          rows = sheetRows.slice(1);
        } catch (e: any) {
          reject(new Error("Could not parse this as an Excel file: " + e.message));
          return;
        }

        var autoMapping = window.PCC.scheduleImportService.autoDetectColumnMapping(headers);
        var needsManualMapping = headers.some(function (h: any, i: number) {
          return String(h || "").trim() !== "" && autoMapping[i] === undefined;
        });
        var fileDataUri = "data:" + (XLSX_MIME_TYPES[ext] || "application/octet-stream") + ";base64," + arrayBufferToBase64(buffer);

        window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
          var importFile: ImportFileInfo = { name: file.name, size: file.size, hash: fp.hash, hashMethod: fp.method, fileData: fileDataUri };
          var duplicateMatches = findScheduleFileDuplicates(projectId, fp, file);
          var scheduleName = file.name.replace(/\.(xlsx|xls)$/i, "");

          if (needsManualMapping) {
            resolve({ sourceType: "excel", importFile: importFile, scheduleName: scheduleName, duplicateMatches: duplicateMatches, needsManualMapping: true, headers: headers, rawRows: rows, columnMapping: autoMapping, parsed: null });
          } else {
            resolve({ sourceType: "excel", importFile: importFile, scheduleName: scheduleName, duplicateMatches: duplicateMatches, needsManualMapping: false, headers: null, rawRows: null, columnMapping: null, parsed: window.PCC.scheduleImportService.parseRows(headers, rows) });
          }
        });
        return;
      }

      if (ext === "xml") {
        var xmlText: string;
        try {
          xmlText = new TextDecoder("utf-8").decode(buffer);
        } catch (e: any) {
          reject(new Error("Could not read this file as text: " + e.message));
          return;
        }
        var parsedXml = window.PCC.mspXmlService.parseMspXml(xmlText);
        var xmlFileDataUri = "data:application/xml;base64," + arrayBufferToBase64(buffer);
        window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
          var importFile: ImportFileInfo = { name: file.name, size: file.size, hash: fp.hash, hashMethod: fp.method, fileData: xmlFileDataUri };
          resolve({
            sourceType: "msp_xml",
            importFile: importFile,
            scheduleName: file.name.replace(/\.xml$/i, ""),
            duplicateMatches: findScheduleFileDuplicates(projectId, fp, file),
            needsManualMapping: false,
            headers: null,
            rawRows: null,
            columnMapping: null,
            parsed: parsedXml,
          });
        });
        return;
      }

      // ext === "xer"
      var xerText: string;
      try {
        xerText = new TextDecoder("utf-8").decode(buffer);
      } catch (e: any) {
        reject(new Error("Could not read this file as text: " + e.message));
        return;
      }
      var parsedXer = window.PCC.p6XerService.parseXer(xerText);
      var xerFileDataUri = "data:application/octet-stream;base64," + arrayBufferToBase64(buffer);
      window.PCC.duplicateService.fingerprintFile(buffer, file.name, file.size).then(function (fp) {
        var importFile: ImportFileInfo = { name: file.name, size: file.size, hash: fp.hash, hashMethod: fp.method, fileData: xerFileDataUri };
        resolve({
          sourceType: "p6_xer",
          importFile: importFile,
          scheduleName: file.name.replace(/\.xer$/i, ""),
          duplicateMatches: findScheduleFileDuplicates(projectId, fp, file),
          needsManualMapping: false,
          headers: null,
          rawRows: null,
          columnMapping: null,
          parsed: parsedXer,
        });
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

export function applyColumnMappingAndReview(headers: any[], rawRows: any[][], columnMapping: { [colIndex: number]: string | undefined }): ParsedScheduleImport {
  return window.PCC.scheduleImportService.parseRows(headers, rawRows, columnMapping);
}

/** Turns a scheduleImportService.parseRows() result into store-shaped WBS/Activity/
 * Relationship records for one schedule. Shared by commitImport (new schedule) and
 * applyExcelEdits (existing schedule) so both go through identical construction logic. */
export function buildScheduleRecords(parsed: ParsedScheduleImport, projectId: string, scheduleId: string): { wbsItems: PCCWbsItem[]; activities: PCCActivity[]; relationships: PCCRelationship[] } {
  var wbsCodeToId: { [code: string]: string } = {};
  var wbsItems = parsed.wbsEntries.map(function (w) {
    var item = window.PCC.store.newWbsItem({ project_id: projectId, schedule_id: scheduleId, code: w.code, name: w.name, level: w.level });
    wbsCodeToId[w.code] = item.id;
    return item;
  });
  wbsItems.forEach(function (item, i) {
    var parentCode = parsed.wbsEntries[i].parent_code;
    item.parent_wbs_id = parentCode ? wbsCodeToId[parentCode] || null : null;
  });

  var externalIdToActivityId: { [externalId: string]: string } = {};
  var activities = parsed.activities.map(function (a) {
    var activity = window.PCC.store.newActivity({
      project_id: projectId,
      schedule_id: scheduleId,
      wbs_id: a.wbs_code ? wbsCodeToId[a.wbs_code] || null : null,
      name: a.name,
      activity_type: a.activity_type,
      duration: a.duration,
      remaining_duration: a.remaining_duration != null ? a.remaining_duration : a.duration,
      original_duration: a.duration,
      planned_start: a.planned_start,
      planned_finish: a.planned_finish,
      actual_start: a.actual_start || "",
      actual_finish: a.actual_finish || "",
      constraint_type: a.constraint_type || "",
      constraint_date: a.constraint_date || "",
      percent_complete: a.percent_complete,
      discipline: a.discipline,
      contractor: a.contractor,
      responsible_person: a.responsible_person,
      status: a.status,
      notes: a.notes,
      external_id: a.external_id,
    });
    externalIdToActivityId[a.external_id] = activity.id;
    return activity;
  });

  var relationships = parsed.relationships.map(function (r) {
    return window.PCC.store.newRelationship({
      schedule_id: scheduleId,
      predecessor_id: externalIdToActivityId[r.predecessor_external_id],
      successor_id: externalIdToActivityId[r.successor_external_id],
      type: r.type,
      lag: r.lag,
    });
  });

  return { wbsItems: wbsItems, activities: activities, relationships: relationships };
}

/** Commits a parsed import as a brand-new schedule revision. Returns a Promise
 * resolving to the new schedule's id. */
export function commitImport(projectId: string, parsed: ParsedScheduleImport, scheduleNameRaw: string, importFile: ImportFileInfo, sourceType: string): Promise<string> {
  var data = window.PCC.store.get();
  var scheduleName = scheduleNameRaw.trim() || importFile.name;

  var existingRevisions = data.schedules
    .filter(function (s) {
      return s.project_id === projectId;
    })
    .map(function (s) {
      return s.revision_number || 0;
    });
  var nextRevision = existingRevisions.length ? Math.max.apply(null, existingRevisions) + 1 : 0;

  var SOURCE_TYPE_FILE_LABELS: { [key: string]: string } = { excel: "Excel", msp_xml: "Microsoft Project XML", p6_xer: "Primavera P6 (XER)" };
  var sourceFileLabel = SOURCE_TYPE_FILE_LABELS[sourceType];
  var extMatch = /\.([a-zA-Z0-9]+)$/.exec(importFile.name || "");
  var newSchedule = window.PCC.store.newSchedule({
    project_id: projectId,
    name: scheduleName,
    revision_number: nextRevision,
    status: "active",
    import_date: new Date().toISOString(),
    source_platform: sourceType,
    source_format: extMatch ? extMatch[1].toLowerCase() : null,
    source_file_name: importFile.name,
    source_file_size: importFile.size,
    content_hash: importFile.hash,
    hash_method: importFile.hashMethod,
  });

  var records = buildScheduleRecords(parsed, projectId, newSchedule.id);

  var newCalendar: PCCCalendar | null = null;
  if (sourceType !== "excel" && parsed.calendar) {
    newCalendar = window.PCC.store.newCalendar({
      project_id: projectId,
      name: parsed.calendar.name,
      working_days: parsed.calendar.working_days,
      holidays: parsed.calendar.holidays,
      is_default: false,
    });
    var newCalendarId = newCalendar.id;
    records.activities.forEach(function (a) {
      a.calendar_id = newCalendarId;
    });
  }

  return window.PCC.blobStore
    .putBlob(newSchedule.id, importFile.fileData)
    .then(function () {
      var supersededCount = 0;
      window.PCC.store.update(function (d) {
        d.schedules.forEach(function (s) {
          if (s.project_id === projectId && s.status === "active") {
            s.status = "superseded";
            s.updated_at = new Date().toISOString();
            supersededCount++;
          }
        });
        d.schedules.push(newSchedule);
        d.wbs_items = d.wbs_items.concat(records.wbsItems);
        d.activities = d.activities.concat(records.activities);
        d.relationships = d.relationships.concat(records.relationships);
        if (newCalendar) d.calendars.push(newCalendar);
      });

      window.PCC.notify(
        "Imported " + records.activities.length + " activities as a new schedule (Rev " + nextRevision + ")." +
          (supersededCount > 0 ? " " + supersededCount + " prior active revision(s) marked Superseded." : "") +
          (sourceType === "excel" ? " The original Excel file is attached — use “Edit Excel” to update it in place." : " The original " + sourceFileLabel + " file is attached for reference."),
        "success"
      );
      return newSchedule.id;
    })
    .catch(function (e: any) {
      throw new Error("Could not store the original " + sourceFileLabel + " file: " + e.message);
    });
}

function gatherScheduleExportData(schedule: PCCSchedule, data: PCCStoreData): { wbsItems: PCCWbsItem[]; activities: PCCActivity[]; relationships: PCCRelationship[]; calendar: PCCCalendar | null } {
  var wbsItems = data.wbs_items.filter(function (w) {
    return w.schedule_id === schedule.id;
  });
  var activities = data.activities.filter(function (a) {
    return a.schedule_id === schedule.id;
  });
  var relationships = data.relationships.filter(function (r) {
    return r.schedule_id === schedule.id;
  });
  var calendarId: string | null | undefined = null;
  for (var i = 0; i < activities.length; i++) {
    if (activities[i].calendar_id) {
      calendarId = activities[i].calendar_id;
      break;
    }
  }
  var calendar = calendarId
    ? data.calendars.find(function (c) {
        return c.id === calendarId;
      })
    : data.calendars.find(function (c) {
        return c.project_id === schedule.project_id && c.is_default;
      });
  return { wbsItems: wbsItems, activities: activities, relationships: relationships, calendar: calendar || null };
}

export function exportMspXml(schedule: PCCSchedule): void {
  var data = window.PCC.store.get();
  var exportData = gatherScheduleExportData(schedule, data);
  var xml = window.PCC.mspXmlService.exportScheduleToMspXml({ schedule: schedule, wbsItems: exportData.wbsItems, activities: exportData.activities, relationships: exportData.relationships, calendar: exportData.calendar });
  var blob = new Blob([xml], { type: "application/xml" });
  var filename = (schedule.name || "schedule").replace(/[\\/:*?"<>|]/g, "_") + ".xml";
  window.PCC.nativeFile
    .save(blob, filename)
    .then(function () {
      window.PCC.notify('Exported "' + schedule.name + '" as Microsoft Project XML.', "success");
    })
    .catch(function (e: any) {
      window.PCC.notify("Could not export: " + e.message, "error");
    });
}

export function exportP6Xer(schedule: PCCSchedule): void {
  var data = window.PCC.store.get();
  var exportData = gatherScheduleExportData(schedule, data);
  var xer = window.PCC.p6XerService.exportScheduleToXer({ schedule: schedule, wbsItems: exportData.wbsItems, activities: exportData.activities, relationships: exportData.relationships, calendar: exportData.calendar });
  var blob = new Blob([xer], { type: "application/octet-stream" });
  var filename = (schedule.name || "schedule").replace(/[\\/:*?"<>|]/g, "_") + ".xer";
  window.PCC.nativeFile
    .save(blob, filename)
    .then(function () {
      window.PCC.notify('Exported "' + schedule.name + '" as a Primavera P6 XER file.', "success");
    })
    .catch(function (e: any) {
      window.PCC.notify("Could not export: " + e.message, "error");
    });
}

// ---------------------------------------------------------------------------------
// Excel Editor
// ---------------------------------------------------------------------------------

function buildPredecessorsString(activity: PCCActivity, relationships: PCCRelationship[], activitiesById: { [id: string]: PCCActivity }): string {
  var tokens = relationships
    .filter(function (r) {
      return r.successor_id === activity.id;
    })
    .map(function (r) {
      var pred = activitiesById[r.predecessor_id || ""];
      if (!pred || !pred.external_id) return null;
      var token = pred.external_id;
      if (r.type && r.type !== "FS") token += r.type;
      if (r.lag) token += (r.lag > 0 ? "+" : "") + r.lag;
      return token;
    })
    .filter(function (t) {
      return t;
    });
  return tokens.join(",");
}

export function buildExcelEditorRows(schedule: PCCSchedule, data: PCCStoreData): ExcelEditorRow[] {
  var wbsById: { [id: string]: PCCWbsItem } = {};
  data.wbs_items
    .filter(function (w) {
      return w.schedule_id === schedule.id;
    })
    .forEach(function (w) {
      wbsById[w.id] = w;
    });
  var activitiesById: { [id: string]: PCCActivity } = {};
  data.activities
    .filter(function (a) {
      return a.schedule_id === schedule.id;
    })
    .forEach(function (a) {
      activitiesById[a.id] = a;
    });
  var relationships = data.relationships.filter(function (r) {
    return r.schedule_id === schedule.id;
  });

  return data.activities
    .filter(function (a) {
      return a.schedule_id === schedule.id && a.external_id;
    })
    .map(function (a) {
      var wbs = a.wbs_id ? wbsById[a.wbs_id] : null;
      return {
        external_id: a.external_id || "",
        name: a.name || "",
        activity_type: a.activity_type || "task",
        wbs_code: wbs ? wbs.code || "" : "",
        wbs_name: wbs ? wbs.name || "" : "",
        duration: a.duration != null ? String(a.duration) : "",
        planned_start: a.planned_start || "",
        planned_finish: a.planned_finish || "",
        predecessors: buildPredecessorsString(a, relationships, activitiesById),
        percent_complete: a.percent_complete != null ? String(a.percent_complete) : "",
        discipline: a.discipline || "",
        contractor: a.contractor || "",
        responsible_person: a.responsible_person || "",
        status: a.status || "not_started",
        notes: a.notes || "",
      };
    });
}

export function reviewExcelEdits(rows: ExcelEditorRow[]): ParsedScheduleImport {
  var fields = getExcelGridFields();
  var headerLabels = fields.map(function (f) {
    return f.label;
  });
  var rowArrays = rows.map(function (row) {
    return fields.map(function (f) {
      return row[f.key] || "";
    });
  });
  return window.PCC.scheduleImportService.parseRows(headerLabels, rowArrays);
}

// Regenerated by applyExcelEdits() via ExcelJS (not SheetJS/window.XLSX) — planned_start/
// planned_finish get real Excel date cells (not date-look-alike strings) and
// percent_complete gets a real numeric cell with a "%" display format, so the file that
// comes back out actually looks and behaves like a normal Excel schedule, not a bare CSV
// dumped into .xlsx. duration/percent_complete are numeric for the same reason.
var EXCEL_GRID_DATE_KEYS: { [key: string]: boolean } = { planned_start: true, planned_finish: true };
var EXCEL_GRID_NUMBER_KEYS: { [key: string]: boolean } = { duration: true, percent_complete: true };

/** Regenerates the attached Excel file from exactly the header/row data that was just
 * parsed and applies the parsed result onto the schedule. Returns a Promise. */
export function applyExcelEdits(schedule: PCCSchedule, rows: ExcelEditorRow[], parsed: ParsedScheduleImport): Promise<void> {
  var fields = getExcelGridFields();

  var workbook = new window.ExcelJS.Workbook();
  var sheet = workbook.addWorksheet("Schedule", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = fields.map(function (f) {
    return { header: f.label, key: f.key, width: f.key === "name" || f.key === "notes" ? 32 : 16 };
  });
  sheet.getRow(1).font = { bold: true };

  rows.forEach(function (row) {
    var rowData: { [key: string]: any } = {};
    fields.forEach(function (f) {
      var raw = row[f.key] || "";
      if (EXCEL_GRID_DATE_KEYS[f.key] && raw) {
        rowData[f.key] = new Date(raw + "T00:00:00Z");
      } else if (EXCEL_GRID_NUMBER_KEYS[f.key] && raw !== "") {
        rowData[f.key] = Number(raw);
      } else {
        rowData[f.key] = raw;
      }
    });
    sheet.addRow(rowData);
  });

  fields.forEach(function (f, i) {
    var col = sheet.getColumn(i + 1);
    if (EXCEL_GRID_DATE_KEYS[f.key]) col.numFmt = "yyyy-mm-dd";
    if (f.key === "percent_complete") col.numFmt = '0"%"';
  });

  var records = buildScheduleRecords(parsed, schedule.project_id, schedule.id);
  var wbBuffer: ArrayBuffer;

  return workbook.xlsx.writeBuffer().then(function (buf: ArrayBuffer) {
    wbBuffer = buf;
    var fileDataUri = "data:" + XLSX_MIME_TYPES.xlsx + ";base64," + arrayBufferToBase64(wbBuffer);
    return window.PCC.blobStore.putBlob(schedule.id, fileDataUri);
  }).then(function () {
    window.PCC.store.update(function (d) {
      d.wbs_items = d.wbs_items.filter(function (w) {
        return w.schedule_id !== schedule.id;
      });
      d.activities = d.activities.filter(function (a) {
        return a.schedule_id !== schedule.id;
      });
      d.relationships = d.relationships.filter(function (r) {
        return r.schedule_id !== schedule.id;
      });
      d.wbs_items = d.wbs_items.concat(records.wbsItems);
      d.activities = d.activities.concat(records.activities);
      d.relationships = d.relationships.concat(records.relationships);

      var sched = d.schedules.find(function (s) {
        return s.id === schedule.id;
      });
      if (sched) {
        sched.source_file_size = wbBuffer.byteLength;
        sched.updated_at = new Date().toISOString();
      }
    });

    window.PCC.notify("Schedule updated from the edited Excel (" + records.activities.length + " activities). The attached file was updated to match.", "success");
  });
}

// ---------------------------------------------------------------------------------
// Gantt tab
// ---------------------------------------------------------------------------------

export var GANTT_ZOOM_PX_PER_DAY: { [key: string]: number } = { day: 32, week: 16, month: 6, quarter: 2.2, year: 0.7 };
export var GANTT_ZOOM_LABELS: { [key: string]: string } = { auto: "Auto", day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" };

export function truncateLabel(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  return name.slice(0, maxChars - 1) + "…";
}

export function ganttPxPerDay(totalSpanDays: number, zoom: string | null): number {
  if (zoom && GANTT_ZOOM_PX_PER_DAY[zoom]) return GANTT_ZOOM_PX_PER_DAY[zoom];
  if (totalSpanDays <= 30) return 24;
  if (totalSpanDays <= 90) return 14;
  if (totalSpanDays <= 180) return 8;
  return 4;
}

export function ganttTickIntervalDays(totalSpanDays: number): number {
  if (totalSpanDays <= 45) return 7;
  if (totalSpanDays <= 120) return 14;
  return 30;
}

export function formatAxisDate(iso: string): string {
  var d = new Date(iso + "T00:00:00Z");
  return d.getUTCMonth() + 1 + "/" + d.getUTCDate();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function activityMatchesGanttFilter(a: PCCActivity, wbsItems: PCCWbsItem[], filter: GanttFilter, referenceDateIso: string): boolean {
  if (filter.search) {
    var needle = filter.search.toLowerCase();
    var wbs = wbsItems.find(function (w) {
      return w.id === a.wbs_id;
    });
    var haystack = [a.external_id || "", a.name || "", wbs ? (wbs.code || "") + " " + (wbs.name || "") : "", a.contractor || "", a.discipline || ""].join(" ").toLowerCase();
    if (haystack.indexOf(needle) === -1) return false;
  }
  if (filter.wbsId && a.wbs_id !== filter.wbsId) return false;
  if (filter.discipline && a.discipline !== filter.discipline) return false;
  if (filter.contractor && a.contractor !== filter.contractor) return false;
  if (filter.responsiblePerson && a.responsible_person !== filter.responsiblePerson) return false;

  switch (filter.quick) {
    case "critical":
      if (!(a.total_float != null && a.total_float <= 0)) return false;
      break;
    case "near_critical":
      if (!(a.total_float != null && a.total_float > 0 && a.total_float <= (filter.nearCriticalThresholdDays || 5))) return false;
      break;
    case "delayed": {
      var finish = a.early_finish || a.planned_finish;
      if (!finish || !referenceDateIso || finish >= referenceDateIso || a.status === "complete") return false;
      break;
    }
    case "completed":
      if (a.status !== "complete") return false;
      break;
    case "in_progress":
      if (a.status !== "in_progress") return false;
      break;
    case "not_started":
      if (a.status !== "not_started") return false;
      break;
    case "milestones":
      if (a.activity_type !== "milestone") return false;
      break;
    default:
      break;
  }
  return true;
}

/** Shared by the Gantt bar's own "Not Ready" marker and the Activity Detail Panel's
 * Document Readiness section (Stage 5) — factored out once so both reuse the same rule. */
export function computeRequirementStatus(data: PCCStoreData, projectId: string | null | undefined, documentTypeId: string, plannedDate: string | null | undefined): string {
  var available = data.documents.some(function (d) {
    return d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at;
  });
  if (available) return "available";
  if (plannedDate && plannedDate < todayIso()) return "overdue";
  return "required";
}

export var REQUIREMENT_STATUS_BADGE: { [key: string]: { className: string; label: string } } = {
  available: { className: "complete", label: "Available" },
  overdue: { className: "critical", label: "Overdue" },
  required: { className: "at_risk", label: "Required" },
};

/** An activity with zero linked document requirements is never "not ready" — nothing
 * to flag. */
export function activityNotReady(activity: PCCActivity, data: PCCStoreData): boolean {
  var typesById: { [id: string]: any } = {};
  data.document_types.forEach(function (t) {
    typesById[t.id] = t;
  });
  var rows = data.project_document_requirements.filter(function (r) {
    return r.activity_id === activity.id && typesById[r.document_type_id];
  });
  if (rows.length === 0) return false;
  return rows.some(function (r) {
    return computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date) !== "available";
  });
}

export function matchKeyFor(a: { external_id?: string | null; id: string }): string {
  if (a.external_id !== null && a.external_id !== undefined && a.external_id !== "") return "ext:" + a.external_id;
  return "id:" + a.id;
}

/** Loads (and returns as a Promise) the trimmed activity snapshot for a baseline, for
 * the Gantt's ghost-bar overlay. */
export function loadBaselineOverlay(baselineId: string): Promise<{ baselineId: string; activities: BaselineSnapshotActivity[] }> {
  return window.PCC.scheduleBaselineStore.getSnapshot(baselineId).then(function (snapshot) {
    return { baselineId: baselineId, activities: snapshot ? snapshot.activities : [] };
  });
}

export function computeGanttLayout(activities: PCCActivity[], options: { dataDate?: string | null }): GanttLayout {
  return window.PCC.scheduleGanttLayout.computeLayout(activities, options);
}

/** Commits a drag-driven move/resize: writes planned_start/planned_finish/duration and
 * immediately re-runs CPM, exactly like the toolbar's own "Calculate Schedule" button —
 * so float/critical-path/project-finish never go stale after a drag. */
export function commitGanttDrag(activity: PCCActivity, mode: string, origStart: string, origFinish: string, dayDelta: number, scheduleId: string): void {
  var result =
    mode === "move"
      ? window.PCC.scheduleGanttLayout.moveDates(origStart, origFinish, dayDelta)
      : window.PCC.scheduleGanttLayout.resizeFinish(origStart, origFinish, dayDelta);

  window.PCC.store.update(function (d) {
    var act = d.activities.find(function (x) {
      return x.id === activity.id;
    });
    if (!act) return;
    act.planned_start = result.start;
    act.planned_finish = result.finish;
    act.duration = window.PCC.scheduleGanttLayout.diffDays(result.start, result.finish);
    act.updated_at = new Date().toISOString();
  });
  window.PCC.notify((mode === "move" ? "Moved “" : "Resized “") + activity.name + "” by " + Math.abs(dayDelta) + " day(s) — recalculating…", "success");
  runCalculation(scheduleId);
}

// ---------------------------------------------------------------------------------
// Activity Detail Panel: Document Readiness (activityNotReady/computeRequirementStatus
// already defined above, shared with the Gantt bar's own marker), Linked Records,
// Recovery Actions, Delay Records
// ---------------------------------------------------------------------------------

/** Same calculated-wins/planned-falls-back precedence as resourceLevelingEngine.js's
 * own effectiveDates() — duplicated here per this app's per-module-helpers convention. */
export function resourceActivityEffectiveDates(activity: PCCActivity): { start: string | null; finish: string | null } {
  if (activity.activity_type === "milestone") return { start: null, finish: null };
  return {
    start: activity.actual_start || activity.early_start || activity.planned_start || null,
    finish: activity.actual_finish || activity.early_finish || activity.planned_finish || null,
  };
}

var COMMITMENT_STATUS_LABELS: { [key: string]: string } = { draft: "Draft", issued: "Issued", approved: "Approved", closed: "Closed", cancelled: "Cancelled" };
var COMMITMENT_RISK_WINDOW_DAYS: number = 7;

/** Gate 10 (Activity Linking) — every register that can optionally carry an
 * activity_id, surfaced as one flat, live-queried list. Each row's view() uses that
 * module's own existing expand/navigate API. */
var LINKED_RECORD_SOURCES: LinkedRecordSource[] = [
  {
    module: "risks",
    label: function (r) { return (r.type === "risk" ? "Risk" : r.type === "issue" ? "Issue" : "Opportunity") + ": " + (r.title || "(untitled)"); },
    list: function (data, activityId) { return data.risks.filter(function (r) { return r.activity_id === activityId; }); },
    view: function (r) {
      if (window.PCC.risks && window.PCC.risks.expandRisk) window.PCC.risks.expandRisk(r.id);
      window.PCC.router.go("risks");
    },
  },
  {
    module: "rfis",
    label: function (r) { return r.number + " — " + (r.subject || "(untitled)"); },
    list: function (data, activityId) { return data.rfis.filter(function (r) { return r.activity_id === activityId; }); },
    view: function (r) {
      if (window.PCC.rfis && window.PCC.rfis.expandRfi) window.PCC.rfis.expandRfi(r.id);
      window.PCC.router.go("rfis");
    },
  },
  {
    module: "meetings",
    label: function (m) { return "Meeting: " + (m.title || "(untitled)") + " (" + m.meeting_date + ")"; },
    list: function (data, activityId) { return data.meetings.filter(function (m) { return m.activity_id === activityId; }); },
    view: function (m) {
      if (window.PCC.meetings) window.PCC.meetings.expandMeeting(m.id);
      window.PCC.router.go("meetings");
    },
  },
  {
    module: "documents",
    label: function (d) { return "Document: " + d.filename; },
    list: function (data, activityId) { return data.documents.filter(function (d) { return d.activity_id === activityId && !d.trashed_at; }); },
    view: function (d) {
      if (window.PCC.documents && window.PCC.documents.expandDocument) window.PCC.documents.expandDocument(d.id);
      window.PCC.router.go("documents");
    },
  },
  {
    module: "dailylog",
    label: function (l) { return "Daily Log: " + l.log_date; },
    list: function (data, activityId) { return data.daily_logs.filter(function (l) { return l.activity_id === activityId; }); },
    view: function (l) {
      if (window.PCC.dailyLog && window.PCC.dailyLog.expandLog) window.PCC.dailyLog.expandLog(l.id);
      window.PCC.router.go("dailylog");
    },
  },
  {
    module: "changeOrders",
    label: function (co) { return co.number + " — " + (co.title || "(untitled)"); },
    list: function (data, activityId) { return data.change_orders.filter(function (co) { return co.activity_id === activityId; }); },
    view: function (co) {
      if (window.PCC.changeOrders && window.PCC.changeOrders.expandChangeOrder) window.PCC.changeOrders.expandChangeOrder(co.id);
      window.PCC.router.go("changeOrders");
    },
  },
  {
    module: "resources",
    label: function (a) { return "Resource: " + a._resourceName + " (" + a.quantity + (a._unit ? " " + a._unit : "") + ")"; },
    list: function (data, activityId) {
      return data.resource_assignments
        .filter(function (a) { return a.activity_id === activityId; })
        .map(function (a) {
          var resource = data.resources.find(function (r) { return r.id === a.resource_id; });
          return Object.assign({}, a, { _resourceName: resource ? resource.name : "(resource deleted)", _unit: resource ? resource.unit : "" });
        });
    },
    view: function (a) {
      if (window.PCC.resources && window.PCC.resources.expandAssignment) window.PCC.resources.expandAssignment(a.id);
      window.PCC.router.go("resources");
    },
    badge: function (a, data, activity) {
      var resource = data.resources.find(function (r) { return r.id === a.resource_id; });
      if (!resource) return null;
      if (resource.max_availability == null) return { label: "Availability Unknown", className: "info" };
      var timeline = window.PCC.resourceLevelingEngine.computeResourceUsageTimeline(resource, data.resource_assignments, data.activities);
      var overAlloc = window.PCC.resourceLevelingEngine.detectOverAllocations(resource, timeline, data.resource_unavailability);
      if (overAlloc.count === 0) return { label: "Available", className: "on_track" };
      var dates = resourceActivityEffectiveDates(activity);
      if (!dates.start) return { label: "Over-Allocated (Elsewhere)", className: "at_risk" };
      var conflictInWindow = overAlloc.overAllocatedDays.some(function (d) { return d.date >= dates.start! && d.date < dates.finish!; });
      return conflictInWindow ? { label: "Over-Allocated", className: "critical" } : { label: "Available", className: "on_track" };
    },
  },
  {
    module: "commitments",
    label: function (c) { return "Commitment: " + (c.po_contract_number || "(no PO/Contract #)") + " (" + (COMMITMENT_STATUS_LABELS[c.status] || c.status) + ")"; },
    list: function (data, activityId) { return data.commitments.filter(function (c) { return c.activity_id === activityId; }); },
    view: function (c) {
      if (window.PCC.commitments && window.PCC.commitments.expandCommitment) window.PCC.commitments.expandCommitment(c.id);
      window.PCC.router.go("commitments");
    },
    badge: function (c, data, activity) {
      if (c.status === "approved") return { label: "Approved", className: "on_track" };
      if (c.status === "closed") return { label: "Closed", className: "on_track" };
      if (c.status === "cancelled") return { label: "Cancelled", className: "info" };
      var dates = resourceActivityEffectiveDates(activity);
      var riskCutoff = addDaysIso(todayIso(), COMMITMENT_RISK_WINDOW_DAYS);
      if (dates.start && dates.start <= riskCutoff) return { label: "Procurement Risk", className: "critical" };
      return { label: COMMITMENT_STATUS_LABELS[c.status] || c.status, className: "info" };
    },
  },
];

export function getLinkedRecords(data: PCCStoreData, activity: PCCActivity): LinkedRecordRow[] {
  var rows: LinkedRecordRow[] = [];
  LINKED_RECORD_SOURCES.forEach(function (source) {
    source.list(data, activity.id).forEach(function (record) {
      rows.push({
        text: source.label(record),
        view: function () {
          source.view(record);
        },
        badge: source.badge ? source.badge(record, data, activity) : null,
      });
    });
  });
  return rows;
}

export function recoveryActionOverdue(action: PCCRecoveryAction): boolean {
  if (action.status === "completed" || action.status === "cancelled") return false;
  if (!action.target_recovery_date) return false;
  return action.target_recovery_date < todayIso();
}

export function saveRecoveryAction(isNew: boolean, editingId: string | null, activity: PCCActivity, values: Partial<PCCRecoveryAction>): void {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.recovery_actions.push(window.PCC.store.newRecoveryAction(Object.assign({ activity_id: activity.id, project_id: activity.project_id }, values)));
    } else {
      var existing = d.recovery_actions.find(function (r) {
        return r.id === editingId;
      });
      if (existing) Object.assign(existing, values);
    }
  });
  window.PCC.notify("Recovery action saved.", "success");
}

export function deleteRecoveryAction(id: string): void {
  window.PCC.store.update(function (d) {
    d.recovery_actions = d.recovery_actions.filter(function (x) {
      return x.id !== id;
    });
  });
}

// ---- Delay Records ----

export function computeDelayImpact(delayRecord: PCCDelayRecord, links: PCCDelayActivityLink[], data: PCCStoreData): DelayImpactResult {
  return window.PCC.delayImpactEngine.computeDelayImpact(delayRecord, links, data);
}

export function computeProjectFinishImpact(scheduleId: string, data: PCCStoreData): ProjectFinishImpactResult {
  return window.PCC.delayImpactEngine.computeProjectFinishImpact(scheduleId, data);
}

export function computeRecoveryForecast(delayRecord: PCCDelayRecord, links: PCCDelayActivityLink[], recoveryActions: PCCRecoveryAction[], data: PCCStoreData): RecoveryForecastResult {
  return window.PCC.delayImpactEngine.computeRecoveryForecast(delayRecord, links, recoveryActions, data);
}

export function deriveDelayStatusLabel(impact: DelayImpactResult, milestoneSlippageDays: number | null | undefined, projectImpactDays: number | null | undefined): { text: string; colorVar: string | null } {
  if (projectImpactDays != null && projectImpactDays > 0) return { text: "PROJECT IMPACT", colorVar: "--status-critical" };
  if (milestoneSlippageDays != null && milestoneSlippageDays > 0) return { text: "MILESTONE AT RISK", colorVar: "--status-critical" };
  if (impact.overall_criticality === "critical") return { text: "CRITICAL", colorVar: "--status-critical" };
  if (impact.overall_criticality === "near_critical") return { text: "AT RISK", colorVar: "--status-at-risk" };
  if (impact.overall_criticality === "non_critical") return { text: "ON TRACK", colorVar: "--status-complete" };
  return { text: "NOT ASSESSED", colorVar: null };
}

/** The schedule_id of a Delay's own primary activity — falls back to the given
 * fallbackScheduleId if the primary activity was since deleted. */
export function activityScheduleId(data: PCCStoreData, delayRecord: PCCDelayRecord, fallbackScheduleId: string): string | undefined {
  var primary = data.activities.find(function (a) {
    return a.id === delayRecord.activity_id;
  });
  return primary ? primary.schedule_id : fallbackScheduleId;
}

export function describeRelatedRecords(r: PCCDelayRecord, data: PCCStoreData): string {
  var parts = [];
  if (r.risk_id) {
    var risk = data.risks.find(function (x) {
      return x.id === r.risk_id;
    });
    if (risk) parts.push("Risk: " + (risk.title || "(untitled)"));
  }
  if (r.issue_id) {
    var issue = data.risks.find(function (x) {
      return x.id === r.issue_id;
    });
    if (issue) parts.push("Issue: " + (issue.title || "(untitled)"));
  }
  if (r.rfi_id) {
    var rfi = data.rfis.find(function (x) {
      return x.id === r.rfi_id;
    });
    if (rfi) parts.push("RFI: " + (rfi.number || rfi.subject || "(untitled)"));
  }
  if (r.daily_log_id) {
    var log = data.daily_logs.find(function (x) {
      return x.id === r.daily_log_id;
    });
    if (log) parts.push("Daily Log: " + (log.log_date || "(undated)"));
  }
  if (r.meeting_id) {
    var meeting = data.meetings.find(function (x) {
      return x.id === r.meeting_id;
    });
    if (meeting) parts.push("Meeting: " + (meeting.title || "(untitled)"));
  }
  if (r.vendor_id) {
    var vendor = data.vendors.find(function (x) {
      return x.id === r.vendor_id;
    });
    if (vendor) parts.push("Vendor: " + (vendor.vendor_name || "(unnamed)"));
  }
  if (r.change_order_id) {
    var co = data.change_orders.find(function (x) {
      return x.id === r.change_order_id;
    });
    if (co) parts.push("Change: " + (co.number || co.title || "(untitled)"));
  }
  return parts.join(" · ");
}

/** Saves a Delay Record — handles the status_history append-on-transition and the
 * "milestone selected here is also an affected activity" auto-link, matching the
 * vanilla onsubmit handler exactly. */
export function saveDelayRecord(isNew: boolean, editingId: string | null, existingStatus: string | null | undefined, activity: PCCActivity, values: Partial<PCCDelayRecord>): void {
  function ensureActivityLinked(d: PCCStoreData, delayRecordId: string, activityId: string | undefined) {
    if (!activityId) return;
    var already = d.delay_activity_links.some(function (l) {
      return l.delay_id === delayRecordId && l.activity_id === activityId;
    });
    if (already) return;
    var act = d.activities.find(function (a) {
      return a.id === activityId;
    });
    if (!act) return;
    d.delay_activity_links.push(
      window.PCC.store.newDelayActivityLink({
        delay_id: delayRecordId,
        activity_id: act.id,
        project_id: act.project_id,
        original_planned_start: act.planned_start || "",
        original_planned_finish: act.planned_finish || "",
        original_total_float: act.total_float != null ? act.total_float : null,
      })
    );
  }

  window.PCC.store.update(function (d) {
    if (isNew) {
      var created = window.PCC.store.newDelayRecord(Object.assign({ activity_id: activity.id, project_id: activity.project_id }, values));
      created.status_history = [{ status: values.status || "", changed_at: created.created_at, note: "Delay identified." }];
      d.delay_records.push(created);
      d.delay_activity_links.push(
        window.PCC.store.newDelayActivityLink({
          delay_id: created.id,
          activity_id: activity.id,
          project_id: activity.project_id,
          original_planned_start: activity.planned_start || "",
          original_planned_finish: activity.planned_finish || "",
          original_total_float: activity.total_float != null ? activity.total_float : null,
        })
      );
      ensureActivityLinked(d, created.id, values.milestone_activity_id);
    } else {
      var existing = d.delay_records.find(function (r) {
        return r.id === editingId;
      });
      if (existing) {
        if (existingStatus !== values.status) {
          if (!existing.status_history) existing.status_history = [];
          existing.status_history.push({ status: values.status || "", changed_at: values.updated_at, note: "" });
        }
        Object.assign(existing, values);
        ensureActivityLinked(d, existing.id, values.milestone_activity_id);
      }
    }
  });
  window.PCC.notify("Delay record saved.", "success");
}

export function deleteDelayRecord(id: string): void {
  window.PCC.store.update(function (d) {
    d.delay_records = d.delay_records.filter(function (x) {
      return x.id !== id;
    });
    d.delay_activity_links = d.delay_activity_links.filter(function (x) {
      return x.delay_id !== id;
    });
    d.recovery_actions.forEach(function (ra) {
      if (ra.delay_id === id) ra.delay_id = "";
    });
  });
}

export function linkDelayActivity(delayRecordId: string, activity: PCCActivity): void {
  window.PCC.store.update(function (d) {
    d.delay_activity_links.push(
      window.PCC.store.newDelayActivityLink({
        delay_id: delayRecordId,
        activity_id: activity.id,
        project_id: activity.project_id,
        original_planned_start: activity.planned_start || "",
        original_planned_finish: activity.planned_finish || "",
        original_total_float: activity.total_float != null ? activity.total_float : null,
      })
    );
  });
  window.PCC.notify("Activity linked to delay.", "success");
}

/** The Delay & Recovery Gap note: Delay Days logged vs. open Recovery Actions'
 * estimated recovery days, floored at 0 — same computation as executiveCenter.js's
 * buildProjectContext() and delayRecoveryDashboard.js's portfolio rollup, independently
 * re-derived here per this app's established per-module-duplication convention. Returns
 * null when the activity has no delay logged. */
export function delayRecoveryGap(activity: PCCActivity, data: PCCStoreData): { delayDays: number; recoveryDays: number; gapDays: number } | null {
  var delayDays = data.delay_records
    .filter(function (r) {
      return r.activity_id === activity.id;
    })
    .reduce(function (sum, r) {
      return sum + (r.delay_days || 0);
    }, 0);
  if (delayDays === 0) return null;
  var recoveryDays = data.recovery_actions
    .filter(function (r) {
      return r.activity_id === activity.id && (r.status === "open" || r.status === "in_progress");
    })
    .reduce(function (sum, r) {
      return sum + (r.estimated_recovery_days || 0);
    }, 0);
  var gapDays = Math.max(0, delayDays - recoveryDays);
  return { delayDays: delayDays, recoveryDays: recoveryDays, gapDays: gapDays };
}

// ---------------------------------------------------------------------------------
// Baselines tab
// ---------------------------------------------------------------------------------

/** Loads a baseline's stored snapshot and compares it against the given schedule's
 * current WBS/Activities/Relationships/Calendars. Returns a Promise resolving to the
 * scheduleBaselineEngine comparison result. */
export function runBaselineComparison(baseline: PCCScheduleBaseline, scheduleId: string): Promise<BaselineComparisonResult> {
  var data = window.PCC.store.get();
  return window.PCC.scheduleBaselineStore.getSnapshot(baseline.id).then(function (snapshot) {
    if (!snapshot) throw new Error("Baseline snapshot not found in storage.");
    var currentWbsItems = data.wbs_items.filter(function (w) {
      return w.schedule_id === scheduleId;
    });
    var currentActivities = data.activities.filter(function (a) {
      return a.schedule_id === scheduleId;
    });
    var currentRelationships = data.relationships.filter(function (r) {
      return r.schedule_id === scheduleId;
    });
    var currentSchedule = data.schedules.find(function (s) {
      return s.id === scheduleId;
    });
    var currentCalendars = currentSchedule
      ? data.calendars.filter(function (cal) {
          return cal.project_id === currentSchedule!.project_id;
        })
      : [];
    return window.PCC.scheduleBaselineEngine.compareBaselineToCurrent(snapshot, currentWbsItems, currentActivities, currentRelationships, currentCalendars);
  });
}

export function renameBaseline(id: string, newName: string): void {
  window.PCC.store.update(function (d) {
    var item = d.schedule_baselines.find(function (x) {
      return x.id === id;
    });
    if (item) item.name = newName;
  });
}

export function toggleOfficialBaseline(baseline: PCCScheduleBaseline): void {
  var wasOfficial = baseline.is_official;
  window.PCC.store.update(function (d) {
    d.schedule_baselines.forEach(function (item) {
      if (item.project_id !== baseline.project_id) return;
      item.is_official = item.id === baseline.id ? !wasOfficial : false;
    });
  });
  window.PCC.notify(wasOfficial ? "Baseline unmarked as Official." : "Baseline marked Official — Executive Center's Schedule Variance now measures against it.", "success");
}

export function deleteBaseline(id: string): void {
  window.PCC.scheduleBaselineStore.deleteSnapshot(id).catch(function () {});
  window.PCC.store.update(function (d) {
    d.schedule_baselines = d.schedule_baselines.filter(function (item) {
      return item.id !== id;
    });
  });
  window.PCC.notify("Baseline deleted.", "success");
}

// ---------------------------------------------------------------------------------
// What-If tab
// ---------------------------------------------------------------------------------

/** Pure, in-memory "what if we reduce this activity's duration by N days" exploration
 * — clones the current activities, perturbs one, and reruns the real CPM engine twice
 * (before/after). Nothing is persisted. Returns { error } or { result }. */
export function runWhatIf(schedule: PCCSchedule, scheduleActivities: PCCActivity[], scheduleRelationships: PCCRelationship[], activityId: string, reduceDays: number): { error: string; result?: undefined } | { error?: undefined; result: WhatIfResult } {
  if (!activityId) return { error: "Select an activity first." };
  var activity = scheduleActivities.find(function (a) {
    return a.id === activityId;
  });
  if (!activity) return { error: "Select an activity first." };
  if (activity.status === "complete") {
    return { error: "Completed activities can't be accelerated — their dates are historical." };
  }
  if (!reduceDays || isNaN(reduceDays) || reduceDays <= 0) {
    return { error: "Enter a positive number of days to reduce." };
  }

  var fieldToReduce: "remaining_duration" | "duration" = activity.status === "in_progress" ? "remaining_duration" : "duration";
  var currentValue = activity[fieldToReduce] || 0;
  var newValue = Math.max(0, currentValue - reduceDays);

  var cpmOptions = {
    dataDate: schedule.data_date,
    nearCriticalThresholdDays: schedule.near_critical_threshold_days,
    calculationMode: schedule.calculation_mode,
    calendarAware: schedule.calendar_aware,
    honorConstraints: schedule.constraints_enabled,
    calendars: (window.PCC.store.get().calendars || []).filter(function (c) {
      return c.project_id === schedule.project_id;
    }),
  };
  var before = window.PCC.scheduleCpmEngine.calculateSchedule(scheduleActivities, scheduleRelationships, cpmOptions);

  var modifiedActivities = scheduleActivities.map(function (a) {
    if (a.id !== activityId) return a;
    var clone = Object.assign({}, a);
    clone[fieldToReduce] = newValue;
    return clone;
  });
  var after = window.PCC.scheduleCpmEngine.calculateSchedule(modifiedActivities, scheduleRelationships, cpmOptions);

  var wasCritical = before.results[activityId] && before.results[activityId].is_critical;
  var beforeCriticalIds = before.criticalActivityIds.slice();
  var afterCriticalIds = after.criticalActivityIds.slice();
  var newlyNonCritical = beforeCriticalIds.filter(function (id) {
    return afterCriticalIds.indexOf(id) === -1;
  });
  var newlyCritical = afterCriticalIds.filter(function (id) {
    return beforeCriticalIds.indexOf(id) === -1;
  });
  function namesFor(ids: string[]) {
    return ids.map(function (id) {
      var a = scheduleActivities.find(function (x) {
        return x.id === id;
      });
      return a ? a.name || "(unnamed activity)" : id;
    });
  }

  return {
    result: {
      activityName: activity.name,
      fieldToReduce: fieldToReduce,
      requestedReduction: reduceDays,
      actualReduction: currentValue - newValue,
      wasCritical: !!wasCritical,
      beforeFinish: before.projectFinish || null,
      afterFinish: after.projectFinish || null,
      varianceDays: before.projectFinish && after.projectFinish ? window.PCC.scheduleGanttLayout.diffDays(before.projectFinish, after.projectFinish) : null,
      beforeCriticalCount: beforeCriticalIds.length,
      afterCriticalCount: afterCriticalIds.length,
      newlyNonCritical: namesFor(newlyNonCritical),
      newlyCritical: namesFor(newlyCritical),
    },
  };
}

// ---------------------------------------------------------------------------------
// Cross-page navigation helper
// ---------------------------------------------------------------------------------

export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}
