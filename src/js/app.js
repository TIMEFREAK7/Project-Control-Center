(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var router = window.PCC.router;

    router.register("dashboard", window.PCC.pages.dashboard);
    router.register("actionCentre", window.PCC.pages.actionCentre);
    router.register("myWork", window.PCC.pages.myWork);
    router.register("projectLookahead", window.PCC.pages.projectLookahead);
    router.register("portfolio", window.PCC.pages.portfolio);
    router.register("executiveCenter", window.PCC.pages.executiveCenter);
    router.register("vendors", window.PCC.pages.vendors);
    router.register("vendorPerformanceCentre", window.PCC.pages.vendorPerformanceCentre);
    router.register("documents", window.PCC.pages.documents);
    router.register("documentTypes", window.PCC.pages.documentTypes);
    router.register("documentControlDashboard", window.PCC.pages.documentControlDashboard);
    router.register("dailylog", window.PCC.pages.dailylog);
    router.register("schedule", window.PCC.pages.schedule);
    router.register("delayRecoveryDashboard", window.PCC.pages.delayRecoveryDashboard);
    router.register("risks", window.PCC.pages.risks);
    router.register("meetings", window.PCC.pages.meetings);
    router.register("rfis", window.PCC.pages.rfis);
    router.register("changeOrders", window.PCC.pages.changeOrders);
    router.register("decisionRegister", window.PCC.pages.decisionRegister);
    router.register("lessonsLearned", window.PCC.pages.lessonsLearned);
    router.register("knowledgeBase", window.PCC.pages.knowledgeBase);
    router.register("cost", window.PCC.pages.cost);
    router.register("commitments", window.PCC.pages.commitments);
    router.register("resources", window.PCC.pages.resources);
    router.register("reports", window.PCC.pages.reports);
    router.register("settings", window.PCC.pages.settings);
    router.register("notfound", window.PCC.pages.notfound);

    window.PCC.layout.mount();
    router.render();

    // One-time, best-effort: moves any blobs from before this migration existed out of
    // the primary JSON and into IndexedDB, shrinking what autosave has to write from
    // here on. Deliberately not awaited before mount()/render() — the app is fully
    // usable immediately either way, since blobStore.resolve() already handles both
    // "still inline" and "in IndexedDB" transparently. A failure here just means
    // legacy records stay inline (functionally fine, just not yet migrated) rather than
    // blocking startup on it.
    if (window.PCC.store.migrateLegacyInlineBlobsToIndexedDb) {
      window.PCC.store
        .migrateLegacyInlineBlobsToIndexedDb()
        .then(function (result) {
          if (result && result.migrated > 0) {
            console.log("Migrated " + result.migrated + " file(s) to IndexedDB storage.");
          }
        })
        .catch(function (e) {
          console.error("Legacy blob migration to IndexedDB did not complete", e);
        });
    }
  });
})();
