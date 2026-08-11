(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var STATUS_LABELS = {
    on_track: "On Track",
    at_risk: "At Risk",
    critical: "Critical",
    complete: "Complete",
  };

  function render(outlet) {
    var data = window.PCC.store.get();
    var active = data.projects.filter(function (p) {
      return !p.archived;
    });

    var wrap = document.createElement("div");

    var h1 = document.createElement("h2");
    h1.textContent = "Portfolio Overview";
    h1.style.marginBottom = "4px";

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "20px";
    sub.textContent =
      active.length === 0
        ? "No active projects yet \u2014 add one from the Portfolio page to populate this view."
        : "Portfolio-wide health across " + active.length + " active project" + (active.length === 1 ? "" : "s") + ".";

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";

    function countByStatus(status) {
      return active.filter(function (p) {
        return p.status === status;
      }).length;
    }

    var kpis = [
      { label: "ACTIVE PROJECTS", value: active.length, colorVar: null },
      { label: "ON TRACK", value: countByStatus("on_track"), colorVar: "--status-on-track" },
      { label: "AT RISK", value: countByStatus("at_risk"), colorVar: "--status-at-risk" },
      { label: "CRITICAL", value: countByStatus("critical"), colorVar: "--status-critical" },
    ];

    kpis.forEach(function (kpi) {
      var card = document.createElement("div");
      card.className = "kpi-card";
      var valueStyle = kpi.colorVar ? ' style="color:var(' + kpi.colorVar + ')"' : "";
      card.innerHTML =
        '<span class="kpi-card__label">' +
        kpi.label +
        '</span><span class="kpi-card__value mono"' +
        valueStyle +
        ">" +
        kpi.value +
        "</span>";
      kpiGrid.appendChild(card);
    });

    wrap.appendChild(h1);
    wrap.appendChild(sub);
    wrap.appendChild(kpiGrid);

    var panel = document.createElement("div");
    panel.className = "panel";

    if (active.length === 0) {
      panel.innerHTML =
        "<h3 style='margin-bottom:8px;'>Get started</h3>" +
        "<p class='text-secondary' style='margin:0;'>Head to Portfolio and add your first project \u2014 it'll " +
        "show up here immediately.</p>";
    } else {
      var heading = document.createElement("h3");
      heading.style.marginBottom = "10px";
      heading.textContent = "Recent projects";
      panel.appendChild(heading);

      var list = document.createElement("div");
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "8px";

      active
        .slice()
        .sort(function (a, b) {
          return new Date(b.updated_at) - new Date(a.updated_at);
        })
        .slice(0, 5)
        .forEach(function (p) {
          var row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.fontSize = "14px";
          row.innerHTML =
            "<span>" +
            (p.name || "(unnamed project)") +
            "</span><span class='status-badge status-badge--" +
            p.status +
            "'>" +
            (STATUS_LABELS[p.status] || p.status) +
            "</span>";
          list.appendChild(row);
        });

      panel.appendChild(list);
    }

    wrap.appendChild(panel);
    outlet.appendChild(wrap);
  }

  window.PCC.pages.dashboard = render;
})();
