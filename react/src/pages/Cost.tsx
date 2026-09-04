/* Cost Tracking, migrated to React as part of the page-by-page migration (Post-Phase-5
 * Engineering Evolution). Reproduces the prior vanilla page's exact text, field ids
 * (costbudgetfield- / costactualfield- prefixed), button labels, and CSS class names (panel/
 * form-grid/field/project-list/project-entry/detail-card/kpi-grid/kpi-card/status-badge/
 * tab-bar/tab-btn/toolbar/btn) — same visual result, only the implementation moved. See
 * src/js/pages/cost.js (now a small stub) for the router registration, the
 * window.PCC.cost public API (filterByProject/projectCostSummary) other still-vanilla
 * pages depend on, and why projectCostSummary() itself stays defined there rather than
 * being reimplemented here (master prompt §9: React must not own core calculations).
 *
 * Both add/edit forms are UNCONTROLLED (fields read via form.querySelector at submit
 * time, like every other migrated register). Each form's Project field is the one
 * controlled input, so its dependent selects (Budget form's Activity; Actuals form's
 * Budget Item and Commitment) can be rescoped on change — matching the vanilla
 * behavior of always resetting those dependent selections to "unset" on every Project
 * change (never restoring a prior selection, even switching back to the original
 * project), via the same projectResetVersion-counter-folded-into-key pattern used for
 * Meetings' action rows.
 *
 * The Budget and Actuals tabs share one filter state (search/category/project), same
 * as the vanilla page's single uiState object feeding buildToolbar() for both tabs.
 *
 * All store reads/writes go through costService.js (master prompt §9).
 */
import React, { useState } from "react";
import {
  CATEGORY_LABELS,
  getData,
  projectName,
  formatMoney,
  formatIndex,
  activitiesForProject,
  budgetItemsForProject,
  commitmentsForProject,
  actualsAgainst,
  newCostBudgetItem,
  newCostActual,
  saveBudgetItem,
  deleteBudgetItem,
  saveActual,
  deleteActual,
  projectCostSummary,
  projectEvm,
  getProjectContext,
  setProjectContext,
} from "../services/costService";
import type { ActivityOption, LabeledOption } from "../services/costService";
import type { PCCCostBudgetItem, PCCCostActual, PCCProject, PCCStoreData } from "../types/pcc";

function BudgetForm({
  isNew,
  item,
  projects,
  data,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  item: PCCCostBudgetItem;
  projects: PCCProject[];
  data: PCCStoreData;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const activeProjects = projects.filter((p) => !p.archived);
  const [selectedProjectId, setSelectedProjectId] = useState(item.project_id || (activeProjects[0] ? activeProjects[0].id : ""));
  const [projectResetVersion, setProjectResetVersion] = useState(0);
  const [showError, setShowError] = useState(false);

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedProjectId(e.target.value);
    setProjectResetVersion((v) => v + 1);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = (form.querySelector("#costbudgetfield-name") as HTMLInputElement).value.trim();
    const amountRaw = (form.querySelector("#costbudgetfield-planned_amount") as HTMLInputElement).value;
    const amount = amountRaw === "" ? null : Number(amountRaw);
    if (!name || !selectedProjectId || amount === null || Number.isNaN(amount)) {
      setShowError(true);
      return;
    }
    setShowError(false);
    const values: Partial<PCCCostBudgetItem> = {
      project_id: selectedProjectId,
      category: (form.querySelector("#costbudgetfield-category") as HTMLSelectElement).value,
      name: name,
      planned_amount: amount,
      activity_id: (form.querySelector("#costbudgetfield-activity_id") as HTMLSelectElement).value,
      notes: (form.querySelector("#costbudgetfield-notes") as HTMLTextAreaElement).value,
    };
    saveBudgetItem(isNew, item.id, values);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Budget Item" : "Edit Budget Item"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="costbudgetfield-project_id">Project *</label>
          {activeProjects.length === 0 ? (
            <select id="costbudgetfield-project_id" disabled defaultValue="">
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select id="costbudgetfield-project_id" value={selectedProjectId} onChange={handleProjectChange}>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "(unnamed project)"}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="costbudgetfield-category">Category *</label>
            <select id="costbudgetfield-category" defaultValue={item.category || "other"}>
              {window.PCC.store.COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] || c}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="costbudgetfield-name">Name / Scope *</label>
            <input type="text" id="costbudgetfield-name" defaultValue={item.name || ""} />
          </div>

          <div className="field">
            <label htmlFor="costbudgetfield-planned_amount">Planned Amount *</label>
            <input type="number" step="0.01" id="costbudgetfield-planned_amount" defaultValue={item.planned_amount == null ? "" : item.planned_amount} />
          </div>

          <div className="field">
            <label htmlFor="costbudgetfield-activity_id">Schedule Activity (for EVM)</label>
            <select
              id="costbudgetfield-activity_id"
              key={"budget-act-" + selectedProjectId + "-" + projectResetVersion}
              defaultValue={projectResetVersion === 0 ? item.activity_id || "" : ""}
            >
              <option value="">(none — not linked to a schedule activity)</option>
              {activitiesForProject(data, selectedProjectId).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="costbudgetfield-notes">Notes</label>
          <textarea id="costbudgetfield-notes" rows={2} defaultValue={item.notes || ""} />
        </div>

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Project, Name, and a Planned Amount are required.</p> : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={activeProjects.length === 0}>
            {isNew ? "Add Budget Item" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ActualForm({
  isNew,
  entry,
  projects,
  data,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  entry: PCCCostActual;
  projects: PCCProject[];
  data: PCCStoreData;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const activeProjects = projects.filter((p) => !p.archived);
  const [selectedProjectId, setSelectedProjectId] = useState(entry.project_id || (activeProjects[0] ? activeProjects[0].id : ""));
  const [projectResetVersion, setProjectResetVersion] = useState(0);
  const [showError, setShowError] = useState(false);

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedProjectId(e.target.value);
    setProjectResetVersion((v) => v + 1);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const description = (form.querySelector("#costactualfield-description") as HTMLInputElement).value.trim();
    const amountRaw = (form.querySelector("#costactualfield-amount") as HTMLInputElement).value;
    const amount = amountRaw === "" ? null : Number(amountRaw);
    const date = (form.querySelector("#costactualfield-date") as HTMLInputElement).value;
    if (!description || !selectedProjectId || amount === null || Number.isNaN(amount) || !date) {
      setShowError(true);
      return;
    }
    setShowError(false);
    const values: Partial<PCCCostActual> = {
      project_id: selectedProjectId,
      budget_item_id: (form.querySelector("#costactualfield-budget_item_id") as HTMLSelectElement).value,
      commitment_id: (form.querySelector("#costactualfield-commitment_id") as HTMLSelectElement).value,
      category: (form.querySelector("#costactualfield-category") as HTMLSelectElement).value,
      description: description,
      amount: amount,
      date: date,
      vendor: (form.querySelector("#costactualfield-vendor") as HTMLInputElement).value,
      invoice_ref: (form.querySelector("#costactualfield-invoice_ref") as HTMLInputElement).value,
      notes: (form.querySelector("#costactualfield-notes") as HTMLTextAreaElement).value,
    };
    saveActual(isNew, entry.id, values);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Log Actual Cost" : "Edit Actual Cost"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="costactualfield-project_id">Project *</label>
          {activeProjects.length === 0 ? (
            <select id="costactualfield-project_id" disabled defaultValue="">
              <option value="">No projects yet — add one in Portfolio first</option>
            </select>
          ) : (
            <select id="costactualfield-project_id" value={selectedProjectId} onChange={handleProjectChange}>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "(unnamed project)"}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="field">
          <label htmlFor="costactualfield-budget_item_id">Against Budget Item</label>
          <select
            id="costactualfield-budget_item_id"
            key={"actual-budget-" + selectedProjectId + "-" + projectResetVersion}
            defaultValue={projectResetVersion === 0 ? entry.budget_item_id || "" : ""}
          >
            <option value="">(none — unbudgeted)</option>
            {budgetItemsForProject(data, selectedProjectId).map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="costactualfield-commitment_id">Against Commitment</label>
          <select
            id="costactualfield-commitment_id"
            key={"actual-cmt-" + selectedProjectId + "-" + projectResetVersion}
            defaultValue={projectResetVersion === 0 ? entry.commitment_id || "" : ""}
          >
            <option value="">(none)</option>
            {commitmentsForProject(data, selectedProjectId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="costactualfield-category">Category *</label>
            <select id="costactualfield-category" defaultValue={entry.category || "other"}>
              {window.PCC.store.COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] || c}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="costactualfield-description">Description *</label>
            <input type="text" id="costactualfield-description" defaultValue={entry.description || ""} />
          </div>

          <div className="field">
            <label htmlFor="costactualfield-amount">Amount *</label>
            <input type="number" step="0.01" id="costactualfield-amount" defaultValue={entry.amount == null ? "" : entry.amount} />
          </div>

          <div className="field">
            <label htmlFor="costactualfield-date">Date *</label>
            <input type="date" id="costactualfield-date" defaultValue={entry.date || ""} />
          </div>

          <div className="field">
            <label htmlFor="costactualfield-vendor">Vendor</label>
            <input type="text" id="costactualfield-vendor" defaultValue={entry.vendor || ""} />
          </div>

          <div className="field">
            <label htmlFor="costactualfield-invoice_ref">Invoice / Ref #</label>
            <input type="text" id="costactualfield-invoice_ref" defaultValue={entry.invoice_ref || ""} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="costactualfield-notes">Notes</label>
          <textarea id="costactualfield-notes" rows={2} defaultValue={entry.notes || ""} />
        </div>

        {showError ? (
          <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Project, Description, Amount, and Date are required.</p>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={activeProjects.length === 0}>
            {isNew ? "Log Cost" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Toolbar({
  tab,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  projectFilter,
  onProjectChange,
  projects,
  actionsSlot,
}: {
  tab: string;
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  projectFilter: string;
  onProjectChange: (value: string) => void;
  projects: PCCProject[];
  actionsSlot: React.ReactNode;
}) {
  return (
    <div className="toolbar">
      <input
        type="text"
        placeholder={tab === "budget" ? "Search name, notes…" : "Search description, vendor, invoice…"}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => onCategoryChange(e.target.value)}>
        <option value="">All categories</option>
        {window.PCC.store.COST_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <select aria-label="Filter by project" value={projectFilter} onChange={(e) => onProjectChange(e.target.value)}>
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name || "(unnamed project)"}
          </option>
        ))}
      </select>
      <div className="toolbar__spacer" />
      {actionsSlot}
    </div>
  );
}

function BudgetTab({
  data,
  search,
  categoryFilter,
  projectFilter,
  onSearchChange,
  onCategoryChange,
  onProjectChange,
  editingId,
  onEdit,
  onAdd,
  onCancelEdit,
  onSaved,
}: {
  data: PCCStoreData;
  search: string;
  categoryFilter: string;
  projectFilter: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  editingId: string | null;
  onEdit: (id: string) => void;
  onAdd: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  const hasActiveProjects = data.projects.some((p) => !p.archived);
  const itemBeingEdited: PCCCostBudgetItem | null =
    !editingId ? null : editingId === "new" ? newCostBudgetItem() : data.cost_budget_items.find((b) => b.id === editingId) || null;

  function matches(b: PCCCostBudgetItem): boolean {
    if (categoryFilter && b.category !== categoryFilter) return false;
    if (projectFilter && b.project_id !== projectFilter) return false;
    if (search) {
      const haystack = ((b.name || "") + " " + (b.notes || "")).toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function handleDelete(b: PCCCostBudgetItem) {
    const linkedCount = actualsAgainst(data, b.id).length;
    const msg =
      'Delete budget item "' + b.name + '"?' +
      (linkedCount > 0 ? " " + linkedCount + " actual cost entry(ies) reference it — they'll be kept, just unlinked." : "");
    if (!window.confirm(msg)) return;
    deleteBudgetItem(b.id);
    onSaved();
  }

  const filtered = data.cost_budget_items.filter(matches);

  return (
    <>
      {itemBeingEdited ? (
        <BudgetForm key={editingId} isNew={editingId === "new"} item={itemBeingEdited} projects={data.projects} data={data} onCancel={onCancelEdit} onSaved={onSaved} />
      ) : null}

      <Toolbar
        tab="budget"
        search={search}
        onSearchChange={onSearchChange}
        categoryFilter={categoryFilter}
        onCategoryChange={onCategoryChange}
        projectFilter={projectFilter}
        onProjectChange={onProjectChange}
        projects={data.projects}
        actionsSlot={
          <button className="btn btn--primary" disabled={!hasActiveProjects} title={hasActiveProjects ? "" : "Add a project in Portfolio first"} onClick={onAdd}>
            + Add Budget Item
          </button>
        }
      />

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {data.cost_budget_items.length === 0
            ? hasActiveProjects
              ? "No budget items yet. Click “+ Add Budget Item” to log the first planned cost line."
              : "Add a project in Portfolio first, then set up a budget against it."
            : "No budget items match this search/filter."}
        </div>
      ) : (
        <div className="project-list">
          {filtered.map((b) => {
            const actualTotal = actualsAgainst(data, b.id).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
            const linkedActivity = b.activity_id ? data.activities.find((a) => a.id === b.activity_id) : null;
            return (
              <div key={b.id} className="project-entry">
                <div className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong>{b.name}</strong>
                    <br />
                    <span className="text-secondary" style={{ fontSize: 12 }}>
                      {CATEGORY_LABELS[b.category || ""]} · {projectName(data.projects, b.project_id)} · Planned {formatMoney(b.planned_amount)} · Actual so far{" "}
                      {formatMoney(actualTotal)}
                      {linkedActivity ? " · linked to “" + linkedActivity.name + "” (" + (linkedActivity.percent_complete || 0) + "% complete)" : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn--ghost" onClick={() => onEdit(b.id)}>
                      Edit
                    </button>
                    <button className="btn btn--ghost" onClick={() => handleDelete(b)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ActualsTab({
  data,
  search,
  categoryFilter,
  projectFilter,
  onSearchChange,
  onCategoryChange,
  onProjectChange,
  editingId,
  onEdit,
  onAdd,
  onCancelEdit,
  onSaved,
}: {
  data: PCCStoreData;
  search: string;
  categoryFilter: string;
  projectFilter: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  editingId: string | null;
  onEdit: (id: string) => void;
  onAdd: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  const hasActiveProjects = data.projects.some((p) => !p.archived);
  const entryBeingEdited: PCCCostActual | null =
    !editingId ? null : editingId === "new" ? newCostActual() : data.cost_actuals.find((a) => a.id === editingId) || null;

  function matches(a: PCCCostActual): boolean {
    if (categoryFilter && a.category !== categoryFilter) return false;
    if (projectFilter && a.project_id !== projectFilter) return false;
    if (search) {
      const haystack = ((a.description || "") + " " + (a.vendor || "") + " " + (a.invoice_ref || "")).toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function handleDelete(a: PCCCostActual) {
    if (!window.confirm('Delete this actual cost entry ("' + a.description + '")? This can\'t be undone.')) return;
    deleteActual(a.id);
    onSaved();
  }

  const filtered = data.cost_actuals
    .filter(matches)
    .slice()
    .sort((a, b) => ((b.date || "") < (a.date || "") ? -1 : (b.date || "") > (a.date || "") ? 1 : 0));

  return (
    <>
      {entryBeingEdited ? (
        <ActualForm key={editingId} isNew={editingId === "new"} entry={entryBeingEdited} projects={data.projects} data={data} onCancel={onCancelEdit} onSaved={onSaved} />
      ) : null}

      <Toolbar
        tab="actuals"
        search={search}
        onSearchChange={onSearchChange}
        categoryFilter={categoryFilter}
        onCategoryChange={onCategoryChange}
        projectFilter={projectFilter}
        onProjectChange={onProjectChange}
        projects={data.projects}
        actionsSlot={
          <button className="btn btn--primary" disabled={!hasActiveProjects} title={hasActiveProjects ? "" : "Add a project in Portfolio first"} onClick={onAdd}>
            + Log Actual Cost
          </button>
        }
      />

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {data.cost_actuals.length === 0
            ? hasActiveProjects
              ? "No actual costs logged yet. Click “+ Log Actual Cost” to record the first one."
              : "Add a project in Portfolio first, then log actual costs against it."
            : "No actual costs match this search/filter."}
        </div>
      ) : (
        <div className="project-list">
          {filtered.map((a) => {
            const linkedBudget = data.cost_budget_items.find((b) => b.id === a.budget_item_id);
            const linkedCommitment = data.commitments.find((c) => c.id === a.commitment_id);
            return (
              <div key={a.id} className="project-entry">
                <div className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong>{a.description}</strong>
                    <br />
                    <span className="text-secondary" style={{ fontSize: 12 }}>
                      {CATEGORY_LABELS[a.category || ""]} · {projectName(data.projects, a.project_id)} · {a.date} · {formatMoney(a.amount)}
                      {a.vendor ? " · " + a.vendor : ""}
                      {linkedBudget ? " · against “" + linkedBudget.name + "”" : ""}
                      {linkedCommitment ? " · commitment " + (linkedCommitment.po_contract_number || "(no PO/Contract #)") : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn--ghost" onClick={() => onEdit(a.id)}>
                      Edit
                    </button>
                    <button className="btn btn--ghost" onClick={() => handleDelete(a)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function SummaryTab({ data }: { data: PCCStoreData }) {
  const activeProjects = data.projects.filter((p) => !p.archived);
  const totals = activeProjects.reduce(
    (acc, p) => {
      const s = projectCostSummary(data, p.id);
      acc.budgeted += s.budgeted;
      acc.actual += s.actual;
      if (s.usingPortfolioBudget) acc.fallbackCount += 1;
      return acc;
    },
    { budgeted: 0, actual: 0, fallbackCount: 0 }
  );
  const totalVariance = totals.budgeted - totals.actual;

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-card__label">TOTAL BUDGETED</span>
          <span className="kpi-card__value mono">{formatMoney(totals.budgeted)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">TOTAL ACTUAL</span>
          <span className="kpi-card__value mono">{formatMoney(totals.actual)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">VARIANCE</span>
          <span className="kpi-card__value mono" style={{ color: totalVariance < 0 ? "var(--status-critical)" : "var(--status-on-track)" }}>
            {(totalVariance >= 0 ? "+" : "") + formatMoney(totalVariance)}
          </span>
        </div>
      </div>

      {totals.fallbackCount > 0 ? (
        <p className="text-secondary" style={{ fontSize: 12, marginTop: -10, marginBottom: 10 }}>
          {totals.fallbackCount} of {activeProjects.length} project(s) above use Portfolio's Budget field as a stand-in, since they have no Cost Tracking
          budget line items yet — add line items on the Budget tab for a more detailed number.
        </p>
      ) : null}

      {activeProjects.length === 0 ? (
        <div className="panel empty-state" style={{ marginTop: 16 }}>
          Add a project in Portfolio first to see cost summaries here.
        </div>
      ) : (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12 }}>By Project</h3>
          <div className="project-list">
            {activeProjects.map((p) => {
              const s = projectCostSummary(data, p.id);
              const pctUsed = s.budgeted > 0 ? Math.round((s.actual / s.budgeted) * 100) : null;
              return (
                <div key={p.id} className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong>{p.name || "(unnamed project)"}</strong>
                    <br />
                    <span className="text-secondary" style={{ fontSize: 12 }}>
                      Budgeted {formatMoney(s.budgeted)} · Actual {formatMoney(s.actual)}
                      {pctUsed !== null ? " (" + pctUsed + "% used)" : ""}
                      {s.usingPortfolioBudget ? " · from Portfolio's Budget field (no cost line items yet)" : ""}
                    </span>
                  </div>
                  <span className={"status-badge " + (s.variance < 0 ? "status-badge--critical" : "status-badge--on_track")}>
                    {(s.variance >= 0 ? "+" : "") + formatMoney(s.variance) + " variance"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function EvmTab({ data }: { data: PCCStoreData }) {
  const activeProjects = data.projects.filter((p) => !p.archived);

  if (activeProjects.length === 0) {
    return (
      <>
        <p className="text-secondary" style={{ fontSize: 12, marginBottom: 10 }}>
          Planned Value and Earned Value only reflect budget items linked to a Schedule activity (set on the Budget tab). Actual Cost always reflects
          everything logged, linked or not.
        </p>
        <div className="panel empty-state">Add a project in Portfolio first to see EVM here.</div>
      </>
    );
  }

  const perProject = activeProjects.map((p) => ({ project: p, evm: projectEvm(data, p.id) }));
  const totals = perProject.reduce(
    (acc, row) => {
      acc.bac += row.evm.bac;
      acc.ac += row.evm.ac;
      acc.pv += row.evm.pv;
      acc.ev += row.evm.ev;
      acc.linkedBac += row.evm.linkedBac;
      return acc;
    },
    { bac: 0, ac: 0, pv: 0, ev: 0, linkedBac: 0 }
  );
  const portfolioCpi = totals.ac > 0 && totals.linkedBac > 0 ? totals.ev / totals.ac : null;
  const portfolioSpi = totals.pv > 0 && totals.linkedBac > 0 ? totals.ev / totals.pv : null;
  const coveragePct = totals.bac > 0 ? Math.round((totals.linkedBac / totals.bac) * 100) : null;

  return (
    <>
      <p className="text-secondary" style={{ fontSize: 12, marginBottom: 10 }}>
        Planned Value and Earned Value only reflect budget items linked to a Schedule activity (set on the Budget tab). Actual Cost always reflects
        everything logged, linked or not.
      </p>

      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-card__label">EARNED VALUE</span>
          <span className="kpi-card__value mono">{formatMoney(totals.ev)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">ACTUAL COST</span>
          <span className="kpi-card__value mono">{formatMoney(totals.ac)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">CPI</span>
          <span className="kpi-card__value mono" style={{ color: portfolioCpi != null && portfolioCpi < 1 ? "var(--status-critical)" : "var(--status-on-track)" }}>
            {formatIndex(portfolioCpi)}
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-card__label">SPI</span>
          <span className="kpi-card__value mono" style={{ color: portfolioSpi != null && portfolioSpi < 1 ? "var(--status-critical)" : "var(--status-on-track)" }}>
            {formatIndex(portfolioSpi)}
          </span>
        </div>
      </div>

      {coveragePct !== null && coveragePct < 100 ? (
        <p className="text-secondary" style={{ fontSize: 12, marginTop: -10, marginBottom: 10 }}>
          {coveragePct}% of total budget across active projects is linked to schedule activities — the rest isn't reflected in these figures. Link budget
          items to activities on the Budget tab for full coverage.
        </p>
      ) : null}

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12 }}>By Project</h3>
        <div className="project-list">
          {perProject.map(({ project: p, evm }) => (
            <div key={p.id} className="detail-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{p.name || "(unnamed project)"}</strong>
                <br />
                <span className="text-secondary" style={{ fontSize: 12 }}>
                  EV {formatMoney(evm.ev)} · AC {formatMoney(evm.ac)} · PV {formatMoney(evm.pv)} · CPI {formatIndex(evm.cpi)} · SPI {formatIndex(evm.spi)}
                  {evm.eac != null ? " · EAC " + formatMoney(evm.eac) : ""}
                  {evm.coveragePct != null ? " · " + evm.coveragePct + "% linked" : " · nothing linked yet"}
                </span>
              </div>
              {evm.vac != null ? (
                <span className={"status-badge " + (evm.vac < 0 ? "status-badge--critical" : "status-badge--on_track")}>
                  {(evm.vac >= 0 ? "+" : "") + formatMoney(evm.vac) + " VAC"}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function CostPage({ initialProjectFilter }: { initialProjectFilter?: string }) {
  const [data, setData] = useState(() => getData());
  const [tab, setTab] = useState("budget");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState(() => {
    if (initialProjectFilter) return initialProjectFilter;
    const ctxProjectId = getProjectContext();
    return ctxProjectId && data.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingActualId, setEditingActualId] = useState<string | null>(null);

  function refresh() {
    setData(getData());
  }

  function handleProjectFilterChange(value: string) {
    setProjectFilter(value);
    if (value) setProjectContext(value);
  }

  function handleTabChange(key: string) {
    setTab(key);
    setEditingBudgetId(null);
    setEditingActualId(null);
  }

  return (
    <>
      <h2 style={{ marginBottom: 6 }}>Cost Tracking</h2>
      <p className="text-secondary" style={{ fontSize: 12, marginBottom: 16 }}>
        Budget line items vs. actual costs incurred, per project. No automatic link to Contract Value or Change Orders — reconciliation stays a manual,
        deliberate act.
      </p>

      <div className="tab-bar">
        {[
          { key: "budget", label: "Budget" },
          { key: "actuals", label: "Actuals" },
          { key: "summary", label: "Summary" },
          { key: "evm", label: "EVM" },
        ].map((t) => (
          <button key={t.key} className={"tab-btn" + (tab === t.key ? " tab-btn--active" : "")} onClick={() => handleTabChange(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "budget" ? (
          <BudgetTab
            data={data}
            search={search}
            categoryFilter={categoryFilter}
            projectFilter={projectFilter}
            onSearchChange={setSearch}
            onCategoryChange={setCategoryFilter}
            onProjectChange={handleProjectFilterChange}
            editingId={editingBudgetId}
            onEdit={setEditingBudgetId}
            onAdd={() => setEditingBudgetId("new")}
            onCancelEdit={() => setEditingBudgetId(null)}
            onSaved={() => {
              setEditingBudgetId(null);
              refresh();
            }}
          />
        ) : tab === "actuals" ? (
          <ActualsTab
            data={data}
            search={search}
            categoryFilter={categoryFilter}
            projectFilter={projectFilter}
            onSearchChange={setSearch}
            onCategoryChange={setCategoryFilter}
            onProjectChange={handleProjectFilterChange}
            editingId={editingActualId}
            onEdit={setEditingActualId}
            onAdd={() => setEditingActualId("new")}
            onCancelEdit={() => setEditingActualId(null)}
            onSaved={() => {
              setEditingActualId(null);
              refresh();
            }}
          />
        ) : tab === "summary" ? (
          <SummaryTab data={data} />
        ) : (
          <EvmTab data={data} />
        )}
      </div>
    </>
  );
}
