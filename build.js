// Build script: bundles src/ into one self-contained index.html at the project root.
// Run with `node build.js` from this folder. Not part of the shipped app — the user
// never runs this; it's how I (re)generate the single-file deliverable during development.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const OUT_FILE = path.join(__dirname, "index.html");

const JS_ORDER = [
  "js/vendor/xlsx.core.min.js",
  "js/vendor/mammoth.browser.min.js",
  "js/vendor/pdf.min.js",
  "js/vendor/pdf.worker.min.js",
  "js/vendor/jszip.min.js",
  "js/blobStore.js",
  "js/scheduleBaselineStore.js",
  "js/duplicateService.js",
  "js/scheduleImportService.js",
  "js/scheduleCpmEngine.js",
  "js/scheduleBaselineEngine.js",
  "js/scheduleGanttLayout.js",
  "js/costEvmEngine.js",
  "js/projectHealthEngine.js",
  "js/resourceLevelingEngine.js",
  "js/store.js",
  "js/notifications.js",
  "js/router.js",
  "js/layout.js",
  "js/archive.js",
  "js/pages/dashboard.js",
  "js/pages/portfolio.js",
  "js/pages/executiveCenter.js",
  "js/pages/vendors.js",
  "js/pages/documents.js",
  "js/pages/documentTypes.js",
  "js/pages/dailyLog.js",
  "js/pages/schedule.js",
  "js/pages/risks.js",
  "js/pages/meetings.js",
  "js/pages/rfis.js",
  "js/pages/changeOrders.js",
  "js/pages/cost.js",
  "js/pages/resources.js",
  "js/pages/reports.js",
  "js/pages/settings.js",
  "js/pages/comingSoon.js",
  "js/app.js",
];

// pdf.js normally runs its parsing in a Worker thread. When no workerSrc is configured,
// it automatically falls back to running in the main thread instead ("fake worker") —
// documented, supported behavior, not a hack. Given this app processes one document at a
// time on user action, the brief main-thread blocking is an acceptable trade for not
// needing to bundle+embed the ~1.1MB worker script as base64 or manage a Blob Worker.

const FONT_FILES = {
  "fonts/space-grotesk-500.woff2": "font/woff2",
  "fonts/space-grotesk-600.woff2": "font/woff2",
  "fonts/inter-400.woff2": "font/woff2",
  "fonts/inter-500.woff2": "font/woff2",
  "fonts/inter-600.woff2": "font/woff2",
  "fonts/ibm-plex-mono-400.woff2": "font/woff2",
  "fonts/ibm-plex-mono-500.woff2": "font/woff2",
};

function inlineFonts(css) {
  let out = css;
  for (const [relPath, mime] of Object.entries(FONT_FILES)) {
    const abs = path.join(SRC, "css", relPath);
    const b64 = fs.readFileSync(abs).toString("base64");
    const dataUri = `data:${mime};base64,${b64}`;
    // Replace the literal url("fonts/xxx.woff2") reference with the embedded data URI.
    const needle = `url("${relPath}")`;
    if (!out.includes(needle)) {
      throw new Error(`Expected to find ${needle} in styles.css but didn't — font list is out of sync.`);
    }
    out = out.split(needle).join(`url("${dataUri}")`);
  }
  return out;
}

function build() {
  const cssRaw = fs.readFileSync(path.join(SRC, "css", "styles.css"), "utf8");
  const cssInlined = inlineFonts(cssRaw);

  const jsBundle = JS_ORDER.map((rel) => {
    const code = fs.readFileSync(path.join(SRC, rel), "utf8");
    return `/* ---- ${rel} ---- */\n${code}`;
  }).join("\n\n");

  let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");

  // Use function replacers, not string replacers: String.replace() treats $-sequences
  // ($&, $$, $1, $`, $') specially in a *string* replacement, and the SheetJS bundle
  // contains literal "$&" and "$$" as part of its own code — a string replacement would
  // have silently spliced extra copies of the matched text into the output. A function
  // replacer returns its value literally, with no special-pattern interpretation.
  html = html.replace(
    /<link rel="stylesheet" href="css\/styles\.css" \/>/,
    function () {
      return `<style>\n${cssInlined}\n</style>`;
    },
  );

  html = html.replace(
    /<!-- Classic scripts[\s\S]*?<script src="js\/app\.js"><\/script>/,
    function () {
      return `<script>\n${jsBundle}\n</script>`;
    },
  );

  fs.writeFileSync(OUT_FILE, html, "utf8");
  const sizeKb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`Built ${OUT_FILE} (${sizeKb} KB)`);
}

build();
