/* Cost Tracking (Tier 2, Gate 5b) — budget line items + an actual-cost log against
 * them. No automatic link to a project's contract_value or to Change Orders'
 * cost_impact_amount — reconciliation stays a manual, deliberate act, same decision
 * already made for Change Orders. Portfolio's own Budget field is used as a read-only
 * fallback for a project's Total Budgeted only when it has zero budget line items (see
 * projectCostSummary()'s usingPortfolioBudget flag).
 *
 * Gate 7 adds activity-linked EVM (PV/EV/CPI/SPI) on top of this: a budget item may
 * optionally link to a Schedule activity via `activity_id`, and the EVM tab surfaces
 * costEvmEngine.js's calculations. See that file's header for the EVM scope decisions.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var CATEGORY_LABELS = {
    labor: "Labor",
    materials: "Materials",
    equipment: "Equipment",
    subcontractor: "Subcontractor",
    permits_fees: "Permits / Fees",
    other: "Other",
  };

  var uiState = {
    tab: "budget", // 'budget' | 'actuals' | 'summary'
    search: "",
    categoryFilter: "",
    projectFilter: "",
    editingBudgetId: null,
    editingActualId: null,
  };

  function projectName(projects, projectId) {
    if (!projectId) return "Unassigned";
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "Unassigned";
  }

  function formatMoney(value, currency) {
    if (value === null || value === undefined || value === "") return "—";
    var num = Number(value);
    if (Number.isNaN(num)) return "—";
    // maximumFractionDigits caps at standard currency precision — whole-dollar inputs
    // (budget/actual amounts, entered by hand) still show with no decimals; only
    // genuinely fractional values (EAC/ETC/VAC, derived by division in
    // costEvmEngine.js) round to cents instead of showing raw floating-point noise
    // like "3,083.333333...".
    return (currency ? currency + " " : "") + num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function projectSelectField(labelText, idAttr, projects, selectedId) {
    var field = document.createElement("div");
    field.className = "field";
    var label = document.createElement("label");
    label.textContent = labelText;
    field.appendChild(label);

    var select = document.createElement("select");
    select.id = idAttr;
    var activeProjects = projects.filter(function (p) {
      return !p.archived;
    });
    if (activeProjects.length === 0) {
      var noProjOpt = document.createElement("option");
      noProjOpt.value = "";
      noProjOpt.textContent = "No projects yet — add one in Portfolio first";
      select.appendChild(noProjOpt);
      select.disabled = true;
    } else {
      activeProjects.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "(unnamed project)";
        select.appendChild(opt);
      });
      select.value = selectedId || activeProjects[0].id;
    }
    field.appendChild(select);
    return { field: field, select: select, hasActiveProjects: activeProjects.length > 0 };
  }

  function categorySelectField(labelText, idAttr, selectedCategory) {
    var field = document.createElement("div");
    field.className = "field";
    var label = document.createElement("label");
    label.textContent = labelText;
    field.appendChild(label);

    var select = document.createElement("select");
    select.id = idAttr;
    window.PCC.store.COST_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CATEGORY_LABELS[c] || c;
      select.appendChild(opt);
    });
    select.value = selectedCategory || "other";
    field.appendChild(select);
    return { field: field, select: select };
  }

  /** Lists a project's Schedule activities across ALL of its schedule revisions —
   * labeled "Schedule Name: Activity Name" so linking is unambiguous when a project
   * has more than one revision. Same dependent-select pattern renderActualForm already
   * uses for "Against Budget Item". */
  function activityOptionsFor(select, data, projectId, selectedActivityId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "(none — not linked to a schedule activity)";
    select.appendChild(noneOpt);

    var projectSchedules = data.schedules.filter(function (s) {
      return s.project_id === projectId;
    });
    var scheduleNameById = {};
    projectSchedules.forEach(function (s) {
      scheduleNameById[s.id] = s.name;
    });

    data.activities
      .filter(function (a) {
        return a.project_id === projectId;
      })
      .forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = (scheduleNameById[a.schedule_id] || "(schedule)") + ": " + (a.name || "(unnamed activity)");
        select.appendChild(opt);
      });
    select.value = selectedActivityId || "";
  }

  // ---------------------------------------------------------------------------------
  // Budget tab
  // ---------------------------------------------------------------------------------

  function renderBudgetForm(container, item, data, rerender) {
    var isNew = uiState.editingBudgetId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Budget Item" : "Edit Budget Item";
    panel.appendChild(heading);

    var form = document.createElement("form");

    var proj = projectSelectField("Project *", "costbudgetfield-project_id", data.projects, item.project_id);
    form.appendChild(proj.field);

    var grid = document.createElement("div");
    grid.className = "form-grid";

    var cat = categorySelectField("Category *", "costbudgetfield-category", item.category);
    grid.appendChild(cat.field);

    var nameField = document.createElement("div");
    nameField.className = "field";
    nameField.innerHTML = "<label>Name / Scope *</label>";
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "costbudgetfield-name";
    nameInput.value = item.name || "";
    nameField.appendChild(nameInput);
    grid.appendChild(nameField);

    var amountField = document.createElement("div");
    amountField.className = "field";
    amountField.innerHTML = "<label>Planned Amount *</label>";
    var amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.step = "0.01";
    amountInput.id = "costbudgetfield-planned_amount";
    amountInput.value = item.planned_amount == null ? "" : item.planned_amount;
    amountField.appendChild(amountInput);
    grid.appendChild(amountField);

    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Schedule Activity (for EVM)</label>";
    var activitySelect = document.createElement("select");
    activitySelect.id = "costbudgetfield-activity_id";
    activityOptionsFor(activitySelect, data, proj.select.value, item.activity_id);
    activityField.appendChild(activitySelect);
    grid.appendChild(activityField);

    proj.select.onchange = function () {
      activityOptionsFor(activitySelect, data, proj.select.value, "");
    };

    form.appendChild(grid);

    var notesField = document.createElement("div");
    notesField.className = "field";
    notesField.innerHTML = "<label>Notes</label>";
    var notesArea = document.createElement("textarea");
    notesArea.id = "costbudgetfield-notes";
    notesArea.rows = 2;
    notesArea.value = item.notes || "";
    notesField.appendChild(notesArea);
    form.appendChild(notesField);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Project, Name, and a Planned Amount are required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Budget Item" : "Save Changes";
    saveBtn.disabled = !proj.hasActiveProjects;

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingBudgetId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var name = nameInput.value.trim();
      var amount = amountInput.value === "" ? null : Number(amountInput.value);
      if (!name || !proj.select.value || amount === null || Number.isNaN(amount)) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = {
        project_id: proj.select.value,
        category: cat.select.value,
        name: name,
        planned_amount: amount,
        activity_id: activitySelect.value,
        notes: notesArea.value,
      };

      window.PCC.store.update(function (d) {
        if (isNew) {
          d.cost_budget_items.push(window.PCC.store.newCostBudgetItem(values));
        } else {
          var existing = d.cost_budget_items.find(function (b) {
            return b.id === item.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Budget item added." : "Budget item updated.", "success");
      uiState.editingBudgetId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function budgetItemMatchesFilters(b) {
    if (uiState.categoryFilter && b.category !== uiState.categoryFilter) return false;
    if (uiState.projectFilter && b.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var haystack = (b.name + " " + (b.notes || "")).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function actualsAgainst(data, budgetItemId) {
    return data.cost_actuals.filter(function (a) {
      return a.budget_item_id === budgetItemId;
    });
  }

  function renderBudgetTab(container, data, rerender) {
    if (uiState.editingBudgetId) {
      var itemBeingEdited =
        uiState.editingBudgetId === "new"
          ? window.PCC.store.newCostBudgetItem({})
          : data.cost_budget_items.find(function (b) {
              return b.id === uiState.editingBudgetId;
            });
      if (itemBeingEdited) renderBudgetForm(container, itemBeingEdited, data, rerender);
    }

    var toolbar = buildToolbar(data, rerender);
    container.appendChild(toolbar.el);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    var hasActiveProjects = data.projects.some(function (p) {
      return !p.archived;
    });
    addBtn.textContent = "+ Add Budget Item";
    addBtn.disabled = !hasActiveProjects;
    addBtn.title = hasActiveProjects ? "" : "Add a project in Portfolio first";
    addBtn.onclick = function () {
      uiState.editingBudgetId = "new";
      rerender();
    };
    toolbar.actionsSlot.appendChild(addBtn);

    var listWrap = document.createElement("div");
    container.appendChild(listWrap);

    var filtered = data.cost_budget_items.filter(budgetItemMatchesFilters);

    if (filtered.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent =
        data.cost_budget_items.length === 0
          ? hasActiveProjects
            ? "No budget items yet. Click “+ Add Budget Item” to log the first planned cost line."
            : "Add a project in Portfolio first, then set up a budget against it."
          : "No budget items match this search/filter.";
      listWrap.appendChild(empty);
      return;
    }

    var list = document.createElement("div");
    list.className = "project-list";
    filtered.forEach(function (b) {
      var actualTotal = actualsAgainst(data, b.id).reduce(function (sum, a) {
        return sum + (Number(a.amount) || 0);
      }, 0);

      var row = document.createElement("div");
      row.className = "project-entry";
      var card = document.createElement("div");
      card.className = "detail-card";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.alignItems = "center";
      card.style.gap = "12px";
      card.style.flexWrap = "wrap";

      var linkedActivity = b.activity_id
        ? data.activities.find(function (a) {
            return a.id === b.activity_id;
          })
        : null;

      var main = document.createElement("div");
      main.innerHTML =
        "<strong>" + b.name + "</strong><br/>" +
        "<span class='text-secondary' style='font-size:12px;'>" +
        CATEGORY_LABELS[b.category] + " · " + projectName(data.projects, b.project_id) +
        " · Planned " + formatMoney(b.planned_amount) +
        " · Actual so far " + formatMoney(actualTotal) +
        (linkedActivity ? " · linked to “" + linkedActivity.name + "” (" + (linkedActivity.percent_complete || 0) + "% complete)" : "") +
        "</span>";
      card.appendChild(main);

      var actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      var editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.textContent = "Edit";
      editBtn.onclick = function () {
        uiState.editingBudgetId = b.id;
        rerender();
      };
      actions.appendChild(editBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        var linkedCount = actualsAgainst(data, b.id).length;
        var msg = 'Delete budget item "' + b.name + '"?' +
          (linkedCount > 0 ? " " + linkedCount + " actual cost entry(ies) reference it — they'll be kept, just unlinked." : "");
        if (!confirm(msg)) return;
        window.PCC.store.update(function (d) {
          d.cost_budget_items = d.cost_budget_items.filter(function (item2) {
            return item2.id !== b.id;
          });
          d.cost_actuals.forEach(function (a) {
            if (a.budget_item_id === b.id) a.budget_item_id = "";
          });
        });
        window.PCC.notify("Budget item deleted.", "info");
        rerender();
      };
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      row.appendChild(card);
      list.appendChild(row);
    });
    listWrap.appendChild(list);
  }

  // ---------------------------------------------------------------------------------
  // Actuals tab
  // ---------------------------------------------------------------------------------

  function budgetItemOptionsFor(select, budgetItems, projectId, selectedBudgetItemId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "(none — unbudgeted)";
    select.appendChild(noneOpt);
    budgetItems
      .filter(function (b) {
        return b.project_id === projectId;
      })
      .forEach(function (b) {
        var opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = b.name + " (" + CATEGORY_LABELS[b.category] + ")";
        select.appendChild(opt);
      });
    select.value = selectedBudgetItemId || "";
  }

  function renderActualForm(container, entry, data, rerender) {
    var isNew = uiState.editingActualId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Log Actual Cost" : "Edit Actual Cost";
    panel.appendChild(heading);

    var form = document.createElement("form");

    var proj = projectSelectField("Project *", "costactualfield-project_id", data.projects, entry.project_id);
    form.appendChild(proj.field);

    var budgetField = document.createElement("div");
    budgetField.className = "field";
    budgetField.innerHTML = "<label>Against Budget Item</label>";
    var budgetSelect = document.createElement("select");
    budgetSelect.id = "costactualfield-budget_item_id";
    budgetItemOptionsFor(budgetSelect, data.cost_budget_items, proj.select.value, entry.budget_item_id);
    budgetField.appendChild(budgetSelect);
    form.appendChild(budgetField);

    proj.select.onchange = function () {
      budgetItemOptionsFor(budgetSelect, data.cost_budget_items, proj.select.value, "");
    };

    var grid = document.createElement("div");
    grid.className = "form-grid";

    var cat = categorySelectField("Category *", "costactualfield-category", entry.category);
    grid.appendChild(cat.field);

    var descField = document.createElement("div");
    descField.className = "field";
    descField.innerHTML = "<label>Description *</label>";
    var descInput = document.createElement("input");
    descInput.type = "text";
    descInput.id = "costactualfield-description";
    descInput.value = entry.description || "";
    descField.appendChild(descInput);
    grid.appendChild(descField);

    var amountField = document.createElement("div");
    amountField.className = "field";
    amountField.innerHTML = "<label>Amount *</label>";
    var amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.step = "0.01";
    amountInput.id = "costactualfield-amount";
    amountInput.value = entry.amount == null ? "" : entry.amount;
    amountField.appendChild(amountInput);
    grid.appendChild(amountField);

    var dateField = document.createElement("div");
    dateField.className = "field";
    dateField.innerHTML = "<label>Date *</label>";
    var dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.id = "costactualfield-date";
    dateInput.value = entry.date || "";
    dateField.appendChild(dateInput);
    grid.appendChild(dateField);

    var vendorField = document.createElement("div");
    vendorField.className = "field";
    vendorField.innerHTML = "<label>Vendor</label>";
    var vendorInput = document.createElement("input");
    vendorInput.type = "text";
    vendorInput.id = "costactualfield-vendor";
    vendorInput.value = entry.vendor || "";
    vendorField.appendChild(vendorInput);
    grid.appendChild(vendorField);

    var invoiceField = document.createElement("div");
    invoiceField.className = "field";
    invoiceField.innerHTML = "<label>Invoice / Ref #</label>";
    var invoiceInput = document.createElement("input");
    invoiceInput.type = "text";
    invoiceInput.id = "costactualfield-invoice_ref";
    invoiceInput.value = entry.invoice_ref || "";
    invoiceField.appendChild(invoiceInput);
    grid.appendChild(invoiceField);

    form.appendChild(grid);

    var notesField = document.createElement("div");
    notesField.className = "field";
    notesField.innerHTML = "<label>Notes</label>";
    var notesArea = document.createElement("textarea");
    notesArea.id = "costactualfield-notes";
    notesArea.rows = 2;
    notesArea.value = entry.notes || "";
    notesField.appendChild(notesArea);
    form.appendChild(notesField);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Project, Description, Amount, and Date are required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Log Cost" : "Save Changes";
    saveBtn.disabled = !proj.hasActiveProjects;

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingActualId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var description = descInput.value.trim();
      var amount = amountInput.value === "" ? null : Number(amountInput.value);
      if (!description || !proj.select.value || amount === null || Number.isNaN(amount) || !dateInput.value) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = {
        project_id: proj.select.value,
        budget_item_id: budgetSelect.value,
        category: cat.select.value,
        description: description,
        amount: amount,
        date: dateInput.value,
        vendor: vendorInput.value,
        invoice_ref: invoiceInput.value,
        notes: notesArea.value,
      };

      window.PCC.store.update(function (d) {
        if (isNew) {
          d.cost_actuals.push(window.PCC.store.newCostActual(values));
        } else {
          var existing = d.cost_actuals.find(function (a) {
            return a.id === entry.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Actual cost logged." : "Actual cost updated.", "success");
      uiState.editingActualId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function actualMatchesFilters(a) {
    if (uiState.categoryFilter && a.category !== uiState.categoryFilter) return false;
    if (uiState.projectFilter && a.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var haystack = (a.description + " " + (a.vendor || "") + " " + (a.invoice_ref || "")).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderActualsTab(container, data, rerender) {
    if (uiState.editingActualId) {
      var entryBeingEdited =
        uiState.editingActualId === "new"
          ? window.PCC.store.newCostActual({})
          : data.cost_actuals.find(function (a) {
              return a.id === uiState.editingActualId;
            });
      if (entryBeingEdited) renderActualForm(container, entryBeingEdited, data, rerender);
    }

    var toolbar = buildToolbar(data, rerender);
    container.appendChild(toolbar.el);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    var hasActiveProjects = data.projects.some(function (p) {
      return !p.archived;
    });
    addBtn.textContent = "+ Log Actual Cost";
    addBtn.disabled = !hasActiveProjects;
    addBtn.title = hasActiveProjects ? "" : "Add a project in Portfolio first";
    addBtn.onclick = function () {
      uiState.editingActualId = "new";
      rerender();
    };
    toolbar.actionsSlot.appendChild(addBtn);

    var listWrap = document.createElement("div");
    container.appendChild(listWrap);

    var filtered = data.cost_actuals.filter(actualMatchesFilters).sort(function (a, b) {
      return b.date < a.date ? -1 : b.date > a.date ? 1 : 0;
    });

    if (filtered.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent =
        data.cost_actuals.length === 0
          ? hasActiveProjects
            ? "No actual costs logged yet. Click “+ Log Actual Cost” to record the first one."
            : "Add a project in Portfolio first, then log actual costs against it."
          : "No actual costs match this search/filter.";
      listWrap.appendChild(empty);
      return;
    }

    var list = document.createElement("div");
    list.className = "project-list";
    filtered.forEach(function (a) {
      var linkedBudget = data.cost_budget_items.find(function (b) {
        return b.id === a.budget_item_id;
      });

      var row = document.createElement("div");
      row.className = "project-entry";
      var card = document.createElement("div");
      card.className = "detail-card";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.alignItems = "center";
      card.style.gap = "12px";
      card.style.flexWrap = "wrap";

      var main = document.createElement("div");
      main.innerHTML =
        "<strong>" + a.description + "</strong><br/>" +
        "<span class='text-secondary' style='font-size:12px;'>" +
        CATEGORY_LABELS[a.category] + " · " + projectName(data.projects, a.project_id) +
        " · " + a.date + " · " + formatMoney(a.amount) +
        (a.vendor ? " · " + a.vendor : "") +
        (linkedBudget ? " · against “" + linkedBudget.name + "”" : "") +
        "</span>";
      card.appendChild(main);

      var actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      var editBtn = document.createElement("button");
      editBtn.className = "btn btn--ghost";
      editBtn.textContent = "Edit";
      editBtn.onclick = function () {
        uiState.editingActualId = a.id;
        rerender();
      };
      actions.appendChild(editBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn--ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        if (!confirm('Delete this actual cost entry ("' + a.description + '")? This can\'t be undone.')) return;
        window.PCC.store.update(function (d) {
          d.cost_actuals = d.cost_actuals.filter(function (item2) {
            return item2.id !== a.id;
          });
        });
        window.PCC.notify("Actual cost entry deleted.", "info");
        rerender();
      };
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      row.appendChild(card);
      list.appendChild(row);
    });
    listWrap.appendChild(list);
  }

  // ---------------------------------------------------------------------------------
  // Shared search/filter toolbar (Budget and Actuals tabs use the same filter state)
  // ---------------------------------------------------------------------------------

  function buildToolbar(data, rerender) {
    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = uiState.tab === "budget" ? "Search name, notes…" : "Search description, vendor, invoice…";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      rerender();
    };
    toolbar.appendChild(searchInput);

    var catSelect = document.createElement("select");
    var allCatOpt = document.createElement("option");
    allCatOpt.value = "";
    allCatOpt.textContent = "All categories";
    catSelect.appendChild(allCatOpt);
    window.PCC.store.COST_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CATEGORY_LABELS[c];
      catSelect.appendChild(opt);
    });
    catSelect.value = uiState.categoryFilter;
    catSelect.onchange = function () {
      uiState.categoryFilter = catSelect.value;
      rerender();
    };
    toolbar.appendChild(catSelect);

    var projSelect = document.createElement("select");
    var allProjOpt = document.createElement("option");
    allProjOpt.value = "";
    allProjOpt.textContent = "All projects";
    projSelect.appendChild(allProjOpt);
    data.projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projSelect.appendChild(opt);
    });
    projSelect.value = uiState.projectFilter;
    projSelect.onchange = function () {
      uiState.projectFilter = projSelect.value;
      rerender();
    };
    toolbar.appendChild(projSelect);

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    return { el: toolbar, actionsSlot: toolbar };
  }

  // ---------------------------------------------------------------------------------
  // Summary tab
  // ---------------------------------------------------------------------------------

  /** Per-project budget/actual/variance, scoped to active projects — same convention
   * Reports' Portfolio Summary Report uses. Exported (below) so Portfolio's Details
   * panel can show one project's numbers without duplicating this math.
   *
   * Budget line items are always the source of truth when any exist — deliberately
   * chosen (Aditya, this session) over the Portfolio "Budget" field, since line items
   * carry real category-level detail and shouldn't be silently overridden by a single
   * coarser number. Portfolio's Budget field is used ONLY as a fallback when a project
   * has zero budget line items, so "Total Budgeted" isn't misleadingly $0 for a project
   * where someone filled in Budget on the project form but never visited Cost Tracking.
   * `usingPortfolioBudget` tells callers which case they're in, so the UI can say so
   * rather than blending two different-precision numbers silently. This is still not
   * the automatic contract_value/Change-Order-style reconciliation this app has
   * deliberately avoided elsewhere — it's a read-only fallback, and adding a single
   * budget line item for a project turns it off for that project immediately. */
  function projectCostSummary(data, projectId) {
    var budgetItems = data.cost_budget_items.filter(function (b) {
      return b.project_id === projectId;
    });
    var itemsTotal = budgetItems.reduce(function (sum, b) {
      return sum + (Number(b.planned_amount) || 0);
    }, 0);

    var budgeted = itemsTotal;
    var usingPortfolioBudget = false;
    if (budgetItems.length === 0) {
      var project = data.projects.find(function (p) {
        return p.id === projectId;
      });
      if (project && project.budget !== null && project.budget !== undefined && project.budget !== "") {
        budgeted = Number(project.budget) || 0;
        usingPortfolioBudget = true;
      }
    }

    var actual = data.cost_actuals
      .filter(function (a) {
        return a.project_id === projectId;
      })
      .reduce(function (sum, a) {
        return sum + (Number(a.amount) || 0);
      }, 0);
    return { budgeted: budgeted, actual: actual, variance: budgeted - actual, usingPortfolioBudget: usingPortfolioBudget };
  }

  function renderSummaryTab(container, data) {
    var activeProjects = data.projects.filter(function (p) {
      return !p.archived;
    });

    var totals = activeProjects.reduce(
      function (acc, p) {
        var s = projectCostSummary(data, p.id);
        acc.budgeted += s.budgeted;
        acc.actual += s.actual;
        if (s.usingPortfolioBudget) acc.fallbackCount += 1;
        return acc;
      },
      { budgeted: 0, actual: 0, fallbackCount: 0 }
    );
    var totalVariance = totals.budgeted - totals.actual;

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";
    [
      { label: "TOTAL BUDGETED", value: formatMoney(totals.budgeted), colorVar: null },
      { label: "TOTAL ACTUAL", value: formatMoney(totals.actual), colorVar: null },
      {
        label: "VARIANCE",
        value: (totalVariance >= 0 ? "+" : "") + formatMoney(totalVariance),
        colorVar: totalVariance < 0 ? "--status-critical" : "--status-on-track",
      },
    ].forEach(function (kpi) {
      var card = document.createElement("div");
      card.className = "kpi-card";
      var valueStyle = kpi.colorVar ? ' style="color:var(' + kpi.colorVar + ')"' : "";
      card.innerHTML =
        '<span class="kpi-card__label">' + kpi.label + '</span>' +
        '<span class="kpi-card__value mono"' + valueStyle + ">" + kpi.value + "</span>";
      kpiGrid.appendChild(card);
    });
    container.appendChild(kpiGrid);

    if (totals.fallbackCount > 0) {
      var fallbackNote = document.createElement("p");
      fallbackNote.className = "text-secondary";
      fallbackNote.style.fontSize = "12px";
      fallbackNote.style.marginTop = "-10px";
      fallbackNote.style.marginBottom = "10px";
      fallbackNote.textContent =
        totals.fallbackCount + " of " + activeProjects.length + " project(s) above use Portfolio's Budget " +
        "field as a stand-in, since they have no Cost Tracking budget line items yet — add line items on " +
        "the Budget tab for a more detailed number.";
      container.appendChild(fallbackNote);
    }

    if (activeProjects.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.style.marginTop = "16px";
      empty.textContent = "Add a project in Portfolio first to see cost summaries here.";
      container.appendChild(empty);
      return;
    }

    var table = document.createElement("div");
    table.className = "panel";
    table.style.marginTop = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "12px";
    heading.textContent = "By Project";
    table.appendChild(heading);

    var list = document.createElement("div");
    list.className = "project-list";
    activeProjects.forEach(function (p) {
      var s = projectCostSummary(data, p.id);
      var pctUsed = s.budgeted > 0 ? Math.round((s.actual / s.budgeted) * 100) : null;

      var row = document.createElement("div");
      row.className = "detail-card";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.marginBottom = "6px";
      row.style.gap = "12px";
      row.style.flexWrap = "wrap";

      var main = document.createElement("div");
      main.innerHTML =
        "<strong>" + (p.name || "(unnamed project)") + "</strong><br/>" +
        "<span class='text-secondary' style='font-size:12px;'>" +
        "Budgeted " + formatMoney(s.budgeted) + " · Actual " + formatMoney(s.actual) +
        (pctUsed !== null ? " (" + pctUsed + "% used)" : "") +
        (s.usingPortfolioBudget ? " · from Portfolio's Budget field (no cost line items yet)" : "") +
        "</span>";
      row.appendChild(main);

      var varianceBadge = document.createElement("span");
      varianceBadge.className = "status-badge " + (s.variance < 0 ? "status-badge--critical" : "status-badge--on_track");
      varianceBadge.textContent = (s.variance >= 0 ? "+" : "") + formatMoney(s.variance) + " variance";
      row.appendChild(varianceBadge);

      list.appendChild(row);
    });
    table.appendChild(list);
    container.appendChild(table);
  }

  // ---------------------------------------------------------------------------------
  // EVM tab (Gate 7)
  // ---------------------------------------------------------------------------------

  /** Runs costEvmEngine.js for one project, reusing projectCostSummary()'s
   * fallback-aware BAC so "what does Budget at Completion mean for this project" has
   * one source of truth shared with the Summary tab and Portfolio's Details panel. */
  function projectEvm(data, projectId) {
    var budgetItems = data.cost_budget_items.filter(function (b) {
      return b.project_id === projectId;
    });
    var actuals = data.cost_actuals.filter(function (a) {
      return a.project_id === projectId;
    });
    var costSummary = projectCostSummary(data, projectId);
    return window.PCC.costEvmEngine.computeEvm(budgetItems, actuals, data.activities, data.schedules, {
      bac: costSummary.budgeted,
    });
  }

  function formatIndex(value) {
    return value == null ? "—" : value.toFixed(2);
  }

  function renderEvmTab(container, data) {
    var note = document.createElement("p");
    note.className = "text-secondary";
    note.style.fontSize = "12px";
    note.style.marginBottom = "10px";
    note.textContent =
      "Planned Value and Earned Value only reflect budget items linked to a Schedule activity (set on " +
      "the Budget tab). Actual Cost always reflects everything logged, linked or not.";
    container.appendChild(note);

    var activeProjects = data.projects.filter(function (p) {
      return !p.archived;
    });

    if (activeProjects.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "Add a project in Portfolio first to see EVM here.";
      container.appendChild(empty);
      return;
    }

    var perProject = activeProjects.map(function (p) {
      return { project: p, evm: projectEvm(data, p.id) };
    });

    var totals = perProject.reduce(
      function (acc, row) {
        acc.bac += row.evm.bac;
        acc.ac += row.evm.ac;
        acc.pv += row.evm.pv;
        acc.ev += row.evm.ev;
        acc.linkedBac += row.evm.linkedBac;
        return acc;
      },
      { bac: 0, ac: 0, pv: 0, ev: 0, linkedBac: 0 }
    );
    var portfolioCpi = totals.ac > 0 && totals.linkedBac > 0 ? totals.ev / totals.ac : null;
    var portfolioSpi = totals.pv > 0 && totals.linkedBac > 0 ? totals.ev / totals.pv : null;

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";
    [
      { label: "EARNED VALUE", value: formatMoney(totals.ev), colorVar: null },
      { label: "ACTUAL COST", value: formatMoney(totals.ac), colorVar: null },
      { label: "CPI", value: formatIndex(portfolioCpi), colorVar: portfolioCpi != null && portfolioCpi < 1 ? "--status-critical" : "--status-on-track" },
      { label: "SPI", value: formatIndex(portfolioSpi), colorVar: portfolioSpi != null && portfolioSpi < 1 ? "--status-critical" : "--status-on-track" },
    ].forEach(function (kpi) {
      var card = document.createElement("div");
      card.className = "kpi-card";
      var valueStyle = kpi.colorVar ? ' style="color:var(' + kpi.colorVar + ')"' : "";
      card.innerHTML =
        '<span class="kpi-card__label">' + kpi.label + '</span>' +
        '<span class="kpi-card__value mono"' + valueStyle + ">" + kpi.value + "</span>";
      kpiGrid.appendChild(card);
    });
    container.appendChild(kpiGrid);

    var coveragePct = totals.bac > 0 ? Math.round((totals.linkedBac / totals.bac) * 100) : null;
    if (coveragePct !== null && coveragePct < 100) {
      var coverageNote = document.createElement("p");
      coverageNote.className = "text-secondary";
      coverageNote.style.fontSize = "12px";
      coverageNote.style.marginTop = "-10px";
      coverageNote.style.marginBottom = "10px";
      coverageNote.textContent =
        coveragePct + "% of total budget across active projects is linked to schedule activities — the rest " +
        "isn't reflected in these figures. Link budget items to activities on the Budget tab for full coverage.";
      container.appendChild(coverageNote);
    }

    var table = document.createElement("div");
    table.className = "panel";
    table.style.marginTop = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "12px";
    heading.textContent = "By Project";
    table.appendChild(heading);

    var list = document.createElement("div");
    list.className = "project-list";
    perProject.forEach(function (row) {
      var p = row.project;
      var evm = row.evm;

      var rowEl = document.createElement("div");
      rowEl.className = "detail-card";
      rowEl.style.display = "flex";
      rowEl.style.justifyContent = "space-between";
      rowEl.style.alignItems = "center";
      rowEl.style.marginBottom = "6px";
      rowEl.style.gap = "12px";
      rowEl.style.flexWrap = "wrap";

      var main = document.createElement("div");
      main.innerHTML =
        "<strong>" + (p.name || "(unnamed project)") + "</strong><br/>" +
        "<span class='text-secondary' style='font-size:12px;'>" +
        "EV " + formatMoney(evm.ev) + " · AC " + formatMoney(evm.ac) + " · PV " + formatMoney(evm.pv) +
        " · CPI " + formatIndex(evm.cpi) + " · SPI " + formatIndex(evm.spi) +
        (evm.eac != null ? " · EAC " + formatMoney(evm.eac) : "") +
        (evm.coveragePct != null ? " · " + evm.coveragePct + "% linked" : " · nothing linked yet") +
        "</span>";
      rowEl.appendChild(main);

      if (evm.vac != null) {
        var vacBadge = document.createElement("span");
        vacBadge.className = "status-badge " + (evm.vac < 0 ? "status-badge--critical" : "status-badge--on_track");
        vacBadge.textContent = (evm.vac >= 0 ? "+" : "") + formatMoney(evm.vac) + " VAC";
        rowEl.appendChild(vacBadge);
      }

      list.appendChild(rowEl);
    });
    table.appendChild(list);
    container.appendChild(table);
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

    var h1 = document.createElement("h2");
    h1.textContent = "Cost Tracking";
    h1.style.marginBottom = "6px";
    outlet.appendChild(h1);

    var subNote = document.createElement("p");
    subNote.className = "text-secondary";
    subNote.style.fontSize = "12px";
    subNote.style.marginBottom = "16px";
    subNote.textContent =
      "Budget line items vs. actual costs incurred, per project. No automatic link to Contract Value " +
      "or Change Orders — reconciliation stays a manual, deliberate act.";
    outlet.appendChild(subNote);

    var tabBar = document.createElement("div");
    tabBar.className = "tab-bar";

    [
      { key: "budget", label: "Budget" },
      { key: "actuals", label: "Actuals" },
      { key: "summary", label: "Summary" },
      { key: "evm", label: "EVM" },
    ].forEach(function (t) {
      var btn = document.createElement("button");
      btn.className = "tab-btn" + (uiState.tab === t.key ? " tab-btn--active" : "");
      btn.textContent = t.label;
      btn.onclick = function () {
        uiState.tab = t.key;
        uiState.editingBudgetId = null;
        uiState.editingActualId = null;
        rerender();
      };
      tabBar.appendChild(btn);
    });
    outlet.appendChild(tabBar);

    var tabContent = document.createElement("div");
    outlet.appendChild(tabContent);

    if (uiState.tab === "budget") renderBudgetTab(tabContent, data, rerender);
    else if (uiState.tab === "actuals") renderActualsTab(tabContent, data, rerender);
    else if (uiState.tab === "summary") renderSummaryTab(tabContent, data);
    else if (uiState.tab === "evm") renderEvmTab(tabContent, data);
  }

  window.PCC.pages.cost = render;
  window.PCC.cost = {
    filterByProject: function (projectId) {
      uiState.tab = "budget";
      uiState.projectFilter = projectId;
      uiState.categoryFilter = "";
      uiState.search = "";
    },
    projectCostSummary: projectCostSummary,
  };
})();
