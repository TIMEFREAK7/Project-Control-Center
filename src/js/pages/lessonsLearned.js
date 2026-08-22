/* Lessons Learned (PCC Evolution Roadmap, Tier 3 — deferred since the original locked
 * build order, taken up now that Tiers 1/2 and the "PCC Evolution Roadmap" Tiers A-F
 * are all in daily use). Aditya confirmed via AskUserQuestion: skip the tier's two
 * AI-dependent items (AI Document Processing, AI Project Assistant) entirely — they
 * fundamentally conflict with this app's zero-dependency/offline/file:// architecture,
 * and the original spec itself excluded AI ("do not implement AI, OCR, document
 * parsing"). This is Tier 3's first gate.
 *
 * Same project-scoped register shape as Risk/RFI/Decisions (decisionRegister.js is the
 * direct template) — full CRUD, optional Schedule activity link and source_meeting_id
 * link, own top-level sidebar page rather than a tab buried in Executive Center. A
 * single portfolio-wide filterable list already gives the cross-project trend view a
 * Lessons Learned register is actually for ("we keep seeing procurement delays") — no
 * separate rollup dashboard needed on top of it, same reasoning Decision Register's own
 * page already settled.
 *
 * Deliberately captures BOTH directions via `impact_type` (positive/negative) — "what
 * worked, keep doing it" is just as valuable as "what went wrong, avoid it next time."
 * No `status` field: this is a captured log, not a workflow with states, same "log
 * only" precedent Change Management already established.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var CATEGORY_LABELS = {
    schedule: "Schedule",
    cost: "Cost",
    quality: "Quality",
    safety: "Safety",
    procurement_vendor: "Procurement & Vendor",
    design_technical: "Design & Technical",
    communication: "Communication",
    other: "Other",
  };
  var IMPACT_LABELS = { positive: "Positive", negative: "Negative" };

  var FIELD_CONFIG = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "category", label: "Category", type: "select", options: "LESSON_LEARNED_CATEGORIES", labels: CATEGORY_LABELS },
    { key: "impact_type", label: "Impact", type: "select", options: "LESSON_LEARNED_IMPACT_TYPES", labels: IMPACT_LABELS },
    { key: "date_identified", label: "Date Identified", type: "date" },
    { key: "identified_by", label: "Identified By", type: "text" },
    { key: "description", label: "What Happened", type: "textarea" },
    { key: "recommendation", label: "Recommendation", type: "textarea" },
  ];

  var uiState = {
    search: "",
    categoryFilter: "",
    impactFilter: "",
    projectFilter: "",
    // Redesign Gate 6 (Global Project Context): see risks.js's own uiState comment.
    projectFilterInitialized: false,
    editingId: null,
    expandedId: null,
    pendingPrefill: null, // { project_id, source_meeting_id } set by createFromMeeting()
  };

  function projectName(projects, projectId) {
    if (!projectId) return "Unassigned";
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "Unassigned";
  }

  function buildField(cfg, lesson) {
    var field = document.createElement("div");
    field.className = "field";
    if (cfg.type === "textarea") field.style.gridColumn = "1 / -1";

    var label = document.createElement("label");
    label.textContent = cfg.label + (cfg.required ? " *" : "");
    label.setAttribute("for", "lsnfield-" + cfg.key);
    field.appendChild(label);

    var input;
    if (cfg.type === "select") {
      input = document.createElement("select");
      window.PCC.store[cfg.options].forEach(function (val) {
        var opt = document.createElement("option");
        opt.value = val;
        opt.textContent = cfg.labels[val] || val;
        input.appendChild(opt);
      });
      input.value = lesson[cfg.key] || "";
    } else if (cfg.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
      input.value = lesson[cfg.key] || "";
    } else {
      input = document.createElement("input");
      input.type = cfg.type;
      input.value = lesson[cfg.key] || "";
    }
    input.id = "lsnfield-" + cfg.key;
    input.name = cfg.key;
    if (cfg.required) input.required = true;

    field.appendChild(input);
    return field;
  }

  /** Gate 10 pattern, duplicated from decisionRegister.js/risks.js/rfis.js per this
   * codebase's existing per-module-helpers convention. */
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

  function readFormValues(formEl) {
    var values = {};
    FIELD_CONFIG.forEach(function (cfg) {
      var el = formEl.querySelector("#lsnfield-" + cfg.key);
      if (el) values[cfg.key] = el.value;
    });
    return values;
  }

  function renderForm(container, lesson, projects, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Lesson Learned" : "Edit Lesson Learned";
    panel.appendChild(heading);

    if (lesson.source_meeting_id) {
      var sourceMeeting = window.PCC.store.get().meetings.find(function (m) {
        return m.id === lesson.source_meeting_id;
      });
      if (sourceMeeting) {
        var linkNote = document.createElement("p");
        linkNote.className = "text-secondary";
        linkNote.style.fontSize = "12px";
        linkNote.style.marginTop = "-8px";
        linkNote.style.marginBottom = "14px";
        linkNote.textContent = "Linked to meeting: “" + sourceMeeting.title + "” (" + sourceMeeting.meeting_date + ")";
        panel.appendChild(linkNote);
      }
    }

    var form = document.createElement("form");

    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project *</label>";
    var projSelect = document.createElement("select");
    projSelect.id = "lsnfield-project_id";
    var activeProjects = projects.filter(function (p) {
      return !p.archived;
    });
    if (activeProjects.length === 0) {
      var noProjOpt = document.createElement("option");
      noProjOpt.value = "";
      noProjOpt.textContent = "No projects yet — add one in Portfolio first";
      projSelect.appendChild(noProjOpt);
      projSelect.disabled = true;
    } else {
      activeProjects.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "(unnamed project)";
        projSelect.appendChild(opt);
      });
      projSelect.value = lesson.project_id || activeProjects[0].id;
    }
    projField.appendChild(projSelect);
    form.appendChild(projField);

    var activityField = document.createElement("div");
    activityField.className = "field";
    activityField.innerHTML = "<label>Linked Activity (optional)</label>";
    var activitySelect = document.createElement("select");
    activitySelect.id = "lsnfield-activity_id";
    activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, lesson.activity_id);
    activityField.appendChild(activitySelect);
    form.appendChild(activityField);
    projSelect.onchange = function () {
      activityOptionsFor(activitySelect, window.PCC.store.get(), projSelect.value, "");
    };

    var grid = document.createElement("div");
    grid.className = "form-grid";
    FIELD_CONFIG.forEach(function (cfg) {
      grid.appendChild(buildField(cfg, lesson));
    });
    form.appendChild(grid);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Title and Project are required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = isNew ? "Add Lesson Learned" : "Save Changes";
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
      values.activity_id = activitySelect.value;
      if (isNew) values.source_meeting_id = lesson.source_meeting_id || "";
      if (!values.title || !values.title.trim() || !values.project_id) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      window.PCC.store.update(function (data) {
        if (isNew) {
          data.lessons_learned.push(window.PCC.store.newLessonLearned(values));
        } else {
          var existing = data.lessons_learned.find(function (l) {
            return l.id === lesson.id;
          });
          if (existing) {
            Object.assign(existing, values);
            existing.updated_at = new Date().toISOString();
          }
        }
      });

      window.PCC.notify(isNew ? "Lesson Learned added." : "Lesson Learned updated.", "success");
      uiState.editingId = null;
      onSaved();
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  function lessonMatchesFilters(l) {
    if (uiState.categoryFilter && l.category !== uiState.categoryFilter) return false;
    if (uiState.impactFilter && l.impact_type !== uiState.impactFilter) return false;
    if (uiState.projectFilter && l.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var haystack = (l.title + " " + l.description + " " + l.recommendation + " " + l.identified_by).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderLessonCard(l, projects, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card";

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'>" +
      (l.title || "(untitled)") +
      "</div><div class='project-card__meta'>" +
      projectName(projects, l.project_id) + " · " + CATEGORY_LABELS[l.category] +
      (l.identified_by ? " · " + l.identified_by : "") + (l.date_identified ? " · " + l.date_identified : "") +
      "</div>";

    var impactBadge = document.createElement("span");
    impactBadge.className = "status-badge status-badge--" + (l.impact_type === "positive" ? "on_track" : "critical");
    impactBadge.textContent = IMPACT_LABELS[l.impact_type];

    var badgeWrap = document.createElement("div");
    badgeWrap.style.display = "flex";
    badgeWrap.style.gap = "6px";
    badgeWrap.appendChild(impactBadge);

    var actions = document.createElement("div");
    actions.className = "project-card__actions";

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === l.id ? "Hide" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === l.id ? null : l.id;
      onChanged();
    };

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingId = l.id;
      onChanged();
    };

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      if (!window.confirm("Delete this lesson learned? This can't be undone.")) return;
      window.PCC.store.update(function (data) {
        data.lessons_learned = data.lessons_learned.filter(function (item) {
          return item.id !== l.id;
        });
      });
      window.PCC.notify("Lesson Learned deleted.", "info");
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

  function renderLessonDetails(l) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";
    var grid = document.createElement("div");
    grid.className = "detail-grid";

    var fields = [
      { label: "CATEGORY", value: CATEGORY_LABELS[l.category] },
      { label: "IMPACT", value: IMPACT_LABELS[l.impact_type] },
      { label: "DATE IDENTIFIED", value: l.date_identified || "—" },
      { label: "IDENTIFIED BY", value: l.identified_by || "—" },
      { label: "WHAT HAPPENED", value: l.description || "—", wide: true },
      { label: "RECOMMENDATION", value: l.recommendation || "—", wide: true },
    ];

    fields.forEach(function (f) {
      var item = document.createElement("div");
      if (f.wide) item.style.gridColumn = "1 / -1";
      item.innerHTML = "<span class='detail-item__label'>" + f.label + "</span><span class='detail-item__value'>" + f.value + "</span>";
      grid.appendChild(item);
    });

    wrap.appendChild(grid);

    if (l.source_meeting_id) {
      var sourceMeeting = window.PCC.store.get().meetings.find(function (m) {
        return m.id === l.source_meeting_id;
      });
      if (sourceMeeting) {
        var sourceRow = document.createElement("div");
        sourceRow.style.marginTop = "12px";
        sourceRow.style.paddingTop = "10px";
        sourceRow.style.borderTop = "1px solid var(--divider)";
        sourceRow.style.display = "flex";
        sourceRow.style.justifyContent = "space-between";
        sourceRow.style.alignItems = "center";
        sourceRow.style.fontSize = "13px";

        var sourceLabel = document.createElement("span");
        sourceLabel.innerHTML = "<span class='detail-item__label'>RAISED IN MEETING</span>" + sourceMeeting.title + " (" + sourceMeeting.meeting_date + ")";

        var viewMeetingBtn = document.createElement("button");
        viewMeetingBtn.className = "btn btn--ghost";
        viewMeetingBtn.textContent = "View Meeting";
        viewMeetingBtn.onclick = function () {
          if (window.PCC.meetings) window.PCC.meetings.expandMeeting(sourceMeeting.id);
          window.PCC.router.go("meetings");
        };

        sourceRow.appendChild(sourceLabel);
        sourceRow.appendChild(viewMeetingBtn);
        wrap.appendChild(sourceRow);
      }
    }

    if (l.activity_id) {
      var linkedActivity = window.PCC.store.get().activities.find(function (a) {
        return a.id === l.activity_id;
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
          if (window.PCC.schedule) window.PCC.schedule.viewActivity(l.project_id, linkedActivity.schedule_id, linkedActivity.id);
          window.PCC.router.go("schedule");
        };

        activityRow.appendChild(activityLabel);
        activityRow.appendChild(viewActivityBtn);
        wrap.appendChild(activityRow);
      }
    }

    return wrap;
  }

  function renderLessonEntry(l, projects, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderLessonCard(l, projects, onChanged));
    if (uiState.expandedId === l.id) entry.appendChild(renderLessonDetails(l));
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
    h1.textContent = "Lessons Learned";
    h1.style.marginBottom = "16px";
    outlet.appendChild(h1);

    if (uiState.editingId) {
      var lessonBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newLessonLearned(uiState.pendingPrefill || {})
          : data.lessons_learned.find(function (l) {
              return l.id === uiState.editingId;
            });
      if (uiState.editingId === "new") uiState.pendingPrefill = null;
      renderForm(outlet, lessonBeingEdited, projects, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search title, what happened, recommendation, identified by…";
    searchInput.value = uiState.search;
    searchInput.oninput = function () {
      uiState.search = searchInput.value;
      renderList();
    };

    var categorySelect = document.createElement("select");
    var allCategoryOpt = document.createElement("option");
    allCategoryOpt.value = "";
    allCategoryOpt.textContent = "All categories";
    categorySelect.appendChild(allCategoryOpt);
    window.PCC.store.LESSON_LEARNED_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CATEGORY_LABELS[c];
      categorySelect.appendChild(opt);
    });
    categorySelect.value = uiState.categoryFilter;
    categorySelect.onchange = function () {
      uiState.categoryFilter = categorySelect.value;
      renderList();
    };

    var impactSelect = document.createElement("select");
    var allImpactOpt = document.createElement("option");
    allImpactOpt.value = "";
    allImpactOpt.textContent = "All impact";
    impactSelect.appendChild(allImpactOpt);
    window.PCC.store.LESSON_LEARNED_IMPACT_TYPES.forEach(function (i) {
      var opt = document.createElement("option");
      opt.value = i;
      opt.textContent = IMPACT_LABELS[i];
      impactSelect.appendChild(opt);
    });
    impactSelect.value = uiState.impactFilter;
    impactSelect.onchange = function () {
      uiState.impactFilter = impactSelect.value;
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
      if (uiState.projectFilter) window.PCC.projectContext.set(uiState.projectFilter);
      renderList();
    };

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Lesson Learned";
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
    toolbar.appendChild(categorySelect);
    toolbar.appendChild(impactSelect);
    toolbar.appendChild(projSelectFilter);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.lessons_learned.filter(lessonMatchesFilters);

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.lessons_learned.length === 0
            ? projects.filter(function (p) { return !p.archived; }).length === 0
              ? "Add a project in Portfolio first, then log lessons learned against it."
              : "No lessons learned logged yet. Click “+ Add Lesson Learned” to log your first one."
            : "No lessons learned match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (l) {
        list.appendChild(renderLessonEntry(l, projects, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.lessonsLearned = render;
  window.PCC.lessonsLearned = {
    filterByProject: function (projectId) {
      uiState.projectFilter = projectId;
      uiState.projectFilterInitialized = true;
      uiState.categoryFilter = "";
      uiState.impactFilter = "";
      uiState.search = "";
      window.PCC.projectContext.set(projectId);
    },
    createFromMeeting: function (projectId, meetingId) {
      uiState.pendingPrefill = { project_id: projectId, source_meeting_id: meetingId };
      uiState.editingId = "new";
    },
    expandLesson: function (lessonId) {
      uiState.expandedId = lessonId;
    },
  };
})();
