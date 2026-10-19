import { generateGcode, minimumLayerHeight } from "./gcode.mjs";
import { createScenePreview } from "./preview.mjs";

const form = document.querySelector("#calibration-form");
const rowCount = document.querySelector("#row-count");
const statusBadge = document.querySelector("#status-badge");
const errorMessage = document.querySelector("#form-error");
const downloadButton = document.querySelector("#download-button");
const outputName = document.querySelector("#output-name");
let generated = null;
const scenePreview = createScenePreview(document.querySelector("#preview-scene"));

const fields = [
  "angleDegrees", "layerHeightStart", "layerHeightEnd", "layerHeightStep",
  "layerCount", "nozzleDiameter",
  "flowStartPercent", "flowEndPercent", "flowStepPercent",
  "firmware", "bedShape", "filamentDiameter", "angleAxis",
  "bedSizeX", "bedSizeY", "originAtCenter", "bedCenterX", "bedCenterY",
  "extruderName", "toolIndex", "beadLength", "travelFeedrate",
  "retractDistance", "retractSpeed", "unretractSpeed", "zHopHeight", "firmwareRetraction",
  "firstLayerHeight", "firstLayerSpeed", "firstLayerFan", "baseLineWidthPercent",
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
  document.querySelector("#preview-help").textContent =
    "Matrix rows are flow percentages and columns are layer heights. Drag to orbit, scroll to zoom, use arrows and +/-; press 0 to reset.";
  rowCount.textContent = `${result.rowCount} × ${result.columnCount} MATRIX`;
  const toolbar = document.querySelector("#layout-summary");
  toolbar.textContent = `${result.bed.shape.toUpperCase()} BED · ${result.rowCount} FLOW ROWS × ${result.columnCount} HEIGHT COLUMNS · ${result.dimensions.width.toFixed(1)} × ${result.dimensions.height.toFixed(1)} MM · CENTERED AT ${result.bed.centerX.toFixed(1)}, ${result.bed.centerY.toFixed(1)}`;
  document.querySelector("#preview-code").textContent = result.text;
  statusBadge.textContent = "PATTERN READY";
  statusBadge.classList.add("is-ready");
}

const bedShape = form.elements.namedItem("bedShape");
const bedY = form.elements.namedItem("bedSizeY");
const bedYLabel = bedY.closest("label");
const layerHeightStart = form.elements.namedItem("layerHeightStart");
const layerHeightEnd = form.elements.namedItem("layerHeightEnd");
const customStart = form.elements.namedItem("customStartGcode");
const customEnd = form.elements.namedItem("customEndGcode");

function updateHeightConstraints() {
  const nozzleDiameter = Number(form.elements.namedItem("nozzleDiameter").value);
  const angle = Number(form.elements.namedItem("angleDegrees").value);
  const helper = document.querySelector("#height-clearance-help");
  try {
    const minimum = minimumLayerHeight(nozzleDiameter, angle);
    const minimumInput = Math.max(0.01, minimum);
    layerHeightStart.min = String(minimumInput);
    layerHeightEnd.min = String(minimumInput);
    layerHeightStart.max = String(nozzleDiameter);
    layerHeightEnd.max = String(nozzleDiameter);
    const safeMinimum = Math.max(0.01, minimum);
    const start = Number(layerHeightStart.value);
    const end = Number(layerHeightEnd.value);
    layerHeightStart.setCustomValidity(start < safeMinimum ? `At ${angle}° tilt, layer height must be at least ${minimum.toFixed(3)} mm.` : "");
    layerHeightEnd.setCustomValidity(end < safeMinimum ? `At ${angle}° tilt, layer height must be at least ${minimum.toFixed(3)} mm.` : "");
    helper.textContent = `Collision-safe minimum at ${angle}°: ${minimum.toFixed(6)} mm. The full matrix range must meet this minimum and stay at or below the nozzle diameter (${nozzleDiameter.toFixed(2)} mm).`;
  } catch {
    layerHeightStart.setCustomValidity("");
    layerHeightEnd.setCustomValidity("");
    helper.textContent = "Enter a valid nozzle diameter and tilt to calculate the minimum safe layer height.";
  }
}

function updateConditionalFields() {
  const circular = bedShape.value === "circular";
  bedY.disabled = circular;
  bedYLabel.classList.toggle("is-disabled", circular);
  form.elements.namedItem("customStartGcode").disabled = !form.elements.namedItem("useCustomStartGcode").checked;
  form.elements.namedItem("customEndGcode").disabled = !form.elements.namedItem("useCustomEndGcode").checked;
  customStart.closest(".textarea-label").classList.toggle("is-disabled", customStart.disabled);
  customEnd.closest(".textarea-label").classList.toggle("is-disabled", customEnd.disabled);
  updateHeightConstraints();
}

form.addEventListener("change", updateConditionalFields);
updateConditionalFields();

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
