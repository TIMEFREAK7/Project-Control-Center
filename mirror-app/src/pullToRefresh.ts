/* Pull-to-refresh gesture -- ported forward from the now-deleted src/js/pullToRefresh.js,
 * same touch math/threshold/indicator approach (that file's own header comment already
 * flagged its on-device feel as unverified in any sandbox; still true here, see the
 * Phase 2 report). Two differences from the original, both because this app has no
 * router.js: every tab supports pull-to-refresh (the original's ENABLED_ROUTES allowlist
 * doesn't apply -- there's nothing else in this app to exclude), and a successful pull
 * calls the onRefreshed callback (App.tsx bumps a re-render) instead of
 * window.PCC.router.render().
 */
import { readMirrorFileIfNewer } from "./mirrorRead";

const PULL_THRESHOLD_PX = 70;

let startY: number | null = null;
let pastThreshold = false;
let indicatorEl: HTMLElement | null = null;

function scrollTop(): number {
  const el = document.scrollingElement || document.documentElement;
  return el ? el.scrollTop : window.scrollY || 0;
}

function ensureIndicator(): HTMLElement | null {
  const outlet = document.getElementById("mirror-app-outlet");
  if (!outlet || !outlet.parentNode) return null;
  if (indicatorEl && indicatorEl.parentNode === outlet.parentNode) return indicatorEl;
  indicatorEl = document.createElement("div");
  indicatorEl.className = "pull-to-refresh-indicator";
  indicatorEl.setAttribute("aria-live", "polite");
  indicatorEl.hidden = true;
  outlet.parentNode.insertBefore(indicatorEl, outlet);
  return indicatorEl;
}

function setIndicatorText(text: string): void {
  const el = ensureIndicator();
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}

export function installPullToRefresh(onRefreshed: () => void): void {
  function handleTouchStart(e: TouchEvent): void {
    if (scrollTop() > 0) {
      startY = null;
      return;
    }
    startY = e.touches[0].clientY;
    pastThreshold = false;
  }

  function handleTouchMove(e: TouchEvent): void {
    if (startY === null) return;
    const delta = e.touches[0].clientY - startY;
    pastThreshold = delta > PULL_THRESHOLD_PX;
    setIndicatorText(pastThreshold ? "Release to refresh" : "");
  }

  function handleTouchEnd(): void {
    if (startY === null) return;
    const shouldRefresh = pastThreshold;
    startY = null;
    pastThreshold = false;
    if (!shouldRefresh) {
      setIndicatorText("");
      return;
    }
    setIndicatorText("Refreshing…");
    readMirrorFileIfNewer()
      .then((applied) => {
        if (applied) onRefreshed();
      })
      .catch(() => {
        // Best-effort background refresh -- no mirror file yet, or a read failure,
        // should never surface as an error to the user.
      })
      .then(() => {
        setIndicatorText("");
      });
  }

  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchmove", handleTouchMove, { passive: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });
}
