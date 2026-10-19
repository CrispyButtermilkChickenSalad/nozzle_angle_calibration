const MAX_RANGE_VALUES = 100;
const MAX_TEST_ROWS = 500;
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
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number.`);
  return parsed;
}

function valueRange(startValue, endValue, stepValue, name, minimum, maximum) {
  const start = numeric(startValue, `${name} start`);
  const end = numeric(endValue, `${name} end`);
  const step = numeric(stepValue, `${name} step`);
  if (start < minimum || start > maximum || end < minimum || end > maximum) {
    throw new Error(`${name} values must be between ${minimum} and ${maximum}.`);
  }
  if (step <= 0) throw new Error(`${name} step must be greater than zero.`);
  if (end < start) throw new Error(`${name} end must be greater than or equal to its start.`);

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

function createCases(config) {
  const angles = valueRange(config.angleStart, config.angleEnd, config.angleStep, "Angle", 0, 89);
  const heights = valueRange(config.layerHeightStart, config.layerHeightEnd, config.layerHeightStep, "Layer height", 0.01, 10);
  const widths = valueRange(config.lineWidthStart, config.lineWidthEnd, config.lineWidthStep, "Line width", 0.01, 20);
  const multipliers = valueRange(config.multiplierStart, config.multiplierEnd, config.multiplierStep, "Extrusion multiplier", 0.01, 5);

  for (const height of heights) {
    for (const width of widths) {
      if (width < height) {
        throw new Error(`Line width (${format(width)} mm) must be at least the layer height (${format(height)} mm).`);
      }
    }
  }

  const cases = [];
  for (const height of heights) {
    for (const width of widths) {
      for (const multiplier of multipliers) {
        cases.push({ height, width, multiplier });
      }
    }
  }
  const rowCount = cases.length * angles.length;
  if (rowCount > MAX_TEST_ROWS) {
    throw new Error(`This combination creates ${rowCount} rows; reduce the ranges to ${MAX_TEST_ROWS} rows or fewer.`);
  }
  return { angles, cases };
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

const LETTER_STROKES = {
  A: [["leftBottom", "centerTop"], ["centerTop", "rightBottom"], ["leftMiddle", "rightMiddle"]],
  H: [["leftTop", "leftBottom"], ["rightTop", "rightBottom"], ["leftMiddle", "rightMiddle"]],
  M: [["leftBottom", "leftTop"], ["leftTop", "centerTop"], ["centerTop", "rightTop"], ["rightTop", "rightBottom"]],
  W: [["leftTop", "leftBottom"], ["leftBottom", "centerMiddle"], ["centerMiddle", "rightBottom"], ["rightBottom", "rightTop"]],
};

function markerSegments(text, x, y, scale) {
  const paths = [];
  const width = 1.2 * scale;
  const height = 2 * scale;
  const horizontal = (px, py) => [[px, py], [px + width, py]];
  const vertical = (px, py) => [[px, py], [px, py + height / 2]];
  const pointsAt = (px) => ({
    leftTop: [px, y],
    leftMiddle: [px, y + height / 2],
    leftBottom: [px, y + height],
    centerTop: [px + width / 2, y],
    centerMiddle: [px + width / 2, y + height / 2],
    centerBottom: [px + width / 2, y + height],
    rightTop: [px + width, y],
    rightMiddle: [px + width, y + height / 2],
    rightBottom: [px + width, y + height],
  });
  let cursor = x;

  for (const character of text) {
    if (character === " ") {
      cursor += 0.8 * scale;
      continue;
    }
    if (character === ".") {
      paths.push([[cursor + 0.12 * scale, y + height], [cursor + 0.24 * scale, y + height]]);
      cursor += 0.55 * scale;
      continue;
    }
    if (LETTER_STROKES[character]) {
      const points = pointsAt(cursor);
      for (const [from, to] of LETTER_STROKES[character]) {
        paths.push([points[from], points[to]]);
      }
      cursor += width + 0.45 * scale;
      continue;
    }
    const definitions = {
      a: horizontal(cursor, y),
      b: vertical(cursor + width, y),
      c: vertical(cursor + width, y + height / 2),
      d: horizontal(cursor, y + height),
      e: vertical(cursor, y + height / 2),
      f: vertical(cursor, y),
      g: horizontal(cursor, y + height / 2),
    };
    for (const segment of SEGMENTS[character] ?? []) paths.push(definitions[segment]);
    cursor += width + 0.45 * scale;
  }
  return { paths, width: cursor - x };
}

function extrusionPerMm(height, width, multiplier, filamentDiameter) {
  const beadCrossSection = layerArea(height, width);
  const filamentCrossSection = Math.PI * (filamentDiameter / 2) ** 2;
  return beadCrossSection * multiplier / filamentCrossSection;
}

export function generateGcode(config) {
  const { angles, cases } = createCases(config);
  const nozzleDiameter = numeric(config.nozzleDiameter, "Nozzle tip diameter");
  const filamentDiameter = numeric(config.filamentDiameter, "Filament diameter");
  const beadLength = numeric(config.beadLength, "Bead length");
  const travelFeedrate = numeric(config.travelFeedrate, "Travel feedrate");
  const printFeedrate = numeric(config.printFeedrate, "Print feedrate");
  const angleAxis = String(config.angleAxis ?? "").trim().toUpperCase();

  if (nozzleDiameter < 0.05 || nozzleDiameter > 5) throw new Error("Nozzle tip diameter must be between 0.05 and 5 mm.");
  if (filamentDiameter < 0.5 || filamentDiameter > 5) throw new Error("Filament diameter must be between 0.5 and 5 mm.");
  if (beadLength < 2 || beadLength > 100) throw new Error("Bead length must be between 2 and 100 mm.");
  if (travelFeedrate < 100 || travelFeedrate > 20000) throw new Error("Travel feedrate must be between 100 and 20000 mm/min.");
  if (printFeedrate < 10 || printFeedrate > 10000) throw new Error("Print feedrate must be between 10 and 10000 mm/min.");
  if (!/^[A-DF-Z]$/.test(angleAxis)) throw new Error("Angle axis must be one rotary axis letter from A, B, C, D or F–Z.");

  for (const angle of angles) {
    const clearance = minimumLayerHeight(nozzleDiameter, angle);
    for (const testCase of cases) {
      if (testCase.height + EPSILON < clearance) {
        throw new Error(`Layer height ${format(testCase.height)} mm collides at ${format(angle, 1)}° tilt: minimum safe height is ${format(clearance)} mm for a ${format(nozzleDiameter)} mm nozzle tip.`);
      }
    }
  }

  const rowCount = cases.length * angles.length;
  const rowPitch = Math.max(6, ...cases.map((testCase) => testCase.width + 2));
  const startX = 1;
  const startY = 1;
  const labelScale = 0.8;
  const testLabel = (testCase, caseIndex) => `${String(caseIndex + 1).padStart(3, "0")} H${format(testCase.height, 6)} W${format(testCase.width, 6)} M${format(testCase.multiplier, 6)}`;
  const markerTextWidth = Math.max(...cases.map((testCase, index) => markerSegments(testLabel(testCase, index), 0, 0, labelScale).width));
  const angleTextWidth = Math.max(...angles.map((angle) => markerSegments(`A${format(angle, 1)}`, 0, 0, labelScale).width));
  const trackStartX = startX + markerTextWidth + angleTextWidth + 3;
  const trackEndX = trackStartX + beadLength;
  const clearanceZ = Math.max(...cases.map((testCase) => testCase.height)) + 2;
  const lines = [
    "; Nozzle Angle Calibration — generated test pattern",
    "; Angle is measured from the surface normal; the rotary axis must be configured for degrees.",
    "; Single-layer rows are placed at Z = the row's tested layer height.",
    `; Nozzle tip diameter: ${format(nozzleDiameter)} mm`,
    "; Clearance model: h_min = sqrt(r^2 - (r*cos(theta))^2) = r*sin(theta), for a circular exit rim about its centroid.",
    "; Bead area: A = (w-h)h + pi(h/2)^2. E uses area * distance * multiplier / filament area.",
    "; Physical row labels are the three-digit test ID and the angle; this comment index maps IDs to settings.",
    "; No homing, heating, machine start/end code, or rotary-axis limits are included.",
    `; Rotary axis: ${angleAxis}; filament diameter: ${format(filamentDiameter)} mm; bead length: ${format(beadLength)} mm`,
    "G21 ; units in mm",
    "G90 ; absolute XYZ positioning",
    "M83 ; relative extrusion",
    "G92 E0",
  ];
  let rowIndex = 0;

  cases.forEach((testCase, caseIndex) => {
    const testId = String(caseIndex + 1).padStart(3, "0");
    const ePerMm = extrusionPerMm(testCase.height, testCase.width, testCase.multiplier, filamentDiameter);
    for (const angle of angles) {
      const y = startY + rowIndex * rowPitch;
      const angleLabel = format(angle, 1);
      const label = markerSegments(testLabel(testCase, caseIndex), startX, y, labelScale);
      const angleMarker = markerSegments(`A${angleLabel}`, startX + markerTextWidth + 0.8, y, labelScale);
      lines.push("");
      lines.push(`; ROW ${testId} | angle ${angleLabel} deg | layer height ${format(testCase.height, 6)} mm | line width ${format(testCase.width, 6)} mm | extrusion multiplier ${format(testCase.multiplier, 6)}`);
      lines.push(`; Calculated min layer height at this angle: ${format(minimumLayerHeight(nozzleDiameter, angle))} mm`);
      lines.push(`G0 Z${format(clearanceZ)} F${format(travelFeedrate, 0)}`);
      lines.push(`G0 X${format(startX)} Y${format(y)} F${format(travelFeedrate, 0)}`);
      lines.push(`G0 Z${format(testCase.height)}`);
      lines.push(`G1 ${angleAxis}0 F${format(travelFeedrate, 0)} ; print physical row and angle markers upright`);
      const printMarker = (marker) => {
        for (const path of marker.paths) {
          const markerE = format(Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) * ePerMm, 8);
          lines.push(`G0 Z${format(clearanceZ)} F${format(travelFeedrate, 0)}`);
          lines.push(`G0 X${format(path[0][0])} Y${format(path[0][1])} F${format(travelFeedrate, 0)}`);
          lines.push(`G0 Z${format(testCase.height)}`);
          lines.push(`G1 ${angleAxis}0 F${format(travelFeedrate, 0)}`);
          lines.push(`G1 X${format(path[1][0])} Y${format(path[1][1])} E${markerE} F${format(printFeedrate, 0)}`);
        }
      };
      printMarker(label);
      printMarker(angleMarker);
      lines.push(`G0 Z${format(clearanceZ)} F${format(travelFeedrate, 0)}`);
      lines.push(`G0 X${format(trackStartX)} Y${format(y)} F${format(travelFeedrate, 0)}`);
      lines.push(`G0 Z${format(testCase.height)}`);
      lines.push(`G1 ${angleAxis}${format(angle, 1)} F${format(travelFeedrate, 0)}`);
      lines.push(`G1 X${format(trackEndX)} Y${format(y)} E${format(beadLength * ePerMm, 8)} F${format(printFeedrate, 0)} ; angle ${angleLabel} deg`);
      lines.push(`G0 Z${format(clearanceZ)} F${format(travelFeedrate, 0)}`);
      rowIndex += 1;
    }
  });

  lines.push("");
  lines.push("; End of test pattern. Add machine-specific park and shutdown commands as required.");
  return {
    text: `${lines.join("\n")}\n`,
    rowCount,
    caseCount: cases.length,
    angles,
    cases,
    dimensions: {
      width: trackEndX + 1,
      height: startY + Math.max(0, rowCount - 1) * rowPitch + 1,
    },
  };
}
