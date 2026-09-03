/* Service boundary for the Portfolio page (master prompt §9). Thin wrapper over the
 * existing store globals and executiveCenter.js's/resourceLevelingEngine.js's pure
 * calculations — never reimplemented here. getData() returns a FRESH top-level object
 * reference (see CLAUDE.md's React migration notes).
 */

export var STATUS_LABELS = {
  on_track: "On Track",
  at_risk: "At Risk",
  critical: "Critical",
  complete: "Complete",
};

export var REVIEW_CADENCE_OPTIONS = [7, 14, 30];
export var REVIEW_CADENCE_LABELS = { 7: "Weekly", 14: "Biweekly", 30: "Monthly" };

export var FIELD_CONFIG = [
  { key: "name", label: "Project Name", type: "text", required: true },
  { key: "project_code", label: "Project Code", type: "text" },
  { key: "country", label: "Country", type: "text" },
  { key: "location", label: "Location", type: "text" },
  { key: "sector", label: "Sector", type: "text" },
  { key: "contract_type", label: "Contract Type", type: "text" },
  { key: "project_type", label: "Project Type", type: "text" },
  { key: "budget", label: "Budget", type: "number" },
  { key: "contract_value", label: "Contract Value", type: "number" },
  { key: "currency", label: "Currency", type: "text" },
  { key: "start_date", label: "Start Date", type: "date" },
  { key: "finish_date", label: "Finish Date", type: "date" },
  { key: "status", label: "Status", type: "select" },
  { key: "progress", label: "Progress (%)", type: "number", min: 0, max: 100 },
  { key: "project_manager", label: "Project Manager", type: "text" },
  { key: "planner", label: "Planner", type: "text" },
  { key: "engineers", label: "Engineers", type: "text" },
  { key: "contractor", label: "Contractor", type: "text" },
  { key: "consultant", label: "Consultant", type: "text" },
  { key: "owner", label: "Owner", type: "text" },
  { key: "review_cadence_days", label: "Review Cadence", type: "cadence_select" },
];

export var DETAIL_FIELDS = [
  { key: "project_code", label: "Project Code" },
  { key: "sector", label: "Sector" },
  { key: "contract_type", label: "Contract Type" },
  { key: "contract_value", label: "Contract Value", money: true },
  { key: "start_date", label: "Start Date" },
  { key: "location", label: "Location" },
  { key: "project_manager", label: "Project Manager" },
  { key: "planner", label: "Planner" },
  { key: "engineers", label: "Engineers" },
  { key: "contractor", label: "Contractor" },
  { key: "consultant", label: "Consultant" },
  { key: "owner", label: "Owner" },
];

export var REQUIREMENT_STATUS_BADGE = {
  available: { className: "complete", label: "Available" },
  overdue: { className: "critical", label: "Overdue" },
  required: { className: "at_risk", label: "Required" },
};

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function formatMoney(value, currency) {
  if (value === null || value === undefined || value === "") return "—";
  var num = Number(value);
  if (Number.isNaN(num)) return "—";
  return (currency ? currency + " " : "") + num.toLocaleString();
}

export function distinctValues(projects, key) {
  var seen = {};
  var out = [];
  projects.forEach(function (p) {
    var v = p[key];
    if (v && !seen[v]) {
      seen[v] = true;
      out.push(v);
    }
  });
  out.sort();
  return out;
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function computeRequirementAvailability(data, projectId, documentTypeId) {
  return data.documents.some(function (d) {
    return d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at;
  });
}

export function computeRequirementStatus(data, projectId, documentTypeId, plannedDate) {
  if (computeRequirementAvailability(data, projectId, documentTypeId)) return "available";
  if (plannedDate && plannedDate < todayIsoDate()) return "overdue";
  return "required";
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

var DAY_MS = 24 * 60 * 60 * 1000;
function toDayNumber(isoDateStr) {
  return Math.round(new Date(isoDateStr + "T00:00:00Z").getTime() / DAY_MS);
}
function toIsoDate(dayNumber) {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}
function addDays(isoDateStr, days) {
  return toIsoDate(toDayNumber(isoDateStr) + days);
}
function activityStartDate(activity) {
  if (!activity) return null;
  return activity.early_start || activity.planned_start || null;
}

export function computeSuggestedDueDate(data, activityId, leadTimeDays) {
  if (!activityId || !leadTimeDays) return null;
  var activity = data.activities.find(function (a) {
    return a.id === activityId;
  });
  var startDate = activityStartDate(activity);
  if (!startDate) return null;
  return addDays(startDate, -leadTimeDays);
}

export function projectIsUpcoming(p, data) {
  var todayIso = todayIsoDate();
  if (p.start_date) return p.start_date > todayIso;
  return !data.activities.some(function (a) {
    return a.project_id === p.id;
  });
}

export function computePortfolioKpis(data) {
  var nonArchived = data.projects.filter(function (p) {
    return !p.archived;
  });
  var delayedCount = 0;
  var upcomingCount = 0;
  var totalUnaddressedDelayDays = 0;
  nonArchived.forEach(function (p) {
    var summary = window.PCC.executiveCenter.getHealthSummary(p.id);
    if (summary.delayedActivityCount > 0) delayedCount++;
    if (projectIsUpcoming(p, data)) upcomingCount++;
    totalUnaddressedDelayDays += window.PCC.executiveCenter.getSchedulePerformanceSummary(p.id).unaddressedDelayDays;
  });
  return {
    total: data.projects.length,
    active: nonArchived.length,
    completed: data.projects.filter(function (p) {
      return p.status === "complete";
    }).length,
    atRisk: nonArchived.filter(function (p) {
      return p.status === "at_risk";
    }).length,
    delayed: delayedCount,
    upcoming: upcomingCount,
    unaddressedDelayDays: totalUnaddressedDelayDays,
  };
}

export function getHealthSummary(projectId) {
  return window.PCC.executiveCenter.getHealthSummary(projectId);
}
export function getSchedulePerformanceSummary(projectId) {
  return window.PCC.executiveCenter.getSchedulePerformanceSummary(projectId);
}

var SEVERITY_MATRIX = {
  high: { low: "medium", medium: "high", high: "high" },
  medium: { low: "low", medium: "medium", high: "high" },
  low: { low: "low", medium: "low", high: "medium" },
};
function riskSeverity(r) {
  return SEVERITY_MATRIX[r.probability] ? SEVERITY_MATRIX[r.probability][r.impact] : "medium";
}

export function computeScheduleHealthCheap(data, projectId) {
  var todayIso = todayIsoDate();
  var behind = data.activities.some(function (a) {
    if (a.project_id !== projectId) return false;
    if (a.activity_type !== "task" && a.activity_type !== "milestone") return false;
    return (
      (a.status === "not_started" && a.planned_start && a.planned_start < todayIso) ||
      (a.status === "in_progress" && a.planned_finish && a.planned_finish < todayIso)
    );
  });
  return behind ? "Behind Schedule" : "On Schedule";
}

export function computeRiskLevel(data, projectId) {
  var openRisks = data.risks.filter(function (r) {
    return r.project_id === projectId && r.status !== "closed";
  });
  if (openRisks.length === 0) return "None";
  if (openRisks.some(function (r) { return riskSeverity(r) === "high"; })) return "High";
  if (openRisks.some(function (r) { return riskSeverity(r) === "medium"; })) return "Medium";
  return "Low";
}

export function computeKeyMilestoneCheap(data, projectId) {
  var scheduleIds = data.schedules
    .filter(function (s) { return s.project_id === projectId; })
    .map(function (s) { return s.id; });
  var candidates = data.activities
    .filter(function (a) {
      return scheduleIds.indexOf(a.schedule_id) !== -1 && a.activity_type === "milestone" && a.status !== "complete";
    })
    .map(function (a) { return { name: a.name, date: a.early_start || a.planned_start }; })
    .filter(function (x) { return x.date; });
  candidates.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return candidates.length > 0 ? candidates[0] : null;
}

export function projectCardStats(data, projectId) {
  var openRisks = data.risks.filter(function (r) {
    return r.project_id === projectId && r.status !== "closed";
  }).length;
  var openRfis = data.rfis.filter(function (r) {
    return r.project_id === projectId && r.status !== "closed";
  }).length;

  var docTypesById = {};
  data.document_types.forEach(function (t) {
    docTypesById[t.id] = t;
  });
  var requirements = data.project_document_requirements.filter(function (r) {
    return r.project_id === projectId && docTypesById[r.document_type_id];
  });
  var docsAvailable = requirements.filter(function (r) {
    return data.documents.some(function (d) {
      return d.project_id === projectId && d.document_type_id === r.document_type_id && !d.trashed_at;
    });
  }).length;

  return { openRisks: openRisks, openRfis: openRfis, docsAvailable: docsAvailable, docsTotal: requirements.length };
}

export function projectMatchesFilters(p, data, filters) {
  if (!filters.showArchived && p.archived) return false;
  if (filters.statusFilter && p.status !== filters.statusFilter) return false;
  if (filters.clientFilter && p.client !== filters.clientFilter) return false;
  if (filters.countryFilter && p.country !== filters.countryFilter) return false;
  if (filters.locationFilter && p.location !== filters.locationFilter) return false;
  if (filters.sectorFilter && p.sector !== filters.sectorFilter) return false;
  if (filters.pmFilter && p.project_manager !== filters.pmFilter) return false;
  if (filters.plannerFilter && p.planner !== filters.plannerFilter) return false;
  if (filters.typeFilter && p.project_type !== filters.typeFilter) return false;
  if (filters.yearFilter && (p.start_date || "").slice(0, 4) !== filters.yearFilter) return false;
  if (filters.healthFilter && computeScheduleHealthCheap(data, p.id) !== filters.healthFilter) return false;
  if (filters.search) {
    var haystack = (
      p.name + " " + p.client + " " + p.company + " " + p.location + " " + p.sector + " " + p.project_manager + " " + p.planner
    ).toLowerCase();
    if (haystack.indexOf(filters.search.toLowerCase()) === -1) return false;
  }
  return true;
}

// ===== Company / Client =====

export function activeCompanies(data, selectedId) {
  var companies = data.companies
    .filter(function (c) { return !c.archived; })
    .slice()
    .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  if (selectedId && !companies.some(function (c) { return c.id === selectedId; })) {
    var archivedCurrent = data.companies.find(function (c) { return c.id === selectedId; });
    if (archivedCurrent) companies.push(archivedCurrent);
  }
  return companies;
}

export function activeClients(data, companyId, selectedId) {
  if (!companyId) return [];
  var clients = data.clients
    .filter(function (c) { return !c.archived && c.company_id === companyId; })
    .slice()
    .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  if (selectedId && !clients.some(function (c) { return c.id === selectedId; })) {
    var archivedCurrent = data.clients.find(function (c) { return c.id === selectedId && c.company_id === companyId; });
    if (archivedCurrent) clients.push(archivedCurrent);
  }
  return clients;
}

export function createCompany(name) {
  var created;
  window.PCC.store.update(function (d) {
    created = window.PCC.store.newCompany({ name: name });
    d.companies.push(created);
  });
  window.PCC.notify("Company added.", "success");
  return created;
}

export function createClient(companyId, name) {
  var created;
  window.PCC.store.update(function (d) {
    created = window.PCC.store.newClient({ company_id: companyId, name: name });
    d.clients.push(created);
  });
  window.PCC.notify("Client added.", "success");
  return created;
}

// ===== Save / Archive =====

export function newProject(prefill) {
  return window.PCC.store.newProject(prefill || {});
}

export function saveProject(isNew, projectId, values, docReq) {
  window.PCC.store.update(function (data) {
    var companyRec = values.company_id ? data.companies.find(function (c) { return c.id === values.company_id; }) : null;
    var clientRec = values.client_id ? data.clients.find(function (c) { return c.id === values.client_id; }) : null;
    values.company = companyRec ? companyRec.name : "";
    values.client = clientRec ? clientRec.name : "";

    var resolvedProjectId;
    if (isNew) {
      var created = window.PCC.store.newProject(values);
      data.projects.push(created);
      resolvedProjectId = created.id;
    } else {
      var existing = data.projects.find(function (p) { return p.id === projectId; });
      if (existing) {
        if (
          (existing.company_id || existing.client_id) &&
          (existing.company_id !== values.company_id || existing.client_id !== values.client_id)
        ) {
          if (!existing.relationship_history) existing.relationship_history = [];
          existing.relationship_history.push({
            company_id: existing.company_id || "",
            client_id: existing.client_id || "",
            company_name: existing.company || "",
            client_name: existing.client || "",
            changed_at: new Date().toISOString(),
          });
        }
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
      resolvedProjectId = projectId;
    }

    var selected = {};
    docReq.selectedTypeIds.forEach(function (typeId) {
      selected[typeId] = true;
    });
    var existingByTypeId = {};
    data.project_document_requirements
      .filter(function (r) { return r.project_id === resolvedProjectId; })
      .forEach(function (r) {
        existingByTypeId[r.document_type_id] = r;
      });
    data.project_document_requirements = data.project_document_requirements.filter(function (r) {
      return r.project_id !== resolvedProjectId || selected[r.document_type_id];
    });
    Object.keys(selected).forEach(function (typeId) {
      var plannedDate = docReq.dueDates[typeId] || null;
      var vendorId = docReq.vendorIds[typeId] || "";
      var activityId = docReq.activityIds[typeId] || "";
      var leadTimeDays = docReq.leadTimes[typeId] || null;
      var existingRow = existingByTypeId[typeId];
      if (existingRow) {
        existingRow.planned_submission_date = plannedDate;
        existingRow.vendor_id = vendorId;
        existingRow.activity_id = activityId;
        existingRow.lead_time_days = leadTimeDays;
      } else {
        data.project_document_requirements.push(
          window.PCC.store.newProjectDocumentRequirement({
            project_id: resolvedProjectId,
            document_type_id: typeId,
            planned_submission_date: plannedDate,
            vendor_id: vendorId,
            activity_id: activityId,
            lead_time_days: leadTimeDays,
          })
        );
      }
    });
  });

  window.PCC.notify(isNew ? "Project added." : "Project updated.", "success");
}

export function toggleArchive(projectId) {
  var wasArchived;
  window.PCC.store.update(function (data) {
    var existing = data.projects.find(function (p) { return p.id === projectId; });
    if (existing) {
      wasArchived = existing.archived;
      existing.archived = !existing.archived;
      existing.updated_at = new Date().toISOString();
    }
  });
  window.PCC.notify(wasArchived ? "Project unarchived." : "Project archived.", "info");
}

export function isPinned(projectId) {
  return window.PCC.projectContext.isPinned(projectId);
}
export function togglePin(projectId) {
  var pinnedNow = window.PCC.projectContext.isPinned(projectId);
  window.PCC.projectContext.togglePin(projectId);
  window.PCC.notify(pinnedNow ? "Project unpinned." : "Project pinned.", "info");
}

// ===== Document requirements (form-local state helpers) =====

export function buildDocReqState(data, projectId) {
  var requirements = projectId
    ? data.project_document_requirements.filter(function (r) {
        return r.project_id === projectId;
      })
    : [];
  var state = { selectedTypeIds: [], dueDates: {}, vendorIds: {}, activityIds: {}, leadTimes: {}, templateKey: "" };
  requirements.forEach(function (r) {
    state.selectedTypeIds.push(r.document_type_id);
    if (r.planned_submission_date) state.dueDates[r.document_type_id] = r.planned_submission_date;
    if (r.vendor_id) state.vendorIds[r.document_type_id] = r.vendor_id;
    if (r.activity_id) state.activityIds[r.document_type_id] = r.activity_id;
    if (r.lead_time_days) state.leadTimes[r.document_type_id] = r.lead_time_days;
  });
  return state;
}

export function activeDocumentTypes() {
  return window.PCC.documentTypes ? window.PCC.documentTypes.activeTypes() : [];
}
export function projectTemplates() {
  return window.PCC.store.PROJECT_TEMPLATES;
}

// ===== Linked-record helpers used by the Details panel =====

export function latestDocsForProject(data, projectId) {
  var projectDocs = data.documents.filter(function (d) {
    return d.project_id === projectId && !d.trashed_at;
  });
  return window.PCC.files && window.PCC.files.latestOnly ? window.PCC.files.latestOnly(projectDocs) : projectDocs;
}
export function openDocument(doc) {
  window.PCC.files.open(doc);
}
export function categoryLabel(category) {
  return window.PCC.files ? window.PCC.files.categoryLabel(category) : category;
}
export function exportArchive(project, documents) {
  window.PCC.archive.exportProject(project, documents);
}

export function linkVendor(projectId, vendorId) {
  window.PCC.store.update(function (d) {
    d.vendor_project_links.push(window.PCC.store.newVendorProjectLink({ vendor_id: vendorId, project_id: projectId }));
  });
}
export function unlinkVendor(linkId) {
  window.PCC.store.update(function (d) {
    d.vendor_project_links = d.vendor_project_links.filter(function (x) { return x.id !== linkId; });
  });
}
export function openVendorProfile(vendorId) {
  if (window.PCC.vendors) window.PCC.vendors.openProfile(vendorId);
  window.PCC.router.go("vendors");
}

export function projectCostSummary(data, projectId) {
  return window.PCC.cost ? window.PCC.cost.projectCostSummary(data, projectId) : { budgeted: 0, actual: 0, variance: 0, usingPortfolioBudget: false };
}

export function portfolioOverAllocationSummary(data) {
  return window.PCC.resourceLevelingEngine.portfolioOverAllocationSummary(
    data.resources,
    data.resource_assignments,
    data.activities,
    data.resource_unavailability
  );
}

// ===== Cross-page navigation =====

export function viewWorkspace(projectId) {
  if (window.PCC.projectWorkspace) window.PCC.projectWorkspace.viewProject(projectId);
  window.PCC.router.go("projectWorkspace");
}
export function viewExecutiveCenter(projectId) {
  if (window.PCC.executiveCenter) window.PCC.executiveCenter.viewProject(projectId);
  window.PCC.router.go("executiveCenter");
}
export function viewDailyLogs(projectId) {
  if (window.PCC.dailyLog) window.PCC.dailyLog.filterByProject(projectId);
  window.PCC.router.go("dailylog");
}
export function viewRisks(projectId) {
  if (window.PCC.risks) window.PCC.risks.filterByProject(projectId);
  window.PCC.router.go("risks");
}
export function viewMeetings(projectId) {
  if (window.PCC.meetings) window.PCC.meetings.filterByProject(projectId);
  window.PCC.router.go("meetings");
}
export function viewRfis(projectId) {
  if (window.PCC.rfis) window.PCC.rfis.filterByProject(projectId);
  window.PCC.router.go("rfis");
}
export function viewChangeOrders(projectId) {
  if (window.PCC.changeOrders) window.PCC.changeOrders.filterByProject(projectId);
  window.PCC.router.go("changeOrders");
}
export function viewVendors(projectId) {
  if (window.PCC.vendors) window.PCC.vendors.filterByProject(projectId);
  window.PCC.router.go("vendors");
}
export function viewCost(projectId) {
  if (window.PCC.cost) window.PCC.cost.filterByProject(projectId);
  window.PCC.router.go("cost");
}
export function viewResources(projectId) {
  if (window.PCC.resources) window.PCC.resources.filterByProject(projectId);
  window.PCC.router.go("resources");
}
export function viewCommitments(projectId) {
  if (window.PCC.commitments) window.PCC.commitments.filterByProject(projectId);
  window.PCC.router.go("commitments");
}
