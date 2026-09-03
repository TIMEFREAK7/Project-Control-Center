/* Risk Register — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration). All rendering logic now lives in react/src/pages/Risks.jsx (compiled into
 * js/vendor/react-bundle.js by build.js); this file's remaining jobs are (1) registering
 * the route with the existing vanilla router, then handing off to reactBridge.js, and
 * (2) keeping the public API other (still-vanilla) page modules depend on —
 * filterByProject()/createFromMeeting()/expandRisk() — via the same one-shot pending-prop
 * channel Lessons Learned's stub established (consumed inside the component's initial
 * useState lazy initializer, never a useEffect — see CLAUDE.md's React migration notes
 * on why).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingFilterByProject = false;
  var pendingProjectFilter = null;
  var pendingPrefill = null;
  var pendingExpandedId = null;

  function render(outlet) {
    var props = {
      initialFilterByProject: pendingFilterByProject,
      initialProjectFilter: pendingProjectFilter,
      initialPrefill: pendingPrefill,
      initialExpandedId: pendingExpandedId,
    };
    pendingFilterByProject = false;
    pendingProjectFilter = null;
    pendingPrefill = null;
    pendingExpandedId = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.risks, props, outlet);
  }

  window.PCC.pages.risks = render;

  window.PCC.risks = {
    filterByProject: function (projectId) {
      pendingFilterByProject = true;
      pendingProjectFilter = projectId;
    },
    createFromMeeting: function (projectId, meetingId) {
      pendingPrefill = { project_id: projectId, source_meeting_id: meetingId };
    },
    expandRisk: function (riskId) {
      pendingExpandedId = riskId;
    },
  };
})();
