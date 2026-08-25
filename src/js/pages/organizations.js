/* Companies & Clients (Company/Client/Project Management redesign — CLAUDE.md spec).
 *
 * The management surface for the two new independent master-data entities Companies and
 * Clients (see newCompany()/newClient() in store.js) — create/edit/archive both, and
 * browse the Company → Client → Project hierarchy read-only from here (the projects
 * themselves are still created/edited on the Portfolio page; this page's own "+ New
 * Project" buttons just hand off there with the Company/Client pre-selected — spec point
 * 5B, "Relationship-Based Creation").
 *
 * Same "archive, never delete" pattern every other register in this app already follows
 * (Portfolio's own project archive, Document Types' deactivate) — there is deliberately no
 * delete action here at all, which is also how spec point 14's "prevent deleting a company/
 * client that has dependent records" requirement is satisfied: if the action doesn't
 * exist, it can't be taken by accident.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var uiState = {
    editingCompanyId: null, // a company id, 'new', or null
    editingClientId: null, // { company_id } context comes from the row it was opened from
    editingClientCompanyId: null,
    search: "",
    showArchived: false,
    expandedCompanyIds: {}, // company id -> true, which company cards are expanded
  };

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s === null || s === undefined ? "" : String(s);
    return div.innerHTML;
  }

  function clientsOf(data, companyId) {
    return data.clients
      .filter(function (c) { return c.company_id === companyId; })
      .slice()
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  }

  function projectsOf(data, companyId, clientId) {
    return data.projects
      .filter(function (p) { return p.company_id === companyId && p.client_id === clientId; })
      .slice()
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  }

  // ---------------------------------------------------------------------------------
  // Company add/edit form
  // ---------------------------------------------------------------------------------

  function renderCompanyForm(container, company, rerender) {
    var isNew = uiState.editingCompanyId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-4)";
    heading.textContent = isNew ? "Add Company" : "Edit Company";
    panel.appendChild(heading);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    var nameField = document.createElement("div");
    nameField.className = "field";
    nameField.innerHTML = "<label>Name *</label>";
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "cofield-name";
    nameInput.value = company.name || "";
    nameInput.required = true;
    nameField.appendChild(nameInput);
    grid.appendChild(nameField);
    form.appendChild(grid);

    var notesField = document.createElement("div");
    notesField.className = "field";
    notesField.innerHTML = "<label>Notes</label>";
    var notesArea = document.createElement("textarea");
    notesArea.id = "cofield-notes";
    notesArea.rows = 2;
    notesArea.value = company.notes || "";
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
    saveBtn.textContent = isNew ? "Add Company" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingCompanyId = null;
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

      var values = { name: name, notes: notesArea.value };
      window.PCC.store.update(function (d) {
        if (isNew) {
          d.companies.push(window.PCC.store.newCompany(values));
        } else {
          var existing = d.companies.find(function (c) { return c.id === company.id; });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });
      window.PCC.notify(isNew ? "Company added." : "Company updated.", "success");
      uiState.editingCompanyId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  // ---------------------------------------------------------------------------------
  // Client add/edit form — always scoped to one Company, per spec point 1 (a Client is
  // exclusive to the Company it's added under; there is no company-less Client, and no
  // "move this Client to a different Company" — reassignment happens on the PROJECT's own
  // relationship, not by re-parenting the Client record itself).
  // ---------------------------------------------------------------------------------

  function renderClientForm(container, client, company, rerender) {
    var isNew = uiState.editingClientId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-2)";
    heading.textContent = isNew ? "Add Client" : "Edit Client";
    panel.appendChild(heading);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.fontSize = "var(--text-sm)";
    sub.style.marginBottom = "var(--space-4)";
    sub.textContent = "Company: " + (company.name || "(unnamed company)");
    panel.appendChild(sub);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    var nameField = document.createElement("div");
    nameField.className = "field";
    nameField.innerHTML = "<label>Name *</label>";
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "clfield-name";
    nameInput.value = client.name || "";
    nameInput.required = true;
    nameField.appendChild(nameInput);
    grid.appendChild(nameField);
    form.appendChild(grid);

    var notesField = document.createElement("div");
    notesField.className = "field";
    notesField.innerHTML = "<label>Notes</label>";
    var notesArea = document.createElement("textarea");
    notesArea.id = "clfield-notes";
    notesArea.rows = 2;
    notesArea.value = client.notes || "";
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
    saveBtn.textContent = isNew ? "Add Client" : "Save Changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingClientId = null;
      uiState.editingClientCompanyId = null;
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

      var values = { name: name, notes: notesArea.value };
      window.PCC.store.update(function (d) {
        if (isNew) {
          values.company_id = company.id;
          d.clients.push(window.PCC.store.newClient(values));
        } else {
          var existing = d.clients.find(function (c) { return c.id === client.id; });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });
      window.PCC.notify(isNew ? "Client added." : "Client updated.", "success");
      uiState.editingClientId = null;
      uiState.editingClientCompanyId = null;
      rerender();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  // ---------------------------------------------------------------------------------
  // Project mini-list under a Client
  // ---------------------------------------------------------------------------------

  var STATUS_LABELS = { on_track: "On Track", at_risk: "At Risk", critical: "Critical", complete: "Complete" };
  var STATUS_BADGE_CLASS = { on_track: "on_track", at_risk: "at_risk", critical: "critical", complete: "info" };

  function openProjectWorkspace(projectId) {
    window.PCC.projectContext.set(projectId);
    window.PCC.router.go("projectWorkspace");
  }

  function renderProjectRow(p) {
    var row = document.createElement("div");
    row.className = "detail-card";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.gap = "var(--space-3)";
    row.style.marginBottom = "6px";
    if (p.archived) row.style.opacity = "0.6";

    var main = document.createElement("div");
    main.innerHTML =
      "<strong>" + esc(p.name || "(unnamed project)") + "</strong>" +
      (p.archived ? " <span class='text-secondary' style='font-size:12px;'>(archived)</span>" : "");
    row.appendChild(main);

    var right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "var(--space-3)";

    var badge = document.createElement("span");
    badge.className = "status-badge status-badge--" + (STATUS_BADGE_CLASS[p.status] || "info");
    badge.textContent = STATUS_LABELS[p.status] || p.status;
    right.appendChild(badge);

    var openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "btn btn--ghost";
    openBtn.textContent = "Open";
    openBtn.onclick = function () {
      openProjectWorkspace(p.id);
    };
    right.appendChild(openBtn);

    row.appendChild(right);
    return row;
  }

  // ---------------------------------------------------------------------------------
  // Client card (nested inside a Company card)
  // ---------------------------------------------------------------------------------

  function renderClientCard(client, company, data, rerender) {
    var card = document.createElement("div");
    card.className = "detail-card";
    card.style.marginBottom = "var(--space-3)";
    if (client.archived) card.style.opacity = "0.6";

    var header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.flexWrap = "wrap";
    header.style.gap = "var(--space-2)";

    var projects = projectsOf(data, company.id, client.id);
    var activeProjectCount = projects.filter(function (p) { return !p.archived; }).length;

    var title = document.createElement("div");
    title.innerHTML =
      "<strong>" + esc(client.name || "(unnamed client)") + "</strong>" +
      (client.archived ? " <span class='text-secondary' style='font-size:12px;'>(archived)</span>" : "") +
      " <span class='text-secondary' style='font-size:12px;'>&middot; " +
      activeProjectCount + " active project" + (activeProjectCount === 1 ? "" : "s") +
      (projects.length !== activeProjectCount ? ", " + (projects.length - activeProjectCount) + " archived" : "") +
      "</span>";
    header.appendChild(title);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-2)";

    var newProjectBtn = document.createElement("button");
    newProjectBtn.type = "button";
    newProjectBtn.className = "btn btn--ghost";
    newProjectBtn.textContent = "+ New Project";
    newProjectBtn.title = "Create a project under " + company.name + " → " + client.name;
    newProjectBtn.onclick = function () {
      // Spec point 5B (Relationship-Based Creation): hand off to Portfolio's own "+ Add
      // Project" flow with Company/Client already chosen, rather than duplicating the
      // full project form here.
      window.PCC.pendingProjectPrefill = { company_id: company.id, client_id: client.id };
      window.PCC.router.go("portfolio");
    };
    actions.appendChild(newProjectBtn);

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingClientId = client.id;
      uiState.editingClientCompanyId = company.id;
      rerender();
    };
    actions.appendChild(editBtn);

    var archiveBtn = document.createElement("button");
    archiveBtn.type = "button";
    archiveBtn.className = "btn btn--ghost";
    archiveBtn.textContent = client.archived ? "Unarchive" : "Archive";
    archiveBtn.onclick = function () {
      window.PCC.store.update(function (d) {
        var existing = d.clients.find(function (c) { return c.id === client.id; });
        if (existing) {
          existing.archived = !existing.archived;
          existing.updated_at = new Date().toISOString();
        }
      });
      window.PCC.notify(client.archived ? "Client unarchived." : "Client archived. Its projects and their data remain intact.", "info");
      rerender();
    };
    actions.appendChild(archiveBtn);

    header.appendChild(actions);
    card.appendChild(header);

    if (projects.length > 0) {
      var projectList = document.createElement("div");
      projectList.style.marginTop = "var(--space-2)";
      projects.forEach(function (p) {
        projectList.appendChild(renderProjectRow(p));
      });
      card.appendChild(projectList);
    }

    return card;
  }

  // ---------------------------------------------------------------------------------
  // Company card
  // ---------------------------------------------------------------------------------

  function renderCompanyCard(company, data, rerender) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";
    if (company.archived) panel.style.opacity = "0.7";

    var header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.flexWrap = "wrap";
    header.style.gap = "var(--space-2)";

    var clients = clientsOf(data, company.id);
    var activeClientCount = clients.filter(function (c) { return !c.archived; }).length;

    var titleWrap = document.createElement("div");
    var expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "btn btn--ghost";
    var expanded = !!uiState.expandedCompanyIds[company.id];
    expandBtn.textContent = (expanded ? "▾ " : "▸ ") + (company.name || "(unnamed company)");
    expandBtn.style.fontWeight = "600";
    expandBtn.style.fontSize = "var(--text-md)";
    expandBtn.onclick = function () {
      uiState.expandedCompanyIds[company.id] = !expanded;
      rerender();
    };
    titleWrap.appendChild(expandBtn);

    var sub = document.createElement("div");
    sub.className = "text-secondary";
    sub.style.fontSize = "12px";
    sub.style.marginLeft = "var(--space-2)";
    sub.textContent =
      activeClientCount + " active client" + (activeClientCount === 1 ? "" : "s") +
      (clients.length !== activeClientCount ? ", " + (clients.length - activeClientCount) + " archived" : "") +
      (company.archived ? " · ARCHIVED" : "");
    titleWrap.appendChild(sub);
    header.appendChild(titleWrap);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-2)";

    var addClientBtn = document.createElement("button");
    addClientBtn.type = "button";
    addClientBtn.className = "btn btn--ghost";
    addClientBtn.textContent = "+ Add Client";
    addClientBtn.onclick = function () {
      uiState.editingClientId = "new";
      uiState.editingClientCompanyId = company.id;
      uiState.expandedCompanyIds[company.id] = true;
      rerender();
    };
    actions.appendChild(addClientBtn);

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingCompanyId = company.id;
      rerender();
    };
    actions.appendChild(editBtn);

    var archiveBtn = document.createElement("button");
    archiveBtn.type = "button";
    archiveBtn.className = "btn btn--ghost";
    archiveBtn.textContent = company.archived ? "Unarchive" : "Archive";
    archiveBtn.onclick = function () {
      window.PCC.store.update(function (d) {
        var existing = d.companies.find(function (c) { return c.id === company.id; });
        if (existing) {
          existing.archived = !existing.archived;
          existing.updated_at = new Date().toISOString();
        }
      });
      window.PCC.notify(
        company.archived ? "Company unarchived." : "Company archived. Its clients and projects remain intact and accessible.",
        "info"
      );
      rerender();
    };
    actions.appendChild(archiveBtn);

    header.appendChild(actions);
    panel.appendChild(header);

    if (uiState.editingClientId && uiState.editingClientCompanyId === company.id) {
      var clientBeingEdited =
        uiState.editingClientId === "new"
          ? window.PCC.store.newClient({ company_id: company.id })
          : clients.find(function (c) { return c.id === uiState.editingClientId; });
      if (clientBeingEdited) {
        var formWrap = document.createElement("div");
        formWrap.style.marginTop = "var(--space-3)";
        renderClientForm(formWrap, clientBeingEdited, company, rerender);
        panel.appendChild(formWrap);
      }
    }

    if (expanded) {
      var body = document.createElement("div");
      body.style.marginTop = "var(--space-3)";
      var visibleClients = uiState.showArchived ? clients : clients.filter(function (c) { return !c.archived; });
      if (visibleClients.length === 0) {
        var empty = document.createElement("p");
        empty.className = "text-secondary";
        empty.style.fontSize = "var(--text-sm)";
        empty.textContent = "No clients yet under this company. Click “+ Add Client” to add the first one.";
        body.appendChild(empty);
      } else {
        visibleClients.forEach(function (c) {
          body.appendChild(renderClientCard(c, company, data, rerender));
        });
      }
      panel.appendChild(body);
    }

    return panel;
  }

  // ---------------------------------------------------------------------------------
  // Unassigned projects (visibility aid for spec point 14 — spotting orphaned/unlinked
  // projects — read-only here; assigning one happens on Portfolio's own Edit Project form)
  // ---------------------------------------------------------------------------------

  function renderUnassignedSection(data) {
    var unassigned = data.projects.filter(function (p) { return !p.company_id && !p.archived; });
    if (unassigned.length === 0) return null;

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "var(--space-4)";
    var heading = document.createElement("h3");
    heading.style.marginBottom = "var(--space-2)";
    heading.textContent = "Projects Without a Company Assigned (" + unassigned.length + ")";
    panel.appendChild(heading);
    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.fontSize = "var(--text-sm)";
    sub.style.marginBottom = "var(--space-3)";
    sub.textContent = "Assign these to a Company/Client from Portfolio's Edit Project form whenever convenient — nothing requires it.";
    panel.appendChild(sub);
    unassigned.forEach(function (p) {
      panel.appendChild(renderProjectRow(p));
    });
    return panel;
  }

  // ---------------------------------------------------------------------------------
  // Page
  // ---------------------------------------------------------------------------------

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    var h1 = document.createElement("h2");
    h1.textContent = "Companies & Clients";
    h1.style.marginBottom = "8px";
    outlet.appendChild(h1);

    var infoPanel = document.createElement("div");
    infoPanel.className = "panel";
    infoPanel.style.marginBottom = "var(--space-4)";
    infoPanel.innerHTML =
      "<p class='text-secondary' style='margin:0; font-size:13px;'>The Company → Client → Project hierarchy that " +
      "powers the global context selector (Dashboard and the shell header). Companies and Clients are independent, " +
      "permanent records — archiving one keeps its full history (clients, projects, documents, everything) intact " +
      "and searchable, it just drops out of active pickers. A Client always belongs to exactly one Company, so the " +
      "same client name under two different companies is deliberately two separate records here.</p>";
    outlet.appendChild(infoPanel);

    if (uiState.editingCompanyId) {
      var companyBeingEdited =
        uiState.editingCompanyId === "new"
          ? window.PCC.store.newCompany({})
          : data.companies.find(function (c) { return c.id === uiState.editingCompanyId; });
      if (companyBeingEdited) renderCompanyForm(outlet, companyBeingEdited, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search companies or clients…";
    search.value = uiState.search;
    search.oninput = function () {
      uiState.search = search.value;
      renderList();
    };
    toolbar.appendChild(search);

    var showArchivedLabel = document.createElement("label");
    showArchivedLabel.style.display = "flex";
    showArchivedLabel.style.alignItems = "center";
    showArchivedLabel.style.gap = "6px";
    showArchivedLabel.style.fontSize = "13px";
    showArchivedLabel.style.whiteSpace = "nowrap";
    var showArchivedCheckbox = document.createElement("input");
    showArchivedCheckbox.type = "checkbox";
    showArchivedCheckbox.checked = uiState.showArchived;
    showArchivedCheckbox.onchange = function () {
      uiState.showArchived = showArchivedCheckbox.checked;
      renderList();
    };
    showArchivedLabel.appendChild(showArchivedCheckbox);
    showArchivedLabel.appendChild(document.createTextNode("Show archived"));
    toolbar.appendChild(showArchivedLabel);

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";
    toolbar.appendChild(spacer);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Company";
    addBtn.onclick = function () {
      uiState.editingCompanyId = "new";
      rerender();
    };
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var q = uiState.search.trim().toLowerCase();
      var companies = data.companies
        .filter(function (c) { return uiState.showArchived || !c.archived; })
        .filter(function (c) {
          if (!q) return true;
          if ((c.name || "").toLowerCase().indexOf(q) !== -1) return true;
          return clientsOf(data, c.id).some(function (cl) {
            return (cl.name || "").toLowerCase().indexOf(q) !== -1;
          });
        })
        .slice()
        .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });

      if (companies.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.companies.length === 0
            ? "No companies yet. Click “+ Add Company” to add the first one."
            : "No companies match this search.";
        listWrap.appendChild(empty);
        return;
      }

      companies.forEach(function (c) {
        listWrap.appendChild(renderCompanyCard(c, data, rerender));
      });

      var unassignedSection = renderUnassignedSection(data);
      if (unassignedSection) listWrap.appendChild(unassignedSection);
    }

    renderList();
  }

  window.PCC.pages.organizations = render;
})();
