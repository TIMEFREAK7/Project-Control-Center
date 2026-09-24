/* Loose ambient typing for the Capacitor native bridge, scoped to mirror-app only (the
 * main react/ project's pcc.d.ts has no reason to know about Capacitor). Matches the
 * exact global-access pattern the original, now-deleted src/js/dataMirror.js Android read
 * side and src/js/pullToRefresh.js used -- window.Capacitor.Plugins.<Name>, never an
 * npm-imported @capacitor/* package, so this app needs no new npm dependency for it
 * either. Deliberately loose (any-typed plugin calls): Capacitor's own generated types
 * aren't available without installing its packages, and this app only ever calls the one
 * local MirrorFolder plugin (packaging/android-mirror/.../MirrorFolderPlugin.java).
 */
export {};

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        MirrorFolder?: {
          pickFolder(): Promise<{ picked: boolean; folderName?: string }>;
          readMirror(options: { ifNewerThan?: number }): Promise<{
            status: "no-folder" | "no-permission" | "not-found" | "unchanged" | "ok";
            folderName?: string;
            mtime?: number;
            data?: string;
          }>;
        };
      };
    };
  }
}
