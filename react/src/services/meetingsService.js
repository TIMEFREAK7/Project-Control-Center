/* Service boundary for the Meetings page (master prompt §9). Thin wrapper over the
 * existing store globals, unchanged from the vanilla page. getData() returns a FRESH
 * top-level object reference (see CLAUDE.md's React migration notes).
 */

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(projects, projectId) {
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "(project removed)";
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function activitiesForProject(data, projectId) {
  var scheduleNameById = {};
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

export function vendorOptions(data) {
  return data.vendors.map(function (v) {
    return { id: v.id, label: v.vendor_name || "(unnamed vendor)" };
  });
}

export function rfisForProject(data, projectId) {
  return data.rfis
    .filter(function (r) {
      return r.project_id === projectId;
    })
    .map(function (r) {
      return { id: r.id, label: (r.number || "") + (r.subject ? " — " + r.subject : "") };
    });
}

export function risksForProject(data, projectId) {
  return data.risks
    .filter(function (r) {
      return r.project_id === projectId;
    })
    .map(function (r) {
      return { id: r.id, label: r.title || "(untitled)" };
    });
}

export function isOverdue(action) {
  return action.status === "open" && !!action.due_date && action.due_date < todayStr();
}

export function overdueCount(meeting) {
  return meeting.actions.filter(isOverdue).length;
}

export function allOpenActions(meetings) {
  var out = [];
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

export function newMeeting(overrides) {
  return window.PCC.store.newMeeting(overrides || {});
}

export function newMeetingAction() {
  return window.PCC.store.newMeetingAction();
}

export function newMeetingRecording() {
  return window.PCC.store.newMeetingRecording();
}

export function saveMeeting(isNew, meetingId, values) {
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

export function deleteMeeting(id) {
  window.PCC.store.update(function (data) {
    data.meetings = data.meetings.filter(function (item) {
      return item.id !== id;
    });
  });
  window.PCC.notify("Meeting deleted.", "info");
}

export function getProjectContext() {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId) {
  window.PCC.projectContext.set(projectId);
}

export function viewActivityInSchedule(projectId, scheduleId, activityId) {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}

export function openDocument(doc) {
  window.PCC.files.open(doc);
}

export function createRiskFromMeeting(projectId, meetingId) {
  if (window.PCC.risks) window.PCC.risks.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("risks");
}
export function createDocumentFromMeeting(projectId, meetingId) {
  if (window.PCC.files) window.PCC.files.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("documents");
}
export function createRfiFromMeeting(projectId, meetingId) {
  if (window.PCC.rfis) window.PCC.rfis.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("rfis");
}
export function createChangeOrderFromMeeting(projectId, meetingId) {
  if (window.PCC.changeOrders) window.PCC.changeOrders.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("changeOrders");
}
export function createDecisionFromMeeting(projectId, meetingId) {
  if (window.PCC.decisionRegister) window.PCC.decisionRegister.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("decisionRegister");
}
export function createLessonFromMeeting(projectId, meetingId) {
  if (window.PCC.lessonsLearned) window.PCC.lessonsLearned.createFromMeeting(projectId, meetingId);
  window.PCC.router.go("lessonsLearned");
}
