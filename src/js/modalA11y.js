/** Modal accessibility — one shared implementation of the keyboard/focus behavior every
 * `.modal-overlay` dialog in this app needs (WCAG 2.2 AA: 2.1.1 Keyboard, 2.1.2 No Keyboard
 * Trap's inverse — focus must stay IN an open modal dialog, 2.4.3 Focus Order, 4.1.2 Name,
 * Role, Value). Before this, every modal (the three React AI-output dialogs, the keyboard-
 * shortcuts help, the file viewer) closed on a backdrop click and some on Escape, but none
 * kept Tab inside the dialog, none moved focus into it on open, none returned focus to the
 * control that opened it, and none carried role="dialog"/aria-modal — a keyboard user's Tab
 * walked straight out into the page behind the overlay.
 *
 *   var detach = window.PCC.modalA11y.attach(overlayEl, { onClose: fn, initialFocus: el });
 *   ...later, when the modal is removed: detach();
 *
 * attach() is the only entry point. It works on the existing `.modal-overlay > .modal`
 * markup unchanged (vanilla pages build it by hand; React pages render it and attach via
 * react/src/utils/useModalA11y.ts) — no new modal component, per UX_RULES' "reuse .modal,
 * don't invent modal behavior."
 *
 * Stacked modals: only the TOPMOST attached modal handles Escape/Tab, so opening the file
 * viewer from inside another dialog closes one layer per Escape, and each layer returns
 * focus to its own opener — a per-modal opener, not one shared global (the copy-paste
 * library this was scoped from kept a single `lastFocusedElement`, which loses the first
 * opener as soon as a second modal opens).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var FOCUSABLE =
    'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), summary, iframe, ' +
    '[contenteditable="true"], [tabindex]:not([tabindex="-1"])';

  var stack = [];
  var titleIdSeq = 0;

  // Deliberately NOT `offsetParent !== null` / getClientRects(): both are always
  // null/empty under jsdom (no layout engine), which would make every element look
  // hidden to the test suite. `hidden` attributes and computed display/visibility are
  // what this app actually uses to hide things inside a modal, and jsdom reports both.
  function isVisible(el) {
    if (el.closest("[hidden]")) return false;
    var node = el;
    while (node && node.nodeType === 1) {
      var style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
      node = node.parentElement;
    }
    return true;
  }

  function focusableIn(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), isVisible);
  }

  function top() {
    return stack.length ? stack[stack.length - 1] : null;
  }

  function onKeydown(e) {
    var entry = top();
    if (!entry) return;
    if (e.key === "Escape") {
      // Capture phase + stopPropagation: one Escape closes exactly one modal layer, and
      // never also reaches layout.js's nav-drawer Escape or a page's own handler behind it.
      e.preventDefault();
      e.stopPropagation();
      if (entry.onClose) entry.onClose();
      return;
    }
    if (e.key !== "Tab") return;
    var items = focusableIn(entry.dialog);
    if (items.length === 0) {
      e.preventDefault();
      entry.dialog.focus();
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    var active = document.activeElement;
    var inside = entry.dialog.contains(active);
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener("keydown", onKeydown, true);

  function attach(overlay, opts) {
    opts = opts || {};
    var dialog = overlay.querySelector(".modal") || overlay.firstElementChild || overlay;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
    if (opts.label) {
      dialog.setAttribute("aria-label", opts.label);
    } else if (!dialog.hasAttribute("aria-labelledby") && !dialog.hasAttribute("aria-label")) {
      var title = dialog.querySelector(".modal__title");
      if (title) {
        if (!title.id) title.id = "pcc-modal-title-" + ++titleIdSeq;
        dialog.setAttribute("aria-labelledby", title.id);
      }
    }

    var entry = {
      overlay: overlay,
      dialog: dialog,
      onClose: opts.onClose || null,
      opener: document.activeElement && document.activeElement !== document.body ? document.activeElement : null,
      fallbackFocus: opts.fallbackFocus || null,
    };
    stack.push(entry);

    var target = opts.initialFocus || focusableIn(dialog)[0] || dialog;
    if (target && target.focus) target.focus();

    var detached = false;
    return function detach() {
      if (detached) return;
      detached = true;
      var idx = stack.indexOf(entry);
      if (idx !== -1) stack.splice(idx, 1);
      // Only restore focus when this was the topmost layer — closing a buried modal
      // shouldn't yank focus out of the one still open above it.
      if (idx !== stack.length) return;
      var restore = entry.opener && entry.opener.isConnected ? entry.opener : null;
      // The opener is often a "⋯" dropdown item that unmounted when its menu closed —
      // callers pass fallbackFocus (e.g. the menu's own toggle button) for that case.
      if (!restore && typeof entry.fallbackFocus === "function") restore = entry.fallbackFocus();
      if (restore && restore.isConnected && restore.focus) restore.focus();
    };
  }

  window.PCC.modalA11y = {
    attach: attach,
    isOpen: function () {
      return stack.length > 0;
    },
  };
})();
