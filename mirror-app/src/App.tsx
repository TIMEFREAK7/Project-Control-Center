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
import { startMirrorListeners, chooseMirrorFolder, getMirrorStatus, type MirrorStatus } from "./mirrorRead";
import { formatDateTime } from "../../react/src/utils/localDate";
import { installPullToRefresh } from "./pullToRefresh";
import { installWriteButtonHider } from "./shim/hideWriteButtons";

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

function emptyStateText(st: MirrorStatus): string {
  switch (st.state) {
    case "no-folder":
      return "Choose the folder your sync tool (e.g. Syncthing) copies pcc-mirror.json into from the Windows app. You only need to do this once.";
    case "no-permission":
      return "This app no longer has access to the mirror folder. Choose it again.";
    case "not-found":
      return (
        "No pcc-mirror.json in “" +
        (st.folderName || "the chosen folder") +
        "” yet. Check that the Data Mirror is on in the Windows app and your sync tool has finished, then pull down to refresh."
      );
    case "error":
      return "Couldn't read the mirror file: " + (st.message || "unknown error") + ". Pull down to try again.";
    case "checking":
      return "Loading mirror data…";
    default:
      return "No mirror data found yet. Enable the Data Mirror in the Windows app's Settings and sync its folder to this phone.";
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>("dashboard");
  const [refreshTick, setRefreshTick] = useState(0);
  const [hasMirrorData, setHasMirrorData] = useState(false);
  const [mirrorStatus, setMirrorStatus] = useState<MirrorStatus>(getMirrorStatus());

  useEffect(() => {
    registerTabHost(
      () => activeTab,
      (tab) => setActiveTab(tab),
      () => setRefreshTick((n: number) => n + 1)
    );
  }, [activeTab]);

  useEffect(() => {
    startMirrorListeners(
      () => {
        setHasMirrorData(true);
        setRefreshTick((n: number) => n + 1);
      },
      (st) => setMirrorStatus(Object.assign({}, st))
    );
    installPullToRefresh(() => {
      setHasMirrorData(true);
      setRefreshTick((n: number) => n + 1);
    });
    // #mirror-app-outlet exists by the time this effect runs (it's rendered in the same
    // pass, and effects fire after the DOM commit) -- installs its own MutationObserver so
    // it keeps working across tab switches/refreshes without needing to re-run this effect.
    installWriteButtonHider();
  }, []);

  function handleChooseFolder() {
    chooseMirrorFolder().then((applied) => {
      if (applied) {
        setHasMirrorData(true);
        setRefreshTick((n: number) => n + 1);
      }
    });
  }

  const canPick = mirrorStatus.state !== "web";

  return (
    <div className="mirror-app-shell">
      <header className="mirror-app-tabbar no-print">
        <div className="mirror-app-tabbar__titlerow">
          <div className="mirror-app-tabbar__title">At a Glance</div>
          {canPick && mirrorStatus.state !== "no-folder" ? (
            <button type="button" className="mirror-app-source" onClick={handleChooseFolder} title="Change mirror folder">
              {mirrorStatus.folderName || "Mirror folder"}
              {mirrorStatus.state === "ok" && mirrorStatus.mtime ? " · " + formatDateTime(new Date(mirrorStatus.mtime).toISOString()) : ""}
            </button>
          ) : null}
        </div>
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
      {/* Real "page" class, not a bespoke wrapper -- this is what the main app's own
          main.page#page-outlet supplies (var(--space-5)/var(--space-4) padding, the base
          every reused page's own filter-row/KPI-grid/etc. layout math assumes it has).
          Without it every reused page rendered edge-to-edge unpadded -- a real bug caught
          on a real device, see mirror-app.css's own header for the full explanation. */}
      <main className="page" id="mirror-app-outlet" key={refreshTick}>
        {!hasMirrorData ? (
          <div className="panel" style={{ marginBottom: 16 }}>
            <p className="text-secondary" style={{ margin: 0 }}>
              {emptyStateText(mirrorStatus)}
            </p>
            {canPick ? (
              <button type="button" className="btn btn--primary" style={{ marginTop: 12 }} onClick={handleChooseFolder}>
                {mirrorStatus.state === "no-folder" ? "Choose mirror folder" : "Choose a different folder"}
              </button>
            ) : null}
          </div>
        ) : null}
        {renderActiveTab(activeTab)}
      </main>
    </div>
  );
}
