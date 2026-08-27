// PCC Architecture Upgrade Phase 5 — DOM-level e2e test against the real bundled
// index.html, proving the "Export as SQLite (Experimental)" button in Settings wires
// together: builds the live store data into a SQLite database, exports it, and hands
// the bytes to nativeFile.save() as a real .sqlite file — same interception convention
// test_msp_xml_export_e2e.js/test_p6_xer_export_e2e.js already use.
//
// This is the FIRST place any of the Architecture Upgrade Phase 5 SQLite work is
// reachable from the actual UI — sqliteMigrationEngine.js/sqlitePersistence.js
// themselves are still not part of the app's real read/write path (see their own
// headers); this button is a one-way export only, exactly as its own UI copy says.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const assert = require("assert");
const { JSDOM } = require("jsdom");
const FDBFactory = require("fake-indexeddb/lib/FDBFactory");

const INDEX_PATH = path.join(__dirname, "..", "index.html");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function flush() {
  for (let i = 0; i < 10; i++) await sleep(0);
}
async function waitFor(conditionFn, timeoutMs) {
  timeoutMs = timeoutMs || 5000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (conditionFn()) return;
    await sleep(20);
  }
  throw new Error("waitFor() timed out after " + timeoutMs + "ms");
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

function findButtonByText(win, text) {
  const buttons = Array.from(win.document.querySelectorAll("button"));
  return buttons.find((b) => b.textContent.trim() === text);
}

function hasSqlite3Cli() {
  try {
    execFileSync("sqlite3", ["--version"], { stdio: "pipe" });
    return true;
  } catch (e) {
    return false;
  }
}

(async () => {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const thrownErrors = [];
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  dom.window.indexedDB = new FDBFactory();
  dom.window.CompressionStream = CompressionStream;
  dom.window.DecompressionStream = DecompressionStream;
  dom.window.Response = Response;
  dom.window.onerror = function (msg) {
    thrownErrors.push(String(msg));
  };
  await new Promise((resolve) => {
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve());
    if (dom.window.document.readyState !== "loading") resolve();
  });
  await flush();

  const win = dom.window;
  const outlet = () => win.document.getElementById("page-outlet");

  let projectId;
  await check("seed a realistic project (schedule, activities, a risk) and navigate to Settings", () => {
    win.PCC.store.update(function (data) {
      var project = { id: "proj_sqlite_export_1", name: "SQLite Export Test Project", archived: false, status: "on_track", progress: 0, attachments: [] };
      data.projects.push(project);
      projectId = project.id;

      var sched = win.PCC.store.newSchedule({ project_id: projectId, name: "Test Schedule", status: "active" });
      data.schedules.push(sched);
      var act = win.PCC.store.newActivity({ project_id: projectId, schedule_id: sched.id, name: "Design Review", duration: 5 });
      data.activities.push(act);
      data.risks.push(win.PCC.store.newRisk({ project_id: projectId, type: "risk", title: "Permit delay" }));
    });

    win.PCC.router.go("settings");
    win.PCC.router.render();
    assert.ok(outlet().textContent.indexOf("Data") !== -1, "expected the Data panel to render");
  });

  await check("the 'Export as SQLite (Experimental)' button exists, is clearly labeled one-way, and is not the same as the JSON/archive exports", () => {
    const btn = findButtonByText(win, "Export as SQLite (Experimental)");
    assert.ok(btn, "'Export as SQLite (Experimental)' button not found");
    assert.ok(btn.title.toLowerCase().indexOf("not update pcc") !== -1, "the button's own tooltip must warn this is a one-way snapshot");
    assert.ok(outlet().textContent.toLowerCase().indexOf("one-time snapshot") !== -1, "the panel copy must explain this is a one-time snapshot, not a live-synced copy");
  });

  let savedBlob = null;
  let savedFilename = null;
  await check("clicking it produces a real, well-formed .sqlite file via nativeFile.save(), containing the live store data", async () => {
    const realSave = win.PCC.nativeFile.save;
    win.PCC.nativeFile.save = function (blob, filename) {
      savedBlob = blob;
      savedFilename = filename;
      return Promise.resolve();
    };

    findButtonByText(win, "Export as SQLite (Experimental)").click();
    await waitFor(() => savedBlob !== null, 10000);
    win.PCC.nativeFile.save = realSave;

    assert.ok(/^PCC-Export-\d{4}-\d{2}-\d{2}\.sqlite$/.test(savedFilename), "unexpected filename: " + savedFilename);
    assert.strictEqual(savedBlob.type, "application/x-sqlite3");
    assert.strictEqual(thrownErrors.length, 0, "window.onerror captured: " + thrownErrors.join(" | "));
  });

  await check("the exported bytes round-trip through this app's own sql.js reader with the live data intact", async () => {
    const bytes = new Uint8Array(await savedBlob.arrayBuffer());
    const SQL = await win.PCC.sqliteMigrationEngine.initSqlJsBrowser();
    const db = new SQL.Database(bytes);
    const validation = win.PCC.sqliteMigrationEngine.validateDatabase(db);
    assert.strictEqual(validation.valid, true, "expected the exported file to be a valid database: " + validation.error);

    const exported = win.PCC.sqliteMigrationEngine.exportToJson(db);
    const project = exported.projects.find((p) => p.id === projectId);
    assert.ok(project, "the seeded project must be present in the exported SQLite file");
    assert.strictEqual(project.name, "SQLite Export Test Project");
    assert.ok(exported.activities.some((a) => a.name === "Design Review"));
    assert.ok(exported.risks.some((r) => r.title === "Permit delay"));
  });

  // The real, meaningful check for "is this a real, openable .sqlite file": open it
  // with the actual standalone sqlite3 CLI — a completely independent implementation
  // from sql.js/this app's own code — not just re-reading it with our own reader.
  if (hasSqlite3Cli()) {
    await check("REAL THIRD-PARTY INTEROP: the exported file opens correctly with the standalone sqlite3 CLI (an independent SQLite implementation, not this app's own code)", async () => {
      const tmpFile = path.join(os.tmpdir(), "pcc-sqlite-export-test-" + Date.now() + ".sqlite");
      const buffer = Buffer.from(await savedBlob.arrayBuffer());
      fs.writeFileSync(tmpFile, buffer);
      try {
        const integrityCheck = execFileSync("sqlite3", [tmpFile, "PRAGMA integrity_check;"], { encoding: "utf8" }).trim();
        assert.strictEqual(integrityCheck, "ok", "sqlite3's own integrity_check must pass");

        const tables = execFileSync("sqlite3", [tmpFile, ".tables"], { encoding: "utf8" });
        assert.ok(tables.indexOf("projects") !== -1, "the 'projects' table must be visible to a real external SQLite tool");
        assert.ok(tables.indexOf("activities") !== -1);
        assert.ok(tables.indexOf("risks") !== -1);

        const projectRow = execFileSync("sqlite3", [tmpFile, "SELECT id FROM projects LIMIT 1;"], { encoding: "utf8" }).trim();
        assert.ok(projectRow.length > 0, "a real SQL SELECT via the standalone CLI must return the seeded project row");

        const activityRow = execFileSync("sqlite3", [tmpFile, "SELECT id, project_id FROM activities LIMIT 1;"], { encoding: "utf8" }).trim();
        assert.ok(activityRow.length > 0, "a real SQL SELECT against the detected project_id FK column must return the seeded activity row");

        const activityQuery = execFileSync(
          "sqlite3",
          [tmpFile, `SELECT json_extract(data, '$.name') FROM activities WHERE project_id = '${projectId}';`],
          { encoding: "utf8" }
        ).trim();
        assert.strictEqual(activityQuery, "Design Review", "SQLite's own json_extract() must read the JSON payload column correctly — proving this isn't just opaque blob storage");
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });
  } else {
    console.log("SKIPPED: standalone sqlite3 CLI not found in this environment — real third-party interop not verified this run.");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
