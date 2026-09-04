/* Document Types (Gate 14 — Document Control 1: Master Document Repository), migrated to
 * React as part of the page-by-page migration (Post-Phase-5 Engineering Evolution).
 *
 * Reproduces the prior vanilla page's exact text, button labels, confirm() dialogs, and
 * CSS class names (panel/form-grid/field/detail-card/project-list/toolbar/btn/
 * btn--primary/btn--ghost/text-secondary/mono/empty-state) — same visual result, only the
 * implementation moved. See src/js/pages/documentTypes.js (now a ~10-line stub) for the
 * router registration and the `window.PCC.documentTypes.activeTypes()` public API that
 * documents.js/portfolio.js already depend on — that API is a route-independent global
 * side effect, not rendering logic, so it stayed in the stub rather than moving here.
 *
 * All calculation-free store reads/writes go through documentTypesService.js (master
 * prompt §9: React must not own core calculations) — this component only holds local UI
 * state (filters, which record is being edited, and the add/edit form's own draft fields).
 */
import React, { useState } from "react";
import {
  CRITICALITY_LABELS,
  criticalityLevels,
  getData,
  blankDocumentType,
  findDocumentType,
  distinctCategories,
  addDocumentType,
  updateDocumentType,
  toggleDocumentTypeActive,
  deleteDocumentType,
} from "../services/documentTypesService";
import type { PCCDocumentType } from "../types/pcc";

function DocumentTypeForm({
  isNew,
  documentType,
  onCancel,
  onSaved,
}: {
  isNew: boolean;
  documentType: PCCDocumentType;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(documentType.name || "");
  const [code, setCode] = useState(documentType.code || "");
  const [category, setCategory] = useState(documentType.category || "");
  const [criticality, setCriticality] = useState(documentType.default_criticality || "normal");
  const [description, setDescription] = useState(documentType.description || "");
  const [showError, setShowError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setShowError(true);
      return;
    }
    setShowError(false);

    const values = {
      name: trimmedName,
      code: code.trim(),
      category: category.trim(),
      default_criticality: criticality,
      description: description,
    };

    if (isNew) {
      addDocumentType(values);
    } else {
      updateDocumentType(documentType.id, values);
    }

    window.PCC.notify(isNew ? "Document type added." : "Document type updated.", "success");
    onSaved();
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Document Type" : "Edit Document Type"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Name *</label>
            <input id="dtfield-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Code (short abbreviation)</label>
            <input id="dtfield-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="field">
            <label>Category (grouping label)</label>
            <input id="dtfield-category" type="text" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="field">
            <label>Default Criticality</label>
            <select id="dtfield-criticality" value={criticality} onChange={(e) => setCriticality(e.target.value)}>
              {criticalityLevels().map((c) => (
                <option key={c} value={c}>
                  {CRITICALITY_LABELS[c] || c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Description</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {showError ? (
          <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Name is required.</p>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary">
            {isNew ? "Add Document Type" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function DocumentTypeRow({
  t,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  t: PCCDocumentType;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="detail-card"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 6,
        opacity: t.active ? 1 : 0.6,
      }}
    >
      <div>
        <strong>{t.name}</strong>
        {t.code ? (
          <>
            {" "}
            <span className="text-secondary mono" style={{ fontSize: 12 }}>
              ({t.code})
            </span>
          </>
        ) : null}
        <br />
        <span className="text-secondary" style={{ fontSize: 12 }}>
          {t.category ? t.category + " · " : ""}
          {CRITICALITY_LABELS[t.default_criticality || ""] || t.default_criticality}
          {t.active ? "" : " · INACTIVE"}
        </span>
        {t.description ? (
          <>
            <br />
            <span className="text-secondary" style={{ fontSize: 12 }}>
              {t.description}
            </span>
          </>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn--ghost" onClick={onEdit}>
          Edit
        </button>
        <button className="btn btn--ghost" onClick={onToggleActive}>
          {t.active ? "Deactivate" : "Reactivate"}
        </button>
        <button className="btn btn--ghost" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

export default function DocumentTypesPage() {
  const [data, setData] = useState(() => getData());
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null); // a document_type id, "new", or null
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  function refresh() {
    setData(getData());
  }

  const documentTypes = data.document_types;

  const typeBeingEdited = !editingTypeId
    ? null
    : editingTypeId === "new"
    ? blankDocumentType()
    : findDocumentType(data, editingTypeId);

  function handleAdd() {
    setEditingTypeId("new");
  }

  function handleEdit(id: string) {
    setEditingTypeId(id);
  }

  function handleCancelForm() {
    setEditingTypeId(null);
  }

  function handleSaved() {
    setEditingTypeId(null);
    refresh();
  }

  function handleToggleActive(t: PCCDocumentType) {
    toggleDocumentTypeActive(t.id);
    window.PCC.notify(t.active ? "Document type deactivated." : "Document type reactivated.", "info");
    refresh();
  }

  function handleDelete(t: PCCDocumentType) {
    if (!window.confirm('Delete document type "' + t.name + '"? This can\'t be undone.')) return;
    deleteDocumentType(t.id);
    window.PCC.notify("Document type deleted.", "success");
    refresh();
  }

  const categories = distinctCategories(documentTypes);

  const filtered = documentTypes.filter((t) => {
    if (!showInactive && !t.active) return false;
    if (categoryFilter && t.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = ((t.name || "") + " " + (t.code || "")).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  const sorted = filtered.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <>
      <h2 style={{ marginBottom: 8 }}>Document Types</h2>

      <div className="panel" style={{ marginBottom: 16 }}>
        <p className="text-secondary" style={{ margin: 0, fontSize: 13 }}>
          The master repository of document types that may be required across your projects (BOQ, Method Statement,
          ITP, ...). This list is portfolio-wide and configurable — add, edit, or deactivate types here. Deciding
          which types apply to a specific project comes in a later gate; this page only manages the repository
          itself.
        </p>
      </div>

      {typeBeingEdited ? (
        <DocumentTypeForm
          key={editingTypeId}
          isNew={editingTypeId === "new"}
          documentType={typeBeingEdited}
          onCancel={handleCancelForm}
          onSaved={handleSaved}
        />
      ) : null}

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>

        <div className="toolbar__spacer" />

        <button className="btn btn--primary" onClick={handleAdd}>
          + Add Document Type
        </button>
      </div>

      <div>
        {sorted.length === 0 ? (
          <div className="panel empty-state">
            {documentTypes.length === 0
              ? "No document types yet. Click “+ Add Document Type” to add the first one."
              : "No document types match this search/filter."}
          </div>
        ) : (
          <div className="project-list">
            {sorted.map((t) => (
              <DocumentTypeRow
                key={t.id}
                t={t}
                onEdit={() => handleEdit(t.id)}
                onToggleActive={() => handleToggleActive(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
