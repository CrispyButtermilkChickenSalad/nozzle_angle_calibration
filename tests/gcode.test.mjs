import test from "node:test";
import assert from "node:assert/strict";
import { generateGcode, layerArea, minimumLayerHeight } from "../src/gcode.mjs";

const defaults = {
  angleDegrees: 45,
  layerHeight: 0.2,
  layerCount: 3,
  multiplierStart: 0.9,
  multiplierEnd: 1.1,
  multiplierStep: 0.2,
  nozzleDiameter: 0.4,
  filamentDiameter: 1.75,
  beadLength: 12,
  angleAxis: "A",
  travelFeedrate: 6000,
  printFeedrate: 1200,
};

test("calculates the capsule bead area from target height and nozzle diameter", () => {
  const expected = (0.4 - 0.2) * 0.2 + Math.PI * (0.2 / 2) ** 2;
  assert.ok(Math.abs(layerArea(0.2, 0.4) - expected) < 1e-12);
});

test("projects the tilted circular rim using the Pythagorean relation", () => {
  assert.equal(minimumLayerHeight(0.4, 0), 0);
  assert.ok(Math.abs(minimumLayerHeight(0.4, 30) - 0.1) < 1e-12);
  assert.ok(Math.abs(minimumLayerHeight(0.4, 90 - 1e-8) - 0.2) < 1e-8);
});

test("generates one-angle, one-height specimens with fixed nozzle-width beads", () => {
  const result = generateGcode(defaults);
  assert.equal(result.caseCount, 2);
  assert.equal(result.rowCount, 2);
  assert.equal(result.totalLayerCount, 6);
  assert.equal(result.angle, 45);
  assert.equal(result.layerCount, 3);
  assert.equal(result.cases[0].height, defaults.layerHeight);
  assert.equal(result.cases[0].width, defaults.nozzleDiameter);
  assert.equal(result.text, generateGcode(defaults).text);
  assert.match(result.text, /SPECIMEN 001 \| angle 45 deg from normal \| layer height 0\.2 mm \| line width 0\.4 mm \(nozzle diameter\) \| layers 3 \| extrusion multiplier 0\.9/);
  assert.match(result.text, /; Rotary axis: A \(rotation about X\)/);
  assert.match(result.text, /G1 A45/);
  assert.match(result.text, /tilt is marked as T followed by degrees/);
  assert.match(result.text, /; layer 3\/3, angle 45 deg/);
  assert.match(result.text, /Calculated min layer height at this angle: 0\.141421 mm/);
});

test("maps the standard B and C rotary axes to Y and Z", () => {
  assert.match(generateGcode({ ...defaults, angleAxis: "B" }).text, /; Rotary axis: B \(rotation about Y\)/);
  assert.match(generateGcode({ ...defaults, angleAxis: "C" }).text, /; Rotary axis: C \(rotation about Z\)/);
});

test("rejects unsafe heights and heights wider than the fixed nozzle-sized bead", () => {
  assert.throws(
    () => generateGcode({ ...defaults, layerHeight: 0.1 }),
    /collides at 45° tilt: minimum safe height is 0\.141421 mm/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, layerHeight: 0.5 }),
    /Nozzle tip diameter \(0\.4 mm\) must be at least the layer height \(0\.5 mm\)/,
  );
});

test("rejects invalid layer counts, axes, and oversized stacks", () => {
  assert.throws(() => generateGcode({ ...defaults, layerCount: 1.5 }), /whole number between 1 and 20/);
  assert.throws(() => generateGcode({ ...defaults, angleAxis: "E" }), /Choose A \(rotation about X\)/);
  assert.throws(() => generateGcode({ ...defaults, angleAxis: "," }), /Choose A \(rotation about X\)/);
  assert.throws(
    () => generateGcode({ ...defaults, layerCount: 6, multiplierStart: 0.01, multiplierEnd: 1, multiplierStep: 0.01 }),
    /creates 600 printed layers/,
  );
});
