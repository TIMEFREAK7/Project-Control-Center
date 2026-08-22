/* Document Types (Gate 14 — Document Control 1: Master Document Repository).
 *
 * A portfolio-wide, user-configurable list of document TYPES (BOQ, ITP, Method
 * Statement, ...) that may be required on a project. This is the first admin-manageable
 * taxonomy register in PCC — every prior "types" list (Documents' category,
 * VENDOR_DOCUMENT_CATEGORIES, RESOURCE_TYPES) is a hardcoded JS array, not something the
 * user can add/edit/deactivate themselves.
 *
 * SCOPE, DELIBERATELY (Gate 14 of 1, decided before building):
 * - This is ONLY the master repository — a flat, portfolio-wide list of type
 *   definitions. It does not yet decide which types apply to which project (that's
 *   "project-specific document requirements," a later gate), and it does not touch
 *   documents.js's existing `category` field or vendors.js's VENDOR_DOCUMENT_CATEGORIES
 *   — reconciling those is real design work for a later "classification" gate, not this
 *   one.
 * - `default_criticality` is stored per type but not read/enforced anywhere yet; it's
 *   only ever a suggested starting point for a document requirement created from this
 *   type in a later gate.
 * - Deactivating (not deleting) is the primary way to retire a type without breaking
 *   anything that might reference it by id later. Hard delete is also offered here since
 *   nothing in the app references document_types yet this gate — once a later gate adds
 *   real references, delete should get a usage guard the same way Resources' delete
 *   already warns about cascading assignment deletes.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var CRITICALITY_LABELS = {
    critical: "Critical",
    major: "Major",
    normal: "Normal",
    informational: "Informational",
  };

  var uiState = {
    editingTypeId: null, // a document_type id, 'new', or null
    search: "",
    categoryFilter: "",
    showInactive: false,
  };

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s === null || s === undefined ? "" : String(s);
    return div.innerHTML;
  }

  function distinctCategories(documentTypes) {
    var seen = {};
    var out = [];
    documentTypes.forEach(function (t) {
      var c = (t.category || "").trim();
      if (c && !seen[c]) {
        seen[c] = true;
        out.push(c);
      }
    });
    out.sort();
    return out;
  }

  // ---------------------------------------------------------------------------------
  // Add/Edit form
  // ---------------------------------------------------------------------------------

  function renderTypeForm(container, documentType, data, rerender) {
    var isNew = uiState.editingTypeId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Document Type" : "Edit Document Type";
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

    grid.appendChild(textField("Name *", "dtfield-name", documentType.name, true));
    grid.appendChild(textField("Code (short abbreviation)", "dtfield-code", documentType.code));
    grid.appendChild(textField("Category (grouping label)", "dtfield-category", documentType.category));

    var critField = document.createElement("div");
    critField.className = "field";
    critField.innerHTML = "<label>Default Criticality</label>";
    var critSelect = document.createElement("select");
    critSelect.id = "dtfield-criticality";
    window.PCC.store.DOCUMENT_TYPE_CRITICALITY_LEVELS.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CRITICALITY_LABELS[c] || c;
      critSelect.appendChild(opt);
    });
    critSelect.value = documentType.default_criticality || "normal";
    critField.appendChild(critSelect);
    grid.appendChild(critField);

    form.appendChild(grid);

    var descField = document.createElement("div");
    descField.className = "field";
    descField.innerHTML = "<label>Description</label>";
    var descArea = document.createElement("textarea");
    descArea.id = "dtfield-description";
    descArea.rows = 2;
    descArea.value = documentType.description || "";
    descField.appendChild(descArea);
    form.appendChild(descField);

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
    saveBtn.textContent = isNew ? "Add Document Type" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingTypeId = null;
      rerender();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var name = form.querySelector("#dtfield-name").value.trim();
      if (!name) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = {
        name: name,
        code: form.querySelector("#dtfield-code").value.trim(),
        category: form.querySelector("#dtfield-category").value.trim(),
        default_criticality: critSelect.value,
        description: descArea.value,
      };

      window.PCC.store.update(function (d) {
        if (isNew) {
          d.document_types.push(window.PCC.store.newDocumentType(values));
        } else {
          var existing = d.document_types.find(function (t) {
            return t.id === documentType.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Document type added." : "Document type updated.", "success");
      uiState.editingTypeId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  // ---------------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------------

  function renderTypeRow(t, rerender) {
    var card = document.createElement("div");
    card.className = "detail-card";
    card.style.display = "flex";
    card.style.justifyContent = "space-between";
    card.style.alignItems = "center";
    card.style.gap = "12px";
    card.style.flexWrap = "wrap";
    card.style.marginBottom = "6px";
    if (!t.active) card.style.opacity = "0.6";

    var main = document.createElement("div");
    main.innerHTML =
      "<strong>" + esc(t.name) + "</strong>" +
      (t.code ? " <span class='text-secondary mono' style='font-size:12px;'>(" + esc(t.code) + ")</span>" : "") +
      "<br/><span class='text-secondary' style='font-size:12px;'>" +
      (t.category ? esc(t.category) + " · " : "") +
      (CRITICALITY_LABELS[t.default_criticality] || t.default_criticality) +
      (t.active ? "" : " · INACTIVE") +
      "</span>" +
      (t.description ? "<br/><span class='text-secondary' style='font-size:12px;'>" + esc(t.description) + "</span>" : "");
    card.appendChild(main);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingTypeId = t.id;
      rerender();
    };
    actions.appendChild(editBtn);

    var toggleBtn = document.createElement("button");
    toggleBtn.className = "btn btn--ghost";
    toggleBtn.textContent = t.active ? "Deactivate" : "Reactivate";
    toggleBtn.onclick = function () {
      window.PCC.store.update(function (d) {
        var existing = d.document_types.find(function (item) {
          return item.id === t.id;
        });
        if (existing) {
          existing.active = !existing.active;
          existing.updated_at = new Date().toISOString();
        }
      });
      window.PCC.notify(t.active ? "Document type deactivated." : "Document type reactivated.", "info");
      rerender();
    };
    actions.appendChild(toggleBtn);

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      if (!confirm('Delete document type "' + t.name + '"? This can\'t be undone.')) return;
      window.PCC.store.update(function (d) {
        d.document_types = d.document_types.filter(function (item) {
          return item.id !== t.id;
        });
      });
      window.PCC.notify("Document type deleted.", "success");
      rerender();
    };
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    return card;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    var h1 = document.createElement("h2");
    h1.textContent = "Document Types";
    h1.style.marginBottom = "8px";
    outlet.appendChild(h1);

    var infoPanel = document.createElement("div");
    infoPanel.className = "panel";
    infoPanel.style.marginBottom = "16px";
    infoPanel.innerHTML =
      "<p class='text-secondary' style='margin:0; font-size:13px;'>The master repository of document types " +
      "that may be required across your projects (BOQ, Method Statement, ITP, ...). This list is portfolio-wide " +
      "and configurable — add, edit, or deactivate types here. Deciding which types apply to a specific " +
      "project comes in a later gate; this page only manages the repository itself.</p>";
    outlet.appendChild(infoPanel);

    if (uiState.editingTypeId) {
      var typeBeingEdited =
        uiState.editingTypeId === "new"
          ? window.PCC.store.newDocumentType({})
          : data.document_types.find(function (t) {
              return t.id === uiState.editingTypeId;
            });
      if (typeBeingEdited) renderTypeForm(outlet, typeBeingEdited, data, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search name or code…";
    search.value = uiState.search;
    search.oninput = function () {
      uiState.search = search.value;
      renderList();
    };
    toolbar.appendChild(search);

    var catSelect = document.createElement("select");
    var allCatOpt = document.createElement("option");
    allCatOpt.value = "";
    allCatOpt.textContent = "All Categories";
    catSelect.appendChild(allCatOpt);
    distinctCategories(data.document_types).forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      catSelect.appendChild(opt);
    });
    catSelect.value = uiState.categoryFilter;
    catSelect.onchange = function () {
      uiState.categoryFilter = catSelect.value;
      renderList();
    };
    toolbar.appendChild(catSelect);

    var showInactiveLabel = document.createElement("label");
    showInactiveLabel.style.display = "flex";
    showInactiveLabel.style.alignItems = "center";
    showInactiveLabel.style.gap = "6px";
    showInactiveLabel.style.fontSize = "13px";
    showInactiveLabel.style.whiteSpace = "nowrap";
    var showInactiveCheckbox = document.createElement("input");
    showInactiveCheckbox.type = "checkbox";
    showInactiveCheckbox.checked = uiState.showInactive;
    showInactiveCheckbox.onchange = function () {
      uiState.showInactive = showInactiveCheckbox.checked;
      renderList();
    };
    showInactiveLabel.appendChild(showInactiveCheckbox);
    showInactiveLabel.appendChild(document.createTextNode("Show inactive"));
    toolbar.appendChild(showInactiveLabel);

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Document Type";
    addBtn.onclick = function () {
      uiState.editingTypeId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.document_types.filter(function (t) {
        if (!uiState.showInactive && !t.active) return false;
        if (uiState.categoryFilter && t.category !== uiState.categoryFilter) return false;
        if (uiState.search) {
          var q = uiState.search.toLowerCase();
          var hay = ((t.name || "") + " " + (t.code || "")).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.document_types.length === 0
            ? "No document types yet. Click “+ Add Document Type” to add the first one."
            : "No document types match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered
        .slice()
        .sort(function (a, b) {
          return (a.name || "").localeCompare(b.name || "");
        })
        .forEach(function (t) {
          list.appendChild(renderTypeRow(t, rerender));
        });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.documentTypes = render;
  // Public API for later gates (project-specific requirements, vendor templates, ...)
  // to read the active portion of the repository without reaching into uiState.
  window.PCC.documentTypes = {
    activeTypes: function () {
      return window.PCC.store.get().document_types.filter(function (t) {
        return t.active;
      });
    },
  };
})();
