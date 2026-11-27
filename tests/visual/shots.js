// Phase 7 screenshot harness (Gate 7.0, 2026-11-26). Dev-only: not part of `npm test`, ships
// nothing. Seeds one fixed dataset (three projects in different health states, a 10-activity
// schedule each calculated by the real CPM engine, risks, RFIs, a change order, a commitment
// and a document) under a frozen IST clock, then screenshots the baseline screens in both
// themes at desktop and phone size. Every later Phase 7 gate reuses it for before/after pairs.
//
//   cd tests/visual && npm install            (once; playwright-core only, no browser download)
//   node shots.js --out <dir> [--screens dashboard,schedule-activities] [--themes light,dark]
//                 [--sizes desktop,phone] [--css <override.css>] [--icons <map.json>]
//                 [--fonts <dir>] [--axe <axe.min.js>] [--index <other index.html>] [--audit 1]
// --audit 1 (Gate 7.4): fails (exit 1) if a visible control is under 24 px without WCAG 2.5.8's
// spacing exception, or a visible field has no accessible name.
// --screens also takes any route name (e.g. vendors,cost) beyond the eight named screens.
//
// --css injects a stylesheet after load ({{FONTS}} in it becomes the --fonts dir as a file URL).
// --icons is {"navRouteKey": "<svg …>"} and replaces those sidebar icons. Both exist so a
// design variant can be previewed WITHOUT touching src/; neither is ever built into the app.
// Chromium: $CHROME, else the newest tools/playwright/chromium-*/ on this drive.
"use strict";
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright-core");

const REPO = path.resolve(__dirname, "..", "..");
let INDEX_URL = pathToFileURL(path.join(REPO, "index.html")).href; // --index <file> overrides
const NOW = "2026-11-20T10:00:00+05:30";

const SCREENS = {
  dashboard: { route: "dashboard" },
  portfolio: { route: "portfolio" },
  "schedule-activities": { route: "schedule", tab: "Activities" },
  "schedule-gantt": { route: "schedule", tab: "Gantt" },
  risks: { route: "risks" },
  "executive-center": { route: "executiveCenter" },
  documents: { route: "documents" },
  settings: { route: "settings" },
};
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 412, height: 915 } };

function args() {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!a.out) throw new Error("--out <dir> is required");
  if (a.index) INDEX_URL = pathToFileURL(path.resolve(a.index)).href; // e.g. an older build, for before/after
  const list = (v, all) => (v ? v.split(",") : Object.keys(all));
  return {
    out: path.resolve(a.out),
    screens: list(a.screens, SCREENS),
    sizes: list(a.sizes, SIZES),
    themes: a.themes ? a.themes.split(",") : ["light", "dark"],
    css: a.css ? fs.readFileSync(a.css, "utf8").split("{{FONTS}}").join(a.fonts ? pathToFileURL(path.resolve(a.fonts)).href : "") : null,
    icons: a.icons ? JSON.parse(fs.readFileSync(a.icons, "utf8")) : null,
    axe: a.axe ? path.resolve(a.axe) : null,
    audit: a.audit === "1" || a.audit === "true",
  };
}

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = path.resolve(REPO, "..", "..", "tools", "playwright");
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    for (const sub of ["chrome-win64/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      const p = path.join(root, d, sub);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error("No Chromium found: set CHROME or install one under tools/playwright");
}

// Runs IN THE PAGE. Builds the dataset through the store's own factories only.
function seed() {
  const S = window.PCC.store;
  const day = (iso, n) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const PROJECTS = [
    // Start dates and progress against the frozen clock (2026-11-20) give one project ahead of
    // its plan, one a little behind and one well behind, so float and status differ.
    { name: "Riverside Tower", code: "RVT", status: "on_track", progress: 78, start: "2026-09-14", slip: 0, done: 0.78 },
    { name: "Harbour Logistics Hub", code: "HLH", status: "at_risk", progress: 55, start: "2026-08-24", slip: 6, done: 0.55 },
    { name: "Northgate Water Plant", code: "NWP", status: "critical", progress: 30, start: "2026-08-10", slip: 18, done: 0.3 },
  ];
  const STEPS = [
    ["A100", "Site mobilisation", 5], ["A110", "Excavation and shoring", 12], ["A120", "Piling", 15],
    ["A130", "Pile caps and ground beams", 10], ["A140", "Basement slab", 8], ["A150", "Level 1 columns", 7],
    ["A160", "Level 1 slab pour", 6], ["A170", "MEP first fix", 14], ["A180", "Facade brackets", 9], ["A190", "Roof waterproofing", 6],
  ];
  const ids = [];
  S.update((d) => {
    d.settings.company_name = "Acme Projects";
    PROJECTS.forEach((p, pi) => {
      const proj = S.newProject({
        name: p.name, project_code: p.code, status: p.status, progress: p.progress, currency: "INR",
        budget: [420000000, 265000000, 180000000][pi], contract_value: [455000000, 290000000, 199000000][pi],
        start_date: p.start, end_date: day(p.start, 220), client: ["Meridian Estates", "PortCo", "City Water Board"][pi],
        location: ["Mumbai", "Chennai", "Pune"][pi], current_phase: "Construction",
      });
      d.projects.push(proj);
      const sch = S.newSchedule({ project_id: proj.id, name: p.code + " Programme Rev 0", status: "active", data_date: "2026-11-20" });
      d.schedules.push(sch);
      let cursor = p.start;
      let prev = null;
      STEPS.forEach((s, i) => {
        const start = cursor;
        const finish = day(start, s[2] - 1);
        const pct = Math.max(0, Math.min(100, Math.round((p.done * STEPS.length - i) * 100)));
        const act = S.newActivity({
          project_id: proj.id, schedule_id: sch.id, external_id: s[0], name: s[1], duration: s[2],
          original_duration: s[2], planned_start: start, planned_finish: finish, percent_complete: pct,
          status: pct >= 100 ? "complete" : pct > 0 ? "in_progress" : "not_started",
          actual_start: pct > 0 ? start : "", actual_finish: pct >= 100 ? day(finish, i === 3 ? p.slip : 0) : "",
        });
        d.activities.push(act);
        if (prev) d.relationships.push(S.newRelationship({ schedule_id: sch.id, project_id: proj.id, predecessor_id: prev.id, successor_id: act.id, type: "FS", lag: 0 }));
        prev = act;
        cursor = day(finish, 1);
      });
      d.risks.push(S.newRisk({ project_id: proj.id, type: "risk", title: "Monsoon delays to external works", probability: pi === 2 ? "high" : "medium", impact: "high", status: "open", owner: "Planning" }));
      d.risks.push(S.newRisk({ project_id: proj.id, type: "issue", title: "Rebar supplier lead time", probability: "medium", impact: pi === 0 ? "low" : "medium", status: "open", owner: "Procurement" }));
      d.rfis.push(S.newRfi({ project_id: proj.id, type: "rfi", number: p.code + "-RFI-014", subject: "Pile cap reinforcement clash", raised_by: "Site", date_raised: "2026-11-10", date_required: "2026-11-18", status: "open", priority: "high" }));
      d.rfis.push(S.newRfi({ project_id: proj.id, type: "tq", number: p.code + "-TQ-006", subject: "Waterproofing membrane substitute", raised_by: "Contractor", date_raised: "2026-11-02", date_required: "2026-11-30", status: "answered" }));
      ids.push({ project: proj.id, schedule: sch.id });
    });
    d.change_orders.push(S.newChangeOrder({ project_id: ids[1].project, number: "HLH-CO-003", title: "Additional dock leveller pits", status: "pending", cost_impact_amount: 3850000, schedule_impact_days: 9, date_requested: "2026-11-12" }));
    d.commitments.push(S.newCommitment({ project_id: ids[0].project, po_contract_number: "PO-RVT-0042", type: "purchase_order", status: "approved", committed_value: 28500000, approved_value: 28500000, commitment_date: "2026-10-01" }));
  });
  const doc = S.newDocument({ project_id: ids[0].project, filename: "RVT-STR-DWG-0101.pdf", mime_type: "application/pdf", file_size: 18, category: "drawing", status: "approved", document_number: "RVT-STR-DWG-0101", revision: "02" });
  return window.PCC.blobStore.putBlob(doc.id, "data:application/pdf;base64,JVBERi0xLjQK").then(() => {
    S.update((d) => d.documents.push(doc));
    window.PCC.projectContext.set(ids[0].project);
    return ids;
  });
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
}

async function main() {
  const opt = args();
  fs.mkdirSync(opt.out, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath() });
  const context = await browser.newContext({ timezoneId: "Asia/Kolkata", locale: "en-IN" });
  await context.clock.setFixedTime(new Date(NOW));
  // Record ids come from Math.random; seed it so every run stores the same bytes (Storage
  // Management shows a character count, which otherwise differed run to run).
  await context.addInitScript(() => {
    let s = 0x2f6b3a1d;
    Math.random = () => ((s = (s + 0x6d2b79f5) | 0), (((s ^ (s >>> 15)) * (1 | s)) >>> 0) / 4294967296);
  });
  const errors = [];

  // Seed once; localStorage and IndexedDB persist across pages in this context.
  const seedPage = await context.newPage();
  await seedPage.goto(INDEX_URL);
  await seedPage.waitForTimeout(800);
  const ids = await seedPage.evaluate(seed);
  for (const id of ids) {
    await seedPage.evaluate((pid) => { window.PCC.projectContext.set(pid); window.PCC.router.go("schedule"); }, id.project);
    await seedPage.waitForTimeout(500);
    await seedPage.getByRole("button", { name: "Calculate Schedule", exact: true }).first().click();
    await seedPage.waitForTimeout(500);
  }
  // No project context: portfolio screens show all three; Schedule falls back to its own picker.
  await seedPage.evaluate(() => { window.PCC.projectContext.set(""); window.PCC.store.flushPendingSave(); });
  await seedPage.close();

  const report = [];
  for (const theme of opt.themes) {
    const tp = await context.newPage();
    await tp.goto(INDEX_URL);
    await tp.waitForTimeout(500);
    await tp.evaluate((t) => { window.PCC.store.update((d) => (d.settings.theme = t)); window.PCC.store.flushPendingSave(); }, theme);
    await tp.close();
    for (const size of opt.sizes) {
      for (const name of opt.screens) {
        const sc = SCREENS[name] || { route: name }; // any other route name works as a screen
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(`${name}/${theme}/${size}: ${e.message}`));
        page.on("console", (m) => m.type() === "error" && errors.push(`${name}/${theme}/${size}: ${m.text()}`));
        await page.setViewportSize(SIZES[size]);
        await page.goto(INDEX_URL + "#/" + sc.route);
        await page.waitForTimeout(600);
        if (sc.tab) {
          await page.locator("button", { hasText: new RegExp("^" + sc.tab + "$") }).first().click();
          await page.waitForTimeout(400);
        }
        if (opt.css) await page.addStyleTag({ content: opt.css });
        if (opt.icons) {
          await page.evaluate((map) => {
            document.querySelectorAll(".sidebar__link").forEach((a) => {
              const svg = map[a.getAttribute("data-route")];
              const holder = a.querySelector(".sidebar__icon");
              if (svg && holder) holder.innerHTML = svg;
            });
          }, opt.icons);
        }
        await settle(page);
        const file = path.join(opt.out, `${name}-${theme}-${size}.png`);
        await page.screenshot({ path: file });
        const row = { shot: path.basename(file), hscroll: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) };
        if (opt.axe) {
          await page.addScriptTag({ path: opt.axe });
          const found = await page.evaluate(async () => {
            const r = await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } });
            const nodes = r.violations.flatMap((v) => v.nodes);
            return nodes.map((n) => {
              const d = (n.any[0] && n.any[0].data) || {};
              return { target: n.target.join(" "), text: (n.html || "").replace(/<[^>]+>/g, "").trim().slice(0, 40), fg: d.fgColor, bg: d.bgColor, ratio: d.contrastRatio, need: d.expectedContrastRatio };
            });
          });
          row.contrast = found.length;
          if (found.length) row.contrastNodes = found;
        }
        if (opt.audit) {
          // Gate 7.4: WCAG 2.5.8 target size (24 px, or a 24 px circle around a smaller target
          // that touches no other target) and an accessible name on every visible field.
          // Inline links inside running text are exempt (WCAG's inline exception).
          row.audit = await page.evaluate(() => {
            const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden"; };
            const label = (el) => (el.textContent || el.value || el.placeholder || el.getAttribute("aria-label") || "").trim().slice(0, 24);
            const targets = Array.from(document.querySelectorAll("main button, main a[href], main input:not([type=hidden]), main select, main textarea, main [role=button]"))
              .filter(vis).filter((el) => !(el.tagName === "A" && getComputedStyle(el).display === "inline"));
            const rects = targets.map((el) => el.getBoundingClientRect());
            const small = [];
            targets.forEach((el, i) => {
              const r = rects[i];
              if (r.width >= 24 && r.height >= 24) return;
              const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
              const clash = rects.some((o, k) => {
                if (k === i || targets[k].contains(el) || el.contains(targets[k])) return false;
                const dx = Math.max(o.left - cx, 0, cx - o.right), dy = Math.max(o.top - cy, 0, cy - o.bottom);
                return Math.hypot(dx, dy) < 12;
              });
              if (clash) small.push(el.tagName.toLowerCase() + " '" + label(el) + "' " + Math.round(r.width) + "x" + Math.round(r.height));
            });
            const named = (el) => (el.getAttribute("aria-label") || (el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute("title") || el.getAttribute("aria-labelledby") || "").trim();
            const unnamed = Array.from(document.querySelectorAll("main input:not([type=hidden]), main select, main textarea"))
              .filter(vis).filter((el) => !named(el)).map((el) => el.tagName.toLowerCase() + " '" + label(el) + "'");
            return { small, unnamed };
          });
        }
        report.push(row);
        await page.close();
      }
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(opt.out, "report.json"), JSON.stringify({ errors, shots: report }, null, 2));
  console.log(`${report.length} shots → ${opt.out}; console/page errors: ${errors.length}`);
  report.forEach((r) => console.log(`  ${r.shot}${r.hscroll ? "  SIDEWAYS SCROLL" : ""}${r.contrast != null ? "  contrast issues: " + r.contrast : ""}` +
    (r.audit ? `  small targets: ${r.audit.small.length}  unnamed fields: ${r.audit.unnamed.length}` : "")));
  errors.slice(0, 10).forEach((e) => console.log("  ERROR " + e));
  const auditFails = report.filter((r) => r.audit && (r.audit.small.length || r.audit.unnamed.length));
  auditFails.forEach((r) => console.log("  AUDIT " + r.shot + ": " + r.audit.small.concat(r.audit.unnamed).slice(0, 8).join(" | ")));
  if (auditFails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
