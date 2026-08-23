(function () {
  "use strict";
  window.PCC = window.PCC || {};

  // Grouped for findability now that there are a dozen+ items. Rendered by
  // buildNavList() — shared by both the persistent desktop sidebar (Redesign Gate 4)
  // and the mobile hamburger/overlay drawer (UI/UX Overhaul Gate 2) — each group below is
  // its own mutually-exclusive expand/collapse accordion rather than always showing
  // every item at once.
  //
  // Redesign Gate 5 (Information Architecture Regrouping): replaces the earlier ad hoc
  // OVERVIEW/REGISTERS/PLANNING/OUTPUT grouping with the brief's own conceptual structure
  // (workflow-based groups matching how a Project Planner/PM actually works), mapped onto
  // PCC's real routes — no route added, removed, or renamed, only regrouped/relabeled.
  // Two items the brief lists don't exist as separate destinations and were deliberately
  // NOT created (per the brief's own "do not invent functionality merely to satisfy the
  // design" instruction, and Gate 5's own "no routes added" scope):
  //   - "Milestones" (PLANNING & SCHEDULE) — not a page; milestones are an activity_type
  //     value inside Schedule's own activities, already filterable there.
  //   - "Backup / Restore" (SYSTEM) — not a page; it's the title-block export/import icon
  //     buttons plus a Settings-level reminder banner, not a dedicated view.
  // "Issue Register" (PROJECT MANAGEMENT) also isn't a separate destination — `risks` is
  // one unified Risk/Issue/Opportunity module by design (the same "one shape, one `type`
  // field" pattern this app uses for RFI/TQ and Change Orders); kept unified rather than
  // fragmenting nav into two destinations pointing at the same dataset, per Phase A's
  // inspection note. "Progress & EVM" (PROJECT CONTROLS) similarly maps onto the existing
  // `cost` page, which already includes the EVM engine — not a separate route.
  var NAV_GROUPS = [
    {
      label: "OVERVIEW",
      items: [
        { key: "dashboard", label: "Dashboard", code: "DB" },
        { key: "myWork", label: "My Work", code: "MW" },
        { key: "actionCentre", label: "Action Centre", code: "AC" },
        { key: "portfolio", label: "Portfolio", code: "PF" },
        { key: "projectWorkspace", label: "Project Workspace", code: "PW" },
        { key: "executiveCenter", label: "Executive Center", code: "EC" },
      ],
    },
    {
      label: "PLANNING & SCHEDULE",
      items: [
        { key: "schedule", label: "Schedule", code: "SC" },
        { key: "projectLookahead", label: "Project Lookahead", code: "LA" },
        { key: "delayRecoveryDashboard", label: "Delay & Recovery Dashboard", code: "DR" },
      ],
    },
    {
      label: "PROJECT CONTROLS",
      items: [
        { key: "cost", label: "Cost Tracking", code: "CT" },
        { key: "commitments", label: "Commitments", code: "CN" },
        { key: "resources", label: "Resources", code: "RS" },
      ],
    },
    {
      label: "PROJECT MANAGEMENT",
      items: [
        { key: "risks", label: "Risk Register", code: "RK" },
        { key: "rfis", label: "RFI / TQ", code: "RQ" },
        { key: "changeOrders", label: "Change Mgmt", code: "CM" },
        { key: "decisionRegister", label: "Decision Register", code: "DE" },
        { key: "meetings", label: "Meetings", code: "MT" },
      ],
    },
    {
      label: "VENDORS",
      items: [
        { key: "vendors", label: "Vendors", code: "VN" },
        { key: "vendorPerformanceCentre", label: "Vendor Performance Centre", code: "VP" },
      ],
    },
    {
      label: "DOCUMENTS",
      items: [
        { key: "documents", label: "Documents", code: "DC" },
        { key: "documentTypes", label: "Document Types", code: "DT" },
        { key: "documentControlDashboard", label: "Document Control Dashboard", code: "DD" },
      ],
    },
    {
      label: "SITE & KNOWLEDGE",
      items: [
        { key: "dailylog", label: "Daily Log", code: "DL" },
        { key: "lessonsLearned", label: "Lessons Learned", code: "LL" },
        { key: "knowledgeBase", label: "Knowledge Base", code: "KB" },
      ],
    },
    {
      label: "REPORTING",
      items: [{ key: "reports", label: "Reports", code: "RP" }],
    },
    {
      label: "SYSTEM",
      items: [{ key: "settings", label: "Settings", code: "ST" }],
    },
  ];

  var PAGE_TITLES = {
    dashboard: "Dashboard",
    myWork: "My Work",
    actionCentre: "Planner Action Centre",
    projectLookahead: "Project Lookahead",
    portfolio: "Portfolio",
    projectWorkspace: "Project Workspace",
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

  // UI Modernization, Gate E. Replaces the shell chrome's Unicode glyphs (close, menu,
  // export, import, theme, density, focus mode) with inline SVG — scoped deliberately to
  // just these seven title-block/nav icon-btns, not a page-by-page icon rollout at the
  // time. The nav list's own two-letter codes got their own real icons later, in PCC
  // Redesign Gate 3 — see NAV_ICONS below.
  // stroke="currentColor" is the reason these need no color rule of their own: they
  // inherit .icon-btn's `color` (including the amber .icon-btn--active state) exactly the
  // way the old text glyphs did via `color` on the button itself. aria-hidden on the <svg>
  // plus the button's own pre-existing `title` attribute (every one of these buttons
  // already sets one) keeps this at least as accessible as the Unicode glyphs were, not
  // less — a screen reader announces the button's accessible name from `title`, same as
  // before, rather than trying to read a Unicode symbol aloud.
  var ICON_SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var ICONS = {
    close: '<svg ' + ICON_SVG_ATTRS + '><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    menu: '<svg ' + ICON_SVG_ATTRS + '><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    export: '<svg ' + ICON_SVG_ATTRS + '><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    import: '<svg ' + ICON_SVG_ATTRS + '><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    sun: '<svg ' + ICON_SVG_ATTRS + '><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4" y1="12" x2="2" y2="12"/><line x1="22" y1="12" x2="20" y2="12"/><line x1="5" y1="5" x2="6.5" y2="6.5"/><line x1="17.5" y1="17.5" x2="19" y2="19"/><line x1="5" y1="19" x2="6.5" y2="17.5"/><line x1="17.5" y1="6.5" x2="19" y2="5"/></svg>',
    moon: '<svg ' + ICON_SVG_ATTRS + '><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
    // Filled bars, not stroked lines like ICON_SVG_ATTRS's other icons — a first
    // real-Chromium check caught the stroked version reading as a near-duplicate of the
    // hamburger menu icon at "comfortable" spacing (3 equal-length stroked lines is what
    // both were). Filled rounded bars read as "rows of content" instead, and the
    // increasing vertical gap between bars (unchanged across this fix) still carries the
    // actual "amount of space" meaning between the three states.
    densityCompact: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="8" width="16" height="2" rx="1"/><rect x="4" y="11" width="16" height="2" rx="1"/><rect x="4" y="14" width="16" height="2" rx="1"/></svg>',
    densityComfortable: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="6" width="16" height="2" rx="1"/><rect x="4" y="11" width="16" height="2" rx="1"/><rect x="4" y="16" width="16" height="2" rx="1"/></svg>',
    densitySpacious: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="16" height="2" rx="1"/><rect x="4" y="11" width="16" height="2" rx="1"/><rect x="4" y="19" width="16" height="2" rx="1"/></svg>',
    focus: '<svg ' + ICON_SVG_ATTRS + '><polyline points="8 3 3 3 3 8"/><polyline points="16 3 21 3 21 8"/><polyline points="3 16 3 21 8 21"/><polyline points="21 16 21 21 16 21"/></svg>',
    // Redesign Gate 4 (Navigation Architecture): the persistent sidebar's own collapse/
    // expand toggle — a chevron pointing the direction the sidebar will move, plus a
    // vertical bar marking the collapsed rail's edge, the same "chevron + bar" convention
    // most desktop apps use for this control.
    sidebarCollapse: '<svg ' + ICON_SVG_ATTRS + '><polyline points="14 6 8 12 14 18"/><line x1="4" y1="4" x2="4" y2="20"/></svg>',
    sidebarExpand: '<svg ' + ICON_SVG_ATTRS + '><polyline points="10 6 16 12 10 18"/><line x1="20" y1="4" x2="20" y2="20"/></svg>',
  };

  // Redesign Gate 3 (Icon System Expansion): the nav list's own per-page icons, the
  // "separate, much bigger design effort" flagged as out of scope back in Gate E — now in
  // scope. One SVG per route key, same construction as ICONS above (stroke="currentColor",
  // 24x24 viewBox), keyed to buildNavList()'s item.key rather than item.code. item.code
  // stays in NAV_GROUPS (harmless, no longer rendered) rather than being ripped out —
  // deleting a data field a future gate might still want is a bigger, unnecessary edit for
  // a purely cosmetic change. Where two nav items are conceptually close (the four
  // Documents-family entries; meetings vs. resources as "people" icons), the base shape is
  // deliberately shared and only the secondary mark differs — the same convention real icon
  // libraries use for file-text/file-check/files, not an oversight.
  var NAV_ICONS = {
    dashboard: '<svg ' + ICON_SVG_ATTRS + '><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    myWork: '<svg ' + ICON_SVG_ATTRS + '><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8l1.5 1.5L11 7"/><line x1="13" y1="8" x2="18" y2="8"/><path d="M7 13.5l1.5 1.5L11 12.5"/><line x1="13" y1="14" x2="18" y2="14"/></svg>',
    actionCentre: '<svg ' + ICON_SVG_ATTRS + '><path d="M12 3a5 5 0 0 0-5 5v3.5c0 .8-.3 1.6-.9 2.2L4.5 15.5A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .7-1.7l-1.6-1.8c-.6-.6-.9-1.4-.9-2.2V8a5 5 0 0 0-5-5z"/><path d="M9.5 20a2.5 2.5 0 0 0 5 0"/></svg>',
    projectLookahead: '<svg ' + ICON_SVG_ATTRS + '><polyline points="6 5 12 12 6 19"/><polyline points="13 5 19 12 13 19"/></svg>',
    portfolio: '<svg ' + ICON_SVG_ATTRS + '><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/></svg>',
    projectWorkspace: '<svg ' + ICON_SVG_ATTRS + '><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    executiveCenter: '<svg ' + ICON_SVG_ATTRS + '><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/><polyline points="7 13 10 9 13 12 17 7"/></svg>',
    vendors: '<svg ' + ICON_SVG_ATTRS + '><rect x="5" y="3" width="14" height="18" rx="1"/><line x1="9" y1="7" x2="9" y2="7.01"/><line x1="15" y1="7" x2="15" y2="7.01"/><line x1="9" y1="12" x2="9" y2="12.01"/><line x1="15" y1="12" x2="15" y2="12.01"/><rect x="10" y="16" width="4" height="5"/></svg>',
    vendorPerformanceCentre: '<svg ' + ICON_SVG_ATTRS + '><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.75" fill="currentColor"/></svg>',
    documents: '<svg ' + ICON_SVG_ATTRS + '><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="14 3 14 8 19 8"/><line x1="8.5" y1="13" x2="15.5" y2="13"/><line x1="8.5" y1="16.5" x2="15.5" y2="16.5"/></svg>',
    documentTypes: '<svg ' + ICON_SVG_ATTRS + '><rect x="4" y="7" width="13" height="14" rx="1.5"/><path d="M8 7V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2"/></svg>',
    documentControlDashboard: '<svg ' + ICON_SVG_ATTRS + '><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="14 3 14 8 19 8"/><polyline points="9 14 11 16 15.5 11.5"/></svg>',
    dailylog: '<svg ' + ICON_SVG_ATTRS + '><rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/></svg>',
    risks: '<svg ' + ICON_SVG_ATTRS + '><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>',
    meetings: '<svg ' + ICON_SVG_ATTRS + '><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8" r="2.5"/><path d="M15.5 14.3c2.6.6 4.5 2.9 4.5 5.7"/></svg>',
    rfis: '<svg ' + ICON_SVG_ATTRS + '><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 1.8-2.5 3.5"/><line x1="12" y1="15.5" x2="12" y2="15.51"/></svg>',
    changeOrders: '<svg ' + ICON_SVG_ATTRS + '><polyline points="17 2 21 6 17 10"/><line x1="3" y1="6" x2="21" y2="6"/><polyline points="7 22 3 18 7 14"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    decisionRegister: '<svg ' + ICON_SVG_ATTRS + '><line x1="12" y1="3" x2="12" y2="21"/><line x1="7" y1="7" x2="17" y2="7"/><path d="M3 7l4 7a4 4 0 0 1-8 0z"/><path d="M17 7l4 7a4 4 0 0 1-8 0z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>',
    lessonsLearned: '<svg ' + ICON_SVG_ATTRS + '><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z"/></svg>',
    knowledgeBase: '<svg ' + ICON_SVG_ATTRS + '><path d="M3 5.5C3 4.7 3.7 4 4.5 4H11v16H4.5A1.5 1.5 0 0 1 3 18.5z"/><path d="M21 5.5c0-.8-.7-1.5-1.5-1.5H13v16h6.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>',
    schedule: '<svg ' + ICON_SVG_ATTRS + '><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="7" y1="14" x2="7" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="17" y1="14" x2="17" y2="14.01"/></svg>',
    delayRecoveryDashboard: '<svg ' + ICON_SVG_ATTRS + '><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 15 15"/><path d="M4.2 9A8 8 0 0 1 9 4.2"/><polyline points="3 6 4.2 9 7.2 8"/></svg>',
    cost: '<svg ' + ICON_SVG_ATTRS + '><circle cx="12" cy="12" r="9"/><path d="M12 6v12"/><path d="M15.5 9a3 3 0 0 0-3-1.5h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 1 0 5h-1a3 3 0 0 1-3-1.5"/></svg>',
    commitments: '<svg ' + ICON_SVG_ATTRS + '><path d="M6 3h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>',
    // A first real-Chromium check at actual render size found this too close to meetings'
    // 2-person icon (same "two round heads + shoulders" silhouette). A 3-person group —
    // one prominent figure in front, two smaller ones peeking from behind — reads as
    // distinctly different in overall shape/weight, not just a re-skinned duplicate.
    resources: '<svg ' + ICON_SVG_ATTRS + '><circle cx="12" cy="7" r="3"/><path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="5" cy="9" r="2.2"/><path d="M2 19c0-2.5 1.3-4.5 3-5.3"/><circle cx="19" cy="9" r="2.2"/><path d="M22 19c0-2.5-1.3-4.5-3-5.3"/></svg>',
    reports: '<svg ' + ICON_SVG_ATTRS + '><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="17" x2="9" y2="13"/><line x1="12" y1="17" x2="12" y2="11"/><line x1="15" y1="17" x2="15" y2="14"/></svg>',
    settings: '<svg ' + ICON_SVG_ATTRS + '><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>',
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
    if (icon) icon.innerHTML = current === "dark" ? ICONS.sun : ICONS.moon;
  }

  // UI/UX Overhaul, Gate 7 (Desktop/Laptop Productivity \u2014 Density Control). Same
  // pattern as applyTheme/toggleTheme above: a persisted settings.density value, a
  // data-attribute the CSS in styles.css keys off of, and an icon-btn whose glyph
  // reflects the CURRENT state (not the next one), same as the theme toggle's sun/moon.
  // Three-line icons with progressively wider gaps (see ICONS.density* above) read as
  // "amount of space" at a glance without needing a label — same idea as the original
  // block-height Unicode glyphs this replaced in Gate E, just as SVG now.
  var DENSITY_CYCLE = ["compact", "comfortable", "spacious"];
  var DENSITY_ICONS = { compact: ICONS.densityCompact, comfortable: ICONS.densityComfortable, spacious: ICONS.densitySpacious };
  var DENSITY_LABELS = { compact: "Compact", comfortable: "Comfortable", spacious: "Spacious" };

  function applyDensity(density) {
    document.documentElement.setAttribute("data-density", density);
  }

  function toggleDensity() {
    var store = window.PCC.store;
    var currentIndex = DENSITY_CYCLE.indexOf(store.get().settings.density || "comfortable");
    var next = DENSITY_CYCLE[(currentIndex + 1) % DENSITY_CYCLE.length];
    store.update(function (data) {
      data.settings.density = next;
    });
    applyDensity(next);
    var icon = document.getElementById("density-toggle-icon");
    if (icon) icon.innerHTML = DENSITY_ICONS[next];
    var btn = document.getElementById("density-toggle-btn");
    if (btn) btn.title = "Spacing density: " + DENSITY_LABELS[next] + " (click to cycle)";
  }

  // UI/UX Overhaul, Gate 7 (Desktop/Laptop Productivity — Focus Mode). Unlike
  // theme/density above, this is NOT a persisted settings value — it's a "declutter
  // while I work on this right now" state, the same "resets on reload" treatment every
  // other per-session UI toggle in this app already gets (uiState.tab and friends).
  // Global (a body-level class), not per-page, so entering it from one page and
  // navigating to another keeps the app decluttered rather than snapping back — see
  // this function's own CSS counterpart ([data-density] neighbor) for what actually
  // hides: the app footer everywhere, plus whatever a given page has tagged
  // .focus-mode-hide (its own heading/description/picker-bar chrome — never anything a
  // page needs to keep working, e.g. never a toolbar's own filter/search controls).
  var focusModeOn = false;

  function isFocusMode() {
    return focusModeOn;
  }

  function toggleFocusMode() {
    focusModeOn = !focusModeOn;
    document.body.classList.toggle("focus-mode", focusModeOn);
    var btn = document.getElementById("focus-mode-toggle-btn");
    if (btn) {
      btn.classList.toggle("icon-btn--active", focusModeOn);
      btn.title = focusModeOn ? "Exit Focus Mode" : "Enter Focus Mode (hide non-essential chrome)";
    }
  }

  function setActiveNav(routeName) {
    var links = document.querySelectorAll(".sidebar__link");
    links.forEach(function (link) {
      link.classList.toggle("active", link.getAttribute("data-route") === routeName);
    });
    var titleValue = document.getElementById("title-block-sheet");
    if (titleValue) titleValue.textContent = PAGE_TITLES[routeName] || routeName;
    // Redesign Gate 4: the persistent sidebar is built once in mount() and never torn
    // down, unlike the mobile overlay's fresh-build-every-open — so its accordion needs
    // an explicit re-sync on every route change, or navigating via a link inside a
    // collapsed group (or router.go() called from elsewhere) would leave the sidebar
    // showing the OLD group open and the new active route hidden inside a collapsed one.
    var activeGroup = NAV_GROUPS.filter(function (g) {
      return g.items.some(function (item) { return item.key === routeName; });
    })[0];
    if (activeGroup) {
      expandedGroups = {};
      expandedGroups[activeGroup.label] = true;
      syncGroupExpansionDOM();
    }
    // Every route change closes the nav overlay if it's open — covers navigation
    // triggered by something other than clicking a link inside it (e.g. a button
    // elsewhere in the page calling router.go() directly).
    closeNav();
  }

  // Which groups are expanded, keyed by group label. Populated lazily the first time
  // each group is ever built (see buildNavList below) so the group containing the
  // current route starts open — everything else starts collapsed. A manual
  // expand/collapse persists across closing and reopening the nav within the same page
  // load (this is a plain module variable, not store-backed), but resets on an actual
  // reload, same as the nav itself always starting closed on a fresh page load.
  //
  // Redesign Gate 4: accordion groups are mutually exclusive now (Aditya's explicit ask)
  // — opening one collapses whichever other group was open, rather than each group's
  // state being independent. Since the persistent sidebar (added this gate) and the
  // mobile nav overlay can both exist in the DOM using the SAME expandedGroups object,
  // re-syncing after any change needs to walk every ".sidebar__group" actually present
  // in the document rather than only the one that was clicked — see
  // syncGroupExpansionDOM(). data-group-label on each group's <li> (set in buildNavList)
  // is what lets this DOM sweep find its way back to the right expandedGroups entry.
  var expandedGroups = {};

  function syncGroupExpansionDOM() {
    document.querySelectorAll(".sidebar__group").forEach(function (groupLi) {
      var label = groupLi.getAttribute("data-group-label");
      var expanded = !!expandedGroups[label];
      groupLi.classList.toggle("sidebar__group--expanded", expanded);
      var toggle = groupLi.querySelector(".sidebar__group-toggle");
      if (toggle) toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  }

  /** Builds one fresh `<ul class="sidebar__nav">` from NAV_GROUPS as an accordion — each
   * group is a clickable header (button, with a chevron) followed by its items, shown
   * only while that group is expanded. `setActiveNav()`'s plain
   * `querySelectorAll(".sidebar__link")` sweep only runs on a ROUTE change, though, and
   * this list is rebuilt fresh every time the nav opens — well after the most recent
   * route change already happened — so links need their own "active" class set
   * correctly at build time here too, not left for the next route change to fix. */
  function buildNavList() {
    var nav = document.createElement("ul");
    nav.className = "sidebar__nav";
    var currentRoute = window.PCC.router.currentRouteName();

    NAV_GROUPS.forEach(function (group) {
      var containsActiveRoute = group.items.some(function (item) {
        return item.key === currentRoute;
      });
      if (!(group.label in expandedGroups)) {
        expandedGroups[group.label] = containsActiveRoute;
      }

      var groupLi = document.createElement("li");
      groupLi.className = "sidebar__group";
      groupLi.setAttribute("data-group-label", group.label);

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "sidebar__group-toggle";
      toggle.innerHTML =
        '<span class="sidebar__group-label">' + group.label + "</span>" +
        '<span class="sidebar__group-chevron">›</span>';

      var itemsList = document.createElement("ul");
      itemsList.className = "sidebar__group-items";

      function applyExpandedState() {
        var expanded = !!expandedGroups[group.label];
        groupLi.classList.toggle("sidebar__group--expanded", expanded);
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      }

      // Mutually exclusive: opening a group collapses whichever other one was open,
      // rather than each group's expanded state being independent (Aditya's explicit
      // ask, Gate 4). Re-syncs every ".sidebar__group" in the document, not just this
      // one, since the persistent sidebar and the mobile drawer share expandedGroups.
      toggle.onclick = function () {
        var wasExpanded = !!expandedGroups[group.label];
        expandedGroups = {};
        if (!wasExpanded) expandedGroups[group.label] = true;
        syncGroupExpansionDOM();
      };
      applyExpandedState();

      group.items.forEach(function (item) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.className = "sidebar__link" + (item.key === currentRoute ? " active" : "");
        a.href = "#/" + item.key;
        a.setAttribute("data-route", item.key);
        a.innerHTML =
          '<span class="sidebar__icon">' + (NAV_ICONS[item.key] || "") + '</span><span class="sidebar__label">' + item.label + "</span>";
        a.addEventListener("click", closeNav);
        li.appendChild(a);
        itemsList.appendChild(li);
      });

      groupLi.appendChild(toggle);
      groupLi.appendChild(itemsList);
      nav.appendChild(groupLi);
    });

    return nav;
  }

  var navKeydownHandler = null;

  function closeNav() {
    var overlay = document.getElementById("nav-overlay");
    if (overlay) overlay.remove();
    if (navKeydownHandler) {
      document.removeEventListener("keydown", navKeydownHandler);
      navKeydownHandler = null;
    }
  }

  function openNav() {
    closeNav();

    var overlay = document.createElement("div");
    overlay.id = "nav-overlay";
    overlay.className = "drawer-overlay";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeNav();
    });

    var drawer = document.createElement("div");
    drawer.className = "drawer drawer--left";

    var header = document.createElement("div");
    header.className = "drawer__header";
    var title = document.createElement("span");
    title.className = "drawer__title";
    title.textContent = "Menu";
    var closeBtn = document.createElement("button");
    closeBtn.className = "icon-btn";
    closeBtn.title = "Close menu";
    closeBtn.innerHTML = ICONS.close;
    closeBtn.onclick = closeNav;
    header.appendChild(title);
    header.appendChild(closeBtn);

    var body = document.createElement("div");
    body.className = "drawer__body";
    body.appendChild(buildNavList());

    drawer.appendChild(header);
    drawer.appendChild(body);
    overlay.appendChild(drawer);
    document.body.appendChild(overlay);

    navKeydownHandler = function (e) {
      if (e.key === "Escape") closeNav();
    };
    document.addEventListener("keydown", navKeydownHandler);
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

  /** Redesign Gate 6 (Global Project Context): the persistent "which project am I in"
   * indicator + switcher, shown in the shell header on every page so it survives route
   * changes (built once in buildTitleBlock(), refreshed in place — never torn down).
   * Picking a project here writes straight to window.PCC.projectContext, then re-renders
   * the current route so whatever page is showing picks up the new project immediately;
   * a page's own project selector (Schedule, Risk Register, etc.) writes to the same
   * shared context, so this select's value here reflects that page's own selection too
   * (kept in sync via the store.onChange listener registered in mount() below). */
  function populateProjectContextSelect(select) {
    var data = window.PCC.store.get();
    var activeProjects = data.projects.filter(function (p) {
      return !p.archived;
    });
    select.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Projects";
    select.appendChild(allOpt);
    activeProjects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      select.appendChild(opt);
    });
    select.value = window.PCC.projectContext.get();
  }

  function buildProjectContextCell() {
    var div = document.createElement("div");
    div.className = "title-block__cell";
    var lab = document.createElement("span");
    lab.className = "title-block__label";
    lab.textContent = "PROJECT";
    div.appendChild(lab);

    var select = document.createElement("select");
    select.className = "title-block__project-select";
    select.id = "title-block-project-select";
    select.title = "Current project context — carries across every project-scoped page";
    populateProjectContextSelect(select);
    select.onchange = function () {
      window.PCC.projectContext.set(select.value);
      window.PCC.router.render();
    };
    div.appendChild(select);
    return div;
  }

  function buildTitleBlock() {
    var header = document.createElement("header");
    header.className = "title-block";

    // The only way to reach navigation at any screen size — there is no persistent
    // sidebar any more (Outlook-Online-style: hidden until this is clicked, then opens
    // as an overlay, see openNav/closeNav above).
    var menuBtn = document.createElement("button");
    menuBtn.className = "icon-btn icon-btn--menu";
    menuBtn.title = "Open navigation menu";
    menuBtn.innerHTML = ICONS.menu;
    menuBtn.onclick = openNav;
    header.appendChild(menuBtn);

    header.appendChild(cell("SHEET", "Dashboard", { grow: true, id: "title-block-sheet" }));
    header.appendChild(buildProjectContextCell());

    var data = window.PCC.store.get();
    header.appendChild(cell("COMPANY", data.settings.company_name || "\u2014", { id: "title-block-company" }));
    header.appendChild(cell("DATE", new Date().toISOString().slice(0, 10)));

    var actions = document.createElement("div");
    actions.className = "title-block__actions";

    var exportBtn = document.createElement("button");
    exportBtn.className = "icon-btn";
    exportBtn.title = "Export all data to a single file";
    exportBtn.innerHTML = ICONS.export;
    exportBtn.onclick = function () {
      exportBtn.disabled = true;
      // Reuses Gate D's .spinner class directly (not loadingIndicator.buildInline(), which
      // also renders a text label with no room for one in a 32px icon button) for the same
      // "still working" feedback during the export write.
      exportBtn.innerHTML = '<span class="spinner"></span>';
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
          exportBtn.innerHTML = ICONS.export;
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
    importBtn.innerHTML = ICONS.import;
    importBtn.onclick = function () {
      importInput.click();
    };

    var themeBtn = document.createElement("button");
    themeBtn.className = "icon-btn";
    themeBtn.title = "Toggle light / dark theme";
    themeBtn.innerHTML =
      '<span id="theme-toggle-icon">' +
      (window.PCC.store.get().settings.theme === "dark" ? ICONS.sun : ICONS.moon) +
      "</span>";
    themeBtn.onclick = toggleTheme;

    var currentDensity = window.PCC.store.get().settings.density || "comfortable";
    var densityBtn = document.createElement("button");
    densityBtn.className = "icon-btn";
    densityBtn.id = "density-toggle-btn";
    densityBtn.title = "Spacing density: " + DENSITY_LABELS[currentDensity] + " (click to cycle)";
    densityBtn.innerHTML = '<span id="density-toggle-icon">' + DENSITY_ICONS[currentDensity] + "</span>";
    densityBtn.onclick = toggleDensity;

    var focusModeBtn = document.createElement("button");
    focusModeBtn.className = "icon-btn" + (focusModeOn ? " icon-btn--active" : "");
    focusModeBtn.id = "focus-mode-toggle-btn";
    focusModeBtn.title = focusModeOn ? "Exit Focus Mode" : "Enter Focus Mode (hide non-essential chrome)";
    focusModeBtn.innerHTML = ICONS.focus;
    focusModeBtn.onclick = toggleFocusMode;

    actions.appendChild(exportBtn);
    actions.appendChild(importBtn);
    actions.appendChild(importInput);
    actions.appendChild(densityBtn);
    actions.appendChild(focusModeBtn);
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
    banner.style.background = "rgba(214, 158, 46, 0.15)";
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
    banner.style.background = "rgba(229, 62, 62, 0.15)";

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

  /** Redesign Gate 4 (Navigation Architecture). Reverses UI/UX Overhaul Gate 2's revision
   * (which replaced an actual persistent sidebar with this hidden hamburger-overlay, at
   * Aditya's own explicit request then) — flagged directly during this initiative's Phase
   * A inspection as a contradiction with that earlier decision, not silently picked either
   * way, and resolved now by Aditya's own "start gate 4" call. Built once here in mount(),
   * same "built once, CSS/media-queries decide visibility" split every responsive
   * decision in this codebase already uses (.activities-mobile-cards,
   * .gantt-mobile-timeline, etc.) — only visible at >=1024px (.sidebar's own CSS media
   * query); the pre-existing hamburger + overlay drawer stays completely unchanged below
   * that, per the redesign brief's own "do not simply shrink the desktop sidebar for
   * mobile" instruction. Reuses buildNavList() as-is — the collapsed (icon-only) visual
   * state is pure CSS on top of the identical accordion DOM/JS, not a second renderer;
   * see .sidebar--collapsed in styles.css for how the accordion headers/text disappear
   * and every group forces open into a flat icon rail. */
  function buildSidebar() {
    var collapsed = !!window.PCC.store.get().settings.sidebar_collapsed;
    var sidebar = document.createElement("nav");
    sidebar.id = "app-sidebar";
    sidebar.className = "sidebar" + (collapsed ? " sidebar--collapsed" : "");

    var header = document.createElement("div");
    header.className = "sidebar__header";
    var collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "icon-btn";
    collapseBtn.id = "sidebar-collapse-btn";
    collapseBtn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    collapseBtn.innerHTML = collapsed ? ICONS.sidebarExpand : ICONS.sidebarCollapse;
    collapseBtn.onclick = toggleSidebarCollapse;
    header.appendChild(collapseBtn);
    sidebar.appendChild(header);

    sidebar.appendChild(buildNavList());
    return sidebar;
  }

  function toggleSidebarCollapse() {
    var next = !window.PCC.store.get().settings.sidebar_collapsed;
    window.PCC.store.update(function (data) {
      data.settings.sidebar_collapsed = next;
    });
    var sidebar = document.getElementById("app-sidebar");
    if (sidebar) sidebar.classList.toggle("sidebar--collapsed", next);
    var btn = document.getElementById("sidebar-collapse-btn");
    if (btn) {
      btn.title = next ? "Expand sidebar" : "Collapse sidebar";
      btn.innerHTML = next ? ICONS.sidebarExpand : ICONS.sidebarCollapse;
    }
  }

  function mount() {
    applyTheme(window.PCC.store.get().settings.theme || "dark");
    applyDensity(window.PCC.store.get().settings.density || "comfortable");

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

    // Bug fix (Daily-Use Audit, Phase 1): the "SAVED" label used to update right here,
    // synchronously the instant data changed \u2014 but the real localStorage write is
    // debounced 250ms (see store.js's scheduleSave()), so it could claim data was saved
    // before it actually had been. Show "Saving\u2026" immediately (still accurate \u2014 a write
    // really is pending), and only claim "SAVED" once store.onPersisted() confirms the
    // debounced write actually ran.
    window.PCC.store.onChange(function () {
      var status = document.getElementById("footer-save-status");
      if (status) status.textContent = "Saving\u2026";
      var companyEl = document.getElementById("title-block-company");
      if (companyEl) companyEl.textContent = window.PCC.store.get().settings.company_name || "\u2014";
      var projectSelect = document.getElementById("title-block-project-select");
      if (projectSelect) populateProjectContextSelect(projectSelect);
    });

    window.PCC.store.onPersisted(function (data, ok) {
      var status = document.getElementById("footer-save-status");
      if (status) status.textContent = ok ? "SAVED \u00b7 " + new Date().toLocaleTimeString() : "NOT SAVED \u2014 see notification";
    });
  }

  function refreshTitleBlock() {
    var companyEl = document.getElementById("title-block-company");
    if (companyEl) companyEl.textContent = window.PCC.store.get().settings.company_name || "\u2014";
    var projectSelect = document.getElementById("title-block-project-select");
    if (projectSelect) populateProjectContextSelect(projectSelect);
    applyTheme(window.PCC.store.get().settings.theme || "dark");
    applyDensity(window.PCC.store.get().settings.density || "comfortable");
  }

  window.PCC.layout = {
    mount: mount,
    setActiveNav: setActiveNav,
    refreshTitleBlock: refreshTitleBlock,
    refreshBackupNudge: refreshBackupNudge,
    isFocusMode: isFocusMode,
  };
})();
