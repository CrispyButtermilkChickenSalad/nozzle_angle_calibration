import test from "node:test";
import assert from "node:assert/strict";
import { generateGcode, layerArea, minimumLayerHeight } from "../src/gcode.mjs";

const defaults = {
  angleDegrees: 45,
  layerHeightStart: 0.15,
  layerHeightEnd: 0.25,
  layerHeightStep: 0.05,
  layerCount: 3,
  flowStartPercent: 90,
  flowEndPercent: 110,
  flowStepPercent: 5,
  nozzleTipDiameter: 0.4,
  nozzleHoleDiameter: 0.4,
  filamentDiameter: 1.75,
  beadLength: 12,
  angleAxis: "A",
  firmware: "klipper",
  bedShape: "rectangular",
  bedSizeX: 220,
  bedSizeY: 220,
  originAtCenter: false,
  bedCenterX: null,
  bedCenterY: null,
  extruderName: "",
  toolIndex: 0,
  retractDistance: 0.5,
  retractSpeed: 35,
  unretractSpeed: 30,
  zHopHeight: 0.1,
  firmwareRetraction: false,
  firstLayerHeight: 0.24,
  firstLayerSpeed: 20,
  firstLayerFan: 0,
  baseLineWidthPercent: 150,
  threeWallSpecimens: false,
  printSpeed: 60,
  acceleration: 0,
  fanSpeed: 50,
  hotendTemperature: 210,
  bedTemperature: 60,
  pressureAdvance: 0.04,
  usePressureAdvance: true,
  homeAxes: true,
  heatBed: true,
  heatHotend: true,
  useCustomStartGcode: false,
  customStartGcode: "",
  useCustomEndGcode: false,
  customEndGcode: "",
};

test("calculates capsule area and nozzle-rim clearance from physical tip diameter", () => {
  const expectedArea = (0.4 - 0.2) * 0.2 + Math.PI * (0.2 / 2) ** 2;
  assert.ok(Math.abs(layerArea(0.2, 0.4) - expectedArea) < 1e-12);
  assert.equal(minimumLayerHeight(0.4, 0), 0);
  assert.ok(Math.abs(minimumLayerHeight(0.4, 30) - 0.1) < 1e-12);
  assert.ok(Math.abs(minimumLayerHeight(0.4, 45) - 0.1414213562373095) < 1e-12);

  const independentDiameters = generateGcode({
    ...defaults,
    nozzleTipDiameter: 0.8,
    nozzleHoleDiameter: 0.2,
    layerHeightStart: 0.3,
    layerHeightEnd: 0.3,
  });
  assert.equal(independentDiameters.preview.nozzleTipDiameter, 0.8);
  assert.equal(independentDiameters.preview.nozzleHoleDiameter, 0.2);
  assert.match(independentDiameters.text, /Collision-safe minimum height at this angle: 0\.282843 mm; physical nozzle tip diameter 0\.8 mm/);
});

test("generates deterministic test order, readable labels, purge, and safe defaults", () => {
  const config = { ...defaults, acceleration: 3500 };
  const result = generateGcode(config);
  assert.equal(result.rowCount, 5);
  assert.equal(result.columnCount, 3);
  assert.equal(result.caseCount, 15);
  assert.equal(result.totalLayerCount, 46);
  assert.equal(result.angle, 45);
  assert.deepEqual(result.preview.rows.map((row) => row.flowPercent), [90, 95, 100, 105, 110]);
  assert.ok(result.preview.rows.slice(1).every((row, index) => result.preview.rows[index].y - row.y > 5));
  assert.ok(result.preview.rows[0].y > result.preview.rows.at(-1).y);
  assert.deepEqual(result.preview.columns.map((column) => column.height), [0.15, 0.2, 0.25]);
  assert.deepEqual(result.cases.slice(0, 6).map(({ height, flowPercent }) => [height, flowPercent]), [
    [0.15, 90], [0.15, 95], [0.15, 100], [0.15, 105], [0.15, 110], [0.2, 90],
  ]);
  assert.equal(result.preview.tags.find((tag) => tag.kind === "angle").text, "45°");
  assert.deepEqual(result.preview.tags.filter((tag) => tag.kind === "height").map((tag) => tag.text), ["0.15", "0.2", "0.25"]);
  assert.deepEqual(result.preview.tags.filter((tag) => tag.kind === "flow").map((tag) => tag.text), ["90", "95", "100", "105", "110"]);
  const flowLabels = result.preview.tags.filter((tag) => tag.kind === "flow");
  const rightmostStroke = (tag) => Math.max(...tag.paths.flatMap((path) => path.map((point) => point[0])));
  assert.ok(flowLabels.every((tag) => Math.abs(rightmostStroke(tag) - rightmostStroke(flowLabels[0])) < 1e-9));
  assert.ok(result.preview.tags.every((tag) => tag.paths.length > 0));
  assert.equal(result.preview.layerCount, 3);
  assert.equal(result.preview.wallCount, 1);
  assert.equal(result.preview.angleAxis, "A");
  assert.equal(result.preview.firstLayerHeight, defaults.firstLayerHeight);
  assert.equal(result.preview.tagHeight, defaults.layerHeightStart);
  assert.ok(result.preview.labelMetrics.glyphHeight >= 10 * defaults.nozzleHoleDiameter);
  assert.ok(result.preview.labelMetrics.gapClearance >= defaults.nozzleHoleDiameter * 0.5);
  assert.equal(result.preview.labelMetrics.readable, true);
  assert.ok(Math.abs(
    result.preview.purge.xEnd - result.preview.purge.xStart - result.preview.purge.length,
  ) < 1e-9);
  assert.ok(result.preview.purge.length >= result.preview.bounds.maxX - result.preview.bounds.minX - defaults.nozzleHoleDiameter);
  assert.ok(Math.abs(
    Math.abs(result.preview.purge.returnY - result.preview.purge.y) - 2 * result.preview.beadWidth,
  ) < 1e-9);
  assert.ok(Math.abs(
    result.preview.bounds.minY - result.preview.purge.y - result.preview.beadWidth / 2 - 4,
  ) < 1e-9);
  assert.ok(result.preview.rows.every((row) => row.y >= result.preview.bounds.minY && row.y <= result.preview.bounds.maxY));
  assert.equal(result.text, generateGcode(config).text);
  assert.match(result.text, /Matrix: 5 flow rows × 3 layer-height columns; 15 specimens; 3 layers per specimen/);
  assert.match(result.text, /complete each layer-height column from minimum to maximum; flow increases within each column/);
  assert.match(result.text, /Flow labels are percentages: 90% to 110% in 5% increments/);
  assert.match(result.text, /Layer-height labels are millimeters: 0\.15 to 0\.25 mm in 0\.05 mm increments/);
  assert.match(result.text, /maximum is 1\.5 × nozzle-hole diameter/);
  assert.match(result.text, /One solid first-layer base connects the matrix labels and all test lines/);
  assert.match(result.text, /; DOUBLE-PASS PURGE \| [\d.]+ mm each way, separate from matrix base and samples/);
  assert.match(result.text, /reposition for return purge pass without extrusion/);
  assert.match(result.text, /total\), with a [\d.]+ mm return pass/);
  const purgeBlock = result.text.split("; DOUBLE-PASS PURGE")[1].split("; SOLID MATRIX BASE")[0];
  assert.equal((purgeBlock.match(/^G1 X.* E/mg) ?? []).length, 2);
  assert.match(result.text, /; SOLID MATRIX BASE \| one connected first layer/);
  assert.match(result.text, /; CELL \| nozzle 45 deg \| layer 0\.15 mm \| flow 90%/);
  assert.match(result.text, /; CELL \| nozzle 45 deg \| layer 0\.25 mm \| flow 110%/);
  assert.match(result.text, /SET_PRESSURE_ADVANCE ADVANCE=0\.04/);
  assert.match(result.text, /M104 S0 ; turn off hotend\nM140 S0 ; turn off bed/);
  assert.doesNotMatch(result.text, /SPECIMEN \d|First-layer anchor frame|perimeter/);
  assert.equal((result.text.match(/; CELL \|/g) ?? []).length, 15);
  assert.equal((result.text.match(/G1 A45/g) ?? []).length, 45);
  assert.match(result.text, /height columns increase left-to-right \(\+X\); minimum flow is at \+Y, increasing flow runs toward -Y/);
  assert.match(result.text, /Collision-safe minimum height at this angle: 0\.141421 mm; physical nozzle tip diameter 0\.4 mm/);
  const angleLabelBlock = result.text.split("; angle label 45°\n")[1].split("; height label")[0];
  const markerMoves = angleLabelBlock.split("\n");
  for (let index = 0; index < markerMoves.length; index += 1) {
    if (!markerMoves[index].includes("; non-extruding move within this label")) continue;
    assert.doesNotMatch(markerMoves[index], /G0 Z|E[-\d]/);
    assert.doesNotMatch(markerMoves[index + 1], /retract|G10|G11/);
  }
  const firstMarkerExtrusion = markerMoves.findIndex((line) => /^G1 X.* E/.test(line));
  assert.doesNotMatch(markerMoves.slice(firstMarkerExtrusion + 1).join("\n"), /retract|G10|G11|G0 Z/);
  const firstHeightLabel = result.text.split("; height label")[1].split("\n");
  assert.match(firstHeightLabel.slice(0, 8).join("\n"), /retract|G10|G11/);
  assert.ok(result.dimensions.width < result.bed.sizeX);
});

test("uses Slic3r overlap spacing for three adjacent walls", () => {
  const result = generateGcode({ ...defaults, threeWallSpecimens: true, layerCount: 1 });
  const expectedSpacing = 0.4 - 0.15 * (1 - Math.PI / 4);
  assert.equal(result.wallCount, 3);
  assert.equal(result.preview.rows[0].wallCount, 3);
  assert.ok(Math.abs(result.preview.columns[0].wallSpacing - expectedSpacing) < 1e-12);
  assert.equal((result.text.match(/G1 A45/g) ?? []).length, result.caseCount * 3);
  assert.match(result.text, new RegExp(`3 wall\\(s\\) at ${Number(expectedSpacing.toFixed(6))} mm center spacing`));
  assert.match(result.text, /Adjacent center spacing = extrusion width - layer height \* \(1 - pi\/4\)/);
});

test("scales label size and spacing with nozzle-hole diameter", () => {
  const standard = generateGcode({ ...defaults, layerHeightEnd: 0.15 });
  const fine = generateGcode({
    ...defaults,
    nozzleHoleDiameter: 0.2,
    layerHeightStart: 0.15,
    layerHeightEnd: 0.15,
  });
  assert.ok(fine.preview.labelMetrics.glyphHeight < standard.preview.labelMetrics.glyphHeight);
  assert.ok(fine.preview.labelMetrics.gapClearance >= 0.1);
  assert.equal(fine.preview.labelMetrics.readable, true);
});

test("converts flow percentages to extrusion multipliers at nozzle-hole width", () => {
  const result = generateGcode({
    ...defaults,
    layerHeightStart: 0.15,
    layerHeightEnd: 0.15,
    flowStartPercent: 90,
    flowEndPercent: 100,
    flowStepPercent: 10,
    layerCount: 1,
  });
  assert.deepEqual(result.cases.map(({ flowPercent, multiplier, width }) => [flowPercent, multiplier, width]), [
    [90, 0.9, 0.4], [100, 1, 0.4],
  ]);
  const cellExtrusions = result.text.split("; CELL |").slice(1).map((cell) => Number(cell.match(/G1 X[^\n]+ E([0-9.]+)/)[1]));
  assert.equal(cellExtrusions.length, 2);
  assert.ok(Math.abs(cellExtrusions[1] / cellExtrusions[0] - 100 / 90) < 1e-6);
});

test("keeps matrix layout bounded and includes the purge line in bed-fit checks", () => {
  const centered = generateGcode({ ...defaults, originAtCenter: true });
  assert.match(centered.text, /Pattern centered at X0 Y0; origin at bed center: true/);
  assert.equal(centered.bed.centerX, 0);
  assert.equal(centered.bed.centerY, 0);

  const circular = generateGcode({ ...defaults, bedShape: "circular", bedSizeX: 220, bedSizeY: 220 });
  assert.equal(circular.bed.shape, "circular");
  assert.throws(
    () => generateGcode({ ...defaults, bedSizeX: 50, bedSizeY: 50, beadLength: 30 }),
    /solid matrix base, labels, test lines, and purge line.*does not fit the 50 × 50 mm rectangular bed/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, bedShape: "circular", bedSizeX: 50, bedSizeY: 50, beadLength: 30 }),
    /solid matrix base, labels, test lines, and purge line.*too large to fit inside the 50 mm circular bed/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, bedShape: "circular", bedSizeX: 220, bedSizeY: 200 }),
    /X and Y must both equal the bed diameter/,
  );
});

test("emits firmware-specific pressure advance and printer commands", () => {
  const marlin = generateGcode({
    ...defaults,
    firmware: "marlin",
    angleAxis: "B",
    toolIndex: 2,
    acceleration: 2500,
    firmwareRetraction: true,
  }).text;
  assert.match(marlin, /\nT2\n/);
  assert.match(marlin, /Selected rotary axis: B \(rotation about Y\)/);
  assert.match(marlin, /M204 S2500/);
  assert.match(marlin, /M900 K0\.04/);
  assert.match(marlin, /Firmware retraction uses G10\/G11/);
  assert.match(marlin, /\nG10\n/);
  assert.match(marlin, /\nG11\n/);

  const reprap = generateGcode({
    ...defaults,
    firmware: "reprap",
    angleAxis: "C",
    acceleration: 3000,
    toolIndex: 1,
    pressureAdvance: 0.12,
  }).text;
  assert.match(reprap, /Selected rotary axis: C \(rotation about Z\)/);
  assert.match(reprap, /M204 P3000 T3000/);
  assert.match(reprap, /M572 D1 S0\.12/);

  const klipper = generateGcode({
    ...defaults,
    extruderName: "extruder2",
    firmwareRetraction: true,
  }).text;
  assert.match(klipper, /ACTIVATE_EXTRUDER EXTRUDER=extruder2/);
  assert.match(klipper, /SET_RETRACTION RETRACT_LENGTH=0\.5 RETRACT_SPEED=35 UNRETRACT_SPEED=30/);
  assert.throws(
    () => generateGcode({ ...defaults, toolIndex: 2 }),
    /For a non-default Klipper tool, enter its extruder name/,
  );

  const firmwareConfigured = generateGcode({ ...defaults, usePressureAdvance: false }).text;
  assert.match(firmwareConfigured, /Pressure advance left to firmware configuration/);
  assert.doesNotMatch(firmwareConfigured, /SET_PRESSURE_ADVANCE|M900 K|M572 D/);
  const generic = generateGcode({ ...defaults, firmware: "generic" }).text;
  assert.match(generic, /Set the fixed pressure-advance value using the command supported by this firmware/);
});

test("custom end G-code replaces the default hotend and bed shutdown", () => {
  const custom = generateGcode({
    ...defaults,
    useCustomEndGcode: true,
    customEndGcode: "END_PRINT",
  }).text;
  assert.match(custom, /END_PRINT/);
  assert.doesNotMatch(custom, /M104 S0 ; turn off hotend|M140 S0 ; turn off bed/);

  const fallback = generateGcode({
    ...defaults,
    useCustomEndGcode: true,
    customEndGcode: "",
  }).text;
  assert.match(fallback, /M104 S0 ; turn off hotend\nM140 S0 ; turn off bed/);
});

test("substitutes custom start tokens and honors optional startup commands", () => {
  const result = generateGcode({
    ...defaults,
    homeAxes: false,
    heatBed: false,
    heatHotend: false,
    useCustomStartGcode: true,
    customStartGcode: "START_PRINT BED=[BED_TEMP] HOTEND=[HOTEND_TEMP] TOOL=[TOOL_INDEX] EXTRUDER=[EXTRUDER_NAME]",
    useCustomEndGcode: true,
    customEndGcode: "END_PRINT",
  }).text;
  assert.doesNotMatch(result, /\nG28\b/);
  assert.doesNotMatch(result, /\nM190\b|\nM109\b/);
  assert.match(result, /START_PRINT BED=60 HOTEND=210 TOOL=0 EXTRUDER=/);
  assert.match(result, /END_PRINT/);
  assert.doesNotMatch(result, /M104 S0 ; turn off hotend|M140 S0 ; turn off bed/);
});

test("rejects collision-unsafe, over-limit, invalid, and oversized test setups", () => {
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightStart: 0.1 }),
    /Minimum layer height 0\.1 mm is below the collision-safe minimum 0\.141421 mm/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightEnd: 0.61 }),
    /Layer height values must be between 0\.01 and 0\.6/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightStart: 0.3, layerHeightEnd: 0.2 }),
    /Layer height maximum must be greater than or equal to its minimum/,
  );
  assert.throws(() => generateGcode({ ...defaults, layerHeightStart: null }), /Layer height minimum must be a finite number/);
  assert.throws(() => generateGcode({ ...defaults, layerCount: 1.5 }), /whole number between 1 and 10/);
  assert.throws(() => generateGcode({ ...defaults, layerCount: 11 }), /whole number between 1 and 10/);
  assert.throws(() => generateGcode({ ...defaults, firmware: "unknown" }), /Choose Klipper, Marlin/);
  assert.throws(() => generateGcode({ ...defaults, angleAxis: "E" }), /Choose A \(rotation about X\)/);
  assert.throws(() => generateGcode({ ...defaults, extruderName: "extruder;M112" }), /Extruder name can contain only/);
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightStart: 0.15, layerHeightEnd: 0.25, layerHeightStep: 0.01, flowStartPercent: 90, flowEndPercent: 99, flowStepPercent: 1 }),
    /creates 110 matrix cells/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, flowStartPercent: 90, flowEndPercent: 110, flowStepPercent: 1, layerCount: 10 }),
    /creates 630 test layers/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, useCustomStartGcode: true, customStartGcode: "M105\u0000M112" }),
    /cannot contain control characters/,
  );
});
