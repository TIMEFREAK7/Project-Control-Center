/** Command palette (Ctrl/Cmd+K, or the title-block search button): one search box that
 * jumps to any page or any record by name. Before this, reaching a specific RFI/risk/
 * activity meant knowing which register it lived in, navigating there, then using that
 * page's own search box — and the "/" shortcut (keyboardShortcuts.js) only ever searches
 * the page you're already on.
 *
 * Deliberately owns NO navigation logic of its own. Every jump goes through the exact
 * public hand-off each page module already exposes for cross-page links (myWorkService.ts,
 * actionCentreService.ts, etc. use the same calls): `window.PCC.<module>.filterByProject()`
 * + `expand<Record>()`, then `router.go(route)`. filterByProject is called first on
 * purpose — it's what makes a CLOSED record in a DIFFERENT project than the current
 * context actually visible on arrival (most registers otherwise default to "open only" and
 * the current project, which would hide exactly the records people search for by name).
 *
 * Matching reuses window.PCC.fuzzyMatch (react/src/utils/fuzzyMatch.ts) — the same matcher
 * every register's own search box uses — so a typo that finds a row on the Risk Register
 * finds it here too. Ranking is: title starts with the query, title contains it, any
 * searchable field contains it, then fuzzy (typo-tolerant) matches last.
 *
 * Modal behavior (Escape, Tab trap, focus return, role="dialog") is modalA11y.js's job.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  var OVERLAY_ID = "command-palette-overlay";
  var PAGE_LIMIT = 8;
  var RECORD_LIMIT_PER_TYPE = 5;
  var FUZZY_MIN_QUERY = 4; // below this, fuzzyMatch is substring-only anyway

  // ---- index ---------------------------------------------------------------------

  function humanize(s) {
    return String(s || "").replace(/_/g, " ");
  }

  function join(parts) {
    return parts.filter(Boolean).join(" · ");
  }

  function go(route) {
    window.PCC.router.go(route);
  }

  // One entry per record type. `items(data, ctx)` returns [{label, detail, haystack, run}].
  // ctx.projectName(id) and ctx.liveProject(id) are shared lookups. A type whose page
  // module isn't loaded (e.g. a future partial bundle) is skipped rather than throwing.
  var RECORD_TYPES = [
    {
      group: "Projects",
      needs: "projectWorkspace",
      items: function (data) {
        return data.projects
          .filter(function (p) { return !p.archived; })
          .map(function (p) {
            return {
              label: p.name || "(unnamed project)",
              detail: join([p.project_code, p.client || p.company, humanize(p.status)]),
              haystack: [p.name, p.project_code, p.client, p.company].join(" "),
              run: function () {
                window.PCC.projectWorkspace.viewProject(p.id);
                go("projectWorkspace");
              },
            };
          });
      },
    },
    {
      group: "Activities",
      needs: "schedule",
      items: function (data, ctx) {
        var scheduleNames = {};
        (data.schedules || []).forEach(function (s) { scheduleNames[s.id] = s.name; });
        return (data.activities || [])
          .filter(function (a) { return ctx.liveProject(a.project_id); })
          .map(function (a) {
            return {
              label: join([a.external_id, a.name || "(unnamed activity)"]),
              detail: join([ctx.projectName(a.project_id), scheduleNames[a.schedule_id]]),
              haystack: [a.name, a.external_id].join(" "),
              run: function () {
                window.PCC.schedule.viewActivity(a.project_id, a.schedule_id, a.id);
                go("schedule");
              },
            };
          });
      },
    },
    registerType("Risks & Issues", "risks", "risks", "expandRisk", function (r) {
      return { label: r.title, kind: r.type, haystack: [r.title, r.description, r.owner].join(" ") };
    }),
    registerType("RFIs & TQs", "rfis", "rfis", "expandRfi", function (r) {
      return { label: join([r.number, r.subject]), kind: r.type === "tq" ? "TQ" : "RFI", haystack: [r.number, r.subject].join(" ") };
    }),
    registerType("Change Orders", "change_orders", "changeOrders", "expandChangeOrder", function (c) {
      return { label: join([c.number, c.title]), haystack: [c.number, c.title, c.description].join(" ") };
    }, "changeOrders"),
    registerType("Decisions", "decisions", "decisionRegister", "expandDecision", function (d) {
      return { label: d.title, haystack: [d.title, d.description].join(" ") };
    }),
    registerType("Meetings", "meetings", "meetings", "expandMeeting", function (m) {
      return { label: join([m.title, m.meeting_date]), haystack: [m.title, m.meeting_date].join(" "), noStatus: true };
    }),
    {
      group: "Documents",
      // documents.js publishes its cross-page API as window.PCC.files, not .documents.
      needs: "files",
      items: function (data, ctx) {
        var docs = (data.documents || []).filter(function (d) { return !d.trashed_at && ctx.liveProject(d.project_id); });
        // The register itself shows only the latest revision of each document by default —
        // listing superseded revisions here would jump to a row the register hides.
        if (window.PCC.files.latestOnly) docs = window.PCC.files.latestOnly(docs);
        return docs.map(function (d) {
          return {
            label: join([d.document_number, d.filename || "(unnamed document)"]),
            detail: join([ctx.projectName(d.project_id), d.revision ? "Rev " + d.revision : "", humanize(d.status)]),
            haystack: [d.document_number, d.filename, d.discipline].join(" "),
            run: function () {
              window.PCC.files.filterByProject(d.project_id);
              window.PCC.files.expandDocument(d.id);
              go("documents");
            },
          };
        });
      },
    },
    {
      group: "Vendors",
      needs: "vendors",
      items: function (data) {
        return (data.vendors || []).map(function (v) {
          return {
            label: v.vendor_name || v.company_name || "(unnamed vendor)",
            detail: join([v.vendor_code, v.category || v.trade_discipline, humanize(v.status)]),
            haystack: [v.vendor_name, v.company_name, v.vendor_code, v.trade_discipline].join(" "),
            run: function () {
              window.PCC.vendors.openProfile(v.id);
              go("vendors");
            },
          };
        });
      },
    },
    registerType("Lessons Learned", "lessons_learned", "lessonsLearned", "expandLesson", function (l) {
      return { label: l.title, haystack: [l.title, l.description].join(" "), noStatus: true };
    }),
    registerType("Daily Logs", "daily_logs", "dailyLog", "expandLog", function (l) {
      return { label: "Daily Log — " + (l.log_date || ""), haystack: ["daily log", l.log_date].join(" "), noStatus: true };
    }, "dailylog"),
    {
      group: "Commitments",
      needs: "commitments",
      items: function (data, ctx) {
        var vendorNames = {};
        (data.vendors || []).forEach(function (v) { vendorNames[v.id] = v.vendor_name || v.company_name; });
        return (data.commitments || [])
          .filter(function (c) { return ctx.liveProject(c.project_id); })
          .map(function (c) {
            return {
              label: join([c.po_contract_number || "(no PO number)", vendorNames[c.vendor_id]]),
              detail: join([ctx.projectName(c.project_id), humanize(c.type), humanize(c.status)]),
              haystack: [c.po_contract_number, vendorNames[c.vendor_id], c.notes].join(" "),
              run: function () {
                window.PCC.commitments.filterByProject(c.project_id);
                window.PCC.commitments.expandCommitment(c.id);
                go("commitments");
              },
            };
          });
      },
    },
  ];

  /** The common shape for a project-scoped register: `data[collection]`, jumped to via
   * `window.PCC[module].filterByProject(projectId)` + `window.PCC[module][expandFn](id)`,
   * then `router.go(route)` (route defaults to the module name). */
  function registerType(group, collection, module, expandFn, describe, route) {
    return {
      group: group,
      needs: module,
      items: function (data, ctx) {
        return (data[collection] || [])
          .filter(function (r) { return ctx.liveProject(r.project_id); })
          .map(function (r) {
            var d = describe(r);
            return {
              label: d.label || "(untitled)",
              detail: join([cap(humanize(d.kind)), ctx.projectName(r.project_id), d.noStatus ? "" : humanize(r.status)]),
              haystack: d.haystack,
              run: function () {
                var mod = window.PCC[module];
                if (mod.filterByProject) mod.filterByProject(r.project_id);
                mod[expandFn](r.id);
                go(route || module);
              },
            };
          });
      },
    };
  }

  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function buildIndex() {
    var data = window.PCC.store.get();
    var projectsById = {};
    data.projects.forEach(function (p) { projectsById[p.id] = p; });
    var ctx = {
      projectName: function (id) {
        return projectsById[id] ? projectsById[id].name : "";
      },
      // Records under an archived (or deleted) project are hidden on every register, so
      // offering them here would jump to something the destination page won't show.
      liveProject: function (id) {
        return !!projectsById[id] && !projectsById[id].archived;
      },
    };

    var groups = [];
    var pages = window.PCC.layout && window.PCC.layout.navItems ? window.PCC.layout.navItems() : [];
    groups.push({
      group: "Pages",
      isPages: true,
      items: pages.map(function (p) {
        return {
          label: p.label,
          detail: cap(p.group.toLowerCase()),
          haystack: p.label + " " + p.group,
          icon: p.icon,
          run: function () { go(p.key); },
        };
      }),
    });
    RECORD_TYPES.forEach(function (t) {
      if (!window.PCC[t.needs]) return;
      groups.push({ group: t.group, items: t.items(data, ctx) });
    });
    return groups;
  }

  // ---- matching ------------------------------------------------------------------

  function rank(item, q) {
    var label = item.label.toLowerCase();
    if (label.indexOf(q) === 0) return 0;
    if (label.indexOf(q) !== -1) return 1;
    if ((item.haystack || "").toLowerCase().indexOf(q) !== -1) return 2;
    return -1;
  }

  function search(groups, query) {
    var q = query.trim().toLowerCase();
    var fuzzy = q.length >= FUZZY_MIN_QUERY ? window.PCC.fuzzyMatch : null;
    var out = [];
    groups.forEach(function (g) {
      var limit = g.isPages ? (q ? PAGE_LIMIT : Infinity) : RECORD_LIMIT_PER_TYPE;
      if (!q) {
        // Empty query: pages only, as a quick-jump list — records need a query.
        if (g.isPages) out.push({ group: g.group, items: g.items });
        return;
      }
      var buckets = [[], [], []];
      var fuzzyHits = [];
      g.items.forEach(function (item) {
        var r = rank(item, q);
        if (r !== -1) buckets[r].push(item);
        else if (fuzzy && fuzzyHits.length < limit && fuzzy(q, item.label + " " + (item.haystack || ""))) fuzzyHits.push(item);
      });
      var hits = buckets[0].concat(buckets[1], buckets[2], fuzzyHits).slice(0, limit);
      if (!hits.length) return;
      var best = buckets[0].length ? 0 : buckets[1].length ? 1 : buckets[2].length ? 2 : 3;
      out.push({ group: g.group, items: hits, best: best, order: out.length });
    });
    // Groups ordered by their best match, fixed type order breaking ties: otherwise a
    // typo-level fuzzy hit in an early group ("Zephyrrfi" ~ risk "Zephyrrisk") would sit
    // above — and be pre-selected over — the exact match in a later group (the RFI).
    if (q) {
      out.sort(function (a, b) {
        return a.best - b.best || a.order - b.order;
      });
    }
    return out;
  }

  // ---- UI ------------------------------------------------------------------------

  var state = null; // { overlay, input, list, status, groups, flat, active, detach }

  function isOpen() {
    return !!state;
  }

  function close() {
    if (!state) return;
    var s = state;
    state = null;
    s.overlay.remove();
    s.detach();
  }

  function choose(index) {
    if (!state) return;
    var item = state.flat[index];
    if (!item) return;
    close();
    item.run();
  }

  function setActive(index) {
    if (!state || state.flat.length === 0) return;
    var n = state.flat.length;
    state.active = ((index % n) + n) % n;
    var options = state.list.querySelectorAll(".command-palette__option");
    Array.prototype.forEach.call(options, function (el, i) {
      var on = i === state.active;
      el.classList.toggle("command-palette__option--active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
      if (on) {
        state.input.setAttribute("aria-activedescendant", el.id);
        if (el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function renderResults() {
    var results = search(state.groups, state.input.value);
    var list = state.list;
    list.innerHTML = "";
    state.flat = [];
    state.input.removeAttribute("aria-activedescendant");

    results.forEach(function (g, gi) {
      var group = document.createElement("div");
      group.setAttribute("role", "group");
      var heading = document.createElement("div");
      heading.className = "command-palette__group-label";
      heading.id = "command-palette-group-" + gi;
      heading.textContent = g.group;
      group.setAttribute("aria-labelledby", heading.id);
      group.appendChild(heading);
      g.items.forEach(function (item) {
        var index = state.flat.length;
        state.flat.push(item);
        var opt = document.createElement("div");
        opt.className = "command-palette__option";
        opt.id = "command-palette-option-" + index;
        opt.setAttribute("role", "option");
        opt.setAttribute("aria-selected", "false");
        if (item.icon) {
          var icon = document.createElement("span");
          icon.className = "command-palette__icon";
          icon.setAttribute("aria-hidden", "true");
          icon.innerHTML = item.icon; // layout.js's own static NAV_ICONS SVG, never user data
          opt.appendChild(icon);
        }
        var label = document.createElement("span");
        label.className = "command-palette__label";
        label.textContent = item.label;
        opt.appendChild(label);
        if (item.detail) {
          var detail = document.createElement("span");
          detail.className = "command-palette__detail";
          detail.textContent = item.detail;
          opt.appendChild(detail);
        }
        // mousedown, not click: keeps focus in the input (no blur flicker) and fires
        // before any focus change could re-render the list underneath the pointer.
        opt.addEventListener("mousedown", function (e) {
          e.preventDefault();
        });
        opt.addEventListener("click", function () {
          choose(index);
        });
        opt.addEventListener("mousemove", function () {
          if (state && state.active !== index) setActive(index);
        });
        group.appendChild(opt);
      });
      list.appendChild(group);
    });

    if (state.flat.length === 0) {
      var empty = document.createElement("div");
      empty.className = "command-palette__empty";
      empty.textContent = "No pages or records match “" + state.input.value.trim() + "”.";
      list.appendChild(empty);
    }
    state.status.textContent = state.flat.length === 0 ? "No results" : state.flat.length + (state.flat.length === 1 ? " result" : " results");
    state.active = 0;
    setActive(0);
  }

  function onInputKeydown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(state.active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(state.active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(state.active);
    }
  }

  function open() {
    if (state) {
      state.input.focus();
      return;
    }
    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "modal-overlay command-palette-overlay";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });

    var modal = document.createElement("div");
    modal.className = "modal command-palette";

    var row = document.createElement("div");
    row.className = "command-palette__input-row";
    var glyph = document.createElement("span");
    glyph.className = "command-palette__glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    var input = document.createElement("input");
    input.type = "text";
    input.id = "command-palette-input";
    input.className = "command-palette__input";
    input.placeholder = "Search pages, projects, activities, RFIs, risks…";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Search pages and records");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", "command-palette-results");
    input.setAttribute("aria-autocomplete", "list");
    var esc = document.createElement("kbd");
    esc.className = "command-palette__kbd";
    esc.textContent = "Esc";
    row.appendChild(glyph);
    row.appendChild(input);
    row.appendChild(esc);

    var list = document.createElement("div");
    list.id = "command-palette-results";
    list.className = "command-palette__results";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Results");

    var status = document.createElement("div");
    status.className = "command-palette__status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    modal.appendChild(row);
    modal.appendChild(list);
    modal.appendChild(status);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    state = {
      overlay: overlay,
      input: input,
      list: list,
      status: status,
      groups: buildIndex(),
      flat: [],
      active: 0,
      detach: null,
    };
    state.detach = window.PCC.modalA11y.attach(overlay, {
      onClose: close,
      initialFocus: input,
      label: "Search pages and records",
    });
    input.addEventListener("input", renderResults);
    input.addEventListener("keydown", onInputKeydown);
    renderResults();
  }

  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.key !== "k" && e.key !== "K") return;
    e.preventDefault();
    if (state) {
      close();
      return;
    }
    // Never stack on top of another open dialog (file viewer, an AI-output modal) or the
    // mobile nav drawer — the palette would navigate away underneath it.
    if (window.PCC.modalA11y.isOpen() || document.getElementById("nav-overlay")) return;
    open();
  });

  window.PCC.commandPalette = {
    open: open,
    close: close,
    isOpen: isOpen,
    // Exposed for tests: the ranked, grouped results for a query, without opening the UI.
    search: function (query) {
      return search(buildIndex(), query);
    },
  };
})();
