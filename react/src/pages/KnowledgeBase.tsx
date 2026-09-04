/* Knowledge Base — migrated to React (Post-Phase-5 Engineering Evolution, progressive
 * React migration — see LessonsLearned.jsx for the closest sibling pattern: a full CRUD
 * register with an add/edit form, uncontrolled fields read at submit time).
 *
 * The add/edit form's text/select/textarea fields are UNCONTROLLED (defaultValue only)
 * and read straight from the DOM at submit time via each field's `kbfield-<key>` id —
 * matches tests/test_knowledge_base_e2e.js's own raw `.value =` + bare `submit` dispatch
 * expectations, and sidesteps the controlled-input testing gotchas entirely (see
 * LessonsLearned.jsx's own comment on this). The category/project FILTER selects in the
 * toolbar stay controlled, since they need to live-update the list as they change.
 *
 * Reproduces the prior vanilla page's exact text, ids, and CSS class names (panel/field/
 * form-grid/project-card/project-entry/project-details/detail-grid/status-badge/
 * attention-list/attention-item/toolbar/empty-state/btn/btn--primary/btn--ghost) — same
 * visual result, only the implementation moved.
 */
import React, { useState } from "react";
import {
  CATEGORY_LABELS,
  getData,
  categoryOptions,
  fmtSize,
  projectName,
  newArticle,
  readFile,
  openArticleFile,
  saveArticle,
  deleteArticle,
  getProjectContext,
  setProjectContext,
  notify,
} from "../services/knowledgeBaseService";
import type { PendingFile } from "../services/knowledgeBaseService";
import type { PCCKnowledgeBaseArticle, PCCProject } from "../types/pcc";

function ArticleForm({
  article,
  isNew,
  projects,
  onCancel,
  onSaved,
}: {
  article: PCCKnowledgeBaseArticle;
  isNew: boolean;
  projects: PCCProject[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showError, setShowError] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setReadError(null);
    readFile(file)
      .then((f) => {
        setPendingFile(f);
        setRemoveExistingFile(false);
      })
      .catch((err: Error) => setReadError(err.message));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const title = (form.querySelector("#kbfield-title") as HTMLInputElement).value.trim();
    if (!title) {
      setShowError(true);
      return;
    }
    setShowError(false);

    const values: Partial<PCCKnowledgeBaseArticle> = {
      title: title,
      category: (form.querySelector("#kbfield-category") as HTMLSelectElement).value,
      project_id: (form.querySelector("#kbfield-project_id") as HTMLSelectElement).value,
      tags: (form.querySelector("#kbfield-tags") as HTMLInputElement).value,
      body: (form.querySelector("#kbfield-body") as HTMLTextAreaElement).value,
    };

    const newRecord = isNew ? newArticle(values) : null;
    const articleId = isNew ? newRecord!.id : article.id;

    setSaving(true);
    saveArticle(isNew, articleId, values, pendingFile, removeExistingFile, newRecord)
      .then(() => {
        notify(isNew ? "Article added." : "Article updated.", "success");
        onSaved();
      })
      .catch((err: Error) => {
        setSaving(false);
        notify("Could not save the attached file: " + err.message, "error");
      });
  }

  const showExistingFile = article.filename && !removeExistingFile && !pendingFile;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{isNew ? "Add Article" : "Edit Article"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Title *</label>
            <input type="text" id="kbfield-title" defaultValue={article.title || ""} />
          </div>
          <div className="field">
            <label>Category</label>
            <select id="kbfield-category" defaultValue={article.category || "other"}>
              {categoryOptions().map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Project (optional)</label>
            <select id="kbfield-project_id" defaultValue={article.project_id || ""}>
              <option value="">General (no project)</option>
              {projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || "(unnamed project)"}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>Tags (comma-separated)</label>
            <input type="text" id="kbfield-tags" defaultValue={article.tags || ""} />
          </div>
        </div>

        <div className="field" style={{ marginTop: 8 }}>
          <label>Body</label>
          <textarea id="kbfield-body" rows={6} defaultValue={article.body || ""} />
        </div>

        <div className="field" style={{ marginTop: 8 }}>
          <label>Attached File (optional)</label>

          {showExistingFile ? (
            <>
              <p style={{ fontSize: 13, margin: "4px 0" }}>
                {"Currently attached: " + article.filename + (article.file_size ? " (" + fmtSize(article.file_size) + ")" : "")}
              </p>
              <button type="button" className="btn btn--ghost" style={{ marginBottom: 6 }} onClick={() => setRemoveExistingFile(true)}>
                Remove Attached File
              </button>
            </>
          ) : null}

          {pendingFile ? (
            <p style={{ fontSize: 13, margin: "4px 0" }}>{"Selected: " + pendingFile.name + " (" + fmtSize(pendingFile.size) + ")"}</p>
          ) : null}

          <input type="file" id="kbfield-file" onChange={handleFileChange} />

          {readError ? (
            <p style={{ color: "var(--status-critical)", fontSize: 13 }}>{readError}</p>
          ) : null}
        </div>

        {showError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>Title is required.</p> : null}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Add Article" : "Save Changes"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ArticleDetails({ a }: { a: PCCKnowledgeBaseArticle }) {
  const fields = [
    { label: "CATEGORY", value: CATEGORY_LABELS[a.category || ""] },
    { label: "TAGS", value: a.tags || "—" },
    { label: "BODY", value: a.body || "—", wide: true, pre: true },
  ];

  return (
    <div className="project-details">
      <div className="detail-grid">
        {fields.map((f) => (
          <div key={f.label} style={f.wide ? { gridColumn: "1 / -1" } : undefined}>
            <span className="detail-item__label">{f.label}</span>
            <span className="detail-item__value" style={f.pre ? { whiteSpace: "pre-wrap" } : undefined}>
              {f.value}
            </span>
          </div>
        ))}
      </div>

      {a.filename ? (
        <div className="attention-list" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
          <div className="attention-item attention-item--clickable" onClick={() => openArticleFile(a)}>
            <span className="attention-item__icon attention-item__icon--info" />
            <div className="attention-item__body">
              <div className="attention-item__text">{a.filename + (a.file_size ? " (" + fmtSize(a.file_size) + ")" : "")}</div>
              <div className="attention-item__meta">ATTACHED FILE</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ArticleEntry({
  a,
  projects,
  expanded,
  onToggleDetails,
  onEdit,
  onDelete,
}: {
  a: PCCKnowledgeBaseArticle;
  projects: PCCProject[];
  expanded: boolean;
  onToggleDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="project-entry">
      <div className="project-card">
        <div className="project-card__main">
          <div className="project-card__name">{a.title || "(untitled)"}</div>
          <div className="project-card__meta">
            {CATEGORY_LABELS[a.category || ""] + " · " + projectName(projects, a.project_id) + (a.tags ? " · " + a.tags : "")}
          </div>
        </div>
        <div>{a.filename ? <span className="status-badge status-badge--info">File Attached</span> : null}</div>
        <div className="project-card__actions">
          <button className="btn btn--ghost" onClick={onToggleDetails}>
            {expanded ? "Hide" : "Details"}
          </button>
          <button className="btn btn--ghost" onClick={onEdit}>
            Edit
          </button>
          <button className="btn btn--ghost" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      {expanded ? <ArticleDetails a={a} /> : null}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const [data, setData] = useState(() => getData());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  // Global Project Context: read once on mount, same one-time-init the vanilla page's
  // "projectFilterInitialized" flag did — a fresh mount happens on every navigation to
  // this page (reactBridge.js), so "once per mount" here.
  const [projectFilter, setProjectFilter] = useState(() => {
    const ctxProjectId = getProjectContext();
    const snapshot = getData();
    return ctxProjectId && snapshot.projects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });

  function refresh() {
    setData(getData());
  }

  const projects = data.projects;

  function handleDelete(a: PCCKnowledgeBaseArticle) {
    if (!window.confirm("Delete this article? This can't be undone.")) return;
    deleteArticle(a.id).then(() => {
      notify("Article deleted.", "info");
      refresh();
    });
  }

  const articleBeingEdited: PCCKnowledgeBaseArticle | null =
    !editingId ? null : editingId === "new" ? newArticle({}) : data.knowledge_base_articles.find((a) => a.id === editingId) || null;

  function matchesFilters(a: PCCKnowledgeBaseArticle): boolean {
    if (categoryFilter && a.category !== categoryFilter) return false;
    // "__general__" is a synthetic filter value (not a real project id) meaning
    // "articles with no project tag at all" — distinct from "" (no filter applied).
    if (projectFilter === "__general__" && a.project_id) return false;
    if (projectFilter && projectFilter !== "__general__" && a.project_id !== projectFilter) return false;
    if (search) {
      const haystack = ((a.title || "") + " " + (a.body || "") + " " + (a.tags || "")).toLowerCase();
      if (haystack.indexOf(search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  const filtered = data.knowledge_base_articles.filter(matchesFilters);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Knowledge Base</h2>
      <p className="text-secondary" style={{ marginTop: 0, marginBottom: 16 }}>
        Reusable standard procedures, checklists, and reference material — portfolio-wide, optionally tagged to one project.
      </p>

      {editingId && articleBeingEdited ? (
        <ArticleForm
          key={editingId}
          article={articleBeingEdited}
          isNew={editingId === "new"}
          projects={projects}
          onCancel={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            refresh();
          }}
        />
      ) : null}

      <div className="toolbar">
        <input type="text" placeholder="Search title, body, tags…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categoryOptions().map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => {
            const value = e.target.value;
            setProjectFilter(value);
            if (value && value !== "__general__") setProjectContext(value);
          }}
        >
          <option value="">All projects</option>
          <option value="__general__">General (no project)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "(unnamed project)"}
            </option>
          ))}
        </select>
        <div className="toolbar__spacer" />
        {/* Deliberately never gated on "a project exists" — unlike every other register,
            Knowledge Base articles don't need a project at all. */}
        <button className="btn btn--primary" onClick={() => setEditingId("new")}>
          + Add Article
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="panel empty-state">
          {data.knowledge_base_articles.length === 0
            ? "No articles yet. Click “+ Add Article” to log your first standard procedure, checklist, or reference note."
            : "No articles match this search/filter."}
        </div>
      ) : (
        <div className="project-list">
          {filtered.map((a) => (
            <ArticleEntry
              key={a.id}
              a={a}
              projects={projects}
              expanded={expandedId === a.id}
              onToggleDetails={() => setExpandedId(expandedId === a.id ? null : a.id)}
              onEdit={() => setEditingId(a.id)}
              onDelete={() => handleDelete(a)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
