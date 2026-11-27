// Gate 7.2 (2026-11-27): the Phase 7 foundation tokens chosen at Gate 7.0 are what styles.css
// actually ships (see .claude/docs/DESIGN_SYSTEM.md). Source scan of styles.css and the two
// build scripts; no DOM. Contrast is checked separately in real Chromium with axe.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "src", "css", "styles.css"), "utf8");

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.message);
  }
}

function block(selector) {
  const i = css.indexOf(selector + " {");
  assert.ok(i >= 0, "no block for " + selector);
  return css.slice(i, css.indexOf("\n}", i));
}
function token(src, name) {
  const m = new RegExp("\\s" + name.replace(/[-]/g, "\\-") + ":\\s*([^;]+);").exec(src);
  return m ? m[1].trim().toLowerCase() : null;
}

const LIGHT = { "--bg-default": "#ffffff", "--bg-paper": "#ffffff", "--bg-paper-raised": "#f8fafc", "--text-primary": "#0f172a",
  "--text-secondary": "#475569", "--divider": "#e2e8f0", "--hover-bg": "#f1f5f9", "--signal-amber": "#2563eb",
  "--signal-amber-dark": "#1d4ed8", "--ink": "#0f172a", "--on-ink": "#ffffff" };
const DARK = { "--bg-default": "#0b0f14", "--bg-paper": "#0b0f14", "--bg-paper-raised": "#111821", "--text-primary": "#e2e8f0",
  "--text-secondary": "#94a3b8", "--divider": "#1e293b", "--hover-bg": "#131b26", "--signal-amber": "#60a5fa",
  "--signal-amber-dark": "#3b82f6", "--ink": "#e2e8f0", "--on-ink": "#0b0f14" };

for (const [theme, expect] of [["light", LIGHT], ["dark", DARK]]) {
  check(`${theme} theme ships the Gate 7.0 neutral, accent and ink values`, () => {
    const b = block(`html[data-theme="${theme}"]`);
    const wrong = Object.entries(expect).filter(([k, v]) => token(b, k) !== v).map(([k, v]) => `${k}=${token(b, k)} (want ${v})`);
    assert.deepStrictEqual(wrong, []);
  });
  check(`${theme} theme gives --surface-2 and --border-default its own values (no shared dark grey)`, () => {
    const b = block(`html[data-theme="${theme}"]`);
    assert.ok(token(b, "--surface-2") && token(b, "--border-default"), "missing per-theme --surface-2 / --border-default");
  });
}

check("one typeface: --font-display is Inter and Space Grotesk is gone everywhere", () => {
  const root = block(":root");
  assert.ok(/inter/i.test(token(root, "--font-display") || ""), "--font-display = " + token(root, "--font-display"));
  assert.ok(!/space grotesk|space-grotesk/i.test(css), "styles.css still mentions Space Grotesk");
  for (const f of ["build.js", path.join("mirror-app", "build.js")]) {
    assert.ok(!/space-grotesk/.test(fs.readFileSync(path.join(ROOT, f), "utf8")), f + " still bundles Space Grotesk");
  }
  assert.ok(!fs.readdirSync(path.join(ROOT, "src", "css", "fonts")).some((n) => /space-grotesk/.test(n)), "font files still present");
});

check("figures use the text face with tabular numerals, not the mono face", () => {
  for (const sel of [".kpi-card__value", ".card-stat__value"]) {
    const i = css.indexOf("\n" + sel + " {");
    assert.ok(i >= 0, "no rule for " + sel);
    const rule = css.slice(i, css.indexOf("}", i));
    assert.ok(!/font-mono/.test(rule), sel + " still uses --font-mono");
    assert.ok(/tabular-nums/.test(rule), sel + " lacks tabular-nums");
  }
});

check("KPI figures that also carry .mono still use the text face (rule exists and precedes nothing that undoes it)", () => {
  const i = css.indexOf("\n.kpi-card__value.mono {");
  assert.ok(i >= 0, "no .kpi-card__value.mono rule: pages mark 22 KPI figures as mono");
  const rule = css.slice(i, css.indexOf("}", i));
  assert.ok(/font-body/.test(rule) && /tabular-nums/.test(rule), rule);
});

check("primary button is ink, not the accent", () => {
  const i = css.indexOf("\n.btn--primary {");
  const rule = css.slice(i, css.indexOf("}", i));
  assert.ok(/var\(--ink\)/.test(rule) && /var\(--on-ink\)/.test(rule), rule.trim().slice(0, 200));
});

check("radii: controls 6px, cards 8px", () => {
  const root = block(":root");
  assert.deepStrictEqual([token(root, "--radius-sm"), token(root, "--radius-md"), token(root, "--radius-lg")], ["6px", "8px", "8px"]);
});

check("Gate 7.1's interim sizes now alias the named scale (no off-scale px left)", () => {
  const root = block(":root");
  const MAP = { "9": "xs", "10": "xs", "10-5": "xs", "12": "sm", "13": "sm", "13-5": "base", "17": "lg", "20": "xl", "24": "xl" };
  const wrong = Object.entries(MAP).filter(([k, v]) => token(root, `--text-${k}`) !== `var(--text-${v})`).map(([k]) => `--text-${k}=${token(root, `--text-${k}`)}`);
  assert.deepStrictEqual(wrong, []);
});

check("no module colour is violet (hue 240-300 excluded); all stay hsl()", () => {
  const bad = [...css.matchAll(/--module-accent-(\w+):\s*hsl\((\d+)/g)].filter((m) => +m[2] >= 240 && +m[2] <= 300).map((m) => m[1] + "=" + m[2]);
  assert.deepStrictEqual(bad, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
