/* Service boundary for the Document Control Dashboard page (Gate 26 — Document Control 12:
 * Dashboards; master prompt §9: "React must not own core calculations... React should request
 * calculations from domain/service modules").
 *
 * Unlike Storage Management, this page never had a separate domain-engine file — its
 * Available/Overdue/Required compliance math and its worst-compliance-first grouping lived
 * directly inside the old vanilla page module, src/js/pages/documentControlDashboard.js.
 * Relocated here VERBATIM (not reimplemented, not changed) so this stays the single place the
 * calculation lives and the React component only requests results from it, instead of
 * reaching into window.PCC.store or reimplementing the math itself — same
 * React -> Service -> (store/engine) chain the master prompt's §6/§9 diagrams, even though the
 * "engine" side here is this module itself rather than a pre-existing separate file. Nothing
 * in this module writes back to the store — same "computed, never denormalized" convention
 * every Document Control gate since Gate 18 has used.
 */

import type { PCCStoreData, PCCProject, PCCDocumentType, PCCProjectDocumentRequirement } from "../types/pcc";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Same Available/Overdue/Required computation as portfolio.js/vendors.js/schedule.js/
// dashboard.js's own copies — duplicated here per this app's per-module-helpers convention.
function computeRequirementStatus(data: PCCStoreData, projectId: string, documentTypeId: string, plannedDate: string | null | undefined): string {
  const available = data.documents.some(
    (d) => d.project_id === projectId && d.document_type_id === documentTypeId && !d.trashed_at
  );
  if (available) return "available";
  if (plannedDate && plannedDate < todayIso()) return "overdue";
  return "required";
}

export function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export interface ComplianceGroup {
  key: string;
  total: number;
  available: number;
  overdue: number;
  pctAvailable: number;
}

export interface RequirementRow {
  row: PCCProjectDocumentRequirement;
  status: string;
}

/** Groups `rows` (each `{ row, status }`) by `keyFn`, returning an array of
 * `{ key, total, available, overdue, pctAvailable }`, sorted worst-compliance-first
 * (lowest % Available), ties broken by highest overdue count first. */
export function groupCompliance(rows: RequirementRow[], keyFn: (row: PCCProjectDocumentRequirement) => string): ComplianceGroup[] {
  const byKey: { [key: string]: ComplianceGroup } = {};
  const order: string[] = [];
  rows.forEach((x) => {
    const key = keyFn(x.row);
    if (!byKey[key]) {
      byKey[key] = { key, total: 0, available: 0, overdue: 0, pctAvailable: 0 };
      order.push(key);
    }
    byKey[key].total++;
    if (x.status === "available") byKey[key].available++;
    if (x.status === "overdue") byKey[key].overdue++;
  });
  const groups = order.map((key) => {
    const g = byKey[key];
    g.pctAvailable = pct(g.available, g.total);
    return g;
  });
  groups.sort((a, b) => {
    if (a.pctAvailable !== b.pctAvailable) return a.pctAvailable - b.pctAvailable;
    return b.overdue - a.overdue;
  });
  return groups;
}

export interface DashboardSnapshot {
  data: PCCStoreData;
  activeProjects: PCCProject[];
  projectsById: { [id: string]: PCCProject };
  typesById: { [id: string]: PCCDocumentType };
  rows: RequirementRow[];
}

/** Reads the current store snapshot and derives everything the dashboard reports on: the
 * active (non-archived) projects, lookup maps for resolving project/document-type ids to
 * their records, and the per-requirement `{ row, status }` rows across the active portfolio.
 * Synchronous — store.get() is synchronous, same as every other read-only report page. */
export function getDashboardSnapshot(): DashboardSnapshot {
  const data = window.PCC.store.get();
  const activeProjects = data.projects.filter((p) => !p.archived);
  const activeProjectIds: { [id: string]: boolean } = {};
  const projectsById: { [id: string]: PCCProject } = {};
  activeProjects.forEach((p) => {
    activeProjectIds[p.id] = true;
    projectsById[p.id] = p;
  });
  const typesById: { [id: string]: PCCDocumentType } = {};
  data.document_types.forEach((t) => {
    typesById[t.id] = t;
  });

  const rows = data.project_document_requirements
    .filter((r) => activeProjectIds[r.project_id] && typesById[r.document_type_id])
    .map((r) => ({
      row: r,
      status: computeRequirementStatus(data, r.project_id, r.document_type_id, r.planned_submission_date),
    }));

  return { data, activeProjects, projectsById, typesById, rows };
}

/** Navigates to the given project's detail view on the Portfolio page — the same
 * viewProject()+router.go("portfolio") pair the old vanilla row's onclick used. A UI
 * navigation action, not a calculation, so it stays a thin pass-through, the same way
 * window.PCC.notify() stays a direct call in the Storage Management component. */
export function viewProjectOnPortfolio(projectId: string): void {
  if (!window.PCC.portfolio) return;
  window.PCC.portfolio.viewProject(projectId);
  window.PCC.router.go("portfolio");
}
