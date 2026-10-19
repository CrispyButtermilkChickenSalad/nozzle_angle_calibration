import { generateGcode, minimumLayerHeight } from "./gcode.mjs";

const form = document.querySelector("#calibration-form");
const preview = document.querySelector("#preview");
const rowCount = document.querySelector("#row-count");
const statusBadge = document.querySelector("#status-badge");
const errorMessage = document.querySelector("#form-error");
const downloadButton = document.querySelector("#download-button");
const outputName = document.querySelector("#output-name");
let generated = null;

const fields = [
  "angleDegrees", "layerHeight", "layerCount",
  "nozzleDiameter",
  "multiplierStart", "multiplierEnd", "multiplierStep",
  "filamentDiameter", "beadLength", "angleAxis",
  "travelFeedrate", "printFeedrate",
];

function readConfig() {
  const config = {};
  for (const name of fields) {
    const value = form.elements.namedItem(name).value;
    config[name] = name === "angleAxis" ? value : Number(value);
  }
  return config;
}

function renderPreview(result) {
  preview.replaceChildren();
  const fragment = document.createDocumentFragment();
  const angle = result.angle;
  result.cases.forEach((testCase, caseIndex) => {
    const row = document.createElement("div");
    row.className = "preview-row";
    const id = String(caseIndex + 1).padStart(3, "0");
    const marker = document.createElement("span");
    marker.className = "preview-id";
    marker.textContent = `${id} M${testCase.multiplier.toFixed(2)} · ${result.layerCount} LAYERS`;
    marker.title = `Specimen ${id}: ${testCase.height} mm layer height, ${testCase.width} mm line width, ${result.layerCount} stacked layers, extrusion multiplier ${testCase.multiplier}`;
    const track = document.createElement("span");
    track.className = "preview-track";
    const flow = result.cases.length === 1 ? 0 : caseIndex / (result.cases.length - 1);
    track.style.background = `linear-gradient(90deg, hsl(${151 - flow * 55} 42% 40%), hsl(${151 - flow * 55} 62% 58%))`;
    track.title = `Multiplier ${testCase.multiplier}`;
    const angleLabel = document.createElement("span");
    angleLabel.className = "preview-angle";
    angleLabel.textContent = `${angle}°`;
    row.append(marker, track, angleLabel);
    fragment.append(row);
  });
  preview.append(fragment);
  rowCount.textContent = `${result.rowCount} SPECIMENS`;
  statusBadge.textContent = "PATTERN READY";
  statusBadge.classList.add("is-ready");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  errorMessage.textContent = "";
  try {
    generated = generateGcode(readConfig());
    renderPreview(generated);
    downloadButton.disabled = false;
    outputName.textContent = "angle-calibration.gcode";
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
  link.download = "angle-calibration.gcode";
  link.click();
  URL.revokeObjectURL(url);
});

for (const fieldName of fields) {
  form.elements.namedItem(fieldName).addEventListener("input", () => {
    generated = null;
    downloadButton.disabled = true;
    statusBadge.textContent = "REGENERATE";
    statusBadge.classList.remove("is-ready");
    errorMessage.hidden = true;
    errorMessage.textContent = "";
    try {
      const config = readConfig();
      const height = Number(config.layerHeight);
      const nozzleDiameter = Number(config.nozzleDiameter);
      const angle = Number(config.angleDegrees);
      const minimum = minimumLayerHeight(nozzleDiameter, angle);
      const reasons = [];
      if (height < minimum) reasons.push(`At ${angle}° the minimum safe layer height is ${minimum.toFixed(3)} mm.`);
      if (height > nozzleDiameter) reasons.push("Target layer height cannot exceed nozzle tip diameter.");
      form.elements.namedItem("layerHeight").setCustomValidity(reasons.join(" "));
    } catch {
      form.elements.namedItem("layerHeight").setCustomValidity("");
    }
  });
}
