/* Delay & Recovery Dashboard (PCC Evolution Roadmap, Tier C: Project Performance;
 * extended Tier F Gate 23: Advanced Delay Analysis; extended Tier F Gate 24: Recovery
 * & Mitigation Planning).
 *
 * Portfolio-wide rollup of recovery actions AND (as of Gate 23) delay records — distinct
 * from the Schedule module's own baseline-compare view (Gate 4/5 finish-variance/delayed
 * counts, extended by Gate 23 with a Float Erosion ranking) which stays exactly where it
 * is. This page still does NOT re-derive or roll up baseline/float-erosion stats
 * portfolio-wide: which baseline to compare against per schedule was a real ambiguity
 * when this file was first written, and while Gate 22's Official Baseline now resolves
 * that ambiguity for schedules that have one, float erosion is still only meaningful
 * relative to a specific comparison a user chose to run — it stays in the Baselines tab,
 * not duplicated here. Delay Records are different: they're a standalone register (like
 * recovery_actions), not baseline-derived, so rolling them up here has no such ambiguity.
 * Both recovery actions AND delay records are entered from the Schedule module's Activity
 * Detail Panel (renderRecoveryActionsSection() / renderDelayRecordsSection() in
 * pages/schedule.js) — this page stays read-only, same "entry lives on the record,
 * dashboard is a separate rollup" split as the Vendor Performance Centre.
 *
 * Gate 24 adds two things: a quantified rollup of open recovery actions' own
 * estimated_recovery_days/estimated_cost fields (open only — a completed/cancelled
 * action's estimate is historical, not a live commitment), and nothing else — the
 * actual "what if we recover N days" exploration tool (the What-If Sandbox, a new tab
 * in schedule.js) is deliberately NOT duplicated here for the same "entry/exploration
 * lives on its own page, dashboard only rolls up decided numbers" split as everything
 * else on this page. A what-if run is never persisted, so there's nothing to roll up
 * even if this page wanted to.
 *
 * Planning & Scheduling-Centric Delay Management, Gate H (Delay Analytics — the spec's
 * final gate): the Gate 23 "Delay Analysis — by Cause and Severity" breakdown above
 * (delay_cause/is_excusable, the ORIGINAL fields, kept byte-for-byte per store.js's own
 * comment) never got extended to the richer Gate A-G model (status lifecycle,
 * delay_category, responsibility_classification, delayImpactEngine's own float-derived
 * criticality) — this gate adds that as a SECOND, additive breakdown ("Delay Analytics —
 * Status, Category, Responsibility & Criticality") rather than replacing or reinterpreting
 * the first, plus turns the existing "Delay Records (worst first)" list into a genuinely
 * browsable Delay Register: each row now also shows its Status/Category/Responsibility/
 * Criticality, and a Status filter narrows which rows the list shows (the KPIs and both
 * breakdown panels above stay computed over the full active-portfolio set, unfiltered —
 * only the row list itself narrows, same "local filter on one browsable list" scope as
 * every other filter this gate could have touched but didn't). Criticality is read via
 * delayImpactEngine.computeDelayImpact() only (cheap — already-cached activity fields),
 * never computeProjectFinishImpact() in this loop, per that function's own "single
 * delay's own detail view, not a register/list" warning (same rule Gate G's
 * getDelayImpactSummary() already established).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var RECOVERY_ACTION_STATUS_LABELS = { open: "Open", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
  // Duplicated from pages/schedule.js verbatim — same established per-module-helpers
  // convention as recoveryActionOverdue() below.
  var DELAY_CAUSE_LABELS = {
    owner_caused: "Owner-Caused",
    contractor_caused: "Contractor-Caused",
    weather_force_majeure: "Weather / Force Majeure",
    design_rfi_driven: "Design / RFI-Driven",
    other: "Other",
  };
  // Gate 23: severity buckets for delay_days, a fixed practical scale (not user-
  // configurable, unlike near_critical_threshold_days — this is a display grouping, not
  // a calculation input, so there's no per-schedule reason it would need to vary).
  function delaySeverityBucket(days) {
    if (days == null) return "Unspecified";
    if (days < 5) return "Minor (<5d)";
    if (days <= 15) return "Moderate (5-15d)";
    return "Severe (>15d)";
  }

  // Gate H: duplicated from pages/schedule.js verbatim — same established per-module-
  // helpers convention as DELAY_CAUSE_LABELS above (this file already duplicates one
  // label map from schedule.js; these are the newer Gate A-D ones it never picked up).
  var DELAY_STATUS_LABELS = {
    open: "Open",
    investigating: "Under Investigation",
    mitigation_in_progress: "Mitigation in Progress",
    recovery_in_progress: "Recovery in Progress",
    recovered: "Recovered",
    closed: "Closed",
  };
  var DELAY_STATUS_BADGE_CLASS = {
    open: "at_risk",
    investigating: "at_risk",
    mitigation_in_progress: "info",
    recovery_in_progress: "info",
    recovered: "complete",
    closed: "complete",
  };
  var DELAY_CATEGORY_LABELS = {
    late_material: "Late Material",
    late_vendor_submission: "Late Vendor Submission",
    late_drawing: "Late Drawing",
    design_change: "Design Change",
    client_delay: "Client Delay",
    consultant_delay: "Consultant Delay",
    vendor_delay: "Vendor Delay",
    contractor_delay: "Contractor Delay",
    approval_delay: "Approval Delay",
    rfi_delay: "RFI Delay",
    resource_shortage: "Resource Shortage",
    equipment_shortage: "Equipment Shortage",
    site_access: "Site Access",
    site_constraint: "Site Constraint",
    interface_issue: "Interface Issue",
    weather: "Weather",
    procurement: "Procurement",
    quality_issue: "Quality Issue",
    rework: "Rework",
    change_variation: "Change / Variation",
    other: "Other",
  };
  var DELAY_RESPONSIBILITY_LABELS = {
    client: "Client",
    consultant: "Consultant",
    main_contractor: "Main Contractor",
    subcontractor: "Subcontractor",
    vendor: "Vendor",
    internal: "Internal",
    external: "External",
    shared: "Shared",
    unconfirmed: "Unconfirmed",
  };
  var DELAY_CRITICALITY_LABELS = {
    critical: "Critical",
    near_critical: "Near Critical",
    non_critical: "Non-Critical",
  };
  var DELAY_CRITICALITY_BADGE_CLASS = {
    critical: "critical",
    near_critical: "at_risk",
    non_critical: "complete",
  };

  // Gate H: read-only, cheap (no CPM recompute — see this file's own header comment for
  // why computeProjectFinishImpact() must never be looped like this). Returns null when
  // the schedule has never been calculated for every linked activity, same "genuinely
  // unknown, not a fourth value" convention delayImpactEngine.js's own
  // classifyCriticality() already establishes.
  function delayCriticality(delayRecord, data) {
    var links = data.delay_activity_links.filter(function (l) { return l.delay_id === delayRecord.id; });
    return window.PCC.delayImpactEngine.computeDelayImpact(delayRecord, links, data).overall_criticality;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  // Duplicated from pages/schedule.js verbatim — small enough to fit this app's
  // established per-module-helpers convention rather than exporting a shared one.
  function recoveryActionOverdue(action) {
    if (action.status === "completed" || action.status === "cancelled") return false;
    if (!action.target_recovery_date) return false;
    return action.target_recovery_date < todayIso();
  }

  function fmtMoney(amount) {
    if (amount === null || amount === undefined || amount === "" || isNaN(Number(amount))) return null;
    return Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function kpiCard(label, value, colorVar) {
    var card = document.createElement("div");
    card.className = "kpi-card";
    var valueStyle = colorVar ? ' style="color:var(' + colorVar + ')"' : "";
    card.innerHTML =
      '<span class="kpi-card__label">' + label + '</span><span class="kpi-card__value mono"' + valueStyle + ">" + value + "</span>";
    return card;
  }

  function viewInScheduleBtn(activity) {
    var btn = document.createElement("button");
    btn.className = "btn btn--ghost";
    btn.textContent = "View in Schedule";
    btn.onclick = function () {
      window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
      window.PCC.router.go("schedule");
    };
    return btn;
  }

  function actionRow(r, activity, project, showBadge) {
    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "flex-start";
    row.style.gap = "var(--space-2)";
    row.style.padding = "var(--space-2) 0";
    row.style.borderBottom = "1px solid var(--divider)";
    row.style.fontSize = "var(--text-sm)";

    var overdue = recoveryActionOverdue(r);
    var left = document.createElement("div");
    left.innerHTML =
      "<strong>" + r.description + "</strong>" +
      "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
      (activity ? activity.name : "(deleted activity)") + " — " + (project ? project.name || "(unnamed project)" : "(deleted project)") +
      "</p>" +
      "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
      (r.responsible_person ? r.responsible_person + " · " : "") +
      (r.target_recovery_date ? "target " + r.target_recovery_date : "no target date") +
      (r.estimated_recovery_days != null ? " · est. " + r.estimated_recovery_days + "d recovery" : "") +
      (fmtMoney(r.estimated_cost) != null ? " · est. cost " + fmtMoney(r.estimated_cost) : "") +
      "</p>";
    row.appendChild(left);

    var right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "var(--space-2)";
    right.style.flexShrink = "0";

    if (showBadge) {
      var badge = document.createElement("span");
      badge.className =
        "status-badge status-badge--" +
        (overdue ? "critical" : r.status === "completed" ? "complete" : r.status === "cancelled" ? "info" : "at_risk");
      badge.style.fontSize = "var(--text-xs)";
      badge.textContent = overdue ? "Overdue" : RECOVERY_ACTION_STATUS_LABELS[r.status];
      right.appendChild(badge);
    }

    if (activity) right.appendChild(viewInScheduleBtn(activity));

    row.appendChild(right);
    return row;
  }

  // Gate H: this page was fully stateless before (nothing to filter) — a local-only
  // filter for the new Delay Register list below (see this file's own header comment for
  // why it's scoped to just that one list rather than the whole page).
  var uiState = {
    registerStatusFilter: "",
  };

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();
    var activeProjectIds = {};
    data.projects.forEach(function (p) {
      if (!p.archived) activeProjectIds[p.id] = true;
    });
    var projectsById = {};
    data.projects.forEach(function (p) { projectsById[p.id] = p; });
    var activitiesById = {};
    data.activities.forEach(function (a) { activitiesById[a.id] = a; });

    var actions = data.recovery_actions.filter(function (r) {
      return activeProjectIds[r.project_id];
    });
    var delayRecords = data.delay_records.filter(function (r) {
      return activeProjectIds[r.project_id];
    });

    var wrap = document.createElement("div");
    var h1 = document.createElement("h2");
    h1.textContent = "Delay & Recovery Dashboard";
    h1.style.marginBottom = "var(--space-1)";
    wrap.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "var(--space-5)";
    sub.textContent =
      actions.length === 0 && delayRecords.length === 0
        ? "Nothing logged across the active portfolio yet — add a recovery action or delay record from an activity's own Detail Panel in the Schedule module (Gantt tab)."
        : "Portfolio-wide recovery actions and delay records across " + Object.keys(activeProjectIds).length + " active project" + (Object.keys(activeProjectIds).length === 1 ? "" : "s") + ". Finish-variance/float-erosion analysis itself stays in each schedule's own Baselines tab.";
    wrap.appendChild(sub);

    if (actions.length === 0 && delayRecords.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "Nothing to show yet. Once activities have recovery actions or delay records logged against them, this dashboard will roll them up.";
      wrap.appendChild(empty);
      outlet.appendChild(wrap);
      return;
    }

    // ---- Delay Analysis (Gate 23): severity/causation breakdown of delay_records ----
    if (delayRecords.length > 0) {
      var totalDelayDays = delayRecords.reduce(function (sum, r) { return sum + (r.delay_days || 0); }, 0);
      var excusableCount = delayRecords.filter(function (r) { return r.is_excusable; }).length;

      var delayKpiGrid = document.createElement("div");
      delayKpiGrid.className = "kpi-grid";
      delayKpiGrid.appendChild(kpiCard("DELAY RECORDS", delayRecords.length, null));
      delayKpiGrid.appendChild(kpiCard("TOTAL DELAY DAYS", totalDelayDays, totalDelayDays > 0 ? "--status-critical" : null));
      delayKpiGrid.appendChild(kpiCard("EXCUSABLE", excusableCount, null));
      delayKpiGrid.appendChild(kpiCard("NON-EXCUSABLE", delayRecords.length - excusableCount, null));
      wrap.appendChild(delayKpiGrid);

      var breakdownPanel = document.createElement("div");
      breakdownPanel.className = "panel";
      breakdownPanel.style.marginTop = "var(--space-4)";
      var breakdownHeading = document.createElement("h3");
      breakdownHeading.style.marginBottom = "var(--space-2)";
      breakdownHeading.textContent = "Delay Analysis — by Cause and Severity";
      breakdownPanel.appendChild(breakdownHeading);

      var byCause = {};
      var bySeverity = {};
      delayRecords.forEach(function (r) {
        var cause = r.delay_cause || "other";
        byCause[cause] = (byCause[cause] || 0) + 1;
        var bucket = delaySeverityBucket(r.delay_days);
        bySeverity[bucket] = (bySeverity[bucket] || 0) + 1;
      });

      var causeLine = document.createElement("p");
      causeLine.style.fontSize = "var(--text-sm)";
      causeLine.style.marginBottom = "var(--space-2)";
      causeLine.innerHTML =
        "<strong>By cause:</strong> " +
        window.PCC.store.DELAY_RECORD_CAUSES.filter(function (c) { return byCause[c]; })
          .map(function (c) { return DELAY_CAUSE_LABELS[c] + " (" + byCause[c] + ")"; })
          .join(" · ");
      breakdownPanel.appendChild(causeLine);

      var severityOrder = ["Severe (>15d)", "Moderate (5-15d)", "Minor (<5d)", "Unspecified"];
      var severityLine = document.createElement("p");
      severityLine.style.fontSize = "var(--text-sm)";
      severityLine.innerHTML =
        "<strong>By severity:</strong> " +
        severityOrder.filter(function (s) { return bySeverity[s]; })
          .map(function (s) { return s + " (" + bySeverity[s] + ")"; })
          .join(" · ");
      breakdownPanel.appendChild(severityLine);
      wrap.appendChild(breakdownPanel);

      // ---- Delay Analytics (Gate H): a second, additive breakdown of the same
      // delayRecords set, over the newer Gate A-G model this file never picked up before
      // this gate — Status lifecycle, Category, Responsibility Classification, and
      // delayImpactEngine's own float-derived Criticality. Kept as its own panel rather
      // than merged into "Delay Analysis — by Cause and Severity" above: that panel is
      // the original Gate 23 fields verbatim, this is the newer, richer model, and the
      // two shouldn't be presented as one blended taxonomy. ----
      var analyticsPanel = document.createElement("div");
      analyticsPanel.className = "panel";
      analyticsPanel.style.marginTop = "var(--space-4)";
      var analyticsHeading = document.createElement("h3");
      analyticsHeading.style.marginBottom = "var(--space-2)";
      analyticsHeading.textContent = "Delay Analytics — Status, Category, Responsibility & Criticality";
      analyticsPanel.appendChild(analyticsHeading);

      var byStatus = {};
      var byCategory = {};
      var byResponsibility = {};
      var byCriticality = {};
      delayRecords.forEach(function (r) {
        var status = r.status || "open";
        byStatus[status] = (byStatus[status] || 0) + 1;
        var category = r.delay_category || "other";
        byCategory[category] = (byCategory[category] || 0) + 1;
        var responsibility = r.responsibility_classification || "unconfirmed";
        byResponsibility[responsibility] = (byResponsibility[responsibility] || 0) + 1;
        var criticality = delayCriticality(r, data) || "not_calculated";
        byCriticality[criticality] = (byCriticality[criticality] || 0) + 1;
      });

      function analyticsLine(label, orderedKeys, counts, labelMap) {
        var line = document.createElement("p");
        line.style.fontSize = "var(--text-sm)";
        line.style.marginBottom = "var(--space-2)";
        line.innerHTML =
          "<strong>" + label + ":</strong> " +
          orderedKeys
            .filter(function (k) { return counts[k]; })
            .map(function (k) { return (labelMap[k] || k) + " (" + counts[k] + ")"; })
            .join(" · ");
        return line;
      }

      analyticsPanel.appendChild(analyticsLine("By status", window.PCC.store.DELAY_RECORD_STATUSES, byStatus, DELAY_STATUS_LABELS));
      analyticsPanel.appendChild(analyticsLine("By category", window.PCC.store.DELAY_CATEGORIES, byCategory, DELAY_CATEGORY_LABELS));
      analyticsPanel.appendChild(analyticsLine("By responsibility", window.PCC.store.DELAY_RESPONSIBILITY_CLASSIFICATIONS, byResponsibility, DELAY_RESPONSIBILITY_LABELS));
      var criticalityLine = analyticsLine(
        "By criticality",
        ["critical", "near_critical", "non_critical", "not_calculated"],
        byCriticality,
        { critical: "Critical", near_critical: "Near Critical", non_critical: "Non-Critical", not_calculated: "Not Yet Calculated" }
      );
      criticalityLine.style.marginBottom = "0";
      analyticsPanel.appendChild(criticalityLine);
      wrap.appendChild(analyticsPanel);

      // ---- Delay Register (Gate H): the same delayRecords rows, now browsable by
      // Status (a local filter — see this file's own header comment for why only the
      // list narrows, not the KPIs/breakdown panels above), and each row now also shows
      // its Status/Category/Responsibility/Criticality alongside the original Gate 23
      // cause/severity line (kept unchanged, not replaced). ----
      var delayListPanel = document.createElement("div");
      delayListPanel.className = "panel";
      delayListPanel.style.marginTop = "var(--space-4)";
      var delayListHeading = document.createElement("h3");
      delayListHeading.style.marginBottom = "var(--space-2)";
      delayListHeading.textContent = "Delay Records (worst first)";
      delayListPanel.appendChild(delayListHeading);

      var registerToolbar = document.createElement("div");
      registerToolbar.className = "toolbar no-print";
      registerToolbar.style.marginBottom = "var(--space-2)";
      var statusFilterSelect = document.createElement("select");
      var allStatusesOpt = document.createElement("option");
      allStatusesOpt.value = "";
      allStatusesOpt.textContent = "All Statuses";
      statusFilterSelect.appendChild(allStatusesOpt);
      window.PCC.store.DELAY_RECORD_STATUSES.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = s;
        opt.textContent = DELAY_STATUS_LABELS[s];
        statusFilterSelect.appendChild(opt);
      });
      statusFilterSelect.value = uiState.registerStatusFilter;
      statusFilterSelect.onchange = function () {
        uiState.registerStatusFilter = statusFilterSelect.value;
        rerender();
      };
      registerToolbar.appendChild(statusFilterSelect);
      delayListPanel.appendChild(registerToolbar);

      var registerRecords = uiState.registerStatusFilter
        ? delayRecords.filter(function (r) { return r.status === uiState.registerStatusFilter; })
        : delayRecords;

      if (registerRecords.length === 0) {
        var noMatch = document.createElement("p");
        noMatch.className = "text-secondary";
        noMatch.style.fontSize = "var(--text-sm)";
        noMatch.textContent = "No delay records match this status filter.";
        delayListPanel.appendChild(noMatch);
      }

      registerRecords
        .slice()
        .sort(function (a, b) { return (b.delay_days || 0) - (a.delay_days || 0); })
        .forEach(function (r) {
          var activity = r.activity_id ? activitiesById[r.activity_id] : null;
          var project = projectsById[r.project_id];
          var row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "flex-start";
          row.style.gap = "var(--space-2)";
          row.style.padding = "var(--space-2) 0";
          row.style.borderBottom = "1px solid var(--divider)";
          row.style.fontSize = "var(--text-sm)";

          var activityLine = !r.activity_id
            ? "Schedule Impact Not Yet Assessed"
            : (activity ? activity.name : "(deleted activity)");
          var criticality = delayCriticality(r, data);

          var left = document.createElement("div");
          left.innerHTML =
            "<strong>" + r.description + "</strong>" +
            "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
            activityLine + " — " + (project ? project.name || "(unnamed project)" : "(deleted project)") +
            "</p>" +
            "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
            DELAY_CAUSE_LABELS[r.delay_cause] +
            (r.delay_days != null ? " · " + r.delay_days + "d (" + delaySeverityBucket(r.delay_days) + ")" : "") +
            "</p>" +
            "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
            (DELAY_STATUS_LABELS[r.status] || r.status) + " · " +
            (DELAY_CATEGORY_LABELS[r.delay_category] || r.delay_category || "Other") + " · " +
            (DELAY_RESPONSIBILITY_LABELS[r.responsibility_classification] || "Unconfirmed") +
            (criticality ? " · " + DELAY_CRITICALITY_LABELS[criticality] : "") +
            "</p>";
          row.appendChild(left);

          var right = document.createElement("div");
          right.style.display = "flex";
          right.style.alignItems = "center";
          right.style.gap = "var(--space-2)";
          right.style.flexShrink = "0";

          var badge = document.createElement("span");
          badge.className = "status-badge status-badge--" + (r.is_excusable ? "complete" : "at_risk");
          badge.style.fontSize = "var(--text-xs)";
          badge.textContent = r.is_excusable ? "Excusable" : "Non-Excusable";
          right.appendChild(badge);

          var statusBadge = document.createElement("span");
          statusBadge.className = "status-badge status-badge--" + (DELAY_STATUS_BADGE_CLASS[r.status] || "info");
          statusBadge.style.fontSize = "var(--text-xs)";
          statusBadge.textContent = DELAY_STATUS_LABELS[r.status] || r.status;
          right.appendChild(statusBadge);

          if (criticality) {
            var criticalityBadge = document.createElement("span");
            criticalityBadge.className = "status-badge status-badge--" + DELAY_CRITICALITY_BADGE_CLASS[criticality];
            criticalityBadge.style.fontSize = "var(--text-xs)";
            criticalityBadge.textContent = DELAY_CRITICALITY_LABELS[criticality];
            right.appendChild(criticalityBadge);
          }

          if (activity) right.appendChild(viewInScheduleBtn(activity));
          else if (project) {
            var viewProjectBtn = document.createElement("button");
            viewProjectBtn.className = "btn btn--ghost";
            viewProjectBtn.textContent = "View Project";
            viewProjectBtn.onclick = function () {
              window.PCC.portfolio.viewProject(project.id);
              window.PCC.router.go("portfolio");
            };
            right.appendChild(viewProjectBtn);
          }

          row.appendChild(right);
          delayListPanel.appendChild(row);
        });
      wrap.appendChild(delayListPanel);
      // ---- Delay <-> Recovery Gap (Gate 26, Integrated Project Controls) — portfolio-
      // wide version of the same per-activity computation in executiveCenter.js's
      // buildProjectContext() (see that file's own comment for the full reasoning:
      // per-activity, not flat, so recovery estimated on one activity can't appear to
      // "cancel out" delay logged on an unrelated one; open recovery actions only;
      // floored at 0). Independently re-derived here rather than calling into
      // executiveCenter.js, per this app's established per-module-duplication
      // convention (recoveryActionOverdue() above is the same pattern). ----
      var openActionsForGap = actions.filter(function (r) { return r.status === "open" || r.status === "in_progress"; });
      var gapDelayByActivity = {};
      delayRecords.forEach(function (r) {
        gapDelayByActivity[r.activity_id] = (gapDelayByActivity[r.activity_id] || 0) + (r.delay_days || 0);
      });
      var gapRecoveryByActivity = {};
      openActionsForGap.forEach(function (r) {
        gapRecoveryByActivity[r.activity_id] = (gapRecoveryByActivity[r.activity_id] || 0) + (r.estimated_recovery_days || 0);
      });
      var gapActivities = [];
      var totalUnaddressedGapDays = 0;
      Object.keys(gapDelayByActivity).forEach(function (activityId) {
        var gapDelayDays = gapDelayByActivity[activityId];
        var gapRecoveryDays = gapRecoveryByActivity[activityId] || 0;
        var gapDays = Math.max(0, gapDelayDays - gapRecoveryDays);
        totalUnaddressedGapDays += gapDays;
        if (gapDays > 0) {
          var gapActivity = activitiesById[activityId];
          var gapProject = gapActivity ? projectsById[gapActivity.project_id] : null;
          gapActivities.push({ activity: gapActivity, project: gapProject, delayDays: gapDelayDays, recoveryDays: gapRecoveryDays, gapDays: gapDays });
        }
      });
      gapActivities.sort(function (a, b) { return b.gapDays - a.gapDays; });

      var gapKpiGrid = document.createElement("div");
      gapKpiGrid.className = "kpi-grid";
      gapKpiGrid.style.marginTop = "var(--space-3)";
      gapKpiGrid.appendChild(kpiCard("UNADDRESSED DELAY (DAYS)", totalUnaddressedGapDays, totalUnaddressedGapDays > 0 ? "--status-critical" : null));
      wrap.appendChild(gapKpiGrid);

      if (gapActivities.length > 0) {
        var gapPanel = document.createElement("div");
        gapPanel.className = "panel";
        gapPanel.style.marginTop = "var(--space-4)";
        var gapHeading = document.createElement("h3");
        gapHeading.style.marginBottom = "var(--space-2)";
        gapHeading.textContent = "Activities With Unaddressed Delay (worst first)";
        gapPanel.appendChild(gapHeading);
        gapActivities.forEach(function (g) {
          var row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "flex-start";
          row.style.gap = "var(--space-2)";
          row.style.padding = "var(--space-2) 0";
          row.style.borderBottom = "1px solid var(--divider)";
          row.style.fontSize = "var(--text-sm)";
          var left = document.createElement("div");
          left.innerHTML =
            "<strong>" + (g.activity ? g.activity.name : "(deleted activity)") + "</strong>" +
            "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
            (g.project ? g.project.name || "(unnamed project)" : "(deleted project)") +
            "</p>" +
            "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
            g.delayDays + "d delay, " + g.recoveryDays + "d recovery estimated (" + g.gapDays + "d unaddressed)" +
            "</p>";
          row.appendChild(left);
          if (g.activity) {
            var right = document.createElement("div");
            right.style.flexShrink = "0";
            right.appendChild(viewInScheduleBtn(g.activity));
            row.appendChild(right);
          }
          gapPanel.appendChild(row);
        });
        wrap.appendChild(gapPanel);
      }
    } else {
      var noDelay = document.createElement("div");
      noDelay.className = "panel empty-state";
      noDelay.style.marginBottom = "var(--space-4)";
      noDelay.textContent = "No delay records logged across the active portfolio yet.";
      wrap.appendChild(noDelay);
    }

    // ---- Recovery Actions (pre-existing) ----
    if (actions.length === 0) {
      var noActions = document.createElement("div");
      noActions.className = "panel empty-state";
      noActions.textContent = "No recovery actions logged across the active portfolio yet.";
      wrap.appendChild(noActions);
      outlet.appendChild(wrap);
      return;
    }

    var open = actions.filter(function (r) { return r.status === "open" || r.status === "in_progress"; });
    var closed = actions.filter(function (r) { return r.status === "completed" || r.status === "cancelled"; });
    var overdueCount = open.filter(recoveryActionOverdue).length;

    var openSorted = open.slice().sort(function (a, b) {
      var aOverdue = recoveryActionOverdue(a);
      var bOverdue = recoveryActionOverdue(b);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1; // overdue first
      var aDate = a.target_recovery_date || "9999-99-99";
      var bDate = b.target_recovery_date || "9999-99-99";
      return aDate.localeCompare(bDate); // then soonest target date first
    });

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";
    kpiGrid.appendChild(kpiCard("TOTAL RECOVERY ACTIONS", actions.length, null));
    kpiGrid.appendChild(kpiCard("OPEN", open.length, null));
    kpiGrid.appendChild(kpiCard("OVERDUE", overdueCount, overdueCount > 0 ? "--status-critical" : null));
    kpiGrid.appendChild(kpiCard("COMPLETED", actions.filter(function (r) { return r.status === "completed"; }).length, null));
    wrap.appendChild(kpiGrid);

    // Gate 24 (PCC Evolution Roadmap, Tier F: Recovery & Mitigation Planning):
    // quantified rollup across OPEN actions only — a completed/cancelled action's
    // estimate is historical, not a live commitment to weigh against the portfolio.
    var estDaysTotal = open.reduce(function (sum, r) { return sum + (r.estimated_recovery_days || 0); }, 0);
    var estCostTotal = open.reduce(function (sum, r) { return sum + (r.estimated_cost || 0); }, 0);
    if (estDaysTotal > 0 || estCostTotal > 0) {
      var estGrid = document.createElement("div");
      estGrid.className = "kpi-grid";
      estGrid.style.marginTop = "var(--space-3)";
      estGrid.appendChild(kpiCard("EST. RECOVERY DAYS (OPEN)", estDaysTotal, null));
      estGrid.appendChild(kpiCard("EST. RECOVERY COST (OPEN)", fmtMoney(estCostTotal) || "0", null));
      wrap.appendChild(estGrid);
    }

    var openPanel = document.createElement("div");
    openPanel.className = "panel";
    openPanel.style.marginTop = "var(--space-4)";
    var openHeading = document.createElement("h3");
    openHeading.style.marginBottom = "var(--space-2)";
    openHeading.textContent = "Open Recovery Actions (overdue first)";
    openPanel.appendChild(openHeading);

    if (openSorted.length === 0) {
      var noOpen = document.createElement("p");
      noOpen.className = "text-secondary";
      noOpen.style.fontSize = "var(--text-sm)";
      noOpen.textContent = "No open recovery actions — every logged action has been completed or cancelled.";
      openPanel.appendChild(noOpen);
    } else {
      openSorted.forEach(function (r) {
        openPanel.appendChild(actionRow(r, activitiesById[r.activity_id], projectsById[r.project_id], true));
      });
    }
    wrap.appendChild(openPanel);

    var closedPanel = document.createElement("div");
    closedPanel.className = "panel";
    closedPanel.style.marginTop = "var(--space-4)";
    var closedHeading = document.createElement("h3");
    closedHeading.style.marginBottom = "var(--space-2)";
    closedHeading.textContent = "Completed / Cancelled (" + closed.length + ")";
    closedPanel.appendChild(closedHeading);

    if (closed.length === 0) {
      var noClosed = document.createElement("p");
      noClosed.className = "text-secondary";
      noClosed.style.fontSize = "var(--text-sm)";
      noClosed.textContent = "None yet.";
      closedPanel.appendChild(noClosed);
    } else {
      closed
        .slice()
        .sort(function (a, b) { return (b.updated_at || "").localeCompare(a.updated_at || ""); })
        .forEach(function (r) {
          closedPanel.appendChild(actionRow(r, activitiesById[r.activity_id], projectsById[r.project_id], true));
        });
    }
    wrap.appendChild(closedPanel);

    outlet.appendChild(wrap);
  }

  window.PCC.pages.delayRecoveryDashboard = render;
})();
