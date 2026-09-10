/* 4-tab shell -- the one thing genuinely unique to this app's UI, since the main app has
 * no equivalent "just these 4 pages, nothing else" shell. Renders the real, unmodified
 * Dashboard/MyWork/ActionCentre/Portfolio page components directly (React.createElement,
 * same as src/js/reactBridge.js's own mount() does for the main app's router) -- no
 * per-tab unmount/remount via reactBridge, since there's no router.js outlet-wipe to
 * mirror here; React's own reconciliation handles swapping the rendered tab.
 */
import React, { useEffect, useState } from "react";
import DashboardPage from "../../react/src/pages/Dashboard.tsx";
import MyWorkPage from "../../react/src/pages/MyWork.tsx";
import ActionCentrePage from "../../react/src/pages/ActionCentre.tsx";
import PortfolioPage from "../../react/src/pages/Portfolio.tsx";
import { registerTabHost, type TabName } from "./router";
import { startMirrorListeners } from "./mirrorRead";
import { installPullToRefresh } from "./pullToRefresh";

const TABS: { name: TabName; label: string }[] = [
  { name: "dashboard", label: "Dashboard" },
  { name: "myWork", label: "My Work" },
  { name: "actionCentre", label: "Action Centre" },
  { name: "portfolio", label: "Portfolio" },
];

function renderActiveTab(tab: TabName): React.ReactElement {
  switch (tab) {
    case "dashboard":
      return React.createElement(DashboardPage, {});
    case "myWork":
      return React.createElement(MyWorkPage, {});
    case "actionCentre":
      return React.createElement(ActionCentrePage, {});
    case "portfolio":
      return React.createElement(PortfolioPage, {});
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>("dashboard");
  const [refreshTick, setRefreshTick] = useState(0);
  const [hasMirrorData, setHasMirrorData] = useState(false);

  useEffect(() => {
    registerTabHost(
      () => activeTab,
      (tab) => setActiveTab(tab),
      () => setRefreshTick((n: number) => n + 1)
    );
  }, [activeTab]);

  useEffect(() => {
    startMirrorListeners(() => {
      setHasMirrorData(true);
      setRefreshTick((n: number) => n + 1);
    });
    installPullToRefresh(() => {
      setHasMirrorData(true);
      setRefreshTick((n: number) => n + 1);
    });
  }, []);

  return (
    <div className="mirror-app-shell">
      <header className="mirror-app-tabbar no-print">
        <div className="mirror-app-tabbar__title">At a Glance</div>
        <nav className="mirror-app-tabbar__nav">
          {TABS.map((t) => (
            <button
              key={t.name}
              type="button"
              className={"mirror-app-tabbar__tab" + (activeTab === t.name ? " mirror-app-tabbar__tab--active" : "")}
              onClick={() => setActiveTab(t.name)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {!hasMirrorData ? (
        <div className="panel" style={{ margin: 16 }}>
          <p className="text-secondary" style={{ margin: 0 }}>
            No mirror data found yet. Enable the Data Mirror in the Windows app's Settings, point a sync tool at the same
            folder this device reads from, then pull down to refresh.
          </p>
        </div>
      ) : null}
      <div id="mirror-app-outlet" key={refreshTick}>
        {renderActiveTab(activeTab)}
      </div>
    </div>
  );
}
