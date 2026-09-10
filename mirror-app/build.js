// Build script for the standalone "At a Glance" mirror app: bundles mirror-app/src/ plus
// the real, unmodified src/js/store.js + src/js/projectContext.js (see this directory's
// package.json header for why those two specifically get reused verbatim rather than
// reimplemented) into one self-contained mirror-app/index.html -- same "one dependency-
// free file" philosophy as the main app's own build.js, deliberately excluding every
// vendor library/engine the main app needs for editing (xlsx, mammoth, pdf.js, jszip,
// sql.js, the CPM/import engines) so this app's bundle stays genuinely smaller. Run with
// `node build.js` from this folder, same as the main repo root and react/.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(__dirname, "src");
const OUT_FILE = path.join(__dirname, "index.html");
const REACT_NODE_MODULES = path.join(ROOT, "react", "node_modules");

// This app deliberately has no react/react-dom/@types devDependency of its own -- it
// reuses the exact single copy already installed for the main app's React migration
// (react/node_modules), so mirror-app/src/index.tsx and the real, unmodified
// react/src/pages/*.tsx it imports both bundle to the SAME React instance (two copies in
// one bundle would break hooks/context and defeat the "genuinely smaller bundle" goal).
// Plain symlinks make this an ordinary node_modules resolution for both tsc and esbuild
// (no --alias/paths remapping needed, which turned out to have real edge cases -- see
// this directory's own build notes): mirror-app/node_modules/{react,react-dom,@types}
// each point at react/node_modules/{react,react-dom,@types}. Created here, not committed
// (node_modules/ is gitignored), so a fresh clone's first `cd mirror-app && npm install
// && node build.js` just works without a separate manual step.
const REACT_SYMLINKS = ["react", "react-dom", "@types"];

function ensureReactSymlinks() {
  const mirrorNodeModules = path.join(__dirname, "node_modules");
  for (const name of REACT_SYMLINKS) {
    const linkPath = path.join(mirrorNodeModules, name);
    const target = path.join(REACT_NODE_MODULES, name);
    if (fs.existsSync(linkPath)) continue;
    if (!fs.existsSync(target)) {
      throw new Error(`Expected ${target} to exist (react/node_modules) -- run \`cd react && npm install\` first.`);
    }
    fs.symlinkSync(path.relative(mirrorNodeModules, target), linkPath, "dir");
  }
}

function ensureToolingPresent() {
  if (!fs.existsSync(path.join(__dirname, "node_modules"))) {
    throw new Error("mirror-app/node_modules is missing -- run `cd mirror-app && npm install` once, then re-run `node build.js`.");
  }
  if (!fs.existsSync(REACT_NODE_MODULES)) {
    throw new Error(
      "react/node_modules is missing -- this app reuses the exact same React/ReactDOM copy already installed for " +
        "the main app's React migration (via the symlinks ensureReactSymlinks() sets up, deliberately not a " +
        "second npm install of react/react-dom) -- run `cd react && npm install` once, then re-run `node build.js`."
    );
  }
  ensureReactSymlinks();
}

function typecheckAndBundleReact() {
  execFileSync("npm", ["run", "typecheck"], { cwd: __dirname, stdio: "inherit" });
  execFileSync("npm", ["run", "build:bundle"], { cwd: __dirname, stdio: "inherit" });
}

// Same font-embedding approach as the main app's build.js, reusing the exact same real
// font files (src/css/fonts/*.woff2) rather than a second copy of them.
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
    const abs = path.join(ROOT, "src", "css", relPath);
    const b64 = fs.readFileSync(abs).toString("base64");
    const dataUri = `data:${mime};base64,${b64}`;
    const needle = `url("${relPath}")`;
    if (!out.includes(needle)) {
      throw new Error(`Expected to find ${needle} in styles.css but didn't -- font list is out of sync.`);
    }
    out = out.split(needle).join(`url("${dataUri}")`);
  }
  return out;
}

function build() {
  ensureToolingPresent();
  typecheckAndBundleReact();

  // Real, unmodified styles.css (same file the main app embeds) plus this app's own
  // small tab-bar/pull-to-refresh CSS addition.
  const realCss = fs.readFileSync(path.join(ROOT, "src", "css", "styles.css"), "utf8");
  const mirrorCss = fs.readFileSync(path.join(SRC, "mirror-app.css"), "utf8");
  const cssInlined = inlineFonts(realCss) + "\n" + mirrorCss;

  // Real, unmodified store.js + projectContext.js, loaded before the React bundle --
  // same load-order requirement the main app's own JS_ORDER documents for React vs.
  // jszip, applied here for the same reason: window.PCC.store/window.PCC.projectContext
  // must exist before index.tsx's top-level installRouter()/installNoOpModules() calls
  // and before App.tsx's first render reads window.PCC.store.get().
  const storeJs = fs.readFileSync(path.join(ROOT, "src", "js", "store.js"), "utf8");
  const projectContextJs = fs.readFileSync(path.join(ROOT, "src", "js", "projectContext.js"), "utf8");
  const mirrorBundle = fs.readFileSync(path.join(__dirname, ".build", "mirror-bundle.js"), "utf8");

  const jsBundle = [
    "/* ---- src/js/store.js (real, unmodified) ---- */",
    storeJs,
    "/* ---- src/js/projectContext.js (real, unmodified) ---- */",
    projectContextJs,
    "/* ---- mirror-app bundle (React + shim + 4 real page components) ---- */",
    mirrorBundle,
  ].join("\n\n");

  let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");

  html = html.replace(/<link rel="stylesheet" href="css\/styles\.css" \/>/, function () {
    return `<style>\n${cssInlined}\n</style>`;
  });

  html = html.replace(/<script src="js\/mirror-bundle\.js"><\/script>/, function () {
    return `<script>\n${jsBundle}\n</script>`;
  });

  fs.writeFileSync(OUT_FILE, html, "utf8");
  const sizeKb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`Built ${OUT_FILE} (${sizeKb} KB)`);
}

build();
