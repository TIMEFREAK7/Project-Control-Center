/* Resource Management (Gate 11) — a shared, portfolio-wide resource pool (labor/
 * equipment/material) with assignments to Schedule activities and cross-project
 * over-allocation ("leveling") detection.
 *
 * SCOPE, DELIBERATELY (Aditya, 2026-08-16, decided before building):
 * - Full leveling, not just a register: an Assignments tab links a resource to one
 *   activity for a quantity, and a Leveling tab shows a day-by-day usage histogram
 *   plus flags days where demand exceeds `max_availability` — same "full resource
 *   leveling" scope as commercial tools' resource histograms, built on
 *   resourceLevelingEngine.js's pure day-scan.
 * - No cost linkage. Resources track quantity/availability only this gate — rate x
 *   usage feeding Cost Tracking/EVM is explicitly deferred, matching the
 *   "reconciliation stays a deliberate, separate act" pattern already established for
 *   Change Orders and Cost Tracking.
 * - Resources are NOT project-scoped (see store.js's header comment above
 *   newResource()) — a crew or a crane is a shared asset, not an event that belongs
 *   to one project. Assignments are project-scoped transitively via the activity they
 *   point at, and that's what makes cross-project leveling possible at all.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  // PCC Evolution Roadmap, Tier F (Gate 18): expanded from the original three (labor/
  // equipment/material) to the spec's own granular list — "labor" stays as a legacy
  // label so resources typed under Gate 11 still display correctly (see store.js's
  // RESOURCE_TYPES comment).
  var TYPE_LABELS = {
    employee: "Employee",
    engineer: "Engineer",
    supervisor: "Supervisor",
    skilled_labor: "Skilled Labor",
    unskilled_labor: "Unskilled Labor",
    contractor: "Contractor",
    subcontractor: "Subcontractor",
    equipment: "Equipment",
    machinery: "Machinery",
    material: "Material",
    labor: "Labor (legacy)",
  };

  var uiState = {
    tab: "register", // 'register' | 'assignments' | 'unavailability' | 'leveling'
    editingResourceId: null,
    editingAssignmentId: null,
    editingUnavailabilityId: null,
    resourceSearch: "",
    resourceTypeFilter: "",
    assignmentResourceFilter: "",
    assignmentProjectFilter: "", // narrows the Activity select in the Assignment form
    unavailabilityResourceFilter: "",
    levelingResourceId: "",
    // Architecture Upgrade Phase 7 (Advanced Scheduling): Resource-Constrained Leveling.
    // Computed on demand (a "Suggest Leveling" button click), not automatically on every
    // render — this walks every assignment for the resource, no reason to pay that cost
    // just from switching tabs. Cleared whenever the selected resource changes so a
    // stale proposal for a DIFFERENT resource is never shown.
    levelingProposals: null,
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

  function resourceName(resources, resourceId) {
    var r = resources.find(function (x) { return x.id === resourceId; });
    return r ? r.name || "(unnamed resource)" : "(resource deleted)";
  }

  function activityLabel(activities, activityId) {
    var a = activities.find(function (x) { return x.id === activityId; });
    return a ? a.name || "(unnamed activity)" : "(activity deleted)";
  }

  function vendorName(vendors, vendorId) {
    if (!vendorId) return "";
    var v = vendors.find(function (x) { return x.id === vendorId; });
    return v ? v.vendor_name || "(unnamed vendor)" : "(vendor deleted)";
  }

  /** Gate 10/11: same activityOptionsFor() pattern established in cost.js (Gate 7)
   * and duplicated into every register that links to a Schedule activity since —
   * self-contained page modules, no shared util layer, per this codebase's convention. */
  function activityOptionsFor(select, data, projectId, selectedActivityId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = projectId ? "(select an activity)" : "(select a project first)";
    select.appendChild(noneOpt);
    if (!projectId) return;

    var scheduleNameById = {};
    data.schedules
      .filter(function (s) { return s.project_id === projectId; })
      .forEach(function (s) { scheduleNameById[s.id] = s.name; });

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

  // ---------------------------------------------------------------------------------
  // Register tab
  // ---------------------------------------------------------------------------------

  function renderResourceForm(container, resource, rerender) {
    var isNew = uiState.editingResourceId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
    heading.textContent = isNew ? "Add Resource" : "Edit Resource";
    panel.appendChild(heading);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    function textField(label, id, value, required) {
      var f = document.createElement("div");
      f.className = "field";
      f.innerHTML = "<label>" + label + (required ? " *" : "") + "</label>";
      var i = document.createElement("input");
      i.type = "text";
      i.id = id;
      i.value = value || "";
      if (required) i.required = true;
      f.appendChild(i);
      return f;
    }

    grid.appendChild(textField("Name *", "resfield-name", resource.name, true));

    var typeField = document.createElement("div");
    typeField.className = "field";
    typeField.innerHTML = "<label>Type</label>";
    var typeSelect = document.createElement("select");
    typeSelect.id = "resfield-type";
    window.PCC.store.RESOURCE_TYPES.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      opt.textContent = TYPE_LABELS[t];
      typeSelect.appendChild(opt);
    });
    typeSelect.value = resource.type;
    typeField.appendChild(typeSelect);
    grid.appendChild(typeField);

    grid.appendChild(textField("Unit (e.g. person, unit, m³)", "resfield-unit", resource.unit));

    var availField = document.createElement("div");
    availField.className = "field";
    availField.innerHTML = "<label>Max Availability (per day)</label>";
    var availInput = document.createElement("input");
    availInput.type = "number";
    availInput.min = "0";
    availInput.step = "any";
    availInput.id = "resfield-max_availability";
    availInput.placeholder = "leave blank if unknown/unlimited";
    availInput.value = resource.max_availability == null ? "" : resource.max_availability;
    availField.appendChild(availInput);
    grid.appendChild(availField);

    form.appendChild(grid);

    var notesField = document.createElement("div");
    notesField.className = "field";
    notesField.innerHTML = "<label>Notes</label>";
    var notesArea = document.createElement("textarea");
    notesArea.id = "resfield-notes";
    notesArea.rows = 2;
    notesArea.value = resource.notes || "";
    notesField.appendChild(notesArea);
    form.appendChild(notesField);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "var(--text-sm)";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-3)";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Resource" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingResourceId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var name = form.querySelector("#resfield-name").value.trim();
      if (!name) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var availRaw = availInput.value;
      var values = {
        name: name,
        type: typeSelect.value,
        unit: form.querySelector("#resfield-unit").value,
        max_availability: availRaw === "" ? null : Number(availRaw),
        notes: notesArea.value,
      };

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.resources.push(window.PCC.store.newResource(values));
        } else {
          var existing = data.resources.find(function (r) { return r.id === resource.id; });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Resource added." : "Resource updated.", "success");
      uiState.editingResourceId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function renderRegisterTab(container, data, rerender) {
    if (uiState.editingResourceId) {
      var resourceBeingEdited =
        uiState.editingResourceId === "new"
          ? window.PCC.store.newResource({})
          : data.resources.find(function (r) { return r.id === uiState.editingResourceId; });
      if (resourceBeingEdited) renderResourceForm(container, resourceBeingEdited, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search resource name…";
    search.value = uiState.resourceSearch;
    search.oninput = function () {
      uiState.resourceSearch = search.value;
      renderList();
    };
    toolbar.appendChild(search);

    var typeSelect = document.createElement("select");
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Types";
    typeSelect.appendChild(allOpt);
    window.PCC.store.RESOURCE_TYPES.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      opt.textContent = TYPE_LABELS[t];
      typeSelect.appendChild(opt);
    });
    typeSelect.value = uiState.resourceTypeFilter;
    typeSelect.onchange = function () {
      uiState.resourceTypeFilter = typeSelect.value;
      renderList();
    };
    toolbar.appendChild(typeSelect);

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Resource";
    addBtn.onclick = function () {
      uiState.editingResourceId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    var listWrap = document.createElement("div");
    container.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.resources.filter(function (r) {
        if (uiState.resourceTypeFilter && r.type !== uiState.resourceTypeFilter) return false;
        if (uiState.resourceSearch && (r.name || "").toLowerCase().indexOf(uiState.resourceSearch.toLowerCase()) === -1) return false;
        return true;
      });

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent = data.resources.length === 0 ? "No resources yet. Click “+ Add Resource” to add the first one." : "No resources match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (r) {
        var assignmentCount = data.resource_assignments.filter(function (a) { return a.resource_id === r.id; }).length;
        var card = document.createElement("div");
        card.className = "detail-card";
        card.style.display = "flex";
        card.style.justifyContent = "space-between";
        card.style.alignItems = "center";
        card.style.gap = "var(--space-3)";
        card.style.flexWrap = "wrap";
        card.style.marginBottom = "var(--space-2)";

        var main = document.createElement("div");
        main.innerHTML =
          "<strong>" + esc(r.name) + "</strong><br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          TYPE_LABELS[r.type] +
          (r.unit ? " · " + esc(r.unit) : "") +
          (r.max_availability != null ? " · Max " + r.max_availability + "/day" : " · max availability not set") +
          " · " + assignmentCount + " assignment(s)" +
          "</span>";
        card.appendChild(main);

        var actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "var(--space-2)";

        var levelBtn = document.createElement("button");
        levelBtn.className = "btn btn--ghost";
        levelBtn.textContent = "View Leveling";
        levelBtn.onclick = function () {
          uiState.tab = "leveling";
          uiState.levelingResourceId = r.id;
          rerender();
        };
        actions.appendChild(levelBtn);

        var editBtn = document.createElement("button");
        editBtn.className = "btn btn--ghost";
        editBtn.textContent = "Edit";
        editBtn.onclick = function () {
          uiState.editingResourceId = r.id;
          rerender();
        };
        actions.appendChild(editBtn);

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn--ghost";
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = function () {
          var warning =
            assignmentCount > 0
              ? 'Delete "' + r.name + '"? This also removes its ' + assignmentCount + " assignment(s). This can't be undone."
              : 'Delete "' + r.name + '"?';
          if (!confirm(warning)) return;
          window.PCC.store.update(function (d) {
            d.resources = d.resources.filter(function (item) { return item.id !== r.id; });
            d.resource_assignments = d.resource_assignments.filter(function (a) { return a.resource_id !== r.id; });
          });
          window.PCC.notify("Resource deleted.", "success");
          rerender();
        };
        actions.appendChild(deleteBtn);

        card.appendChild(actions);
        list.appendChild(card);
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  // ---------------------------------------------------------------------------------
  // Assignments tab
  // ---------------------------------------------------------------------------------

  function renderAssignmentForm(container, assignment, data, rerender) {
    var isNew = uiState.editingAssignmentId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
    heading.textContent = isNew ? "Add Assignment" : "Edit Assignment";
    panel.appendChild(heading);

    if (data.resources.length === 0) {
      var note = document.createElement("p");
      note.className = "text-secondary";
      note.textContent = "Add a resource in the Register tab first.";
      panel.appendChild(note);
      var closeBtn = document.createElement("button");
      closeBtn.className = "btn btn--ghost";
      closeBtn.textContent = "Close";
      closeBtn.onclick = function () {
        uiState.editingAssignmentId = null;
        rerender();
      };
      panel.appendChild(closeBtn);
      container.appendChild(panel);
      return;
    }

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    var resField = document.createElement("div");
    resField.className = "field";
    resField.innerHTML = "<label>Resource *</label>";
    var resSelect = document.createElement("select");
    resSelect.id = "asgfield-resource_id";
    data.resources.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name + " (" + TYPE_LABELS[r.type] + ")";
      resSelect.appendChild(opt);
    });
    resSelect.value = assignment.resource_id || data.resources[0].id;
    resField.appendChild(resSelect);
    grid.appendChild(resField);

    var currentActivity = assignment.activity_id ? data.activities.find(function (a) { return a.id === assignment.activity_id; }) : null;
    var initialProjectId = currentActivity ? currentActivity.project_id : "";

    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project *</label>";
    var projSelect = document.createElement("select");
    var activeProjects = data.projects.filter(function (p) { return !p.archived; });
    if (activeProjects.length === 0) {
      var noProjOpt = document.createElement("option");
      noProjOpt.value = "";
      noProjOpt.textContent = "No projects yet";
      projSelect.appendChild(noProjOpt);
      projSelect.disabled = true;
    } else {
      var pickOpt = document.createElement("option");
      pickOpt.value = "";
      pickOpt.textContent = "(select a project)";
      projSelect.appendChild(pickOpt);
      activeProjects.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "(unnamed project)";
        projSelect.appendChild(opt);
      });
      projSelect.value = initialProjectId;
    }
    projField.appendChild(projSelect);
    grid.appendChild(projField);

    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Activity *</label>";
    var activitySelect = document.createElement("select");
    activitySelect.id = "asgfield-activity_id";
    activityOptionsFor(activitySelect, data, projSelect.value, assignment.activity_id);
    activityField.appendChild(activitySelect);
    grid.appendChild(activityField);

    projSelect.onchange = function () {
      activityOptionsFor(activitySelect, data, projSelect.value, "");
    };

    var qtyField = document.createElement("div");
    qtyField.className = "field";
    qtyField.innerHTML = "<label>Planned Quantity *</label>";
    var qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "0";
    qtyInput.step = "any";
    qtyInput.id = "asgfield-quantity";
    qtyInput.value = assignment.quantity == null ? "" : assignment.quantity;
    qtyField.appendChild(qtyInput);
    grid.appendChild(qtyField);

    // PCC Evolution Roadmap, Tier F (Gate 18): actual quantity, working hours/overtime
    // (simple aggregate totals, not a daily time-entry log — Aditya's explicit choice),
    // and a per-assignment vendor link (also Aditya's explicit choice, over a single
    // vendor_id on the Resource itself — the same shared resource can be sourced from a
    // different vendor on each activity it's assigned to).
    var actualQtyField = document.createElement("div");
    actualQtyField.className = "field";
    actualQtyField.innerHTML = "<label>Actual Quantity</label>";
    var actualQtyInput = document.createElement("input");
    actualQtyInput.type = "number";
    actualQtyInput.min = "0";
    actualQtyInput.step = "any";
    actualQtyInput.id = "asgfield-actual_quantity";
    actualQtyInput.placeholder = "not yet recorded";
    actualQtyInput.value = assignment.actual_quantity == null ? "" : assignment.actual_quantity;
    actualQtyField.appendChild(actualQtyInput);
    grid.appendChild(actualQtyField);

    var hoursField = document.createElement("div");
    hoursField.className = "field";
    hoursField.innerHTML = "<label>Planned Hours / Day</label>";
    var hoursInput = document.createElement("input");
    hoursInput.type = "number";
    hoursInput.min = "0";
    hoursInput.step = "any";
    hoursInput.id = "asgfield-planned_hours_per_day";
    hoursInput.placeholder = "e.g. 8";
    hoursInput.value = assignment.planned_hours_per_day == null ? "" : assignment.planned_hours_per_day;
    hoursField.appendChild(hoursInput);
    grid.appendChild(hoursField);

    var otField = document.createElement("div");
    otField.className = "field";
    otField.innerHTML = "<label>Overtime Hours</label>";
    var otInput = document.createElement("input");
    otInput.type = "number";
    otInput.min = "0";
    otInput.step = "any";
    otInput.id = "asgfield-overtime_hours";
    otInput.placeholder = "total, if any";
    otInput.value = assignment.overtime_hours == null ? "" : assignment.overtime_hours;
    otField.appendChild(otInput);
    grid.appendChild(otField);

    var vendorField = document.createElement("div");
    vendorField.className = "field";
    vendorField.innerHTML = "<label>Sourced From Vendor</label>";
    var vendorSelect = document.createElement("select");
    vendorSelect.id = "asgfield-vendor_id";
    var noVendorOpt = document.createElement("option");
    noVendorOpt.value = "";
    noVendorOpt.textContent = "(none)";
    vendorSelect.appendChild(noVendorOpt);
    data.vendors.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.vendor_name || "(unnamed vendor)";
      vendorSelect.appendChild(opt);
    });
    vendorSelect.value = assignment.vendor_id || "";
    vendorField.appendChild(vendorSelect);
    grid.appendChild(vendorField);

    form.appendChild(grid);

    var notesField = document.createElement("div");
    notesField.className = "field";
    notesField.innerHTML = "<label>Notes</label>";
    var notesArea = document.createElement("textarea");
    notesArea.id = "asgfield-notes";
    notesArea.rows = 2;
    notesArea.value = assignment.notes || "";
    notesField.appendChild(notesArea);
    form.appendChild(notesField);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "var(--text-sm)";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Resource, Activity, and a positive Quantity are required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-3)";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Assignment" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingAssignmentId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var qty = Number(qtyInput.value);
      if (!resSelect.value || !activitySelect.value || !qty || qty <= 0) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = {
        resource_id: resSelect.value,
        activity_id: activitySelect.value,
        quantity: qty,
        actual_quantity: actualQtyInput.value === "" ? null : Number(actualQtyInput.value),
        planned_hours_per_day: hoursInput.value === "" ? null : Number(hoursInput.value),
        overtime_hours: otInput.value === "" ? null : Number(otInput.value),
        vendor_id: vendorSelect.value,
        notes: notesArea.value,
      };

      window.PCC.store.update(function (d) {
        if (isNew) {
          d.resource_assignments.push(window.PCC.store.newResourceAssignment(values));
        } else {
          var existing = d.resource_assignments.find(function (a) { return a.id === assignment.id; });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Assignment added." : "Assignment updated.", "success");
      uiState.editingAssignmentId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function renderAssignmentsTab(container, data, rerender) {
    if (uiState.editingAssignmentId) {
      var assignmentBeingEdited =
        uiState.editingAssignmentId === "new"
          ? window.PCC.store.newResourceAssignment({})
          : data.resource_assignments.find(function (a) { return a.id === uiState.editingAssignmentId; });
      if (assignmentBeingEdited) renderAssignmentForm(container, assignmentBeingEdited, data, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var resSelect = document.createElement("select");
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Resources";
    resSelect.appendChild(allOpt);
    data.resources.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      resSelect.appendChild(opt);
    });
    resSelect.value = uiState.assignmentResourceFilter;
    resSelect.onchange = function () {
      uiState.assignmentResourceFilter = resSelect.value;
      renderList();
    };
    toolbar.appendChild(resSelect);

    if (uiState.assignmentProjectFilter) {
      var filterNote = document.createElement("span");
      filterNote.className = "text-secondary";
      filterNote.style.fontSize = "var(--text-sm)";
      filterNote.style.alignSelf = "center";
      filterNote.textContent = "Filtered to " + projectName(data.projects, uiState.assignmentProjectFilter);
      toolbar.appendChild(filterNote);
      var clearBtn = document.createElement("button");
      clearBtn.className = "btn btn--ghost";
      clearBtn.textContent = "Clear";
      clearBtn.onclick = function () {
        uiState.assignmentProjectFilter = "";
        rerender();
      };
      toolbar.appendChild(clearBtn);
    }

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Assignment";
    addBtn.disabled = data.resources.length === 0;
    addBtn.onclick = function () {
      uiState.editingAssignmentId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    var listWrap = document.createElement("div");
    container.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.resource_assignments.filter(function (a) {
        if (uiState.assignmentResourceFilter && a.resource_id !== uiState.assignmentResourceFilter) return false;
        if (uiState.assignmentProjectFilter) {
          var act = data.activities.find(function (x) { return x.id === a.activity_id; });
          if (!act || act.project_id !== uiState.assignmentProjectFilter) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.resources.length === 0
            ? "Add a resource first, then assign it to a Schedule activity here."
            : data.resource_assignments.length === 0
            ? "No assignments yet. Click “+ Add Assignment” to assign a resource to an activity."
            : "No assignments match this filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (a) {
        var activity = data.activities.find(function (x) { return x.id === a.activity_id; });
        var card = document.createElement("div");
        card.className = "detail-card";
        card.style.display = "flex";
        card.style.justifyContent = "space-between";
        card.style.alignItems = "center";
        card.style.gap = "var(--space-3)";
        card.style.flexWrap = "wrap";
        card.style.marginBottom = "var(--space-2)";

        var qtyText = "planned " + a.quantity + (a.actual_quantity != null ? ", actual " + a.actual_quantity : "");
        var extraParts = [];
        if (a.planned_hours_per_day != null) extraParts.push(a.planned_hours_per_day + " hrs/day");
        if (a.overtime_hours) extraParts.push(a.overtime_hours + " OT hrs");
        if (a.vendor_id) extraParts.push("via " + esc(vendorName(data.vendors, a.vendor_id)));

        var main = document.createElement("div");
        main.innerHTML =
          "<strong>" + esc(resourceName(data.resources, a.resource_id)) + "</strong> — " + qtyText + "<br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          esc(activityLabel(data.activities, a.activity_id)) +
          (activity ? " · " + esc(projectName(data.projects, activity.project_id)) : "") +
          (extraParts.length ? " · " + extraParts.join(" · ") : "") +
          "</span>";
        card.appendChild(main);

        var actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "var(--space-2)";

        if (activity) {
          var viewBtn = document.createElement("button");
          viewBtn.className = "btn btn--ghost";
          viewBtn.textContent = "View in Gantt";
          viewBtn.onclick = function () {
            if (window.PCC.schedule) window.PCC.schedule.viewActivity(activity.project_id, activity.schedule_id, activity.id);
            window.PCC.router.go("schedule");
          };
          actions.appendChild(viewBtn);
        }

        var editBtn = document.createElement("button");
        editBtn.className = "btn btn--ghost";
        editBtn.textContent = "Edit";
        editBtn.onclick = function () {
          uiState.editingAssignmentId = a.id;
          rerender();
        };
        actions.appendChild(editBtn);

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn--ghost";
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = function () {
          if (!confirm("Delete this assignment?")) return;
          window.PCC.store.update(function (d) {
            d.resource_assignments = d.resource_assignments.filter(function (item) { return item.id !== a.id; });
          });
          window.PCC.notify("Assignment deleted.", "success");
          rerender();
        };
        actions.appendChild(deleteBtn);

        card.appendChild(actions);
        list.appendChild(card);
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  // ---------------------------------------------------------------------------------
  // Unavailability tab (PCC Evolution Roadmap, Tier F, Gate 18) — leave/downtime
  // periods that reduce a resource's effective daily availability in the Leveling tab
  // and resourceLevelingEngine.js, rather than the flat Max Availability number
  // applying unconditionally on every day.
  // ---------------------------------------------------------------------------------

  function renderUnavailabilityForm(container, record, data, rerender) {
    var isNew = uiState.editingUnavailabilityId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
    heading.textContent = isNew ? "Add Leave / Unavailable Period" : "Edit Leave / Unavailable Period";
    panel.appendChild(heading);

    if (data.resources.length === 0) {
      var note = document.createElement("p");
      note.className = "text-secondary";
      note.textContent = "Add a resource in the Register tab first.";
      panel.appendChild(note);
      var closeBtn = document.createElement("button");
      closeBtn.className = "btn btn--ghost";
      closeBtn.textContent = "Close";
      closeBtn.onclick = function () {
        uiState.editingUnavailabilityId = null;
        rerender();
      };
      panel.appendChild(closeBtn);
      container.appendChild(panel);
      return;
    }

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    var resField = document.createElement("div");
    resField.className = "field";
    resField.innerHTML = "<label>Resource *</label>";
    var resSelect = document.createElement("select");
    resSelect.id = "unavfield-resource_id";
    data.resources.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name + " (" + TYPE_LABELS[r.type] + ")";
      resSelect.appendChild(opt);
    });
    resSelect.value = record.resource_id || data.resources[0].id;
    resField.appendChild(resSelect);
    grid.appendChild(resField);

    var startField = document.createElement("div");
    startField.className = "field";
    startField.innerHTML = "<label>Start Date * (inclusive)</label>";
    var startInput = document.createElement("input");
    startInput.type = "date";
    startInput.id = "unavfield-start_date";
    startInput.value = record.start_date || "";
    startField.appendChild(startInput);
    grid.appendChild(startField);

    var endField = document.createElement("div");
    endField.className = "field";
    endField.innerHTML = "<label>End Date * (inclusive)</label>";
    var endInput = document.createElement("input");
    endInput.type = "date";
    endInput.id = "unavfield-end_date";
    endInput.value = record.end_date || "";
    endField.appendChild(endInput);
    grid.appendChild(endField);

    var qtyField = document.createElement("div");
    qtyField.className = "field";
    qtyField.innerHTML = "<label>Quantity Unavailable *</label>";
    var qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "0";
    qtyInput.step = "any";
    qtyInput.id = "unavfield-quantity";
    qtyInput.placeholder = "e.g. 2 of 5 electricians";
    qtyInput.value = record.quantity == null ? "" : record.quantity;
    qtyField.appendChild(qtyInput);
    grid.appendChild(qtyField);

    var reasonField = document.createElement("div");
    reasonField.className = "field";
    reasonField.innerHTML = "<label>Reason</label>";
    var reasonInput = document.createElement("input");
    reasonInput.type = "text";
    reasonInput.id = "unavfield-reason";
    reasonInput.placeholder = "e.g. Annual Leave, Maintenance, Public Holiday";
    reasonInput.value = record.reason || "";
    reasonField.appendChild(reasonInput);
    grid.appendChild(reasonField);

    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "var(--text-sm)";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Resource, Start Date, End Date (on or after Start Date), and a positive Quantity are required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-3)";
    actions.style.marginTop = "var(--space-3)";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Period" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingUnavailabilityId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var qty = Number(qtyInput.value);
      var valid = resSelect.value && startInput.value && endInput.value && endInput.value >= startInput.value && qty && qty > 0;
      if (!valid) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = {
        resource_id: resSelect.value,
        start_date: startInput.value,
        end_date: endInput.value,
        quantity: qty,
        reason: reasonInput.value,
      };

      window.PCC.store.update(function (d) {
        if (isNew) {
          d.resource_unavailability.push(window.PCC.store.newResourceUnavailability(values));
        } else {
          var existing = d.resource_unavailability.find(function (u) { return u.id === record.id; });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Unavailable period added." : "Unavailable period updated.", "success");
      uiState.editingUnavailabilityId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function renderUnavailabilityTab(container, data, rerender) {
    if (uiState.editingUnavailabilityId) {
      var recordBeingEdited =
        uiState.editingUnavailabilityId === "new"
          ? window.PCC.store.newResourceUnavailability({})
          : data.resource_unavailability.find(function (u) { return u.id === uiState.editingUnavailabilityId; });
      if (recordBeingEdited) renderUnavailabilityForm(container, recordBeingEdited, data, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var resSelect = document.createElement("select");
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Resources";
    resSelect.appendChild(allOpt);
    data.resources.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      resSelect.appendChild(opt);
    });
    resSelect.value = uiState.unavailabilityResourceFilter;
    resSelect.onchange = function () {
      uiState.unavailabilityResourceFilter = resSelect.value;
      renderList();
    };
    toolbar.appendChild(resSelect);

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Period";
    addBtn.disabled = data.resources.length === 0;
    addBtn.onclick = function () {
      uiState.editingUnavailabilityId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    var listWrap = document.createElement("div");
    container.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.resource_unavailability
        .filter(function (u) {
          if (uiState.unavailabilityResourceFilter && u.resource_id !== uiState.unavailabilityResourceFilter) return false;
          return true;
        })
        .slice()
        .sort(function (a, b) { return (a.start_date || "").localeCompare(b.start_date || ""); });

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.resources.length === 0
            ? "Add a resource first, then record its leave/unavailable periods here."
            : data.resource_unavailability.length === 0
            ? "No leave/unavailable periods recorded yet. Click “+ Add Period” to add one."
            : "No periods match this filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (u) {
        var card = document.createElement("div");
        card.className = "detail-card";
        card.style.display = "flex";
        card.style.justifyContent = "space-between";
        card.style.alignItems = "center";
        card.style.gap = "var(--space-3)";
        card.style.flexWrap = "wrap";
        card.style.marginBottom = "var(--space-2)";

        var main = document.createElement("div");
        main.innerHTML =
          "<strong>" + esc(resourceName(data.resources, u.resource_id)) + "</strong> — " + u.quantity + " unavailable<br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          u.start_date + " to " + u.end_date +
          (u.reason ? " · " + esc(u.reason) : "") +
          "</span>";
        card.appendChild(main);

        var actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "var(--space-2)";

        var editBtn = document.createElement("button");
        editBtn.className = "btn btn--ghost";
        editBtn.textContent = "Edit";
        editBtn.onclick = function () {
          uiState.editingUnavailabilityId = u.id;
          rerender();
        };
        actions.appendChild(editBtn);

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn--ghost";
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = function () {
          if (!confirm("Delete this leave/unavailable period?")) return;
          window.PCC.store.update(function (d) {
            d.resource_unavailability = d.resource_unavailability.filter(function (item) { return item.id !== u.id; });
          });
          window.PCC.notify("Period deleted.", "success");
          rerender();
        };
        actions.appendChild(deleteBtn);

        card.appendChild(actions);
        list.appendChild(card);
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  // ---------------------------------------------------------------------------------
  // Leveling tab
  // ---------------------------------------------------------------------------------

  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function renderUtilisationTrend(container, utilisation) {
    if (!utilisation.available || utilisation.days.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "var(--text-sm)";
      empty.textContent = utilisation.available ? "No dated assignments to chart yet." : "Max Availability isn't set for this resource, so utilisation can't be computed.";
      container.appendChild(empty);
      return;
    }

    var bucketSize = utilisation.days.length <= 60 ? 1 : utilisation.days.length <= 260 ? 7 : 30;
    var buckets = window.PCC.resourceLevelingEngine.bucketUtilisation(utilisation.days, bucketSize);

    var width = Math.max(400, Math.min(900, buckets.length * (bucketSize === 1 ? 10 : 20)));
    var height = 120;
    var padB = 20;
    var barW = width / buckets.length;

    var svg = svgEl("svg", { width: width, height: height, style: "display:block;max-width:100%;" });

    // Buckets with a null avgUtilisationPct ("not computable" — see computeUtilisation)
    // are skipped entirely rather than drawn as a misleading 0%-tall bar.
    buckets.forEach(function (b, i) {
      if (b.avgUtilisationPct === null) return;
      var pct = Math.min(b.avgUtilisationPct, 150); // clamp bar height display at 150% so one wild spike doesn't flatten the rest of the chart
      var barH = (pct / 150) * (height - padB - 6);
      var over = b.avgUtilisationPct > 100;
      svg.appendChild(
        svgEl("rect", {
          x: i * barW + 1, y: height - padB - barH, width: Math.max(barW - 2, 1), height: barH,
          fill: over ? "var(--status-critical)" : "var(--status-info)",
        })
      );
      var title = svgEl("title");
      title.textContent = b.bucketStart + (b.bucketEnd !== b.bucketStart ? " to " + b.bucketEnd : "") + ": " + Math.round(b.avgUtilisationPct) + "%";
      svg.lastChild.appendChild(title);
    });

    var fullLineY = height - padB - (100 / 150) * (height - padB - 6);
    svg.appendChild(svgEl("line", { x1: 0, y1: fullLineY, x2: width, y2: fullLineY, stroke: "var(--signal-amber)", "stroke-width": 2, "stroke-dasharray": "4,3" }));

    container.appendChild(svg);

    var legend = document.createElement("p");
    legend.className = "text-secondary";
    legend.style.fontSize = "var(--text-xs)";
    legend.style.marginTop = "var(--space-1)";
    legend.textContent =
      (bucketSize === 1 ? "Daily" : bucketSize === 7 ? "Weekly" : "Monthly") +
      " average utilisation (allocated ÷ availability after leave). Dashed line is 100%; red bars exceed it.";
    container.appendChild(legend);
  }

  function renderHistogram(container, timeline, maxAvailability) {
    if (timeline.days.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "var(--text-sm)";
      empty.textContent = "No dated assignments to chart yet.";
      container.appendChild(empty);
      return;
    }

    var bucketSize = timeline.days.length <= 60 ? 1 : timeline.days.length <= 260 ? 7 : 30;
    var buckets = window.PCC.resourceLevelingEngine.bucketTimeline(timeline.days, bucketSize);

    var width = Math.max(400, Math.min(900, buckets.length * (bucketSize === 1 ? 10 : 20)));
    var height = 160;
    var padB = 20;
    var maxVal = Math.max(maxAvailability || 0, buckets.reduce(function (m, b) { return Math.max(m, b.allocatedMax); }, 0), 1);
    var barW = width / buckets.length;

    var svg = svgEl("svg", { width: width, height: height, style: "display:block;max-width:100%;" });

    buckets.forEach(function (b, i) {
      var barH = (b.allocatedMax / maxVal) * (height - padB - 6);
      var over = maxAvailability != null && b.allocatedMax > maxAvailability;
      svg.appendChild(
        svgEl("rect", {
          x: i * barW + 1, y: height - padB - barH, width: Math.max(barW - 2, 1), height: barH,
          fill: over ? "var(--status-critical)" : "var(--status-info)",
        })
      );
      var title = svgEl("title");
      title.textContent = b.bucketStart + (b.bucketEnd !== b.bucketStart ? " to " + b.bucketEnd : "") + ": " + b.allocatedMax;
      svg.lastChild.appendChild(title);
    });

    if (maxAvailability != null) {
      var lineY = height - padB - (maxAvailability / maxVal) * (height - padB - 6);
      svg.appendChild(svgEl("line", { x1: 0, y1: lineY, x2: width, y2: lineY, stroke: "var(--signal-amber)", "stroke-width": 2, "stroke-dasharray": "4,3" }));
    }

    container.appendChild(svg);

    var legend = document.createElement("p");
    legend.className = "text-secondary";
    legend.style.fontSize = "var(--text-xs)";
    legend.style.marginTop = "var(--space-1)";
    legend.textContent =
      (bucketSize === 1 ? "Daily" : bucketSize === 7 ? "Weekly (worst day per week)" : "Monthly (worst day per month)") +
      " allocation. Red bars exceed max availability" + (maxAvailability != null ? " (dashed line, " + maxAvailability + "/day)" : "") + ".";
    container.appendChild(legend);
  }

  function renderLevelingTab(container, data, rerender) {
    var portfolioSummary = window.PCC.resourceLevelingEngine.portfolioOverAllocationSummary(data.resources, data.resource_assignments, data.activities, data.resource_unavailability);

    var summaryPanel = document.createElement("div");
    summaryPanel.className = "panel";
    summaryPanel.style.marginBottom = "var(--space-4)";
    var summaryHeading = document.createElement("h3");
    summaryHeading.style.marginBottom = "var(--space-2)";
    summaryHeading.textContent = "Over-Allocated Resources (Portfolio-Wide)";
    summaryPanel.appendChild(summaryHeading);
    if (portfolioSummary.length === 0) {
      var okP = document.createElement("p");
      okP.className = "text-secondary";
      okP.style.fontSize = "var(--text-sm)";
      okP.textContent = "No resources are currently over-allocated on any dated assignment.";
      summaryPanel.appendChild(okP);
    } else {
      // Redesign Gate 10 (Module Consistency Pass): retrofitted onto the same
      // .attention-list/.attention-item primitive every other panel-turned-list in this
      // app now uses, replacing the original hand-built row + separate "View" ghost
      // button. Whole row is the click target now.
      var list = document.createElement("div");
      list.className = "attention-list";
      portfolioSummary.forEach(function (s) {
        var row = document.createElement("div");
        row.className = "attention-item attention-item--clickable";
        row.onclick = function () {
          uiState.levelingResourceId = s.resourceId;
          rerender();
        };

        var icon = document.createElement("span");
        icon.className = "attention-item__icon attention-item__icon--at_risk";
        row.appendChild(icon);

        var body = document.createElement("div");
        body.className = "attention-item__body";
        var text = document.createElement("div");
        text.className = "attention-item__text";
        text.textContent = s.resourceName;
        body.appendChild(text);
        var meta = document.createElement("div");
        meta.className = "attention-item__meta";
        meta.textContent = s.overAllocatedDayCount + " over-allocated day(s), worst +" + s.maxOverBy;
        body.appendChild(meta);
        row.appendChild(body);

        list.appendChild(row);
      });
      summaryPanel.appendChild(list);
    }
    container.appendChild(summaryPanel);

    if (data.resources.length === 0) {
      var empty = document.createElement("div");
      empty.className = "panel empty-state";
      empty.textContent = "Add a resource in the Register tab to see its leveling chart here.";
      container.appendChild(empty);
      return;
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    var resSelect = document.createElement("select");
    data.resources.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      resSelect.appendChild(opt);
    });
    if (!uiState.levelingResourceId || !data.resources.some(function (r) { return r.id === uiState.levelingResourceId; })) {
      uiState.levelingResourceId = data.resources[0].id;
    }
    resSelect.value = uiState.levelingResourceId;
    resSelect.onchange = function () {
      uiState.levelingResourceId = resSelect.value;
      uiState.levelingProposals = null;
      rerender();
    };
    toolbar.appendChild(resSelect);
    container.appendChild(toolbar);

    var resource = data.resources.find(function (r) { return r.id === uiState.levelingResourceId; });
    var timeline = window.PCC.resourceLevelingEngine.computeResourceUsageTimeline(resource, data.resource_assignments, data.activities);
    var overAlloc = window.PCC.resourceLevelingEngine.detectOverAllocations(resource, timeline, data.resource_unavailability);
    var utilisation = window.PCC.resourceLevelingEngine.computeUtilisation(resource, timeline, data.resource_unavailability);

    var kpiGrid = document.createElement("div");
    kpiGrid.className = "kpi-grid";
    function kpi(label, value, colorVar) {
      var card = document.createElement("div");
      card.className = "kpi-card";
      var style = colorVar ? ' style="color:var(' + colorVar + ')"' : "";
      card.innerHTML = '<span class="kpi-card__label">' + label + '</span><span class="kpi-card__value mono"' + style + ">" + value + "</span>";
      kpiGrid.appendChild(card);
    }
    var totalAssignments = data.resource_assignments.filter(function (a) { return a.resource_id === resource.id; }).length;
    kpi("Max Availability", resource.max_availability == null ? "Not set" : resource.max_availability + "/day");
    kpi("Total Assignments", totalAssignments);
    kpi("Over-Allocated Days", overAlloc.available ? overAlloc.count : "—", overAlloc.available && overAlloc.count > 0 ? "--status-critical" : null);
    kpi("Worst Over-Allocation", overAlloc.maxOverBy == null ? "—" : "+" + overAlloc.maxOverBy, overAlloc.maxOverBy ? "--status-critical" : null);
    kpi("Avg. Utilisation", utilisation.averageUtilisationPct == null ? "—" : Math.round(utilisation.averageUtilisationPct) + "%");
    kpi(
      "Demand vs Available",
      utilisation.available ? utilisation.totalDemandUnitDays + " / " + utilisation.totalAvailableUnitDays + " unit-days" : "—",
      utilisation.available && utilisation.totalShortfallUnitDays > 0 ? "--status-critical" : null
    );
    container.appendChild(kpiGrid);

    if (utilisation.available && utilisation.totalShortfallUnitDays > 0) {
      var shortageNote = document.createElement("p");
      shortageNote.style.fontSize = "var(--text-sm)";
      shortageNote.style.color = "var(--status-critical)";
      shortageNote.style.marginTop = "-8px";
      shortageNote.style.marginBottom = "var(--space-3)";
      shortageNote.textContent =
        "Shortfall: " + utilisation.totalShortfallUnitDays + " unit-day(s) of demand exceed availability across this resource's active date range.";
      container.appendChild(shortageNote);
    }

    if (!overAlloc.available) {
      var noteP = document.createElement("p");
      noteP.className = "text-secondary";
      noteP.style.fontSize = "var(--text-sm)";
      noteP.style.marginTop = "-8px";
      noteP.style.marginBottom = "var(--space-3)";
      noteP.textContent = "Max Availability isn't set for this resource, so over-allocation can't be computed — set it in the Register tab.";
      container.appendChild(noteP);
    }

    if (timeline.skippedCount > 0) {
      var skipNote = document.createElement("p");
      skipNote.className = "text-secondary";
      skipNote.style.fontSize = "var(--text-sm)";
      skipNote.style.marginBottom = "var(--space-3)";
      skipNote.textContent = timeline.skippedCount + " assignment(s) excluded from this chart (milestone, undated, or zero-quantity activity).";
      container.appendChild(skipNote);
    }

    var histPanel = document.createElement("div");
    histPanel.className = "panel";
    histPanel.style.marginBottom = "var(--space-4)";
    var histHeading = document.createElement("h4");
    histHeading.style.marginBottom = "var(--space-2)";
    histHeading.textContent = "Usage Histogram";
    histPanel.appendChild(histHeading);
    renderHistogram(histPanel, timeline, resource.max_availability);
    container.appendChild(histPanel);

    var trendPanel = document.createElement("div");
    trendPanel.className = "panel";
    trendPanel.style.marginBottom = "var(--space-4)";
    var trendHeading = document.createElement("h4");
    trendHeading.style.marginBottom = "var(--space-2)";
    trendHeading.textContent = "Utilisation Trend";
    trendPanel.appendChild(trendHeading);
    renderUtilisationTrend(trendPanel, utilisation);
    container.appendChild(trendPanel);

    var resourceUnavailability = data.resource_unavailability
      .filter(function (u) { return u.resource_id === resource.id; })
      .slice()
      .sort(function (a, b) { return (a.start_date || "").localeCompare(b.start_date || ""); });
    if (resourceUnavailability.length > 0) {
      var unavPanel = document.createElement("div");
      unavPanel.className = "panel";
      unavPanel.style.marginBottom = "var(--space-4)";
      var unavHeading = document.createElement("h4");
      unavHeading.style.marginBottom = "var(--space-2)";
      unavHeading.textContent = "Leave / Unavailable Periods (" + resourceUnavailability.length + ")";
      unavPanel.appendChild(unavHeading);
      resourceUnavailability.forEach(function (u) {
        var row = document.createElement("p");
        row.style.fontSize = "var(--text-sm)";
        row.style.margin = "var(--space-1) 0";
        row.textContent = u.start_date + " to " + u.end_date + " — " + u.quantity + " unavailable" + (u.reason ? " (" + u.reason + ")" : "");
        unavPanel.appendChild(row);
      });
      container.appendChild(unavPanel);
    }

    if (overAlloc.available && overAlloc.count > 0) {
      var conflictPanel = document.createElement("div");
      conflictPanel.className = "panel";
      var conflictHeading = document.createElement("h4");
      conflictHeading.style.marginBottom = "var(--space-2)";
      conflictHeading.textContent = "Over-Allocated Days (" + overAlloc.count + ")";
      conflictPanel.appendChild(conflictHeading);

      overAlloc.overAllocatedDays.slice(0, 20).forEach(function (day) {
        var dayRow = document.createElement("div");
        dayRow.className = "detail-card";
        dayRow.style.marginBottom = "var(--space-2)";
        dayRow.innerHTML =
          "<strong>" + day.date + "</strong> — " + day.allocated + " needed vs " + day.available + " available (+" + day.overBy + ")<br/>" +
          "<span class='text-secondary' style='font-size:12px;'>" +
          day.contributors
            .map(function (c) { return esc(c.activityName) + " (" + esc(projectName(data.projects, c.projectId)) + ", " + c.quantity + ")"; })
            .join(", ") +
          "</span>";
        conflictPanel.appendChild(dayRow);
      });
      if (overAlloc.count > 20) {
        var more = document.createElement("p");
        more.className = "text-secondary";
        more.style.fontSize = "var(--text-sm)";
        more.textContent = "+" + (overAlloc.count - 20) + " more over-allocated day(s) not shown.";
        conflictPanel.appendChild(more);
      }
      container.appendChild(conflictPanel);

      // Architecture Upgrade Phase 7 (Advanced Scheduling): Resource-Constrained
      // Leveling. Proposals are computed on demand, never automatically applied — the
      // same "surface it, let the human decide" principle every other conflict/deletion
      // in this app already follows. "Apply" sets a Start No Earlier Than constraint at
      // the proposed date rather than touching planned_start/planned_finish directly —
      // planned dates don't feed the CPM engine's own ES computation at all, so writing
      // there wouldn't survive the next "Calculate Schedule" click; a constraint DOES,
      // reusing this same phase's own constraint-honoring machinery instead of a second,
      // parallel "sticky override" mechanism.
      var levelPanel = document.createElement("div");
      levelPanel.className = "panel";
      levelPanel.style.marginTop = "var(--space-4)";
      var levelHeading = document.createElement("h4");
      levelHeading.style.marginBottom = "var(--space-2)";
      levelHeading.textContent = "Suggested Leveling";
      levelPanel.appendChild(levelHeading);

      var levelIntro = document.createElement("p");
      levelIntro.className = "text-secondary";
      levelIntro.style.fontSize = "var(--text-sm)";
      levelIntro.style.marginBottom = "var(--space-3)";
      levelIntro.textContent =
        "Proposes pushing lower-priority activities later, entirely within their own existing float — never extends the project finish, never touches a completed/in-progress activity. Applying a proposal sets a Start No Earlier Than constraint on that activity; turn on “Honor Date Constraints” in that Schedule's own settings and re-run Calculate Schedule for it to actually take effect.";
      levelPanel.appendChild(levelIntro);

      var suggestBtn = document.createElement("button");
      suggestBtn.className = "btn btn--primary";
      suggestBtn.textContent = "Suggest Leveling";
      suggestBtn.onclick = function () {
        uiState.levelingProposals = window.PCC.resourceLevelingEngine.levelResourceWithinFloat(
          resource,
          data.resource_assignments,
          data.activities,
          data.resource_unavailability
        );
        rerender();
      };
      levelPanel.appendChild(suggestBtn);

      if (uiState.levelingProposals) {
        var lp = uiState.levelingProposals;
        if (lp.proposals.length === 0 && lp.unresolved.length === 0) {
          var noneP = document.createElement("p");
          noneP.className = "text-secondary";
          noneP.style.fontSize = "var(--text-sm)";
          noneP.style.marginTop = "var(--space-3)";
          noneP.textContent = "Nothing to propose — every activity needing this resource already has enough calculated float to fit without a change, or none are eligible to move.";
          levelPanel.appendChild(noneP);
        }

        if (lp.excludedActivityIds.length > 0) {
          var excludedNames = lp.excludedActivityIds
            .map(function (id) {
              var a = data.activities.find(function (act) { return act.id === id; });
              return a ? a.name || "(unnamed activity)" : id;
            })
            .join(", ");
          var excludedP = document.createElement("p");
          excludedP.className = "text-secondary";
          excludedP.style.fontSize = "var(--text-sm)";
          excludedP.style.marginTop = "var(--space-3)";
          excludedP.textContent = "Not eligible to move (Calculate Schedule hasn't run for them yet): " + excludedNames + ".";
          levelPanel.appendChild(excludedP);
        }

        if (lp.proposals.length > 0) {
          var proposalsList = document.createElement("div");
          proposalsList.className = "project-list";
          proposalsList.style.marginTop = "var(--space-3)";
          lp.proposals.forEach(function (p) {
            var row = document.createElement("div");
            row.className = "detail-card";
            row.style.display = "flex";
            row.style.justifyContent = "space-between";
            row.style.alignItems = "center";
            row.style.marginBottom = "var(--space-2)";

            var main = document.createElement("div");
            main.innerHTML =
              "<strong>" + esc(p.activityName) + "</strong><br/>" +
              "<span class='text-secondary' style='font-size:12px;'>" +
              p.originalStart + " → " + p.originalFinish + "  becomes  " + p.proposedStart + " → " + p.proposedFinish +
              " (+" + p.shiftedByDays + "d)</span>";
            row.appendChild(main);

            var applyBtn = document.createElement("button");
            applyBtn.className = "btn btn--ghost";
            applyBtn.textContent = "Apply";
            applyBtn.onclick = function () {
              window.PCC.store.update(function (d) {
                var act = d.activities.find(function (a) { return a.id === p.activityId; });
                if (act) {
                  act.constraint_type = "SNET";
                  act.constraint_date = p.proposedStart;
                }
              });
              window.PCC.notify("Start No Earlier Than " + p.proposedStart + " set on " + p.activityName + ". Re-run Calculate Schedule on its own schedule (with Honor Date Constraints on) to apply it.", "success");
              uiState.levelingProposals = null;
              rerender();
            };
            row.appendChild(applyBtn);

            proposalsList.appendChild(row);
          });
          levelPanel.appendChild(proposalsList);
        }

        if (lp.unresolved.length > 0) {
          var unresolvedNote = document.createElement("p");
          unresolvedNote.style.fontSize = "var(--text-sm)";
          unresolvedNote.style.color = "var(--status-critical)";
          unresolvedNote.style.marginTop = "var(--space-3)";
          unresolvedNote.textContent =
            lp.unresolved.length + " day(s) remain over-allocated even after leveling within existing float — resolving this needs more capacity, less demand, or accepting a later project finish, none of which this tool decides for you.";
          levelPanel.appendChild(unresolvedNote);
        }
      }

      container.appendChild(levelPanel);
    }
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
    h1.textContent = "Resource Management";
    h1.style.marginBottom = "var(--space-2)";
    outlet.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.fontSize = "var(--text-sm)";
    sub.style.marginBottom = "var(--space-4)";
    sub.textContent =
      "A shared resource pool assigned to Schedule activities across every project, with cross-project over-allocation, leave-adjusted availability, and utilisation tracking. Quantity/availability only — no cost linkage.";
    outlet.appendChild(sub);

    var tabBar = document.createElement("div");
    tabBar.className = "tab-bar";
    [
      { key: "register", label: "Register" },
      { key: "assignments", label: "Assignments" },
      { key: "unavailability", label: "Unavailability" },
      { key: "leveling", label: "Leveling" },
    ].forEach(function (t) {
      var btn = document.createElement("button");
      btn.className = "tab-btn" + (uiState.tab === t.key ? " tab-btn--active" : "");
      btn.textContent = t.label;
      btn.onclick = function () {
        uiState.tab = t.key;
        uiState.editingResourceId = null;
        uiState.editingAssignmentId = null;
        uiState.editingUnavailabilityId = null;
        rerender();
      };
      tabBar.appendChild(btn);
    });
    outlet.appendChild(tabBar);

    var tabContent = document.createElement("div");
    tabContent.style.marginTop = "var(--space-4)";
    outlet.appendChild(tabContent);

    if (uiState.tab === "register") renderRegisterTab(tabContent, data, rerender);
    else if (uiState.tab === "assignments") renderAssignmentsTab(tabContent, data, rerender);
    else if (uiState.tab === "unavailability") renderUnavailabilityTab(tabContent, data, rerender);
    else if (uiState.tab === "leveling") renderLevelingTab(tabContent, data, rerender);
  }

  window.PCC.pages.resources = render;
  window.PCC.resources = {
    filterByProject: function (projectId) {
      uiState.tab = "assignments";
      uiState.assignmentProjectFilter = projectId;
    },
    viewResource: function (resourceId) {
      uiState.tab = "leveling";
      uiState.levelingResourceId = resourceId;
    },
    expandAssignment: function (assignmentId) {
      uiState.tab = "assignments";
      uiState.editingAssignmentId = null;
      var assignment = window.PCC.store.get().resource_assignments.find(function (a) { return a.id === assignmentId; });
      if (assignment) uiState.levelingResourceId = assignment.resource_id;
    },
  };
})();
