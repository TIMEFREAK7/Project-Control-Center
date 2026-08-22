/* Knowledge Base (PCC Evolution Roadmap, Tier 3 — the tier's second gate, after Lessons
 * Learned). Reusable reference material: standard procedures, checklists/templates,
 * reference material, how-to guides, policies — confirmed via AskUserQuestion to be
 * PORTFOLIO-WIDE (optional project_id), not mandatory-project like every other register,
 * since a standard procedure isn't "for" any one project the way a Risk or RFI is. Same
 * disclosed exception newVendorDocument() already established for the same reason. Also
 * confirmed: articles carry their OWN file attachment (not just a link to an existing
 * Document) — blob lives in blobStore (IndexedDB) keyed by the article's own id, same
 * "blobs-only IndexedDB, everything else in the main store" split every other file this
 * app stores already follows. One file per article, no revision history — re-attaching a
 * file overwrites the previous blob under the same id.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  var CATEGORY_LABELS = {
    standard_procedure: "Standard Procedure",
    checklist_template: "Checklist / Template",
    reference_material: "Reference Material",
    how_to_guide: "How-To Guide",
    policy: "Policy",
    other: "Other",
  };

  var uiState = {
    search: "",
    categoryFilter: "",
    projectFilter: "",
    // Redesign Gate 6 (Global Project Context): see risks.js's own uiState comment.
    projectFilterInitialized: false,
    editingId: null,
    expandedId: null,
    pendingFile: null, // { name, size, type, dataUri } set by handleFileSelected()
    removeExistingFile: false,
    readError: null,
    saving: false,
  };

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s === null || s === undefined ? "" : String(s);
    return div.innerHTML;
  }

  function fmtSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function projectName(projects, projectId) {
    if (!projectId) return "General (no project)";
    var p = projects.find(function (proj) {
      return proj.id === projectId;
    });
    return p ? p.name || "(unnamed project)" : "General (no project)";
  }

  function resetFormState() {
    uiState.pendingFile = null;
    uiState.removeExistingFile = false;
    uiState.readError = null;
    uiState.saving = false;
  }

  function handleFileSelected(file, rerender) {
    uiState.readError = null;
    var reader = new FileReader();
    reader.onerror = function () {
      uiState.readError = "Could not read that file.";
      rerender();
    };
    reader.onload = function () {
      uiState.pendingFile = { name: file.name, size: file.size, type: file.type || "application/octet-stream", dataUri: reader.result };
      uiState.removeExistingFile = false;
      rerender();
    };
    reader.readAsDataURL(file);
  }

  /** Generic "open any stored file" — same Blob + object URL pattern
   * documents.js's openStoredFile() uses, without that module's extraction/duplicate-
   * detection baggage this gate has no need for. blobStore.resolve()'s dual-path lookup
   * isn't needed either — this register postdates the blobs-only migration, so its blob
   * is always in IndexedDB, never inline. */
  function openArticleFile(article) {
    window.PCC.blobStore
      .getBlob(article.id)
      .then(function (fileData) {
        if (!fileData) {
          window.PCC.notify("No file stored for this article.", "warning");
          return;
        }
        var commaIdx = fileData.indexOf(",");
        var meta = fileData.slice(0, commaIdx);
        var b64 = fileData.slice(commaIdx + 1);
        var mimeMatch = /data:(.*);base64/.exec(meta);
        var mime = mimeMatch ? mimeMatch[1] : article.mime_type || "application/octet-stream";
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
        window.PCC.notify("Could not open this file: " + e.message, "error");
      });
  }

  function renderForm(container, article, projects, onSaved) {
    var isNew = uiState.editingId === "new";
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.style.marginBottom = "16px";

    var heading = document.createElement("h3");
    heading.style.marginBottom = "14px";
    heading.textContent = isNew ? "Add Article" : "Edit Article";
    panel.appendChild(heading);

    var form = document.createElement("form");
    var grid = document.createElement("div");
    grid.className = "form-grid";

    var titleField = document.createElement("div");
    titleField.className = "field";
    titleField.innerHTML = "<label>Title *</label>";
    var titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.id = "kbfield-title";
    titleInput.value = article.title || "";
    titleField.appendChild(titleInput);
    grid.appendChild(titleField);

    var categoryField = document.createElement("div");
    categoryField.className = "field";
    categoryField.innerHTML = "<label>Category</label>";
    var categorySelect = document.createElement("select");
    categorySelect.id = "kbfield-category";
    window.PCC.store.KNOWLEDGE_BASE_CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CATEGORY_LABELS[c];
      categorySelect.appendChild(opt);
    });
    categorySelect.value = article.category || "other";
    categoryField.appendChild(categorySelect);
    grid.appendChild(categoryField);

    var projField = document.createElement("div");
    projField.className = "field";
    projField.innerHTML = "<label>Project (optional)</label>";
    var projSelect = document.createElement("select");
    projSelect.id = "kbfield-project_id";
    var generalOpt = document.createElement("option");
    generalOpt.value = "";
    generalOpt.textContent = "General (no project)";
    projSelect.appendChild(generalOpt);
    projects
      .filter(function (p) { return !p.archived; })
      .forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "(unnamed project)";
        projSelect.appendChild(opt);
      });
    projSelect.value = article.project_id || "";
    projField.appendChild(projSelect);
    grid.appendChild(projField);

    var tagsField = document.createElement("div");
    tagsField.className = "field";
    tagsField.innerHTML = "<label>Tags (comma-separated)</label>";
    var tagsInput = document.createElement("input");
    tagsInput.type = "text";
    tagsInput.id = "kbfield-tags";
    tagsInput.value = article.tags || "";
    tagsField.appendChild(tagsInput);
    grid.appendChild(tagsField);

    form.appendChild(grid);

    var bodyField = document.createElement("div");
    bodyField.className = "field";
    bodyField.style.marginTop = "8px";
    bodyField.innerHTML = "<label>Body</label>";
    var bodyArea = document.createElement("textarea");
    bodyArea.id = "kbfield-body";
    bodyArea.rows = 6;
    bodyArea.value = article.body || "";
    bodyField.appendChild(bodyArea);
    form.appendChild(bodyField);

    var fileField = document.createElement("div");
    fileField.className = "field";
    fileField.style.marginTop = "8px";
    fileField.innerHTML = "<label>Attached File (optional)</label>";

    if (article.filename && !uiState.removeExistingFile && !uiState.pendingFile) {
      var existingNote = document.createElement("p");
      existingNote.style.fontSize = "13px";
      existingNote.style.margin = "4px 0";
      existingNote.textContent = "Currently attached: " + article.filename + (article.file_size ? " (" + fmtSize(article.file_size) + ")" : "");
      fileField.appendChild(existingNote);

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn--ghost";
      removeBtn.textContent = "Remove Attached File";
      removeBtn.style.marginBottom = "6px";
      removeBtn.onclick = function () {
        uiState.removeExistingFile = true;
        onSaved();
      };
      fileField.appendChild(removeBtn);
    }

    if (uiState.pendingFile) {
      var pendingNote = document.createElement("p");
      pendingNote.style.fontSize = "13px";
      pendingNote.style.margin = "4px 0";
      pendingNote.textContent = "Selected: " + uiState.pendingFile.name + " (" + fmtSize(uiState.pendingFile.size) + ")";
      fileField.appendChild(pendingNote);
    }

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = "kbfield-file";
    fileInput.onchange = function () {
      if (fileInput.files && fileInput.files[0]) handleFileSelected(fileInput.files[0], onSaved);
    };
    fileField.appendChild(fileInput);

    if (uiState.readError) {
      var readErrorP = document.createElement("p");
      readErrorP.style.color = "var(--status-critical)";
      readErrorP.style.fontSize = "13px";
      readErrorP.textContent = uiState.readError;
      fileField.appendChild(readErrorP);
    }

    form.appendChild(fileField);

    var errorMsg = document.createElement("p");
    errorMsg.style.color = "var(--status-critical)";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.display = "none";
    errorMsg.textContent = "Title is required.";
    form.appendChild(errorMsg);

    var actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.marginTop = "12px";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn--primary";
    saveBtn.textContent = uiState.saving ? "Saving…" : isNew ? "Add Article" : "Save Changes";
    saveBtn.disabled = uiState.saving;

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = function () {
      uiState.editingId = null;
      resetFormState();
      onSaved();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var title = titleInput.value.trim();
      if (!title) {
        errorMsg.style.display = "block";
        return;
      }
      errorMsg.style.display = "none";

      var values = {
        title: title,
        category: categorySelect.value,
        project_id: projSelect.value,
        tags: tagsInput.value,
        body: bodyArea.value,
      };

      // Build the full record up front (for a new article, this mints its real id once)
      // so the SAME id is used both for the blob key below and the record pushed to the
      // store in commit() — never two independently-generated ids for one article.
      var record = isNew ? window.PCC.store.newKnowledgeBaseArticle(values) : null;
      var recordId = isNew ? record.id : article.id;

      uiState.saving = true;
      onSaved();

      function commit() {
        window.PCC.store.update(function (data) {
          if (isNew) {
            if (uiState.pendingFile) {
              record.filename = uiState.pendingFile.name;
              record.file_size = uiState.pendingFile.size;
              record.mime_type = uiState.pendingFile.type;
            }
            data.knowledge_base_articles.push(record);
          } else {
            var existing = data.knowledge_base_articles.find(function (a) {
              return a.id === article.id;
            });
            if (existing) {
              Object.assign(existing, values);
              if (uiState.pendingFile) {
                existing.filename = uiState.pendingFile.name;
                existing.file_size = uiState.pendingFile.size;
                existing.mime_type = uiState.pendingFile.type;
              } else if (uiState.removeExistingFile) {
                existing.filename = "";
                existing.file_size = 0;
                existing.mime_type = "";
              }
              existing.updated_at = new Date().toISOString();
            }
          }
        });
        window.PCC.notify(isNew ? "Article added." : "Article updated.", "success");
        uiState.editingId = null;
        resetFormState();
        onSaved();
      }

      // Blob written FIRST, metadata only committed once that succeeds — same "never
      // orphan a reference" rule dailyLog.js's photo upload already established.
      if (uiState.pendingFile) {
        window.PCC.blobStore
          .putBlob(recordId, uiState.pendingFile.dataUri)
          .then(commit)
          .catch(function (e) {
            uiState.saving = false;
            window.PCC.notify("Could not save the attached file: " + e.message, "error");
            onSaved();
          });
      } else if (uiState.removeExistingFile && !isNew) {
        window.PCC.blobStore
          .deleteBlob(article.id)
          .then(commit)
          .catch(function (e) {
            uiState.saving = false;
            window.PCC.notify("Could not remove the attached file: " + e.message, "error");
            onSaved();
          });
      } else {
        commit();
      }
    };

    panel.appendChild(form);
    container.appendChild(panel);
  }

  // "__general__" is a synthetic filter value (not a real project id) meaning "articles
  // with no project tag at all" — distinct from "" (no filter applied).
  function articleMatchesFilters(a) {
    if (uiState.categoryFilter && a.category !== uiState.categoryFilter) return false;
    if (uiState.projectFilter === "__general__" && a.project_id) return false;
    if (uiState.projectFilter && uiState.projectFilter !== "__general__" && a.project_id !== uiState.projectFilter) return false;
    if (uiState.search) {
      var haystack = (a.title + " " + a.body + " " + a.tags).toLowerCase();
      if (haystack.indexOf(uiState.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function renderArticleCard(a, projects, onChanged) {
    var card = document.createElement("div");
    card.className = "project-card";

    var main = document.createElement("div");
    main.className = "project-card__main";
    main.innerHTML =
      "<div class='project-card__name'>" +
      esc(a.title || "(untitled)") +
      "</div><div class='project-card__meta'>" +
      esc(CATEGORY_LABELS[a.category]) + " · " + esc(projectName(projects, a.project_id)) +
      (a.tags ? " · " + esc(a.tags) : "") +
      "</div>";

    var badgeWrap = document.createElement("div");
    if (a.filename) {
      var fileBadge = document.createElement("span");
      fileBadge.className = "status-badge status-badge--info";
      fileBadge.textContent = "File Attached";
      badgeWrap.appendChild(fileBadge);
    }

    var actions = document.createElement("div");
    actions.className = "project-card__actions";

    var detailsBtn = document.createElement("button");
    detailsBtn.className = "btn btn--ghost";
    detailsBtn.textContent = uiState.expandedId === a.id ? "Hide" : "Details";
    detailsBtn.onclick = function () {
      uiState.expandedId = uiState.expandedId === a.id ? null : a.id;
      onChanged();
    };

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn--ghost";
    editBtn.textContent = "Edit";
    editBtn.onclick = function () {
      uiState.editingId = a.id;
      resetFormState();
      onChanged();
    };

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = function () {
      if (!window.confirm("Delete this article? This can't be undone.")) return;
      window.PCC.blobStore.deleteBlob(a.id).finally(function () {
        window.PCC.store.update(function (data) {
          data.knowledge_base_articles = data.knowledge_base_articles.filter(function (item) {
            return item.id !== a.id;
          });
        });
        window.PCC.notify("Article deleted.", "info");
        onChanged();
      });
    };

    actions.appendChild(detailsBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(main);
    card.appendChild(badgeWrap);
    card.appendChild(actions);
    return card;
  }

  function renderArticleDetails(a) {
    var wrap = document.createElement("div");
    wrap.className = "project-details";
    var grid = document.createElement("div");
    grid.className = "detail-grid";

    var fields = [
      { label: "CATEGORY", value: esc(CATEGORY_LABELS[a.category]) },
      { label: "TAGS", value: esc(a.tags) || "—" },
      { label: "BODY", value: a.body ? esc(a.body).replace(/\n/g, "<br/>") : "—", wide: true },
    ];

    fields.forEach(function (f) {
      var item = document.createElement("div");
      if (f.wide) item.style.gridColumn = "1 / -1";
      item.innerHTML = "<span class='detail-item__label'>" + f.label + "</span><span class='detail-item__value'>" + f.value + "</span>";
      grid.appendChild(item);
    });

    wrap.appendChild(grid);

    if (a.filename) {
      // Redesign Gate 10 (Module Consistency Pass): retrofitted onto the same
      // .attention-list/.attention-item primitive every other panel-turned-list in this
      // app now uses — "info" icon color since this is a plain file reference, not a
      // severity alert. Whole row is the click target now, replacing the separate
      // "Open File" ghost button.
      var fileWrap = document.createElement("div");
      fileWrap.style.marginTop = "12px";
      fileWrap.style.paddingTop = "10px";
      fileWrap.style.borderTop = "1px solid var(--divider)";
      var fileList = document.createElement("div");
      fileList.className = "attention-list";

      var fileRow = document.createElement("div");
      fileRow.className = "attention-item attention-item--clickable";
      fileRow.onclick = function () {
        openArticleFile(a);
      };

      var fileIcon = document.createElement("span");
      fileIcon.className = "attention-item__icon attention-item__icon--info";
      fileRow.appendChild(fileIcon);

      var fileBody = document.createElement("div");
      fileBody.className = "attention-item__body";
      var fileText = document.createElement("div");
      fileText.className = "attention-item__text";
      fileText.textContent = a.filename + (a.file_size ? " (" + fmtSize(a.file_size) + ")" : "");
      fileBody.appendChild(fileText);
      var fileMeta = document.createElement("div");
      fileMeta.className = "attention-item__meta";
      fileMeta.textContent = "ATTACHED FILE";
      fileBody.appendChild(fileMeta);
      fileRow.appendChild(fileBody);

      fileList.appendChild(fileRow);
      fileWrap.appendChild(fileList);
      wrap.appendChild(fileWrap);
    }

    return wrap;
  }

  function renderArticleEntry(a, projects, onChanged) {
    var entry = document.createElement("div");
    entry.className = "project-entry";
    entry.appendChild(renderArticleCard(a, projects, onChanged));
    if (uiState.expandedId === a.id) entry.appendChild(renderArticleDetails(a));
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
    // exact pattern. "__general__" (see articleMatchesFilters()'s own comment above) is
    // a synthetic filter value, not a real project id, so it's never a valid seed here.
    if (!uiState.projectFilterInitialized) {
      uiState.projectFilterInitialized = true;
      var ctxProjectId = window.PCC.projectContext.get();
      if (ctxProjectId && projects.some(function (p) { return p.id === ctxProjectId; })) {
        uiState.projectFilter = ctxProjectId;
      }
    }

    var h1 = document.createElement("h2");
    h1.textContent = "Knowledge Base";
    h1.style.marginBottom = "4px";
    outlet.appendChild(h1);

    var sub = document.createElement("p");
    sub.className = "text-secondary";
    sub.style.marginTop = "0";
    sub.style.marginBottom = "16px";
    sub.textContent = "Reusable standard procedures, checklists, and reference material — portfolio-wide, optionally tagged to one project.";
    outlet.appendChild(sub);

    if (uiState.editingId) {
      var articleBeingEdited =
        uiState.editingId === "new"
          ? window.PCC.store.newKnowledgeBaseArticle({})
          : data.knowledge_base_articles.find(function (a) {
              return a.id === uiState.editingId;
            });
      renderForm(outlet, articleBeingEdited, projects, rerender);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search title, body, tags…";
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
    window.PCC.store.KNOWLEDGE_BASE_CATEGORIES.forEach(function (c) {
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

    var projSelectFilter = document.createElement("select");
    var allProjOpt = document.createElement("option");
    allProjOpt.value = "";
    allProjOpt.textContent = "All projects";
    projSelectFilter.appendChild(allProjOpt);
    var generalFilterOpt = document.createElement("option");
    generalFilterOpt.value = "__general__";
    generalFilterOpt.textContent = "General (no project)";
    projSelectFilter.appendChild(generalFilterOpt);
    projects.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "(unnamed project)";
      projSelectFilter.appendChild(opt);
    });
    projSelectFilter.value = uiState.projectFilter;
    projSelectFilter.onchange = function () {
      uiState.projectFilter = projSelectFilter.value;
      // Redesign Gate 6: see risks.js's own comment on this pattern — "__general__" is a
      // synthetic value (articles with no project tag), never a real project to share.
      if (uiState.projectFilter && uiState.projectFilter !== "__general__") {
        window.PCC.projectContext.set(uiState.projectFilter);
      }
      renderList();
    };

    var spacer = document.createElement("div");
    spacer.className = "toolbar__spacer";

    var addBtn = document.createElement("button");
    addBtn.className = "btn btn--primary";
    addBtn.textContent = "+ Add Article";
    // Deliberately never gated on "a project exists" — unlike every other register,
    // Knowledge Base articles don't need a project at all.
    addBtn.onclick = function () {
      uiState.editingId = "new";
      resetFormState();
      rerender();
    };

    toolbar.appendChild(searchInput);
    toolbar.appendChild(categorySelect);
    toolbar.appendChild(projSelectFilter);
    toolbar.appendChild(spacer);
    toolbar.appendChild(addBtn);
    outlet.appendChild(toolbar);

    var listWrap = document.createElement("div");
    outlet.appendChild(listWrap);

    function renderList() {
      listWrap.innerHTML = "";
      var filtered = data.knowledge_base_articles.filter(articleMatchesFilters);

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "panel empty-state";
        empty.textContent =
          data.knowledge_base_articles.length === 0
            ? "No articles yet. Click “+ Add Article” to log your first standard procedure, checklist, or reference note."
            : "No articles match this search/filter.";
        listWrap.appendChild(empty);
        return;
      }

      var list = document.createElement("div");
      list.className = "project-list";
      filtered.forEach(function (a) {
        list.appendChild(renderArticleEntry(a, projects, rerender));
      });
      listWrap.appendChild(list);
    }

    renderList();
  }

  window.PCC.pages.knowledgeBase = render;
  window.PCC.knowledgeBase = {
    filterByProject: function (projectId) {
      uiState.projectFilter = projectId;
      uiState.projectFilterInitialized = true;
      uiState.categoryFilter = "";
      uiState.search = "";
      window.PCC.projectContext.set(projectId);
    },
  };
})();
