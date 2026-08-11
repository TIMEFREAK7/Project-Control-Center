(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var STATUS_LABELS = { pending: "Pending", approved: "Approved", rejected: "Rejected", closed: "Closed" };

  var uiState = {
    search: "",
    statusFilter: "",
    projectFilter: "",
    editingId: null,
    expandedId: null,
    revisionDrafts: {},
    pendingPrefill: null, // { project_id, source_meeting_id | source_rfi_id | source_risk_id }
  };

  function projectName(projects, projectId) {
    if (!projectId) return "Unassigned";
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "Unassigned";
  }

  function formatMoney(amount) {
    if (amount === null || amount === undefined || amount === "") return null;
    var n = Number(amount);
    if (isNaN(n)) return null;
    var sign = n > 0 ? "+" : n < 0 ? "\u2212" : "";
    return sign + Math.abs(n).toLocaleString();
  }

  function formatDays(days) {
    if (days === null || days === undefined || days === "") return null;
    var n = Number(days);
    if (isNaN(n)) return null;
    var sign = n > 0 ? "+" : n < 0 ? "\u2212" : "";
    return sign + Math.abs(n) + (Math.abs(n) === 1 ? " day" : " days");
  }

  function readFormValues(formEl) {
    return {
      title: formEl.querySelector("#cofield-title").value,
      description: formEl.querySelector("#cofield-description").value,
      justification: formEl.querySelector("#cofield-justification").value,
      requested_by: formEl.querySelector("#cofield-requested_by").value,
      date_requested: formEl.querySelector("#cofield-date_requested").value,
      cost_impact_amount: formEl.querySelector("#cofield-cost_impact_amount").value,
      schedule_impact_days: formEl.querySelector("#cofield-schedule_impact_days").value,
    };
  }

  function sourceOptionsFor(projectId) {
    var data = window.PCC.store.get();
    return {
      rfis: data.rfis.filter(function (r) {
        return r.project_id === projectId;
      }),
      risks: data.risks.filter(function (r) {
        return r.project_id === projectId;
      }),
    };
  }

  function renderForm(container, co, projects, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Change Order" : "Edit " + (co.number || "Entry");
    panel.appendChild(heading);

    var form = document.createElement("form");

    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project *</label>";
    var projSelect = document.createElement("select");
    projSelect.id = "cofield-project_id";
    var activeProjects = projects.filter(function (p) {
      return !p.archived;
    });
    if (activeProjects.length === 0) {
      var noProjOpt = document.createElement("option");
      noProjOpt.value = "";
      noProjOpt.textContent = "No projects yet \u2014 add one in Portfolio first";
      projSelect.appendChild(noProjOpt);
      projSelect.disabled = true;
    } else {
      activeProjects.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "(unnamed project)";
        projSelect.appendChild(opt);
      });
      projSelect.value = co.project_id || activeProjects[0].id;
    }
    projField.appendChild(projSelect);
    form.appendChild(projField);

    var grid = document.createElement("div");
    grid.className = "form-grid";

    function textField(id, label, value, required) {
      var f = document.createElement("div");
      f.className = "field";
      var l = document.createElement("label");
      l.textContent = label + (required ? " *" : "");
      l.setAttribute("for", id);
      var i = document.createElement("input");
      i.type = "text";
      i.id = id;
      i.value = value || "";
      if (required) i.required = true;
      f.appendChild(l);
      f.appendChild(i);
      return f;
    }

    function dateField(id, label, value) {
      var f = document.createElement("div");
      f.className = "field";
      var l = document.createElement("label");
      l.textContent = label;
      l.setAttribute("for", id);
      var i = document.createElement("input");
      i.type = "date";
      i.id = id;
      i.value = value || "";
      f.appendChild(l);
      f.appendChild(i);
      return f;
    }

    function numberField(id, label, value, placeholder) {
      var f = document.createElement("div");
      f.className = "field";
      var l = document.createElement("label");
      l.textContent = label;
      l.setAttribute("for", id);
      var i = document.createElement("input");
      i.type = "number";
      i.step = "any";
      i.id = id;
      i.placeholder = placeholder || "";
      i.value = value === null || value === undefined ? "" : value;
      f.appendChild(l);
      f.appendChild(i);
      return f;
    }

    function textareaField(id, label, value, required) {
      var f = document.createElement("div");
      f.className = "field";
      f.style.gridColumn = "1 / -1";
      var l = document.createElement("label");
      l.textContent = label + (required ? " *" : "");
      l.setAttribute("for", id);
      var i = document.createElement("textarea");
      i.rows = 3;
      i.id = id;
      i.value = value || "";
      if (required) i.required = true;
      f.appendChild(l);
      f.appendChild(i);
      return f;
    }

    grid.appendChild(textField("cofield-title", "Title", co.title, true));
    grid.appendChild(textField("cofield-requested_by", "Requested By", co.requested_by));
    grid.appendChild(dateField("cofield-date_requested", "Date Requested", co.date_requested));
    grid.appendChild(
      numberField(
        "cofield-cost_impact_amount",
        "Cost Impact (reference only \u2014 not applied to contract value)",
        co.cost_impact_amount,
        "e.g. 25000 or -5000"
      )
    );
    grid.appendChild(numberField("cofield-schedule_impact_days", "Schedule Impact (days)", co.schedule_impact_days, "e.g. 10 or -3"));
    grid.appendChild(textareaField("cofield-description", "Description \u2014 what is changing", co.description, true));
    grid.appendChild(textareaField("cofield-justification", "Justification / Reason", co.justification));

    // Optional links to a source RFI/TQ or Risk/Issue/Opportunity that triggered this
    // Change Order. Independent of each other on purpose: a CO can stem from neither,
    // either, or (rarely) both.
    var sources = sourceOptionsFor(projSelect.disabled ? "" : projSelect.value);

    var rfiField = document.createElement("div");
    rfiField.className = "field";
    var rfiLabel = document.createElement("label");
    rfiLabel.textContent = "Source RFI / TQ (optional)";
    var rfiSelect = document.createElement("select");
    rfiSelect.id = "cofield-source_rfi_id";
    var rfiNoneOpt = document.createElement("option");
    rfiNoneOpt.value = "";
    rfiNoneOpt.textContent = "None";
    rfiSelect.appendChild(rfiNoneOpt);
    sources.rfis.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.number + " \u2014 " + (r.subject || "(untitled)");
      rfiSelect.appendChild(opt);
    });
    rfiSelect.value = co.source_rfi_id || "";
    rfiField.appendChild(rfiLabel);
    rfiField.appendChild(rfiSelect);
    grid.appendChild(rfiField);

    var riskField = document.createElement("div");
    riskField.className = "field";
    var riskLabel = document.createElement("label");
    riskLabel.textContent = "Source Risk / Issue (optional)";
    var riskSelect = document.createElement("select");
    riskSelect.id = "cofield-source_risk_id";
    var riskNoneOpt = document.createElement("option");
    riskNoneOpt.value = "";
    riskNoneOpt.textContent = "None";
    riskSelect.appendChild(riskNoneOpt);
    sources.risks.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = (r.title || "(untitled)");
      riskSelect.appendChild(opt);
    });
    riskSelect.value = co.source_risk_id || "";
    riskField.appendChild(riskLabel);
    riskField.appendChild(riskSelect);
    grid.appendChild(riskField);

    if (!isNew) {
      var statusField = document.createElement("div");
      statusField.className = "field";
      var statusLabel = document.createElement("label");
      statusLabel.textContent = "Status";
      statusLabel.setAttribute("for", "cofield-status");
      var statusInput = document.createElement("select");
      statusInput.id = "cofield-status";
      window.PCC.store.CHANGE_ORDER_STATUSES.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = s;
        opt.textContent = STATUS_LABELS[s];
        statusInput.appendChild(opt);
      });
      statusInput.value = co.status;
      statusField.appendChild(statusLabel);
      statusField.appendChild(statusInput);
      grid.appendChild(statusField);

      grid.appendChild(textField("cofield-decision_by", "Decision By", co.decision_by));
      grid.appendChild(dateField("cofield-date_decided", "Date Decided", co.date_decided));
    }

    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Title, Description, and Project are required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Change Order" : "Save Changes";
    saveBtn.disabled = activeProjects.length === 0;

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingId = null;
      onSaved();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var values = readFormValues(form);
      values.project_id = projSelect.value;
      values.source_rfi_id = rfiSelect.value;
      values.source_risk_id = riskSelect.value;
      if (isNew) values.source_meeting_id = co.source_meeting_id || "";

      values.cost_impact_amount = values.cost_impact_amount === "" ? null : Number(values.cost_impact_amount);
      values.schedule_impact_days = values.schedule_impact_days === "" ? null : Number(values.schedule_impact_days);

      if (!isNew) {
        var statusEl = form.querySelector("#cofield-status");
        var decisionByEl = form.querySelector("#cofield-decision_by");
        var dateDecidedEl = form.querySelector("#cofield-date_decided");
        if (statusEl) values.status = statusEl.value;
        if (decisionByEl) values.decision_by = decisionByEl.value;
        if (dateDecidedEl) values.date_decided = dateDecidedEl.value;
      }

      if (!values.title || !values.title.trim() || !values.description || !values.description.trim() || !values.project_id) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      window.PCC.store.update(function (data) {
        if (isNew) {
          values.number = window.PCC.store.nextChangeOrderNumber(data.change_orders);
          data.change_orders.push(window.PCC.store.newChangeOrder(values));
        } else {
          var existing = data.change_orders.find(function (item) {
            return item.id === co.id;
          });
          if (existing) {
            var wasDecided =
              (existing.status === "pending") && (values.status === "approved" || values.status === "rejected");
            Object.assign(existing, values);
            if (wasDecided && !existing.date_decided) existing.date_decided = new Date().toISOString().slice(0, 10);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Change Order added." : "Change Order updated.", "success");
      uiState.editingId = null;
      onSaved();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function matchesFilters(co) {
    if (uiState.statusFilter && co.status !== uiState.statusFilter) return false;
    if (uiState.projectFilter && co.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var haystack = (co.number + " " + co.title + " " + co.description + " " + co.requested_by).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function statusBadgeClass(status) {
    if (status === "approved") return "status-badge--on_track";
    if (status === "rejected") return "status-badge--critical";
    if (status === "closed") return "status-badge--complete";
    return "status-badge--info"; // pending
  }

  function renderCard(co, projects, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card";

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'><span class='mono'>" + co.number + "</span> \u2014 " + (co.title || "(untitled)") + "</div>" +
      "<div class='project-card__meta'>" + projectName(projects, co.project_id) + (co.requested_by ? " \u00b7 " + co.requested_by : "") + "</div>";

    var badgeWrap = document.createElement("div");
    badgeWrap.style.display = "flex";
    badgeWrap.style.gap = "6px";
    badgeWrap.style.flexWrap = "wrap";

    var statusBadge = document.createElement("span");
    statusBadge.className = "status-badge " + statusBadgeClass(co.status);
    statusBadge.textContent = STATUS_LABELS[co.status];
    badgeWrap.appendChild(statusBadge);

    var costStr = formatMoney(co.cost_impact_amount);
    if (costStr !== null) {
      var costBadge = document.createElement("span");
      costBadge.className = "status-badge " + (co.cost_impact_amount > 0 ? "status-badge--at_risk" : "status-badge--on_track");
      costBadge.textContent = costStr;
      badgeWrap.appendChild(costBadge);
    }

    var daysStr = formatDays(co.schedule_impact_days);
    if (daysStr !== null) {
      var daysBadge = document.createElement("span");
      daysBadge.className = "status-badge " + (co.schedule_impact_days > 0 ? "status-badge--at_risk" : "status-badge--on_track");
      daysBadge.textContent = daysStr;
      badgeWrap.appendChild(daysBadge);
    }

    var actions = document.createElement("div");
    actions.className = "project-card__actions";

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === co.id ? "Hide" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === co.id ? null : co.id;
      onChanged();
    };

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingId = co.id;
      onChanged();
    };

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      if (!window.confirm("Delete this Change Order? This can't be undone.")) return;
      window.PCC.store.update(function (data) {
        data.change_orders = data.change_orders.filter(function (item) {
          return item.id !== co.id;
        });
      });
      window.PCC.notify("Change Order deleted.", "info");
      onChanged();
    };

    actions.appendChild(detailsBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(main);
    card.appendChild(badgeWrap);
    card.appendChild(actions);
    return card;
  }

  function renderDetails(co, onChanged) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";
    var grid = document.createElement("div");
    grid.className = "detail-grid";

    var costStr = formatMoney(co.cost_impact_amount);
    var daysStr = formatDays(co.schedule_impact_days);

    var fields = [
      { label: "REQUESTED BY", value: co.requested_by || "\u2014" },
      { label: "DATE REQUESTED", value: co.date_requested || "\u2014" },
      { label: "DECISION BY", value: co.decision_by || "\u2014" },
      { label: "DATE DECIDED", value: co.date_decided || "\u2014" },
      { label: "COST IMPACT", value: costStr === null ? "\u2014 (not specified)" : costStr + " (reference only)" },
      { label: "SCHEDULE IMPACT", value: daysStr === null ? "\u2014 (not specified)" : daysStr },
      { label: "DESCRIPTION", value: co.description || "\u2014", wide: true },
      { label: "JUSTIFICATION", value: co.justification || "\u2014", wide: true },
    ];

    fields.forEach(function (f) {
      var item = document.createElement("div");
      if (f.wide) item.style.gridColumn = "1 / -1";
      item.innerHTML = "<span class='detail-item__label'>" + f.label + "</span><span class='detail-item__value'>" + f.value + "</span>";
      grid.appendChild(item);
    });

    wrap.appendChild(grid);

    var data = window.PCC.store.get();
    var links = [];
    if (co.source_meeting_id) {
      var m = data.meetings.find(function (x) { return x.id === co.source_meeting_id; });
      if (m) links.push({ label: "RAISED IN MEETING", text: m.title + " (" + m.meeting_date + ")", go: function () {
        if (window.PCC.meetings) window.PCC.meetings.expandMeeting(m.id);
        window.PCC.router.go("meetings");
      }, btn: "View Meeting" });
    }
    if (co.source_rfi_id) {
      var r = data.rfis.find(function (x) { return x.id === co.source_rfi_id; });
      if (r) links.push({ label: "SOURCE RFI / TQ", text: r.number + " \u2014 " + (r.subject || "(untitled)"), go: function () {
        if (window.PCC.rfis) window.PCC.rfis.expandRfi(r.id);
        window.PCC.router.go("rfis");
      }, btn: "View Entry" });
    }
    if (co.source_risk_id) {
      var risk = data.risks.find(function (x) { return x.id === co.source_risk_id; });
      if (risk) links.push({ label: "SOURCE RISK / ISSUE", text: risk.title || "(untitled)", go: function () {
        if (window.PCC.risks && window.PCC.risks.expandRisk) window.PCC.risks.expandRisk(risk.id);
        window.PCC.router.go("risks");
      }, btn: "View Entry" });
    }

    links.forEach(function (link) {
      var row = document.createElement("div");
      row.style.marginTop = "12px";
      row.style.paddingTop = "10px";
      row.style.borderTop = "1px solid var(--divider)";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.fontSize = "13px";

      var label = document.createElement("span");
      label.innerHTML = "<span class='detail-item__label'>" + link.label + "</span>" + link.text;

      var btn = document.createElement("button");
      btn.className = "btn btn--ghost";
      btn.textContent = link.btn;
      btn.onclick = link.go;

      row.appendChild(label);
      row.appendChild(btn);
      wrap.appendChild(row);
    });

    // Approval / decision history log
    var revisionsWrap = document.createElement("div");
    revisionsWrap.style.marginTop = "14px";
    revisionsWrap.style.paddingTop = "10px";
    revisionsWrap.style.borderTop = "1px solid var(--divider)";

    var revisionsHeading = document.createElement("p");
    revisionsHeading.className = "detail-item__label";
    revisionsHeading.style.marginBottom = "6px";
    revisionsHeading.textContent = "APPROVAL / DECISION HISTORY (" + co.revisions.length + ")";
    revisionsWrap.appendChild(revisionsHeading);

    if (co.revisions.length === 0) {
      var noRevisions = document.createElement("p");
      noRevisions.className = "text-secondary";
      noRevisions.style.fontSize = "13px";
      noRevisions.style.margin = "0 0 8px";
      noRevisions.textContent = "No notes logged yet.";
      revisionsWrap.appendChild(noRevisions);
    } else {
      co.revisions
        .slice()
        .reverse()
        .forEach(function (rev) {
          var row = document.createElement("div");
          row.style.fontSize = "13px";
          row.style.marginBottom = "6px";
          row.innerHTML =
            "<span class='mono' style='color:var(--text-secondary)'>" + rev.date + "</span>" +
            (rev.author ? " \u2014 <strong>" + rev.author + "</strong>" : "") +
            ": " + rev.note;
          revisionsWrap.appendChild(row);
        });
    }

    var draft = uiState.revisionDrafts[co.id] || { author: "", note: "" };

    var revForm = document.createElement("div");
    revForm.style.display = "flex";
    revForm.style.gap = "6px";
    revForm.style.marginTop = "6px";
    revForm.style.flexWrap = "wrap";

    var authorInput = document.createElement("input");
    authorInput.type = "text";
    authorInput.placeholder = "Author";
    authorInput.style.maxWidth = "140px";
    authorInput.value = draft.author;
    authorInput.oninput = function () {
      uiState.revisionDrafts[co.id] = { author: authorInput.value, note: noteInput.value };
    };

    var noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.placeholder = "Add an approval/decision note\u2026";
    noteInput.style.flex = "1";
    noteInput.style.minWidth = "180px";
    noteInput.value = draft.note;
    noteInput.oninput = function () {
      uiState.revisionDrafts[co.id] = { author: authorInput.value, note: noteInput.value };
    };

    var addRevBtn = document.createElement("button");
    addRevBtn.className = "btn btn--ghost";
    addRevBtn.type = "button";
    addRevBtn.textContent = "Add Note";
    addRevBtn.onclick = function () {
      if (!noteInput.value.trim()) return;
      window.PCC.store.update(function (data) {
        var existing = data.change_orders.find(function (item) {
          return item.id === co.id;
        });
        if (existing) {
          existing.revisions.push(
            window.PCC.store.newChangeOrderRevision({ author: authorInput.value.trim(), note: noteInput.value.trim() })
          );
          existing.updated_at = new Date().toISOString();
        }
      });
      delete uiState.revisionDrafts[co.id];
      onChanged();
    };

    revForm.appendChild(authorInput);
    revForm.appendChild(noteInput);
    revForm.appendChild(addRevBtn);
    revisionsWrap.appendChild(revForm);

    wrap.appendChild(revisionsWrap);
    return wrap;
  }

  function renderEntry(co, projects, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderCard(co, projects, onChanged));
    if (uiState.expandedId === co.id) entry.appendChild(renderDetails(co, onChanged));
    return entry;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();
    var projects = data.projects;

    var h1 = document.createElement("h2");
    h1.textContent = "Change Management";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    var noteP = document.createElement("p");
    noteP.className = "text-secondary";
    noteP.style.fontSize = "12px";
    noteP.style.marginTop = "-10px";
    noteP.style.marginBottom = "14px";
    noteP.textContent = "Cost and schedule impact are tracked for reference only \u2014 they don't change a project's contract value in Portfolio automatically.";
    outlet.appendChild(noteP);

    if (uiState.editingId) {
      var coBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newChangeOrder(uiState.pendingPrefill || {})
          : data.change_orders.find(function (co) {
              return co.id === uiState.editingId;
            });
      if (uiState.editingId === "new") uiState.pendingPrefill = null;
      renderForm(outlet, coBeingEdited, projects, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search number, title, description\u2026";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      renderList();
    };

    var statusSelect = document.createElement("select");
    var allStatusOpt = document.createElement("option");
    allStatusOpt.value = "";
    allStatusOpt.textContent = "All statuses";
    statusSelect.appendChild(allStatusOpt);
    window.PCC.store.CHANGE_ORDER_STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABELS[s];
      statusSelect.appendChild(opt);
    });
    statusSelect.value = uiState.statusFilter;
    statusSelect.onchange = function () {
      uiState.statusFilter = statusSelect.value;
      renderList();
    };

    var projSelectFilter = document.createElement("select");
    var allProjOpt = document.createElement("option");
    allProjOpt.value = "";
    allProjOpt.textContent = "All projects";
    projSelectFilter.appendChild(allProjOpt);
    projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projSelectFilter.appendChild(opt);
    });
    projSelectFilter.value = uiState.projectFilter;
    projSelectFilter.onchange = function () {
      uiState.projectFilter = projSelectFilter.value;
      renderList();
    };

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Change Order";
    var hasActiveProjects = projects.some(function (p) {
      return !p.archived;
    });
    addBtn.disabled = !hasActiveProjects;
    addBtn.title = hasActiveProjects ? "" : "Add a project in Portfolio first";
    addBtn.onclick = function () {
      uiState.editingId = "new";
      rerender();
    };

    toolbar.appendChild(searchInput);
    toolbar.appendChild(statusSelect);
    toolbar.appendChild(projSelectFilter);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.change_orders.filter(matchesFilters);

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.change_orders.length === 0
            ? projects.filter(function (p) { return !p.archived; }).length === 0
              ? "Add a project in Portfolio first, then log Change Orders against it."
              : "No Change Orders yet. Click \u201c+ Add Change Order\u201d to log your first one."
            : "No entries match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (co) {
        list.appendChild(renderEntry(co, projects, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.changeOrders = render;
  window.PCC.changeOrders = {
    filterByProject: function (projectId) {
      uiState.projectFilter = projectId;
      uiState.statusFilter = "";
      uiState.search = "";
    },
    createFromMeeting: function (projectId, meetingId) {
      uiState.pendingPrefill = { project_id: projectId, source_meeting_id: meetingId };
      uiState.editingId = "new";
    },
    createFromRfi: function (projectId, rfiId) {
      uiState.pendingPrefill = { project_id: projectId, source_rfi_id: rfiId };
      uiState.editingId = "new";
    },
    createFromRisk: function (projectId, riskId) {
      uiState.pendingPrefill = { project_id: projectId, source_risk_id: riskId };
      uiState.editingId = "new";
    },
    expandChangeOrder: function (id) {
      uiState.expandedId = id;
    },
  };
})();
