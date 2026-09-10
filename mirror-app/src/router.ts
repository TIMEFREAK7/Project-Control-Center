/* Minimal real router for the 4-tab "At a Glance" shell -- genuinely reimplemented, not
 * stubbed, because window.PCC.router.go()/.render() are called by the real page
 * components/services for two real reasons this app still needs to work: switching tabs
 * (Dashboard's own KPI cards call router.go(stat.route)) and refreshing the current tab
 * after the context switcher changes Company/Client/Project (contextSwitcher.ts calls
 * router.render() the same way the real app's shell header switcher does).
 *
 * Deliberately NOT src/js/router.js: no hash routing, no suppressNextHashRender race (see
 * CLAUDE.md's own documented gotcha for that flag -- irrelevant here, there's no
 * hashchange event in this app at all), no 30-route registry. Just the 4 known tabs; any
 * other route name (a "jump to my full record" call from a stubbed-out module, none of
 * which exist in this app) is a silent no-op, exactly like this task's pre-approved
 * "no-op navigate-to-nonexistent-page" extension.
 */
export type TabName = "dashboard" | "myWork" | "actionCentre" | "portfolio";

const KNOWN_TABS: TabName[] = ["dashboard", "myWork", "actionCentre", "portfolio"];

let activeTab: TabName = "dashboard";
let onTabChange: ((tab: TabName) => void) | null = null;
let onRerenderRequested: (() => void) | null = null;

function isKnownTab(name: string): name is TabName {
  return (KNOWN_TABS as string[]).indexOf(name) !== -1;
}

/* Called once by App.tsx on mount to wire this module up to React state -- the same
 * "this is the one place that knows both <the real logic> and <this app's own host>
 * exist" role src/js/reactBridge.js's own header comment describes for itself. */
export function registerTabHost(getActive: () => TabName, setActive: (tab: TabName) => void, rerender: () => void): void {
  activeTab = getActive();
  onTabChange = setActive;
  onRerenderRequested = rerender;
}

function go(name: string): void {
  if (!isKnownTab(name)) return; // e.g. a stubbed module's router.go("meetings") -- nowhere to go
  activeTab = name;
  if (onTabChange) onTabChange(name);
}

function render(): void {
  if (onRerenderRequested) onRerenderRequested();
}

function currentRouteName(): string {
  return activeTab;
}

export function installRouter(): void {
  window.PCC.router = { go, render, currentRouteName };
}
