const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function createScenePreview(canvas) {
  const context = canvas.getContext("2d");
  let layout = null;
  let yaw = 0.28;
  let pitch = 0.58;
  let zoom = 1;
  let drag = null;

  function draw() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.fillStyle = "#fbfcfa";
    context.fillRect(0, 0, bounds.width, bounds.height);

    if (!layout) {
      context.fillStyle = "#9aa69d";
      context.font = "12px Segoe UI, sans-serif";
      context.textAlign = "center";
      context.fillText("Generate a pattern to inspect the 3D toolpath", bounds.width / 2, bounds.height / 2);
      return;
    }

    const { bounds: modelBounds } = layout;
    const centerX = (modelBounds.minX + modelBounds.maxX) / 2;
    const centerY = (modelBounds.minY + modelBounds.maxY) / 2;
    const topZ = layout.firstLayerHeight + layout.layerCount * Math.max(...layout.columns.map((column) => column.height));
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const rawProject = (x, y, z) => {
      const relativeX = x - centerX;
      const relativeY = y - centerY;
      const horizontal = relativeX * cosYaw - relativeY * sinYaw;
      const depth = relativeX * sinYaw + relativeY * cosYaw;
      return {
        x: horizontal,
        y: depth * sinPitch - z * cosPitch,
        depth: depth * cosPitch + z * sinPitch,
      };
    };
    const corners = [];
    for (const x of [modelBounds.minX, modelBounds.maxX]) {
      for (const y of [modelBounds.minY, modelBounds.maxY]) {
        for (const z of [0, topZ]) corners.push(rawProject(x, y, z));
      }
    }
    const minX = Math.min(...corners.map((point) => point.x));
    const maxX = Math.max(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const maxY = Math.max(...corners.map((point) => point.y));
    const scale = Math.min(
      (bounds.width * 0.8) / Math.max(maxX - minX, 1),
      (bounds.height * 0.64) / Math.max(maxY - minY, 1),
    ) * zoom;
    const screenOffsetX = bounds.width / 2 - ((minX + maxX) / 2) * scale;
    const screenOffsetY = bounds.height * 0.53 - ((minY + maxY) / 2) * scale;
    const project = (x, y, z) => {
      const point = rawProject(x, y, z);
      return {
        x: screenOffsetX + point.x * scale,
        y: screenOffsetY + point.y * scale,
        depth: point.depth,
      };
    };

    const gridX0 = modelBounds.minX - 4;
    const gridX1 = modelBounds.maxX + 4;
    const gridY0 = modelBounds.minY - 4;
    const gridY1 = modelBounds.maxY + 4;
    context.fillStyle = "#f1f4f0";
    drawPolygon(context, [
      project(gridX0, gridY0, 0),
      project(gridX1, gridY0, 0),
      project(gridX1, gridY1, 0),
      project(gridX0, gridY1, 0),
    ]);
    context.fill();
    context.strokeStyle = "#e0e7e0";
    context.lineWidth = 0.7;
    const gridStep = Math.max(2, Math.ceil(Math.max(gridX1 - gridX0, gridY1 - gridY0) / 24 / 2) * 2);
    context.beginPath();
    for (let x = Math.ceil(gridX0 / gridStep) * gridStep; x <= gridX1; x += gridStep) {
      drawLine(context, project(x, gridY0, 0), project(x, gridY1, 0));
    }
    for (let y = Math.ceil(gridY0 / gridStep) * gridStep; y <= gridY1; y += gridStep) {
      drawLine(context, project(gridX0, y, 0), project(gridX1, y, 0));
    }
    context.stroke();

    const faces = [];
    const addPolygon = (points, color) => {
      const projected = points.map(([x, y, z]) => project(x, y, z));
      faces.push({
        points: projected,
        depth: projected.reduce((sum, point) => sum + point.depth, 0) / projected.length,
        color,
      });
    };
    const addBox = (x0, x1, y0, y1, z0, z1, colors) => {
      if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
      const vertices = [
        [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
      ];
      const boxFaces = [
        [[0, 1, 5, 4], colors.sides[0]],
        [[1, 2, 6, 5], colors.sides[1]],
        [[2, 3, 7, 6], colors.sides[2]],
        [[3, 0, 4, 7], colors.sides[3]],
        [[4, 5, 6, 7], colors.top],
      ];
      for (const [indices, color] of boxFaces) addPolygon(indices.map((index) => vertices[index]), color);
    };
    const addSegment = (x1, y1, x2, y2, z0, z1, width, colors) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (!length) return;
      const nx = -dy / length * width / 2;
      const ny = dx / length * width / 2;
      const points = [
        [x1 + nx, y1 + ny],
        [x2 + nx, y2 + ny],
        [x2 - nx, y2 - ny],
        [x1 - nx, y1 - ny],
      ];
      addPolygon(points.map(([x, y]) => [x, y, z1]), colors.top);
      for (let index = 0; index < points.length; index += 1) {
        const next = (index + 1) % points.length;
        addPolygon([
          [points[index][0], points[index][1], z0],
          [points[next][0], points[next][1], z0],
          [points[next][0], points[next][1], z1],
          [points[index][0], points[index][1], z1],
        ], colors.sides[index % colors.sides.length]);
      }
    };

    const baseColors = {
      top: "#c86f49",
      sides: ["#9c5338", "#ab5d3e", "#884831", "#a4593c"],
    };
    addBox(
      modelBounds.minX,
      modelBounds.maxX,
      modelBounds.minY,
      modelBounds.maxY,
      0,
      layout.firstLayerHeight,
      baseColors,
    );

    for (const tag of layout.tags) {
      const colors = {
        top: "#466f59",
        sides: ["#355542", "#3d634c", "#2d4839", "#3d6049"],
      };
      for (const path of tag.paths) {
        addSegment(
          path[0][0],
          path[0][1],
          path[1][0],
          path[1][1],
          layout.firstLayerHeight,
          layout.firstLayerHeight + layout.tagHeight,
          layout.beadWidth,
          colors,
        );
      }
    }

    layout.rows.forEach((row, rowIndex) => {
      const flow = layout.rows.length === 1 ? 0 : rowIndex / (layout.rows.length - 1);
      const hue = 207 - flow * 10;
      const beadColors = {
        top: `hsl(${hue} 68% 48%)`,
        sides: [`hsl(${hue} 65% 37%)`, `hsl(${hue} 58% 42%)`, `hsl(${hue} 62% 33%)`, `hsl(${hue} 55% 39%)`],
      };
      for (const column of layout.columns) {
        for (let layer = 1; layer <= layout.layerCount; layer += 1) {
          const z0 = layout.firstLayerHeight + (layer - 1) * column.height;
          const z1 = layout.firstLayerHeight + layer * column.height;
          addBox(
            column.xStart,
            column.xEnd,
            row.y - layout.beadWidth / 2,
            row.y + layout.beadWidth / 2,
            z0,
            z1,
            beadColors,
          );
        }
      }
    });

    faces.sort((first, second) => first.depth - second.depth);
    for (const face of faces) {
      drawPolygon(context, face.points);
      context.fillStyle = face.color;
      context.fill();
      context.strokeStyle = "rgba(38, 68, 53, .18)";
      context.lineWidth = 0.45;
      context.stroke();
    }

    context.textAlign = "left";
    context.font = "10px Segoe UI, sans-serif";
    context.fillStyle = "#5f6e63";
    context.fillText(
      `${layout.layerCount} LAYERS · ${topZ.toFixed(2)} MM TOTAL HEIGHT · ANGLE ${layout.angle}°`,
      11,
      bounds.height - 10,
    );
    drawNozzleIndicator(context, bounds, layout);
  }

  function drawNozzleIndicator(context, bounds, layout) {
    const theta = layout.angle * Math.PI / 180;
    const axisSign = layout.angleAxis === "B" ? -1 : 1;
    const tip = { x: bounds.width - 45, y: 66 };
    const direction = { x: Math.sin(theta) * axisSign, y: -Math.cos(theta) };
    const perpendicular = { x: Math.cos(theta), y: Math.sin(theta) * axisSign };
    const point = (along, across) => ({
      x: tip.x + direction.x * along + perpendicular.x * across,
      y: tip.y + direction.y * along + perpendicular.y * across,
    });

    context.save();
    context.fillStyle = "rgba(251, 252, 250, .9)";
    context.fillRect(bounds.width - 90, 8, 82, 82);
    context.strokeStyle = "#b9c6bb";
    context.lineWidth = 0.8;
    context.strokeRect(bounds.width - 90, 8, 82, 82);
    context.fillStyle = "#66736a";
    context.font = "8px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.fillText(`NOZZLE ${layout.angleAxis}/${({ A: "X", B: "Y", C: "Z" })[layout.angleAxis]}`, bounds.width - 49, 20);

    context.save();
    context.setLineDash([2, 2]);
    context.strokeStyle = "#aab5ac";
    context.beginPath();
    context.moveTo(tip.x, tip.y);
    context.lineTo(tip.x, tip.y - 38);
    context.stroke();
    context.restore();

    context.fillStyle = "#35433b";
    context.beginPath();
    const backLeft = point(43, -8);
    const shoulderLeft = point(13, -5);
    const tipLeft = point(0, -2.5);
    const tipRight = point(0, 2.5);
    const shoulderRight = point(13, 5);
    const backRight = point(43, 8);
    context.moveTo(backLeft.x, backLeft.y);
    context.lineTo(shoulderLeft.x, shoulderLeft.y);
    context.lineTo(tipLeft.x, tipLeft.y);
    context.lineTo(tipRight.x, tipRight.y);
    context.lineTo(shoulderRight.x, shoulderRight.y);
    context.lineTo(backRight.x, backRight.y);
    context.closePath();
    context.fill();
    context.strokeStyle = "#1f2e26";
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = "#cc7046";
    context.beginPath();
    context.arc(tip.x, tip.y, 2.2, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#cc7046";
    context.fillStyle = "#a95737";
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(tip.x, tip.y - 30);
    context.lineTo(tip.x + direction.x * 30, tip.y + direction.y * 30);
    context.stroke();
    context.textAlign = "center";
    context.font = "9px Segoe UI, sans-serif";
    context.fillText(`${layout.angle}° tilt`, bounds.width - 49, 82);
    context.restore();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!layout) return;
    drag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    yaw += (event.clientX - drag.x) * 0.012;
    pitch = clamp(pitch + (event.clientY - drag.y) * 0.008, 0.18, 1.25);
    drag = { ...drag, x: event.clientX, y: event.clientY };
    draw();
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("wheel", (event) => {
    if (!layout) return;
    event.preventDefault();
    zoom = clamp(zoom * (event.deltaY < 0 ? 1.1 : 0.9), 0.65, 2.5);
    draw();
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    if (!layout) return;
    const key = event.key;
    if (key === "ArrowLeft") yaw -= 0.12;
    else if (key === "ArrowRight") yaw += 0.12;
    else if (key === "ArrowUp") pitch = clamp(pitch - 0.08, 0.18, 1.25);
    else if (key === "ArrowDown") pitch = clamp(pitch + 0.08, 0.18, 1.25);
    else if (key === "+" || key === "=") zoom = clamp(zoom * 1.1, 0.65, 2.5);
    else if (key === "-") zoom = clamp(zoom * 0.9, 0.65, 2.5);
    else if (key === "0") {
      yaw = 0.28;
      pitch = 0.58;
      zoom = 1;
    } else return;
    event.preventDefault();
    draw();
  });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(draw).observe(canvas);
  else window.addEventListener("resize", draw);
  draw();

  return {
    update(nextLayout) {
      layout = nextLayout;
      draw();
    },
  };
}

function drawPolygon(context, points) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
  context.closePath();
}

function drawLine(context, start, end) {
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
}
