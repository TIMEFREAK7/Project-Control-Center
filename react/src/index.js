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
import ReactDOM from "react-dom/client";
import StorageManagementPage from "./pages/StorageManagement.jsx";

window.PCC = window.PCC || {};
window.PCC.React = React;
window.PCC.ReactDOM = ReactDOM;
window.PCC.reactPages = window.PCC.reactPages || {};
window.PCC.reactPages.storageManagement = StorageManagementPage;
