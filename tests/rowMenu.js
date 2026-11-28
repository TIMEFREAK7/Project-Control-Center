// Gate 7.5c: register rows (Risks, RFI / TQ, Change Orders, Decisions, Meetings) keep only
// "Details" loose; Edit / Clone / Delete sit in the row's "⋯" menu, which renders its items only
// while open. openRowMenu(root, index) opens row `index` (negative counts from the end) so the
// test can then find "Edit"/"Delete" as before.
async function openRowMenu(root, index) {
  const toggles = Array.from(root.querySelectorAll('.project-card [aria-label="More actions"]'));
  const i = index < 0 ? toggles.length + index : index || 0;
  if (!toggles[i]) throw new Error("openRowMenu: no row menu at index " + index + " (" + toggles.length + " rows)");
  toggles[i].click();
  for (let n = 0; n < 10; n++) await new Promise((r) => setTimeout(r, 0));
}

module.exports = { openRowMenu };
