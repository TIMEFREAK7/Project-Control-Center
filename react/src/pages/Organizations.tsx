/* Companies & Clients (Company/Client/Project Management redesign — CLAUDE.md spec),
 * migrated to React as part of the page-by-page migration (Post-Phase-5 Engineering
 * Evolution).
 *
 * Reproduces the prior vanilla page's exact text, button labels, and CSS class names
 * (panel/form-grid/field/detail-card/toolbar/btn/btn--primary/btn--ghost/text-secondary/
 * status-badge/empty-state) — same visual result and DOM shape (company card is a
 * top-level .panel whose FIRST child is the header row holding its Archive button, same
 * as tests/test_company_client_project_management_e2e.js expects via
 * `fabsPanel.children[0]`), only the implementation moved.
 *
 * Same "archive, never delete" pattern every other register in this app follows — there
 * is deliberately no delete action here (spec point 14).
 *
 * All store reads/writes go through organizationsService.js (master prompt §9). The
 * "+ New Project" handoff preserves the exact window.PCC.pendingProjectPrefill + router.go
 * global mechanism the still-vanilla Portfolio page depends on.
 */
import React, { useState } from "react";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  getData,
  clientsOf,
  projectsOf,
  newCompany,
  newClient,
  saveCompany,
  saveClient,
  toggleCompanyArchived,
  toggleClientArchived,
  openProjectWorkspace,
  newProjectHandoff,
} from "../services/organizationsService";
import type { PCCCompany, PCCClient, PCCProject, PCCStoreData } from "../types/pcc";

function CompanyForm({
  isNew,
  company,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  company: PCCCompany;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(company.name || "");
  const [notes, setNotes] = useState(company.notes || "");
  const [showError, setShowError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setShowError(true);
      return;
    }
    setShowError(false);
    saveCompany(isNew, company.id, { name: trimmedName, notes: notes });
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 16 }}>{isNew ? "Add Company" : "Edit Company"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cofield-name">Name *</label>
            <input id="cofield-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cofield-notes">Notes</label>
          <textarea id="cofield-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {showError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Name is required.</p> : null}
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Company" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ClientForm({
  isNew,
  client,
  company,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  client: PCCClient;
  company: PCCCompany;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(client.name || "");
  const [notes, setNotes] = useState(client.notes || "");
  const [showError, setShowError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setShowError(true);
      return;
    }
    setShowError(false);
    saveClient(isNew, client.id, company.id, { name: trimmedName, notes: notes });
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16, marginTop: 12 }}>
      <h3 style={{ marginBottom: 8 }}>{isNew ? "Add Client" : "Edit Client"}</h3>
      <p className="text-secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        Company: {company.name || "(unnamed company)"}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="clfield-name">Name *</label>
            <input id="clfield-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="clfield-notes">Notes</label>
          <textarea id="clfield-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {showError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Name is required.</p> : null}
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Client" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ProjectRow({ p, onOpen }: { p: PCCProject; onOpen: () => void }) {
  return (
    <div
      className="detail-card"
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6, opacity: p.archived ? 0.6 : 1 }}
    >
      <div>
        <strong>{p.name || "(unnamed project)"}</strong>
        {p.archived ? (
          <span className="text-secondary" style={{ fontSize: 12 }}>
            {" "}
            (archived)
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className={"status-badge status-badge--" + (STATUS_BADGE_CLASS[p.status || ""] || "info")}>
          {STATUS_LABELS[p.status || ""] || p.status}
        </span>
        <button type="button" className="btn btn--ghost" onClick={onOpen}>
          Open
        </button>
      </div>
    </div>
  );
}

function ClientCard({
  client,
  company,
  data,
  onEdit,
  onToggleArchive,
  onNewProject,
}: {
  client: PCCClient;
  company: PCCCompany;
  data: PCCStoreData;
  onEdit: () => void;
  onToggleArchive: () => void;
  onNewProject: () => void;
}) {
  const projects = projectsOf(data, company.id, client.id);
  const activeProjectCount = projects.filter((p) => !p.archived).length;

  return (
    <div className="detail-card" style={{ marginBottom: 12, opacity: client.archived ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <strong>{client.name || "(unnamed client)"}</strong>
          {client.archived ? (
            <span className="text-secondary" style={{ fontSize: 12 }}>
              {" "}
              (archived)
            </span>
          ) : null}
          <span className="text-secondary" style={{ fontSize: 12 }}>
            {" "}
            &middot; {activeProjectCount} active project{activeProjectCount === 1 ? "" : "s"}
            {projects.length !== activeProjectCount ? ", " + (projects.length - activeProjectCount) + " archived" : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn--ghost" title={"Create a project under " + company.name + " → " + client.name} onClick={onNewProject}>
            + New Project
          </button>
          <button type="button" className="btn btn--ghost" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="btn btn--ghost" onClick={onToggleArchive}>
            {client.archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>
      {projects.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          {projects.map((p) => (
            <ProjectRow key={p.id} p={p} onOpen={() => openProjectWorkspace(p.id)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompanyCard({
  company,
  data,
  expanded,
  showArchived,
  editingClient,
  onToggleExpand,
  onAddClient,
  onEditCompany,
  onToggleCompanyArchive,
  onEditClient,
  onToggleClientArchive,
  onCancelClientForm,
  onClientSaved,
  onNewProject,
}: {
  company: PCCCompany;
  data: PCCStoreData;
  expanded: boolean;
  showArchived: boolean;
  editingClient: { companyId: string; id: string } | null;
  onToggleExpand: () => void;
  onAddClient: () => void;
  onEditCompany: () => void;
  onToggleCompanyArchive: () => void;
  onEditClient: (companyId: string, clientId: string) => void;
  onToggleClientArchive: (clientId: string, wasArchived: boolean | undefined) => void;
  onCancelClientForm: () => void;
  onClientSaved: () => void;
  onNewProject: (companyId: string, clientId: string) => void;
}) {
  const clients = clientsOf(data, company.id);
  const activeClientCount = clients.filter((c) => !c.archived).length;
  const visibleClients = showArchived ? clients : clients.filter((c) => !c.archived);

  const clientBeingEdited = editingClient
    ? editingClient.id === "new"
      ? newClient({ company_id: company.id })
      : clients.find((c) => c.id === editingClient.id)
    : null;

  return (
    <div className="panel" style={{ marginBottom: 16, opacity: company.archived ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <button type="button" className="btn btn--ghost" style={{ fontWeight: 600, fontSize: "var(--text-md)" }} onClick={onToggleExpand}>
            {(expanded ? "▾ " : "▸ ") + (company.name || "(unnamed company)")}
          </button>
          <span className="text-secondary" style={{ fontSize: 12, marginLeft: 8 }}>
            {activeClientCount} active client{activeClientCount === 1 ? "" : "s"}
            {clients.length !== activeClientCount ? ", " + (clients.length - activeClientCount) + " archived" : ""}
            {company.archived ? " · ARCHIVED" : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn--ghost" onClick={onAddClient}>
            + Add Client
          </button>
          <button type="button" className="btn btn--ghost" onClick={onEditCompany}>
            Edit
          </button>
          <button type="button" className="btn btn--ghost" onClick={onToggleCompanyArchive}>
            {company.archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>

      {clientBeingEdited && editingClient ? (
        <ClientForm
          key={editingClient.id}
          isNew={editingClient.id === "new"}
          client={clientBeingEdited}
          company={company}
          onCancel={onCancelClientForm}
          onSaved={onClientSaved}
        />
      ) : null}

      {expanded ? (
        <div style={{ marginTop: 12 }}>
          {visibleClients.length === 0 ? (
            <p className="text-secondary" style={{ fontSize: 13 }}>
              No clients yet under this company. Click &#8220;+ Add Client&#8221; to add the first one.
            </p>
          ) : (
            visibleClients.map((c) => (
              <ClientCard
                key={c.id}
                client={c}
                company={company}
                data={data}
                onEdit={() => onEditClient(company.id, c.id)}
                onToggleArchive={() => onToggleClientArchive(c.id, c.archived)}
                onNewProject={() => onNewProject(company.id, c.id)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function UnassignedSection({ data }: { data: PCCStoreData }) {
  const unassigned = data.projects.filter((p) => !p.company_id && !p.archived);
  if (unassigned.length === 0) return null;
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 8 }}>Projects Without a Company Assigned ({unassigned.length})</h3>
      <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
        Assign these to a Company/Client from Portfolio's Edit Project form whenever convenient — nothing requires it.
      </p>
      {unassigned.map((p) => (
        <ProjectRow key={p.id} p={p} onOpen={() => openProjectWorkspace(p.id)} />
      ))}
    </div>
  );
}

export default function OrganizationsPage() {
  const [data, setData] = useState(() => getData());
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null); // company id, "new", or null
  const [editingClient, setEditingClient] = useState<{ companyId: string; id: string } | null>(null); // { companyId, id } or null
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<{ [companyId: string]: boolean }>({});
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  function refresh() {
    setData(getData());
  }

  const companyBeingEdited = !editingCompanyId
    ? null
    : editingCompanyId === "new"
    ? newCompany({})
    : data.companies.find((c) => c.id === editingCompanyId);

  function handleToggleExpand(companyId: string) {
    setExpandedCompanyIds((prev) => Object.assign({}, prev, { [companyId]: !prev[companyId] }));
  }

  function handleAddClient(companyId: string) {
    setEditingClient({ companyId: companyId, id: "new" });
    setExpandedCompanyIds((prev) => Object.assign({}, prev, { [companyId]: true }));
  }

  function handleEditClient(companyId: string, clientId: string) {
    setEditingClient({ companyId: companyId, id: clientId });
  }

  function handleToggleCompanyArchive(companyId: string, wasArchived: boolean | undefined) {
    toggleCompanyArchived(companyId, wasArchived);
    refresh();
  }

  function handleToggleClientArchive(clientId: string, wasArchived: boolean | undefined) {
    toggleClientArchived(clientId, wasArchived);
    refresh();
  }

  const q = search.trim().toLowerCase();
  const companies = data.companies
    .filter((c) => showArchived || !c.archived)
    .filter((c) => {
      if (!q) return true;
      if ((c.name || "").toLowerCase().indexOf(q) !== -1) return true;
      return clientsOf(data, c.id).some((cl) => (cl.name || "").toLowerCase().indexOf(q) !== -1);
    })
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <>
      <h2 style={{ marginBottom: 8 }}>Companies &amp; Clients</h2>

      <div className="panel" style={{ marginBottom: 16 }}>
        <p className="text-secondary" style={{ margin: 0, fontSize: 13 }}>
          The Company → Client → Project hierarchy that powers the global context selector (Dashboard and the shell
          header). Companies and Clients are independent, permanent records — archiving one keeps its full history
          (clients, projects, documents, everything) intact and searchable, it just drops out of active pickers. A
          Client always belongs to exactly one Company, so the same client name under two different companies is
          deliberately two separate records here.
        </p>
      </div>

      {companyBeingEdited ? (
        <CompanyForm
          key={editingCompanyId}
          isNew={editingCompanyId === "new"}
          company={companyBeingEdited}
          onCancel={() => setEditingCompanyId(null)}
          onSaved={() => {
            setEditingCompanyId(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar">
        <input type="text" placeholder="Search companies or clients…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <div className="toolbar__spacer" />
        <button className="btn btn--primary" onClick={() => setEditingCompanyId("new")}>
          + Add Company
        </button>
      </div>

      <div>
        {companies.length === 0 ? (
          <div className="panel empty-state">
            {data.companies.length === 0 ? "No companies yet. Click “+ Add Company” to add the first one." : "No companies match this search."}
          </div>
        ) : (
          companies.map((c) => (
            <CompanyCard
              key={c.id}
              company={c}
              data={data}
              expanded={!!expandedCompanyIds[c.id]}
              showArchived={showArchived}
              editingClient={editingClient && editingClient.companyId === c.id ? editingClient : null}
              onToggleExpand={() => handleToggleExpand(c.id)}
              onAddClient={() => handleAddClient(c.id)}
              onEditCompany={() => setEditingCompanyId(c.id)}
              onToggleCompanyArchive={() => handleToggleCompanyArchive(c.id, c.archived)}
              onEditClient={handleEditClient}
              onToggleClientArchive={handleToggleClientArchive}
              onCancelClientForm={() => setEditingClient(null)}
              onClientSaved={() => {
                setEditingClient(null);
                refresh();
              }}
              onNewProject={(companyId, clientId) => newProjectHandoff(companyId, clientId)}
            />
          ))
        )}
        <UnassignedSection data={data} />
      </div>
    </>
  );
}
