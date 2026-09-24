/* Mirror file read side -- ported forward from the Android half of the now-deleted
 * src/js/dataMirror.js (readAndroidMirrorFileIfNewer/startAndroidMirrorListeners), which
 * moved here per the 3-app split so the main Android app no longer duplicates this
 * capability. Same read-only-if-newer pattern, checked on load and whenever the app
 * returns to the foreground. (The file's LOCATION changed since; see below.)
 *
 * One deliberate change from the original: the original called
 * window.PCC.store.importFromJsonString(), which migrates AND writes any inline blobs out
 * to IndexedDB (via window.PCC.blobStore, excluded from this app to keep the bundle
 * genuinely minimal -- see mirror-app/package.json's own description) before nulling them
 * out of the record. That's exactly backwards for a stateless read-only viewer: it would
 * throw (no blobStore here) and, even stubbed out, would strip the inline photo/document
 * bytes this app needs to actually display. Calling window.PCC.store.migrate() directly
 * and committing the result via store.update() (see applyMirrorJson below) keeps blobs
 * inline in memory instead, which is both simpler and correct for read-only display.
 */

/* Where the file comes from changed on 2026-09-24: it used to be a FIXED path read through
 * the Filesystem plugin (Documents/PCC-Mirror/pcc-mirror.json). On Android 11+ scoped
 * storage an app with no storage permission can't read a non-media file ANOTHER app (the
 * sync tool) wrote there, so that read could never see a synced file. Now the user picks
 * the sync folder once through Android's own folder picker (Storage Access Framework), via
 * the local MirrorFolder plugin (packaging/android-mirror/.../MirrorFolderPlugin.java),
 * which keeps a persistent read-only grant to it. */

export type MirrorStatus = {
  state: "web" | "checking" | "no-folder" | "no-permission" | "not-found" | "ok" | "error";
  folderName?: string;
  mtime?: number;
  message?: string;
};

let lastAppliedMirrorMtime: number | null = null;
let status: MirrorStatus = { state: "checking" };
let statusListener: ((s: MirrorStatus) => void) | null = null;

function setStatus(next: MirrorStatus): void {
  status = next;
  if (statusListener) statusListener(status);
}

export function getMirrorStatus(): MirrorStatus {
  return status;
}

/* The real, UNWRAPPED store.update() -- see shim/writeGuard.ts's own header for why this
 * needs to bypass the guard installed onto window.PCC.store.update (that guard reverts
 * any non-"settings" mutation, which would otherwise also block this legitimate
 * whole-data-object replacement). Set once by index.tsx right after installWriteGuard(). */
let realUpdate: ((mutator: (data: any) => void) => void) | null = null;

export function initMirrorRead(update: (mutator: (data: any) => void) => void): void {
  realUpdate = update;
}

function isCapacitorNative(): boolean {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/* Real store.js's migrate() is reused unmodified (exposed on window.PCC.store.migrate
 * specifically for this, see store.js's own comment on that export) -- this function's
 * only job is committing its result into the same live `data` object store.js's get()
 * already returns, via the real (unwrapped) update() so nothing here reimplements how the
 * store commits a change. */
export function applyMirrorJson(jsonText: string): void {
  if (!realUpdate) throw new Error("applyMirrorJson called before initMirrorRead()");
  const parsed = JSON.parse(jsonText);
  const migrated = (window.PCC.store as any).migrate(parsed);
  realUpdate((d: any) => {
    Object.keys(d).forEach((k) => delete d[k]);
    Object.assign(d, migrated);
  });
}

function mirrorFolderPlugin() {
  if (!isCapacitorNative()) return null;
  return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MirrorFolder) || null;
}

export function readMirrorFileIfNewer(): Promise<boolean> {
  const plugin = mirrorFolderPlugin();
  if (!plugin) {
    setStatus({ state: "web" });
    return Promise.resolve(false);
  }
  return plugin
    .readMirror(lastAppliedMirrorMtime !== null ? { ifNewerThan: lastAppliedMirrorMtime } : {})
    .then((res) => {
      if (res.status === "unchanged") {
        setStatus({ state: "ok", folderName: res.folderName, mtime: lastAppliedMirrorMtime || undefined });
        return false;
      }
      if (res.status !== "ok") {
        setStatus({ state: res.status, folderName: res.folderName });
        return false;
      }
      applyMirrorJson(res.data || "");
      lastAppliedMirrorMtime = res.mtime || Date.now();
      setStatus({ state: "ok", folderName: res.folderName, mtime: lastAppliedMirrorMtime });
      return true;
    })
    .catch((err: any) => {
      console.error("[PCC Mirror] read failed:", err);
      setStatus({ state: "error", folderName: status.folderName, message: (err && err.message) || String(err) });
      return false;
    });
}

/* Opens Android's folder picker. Resolves true if a new mirror file was loaded from the
 * chosen folder. A cancelled picker leaves the previous folder in place. */
export function chooseMirrorFolder(): Promise<boolean> {
  const plugin = mirrorFolderPlugin();
  if (!plugin) return Promise.resolve(false);
  return plugin
    .pickFolder()
    .then((res) => {
      if (!res.picked) return false;
      lastAppliedMirrorMtime = null; // a different folder: load whatever it holds
      return readMirrorFileIfNewer();
    })
    .catch((err: any) => {
      setStatus({ state: "error", message: (err && err.message) || String(err) });
      return false;
    });
}

/* Called once at startup. onApplied fires only when a mirror file was actually found and
 * successfully applied (initial load included) so App.tsx knows to re-render with real
 * data instead of the empty starting store. */
export function startMirrorListeners(onApplied: () => void, onStatus: (s: MirrorStatus) => void): void {
  statusListener = onStatus;
  const check = () =>
    readMirrorFileIfNewer().then((applied) => {
      if (applied) onApplied();
    });
  check();
  // Re-check whenever the app comes back to the foreground. visibilitychange instead of
  // the Capacitor App plugin's "resume": that plugin was never installed in this project,
  // so the old resume listener silently never ran.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}
