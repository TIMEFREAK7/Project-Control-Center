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

  function notify(message, severity) {
    severity = severity || "info";
    var stack = ensureStack();
    var toast = document.createElement("div");
    toast.className = "toast toast--" + severity;
    toast.textContent = message;
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
