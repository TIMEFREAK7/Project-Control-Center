/* Service boundary for the Resource Management page (master prompt §9). Thin wrapper
 * over the existing store globals and resourceLevelingEngine.js's pure calculations —
 * never reimplemented here. getData() returns a FRESH top-level object reference (see
 * CLAUDE.md's React migration notes).
 */

export var TYPE_LABELS = {
  employee: "Employee",
  engineer: "Engineer",
  supervisor: "Supervisor",
  skilled_labor: "Skilled Labor",
  unskilled_labor: "Unskilled Labor",
  contractor: "Contractor",
  subcontractor: "Subcontractor",
  equipment: "Equipment",
  machinery: "Machinery",
  material: "Material",
  labor: "Labor (legacy)",
};

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(projects, projectId) {
  var p = projects.find(function (x) {
    return x.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "(project removed)";
}

export function resourceName(resources, resourceId) {
  var r = resources.find(function (x) {
    return x.id === resourceId;
  });
  return r ? r.name || "(unnamed resource)" : "(resource deleted)";
}

export function activityLabel(activities, activityId) {
  var a = activities.find(function (x) {
    return x.id === activityId;
  });
  return a ? a.name || "(unnamed activity)" : "(activity deleted)";
}

export function vendorName(vendors, vendorId) {
  if (!vendorId) return "";
  var v = vendors.find(function (x) {
    return x.id === vendorId;
  });
  return v ? v.vendor_name || "(unnamed vendor)" : "(vendor deleted)";
}

export function activitiesForProject(data, projectId) {
  if (!projectId) return [];
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

export function newResource() {
  return window.PCC.store.newResource({});
}
export function newResourceAssignment() {
  return window.PCC.store.newResourceAssignment({});
}
export function newResourceUnavailability() {
  return window.PCC.store.newResourceUnavailability({});
}

export function saveResource(isNew, resourceId, values) {
  window.PCC.store.update(function (data) {
    if (isNew) {
      data.resources.push(window.PCC.store.newResource(values));
    } else {
      var existing = data.resources.find(function (r) {
        return r.id === resourceId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Resource added." : "Resource updated.", "success");
}

export function deleteResource(id) {
  window.PCC.store.update(function (d) {
    d.resources = d.resources.filter(function (item) {
      return item.id !== id;
    });
    d.resource_assignments = d.resource_assignments.filter(function (a) {
      return a.resource_id !== id;
    });
  });
  window.PCC.notify("Resource deleted.", "success");
}

export function saveAssignment(isNew, assignmentId, values) {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.resource_assignments.push(window.PCC.store.newResourceAssignment(values));
    } else {
      var existing = d.resource_assignments.find(function (a) {
        return a.id === assignmentId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Assignment added." : "Assignment updated.", "success");
}

export function deleteAssignment(id) {
  window.PCC.store.update(function (d) {
    d.resource_assignments = d.resource_assignments.filter(function (item) {
      return item.id !== id;
    });
  });
  window.PCC.notify("Assignment deleted.", "success");
}

export function saveUnavailability(isNew, recordId, values) {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.resource_unavailability.push(window.PCC.store.newResourceUnavailability(values));
    } else {
      var existing = d.resource_unavailability.find(function (u) {
        return u.id === recordId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Unavailable period added." : "Unavailable period updated.", "success");
}

export function deleteUnavailability(id) {
  window.PCC.store.update(function (d) {
    d.resource_unavailability = d.resource_unavailability.filter(function (item) {
      return item.id !== id;
    });
  });
  window.PCC.notify("Period deleted.", "success");
}

export function portfolioOverAllocationSummary(data) {
  return window.PCC.resourceLevelingEngine.portfolioOverAllocationSummary(
    data.resources,
    data.resource_assignments,
    data.activities,
    data.resource_unavailability
  );
}

export function computeResourceUsageTimeline(resource, data) {
  return window.PCC.resourceLevelingEngine.computeResourceUsageTimeline(resource, data.resource_assignments, data.activities);
}
export function detectOverAllocations(resource, timeline, data) {
  return window.PCC.resourceLevelingEngine.detectOverAllocations(resource, timeline, data.resource_unavailability);
}
export function computeUtilisation(resource, timeline, data) {
  return window.PCC.resourceLevelingEngine.computeUtilisation(resource, timeline, data.resource_unavailability);
}
export function bucketUtilisation(days, bucketSizeDays) {
  return window.PCC.resourceLevelingEngine.bucketUtilisation(days, bucketSizeDays);
}
export function bucketTimeline(days, bucketSizeDays) {
  return window.PCC.resourceLevelingEngine.bucketTimeline(days, bucketSizeDays);
}
export function levelResourceWithinFloat(resource, data) {
  return window.PCC.resourceLevelingEngine.levelResourceWithinFloat(
    resource,
    data.resource_assignments,
    data.activities,
    data.resource_unavailability
  );
}

export function applyLevelingProposal(activityId, proposedStart) {
  window.PCC.store.update(function (d) {
    var act = d.activities.find(function (a) {
      return a.id === activityId;
    });
    if (act) {
      act.constraint_type = "SNET";
      act.constraint_date = proposedStart;
    }
  });
}

export function viewActivityInSchedule(projectId, scheduleId, activityId) {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}
