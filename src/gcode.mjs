const MAX_RANGE_VALUES = 100;
const MAX_TEST_CELLS = 100;
const MAX_PRINTED_LAYERS = 500;
const EPSILON = 1e-9;

export function layerArea(layerHeight, lineWidth) {
  return (lineWidth - layerHeight) * layerHeight + Math.PI * (layerHeight / 2) ** 2;
}

export function minimumLayerHeight(nozzleDiameter, tiltDegrees) {
  if (!Number.isFinite(nozzleDiameter) || nozzleDiameter <= 0) {
    throw new Error("Nozzle tip diameter must be greater than zero.");
  }
  if (!Number.isFinite(tiltDegrees) || tiltDegrees < 0 || tiltDegrees >= 90) {
    throw new Error("Nozzle tilt must be at least 0° and less than 90°.");
  }
  const radius = nozzleDiameter / 2;
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

function createCases(config, clearance, nozzleDiameter) {
  const angle = numeric(config.angleDegrees, "Nozzle angle");
  const heights = valueRange(
    config.layerHeightStart,
    config.layerHeightEnd,
    config.layerHeightStep,
    "Layer height",
    0.01,
    nozzleDiameter,
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
  if (!Number.isInteger(layerCount) || layerCount < 1 || layerCount > 20) {
    throw new Error("Stacked layer count must be a whole number between 1 and 20.");
  }

  const cellCount = flows.length * heights.length;
  if (cellCount > MAX_TEST_CELLS) {
    throw new Error(`This combination creates ${cellCount} matrix cells; reduce the flow or layer-height range to ${MAX_TEST_CELLS} cells or fewer.`);
  }
  if (cellCount * layerCount > MAX_PRINTED_LAYERS) {
    throw new Error(`This combination creates ${cellCount * layerCount} test layers; reduce the matrix or stacked layer count to ${MAX_PRINTED_LAYERS} layers or fewer.`);
  }

  const cases = flows.flatMap((flowPercent) => heights.map((height) => ({
    height,
    width: nozzleDiameter,
    flowPercent,
    multiplier: flowPercent / 100,
  })));
  return { angle, cases, flows, heights, layerCount };
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

function markerSegments(text, scale = 0.8) {
  const paths = [];
  const width = 1.2 * scale;
  const height = 2 * scale;
  let cursor = 0;
  for (const character of text) {
    if (character === ".") {
      paths.push([[cursor + 0.12 * scale, height], [cursor + 0.24 * scale, height]]);
      cursor += 0.55 * scale;
      continue;
    }
    if (character === "°") {
      const diameter = 0.48 * scale;
      const top = -0.12 * scale;
      const left = cursor + 0.08 * scale;
      paths.push([[left, top], [left + diameter, top]]);
      paths.push([[left + diameter, top], [left + diameter, top + diameter]]);
      paths.push([[left + diameter, top + diameter], [left, top + diameter]]);
      paths.push([[left, top + diameter], [left, top]]);
      cursor += 0.8 * scale;
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
    cursor += width + 0.45 * scale;
  }
  return { paths, width: Math.max(0, cursor - 0.45 * scale), height };
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
  const nozzleDiameter = validateNumber(config.nozzleDiameter, "Nozzle tip diameter", 0.05, 5);
  const clearance = minimumLayerHeight(nozzleDiameter, angle);
  const { cases, flows, heights, layerCount } = createCases(config, clearance, nozzleDiameter);
  const filamentDiameter = validateNumber(config.filamentDiameter, "Filament diameter", 0.5, 5);
  const beadLength = validateNumber(config.beadLength, "Bead length", 2, 100);
  const travelFeedrate = validateNumber(config.travelFeedrate, "Travel feedrate", 100, 20000);
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
  const firstLayerHeight = validateNumber(config.firstLayerHeight, "First layer height", 0.01, 10);
  const baseLineWidthPercent = validateNumber(config.baseLineWidthPercent, "Base layer line width", 100, 300);
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
  if (firstLayerHeight > nozzleDiameter) throw new Error("First layer height cannot exceed nozzle tip diameter.");
  if (bedShape === "circular" && optionalNumber(config.bedSizeY, "Bed size Y") !== null) {
    const circularY = validateNumber(config.bedSizeY, "Circular bed diameter (bed size Y)", 50, 2000);
    if (Math.abs(circularY - bedSizeX) > EPSILON) throw new Error("For a circular bed, X and Y must both equal the bed diameter.");
  }

  const flowWidth = nozzleDiameter * baseLineWidthPercent / 100;
  const firstHeightLabel = markerSegments(format(heights[0], 3));
  const lastHeightLabel = markerSegments(format(heights.at(-1), 3));
  const flowLabels = flows.map((flow) => markerSegments(format(flow, 3)));
  const layerLabels = heights.map((height) => markerSegments(format(height, 3)));
  const angleLabel = markerSegments(`${format(angle, 1)}°`);
  const labelWidth = Math.max(...flowLabels.map((label) => label.width));
  const columnLabelWidth = Math.max(...layerLabels.map((label) => label.width), beadLength);
  const leftMargin = 2;
  const topMargin = 2;
  const rowPitch = Math.max(3.2, nozzleDiameter + 1.5);
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
  const plateMaxY = rowYs.at(-1) + 1.7;
  const patternWidth = plateMaxX - plateMinX;
  const patternHeight = plateMaxY - plateMinY;
  const includedParts = "solid matrix base, labels, and test lines";

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

  const offsetX = bedCenterX - (plateMinX + plateMaxX) / 2;
  const offsetY = bedCenterY - (plateMinY + plateMaxY) / 2;
  const xPosition = (value) => format(value + offsetX);
  const yPosition = (value) => format(value + offsetY);
  const tagHeight = heights[0];
  const maximumHeight = heights.at(-1);
  const lastLayerZ = firstLayerHeight + layerCount * maximumHeight;
  const clearanceZ = lastLayerZ + Math.max(nozzleDiameter, 1) + zHopHeight;
  const lines = [
    "; Nozzle angle calibration test matrix",
    `; Firmware profile: ${firmware}; bed: ${bedShape} ${format(bedSizeX, 1)} × ${format(bedSizeY, 1)} mm`,
    `; Pattern centered at X${format(bedCenterX)} Y${format(bedCenterY)}; origin at bed center: ${Boolean(config.originAtCenter)}`,
    `; Matrix: ${flows.length} flow rows × ${heights.length} layer-height columns; ${cases.length} test lines; ${layerCount} layers per cell.`,
    `; Nozzle tilt ${format(angle, 1)} degrees from vertical; rotary axis ${angleAxis} rotates about ${({ A: "X", B: "Y", C: "Z" })[angleAxis]}.`,
    `; Selected rotary axis: ${angleAxis} (rotation about ${({ A: "X", B: "Y", C: "Z" })[angleAxis]}).`,
    `; Flow labels are percentages: ${format(flows[0], 3)}% to ${format(flows.at(-1), 3)}% in ${format(numeric(config.flowStepPercent, "Flow increment"), 3)}% increments.`,
    `; Layer-height labels are millimeters: ${format(heights[0])} to ${format(heights.at(-1))} mm in ${format(numeric(config.layerHeightStep, "Layer-height increment"))} mm increments.`,
    `; Collision-safe minimum height at this angle: ${format(clearance, 6)} mm; nozzle tip diameter ${format(nozzleDiameter)} mm.`,
    `; One solid first-layer base connects the matrix labels and all test lines. No individual skirts are printed.`,
    `; Base height ${format(firstLayerHeight)} mm; base line width ${format(flowWidth)} mm; label layer ${format(tagHeight)} mm.`,
    `; Bead area: A = (w-h)h + pi(h/2)^2. E uses area * distance * flow percentage / filament area.`,
    `; Retract ${format(retractDistance)} mm at ${format(retractSpeed)} mm/s; Z-hop ${format(zHopHeight)} mm.`,
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

  const retractFeedrate = format(retractSpeed * 60, 0);
  const unretractFeedrate = format(unretractSpeed * 60, 0);
  let hasExtruded = false;
  const travelTo = (x, y, z) => {
    if (hasExtruded && retractDistance > 0) {
      if (config.firmwareRetraction) lines.push("G10");
      else lines.push(`G1 E-${format(retractDistance)} F${retractFeedrate} ; retract`);
    }
    lines.push(`G0 Z${format(clearanceZ)} F${format(travelFeedrate, 0)} ; lift / Z-hop`);
    lines.push(`G0 X${xPosition(x)} Y${yPosition(y)} F${format(travelFeedrate, 0)}`);
    lines.push(`G0 Z${format(z)}`);
    if (hasExtruded && retractDistance > 0) {
      if (config.firmwareRetraction) lines.push("G11");
      else lines.push(`G1 E${format(retractDistance)} F${unretractFeedrate} ; unretract`);
    }
  };
  const printSegment = (x1, y1, x2, y2, z, height, width, multiplier, feedrate, tilt) => {
    travelTo(x1, y1, z);
    lines.push(`G1 ${angleAxis}${format(tilt, 1)} F${format(travelFeedrate, 0)}`);
    const e = extrusionPerMm(height, width, multiplier, filamentDiameter) * Math.hypot(x2 - x1, y2 - y1);
    lines.push(`G1 X${xPosition(x2)} Y${yPosition(y2)} E${format(e, 8)} F${format(feedrate * 60, 0)}`);
    hasExtruded = true;
  };
  const printMarker = (tag, z, height) => {
    for (const path of tag.paths) {
      printSegment(
        path[0][0], path[0][1], path[1][0], path[1][1],
        z, height, nozzleDiameter, 1, firstLayerSpeed, 0,
      );
    }
  };

  lines.push("");
  lines.push("; SOLID MATRIX BASE | one connected first layer, no per-line skirts");
  lines.push(fanCommand(firstLayerFan));
  const baseStartX = plateMinX + flowWidth / 2;
  const baseEndX = plateMaxX - flowWidth / 2;
  const baseSpanY = plateMaxY - plateMinY - flowWidth;
  const baseRowCount = Math.max(1, Math.ceil(baseSpanY / (flowWidth * 0.92)) + 1);
  const baseRowSpacing = baseRowCount === 1 ? 0 : baseSpanY / (baseRowCount - 1);
  for (let index = 0; index < baseRowCount; index += 1) {
    const y = plateMinY + flowWidth / 2 + index * baseRowSpacing;
    printSegment(
      baseStartX, y, baseEndX, y,
      firstLayerHeight, firstLayerHeight, flowWidth, 1, firstLayerSpeed, 0,
    );
  }

  const tags = [
    {
      kind: "angle",
      text: `${format(angle, 1)}°`,
      ...markerSegments(`${format(angle, 1)}°`),
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
      x: leftMargin,
      y: rowYs[index] - flowLabels[index].height / 2,
    })),
  ];
  lines.push("");
  lines.push("; MATRIX LABELS | angle at upper left, heights across the top, flow percentages down the left");
  for (const tag of tags) {
    lines.push(`; ${tag.kind} label ${tag.text}${tag.kind === "flow" ? "%" : tag.kind === "height" ? " mm" : ""}`);
    printMarker({
      paths: tag.paths.map((path) => path.map(([x, y]) => [x + tag.x, y + tag.y])),
    }, firstLayerHeight + tagHeight, tagHeight);
  }

  lines.push("");
  lines.push("; TEST MATRIX | each blue line in the printed reference represents one cell specimen");
  const rowMetadata = flows.map((flowPercent, rowIndex) => ({
    flowPercent,
    multiplier: flowPercent / 100,
    y: rowYs[rowIndex],
  }));
  const columnMetadata = heights.map((height, columnIndex) => ({
    height,
    xStart: columnCenters[columnIndex] - beadLength / 2,
    xEnd: columnCenters[columnIndex] + beadLength / 2,
  }));
  for (const row of rowMetadata) {
    for (const column of columnMetadata) {
      lines.push(`; CELL | nozzle ${format(angle, 1)} deg | layer ${format(column.height)} mm | flow ${format(row.flowPercent, 3)}%`);
      lines.push(fanCommand(fanSpeed));
      for (let layerIndex = 1; layerIndex <= layerCount; layerIndex += 1) {
        const z = firstLayerHeight + layerIndex * column.height;
        printSegment(
          column.xStart, row.y, column.xEnd, row.y,
          z, column.height, nozzleDiameter, row.multiplier, printSpeed, angle,
        );
      }
    }
  }

  if (config.useCustomEndGcode && config.customEndGcode.trim()) {
    lines.push("; Custom end G-code");
    lines.push(gcodeBlock(config.customEndGcode, { bedTemperature, hotendTemperature, toolIndex, extruderName }));
  }
  lines.push("");
  lines.push("; End of nozzle angle calibration test matrix. Add machine-specific park and shutdown commands as required.");

  const shifted = (value, offset) => value + offset;
  const absoluteTags = tags.map((tag) => ({
    kind: tag.kind,
    text: tag.text,
    x: shifted(tag.x, offsetX),
    y: shifted(tag.y, offsetY),
    paths: tag.paths.map((path) => path.map(([x, y]) => [shifted(x + tag.x, offsetX), shifted(y + tag.y, offsetY)])),
  }));
  const rows = rowMetadata.map((row) => ({
    y: shifted(row.y, offsetY),
    flowPercent: row.flowPercent,
    multiplier: row.multiplier,
  }));
  const columns = columnMetadata.map((column) => ({
    xStart: shifted(column.xStart, offsetX),
    xEnd: shifted(column.xEnd, offsetX),
    centerX: shifted((column.xStart + column.xEnd) / 2, offsetX),
    height: column.height,
  }));

  return {
    text: `${lines.join("\n")}\n`,
    rowCount: flows.length,
    columnCount: heights.length,
    totalLayerCount: 1 + cases.length * layerCount,
    caseCount: cases.length,
    angle,
    layerCount,
    cases,
    preview: {
      angle,
      angleAxis,
      bounds: {
        minX: shifted(plateMinX, offsetX),
        maxX: shifted(plateMaxX, offsetX),
        minY: shifted(plateMinY, offsetY),
        maxY: shifted(plateMaxY, offsetY),
      },
      rows,
      columns,
      cellStartX: shifted(cellStartX, offsetX),
      cellEndX: shifted(cellEndX, offsetX),
      baseLineWidth: flowWidth,
      beadWidth: nozzleDiameter,
      firstLayerHeight,
      layerHeight: heights[0],
      layerCount,
      tags: absoluteTags,
    },
    bed: { shape: bedShape, sizeX: bedSizeX, sizeY: bedSizeY, centerX: bedCenterX, centerY: bedCenterY },
    dimensions: { width: patternWidth, height: patternHeight },
  };
}
