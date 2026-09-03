/* Reports — migrated to React (Post-Phase-5 Engineering Evolution, React migration).
 * All rendering logic now lives in react/src/pages/Reports.jsx (compiled into
 * js/vendor/react-bundle.js by build.js); this file's only remaining job is registering
 * the route with the existing vanilla router and handing off to reactBridge.js. There is
 * no public API to preserve — the vanilla page never exposed one.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  function render(outlet) {
    window.PCC.reactBridge.mount(window.PCC.reactPages.reports, {}, outlet);
  }

  window.PCC.pages.reports = render;
})();
