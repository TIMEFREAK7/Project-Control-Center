/* Service boundary for the Planner Action Centre page (master prompt §9: "React must not
 * own core calculations... React should request calculations from domain/service
 * modules").
 *
 * Unlike the Storage Management pilot, this page never had a separate domain-engine file
 * to wrap — the vanilla src/js/pages/actionCentre.js module *was* the aggregation logic,
 * reading straight off window.PCC.store.get()'s data and a handful of cross-register
 * lookups (vendors, activities, document types). That aggregation logic (collectItems,
 * the date-bucketing rules, the requirement-status computation, the delay category label
 * map) is moved here verbatim, unchanged — this module is still a thin wrapper in the
 * sense that matters: it doesn't reimplement any OTHER module's business logic
 * (scheduleCpmEngine, the document-requirement Available/Overdue/Required rule, etc.),
 * and every write-triggering or navigation action (expandMeeting, router.go,
 * projectContext.set, ...) still goes straight through the real window.PCC.* globals,
 * never reimplemented. React only calls the functions below instead of touching
 * window.PCC.* directly itself.
 */
import type { PCCStoreData } from "../types/pcc";

export type Bucket = "overdue" | "today" | "week" | "upcoming" | "waiting";

export interface Item {
  kind: string;
  title: string;
  projectId: string;
  owner: string;
  dueDate: string;
  bucket: Bucket;
  view: (() => void) | null;
}

export interface BucketDef {
  key: Bucket;
  label: string;
  badgeClass: string;
  emptyText: string;
}

// Gate F: duplicated from pages/schedule.js's own DELAY_CATEGORY_LABELS verbatim — same
// established per-module-helpers convention every other label map in this app already
// follows (vendors.js's VENDOR_DELAY_CATEGORY_LABELS, dailyLog.js's
// DAILY_LOG_DELAY_CATEGORY_LABELS).
export const ACTION_CENTRE_DELAY_CATEGORY_LABELS: { [category: string]: string } = {
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

/** Reads the current store snapshot. Synchronous — store.get() always is. */
export function getData(): PCCStoreData {
  return window.PCC.store.get();
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}

export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

export function upcomingWindowDays(data: PCCStoreData): number {
  return data.settings.action_centre_upcoming_days == null ? 30 : data.settings.action_centre_upcoming_days;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(isoDateStr: string, days: number): string {
  const d = new Date(isoDateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Same Available/Overdue/Required computation as portfolio.js/vendors.js/schedule.js/
// dashboard.js/documentControlDashboard.js/executiveCenter.js's own copies — duplicated
// here per this app's per-module-helpers convention.
function computeRequirementStatus(
  data: PCCStoreData,
  projectId: string,
  documentTypeId: string,
  plannedDate: string | undefined
): "available" | "overdue" | "required" {
  const available = data.documents.some(
    (d) => d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at
  );
  if (available) return "available";
  if (plannedDate && plannedDate < todayIso()) return "overdue";
  return "required";
}

/** A due date buckets into overdue/today/week/upcoming; no due date (or a date beyond
 * the upcoming window) buckets into "waiting" — still outstanding, just nothing to sort
 * by date. Dates beyond the upcoming window return null (excluded from this gate
 * entirely — a future Lookahead gate covers the longer horizon). */
export function bucketFor(dueDate: string, windowDays: number): Bucket | null {
  if (!dueDate) return "waiting";
  const today = todayIso();
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  if (dueDate <= addDaysIso(today, 7)) return "week";
  if (dueDate <= addDaysIso(today, windowDays)) return "upcoming";
  return null;
}

/** Builds the flat list of outstanding items across every register this gate covers.
 * activeProjectIds is a { [projectId]: true } lookup of the projects currently in scope
 * (respects the page's own project filter). Each item's `view` is a closure that performs
 * the same navigation the vanilla page did — straight through the real window.PCC.*
 * globals (meetings/rfis/portfolio/schedule/changeOrders + router), never reimplemented. */
export function collectItems(data: PCCStoreData, activeProjectIds: { [projectId: string]: boolean }): Item[] {
  const items: Item[] = [];
  const windowDays = upcomingWindowDays(data);

  data.meetings.forEach((m) => {
    if (!activeProjectIds[m.project_id]) return;
    (m.actions || []).forEach((a) => {
      if (a.status !== "open") return;
      const bucket = bucketFor(a.due_date || "", windowDays);
      if (!bucket) return;
      // Gate 33 (PCC Evolution Roadmap, Tier B: Meeting Action → Control Linking) —
      // surface whichever of the action's own optional links are set, same "only show
      // what's actually there" convention meetings.js's own read-only detail uses.
      const linkParts: string[] = [];
      if (a.vendor_id) {
        const v = data.vendors.find((x) => x.id === a.vendor_id);
        if (v) linkParts.push("Vendor: " + (v.vendor_name || "(unnamed vendor)"));
      }
      if (a.activity_id) {
        const linkedAct = data.activities.find((x) => x.id === a.activity_id);
        if (linkedAct) linkParts.push("Activity: " + (linkedAct.name || "(unnamed activity)"));
      }
      items.push({
        kind: "Meeting Action",
        title: (a.description || "(no description)") + (linkParts.length ? " (" + linkParts.join(", ") + ")" : ""),
        projectId: m.project_id,
        owner: a.owner || "—",
        dueDate: a.due_date || "",
        bucket: bucket,
        view: function () {
          window.PCC.meetings.expandMeeting(m.id);
          window.PCC.router.go("meetings");
        },
      });
    });
  });

  data.rfis.forEach((r) => {
    if (!activeProjectIds[r.project_id]) return;
    if (r.status !== "open") return;
    const bucket = bucketFor(r.date_required || "", windowDays);
    if (!bucket) return;
    items.push({
      kind: r.type === "technical_query" ? "TQ" : "RFI",
      title: (r.number || "") + (r.subject ? " — " + r.subject : ""),
      projectId: r.project_id,
      owner: r.assigned_to || "—",
      dueDate: r.date_required || "",
      bucket: bucket,
      view: function () {
        window.PCC.rfis.expandRfi(r.id);
        window.PCC.router.go("rfis");
      },
    });
  });

  const typesById: { [id: string]: (typeof data.document_types)[number] } = {};
  data.document_types.forEach((t) => {
    typesById[t.id] = t;
  });
  const vendorsById: { [id: string]: (typeof data.vendors)[number] } = {};
  data.vendors.forEach((v) => {
    vendorsById[v.id] = v;
  });
  data.project_document_requirements.forEach((req) => {
    if (!activeProjectIds[req.project_id]) return;
    const type = typesById[req.document_type_id];
    if (!type) return;
    const status = computeRequirementStatus(data, req.project_id, req.document_type_id, req.planned_submission_date);
    if (status === "available") return;
    const bucket = bucketFor(req.planned_submission_date || "", windowDays);
    if (!bucket) return;
    const vendor = req.vendor_id ? vendorsById[req.vendor_id] : null;
    items.push({
      kind: "Document",
      title: type.name + (type.code ? " (" + type.code + ")" : ""),
      projectId: req.project_id,
      owner: vendor ? vendor.vendor_name || "(unnamed vendor)" : "—",
      dueDate: req.planned_submission_date || "",
      bucket: bucket,
      view: function () {
        window.PCC.portfolio.viewProject(req.project_id);
        window.PCC.router.go("portfolio");
      },
    });
  });

  // Gate F: Recovery Actions — the only pre-existing register with a real due date
  // (target_recovery_date) that this page didn't already surface. Same open/in_progress
  // cutoff delayRecoveryDashboard.js's own "Open Recovery Actions" section uses.
  data.recovery_actions.forEach((r) => {
    if (!activeProjectIds[r.project_id]) return;
    if (r.status !== "open" && r.status !== "in_progress") return;
    const bucket = bucketFor(r.target_recovery_date || "", windowDays);
    if (!bucket) return;
    const activity = data.activities.find((a) => a.id === r.activity_id);
    items.push({
      kind: "Recovery Action",
      title: r.description || "(no description)",
      projectId: r.project_id,
      owner: r.responsible_person || "—",
      dueDate: r.target_recovery_date || "",
      bucket: bucket,
      // No fallback destination: a Recovery Action's only home is the Schedule Activity
      // it was entered against (renderRecoveryActionsSection() in pages/schedule.js) —
      // if that activity is gone there's nowhere real to send the planner, so the row
      // still shows (real outstanding data) but isn't clickable, same "(deleted
      // project)" treatment the item row already gives every other kind.
      view: activity
        ? function () {
            window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
            window.PCC.router.go("schedule");
          }
        : null,
    });
  });

  // Gate F: newly-identified Delay Records — see the vanilla page's original header
  // comment for why only "open" status ones are shown (later statuses are tracked via
  // their own Recovery Actions, already covered by the block above).
  data.delay_records.forEach((r) => {
    if (!activeProjectIds[r.project_id]) return;
    if (r.status !== "open") return;
    const activity = r.activity_id ? data.activities.find((a) => a.id === r.activity_id) : null;
    const categoryLabel = ACTION_CENTRE_DELAY_CATEGORY_LABELS[r.delay_category || ""] || r.delay_category || "Other";
    items.push({
      kind: "Delay",
      title:
        categoryLabel +
        (r.description ? " — " + r.description : "") +
        (!r.activity_id ? " (Schedule Impact Not Yet Assessed)" : ""),
      projectId: r.project_id,
      owner: r.responsible_party || "—",
      dueDate: "",
      bucket: "waiting",
      view: activity
        ? function () {
            window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
            window.PCC.router.go("schedule");
          }
        : function () {
            window.PCC.portfolio.viewProject(r.project_id);
            window.PCC.router.go("portfolio");
          },
    });
  });

  data.change_orders.forEach((co) => {
    if (!activeProjectIds[co.project_id]) return;
    if (co.status !== "pending") return;
    items.push({
      kind: "Change Order",
      title: (co.number || "") + (co.title ? " — " + co.title : ""),
      projectId: co.project_id,
      owner: co.requested_by || "—",
      dueDate: "",
      bucket: "waiting",
      view: function () {
        window.PCC.changeOrders.expandChangeOrder(co.id);
        window.PCC.router.go("changeOrders");
      },
    });
  });

  return items;
}

// Function, not a module-level constant, since the "Upcoming" label/empty-text embed
// the now-configurable window — must be rebuilt from the current setting on every
// render, not computed once at load time.
export function buildBuckets(windowDays: number): BucketDef[] {
  return [
    { key: "overdue", label: "Overdue", badgeClass: "critical", emptyText: "Nothing overdue." },
    { key: "today", label: "Due Today", badgeClass: "at_risk", emptyText: "Nothing due today." },
    { key: "week", label: "Due This Week", badgeClass: "at_risk", emptyText: "Nothing due in the next 7 days." },
    {
      key: "upcoming",
      label: "Upcoming (8–" + windowDays + " Days)",
      badgeClass: "info",
      emptyText: "Nothing due in the 8–" + windowDays + " day window.",
    },
    // Redesign Gate 7: relabeled from "Waiting For" — that label collided with My
    // Work's own "WAITING FOR" section, which means something different there (items
    // with an explicit waiting_on_party set, grouped by who). This bucket has always
    // meant "no due date at all to bucket by" (see emptyText, unchanged) — functionally
    // identical, only the label changed, so it stops reading as the same concept.
    { key: "waiting", label: "No Due Date", badgeClass: "info", emptyText: "Nothing outstanding without a due date." },
  ];
}
