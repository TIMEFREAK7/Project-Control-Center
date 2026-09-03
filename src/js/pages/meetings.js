/* Meetings — migrated to React (Post-Phase-5 Engineering Evolution). All rendering
 * logic now lives in react/src/pages/Meetings.jsx (compiled into
 * js/vendor/react-bundle.js by build.js); this file's remaining jobs are (1)
 * registering the route with the existing vanilla router, then handing off to
 * reactBridge.js, and (2) keeping the public API other (still-vanilla) page modules
 * depend on — filterByProject()/expandMeeting() — via the same one-shot pending-prop
 * channel established for other migrated pages with a cross-page handoff (consumed
 * inside the component's initial useState lazy initializer, never a useEffect — see
 * CLAUDE.md's React migration notes on why).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingProjectFilter = null;
  var pendingExpandedId = null;

  function render(outlet) {
    var props = {
      initialProjectFilter: pendingProjectFilter,
      initialExpandedId: pendingExpandedId,
    };
    pendingProjectFilter = null;
    pendingExpandedId = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.meetings, props, outlet);
  }

  window.PCC.pages.meetings = render;

  window.PCC.meetings = {
    filterByProject: function (projectId) {
      pendingProjectFilter = projectId;
      window.PCC.projectContext.set(projectId);
    },
    expandMeeting: function (meetingId) {
      pendingExpandedId = meetingId;
    },
  };
})();
