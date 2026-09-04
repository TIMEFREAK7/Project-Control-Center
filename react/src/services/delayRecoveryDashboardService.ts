/* Service boundary for the Delay & Recovery Dashboard (master prompt §9: React must not
 * own core calculations). Thin wrapper — every store/engine call goes straight through
 * the existing globals, unchanged from the vanilla page.
 *
 * getData() returns a FRESH top-level object reference for the same reason every other
 * migrated service does (see CLAUDE.md's React migration notes).
 *
 * delayCriticality() is read-only and cheap — window.PCC.delayImpactEngine's own
 * computeDelayImpact() only, never computeProjectFinishImpact() in a loop (see this
 * file's own vanilla predecessor's header comment, and delayImpactEngine.js's own header
 * comment, for why looping that function portfolio-wide is explicitly disallowed).
 */
import type { PCCStoreData, PCCDelayRecord, PCCRecoveryAction, PCCActivity } from "../types/pcc";

export var RECOVERY_ACTION_STATUS_LABELS: { [status: string]: string } = { open: "Open", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
export var DELAY_CAUSE_LABELS: { [cause: string]: string } = {
  owner_caused: "Owner-Caused",
  contractor_caused: "Contractor-Caused",
  weather_force_majeure: "Weather / Force Majeure",
  design_rfi_driven: "Design / RFI-Driven",
  other: "Other",
};
export var DELAY_STATUS_LABELS: { [status: string]: string } = {
  open: "Open",
  investigating: "Under Investigation",
  mitigation_in_progress: "Mitigation in Progress",
  recovery_in_progress: "Recovery in Progress",
  recovered: "Recovered",
  closed: "Closed",
};
export var DELAY_STATUS_BADGE_CLASS: { [status: string]: string } = {
  open: "at_risk",
  investigating: "at_risk",
  mitigation_in_progress: "info",
  recovery_in_progress: "info",
  recovered: "complete",
  closed: "complete",
};
export var DELAY_CATEGORY_LABELS: { [category: string]: string } = {
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
export var DELAY_RESPONSIBILITY_LABELS: { [classification: string]: string } = {
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
export var DELAY_CRITICALITY_LABELS: { [criticality: string]: string } = {
  critical: "Critical",
  near_critical: "Near Critical",
  non_critical: "Non-Critical",
};
export var DELAY_CRITICALITY_BADGE_CLASS: { [criticality: string]: string } = {
  critical: "critical",
  near_critical: "at_risk",
  non_critical: "complete",
};

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function delayRecordStatuses(): string[] {
  return window.PCC.store.DELAY_RECORD_STATUSES;
}
export function delayCategories(): string[] {
  return window.PCC.store.DELAY_CATEGORIES;
}
export function delayResponsibilityClassifications(): string[] {
  return window.PCC.store.DELAY_RESPONSIBILITY_CLASSIFICATIONS;
}
export function delayRecordCauses(): string[] {
  return window.PCC.store.DELAY_RECORD_CAUSES;
}

export function delaySeverityBucket(days: number | null | undefined): string {
  if (days == null) return "Unspecified";
  if (days < 5) return "Minor (<5d)";
  if (days <= 15) return "Moderate (5-15d)";
  return "Severe (>15d)";
}

export function delayCriticality(delayRecord: PCCDelayRecord, data: PCCStoreData): string {
  var links = data.delay_activity_links.filter(function (l) {
    return l.delay_id === delayRecord.id;
  });
  return window.PCC.delayImpactEngine.computeDelayImpact(delayRecord, links, data).overall_criticality;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function recoveryActionOverdue(action: PCCRecoveryAction): boolean {
  if (action.status === "completed" || action.status === "cancelled") return false;
  if (!action.target_recovery_date) return false;
  return action.target_recovery_date < todayIso();
}

export function fmtMoney(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined || (amount as any) === "" || isNaN(Number(amount))) return null;
  return Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function viewActivityInSchedule(activity: PCCActivity): void {
  window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
  window.PCC.router.go("schedule");
}

export function viewProjectInPortfolio(projectId: string): void {
  window.PCC.portfolio.viewProject(projectId);
  window.PCC.router.go("portfolio");
}
