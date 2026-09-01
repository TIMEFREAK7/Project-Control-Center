/* My Work — migrated to React (Post-Phase-5 Engineering Evolution, React migration). All
 * rendering logic now lives in react/src/pages/MyWork.jsx (compiled into
 * js/vendor/react-bundle.js by build.js); this file's only remaining job is registering
 * the route with the existing vanilla router exactly as every other page does, then
 * handing off to reactBridge.js. See router.js and reactBridge.js for the mount/unmount
 * contract this relies on.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  function render(outlet) {
    window.PCC.reactBridge.mount(window.PCC.reactPages.myWork, {}, outlet);
  }

  window.PCC.pages.myWork = render;
})();
