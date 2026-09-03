/* Project Executive Center (Gate 9) — migrated to React (Post-Phase-5 Engineering
 * Evolution, Batch F part 4, the last of the "big four"). All rendering AND the entire
 * buildProjectContext()/health/diagnostics calculation surface now live in
 * react/src/services/executiveCenterService.js + react/src/pages/ExecutiveCenter.jsx
 * (compiled into js/vendor/react-bundle.js by build.js). Unlike every other migrated
 * page, the calc logic here does NOT stay in this stub — see
 * executiveCenterService.js's own header comment for why (every external caller of
 * window.PCC.executiveCenter.* is itself an already-migrated React service, so there's
 * no remaining vanilla caller forcing the "calc stays in the stub" workaround). This
 * file's only remaining jobs are (1) registering the route, then handing off to
 * reactBridge.js, and (2) viewProject()'s own one-shot pending-prop plumbing — only the
 * stub's render() can consume a pending prop before mount, so this piece alone has to
 * live here regardless.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};
  window.PCC.executiveCenter = window.PCC.executiveCenter || {};

  var pendingProjectId = null;
  var pendingTab = null;

  function render(outlet) {
    var props = {
      initialProjectId: pendingProjectId,
      initialTab: pendingTab,
    };
    pendingProjectId = null;
    pendingTab = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.executiveCenter, props, outlet);
  }

  window.PCC.pages.executiveCenter = render;

  // PCC Evolution Roadmap, Tier E: Personal Workbench — optional second argument lands
  // directly on a specific tab (e.g. "weeklyReviews" for a Review due), same "land
  // exactly on the linked record" convention vendors.js's openProfile(vendorId, tab)
  // already established. Defaults to "overview" so every existing caller is unaffected.
  // Merged onto window.PCC.executiveCenter (not a wholesale reassignment) since
  // executiveCenterService.js already attached getDiagnostics/getHealthSummary/
  // getSchedulePerformanceSummary/getDelayImpactSummary onto this same object when the
  // react bundle loaded, earlier in JS_ORDER.
  window.PCC.executiveCenter.viewProject = function (projectId, tab) {
    pendingProjectId = projectId;
    pendingTab = tab || "overview";
    window.PCC.projectContext.set(projectId);
  };
})();
