/* Planner Action Centre — migrated to React (Post-Phase-5 Engineering Evolution, React
 * migration, one page at a time behind the existing router — see the Storage Management
 * pilot for the established pattern this follows).
 *
 * Reproduces the prior vanilla page's (src/js/pages/actionCentre.js, now a ~10-line
 * router stub) exact text, headings, KPI labels, and CSS class names (kpi-grid/kpi-card/
 * panel/toolbar/attention-list/attention-item/text-secondary/mono/empty-state) — same
 * visual result, only the implementation moved. All aggregation logic (collectItems, the
 * date-bucketing rules) lives in ../services/actionCentreService.js, unchanged from the
 * vanilla page — this component only renders it and wires up the project filter and each
 * item's click-to-navigate behavior.
 *
 * Project filter / Global Project Context sync: the vanilla page kept a module-level
 * uiState.lastSyncedContextId so that switching the shared Global Project Context (e.g.
 * from another page) would re-sync this page's own filter the next time it rendered,
 * without clobbering a filter the user set locally on THIS page in between. That's
 * reproduced here with the React-documented pattern for adjusting state during render in
 * response to a changed value (comparing the live context id against the last id this
 * component itself observed, storing both in state) rather than an effect — matching the
 * original's "recomputed synchronously every render" behavior exactly, with no extra
 * render-then-flash from an effect running after paint.
 */
import React, { useState } from "react";
import {
  getData,
  getProjectContext,
  setProjectContext,
  upcomingWindowDays,
  collectItems,
  buildBuckets,
} from "../services/actionCentreService";
import type { Item, Bucket, BucketDef } from "../services/actionCentreService";
import type { PCCProject, PCCStoreData } from "../types/pcc";

function KpiCard({ label, value, colorVar }: { label: string; value: number; colorVar: string | null }) {
  return (
    <div className="kpi-card">
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value mono" style={colorVar ? { color: `var(${colorVar})` } : undefined}>
        {value}
      </span>
    </div>
  );
}

// Redesign Gate 7: retrofitted onto the same .attention-list/.attention-item primitive
// myWork.js's own item rows use (and Executive Center's Diagnostics/Management Action
// panels, Dashboard's Management Attention panel) — same "whole row is the click target"
// behavior, only when a linked project still exists (a deleted project's items stay
// listed but non-clickable, same as before this gate).
function ItemRow({
  item,
  badgeClass,
  projectsById,
}: {
  item: Item;
  badgeClass: string;
  projectsById: { [id: string]: PCCProject };
}) {
  const project = projectsById[item.projectId];
  const clickable = !!(project && item.view);

  return (
    <div className={"attention-item" + (clickable ? " attention-item--clickable" : "")} onClick={clickable ? item.view! : undefined}>
      <span className={"attention-item__icon attention-item__icon--" + badgeClass} />
      <div className="attention-item__body">
        <div className="attention-item__text">
          [{item.kind}] {item.title}
        </div>
        <div className="attention-item__meta">
          {(project ? project.name || "(unnamed project)" : "(deleted project)") +
            " · " +
            item.owner +
            (item.dueDate ? " · due " + item.dueDate : "")}
        </div>
      </div>
    </div>
  );
}

function BucketPanel({
  bucketDef,
  items,
  projectsById,
}: {
  bucketDef: BucketDef;
  items: Item[];
  projectsById: { [id: string]: PCCProject };
}) {
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 8 }}>
        {bucketDef.label} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-secondary" style={{ margin: 0 }}>
          {bucketDef.emptyText}
        </p>
      ) : (
        <div className="attention-list">
          {items.map((item, i) => (
            <ItemRow key={i} item={item} badgeClass={bucketDef.badgeClass} projectsById={projectsById} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ActionCentrePage() {
  const [projectFilter, setProjectFilter] = useState("");
  const [lastSyncedContextId, setLastSyncedContextId] = useState<string | undefined>(undefined);

  const data = getData();
  const allActiveProjects = data.projects.filter((p) => !p.archived);
  const projectsById: { [id: string]: PCCProject } = {};
  allActiveProjects.forEach((p) => {
    projectsById[p.id] = p;
  });

  // Daily-Use Audit Phase 2: live-syncs with the shared Global Project Context (Redesign
  // Gate 6) — see the vanilla page's original header comment / dashboard.js's identical
  // block for the full reasoning on why this compares against the last-observed context
  // value rather than a one-time seed flag. This is React's documented "adjusting state
  // when a value changes" pattern: called during the render body itself (not an effect),
  // conditioned so it only fires once per actual context change.
  const ctxProjectId = getProjectContext();
  let effectiveFilter = projectFilter;
  if (ctxProjectId !== lastSyncedContextId) {
    effectiveFilter = ctxProjectId && allActiveProjects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
    setLastSyncedContextId(ctxProjectId);
    setProjectFilter(effectiveFilter);
  }
  if (effectiveFilter && !allActiveProjects.some((p) => p.id === effectiveFilter)) {
    effectiveFilter = "";
  }

  const activeProjects = effectiveFilter ? allActiveProjects.filter((p) => p.id === effectiveFilter) : allActiveProjects;
  const activeProjectIds: { [id: string]: boolean } = {};
  activeProjects.forEach((p) => {
    activeProjectIds[p.id] = true;
  });

  const items = collectItems(data, activeProjectIds);

  function handleProjectFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setProjectFilter(value);
    setLastSyncedContextId(value);
    setProjectContext(value);
  }

  const subText =
    items.length === 0
      ? effectiveFilter
        ? "Nothing outstanding for this project right now."
        : "Nothing outstanding across the active portfolio right now."
      : "Meeting actions, RFI/TQ responses, document submissions, recovery actions, newly-identified delays, and pending Change Orders across " +
        activeProjects.length +
        " active project" +
        (activeProjects.length === 1 ? "" : "s") +
        ".";

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Planner Action Centre</h2>
      <p className="text-secondary" style={{ marginTop: 0, marginBottom: 20 }}>
        {subText}
      </p>

      {allActiveProjects.length > 0 ? (
        <div className="toolbar no-print" style={{ marginBottom: 8 }}>
          <select aria-label="Filter by project" value={effectiveFilter} onChange={handleProjectFilterChange}>
            <option value="">All Projects</option>
            {allActiveProjects
              .slice()
              .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "(unnamed project)"}
                </option>
              ))}
          </select>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="panel empty-state">
          Nothing to show yet. Once Meeting Actions, RFI/TQ, Document Requirements, Recovery Actions, newly-identified
          Delays, or Change Orders have due dates or pending status, they'll surface here.
        </div>
      ) : (
        <ActionCentreResults data={data} items={items} projectsById={projectsById} />
      )}
    </div>
  );
}

function ActionCentreResults({
  data,
  items,
  projectsById,
}: {
  data: PCCStoreData;
  items: Item[];
  projectsById: { [id: string]: PCCProject };
}) {
  const windowDays = upcomingWindowDays(data);
  const buckets = buildBuckets(windowDays);

  const byBucket: { [key in Bucket]?: Item[] } = {};
  buckets.forEach((b) => {
    byBucket[b.key] = [];
  });
  items.forEach((i) => {
    byBucket[i.bucket]!.push(i);
  });
  (Object.keys(byBucket) as Bucket[]).forEach((key) => {
    byBucket[key]!.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      const projA = projectsById[a.projectId];
      const projB = projectsById[b.projectId];
      const nameA = projA ? projA.name || "" : "";
      const nameB = projB ? projB.name || "" : "";
      return nameA.localeCompare(nameB) || a.kind.localeCompare(b.kind);
    });
  });

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="OVERDUE" value={byBucket.overdue!.length} colorVar={byBucket.overdue!.length > 0 ? "--status-critical" : null} />
        <KpiCard label="DUE TODAY" value={byBucket.today!.length} colorVar={byBucket.today!.length > 0 ? "--status-at-risk" : null} />
        <KpiCard label="DUE THIS WEEK" value={byBucket.week!.length} colorVar={byBucket.week!.length > 0 ? "--status-at-risk" : null} />
        <KpiCard label="NO DUE DATE" value={byBucket.waiting!.length} colorVar={null} />
      </div>

      {buckets.map((b) => (
        <BucketPanel key={b.key} bucketDef={b} items={byBucket[b.key]!} projectsById={projectsById} />
      ))}
    </>
  );
}
