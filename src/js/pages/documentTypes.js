/* Document Types — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration). All rendering logic now lives in react/src/pages/DocumentTypes.jsx
 * (compiled into js/vendor/react-bundle.js by build.js); this file's remaining jobs are
 * (1) registering the route with the existing vanilla router exactly as every other page
 * does, then handing off to reactBridge.js, and (2) keeping the small public API other
 * (still-vanilla) page modules already depend on — documents.js and portfolio.js both call
 * `window.PCC.documentTypes.activeTypes()` to read the active portion of the repository.
 * That API is a route-independent global side effect, not rendering logic, so it stays
 * here rather than moving into the React component. See router.js and reactBridge.js for
 * the mount/unmount contract this relies on.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  function render(outlet) {
    window.PCC.reactBridge.mount(window.PCC.reactPages.documentTypes, {}, outlet);
  }

  window.PCC.pages.documentTypes = render;

  // Public API for later gates (project-specific requirements, vendor templates, ...)
  // to read the active portion of the repository without reaching into React UI state.
  window.PCC.documentTypes = {
    activeTypes: function () {
      return window.PCC.store.get().document_types.filter(function (t) {
        return t.active;
      });
    },
  };
})();
