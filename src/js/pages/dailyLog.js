(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var FIELD_CONFIG = [
    { key: "log_date", label: "Date", type: "date", required: true },
    { key: "weather", label: "Weather", type: "text", placeholder: "e.g. Sunny, 32\u00b0C" },
    { key: "manpower", label: "Manpower", type: "text", placeholder: "e.g. Direct: 45, Contractor: 120" },
    { key: "equipment", label: "Equipment on site", type: "text" },
    { key: "visitors", label: "Visitors", type: "text" },
    { key: "deliveries", label: "Deliveries", type: "text" },
    { key: "activities", label: "Activities", type: "textarea" },
    { key: "safety_notes", label: "Safety notes", type: "textarea" },
    { key: "incidents", label: "Incidents", type: "textarea" },
    { key: "notes", label: "General notes", type: "textarea" },
  ];

  var LARGE_PHOTO_WARNING_BYTES = 8 * 1024 * 1024; // 8MB raw, soft warning only \u2014 storage size isn't a constraint here

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    var kb = bytes / 1024;
    if (kb < 1024) return Math.round(kb) + " KB";
    return (kb / 1024).toFixed(1) + " MB";
  }

  var uiState = {
    search: "",
    projectFilter: "",
    // Redesign Gate 6 (Global Project Context): see risks.js's own uiState comment.
    projectFilterInitialized: false,
    editingId: null, // null = closed, "new" = creating, otherwise an existing log id
    expandedId: null,
    // Daily-Use Audit Phase 3 ("duplicate as template"): same pendingPrefill pattern
    // risks.js/rfis.js/etc. already use, set by cloneBtn below. log_date/incidents/
    // photos are deliberately never included — a clone is a fresh day, not a copy of
    // yesterday's safety incident or photos.
    pendingPrefill: null,
    // Gate E (Planning & Scheduling-Centric Delay Management, spec point 22 — Daily
    // Site Log integration): id of the log entry whose "+ Log Delay" quick-create form
    // is currently open, or null.
    creatingDelayForLogId: null,
  };

  // Gate E (spec point 22): the daily-life examples the spec itself lists (material/
  // equipment unavailable, labour shortage, ...) map onto schedule.js's own
  // DELAY_CATEGORIES — duplicated here per this app's established per-module-helpers
  // convention (see this file's own field-config pattern for the same treatment).
  var DAILY_LOG_DELAY_CATEGORY_LABELS = {
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
    resource_shortage: "Resource Shortage (Labour Shortage)",
    equipment_shortage: "Equipment Shortage",
    site_access: "Site Access Restriction",
    site_constraint: "Site Constraint (Workfront Unavailable)",
    interface_issue: "Interface Issue",
    weather: "Weather Interruption",
    procurement: "Procurement",
    quality_issue: "Quality Issue",
    rework: "Rework",
    change_variation: "Change / Variation",
    other: "Other",
  };

  function projectName(projects, projectId) {
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : null;
  }

  function buildField(cfg, log) {
    var field = document.createElement("div");
    field.className = "field";
    if (cfg.type === "textarea") field.style.gridColumn = "1 / -1";

    var label = document.createElement("label");
    label.textContent = cfg.label + (cfg.required ? " *" : "");
    label.setAttribute("for", "dlfield-" + cfg.key);
    field.appendChild(label);

    var input;
    if (cfg.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
    } else {
      input = document.createElement("input");
      input.type = cfg.type;
      if (cfg.placeholder) input.placeholder = cfg.placeholder;
    }
    input.id = "dlfield-" + cfg.key;
    input.name = cfg.key;
    if (cfg.required) input.required = true;
    input.value = log[cfg.key] || "";

    field.appendChild(input);
    return field;
  }

  function readFormValues(formEl) {
    var values = {};
    FIELD_CONFIG.forEach(function (cfg) {
      var el = formEl.querySelector("#dlfield-" + cfg.key);
      if (el) values[cfg.key] = el.value;
    });
    return values;
  }

  /** Gate 10: see risks.js's identical helper for the full rationale. */
  function activityOptionsFor(select, data, projectId, selectedActivityId) {
    select.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "(none)";
    select.appendChild(noneOpt);

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

  function renderForm(container, log, projects, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Daily Log" : "Edit Daily Log";
    panel.appendChild(heading);

    var form = document.createElement("form");

    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project *</label>";
    var projSelect = document.createElement("select");
    projSelect.id = "dlfield-project_id";
    if (projects.length === 0) {
      var noProjOpt = document.createElement("option");
      noProjOpt.value = "";
      noProjOpt.textContent = "No projects yet \u2014 add one in Portfolio first";
      projSelect.appendChild(noProjOpt);
      projSelect.disabled = true;
    } else {
      projects
        .filter(function (p) {
          return !p.archived;
        })
        .forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name || "(unnamed project)";
          projSelect.appendChild(opt);
        });
      projSelect.value = log.project_id || projects[0].id;
    }
    projField.appendChild(projSelect);
    form.appendChild(projField);

    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Linked Activity (optional)</label>";
    var activitySelect = document.createElement("select");
    activitySelect.id = "dlfield-activity_id";
    activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, log.activity_id);
    activityField.appendChild(activitySelect);
    form.appendChild(activityField);
    projSelect.onchange = function () {
      activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, "");
    };

    var grid = document.createElement("div");
    grid.className = "form-grid";
    FIELD_CONFIG.forEach(function (cfg) {
      grid.appendChild(buildField(cfg, log));
    });
    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    form.appendChild(errorMsg);

    // Bug fix (Daily-Use Audit, Phase 1): this page's own subtitle claims "one entry per
    // project per day," but nothing enforced it — an accidental double-click on "+ Add
    // Daily Log" silently created two. Scoped to a local variable (not uiState) so it
    // only ever applies to this one open form instance and resets automatically the
    // next time the form is opened fresh — no state to remember to clear elsewhere.
    var duplicateWarningAcknowledged = false;
    function resetDuplicateWarning() {
      duplicateWarningAcknowledged = false;
    }
    projSelect.addEventListener("change", resetDuplicateWarning);
    var dateFieldEl = form.querySelector("#dlfield-log_date");
    if (dateFieldEl) dateFieldEl.addEventListener("change", resetDuplicateWarning);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Log" : "Save Changes";
    saveBtn.disabled = projects.length === 0;

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
      values.activity_id = activitySelect.value;
      if (!values.project_id || !values.log_date) {
        errorMsg.textContent = "Project and Date are required.";
        errorMsg.style.color = "var(--status-critical)";
        errorMsg.style.display = "block";
        return;
      }

      if (isNew && !duplicateWarningAcknowledged) {
        var duplicate = window.PCC.store.get().daily_logs.find(function (d) {
          return d.project_id === values.project_id && d.log_date === values.log_date;
        });
        if (duplicate) {
          errorMsg.textContent =
            "A daily log already exists for this project on " + values.log_date +
            ". Click “" + saveBtn.textContent + "” again to add another entry anyway.";
          errorMsg.style.color = "var(--status-at-risk)";
          errorMsg.style.display = "block";
          duplicateWarningAcknowledged = true;
          return;
        }
      }
      errorMsg.style.display = "none";

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.daily_logs.push(window.PCC.store.newDailyLog(values));
        } else {
          var existing = data.daily_logs.find(function (d) {
            return d.id === log.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Daily log added." : "Daily log updated.", "success");
      uiState.editingId = null;
      onSaved();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function logMatchesFilters(log, projects) {
    if (uiState.projectFilter && log.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var pName = projectName(projects, log.project_id) || "";
      var haystack = [pName, log.activities, log.notes, log.weather].join(" ").toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderLogCard(log, projects, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card";

    var main = document.createElement("div");
    main.className = "project-card__main";
    var pName = projectName(projects, log.project_id) || "(project removed)";
    main.innerHTML =
      "<div class='project-card__name'>" +
      log.log_date +
      " \u00b7 " +
      pName +
      "</div><div class='project-card__meta'>" +
      (log.activities ? log.activities.slice(0, 90) + (log.activities.length > 90 ? "\u2026" : "") : "No activities logged") +
      "</div>";

    var badge = document.createElement("span");
    if (log.incidents && log.incidents.trim()) {
      badge.className = "status-badge status-badge--critical";
      badge.textContent = "Incident";
    } else {
      badge.className = "status-badge status-badge--on_track";
      badge.textContent = "No incidents";
    }

    var badgeWrap = document.createElement("div");
    badgeWrap.style.display = "flex";
    badgeWrap.style.gap = "6px";
    badgeWrap.style.flexWrap = "wrap";
    badgeWrap.appendChild(badge);

    if (log.photos && log.photos.length > 0) {
      var photoBadge = document.createElement("span");
      photoBadge.className = "status-badge status-badge--info";
      photoBadge.textContent = log.photos.length + (log.photos.length === 1 ? " photo" : " photos");
      badgeWrap.appendChild(photoBadge);
    }

    var actions = document.createElement("div");
    actions.className = "project-card__actions";

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === log.id ? "Hide" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === log.id ? null : log.id;
      onChanged();
    };

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingId = log.id;
      onChanged();
    };

    // Daily-Use Audit Phase 3 ("duplicate as template"): a Daily Log is filled in every
    // single day, so cloning yesterday's (or any prior) entry as a starting point is the
    // highest-value clone case in the app — same manpower/equipment/visitors boilerplate
    // most days. Date resets to today (so the duplicate-entry guard applies normally),
    // and incidents/photos are deliberately never carried over to a new day.
    var cloneBtn = document.createElement("button");
    cloneBtn.className = "btn btn--ghost";
    cloneBtn.textContent = "Clone";
    cloneBtn.onclick = function () {
      uiState.pendingPrefill = {
        project_id: log.project_id,
        weather: log.weather,
        manpower: log.manpower,
        equipment: log.equipment,
        visitors: log.visitors,
        deliveries: log.deliveries,
        activities: log.activities,
        safety_notes: log.safety_notes,
        notes: log.notes,
        activity_id: log.activity_id,
      };
      uiState.editingId = "new";
      onChanged();
    };

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      if (!window.confirm("Delete this daily log entry? This can't be undone.")) return;
      window.PCC.store.update(function (data) {
        data.daily_logs = data.daily_logs.filter(function (d) {
          return d.id !== log.id;
        });
      });
      window.PCC.notify("Daily log deleted.", "info");
      onChanged();
    };

    actions.appendChild(detailsBtn);
    actions.appendChild(editBtn);
    actions.appendChild(cloneBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(main);
    card.appendChild(badgeWrap);
    card.appendChild(actions);
    return card;
  }

  var DETAIL_FIELDS = FIELD_CONFIG.filter(function (f) {
    return f.key !== "log_date";
  });

  /** Converts a stored base64 data URI back into a Blob and opens it in the shared in-app
   * viewer (fileViewer.js) rather than a browser new-tab — a bare WebView (Capacitor or
   * Electron) has no "new tab" for window.open() to open into. The data itself may be inline
   * on `photo.file_data` (a legacy record predating the IndexedDB migration) or need fetching
   * by id — blobStore.resolve() handles that dual-path lookup. */
  function openPhotoFullSize(photo) {
    window.PCC.loadingIndicator.show("Opening photo…");
    window.PCC.blobStore
      .resolve(photo.id, photo.file_data)
      .then(function (fileData) {
        window.PCC.loadingIndicator.hide();
        if (!fileData) {
          window.PCC.notify("No image data stored for this photo.", "warning");
          return;
        }
        var commaIdx = fileData.indexOf(",");
        var meta = fileData.slice(0, commaIdx);
        var b64 = fileData.slice(commaIdx + 1);
        var mimeMatch = /data:(.*);base64/.exec(meta);
        var mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
        var binary = atob(b64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var blob = new Blob([bytes], { type: mime });
        var filename = (photo.caption || "photo").replace(/[\\/:*?"<>|]/g, "-") + ".jpg";
        window.PCC.fileViewer.open({ filename: filename, mimeType: mime, blob: blob });
      })
      .catch(function (e) {
        window.PCC.loadingIndicator.hide();
        window.PCC.notify("Could not open this photo: " + e.message, "error");
      });
  }

  function renderPhotosSection(log, onChanged) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "14px";
    wrap.style.paddingTop = "10px";
    wrap.style.borderTop = "1px solid var(--divider)";

    var heading = document.createElement("p");
    heading.className = "detail-item__label";
    heading.style.marginBottom = "8px";
    heading.textContent = "PHOTOS (" + log.photos.length + ")";
    wrap.appendChild(heading);

    if (log.photos.length === 0) {
      var noPhotos = document.createElement("p");
      noPhotos.className = "text-secondary";
      noPhotos.style.fontSize = "13px";
      noPhotos.style.margin = "0 0 8px";
      noPhotos.textContent = "No photos attached yet.";
      wrap.appendChild(noPhotos);
    } else {
      var grid = document.createElement("div");
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(130px, 1fr))";
      grid.style.gap = "10px";
      grid.style.marginBottom = "8px";

      log.photos.forEach(function (photo) {
        var cell = document.createElement("div");
        cell.style.display = "flex";
        cell.style.flexDirection = "column";
        cell.style.gap = "4px";

        var link = document.createElement("a");
        link.href = "#";
        link.title = "Open full size";
        link.onclick = function (e) {
          e.preventDefault();
          openPhotoFullSize(photo);
        };

        // Thumbnail src is resolved async \u2014 inline for a legacy record predating the
        // IndexedDB migration, fetched by id otherwise. A tiny inline placeholder shows
        // until that resolves, since the DOM elements are built synchronously either way.
        var img = document.createElement("img");
        img.alt = photo.caption || photo.filename || "site photo";
        img.style.width = "100%";
        img.style.height = "90px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "4px";
        img.style.border = "1px solid var(--divider)";
        img.style.display = "block";
        img.style.background = "var(--surface-2, #2a2a2a)";
        img.src =
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
        window.PCC.blobStore
          .resolve(photo.id, photo.file_data)
          .then(function (fileData) {
            if (fileData) img.src = fileData;
          })
          .catch(function () {
            /* leave placeholder \u2014 thumbnail just won't load, not fatal */
          });
        link.appendChild(img);
        cell.appendChild(link);

        var captionInput = document.createElement("input");
        captionInput.type = "text";
        captionInput.placeholder = "Caption\u2026";
        captionInput.value = photo.caption || "";
        captionInput.style.fontSize = "12px";
        captionInput.style.padding = "4px 6px";
        captionInput.onchange = function () {
          window.PCC.store.update(function (data) {
            var existingLog = data.daily_logs.find(function (d) {
              return d.id === log.id;
            });
            var existingPhoto = existingLog && existingLog.photos.find(function (p) {
              return p.id === photo.id;
            });
            if (existingPhoto) existingPhoto.caption = captionInput.value;
          });
        };
        cell.appendChild(captionInput);

        var meta = document.createElement("span");
        meta.className = "text-secondary";
        meta.style.fontSize = "11px";
        meta.textContent = formatBytes(photo.file_size);
        cell.appendChild(meta);

        var removeBtn = document.createElement("button");
        removeBtn.className = "btn btn--ghost";
        removeBtn.style.fontSize = "11px";
        removeBtn.style.padding = "2px 8px";
        removeBtn.textContent = "Remove";
        removeBtn.onclick = function () {
          if (!window.confirm("Remove this photo? This can't be undone.")) return;
          window.PCC.store.update(function (data) {
            var existingLog = data.daily_logs.find(function (d) {
              return d.id === log.id;
            });
            if (existingLog) {
              existingLog.photos = existingLog.photos.filter(function (p) {
                return p.id !== photo.id;
              });
              existingLog.updated_at = new Date().toISOString();
            }
          });
          // Best-effort, same pattern as Documents' delete \u2014 the metadata record is
          // already gone either way, so a failed blob delete just leaves an orphaned
          // blob sitting harmlessly in IndexedDB rather than blocking the remove.
          window.PCC.blobStore.deleteBlob(photo.id).catch(function () {});
          onChanged();
        };
        cell.appendChild(removeBtn);

        grid.appendChild(cell);
      });

      wrap.appendChild(grid);
    }

    var addLabel = document.createElement("label");
    addLabel.className = "btn btn--ghost";
    addLabel.style.display = "inline-block";
    addLabel.style.cursor = "pointer";
    addLabel.textContent = "+ Add Photos";

    var addInput = document.createElement("input");
    addInput.type = "file";
    addInput.accept = "image/*";
    addInput.multiple = true;
    addInput.style.display = "none";
    addInput.onchange = function (e) {
      var files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      addLabel.textContent = "Adding\u2026";

      var anyLarge = false;
      var anyFailed = false;

      // Sequential, not parallel: keeps behavior predictable and avoids many concurrent
      // IndexedDB writes plus many concurrent store.update() calls racing each other.
      var chain = files.reduce(function (chainAcc, file) {
        return chainAcc.then(function () {
          return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function () {
              if (file.size > LARGE_PHOTO_WARNING_BYTES) anyLarge = true;
              var photo = window.PCC.store.newDailyLogPhoto({
                filename: file.name,
                file_data: null,
                file_size: file.size,
              });
              // Blob written FIRST, metadata only committed once that succeeds \u2014 same
              // "never orphan a reference" rule as Documents.
              window.PCC.blobStore
                .putBlob(photo.id, reader.result)
                .then(function () {
                  window.PCC.store.update(function (data) {
                    var existingLog = data.daily_logs.find(function (d) {
                      return d.id === log.id;
                    });
                    if (existingLog) {
                      existingLog.photos.push(photo);
                      existingLog.updated_at = new Date().toISOString();
                    }
                  });
                  resolve();
                })
                .catch(function () {
                  anyFailed = true;
                  resolve();
                });
            };
            reader.onerror = function () {
              anyFailed = true;
              window.PCC.notify("Couldn't read \u201c" + file.name + "\u201d.", "error");
              resolve();
            };
            reader.readAsDataURL(file);
          });
        });
      }, Promise.resolve());

      chain.then(function () {
        addLabel.textContent = "+ Add Photos";
        addInput.value = "";
        if (anyFailed) {
          window.PCC.notify("Some photos couldn't be saved. Check available storage and try again.", "error");
        } else if (anyLarge) {
          window.PCC.notify("Photo(s) added. One or more were quite large \u2014 the export file will be bigger accordingly.", "info");
        } else {
          window.PCC.notify(files.length === 1 ? "Photo added." : files.length + " photos added.", "success");
        }
        onChanged();
      });
    };

    addLabel.appendChild(addInput);
    wrap.appendChild(addLabel);

    return wrap;
  }

  /** Gate E (spec point 22 — Daily Site Log integration): a minimal quick-create form
   * for logging a delay directly from today's entry, without navigating to Schedule
   * first. If the log already has a linked activity_id (Gate 10's own single-link
   * field), the delay is created already linked to it (with a real historical snapshot,
   * same as every other creation path); otherwise it's created with no activity at all
   * — correctly surfacing as "Schedule Impact Not Yet Assessed" (spec point 5) rather
   * than guessing a schedule impact that hasn't actually been assessed yet. */
  function renderCreateDelayForm(log, onChanged) {
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "10px";

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    var categoryField = document.createElement("div");
    categoryField.className = "field";
    categoryField.innerHTML = "<label>Delay Category</label>";
    var categorySelect = document.createElement("select");
    categorySelect.id = "dailylogdelay-category";
    window.PCC.store.DELAY_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = DAILY_LOG_DELAY_CATEGORY_LABELS[c] || c;
      categorySelect.appendChild(opt);
    });
    categoryField.appendChild(categorySelect);
    grid.appendChild(categoryField);

    var daysField = document.createElement("div");
    daysField.className = "field";
    daysField.innerHTML = "<label>Estimated Impact (days)</label>";
    var daysInput = document.createElement("input");
    daysInput.type = "number";
    daysInput.id = "dailylogdelay-days";
    daysField.appendChild(daysInput);
    grid.appendChild(daysField);

    form.appendChild(grid);

    var descField = document.createElement("div");
    descField.className = "field";
    descField.innerHTML = "<label>Description *</label>";
    var descInput = document.createElement("textarea");
    descInput.id = "dailylogdelay-description";
    descInput.rows = 2;
    descField.appendChild(descInput);
    form.appendChild(descField);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "10px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = "Log Delay";
    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.creatingDelayForLogId = null;
      onChanged();
    };
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      if (!descInput.value.trim()) {
        errorMsg.textContent = "Description is required.";
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var linkedToActivity = false;
      window.PCC.store.update(function (d) {
        var freshLog = d.daily_logs.find(function (x) { return x.id === log.id; });
        if (!freshLog) return;
        var activity = freshLog.activity_id ? d.activities.find(function (a) { return a.id === freshLog.activity_id; }) : null;
        var created = window.PCC.store.newDelayRecord({
          activity_id: freshLog.activity_id || "",
          project_id: freshLog.project_id,
          daily_log_id: freshLog.id,
          identified_date: freshLog.log_date,
          delay_category: categorySelect.value,
          delay_days: daysInput.value === "" ? null : Number(daysInput.value),
          description: descInput.value.trim(),
        });
        created.status_history = [{ status: "open", changed_at: created.created_at, note: "Delay identified from Daily Log." }];
        d.delay_records.push(created);
        if (activity) {
          linkedToActivity = true;
          d.delay_activity_links.push(
            window.PCC.store.newDelayActivityLink({
              delay_id: created.id,
              activity_id: activity.id,
              project_id: activity.project_id,
              original_planned_start: activity.planned_start || "",
              original_planned_finish: activity.planned_finish || "",
              original_total_float: activity.total_float != null ? activity.total_float : null,
            })
          );
        }
      });
      window.PCC.notify(
        linkedToActivity
          ? "Delay logged and linked to the Schedule activity."
          : "Delay logged — Schedule Impact Not Yet Assessed until an activity is linked (edit the delay from Schedule to add one).",
        "success"
      );
      uiState.creatingDelayForLogId = null;
      onChanged();
    };

    panel.appendChild(form);
    return panel;
  }

  /** Gate E: the delays logged against this entry, plus the "+ Log Delay" quick-create
   * action — same .attention-list/.attention-item primitive the linked-activity
   * cross-reference above already uses, for a consistent look. */
  function renderDailyLogDelaysSection(log, data, onChanged) {
    var wrap = document.createElement("div");
    wrap.style.marginTop = "12px";
    wrap.style.paddingTop = "10px";
    wrap.style.borderTop = "1px solid var(--divider)";

    var delaysForLog = data.delay_records.filter(function (r) {
      return r.daily_log_id === log.id;
    });

    var heading = document.createElement("p");
    heading.className = "detail-item__label";
    heading.style.marginBottom = "8px";
    heading.textContent = "DELAYS (" + delaysForLog.length + ")";
    wrap.appendChild(heading);

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--ghost";
    addBtn.style.marginBottom = "8px";
    addBtn.textContent = "+ Log Delay";
    addBtn.onclick = function () {
      uiState.creatingDelayForLogId = log.id;
      onChanged();
    };
    wrap.appendChild(addBtn);

    if (uiState.creatingDelayForLogId === log.id) {
      wrap.appendChild(renderCreateDelayForm(log, onChanged));
    }

    if (delaysForLog.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-secondary";
      empty.style.fontSize = "13px";
      empty.textContent = "No delays logged against this entry yet.";
      wrap.appendChild(empty);
      return wrap;
    }

    var list = document.createElement("div");
    list.className = "attention-list";
    delaysForLog.forEach(function (r) {
      var row = document.createElement("div");
      var isActive = r.status !== "closed" && r.status !== "recovered";
      row.className = "attention-item" + (r.activity_id ? " attention-item--clickable" : "");
      if (r.activity_id) {
        row.onclick = function () {
          var act = data.activities.find(function (a) { return a.id === r.activity_id; });
          if (act && window.PCC.schedule) window.PCC.schedule.viewActivity(log.project_id, act.schedule_id, act.id);
          window.PCC.router.go("schedule");
        };
      }
      var icon = document.createElement("span");
      icon.className = "attention-item__icon attention-item__icon--" + (isActive ? "warning" : "info");
      row.appendChild(icon);
      var body = document.createElement("div");
      body.className = "attention-item__body";
      var text = document.createElement("div");
      text.className = "attention-item__text";
      text.textContent = r.description || "(untitled delay)";
      body.appendChild(text);
      var meta = document.createElement("div");
      meta.className = "attention-item__meta";
      meta.textContent =
        (DAILY_LOG_DELAY_CATEGORY_LABELS[r.delay_category] || r.delay_category) +
        (r.activity_id ? "" : " · Schedule Impact Not Yet Assessed");
      body.appendChild(meta);
      row.appendChild(body);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderLogDetails(log, onChanged) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";
    var grid = document.createElement("div");
    grid.className = "detail-grid";

    DETAIL_FIELDS.forEach(function (cfg) {
      var value = log[cfg.key] && log[cfg.key].trim() ? log[cfg.key] : "\u2014";
      var item = document.createElement("div");
      if (cfg.type === "textarea") item.style.gridColumn = "1 / -1";
      item.innerHTML =
        "<span class='detail-item__label'>" + cfg.label.toUpperCase() + "</span><span class='detail-item__value'>" + value + "</span>";
      grid.appendChild(item);
    });

    wrap.appendChild(grid);

    if (log.activity_id) {
      var linkedActivity = window.PCC.store.get().activities.find(function (a) {
        return a.id === log.activity_id;
      });
      if (linkedActivity) {
        // Redesign Gate 10 (Module Consistency Pass): retrofitted onto the same
        // .attention-list/.attention-item primitive every other panel-turned-list in
        // this app now uses — "info" icon color since this is a plain cross-reference,
        // not a severity alert. Whole row is the click target now, replacing the
        // separate "View in Gantt" ghost button.
        var activityList = document.createElement("div");
        activityList.className = "attention-list";
        activityList.style.marginTop = "12px";
        activityList.style.paddingTop = "10px";
        activityList.style.borderTop = "1px solid var(--divider)";

        var activityRow = document.createElement("div");
        activityRow.className = "attention-item attention-item--clickable";
        activityRow.onclick = function () {
          if (window.PCC.schedule) window.PCC.schedule.viewActivity(log.project_id, linkedActivity.schedule_id, linkedActivity.id);
          window.PCC.router.go("schedule");
        };

        var activityIcon = document.createElement("span");
        activityIcon.className = "attention-item__icon attention-item__icon--info";
        activityRow.appendChild(activityIcon);

        var activityBody = document.createElement("div");
        activityBody.className = "attention-item__body";
        var activityText = document.createElement("div");
        activityText.className = "attention-item__text";
        activityText.textContent = linkedActivity.name;
        activityBody.appendChild(activityText);
        var activityMeta = document.createElement("div");
        activityMeta.className = "attention-item__meta";
        activityMeta.textContent = "LINKED ACTIVITY";
        activityBody.appendChild(activityMeta);
        activityRow.appendChild(activityBody);

        activityList.appendChild(activityRow);
        wrap.appendChild(activityList);
      }
    }

    wrap.appendChild(renderDailyLogDelaysSection(log, window.PCC.store.get(), onChanged));
    wrap.appendChild(renderPhotosSection(log, onChanged));
    return wrap;
  }

  function renderLogEntry(log, projects, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderLogCard(log, projects, onChanged));
    if (uiState.expandedId === log.id) {
      entry.appendChild(renderLogDetails(log, onChanged));
    }
    return entry;
  }

  function render(outlet) {
    function rerender() {
      outlet.innerHTML = "";
      render(outlet);
    }

    var data = window.PCC.store.get();
    var projects = data.projects;

    // Redesign Gate 6 (Global Project Context): see risks.js's own comment on this
    // exact pattern.
    if (!uiState.projectFilterInitialized) {
      uiState.projectFilterInitialized = true;
      var ctxProjectId = window.PCC.projectContext.get();
      if (ctxProjectId && projects.some(function (p) { return p.id === ctxProjectId; })) {
        uiState.projectFilter = ctxProjectId;
      }
    }

    var h1 = document.createElement("h2");
    h1.textContent = "Daily Log";
    h1.style.marginBottom = "4px";
    outlet.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "16px";
    sub.textContent = "Weather, manpower, equipment, visitors, deliveries, activities, safety, and incidents \u2014 one entry per project per day. Open an entry's Details to attach photos.";
    outlet.appendChild(sub);

    if (uiState.editingId) {
      var logBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newDailyLog(uiState.pendingPrefill || {})
          : data.daily_logs.find(function (d) {
              return d.id === uiState.editingId;
            });
      if (uiState.editingId === "new") uiState.pendingPrefill = null;
      renderForm(outlet, logBeingEdited, projects, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search activities, notes, weather\u2026";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      renderList();
    };

    var projSelect = document.createElement("select");
    var allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All projects";
    projSelect.appendChild(allOpt);
    projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projSelect.appendChild(opt);
    });
    projSelect.value = uiState.projectFilter;
    projSelect.onchange = function () {
      uiState.projectFilter = projSelect.value;
      if (uiState.projectFilter) window.PCC.projectContext.set(uiState.projectFilter);
      renderList();
    };

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Daily Log";
    addBtn.disabled = projects.length === 0;
    addBtn.title = projects.length === 0 ? "Add a project in Portfolio first" : "";
    addBtn.onclick = function () {
      uiState.editingId = "new";
      rerender();
    };

    toolbar.appendChild(searchInput);
    toolbar.appendChild(projSelect);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.daily_logs.filter(function (log) {
        return logMatchesFilters(log, projects);
      });
      filtered.sort(function (a, b) {
        return b.log_date.localeCompare(a.log_date) || new Date(b.created_at) - new Date(a.created_at);
      });

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.daily_logs.length === 0
            ? projects.length === 0
              ? "Add a project in Portfolio first, then start logging daily site activity here."
              : "No daily logs yet. Click \u201c+ Add Daily Log\u201d to start."
            : "No logs match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (log) {
        list.appendChild(renderLogEntry(log, projects, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.dailylog = render;
  window.PCC.dailyLog = {
    filterByProject: function (projectId) {
      uiState.projectFilter = projectId;
      uiState.projectFilterInitialized = true;
      uiState.search = "";
      window.PCC.projectContext.set(projectId);
    },
    expandLog: function (logId) {
      uiState.expandedId = logId;
    },
  };
})();
