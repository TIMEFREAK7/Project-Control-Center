/* Cost Tracking — migrated to React (Post-Phase-5 Engineering Evolution). All rendering
 * logic now lives in react/src/pages/Cost.jsx (compiled into js/vendor/react-bundle.js
 * by build.js); this file's remaining jobs are (1) registering the route with the
 * existing vanilla router, then handing off to reactBridge.js, (2) keeping the public
 * API other (still-vanilla) page modules depend on — filterByProject() — via the same
 * one-shot pending-prop channel established for other migrated pages with a cross-page
 * handoff (consumed inside the component's initial useState lazy initializer, never a
 * useEffect — see CLAUDE.md's React migration notes on why), and (3) keeping
 * projectCostSummary() defined here, unchanged from the original vanilla page — NOT
 * moved into react/src/services/costService.js — because portfolio.js and
 * executiveCenter.js, still-vanilla pages, call window.PCC.cost.projectCostSummary()
 * directly and synchronously, outside any React render. costService.js's own
 * projectCostSummary() just forwards to this one, so there's still only a single
 * implementation (master prompt §9: React must not own core calculations).
 */
(function () {
  "use strict";
  window.PCC = window.PCC || {};
  window.PCC.pages = window.PCC.pages || {};

  /** Per-project budget/actual/variance, scoped to active projects — same convention
   * Reports' Portfolio Summary Report uses. See the original vanilla cost.js's header
   * comment (preserved in git history) for the full reasoning behind the
   * usingPortfolioBudget fallback. */
  function projectCostSummary(data, projectId) {
    var budgetItems = data.cost_budget_items.filter(function (b) {
      return b.project_id === projectId;
    });
    var itemsTotal = budgetItems.reduce(function (sum, b) {
      return sum + (Number(b.planned_amount) || 0);
    }, 0);

    var budgeted = itemsTotal;
    var usingPortfolioBudget = false;
    if (budgetItems.length === 0) {
      var project = data.projects.find(function (p) {
        return p.id === projectId;
      });
      if (project && project.budget !== null && project.budget !== undefined && project.budget !== "") {
        budgeted = Number(project.budget) || 0;
        usingPortfolioBudget = true;
      }
    }

    var actual = data.cost_actuals
      .filter(function (a) {
        return a.project_id === projectId;
      })
      .reduce(function (sum, a) {
        return sum + (Number(a.amount) || 0);
      }, 0);
    return { budgeted: budgeted, actual: actual, variance: budgeted - actual, usingPortfolioBudget: usingPortfolioBudget };
  }

  var pendingProjectFilter = null;

  function render(outlet) {
    var props = {
      initialProjectFilter: pendingProjectFilter,
    };
    pendingProjectFilter = null;
    window.PCC.reactBridge.mount(window.PCC.reactPages.cost, props, outlet);
  }

  window.PCC.pages.cost = render;

  window.PCC.cost = {
    filterByProject: function (projectId) {
      pendingProjectFilter = projectId;
      window.PCC.projectContext.set(projectId);
    },
    projectCostSummary: projectCostSummary,
  };
})();
