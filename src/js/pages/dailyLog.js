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
    editingId: null, // null = closed, "new" = creating, otherwise an existing log id
    expandedId: null,
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
    errorMsg.textContent = "Project and Date are required.";
    form.appendChild(errorMsg);

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
        errorMsg.style.display = "block";
        return;
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
    actions.appendChild(deleteBtn);

    card.appendChild(main);
    card.appendChild(badgeWrap);
    card.appendChild(actions);
    return card;
  }

  var DETAIL_FIELDS = FIELD_CONFIG.filter(function (f) {
    return f.key !== "log_date";
  });

  /** Converts a stored base64 data URI back into a Blob and opens it via a blob: URL.
   * Deliberately NOT a raw <a href="data:..."> — Chrome (especially on Android) blocks
   * top-level navigation to data: URIs as a security measure, which is exactly the
   * "about:blank#blocked" failure this replaces. Same pattern documents.js uses for
   * "Open File". The data itself may be inline on `photo.file_data` (a legacy record
   * predating the IndexedDB migration) or need fetching by id — blobStore.resolve()
   * handles that dual-path lookup. */
  function openPhotoFullSize(photo) {
    window.PCC.blobStore
      .resolve(photo.id, photo.file_data)
      .then(function (fileData) {
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
        var url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        window.setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 30000);
      })
      .catch(function (e) {
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
        var activityRow = document.createElement("div");
        activityRow.style.marginTop = "12px";
        activityRow.style.paddingTop = "10px";
        activityRow.style.borderTop = "1px solid var(--divider)";
        activityRow.style.display = "flex";
        activityRow.style.justifyContent = "space-between";
        activityRow.style.alignItems = "center";
        activityRow.style.fontSize = "13px";

        var activityLabel = document.createElement("span");
        activityLabel.innerHTML = "<span class='detail-item__label'>LINKED ACTIVITY</span>" + linkedActivity.name;

        var viewActivityBtn = document.createElement("button");
        viewActivityBtn.className = "btn btn--ghost";
        viewActivityBtn.textContent = "View in Gantt";
        viewActivityBtn.onclick = function () {
          if (window.PCC.schedule) window.PCC.schedule.viewActivity(log.project_id, linkedActivity.schedule_id, linkedActivity.id);
          window.PCC.router.go("schedule");
        };

        activityRow.appendChild(activityLabel);
        activityRow.appendChild(viewActivityBtn);
        wrap.appendChild(activityRow);
      }
    }

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
          ? window.PCC.store.newDailyLog()
          : data.daily_logs.find(function (d) {
              return d.id === uiState.editingId;
            });
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
      uiState.search = "";
    },
    expandLog: function (logId) {
      uiState.expandedId = logId;
    },
  };
})();
