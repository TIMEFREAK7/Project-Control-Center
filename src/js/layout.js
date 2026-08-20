(function () {
  "use strict";
  window.PCC = window.PCC || {};

  // Grouped for findability now that there are a dozen+ items — purely a sidebar
  // presentation grouping, not a new concept elsewhere (routing/PAGE_TITLES below are
  // still a flat map). Collapses to one continuous horizontal strip on mobile, same as
  // before grouping existed (see the max-width: 780px rule hiding .sidebar__group-label).
  var NAV_GROUPS = [
    {
      label: "OVERVIEW",
      items: [
        { key: "dashboard", label: "Dashboard", code: "DB" },
        { key: "myWork", label: "My Work", code: "MW" },
        { key: "actionCentre", label: "Action Centre", code: "AC" },
        { key: "projectLookahead", label: "Project Lookahead", code: "LA" },
        { key: "portfolio", label: "Portfolio", code: "PF" },
        { key: "executiveCenter", label: "Executive Center", code: "EC" },
        { key: "vendors", label: "Vendors", code: "VN" },
        { key: "vendorPerformanceCentre", label: "Vendor Performance Centre", code: "VP" },
      ],
    },
    {
      label: "REGISTERS",
      items: [
        { key: "documents", label: "Documents", code: "DC" },
        { key: "documentTypes", label: "Document Types", code: "DT" },
        { key: "documentControlDashboard", label: "Document Control Dashboard", code: "DD" },
        { key: "dailylog", label: "Daily Log", code: "DL" },
        { key: "risks", label: "Risk Register", code: "RK" },
        { key: "meetings", label: "Meetings", code: "MT" },
        { key: "rfis", label: "RFI / TQ", code: "RQ" },
        { key: "changeOrders", label: "Change Mgmt", code: "CM" },
        { key: "decisionRegister", label: "Decision Register", code: "DE" },
        { key: "lessonsLearned", label: "Lessons Learned", code: "LL" },
        { key: "knowledgeBase", label: "Knowledge Base", code: "KB" },
      ],
    },
    {
      label: "PLANNING",
      items: [
        { key: "schedule", label: "Schedule", code: "SC" },
        { key: "delayRecoveryDashboard", label: "Delay & Recovery Dashboard", code: "DR" },
        { key: "cost", label: "Cost Tracking", code: "CT" },
        { key: "commitments", label: "Commitments", code: "CN" },
        { key: "resources", label: "Resources", code: "RS" },
      ],
    },
    {
      label: "OUTPUT",
      items: [
        { key: "reports", label: "Reports", code: "RP" },
        { key: "settings", label: "Settings", code: "ST" },
      ],
    },
  ];

  var PAGE_TITLES = {
    dashboard: "Dashboard",
    myWork: "My Work",
    actionCentre: "Planner Action Centre",
    projectLookahead: "Project Lookahead",
    portfolio: "Portfolio",
    executiveCenter: "Executive Center",
    vendors: "Vendor Management",
    vendorPerformanceCentre: "Vendor Performance Centre",
    documents: "Documents",
    documentTypes: "Document Types",
    documentControlDashboard: "Document Control Dashboard",
    dailylog: "Daily Log",
    risks: "Risk Register",
    meetings: "Meetings",
    rfis: "RFI / Technical Query",
    changeOrders: "Change Management",
    decisionRegister: "Decision Register",
    lessonsLearned: "Lessons Learned",
    knowledgeBase: "Knowledge Base",
    cost: "Cost Tracking",
    commitments: "Commitment Management",
    resources: "Resource Management",
    reports: "Reports",
    schedule: "Schedule",
    delayRecoveryDashboard: "Delay & Recovery Dashboard",
    settings: "Settings",
    notfound: "Not Found",
  };

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function toggleTheme() {
    var store = window.PCC.store;
    var current = store.get().settings.theme === "dark" ? "light" : "dark";
    store.update(function (data) {
      data.settings.theme = current;
    });
    applyTheme(current);
    var icon = document.getElementById("theme-toggle-icon");
    if (icon) icon.textContent = current === "dark" ? "\u2600" : "\u263D";
  }

  function setActiveNav(routeName) {
    var links = document.querySelectorAll(".sidebar__link");
    links.forEach(function (link) {
      link.classList.toggle("active", link.getAttribute("data-route") === routeName);
    });
    var titleValue = document.getElementById("title-block-sheet");
    if (titleValue) titleValue.textContent = PAGE_TITLES[routeName] || routeName;
  }

  function buildSidebar() {
    var sidebar = document.createElement("aside");
    sidebar.className = "sidebar";

    var label = document.createElement("div");
    label.className = "sidebar__label";
    label.textContent = "SHEET INDEX";
    sidebar.appendChild(label);

    var nav = document.createElement("ul");
    nav.className = "sidebar__nav";

    NAV_GROUPS.forEach(function (group) {
      var groupLabel = document.createElement("li");
      groupLabel.className = "sidebar__group-label";
      groupLabel.textContent = group.label;
      nav.appendChild(groupLabel);

      group.items.forEach(function (item) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.className = "sidebar__link";
        a.href = "#/" + item.key;
        a.setAttribute("data-route", item.key);
        a.innerHTML =
          '<span class="sidebar__icon mono">' + item.code + "</span><span>" + item.label + "</span>";
        li.appendChild(a);
        nav.appendChild(li);
      });
    });

    sidebar.appendChild(nav);
    return sidebar;
  }

  function cell(label, value, opts) {
    opts = opts || {};
    var div = document.createElement("div");
    div.className = "title-block__cell" + (opts.grow ? " title-block__cell--grow" : "");
    var lab = document.createElement("span");
    lab.className = "title-block__label";
    lab.textContent = label;
    var val = document.createElement("span");
    val.className = "title-block__value";
    val.textContent = value;
    if (opts.id) val.id = opts.id;
    div.appendChild(lab);
    div.appendChild(val);
    return div;
  }

  function buildTitleBlock() {
    var header = document.createElement("header");
    header.className = "title-block";

    header.appendChild(cell("SHEET", "Dashboard", { grow: true, id: "title-block-sheet" }));

    var data = window.PCC.store.get();
    header.appendChild(cell("COMPANY", data.settings.company_name || "\u2014", { id: "title-block-company" }));
    header.appendChild(cell("DATE", new Date().toISOString().slice(0, 10)));

    var actions = document.createElement("div");
    actions.className = "title-block__actions";

    var exportBtn = document.createElement("button");
    exportBtn.className = "icon-btn";
    exportBtn.title = "Export all data to a single file";
    exportBtn.textContent = "\u2913"; // down arrow into tray-ish glyph
    exportBtn.onclick = function () {
      exportBtn.disabled = true;
      var originalGlyph = exportBtn.textContent;
      exportBtn.textContent = "\u2026";
      window.PCC.store
        .exportToFile()
        .then(function () {
          window.PCC.notify("Exported project-data-*.json. Keep this file with the app folder.", "success");
          if (window.PCC.layout.refreshBackupNudge) window.PCC.layout.refreshBackupNudge();
        })
        .catch(function (e) {
          window.PCC.notify("Export failed: " + e.message, "error");
        })
        .then(function () {
          exportBtn.disabled = false;
          exportBtn.textContent = originalGlyph;
        });
    };

    var importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json,application/json";
    importInput.style.display = "none";
    importInput.onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var confirmed = window.confirm(
        "Importing replaces ALL current data in this browser with the contents of \u201c" +
          file.name +
          "\u201d. This can't be undone. Make sure you've exported your current data first if you want to keep it. Continue?"
      );
      if (!confirmed) {
        importInput.value = "";
        return;
      }
      window.PCC.store.importFromFile(file, function (err) {
        if (err) {
          window.PCC.notify("Import failed: " + err.message, "error");
        } else {
          window.PCC.notify("Data imported.", "success");
          window.PCC.layout.refreshTitleBlock();
          if (window.PCC.layout.refreshBackupNudge) window.PCC.layout.refreshBackupNudge();
          window.PCC.router.render();
        }
      });
      importInput.value = "";
    };

    var importBtn = document.createElement("button");
    importBtn.className = "icon-btn";
    importBtn.title = "Import data from a file";
    importBtn.textContent = "\u2912";
    importBtn.onclick = function () {
      importInput.click();
    };

    var themeBtn = document.createElement("button");
    themeBtn.className = "icon-btn";
    themeBtn.title = "Toggle light / dark theme";
    themeBtn.innerHTML =
      '<span id="theme-toggle-icon">' +
      (window.PCC.store.get().settings.theme === "dark" ? "\u2600" : "\u263D") +
      "</span>";
    themeBtn.onclick = toggleTheme;

    actions.appendChild(exportBtn);
    actions.appendChild(importBtn);
    actions.appendChild(importInput);
    actions.appendChild(themeBtn);

    header.appendChild(actions);
    return header;
  }

  function buildFooter() {
    var footer = document.createElement("footer");
    footer.className = "app-footer";

    var left = document.createElement("span");
    left.textContent = "PROJECT CONTROL CENTER \u2014 LOCAL, OFFLINE INSTANCE";

    var right = document.createElement("span");
    right.id = "footer-save-status";
    right.textContent = "REV 0.1";

    footer.appendChild(left);
    footer.appendChild(right);
    return footer;
  }

  function daysBetween(isoEarlier, isoLater) {
    var a = new Date(isoEarlier).getTime();
    var b = new Date(isoLater).getTime();
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
  }

  /** A dismissible-but-recurring reminder, not a one-time nag: dismissing snoozes it for
   * another `backup_reminder_days`, it doesn't silence it permanently — otherwise the
   * first dismissal defeats the entire point of a backup reminder. Re-evaluated on
   * export, import, dismiss, and hourly for long-running sessions, since a stale
   * "0 days since backup" reading would be worse than no reminder at all. */
  function refreshBackupNudge() {
    var banner = document.getElementById("backup-nudge-banner");
    if (!banner) return;
    var data = window.PCC.store.get();
    var reminderDays = data.settings.backup_reminder_days;
    if (!reminderDays || reminderDays <= 0) {
      banner.style.display = "none";
      return;
    }

    var lastExported = data.meta.last_exported_at || data.meta.created_at;
    var nowIso = new Date().toISOString();
    var daysSinceExport = daysBetween(lastExported, nowIso);
    var dismissedAt = data.settings.backup_nudge_dismissed_at;
    var daysSinceDismiss = dismissedAt ? daysBetween(dismissedAt, nowIso) : reminderDays;

    if (daysSinceExport < reminderDays || daysSinceDismiss < reminderDays) {
      banner.style.display = "none";
      return;
    }

    banner.innerHTML = "";
    banner.style.display = "flex";

    var msg = document.createElement("span");
    msg.textContent =
      "You haven't exported a backup in " + daysSinceExport + " day" + (daysSinceExport === 1 ? "" : "s") + ". Export now to keep your data safe.";

    var actions = document.createElement("span");
    actions.style.display = "flex";
    actions.style.gap = "8px";

    var exportNowBtn = document.createElement("button");
    exportNowBtn.className = "btn btn--primary";
    exportNowBtn.textContent = "Export Now";
    exportNowBtn.onclick = function () {
      window.PCC.store.exportToFile();
      window.PCC.notify("Exported project-data-*.json. Keep this file with the app folder.", "success");
      refreshBackupNudge();
    };

    var dismissBtn = document.createElement("button");
    dismissBtn.className = "btn btn--ghost";
    dismissBtn.textContent = "Remind Me Later";
    dismissBtn.onclick = function () {
      window.PCC.store.update(function (d) {
        d.settings.backup_nudge_dismissed_at = new Date().toISOString();
      });
      refreshBackupNudge();
    };

    actions.appendChild(exportNowBtn);
    actions.appendChild(dismissBtn);
    banner.appendChild(msg);
    banner.appendChild(actions);
  }

  function buildBackupNudgeBanner() {
    var banner = document.createElement("div");
    banner.id = "backup-nudge-banner";
    banner.className = "no-print";
    banner.style.padding = "10px 20px";
    banner.style.fontSize = "13px";
    banner.style.display = "none";
    banner.style.alignItems = "center";
    banner.style.justifyContent = "space-between";
    banner.style.gap = "10px";
    banner.style.flexWrap = "wrap";
    banner.style.borderBottom = "1px solid var(--divider)";
    banner.style.background = "rgba(217, 164, 65, 0.15)";
    return banner;
  }

  /** Shown once, only in the session immediately after load() had to discard unreadable
   * localStorage data. The raw corrupted string is already safely preserved under its
   * own key by that point (see store.js load()) regardless of whether this banner is
   * seen or dismissed \u2014 this is just the loudest, most-likely-to-be-seen surface for
   * it. A persistent list of every such recovery snapshot also lives in Settings, so
   * dismissing this or missing it entirely doesn't lose the recovery path. */
  function buildCorruptionRecoveryBanner() {
    var rec = window.PCC.store.getCorruptionRecovery ? window.PCC.store.getCorruptionRecovery() : null;
    var banner = document.createElement("div");
    banner.id = "corruption-recovery-banner";
    banner.className = "no-print";
    banner.style.padding = "10px 20px";
    banner.style.fontSize = "13px";
    banner.style.display = rec ? "flex" : "none";
    banner.style.alignItems = "center";
    banner.style.justifyContent = "space-between";
    banner.style.gap = "10px";
    banner.style.flexWrap = "wrap";
    banner.style.borderBottom = "1px solid var(--divider)";
    banner.style.background = "rgba(214, 69, 69, 0.15)";

    if (rec) {
      var msg = document.createElement("span");
      msg.textContent =
        "Your saved data couldn't be read on load, so this browser was reset to empty. The unreadable copy was preserved \u2014 download it now and see Settings \u2192 Data Recovery for anything to do with it later.";

      var actions = document.createElement("span");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      var downloadBtn = document.createElement("button");
      downloadBtn.className = "btn btn--primary";
      downloadBtn.textContent = "Download Raw Backup";
      downloadBtn.onclick = function () {
        if (rec.key) window.PCC.store.downloadRecoveryBackup(rec.key);
      };

      var dismissBtn = document.createElement("button");
      dismissBtn.className = "btn btn--ghost";
      dismissBtn.textContent = "Dismiss";
      dismissBtn.onclick = function () {
        banner.style.display = "none";
      };

      actions.appendChild(downloadBtn);
      actions.appendChild(dismissBtn);
      banner.appendChild(msg);
      banner.appendChild(actions);
    }

    return banner;
  }

  function mount() {
    applyTheme(window.PCC.store.get().settings.theme || "dark");

    var shell = document.createElement("div");
    shell.id = "app-shell";
    shell.appendChild(buildSidebar());

    var mainCol = document.createElement("div");
    mainCol.className = "main-column";
    mainCol.appendChild(buildTitleBlock());
    mainCol.appendChild(buildCorruptionRecoveryBanner());
    mainCol.appendChild(buildBackupNudgeBanner());

    var main = document.createElement("main");
    main.className = "page";
    var outlet = document.createElement("div");
    outlet.id = "page-outlet";
    main.appendChild(outlet);
    mainCol.appendChild(main);

    mainCol.appendChild(buildFooter());
    shell.appendChild(mainCol);

    document.getElementById("root").innerHTML = "";
    document.getElementById("root").appendChild(shell);

    refreshBackupNudge();
    window.setInterval(refreshBackupNudge, 60 * 60 * 1000);

    window.PCC.store.onChange(function () {
      var status = document.getElementById("footer-save-status");
      if (status) status.textContent = "SAVED \u00b7 " + new Date().toLocaleTimeString();
      var companyEl = document.getElementById("title-block-company");
      if (companyEl) companyEl.textContent = window.PCC.store.get().settings.company_name || "\u2014";
    });
  }

  function refreshTitleBlock() {
    var companyEl = document.getElementById("title-block-company");
    if (companyEl) companyEl.textContent = window.PCC.store.get().settings.company_name || "\u2014";
    applyTheme(window.PCC.store.get().settings.theme || "dark");
  }

  window.PCC.layout = {
    mount: mount,
    setActiveNav: setActiveNav,
    refreshTitleBlock: refreshTitleBlock,
    refreshBackupNudge: refreshBackupNudge,
  };
})();
