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
  "angleStart", "angleEnd", "angleStep",
  "layerHeightStart", "layerHeightEnd", "layerHeightStep",
  "lineWidthStart", "lineWidthEnd", "lineWidthStep",
  "multiplierStart", "multiplierEnd", "multiplierStep",
  "nozzleDiameter", "filamentDiameter", "beadLength", "angleAxis",
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
  const lowAngle = result.angles[0];
  const highAngle = result.angles.at(-1);
  result.cases.forEach((testCase, caseIndex) => {
    result.angles.forEach((angle) => {
      const row = document.createElement("div");
      row.className = "preview-row";
      const id = String(caseIndex + 1).padStart(3, "0");
      const marker = document.createElement("span");
      marker.className = "preview-id";
      marker.textContent = `${id} H${testCase.height.toFixed(2)} W${testCase.width.toFixed(2)} M${testCase.multiplier.toFixed(2)}`;
      marker.title = `Row ${id}: layer height ${testCase.height} mm, line width ${testCase.width} mm, extrusion multiplier ${testCase.multiplier}`;
      const track = document.createElement("span");
      track.className = "preview-track";
      const spread = highAngle === lowAngle ? 0 : (angle - lowAngle) / (highAngle - lowAngle);
      track.style.background = `linear-gradient(90deg, hsl(${151 - spread * 122} 36% 40%), hsl(${151 - spread * 122} 63% 58%))`;
      track.title = `${angle}° tilt`;
      const angleLabel = document.createElement("span");
      angleLabel.className = "preview-angle";
      angleLabel.textContent = `${angle}°`;
      row.append(marker, track, angleLabel);
      fragment.append(row);
    });
  });
  preview.append(fragment);
  rowCount.textContent = `${result.rowCount} ROWS`;
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
      const height = Number(config.layerHeightStart);
      const nozzleDiameter = Number(config.nozzleDiameter);
      const angle = Number(config.angleEnd);
      const minimum = minimumLayerHeight(nozzleDiameter, angle);
      const status = `At ${angle}° the minimum layer height is ${minimum.toFixed(3)} mm.`;
      form.elements.namedItem("layerHeightStart").setCustomValidity(height < minimum ? status : "");
    } catch {
      form.elements.namedItem("layerHeightStart").setCustomValidity("");
    }
  });
}
