/* Mirror file read side -- ported forward from the Android half of the now-deleted
 * src/js/dataMirror.js (readAndroidMirrorFileIfNewer/startAndroidMirrorListeners), which
 * moved here per the 3-app split so the main Android app no longer duplicates this
 * capability. Same fixed path, same Filesystem.stat-then-readFile-if-newer pattern, same
 * "check once on resume, plus once on initial load" behavior -- real, working logic
 * carried over, not redesigned from scratch.
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

const MIRROR_DIRECTORY = "DOCUMENTS";
const MIRROR_PATH = "PCC-Mirror/pcc-mirror.json";

let lastAppliedMirrorMtime: number | null = null;

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

export function readMirrorFileIfNewer(): Promise<boolean> {
  if (!isCapacitorNative()) return Promise.resolve(false);
  const Filesystem = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
  if (!Filesystem) return Promise.resolve(false);

  return Filesystem.stat({ path: MIRROR_PATH, directory: MIRROR_DIRECTORY })
    .then((stat) => {
      const mtime = stat.mtime;
      if (lastAppliedMirrorMtime !== null && mtime <= lastAppliedMirrorMtime) {
        return false; // already loaded this exact version this session
      }
      return Filesystem.readFile({ path: MIRROR_PATH, directory: MIRROR_DIRECTORY, encoding: "utf8" }).then((result) => {
        applyMirrorJson(result.data);
        lastAppliedMirrorMtime = mtime;
        return true;
      });
    })
    .catch((err: any) => {
      if (err && err.message && String(err.message).indexOf("does not exist") === -1) {
        console.error("[PCC Mirror] read failed:", err);
      }
      return false;
    });
}

/* Called once at startup. onApplied fires only when a mirror file was actually found and
 * successfully applied (initial load included) so App.tsx knows to re-render with real
 * data instead of the empty starting store. */
export function startMirrorListeners(onApplied: () => void): void {
  readMirrorFileIfNewer().then((applied) => {
    if (applied) onApplied();
  });
  if (!isCapacitorNative()) return;
  const AppPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (AppPlugin && AppPlugin.addListener) {
    AppPlugin.addListener("resume", () => {
      readMirrorFileIfNewer().then((applied) => {
        if (applied) onApplied();
      });
    });
  }
}
