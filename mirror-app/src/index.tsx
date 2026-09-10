/* Mirror app entry point. By the time this runs, the real (plain-script, unmodified)
 * src/js/store.js and src/js/projectContext.js have already executed and set
 * window.PCC.store / window.PCC.projectContext -- see mirror-app/build.js for the load
 * order, same JS_ORDER-style concatenation the main app's build.js already uses.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { installRouter } from "./router";
import { installNoOpModules } from "./shim/pcc";
import { installWriteGuard } from "./shim/writeGuard";
import { initMirrorRead } from "./mirrorRead";
import App from "./App";

installRouter();
installNoOpModules();
// Must run after store.js has loaded (real update() to wrap) and before App's first
// render (so no reused page component ever observes the unwrapped update) -- see
// shim/writeGuard.ts's own header for why this app needs this at all: without it, the
// real, reused Portfolio.tsx forms genuinely create/edit content in an app that's meant
// to be strictly read-only.
const realStoreUpdate = installWriteGuard();
initMirrorRead(realStoreUpdate);

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(React.createElement(App));
