/* Service boundary for the Change Management page (master prompt §9). Thin wrapper over
 * the existing store globals, unchanged from the vanilla page. getData() returns a
 * FRESH top-level object reference (see CLAUDE.md's React migration notes).
 */

export var STATUS_LABELS = { pending: "Pending", approved: "Approved", rejected: "Rejected", closed: "Closed" };
export var WAITING_ON_LABELS = { vendor: "Vendor", client: "Client", consultant: "Consultant", management: "Management" };

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

export function formatMoney(amount) {
  if (amount === null || amount === undefined || amount === "") return null;
  var n = Number(amount);
  if (isNaN(n)) return null;
  var sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + Math.abs(n).toLocaleString();
}

export function formatDays(days) {
  if (days === null || days === undefined || days === "") return null;
  var n = Number(days);
  if (isNaN(n)) return null;
  var sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + Math.abs(n) + (Math.abs(n) === 1 ? " day" : " days");
}

export function statusBadgeClass(status) {
  if (status === "approved") return "status-badge--on_track";
  if (status === "rejected") return "status-badge--critical";
  if (status === "closed") return "status-badge--complete";
  return "status-badge--info";
}

export function sourceOptionsFor(data, projectId) {
  return {
    rfis: data.rfis.filter(function (r) {
      return r.project_id === projectId;
    }),
    risks: data.risks.filter(function (r) {
      return r.project_id === projectId;
    }),
  };
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

export function newChangeOrder(prefill) {
  return window.PCC.store.newChangeOrder(prefill || {});
}

export function saveChangeOrder(isNew, coId, values, sourceMeetingId) {
  window.PCC.store.update(function (data) {
    if (isNew) {
      var record = Object.assign({}, values);
      if (sourceMeetingId) record.source_meeting_id = sourceMeetingId;
      record.number = window.PCC.store.nextChangeOrderNumber(data.change_orders);
      data.change_orders.push(window.PCC.store.newChangeOrder(record));
    } else {
      var existing = data.change_orders.find(function (item) {
        return item.id === coId;
      });
      if (existing) {
        var wasDecided = existing.status === "pending" && (values.status === "approved" || values.status === "rejected");
        Object.assign(existing, values);
        if (wasDecided && !existing.date_decided) existing.date_decided = new Date().toISOString().slice(0, 10);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.store.rememberLastUsedName("change_order_requested_by", values.requested_by);
  window.PCC.notify(isNew ? "Change Order added." : "Change Order updated.", "success");
}

export function deleteChangeOrder(id) {
  window.PCC.store.update(function (data) {
    data.change_orders = data.change_orders.filter(function (item) {
      return item.id !== id;
    });
  });
  window.PCC.notify("Change Order deleted.", "info");
}

export function bulkSetStatus(ids, newStatus) {
  window.PCC.store.update(function (d) {
    d.change_orders.forEach(function (item) {
      if (ids[item.id]) {
        var wasDecided = item.status === "pending";
        item.status = newStatus;
        if (wasDecided && !item.date_decided) item.date_decided = new Date().toISOString().slice(0, 10);
        item.updated_at = new Date().toISOString();
      }
    });
  });
}

export function bulkDelete(ids) {
  window.PCC.store.update(function (d) {
    d.change_orders = d.change_orders.filter(function (item) {
      return !ids[item.id];
    });
  });
}

export function addRevisionNote(coId, author, note) {
  window.PCC.store.update(function (data) {
    var existing = data.change_orders.find(function (item) {
      return item.id === coId;
    });
    if (existing) {
      existing.revisions.push(window.PCC.store.newChangeOrderRevision({ author: author.trim(), note: note.trim() }));
      existing.updated_at = new Date().toISOString();
    }
  });
}

export function getLastRequestedBy() {
  return window.PCC.store.getLastUsedName("change_order_requested_by");
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
export function viewRfi(rfiId) {
  if (window.PCC.rfis) window.PCC.rfis.expandRfi(rfiId);
  window.PCC.router.go("rfis");
}
export function viewRisk(riskId) {
  if (window.PCC.risks && window.PCC.risks.expandRisk) window.PCC.risks.expandRisk(riskId);
  window.PCC.router.go("risks");
}
export function viewActivityInSchedule(projectId, scheduleId, activityId) {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}
