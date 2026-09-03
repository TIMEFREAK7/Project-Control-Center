/* Project Workspace — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration). All rendering logic now lives in react/src/pages/ProjectWorkspace.jsx
 * (compiled into js/vendor/react-bundle.js by build.js); this file's remaining jobs are
 * (1) registering the route with the existing vanilla router, then handing off to
 * reactBridge.js, and (2) keeping the public API other (still-vanilla) page modules
 * depend on — viewProject() — via the same one-shot pending-prop channel established for
 * other migrated pages with a cross-page handoff (consumed inside the component's
 * initial useState lazy initializer, never a useEffect — see CLAUDE.md's React migration
 * notes on why).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingProjectId = null;

  function render(outlet) {
    var props = { initialProjectId: pendingProjectId };
    pendingProjectId = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.projectWorkspace, props, outlet);
  }

  window.PCC.pages.projectWorkspace = render;

  window.PCC.projectWorkspace = {
    viewProject: function (projectId) {
      pendingProjectId = projectId;
      window.PCC.projectContext.set(projectId);
    },
  };
})();
