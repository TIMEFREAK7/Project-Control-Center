/* Real bug fix (2026-09-10): the real, reused Portfolio.tsx/portfolioService.ts (and every
 * other reused page/service) call window.PCC.store.update() completely normally to
 * create/edit real content -- since store.js's real update() genuinely mutates the live
 * data and this app never overrode it, "+ Add Project" and friends actually worked and
 * persisted, in an app that's supposed to be strictly read-only. Confirmed by the user on
 * a real device, not hypothetical.
 *
 * The fix can't be "make window.PCC.store.update a no-op" -- the REAL, reused
 * src/js/projectContext.js (setCompany/setClient/set/togglePin/rememberLastUsedName) also
 * calls window.PCC.store.update() for every one of its own genuinely-real operations (the
 * Company/Client/Project context switcher has to keep working, see contextSwitcher.ts's
 * own header), and it looks up window.PCC.store.update fresh on every call rather than
 * capturing a reference at load time, so neutering the global would break it too.
 *
 * The actual fix: every legitimate mutation this read-only app ever needs only ever
 * touches `data.settings` (context switching, pinned projects, last-used-name memory) --
 * literally nothing else. So the guard lets a mutator run for real, then reverts every
 * top-level key except `settings` back to its pre-mutation value before the real update()
 * returns (and therefore before scheduleSave()/notifyListeners() ever fires) -- an
 * attempted create/edit runs, has zero lasting effect, and is never even visible for a
 * frame. installWriteGuard() must run once, after the real store.js has loaded (so there
 * is a real update() to wrap) and BEFORE any reused page component's first render (so
 * nothing observes the unwrapped function) -- see index.tsx's own load order.
 *
 * mirrorRead.ts's own applyMirrorJson() is the one legitimate exception that genuinely
 * needs to replace the WHOLE data object (that's the entire point of loading a mirror
 * snapshot) -- it receives the real, unwrapped update function this call returns and uses
 * that directly instead of going through the now-guarded window.PCC.store.update.
 *
 * installWriteGuard() also wraps window.PCC.notify to drop every "success"-severity
 * message. Real bug hit while verifying the toast fix below: portfolioService.ts's
 * saveProject() calls window.PCC.notify("Project added.", "success") unconditionally,
 * AFTER window.PCC.store.update() returns -- so even with the guard correctly reverting
 * the write, the user saw BOTH "This is a read-only view..." AND "Project added." stacked
 * together, which reads as contradictory nonsense. Can't suppress that one call without
 * forking portfolioService.ts, so instead: every "success" notify in this codebase is
 * definitionally reporting a create/update/delete that just happened -- which can never
 * actually be true in a strictly read-only app -- so "success" is dropped globally, not
 * just around this one call. "info"/"warning"/"error" (including this guard's own
 * read-only notice) still show normally.
 */
type Mutator = (data: any) => void;
type UpdateFn = (mutator: Mutator) => void;

export function installWriteGuard(): UpdateFn {
  const realUpdate: UpdateFn = window.PCC.store.update as UpdateFn;

  const realNotify = window.PCC.notify;
  if (realNotify) {
    window.PCC.notify = function guardedNotify(message: string, severity?: string) {
      if (severity === "success") return;
      return realNotify(message, severity);
    } as any;
  }

  window.PCC.store.update = function guardedUpdate(mutator: Mutator) {
    return realUpdate((data: any) => {
      // Real bug, fixed 2026-09-10: the first version of this guard captured
      // `preserved[k] = data[k]` -- a REFERENCE to each array/object, not a copy. Real
      // mutations in this codebase are almost always in-place (`d.projects.push(...)`,
      // matching store.js's own convention throughout), which mutates that SAME
      // referenced array -- so "restoring" `data[k] = preserved[k]` was a no-op, since
      // preserved[k] and the already-mutated data[k] were the identical object the whole
      // time. Confirmed on a real device: "+ Add Project" still persisted after the first
      // fix. A real snapshot needs an actual deep copy, taken before the mutator runs, so
      // it can't be affected by whatever the mutator does in place. JSON round-trip is
      // safe here specifically because every non-settings field in this store is plain
      // JSON-serializable data (the same guarantee buildExportJson() already relies on).
      const snapshot: { [key: string]: unknown } = {};
      const snapshotJson: { [key: string]: string } = {};
      Object.keys(data).forEach((k) => {
        if (k === "settings") return;
        const json = JSON.stringify(data[k]);
        snapshotJson[k] = json;
        snapshot[k] = JSON.parse(json);
      });

      mutator(data);

      // Real UX bug fixed alongside the reference-vs-copy bug above: reverting a write
      // silently (the earlier version of this guard) leaves the real, reused form UI
      // looking like it succeeded -- Portfolio.tsx's ProjectForm closes and returns to the
      // list either way, since onSaved() runs unconditionally after saveProject(). A user
      // has no way to tell "nothing happened" from "it saved" without this. So: compare
      // each non-settings key's JSON against its pre-mutation snapshot; if anything
      // outside settings actually changed, tell them via the real toast (src/js/
      // notifications.js, loaded for exactly this) BEFORE reverting it -- a
      // Company/Client/Project switch (settings-only) stays completely silent, same as
      // it's always been.
      let attemptedWrite = false;
      Object.keys(data).forEach((k) => {
        if (k === "settings") return;
        if (JSON.stringify(data[k]) !== snapshotJson[k]) attemptedWrite = true;
      });
      Object.keys(data).forEach((k) => {
        if (k === "settings") return;
        if (!(k in snapshotJson)) attemptedWrite = true; // a whole new top-level key appeared
      });
      if (attemptedWrite && window.PCC.notify) {
        window.PCC.notify("This is a read-only view — changes here aren't saved.", "info");
      }

      Object.keys(data).forEach((k) => {
        if (k === "settings") return;
        if (k in snapshot) {
          data[k] = snapshot[k];
        } else {
          delete data[k]; // the mutator added a whole new top-level key -- revert that too
        }
      });
    });
  } as any;

  return realUpdate;
}
