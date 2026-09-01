/* Companies & Clients — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration). All rendering logic now lives in react/src/pages/Organizations.jsx
 * (compiled into js/vendor/react-bundle.js by build.js); this file's only remaining job
 * is registering the route with the existing vanilla router and handing off to
 * reactBridge.js. There is no separate window.PCC.organizations public API — the vanilla
 * page never exposed one either, only the route registration below.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  function render(outlet) {
    window.PCC.reactBridge.mount(window.PCC.reactPages.organizations, {}, outlet);
  }

  window.PCC.pages.organizations = render;
})();
