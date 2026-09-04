/* Service boundary for the Decision Register page (master prompt §9). Thin wrapper over
 * the existing store globals, unchanged from the vanilla page. getData() returns a FRESH
 * top-level object reference (see CLAUDE.md's React migration notes on this rule).
 */
import type { PCCStoreData, PCCProject, PCCDecision } from "../types/pcc";

export interface FieldConfig {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  optional?: boolean;
  options?: "DECISION_STATUSES" | "WAITING_ON_PARTIES";
  labels?: { [value: string]: string };
}

export var STATUS_LABELS: { [status: string]: string } = { pending: "Pending", decided: "Decided", deferred: "Deferred", superseded: "Superseded" };
export var WAITING_ON_LABELS: { [party: string]: string } = { vendor: "Vendor", client: "Client", consultant: "Consultant", management: "Management" };

export var FIELD_CONFIG: FieldConfig[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "status", label: "Status", type: "select", options: "DECISION_STATUSES", labels: STATUS_LABELS },
  { key: "decision_date", label: "Decision Date", type: "date" },
  { key: "decided_by", label: "Decided By", type: "text" },
  { key: "waiting_on_party", label: "Waiting On", type: "select", options: "WAITING_ON_PARTIES", labels: WAITING_ON_LABELS, optional: true },
  { key: "description", label: "Context / Background", type: "textarea" },
  { key: "decision", label: "Decision", type: "textarea" },
];

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

export function newDecision(prefill?: Partial<PCCDecision> | null): PCCDecision {
  return window.PCC.store.newDecision(prefill || {});
}

export function saveDecision(isNew: boolean, decisionId: string | undefined, values: Partial<PCCDecision>, sourceMeetingId?: string | null): void {
  window.PCC.store.update(function (data) {
    if (isNew) {
      var record = Object.assign({}, values);
      if (sourceMeetingId) record.source_meeting_id = sourceMeetingId;
      data.decisions.push(window.PCC.store.newDecision(record));
    } else {
      var existing = data.decisions.find(function (d) {
        return d.id === decisionId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.store.rememberLastUsedName("decision_decided_by", values.decided_by);
  window.PCC.notify(isNew ? "Decision added." : "Decision updated.", "success");
}

export function deleteDecision(id: string): void {
  window.PCC.store.update(function (data) {
    data.decisions = data.decisions.filter(function (item) {
      return item.id !== id;
    });
  });
  window.PCC.notify("Decision deleted.", "info");
}

export function deferDecisions(ids: { [id: string]: boolean }): void {
  window.PCC.store.update(function (data) {
    data.decisions.forEach(function (item) {
      if (ids[item.id]) {
        item.status = "deferred";
        item.updated_at = new Date().toISOString();
      }
    });
  });
}

export function deleteDecisions(ids: { [id: string]: boolean }): void {
  window.PCC.store.update(function (data) {
    data.decisions = data.decisions.filter(function (item) {
      return !ids[item.id];
    });
  });
}

export function getLastUsedDecidedBy(): string {
  return window.PCC.store.getLastUsedName("decision_decided_by");
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
