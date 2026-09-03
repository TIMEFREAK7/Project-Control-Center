/* Small vanilla glue between the existing hash router (router.js) and React pages
 * (Post-Phase-5 Engineering Evolution, React migration priority — §6-11 of the master
 * upgrade prompt). Deliberately tiny: this is the ONLY place that knows both "React" and
 * "the vanilla router" exist. Every migrated page module (e.g. pages/storageManagement.js)
 * still registers with window.PCC.pages exactly like every vanilla page always has —
 * router.js itself needed zero changes to its route-registration contract, only one line
 * in render() (see router.js) to unmount a stale React root before wiping the outlet.
 *
 * A fresh root is created on every mount() call rather than reused across re-renders,
 * because router.js's own render() always does `outlet.innerHTML = ""` before invoking a
 * page's render function — by the time mount() runs, the container is already empty, so
 * reusing a prior root would mean asking React to reconcile against real DOM nodes that
 * were just rippped out from under it. unmount() is called first specifically so a
 * page's effects (subscriptions, timers, listeners) get their real cleanup instead of
 * being silently abandoned.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var activeRoot = null;

  function unmount() {
    if (activeRoot) {
      try {
        activeRoot.unmount();
      } catch (e) {
        // A root can throw on unmount if its container was already detached/replaced
        // outside React's control — safe to ignore, the goal (no stale root) is met.
      }
      activeRoot = null;
    }
  }

  function mount(Component, props, container) {
    unmount();
    var root = window.PCC.ReactDOM.createRoot(container);
    activeRoot = root;
    // flushSync forces this initial commit to happen synchronously, before mount()
    // returns — React 18's createRoot().render() is asynchronous by default (confirmed
    // real behavior, not a jsdom quirk; see CLAUDE.md's React migration notes), which
    // would otherwise mean every existing and future test needs to know a given route is
    // React-backed and await a flush before reading its DOM. Forcing sync here instead
    // keeps every page's contract identical from a caller's perspective: content is in
    // the DOM the moment router.render() returns, exactly like every vanilla page.
    window.PCC.ReactDOM.flushSync(function () {
      root.render(window.PCC.React.createElement(Component, props || {}));
    });
  }

  window.PCC.reactBridge = {
    mount: mount,
    unmount: unmount,
  };
})();
