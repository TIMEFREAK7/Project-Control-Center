/* Dashboard (Portfolio Overview) — migrated to React (Post-Phase-5 Engineering
 * Evolution, React migration). All rendering logic now lives in
 * react/src/pages/Dashboard.jsx (compiled into js/vendor/react-bundle.js by build.js);
 * this file's only remaining job is registering the route with the existing vanilla
 * router and handing off to reactBridge.js. There is no separate public API to
 * preserve, same as Organizations/DelayRecoveryDashboard.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  function render(outlet) {
    window.PCC.reactBridge.mount(window.PCC.reactPages.dashboard, {}, outlet);
  }

  window.PCC.pages.dashboard = render;
})();
