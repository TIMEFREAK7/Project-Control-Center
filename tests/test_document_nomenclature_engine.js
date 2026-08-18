// Standalone Node test for documentNomenclatureEngine.js — evals the real source file
// directly (a plain JS object, no DOM/store access, same convention as
// costEvmEngine.js/projectHealthEngine.js/resourceLevelingEngine.js's own test files).
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

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

global.window = {};
const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "documentNomenclatureEngine.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);
const engine = global.window.PCC.documentNomenclatureEngine;

const DEFAULT_PATTERN = "PROJECT-DISCIPLINE-DOCUMENTTYPE-NUMBER-REV";

check("buildExpectedName() substitutes every token, leaving separators untouched", () => {
  const name = engine.buildExpectedName(DEFAULT_PATTERN, {
    PROJECT: "ABC",
    DISCIPLINE: "ELE",
    DOCUMENTTYPE: "RFI",
    NUMBER: "001",
    REV: "REV02",
  });
  assert.strictEqual(name, "ABC-ELE-RFI-001-REV02");
});

check("buildExpectedName() treats a missing/blank token as an empty string, not a crash", () => {
  const name = engine.buildExpectedName(DEFAULT_PATTERN, { PROJECT: "ABC" });
  assert.strictEqual(name, "ABC----", "blank DISCIPLINE/DOCUMENTTYPE/NUMBER/REV tokens (REV included — it's a recognized token too) should just vanish, not throw");
});

check("buildExpectedName() supports a custom pattern with a different separator and token order", () => {
  const name = engine.buildExpectedName("DOCUMENTTYPE_NUMBER_REV", { DOCUMENTTYPE: "MS", NUMBER: "014", REV: "REV00" });
  assert.strictEqual(name, "MS_014_REV00");
});

check("buildExpectedName() handles an empty pattern without throwing", () => {
  assert.strictEqual(engine.buildExpectedName("", { PROJECT: "ABC" }), "");
  assert.strictEqual(engine.buildExpectedName(null, {}), "");
});

check("stripExtension() removes only the final extension", () => {
  assert.strictEqual(engine.stripExtension("ABC-ELE-RFI-001-REV02.pdf"), "ABC-ELE-RFI-001-REV02");
  assert.strictEqual(engine.stripExtension("archive.tar.gz"), "archive.tar");
  assert.strictEqual(engine.stripExtension("no-extension"), "no-extension");
  assert.strictEqual(engine.stripExtension(""), "");
});

check("checkFilename() reports a match, case-insensitively, ignoring the extension", () => {
  const tokens = { PROJECT: "ABC", DISCIPLINE: "ELE", DOCUMENTTYPE: "RFI", NUMBER: "001", REV: "REV02" };
  const result = engine.checkFilename(DEFAULT_PATTERN, "abc-ele-rfi-001-rev02.PDF", tokens);
  assert.strictEqual(result.matches, true);
  assert.strictEqual(result.expected, "ABC-ELE-RFI-001-REV02");
  assert.strictEqual(result.stem, "abc-ele-rfi-001-rev02");
});

check("checkFilename() reports a mismatch and returns the expected name for display", () => {
  const tokens = { PROJECT: "ABC", DISCIPLINE: "ELE", DOCUMENTTYPE: "RFI", NUMBER: "001", REV: "REV02" };
  const result = engine.checkFilename(DEFAULT_PATTERN, "wrong-name.pdf", tokens);
  assert.strictEqual(result.matches, false);
  assert.strictEqual(result.expected, "ABC-ELE-RFI-001-REV02");
  assert.strictEqual(result.stem, "wrong-name");
});

check("checkFilename() with fully blank tokens still returns a comparable (mismatching) result, never throws", () => {
  const result = engine.checkFilename(DEFAULT_PATTERN, "anything.pdf", {});
  assert.strictEqual(result.matches, false);
  assert.strictEqual(result.expected, "----");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
