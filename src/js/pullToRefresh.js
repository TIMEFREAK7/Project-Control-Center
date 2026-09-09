/** Pull-to-refresh gesture for the "at a glance" pages (Dashboard, My Work, Action
 * Centre, Portfolio) — see src/js/dataMirror.js's header for the one-way mirror this
 * refreshes from. Attached once at the document level rather than duplicated inside
 * each page: none of these React-migrated pages currently subscribe to live store
 * updates (each captures its data once via `useState(() => getData())` with no
 * reactive re-fetch — confirmed directly, not assumed), so rather than adding a new
 * live-update state path to four already-complex page components, a successful pull
 * just forces a full router re-render — reusing router.js's own already-correct
 * "brand new mount, fresh data" behavior (see CLAUDE.md's React migration notes on
 * reactBridge.js creating a fresh root on every render()) instead.
 *
 * The page scrolls at the document level (`.main-column` has no `overflow`/scroll CSS
 * of its own — confirmed by reading styles.css, not assumed), so this tracks
 * window scroll position, not any inner container's scrollTop.
 *
 * Real device verification note: this sandbox has no Android emulator/device (same
 * long-standing gap every prior packaging gate's own write-up has flagged) — the touch
 * math and threshold are implemented per standard mobile pull-to-refresh conventions and
 * covered by tests exercising the exported handler functions directly, but the actual
 * on-device feel is unverified.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var PULL_THRESHOLD_PX = 70;
  var ENABLED_ROUTES = { dashboard: true, myWork: true, actionCentre: true, portfolio: true };

  var startY = null;
  var pastThreshold = false;
  var indicatorEl = null;

  function scrollTop() {
    var el = document.scrollingElement || document.documentElement;
    return el ? el.scrollTop : window.scrollY || 0;
  }

  function ensureIndicator() {
    var outlet = document.getElementById("page-outlet");
    if (!outlet || !outlet.parentNode) return null;
    if (indicatorEl && indicatorEl.parentNode === outlet.parentNode) return indicatorEl;
    indicatorEl = document.createElement("div");
    indicatorEl.className = "pull-to-refresh-indicator";
    indicatorEl.setAttribute("aria-live", "polite");
    indicatorEl.hidden = true;
    outlet.parentNode.insertBefore(indicatorEl, outlet);
    return indicatorEl;
  }

  function setIndicatorText(text) {
    var el = ensureIndicator();
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
  }

  function currentRouteEnabled() {
    return !!(window.PCC.router && ENABLED_ROUTES[window.PCC.router.currentRouteName()]);
  }

  function handleTouchStart(e) {
    if (!currentRouteEnabled() || scrollTop() > 0) {
      startY = null;
      return;
    }
    startY = e.touches[0].clientY;
    pastThreshold = false;
  }

  function handleTouchMove(e) {
    if (startY === null) return;
    var delta = e.touches[0].clientY - startY;
    pastThreshold = delta > PULL_THRESHOLD_PX;
    setIndicatorText(pastThreshold ? "Release to refresh" : "");
  }

  function handleTouchEnd() {
    if (startY === null) return;
    var shouldRefresh = pastThreshold;
    startY = null;
    pastThreshold = false;
    if (!shouldRefresh) {
      setIndicatorText("");
      return;
    }
    setIndicatorText("Refreshing…");
    var mirror = window.PCC.dataMirror;
    var refresh = mirror ? mirror.readAndroidMirrorFileIfNewer() : Promise.resolve();
    refresh
      .then(function () {
        if (window.PCC.router) window.PCC.router.render();
      })
      .catch(function () {
        // No mirror file yet, or a read failure — this is meant to be an invisible,
        // best-effort background refresh, not something that shows an error.
      })
      .then(function () {
        setIndicatorText("");
      });
  }

  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchmove", handleTouchMove, { passive: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  window.PCC.pullToRefresh = {
    // Exposed for tests only — not a real public API surface for other app code to call.
    _testHooks: {
      handleTouchStart: handleTouchStart,
      handleTouchMove: handleTouchMove,
      handleTouchEnd: handleTouchEnd,
    },
  };
})();
