// Gate 7.1 (2026-11-26): the type scale, radii and colours must be changeable from styles.css
// alone. So React pages may not hard-code a font size, a corner radius or a colour inline, and
// styles.css may not use a literal font-size outside its token definitions. Gate 7.2 then
// restyles by editing token values only. Plain source scan, no DOM.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const PAGES = path.join(ROOT, "react", "src", "pages");

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

function scanPages(re) {
  const hits = [];
  for (const f of fs.readdirSync(PAGES).filter((n) => /\.tsx?$/.test(n))) {
    fs.readFileSync(path.join(PAGES, f), "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
  }
  return hits;
}
const report = (hits) => `${hits.length} found, e.g.\n       ` + hits.slice(0, 5).join("\n       ");

check("no React page sets fontSize to a number or a px string (use var(--text-*))", () => {
  const hits = scanPages(/fontSize:\s*(\d|["'][\d.]+px["'])/);
  assert.strictEqual(hits.length, 0, report(hits));
});

check("no React page sets borderRadius to a number or px (use var(--radius-*); 50% circles allowed)", () => {
  const hits = scanPages(/borderRadius:\s*(\d|["'][\d.]+px["'])/);
  assert.strictEqual(hits.length, 0, report(hits));
});

check("no React page hard-codes a colour (hex, rgb/rgba, or a var() with a hex fallback)", () => {
  const hits = scanPages(/(color|background|backgroundColor|borderColor|border|outline|fill|stroke)\w*:\s*["'][^"']*(#[0-9a-fA-F]{3,8}\b|rgba?\()/);
  assert.strictEqual(hits.length, 0, report(hits));
});

check("styles.css uses no literal font-size outside its token definitions", () => {
  const css = fs.readFileSync(path.join(ROOT, "src", "css", "styles.css"), "utf8");
  const hits = [];
  css.split("\n").forEach((line, i) => {
    if (/(^|[;{\s])font-size:(?!\s*var\()[^;]*\d/.test(line)) hits.push(`styles.css:${i + 1}: ${line.trim()}`);
  });
  assert.strictEqual(hits.length, 0, report(hits));
});

check("every --text-* token a page or styles.css uses is defined", () => {
  const css = fs.readFileSync(path.join(ROOT, "src", "css", "styles.css"), "utf8");
  const defined = new Set([...css.matchAll(/(--text-[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set();
  for (const f of fs.readdirSync(PAGES)) for (const m of fs.readFileSync(path.join(PAGES, f), "utf8").matchAll(/var\((--text-[\w-]+)\)/g)) used.add(m[1]);
  for (const m of css.matchAll(/var\((--text-[\w-]+)\)/g)) used.add(m[1]);
  const missing = [...used].filter((t) => !defined.has(t));
  assert.deepStrictEqual(missing, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
