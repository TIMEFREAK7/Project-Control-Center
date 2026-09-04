/* Service boundary for the Document Types page (master prompt §9: "React must not own
 * core calculations... React should request calculations from domain/service modules").
 *
 * This is a THIN WRAPPER, not a reimplementation. document_types is a plain array living
 * on the store's single data object (src/js/store.js) — there is no separate engine module
 * for this page the way Storage Management has storageAnalyticsEngine.js. This module's
 * only job is giving the React component a small, React-agnostic surface to call instead
 * of reaching into window.PCC.store directly, matching the same React -> Service -> Store
 * chain used for Storage Management.
 */
import type { PCCStoreData, PCCDocumentType, PCCDocumentTypeValues } from "../types/pcc";

export const CRITICALITY_LABELS: { [level: string]: string } = {
  critical: "Critical",
  major: "Major",
  normal: "Normal",
  informational: "Informational",
};

export function criticalityLevels(): string[] {
  return window.PCC.store.DOCUMENT_TYPE_CRITICALITY_LEVELS;
}

/** Reads the current store snapshot. Returns a FRESH shallow-copied wrapper, not
 * window.PCC.store.get()'s raw return value — that function returns the same mutable
 * object reference on every call (this app's store is a single object mutated in place,
 * never replaced), so handing it straight to a React useState setter after a mutation
 * would be a same-reference no-op: React's Object.is bailout would silently skip the
 * re-render. A shallow copy gives React a genuinely new top-level reference to compare
 * against, while every nested field still reflects the current (mutated) data, since
 * the underlying arrays/objects are the same ones the store just wrote to. */
export function getData(): PCCStoreData {
  return Object.assign({}, window.PCC.store.get());
}

export function blankDocumentType(): PCCDocumentType {
  return window.PCC.store.newDocumentType({});
}

export function findDocumentType(data: PCCStoreData, id: string): PCCDocumentType | undefined {
  return data.document_types.find(function (t) {
    return t.id === id;
  });
}

export function distinctCategories(documentTypes: PCCDocumentType[]): string[] {
  var seen: { [category: string]: boolean } = {};
  var out: string[] = [];
  documentTypes.forEach(function (t) {
    var c = (t.category || "").trim();
    if (c && !seen[c]) {
      seen[c] = true;
      out.push(c);
    }
  });
  out.sort();
  return out;
}

/** Creates a new document type record from form values. */
export function addDocumentType(values: PCCDocumentTypeValues): void {
  window.PCC.store.update(function (d) {
    d.document_types.push(window.PCC.store.newDocumentType(values));
  });
}

/** Updates an existing document type record in place by id. */
export function updateDocumentType(id: string, values: PCCDocumentTypeValues): void {
  window.PCC.store.update(function (d) {
    var existing = d.document_types.find(function (t) {
      return t.id === id;
    });
    if (existing) {
      Object.assign(existing, values);
      existing.updated_at = new Date().toISOString();
    }
  });
}

/** Flips active/inactive on a document type — the primary way to retire a type without
 * breaking anything that might reference it by id later (see documentTypes.js's own
 * original header comment on why deactivate, not delete, is the default path). */
export function toggleDocumentTypeActive(id: string): void {
  window.PCC.store.update(function (d) {
    var existing = d.document_types.find(function (item) {
      return item.id === id;
    });
    if (existing) {
      existing.active = !existing.active;
      existing.updated_at = new Date().toISOString();
    }
  });
}

/** Hard delete. The confirm() prompt itself stays the component's job (a UI concern, not
 * a store one) — this function only performs the delete once the caller decides to. */
export function deleteDocumentType(id: string): void {
  window.PCC.store.update(function (d) {
    d.document_types = d.document_types.filter(function (item) {
      return item.id !== id;
    });
  });
}
