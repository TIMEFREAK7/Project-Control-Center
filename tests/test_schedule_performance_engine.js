// Standalone Node test for schedulePerformanceEngine.js. Pure calculation module, no
// DOM, so this runs directly under `node` without jsdom — same pattern as
// test_cost_evm_engine.js / test_schedule_cpm_engine.js.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

global.window = global.window || {};
const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "schedulePerformanceEngine.js"), "utf8");
// eslint-disable-next-line no-eval
eval(src);
const engine = window.PCC.schedulePerformanceEngine;

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

check("a fully on-plan project (SPI=1, SPI(t)=1, no variance, no critical activities) scores 100", () => {
  const result = engine.computeSchedulePerformanceScore({
    spi: 1, spiT: 1, scheduleVarianceDays: 0, plannedDurationDays: 100, criticalCount: 0, totalActivityCount: 10,
  });
  assert.strictEqual(result.score, 100);
  assert.strictEqual(result.rag, "on_track");
});

check("running ahead of plan (SPI/SPI(t) above 1.0) still scores 100 — this is a health score, not an over-performance reward", () => {
  const result = engine.computeSchedulePerformanceScore({
    spi: 1.4, spiT: 1.3, scheduleVarianceDays: 5, plannedDurationDays: 100, criticalCount: 0, totalActivityCount: 10,
  });
  assert.strictEqual(result.score, 100);
});

check("a project with every factor at its worst (SPI/SPI(t) at 0.7, half the planned duration behind, all activities critical) scores 0", () => {
  const result = engine.computeSchedulePerformanceScore({
    spi: 0.7, spiT: 0.7, scheduleVarianceDays: -50, plannedDurationDays: 100, criticalCount: 10, totalActivityCount: 10,
  });
  assert.strictEqual(result.score, 0);
  assert.strictEqual(result.rag, "critical");
});

check("no linked/dated budget items (spi and spiT both null) excludes those factors and re-normalizes over what's left, rather than treating missing data as 0", () => {
  const result = engine.computeSchedulePerformanceScore({
    spi: null, spiT: null, scheduleVarianceDays: null, plannedDurationDays: 100, criticalCount: 0, totalActivityCount: 10,
  });
  assert.strictEqual(result.factors.spi.available, false);
  assert.strictEqual(result.factors.spiT.available, false);
  assert.strictEqual(result.factors.scheduleVarianceDays.available, false);
  // Only criticalRatio is available (0 critical of 10 -> 100), so the re-normalized score is 100.
  assert.strictEqual(result.score, 100);
});

check("no activities at all reports a null score, not a misleadingly perfect or zero one", () => {
  const result = engine.computeSchedulePerformanceScore({
    spi: null, spiT: null, scheduleVarianceDays: null, plannedDurationDays: null, criticalCount: 0, totalActivityCount: 0,
  });
  assert.strictEqual(result.score, null);
  assert.strictEqual(result.rag, null);
  assert.strictEqual(result.factors.criticalRatio.available, false);
});

check("factor weights sum to 100 and each factor carries its own label for the UI breakdown table", () => {
  const result = engine.computeSchedulePerformanceScore({
    spi: 1, spiT: 1, scheduleVarianceDays: 0, plannedDurationDays: 100, criticalCount: 0, totalActivityCount: 10,
  });
  const totalWeight = Object.keys(result.factors).reduce((sum, k) => sum + result.factors[k].weight, 0);
  assert.strictEqual(totalWeight, 100);
  Object.keys(result.factors).forEach((k) => assert.ok(result.factors[k].label, k + " must carry a label"));
});

check("a mid-range SPI (0.85, halfway between the 0.7 floor and the 1.0 ceiling) scores 50 for that factor", () => {
  const result = engine.computeSchedulePerformanceScore({
    spi: 0.85, spiT: null, scheduleVarianceDays: null, plannedDurationDays: null, criticalCount: 0, totalActivityCount: 0,
  });
  assert.ok(Math.abs(result.factors.spi.score - 50) < 1e-9, "expected ~50, got " + result.factors.spi.score);
});

check("RAG thresholds: score >=70 on_track, 40-69 at_risk, <40 critical", () => {
  // Force a precise score via a single available factor (criticalRatio) at each tier.
  function scoreFor(criticalCount, totalActivityCount) {
    return engine.computeSchedulePerformanceScore({
      spi: null, spiT: null, scheduleVarianceDays: null, plannedDurationDays: null,
      criticalCount: criticalCount, totalActivityCount: totalActivityCount,
    });
  }
  const healthy = scoreFor(0, 10); // ratio 0 -> score 100
  assert.strictEqual(healthy.rag, "on_track");
  const risky = scoreFor(5, 10); // ratio 0.5 -> score 100 - 75 = 25... need a mid value instead
  // Recompute with a ratio landing in the at_risk band (40-69): 100 - ratio*150 in [40,69]
  // -> ratio in [0.206, 0.4]. Use 3 of 10 (ratio 0.3 -> score 55).
  const atRisk = scoreFor(3, 10);
  assert.strictEqual(atRisk.score, 55);
  assert.strictEqual(atRisk.rag, "at_risk");
  assert.strictEqual(risky.rag, "critical");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
