const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { computeRelocatedPath, migrateIfNeeded } = require("./relocateStorage");

// Affects app.getName() and the default userData path (confirmed: the running app's
// userData directory does pick this up) — but NOT the Linux window manager class
// (WM_CLASS). That's set natively from package.json's "name" field before any JS here
// runs, too early for this call to change it; confirmed directly by inspecting a real
// running window's X11 properties. package.json's "name" is "project-control-center" for
// exactly this reason — see the linux.desktopName/syncDesktopName build config below,
// kept deliberately in sync with it so the .desktop entry's StartupWMClass actually
// matches the real runtime WM_CLASS (a mismatch here is why desktop environments may
// fail to associate the running window with the right taskbar/dock icon).
// MUST run before the storage-relocation block below: Electron's default userData path is
// derived from app.getName(), so reading the "original" path before this call would check
// the wrong location and silently skip migrating an existing user's data.
app.setName("Project Control Center");

// Relocate all local storage (localStorage + both IndexedDB databases, since they're all
// subfolders of Electron's userData directory) to live next to the installed app instead of
// the OS default (%APPDATA%\Project Control Center on Windows) — so wherever the Phase 1
// install wizard puts the app (any drive, any folder) is also where its data lives, with no
// separate "choose data folder" step. Only done for a real packaged install: in dev
// (`electron:dev`), app.getPath('exe') points at Electron's own binary inside node_modules,
// which is not where a real user's data should go.
if (app.isPackaged) {
  const originalUserDataPath = app.getPath("userData");
  const relocatedUserDataPath = computeRelocatedPath(app.getPath("exe"));

  // One-time migration for anyone updating from a version that stored data at the OS default
  // path. Copy, never move — the original is left in place as a safety net, never deleted
  // automatically, so a failed/partial copy can never look like data loss. If the copy fails
  // for any reason, stay on the original default path rather than switching to a possibly-
  // empty new location.
  const result = migrateIfNeeded(originalUserDataPath, relocatedUserDataPath);
  if (result.migrated) {
    console.log(`[PCC] Migrated data from ${originalUserDataPath} to ${relocatedUserDataPath}`);
  } else if (result.error) {
    console.error("[PCC] Storage relocation migration failed, staying on default userData path:", result.error);
  }
  if (!result.error) {
    app.setPath("userData", relocatedUserDataPath);
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, "icon.png");
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // electron-builder's `icon` config only brands the installed exe/AppImage file
    // itself (Explorer, shortcuts, Start Menu) — the actually-running window (title
    // bar, taskbar while open, Alt-Tab) falls back to Electron's default logo unless
    // set here explicitly. icon.png is copied in by scripts/copy-app.js.
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Redundant with the constructor option above on purpose: in this project's own bare
  // Xvfb test environment (no window manager/compositor), the constructor's `icon` alone
  // left _NET_WM_ICON empty on the X11 window — calling setIcon() explicitly is the more
  // direct, documented API and costs nothing to call in addition. Windows' icon handling
  // doesn't share X11's quirks here; this is belt-and-suspenders, not a Windows fix.
  win.setIcon(iconPath);
  // index.html here is a build-time copy of the repo root's self-contained bundle —
  // see ../scripts/copy-app.js. Never hand-edit it; it's overwritten on every build.
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
