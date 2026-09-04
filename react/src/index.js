/* React migration entry point (Post-Phase-5 Engineering Evolution, priority 1 — React
 * architecture and progressive migration, §6-11 of the master upgrade prompt).
 *
 * This is a pure side-effect module, not a public export: it attaches React, ReactDOM,
 * and every migrated page's component onto window.PCC so the existing vanilla router
 * (src/js/router.js) and the small reactBridge.js glue (src/js/reactBridge.js) can reach
 * them without this bundle needing to know anything about routing itself. Adding a new
 * migrated page later is exactly two lines here: import it, then assign it onto
 * window.PCC.reactPages under the same name the vanilla page module already registers
 * with window.PCC.pages.
 *
 * Deliberately no app-wide React root, no client-side router of its own, no global
 * state store — see react/README.md (if one exists) or the master prompt's own §7: this
 * migrates ONE PAGE AT A TIME behind the existing router, not a full-app rewrite.
 */
import React from "react";
import ReactDOMClient from "react-dom/client";
import { flushSync } from "react-dom";
import StorageManagementPage from "./pages/StorageManagement.tsx";
import ComingSoonPage from "./pages/NotFound.tsx";
import VendorPerformanceCentrePage from "./pages/VendorPerformanceCentre.tsx";
import DocumentControlDashboardPage from "./pages/DocumentControlDashboard.tsx";
import DocumentTypesPage from "./pages/DocumentTypes.tsx";
import ActionCentrePage from "./pages/ActionCentre.tsx";
import ProjectLookaheadPage from "./pages/ProjectLookahead.tsx";
import SettingsPage from "./pages/Settings.tsx";
import MyWorkPage from "./pages/MyWork.tsx";
import LessonsLearnedPage from "./pages/LessonsLearned.tsx";
import KnowledgeBasePage from "./pages/KnowledgeBase.tsx";
import OrganizationsPage from "./pages/Organizations.tsx";
import DelayRecoveryDashboardPage from "./pages/DelayRecoveryDashboard.tsx";
import DecisionRegisterPage from "./pages/DecisionRegister.tsx";
import DashboardPage from "./pages/Dashboard.tsx";
import ProjectWorkspacePage from "./pages/ProjectWorkspace.tsx";
import ReportsPage from "./pages/Reports.tsx";
import VendorsPage from "./pages/Vendors.tsx";
import DocumentsPage from "./pages/Documents.tsx";
import ExecutiveCenterPage from "./pages/ExecutiveCenter.tsx";
import RisksPage from "./pages/Risks.tsx";
import CommitmentsPage from "./pages/Commitments.tsx";
import ChangeOrdersPage from "./pages/ChangeOrders.tsx";
import RfisPage from "./pages/Rfis.tsx";
import DailyLogPage from "./pages/DailyLog.tsx";
import MeetingsPage from "./pages/Meetings.tsx";
import CostPage from "./pages/Cost.tsx";
import ResourcesPage from "./pages/Resources.tsx";
import PortfolioPage from "./pages/Portfolio.tsx";
import SchedulePage from "./pages/Schedule.tsx";

window.PCC = window.PCC || {};
window.PCC.React = React;
// flushSync lives in the main "react-dom" package, not "react-dom/client" — merged onto
// the same window.PCC.ReactDOM object reactBridge.js already expects createRoot on.
// reactBridge.js wraps every mount's initial root.render() in flushSync() specifically so
// React's normally-asynchronous initial commit (see its own comment) behaves exactly like
// every vanilla page's synchronous DOM write — no existing or future test needs to know or
// care that a given route is React-backed.
window.PCC.ReactDOM = Object.assign({}, ReactDOMClient, { flushSync: flushSync });
window.PCC.reactPages = window.PCC.reactPages || {};
window.PCC.reactPages.storageManagement = StorageManagementPage;
window.PCC.reactPages.comingSoon = ComingSoonPage;
window.PCC.reactPages.vendorPerformanceCentre = VendorPerformanceCentrePage;
window.PCC.reactPages.documentControlDashboard = DocumentControlDashboardPage;
window.PCC.reactPages.documentTypes = DocumentTypesPage;
window.PCC.reactPages.actionCentre = ActionCentrePage;
window.PCC.reactPages.projectLookahead = ProjectLookaheadPage;
window.PCC.reactPages.settings = SettingsPage;
window.PCC.reactPages.myWork = MyWorkPage;
window.PCC.reactPages.lessonsLearned = LessonsLearnedPage;
window.PCC.reactPages.knowledgeBase = KnowledgeBasePage;
window.PCC.reactPages.organizations = OrganizationsPage;
window.PCC.reactPages.delayRecoveryDashboard = DelayRecoveryDashboardPage;
window.PCC.reactPages.decisionRegister = DecisionRegisterPage;
window.PCC.reactPages.dashboard = DashboardPage;
window.PCC.reactPages.projectWorkspace = ProjectWorkspacePage;
window.PCC.reactPages.reports = ReportsPage;
window.PCC.reactPages.risks = RisksPage;
window.PCC.reactPages.commitments = CommitmentsPage;
window.PCC.reactPages.changeOrders = ChangeOrdersPage;
window.PCC.reactPages.rfis = RfisPage;
window.PCC.reactPages.dailylog = DailyLogPage;
window.PCC.reactPages.meetings = MeetingsPage;
window.PCC.reactPages.cost = CostPage;
window.PCC.reactPages.resources = ResourcesPage;
window.PCC.reactPages.portfolio = PortfolioPage;
window.PCC.reactPages.vendors = VendorsPage;
window.PCC.reactPages.documents = DocumentsPage;
window.PCC.reactPages.executiveCenter = ExecutiveCenterPage;
window.PCC.reactPages.schedule = SchedulePage;
