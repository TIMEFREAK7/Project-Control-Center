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
  function set(projectId) {
    window.PCC.store.update(function (data) {
      data.settings.active_project_id = projectId || "";
    });
  }

  window.PCC.projectContext = { get: get, set: set };
})();
