/* "Not Found" / not-yet-built placeholder — migrated to React. makeComingSoon() stays as a
 * factory (not just a single hardcoded page) since it's the reusable shape for any future
 * not-yet-built feature route, exactly like the old vanilla version was.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  function makeComingSoon(title, note) {
    return function (outlet) {
      window.PCC.reactBridge.mount(window.PCC.reactPages.comingSoon, { title: title, note: note }, outlet);
    };
  }

  window.PCC.pages.notfound = makeComingSoon("Not Found", "That page doesn't exist.");
})();
