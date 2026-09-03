/* Lessons Learned — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration). All rendering logic now lives in react/src/pages/LessonsLearned.jsx
 * (compiled into js/vendor/react-bundle.js by build.js); this file's remaining jobs are
 * (1) registering the route with the existing vanilla router, then handing off to
 * reactBridge.js, and (2) keeping the public API other (still-vanilla) page modules
 * depend on — meetings.js's createFromMeeting(), and expandLesson()/filterByProject()
 * used elsewhere.
 *
 * createFromMeeting/expandLesson hand their payload to the React component as INITIAL
 * PROPS (read once via useState's lazy initializer) rather than as React state, since
 * they're always called right before a fresh navigation to this route (reactBridge.js
 * mounts a brand new component instance on every router.render() for this route) — a
 * plain module-level variable, captured and cleared the instant render() runs, is exactly
 * equivalent to the old vanilla page's module-level uiState.pendingPrefill for this
 * purpose. filterByProject() instead just sets the shared Global Project Context — the
 * component already reads that on mount, so no separate channel is needed for it.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingPrefill = null;
  var pendingExpandedId = null;

  function render(outlet) {
    var props = { initialPrefill: pendingPrefill, initialExpandedId: pendingExpandedId };
    pendingPrefill = null;
    pendingExpandedId = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.lessonsLearned, props, outlet);
  }

  window.PCC.pages.lessonsLearned = render;

  window.PCC.lessonsLearned = {
    filterByProject: function (projectId) {
      window.PCC.projectContext.set(projectId);
    },
    createFromMeeting: function (projectId, meetingId) {
      pendingPrefill = { project_id: projectId, source_meeting_id: meetingId };
    },
    expandLesson: function (lessonId) {
      pendingExpandedId = lessonId;
    },
  };
})();
