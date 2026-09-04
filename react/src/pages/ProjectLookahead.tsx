/* Project Lookahead — migrated to React (Post-Phase-5 Engineering Evolution, progressive
 * React migration, one page at a time — see StorageManagement.jsx for the pilot this
 * follows).
 *
 * Reproduces the prior vanilla page's exact text, labels, and CSS class names
 * (panel/attention-list/attention-item/attention-item--clickable/attention-item__icon/
 * attention-item__body/attention-item__text/attention-item__meta/toolbar/btn/btn--ghost/
 * text-secondary) — same visual result, only the implementation moved. All the actual
 * derivation (collectItems across Schedule/Meetings/RFI-TQ/Document Requirements) stays in
 * projectLookaheadService.js, unchanged; this component only holds the small bit of local
 * UI state (the day-window choice and the project filter select) and renders the result.
 *
 * uiState.windowDays/projectFilter used to be module-level vars in the vanilla page, so
 * they survived navigating away and back (reactBridge tears the React root down and a
 * fresh one up on every navigation — see reactBridge.js — so useState here resets to the
 * defaults on each remount instead of persisting mid-session). The one place this could
 * matter, the "live-sync with the shared Global Project Context" behavior the vanilla page
 * commented on at length, still works out identically: router.js unmounts and remounts this
 * page's whole React root on every router.render() call (see router.js), which is also the
 * only time the shell header's context switcher itself ever refreshes the page underneath
 * it (layout.js's context switcher calls window.PCC.router.render() after every change) —
 * so "sync from context on mount" and "sync from context on every render()" are the same
 * behavior here, just expressed as a useState lazy initializer instead of a re-run check.
 */
import React, { useState } from "react";
import {
  WINDOW_OPTIONS,
  DEFAULT_WINDOW_DAYS,
  getSnapshot,
  getProjectContext,
  setProjectContext,
  collectItems,
} from "../services/projectLookaheadService";
import type { Item } from "../services/projectLookaheadService";
import type { PCCProject } from "../types/pcc";

function ItemRow({ item, project }: { item: Item; project: PCCProject | undefined }) {
  const meta =
    item.date +
    " · " +
    (project ? project.name || "(unnamed project)" : "(deleted project)") +
    " · " +
    item.owner +
    (item.openDelayCount ? " · " + item.openDelayCount + " open delay" + (item.openDelayCount === 1 ? "" : "s") : "");

  return (
    <div className={"attention-item" + (project ? " attention-item--clickable" : "")} onClick={project ? item.view : undefined}>
      <span className={"attention-item__icon attention-item__icon--" + item.badgeClass} />
      <div className="attention-item__body">
        <div className="attention-item__text">{"[" + item.kind + "] " + item.title}</div>
        <div className="attention-item__meta">{meta}</div>
      </div>
    </div>
  );
}

export default function ProjectLookaheadPage() {
  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW_DAYS);

  // Daily-Use Audit Phase 2: seeded once per mount from the shared Global Project Context
  // (Redesign Gate 6) — see the file header comment above for why a lazy initializer here
  // is the faithful equivalent of the vanilla page's per-render "live sync" check.
  const [projectFilter, setProjectFilterState] = useState<string>(() => {
    const seedSnapshot = getSnapshot();
    const ctxProjectId = getProjectContext();
    return ctxProjectId && seedSnapshot.allActiveProjects.some((p) => p.id === ctxProjectId) ? ctxProjectId : "";
  });

  const { data, allActiveProjects, projectsById } = getSnapshot();

  // Defensive re-validation, same as the vanilla page: a projectFilter pointing at a
  // project archived/deleted since this page mounted falls back to "All Projects" rather
  // than silently showing an empty/broken filter.
  const validProjectFilter = projectFilter && allActiveProjects.some((p) => p.id === projectFilter) ? projectFilter : "";

  const activeProjects = validProjectFilter ? allActiveProjects.filter((p) => p.id === validProjectFilter) : allActiveProjects;
  const activeProjectIds: { [projectId: string]: boolean } = {};
  activeProjects.forEach((p) => {
    activeProjectIds[p.id] = true;
  });

  const items = collectItems(data, activeProjectIds, windowDays);
  items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));

  function handleProjectFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setProjectFilterState(value);
    setProjectContext(value);
  }

  const subtitle = validProjectFilter
    ? "Schedule activities, milestones, meetings, RFI/TQ, and document submissions due in the next " +
      windowDays +
      " day" +
      (windowDays === 1 ? "" : "s") +
      " for " +
      (projectsById[validProjectFilter].name || "(unnamed project)") +
      "."
    : "Schedule activities, milestones, meetings, RFI/TQ, and document submissions due in the next " +
      windowDays +
      " day" +
      (windowDays === 1 ? "" : "s") +
      " across " +
      allActiveProjects.length +
      " active project" +
      (allActiveProjects.length === 1 ? "" : "s") +
      ".";

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>Project Lookahead</h2>
      <p className="text-secondary" style={{ marginTop: 0, marginBottom: 16 }}>
        {subtitle}
      </p>

      {allActiveProjects.length > 0 ? (
        <div className="toolbar no-print" style={{ marginBottom: 8 }}>
          <select value={validProjectFilter} onChange={handleProjectFilterChange}>
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

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {WINDOW_OPTIONS.map((days) => (
          <button key={days} className={"btn" + (windowDays === days ? "" : " btn--ghost")} onClick={() => setWindowDays(days)}>
            {days + " Day"}
          </button>
        ))}
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 8 }}>{"Coming Up (" + items.length + ")"}</h3>
        {items.length === 0 ? (
          <p className="text-secondary" style={{ margin: 0 }}>
            {"Nothing scheduled, due, or required in the next " +
              windowDays +
              " days" +
              (validProjectFilter ? " for this project." : " across the active portfolio.")}
          </p>
        ) : (
          <div className="attention-list">
            {items.map((item, i) => (
              <ItemRow key={item.kind + "-" + item.date + "-" + i} item={item} project={projectsById[item.projectId]} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
