/* Service boundary for the Risk Register page (master prompt §9). Thin wrapper over the
 * existing store globals, unchanged from the vanilla page. getData() returns a FRESH
 * top-level object reference (see CLAUDE.md's React migration notes).
 */

export var TYPE_LABELS = { risk: "Risk", issue: "Issue", opportunity: "Opportunity" };
export var STATUS_LABELS = { open: "Open", mitigating: "Mitigating", closed: "Closed" };
export var LEVEL_LABELS = { low: "Low", medium: "Medium", high: "High" };

var SEVERITY_MATRIX = {
  high: { low: "medium", medium: "high", high: "high" },
  medium: { low: "low", medium: "medium", high: "high" },
  low: { low: "low", medium: "low", high: "medium" },
};

export var FIELD_CONFIG = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "type", label: "Type", type: "select", options: "RISK_TYPES", labels: TYPE_LABELS },
  { key: "status", label: "Status", type: "select", options: "RISK_STATUSES", labels: STATUS_LABELS },
  { key: "probability", label: "Probability", type: "select", options: "RISK_LEVELS", labels: LEVEL_LABELS },
  { key: "impact", label: "Impact", type: "select", options: "RISK_LEVELS", labels: LEVEL_LABELS },
  { key: "owner", label: "Owner", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "mitigation", label: "Mitigation / Response", type: "textarea" },
];

export function severityOf(risk) {
  return SEVERITY_MATRIX[risk.probability][risk.impact];
}

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(projects, projectId) {
  if (!projectId) return "Unassigned";
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "Unassigned";
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

export function newRisk(prefill) {
  return window.PCC.store.newRisk(prefill || {});
}

export function saveRisk(isNew, riskId, values, sourceMeetingId) {
  window.PCC.store.update(function (data) {
    if (isNew) {
      var record = Object.assign({}, values);
      if (sourceMeetingId) record.source_meeting_id = sourceMeetingId;
      data.risks.push(window.PCC.store.newRisk(record));
    } else {
      var existing = data.risks.find(function (r) {
        return r.id === riskId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Register entry added." : "Register entry updated.", "success");
}

export function deleteRisk(id) {
  window.PCC.store.update(function (data) {
    data.risks = data.risks.filter(function (item) {
      return item.id !== id;
    });
  });
  window.PCC.notify("Register entry deleted.", "info");
}

export function closeRisks(ids) {
  window.PCC.store.update(function (d) {
    d.risks.forEach(function (item) {
      if (ids[item.id]) {
        item.status = "closed";
        item.updated_at = new Date().toISOString();
      }
    });
  });
}

export function deleteRisks(ids) {
  window.PCC.store.update(function (d) {
    d.risks = d.risks.filter(function (item) {
      return !ids[item.id];
    });
  });
}

export function getProjectContext() {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId) {
  window.PCC.projectContext.set(projectId);
}

export function viewMeeting(meetingId) {
  if (window.PCC.meetings) window.PCC.meetings.expandMeeting(meetingId);
  window.PCC.router.go("meetings");
}

export function viewActivityInSchedule(projectId, scheduleId, activityId) {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}

export function createChangeOrderFromRisk(projectId, riskId) {
  if (window.PCC.changeOrders) window.PCC.changeOrders.createFromRisk(projectId, riskId);
  window.PCC.router.go("changeOrders");
}

export function notify(message, level) {
  window.PCC.notify(message, level);
}
