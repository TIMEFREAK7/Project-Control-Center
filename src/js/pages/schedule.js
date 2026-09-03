/* Schedule module — migrated to React (Post-Phase-5 Engineering Evolution, Batch G,
 * the largest single-page migration in this effort: 7 tabs — Activities, Gantt, WBS,
 * Relationships, Calendars, Baselines, What-If — behind one route). All rendering AND
 * calculation-wrapping now lives in react/src/services/scheduleService.js +
 * react/src/pages/Schedule.jsx (compiled into js/vendor/react-bundle.js by
 * build.js) — the real domain engines (scheduleCpmEngine.js, scheduleGanttLayout.js,
 * scheduleBaselineEngine.js, scheduleImportService.js, delayImpactEngine.js) are called
 * from there directly, never reimplemented. This file's only remaining jobs are
 * (1) registering the route, then handing off to reactBridge.js, and (2) the public
 * API's one-shot pending-prop plumbing — only the stub's render() can consume a
 * pending prop before mount, so this piece alone has to live here regardless.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingProjectId = null;
  var pendingScheduleId = null;
  var pendingTab = null;
  var pendingGanttDetailActivityId = null;

  function render(outlet) {
    var props = {
      initialProjectId: pendingProjectId,
      initialScheduleId: pendingScheduleId,
      initialTab: pendingTab,
      initialGanttDetailActivityId: pendingGanttDetailActivityId,
    };
    pendingProjectId = null;
    pendingScheduleId = null;
    pendingTab = null;
    pendingGanttDetailActivityId = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.schedule, props, outlet);
  }

  window.PCC.pages.schedule = render;
  window.PCC.schedule = {
    /** The reverse-navigation half of activity linking — every other register's "View
     * in Gantt" button calls this, then routes to #/schedule. Jumps straight to the
     * Gantt tab with that activity's own Detail Panel already open, matching the same
     * "land exactly on the linked record" convention every other cross-module link in
     * this app already follows. */
    viewActivity: function (projectId, scheduleId, activityId) {
      pendingProjectId = projectId;
      pendingScheduleId = scheduleId;
      pendingTab = "gantt";
      pendingGanttDetailActivityId = activityId;
      window.PCC.projectContext.set(projectId);
    },
    // Executive Center's Status Date panel points here for Float Changes/Milestone
    // Variance rather than duplicating the Baselines tab's own async compare UI — same
    // "land exactly on the linked feature" convention as viewActivity above.
    viewBaselines: function (projectId, scheduleId) {
      pendingProjectId = projectId;
      pendingScheduleId = scheduleId;
      pendingTab = "baselines";
      window.PCC.projectContext.set(projectId);
    },
    /** Project Workspace's own hand-off convention — leaves scheduleId unset on
     * purpose: SchedulePage's own initial-state logic already falls back to
     * projectSchedules[0] whenever no explicit scheduleId is given, so a stale id from
     * whatever project was last viewed self-corrects on the very next render — no need
     * to duplicate that "pick the primary schedule" logic here. */
    viewProject: function (projectId) {
      pendingProjectId = projectId;
      pendingScheduleId = null;
      pendingTab = "gantt";
      window.PCC.projectContext.set(projectId);
    },
  };
})();
