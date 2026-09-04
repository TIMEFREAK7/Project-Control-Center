/* Portfolio, migrated to React as part of the page-by-page migration (Post-Phase-5
 * Engineering Evolution — Batch F, the first of the "big four"). Reproduces the prior
 * vanilla page's exact text, field ids (field-*), button labels, and CSS class names
 * (panel/form-grid/field/project-card/project-details/detail-grid/detail-item__label/
 * kpi-grid/kpi-card/status-badge/card-menu/card-menu__dropdown/toolbar/btn) — same
 * visual result, only the implementation moved. See src/js/pages/portfolio.js (now a
 * small stub) for the router registration and the window.PCC.portfolio public API
 * (viewProject/filterByStatus) other still-vanilla pages depend on, preserved via the
 * same pending-prop channel established for other migrated pages' cross-page handoffs
 * — plus window.PCC.pendingProjectPrefill, a genuinely global (not per-module) handoff
 * Organizations' "+ New Project" flow already used before this migration, read directly
 * here rather than re-routed through the pending-prop channel.
 *
 * The Add/Edit Project form is UNCONTROLLED for its plain fields (read via
 * form.querySelector at submit time), except the Company/Client cascading pickers
 * (CompanyClientField) which must be controlled so Client's options can rescope when
 * Company changes, and the Document Requirements checklist (DocumentRequirementsField)
 * whose entire uncommitted selection is React state local to the form (replacing
 * vanilla's uiState.formSelectedDocTypeIds/formDueDates/formVendorIds/formActivityIds/
 * formLeadTimes module-level fields) — nothing is written to the store until Save,
 * matching the original page's exact "reconciled atomically with the project record"
 * behavior (see portfolioService.js's saveProject()).
 *
 * The Details panel's many "N items, list up to 5, View All" sections (Attachments,
 * Daily Logs, Risks, Meetings, RFIs, Change Orders) share one generic LinkedListSection
 * component instead of five hand-duplicated blocks — same visual output as the
 * vanilla page's five near-identical copies, just written once. Vendors/Cost/
 * Resources/Commitments stay separate components since each has genuinely different
 * behavior (an inline link picker, a cost summary line, an over-allocation flag, a
 * committed-value rollup).
 *
 * All store reads/writes go through portfolioService.js (master prompt §9); the
 * portfolio-wide KPI strip and Compare view's Schedule/Risk/Health columns call
 * executiveCenter.js's real health-score engine (never reimplemented here), while the
 * Cards view's own three "cheap" per-card stats (Schedule Health/Risk Level/Key
 * Milestone) deliberately stay CPM-engine-free, exactly matching the vanilla
 * page's own documented reasoning for why a portfolio list can't afford one CPM run
 * per card per keystroke.
 */
import React, { useState } from "react";
import {
  STATUS_LABELS,
  REVIEW_CADENCE_OPTIONS,
  REVIEW_CADENCE_LABELS,
  FIELD_CONFIG,
  DETAIL_FIELDS,
  REQUIREMENT_STATUS_BADGE,
  getData,
  formatMoney,
  distinctValues,
  todayIsoDate,
  computeRequirementStatus,
  activitiesForProject,
  computeSuggestedDueDate,
  projectIsUpcoming,
  computePortfolioKpis,
  getHealthSummary,
  getSchedulePerformanceSummary,
  computeScheduleHealthCheap,
  computeRiskLevel,
  computeKeyMilestoneCheap,
  projectCardStats,
  projectMatchesFilters,
  activeCompanies,
  activeClients,
  createCompany,
  createClient,
  newProject,
  saveProject,
  toggleArchive,
  isPinned,
  togglePin,
  buildDocReqState,
  activeDocumentTypes,
  projectTemplates,
  latestDocsForProject,
  openDocument,
  categoryLabel,
  exportArchive,
  linkVendor,
  unlinkVendor,
  openVendorProfile,
  projectCostSummary,
  portfolioOverAllocationSummary,
  viewWorkspace,
  viewExecutiveCenter,
  viewDailyLogs,
  viewRisks,
  viewMeetings,
  viewRfis,
  viewChangeOrders,
  viewVendors,
  viewCost,
  viewResources,
  viewCommitments,
} from "../services/portfolioService.js";

// ===== Company / Client cascading picker with inline "+ Add New…" =====

function CompanyClientField({ data, project }) {
  const [companies, setCompanies] = useState(() => activeCompanies(data, project.company_id));
  const [selectedCompanyId, setSelectedCompanyId] = useState(project.company_id || "");
  const [clients, setClients] = useState(() => activeClients(data, project.company_id, project.client_id));
  const [selectedClientId, setSelectedClientId] = useState(project.client_id || "");
  const [companyCreating, setCompanyCreating] = useState(false);
  const [companyNewName, setCompanyNewName] = useState("");
  const [clientCreating, setClientCreating] = useState(false);
  const [clientNewName, setClientNewName] = useState("");

  function handleCompanyChange(e) {
    const value = e.target.value;
    if (value === "__new__") {
      setCompanyCreating(true);
      return;
    }
    setCompanyCreating(false);
    setSelectedCompanyId(value);
    setSelectedClientId("");
    setClients(activeClients(data, value, ""));
  }

  function handleCreateCompany() {
    const name = companyNewName.trim();
    if (!name) return;
    const created = createCompany(name);
    data = getData();
    setCompanies(activeCompanies(data, created.id));
    setSelectedCompanyId(created.id);
    setClients(activeClients(data, created.id, ""));
    setSelectedClientId("");
    setCompanyCreating(false);
    setCompanyNewName("");
  }

  function handleClientChange(e) {
    const value = e.target.value;
    if (value === "__new__") {
      setClientCreating(true);
      return;
    }
    setClientCreating(false);
    setSelectedClientId(value);
  }

  function handleCreateClient() {
    const name = clientNewName.trim();
    if (!name) return;
    if (!selectedCompanyId) {
      window.PCC.notify("Choose or create a Company first.", "error");
      return;
    }
    const created = createClient(selectedCompanyId, name);
    data = getData();
    setClients(activeClients(data, selectedCompanyId, created.id));
    setSelectedClientId(created.id);
    setClientCreating(false);
    setClientNewName("");
  }

  return (
    <>
      <div className="field">
        <label htmlFor="field-company_id">Company</label>
        <select id="field-company_id" value={companyCreating ? "__new__" : selectedCompanyId} onChange={handleCompanyChange}>
          <option value="">(none)</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name + (c.archived ? " (archived)" : "")}
            </option>
          ))}
          <option value="__new__">+ Add New Company…</option>
        </select>
        {companyCreating ? (
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <input type="text" placeholder="New company name" value={companyNewName} onChange={(e) => setCompanyNewName(e.target.value)} />
            <button type="button" className="btn btn--ghost" onClick={handleCreateCompany}>
              Create
            </button>
          </div>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="field-client_id">Client</label>
        <select id="field-client_id" value={clientCreating ? "__new__" : selectedClientId} onChange={handleClientChange} disabled={!selectedCompanyId}>
          <option value="">(none)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name + (c.archived ? " (archived)" : "")}
            </option>
          ))}
          {selectedCompanyId ? <option value="__new__">+ Add New Client…</option> : null}
        </select>
        {clientCreating ? (
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <input type="text" placeholder="New client name" value={clientNewName} onChange={(e) => setClientNewName(e.target.value)} />
            <button type="button" className="btn btn--ghost" onClick={handleCreateClient}>
              Create
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

// ===== Document Requirements checklist (uncommitted, form-local state) =====

function DocumentRequirementsField({ data, project, docReq, setDocReq }) {
  const activeTypes = activeDocumentTypes();

  function toggleType(typeId, checked) {
    setDocReq((prev) => {
      const next = {
        selectedTypeIds: prev.selectedTypeIds.slice(),
        dueDates: Object.assign({}, prev.dueDates),
        vendorIds: Object.assign({}, prev.vendorIds),
        activityIds: Object.assign({}, prev.activityIds),
        leadTimes: Object.assign({}, prev.leadTimes),
        templateKey: prev.templateKey,
      };
      const idx = next.selectedTypeIds.indexOf(typeId);
      if (checked) {
        if (idx === -1) next.selectedTypeIds.push(typeId);
      } else if (idx !== -1) {
        next.selectedTypeIds.splice(idx, 1);
        delete next.dueDates[typeId];
        delete next.vendorIds[typeId];
        delete next.activityIds[typeId];
        delete next.leadTimes[typeId];
      }
      return next;
    });
  }

  function setField(mapName, typeId, value) {
    setDocReq((prev) => {
      const next = Object.assign({}, prev, { [mapName]: Object.assign({}, prev[mapName]) });
      if (value) next[mapName][typeId] = value;
      else delete next[mapName][typeId];
      return next;
    });
  }

  function applyTemplate() {
    const template = projectTemplates().find((t) => t.key === docReq.templateKey);
    if (!template) return;
    const matchedNames = {};
    template.suggested_type_names.forEach((n) => {
      matchedNames[n.toLowerCase()] = true;
    });
    const selectedSet = {};
    docReq.selectedTypeIds.forEach((id) => {
      selectedSet[id] = true;
    });
    const toAdd = activeTypes.filter((t) => matchedNames[(t.name || "").toLowerCase()] && !selectedSet[t.id]);
    if (toAdd.length === 0) {
      window.PCC.notify("Nothing new to add — every matching type from “" + template.label + "” is already selected.", "info");
      return;
    }
    setDocReq((prev) => ({
      selectedTypeIds: prev.selectedTypeIds.concat(toAdd.map((t) => t.id)),
      dueDates: Object.assign({}, prev.dueDates),
      vendorIds: Object.assign({}, prev.vendorIds),
      activityIds: Object.assign({}, prev.activityIds),
      leadTimes: Object.assign({}, prev.leadTimes),
      templateKey: prev.templateKey,
    }));
    window.PCC.notify("Added " + toAdd.length + " requirement(s) from “" + template.label + "”.", "success");
  }

  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--divider)" }}>
      <div className="detail-item__label">
        DOCUMENT REQUIREMENTS ({docReq.selectedTypeIds.length} of {activeTypes.length})
      </div>
      <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0 0" }}>
        Select which document types this project needs. Status updates automatically once a matching document is attached.
      </p>

      {activeTypes.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
          No active document types in the master repository yet — add some in Document Types first.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
            <select value={docReq.templateKey} onChange={(e) => setDocReq((prev) => Object.assign({}, prev, { templateKey: e.target.value }))}>
              <option value="">Apply a template…</option>
              {projectTemplates().map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn--ghost" onClick={applyTemplate}>
              Apply
            </button>
          </div>

          <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {Object.entries(
              activeTypes
                .slice()
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                .reduce((acc, t) => {
                  const cat = t.category || "(uncategorized)";
                  (acc[cat] = acc[cat] || []).push(t);
                  return acc;
                }, {})
            )
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([cat, types]) => (
                <div key={cat}>
                  <div className="text-secondary" style={{ fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
                    {cat.toUpperCase()}
                  </div>
                  {types.map((t) => {
                    const checked = docReq.selectedTypeIds.indexOf(t.id) !== -1;
                    const suggestedDate = computeSuggestedDueDate(data, docReq.activityIds[t.id], docReq.leadTimes[t.id]);
                    const status = computeRequirementStatus(data, project.id, t.id, docReq.dueDates[t.id] || null);
                    const badgeInfo = REQUIREMENT_STATUS_BADGE[status];
                    return (
                      <label key={t.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", padding: "2px 0" }}>
                        <input type="checkbox" checked={checked} onChange={(e) => toggleType(t.id, e.target.checked)} />
                        <span>
                          {t.name}
                          {t.code ? " (" + t.code + ")" : ""}
                        </span>
                        {checked ? (
                          <>
                            <input
                              type="date"
                              value={docReq.dueDates[t.id] || ""}
                              style={{ fontSize: "var(--text-sm)", padding: "2px var(--space-1)" }}
                              title="Planned submission date (optional)"
                              onChange={(e) => setField("dueDates", t.id, e.target.value)}
                            />
                            <select
                              value={docReq.vendorIds[t.id] || ""}
                              style={{ fontSize: "var(--text-sm)", padding: "2px var(--space-1)" }}
                              title="Vendor expected to submit this document (optional)"
                              onChange={(e) => setField("vendorIds", t.id, e.target.value)}
                            >
                              <option value="">(no vendor)</option>
                              {data.vendors.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.vendor_name || "(unnamed vendor)"}
                                </option>
                              ))}
                            </select>
                            <select
                              value={docReq.activityIds[t.id] || ""}
                              style={{ fontSize: "var(--text-sm)", padding: "2px var(--space-1)" }}
                              title="Linked Schedule activity (optional)"
                              onChange={(e) => setField("activityIds", t.id, e.target.value)}
                            >
                              <option value="">(none)</option>
                              {activitiesForProject(data, project.id).map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              placeholder="Lead days"
                              title="Lead time in days before the linked activity starts (optional)"
                              style={{ fontSize: "var(--text-sm)", padding: "2px var(--space-1)", width: 60 }}
                              value={docReq.leadTimes[t.id] || ""}
                              onChange={(e) => setField("leadTimes", t.id, e.target.value === "" ? "" : Number(e.target.value))}
                            />
                            {suggestedDate && suggestedDate !== (docReq.dueDates[t.id] || "") ? (
                              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                                Suggested: {suggestedDate}{" "}
                                <button
                                  type="button"
                                  className="btn btn--ghost"
                                  style={{ fontSize: "var(--text-xs)", padding: "1px 6px" }}
                                  onClick={() => setField("dueDates", t.id, suggestedDate)}
                                >
                                  Use
                                </button>
                              </span>
                            ) : null}
                            <span className={"status-badge status-badge--" + badgeInfo.className} style={{ fontSize: "var(--text-xs)" }}>
                              {badgeInfo.label}
                            </span>
                          </>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ===== Add/Edit Project form =====

function ProjectForm({ isNew, project, data, onCancel, onSaved }) {
  const [showError, setShowError] = useState(false);
  const [docReq, setDocReq] = useState(() => buildDocReqState(data, isNew ? null : project.id));

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const values = {};
    FIELD_CONFIG.forEach((cfg) => {
      const el = form.querySelector("#field-" + cfg.key);
      if (!el) return;
      if (cfg.type === "number" || cfg.type === "cadence_select") {
        values[cfg.key] = el.value === "" ? null : Number(el.value);
      } else {
        values[cfg.key] = el.value;
      }
    });
    if (!values.name || !values.name.trim()) {
      setShowError(true);
      return;
    }
    setShowError(false);

    const companySelectEl = form.querySelector("#field-company_id");
    const clientSelectEl = form.querySelector("#field-client_id");
    values.company_id = companySelectEl && companySelectEl.value !== "__new__" ? companySelectEl.value : "";
    values.client_id = clientSelectEl && clientSelectEl.value !== "__new__" ? clientSelectEl.value : "";

    saveProject(isNew, project.id, values, docReq);
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: "var(--space-4)" }}>
      <h3 style={{ marginBottom: "var(--space-4)" }}>{isNew ? "Add Project" : "Edit Project"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {FIELD_CONFIG.map((cfg) => (
            <React.Fragment key={cfg.key}>
              <div className="field">
                <label htmlFor={"field-" + cfg.key}>
                  {cfg.label}
                  {cfg.required ? " *" : ""}
                </label>
                {cfg.type === "select" ? (
                  <select id={"field-" + cfg.key} name={cfg.key} defaultValue={project[cfg.key] || "on_track"} required={cfg.required}>
                    {window.PCC.store.PROJECT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s] || s}
                      </option>
                    ))}
                  </select>
                ) : cfg.type === "cadence_select" ? (
                  <select id={"field-" + cfg.key} name={cfg.key} defaultValue={project[cfg.key] != null ? String(project[cfg.key]) : ""}>
                    <option value="">None</option>
                    {REVIEW_CADENCE_OPTIONS.map((days) => (
                      <option key={days} value={days}>
                        {REVIEW_CADENCE_LABELS[days]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={cfg.type}
                    id={"field-" + cfg.key}
                    name={cfg.key}
                    min={cfg.min}
                    max={cfg.max}
                    defaultValue={project[cfg.key] === null || project[cfg.key] === undefined ? "" : project[cfg.key]}
                    required={cfg.required}
                  />
                )}
              </div>
              {cfg.key === "project_code" ? <CompanyClientField data={data} project={project} /> : null}
            </React.Fragment>
          ))}
        </div>

        <DocumentRequirementsField data={data} project={project} docReq={docReq} setDocReq={setDocReq} />

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: "var(--text-sm)" }}>Project Name is required.</p> : null}

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Project" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ===== KPI strip =====

function KpiStrip({ kpis }) {
  const items = [
    { label: "TOTAL PROJECTS", value: kpis.total, colorVar: null },
    { label: "ACTIVE", value: kpis.active, colorVar: null },
    { label: "COMPLETED", value: kpis.completed, colorVar: null },
    { label: "AT RISK", value: kpis.atRisk, colorVar: kpis.atRisk > 0 ? "var(--status-at-risk)" : null },
    { label: "DELAYED", value: kpis.delayed, colorVar: kpis.delayed > 0 ? "var(--status-critical)" : null },
    { label: "UPCOMING", value: kpis.upcoming, colorVar: null },
    { label: "UNADDRESSED DELAY (DAYS)", value: kpis.unaddressedDelayDays, colorVar: kpis.unaddressedDelayDays > 0 ? "var(--status-critical)" : null },
  ];
  return (
    <div className="kpi-grid" style={{ marginBottom: "var(--space-4)" }}>
      {items.map((kpi) => (
        <div className="kpi-card" key={kpi.label}>
          <span className="kpi-card__label">{kpi.label}</span>
          <span className="kpi-card__value mono" style={kpi.colorVar ? { color: kpi.colorVar } : undefined}>
            {kpi.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ===== Compare view =====

var RAG_BADGE_CLASS = { on_track: "on_track", at_risk: "at_risk", critical: "critical", unknown: "info" };
var RAG_LABEL = { on_track: "On Track", at_risk: "At Risk", critical: "Critical", unknown: "—" };

function RagCell({ rag }) {
  return <span className={"status-badge status-badge--" + (RAG_BADGE_CLASS[rag] || "info")}>{RAG_LABEL[rag] || rag}</span>;
}

function CompareTable({ projects, onOpenDetails }) {
  if (projects.length === 0) {
    return <div className="panel empty-state">No projects match this search/filter.</div>;
  }
  return (
    <div className="panel">
      <table className="data-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Progress</th>
            <th>Schedule</th>
            <th>Risk</th>
            <th>Health</th>
            <th>Sched. Perf.</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const summary = getHealthSummary(p.id);
            const schedPerf = getSchedulePerformanceSummary(p.id);
            return (
              <tr key={p.id}>
                <td>
                  <button className="btn btn--ghost" onClick={() => onOpenDetails(p.id)}>
                    {p.name || "(unnamed project)"}
                  </button>
                </td>
                <td>{(p.progress || 0) + "%"}</td>
                <td>
                  <RagCell rag={summary.scheduleRag} />
                </td>
                <td>
                  <RagCell rag={summary.riskRag} />
                </td>
                <td>
                  <RagCell rag={summary.rag} />
                  {summary.score != null ? (
                    <span className="text-secondary" style={{ fontSize: "var(--text-xs)", marginLeft: "var(--space-2)" }}>
                      {summary.score}
                    </span>
                  ) : null}
                </td>
                <td>
                  <RagCell rag={schedPerf.rag} />
                  {schedPerf.score != null ? (
                    <span className="text-secondary" style={{ fontSize: "var(--text-xs)", marginLeft: "var(--space-2)" }}>
                      {schedPerf.score}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===== Project card =====

function ProjectCard({ p, data, expanded, menuOpen, onToggleDetails, onToggleMenu, onEdit, onArchive }) {
  const stats = projectCardStats(data, p.id);
  const scheduleHealth = computeScheduleHealthCheap(data, p.id);
  const riskLevel = computeRiskLevel(data, p.id);
  const keyMilestone = computeKeyMilestoneCheap(data, p.id);
  const progressPct = Math.max(0, Math.min(100, p.progress || 0));
  const pinnedNow = isPinned(p.id);

  return (
    <div className={"project-card" + (p.archived ? " project-card--archived" : "")}>
      <div className="project-card__main">
        <div className="project-card__name">{p.name || "(unnamed project)"}</div>
        <div className="project-card__meta">{[p.client, p.company, p.country].filter(Boolean).join(" · ")}</div>
      </div>

      <span className={"status-badge status-badge--" + p.status}>{STATUS_LABELS[p.status] || p.status}</span>

      <div className="progress-bar" style={{ minWidth: 160 }}>
        <div className="progress-bar__row">
          <span className="progress-bar__label">Progress</span>
          <span className="progress-bar__value">{progressPct}%</span>
        </div>
        <div className="progress-bar__track">
          <div className={"progress-bar__fill progress-fill--" + p.status} style={{ width: progressPct + "%" }} />
        </div>
      </div>

      <div className="project-card__figures">
        Budget {formatMoney(p.budget, p.currency)}
        <br />
        Finish {p.finish_date || "—"}
      </div>

      <div className="project-card__stats">
        <div className="card-stat">
          <span className="card-stat__label">Open Risks / Issues</span>
          <span className="card-stat__value">{stats.openRisks}</span>
        </div>
        <div className="card-stat">
          <span className="card-stat__label">Open RFIs / TQs</span>
          <span className="card-stat__value">{stats.openRfis}</span>
        </div>
        <div className="card-stat">
          <span className="card-stat__label">Documents</span>
          <span className="card-stat__value">
            {stats.docsAvailable}/{stats.docsTotal}
          </span>
        </div>
        <div className="card-stat">
          <span className="card-stat__label">Schedule Health</span>
          <span className="card-stat__value card-stat__value--text" style={scheduleHealth === "Behind Schedule" ? { color: "var(--status-at-risk)" } : undefined}>
            {scheduleHealth}
          </span>
        </div>
        <div className="card-stat">
          <span className="card-stat__label">Risk Level</span>
          <span
            className="card-stat__value card-stat__value--text"
            style={riskLevel === "High" ? { color: "var(--status-critical)" } : riskLevel === "Medium" ? { color: "var(--status-at-risk)" } : undefined}
          >
            {riskLevel}
          </span>
        </div>
        <div className="card-stat">
          <span className="card-stat__label">Key Milestone</span>
          <span className="card-stat__value card-stat__value--text">
            {keyMilestone ? (keyMilestone.name || "(unnamed milestone)") + " · " + keyMilestone.date : "None scheduled"}
          </span>
        </div>
      </div>

      <div className="project-card__actions">
        <button className="btn btn--primary" onClick={() => viewWorkspace(p.id)}>
          Open Workspace
        </button>
        <button className="btn btn--ghost" onClick={() => viewExecutiveCenter(p.id)}>
          Executive Center
        </button>
        <button className="btn btn--ghost" onClick={onToggleDetails}>
          {expanded ? "Hide Details" : "Details"}
        </button>

        <div className="card-menu">
          <button className="icon-btn" aria-label="More actions" onClick={onToggleMenu}>
            ⋯
          </button>
          {menuOpen ? (
            <>
              <button className="card-menu__overlay" aria-label="Close menu" onClick={onToggleMenu} />
              <div className="card-menu__dropdown">
                <button className="card-menu__item" onClick={onEdit}>
                  Edit
                </button>
                <button
                  className="card-menu__item"
                  onClick={() => {
                    togglePin(p.id);
                    onToggleMenu();
                  }}
                >
                  {pinnedNow ? "Unpin" : "Pin"}
                </button>
                <button className="card-menu__item" onClick={onArchive}>
                  {p.archived ? "Unarchive" : "Archive"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ===== Generic "N items, up to 5, View All" section =====

function LinkedListSection({ label, items, renderRow, emptyText, onViewAll, extraHeaderButton }) {
  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--divider)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="detail-item__label">
          {label} ({items.length})
        </span>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {extraHeaderButton}
          {items.length > 0 && onViewAll ? (
            <button className="btn btn--ghost" onClick={onViewAll}>
              View All
            </button>
          ) : null}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
          {emptyText}
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>{items.slice(0, 5).map(renderRow)}</div>
          {items.length > 5 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
              +{items.length - 5} more — View All to see the rest.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

// ===== Vendors section (special-case: inline link picker) =====

var VENDOR_CONTRACT_LABELS = { draft: "Draft", active: "Active", completed: "Completed", terminated: "Terminated" };

function VendorsSection({ p, data, onChanged }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const links = data.vendor_project_links.filter((l) => l.project_id === p.id);
  const unlinkedVendors = data.vendors.filter((v) => !links.some((l) => l.vendor_id === v.id));
  const [pickedVendorId, setPickedVendorId] = useState(unlinkedVendors[0] ? unlinkedVendors[0].id : "");

  function handleLink() {
    linkVendor(p.id, pickedVendorId || (unlinkedVendors[0] && unlinkedVendors[0].id));
    setPickerOpen(false);
    onChanged();
  }

  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--divider)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="detail-item__label">VENDORS ({links.length})</span>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            className="btn btn--ghost"
            disabled={unlinkedVendors.length === 0}
            title={unlinkedVendors.length === 0 ? (data.vendors.length === 0 ? "Add a vendor in Vendor Management first" : "Every vendor is already linked to this project") : ""}
            onClick={() => {
              setPickedVendorId(unlinkedVendors[0] ? unlinkedVendors[0].id : "");
              setPickerOpen(true);
            }}
          >
            + Link Vendor
          </button>
          {links.length > 0 ? (
            <button className="btn btn--ghost" onClick={() => viewVendors(p.id)}>
              View All
            </button>
          ) : null}
        </div>
      </div>

      {pickerOpen ? (
        <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <select value={pickedVendorId} onChange={(e) => setPickedVendorId(e.target.value)}>
            {unlinkedVendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor_name || "(unnamed vendor)"}
              </option>
            ))}
          </select>
          <button className="btn btn--primary" onClick={handleLink}>
            Link
          </button>
          <button className="btn btn--ghost" onClick={() => setPickerOpen(false)}>
            Cancel
          </button>
        </div>
      ) : null}

      {links.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
          No vendors linked to this project yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          {links.slice(0, 5).map((link) => {
            const vendor = data.vendors.find((v) => v.id === link.vendor_id);
            return (
              <div key={link.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", gap: "var(--space-2)" }}>
                <button
                  className="btn btn--ghost"
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "2px var(--space-2)" }}
                  disabled={!vendor}
                  onClick={() => openVendorProfile(link.vendor_id)}
                >
                  {(vendor ? vendor.vendor_name || "(unnamed vendor)" : "(deleted vendor)") + (link.role ? " — " + link.role : "")}
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
                  <span
                    className={
                      "status-badge " +
                      (link.contract_status === "active" ? "status-badge--on_track" : link.contract_status === "terminated" ? "status-badge--critical" : "status-badge--info")
                    }
                  >
                    {VENDOR_CONTRACT_LABELS[link.contract_status] || link.contract_status}
                  </span>
                  <button
                    className="btn btn--ghost"
                    style={{ padding: "2px var(--space-2)" }}
                    onClick={() => {
                      unlinkVendor(link.id);
                      onChanged();
                    }}
                  >
                    Unlink
                  </button>
                </div>
              </div>
            );
          })}
          {links.length > 5 ? (
            <p className="text-secondary" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
              +{links.length - 5} more — View All to see the rest.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ===== Document requirements read-only summary =====

function DocumentRequirementsSummary({ p, data, onEdit }) {
  const typesById = {};
  data.document_types.forEach((t) => (typesById[t.id] = t));
  const vendorsById = {};
  data.vendors.forEach((v) => (vendorsById[v.id] = v));
  const activitiesById = {};
  data.activities.forEach((a) => (activitiesById[a.id] = a));
  const scheduleNameById = {};
  data.schedules.forEach((s) => (scheduleNameById[s.id] = s.name));

  const requirements = data.project_document_requirements.filter((r) => r.project_id === p.id && typesById[r.document_type_id]);
  const availableCount = requirements.filter((r) => computeRequirementStatus(data, p.id, r.document_type_id, r.planned_submission_date) === "available").length;
  const overdueCount = requirements.filter((r) => computeRequirementStatus(data, p.id, r.document_type_id, r.planned_submission_date) === "overdue").length;

  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--divider)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <span className="detail-item__label">
          DOCUMENT REQUIREMENTS ({availableCount} of {requirements.length} available{overdueCount > 0 ? ", " + overdueCount + " overdue" : ""})
        </span>
        <button className="btn btn--ghost" onClick={onEdit}>
          Edit Requirements
        </button>
      </div>

      {requirements.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
          No document requirements selected yet. Click “Edit Requirements” to choose which document types this project needs.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          {requirements
            .slice()
            .sort((a, b) => (typesById[a.document_type_id].name || "").localeCompare(typesById[b.document_type_id].name || ""))
            .map((r) => {
              const t = typesById[r.document_type_id];
              const vendor = r.vendor_id ? vendorsById[r.vendor_id] : null;
              const linkedActivity = r.activity_id ? activitiesById[r.activity_id] : null;
              const status = computeRequirementStatus(data, p.id, r.document_type_id, r.planned_submission_date);
              const badgeInfo = REQUIREMENT_STATUS_BADGE[status];
              return (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)" }}>
                  <span>
                    {t.name}
                    {t.code ? " (" + t.code + ")" : ""}
                    {r.planned_submission_date ? " — due " + r.planned_submission_date : ""}
                    {vendor ? " — " + (vendor.vendor_name || "(unnamed vendor)") : ""}
                    {linkedActivity
                      ? " — linked to " +
                        (scheduleNameById[linkedActivity.schedule_id] || "(schedule)") +
                        ": " +
                        (linkedActivity.name || "(unnamed activity)") +
                        (r.lead_time_days ? " (" + r.lead_time_days + "d lead time)" : "")
                      : ""}
                  </span>
                  <span className={"status-badge status-badge--" + badgeInfo.className} style={{ fontSize: "var(--text-xs)" }}>
                    {badgeInfo.label}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ===== Cost / Resources / Commitments sections =====

function CostSection({ p, data }) {
  const summary = projectCostSummary(data, p.id);
  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--divider)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="detail-item__label">COST TRACKING</span>
        <button className="btn btn--ghost" onClick={() => viewCost(p.id)}>
          View All
        </button>
      </div>
      {summary.budgeted === 0 && summary.actual === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
          No budget items or actual costs logged for this project yet.
        </p>
      ) : (
        <p style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
          Budgeted {formatMoney(summary.budgeted)} · Actual {formatMoney(summary.actual)} ·{" "}
          <span style={{ color: summary.variance < 0 ? "var(--status-critical)" : "var(--status-on-track)" }}>
            {(summary.variance >= 0 ? "+" : "") + formatMoney(summary.variance)} variance
          </span>
          {summary.usingPortfolioBudget ? (
            <>
              <br />
              <span className="text-secondary" style={{ fontSize: 11 }}>
                Budgeted from this project's Budget field — no Cost Tracking line items yet.
              </span>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

function ResourcesAssignedSection({ p, data }) {
  if (!window.PCC.resourceLevelingEngine || data.resources.length === 0) return null;
  const projectActivityIds = {};
  data.activities.forEach((a) => {
    if (a.project_id === p.id) projectActivityIds[a.id] = true;
  });
  const projectAssignments = data.resource_assignments.filter((a) => projectActivityIds[a.activity_id]);

  const overAllocById = {};
  if (projectAssignments.length > 0) {
    portfolioOverAllocationSummary(data).forEach((s) => {
      overAllocById[s.resourceId] = s;
    });
  }
  const seenResourceIds = {};
  const rows = [];
  projectAssignments.forEach((a) => {
    if (seenResourceIds[a.resource_id]) return;
    seenResourceIds[a.resource_id] = true;
    const resource = data.resources.find((r) => r.id === a.resource_id);
    if (resource) rows.push(resource);
  });

  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--divider)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="detail-item__label">RESOURCES ASSIGNED</span>
        <button className="btn btn--ghost" onClick={() => viewResources(p.id)}>
          View All
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
          No resources assigned to this project's activities yet.
        </p>
      ) : (
        rows.map((resource) => {
          const overAlloc = overAllocById[resource.id];
          return (
            <p key={resource.id} style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
              {resource.name || "(unnamed resource)"}
              {overAlloc ? (
                <span style={{ color: "var(--status-critical)" }}> — over-allocated {overAlloc.overAllocatedDayCount} day(s) (portfolio-wide)</span>
              ) : null}
            </p>
          );
        })
      )}
    </div>
  );
}

function CommitmentsSection({ p, data }) {
  const commitments = data.commitments.filter((c) => c.project_id === p.id);
  if (commitments.length === 0 || !window.PCC.commitments) return null;
  const totalCommitted = commitments.reduce((sum, c) => sum + (Number(c.committed_value) || 0), 0);
  return (
    <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--divider)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="detail-item__label">COMMITMENTS ({commitments.length})</span>
        <button className="btn btn--ghost" onClick={() => viewCommitments(p.id)}>
          View All
        </button>
      </div>
      <p style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>
        Total Committed {formatMoney(totalCommitted)} across {commitments.length} commitment(s).
      </p>
    </div>
  );
}

// ===== Project details panel =====

function ProjectDetails({ p, data, onChanged, onEditRequirements }) {
  const attachedDocs = latestDocsForProject(data, p.id);
  const projectLogs = data.daily_logs.filter((d) => d.project_id === p.id).slice().sort((a, b) => b.log_date.localeCompare(a.log_date));
  const projectRisks = data.risks.filter((r) => r.project_id === p.id && r.status !== "closed");
  const projectMeetings = data.meetings.filter((m) => m.project_id === p.id).slice().sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
  const projectRfis = data.rfis.filter((r) => r.project_id === p.id && r.status !== "closed");
  const projectChangeOrders = data.change_orders.filter((co) => co.project_id === p.id && co.status !== "closed" && co.status !== "rejected");
  const today = todayIsoDate();

  return (
    <div className="project-details">
      <div className="detail-grid">
        {DETAIL_FIELDS.map((cfg) => {
          const raw = p[cfg.key];
          const value = cfg.money ? formatMoney(raw, p.currency) : raw && String(raw).trim() ? raw : "—";
          return (
            <div key={cfg.key}>
              <span className="detail-item__label">{cfg.label}</span>
              <span className="detail-item__value mono">{value}</span>
            </div>
          );
        })}
      </div>

      <LinkedListSection
        label="ATTACHMENTS"
        items={attachedDocs}
        emptyText="No documents attached to this project yet."
        onViewAll={attachedDocs.length > 0 ? () => exportArchive(p, data.documents) : null}
        extraHeaderButton={
          attachedDocs.length > 0 ? (
            <button className="btn btn--ghost" onClick={() => exportArchive(p, data.documents)}>
              Export Archive
            </button>
          ) : null
        }
        renderRow={(doc) => (
          <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)" }}>
            <span>
              {doc.filename} · {categoryLabel(doc.category)}
            </span>
            <button className="btn btn--ghost" onClick={() => openDocument(doc)}>
              Open File
            </button>
          </div>
        )}
      />

      <DocumentRequirementsSummary p={p} data={data} onEdit={onEditRequirements} />

      <LinkedListSection
        label="DAILY LOGS"
        items={projectLogs}
        emptyText="No daily log entries yet for this project."
        onViewAll={() => viewDailyLogs(p.id)}
        renderRow={(log) => (
          <div key={log.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)" }}>
            <span className="mono">{log.log_date}</span>
            {log.incidents && log.incidents.trim() ? (
              <span className="status-badge status-badge--critical">Incident</span>
            ) : (
              <span className="status-badge status-badge--on_track">No incidents</span>
            )}
          </div>
        )}
      />

      <LinkedListSection
        label="OPEN RISKS / ISSUES"
        items={projectRisks}
        emptyText="No open risks or issues for this project."
        onViewAll={() => viewRisks(p.id)}
        renderRow={(r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", gap: "var(--space-2)" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || "(untitled)"}</span>
          </div>
        )}
      />

      <LinkedListSection
        label="MEETINGS"
        items={projectMeetings}
        emptyText="No meetings logged yet for this project."
        onViewAll={() => viewMeetings(p.id)}
        renderRow={(m) => {
          const overdueInMeeting = m.actions.filter((a) => a.status === "open" && a.due_date && a.due_date < today).length;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", gap: "var(--space-2)" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.meeting_date} — {m.title || "(untitled)"}
              </span>
              {overdueInMeeting > 0 ? <span className="status-badge status-badge--critical">{overdueInMeeting} Overdue</span> : null}
            </div>
          );
        }}
      />

      <LinkedListSection
        label="OPEN RFIs / TQs"
        items={projectRfis}
        emptyText="No open RFIs or Technical Queries for this project."
        onViewAll={() => viewRfis(p.id)}
        renderRow={(r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", gap: "var(--space-2)" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.number} — {r.subject || "(untitled)"}
            </span>
            {r.status === "open" && r.date_required && r.date_required < today ? <span className="status-badge status-badge--critical">Overdue</span> : null}
          </div>
        )}
      />

      <LinkedListSection
        label="OPEN CHANGE ORDERS"
        items={projectChangeOrders}
        emptyText="No open Change Orders for this project."
        onViewAll={() => viewChangeOrders(p.id)}
        renderRow={(co) => (
          <div key={co.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", gap: "var(--space-2)" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {co.number} — {co.title || "(untitled)"}
            </span>
            <span className={"status-badge " + (co.status === "approved" ? "status-badge--on_track" : "status-badge--info")}>
              {co.status === "approved" ? "Approved" : "Pending"}
            </span>
          </div>
        )}
      />

      <VendorsSection p={p} data={data} onChanged={onChanged} />
      <CostSection p={p} data={data} />
      <ResourcesAssignedSection p={p} data={data} />
      <CommitmentsSection p={p} data={data} />
    </div>
  );
}

// ===== Project entry (card + optional details) =====

function ProjectEntry({ p, data, expanded, menuOpen, onToggleDetails, onToggleMenu, onEdit, onArchive, onChanged, onEditRequirements }) {
  return (
    <div className="project-entry">
      <ProjectCard p={p} data={data} expanded={expanded} menuOpen={menuOpen} onToggleDetails={onToggleDetails} onToggleMenu={onToggleMenu} onEdit={onEdit} onArchive={onArchive} />
      {expanded ? <ProjectDetails p={p} data={data} onChanged={onChanged} onEditRequirements={onEditRequirements} /> : null}
    </div>
  );
}

// ===== Top-level page =====

export default function PortfolioPage({ initialExpandedId, initialStatusFilter }) {
  const [data, setData] = useState(() => getData());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || "");
  const [healthFilter, setHealthFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [pmFilter, setPmFilter] = useState("");
  const [plannerFilter, setPlannerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState("cards");
  const pendingPrefill = window.PCC.pendingProjectPrefill;
  const [editingId, setEditingId] = useState(() => (pendingPrefill ? "new" : null));
  const [expandedId, setExpandedId] = useState(initialExpandedId || null);
  const [openMenuId, setOpenMenuId] = useState(null);
  if (pendingPrefill) window.PCC.pendingProjectPrefill = null;

  function refresh() {
    setData(getData());
  }

  const filters = { search, statusFilter, healthFilter, clientFilter, countryFilter, locationFilter, sectorFilter, pmFilter, plannerFilter, typeFilter, yearFilter, showArchived };
  const filtered = data.projects.filter((p) => projectMatchesFilters(p, data, filters));
  const kpis = computePortfolioKpis(data);

  const projectBeingEdited = !editingId ? null : editingId === "new" ? newProject(pendingPrefill || {}) : data.projects.find((p) => p.id === editingId);

  function handleArchive(p) {
    toggleArchive(p.id);
    setOpenMenuId(null);
    refresh();
  }

  function openEditRequirements(projectId) {
    setEditingId(projectId);
  }

  return (
    <>
      <h2 style={{ marginBottom: "var(--space-4)" }}>Portfolio</h2>

      <KpiStrip kpis={kpis} />

      {projectBeingEdited ? (
        <ProjectForm
          key={editingId}
          isNew={editingId === "new"}
          project={projectBeingEdited}
          data={data}
          onCancel={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar">
        <input type="text" placeholder="Search by name, client, company, location, sector, PM, or planner…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {window.PCC.store.PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)}>
          <option value="">All health</option>
          <option value="On Schedule">On Schedule</option>
          <option value="Behind Schedule">Behind Schedule</option>
        </select>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">All clients</option>
          {distinctValues(data.projects, "client").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
          <option value="">All countries</option>
          {distinctValues(data.projects, "country").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
          <option value="">All locations</option>
          {distinctValues(data.projects, "location").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
          <option value="">All sectors</option>
          {distinctValues(data.projects, "sector").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={pmFilter} onChange={(e) => setPmFilter(e.target.value)}>
          <option value="">All PMs</option>
          {distinctValues(data.projects, "project_manager").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={plannerFilter} onChange={(e) => setPlannerFilter(e.target.value)}>
          <option value="">All planners</option>
          {distinctValues(data.projects, "planner").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {distinctValues(data.projects, "project_type").map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="">All years</option>
          {Array.from(new Set(data.projects.filter((p) => p.start_date).map((p) => p.start_date.slice(0, 4))))
            .sort()
            .map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <div className="toolbar__spacer" />
        {[
          { key: "cards", label: "Cards" },
          { key: "compare", label: "Compare" },
        ].map((v) => (
          <button key={v.key} className={"btn " + (view === v.key ? "btn--primary" : "btn--ghost")} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
        <button
          className="btn btn--primary"
          onClick={() => {
            setEditingId("new");
          }}
        >
          + Add Project
        </button>
      </div>

      {view === "compare" ? (
        <CompareTable
          projects={filtered}
          onOpenDetails={(id) => {
            setExpandedId(id);
            setView("cards");
          }}
        />
      ) : filtered.length === 0 ? (
        <div className="panel empty-state">{data.projects.length === 0 ? "No projects yet. Click “+ Add Project” to create your first one." : "No projects match this search/filter."}</div>
      ) : (
        <div className="project-list">
          {filtered.map((p) => (
            <ProjectEntry
              key={p.id}
              p={p}
              data={data}
              expanded={expandedId === p.id}
              menuOpen={openMenuId === p.id}
              onToggleDetails={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onToggleMenu={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
              onEdit={() => {
                setEditingId(p.id);
                setOpenMenuId(null);
              }}
              onArchive={() => handleArchive(p)}
              onChanged={refresh}
              onEditRequirements={() => openEditRequirements(p.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
