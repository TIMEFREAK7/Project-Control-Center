/* Commitment Management (PCC Evolution Roadmap, Tier F, Gate 19) — Purchase Orders,
 * Subcontracts, and other commercial commitments, establishing the missing link in
 * SCHEDULE <-> COMMERCIAL COMMITMENT <-> VENDOR <-> COST. Executive Center's own Cost
 * KPI section has flagged "Commitments... aren't tracked anywhere in PCC yet" since
 * Gate 9; this is that gate.
 *
 * SCOPE, DELIBERATELY (Aditya, confirmed via AskUserQuestion before building):
 * - Actual Value is NOT a field on the commitment record — it's a LIVE SUM of every
 *   Cost Tracking actual cost entry whose own `commitment_id` points back at this
 *   commitment (cost.js's Actual Cost form gained a "Against Commitment" select this
 *   same gate). Remaining Commitment (committed minus that live sum) is likewise
 *   computed here at render time, never stored — same "computed, never denormalized"
 *   convention this app uses everywhere (Document Available/Overdue, health-score RAG
 *   bands, Portfolio's Delayed/Upcoming KPIs).
 * - Package is a new shared, portfolio-wide register (`packages`, Packages tab below),
 *   not project-scoped — same "shared reusable master data" pattern Vendors/Resources
 *   already established. Documents' own free-text `package` field (Gate 16) gained an
 *   additive `package_id` selecting from this same list; the old free-text value on any
 *   existing document is untouched, just no longer shown by that form.
 * - Full Budget -> Commitments -> Actual -> Forecast wiring into costEvmEngine.js's own
 *   EAC/CPI/SPI math is explicitly "eventually" per the spec, not this gate —
 *   Commitments surfaces its own independent KPI set (here and in Executive Center)
 *   without altering EVM's calculations.
 * - No direct wbs_id — WBS is reached transitively via the linked activity's own
 *   wbs_id, matching the app-wide convention (only Activity itself carries wbs_id
 *   directly).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var TYPE_LABELS = {
    purchase_order: "Purchase Order",
    subcontract: "Subcontract",
    vendor_commitment: "Vendor Commitment",
    material_commitment: "Material Commitment",
    service_commitment: "Service Commitment",
    approved_commercial_commitment: "Approved Commercial Commitment",
  };
  var STATUS_LABELS = { draft: "Draft", issued: "Issued", approved: "Approved", closed: "Closed", cancelled: "Cancelled" };

  var uiState = {
    tab: "commitments", // 'commitments' | 'packages'
    editingCommitmentId: null,
    editingPackageId: null,
    search: "",
    projectFilter: "",
    // Redesign Gate 6 (Global Project Context): see risks.js's own uiState comment.
    projectFilterInitialized: false,
    vendorFilter: "",
    packageFilter: "",
    typeFilter: "",
    statusFilter: "",
  };

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s === null || s === undefined ? "" : String(s);
    return div.innerHTML;
  }

  function projectName(projects, projectId) {
    var p = projects.find(function (x) { return x.id === projectId; });
    return p ? p.name || "(unnamed project)" : "(project removed)";
  }

  function vendorName(vendors, vendorId) {
    if (!vendorId) return "";
    var v = vendors.find(function (x) { return x.id === vendorId; });
    return v ? v.vendor_name || "(unnamed vendor)" : "(vendor deleted)";
  }

  function packageName(packages, packageId) {
    if (!packageId) return "";
    var p = packages.find(function (x) { return x.id === packageId; });
    return p ? p.name || "(unnamed package)" : "(package deleted)";
  }

  function activityLabel(activities, activityId) {
    if (!activityId) return "";
    var a = activities.find(function (x) { return x.id === activityId; });
    return a ? a.name || "(unnamed activity)" : "(activity deleted)";
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "—";
    var n = Number(value);
    if (isNaN(n)) return "—";
    return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  /** The one computed figure every other piece of this page depends on — see the file
   * header for why this is never a stored field. */
  function actualValueFor(data, commitmentId) {
    return data.cost_actuals
      .filter(function (a) { return a.commitment_id === commitmentId; })
      .reduce(function (sum, a) { return sum + (Number(a.amount) || 0); }, 0);
  }

  function remainingFor(committedValue, actual) {
    if (committedValue === null || committedValue === undefined) return null;
    return Number(committedValue) - actual;
  }

  // PCC Evolution Roadmap, Tier F (Gate 19 follow-on): Schedule integration. Same
  // COMMITMENT_RISK_WINDOW_DAYS/effective-dates/risk rule as schedule.js's own
  // "commitments" LINKED_RECORD_SOURCES badge — duplicated here per this app's
  // per-module-helpers convention, so a Commitment reads the same "at risk" both on
  // its own page and on the activity it's linked to.
  var COMMITMENT_RISK_WINDOW_DAYS = 7;

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }
  function addDaysIso(isoDateStr, days) {
    var d = new Date(isoDateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function activityEffectiveStart(activity) {
    if (!activity || activity.activity_type === "milestone") return null;
    return activity.early_start || activity.planned_start || null;
  }

  /** True when this commitment's linked activity is imminent (starting within
   * COMMITMENT_RISK_WINDOW_DAYS) or already under way, but the commitment itself
   * isn't approved yet — a procurement lead-time risk, not just a status label. */
  function commitmentIsAtRisk(c, data) {
    if (!c.activity_id || c.status === "approved" || c.status === "closed" || c.status === "cancelled") return false;
    var activity = data.activities.find(function (a) { return a.id === c.activity_id; });
    var start = activityEffectiveStart(activity);
    if (!start) return false;
    return start <= addDaysIso(todayIso(), COMMITMENT_RISK_WINDOW_DAYS);
  }

  function activityOptionsFor(select, data, projectId, selectedActivityId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = projectId ? "(none)" : "(select a project first)";
    select.appendChild(noneOpt);
    if (!projectId) return;

    var scheduleNameById = {};
    data.schedules.filter(function (s) { return s.project_id === projectId; }).forEach(function (s) { scheduleNameById[s.id] = s.name; });
    data.activities
      .filter(function (a) { return a.project_id === projectId; })
      .forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = (scheduleNameById[a.schedule_id] || "(schedule)") + ": " + (a.name || "(unnamed activity)");
        select.appendChild(opt);
      });
    select.value = selectedActivityId || "";
  }

  function budgetItemOptionsFor(select, data, projectId, selectedBudgetItemId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = projectId ? "(none)" : "(select a project first)";
    select.appendChild(noneOpt);
    if (!projectId) return;
    data.cost_budget_items
      .filter(function (b) { return b.project_id === projectId; })
      .forEach(function (b) {
        var opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = b.name || "(unnamed budget item)";
        select.appendChild(opt);
      });
    select.value = selectedBudgetItemId || "";
  }

  // ---------------------------------------------------------------------------------
  // Commitments tab
  // ---------------------------------------------------------------------------------

  function renderCommitmentForm(container, commitment, data, rerender) {
    var isNew = uiState.editingCommitmentId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Commitment" : "Edit Commitment";
    panel.appendChild(heading);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    function selectField(id, label, options, includeNone, selectedValue) {
      var f = document.createElement("div");
      f.className = "field";
      f.innerHTML = "<label>" + label + "</label>";
      var s = document.createElement("select");
      s.id = id;
      if (includeNone) {
        var noneOpt = document.createElement("option");
        noneOpt.value = "";
        noneOpt.textContent = "(none)";
        s.appendChild(noneOpt);
      }
      options.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        s.appendChild(opt);
      });
      s.value = selectedValue || "";
      f.appendChild(s);
      return { field: f, select: s };
    }

    function textField(id, label, value, required) {
      var f = document.createElement("div");
      f.className = "field";
      f.innerHTML = "<label>" + label + (required ? " *" : "") + "</label>";
      var i = document.createElement("input");
      i.type = "text";
      i.id = id;
      i.value = value || "";
      if (required) i.required = true;
      f.appendChild(i);
      return { field: f, input: i };
    }

    function numberField(id, label, value) {
      var f = document.createElement("div");
      f.className = "field";
      f.innerHTML = "<label>" + label + "</label>";
      var i = document.createElement("input");
      i.type = "number";
      i.step = "any";
      i.id = id;
      i.value = value == null ? "" : value;
      f.appendChild(i);
      return { field: f, input: i };
    }

    function dateField(id, label, value) {
      var f = document.createElement("div");
      f.className = "field";
      f.innerHTML = "<label>" + label + "</label>";
      var i = document.createElement("input");
      i.type = "date";
      i.id = id;
      i.value = value || "";
      f.appendChild(i);
      return { field: f, input: i };
    }

    var activeProjects = data.projects.filter(function (p) { return !p.archived; });
    var proj = selectField(
      "cmtfield-project_id",
      "Project *",
      activeProjects.map(function (p) { return { value: p.id, label: p.name || "(unnamed project)" }; }),
      true,
      commitment.project_id
    );
    grid.appendChild(proj.field);

    var vendor = selectField(
      "cmtfield-vendor_id",
      "Vendor",
      data.vendors.map(function (v) { return { value: v.id, label: v.vendor_name || "(unnamed vendor)" }; }),
      true,
      commitment.vendor_id
    );
    grid.appendChild(vendor.field);

    var pkg = selectField(
      "cmtfield-package_id",
      "Package",
      data.packages.map(function (p) { return { value: p.id, label: p.name + (p.code ? " (" + p.code + ")" : "") }; }),
      true,
      commitment.package_id
    );
    grid.appendChild(pkg.field);

    var type = selectField(
      "cmtfield-type",
      "Type",
      window.PCC.store.COMMITMENT_TYPES.map(function (t) { return { value: t, label: TYPE_LABELS[t] }; }),
      false,
      commitment.type || "purchase_order"
    );
    grid.appendChild(type.field);

    var poNumber = textField("cmtfield-po_contract_number", "PO / Contract #", commitment.po_contract_number);
    grid.appendChild(poNumber.field);

    var commitmentDate = dateField("cmtfield-commitment_date", "Commitment Date", commitment.commitment_date);
    grid.appendChild(commitmentDate.field);

    var committedValue = numberField("cmtfield-committed_value", "Committed Value", commitment.committed_value);
    grid.appendChild(committedValue.field);

    var approvedValue = numberField("cmtfield-approved_value", "Approved Value", commitment.approved_value);
    grid.appendChild(approvedValue.field);

    var status = selectField(
      "cmtfield-status",
      "Status",
      window.PCC.store.COMMITMENT_STATUSES.map(function (s) { return { value: s, label: STATUS_LABELS[s] }; }),
      false,
      commitment.status || "draft"
    );
    grid.appendChild(status.field);

    var budgetItemField = document.createElement("div");
    budgetItemField.className = "field";
    budgetItemField.innerHTML = "<label>Against Budget Item</label>";
    var budgetItemSelect = document.createElement("select");
    budgetItemSelect.id = "cmtfield-budget_item_id";
    budgetItemOptionsFor(budgetItemSelect, data, proj.select.value, commitment.budget_item_id);
    budgetItemField.appendChild(budgetItemSelect);
    grid.appendChild(budgetItemField);

    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Related Activity</label>";
    var activitySelect = document.createElement("select");
    activitySelect.id = "cmtfield-activity_id";
    activityOptionsFor(activitySelect, data, proj.select.value, commitment.activity_id);
    activityField.appendChild(activitySelect);
    grid.appendChild(activityField);

    proj.select.onchange = function () {
      budgetItemOptionsFor(budgetItemSelect, data, proj.select.value, "");
      activityOptionsFor(activitySelect, data, proj.select.value, "");
    };

    form.appendChild(grid);

    var notesField = document.createElement("div");
    notesField.className = "field";
    notesField.innerHTML = "<label>Notes</label>";
    var notesArea = document.createElement("textarea");
    notesArea.id = "cmtfield-notes";
    notesArea.rows = 2;
    notesArea.value = commitment.notes || "";
    notesField.appendChild(notesArea);
    form.appendChild(notesField);

    if (!isNew) {
      var actualNote = document.createElement("p");
      actualNote.className = "text-secondary";
      actualNote.style.fontSize = "12px";
      var actual = actualValueFor(data, commitment.id);
      actualNote.textContent =
        "Actual Value is computed automatically — " + formatMoney(actual) +
        " so far, from Cost Tracking's Actual Cost entries logged against this commitment. Log or edit those in Cost Tracking, not here.";
      form.appendChild(actualNote);
    }

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Project is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Commitment" : "Save Changes";
    saveBtn.disabled = activeProjects.length === 0;

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingCommitmentId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      if (!proj.select.value) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = {
        project_id: proj.select.value,
        vendor_id: vendor.select.value,
        package_id: pkg.select.value,
        type: type.select.value,
        po_contract_number: poNumber.input.value,
        commitment_date: commitmentDate.input.value,
        committed_value: committedValue.input.value === "" ? null : Number(committedValue.input.value),
        approved_value: approvedValue.input.value === "" ? null : Number(approvedValue.input.value),
        status: status.select.value,
        budget_item_id: budgetItemSelect.value,
        activity_id: activitySelect.value,
        notes: notesArea.value,
      };

      window.PCC.store.update(function (d) {
        if (isNew) {
          d.commitments.push(window.PCC.store.newCommitment(values));
        } else {
          var existing = d.commitments.find(function (c) { return c.id === commitment.id; });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Commitment added." : "Commitment updated.", "success");
      uiState.editingCommitmentId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function commitmentMatchesFilters(c, data) {
    if (uiState.projectFilter && c.project_id !== uiState.projectFilter) return false;
    if (uiState.vendorFilter && c.vendor_id !== uiState.vendorFilter) return false;
    if (uiState.packageFilter && c.package_id !== uiState.packageFilter) return false;
    if (uiState.typeFilter && c.type !== uiState.typeFilter) return false;
    if (uiState.statusFilter && c.status !== uiState.statusFilter) return false;
    if (uiState.search) {
      var haystack = ((c.po_contract_number || "") + " " + (c.notes || "")).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderKpiStrip(filtered, data) {
    var totals = { committed: 0, approved: 0, actual: 0, remaining: 0, atRisk: 0 };
    filtered.forEach(function (c) {
      var actual = actualValueFor(data, c.id);
      totals.committed += Number(c.committed_value) || 0;
      totals.approved += Number(c.approved_value) || 0;
      totals.actual += actual;
      totals.remaining += remainingFor(c.committed_value, actual) || 0;
      if (commitmentIsAtRisk(c, data)) totals.atRisk++;
    });

    var grid = document.createElement("div");
    grid.className = "kpi-grid";
    grid.style.marginBottom = "16px";
    [
      { label: "TOTAL COMMITTED", value: formatMoney(totals.committed) },
      { label: "TOTAL APPROVED", value: formatMoney(totals.approved) },
      { label: "TOTAL ACTUAL", value: formatMoney(totals.actual) },
      { label: "TOTAL REMAINING", value: formatMoney(totals.remaining), colorVar: totals.remaining < 0 ? "--status-critical" : null },
      { label: "AT RISK", value: totals.atRisk, colorVar: totals.atRisk > 0 ? "--status-critical" : null },
    ].forEach(function (kpi) {
      var card = document.createElement("div");
      card.className = "kpi-card";
      var style = kpi.colorVar ? ' style="color:var(' + kpi.colorVar + ')"' : "";
      card.innerHTML = '<span class="kpi-card__label">' + kpi.label + '</span><span class="kpi-card__value mono"' + style + ">" + kpi.value + "</span>";
      grid.appendChild(card);
    });
    return grid;
  }

  function renderCommitmentsTab(container, data, rerender) {
    if (uiState.editingCommitmentId) {
      var commitmentBeingEdited =
        uiState.editingCommitmentId === "new"
          ? window.PCC.store.newCommitment({})
          : data.commitments.find(function (c) { return c.id === uiState.editingCommitmentId; });
      if (commitmentBeingEdited) renderCommitmentForm(container, commitmentBeingEdited, data, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search PO/Contract #, notes…";
    search.value = uiState.search;
    search.oninput = function () {
      uiState.search = search.value;
      renderList();
    };
    toolbar.appendChild(search);

    function filterSelect(defaultLabel, options, currentValue, onChange) {
      var s = document.createElement("select");
      var allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = defaultLabel;
      s.appendChild(allOpt);
      options.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        s.appendChild(opt);
      });
      s.value = currentValue;
      s.onchange = function () {
        onChange(s.value);
        renderList();
      };
      return s;
    }

    toolbar.appendChild(
      filterSelect(
        "All Projects",
        data.projects.map(function (p) { return { value: p.id, label: p.name || "(unnamed project)" }; }),
        uiState.projectFilter,
        function (v) {
          uiState.projectFilter = v;
          // Redesign Gate 6: see risks.js's own comment on this exact pattern.
          if (v) window.PCC.projectContext.set(v);
        }
      )
    );
    toolbar.appendChild(
      filterSelect(
        "All Vendors",
        data.vendors.map(function (v) { return { value: v.id, label: v.vendor_name || "(unnamed vendor)" }; }),
        uiState.vendorFilter,
        function (v) { uiState.vendorFilter = v; }
      )
    );
    toolbar.appendChild(
      filterSelect(
        "All Packages",
        data.packages.map(function (p) { return { value: p.id, label: p.name }; }),
        uiState.packageFilter,
        function (v) { uiState.packageFilter = v; }
      )
    );
    toolbar.appendChild(
      filterSelect(
        "All Types",
        window.PCC.store.COMMITMENT_TYPES.map(function (t) { return { value: t, label: TYPE_LABELS[t] }; }),
        uiState.typeFilter,
        function (v) { uiState.typeFilter = v; }
      )
    );
    toolbar.appendChild(
      filterSelect(
        "All Statuses",
        window.PCC.store.COMMITMENT_STATUSES.map(function (s) { return { value: s, label: STATUS_LABELS[s] }; }),
        uiState.statusFilter,
        function (v) { uiState.statusFilter = v; }
      )
    );

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var hasActiveProjects = data.projects.some(function (p) { return !p.archived; });
    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Commitment";
    addBtn.disabled = !hasActiveProjects;
    addBtn.title = hasActiveProjects ? "" : "Add a project in Portfolio first";
    addBtn.onclick = function () {
      uiState.editingCommitmentId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    var kpiWrap = document.createElement("div");
    container.appendChild(kpiWrap);

    var listWrap = document.createElement("div");
    container.appendChild(listWrap);

    function renderList() {
      var filtered = data.commitments.filter(function (c) { return commitmentMatchesFilters(c, data); });

      kpiWrap.innerHTML = "";
      kpiWrap.appendChild(renderKpiStrip(filtered, data));

      listWrap.innerHTML = "";
      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.commitments.length === 0
            ? "No commitments yet. Click “+ Add Commitment” to add the first Purchase Order, Subcontract, or other commercial commitment."
            : "No commitments match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered
        .slice()
        .sort(function (a, b) { return (b.commitment_date || "").localeCompare(a.commitment_date || ""); })
        .forEach(function (c) {
          var actual = actualValueFor(data, c.id);
          var remaining = remainingFor(c.committed_value, actual);

          var card = document.createElement("div");
          card.className = "detail-card";
          card.style.display = "flex";
          card.style.justifyContent = "space-between";
          card.style.alignItems = "center";
          card.style.gap = "12px";
          card.style.flexWrap = "wrap";
          card.style.marginBottom = "6px";

          var main = document.createElement("div");
          var metaParts = [
            projectName(data.projects, c.project_id),
            TYPE_LABELS[c.type] || c.type,
          ];
          if (c.vendor_id) metaParts.push(vendorName(data.vendors, c.vendor_id));
          if (c.package_id) metaParts.push(packageName(data.packages, c.package_id));
          if (c.commitment_date) metaParts.push(c.commitment_date);
          main.innerHTML =
            "<strong>" + esc(c.po_contract_number || "(no PO/Contract #)") + "</strong><br/>" +
            "<span class='text-secondary' style='font-size:12px;'>" + metaParts.map(esc).join(" · ") + "</span><br/>" +
            "<span style='font-size:12px;'>Committed " + formatMoney(c.committed_value) +
            " · Approved " + formatMoney(c.approved_value) +
            " · Actual " + formatMoney(actual) +
            " · <span style='color:" + (remaining != null && remaining < 0 ? "var(--status-critical)" : "inherit") + "'>Remaining " + formatMoney(remaining) + "</span></span>";
          card.appendChild(main);

          var right = document.createElement("div");
          right.style.display = "flex";
          right.style.alignItems = "center";
          right.style.gap = "8px";
          right.style.flexWrap = "wrap";

          if (commitmentIsAtRisk(c, data)) {
            var riskBadge = document.createElement("span");
            riskBadge.className = "status-badge status-badge--critical";
            riskBadge.style.fontSize = "11px";
            riskBadge.textContent = "Procurement Risk";
            riskBadge.title = "The linked activity starts within " + COMMITMENT_RISK_WINDOW_DAYS + " days (or has already started) and this commitment isn't approved yet.";
            right.appendChild(riskBadge);
          }

          var statusBadge = document.createElement("span");
          statusBadge.className = "status-badge status-badge--info";
          statusBadge.style.fontSize = "11px";
          statusBadge.textContent = STATUS_LABELS[c.status] || c.status;
          right.appendChild(statusBadge);

          if (c.activity_id) {
            var viewActivityBtn = document.createElement("button");
            viewActivityBtn.className = "btn btn--ghost";
            viewActivityBtn.textContent = "View Activity";
            viewActivityBtn.onclick = function () {
              var activity = data.activities.find(function (a) { return a.id === c.activity_id; });
              if (activity && window.PCC.schedule) {
                window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
                window.PCC.router.go("schedule");
              }
            };
            right.appendChild(viewActivityBtn);
          }

          var editBtn = document.createElement("button");
          editBtn.className = "btn btn--ghost";
          editBtn.textContent = "Edit";
          editBtn.onclick = function () {
            uiState.editingCommitmentId = c.id;
            rerender();
          };
          right.appendChild(editBtn);

          var deleteBtn = document.createElement("button");
          deleteBtn.className = "btn btn--ghost";
          deleteBtn.textContent = "Delete";
          deleteBtn.onclick = function () {
            if (!confirm('Delete commitment "' + (c.po_contract_number || "(no PO/Contract #)") + '"? Cost Tracking entries already logged against it are not deleted, just unlinked.')) return;
            window.PCC.store.update(function (d) {
              d.commitments = d.commitments.filter(function (item) { return item.id !== c.id; });
              d.cost_actuals.forEach(function (a) { if (a.commitment_id === c.id) a.commitment_id = ""; });
            });
            window.PCC.notify("Commitment deleted.", "success");
            rerender();
          };
          right.appendChild(deleteBtn);

          card.appendChild(right);
          list.appendChild(card);
        });
      listWrap.appendChild(list);
    }

    renderList();
  }

  // ---------------------------------------------------------------------------------
  // Packages tab
  // ---------------------------------------------------------------------------------

  function renderPackageForm(container, pkg, data, rerender) {
    var isNew = uiState.editingPackageId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Package" : "Edit Package";
    panel.appendChild(heading);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    var nameField = document.createElement("div");
    nameField.className = "field";
    nameField.innerHTML = "<label>Name *</label>";
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "pkgfield-name";
    nameInput.value = pkg.name || "";
    nameInput.required = true;
    nameField.appendChild(nameInput);
    grid.appendChild(nameField);

    var codeField = document.createElement("div");
    codeField.className = "field";
    codeField.innerHTML = "<label>Code</label>";
    var codeInput = document.createElement("input");
    codeInput.type = "text";
    codeInput.id = "pkgfield-code";
    codeInput.value = pkg.code || "";
    codeField.appendChild(codeInput);
    grid.appendChild(codeField);

    form.appendChild(grid);

    var notesField = document.createElement("div");
    notesField.className = "field";
    notesField.innerHTML = "<label>Notes</label>";
    var notesArea = document.createElement("textarea");
    notesArea.id = "pkgfield-notes";
    notesArea.rows = 2;
    notesArea.value = pkg.notes || "";
    notesField.appendChild(notesArea);
    form.appendChild(notesField);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Package" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingPackageId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var name = nameInput.value.trim();
      if (!name) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = { name: name, code: codeInput.value, notes: notesArea.value };

      window.PCC.store.update(function (d) {
        if (isNew) {
          d.packages.push(window.PCC.store.newPackage(values));
        } else {
          var existing = d.packages.find(function (p) { return p.id === pkg.id; });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Package added." : "Package updated.", "success");
      uiState.editingPackageId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function renderPackagesTab(container, data, rerender) {
    if (uiState.editingPackageId) {
      var pkgBeingEdited =
        uiState.editingPackageId === "new"
          ? window.PCC.store.newPackage({})
          : data.packages.find(function (p) { return p.id === uiState.editingPackageId; });
      if (pkgBeingEdited) renderPackageForm(container, pkgBeingEdited, data, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);
    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Package";
    addBtn.onclick = function () {
      uiState.editingPackageId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    if (data.packages.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "No packages yet. Click “+ Add Package” to add one — packages are shared across every project and reused by both Commitments and Documents.";
      container.appendChild(empty);
      return;
    }

    var list = document.createElement("div");
    list.className = "project-list";
    data.packages.forEach(function (p) {
      var commitmentCount = data.commitments.filter(function (c) { return c.package_id === p.id; }).length;
      var documentCount = data.documents.filter(function (d) { return d.package_id === p.id && !d.trashed_at; }).length;

      var card = document.createElement("div");
      card.className = "detail-card";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.alignItems = "center";
      card.style.gap = "12px";
      card.style.flexWrap = "wrap";
      card.style.marginBottom = "6px";

      var main = document.createElement("div");
      main.innerHTML =
        "<strong>" + esc(p.name) + "</strong>" + (p.code ? " (" + esc(p.code) + ")" : "") + "<br/>" +
        "<span class='text-secondary' style='font-size:12px;'>" + commitmentCount + " commitment(s) · " + documentCount + " document(s)</span>";
      card.appendChild(main);

      var actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      var editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.textContent = "Edit";
      editBtn.onclick = function () {
        uiState.editingPackageId = p.id;
        rerender();
      };
      actions.appendChild(editBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        var warning =
          commitmentCount > 0 || documentCount > 0
            ? 'Delete "' + p.name + '"? ' + commitmentCount + " commitment(s) and " + documentCount + " document(s) referencing it will be unlinked, not deleted."
            : 'Delete "' + p.name + '"?';
        if (!confirm(warning)) return;
        window.PCC.store.update(function (d) {
          d.packages = d.packages.filter(function (item) { return item.id !== p.id; });
          d.commitments.forEach(function (c) { if (c.package_id === p.id) c.package_id = ""; });
          d.documents.forEach(function (doc) { if (doc.package_id === p.id) doc.package_id = ""; });
        });
        window.PCC.notify("Package deleted.", "success");
        rerender();
      };
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  // ---------------------------------------------------------------------------------
  // Top-level render
  // ---------------------------------------------------------------------------------

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    // Redesign Gate 6 (Global Project Context): see risks.js's own comment on this
    // exact pattern.
    if (!uiState.projectFilterInitialized) {
      uiState.projectFilterInitialized = true;
      var ctxProjectId = window.PCC.projectContext.get();
      if (ctxProjectId && data.projects.some(function (p) { return p.id === ctxProjectId; })) {
        uiState.projectFilter = ctxProjectId;
      }
    }

    var h1 = document.createElement("h2");
    h1.textContent = "Commitment Management";
    h1.style.marginBottom = "6px";
    outlet.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.fontSize = "12px";
    sub.style.marginBottom = "16px";
    sub.textContent =
      "Purchase Orders, Subcontracts, and other commercial commitments — Actual Value is computed live from Cost Tracking entries logged against each commitment, never entered here directly.";
    outlet.appendChild(sub);

    var tabBar = document.createElement("div");
    tabBar.className = "tab-bar";
    [
      { key: "commitments", label: "Commitments" },
      { key: "packages", label: "Packages" },
    ].forEach(function (t) {
      var btn = document.createElement("button");
      btn.className = "tab-btn" + (uiState.tab === t.key ? " tab-btn--active" : "");
      btn.textContent = t.label;
      btn.onclick = function () {
        uiState.tab = t.key;
        uiState.editingCommitmentId = null;
        uiState.editingPackageId = null;
        rerender();
      };
      tabBar.appendChild(btn);
    });
    outlet.appendChild(tabBar);

    var tabContent = document.createElement("div");
    tabContent.style.marginTop = "16px";
    outlet.appendChild(tabContent);

    if (uiState.tab === "commitments") renderCommitmentsTab(tabContent, data, rerender);
    else if (uiState.tab === "packages") renderPackagesTab(tabContent, data, rerender);
  }

  window.PCC.pages.commitments = render;
  window.PCC.commitments = {
    filterByProject: function (projectId) {
      uiState.tab = "commitments";
      uiState.projectFilter = projectId;
      uiState.projectFilterInitialized = true;
      uiState.search = "";
      window.PCC.projectContext.set(projectId);
    },
    expandCommitment: function (commitmentId) {
      uiState.tab = "commitments";
      uiState.editingCommitmentId = commitmentId;
    },
  };
})();
