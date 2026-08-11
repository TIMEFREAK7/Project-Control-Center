(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  function makeComingSoon(title, note) {
    return function (outlet) {
      var wrap = document.createElement("div");

      var h1 = document.createElement("h2");
      h1.textContent = title;
      h1.style.marginBottom = "20px";

      var panel = document.createElement("div");
      panel.className = "panel";
      panel.style.maxWidth = "520px";
      panel.style.textAlign = "center";
      panel.innerHTML =
        "<h3 style='margin-bottom:8px;'>Not built yet</h3><p class='text-secondary' style='margin:0;'>" +
        note +
        "</p>";

      wrap.appendChild(h1);
      wrap.appendChild(panel);
      outlet.appendChild(wrap);
    };
  }

  window.PCC.pages.notfound = makeComingSoon("Not Found", "That page doesn't exist.");
})();
