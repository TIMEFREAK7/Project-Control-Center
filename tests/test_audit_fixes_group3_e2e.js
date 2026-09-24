// End-to-end jsdom tests for the 2026-09-24 audit's third fix group, against the real
// bundled index.html:
//   1. migrate()'s final backfill: a file missing whole collections/settings (hand-edited,
//      another tool's output, partial save) used to import "successfully" and then crash
//      8 pages. It must now render every route, and must never overwrite existing values.
//   2. router.js: navigating from a React page to an unknown #/route used to make React
//      throw "The node to be removed is not a child of this node".
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const INDEX_PATH = path.join(__dirname, "..", "index.html");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function flush() {
  for (let i = 0; i < 12; i++) await sleep(0);
}

let passed = 0;
let failed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS:", label);
  } catch (e) {
    failed++;
    console.log("FAIL:", label, "\n     ", e.stack || e.message);
  }
}

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const errors = [];
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(w) {
      // React reports render/teardown failures through console.error rather than
      // window.onerror, so capture both.
      w.console.error = function () {
        errors.push("console.error: " + Array.prototype.map.call(arguments, String).join(" ").slice(0, 200));
      };
      w.addEventListener("error", (e) => errors.push("error: " + e.message));
    },
  });
  dom.window.indexedDB = new FDBFactory();
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();
  const win = dom.window;
  const S = win.PCC.store;

  // ---- 1. migrate() backfill ----

  await check("migrate() gives a bare file every collection and every default setting", () => {
    const fresh = S.get();
    const m = S.migrate({ schema_version: 1, projects: [{ id: "p1", name: "Old" }], settings: {} });
    Object.keys(fresh).forEach((k) => {
      if (Array.isArray(fresh[k])) assert.ok(Array.isArray(m[k]), "missing collection: " + k);
    });
    Object.keys(fresh.settings).forEach((k) => assert.ok(k in m.settings, "missing setting: " + k));
    assert.strictEqual(m.schema_version, 67);
  });

  await check("…but never overwrites a value that's already there", () => {
    const m = S.migrate({
      schema_version: 66,
      projects: [{ id: "keep", name: "Keep me" }],
      risks: [{ id: "r1", project_id: "keep", title: "Existing risk" }],
      settings: { theme: "light", company_name: "Acme", density: "compact" },
      meta: { app_name: "Project Control Center", created_at: "2020-01-01T00:00:00.000Z" },
    });
    assert.strictEqual(m.settings.theme, "light");
    assert.strictEqual(m.settings.company_name, "Acme");
    assert.strictEqual(m.settings.density, "compact");
    assert.strictEqual(m.meta.created_at, "2020-01-01T00:00:00.000Z");
    assert.strictEqual(m.risks.length, 1);
    assert.strictEqual(m.risks[0].title, "Existing risk");
    assert.strictEqual(m.projects[0].name, "Keep me");
  });

  await check("…and is idempotent (a second migrate changes nothing)", () => {
    const once = S.migrate({ schema_version: 1, projects: [{ id: "p1", name: "Old" }], settings: {} });
    const twice = S.migrate(JSON.parse(JSON.stringify(once)));
    assert.strictEqual(JSON.stringify(twice), JSON.stringify(once));
  });

  await check("importing a file with no documents/risks lists renders every page without errors", async () => {
    const err = await new Promise((resolve) =>
      S.importFromJsonString(JSON.stringify({ schema_version: 1, projects: [{ id: "p1", name: "Old" }], settings: {} }), resolve)
    );
    await flush();
    assert.strictEqual(err, null, "import should succeed");
    const failing = [];
    for (const r of win.PCC.layout.navItems().map((n) => n.key)) {
      const before = errors.length;
      win.PCC.router.go(r);
      await flush();
      if (errors.length > before) failing.push(r + ": " + errors[before]);
    }
    assert.deepStrictEqual(failing, [], "pages erroring after import:\n" + failing.join("\n"));
  });

  // ---- 2. Unknown route after a React page ----

  await check("navigating from a React page to an unknown #/route shows Not Found with no React teardown error", async () => {
    win.PCC.router.go("risks"); // a React-migrated page, so a real root is mounted
    await flush();
    const before = errors.length;
    win.PCC.router.go("thisRouteDoesNotExist");
    await flush();
    assert.deepStrictEqual(errors.slice(before), [], "errors: " + errors.slice(before).join(" | "));
    assert.ok(win.document.getElementById("page-outlet").textContent.trim().length > 0, "the Not Found page should render");
    // …and the app still navigates normally afterwards.
    win.PCC.router.go("dashboard");
    await flush();
    assert.deepStrictEqual(errors.slice(before), []);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
