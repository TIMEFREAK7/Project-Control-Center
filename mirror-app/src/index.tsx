/* Mirror app entry point. By the time this runs, the real (plain-script, unmodified)
 * src/js/store.js and src/js/projectContext.js have already executed and set
 * window.PCC.store / window.PCC.projectContext -- see mirror-app/build.js for the load
 * order, same JS_ORDER-style concatenation the main app's build.js already uses.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { installRouter } from "./router";
import { installNoOpModules } from "./shim/pcc";
import App from "./App";

installRouter();
installNoOpModules();

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(React.createElement(App));
