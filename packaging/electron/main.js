const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { computeRelocatedPath, migrateIfNeeded } = require("./relocateStorage");
const { writeMirrorFile } = require("./mirrorFileWriter");

// One-way hourly data mirror (Phase 4): the renderer is contextIsolated with no direct
// filesystem access, so writing the mirror snapshot silently (no save dialog) goes
// through this IPC handler instead. See mirrorFileWriter.js for the actual (testable)
// write + validation logic.
ipcMain.handle("pcc-write-mirror-file", (event, folderPath, filename, content) => {
  writeMirrorFile(folderPath, filename, content);
});

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

  // One-way hourly data mirror (Phase 4): give the renderer one chance to write a final
  // mirror snapshot before the window actually closes. Hooked on the window's own
  // 'close' event (not app-level 'before-quit'/'window-all-closed') specifically so the
  // window and its webContents are still alive when the IPC message is sent — by the
  // time an app-level quit event fires, the window may already be destroyed. A 5s safety
  // timeout guarantees this never blocks quitting indefinitely if the renderer never
  // responds (e.g. it has no data-mirror listener wired, or is stuck).
  let quitExportDone = false;
  win.on("close", (event) => {
    if (quitExportDone) return; // second call, after finish() below — let it close for real
    event.preventDefault();
    const finish = () => {
      quitExportDone = true;
      win.close();
    };
    const timeout = setTimeout(finish, 5000);
    ipcMain.once("pcc-mirror-export-on-quit-done", () => {
      clearTimeout(timeout);
      finish();
    });
    win.webContents.send("pcc-mirror-export-on-quit");
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
