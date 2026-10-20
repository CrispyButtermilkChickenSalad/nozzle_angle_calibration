const MAX_RANGE_VALUES = 100;
const MAX_TEST_CELLS = 100;
const MAX_PRINTED_LAYERS = 500;
const MAX_LAYERS_PER_SPECIMEN = 10;
const TRAVEL_FEEDRATE = 6000;
const EPSILON = 1e-9;

export function layerArea(layerHeight, lineWidth) {
  return (lineWidth - layerHeight) * layerHeight + Math.PI * (layerHeight / 2) ** 2;
}

export function minimumLayerHeight(nozzleTipDiameter, tiltDegrees) {
  if (!Number.isFinite(nozzleTipDiameter) || nozzleTipDiameter <= 0) {
    throw new Error("Nozzle tip diameter must be greater than zero.");
  }
  if (!Number.isFinite(tiltDegrees) || tiltDegrees < 0 || tiltDegrees >= 90) {
    throw new Error("Nozzle tilt must be at least 0° and less than 90°.");
  }
  const radius = nozzleTipDiameter / 2;
  const horizontalProjection = radius * Math.cos(tiltDegrees * Math.PI / 180);
  return Math.sqrt(Math.max(0, radius ** 2 - horizontalProjection ** 2));
}

function numeric(value, name) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    throw new Error(`${name} must be a finite number.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number.`);
  return parsed;
}

function valueRange(startValue, endValue, stepValue, name, minimum, maximum) {
  const start = numeric(startValue, `${name} minimum`);
  const end = numeric(endValue, `${name} maximum`);
  const step = numeric(stepValue, `${name} increment`);
  if (start < minimum || start > maximum || end < minimum || end > maximum) {
    throw new Error(`${name} values must be between ${minimum} and ${maximum}.`);
  }
  if (step <= 0) throw new Error(`${name} increment must be greater than zero.`);
  if (end < start) throw new Error(`${name} maximum must be greater than or equal to its minimum.`);

  const values = [];
  for (let index = 0; index < MAX_RANGE_VALUES; index += 1) {
    const value = start + index * step;
    if (value > end + EPSILON) break;
    values.push(Number(value.toFixed(6)));
  }
  if (values.length === MAX_RANGE_VALUES && values.at(-1) < end - EPSILON) {
    throw new Error(`${name} range has more than ${MAX_RANGE_VALUES} values.`);
  }
  if (!values.length) values.push(start);
  if (Math.abs(values.at(-1) - end) > EPSILON) values.push(end);
  if (values.length > MAX_RANGE_VALUES) throw new Error(`${name} range has more than ${MAX_RANGE_VALUES} values.`);
  return values;
}

function format(value, decimals = 6) {
  return Number(value.toFixed(decimals)).toString();
}

function createCases(config, clearance, nozzleHoleDiameter) {
  const angle = numeric(config.angleDegrees, "Nozzle angle");
  const heights = valueRange(
    config.layerHeightStart,
    config.layerHeightEnd,
    config.layerHeightStep,
    "Layer height",
    0.01,
    Number((nozzleHoleDiameter * 1.5).toFixed(6)),
  );
  const flows = valueRange(
    config.flowStartPercent,
    config.flowEndPercent,
    config.flowStepPercent,
    "Flow percentage",
    1,
    500,
  );
  const layerCount = numeric(config.layerCount, "Stacked layer count");

  if (angle < 0 || angle > 89) throw new Error("Nozzle angle must be between 0 and 89 degrees.");
  for (const height of heights) {
    if (height + EPSILON < clearance) {
      throw new Error(`Minimum layer height ${format(height)} mm is below the collision-safe minimum ${format(clearance)} mm at ${format(angle, 1)}° tilt.`);
    }
  }
  if (!Number.isInteger(layerCount) || layerCount < 1 || layerCount > MAX_LAYERS_PER_SPECIMEN) {
    throw new Error(`Stacked layer count must be a whole number between 1 and ${MAX_LAYERS_PER_SPECIMEN}.`);
  }

  const cellCount = flows.length * heights.length;
  if (cellCount > MAX_TEST_CELLS) {
    throw new Error(`This combination creates ${cellCount} matrix cells; reduce the flow or layer-height range to ${MAX_TEST_CELLS} cells or fewer.`);
  }
  if (cellCount * layerCount > MAX_PRINTED_LAYERS) {
    throw new Error(`This combination creates ${cellCount * layerCount} test layers; reduce the matrix or stacked layer count to ${MAX_PRINTED_LAYERS} layers or fewer.`);
  }

  const wallCount = config.threeWallSpecimens ? 3 : 1;
  const cases = heights.flatMap((height) => flows.map((flowPercent) => ({
    height,
    width: nozzleHoleDiameter,
    flowPercent,
    multiplier: flowPercent / 100,
    wallCount,
  })));
  return { angle, cases, flows, heights, layerCount, wallCount };
}

const SEGMENTS = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
  "-": ["g"],
};

function markerSegments(text, nozzleHoleDiameter) {
  const height = Math.max(nozzleHoleDiameter * 10, 3.2);
  const scale = height / 2;
  const glyphGap = Math.max(nozzleHoleDiameter * 1.75, 0.5);
  const paths = [];
  const width = 1.2 * scale;
  let cursor = 0;
  for (const character of text) {
    if (character === ".") {
      paths.push([[cursor, height - nozzleHoleDiameter / 2], [cursor + Math.max(nozzleHoleDiameter * 1.2, 0.35), height - nozzleHoleDiameter / 2]]);
      cursor += glyphGap;
      continue;
    }
    if (character === "°") {
      const diameter = Math.max(nozzleHoleDiameter * 1.4, 0.55);
      const top = 0;
      const left = cursor + nozzleHoleDiameter * 0.2;
      paths.push([[left, top], [left + diameter, top]]);
      paths.push([[left + diameter, top], [left + diameter, top + diameter]]);
      paths.push([[left + diameter, top + diameter], [left, top + diameter]]);
      paths.push([[left, top + diameter], [left, top]]);
      cursor += diameter + glyphGap;
      continue;
    }
    const segments = {
      a: [[cursor, 0], [cursor + width, 0]],
      b: [[cursor + width, 0], [cursor + width, height / 2]],
      c: [[cursor + width, height / 2], [cursor + width, height]],
      d: [[cursor, height], [cursor + width, height]],
      e: [[cursor, height / 2], [cursor, height]],
      f: [[cursor, 0], [cursor, height / 2]],
      g: [[cursor, height / 2], [cursor + width, height / 2]],
    };
    for (const segment of SEGMENTS[character] ?? []) paths.push(segments[segment]);
    cursor += width + glyphGap;
  }
  return {
    paths,
    width: Math.max(0, cursor - glyphGap),
    height,
    glyphGap,
    gapClearance: glyphGap - nozzleHoleDiameter,
  };
}

function extrusionPerMm(height, width, multiplier, filamentDiameter) {
  const beadCrossSection = layerArea(height, width);
  const filamentCrossSection = Math.PI * (filamentDiameter / 2) ** 2;
  return beadCrossSection * multiplier / filamentCrossSection;
}

function validateNumber(value, name, minimum, maximum) {
  const parsed = numeric(value, name);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function optionalNumber(value, name) {
  if (value === null || value === undefined || value === "") return null;
  return numeric(value, name);
}

function gcodeBlock(text, config) {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    throw new Error("Custom G-code cannot contain control characters.");
  }
  return text
    .replaceAll("[BED_TEMP]", format(config.bedTemperature, 0))
    .replaceAll("[HOTEND_TEMP]", format(config.hotendTemperature, 0))
    .replaceAll("[TOOL_INDEX]", String(config.toolIndex))
    .replaceAll("[EXTRUDER_NAME]", config.extruderName);
}

function fanCommand(percent) {
  return `M106 S${Math.round(percent * 255 / 100)} ; fan ${format(percent, 0)}%`;
}

export function generateGcode(config) {
  const angle = numeric(config.angleDegrees, "Nozzle angle");
  const nozzleTipDiameter = validateNumber(config.nozzleTipDiameter, "Nozzle tip diameter", 0.05, 10);
  const nozzleHoleDiameter = validateNumber(config.nozzleHoleDiameter, "Nozzle hole diameter", 0.05, 5);
  const clearance = minimumLayerHeight(nozzleTipDiameter, angle);
  const { cases, flows, heights, layerCount, wallCount } = createCases(config, clearance, nozzleHoleDiameter);
  const filamentDiameter = validateNumber(config.filamentDiameter, "Filament diameter", 0.5, 5);
  const beadLength = validateNumber(config.beadLength, "Bead length", 2, 100);
  const printSpeed = validateNumber(config.printSpeed, "Print speed", 1, 500);
  const firstLayerSpeed = validateNumber(config.firstLayerSpeed, "First layer speed", 1, 500);
  const acceleration = validateNumber(config.acceleration, "Acceleration", 0, 50000);
  const fanSpeed = validateNumber(config.fanSpeed, "Fan speed", 0, 100);
  const firstLayerFan = validateNumber(config.firstLayerFan, "First layer fan speed", 0, 100);
  const bedTemperature = validateNumber(config.bedTemperature, "Bed temperature", 0, 150);
  const hotendTemperature = validateNumber(config.hotendTemperature, "Hotend temperature", 0, 350);
  const retractDistance = validateNumber(config.retractDistance, "Retract distance", 0, 20);
  const retractSpeed = validateNumber(config.retractSpeed, "Retract speed", 1, 100);
  const unretractSpeed = validateNumber(config.unretractSpeed, "Unretract speed", 1, 100);
  const zHopHeight = validateNumber(config.zHopHeight, "Z-hop height", 0, 20);
  const maxLayerHeight = Number((nozzleHoleDiameter * 1.5).toFixed(6));
  const firstLayerHeight = validateNumber(config.firstLayerHeight, "First layer height", 0.01, maxLayerHeight);
  const baseLineWidthPercent = validateNumber(config.baseLineWidthPercent, "Base layer line width", 100, 300);
  const pressureAdvance = config.usePressureAdvance
    ? validateNumber(config.pressureAdvance, "Pressure advance", 0, 10)
    : 0;
  const bedSizeX = validateNumber(config.bedSizeX, "Bed size X", 50, 2000);
  const bedSizeY = config.bedShape === "circular"
    ? bedSizeX
    : validateNumber(config.bedSizeY, "Bed size Y", 50, 2000);
  const bedCenterX = optionalNumber(config.bedCenterX, "Bed center X") ?? (config.originAtCenter ? 0 : bedSizeX / 2);
  const bedCenterY = optionalNumber(config.bedCenterY, "Bed center Y") ?? (config.originAtCenter ? 0 : bedSizeY / 2);
  const firmware = String(config.firmware ?? "").toLowerCase();
  const bedShape = String(config.bedShape ?? "").toLowerCase();
  const angleAxis = String(config.angleAxis ?? "").trim().toUpperCase();
  const extruderName = String(config.extruderName ?? "").trim();
  const toolIndex = validateNumber(config.toolIndex, "Tool index", 0, 15);

  if (!Number.isInteger(toolIndex)) throw new Error("Tool index must be a whole number between 0 and 15.");
  if (!["klipper", "marlin", "reprap", "generic"].includes(firmware)) throw new Error("Choose Klipper, Marlin, RepRapFirmware, or Generic firmware.");
  if (!["rectangular", "circular"].includes(bedShape)) throw new Error("Choose a rectangular or circular bed.");
  if (!/^[ABC]$/.test(angleAxis)) throw new Error("Choose A (rotation about X), B (rotation about Y), or C (rotation about Z).");
  if (extruderName && !/^[A-Za-z0-9_.-]{1,64}$/.test(extruderName)) {
    throw new Error("Extruder name can contain only letters, numbers, dots, underscores, and hyphens.");
  }
  if (firmware === "klipper" && toolIndex > 0 && !extruderName) {
    throw new Error("For a non-default Klipper tool, enter its extruder name instead of a tool index.");
  }
  if (bedShape === "circular" && optionalNumber(config.bedSizeY, "Bed size Y") !== null) {
    const circularY = validateNumber(config.bedSizeY, "Circular bed diameter (bed size Y)", 50, 2000);
    if (Math.abs(circularY - bedSizeX) > EPSILON) throw new Error("For a circular bed, X and Y must both equal the bed diameter.");
  }

  const flowWidth = nozzleHoleDiameter * baseLineWidthPercent / 100;
  const flowLabels = flows.map((flow) => markerSegments(format(flow, 3), nozzleHoleDiameter));
  const layerLabels = heights.map((height) => markerSegments(format(height, 3), nozzleHoleDiameter));
  const angleLabel = markerSegments(`${format(angle, 1)}°`, nozzleHoleDiameter);
  const labelWidth = Math.max(...flowLabels.map((label) => label.width));
  const columnLabelWidth = Math.max(...layerLabels.map((label) => label.width), beadLength);
  const leftMargin = 2;
  const topMargin = 2;
  const wallSpacings = heights.map((height) => nozzleHoleDiameter - height * (1 - Math.PI / 4));
  if (wallSpacings.some((spacing) => spacing <= 0)) {
    throw new Error("Layer height leaves no positive spacing for adjacent wall lines.");
  }
  const specimenWidth = nozzleHoleDiameter + (wallCount - 1) * Math.max(...wallSpacings);
  const rowPitch = Math.max(
    Math.max(...flowLabels.map((label) => label.height)) + nozzleHoleDiameter + 2,
    specimenWidth + 3,
  );
  const columnPitch = columnLabelWidth + 2;
  const firstColumnCenter = leftMargin + labelWidth + 2 + columnPitch / 2;
  const columnCenters = heights.map((_, index) => firstColumnCenter + index * columnPitch);
  const cellStartX = columnCenters[0] - beadLength / 2;
  const cellEndX = columnCenters.at(-1) + beadLength / 2;
  const firstRowY = topMargin + angleLabel.height + 2.5;
  const rowYs = flows.map((_, index) => firstRowY + index * rowPitch);
  const plateMinX = 0.5;
  const plateMaxX = firstColumnCenter + (heights.length - 0.5) * columnPitch;
  const plateMinY = 0.5;
  const lastFlowLabel = flowLabels.at(-1);
  const plateMaxY = rowYs.at(-1) + lastFlowLabel.height / 2 + nozzleHoleDiameter + 0.5;
  const purgeLength = Math.max(plateMaxX - plateMinX, plateMaxY - plateMinY);
  const purgeRowSpacing = nozzleHoleDiameter * 2;
  const purgeX = plateMinX;
  const purgeY = plateMaxY + nozzleHoleDiameter / 2 + 4;
  const purgeMaxX = purgeX + purgeLength;
  const purgeReturnY = purgeY + purgeRowSpacing;
  const layoutMaxX = Math.max(plateMaxX, purgeMaxX + nozzleHoleDiameter / 2);
  const layoutMaxY = purgeReturnY + nozzleHoleDiameter / 2;
  const patternWidth = layoutMaxX - plateMinX;
  const patternHeight = layoutMaxY - plateMinY;
  const includedParts = "solid matrix base, labels, test lines, and purge line";

  if (bedShape === "rectangular") {
    const minX = bedCenterX - patternWidth / 2;
    const maxX = bedCenterX + patternWidth / 2;
    const minY = bedCenterY - patternHeight / 2;
    const maxY = bedCenterY + patternHeight / 2;
    const bedMinX = config.originAtCenter ? -bedSizeX / 2 : 0;
    const bedMaxX = config.originAtCenter ? bedSizeX / 2 : bedSizeX;
    const bedMinY = config.originAtCenter ? -bedSizeY / 2 : 0;
    const bedMaxY = config.originAtCenter ? bedSizeY / 2 : bedSizeY;
    if (minX < bedMinX - EPSILON || maxX > bedMaxX + EPSILON || minY < bedMinY - EPSILON || maxY > bedMaxY + EPSILON) {
      throw new Error(`Pattern including the ${includedParts} is ${format(patternWidth, 1)} × ${format(patternHeight, 1)} mm; it does not fit the ${format(bedSizeX, 1)} × ${format(bedSizeY, 1)} mm rectangular bed.`);
    }
  } else if (Math.hypot(patternWidth / 2, patternHeight / 2) > bedSizeX / 2 + EPSILON) {
    throw new Error(`Pattern including the ${includedParts} is too large to fit inside the ${format(bedSizeX, 1)} mm circular bed.`);
  }

  const offsetX = bedCenterX - (plateMinX + layoutMaxX) / 2;
  const offsetY = bedCenterY - (plateMinY + layoutMaxY) / 2;
  const xPosition = (value) => format(value + offsetX);
  const mirrorY = (value) => plateMinY + layoutMaxY - value;
  const yPosition = (value) => format(mirrorY(value) + offsetY);
  const tagHeight = heights[0];
  const labelGapClearance = Math.min(...[angleLabel, ...flowLabels, ...layerLabels].map((label) => label.gapClearance));
  const lines = [
    "; Nozzle angle calibration test matrix",
    `; Firmware profile: ${firmware}; bed: ${bedShape} ${format(bedSizeX, 1)} × ${format(bedSizeY, 1)} mm`,
    `; Pattern centered at X${format(bedCenterX)} Y${format(bedCenterY)}; origin at bed center: ${Boolean(config.originAtCenter)}`,
    "; Bed orientation: height columns increase left-to-right (+X); minimum flow is at +Y, increasing flow runs toward -Y.",
    `; Matrix: ${flows.length} flow rows × ${heights.length} layer-height columns; ${cases.length} specimens; ${layerCount} layers per specimen.`,
    `; Print order: complete each layer-height column from minimum to maximum; flow increases within each column.`,
    `; Nozzle tilt ${format(angle, 1)} degrees from vertical; rotary axis ${angleAxis} rotates about ${({ A: "X", B: "Y", C: "Z" })[angleAxis]}.`,
    `; Selected rotary axis: ${angleAxis} (rotation about ${({ A: "X", B: "Y", C: "Z" })[angleAxis]}).`,
    `; Flow labels are percentages: ${format(flows[0], 3)}% to ${format(flows.at(-1), 3)}% in ${format(numeric(config.flowStepPercent, "Flow increment"), 3)}% increments.`,
    `; Layer-height labels are millimeters: ${format(heights[0])} to ${format(heights.at(-1))} mm in ${format(numeric(config.layerHeightStep, "Layer-height increment"))} mm increments; maximum is 1.5 × nozzle-hole diameter.`,
    `; Collision-safe minimum height at this angle: ${format(clearance, 6)} mm; physical nozzle tip diameter ${format(nozzleTipDiameter)} mm.`,
    `; Nozzle outlet diameter ${format(nozzleHoleDiameter)} mm sets test-line extrusion width and Slic3r wall spacing.`,
    `; Specimen walls: ${wallCount}; Slic3r centerline spacing varies by layer height; nominal extrusion width ${format(nozzleHoleDiameter)} mm.`,
    `; One solid first-layer base connects the matrix labels and all test lines. No individual skirts are printed.`,
    `; Base height ${format(firstLayerHeight)} mm; base line width ${format(flowWidth)} mm; label layer ${format(tagHeight)} mm.`,
    `; Seven-segment labels: ${format(angleLabel.height)} mm high; minimum inter-character clearance ${format(labelGapClearance)} mm.`,
    `; Bead area: A = (w-h)h + pi(h/2)^2. E uses area * distance * flow percentage / filament area.`,
    `; Adjacent center spacing = extrusion width - layer height * (1 - pi/4); walls overlap nominally to avoid gaps.`,
    `; Travel feedrate fixed at ${TRAVEL_FEEDRATE} mm/min.`,
    `; Retract ${format(retractDistance)} mm at ${format(retractSpeed)} mm/s; Z-hop ${format(zHopHeight)} mm.`,
    `; Purge path length ${format(purgeLength)} mm per pass (${format(purgeLength * 2)} mm total), with a ${format(purgeRowSpacing)} mm return pass, printed before the base.`,
    `; Pressure advance ${config.usePressureAdvance ? `fixed at ${format(pressureAdvance)}` : "left to firmware configuration"}.`,
    "; Review firmware support, bed limits, start/end macros, and nozzle clearance before printing.",
    "G21 ; units in mm",
    "G90 ; absolute XYZ positioning",
    "M83 ; relative extrusion",
    "G92 E0",
  ];

  if (firmware === "klipper" && extruderName) lines.push(`ACTIVATE_EXTRUDER EXTRUDER=${extruderName}`);
  else if (toolIndex > 0 && ["marlin", "reprap"].includes(firmware)) lines.push(`T${toolIndex}`);

  if (config.homeAxes) lines.push("G28 ; home axes");
  if (config.heatBed) {
    lines.push(`M140 S${format(bedTemperature, 0)} ; set bed temperature`);
    lines.push(`M190 S${format(bedTemperature, 0)} ; wait for bed`);
  }
  if (config.heatHotend) {
    const toolSuffix = toolIndex > 0 && firmware !== "klipper" ? ` T${toolIndex}` : "";
    lines.push(`M104 S${format(hotendTemperature, 0)}${toolSuffix} ; set hotend temperature`);
    lines.push(`M109 S${format(hotendTemperature, 0)}${toolSuffix} ; wait for hotend`);
  }
  if (acceleration > 0) {
    if (firmware === "klipper") lines.push(`SET_VELOCITY_LIMIT ACCEL=${format(acceleration, 0)}`);
    else if (firmware === "reprap") lines.push(`M204 P${format(acceleration, 0)} T${format(acceleration, 0)}`);
    else lines.push(`M204 S${format(acceleration, 0)}`);
  }
  if (config.firmwareRetraction) {
    if (firmware === "klipper") {
      lines.push(`SET_RETRACTION RETRACT_LENGTH=${format(retractDistance)} RETRACT_SPEED=${format(retractSpeed)} UNRETRACT_SPEED=${format(unretractSpeed)}`);
    } else {
      lines.push("; Firmware retraction uses G10/G11; configure retract length and speeds in firmware.");
    }
  }
  if (config.useCustomStartGcode && config.customStartGcode.trim()) {
    lines.push("; Custom start G-code");
    lines.push(gcodeBlock(config.customStartGcode, { bedTemperature, hotendTemperature, toolIndex, extruderName }));
  }
  if (config.usePressureAdvance) {
    if (firmware === "klipper") lines.push(`SET_PRESSURE_ADVANCE ADVANCE=${format(pressureAdvance)}`);
    else if (firmware === "marlin") lines.push(`M900 K${format(pressureAdvance)}`);
    else if (firmware === "reprap") lines.push(`M572 D${toolIndex} S${format(pressureAdvance)}`);
    else lines.push("; Set the fixed pressure-advance value using the command supported by this firmware.");
  }

  const retractFeedrate = format(retractSpeed * 60, 0);
  const unretractFeedrate = format(unretractSpeed * 60, 0);
  let hasExtruded = false;
  let currentZ = 0;
  const travelTo = (x, y, z) => {
    if (hasExtruded && retractDistance > 0) {
      if (config.firmwareRetraction) lines.push("G10");
      else lines.push(`G1 E-${format(retractDistance)} F${retractFeedrate} ; retract`);
    }
    if (zHopHeight > 0) {
      const hopZ = Math.max(currentZ, z) + zHopHeight;
      lines.push(`G0 Z${format(hopZ)} F${TRAVEL_FEEDRATE} ; lift / Z-hop`);
    }
    lines.push(`G0 X${xPosition(x)} Y${yPosition(y)} F${TRAVEL_FEEDRATE}`);
    lines.push(`G0 Z${format(z)}`);
    currentZ = z;
    if (hasExtruded && retractDistance > 0) {
      if (config.firmwareRetraction) lines.push("G11");
      else lines.push(`G1 E${format(retractDistance)} F${unretractFeedrate} ; unretract`);
    }
  };
  const extrudeSegment = (x1, y1, x2, y2, z, height, width, multiplier, feedrate, tilt) => {
    lines.push(`G1 ${angleAxis}${format(tilt, 1)} F${TRAVEL_FEEDRATE}`);
    const e = extrusionPerMm(height, width, multiplier, filamentDiameter) * Math.hypot(x2 - x1, y2 - y1);
    lines.push(`G1 X${xPosition(x2)} Y${yPosition(y2)} E${format(e, 8)} F${format(feedrate * 60, 0)}`);
    hasExtruded = true;
  };
  const printSegment = (x1, y1, x2, y2, z, height, width, multiplier, feedrate, tilt) => {
    travelTo(x1, y1, z);
    extrudeSegment(x1, y1, x2, y2, z, height, width, multiplier, feedrate, tilt);
  };
  const printMarker = (tag, z, height) => {
    lines.push(`; Continuous marker strokes for ${tag.text}; travel within this label has no retract or Z-hop.`);
    tag.paths.forEach((path, index) => {
      const [start, end] = path;
      if (index === 0) travelTo(start[0] + tag.x, start[1] + tag.y, z);
      else lines.push(`G0 X${xPosition(start[0] + tag.x)} Y${yPosition(start[1] + tag.y)} F${TRAVEL_FEEDRATE} ; non-extruding move within this label`);
      extrudeSegment(
        start[0] + tag.x, start[1] + tag.y, end[0] + tag.x, end[1] + tag.y,
        z, height, nozzleHoleDiameter, 1, firstLayerSpeed, 0,
      );
    });
  };

  lines.push("");
  lines.push(`; DOUBLE-PASS PURGE | ${format(purgeLength)} mm each way at 200% flow, separate from matrix base and samples`);
  printSegment(purgeX, purgeY, purgeMaxX, purgeY, firstLayerHeight, firstLayerHeight, nozzleHoleDiameter, 2, firstLayerSpeed, 0);
  lines.push(`G0 X${xPosition(purgeMaxX)} Y${yPosition(purgeReturnY)} F${TRAVEL_FEEDRATE} ; reposition for return purge pass without extrusion`);
  extrudeSegment(purgeMaxX, purgeReturnY, purgeX, purgeReturnY, firstLayerHeight, firstLayerHeight, nozzleHoleDiameter, 2, firstLayerSpeed, 0);

  lines.push("");
  lines.push("; SOLID MATRIX BASE | one connected first layer, no per-line skirts");
  lines.push("; Base infill is one continuous snake: alternate row direction and extrude the edge connectors.");
  lines.push(fanCommand(firstLayerFan));
  const baseStartX = plateMinX + flowWidth / 2;
  const baseEndX = plateMaxX - flowWidth / 2;
  const baseSpanY = plateMaxY - plateMinY - flowWidth;
  const baseRowCount = Math.max(1, Math.ceil(baseSpanY / (flowWidth * 0.92)) + 1);
  const baseRowSpacing = baseRowCount === 1 ? 0 : baseSpanY / (baseRowCount - 1);
  let previousEndX = null;
  let previousY = null;
  for (let index = 0; index < baseRowCount; index += 1) {
    const y = plateMinY + flowWidth / 2 + index * baseRowSpacing;
    const startX = index % 2 === 0 ? baseStartX : baseEndX;
    const endX = index % 2 === 0 ? baseEndX : baseStartX;
    if (index === 0) {
      travelTo(startX, y, firstLayerHeight);
    } else {
      extrudeSegment(
        previousEndX, previousY, startX, y,
        firstLayerHeight, firstLayerHeight, flowWidth, 1, firstLayerSpeed, 0,
      );
    }
    extrudeSegment(
      startX, y, endX, y,
      firstLayerHeight, firstLayerHeight, flowWidth, 1, firstLayerSpeed, 0,
    );
    previousEndX = endX;
    previousY = y;
  }

  const tags = [
    {
      kind: "angle",
      text: `${format(angle, 1)}°`,
      ...markerSegments(`${format(angle, 1)}°`, nozzleHoleDiameter),
      x: leftMargin,
      y: topMargin,
    },
    ...heights.map((height, index) => ({
      kind: "height",
      text: format(height, 3),
      ...layerLabels[index],
      x: columnCenters[index] - layerLabels[index].width / 2,
      y: topMargin,
    })),
    ...flows.map((flow, index) => ({
      kind: "flow",
      text: format(flow, 3),
      ...flowLabels[index],
      x: leftMargin + labelWidth - flowLabels[index].width,
      y: rowYs[index] - flowLabels[index].height / 2,
    })),
  ];
  lines.push("");
  lines.push("; MATRIX LABELS | angle at upper left, heights across the top, flow percentages down the left");
  for (const tag of tags) {
    lines.push(`; ${tag.kind} label ${tag.text}${tag.kind === "flow" ? "%" : tag.kind === "height" ? " mm" : ""}`);
    printMarker(tag, firstLayerHeight + tagHeight, tagHeight);
  }

  lines.push("");
  lines.push("; TEST MATRIX | each blue line in the printed reference represents one cell specimen");
  const rowMetadata = flows.map((flowPercent, rowIndex) => ({
    flowPercent,
    multiplier: flowPercent / 100,
    y: rowYs[rowIndex],
    wallCount,
  }));
  const columnMetadata = heights.map((height, columnIndex) => ({
    height,
    xStart: columnCenters[columnIndex] - beadLength / 2,
    xEnd: columnCenters[columnIndex] + beadLength / 2,
    wallSpacing: wallSpacings[columnIndex],
  }));
  for (const column of columnMetadata) {
    for (const row of rowMetadata) {
      lines.push(`; CELL | nozzle ${format(angle, 1)} deg | layer ${format(column.height)} mm | flow ${format(row.flowPercent, 3)}% | ${wallCount} wall(s) at ${format(column.wallSpacing)} mm center spacing`);
      lines.push(fanCommand(fanSpeed));
      for (let layerIndex = 1; layerIndex <= layerCount; layerIndex += 1) {
        const z = firstLayerHeight + layerIndex * column.height;
        for (let wallIndex = 0; wallIndex < wallCount; wallIndex += 1) {
          const wallY = row.y + (wallIndex - (wallCount - 1) / 2) * column.wallSpacing;
          printSegment(
            column.xStart, wallY, column.xEnd, wallY,
            z, column.height, nozzleHoleDiameter, row.multiplier, printSpeed, angle,
          );
        }
      }
    }
  }

  if (config.useCustomEndGcode && config.customEndGcode.trim()) {
    lines.push("; Custom end G-code");
    lines.push(gcodeBlock(config.customEndGcode, { bedTemperature, hotendTemperature, toolIndex, extruderName }));
  } else {
    lines.push("; Default shutdown: turn off hotend and bed");
    lines.push("M104 S0 ; turn off hotend");
    lines.push("M140 S0 ; turn off bed");
  }
  lines.push("");
  lines.push("; End of nozzle angle calibration test matrix.");

  const shifted = (value, offset) => value + offset;
  const absoluteTags = tags.map((tag) => ({
    kind: tag.kind,
    text: tag.text,
    x: shifted(tag.x, offsetX),
    y: shifted(mirrorY(tag.y), offsetY),
    paths: tag.paths.map((path) => path.map(([x, y]) => [
      shifted(x + tag.x, offsetX),
      shifted(mirrorY(y + tag.y), offsetY),
    ])),
  }));
  const rows = rowMetadata.map((row) => ({
    y: shifted(mirrorY(row.y), offsetY),
    flowPercent: row.flowPercent,
    multiplier: row.multiplier,
    wallCount: row.wallCount,
  }));
  const columns = columnMetadata.map((column) => ({
    xStart: shifted(column.xStart, offsetX),
    xEnd: shifted(column.xEnd, offsetX),
    centerX: shifted((column.xStart + column.xEnd) / 2, offsetX),
    height: column.height,
    wallSpacing: column.wallSpacing,
  }));

  return {
    text: `${lines.join("\n")}\n`,
    rowCount: flows.length,
    columnCount: heights.length,
    totalLayerCount: 1 + cases.length * layerCount,
    caseCount: cases.length,
    angle,
    layerCount,
    wallCount,
    cases,
    preview: {
      angle,
      angleAxis,
      bounds: {
        minX: shifted(plateMinX, offsetX),
        maxX: shifted(plateMaxX, offsetX),
        minY: shifted(mirrorY(plateMaxY), offsetY),
        maxY: shifted(mirrorY(plateMinY), offsetY),
      },
      layoutBounds: {
        minX: shifted(plateMinX, offsetX),
        maxX: shifted(layoutMaxX, offsetX),
        minY: shifted(plateMinY, offsetY),
        maxY: shifted(layoutMaxY, offsetY),
      },
      rows,
      columns,
      cellStartX: shifted(cellStartX, offsetX),
      cellEndX: shifted(cellEndX, offsetX),
      baseLineWidth: flowWidth,
      beadWidth: nozzleHoleDiameter,
      nozzleTipDiameter,
      nozzleHoleDiameter,
      wallCount,
      purge: {
        xStart: shifted(purgeX, offsetX),
        xEnd: shifted(purgeMaxX, offsetX),
        y: shifted(mirrorY(purgeY), offsetY),
        returnY: shifted(mirrorY(purgeReturnY), offsetY),
        length: purgeLength,
      },
      firstLayerHeight,
      tagHeight,
      layerHeight: heights[0],
      layerCount,
      tags: absoluteTags,
      labelMetrics: {
        glyphHeight: angleLabel.height,
        characterGap: angleLabel.glyphGap,
        gapClearance: labelGapClearance,
        readable: labelGapClearance + EPSILON >= nozzleHoleDiameter / 2,
      },
    },
    bed: { shape: bedShape, sizeX: bedSizeX, sizeY: bedSizeY, centerX: bedCenterX, centerY: bedCenterY },
    dimensions: { width: patternWidth, height: patternHeight },
  };
}
