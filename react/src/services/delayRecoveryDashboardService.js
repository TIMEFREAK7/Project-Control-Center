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

export var RECOVERY_ACTION_STATUS_LABELS = { open: "Open", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
export var DELAY_CAUSE_LABELS = {
  owner_caused: "Owner-Caused",
  contractor_caused: "Contractor-Caused",
  weather_force_majeure: "Weather / Force Majeure",
  design_rfi_driven: "Design / RFI-Driven",
  other: "Other",
};
export var DELAY_STATUS_LABELS = {
  open: "Open",
  investigating: "Under Investigation",
  mitigation_in_progress: "Mitigation in Progress",
  recovery_in_progress: "Recovery in Progress",
  recovered: "Recovered",
  closed: "Closed",
};
export var DELAY_STATUS_BADGE_CLASS = {
  open: "at_risk",
  investigating: "at_risk",
  mitigation_in_progress: "info",
  recovery_in_progress: "info",
  recovered: "complete",
  closed: "complete",
};
export var DELAY_CATEGORY_LABELS = {
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
export var DELAY_RESPONSIBILITY_LABELS = {
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
export var DELAY_CRITICALITY_LABELS = {
  critical: "Critical",
  near_critical: "Near Critical",
  non_critical: "Non-Critical",
};
export var DELAY_CRITICALITY_BADGE_CLASS = {
  critical: "critical",
  near_critical: "at_risk",
  non_critical: "complete",
};

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function delayRecordStatuses() {
  return window.PCC.store.DELAY_RECORD_STATUSES;
}
export function delayCategories() {
  return window.PCC.store.DELAY_CATEGORIES;
}
export function delayResponsibilityClassifications() {
  return window.PCC.store.DELAY_RESPONSIBILITY_CLASSIFICATIONS;
}
export function delayRecordCauses() {
  return window.PCC.store.DELAY_RECORD_CAUSES;
}

export function delaySeverityBucket(days) {
  if (days == null) return "Unspecified";
  if (days < 5) return "Minor (<5d)";
  if (days <= 15) return "Moderate (5-15d)";
  return "Severe (>15d)";
}

export function delayCriticality(delayRecord, data) {
  var links = data.delay_activity_links.filter(function (l) {
    return l.delay_id === delayRecord.id;
  });
  return window.PCC.delayImpactEngine.computeDelayImpact(delayRecord, links, data).overall_criticality;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function recoveryActionOverdue(action) {
  if (action.status === "completed" || action.status === "cancelled") return false;
  if (!action.target_recovery_date) return false;
  return action.target_recovery_date < todayIso();
}

export function fmtMoney(amount) {
  if (amount === null || amount === undefined || amount === "" || isNaN(Number(amount))) return null;
  return Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function viewActivityInSchedule(activity) {
  window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
  window.PCC.router.go("schedule");
}

export function viewProjectInPortfolio(projectId) {
  window.PCC.portfolio.viewProject(projectId);
  window.PCC.router.go("portfolio");
}
