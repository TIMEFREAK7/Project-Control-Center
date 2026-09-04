/* Service boundary for the Knowledge Base page (master prompt §9: "React must not own
 * core calculations... React should request calculations from domain/service modules").
 *
 * Thin wrapper — every store/blobStore call goes straight through the existing globals,
 * unchanged from the vanilla page. getData() returns a FRESH top-level object reference
 * (Object.assign({}, store.get())) since it's used in a useState-then-refresh pattern —
 * window.PCC.store.get() returns the SAME mutable object every call, which would
 * otherwise make React silently skip the re-render (see CLAUDE.md's React migration notes).
 */
import type { PCCStoreData, PCCProject, PCCKnowledgeBaseArticle } from "../types/pcc";

export interface PendingFile {
  name: string;
  size: number;
  type: string;
  dataUri: string;
}

export var CATEGORY_LABELS: { [category: string]: string } = {
  standard_procedure: "Standard Procedure",
  checklist_template: "Checklist / Template",
  reference_material: "Reference Material",
  how_to_guide: "How-To Guide",
  policy: "Policy",
  other: "Other",
};

export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function categoryOptions(): string[] {
  return window.PCC.store.KNOWLEDGE_BASE_CATEGORIES;
}

export function fmtSize(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function projectName(projects: PCCProject[], projectId: string | undefined): string {
  if (!projectId) return "General (no project)";
  var p = projects.find(function (proj) {
    return proj.id === projectId;
  });
  return p ? p.name || "(unnamed project)" : "General (no project)";
}

export function newArticle(prefill?: Partial<PCCKnowledgeBaseArticle>): PCCKnowledgeBaseArticle {
  return window.PCC.store.newKnowledgeBaseArticle(prefill || {});
}

/** Reads a File via FileReader, resolving { name, size, type, dataUri }. */
export function readFile(file: File): Promise<PendingFile> {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function () {
      reject(new Error("Could not read that file."));
    };
    reader.onload = function () {
      resolve({ name: file.name, size: file.size, type: file.type || "application/octet-stream", dataUri: reader.result as string });
    };
    reader.readAsDataURL(file);
  });
}

/** Generic "open any stored file" — same Blob + object URL pattern documents.js's
 * openStoredFile() uses. */
export function openArticleFile(article: PCCKnowledgeBaseArticle): void {
  window.PCC.blobStore
    .getBlob(article.id)
    .then(function (fileData) {
      if (!fileData) {
        window.PCC.notify("No file stored for this article.", "warning");
        return;
      }
      var commaIdx = fileData.indexOf(",");
      var meta = fileData.slice(0, commaIdx);
      var b64 = fileData.slice(commaIdx + 1);
      var mimeMatch = /data:(.*);base64/.exec(meta);
      var mime = mimeMatch ? mimeMatch[1] : article.mime_type || "application/octet-stream";
      var binary = atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var blob = new Blob([bytes], { type: mime });
      var url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 30000);
    })
    .catch(function (e: Error) {
      window.PCC.notify("Could not open this file: " + e.message, "error");
    });
}

/** Blob written FIRST, metadata only committed once that succeeds — same "never orphan a
 * reference" rule dailyLog.js's photo upload already established.
 *
 * For a new article, `newRecord` must be a record already minted via newArticle(values)
 * BEFORE this is called (so the SAME id is used both as the blobStore key here and as
 * the record pushed to the store — never two independently-generated ids for one
 * article, same invariant the vanilla page's own comment on this exact point kept). */
export function saveArticle(
  isNew: boolean,
  articleId: string,
  values: Partial<PCCKnowledgeBaseArticle>,
  pendingFile: PendingFile | null,
  removeExistingFile: boolean,
  newRecord: PCCKnowledgeBaseArticle | null
): Promise<void> {
  function commit() {
    window.PCC.store.update(function (data) {
      if (isNew) {
        var record = newRecord!;
        if (pendingFile) {
          record.filename = pendingFile.name;
          record.file_size = pendingFile.size;
          record.mime_type = pendingFile.type;
        }
        data.knowledge_base_articles.push(record);
      } else {
        var existing = data.knowledge_base_articles.find(function (a) {
          return a.id === articleId;
        });
        if (existing) {
          Object.assign(existing, values);
          if (pendingFile) {
            existing.filename = pendingFile.name;
            existing.file_size = pendingFile.size;
            existing.mime_type = pendingFile.type;
          } else if (removeExistingFile) {
            existing.filename = "";
            existing.file_size = 0;
            existing.mime_type = "";
          }
          existing.updated_at = new Date().toISOString();
        }
      }
    });
    window.PCC.notify(isNew ? "Article added." : "Article updated.", "success");
  }

  if (pendingFile) {
    return window.PCC.blobStore.putBlob(articleId, pendingFile.dataUri).then(commit);
  }
  if (removeExistingFile && !isNew) {
    return window.PCC.blobStore.deleteBlob(articleId).then(commit);
  }
  commit();
  return Promise.resolve();
}

export function deleteArticle(id: string): Promise<void> {
  return window.PCC.blobStore.deleteBlob(id).finally(function () {
    window.PCC.store.update(function (data) {
      data.knowledge_base_articles = data.knowledge_base_articles.filter(function (item) {
        return item.id !== id;
      });
    });
  });
}

export function getProjectContext(): string {
  return window.PCC.projectContext.get();
}
export function setProjectContext(projectId: string): void {
  window.PCC.projectContext.set(projectId);
}

export function notify(message: string, level: string): void {
  window.PCC.notify(message, level);
}
