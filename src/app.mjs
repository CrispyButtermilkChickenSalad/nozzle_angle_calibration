import { generateGcode, minimumLayerHeight } from "./gcode.mjs";
import { createScenePreview } from "./preview.mjs";

const form = document.querySelector("#calibration-form");
const rowCount = document.querySelector("#row-count");
const statusBadge = document.querySelector("#status-badge");
const errorMessage = document.querySelector("#form-error");
const downloadButton = document.querySelector("#download-button");
const outputName = document.querySelector("#output-name");
const themeToggle = document.querySelector("#theme-toggle");
let generated = null;
const scenePreview = createScenePreview(document.querySelector("#preview-scene"));

const fields = [
  "angleDegrees", "nozzleOrientation", "layerHeightStart", "layerHeightEnd", "layerHeightStep",
  "layerCount", "nozzleTipDiameter", "nozzleHoleDiameter", "threeWallSpecimens",
  "flowStartPercent", "flowEndPercent", "flowStepPercent",
  "firmware", "bedShape", "filamentDiameter", "angleAxis",
  "bedSizeX", "bedSizeY", "originAtCenter", "bedCenterX", "bedCenterY",
  "extruderName", "toolIndex", "beadLength",
  "retractDistance", "retractSpeed", "unretractSpeed", "zHopHeight", "firmwareRetraction",
  "firstLayerHeight", "firstLayerSpeed", "firstLayerFan", "baseLineWidthPercent",
  "pressureAdvance", "usePressureAdvance",
  "printSpeed", "acceleration", "fanSpeed",
  "hotendTemperature", "bedTemperature", "homeAxes", "heatBed",
  "heatHotend", "useCustomStartGcode", "customStartGcode", "useCustomEndGcode",
  "customEndGcode",
];

function readConfig() {
  const config = {};
  for (const name of fields) {
    const element = form.elements.namedItem(name);
    if (element.type === "checkbox") config[name] = element.checked;
    else if (element.type === "number") config[name] = element.value === "" ? null : Number(element.value);
    else config[name] = element.value;
  }
  if (config.bedShape === "circular") config.bedSizeY = config.bedSizeX;
  return config;
}

function renderPreview(result) {
  scenePreview.update(result.preview);
  const spacingStatus = result.preview.labelMetrics.readable ? "legibility spacing passes" : "legibility spacing is tight";
  document.querySelector("#preview-help").textContent =
    `${result.preview.orientationLabel}; the matrix is rotated ${result.preview.rotationDegrees}° for rotary axis ${result.preview.angleAxis}. Labels are ${result.preview.labelMetrics.glyphHeight.toFixed(1)} mm high with ${result.preview.labelMetrics.gapClearance.toFixed(2)} mm inter-character clearance (${spacingStatus}). Drag to orbit, scroll to zoom, use arrows and +/-; press 0 to reset.`;
  rowCount.textContent = `${result.rowCount} × ${result.columnCount} MATRIX`;
  const toolbar = document.querySelector("#layout-summary");
  toolbar.textContent = `${result.bed.shape.toUpperCase()} BED · ${result.preview.orientationLabel.toUpperCase()} · ${result.rowCount} FLOW ROWS × ${result.columnCount} HEIGHT COLUMNS · ${result.wallCount} WALL${result.wallCount === 1 ? "" : "S"} PER SPECIMEN · ${result.preview.purge.length.toFixed(1)} MM DOUBLE-PASS PURGE · ${result.dimensions.width.toFixed(1)} × ${result.dimensions.height.toFixed(1)} MM · CENTERED AT ${result.bed.centerX.toFixed(1)}, ${result.bed.centerY.toFixed(1)}`;
  document.querySelector("#preview-code").textContent = result.text;
  statusBadge.textContent = "PATTERN READY";
  statusBadge.classList.add("is-ready");
}

const bedShape = form.elements.namedItem("bedShape");
const angleAxis = form.elements.namedItem("angleAxis");
const bedY = form.elements.namedItem("bedSizeY");
const bedYLabel = bedY.closest("label");
const orientationHelp = document.querySelector("#orientation-help");
const layerHeightStart = form.elements.namedItem("layerHeightStart");
const layerHeightEnd = form.elements.namedItem("layerHeightEnd");
const firstLayerHeight = form.elements.namedItem("firstLayerHeight");
const nozzleTipDiameter = form.elements.namedItem("nozzleTipDiameter");
const nozzleHoleDiameter = form.elements.namedItem("nozzleHoleDiameter");
const customStart = form.elements.namedItem("customStartGcode");
const customEnd = form.elements.namedItem("customEndGcode");
const pressureAdvance = form.elements.namedItem("pressureAdvance");
const pressureAdvanceLabel = pressureAdvance.closest("label");

function updateHeightConstraints() {
  const tipDiameter = Number(nozzleTipDiameter.value);
  const holeDiameter = Number(nozzleHoleDiameter.value);
  const angle = Number(form.elements.namedItem("angleDegrees").value);
  const helper = document.querySelector("#height-clearance-help");
  try {
    const minimum = minimumLayerHeight(tipDiameter, angle);
    const maximum = Number((holeDiameter * 1.5).toFixed(6));
    const safeMinimum = Math.max(0.01, minimum);
    const start = Number(layerHeightStart.value);
    const end = Number(layerHeightEnd.value);
    layerHeightStart.max = String(maximum);
    layerHeightEnd.max = String(maximum);
    firstLayerHeight.max = String(maximum);
    layerHeightStart.setCustomValidity(start < safeMinimum ? `At ${angle}° tilt, layer height must be at least ${minimum.toFixed(3)} mm.` : "");
    layerHeightEnd.setCustomValidity(end < safeMinimum ? `At ${angle}° tilt, layer height must be at least ${minimum.toFixed(3)} mm.` : "");
    firstLayerHeight.setCustomValidity(Number(firstLayerHeight.value) > maximum ? `Base height cannot exceed 1.5 × nozzle-hole diameter (${maximum.toFixed(3)} mm).` : "");
    helper.textContent = `Collision-safe minimum at ${angle}°: ${minimum.toFixed(6)} mm from the ${tipDiameter.toFixed(2)} mm physical tip. Maximum layer height: ${maximum.toFixed(2)} mm (1.5 × ${holeDiameter.toFixed(2)} mm nozzle hole).`;
  } catch {
    layerHeightStart.setCustomValidity("");
    layerHeightEnd.setCustomValidity("");
    firstLayerHeight.setCustomValidity("");
    helper.textContent = "Enter valid nozzle-tip and nozzle-hole diameters and a tilt to calculate safe layer-height limits.";
  }
}

function updateConditionalFields() {
  const circular = bedShape.value === "circular";
  bedY.disabled = circular;
  bedYLabel.classList.toggle("is-disabled", circular);
  orientationHelp.textContent = `Trailing edge tilts away from the deposited bead for simpler printing and fewer collisions. Leading edge tilts toward the bead for complex geometry and acute angles, but can affect print quality and mechanical performance. Adjacent tilts 90° to the bead for feature clearance. Hybrid options place the matrix halfway between the corresponding edge and adjacent orientations. The complete matrix rotates to align with the selected firmware rotary axis. Verify axis direction and orientation on your printer before printing.${angleAxis.value === "C" ? " C rotates about Z and cannot physically tilt a nozzle; use A or B for a real tilt axis." : ""}`;
  form.elements.namedItem("customStartGcode").disabled = !form.elements.namedItem("useCustomStartGcode").checked;
  form.elements.namedItem("customEndGcode").disabled = !form.elements.namedItem("useCustomEndGcode").checked;
  customStart.closest(".textarea-label").classList.toggle("is-disabled", customStart.disabled);
  customEnd.closest(".textarea-label").classList.toggle("is-disabled", customEnd.disabled);
  pressureAdvance.disabled = !form.elements.namedItem("usePressureAdvance").checked;
  pressureAdvanceLabel.classList.toggle("is-disabled", pressureAdvance.disabled);
  updateHeightConstraints();
}

form.addEventListener("change", updateConditionalFields);
updateConditionalFields();

themeToggle.addEventListener("click", () => {
  const dark = document.body.dataset.theme !== "dark";
  document.body.dataset.theme = dark ? "dark" : "light";
  themeToggle.textContent = dark ? "Use light mode" : "Use dark mode";
  themeToggle.setAttribute("aria-pressed", String(dark));
  scenePreview.refresh();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  errorMessage.textContent = "";
  try {
    generated = generateGcode(readConfig());
    renderPreview(generated);
    downloadButton.disabled = false;
    outputName.textContent = "angle-calibration-matrix.gcode";
  } catch (error) {
    generated = null;
    downloadButton.disabled = true;
    statusBadge.textContent = "CHECK SETUP";
    statusBadge.classList.remove("is-ready");
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
});

downloadButton.addEventListener("click", () => {
  if (!generated) return;
  const blob = new Blob([generated.text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "angle-calibration-matrix.gcode";
  link.click();
  URL.revokeObjectURL(url);
});

for (const fieldName of fields) {
  const element = form.elements.namedItem(fieldName);
  const invalidateGenerated = () => {
    generated = null;
    downloadButton.disabled = true;
    statusBadge.textContent = "REGENERATE";
    statusBadge.classList.remove("is-ready");
    errorMessage.hidden = true;
    errorMessage.textContent = "";
    updateHeightConstraints();
  };
  element.addEventListener("input", invalidateGenerated);
  element.addEventListener("change", invalidateGenerated);
}
