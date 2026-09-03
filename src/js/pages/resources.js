/* Resource Management — migrated to React (Post-Phase-5 Engineering Evolution). All
 * rendering logic now lives in react/src/pages/Resources.jsx (compiled into
 * js/vendor/react-bundle.js by build.js); this file's remaining jobs are (1)
 * registering the route with the existing vanilla router, then handing off to
 * reactBridge.js, and (2) keeping the public API other (still-vanilla) page modules
 * depend on — filterByProject()/viewResource()/expandAssignment() — via the same
 * one-shot pending-prop channel established for other migrated pages with a
 * cross-page handoff (consumed inside the component's initial useState lazy
 * initializer, never a useEffect — see CLAUDE.md's React migration notes on why).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingTab = null;
  var pendingProjectFilter = null;
  var pendingLevelingResourceId = null;

  function render(outlet) {
    var props = {
      initialTab: pendingTab,
      initialProjectFilter: pendingProjectFilter,
      initialLevelingResourceId: pendingLevelingResourceId,
    };
    pendingTab = null;
    pendingProjectFilter = null;
    pendingLevelingResourceId = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.resources, props, outlet);
  }

  window.PCC.pages.resources = render;

  window.PCC.resources = {
    filterByProject: function (projectId) {
      pendingTab = "assignments";
      pendingProjectFilter = projectId;
    },
    viewResource: function (resourceId) {
      pendingTab = "leveling";
      pendingLevelingResourceId = resourceId;
    },
    expandAssignment: function (assignmentId) {
      pendingTab = "assignments";
      var assignment = window.PCC.store.get().resource_assignments.find(function (a) {
        return a.id === assignmentId;
      });
      if (assignment) pendingLevelingResourceId = assignment.resource_id;
    },
  };
})();
