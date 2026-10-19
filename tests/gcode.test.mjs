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
  nozzleDiameter: 0.4,
  filamentDiameter: 1.75,
  beadLength: 12,
  angleAxis: "A",
  travelFeedrate: 6000,
  firmware: "klipper",
  bedShape: "rectangular",
  bedSizeX: 220,
  bedSizeY: 220,
  originAtCenter: false,
  bedCenterX: null,
  bedCenterY: null,
  extruderName: "",
  toolIndex: 0,
  retractDistance: 0.8,
  retractSpeed: 35,
  unretractSpeed: 30,
  zHopHeight: 0.4,
  firmwareRetraction: false,
  firstLayerHeight: 0.24,
  firstLayerSpeed: 20,
  firstLayerFan: 0,
  baseLineWidthPercent: 150,
  printSpeed: 60,
  acceleration: 0,
  fanSpeed: 50,
  hotendTemperature: 210,
  bedTemperature: 60,
  homeAxes: true,
  heatBed: true,
  heatHotend: true,
  useCustomStartGcode: false,
  customStartGcode: "",
  useCustomEndGcode: false,
  customEndGcode: "",
};

test("calculates capsule area and nozzle-rim collision clearance", () => {
  const expectedArea = (0.4 - 0.2) * 0.2 + Math.PI * (0.2 / 2) ** 2;
  assert.ok(Math.abs(layerArea(0.2, 0.4) - expectedArea) < 1e-12);
  assert.equal(minimumLayerHeight(0.4, 0), 0);
  assert.ok(Math.abs(minimumLayerHeight(0.4, 30) - 0.1) < 1e-12);
  assert.ok(Math.abs(minimumLayerHeight(0.4, 45) - 0.1414213562373095) < 1e-12);
});

test("generates a deterministic flow-by-height matrix over one solid base", () => {
  const config = { ...defaults, acceleration: 3500 };
  const result = generateGcode(config);
  assert.equal(result.rowCount, 5);
  assert.equal(result.columnCount, 3);
  assert.equal(result.caseCount, 15);
  assert.equal(result.totalLayerCount, 46);
  assert.equal(result.angle, 45);
  assert.deepEqual(result.preview.rows.map((row) => row.flowPercent), [90, 95, 100, 105, 110]);
  assert.deepEqual(result.preview.columns.map((column) => column.height), [0.15, 0.2, 0.25]);
  assert.equal(result.preview.tags.find((tag) => tag.kind === "angle").text, "45°");
  assert.deepEqual(result.preview.tags.filter((tag) => tag.kind === "height").map((tag) => tag.text), ["0.15", "0.2", "0.25"]);
  assert.deepEqual(result.preview.tags.filter((tag) => tag.kind === "flow").map((tag) => tag.text), ["90", "95", "100", "105", "110"]);
  assert.ok(result.preview.tags.every((tag) => tag.paths.length > 0));
  assert.equal(result.preview.layerCount, 3);
  assert.equal(result.preview.angleAxis, "A");
  assert.equal(result.preview.firstLayerHeight, defaults.firstLayerHeight);
  assert.equal(result.preview.tagHeight, defaults.layerHeightStart);
  assert.equal(result.text, generateGcode(config).text);
  assert.match(result.text, /Matrix: 5 flow rows × 3 layer-height columns; 15 test lines; 3 layers per cell/);
  assert.match(result.text, /Flow labels are percentages: 90% to 110% in 5% increments/);
  assert.match(result.text, /Layer-height labels are millimeters: 0\.15 to 0\.25 mm in 0\.05 mm increments/);
  assert.match(result.text, /One solid first-layer base connects the matrix labels and all test lines/);
  assert.match(result.text, /; SOLID MATRIX BASE \| one connected first layer/);
  assert.match(result.text, /; CELL \| nozzle 45 deg \| layer 0\.15 mm \| flow 90%/);
  assert.match(result.text, /; CELL \| nozzle 45 deg \| layer 0\.25 mm \| flow 110%/);
  assert.doesNotMatch(result.text, /SPECIMEN \d|First-layer anchor frame|perimeter/);
  assert.equal((result.text.match(/; CELL \|/g) ?? []).length, 15);
  assert.equal((result.text.match(/G1 A45/g) ?? []).length, 45);
  assert.match(result.text, /Minimum layer height at this angle:|Collision-safe minimum height at this angle: 0\.141421 mm/);
  assert.ok(result.dimensions.width < result.bed.sizeX);
});

test("converts flow percentages to extrusion multipliers for each matrix row", () => {
  const result = generateGcode({
    ...defaults,
    layerHeightStart: 0.15,
    layerHeightEnd: 0.15,
    flowStartPercent: 90,
    flowEndPercent: 100,
    flowStepPercent: 10,
    layerCount: 1,
  });
  assert.deepEqual(result.cases.map(({ flowPercent, multiplier }) => [flowPercent, multiplier]), [[90, 0.9], [100, 1]]);
  const cellExtrusions = result.text.split("; CELL |").slice(1).map((cell) => Number(cell.match(/G1 X[^\n]+ E([0-9.]+)/)[1]));
  assert.equal(cellExtrusions.length, 2);
  assert.ok(Math.abs(cellExtrusions[1] / cellExtrusions[0] - 100 / 90) < 1e-6);
});

test("keeps matrix layout bounded and verifies bed shape and origin handling", () => {
  const centered = generateGcode({ ...defaults, originAtCenter: true });
  assert.match(centered.text, /Pattern centered at X0 Y0; origin at bed center: true/);
  assert.equal(centered.bed.centerX, 0);
  assert.equal(centered.bed.centerY, 0);

  const circular = generateGcode({ ...defaults, bedShape: "circular", bedSizeX: 220, bedSizeY: 220 });
  assert.equal(circular.bed.shape, "circular");
  assert.throws(
    () => generateGcode({ ...defaults, bedSizeX: 50, bedSizeY: 50, beadLength: 30 }),
    /solid matrix base, labels, and test lines.*does not fit the 50 × 50 mm rectangular bed/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, bedShape: "circular", bedSizeX: 50, bedSizeY: 50, beadLength: 30 }),
    /solid matrix base, labels, and test lines.*too large to fit inside the 50 mm circular bed/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, bedShape: "circular", bedSizeX: 220, bedSizeY: 200 }),
    /X and Y must both equal the bed diameter/,
  );
});

test("emits firmware-aware axes, tools, retraction, acceleration, and heating commands", () => {
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
  assert.match(marlin, /Firmware retraction uses G10\/G11/);
  assert.match(marlin, /\nG10\n/);
  assert.match(marlin, /\nG11\n/);

  const reprap = generateGcode({ ...defaults, firmware: "reprap", angleAxis: "C", acceleration: 3000 }).text;
  assert.match(reprap, /Selected rotary axis: C \(rotation about Z\)/);
  assert.match(reprap, /M204 P3000 T3000/);

  const klipper = generateGcode({
    ...defaults,
    extruderName: "extruder2",
    firmwareRetraction: true,
  }).text;
  assert.match(klipper, /ACTIVATE_EXTRUDER EXTRUDER=extruder2/);
  assert.match(klipper, /SET_RETRACTION RETRACT_LENGTH=0\.8 RETRACT_SPEED=35 UNRETRACT_SPEED=30/);
  assert.throws(
    () => generateGcode({ ...defaults, toolIndex: 2 }),
    /For a non-default Klipper tool, enter its extruder name/,
  );
});

test("substitutes custom G-code tokens and honors optional startup commands", () => {
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
});

test("rejects heights below collision clearance, invalid settings, and excessive matrix sizes", () => {
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightStart: 0.1 }),
    /Minimum layer height 0\.1 mm is below the collision-safe minimum 0\.141421 mm/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightEnd: 0.5 }),
    /Layer height values must be between 0\.01 and 0\.4/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightStart: 0.3, layerHeightEnd: 0.2 }),
    /Layer height maximum must be greater than or equal to its minimum/,
  );
  assert.throws(() => generateGcode({ ...defaults, layerHeightStart: null }), /Layer height minimum must be a finite number/);
  assert.throws(() => generateGcode({ ...defaults, layerCount: 1.5 }), /whole number between 1 and 20/);
  assert.throws(() => generateGcode({ ...defaults, firmware: "unknown" }), /Choose Klipper, Marlin/);
  assert.throws(() => generateGcode({ ...defaults, angleAxis: "E" }), /Choose A \(rotation about X\)/);
  assert.throws(() => generateGcode({ ...defaults, extruderName: "extruder;M112" }), /Extruder name can contain only/);
  assert.throws(
    () => generateGcode({ ...defaults, layerHeightStart: 0.15, layerHeightEnd: 0.25, layerHeightStep: 0.01, flowStartPercent: 90, flowEndPercent: 99, flowStepPercent: 1 }),
    /creates 110 matrix cells/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, flowStartPercent: 90, flowEndPercent: 110, flowStepPercent: 2, layerCount: 20 }),
    /creates 660 test layers/,
  );
  assert.throws(
    () => generateGcode({ ...defaults, useCustomStartGcode: true, customStartGcode: "M105\u0000M112" }),
    /cannot contain control characters/,
  );
});
