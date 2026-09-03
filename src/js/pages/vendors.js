/* Vendor Management — Gate 9. Migrated to React (Post-Phase-5 Engineering Evolution, Batch F
 * part 2) — see react/src/pages/Vendors.jsx and react/src/services/vendorsService.js. This stub
 * only registers the route and forwards the pre-existing public API
 * (openProfile/filterByProject) as a one-shot pending-prop channel, per the pattern documented
 * in CLAUDE.md's "React migration" section.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var pendingView = null;
  var pendingProfileVendorId = null;
  var pendingProfileTab = null;
  var pendingProjectFilter = null;

  function render(outlet) {
    var props = {
      initialView: pendingView,
      initialProfileVendorId: pendingProfileVendorId,
      initialProfileTab: pendingProfileTab,
      initialProjectFilter: pendingProjectFilter,
    };
    pendingView = null;
    pendingProfileVendorId = null;
    pendingProfileTab = null;
    pendingProjectFilter = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.vendors, props, outlet);
  }

  window.PCC.pages.vendors = render;

  window.PCC.vendors = {
    openProfile: function (vendorId, tab) {
      pendingView = "profile";
      pendingProfileVendorId = vendorId;
      pendingProfileTab = tab || "overview";
    },
    filterByProject: function (projectId) {
      pendingView = "list";
      pendingProjectFilter = projectId;
      window.PCC.projectContext.set(projectId);
    },
  };
})();
