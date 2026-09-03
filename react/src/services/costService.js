/* Service boundary for the Cost Tracking page (master prompt §9). Thin wrapper over
 * the existing store globals, unchanged from the vanilla page. getData() returns a
 * FRESH top-level object reference (see CLAUDE.md's React migration notes).
 *
 * projectCostSummary() is NOT reimplemented here — it stays defined once, in
 * src/js/pages/cost.js (the stub), exposed as window.PCC.cost.projectCostSummary,
 * because portfolio.js and executiveCenter.js — still-vanilla pages — call it directly
 * and synchronously, outside any React render. This function just forwards to that
 * single implementation so the Cost page's own Summary/EVM tabs share the exact same
 * math, never a second copy of it.
 */

export var CATEGORY_LABELS = {
  labor: "Labor",
  materials: "Materials",
  equipment: "Equipment",
  subcontractor: "Subcontractor",
  permits_fees: "Permits / Fees",
  other: "Other",
};

export function getData() {
  return Object.assign({}, window.PCC.store.get());
}

export function projectName(projects, projectId) {
  if (!projectId) return "Unassigned";
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "Unassigned";
}

export function formatMoney(value, currency) {
  if (value === null || value === undefined || value === "") return "—";
  var num = Number(value);
  if (Number.isNaN(num)) return "—";
  return (currency ? currency + " " : "") + num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatIndex(value) {
  return value == null ? "—" : value.toFixed(2);
}

export function activitiesForProject(data, projectId) {
  var scheduleNameById = {};
  data.schedules
    .filter(function (s) {
      return s.project_id === projectId;
    })
    .forEach(function (s) {
      scheduleNameById[s.id] = s.name;
    });
  return data.activities
    .filter(function (a) {
      return a.project_id === projectId;
    })
    .map(function (a) {
      return { id: a.id, label: (scheduleNameById[a.schedule_id] || "(schedule)") + ": " + (a.name || "(unnamed activity)") };
    });
}

export function budgetItemsForProject(data, projectId) {
  return data.cost_budget_items
    .filter(function (b) {
      return b.project_id === projectId;
    })
    .map(function (b) {
      return { id: b.id, label: b.name + " (" + (CATEGORY_LABELS[b.category] || b.category) + ")" };
    });
}

export function commitmentsForProject(data, projectId) {
  return data.commitments
    .filter(function (c) {
      return c.project_id === projectId;
    })
    .map(function (c) {
      return { id: c.id, label: (c.po_contract_number || "(no PO/Contract #)") + (c.status ? " — " + c.status : "") };
    });
}

export function actualsAgainst(data, budgetItemId) {
  return data.cost_actuals.filter(function (a) {
    return a.budget_item_id === budgetItemId;
  });
}

export function newCostBudgetItem() {
  return window.PCC.store.newCostBudgetItem({});
}
export function newCostActual() {
  return window.PCC.store.newCostActual({});
}

export function saveBudgetItem(isNew, itemId, values) {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.cost_budget_items.push(window.PCC.store.newCostBudgetItem(values));
    } else {
      var existing = d.cost_budget_items.find(function (b) {
        return b.id === itemId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Budget item added." : "Budget item updated.", "success");
}

export function deleteBudgetItem(id) {
  window.PCC.store.update(function (d) {
    d.cost_budget_items = d.cost_budget_items.filter(function (item2) {
      return item2.id !== id;
    });
    d.cost_actuals.forEach(function (a) {
      if (a.budget_item_id === id) a.budget_item_id = "";
    });
  });
  window.PCC.notify("Budget item deleted.", "info");
}

export function saveActual(isNew, actualId, values) {
  window.PCC.store.update(function (d) {
    if (isNew) {
      d.cost_actuals.push(window.PCC.store.newCostActual(values));
    } else {
      var existing = d.cost_actuals.find(function (a) {
        return a.id === actualId;
      });
      if (existing) {
        Object.assign(existing, values);
        existing.updated_at = new Date().toISOString();
      }
    }
  });
  window.PCC.notify(isNew ? "Actual cost logged." : "Actual cost updated.", "success");
}

export function deleteActual(id) {
  window.PCC.store.update(function (d) {
    d.cost_actuals = d.cost_actuals.filter(function (item2) {
      return item2.id !== id;
    });
  });
  window.PCC.notify("Actual cost entry deleted.", "info");
}

export function projectCostSummary(data, projectId) {
  return window.PCC.cost.projectCostSummary(data, projectId);
}

export function projectEvm(data, projectId) {
  var budgetItems = data.cost_budget_items.filter(function (b) {
    return b.project_id === projectId;
  });
  var actuals = data.cost_actuals.filter(function (a) {
    return a.project_id === projectId;
  });
  var costSummary = projectCostSummary(data, projectId);
  return window.PCC.costEvmEngine.computeEvm(budgetItems, actuals, data.activities, data.schedules, {
    bac: costSummary.budgeted,
  });
}

export function getProjectContext() {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId) {
  window.PCC.projectContext.set(projectId);
}
