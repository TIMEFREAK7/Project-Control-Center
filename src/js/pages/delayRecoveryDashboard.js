/* Delay & Recovery Dashboard (PCC Evolution Roadmap, Tier C: Project Performance;
 * extended Tier F Gate 23: Advanced Delay Analysis).
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
      window.PCC.router.render();
    };
    return btn;
  }

  function actionRow(r, activity, project, showBadge) {
    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "flex-start";
    row.style.gap = "8px";
    row.style.padding = "8px 0";
    row.style.borderBottom = "1px solid var(--divider)";
    row.style.fontSize = "13px";

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
      "</p>";
    row.appendChild(left);

    var right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "8px";
    right.style.flexShrink = "0";

    if (showBadge) {
      var badge = document.createElement("span");
      badge.className =
        "status-badge status-badge--" +
        (overdue ? "critical" : r.status === "completed" ? "complete" : r.status === "cancelled" ? "info" : "at_risk");
      badge.style.fontSize = "11px";
      badge.textContent = overdue ? "Overdue" : RECOVERY_ACTION_STATUS_LABELS[r.status];
      right.appendChild(badge);
    }

    if (activity) right.appendChild(viewInScheduleBtn(activity));

    row.appendChild(right);
    return row;
  }

  function render(outlet) {
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
    h1.style.marginBottom = "4px";
    wrap.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "20px";
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
      breakdownPanel.style.marginTop = "16px";
      var breakdownHeading = document.createElement("h3");
      breakdownHeading.style.marginBottom = "8px";
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
      causeLine.style.fontSize = "13px";
      causeLine.style.marginBottom = "6px";
      causeLine.innerHTML =
        "<strong>By cause:</strong> " +
        window.PCC.store.DELAY_RECORD_CAUSES.filter(function (c) { return byCause[c]; })
          .map(function (c) { return DELAY_CAUSE_LABELS[c] + " (" + byCause[c] + ")"; })
          .join(" · ");
      breakdownPanel.appendChild(causeLine);

      var severityOrder = ["Severe (>15d)", "Moderate (5-15d)", "Minor (<5d)", "Unspecified"];
      var severityLine = document.createElement("p");
      severityLine.style.fontSize = "13px";
      severityLine.innerHTML =
        "<strong>By severity:</strong> " +
        severityOrder.filter(function (s) { return bySeverity[s]; })
          .map(function (s) { return s + " (" + bySeverity[s] + ")"; })
          .join(" · ");
      breakdownPanel.appendChild(severityLine);
      wrap.appendChild(breakdownPanel);

      var delayListPanel = document.createElement("div");
      delayListPanel.className = "panel";
      delayListPanel.style.marginTop = "16px";
      var delayListHeading = document.createElement("h3");
      delayListHeading.style.marginBottom = "8px";
      delayListHeading.textContent = "Delay Records (worst first)";
      delayListPanel.appendChild(delayListHeading);

      delayRecords
        .slice()
        .sort(function (a, b) { return (b.delay_days || 0) - (a.delay_days || 0); })
        .forEach(function (r) {
          var activity = activitiesById[r.activity_id];
          var project = projectsById[r.project_id];
          var row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "flex-start";
          row.style.gap = "8px";
          row.style.padding = "8px 0";
          row.style.borderBottom = "1px solid var(--divider)";
          row.style.fontSize = "13px";

          var left = document.createElement("div");
          left.innerHTML =
            "<strong>" + r.description + "</strong>" +
            "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
            (activity ? activity.name : "(deleted activity)") + " — " + (project ? project.name || "(unnamed project)" : "(deleted project)") +
            "</p>" +
            "<p class='text-secondary' style='font-size:12px;margin:4px 0 0'>" +
            DELAY_CAUSE_LABELS[r.delay_cause] +
            (r.delay_days != null ? " · " + r.delay_days + "d (" + delaySeverityBucket(r.delay_days) + ")" : "") +
            "</p>";
          row.appendChild(left);

          var right = document.createElement("div");
          right.style.display = "flex";
          right.style.alignItems = "center";
          right.style.gap = "8px";
          right.style.flexShrink = "0";

          var badge = document.createElement("span");
          badge.className = "status-badge status-badge--" + (r.is_excusable ? "complete" : "at_risk");
          badge.style.fontSize = "11px";
          badge.textContent = r.is_excusable ? "Excusable" : "Non-Excusable";
          right.appendChild(badge);

          if (activity) right.appendChild(viewInScheduleBtn(activity));

          row.appendChild(right);
          delayListPanel.appendChild(row);
        });
      wrap.appendChild(delayListPanel);
    } else {
      var noDelay = document.createElement("div");
      noDelay.className = "panel empty-state";
      noDelay.style.marginBottom = "16px";
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

    var openPanel = document.createElement("div");
    openPanel.className = "panel";
    openPanel.style.marginTop = "16px";
    var openHeading = document.createElement("h3");
    openHeading.style.marginBottom = "8px";
    openHeading.textContent = "Open Recovery Actions (overdue first)";
    openPanel.appendChild(openHeading);

    if (openSorted.length === 0) {
      var noOpen = document.createElement("p");
      noOpen.className = "text-secondary";
      noOpen.style.fontSize = "13px";
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
    closedPanel.style.marginTop = "16px";
    var closedHeading = document.createElement("h3");
    closedHeading.style.marginBottom = "8px";
    closedHeading.textContent = "Completed / Cancelled (" + closed.length + ")";
    closedPanel.appendChild(closedHeading);

    if (closed.length === 0) {
      var noClosed = document.createElement("p");
      noClosed.className = "text-secondary";
      noClosed.style.fontSize = "13px";
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
