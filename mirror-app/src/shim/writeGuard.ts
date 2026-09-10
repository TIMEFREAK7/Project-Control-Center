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
 */
type Mutator = (data: any) => void;
type UpdateFn = (mutator: Mutator) => void;

export function installWriteGuard(): UpdateFn {
  const realUpdate: UpdateFn = window.PCC.store.update as UpdateFn;

  window.PCC.store.update = function guardedUpdate(mutator: Mutator) {
    return realUpdate((data: any) => {
      const preserved: { [key: string]: unknown } = {};
      Object.keys(data).forEach((k) => {
        if (k !== "settings") preserved[k] = data[k];
      });
      mutator(data);
      Object.keys(preserved).forEach((k) => {
        data[k] = preserved[k];
      });
    });
  } as any;

  return realUpdate;
}
