/* Global Project Context — Redesign Gate 6.
 *
 * Before this gate, every project-scoped page module kept its own independent, module-
 * local `uiState.projectId`/`uiState.projectFilter`, with no shared state between them:
 * picking a project in Schedule had no effect on Executive Center, Risk Register, Cost
 * Tracking, etc. This module is the single shared source of truth for "which project is
 * the user currently working in" — backed by `settings.active_project_id` (schema v54)
 * so it also persists across reloads, same as theme/density/sidebar_collapsed.
 *
 * Deliberately just two functions, no pub/sub of its own: `store.update()` already
 * synchronously notifies every `store.onChange()` listener (see store.js's
 * scheduleSave()), and layout.js's own onChange listener (registered in mount()) is
 * where the shell header's project indicator refreshes — so any caller of set() below,
 * whether the shell switcher or a page's own filter, keeps the header in sync for free.
 * A caller changing the CURRENT page's own project selection already re-renders itself
 * via its own local rerender(); only the shell-level switcher needs to explicitly call
 * router.render() after set() to refresh the page underneath it.
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};

  function activeProjects(data) {
    return data.projects.filter(function (p) {
      return !p.archived;
    });
  }

  /** Company/Client/Project Management redesign. Same "active only, re-validate on every
   * read" treatment activeProjects() above already gives projects — see CLAUDE.md's spec,
   * point 11 (Active vs Historical). Archived companies/clients still exist and stay fully
   * intact/searchable everywhere else in the app; they just drop out of these three
   * cascading pickers. */
  function activeCompanies(data) {
    return (data.companies || []).filter(function (c) {
      return !c.archived;
    });
  }

  function clientsForCompany(data, companyId) {
    return (data.clients || []).filter(function (c) {
      return !c.archived && c.company_id === companyId;
    });
  }

  function projectsForCompanyClient(data, companyId, clientId) {
    return activeProjects(data).filter(function (p) {
      return p.company_id === companyId && p.client_id === clientId;
    });
  }

  /** Returns the current active company id, or "" if none is set or it no longer points
   * at a live (non-archived) company. */
  function getCompany() {
    var data = window.PCC.store.get();
    var id = data.settings.active_company_id;
    if (!id) return "";
    return activeCompanies(data).some(function (c) {
      return c.id === id;
    })
      ? id
      : "";
  }

  /** Returns the current active client id — "" if none is set, if it's archived, or if it
   * doesn't belong to the current active company (a stale id left over from before the
   * company was switched some other way). */
  function getClient() {
    var data = window.PCC.store.get();
    var companyId = getCompany();
    var id = data.settings.active_client_id;
    if (!id || !companyId) return "";
    return clientsForCompany(data, companyId).some(function (c) {
      return c.id === id;
    })
      ? id
      : "";
  }

  /** Records the last Client + Project used under a given Company, so switching back to
   * that Company later (see setCompany() below) restores where the user left off — spec
   * point 9, "Remember Last Context." Internal; page modules never call this directly. */
  function rememberCompanyContext(data, companyId, clientId, projectId) {
    if (!companyId) return;
    if (!data.settings.company_context_memory) data.settings.company_context_memory = {};
    data.settings.company_context_memory[companyId] = { client_id: clientId || "", project_id: projectId || "" };
  }

  /** Switches the active Company. Per spec point 7, this must NOT arbitrarily pick a
   * Client when the company has several — it only restores a previously-remembered
   * Client+Project for this company (point 9) if one still exists and is still valid;
   * otherwise Client/Project both clear to "unselected" and the cascading selects show
   * their own "choose one" state. */
  function setCompany(companyId) {
    window.PCC.store.update(function (data) {
      data.settings.active_company_id = companyId || "";
      if (!companyId) {
        data.settings.active_client_id = "";
        data.settings.active_project_id = "";
        return;
      }
      var mem = (data.settings.company_context_memory || {})[companyId];
      var restoredClientId = "";
      var restoredProjectId = "";
      if (mem && mem.client_id && clientsForCompany(data, companyId).some(function (c) { return c.id === mem.client_id; })) {
        restoredClientId = mem.client_id;
        if (mem.project_id && projectsForCompanyClient(data, companyId, restoredClientId).some(function (p) { return p.id === mem.project_id; })) {
          restoredProjectId = mem.project_id;
        }
      }
      data.settings.active_client_id = restoredClientId;
      data.settings.active_project_id = restoredProjectId;
    });
  }

  /** Switches the active Client (and, defensively, the Company it belongs to — a Client
   * is exclusive to one Company, so picking a Client always implies its Company). Restores
   * a remembered Project for this exact Company+Client pair if one still exists, per the
   * same "remember last context" rule setCompany() follows for Clients. */
  function setClient(clientId) {
    window.PCC.store.update(function (data) {
      var client = (data.clients || []).find(function (c) {
        return c.id === clientId;
      });
      var companyId = client ? client.company_id : "";
      data.settings.active_company_id = companyId;
      data.settings.active_client_id = clientId || "";
      var restoredProjectId = "";
      if (clientId && companyId) {
        var mem = (data.settings.company_context_memory || {})[companyId];
        if (mem && mem.client_id === clientId && mem.project_id && projectsForCompanyClient(data, companyId, clientId).some(function (p) { return p.id === mem.project_id; })) {
          restoredProjectId = mem.project_id;
        }
      }
      data.settings.active_project_id = restoredProjectId;
      if (companyId) rememberCompanyContext(data, companyId, clientId, restoredProjectId);
    });
  }

  /** Returns the current active project id, or "" if none is set or the stored id no
   * longer points at a live (non-archived) project — e.g. the project was archived or
   * deleted since it was picked. Never throws, never auto-picks a fallback project;
   * callers that need "some project, any project" (the existing Pattern-A pages) keep
   * their own "first active project" fallback for when this returns "". */
  function get() {
    var data = window.PCC.store.get();
    var id = data.settings.active_project_id;
    if (!id) return "";
    return activeProjects(data).some(function (p) {
      return p.id === id;
    })
      ? id
      : "";
  }

  /** Sets the active project ("" clears it, meaning "All Projects"). Does not validate
   * the id against the project list — callers already only ever pass a value taken from
   * a project `<select>` they just built off `data.projects`, so it's always valid at
   * the moment of the call; get() re-validates on every read regardless (see above), so
   * a project archived later is handled there, not here. */
  /** Sets the active project ("" clears it, meaning "All Projects" within whatever
   * Company/Client is currently active — clearing the project does NOT clear Company/
   * Client, since those still describe the scope being browsed). Company/Client/Project
   * Management redesign: a non-empty projectId also syncs settings.active_company_id/
   * active_client_id to that project's own company_id/client_id and remembers this as the
   * project's company's last-used context (spec point 10 — Project is the context's leaf,
   * so picking one anywhere, including every existing page's own project picker, carries
   * its Company/Client along automatically without those ~30 call sites needing to know
   * Company/Client exist at all). */
  function set(projectId) {
    window.PCC.store.update(function (data) {
      data.settings.active_project_id = projectId || "";
      if (!projectId) return;
      var p = data.projects.find(function (x) {
        return x.id === projectId;
      });
      if (!p) return;
      data.settings.active_company_id = p.company_id || "";
      data.settings.active_client_id = p.client_id || "";
      if (p.company_id) rememberCompanyContext(data, p.company_id, p.client_id, projectId);
    });
  }

  /** Daily-Use Audit Phase 5 (pinned projects): "someone bouncing between a few
   * 'current' projects re-picks from the full, unsorted list every time" — get()/set()
   * above only ever track ONE current project; this is a separate, ordered set of
   * "the 2-3 I actually work in", surfaced first in the shell header's project select
   * (layout.js's populateProjectContextSelect()). Filtered to still-live, non-archived
   * projects on every read, same "re-validate, don't trust a stale id" rule get() above
   * already follows — a pinned project that's since been archived/deleted just quietly
   * drops off rather than leaving a broken entry an unpin action would be needed for. */
  function getPinnedIds() {
    var data = window.PCC.store.get();
    var live = activeProjects(data);
    return (data.settings.pinned_project_ids || []).filter(function (id) {
      return live.some(function (p) {
        return p.id === id;
      });
    });
  }

  function isPinned(projectId) {
    return getPinnedIds().indexOf(projectId) !== -1;
  }

  /** Newly-pinned projects go to the front — the most recently pinned is the one most
   * likely to be what someone's actively switching into right now. */
  function togglePin(projectId) {
    window.PCC.store.update(function (data) {
      if (!data.settings.pinned_project_ids) data.settings.pinned_project_ids = [];
      var idx = data.settings.pinned_project_ids.indexOf(projectId);
      if (idx !== -1) data.settings.pinned_project_ids.splice(idx, 1);
      else data.settings.pinned_project_ids.unshift(projectId);
    });
  }

  window.PCC.projectContext = {
    get: get,
    set: set,
    getPinnedIds: getPinnedIds,
    isPinned: isPinned,
    togglePin: togglePin,
    getCompany: getCompany,
    getClient: getClient,
    setCompany: setCompany,
    setClient: setClient,
    activeCompanies: activeCompanies,
    clientsForCompany: clientsForCompany,
    projectsForCompanyClient: projectsForCompanyClient,
  };
})();
