import test from "node:test";
import assert from "node:assert/strict";
import { generateGcode, layerArea, minimumLayerHeight } from "../src/gcode.mjs";

const defaults = {
  angleStart: 0,
  angleEnd: 45,
  angleStep: 15,
  layerHeightStart: 0.2,
  layerHeightEnd: 0.3,
  layerHeightStep: 0.1,
  lineWidthStart: 0.4,
  lineWidthEnd: 0.5,
  lineWidthStep: 0.1,
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

test("calculates the capsule bead area from layer height and width", () => {
  const height = 0.2;
  const width = 0.4;
  const expected = (width - height) * height + Math.PI * (height / 2) ** 2;
  assert.ok(Math.abs(layerArea(height, width) - expected) < 1e-12);
});

test("projects the tilted circular rim using the Pythagorean relation", () => {
  assert.equal(minimumLayerHeight(0.4, 0), 0);
  assert.ok(Math.abs(minimumLayerHeight(0.4, 30) - 0.1) < 1e-12);
  assert.ok(Math.abs(minimumLayerHeight(0.4, 90 - 1e-8) - 0.2) < 1e-8);
});

test("creates deterministic, labeled G-code for every parameter combination and angle", () => {
  const result = generateGcode(defaults);
  assert.equal(result.caseCount, 8);
  assert.equal(result.rowCount, 32);
  assert.equal(result.text, generateGcode(defaults).text);
  assert.match(result.text, /ROW 001 \| angle 0 deg \| layer height 0\.2 mm \| line width 0\.4 mm \| extrusion multiplier 0\.9/);
  assert.match(result.text, /G1 A45/);
  assert.match(result.text, /print physical row and angle markers upright/);
  assert.match(result.text, /Calculated min layer height at this angle: 0\.141421 mm/);
});

test("rejects a layer height that would collide with the tilted rim", () => {
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightStart: 0.1, layerHeightEnd: 0.1, lineWidthStart: 0.4, lineWidthEnd: 0.4 }),
    /collides at 45° tilt: minimum safe height is 0\.141421 mm/,
  );
});

test("preserves sub-millimeter sweep precision in comments and Z moves", () => {
  const result = generateGcode({
    ...defaults,
    angleEnd: 0,
    layerHeightStart: 0.205,
    layerHeightEnd: 0.205,
    lineWidthStart: 0.405,
    lineWidthEnd: 0.405,
    multiplierStart: 0.95,
    multiplierEnd: 0.95,
  });
  assert.match(result.text, /layer height 0\.205 mm \| line width 0\.405 mm \| extrusion multiplier 0\.95/);
  assert.match(result.text, /G0 Z0\.205/);
});

test("rejects invalid widths, rotary axes, and row explosions", () => {
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightStart: 0.3, layerHeightEnd: 0.3, lineWidthStart: 0.2, lineWidthEnd: 0.2 }),
    /Line width .* must be at least the layer height/,
  );
  assert.throws(() => generateGcode({ ...defaults, angleAxis: "E" }), /Angle axis must be one rotary axis letter/);
  assert.throws(() => generateGcode({ ...defaults, angleAxis: "," }), /Angle axis must be one rotary axis letter/);
  assert.throws(
    () => generateGcode({ ...defaults, angleEnd: 89, angleStep: 0.1 }),
    /range has more than 100 values/,
  );
});
