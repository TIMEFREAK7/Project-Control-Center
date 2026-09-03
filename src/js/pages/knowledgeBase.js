/* Knowledge Base — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration). All rendering logic now lives in react/src/pages/KnowledgeBase.jsx
 * (compiled into js/vendor/react-bundle.js by build.js); this file's remaining jobs are
 * (1) registering the route with the existing vanilla router, then handing off to
 * reactBridge.js, and (2) keeping the public API other (still-vanilla) page modules
 * depend on — filterByProject(), which just sets the shared Global Project Context (the
 * React component already reads that on mount, so no separate pending-prop channel is
 * needed for it, unlike Lessons Learned's createFromMeeting()).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  function render(outlet) {
    window.PCC.reactBridge.mount(window.PCC.reactPages.knowledgeBase, {}, outlet);
  }

  window.PCC.pages.knowledgeBase = render;

  window.PCC.knowledgeBase = {
    filterByProject: function (projectId) {
      window.PCC.projectContext.set(projectId);
    },
  };
})();
