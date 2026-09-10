/* The mirror app's window.PCC shim.
 *
 * REAL (unmodified, reused) pieces — NOT written here, loaded as plain scripts before
 * this bundle in mirror-app/build.js, exactly like the main app's own JS_ORDER: the real
 * src/js/store.js (get/update/migrate/newX()/every *_STATUSES constant), the real
 * src/js/projectContext.js (get/set/isPinned/togglePin/setCompany/setClient/...), and the
 * real src/js/reactBridge.js (mount/unmount). None of PCC's actual domain logic is
 * reimplemented here — see CLAUDE.md's "React must not own core calculations" and this
 * task's own "no silent forking of business logic" constraint.
 *
 * EVERYTHING ELSE below is either a genuinely small real reimplementation (router,
 * because this app has 4 tabs and no hash routing — see router.ts) or a deliberate,
 * pre-approved safe no-op stub: Dashboard/MyWork/ActionCentre/Portfolio (and their real
 * services) reference ~20 other window.PCC.* modules purely for "click an item -> jump to
 * and pre-expand it on its own full editing page" (window.PCC.meetings.expandMeeting +
 * router.go("meetings"), etc.) or for other write/export actions (archive.exportProject,
 * files.open). None of those destinations or actions exist in this 4-tab read-only app —
 * there's nowhere to jump to and nothing to write. Stubbing them to safe no-ops (so a
 * click never throws, but nothing happens) is the explicitly pre-approved extension of
 * this task's own "write buttons may just no-op" allowance to "no-op navigate-to-
 * nonexistent-page buttons" too. See the Phase 2 report for the full list of what's real
 * vs. stubbed.
 */
import { buildContextSwitcher } from "./contextSwitcher";
import type { TabName } from "../router";

export function installNoOpModules(): void {
  const PCC = window.PCC as any;

  PCC.notify = function notify(): void {
    // Deliberately silent: on the real app this shows a toast for things like "Choose or
    // create a Company first" ahead of a create/save action. Every create/save action in
    // this read-only app already no-ops before reaching notify() (nothing calls
    // store.update() on a path a mirror-app user can actually trigger meaningfully), so
    // there is nothing useful to tell them here.
  };

  PCC.layout = {
    refreshTitleBlock: function () {},
    buildContextSwitcher: buildContextSwitcher,
  };

  const stubNav = function () {};

  PCC.meetings = { expandMeeting: stubNav, filterByProject: stubNav };
  PCC.rfis = { expandRfi: stubNav, createFromMeeting: stubNav, filterByProject: stubNav };
  PCC.portfolio = { viewProject: stubNav, filterByStatus: stubNav };
  PCC.schedule = { viewActivity: stubNav, viewBaselines: stubNav };
  PCC.changeOrders = { expandChangeOrder: stubNav, createFromRisk: stubNav, createFromRfi: stubNav, createFromMeeting: stubNav, filterByProject: stubNav };
  PCC.decisionRegister = { expandDecision: stubNav, createFromMeeting: stubNav };
  PCC.vendors = { openProfile: stubNav, filterByProject: stubNav };
  PCC.risks = { expandRisk: stubNav, createFromMeeting: stubNav, filterByProject: stubNav };
  PCC.resources = { filterByProject: stubNav, expandAssignment: stubNav };
  PCC.dailyLog = { filterByProject: stubNav, expandLog: stubNav };
  PCC.commitments = { filterByProject: stubNav, expandCommitment: stubNav };
  PCC.projectWorkspace = { viewProject: stubNav };
  PCC.lessonsLearned = { createFromMeeting: stubNav };
  PCC.documents = { expandDocument: stubNav };

  // Optional per the real app's own interface (activeTypes() gates Portfolio's document
  // requirements UI) -- omitting it entirely is exactly what an install with no document
  // types configured already looks like on the real app, per portfolioService.ts's own
  // ternary guard.
  PCC.documentTypes = undefined;

  PCC.files = {
    filterByProject: stubNav,
    open: stubNav, // real app opens the file viewer; nothing to view/preview here
    createFromMeeting: stubNav,
    latestOnly: function (documents: unknown[]) {
      return documents; // real app's own de-dup-by-revision logic; identity is a safe, honest fallback
    },
    summary: function () {
      return "";
    },
    categoryLabel: function (category: string | undefined) {
      return category || "";
    },
  };

  PCC.archive = {
    exportAll: stubNav,
    exportProject: stubNav, // real app downloads a zip; no export capability in this app
  };

  PCC.cost = {
    projectCostSummary: function () {
      return { budgeted: 0, actual: 0, variance: 0, usingPortfolioBudget: false };
    },
    filterByProject: stubNav,
  };

  PCC.resourceLevelingEngine = {
    portfolioOverAllocationSummary: function () {
      return [];
    },
  };

  PCC.executiveCenter = {
    viewProject: stubNav,
    // getDelayImpactSummary/getDiagnostics are optional (`?:`) on the real interface and
    // genuinely guarded at every call site in dashboardService.ts/myWorkService.ts --
    // omitted, same as an install where that engine simply hasn't computed anything yet.
    //
    // getHealthSummary/getSchedulePerformanceSummary are ALSO typed optional, but
    // portfolioService.ts's own getHealthSummary()/getSchedulePerformanceSummary()
    // exports (used by Portfolio.tsx's CompareTable, the "compare projects" view) call
    // them unconditionally with a `!` non-null assertion -- confirmed by a real Chromium
    // crash during this app's own verification pass (TypeError: ...getHealthSummary is
    // not a function), not caught by typecheck since TS trusts the `!`. Real bug this
    // shim needed to cover, not an optional one -- stubbed with safe zero/null defaults
    // matching ExecutiveCenterHealthSummary/ExecutiveCenterSchedulePerformanceSummary.
    getHealthSummary: function () {
      return { score: null, rag: "on_track", scheduleRag: "on_track", riskRag: "on_track", delayedActivityCount: 0 };
    },
    getSchedulePerformanceSummary: function () {
      return { score: null, rag: "on_track", spi: null, spiT: null, unaddressedDelayDays: 0 };
    },
  };
}
