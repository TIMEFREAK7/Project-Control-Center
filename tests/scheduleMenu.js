// Gate 7.5b: Schedule's toolbar actions live in the Import ▾ / Export ▾ / ⋯ menus, which render
// their items only while open. openScheduleMenu(ctx, label) opens the menu that holds `label`
// (no-op when that button is already showing). ctx: a JSDOM, a window or a document.
const MENU_OF = {
  "Import Schedule": "Import",
  "Edit Excel": "Import",
  "Export to MS Project": "Export",
  "Export to Primavera P6": "Export",
  "Save Baseline": "⋯",
  "Edit Schedule": "⋯",
  "Delete Schedule…": "⋯",
  "Summarize Schedule (AI)": "⋯",
};

async function openScheduleMenu(ctx, label) {
  const doc = (ctx.window && ctx.window.document) || ctx.document || ctx;
  const buttons = () => Array.from(doc.querySelectorAll("button"));
  if (buttons().some((b) => b.textContent.trim() === label)) return;
  const menu = MENU_OF[label];
  if (!menu) throw new Error("openScheduleMenu: no menu known for '" + label + "'");
  const toggle = Array.from(doc.querySelectorAll(".toolbar button")).find((b) =>
    menu === "⋯" ? b.getAttribute("aria-label") === "Schedule actions" : b.textContent.trim() === menu + " ▾"
  );
  if (!toggle) throw new Error("openScheduleMenu: '" + menu + "' menu not found for '" + label + "'");
  toggle.click();
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

module.exports = { openScheduleMenu, MENU_OF };
