/* Service boundary for the RFI / Technical Query Management page (master prompt §9).
 * Thin wrapper over the existing store globals, unchanged from the vanilla page.
 * getData() returns a FRESH top-level object reference (see CLAUDE.md's React migration
 * notes).
 */
import type { PCCStoreData, PCCProject, PCCRfi } from "../types/pcc";

export interface FieldConfig {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  optional?: boolean;
  options?: "RFI_TYPES" | "RFI_PRIORITIES" | "WAITING_ON_PARTIES";
  labels?: { [value: string]: string };
}

export var TYPE_LABELS: { [type: string]: string } = { rfi: "RFI", technical_query: "Technical Query" };
export var STATUS_LABELS: { [status: string]: string } = { open: "Open", answered: "Answered", closed: "Closed" };
export var PRIORITY_LABELS: { [priority: string]: string } = { low: "Low", medium: "Medium", high: "High" };
export var WAITING_ON_LABELS: { [party: string]: string } = { vendor: "Vendor", client: "Client", consultant: "Consultant", management: "Management" };

export var FIELD_CONFIG: FieldConfig[] = [
  { key: "subject", label: "Subject", type: "text", required: true },
  { key: "type", label: "Type", type: "select", options: "RFI_TYPES", labels: TYPE_LABELS },
  { key: "priority", label: "Priority", type: "select", options: "RFI_PRIORITIES", labels: PRIORITY_LABELS },
  { key: "raised_by", label: "Raised By", type: "text" },
  { key: "assigned_to", label: "Assigned To", type: "text" },
  { key: "date_raised", label: "Date Raised", type: "date" },
  { key: "date_required", label: "Response Required By", type: "date" },
  { key: "waiting_on_party", label: "Waiting On", type: "select", options: "WAITING_ON_PARTIES", labels: WAITING_ON_LABELS, optional: true },
  { key: "question", label: "Question / Query", type: "textarea", required: true },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
export function isOverdue(r: PCCRfi): boolean {
  return r.status === "open" && !!r.date_required && r.date_required < today();
}

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(projects: PCCProject[], projectId: string | undefined): string {
  if (!projectId) return "Unassigned";
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "Unassigned";
}

export interface ActivityOption {
  id: string;
  label: string;
}

export function activitiesForProject(data: PCCStoreData, projectId: string): ActivityOption[] {
  var scheduleNameById: { [id: string]: string | undefined } = {};
  data.schedules
    .filter(function (s) {
      return s.project_id === projectId;
    })
    .forEach(function (s) {
      scheduleNameById[s.id] = s.name;
    });
  return data.activities
    .filter(function (a) {
      return a.project_id === projectId;
    })
    .map(function (a) {
      return { id: a.id, label: (scheduleNameById[a.schedule_id] || "(schedule)") + ": " + (a.name || "(unnamed activity)") };
    });
}

export function newRfi(prefill?: Partial<PCCRfi> | null): PCCRfi {
  return window.PCC.store.newRfi(prefill || {});
}

export function saveRfi(isNew: boolean, rfiId: string | undefined, values: Partial<PCCRfi>, sourceMeetingId?: string | null): void {
  window.PCC.store.update(function (data) {
    if (isNew) {
      var record = Object.assign({}, values);
      if (sourceMeetingId) record.source_meeting_id = sourceMeetingId;
      record.number = window.PCC.store.nextRfiNumber(data.rfis, values.type || "rfi");
      data.rfis.push(window.PCC.store.newRfi(record));
    } else {
      var existing = data.rfis.find(function (r) {
        return r.id === rfiId;
      });
      if (existing) {
        var wasAnswered =
          existing.status !== "answered" && existing.status !== "closed" && (values.status === "answered" || values.status === "closed");
        Object.assign(existing, values);
        if (wasAnswered && !existing.date_answered) existing.date_answered = today();
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.store.rememberLastUsedName("rfi_raised_by", values.raised_by);
  window.PCC.notify(isNew ? "Entry added." : "Entry updated.", "success");
}

export function deleteRfi(id: string): void {
  window.PCC.store.update(function (data) {
    data.rfis = data.rfis.filter(function (item) {
      return item.id !== id;
    });
  });
  window.PCC.notify("Entry deleted.", "info");
}

export function bulkClose(ids: { [id: string]: boolean }): void {
  window.PCC.store.update(function (d) {
    d.rfis.forEach(function (item) {
      if (ids[item.id]) {
        var wasAnswered = item.status !== "answered" && item.status !== "closed";
        item.status = "closed";
        if (wasAnswered && !item.date_answered) item.date_answered = today();
        item.updated_at = new Date().toISOString();
      }
    });
  });
}

export function bulkDelete(ids: { [id: string]: boolean }): void {
  window.PCC.store.update(function (d) {
    d.rfis = d.rfis.filter(function (item) {
      return !ids[item.id];
    });
  });
}

export function addRevisionNote(rfiId: string, author: string, note: string): void {
  window.PCC.store.update(function (data) {
    var existing = data.rfis.find(function (item) {
      return item.id === rfiId;
    });
    if (existing) {
      existing.revisions.push(window.PCC.store.newRfiRevision({ author: author.trim(), note: note.trim() }));
      existing.updated_at = new Date().toISOString();
    }
  });
}

export function getLastRaisedBy(): string {
  return window.PCC.store.getLastUsedName("rfi_raised_by");
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

export function viewMeeting(meetingId: string): void {
  if (window.PCC.meetings) window.PCC.meetings.expandMeeting(meetingId);
  window.PCC.router.go("meetings");
}
export function viewActivityInSchedule(projectId: string, scheduleId: string, activityId: string): void {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}
export function createChangeOrderFromRfi(projectId: string, rfiId: string): void {
  if (window.PCC.changeOrders && window.PCC.changeOrders.createFromRfi) window.PCC.changeOrders.createFromRfi(projectId, rfiId);
  window.PCC.router.go("changeOrders");
}
