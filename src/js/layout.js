(function () {
  "use strict";

  // Local calendar date as YYYY-MM-DD. `new Date().toISOString().slice(0, 10)` is the UTC
  // date, which in IST (UTC+5:30) still reads "yesterday" until 05:30 local time — the
  // 2026-09-24 audit found that across ~30 files. Per-file copy, per this repo's
  // per-module-helpers convention (engines are also unit-tested standalone).
  function localIsoDate(d) {
    // The user's chosen time zone (Settings → Time zone) lives in store.js's
    // window.PCC.dates; fall back to the device clock when that isn't loaded (this file is
    // also unit-tested standalone).
    if (window.PCC && window.PCC.dates) return window.PCC.dates.localIsoDate(d);
    var dt = d || new Date();
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  }
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
      label: "Overview",
      items: [
        { key: "dashboard", label: "Dashboard", code: "DB" },
        { key: "myWork", label: "My Work", code: "MW" },
        { key: "actionCentre", label: "Action Centre", code: "AC" },
        { key: "portfolio", label: "Portfolio", code: "PF" },
        { key: "organizations", label: "Companies & Clients", code: "CC" },
        { key: "projectWorkspace", label: "Project Workspace", code: "PW" },
        { key: "executiveCenter", label: "Executive Center", code: "EC" },
      ],
    },
    {
      label: "Planning & schedule",
      items: [
        { key: "schedule", label: "Schedule", code: "SC" },
        { key: "projectLookahead", label: "Project Lookahead", code: "LA" },
        { key: "delayRecoveryDashboard", label: "Delay & Recovery Dashboard", code: "DR" },
      ],
    },
    {
      label: "Project controls",
      items: [
        { key: "cost", label: "Cost Tracking", code: "CT" },
        { key: "commitments", label: "Commitments", code: "CN" },
        { key: "resources", label: "Resources", code: "RS" },
      ],
    },
    {
      label: "Project management",
      items: [
        { key: "risks", label: "Risk Register", code: "RK" },
        { key: "rfis", label: "RFI / TQ", code: "RQ" },
        { key: "changeOrders", label: "Change Mgmt", code: "CM" },
        { key: "decisionRegister", label: "Decision Register", code: "DE" },
        { key: "meetings", label: "Meetings", code: "MT" },
      ],
    },
    {
      label: "Vendors",
      items: [
        { key: "vendors", label: "Vendors", code: "VN" },
        { key: "vendorPerformanceCentre", label: "Vendor Performance Centre", code: "VP" },
      ],
    },
    {
      label: "Documents",
      items: [
        { key: "documents", label: "Documents", code: "DC" },
        { key: "documentTypes", label: "Document Types", code: "DT" },
        { key: "documentControlDashboard", label: "Document Control Dashboard", code: "DD" },
        { key: "storageManagement", label: "Storage Management", code: "SM" },
      ],
    },
    {
      label: "Site & knowledge",
      items: [
        { key: "dailylog", label: "Daily Log", code: "DL" },
        { key: "lessonsLearned", label: "Lessons Learned", code: "LL" },
        { key: "knowledgeBase", label: "Knowledge Base", code: "KB" },
      ],
    },
    {
      label: "Reporting",
      items: [{ key: "reports", label: "Reports", code: "RP" }],
    },
    {
      label: "System",
      items: [{ key: "settings", label: "Settings", code: "ST" }],
    },
  ];

  // Module accent tint (see styles.css's [data-nav-group] .title-block rules and the
  // --module-accent-* tokens): maps each NAV_GROUPS label to the CSS-attribute-safe slug
  // those rules key off of. OVERVIEW deliberately has no corresponding CSS rule (stays
  // neutral) but keeps a slug here anyway for consistency with every other group rather
  // than a special-cased empty string.
  var GROUP_SLUGS = {
    "Overview": "overview",
    "Planning & schedule": "planning",
    "Project controls": "controls",
    "Project management": "management",
    "Vendors": "vendors",
    "Documents": "documents",
    "Site & knowledge": "site",
    "Reporting": "reporting",
    "System": "system",
  };

  var PAGE_TITLES = {
    dashboard: "Dashboard",
    myWork: "My Work",
    actionCentre: "Planner Action Centre",
    projectLookahead: "Project Lookahead",
    portfolio: "Portfolio",
    organizations: "Companies & Clients",
    projectWorkspace: "Project Workspace",
    executiveCenter: "Executive Center",
    vendors: "Vendor Management",
    vendorPerformanceCentre: "Vendor Performance Centre",
    documents: "Documents",
    documentTypes: "Document Types",
    documentControlDashboard: "Document Control Dashboard",
    storageManagement: "Storage Management",
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
    // Daily-Use Audit Phase 2: title-block entry point for keyboardShortcuts.js's help
    // overlay — a plain keyboard glyph (outline + a row of keys) in the same stroke
    // vocabulary as every other icon above.
    keyboard: '<svg ' + ICON_SVG_ATTRS + '><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="6" y1="14" x2="18" y2="14"/></svg>',
    // Home button (item #6 of the follow-up feature list, 2026-09-05): every module gets
    // a one-click way back to My Work, the cross-register "what needs my attention"
    // aggregation page — not Dashboard, which is portfolio-wide KPIs, a different job.
    // Command palette (commandPalette.js): the same magnifier every "search" affordance uses.
    search: '<svg ' + ICON_SVG_ATTRS + '><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    home: '<svg ' + ICON_SVG_ATTRS + '><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  };

  // Gate 7.3: Kubai duotone icons (kubai-icons, icons-duotone/, MIT License,
  // Copyright (c) 2026 Kubai087 and the Kubai Icons contributors). Exported with the pack's
  // styles/duotone/export.mjs --size 18; the two tones became classes so both follow
  // currentColor (styles.css: .duo-body at 0.3 opacity, .duo-mark solid). Static, no motion.
  // Route -> icon map: .claude/docs/DESIGN_SYSTEM.md (Lookahead, Change Mgmt and Storage
  // Management use fast-forward / arrow-left-right / hard-drive instead of a redraw).
  var KUBAI_OPEN = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">';
  var NAV_ICONS = {
    dashboard: KUBAI_OPEN + '<g transform="translate(8 8) scale(1.083) translate(-8 -8)"><path class="duo-body" d="M2 3.667C2 3.057 2 2.586 2.293 2.293C2.586 2 3.057 2 3.667 2L3.667 2C4.276 2 4.748 2 5.04 2.293C5.333 2.586 5.333 3.057 5.333 3.667L5.333 3.667C5.333 4.276 5.333 4.748 5.04 5.04C4.748 5.333 4.276 5.333 3.667 5.333L3.667 5.333C3.057 5.333 2.586 5.333 2.293 5.04C2 4.748 2 4.276 2 3.667ZM2 8C2 7.39 2 6.919 2.293 6.626C2.586 6.333 3.057 6.333 3.667 6.333L3.667 6.333C4.276 6.333 4.748 6.333 5.04 6.626C5.333 6.919 5.333 7.39 5.333 8L5.333 8C5.333 8.61 5.333 9.081 5.04 9.374C4.748 9.667 4.276 9.667 3.667 9.667L3.667 9.667C3.057 9.667 2.586 9.667 2.293 9.374C2 9.081 2 8.61 2 8ZM2 12.333C2 11.724 2 11.252 2.293 10.96C2.586 10.667 3.057 10.667 3.667 10.667L3.667 10.667C4.276 10.667 4.748 10.667 5.04 10.96C5.333 11.252 5.333 11.724 5.333 12.333L5.333 12.333C5.333 12.943 5.333 13.414 5.04 13.707C4.748 14 4.276 14 3.667 14L3.667 14C3.057 14 2.586 14 2.293 13.707C2 13.414 2 12.943 2 12.333ZM6.333 3.667C6.333 3.057 6.333 2.586 6.626 2.293C6.919 2 7.39 2 8 2L8 2C8.61 2 9.081 2 9.374 2.293C9.667 2.586 9.667 3.057 9.667 3.667L9.667 3.667C9.667 4.276 9.667 4.748 9.374 5.04C9.081 5.333 8.61 5.333 8 5.333L8 5.333C7.39 5.333 6.919 5.333 6.626 5.04C6.333 4.748 6.333 4.276 6.333 3.667ZM6.333 12.333C6.333 11.724 6.333 11.252 6.626 10.96C6.919 10.667 7.39 10.667 8 10.667L8 10.667C8.61 10.667 9.081 10.667 9.374 10.96C9.667 11.252 9.667 11.724 9.667 12.333L9.667 12.333C9.667 12.943 9.667 13.414 9.374 13.707C9.081 14 8.61 14 8 14L8 14C7.39 14 6.919 14 6.626 13.707C6.333 13.414 6.333 12.943 6.333 12.333ZM10.667 3.667C10.667 3.057 10.667 2.586 10.96 2.293C11.252 2 11.724 2 12.333 2L12.333 2C12.943 2 13.414 2 13.707 2.293C14 2.586 14 3.057 14 3.667L14 3.667C14 4.276 14 4.748 13.707 5.04C13.414 5.333 12.943 5.333 12.333 5.333L12.333 5.333C11.724 5.333 11.252 5.333 10.96 5.04C10.667 4.748 10.667 4.276 10.667 3.667ZM10.667 8C10.667 7.39 10.667 6.919 10.96 6.626C11.252 6.333 11.724 6.333 12.333 6.333L12.333 6.333C12.943 6.333 13.414 6.333 13.707 6.626C14 6.919 14 7.39 14 8L14 8C14 8.61 14 9.081 13.707 9.374C13.414 9.667 12.943 9.667 12.333 9.667L12.333 9.667C11.724 9.667 11.252 9.667 10.96 9.374C10.667 9.081 10.667 8.61 10.667 8ZM10.667 12.333C10.667 11.724 10.667 11.252 10.96 10.96C11.252 10.667 11.724 10.667 12.333 10.667L12.333 10.667C12.943 10.667 13.414 10.667 13.707 10.96C14 11.252 14 11.724 14 12.333L14 12.333C14 12.943 14 13.414 13.707 13.707C13.414 14 12.943 14 12.333 14L12.333 14C11.724 14 11.252 14 10.96 13.707C10.667 13.414 10.667 12.943 10.667 12.333Z" fill="currentColor"/><path class="duo-mark" d="M6.333 8C6.333 7.39 6.333 6.919 6.626 6.626C6.919 6.333 7.39 6.333 8 6.333L8 6.333C8.61 6.333 9.081 6.333 9.374 6.626C9.667 6.919 9.667 7.39 9.667 8L9.667 8C9.667 8.61 9.667 9.081 9.374 9.374C9.081 9.667 8.61 9.667 8 9.667L8 9.667C7.39 9.667 6.919 9.667 6.626 9.374C6.333 9.081 6.333 8.61 6.333 8Z" fill="currentColor"/></g></svg>', // grid
    myWork: KUBAI_OPEN + '<path class="duo-mark" d="M1.75 4L3.75 6L7 2.75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path class="duo-mark" d="M1.75 11.25L3.75 13.25L7 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path class="duo-body" d="M8.28 4.375C8.28 3.685 8.84 3.125 9.53 3.125L13.75 3.125C14.44 3.125 15 3.685 15 4.375L15 4.375C15 5.065 14.44 5.625 13.75 5.625L9.53 5.625C8.84 5.625 8.28 5.065 8.28 4.375ZM8.28 11.625C8.28 10.935 8.84 10.375 9.53 10.375L13.75 10.375C14.44 10.375 15 10.935 15 11.625L15 11.625C15 12.315 14.44 12.875 13.75 12.875L9.53 12.875C8.84 12.875 8.28 12.315 8.28 11.625Z" fill="currentColor"/></svg>', // list-checks
    actionCentre: KUBAI_OPEN + '<defs><mask id="bell-gap1" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M6.75 3.25A1.25 1.25 0 1 1 9.25 3.25A1.25 1.25 0 1 1 6.75 3.25ZM6.25 12.639C6.25 12.424 6.424 12.25 6.639 12.25L9.361 12.25C9.576 12.25 9.75 12.424 9.75 12.639L9.75 12.639C9.75 13.391 9.141 14 8.389 14L7.611 14C6.859 14 6.25 13.391 6.25 12.639Z" fill="#000" stroke="#000" stroke-width="1.846" stroke-linejoin="round"/></mask></defs><g transform="translate(8 8) scale(1.083) translate(-8 -8)"><g mask="url(#bell-gap1)"><path class="duo-body" d="M3 10.5V8a5 5 0 0 1 10 0V10.5ZM2 10.5C2 10.086 2.336 9.75 2.75 9.75L13.25 9.75C13.664 9.75 14 10.086 14 10.5L14 10.5C14 10.914 13.664 11.25 13.25 11.25L2.75 11.25C2.336 11.25 2 10.914 2 10.5Z" fill="currentColor"/></g><path class="duo-mark" d="M6.75 3.25A1.25 1.25 0 1 1 9.25 3.25A1.25 1.25 0 1 1 6.75 3.25ZM6.25 12.639C6.25 12.424 6.424 12.25 6.639 12.25L9.361 12.25C9.576 12.25 9.75 12.424 9.75 12.639L9.75 12.639C9.75 13.391 9.141 14 8.389 14L7.611 14C6.859 14 6.25 13.391 6.25 12.639Z" fill="currentColor"/></g></svg>', // bell
    projectLookahead: KUBAI_OPEN + '<path class="duo-body" d="M1 8A7 7 0 1 1 15 8A7 7 0 1 1 1 8Z" fill="currentColor"/><path class="duo-mark" d="M4 8C4 6.881 4 6.324 4.422 6.119C4.844 5.913 5.283 6.258 6.162 6.949L6.162 6.949C6.707 7.377 7.036 7.635 7.036 8C7.036 8.365 6.707 8.623 6.162 9.051L6.162 9.051C5.283 9.742 4.844 10.087 4.422 9.881C4 9.676 4 9.119 4 8Z" fill="currentColor"/><path class="duo-mark" d="M8.5 8C8.5 6.881 8.5 6.324 8.922 6.119C9.344 5.913 9.783 6.258 10.662 6.949L10.662 6.949C11.207 7.377 11.536 7.635 11.536 8C11.536 8.365 11.207 8.623 10.662 9.051L10.662 9.051C9.783 9.742 9.344 10.087 8.922 9.881C8.5 9.676 8.5 9.119 8.5 8Z" fill="currentColor"/></svg>', // fast-forward
    portfolio: KUBAI_OPEN + '<defs><mask id="briefcase-gap1" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M1 9.1C1 7.614 1 6.672 1.586 6.086C2.172 5.5 3.114 5.5 4.6 5.5L11.4 5.5C12.886 5.5 13.828 5.5 14.414 6.086C15 6.672 15 7.614 15 9.1L15 10.4C15 11.886 15 12.828 14.414 13.414C13.828 14 12.886 14 11.4 14L4.6 14C3.114 14 2.172 14 1.586 13.414C1 12.828 1 11.886 1 10.4Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/></mask></defs><g mask="url(#briefcase-gap1)"><path class="duo-mark" d="M5.75 6V3.75A1 1 0 0 1 6.75 2.75H9.25A1 1 0 0 1 10.25 3.75V6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g><path class="duo-body" d="M1 9.1C1 7.614 1 6.672 1.586 6.086C2.172 5.5 3.114 5.5 4.6 5.5L11.4 5.5C12.886 5.5 13.828 5.5 14.414 6.086C15 6.672 15 7.614 15 9.1L15 10.4C15 11.886 15 12.828 14.414 13.414C13.828 14 12.886 14 11.4 14L4.6 14C3.114 14 2.172 14 1.586 13.414C1 12.828 1 11.886 1 10.4Z" fill="currentColor"/><path class="duo-mark" d="M6.5 9.75C6.5 9.557 6.5 9.086 6.793 8.793C7.086 8.5 7.557 8.5 7.75 8.5L8.25 8.5C8.443 8.5 8.914 8.5 9.207 8.793C9.5 9.086 9.5 9.557 9.5 9.75L9.5 9.75C9.5 9.943 9.5 10.414 9.207 10.707C8.914 11 8.443 11 8.25 11L7.75 11C7.557 11 7.086 11 6.793 10.707C6.5 10.414 6.5 9.943 6.5 9.75Z" fill="currentColor"/></svg>', // briefcase
    organizations: KUBAI_OPEN + '<defs><clipPath id="building-office-clip4" clipPathUnits="userSpaceOnUse"><path d="M3 5.5C3 3.643 3 2.464 3.732 1.732C4.464 1 5.643 1 7.5 1L8.5 1C10.357 1 11.536 1 12.268 1.732C13 2.464 13 3.643 13 5.5L13 10.5C13 12.357 13 13.536 12.268 14.268C11.536 15 10.357 15 8.5 15L7.5 15C5.643 15 4.464 15 3.732 14.268C3 13.536 3 12.357 3 10.5Z"/></clipPath></defs><path class="duo-body" d="M3 5.5C3 3.643 3 2.464 3.732 1.732C4.464 1 5.643 1 7.5 1L8.5 1C10.357 1 11.536 1 12.268 1.732C13 2.464 13 3.643 13 5.5L13 10.5C13 12.357 13 13.536 12.268 14.268C11.536 15 10.357 15 8.5 15L7.5 15C5.643 15 4.464 15 3.732 14.268C3 13.536 3 12.357 3 10.5Z" fill="currentColor"/><path class="duo-mark" d="M5 8.625C5 8.28 5.28 8 5.625 8L6.875 8C7.22 8 7.5 8.28 7.5 8.625L7.5 8.625C7.5 8.97 7.22 9.25 6.875 9.25L5.625 9.25C5.28 9.25 5 8.97 5 8.625ZM8.5 8.625C8.5 8.28 8.78 8 9.125 8L10.375 8C10.72 8 11 8.28 11 8.625L11 8.625C11 8.97 10.72 9.25 10.375 9.25L9.125 9.25C8.78 9.25 8.5 8.97 8.5 8.625Z" fill="currentColor"/><path class="duo-mark" d="M5 6.125C5 5.78 5.28 5.5 5.625 5.5L6.875 5.5C7.22 5.5 7.5 5.78 7.5 6.125L7.5 6.125C7.5 6.47 7.22 6.75 6.875 6.75L5.625 6.75C5.28 6.75 5 6.47 5 6.125ZM8.5 6.125C8.5 5.78 8.78 5.5 9.125 5.5L10.375 5.5C10.72 5.5 11 5.78 11 6.125L11 6.125C11 6.47 10.72 6.75 10.375 6.75L9.125 6.75C8.78 6.75 8.5 6.47 8.5 6.125Z" fill="currentColor"/><path class="duo-mark" d="M5 3.625C5 3.28 5.28 3 5.625 3L6.875 3C7.22 3 7.5 3.28 7.5 3.625L7.5 3.625C7.5 3.97 7.22 4.25 6.875 4.25L5.625 4.25C5.28 4.25 5 3.97 5 3.625ZM8.5 3.625C8.5 3.28 8.78 3 9.125 3L10.375 3C10.72 3 11 3.28 11 3.625L11 3.625C11 3.97 10.72 4.25 10.375 4.25L9.125 4.25C8.78 4.25 8.5 3.97 8.5 3.625Z" fill="currentColor"/><g clip-path="url(#building-office-clip4)"><path class="duo-mark" d="M6.75 12.25C6.75 11.56 7.31 11 8 11L8 11C8.69 11 9.25 11.56 9.25 12.25L9.25 15L6.75 15Z" fill="currentColor"/></g></svg>', // building-office
    projectWorkspace: KUBAI_OPEN + '<path class="duo-body" d="M7.177 2.223C7.517 2.09 7.763 1.993 8 1.993C8.237 1.993 8.483 2.09 8.823 2.223L10.735 2.975C12.496 3.666 13.265 3.968 13.265 4.65C13.265 5.332 12.496 5.634 10.735 6.325L8.823 7.077C8.483 7.21 8.237 7.307 8 7.307C7.763 7.307 7.517 7.21 7.177 7.077L5.265 6.325C3.504 5.634 2.735 5.332 2.735 4.65C2.735 3.968 3.504 3.666 5.265 2.975Z" fill="currentColor"/><path class="duo-mark" d="M1 7.26C1 6.887 1 6.428 1.328 6.205C1.655 5.981 2.083 6.149 2.43 6.286L7.342 8.215C7.614 8.322 7.811 8.4 8 8.4C8.189 8.4 8.386 8.322 8.658 8.215L13.57 6.286C13.917 6.149 14.345 5.981 14.672 6.205C15 6.428 15 6.887 15 7.26L15 7.26C15 7.434 15 7.694 14.87 7.885C14.739 8.076 14.497 8.172 14.336 8.235L8.658 10.465C8.386 10.572 8.189 10.65 8 10.65C7.811 10.65 7.614 10.572 7.342 10.465L1.664 8.235C1.503 8.172 1.261 8.076 1.13 7.885C1 7.694 1 7.434 1 7.26Z" fill="currentColor"/><path class="duo-body" d="M1 10.584C1 10.211 1 9.752 1.328 9.529C1.655 9.305 2.083 9.473 2.43 9.61L7.342 11.539C7.614 11.646 7.811 11.724 8 11.724C8.189 11.724 8.386 11.646 8.658 11.539L13.57 9.61C13.917 9.473 14.345 9.305 14.672 9.529C15 9.752 15 10.211 15 10.584L15 10.584C15 10.758 15 11.018 14.87 11.209C14.739 11.4 14.497 11.496 14.336 11.559L8.658 13.789C8.386 13.896 8.189 13.974 8 13.974C7.811 13.974 7.614 13.896 7.342 13.789L1.664 11.559C1.503 11.496 1.261 11.4 1.13 11.209C1 11.018 1 10.758 1 10.584Z" fill="currentColor"/></svg>', // layers
    executiveCenter: KUBAI_OPEN + '<g transform="translate(8 8) scale(1.083) translate(-8 -8)"><path class="duo-body" d="M2 9.167C2 8.557 2 8.086 2.293 7.793C2.586 7.5 3.057 7.5 3.667 7.5L3.667 7.5C4.276 7.5 4.748 7.5 5.04 7.793C5.333 8.086 5.333 8.557 5.333 9.167L5.333 12.333C5.333 12.943 5.333 13.414 5.04 13.707C4.748 14 4.276 14 3.667 14L3.667 14C3.057 14 2.586 14 2.293 13.707C2 13.414 2 12.943 2 12.333Z" fill="currentColor"/><path class="duo-mark" d="M6.333 3.667C6.333 3.057 6.333 2.586 6.626 2.293C6.919 2 7.39 2 8 2L8 2C8.61 2 9.081 2 9.374 2.293C9.667 2.586 9.667 3.057 9.667 3.667L9.667 12.333C9.667 12.943 9.667 13.414 9.374 13.707C9.081 14 8.61 14 8 14L8 14C7.39 14 6.919 14 6.626 13.707C6.333 13.414 6.333 12.943 6.333 12.333Z" fill="currentColor"/><path class="duo-body" d="M10.667 6.667C10.667 6.057 10.667 5.586 10.96 5.293C11.252 5 11.724 5 12.333 5L12.333 5C12.943 5 13.414 5 13.707 5.293C14 5.586 14 6.057 14 6.667L14 12.333C14 12.943 14 13.414 13.707 13.707C13.414 14 12.943 14 12.333 14L12.333 14C11.724 14 11.252 14 10.96 13.707C10.667 13.414 10.667 12.943 10.667 12.333Z" fill="currentColor"/></g></svg>', // chart-bar
    vendors: KUBAI_OPEN + '<defs><clipPath id="truck-clip2" clipPathUnits="userSpaceOnUse"><path d="M12.25 0L16.25 0L16.25 7.75L12.25 7.75Z"/></clipPath><mask id="truck-gap3" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M2.25 11.25A2.25 2.25 0 1 1 6.75 11.25A2.25 2.25 0 1 1 2.25 11.25ZM10.5 11.25A2.25 2.25 0 1 1 15 11.25A2.25 2.25 0 1 1 10.5 11.25Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/></mask><mask id="truck-cut3" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M3.625 11.25A0.875 0.875 0 1 1 5.375 11.25A0.875 0.875 0 1 1 3.625 11.25Z" fill="#000"/><path d="M11.875 11.25A0.875 0.875 0 1 1 13.625 11.25A0.875 0.875 0 1 1 11.875 11.25Z" fill="#000"/></mask></defs><g mask="url(#truck-gap3)"><path class="duo-body" d="M1 6.1C1 4.614 1 3.672 1.586 3.086C2.172 2.5 3.114 2.5 4.6 2.5L6.4 2.5C7.886 2.5 8.828 2.5 9.414 3.086C10 3.672 10 4.614 10 6.1L10 7.9C10 9.386 10 10.328 9.414 10.914C8.828 11.5 7.886 11.5 6.4 11.5L4.6 11.5C3.114 11.5 2.172 11.5 1.586 10.914C1 10.328 1 9.386 1 7.9Z" fill="currentColor"/></g><g mask="url(#truck-gap3)"><path class="duo-body" d="M11 6.6C11 6.057 11 5.586 11.293 5.293C11.586 5 12.057 5 12.6 5L12.6 5C13.415 5 14.121 5 14.561 5.439C15 5.879 15 6.585 15 7.4L15 9.1C15 9.915 15 10.621 14.561 11.061C14.121 11.5 13.415 11.5 12.6 11.5L12.6 11.5C12.057 11.5 11.586 11.5 11.293 11.207C11 10.914 11 10.443 11 9.9Z" fill="currentColor"/></g><g mask="url(#truck-gap3)"><g clip-path="url(#truck-clip2)"><path class="duo-mark" d="M11 6.6C11 6.057 11 5.586 11.293 5.293C11.586 5 12.057 5 12.6 5L12.6 5C13.415 5 14.121 5 14.561 5.439C15 5.879 15 6.585 15 7.4L15 9.1C15 9.915 15 10.621 14.561 11.061C14.121 11.5 13.415 11.5 12.6 11.5L12.6 11.5C12.057 11.5 11.586 11.5 11.293 11.207C11 10.914 11 10.443 11 9.9Z" fill="currentColor"/></g></g><g mask="url(#truck-cut3)"><path class="duo-mark" d="M2.25 11.25A2.25 2.25 0 1 1 6.75 11.25A2.25 2.25 0 1 1 2.25 11.25ZM10.5 11.25A2.25 2.25 0 1 1 15 11.25A2.25 2.25 0 1 1 10.5 11.25Z" fill="currentColor"/></g></svg>', // truck
    vendorPerformanceCentre: KUBAI_OPEN + '<g transform="translate(8 8) scale(1.083) translate(-8 -8)"><path class="duo-body" d="M2 6.5C2 4.643 2 3.464 2.732 2.732C3.464 2 4.643 2 6.5 2L9.5 2C11.357 2 12.536 2 13.268 2.732C14 3.464 14 4.643 14 6.5L14 9.5C14 11.357 14 12.536 13.268 13.268C12.536 14 11.357 14 9.5 14L6.5 14C4.643 14 3.464 14 2.732 13.268C2 12.536 2 11.357 2 9.5Z" fill="currentColor"/><path class="duo-mark" d="M4.5 10.75L6.75 7.25L9.25 9.25L11.5 5.25" fill="none" stroke="currentColor" stroke-width="1.385" stroke-linecap="round" stroke-linejoin="round"/></g></svg>', // chart-line
    documents: KUBAI_OPEN + '<defs><mask id="folder-gap1" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M1 4.7C1 3.586 1 2.879 1.439 2.439C1.879 2 2.586 2 3.7 2L5 2C5.415 2 6.121 2 6.561 2.439C7 2.879 7 3.586 7 4L7 4L10.5 4C12.357 4 13.536 4 14.268 4.732C15 5.464 15 6.643 15 8.5L15 9.5C15 11.357 15 12.536 14.268 13.268C13.536 14 12.357 14 10.5 14L5.5 14C3.643 14 2.464 14 1.732 13.268C1 12.536 1 11.357 1 9.5Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/></mask></defs><g mask="url(#folder-gap1)"><path class="duo-mark" d="M6.5 8.2C6.5 7.085 6.5 6.379 6.939 5.939C7.379 5.5 8.085 5.5 9.2 5.5L10.3 5.5C11.415 5.5 12.121 5.5 12.561 5.939C13 6.379 13 7.085 13 8.2L13 9.3C13 10.415 13 11.121 12.561 11.561C12.121 12 11.415 12 10.3 12L9.2 12C8.085 12 7.379 12 6.939 11.561C6.5 11.121 6.5 10.415 6.5 9.3Z" fill="currentColor"/></g><path class="duo-body" d="M1 4.7C1 3.586 1 2.879 1.439 2.439C1.879 2 2.586 2 3.7 2L5 2C5.415 2 6.121 2 6.561 2.439C7 2.879 7 3.586 7 4L7 4L10.5 4C12.357 4 13.536 4 14.268 4.732C15 5.464 15 6.643 15 8.5L15 9.5C15 11.357 15 12.536 14.268 13.268C13.536 14 12.357 14 10.5 14L5.5 14C3.643 14 2.464 14 1.732 13.268C1 12.536 1 11.357 1 9.5Z" fill="currentColor"/><path class="duo-mark" d="M9 11.375C9 11.03 9.28 10.75 9.625 10.75L12.375 10.75C12.72 10.75 13 11.03 13 11.375L13 11.375C13 11.72 12.72 12 12.375 12L9.625 12C9.28 12 9 11.72 9 11.375Z" fill="currentColor"/></svg>', // folder
    documentTypes: KUBAI_OPEN + '<path class="duo-body" d="M2 4.6C2 3.114 2 2.172 2.586 1.586C3.172 1 4.114 1 5.6 1L10.4 1C11.886 1 12.828 1 13.414 1.586C14 2.172 14 3.114 14 4.6L14 11.4C14 12.886 14 13.828 13.414 14.414C12.828 15 11.886 15 10.4 15L5.6 15C4.114 15 3.172 15 2.586 14.414C2 13.828 2 12.886 2 11.4Z" fill="currentColor"/><path class="duo-mark" d="M5 5.875C5 5.53 5.28 5.25 5.625 5.25L10.375 5.25C10.72 5.25 11 5.53 11 5.875L11 5.875C11 6.22 10.72 6.5 10.375 6.5L5.625 6.5C5.28 6.5 5 6.22 5 5.875Z" fill="currentColor"/><path class="duo-mark" d="M5 8.5C5 8.155 5.28 7.875 5.625 7.875L10.375 7.875C10.72 7.875 11 8.155 11 8.5L11 8.5C11 8.845 10.72 9.125 10.375 9.125L5.625 9.125C5.28 9.125 5 8.845 5 8.5Z" fill="currentColor"/><path class="duo-mark" d="M5 11.125C5 10.78 5.28 10.5 5.625 10.5L7.875 10.5C8.22 10.5 8.5 10.78 8.5 11.125L8.5 11.125C8.5 11.47 8.22 11.75 7.875 11.75L5.625 11.75C5.28 11.75 5 11.47 5 11.125Z" fill="currentColor"/></svg>', // file-text
    documentControlDashboard: KUBAI_OPEN + '<defs><mask id="clipboard-gap1" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M5 2.5C5 2.057 5 1.586 5.293 1.293C5.586 1 6.057 1 6.5 1L9.5 1C9.943 1 10.414 1 10.707 1.293C11 1.586 11 2.057 11 2.5L11 2.5C11 2.943 11 3.414 10.707 3.707C10.414 4 9.943 4 9.5 4L6.5 4C6.057 4 5.586 4 5.293 3.707C5 3.414 5 2.943 5 2.5Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/></mask></defs><g mask="url(#clipboard-gap1)"><path class="duo-body" d="M2 6.1C2 4.614 2 3.672 2.586 3.086C3.172 2.5 4.114 2.5 5.6 2.5L10.4 2.5C11.886 2.5 12.828 2.5 13.414 3.086C14 3.672 14 4.614 14 6.1L14 11.4C14 12.886 14 13.828 13.414 14.414C12.828 15 11.886 15 10.4 15L5.6 15C4.114 15 3.172 15 2.586 14.414C2 13.828 2 12.886 2 11.4Z" fill="currentColor"/></g><path class="duo-mark" d="M5 2.5C5 2.057 5 1.586 5.293 1.293C5.586 1 6.057 1 6.5 1L9.5 1C9.943 1 10.414 1 10.707 1.293C11 1.586 11 2.057 11 2.5L11 2.5C11 2.943 11 3.414 10.707 3.707C10.414 4 9.943 4 9.5 4L6.5 4C6.057 4 5.586 4 5.293 3.707C5 3.414 5 2.943 5 2.5Z" fill="currentColor"/><path class="duo-mark" d="M5 7.875C5 7.53 5.28 7.25 5.625 7.25L10.375 7.25C10.72 7.25 11 7.53 11 7.875L11 7.875C11 8.22 10.72 8.5 10.375 8.5L5.625 8.5C5.28 8.5 5 8.22 5 7.875Z" fill="currentColor"/><path class="duo-mark" d="M5 10.5C5 10.155 5.28 9.875 5.625 9.875L7.875 9.875C8.22 9.875 8.5 10.155 8.5 10.5L8.5 10.5C8.5 10.845 8.22 11.125 7.875 11.125L5.625 11.125C5.28 11.125 5 10.845 5 10.5Z" fill="currentColor"/></svg>', // clipboard
    storageManagement: KUBAI_OPEN + '<path class="duo-body" d="M1 7C1 5.143 1 3.964 1.732 3.232C2.464 2.5 3.643 2.5 5.5 2.5L10.5 2.5C12.357 2.5 13.536 2.5 14.268 3.232C15 3.964 15 5.143 15 7L15 9C15 10.857 15 12.036 14.268 12.768C13.536 13.5 12.357 13.5 10.5 13.5L5.5 13.5C3.643 13.5 2.464 13.5 1.732 12.768C1 12.036 1 10.857 1 9Z" fill="currentColor"/><path class="duo-mark" d="M3.375 10.5C3.375 10.155 3.655 9.875 4 9.875L6.75 9.875C7.095 9.875 7.375 10.155 7.375 10.5L7.375 10.5C7.375 10.845 7.095 11.125 6.75 11.125L4 11.125C3.655 11.125 3.375 10.845 3.375 10.5Z" fill="currentColor"/><path class="duo-mark" d="M9.125 10.5A0.625 0.625 0 1 1 10.375 10.5A0.625 0.625 0 1 1 9.125 10.5Z" fill="currentColor"/><path class="duo-mark" d="M11.375 10.5A0.625 0.625 0 1 1 12.625 10.5A0.625 0.625 0 1 1 11.375 10.5Z" fill="currentColor"/></svg>', // hard-drive
    dailylog: KUBAI_OPEN + '<defs><mask id="notebook-gap2" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M2 4C2 3.655 2.28 3.375 2.625 3.375L4.375 3.375C4.72 3.375 5 3.655 5 4L5 4C5 4.345 4.72 4.625 4.375 4.625L2.625 4.625C2.28 4.625 2 4.345 2 4ZM2 8C2 7.655 2.28 7.375 2.625 7.375L4.375 7.375C4.72 7.375 5 7.655 5 8L5 8C5 8.345 4.72 8.625 4.375 8.625L2.625 8.625C2.28 8.625 2 8.345 2 8ZM2 12C2 11.655 2.28 11.375 2.625 11.375L4.375 11.375C4.72 11.375 5 11.655 5 12L5 12C5 12.345 4.72 12.625 4.375 12.625L2.625 12.625C2.28 12.625 2 12.345 2 12Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/></mask></defs><g mask="url(#notebook-gap2)"><path class="duo-body" d="M3.5 4.6C3.5 3.114 3.5 2.172 4.086 1.586C4.672 1 5.614 1 7.1 1L10.4 1C11.886 1 12.828 1 13.414 1.586C14 2.172 14 3.114 14 4.6L14 11.4C14 12.886 14 13.828 13.414 14.414C12.828 15 11.886 15 10.4 15L7.1 15C5.614 15 4.672 15 4.086 14.414C3.5 13.828 3.5 12.886 3.5 11.4Z" fill="currentColor"/></g><g mask="url(#notebook-gap2)"><path class="duo-mark" d="M7.25 5.625C7.25 5.28 7.53 5 7.875 5L10.625 5C10.97 5 11.25 5.28 11.25 5.625L11.25 5.625C11.25 5.97 10.97 6.25 10.625 6.25L7.875 6.25C7.53 6.25 7.25 5.97 7.25 5.625Z" fill="currentColor"/></g><path class="duo-mark" d="M2 4C2 3.655 2.28 3.375 2.625 3.375L4.375 3.375C4.72 3.375 5 3.655 5 4L5 4C5 4.345 4.72 4.625 4.375 4.625L2.625 4.625C2.28 4.625 2 4.345 2 4ZM2 8C2 7.655 2.28 7.375 2.625 7.375L4.375 7.375C4.72 7.375 5 7.655 5 8L5 8C5 8.345 4.72 8.625 4.375 8.625L2.625 8.625C2.28 8.625 2 8.345 2 8ZM2 12C2 11.655 2.28 11.375 2.625 11.375L4.375 11.375C4.72 11.375 5 11.655 5 12L5 12C5 12.345 4.72 12.625 4.375 12.625L2.625 12.625C2.28 12.625 2 12.345 2 12Z" fill="currentColor"/></svg>', // notebook
    risks: KUBAI_OPEN + '<path class="duo-body" d="M4.913 5.145C6.187 3.021 6.868 1.887 8 1.887C9.132 1.887 9.813 3.021 11.087 5.145L13.129 8.548C14.479 10.798 15.182 11.971 14.608 12.985C14.034 14 12.666 14 10.042 14L5.958 14C3.334 14 1.966 14 1.392 12.985C0.818 11.971 1.521 10.798 2.871 8.548Z" fill="currentColor"/><path class="duo-mark" d="M8 6V8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path class="duo-mark" d="M6.875 11.375A1.125 1.125 0 1 1 9.125 11.375A1.125 1.125 0 1 1 6.875 11.375Z" fill="currentColor"/></svg>', // triangle-alert
    meetings: KUBAI_OPEN + '<defs><mask id="messages-square-gap1" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M1 9.6C1 8.114 1 7.172 1.586 6.586C2.172 6 3.114 6 4.6 6L7.4 6C8.886 6 9.828 6 10.414 6.586C11 7.172 11 8.114 11 9.6L11 10.4C11 11.886 11 12.828 10.414 13.414C9.828 14 8.886 14 7.4 14L1 14Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/></mask></defs><g mask="url(#messages-square-gap1)"><path class="duo-mark" d="M5 5.6C5 4.114 5 3.172 5.586 2.586C6.172 2 7.114 2 8.6 2L11.4 2C12.886 2 13.828 2 14.414 2.586C15 3.172 15 4.114 15 5.6L15 10L8.6 10C7.114 10 6.172 10 5.586 9.414C5 8.828 5 7.886 5 6.4Z" fill="currentColor"/></g><path class="duo-body" d="M1 9.6C1 8.114 1 7.172 1.586 6.586C2.172 6 3.114 6 4.6 6L7.4 6C8.886 6 9.828 6 10.414 6.586C11 7.172 11 8.114 11 9.6L11 10.4C11 11.886 11 12.828 10.414 13.414C9.828 14 8.886 14 7.4 14L1 14Z" fill="currentColor"/><path class="duo-mark" d="M3.25 8.875C3.25 8.53 3.53 8.25 3.875 8.25L7.625 8.25C7.97 8.25 8.25 8.53 8.25 8.875L8.25 8.875C8.25 9.22 7.97 9.5 7.625 9.5L3.875 9.5C3.53 9.5 3.25 9.22 3.25 8.875Z" fill="currentColor"/><path class="duo-mark" d="M3.25 11.125C3.25 10.78 3.53 10.5 3.875 10.5L5.625 10.5C5.97 10.5 6.25 10.78 6.25 11.125L6.25 11.125C6.25 11.47 5.97 11.75 5.625 11.75L3.875 11.75C3.53 11.75 3.25 11.47 3.25 11.125Z" fill="currentColor"/></svg>', // messages-square
    rfis: KUBAI_OPEN + '<path class="duo-body" d="M1 8A7 7 0 1 1 15 8A7 7 0 1 1 1 8Z" fill="currentColor"/><path class="duo-mark" d="M6 6.375A2 2 0 0 1 10 6.375A1 1 0 0 1 9 7.375A1 1 0 0 0 8 8.375" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path class="duo-mark" d="M6.875 11.25A1.125 1.125 0 1 1 9.125 11.25A1.125 1.125 0 1 1 6.875 11.25Z" fill="currentColor"/></svg>', // circle-help
    changeOrders: KUBAI_OPEN + '<path class="duo-body" d="M1 8A7 7 0 1 1 15 8A7 7 0 1 1 1 8Z" fill="currentColor"/><path class="duo-mark" d="M5 6H11M9.5 4.5L11 6L9.5 7.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path class="duo-mark" d="M11 10H5M6.5 8.5L5 10L6.5 11.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>', // arrow-left-right
    decisionRegister: KUBAI_OPEN + '<path class="duo-mark" d="M2 1.75C2 1.336 2.336 1 2.75 1L2.75 1C3.164 1 3.5 1.336 3.5 1.75L3.5 14.25C3.5 14.664 3.164 15 2.75 15L2.75 15C2.336 15 2 14.664 2 14.25Z" fill="currentColor"/><path class="duo-body" d="M4.5 2.147C4.5 2.057 4.5 1.586 4.793 1.293C5.086 1 5.557 1 5.647 1L5.852 1C6.772 1 7.678 1.214 8.5 1.625L8.5 1.625C9.322 2.036 10.228 2.25 11.148 2.25L11.498 2.25C11.886 2.25 12.828 2.25 13.414 2.836C14 3.422 14 4.364 14 4.752L14 6.248C14 6.636 14 7.578 13.414 8.164C12.828 8.75 11.886 8.75 11.498 8.75L11.148 8.75C10.228 8.75 9.322 8.536 8.5 8.125L8.5 8.125C7.678 7.714 6.772 7.5 5.852 7.5L5.647 7.5C5.557 7.5 5.086 7.5 4.793 7.207C4.5 6.914 4.5 6.443 4.5 6.353Z" fill="currentColor"/></svg>', // flag
    lessonsLearned: KUBAI_OPEN + '<defs><mask id="bookmark-cut1" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M7.5 8.5A1 1 0 1 1 9.5 8.5A1 1 0 1 1 7.5 8.5Z" fill="#000"/></mask></defs><path class="duo-body" d="M2 4.6C2 3.114 2 2.172 2.586 1.586C3.172 1 4.114 1 5.6 1L10.4 1C11.886 1 12.828 1 13.414 1.586C14 2.172 14 3.114 14 4.6L14 11.4C14 12.886 14 13.828 13.414 14.414C12.828 15 11.886 15 10.4 15L5.6 15C4.114 15 3.172 15 2.586 14.414C2 13.828 2 12.886 2 11.4Z" fill="currentColor"/><g mask="url(#bookmark-cut1)"><path class="duo-mark" d="M6.75 1L10.25 1L10.25 8.5L6.75 8.5Z" fill="currentColor"/></g></svg>', // bookmark
    knowledgeBase: KUBAI_OPEN + '<path class="duo-body" d="M1 7.4C1 5.171 1 3.757 1.879 2.879C2.757 2 4.171 2 6.4 2L7.5 2L7.5 14L6.4 14C4.171 14 2.757 14 1.879 13.121C1 12.243 1 10.829 1 8.6Z" fill="currentColor"/><path class="duo-body" d="M8.5 2L9.6 2C11.829 2 13.243 2 14.121 2.879C15 3.757 15 5.171 15 7.4L15 8.6C15 10.829 15 12.243 14.121 13.121C13.243 14 11.829 14 9.6 14L8.5 14Z" fill="currentColor"/><path class="duo-mark" d="M3 6.625C3 6.28 3.28 6 3.625 6L4.875 6C5.22 6 5.5 6.28 5.5 6.625L5.5 6.625C5.5 6.97 5.22 7.25 4.875 7.25L3.625 7.25C3.28 7.25 3 6.97 3 6.625ZM3 9.375C3 9.03 3.28 8.75 3.625 8.75L4.875 8.75C5.22 8.75 5.5 9.03 5.5 9.375L5.5 9.375C5.5 9.72 5.22 10 4.875 10L3.625 10C3.28 10 3 9.72 3 9.375Z" fill="currentColor"/><path class="duo-mark" d="M10.5 6.625C10.5 6.28 10.78 6 11.125 6L12.375 6C12.72 6 13 6.28 13 6.625L13 6.625C13 6.97 12.72 7.25 12.375 7.25L11.125 7.25C10.78 7.25 10.5 6.97 10.5 6.625ZM10.5 9.375C10.5 9.03 10.78 8.75 11.125 8.75L12.375 8.75C12.72 8.75 13 9.03 13 9.375L13 9.375C13 9.72 12.72 10 12.375 10L11.125 10C10.78 10 10.5 9.72 10.5 9.375Z" fill="currentColor"/></svg>', // book-open
    schedule: KUBAI_OPEN + '<path class="duo-body" d="M1 7.4C1 5.171 1 3.757 1.879 2.879C2.757 2 4.171 2 6.4 2L9.6 2C11.829 2 13.243 2 14.121 2.879C15 3.757 15 5.171 15 7.4L15 8.6C15 10.829 15 12.243 14.121 13.121C13.243 14 11.829 14 9.6 14L6.4 14C4.171 14 2.757 14 1.879 13.121C1 12.243 1 10.829 1 8.6Z" fill="currentColor"/><path class="duo-mark" d="M3.25 5.167C3.25 4.66 3.66 4.25 4.167 4.25L7.333 4.25C7.84 4.25 8.25 4.66 8.25 5.167L8.25 5.167C8.25 5.673 7.84 6.083 7.333 6.083L4.167 6.083C3.66 6.083 3.25 5.673 3.25 5.167Z" fill="currentColor"/><path class="duo-mark" d="M6 8C6 8 6 7.62 6.268 7.352C6.537 7.083 6.917 7.083 6.917 7.083L10.083 7.083C10.083 7.083 10.463 7.083 10.732 7.352C11 7.62 11 8 11 8L11 8C11 8 11 8.38 10.732 8.648C10.463 8.917 10.083 8.917 10.083 8.917L6.917 8.917C6.917 8.917 6.537 8.917 6.268 8.648C6 8.38 6 8 6 8Z" fill="currentColor"/><path class="duo-mark" d="M9 10.833C9 10.833 9 10.454 9.268 10.185C9.537 9.917 9.917 9.917 9.917 9.917L11.833 9.917C11.833 9.917 12.213 9.917 12.482 10.185C12.75 10.454 12.75 10.833 12.75 10.833L12.75 10.833C12.75 10.833 12.75 11.213 12.482 11.482C12.213 11.75 11.833 11.75 11.833 11.75L9.917 11.75C9.917 11.75 9.537 11.75 9.268 11.482C9 11.213 9 10.833 9 10.833Z" fill="currentColor"/></svg>', // chart-gantt
    delayRecoveryDashboard: KUBAI_OPEN + '<defs><mask id="alarm-clock-gap1" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M2.75 8.75A5.25 5.25 0 1 1 13.25 8.75A5.25 5.25 0 1 1 2.75 8.75Z" fill="#000" stroke="#000" stroke-width="1.846" stroke-linejoin="round"/></mask></defs><g transform="translate(8 8) scale(1.083) translate(-8 -8)"><g mask="url(#alarm-clock-gap1)"><path class="duo-mark" d="M2 3.75A1.75 1.75 0 1 1 5.5 3.75A1.75 1.75 0 1 1 2 3.75ZM10.5 3.75A1.75 1.75 0 1 1 14 3.75A1.75 1.75 0 1 1 10.5 3.75Z" fill="currentColor"/></g><path class="duo-body" d="M2.75 8.75A5.25 5.25 0 1 1 13.25 8.75A5.25 5.25 0 1 1 2.75 8.75Z" fill="currentColor"/><path class="duo-mark" d="M8 6.25V8.75" fill="none" stroke="currentColor" stroke-width="1.385" stroke-linecap="round" stroke-linejoin="round"/><path class="duo-mark" d="M8 8.75H10" fill="none" stroke="currentColor" stroke-width="1.385" stroke-linecap="round" stroke-linejoin="round"/></g></svg>', // alarm-clock
    cost: KUBAI_OPEN + '<defs><mask id="wallet-gap0" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M1 7.4C1 5.171 1 3.757 1.879 2.879C2.757 2 4.171 2 6.4 2L9.6 2C11.829 2 13.243 2 14.121 2.879C15 3.757 15 5.171 15 7.4L15 8.6C15 10.829 15 12.243 14.121 13.121C13.243 14 11.829 14 9.6 14L6.4 14C4.171 14 2.757 14 1.879 13.121C1 12.243 1 10.829 1 8.6Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/></mask><mask id="wallet-cut1" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M10.5 8A0.75 0.75 0 1 1 12 8A0.75 0.75 0 1 1 10.5 8Z" fill="#000"/></mask></defs><path class="duo-body" d="M1 7.4C1 5.171 1 3.757 1.879 2.879C2.757 2 4.171 2 6.4 2L9.6 2C11.829 2 13.243 2 14.121 2.879C15 3.757 15 5.171 15 7.4L15 8.6C15 10.829 15 12.243 14.121 13.121C13.243 14 11.829 14 9.6 14L6.4 14C4.171 14 2.757 14 1.879 13.121C1 12.243 1 10.829 1 8.6Z" fill="currentColor"/><g mask="url(#wallet-cut1)"><path class="duo-mark" d="M9.5 8C9.5 7.034 10.284 6.25 11.25 6.25L12.25 6.25C13.216 6.25 14 7.034 14 8L14 8C14 8.966 13.216 9.75 12.25 9.75L11.25 9.75C10.284 9.75 9.5 8.966 9.5 8Z" fill="currentColor"/></g></svg>', // wallet
    commitments: KUBAI_OPEN + '<path class="duo-body" d="M2 4.6C2 3.114 2 2.172 2.586 1.586C3.172 1 4.114 1 5.6 1L10.4 1C11.886 1 12.828 1 13.414 1.586C14 2.172 14 3.114 14 4.6L14 13L2 13ZM2 13A2 2 0 1 1 6 13A2 2 0 1 1 2 13ZM6 13A2 2 0 1 1 10 13A2 2 0 1 1 6 13ZM10 13A2 2 0 1 1 14 13A2 2 0 1 1 10 13Z" fill="currentColor"/><path class="duo-mark" d="M5 4.875C5 4.53 5.28 4.25 5.625 4.25L10.375 4.25C10.72 4.25 11 4.53 11 4.875L11 4.875C11 5.22 10.72 5.5 10.375 5.5L5.625 5.5C5.28 5.5 5 5.22 5 4.875ZM5 7.5C5 7.155 5.28 6.875 5.625 6.875L10.375 6.875C10.72 6.875 11 7.155 11 7.5L11 7.5C11 7.845 10.72 8.125 10.375 8.125L5.625 8.125C5.28 8.125 5 7.845 5 7.5Z" fill="currentColor"/><path class="duo-mark" d="M5 10.125C5 9.78 5.28 9.5 5.625 9.5L7.875 9.5C8.22 9.5 8.5 9.78 8.5 10.125L8.5 10.125C8.5 10.47 8.22 10.75 7.875 10.75L5.625 10.75C5.28 10.75 5 10.47 5 10.125Z" fill="currentColor"/></svg>', // receipt
    resources: KUBAI_OPEN + '<defs><mask id="users-gap1" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M3.563 7.5A2.25 2.25 0 1 1 8.063 7.5A2.25 2.25 0 1 1 3.563 7.5Z" fill="#000" stroke="#000" stroke-width="1.846" stroke-linejoin="round"/></mask><mask id="users-gap2" maskUnits="userSpaceOnUse" x="-2" y="-2" width="20" height="20"><rect x="-2" y="-2" width="20" height="20" fill="#fff"/><path d="M2 12.917C2 11.72 2.97 10.75 4.167 10.75L7.458 10.75C8.655 10.75 9.625 11.72 9.625 12.917L9.625 12.917C9.625 13.515 9.14 14 8.542 14L3.083 14C2.485 14 2 13.515 2 12.917Z" fill="#000" stroke="#000" stroke-width="1.846" stroke-linejoin="round"/></mask></defs><g transform="translate(8 8) scale(1.083) translate(-8 -8)"><g mask="url(#users-gap2)"><g mask="url(#users-gap1)"><path class="duo-body" d="M8 4.25A2.25 2.25 0 1 1 12.5 4.25A2.25 2.25 0 1 1 8 4.25ZM6.5 11.25C6.5 10.671 6.5 9.257 7.379 8.379C8.257 7.5 9.671 7.5 10.25 7.5L10.25 7.5C10.829 7.5 12.243 7.5 13.121 8.379C14 9.257 14 10.671 14 11.25L14 11.833C14 12.415 14 13.121 13.561 13.561C13.121 14 12.415 14 11.833 14L8.667 14C8.085 14 7.379 14 6.939 13.561C6.5 13.121 6.5 12.415 6.5 11.833Z" fill="currentColor"/></g></g><path class="duo-mark" d="M3.563 7.5A2.25 2.25 0 1 1 8.063 7.5A2.25 2.25 0 1 1 3.563 7.5Z" fill="currentColor"/><path class="duo-body" d="M2 12.917C2 11.72 2.97 10.75 4.167 10.75L7.458 10.75C8.655 10.75 9.625 11.72 9.625 12.917L9.625 12.917C9.625 13.515 9.14 14 8.542 14L3.083 14C2.485 14 2 13.515 2 12.917Z" fill="currentColor"/></g></svg>', // users
    reports: KUBAI_OPEN + '<path class="duo-body" d="M2 4.6C2 3.114 2 2.172 2.586 1.586C3.172 1 4.114 1 5.6 1L10.4 1C11.886 1 12.828 1 13.414 1.586C14 2.172 14 3.114 14 4.6L14 11.4C14 12.886 14 13.828 13.414 14.414C12.828 15 11.886 15 10.4 15L5.6 15C4.114 15 3.172 15 2.586 14.414C2 13.828 2 12.886 2 11.4Z" fill="currentColor"/><path class="duo-mark" d="M4.75 8.75C4.75 8.336 5.086 8 5.5 8L5.5 8C5.914 8 6.25 8.336 6.25 8.75L6.25 12L4.75 12Z" fill="currentColor"/><path class="duo-mark" d="M7.25 5.75C7.25 5.336 7.586 5 8 5L8 5C8.414 5 8.75 5.336 8.75 5.75L8.75 12L7.25 12Z" fill="currentColor"/><path class="duo-mark" d="M9.75 7.5C9.75 7.086 10.086 6.75 10.5 6.75L10.5 6.75C10.914 6.75 11.25 7.086 11.25 7.5L11.25 12L9.75 12Z" fill="currentColor"/></svg>', // file-chart
    settings: KUBAI_OPEN + '<path class="duo-body" d="M2.75 8A5.25 5.25 0 1 1 13.25 8A5.25 5.25 0 1 1 2.75 8ZM12.2 8C12.2 7.493 12.2 7.139 12.42 6.92C12.639 6.7 12.993 6.7 13.5 6.7L13.7 6.7C14.207 6.7 14.561 6.7 14.78 6.92C15 7.139 15 7.493 15 8L15 8C15 8.507 15 8.861 14.78 9.08C14.561 9.3 14.207 9.3 13.7 9.3L13.5 9.3C12.993 9.3 12.639 9.3 12.42 9.08C12.2 8.861 12.2 8.507 12.2 8ZM10.97 10.97C11.329 10.611 11.578 10.361 11.889 10.361C12.2 10.361 12.45 10.611 12.808 10.97L12.95 11.111C13.308 11.47 13.558 11.72 13.558 12.031C13.558 12.341 13.308 12.591 12.95 12.95L12.95 12.95C12.591 13.308 12.341 13.558 12.031 13.558C11.72 13.558 11.47 13.308 11.111 12.95L10.97 12.808C10.611 12.45 10.361 12.2 10.361 11.889C10.361 11.578 10.611 11.329 10.97 10.97ZM8 12.2C8.507 12.2 8.861 12.2 9.08 12.42C9.3 12.639 9.3 12.993 9.3 13.5L9.3 13.7C9.3 14.207 9.3 14.561 9.08 14.78C8.861 15 8.507 15 8 15L8 15C7.493 15 7.139 15 6.92 14.78C6.7 14.561 6.7 14.207 6.7 13.7L6.7 13.5C6.7 12.993 6.7 12.639 6.92 12.42C7.139 12.2 7.493 12.2 8 12.2ZM5.03 10.97C5.389 11.329 5.639 11.578 5.639 11.889C5.639 12.2 5.389 12.45 5.03 12.808L4.889 12.95C4.53 13.308 4.28 13.558 3.969 13.558C3.659 13.558 3.409 13.308 3.05 12.95L3.05 12.95C2.692 12.591 2.442 12.341 2.442 12.031C2.442 11.72 2.692 11.47 3.05 11.111L3.192 10.97C3.55 10.611 3.8 10.361 4.111 10.361C4.422 10.361 4.671 10.611 5.03 10.97ZM3.8 8C3.8 8.507 3.8 8.861 3.58 9.08C3.361 9.3 3.007 9.3 2.5 9.3L2.3 9.3C1.793 9.3 1.439 9.3 1.22 9.08C1 8.861 1 8.507 1 8L1 8C1 7.493 1 7.139 1.22 6.92C1.439 6.7 1.793 6.7 2.3 6.7L2.5 6.7C3.007 6.7 3.361 6.7 3.58 6.92C3.8 7.139 3.8 7.493 3.8 8ZM5.03 5.03C4.671 5.389 4.422 5.639 4.111 5.639C3.8 5.639 3.55 5.389 3.192 5.03L3.05 4.889C2.692 4.53 2.442 4.28 2.442 3.969C2.442 3.659 2.692 3.409 3.05 3.05L3.05 3.05C3.409 2.692 3.659 2.442 3.969 2.442C4.28 2.442 4.53 2.692 4.889 3.05L5.03 3.192C5.389 3.55 5.639 3.8 5.639 4.111C5.639 4.422 5.389 4.671 5.03 5.03ZM8 3.8C7.493 3.8 7.139 3.8 6.92 3.58C6.7 3.361 6.7 3.007 6.7 2.5L6.7 2.3C6.7 1.793 6.7 1.439 6.92 1.22C7.139 1 7.493 1 8 1L8 1C8.507 1 8.861 1 9.08 1.22C9.3 1.439 9.3 1.793 9.3 2.3L9.3 2.5C9.3 3.007 9.3 3.361 9.08 3.58C8.861 3.8 8.507 3.8 8 3.8ZM10.97 5.03C10.611 4.671 10.361 4.422 10.361 4.111C10.361 3.8 10.611 3.55 10.97 3.192L11.111 3.05C11.47 2.692 11.72 2.442 12.031 2.442C12.341 2.442 12.591 2.692 12.95 3.05L12.95 3.05C13.308 3.409 13.558 3.659 13.558 3.969C13.558 4.28 13.308 4.53 12.95 4.889L12.808 5.03C12.45 5.389 12.2 5.639 11.889 5.639C11.578 5.639 11.329 5.389 10.97 5.03Z" fill="currentColor"/><path class="duo-mark" d="M5.75 8A2.25 2.25 0 1 1 10.25 8A2.25 2.25 0 1 1 5.75 8Z" fill="currentColor"/></svg>', // settings
  };

  // The same icon renders in the sidebar, the phone drawer and the command palette at once,
  // and some icons carry a <mask id>. Each copy gets its own ids: a url(#id) that resolves to
  // a copy inside the hidden (display:none) sidebar doesn't paint in Chromium.
  var navIconSeq = 0;
  function navIcon(key) {
    var svg = NAV_ICONS[key];
    if (!svg) return "";
    var n = ++navIconSeq;
    return svg.replace(/(id="|url\(#)([\w-]+)/g, function (m, pre, id) { return pre + id + "-" + n; });
  }

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
    refreshTitleBlockDate();
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
    // Module accent tint: same "documentElement data-attribute the CSS keys off of"
    // pattern as applyTheme/applyDensity above — reuses activeGroup, already computed
    // just above for the accordion sync, so this is a one-line addition reaching every
    // route (this function already runs on every navigation, initial load included).
    document.documentElement.setAttribute(
      "data-nav-group",
      activeGroup ? GROUP_SLUGS[activeGroup.label] || "" : ""
    );
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
          '<span class="sidebar__icon">' + navIcon(item.key) + '</span><span class="sidebar__label">' + item.label + "</span>";
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

  /** Gate 7.3: at phone width the header has room for Home and Theme only, so Export,
   * Import, Density and Focus become labelled drawer rows (shown by CSS at <=780px only,
   * where their header buttons hide). Each row clicks the real header button, so the
   * export spinner, import confirm and toggle state stay in one place. */
  function buildDrawerActions() {
    var density = window.PCC.store.get().settings.density || "comfortable";
    var rows = [
      { action: "export", target: "title-export-btn", icon: ICONS.export, label: "Export data" },
      { action: "import", target: "title-import-btn", icon: ICONS.import, label: "Import data" },
      { action: "density", target: "density-toggle-btn", icon: DENSITY_ICONS[density], label: "Density: " + DENSITY_LABELS[density] },
      { action: "focus", target: "focus-mode-toggle-btn", icon: ICONS.focus, label: focusModeOn ? "Exit focus mode" : "Focus mode" },
    ];
    var wrap = document.createElement("div");
    wrap.className = "drawer__actions";
    rows.forEach(function (r) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "drawer__action";
      b.setAttribute("data-action", r.action);
      b.innerHTML = r.icon + "<span>" + r.label + "</span>";
      b.onclick = function () {
        closeNav();
        var target = document.getElementById(r.target);
        if (target) target.click();
      };
      wrap.appendChild(b);
    });
    return wrap;
  }

  var navKeydownHandler = null;

  function closeNav() {
    var overlay = document.getElementById("nav-overlay");
    if (overlay) {
      // Animation polish pass: play the reverse of openNav()'s enter animation before
      // actually removing the node, instead of the previous instant overlay.remove().
      // The id comes off immediately, not after the animation — several existing tests
      // (test_uiux_gate2_navigation_e2e.js) assert getElementById("nav-overlay") is null
      // synchronously right after triggering a close (button/backdrop/Escape/route
      // change), with no await, and that's the real contract: "is the nav considered
      // closed" needs to flip instantly even though the fading node briefly lingers in
      // the DOM purely for the visual exit. 180ms matches --transition-base; the timeout
      // doesn't read the CSS var directly since it needs a plain JS number regardless.
      overlay.removeAttribute("id");
      overlay.classList.add("drawer-overlay--closing");
      window.setTimeout(function () {
        if (overlay.parentNode) overlay.remove();
      }, 180);
    }
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
    // Command palette entry point at phone width, where the title-block search button is
    // hidden (.icon-btn--hide-mobile): the title bar has no room left for one more 44px
    // button — adding it there squeezed the page title to 0px and scrolled the page
    // sideways at 412px (caught in real Chromium). The drawer is where phone users
    // already go to move between pages, so the "jump anywhere" search belongs here too.
    // A full-width labelled row at the top of the drawer body rather than one more header
    // icon: a bigger, self-explanatory tap target, and the header keeps its close button
    // as its only .icon-btn.
    var searchBtn = document.createElement("button");
    searchBtn.type = "button";
    searchBtn.className = "drawer__search";
    searchBtn.id = "nav-search-btn";
    searchBtn.innerHTML = ICONS.search + "<span>Search pages and records…</span>";
    searchBtn.onclick = function () {
      closeNav();
      if (window.PCC.commandPalette) window.PCC.commandPalette.open();
    };
    header.appendChild(title);
    header.appendChild(closeBtn);

    var body = document.createElement("div");
    body.className = "drawer__body";
    body.appendChild(searchBtn);
    body.appendChild(buildDrawerActions());
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

  /** Redesign Gate 6 (Global Project Context), extended by the Company/Client/Project
   * Management redesign into a three-level cascade: the persistent "which Company/Client/
   * Project am I in" indicator + switcher, shown in the shell header on every page so it
   * survives route changes (built once in buildTitleBlock(), refreshed in place — never
   * torn down). Picking any level here writes straight to window.PCC.projectContext, then
   * re-renders the current route so whatever page is showing picks up the new context
   * immediately; a page's own project selector (Schedule, Risk Register, etc.) writes to
   * the same shared context, so these three selects reflect that page's own selection too
   * (kept in sync via the store.onChange listener registered in mount() below). Spec point
   * 15's compact layout recommendation ("Company ▾ Client ▾ Project ▾") is exactly
   * these three title-block cells side by side. */
  function optionForProject(p) {
    var opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || "(unnamed project)";
    return opt;
  }

  /** Fills the Project select's options, scoped to the current Company/Client per spec
   * points 6-8: with neither chosen, every active project is offered (this is exactly the
   * pre-Company/Client behavior, so an install that never sets up Companies/Clients sees
   * no change at all); with a Company chosen but no Client yet, the spec is explicit that
   * a Client must be picked first — no project list to arbitrarily guess from; with both
   * chosen, only that exact Company+Client's projects are offered. */
  function populateProjectSelect(select, data, companyId, clientId) {
    var pc = window.PCC.projectContext;
    select.innerHTML = "";

    if (companyId && !clientId) {
      select.disabled = true;
      var pickClientOpt = document.createElement("option");
      pickClientOpt.value = "";
      pickClientOpt.textContent = "Select a Client first";
      select.appendChild(pickClientOpt);
      select.value = "";
      return;
    }
    select.disabled = false;

    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Projects";
    select.appendChild(allOpt);

    // Daily-Use Audit Phase 5 ("Project context selector isn't alphabetically sorted"):
    // sorted case-insensitively so "amber" and "Amber" land together rather than
    // splitting on case.
    var scopedProjects = (companyId && clientId ? pc.projectsForCompanyClient(data, companyId, clientId) : data.projects.filter(function (p) { return !p.archived; }))
      .sort(function (a, b) {
        return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase());
      });

    // Daily-Use Audit Phase 5 (pinned projects): pinned ids come back in pin order
    // (most-recently-pinned first, see togglePin()'s own comment) — kept as-is here
    // rather than re-sorted alphabetically, so the one just pinned is exactly where a
    // planner expects to find it, at the top. Only pins that fall within the current
    // Company/Client scope are shown, same "never show unrelated projects" rule the
    // scoping above already applies (spec point 6).
    var pinnedIds = pc.getPinnedIds();
    var scopedIdSet = {};
    scopedProjects.forEach(function (p) {
      scopedIdSet[p.id] = true;
    });
    var scopedPinnedIds = pinnedIds.filter(function (id) {
      return scopedIdSet[id];
    });
    if (scopedPinnedIds.length > 0) {
      var pinnedGroup = document.createElement("optgroup");
      pinnedGroup.label = "Pinned";
      scopedPinnedIds.forEach(function (id) {
        var p = scopedProjects.find(function (proj) {
          return proj.id === id;
        });
        if (p) pinnedGroup.appendChild(optionForProject(p));
      });
      select.appendChild(pinnedGroup);
    }

    var pinnedIdSet = {};
    scopedPinnedIds.forEach(function (id) {
      pinnedIdSet[id] = true;
    });
    var unpinnedProjects = scopedProjects.filter(function (p) {
      return !pinnedIdSet[p.id];
    });
    if (unpinnedProjects.length > 0) {
      var restGroup = scopedPinnedIds.length > 0 ? document.createElement("optgroup") : null;
      if (restGroup) restGroup.label = "All Projects";
      var target = restGroup || select;
      unpinnedProjects.forEach(function (p) {
        target.appendChild(optionForProject(p));
      });
      if (restGroup) select.appendChild(restGroup);
    }

    select.value = pc.get();
  }

  function populateClientSelect(select, data, companyId) {
    var pc = window.PCC.projectContext;
    select.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Clients";
    select.appendChild(allOpt);
    select.disabled = !companyId;
    if (companyId) {
      pc.clientsForCompany(data, companyId)
        .slice()
        .sort(function (a, b) { return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()); })
        .forEach(function (c) {
          var opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = c.name || "(unnamed client)";
          select.appendChild(opt);
        });
    }
    select.value = pc.getClient();
  }

  function populateCompanySelect(select, data) {
    var pc = window.PCC.projectContext;
    select.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Companies";
    select.appendChild(allOpt);
    pc.activeCompanies(data)
      .slice()
      .sort(function (a, b) { return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()); })
      .forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name || "(unnamed company)";
        select.appendChild(opt);
      });
    select.value = pc.getCompany();
  }

  /** Refreshes one context switcher instance's three selects (identified by its DOM id
   * prefix) from current store state — called once to build it and again any time the
   * underlying data changes (store.onChange, see mount() below) or a level above changes
   * (a company/client pick must immediately re-scope the levels below it, before the
   * full-page router.render() below even runs). A no-op if this instance isn't currently
   * in the DOM (e.g. the Dashboard-embedded one when some other page is showing). */
  function populateContextSelectsFor(idPrefix) {
    var companySelect = document.getElementById(idPrefix + "-company-select");
    var clientSelect = document.getElementById(idPrefix + "-client-select");
    var projectSelect = document.getElementById(idPrefix + "-project-select");
    if (!companySelect || !clientSelect || !projectSelect) return;
    var data = window.PCC.store.get();
    populateCompanySelect(companySelect, data);
    populateClientSelect(clientSelect, data, window.PCC.projectContext.getCompany());
    populateProjectSelect(projectSelect, data, window.PCC.projectContext.getCompany(), window.PCC.projectContext.getClient());
  }

  // Every place a context switcher instance can currently exist in the DOM — the
  // persistent shell header (always) and Dashboard's own prominent embedded copy (spec
  // point 6, only while Dashboard is the current route). Refreshing all known instances
  // on every data change is simplest and cheap: populateContextSelectsFor() above already
  // no-ops instantly for any instance not actually present.
  var CONTEXT_SWITCHER_ID_PREFIXES = ["title-block", "dashboard-context"];

  function populateContextSelects() {
    CONTEXT_SWITCHER_ID_PREFIXES.forEach(populateContextSelectsFor);
  }

  /** Builds one Company/Client/Project cascading switcher instance, its three selects
   * namespaced by `idPrefix` so more than one can exist in the DOM at once (the shell
   * header's "title-block" instance plus Dashboard's own "dashboard-context" instance —
   * see buildDashboardContextSwitcher below). Exported as window.PCC.layout.
   * buildContextSwitcher so dashboard.js can build its own prominent copy without
   * duplicating this cascading logic. */
  function buildContextSwitcherGroup(idPrefix) {
    var wrap = document.createElement("div");
    wrap.className = "title-block__context-group";
    var selects = {};

    function makeCell(key, label, id, title, onChange) {
      var div = document.createElement("div");
      div.className = "title-block__cell";
      var lab = document.createElement("span");
      lab.className = "title-block__label";
      lab.textContent = label;
      div.appendChild(lab);
      var select = document.createElement("select");
      select.className = "title-block__project-select";
      select.id = id;
      select.title = title;
      select.onchange = function () {
        onChange(select.value);
        populateContextSelects();
        window.PCC.router.render();
      };
      div.appendChild(select);
      selects[key] = select;
      return div;
    }

    wrap.appendChild(
      makeCell("company", "Company", idPrefix + "-company-select", "Current Company context — filters Client and Project below", function (v) {
        window.PCC.projectContext.setCompany(v);
      })
    );
    wrap.appendChild(
      makeCell("client", "Client", idPrefix + "-client-select", "Current Client context — filters Project below", function (v) {
        window.PCC.projectContext.setClient(v);
      })
    );
    wrap.appendChild(
      makeCell("project", "Project", idPrefix + "-project-select", "Current project context — carries across every project-scoped page", function (v) {
        window.PCC.projectContext.set(v);
      })
    );

    // Populate directly via the element references just created, NOT by looking them up
    // through document.getElementById (that's what populateContextSelectsFor() above
    // does, and it's the right tool for a later REFRESH once this group is already
    // attached to the document) — at this exact point `wrap` hasn't been attached
    // anywhere yet (the caller does that after this function returns, e.g. Dashboard
    // builds its copy mid-render before appending it to the outlet), so a
    // getElementById-based lookup would silently find nothing and leave these selects
    // permanently empty.
    var data = window.PCC.store.get();
    populateCompanySelect(selects.company, data);
    populateClientSelect(selects.client, data, window.PCC.projectContext.getCompany());
    populateProjectSelect(selects.project, data, window.PCC.projectContext.getCompany(), window.PCC.projectContext.getClient());

    return wrap;
  }

  function buildProjectContextCell() {
    return buildContextSwitcherGroup("title-block");
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

    header.appendChild(cell("Sheet", "Dashboard", { grow: true, id: "title-block-sheet" }));
    header.appendChild(buildProjectContextCell());

    var data = window.PCC.store.get();
    header.appendChild(cell("Company", data.settings.company_name || "\u2014", { id: "title-block-company" }));
    header.appendChild(cell("Date", localIsoDate(), { id: "title-block-date" }));

    var actions = document.createElement("div");
    actions.className = "title-block__actions";

    // Item #6 of the follow-up feature list (2026-09-05): one click back to My Work from
    // any module. First in the actions row (leftmost, most-reached-for position) since
    // it's the one button meant to be used constantly while working, not an occasional
    // settings-style action like the ones after it.
    var homeBtn = document.createElement("button");
    homeBtn.className = "icon-btn";
    homeBtn.title = "Go to My Work";
    homeBtn.innerHTML = ICONS.home;
    homeBtn.onclick = function () {
      window.PCC.router.go("myWork");
    };

    // Gate 7.3: Export, Import, Density and Focus hide at phone width (.icon-btn--hide-mobile)
    // so the page name has room; openNav()'s drawer rows click these same buttons there.
    var exportBtn = document.createElement("button");
    exportBtn.className = "icon-btn icon-btn--hide-mobile";
    exportBtn.id = "title-export-btn";
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
    importBtn.className = "icon-btn icon-btn--hide-mobile";
    importBtn.id = "title-import-btn";
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
    densityBtn.className = "icon-btn icon-btn--hide-mobile";
    densityBtn.id = "density-toggle-btn";
    densityBtn.title = "Spacing density: " + DENSITY_LABELS[currentDensity] + " (click to cycle)";
    densityBtn.innerHTML = '<span id="density-toggle-icon">' + DENSITY_ICONS[currentDensity] + "</span>";
    densityBtn.onclick = toggleDensity;

    var focusModeBtn = document.createElement("button");
    focusModeBtn.className = "icon-btn icon-btn--hide-mobile" + (focusModeOn ? " icon-btn--active" : "");
    focusModeBtn.id = "focus-mode-toggle-btn";
    focusModeBtn.title = focusModeOn ? "Exit Focus Mode" : "Enter Focus Mode (hide non-essential chrome)";
    focusModeBtn.innerHTML = ICONS.focus;
    focusModeBtn.onclick = toggleFocusMode;

    // Daily-Use Audit Phase 2: the only discoverability path into keyboardShortcuts.js
    // besides already knowing to press "?" — same icon-btn row every other shell-level
    // action lives in.
    var shortcutsBtn = document.createElement("button");
    // Daily-Use Audit Phase 5 (mobile alignment): hidden at phone width via
    // .icon-btn--hide-mobile (styles.css) — there's no physical keyboard on a
    // touchscreen device, so this icon has nothing to do there. Also the one action
    // icon safe to drop without losing functionality, freeing just enough width for
    // the page title to stop truncating to 1-2 characters on common short titles like
    // "Dashboard"/"Settings" (see the mobile title-block overlap bug fixed alongside
    // this same phase — .title-block__value's missing display:block/max-width).
    shortcutsBtn.className = "icon-btn icon-btn--hide-mobile";
    shortcutsBtn.title = "Keyboard shortcuts";
    shortcutsBtn.innerHTML = ICONS.keyboard;
    shortcutsBtn.onclick = function () {
      if (window.PCC.keyboardShortcuts) window.PCC.keyboardShortcuts.showHelp();
    };

    // Command palette entry point. Hidden at phone width like the keyboard-shortcuts
    // button (no room left in the title bar — see openNav()'s drawer search button, which
    // is the phone entry point instead, since there's no Ctrl+K on a phone either).
    var searchBtn = document.createElement("button");
    searchBtn.className = "icon-btn icon-btn--hide-mobile";
    searchBtn.id = "command-palette-btn";
    searchBtn.title = "Search pages and records (Ctrl+K)";
    searchBtn.setAttribute("aria-label", "Search pages and records");
    searchBtn.innerHTML = ICONS.search;
    searchBtn.onclick = function () {
      if (window.PCC.commandPalette) window.PCC.commandPalette.open();
    };

    actions.appendChild(homeBtn);
    actions.appendChild(searchBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(importBtn);
    actions.appendChild(importInput);
    actions.appendChild(densityBtn);
    actions.appendChild(focusModeBtn);
    actions.appendChild(shortcutsBtn);
    actions.appendChild(themeBtn);

    header.appendChild(actions);
    return header;
  }

  function buildFooter() {
    var footer = document.createElement("footer");
    footer.className = "app-footer";

    var left = document.createElement("span");
    left.textContent = "Project Control Center \u2014 local, offline instance";

    var right = document.createElement("span");
    right.id = "footer-save-status";
    right.textContent = "Rev 0.1";

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
  /** Gate H.2: this build found data saved by a NEWER build (see store.js load()). Nothing
   * is migrated or saved, so the dialog can't be dismissed; its one action exports the
   * stored data unchanged for the newer app. */
  function showNewerVersionBlock() {
    var overlay = document.createElement("div");
    overlay.id = "newer-version-overlay";
    overlay.className = "modal-overlay";
    var modal = document.createElement("div");
    modal.className = "modal";
    modal.style.width = "min(440px, 92vw)";
    var header = document.createElement("div");
    header.className = "modal__header";
    var title = document.createElement("div");
    title.className = "modal__title";
    title.textContent = "Saved by a newer version";
    header.appendChild(title);
    var body = document.createElement("div");
    body.className = "modal__body";
    var msg = document.createElement("p");
    msg.style.margin = "0";
    msg.textContent =
      "The data in this app was saved by a newer version of Project Control Center. Update this app to open it. Nothing has been changed, and nothing will be saved until you do.";
    body.appendChild(msg);
    var footer = document.createElement("div");
    footer.className = "modal__footer";
    var exportBtn = document.createElement("button");
    exportBtn.className = "btn btn--primary";
    exportBtn.textContent = "Export this data";
    exportBtn.onclick = function () {
      window.PCC.store.exportNewerVersionData();
    };
    footer.appendChild(exportBtn);
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    // onClose does nothing on purpose: Escape must not dismiss this.
    window.PCC.modalA11y.attach(overlay, { onClose: function () {}, initialFocus: exportBtn });
  }

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
    if (window.PCC.store.isBlockedByNewerVersion && window.PCC.store.isBlockedByNewerVersion()) showNewerVersionBlock();

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
      populateContextSelects();
    });

    window.PCC.store.onPersisted(function (data, ok) {
      var status = document.getElementById("footer-save-status");
      if (status) status.textContent = ok ? "Saved \u00b7 " + (window.PCC.dates ? window.PCC.dates.formatTime(new Date()) : new Date().toLocaleTimeString()) : "Not saved \u2014 see notification";
      if (ok) warnIfStorageNearlyFull();
    });
  }

  // Gate H.3: one warning per session once everything stored passes 80% of the browser's
  // limit. Uses the size of the string the save just wrote, so nothing is serialized twice.
  var storageWarningShown = false;
  function warnIfStorageNearlyFull() {
    var engine = window.PCC.storageAnalyticsEngine;
    if (storageWarningShown || !engine || !window.PCC.store.getLastSavedSize) return;
    var fit = engine.checkStorageFit(window.PCC.store.getLastSavedSize(), window.PCC.store.getOtherStorageChars());
    if (fit.percent < 80) return;
    storageWarningShown = true;
    window.PCC.notify(
      "App data is using " + Math.round(fit.percent) + "% of this device's storage limit. Saves fail once it is full.",
      "warning",
      {
        label: "Open Storage Management",
        onClick: function () {
          window.PCC.router.go("storageManagement");
        },
      }
    );
  }

  // Keeps the title-block DATE current: after a Settings time-zone change, and past midnight
  // in a long-open session (called on every route change via setActiveNav too).
  function refreshTitleBlockDate() {
    var dateEl = document.getElementById("title-block-date");
    if (dateEl) dateEl.textContent = localIsoDate();
  }

  function refreshTitleBlock() {
    refreshTitleBlockDate();
    var companyEl = document.getElementById("title-block-company");
    if (companyEl) companyEl.textContent = window.PCC.store.get().settings.company_name || "\u2014";
    populateContextSelects();
    applyTheme(window.PCC.store.get().settings.theme || "dark");
    applyDensity(window.PCC.store.get().settings.density || "comfortable");
  }

  window.PCC.layout = {
    mount: mount,
    setActiveNav: setActiveNav,
    refreshTitleBlock: refreshTitleBlock,
    refreshBackupNudge: refreshBackupNudge,
    isFocusMode: isFocusMode,
    // Company/Client/Project Management redesign: lets dashboard.js build its own
    // prominent copy of the same Company/Client/Project cascade (spec point 6) without
    // duplicating the cascading-select logic.
    buildContextSwitcher: buildContextSwitcherGroup,
    // Command palette (commandPalette.js): the one list of real routes + their sidebar
    // labels, so the palette's "Pages" can never drift from the sidebar.
    navItems: function () {
      var out = [];
      NAV_GROUPS.forEach(function (g) {
        g.items.forEach(function (item) {
          out.push({ key: item.key, label: item.label, group: g.label, icon: navIcon(item.key) });
        });
      });
      return out;
    },
  };
})();
