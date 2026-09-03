/* Portfolio — migrated to React (Post-Phase-5 Engineering Evolution). All rendering
 * logic now lives in react/src/pages/Portfolio.jsx (compiled into
 * js/vendor/react-bundle.js by build.js); this file's remaining jobs are (1)
 * registering the route with the existing vanilla router, then handing off to
 * reactBridge.js, and (2) keeping the public API other (still-vanilla) page modules
 * depend on — viewProject()/filterByStatus() — via the same one-shot pending-prop
 * channel established for other migrated pages with a cross-page handoff (consumed
 * inside the component's initial useState lazy initializer, never a useEffect — see
 * CLAUDE.md's React migration notes on why). window.PCC.pendingProjectPrefill (a
 * genuinely global, not per-module, handoff Organizations' "+ New Project" flow already
 * used before this migration) is read directly by Portfolio.jsx itself, not routed
 * through this stub.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingExpandedId = null;
  var pendingStatusFilter = null;

  function render(outlet) {
    var props = {
      initialExpandedId: pendingExpandedId,
      initialStatusFilter: pendingStatusFilter,
    };
    pendingExpandedId = null;
    pendingStatusFilter = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.portfolio, props, outlet);
  }

  window.PCC.pages.portfolio = render;

  window.PCC.portfolio = {
    viewProject: function (projectId) {
      pendingExpandedId = projectId;
    },
    filterByStatus: function (status) {
      pendingStatusFilter = status;
      pendingExpandedId = null;
    },
  };
})();
