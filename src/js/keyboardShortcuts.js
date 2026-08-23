/** Keyboard shortcuts — Daily-Use Audit Phase 2. Before this, the only keyboard
 * handling anywhere in the app was Escape closing the mobile nav drawer (layout.js);
 * every action was mouse-only. A first, deliberately small pass covering the two
 * highest-frequency daily actions the audit named — find something, add something —
 * plus a way to discover the shortcuts exist at all:
 *
 *   /   focus this page's own primary search box (the first text input in its toolbar)
 *   n   click this page's own primary "+ Add X" button
 *   ?   show this help overlay
 *
 * Deliberately generic rather than wired per-page: every page module already follows
 * the exact same conventions (a `.toolbar` with a plain text search input first; a "+
 * Add X" button for the primary create action), so one small heuristic here covers all
 * ~20 page modules without touching any of them individually. A page with neither is
 * simply a no-op — nothing to focus or click, not an error.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  function focusPrimarySearch() {
    var outlet = document.getElementById("page-outlet");
    if (!outlet) return false;
    var input = outlet.querySelector(".toolbar input[type='text']");
    if (!input || input.disabled) return false;
    input.focus();
    if (input.select) input.select();
    return true;
  }

  function clickPrimaryAddButton() {
    var outlet = document.getElementById("page-outlet");
    if (!outlet) return false;
    var buttons = Array.from(outlet.querySelectorAll("button"));
    var addBtn = buttons.find(function (b) {
      return !b.disabled && /^\+\s*Add\b/.test(b.textContent.trim());
    });
    if (!addBtn) return false;
    addBtn.click();
    return true;
  }

  var SHORTCUTS = [
    { key: "/", desc: "Focus this page's search box" },
    { key: "n", desc: "Add a new entry on this page" },
    { key: "Esc", desc: "Close the open menu or dialog" },
    { key: "?", desc: "Show this list" },
  ];

  function closeHelp() {
    var overlay = document.getElementById("shortcuts-help-overlay");
    if (overlay) overlay.remove();
    document.removeEventListener("keydown", handleHelpEscape);
  }

  function handleHelpEscape(e) {
    if (e.key === "Escape") closeHelp();
  }

  function showShortcutsHelp() {
    closeHelp();

    var overlay = document.createElement("div");
    overlay.id = "shortcuts-help-overlay";
    overlay.className = "modal-overlay";
    overlay.onclick = function (e) {
      if (e.target === overlay) closeHelp();
    };

    var modal = document.createElement("div");
    modal.className = "modal";
    modal.style.maxWidth = "360px";
    modal.style.width = "min(360px, 92vw)";

    var header = document.createElement("div");
    header.className = "modal__header";
    var title = document.createElement("div");
    title.className = "modal__title";
    title.textContent = "Keyboard shortcuts";
    header.appendChild(title);
    var closeBtn = document.createElement("button");
    closeBtn.className = "icon-btn";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "✕";
    closeBtn.onclick = closeHelp;
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = document.createElement("div");
    body.className = "modal__body";
    SHORTCUTS.forEach(function (s) {
      var row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "8px 0";
      row.style.borderBottom = "1px solid var(--divider)";
      var kbd = document.createElement("kbd");
      kbd.style.fontFamily = "var(--font-mono)";
      kbd.style.fontSize = "12.5px";
      kbd.style.padding = "3px 8px";
      kbd.style.borderRadius = "var(--radius-sm)";
      kbd.style.border = "1px solid var(--divider)";
      kbd.style.background = "var(--bg-raised)";
      kbd.textContent = s.key;
      var desc = document.createElement("span");
      desc.className = "text-secondary";
      desc.style.fontSize = "13px";
      desc.textContent = s.desc;
      row.appendChild(desc);
      row.appendChild(kbd);
      body.appendChild(row);
    });
    var note = document.createElement("p");
    note.className = "text-secondary";
    note.style.fontSize = "12px";
    note.style.marginTop = "12px";
    note.style.marginBottom = "0";
    note.textContent = "Shortcuts are ignored while typing in a field.";
    body.appendChild(note);
    modal.appendChild(body);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", handleHelpEscape);
  }

  document.addEventListener("keydown", function (e) {
    // Never hijack a real browser/OS shortcut, typing in a field, or input while the
    // mobile nav drawer or this same help overlay is already open.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(document.activeElement)) return;
    if (document.getElementById("nav-overlay") || document.getElementById("shortcuts-help-overlay")) return;

    if (e.key === "/") {
      if (focusPrimarySearch()) e.preventDefault();
    } else if (e.key === "n") {
      if (clickPrimaryAddButton()) e.preventDefault();
    } else if (e.key === "?") {
      showShortcutsHelp();
      e.preventDefault();
    }
  });

  window.PCC.keyboardShortcuts = { showHelp: showShortcutsHelp };
})();
