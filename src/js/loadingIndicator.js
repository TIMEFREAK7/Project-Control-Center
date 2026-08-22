/** Shared visual loading feedback — a small spinner, in two forms:
 * - show()/hide(): a global blocking overlay, for waits with nothing else on screen to show
 *   feedback in (e.g. blobStore.resolve() before the file viewer modal exists yet).
 * - buildInline(label): an unattached DOM fragment (spinner + label) callers insert into
 *   their own layout — for waits that already have a place to render into (a form field, a
 *   modal body, a toolbar), replacing what used to be plain "Loading…" text in a few pages.
 * Gate D (UI Modernization). Not blob-related, so this stays out of blobStore.js on purpose —
 * see that file's own header on why it's scoped to binary blobs only.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var overlayEl = null;

  function buildInline(label) {
    var box = document.createElement("div");
    box.className = "loading-indicator";
    var spinner = document.createElement("span");
    spinner.className = "spinner";
    box.appendChild(spinner);
    var text = document.createElement("span");
    text.textContent = label || "Loading…";
    box.appendChild(text);
    return box;
  }

  function show(label) {
    hide();
    overlayEl = document.createElement("div");
    overlayEl.className = "loading-indicator-overlay";
    overlayEl.appendChild(buildInline(label));
    document.body.appendChild(overlayEl);
  }

  function hide() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
  }

  window.PCC.loadingIndicator = { show: show, hide: hide, buildInline: buildInline };
})();
