/* Change Management — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration). All rendering logic now lives in react/src/pages/ChangeOrders.jsx
 * (compiled into js/vendor/react-bundle.js by build.js); this file's remaining jobs are
 * (1) registering the route with the existing vanilla router, then handing off to
 * reactBridge.js, and (2) keeping the public API other (still-vanilla) page modules
 * depend on — filterByProject()/createFromMeeting()/createFromRfi()/createFromRisk()/
 * expandChangeOrder() — via the same one-shot pending-prop channel established for other
 * migrated pages with a cross-page handoff (consumed inside the component's initial
 * useState lazy initializer, never a useEffect — see CLAUDE.md's React migration notes
 * on why).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingProjectFilter = null;
  var pendingPrefill = null;
  var pendingExpandedId = null;

  function render(outlet) {
    var props = {
      initialProjectFilter: pendingProjectFilter,
      initialPrefill: pendingPrefill,
      initialExpandedId: pendingExpandedId,
    };
    pendingProjectFilter = null;
    pendingPrefill = null;
    pendingExpandedId = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.changeOrders, props, outlet);
  }

  window.PCC.pages.changeOrders = render;

  window.PCC.changeOrders = {
    filterByProject: function (projectId) {
      pendingProjectFilter = projectId;
      window.PCC.projectContext.set(projectId);
    },
    createFromMeeting: function (projectId, meetingId) {
      pendingPrefill = { project_id: projectId, source_meeting_id: meetingId };
    },
    createFromRfi: function (projectId, rfiId) {
      pendingPrefill = { project_id: projectId, source_rfi_id: rfiId };
    },
    createFromRisk: function (projectId, riskId) {
      pendingPrefill = { project_id: projectId, source_risk_id: riskId };
    },
    expandChangeOrder: function (id) {
      pendingExpandedId = id;
    },
  };
})();
