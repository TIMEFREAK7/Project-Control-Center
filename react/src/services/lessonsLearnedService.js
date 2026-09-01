/* Service boundary for the Lessons Learned page (master prompt §9: "React must not own
 * core calculations... React should request calculations from domain/service modules").
 *
 * Thin wrapper — every store read/write goes straight through window.PCC.store, unchanged
 * from the vanilla page. FIELD_CONFIG/CATEGORY_LABELS/IMPACT_LABELS are plain data (not
 * calculations) kept here as the single source of truth the React form renders from,
 * matching the vanilla page's own FIELD_CONFIG-driven rendering. getData() returns a
 * FRESH top-level object reference (Object.assign({}, store.get())) — window.PCC.store.get()
 * returns the SAME mutable object every call, so a useState-then-refresh pattern needs
 * this or React silently skips the re-render (see CLAUDE.md's React migration notes).
 */

export var CATEGORY_LABELS = {
  schedule: "Schedule",
  cost: "Cost",
  quality: "Quality",
  safety: "Safety",
  procurement_vendor: "Procurement & Vendor",
  design_technical: "Design & Technical",
  communication: "Communication",
  other: "Other",
};
export var IMPACT_LABELS = { positive: "Positive", negative: "Negative" };

export var FIELD_CONFIG = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "category", label: "Category", type: "select", options: "LESSON_LEARNED_CATEGORIES", labels: CATEGORY_LABELS },
  { key: "impact_type", label: "Impact", type: "select", options: "LESSON_LEARNED_IMPACT_TYPES", labels: IMPACT_LABELS },
  { key: "date_identified", label: "Date Identified", type: "date" },
  { key: "identified_by", label: "Identified By", type: "text" },
  { key: "description", label: "What Happened", type: "textarea" },
  { key: "recommendation", label: "Recommendation", type: "textarea" },
];

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function optionsFor(key) {
  return window.PCC.store[key];
}

export function projectName(projects, projectId) {
  if (!projectId) return "Unassigned";
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "Unassigned";
}

/** Gate 10 pattern, duplicated from decisionRegister.js/risks.js/rfis.js per this
 * codebase's existing per-module-helpers convention. Returns [{id, label}], "(none)" first. */
export function activityOptionsFor(data, projectId) {
  var scheduleNameById = {};
  data.schedules
    .filter(function (s) {
      return s.project_id === projectId;
    })
    .forEach(function (s) {
      scheduleNameById[s.id] = s.name;
    });
  var opts = [{ id: "", label: "(none)" }];
  data.activities
    .filter(function (a) {
      return a.project_id === projectId;
    })
    .forEach(function (a) {
      opts.push({ id: a.id, label: (scheduleNameById[a.schedule_id] || "(schedule)") + ": " + (a.name || "(unnamed activity)") });
    });
  return opts;
}

export function newLessonLearned(prefill) {
  return window.PCC.store.newLessonLearned(prefill || {});
}

export function saveLessonLearned(isNew, id, values) {
  window.PCC.store.update(function (data) {
    if (isNew) {
      data.lessons_learned.push(window.PCC.store.newLessonLearned(values));
    } else {
      var existing = data.lessons_learned.find(function (l) {
        return l.id === id;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.store.rememberLastUsedName("lesson_identified_by", values.identified_by);
}

export function deleteLessonLearned(id) {
  window.PCC.store.update(function (data) {
    data.lessons_learned = data.lessons_learned.filter(function (item) {
      return item.id !== id;
    });
  });
}

export function getLastIdentifiedBy() {
  return window.PCC.store.getLastUsedName("lesson_identified_by");
}

export function getProjectContext() {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId) {
  window.PCC.projectContext.set(projectId);
}

export function notify(message, level) {
  window.PCC.notify(message, level);
}

export function navigateToMeeting(meetingId) {
  if (window.PCC.meetings) window.PCC.meetings.expandMeeting(meetingId);
  window.PCC.router.go("meetings");
}

export function navigateToActivity(projectId, scheduleId, activityId) {
  if (window.PCC.schedule) window.PCC.schedule.viewActivity(projectId, scheduleId, activityId);
  window.PCC.router.go("schedule");
}
