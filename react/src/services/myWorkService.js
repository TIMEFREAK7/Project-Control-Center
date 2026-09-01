/* Service boundary for the My Work page (master prompt §9: "React must not own core
 * calculations... React should request calculations from domain/service modules").
 *
 * Gate 17 (PCC Evolution Roadmap, Tier E: Personal Workbench) — never had a separate
 * domain-engine file; the vanilla page module *was* the aggregation logic. Moved here
 * verbatim, unchanged — this component only renders the result and wires up the project
 * filter/navigation, exactly the React -> Service -> (data) chain every other migrated
 * page uses. Purely computed at render time — writes nothing back to the store.
 */

export var WEEK_WINDOW_DAYS = 7;
export var RECENT_LIMIT = 5;

export var WAITING_ON_LABELS = { vendor: "Vendor", client: "Client", consultant: "Consultant", management: "Management" };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(isoDateStr, days) {
  var d = new Date(isoDateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString() : "";
}

function navigateToMeeting(id) {
  return function () {
    window.PCC.meetings.expandMeeting(id);
    window.PCC.router.go("meetings");
  };
}
function navigateToRfi(id) {
  return function () {
    window.PCC.rfis.expandRfi(id);
    window.PCC.router.go("rfis");
  };
}
function navigateToChangeOrder(id) {
  return function () {
    window.PCC.changeOrders.expandChangeOrder(id);
    window.PCC.router.go("changeOrders");
  };
}
function navigateToDecision(id) {
  return function () {
    window.PCC.decisionRegister.expandDecision(id);
    window.PCC.router.go("decisionRegister");
  };
}
function navigateToActivity(projectId, scheduleId, activityId) {
  return function () {
    window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
    window.PCC.router.go("schedule");
  };
}
function navigateToVendor(id) {
  return function () {
    window.PCC.vendors.openProfile(id);
    window.PCC.router.go("vendors");
  };
}
function navigateToReview(projectId) {
  return function () {
    window.PCC.executiveCenter.viewProject(projectId, "weeklyReviews");
    window.PCC.router.go("executiveCenter");
  };
}
function navigateToProjectExecutiveCenter(projectId) {
  return function () {
    window.PCC.executiveCenter.viewProject(projectId);
    window.PCC.router.go("executiveCenter");
  };
}
function navigateToRisk(id) {
  return function () {
    window.PCC.risks.expandRisk(id);
    window.PCC.router.go("risks");
  };
}

export function getProjectContext() {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId) {
  window.PCC.projectContext.set(projectId);
}

// ---- TODAY ----------------------------------------------------------------------

/** Same definition Action Centre's own OVERDUE bucket uses (Meeting Actions + RFI/TQ past
 * due) — duplicated here per this app's per-module-helpers convention. */
export function collectOverdueActions(data, activeProjectIds) {
  var today = todayIso();
  var items = [];
  data.meetings.forEach(function (m) {
    if (!activeProjectIds[m.project_id]) return;
    (m.actions || []).forEach(function (a) {
      if (a.status !== "open" || !a.due_date || a.due_date >= today) return;
      items.push({ kind: "Meeting Action", title: a.description || "(no description)", projectId: m.project_id, extra: "due " + a.due_date, view: navigateToMeeting(m.id) });
    });
  });
  data.rfis.forEach(function (r) {
    if (!activeProjectIds[r.project_id]) return;
    if (r.status !== "open" || !r.date_required || r.date_required >= today) return;
    items.push({ kind: r.type === "technical_query" ? "TQ" : "RFI", title: (r.number || "") + (r.subject ? " — " + r.subject : ""), projectId: r.project_id, extra: "due " + r.date_required, view: navigateToRfi(r.id) });
  });
  items.sort(function (a, b) {
    return a.extra.localeCompare(b.extra);
  });
  return items;
}

export function collectTodaysMeetings(data, activeProjectIds) {
  var today = todayIso();
  return data.meetings
    .filter(function (m) {
      return activeProjectIds[m.project_id] && m.meeting_date === today;
    })
    .map(function (m) {
      return { kind: "Meeting", title: m.title || "(untitled meeting)", projectId: m.project_id, extra: "", view: navigateToMeeting(m.id) };
    });
}

export function collectApprovals(data, activeProjectIds) {
  var items = [];
  data.change_orders.forEach(function (co) {
    if (!activeProjectIds[co.project_id]) return;
    if (co.status !== "pending") return;
    items.push({ kind: "Change Order", title: (co.number || "") + (co.title ? " — " + co.title : ""), projectId: co.project_id, extra: co.requested_by ? "requested by " + co.requested_by : "", view: navigateToChangeOrder(co.id) });
  });
  data.decisions.forEach(function (d) {
    if (!activeProjectIds[d.project_id]) return;
    if (d.status !== "pending") return;
    items.push({ kind: "Decision", title: d.title || "(untitled decision)", projectId: d.project_id, extra: "", view: navigateToDecision(d.id) });
  });
  return items;
}

/** Genuinely new rule — an activity is "behind its own plan and likely needs a
 * status/actuals update" when it's still not_started after its planned_start has passed,
 * or still in_progress after its planned_finish has passed. Uses raw planned dates
 * directly, not the CPM engine's computed dates. */
export function collectActivitiesToUpdate(data, activeProjectIds) {
  var today = todayIso();
  var items = [];
  data.activities.forEach(function (a) {
    if (!activeProjectIds[a.project_id]) return;
    if (a.activity_type !== "task" && a.activity_type !== "milestone") return;
    var stale = (a.status === "not_started" && a.planned_start && a.planned_start < today) || (a.status === "in_progress" && a.planned_finish && a.planned_finish < today);
    if (!stale) return;
    items.push({
      kind: a.activity_type === "milestone" ? "Milestone" : "Activity",
      title: a.name || "(unnamed activity)",
      projectId: a.project_id,
      extra: a.status === "not_started" ? "should have started " + a.planned_start : "should have finished " + a.planned_finish,
      view: navigateToActivity(a.project_id, a.schedule_id, a.id),
    });
  });
  return items;
}

// ---- THIS WEEK --------------------------------------------------------------------

/** Deliberately excludes today — the window is tomorrow through +7 days. */
export function collectWeekMeetings(data, activeProjectIds) {
  var today = todayIso();
  var end = addDaysIso(today, WEEK_WINDOW_DAYS);
  var items = data.meetings
    .filter(function (m) {
      return activeProjectIds[m.project_id] && m.meeting_date > today && m.meeting_date <= end;
    })
    .map(function (m) {
      return { kind: "Meeting", title: m.title || "(untitled meeting)", projectId: m.project_id, extra: m.meeting_date, view: navigateToMeeting(m.id) };
    });
  items.sort(function (a, b) {
    return a.extra.localeCompare(b.extra);
  });
  return items;
}

/** Same activity_type==="milestone"/early_start-precedence/exclude-complete convention
 * Project Lookahead's own milestone rows already use. Window is today through +7 days. */
export function collectWeekMilestones(data, activeProjectIds) {
  var today = todayIso();
  var end = addDaysIso(today, WEEK_WINDOW_DAYS);
  var items = [];
  data.activities.forEach(function (a) {
    if (!activeProjectIds[a.project_id]) return;
    if (a.activity_type !== "milestone") return;
    if (a.status === "complete") return;
    var date = a.early_start || a.planned_start;
    if (!date || date < today || date > end) return;
    items.push({ kind: "Milestone", title: a.name || "(unnamed milestone)", projectId: a.project_id, extra: date, view: navigateToActivity(a.project_id, a.schedule_id, a.id) });
  });
  items.sort(function (a, b) {
    return a.extra.localeCompare(b.extra);
  });
  return items;
}

/** A single soonest-first list, overdue and due-this-week together. */
export function collectVendorFollowups(data) {
  var today = todayIso();
  var end = addDaysIso(today, WEEK_WINDOW_DAYS);
  var items = [];
  data.vendors.forEach(function (v) {
    if (!v.next_follow_up_date || v.next_follow_up_date > end) return;
    items.push({ kind: v.next_follow_up_date < today ? "Overdue" : "Vendor", title: v.vendor_name || "(unnamed vendor)", projectId: null, extra: "follow up by " + v.next_follow_up_date, view: navigateToVendor(v.id) });
  });
  items.sort(function (a, b) {
    return a.extra.localeCompare(b.extra);
  });
  return items;
}

/** Cadence-based, per project.review_cadence_days (null = not configured, excluded
 * entirely rather than guessed). Next due = last review's review_date + cadence, or the
 * project's own start_date/created_at if it's never been reviewed yet. */
function computeNextReviewDue(project, weeklyReviews) {
  if (project.review_cadence_days == null) return null;
  var lastDate = null;
  weeklyReviews.forEach(function (r) {
    if (r.project_id !== project.id) return;
    if (!lastDate || r.review_date > lastDate) lastDate = r.review_date;
  });
  var base = lastDate || (project.start_date || (project.created_at || "").slice(0, 10));
  if (!base) return null;
  return addDaysIso(base, project.review_cadence_days);
}

export function collectReviewsDue(data, activeProjects) {
  var today = todayIso();
  var end = addDaysIso(today, WEEK_WINDOW_DAYS);
  var items = [];
  activeProjects.forEach(function (p) {
    var due = computeNextReviewDue(p, data.weekly_reviews);
    if (!due || due > end) return;
    items.push({ kind: due < today ? "Overdue" : "Review", title: p.name || "(unnamed project)", projectId: p.id, extra: "due " + due, view: navigateToReview(p.id) });
  });
  items.sort(function (a, b) {
    return a.extra.localeCompare(b.extra);
  });
  return items;
}

// ---- WAITING FOR --------------------------------------------------------------------

export function collectWaitingFor(data, activeProjectIds) {
  var byParty = { vendor: [], client: [], consultant: [], management: [] };
  function push(party, item) {
    if (byParty[party]) byParty[party].push(item);
  }

  data.rfis.forEach(function (r) {
    if (!activeProjectIds[r.project_id] || r.status !== "open" || !r.waiting_on_party) return;
    push(r.waiting_on_party, { kind: r.type === "technical_query" ? "TQ" : "RFI", title: (r.number || "") + (r.subject ? " — " + r.subject : ""), projectId: r.project_id, extra: "", view: navigateToRfi(r.id) });
  });
  data.change_orders.forEach(function (co) {
    if (!activeProjectIds[co.project_id] || co.status !== "pending" || !co.waiting_on_party) return;
    push(co.waiting_on_party, { kind: "Change Order", title: (co.number || "") + (co.title ? " — " + co.title : ""), projectId: co.project_id, extra: "", view: navigateToChangeOrder(co.id) });
  });
  data.decisions.forEach(function (d) {
    if (!activeProjectIds[d.project_id] || d.status !== "pending" || !d.waiting_on_party) return;
    push(d.waiting_on_party, { kind: "Decision", title: d.title || "(untitled decision)", projectId: d.project_id, extra: "", view: navigateToDecision(d.id) });
  });
  return byParty;
}

// ---- RECENTLY UPDATED ---------------------------------------------------------------

function topRecentlyUpdated(records) {
  return records
    .slice()
    .sort(function (a, b) {
      return new Date(b.updated_at) - new Date(a.updated_at);
    })
    .slice(0, RECENT_LIMIT);
}

export function collectRecentlyUpdated(data, activeProjectIds, activeProjects) {
  return {
    projects: topRecentlyUpdated(activeProjects).map(function (p) {
      return { kind: "Project", title: p.name || "(unnamed project)", projectId: p.id, extra: "updated " + fmtDate(p.updated_at), view: navigateToProjectExecutiveCenter(p.id) };
    }),
    activities: topRecentlyUpdated(
      data.activities.filter(function (a) {
        return activeProjectIds[a.project_id];
      })
    ).map(function (a) {
      return { kind: "Activity", title: a.name || "(unnamed activity)", projectId: a.project_id, extra: "updated " + fmtDate(a.updated_at), view: navigateToActivity(a.project_id, a.schedule_id, a.id) };
    }),
    rfis: topRecentlyUpdated(
      data.rfis.filter(function (r) {
        return activeProjectIds[r.project_id];
      })
    ).map(function (r) {
      return { kind: r.type === "technical_query" ? "TQ" : "RFI", title: (r.number || "") + (r.subject ? " — " + r.subject : ""), projectId: r.project_id, extra: "updated " + fmtDate(r.updated_at), view: navigateToRfi(r.id) };
    }),
    risks: topRecentlyUpdated(
      data.risks.filter(function (r) {
        return activeProjectIds[r.project_id];
      })
    ).map(function (r) {
      return { kind: r.type === "issue" ? "Issue" : r.type === "opportunity" ? "Opportunity" : "Risk", title: r.title || "(untitled)", projectId: r.project_id, extra: "updated " + fmtDate(r.updated_at), view: navigateToRisk(r.id) };
    }),
    meetings: topRecentlyUpdated(
      data.meetings.filter(function (m) {
        return activeProjectIds[m.project_id];
      })
    ).map(function (m) {
      return { kind: "Meeting", title: m.title || "(untitled meeting)", projectId: m.project_id, extra: "updated " + fmtDate(m.updated_at), view: navigateToMeeting(m.id) };
    }),
  };
}
