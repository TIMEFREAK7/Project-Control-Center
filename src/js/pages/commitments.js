/* Commitment Management — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration). All rendering logic now lives in react/src/pages/Commitments.jsx
 * (compiled into js/vendor/react-bundle.js by build.js); this file's remaining jobs are
 * (1) registering the route with the existing vanilla router, then handing off to
 * reactBridge.js, and (2) keeping the public API other (still-vanilla) page modules
 * depend on — filterByProject()/expandCommitment() — via the same one-shot pending-prop
 * channel established for other migrated pages with a cross-page handoff (consumed
 * inside the component's initial useState lazy initializer, never a useEffect — see
 * CLAUDE.md's React migration notes on why).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingTab = null;
  var pendingProjectFilter = null;
  var pendingEditingCommitmentId = null;

  function render(outlet) {
    var props = {
      initialTab: pendingTab,
      initialProjectFilter: pendingProjectFilter,
      initialEditingCommitmentId: pendingEditingCommitmentId,
    };
    pendingTab = null;
    pendingProjectFilter = null;
    pendingEditingCommitmentId = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.commitments, props, outlet);
  }

  window.PCC.pages.commitments = render;

  window.PCC.commitments = {
    filterByProject: function (projectId) {
      pendingTab = "commitments";
      pendingProjectFilter = projectId;
      window.PCC.projectContext.set(projectId);
    },
    expandCommitment: function (commitmentId) {
      pendingTab = "commitments";
      pendingEditingCommitmentId = commitmentId;
    },
  };
})();
