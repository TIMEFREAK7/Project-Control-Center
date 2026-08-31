/* Service boundary for the Project Lookahead page (master prompt §9: "React must not own
 * core calculations... React should request calculations from domain/service modules").
 *
 * Project Lookahead never had a separate domain-engine file the way Storage Management had
 * storageAnalyticsEngine.js — its "engine" was always the collectItems()/computeRequirement-
 * Status()/pickPrimarySchedule()/activeDelayCountsByActivity() functions living directly
 * inside the old vanilla page module, operating purely on the store's `data` object with no
 * DOM involved. Moved here VERBATIM, unchanged, so the React component only calls this
 * module and renders the result — exactly the same React -> Service -> (data) chain the
 * Storage Management pilot established, just with the pure computation living in the
 * service itself instead of a further engine file, since that's where it already lived.
 *
 * The one other thing kept out of the component: the navigation side effects each item's
 * "click a row" action performs (window.PCC.schedule.viewActivity, window.PCC.router.go,
 * window.PCC.meetings.expandMeeting, window.PCC.rfis.expandRfi,
 * window.PCC.portfolio.viewProject) — wrapped here per item kind, same calls the vanilla
 * page made, so the component never reaches into window.PCC.* itself.
 */

export var WINDOW_OPTIONS = [7, 14, 30, 60];
export var DEFAULT_WINDOW_DAYS = 7;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(isoDateStr, days) {
  var d = new Date(isoDateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Same Available/Overdue/Required computation as portfolio.js/vendors.js/schedule.js/
// dashboard.js/documentControlDashboard.js/executiveCenter.js/actionCentre.js's own
// copies — duplicated here per this app's per-module-helpers convention (unchanged from
// the vanilla page).
function computeRequirementStatus(data, projectId, documentTypeId, plannedDate) {
  var available = data.documents.some(function (d) {
    return d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at;
  });
  if (available) return "available";
  if (plannedDate && plannedDate < todayIso()) return "overdue";
  return "required";
}

// Same primary-schedule selection as executiveCenter.js's own pickPrimarySchedule() —
// prefer an active schedule, highest revision number, most recently updated as the
// tiebreak. Unchanged from the vanilla page.
function pickPrimarySchedule(schedules) {
  if (schedules.length === 0) return null;
  var active = schedules.filter(function (s) {
    return s.status === "active";
  });
  var pool = active.length ? active : schedules;
  return pool.slice().sort(function (a, b) {
    if (a.revision_number !== b.revision_number) return b.revision_number - a.revision_number;
    return new Date(b.updated_at) - new Date(a.updated_at);
  })[0];
}

// Planning & Scheduling-Centric Delay Management, Gate G: activityId -> count of Delay
// Records still being tracked (status not recovered/closed) linked via
// delay_activity_links. Unchanged from the vanilla page.
function activeDelayCountsByActivity(data) {
  var delayRecordsById = {};
  data.delay_records.forEach(function (r) {
    if (r.status === "recovered" || r.status === "closed") return;
    delayRecordsById[r.id] = r;
  });
  var counts = {};
  data.delay_activity_links.forEach(function (link) {
    if (!delayRecordsById[link.delay_id]) return;
    counts[link.activity_id] = (counts[link.activity_id] || 0) + 1;
  });
  return counts;
}

/** Reads the current store snapshot plus the active (non-archived) project list/lookup —
 * synchronous, since store.get() is synchronous/pure, same as storageService's
 * getStorageSnapshot(). */
export function getSnapshot() {
  var data = window.PCC.store.get();
  var allActiveProjects = data.projects.filter(function (p) {
    return !p.archived;
  });
  var projectsById = {};
  allActiveProjects.forEach(function (p) {
    projectsById[p.id] = p;
  });
  return { data: data, allActiveProjects: allActiveProjects, projectsById: projectsById };
}

/** Global Project Context (Redesign Gate 6) read/write — thin wrapper around
 * window.PCC.projectContext, same as every other page's own local filter select syncs
 * with it. */
export function getProjectContext() {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId) {
  window.PCC.projectContext.set(projectId);
}

// Navigation side effects, one per item kind — exactly the window.PCC.* calls the vanilla
// page made from each item's own `view` closure.
function navigateToActivity(projectId, scheduleId, activityId) {
  window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}
function navigateToMeeting(meetingId) {
  window.PCC.meetings.expandMeeting(meetingId);
  window.PCC.router.go("meetings");
}
function navigateToRfi(rfiId) {
  window.PCC.rfis.expandRfi(rfiId);
  window.PCC.router.go("rfis");
}
function navigateToProjectDetail(projectId) {
  window.PCC.portfolio.viewProject(projectId);
  window.PCC.router.go("portfolio");
}

/** Builds the flat, forward-only, chronologically-sortable list of upcoming items across
 * Schedule activities/milestones, Meetings + Meeting Actions, RFI/TQ, and Document
 * Requirements — verbatim port of the vanilla page's collectItems(), unchanged apart from
 * each item's `view` closure now calling the navigateTo* wrappers above instead of
 * window.PCC.* directly. Pure given (data, activeProjectIds, windowDays); the caller is
 * responsible for sorting the result (the vanilla page sorted in render(), not here, and
 * the component keeps that same split). */
export function collectItems(data, activeProjectIds, windowDays) {
  var today = todayIso();
  var windowEnd = addDaysIso(today, windowDays);
  var items = [];
  var delayCounts = activeDelayCountsByActivity(data);

  var schedulesByProject = {};
  data.schedules.forEach(function (s) {
    if (!activeProjectIds[s.project_id]) return;
    (schedulesByProject[s.project_id] = schedulesByProject[s.project_id] || []).push(s);
  });
  Object.keys(schedulesByProject).forEach(function (projectId) {
    var schedule = pickPrimarySchedule(schedulesByProject[projectId]);
    if (!schedule) return;
    var thresholdDays = schedule.near_critical_threshold_days || 5;
    data.activities.forEach(function (a) {
      if (a.schedule_id !== schedule.id) return;
      if (a.activity_type !== "task" && a.activity_type !== "milestone") return;
      if (a.status === "complete") return;
      var date = a.early_start || a.planned_start;
      if (!date || date < today || date > windowEnd) return;
      var floatVal = a.total_float;
      var critical = floatVal != null && floatVal <= 0;
      var nearCritical = floatVal != null && floatVal > 0 && floatVal <= thresholdDays;
      var openDelayCount = delayCounts[a.id] || 0;
      items.push({
        kind: a.activity_type === "milestone" ? "Milestone" : "Activity",
        title: a.name || "(unnamed activity)",
        projectId: projectId,
        owner: a.responsible_person || a.contractor || "—",
        date: date,
        badgeClass: critical ? "critical" : nearCritical ? "at_risk" : "on_track",
        openDelayCount: openDelayCount,
        view: (function (pId, schedId, actId) {
          return function () {
            navigateToActivity(pId, schedId, actId);
          };
        })(projectId, schedule.id, a.id),
      });
    });
  });

  data.meetings.forEach(function (m) {
    if (!activeProjectIds[m.project_id]) return;
    if (m.meeting_date && m.meeting_date >= today && m.meeting_date <= windowEnd) {
      items.push({
        kind: "Meeting",
        title: m.title || "(untitled meeting)",
        projectId: m.project_id,
        owner: "—",
        date: m.meeting_date,
        badgeClass: "info",
        view: (function (id) {
          return function () {
            navigateToMeeting(id);
          };
        })(m.id),
      });
    }
    (m.actions || []).forEach(function (a) {
      if (a.status !== "open") return;
      if (!a.due_date || a.due_date < today || a.due_date > windowEnd) return;
      items.push({
        kind: "Meeting Action",
        title: a.description || "(no description)",
        projectId: m.project_id,
        owner: a.owner || "—",
        date: a.due_date,
        badgeClass: "info",
        view: (function (id) {
          return function () {
            navigateToMeeting(id);
          };
        })(m.id),
      });
    });
  });

  data.rfis.forEach(function (r) {
    if (!activeProjectIds[r.project_id]) return;
    if (r.status !== "open") return;
    if (!r.date_required || r.date_required < today || r.date_required > windowEnd) return;
    items.push({
      kind: r.type === "technical_query" ? "TQ" : "RFI",
      title: (r.number || "") + (r.subject ? " — " + r.subject : ""),
      projectId: r.project_id,
      owner: r.assigned_to || "—",
      date: r.date_required,
      badgeClass: "info",
      view: (function (id) {
        return function () {
          navigateToRfi(id);
        };
      })(r.id),
    });
  });

  var typesById = {};
  data.document_types.forEach(function (t) {
    typesById[t.id] = t;
  });
  var vendorsById = {};
  data.vendors.forEach(function (v) {
    vendorsById[v.id] = v;
  });
  data.project_document_requirements.forEach(function (req) {
    if (!activeProjectIds[req.project_id]) return;
    var type = typesById[req.document_type_id];
    if (!type) return;
    var status = computeRequirementStatus(data, req.project_id, req.document_type_id, req.planned_submission_date);
    if (status !== "required") return;
    if (!req.planned_submission_date || req.planned_submission_date < today || req.planned_submission_date > windowEnd) return;
    var vendor = req.vendor_id ? vendorsById[req.vendor_id] : null;
    items.push({
      kind: "Document",
      title: type.name + (type.code ? " (" + type.code + ")" : ""),
      projectId: req.project_id,
      owner: vendor ? vendor.vendor_name || "(unnamed vendor)" : "—",
      date: req.planned_submission_date,
      badgeClass: "at_risk",
      view: (function (pId) {
        return function () {
          navigateToProjectDetail(pId);
        };
      })(req.project_id),
    });
  });

  return items;
}
