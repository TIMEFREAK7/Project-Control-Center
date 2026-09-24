// Pure helpers for main.js's navigation / new-window guards — kept separate so they're
// testable with plain Node (same reasoning as mirrorFileWriter.js / relocateStorage.js;
// main.js itself can't be require()d outside a real Electron process).
//
// Why these exist (2026-09-24 audit): the app window loads index.html via file:// with a
// preload bridge (window.PCC_ELECTRON) attached. Without guards, clicking any link inside
// the app — e.g. a hyperlink inside a previewed Word document — could navigate THIS window
// to an arbitrary website, which would then run with that same bridge available, and
// window.open() would spawn a new window inheriting the same preload. The app itself never
// performs a full-page navigation (routing is hash-only, which is an in-page navigation and
// never reaches will-navigate), so the rule is simple: stay on the app's own document; send
// genuine web/mail links to the system browser/mail client; refuse everything else.

const EXTERNAL_PROTOCOLS = ["http:", "https:", "mailto:"];

/** True for a URL that's safe to hand to the OS (shell.openExternal). */
function isExternalUrl(url) {
  try {
    return EXTERNAL_PROTOCOLS.indexOf(new URL(url).protocol) !== -1;
  } catch (e) {
    return false;
  }
}

/** True when `target` is the same document as `current`, ignoring the #hash — i.e. an
 * in-app route change, not a navigation away. */
function isSameDocument(target, current) {
  try {
    const a = new URL(target);
    const b = new URL(current);
    a.hash = "";
    b.hash = "";
    return a.href === b.href;
  } catch (e) {
    return false;
  }
}

module.exports = { isExternalUrl, isSameDocument };
