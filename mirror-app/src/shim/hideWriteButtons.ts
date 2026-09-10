/* Real UX ask, not just "block the write": even with writeGuard.ts silently reverting any
 * persistence and a toast explaining it, "+ Add Project" (Dashboard's first-run welcome
 * card and Portfolio's own toolbar) and a project card's "Edit"/"Archive" menu items still
 * LOOK like real, working actions in an app that's supposed to be strictly read-only --
 * "it's just a mirror app" shouldn't be able to open a create/edit form at all, not just
 * fail to save one.
 *
 * These are reused, unmodified components (Dashboard.tsx/Portfolio.tsx) with no external
 * hook to disable them from outside -- a form's open/closed state is fully internal
 * component state. Hiding the trigger buttons via a MutationObserver matching their known,
 * exact text is the only way to suppress specific elements of a reused component without
 * forking it (see this app's own "no silent forking of business logic" constraint).
 *
 * "Pin"/"Unpin" in the same card-menu dropdown is deliberately left alone: it only ever
 * touches data.settings.pinned_project_ids, a genuine, harmless, per-device preference the
 * write guard already lets through unchanged (see writeGuard.ts) -- there's nothing
 * misleading about it actually working, so nothing to hide.
 */
const HIDDEN_MENU_ITEM_TEXTS = new Set(["Edit", "Archive", "Unarchive"]);

function shouldHide(button: HTMLButtonElement): boolean {
  const text = (button.textContent || "").trim();
  if (text === "+ Add Project") return true;
  if (button.classList.contains("card-menu__item") && HIDDEN_MENU_ITEM_TEXTS.has(text)) return true;
  return false;
}

function sweep(root: ParentNode): void {
  root.querySelectorAll("button").forEach((btn) => {
    if (shouldHide(btn as HTMLButtonElement)) {
      (btn as HTMLElement).style.display = "none";
    }
  });
}

export function installWriteButtonHider(): void {
  // Real bug hit writing this: observing #mirror-app-outlet directly looked right but
  // never actually caught anything past the first mirror-data load. App.tsx's outlet
  // carries `key={refreshTick}` (a deliberate "force a full remount on every mirror
  // refresh" design, not an accident -- see App.tsx's own comment), which means React
  // destroys and recreates that exact DOM node every time refreshTick changes, orphaning
  // any observer attached to it. Watching the outer `.mirror-app-shell` instead -- which
  // has no key and is never recreated -- with subtree:true catches every mutation
  // regardless of how many times the outlet itself gets swapped out underneath it.
  const shell = document.querySelector(".mirror-app-shell");
  if (!shell) return;
  sweep(shell);
  const observer = new MutationObserver(() => sweep(shell));
  observer.observe(shell, { childList: true, subtree: true });
}
