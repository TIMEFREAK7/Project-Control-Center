(function () {
  "use strict";
  window.PCC = window.PCC || {};

  function ensureStack() {
    var stack = document.getElementById("toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  /** `action` (optional, Gate H.3): { label, onClick } adds one button to the toast. */
  function notify(message, severity, action) {
    severity = severity || "info";
    var stack = ensureStack();
    var toast = document.createElement("div");
    toast.className = "toast toast--" + severity;
    toast.textContent = message;
    if (action && action.label) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--ghost btn--sm";
      btn.style.marginLeft = "8px";
      // The toast's own text colour (dark on amber/green, white on red/blue) keeps contrast.
      btn.style.color = "inherit";
      btn.style.borderColor = "currentColor";
      btn.textContent = action.label;
      btn.onclick = function () {
        toast.remove();
        action.onClick();
      };
      toast.appendChild(btn);
    }
    stack.appendChild(toast);
    window.setTimeout(function () {
      toast.style.transition = "opacity 200ms";
      toast.style.opacity = "0";
      window.setTimeout(function () {
        toast.remove();
      }, 200);
    }, 4200);
  }

  window.PCC.notify = notify;
})();
