/* Service boundary for the Meetings page (master prompt §9). Thin wrapper over the
 * existing store globals, unchanged from the vanilla page. getData() returns a FRESH
 * top-level object reference (see CLAUDE.md's React migration notes).
 */
import type { PCCStoreData, PCCProject, PCCMeeting, PCCMeetingAction, PCCDocument } from "../types/pcc";

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(projects: PCCProject[], projectId: string | undefined): string {
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "(project removed)";
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

export interface LabeledOption {
  id: string;
  label: string;
}

export function vendorOptions(data: PCCStoreData): LabeledOption[] {
  return data.vendors.map(function (v) {
    return { id: v.id, label: v.vendor_name || "(unnamed vendor)" };
  });
}

export function rfisForProject(data: PCCStoreData, projectId: string): LabeledOption[] {
  return data.rfis
    .filter(function (r) {
      return r.project_id === projectId;
    })
    .map(function (r) {
      return { id: r.id, label: (r.number || "") + (r.subject ? " — " + r.subject : "") };
    });
}

export function risksForProject(data: PCCStoreData, projectId: string): LabeledOption[] {
  return data.risks
    .filter(function (r) {
      return r.project_id === projectId;
    })
    .map(function (r) {
      return { id: r.id, label: r.title || "(untitled)" };
    });
}

export function isOverdue(action: PCCMeetingAction): boolean {
  return action.status === "open" && !!action.due_date && action.due_date < todayStr();
}

export function overdueCount(meeting: PCCMeeting): number {
  return meeting.actions.filter(isOverdue).length;
}

export interface OpenActionEntry {
  action: PCCMeetingAction;
  meeting: PCCMeeting;
}

export function allOpenActions(meetings: PCCMeeting[]): OpenActionEntry[] {
  var out: OpenActionEntry[] = [];
  meetings.forEach(function (m) {
    m.actions.forEach(function (a) {
      if (a.status === "open") out.push({ action: a, meeting: m });
    });
  });
  out.sort(function (x, y) {
    return (x.action.due_date || "9999").localeCompare(y.action.due_date || "9999");
  });
  return out;
}

export function newMeeting(overrides?: Partial<PCCMeeting> | null): PCCMeeting {
  return window.PCC.store.newMeeting(overrides || {});
}

export function newMeetingAction() {
  return window.PCC.store.newMeetingAction();
}

export function newMeetingRecording() {
  return window.PCC.store.newMeetingRecording();
}

export function saveMeeting(isNew: boolean, meetingId: string | undefined, values: Partial<PCCMeeting>): void {
  window.PCC.store.update(function (data) {
    if (isNew) {
      data.meetings.push(window.PCC.store.newMeeting(values));
    } else {
      var existing = data.meetings.find(function (m) {
        return m.id === meetingId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Meeting added." : "Meeting updated.", "success");
}

export function deleteMeeting(id: string): void {
  window.PCC.store.update(function (data) {
    data.meetings = data.meetings.filter(function (item) {
      return item.id !== id;
    });
  });
  window.PCC.notify("Meeting deleted.", "info");
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

export function viewActivityInSchedule(projectId: string, scheduleId: string, activityId: string): void {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}

export function openDocument(doc: PCCDocument): void {
  if (window.PCC.files && window.PCC.files.open) window.PCC.files.open(doc);
}

export function createRiskFromMeeting(projectId: string, meetingId: string): void {
  if (window.PCC.risks && window.PCC.risks.createFromMeeting) window.PCC.risks.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("risks");
}
export function createDocumentFromMeeting(projectId: string, meetingId: string): void {
  if (window.PCC.files && window.PCC.files.createFromMeeting) window.PCC.files.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("documents");
}
export function createRfiFromMeeting(projectId: string, meetingId: string): void {
  if (window.PCC.rfis && window.PCC.rfis.createFromMeeting) window.PCC.rfis.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("rfis");
}
export function createChangeOrderFromMeeting(projectId: string, meetingId: string): void {
  if (window.PCC.changeOrders && window.PCC.changeOrders.createFromMeeting) window.PCC.changeOrders.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("changeOrders");
}
export function createDecisionFromMeeting(projectId: string, meetingId: string): void {
  if (window.PCC.decisionRegister && window.PCC.decisionRegister.createFromMeeting) window.PCC.decisionRegister.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("decisionRegister");
}
export function createLessonFromMeeting(projectId: string, meetingId: string): void {
  if (window.PCC.lessonsLearned && window.PCC.lessonsLearned.createFromMeeting) window.PCC.lessonsLearned.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("lessonsLearned");
}
