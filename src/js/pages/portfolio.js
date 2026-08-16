(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var STATUS_LABELS = {
    on_track: "On Track",
    at_risk: "At Risk",
    critical: "Critical",
    complete: "Complete",
  };

  var FIELD_CONFIG = [
    { key: "name", label: "Project Name", type: "text", required: true },
    { key: "client", label: "Client", type: "text" },
    { key: "company", label: "Company", type: "text" },
    { key: "country", label: "Country", type: "text" },
    { key: "location", label: "Location", type: "text" },
    { key: "sector", label: "Sector", type: "text" },
    { key: "contract_type", label: "Contract Type", type: "text" },
    { key: "budget", label: "Budget", type: "number" },
    { key: "contract_value", label: "Contract Value", type: "number" },
    { key: "currency", label: "Currency", type: "text" },
    { key: "start_date", label: "Start Date", type: "date" },
    { key: "finish_date", label: "Finish Date", type: "date" },
    { key: "status", label: "Status", type: "select" },
    { key: "progress", label: "Progress (%)", type: "number", min: 0, max: 100 },
    { key: "project_manager", label: "Project Manager", type: "text" },
    { key: "planner", label: "Planner", type: "text" },
    { key: "engineers", label: "Engineers", type: "text" },
    { key: "contractor", label: "Contractor", type: "text" },
    { key: "consultant", label: "Consultant", type: "text" },
    { key: "owner", label: "Owner", type: "text" },
  ];

  // View-local UI state (not persisted — resets each time you navigate away and back).
  var uiState = {
    search: "",
    statusFilter: "",
    showArchived: false,
    editingId: null, // null = form closed, "new" = creating, otherwise an existing project id
    expandedId: null, // project id whose details panel is open, or null
    vendorLinkPickerOpen: false, // Gate 9: "+ Link Vendor" inline picker in the Vendors section below
  };

  function formatMoney(value, currency) {
    if (value === null || value === undefined || value === "") return "\u2014";
    var num = Number(value);
    if (Number.isNaN(num)) return "\u2014";
    return (currency ? currency + " " : "") + num.toLocaleString();
  }

  function buildField(cfg, project) {
    var field = document.createElement("div");
    field.className = "field";

    var label = document.createElement("label");
    label.textContent = cfg.label + (cfg.required ? " *" : "");
    label.setAttribute("for", "field-" + cfg.key);
    field.appendChild(label);

    var input;
    if (cfg.type === "select") {
      input = document.createElement("select");
      window.PCC.store.PROJECT_STATUSES.forEach(function (statusKey) {
        var opt = document.createElement("option");
        opt.value = statusKey;
        opt.textContent = STATUS_LABELS[statusKey] || statusKey;
        input.appendChild(opt);
      });
      input.value = project[cfg.key] || "on_track";
    } else {
      input = document.createElement("input");
      input.type = cfg.type;
      if (cfg.type === "number") {
        if (cfg.min !== undefined) input.min = cfg.min;
        if (cfg.max !== undefined) input.max = cfg.max;
      }
      input.value = project[cfg.key] === null || project[cfg.key] === undefined ? "" : project[cfg.key];
    }
    input.id = "field-" + cfg.key;
    input.name = cfg.key;
    if (cfg.required) input.required = true;

    field.appendChild(input);
    return field;
  }

  function readFormValues(formEl) {
    var values = {};
    FIELD_CONFIG.forEach(function (cfg) {
      var el = formEl.querySelector("#field-" + cfg.key);
      if (!el) return;
      if (cfg.type === "number") {
        values[cfg.key] = el.value === "" ? null : Number(el.value);
      } else {
        values[cfg.key] = el.value;
      }
    });
    return values;
  }

  function renderForm(container, project, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Project" : "Edit Project";
    panel.appendChild(heading);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    FIELD_CONFIG.forEach(function (cfg) {
      grid.appendChild(buildField(cfg, project));
    });
    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Project Name is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Project" : "Save Changes";

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
      if (!values.name || !values.name.trim()) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.projects.push(window.PCC.store.newProject(values));
        } else {
          var existing = data.projects.find(function (p) {
            return p.id === project.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Project added." : "Project updated.", "success");
      uiState.editingId = null;
      onSaved();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function projectMatchesFilters(p) {
    if (!uiState.showArchived && p.archived) return false;
    if (uiState.statusFilter && p.status !== uiState.statusFilter) return false;
    if (uiState.search) {
      var haystack = (p.name + " " + p.client + " " + p.company).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderProjectCard(p, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card" + (p.archived ? " project-card--archived" : "");

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'>" +
      (p.name || "(unnamed project)") +
      "</div><div class='project-card__meta'>" +
      [p.client, p.company, p.country].filter(Boolean).join(" \u00b7 ") +
      "</div>";

    var badge = document.createElement("span");
    badge.className = "status-badge status-badge--" + p.status;
    badge.textContent = STATUS_LABELS[p.status] || p.status;

    var progress = document.createElement("div");
    progress.className = "project-card__progress";
    progress.innerHTML =
      "<div class='progress-track'><div class='progress-fill' style='width:" +
      Math.max(0, Math.min(100, p.progress || 0)) +
      "%;'></div></div><span class='mono text-secondary' style='font-size:12px;'>" +
      (p.progress || 0) +
      "%</span>";

    var figures = document.createElement("div");
    figures.className = "project-card__figures";
    figures.innerHTML =
      "Budget " + formatMoney(p.budget, p.currency) + "<br>Finish " + (p.finish_date || "\u2014");

    var actions = document.createElement("div");
    actions.className = "project-card__actions";

    var execCenterBtn = document.createElement("button");
    execCenterBtn.className = "btn btn--ghost";
    execCenterBtn.textContent = "Executive Center";
    execCenterBtn.onclick = function () {
      if (window.PCC.executiveCenter) window.PCC.executiveCenter.viewProject(p.id);
      window.PCC.router.go("executiveCenter");
    };

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === p.id ? "Hide Details" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === p.id ? null : p.id;
      onChanged();
    };

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingId = p.id;
      onChanged();
    };

    var archiveBtn = document.createElement("button");
    archiveBtn.className = "btn btn--ghost";
    archiveBtn.textContent = p.archived ? "Unarchive" : "Archive";
    archiveBtn.onclick = function () {
      var wasArchived = p.archived;
      window.PCC.store.update(function (data) {
        var existing = data.projects.find(function (proj) {
          return proj.id === p.id;
        });
        if (existing) {
          existing.archived = !existing.archived;
          existing.updated_at = new Date().toISOString();
        }
      });
      window.PCC.notify(wasArchived ? "Project unarchived." : "Project archived.", "info");
      onChanged();
    };

    actions.appendChild(execCenterBtn);
    actions.appendChild(detailsBtn);
    actions.appendChild(editBtn);
    actions.appendChild(archiveBtn);

    card.appendChild(main);
    card.appendChild(badge);
    card.appendChild(progress);
    card.appendChild(figures);
    card.appendChild(actions);
    return card;
  }

  var DETAIL_FIELDS = [
    { key: "sector", label: "Sector" },
    { key: "contract_type", label: "Contract Type" },
    { key: "contract_value", label: "Contract Value", money: true },
    { key: "start_date", label: "Start Date" },
    { key: "location", label: "Location" },
    { key: "project_manager", label: "Project Manager" },
    { key: "planner", label: "Planner" },
    { key: "engineers", label: "Engineers" },
    { key: "contractor", label: "Contractor" },
    { key: "consultant", label: "Consultant" },
    { key: "owner", label: "Owner" },
  ];

  function renderProjectDetails(p, onChanged) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";

    var grid = document.createElement("div");
    grid.className = "detail-grid";

    DETAIL_FIELDS.forEach(function (cfg) {
      var raw = p[cfg.key];
      var value = cfg.money ? formatMoney(raw, p.currency) : raw && String(raw).trim() ? raw : "\u2014";
      var item = document.createElement("div");
      item.innerHTML =
        "<span class='detail-item__label'>" +
        cfg.label +
        "</span><span class='detail-item__value mono'>" +
        value +
        "</span>";
      grid.appendChild(item);
    });

    wrap.appendChild(grid);

    var attachedDocs = window.PCC.store
      .get()
      .documents.filter(function (d) {
        return d.project_id === p.id;
      });

    var attachmentsSection = document.createElement("div");
    attachmentsSection.style.marginTop = "16px";
    attachmentsSection.style.paddingTop = "14px";
    attachmentsSection.style.borderTop = "1px solid var(--divider)";

    var attachmentsHeader = document.createElement("div");
    attachmentsHeader.style.display = "flex";
    attachmentsHeader.style.justifyContent = "space-between";
    attachmentsHeader.style.alignItems = "center";

    var attachmentsLabel = document.createElement("span");
    attachmentsLabel.className = "detail-item__label";
    attachmentsLabel.textContent = "ATTACHMENTS (" + attachedDocs.length + ")";
    attachmentsHeader.appendChild(attachmentsLabel);

    if (attachedDocs.length > 0) {
      var exportBtn = document.createElement("button");
      exportBtn.className = "btn btn--ghost";
      exportBtn.textContent = "Export Archive";
      exportBtn.onclick = function () {
        window.PCC.archive.exportProject(p, window.PCC.store.get().documents);
      };
      attachmentsHeader.appendChild(exportBtn);
    }

    attachmentsSection.appendChild(attachmentsHeader);

    if (attachedDocs.length === 0) {
      var noneNote = document.createElement("p");
      noneNote.className = "text-secondary";
      noneNote.style.fontSize = "13px";
      noneNote.style.margin = "6px 0 0";
      noneNote.textContent = "No documents attached to this project yet.";
      attachmentsSection.appendChild(noneNote);
    } else {
      var docList = document.createElement("div");
      docList.style.display = "flex";
      docList.style.flexDirection = "column";
      docList.style.gap = "6px";
      docList.style.marginTop = "8px";

      attachedDocs.forEach(function (doc) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";

        var label = document.createElement("span");
        label.textContent =
          doc.filename + " \u00b7 " + (window.PCC.files ? window.PCC.files.categoryLabel(doc.category) : doc.category);

        row.appendChild(label);

        // Always shown, not gated on doc.file_data — see documents.js for why.
        var openBtn = document.createElement("button");
        openBtn.className = "btn btn--ghost";
        openBtn.textContent = "Open File";
        openBtn.onclick = function () {
          window.PCC.files.open(doc);
        };
        row.appendChild(openBtn);

        docList.appendChild(row);
      });

      attachmentsSection.appendChild(docList);
    }

    wrap.appendChild(attachmentsSection);

    var projectLogs = window.PCC.store
      .get()
      .daily_logs.filter(function (d) {
        return d.project_id === p.id;
      })
      .sort(function (a, b) {
        return b.log_date.localeCompare(a.log_date);
      });

    var logsSection = document.createElement("div");
    logsSection.style.marginTop = "16px";
    logsSection.style.paddingTop = "14px";
    logsSection.style.borderTop = "1px solid var(--divider)";

    var logsHeader = document.createElement("div");
    logsHeader.style.display = "flex";
    logsHeader.style.justifyContent = "space-between";
    logsHeader.style.alignItems = "center";

    var logsLabel = document.createElement("span");
    logsLabel.className = "detail-item__label";
    logsLabel.textContent = "DAILY LOGS (" + projectLogs.length + ")";
    logsHeader.appendChild(logsLabel);

    if (projectLogs.length > 0) {
      var viewAllBtn = document.createElement("button");
      viewAllBtn.className = "btn btn--ghost";
      viewAllBtn.textContent = "View All";
      viewAllBtn.onclick = function () {
        if (window.PCC.dailyLog) window.PCC.dailyLog.filterByProject(p.id);
        window.PCC.router.go("dailylog");
      };
      logsHeader.appendChild(viewAllBtn);
    }

    logsSection.appendChild(logsHeader);

    if (projectLogs.length === 0) {
      var noLogsNote = document.createElement("p");
      noLogsNote.className = "text-secondary";
      noLogsNote.style.fontSize = "13px";
      noLogsNote.style.margin = "6px 0 0";
      noLogsNote.textContent = "No daily log entries yet for this project.";
      logsSection.appendChild(noLogsNote);
    } else {
      var logsList = document.createElement("div");
      logsList.style.display = "flex";
      logsList.style.flexDirection = "column";
      logsList.style.gap = "6px";
      logsList.style.marginTop = "8px";

      projectLogs.slice(0, 5).forEach(function (log) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";

        var label = document.createElement("span");
        label.className = "mono";
        label.textContent = log.log_date;

        var badge = document.createElement("span");
        if (log.incidents && log.incidents.trim()) {
          badge.className = "status-badge status-badge--critical";
          badge.textContent = "Incident";
        } else {
          badge.className = "status-badge status-badge--on_track";
          badge.textContent = "No incidents";
        }

        row.appendChild(label);
        row.appendChild(badge);
        logsList.appendChild(row);
      });

      logsSection.appendChild(logsList);

      if (projectLogs.length > 5) {
        var moreNote = document.createElement("p");
        moreNote.className = "text-secondary";
        moreNote.style.fontSize = "11px";
        moreNote.style.marginTop = "4px";
        moreNote.textContent = "+" + (projectLogs.length - 5) + " more \u2014 View All to see the rest.";
        logsSection.appendChild(moreNote);
      }
    }

    wrap.appendChild(logsSection);

    var projectRisks = window.PCC.store
      .get()
      .risks.filter(function (r) {
        return r.project_id === p.id && r.status !== "closed";
      });

    var risksSection = document.createElement("div");
    risksSection.style.marginTop = "16px";
    risksSection.style.paddingTop = "14px";
    risksSection.style.borderTop = "1px solid var(--divider)";

    var risksHeader = document.createElement("div");
    risksHeader.style.display = "flex";
    risksHeader.style.justifyContent = "space-between";
    risksHeader.style.alignItems = "center";

    var risksLabel = document.createElement("span");
    risksLabel.className = "detail-item__label";
    risksLabel.textContent = "OPEN RISKS / ISSUES (" + projectRisks.length + ")";
    risksHeader.appendChild(risksLabel);

    if (projectRisks.length > 0) {
      var viewAllRisksBtn = document.createElement("button");
      viewAllRisksBtn.className = "btn btn--ghost";
      viewAllRisksBtn.textContent = "View All";
      viewAllRisksBtn.onclick = function () {
        if (window.PCC.risks) window.PCC.risks.filterByProject(p.id);
        window.PCC.router.go("risks");
      };
      risksHeader.appendChild(viewAllRisksBtn);
    }

    risksSection.appendChild(risksHeader);

    if (projectRisks.length === 0) {
      var noRisksNote = document.createElement("p");
      noRisksNote.className = "text-secondary";
      noRisksNote.style.fontSize = "13px";
      noRisksNote.style.margin = "6px 0 0";
      noRisksNote.textContent = "No open risks or issues for this project.";
      risksSection.appendChild(noRisksNote);
    } else {
      var risksList = document.createElement("div");
      risksList.style.display = "flex";
      risksList.style.flexDirection = "column";
      risksList.style.gap = "6px";
      risksList.style.marginTop = "8px";

      projectRisks.slice(0, 5).forEach(function (r) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var label = document.createElement("span");
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = r.title || "(untitled)";

        row.appendChild(label);
        risksList.appendChild(row);
      });

      risksSection.appendChild(risksList);

      if (projectRisks.length > 5) {
        var moreRisksNote = document.createElement("p");
        moreRisksNote.className = "text-secondary";
        moreRisksNote.style.fontSize = "11px";
        moreRisksNote.style.marginTop = "4px";
        moreRisksNote.textContent = "+" + (projectRisks.length - 5) + " more \u2014 View All to see the rest.";
        risksSection.appendChild(moreRisksNote);
      }
    }

    wrap.appendChild(risksSection);

    var projectMeetings = window.PCC.store
      .get()
      .meetings.filter(function (m) {
        return m.project_id === p.id;
      })
      .sort(function (a, b) {
        return b.meeting_date.localeCompare(a.meeting_date);
      });

    var meetingsSection = document.createElement("div");
    meetingsSection.style.marginTop = "16px";
    meetingsSection.style.paddingTop = "14px";
    meetingsSection.style.borderTop = "1px solid var(--divider)";

    var meetingsHeader = document.createElement("div");
    meetingsHeader.style.display = "flex";
    meetingsHeader.style.justifyContent = "space-between";
    meetingsHeader.style.alignItems = "center";

    var meetingsLabel = document.createElement("span");
    meetingsLabel.className = "detail-item__label";
    meetingsLabel.textContent = "MEETINGS (" + projectMeetings.length + ")";
    meetingsHeader.appendChild(meetingsLabel);

    if (projectMeetings.length > 0) {
      var viewAllMeetingsBtn = document.createElement("button");
      viewAllMeetingsBtn.className = "btn btn--ghost";
      viewAllMeetingsBtn.textContent = "View All";
      viewAllMeetingsBtn.onclick = function () {
        if (window.PCC.meetings) window.PCC.meetings.filterByProject(p.id);
        window.PCC.router.go("meetings");
      };
      meetingsHeader.appendChild(viewAllMeetingsBtn);
    }

    meetingsSection.appendChild(meetingsHeader);

    if (projectMeetings.length === 0) {
      var noMeetingsNote = document.createElement("p");
      noMeetingsNote.className = "text-secondary";
      noMeetingsNote.style.fontSize = "13px";
      noMeetingsNote.style.margin = "6px 0 0";
      noMeetingsNote.textContent = "No meetings logged yet for this project.";
      meetingsSection.appendChild(noMeetingsNote);
    } else {
      var meetingsList = document.createElement("div");
      meetingsList.style.display = "flex";
      meetingsList.style.flexDirection = "column";
      meetingsList.style.gap = "6px";
      meetingsList.style.marginTop = "8px";

      projectMeetings.slice(0, 5).forEach(function (m) {
        var overdueInMeeting = m.actions.filter(function (a) {
          var today = new Date().toISOString().slice(0, 10);
          return a.status === "open" && a.due_date && a.due_date < today;
        }).length;

        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var label = document.createElement("span");
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = m.meeting_date + " \u2014 " + (m.title || "(untitled)");

        row.appendChild(label);

        if (overdueInMeeting > 0) {
          var overdueBadge = document.createElement("span");
          overdueBadge.className = "status-badge status-badge--critical";
          overdueBadge.textContent = overdueInMeeting + " Overdue";
          row.appendChild(overdueBadge);
        }

        meetingsList.appendChild(row);
      });

      meetingsSection.appendChild(meetingsList);

      if (projectMeetings.length > 5) {
        var moreMeetingsNote = document.createElement("p");
        moreMeetingsNote.className = "text-secondary";
        moreMeetingsNote.style.fontSize = "11px";
        moreMeetingsNote.style.marginTop = "4px";
        moreMeetingsNote.textContent = "+" + (projectMeetings.length - 5) + " more \u2014 View All to see the rest.";
        meetingsSection.appendChild(moreMeetingsNote);
      }
    }

    wrap.appendChild(meetingsSection);

    var projectRfis = window.PCC.store
      .get()
      .rfis.filter(function (r) {
        return r.project_id === p.id && r.status !== "closed";
      });

    var rfisSection = document.createElement("div");
    rfisSection.style.marginTop = "16px";
    rfisSection.style.paddingTop = "14px";
    rfisSection.style.borderTop = "1px solid var(--divider)";

    var rfisHeader = document.createElement("div");
    rfisHeader.style.display = "flex";
    rfisHeader.style.justifyContent = "space-between";
    rfisHeader.style.alignItems = "center";

    var rfisLabel = document.createElement("span");
    rfisLabel.className = "detail-item__label";
    rfisLabel.textContent = "OPEN RFIs / TQs (" + projectRfis.length + ")";
    rfisHeader.appendChild(rfisLabel);

    if (projectRfis.length > 0) {
      var viewAllRfisBtn = document.createElement("button");
      viewAllRfisBtn.className = "btn btn--ghost";
      viewAllRfisBtn.textContent = "View All";
      viewAllRfisBtn.onclick = function () {
        if (window.PCC.rfis) window.PCC.rfis.filterByProject(p.id);
        window.PCC.router.go("rfis");
      };
      rfisHeader.appendChild(viewAllRfisBtn);
    }

    rfisSection.appendChild(rfisHeader);

    if (projectRfis.length === 0) {
      var noRfisNote = document.createElement("p");
      noRfisNote.className = "text-secondary";
      noRfisNote.style.fontSize = "13px";
      noRfisNote.style.margin = "6px 0 0";
      noRfisNote.textContent = "No open RFIs or Technical Queries for this project.";
      rfisSection.appendChild(noRfisNote);
    } else {
      var rfisList = document.createElement("div");
      rfisList.style.display = "flex";
      rfisList.style.flexDirection = "column";
      rfisList.style.gap = "6px";
      rfisList.style.marginTop = "8px";

      var today = new Date().toISOString().slice(0, 10);

      projectRfis.slice(0, 5).forEach(function (r) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var label = document.createElement("span");
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = r.number + " \u2014 " + (r.subject || "(untitled)");

        row.appendChild(label);

        if (r.status === "open" && r.date_required && r.date_required < today) {
          var overdueBadge = document.createElement("span");
          overdueBadge.className = "status-badge status-badge--critical";
          overdueBadge.textContent = "Overdue";
          row.appendChild(overdueBadge);
        }

        rfisList.appendChild(row);
      });

      rfisSection.appendChild(rfisList);

      if (projectRfis.length > 5) {
        var moreRfisNote = document.createElement("p");
        moreRfisNote.className = "text-secondary";
        moreRfisNote.style.fontSize = "11px";
        moreRfisNote.style.marginTop = "4px";
        moreRfisNote.textContent = "+" + (projectRfis.length - 5) + " more \u2014 View All to see the rest.";
        rfisSection.appendChild(moreRfisNote);
      }
    }

    wrap.appendChild(rfisSection);

    var projectChangeOrders = window.PCC.store
      .get()
      .change_orders.filter(function (co) {
        return co.project_id === p.id && co.status !== "closed" && co.status !== "rejected";
      });

    var coSection = document.createElement("div");
    coSection.style.marginTop = "16px";
    coSection.style.paddingTop = "14px";
    coSection.style.borderTop = "1px solid var(--divider)";

    var coHeader = document.createElement("div");
    coHeader.style.display = "flex";
    coHeader.style.justifyContent = "space-between";
    coHeader.style.alignItems = "center";

    var coLabel = document.createElement("span");
    coLabel.className = "detail-item__label";
    coLabel.textContent = "OPEN CHANGE ORDERS (" + projectChangeOrders.length + ")";
    coHeader.appendChild(coLabel);

    if (projectChangeOrders.length > 0) {
      var viewAllCoBtn = document.createElement("button");
      viewAllCoBtn.className = "btn btn--ghost";
      viewAllCoBtn.textContent = "View All";
      viewAllCoBtn.onclick = function () {
        if (window.PCC.changeOrders) window.PCC.changeOrders.filterByProject(p.id);
        window.PCC.router.go("changeOrders");
      };
      coHeader.appendChild(viewAllCoBtn);
    }

    coSection.appendChild(coHeader);

    if (projectChangeOrders.length === 0) {
      var noCoNote = document.createElement("p");
      noCoNote.className = "text-secondary";
      noCoNote.style.fontSize = "13px";
      noCoNote.style.margin = "6px 0 0";
      noCoNote.textContent = "No open Change Orders for this project.";
      coSection.appendChild(noCoNote);
    } else {
      var coList = document.createElement("div");
      coList.style.display = "flex";
      coList.style.flexDirection = "column";
      coList.style.gap = "6px";
      coList.style.marginTop = "8px";

      projectChangeOrders.slice(0, 5).forEach(function (co) {
        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var label = document.createElement("span");
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.textContent = co.number + " \u2014 " + (co.title || "(untitled)");

        var statusBadge = document.createElement("span");
        statusBadge.className = "status-badge " + (co.status === "approved" ? "status-badge--on_track" : "status-badge--info");
        statusBadge.textContent = co.status === "approved" ? "Approved" : "Pending";

        row.appendChild(label);
        row.appendChild(statusBadge);
        coList.appendChild(row);
      });

      coSection.appendChild(coList);

      if (projectChangeOrders.length > 5) {
        var moreCoNote = document.createElement("p");
        moreCoNote.className = "text-secondary";
        moreCoNote.style.fontSize = "11px";
        moreCoNote.style.marginTop = "4px";
        moreCoNote.textContent = "+" + (projectChangeOrders.length - 5) + " more \u2014 View All to see the rest.";
        coSection.appendChild(moreCoNote);
      }
    }

    wrap.appendChild(coSection);

    // Gate 9: vendor_project_links is the same shared array Vendor Management's own
    // Projects tab reads/writes — linking or unlinking here shows up there immediately
    // and vice versa, since both sides are just views onto the one join array, not two
    // copies that need to be kept in sync.
    var vendorContractLabels = { draft: "Draft", active: "Active", completed: "Completed", terminated: "Terminated" };
    var projectVendorLinks = window.PCC.store
      .get()
      .vendor_project_links.filter(function (l) {
        return l.project_id === p.id;
      });
    var allVendors = window.PCC.store.get().vendors;

    var vendorsSection = document.createElement("div");
    vendorsSection.style.marginTop = "16px";
    vendorsSection.style.paddingTop = "14px";
    vendorsSection.style.borderTop = "1px solid var(--divider)";

    var vendorsHeader = document.createElement("div");
    vendorsHeader.style.display = "flex";
    vendorsHeader.style.justifyContent = "space-between";
    vendorsHeader.style.alignItems = "center";

    var vendorsLabel = document.createElement("span");
    vendorsLabel.className = "detail-item__label";
    vendorsLabel.textContent = "VENDORS (" + projectVendorLinks.length + ")";
    vendorsHeader.appendChild(vendorsLabel);

    var vendorsHeaderBtns = document.createElement("div");
    vendorsHeaderBtns.style.display = "flex";
    vendorsHeaderBtns.style.gap = "8px";

    var linkVendorBtn = document.createElement("button");
    linkVendorBtn.className = "btn btn--ghost";
    linkVendorBtn.textContent = "+ Link Vendor";
    var unlinkedVendors = allVendors.filter(function (v) {
      return !projectVendorLinks.some(function (l) {
        return l.vendor_id === v.id;
      });
    });
    linkVendorBtn.disabled = unlinkedVendors.length === 0;
    linkVendorBtn.title = unlinkedVendors.length === 0 ? (allVendors.length === 0 ? "Add a vendor in Vendor Management first" : "Every vendor is already linked to this project") : "";
    linkVendorBtn.onclick = function () {
      uiState.vendorLinkPickerOpen = true;
      onChanged();
    };
    vendorsHeaderBtns.appendChild(linkVendorBtn);

    if (projectVendorLinks.length > 0) {
      var viewAllVendorsBtn = document.createElement("button");
      viewAllVendorsBtn.className = "btn btn--ghost";
      viewAllVendorsBtn.textContent = "View All";
      viewAllVendorsBtn.onclick = function () {
        if (window.PCC.vendors) window.PCC.vendors.filterByProject(p.id);
        window.PCC.router.go("vendors");
      };
      vendorsHeaderBtns.appendChild(viewAllVendorsBtn);
    }

    vendorsHeader.appendChild(vendorsHeaderBtns);
    vendorsSection.appendChild(vendorsHeader);

    if (uiState.vendorLinkPickerOpen) {
      var pickerWrap = document.createElement("div");
      pickerWrap.style.marginTop = "8px";
      pickerWrap.style.display = "flex";
      pickerWrap.style.gap = "8px";
      pickerWrap.style.alignItems = "center";
      pickerWrap.style.flexWrap = "wrap";

      var vendorSelect = document.createElement("select");
      unlinkedVendors.forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = v.vendor_name || "(unnamed vendor)";
        vendorSelect.appendChild(opt);
      });
      pickerWrap.appendChild(vendorSelect);

      var confirmLinkBtn = document.createElement("button");
      confirmLinkBtn.className = "btn btn--primary";
      confirmLinkBtn.textContent = "Link";
      confirmLinkBtn.onclick = function () {
        window.PCC.store.update(function (d) {
          d.vendor_project_links.push(window.PCC.store.newVendorProjectLink({ vendor_id: vendorSelect.value, project_id: p.id }));
        });
        uiState.vendorLinkPickerOpen = false;
        onChanged();
      };
      pickerWrap.appendChild(confirmLinkBtn);

      var cancelLinkBtn = document.createElement("button");
      cancelLinkBtn.className = "btn btn--ghost";
      cancelLinkBtn.textContent = "Cancel";
      cancelLinkBtn.onclick = function () {
        uiState.vendorLinkPickerOpen = false;
        onChanged();
      };
      pickerWrap.appendChild(cancelLinkBtn);

      vendorsSection.appendChild(pickerWrap);
    }

    if (projectVendorLinks.length === 0) {
      var noVendorsNote = document.createElement("p");
      noVendorsNote.className = "text-secondary";
      noVendorsNote.style.fontSize = "13px";
      noVendorsNote.style.margin = "6px 0 0";
      noVendorsNote.textContent = "No vendors linked to this project yet.";
      vendorsSection.appendChild(noVendorsNote);
    } else {
      var vendorsList = document.createElement("div");
      vendorsList.style.display = "flex";
      vendorsList.style.flexDirection = "column";
      vendorsList.style.gap = "6px";
      vendorsList.style.marginTop = "8px";

      projectVendorLinks.slice(0, 5).forEach(function (link) {
        var vendor = allVendors.find(function (v) {
          return v.id === link.vendor_id;
        });

        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.fontSize = "13px";
        row.style.gap = "8px";

        var nameBtn = document.createElement("button");
        nameBtn.className = "btn btn--ghost";
        nameBtn.style.overflow = "hidden";
        nameBtn.style.textOverflow = "ellipsis";
        nameBtn.style.whiteSpace = "nowrap";
        nameBtn.style.padding = "2px 8px";
        nameBtn.textContent = (vendor ? vendor.vendor_name || "(unnamed vendor)" : "(deleted vendor)") + (link.role ? " — " + link.role : "");
        nameBtn.disabled = !vendor;
        nameBtn.onclick = function () {
          if (window.PCC.vendors) window.PCC.vendors.openProfile(link.vendor_id);
          window.PCC.router.go("vendors");
        };
        row.appendChild(nameBtn);

        var rightSide = document.createElement("div");
        rightSide.style.display = "flex";
        rightSide.style.alignItems = "center";
        rightSide.style.gap = "8px";
        rightSide.style.flexShrink = "0";

        var statusBadge = document.createElement("span");
        statusBadge.className = "status-badge " + (link.contract_status === "active" ? "status-badge--on_track" : link.contract_status === "terminated" ? "status-badge--critical" : "status-badge--info");
        statusBadge.textContent = vendorContractLabels[link.contract_status] || link.contract_status;
        rightSide.appendChild(statusBadge);

        var unlinkBtn = document.createElement("button");
        unlinkBtn.className = "btn btn--ghost";
        unlinkBtn.style.padding = "2px 8px";
        unlinkBtn.textContent = "Unlink";
        unlinkBtn.onclick = function () {
          window.PCC.store.update(function (d) {
            d.vendor_project_links = d.vendor_project_links.filter(function (x) {
              return x.id !== link.id;
            });
          });
          onChanged();
        };
        rightSide.appendChild(unlinkBtn);

        row.appendChild(rightSide);
        vendorsList.appendChild(row);
      });

      vendorsSection.appendChild(vendorsList);

      if (projectVendorLinks.length > 5) {
        var moreVendorsNote = document.createElement("p");
        moreVendorsNote.className = "text-secondary";
        moreVendorsNote.style.fontSize = "11px";
        moreVendorsNote.style.marginTop = "4px";
        moreVendorsNote.textContent = "+" + (projectVendorLinks.length - 5) + " more — View All to see the rest.";
        vendorsSection.appendChild(moreVendorsNote);
      }
    }

    wrap.appendChild(vendorsSection);

    var costSection = document.createElement("div");
    costSection.style.marginTop = "16px";
    costSection.style.paddingTop = "14px";
    costSection.style.borderTop = "1px solid var(--divider)";

    var costHeader = document.createElement("div");
    costHeader.style.display = "flex";
    costHeader.style.justifyContent = "space-between";
    costHeader.style.alignItems = "center";

    var costLabel = document.createElement("span");
    costLabel.className = "detail-item__label";
    costLabel.textContent = "COST TRACKING";
    costHeader.appendChild(costLabel);

    var viewAllCostBtn = document.createElement("button");
    viewAllCostBtn.className = "btn btn--ghost";
    viewAllCostBtn.textContent = "View All";
    viewAllCostBtn.onclick = function () {
      if (window.PCC.cost) window.PCC.cost.filterByProject(p.id);
      window.PCC.router.go("cost");
    };
    costHeader.appendChild(viewAllCostBtn);

    costSection.appendChild(costHeader);

    if (window.PCC.cost) {
      var costSummary = window.PCC.cost.projectCostSummary(window.PCC.store.get(), p.id);
      var costLine = document.createElement("p");
      costLine.style.fontSize = "13px";
      costLine.style.margin = "6px 0 0";
      if (costSummary.budgeted === 0 && costSummary.actual === 0) {
        costLine.className = "text-secondary";
        costLine.textContent = "No budget items or actual costs logged for this project yet.";
      } else {
        costLine.innerHTML =
          "Budgeted " + formatMoney(costSummary.budgeted) + " · Actual " + formatMoney(costSummary.actual) +
          " · <span style='color:" + (costSummary.variance < 0 ? "var(--status-critical)" : "var(--status-on-track)") + "'>" +
          (costSummary.variance >= 0 ? "+" : "") + formatMoney(costSummary.variance) + " variance</span>" +
          (costSummary.usingPortfolioBudget
            ? "<br/><span class='text-secondary' style='font-size:11px;'>Budgeted from this project's Budget field — no Cost Tracking line items yet.</span>"
            : "");
      }
      costSection.appendChild(costLine);
    }

    wrap.appendChild(costSection);

    if (window.PCC.resourceLevelingEngine && window.PCC.store.get().resources.length > 0) {
      var data = window.PCC.store.get();
      var projectActivityIds = {};
      data.activities.forEach(function (a) { if (a.project_id === p.id) projectActivityIds[a.id] = true; });
      var projectAssignments = data.resource_assignments.filter(function (a) { return projectActivityIds[a.activity_id]; });

      var resSection = document.createElement("div");
      resSection.style.marginTop = "16px";
      resSection.style.paddingTop = "14px";
      resSection.style.borderTop = "1px solid var(--divider)";

      var resHeader = document.createElement("div");
      resHeader.style.display = "flex";
      resHeader.style.justifyContent = "space-between";
      resHeader.style.alignItems = "center";
      var resLabel = document.createElement("span");
      resLabel.className = "detail-item__label";
      resLabel.textContent = "RESOURCES ASSIGNED";
      resHeader.appendChild(resLabel);
      var viewAllResBtn = document.createElement("button");
      viewAllResBtn.className = "btn btn--ghost";
      viewAllResBtn.textContent = "View All";
      viewAllResBtn.onclick = function () {
        if (window.PCC.resources) window.PCC.resources.filterByProject(p.id);
        window.PCC.router.go("resources");
      };
      resHeader.appendChild(viewAllResBtn);
      resSection.appendChild(resHeader);

      if (projectAssignments.length === 0) {
        var noRes = document.createElement("p");
        noRes.className = "text-secondary";
        noRes.style.fontSize = "13px";
        noRes.style.margin = "6px 0 0";
        noRes.textContent = "No resources assigned to this project's activities yet.";
        resSection.appendChild(noRes);
      } else {
        var portfolioOverAlloc = window.PCC.resourceLevelingEngine.portfolioOverAllocationSummary(data.resources, data.resource_assignments, data.activities);
        var overAllocById = {};
        portfolioOverAlloc.forEach(function (s) { overAllocById[s.resourceId] = s; });

        var seenResourceIds = {};
        projectAssignments.forEach(function (a) {
          if (seenResourceIds[a.resource_id]) return;
          seenResourceIds[a.resource_id] = true;
          var resource = data.resources.find(function (r) { return r.id === a.resource_id; });
          if (!resource) return;
          var overAlloc = overAllocById[resource.id];
          var line = document.createElement("p");
          line.style.fontSize = "13px";
          line.style.margin = "6px 0 0";
          line.appendChild(document.createTextNode(resource.name || "(unnamed resource)"));
          if (overAlloc) {
            var overSpan = document.createElement("span");
            overSpan.style.color = "var(--status-critical)";
            overSpan.textContent = " — over-allocated " + overAlloc.overAllocatedDayCount + " day(s) (portfolio-wide)";
            line.appendChild(overSpan);
          }
          resSection.appendChild(line);
        });
      }

      wrap.appendChild(resSection);
    }

    return wrap;
  }

  function renderProjectEntry(p, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderProjectCard(p, onChanged));
    if (uiState.expandedId === p.id) {
      entry.appendChild(renderProjectDetails(p, onChanged));
    }
    return entry;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();

    var h1 = document.createElement("h2");
    h1.textContent = "Portfolio";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    if (uiState.editingId) {
      var projectBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newProject()
          : data.projects.find(function (p) {
              return p.id === uiState.editingId;
            });
      renderForm(outlet, projectBeingEdited, rerender);
    }

    // --- Toolbar ---
    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search by name, client, or company\u2026";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      renderList();
    };

    var statusSelect = document.createElement("select");
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All statuses";
    statusSelect.appendChild(allOpt);
    window.PCC.store.PROJECT_STATUSES.forEach(function (s) {
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

    var archivedLabel = document.createElement("label");
    archivedLabel.style.display = "flex";
    archivedLabel.style.alignItems = "center";
    archivedLabel.style.gap = "6px";
    archivedLabel.style.fontSize = "13px";
    archivedLabel.style.color = "var(--text-secondary)";
    var archivedCheckbox = document.createElement("input");
    archivedCheckbox.type = "checkbox";
    archivedCheckbox.checked = uiState.showArchived;
    archivedCheckbox.onchange = function () {
      uiState.showArchived = archivedCheckbox.checked;
      renderList();
    };
    archivedLabel.appendChild(archivedCheckbox);
    archivedLabel.appendChild(document.createTextNode("Show archived"));

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Project";
    addBtn.onclick = function () {
      uiState.editingId = "new";
      rerender();
    };

    toolbar.appendChild(searchInput);
    toolbar.appendChild(statusSelect);
    toolbar.appendChild(archivedLabel);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    // --- List ---
    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.projects.filter(projectMatchesFilters);

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.projects.length === 0
            ? "No projects yet. Click \u201c+ Add Project\u201d to create your first one."
            : "No projects match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (p) {
        list.appendChild(renderProjectEntry(p, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.portfolio = render;
})();
